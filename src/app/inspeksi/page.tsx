'use client';

import React, { useEffect, useState } from 'react';
import AppShell from '@/components/AppShell';
import InspectorForm from '@/components/InspectorForm';
import SupervisorDashboard from '@/components/SupervisorDashboard';
import InspectionDetailView from '@/components/InspectionDetailView';

export default function InspeksiPage() {
  const [role, setRole] = useState<'inspector' | 'supervisor'>('inspector');
  const [canApprove, setCanApprove] = useState(false);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    fetch('/api/auth/me', { cache: 'no-store' }).then((res) => res.json()).then((data) => {
      setCanApprove(data.user?.role === 'ADMIN' || data.user?.role === 'SUPADMIN');
    }).catch(() => {});
  }, []);

  return (
    <AppShell>
      <div className="bg-gray-50">
        <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Inspeksi Airside</h1>
            <p className="text-sm text-gray-500">Checklist digital Runway / Taxiway / Apron</p>
          </div>
          {canApprove && <div className="flex gap-2">
            <button type="button" onClick={() => setRole('inspector')} className={`rounded px-3 py-2 text-sm ${role === 'inspector' ? 'bg-sky-700 text-white' : 'bg-gray-100'}`}>Isi inspeksi</button>
            <button type="button" onClick={() => setRole('supervisor')} className={`rounded px-3 py-2 text-sm ${role === 'supervisor' ? 'bg-sky-700 text-white' : 'bg-gray-100'}`}>Persetujuan</button>
          </div>}
        </header>
        <main className="max-w-7xl mx-auto px-6 py-6">
          {viewingId ? (
            <InspectionDetailView
              inspectionId={viewingId}
              onClose={() => setViewingId(null)}
              onApproved={() => {
                setViewingId(null);
                setRefresh((n) => n + 1);
              }}
            />
          ) : role === 'inspector' ? (
            <InspectorForm onSuccess={() => setRefresh((n) => n + 1)} />
          ) : (
            <SupervisorDashboard onSelect={(id) => setViewingId(id)} refreshTrigger={refresh} />
          )}
        </main>
      </div>
    </AppShell>
  );
}
