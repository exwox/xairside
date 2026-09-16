// Parser DXF minimalis (ASCII) -> entity JSON (koordinat satuan gambar, umumnya meter).
// Mendukung: LINE, LWPOLYLINE, POLYLINE/VERTEX/SEQEND, CIRCLE, ARC, TEXT, MTEXT, POINT.

export interface DxfPoint {
  x: number;
  y: number;
}

export type DxfEntity =
  | { type: 'line'; layer: string; a: DxfPoint; b: DxfPoint }
  | { type: 'poly'; layer: string; points: DxfPoint[]; closed: boolean }
  | { type: 'circle'; layer: string; c: DxfPoint; r: number }
  | { type: 'arc'; layer: string; c: DxfPoint; r: number; a0: number; a1: number }
  | { type: 'text'; layer: string; p: DxfPoint; text: string; height: number; rotation: number }
  | { type: 'point'; layer: string; p: DxfPoint };

export interface DxfParseResult {
  entities: DxfEntity[];
  bbox: { minX: number; minY: number; maxX: number; maxY: number } | null;
  skipped: number;
}

interface RawRec {
  type: string;
  layer: string;
  props: Record<string, string[]>;
  xs: number[];
  ys: number[];
  closed: boolean;
  text: string;
}

function cleanMText(raw: string): string {
  return raw
    .replace(/\\P/g, ' ')
    .replace(/\\[A-Za-z][^;\\]*;/g, '')
    .replace(/[{}]/g, '')
    .replace(/\\~/g, ' ')
    .replace(/%%[dcp]/gi, '°')
    .trim();
}

export function parseDxf(content: string, maxEntities = 120000): DxfParseResult {
  const lines = content.split(/\r\n|\r|\n/);
  // Tokenisasi pasangan (code, value); toleransi baris kosong
  const pairs: { c: string; v: string }[] = [];
  let i = 0;
  while (i + 1 < lines.length) {
    const c = lines[i].trim();
    if (c === '') {
      i++;
      continue;
    }
    pairs.push({ c, v: lines[i + 1] ?? '' });
    i += 2;
  }

  const recs: RawRec[] = [];
  let skipped = 0;
  let inEntities = false;
  let rec: RawRec | null = null;

  const newRec = (type: string): RawRec => ({
    type,
    layer: '0',
    props: {},
    xs: [],
    ys: [],
    closed: false,
    text: '',
  });

  for (let p = 0; p < pairs.length; p++) {
    const { c, v } = pairs[p];
    if (c === '0' && v.trim() === 'SECTION' && p + 1 < pairs.length && pairs[p + 1].c === '2') {
      inEntities = pairs[p + 1].v.trim() === 'ENTITIES';
      continue;
    }
    if (c === '0' && v.trim() === 'ENDSEC') {
      if (inEntities) break;
      continue;
    }
    if (!inEntities) continue;

    if (c === '0') {
      const t = v.trim();
      if (t === 'VERTEX' && rec && rec.type === 'POLYLINE') {
        // konsumsi kode vertex sampai '0' berikutnya
        let q = p + 1;
        while (q < pairs.length && pairs[q].c !== '0') {
          if (pairs[q].c === '10') rec.xs.push(parseFloat(pairs[q].v));
          else if (pairs[q].c === '20') rec.ys.push(parseFloat(pairs[q].v));
          q++;
        }
        p = q - 1;
        continue;
      }
      if (t === 'SEQEND') {
        if (rec && rec.type === 'POLYLINE') recs.push(rec);
        rec = null;
        continue;
      }
      if (rec) recs.push(rec);
      if (['LINE', 'LWPOLYLINE', 'POLYLINE', 'CIRCLE', 'ARC', 'TEXT', 'MTEXT', 'POINT'].includes(t)) {
        rec = newRec(t);
      } else {
        rec = null;
      }
      continue;
    }
    if (!rec) continue;

    switch (c) {
      case '8':
        rec.layer = v.trim();
        break;
      case '70': {
        const f = parseInt(v);
        if (curTypeIs(rec, 'LWPOLYLINE', 'POLYLINE')) rec.closed = !!(f & 1);
        break;
      }
      case '10':
        if (rec.type === 'LWPOLYLINE') rec.xs.push(parseFloat(v));
        else rec.props['10'] = [...(rec.props['10'] || []), v];
        break;
      case '20':
        if (rec.type === 'LWPOLYLINE') rec.ys.push(parseFloat(v));
        else rec.props['20'] = [...(rec.props['20'] || []), v];
        break;
      case '11':
        rec.props['11'] = [...(rec.props['11'] || []), v];
        break;
      case '21':
        rec.props['21'] = [...(rec.props['21'] || []), v];
        break;
      case '40':
        rec.props['40'] = [...(rec.props['40'] || []), v];
        break;
      case '50':
        rec.props['50'] = [...(rec.props['50'] || []), v];
        break;
      case '51':
        rec.props['51'] = [...(rec.props['51'] || []), v];
        break;
      case '1':
      case '3':
        if (rec.type === 'TEXT' || rec.type === 'MTEXT') rec.text += cleanMText(v);
        break;
      default:
        break;
    }
  }
  if (rec) recs.push(rec);

  const entities: DxfEntity[] = [];
  for (const r of recs) finalizeRec(r, entities, () => skipped++);

  let bbox: DxfParseResult['bbox'] = null;
  for (const e of entities) {
    const pts: DxfPoint[] =
      e.type === 'line'
        ? [e.a, e.b]
        : e.type === 'poly'
          ? e.points
          : e.type === 'circle' || e.type === 'arc'
            ? [e.c]
            : [e.p];
    for (const p of pts) {
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
      if (!bbox) bbox = { minX: p.x, minY: p.y, maxX: p.x, maxY: p.y };
      else {
        bbox.minX = Math.min(bbox.minX, p.x);
        bbox.minY = Math.min(bbox.minY, p.y);
        bbox.maxX = Math.max(bbox.maxX, p.x);
        bbox.maxY = Math.max(bbox.maxY, p.y);
      }
    }
  }

  return { entities, bbox, skipped };
}

function curTypeIs(r: RawRec, ...types: string[]): boolean {
  return types.includes(r.type);
}

function finalizeRec(r: RawRec, out: DxfEntity[], onSkip: () => void): void {
  const num = (key: string, idx = 0): number => {
    const arr = r.props[key];
    if (!arr || arr.length <= idx) return NaN;
    return parseFloat(arr[idx]);
  };
  try {
    switch (r.type) {
      case 'LINE': {
        const a = { x: num('10'), y: num('20') };
        const b = { x: num('11'), y: num('21') };
        if (Number.isFinite(a.x) && Number.isFinite(b.x)) out.push({ type: 'line', layer: r.layer, a, b });
        else onSkip();
        break;
      }
      case 'LWPOLYLINE':
      case 'POLYLINE': {
        const pts: DxfPoint[] = [];
        for (let k = 0; k < r.xs.length && k < r.ys.length; k++) {
          if (Number.isFinite(r.xs[k]) && Number.isFinite(r.ys[k])) pts.push({ x: r.xs[k], y: r.ys[k] });
        }
        if (pts.length >= 2) out.push({ type: 'poly', layer: r.layer, points: pts, closed: r.closed });
        else onSkip();
        break;
      }
      case 'CIRCLE': {
        const c = { x: num('10'), y: num('20') };
        const rad = num('40');
        if (Number.isFinite(c.x) && Number.isFinite(rad) && rad > 0)
          out.push({ type: 'circle', layer: r.layer, c, r: rad });
        else onSkip();
        break;
      }
      case 'ARC': {
        const c = { x: num('10'), y: num('20') };
        const rad = num('40');
        const a0 = Number.isFinite(num('50')) ? num('50') : 0;
        const a1 = Number.isFinite(num('51')) ? num('51') : 360;
        if (Number.isFinite(c.x) && Number.isFinite(rad) && rad > 0)
          out.push({ type: 'arc', layer: r.layer, c, r: rad, a0, a1 });
        else onSkip();
        break;
      }
      case 'TEXT':
      case 'MTEXT': {
        const p = { x: num('10'), y: num('20') };
        const h = num('40');
        if (r.text.trim() && Number.isFinite(p.x))
          out.push({
            type: 'text',
            layer: r.layer,
            p,
            text: r.text,
            height: Number.isFinite(h) && h > 0 ? h : 2,
            rotation: Number.isFinite(num('50')) ? num('50') : 0,
          });
        else onSkip();
        break;
      }
      case 'POINT': {
        const p = { x: num('10'), y: num('20') };
        if (Number.isFinite(p.x)) out.push({ type: 'point', layer: r.layer, p });
        else onSkip();
        break;
      }
      default:
        onSkip();
    }
  } catch {
    onSkip();
  }
}

// ARC -> polyline (tessellation) untuk render di peta
export function arcToPoints(c: DxfPoint, r: number, a0Deg: number, a1Deg: number, segments = 16): DxfPoint[] {
  let a0 = a0Deg;
  let a1 = a1Deg;
  while (a1 <= a0) a1 += 360;
  const pts: DxfPoint[] = [];
  for (let k = 0; k <= segments; k++) {
    const a = ((a0 + ((a1 - a0) * k) / segments) * Math.PI) / 180;
    pts.push({ x: c.x + r * Math.cos(a), y: c.y + r * Math.sin(a) });
  }
  return pts;
}

// Label TEXT terdekat dari satu titik lokal (deteksi station pada DXF)
export function nearestDxfText(
  entities: DxfEntity[],
  pt: DxfPoint,
  maxDistM = 150
): { text: string; dist: number } | null {
  let best: { text: string; dist: number } | null = null;
  for (const e of entities) {
    if (e.type !== 'text') continue;
    const d = Math.hypot(e.p.x - pt.x, e.p.y - pt.y);
    if (d <= maxDistM && (!best || d < best.dist)) best = { text: e.text, dist: d };
  }
  return best;
}
