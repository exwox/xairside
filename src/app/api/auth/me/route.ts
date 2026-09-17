import { NextResponse } from 'next/server';
import { requireAuthContext } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getRolePageAccess } from '@/lib/page-access-server';
import { PAGE_KEYS, isPageAllowed } from '@/lib/page-access';

export async function GET(req: Request) {
  try {
    const result = await requireAuthContext(req);
    if ('response' in result) {
      return NextResponse.json({ user: null, activeAirport: null });
    }

    const auth = result;
    const rolePageAccess = await getRolePageAccess();

    let availableAirports: Array<{ id: string; code: string; name: string }> = [];
    if (auth.user.role === 'SUPADMIN') {
      availableAirports = await prisma.airport.findMany({
        where: { isActive: true },
        select: { id: true, code: true, name: true },
        orderBy: { code: 'asc' },
      });
    } else if (auth.activeAirport) {
      availableAirports = [{
        id: auth.activeAirport.id,
        code: auth.activeAirport.code,
        name: auth.activeAirport.name,
      }];
    }

    return NextResponse.json({
      user: {
        id: auth.user.id,
        email: auth.user.email,
        name: auth.user.name,
        role: auth.user.role,
        airportId: auth.user.airportId,
      },
      activeAirport: auth.activeAirport,
      availableAirports,
      pageAccess: PAGE_KEYS.filter((page) => isPageAllowed(rolePageAccess, auth.user.role, page)),
    });
  } catch (error) {
    console.error('Auth check error:', error);
    return NextResponse.json({ user: null, activeAirport: null }, { status: 500 });
  }
}
