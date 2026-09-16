'use client';

// Peta satelit ala Google Earth: polygon fasilitas, overlay DXF, rectangle kerusakan,
// titik marka, dan mode gambar rectangle untuk pencatatan kerusakan.
// Leaflet dimuat dinamis di sisi client (aman untuk SSR).

import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, Eye, EyeOff, Layers, MoveHorizontal } from 'lucide-react';
import type * as LeafletNS from 'leaflet';
import type { AppConfig, DamageTypeEntry, Facility, Damage, MarkingFinding, MapLayer } from '@/types';
import type { DxfEntity } from '@/lib/dxf';
import { DAMAGE_STATUS_LABEL, FACILITY_TYPE_COLORS, SEVERITY_LABEL, getDamageCode } from '@/lib/constants';
import { resolveDamageCatalogEntry } from '@/lib/damage-catalog';
import { damagePopupPhotoUrls } from '@/lib/damage-popup-photos';
import { geometryTypeForDamageUnit } from '@/lib/damage-drawing';
import {
  latLngToLocal,
  localToLatLng,
  rotatePolygonPoints,
  dxfToLatLng,
  rectFromCorners,
  rectFromCenterDimensions,
  polyFromPoints,
  lineFromPoints,
  pointFromPoint,
  parseRectangleDimensions,
  parseMeterInput,
  endpointAtDistanceM,
  directionFromAnchorToCursor,
  snapLatLngToOrtho,
  generateFacilityStationLines,
  generateFacilitySampleGrids,
  generateFacilityConcreteBlocksSnapped,
  resizePolygonToDimensions,
  findConcreteBlockForPoint,
  findFacilityForPoint,
  getDamageLocationLabel,
  type FacilityConcreteBlock,
  type LayerRef,
} from '@/lib/geo';

const STATION_LABEL_MIN_ZOOM = 18;
const SAMPLE_LABEL_MIN_ZOOM = 19;
const SLAB_LABEL_MIN_ZOOM = 21;

function syncGridLabelVisibility(map: LeafletNS.Map) {
  const container = map.getContainer();
  const zoom = map.getZoom();
  container.classList.toggle('airside-map--show-station-labels', zoom >= STATION_LABEL_MIN_ZOOM);
  container.classList.toggle('airside-map--show-sample-labels', zoom >= SAMPLE_LABEL_MIN_ZOOM);
}

function escapePopupText(value: unknown): string {
  const replacements: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return String(value ?? '').replace(/[&<>"']/g, (character) => replacements[character]);
}

export interface DrawnRect {
  corners: { lat: number; lng: number }[];
  geometryType?: 'POLYGON' | 'LINE' | 'POINT' | 'SLAB';
  count?: number;
  center: { lat: number; lng: number };
  centerLocal: { x: number; y: number };
  lengthM: number;
  widthM: number;
  areaSqm: number;
}

interface FacilityMapProps {
  facilities: Facility[];
  damages: Damage[];
  markings: MarkingFinding[];
  layers: MapLayer[];
  arpLat: number;
  arpLng: number;
  mapRotationDeg?: number;
  stationIntervalM?: number;
  damageTypesConfig?: DamageTypeEntry[] | null;
  damageCatalogs?: AppConfig['damageCatalogs'];
  drawMode: boolean;
  drawUnit?: 'PERCENT' | 'LENGTH' | 'COUNT';
  onDrawComplete: (rect: DrawnRect) => void;
  onCursorMove: (p: { lat: number; lng: number; x: number; y: number } | null) => void;
  onContextMenuDamage?: (d: Damage, pos: { x: number; y: number }) => void;
  editingGeometryDamage?: Damage | null;
  onSaveEditingGeometry?: (updatedRect: DrawnRect) => void;
  onCancelEditingGeometry?: () => void;
  onSelectFacility: (f: Facility) => void;
  flyTarget: { lat: number; lng: number; zoom?: number; key: number } | null;
  fitKey: number;
}

export default function FacilityMap(props: FacilityMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletNS.Map | null>(null);
  const LRef = useRef<typeof LeafletNS | null>(null);
  const layersRef = useRef<{
    facilities?: LeafletNS.LayerGroup;
    slabLabels?: LeafletNS.LayerGroup;
    dxf?: LeafletNS.LayerGroup;
    damages?: LeafletNS.LayerGroup;
    markings?: LeafletNS.LayerGroup;
    draw?: LeafletNS.LayerGroup;
    editGeometry?: LeafletNS.LayerGroup;
  }>({});

  const [editingCorners, setEditingCorners] = useState<{ lat: number; lng: number }[]>([]);
  const [mapReady, setMapReady] = useState(false);
  // Spoiler kanan-bawah: id fasilitas yang poligon/stationing/grid-nya disembunyikan.
  const [hiddenFacilityIds, setHiddenFacilityIds] = useState<Set<string>>(new Set());
  const [facilitySpoilerOpen, setFacilitySpoilerOpen] = useState(false);
  const toggleFacilityVisibility = useCallback((facilityId: string) => {
    setHiddenFacilityIds((previous) => {
      const next = new Set(previous);
      if (next.has(facilityId)) next.delete(facilityId); else next.add(facilityId);
      return next;
    });
  }, []);
  const [drawAnchorSelected, setDrawAnchorSelected] = useState(false);
  const [dimensionInput, setDimensionInput] = useState('');
  const [dimensionError, setDimensionError] = useState('');
  const dimensionInputRef = useRef<HTMLInputElement | null>(null);

  // ORTO (presisi sumbu) dan jarak presisi keyboard
  const [orthoOn, setOrthoOn] = useState(false);
  const orthoOnRef = useRef(false);
  const [distanceInput, setDistanceInput] = useState('');
  const cursorLatLngRef = useRef<{ lat: number; lng: number } | null>(null);

  // Simpan props terbaru untuk handler tanpa re-init
  const propsRef = useRef(props);
  useEffect(() => { propsRef.current = props; });
  const concreteBlocksRef = useRef<{ block: FacilityConcreteBlock; facility: Facility }[]>([]);
  const hoveredBlockRef = useRef<{ block: FacilityConcreteBlock; facility: Facility } | null>(null);
  const drawStateRef = useRef<{
    points: { lat: number; lng: number }[];
    previewShape: LeafletNS.Polyline | LeafletNS.Polygon | null;
    dimensionInput: string;
    distanceInput: string;
    completing: boolean;
  }>({
    points: [],
    previewShape: null,
    dimensionInput: '',
    distanceInput: '',
    completing: false,
  });

  const updateDimensionInput = useCallback((value: string) => {
    const nextValue = value.slice(0, 32);
    drawStateRef.current.dimensionInput = nextValue;
    setDimensionInput(nextValue);
    setDimensionError('');
  }, []);

  const updateDistanceInput = useCallback((value: string) => {
    const nextValue = value.replace(/[^\d.,]/g, '').slice(0, 16);
    drawStateRef.current.distanceInput = nextValue;
    setDistanceInput(nextValue);
  }, []);

  const toggleOrtho = useCallback(() => {
    const next = !orthoOnRef.current;
    orthoOnRef.current = next;
    setOrthoOn(next);
  }, []);

  const cancelCurrentDrawing = useCallback(() => {
    const drawLayer = layersRef.current.draw;
    if (drawLayer) drawLayer.clearLayers();
    drawStateRef.current = {
      points: [],
      previewShape: null,
      dimensionInput: '',
      distanceInput: '',
      completing: false,
    };
    hoveredBlockRef.current = null;
    setDrawAnchorSelected(false);
    setDimensionInput('');
    setDimensionError('');
    setDistanceInput('');
  }, []);

  const completeSizedRectangle = useCallback((rawInput?: string): boolean => {
    const L = LRef.current;
    const drawLayer = layersRef.current.draw;
    const st = drawStateRef.current;
    if (!L || !drawLayer || st.completing || st.points.length !== 1) return false;

    const parsed = parseRectangleDimensions(rawInput ?? st.dimensionInput);
    if (!parsed) {
      setDimensionError('Gunakan format panjang × lebar, misalnya 2x2.');
      return false;
    }

    const { facilities, arpLat: aLat, arpLng: aLng, onDrawComplete } = propsRef.current;
    const center = st.points[0];
    const facility = findFacilityForPoint(center, facilities, aLat, aLng);
    const bearingDeg = facility?.bearingDeg ?? 0;
    const drawn = rectFromCenterDimensions(
      center,
      parsed.lengthM,
      parsed.widthM,
      bearingDeg,
      aLat,
      aLng
    );

    st.completing = true;
    drawLayer.clearLayers();
    L.polygon(
      drawn.corners.map((corner) => [corner.lat, corner.lng] as [number, number]),
      { color: '#ef4444', weight: 2.5, fillColor: '#ef4444', fillOpacity: 0.4, pane: 'drawPane' }
    )
      .bindTooltip(
        `✅ ${parsed.lengthM} m × ${parsed.widthM} m = ${drawn.areaSqm.toFixed(1)} m² — Form simpan dibuka`,
        { direction: 'center', className: 'airside-label' }
      )
      .addTo(drawLayer);

    st.points = [];
    st.previewShape = null;
    st.dimensionInput = '';
    st.distanceInput = '';
    hoveredBlockRef.current = null;
    setDrawAnchorSelected(false);
    setDimensionInput('');
    setDimensionError('');
    setDistanceInput('');
    onDrawComplete({ ...drawn, geometryType: 'POLYGON' });
    return true;
  }, []);

  /** Tempatkan vertex berikutnya pada jarak presisi (meter) dari titik terakhir. */
  const placeVertexAtDistance = useCallback((raw: string): boolean => {
    const L = LRef.current;
    const drawLayer = layersRef.current.draw;
    const st = drawStateRef.current;
    if (!L || !drawLayer || st.completing || st.points.length === 0) return false;

    const distance = parseMeterInput(raw);
    if (distance == null || distance <= 0) return false;

    const { arpLat: aLat, arpLng: aLng } = propsRef.current;
    const anchor = st.points[st.points.length - 1];
    const cursor = cursorLatLngRef.current;
    if (!cursor) return false;

    const direction = directionFromAnchorToCursor(
      anchor, cursor, orthoOnRef.current, aLat, aLng,
      propsRef.current.mapRotationDeg ?? 0,
    );
    if (!direction) return false;

    const endpoint = endpointAtDistanceM(anchor, direction, distance, aLat, aLng);

    if (st.previewShape) {
      drawLayer.removeLayer(st.previewShape);
      st.previewShape = null;
    }

    L.circleMarker([endpoint.lat, endpoint.lng], {
      radius: 5, color: '#ef4444', fillColor: '#ffffff', fillOpacity: 1, weight: 2, pane: 'drawPane',
    })
      .addTo(drawLayer)
      .bindTooltip(`Titik ${st.points.length + 1} — ${distance} m`, { direction: 'top', className: 'airside-label' });

    st.points.push(endpoint);
    st.dimensionInput = '';
    st.distanceInput = '';
    setDimensionInput('');
    setDimensionError('');
    setDistanceInput('');
    setDrawAnchorSelected(false);
    return true;
  }, []);

  const refreshSlabLabels = useCallback(() => {
    const L = LRef.current;
    const map = mapRef.current;
    const group = layersRef.current.slabLabels;
    if (!L || !map || !group) return;

    group.clearLayers();
    if (map.getZoom() < SLAB_LABEL_MIN_ZOOM) return;
    const visibleBounds = map.getBounds().pad(0.15);

    concreteBlocksRef.current.forEach(({ block }) => {
      if (!visibleBounds.contains([block.centerLatLng.lat, block.centerLatLng.lng])) return;
      L.marker([block.centerLatLng.lat, block.centerLatLng.lng], {
        icon: L.divIcon({
          className: 'slab-label-marker',
          html: `<div class="slab-map-label">${block.blockLabel}</div>`,
          iconSize: [0, 0],
          iconAnchor: [0, 0],
        }),
        interactive: false,
        pane: 'stationMarkerPane',
      }).addTo(group);
    });
  }, []);

  // ===== Inisialisasi peta (sekali) =====
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import('leaflet')).default;
      if (cancelled || !containerRef.current || mapRef.current) return;
      LRef.current = L;
      const { arpLat, arpLng } = propsRef.current;
      const map = L.map(containerRef.current, {
        center: [arpLat || 0.9569, arpLng || 104.5311],
        zoom: 16,
        maxZoom: 22,
        zoomControl: true,
        attributionControl: true,
        preferCanvas: true,
      });
      // Citra satelit Esri World Imagery dengan maxNativeZoom: 18 dan maxZoom: 22 agar tidak pernah blank/missing tiles
      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        maxNativeZoom: 18,
        maxZoom: 22,
        attribution: 'Esri World Imagery',
      }).addTo(map);
      L.control.scale({ imperial: false, position: 'bottomleft' }).addTo(map);

      // Custom Panes: DXF (400), Markings (450), Fasilitas (500), Stationing (520-530), Kerusakan (650), Drawing Tool (750 - Paling Atas)
      const dxfPane = map.createPane('dxfPane');
      dxfPane.style.zIndex = '400';

      const markingsPane = map.createPane('markingsPane');
      markingsPane.style.zIndex = '450';

      const facilitiesPane = map.createPane('facilitiesPane');
      facilitiesPane.style.zIndex = '500';

      const stationPane = map.createPane('stationPane');
      stationPane.style.zIndex = '520';

      const stationMarkerPane = map.createPane('stationMarkerPane');
      stationMarkerPane.style.zIndex = '530';

      const damagesPane = map.createPane('damagesPane');
      damagesPane.style.zIndex = '650';

      const drawPane = map.createPane('drawPane');
      drawPane.style.zIndex = '750';
      // Renderer canvas Leaflet tetap berada di DOM setelah layer gambar dibersihkan.
      // Nonaktifkan hit-testing saat idle agar tidak menutupi damagePane di bawahnya.
      drawPane.style.pointerEvents = 'none';

      // Kanvas poligon edit tidak boleh berada di atas handle vertex.
      const editShapePane = map.createPane('editShapePane');
      editShapePane.style.zIndex = '760';
      editShapePane.style.pointerEvents = 'none';
      const editHandlesPane = map.createPane('editHandlesPane');
      editHandlesPane.style.zIndex = '800';
      editHandlesPane.style.pointerEvents = 'none';

      layersRef.current.facilities = L.layerGroup().addTo(map);
      layersRef.current.slabLabels = L.layerGroup().addTo(map);
      layersRef.current.dxf = L.layerGroup().addTo(map);
      layersRef.current.damages = L.layerGroup().addTo(map);
      layersRef.current.markings = L.layerGroup().addTo(map);
      layersRef.current.draw = L.layerGroup().addTo(map);
      layersRef.current.editGeometry = L.layerGroup().addTo(map);

      // Patch mouseEventToContainerPoint untuk rotasi peta presisi tanpa mengacaukan drag & crop tool
      const origMouseEventToContainerPoint = map.mouseEventToContainerPoint.bind(map);
      map.mouseEventToContainerPoint = function (e: MouseEvent) {
        const pt = origMouseEventToContainerPoint(e);
        const rot = propsRef.current.mapRotationDeg ?? 0;
        if (!rot) return pt;
        const container = map.getContainer();
        const rect = container.getBoundingClientRect();
        const cx = rect.width / 2;
        const cy = rect.height / 2;
        const dx = pt.x - cx;
        const dy = pt.y - cy;
        const rad = (-rot * Math.PI) / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);
        return L.point(cx + (dx * cos - dy * sin), cy + (dx * sin + dy * cos));
      };

      mapRef.current = map;

      map.on('mousemove', (e: LeafletNS.LeafletMouseEvent) => {
        const { arpLat: aLat, arpLng: aLng, drawMode } = propsRef.current;
        const local = latLngToLocal(e.latlng.lat, e.latlng.lng, aLat, aLng);
        propsRef.current.onCursorMove({ lat: e.latlng.lat, lng: e.latlng.lng, x: local.x, y: local.y });
        cursorLatLngRef.current = { lat: e.latlng.lat, lng: e.latlng.lng };

        const st = drawStateRef.current;
        if (!drawMode) return;
        const drawLayer = layersRef.current.draw;
        if (!drawLayer) return;

        const drawUnit = propsRef.current.drawUnit ?? 'PERCENT';
        // Sorotan otomatis per-blok concrete (Rigid Pavement) saat belum menggambar titik manual
        if (st.points.length === 0 && drawUnit !== 'LENGTH') {
          let foundBlock: { block: FacilityConcreteBlock; facility: Facility } | null = null;
          for (const item of concreteBlocksRef.current) {
            if (findConcreteBlockForPoint(e.latlng.lat, e.latlng.lng, [item.block])) {
              foundBlock = item;
              break;
            }
          }

          if (foundBlock) {
            if (
              hoveredBlockRef.current?.facility.id !== foundBlock.facility.id ||
              hoveredBlockRef.current?.block.index !== foundBlock.block.index
            ) {
              if (st.previewShape) {
                drawLayer.removeLayer(st.previewShape);
                st.previewShape = null;
              }
              hoveredBlockRef.current = foundBlock;
              const blk = foundBlock.block;
              st.previewShape = L.polygon(
                blk.polygon.map((p) => [p.lat, p.lng] as [number, number]),
                { color: '#f59e0b', weight: 3, fillColor: '#fbbf24', fillOpacity: 0.4, pane: 'drawPane' }
              )
                .bindTooltip(`<b>${blk.blockLabel}</b><br/>${blk.blockCode}<br/>${blk.lengthM}m × ${blk.widthM}m = ${blk.areaSqm} m²<br/><i>Shift+klik untuk pilih seluruh slab</i>`, {
                  direction: 'top',
                  className: 'airside-label',
                  sticky: true,
                })
                .addTo(drawLayer);
            }
            return;
          } else {
            if (hoveredBlockRef.current) {
              if (st.previewShape) {
                drawLayer.removeLayer(st.previewShape);
                st.previewShape = null;
              }
              hoveredBlockRef.current = null;
            }
          }
        }

        // Rubberband live preview saat menggambar polygon kerusakan
        if (st.points.length === 0) return;

        // Saat ukuran "panjang×lebar" sedang diketik, pertahankan preview berbasis
        // ukuran dan jangan menggantinya dengan rubberband posisi kursor.
        // Angka tunggal (jarak presisi) tetap ditampilkan sebagai preview endpoint.
        if (drawUnit === 'PERCENT' && st.points.length === 1 && st.dimensionInput.trim() && parseRectangleDimensions(st.dimensionInput)) return;

        if (st.previewShape) {
          drawLayer.removeLayer(st.previewShape);
          st.previewShape = null;
        }

        const tempPoints = (() => {
          const rawCursor = { lat: e.latlng.lat, lng: e.latlng.lng };
          const pendingRaw = (drawUnit === 'PERCENT' && st.points.length === 1) ? st.dimensionInput.trim() : st.distanceInput.trim();
          const pendingDistance = parseMeterInput(pendingRaw);
          if (pendingDistance != null && st.points.length >= 1) {
            const anchor = st.points[st.points.length - 1];
            const direction = directionFromAnchorToCursor(
              anchor, rawCursor, orthoOnRef.current, aLat, aLng,
              propsRef.current.mapRotationDeg ?? 0,
            );
            if (direction) {
              return [...st.points, endpointAtDistanceM(anchor, direction, pendingDistance, aLat, aLng)];
            }
            return [...st.points, rawCursor];
          }
          if (orthoOnRef.current && st.points.length >= 1) {
            const snapped = snapLatLngToOrtho(
              st.points[st.points.length - 1], rawCursor, aLat, aLng,
              propsRef.current.mapRotationDeg ?? 0,
            );
            return [...st.points, snapped.point];
          }
          return [...st.points, rawCursor];
        })();
        if (drawUnit === 'LENGTH') {
          const preview = lineFromPoints(tempPoints, aLat, aLng);
          st.previewShape = L.polyline(
            tempPoints.map((p) => [p.lat, p.lng] as [number, number]),
            { color: '#ef4444', weight: 5, dashArray: '6 4', pane: 'drawPane' }
          )
            .bindTooltip(`Panjang kerusakan: ${preview.lengthM.toFixed(1)} m`, {
              direction: 'top', className: 'airside-label', sticky: true,
            })
            .addTo(drawLayer);
        } else if (tempPoints.length === 2) {
          const rectPreview = rectFromCorners(tempPoints[0], tempPoints[1], aLat, aLng);
          st.previewShape = L.polygon(
            rectPreview.corners.map((c) => [c.lat, c.lng] as [number, number]),
            { color: '#ef4444', weight: 2, fillColor: '#ef4444', fillOpacity: 0.25, dashArray: '4 4', pane: 'drawPane' }
          )
            .bindTooltip(`Lebar: ${rectPreview.widthM.toFixed(1)} m, Panjang: ${rectPreview.lengthM.toFixed(1)} m (${rectPreview.areaSqm.toFixed(1)} m²)`, {
              direction: 'center',
              className: 'airside-label',
              sticky: true,
            })
            .addTo(drawLayer);
        } else if (tempPoints.length >= 3) {
          const drawnPreview = polyFromPoints(tempPoints, aLat, aLng);
          st.previewShape = L.polygon(
            tempPoints.map((p) => [p.lat, p.lng] as [number, number]),
            { color: '#ef4444', weight: 2, fillColor: '#ef4444', fillOpacity: 0.25, dashArray: '4 4', pane: 'drawPane' }
          )
            .bindTooltip(`Luas Area Kerusakan: ${drawnPreview.areaSqm.toFixed(1)} m² (${drawnPreview.lengthM}×${drawnPreview.widthM} m)`, {
              direction: 'center',
              className: 'airside-label',
              sticky: true,
            })
            .addTo(drawLayer);
        }
      });

      map.on('mouseout', () => {
        cursorLatLngRef.current = null;
        propsRef.current.onCursorMove(null);
      });

      const finishDrawing = () => {
        const st = drawStateRef.current;
        const { onDrawComplete, arpLat: aLat, arpLng: aLng } = propsRef.current;
        const drawUnit = propsRef.current.drawUnit ?? 'PERCENT';
        const drawLayer = layersRef.current.draw;
        if (st.completing) return;
        // Titik pusat area: ukuran presisi "2x2" → kotak, atau angka tunggal → jarak titik berikutnya.
        if (drawUnit === 'PERCENT' && st.points.length === 1 && st.dimensionInput.trim()) {
          if (parseRectangleDimensions(st.dimensionInput)) {
            completeSizedRectangle(st.dimensionInput);
            return;
          }
          if (parseMeterInput(st.dimensionInput) != null) {
            placeVertexAtDistance(st.dimensionInput);
            return;
          }
        }
        // Jarak presisi keyboard (meter): tempatkan titik berikutnya, jangan selesaikan gambar.
        if (st.distanceInput.trim() && st.points.length >= 1) {
          if (placeVertexAtDistance(st.distanceInput)) return;
        }
        if (!st.points || st.points.length < 2) return;
        const drawn: DrawnRect = drawUnit === 'LENGTH'
          ? { ...lineFromPoints(st.points, aLat, aLng), geometryType: geometryTypeForDamageUnit(drawUnit) }
          : { ...polyFromPoints(st.points, aLat, aLng), geometryType: geometryTypeForDamageUnit(drawUnit) };
        if (drawUnit === 'LENGTH' && drawn.lengthM < 0.05) return;
        if (drawUnit === 'PERCENT' && drawn.areaSqm < 0.01) return;
        st.completing = true;

        if (drawLayer && st.previewShape) {
          drawLayer.removeLayer(st.previewShape);
        }

        if (drawLayer) {
          const positions = drawn.corners.map((c) => [c.lat, c.lng] as [number, number]);
          if (drawUnit === 'LENGTH') {
            L.polyline(positions, { color: '#ef4444', weight: 5, pane: 'drawPane' })
              .bindTooltip(`Kerusakan: ${drawn.lengthM.toFixed(1)} m — Form simpan dibuka`, {
                direction: 'center', className: 'airside-label',
              }).addTo(drawLayer);
          } else {
            L.polygon(positions, { color: '#ef4444', weight: 2.5, fillColor: '#ef4444', fillOpacity: 0.4, pane: 'drawPane' })
              .bindTooltip(`Kerusakan: ${drawn.areaSqm.toFixed(1)} m² — Form simpan dibuka`, {
                direction: 'center', className: 'airside-label',
              }).addTo(drawLayer);
          }
        }

        st.points = [];
        st.previewShape = null;
        st.dimensionInput = '';
        st.distanceInput = '';
        hoveredBlockRef.current = null;
        setDrawAnchorSelected(false);
        setDimensionInput('');
        setDimensionError('');
        setDistanceInput('');

        onDrawComplete(drawn);
      };

      map.on('click', (e: LeafletNS.LeafletMouseEvent) => {
        const st = drawStateRef.current;
        const { drawMode, drawUnit = 'PERCENT', onDrawComplete, arpLat: aLat, arpLng: aLng } = propsRef.current;
        if (!drawMode || st.completing) return;
        const drawLayer = layersRef.current.draw;
        if (!drawLayer) return;

        // Shift+klik tetap menyediakan cara cepat untuk memilih seluruh slab.
        // Klik biasa selalu menjadi titik pusat agar input ukuran keyboard bekerja di area concrete.
        if (drawUnit !== 'LENGTH' && st.points.length === 0 && hoveredBlockRef.current && e.originalEvent.shiftKey) {
          const item = hoveredBlockRef.current;
          const blk = item.block;
          const drawn: DrawnRect = {
            corners: blk.polygon,
            center: blk.centerLatLng,
            centerLocal: latLngToLocal(blk.centerLatLng.lat, blk.centerLatLng.lng, aLat, aLng),
            lengthM: blk.lengthM,
            widthM: blk.widthM,
            areaSqm: blk.areaSqm,
            geometryType: drawUnit === 'COUNT' ? 'SLAB' : 'POLYGON',
            count: drawUnit === 'COUNT' ? 1 : undefined,
          };

          // Bersihkan preview hover lalu tampilkan polygon final slab terpilih
          if (st.previewShape) {
            drawLayer.removeLayer(st.previewShape);
            st.previewShape = null;
          }

          L.polygon(
            blk.polygon.map((p) => [p.lat, p.lng] as [number, number]),
            { color: '#ef4444', weight: 2.5, fillColor: '#ef4444', fillOpacity: 0.4, pane: 'drawPane' }
          )
            .bindTooltip(`✅ ${blk.blockCode} (${drawUnit === 'COUNT' ? '1 slab' : `${blk.areaSqm} m²`}) — Form simpan dibuka`, {
              direction: 'center',
              className: 'airside-label',
            })
            .addTo(drawLayer);

          st.completing = true;
          st.dimensionInput = '';
          hoveredBlockRef.current = null;
          setDrawAnchorSelected(false);
          setDimensionInput('');
          setDimensionError('');

          onDrawComplete(drawn);
          return;
        }

        const newPt = { lat: e.latlng.lat, lng: e.latlng.lng };

        // ORTO aktif: kunci titik baru pada sumbu layar (horizontal/vertikal) dari titik sebelumnya.
        const clickPt = (orthoOnRef.current && st.points.length >= 1)
          ? snapLatLngToOrtho(
            st.points[st.points.length - 1], newPt, aLat, aLng,
            propsRef.current.mapRotationDeg ?? 0,
          ).point
          : newPt;

        // Leaflet mengirim dua event click sebelum dblclick. Jangan simpan
        // vertex ganda pada posisi yang sama ketika gambar diselesaikan.
        const previousPt = st.points[st.points.length - 1];
        if (previousPt) {
          const previousLocal = latLngToLocal(previousPt.lat, previousPt.lng, aLat, aLng);
          const currentLocal = latLngToLocal(clickPt.lat, clickPt.lng, aLat, aLng);
          if (Math.hypot(previousLocal.x - currentLocal.x, previousLocal.y - currentLocal.y) < 0.05) return;
        }

        if (drawUnit === 'COUNT') {
          const drawn: DrawnRect = { ...pointFromPoint(clickPt, aLat, aLng), geometryType: 'POINT', count: 1 };
          drawLayer.clearLayers();
          L.circleMarker([clickPt.lat, clickPt.lng], { radius: 7, color: '#ef4444', fillColor: '#ef4444', fillOpacity: 0.8, pane: 'drawPane' })
            .bindTooltip('✅ 1 kejadian — Form simpan dibuka', { direction: 'top', className: 'airside-label' })
            .addTo(drawLayer);
          st.completing = true;
          hoveredBlockRef.current = null;
          onDrawComplete(drawn);
          return;
        }

        if (st.points.length === 0) {
          // Hilangkan preview slab; titik klik kini menjadi pusat untuk ukuran presisi.
          if (st.previewShape) {
            drawLayer.removeLayer(st.previewShape);
            st.previewShape = null;
          }
          hoveredBlockRef.current = null;
          st.dimensionInput = '';
          st.distanceInput = '';
          setDimensionInput('');
          setDimensionError('');
          setDistanceInput('');
          setDrawAnchorSelected(drawUnit === 'PERCENT');
        } else if (st.points.length === 1) {
          // Klik titik kedua berarti pengguna melanjutkan cara gambar manual.
          st.dimensionInput = '';
          st.distanceInput = '';
          setDimensionInput('');
          setDimensionError('');
          setDistanceInput('');
          setDrawAnchorSelected(false);
        }

        // Tambahkan titik marker vertex lingkaran
        L.circleMarker([clickPt.lat, clickPt.lng], { radius: 5, color: '#ef4444', fillColor: '#ffffff', fillOpacity: 1, weight: 2, pane: 'drawPane' })
          .addTo(drawLayer)
          .bindTooltip(st.points.length === 0 ? 'Titik pusat / Titik 1' : `Titik ${st.points.length + 1}`, {
            direction: 'top',
            className: 'airside-label',
          });

        st.points.push(clickPt);

        // Jika sudah ada 2 titik, maka pengguna bisa mengklik titik ke-3 atau double click untuk polygon
      });

      map.on('dblclick', (e: LeafletNS.LeafletMouseEvent) => {
        const { drawMode } = propsRef.current;
        if (!drawMode) return;
        L.DomEvent.stop(e as unknown as Event);
        finishDrawing();
      });

      // Klik kanan (contextmenu) — selesaikan polygon saat drawMode aktif
      map.on('contextmenu', (e: LeafletNS.LeafletMouseEvent) => {
        const { drawMode } = propsRef.current;
        if (!drawMode) return;
        L.DomEvent.stop(e as unknown as Event);
        finishDrawing();
      });

      // Keyboard shortcuts untuk input ukuran dan penyelesaian polygon.
      const onKeyDown = (e: KeyboardEvent) => {
        const { drawMode } = propsRef.current;
        if (!drawMode) return;

        const target = e.target as HTMLElement | null;
        if (
          target?.isContentEditable ||
          target?.tagName === 'INPUT' ||
          target?.tagName === 'TEXTAREA' ||
          target?.tagName === 'SELECT'
        ) {
          return;
        }

        const st = drawStateRef.current;
        const drawUnit = propsRef.current.drawUnit ?? 'PERCENT';

        // ORTO on/off (F8) — kunci arah ke sumbu horizontal/vertikal layar.
        if (e.key === 'F8') {
          e.preventDefault();
          toggleOrtho();
          return;
        }

        if ((propsRef.current.drawUnit ?? 'PERCENT') === 'PERCENT' && st.points.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
          const isDimensionCharacter = /^\d$/.test(e.key) || ['x', 'X', '×', '*', '.', ','].includes(e.key);
          if (isDimensionCharacter) {
            e.preventDefault();
            updateDimensionInput(`${st.dimensionInput}${e.key}`);
            return;
          }
          if (e.key === 'Backspace' && st.dimensionInput) {
            e.preventDefault();
            updateDimensionInput(st.dimensionInput.slice(0, -1));
            return;
          }
          // Angka mengalir ke distanceInput setelah titik kedua / mode garis / titik lanjutan.
        } else if (!e.ctrlKey && !e.metaKey && !e.altKey && st.points.length >= 1 && drawUnit !== 'COUNT') {
          const isNumberCharacter = /^\d$/.test(e.key) || ['.', ','].includes(e.key);
          if (isNumberCharacter) {
            e.preventDefault();
            updateDistanceInput(`${st.distanceInput}${e.key}`);
            return;
          }
          if (e.key === 'Backspace' && st.distanceInput) {
            e.preventDefault();
            updateDistanceInput(st.distanceInput.slice(0, -1));
            return;
          }
        }

        if (e.key === 'Enter') {
          e.preventDefault();
          finishDrawing();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          cancelCurrentDrawing();
        }
      };
      window.addEventListener('keydown', onKeyDown);
      // Simpan referensi agar bisa di-cleanup
      (map as unknown as Record<string, unknown>)._xairsideKeyDown = onKeyDown;
      const handleZoomEnd = () => {
        syncGridLabelVisibility(map);
        refreshSlabLabels();
      };
      syncGridLabelVisibility(map);
      map.on('zoomend', handleZoomEnd);
      map.on('moveend', refreshSlabLabels);
      setMapReady(true);
    })();
    return () => {
      cancelled = true;
      const m = mapRef.current;
      if (m) {
        const handler = (m as unknown as Record<string, unknown>)._xairsideKeyDown as EventListener | undefined;
        if (handler) window.removeEventListener('keydown', handler);
        m.remove();
      }
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Rotasi Container Peta dengan Transform CSS + Counter-Rotasi Mouse
  useEffect(() => {
    if (containerRef.current) {
      const rot = props.mapRotationDeg ?? 0;
      containerRef.current.style.transform = rot ? `rotate(${rot}deg)` : 'none';
      containerRef.current.style.transformOrigin = 'center center';
      containerRef.current.style.transition = 'transform 0.3s ease-out';
      if (mapRef.current) {
        mapRef.current.invalidateSize();
      }
    }
  }, [props.mapRotationDeg]);

  // ===== Fokus peta ke ARP saat config dimuat =====
  // Guard berbasis nilai ARP terakhir yang dipakai memusatkan peta, bukan boolean
  // sekali-jalan: saat kembali ke dashboard, peta bisa siap lebih dulu (chunk
  // sudah ter-cache) sebelum /api/config selesai, sehingga setView sempat
  // berjalan dengan koordinat default dan ARP asli tidak pernah diterapkan —
  // peta tampak tidak berada di lokasi bandara. SetView berulang hanya terjadi
  // jika nilai ARP benar-benar berubah (mis. disimpan lewat modal ARP).
  const arpCenteredRef = useRef<{ lat: number; lng: number } | null>(null);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !props.arpLat || !props.arpLng) return;
    const last = arpCenteredRef.current;
    if (last && last.lat === props.arpLat && last.lng === props.arpLng) return;
    arpCenteredRef.current = { lat: props.arpLat, lng: props.arpLng };
    map.setView([props.arpLat, props.arpLng], 16, { animate: false });
  }, [props.arpLat, props.arpLng, mapReady]);

  // ===== Polygon fasilitas & Garis Putus-putus Stationing =====
  useEffect(() => {
    const L = LRef.current;
    const map = mapRef.current;
    const group = layersRef.current.facilities;
    const slabLabels = layersRef.current.slabLabels;
    if (!L || !map || !group || !slabLabels) return;
    group.clearLayers();
    slabLabels.clearLayers();
    hoveredBlockRef.current = null;
    concreteBlocksRef.current = [];
    const allBlocks: { block: FacilityConcreteBlock; facility: Facility }[] = [];
    for (const f of props.facilities) {
      // Fasilitas disembunyikan lewat panel spoiler kanan-bawah peta.
      if (hiddenFacilityIds.has(f.id)) continue;
      if (!f.polygonJson) continue;
      let poly: { lat: number; lng: number }[] = [];
      try {
        poly = JSON.parse(f.polygonJson);
      } catch {
        continue;
      }
      if (poly.length < 3) continue;
      // Polygon presisi untuk grid SAM & slab: di-snap ke ukuran settingan fasilitas
      // (P/L/bearing) persis seperti tampilan Admin, supaya urutan & posisi Slab
      // di Dashboard selalu identik dengan Admin.
      const gridPoly =
        f.lengthM && f.widthM && f.lengthM > 0 && f.widthM > 0
          ? resizePolygonToDimensions(poly, f.lengthM, f.widthM, f.bearingDeg ?? undefined)
          : poly;
      const color = f.color || FACILITY_TYPE_COLORS[f.type] || '#38bdf8';
      const openDamages = props.damages.filter((d) => d.facilityId === f.id && d.status !== 'CLOSED').length;

      // Polygon dasar fasilitas (di facilitiesPane zIndex 550)
      L.polygon(
        poly.map((p) => [p.lat, p.lng] as [number, number]),
        { color, weight: 2, fillColor: color, fillOpacity: 0.18, pane: 'facilitiesPane', interactive: !props.drawMode, bubblingMouseEvents: false }
      )
        .bindTooltip(`${f.code} — ${f.name}`, { direction: 'center', className: 'airside-label' })
        .bindPopup(
          `<b>${f.code} — ${f.name}</b><br/>Tipe: ${f.type}<br/>${f.lengthM ? `Dimensi: ${f.lengthM} × ${f.widthM ?? '?'} m<br/>` : ''}${f.pcn ?? ''} ${f.pcr ? '<br/>' + f.pcr : ''}<br/>Temuan aktif: ${openDamages}`
        )
        .on('click', () => { if (!propsRef.current.drawMode) propsRef.current.onSelectFacility(f); })
        .addTo(group);

      if (f.locationMode === 'SAM') {
        // Grid Kotak-Kotak Sampel PCI (SAM-1, SAM-2, ...)
        const sampleGrids = generateFacilitySampleGrids(
          {
            code: f.code,
            centroidLat: f.centroidLat,
            centroidLng: f.centroidLng,
            bearingDeg: f.bearingDeg,
            lengthM: f.lengthM,
            widthM: f.widthM,
            sampleLengthM: f.sampleLengthM,
            sampleWidthM: f.sampleWidthM,
          },
          f.sampleLengthM || 20,
          f.sampleWidthM || 20,
          undefined,
          undefined,
          gridPoly
        );

        sampleGrids.forEach((sg) => {
          // Render kotak polygon sampel
          L.polygon(
            sg.polygon.map((p) => [p.lat, p.lng]),
            {
              color: '#c084fc', // warna purple/violet
              weight: 1.5,
              dashArray: '3 3',
              fillColor: '#c084fc',
              fillOpacity: 0.12,
              pane: 'stationPane',
              interactive: false,
            }
          ).addTo(group);

          // Render Badge Label SAM-x di pusat sampel
          L.marker([sg.centerLatLng.lat, sg.centerLatLng.lng], {
            icon: L.divIcon({
              className: 'sample-label-marker',
              html: `<div style="font-size:9px;font-family:monospace;font-weight:800;color:#fae8ff;background:rgba(88,28,135,0.92);padding:1.5px 5px;border-radius:4px;border:1px solid rgba(192,132,252,0.9);box-shadow:0 2px 5px rgba(0,0,0,0.6);white-space:nowrap;transform:translate(-50%,-50%);">${sg.sampleCode}</div>`,
              iconSize: [0, 0],
              iconAnchor: [0, 0],
            }),
            interactive: false,
            pane: 'stationMarkerPane',
          }).addTo(group);
        });
      } else {
        // Garis Putus-putus & Tulisan Kecil Stationing (STA)
        const intervalM = f.stationIntervalM || props.stationIntervalM || (f.lengthM && f.lengthM > 1000 ? 50 : 25);
        const stationLines = generateFacilityStationLines(
          {
            code: f.code,
            centroidLat: f.centroidLat,
            centroidLng: f.centroidLng,
            bearingDeg: f.bearingDeg,
            lengthM: f.lengthM,
            widthM: f.widthM,
            stationDirection: f.stationDirection,
          },
          intervalM,
          props.arpLat,
          props.arpLng,
          poly
        );

        stationLines.forEach((st) => {
          L.polyline(
            [
              [st.leftLatLng.lat, st.leftLatLng.lng],
              [st.rightLatLng.lat, st.rightLatLng.lng],
            ],
            {
              color: '#f59e0b',
              weight: 1.5,
              dashArray: '4 3',
              opacity: 0.9,
              pane: 'stationPane',
              interactive: false,
            }
          ).addTo(group);

          L.marker([st.rightLatLng.lat, st.rightLatLng.lng], {
            icon: L.divIcon({
              className: 'station-label-marker',
              html: `<div style="font-size:9px;font-family:monospace;font-weight:700;color:#fef08a;background:rgba(15,23,42,0.95);padding:2px 5px;border-radius:4px;border:1px solid rgba(245,158,11,0.9);box-shadow:0 2px 6px rgba(0,0,0,0.8);text-shadow:0 1px 2px #000;white-space:nowrap;transform:translate(4px,-50%) rotate(${st.textRotationDeg}deg);transform-origin:left center">${st.stationText}</div>`,
              iconSize: [0, 0],
              iconAnchor: [0, 0],
            }),
            interactive: false,
            pane: 'stationMarkerPane',
          }).addTo(group);
        });
      }

      // Render Grid per-Slab untuk Fasilitas Concrete (Rigid Pavement) — di luar SAM/STA
      if (f.surfaceType === 'CONCRETE') {
        const blocks = generateFacilityConcreteBlocksSnapped(
          {
            code: f.code,
            centroidLat: f.centroidLat,
            centroidLng: f.centroidLng,
            bearingDeg: f.bearingDeg,
            lengthM: f.lengthM,
            widthM: f.widthM,
            sampleLengthM: f.sampleLengthM,
            sampleWidthM: f.sampleWidthM,
            blockLengthM: f.blockLengthM,
            blockWidthM: f.blockWidthM,
            slabDirection: f.slabDirection,
            locationMode: f.locationMode,
          },
          gridPoly
        );

        blocks.forEach((b) => {
          allBlocks.push({ block: b, facility: f });

          // Garis batas slab — hijau emerald supaya jelas berbeda dari garis
          // sampel SAM (ungu) dan garis STA (amber), serta tetap terbaca di
          // atas permukaan beton pada citra satelit.
          L.polygon(
            b.polygon.map((p) => [p.lat, p.lng]),
            {
              color: '#34d399',
              weight: 1.2,
              dashArray: '3 2',
              fillColor: 'transparent',
              fillOpacity: 0,
              pane: 'stationPane',
              interactive: false,
            }
          ).addTo(group);

        });
      }
    }
    concreteBlocksRef.current = allBlocks;
    refreshSlabLabels();
  }, [props.facilities, props.damages, props.arpLat, props.arpLng, props.drawMode, props.stationIntervalM, hiddenFacilityIds, mapReady, refreshSlabLabels]);

  // ===== Overlay DXF =====
  useEffect(() => {
    const L = LRef.current;
    const map = mapRef.current;
    const group = layersRef.current.dxf;
    if (!L || !map || !group) return;
    group.clearLayers();
    const latlngs = (dx: number, dy: number, ref: LayerRef): [number, number] => {
      const p = dxfToLatLng(dx, dy, ref);
      return [p.lat, p.lng];
    };
    for (const layer of props.layers) {
      if (!layer.visible) continue;
      const ref: LayerRef = {
        refLat: layer.refLat,
        refLng: layer.refLng,
        rotationDeg: layer.rotationDeg,
        scale: layer.scale,
      };
      let textCount = 0;
      for (const ent of layer.entities as DxfEntity[]) {
        if (ent.type === 'line') {
          L.polyline([latlngs(ent.a.x, ent.a.y, ref), latlngs(ent.b.x, ent.b.y, ref)], {
            color: '#22d3ee', weight: 1.5, opacity: 0.9, pane: 'dxfPane'
          }).addTo(group);
        } else if (ent.type === 'poly') {
          L.polyline(ent.points.map((p) => latlngs(p.x, p.y, ref)), {
            color: '#22d3ee', weight: 1.5, opacity: 0.9, pane: 'dxfPane'
          }).addTo(group);
        } else if (ent.type === 'circle') {
          L.circle(latlngs(ent.c.x, ent.c.y, ref), {
            radius: ent.r * ref.scale, color: '#22d3ee', weight: 1.5, fill: false, opacity: 0.9, pane: 'dxfPane'
          }).addTo(group);
        } else if (ent.type === 'text' && textCount < 400) {
          textCount++;
          L.marker(latlngs(ent.p.x, ent.p.y, ref), {
            icon: L.divIcon({
              className: 'dxf-text-label',
              html: `<span>${ent.text.replace(/</g, '&lt;')}</span>`,
            }),
            interactive: false,
            pane: 'dxfPane'
          }).addTo(group);
        } else if (ent.type === 'point') {
          L.circleMarker(latlngs(ent.p.x, ent.p.y, ref), {
            radius: 2, color: '#67e8f9', fillOpacity: 1, pane: 'dxfPane'
          }).addTo(group);
        }
      }
    }
  }, [props.layers, mapReady]);

  // ===== Rectangle kerusakan =====
  useEffect(() => {
    const L = LRef.current;
    const map = mapRef.current;
    const group = layersRef.current.damages;
    if (!L || !map || !group) return;
    group.clearLayers();
    const sevColor: Record<string, string> = { L: '#eab308', M: '#f97316', H: '#ef4444', '-': '#64748b' };
    const groupPartsById = new Map<string, Damage[]>();
    const renderedDamageKeys = new Set<string>();
    const editingGroupId = props.editingGeometryDamage?.groupId;

    props.damages.forEach((damage) => {
      if (!damage.groupId) return;
      const parts = groupPartsById.get(damage.groupId) ?? [];
      parts.push(damage);
      groupPartsById.set(damage.groupId, parts);
    });

    for (const d of props.damages) {
      // Semua pecahan dalam satu group memakai geometri yang sama; render sekali.
      if (
        props.editingGeometryDamage?.id === d.id
        || (editingGroupId && d.groupId === editingGroupId)
      ) continue;

      const renderKey = d.groupId || d.id;
      if (renderedDamageKeys.has(renderKey)) continue;
      renderedDamageKeys.add(renderKey);

      const color = sevColor[d.severity] || '#ef4444';
      const facility = props.facilities.find((item) => item.id === d.facilityId) ?? d.facility;
      const surface = facility?.surfaceType === 'CONCRETE' ? 'JPCP'
        : facility?.surfaceType === 'ASPHALT' ? 'ASPHALT' : null;
      const catalogEntry = surface ? resolveDamageCatalogEntry(
        d.type, surface, props.damageCatalogs?.[surface] ?? [], props.damageTypesConfig,
      ) : null;
      const damageCode = catalogEntry?.code ?? getDamageCode(d.type, props.damageTypesConfig);
      const damageName = catalogEntry?.name ?? d.type;
      let corners: [number, number][] = [];
      if (d.rectJson) {
        try {
          const parsed = JSON.parse(d.rectJson) as { lat: number; lng: number }[];
          if (Array.isArray(parsed)) {
            corners = parsed.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng))
              .map((p) => [p.lat, p.lng]);
          }
        } catch {
          corners = [];
        }
      }
      const geometryType = d.geometryType ?? (corners.length >= 3 ? 'POLYGON' : corners.length >= 2 ? 'LINE' : 'POINT');

      const groupParts = d.groupId ? groupPartsById.get(d.groupId) ?? [d] : [d];
      const totalGroupArea = groupParts.reduce((sum, p) => sum + (p.areaSqm || 0), 0);
      const totalGroupLength = groupParts.reduce((sum, p) => sum + (p.lengthM || 0), 0);
      const totalGroupCount = groupParts.reduce((sum, p) => sum + (p.count || 0), 0);
      const measureLabel = geometryType === 'LINE' ? 'Panjang total'
        : geometryType === 'POINT' ? 'Jumlah kejadian'
          : geometryType === 'SLAB' ? 'Jumlah slab' : 'Luas total';
      const measureValue = geometryType === 'LINE' ? `${totalGroupLength.toFixed(1)} m`
        : geometryType === 'POINT' || geometryType === 'SLAB'
          ? `${totalGroupCount || 1} ${geometryType === 'SLAB' ? 'slab' : 'kejadian'}`
          : `${totalGroupArea.toFixed(1)} m²`;

      const locInfo = getDamageLocationLabel(d, props.arpLat, props.arpLng);
      const locationLabels = Array.from(new Set(
        groupParts.map((part) => getDamageLocationLabel(part, props.arpLat, props.arpLng).label),
      ));
      const locationSummary = locationLabels.length > 1
        ? `${locationLabels[0]} – ${locationLabels[locationLabels.length - 1]}`
        : locationLabels[0] || locInfo.label;
      const statusLabel = DAMAGE_STATUS_LABEL[d.status] ?? d.status;
      const severityLabel = SEVERITY_LABEL[d.severity] ?? d.severity;
      const coverageLabel = locInfo.isSam ? 'Sampel' : 'Station';
      const photoUrls = damagePopupPhotoUrls(groupParts);
      const photosHtml = photoUrls.length > 0 ? `
          <div class="damage-map-popup__photos">
            <div class="damage-map-popup__photos-title">Foto Kerusakan${photoUrls.length > 1 ? ` (${photoUrls.length})` : ''}</div>
            <div class="damage-map-popup__photo-list">
              ${photoUrls.map((url, index) => `
                <a class="damage-map-popup__photo-link" href="${escapePopupText(url)}" target="_blank" rel="noopener noreferrer" aria-label="Buka foto kerusakan ${index + 1} dari ${photoUrls.length} dalam ukuran penuh">
                  <img src="${escapePopupText(url)}" alt="Foto kerusakan ${index + 1}" loading="lazy" decoding="async" referrerpolicy="no-referrer" />
                </a>
              `).join('')}
            </div>
            ${photoUrls.length > 1 ? '<div class="damage-map-popup__photos-hint">Geser untuk melihat foto lainnya</div>' : ''}
          </div>
        ` : '';

      const popup = `
        <div class="damage-map-popup" style="--damage-accent:${color}">
          <div class="damage-map-popup__badges">
            <span class="damage-map-popup__code">${escapePopupText(damageCode)}</span>
            <span class="damage-map-popup__severity" title="${escapePopupText(severityLabel)}">${escapePopupText(d.severity)}</span>
            <span class="damage-map-popup__status">${escapePopupText(statusLabel)}</span>
          </div>
          <div class="damage-map-popup__title" title="${escapePopupText(damageName)}">${escapePopupText(damageName)}</div>
          <dl class="damage-map-popup__details">
            <div>
              <dt>${coverageLabel}</dt>
              <dd title="${escapePopupText(locationSummary)}">${escapePopupText(locationSummary)}</dd>
            </div>
            <div>
              <dt>${measureLabel}</dt>
              <dd>${measureValue}</dd>
            </div>
            ${groupParts.length > 1 ? `
              <div>
                <dt>Cakupan</dt>
                <dd>${groupParts.length} bagian</dd>
              </div>
            ` : ''}
          </dl>
          ${photosHtml}
          <div class="damage-map-popup__hint">
            Klik kanan untuk tindakan
          </div>
        </div>
      `;


      const onRightClick = (e: LeafletNS.LeafletMouseEvent) => {
        if (!propsRef.current.drawMode) {
          if (e.originalEvent) {
            e.originalEvent.preventDefault();
            e.originalEvent.stopPropagation();
          }
          L.DomEvent.stopPropagation(e);
          map.closePopup();
          propsRef.current.onContextMenuDamage?.(d, {
            x: e.originalEvent?.clientX ?? 0,
            y: e.originalEvent?.clientY ?? 0,
          });
        }
      };

      let centerLat = d.lat;
      let centerLng = d.lng;

      if (geometryType === 'LINE' && corners.length >= 2) {
        const midpoint = lineFromPoints(corners.map(([lat, lng]) => ({ lat, lng })), props.arpLat, props.arpLng).center;
        centerLat = midpoint.lat;
        centerLng = midpoint.lng;
        L.polyline(corners, { color, weight: 6, pane: 'damagesPane', interactive: !props.drawMode, bubblingMouseEvents: false })
          .bindPopup(popup, { className: 'damage-map-popup-shell', minWidth: 210, maxWidth: 230 })
          .on('contextmenu', onRightClick)
          .addTo(group);
      } else if ((geometryType === 'POLYGON' || geometryType === 'SLAB') && corners.length >= 3) {
        centerLat = corners.reduce((sum, c) => sum + c[0], 0) / corners.length;
        centerLng = corners.reduce((sum, c) => sum + c[1], 0) / corners.length;
        L.polygon(corners, { color, weight: 2.5, fillColor: color, fillOpacity: 0.45, pane: 'damagesPane', interactive: !props.drawMode, bubblingMouseEvents: false })
          .bindPopup(popup, { className: 'damage-map-popup-shell', minWidth: 210, maxWidth: 230 })
          .on('contextmenu', onRightClick)
          .addTo(group);
      } else {
        if (corners.length === 1) {
          centerLat = corners[0][0];
          centerLng = corners[0][1];
        }
        L.circleMarker([centerLat, centerLng], { radius: 7, color, fillColor: color, fillOpacity: 0.9, pane: 'damagesPane', interactive: !props.drawMode, bubblingMouseEvents: false })
          .bindPopup(popup, { className: 'damage-map-popup-shell', minWidth: 210, maxWidth: 230 })
          .on('contextmenu', onRightClick)
          .addTo(group);
      }

      // Label Marker Kode Kerusakan di Atas Polygon/Marker
      const codeLabelIcon = L.divIcon({
        className: 'damage-code-label',
        html: `<div style="
          background: rgba(15, 23, 42, 0.88);
          color: #ffffff;
          font-weight: 800;
          font-size: 10px;
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
          padding: 1.5px 5px;
          border-radius: 4px;
          border: 1px solid ${color};
          box-shadow: 0 1px 4px rgba(0,0,0,0.5);
          white-space: nowrap;
          transform: translate(-50%, -50%);
          pointer-events: none;
          display: flex;
          align-items: center;
          gap: 3px;
        ">
          <span>${escapePopupText(damageCode)}</span>
          <span style="background:${color}; color:#ffffff; font-size:8.5px; padding:0 3px; border-radius:2px; font-weight:900;">${d.severity}</span>
        </div>`,
        iconSize: [0, 0],
        iconAnchor: [0, 0],
      });

      L.marker([centerLat, centerLng], {
        icon: codeLabelIcon,
        pane: 'damagesPane',
        interactive: false,
      }).addTo(group);
    }
  }, [props.damages, props.facilities, props.damageCatalogs, props.damageTypesConfig, props.arpLat, props.arpLng, props.drawMode, props.editingGeometryDamage, mapReady]);

  // ===== Titik temuan marka (yang memiliki koordinat) =====
  useEffect(() => {
    const L = LRef.current;
    const map = mapRef.current;
    const group = layersRef.current.markings;
    if (!L || !map || !group) return;
    group.clearLayers();
    const condColor: Record<string, string> = { BAIK: '#22c55e', PERLU_PERBAIKAN: '#f59e0b', USANG: '#ef4444' };
    for (const m of props.markings) {
      if (m.lat == null || m.lng == null) continue;
      const color = condColor[m.condition] || '#f59e0b';
      L.circleMarker([m.lat, m.lng], { radius: 5, color, fillColor: color, fillOpacity: 0.9, pane: 'markingsPane' })
        .bindPopup(`<b>Marka: ${m.markingType}</b><br/>Kondisi: ${m.condition}<br/>Station: ${m.station ?? '-'}<br/>Status: ${m.status}`)
        .addTo(group);
    }
  }, [props.markings, mapReady]);

  // Fokuskan input segera setelah pengguna memilih titik pusat.
  useEffect(() => {
    if (!props.drawMode || props.drawUnit === 'LENGTH' || props.drawUnit === 'COUNT' || !drawAnchorSelected) return;
    dimensionInputRef.current?.focus({ preventScroll: true });
  }, [props.drawMode, props.drawUnit, drawAnchorSelected]);

  // Preview rectangle presisi diperbarui langsung selama ukuran diketik.
  useEffect(() => {
    const L = LRef.current;
    const drawLayer = layersRef.current.draw;
    const st = drawStateRef.current;
    if (!L || !drawLayer || !props.drawMode || props.drawUnit === 'LENGTH' || props.drawUnit === 'COUNT' || !drawAnchorSelected || st.points.length !== 1 || st.completing) {
      return;
    }

    if (st.previewShape) {
      drawLayer.removeLayer(st.previewShape);
      st.previewShape = null;
    }

    const parsed = parseRectangleDimensions(dimensionInput);
    if (!parsed) return;

    const center = st.points[0];
    const facility = findFacilityForPoint(center, props.facilities, props.arpLat, props.arpLng);
    const preview = rectFromCenterDimensions(
      center,
      parsed.lengthM,
      parsed.widthM,
      facility?.bearingDeg ?? 0,
      props.arpLat,
      props.arpLng
    );

    st.previewShape = L.polygon(
      preview.corners.map((corner) => [corner.lat, corner.lng] as [number, number]),
      {
        color: '#ef4444',
        weight: 2,
        fillColor: '#ef4444',
        fillOpacity: 0.28,
        dashArray: '4 4',
        pane: 'drawPane',
      }
    )
      .bindTooltip(
        `${parsed.lengthM} m × ${parsed.widthM} m = ${preview.areaSqm.toFixed(1)} m²`,
        { direction: 'center', className: 'airside-label' }
      )
      .addTo(drawLayer);
  }, [
    dimensionInput,
    drawAnchorSelected,
    props.drawMode,
    props.drawUnit,
    props.facilities,
    props.arpLat,
    props.arpLng,
  ]);

  // ===== Mode gambar on/off =====
  useEffect(() => {
    const map = mapRef.current;
    const group = layersRef.current.draw;
    if (!map || !group) return;
    const drawPane = map.getPane('drawPane');
    const editShapePane = map.getPane('editShapePane');
    const editHandlesPane = map.getPane('editHandlesPane');
    const resetUiFrame = window.requestAnimationFrame(() => {
      setDrawAnchorSelected(false);
      setDimensionInput('');
      setDimensionError('');
      setDistanceInput('');
    });
    if (!props.drawMode) {
      hoveredBlockRef.current = null;
      drawStateRef.current = {
        points: [],
        previewShape: null,
        dimensionInput: '',
        distanceInput: '',
        completing: false,
      };
      group.clearLayers();
      map.getContainer().style.cursor = '';
      // Re-enable interaksi normal
      map.doubleClickZoom.enable();
      const facPane = map.getPane('facilitiesPane');
      const dmgPane = map.getPane('damagesPane');
      if (facPane) facPane.style.pointerEvents = '';
      if (dmgPane) dmgPane.style.pointerEvents = '';
      if (drawPane) drawPane.style.pointerEvents = 'none';
    } else {
      // Saat satuan berganti, geometri sementara dari mode lama tidak boleh
      // ikut tersimpan sebagai tipe gambar yang baru.
      group.clearLayers();
      drawStateRef.current.points = [];
      drawStateRef.current.previewShape = null;
      drawStateRef.current.completing = false;
      drawStateRef.current.dimensionInput = '';
      drawStateRef.current.distanceInput = '';
      hoveredBlockRef.current = null;
      map.getContainer().style.cursor = 'crosshair';
      // Disable double-click zoom & pointer-events pada pane fasilitas/damages
      // agar klik tidak "menembus" ke polygon fasilitas/damage di bawah drawPane
      map.doubleClickZoom.disable();
      const facPane = map.getPane('facilitiesPane');
      const dmgPane = map.getPane('damagesPane');
      if (facPane) facPane.style.pointerEvents = 'none';
      if (dmgPane) dmgPane.style.pointerEvents = 'none';
      if (drawPane) drawPane.style.pointerEvents = 'auto';
      // Focus map container agar keyboard shortcut (Enter/Escape) aktif
      const container = map.getContainer();
      if (!container.getAttribute('tabindex')) container.setAttribute('tabindex', '0');
      container.focus();
    }
    const editing = Boolean(props.editingGeometryDamage) && !props.drawMode;
    if (editShapePane) editShapePane.style.pointerEvents = editing ? 'auto' : 'none';
    if (editHandlesPane) editHandlesPane.style.pointerEvents = editing ? 'auto' : 'none';
    return () => window.cancelAnimationFrame(resetUiFrame);
  }, [props.drawMode, props.drawUnit, props.editingGeometryDamage, mapReady]);

  // ===== Fly ke titik =====
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !props.flyTarget) return;
    map.flyTo([props.flyTarget.lat, props.flyTarget.lng], props.flyTarget.zoom ?? 18, { duration: 0.8 });
  }, [props.flyTarget, mapReady]);

  // ===== Fit bounds semua fasilitas =====
  const handledFitKeyRef = useRef(0);
  useEffect(() => {
    const L = LRef.current;
    const map = mapRef.current;
    // Reload data setelah edit mengganti array fasilitas. Jangan ulangi fit
    // untuk permintaan lama karena zoom pengguna di lokasi kerusakan akan hilang.
    if (!L || !map || !props.fitKey || props.fitKey === handledFitKeyRef.current) return;
    const bounds: [number, number][] = [];
    for (const f of props.facilities) {
      if (!f.polygonJson) continue;
      try {
        (JSON.parse(f.polygonJson) as { lat: number; lng: number }[]).forEach((p) => bounds.push([p.lat, p.lng]));
      } catch {
        /* abaikan */
      }
    }
    if (bounds.length > 0) {
      map.fitBounds(L.latLngBounds(bounds).pad(0.15));
      handledFitKeyRef.current = props.fitKey;
    }
  }, [props.fitKey, props.facilities, mapReady]);

  // ===== Marker ARP =====
  useEffect(() => {
    const L = LRef.current;
    const map = mapRef.current;
    const group = layersRef.current.facilities;
    if (!L || !map || !group || !props.arpLat || !props.arpLng) return;
    L.marker([props.arpLat, props.arpLng], {
      icon: L.divIcon({
        className: 'airside-label',
        html: '<span style="color:#f472b6">✛ ARP</span>',
      }),
      interactive: false,
      keyboard: false,
    }).addTo(group);
  }, [props.arpLat, props.arpLng, mapReady, props.damages, props.facilities, hiddenFacilityIds]);

  // Inisialisasi editingCorners saat damage yang akan diedit berubah
  useEffect(() => {
    const d = props.editingGeometryDamage;
    if (!d) {
      const frame = window.requestAnimationFrame(() => setEditingCorners([]));
      return () => window.cancelAnimationFrame(frame);
    }
    let pts: { lat: number; lng: number }[] = [];
    if (d.rectJson) {
      try {
        const parsed: unknown = JSON.parse(d.rectJson);
        pts = Array.isArray(parsed)
          ? parsed.filter((point): point is { lat: number; lng: number } => point != null
            && typeof point.lat === 'number' && Number.isFinite(point.lat)
            && typeof point.lng === 'number' && Number.isFinite(point.lng))
          : [];
      } catch {
        pts = [];
      }
    }
    if (d.geometryType === 'POINT') {
      pts = pts.length === 1 ? pts : [{ lat: d.lat, lng: d.lng }];
    } else if (d.geometryType === 'LINE' && pts.length < 2) {
      const centerLoc = latLngToLocal(d.lat, d.lng, props.arpLat, props.arpLng);
      const half = Math.max(1, (d.lengthM || 2) / 2);
      pts = [
        localToLatLng(centerLoc.x, centerLoc.y - half, props.arpLat, props.arpLng),
        localToLatLng(centerLoc.x, centerLoc.y + half, props.arpLat, props.arpLng),
      ];
    } else if (d.geometryType !== 'LINE' && pts.length < 3) {
      const centerLoc = latLngToLocal(d.lat, d.lng, props.arpLat, props.arpLng);
      const half = 2;
      pts = [
        localToLatLng(centerLoc.x - half, centerLoc.y - half, props.arpLat, props.arpLng),
        localToLatLng(centerLoc.x + half, centerLoc.y - half, props.arpLat, props.arpLng),
        localToLatLng(centerLoc.x + half, centerLoc.y + half, props.arpLat, props.arpLng),
        localToLatLng(centerLoc.x - half, centerLoc.y + half, props.arpLat, props.arpLng),
      ];
    }
    const frame = window.requestAnimationFrame(() => setEditingCorners(pts));
    const map = mapRef.current;
    const L = LRef.current;
    if (map && L) {
      // Kerusakan 2×2 m hampir tak terlihat pada zoom awal 16; pisahkan
      // handle vertex di layar begitu mode edit dibuka.
      map.fitBounds(L.latLngBounds(pts.map((point) => [point.lat, point.lng])), {
        padding: [70, 70],
        maxZoom: 22,
        animate: false,
      });
    }
    return () => window.cancelAnimationFrame(frame);
  }, [props.editingGeometryDamage, props.arpLat, props.arpLng, mapReady]);

  // Render layer edit geometri & handle markers untuk drag titik polygon
  useEffect(() => {
    const L = LRef.current;
    const map = mapRef.current;
    const group = layersRef.current.editGeometry;
    if (!L || !map || !group) return;
    group.clearLayers();

    const editKind = props.editingGeometryDamage?.geometryType
      ?? (editingCorners.length >= 3 ? 'POLYGON' : editingCorners.length >= 2 ? 'LINE' : 'POINT');
    if (!props.editingGeometryDamage || editingCorners.length < (editKind === 'POINT' ? 1 : editKind === 'LINE' ? 2 : 3)) return;

    const liveCorners = [...editingCorners];

    const editPositions = liveCorners.map((p) => [p.lat, p.lng] as [number, number]);
    const shapeOptions = {
      color: '#06b6d4', weight: editKind === 'LINE' ? 6 : 3, dashArray: '6 6',
      fillColor: '#22d3ee', fillOpacity: 0.45, pane: 'editShapePane', bubblingMouseEvents: false,
    };
    const shapeLayer = editKind === 'POINT'
      ? L.circleMarker(editPositions[0], { ...shapeOptions, radius: 9 })
      : editKind === 'LINE'
        ? L.polyline(editPositions, shapeOptions)
        : L.polygon(editPositions, shapeOptions);
    shapeLayer.addTo(group);
    const updateShape = () => {
      if (editKind === 'POINT') {
        (shapeLayer as LeafletNS.CircleMarker).setLatLng([liveCorners[0].lat, liveCorners[0].lng]);
      } else {
        (shapeLayer as LeafletNS.Polyline).setLatLngs(liveCorners.map((p) => [p.lat, p.lng]));
      }
    };

    // Marker center untuk menggeser SELURUH rectangle kerusakan sekaligus
    const centerLat = liveCorners.reduce((sum, p) => sum + p.lat, 0) / liveCorners.length;
    const centerLng = liveCorners.reduce((sum, p) => sum + p.lng, 0) / liveCorners.length;

    let centerStartLat = centerLat;
    let centerStartLng = centerLng;

    const centerMarker = L.marker([centerLat, centerLng], {
      draggable: true,
      pane: 'editHandlesPane',
      zIndexOffset: 1000,
      icon: L.divIcon({
        className: 'edit-center-icon',
        html: '<div style="width:26px;height:26px;background:#0284c7;border:2px solid #ffffff;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,0.6);cursor:move;display:flex;align-items:center;justify-content:center;font-size:17px;color:white;font-weight:700">✥</div>',
        iconSize: [26, 26],
        iconAnchor: [13, 13],
      }),
    }).bindTooltip(editKind === 'POINT' ? 'Geser titik kejadian' : 'Geser seluruh gambar', { direction: 'top' }).addTo(group);

    const vertexMarkers: LeafletNS.Marker[] = [];

    centerMarker.on('dragstart', () => {
      const c = centerMarker.getLatLng();
      centerStartLat = c.lat;
      centerStartLng = c.lng;
    });

    centerMarker.on('drag', (e: LeafletNS.LeafletEvent) => {
      const newC = (e.target as LeafletNS.Marker).getLatLng();
      const dLat = newC.lat - centerStartLat;
      const dLng = newC.lng - centerStartLng;
      centerStartLat = newC.lat;
      centerStartLng = newC.lng;

      for (let i = 0; i < liveCorners.length; i++) {
        liveCorners[i] = { lat: liveCorners[i].lat + dLat, lng: liveCorners[i].lng + dLng };
        if (vertexMarkers[i]) {
          vertexMarkers[i].setLatLng([liveCorners[i].lat, liveCorners[i].lng]);
        }
      }
      updateShape();
    });

    centerMarker.on('dragend', () => {
      setEditingCorners([...liveCorners]);
    });

    if (editKind !== 'POINT') liveCorners.forEach((corner, idx) => {
      const handleMarker = L.marker([corner.lat, corner.lng], {
        draggable: true,
        pane: 'editHandlesPane',
        zIndexOffset: 2000,
        icon: L.divIcon({
          className: 'edit-vertex-icon',
          html: `<div style="width:20px;height:20px;background:#06b6d4;border:3px solid #ffffff;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,0.7);cursor:grab;display:flex;align-items:center;justify-content:center;font-size:11px;color:white;font-weight:800">${idx + 1}</div>`,
          iconSize: [20, 20],
          iconAnchor: [10, 10],
        }),
      }).addTo(group);

      vertexMarkers.push(handleMarker);

      handleMarker.on('drag', (e: LeafletNS.LeafletEvent) => {
        const newPos = (e.target as LeafletNS.Marker).getLatLng();
        liveCorners[idx] = { lat: newPos.lat, lng: newPos.lng };
        updateShape();

        // Update posisi marker center
        const cLat = liveCorners.reduce((sum, p) => sum + p.lat, 0) / liveCorners.length;
        const cLng = liveCorners.reduce((sum, p) => sum + p.lng, 0) / liveCorners.length;
        centerMarker.setLatLng([cLat, cLng]);
      });

      handleMarker.on('dragend', () => {
        setEditingCorners([...liveCorners]);
      });
    });

    // Area cyan sendiri dapat digeser tanpa harus mengenai marker pusat.
    // Leaflet hanya menyediakan drag bawaan untuk Marker, bukan Polygon.
    let draggingPolygon = false;
    let restoreMapDragging = false;
    let previousPosition: LeafletNS.LatLng | null = null;

    shapeLayer.on('mousedown', (event: LeafletNS.LeafletMouseEvent) => {
      if (editKind === 'POINT') return;
      draggingPolygon = true;
      restoreMapDragging = map.dragging.enabled();
      previousPosition = event.latlng;
      map.dragging.disable();
      L.DomEvent.stop(event.originalEvent);
    });

    const movePolygon = (event: LeafletNS.LeafletMouseEvent) => {
      if (!draggingPolygon || !previousPosition) return;
      const dLat = event.latlng.lat - previousPosition.lat;
      const dLng = event.latlng.lng - previousPosition.lng;
      previousPosition = event.latlng;
      for (let index = 0; index < liveCorners.length; index++) {
        liveCorners[index] = {
          lat: liveCorners[index].lat + dLat,
          lng: liveCorners[index].lng + dLng,
        };
        vertexMarkers[index].setLatLng([liveCorners[index].lat, liveCorners[index].lng]);
      }
      updateShape();
      const cLat = liveCorners.reduce((sum, point) => sum + point.lat, 0) / liveCorners.length;
      const cLng = liveCorners.reduce((sum, point) => sum + point.lng, 0) / liveCorners.length;
      centerMarker.setLatLng([cLat, cLng]);
    };

    const finishPolygonDrag = () => {
      if (!draggingPolygon) return;
      draggingPolygon = false;
      previousPosition = null;
      if (restoreMapDragging) map.dragging.enable();
      setEditingCorners([...liveCorners]);
    };

    map.on('mousemove', movePolygon);
    map.on('mouseup', finishPolygonDrag);
    window.addEventListener('mouseup', finishPolygonDrag);

    return () => {
      map.off('mousemove', movePolygon);
      map.off('mouseup', finishPolygonDrag);
      window.removeEventListener('mouseup', finishPolygonDrag);
      if (draggingPolygon && restoreMapDragging) map.dragging.enable();
    };
    // Pastikan effect ikut merender ulang saat editingCorners berubah (mis. rotasi),
    // bukan hanya saat jumlah sudutnya berubah — supaya preview rotasi langsung terlihat.
  }, [props.editingGeometryDamage, editingCorners, mapReady]);

  const rotateEditingCorners = (angleDeg: number) => {
    if (editingCorners.length === 0) return;
    const rotated = rotatePolygonPoints(editingCorners, angleDeg, props.arpLat, props.arpLng);
    setEditingCorners(rotated);
  };

  const editingGeometryType = props.editingGeometryDamage?.geometryType
    ?? (editingCorners.length >= 3 ? 'POLYGON' : editingCorners.length >= 2 ? 'LINE' : 'POINT');
  const editMetrics: DrawnRect | null = editingCorners.length === 0 ? null
    : editingGeometryType === 'POINT' ? {
      ...pointFromPoint(editingCorners[0], props.arpLat, props.arpLng), geometryType: 'POINT', count: 1,
    } : editingGeometryType === 'LINE' && editingCorners.length >= 2 ? {
      ...lineFromPoints(editingCorners, props.arpLat, props.arpLng), geometryType: 'LINE',
    } : editingCorners.length >= 3 || editingGeometryType === 'POLYGON' && editingCorners.length === 2 ? {
      ...polyFromPoints(editingCorners, props.arpLat, props.arpLng),
      geometryType: editingGeometryType === 'SLAB' ? 'SLAB' : 'POLYGON',
      count: editingGeometryType === 'SLAB' ? 1 : undefined,
    } : null;
  const parsedDimension = parseRectangleDimensions(dimensionInput);

  return (
    <div className="relative w-full h-full">
      <div ref={containerRef} className="airside-map w-full h-full" />
      {props.drawMode && (
        <div className="absolute bottom-8 left-3 z-[1050] flex flex-col items-start gap-2 max-w-[calc(100%-1.5rem)]">
          {/* Menu penggambaran presisi: ORTO F8 + jarak keyboard */}
          <div className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-950/90 px-3 py-1.5 text-white shadow-xl backdrop-blur">
            <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Menu Gambar</span>
            <span className="h-4 w-px bg-slate-700" />
            <button
              type="button"
              onClick={toggleOrtho}
              title="F8 — kunci arah horizontal/vertikal (presisi sudut 90°)"
              className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-bold transition-colors ${
                orthoOn
                  ? 'bg-emerald-500 text-slate-950 hover:bg-emerald-400'
                  : 'bg-slate-700 text-slate-200 hover:bg-slate-600'
              }`}
            >
              <MoveHorizontal className="h-3.5 w-3.5" />
              ORTO: {orthoOn ? 'ON' : 'OFF'}
              <kbd className="rounded border border-current/30 bg-transparent/10 px-1 font-mono text-[9px] opacity-80">F8</kbd>
            </button>
            {distanceInput ? (
              <>
                <span className="h-4 w-px bg-slate-700" />
                <span className="font-mono text-[11px] font-bold text-amber-300">
                  Jarak: {distanceInput} m · Enter titik
                </span>
              </>
            ) : null}
          </div>
          {(props.drawUnit ?? 'PERCENT') === 'PERCENT' && drawAnchorSelected ? (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (parseRectangleDimensions(dimensionInput)) {
                  completeSizedRectangle(dimensionInput);
                } else if (parseMeterInput(dimensionInput) != null) {
                  placeVertexAtDistance(dimensionInput);
                }
              }}
              className="w-[310px] max-w-full rounded-xl border border-amber-300/70 bg-slate-950/95 p-3 text-white shadow-2xl backdrop-blur"
            >
              <div className="mb-2 flex items-center justify-between gap-3">
                <label htmlFor="damage-dimension-input" className="text-xs font-bold text-amber-300">
                  Ukuran presisi (meter)
                </label>
                <span className="text-[10px] text-slate-400">Persegi: Panjang × Lebar · Jarak: angka saja</span>
              </div>
              <div className="flex gap-2">
                <input
                  ref={dimensionInputRef}
                  id="damage-dimension-input"
                  type="text"
                  inputMode="text"
                  autoComplete="off"
                  spellCheck={false}
                  value={dimensionInput}
                  onChange={(event) => updateDimensionInput(event.target.value)}
                  onKeyDown={(event) => {
                    event.stopPropagation();
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      if (parseRectangleDimensions(dimensionInput)) {
                        completeSizedRectangle(dimensionInput);
                      } else if (parseMeterInput(dimensionInput) != null) {
                        placeVertexAtDistance(dimensionInput);
                      }
                    } else if (event.key === 'Escape') {
                      event.preventDefault();
                      cancelCurrentDrawing();
                      mapRef.current?.getContainer().focus();
                    }
                  }}
                  placeholder="Contoh: 2x2 · 5"
                  aria-describedby="damage-dimension-help"
                  className="min-w-0 flex-1 rounded-lg border border-slate-600 bg-white px-3 py-2 font-mono text-sm font-bold text-slate-950 outline-none placeholder:text-slate-400 focus:border-amber-400 focus:ring-2 focus:ring-amber-400/30"
                />
                <button
                  type="submit"
                  className="rounded-lg bg-amber-500 px-3 py-2 text-xs font-bold text-slate-950 transition-colors hover:bg-amber-400 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
                  disabled={!parsedDimension && parseMeterInput(dimensionInput) == null}
                >
                  Buat
                </button>
              </div>
              <div id="damage-dimension-help" className="mt-1.5 text-[10px] leading-snug">
                {dimensionError ? (
                  <span className="text-red-300">{dimensionError}</span>
                ) : parsedDimension ? (
                  <span className="text-emerald-300">
                    Siap: {parsedDimension.lengthM} m × {parsedDimension.widthM} m ={' '}
                    {(parsedDimension.lengthM * parsedDimension.widthM).toFixed(1)} m² · tekan Enter
                  </span>
                ) : parseMeterInput(dimensionInput) != null ? (
                  <span className="text-emerald-300">
                    Jarak titik berikutnya: {parseMeterInput(dimensionInput)} m (ikuti kursor{orthoOn ? ' / ORTO' : ''}) · tekan Enter
                  </span>
                ) : (
                  <span className="text-slate-300">2x2 = kotak presisi · angka saja (misal 5) = jarak titik berikutnya.</span>
                )}
              </div>
            </form>
          ) : (
            <div className="rounded-md border border-slate-700 bg-slate-950/80 px-2.5 py-1 text-[10px] font-semibold text-slate-200 shadow-lg backdrop-blur">
              {(props.drawUnit ?? 'PERCENT') === 'LENGTH'
                ? 'Klik sepanjang jalur · ketik angka = jarak (m) · Enter/klik kanan selesai · Esc batal'
                : props.drawUnit === 'COUNT'
                  ? 'Klik lokasi kejadian · Shift+klik pilih seluruh slab'
                  : 'Klik titik pusat kotak · Shift+klik pilih seluruh slab · ketik angka = jarak titik berikutnya'}
            </div>
          )}
        </div>
      )}
      {props.editingGeometryDamage && editMetrics && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1050] bg-slate-900/95 text-white backdrop-blur rounded-xl shadow-2xl p-3 border border-sky-500/50 max-w-xl w-full">
          <div className="flex items-center justify-between border-b border-slate-700/80 pb-2 mb-2">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse" />
              <h4 className="text-xs font-bold text-sky-300">Mode Edit Gambar Kerusakan</h4>
              <span className="text-[11px] text-slate-300">({props.editingGeometryDamage.type})</span>
            </div>
            <div className="text-[11px] font-mono text-cyan-200 bg-slate-800 px-2 py-0.5 rounded border border-slate-700">
              {editingGeometryType === 'LINE' ? `Panjang: ${editMetrics.lengthM.toFixed(1)} m`
                : editingGeometryType === 'POINT' ? 'Jumlah: 1 kejadian'
                  : editingGeometryType === 'SLAB' ? 'Jumlah: 1 slab'
                    : `Luas: ${editMetrics.areaSqm.toFixed(1)} m² (${editMetrics.lengthM.toFixed(1)}×${editMetrics.widthM.toFixed(1)} m)`}
            </div>
          </div>
          <p className="mb-2 text-[11px] text-cyan-100">
            {editingGeometryType === 'POINT'
              ? 'Tarik titik ✥ untuk memindahkan kejadian.'
              : `Tarik gambar biru atau titik ✥ untuk memindahkan ${editingGeometryType === 'LINE' ? 'garis' : 'area'}; tarik titik bernomor untuk mengubah bentuk.`}
          </p>
          <div className="flex items-center justify-between gap-3 text-xs">
            {editingGeometryType !== 'POINT' && <div className="flex items-center gap-1">
              <span className="text-[10px] text-slate-400 mr-1 font-semibold">Rotasi:</span>
              <button
                type="button"
                onClick={() => rotateEditingCorners(-15)}
                className="px-2 py-1 bg-slate-800 hover:bg-slate-700 rounded text-[11px] font-mono font-bold text-sky-400 border border-slate-700"
              >
                ↺-15°
              </button>
              <button
                type="button"
                onClick={() => rotateEditingCorners(-1)}
                className="px-2 py-1 bg-slate-800 hover:bg-slate-700 rounded text-[11px] font-mono font-bold text-sky-400 border border-slate-700"
              >
                ↺-1°
              </button>
              <button
                type="button"
                onClick={() => rotateEditingCorners(1)}
                className="px-2 py-1 bg-slate-800 hover:bg-slate-700 rounded text-[11px] font-mono font-bold text-sky-400 border border-slate-700"
              >
                ↻+1°
              </button>
              <button
                type="button"
                onClick={() => rotateEditingCorners(15)}
                className="px-2 py-1 bg-slate-800 hover:bg-slate-700 rounded text-[11px] font-mono font-bold text-sky-400 border border-slate-700"
              >
                ↻+15°
              </button>
            </div>}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  if (props.onSaveEditingGeometry && editMetrics) {
                    props.onSaveEditingGeometry(editMetrics);
                  }
                }}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg shadow flex items-center gap-1"
              >
                ✓ Simpan Perubahan
              </button>
              <button
                type="button"
                onClick={() => {
                  if (props.onCancelEditingGeometry) {
                    props.onCancelEditingGeometry();
                  }
                }}
                className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-semibold rounded-lg"
              >
                ✗ Batal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Spoiler hide/unhide per fasilitas — pojok kanan bawah peta */}
      <div className="absolute bottom-8 right-3 z-[1000] flex flex-col items-end">
        {facilitySpoilerOpen && (
          <div className="mb-2 w-64 max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-xl border border-gray-200 bg-white/95 shadow-2xl backdrop-blur">
            <div className="flex items-center justify-between gap-2 border-b border-gray-100 px-3 py-2">
              <span className="flex items-center gap-1.5 text-xs font-bold text-gray-800">
                <Layers className="w-3.5 h-3.5 text-sky-600" /> Fasilitas
              </span>
              <span className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setHiddenFacilityIds(new Set())}
                  className="text-[10px] font-semibold text-sky-600 hover:text-sky-800 hover:underline"
                >
                  Tampil semua
                </button>
                <button
                  type="button"
                  onClick={() => setHiddenFacilityIds(new Set(props.facilities.map((facility) => facility.id)))}
                  className="text-[10px] font-semibold text-gray-500 hover:text-gray-800 hover:underline"
                >
                  Sembunyi semua
                </button>
              </span>
            </div>
            <ul className="max-h-64 overflow-y-auto py-1">
              {props.facilities.map((facility) => {
                const visible = !hiddenFacilityIds.has(facility.id);
                const facilityColor = facility.color || FACILITY_TYPE_COLORS[facility.type] || '#38bdf8';
                return (
                  <li key={facility.id}>
                    <button
                      type="button"
                      onClick={() => toggleFacilityVisibility(facility.id)}
                      className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors hover:bg-gray-50 ${visible ? 'text-gray-800' : 'text-gray-400'}`}
                      title={visible ? 'Sembunyikan fasilitas ini dari peta' : 'Tampilkan fasilitas ini di peta'}
                    >
                      {visible
                        ? <Eye className="w-3.5 h-3.5 shrink-0 text-sky-600" />
                        : <EyeOff className="w-3.5 h-3.5 shrink-0" />}
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full border"
                        style={{ background: visible ? facilityColor : 'transparent', borderColor: facilityColor }}
                      />
                      <span className="min-w-0 flex-1 truncate">
                        <span className="font-semibold">{facility.code}</span>
                        <span className="ml-1 text-[10px] opacity-70">{facility.name}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
              {props.facilities.length === 0 && (
                <li className="px-3 py-2 text-[11px] text-gray-400">Belum ada fasilitas.</li>
              )}
            </ul>
          </div>
        )}
        <button
          type="button"
          onClick={() => setFacilitySpoilerOpen((open) => !open)}
          className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold shadow-lg backdrop-blur transition-colors ${
            facilitySpoilerOpen
              ? 'border-sky-500 bg-sky-600 text-white'
              : 'border-gray-200 bg-white/95 text-gray-700 hover:bg-gray-100'
          }`}
          title={facilitySpoilerOpen ? 'Tutup daftar fasilitas' : 'Tampilkan / sembunyikan tiap fasilitas'}
        >
          {facilitySpoilerOpen
            ? <ChevronDown className="w-3.5 h-3.5" />
            : <Layers className="w-3.5 h-3.5" />}
          Fasilitas
          {hiddenFacilityIds.size > 0 && (
            <span className="rounded-full bg-amber-500 px-1.5 py-px text-[9px] font-bold text-white">
              {hiddenFacilityIds.size}
            </span>
          )}
        </button>
      </div>
    </div>
  );
}
