import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSessionContext } from '@/lib/auth';
import { getRolePageAccess } from '@/lib/page-access-server';
import { isPageAllowed, type PageKey } from '@/lib/page-access';

export default async function PageAccessGate({ page, children }: { page: PageKey; children: React.ReactNode }) {
  const context = await getSessionContext();
  if (!context) redirect('/login');
  const access = await getRolePageAccess();
  if (!isPageAllowed(access, context.user.role, page)) {
    return <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-slate-50 p-6 text-center">
      <h1 className="text-xl font-semibold text-slate-900">Akses halaman ditolak</h1>
      <p className="text-sm text-slate-600">Role akun Anda tidak memiliki akses ke halaman ini.</p>
      <Link href="/" className="text-sm font-semibold text-sky-700 hover:underline">Kembali ke Dashboard</Link>
    </main>;
  }
  return children;
}
