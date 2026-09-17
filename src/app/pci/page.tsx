import AppShell from '@/components/AppShell';
import PciView from '@/components/PciView';
import PageAccessGate from '@/components/PageAccessGate';

export default function PciPage() {
  return (
    <PageAccessGate page="pci"><AppShell>
      <PciView />
    </AppShell></PageAccessGate>
  );
}
