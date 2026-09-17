import PageAccessGate from '@/components/PageAccessGate';

export default function InspectionLayout({ children }: { children: React.ReactNode }) {
  return <PageAccessGate page="inspections">{children}</PageAccessGate>;
}
