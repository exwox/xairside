import { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSessionContext } from '@/lib/auth'
import AppShell from '@/components/AppShell'
import { BackupRecoveryPage } from '@/components/backup-recovery/backup-recovery-page'

export const metadata: Metadata = {
  title: 'Backup & Recovery | X-AIRSIDE',
  description: 'Manage system backups and data recovery',
}

export default async function BackupRecoveryPageRoute() {
  const context = await getSessionContext()

  if (!context) {
    redirect('/login')
  }

  // Only ADMIN and SUPADMIN can access backup
  if (context.user.role !== 'ADMIN' && context.user.role !== 'SUPADMIN') {
    redirect('/')
  }

  return (
    <AppShell>
      <BackupRecoveryPage
        userRole={context.user.role}
        airportId={context.activeAirport.id}
        airportCode={context.activeAirport.code}
      />
    </AppShell>
  )
}
