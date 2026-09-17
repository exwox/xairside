/* global document */
// Run: node tests/map-overlays.browser.mjs (requires Chrome and installed dev dependencies).
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildSync } from 'esbuild';

async function checkOverlays(L, installMapRotation) {
  let checks = 0;
  const check = (condition, message) => {
    if (!condition) throw new Error(message);
    checks++;
  };
  const pause = () => new Promise((resolve) => setTimeout(resolve, 40));
  for (const zoomAnimation of [false, true]) {
    document.body.innerHTML = '<div id="viewport" class="leaflet-container" style="position:relative;overflow:hidden;width:900px;height:480px;margin:35px"><div id="surface" style="width:100%;height:100%"></div></div>';
    const viewport = document.getElementById('viewport');
    const map = L.map('surface', { center: [0.95, 104.53], zoom: 17, zoomAnimation, fadeAnimation: false });
    const rotation = installMapRotation(L, map, viewport);
    const anchor = map.getCenter();
    const labels = ['damage-code-label', 'station-label-marker', 'sample-label-marker', 'slab-label-marker', 'arp-label-marker', 'dxf-text-marker'].map((className) =>
      L.marker(anchor, { interactive: false, icon: L.divIcon({
        className, iconSize: [0, 0], iconAnchor: [0, 0],
        html: '<div style="display:inline-block;white-space:nowrap;transform:translate(-50%,-50%)">Keterangan kerusakan</div>',
      }) }).addTo(map));
    const tooltip = L.tooltip({ direction: 'top', permanent: true }).setLatLng(anchor).setContent('Keterangan fasilitas').addTo(map);
    const popup = L.popup({ autoPan: false }).setLatLng(anchor).setContent('<div style="height:70px">Popup kerusakan</div>').addTo(map);
    await pause();
    const elements = [...labels.map((label) => label.getElement().firstElementChild.firstElementChild), tooltip.getElement(), popup.getElement()];
    const screenAnchor = (angle) => {
      const point = map.latLngToContainerPoint(anchor).subtract(map.getSize().divideBy(2));
      const radians = angle * Math.PI / 180;
      const frame = viewport.getBoundingClientRect();
      return {
        x: frame.left + viewport.clientWidth / 2 + point.x * Math.cos(radians) - point.y * Math.sin(radians),
        y: frame.top + viewport.clientHeight / 2 + point.x * Math.sin(radians) + point.y * Math.cos(radians),
      };
    };
    const origin = screenAnchor(0);
    const baseline = elements.map((element) => {
      const box = element.getBoundingClientRect();
      return { x: box.left - origin.x, y: box.top - origin.y, width: box.width, height: box.height };
    });
    const verify = (angle) => {
      elements.forEach((element, index) => {
        const box = element.getBoundingClientRect();
        const point = screenAnchor(angle);
        const expected = baseline[index];
        check(Math.abs(box.width - expected.width) < 1 && Math.abs(box.height - expected.height) < 1,
          `${angle}° overlay ${index} must remain upright (animation=${zoomAnimation})`);
        check(Math.hypot(box.left - point.x - expected.x, box.top - point.y - expected.y) < 1.5,
          `${angle}° overlay ${index} must remain attached to its geographic anchor`);
      });
    };
    for (const angle of [0, 45, 90, 137, -43, 270, 360]) {
      rotation.setRotation(angle);
      await pause();
      verify(angle);
      map.setZoom(map.getZoom() === 17 ? 18 : 17, { animate: false });
      verify(angle);
      map.panBy([25, 18], { animate: false });
      verify(angle);
    }
    map.panTo(anchor, { animate: false });
    const close = popup.getElement().querySelector('.leaflet-popup-close-button');
    const box = close.getBoundingClientRect();
    check(document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)?.closest('.leaflet-popup-close-button'),
      'Close button hit target must match its visible position');
    close.click();
    check(!map.hasLayer(popup), 'Close button must close the popup');
    tooltip.remove();
    labels.forEach((label) => label.remove());
    for (const angle of [45, 90, -43]) {
      rotation.setRotation(angle);
      const frame = viewport.getBoundingClientRect();
      const point = map.mouseEventToLatLng({ clientX: frame.left + 25, clientY: frame.top + 25 });
      const edge = L.popup({ keepInView: true }).setLatLng(point).setContent('Popup dekat tepi').addTo(map);
      await pause();
      const box = edge.getElement().getBoundingClientRect();
      check(box.left >= frame.left + 3 && box.top >= frame.top + 3 && box.right <= frame.right - 3 && box.bottom <= frame.bottom - 3,
        `${angle}° popup must pan into the visible viewport`);
      edge.remove();
    }
    rotation.destroy();
    map.remove();
  }
  document.body.textContent = `PASS ${checks} overlay checks`;
}

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const directory = mkdtempSync(join(tmpdir(), 'xairside-overlays-'));
try {
  buildSync({
    stdin: {
      contents: `import * as L from 'leaflet'; import { installMapRotation } from './src/lib/leaflet-rotation'; (${checkOverlays.toString()})(L, installMapRotation).catch(error => { document.body.textContent = 'FAIL ' + error.stack; });`,
      resolveDir: root,
    },
    bundle: true, outfile: join(directory, 'test.js'),
  });
  const css = readFileSync(join(root, 'node_modules/leaflet/dist/leaflet.css'), 'utf8');
  writeFileSync(join(directory, 'index.html'), `<!doctype html><style>${css}</style><body style="margin:0"><script src="test.js"></script></body>`);
  const output = execFileSync(process.env.CHROME_BINARY || 'google-chrome', [
    '--headless', '--no-sandbox', '--disable-gpu', '--no-first-run',
    `--user-data-dir=${join(directory, 'profile')}`, '--allow-file-access-from-files',
    '--window-size=1100,900', '--virtual-time-budget=15000', '--dump-dom',
    pathToFileURL(join(directory, 'index.html')).href,
  ], { encoding: 'utf8', timeout: 60000, stdio: ['ignore', 'pipe', 'pipe'] });
  assert.ok(/PASS \d+ overlay checks/.test(output), output.slice(output.indexOf('<body')));
  console.log(output.match(/PASS \d+ overlay checks/)[0]);
} finally {
  rmSync(directory, { recursive: true, force: true });
}
