import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { createSession, setSessionCookie, setActiveAirportCookie, verifyPassword } from '@/lib/auth';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = body.password;

    if (!email || typeof password !== 'string' || !password) {
      return NextResponse.json({ error: 'Email dan kata sandi wajib diisi' }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { email },
      include: { airport: true },
    });

    if (!user || !user.isActive || !['SUPADMIN', 'ADMIN', 'USER', 'VIEWER'].includes(user.role)
      || (user.role !== 'SUPADMIN' && (!user.airport || !user.airport.isActive))) {
      return NextResponse.json({ error: 'Email atau kata sandi tidak valid' }, { status: 401 });
    }

    const isValid = verifyPassword(password, user.passwordHash);
    if (!isValid) {
      return NextResponse.json({ error: 'Email atau kata sandi tidak valid' }, { status: 401 });
    }

    // Create session & set cookie
    const token = await createSession(user.id);

     // Set active airport for non-SUPADMIN users
     if (user.role !== 'SUPADMIN' && user.airportId) {
       await setActiveAirportCookie(user.airportId);
     } else if (user.role === 'SUPADMIN') {
       // For SUPADMIN, set first active airport
       const firstAirport = await prisma.airport.findFirst({
         where: { isActive: true },
         orderBy: { code: 'asc' },
       });
       if (firstAirport) await setActiveAirportCookie(firstAirport.id);
     }

    await setSessionCookie(token);

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        airportId: user.airportId,
        airportName: user.airport?.name ?? null,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json({ error: 'Gagal melakukan login' }, { status: 500 });
  }
}
