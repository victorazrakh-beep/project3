// "Ahora": the quake at a glance, live aftershocks, and what to expect next.
import { esc, num, int, ago, dateTime, placeES, magColor, reveal, $, shortTime } from '../util.js';
import { playSequence, stopSequence, focusPoint } from '../map.js';

const ALERTS = {
  green: ['Impacto bajo', 'Se esperan pocos o ningún daño.'],
  yellow: ['Impacto local', 'Puede haber daños en algunos lugares.'],
  orange: ['Impacto importante', 'Es probable que haya daños en una zona amplia.'],
  red: ['Impacto extenso', 'El USGS estima daños graves y extendidos.'],
};
const PERIODS = { '1 Day': 'el próximo día', '1 Week': 'la próxima semana', '1 Month': 'el próximo mes', '1 Year': 'el próximo año' };

export function render({ ev, shocks }) {
  const strong = ev.exposure ? ev.exposure.aggregated_exposure.slice(5).reduce((a, b) => a + b, 0) : null;
  const biggest = shocks.reduce((a, b) => (!a || b.mag > a.mag ? b : a), null);
  const alert = ALERTS[ev.alert];
  return `
  <section class="hero reveal">
    <p class="kicker"><span class="pulse-dot"></span> Sismo ${esc(ago(ev.time))}</p>
    <div class="hero-mag">
      <span class="mag-num" style="--c:${magColor(ev.mag)}"><small>M</small><span data-count="${ev.mag}" data-digits="1">0</span></span>
      <span class="hero-place"><b>${esc(placeES(ev.place))}</b><small>${esc(dateTime(ev.time))}</small></span>
    </div>
    <div class="chips">
      <span class="chip">${int(ev.depth)} km de profundidad</span>
      ${alert ? `<span class="chip alert-${ev.alert}" title="${esc(alert[1])}">${alert[0]}</span>` : ''}
      ${ev.tsunami ? '<span class="chip warn">Revisa avisos de tsunami</span>' : ''}
    </div>
  </section>

  <section class="stats reveal">
    <div class="stat"><span class="stat-n" data-count="${shocks.length}" id="stat-count">0</span><small>réplicas M2.5+</small></div>
    <div class="stat"><span class="stat-n">${biggest ? `M${num(biggest.mag, 1)}` : '—'}</span><small>mayor réplica</small></div>
    ${strong != null ? `<div class="stat"><span class="stat-n" data-count="${strong}" data-compact="1">0</span><small>personas con sacudida fuerte o más</small></div>` : ''}
    ${ev.felt ? `<div class="stat"><span class="stat-n" data-count="${ev.felt}">0</span><small>reportes de "lo sentí"</small></div>` : ''}
  </section>

  <section class="card player reveal">
    <div class="row-between">
      <div><h2>La secuencia</h2><p class="muted small">Cada réplica desde el sismo principal, acelerada.</p></div>
      <button class="btn round" id="play" aria-label="Reproducir la secuencia">
        <svg viewBox="0 0 24 24" width="20" height="20"><path d="M8 5v14l11-7z" fill="currentColor"/></svg>
      </button>
    </div>
    <div class="track"><span id="track-fill"></span></div>
    <p class="muted small" id="play-label">${shocks.length ? `${int(shocks.length)} réplicas hasta ahora` : 'Aún no hay réplicas registradas'}</p>
  </section>

  ${forecastHTML(ev)}

  <section class="card reveal">
    <div class="row-between"><h2>Últimas réplicas</h2><span class="live"><span class="pulse-dot"></span> En vivo</span></div>
    <div class="quake-list" id="quake-list">${listHTML(shocks)}</div>
  </section>

  <a class="cta reveal" href="#/tu">
    <span><b>¿Cuánto sentiste tú?</b><small>Calcula la intensidad exacta en tu ubicación</small></span>
    <svg viewBox="0 0 24 24" width="22" height="22"><path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>
  </a>`;
}

function listHTML(shocks) {
  if (!shocks.length) return '<p class="muted">Todavía no hay réplicas de magnitud 2.5 o mayor.</p>';
  return [...shocks].sort((a, b) => b.time - a.time).slice(0, 15).map(s => `
    <button class="quake" data-lon="${s.lon}" data-lat="${s.lat}">
      <span class="mag-dot" style="--c:${magColor(s.mag)}">${num(s.mag, 1)}</span>
      <span class="grow"><b>${esc(placeES(s.place))}</b><small>${esc(shortTime(s.time))} · ${int(s.depth)} km</small></span>
      <small class="muted">${esc(ago(s.time))}</small>
    </button>`).join('');
}

function forecastHTML(ev) {
  const week = ev.forecast?.find(f => f.label === '1 Week') || ev.forecast?.[0];
  if (!week) return '';
  const bins = week.bins.filter(b => b.magnitude >= 5).slice(0, 3);
  if (!bins.length) return '';
  return `
  <section class="card reveal">
    <h2>¿Qué viene?</h2>
    <p class="muted small">Probabilidad de al menos una réplica en ${PERIODS[week.label] || 'los próximos días'}, según el pronóstico del USGS.</p>
    <div class="odds">
      ${bins.map(b => {
        const p = Math.round(b.probability * 100);
        return `<div class="odd">
          <span class="odd-label">M${b.magnitude}+</span>
          <span class="bar"><span style="--w:${Math.max(p, 2)}%;--c:${magColor(b.magnitude)}"></span></span>
          <b>${p < 1 ? '<1' : p}%</b>
        </div>`;
      }).join('')}
    </div>
    <p class="muted small">Las réplicas fuertes pueden tumbar lo que ya quedó dañado. Si tu casa tiene daños, <a href="#/casa">revísala</a> antes de entrar.</p>
  </section>`;
}

export function mount(el, ctx) {
  reveal(el);
  const btn = $('#play', el), fill = $('#track-fill', el), label = $('#play-label', el);
  let running = false;
  btn.addEventListener('click', async () => {
    if (running) { stopSequence(); return; }
    if (!ctx.shocks.length) return;
    running = true;
    btn.classList.add('on');
    el.closest('.panel')?.classList.add('peek');
    await playSequence((t, shown, p) => {
      fill.style.width = `${p * 100}%`;
      label.textContent = `${shortTime(t)} · ${int(shown)} réplicas`;
    });
    running = false;
    btn.classList.remove('on');
    el.closest('.panel')?.classList.remove('peek');
    label.textContent = `${int(ctx.shocks.length)} réplicas hasta ahora`;
  });
  el.addEventListener('click', e => {
    const q = e.target.closest('.quake');
    if (q) focusPoint(+q.dataset.lon, +q.dataset.lat, 8.5);
  });
}

export function onShocks(shocks) {
  const list = document.getElementById('quake-list');
  if (list) list.innerHTML = listHTML(shocks);
  const count = document.getElementById('stat-count');
  if (count) count.textContent = int(shocks.length);
}

export const unmount = () => stopSequence();
