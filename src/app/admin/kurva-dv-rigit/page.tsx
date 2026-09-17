import DvCurveEditor from '@/components/DvCurveEditor';
import PageAccessGate from '@/components/PageAccessGate';

export default function RigidDvCurvePage() {
  return <PageAccessGate page="dvRigid"><DvCurveEditor surfaceType="JPCP" /></PageAccessGate>;
}
