'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Inspection } from '@/types';
import { X, FileSpreadsheet, Printer, ShieldCheck, ChevronLeft, Eraser, ZoomIn, ZoomOut } from 'lucide-react';

interface InspectionDetailViewProps {
  inspectionId: string;
  onClose: () => void;
  onApproved: () => void;
}

import runwayGrid from '../../public/templates/runway_grid.json';

const COLS = ['A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','Q','R','S','T','U','V','W','X','Y','Z','AA','AB','AC','AD'];

function MatrixResultsTable({ inspection }: { inspection: Inspection }) {
  const [zoom, setZoom] = useState<number>(75); // Default zoom out
  const results = (typeof inspection.matrixResults === 'string'
    ? JSON.parse(inspection.matrixResults)
    : inspection.matrixResults) || {};

  const renderReadOnlyCell = (cell: any) => {
    // If it's a signature cell (AA88) and report is approved, show the signature image!
    if (cell.address === 'AA88' && inspection.signature && inspection.status === 'APPROVED') {
      return (
        <div className="flex flex-col items-center justify-center py-1">
          <img
            src={inspection.signature}
            alt="Supervisor Signature"
            className="h-10 object-contain max-w-[120px]"
          />
        </div>
      );
    }

    // Auto-fill inspector name in Z50
    if (cell.address === 'Z50') {
      return <span className="font-bold text-gray-800">{inspection.inspector.name}</span>;
    }

    // Auto-fill supervisor name in AA91 if approved
    if (cell.address === 'AA91' && inspection.supervisor) {
      return <span className="font-bold text-gray-800">{inspection.supervisor.name}</span>;
    }

    if (cell.cellType === 'signature') {
      const sigData = results[cell.address];
      if (sigData) {
        return (
          <div className="absolute inset-0 w-full h-full flex flex-col items-center justify-center p-0.5">
            <img
              src={sigData}
              alt="Signature"
              className="w-full h-full max-h-full object-contain p-1"
            />
          </div>
        );
      }
    }

    if (cell.isEditable) {
      if (cell.cellType === 'checkbox') {
        const isChecked = !!results[cell.address];
        return isChecked ? <span className="font-bold text-emerald-800 text-xs">✓</span> : '';
      }
      
      const cellValStr = typeof cell.value === 'string' ? cell.value : String(cell.value ?? '');
      const val = results[cell.address] ?? (cellValStr.startsWith('<<') ? '' : cell.value);
      return <span className="text-gray-800">{val}</span>;
    }

    return cell.value;
  };

  return (
    <div className="bg-gray-100 border border-gray-300 rounded-xl overflow-hidden shadow-sm">
      <div className="bg-emerald-800 text-white px-4 py-2 flex items-center justify-between font-sans text-xs select-none">
        <span className="font-bold tracking-wide">Excel Sheet Preview (Read-Only)</span>
        <div className="flex items-center space-x-3">
          {/* Zoom Controls */}
          <div className="flex items-center space-x-1 bg-emerald-700/60 text-white px-2 py-0.5 rounded border border-emerald-500 text-[10px] font-semibold select-none">
            <button
              type="button"
              onClick={() => setZoom(z => Math.max(50, z - 10))}
              className="hover:bg-emerald-600/50 p-0.5 rounded cursor-pointer"
              title="Zoom Out"
            >
              <ZoomOut className="h-3 w-3" />
            </button>
            <span className="w-8 text-center">{zoom}%</span>
            <button
              type="button"
              onClick={() => setZoom(z => Math.min(150, z + 10))}
              className="hover:bg-emerald-600/50 p-0.5 rounded cursor-pointer"
              title="Zoom In"
            >
              <ZoomIn className="h-3 w-3" />
            </button>
          </div>
          <span className="text-[10px] bg-emerald-700/60 px-2 py-0.5 rounded">Lembar Aktif: Runway</span>
        </div>
      </div>
      <div className="overflow-auto max-h-[600px] w-full relative" style={{ zoom: `${zoom}%` }}>
        <table className="min-w-[1500px] border-collapse bg-white font-mono text-[10px] w-full text-gray-800 border border-gray-300">
          <thead>
            <tr className="bg-gray-100 text-gray-500 text-center select-none text-[9px] h-5">
              <th className="sticky top-0 left-0 bg-gray-200 border-r border-b border-gray-300 w-8 z-30 font-bold text-center"></th>
              {COLS.map((col) => (
                <th key={col} className="sticky top-0 bg-gray-100 border border-gray-300 font-semibold min-w-16 text-center z-20">{col}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {runwayGrid.map((row: any, rIdx: number) => (
              <tr key={rIdx} className="h-7 hover:bg-gray-50/50">
                <td className="sticky left-0 bg-gray-150 text-gray-500 border border-gray-300 text-center font-bold select-none text-[8px] w-8 z-10">
                  {rIdx + 1}
                </td>
                {row.map((cell: any, cIdx: number) => {
                  if (cell.isMerged && !cell.isMaster) {
                    return null;
                  }
                  return (
                    <td
                      key={cIdx}
                      rowSpan={cell.rowSpan > 1 ? cell.rowSpan : undefined}
                      colSpan={cell.colSpan > 1 ? cell.colSpan : undefined}
                      style={{
                        backgroundColor: cell.style.bgColor ? '#' + cell.style.bgColor.slice(2) : undefined,
                        fontWeight: cell.style.isBold ? 'bold' : 'normal',
                        fontStyle: cell.style.isItalic ? 'italic' : 'normal',
                        fontSize: `${cell.style.fontSize - 1}px`,
                        color: cell.style.fontColor ? '#' + cell.style.fontColor.slice(2) : undefined,
                        textAlign: cell.style.alignH === 'left' ? 'left' : cell.style.alignH === 'center' ? 'center' : cell.style.alignH === 'right' ? 'right' : 'left',
                        verticalAlign: cell.style.alignV === 'middle' ? 'middle' : cell.style.alignV === 'top' ? 'top' : cell.style.alignV === 'bottom' ? 'bottom' : 'middle',
                      }}
                      className="border border-gray-300 px-1 py-0.5 relative"
                    >
                      {renderReadOnlyCell(cell)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Excel-style Sheet Tabs */}
      <div className="bg-gray-100 border-t border-gray-300 px-4 py-1 flex items-center space-x-1 text-xs select-none">
        <span className="font-bold text-gray-400 mr-2 text-[10px]">LEMBAR:</span>
        <button
          type="button"
          className="bg-white border-x border-t border-gray-300 px-3 py-1 font-semibold text-emerald-800 rounded-t shadow-sm"
        >
          Runway
        </button>
        <button
          type="button"
          disabled
          className="text-gray-400 border-x border-t border-transparent px-3 py-1 cursor-not-allowed text-[11px]"
        >
          Taxiway (Belum Tersedia)
        </button>
        <button
          type="button"
          disabled
          className="text-gray-400 border-x border-t border-transparent px-3 py-1 cursor-not-allowed text-[11px]"
        >
          Apron (Belum Tersedia)
        </button>
      </div>
    </div>
  );
}

// Read-only grid view complete

export default function InspectionDetailView({ inspectionId, onClose, onApproved }: InspectionDetailViewProps) {
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [loading, setLoading] = useState(true);
  const [isDrawing, setIsDrawing] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const contextRef = useRef<CanvasRenderingContext2D | null>(null);

  useEffect(() => {
    async function fetchDetails() {
      try {
        const res = await fetch(`/api/inspections/${inspectionId}`);
        const data = await res.json();
        setInspection(data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    fetchDetails();
  }, [inspectionId]);

  // Setup canvas for drawing signature
  useEffect(() => {
    if (!loading && inspection?.status === 'SUBMITTED' && canvasRef.current) {
      const canvas = canvasRef.current;
      // High DPI screens support
      canvas.width = canvas.offsetWidth * 2;
      canvas.height = canvas.offsetHeight * 2;
      canvas.style.width = `${canvas.offsetWidth}px`;
      canvas.style.height = `${canvas.offsetHeight}px`;

      const context = canvas.getContext('2d');
      if (context) {
        context.scale(2, 2);
        context.lineCap = 'round';
        context.strokeStyle = '#1e3a8a'; // dark blue
        context.lineWidth = 3;
        contextRef.current = context;
      }
    }
  }, [loading, inspection?.status]);

  const startDrawing = ({ nativeEvent }: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!contextRef.current || !canvasRef.current) return;
    
    // Get mouse or touch coordinates relative to canvas
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    let clientX, clientY;

    if ('touches' in nativeEvent) {
      clientX = nativeEvent.touches[0].clientX;
      clientY = nativeEvent.touches[0].clientY;
    } else {
      clientX = nativeEvent.clientX;
      clientY = nativeEvent.clientY;
    }

    const x = clientX - rect.left;
    const y = clientY - rect.top;

    contextRef.current.beginPath();
    contextRef.current.moveTo(x, y);
    setIsDrawing(true);
  };

  const draw = ({ nativeEvent }: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !contextRef.current || !canvasRef.current) return;

    // Prevent scrolling on mobile when drawing
    if (nativeEvent.cancelable) {
      nativeEvent.preventDefault();
    }

    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    let clientX, clientY;

    if ('touches' in nativeEvent) {
      clientX = nativeEvent.touches[0].clientX;
      clientY = nativeEvent.touches[0].clientY;
    } else {
      clientX = nativeEvent.clientX;
      clientY = nativeEvent.clientY;
    }

    const x = clientX - rect.left;
    const y = clientY - rect.top;

    contextRef.current.lineTo(x, y);
    contextRef.current.stroke();
  };

  const stopDrawing = () => {
    if (!contextRef.current) return;
    contextRef.current.closePath();
    setIsDrawing(false);
  };

  const clearCanvas = () => {
    if (!canvasRef.current || !contextRef.current) return;
    const canvas = canvasRef.current;
    contextRef.current.clearRect(0, 0, canvas.width, canvas.height);
  };

  const handleApprove = async () => {
    if (!canvasRef.current) return;
    
    // Get signature data URL
    const signatureDataUrl = canvasRef.current.toDataURL('image/png');
    
    // Check if canvas is empty (basic check: checking if the user drew anything)
    // Note: in a true production app, we would check if the image has painted pixels.
    // For this prototype, we'll proceed directly.
    setSubmitting(true);
    try {
      const res = await fetch(`/api/inspections/${inspectionId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signature: signatureDataUrl }),
      });

      if (res.ok) {
        onApproved();
        // Refresh detail view
        const data = await res.json();
        setInspection(data);
      } else {
        alert('Gagal menyetujui laporan.');
      }
    } catch (err) {
      console.error(err);
      alert('Terjadi kesalahan koneksi.');
    } finally {
      setSubmitting(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-900"></div>
        <p className="mt-4 text-gray-600 text-sm">Memuat detail laporan...</p>
      </div>
    );
  }

  if (!inspection) {
    return (
      <div className="p-8 text-center text-red-600">
        Laporan tidak ditemukan.
      </div>
    );
  }

  const formattedDate = new Date(inspection.date).toLocaleDateString('id-ID', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });


  return (
    <div className="max-w-4xl mx-auto p-4 space-y-6">
      {/* Action panel (Hidden when printing) */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white border border-gray-200 p-4 rounded-xl shadow-sm print:hidden">
        <button
          onClick={onClose}
          className="flex items-center space-x-1 text-gray-500 hover:text-gray-700 font-semibold text-sm cursor-pointer"
        >
          <ChevronLeft className="h-4 w-4" />
          <span>Kembali</span>
        </button>

        <div className="flex items-center space-x-2">
          {inspection.status === 'APPROVED' && (
            <a
              href={`/api/inspections/${inspection.id}/export`}
              className="flex items-center space-x-1.5 bg-green-700 hover:bg-green-800 text-white px-3 py-1.5 rounded-lg text-xs font-bold shadow-sm transition-all cursor-pointer"
            >
              <FileSpreadsheet className="h-4 w-4" />
              <span>Unduh Excel</span>
            </a>
          )}
          
          <button
            onClick={handlePrint}
            className="flex items-center space-x-1.5 bg-blue-700 hover:bg-blue-800 text-white px-3 py-1.5 rounded-lg text-xs font-bold shadow-sm transition-all cursor-pointer"
          >
            <Printer className="h-4 w-4" />
            <span>Cetak Laporan</span>
          </button>
        </div>
      </div>

      {/* Main Print Container */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden p-6 sm:p-8 space-y-6 print:border-none print:shadow-none print:p-0">
        
        {/* Printable Header */}
        <div className="text-center space-y-1 pb-4 border-b border-gray-300">
          <h2 className="font-extrabold text-blue-900 text-xl tracking-tight uppercase">
            LAPORAN CHECKLIST INSPEKSI AIRSIDE
          </h2>
          <p className="text-xs italic text-gray-500">
            Runway, Taxiway & Apron Inspection Report
          </p>
        </div>

        {/* Metadata section */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm bg-gray-50 p-4 rounded-lg print:bg-white print:p-0 print:border-b print:pb-4 print:rounded-none">
          <div className="space-y-2">
            <div className="flex">
              <span className="w-36 text-gray-500 font-medium">Tanggal Inspeksi</span>
              <span className="text-gray-800 font-semibold">: {formattedDate}</span>
            </div>
            <div className="flex">
              <span className="w-36 text-gray-500 font-medium">Shift Kerja</span>
              <span className="text-gray-800 font-semibold">
                : Shift {(() => {
                  if (!inspection.matrixResults) return '1';
                  if (typeof inspection.matrixResults === 'string') {
                    try {
                      return JSON.parse(inspection.matrixResults).shift || '1';
                    } catch {
                      return '1';
                    }
                  }
                  return (inspection.matrixResults as any).shift || '1';
                })()}
              </span>
            </div>
            <div className="flex">
              <span className="w-36 text-gray-500 font-medium">Petugas (Inspector)</span>
              <span className="text-gray-800 font-semibold">: {inspection.inspector.name}</span>
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex">
              <span className="w-36 text-gray-500 font-medium">Status Laporan</span>
              <span className={`font-bold uppercase ${
                inspection.status === 'APPROVED' ? 'text-green-700' : 'text-orange-600'
              }`}>
                : {inspection.status}
              </span>
            </div>
            <div className="flex">
              <span className="w-36 text-gray-500 font-medium">Penyelia (Supervisor)</span>
              <span className="text-gray-800 font-semibold">
                : {inspection.supervisor?.name || '-'}
              </span>
            </div>
          </div>
        </div>

        {/* Matrix Results (matches YIA worksheet layout) */}
        {inspection.matrixResults && Object.keys(inspection.matrixResults).length > 0 ? (
          <MatrixResultsTable inspection={inspection} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse border border-gray-300">
              <thead className="bg-blue-900 text-white font-bold uppercase text-[10px]">
                <tr>
                  <th className="border border-gray-300 px-3 py-2 text-center w-10">No</th>
                  <th className="border border-gray-300 px-3 py-2 text-center w-24">Zona</th>
                  <th className="border border-gray-300 px-3 py-2 w-36">Kategori</th>
                  <th className="border border-gray-300 px-3 py-2 w-52">Item Pemeriksaan</th>
                  <th className="border border-gray-300 px-3 py-2 text-center w-20">Status</th>
                  <th className="border border-gray-300 px-3 py-2">Catatan / Temuan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-300 text-gray-800">
                {inspection.details.map((detail, index) => (
                  <tr key={detail.id} className="hover:bg-gray-50/50">
                    <td className="border border-gray-300 px-3 py-2 text-center font-semibold">{index + 1}</td>
                    <td className="border border-gray-300 px-3 py-2 text-center font-bold text-[10px] text-blue-800">
                      {detail.item.zone}
                    </td>
                    <td className="border border-gray-300 px-3 py-2 text-gray-500 font-medium">{detail.item.category}</td>
                    <td className="border border-gray-300 px-3 py-2 font-semibold text-gray-700">{detail.item.name}</td>
                    <td className="border border-gray-300 px-2 py-1.5 text-center">
                      <span className={`inline-block w-full text-center px-1 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${
                        detail.status === 'S'
                          ? 'bg-green-100 text-green-800 border border-green-200'
                          : 'bg-red-100 text-red-800 border border-red-200'
                      }`}>
                        {detail.status}
                      </span>
                    </td>
                    <td className="border border-gray-300 px-3 py-2 font-medium text-gray-600">
                      {detail.remarks || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}


        {/* Signatures Section */}
        <div className="grid grid-cols-2 gap-8 pt-8 text-sm">
          {/* Left: Inspector */}
          <div className="flex flex-col items-center justify-between text-center space-y-4">
            <div>
              <p className="font-semibold text-gray-500 text-xs uppercase tracking-wide">Dibuat Oleh:</p>
              <p className="text-xs text-gray-400 mt-0.5">Petugas Lapangan (Inspector)</p>
            </div>
            
            <div className="h-20 flex items-center justify-center border-b border-gray-300 w-44">
              <span className="text-gray-400 text-xs italic font-medium">Draft/Submitted</span>
            </div>

            <p className="font-bold text-gray-800 underline underline-offset-4">{inspection.inspector.name}</p>
          </div>

          {/* Right: Supervisor */}
          <div className="flex flex-col items-center justify-between text-center space-y-4">
            <div>
              <p className="font-semibold text-gray-500 text-xs uppercase tracking-wide">Disetujui Oleh:</p>
              <p className="text-xs text-gray-400 mt-0.5">Penyelia (Supervisor)</p>
            </div>

            <div className="h-24 w-48 flex items-center justify-center relative">
              {inspection.status === 'APPROVED' && inspection.signature ? (
                // Display approved signature
                <img
                  src={inspection.signature}
                  alt="Supervisor Signature"
                  className="max-h-20 max-w-full object-contain"
                />
              ) : (
                // Display Canvas Signature Pad for Reviewer
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-50 border border-dashed border-gray-300 rounded p-1 print:hidden">
                  <canvas
                    ref={canvasRef}
                    onMouseDown={startDrawing}
                    onMouseMove={draw}
                    onMouseUp={stopDrawing}
                    onMouseLeave={stopDrawing}
                    onTouchStart={startDrawing}
                    onTouchMove={draw}
                    onTouchEnd={stopDrawing}
                    className="w-full h-20 bg-white border border-gray-200 cursor-crosshair rounded"
                  />
                  <div className="flex justify-between w-full mt-1.5 px-0.5">
                    <button
                      type="button"
                      onClick={clearCanvas}
                      className="flex items-center space-x-0.5 text-[9px] text-gray-500 hover:text-red-600 font-bold bg-white border border-gray-200 px-1 py-0.5 rounded cursor-pointer"
                    >
                      <Eraser className="h-2.5 w-2.5" />
                      <span>Hapus</span>
                    </button>
                    <span className="text-[8px] text-gray-400 self-center">Tanda tangan di atas</span>
                  </div>
                </div>
              )}
            </div>

            <p className="font-bold text-gray-800 underline underline-offset-4">
              {inspection.status === 'APPROVED' && inspection.supervisor
                ? inspection.supervisor.name
                : '( Belum Disetujui )'}
            </p>
          </div>
        </div>

        {/* Approval Submit Action (Print Hidden) */}
        {inspection.status === 'SUBMITTED' && (
          <div className="pt-6 border-t border-gray-200 flex justify-end print:hidden">
            <button
              type="button"
              onClick={handleApprove}
              disabled={submitting}
              className="flex items-center space-x-1.5 bg-blue-800 hover:bg-blue-900 text-white font-bold px-6 py-2.5 rounded-lg text-sm shadow disabled:bg-gray-400 disabled:cursor-not-allowed transition-all cursor-pointer"
            >
              <ShieldCheck className="h-4.5 w-4.5" />
              <span>{submitting ? 'Menyetujui...' : 'Setujui & Tandatangani'}</span>
            </button>
          </div>
        )}

      </div>

      {/* Global CSS Inject for Page Print Styling */}
      <style jsx global>{`
        @media print {
          body {
            background-color: white !important;
            color: black !important;
            font-size: 11px !important;
          }
          /* Hide everything except the main printable area */
          .print\\:hidden, 
          header, 
          nav, 
          button,
          a {
            display: none !important;
          }
          .print\\:border-none {
            border: none !important;
          }
          .print\\:shadow-none {
            box-shadow: none !important;
          }
          .print\\:p-0 {
            padding: 0 !important;
          }
          .print\\:pb-4 {
            padding-bottom: 1rem !important;
          }
          .print\\:bg-white {
            background-color: white !important;
          }
          .print\\:rounded-none {
            border-radius: 0 !important;
          }
          table {
            font-size: 10px !important;
            page-break-inside: auto;
          }
          tr {
            page-break-inside: avoid;
            page-break-after: auto;
          }
        }
      `}</style>
    </div>
  );
}

