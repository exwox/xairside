import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { signature } = body;

    if (!signature) {
      return NextResponse.json({ error: 'Signature is required for approval' }, { status: 400 });
    }

    // Fetch the supervisor seeded in the DB
    const supervisor = await prisma.user.findFirst({
      where: { role: 'SUPERVISOR' },
    });

    if (!supervisor) {
      return NextResponse.json({ error: 'Supervisor account not found' }, { status: 404 });
    }

    // Check if inspection exists
    const existing = await prisma.inspection.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Inspection not found' }, { status: 404 });
    }

    // Update the inspection
    const updated = await prisma.inspection.update({
      where: { id },
      data: {
        status: 'APPROVED',
        supervisorId: supervisor.id,
        signature: signature,
      },
      include: {
        inspector: true,
        supervisor: true,
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Error approving inspection:', error);
    return NextResponse.json({ error: 'Failed to approve inspection' }, { status: 500 });
  }
}
