import AppShell from '@/components/AppShell';
import CdvCurveEditor from '@/components/CdvCurveEditor';

export default function FlexibleCdvCurvePage() {
  return (
    <AppShell>
      <CdvCurveEditor surfaceType="ASPHALT" />
    </AppShell>
  );
}
