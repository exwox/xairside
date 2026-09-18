import { NextRequest, NextResponse } from 'next/server'
import { requireAuthContext } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { BackupService } from '@/lib/backup-service'
import { collectPhotoUrls, isBackupType } from '@/lib/backup-restore'
import JSZip from 'jszip'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuthContext(request)
    if ('response' in auth) return auth.response

    if (auth.user.role !== 'ADMIN' && auth.user.role !== 'SUPADMIN') {
      return NextResponse.json({ error: 'Only ADMIN or SUPADMIN can create backups' }, { status: 403 })
    }

    let body: Record<string, unknown>
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Body permintaan tidak valid' }, { status: 400 })
    }

    const { backupType, airportId, includePhotos = false, selectedAirports } = body as {
      backupType?: unknown
      airportId?: unknown
      includePhotos?: boolean
      selectedAirports?: unknown
    }

    if (!isBackupType(backupType)) {
      return NextResponse.json({ error: 'Tipe backup tidak valid' }, { status: 400 })
    }
    // Arsip selalu JSON: hanya format ini yang bisa dipulihkan lewat menu Restore.
    const format = 'JSON' as const

    const role = auth.user.role
    let targetAirportId = typeof airportId === 'string' && airportId.trim() ? airportId.trim() : undefined
    let airportFilter: string[] | undefined

    // Authorization check
    if (backupType === 'AIRPORT') {
      // ADMIN hanya boleh mem-backup bandaranya sendiri; SUPADMIN boleh memilih bandara
      if (role !== 'SUPADMIN') {
        const ownAirportId = auth.user.airportId
        if (!ownAirportId) {
          return NextResponse.json({ error: 'Akun Anda belum terhubung ke bandara mana pun' }, { status: 403 })
        }
        if (role !== 'ADMIN' || (targetAirportId && targetAirportId !== ownAirportId)) {
          return NextResponse.json({ error: 'Forbidden: Can only backup your own airport' }, { status: 403 })
        }
        targetAirportId = ownAirportId
      }
      if (!targetAirportId) {
        targetAirportId = auth.activeAirportId
      }
      if (!targetAirportId) {
        return NextResponse.json({ error: 'Airport ID required' }, { status: 400 })
      }
    } else {
      // Only SUPADMIN can backup full system
      if (role !== 'SUPADMIN') {
        return NextResponse.json({ error: 'Only SUPADMIN can backup full system' }, { status: 403 })
      }
      if (selectedAirports !== undefined) {
        if (!Array.isArray(selectedAirports) || selectedAirports.some((id) => typeof id !== 'string')) {
          return NextResponse.json({ error: 'Daftar bandara terpilih tidak valid' }, { status: 400 })
        }
        airportFilter = selectedAirports.length ? selectedAirports : undefined
      }
    }

    // Get backup data
    let backupData
    if (backupType === 'AIRPORT') {
      backupData = await BackupService.getAirportBackupData(targetAirportId as string)
    } else {
      backupData = await BackupService.getFullSystemBackupData(airportFilter)
    }

    // Count data
    const dataCount = BackupService.countBackupData(backupData, backupType)

    // Foto nyata (kalau diminta): baca dari disk dan sertakan sebagai entry ZIP
    let photoFiles: Array<{ name: string; content: Buffer }> = []
    let missingPhotos = 0
    if (includePhotos) {
      const urls = collectPhotoUrls(backupData, backupType)
      const result = await BackupService.readPhotoFiles(urls)
      photoFiles = result.files
      missingPhotos = result.missingPhotos
    }

    // Generate metadata (photoCount = jumlah foto yang benar-benar masuk ZIP)
    const metadata = await BackupService.generateBackupMetadata(
      backupType,
      backupType === 'AIRPORT' ? targetAirportId : undefined,
      includePhotos,
      format,
      dataCount,
      { photoCount: photoFiles.length, missingPhotos }
    )

    // Create ZIP file
    const zip = new JSZip()
    zip.file('metadata.json', JSON.stringify(metadata, null, 2))
    zip.file('data.json', JSON.stringify(backupData, null, 2))

    if (includePhotos) {
      const photosFolder = zip.folder('photos')
      if (photosFolder) {
        for (const photo of photoFiles) {
          photosFolder.file(photo.name, photo.content)
        }
      }
    }

    const buffer = await zip.generateAsync({ type: 'nodebuffer' })
    const fileName = BackupService.generateFileName(
      backupType,
      backupType === 'AIRPORT' ? (backupData as { airport?: { code?: string } }).airport?.code : undefined,
      includePhotos
    )

    // Save backup log to database
    await prisma.backupLog.create({
      data: {
        userId: auth.user.id,
        backupType,
        airportId: backupType === 'AIRPORT' ? targetAirportId : undefined,
        fileName,
        fileSize: buffer.length,
        format,
        includePhotos,
        dataCount: JSON.stringify(dataCount),
        status: 'COMPLETED',
      },
    })

    return new NextResponse(Buffer.from(buffer), {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${fileName}"`,
      },
    })
  } catch (error) {
    console.error('Backup error:', error)
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Backup failed',
      details: process.env.NODE_ENV === 'development' ? String(error) : undefined
    }, { status: 500 })
  }
}

