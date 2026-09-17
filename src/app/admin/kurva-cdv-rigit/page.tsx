import AppShell from '@/components/AppShell';
import CdvCurveEditor from '@/components/CdvCurveEditor';
import PageAccessGate from '@/components/PageAccessGate';

export default function RigidCdvCurvePage() {
  return (
    <PageAccessGate page="cdvRigid"><AppShell>
      <CdvCurveEditor surfaceType="JPCP" />
    </AppShell></PageAccessGate>
  );
}
