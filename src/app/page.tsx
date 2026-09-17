import AppShell from '@/components/AppShell';
import DashboardView from '@/components/DashboardView';
import PageAccessGate from '@/components/PageAccessGate';

export default function Home() {
  return (
    <PageAccessGate page="dashboard"><AppShell>
      <DashboardView />
    </AppShell></PageAccessGate>
  );
}
