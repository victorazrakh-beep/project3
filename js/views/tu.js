// "Tú": your personal intensity, from the USGS shaking grid at your exact spot.
import { $, $$, esc, num, int, roman, mmiInfo, mmiColor, MMI, ease, reduceMotion, haptic, store, shortPlace } from '../util.js';
import { shakingAt } from '../data.js';
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
    ${ev.cities?.length ? `
    <div class="search-wrap">
      <input id="city" class="input" type="search" placeholder="O busca tu ciudad o pueblo" autocomplete="off" aria-label="Buscar ciudad">
      <div class="suggest" id="suggest" hidden></div>
    </div>` : ''}
    <p class="muted small">También puedes tocar el mapa. Tu ubicación no sale de este teléfono.</p>
    <p class="picked" id="picked" hidden></p>
  </section>

  <section class="card reveal">
    <h2><span class="step">2</span> ¿En qué lugar?</h2>
    <div class="seg" data-key="place">${PLACES.map(([v, l]) => `<button data-v="${v}" aria-pressed="${choice.place === v}">${l}</button>`).join('')}</div>
    <div class="floor" id="floor" ${choice.place === 'edificio' ? '' : 'hidden'}>
      <span>Piso</span>
      <button class="round" data-floor="-1" aria-label="Piso más bajo">−</button>
      <b id="floor-n">${choice.floor}</b>
      <button class="round" data-floor="1" aria-label="Piso más alto">+</button>
    </div>
    <h2 class="mt"><span class="step">3</span> ¿Sobre qué suelo? <small class="muted">opcional</small></h2>
    <div class="seg" data-key="ground">${GROUNDS.map(([v, l]) => `<button data-v="${v}" aria-pressed="${choice.ground === v}">${l}</button>`).join('')}</div>
  </section>

  <section class="card result" id="result" hidden>
    <div class="gauge-wrap">${gaugeSVG()}
      <div class="gauge-center"><span class="gauge-n" id="g-n">0</span><span class="gauge-r" id="g-r"></span></div>
    </div>
    <h2 class="result-name" id="g-name"></h2>
    <p class="lead center" id="g-text"></p>
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
    $('#g-r', el).textContent = roman(total);
    $('#g-name', el).textContent = info.name;
    $('#g-name', el).style.color = mmiColor(total);
    $('#g-text', el).textContent = info.text;
    $('#g-how', el).innerHTML = `
      <div class="how-row"><span>${source === 'shakemap' ? 'Sacudida del suelo en tu punto (ShakeMap del USGS)' : 'Sacudida estimada por distancia y magnitud'}</span><b>${num(mmi, 1)}</b></div>
      ${list.map(([t, v]) => `<div class="how-row"><span>${esc(t)}</span><b>${v > 0 ? '+' : '−'}${num(Math.abs(v), 1)}</b></div>`).join('')}
      <div class="how-row total"><span>Tu intensidad</span><b>${num(total, 1)}</b></div>
      <p class="muted small">Estás a ${int(distance)} km del epicentro. La escala va de 1 (nadie lo siente) a 10 (destrucción). Los ajustes son aproximados.</p>`;
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
      n.textContent = num(Math.max(1, Math.min(10, v)), 1);
      n.style.color = mmiColor(v);
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  function pick(lat, lon, name) {
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
      pos => { btn.classList.remove('busy'); pick(pos.coords.latitude, pos.coords.longitude, 'Tu ubicación'); },
      err => {
        btn.classList.remove('busy');
        const p = $('#picked', el);
        p.hidden = false;
        p.textContent = err.code === 1 ? 'Permiso de ubicación denegado. Busca tu ciudad o toca el mapa.' : 'No pudimos obtener tu ubicación. Busca tu ciudad o toca el mapa.';
      },
      { enableHighAccuracy: false, timeout: 12000, maximumAge: 600000 });
  });

  const input = $('#city', el), suggest = $('#suggest', el);
  input?.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
    const matches = q.length < 2 ? [] : ev.cities.filter(c => c.name.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').includes(q)).slice(0, 6);
    suggest.hidden = !matches.length;
    suggest.innerHTML = matches.map(c => `<button data-lat="${c.lat}" data-lon="${c.lon}" data-name="${esc(c.name)}">${esc(c.name)}<small>${c.pop >= 1000 ? `${int(c.pop)} hab.` : ''}</small></button>`).join('');
  });
  suggest?.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    input.value = b.dataset.name;
    suggest.hidden = true;
    pick(+b.dataset.lat, +b.dataset.lon, `${b.dataset.name}, ${shortPlace(ev.place)}`);
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
    $('#floor-n', el).textContent = choice.floor;
    compute(false);
  });

  offClick = onMapClick(e => {
    if (e.defaultPrevented) return;
    pick(e.lngLat.lat, e.lngLat.lng, null);
  });

  if (spot) pick(spot.lat, spot.lon, spot.name);
  requestAnimationFrame(() => $$('.reveal', el).forEach(n => n.classList.add('in')));

  function share(total, name) {
    const text = `Según Onda, el sismo M${num(ev.mag, 1)} se sintió con intensidad ${num(total, 1)} (${mmiInfo(total).name.toLowerCase()})${name ? ` en ${name}` : ' donde yo estaba'}.`;
    const url = location.href.split('#')[0] + '#/tu';
    if (navigator.share) navigator.share({ title: 'Mi intensidad', text, url }).catch(() => {});
    else navigator.clipboard?.writeText(`${text} ${url}`).then(() => { $('#share', el).textContent = 'Copiado'; });
  }
}

export function unmount() { offClick?.(); offClick = null; clearYou(); }
