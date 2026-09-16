'use client';

import React, { useState } from 'react';
import AppShell from '@/components/AppShell';
import RoleSwitcher from '@/components/RoleSwitcher';
import InspectorForm from '@/components/InspectorForm';
import SupervisorDashboard from '@/components/SupervisorDashboard';
import InspectionDetailView from '@/components/InspectionDetailView';

export default function InspeksiPage() {
  const [role, setRole] = useState<'inspector' | 'supervisor'>('inspector');
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);

  return (
    <AppShell>
      <div className="bg-gray-50">
        <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Inspeksi Airside</h1>
            <p className="text-sm text-gray-500">Checklist digital Runway / Taxiway / Apron</p>
          </div>
          <RoleSwitcher
            currentRole={role === 'inspector' ? 'INSPECTOR' : 'SUPERVISOR'}
            onChange={(r) => setRole(r === 'INSPECTOR' ? 'inspector' : 'supervisor')}
          />
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
