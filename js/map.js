// The living map behind every screen: globe intro, shaking heat, aftershocks, waves.
import { circle, mmiRGB, magColor, mmiColor, esc, num, shortTime, reduceMotion } from './util.js';
import { aftershockRadius } from './data.js';

const STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';
const empty = () => ({ type: 'FeatureCollection', features: [] });
const pt = (lon, lat, props = {}) => ({ type: 'Feature', properties: props, geometry: { type: 'Point', coordinates: [lon, lat] } });

let map, ready, ev, epicenter, youMarker, popup;
let playing = null, waveAnim = null, flashAnim = null;

export function initMap(el) {
  map = new maplibregl.Map({
    container: el, style: STYLE, center: [-40, 15], zoom: 1.3,
    attributionControl: { compact: true }, pitchWithRotate: false, dragRotate: false,
    maxPitch: 0, renderWorldCopies: false,
  });
  map.touchZoomRotate.disableRotation();
  popup = new maplibregl.Popup({ closeButton: false, closeOnClick: true, className: 'map-pop', offset: 10 });
  ready = new Promise(resolve => map.on('load', () => { setup(); resolve(); }));
  map.on('style.load', () => { try { map.setProjection({ type: 'globe' }); } catch { /* older engines: flat map */ } });
  return ready;
}

function setup() {
  const before = map.getStyle().layers.find(l => l.type === 'symbol')?.id;
  const add = (layer, under = before) => map.addLayer(layer, under);
  for (const id of ['contours', 'aftershocks', 'flash', 'waves', 'cities', 'link']) map.addSource(id, { type: 'geojson', data: empty() });

  add({ id: 'waves-fill', type: 'fill', source: 'waves', paint: { 'fill-color': ['get', 'color'], 'fill-opacity': ['get', 'fill'] } });
  add({ id: 'waves-line', type: 'line', source: 'waves', paint: { 'line-color': ['get', 'color'], 'line-width': ['get', 'width'], 'line-opacity': ['get', 'opacity'], 'line-blur': 0.6 } });
  add({ id: 'contours', type: 'line', source: 'contours', layout: { 'line-join': 'round' },
    paint: { 'line-color': ['get', 'color'], 'line-width': 1.1, 'line-opacity': 0.55, 'line-dasharray': [2, 2] } });
  add({ id: 'link', type: 'line', source: 'link', paint: { 'line-color': '#ffffff', 'line-width': 1.4, 'line-opacity': 0.7, 'line-dasharray': [1, 2] } });
  add({ id: 'flash', type: 'circle', source: 'flash', paint: {
    'circle-radius': ['get', 'r'], 'circle-color': 'rgba(0,0,0,0)',
    'circle-stroke-color': ['get', 'color'], 'circle-stroke-width': 2, 'circle-stroke-opacity': ['get', 'o'] } }, undefined);
  add({ id: 'aftershocks', type: 'circle', source: 'aftershocks', paint: {
    'circle-radius': ['interpolate', ['exponential', 1.6], ['get', 'mag'], 2.5, 2.5, 4, 5, 5, 8, 6, 13, 7, 20],
    'circle-color': ['get', 'color'], 'circle-opacity': ['get', 'o'],
    'circle-stroke-color': '#07090f', 'circle-stroke-width': 1 } }, undefined);
  add({ id: 'cities', type: 'circle', source: 'cities', layout: { visibility: 'none' }, paint: {
    'circle-radius': ['interpolate', ['linear'], ['get', 'logpop'], 3, 3.5, 6, 9],
    'circle-color': ['get', 'color'], 'circle-opacity': 0.9, 'circle-stroke-color': '#07090f', 'circle-stroke-width': 1.2 } }, undefined);

  map.on('click', 'aftershocks', e => {
    const p = e.features[0].properties;
    popup.setLngLat(e.lngLat).setHTML(`<b>M ${num(p.mag, 1)}</b><span>${esc(p.place)}</span><small>${esc(shortTime(p.time))}</small>`).addTo(map);
  });
  map.on('click', 'cities', e => {
    const p = e.features[0].properties;
    popup.setLngLat(e.lngLat).setHTML(`<b>${esc(p.name)}</b><span>Intensidad ${num(p.mmi, 1)}</span>`).addTo(map);
  });
  for (const id of ['aftershocks', 'cities']) {
    map.on('mouseenter', id, () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', id, () => { map.getCanvas().style.cursor = ''; });
  }
}

export const onMapClick = handler => { map.on('click', handler); return () => map.off('click', handler); };

/** Loads a quake onto the map and flies in from space. */
export async function showEvent(event, { intro = false } = {}) {
  await ready;
  ev = event;
  epicenter?.remove();
  const el = document.createElement('div');
  el.className = 'epi';
  el.innerHTML = '<i></i><i></i><i></i><b></b>';
  epicenter = new maplibregl.Marker({ element: el }).setLngLat([ev.lon, ev.lat]).addTo(map);

  map.getSource('contours').setData(ev.contours || empty());
  drawShake();
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
  if (!ev) return;
  const wide = innerWidth >= 900;
  const mapH = innerHeight * (['casa', 'ciencia'].includes(document.body.dataset.route) ? 0.3 : 0.44);
  const padding = wide ? { top: 90, bottom: 60, left: 520, right: 60 } : { top: 80, bottom: innerHeight - mapH + 10, left: 20, right: 20 };
  let radius = aftershockRadius(ev.mag);
  if (scene === 'cities' && ev.cities?.length) radius = Math.max(radius, ...ev.cities.slice(0, 40).map(c => Math.hypot(c.lat - ev.lat, (c.lon - ev.lon) * Math.cos(ev.lat * Math.PI / 180)) * 111));
  const pts = circle([ev.lon, ev.lat], radius, 32).concat(extra || []);
  const lons = pts.map(p => p[0]), lats = pts.map(p => p[1]);
  // animate=false is the intro: a slow, cinematic descent from the globe.
  const duration = reduceMotion() ? 0 : animate ? 1400 : 4200;
  map.fitBounds([[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]], { padding, duration, maxZoom: 9, essential: true });
  map.setLayoutProperty('cities', 'visibility', scene === 'cities' ? 'visible' : 'none');
  map.setPaintProperty('aftershocks', 'circle-opacity', scene === 'cities' ? 0.15 : ['get', 'o']);
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
  if (playing) cancelAnimationFrame(playing);
  playing = null;
  if (shocks.length) renderShocks(Infinity);
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
 * You vs the quake: P and S waves travel to your spot in slow motion.
 * Calls onWave('p' | 's', secondsAfterOrigin) as each arrives.
 */
export function showYou(lat, lon, distance, onWave) {
  clearYou();
  const el = document.createElement('div');
  el.className = 'you';
  el.innerHTML = '<b></b>';
  youMarker = new maplibregl.Marker({ element: el }).setLngLat([lon, lat]).addTo(map);
  map.getSource('link').setData({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [[ev.lon, ev.lat], [lon, lat]] } });
  frame('you', { extra: circle([lon, lat], 15, 8) });

  const pSpeed = 6.5, sSpeed = 3.6; // km/s, typical crustal speeds
  const hypo = Math.hypot(distance, ev.depth || 10);
  const sArrive = hypo / sSpeed, pArrive = hypo / pSpeed;
  const total = Math.max(sArrive * 1.15, 6); // seconds of quake time to show
  const duration = reduceMotion() ? 1 : Math.min(9000, Math.max(3500, total * 140));
  let pDone = false, sDone = false;
  animateWaves(t => {
    const secs = total * t;
    if (!pDone && secs >= pArrive) { pDone = true; onWave?.('p', pArrive); }
    if (!sDone && secs >= sArrive) { sDone = true; onWave?.('s', sArrive); }
    return [
      ring(secs * pSpeed, { color: '#7fd4ff', fill: 0.05, width: 1.6, opacity: 0.9 }),
      ring(secs * sSpeed, { color: '#ffb547', fill: 0.1, width: 2.4, opacity: 1 }),
    ];
  }, duration);
}
export function clearYou() {
  youMarker?.remove(); youMarker = null;
  cancelAnimationFrame(waveAnim); waveAnim = null;
  if (map?.getSource('link')) { map.getSource('link').setData(empty()); map.getSource('waves').setData(empty()); }
}

export async function showCities(cities) {
  await ready;
  map.getSource('cities').setData({ type: 'FeatureCollection', features: (cities || []).map(c =>
    pt(c.lon, c.lat, { name: c.name, mmi: c.mmi, color: mmiColor(c.mmi), logpop: Math.log10(Math.max(1000, c.pop)) })) });
}

export function focusPoint(lon, lat, zoom = 9) {
  map.flyTo({ center: [lon, lat], zoom, duration: reduceMotion() ? 0 : 1400, essential: true });
}
