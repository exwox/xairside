'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Plane, LayoutDashboard, ClipboardCheck, AlertTriangle, PenTool, BarChart3, Settings } from 'lucide-react';
import { pageKeyForPath, type PageKey } from '@/lib/page-access';

type Role = 'SUPADMIN' | 'ADMIN' | 'USER' | 'VIEWER';
type AuthState = {
  user: { name: string; role: Role };
  activeAirport: { id: string; name: string };
  availableAirports: { id: string; name: string; code: string }[];
  pageAccess: PageKey[];
};

const MENUS = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard, page: 'dashboard' },
  { href: '/inspeksi', label: 'Inspeksi', icon: ClipboardCheck, page: 'inspections' },
  { href: '/kerusakan', label: 'Kerusakan', icon: AlertTriangle, page: 'damages' },
  { href: '/marka', label: 'Marka', icon: PenTool, page: 'markings' },
  { href: '/pci', label: 'PCI', icon: BarChart3, page: 'pci' },
  { href: '/admin', label: 'Admin', icon: Settings, page: 'admin' },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [auth, setAuth] = useState<AuthState | null>(null);
  useEffect(() => {
    let active = true;
    fetch('/api/auth/me', { cache: 'no-store' }).then(async (response) => {
      if (!response.ok) throw new Error('Sesi gagal diperiksa');
      return response.json();
    }).then((data: AuthState & { user?: AuthState['user'] }) => {
      if (!active) return;
      if (!data.user) router.replace('/login');
      else setAuth(data);
    }).catch(() => { if (active) router.replace('/login'); });
    return () => { active = false; };
  }, [router]);

  if (!auth) return <div className="flex min-h-screen items-center justify-center text-slate-600">Memeriksa sesi...</div>;
  const page = pageKeyForPath(pathname);
  const allowed = page !== null && auth.pageAccess.includes(page);
  if (!allowed) return <div className="p-8 text-red-700">Anda tidak memiliki akses ke halaman ini. <Link href="/">Kembali ke Dashboard</Link></div>;

  async function changeAirport(id: string) {
    const response = await fetch('/api/auth/select-airport', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ airportId: id }) });
    if (response.ok) window.location.reload();
  }
  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.replace('/login');
    router.refresh();
  }
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans">
      <header className="bg-slate-900 text-white shadow-lg sticky top-0 z-[1000]">
        <div className="mx-auto flex min-h-14 max-w-[1800px] flex-wrap items-center gap-2 px-3 py-2 sm:flex-nowrap sm:gap-4 sm:px-4">
          <Link href="/" className="flex shrink-0 items-center gap-2 font-bold tracking-tight">
            <Plane className="w-5 h-5 text-sky-400" />
            <span className="hidden sm:inline">
              X-Airside <span className="text-sky-400 font-normal">Monitoring</span>
            </span>
          </Link>
          <nav className="order-3 -mx-3 flex w-[calc(100%+1.5rem)] gap-1 overflow-x-auto px-3 pb-0.5 sm:order-none sm:mx-0 sm:w-auto sm:flex-1 sm:px-0 sm:pb-0">
            {MENUS.filter((m) => auth.pageAccess.includes(m.page as PageKey)).map((m) => {
              const Icon = m.icon;
              const active = pathname === m.href || (m.href !== '/' && pathname.startsWith(`${m.href}/`));
              return (
                <Link
                  key={m.href}
                  href={m.href}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm whitespace-nowrap transition-colors ${
                    active ? 'bg-sky-600 text-white font-semibold' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {m.label}
                </Link>
              );
            })}
          </nav>
          <div className="ml-auto flex shrink-0 items-center gap-2 text-xs text-slate-300">
            <span className="hidden lg:inline">{auth.user.name} · {auth.user.role}</span>
            {auth.user.role === 'SUPADMIN' ? <select aria-label="Bandara aktif" value={auth.activeAirport.id} onChange={(e) => changeAirport(e.target.value)} className="max-w-24 rounded bg-slate-700 px-2 py-1 text-white sm:max-w-36">{auth.availableAirports.map((airport) => <option key={airport.id} value={airport.id}>{airport.code}</option>)}</select> : <span className="max-w-24 truncate sm:max-w-36">{auth.activeAirport.name}</span>}
            <button onClick={logout} className="rounded border border-slate-500 px-2 py-1 hover:bg-slate-700">Keluar</button>
          </div>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="bg-white border-t border-gray-200 py-3 text-center text-xs text-gray-400 print:hidden">
        <p>© 2026 X-Airside. All rights reserved.</p>
        <p className="mt-0.5">Monitoring Fasilitas Airside — Runway, Taxiway, Apron, Marka & PCI.</p>
      </footer>
    </div>
  );
}
