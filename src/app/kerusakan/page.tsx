import AppShell from '@/components/AppShell';
import KerusakanView from '@/components/KerusakanView';
import PageAccessGate from '@/components/PageAccessGate';

export default function KerusakanPage() {
  return (
    <PageAccessGate page="damages"><AppShell>
      <KerusakanView />
    </AppShell></PageAccessGate>
  );
}
