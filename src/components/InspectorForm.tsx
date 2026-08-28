'use client';

import React, { useState, useEffect } from 'react';
import { InspectionItem } from '@/types';
import { CheckCircle2, AlertTriangle, HelpCircle, Save, Check } from 'lucide-react';

interface InspectorFormProps {
  onSuccess: () => void;
}

export default function InspectorForm({ onSuccess }: InspectorFormProps) {
  const [items, setItems] = useState<InspectionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'RUNWAY' | 'TAXIWAY' | 'APRON'>('RUNWAY');
  
  // State for form results
  const [formState, setFormState] = useState<Record<string, { status: 'BAIK' | 'RUSAK' | 'NA'; remarks: string }>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  useEffect(() => {
    async function fetchItems() {
      try {
        const res = await fetch('/api/inspection-items');
        const data = await res.json();
        setItems(data);
        
        // Initialize state
        const initialState: Record<string, { status: 'BAIK' | 'RUSAK' | 'NA'; remarks: string }> = {};
        data.forEach((item: InspectionItem) => {
          initialState[item.id] = { status: 'BAIK', remarks: '' };
        });
        setFormState(initialState);
      } catch (err) {
        console.error('Failed to load items', err);
      } finally {
        setLoading(false);
      }
    }
    fetchItems();
  }, []);

  const handleStatusChange = (itemId: string, status: 'BAIK' | 'RUSAK' | 'NA') => {
    setFormState((prev) => ({
      ...prev,
      [itemId]: { ...prev[itemId], status },
    }));
  };

  const handleRemarksChange = (itemId: string, remarks: string) => {
    setFormState((prev) => ({
      ...prev,
      [itemId]: { ...prev[itemId], remarks },
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      const details = Object.entries(formState).map(([itemId, val]) => ({
        itemId,
        status: val.status,
        remarks: val.remarks,
      }));

      const res = await fetch('/api/inspections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ details }),
      });

      if (res.ok) {
        setSubmitSuccess(true);
        setTimeout(() => {
          setSubmitSuccess(false);
          onSuccess();
          // Reset form to defaults
          const resetState = { ...formState };
          Object.keys(resetState).forEach((key) => {
            resetState[key] = { status: 'BAIK', remarks: '' };
          });
          setFormState(resetState);
        }, 2000);
      } else {
        alert('Gagal mengirimkan laporan inspeksi.');
      }
    } catch (err) {
      console.error(err);
      alert('Terjadi kesalahan koneksi.');
    } finally {
      setSubmitting(false);
    }
  };

  // Group items by zone
  const activeItems = items.filter((item) => item.zone === activeTab);
  
  // Calculate completed items for progress
  const totalInTab = activeItems.length;
  const completedInTab = activeItems.filter((item) => formState[item.id]?.status).length;

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-900"></div>
        <p className="mt-4 text-gray-600 text-sm font-medium">Memuat formulir checklist...</p>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto bg-gray-50 min-h-screen pb-16">
      {/* Tabs */}
      <div className="sticky top-0 bg-white shadow-sm border-b border-gray-200 z-10">
        <div className="flex">
          {(['RUNWAY', 'TAXIWAY', 'APRON'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`flex-1 text-center py-3 font-semibold text-xs sm:text-sm border-b-2 transition-all ${
                activeTab === tab
                  ? 'border-blue-700 text-blue-800 bg-blue-50/50'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
        <div className="px-4 py-2 bg-blue-50 text-[11px] text-blue-800 flex justify-between font-medium">
          <span>Progres {activeTab}:</span>
          <span>{completedInTab} / {totalInTab} Item</span>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="p-4 space-y-4">
        {submitSuccess && (
          <div className="bg-green-100 border border-green-300 text-green-800 rounded-lg p-3 text-center flex items-center justify-center space-x-2 font-medium text-sm">
            <Check className="h-5 w-5" />
            <span>Laporan Inspeksi Berhasil Dikirim!</span>
          </div>
        )}

        {/* Card Lists */}
        <div className="space-y-3">
          {activeItems.map((item) => {
            const state = formState[item.id] || { status: 'BAIK', remarks: '' };
            return (
              <div key={item.id} className="bg-white border border-gray-200 rounded-lg p-3 shadow-sm space-y-3">
                <div className="flex justify-between items-start">
                  <div>
                    <span className="text-[9px] uppercase font-extrabold text-blue-700 bg-blue-100/60 px-2 py-0.5 rounded">
                      {item.category}
                    </span>
                    <h3 className="font-semibold text-gray-800 text-sm mt-1">{item.name}</h3>
                  </div>
                </div>

                {/* Status Selector Button Group */}
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => handleStatusChange(item.id, 'BAIK')}
                    className={`flex items-center justify-center space-x-1 py-2 px-1 rounded-md border text-xs font-semibold transition-all ${
                      state.status === 'BAIK'
                        ? 'bg-green-100 text-green-800 border-green-400 shadow-sm'
                        : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    <span>Baik</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleStatusChange(item.id, 'RUSAK')}
                    className={`flex items-center justify-center space-x-1 py-2 px-1 rounded-md border text-xs font-semibold transition-all ${
                      state.status === 'RUSAK'
                        ? 'bg-red-100 text-red-800 border-red-400 shadow-sm'
                        : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <AlertTriangle className="h-3.5 w-3.5" />
                    <span>Rusak</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleStatusChange(item.id, 'NA')}
                    className={`flex items-center justify-center space-x-1 py-2 px-1 rounded-md border text-xs font-semibold transition-all ${
                      state.status === 'NA'
                        ? 'bg-yellow-100 text-yellow-800 border-yellow-400 shadow-sm'
                        : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <HelpCircle className="h-3.5 w-3.5" />
                    <span>N/A</span>
                  </button>
                </div>

                {/* Optional Remarks input */}
                <div>
                  <input
                    type="text"
                    placeholder={
                      state.status === 'RUSAK'
                        ? 'Wajib: Jelaskan detail temuan...'
                        : 'Catatan tambahan (opsional)...'
                    }
                    value={state.remarks}
                    onChange={(e) => handleRemarksChange(item.id, e.target.value)}
                    required={state.status === 'RUSAK'}
                    className={`w-full text-xs p-2 border rounded focus:outline-none focus:ring-1 focus:ring-blue-600 transition-all ${
                      state.status === 'RUSAK' && !state.remarks
                        ? 'border-red-300 bg-red-50/20'
                        : 'border-gray-300'
                    }`}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* Submit Bar */}
        <div className="pt-2">
          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-blue-800 hover:bg-blue-900 text-white font-bold py-3 rounded-lg text-sm flex items-center justify-center space-x-2 shadow disabled:bg-gray-400 disabled:cursor-not-allowed transition-all"
          >
            <Save className="h-4 w-4" />
            <span>{submitting ? 'Mengirimkan...' : 'Kirim Laporan Inspeksi'}</span>
          </button>
        </div>
      </form>
    </div>
  );
}

