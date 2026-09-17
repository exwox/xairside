import AppShell from '@/components/AppShell';
import CdvCurveEditor from '@/components/CdvCurveEditor';
import PageAccessGate from '@/components/PageAccessGate';

export default function FlexibleCdvCurvePage() {
  return (
    <PageAccessGate page="cdvFlexible"><AppShell>
      <CdvCurveEditor surfaceType="ASPHALT" />
    </AppShell></PageAccessGate>
  );
}
