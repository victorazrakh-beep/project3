// Everything comes live from the USGS public APIs (they allow browser requests).
import { km } from './util.js';

const API = 'https://earthquake.usgs.gov/fdsnws/event/1/query';
const FEED = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary';

async function json(url) {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`USGS ${res.status}`);
  return res.json();
}
const optional = url => url ? json(url).catch(() => null) : Promise.resolve(null);

/** The quake itself, plus every USGS product we use (any of which may be missing). */
export async function loadEvent(id) {
  const raw = await detail(id);
  const p = raw.properties;
  const [lon, lat, depth] = raw.geometry.coordinates;
  const products = p.products || {};
  const file = (type, name) => products[type]?.[0]?.contents?.[name]?.url;
  const mt = products['moment-tensor']?.[0]?.properties || {};

  const [grid, contours, cities, exposure, forecast] = await Promise.all([
    optional(file('shakemap', 'download/coverage_mmi_low_res.covjson')),
    optional(file('shakemap', 'download/cont_mmi.json')),
    optional(file('losspager', 'json/cities.json')),
    optional(file('losspager', 'json/exposures.json')),
    optional(file('oaf', 'forecast.json')),
  ]);

  return {
    id: raw.id,
    mag: p.mag,
    magType: p.magType,
    place: p.place,
    title: p.title,
    time: p.time,
    lon, lat, depth,
    felt: p.felt || 0,
    maxMMI: p.mmi || null,
    alert: p.alert,
    tsunami: !!p.tsunami,
    url: p.url,
    inPanama: /Panama/i.test(p.place || ''),
    grid: grid ? parseGrid(grid) : null,
    contours,
    cities: cities?.all_cities?.filter(c => c.mmi >= 1).sort((a, b) => b.mmi - a.mmi) || null,
    exposure: exposure?.population_exposure || null,
    forecast: forecast?.forecast || null,
    forecastTimes: forecast ? { created: forecast.creationTime, next: forecast.nextForecastTime } : null,
    dyfiUrl: file('dyfi', 'dyfi_geo_10km.geojson') || null,
    historyUrl: file('losspager', 'json/historical_earthquakes.json') || null,
    groundFailure: groundFailure(products['ground-failure']?.[0]?.properties),
    mechanism: mt['nodal-plane-1-rake'] != null ? {
      strike: +mt['nodal-plane-1-strike'], dip: +mt['nodal-plane-1-dip'], rake: +mt['nodal-plane-1-rake'],
      moment: +mt['scalar-moment'] || null,
    } : null,
  };
}

function groundFailure(p) {
  if (!p) return null;
  return {
    landslide: p['landslide-alert'] || null,
    liquefaction: p['liquefaction-alert'] || null,
    landslidePeople: +p['landslide-population-alert-value'] || 0,
    liquefactionPeople: +p['liquefaction-population-alert-value'] || 0,
  };
}

const details = new Map();
/** The event record, fetched once (the shell asks for it early to overlap with other downloads). */
export function detail(id) {
  if (!details.has(id)) details.set(id, json(`${API}?eventid=${encodeURIComponent(id)}&format=geojson`).catch(e => { details.delete(id); throw e; }));
  return details.get(id);
}

// Loaded only when a screen needs them, then kept.
const memo = new Map();
const once = (key, load) => { if (!memo.has(key)) memo.set(key, load().catch(e => { memo.delete(key); throw e; })); return memo.get(key); };

/** "Did you feel it?" reports, averaged over 10 km squares. */
export const loadDYFI = ev => once(`dyfi-${ev.id}`, async () => {
  if (!ev.dyfiUrl) return [];
  const data = await json(ev.dyfiUrl);
  return data.features.map(f => {
    const ring = f.geometry.coordinates[0];
    const lon = ring.reduce((a, p) => a + p[0], 0) / ring.length, lat = ring.reduce((a, p) => a + p[1], 0) / ring.length;
    return { lat, lon, cdi: f.properties.cdi, responses: f.properties.nresp, ring };
  });
});

/** Strong past quakes near this one (USGS PAGER). */
export const loadHistory = ev => once(`hist-${ev.id}`, async () => {
  if (!ev.historyUrl) return [];
  const list = await json(ev.historyUrl);
  return list.map(h => ({ time: Date.parse(h.Time.replace(' ', 'T') + 'Z'), lat: h.Lat, lon: h.Lon, mag: h.Magnitude,
    depth: h.Depth, deaths: h.TotalDeaths || 0, maxMMI: h.MaxMMI, distance: h.Distance, tsunami: !!h.Tsunami }))
    .sort((a, b) => b.time - a.time);
});

/** Panamá's own seismic network (Universidad de Panamá), refreshed by a scheduled GitHub Action. */
export const loadLocal = () => once('up', async () => {
  const res = await fetch(`data/up.json?t=${Math.floor(Date.now() / 300000)}`);
  if (!res.ok) return null;
  return res.json();
});
export const refreshLocal = () => { memo.delete('up'); return loadLocal(); };

// ---- Place search (Photon, built on OpenStreetMap) ----
const PHOTON = 'https://photon.komoot.io';
let searchCtl;
function photonPlace(f) {
  const p = f.properties, [lon, lat] = f.geometry.coordinates;
  const detail = [p.district, p.city !== p.name ? p.city : null, p.county, p.state].filter(Boolean)
    .filter((v, i, a) => a.indexOf(v) === i).slice(0, 3).join(', ');
  const name = p.name || [p.street, p.housenumber].filter(Boolean).join(' ') || p.district || p.city || 'Lugar sin nombre';
  return { name, detail, lat, lon };
}
// Panamá's outline, roughly: its bounding box with the Costa Rica and Colombia borders as straight lines.
const PANAMA_BBOX = '-83.06,7.15,-77.15,9.70';
export const inPanama = (lat, lon) => lat > 7.15 && lat < 9.7
  && lon > -82.93 + 0.24 * (lat - 8.03) && lon < -77.89 + 0.36 * (lat - 7.22);

/** Searches places in Panamá only, ranked toward the epicenter. Cancels the previous search when a new one starts. */
export async function searchPlaces(query, ev) {
  searchCtl?.abort();
  searchCtl = new AbortController();
  const q = new URLSearchParams({ q: query, limit: 15, bbox: PANAMA_BBOX, lat: ev.lat, lon: ev.lon, zoom: 7, location_bias_scale: 0.1 });
  const res = await fetch(`${PHOTON}/api/?${q}`, { signal: searchCtl.signal });
  if (!res.ok) throw new Error('search failed');
  const seen = new Set();
  return (await res.json()).features
    .filter(f => f.properties.countrycode === 'PA')
    .map(photonPlace)
    .filter(p => { const k = `${p.name}|${p.detail}`; return !seen.has(k) && seen.add(k); })
    .slice(0, 8);
}

/** Rough rupture length (Wells & Coppersmith 1994) → how far out to look for aftershocks. */
export const aftershockRadius = mag => Math.max(40, Math.min(320, 1.5 * 10 ** (-2.44 + 0.59 * mag)));

export async function loadAftershocks(ev) {
  const q = new URLSearchParams({
    format: 'geojson', orderby: 'time',
    latitude: ev.lat, longitude: ev.lon, maxradiuskm: Math.round(aftershockRadius(ev.mag)),
    starttime: new Date(ev.time + 1000).toISOString(), minmagnitude: 2.5, limit: 2000,
  });
  const data = await json(`${API}?${q}`);
  return data.features
    .filter(f => f.id !== ev.id)
    .map(f => ({
      id: f.id, mag: f.properties.mag, place: f.properties.place, time: f.properties.time,
      lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1], depth: f.geometry.coordinates[2],
    }));
}

/** Big recent quakes for the event picker. */
export async function loadRecent() {
  const [sig, big] = await Promise.all([
    json(`${FEED}/significant_month.geojson`).catch(() => ({ features: [] })),
    json(`${FEED}/4.5_week.geojson`).catch(() => ({ features: [] })),
  ]);
  const seen = new Set();
  return [...sig.features, ...big.features]
    .filter(f => !seen.has(f.id) && seen.add(f.id))
    .map(f => ({ id: f.id, mag: f.properties.mag, place: f.properties.place, time: f.properties.time, sig: f.properties.sig }))
    .sort((a, b) => b.time - a.time);
}

// ---- Shaking at a point ----

function parseGrid(cov) {
  const { x, y } = cov.domain.axes;
  const range = Object.values(cov.ranges)[0];
  return { x0: x.start, x1: x.stop, nx: x.num, y0: y.start, y1: y.stop, ny: y.num, values: range.values };
}

/** Bilinear lookup in the USGS ShakeMap grid; null outside it. */
export function gridMMI(g, lat, lon) {
  if (!g) return null;
  const fx = (lon - g.x0) / (g.x1 - g.x0) * (g.nx - 1);
  const fy = (lat - g.y0) / (g.y1 - g.y0) * (g.ny - 1);
  if (fx < 0 || fy < 0 || fx > g.nx - 1 || fy > g.ny - 1) return null;
  const x = Math.min(Math.floor(fx), g.nx - 2), y = Math.min(Math.floor(fy), g.ny - 2);
  const tx = fx - x, ty = fy - y, v = (r, c) => g.values[r * g.nx + c];
  const top = v(y, x) * (1 - tx) + v(y, x + 1) * tx;
  const bottom = v(y + 1, x) * (1 - tx) + v(y + 1, x + 1) * tx;
  return top * (1 - ty) + bottom * ty;
}

/** Intensity prediction equation (Atkinson & Wald 2007) for places outside the ShakeMap. */
export function predictMMI(mag, distanceKm, depth = 10) {
  const h = Math.max(14, depth || 0);
  const r = Math.sqrt(distanceKm ** 2 + h ** 2);
  const m = mag - 6, logR = Math.log10(r), b = Math.max(0, Math.log10(r / 30));
  const v = 12.27 + 2.270 * m + 0.1304 * m * m - 1.30 * logR - 0.000707 * r + 1.95 * b - 0.577 * mag * logR;
  return Math.max(1, Math.min(10, v));
}

export function shakingAt(ev, lat, lon) {
  const distance = km(ev.lat, ev.lon, lat, lon);
  const fromGrid = gridMMI(ev.grid, lat, lon);
  return {
    distance,
    mmi: fromGrid ?? predictMMI(ev.mag, distance, ev.depth),
    source: fromGrid != null ? 'shakemap' : 'model',
  };
}
