'use client'

import { useState } from 'react'
import { Loader2, Download, CheckCircle, AlertCircle } from 'lucide-react'

interface CreateBackupProps {
  onBackupCreated: () => void
  message: { type: 'success' | 'error'; text: string } | null
  setMessage: (msg: { type: 'success' | 'error'; text: string } | null) => void
  userRole?: string
  airportId?: string
  airportCode?: string
}

/** Ambil nama file dari header Content-Disposition supaya nama tetap sesuai standar server. */
function fileNameFromResponse(response: Response): string | null {
  const header = response.headers.get('content-disposition')
  if (!header) return null
  const utf8 = header.match(/filename\*=UTF-8''([^;]+)/i)
  if (utf8?.[1]) {
    try {
      return decodeURIComponent(utf8[1])
    } catch {
      return utf8[1]
    }
  }
  const plain = header.match(/filename="?([^";]+)"?/i)
  return plain?.[1] ?? null
}

export function CreateBackupTab({ onBackupCreated, message, setMessage, userRole = 'ADMIN', airportId, airportCode }: CreateBackupProps) {
  const [loading, setLoading] = useState(false)
  const [includePhotos, setIncludePhotos] = useState(false)
  // SUPADMIN dapat memilih cakupan backup: bandara aktif saja atau seluruh sistem.
  const [scope, setScope] = useState<'AIRPORT' | 'FULL_SYSTEM'>('AIRPORT')

  const backupType = userRole === 'SUPADMIN' ? scope : 'AIRPORT'

  const handleCreateBackup = async () => {
    try {
      setLoading(true)
      setMessage(null)

      const payload: { backupType: string; includePhotos: boolean; airportId?: string } = {
        backupType,
        includePhotos,
      }

      if (backupType === 'AIRPORT' && airportId) {
        payload.airportId = airportId
      }

      const response = await fetch('/api/backup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (response.ok) {
        const blob = await response.blob()
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = fileNameFromResponse(response) ?? `xairside-backup-${new Date().toISOString().split('T')[0]}.zip`
        document.body.appendChild(a)
        a.click()
        window.URL.revokeObjectURL(url)
        a.remove()

        setMessage({ type: 'success', text: 'Backup created and downloaded successfully' })
        onBackupCreated()
      } else {
        const contentType = response.headers.get('content-type')
        let errorMsg = `Failed to create backup (HTTP ${response.status})`

        if (contentType?.includes('application/json')) {
          const error = await response.json()
          errorMsg = error.error || error.message || errorMsg
        }

        setMessage({ type: 'error', text: errorMsg })
        console.error('Backup error:', errorMsg, { status: response.status, statusText: response.statusText })
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Error creating backup'
      setMessage({ type: 'error', text: msg })
      console.error('Backup error:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="border rounded-lg p-6 space-y-4">
      <div>
        <h2 className="text-xl font-bold">Create New Backup</h2>
        <p className="text-gray-600 text-sm mt-1">
          Export your data in a compressed ZIP file with optional photos
        </p>
      </div>
      
      <div className="space-y-3">
        <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-xs text-slate-600">
          <p className="font-medium text-slate-800">
            {backupType === 'AIRPORT'
              ? `Backup bandara ${airportCode ?? 'aktif'}`
              : 'Backup seluruh sistem (semua bandara)'}
          </p>
          <p className="mt-1">
            Arsip ZIP berisi <code>metadata.json</code>, <code>data.json</code>, dan folder <code>photos/</code> bila
            opsi foto dicentang. Format ini bisa langsung dipulihkan dari tab <strong>Restore Data</strong>.
          </p>
        </div>

        {userRole === 'SUPADMIN' && (
          <div>
            <label className="text-sm font-medium block mb-2">Cakupan Backup</label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="backup-scope"
                  value="AIRPORT"
                  checked={scope === 'AIRPORT'}
                  onChange={() => setScope('AIRPORT')}
                />
                <span className="text-sm">Bandara aktif ({airportCode ?? '-'})</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="backup-scope"
                  value="FULL_SYSTEM"
                  checked={scope === 'FULL_SYSTEM'}
                  onChange={() => setScope('FULL_SYSTEM')}
                />
                <span className="text-sm">Seluruh sistem</span>
              </label>
            </div>
          </div>
        )}

        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={includePhotos}
            onChange={(e) => setIncludePhotos(e.target.checked)}
          />
          <span className="text-sm font-medium">Include damage photos</span>
        </label>
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

      <button
        onClick={handleCreateBackup}
        disabled={loading}
        className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 flex items-center justify-center gap-2 font-medium"
      >
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Creating Backup...
          </>
        ) : (
          <>
            <Download className="h-4 w-4" />
            Download Backup
          </>
        )}
      </button>
    </div>
  )
}
