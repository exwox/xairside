'use client';

import React, { useState } from 'react';
import RoleSwitcher from '@/components/RoleSwitcher';
import InspectorForm from '@/components/InspectorForm';
import SupervisorDashboard from '@/components/SupervisorDashboard';
import InspectionDetailView from '@/components/InspectionDetailView';

export default function Home() {
  const [role, setRole] = useState<'INSPECTOR' | 'SUPERVISOR'>('INSPECTOR');
  const [selectedInspectionId, setSelectedInspectionId] = useState<string | null>(null);
  
  // refreshTrigger is used to reload the dashboard whenever a form is submitted
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const handleRoleChange = (newRole: 'INSPECTOR' | 'SUPERVISOR') => {
    setRole(newRole);
    // Clear selection when switching roles
    setSelectedInspectionId(null);
  };

  const handleInspectionSubmitted = () => {
    setRefreshTrigger((prev) => prev + 1);
    // Automatically switch to supervisor view so they can review it immediately
    setRole('SUPERVISOR');
  };

  const handleInspectionApproved = () => {
    setRefreshTrigger((prev) => prev + 1);
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans">
      {/* Top Navigation & Role Switcher */}
      <RoleSwitcher currentRole={role} onChange={handleRoleChange} />

      {/* Main Application Area */}
      <main className="flex-1 pb-12">
        {role === 'INSPECTOR' ? (
          <div className="py-6">
            <div className="max-w-md mx-auto px-4 mb-4 print:hidden">
              <h2 className="text-xl font-bold text-gray-800">Form Checklist Lapangan</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Pilih status "Baik", "Rusak", atau "N/A" untuk tiap item di Runway, Taxiway, dan Apron.
              </p>
            </div>
            <InspectorForm onSuccess={handleInspectionSubmitted} />
          </div>
        ) : (
          <div className="py-6">
            {!selectedInspectionId ? (
              <SupervisorDashboard
                onSelect={setSelectedInspectionId}
                refreshTrigger={refreshTrigger}
              />
            ) : (
              <InspectionDetailView
                inspectionId={selectedInspectionId}
                onClose={() => setSelectedInspectionId(null)}
                onApproved={handleInspectionApproved}
              />
            )}
          </div>
        )}
      </main>

      {/* Footer (Hidden when printing) */}
      <footer className="bg-white border-t border-gray-200 py-4 text-center text-xs text-gray-400 print:hidden mt-auto">
        <p>© 2026 X-Airside. All rights reserved.</p>
        <p className="mt-0.5">Sistem Laporan Checklist Runway, Taxiway & Apron.</p>
      </footer>
    </div>
  );
}

