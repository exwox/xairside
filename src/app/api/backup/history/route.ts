import { NextRequest, NextResponse } from 'next/server'
import { requireAuthContext } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { parseDataCount } from '@/lib/backup-restore'
import type { Prisma } from '@prisma/client'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuthContext(request)
    if ('response' in auth) return auth.response

    const role = auth.user.role
    if (role !== 'ADMIN' && role !== 'SUPADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const requestedAirportId = searchParams.get('airportId')
    const backupType = searchParams.get('backupType')
    const requestedLimit = Number.parseInt(searchParams.get('limit') || '50', 10)
    const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 200) : 50

    const where: Prisma.BackupLogWhereInput = {}

    if (role === 'ADMIN') {
      // Admin hanya melihat riwayat bandaranya sendiri
      if (!auth.user.airportId) {
        return NextResponse.json({ backups: [], totalSize: 0, totalSizeMB: '0.00', count: 0, totalCount: 0 })
      }
      where.airportId = auth.user.airportId
      where.backupType = 'AIRPORT'
    } else {
      if (backupType === 'AIRPORT' || backupType === 'FULL_SYSTEM') {
        where.backupType = backupType
      }
      if (requestedAirportId) {
        where.airportId = requestedAirportId
      }
    }

    const [backups, aggregate] = await Promise.all([
      prisma.backupLog.findMany({
        where,
        include: {
          user: { select: { id: true, name: true, email: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
      }),
      prisma.backupLog.aggregate({ where, _sum: { fileSize: true }, _count: { id: true } }),
    ])

    // Hitung pemakaian storage dari seluruh riwayat (bukan hanya 1 halaman)
    const totalSize = aggregate._sum.fileSize ?? 0

    return NextResponse.json({
      backups: backups.map(b => ({
        id: b.id,
        fileName: b.fileName,
        fileSize: b.fileSize,
        fileSizeMB: (b.fileSize / (1024 * 1024)).toFixed(2),
        format: b.format,
        backupType: b.backupType,
        includePhotos: b.includePhotos,
        status: b.status,
        dataCount: parseDataCount(b.dataCount),
        createdBy: b.user,
        createdAt: b.createdAt,
      })),
      totalSize,
      totalSizeMB: (totalSize / (1024 * 1024)).toFixed(2),
      count: backups.length,
      totalCount: aggregate._count.id,
    })
  } catch (error) {
    console.error('History error:', error)
    return NextResponse.json({ error: 'Failed to fetch backup history' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireAuthContext(request)
    if ('response' in auth) return auth.response

    const role = auth.user.role
    if (role !== 'ADMIN' && role !== 'SUPADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const backupId = searchParams.get('id')

    if (!backupId) {
      return NextResponse.json({ error: 'Backup ID required' }, { status: 400 })
    }

    // Get backup record
    const backup = await prisma.backupLog.findUnique({ where: { id: backupId } })
    if (!backup) {
      return NextResponse.json({ error: 'Backup not found' }, { status: 404 })
    }

    // Authorization check
    if (role !== 'SUPADMIN') {
      if (backup.backupType !== 'AIRPORT' || backup.airportId !== auth.user.airportId) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    }

    // Delete backup record
    await prisma.backupLog.delete({ where: { id: backupId } })

    return NextResponse.json({ success: true, message: 'Backup deleted' })
  } catch (error) {
    console.error('Delete error:', error)
    return NextResponse.json({ error: 'Failed to delete backup' }, { status: 500 })
  }
}
