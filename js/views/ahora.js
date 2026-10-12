// "Ahora": the quake told as a story. Each chapter moves the map as you scroll to it:
// the fault breaking in 3D, aftershocks scrubbed through time with your scroll, how hard each town
// shook, the real seismogram as sound, what comes next, and what to do (with phone numbers).
import { $, $$, esc, num, int, ago, dateTime, placeES, magColor, mmiColor, mmiInfo, reveal, shortTime, km, compact, reduceMotion, haptic, countUp } from '../util.js';
import { loadFault, loadHistory, inPanama } from '../data.js';
import { playSequence, stopSequence, focusPoint, scene, endStory, setFault, playRupture, shockTime, setInteractive, wavesAt, jolt } from '../map.js';
import { BCIP, loadSeismogram } from '../seismo.js';

const ALERTS = {
  green: ['Impacto bajo', 'Se esperan pocos o ningún daño.'],
  yellow: ['Impacto local', 'Puede haber daños en algunos lugares.'],
  orange: ['Impacto importante', 'Es probable que haya daños en una zona amplia.'],
  red: ['Impacto extenso', 'El USGS estima daños graves y extendidos.'],
};
const GROUND = { green: 'verde', yellow: 'amarilla', orange: 'naranja', red: 'roja' };
const PERIODS = { '1 Day': 'el próximo día', '1 Week': 'la próxima semana', '1 Month': 'el próximo mes', '1 Year': 'el próximo año' };
const SPEED = 100; // the seismogram plays 100× faster, so the slow ground motion becomes audible

// Official numbers, checked against SINAPROC statements in the Panamanian press (oct. 2026).
const PHONES = [
  { n: '911', label: 'Emergencias', note: 'Heridos, atrapados, derrumbes, incendios, olor a gas', main: true },
  { n: '103', label: 'Bomberos', note: 'Benemérito Cuerpo de Bomberos' },
  { n: '104', label: 'Policía Nacional', note: 'Seguridad y orden público' },
  { n: '520-4426', label: 'SINAPROC', note: 'Protección Civil · reportar daños' },
  { n: '6998-4809', label: 'SINAPROC (celular)', note: 'Línea de emergencias de Protección Civil' },
];

let timers = [], cleanup = [];

export function render({ ev, shocks, local }) {
  const strong = ev.exposure ? ev.exposure.aggregated_exposure.slice(5).reduce((a, b) => a + b, 0) : null;
  const alert = ALERTS[ev.alert];
  const panama = ev.inPanama;
  return `
  <section class="story-hero reveal" data-scene="hero">
    <p class="kicker"><span class="pulse-dot"></span> ${esc(dateTime(ev.time))}</p>
    <h1 class="story-title"><span class="st-mag" style="--c:${magColor(ev.mag)}"><small>M</small><span data-count="${ev.mag}" data-digits="1">0</span></span>
      <span class="st-words">${panama ? 'Tembló<br>Panamá' : 'Tembló<br>fuerte'}<i>.</i></span></h1>
    <p class="story-lead"><b>${esc(placeES(ev.place))}.</b> ${panama ? 'El sismo más fuerte medido en el país.' : ''} ${int(ev.depth)} km bajo tierra.</p>
    <div class="chips">
      ${alert ? `<span class="chip alert-${ev.alert}" title="${esc(alert[1])}">${alert[0]}</span>` : ''}
      ${ev.tsunami ? '<span class="chip warn">Revisa avisos de tsunami</span>' : ''}
      ${ev.groundFailure?.landslide ? `<span class="chip alert-${ev.groundFailure.landslide}" title="Estimación del USGS">Deslizamientos: alerta ${GROUND[ev.groundFailure.landslide] || ''}</span>` : ''}
      ${ev.groundFailure?.liquefaction ? `<span class="chip alert-${ev.groundFailure.liquefaction}" title="Estimación del USGS">Licuefacción: alerta ${GROUND[ev.groundFailure.liquefaction] || ''}</span>` : ''}
    </div>
    <div class="hero-actions">
      <button class="btn primary" id="play"><svg viewBox="0 0 24 24" width="18" height="18"><path d="M8 5v14l11-7z" fill="currentColor"/></svg><span>Ver la secuencia</span></button>
      <a class="btn ghost" href="#/tu">¿Cuánto temblaste tú? <svg viewBox="0 0 24 24" width="16" height="16"><path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg></a>
    </div>
    <div class="ticker" id="ticker">${tickerHTML(ev, shocks, local)}</div>
    <div class="maker">
      <span class="maker-logo" aria-hidden="true"><svg viewBox="0 0 32 32" width="20" height="20"><path d="M3 17h5l3-9 4 17 4-13 3 5h7" fill="none" stroke="#0b0f17" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
      <span><b>Hecho por vahprojects</b><small>Aprende a hacer apps con IA como esta</small></span>
    </div>
    <div class="scroll-cue" aria-hidden="true"><span></span>Desliza</div>
  </section>

  <section class="stats reveal">
    <div class="stat"><span class="stat-n" data-count="${local?.events.length || shocks.length}" id="stat-count">0</span><small>réplicas${local ? ' (red de Panamá)' : ' M2.5+'}</small></div>
    ${strong != null ? `<div class="stat"><span class="stat-n" data-count="${strong}" data-compact="1">0</span><small>personas con sacudida fuerte o más</small></div>` : ''}
    ${ev.felt ? `<div class="stat"><span class="stat-n" data-count="${ev.felt}">0</span><small>reportes de "lo sentí"</small></div>` : ''}
    <div class="stat"><span class="stat-n" data-count="${ev.depth}">0</span><small>km de profundidad</small></div>
  </section>

  ${ev.faultUrl ? `
  <div class="gap" aria-hidden="true"></div>
  <section class="chapter reveal" data-scene="fault" id="ch-fault">
    <p class="chap-num"><b>01</b> Bajo el mar</p>
    <h2 class="chap-title" id="fault-title">Se rompió la falla</h2>
    <p class="chap-text" id="fault-text">Cargando el modelo de la ruptura del USGS…</p>
    <div class="big-stats" id="fault-stats"></div>
    <div class="rupture">
      <canvas id="rate" aria-label="Energía liberada segundo a segundo"></canvas>
      <div class="row-between"><small class="muted" id="rate-label">Energía liberada, segundo a segundo</small>
        <button class="link" id="replay">Repetir la ruptura ↻</button></div>
    </div>
    <div class="slip-legend"><span>0 m</span><i></i><span id="slip-max">8 m</span></div>
    <p class="muted small">Cada bloque del mapa es un pedazo de la falla: más alto y más claro, más se deslizó. Modelo de falla finita del USGS.</p>
  </section>` : ''}

  <div class="gap" aria-hidden="true"></div>
  <section class="scrub" data-scene="shocks" id="ch-shocks">
    <div class="chapter sticky">
      <p class="chap-num"><b>02</b> Réplicas</p>
      <div class="scrub-count"><span id="scrub-n">0</span><small id="scrub-of">réplicas</small></div>
      <p class="scrub-when" id="scrub-when">El momento del sismo</p>
      <div class="scrub-bar"><span id="scrub-fill"></span><div id="scrub-days"></div></div>
      <p class="muted small scrub-hint">Sigue deslizando: recorres el tiempo desde el sismo hasta ahora.</p>
    </div>
  </section>
  ${local ? `<section class="card reveal" id="local-card">${localHTML(local)}</section>` : ''}
  <section class="card reveal">
    <div class="row-between"><h2>Últimas réplicas del USGS</h2><span class="live"><span class="pulse-dot"></span> En vivo</span></div>
    <div class="quake-list" id="quake-list">${listHTML(shocks)}</div>
  </section>

  ${shakingHTML(ev)}

  ${panama ? `
  <div class="gap" aria-hidden="true"></div>
  <section class="chapter reveal" data-scene="listen" id="ch-listen">
    <p class="chap-num"><b>04</b> Escúchalo</p>
    <h2 class="chap-title">El sonido del ${num(ev.mag, 1)}</h2>
    <p class="chap-text" id="listen-text">Así lo grabó el sismómetro de Isla Barro Colorado, en medio del Canal, a ${int(km(ev.lat, ev.lon, BCIP.lat, BCIP.lon))} km del epicentro.</p>
    <div class="sound">
      <canvas id="wave"></canvas>
      <span class="sound-head" id="sound-head"></span>
      <span class="sound-time" id="sound-time">0 s</span>
    </div>
    <button class="btn primary wide sound-btn" id="listen"><svg viewBox="0 0 24 24" width="20" height="20"><path d="M4 9v6h4l5 4V5L8 9zM16 8a5 5 0 0 1 0 8M18.5 5.5a8.5 8.5 0 0 1 0 13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg><span>Escuchar el sismo</span></button>
    <p class="muted small">Acelerado ${SPEED} veces para que el oído lo capte. Sube el volumen o usa audífonos${'vibrate' in navigator ? '; el teléfono vibra con la sacudida' : ''}.</p>
  </section>` : ''}

  ${forecastHTML(ev)}

  <div class="gap short" aria-hidden="true"></div>
  <section class="chapter reveal" data-scene="calm">
    <p class="chap-num"><b>!</b> Si vuelve a temblar</p>
    <div class="howtos">
      ${step(1, 'Agáchate', 'antes de que el movimiento te tumbe', 'drop')}
      ${step(2, 'Cúbrete', 'la cabeza y el cuello, bajo una mesa firme', 'cover')}
      ${step(3, 'Sujétate', 'hasta que pare. No corras ni uses el ascensor', 'hold')}
    </div>
    <p class="coast"><b>¿Estás en la costa?</b> Si el movimiento fue fuerte o duró 20 segundos o más, al terminar camina a un lugar alto o tierra adentro. No esperes un aviso: el sismo es el aviso.</p>
    <a class="cta" href="#/casa"><span><b>Revisa tu casa</b><small>Lista paso a paso: qué es peligroso y qué puede esperar</small></span>
      <svg viewBox="0 0 24 24" width="22" height="22"><path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg></a>
  </section>

  ${panama ? `
  <section class="chapter reveal phones" data-scene="calm">
    <p class="chap-num"><b>☎</b> Teléfonos</p>
    <div class="phone-grid">${PHONES.map(p => `
      <a class="phone ${p.main ? 'main' : ''}" href="tel:${p.n.replace(/\D/g, '')}">
        <span class="ph-label"><b>${esc(p.label)}</b><small>${esc(p.note)}</small></span>
        <span class="ph-n">${esc(p.n)}</span>
      </a>`).join('')}</div>
    <p class="muted small">SINAPROC también recibe reportes en su app gratuita <b>Sinaproc Alerta</b> (Android y iPhone).</p>
  </section>

  <section class="chapter reveal rumor" data-scene="calm">
    <p class="chap-num"><b>?</b> Cuidado con los rumores</p>
    <h2 class="chap-title">Nadie puede predecir un terremoto.</h2>
    <p class="chap-text">Si te llega un mensaje que anuncia un sismo para una hora o un día, es falso. Los pronósticos hablan de probabilidades, nunca de fechas. Compártelo solo si viene de SINAPROC o del Instituto de Geociencias.</p>
  </section>` : ''}

  <section class="chapter reveal" data-scene="calm">
    <p class="chap-num"><b>↗</b> Información oficial</p>
    <div class="links">
      ${panama ? `<a href="https://www.sinaproc.gob.pa/" target="_blank" rel="noopener"><b>SINAPROC</b><small>Protección Civil: avisos oficiales</small></a>
      <a href="https://sismosgeociencias.up.ac.pa/" target="_blank" rel="noopener"><b>Instituto de Geociencias (UP)</b><small>Sismos registrados en Panamá</small></a>` : ''}
      <a href="${esc(ev.url)}" target="_blank" rel="noopener"><b>USGS</b><small>Datos del sismo y pronóstico de réplicas</small></a>
      <a href="${esc(ev.url)}/tellus" target="_blank" rel="noopener"><b>¿Lo sentiste?</b><small>Cuéntale al USGS cómo lo viviste</small></a>
    </div>
  </section>

  <section class="maker-big reveal">
    <span class="maker-logo" aria-hidden="true"><svg viewBox="0 0 32 32" width="30" height="30"><path d="M3 17h5l3-9 4 17 4-13 3 5h7" fill="none" stroke="#0b0f17" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
    <p>Hecho por</p><h2>vahprojects</h2>
    <p class="muted">Aprende a hacer apps con IA como esta.</p>
  </section>`;
}

function tickerHTML(ev, shocks, local) {
  const list = local?.events?.length ? local.events : shocks;
  const last = list.reduce((a, b) => (!a || b.time > a.time ? b : a), null);
  return `<span class="pulse-dot"></span><b id="clock">${clock(Date.now() - ev.time)}</b>
    <span class="sep">·</span><b>${int(list.length)}</b> réplicas
    ${last ? `<span class="sep">·</span>última <b style="color:${magColor(last.mag)}">${num(last.mag, 1)}</b> ${esc(ago(last.time))}` : ''}`;
}
const clock = ms => {
  const s = Math.floor(ms / 1000), d = Math.floor(s / 86400);
  const hh = String(Math.floor(s / 3600) % 24).padStart(2, '0'), mm = String(Math.floor(s / 60) % 60).padStart(2, '0'), ss = String(s % 60).padStart(2, '0');
  return `${d ? `${d} d ` : ''}${hh}:${mm}:${ss}`;
};

function step(n, title, text, kind) {
  return `<div class="howto howto-${kind}">
    <svg viewBox="0 0 120 90" aria-hidden="true">${PICTOS[kind]}</svg>
    <div><span class="howto-n">0${n}</span><b>${title}</b><small>${text}</small></div>
  </div>`;
}
// Little animated figures (CSS moves the groups).
const TABLE = '<g class="table"><rect x="22" y="38" width="76" height="7" rx="2"/><path d="M28 45v32M92 45v32"/></g>';
const PICTOS = {
  drop: '<path class="floor" d="M8 82h104"/><g class="fig"><circle cx="60" cy="18" r="7"/><path d="M60 26v22M60 34l-12 9M60 34l12 9M60 48l-9 16 6 14M60 48l9 16-6 14"/></g>',
  cover: `<path class="floor" d="M8 82h104"/>${TABLE}<g class="fig low"><circle cx="54" cy="60" r="6"/><path d="M58 64l14 8M49 66c-5 4-6 10-3 14h20M50 56c4-5 12-5 15 1"/></g>`,
  hold: `<path class="floor" d="M8 82h104"/>${TABLE}<g class="fig low"><circle cx="58" cy="60" r="6"/><path d="M62 64l14 8M53 66c-5 4-6 10-3 14h20M64 58l22-6"/><circle class="grip" cx="88" cy="52" r="4"/></g>`,
};

function shakingHTML(ev) {
  const towns = (ev.cities || []).filter(c => !ev.inPanama || inPanama(c.lat, c.lon));
  if (!towns.length) return '';
  const top = towns[0];
  const capital = ev.inPanama ? towns.find(c => /^Panam[aá]( City)?$/i.test(c.name) || /Ciudad de Panam/i.test(c.name)) : null;
  const levels = ev.exposure ? ev.exposure.aggregated_exposure.map((people, m) => ({ m, people })).filter(l => l.m >= 4 && l.people > 0) : [];
  const most = Math.max(1, ...levels.map(l => l.people));
  const sorted = [...towns].sort((a, b) => a.name.localeCompare(b.name, 'es'));
  return `
  <div class="gap" aria-hidden="true"></div>
  <section class="chapter reveal" data-scene="shaking" id="ch-shaking">
    <p class="chap-num"><b>03</b> Cuánto tembló</p>
    <h2 class="chap-title">En ${esc(top.name)} fue <em style="color:${mmiColor(top.mmi)}">${esc(mmiInfo(top.mmi).name.toLowerCase())}</em>.${capital ? ` En la capital, <em style="color:${mmiColor(capital.mmi)}">${esc(mmiInfo(capital.mmi).name.toLowerCase())}</em>.` : ''}</h2>
    ${levels.length ? `<div class="ladder">${levels.reverse().map(l => `
      <div class="rung" style="--c:${mmiColor(l.m)}">
        <span class="rung-n">${l.m}</span><span class="rung-name">${esc(mmiInfo(l.m).name)}</span>
        <span class="rung-bar"><span style="--w:${Math.max(2, l.people / most * 100)}%"></span></span>
        <b>${compact(l.people)}</b>
      </div>`).join('')}</div>
    <p class="muted small">Personas por nivel de intensidad (1 a 10), según el USGS.</p>` : ''}
    <label class="town">
      <span>¿Y en tu pueblo?</span>
      <select id="town"><option value="">Elige tu pueblo o ciudad…</option>${sorted.map(c => `<option value="${towns.indexOf(c)}">${esc(c.name)}</option>`).join('')}</select>
    </label>
    <div class="town-out" id="town-out" hidden></div>
  </section>`;
}

function forecastHTML(ev) {
  const week = ev.forecast?.find(f => f.label === '1 Week') || ev.forecast?.[0];
  const bins = week ? week.bins.filter(b => b.magnitude >= 5).slice(0, 3) : [];
  return `
  <div class="gap" aria-hidden="true"></div>
  <section class="chapter reveal" data-scene="forecast" id="ch-forecast">
    <p class="chap-num"><b>05</b> ¿Qué viene?</p>
    ${bins.length ? `
    <h2 class="chap-title">En ${PERIODS[week.label] || 'los próximos días'}, la tierra seguirá moviéndose.</h2>
    <div class="dials">${bins.map(b => {
      const p = Math.round(b.probability * 100);
      return `<div class="dial" style="--p:${Math.max(p, 1)};--c:${magColor(b.magnitude)}">
        <svg viewBox="0 0 80 80"><circle class="dial-bg" cx="40" cy="40" r="34"/><circle class="dial-fg" cx="40" cy="40" r="34" pathLength="100"/></svg>
        <b>${p < 1 ? '<1' : `<span data-count="${p}">0</span>`}%</b><small>M${b.magnitude}+</small>
      </div>`;
    }).join('')}</div>
    <p class="muted small">Probabilidad de al menos una réplica de esa magnitud, según el pronóstico del USGS. Las réplicas fuertes pueden tumbar lo que ya quedó dañado.</p>` : '<h2 class="chap-title">Las réplicas seguirán por semanas.</h2>'}
    <h3 class="mt">No es la primera vez</h3>
    <div class="hist" id="hist"><p class="muted small">Buscando sismos fuertes del pasado cerca de aquí…</p></div>
  </section>`;
}

export function mount(el, ctx) {
  const { ev } = ctx;
  timers.forEach(clearInterval); timers = []; cleanup.forEach(f => f()); cleanup = [];
  // Wait for the intro to clear before animating anything.
  (window.introDone || Promise.resolve()).then(() => reveal(el));
  if (innerWidth < 900) setInteractive(false);

  // Live clock.
  timers.push(setInterval(() => { const c = $('#clock', el); if (c) c.textContent = clock(Date.now() - ev.time); }, 1000));

  // ---- Sequence button ----
  const btn = $('#play', el);
  let running = false;
  btn.addEventListener('click', async () => {
    if (running) { stopSequence(); return; }
    if (!ctx.shocks.length) return;
    running = true;
    btn.classList.add('on');
    btn.lastElementChild.textContent = 'Detener';
    await playSequence((t, shown) => { btn.lastElementChild.textContent = `${shortTime(t)} · ${int(shown)}`; });
    running = false;
    btn.classList.remove('on');
    btn.lastElementChild.textContent = 'Ver la secuencia';
  });
  el.addEventListener('click', e => {
    const q = e.target.closest('.quake');
    if (q) focusPoint(+q.dataset.lon, +q.dataset.lat, 8.5);
  });

  // ---- 01 The fault ----
  let fault = null;
  const faultReady = ev.faultUrl ? loadFault(ev).then(f => { fault = f; if (f) faultCopy(el, f); return f; }).catch(() => null) : Promise.resolve(null);
  const runRupture = () => {
    if (!fault) return;
    setFault(fault.geojson);
    const label = $('#rate-label', el);
    playRupture(fault.end, (T, k) => {
      drawRate($('#rate', el), fault, k);
      if (label) label.textContent = k < 1 ? `Segundo ${int(T)} de la ruptura` : 'Energía liberada, segundo a segundo';
    });
  };
  $('#replay', el)?.addEventListener('click', runRupture);

  // ---- 02 Aftershocks through time ----
  const scrub = $('#ch-shocks', el);
  const pool = () => (ctx.local?.events?.length ? ctx.local.events : ctx.shocks);
  let times = [], lastN = -1;
  const prep = () => { times = pool().map(s => s.time).sort((a, b) => a - b); lastN = -1; };
  prep();
  drawDays($('#scrub-days', el), ev.time);
  function setScrub(p) {
    const now = Date.now(), T = ev.time + (now - ev.time) * p * p; // early hours get more of the scroll, like the aftershocks
    let lo = 0, hi = times.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (times[mid] <= T) lo = mid + 1; else hi = mid; }
    $('#scrub-fill', el).style.width = `${p * 100}%`;
    const h = (T - ev.time) / 36e5;
    $('#scrub-when', el).textContent = p <= 0.001 ? 'El momento del sismo' : p >= 0.999 ? 'Ahora mismo'
      : h < 1 ? `${int(h * 60)} minutos después` : h < 48 ? `${num(h, h < 10 ? 1 : 0)} horas después` : `${num(h / 24, 1)} días después`;
    if (lo !== lastN) {
      lastN = lo;
      $('#scrub-n', el).textContent = int(lo);
      shockTime(T);
    }
  }
  $('#scrub-of', el).textContent = ctx.local?.events?.length ? 'réplicas · red de Panamá' : 'réplicas M2.5+ · USGS';

  // ---- 03 Towns ----
  const towns = (ev.cities || []).filter(c => !ev.inPanama || inPanama(c.lat, c.lon));
  $('#town', el)?.addEventListener('change', e => {
    const c = towns[+e.target.value], out = $('#town-out', el);
    if (!c) { out.hidden = true; return; }
    out.hidden = false;
    out.style.setProperty('--c', mmiColor(c.mmi));
    out.innerHTML = `<span class="town-n" id="town-n">0</span><span><b>${esc(mmiInfo(c.mmi).name)}</b><small>${esc(mmiInfo(c.mmi).text)}</small>
      <small>${esc(c.name)} · a ${int(km(ev.lat, ev.lon, c.lat, c.lon))} km del epicentro · <a href="#/tu">tu punto exacto →</a></small></span>`;
    countUp($('#town-n', out), c.mmi, { digits: 1, duration: 900 });
    haptic(12);
    focusPoint(c.lon, c.lat, 8.4);
  });

  // ---- 04 Sound ----
  let trace = null, traceLoading = null;
  const getTrace = () => (traceLoading ||= loadSeismogram(BCIP, ev.time, 600).then(t => { trace = t; if (t) waveCopy(el, ev, t); return t; }).catch(() => null));
  let playing = null;
  $('#listen', el)?.addEventListener('click', async e => {
    const b = e.currentTarget;
    if (playing) { playing.stop(); return; }
    b.classList.add('busy');
    const tr = trace || await getTrace();
    b.classList.remove('busy');
    if (!tr) { b.lastElementChild.textContent = 'No se pudo cargar la grabación'; return; }
    playing = sonify(el, ev, tr, () => { playing = null; b.lastElementChild.textContent = 'Escuchar otra vez'; b.classList.remove('on'); });
    b.classList.add('on');
    b.lastElementChild.textContent = 'Detener';
  });

  // ---- 05 History ----
  let history = [];
  loadHistory(ev).then(list => {
    history = list.filter(h => h.mag >= 6).slice(0, 7);
    const box = $('#hist', el);
    if (!box) return;
    box.innerHTML = history.length ? history.map(h => `
      <div class="hist-row"><span class="mag-dot" style="--c:${magColor(h.mag)}">${num(h.mag, 1)}</span>
        <span class="grow"><b>${new Date(h.time).getUTCFullYear()}</b><small>a ${int(h.distance)} km de este sismo${h.deaths ? ` · ${int(h.deaths)} ${h.deaths === 1 ? 'muerto' : 'muertos'}` : ''}${h.tsunami ? ' · tsunami' : ''}</small></span></div>`).join('')
      : '<p class="muted small">El USGS no lista sismos fuertes cercanos en su catálogo histórico.</p>';
  }).catch(() => {});

  // ---- Scenes, driven by scroll ----
  const chapters = $$('[data-scene]', el);
  let current = null, raf = 0;
  function update() {
    raf = 0;
    const vh = innerHeight;
    let active = chapters[0];
    for (const c of chapters) if (c.getBoundingClientRect().top < vh * 0.7) active = c;
    const name = active?.dataset.scene;
    if (name && name !== current) {
      current = name;
      if (name === 'fault') faultReady.then(f => current === 'fault' && scene('fault', { center: f?.center, onArrive: runRupture }));
      else if (name === 'listen') { getTrace(); scene('listen', { station: { ...BCIP, short: 'Isla Barro Colorado' } }); }
      else if (name === 'forecast') scene('forecast', { history });
      else scene(name);
    }
    if (scrub && current === 'shocks') {
      const r = scrub.getBoundingClientRect();
      setScrub(Math.min(1, Math.max(0, (vh * 0.35 - r.top) / Math.max(1, r.height - vh * 0.75))));
    }
    // Start loading the recording a little before its chapter arrives.
    const listen = $('#ch-listen', el);
    if (listen && listen.getBoundingClientRect().top < vh * 2) getTrace();
  }
  const onScroll = () => { if (!raf) raf = requestAnimationFrame(update); };
  addEventListener('scroll', onScroll, { passive: true });
  el.addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', onScroll);
  cleanup.push(() => { removeEventListener('scroll', onScroll); el.removeEventListener('scroll', onScroll); removeEventListener('resize', onScroll); cancelAnimationFrame(raf); playing?.stop(); });
  (window.introDone || Promise.resolve()).then(() => { current = 'hero'; onScroll(); });
  ctx.prepScrub = prep;
}

function faultCopy(el, f) {
  const kmh = f.speed ? f.speed * 3600 : null;
  $('#fault-title', el).innerHTML = `Se rompió una falla de <em>${int(Math.round(f.length / 10) * 10)} km</em>`;
  $('#fault-text', el).textContent = `En unos ${int(f.duration)} segundos, la ruptura corrió bajo el mar${f.speed ? ` a ${num(f.speed, 1)} km por segundo (más de ${int(Math.floor(kmh / 1000) * 1000)} km/h)` : ''}. Donde más se movió, un lado de la falla se desplazó ${num(f.maxSlip, 1)} metros respecto al otro.`;
  $('#fault-stats', el).innerHTML = `
    <div><b data-count="${Math.round(f.duration)}">0</b><small>segundos de ruptura</small></div>
    <div><b data-count="${f.maxSlip}" data-digits="1">0</b><small>metros de deslizamiento máximo</small></div>
    <div><b data-count="${f.depth}" data-digits="1">0</b><small>km de profundidad donde empezó</small></div>`;
  $$('[data-count]', $('#fault-stats', el)).forEach(n => countUp(n, +n.dataset.count, { digits: +(n.dataset.digits || 0) }));
  $('#slip-max', el).textContent = `${num(f.maxSlip, 1)} m`;
  drawRate($('#rate', el), f, 1);
}

/** The moment-rate curve: how much energy the fault released each moment. */
function drawRate(canvas, f, k) {
  if (!canvas) return;
  const dpr = Math.min(2, devicePixelRatio || 1), w = canvas.clientWidth, h = canvas.clientHeight;
  if (!w) return;
  if (canvas.width !== Math.round(w * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
  const c = canvas.getContext('2d');
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, w, h);
  const n = f.rate.length, bw = w / n;
  const g = c.createLinearGradient(0, h, 0, 0);
  g.addColorStop(0, '#5b1f7a'); g.addColorStop(0.5, '#ec5a3c'); g.addColorStop(1, '#fff3c4');
  f.rate.forEach((v, i) => {
    c.fillStyle = i / n <= k ? g : 'rgba(255,255,255,.08)';
    const bh = Math.max(2, v * (h - 6));
    c.fillRect(i * bw + 1, h - bh, bw - 2, bh);
  });
  if (k < 1) { c.fillStyle = '#fff'; c.fillRect(k * w - 1, 0, 2, h); }
}

function drawDays(box, t0) {
  if (!box) return;
  const days = Math.max(1, (Date.now() - t0) / 864e5);
  // Ticks sit where each day falls on the (squared) scroll scale.
  box.innerHTML = Array.from({ length: Math.min(30, Math.floor(days)) }, (_, i) => `<i style="left:${Math.sqrt((i + 1) / days) * 100}%"></i>`).join('');
}

function waveCopy(el, ev, tr) {
  const s = tr.samples, rate = tr.rate;
  let mean = 0; for (let i = 0; i < s.length; i++) mean += s[i]; mean /= s.length;
  let peak = 0, at = 0;
  for (let i = 0; i < s.length; i++) { const v = Math.abs(s[i] - mean); if (v > peak) { peak = v; at = i; } }
  const dist = km(ev.lat, ev.lon, BCIP.lat, BCIP.lon);
  const pT = Math.hypot(dist, ev.depth || 10) / 6.5;
  const offset = (tr.start - ev.time) / 1000;
  const text = $('#listen-text', el);
  if (text) text.textContent = `Así lo grabó el sismómetro de Isla Barro Colorado, en medio del Canal, a ${int(dist)} km del epicentro. La primera onda llegó a los ${int(pT)} segundos; la sacudida más fuerte, a los ${int(at / rate + offset)}.`;
  drawWave($('#wave', el), tr, -1);
}

function drawWave(canvas, tr, head) {
  if (!canvas) return;
  const dpr = Math.min(2, devicePixelRatio || 1), w = canvas.clientWidth, h = canvas.clientHeight;
  if (!w) return;
  if (canvas.width !== Math.round(w * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
  const c = canvas.getContext('2d');
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, w, h);
  const cols = Math.floor(w);
  if (!tr._env || tr._env.length !== cols) {
    const s = tr.samples, per = s.length / cols;
    let mean = 0; for (let i = 0; i < s.length; i++) mean += s[i]; mean /= s.length;
    let peak = 0; const env = [];
    for (let x = 0; x < cols; x++) {
      let lo = Infinity, hi = -Infinity;
      for (let i = Math.floor(x * per); i < Math.floor((x + 1) * per); i++) { const v = s[i] - mean; if (v < lo) lo = v; if (v > hi) hi = v; }
      env.push([lo, hi]); peak = Math.max(peak, -lo, hi);
    }
    tr._env = env.map(([lo, hi]) => [lo / peak, hi / peak]);
  }
  const mid = h / 2;
  tr._env.forEach(([lo, hi], x) => {
    const played = head >= 0 && x / cols <= head;
    c.fillStyle = played ? (Math.max(-lo, hi) > 0.45 ? '#ff4d3d' : '#ffb547') : 'rgba(127,212,255,.55)';
    c.fillRect(x, mid - hi * (mid - 4), 1, Math.max(1, (hi - lo) * (mid - 4)));
  });
}

/** Plays the seismogram as sound, shaking the map and the phone in step with it. */
function sonify(el, ev, tr, done) {
  const AC = window.AudioContext || window.webkitAudioContext;
  const ac = new AC(), sr = ac.sampleRate;
  const s = tr.samples, rate = tr.rate;
  // Remove the slow drift (10 s running mean), then normalise and soften the peaks so the quiet part is audible.
  const win = Math.round(rate * 10), clean = new Float32Array(s.length);
  let acc = 0;
  for (let i = 0; i < s.length; i++) { acc += s[i]; if (i >= win) acc -= s[i - win]; clean[i] = s[i] - acc / Math.min(i + 1, win); }
  let peak = 0; for (const v of clean) peak = Math.max(peak, Math.abs(v));
  const seconds = s.length / rate / SPEED, n = Math.floor(seconds * sr);
  const buf = ac.createBuffer(1, n, sr), out = buf.getChannelData(0);
  for (let i = 0; i < n; i++) {
    const pos = i / sr * SPEED * rate, j = Math.floor(pos), f = pos - j;
    const v = ((clean[j] || 0) * (1 - f) + (clean[j + 1] || 0) * f) / peak;
    out[i] = Math.tanh(v * 3) / Math.tanh(3) * Math.min(1, i / 400, (n - i) / 400);
  }
  const src = ac.createBufferSource();
  src.buffer = buf;
  const gain = ac.createGain(); gain.gain.value = 0.95;
  src.connect(gain).connect(ac.destination);
  src.start();
  const t0 = ac.currentTime, offset = (tr.start - ev.time) / 1000;
  const head = $('#sound-head', el), time = $('#sound-time', el), canvas = $('#wave', el), card = $('#ch-listen', el);
  let raf = 0, lastBuzz = 0, stopped = false;
  const frame = () => {
    const k = Math.min(1, (ac.currentTime - t0) / seconds);
    const real = k * s.length / rate + offset;
    head.style.left = `${k * 100}%`;
    time.textContent = `${int(real)} s`;
    drawWave(canvas, tr, k);
    wavesAt(real);
    const env = tr._env, e = env?.[Math.min(env.length - 1, Math.floor(k * env.length))];
    const a = e ? Math.max(-e[0], e[1]) : 0;
    if (!reduceMotion() && a > 0.12) {
      card.style.transform = `translate(${(Math.random() * 2 - 1) * a * 7}px, ${(Math.random() * 2 - 1) * a * 5}px)`;
      if (a > 0.3) jolt(a * 9);
      const now = performance.now();
      if (a > 0.35 && now - lastBuzz > 140) { lastBuzz = now; haptic(Math.round(30 + a * 60)); }
    } else card.style.transform = '';
    if (k < 1 && !stopped) raf = requestAnimationFrame(frame); else finish();
  };
  const finish = () => {
    if (stopped) return;
    stopped = true;
    cancelAnimationFrame(raf);
    try { src.stop(); } catch { /* already ended */ }
    ac.close?.();
    card.style.transform = '';
    wavesAt(-1);
    done();
  };
  raf = requestAnimationFrame(frame);
  return { stop: finish };
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

function localHTML(local) {
  const events = local.events, day = Date.now() - 864e5;
  const lastDay = events.filter(e => e.time >= day).length;
  const strongest = events.reduce((a, b) => (!a || b.mag > a.mag ? b : a), null);
  return `
    <div class="row-between"><h2>Red sísmica de Panamá</h2><span class="legend"><i class="ring"></i> en el mapa</span></div>
    <p class="muted small">El Instituto de Geociencias de la Universidad de Panamá registra sismos más pequeños que el USGS no publica.</p>
    <div class="mini-stats">
      <div><b data-count="${events.length}">0</b><small>réplicas registradas</small></div>
      <div><b data-count="${lastDay}">0</b><small>en las últimas 24 horas</small></div>
      ${strongest ? `<div><b>M${num(strongest.mag, 1)}</b><small>la mayor réplica</small></div>` : ''}
    </div>
    <div class="quake-list">${events.slice(0, 5).map(s => `
      <button class="quake" data-lon="${s.lon}" data-lat="${s.lat}">
        <span class="mag-dot hollow" style="--c:${magColor(s.mag)}">${num(s.mag, 1)}</span>
        <span class="grow"><b>${esc(s.place)}</b><small>${esc(shortTime(s.time))} · ${int(s.depth)} km · ${s.status === 'revisado' ? 'revisado' : 'preliminar'}</small></span>
        <small class="muted">${esc(ago(s.time))}</small>
      </button>`).join('')}</div>
    <p class="muted small">Fuente: <a href="https://sismosgeociencias.up.ac.pa/" target="_blank" rel="noopener">Instituto de Geociencias (UP)</a> · actualizado ${esc(ago(local.updated))}</p>`;
}


export function onShocks(shocks) {
  const list = document.getElementById('quake-list');
  if (list) list.innerHTML = listHTML(shocks);
}

export function onLocal(local) {
  const card = document.getElementById('local-card');
  if (card) { card.innerHTML = localHTML(local); card.querySelectorAll('[data-count]').forEach(n => { n.textContent = int(+n.dataset.count); }); }
}

export function unmount() {
  stopSequence();
  timers.forEach(clearInterval); timers = [];
  cleanup.forEach(f => f()); cleanup = [];
  endStory();
  setInteractive(true);
}
