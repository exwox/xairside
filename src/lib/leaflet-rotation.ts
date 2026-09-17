import type * as Leaflet from 'leaflet';
import { normalizeMapRotation, rotatedMapSize, rotateMapVector, viewportToMapPoint } from './map-rotation';
import { installUprightMapOverlays } from './leaflet-upright';

export interface MapRotationController {
  setRotation: (degrees: number) => void;
  destroy: () => void;
}

// Leaflet 1.9's draggable bypasses mouseEventToContainerPoint. Keep its small
// internal interface here so map panning and every edit handle use the same axes.
type RotationDraggable = Leaflet.Draggable & {
  _startPoint: Leaflet.Point;
  _startPos: Leaflet.Point;
  _newPos: Leaflet.Point;
};
type DragHandler = Leaflet.Handler & { _draggable?: RotationDraggable };

/** Fixed rectangular viewport around an enlarged, rotated Leaflet surface. */
export function installMapRotation(
  L: typeof Leaflet, map: Leaflet.Map, viewport: HTMLElement, initialDegrees = 0,
): MapRotationController {
  const container = map.getContainer();
  const originalMousePoint = map.mouseEventToContainerPoint;
  const originalBoundsZoom = map.getBoundsZoom;
  let degrees = normalizeMapRotation(initialDegrees);
  const removeUprightOverlays = installUprightMapOverlays(L, map, viewport, () => degrees);

  // Controls belong to the fixed viewport, outside the rotated surface.
  const controls = container.querySelector<HTMLElement>('.leaflet-control-container');
  if (controls) viewport.appendChild(controls);

  const viewportSize = () => L.point(viewport.clientWidth, viewport.clientHeight);
  const screenScale = () => {
    const rect = viewport.getBoundingClientRect();
    return L.point(rect.width / (viewport.clientWidth || 1) || 1, rect.height / (viewport.clientHeight || 1) || 1);
  };

  map.mouseEventToContainerPoint = (event: MouseEvent) => {
    // Never use the rotated container's bounding box: it also contains a
    // rotation-dependent apparent scale which Leaflet would divide out twice.
    const rect = viewport.getBoundingClientRect();
    const scale = screenScale();
    const point = viewportToMapPoint(
      { x: (event.clientX - rect.left) / scale.x, y: (event.clientY - rect.top) / scale.y },
      viewportSize(), map.getSize(), degrees,
    );
    return L.point(point.x, point.y);
  };

  // fitBounds must fit the visible rectangle, not the enlarged hidden surface.
  map.getBoundsZoom = (input, inside = false, paddingInput) => {
    const bounds = input instanceof L.LatLngBounds ? input : L.latLngBounds(input);
    const padding = paddingInput ? L.point(paddingInput) : L.point(0, 0);
    const zoom = map.getZoom() || 0;
    const nw = map.project(bounds.getNorthWest(), zoom);
    const se = map.project(bounds.getSouthEast(), zoom);
    const extent = L.point(Math.abs(se.x - nw.x), Math.abs(se.y - nw.y));
    const visible = viewportSize().subtract(padding);
    const size = inside ? rotatedMapSize(visible, -degrees) : visible;
    const fitted = inside ? extent : rotatedMapSize(extent, degrees);
    const scaleX = Math.max(1, size.x) / fitted.x;
    const scaleY = Math.max(1, size.y) / fitted.y;
    let target = map.getScaleZoom(inside ? Math.max(scaleX, scaleY) : Math.min(scaleX, scaleY), zoom);
    const snap = L.Browser.any3d ? map.options.zoomSnap : 1;
    if (snap) {
      target = Math.round(target / (snap / 100)) * (snap / 100);
      target = (inside ? Math.ceil(target / snap) : Math.floor(target / snap)) * snap;
    }
    return Math.max(map.getMinZoom(), Math.min(map.getMaxZoom(), target));
  };

  const draggables = new Map<RotationDraggable, (event: Leaflet.LeafletEvent) => void>();
  const attachDrag = (handler?: Leaflet.Handler) => {
    const draggable = (handler as DragHandler | undefined)?._draggable;
    if (!draggable || draggables.has(draggable)) return;
    const correctDrag = (event: Leaflet.LeafletEvent) => {
      const original = (event as Leaflet.LeafletEvent & { originalEvent: MouseEvent | TouchEvent }).originalEvent;
      const pointer = 'touches' in original ? original.touches[0] : original;
      if (!pointer) return;
      const scale = screenScale();
      const offset = rotateMapVector({
        x: (pointer.clientX - draggable._startPoint.x) / scale.x,
        y: (pointer.clientY - draggable._startPoint.y) / scale.y,
      }, -degrees);
      draggable._newPos = draggable._startPos.add(L.point(offset.x, offset.y));
    };
    draggable.on('predrag', correctDrag);
    draggables.set(draggable, correctDrag);
  };
  const detachDrag = (handler?: Leaflet.Handler) => {
    const draggable = (handler as DragHandler | undefined)?._draggable;
    if (!draggable) return;
    const listener = draggables.get(draggable);
    if (listener) draggable.off('predrag', listener);
    draggables.delete(draggable);
  };
  const onLayerAdd = ({ layer }: Leaflet.LayerEvent) => {
    if (layer instanceof L.Marker) attachDrag(layer.dragging);
  };
  const onLayerRemove = ({ layer }: Leaflet.LayerEvent) => {
    if (layer instanceof L.Marker) detachDrag(layer.dragging);
  };
  attachDrag(map.dragging);
  map.eachLayer((layer) => {
    if (layer instanceof L.Marker) attachDrag(layer.dragging);
  });
  map.on('layeradd', onLayerAdd);
  map.on('layerremove', onLayerRemove);

  const resize = () => {
    container.style.setProperty('--airside-map-counter-rotation', `${-degrees}deg`);
    const visible = viewportSize();
    if (!visible.x || !visible.y) return;
    // Inverse-rotate all viewport corners; this extent guarantees no blank
    // corners even at 45 degrees in a wide or tall panel.
    const size = rotatedMapSize(visible, -degrees);
    Object.assign(container.style, {
      position: 'absolute', left: '50%', top: '50%',
      // Even dimensions keep Leaflet's rounded pixel center stable while the
      // angle changes; the tiny epsilon removes trig noise at right angles.
      width: `${2 * Math.ceil(size.x / 2 - 1e-9)}px`,
      height: `${2 * Math.ceil(size.y / 2 - 1e-9)}px`,
      transform: `translate(-50%, -50%) rotate(${degrees}deg)`,
      transformOrigin: 'center center',
    });
    // No CSS transition: the rendered angle and pointer transform must agree
    // on every frame. Leaflet's usual size adjustment preserves the center.
    map.invalidateSize({ animate: false });
  };
  const observer = new ResizeObserver(resize);
  observer.observe(viewport);
  resize();

  return {
    setRotation(value) {
      map.stop();
      degrees = normalizeMapRotation(value);
      resize();
    },
    destroy() {
      observer.disconnect();
      removeUprightOverlays();
      map.off('layeradd', onLayerAdd);
      map.off('layerremove', onLayerRemove);
      for (const [draggable, listener] of draggables) draggable.off('predrag', listener);
      draggables.clear();
      map.mouseEventToContainerPoint = originalMousePoint;
      map.getBoundsZoom = originalBoundsZoom;
      if (controls) container.appendChild(controls);
    },
  };
}
