'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Save, Layers, Upload, ZoomIn, ZoomOut, Eye, EyeOff, RotateCcw } from 'lucide-react';
import runwayGrid from '../../public/templates/runway_grid.json';
import ExcelJS from 'exceljs';

interface InspectorFormProps {
  onSuccess: () => void;
}

interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  rowIdx: number;
  colIdx: number;
  cell: any;
}

interface SignatureModalState {
  visible: boolean;
  cellAddress: string;
}

const COLS = ['A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','Q','R','S','T','U','V','W','X','Y','Z','AA','AB','AC','AD'];

export default function InspectorForm({ onSuccess }: InspectorFormProps) {
  const [zoom, setZoom] = useState<number>(75); // Default zoom out
  const [grid, setGrid] = useState<any[][]>(() => runwayGrid);
  const [activeCell, setActiveCell] = useState<string>('F7');
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    visible: false,
    x: 0,
    y: 0,
    rowIdx: -1,
    colIdx: -1,
    cell: null,
  });
  const [sigModal, setSigModal] = useState<SignatureModalState>({
    visible: false,
    cellAddress: '',
  });
  const [focusMode, setFocusMode] = useState<boolean>(false);

  const [matrixResults, setMatrixResults] = useState<Record<string, any>>(() => {
    const initial: Record<string, any> = {};
    const today = new Date();
    const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    initial['F7'] = days[today.getDay()];
    initial['F8'] = today.toISOString().substring(0, 10);
    initial['F9'] = today.toTimeString().substring(0, 5);
    initial['J8'] = '1';

    runwayGrid.forEach(row => {
      row.forEach((cell: any) => {
        if (cell.isEditable && cell.cellType === 'checkbox') {
          if (cell.value === true || cell.value === 'true') {
            initial[cell.address] = true;
          } else if (cell.value === false || cell.value === 'false') {
            initial[cell.address] = false;
          }
        }
      });
    });
    return initial;
  });

  useEffect(() => {
    const closeMenu = () => {
      setContextMenu(prev => ({ ...prev, visible: false }));
    };
    window.addEventListener('click', closeMenu);
    return () => window.removeEventListener('click', closeMenu);
  }, []);
  // Load grid layout from localStorage after mounting (browser-only)
  useEffect(() => {
    const saved = localStorage.getItem('xairside_runway_grid');
    if (saved) {
      try {
        setGrid(JSON.parse(saved));
      } catch (e) {
        console.error('Error loading custom grid template', e);
      }
    }
  }, []);

  // Save grid layout changes to localStorage whenever grid changes
  const isGridMounted = useRef(false);
  useEffect(() => {
    if (isGridMounted.current) {
      localStorage.setItem('xairside_runway_grid', JSON.stringify(grid));
    } else {
      isGridMounted.current = true;
    }
  }, [grid]);

  const handleResetGrid = () => {
    if (confirm('Apakah Anda yakin ingin menyetel ulang template spreadsheet ke bawaan pabrik/default? Semua tipe input kustom akan dikembalikan.')) {
      localStorage.removeItem('xairside_runway_grid');
      setGrid(runwayGrid);
    }
  };

  const handleToggleEditable = (rIdx: number, cIdx: number) => {
    setGrid(prevGrid => {
      return prevGrid.map((row, r) => {
        if (r !== rIdx) return row;
        return row.map((cell, c) => {
          if (c !== cIdx) return cell;
          const nextCell = { ...cell };
          nextCell.isEditable = !nextCell.isEditable;
          if (nextCell.isEditable && !nextCell.cellType) {
            nextCell.cellType = 'text';
          }
          return nextCell;
        });
      });
    });
  };

  const handleChangeCellType = (rIdx: number, cIdx: number, type: string) => {
    setGrid(prevGrid => {
      return prevGrid.map((row, r) => {
        if (r !== rIdx) return row;
        return row.map((cell, c) => {
          if (c !== cIdx) return cell;
          const nextCell = { ...cell };
          nextCell.cellType = type;
          return nextCell;
        });
      });
    });
  };

  const handleChangeCellOptions = (rIdx: number, cIdx: number, options: string[]) => {
    setGrid(prevGrid => {
      return prevGrid.map((row, r) => {
        if (r !== rIdx) return row;
        return row.map((cell, c) => {
          if (c !== cIdx) return cell;
          const nextCell = { ...cell };
          nextCell.options = options;
          return nextCell;
        });
      });
    });
  };
  const handleMergeCells = (rIdx: number, cIdx: number, newRowSpan: number, newColSpan: number) => {
    setGrid(prevGrid => {
      const targetCell = prevGrid[rIdx]?.[cIdx];
      if (!targetCell) return prevGrid;
      
      const oldRowSpan = targetCell.rowSpan || 1;
      const oldColSpan = targetCell.colSpan || 1;

      const nextGrid = prevGrid.map(row => row.map(cell => ({ ...cell })));

      for (let r = rIdx; r < rIdx + oldRowSpan; r++) {
        for (let c = cIdx; c < cIdx + oldColSpan; c++) {
          if (nextGrid[r]?.[c]) {
            nextGrid[r][c].isMerged = false;
            nextGrid[r][c].isMaster = false;
            nextGrid[r][c].rowSpan = 1;
            nextGrid[r][c].colSpan = 1;
          }
        }
      }

      if (newRowSpan > 1 || newColSpan > 1) {
        for (let r = rIdx; r < rIdx + newRowSpan; r++) {
          for (let c = cIdx; c < cIdx + newColSpan; c++) {
            if (nextGrid[r]?.[c]) {
              if (r === rIdx && c === cIdx) {
                nextGrid[r][c].isMerged = true;
                nextGrid[r][c].isMaster = true;
                nextGrid[r][c].rowSpan = newRowSpan;
                nextGrid[r][c].colSpan = newColSpan;
              } else {
                nextGrid[r][c].isMerged = true;
                nextGrid[r][c].isMaster = false;
                nextGrid[r][c].rowSpan = 1;
                nextGrid[r][c].colSpan = 1;
              }
            }
          }
        }
      }

      return nextGrid;
    });
  };
  const [isDrawing, setIsDrawing] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const contextRef = useRef<CanvasRenderingContext2D | null>(null);

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.strokeStyle = '#065f46'; // emerald-800
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    contextRef.current = ctx;
    setIsDrawing(true);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !contextRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    contextRef.current.lineTo(x, y);
    contextRef.current.stroke();
  };

  const stopDrawing = () => {
    if (!contextRef.current) return;
    contextRef.current.closePath();
    setIsDrawing(false);
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  const saveSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL('image/png');
    setMatrixResults(prev => ({
      ...prev,
      [sigModal.cellAddress]: dataUrl,
    }));
    setSigModal({ visible: false, cellAddress: '' });
  };

  const handleOpenSignature = (address: string) => {
    setSigModal({ visible: true, cellAddress: address });
    setTimeout(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.strokeStyle = '#065f46'; // emerald-800
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      contextRef.current = ctx;
    }, 150);
  };

  const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const arrayBuffer = evt.target?.result as ArrayBuffer;
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(arrayBuffer);
        
        let worksheet = workbook.getWorksheet('Runway');
        if (!worksheet) {
          worksheet = workbook.worksheets[0];
        }
        
        if (!worksheet) {
          alert('Lembar kerja tidak ditemukan di file Excel.');
          return;
        }

        const newResults = { ...matrixResults };
        let count = 0;

        grid.forEach(row => {
          row.forEach((cell: any) => {
            if (cell.isEditable) {
              const excelCell = worksheet!.getCell(cell.address);
              let val: any = excelCell.value;
              
              if (val && typeof val === 'object') {
                if ('result' in val) {
                  val = val.result;
                } else if ('richText' in val && Array.isArray(val.richText)) {
                  val = val.richText.map((t: any) => t.text || '').join('');
                } else if ('text' in val) {
                  val = val.text;
                }
              }

              if (val !== undefined && val !== null) {
                if (cell.cellType === 'checkbox') {
                  const valStr = String(val).toLowerCase().trim();
                  const isChecked = val === true || val === 1 || ['✓', '✔', 's', 'true', '1', 'yes'].includes(valStr);
                  newResults[cell.address] = isChecked;
                } else {
                  newResults[cell.address] = String(val);
                }
                count++;
              }
            }
          });
        });

        setMatrixResults(newResults);
        alert(`Berhasil mengimpor ${count} data dari file Excel!`);
      } catch (err) {
        console.error(err);
        alert('Gagal membaca file Excel. Pastikan file dalam format .xlsx yang valid.');
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  };

  const [submitting, setSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const dateVal = matrixResults['F8'] || new Date().toISOString().substring(0, 10);
      const timeVal = matrixResults['F9'] || new Date().toTimeString().substring(0, 5);
      const inspectionDateTime = new Date(`${dateVal}T${timeVal}`);
      const body = {
        date: inspectionDateTime.toISOString(),
        matrixResults,
      };
      const res = await fetch('/api/inspections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setSubmitSuccess(true);
        setTimeout(() => {
          setSubmitSuccess(false);
          onSuccess();
        }, 1500);
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

  const renderCellInput = (cell: any) => {
    if (cell.cellType === 'checkbox') {
      const isChecked = !!matrixResults[cell.address];
      return (
        <div
          onClick={() => {
            setActiveCell(cell.address);
            setMatrixResults(prev => ({
              ...prev,
              [cell.address]: !isChecked
            }));
          }}
          className="w-full h-full min-h-6 flex items-center justify-center cursor-pointer select-none font-bold text-emerald-800 bg-white hover:bg-gray-100 transition-colors"
        >
          {isChecked ? '✓' : ''}
        </div>
      );
    }
    if (cell.cellType === 'date') {
      return (
        <input
          type="date"
          value={matrixResults[cell.address] || ''}
          onFocus={() => setActiveCell(cell.address)}
          onChange={(e) => setMatrixResults(prev => ({ ...prev, [cell.address]: e.target.value }))}
          className="w-full h-full bg-transparent border-none outline-none font-sans text-xs px-1 text-gray-800 font-bold"
        />
      );
    }
    if (cell.cellType === 'time') {
      return (
        <input
          type="time"
          value={matrixResults[cell.address] || ''}
          onFocus={() => setActiveCell(cell.address)}
          onChange={(e) => setMatrixResults(prev => ({ ...prev, [cell.address]: e.target.value }))}
          className="w-full h-full bg-transparent border-none outline-none font-sans text-xs px-1 text-gray-800 font-bold"
        />
      );
    }
    if (cell.cellType === 'select') {
      const opts = cell.options && cell.options.length > 0 ? cell.options : ['1', '2', '3'];
      return (
        <select
          value={matrixResults[cell.address] || opts[0]}
          onFocus={() => setActiveCell(cell.address)}
          onChange={(e) => setMatrixResults(prev => ({ ...prev, [cell.address]: e.target.value }))}
          className="w-full h-full bg-transparent border-none outline-none font-sans text-xs text-gray-800 font-bold"
        >
          {opts.map((opt: string) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      );
    }
    if (cell.cellType === 'number') {
      return (
        <input
          type="number"
          value={matrixResults[cell.address] ?? ''}
          onFocus={() => setActiveCell(cell.address)}
          onChange={(e) => setMatrixResults(prev => ({ ...prev, [cell.address]: e.target.value }))}
          className="w-full h-full bg-transparent border-none outline-none font-mono text-[11px] px-1 text-gray-800 font-bold"
        />
      );
    }
    if (cell.cellType === 'signature') {
      const sigData = matrixResults[cell.address];
      return (
        <div
          onClick={() => handleOpenSignature(cell.address)}
          className="absolute inset-0 w-full h-full flex flex-col items-center justify-center cursor-pointer select-none bg-white hover:bg-gray-100 transition-colors p-0.5"
        >
          {sigData ? (
            <img src={sigData} alt="Signature" className="w-full h-full max-h-full object-contain p-1" />
          ) : (
            <span className="text-[9px] text-gray-400 italic">Klik TTD</span>
          )}
        </div>
      );
    }
    const cellValStr = typeof cell.value === 'string' ? cell.value : String(cell.value ?? '');
    const val = matrixResults[cell.address] ?? (cellValStr.startsWith('<<') ? '' : cell.value);
    const placeholder = cellValStr.startsWith('<<') ? cellValStr.slice(2, -2) : '';
    return (
      <input
        type="text"
        value={val}
        placeholder={placeholder}
        onFocus={() => setActiveCell(cell.address)}
        onChange={(e) => setMatrixResults(prev => ({ ...prev, [cell.address]: e.target.value }))}
        className="w-full h-full bg-transparent border-none outline-none font-mono text-[11px] px-1 text-gray-800"
      />
    );
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-7xl mx-auto px-4">
      {submitSuccess && (
        <div className="rounded-lg bg-green-50 border border-green-300 text-green-800 px-4 py-3 text-sm font-semibold text-center">
          Laporan berhasil dikirim! Mengalihkan ke dashboard supervisor...
        </div>
      )}
      <div className="bg-gray-100 border border-gray-300 rounded-xl overflow-hidden shadow-md">
        <div className="bg-emerald-800 text-white px-4 py-2.5 flex items-center justify-between font-sans text-xs select-none">
          <div className="flex items-center space-x-3">
            <span className="font-bold tracking-wide">X-Airside Excel Sheet Editor</span>
            <span className="text-emerald-300">|</span>
            <span className="text-emerald-200 text-[11px]">Template: runway.xlsx</span>
          </div>
          <div className="flex items-center space-x-3">
            {/* Zoom Controls */}
            <div className="flex items-center space-x-1 bg-emerald-700/60 text-white px-2 py-1 rounded border border-emerald-500 text-[10px] font-semibold select-none">
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

            {/* Focus Mode Button */}
            <button
              type="button"
              onClick={() => setFocusMode(!focusMode)}
              className={`flex items-center space-x-1.5 font-semibold px-2.5 py-1 rounded cursor-pointer transition-all duration-150 text-[10px] border ${
                focusMode 
                  ? 'bg-amber-500 hover:bg-amber-600 text-gray-900 border-amber-400 font-bold animate-pulse hover:animate-none' 
                  : 'bg-emerald-700/60 hover:bg-emerald-700/80 text-white border-emerald-500'
              }`}
              title="Fokuskan hanya kolom yang wajib diisi"
            >
              {focusMode ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
              <span>{focusMode ? 'Mode Normal' : 'Mode Fokus'}</span>
            </button>
            {/* Reset Grid Layout Button */}
            <button
              type="button"
              onClick={handleResetGrid}
              className="flex items-center space-x-1.5 bg-rose-700/60 hover:bg-rose-700/80 text-white border border-rose-500 font-semibold px-2.5 py-1 rounded cursor-pointer transition-all duration-150 text-[10px]"
              title="Kembalikan tata letak spreadsheet ke setelan awal"
            >
              <RotateCcw className="h-3 w-3" />
              <span>Reset Template</span>
            </button>

            <label className="flex items-center space-x-1.5 bg-emerald-700/60 hover:bg-emerald-700/80 text-white border border-emerald-500 font-semibold px-2.5 py-1 rounded cursor-pointer transition-all duration-150 text-[10px]">
              <Upload className="h-3 w-3" />
              <span>Import (.xlsx)</span>
              <input
                type="file"
                accept=".xlsx"
                onChange={handleImportExcel}
                className="hidden"
              />
            </label>
            <div className="flex items-center space-x-2 text-[10px] bg-emerald-700/60 px-2 py-1 rounded border border-emerald-600">
              <Layers className="h-3 w-3" />
              <span>Lembar Aktif: Runway</span>
            </div>
          </div>
        </div>

        {/* Formula Bar */}
        <div className="bg-white border-b border-gray-200 px-3 py-1.5 flex items-center space-x-2 text-xs font-mono text-gray-500 select-none">
          <div className="bg-emerald-50 text-emerald-800 px-2.5 py-0.5 border border-emerald-200 rounded font-bold select-none text-[11px]">
            {activeCell}
          </div>
          <div className="bg-gray-100 px-2 py-0.5 border border-gray-300 rounded text-gray-600 font-bold select-none">
            fx
          </div>
          <input
            type="text"
            value={matrixResults[activeCell] ?? ''}
            onChange={(e) => setMatrixResults(prev => ({ ...prev, [activeCell]: e.target.value }))}
            placeholder={`Isi nilai untuk sel ${activeCell}...`}
            className="flex-1 bg-white px-2 py-0.5 border border-gray-300 rounded text-gray-800 outline-none text-[11px] focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600"
          />
        </div>

        {/* Spreadsheet Table with Sticky Header/Columns */}
        <div className="overflow-auto max-h-[650px] w-full relative" style={{ zoom: `${zoom}%` }}>
          <table className="min-w-[1500px] border-collapse bg-white font-mono text-xs w-full text-gray-800 border border-gray-300">
            <thead>
              <tr className="bg-gray-100 text-gray-500 text-center select-none text-[10px] h-6">
                <th className={`sticky top-0 left-0 border w-8 z-30 font-bold text-center transition-all duration-150 ${
                  focusMode 
                    ? 'bg-gray-950 border-gray-900 opacity-30 text-gray-700' 
                    : 'bg-gray-200 border-r border-b border-gray-300'
                }`}></th>
                {COLS.map((col) => (
                  <th
                    key={col}
                    className={`sticky top-0 border font-semibold min-w-16 text-center z-20 transition-all duration-150 ${
                      focusMode 
                        ? 'bg-gray-950 border-gray-900 text-gray-700 opacity-30' 
                        : 'bg-gray-100 border-gray-300 text-gray-500'
                    }`}
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grid.map((row, rIdx) => (
                <tr key={rIdx} className="h-7 hover:bg-gray-50/50">
                  <td className={`sticky left-0 border text-center font-bold select-none text-[9px] w-8 z-10 transition-all duration-150 ${
                    focusMode 
                      ? 'bg-gray-950 border-gray-900 text-gray-700 opacity-30' 
                      : 'bg-gray-150 border-gray-300 text-gray-500'
                  }`}>
                    {rIdx + 1}
                  </td>
                  {row.map((cell, cIdx) => {
                    if (cell.isMerged && !cell.isMaster) {
                      return null;
                    }
                    const isCellFocused = activeCell === cell.address;
                    
                    let cellStyle: React.CSSProperties = {
                      backgroundColor: cell.style.bgColor ? '#' + cell.style.bgColor.slice(2) : undefined,
                      fontWeight: cell.style.isBold ? 'bold' : 'normal',
                      fontStyle: cell.style.isItalic ? 'italic' : 'normal',
                      fontSize: `${cell.style.fontSize}px`,
                      color: cell.style.fontColor ? '#' + cell.style.fontColor.slice(2) : undefined,
                      textAlign: cell.style.alignH === 'left' ? 'left' : cell.style.alignH === 'center' ? 'center' : cell.style.alignH === 'right' ? 'right' : 'left',
                      verticalAlign: cell.style.alignV === 'middle' ? 'middle' : cell.style.alignV === 'top' ? 'top' : cell.style.alignV === 'bottom' ? 'bottom' : 'middle',
                    };

                    let cellClassName = `border border-gray-300 px-1 py-0.5 relative transition-all ${
                      isCellFocused ? 'ring-2 ring-emerald-600 ring-inset bg-emerald-50/20 z-10' : ''
                    }`;

                    if (focusMode) {
                      if (!cell.isEditable) {
                        cellStyle = {
                          ...cellStyle,
                          backgroundColor: '#111827', // Gray-900
                          color: '#4b5563', // Dark text gray-600
                          opacity: 0.15,
                        };
                        cellClassName = `border border-gray-800 px-1 py-0.5 relative transition-all`;
                      } else {
                        cellStyle = {
                          ...cellStyle,
                          backgroundColor: '#ffffff', // Bright white
                          color: '#000000',
                          opacity: 1,
                        };
                        cellClassName = `border-2 border-emerald-500 px-1 py-0.5 relative transition-all bg-white z-10 shadow-[0_0_12px_rgba(16,185,129,0.8)] ${
                          isCellFocused ? 'ring-2 ring-amber-500 ring-inset' : ''
                        }`;
                      }
                    }

                    return (
                      <td
                        key={cIdx}
                        rowSpan={cell.rowSpan > 1 ? cell.rowSpan : undefined}
                        colSpan={cell.colSpan > 1 ? cell.colSpan : undefined}
                        style={cellStyle}
                        className={cellClassName}
                        onClick={() => setActiveCell(cell.address)}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          setContextMenu({
                            visible: true,
                            x: e.clientX,
                            y: e.clientY,
                            rowIdx: rIdx,
                            colIdx: cIdx,
                            cell: cell,
                          });
                        }}
                      >
                        {cell.isEditable ? renderCellInput(cell) : cell.value}
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
      <div className="flex justify-end pr-2 print:hidden">
        <button
          type="submit"
          disabled={submitting}
          className="flex items-center space-x-2 bg-emerald-800 hover:bg-emerald-900 text-white font-bold px-6 py-3 rounded-xl shadow-lg hover:shadow-xl transition-all duration-150 cursor-pointer disabled:opacity-50 text-sm"
        >
          <Save className="h-4 w-4" />
          <span>{submitting ? 'Mengirimkan...' : 'Kirim Laporan Inspeksi'}</span>
        </button>
      </div>
      {/* Context Menu */}
      {contextMenu.visible && (
        <div
          style={{ top: contextMenu.y, left: contextMenu.x }}
          className="fixed bg-white border border-gray-300 rounded-lg shadow-xl py-1 z-50 text-xs font-sans w-52 text-gray-800"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-3 py-1 border-b border-gray-150 font-bold text-gray-500 bg-gray-50 flex justify-between items-center text-[10px]">
            <span>Sel {contextMenu.cell?.address}</span>
            <span className={`px-1.5 py-0.5 rounded text-[9px] font-semibold ${
              contextMenu.cell?.isEditable ? 'text-emerald-700 bg-emerald-50' : 'text-gray-600 bg-gray-100'
            }`}>
              {contextMenu.cell?.isEditable ? 'Bisa Diisi' : 'Terkunci'}
            </span>
          </div>
          
          <button
            type="button"
            onClick={() => {
              handleToggleEditable(contextMenu.rowIdx, contextMenu.colIdx);
              setContextMenu(prev => ({ ...prev, visible: false }));
            }}
            className="w-full text-left px-3 py-1.5 hover:bg-gray-100 flex items-center justify-between"
          >
            <span>Ubah Akses Input</span>
            <span className="text-[9px] text-gray-400 font-bold">
              {contextMenu.cell?.isEditable ? 'Kunci Sel' : 'Jadikan Input'}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              const currentVal = `${contextMenu.cell?.rowSpan || 1}x${contextMenu.cell?.colSpan || 1}`;
              const input = prompt(
                "Gabungkan Sel (Merge Cell):\nMasukkan format: [baris]x[kolom] (contoh: 2x3 untuk 2 baris & 3 kolom, atau 1x1 untuk batal merge/memisah)",
                currentVal
              );
              if (input !== null) {
                const parts = input.toLowerCase().split('x').map(s => parseInt(s.trim()));
                const rs = isNaN(parts[0]) ? 1 : Math.max(1, parts[0]);
                const cs = isNaN(parts[1]) ? 1 : Math.max(1, parts[1]);
                handleMergeCells(contextMenu.rowIdx, contextMenu.colIdx, rs, cs);
              }
              setContextMenu(prev => ({ ...prev, visible: false }));
            }}
            className="w-full text-left px-3 py-1.5 hover:bg-gray-100 flex items-center justify-between border-t border-gray-100"
          >
            <span>Gabungkan Sel (Merge)</span>
            <span className="text-[9px] text-gray-400 font-bold">
              {contextMenu.cell && (contextMenu.cell.rowSpan > 1 || contextMenu.cell.colSpan > 1)
                ? `${contextMenu.cell.rowSpan}x${contextMenu.cell.colSpan}`
                : '1x1'}
            </span>
          </button>
          
          {contextMenu.cell?.isEditable && (
            <>
              <div className="border-t border-gray-150 my-1"></div>
              <div className="px-3 py-0.5 text-[9px] font-bold text-gray-400 uppercase tracking-wider">Tipe Inputan:</div>
              
              {[
                { type: 'text', label: 'Teks (Text)' },
                { type: 'number', label: 'Angka (Number)' },
                { type: 'date', label: 'Tanggal (Date)' },
                { type: 'time', label: 'Waktu (Time)' },
                { type: 'select', label: 'Pilihan (Dropdown)' },
                { type: 'checkbox', label: 'Centang (Checkbox)' },
                { type: 'signature', label: 'Tanda Tangan (Signature)' },
              ].map((opt) => (
                <button
                  key={opt.type}
                  type="button"
                  onClick={() => {
                    handleChangeCellType(contextMenu.rowIdx, contextMenu.colIdx, opt.type);
                    setContextMenu(prev => ({ ...prev, visible: false }));
                  }}
                  className={`w-full text-left px-4 py-1.5 hover:bg-gray-100 flex items-center justify-between text-[11px] ${
                    contextMenu.cell?.cellType === opt.type ? 'text-emerald-800 font-bold bg-emerald-50/50' : ''
                  }`}
                >
                  <span>{opt.label}</span>
                  {contextMenu.cell?.cellType === opt.type && <span className="text-emerald-700 font-bold">✓</span>}
                </button>
              ))}

              {contextMenu.cell?.cellType === 'select' && (
                <>
                  <div className="border-t border-gray-150 my-1"></div>
                  <button
                    type="button"
                    onClick={() => {
                      const currentOpts = contextMenu.cell?.options?.join(', ') || '1, 2, 3';
                      const inputVal = prompt('Masukkan daftar pilihan (pisahkan dengan koma):', currentOpts);
                      if (inputVal !== null) {
                        const parsedOpts = inputVal.split(',').map((o: string) => o.trim()).filter(Boolean);
                        handleChangeCellOptions(contextMenu.rowIdx, contextMenu.colIdx, parsedOpts);
                      }
                      setContextMenu(prev => ({ ...prev, visible: false }));
                    }}
                    className="w-full text-left px-4 py-1.5 hover:bg-amber-50 text-amber-800 font-semibold flex items-center justify-between text-[11px]"
                  >
                    <span>⚙ Edit Opsi Dropdown...</span>
                  </button>
                </>
              )}
            </>
          )}
        </div>
      )}

      {/* Signature Modal */}
      {sigModal.visible && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setSigModal({ visible: false, cellAddress: '' })}>
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center border-b border-gray-250 pb-2">
              <h3 className="font-bold text-gray-800 text-sm">Gambarkan Tanda Tangan ({sigModal.cellAddress})</h3>
              <button
                type="button"
                onClick={() => setSigModal({ visible: false, cellAddress: '' })}
                className="text-gray-400 hover:text-gray-600 font-bold text-sm"
              >
                ✕
              </button>
            </div>
            
            <div className="border-2 border-dashed border-emerald-300 rounded-xl overflow-hidden bg-gray-50 flex items-center justify-center">
              <canvas
                ref={canvasRef}
                width={380}
                height={200}
                onMouseDown={startDrawing}
                onMouseMove={draw}
                onMouseUp={stopDrawing}
                onMouseLeave={stopDrawing}
                className="cursor-crosshair bg-white w-full h-[200px]"
              />
            </div>

            <div className="flex justify-between space-x-2">
              <button
                type="button"
                onClick={clearCanvas}
                className="bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold px-4 py-2 rounded-lg text-xs"
              >
                Bersihkan
              </button>
              <div className="flex space-x-2">
                <button
                  type="button"
                  onClick={() => setSigModal({ visible: false, cellAddress: '' })}
                  className="bg-gray-100 hover:bg-gray-250 text-gray-600 font-semibold px-4 py-2 rounded-lg text-xs"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={saveSignature}
                  className="bg-emerald-800 hover:bg-emerald-900 text-white font-bold px-4 py-2 rounded-lg text-xs shadow animate-pulse hover:animate-none"
                >
                  Simpan TTD
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </form>
  );
}
