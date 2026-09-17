import DvCurveEditor from '@/components/DvCurveEditor';
import PageAccessGate from '@/components/PageAccessGate';

export default function FlexibleDvCurvePage() {
  return <PageAccessGate page="dvFlexible"><DvCurveEditor surfaceType="ASPHALT" /></PageAccessGate>;
}
