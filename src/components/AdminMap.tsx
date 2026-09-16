'use client';

// Peta khusus admin: tampilkan semua polygon fasilitas, drag vertex untuk reposisi
// polygon fasilitas yang sedang dipilih. Menggunakan Leaflet + marker draggable.

import { useEffect, useRef, useState } from 'react';
import type * as LeafletNS from 'leaflet';
import type { Facility } from '@/types';
import { FACILITY_TYPE_COLORS } from '@/lib/constants';
import {
  generateFacilityConcreteBlocks,
  generateFacilitySampleGrids,
  generateFacilityStationLines,
  resizePolygonToDimensions,
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

interface AdminMapProps {
  facilities: Facility[];
  selectedId: string;
  vertices: { lat: number; lng: number }[];
  mapRotationDeg?: number;
  stationIntervalM?: number;
  locationMode?: 'STA' | 'SAM';
  sampleLengthM?: number;
  sampleWidthM?: number;
  surfaceType?: string;
  blockLengthM?: number;
  blockWidthM?: number;
  slabDirection?: 'FORWARD' | 'REVERSE';
  lengthM?: number;
  widthM?: number;
  bearingDeg?: number;
  onVerticesChange: (v: { lat: number; lng: number }[]) => void;
  onSelectFacility: (id: string) => void;
}

export default function AdminMap({
  facilities,
  selectedId,
  vertices,
  mapRotationDeg,
  stationIntervalM,
  locationMode,
  sampleLengthM,
  sampleWidthM,
  surfaceType,
  blockLengthM,
  blockWidthM,
  slabDirection,
  lengthM,
  widthM,
  bearingDeg,
  onVerticesChange,
  onSelectFacility,
}: AdminMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletNS.Map | null>(null);
  const LRef = useRef<typeof LeafletNS | null>(null);
  const staticLayerRef = useRef<LeafletNS.LayerGroup | null>(null);
  const activeLayerRef = useRef<LeafletNS.LayerGroup | null>(null);
  const markerRefs = useRef<LeafletNS.Marker[]>([]);
  const polygonRef = useRef<LeafletNS.Polygon | null>(null);
  const stationLinesGroupRef = useRef<LeafletNS.LayerGroup | null>(null);
  const [mapReady, setMapReady] = useState(false);

  const isDraggingRef = useRef(false);
  const isPolyDraggingRef = useRef(false);
  const polyDragStartPosRef = useRef<LeafletNS.LatLng | null>(null);
  const isShiftPressedRef = useRef(false);
  const prevSelectedIdRef = useRef<string>('');
  const prevVertsCountRef = useRef<number>(0);
  const fittedSelectionRef = useRef<string>('');

  const propsRef = useRef({ facilities, selectedId, vertices, mapRotationDeg, stationIntervalM, locationMode, sampleLengthM, sampleWidthM, surfaceType, blockLengthM, blockWidthM, slabDirection, lengthM, widthM, bearingDeg, onVerticesChange, onSelectFacility });
  propsRef.current = { facilities, selectedId, vertices, mapRotationDeg, stationIntervalM, locationMode, sampleLengthM, sampleWidthM, surfaceType, blockLengthM, blockWidthM, slabDirection, lengthM, widthM, bearingDeg, onVerticesChange, onSelectFacility };

  // Rotasi Container Peta dengan Transform CSS + Counter-Rotasi Mouse
  useEffect(() => {
    if (containerRef.current) {
      const rot = mapRotationDeg ?? 0;
      containerRef.current.style.transform = rot ? `rotate(${rot}deg)` : 'none';
      containerRef.current.style.transformOrigin = 'center center';
      containerRef.current.style.transition = 'transform 0.3s ease-out';
      if (mapRef.current) {
        mapRef.current.invalidateSize();
      }
    }
  }, [mapRotationDeg]);

  // Init map
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import('leaflet')).default;
      if (cancelled || !containerRef.current || mapRef.current) return;
      LRef.current = L;
      const map = L.map(containerRef.current, {
        center: [0.9569, 104.5311],
        zoom: 16,
        maxZoom: 22,
        zoomControl: true,
        preferCanvas: true,
      });
      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        maxNativeZoom: 18,
        maxZoom: 22,
        attribution: 'Esri World Imagery',
      }).addTo(map);

      staticLayerRef.current = L.layerGroup().addTo(map);
      activeLayerRef.current = L.layerGroup().addTo(map);
      stationLinesGroupRef.current = L.layerGroup().addTo(map);

      // Patch mouseEventToContainerPoint untuk rotasi peta presisi tanpa mengacaukan drag & edit vertex
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

      // Click on map to add vertex directly
      map.on('click', (e: LeafletNS.LeafletMouseEvent) => {
        const { selectedId: selId, vertices: selVerts, onVerticesChange: onChange } = propsRef.current;
        if (!selId) return;

        const target = e.originalEvent.target as HTMLElement;
        if (target && (target.classList.contains('airside-vertex') || target.closest('.leaflet-interactive'))) {
          return;
        }

        const newVert = { lat: e.latlng.lat, lng: e.latlng.lng };
        const updated = [...selVerts, newVert];
        onChange(updated);
      });

      // Fit semua fasilitas dipindah ke effect autoFit di bawah: saat kembali ke
      // halaman Admin, peta sering siap sebelum /api/facilities selesai sehingga
      // fit di dalam init akan terlewat dan peta tertinggal di koordinat default.

      map.on('zoomend', () => {
        syncGridLabelVisibility(map);
        updateSelectedStationLines(propsRef.current.vertices);
      });
      syncGridLabelVisibility(map);
      setMapReady(true);
    })();
      // Monitor tombol Shift secara global
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Shift' || e.key === 'Alt') {
          isShiftPressedRef.current = true;
          if (containerRef.current) containerRef.current.style.cursor = 'grab';
        }
      };
      const handleKeyUp = (e: KeyboardEvent) => {
        if (e.key === 'Shift' || e.key === 'Alt') {
          isShiftPressedRef.current = false;
          if (containerRef.current) containerRef.current.style.cursor = '';
        }
      };
      window.addEventListener('keydown', handleKeyDown);
      window.addEventListener('keyup', handleKeyUp);

      // Clean up pada unmount
      return () => {
        cancelled = true;
        window.removeEventListener('keydown', handleKeyDown);
        window.removeEventListener('keyup', handleKeyUp);
        mapRef.current?.remove();
        mapRef.current = null;
      };
  }, []);

  // Fit semua fasilitas sekali begitu data tersedia. Effect init sengaja tidak
  // melakukan fit: saat kembali ke halaman Admin, peta sering sudah siap
  // (chunk ter-cache) sebelum /api/facilities selesai, sehingga fit di init
  // terlewat dan peta tertinggal di koordinat default. Guard ref memastikan
  // refresh berikutnya (setelah simpan/edit) tidak memindahkan view pengguna.
  const autoFitDoneRef = useRef(false);
  useEffect(() => {
    const L = LRef.current;
    const map = mapRef.current;
    if (!L || !map || autoFitDoneRef.current || facilities.length === 0) return;
    const allPoints: [number, number][] = [];
    for (const f of facilities) {
      if (!f.polygonJson) continue;
      try {
        (JSON.parse(f.polygonJson) as { lat: number; lng: number }[]).forEach((p) => allPoints.push([p.lat, p.lng]));
      } catch { /* ignore */ }
    }
    if (allPoints.length === 0) return;
    autoFitDoneRef.current = true;
    map.fitBounds(L.latLngBounds(allPoints).pad(0.2));
  }, [facilities, mapReady]);

  // 1. Render static polygons for non-selected facilities
  useEffect(() => {
    const L = LRef.current;
    const map = mapRef.current;
    const staticGroup = staticLayerRef.current;
    if (!L || !map || !staticGroup) return;

    staticGroup.clearLayers();
    const { facilities: facs, selectedId: selId, onSelectFacility: onSelect } = propsRef.current;

    for (const f of facs) {
      if (f.id === selId) continue;
      if (!f.polygonJson) continue;
      let poly: { lat: number; lng: number }[] = [];
      try { poly = JSON.parse(f.polygonJson); } catch { continue; }
      if (poly.length < 3) continue;
      const color = f.color || FACILITY_TYPE_COLORS[f.type] || '#38bdf8';
      L.polygon(
        poly.map((p) => [p.lat, p.lng] as [number, number]),
        { color, weight: 2, fillColor: color, fillOpacity: 0.15, dashArray: '4 3' }
      )
        .bindTooltip(`${f.code} — ${f.name}`, { direction: 'center', className: 'airside-label' })
        .on('click', () => onSelect(f.id))
        .addTo(staticGroup);

      if (f.locationMode === 'SAM') {
        const sGrids = generateFacilitySampleGrids(
          { code: f.code, centroidLat: f.centroidLat, centroidLng: f.centroidLng, bearingDeg: f.bearingDeg, lengthM: f.lengthM, widthM: f.widthM, sampleLengthM: f.sampleLengthM, sampleWidthM: f.sampleWidthM },
          f.sampleLengthM || 20, f.sampleWidthM || 20, undefined, undefined, poly
        );
        sGrids.forEach((sg) => {
          L.polygon(sg.polygon.map((p) => [p.lat, p.lng]), { color: '#c084fc', weight: 1, dashArray: '3 3', fillOpacity: 0.08 }).addTo(staticGroup);
          L.marker([sg.centerLatLng.lat, sg.centerLatLng.lng], {
            icon: L.divIcon({
              className: 'sample-label-marker',
              html: `<div style="font-size:8px;font-family:monospace;font-weight:700;color:#fae8ff;background:rgba(88,28,135,0.75);padding:1px 3px;border-radius:3px;">${sg.sampleCode}</div>`,
              iconSize: [0, 0], iconAnchor: [0, 0]
            }), interactive: false
          }).addTo(staticGroup);
        });
      } else {
        const stLines = generateFacilityStationLines(
          {
            code: f.code,
            centroidLat: f.centroidLat,
            centroidLng: f.centroidLng,
            bearingDeg: f.bearingDeg,
            lengthM: f.lengthM,
            widthM: f.widthM,
          },
          f.lengthM && f.lengthM > 1000 ? 50 : 25,
          undefined,
          undefined,
          poly
        );

        stLines.forEach((st) => {
          L.polyline([[st.leftLatLng.lat, st.leftLatLng.lng], [st.rightLatLng.lat, st.rightLatLng.lng]], {
            color: '#f59e0b', weight: 1, dashArray: '3 3', opacity: 0.6
          }).addTo(staticGroup);
          L.marker([st.rightLatLng.lat, st.rightLatLng.lng], {
            icon: L.divIcon({
              className: 'station-label-marker',
              html: `<div style="font-size:8px;font-family:monospace;color:#fef08a;background:rgba(15,23,42,0.7);padding:1px 2px;border-radius:2px;transform:translate(3px,-50%) rotate(${st.textRotationDeg}deg);transform-origin:left center">${st.stationText}</div>`,
              iconSize: [0, 0], iconAnchor: [0, 0]
            }), interactive: false
          }).addTo(staticGroup);
        });
      }

      if (f.surfaceType === 'CONCRETE') {
        const blocks = generateFacilityConcreteBlocks(f, undefined, undefined, poly);
        blocks.forEach((block) => {
          L.polygon(block.polygon.map((point) => [point.lat, point.lng]), {
            color: '#f59e0b',
            weight: 0.8,
            opacity: 0.7,
            fillOpacity: 0,
            interactive: false,
          }).addTo(staticGroup);
        });
      }
    }
  }, [facilities, selectedId, mapReady]);

  // Tunggu vertices milik fasilitas baru selesai disalin oleh AdminView sebelum
  // melakukan fit. Saat berpindah fasilitas, selectedId dan vertices tiba pada
  // render yang berbeda sehingga fit langsung dapat memakai polygon sebelumnya.
  useEffect(() => {
    const L = LRef.current;
    const map = mapRef.current;
    if (!L || !map || !mapReady) return;

    if (!selectedId) {
      fittedSelectionRef.current = '';
      return;
    }
    if (fittedSelectionRef.current === selectedId || vertices.length < 3) return;

    const selectedFacility = facilities.find((facility) => facility.id === selectedId);
    let savedVertices: { lat: number; lng: number }[] = [];
    if (selectedFacility?.polygonJson) {
      try {
        savedVertices = JSON.parse(selectedFacility.polygonJson);
      } catch {
        savedVertices = [];
      }
    }

    if (savedVertices.length >= 3) {
      const isCurrentSelection = savedVertices.length === vertices.length
        && savedVertices.every((point, index) => {
          const current = vertices[index];
          return current
            && Math.abs(current.lat - point.lat) < 1e-10
            && Math.abs(current.lng - point.lng) < 1e-10;
        });
      if (!isCurrentSelection) return;
    }

    map.stop();
    map.fitBounds(
      L.latLngBounds(vertices.map((vertex) => [vertex.lat, vertex.lng] as [number, number])).pad(0.4),
      { animate: false },
    );
    fittedSelectionRef.current = selectedId;
  }, [facilities, selectedId, vertices, mapReady]);

  // Helper untuk mere-render garis stationing selected facility
  function updateSelectedStationLines(curVerts: { lat: number; lng: number }[]) {
    const L = LRef.current;
    const map = mapRef.current;
    const stGroup = stationLinesGroupRef.current;
    if (!L || !map || !stGroup) return;
    stGroup.clearLayers();

    const {
      facilities: facs,
      selectedId: selId,
      stationIntervalM: stInterval,
      locationMode: propLocMode,
      sampleLengthM: propSampleLen,
      sampleWidthM: propSampleWid,
      surfaceType: propSurfaceType,
      blockLengthM: propBlockLen,
      blockWidthM: propBlockWid,
      slabDirection: propSlabDirection,
      lengthM: propLength,
      widthM: propWidth,
      bearingDeg: propBearing,
    } = propsRef.current;
    if (!selId || curVerts.length < 3) return;

    const fac = facs.find((f) => f.id === selId);
    const effLocMode = propLocMode || fac?.locationMode;
    const effSampleLen = propSampleLen || fac?.sampleLengthM || 20;
    const effSampleWid = propSampleWid || fac?.sampleWidthM || 20;
    const effSurfaceType = propSurfaceType ?? fac?.surfaceType;
    const effBlockLen = propBlockLen || fac?.blockLengthM || 5;
    const effBlockWid = propBlockWid || fac?.blockWidthM || 5;
    const effSlabDirection = propSlabDirection || fac?.slabDirection || 'FORWARD';
    const effLength = propLength || fac?.lengthM;
    const effWidth = propWidth || fac?.widthM;
    const effBearing = propBearing ?? fac?.bearingDeg;

    let activeVertsForGrids = curVerts;
    if (curVerts.length >= 3 && effLength && effWidth && effLength > 0 && effWidth > 0) {
      activeVertsForGrids = resizePolygonToDimensions(curVerts, effLength, effWidth, effBearing ?? undefined);
    }

    if (effLocMode === 'SAM') {
      const sGrids = generateFacilitySampleGrids(
        {
          code: fac?.code || 'FAC',
          centroidLat: fac?.centroidLat,
          centroidLng: fac?.centroidLng,
          bearingDeg: effBearing,
          lengthM: effLength,
          widthM: effWidth,
          sampleLengthM: effSampleLen,
          sampleWidthM: effSampleWid,
        },
        effSampleLen,
        effSampleWid,
        undefined,
        undefined,
        activeVertsForGrids
      );

      sGrids.forEach((sg) => {
        L.polygon(sg.polygon.map((p) => [p.lat, p.lng]), {
          color: '#c084fc', weight: 1.5, dashArray: '3 3', fillOpacity: 0.12,
        }).addTo(stGroup);
        L.marker([sg.centerLatLng.lat, sg.centerLatLng.lng], {
          icon: L.divIcon({
            className: 'sample-label-marker',
            html: `<div style="font-size:9px;font-family:monospace;font-weight:800;color:#fae8ff;background:rgba(88,28,135,0.9);padding:1px 4px;border-radius:3px;border:1px solid #c084fc;">${sg.sampleCode}</div>`,
            iconSize: [0, 0], iconAnchor: [0, 0],
          }), interactive: false,
        }).addTo(stGroup);
      });
    } else {
      const stLines = generateFacilityStationLines(
        {
          code: fac?.code || 'FAC',
          centroidLat: fac?.centroidLat,
          centroidLng: fac?.centroidLng,
          bearingDeg: effBearing,
          lengthM: effLength,
          widthM: effWidth,
        },
        stInterval || (effLength && effLength > 1000 ? 50 : 25),
        undefined,
        undefined,
        activeVertsForGrids
      );

      stLines.forEach((st) => {
        L.polyline([[st.leftLatLng.lat, st.leftLatLng.lng], [st.rightLatLng.lat, st.rightLatLng.lng]], {
          color: '#fbbf24', weight: 1.5, dashArray: '4 4', opacity: 0.85
        }).addTo(stGroup);
        L.marker([st.rightLatLng.lat, st.rightLatLng.lng], {
          icon: L.divIcon({
            className: 'station-label-marker',
            html: `<div style="font-size:9px;font-family:monospace;font-weight:bold;color:#fef08a;background:rgba(15,23,42,0.85);padding:1.5px 4px;border-radius:3px;border:1px solid #f59e0b;transform:translate(4px,-50%) rotate(${st.textRotationDeg}deg);transform-origin:left center">${st.stationText}</div>`,
            iconSize: [0, 0], iconAnchor: [0, 0]
          }), interactive: false
        }).addTo(stGroup);
      });
    }

    if (effSurfaceType === 'CONCRETE') {
      const blocks = generateFacilityConcreteBlocks(
        {
          code: fac?.code || 'FAC',
          centroidLat: fac?.centroidLat,
          centroidLng: fac?.centroidLng,
          bearingDeg: effBearing,
          lengthM: effLength,
          widthM: effWidth,
          sampleLengthM: effSampleLen,
          sampleWidthM: effSampleWid,
          blockLengthM: effBlockLen,
          blockWidthM: effBlockWid,
          slabDirection: effSlabDirection,
          locationMode: effLocMode,
        },
        undefined,
        undefined,
        activeVertsForGrids
      );

      blocks.forEach((block) => {
        // Hijau emerald agar konsisten dengan Dashboard dan tidak tertukar
        // dengan garis STA (amber) maupun kotak sampel (ungu).
        L.polygon(block.polygon.map((point) => [point.lat, point.lng]), {
          color: '#34d399',
          weight: 1.2,
          opacity: 0.95,
          fillOpacity: 0,
          interactive: false,
        }).addTo(stGroup);

        if (map.getZoom() >= SLAB_LABEL_MIN_ZOOM) {
          L.marker([block.centerLatLng.lat, block.centerLatLng.lng], {
            icon: L.divIcon({
              className: 'slab-label-marker',
              html: `<div class="slab-map-label slab-map-label--admin">${block.blockLabel}</div>`,
              iconSize: [0, 0],
              iconAnchor: [0, 0],
            }),
            interactive: false,
          }).addTo(stGroup);
        }
      });
    }
  }

  // 2. Re-create / Update selected facility polygon & draggable vertex markers
  useEffect(() => {
    const L = LRef.current;
    const map = mapRef.current;
    const activeGroup = activeLayerRef.current;
    if (!L || !map || !activeGroup) return;

    const { facilities: facs, selectedId: selId, vertices: selVerts, onVerticesChange: onChange } = propsRef.current;

    // Jika selectedId berubah atau jumlah vertex berubah, Re-create active layers
    const isSelChanged = prevSelectedIdRef.current !== selId;
    const isCountChanged = prevVertsCountRef.current !== selVerts.length;

    if (isSelChanged || isCountChanged || !polygonRef.current) {
      prevSelectedIdRef.current = selId;
      prevVertsCountRef.current = selVerts.length;

      activeGroup.clearLayers();
      markerRefs.current = [];
      polygonRef.current = null;

      if (!selId || selVerts.length === 0) {
        if (stationLinesGroupRef.current) stationLinesGroupRef.current.clearLayers();
        return;
      }

      const fac = facs.find((f) => f.id === selId);
      const color = fac?.color || FACILITY_TYPE_COLORS[fac?.type || 'RUNWAY'] || '#38bdf8';
      const polyLatLngs = selVerts.map((v) => [v.lat, v.lng] as [number, number]);

      if (selVerts.length < 3) {
        if (stationLinesGroupRef.current) stationLinesGroupRef.current.clearLayers();
        if (selVerts.length === 2) {
          L.polyline(polyLatLngs, { color, weight: 3, dashArray: '4 4' }).addTo(activeGroup);
        }
        selVerts.forEach((v, idx) => {
          const marker = L.marker([v.lat, v.lng], {
            draggable: true,
            icon: L.divIcon({
              className: 'airside-vertex',
              html: `<div style="width:16px;height:16px;background:${color};border:2px solid #fff;border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,0.5);cursor:move"></div>`,
              iconSize: [16, 16],
              iconAnchor: [8, 8],
            }),
          })
            .bindTooltip(`V${idx + 1} (${v.lat.toFixed(6)}, ${v.lng.toFixed(6)})`, { permanent: true, direction: 'top' })
            .addTo(activeGroup);

          marker.on('drag', () => {
            const currentVerts = markerRefs.current.map((m) => {
              const ll = m.getLatLng();
              return { lat: ll.lat, lng: ll.lng };
            });
            onChange(currentVerts);
          });
          markerRefs.current.push(marker);
        });
        return;
      }

      const polygon = L.polygon(polyLatLngs, {
        color,
        weight: 3,
        fillColor: color,
        fillOpacity: 0.25,
      }).addTo(activeGroup);
      polygonRef.current = polygon;

      // Polygon mouse drag via Shift / Alt key
      polygon.on('mousedown', (e: LeafletNS.LeafletMouseEvent) => {
        const orig = e.originalEvent as MouseEvent;
        if (orig.shiftKey || orig.altKey || isShiftPressedRef.current) {
          isPolyDraggingRef.current = true;
          isDraggingRef.current = true;
          polyDragStartPosRef.current = e.latlng;
          map.dragging.disable();
          if (orig.stopPropagation) orig.stopPropagation();
        }
      });

      const handlePolyMouseMove = (e: LeafletNS.LeafletMouseEvent) => {
        if (!isPolyDraggingRef.current || !polyDragStartPosRef.current) return;
        const dLat = e.latlng.lat - polyDragStartPosRef.current.lat;
        const dLng = e.latlng.lng - polyDragStartPosRef.current.lng;
        polyDragStartPosRef.current = e.latlng;

        const updated = markerRefs.current.map((m) => {
          const pos = m.getLatLng();
          const newPos = { lat: pos.lat + dLat, lng: pos.lng + dLng };
          m.setLatLng([newPos.lat, newPos.lng]);
          return newPos;
        });

        polygon.setLatLngs(updated.map((v) => [v.lat, v.lng]));
        updateSelectedStationLines(updated);
        onChange(updated);
      };

      const stopPolyDrag = () => {
        if (isPolyDraggingRef.current) {
          isPolyDraggingRef.current = false;
          isDraggingRef.current = false;
          polyDragStartPosRef.current = null;
          map.dragging.enable();
        }
      };

      map.on('mousemove', handlePolyMouseMove);
      map.on('mouseup', stopPolyDrag);

      polygon.bindTooltip(`${fac?.code || ''} (Tahan Shift + Drag Polygon untuk geser seluruh posisi)`, {
        direction: 'center',
        className: 'airside-label',
      });

      // Draggable vertex markers
      selVerts.forEach((v, idx) => {
        const marker = L.marker([v.lat, v.lng], {
          draggable: true,
          icon: L.divIcon({
            className: 'airside-vertex',
            html: `<div style="width:14px;height:14px;background:${color};border:2px solid #fff;border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,0.5);cursor:move"></div>`,
            iconSize: [14, 14],
            iconAnchor: [7, 7],
          }),
        })
          .bindTooltip(`V${idx + 1} (${v.lat.toFixed(6)}, ${v.lng.toFixed(6)})`, { permanent: false, direction: 'top' })
          .addTo(activeGroup);

        marker.on('dragstart', () => {
          isDraggingRef.current = true;
        });

        marker.on('drag', () => {
          // Live smooth update polygon & station lines tanpa re-render DOM marker
          const currentVerts = markerRefs.current.map((m) => {
            const ll = m.getLatLng();
            return { lat: ll.lat, lng: ll.lng };
          });
          polygon.setLatLngs(currentVerts.map((v) => [v.lat, v.lng]));
          updateSelectedStationLines(currentVerts);
          onChange(currentVerts);
        });

        marker.on('dragend', () => {
          isDraggingRef.current = false;
          const currentVerts = markerRefs.current.map((m) => {
            const ll = m.getLatLng();
            return { lat: ll.lat, lng: ll.lng };
          });
          polygon.setLatLngs(currentVerts.map((v) => [v.lat, v.lng]));
          updateSelectedStationLines(currentVerts);
          onChange(currentVerts);
        });

        markerRefs.current.push(marker);
      });

      updateSelectedStationLines(selVerts);
    } else {
      // Jika vertex jumlahnya sama dan selectedId sama, HANYA update posisi marker & polygon (jika update datang dari input form luar)
      if (isDraggingRef.current) return; // Abaikan jika sedang drag mouse aktif

      if (polygonRef.current && selVerts.length === markerRefs.current.length) {
        polygonRef.current.setLatLngs(selVerts.map((v) => [v.lat, v.lng]));
        markerRefs.current.forEach((m, idx) => {
          const v = selVerts[idx];
          if (v) {
            m.setLatLng([v.lat, v.lng]);
            m.setTooltipContent(`V${idx + 1} (${v.lat.toFixed(6)}, ${v.lng.toFixed(6)})`);
          }
        });
        updateSelectedStationLines(selVerts);
      }
    }
  }, [facilities, selectedId, vertices, stationIntervalM, locationMode, sampleLengthM, sampleWidthM, surfaceType, blockLengthM, blockWidthM, slabDirection, lengthM, widthM, bearingDeg, mapReady]);

  return <div ref={containerRef} className="airside-map w-full h-full" />;
}
