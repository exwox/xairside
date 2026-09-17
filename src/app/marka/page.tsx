import AppShell from '@/components/AppShell';
import MarkaView from '@/components/MarkaView';
import PageAccessGate from '@/components/PageAccessGate';

export default function MarkaPage() {
  return (
    <PageAccessGate page="markings"><AppShell>
      <MarkaView />
    </AppShell></PageAccessGate>
  );
}
