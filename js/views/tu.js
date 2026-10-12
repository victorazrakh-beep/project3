// "Tú": your personal intensity, from the USGS shaking grid at your exact spot.
import { $, $$, esc, num, int, mmiInfo, mmiColor, MMI, ease, reduceMotion, haptic, store, shortPlace } from '../util.js';
import { shakingAt, searchPlaces, loadDYFI, inPanama, similarity } from '../data.js';
import { km } from '../util.js';
import { showYou, onMapClick, clearYou } from '../map.js';
import { createTower, towerFacts } from '../tower.js';
import { openShare } from '../share.js';

const PLACES = [['casa', 'Casa'], ['edificio', 'Edificio'], ['afuera', 'Afuera'], ['vehiculo', 'En un carro']];
const GROUNDS = [['nose', 'No sé'], ['roca', 'Roca o loma'], ['firme', 'Tierra firme'], ['relleno', 'Relleno o junto al agua']];

let choice, offClick, tower, sheetOff, sharedSpot;

export function render({ ev }) {
  choice = { place: 'casa', floor: 3, floors: 10, ground: 'nose', ...store.get(`onda-tu-${ev.id}`, {}) };
  const shared = new URLSearchParams(location.hash.split('?')[1] || '');
  const lat = +shared.get('lat'), lon = +shared.get('lon');
  if (shared.has('lat') && Number.isFinite(lat) && Number.isFinite(lon)) {
    sharedSpot = { lat, lon, name: shared.get('n') || null };
    Object.assign(choice, { place: shared.get('p') || 'casa', ground: shared.get('g') || 'nose' });
    if (shared.has('f')) choice.floor = Math.max(1, Math.min(80, +shared.get('f') || 1));
    if (shared.has('F')) choice.floors = Math.min(80, +shared.get('F') || choice.floor);
  }
  choice.floors = Math.max(choice.floors, choice.floor);
  return `
  <section class="hero reveal">
    <p class="kicker">Tu intensidad</p>
    <h1 class="title">Lo que sentiste tú</h1>
    <p class="lead">El mismo sismo se siente distinto en cada calle. Calculamos tu sacudida con el mapa de intensidad del USGS en tu punto exacto, y la ajustamos según dónde estabas.</p>
  </section>

  <section class="card reveal">
    <h2><span class="step">1</span> ¿Dónde estabas?</h2>
    <button class="btn primary wide" id="locate">
      <svg viewBox="0 0 24 24" width="18" height="18"><circle cx="12" cy="12" r="3.2" fill="currentColor"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" stroke-width="2"/></svg>
      Usar mi ubicación
    </button>
    <div class="search-wrap" role="combobox" aria-expanded="false" aria-haspopup="listbox">
      <svg class="search-icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M16 16l4.5 4.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
      <input id="city" class="input search" type="search" placeholder="Busca tu barrio, calle o pueblo en Panamá" autocomplete="off" enterkeyhint="search"
        aria-label="Buscar un lugar" aria-autocomplete="list" aria-controls="suggest">
      <span class="search-spin" id="search-spin" hidden></span>
      <div class="suggest" id="suggest" role="listbox" hidden></div>
    </div>
    <p class="muted small">También puedes tocar el mapa. Tu ubicación GPS no sale de este teléfono; las búsquedas usan OpenStreetMap.</p>
    <p class="picked" id="picked" hidden></p>
    <button class="osm-hint" id="osm-hint" hidden></button>
  </section>

  <section class="card reveal">
    <h2><span class="step">2</span> ¿En qué lugar?</h2>
    <div class="seg" data-key="place">${PLACES.map(([v, l]) => `<button data-v="${v}" aria-pressed="${choice.place === v}">${l}</button>`).join('')}</div>
    <div class="tower-box" id="floor" ${choice.place === 'edificio' ? '' : 'hidden'}>
      <canvas class="tower" id="tower" aria-label="Edificio: toca un piso para elegirlo"></canvas>
      <p class="tower-tip">Toca el edificio para elegir tu piso</p>
      <div class="tower-controls">
        ${stepper('floors', 'Pisos del edificio', choice.floors)}
        ${stepper('floor', 'Tu piso', choice.floor)}
      </div>
      <p class="tower-facts" id="tower-facts"></p>
    </div>
    <h2 class="mt"><span class="step">3</span> ¿Sobre qué suelo? <small class="muted">opcional</small></h2>
    <div class="seg" data-key="ground">${GROUNDS.map(([v, l]) => `<button data-v="${v}" aria-pressed="${choice.ground === v}">${l}</button>`).join('')}</div>
  </section>

  <section class="card result" id="result" hidden>
    <div class="gauge-wrap">${gaugeSVG()}
      <div class="gauge-center"><span class="gauge-n" id="g-n">1.0</span><span class="gauge-r" id="g-r"></span></div>
    </div>
    <h2 class="result-name" id="g-name"></h2>
    <p class="lead center" id="g-text"></p>
    <p class="scale-note" id="g-note"></p>
    <p class="dyfi" id="dyfi" hidden></p>
    <div class="waves" id="waves">
      <div class="wave p"><span class="wave-dot"></span><span><b>Onda P</b><small id="w-p">viajando…</small></span></div>
      <div class="wave s"><span class="wave-dot"></span><span><b>Onda S</b><small id="w-s">viajando…</small></span></div>
    </div>
    <details class="how"><summary>Cómo lo calculamos</summary><div id="g-how"></div></details>
    <button class="btn primary wide share-cta" id="share"><svg viewBox="0 0 24 24" width="20" height="20"><path d="M12 15V4m0 0L7.5 8.5M12 4l4.5 4.5M5 13v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>Compartir mi resultado</button>
    <p class="share-hint">WhatsApp · Historia de Instagram · enlace</p>
  </section>`;
}

function stepper(key, label, value) {
  return `<div class="stepper" data-key="${key}">
    <span>${label}</span>
    <div><button class="round" data-d="-1" aria-label="Menos">−</button>
    <input type="number" inputmode="numeric" min="1" max="80" value="${value}" aria-label="${label}">
    <button class="round" data-d="1" aria-label="Más">+</button></div>
  </div>`;
}

// 240° gauge split into the ten intensity colors.
const A0 = -120, A1 = 120, CX = 120, CY = 120, RAD = 96;
const polar = a => { const r = (a - 90) * Math.PI / 180; return [CX + RAD * Math.cos(r), CY + RAD * Math.sin(r)]; };
const arc = (a, b) => { const [x0, y0] = polar(a), [x1, y1] = polar(b); return `M${x0.toFixed(1)} ${y0.toFixed(1)}A${RAD} ${RAD} 0 ${b - a > 180 ? 1 : 0} 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`; };
const angle = v => A0 + (A1 - A0) * (Math.max(1, Math.min(10, v)) - 1) / 9;
function gaugeSVG() {
  const segs = MMI.slice(1).map((m, i) => {
    const a = A0 + (A1 - A0) * i / 10 + 1.2, b = A0 + (A1 - A0) * (i + 1) / 10 - 1.2;
    return `<path d="${arc(a, b)}" stroke="${m.color}" class="seg-arc"/>`;
  }).join('');
  return `<svg class="gauge" viewBox="0 0 240 200" aria-hidden="true">
    <path d="${arc(A0, A1)}" class="gauge-track"/>${segs}
    <g id="needle" style="transform-origin:${CX}px ${CY}px;transform:rotate(${A0}deg)">
      <line x1="${CX}" y1="${CY}" x2="${CX}" y2="${CY - RAD + 18}" class="needle"/><circle cx="${CX}" cy="${CY}" r="6" class="needle-hub"/>
    </g></svg>`;
}

function adjustments(base) {
  const out = [];
  if (choice.place === 'edificio') {
    const f = choice.floor;
    const add = f <= 2 ? 0 : f <= 5 ? 0.3 : f <= 10 ? 0.5 : f <= 20 ? 0.7 : 0.9;
    if (add) out.push([`Piso ${f}: los pisos altos se mecen más`, add]);
  }
  if (choice.place === 'afuera') out.push(['Al aire libre se percibe un poco menos', -0.2]);
  if (choice.place === 'vehiculo') out.push(['En un carro andando, el movimiento se disimula', -0.8]);
  if (choice.ground === 'roca') out.push(['La roca amortigua la sacudida', -0.2]);
  if (choice.ground === 'relleno') out.push(['El relleno y la arena la amplifican', 0.3]);
  return { list: out, total: Math.max(1, Math.min(10, base + out.reduce((a, [, v]) => a + v, 0))) };
}

export function mount(el, ctx) {
  const { ev } = ctx;
  let spot = store.get(`onda-tu-${ev.id}`, {}).spot || null;
  // A shared link (#/tu?lat=…&lon=…) opens that result.
  if (sharedSpot) { spot = sharedSpot; sharedSpot = null; history.replaceState(null, '', location.pathname + location.search + '#/tu'); }
  let shown = 0;
  const save = () => store.set(`onda-tu-${ev.id}`, { ...choice, spot });
  // Once you've picked a spot, cards stop at the map's edge on phones so the 3D city stays in view.
  // How tall the soft edge between the map and the cards is (CSS --fade).
  const fade = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--fade')) || 96;
  // The map reacts to the cards' scroll (CSS reads --sp, 0 → 1): it drifts and dims as the cards rise.
  let spRaf = 0, rest = 0; // rest: where the result card is parked after a pick
  const onSheetScroll = () => {
    if (spRaf) return;
    spRaf = requestAnimationFrame(() => {
      spRaf = 0;
      const on = document.body.classList.contains('map-clear');
      document.body.style.setProperty('--sp', on ? Math.min(1, Math.max(0, el.scrollTop - rest) / 420).toFixed(3) : '0');
    });
  };
  el.addEventListener('scroll', onSheetScroll, { passive: true });
  sheetOff = () => { el.removeEventListener('scroll', onSheetScroll); cancelAnimationFrame(spRaf); document.body.style.removeProperty('--sp'); };
  const clearMap = () => {
    const on = !!spot && document.activeElement !== $('#city', el);
    if (document.body.classList.contains('map-clear') === on) return;
    // The page and the card box line up exactly, so carry the scroll position across.
    const phone = innerWidth < 900, y = on ? scrollY : el.scrollTop;
    document.body.classList.toggle('map-clear', on);
    if (phone) { if (on) el.scrollTop = y; else scrollTo(0, y); }
    onSheetScroll();
  };

  function compute(replayWaves) {
    if (!spot) return;
    const { mmi, distance, source } = shakingAt(ev, spot.lat, spot.lon);
    const { list, total } = adjustments(mmi);
    const info = mmiInfo(total);
    $('#result', el).hidden = false;
    animateGauge(shown, total);
    shown = total;
    $('#g-r', el).textContent = 'intensidad';
    $('#g-name', el).textContent = info.name;
    $('#g-name', el).style.color = mmiColor(total);
    $('#g-text', el).textContent = info.text;
    $('#g-note', el).innerHTML = `No es la magnitud. La <b>magnitud ${num(ev.mag, 1)}</b> mide la energía de todo el sismo y es una sola. La <b>intensidad</b> mide cuánto se sacudió cada lugar, de 1 a 10, y por eso cambia de un punto a otro.`;
    $('#g-how', el).innerHTML = `
      <div class="how-row"><span>${source === 'shakemap' ? 'Sacudida del suelo en tu punto (ShakeMap del USGS)' : 'Sacudida estimada por distancia y magnitud'}</span><b>${num(mmi, 1)}</b></div>
      ${list.map(([t, v]) => `<div class="how-row"><span>${esc(t)}</span><b>${v > 0 ? '+' : '−'}${num(Math.abs(v), 1)}</b></div>`).join('')}
      <div class="how-row total"><span>Tu intensidad</span><b>${num(total, 1)}</b></div>
      <p class="muted small">Estás a ${int(distance)} km del epicentro. La escala va de 1 (nadie lo siente) a 10 (destrucción). Los ajustes son aproximados.</p>`;
    $('#share', el).onclick = () => openShare({ ev, total, spot, choice, distance });
    if (replayWaves) {
      $('#w-p', el).textContent = 'viajando…'; $('#w-s', el).textContent = 'viajando…';
      $$('.wave', el).forEach(w => w.classList.remove('hit'));
      $('#osm-hint', el).hidden = true;
      showYou(spot.lat, spot.lon, distance, { mmi: total, onBuilding: building, onWave: (kind, secs) => {
        const w = $(`.wave.${kind}`, el);
        if (kind === 's') tower?.kick(Math.min(1.4, Math.max(0.4, (total - 3) / 4)));
        w.classList.add('hit');
        $(`#w-${kind}`, el).textContent = kind === 'p'
          ? `llegó a los ${int(secs)} s: un golpe seco o un zumbido`
          : `llegó a los ${int(secs)} s: la que más sacude`;
        haptic(kind === 's' ? [40, 30, 60] : 15);
      } });
      // On phones, park the result just under the map so you can watch the waves arrive.
      const behavior = reduceMotion() ? 'auto' : 'smooth';
      setTimeout(() => innerWidth >= 900
        ? $('#result', el).scrollIntoView({ behavior, block: 'start' })
        : document.body.classList.contains('map-clear') ? el.scrollTo({ top: (rest = $('#result', el).offsetTop - fade() + 8), behavior })
          : scrollTo({ top: $('#result', el).offsetTop - innerHeight * 0.44 + 4, behavior }), 250);
    }
    tower?.set({ mmi: total });
    save();
  }

  function animateGauge(from, to) {
    const needle = $('#needle', el), n = $('#g-n', el);
    const dur = reduceMotion() ? 0 : 1300, start = performance.now();
    const step = now => {
      const t = dur ? Math.min(1, (now - start) / dur) : 1;
      // A little overshoot, like a real needle.
      const k = t < 1 ? ease(t) + Math.sin(t * Math.PI) * 0.06 : 1;
      const v = from + (to - from) * k;
      needle.style.transform = `rotate(${angle(v)}deg)`;
      n.textContent = num(Math.max(1, Math.min(10, v)), 1);
      n.style.color = mmiColor(v);
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  function nearestTown(lat, lon, prefix) {
    let best = null, dist = Infinity;
    for (const c of ev.cities || []) { const d = km(lat, lon, c.lat, c.lon); if (d < dist) { dist = d; best = c; } }
    const near = best && dist < 25 ? (dist < 2 ? best.name : `cerca de ${best.name}`) : null;
    return prefix ? (near ? `${prefix}, ${near}` : prefix) : (near ? near[0].toUpperCase() + near.slice(1) : null);
  }

  async function reports(lat, lon) {
    const box = $('#dyfi', el);
    const cells = await loadDYFI(ev).catch(() => []);
    let best = null, dist = Infinity;
    for (const c of cells) { const d = km(lat, lon, c.lat, c.lon); if (d < dist) { dist = d; best = c; } }
    if (!best || dist > 12) { box.hidden = true; return; }
    box.hidden = false;
    box.innerHTML = `<span class="dot" style="--c:${mmiColor(best.cdi)}"></span><span>
      <b>${best.responses === 1 ? 'Una persona' : `${int(best.responses)} personas`} en tu zona ${best.responses === 1 ? 'reportó' : 'reportaron'} intensidad ${num(best.cdi, 1)}</b>
      <small>Respuestas a "¿Lo sentiste?" del USGS, en cuadros de 10 km.</small></span>`;
  }

  function pick(lat, lon, name) {
    reports(lat, lon);
    spot = { lat, lon, name };
    clearMap();
    const p = $('#picked', el);
    p.hidden = false;
    p.innerHTML = `<span class="pin"></span> ${esc(name || `${num(lat, 3)}, ${num(lon, 3)}`)}`;
    haptic();
    compute(true);
  }

  $('#locate', el).addEventListener('click', e => {
    const btn = e.currentTarget;
    if (!navigator.geolocation) { btn.textContent = 'Tu navegador no permite ubicación'; return; }
    btn.classList.add('busy');
    navigator.geolocation.getCurrentPosition(
      pos => { btn.classList.remove('busy'); const { latitude: la, longitude: lo } = pos.coords; pick(la, lo, nearestTown(la, lo, 'Tu ubicación')); },
      err => {
        btn.classList.remove('busy');
        const p = $('#picked', el);
        p.hidden = false;
        p.textContent = err.code === 1 ? 'Permiso de ubicación denegado. Busca tu ciudad o toca el mapa.' : 'No pudimos obtener tu ubicación. Busca tu ciudad o toca el mapa.';
      },
      { enableHighAccuracy: false, timeout: 12000, maximumAge: 600000 });
  });

  const input = $('#city', el), suggest = $('#suggest', el), spin = $('#search-spin', el);
  const fold = t => t.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
  let results = [], active = -1, timer, seq = 0;
  const preview = r => mmiColor(shakingAt(ev, r.lat, r.lon).mmi);
  function show() {
    suggest.hidden = !results.length && !input.value.trim();
    input.parentElement.setAttribute('aria-expanded', !suggest.hidden);
    const guess = results[0]?.fuzzy ? '<p class="suggest-head">¿Quisiste decir…?</p>' : '';
    suggest.innerHTML = results.length ? guess + results.map((r, i) => `
      <button role="option" id="opt-${i}" aria-selected="${i === active}" data-i="${i}">
        <span class="dot" style="--c:${preview(r)}"></span>
        <span class="grow"><b>${esc(r.name)}</b><small>${esc(r.detail || '')}</small></span>
        ${r.local ? '<em class="tag">USGS</em>' : ''}
      </button>`).join('')
      : `<p class="muted small pad">${spin.hidden ? 'No encontramos ese lugar en Panamá. Prueba con el nombre del pueblo o toca el mapa.' : 'Buscando…'}</p>`;
    input.setAttribute('aria-activedescendant', active >= 0 ? `opt-${active}` : '');
  }
  function choose(r) {
    input.value = r.name;
    results = []; active = -1;
    suggest.hidden = true;
    input.blur();
    pick(r.lat, r.lon, r.detail ? `${r.name}, ${r.detail.split(', ')[0]}` : r.name);
  }
  input.addEventListener('input', () => {
    const q = input.value.trim(), fq = fold(q), mine = ++seq;
    clearTimeout(timer);
    // Towns the USGS already rated show up instantly; OpenStreetMap fills in streets and barrios.
    const local = q.length < 2 ? [] : (ev.cities || []).filter(c => inPanama(c.lat, c.lon)).filter(c => fold(c.name).startsWith(fq) || fold(c.name).includes(` ${fq}`) || (q.length >= 4 && similarity(q, c) >= 0.82))
      .slice(0, 3).map(c => ({ name: c.name, detail: shortPlace(ev.place), lat: c.lat, lon: c.lon, local: true }));
    results = local; active = local.length ? 0 : -1;
    if (q.length < 3) { spin.hidden = true; show(); return; }
    spin.hidden = false; show();
    timer = setTimeout(async () => {
      try {
        const found = await searchPlaces(q, ev);
        if (mine !== seq) return;
        const near = found.filter(f => !local.some(l => km(l.lat, l.lon, f.lat, f.lon) < 2 && fold(l.name) === fold(f.name)));
        results = [...local, ...near].slice(0, 8);
        active = results.length ? 0 : -1;
      } catch (e) {
        if (e.name === 'AbortError') return;
      }
      spin.hidden = true;
      show();
    }, 220);
  });
  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!results.length) return;
      e.preventDefault();
      active = (active + (e.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length;
      show();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (results[active]) choose(results[active]);
    } else if (e.key === 'Escape') { suggest.hidden = true; }
  });
  input.addEventListener('focus', () => {
    clearMap();
    if (results.length) show();
    // On phones, lift the search box toward the top so the suggestions clear the keyboard and tab bar.
    if (innerWidth < 900) scrollTo({ top: input.closest('.card').getBoundingClientRect().top + scrollY - 70 });
  });
  input.addEventListener('blur', () => setTimeout(() => { suggest.hidden = true; clearMap(); }, 180));
  suggest.addEventListener('pointerdown', e => e.preventDefault()); // keep focus so the tap lands
  suggest.addEventListener('click', e => {
    const b = e.target.closest('[data-i]');
    if (b) choose(results[+b.dataset.i]);
  });

  for (const seg of $$('.seg', el)) {
    seg.addEventListener('click', e => {
      const b = e.target.closest('button');
      if (!b) return;
      choice[seg.dataset.key] = b.dataset.v;
      $$('button', seg).forEach(x => x.setAttribute('aria-pressed', x === b));
      $('#floor', el).hidden = choice.place !== 'edificio';
      haptic(8);
      compute(false);
    });
  }
  // ---- Building: tap the drawing or type the numbers ----
  tower = createTower($('#tower', el), { onPick: f => { if (f !== choice.floor) { setFloors({ floor: f }); haptic(6); } } });
  function setFloors(next, from) {
    Object.assign(choice, next);
    choice.floors = Math.max(1, Math.min(80, choice.floors));
    choice.floor = Math.max(1, Math.min(80, choice.floor));
    // Typing a floor higher than the building makes the building taller, never the other way round.
    if (choice.floor > choice.floors) { if ('floors' in next) choice.floor = choice.floors; else choice.floors = choice.floor; }
    for (const st of $$('.stepper', el)) {
      const input = $('input', st);
      if (input !== from) input.value = choice[st.dataset.key];
    }
    const { height, period, ratio } = towerFacts(choice.floors, choice.floor);
    $('#tower-facts', el).innerHTML = `<span><b>~${int(height)} m</b> de alto</span><span>se mece cada <b>${num(period, 1)} s</b></span>
      <span>tu piso se acelera hasta <b>${num(ratio, 1)}×</b> lo que la calle</span>`;
    tower.set({ floors: choice.floors, floor: choice.floor });
    if (spot) compute(false); else save();
  }
  for (const st of $$('.stepper', el)) {
    const key = st.dataset.key, input = $('input', st);
    let hold;
    const bump = d => setFloors({ [key]: choice[key] + d });
    // Hold a button to keep counting.
    st.addEventListener('pointerdown', e => {
      const b = e.target.closest('[data-d]');
      if (!b) return;
      e.preventDefault();
      bump(+b.dataset.d);
      let wait = 380;
      const again = () => { bump(+b.dataset.d); wait = Math.max(50, wait * 0.8); hold = setTimeout(again, wait); };
      hold = setTimeout(again, wait);
    });
    for (const type of ['pointerup', 'pointerleave', 'pointercancel']) st.addEventListener(type, () => clearTimeout(hold));
    st.addEventListener('keydown', e => { const b = e.target.closest('[data-d]'); if (b && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); bump(+b.dataset.d); } });
    input.addEventListener('focus', () => input.select());
    input.addEventListener('input', () => { const n = parseInt(input.value, 10); if (n >= 1) setFloors({ [key]: Math.min(80, n) }, input); });
    input.addEventListener('change', () => { input.value = choice[key]; });
    input.addEventListener('keydown', e => { if (e.key === 'Enter') input.blur(); });
  }
  setFloors({});

  // OpenStreetMap often knows how tall the building at your spot is.
  function building(heightM) {
    const hint = $('#osm-hint', el);
    const floors = heightM ? Math.round(heightM / 3) : 0;
    if (floors < 3 || (choice.place === 'edificio' && choice.floors === floors)) { hint.hidden = true; return; }
    hint.hidden = false;
    hint.innerHTML = `<span class="osm-bldg" style="--n:${Math.min(floors, 30)}"></span>
      <span><b>Tu edificio mide ~${int(heightM)} m</b><small>Unos ${floors} pisos, según OpenStreetMap. Toca para usarlo.</small></span>`;
    hint.onclick = () => {
      hint.hidden = true;
      choice.place = 'edificio';
      $$('[data-key="place"] button', el).forEach(x => x.setAttribute('aria-pressed', x.dataset.v === 'edificio'));
      $('#floor', el).hidden = false;
      setFloors({ floors, floor: Math.min(choice.floor, floors) });
      haptic(12);
      $('#floor', el).scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'center' });
    };
  }

  offClick = onMapClick(e => {
    if (e.defaultPrevented) return;
    pick(e.lngLat.lat, e.lngLat.lng, nearestTown(e.lngLat.lat, e.lngLat.lng));
  });

  if (spot) pick(spot.lat, spot.lon, spot.name);
  requestAnimationFrame(() => $$('.reveal', el).forEach(n => n.classList.add('in')));

}

export function unmount() { sheetOff?.(); sheetOff = null; document.body.classList.remove('map-clear'); offClick?.(); offClick = null; tower?.destroy(); tower = null; clearYou(); }
