import AppShell from '@/components/AppShell';
import CdvCurveEditor from '@/components/CdvCurveEditor';

export default function RigidCdvCurvePage() {
  return (
    <AppShell>
      <CdvCurveEditor surfaceType="JPCP" />
    </AppShell>
  );
}
