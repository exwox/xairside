'use client';

import dynamic from 'next/dynamic';
import AppShell from '@/components/AppShell';

const AdminView = dynamic(() => import('@/components/AdminView'), {
  ssr: false,
  loading: () => <div className="flex items-center justify-center h-full text-gray-500">Memuat panel admin...</div>,
});

export default function AdminPage() {
  return (
    <AppShell>
      <div className="min-h-[calc(100svh-3.5rem)] lg:h-[calc(100vh-3.5rem)]">
        <AdminView />
      </div>
    </AppShell>
  );
}
