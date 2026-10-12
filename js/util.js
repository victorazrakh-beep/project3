// Small shared helpers: formatting, intensity scale, geometry, animation.

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const nf = new Intl.NumberFormat('es-PA');
export const num = (n, digits = 0) => new Intl.NumberFormat('es-PA', { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(n);
export const int = n => nf.format(Math.round(n));
export const compact = n => new Intl.NumberFormat('es-PA', { notation: 'compact', maximumFractionDigits: 1 }).format(n);

const rtf = new Intl.RelativeTimeFormat('es', { numeric: 'auto' });
export function ago(t) {
  const s = (t - Date.now()) / 1000;
  const units = [['year', 31536000], ['month', 2592000], ['day', 86400], ['hour', 3600], ['minute', 60]];
  for (const [unit, size] of units) if (Math.abs(s) >= size) return rtf.format(Math.round(s / size), unit);
  return 'hace un momento';
}
export const dateTime = t => new Intl.DateTimeFormat('es-PA', { weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(t);
export const shortTime = t => new Intl.DateTimeFormat('es-PA', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(t);

// Modified Mercalli Intensity: the 1–10 scale used for "how hard did it shake here".
export const MMI = [
  null,
  { name: 'No sentido', color: '#dfe6ff', text: 'Solo lo registran los sismógrafos.' },
  { name: 'Débil', color: '#bfccff', text: 'Lo notan muy pocas personas, casi siempre en reposo y en pisos altos.' },
  { name: 'Leve', color: '#a0e6ff', text: 'Se nota dentro de casa, parecido al paso de un camión liviano. Las lámparas colgantes se mecen.' },
  { name: 'Ligero', color: '#80ffff', text: 'Lo siente casi todo el que está adentro. Vibran ventanas, puertas y platos; las paredes crujen.' },
  { name: 'Moderado', color: '#7aff93', text: 'Despierta a la gente. Se caen objetos pequeños y el agua se derrama de los vasos.' },
  { name: 'Fuerte', color: '#ffff00', text: 'Asusta a todos y cuesta caminar. Se mueven muebles pesados y se agrieta el repello.' },
  { name: 'Muy fuerte', color: '#ffc800', text: 'Es difícil mantenerse de pie. Daños leves en buenas construcciones y considerables en las débiles.' },
  { name: 'Severo', color: '#ff9100', text: 'Daños importantes en edificios comunes. Caen muros, chimeneas y tanques elevados.' },
  { name: 'Violento', color: '#ff2a1a', text: 'Daños graves incluso en estructuras bien diseñadas; algunas se desplazan de sus bases.' },
  { name: 'Extremo', color: '#d0002a', text: 'Destrucción generalizada de la mayoría de las construcciones.' },
];
const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
export const level = v => Math.max(1, Math.min(10, Math.round(v)));
export const roman = v => ROMAN[level(v)];
export const mmiInfo = v => MMI[level(v)];
export const mmiColor = v => MMI[level(v)].color;

/** Continuous color for map rasters: blends between neighbouring scale colors. */
export function mmiRGB(v) {
  const clamped = Math.max(1, Math.min(10, v));
  const lo = Math.floor(clamped), hi = Math.min(10, lo + 1), f = clamped - lo;
  const a = hex(MMI[lo].color), b = hex(MMI[hi].color);
  return a.map((c, i) => Math.round(c + (b[i] - c) * f));
}
const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));

export const magColor = m => m >= 7 ? '#ff2a1a' : m >= 6 ? '#ff9100' : m >= 5 ? '#ffc800' : m >= 4 ? '#ffe96b' : '#9fb6ff';

// ---- Geometry ----
const R = 6371;
const rad = d => d * Math.PI / 180;
export function km(lat1, lon1, lat2, lon2) {
  const a = Math.sin(rad(lat2 - lat1) / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lon2 - lon1) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
/** Polygon ring approximating a circle of radiusKm around [lon, lat]. */
export function circle([lon, lat], radiusKm, steps = 96) {
  const d = radiusKm / R, la = rad(lat), lo = rad(lon), ring = [];
  for (let i = 0; i <= steps; i++) {
    const b = 2 * Math.PI * i / steps;
    const lat2 = Math.asin(Math.sin(la) * Math.cos(d) + Math.cos(la) * Math.sin(d) * Math.cos(b));
    const lon2 = lo + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(la), Math.cos(d) - Math.sin(la) * Math.sin(lat2));
    ring.push([lon2 * 180 / Math.PI, lat2 * 180 / Math.PI]);
  }
  return ring;
}

// ---- Animation ----
export const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
export const ease = t => 1 - Math.pow(1 - t, 4);

/** Counts an element's text up to `to`. */
export function countUp(el, to, { duration = 1400, digits = 0, format } = {}) {
  const fmt = format || (v => num(v, digits));
  if (reduceMotion()) { el.textContent = fmt(to); return; }
  const start = performance.now();
  const step = now => {
    const t = Math.min(1, (now - start) / duration);
    el.textContent = fmt(to * ease(t));
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/** Reveals `.reveal` children as they scroll into view, and runs any counters inside them. */
export function reveal(root) {
  const io = new IntersectionObserver(entries => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      e.target.classList.add('in');
      for (const el of $$('[data-count]', e.target)) {
        if (el.dataset.done) continue;
        el.dataset.done = 1;
        countUp(el, +el.dataset.count, { digits: +(el.dataset.digits || 0), format: el.dataset.compact ? compact : undefined });
      }
      io.unobserve(e.target);
    }
  }, { threshold: 0.12 });
  $$('.reveal', root).forEach((el, i) => { el.style.setProperty('--d', `${Math.min(i, 8) * 60}ms`); io.observe(el); });
}

export const haptic = (ms = 12) => { try { navigator.vibrate?.(ms); } catch { /* unsupported */ } };

export const store = {
  get(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage off */ } },
};

// USGS writes places in English ("12 km WSW of Pitaloza Arriba, Panama").
const DIRS = { N: 'N', S: 'S', E: 'E', W: 'O' };
const COUNTRIES = { Panama: 'Panamá', Mexico: 'México', Peru: 'Perú', Japan: 'Japón', 'Costa Rica': 'Costa Rica', Colombia: 'Colombia',
  Ecuador: 'Ecuador', Chile: 'Chile', Guatemala: 'Guatemala', 'El Salvador': 'El Salvador', Nicaragua: 'Nicaragua', Honduras: 'Honduras',
  Venezuela: 'Venezuela', Argentina: 'Argentina', Bolivia: 'Bolivia', Indonesia: 'Indonesia', Philippines: 'Filipinas', Turkey: 'Turquía',
  Greece: 'Grecia', Italy: 'Italia', 'New Zealand': 'Nueva Zelanda', 'Papua New Guinea': 'Papúa Nueva Guinea', Taiwan: 'Taiwán',
  China: 'China', Iran: 'Irán', Afghanistan: 'Afganistán', Pakistan: 'Pakistán', India: 'India', Nepal: 'Nepal', Russia: 'Rusia',
  Alaska: 'Alaska', California: 'California', 'Puerto Rico': 'Puerto Rico', 'Dominican Republic': 'República Dominicana', Haiti: 'Haití',
  Tonga: 'Tonga', Fiji: 'Fiyi', Vanuatu: 'Vanuatu', 'Solomon Islands': 'Islas Salomón' };
export function placeES(place) {
  if (!place) return 'Ubicación por confirmar';
  let s = place.replace(/^(\d+) km ([NSEW]{1,3}) of /, (_, d, dir) => `A ${d} km al ${[...dir].map(c => DIRS[c]).join('')} de `);
  s = s.replace(/\b(?:region|Region)\b/, 'región').replace(/^off the coast of /i, 'Frente a la costa de ').replace(/^near the coast of /i, 'Cerca de la costa de ');
  for (const [en, es] of Object.entries(COUNTRIES)) s = s.replace(new RegExp(`\\b${en}$`), es);
  return s;
}
export const shortPlace = place => placeES(place).split(', ').pop();
