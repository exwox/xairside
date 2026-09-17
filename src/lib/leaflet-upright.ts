import type * as Leaflet from 'leaflet';
import { rotateMapVector } from './map-rotation';

type PopupInternals = Leaflet.Popup & {
  _zoomAnimated: boolean;
  _updatePosition: () => void;
  _animateZoom: (event: Leaflet.ZoomAnimEvent) => void;
  _adjustPan: () => void;
  _getAnchor: () => Leaflet.PointExpression;
};
type TooltipInternals = Leaflet.Tooltip & { _setPosition: (point: Leaflet.Point) => void };

/** Counter-rotate overlay artwork around its geographic anchor, not its center.
 * Leaflet still owns the translation, so dragging and zoom animations keep
 * labels and popup tips attached to the same location on the rotated map.
 */
export function installUprightMapOverlays(
  L: typeof Leaflet, map: Leaflet.Map, viewport: HTMLElement, getDegrees: () => number,
): () => void {
  const originalAddLayer = map.addLayer;
  const restorers = new WeakMap<Leaflet.Layer, () => void>();
  const counterRotation = 'rotate(var(--airside-map-counter-rotation, 0deg))';
  const appendRotation = (element: HTMLElement) => {
    element.style.transform = element.style.transform.replace(/\s*rotate\(var\(--airside-map-counter-rotation, 0deg\)\)/g, '') + ` ${counterRotation}`;
  };

  const prepareOverlay = (layer: Leaflet.Layer) => {
    if (restorers.has(layer)) return;
    if (layer instanceof L.Popup) {
      const popup = layer as PopupInternals;
      const updatePosition = popup._updatePosition;
      const animateZoom = popup._animateZoom;
      const adjustPan = popup._adjustPan;
      let panning = false;
      const rotate = () => {
        const element = popup.getElement();
        if (!element) return;
        const style = getComputedStyle(element);
        const anchor = popup._zoomAnimated ? L.point(0, 0)
          : map.latLngToLayerPoint(popup.getLatLng()!).add(L.point(popup._getAnchor()));
        const x = anchor.x - (parseFloat(style.left) || 0);
        const y = anchor.y + (parseFloat(style.bottom) || 0) + (parseFloat(style.marginBottom) || 0);
        // Percentage height also handles a photo loading after the popup opens.
        element.style.transformOrigin = `${x}px calc(100% + ${y}px)`;
        appendRotation(element);
      };
      popup._updatePosition = function () { updatePosition.call(this); rotate(); };
      popup._animateZoom = function (event) { animateZoom.call(this, event); rotate(); };
      popup._adjustPan = function () {
        if (panning || !this.options.autoPan || !this.isOpen()) return;
        const element = this.getElement();
        if (!element) return;
        const box = element.getBoundingClientRect();
        const frame = viewport.getBoundingClientRect();
        const scaleX = frame.width / viewport.clientWidth || 1;
        const scaleY = frame.height / viewport.clientHeight || 1;
        const padding = L.point(this.options.autoPanPadding ?? [5, 5]);
        const tl = L.point(this.options.autoPanPaddingTopLeft ?? padding);
        const br = L.point(this.options.autoPanPaddingBottomRight ?? padding);
        let dx = Math.max(0, (box.right - frame.right) / scaleX + br.x);
        let dy = Math.max(0, (box.bottom - frame.bottom) / scaleY + br.y);
        if ((box.left - frame.left) / scaleX - dx < tl.x) dx = (box.left - frame.left) / scaleX - tl.x;
        if ((box.top - frame.top) / scaleY - dy < tl.y) dy = (box.top - frame.top) / scaleY - tl.y;
        if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
        const offset = rotateMapVector({ x: dx, y: dy }, -getDegrees());
        panning = true;
        try {
          map.fire('autopanstart').panBy([offset.x, offset.y], { animate: false });
        } finally {
          panning = false;
        }
      };
      restorers.set(layer, () => {
        popup._updatePosition = updatePosition;
        popup._animateZoom = animateZoom;
        popup._adjustPan = adjustPan;
      });
    } else if (layer instanceof L.Tooltip) {
      const tooltip = layer as TooltipInternals;
      const setPosition = tooltip._setPosition;
      tooltip._setPosition = function (anchor) {
        setPosition.call(this, anchor);
        const element = this.getElement();
        if (!element) return;
        const position = L.DomUtil.getPosition(element);
        const style = getComputedStyle(element);
        element.style.transformOrigin = `${anchor.x - position.x - (parseFloat(style.marginLeft) || 0)}px ${anchor.y - position.y - (parseFloat(style.marginTop) || 0)}px`;
        appendRotation(element);
      };
      restorers.set(layer, () => { tooltip._setPosition = setPosition; });
    }
  };

  // Prepare before onAdd binds Leaflet's zoom handlers to the instance methods.
  map.addLayer = function (layer) {
    prepareOverlay(layer);
    return originalAddLayer.call(this, layer);
  };

  const labelClasses = new Set([
    'sample-label-marker', 'station-label-marker', 'slab-label-marker',
    'damage-code-label', 'dxf-text-marker', 'arp-label-marker',
  ]);
  const makeLabelUpright = ({ layer }: Leaflet.LayerEvent) => {
    if (!(layer instanceof L.Marker)) return;
    const element = layer.getElement();
    if (!element || ![...element.classList].some((name) => labelClasses.has(name))) return;
    if (element.firstElementChild?.classList.contains('airside-upright-label')) return;
    const wrapper = document.createElement('div');
    wrapper.className = 'airside-upright-label';
    Object.assign(wrapper.style, {
      width: '100%', height: '100%', transform: counterRotation,
      transformOrigin: `${-(parseFloat(element.style.marginLeft) || 0)}px ${-(parseFloat(element.style.marginTop) || 0)}px`,
    });
    while (element.firstChild) wrapper.appendChild(element.firstChild);
    element.appendChild(wrapper);
  };
  map.on('layeradd', makeLabelUpright);
  return () => {
    map.addLayer = originalAddLayer;
    map.off('layeradd', makeLabelUpright);
    map.eachLayer((layer) => restorers.get(layer)?.());
  };
}
