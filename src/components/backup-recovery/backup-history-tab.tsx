'use client'

import { useCallback, useEffect, useState } from 'react'
import { Trash2, Calendar, Database, RefreshCw, AlertCircle } from 'lucide-react'

interface BackupRecord {
  id: string
  fileName: string
  fileSize: number
  fileSizeMB: string
  format: string
  backupType: string
  includePhotos: boolean
  status: string
  dataCount: {
    inspections: number
    damages: number
    markings: number
    pciSurveys: number
    facilities: number
    mapLayers: number
  } | null
  createdBy: { name: string; email: string } | null
  createdAt: string
}

interface BackupHistoryTabProps {
  refreshTrigger: number
  userRole?: string
  airportId?: string
}

export function BackupHistoryTab({ refreshTrigger, userRole = 'ADMIN', airportId }: BackupHistoryTabProps) {
  const [backups, setBackups] = useState<BackupRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [totalSize, setTotalSize] = useState(0)
  const [error, setError] = useState('')

  const loadBackupHistory = useCallback(async () => {
    try {
      setLoading(true)
      setError('')
      const params = new URLSearchParams({ limit: '50' })

      if (userRole === 'ADMIN' && airportId) {
        params.append('airportId', airportId)
      }

      const response = await fetch(`/api/backup/history?${params}`, { cache: 'no-store' })
      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        throw new Error(body.error || `Riwayat backup gagal dimuat (HTTP ${response.status})`)
      }
      const data = await response.json()
      setBackups(Array.isArray(data.backups) ? data.backups : [])
      setTotalSize(parseFloat(data.totalSizeMB) || 0)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Riwayat backup gagal dimuat')
      setBackups([])
      setTotalSize(0)
    } finally {
      setLoading(false)
    }
  }, [userRole, airportId])

  useEffect(() => {
    loadBackupHistory()
  }, [loadBackupHistory, refreshTrigger])

  const handleDeleteBackup = async (backupId: string) => {
    if (!confirm('Are you sure you want to delete this backup?')) return

    try {
      setError('')
      const response = await fetch(`/api/backup/history?id=${backupId}`, { method: 'DELETE' })
      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        throw new Error(body.error || `Backup gagal dihapus (HTTP ${response.status})`)
      }
      await loadBackupHistory()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Backup gagal dihapus')
    }
  }

  return (
    <div className="border rounded-lg p-6 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex-1">
          <div className="flex items-center gap-2">
            <Database className="h-5 w-5 text-blue-600" />
            <div>
              <p className="text-sm font-medium text-blue-900">Total Storage Used</p>
              <p className="text-lg font-bold text-blue-600">{totalSize.toFixed(2)} MB</p>
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={loadBackupHistory}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Muat ulang
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 flex gap-2">
          <AlertCircle className="h-4 w-4 text-red-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      {loading ? (
        <p className="text-gray-500 text-sm text-center py-8">Loading backups...</p>
      ) : backups.length === 0 ? (
        <p className="text-gray-500 text-sm text-center py-8">No backups found</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50">
                <th className="text-left p-3 font-medium">File Name</th>
                <th className="text-left p-3 font-medium">Size</th>
                <th className="text-left p-3 font-medium">Format</th>
                <th className="text-left p-3 font-medium">Status</th>
                <th className="text-left p-3 font-medium">Created</th>
                <th className="text-left p-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {backups.map((backup) => (
                <tr key={backup.id} className="border-b hover:bg-gray-50">
                  <td className="p-3">
                    <div className="text-sm font-medium truncate">{backup.fileName}</div>
                    <div className="text-xs text-gray-500">
                      {backup.backupType === 'FULL_SYSTEM' ? 'Seluruh sistem · ' : ''}
                      {backup.dataCount?.inspections || 0} inspeksi, {backup.dataCount?.damages || 0} kerusakan
                      {backup.includePhotos ? ' · dengan foto' : ''}
                    </div>
                  </td>
                  <td className="p-3">{backup.fileSizeMB} MB</td>
                  <td className="p-3">
                    <span className="inline-block px-2 py-1 rounded bg-gray-100 text-gray-700 text-xs font-medium">
                      {backup.format}
                    </span>
                  </td>
                  <td className="p-3">
                    <span className="inline-block px-2 py-1 rounded bg-green-100 text-green-700 text-xs font-medium">
                      {backup.status}
                    </span>
                  </td>
                  <td className="p-3">
                    <div className="flex items-center gap-1 text-gray-600">
                      <Calendar className="h-4 w-4" />
                      {new Date(backup.createdAt).toLocaleDateString()}
                    </div>
                  </td>
                  <td className="p-3">
                    <button
                      onClick={() => handleDeleteBackup(backup.id)}
                      className="text-red-600 hover:text-red-700 hover:bg-red-50 p-1 rounded"
                      title="Delete backup"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

