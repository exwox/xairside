'use client'

import { useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CreateBackupTab } from './create-backup-tab'
import { RestoreBackupTab } from './restore-backup-tab'
import { BackupHistoryTab } from './backup-history-tab'

interface BackupRecoveryPageProps {
  userRole?: string
  airportId?: string
  airportCode?: string
}

export function BackupRecoveryPage({ userRole = 'ADMIN', airportId, airportCode }: BackupRecoveryPageProps) {
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [refreshTrigger, setRefreshTrigger] = useState(0)
  const [activeTab, setActiveTab] = useState('backup')

  const handleBackupCreated = () => {
    setRefreshTrigger((prev) => prev + 1)
  }

  const handleRestoreComplete = () => {
    setRefreshTrigger((prev) => prev + 1)
  }

  // Pesan hanya berlaku untuk tab yang sedang aktif agar tidak bocor ke tab lain.
  const handleTabChange = (value: string) => {
    setActiveTab(value)
    setMessage(null)
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Backup & Recovery</h1>
        <p className="text-gray-600 mt-2">
          Manage your data backups and restore from previous versions
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="backup">Create Backup</TabsTrigger>
          <TabsTrigger value="restore">Restore Data</TabsTrigger>
          <TabsTrigger value="history">Backup History</TabsTrigger>
        </TabsList>

        <TabsContent value="backup" className="space-y-4">
          <CreateBackupTab
            onBackupCreated={handleBackupCreated}
            message={message}
            setMessage={setMessage}
            userRole={userRole}
            airportId={airportId}
            airportCode={airportCode}
          />
        </TabsContent>

        <TabsContent value="restore" className="space-y-4">
          <RestoreBackupTab
            onRestoreComplete={handleRestoreComplete}
            message={message}
            setMessage={setMessage}
            userRole={userRole}
            airportId={airportId}
          />
        </TabsContent>

        <TabsContent value="history" className="space-y-4">
          <BackupHistoryTab 
            refreshTrigger={refreshTrigger}
            userRole={userRole}
            airportId={airportId}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
