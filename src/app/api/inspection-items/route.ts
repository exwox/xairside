import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuthContext } from '@/lib/auth';

export async function GET(req: Request) {
  try {
    const auth = await requireAuthContext(req);
    if ('response' in auth) return auth.response;

    const items = await prisma.inspectionItem.findMany({
      orderBy: { order: 'asc' },
    });
    return NextResponse.json(items);
  } catch (error) {
    console.error('Error fetching inspection items:', error);
    return NextResponse.json({ error: 'Failed to fetch items' }, { status: 500 });
  }
}
