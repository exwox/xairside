import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { prisma } from '@/lib/db'
import { PHOTO_URL_PREFIX } from '@/lib/backup-restore'

export interface BackupMetadata {
  version: string
  timestamp: string
  backupType: 'AIRPORT' | 'FULL_SYSTEM'
  airportId?: string
  airportCode?: string
  includePhotos: boolean
  format: 'JSON' | 'SQL'
  photoCount?: number
  missingPhotos?: number
  dataCount: {
    inspections: number
    damages: number
    markings: number
    pciSurveys: number
    facilities: number
    mapLayers: number
    users?: number
    airports?: number
  }
}

export class BackupService {
  static async getAirportBackupData(airportId: string) {
    const airport = await prisma.airport.findUnique({
      where: { id: airportId },
      include: {
        facilities: true,
        inspections: {
          include: {
            inspector: { select: { id: true, name: true, email: true } },
            supervisor: { select: { id: true, name: true, email: true } },
            details: true,
          },
        },
        damages: true,
        markings: true,
        pciSections: { include: { surveys: true } },
        mapLayers: true,
      },
    })

    if (!airport) throw new Error('Airport not found')

    return {
      airport: {
        id: airport.id,
        code: airport.code,
        name: airport.name,
        timezone: airport.timezone,
        refLat: airport.refLat,
        refLng: airport.refLng,
      },
      facilities: airport.facilities,
      inspections: airport.inspections,
      damages: airport.damages,
      markings: airport.markings,
      pciSections: airport.pciSections,
      mapLayers: airport.mapLayers,
    }
  }

  static async getFullSystemBackupData(airportIds?: string[]) {
    const whereClause = airportIds?.length ? { id: { in: airportIds } } : {}

    const airports = await prisma.airport.findMany({
      where: whereClause,
      include: {
        users: { select: { id: true, name: true, email: true, role: true, isActive: true } },
        facilities: true,
        inspections: {
          include: {
            inspector: { select: { id: true, name: true, email: true } },
            supervisor: { select: { id: true, name: true, email: true } },
            details: true,
          },
        },
        damages: true,
        markings: true,
        pciSections: { include: { surveys: true } },
        mapLayers: true,
        configs: true,
      },
    })

    return {
      airports,
      masterUsers: await prisma.user.findMany({
        where: { role: 'SUPADMIN' },
        select: { id: true, name: true, email: true, role: true, isActive: true },
      }),
    }
  }

  static async generateBackupMetadata(
    backupType: 'AIRPORT' | 'FULL_SYSTEM',
    airportId?: string,
    includePhotos: boolean = false,
    format: 'JSON' | 'SQL' = 'JSON',
    dataCount: any = {},
    photoStats: { photoCount?: number; missingPhotos?: number } = {}
  ): Promise<BackupMetadata> {
    let airportCode = undefined

    if (airportId) {
      const airport = await prisma.airport.findUnique({
        where: { id: airportId },
        select: { code: true },
      })
      airportCode = airport?.code
    }

    return {
      version: '1.0',
      timestamp: new Date().toISOString(),
      backupType,
      airportId,
      airportCode,
      includePhotos,
      format,
      photoCount: includePhotos ? photoStats.photoCount ?? 0 : undefined,
      missingPhotos: includePhotos ? photoStats.missingPhotos ?? 0 : undefined,
      dataCount: {
        inspections: dataCount.inspections || 0,
        damages: dataCount.damages || 0,
        markings: dataCount.markings || 0,
        pciSurveys: dataCount.pciSurveys || 0,
        facilities: dataCount.facilities || 0,
        mapLayers: dataCount.mapLayers || 0,
        users: dataCount.users,
        airports: dataCount.airports,
      },
    }
  }

  /** Baca file foto dari disk agar bisa disertakan sebagai ZIP entry (path relatif → isi file). */
  static async readPhotoFiles(photoUrls: string[]): Promise<{ files: Array<{ name: string; content: Buffer }>; missingPhotos: number }> {
    const files: Array<{ name: string; content: Buffer }> = []
    let missingPhotos = 0

    for (const url of photoUrls) {
      if (!url.startsWith(PHOTO_URL_PREFIX)) {
        missingPhotos++
        continue
      }
      const fileName = path.basename(url)
      try {
        const content = await readFile(path.join(process.cwd(), 'public', 'uploads', 'damages', fileName))
        files.push({ name: fileName, content })
      } catch {
        missingPhotos++
      }
    }

    return { files, missingPhotos }
  }

  /** Daftar nama file foto yang tersimpan di disk (untuk validasi restore). */
  static async listStoredPhotoFiles(): Promise<Set<string>> {
    try {
      const entries = await readdir(path.join(process.cwd(), 'public', 'uploads', 'damages'))
      return new Set(entries)
    } catch {
      return new Set()
    }
  }

  static countBackupData(data: any, backupType: 'AIRPORT' | 'FULL_SYSTEM') {
    if (backupType === 'AIRPORT') {
      return {
        inspections: data.inspections?.length || 0,
        damages: data.damages?.length || 0,
        markings: data.markings?.length || 0,
        pciSurveys: data.pciSections?.reduce((acc: number, s: any) => acc + (s.surveys?.length || 0), 0) || 0,
        facilities: data.facilities?.length || 0,
        mapLayers: data.mapLayers?.length || 0,
      }
    }

    return {
      inspections: data.airports?.reduce((acc: number, a: any) => acc + (a.inspections?.length || 0), 0) || 0,
      damages: data.airports?.reduce((acc: number, a: any) => acc + (a.damages?.length || 0), 0) || 0,
      markings: data.airports?.reduce((acc: number, a: any) => acc + (a.markings?.length || 0), 0) || 0,
      pciSurveys: data.airports?.reduce((acc: number, a: any) => acc + (a.pciSections?.reduce((s: number, sec: any) => s + (sec.surveys?.length || 0), 0) || 0), 0) || 0,
      facilities: data.airports?.reduce((acc: number, a: any) => acc + (a.facilities?.length || 0), 0) || 0,
      mapLayers: data.airports?.reduce((acc: number, a: any) => acc + (a.mapLayers?.length || 0), 0) || 0,
      users: data.masterUsers?.length || 0,
      airports: data.airports?.length || 0,
    }
  }

  static generateFileName(
    backupType: 'AIRPORT' | 'FULL_SYSTEM',
    airportCode?: string,
    includePhotos: boolean = false
  ): string {
    const timestamp = new Date().toISOString().split('T')[0]
    const photosTag = includePhotos ? '-with-photos' : ''

    if (backupType === 'AIRPORT') {
      return `xairside-backup-${airportCode}-${timestamp}${photosTag}.zip`
    }

    return `xairside-backup-full-system-${timestamp}${photosTag}.zip`
  }
}
