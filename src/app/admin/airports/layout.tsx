import PageAccessGate from '@/components/PageAccessGate';

export default function AirportsLayout({ children }: { children: React.ReactNode }) {
  return <PageAccessGate page="airports">{children}</PageAccessGate>;
}
