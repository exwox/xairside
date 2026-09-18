'use client'

import { useState } from 'react'
import { Loader2, Upload, CheckCircle, AlertCircle } from 'lucide-react'

interface RestoreBackupProps {
  onRestoreComplete: () => void
  message: { type: 'success' | 'error'; text: string } | null
  setMessage: (msg: { type: 'success' | 'error'; text: string } | null) => void
  userRole?: string
  airportId?: string
}

interface RestoreResponse {
  message?: string
  restoredCount?: number
  counts?: Record<string, number>
  errors?: string[]
  warnings?: string[]
}

const COUNT_LABELS: Array<[string, string]> = [
  ['facilities', 'fasilitas'],
  ['mapLayers', 'peta'],
  ['inspections', 'inspeksi'],
  ['inspectionDetails', 'detail inspeksi'],
  ['damages', 'kerusakan'],
  ['markings', 'marka'],
  ['pciSections', 'seksi PCI'],
  ['pciSurveys', 'survey PCI'],
  ['configs', 'konfigurasi'],
  ['photos', 'foto'],
]

function describeCounts(counts?: Record<string, number>): string {
  if (!counts) return ''
  const parts = COUNT_LABELS
    .filter(([key]) => (counts[key] ?? 0) > 0)
    .map(([key, label]) => `${counts[key]} ${label}`)
  return parts.join(', ')
}

export function RestoreBackupTab({ onRestoreComplete, message, setMessage, userRole = 'ADMIN', airportId }: RestoreBackupProps) {
  const [file, setFile] = useState<File | null>(null)
  const [restoreMode, setRestoreMode] = useState<'REPLACE' | 'MERGE'>('REPLACE')
  const [isRestoring, setIsRestoring] = useState(false)
  const [warnings, setWarnings] = useState<string[]>([])
  const [errors, setErrors] = useState<string[]>([])

  const handleRestore = async () => {
    if (!file) {
      setMessage({ type: 'error', text: 'Please select a backup file' })
      return
    }

    try {
      setIsRestoring(true)
      setMessage(null)
      setWarnings([])
      setErrors([])

      const formData = new FormData()
      formData.append('file', file)
      // Tipe backup (AIRPORT/FULL_SYSTEM) ditentukan server dari metadata.json di dalam arsip.
      if (airportId) {
        formData.append('airportId', airportId)
      }
      formData.append('mergeMode', restoreMode)

      const response = await fetch('/api/restore', {
        method: 'POST',
        body: formData,
      })

      if (response.ok) {
        const data = (await response.json()) as RestoreResponse
        const detail = describeCounts(data.counts)
        setMessage({
          type: 'success',
          text: `Restore successful: ${data.message ?? ''}${detail ? ` — ${detail}` : ''}`,
        })
        setWarnings(data.warnings ?? [])
        setErrors(data.errors ?? [])
        setFile(null)
        onRestoreComplete()
      } else {
        const error = await response.json().catch(() => ({}))
        const errorMsg = error.error || error.message || `Failed to restore backup (HTTP ${response.status})`
        setMessage({ type: 'error', text: errorMsg })
        console.error('Restore error details:', error)
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Error restoring backup'
      setMessage({ type: 'error', text: msg })
      console.error('Restore error:', error)
    } finally {
      setIsRestoring(false)
    }
  }

  return (
    <div className="border rounded-lg p-6 space-y-4">
      <div>
        <h2 className="text-xl font-bold">Restore from Backup</h2>
        <p className="text-gray-600 text-sm mt-1">Upload a backup file to restore your data</p>
        <p className="mt-2 rounded-md bg-slate-50 border border-slate-200 p-2 text-xs text-slate-600">
          {userRole === 'SUPADMIN'
            ? 'SUPADMIN: isi arsip menentukan cakupan restore. Backup full-system memulihkan setiap bandara yang cocok; backup per-bandara dipulihkan ke bandara asalnya.'
            : 'ADMIN: restore hanya berlaku untuk bandara Anda sendiri. File backup bandara lain akan ditolak.'}
        </p>
      </div>

      <div className="space-y-3">
        <div>
          <label className="text-sm font-medium block mb-2">Select Backup File</label>
          <input
            type="file"
            accept=".zip"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md"
          />
          {file && (
            <p className="text-sm text-gray-600 mt-2">
              Selected: {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)
            </p>
          )}
        </div>

        <div>
          <label className="text-sm font-medium block mb-2">Restore Mode</label>
          <div className="flex gap-4">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                value="REPLACE"
                checked={restoreMode === 'REPLACE'}
                onChange={(e) => setRestoreMode(e.target.value as 'REPLACE' | 'MERGE')}
              />
              <span className="text-sm">Replace (Delete existing data)</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                value="MERGE"
                checked={restoreMode === 'MERGE'}
                onChange={(e) => setRestoreMode(e.target.value as 'REPLACE' | 'MERGE')}
              />
              <span className="text-sm">Merge (Keep existing)</span>
            </label>
          </div>
          {restoreMode === 'REPLACE' && (
            <p className="mt-2 rounded-md bg-amber-50 border border-amber-200 p-2 text-xs text-amber-800">
              Mode Replace menghapus fasilitas, inspeksi, kerusakan, marka, dan data PCI bandara tujuan sebelum data
              backup dimuat. Pastikan sudah punya backup terbaru.
            </p>
          )}
        </div>
      </div>

      {message && (
        <div className={`p-3 rounded-lg flex gap-2 ${message.type === 'success' ? 'bg-green-50' : 'bg-red-50'}`}>
          {message.type === 'success' ? (
            <CheckCircle className="h-4 w-4 text-green-600 flex-shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="h-4 w-4 text-red-600 flex-shrink-0 mt-0.5" />
          )}
          <p className={`text-sm ${message.type === 'success' ? 'text-green-800' : 'text-red-800'}`}>
            {message.text}
          </p>
        </div>
      )}

      {warnings.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
          <p className="text-sm font-medium text-amber-900">{warnings.length} peringatan</p>
          <ul className="mt-1 list-disc pl-5 text-xs text-amber-800 space-y-0.5">
            {warnings.slice(0, 10).map((warning, index) => (
              <li key={`${index}-${warning}`}>{warning}</li>
            ))}
          </ul>
          {warnings.length > 10 && <p className="mt-1 text-xs text-amber-700">+{warnings.length - 10} peringatan lain</p>}
        </div>
      )}

      {errors.length > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3">
          <p className="text-sm font-medium text-red-900">{errors.length} data gagal direstore</p>
          <ul className="mt-1 list-disc pl-5 text-xs text-red-800 space-y-0.5">
            {errors.slice(0, 10).map((error, index) => (
              <li key={`${index}-${error}`}>{error}</li>
            ))}
          </ul>
          {errors.length > 10 && <p className="mt-1 text-xs text-red-700">+{errors.length - 10} error lain</p>}
        </div>
      )}

      <button
        onClick={handleRestore}
        disabled={!file || isRestoring}
        className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 flex items-center justify-center gap-2 font-medium"
      >
        {isRestoring ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Restoring...
          </>
        ) : (
          <>
            <Upload className="h-4 w-4" />
            Restore Backup
          </>
        )}
      </button>
    </div>
  )
}

