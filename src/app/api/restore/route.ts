import { NextRequest, NextResponse } from 'next/server'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { requireAuthContext } from '@/lib/auth'
import { prisma } from '@/lib/db'
import {
  airportBackupEntries,
  asArray,
  isBackupType,
  isUniqueViolation,
  normalizeMergeMode,
  parseBackupMetadata,
  PHOTO_URL_PREFIX,
  toDate,
  toNullableNumber,
  toNumber,
  toText,
  type MergeMode,
} from '@/lib/backup-restore'
import JSZip from 'jszip'

export const runtime = 'nodejs'

/** Batas ukuran arsip backup (512 MB) dan per file foto (12 MB, sama dengan /api/upload). */
const MAX_BACKUP_BYTES = 512 * 1024 * 1024
const MAX_PHOTO_BYTES = 12 * 1024 * 1024
const UPLOAD_RELATIVE = path.join('public', 'uploads', 'damages')

type JsonObject = Record<string, unknown>

interface RestoreCounts {
  facilities: number
  mapLayers: number
  inspections: number
  inspectionDetails: number
  damages: number
  markings: number
  pciSections: number
  pciSurveys: number
  configs: number
  photos: number
}

interface RestoreContext {
  mergeMode: MergeMode
  errors: string[]
  warnings: string[]
  lookup: PersonLookup
  counts: RestoreCounts
}

function emptyCounts(): RestoreCounts {
  return {
    facilities: 0,
    mapLayers: 0,
    inspections: 0,
    inspectionDetails: 0,
    damages: 0,
    markings: 0,
    pciSections: 0,
    pciSurveys: 0,
    configs: 0,
    photos: 0,
  }
}

/** Ubah nilai apa pun menjadi string JSON yang valid (banyak kolom schema bertipe text/JSON string). */
function toJsonText(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed ? trimmed : undefined
  }
  if (value === null || value === undefined) return undefined
  try {
    return JSON.stringify(value)
  } catch {
    return undefined
  }
}

function toIntOrNull(value: unknown): number | null {
  const parsed = toNullableNumber(value)
  return parsed === null ? null : Math.trunc(parsed)
}

function normalizePhotoUrl(value: unknown): string | null {
  const raw = toText(value)
  if (!raw) return null
  const fileName = safePhotoFileName(raw)
  return fileName ? `${PHOTO_URL_PREFIX}${fileName}` : null
}

// ================= Penyelarasan orang (inspector / supervisor) =================

interface PersonLookup {
  byEmail: Map<string, string>
  byName: Map<string, string>
  byRole: Map<string, string>
  fallbackUserId: string
}

async function buildPersonLookup(fallbackUserId: string): Promise<PersonLookup> {
  const users = await prisma.user.findMany({ select: { id: true, name: true, email: true, role: true, isActive: true } })
  const byEmail = new Map<string, string>()
  const byName = new Map<string, string>()
  const byRole = new Map<string, string>()

  for (const user of users) {
    const email = user.email.toLowerCase()
    const name = user.name.toLowerCase()
    if (!byEmail.has(email)) byEmail.set(email, user.id)
    if (!byName.has(name)) byName.set(name, user.id)
    if (user.isActive && !byRole.has(user.role)) byRole.set(user.role, user.id)
  }

  return { byEmail, byName, byRole, fallbackUserId }
}

/** Terima id, email, nama, atau objek { id, email, name } lalu kembalikan user id yang valid di sistem ini. */
function resolvePersonId(value: unknown, lookup: PersonLookup): string | undefined {
  if (typeof value === 'string') {
    const key = value.trim().toLowerCase()
    if (!key) return undefined
    return lookup.byEmail.get(key) ?? lookup.byName.get(key) ?? undefined
  }
  if (!value || typeof value !== 'object') return undefined
  const record = value as JsonObject
  const email = toText(record.email)?.toLowerCase()
  if (email) {
    const found = lookup.byEmail.get(email)
    if (found) return found
  }
  const name = toText(record.name)?.toLowerCase()
  if (name) {
    const found = lookup.byName.get(name)
    if (found) return found
  }
  return undefined
}

/** Inspector wajib ada (FK non-null): pakai user role sama atau pemanggil restore bila tidak ditemukan. */
function resolveInspectorId(value: unknown, lookup: PersonLookup): string {
  return resolvePersonId(value, lookup)
    ?? lookup.byRole.get('ADMIN')
    ?? lookup.byRole.get('SUPADMIN')
    ?? lookup.fallbackUserId
}

/** Supervisor opsional (FK nullable): null bila tidak bisa dipetakan agar restore tidak gagal. */
function resolveOptionalUserId(value: unknown, lookup: PersonLookup): string | null {
  return resolvePersonId(value, lookup) ?? null
}

// ================= Pemulihan file foto =================

function safePhotoFileName(raw: string): string | undefined {
  const base = path.basename(raw.trim())
  if (!base || base === '.' || base === '..') return undefined
  if (base.length > 200) return undefined
  return base
}

/** Tulis seluruh file di dalam folder photos/ arsip backup ke public/uploads/damages. */
async function restorePhotoFiles(zip: JSZip): Promise<{ restored: number; skipped: number }> {
  const dir = path.join(process.cwd(), UPLOAD_RELATIVE)
  await mkdir(dir, { recursive: true })

  let restored = 0
  let skipped = 0

  for (const entry of Object.values(zip.files)) {
    if (entry.dir || !entry.name.startsWith('photos/')) continue
    const fileName = safePhotoFileName(entry.name)
    if (!fileName) {
      skipped++
      continue
    }
    const content = await entry.async('nodebuffer')
    if (content.length <= 0 || content.length > MAX_PHOTO_BYTES) {
      skipped++
      continue
    }
    await writeFile(path.join(dir, fileName), content)
    restored++
  }

  return { restored, skipped }
}

// ================= Bersihkan data lama (mode REPLACE) =================

/** Hapus data operasional bandara sesuai urutan FK. Akun pengguna dan profil bandara TIDAK dihapus. */
async function purgeAirportData(airportId: string): Promise<void> {
  await prisma.damage.deleteMany({ where: { airportId } })
  await prisma.markingFinding.deleteMany({ where: { airportId } })
  await prisma.pciSurvey.deleteMany({ where: { airportId } })
  await prisma.pciSection.deleteMany({ where: { airportId } })
  await prisma.inspection.deleteMany({ where: { airportId } })
  await prisma.mapLayer.deleteMany({ where: { airportId } })
  await prisma.facility.deleteMany({ where: { airportId } })
}

// ================= Fasilitas =================

async function restoreFacilities(
  airportId: string,
  payload: JsonObject,
  ctx: RestoreContext,
  facilityIdMap: Map<string, string>
): Promise<void> {
  for (const input of asArray(payload.facilities)) {
    const code = toText(input.code)
    const name = toText(input.name)
    const type = toText(input.type)
    if (!code || !name || !type) {
      ctx.warnings.push('Fasilitas dilewatkan: kode, nama, atau tipe kosong')
      continue
    }

    const data = {
      name,
      type,
      lengthM: toNullableNumber(input.lengthM),
      widthM: toNullableNumber(input.widthM),
      areaSqm: toNullableNumber(input.areaSqm),
      surfaceType: toText(input.surfaceType) ?? null,
      pcn: toText(input.pcn) ?? null,
      pcr: toText(input.pcr) ?? null,
      bearingDeg: toNullableNumber(input.bearingDeg),
      centroidLat: toNullableNumber(input.centroidLat),
      centroidLng: toNullableNumber(input.centroidLng),
      polygonJson: toJsonText(input.polygonJson) ?? null,
      color: toText(input.color) ?? null,
      status: toText(input.status) ?? null,
      remarks: toText(input.remarks) ?? null,
      stationDirection: toText(input.stationDirection) ?? 'FORWARD',
      stationIntervalM: toNullableNumber(input.stationIntervalM) ?? 50,
      locationMode: toText(input.locationMode) ?? 'STA',
      sampleLengthM: toNullableNumber(input.sampleLengthM) ?? 20,
      sampleWidthM: toNullableNumber(input.sampleWidthM) ?? 20,
      blockLengthM: toNullableNumber(input.blockLengthM) ?? 5,
      blockWidthM: toNullableNumber(input.blockWidthM) ?? 5,
      slabDirection: toText(input.slabDirection) ?? 'FORWARD',
      pciCorrection: toNumber(input.pciCorrection, 100),
    }

    const oldId = toText(input.id)

    try {
      let facilityId: string
      if (ctx.mergeMode === 'MERGE') {
        const existing = await prisma.facility.findFirst({ where: { airportId, code } })
        facilityId = existing
          ? (await prisma.facility.update({ where: { id: existing.id }, data })).id
          : (await prisma.facility.create({ data: { ...data, airportId, code } })).id
      } else {
        facilityId = (await prisma.facility.create({ data: { ...data, airportId, code } })).id
      }
      if (oldId) facilityIdMap.set(oldId, facilityId)
      ctx.counts.facilities++
    } catch (error) {
      if (isUniqueViolation(error)) {
        const existing = await prisma.facility.findFirst({ where: { airportId, code } })
        if (existing && oldId) facilityIdMap.set(oldId, existing.id)
        ctx.warnings.push(`Fasilitas ${code} sudah ada; temuan terkait dipetakan ke fasilitas tersebut`)
        continue
      }
      ctx.errors.push(`Fasilitas ${code}: ${error instanceof Error ? error.message : 'gagal disimpan'}`)
    }
  }
}

// ================= Layer peta =================

async function restoreMapLayers(airportId: string, payload: JsonObject, ctx: RestoreContext): Promise<void> {
  for (const input of asArray(payload.mapLayers)) {
    const name = toText(input.name)
    const fileName = toText(input.fileName)
    const entitiesJson = toJsonText(input.entitiesJson)
    if (!name || !fileName || !entitiesJson) {
      ctx.warnings.push('Layer peta dilewatkan: nama, berkas, atau entitas kosong')
      continue
    }

    const data = {
      name,
      fileName,
      refLat: toNumber(input.refLat, 0),
      refLng: toNumber(input.refLng, 0),
      rotationDeg: toNumber(input.rotationDeg, 0),
      scale: toNumber(input.scale, 1),
      entitiesJson,
      visible: input.visible !== false,
    }

    try {
      if (ctx.mergeMode === 'MERGE') {
        const existing = await prisma.mapLayer.findFirst({ where: { airportId, name } })
        if (existing) {
          await prisma.mapLayer.update({ where: { id: existing.id }, data })
        } else {
          await prisma.mapLayer.create({ data: { ...data, airportId } })
        }
      } else {
        await prisma.mapLayer.create({ data: { ...data, airportId } })
      }
      ctx.counts.mapLayers++
    } catch (error) {
      ctx.errors.push(`Layer peta ${name}: ${error instanceof Error ? error.message : 'gagal disimpan'}`)
    }
  }
}

// ================= Inspeksi =================

async function restoreInspections(airportId: string, payload: JsonObject, ctx: RestoreContext): Promise<void> {
  for (const input of asArray(payload.inspections)) {
    const date = toDate(input.date)
    if (!date) {
      ctx.warnings.push('Inspeksi dilewatkan: tanggal tidak valid')
      continue
    }

    const inspectorId = resolveInspectorId(input.inspector ?? input.inspectorId, ctx.lookup)

    if (ctx.mergeMode === 'MERGE') {
      const duplicate = await prisma.inspection.findFirst({ where: { airportId, date, inspectorId } })
      if (duplicate) {
        ctx.warnings.push(`Inspeksi ${date.toISOString().slice(0, 10)} sudah ada; dilewatkan agar tidak ganda`)
        continue
      }
    }

    try {
      const inspection = await prisma.inspection.create({
        data: {
          airportId,
          date,
          status: toText(input.status) ?? 'DRAFT',
          inspectorId,
          supervisorId: resolveOptionalUserId(input.supervisor ?? input.supervisorId, ctx.lookup),
          signature: toText(input.signature) ?? null,
          matrixResults: toJsonText(input.matrixResults) ?? null,
          rubberDepositRunway11: toText(input.rubberDepositRunway11) ?? null,
          rubberDepositRunway29: toText(input.rubberDepositRunway29) ?? null,
          notam: toText(input.notam) ?? null,
          fodCondition: toText(input.fodCondition) ?? null,
          standingWaterCondition: toText(input.standingWaterCondition) ?? null,
          obstacleCondition: toText(input.obstacleCondition) ?? null,
          pavementCondition: toText(input.pavementCondition) ?? null,
          pavementTempRunway11: toText(input.pavementTempRunway11) ?? null,
          pavementTempRunway29: toText(input.pavementTempRunway29) ?? null,
        },
      })
      ctx.counts.inspections++

      for (const detail of asArray(input.details)) {
        const itemId = toText(detail.itemId)
        const status = toText(detail.status)
        if (!itemId || !status) continue
        try {
          await prisma.inspectionDetail.create({
            data: {
              inspectionId: inspection.id,
              itemId,
              status,
              remarks: toText(detail.remarks) ?? null,
              photoUrl: normalizePhotoUrl(detail.photoUrl),
            },
          })
          ctx.counts.inspectionDetails++
        } catch {
          ctx.warnings.push(`Detail inspeksi dilewatkan: item ${itemId} tidak terdaftar di sistem`)
        }
      }
    } catch (error) {
      ctx.errors.push(`Inspeksi ${date.toISOString().slice(0, 10)}: ${error instanceof Error ? error.message : 'gagal disimpan'}`)
    }
  }
}

// ================= Kerusakan =================

async function restoreDamages(
  airportId: string,
  payload: JsonObject,
  ctx: RestoreContext,
  facilityIdMap: Map<string, string>
): Promise<void> {
  for (const input of asArray(payload.damages)) {
    const type = toText(input.type)
    if (!type) {
      ctx.warnings.push('Data kerusakan dilewatkan: tipe tidak diketahui')
      continue
    }

    const lat = toNumber(input.lat, 0)
    const lng = toNumber(input.lng, 0)

    if (ctx.mergeMode === 'MERGE') {
      const duplicate = await prisma.damage.findFirst({ where: { airportId, type, lat, lng } })
      if (duplicate) {
        ctx.warnings.push(`Kerusakan ${type} pada lokasi yang sama sudah ada; dilewatkan`)
        continue
      }
    }

    const oldFacilityId = toText(input.facilityId)

    try {
      await prisma.damage.create({
        data: {
          airportId,
          facilityId: oldFacilityId ? facilityIdMap.get(oldFacilityId) ?? null : null,
          groupId: toText(input.groupId) ?? null,
          station: toText(input.station) ?? null,
          sampleCode: toText(input.sampleCode) ?? null,
          type,
          severity: toText(input.severity) ?? 'MEDIUM',
          lat,
          lng,
          localX: toNumber(input.localX, 0),
          localY: toNumber(input.localY, 0),
          rectJson: toJsonText(input.rectJson) ?? null,
          geometryType: toText(input.geometryType) ?? 'POLYGON',
          lengthM: toNullableNumber(input.lengthM),
          widthM: toNullableNumber(input.widthM),
          areaSqm: toNumber(input.areaSqm, 0),
          count: toIntOrNull(input.count),
          photoUrl: normalizePhotoUrl(input.photoUrl),
          remarks: toText(input.remarks) ?? null,
          status: toText(input.status) ?? 'OPEN',
          reportedBy: toText(input.reportedBy) ?? null,
        },
      })
      ctx.counts.damages++
    } catch (error) {
      ctx.errors.push(`Kerusakan ${type}: ${error instanceof Error ? error.message : 'gagal disimpan'}`)
    }
  }
}

// ================= Marka =================

async function restoreMarkings(
  airportId: string,
  payload: JsonObject,
  ctx: RestoreContext,
  facilityIdMap: Map<string, string>
): Promise<void> {
  for (const input of asArray(payload.markings)) {
    const markingType = toText(input.markingType)
    const condition = toText(input.condition)
    if (!markingType || !condition) {
      ctx.warnings.push('Data marka dilewatkan: jenis atau kondisi kosong')
      continue
    }

    const oldFacilityId = toText(input.facilityId)

    try {
      await prisma.markingFinding.create({
        data: {
          airportId,
          facilityId: oldFacilityId ? facilityIdMap.get(oldFacilityId) ?? null : null,
          markingType,
          condition,
          station: toText(input.station) ?? null,
          lat: toNullableNumber(input.lat),
          lng: toNullableNumber(input.lng),
          localX: toNullableNumber(input.localX),
          localY: toNullableNumber(input.localY),
          areaSqm: toNullableNumber(input.areaSqm),
          remarks: toText(input.remarks) ?? null,
          photoUrl: normalizePhotoUrl(input.photoUrl),
          status: toText(input.status) ?? 'OPEN',
          reportedBy: toText(input.reportedBy) ?? null,
        },
      })
      ctx.counts.markings++
    } catch (error) {
      ctx.errors.push(`Marka ${markingType}: ${error instanceof Error ? error.message : 'gagal disimpan'}`)
    }
  }
}

// ================= PCI =================

async function restorePci(
  airportId: string,
  payload: JsonObject,
  ctx: RestoreContext,
  facilityIdMap: Map<string, string>
): Promise<void> {
  for (const input of asArray(payload.pciSections)) {
    const name = toText(input.name)
    const surfaceType = toText(input.surfaceType)
    if (!name || !surfaceType) {
      ctx.warnings.push('Seksi PCI dilewatkan: nama atau jenis permukaan kosong')
      continue
    }

    const oldFacilityId = toText(input.facilityId)

    const data = {
      airportId,
      facilityId: oldFacilityId ? facilityIdMap.get(oldFacilityId) ?? null : null,
      name,
      surfaceType,
      totalAreaSqm: toNumber(input.totalAreaSqm, 0),
      sampleUnitArea: toNumber(input.sampleUnitArea, 225),
      lastPci: toNullableNumber(input.lastPci),
      lastSurveyAt: toDate(input.lastSurveyAt),
    }

    try {
      let sectionId: string
      if (ctx.mergeMode === 'MERGE') {
        const existing = await prisma.pciSection.findFirst({ where: { airportId, name } })
        sectionId = existing
          ? (await prisma.pciSection.update({ where: { id: existing.id }, data })).id
          : (await prisma.pciSection.create({ data })).id
      } else {
        sectionId = (await prisma.pciSection.create({ data })).id
      }
      ctx.counts.pciSections++

      for (const survey of asArray(input.surveys)) {
        const surveyDate = toDate(survey.surveyDate)
        const detailsJson = toJsonText(survey.detailsJson)
        if (!surveyDate || !detailsJson) {
          ctx.warnings.push(`Survey PCI pada seksi "${name}" dilewatkan: tanggal atau detail tidak valid`)
          continue
        }
        try {
          await prisma.pciSurvey.create({
            data: {
              airportId,
              sectionId,
              inspectorName: toText(survey.inspectorName) ?? null,
              surveyDate,
              pci: toNumber(survey.pci, 0),
              rating: toText(survey.rating) ?? '',
              detailsJson,
            },
          })
          ctx.counts.pciSurveys++
        } catch (error) {
          ctx.errors.push(`Survey PCI ${name}: ${error instanceof Error ? error.message : 'gagal disimpan'}`)
        }
      }
    } catch (error) {
      ctx.errors.push(`Seksi PCI ${name}: ${error instanceof Error ? error.message : 'gagal disimpan'}`)
    }
  }
}

// ================= Konfigurasi bandara =================

async function restoreConfigs(airportId: string, payload: JsonObject, ctx: RestoreContext): Promise<void> {
  for (const input of asArray(payload.configs)) {
    const key = toText(input.key)
    if (!key) continue
    const value = typeof input.value === 'string' ? input.value : toJsonText(input.value)
    if (value === undefined) continue

    try {
      await prisma.airportConfig.upsert({
        where: { airportId_key: { airportId, key } },
        update: { value },
        create: { airportId, key, value },
      })
      ctx.counts.configs++
    } catch (error) {
      ctx.errors.push(`Konfigurasi ${key}: ${error instanceof Error ? error.message : 'gagal disimpan'}`)
    }
  }
}

// ================= Restore satu bandara =================

/** Restore satu bandara dari payload backup (per-bandara maupun satu entri full-system). */
async function restoreAirportPayload(
  airportId: string,
  payload: JsonObject,
  ctx: RestoreContext
): Promise<void> {
  const facilityIdMap = new Map<string, string>()

  if (ctx.mergeMode === 'REPLACE') {
    await purgeAirportData(airportId)
  }

  await restoreFacilities(airportId, payload, ctx, facilityIdMap)
  await restoreMapLayers(airportId, payload, ctx)
  await restoreInspections(airportId, payload, ctx)
  await restoreDamages(airportId, payload, ctx, facilityIdMap)
  await restoreMarkings(airportId, payload, ctx, facilityIdMap)
  await restorePci(airportId, payload, ctx, facilityIdMap)
  await restoreConfigs(airportId, payload, ctx)
}
// ================= Handler POST /api/restore =================

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuthContext(request)
    if ('response' in auth) return auth.response

    const role = auth.user.role
    if (role !== 'ADMIN' && role !== 'SUPADMIN') {
      return NextResponse.json({ error: 'Only ADMIN or SUPADMIN can restore backups' }, { status: 403 })
    }

    let formData: FormData
    try {
      formData = await request.formData()
    } catch {
      return NextResponse.json({ error: 'Formulir restore tidak valid' }, { status: 400 })
    }

    const file = formData.get('file')
    if (!(file instanceof File) || file.size <= 0) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }
    if (file.size > MAX_BACKUP_BYTES) {
      return NextResponse.json({ error: `Ukuran file maksimal ${Math.round(MAX_BACKUP_BYTES / 1024 / 1024)} MB` }, { status: 413 })
    }
    if (!/\.zip$/i.test(file.name)) {
      return NextResponse.json({ error: 'Backup file must be a .zip archive' }, { status: 400 })
    }

    const requestedTypeRaw = formData.get('backupType')
    const requestedType = isBackupType(requestedTypeRaw) ? requestedTypeRaw : undefined
    const requestedAirportId = toText(formData.get('airportId'))
    const mergeMode = normalizeMergeMode(formData.get('mergeMode'))

    // Baca arsip ZIP
    let zip: JSZip
    try {
      zip = await JSZip.loadAsync(await file.arrayBuffer())
    } catch {
      return NextResponse.json({ error: 'File backup bukan arsip ZIP yang valid' }, { status: 400 })
    }

    const metadataFile = zip.file('metadata.json')
    const dataFile = zip.file('data.json')
    if (!metadataFile || !dataFile) {
      return NextResponse.json({ error: 'Invalid backup file format: metadata.json / data.json tidak ditemukan' }, { status: 400 })
    }

    const metadata = parseBackupMetadata(await metadataFile.async('text'))
    if (!metadata) {
      return NextResponse.json({ error: 'Invalid backup file format: metadata tidak dikenali' }, { status: 400 })
    }

    let backupData: unknown
    try {
      backupData = JSON.parse(await dataFile.async('text'))
    } catch {
      return NextResponse.json({ error: 'Isi data.json pada backup tidak valid' }, { status: 400 })
    }

    // metadata.json adalah sumber kebenaran: file per-bandara tetap bisa direstore SUPADMIN.
    const sourceType = metadata.backupType
    const warnings: string[] = []
    if (requestedType && requestedType !== sourceType) {
      warnings.push(`Tipe backup pada file adalah ${sourceType}; permintaan ${requestedType} diabaikan agar data tetap konsisten`)
    }
    if (sourceType === 'FULL_SYSTEM' && role !== 'SUPADMIN') {
      return NextResponse.json({ error: 'Only SUPADMIN can restore full system' }, { status: 403 })
    }

    const entries = airportBackupEntries(backupData, sourceType)
    if (!entries.length) {
      return NextResponse.json({ error: 'Backup tidak berisi data bandara' }, { status: 400 })
    }

// ================= Target bandara =================
    const targets: Array<{ airportId: string; payload: JsonObject }> = []

    if (sourceType === 'AIRPORT') {
      let targetId = requestedAirportId ?? metadata.airportId
      if (role !== 'SUPADMIN') {
        if (!auth.user.airportId) {
          return NextResponse.json({ error: 'Akun Anda belum terhubung ke bandara mana pun' }, { status: 403 })
        }
        if (targetId && targetId !== auth.user.airportId) {
          return NextResponse.json({ error: 'Forbidden: Can only restore your own airport' }, { status: 403 })
        }
        targetId = auth.user.airportId
      }
      if (!targetId) {
        return NextResponse.json({ error: 'Airport ID required' }, { status: 400 })
      }
      const airport = await prisma.airport.findUnique({ where: { id: targetId } })
      if (!airport) {
        return NextResponse.json({ error: 'Airport not found' }, { status: 404 })
      }
      targets.push({ airportId: airport.id, payload: entries[0].payload })
    } else {
      for (const entry of entries) {
        const code = entry.airport ? toText(entry.airport.code) : undefined
        const backupAirportId = entry.airport ? toText(entry.airport.id) : undefined

        let airportId: string | undefined
        if (backupAirportId) {
          const byId = await prisma.airport.findUnique({ where: { id: backupAirportId } })
          if (byId) airportId = byId.id
        }
        if (!airportId && code) {
          const byCode = await prisma.airport.findUnique({ where: { code } })
          if (byCode) {
            airportId = byCode.id
            warnings.push(`Bandara ${code} dipulihkan ke entri bandara yang ada (ID berbeda dari backup)`)
          }
        }
        if (!airportId) {
          warnings.push(`Bandara ${code ?? '(tanpa kode)'} dilewatkan: belum terdaftar di sistem`)
          continue
        }
        targets.push({ airportId, payload: entry.payload })
      }
      if (!targets.length) {
        return NextResponse.json({ error: 'Tidak ada bandara pada backup yang cocok dengan data sistem' }, { status: 400 })
      }
    }

    const ctx: RestoreContext = {
      mergeMode,
      errors: [],
      warnings,
      lookup: await buildPersonLookup(auth.user.id),
      counts: emptyCounts(),
    }

    for (const target of targets) {
      try {
        await restoreAirportPayload(target.airportId, target.payload, ctx)
      } catch (error) {
        ctx.errors.push(`Bandara ${target.airportId}: ${error instanceof Error ? error.message : 'gagal direstore'}`)
      }
    }

    if (metadata.includePhotos) {
      try {
        const photoResult = await restorePhotoFiles(zip)
        ctx.counts.photos = photoResult.restored
        if (photoResult.skipped > 0) {
          ctx.warnings.push(`${photoResult.skipped} file foto pada backup dilewatkan`)
        }
      } catch (error) {
        ctx.errors.push(`File foto: ${error instanceof Error ? error.message : 'gagal dipulihkan'}`)
      }
    }

    const { photos, ...entityCounts } = ctx.counts
    const restoredCount = Object.values(entityCounts).reduce((total, value) => total + value, 0)

    await prisma.backupLog.create({
      data: {
        userId: auth.user.id,
        backupType: sourceType,
        airportId: sourceType === 'AIRPORT' ? targets[0].airportId : null,
        fileName: file.name,
        fileSize: file.size,
        format: metadata.format,
        includePhotos: metadata.includePhotos,
        dataCount: JSON.stringify({ mergeMode, restored: restoredCount, photos, counts: entityCounts, errors: ctx.errors.length }),
        status: 'RESTORED',
      },
    })

    return NextResponse.json({
      success: true,
      message: `Restored ${restoredCount} records successfully${photos > 0 ? ` and ${photos} photo files` : ''}`,
      restoredCount,
      counts: { ...entityCounts, photos },
      airports: targets.map((target) => target.airportId),
      mergeMode,
      errors: ctx.errors.length > 0 ? ctx.errors : undefined,
      warnings: ctx.warnings.length > 0 ? ctx.warnings : undefined,
    })
  } catch (error) {
    console.error('Restore error:', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Restore failed' }, { status: 500 })
  }
}
