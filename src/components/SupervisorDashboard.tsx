'use client';

import React, { useState, useEffect } from 'react';
import { Inspection } from '@/types';
import { FileSpreadsheet, Eye, CheckCircle2, AlertCircle, Clock } from 'lucide-react';

interface SupervisorDashboardProps {
  onSelect: (id: string) => void;
  refreshTrigger: number;
}

export default function SupervisorDashboard({ onSelect, refreshTrigger }: SupervisorDashboardProps) {
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchInspections() {
      try {
        const res = await fetch('/api/inspections');
        const data = await res.json();
        setInspections(data);
      } catch (err) {
        console.error('Failed to fetch inspections', err);
      } finally {
        setLoading(false);
      }
    }
    fetchInspections();
  }, [refreshTrigger]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-900"></div>
        <p className="mt-4 text-gray-600 text-sm font-medium">Memuat daftar laporan...</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-4">
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div className="p-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
          <h2 className="font-bold text-gray-800 text-base sm:text-lg">
            Daftar Laporan Inspeksi Airside
          </h2>
          <span className="text-xs bg-blue-100 text-blue-800 font-bold px-2.5 py-1 rounded-full">
            Total: {inspections.length} Laporan
          </span>
        </div>

        {inspections.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <p className="text-sm font-medium">Belum ada laporan inspeksi yang dikirim.</p>
            <p className="text-xs mt-1 text-gray-400">Silakan isi checklist lewat halaman Petugas (Inspector).</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {/* Desktop Table View */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-left text-sm text-gray-500">
                <thead className="bg-gray-100/70 text-gray-700 text-xs font-bold uppercase">
                  <tr>
                    <th className="px-6 py-3">Tanggal</th>
                    <th className="px-6 py-3">Inspector</th>
                    <th className="px-6 py-3">Status</th>
                    <th className="px-6 py-3">Penyelia</th>
                    <th className="px-6 py-3 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 text-gray-800">
                  {inspections.map((ins) => (
                    <tr key={ins.id} className="hover:bg-gray-50/80 transition-colors">
                      <td className="px-6 py-4 font-semibold">
                        {new Date(ins.date).toLocaleDateString('id-ID', {
                          year: 'numeric', month: 'short', day: 'numeric',
                        })}
                      </td>
                      <td className="px-6 py-4 text-gray-600 font-medium">{ins.inspector.name}</td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-xs font-bold ${
                            ins.status === 'APPROVED'
                              ? 'bg-green-100 text-green-800'
                              : 'bg-orange-100 text-orange-800'
                          }`}
                        >
                          {ins.status === 'APPROVED' ? 'Approved' : 'Submitted'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-gray-500 font-medium text-xs">
                        {ins.supervisor?.name || '-'}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          type="button"
                          onClick={() => onSelect(ins.id)}
                          className="inline-flex items-center space-x-1 bg-blue-50 text-blue-700 hover:bg-blue-100 px-3 py-1.5 rounded-md text-xs font-bold border border-blue-200 cursor-pointer"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          <span>Tinjau</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile List View */}
            <div className="sm:hidden divide-y divide-gray-200">
              {inspections.map((ins) => (
                <div key={ins.id} className="p-4 flex flex-col space-y-3 hover:bg-gray-50/50 transition-colors">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-bold text-gray-900 text-sm">
                        {new Date(ins.date).toLocaleDateString('id-ID', {
                          weekday: 'short', year: 'numeric', month: 'short', day: 'numeric',
                        })}
                      </p>
                      <p className="text-xs font-medium text-gray-500 mt-0.5">Inspector: {ins.inspector.name}</p>
                    </div>
                    <span
                      className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        ins.status === 'APPROVED'
                          ? 'bg-green-100 text-green-800'
                          : 'bg-orange-100 text-orange-800'
                      }`}
                    >
                      {ins.status === 'APPROVED' ? 'Approved' : 'Submitted'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center pt-1">
                    <span className="text-[11px] font-medium text-gray-400">
                      Penyelia: {ins.supervisor?.name || '-'}
                    </span>
                    <button
                      type="button"
                      onClick={() => onSelect(ins.id)}
                      className="bg-blue-50 text-blue-700 hover:bg-blue-100 px-3 py-1.5 rounded-md text-xs font-bold border border-blue-200 transition-all flex items-center space-x-1 cursor-pointer"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      <span>Detail</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

