// Konversi koordinat Google (WGS84) <-> koordinat aerodrome (grid lokal, meter)
// Grid lokal: origin = ARP, X = East, Y = North (meter), sumbu utara sejati.
// Local tangent plane: akurasi < 0,1 m pada skala bandara.

export interface LatLng {
  lat: number;
  lng: number;
}

export interface LocalPoint {
  x: number; // East (meter) dari ARP
  y: number; // North (meter) dari ARP
}

export interface LayerRef {
  refLat: number;
  refLng: number;
  rotationDeg: number; // rotasi drawing searah jarum jam terhadap utara sejati
  scale: number; // 1 satuan gambar = scale meter
}

// Panjang 1 derajat lintang/bujur (meter) pada lintang tertentu (series WGS84)
export function metersPerDegree(lat: number): { mPerDegLat: number; mPerDegLng: number } {
  const rad = (lat * Math.PI) / 180;
  const mPerDegLat =
    111132.92 - 559.82 * Math.cos(2 * rad) + 1.175 * Math.cos(4 * rad) - 0.0023 * Math.cos(6 * rad);
  const mPerDegLng =
    111412.84 * Math.cos(rad) - 93.5 * Math.cos(3 * rad) + 0.118 * Math.cos(5 * rad);
  return { mPerDegLat, mPerDegLng };
}

export function latLngToEn(lat: number, lng: number, refLat: number, refLng: number): LocalPoint {
  const { mPerDegLat, mPerDegLng } = metersPerDegree(refLat);
  return { x: (lng - refLng) * mPerDegLng, y: (lat - refLat) * mPerDegLat };
}

export function enToLatLng(x: number, y: number, refLat: number, refLng: number): LatLng {
  const { mPerDegLat, mPerDegLng } = metersPerDegree(refLat);
  return { lat: refLat + y / mPerDegLat, lng: refLng + x / mPerDegLng };
}

// Koordinat gambar DXF -> koordinat Google (georeferencing layer)
export function dxfToLatLng(dx: number, dy: number, ref: LayerRef): LatLng {
  const s = ref.scale || 1;
  const rad = ((ref.rotationDeg || 0) * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  // Putar balik sebesar rotasi (CCW) agar drawing sejajar grid aerodrome
  const x = (dx * cos + dy * sin) * s;
  const y = (-dx * sin + dy * cos) * s;
  return enToLatLng(x, y, ref.refLat, ref.refLng);
}

// Google -> grid lokal aerodrome
export function latLngToLocal(lat: number, lng: number, arpLat: number, arpLng: number): LocalPoint {
  return latLngToEn(lat, lng, arpLat, arpLng);
}

export function localToLatLng(x: number, y: number, arpLat: number, arpLng: number): LatLng {
  return enToLatLng(x, y, arpLat, arpLng);
}

export type OrthoAxis = 'HORIZONTAL' | 'VERTICAL';

export interface OrthoSnapResult {
  point: LatLng;
  axis: OrthoAxis;
  /** Signed unit vector in the local East/North coordinate system. */
  direction: LocalPoint;
  distanceM: number;
}

// A map rotation is a clockwise CSS rotation of the rendered map. These two
// axes express screen-right and screen-up in the unrotated local East/North
// coordinate system, so ORTO remains horizontal/vertical to the operator even
// when the map is rotated.
function screenAxesInLocalCoordinates(mapRotationDeg: number): {
  horizontal: LocalPoint;
  vertical: LocalPoint;
} {
  const rotation = Number.isFinite(mapRotationDeg) ? mapRotationDeg : 0;
  const radians = (rotation * Math.PI) / 180;
  return {
    horizontal: { x: Math.cos(radians), y: Math.sin(radians) },
    vertical: { x: -Math.sin(radians), y: Math.cos(radians) },
  };
}

/**
 * Constrain a target to the nearest visual horizontal or vertical axis from
 * an anchor. The returned direction is signed and normalized, making it safe
 * to reuse for an exact numeric distance.
 */
export function snapLatLngToOrtho(
  anchor: LatLng,
  target: LatLng,
  arpLat: number,
  arpLng: number,
  mapRotationDeg = 0
): OrthoSnapResult {
  const anchorLocal = latLngToLocal(anchor.lat, anchor.lng, arpLat, arpLng);
  const targetLocal = latLngToLocal(target.lat, target.lng, arpLat, arpLng);
  const delta = {
    x: targetLocal.x - anchorLocal.x,
    y: targetLocal.y - anchorLocal.y,
  };
  const { horizontal, vertical } = screenAxesInLocalCoordinates(mapRotationDeg);
  const horizontalProjection = delta.x * horizontal.x + delta.y * horizontal.y;
  const verticalProjection = delta.x * vertical.x + delta.y * vertical.y;
  const useHorizontal = Math.abs(horizontalProjection) >= Math.abs(verticalProjection);
  const axis = useHorizontal ? horizontal : vertical;
  const projection = useHorizontal ? horizontalProjection : verticalProjection;
  // A zero-length cursor vector has no natural sign. Screen-right is the most
  // predictable fallback and is replaced as soon as the cursor moves.
  const sign = projection < 0 ? -1 : 1;
  const direction = { x: axis.x * sign, y: axis.y * sign };
  const pointLocal = {
    x: anchorLocal.x + axis.x * projection,
    y: anchorLocal.y + axis.y * projection,
  };

  return {
    point: localToLatLng(pointLocal.x, pointLocal.y, arpLat, arpLng),
    axis: useHorizontal ? 'HORIZONTAL' : 'VERTICAL',
    direction,
    distanceM: Math.abs(projection),
  };
}

/** Return a point at an exact metric distance along a local direction. */
export function endpointAtDistanceM(
  anchor: LatLng,
  direction: LocalPoint,
  distanceM: number,
  arpLat: number,
  arpLng: number
): LatLng {
  const magnitude = Math.hypot(direction.x, direction.y);
  if (!Number.isFinite(distanceM) || distanceM <= 0) {
    throw new RangeError('Jarak harus berupa angka meter yang lebih besar dari 0');
  }
  if (!Number.isFinite(magnitude) || magnitude <= Number.EPSILON) {
    throw new RangeError('Arah endpoint tidak valid');
  }

  const anchorLocal = latLngToLocal(anchor.lat, anchor.lng, arpLat, arpLng);
  return localToLatLng(
    anchorLocal.x + (direction.x / magnitude) * distanceM,
    anchorLocal.y + (direction.y / magnitude) * distanceM,
    arpLat,
    arpLng
  );
}

/** Parse one positive distance in metres, using either comma or dot decimals. */
export function parseMeterInput(input: string): number | null {
  const match = input.trim().match(/^(?:\d+(?:[.,]\d*)?|[.,]\d+)\s*(?:m|meter)?$/i);
  if (!match) return null;
  const value = Number(match[0].replace(/\s*(?:m|meter)$/i, '').replace(',', '.'));
  return Number.isFinite(value) && value > 0 ? value : null;
}

/**
 * Unit vector (local East/North) pointing from `anchor` toward `cursor`.
 *
 * With ORTO enabled the direction is the signed screen axis (horizontal or
 * vertical, honouring any map rotation) that lies nearest to the cursor — so a
 * precise numeric distance is always drawn at a clean 90° angle. Without ORTO
 * the raw direction toward the cursor is returned.
 *
 * Returns null when the cursor has not separated from the anchor yet, which
 * means a numeric endpoint has no predictable direction.
 */
export function directionFromAnchorToCursor(
  anchor: LatLng,
  cursor: LatLng,
  ortho: boolean,
  arpLat: number,
  arpLng: number,
  mapRotationDeg = 0
): LocalPoint | null {
  if (ortho) {
    return snapLatLngToOrtho(anchor, cursor, arpLat, arpLng, mapRotationDeg).direction;
  }
  const anchorLocal = latLngToLocal(anchor.lat, anchor.lng, arpLat, arpLng);
  const cursorLocal = latLngToLocal(cursor.lat, cursor.lng, arpLat, arpLng);
  const delta = { x: cursorLocal.x - anchorLocal.x, y: cursorLocal.y - anchorLocal.y };
  const mag = Math.hypot(delta.x, delta.y);
  if (mag < 1e-9) return null;
  return { x: delta.x / mag, y: delta.y / mag };
}

export function rotatePolygonPoints(
  points: { lat: number; lng: number }[],
  angleDeg: number,
  arpLat: number,
  arpLng: number
): { lat: number; lng: number }[] {
  if (points.length === 0 || angleDeg === 0) return points;
  const locals = points.map((p) => latLngToLocal(p.lat, p.lng, arpLat, arpLng));
  const cx = locals.reduce((sum, p) => sum + p.x, 0) / locals.length;
  const cy = locals.reduce((sum, p) => sum + p.y, 0) / locals.length;

  const rad = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  return locals.map((p) => {
    const dx = p.x - cx;
    const dy = p.y - cy;
    const rx = cx + (dx * cos - dy * sin);
    const ry = cy + (dx * sin + dy * cos);
    return localToLatLng(rx, ry, arpLat, arpLng);
  });
}

export function toLocalPoly(poly: LatLng[], arpLat: number, arpLng: number): LocalPoint[] {
  return poly.map((p) => latLngToLocal(p.lat, p.lng, arpLat, arpLng));
}

// Luas polygon (m2) via shoelace pada koordinat lokal
export function polygonAreaSqm(poly: LocalPoint[]): number {
  let sum = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

// Point-in-polygon (ray casting)
export function pointInPolygon(pt: LocalPoint, poly: LocalPoint[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x;
    const yi = poly[i].y;
    const xj = poly[j].x;
    const yj = poly[j].y;
    const intersect =
      yi > pt.y !== yj > pt.y && pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function distM(a: LocalPoint, b: LocalPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

// Ukuran retak linear adalah panjang jalur yang digambar, bukan panjang
// bounding box atau luas bidang tipis di sekelilingnya.
export function polylineLengthM(points: LatLng[], arpLat: number, arpLng: number): number {
  const local = toLocalPoly(points, arpLat, arpLng);
  let length = 0;
  for (let i = 1; i < local.length; i++) length += distM(local[i - 1], local[i]);
  return length;
}

export function lineFromPoints(
  points: LatLng[],
  arpLat: number,
  arpLng: number
): {
  corners: LatLng[];
  center: LatLng;
  centerLocal: LocalPoint;
  lengthM: number;
  widthM: number;
  areaSqm: number;
} {
  if (points.length < 2) throw new RangeError('Garis kerusakan memerlukan minimal dua titik');
  const local = toLocalPoly(points, arpLat, arpLng);
  const lengthM = polylineLengthM(points, arpLat, arpLng);
  let remaining = lengthM / 2;
  let centerLocal = local[0];
  for (let i = 1; i < local.length; i++) {
    const segmentLength = distM(local[i - 1], local[i]);
    if (remaining <= segmentLength || i === local.length - 1) {
      const ratio = segmentLength > 0 ? Math.max(0, Math.min(1, remaining / segmentLength)) : 0;
      centerLocal = {
        x: local[i - 1].x + (local[i].x - local[i - 1].x) * ratio,
        y: local[i - 1].y + (local[i].y - local[i - 1].y) * ratio,
      };
      break;
    }
    remaining -= segmentLength;
  }
  return {
    corners: points,
    center: localToLatLng(centerLocal.x, centerLocal.y, arpLat, arpLng),
    centerLocal,
    lengthM,
    widthM: 0,
    areaSqm: 0,
  };
}

export function pointFromPoint(
  point: LatLng,
  arpLat: number,
  arpLng: number
): {
  corners: LatLng[];
  center: LatLng;
  centerLocal: LocalPoint;
  lengthM: number;
  widthM: number;
  areaSqm: number;
} {
  return {
    corners: [point],
    center: point,
    centerLocal: latLngToLocal(point.lat, point.lng, arpLat, arpLng),
    lengthM: 0,
    widthM: 0,
    areaSqm: 0,
  };
}

// Rectangle axis-aligned dari 2 titik sudut (drag peta) -> 4 sudut + metrik lokal
export function rectFromCorners(
  a: LatLng,
  b: LatLng,
  arpLat: number,
  arpLng: number
): {
  corners: LatLng[];
  center: LatLng;
  centerLocal: LocalPoint;
  lengthM: number;
  widthM: number;
  areaSqm: number;
} {
  const la = latLngToLocal(a.lat, a.lng, arpLat, arpLng);
  const lb = latLngToLocal(b.lat, b.lng, arpLat, arpLng);
  const minX = Math.min(la.x, lb.x);
  const maxX = Math.max(la.x, lb.x);
  const minY = Math.min(la.y, lb.y);
  const maxY = Math.max(la.y, lb.y);

  const lengthM = maxY - minY;
  const widthM = maxX - minX;
  const centerLocal: LocalPoint = { x: (la.x + lb.x) / 2, y: (la.y + lb.y) / 2 };
  const corners: LatLng[] = [
    localToLatLng(minX, minY, arpLat, arpLng),
    localToLatLng(maxX, minY, arpLat, arpLng),
    localToLatLng(maxX, maxY, arpLat, arpLng),
    localToLatLng(minX, maxY, arpLat, arpLng),
  ];
  const center = localToLatLng(centerLocal.x, centerLocal.y, arpLat, arpLng);
  return { corners, center, centerLocal, lengthM, widthM, areaSqm: lengthM * widthM };
}

export interface RectangleDimensions {
  lengthM: number;
  widthM: number;
}

const MAX_RECTANGLE_DIMENSION_M = 10_000;

// Format input ukuran presisi: "panjang x lebar" dalam meter.
// Mendukung tanda x/X/×/* serta desimal titik atau koma.
export function parseRectangleDimensions(input: string): RectangleDimensions | null {
  const normalized = input.trim().replace(/,/g, '.');
  const match = normalized.match(/^(\d+(?:\.\d+)?|\.\d+)\s*[x×*]\s*(\d+(?:\.\d+)?|\.\d+)$/i);
  if (!match) return null;

  const lengthM = Number(match[1]);
  const widthM = Number(match[2]);
  if (
    !Number.isFinite(lengthM) ||
    !Number.isFinite(widthM) ||
    lengthM <= 0 ||
    widthM <= 0 ||
    lengthM > MAX_RECTANGLE_DIMENSION_M ||
    widthM > MAX_RECTANGLE_DIMENSION_M
  ) {
    return null;
  }

  return { lengthM, widthM };
}

// Rectangle berukuran pasti dengan titik klik sebagai pusat. Bearing mengikuti
// konvensi aplikasi: derajat searah jarum jam dari utara sejati.
export function rectFromCenterDimensions(
  center: LatLng,
  lengthM: number,
  widthM: number,
  bearingDeg: number,
  arpLat: number,
  arpLng: number
): {
  corners: LatLng[];
  center: LatLng;
  centerLocal: LocalPoint;
  lengthM: number;
  widthM: number;
  areaSqm: number;
} {
  if (!Number.isFinite(lengthM) || !Number.isFinite(widthM) || lengthM <= 0 || widthM <= 0) {
    throw new RangeError('Panjang dan lebar rectangle harus lebih besar dari 0');
  }

  const centerLocal = latLngToLocal(center.lat, center.lng, arpLat, arpLng);
  const angleRad = ((Number.isFinite(bearingDeg) ? bearingDeg : 0) * Math.PI) / 180;
  const lengthAxis = { x: Math.sin(angleRad), y: Math.cos(angleRad) };
  const widthAxis = { x: Math.cos(angleRad), y: -Math.sin(angleRad) };
  const halfLength = lengthM / 2;
  const halfWidth = widthM / 2;

  const corners = [
    { length: -halfLength, width: -halfWidth },
    { length: -halfLength, width: halfWidth },
    { length: halfLength, width: halfWidth },
    { length: halfLength, width: -halfWidth },
  ].map((offset) =>
    localToLatLng(
      centerLocal.x + offset.length * lengthAxis.x + offset.width * widthAxis.x,
      centerLocal.y + offset.length * lengthAxis.y + offset.width * widthAxis.y,
      arpLat,
      arpLng
    )
  );

  return {
    corners,
    center,
    centerLocal,
    lengthM,
    widthM,
    areaSqm: lengthM * widthM,
  };
}

// Konversi titik-titik polygon (2 titik = rectangle, >=3 titik = polygon bebas) -> Metrik lokal
export function polyFromPoints(
  points: LatLng[],
  arpLat: number,
  arpLng: number
): {
  corners: LatLng[];
  center: LatLng;
  centerLocal: LocalPoint;
  lengthM: number;
  widthM: number;
  areaSqm: number;
} {
  if (points.length === 2) {
    return rectFromCorners(points[0], points[1], arpLat, arpLng);
  }
  const locals = toLocalPoly(points, arpLat, arpLng);
  const areaSqm = polygonAreaSqm(locals);
  let sumX = 0;
  let sumY = 0;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  locals.forEach((p) => {
    sumX += p.x;
    sumY += p.y;
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  });

  const centerLocal: LocalPoint = { x: sumX / locals.length, y: sumY / locals.length };
  const center = localToLatLng(centerLocal.x, centerLocal.y, arpLat, arpLng);
  const lengthM = Math.max(0.1, maxY - minY);
  const widthM = Math.max(0.1, maxX - minX);

  return {
    corners: points,
    center,
    centerLocal,
    lengthM: parseFloat(lengthM.toFixed(1)),
    widthM: parseFloat(widthM.toFixed(1)),
    areaSqm: parseFloat(areaSqm.toFixed(1)),
  };
}

// ===== Format koordinat =====

export function formatLatLng(p: LatLng): string {
  return `${p.lat.toFixed(6)}°, ${p.lng.toFixed(6)}°`;
}

export function formatDms(value: number, isLat: boolean): string {
  const dir = isLat ? (value >= 0 ? 'N' : 'S') : value >= 0 ? 'E' : 'W';
  const abs = Math.abs(value);
  const d = Math.floor(abs);
  const mFloat = (abs - d) * 60;
  const m = Math.floor(mFloat);
  const s = (mFloat - m) * 60;
  return `${String(d).padStart(isLat ? 2 : 3, '0')}°${String(m).padStart(2, '0')}'${s
    .toFixed(1)
    .padStart(4, '0')}"${dir}`;
}

export function formatLocal(pt: LocalPoint): string {
  return `E ${pt.x.toFixed(1)} m, N ${pt.y.toFixed(1)} m`;
}

// ===== Parsing input manual =====

// Menerima "0.9569, 104.5311" / "0.9569 104.5311" / "-0.9569;104.5311"
export function parseLatLngInput(input: string): LatLng | null {
  const m = input
    .trim()
    .split(/[,\s;]+/)
    .filter(Boolean);
  if (m.length < 2) return null;
  const lat = parseFloat(m[0]);
  const lng = parseFloat(m[1]);
  if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

// Menerima "1234.5, -567.8" (E, N meter dari ARP)
export function parseLocalInput(input: string): LocalPoint | null {
  const m = input
    .trim()
    .split(/[,\s;]+/)
    .filter(Boolean);
  if (m.length < 2) return null;
  const x = parseFloat(m[0]);
  const y = parseFloat(m[1]);
  if (Number.isNaN(x) || Number.isNaN(y)) return null;
  return { x, y };
}

// ===== Stationing runway =====
// Perhitungan dimensi otomatis (Panjang M, Lebar M, Luas m², Bearing °) dari Polygon real
export function computePolygonMetrics(vertices: LatLng[], arpLat?: number, arpLng?: number): {
  lengthM: number;
  widthM: number;
  areaSqm: number;
  bearingDeg: number;
  centroid: LatLng | null;
} {
  if (vertices.length < 3) {
    return { lengthM: 0, widthM: 0, areaSqm: 0, bearingDeg: 0, centroid: null };
  }

  const centroid = {
    lat: vertices.reduce((s, v) => s + v.lat, 0) / vertices.length,
    lng: vertices.reduce((s, v) => s + v.lng, 0) / vertices.length,
  };

  const refLat = arpLat ?? centroid.lat;
  const refLng = arpLng ?? centroid.lng;
  const localPts = toLocalPoly(vertices, refLat, refLng);

  const areaSqm = polygonAreaSqm(localPts);

  // Menggunakan Oriented Bounding Box (OBB) untuk menentukan Panjang (sisi terpanjang) & Lebar real
  // Cek rotasi dari 0 hingga 180 derajat untuk menemukan Bounding Box terkecil
  let minArea = Infinity;
  let bestLength = 0;
  let bestWidth = 0;
  let bestAngle = 0;

  for (let deg = 0; deg < 180; deg += 1) {
    const rad = (deg * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);

    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;

    for (const pt of localPts) {
      const rx = pt.x * cos + pt.y * sin;
      const ry = -pt.x * sin + pt.y * cos;
      if (rx < minX) minX = rx;
      if (rx > maxX) maxX = rx;
      if (ry < minY) minY = ry;
      if (ry > maxY) maxY = ry;
    }

    const dimX = maxX - minX;
    const dimY = maxY - minY;
    const boxArea = dimX * dimY;

    if (boxArea < minArea) {
      minArea = boxArea;
      if (dimY >= dimX) {
        bestLength = dimY;
        bestWidth = dimX;
        // Sumbu Y hasil rotasi menunjuk (-sin, cos). Konversikan ke bearing
        // searah jarum jam dari utara dan normalkan karena OBB tidak berarah.
        bestAngle = ((-deg % 180) + 180) % 180;
      } else {
        bestLength = dimX;
        bestWidth = dimY;
        // Sumbu X hasil rotasi menunjuk (cos, sin).
        bestAngle = (((90 - deg) % 180) + 180) % 180;
      }
    }
  }

  return {
    lengthM: Math.round(bestLength * 10) / 10,
    widthM: Math.round(bestWidth * 10) / 10,
    areaSqm: Math.round(areaSqm * 10) / 10,
    bearingDeg: Math.round(bestAngle * 10) / 10,
    centroid,
  };
}

export function getFacilityStationIntervalM(facility: { stationIntervalM?: number | null }): number {
  return Number.isFinite(facility.stationIntervalM) && (facility.stationIntervalM ?? 0) >= 5
    ? facility.stationIntervalM!
    : 50;
}

// Format STA untuk interval fasilitas, termasuk sisa panjang di ujung akhir.
export function formatStationSegment(offsetM: number, totalLengthM: number, intervalM: number): {
  staStartM: number;
  staEndM: number;
  staStartStr: string;
  staEndStr: string;
  stationText: string;
} {
  const total = Math.max(0, totalLengthM);
  const step = Number.isFinite(intervalM) && intervalM > 0 ? intervalM : 10;
  const clamped = Math.max(0, Math.min(total, offsetM));
  const segmentCount = Math.ceil(total / step);
  const segmentIndex = segmentCount > 0 ? Math.min(segmentCount - 1, Math.floor(clamped / step)) : 0;
  const staStartM = segmentIndex * step;
  const staEndM = Math.min(total, staStartM + step);

  const formatSta = (m: number) => {
    const rounded = Math.round(m * 10) / 10;
    const km = Math.floor(rounded / 1000);
    const meter = Math.round((rounded - km * 1000) * 10) / 10;
    const wholeMeters = Math.floor(meter);
    const tenths = Math.round((meter - wholeMeters) * 10);
    return `STA ${km}+${String(wholeMeters).padStart(3, '0')}${tenths ? `.${tenths}` : ''}`;
  };

  const staStartStr = formatSta(staStartM);
  const staEndStr = formatSta(staEndM);
  const stationText = `${staStartStr} s/d ${staEndStr}`;

  return {
    staStartM,
    staEndM,
    staStartStr,
    staEndStr,
    stationText,
  };
}

// Kompatibilitas untuk endpoint sub-segmen lama yang memang tetap 10 m.
export function formatStationSegment10m(offsetM: number, totalLengthM: number) {
  return formatStationSegment(offsetM, totalLengthM, 10);
}

export interface OrderedQuad {
  edgeLeftStart: LocalPoint;
  edgeLeftEnd: LocalPoint;
  edgeRightStart: LocalPoint;
  edgeRightEnd: LocalPoint;
  totalLen: number;
  totalWid: number;
}

// Urutkan titik-titik vertex segiempat 4-titik secara melingkar (polar angle sort)
// sehingga tepi-tepi polygon terhubung secara berurutan tanpa persilangan garis.
export function orderQuadrilateralVertices(
  pts: LocalPoint[],
  isReverse: boolean = false
): OrderedQuad | null {
  if (pts.length !== 4) return null;

  // 1. Hitung centroid lokal 4 titik
  const cX = (pts[0].x + pts[1].x + pts[2].x + pts[3].x) / 4;
  const cY = (pts[0].y + pts[1].y + pts[2].y + pts[3].y) / 4;

  // 2. Urutkan 4 titik berurutan memutari centroid berdasarkan sudut polar angle
  const sorted = [...pts].sort((a, b) => {
    const angA = Math.atan2(a.y - cY, a.x - cX);
    const angB = Math.atan2(b.y - cY, b.x - cX);
    return angA - angB;
  });

  const [p0, p1, p2, p3] = sorted;

  const len01 = Math.hypot(p1.x - p0.x, p1.y - p0.y);
  const len12 = Math.hypot(p2.x - p1.x, p2.y - p1.y);
  const len23 = Math.hypot(p3.x - p2.x, p3.y - p2.y);
  const len30 = Math.hypot(p0.x - p3.x, p0.y - p3.y);

  // Bandingkan rata-rata panjang pasangan sisi sejajar (0-1 & 2-3) vs (1-2 & 3-0)
  const avgLen12 = (len12 + len30) / 2;
  const avgLen01 = (len01 + len23) / 2;

  let edgeLeftStart: LocalPoint, edgeLeftEnd: LocalPoint;
  let edgeRightStart: LocalPoint, edgeRightEnd: LocalPoint;
  let totalLen = 0;
  let totalWid = 0;

  if (avgLen12 >= avgLen01) {
    // Sisi (1-2) dan (3-0) adalah sisi memanjang terpanjang
    if (!isReverse) {
      edgeLeftStart = p0;
      edgeLeftEnd = p3;
      edgeRightStart = p1;
      edgeRightEnd = p2;
    } else {
      edgeLeftStart = p3;
      edgeLeftEnd = p0;
      edgeRightStart = p2;
      edgeRightEnd = p1;
    }
    totalLen = avgLen12;
    totalWid = avgLen01;
  } else {
    // Sisi (0-1) dan (2-3) adalah sisi memanjang terpanjang
    if (!isReverse) {
      edgeLeftStart = p0;
      edgeLeftEnd = p1;
      edgeRightStart = p3;
      edgeRightEnd = p2;
    } else {
      edgeLeftStart = p1;
      edgeLeftEnd = p0;
      edgeRightStart = p2;
      edgeRightEnd = p3;
    }
    totalLen = avgLen01;
    totalWid = avgLen12;
  }

  return {
    edgeLeftStart,
    edgeLeftEnd,
    edgeRightStart,
    edgeRightEnd,
    totalLen,
    totalWid,
  };
}

// Meng-generate garis penanda stationing (garis putus-putus & label "STA 0+150") per interval (misal 50m) sepanjang fasilitas
export function generateFacilityStationLines(
  facility: {
    code: string;
    centroidLat?: number | null;
    centroidLng?: number | null;
    bearingDeg?: number | null;
    lengthM?: number | null;
    widthM?: number | null;
    stationDirection?: 'FORWARD' | 'REVERSE' | string | null;
  },
  intervalM: number = 50,
  arpLat?: number,
  arpLng?: number,
  polygonVertices?: LatLng[]
): {
  stationM: number;
  stationText: string;
  leftLatLng: LatLng;
  rightLatLng: LatLng;
  centerLatLng: LatLng;
  textRotationDeg: number;
}[] {
  const isReverse = facility.stationDirection === 'REVERSE';

  const refLat = arpLat ?? (polygonVertices && polygonVertices.length > 0 ? polygonVertices[0].lat : facility.centroidLat);
  const refLng = arpLng ?? (polygonVertices && polygonVertices.length > 0 ? polygonVertices[0].lng : facility.centroidLng);

  if (!refLat || !refLng) return [];

  let localPts: LocalPoint[] = [];
  if (polygonVertices && polygonVertices.length >= 3) {
    localPts = toLocalPoly(polygonVertices, refLat, refLng);
  }
  // JIKA POLYGON 4-TITIK SEGIEMPAT (STA lines dipasang 100% pas menempel tepi polygon Kiri & Kanan)
  if (localPts.length === 4) {
    const quad = orderQuadrilateralVertices(localPts, isReverse);
    if (quad && quad.totalLen > 0) {
      const { edgeLeftStart, edgeLeftEnd, edgeRightStart, edgeRightEnd, totalLen } = quad;

      let bearingDeg = facility.bearingDeg ?? null;
      if (bearingDeg == null || Number.isNaN(bearingDeg)) {
        bearingDeg = getLongestEdgeBearing(localPts);
      }

      let textRotationDeg = (bearingDeg - 90) % 180;
      if (textRotationDeg > 90) textRotationDeg -= 180;
      if (textRotationDeg < -90) textRotationDeg += 180;

      const results = [];
      const numSteps = Math.floor(totalLen / intervalM);

      for (let i = 0; i <= numSteps; i++) {
        const m = i * intervalM;
        const t = Math.min(1, m / totalLen);
        const km = Math.floor(m / 1000);
        const meter = Math.floor(m % 1000);
        const stationText = `STA ${km}+${String(meter).padStart(3, '0')}`;

        const leftLocal = {
          x: (1 - t) * edgeLeftStart.x + t * edgeLeftEnd.x,
          y: (1 - t) * edgeLeftStart.y + t * edgeLeftEnd.y,
        };
        const rightLocal = {
          x: (1 - t) * edgeRightStart.x + t * edgeRightEnd.x,
          y: (1 - t) * edgeRightStart.y + t * edgeRightEnd.y,
        };
        const centerLocal = {
          x: (leftLocal.x + rightLocal.x) / 2,
          y: (leftLocal.y + rightLocal.y) / 2,
        };

        results.push({
          stationM: Math.round(m),
          stationText,
          leftLatLng: localToLatLng(leftLocal.x, leftLocal.y, refLat, refLng),
          rightLatLng: localToLatLng(rightLocal.x, rightLocal.y, refLat, refLng),
          centerLatLng: localToLatLng(centerLocal.x, centerLocal.y, refLat, refLng),
          textRotationDeg,
        });
      }
      return results;
    }
  }

  let bearingDeg = facility.bearingDeg ?? null;
  if (bearingDeg == null || Number.isNaN(bearingDeg)) {
    if (localPts.length >= 3) {
      bearingDeg = getLongestEdgeBearing(localPts);
    } else {
      bearingDeg = 0;
    }
  }

  const rad = (bearingDeg * Math.PI) / 180;
  const baseDir = { x: Math.sin(rad), y: Math.cos(rad) };
  const dir = isReverse ? { x: -baseDir.x, y: -baseDir.y } : baseDir;
  const perp = { x: Math.cos(rad), y: -Math.sin(rad) };

  let startPt: LocalPoint;
  let totalLengthM = facility.lengthM ?? 0;
  let totalWidthM = facility.widthM ?? 0;

  if (localPts.length >= 3) {
    let minU = Infinity, maxU = -Infinity;
    let minV = Infinity, maxV = -Infinity;

    for (const pt of localPts) {
      const u = pt.x * baseDir.x + pt.y * baseDir.y;
      const v = pt.x * perp.x + pt.y * perp.y;
      if (u < minU) minU = u;
      if (u > maxU) maxU = u;
      if (v < minV) minV = v;
      if (v > maxV) maxV = v;
    }

    totalLengthM = maxU - minU;
    totalWidthM = maxV - minV;

    if (isReverse) {
      startPt = {
        x: maxU * baseDir.x + ((minV + maxV) / 2) * perp.x,
        y: maxU * baseDir.y + ((minV + maxV) / 2) * perp.y,
      };
    } else {
      startPt = {
        x: minU * baseDir.x + ((minV + maxV) / 2) * perp.x,
        y: minU * baseDir.y + ((minV + maxV) / 2) * perp.y,
      };
    }
  } else {
    const cLat = facility.centroidLat ?? refLat;
    const cLng = facility.centroidLng ?? refLng;
    const c = latLngToLocal(cLat, cLng, refLat, refLng);
    totalLengthM = totalLengthM > 0 ? totalLengthM : 100;
    totalWidthM = totalWidthM > 0 ? totalWidthM : 45;

    startPt = {
      x: c.x - (totalLengthM / 2) * dir.x,
      y: c.y - (totalLengthM / 2) * dir.y,
    };
  }

  if (totalLengthM <= 0) return [];

  const halfWidth = (totalWidthM > 0 ? totalWidthM : 45) / 2 + 4; // 4m pad

  let textRotationDeg = (bearingDeg - 90) % 180;
  if (textRotationDeg > 90) textRotationDeg -= 180;
  if (textRotationDeg < -90) textRotationDeg += 180;

  const results = [];

  for (let m = 0; m <= totalLengthM; m += intervalM) {
    const km = Math.floor(m / 1000);
    const meter = Math.floor(m % 1000);
    const stationText = `STA ${km}+${String(meter).padStart(3, '0')}`;

    const centerLocal = {
      x: startPt.x + m * dir.x,
      y: startPt.y + m * dir.y,
    };

    const leftLocal = {
      x: centerLocal.x - halfWidth * perp.x,
      y: centerLocal.y - halfWidth * perp.y,
    };
    const rightLocal = {
      x: centerLocal.x + halfWidth * perp.x,
      y: centerLocal.y + halfWidth * perp.y,
    };

    results.push({
      stationM: m,
      stationText,
      leftLatLng: localToLatLng(leftLocal.x, leftLocal.y, refLat, refLng),
      rightLatLng: localToLatLng(rightLocal.x, rightLocal.y, refLat, refLng),
      centerLatLng: localToLatLng(centerLocal.x, centerLocal.y, refLat, refLng),
      textRotationDeg,
    });
  }

  return results;
}

export interface FacilitySampleGrid {
  sampleCode: string; // e.g. "SAM-1", "SAM-2"
  index: number;
  polygon: LatLng[];
  centerLatLng: LatLng;
  lengthM: number;
  widthM: number;
  areaSqm: number;
}

const GRID_SNAP_EPSILON_M = 1e-3;
const MIN_GRID_AREA_SQM = 1e-4;

interface AxisSegment {
  start: number;
  end: number;
  size: number;
}

// Bagi sebuah sumbu dengan ukuran tetap. Selisih sub-milimeter dari konversi
// WGS84 di-snap ke batas terakhir agar tidak membuat baris/kolom semu.
function buildAxisSegments(totalM: number, stepM: number): AxisSegment[] {
  if (!Number.isFinite(totalM) || !Number.isFinite(stepM) || totalM <= 0 || stepM <= 0) return [];

  const count = Math.max(1, Math.ceil((totalM - GRID_SNAP_EPSILON_M) / stepM));
  const segments: AxisSegment[] = [];

  for (let i = 0; i < count; i++) {
    const start = Math.min(totalM, i * stepM);
    const end = i === count - 1 ? totalM : Math.min(totalM, (i + 1) * stepM);
    if (end <= start) continue;
    segments.push({ start, end, size: end - start });
  }

  return segments;
}

function normalizeLocalPolygon(points: LocalPoint[]): LocalPoint[] {
  const normalized: LocalPoint[] = [];

  for (const point of points) {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;
    const previous = normalized[normalized.length - 1];
    if (previous && distM(previous, point) <= GRID_SNAP_EPSILON_M) continue;
    normalized.push(point);
  }

  if (
    normalized.length > 1 &&
    distM(normalized[0], normalized[normalized.length - 1]) <= GRID_SNAP_EPSILON_M
  ) {
    normalized.pop();
  }

  return normalized;
}

function localPolygonCentroid(poly: LocalPoint[]): LocalPoint {
  let crossSum = 0;
  let xSum = 0;
  let ySum = 0;

  for (let i = 0; i < poly.length; i++) {
    const current = poly[i];
    const next = poly[(i + 1) % poly.length];
    const cross = current.x * next.y - next.x * current.y;
    crossSum += cross;
    xSum += (current.x + next.x) * cross;
    ySum += (current.y + next.y) * cross;
  }

  if (Math.abs(crossSum) > 1e-9) {
    return {
      x: xSum / (3 * crossSum),
      y: ySum / (3 * crossSum),
    };
  }

  return {
    x: poly.reduce((sum, point) => sum + point.x, 0) / poly.length,
    y: poly.reduce((sum, point) => sum + point.y, 0) / poly.length,
  };
}

function projectedSpan(points: LocalPoint[], axis: LocalPoint): number {
  let min = Infinity;
  let max = -Infinity;
  for (const point of points) {
    const projection = point.x * axis.x + point.y * axis.y;
    min = Math.min(min, projection);
    max = Math.max(max, projection);
  }
  return Math.max(0, max - min);
}

function roundToDecimeter(value: number): number {
  return Math.round(value * 10) / 10;
}

// Helper: Point in Polygon (WGS84 lat/lng)
export function isPointInPolygon(point: LatLng, polygon: LatLng[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lng, yi = polygon[i].lat;
    const xj = polygon[j].lng, yj = polygon[j].lat;
    const intersect = ((yi > point.lat) !== (yj > point.lat)) &&
      (point.lng < (xj - xi) * (point.lat - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}
// Helper: Point in Polygon (LocalPoint meter)
export function isLocalPointInPolygon(point: LocalPoint, polygon: LocalPoint[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y;
    const xj = polygon[j].x, yj = polygon[j].y;
    const intersect = ((yi > point.y) !== (yj > point.y)) &&
      (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}


// Helper: Mencari sudut bearing (0°-360°) dari tepi terpanjang polygon lokal
export function getLongestEdgeBearing(pts: LocalPoint[]): number {
  if (pts.length < 2) return 0;
  let maxLenSq = -1;
  let bestDir = { x: 0, y: 1 };
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const lenSq = dx * dx + dy * dy;
    if (lenSq > maxLenSq) {
      maxLenSq = lenSq;
      const len = Math.sqrt(lenSq);
      bestDir = { x: dx / len, y: dy / len };
    }
  }
  let bearingDeg = (Math.atan2(bestDir.x, bestDir.y) * 180) / Math.PI;
  if (bearingDeg < 0) bearingDeg += 360;
  return bearingDeg;
}
// Helper: Memotong polygon grid sampel (subject) dengan polygon fasilitas (clipPoly) via Sutherland-Hodgman Clipping
export function clipLocalPolygon(
  subject: LocalPoint[],
  clipPoly: LocalPoint[]
): LocalPoint[] {
  if (clipPoly.length < 3 || subject.length < 3) return subject;

  // Orientasikan clipPoly agar Counter-Clockwise (CCW)
  let area = 0;
  for (let i = 0; i < clipPoly.length; i++) {
    const p1 = clipPoly[i];
    const p2 = clipPoly[(i + 1) % clipPoly.length];
    area += (p1.x * p2.y - p2.x * p1.y);
  }
  const orientedClip = area < 0 ? [...clipPoly].reverse() : clipPoly;

  let outputList = subject;
  const n = orientedClip.length;

  for (let i = 0; i < n; i++) {
    const inputList = outputList;
    outputList = [];
    if (inputList.length === 0) break;

    const edgeStart = orientedClip[i];
    const edgeEnd = orientedClip[(i + 1) % n];

    const isInside = (p: LocalPoint) => {
      return (edgeEnd.x - edgeStart.x) * (p.y - edgeStart.y) - (edgeEnd.y - edgeStart.y) * (p.x - edgeStart.x) >= -1e-5;
    };

    const intersection = (p1: LocalPoint, p2: LocalPoint): LocalPoint => {
      const A1 = p2.y - p1.y;
      const B1 = p1.x - p2.x;
      const C1 = A1 * p1.x + B1 * p1.y;

      const A2 = edgeEnd.y - edgeStart.y;
      const B2 = edgeStart.x - edgeEnd.x;
      const C2 = A2 * edgeStart.x + B2 * edgeStart.y;

      const det = A1 * B2 - A2 * B1;
      if (Math.abs(det) < 1e-9) return p1;
      return {
        x: (B2 * C1 - B1 * C2) / det,
        y: (A1 * C2 - A2 * C1) / det,
      };
    };

    let s = inputList[inputList.length - 1];
    for (const e of inputList) {
      if (isInside(e)) {
        if (isInside(s)) {
          outputList.push(e);
        } else {
          outputList.push(intersection(s, e));
          outputList.push(e);
        }
      } else if (isInside(s)) {
        outputList.push(intersection(s, e));
      }
      s = e;
    }
  }

  return outputList;
}



// Meng-generate grid kotak-kotak sampel SAM-1, SAM-2, dst di atas fasilitas
export function generateFacilitySampleGrids(
  facility: {
    code: string;
    centroidLat?: number | null;
    centroidLng?: number | null;
    bearingDeg?: number | null;
    lengthM?: number | null;
    widthM?: number | null;
    sampleLengthM?: number | null;
    sampleWidthM?: number | null;
  },
  sampleLenM: number = 20,
  sampleWidM: number = 20,
  arpLat?: number,
  arpLng?: number,
  polygonVertices?: LatLng[]
): FacilitySampleGrid[] {
  const lenStep = Math.max(1, facility.sampleLengthM || sampleLenM);
  const widStep = Math.max(1, facility.sampleWidthM || sampleWidM);

  const refLat = arpLat ?? (polygonVertices && polygonVertices.length > 0 ? polygonVertices[0].lat : facility.centroidLat);
  const refLng = arpLng ?? (polygonVertices && polygonVertices.length > 0 ? polygonVertices[0].lng : facility.centroidLng);

  if (refLat == null || refLng == null || !Number.isFinite(refLat) || !Number.isFinite(refLng)) return [];

  let localPts: LocalPoint[] = [];
  if (polygonVertices && polygonVertices.length >= 3) {
    localPts = toLocalPoly(polygonVertices, refLat, refLng);
  }

  const results: FacilitySampleGrid[] = [];
  let sampleCounter = 1;

  // STRATEGI 1: Polygon 4-Titik Segiempat (Bilinear Mapping -> 100% Pas di Tepi Polygon & Tidak Keluar Facility)
  if (localPts.length === 4) {
    const quad = orderQuadrilateralVertices(localPts, false);
    if (quad && quad.totalLen > 0 && quad.totalWid > 0) {
      const { edgeLeftStart, edgeLeftEnd, edgeRightStart, edgeRightEnd, totalLen, totalWid } = quad;

      const lengthSegments = buildAxisSegments(totalLen, lenStep);
      const widthSegments = buildAxisSegments(totalWid, widStep);

      const getBilinearPt = (t: number, u: number): LocalPoint => {
        const left = {
          x: (1 - t) * edgeLeftStart.x + t * edgeLeftEnd.x,
          y: (1 - t) * edgeLeftStart.y + t * edgeLeftEnd.y,
        };
        const right = {
          x: (1 - t) * edgeRightStart.x + t * edgeRightEnd.x,
          y: (1 - t) * edgeRightStart.y + t * edgeRightEnd.y,
        };
        return {
          x: (1 - u) * left.x + u * right.x,
          y: (1 - u) * left.y + u * right.y,
        };
      };

      for (const lengthSegment of lengthSegments) {
        const t0 = lengthSegment.start / totalLen;
        const t1 = lengthSegment.end / totalLen;

        for (const widthSegment of widthSegments) {
          const u0 = widthSegment.start / totalWid;
          const u1 = widthSegment.end / totalWid;

          const p0 = getBilinearPt(t0, u0);
          const p1 = getBilinearPt(t0, u1);
          const p2 = getBilinearPt(t1, u1);
          const p3 = getBilinearPt(t1, u0);

          const localPolygon = [p0, p1, p2, p3];
          const cPt = localPolygonCentroid(localPolygon);
          const gridLenM = (distM(p0, p3) + distM(p1, p2)) / 2;
          const gridWidM = (distM(p0, p1) + distM(p3, p2)) / 2;
          const areaSqm = polygonAreaSqm(localPolygon);

          results.push({
            sampleCode: `SAM-${sampleCounter}`,
            index: sampleCounter,
            polygon: [
              localToLatLng(p0.x, p0.y, refLat, refLng),
              localToLatLng(p1.x, p1.y, refLat, refLng),
              localToLatLng(p2.x, p2.y, refLat, refLng),
              localToLatLng(p3.x, p3.y, refLat, refLng),
            ],
            centerLatLng: localToLatLng(cPt.x, cPt.y, refLat, refLng),
            lengthM: roundToDecimeter(gridLenM),
            widthM: roundToDecimeter(gridWidM),
            areaSqm: roundToDecimeter(areaSqm),
          });

          sampleCounter++;
        }
      }

      return results;
    }
  }

  let bearingDeg = facility.bearingDeg ?? null;
  if (bearingDeg == null || Number.isNaN(bearingDeg)) {
    if (localPts.length >= 3) {
      bearingDeg = getLongestEdgeBearing(localPts);
    } else {
      bearingDeg = 0;
    }
  }

  const rad = (bearingDeg * Math.PI) / 180;
  const dirL = { x: Math.sin(rad), y: Math.cos(rad) };
  const dirW = { x: Math.cos(rad), y: -Math.sin(rad) };

  let startPt: LocalPoint;
  let totalLengthM = facility.lengthM ?? 0;
  let totalWidthM = facility.widthM ?? 0;

  if (localPts.length >= 3) {
    let minU = Infinity, maxU = -Infinity;
    let minV = Infinity, maxV = -Infinity;

    for (const pt of localPts) {
      const u = pt.x * dirL.x + pt.y * dirL.y;
      const v = pt.x * dirW.x + pt.y * dirW.y;
      if (u < minU) minU = u;
      if (u > maxU) maxU = u;
      if (v < minV) minV = v;
      if (v > maxV) maxV = v;
    }

    totalLengthM = maxU - minU;
    totalWidthM = maxV - minV;

    startPt = {
      x: minU * dirL.x + minV * dirW.x,
      y: minU * dirL.y + minV * dirW.y,
    };
  } else {
    const cLat = facility.centroidLat ?? refLat;
    const cLng = facility.centroidLng ?? refLng;
    const centerLocal = latLngToLocal(cLat, cLng, refLat, refLng);
    totalLengthM = totalLengthM > 0 ? totalLengthM : 100;
    totalWidthM = totalWidthM > 0 ? totalWidthM : 50;

    startPt = {
      x: centerLocal.x - (totalLengthM / 2) * dirL.x - (totalWidthM / 2) * dirW.x,
      y: centerLocal.y - (totalLengthM / 2) * dirL.y - (totalWidthM / 2) * dirW.y,
    };
  }

  if (totalLengthM <= 0 || totalWidthM <= 0) return [];

  const lengthSegments = buildAxisSegments(totalLengthM, lenStep);
  const widthSegments = buildAxisSegments(totalWidthM, widStep);

  for (const lengthSegment of lengthSegments) {
    for (const widthSegment of widthSegments) {
      const offsetL0 = lengthSegment.start;
      const offsetL1 = lengthSegment.end;
      const offsetW0 = widthSegment.start;
      const offsetW1 = widthSegment.end;

      const p0 = {
        x: startPt.x + offsetL0 * dirL.x + offsetW0 * dirW.x,
        y: startPt.y + offsetL0 * dirL.y + offsetW0 * dirW.y,
      };
      const p1 = {
        x: startPt.x + offsetL0 * dirL.x + offsetW1 * dirW.x,
        y: startPt.y + offsetL0 * dirL.y + offsetW1 * dirW.y,
      };
      const p2 = {
        x: startPt.x + offsetL1 * dirL.x + offsetW1 * dirW.x,
        y: startPt.y + offsetL1 * dirL.y + offsetW1 * dirW.y,
      };
      const p3 = {
        x: startPt.x + offsetL1 * dirL.x + offsetW0 * dirW.x,
        y: startPt.y + offsetL1 * dirL.y + offsetW0 * dirW.y,
      };

      if (localPts.length >= 3) {
        const clipped = normalizeLocalPolygon(clipLocalPolygon([p0, p1, p2, p3], localPts));
        const areaSqm = polygonAreaSqm(clipped);
        if (clipped.length < 3 || areaSqm < MIN_GRID_AREA_SQM) continue;

        const center = localPolygonCentroid(clipped);

        results.push({
          sampleCode: `SAM-${sampleCounter}`,
          index: sampleCounter,
          polygon: clipped.map((pt) => localToLatLng(pt.x, pt.y, refLat, refLng)),
          centerLatLng: localToLatLng(center.x, center.y, refLat, refLng),
          lengthM: roundToDecimeter(projectedSpan(clipped, dirL)),
          widthM: roundToDecimeter(projectedSpan(clipped, dirW)),
          areaSqm: roundToDecimeter(areaSqm),
        });
      } else {
        const localPolygon = [p0, p1, p2, p3];
        const center = localPolygonCentroid(localPolygon);
        results.push({
          sampleCode: `SAM-${sampleCounter}`,
          index: sampleCounter,
          polygon: [
            localToLatLng(p0.x, p0.y, refLat, refLng),
            localToLatLng(p1.x, p1.y, refLat, refLng),
            localToLatLng(p2.x, p2.y, refLat, refLng),
            localToLatLng(p3.x, p3.y, refLat, refLng),
          ],
          centerLatLng: localToLatLng(center.x, center.y, refLat, refLng),
          lengthM: roundToDecimeter(lengthSegment.size),
          widthM: roundToDecimeter(widthSegment.size),
          areaSqm: roundToDecimeter(polygonAreaSqm(localPolygon)),
        });
      }

      sampleCounter++;
    }
  }

  return results;
}
export interface FacilityConcreteBlock {
  blockCode: string; // e.g. "SAM-1 Slab A"
  sampleCode: string; // e.g. "SAM-1"
  blockLabel: string; // e.g. "Slab A"
  index: number;
  polygon: LatLng[];
  centerLatLng: LatLng;
  lengthM: number;
  widthM: number;
  areaSqm: number;
}

// Generate sub-grid blok concrete (P x L m per blok) di dalam sampel / fasilitas
export function generateFacilityConcreteBlocks(
  facility: {
    code: string;
    centroidLat?: number | null;
    centroidLng?: number | null;
    bearingDeg?: number | null;
    lengthM?: number | null;
    widthM?: number | null;
    sampleLengthM?: number | null;
    sampleWidthM?: number | null;
    blockLengthM?: number | null;
    blockWidthM?: number | null;
    slabDirection?: 'FORWARD' | 'REVERSE' | string | null;
    locationMode?: string | null;
  },
  arpLat?: number,
  arpLng?: number,
  polygonVertices?: LatLng[]
): FacilityConcreteBlock[] {
  const bLen = facility.blockLengthM && facility.blockLengthM > 0 ? facility.blockLengthM : 5;
  const bWid = facility.blockWidthM && facility.blockWidthM > 0 ? facility.blockWidthM : 5;
  const reverseSlabOrder = facility.slabDirection === 'REVERSE';

  const samples = generateFacilitySampleGrids(
    facility,
    facility.sampleLengthM || 20,
    facility.sampleWidthM || 20,
    arpLat,
    arpLng,
    polygonVertices
  );

  if (samples.length === 0) return [];

  const refLat = arpLat ?? (polygonVertices && polygonVertices.length > 0 ? polygonVertices[0].lat : facility.centroidLat);
  const refLng = arpLng ?? (polygonVertices && polygonVertices.length > 0 ? polygonVertices[0].lng : facility.centroidLng);
  if (refLat == null || refLng == null || !Number.isFinite(refLat) || !Number.isFinite(refLng)) return [];

  const facilityLocalPts = polygonVertices && polygonVertices.length >= 3 ? toLocalPoly(polygonVertices, refLat, refLng) : [];

  // Gunakan bearing konsisten dari fasilitas induk
  let bearingDeg = facility.bearingDeg ?? null;
  if (bearingDeg == null || Number.isNaN(bearingDeg)) {
    if (facilityLocalPts.length >= 3) {
      bearingDeg = getLongestEdgeBearing(facilityLocalPts);
    } else {
      bearingDeg = 0;
    }
  }

  const rad = (bearingDeg * Math.PI) / 180;
  const dirL = { x: Math.sin(rad), y: Math.cos(rad) };
  const dirW = { x: Math.cos(rad), y: -Math.sin(rad) };

  const results: FacilityConcreteBlock[] = [];
  let totalBlockIdx = 1;

  samples.forEach((sample) => {
    const sPolyLocal = toLocalPoly(sample.polygon, refLat, refLng);
    if (sPolyLocal.length < 3) return;

    let minU = Infinity, maxU = -Infinity;
    let minV = Infinity, maxV = -Infinity;

    for (const pt of sPolyLocal) {
      const u = pt.x * dirL.x + pt.y * dirL.y;
      const v = pt.x * dirW.x + pt.y * dirW.y;
      if (u < minU) minU = u;
      if (u > maxU) maxU = u;
      if (v < minV) minV = v;
      if (v > maxV) maxV = v;
    }

    const totalL = maxU - minU;
    const totalW = maxV - minV;
    const lengthSegments = buildAxisSegments(totalL, bLen);
    const widthSegments = buildAxisSegments(totalW, bWid);

    const startPt = {
      x: minU * dirL.x + minV * dirW.x,
      y: minU * dirL.y + minV * dirW.y,
    };

    const blockCandidates: {
      polygon: LatLng[];
      centerLatLng: LatLng;
      lengthM: number;
      widthM: number;
      areaSqm: number;
    }[] = [];

    for (const lengthSegment of lengthSegments) {
      for (const widthSegment of widthSegments) {
        const offL0 = lengthSegment.start;
        const offL1 = lengthSegment.end;
        const offW0 = widthSegment.start;
        const offW1 = widthSegment.end;

        const p0 = {
          x: startPt.x + offL0 * dirL.x + offW0 * dirW.x,
          y: startPt.y + offL0 * dirL.y + offW0 * dirW.y,
        };
        const p1 = {
          x: startPt.x + offL1 * dirL.x + offW0 * dirW.x,
          y: startPt.y + offL1 * dirL.y + offW0 * dirW.y,
        };
        const p2 = {
          x: startPt.x + offL1 * dirL.x + offW1 * dirW.x,
          y: startPt.y + offL1 * dirL.y + offW1 * dirW.y,
        };
        const p3 = {
          x: startPt.x + offL0 * dirL.x + offW1 * dirW.x,
          y: startPt.y + offL0 * dirL.y + offW1 * dirW.y,
        };

        const clipped = normalizeLocalPolygon(clipLocalPolygon([p0, p1, p2, p3], sPolyLocal));
        const areaSqm = polygonAreaSqm(clipped);
        if (clipped.length < 3 || areaSqm < MIN_GRID_AREA_SQM) continue;

        const polyLatLng = clipped.map((pt) => localToLatLng(pt.x, pt.y, refLat, refLng));
        const center = localPolygonCentroid(clipped);

        const centerLatLng = localToLatLng(center.x, center.y, refLat, refLng);

        const isFullLength = Math.abs(lengthSegment.size - bLen) < GRID_SNAP_EPSILON_M;
        const isFullWidth = Math.abs(widthSegment.size - bWid) < GRID_SNAP_EPSILON_M;

        blockCandidates.push({
          polygon: polyLatLng,
          centerLatLng,
          lengthM: isFullLength ? bLen : roundToDecimeter(projectedSpan(clipped, dirL)),
          widthM: isFullWidth ? bWid : roundToDecimeter(projectedSpan(clipped, dirW)),
          areaSqm: (isFullLength && isFullWidth && clipped.length === 4) 
            ? roundToDecimeter(bLen * bWid) 
            : roundToDecimeter(areaSqm),
        });
      }
    }

    // Penamaan dilakukan setelah clipping supaya huruf selalu kontigu. Membalik
    // kandidat per sampel memindahkan Slab A ke sudut diagonal sebaliknya tanpa
    // mengubah geometri, luas, atau kode SAM induknya.
    const orderedCandidates = reverseSlabOrder ? [...blockCandidates].reverse() : blockCandidates;
    orderedCandidates.forEach((candidate, blockCounterInSample) => {
      const letter = String.fromCharCode(65 + (blockCounterInSample % 26));
      const numSuffix = blockCounterInSample >= 26 ? Math.floor(blockCounterInSample / 26) + 1 : '';
      const blockLabel = `Slab ${letter}${numSuffix}`;

      results.push({
        ...candidate,
        blockCode: `${sample.sampleCode} ${blockLabel}`,
        sampleCode: sample.sampleCode,
        blockLabel,
        index: totalBlockIdx++,
      });
    });
  });

  return results;
}

// Generate blok concrete dengan snapping presisi seperti tampilan Admin:
// polygon di-resize dulu ke ukuran settingan fasilitas (P/L/bearing) sebelum
// di-grid, sehingga posisi & urutan Slab A/B/C... antara Admin dan Dashboard
// selalu identik walaupun polygon asli hasil digitasi sedikit miring.
export function generateFacilityConcreteBlocksSnapped(
  facility: {
    code: string;
    centroidLat?: number | null;
    centroidLng?: number | null;
    bearingDeg?: number | null;
    lengthM?: number | null;
    widthM?: number | null;
    sampleLengthM?: number | null;
    sampleWidthM?: number | null;
    blockLengthM?: number | null;
    blockWidthM?: number | null;
    slabDirection?: 'FORWARD' | 'REVERSE' | string | null;
    locationMode?: string | null;
  },
  polygonVertices?: LatLng[]
): FacilityConcreteBlock[] {
  const { lengthM, widthM, bearingDeg } = facility;
  let verts = polygonVertices;
  if (verts && verts.length >= 3 && lengthM && widthM && lengthM > 0 && widthM > 0) {
    verts = resizePolygonToDimensions(verts, lengthM, widthM, bearingDeg ?? undefined);
  }
  return generateFacilityConcreteBlocks(facility, undefined, undefined, verts);
}

// Gunakan polygon yang sama dengan grid pada peta/Admin untuk penamaan SAM.
export function generateFacilitySampleGridsSnapped(
  facility: {
    code: string;
    centroidLat?: number | null;
    centroidLng?: number | null;
    bearingDeg?: number | null;
    lengthM?: number | null;
    widthM?: number | null;
    sampleLengthM?: number | null;
    sampleWidthM?: number | null;
  },
  arpLat?: number,
  arpLng?: number,
  polygonVertices?: LatLng[]
): FacilitySampleGrid[] {
  const { lengthM, widthM, bearingDeg } = facility;
  const verts = polygonVertices && lengthM && widthM && lengthM > 0 && widthM > 0
    ? resizePolygonToDimensions(polygonVertices, lengthM, widthM, bearingDeg ?? undefined)
    : polygonVertices;
  return generateFacilitySampleGrids(
    facility,
    facility.sampleLengthM || 20,
    facility.sampleWidthM || 20,
    arpLat,
    arpLng,
    verts
  );
}

export function findConcreteBlockForPoint(
  lat: number,
  lng: number,
  blocks: FacilityConcreteBlock[]
): FacilityConcreteBlock | null {
  const p = { lat, lng };
  for (const b of blocks) {
    if (isPointInPolygon(p, b.polygon)) return b;
  }
  return null;
}


export function findSampleCodeForPoint(
  lat: number,
  lng: number,
  sampleGrids: { sampleCode: string; polygon: LatLng[] }[]
): string | null {
  for (const grid of sampleGrids) {
    if (isPointInPolygon({ lat, lng }, grid.polygon)) {
      return grid.sampleCode;
    }
  }
  return null;
}


export function getFacilityStationOffsetM(
  facility: {
    code: string;
    polygonJson?: string | null;
    centroidLat?: number | null;
    centroidLng?: number | null;
    bearingDeg?: number | null;
    lengthM?: number | null;
    stationDirection?: string | null;
  },
  pt: LatLng,
  arpLat: number,
  arpLng: number
): { offsetM: number; totalLengthM: number; axisX: number; axisY: number } | null {
  const isReverse = facility.stationDirection === 'REVERSE';

  let centroidLat = facility.centroidLat;
  let centroidLng = facility.centroidLng;
  let bearingDeg = facility.bearingDeg;
  let lengthM = facility.lengthM;

  if (facility.polygonJson) {
    try {
      const poly = JSON.parse(facility.polygonJson) as LatLng[];
      if (poly.length >= 3) {
        const metrics = computePolygonMetrics(poly, arpLat, arpLng);
        if (metrics.centroid) {
          centroidLat = metrics.centroid.lat;
          centroidLng = metrics.centroid.lng;
          if (bearingDeg == null || !Number.isFinite(bearingDeg)) bearingDeg = metrics.bearingDeg;
          lengthM = metrics.lengthM > 0 ? metrics.lengthM : lengthM;
        }
      }
    } catch {
      // JSON parse error
    }
  }

  if (bearingDeg != null && lengthM != null && centroidLat != null && centroidLng != null && lengthM > 0) {
    const c = latLngToLocal(centroidLat, centroidLng, arpLat, arpLng);
    const p = latLngToLocal(pt.lat, pt.lng, arpLat, arpLng);
    const rad = (bearingDeg * Math.PI) / 180;
    const dir = { x: Math.sin(rad), y: Math.cos(rad) };

    const t = (p.x - c.x) * dir.x + (p.y - c.y) * dir.y;
    let offsetM = Math.max(0, Math.min(lengthM, t + lengthM / 2));
    if (isReverse) {
      offsetM = lengthM - offsetM;
    }
    return { offsetM, totalLengthM: lengthM, axisX: dir.x, axisY: dir.y };
  }

  return null;
}

export function calculateFacilityStation(
  facility: {
    code: string;
    polygonJson?: string | null;
    centroidLat?: number | null;
    centroidLng?: number | null;
    bearingDeg?: number | null;
    lengthM?: number | null;
    stationDirection?: string | null;
    stationIntervalM?: number | null;
  },
  pt: LatLng,
  arpLat: number,
  arpLng: number
): {
  offsetM: number;
  stationText: string;
  subSegmentCode: string;
} | null {
  const data = getFacilityStationOffsetM(facility, pt, arpLat, arpLng);
  if (!data) return null;

  const seg = formatStationSegment(data.offsetM, data.totalLengthM, getFacilityStationIntervalM(facility));
  const subSegmentCode = `${facility.code} [${seg.staStartStr}-${seg.staEndStr}]`;

  return {
    offsetM: Math.round(data.offsetM * 10) / 10,
    stationText: seg.stationText,
    subSegmentCode,
  };
}

export function calculateFacilityStation10m(
  facility: Parameters<typeof calculateFacilityStation>[0],
  pt: LatLng,
  arpLat: number,
  arpLng: number
) {
  return calculateFacilityStation({ ...facility, stationIntervalM: 10 }, pt, arpLat, arpLng);
}

export function runwayStation(
  facility: { code: string; centroidLat: number; centroidLng: number; bearingDeg: number; lengthM: number },
  pt: LatLng,
  arpLat: number,
  arpLng: number
): string | null {
  const result = calculateFacilityStation10m(facility, pt, arpLat, arpLng);
  return result ? result.stationText : null;
}

// Resize titik-titik polygon agar sesuai dengan target Panjang (m) dan target Lebar (m)
export function closestEquivalentBearing(axisBearingDeg: number, preferredBearingDeg: number): number {
  const axis = ((axisBearingDeg % 180) + 180) % 180;
  const opposite = axis + 180;
  const distance = (a: number, b: number) => Math.abs((((a - b + 540) % 360) + 360) % 360 - 180);
  return distance(opposite, preferredBearingDeg) < distance(axis, preferredBearingDeg)
    ? opposite
    : axis;
}

export function resizePolygonToDimensions(
  vertices: LatLng[],
  targetLengthM: number,
  targetWidthM: number,
  targetBearingDeg?: number
): LatLng[] {
  if (vertices.length < 3 || targetLengthM <= 0 || targetWidthM <= 0) return vertices;

  const centroid = {
    lat: vertices.reduce((s, v) => s + v.lat, 0) / vertices.length,
    lng: vertices.reduce((s, v) => s + v.lng, 0) / vertices.length,
  };

  const metrics = computePolygonMetrics(vertices, centroid.lat, centroid.lng);
  const currentLength = metrics.lengthM || 1;
  const currentWidth = metrics.widthM || 1;
  const bearing = targetBearingDeg ?? metrics.bearingDeg;
  const targetRad = (bearing * Math.PI) / 180;
  const targetLengthAxis = { x: Math.sin(targetRad), y: Math.cos(targetRad) };
  const targetWidthAxis = { x: Math.cos(targetRad), y: -Math.sin(targetRad) };

  // Jika polygon adalah 4 titik (segiempat baku), buat rect presisi di sekeliling centroid
  if (vertices.length === 4) {
    const halfL = targetLengthM / 2;
    const halfW = targetWidthM / 2;
    const localCorners = [
      { length: -halfL, width: -halfW },
      { length: -halfL, width: halfW },
      { length: halfL, width: halfW },
      { length: halfL, width: -halfW },
    ];

    return localCorners.map((pt) => {
      const x = pt.length * targetLengthAxis.x + pt.width * targetWidthAxis.x;
      const y = pt.length * targetLengthAxis.y + pt.width * targetWidthAxis.y;
      return localToLatLng(x, y, centroid.lat, centroid.lng);
    });
  }

  // Untuk polygon dengan > 4 vertex, gunakan scaling proporsional terhadap sumbu OBB
  const scaleL = targetLengthM / currentLength;
  const scaleW = targetWidthM / currentWidth;
  // OBB hanya menyimpan arah 0–179°; pilih cabang terdekat agar polygon
  // asimetris tidak berbalik 180° pada setiap Simpan.
  const sourceBearing = closestEquivalentBearing(metrics.bearingDeg, bearing);
  const sourceRad = (sourceBearing * Math.PI) / 180;
  const sourceLengthAxis = { x: Math.sin(sourceRad), y: Math.cos(sourceRad) };
  const sourceWidthAxis = { x: Math.cos(sourceRad), y: -Math.sin(sourceRad) };

  const localPts = toLocalPoly(vertices, centroid.lat, centroid.lng);

  const scaledPts = localPts.map((p) => {
    const lengthOffset = (p.x * sourceLengthAxis.x + p.y * sourceLengthAxis.y) * scaleL;
    const widthOffset = (p.x * sourceWidthAxis.x + p.y * sourceWidthAxis.y) * scaleW;

    return {
      x: lengthOffset * targetLengthAxis.x + widthOffset * targetWidthAxis.x,
      y: lengthOffset * targetLengthAxis.y + widthOffset * targetWidthAxis.y,
    };
  });

  return scaledPts.map((p) => localToLatLng(p.x, p.y, centroid.lat, centroid.lng));
}

export interface SplitDamageItem {
  stationText: string;
  subSegmentCode: string;
  sampleCode?: string;
  lat: number;
  lng: number;
  localX: number;
  localY: number;
  lengthM: number;
  widthM: number;
  areaSqm: number;
  rectJson: string;
  // Geometri pecahan tepat; rectJson tetap geometri asal agar temuan grouped
  // dapat dibagi ulang bila interval STA/SAM fasilitas berubah.
  clippedVertices?: LatLng[];
  clippedPaths?: LatLng[][];
}

// Deteksi fasilitas tempat titik/polygon kerusakan berada
export function findFacilityForPoint(
  pt: LatLng,
  facilities: {
    id: string;
    code: string;
    type: string;
    polygonJson?: string | null;
    centroidLat?: number | null;
    centroidLng?: number | null;
    bearingDeg?: number | null;
    lengthM?: number | null;
    widthM?: number | null;
    surfaceType?: string | null;
    stationDirection?: string | null;
    locationMode?: string | null;
    sampleLengthM?: number | null;
    sampleWidthM?: number | null;
    blockLengthM?: number | null;
    blockWidthM?: number | null;
  }[],
  arpLat: number,
  arpLng: number
): (typeof facilities)[0] | null {
  const pLoc = latLngToLocal(pt.lat, pt.lng, arpLat, arpLng);

  // 1. Cek apakah titik ada di dalam polygonJson fasilitas mana pun
  for (const fac of facilities) {
    if (!fac.polygonJson) continue;
    try {
      const poly = JSON.parse(fac.polygonJson) as LatLng[];
      if (poly.length >= 3) {
        const facLocs = toLocalPoly(poly, arpLat, arpLng);
        if (pointInPolygon(pLoc, facLocs)) {
          return fac;
        }
      }
    } catch {
      // ignore JSON parse error
    }
  }

  // 2. Jika tidak di dalam polygon mana pun, cari fasilitas terdekat berdasarkan jarak centroid
  let minDistance = Infinity;
  let nearestFac: (typeof facilities)[0] | null = null;

  for (const fac of facilities) {
    if (fac.centroidLat == null || fac.centroidLng == null) continue;
    const cLoc = latLngToLocal(fac.centroidLat, fac.centroidLng, arpLat, arpLng);
    const d = distM(pLoc, cLoc);
    if (d < minDistance) {
      minDistance = d;
      nearestFac = fac;
    }
  }

  return nearestFac;
}

// Pemecahan kerusakan berdasarkan interval STA fasilitas.
export function splitDamageByStation(
  facility: {
    id: string;
    code: string;
    polygonJson?: string | null;
    centroidLat?: number | null;
    centroidLng?: number | null;
    bearingDeg?: number | null;
    lengthM?: number | null;
    widthM?: number | null;
    stationDirection?: string | null;
    stationIntervalM?: number | null;
  },
  vertices: LatLng[],
  arpLat: number,
  arpLng: number
): SplitDamageItem[] {
  if (vertices.length < 2) return [];

  const metrics = computePolygonMetrics(vertices, arpLat, arpLng);
  const totalArea = metrics.areaSqm || 0.1;
  const totalLength = metrics.lengthM || 0.1;
  const widthM = metrics.widthM || 0.1;

  // Cek apakah offset stationing bisa dihitung
  const firstOffsetRes = getFacilityStationOffsetM(facility, vertices[0], arpLat, arpLng);

  if (!firstOffsetRes) {
    // Tanpa data stationing fasilitas lengkap, kembalikan 1 item tunggal
    const center = metrics.centroid ?? vertices[0];
    const loc = latLngToLocal(center.lat, center.lng, arpLat, arpLng);
    return [
      {
        stationText: facility.code,
        subSegmentCode: facility.code,
        lat: center.lat,
        lng: center.lng,
        localX: loc.x,
        localY: loc.y,
        lengthM: totalLength,
        widthM,
        areaSqm: totalArea,
        rectJson: JSON.stringify(vertices),
      },
    ];
  }

  const facilityLength = firstOffsetRes.totalLengthM;
  const intervalM = getFacilityStationIntervalM(facility);

  // Hitung offset meter untuk setiap vertex polygon
  const offsets = vertices.map((v) => {
    const res = getFacilityStationOffsetM(facility, v, arpLat, arpLng);
    return res ? res.offsetM : 0;
  });

  const minOffset = Math.min(...offsets);
  const maxOffset = Math.max(...offsets);
  const spanM = maxOffset - minOffset;

  const firstSegmentIndex = Math.floor(minOffset / intervalM);
  const lastSegmentExclusive = Math.ceil(maxOffset / intervalM);

  // Satu interval saja, termasuk titik yang tepat di batas akhir fasilitas.
  if (lastSegmentExclusive - firstSegmentIndex <= 1) {
    const midM = (minOffset + maxOffset) / 2;
    const seg = formatStationSegment(midM, facilityLength, intervalM);
    const center = metrics.centroid ?? vertices[0];
    const loc = latLngToLocal(center.lat, center.lng, arpLat, arpLng);
    return [
      {
        stationText: seg.stationText,
        subSegmentCode: `${facility.code} [${seg.staStartStr}-${seg.staEndStr}]`,
        lat: center.lat,
        lng: center.lng,
        localX: loc.x,
        localY: loc.y,
        lengthM: totalLength,
        widthM,
        areaSqm: totalArea,
        rectJson: JSON.stringify(vertices),
      },
    ];
  }

  // Pecah kerusakan pada setiap batas interval fasilitas.
  const items: SplitDamageItem[] = [];
  const center = metrics.centroid ?? vertices[0];
  const centerLocal = latLngToLocal(center.lat, center.lng, arpLat, arpLng);
  const centerOffset = getFacilityStationOffsetM(facility, center, arpLat, arpLng)?.offsetM
    ?? (minOffset + maxOffset) / 2;
  const direction = facility.stationDirection === 'REVERSE' ? -1 : 1;

  for (let index = firstSegmentIndex; index < lastSegmentExclusive; index++) {
    const sBound = index * intervalM;
    const eBound = sBound + intervalM;
    const overlapStart = Math.max(minOffset, sBound);
    const overlapEnd = Math.min(maxOffset, eBound);

    if (overlapEnd > overlapStart) {
      const segSpan = overlapEnd - overlapStart;
      const fraction = segSpan / spanM;
      const segArea = totalArea * fraction;
      const segLength = Math.round(totalLength * fraction * 10) / 10;
      const midM = (overlapStart + overlapEnd) / 2;

      // Pusat tiap pecahan harus berada pada intervalnya sendiri, bukan semua
      // menumpuk di centroid poligon asal.
      const shiftM = (midM - centerOffset) * direction;
      const segCenterLocal = {
        x: centerLocal.x + shiftM * firstOffsetRes.axisX,
        y: centerLocal.y + shiftM * firstOffsetRes.axisY,
      };
      const segCenterLatLng = localToLatLng(segCenterLocal.x, segCenterLocal.y, arpLat, arpLng);

      const segInfo = formatStationSegment(midM, facilityLength, intervalM);

      items.push({
        stationText: segInfo.stationText,
        subSegmentCode: `${facility.code} [${segInfo.staStartStr}-${segInfo.staEndStr}]`,
        lat: segCenterLatLng.lat,
        lng: segCenterLatLng.lng,
        localX: Math.round(segCenterLocal.x * 10) / 10,
        localY: Math.round(segCenterLocal.y * 10) / 10,
        lengthM: Math.max(0.1, segLength),
        widthM,
        areaSqm: segArea,
        rectJson: JSON.stringify(vertices),
      });
    }
  }

  return items;
}

type StationFacility = Parameters<typeof splitDamageByStation>[0];
type SampleFacility = Parameters<typeof splitDamageBySampleGrids>[0];

function interpolateLocal(a: LocalPoint, b: LocalPoint, t: number): LocalPoint {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function uniqueSortedFractions(fractions: number[]): number[] {
  return fractions
    .filter((t) => Number.isFinite(t) && t >= -1e-9 && t <= 1 + 1e-9)
    .map((t) => Math.max(0, Math.min(1, t)))
    .sort((a, b) => a - b)
    .filter((t, index, sorted) => index === 0 || t - sorted[index - 1] > 1e-9);
}

interface LocalLinePiece {
  code: string;
  stationText: string;
  sampleCode?: string;
  points: LocalPoint[];
}

function appendLocalLinePiece(
  pieces: LocalLinePiece[],
  code: string,
  stationText: string,
  sampleCode: string | undefined,
  start: LocalPoint,
  end: LocalPoint
): void {
  if (distM(start, end) <= 1e-8) return;
  const last = pieces[pieces.length - 1];
  if (last && last.code === code && distM(last.points[last.points.length - 1], start) <= 1e-6) {
    last.points.push(end);
  } else {
    pieces.push({ code, stationText, sampleCode, points: [start, end] });
  }
}

function linePiecesToItems(
  pieces: LocalLinePiece[],
  original: LatLng[],
  arpLat: number,
  arpLng: number
): SplitDamageItem[] {
  const rectJson = JSON.stringify(original);
  const grouped = new Map<string, {
    stationText: string;
    sampleCode?: string;
    lengthM: number;
    weightedX: number;
    weightedY: number;
    paths: LatLng[][];
  }>();
  for (const piece of pieces) {
    const path = piece.points.map((point) => localToLatLng(point.x, point.y, arpLat, arpLng));
    const metrics = lineFromPoints(path, arpLat, arpLng);
    const existing = grouped.get(piece.code) ?? {
      stationText: piece.stationText,
      sampleCode: piece.sampleCode,
      lengthM: 0,
      weightedX: 0,
      weightedY: 0,
      paths: [],
    };
    existing.lengthM += metrics.lengthM;
    existing.weightedX += metrics.centerLocal.x * metrics.lengthM;
    existing.weightedY += metrics.centerLocal.y * metrics.lengthM;
    existing.paths.push(path);
    grouped.set(piece.code, existing);
  }
  return [...grouped].map(([code, group]) => {
    const centerLocal = {
      x: group.weightedX / group.lengthM,
      y: group.weightedY / group.lengthM,
    };
    const center = localToLatLng(centerLocal.x, centerLocal.y, arpLat, arpLng);
    return {
      stationText: group.stationText,
      subSegmentCode: code,
      sampleCode: group.sampleCode,
      lat: center.lat,
      lng: center.lng,
      localX: centerLocal.x,
      localY: centerLocal.y,
      lengthM: group.lengthM,
      widthM: 0,
      areaSqm: 0,
      rectJson,
      clippedVertices: group.paths.length === 1 ? group.paths[0] : undefined,
      clippedPaths: group.paths,
    };
  });
}

// Proyeksi STA tanpa clamp supaya ujung garis di luar fasilitas tidak keliru
// ditambahkan ke STA pertama/terakhir.
function stationProjection(
  facility: StationFacility,
  arpLat: number,
  arpLng: number
): { center: LocalPoint; axis: LocalPoint; totalLengthM: number } | null {
  let centerLat = facility.centroidLat;
  let centerLng = facility.centroidLng;
  let bearingDeg = facility.bearingDeg;
  let lengthM = facility.lengthM;
  if (facility.polygonJson) {
    try {
      const poly = JSON.parse(facility.polygonJson) as LatLng[];
      if (Array.isArray(poly) && poly.length >= 3) {
        const metrics = computePolygonMetrics(poly, arpLat, arpLng);
        if (metrics.centroid) {
          centerLat = metrics.centroid.lat;
          centerLng = metrics.centroid.lng;
          if (bearingDeg == null || !Number.isFinite(bearingDeg)) bearingDeg = metrics.bearingDeg;
          lengthM = metrics.lengthM > 0 ? metrics.lengthM : lengthM;
        }
      }
    } catch { /* use facility dimensions */ }
  }
  if (centerLat == null || centerLng == null || bearingDeg == null || lengthM == null
    || !Number.isFinite(centerLat) || !Number.isFinite(centerLng)
    || !Number.isFinite(bearingDeg) || !Number.isFinite(lengthM) || lengthM <= 0) return null;
  const rad = bearingDeg * Math.PI / 180;
  const sign = facility.stationDirection === 'REVERSE' ? -1 : 1;
  return {
    center: latLngToLocal(centerLat, centerLng, arpLat, arpLng),
    axis: { x: sign * Math.sin(rad), y: sign * Math.cos(rad) },
    totalLengthM: lengthM,
  };
}

/** Panjang aktual setiap ruas polyline yang berada pada interval STA. */
export function splitPolylineByStation(
  facility: StationFacility,
  vertices: LatLng[],
  arpLat: number,
  arpLng: number
): SplitDamageItem[] {
  if (vertices.length < 2) return [];
  const projection = stationProjection(facility, arpLat, arpLng);
  const local = toLocalPoly(vertices, arpLat, arpLng);
  const pieces: LocalLinePiece[] = [];
  if (!projection) {
    for (let i = 1; i < local.length; i++) {
      appendLocalLinePiece(pieces, facility.code, facility.code, undefined, local[i - 1], local[i]);
    }
    return linePiecesToItems(pieces, vertices, arpLat, arpLng);
  }
  const { center, axis, totalLengthM } = projection;
  const intervalM = getFacilityStationIntervalM(facility);
  const offset = (point: LocalPoint) => totalLengthM / 2
    + (point.x - center.x) * axis.x + (point.y - center.y) * axis.y;

  for (let i = 1; i < local.length; i++) {
    const a = local[i - 1];
    const b = local[i];
    if (distM(a, b) <= 1e-8) continue;
    const startOffset = offset(a);
    const endOffset = offset(b);
    const delta = endOffset - startOffset;
    const cuts = [0, 1];
    if (Math.abs(delta) > 1e-9) {
      const min = Math.max(0, Math.min(startOffset, endOffset));
      const max = Math.min(totalLengthM, Math.max(startOffset, endOffset));
      for (let boundary = Math.ceil(min / intervalM) * intervalM;
        boundary <= max + 1e-8; boundary += intervalM) {
        cuts.push((boundary - startOffset) / delta);
      }
      cuts.push((0 - startOffset) / delta, (totalLengthM - startOffset) / delta);
    }
    const fractions = uniqueSortedFractions(cuts);
    for (let j = 1; j < fractions.length; j++) {
      const t0 = fractions[j - 1];
      const t1 = fractions[j];
      if (t1 - t0 <= 1e-9) continue;
      const midpointOffset = startOffset + delta * ((t0 + t1) / 2);
      if (midpointOffset < -1e-8 || midpointOffset > totalLengthM + 1e-8) continue;
      const segment = formatStationSegment(midpointOffset, totalLengthM, intervalM);
      appendLocalLinePiece(
        pieces,
        `${facility.code} [${segment.staStartStr}-${segment.staEndStr}]`,
        segment.stationText,
        undefined,
        interpolateLocal(a, b, t0),
        interpolateLocal(a, b, t1)
      );
    }
  }
  return linePiecesToItems(pieces, vertices, arpLat, arpLng);
}

// Pemecahan kerusakan berdasarkan grid sampel PCI (SAM-1, SAM-2, dst)
export function splitDamageBySampleGrids(
  facility: {
    id: string;
    code: string;
    polygonJson?: string | null;
    centroidLat?: number | null;
    centroidLng?: number | null;
    bearingDeg?: number | null;
    lengthM?: number | null;
    widthM?: number | null;
    surfaceType?: string | null;
    sampleLengthM?: number | null;
    sampleWidthM?: number | null;
    blockLengthM?: number | null;
    blockWidthM?: number | null;
    slabDirection?: 'FORWARD' | 'REVERSE' | string | null;
  },
  damageVertices: LatLng[],
  arpLat: number,
  arpLng: number
): SplitDamageItem[] {
  if (damageVertices.length < 2) return [];

  let facPoly: LatLng[] | undefined = undefined;
  if (facility.polygonJson) {
    try {
      facPoly = JSON.parse(facility.polygonJson);
    } catch {
      facPoly = undefined;
    }
  }

  let sGrids: { sampleCode: string; polygon: LatLng[] }[] = [];

  if (facility.surfaceType === 'CONCRETE') {
    const cBlocks = generateFacilityConcreteBlocksSnapped(facility, facPoly);
    sGrids = cBlocks.map((b) => ({
      sampleCode: b.blockCode,
      polygon: b.polygon,
    }));
  } else {
    sGrids = generateFacilitySampleGridsSnapped(facility, arpLat, arpLng, facPoly);
  }

  const metrics = computePolygonMetrics(damageVertices, arpLat, arpLng);
  const totalArea = metrics.areaSqm || 0.1;
  const totalLength = metrics.lengthM || 0.1;
  const totalWidth = metrics.widthM || 0.1;

  if (sGrids.length === 0) {
    const center = metrics.centroid ?? damageVertices[0];
    const loc = latLngToLocal(center.lat, center.lng, arpLat, arpLng);
    return [
      {
        stationText: 'SAM-1',
        subSegmentCode: `${facility.code} [SAM-1]`,
        sampleCode: 'SAM-1',
        lat: center.lat,
        lng: center.lng,
        localX: loc.x,
        localY: loc.y,
        lengthM: totalLength,
        widthM: totalWidth,
        areaSqm: totalArea,
        rectJson: JSON.stringify(damageVertices),
      },
    ];
  }

  const damageLocs = toLocalPoly(damageVertices, arpLat, arpLng);

  // Cari Bounding Box Kerusakan dalam koordinat lokal
  const dmgMinX = Math.min(...damageLocs.map((p) => p.x));
  const dmgMaxX = Math.max(...damageLocs.map((p) => p.x));
  const dmgMinY = Math.min(...damageLocs.map((p) => p.y));
  const dmgMaxY = Math.max(...damageLocs.map((p) => p.y));

  const items: SplitDamageItem[] = [];

  // Sampling grid titik (15x15 titik) di dalam bounding box kerusakan untuk mengukur rasio overlap presisi
  const N_SAMPLES = 15;
  const dx = (dmgMaxX - dmgMinX) / N_SAMPLES;
  const dy = (dmgMaxY - dmgMinY) / N_SAMPLES;

  const gridHits: { grid: (typeof sGrids)[0]; points: { x: number; y: number }[] }[] = [];

  sGrids.forEach((sg) => {
    const sgLocs = toLocalPoly(sg.polygon, arpLat, arpLng);
    const sgMinX = Math.min(...sgLocs.map((p) => p.x));
    const sgMaxX = Math.max(...sgLocs.map((p) => p.x));
    const sgMinY = Math.min(...sgLocs.map((p) => p.y));
    const sgMaxY = Math.max(...sgLocs.map((p) => p.y));

    // Cek Bounding Box overlap
    if (dmgMaxX < sgMinX || dmgMinX > sgMaxX || dmgMaxY < sgMinY || dmgMinY > sgMaxY) {
      return;
    }

    const hitPts: { x: number; y: number }[] = [];
    for (let ix = 0; ix <= N_SAMPLES; ix++) {
      const px = dmgMinX + ix * dx;
      for (let iy = 0; iy <= N_SAMPLES; iy++) {
        const py = dmgMinY + iy * dy;
        const pt = { x: px, y: py };
        if (pointInPolygon(pt, damageLocs) && pointInPolygon(pt, sgLocs)) {
          hitPts.push(pt);
        }
      }
    }

    if (hitPts.length > 0) {
      gridHits.push({ grid: sg, points: hitPts });
    }
  });

  if (gridHits.length === 0) {
    const center = metrics.centroid ?? damageVertices[0];
    const loc = latLngToLocal(center.lat, center.lng, arpLat, arpLng);
    const sc = findSampleCodeForPoint(center.lat, center.lng, sGrids) || sGrids[0].sampleCode;
    return [
      {
        stationText: sc,
        subSegmentCode: `${facility.code} [${sc}]`,
        sampleCode: sc,
        lat: center.lat,
        lng: center.lng,
        localX: loc.x,
        localY: loc.y,
        lengthM: totalLength,
        widthM: totalWidth,
        areaSqm: totalArea,
        rectJson: JSON.stringify(damageVertices),
      },
    ];
  }

  const totalHits = gridHits.reduce((acc, h) => acc + h.points.length, 0);

  gridHits.forEach(({ grid, points }) => {
    const fraction = points.length / Math.max(1, totalHits);
    const segArea = Math.max(0.1, Math.round(totalArea * fraction * 10) / 10);
    const segLength = Math.max(0.1, Math.round(totalLength * fraction * 10) / 10);

    const avgX = points.reduce((acc, p) => acc + p.x, 0) / points.length;
    const avgY = points.reduce((acc, p) => acc + p.y, 0) / points.length;
    const centerLatLng = localToLatLng(avgX, avgY, arpLat, arpLng);

    items.push({
      stationText: grid.sampleCode,
      subSegmentCode: `${facility.code} [${grid.sampleCode}]`,
      sampleCode: grid.sampleCode,
      lat: centerLatLng.lat,
      lng: centerLatLng.lng,
      localX: avgX,
      localY: avgY,
      lengthM: segLength,
      widthM: totalWidth,
      areaSqm: segArea,
      rectJson: JSON.stringify(damageVertices),
    });
  });

  return items;
}

function crossLocal(a: LocalPoint, b: LocalPoint): number {
  return a.x * b.y - a.y * b.x;
}

function segmentPolygonCutFractions(a: LocalPoint, b: LocalPoint, polygon: LocalPoint[]): number[] {
  const r = { x: b.x - a.x, y: b.y - a.y };
  const rLengthSq = r.x * r.x + r.y * r.y;
  if (rLengthSq <= 1e-16) return [];
  const fractions: number[] = [];
  for (let i = 0; i < polygon.length; i++) {
    const c = polygon[i];
    const d = polygon[(i + 1) % polygon.length];
    const s = { x: d.x - c.x, y: d.y - c.y };
    const fromA = { x: c.x - a.x, y: c.y - a.y };
    const denominator = crossLocal(r, s);
    if (Math.abs(denominator) <= 1e-10) {
      if (Math.abs(crossLocal(fromA, r)) <= 1e-7) {
        fractions.push((fromA.x * r.x + fromA.y * r.y) / rLengthSq);
        fractions.push(((d.x - a.x) * r.x + (d.y - a.y) * r.y) / rLengthSq);
      }
      continue;
    }
    const t = crossLocal(fromA, s) / denominator;
    const u = crossLocal(fromA, r) / denominator;
    if (t >= -1e-9 && t <= 1 + 1e-9 && u >= -1e-9 && u <= 1 + 1e-9) {
      fractions.push(t);
    }
  }
  return fractions;
}

function pointInOrOnLocalPolygon(point: LocalPoint, polygon: LocalPoint[]): boolean {
  if (pointInPolygon(point, polygon)) return true;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    const edge = { x: b.x - a.x, y: b.y - a.y };
    const fromA = { x: point.x - a.x, y: point.y - a.y };
    const edgeLenSq = edge.x * edge.x + edge.y * edge.y;
    if (edgeLenSq <= 1e-16) continue;
    const t = (fromA.x * edge.x + fromA.y * edge.y) / edgeLenSq;
    if (t >= -1e-9 && t <= 1 + 1e-9) {
      const closest = interpolateLocal(a, b, Math.max(0, Math.min(1, t)));
      if (distM(point, closest) <= 1e-6) return true;
    }
  }
  return false;
}

/** Klip ruas garis ke grid SAM atau slab beton, tanpa menggandakan bagian pada batas bersama. */
export function splitPolylineBySampleGrids(
  facility: SampleFacility,
  vertices: LatLng[],
  arpLat: number,
  arpLng: number
): SplitDamageItem[] {
  if (vertices.length < 2) return [];
  let facPoly: LatLng[] | undefined;
  if (facility.polygonJson) {
    try { facPoly = JSON.parse(facility.polygonJson) as LatLng[]; } catch { /* use fallback geometry */ }
  }
  const grids = facility.surfaceType === 'CONCRETE'
    ? generateFacilityConcreteBlocksSnapped(facility, facPoly).map((block) => ({
      sampleCode: block.blockCode,
      polygon: toLocalPoly(block.polygon, arpLat, arpLng),
    }))
    : generateFacilitySampleGridsSnapped(facility, arpLat, arpLng, facPoly).map((grid) => ({
      sampleCode: grid.sampleCode,
      polygon: toLocalPoly(grid.polygon, arpLat, arpLng),
    }));
  const local = toLocalPoly(vertices, arpLat, arpLng);
  const pieces: LocalLinePiece[] = [];
  if (grids.length === 0) {
    for (let i = 1; i < local.length; i++) {
      appendLocalLinePiece(pieces, `${facility.code} [SAM-1]`, 'SAM-1', 'SAM-1', local[i - 1], local[i]);
    }
    return linePiecesToItems(pieces, vertices, arpLat, arpLng);
  }

  for (let i = 1; i < local.length; i++) {
    const a = local[i - 1];
    const b = local[i];
    if (distM(a, b) <= 1e-8) continue;
    const fractions = uniqueSortedFractions([
      0, 1, ...grids.flatMap((grid) => segmentPolygonCutFractions(a, b, grid.polygon)),
    ]);
    for (let j = 1; j < fractions.length; j++) {
      const t0 = fractions[j - 1];
      const t1 = fractions[j];
      if (t1 - t0 <= 1e-9) continue;
      const midpoint = interpolateLocal(a, b, (t0 + t1) / 2);
      const grid = grids.find((candidate) => pointInOrOnLocalPolygon(midpoint, candidate.polygon));
      if (!grid) continue;
      appendLocalLinePiece(
        pieces,
        `${facility.code} [${grid.sampleCode}]`,
        grid.sampleCode,
        grid.sampleCode,
        interpolateLocal(a, b, t0),
        interpolateLocal(a, b, t1)
      );
    }
  }
  return linePiecesToItems(pieces, vertices, arpLat, arpLng);
}

export function rotatePolygon(vertices: LatLng[], angleDeg: number, arpLat: number, arpLng: number): LatLng[] {
  if (vertices.length === 0 || angleDeg === 0) return vertices;
  const rad = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  const locals = toLocalPoly(vertices, arpLat, arpLng);
  const cx = locals.reduce((sum, p) => sum + p.x, 0) / locals.length;
  const cy = locals.reduce((sum, p) => sum + p.y, 0) / locals.length;

  const rotatedLocals = locals.map((p) => {
    const dx = p.x - cx;
    const dy = p.y - cy;
    return {
      x: cx + (dx * cos - dy * sin),
      y: cy + (dx * sin + dy * cos),
    };
  });

  return rotatedLocals.map((p) => localToLatLng(p.x, p.y, arpLat, arpLng));
}

// Rotasi fasilitas memakai bearing searah jarum jam dari utara. rotatePolygon
// sendiri memakai sudut matematis berlawanan jarum jam pada sumbu timur/utara.
export function rotateFacilityPolygonClockwise(
  vertices: LatLng[],
  clockwiseDeg: number,
  currentBearingDeg?: number | null
): { vertices: LatLng[]; bearingDeg: number } {
  if (vertices.length < 3 || !Number.isFinite(clockwiseDeg)) {
    return {
      vertices,
      bearingDeg: currentBearingDeg != null && Number.isFinite(currentBearingDeg)
        ? ((currentBearingDeg % 360) + 360) % 360
        : 0,
    };
  }
  const centerLat = vertices.reduce((sum, vertex) => sum + vertex.lat, 0) / vertices.length;
  const centerLng = vertices.reduce((sum, vertex) => sum + vertex.lng, 0) / vertices.length;
  const startingBearing = currentBearingDeg != null && Number.isFinite(currentBearingDeg)
    ? currentBearingDeg
    : computePolygonMetrics(vertices, centerLat, centerLng).bearingDeg;
  return {
    vertices: rotatePolygon(vertices, -clockwiseDeg, centerLat, centerLng),
    bearingDeg: ((startingBearing + clockwiseDeg) % 360 + 360) % 360,
  };
}


// Helper serbaguna untuk mendapatkan label lokasi kerusakan (Sampel SAM-x vs Stationing STA) secara konsisten
export function getDamageLocationLabel(
  damage: {
    lat: number;
    lng: number;
    station?: string | null;
    sampleCode?: string | null;
    facility?: {
      code: string;
      centroidLat?: number | null;
      centroidLng?: number | null;
      bearingDeg?: number | null;
      lengthM?: number | null;
      widthM?: number | null;
      polygonJson?: string | null;
      locationMode?: string | null;
      sampleLengthM?: number | null;
      sampleWidthM?: number | null;
    } | null;
  },
  arpLat?: number,
  arpLng?: number
): { label: string; isSam: boolean } {
  const fac = damage.facility;
  const isSam = fac?.locationMode === 'SAM' || Boolean(damage.sampleCode) || (damage.station ? damage.station.startsWith('SAM-') : false);

  if (isSam) {
    if (damage.sampleCode) {
      return { label: damage.sampleCode.startsWith('SAM-') ? `Sampel ${damage.sampleCode}` : damage.sampleCode, isSam: true };
    }
    if (damage.station && (damage.station.startsWith('SAM-') || damage.station.includes('Blok'))) {
      return { label: damage.station.startsWith('SAM-') ? `Sampel ${damage.station}` : damage.station, isSam: true };
    }
    if (fac) {
      let poly = undefined;
      if (fac.polygonJson) { try { poly = JSON.parse(fac.polygonJson); } catch { poly = undefined; } }
      const sGrids = generateFacilitySampleGrids(
        fac,
        fac.sampleLengthM || 20,
        fac.sampleWidthM || 20,
        arpLat,
        arpLng,
        poly
      );
      const sc = findSampleCodeForPoint(damage.lat, damage.lng, sGrids);
      if (sc) return { label: `Sampel ${sc}`, isSam: true };
    }
    return { label: damage.sampleCode ? `Sampel ${damage.sampleCode}` : (damage.station || 'Sampel SAM-1'), isSam: true };
  }

  return { label: damage.station || fac?.code || 'Fasilitas Utama', isSam: false };
}


// Mengelompokkan list kerusakan berdasarkan groupId dan menghitung total volume & rincian lokasi
export function groupDamagesWithBreakdown<T extends Parameters<typeof getDamageLocationLabel>[0] & { id: string; groupId?: string | null; areaSqm: number }>(
  damages: T[],
  arpLat?: number,
  arpLng?: number
): {
  id: string;
  groupId?: string | null;
  mainDamage: T;
  parts: T[];
  totalAreaSqm: number;
  locationSummary: string;
  isSam: boolean;
}[] {
  const groupsMap = new Map<string, T[]>();

  damages.forEach((d) => {
    const key = d.groupId ? `grp_${d.groupId}` : `single_${d.id}`;
    if (!groupsMap.has(key)) {
      groupsMap.set(key, []);
    }
    groupsMap.get(key)!.push(d);
  });

  const result: {
    id: string;
    groupId?: string | null;
    mainDamage: T;
    parts: T[];
    totalAreaSqm: number;
    locationSummary: string;
    isSam: boolean;
  }[] = [];

  groupsMap.forEach((parts, key) => {
    const mainDamage = parts[0];
    const totalAreaSqm = parts.reduce((sum, p) => sum + (p.areaSqm || 0), 0);
    const locLabels = parts.map((p) => getDamageLocationLabel(p, arpLat, arpLng));
    const isSam = locLabels.some((l) => l.isSam);

    let locationSummary = '';
    if (parts.length === 1) {
      locationSummary = locLabels[0].label;
    } else {
      const uniqueLocs = Array.from(new Set(parts.map((p) => p.sampleCode || p.station || '—').filter(Boolean)));
      if (isSam) {
        locationSummary = `${uniqueLocs.join(', ')} (${parts.length} Sampel)`;
      } else {
        locationSummary = `${uniqueLocs[0]} ~ ${uniqueLocs[uniqueLocs.length - 1]} (${parts.length} STA)`;
      }
    }

    result.push({
      id: key,
      groupId: mainDamage.groupId || null,
      mainDamage,
      parts,
      totalAreaSqm,
      locationSummary,
      isSam,
    });
  });

  return result;
}
