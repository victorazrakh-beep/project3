// Shell: loads the quake, keeps aftershocks live, and swaps screens over the map.
import { $, esc, num, ago, placeES, shortPlace, haptic, magColor } from './util.js';
import { detail, loadEvent, loadAftershocks, loadRecent, loadLocal, refreshLocal } from './data.js';
import { initMap, showEvent, setAftershocks, setLocal, frame, stopSequence, clearYou } from './map.js';
import * as ahora from './views/ahora.js';
import * as tu from './views/tu.js';
import * as ciudades from './views/ciudades.js';
import * as casa from './views/casa.js';
import * as ciencia from './views/ciencia.js';

const DEFAULT_EVENT = 'us6000u18k'; // M7.7 Panamá, 9 de octubre de 2026
const ROUTES = { '': ahora, tu, ciudades, casa, ciencia };
const POLL_MS = 60_000;

const ctx = { ev: null, shocks: [], local: null, current: null };
const view = $('#view');

async function start() {
  const id = new URLSearchParams(location.search).get('e') || DEFAULT_EVENT;
  // Aftershocks only need the epicenter, so they download alongside the bigger ShakeMap files.
  const shocksReady = detail(id).then(r => loadAftershocks({ id: r.id, mag: r.properties.mag, time: r.properties.time,
    lon: r.geometry.coordinates[0], lat: r.geometry.coordinates[1] })).catch(() => []);
  const localReady = loadLocal().catch(() => null);
  try {
    ctx.ev = await loadEvent(id);
  } catch {
    view.innerHTML = `<section class="card error reveal in"><h2>No pudimos cargar el sismo</h2>
      <p class="muted">Revisa tu conexión e inténtalo de nuevo. Los datos vienen directamente del USGS.</p>
      <button class="btn" onclick="location.reload()">Reintentar</button></section>`;
    return;
  }
  document.title = `M${num(ctx.ev.mag, 1)} ${shortPlace(ctx.ev.place)} · Onda`;
  renderChip();
  const [shocks, local] = await Promise.all([shocksReady, localFor(ctx.ev, () => localReady)]);
  ctx.shocks = shocks;
  ctx.local = local;
  addEventListener('hashchange', route);
  route();
  document.body.classList.add('ready');
  // Building the 3D map is the heaviest step: it waits until the intro's words have landed (so the
  // animation stays smooth), and the camera flies in as the intro splits open.
  await (window.introSettled || Promise.resolve());
  await new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));
  await initMap($('#map'));
  window.introMapReady = true;
  await (window.introDone || Promise.resolve());
  showEvent(ctx.ev, { intro: true });
  setAftershocks(ctx.shocks);
  setLocal(ctx.local?.events);
  setInterval(poll, POLL_MS);
}

function routeName() { return location.hash.replace(/^#\/?/, '').split('?')[0]; }

let first = true;
function route() {
  const name = ROUTES[routeName()] ? routeName() : '';
  const next = ROUTES[name];
  const swap = () => {
    ctx.current?.unmount?.();
    ctx.prepScrub = null;
    stopSequence();
    clearYou();
    view.innerHTML = next.render(ctx) + footer();
    view.scrollTop = 0;
    scrollTo(0, 0);
    ctx.current = next;
    next.mount?.(view, ctx);
    document.querySelectorAll('.tabs a').forEach(a => a.toggleAttribute('aria-current', a.dataset.route === name));
    document.body.dataset.route = name || 'ahora';
    if (!first && name !== 'tu') frame(name === 'ciudades' ? 'cities' : 'event');
    first = false;
  };
  if (document.startViewTransition && !first) document.startViewTransition(swap); else swap();
}

/** The local network only covers Panamá, so it's used only for quakes there. */
async function localFor(ev, load) {
  if (!ev.inPanama) return null;
  const data = await load().catch(() => null);
  if (!data) return null;
  // Leave out the main shock itself (the local network rates it with its own magnitude).
  const isMain = e => Math.abs(e.time - ev.time) < 180_000 && e.mag >= ev.mag - 1.2;
  return { updated: data.updated, events: data.events.filter(e => e.time >= ev.time - 60_000 && !isMain(e))
    .map(e => ({ ...e, place: e.place.replace(/^Panamá a /, 'A ') })) };
}

let polls = 0;
async function poll() {
  if (document.hidden) return;
  if (ctx.ev.inPanama && ++polls % 5 === 0) { // the local list is rebuilt every ~10 minutes
    const local = await localFor(ctx.ev, refreshLocal);
    if (local) { ctx.local = local; setLocal(local.events); ctx.current?.onLocal?.(local); ctx.prepScrub?.(); }
  }
  const latest = await loadAftershocks(ctx.ev).catch(() => null);
  if (!latest) return;
  const known = new Set(ctx.shocks.map(s => s.id));
  const fresh = latest.filter(s => !known.has(s.id));
  ctx.shocks = latest;
  setAftershocks(latest, { fresh });
  ctx.current?.onShocks?.(latest, fresh);
  ctx.prepScrub?.();
  if (fresh.length) {
    const big = fresh.reduce((a, b) => (b.mag > a.mag ? b : a));
    toast(`<span class="mag-dot" style="--c:${magColor(big.mag)}">${num(big.mag, 1)}</span>
      <span><b>Nueva réplica</b><small>${esc(placeES(big.place))}</small></span>`);
    haptic(30);
  }
}

export function toast(html) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = html;
  $('#toasts').append(el);
  setTimeout(() => el.classList.add('out'), 4200);
  setTimeout(() => el.remove(), 4800);
}

function renderChip() {
  const ev = ctx.ev;
  $('#event-chip').innerHTML = `<span class="mag-dot" style="--c:${magColor(ev.mag)}">${num(ev.mag, 1)}</span>
    <span class="chip-text"><b>${esc(shortPlace(ev.place))}</b><small>${esc(ago(ev.time))}</small></span>
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;
}

function footer() {
  const ev = ctx.ev;
  return `<footer class="foot">
    ${ev.inPanama ? `<p class="sos">¿Emergencia? Llama al <b>911</b> <a href="tel:911">llamar</a> · SINAPROC es la autoridad oficial.</p>`
      : `<p class="sos">¿Emergencia? Llama al número de emergencias de tu país.</p>`}
    <p>Datos en vivo del <a href="${esc(ev.url)}" target="_blank" rel="noopener">USGS</a>. Onda no es una fuente oficial: las intensidades son estimaciones.</p>
    <p class="credit">Hecho por <b>vahprojects</b></p>
  </footer>`;
}

// ---- Event picker ----
const sheet = $('#picker');
$('#event-chip').addEventListener('click', async () => {
  sheet.hidden = false;
  requestAnimationFrame(() => sheet.classList.add('open'));
  const list = $('#picker-list');
  list.innerHTML = '<p class="muted pad">Buscando sismos recientes…</p>';
  const recent = await loadRecent().catch(() => []);
  if (ctx.ev && !recent.some(r => r.id === ctx.ev.id)) recent.unshift({ id: ctx.ev.id, mag: ctx.ev.mag, place: ctx.ev.place, time: ctx.ev.time });
  list.innerHTML = recent.length ? recent.map(r => `
    <a class="pick ${r.id === ctx.ev?.id ? 'on' : ''}" href="?e=${encodeURIComponent(r.id)}">
      <span class="mag-dot" style="--c:${magColor(r.mag)}">${num(r.mag, 1)}</span>
      <span class="grow"><b>${esc(placeES(r.place))}</b><small>${esc(ago(r.time))}</small></span>
    </a>`).join('') : '<p class="muted pad">No pudimos cargar la lista. Inténtalo de nuevo.</p>';
});
const closeSheet = () => { sheet.classList.remove('open'); setTimeout(() => { sheet.hidden = true; }, 300); };
sheet.addEventListener('click', e => { if (e.target === sheet || e.target.closest('[data-close]')) closeSheet(); });
addEventListener('keydown', e => { if (e.key === 'Escape' && !sheet.hidden) closeSheet(); });

// Fade the top bar's backdrop in once the page scrolls under it (phones).
addEventListener('scroll', () => document.body.classList.toggle('scrolled', scrollY > 40), { passive: true });
view.addEventListener('scroll', () => document.body.classList.toggle('scrolled', view.scrollTop > 40), { passive: true });

start();
