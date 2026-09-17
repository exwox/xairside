import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { UserOptions } from 'jspdf-autotable';
import { pciRating } from './pci';
import type { PciCalculationRow } from './pci-calculation-table';
import type { PciFacilityTable } from './pci-location-table';

/* -------------------------------------------------------------------------- */
/*  Constants                                                                 */
/* -------------------------------------------------------------------------- */

const A4_W = 210;
const MARGIN = 14;
const CONTENT_W = A4_W - MARGIN * 2;

interface PciCategory {
  label: string;
  min: number;
  color: string;
}

const PCI_CATEGORIES: PciCategory[] = [
  { label: 'Excellent', min: 86, color: '#15803d' },
  { label: 'Very Good', min: 71, color: '#22c55e' },
  { label: 'Good', min: 56, color: '#84cc16' },
  { label: 'Fair', min: 41, color: '#eab308' },
  { label: 'Poor', min: 26, color: '#f97316' },
  { label: 'Very Poor', min: 11, color: '#ef4444' },
  { label: 'Failed', min: 0, color: '#7f1d1d' },
];

const C = {
  navy: '#0c4a6e', ink: '#0f172a', sky: '#38bdf8',
  skyLight: '#7dd3fc', skyPale: '#bae6fd', accent: '#0ea5e9',
  slate: '#64748b', slateMid: '#475569', muted: '#94a3b8',
  line: '#cbd5e1', faint: '#e2e8f0', snow: '#f8fafc',
  snowAlt: '#f1f5f9', white: '#ffffff',
  unsupported: '#f59e0b', unsupportedBg: '#fef3c7', unsupportedText: '#92400e',
  average: '#0284c7',
} as const;

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function setFill(doc: jsPDF, hex: string): void { doc.setFillColor(...hexToRgb(hex)); }
function setStroke(doc: jsPDF, hex: string): void { doc.setDrawColor(...hexToRgb(hex)); }
function setText(doc: jsPDF, hex: string): void { doc.setTextColor(...hexToRgb(hex)); }
function clamp(v: number, lo: number, hi: number): number { return Math.min(hi, Math.max(lo, v)); }

function formatDecimal(value: number | null | undefined, places = 2): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return value.toLocaleString('id-ID', { minimumFractionDigits: places, maximumFractionDigits: places });
}

function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

function textOnColor(hex: string): string { return luminance(hex) >= 0.5 ? C.ink : C.white; }

const DATE_FMT = new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
const TIME_FMT = new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit' });

function formatDateTime(d: Date): string {
  return `${DATE_FMT.format(d)} pukul ${TIME_FMT.format(d)}`;
}

function surfaceLabel(surface: string | null): string {
  if (surface === 'CONCRETE') return 'Rigit (JPCP)';
  if (surface === 'ASPHALT') return 'Fleksibel (Aspal)';
  return 'Belum diatur';
}

function typeLabel(type: string | null): string {
  if (type === 'RUNWAY') return 'Runway';
  if (type === 'TAXIWAY') return 'Taxiway';
  if (type === 'APRON') return 'Apron';
  return type ?? '—';
}

/* -------------------------------------------------------------------------- */
/*  Public interfaces                                                         */
/* -------------------------------------------------------------------------- */

export interface PciPdfTableRow {
  no: number;
  location: string;
  areaSqm: string;
  pci: string;
  status: string;
  statusFill: string;
  statusText: string;
  iterationCount: number;
  [key: string]: string | number;
}

export function buildPciPdfTableRows(
  table: PciFacilityTable,
  calculations: PciCalculationRow[],
): PciPdfTableRow[] {
  return table.rows.map((row, index) => {
    const calc = calculations[index];
    const state = calc?.state ?? 'unassessed';
    let status = 'Excellent';
    let statusFill: string = pciRating(100).color;
    let statusText: string = textOnColor(statusFill);
    if (state === 'calculated' && calc.rating) {
      status = calc.rating.label;
      statusFill = calc.rating.color;
      statusText = textOnColor(calc.rating.color);
    } else if (state === 'unsupported') {
      status = 'Belum dapat dihitung';
      statusFill = C.unsupportedBg;
      statusText = C.unsupportedText;
    }
    const pci = state === 'unsupported' || calc == null ? '—' : formatDecimal(calc.pci, 2);
    return {
      no: index + 1,
      location: row.label,
      areaSqm: formatDecimal(row.areaSqm, 1),
      pci,
      status,
      statusFill,
      statusText,
      iterationCount: state === 'calculated' ? calc.iterations.length : 0,
    };
  });
}

export interface PciPdfDetailRow {
  no: string;
  location: string;
  damageType: string;
  damageCode: string;
  severity: string;
  volume: string;
  density: string;
  deductValue: string;
  sortedDeductValue: string;
  allowableDeducts: string;
  totalQ: string;
  q: string;
  totalDv: string;
  cdv: string;
  maxCdv: string;
  pci: string;
  status: string;
  statusFill: string;
  statusText: string;
  groupIndex: number;
  firstInGroup: boolean;
  [key: string]: string | number | boolean;
}

function calculationStatus(calculation: PciCalculationRow | undefined): {
  label: string;
  fill: string;
  text: string;
} {
  if (calculation?.state === 'calculated' && calculation.rating) {
    return {
      label: calculation.rating.label,
      fill: calculation.rating.color,
      text: textOnColor(calculation.rating.color),
    };
  }
  if (calculation?.state === 'unsupported') {
    return { label: 'Belum dapat dihitung', fill: C.unsupportedBg, text: C.unsupportedText };
  }
  const color = pciRating(100).color;
  return { label: 'Excellent', fill: color, text: textOnColor(color) };
}

/**
 * Builds the same row expansion used by the on-screen PCI calculation table.
 * A location can have more calculation lines than CDV iterations (or the
 * reverse), so the larger collection determines how many PDF rows it needs.
 * The location identity is repeated so a continuation at the top of a new PDF
 * page never loses its STA/SAMPEL context.
 */
export function buildPciPdfDetailRows(
  table: PciFacilityTable,
  calculations: PciCalculationRow[],
): PciPdfDetailRow[] {
  return table.rows.flatMap((location, groupIndex) => {
    const calculation = calculations[groupIndex];
    const lines = calculation?.lines ?? [];
    const iterations = calculation?.iterations ?? [];
    const rowCount = Math.max(1, lines.length, iterations.length);
    const status = calculationStatus(calculation);
    const totalQ = calculation?.sortedDvs.filter((value) => value >= 5).length ?? 0;
    const locationMeta = [
      `Unit ${formatDecimal(location.areaSqm, 1)} m²`,
      location.slabCount ? `${location.slabCount} slab` : null,
      calculation && calculation.closedFindingCount > 0
        ? `${calculation.closedFindingCount} selesai`
        : null,
    ].filter((part): part is string => part != null).join(' · ');

    return Array.from({ length: rowCount }, (_, rowIndex) => {
      const firstInGroup = rowIndex === 0;
      const line = lines[rowIndex];
      const iteration = iterations[rowIndex];
      const detail: PciPdfDetailRow = {
        no: String(groupIndex + 1),
        location: firstInGroup ? `${location.label}\n${locationMeta}` : location.label,
        damageType: line?.type ?? (firstInGroup ? 'Belum ada kerusakan aktif' : ''),
        damageCode: line?.code ?? '—',
        severity: line?.severity ?? '—',
        volume: line
          ? `${formatDecimal(line.volume)} ${line.unit ?? ''}`.trim()
          : '—',
        density: line?.density == null ? '—' : `${formatDecimal(line.density, 3)}%`,
        deductValue: formatDecimal(line?.dv, 1),
        sortedDeductValue: formatDecimal(calculation?.sortedDvs[rowIndex], 1),
        allowableDeducts: firstInGroup ? formatDecimal(calculation?.allowableDeducts, 2) : '—',
        totalQ: firstInGroup && calculation?.state === 'calculated' ? String(totalQ) : '—',
        q: iteration ? String(iteration.q) : '—',
        totalDv: formatDecimal(iteration?.totalDv, 1),
        cdv: formatDecimal(iteration?.cdv, 1),
        maxCdv: firstInGroup ? formatDecimal(calculation?.maxCdv, 2) : '—',
        pci: firstInGroup ? formatDecimal(calculation?.pci, 2) : '—',
        status: firstInGroup ? status.label : '',
        statusFill: status.fill,
        statusText: status.text,
        groupIndex,
        firstInGroup,
      };

      for (let index = 0; index < 10; index += 1) {
        detail[`dv-${index + 1}`] = formatDecimal(iteration?.deductValues[index], 1);
      }
      return detail;
    });
  });
}

export interface PciPdfOptions {
  table: PciFacilityTable;
  calculations: PciCalculationRow[];
  pciCorrection: number;
  pciAverage?: number | null;
  generatedAt?: Date;
  airportName?: string;
}

/* -------------------------------------------------------------------------- */
/*  Summary helpers                                                           */
/* -------------------------------------------------------------------------- */

function computeAverage(calculations: PciCalculationRow[], fallback?: number | null): number | null {
  if (fallback != null && Number.isFinite(fallback)) return fallback;
  if (calculations.length === 0) return null;
  return calculations.reduce((s, c) => s + (Number.isFinite(c.pci) ? c.pci : 0), 0) / calculations.length;
}

function computeSummary(calculations: PciCalculationRow[]) {
  const calculated = calculations.filter((r) => r.state === 'calculated').length;
  const unsupported = calculations.filter((r) => r.state === 'unsupported').length;
  const unassessed = calculations.filter((r) => r.state === 'unassessed').length;
  const scored = calculations.filter((r) => r.state !== 'unsupported' && Number.isFinite(r.pci));
  const minPci = scored.length ? Math.min(...scored.map((r) => r.pci)) : null;
  const maxPci = scored.length ? Math.max(...scored.map((r) => r.pci)) : null;
  return { calculated, unsupported, unassessed, minPci, maxPci };
}

/* -------------------------------------------------------------------------- */
/*  Drawing primitives                                                        */
/* -------------------------------------------------------------------------- */

function drawStatCard(
  doc: jsPDF, x: number, y: number, w: number, h: number,
  label: string, value: string, sub?: string,
  pill?: { label: string; color: string } | null,
): void {
  setFill(doc, C.snow);
  setStroke(doc, C.faint);
  doc.setLineWidth(0.3);
  doc.roundedRect(x, y, w, h, 1.6, 1.6, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(5.8);
  setText(doc, C.slate);
  doc.text(label, x + 3, y + 5);
  doc.setFontSize(13);
  setText(doc, C.ink);
  doc.text(value, x + 3, y + 11.5);
  if (pill) {
    doc.setFontSize(5.6);
    const pillW = doc.getTextWidth(pill.label) + 3.4;
    const pillX = x + 3;
    if (pillW < w - 6) {
      setFill(doc, pill.color);
      doc.roundedRect(pillX, y + 12.7, pillW, 3.2, 0.8, 0.8, 'F');
      setText(doc, textOnColor(pill.color));
      doc.text(pill.label, pillX + 1.7, y + 15);
    }
  }
  if (sub) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5.6);
    setText(doc, C.muted);
    doc.text(sub, x + 3, y + h - 2.4);
  }
}

/* -------------------------------------------------------------------------- */
/*  Page 1 — header, facility info, summary, chart                            */
/* -------------------------------------------------------------------------- */

function drawPageHeader(doc: jsPDF, table: PciFacilityTable, airportName?: string): void {
  setFill(doc, C.navy);
  doc.rect(0, 0, A4_W, 26, 'F');
  setFill(doc, C.sky);
  doc.rect(0, 26, A4_W, 0.9, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  setText(doc, C.skyLight);
  doc.text(`X-AIRSIDE MONITORING${airportName ? ` - ${airportName}` : ''}`, MARGIN, 9);

  doc.setFontSize(15.5);
  setText(doc, C.white);
  doc.text('LAPORAN INDEKS KONDISI PERKERASAN (PCI)', MARGIN, 16);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  setText(doc, C.skyPale);
  doc.text(`Dokumen resmi perhitungan PCI per ${table.mode} — Metode Standard Airfield PCI`, MARGIN, 21.5);

  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  setText(doc, C.white);
  doc.text(table.facility.code, A4_W - MARGIN, 15, { align: 'right' });
}

function drawFacilityInfo(doc: jsPDF, table: PciFacilityTable, generatedAt: Date): void {
  const f = table.facility;
  let y = 34;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  setText(doc, C.ink);
  doc.text(`${f.code} — ${f.name || f.code}`, MARGIN, y);
  setText(doc, C.slate);
  doc.setFontSize(7);
  doc.text(`Mode lokasi: ${table.mode === 'SAM' ? 'Sample Unit (SAM)' : 'Station (STA)'}`, A4_W - MARGIN, y, { align: 'right' });

  y += 5.5;
  const parts: string[] = [
    `Jenis: ${typeLabel(f.type)}`,
    `Permukaan: ${surfaceLabel(f.surfaceType)}`,
  ];
  if (Number.isFinite(f.lengthM) && (f.lengthM ?? 0) > 0) parts.push(`Panjang ${formatDecimal(f.lengthM, 0)} m`);
  if (Number.isFinite(f.widthM) && (f.widthM ?? 0) > 0) parts.push(`Lebar ${formatDecimal(f.widthM, 0)} m`);
  if (Number.isFinite(f.areaSqm) && (f.areaSqm ?? 0) > 0) parts.push(`Luas ${formatDecimal(f.areaSqm, 0)} m²`);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  setText(doc, C.slateMid);
  doc.text(parts.join('   ·   '), MARGIN, y);
  doc.setFontSize(6.8);
  setText(doc, C.muted);
  doc.text(`Dicetak: ${formatDateTime(generatedAt)}`, A4_W - MARGIN, y, { align: 'right' });

  y += 3.5;
  setStroke(doc, C.faint);
  doc.setLineWidth(0.4);
  doc.line(MARGIN, y, A4_W - MARGIN, y);
}

function drawSummary(
  doc: jsPDF, table: PciFacilityTable,
  calculations: PciCalculationRow[], pciCorrection: number,
  pciAverage: number | null, y: number,
): void {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  setText(doc, C.ink);
  doc.text('RINGKASAN PCI', MARGIN, y);
  setStroke(doc, C.sky);
  doc.setLineWidth(0.7);
  doc.line(MARGIN, y + 1.2, 30, y + 1.2);

  const summary = computeSummary(calculations);
  const cardY = y + 4, cardH = 17, gap = 3;
  const cardW = (CONTENT_W - gap * 3) / 4;
  const rating = pciAverage != null ? pciRating(pciAverage) : null;

  drawStatCard(doc, MARGIN, cardY, cardW, cardH,
    'RATA-RATA PCI', pciAverage == null ? '—' : formatDecimal(pciAverage, 1),
    undefined, rating ? { label: rating.label, color: rating.color } : null);
  drawStatCard(doc, MARGIN + cardW + gap, cardY, cardW, cardH,
    'JUMLAH LOKASI', String(table.rows.length),
    `${summary.calculated} terhitung · ${summary.unassessed} belum dinilai`);
  drawStatCard(doc, MARGIN + (cardW + gap) * 2, cardY, cardW, cardH,
    'PCI TERENDAH', summary.minPci == null ? '—' : formatDecimal(summary.minPci, 1),
    summary.unsupported > 0 ? `${summary.unsupported} belum dapat dihitung` : undefined);
  drawStatCard(doc, MARGIN + (cardW + gap) * 3, cardY, cardW, cardH,
    'PCI TERTINGGI', summary.maxPci == null ? '—' : formatDecimal(summary.maxPci, 1),
    `Koreksi dipakai = ${formatDecimal(pciCorrection, 0)}`);
}

/* -------------------------------------------------------------------------- */
/*  PCI bar chart                                                             */
/* -------------------------------------------------------------------------- */

function drawPciChart(
  doc: jsPDF, x: number, y: number, w: number, h: number,
  rows: PciFacilityTable['rows'], calculations: PciCalculationRow[],
  average: number | null,
): void {
  const bottom = y + h;

  // gridlines
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(5.4);
  for (const cat of PCI_CATEGORIES) {
    if (cat.min === 0) continue;
    const ly = bottom - (cat.min / 100) * h;
    setStroke(doc, C.line);
    doc.setLineWidth(0.22);
    doc.setLineDashPattern([1.4, 1.3], 0);
    doc.line(x, ly, x + w, ly);
    setText(doc, C.muted);
    doc.text(String(cat.min), x - 1.6, ly + 1.7, { align: 'right' });
  }
  doc.setLineDashPattern([], 0);

  if (rows.length === 0) {
    setStroke(doc, C.slate); doc.setLineWidth(0.6);
    doc.line(x, bottom, x + w, bottom);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); setText(doc, C.muted);
    doc.text('Belum ada lokasi STA/SAMPEL untuk fasilitas ini.', x + w / 2, y + h / 2, { align: 'center' });
    return;
  }

  // bars
  const slot = w / rows.length;
  let barW: number, gap: number;
  if (slot < 0.8) {
    barW = Math.max(0.22, slot * 0.92); gap = slot - barW;
  } else {
    barW = Math.min(8, slot * 0.72); gap = slot - barW;
  }

  for (let i = 0; i < rows.length; i++) {
    const calc = calculations[i];
    const unsupported = calc?.state === 'unsupported';
    const pci = Number.isFinite(calc?.pci) && !unsupported ? clamp(calc!.pci, 0, 100) : 0;
    const barH = (pci / 100) * h;
    const barX = x + i * slot + gap / 2;
    const color = unsupported ? C.unsupported : (calc?.rating?.color ?? pciRating(pci).color);

    setFill(doc, color);
    doc.rect(barX, bottom - barH, barW, barH, 'F');

    // hatching for unsupported
    if (unsupported && barH > 0.5) {
      setStroke(doc, C.white); doc.setLineWidth(0.25);
      let sy = bottom - barH;
      while (sy < bottom) { doc.line(barX, sy, barX + barW, sy + barW); sy += 1.7; }
    }
  }

  // baseline
  setStroke(doc, C.slate); doc.setLineWidth(0.6);
  doc.line(x, bottom, x + w, bottom);

  // average line
  if (average != null) {
    const avgY = bottom - (average / 100) * h;
    setStroke(doc, C.average); doc.setLineWidth(0.5);
    doc.setLineDashPattern([2.2, 1.4], 0);
    doc.line(x, avgY, x + w, avgY);
    doc.setLineDashPattern([], 0);

    const label = `Rata-rata ${formatDecimal(average, 1)}`;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(5.8);
    const chipW = doc.getTextWidth(label) + 3.4, chipH = 3.8;
    let chipY = avgY + 1.4;
    if (chipY + chipH > bottom + 2) chipY = avgY - chipH - 1.4;
    setFill(doc, C.average);
    doc.roundedRect(x + 1.5, chipY, chipW, chipH, 0.8, 0.8, 'F');
    setText(doc, C.white);
    doc.text(label, x + 1.5 + 1.7, chipY + 2.6);
  }

  // x labels (throttled)
  const labelEvery = Math.max(1, Math.ceil(rows.length / 30));
  doc.setFont('helvetica', 'normal'); doc.setFontSize(5); setText(doc, C.slate);
  for (let i = 0; i < rows.length; i++) {
    if (i % labelEvery !== 0) continue;
    doc.text(String(i + 1), x + i * slot + slot / 2, bottom + 3.4, { align: 'center' });
  }
}

function drawChartSection(
  doc: jsPDF, table: PciFacilityTable,
  calculations: PciCalculationRow[], average: number | null, y: number,
): number {
  const modeLabel = table.mode === 'SAM' ? 'SAMPEL' : 'STA';
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9); setText(doc, C.ink);
  doc.text(`GRAFIK BATANG PCI PER ${modeLabel}`, MARGIN, y);
  setStroke(doc, C.sky); doc.setLineWidth(0.7);
  doc.line(MARGIN, y + 1.2, 30, y + 1.2);

  const chartY = y + 5, chartH = 104;
  drawPciChart(doc, MARGIN, chartY, CONTENT_W, chartH, table.rows, calculations, average);
  const bottomY = chartY + chartH;

  doc.setFont('helvetica', 'normal'); doc.setFontSize(5); setText(doc, C.muted);
  doc.text('Skala PCI 0–100. Rentang kategori mengikuti standar aplikasi.', MARGIN, bottomY + 5);
  return bottomY + 7;
}

/* -------------------------------------------------------------------------- */
/*  Legend                                                                     */
/* -------------------------------------------------------------------------- */

function drawLegend(
  doc: jsPDF, x: number, y: number, w: number,
  calculations: PciCalculationRow[],
): number {
  const ratingCounts = new Map<string, number>();
  for (const cat of PCI_CATEGORIES) ratingCounts.set(cat.label, 0);
  for (const c of calculations) {
    if (c.state === 'unsupported' || !Number.isFinite(c.pci)) continue;
    const label = c.rating?.label ?? pciRating(c.pci).label;
    ratingCounts.set(label, (ratingCounts.get(label) ?? 0) + 1);
  }
  const unsupportedCount = calculations.filter((c) => c.state === 'unsupported').length;

  const items: { color: string; text: string }[] = [];
  for (const cat of PCI_CATEGORIES) {
    const n = ratingCounts.get(cat.label) ?? 0;
    if (n > 0) items.push({ color: cat.color, text: `${cat.label} · ${n}` });
  }
  if (unsupportedCount > 0)
    items.push({ color: C.unsupported, text: `Belum dapat dihitung · ${unsupportedCount}` });

  doc.setFont('helvetica', 'normal'); doc.setFontSize(5.8);
  let cx = x, cy = y, line = 0;
  for (const item of items) {
    const tw = doc.getTextWidth(item.text);
    const chipW = 3 + 1.4 + tw + 3;
    if (cx + chipW > x + w && cx > x) { line += 1; cy = y + line * 4.6; cx = x; }
    setFill(doc, item.color);
    doc.rect(cx, cy - 2.2, 3, 2.8, 'F');
    setText(doc, C.slate);
    doc.text(item.text, cx + 4.2, cy);
    cx += chipW;
  }

  const avgN = calculations.filter((c) => Number.isFinite(c.pci)).length;
  if (avgN > 0) {
    const tw = doc.getTextWidth('Rata-rata');
    const chipW = 5 + tw + 4;
    if (cx + chipW > x + w) { line += 1; cy = y + line * 4.6; cx = x; }
    setStroke(doc, C.average); doc.setLineWidth(0.45);
    doc.setLineDashPattern([2, 1.4], 0);
    doc.line(cx, cy - 0.4, cx + 4, cy - 0.4);
    doc.setLineDashPattern([], 0);
    setText(doc, C.slate);
    doc.text('Rata-rata', cx + 5.5, cy);
  }
  return y + (line + 1) * 4.6;
}

/* -------------------------------------------------------------------------- */
/*  Footer                                                                     */
/* -------------------------------------------------------------------------- */

function drawFooter(doc: jsPDF, pageNumber: number, code: string, margin = MARGIN): void {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  setStroke(doc, C.faint); doc.setLineWidth(0.4);
  doc.line(margin, pageHeight - 10, pageWidth - margin, pageHeight - 10);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); setText(doc, C.muted);
  doc.text(`Dokumen dihasilkan secara elektronik oleh X-Airside Monitoring — Laporan PCI ${code}`, margin, pageHeight - 6);
  doc.text(`Halaman ${pageNumber}`, pageWidth - margin, pageHeight - 6, { align: 'right' });
}

/* -------------------------------------------------------------------------- */
/*  Detail table pages                                                        */
/* -------------------------------------------------------------------------- */

function drawTablePageHeader(doc: jsPDF, table: PciFacilityTable): void {
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 6;
  setFill(doc, C.snowAlt); doc.rect(0, 0, pageWidth, 14, 'F');
  setFill(doc, C.sky); doc.rect(0, 14, pageWidth, 0.6, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8); setText(doc, C.ink);
  doc.text(`RINCIAN LENGKAP PERHITUNGAN PCI — ${table.facility.code}`, margin, 7);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); setText(doc, C.slate);
  doc.text(`Seluruh ${table.mode === 'SAM' ? 'sampel' : 'STA'} — kerusakan, density, DV, iterasi CDV, PCI, dan status`, margin, 11);
  doc.setFontSize(7);
  doc.text(`Fasilitas: ${table.facility.name || table.facility.code}`, pageWidth - margin, 8, { align: 'right' });
}

function drawDetailTable(
  doc: jsPDF, table: PciFacilityTable, calculations: PciCalculationRow[],
): void {
  const rows = buildPciPdfDetailRows(table, calculations);
  const dvKeys = Array.from({ length: 10 }, (_, i) => `dv-${i + 1}`);
  const columns: NonNullable<UserOptions['columns']> = [
    { header: 'No', dataKey: 'no' },
    { header: table.mode === 'SAM' ? 'SAMPEL' : 'STA', dataKey: 'location' },
    { header: 'Jenis Kerusakan', dataKey: 'damageType' },
    { header: 'Kode', dataKey: 'damageCode' },
    { header: 'Severity', dataKey: 'severity' },
    { header: 'Volume', dataKey: 'volume' },
    { header: 'Density (%)', dataKey: 'density' },
    { header: 'DV', dataKey: 'deductValue' },
    { header: 'DV max-min', dataKey: 'sortedDeductValue' },
    { header: 'M', dataKey: 'allowableDeducts' },
    { header: 'Total Q', dataKey: 'totalQ' },
    ...dvKeys.map((key, index) => ({ header: `DV ${index + 1}`, dataKey: key })),
    { header: 'Q', dataKey: 'q' },
    { header: 'TDV', dataKey: 'totalDv' },
    { header: 'CDV', dataKey: 'cdv' },
    { header: 'CDV MAX', dataKey: 'maxCdv' },
    { header: 'PCI/SAMPLE', dataKey: 'pci' },
    { header: 'Status', dataKey: 'status' },
  ];

  const dvStyle = { cellWidth: 6, halign: 'right' as const, valign: 'middle' as const };
  const columnStyles: UserOptions['columnStyles'] = {
    no: { cellWidth: 7, halign: 'center' },
    location: { cellWidth: 32, valign: 'middle' },
    damageType: { cellWidth: 29 },
    damageCode: { cellWidth: 10, halign: 'center' },
    severity: { cellWidth: 9, halign: 'center' },
    volume: { cellWidth: 13, halign: 'right' },
    density: { cellWidth: 13, halign: 'right' },
    deductValue: { cellWidth: 9, halign: 'right' },
    sortedDeductValue: { cellWidth: 10, halign: 'right' },
    allowableDeducts: { cellWidth: 9, halign: 'right' },
    totalQ: { cellWidth: 9, halign: 'right' },
    q: { cellWidth: 7, halign: 'right' },
    totalDv: { cellWidth: 10, halign: 'right' },
    cdv: { cellWidth: 10, halign: 'right', textColor: hexToRgb('#c2410c') },
    maxCdv: { cellWidth: 11, halign: 'right', fontStyle: 'bold', textColor: hexToRgb('#047857') },
    pci: { cellWidth: 11, halign: 'right', fontStyle: 'bold', textColor: hexToRgb('#0369a1') },
    status: { cellWidth: 20, halign: 'center' },
    ...Object.fromEntries(dvKeys.map((k) => [k, dvStyle])),
  };

  autoTable(doc, {
    startY: 17,
    margin: { left: 6, right: 6, top: 17, bottom: 13 },
    columns,
    body: rows,
    theme: 'grid',
    tableWidth: 279,
    showHead: 'everyPage',
    rowPageBreak: 'avoid',
    styles: {
      font: 'helvetica', fontSize: 4.3,
      cellPadding: { top: 0.75, bottom: 0.75, left: 0.55, right: 0.55 },
      lineColor: hexToRgb(C.line), lineWidth: 0.15,
      textColor: hexToRgb(C.ink), valign: 'middle', overflow: 'linebreak',
    },
    headStyles: {
      fillColor: hexToRgb(C.navy), textColor: hexToRgb(C.white),
      fontStyle: 'bold', fontSize: 4.2, halign: 'center', valign: 'middle',
      lineColor: hexToRgb(C.navy),
    },
    columnStyles,
    didParseCell: (data) => {
      if (data.section !== 'body') return;
      const info = data.row.raw as unknown as PciPdfDetailRow;
      data.cell.styles.fillColor = hexToRgb(info.groupIndex % 2 === 0 ? C.white : C.snow);
      if (data.column.dataKey === 'no' || data.column.dataKey === 'location') {
        data.cell.styles.fontStyle = 'bold';
      }
      if (data.column.dataKey === 'status') {
        if (info.firstInGroup) {
          data.cell.styles.fillColor = hexToRgb(info.statusFill);
          data.cell.styles.textColor = hexToRgb(info.statusText);
          data.cell.styles.fontStyle = 'bold';
        }
      }
    },
    willDrawPage: () => drawTablePageHeader(doc, table),
    didDrawPage: () => {
      drawFooter(doc, doc.getNumberOfPages(), table.facility.code, 6);
    },
  });
}

/* -------------------------------------------------------------------------- */
/*  Public entry point                                                        */
/* -------------------------------------------------------------------------- */

export function generatePciReportPdf(options: PciPdfOptions): jsPDF {
  const { table, calculations, pciCorrection, generatedAt = new Date(), airportName } = options;
  const average = computeAverage(calculations, options.pciAverage);
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  // Page 1 — summary & chart
  drawPageHeader(doc, table, airportName);
  drawFacilityInfo(doc, table, generatedAt);
  drawSummary(doc, table, calculations, pciCorrection, average, 62);
  const afterChart = drawChartSection(doc, table, calculations, average, 92);
  drawLegend(doc, MARGIN, afterChart + 1, CONTENT_W, calculations);
  drawFooter(doc, 1, table.facility.code);

  // Subsequent pages — detail table
  doc.addPage('a4', 'landscape');
  drawDetailTable(doc, table, calculations);

  return doc;
}
