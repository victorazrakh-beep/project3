// The living map behind every screen: globe intro, shaking heat, aftershocks, waves.
import { circle, km, mmiRGB, magColor, mmiColor, esc, num, shortTime, reduceMotion } from './util.js';
import { aftershockRadius } from './data.js';

const STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';
const LIB = 'https://unpkg.com/maplibre-gl@5.24.0/dist/maplibre-gl.js';
const DEM = 'https://elevation-tiles-prod.s3.amazonaws.com/terrarium/{z}/{x}/{y}.png';

// The map library is big; load it without holding up the rest of the page.
const loadLib = () => window.maplibregl ? Promise.resolve() : new Promise((resolve, reject) => {
  const script = Object.assign(document.createElement('script'), { src: LIB, crossOrigin: 'anonymous', onload: resolve, onerror: reject });
  document.head.append(script);
});
const empty = () => ({ type: 'FeatureCollection', features: [] });
const pt = (lon, lat, props = {}) => ({ type: 'Feature', properties: props, geometry: { type: 'Point', coordinates: [lon, lat] } });

let map, ev, epicenter, youMarker, popup;
// Screens can ask for the map before it's built (e.g. opening straight on #/tu), so they wait on this.
let mapIsReady;
const ready = new Promise(r => { mapIsReady = r; });
let playing = null, waveAnim = null, flashAnim = null;

export function initMap(el) {
  loadLib().then(() => create(el, mapIsReady));
  return ready;
}

function create(el, resolve) {
  map = new maplibregl.Map({
    container: el, style: STYLE, center: [-40, 15], zoom: 1.3,
    attributionControl: { compact: true }, pitchWithRotate: false, dragRotate: false,
    maxPitch: 0, renderWorldCopies: false,
  });
  map.touchZoomRotate.disableRotation();
  popup = new maplibregl.Popup({ closeButton: false, closeOnClick: true, className: 'map-pop', offset: 10 });
  map.on('load', () => { setup(); el.classList.add('on'); resolve(); });
  map.on('style.load', () => { try { map.setProjection({ type: 'globe' }); } catch { /* older engines: flat map */ } });
}

let labels;
function setup() {
  const before = map.getStyle().layers.find(l => l.type === 'symbol')?.id;
  labels = before;
  const add = (layer, under = before) => map.addLayer(layer, under);
  for (const id of ['contours', 'local', 'aftershocks', 'flash', 'waves', 'cities', 'link', 'ffm', 'path']) map.addSource(id, { type: 'geojson', data: empty() });

  // Relief of land and seafloor (the Middle America trench shows up south of Panamá).
  map.addSource('dem', { type: 'raster-dem', tiles: [DEM], tileSize: 256, maxzoom: 11, encoding: 'terrarium',
    attribution: '<a href="https://registry.opendata.aws/terrain-tiles/" target="_blank" rel="noopener">Terrain Tiles</a>' });
  const firstLine = map.getStyle().layers.find(l => l.type === 'line')?.id;
  map.addLayer({ id: 'relief', type: 'hillshade', source: 'dem', paint: {
    'hillshade-exaggeration': 0.55, 'hillshade-shadow-color': 'rgba(0,0,0,0.55)',
    'hillshade-highlight-color': 'rgba(127,212,255,0.16)', 'hillshade-accent-color': 'rgba(20,40,70,0.4)' } }, firstLine);

  add({ id: 'waves-fill', type: 'fill', source: 'waves', paint: { 'fill-color': ['get', 'color'], 'fill-opacity': ['get', 'fill'] } });
  add({ id: 'waves-line', type: 'line', source: 'waves', paint: { 'line-color': ['get', 'color'], 'line-width': ['get', 'width'], 'line-opacity': ['get', 'opacity'], 'line-blur': 0.6 } });
  add({ id: 'path', type: 'line', source: 'path', layout: { visibility: 'none' },
    paint: { 'line-color': '#7fd4ff', 'line-width': 1.6, 'line-opacity': 0.8, 'line-dasharray': [2, 2] } });
  add({ id: 'contours', type: 'line', source: 'contours', layout: { 'line-join': 'round' },
    paint: { 'line-color': ['get', 'color'], 'line-width': 1.1, 'line-opacity': 0.55, 'line-dasharray': [2, 2] } });
  add({ id: 'link', type: 'line', source: 'link', paint: { 'line-color': '#ffffff', 'line-width': 1.4, 'line-opacity': 0.7, 'line-dasharray': [1, 2] } });
  add({ id: 'flash', type: 'circle', source: 'flash', paint: {
    'circle-radius': ['get', 'r'], 'circle-color': 'rgba(0,0,0,0)',
    'circle-stroke-color': ['get', 'color'], 'circle-stroke-width': 2, 'circle-stroke-opacity': ['get', 'o'] } }, undefined);
  // Panamá's own network catches many small quakes the USGS doesn't list: drawn as hollow rings.
  add({ id: 'local', type: 'circle', source: 'local', paint: {
    'circle-radius': ['interpolate', ['exponential', 1.6], ['get', 'mag'], 2, 2.5, 4, 5, 5, 8, 6, 12],
    'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-color': ['get', 'color'], 'circle-stroke-width': 1.3,
    'circle-stroke-opacity': ['get', 'o'] } }, undefined);
  add({ id: 'aftershocks', type: 'circle', source: 'aftershocks', paint: {
    'circle-radius': ['interpolate', ['exponential', 1.6], ['get', 'mag'], 2.5, 2.5, 4, 5, 5, 8, 6, 13, 7, 20],
    'circle-color': ['get', 'color'], 'circle-opacity': ['get', 'o'],
    'circle-stroke-color': '#07090f', 'circle-stroke-width': 1 } }, undefined);
  add({ id: 'cities', type: 'circle', source: 'cities', layout: { visibility: 'none' }, paint: {
    'circle-radius': ['interpolate', ['linear'], ['get', 'logpop'], 3, 3.5, 6, 9],
    'circle-color': ['get', 'color'], 'circle-opacity': 0.9, 'circle-stroke-color': '#07090f', 'circle-stroke-width': 1.2 } }, undefined);

  // The fault: each patch of the USGS finite-fault model rises with how far it slipped.
  add({ id: 'ffm', type: 'fill-extrusion', source: 'ffm', layout: { visibility: 'none' }, paint: {
    'fill-extrusion-color': SLIP_COLOR, 'fill-extrusion-height': 0, 'fill-extrusion-opacity': 0.92 } }, undefined);

  map.on('click', 'aftershocks', e => {
    const p = e.features[0].properties;
    popup.setLngLat(e.lngLat).setHTML(`<b>M ${num(p.mag, 1)}</b><span>${esc(p.place)}</span><small>${esc(shortTime(p.time))}</small>`).addTo(map);
  });
  map.on('click', 'local', e => {
    const p = e.features[0].properties;
    popup.setLngLat(e.lngLat).setHTML(`<b>M ${num(p.mag, 1)} · red local</b><span>${esc(p.place)}</span><small>${esc(shortTime(p.time))}</small>`).addTo(map);
  });
  map.on('click', 'cities', e => {
    const p = e.features[0].properties;
    popup.setLngLat(e.lngLat).setHTML(`<b>${esc(p.name)}</b><span>Intensidad ${num(p.mmi, 1)}</span>`).addTo(map);
  });
  for (const id of ['aftershocks', 'local', 'cities']) {
    map.on('mouseenter', id, () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', id, () => { map.getCanvas().style.cursor = ''; });
  }
}

export const onMapClick = handler => {
  let off = false;
  ready.then(() => { if (!off) map.on('click', handler); });
  return () => { off = true; map?.off('click', handler); };
};

/** Loads a quake onto the map and flies in from space. */
let evSet;
const evReady = new Promise(r => { evSet = r; });
export async function showEvent(event, { intro = false } = {}) {
  await ready;
  ev = event;
  evSet();
  epicenter?.remove();
  const el = document.createElement('div');
  el.className = 'epi';
  el.innerHTML = '<i></i><i></i><i></i><b></b>';
  epicenter = new maplibregl.Marker({ element: el }).setLngLat([ev.lon, ev.lat]).addTo(map);

  map.getSource('contours').setData(ev.contours || empty());
  drawShake();
  // If the reader already scrolled into a chapter of the story, don't yank the camera back.
  if (story && story !== 'hero') return;
  frame('event', { animate: !intro });
  if (intro && !reduceMotion()) {
    await new Promise(r => setTimeout(r, 350));
    map.once('moveend', () => shockwave());
  }
}

function drawShake() {
  if (map.getLayer('shake')) map.removeLayer('shake');
  if (map.getSource('shake')) map.removeSource('shake');
  const g = ev.grid;
  if (!g) return;
  const canvas = document.createElement('canvas');
  canvas.width = g.nx; canvas.height = g.ny;
  const ctx = canvas.getContext('2d'), img = ctx.createImageData(g.nx, g.ny);
  for (let row = 0; row < g.ny; row++) {
    for (let col = 0; col < g.nx; col++) {
      const v = g.values[row * g.nx + col];
      const i = ((g.ny - 1 - row) * g.nx + col) * 4; // grid rows run south → north
      const [r, gr, b] = mmiRGB(v);
      img.data[i] = r; img.data[i + 1] = gr; img.data[i + 2] = b;
      img.data[i + 3] = Math.round(255 * Math.max(0, Math.min(0.6, (v - 3.8) * 0.13))); // only tint where it was felt clearly
    }
  }
  ctx.putImageData(img, 0, 0);
  map.addSource('shake', { type: 'image', url: canvas.toDataURL(), coordinates: [[g.x0, g.y1], [g.x1, g.y1], [g.x1, g.y0], [g.x0, g.y0]] });
  map.addLayer({ id: 'shake', type: 'raster', source: 'shake', paint: { 'raster-opacity': 0, 'raster-resampling': 'linear', 'raster-opacity-transition': { duration: 1800 } } }, 'waves-fill');
  requestAnimationFrame(() => map.setPaintProperty('shake', 'raster-opacity', 0.85));
}

/** Frames the map for a screen. On phones the panel covers the bottom, so pad for it. */
export function frame(scene, { animate = true, extra } = {}) {
  if (!ev || !map?.getSource('aftershocks')) return;
  const wide = innerWidth >= 900;
  const mapH = innerHeight * (['casa', 'ciencia'].includes(document.body.dataset.route) ? 0.3 : 0.44);
  const padding = wide ? { top: 90, bottom: 60, left: 520, right: 60 } : { top: 80, bottom: innerHeight - mapH + 10, left: 20, right: 20 };
  let radius = aftershockRadius(ev.mag);
  if (scene === 'cities' && ev.cities?.length) radius = Math.max(radius, ...ev.cities.slice(0, 40).map(c => Math.hypot(c.lat - ev.lat, (c.lon - ev.lon) * Math.cos(ev.lat * Math.PI / 180)) * 111));
  const p = map.getPadding();
  if (p.top || p.bottom || p.left || p.right) map.setPadding({ top: 0, bottom: 0, left: 0, right: 0 });
  const pts = circle([ev.lon, ev.lat], radius, 32).concat(extra || []);
  const lons = pts.map(p => p[0]), lats = pts.map(p => p[1]);
  // animate=false is the intro: a slow, cinematic descent from the globe.
  const duration = reduceMotion() ? 0 : animate ? 1400 : 4200;
  map.fitBounds([[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]], { padding, duration, maxZoom: 9, pitch: 0, bearing: 0, essential: true });
  map.setLayoutProperty('cities', 'visibility', scene === 'cities' ? 'visible' : 'none');
  map.setPaintProperty('aftershocks', 'circle-opacity', scene === 'cities' ? 0.15 : ['get', 'o']);
  map.setLayoutProperty('local', 'visibility', scene === 'cities' ? 'none' : 'visible');
  if (scene !== 'you') clearYou();
}

// ---- Aftershocks ----
let shocks = [];
export async function setAftershocks(list, { fresh = [] } = {}) {
  await ready;
  shocks = list;
  if (!playing) renderShocks(Infinity);
  for (const s of fresh) flash(s);
}
function renderShocks(until) {
  const now = Date.now();
  map.getSource('aftershocks').setData({
    type: 'FeatureCollection',
    features: shocks.filter(s => s.time <= until).sort((a, b) => a.mag - b.mag).map(s => pt(s.lon, s.lat, {
      mag: s.mag, place: s.place, time: s.time, color: magColor(s.mag),
      o: Math.max(0.45, 1 - (now - s.time) / (7 * 864e5) * 0.55),
    })),
  });
}

/** Expanding ring on a just-arrived aftershock. */
const flashes = [];
function flash(s) {
  if (reduceMotion()) return;
  flashes.push({ s, t0: performance.now() });
  if (flashAnim) return;
  const step = now => {
    for (let i = flashes.length - 1; i >= 0; i--) if (now - flashes[i].t0 > 1400) flashes.splice(i, 1);
    map.getSource('flash').setData({ type: 'FeatureCollection', features: flashes.map(({ s, t0 }) => {
      const t = (now - t0) / 1400;
      return pt(s.lon, s.lat, { r: 4 + t * (10 + s.mag * 6), o: 1 - t, color: magColor(s.mag) });
    }) });
    flashAnim = flashes.length ? requestAnimationFrame(step) : null;
  };
  flashAnim = requestAnimationFrame(step);
}

/** Replays the whole sequence in a few seconds. onTick(time, shownCount); resolves when done. */
export function playSequence(onTick, seconds = 14) {
  stopSequence();
  return new Promise(resolve => {
    const t0 = ev.time, t1 = Math.max(Date.now(), t0 + 3600e3), start = performance.now();
    const sorted = [...shocks].sort((a, b) => a.time - b.time);
    let shown = 0;
    const step = now => {
      const p = Math.min(1, (now - start) / (seconds * 1000));
      const t = t0 + (t1 - t0) * p * p; // aftershocks bunch up early: slow motion at the start
      while (shown < sorted.length && sorted[shown].time <= t) flash(sorted[shown++]);
      renderShocks(t);
      onTick?.(t, shown, p);
      if (p < 1 && playing) playing = requestAnimationFrame(step);
      else { playing = null; renderShocks(Infinity); resolve(); }
    };
    playing = requestAnimationFrame(step);
  });
}
export function stopSequence() {
  if (!map) return;
  if (playing) cancelAnimationFrame(playing);
  playing = null;
  if (shocks.length) renderShocks(Infinity);
}

/** Quakes from the Universidad de Panamá network, from the main shock on. */
let localList = [];
export async function setLocal(list, until = Infinity) {
  await ready;
  localList = list || [];
  const now = Date.now();
  map.getSource('local').setData({ type: 'FeatureCollection', features: localList.filter(s => s.time <= until).map(s => pt(s.lon, s.lat, {
    mag: s.mag, place: s.place, time: s.time, color: magColor(s.mag), o: Math.max(0.35, 0.9 - (now - s.time) / (7 * 864e5) * 0.5) })) });
}

// ---- Waves ----
function animateWaves(build, duration, done) {
  cancelAnimationFrame(waveAnim);
  const start = performance.now();
  const step = now => {
    const t = Math.min(1, (now - start) / duration);
    map.getSource('waves').setData({ type: 'FeatureCollection', features: build(t) });
    if (t < 1) waveAnim = requestAnimationFrame(step);
    else { waveAnim = null; done?.(); }
  };
  waveAnim = requestAnimationFrame(step);
}
const ring = (radius, props) => ({ type: 'Feature', properties: props, geometry: { type: 'Polygon', coordinates: [circle([ev.lon, ev.lat], Math.max(0.5, radius))] } });

/** The intro burst: three rings rolling out from the epicenter. */
function shockwave() {
  const reach = aftershockRadius(ev.mag) * 2.2;
  animateWaves(t => [0, 0.18, 0.36].map(delay => {
    const k = Math.max(0, Math.min(1, (t - delay) / (1 - delay)));
    return ring(reach * k, { color: '#ffb547', fill: 0.07 * (1 - k), width: 2.2 * (1 - k) + 0.4, opacity: 1 - k });
  }), 2600, () => map.getSource('waves').setData(empty()));
}

/**
 * You vs the quake: P and S waves travel to your spot in slow motion, the screen jolts when the
 * S wave lands, then the camera dives into a 3D city with your building lit in your intensity color.
 * Calls onWave('p' | 's', secondsAfterOrigin) as each arrives, and onBuilding(heightMeters) if
 * OpenStreetMap knows the building at your spot.
 */
export async function showYou(lat, lon, distance, { mmi = 5, onWave, onBuilding } = {}) {
  await ready;
  await evReady; // a shared link can open Tú before the quake is on the map
  clearYou();
  const token = youToken;
  const color = mmiColor(mmi);
  const el = document.createElement('div');
  el.className = 'you';
  el.style.setProperty('--c', color);
  el.innerHTML = '<i></i><i></i><b></b>';
  youMarker = new maplibregl.Marker({ element: el }).setLngLat([lon, lat]).addTo(map);
  // Already looking at the city (e.g. tapping another building): stay there.
  const inCity = map.getZoom() >= 14 && km(map.getCenter().lat, map.getCenter().lng, lat, lon) < 4;
  if (inCity) {
    lightBuilding(lat, lon, color, onBuilding, token);
    map.easeTo({ center: [lon, lat], duration: reduceMotion() ? 0 : 900, padding: cityPadding(), essential: true });
  } else {
    map.getSource('link').setData({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [[ev.lon, ev.lat], [lon, lat]] } });
    frame('you', { extra: circle([lon, lat], 15, 8) });
  }

  const pSpeed = 6.5, sSpeed = 3.6; // km/s, typical crustal speeds
  const hypo = Math.hypot(distance, ev.depth || 10);
  const sArrive = hypo / sSpeed, pArrive = hypo / pSpeed;
  const total = Math.max(sArrive * 1.15, 6); // seconds of quake time to show
  const duration = reduceMotion() ? 1 : inCity ? 2600 : Math.min(7000, Math.max(3200, total * 120));
  let pDone = false, sDone = false;
  animateWaves(t => {
    const secs = total * t;
    if (!pDone && secs >= pArrive) { pDone = true; onWave?.('p', pArrive); shake(Math.max(1.5, (mmi - 3) * 0.6), 500); }
    if (!sDone && secs >= sArrive) { sDone = true; onWave?.('s', sArrive); shake(Math.max(3, (mmi - 2) * 2.2), 1300); }
    return [
      ring(secs * pSpeed, { color: '#7fd4ff', fill: 0.05, width: 1.6, opacity: 0.9 }),
      ring(secs * sSpeed, { color: '#ffb547', fill: 0.1, width: 2.4, opacity: 1 }),
    ];
  }, duration, () => {
    if (inCity || token !== youToken) return;
    setTimeout(() => token === youToken && dive(lat, lon, color, onBuilding, token), reduceMotion() ? 0 : 500);
  });
}

let youToken = 0, orbitAnim = 0;
export function clearYou() {
  youToken++;
  youMarker?.remove(); youMarker = null;
  cancelAnimationFrame(waveAnim); waveAnim = null;
  cancelAnimationFrame(orbitAnim); orbitAnim = 0;
  if (map?.getSource('link')) { map.getSource('link').setData(empty()); map.getSource('waves').setData(empty()); }
  map?.getSource('mine')?.setData(empty());
}

// ---- 3D city ----
const BUILDINGS = 'https://tiles.openfreemap.org/planet';
// Keeps your spot centered in the part of the map the panel doesn't cover (frame() clears it again).
const cityPadding = () => innerWidth >= 900 ? { top: 60, bottom: 40, left: 500, right: 40 }
  : { top: 70, bottom: innerHeight - innerHeight * 0.44, left: 0, right: 0 };

/** Building heights come from OpenFreeMap, added only the first time someone dives in. */
function ensureBuildings() {
  if (map.getSource('ofm')) return;
  map.addSource('ofm', { type: 'vector', url: BUILDINGS, attribution: '<a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> © OpenMapTiles' });
  map.addSource('mine', { type: 'geojson', data: empty() });
  const height = ['coalesce', ['get', 'render_height'], 6];
  // Buildings rise out of the ground as the camera comes down.
  const rise = v => ['interpolate', ['cubic-bezier', 0.2, 0.8, 0.3, 1], ['zoom'], 14.6, 0, 15.8, v];
  map.addLayer({ id: 'bldg', type: 'fill-extrusion', source: 'ofm', 'source-layer': 'building', minzoom: 14.6, paint: {
    'fill-extrusion-color': ['interpolate', ['linear'], height, 0, '#1b2436', 30, '#24395c', 90, '#3a5d94', 200, '#5b86c7'],
    'fill-extrusion-height': rise(height), 'fill-extrusion-base': rise(['coalesce', ['get', 'render_min_height'], 0]),
    'fill-extrusion-opacity': 0.9, 'fill-extrusion-vertical-gradient': true } }, labels);
  map.addLayer({ id: 'mine', type: 'fill-extrusion', source: 'mine', paint: {
    'fill-extrusion-color': ['get', 'color'], 'fill-extrusion-height': ['get', 'h'], 'fill-extrusion-base': ['get', 'b'],
    'fill-extrusion-opacity': 0.95 } }, labels);
}

async function dive(lat, lon, color, onBuilding, token) {
  ensureBuildings();
  map.setMaxPitch(70);
  const still = reduceMotion();
  map.flyTo({ center: [lon, lat], zoom: 16.4, pitch: 60, bearing: -28, padding: cityPadding(),
    duration: still ? 0 : 3400, curve: 1.6, essential: true });
  await new Promise(r => map.once('moveend', r));
  if (token !== youToken) return;
  lightBuilding(lat, lon, color, onBuilding, token);
  if (!still) orbit(token);
}

/** Finds the building under your spot and paints it in your intensity color. */
async function lightBuilding(lat, lon, color, onBuilding, token) {
  ensureBuildings();
  if (!map.areTilesLoaded()) await new Promise(r => map.once('idle', r));
  if (token !== youToken) return;
  const b = buildingAt(lat, lon);
  if (!b) { onBuilding?.(null); return; }
  const h = +b.properties.render_height || 6;
  map.getSource('mine').setData({ type: 'Feature', geometry: b.geometry,
    properties: { h: h + 0.6, b: +b.properties.render_min_height || 0, color } });
  onBuilding?.(h);
}

/** The building containing the point, or the closest one within ~25 m (from the loaded tiles). */
function buildingAt(lat, lon) {
  let best = null, bestD = 25;
  for (const f of map.querySourceFeatures('ofm', { sourceLayer: 'building' })) {
    const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates : [];
    for (const poly of polys) {
      if (inside(poly[0], lon, lat)) return { geometry: { type: 'Polygon', coordinates: poly }, properties: f.properties };
      const d = Math.min(...poly[0].map(([x, y]) => km(lat, lon, y, x) * 1000));
      if (d < bestD) { bestD = d; best = { geometry: { type: 'Polygon', coordinates: poly }, properties: f.properties }; }
    }
  }
  return best;
}
function inside(ring, x, y) {
  let ok = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) ok = !ok;
  }
  return ok;
}

/** A slow drift around your building until someone touches the map. */
function orbit(token) {
  let last = performance.now();
  const stop = () => { cancelAnimationFrame(orbitAnim); orbitAnim = 0; };
  for (const e of ['dragstart', 'wheel', 'touchstart', 'mousedown']) map.once(e, stop);
  const step = now => {
    if (token !== youToken) return;
    map.setBearing(map.getBearing() + (now - last) / 1000 * 2.4);
    last = now;
    orbitAnim = requestAnimationFrame(step);
  };
  orbitAnim = requestAnimationFrame(step);
}

/** The whole map jolts, harder for stronger shaking. */
function shake(px, ms) {
  if (reduceMotion()) return;
  const n = Math.round(ms / 45);
  const frames = Array.from({ length: n }, (_, i) => {
    const k = px * (1 - i / n);
    return { transform: `translate(${(Math.random() * 2 - 1) * k}px, ${(Math.random() * 2 - 1) * k * 0.6}px)` };
  });
  map.getContainer().animate([...frames, { transform: 'none' }], { duration: ms, easing: 'linear' });
}

export async function showCities(cities) {
  await ready;
  map.getSource('cities').setData({ type: 'FeatureCollection', features: (cities || []).map(c =>
    pt(c.lon, c.lat, { name: c.name, mmi: c.mmi, color: mmiColor(c.mmi), logpop: Math.log10(Math.max(1000, c.pop)) })) });
}

export function focusPoint(lon, lat, zoom = 9) {
  map?.flyTo({ center: [lon, lat], zoom, duration: reduceMotion() ? 0 : 1400, essential: true });
}

// ---- Story scenes for the home screen ----
// Slip color ramp (m), from deep purple to white-hot.
const SLIP_COLOR = ['interpolate', ['linear'], ['get', 'slip'], 0, '#2a1446', 1, '#5b1f7a', 2.5, '#b3306b', 4.5, '#ec5a3c', 6.5, '#ffb547', 7.8, '#fff3c4'];
let story = null, ruptureAnim = 0, storyMarkers = [];

/** Hands the fault model to the map (features with slip in m and rupture time in s). */
export async function setFault(geojson) {
  await ready;
  map.getSource('ffm').setData(geojson || empty());
}

/** Plays the rupture: patches rise as the break reaches them. onTick(seconds) for the UI. */
export function playRupture(total, onTick, ms = 6500) {
  cancelAnimationFrame(ruptureAnim);
  const start = performance.now();
  const step = now => {
    const k = Math.min(1, (now - start) / (reduceMotion() ? 1 : ms));
    const T = k * total;
    // Height ramps up over ~4 s of fault time after each patch starts slipping; the active front glows.
    map.setPaintProperty('ffm', 'fill-extrusion-height',
      ['*', ['get', 'slip'], 5200, ['min', 1, ['max', 0, ['/', ['-', T, ['get', 'trup']], 4]]]]);
    map.setPaintProperty('ffm', 'fill-extrusion-color',
      ['case', ['all', ['<=', ['get', 'trup'], T], ['>', ['get', 'trup'], T - 2.5]], '#ffffff', SLIP_COLOR]);
    onTick?.(T, k);
    if (k < 1) ruptureAnim = requestAnimationFrame(step);
    else map.setPaintProperty('ffm', 'fill-extrusion-color', SLIP_COLOR);
  };
  ruptureAnim = requestAnimationFrame(step);
}

/** Shows aftershocks (USGS and the local network) only up to a moment in time. */
export function shockTime(until) {
  if (!map?.getSource('aftershocks')) return;
  renderShocks(until);
  setLocal(localList, until);
}

/** Lets the home screen use the map as a backdrop on phones (swipes scroll the page instead). */
export async function setInteractive(on) {
  await ready;
  for (const h of ['dragPan', 'scrollZoom', 'touchZoomRotate', 'doubleClickZoom', 'keyboard']) on ? map[h].enable() : map[h].disable();
  if (on) map.touchZoomRotate.disableRotation();
}

/** On phones, lets a one-finger swipe over the map scroll the page instead of dragging the map. Taps and pinch-zoom still reach the map. */
export async function setSwipeScroll(on) {
  await ready;
  on ? map.dragPan.disable() : map.dragPan.enable();
}

const clearStoryMarkers = () => { storyMarkers.forEach(m => m.remove()); storyMarkers = []; };
const marker = (lon, lat, html, cls) => {
  const el = document.createElement('div');
  el.className = cls; el.innerHTML = html;
  const m = new maplibregl.Marker({ element: el }).setLngLat([lon, lat]).addTo(map);
  storyMarkers.push(m);
  return m;
};

/**
 * Moves the camera and layers for each chapter of the home screen:
 * hero, fault, shocks, shaking, listen, forecast, calm.
 */
export async function scene(name, data = {}) {
  await ready;
  await evReady;
  if (story === name) return;
  story = name;
  const wide = innerWidth >= 900, still = reduceMotion();
  const padding = wide ? { top: 90, bottom: 60, left: 520, right: 60 } : { top: 80, bottom: innerHeight * 0.42, left: 24, right: 24 };
  // Each scene starts from a clean camera padding (flyTo keeps the padding it was given).
  const pd = map.getPadding();
  if (pd.top || pd.bottom || pd.left || pd.right) map.setPadding({ top: 0, bottom: 0, left: 0, right: 0 });
  const fly = opts => map.flyTo({ duration: still ? 0 : 2600, curve: 1.3, essential: true, padding, ...opts });
  // Fit an area, then tilt: computed flat first because fitting with a tilt can fail on the globe.
  const fit = (bounds, { pitch = 0, bearing = 0, maxZoom = 9, pad = padding } = {}) => {
    const cam = map.cameraForBounds(bounds, { padding: pad, maxZoom });
    if (cam) map.flyTo({ ...cam, pitch, bearing, duration: still ? 0 : 2600, curve: 1.3, essential: true });
  };
  clearStoryMarkers();
  cancelAnimationFrame(ruptureAnim);
  map.setLayoutProperty('ffm', 'visibility', name === 'fault' ? 'visible' : 'none');
  map.setLayoutProperty('path', 'visibility', name === 'listen' ? 'visible' : 'none');
  if (map.getLayer('shake')) map.setPaintProperty('shake', 'raster-opacity', name === 'shaking' ? 0.95 : name === 'fault' ? 0.25 : 0.6);
  map.setPaintProperty('contours', 'line-opacity', name === 'shaking' ? 0.95 : 0.4);
  map.setPaintProperty('contours', 'line-width', name === 'shaking' ? 1.8 : 1.1);
  if (name !== 'shocks') shockTime(Infinity);
  // The fault scene is about the fault: aftershocks fade back.
  map.setPaintProperty('aftershocks', 'circle-opacity', name === 'fault' ? 0.12 : ['get', 'o']);
  map.setPaintProperty('local', 'circle-stroke-opacity', name === 'fault' ? 0.1 : ['get', 'o']);
  if (name !== 'listen') map.getSource('waves')?.setData(empty());

  if (name === 'hero' || name === 'calm') {
    frame('event');
  } else if (name === 'fault') {
    map.setMaxPitch(70);
    fly({ center: data.center || [ev.lon, ev.lat], zoom: wide ? 8.1 : 7.75, pitch: 64, bearing: -20 });
    map.once('moveend', () => story === 'fault' && data.onArrive?.());
  } else if (name === 'shocks') {
    map.setMaxPitch(70);
    // On phones the counter card sits at the top, so the aftershocks go in the space below it.
    fly({ center: [ev.lon, ev.lat], zoom: wide ? 7.2 : 6.9, pitch: 40, bearing: 12, padding: wide ? padding : { top: 330, bottom: 100, left: 16, right: 16 } });
  } else if (name === 'shaking') {
    const g = ev.grid;
    if (g) fit([[g.x0 + (g.x1 - g.x0) * 0.18, g.y0 + (g.y1 - g.y0) * 0.18], [g.x1 - (g.x1 - g.x0) * 0.18, g.y1 - (g.y1 - g.y0) * 0.18]]);
    else frame('event');
  } else if (name === 'listen' && data.station) {
    const st = data.station;
    map.getSource('path').setData({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [[ev.lon, ev.lat], [st.lon, st.lat]] } });
    marker(st.lon, st.lat, `<i></i><b><svg viewBox="0 0 24 24" width="16" height="16"><path d="M2 12h4l2-6 4 12 3-9 2 3h5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg></b><span>${esc(st.short || st.name)}</span>`, 'station');
    fit([[Math.min(ev.lon, st.lon), Math.min(ev.lat, st.lat)], [Math.max(ev.lon, st.lon), Math.max(ev.lat, st.lat)]],
      { pitch: 45, bearing: -10, pad: wide ? padding : { ...padding, top: 120, left: 50, right: 50 } });
  } else if (name === 'forecast') {
    const list = data.history || [];
    list.forEach((h, i) => marker(h.lon, h.lat, `<i style="animation-delay:${i * 0.35}s"></i><b style="--c:${magColor(h.mag)}">${num(h.mag, 1)}</b><span>${new Date(h.time).getUTCFullYear()}</span>`, 'past'));
    const pts = list.map(h => [h.lon, h.lat]).concat([[ev.lon, ev.lat]]);
    const lons = pts.map(p => p[0]), lats = pts.map(p => p[1]);
    fit([[Math.min(...lons) - 0.6, Math.min(...lats) - 0.6], [Math.max(...lons) + 0.6, Math.max(...lats) + 0.6]], { pitch: 30, maxZoom: 7.5 });
  }
}
/** Leaves the story: everything back to normal. */
export function endStory() {
  story = null;
  cancelAnimationFrame(ruptureAnim);
  if (!map?.getLayer('ffm')) return;
  clearStoryMarkers();
  map.setLayoutProperty('ffm', 'visibility', 'none');
  map.setLayoutProperty('path', 'visibility', 'none');
  map.setPaintProperty('aftershocks', 'circle-opacity', ['get', 'o']);
  map.setPaintProperty('local', 'circle-stroke-opacity', ['get', 'o']);
  shockTime(Infinity);
}

/** P and S wave fronts at a moment (seconds after the quake), for the seismogram playback. */
export function wavesAt(secs) {
  if (!map?.getSource('waves')) return;
  map.getSource('waves').setData({ type: 'FeatureCollection', features: secs < 0 ? [] : [
    ring(secs * 6.5, { color: '#7fd4ff', fill: 0.04, width: 1.6, opacity: 0.9 }),
    ring(secs * 3.6, { color: '#ffb547', fill: 0.08, width: 2.4, opacity: 1 }),
  ] });
}

/** Shakes the map, for the sound of the quake. */
export function jolt(px) { shake(px, 160); }
