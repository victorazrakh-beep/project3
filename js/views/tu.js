// "Tú": your personal intensity, from the USGS shaking grid at your exact spot.
import { $, $$, esc, num, int, roman, mmiInfo, mmiColor, MMI, ease, reduceMotion, haptic, store, shortPlace } from '../util.js';
import { shakingAt, searchPlaces, loadDYFI, inPanama } from '../data.js';
import { km } from '../util.js';
import { showYou, onMapClick, clearYou } from '../map.js';

const PLACES = [['casa', 'Casa'], ['edificio', 'Edificio'], ['afuera', 'Afuera'], ['vehiculo', 'En un carro']];
const GROUNDS = [['nose', 'No sé'], ['roca', 'Roca o loma'], ['firme', 'Tierra firme'], ['relleno', 'Relleno o junto al agua']];

let choice, offClick;

export function render({ ev }) {
  choice = { place: 'casa', floor: 3, ground: 'nose', ...store.get(`onda-tu-${ev.id}`, {}) };
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
  </section>

  <section class="card reveal">
    <h2><span class="step">2</span> ¿En qué lugar?</h2>
    <div class="seg" data-key="place">${PLACES.map(([v, l]) => `<button data-v="${v}" aria-pressed="${choice.place === v}">${l}</button>`).join('')}</div>
    <div class="floor" id="floor" ${choice.place === 'edificio' ? '' : 'hidden'}>
      <span>Piso</span>
      <button class="round" data-floor="-1" aria-label="Piso más bajo">−</button>
      <input class="floor-n" id="floor-n" type="number" inputmode="numeric" min="1" max="80" value="${choice.floor}" aria-label="Número de piso">
      <button class="round" data-floor="1" aria-label="Piso más alto">+</button>
    </div>
    <h2 class="mt"><span class="step">3</span> ¿Sobre qué suelo? <small class="muted">opcional</small></h2>
    <div class="seg" data-key="ground">${GROUNDS.map(([v, l]) => `<button data-v="${v}" aria-pressed="${choice.ground === v}">${l}</button>`).join('')}</div>
  </section>

  <section class="card result" id="result" hidden>
    <div class="gauge-wrap">${gaugeSVG()}
      <div class="gauge-center"><span class="gauge-n" id="g-n">I</span><span class="gauge-r" id="g-r"></span></div>
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
    <button class="btn wide" id="share">Compartir mi resultado</button>
  </section>`;
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
  let shown = 0;
  const save = () => store.set(`onda-tu-${ev.id}`, { ...choice, spot });

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
    $('#g-note', el).innerHTML = `No es la magnitud. La <b>magnitud ${num(ev.mag, 1)}</b> mide la energía de todo el sismo y es una sola. La <b>intensidad</b> mide cuánto se sacudió cada lugar, de I a X, y por eso cambia de un punto a otro.`;
    $('#g-how', el).innerHTML = `
      <div class="how-row"><span>${source === 'shakemap' ? 'Sacudida del suelo en tu punto (ShakeMap del USGS)' : 'Sacudida estimada por distancia y magnitud'}</span><b>${num(mmi, 1)}</b></div>
      ${list.map(([t, v]) => `<div class="how-row"><span>${esc(t)}</span><b>${v > 0 ? '+' : '−'}${num(Math.abs(v), 1)}</b></div>`).join('')}
      <div class="how-row total"><span>Tu intensidad</span><b>${num(total, 1)} → ${roman(total)}</b></div>
      <p class="muted small">Estás a ${int(distance)} km del epicentro. La escala de Mercalli va de I (nadie lo siente) a X o más (destrucción); los decimales son el valor exacto antes de redondear. Los ajustes son aproximados.</p>`;
    $('#share', el).onclick = () => share(total, spot.name);
    if (replayWaves) {
      $('#w-p', el).textContent = 'viajando…'; $('#w-s', el).textContent = 'viajando…';
      $$('.wave', el).forEach(w => w.classList.remove('hit'));
      showYou(spot.lat, spot.lon, distance, (kind, secs) => {
        const w = $(`.wave.${kind}`, el);
        w.classList.add('hit');
        $(`#w-${kind}`, el).textContent = kind === 'p'
          ? `llegó a los ${int(secs)} s: un golpe seco o un zumbido`
          : `llegó a los ${int(secs)} s: la que más sacude`;
        haptic(kind === 's' ? [40, 30, 60] : 15);
      });
      // On phones, park the result just under the map so you can watch the waves arrive.
      const behavior = reduceMotion() ? 'auto' : 'smooth';
      setTimeout(() => innerWidth >= 900
        ? $('#result', el).scrollIntoView({ behavior, block: 'start' })
        : el.scrollTo({ top: $('#result', el).offsetTop - innerHeight * 0.44 + 8, behavior }), 250);
    }
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
      n.textContent = roman(v);
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
      <b>${best.responses === 1 ? 'Una persona' : `${int(best.responses)} personas`} en tu zona ${best.responses === 1 ? 'reportó' : 'reportaron'} intensidad ${roman(best.cdi)}</b>
      <small>Respuestas a "¿Lo sentiste?" del USGS, en cuadros de 10 km.</small></span>`;
  }

  function pick(lat, lon, name) {
    reports(lat, lon);
    spot = { lat, lon, name };
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
    suggest.innerHTML = results.length ? results.map((r, i) => `
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
    const local = q.length < 2 ? [] : (ev.cities || []).filter(c => inPanama(c.lat, c.lon)).filter(c => fold(c.name).startsWith(fq) || fold(c.name).includes(` ${fq}`))
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
    if (results.length) show();
    // On phones, lift the search box toward the top so the suggestions clear the keyboard and tab bar.
    if (innerWidth < 900) el.scrollTo({ top: input.closest('.card').offsetTop - 70, behavior: reduceMotion() ? 'auto' : 'smooth' });
  });
  input.addEventListener('blur', () => setTimeout(() => { suggest.hidden = true; }, 180));
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
  $('#floor', el).addEventListener('click', e => {
    const b = e.target.closest('[data-floor]');
    if (!b) return;
    choice.floor = Math.max(1, Math.min(80, choice.floor + +b.dataset.floor));
    $('#floor-n', el).value = choice.floor;
    compute(false);
  });
  const floorInput = $('#floor-n', el);
  floorInput.addEventListener('focus', () => floorInput.select());
  floorInput.addEventListener('input', () => {
    const n = parseInt(floorInput.value, 10);
    if (n >= 1) { choice.floor = Math.min(80, n); compute(false); }
  });
  floorInput.addEventListener('change', () => { floorInput.value = choice.floor; });
  floorInput.addEventListener('keydown', e => { if (e.key === 'Enter') floorInput.blur(); });

  offClick = onMapClick(e => {
    if (e.defaultPrevented) return;
    pick(e.lngLat.lat, e.lngLat.lng, nearestTown(e.lngLat.lat, e.lngLat.lng));
  });

  if (spot) pick(spot.lat, spot.lon, spot.name);
  requestAnimationFrame(() => $$('.reveal', el).forEach(n => n.classList.add('in')));

  function share(total, name) {
    const text = `Según Onda, el sismo M${num(ev.mag, 1)} se sintió con intensidad ${roman(total)} (${mmiInfo(total).name.toLowerCase()})${name ? ` en ${name}` : ' donde yo estaba'}.`;
    const url = location.href.split('#')[0] + '#/tu';
    if (navigator.share) navigator.share({ title: 'Mi intensidad', text, url }).catch(() => {});
    else navigator.clipboard?.writeText(`${text} ${url}`).then(() => { $('#share', el).textContent = 'Copiado'; });
  }
}

export function unmount() { offClick?.(); offClick = null; clearYou(); }
