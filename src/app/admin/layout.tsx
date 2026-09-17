import PageAccessGate from '@/components/PageAccessGate';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <PageAccessGate page="admin">{children}</PageAccessGate>;
}
