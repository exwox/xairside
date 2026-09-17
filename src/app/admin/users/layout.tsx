import PageAccessGate from '@/components/PageAccessGate';

export default function UsersLayout({ children }: { children: React.ReactNode }) {
  return <PageAccessGate page="users">{children}</PageAccessGate>;
}
