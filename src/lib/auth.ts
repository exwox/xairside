import crypto from 'node:crypto';
import { cookies } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { pageForApiRequest, isPageAllowed } from '@/lib/page-access';
import { getRolePageAccess } from '@/lib/page-access-server';

export const SESSION_COOKIE_NAME = 'xairside_session';
export const ACTIVE_AIRPORT_COOKIE_NAME = 'xairside_active_airport';

export type UserRole = 'SUPADMIN' | 'ADMIN' | 'USER' | 'VIEWER';

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  airportId: string | null;
  isActive: boolean;
}

export interface ActiveContext {
  user: SessionUser;
  activeAirportId: string;
  activeAirport: {
    id: string;
    code: string;
    name: string;
    timezone: string;
    refLat: number;
    refLng: number;
  };
}

/** Possible return types from requireAuthContext */
export type AuthResult = ActiveContext | { response: NextResponse };

/**
 * Convenience helper: calls requireAuthContext and returns a tuple.
 * Usage:
 *   const [auth, err] = await authGuard(req);
 *   if (err) return err;
 *   // auth is ActiveContext from here
 */
export async function authGuard(
  req?: Request | NextRequest,
): Promise<[ActiveContext, null] | [null, NextResponse]> {
  const result = await requireAuthContext(req);
  if ('response' in result) return [null, result.response];
  return [result, null];
}

/**
 * Type guard: returns true if the result is an error response.
 */
export function isAuthError(result: AuthResult): result is { response: NextResponse } {
  return 'response' in result;
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  if (!storedHash || !/^[a-f0-9]{32}:[a-f0-9]{128}$/i.test(storedHash)) return false;
  const [salt, hash] = storedHash.split(':');
  const verifyHash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(verifyHash, 'hex'));
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export async function createSession(userId: string): Promise<string> {
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  await prisma.session.create({
    data: {
      userId,
      tokenHash,
      expiresAt,
    },
  });

  return token;
}

export async function setSessionCookie(token: string) {
  const cookieStore = await cookies();
  const isSecure = process.env.NODE_ENV === 'production' && process.env.NEXTAUTH_URL?.startsWith('https');
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: isSecure,
    sameSite: 'lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60,
  });
}

export async function setActiveAirportCookie(airportId: string) {
  const cookieStore = await cookies();
  const isSecure = process.env.NODE_ENV === 'production' && process.env.NEXTAUTH_URL?.startsWith('https');
  cookieStore.set(ACTIVE_AIRPORT_COOKIE_NAME, airportId, {
    httpOnly: true,
    secure: isSecure,
    sameSite: 'lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60,
  });
}

export async function destroySession(token?: string) {
  const cookieStore = await cookies();
  const sessionToken = token || cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (sessionToken) {
    const tokenHash = hashToken(sessionToken);
    await prisma.session.deleteMany({ where: { tokenHash } }).catch(() => {});
  }
  cookieStore.delete(SESSION_COOKIE_NAME);
  cookieStore.delete(ACTIVE_AIRPORT_COOKIE_NAME);
}

export async function getSessionContext(req?: Request | NextRequest): Promise<ActiveContext | null> {
  let token: string | undefined;

  if (req && 'cookies' in req && typeof (req as NextRequest).cookies?.get === 'function') {
    token = (req as NextRequest).cookies.get(SESSION_COOKIE_NAME)?.value;
  } else {
    try {
      const cookieStore = await cookies();
      token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    } catch {
      // Out of request context
    }
  }

  if (!token) return null;

  const tokenHash = hashToken(token);
  const session = await prisma.session.findUnique({
    where: { tokenHash },
    include: {
      user: {
        include: { airport: true },
      },
    },
  });

  if (!session || session.expiresAt < new Date() || !session.user.isActive
    || !['SUPADMIN', 'ADMIN', 'USER', 'VIEWER'].includes(session.user.role)) {
    if (session) {
      await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
    }
    return null;
  }

  const user: SessionUser = {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
    role: session.user.role as UserRole,
    airportId: session.user.airportId,
    isActive: session.user.isActive,
  };

  let activeAirportId: string | null = null;

  if (user.role === 'SUPADMIN') {
    let cookieStore;
    try { cookieStore = await cookies(); } catch {}

    const selectedInCookie = cookieStore?.get(ACTIVE_AIRPORT_COOKIE_NAME)?.value;
    const headerAirport = req?.headers.get('x-airport-id');
    const urlAirport = req ? new URL(req.url).searchParams.get('activeAirportId') : null;

    const requested = urlAirport || headerAirport || selectedInCookie;

    if (requested) {
      const exists = await prisma.airport.findUnique({ where: { id: requested } });
      if (exists && exists.isActive) {
        activeAirportId = exists.id;
      }
    }

    if (!activeAirportId) {
      const firstAirport = await prisma.airport.findFirst({ where: { isActive: true }, orderBy: { code: 'asc' } });
      if (firstAirport) activeAirportId = firstAirport.id;
    }
  } else {
    activeAirportId = user.airportId;
  }

  if (!activeAirportId) return null;

  const activeAirport = await prisma.airport.findUnique({ where: { id: activeAirportId } });
  if (!activeAirport || !activeAirport.isActive) return null;

  return {
    user,
    activeAirportId: activeAirport.id,
    activeAirport: {
      id: activeAirport.id,
      code: activeAirport.code,
      name: activeAirport.name,
      timezone: activeAirport.timezone,
      refLat: activeAirport.refLat,
      refLng: activeAirport.refLng,
    },
  };
}

export async function requireAuthContext(req?: Request | NextRequest): Promise<ActiveContext | { response: NextResponse }> {
  const ctx = await getSessionContext(req);
  if (!ctx) {
    return {
      response: NextResponse.json({ error: 'Tidak terautentikasi (Sesi tidak ditemukan atau kadaluwarsa)' }, { status: 401 }),
    };
  }
  if (req) {
    const pathname = new URL(req.url).pathname;
    if (!isApiActionAllowed(ctx.user.role, pathname, req.method)) return { response: denyPermission() };
    const page = pageForApiRequest(pathname, req.method);
    if (page && !isPageAllowed(await getRolePageAccess(), ctx.user.role, page)) return { response: denyPermission() };
  }
  return ctx;
}

/** Server-side route policy. Every protected API calls requireAuthContext first. */
export function isApiActionAllowed(role: UserRole, pathname: string, method: string): boolean {
  if (role === 'SUPADMIN') return true;
  if (pathname === '/api/role-pages') return false;
  if (pathname.startsWith('/api/users')) return role === 'ADMIN';
  if (pathname.startsWith('/api/backup') || pathname.startsWith('/api/restore')) return role === 'ADMIN';
  if (pathname.startsWith('/api/airports')) return role === 'ADMIN' && (method === 'GET' || method === 'HEAD');
  if (pathname === '/api/auth/select-airport') return false;
  if (pathname.startsWith('/api/auth/')) return true;
  if (pathname === '/api/config' && method !== 'GET' && method !== 'HEAD') return role === 'ADMIN';
  if (/^\/api\/pci\/(dv-curves|cdv-curves)/.test(pathname) && method !== 'GET' && method !== 'HEAD') return role === 'ADMIN';
  if (pathname.endsWith('/approve')) return role === 'ADMIN';
  if (role === 'VIEWER') {
    return (method === 'GET' || method === 'HEAD') && [
      '/api/config', '/api/facilities', '/api/damages', '/api/markings',
      '/api/map-layers', '/api/pci/sections', '/api/pci/dv-curves', '/api/pci/cdv-curves',
    ].includes(pathname);
  }
  return role === 'ADMIN' || role === 'USER';
}

export function isRoleAllowed(userRole: UserRole, allowedRoles: UserRole[]): boolean {
  return allowedRoles.includes(userRole);
}

export function denyPermission(message = 'Anda tidak memiliki hak akses untuk tindakan ini'): NextResponse {
  return NextResponse.json({ error: message }, { status: 403 });
}

export function denyNotFound(message = 'Data tidak ditemukan'): NextResponse {
  return NextResponse.json({ error: message }, { status: 404 });
}

export function checkAirportAccess(ctx: ActiveContext, targetAirportId?: string | null): boolean {
  if (ctx.user.role === 'SUPADMIN') return true;
  return ctx.user.airportId === targetAirportId;
}

export async function auth(): Promise<{ user: SessionUser } | null> {
  const ctx = await getSessionContext();
  if (!ctx) return null;
  return { user: ctx.user };
}
