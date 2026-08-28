'use client';

import React from 'react';
import { User, ClipboardList, ShieldAlert } from 'lucide-react';

interface RoleSwitcherProps {
  currentRole: 'INSPECTOR' | 'SUPERVISOR';
  onChange: (role: 'INSPECTOR' | 'SUPERVISOR') => void;
}

export default function RoleSwitcher({ currentRole, onChange }: RoleSwitcherProps) {
  return (
    <header className="bg-blue-900 text-white shadow-md print:hidden">
      <div className="max-w-7xl mx-auto px-4 py-3 flex flex-col sm:flex-row items-center justify-between gap-3">
        {/* Title */}
        <div className="flex items-center space-x-2">
          <ClipboardList className="h-7 w-7 text-blue-300" />
          <div>
            <h1 className="font-bold text-lg sm:text-xl tracking-wide">
              X-Airside Inspection Portal
            </h1>
            <p className="text-xs text-blue-200">Digitalisasi Laporan Checklist Runway, Taxiway, Apron</p>
          </div>
        </div>

        {/* Switcher Buttons */}
        <div className="flex items-center bg-blue-950 p-1 rounded-lg border border-blue-800">
          <button
            onClick={() => onChange('INSPECTOR')}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-xs sm:text-sm font-medium transition-all ${
              currentRole === 'INSPECTOR'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-blue-300 hover:text-white'
            }`}
          >
            <User className="h-4 w-4" />
            <span>Petugas (Inspector)</span>
          </button>
          
          <button
            onClick={() => onChange('SUPERVISOR')}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-xs sm:text-sm font-medium transition-all ${
              currentRole === 'SUPERVISOR'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-blue-300 hover:text-white'
            }`}
          >
            <ShieldAlert className="h-4 w-4" />
            <span>Penyelia (Supervisor)</span>
          </button>
        </div>
      </div>
    </header>
  );
}
