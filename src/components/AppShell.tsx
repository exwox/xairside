'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Plane, LayoutDashboard, ClipboardCheck, AlertTriangle, PenTool, BarChart3, Settings } from 'lucide-react';

const MENUS = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/inspeksi', label: 'Inspeksi', icon: ClipboardCheck },
  { href: '/kerusakan', label: 'Kerusakan', icon: AlertTriangle },
  { href: '/marka', label: 'Marka', icon: PenTool },
  { href: '/pci', label: 'PCI', icon: BarChart3 },
  { href: '/admin', label: 'Admin', icon: Settings },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans">
      <header className="bg-slate-900 text-white shadow-lg sticky top-0 z-[1000]">
        <div className="max-w-[1800px] mx-auto px-4 h-14 flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2 font-bold tracking-tight">
            <Plane className="w-5 h-5 text-sky-400" />
            <span>
              X-Airside <span className="text-sky-400 font-normal">Monitoring</span>
            </span>
          </Link>
          <nav className="flex items-center gap-1 overflow-x-auto">
            {MENUS.map((m) => {
              const Icon = m.icon;
              const active = pathname === m.href || (m.href !== '/' && pathname.startsWith(m.href));
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
          <div className="ml-auto flex items-center gap-2 text-xs text-slate-300">
            <span className="hidden sm:inline">Monitoring Fasilitas Airside</span>
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
