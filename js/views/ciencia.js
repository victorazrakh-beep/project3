// "Ciencia": what moved, how deep, how much energy, and how aftershocks fade.
import { $, esc, num, int, compact, reveal, magColor, mmiColor, km, reduceMotion } from '../util.js';
import { loadHistory } from '../data.js';
import { BCIP, loadSeismogram } from '../seismo.js';

const HIROSHIMA_J = 6.3e13;
const energy = m => 10 ** (1.5 * m + 4.8); // joules (Gutenberg–Richter)

function faultType(rake) {
  const r = ((rake + 180) % 360 + 360) % 360 - 180, a = Math.abs(r);
  if (a <= 22.5 || a >= 157.5) return { kind: 'rumbo', name: 'Falla de rumbo', text: 'Dos bloques de roca se deslizaron de lado, uno junto al otro, como dos carros que se rozan al pasar.' };
  if (a >= 67.5 && a <= 112.5) return r > 0
    ? { kind: 'inversa', name: 'Falla inversa', text: 'Un bloque fue empujado hacia arriba y por encima del otro: la corteza se acortó por compresión.' }
    : { kind: 'normal', name: 'Falla normal', text: 'Un bloque se hundió respecto al otro: la corteza se estiró y cedió.' };
  const lateral = a > 112.5 || a < 67.5;
  if (r > 0) return { kind: lateral ? 'rumbo' : 'inversa', name: 'Falla oblicua inversa', text: 'Los bloques se movieron de lado y, a la vez, uno subió sobre el otro.' };
  return { kind: lateral ? 'rumbo' : 'normal', name: 'Falla de rumbo con componente normal', text: 'Los bloques se deslizaron sobre todo de lado, y uno de ellos además se hundió un poco.' };
}

function faultSVG(kind) {
  if (kind === 'rumbo') return `
  <svg viewBox="0 0 260 150" class="fault rumbo" aria-hidden="true">
    <text x="130" y="14" class="fault-cap">Vista desde arriba</text>
    <g class="blk a"><rect x="20" y="24" width="220" height="56" rx="8"/><path d="M60 52h40m-12-8 12 8-12 8" class="arrow"/></g>
    <g class="blk b"><rect x="20" y="84" width="220" height="56" rx="8"/><path d="M200 112h-40m12-8-12 8 12 8" class="arrow"/></g>
    <line x1="10" y1="82" x2="250" y2="82" class="fault-line"/>
  </svg>`;
  const up = kind === 'inversa';
  return `
  <svg viewBox="0 0 260 150" class="fault ${kind}" aria-hidden="true">
    <text x="130" y="14" class="fault-cap">Corte de lado</text>
    <path d="M20 40h105l40 100H20z" class="blk-shape a"/>
    <g class="blk hang ${up ? 'up' : 'down'}"><path d="M127 40h113v100H167z" class="blk-shape b"/>
      <path d="M200 ${up ? 100 : 70}l-12 ${up ? -26 : 26}" class="arrow"/></g>
    <line x1="126" y1="40" x2="166" y2="140" class="fault-line"/>
  </svg>`;
}

export function render({ ev, shocks }) {
  const fault = ev.mechanism ? faultType(ev.mechanism.rake) : null;
  const hiro = energy(ev.mag) / HIROSHIMA_J;
  const depthClass = ev.depth < 70 ? ['superficial', 'Los sismos superficiales concentran su energía cerca de la gente: por eso se sienten tan fuertes.']
    : ev.depth < 300 ? ['intermedio', 'A esta profundidad la energía se reparte en un área más grande antes de llegar a la superficie.']
    : ['profundo', 'Los sismos profundos se sienten en zonas muy amplias, pero con menos fuerza.'];
  const biggest = shocks.reduce((a, b) => (!a || b.mag > a.mag ? b : a), null);
  return `
  <section class="hero reveal">
    <p class="kicker">La ciencia</p>
    <h1 class="title">Por qué tembló así</h1>
    <p class="lead">La Tierra está partida en placas que se mueven unos centímetros al año, más o menos lo que crecen tus uñas. Las rocas se traban, acumulan tensión durante siglos y de pronto se sueltan: eso es un sismo.</p>
  </section>

  ${ev.inPanama ? `
  <section class="card reveal">
    <h2>Panamá, un puente apretado</h2>
    <p>El istmo descansa sobre un bloque de corteza encajado entre cuatro placas: Caribe al norte, Cocos y Nazca al sur, y Sudamérica al este. Ese bloque está siendo empujado y torcido por todos lados, y las fallas al sur del país, como las de la península de Azuero y la zona de fractura de Panamá, absorben buena parte de ese movimiento.</p>
  </section>` : ''}

  ${fault ? `
  <section class="card reveal">
    <h2>Qué se movió</h2>
    ${faultSVG(fault.kind)}
    <h3 class="em">${esc(fault.name)}</h3>
    <p>${esc(fault.text)}</p>
    <p class="muted small">Según el tensor de momento del USGS: rumbo ${int(ev.mechanism.strike)}°, buzamiento ${int(ev.mechanism.dip)}°, deslizamiento ${int(ev.mechanism.rake)}°.</p>
  </section>` : ''}

  ${ev.inPanama ? `
  <section class="card reveal">
    <h2>Así lo grabó un sismógrafo</h2>
    <p class="muted small">Registro real de la estación de ${esc(BCIP.name)}, a ${int(km(ev.lat, ev.lon, BCIP.lat, BCIP.lon))} km del epicentro. Componente vertical, 10 minutos desde el inicio del sismo.</p>
    <div class="seismo" id="seismo"><canvas></canvas><p class="muted small seismo-msg">Descargando la señal…</p></div>
    <div class="seismo-legend"><span class="p">Onda P</span><span class="s">Onda S</span><span class="muted">tiempo desde el inicio →</span></div>
    <p class="muted small">Datos: estación CU.BCIP, red del Caribe (USGS), vía <a href="https://ds.iris.edu/mda/CU/BCIP/" target="_blank" rel="noopener">EarthScope</a>.</p>
  </section>` : ''}

  <section class="card reveal">
    <h2>Qué tan profundo</h2>
    <div class="depth">
      <div class="depth-col">
        <span class="layer crust">Corteza</span><span class="layer mantle">Manto</span>
        <span class="depth-mark" style="--y:${Math.min(96, ev.depth / 100 * 100)}%"><i></i><b>${int(ev.depth)} km</b></span>
      </div>
      <div><h3 class="em">Sismo ${depthClass[0]}</h3><p>${esc(depthClass[1])}</p></div>
    </div>
  </section>

  <section class="card reveal">
    <h2>Cuánta energía</h2>
    <p class="big-figure"><span data-count="${hiro}">0</span><small>veces la bomba de Hiroshima</small></p>
    <p class="muted small">Cada punto de magnitud libera unas 32 veces más energía que el anterior. Compara:</p>
    <div class="compare">
      <div class="orbs"><span class="orb main" style="--c:${magColor(ev.mag)}"></span><span class="orb other" id="orb"></span></div>
      <label class="slider"><span>Un sismo de <b id="m-val"></b></span>
        <input type="range" id="m" min="3" max="9.5" step="0.1" value="${Math.max(3, Math.round((ev.mag - 1) * 10) / 10)}"></label>
      <p id="m-out" class="em center"></p>
    </div>
  </section>

  ${shocks.length ? `
  <section class="card reveal">
    <h2>Las réplicas se van calmando</h2>
    <p class="muted small">Réplicas M2.5+ por día desde el sismo principal.</p>
    <div class="days" id="days"></div>
    <p>Es normal: las réplicas bajan rápido con el tiempo, pero pueden seguir durante meses.${biggest ? ` La mayor hasta ahora fue de M${num(biggest.mag, 1)}, ${num(ev.mag - biggest.mag, 1)} puntos menos que el sismo principal; lo típico es alrededor de 1.2.` : ''}</p>
  </section>` : ''}

  <section class="card reveal" id="history-card" hidden></section>

  <section class="card reveal">
    <h2>Fuentes</h2>
    <ul class="ticks sources">
      ${ev.inPanama ? `<li><a href="https://sismosgeociencias.up.ac.pa/" target="_blank" rel="noopener">Instituto de Geociencias, Universidad de Panamá</a>: sismos de la red local</li>
      <li><a href="https://ds.iris.edu/mda/CU/BCIP/" target="_blank" rel="noopener">EarthScope</a>: sismograma de la estación de Isla Barro Colorado</li>
      <li><a href="https://www.sinaproc.gob.pa/" target="_blank" rel="noopener">SINAPROC</a>: la autoridad oficial de protección civil</li>` : ''}
      <li><a href="${esc(ev.url)}/ground-failure/summary" target="_blank" rel="noopener">USGS: deslizamientos y licuefacción</a></li>
      <li><a href="https://www.ngdc.noaa.gov/hazel/view/hazards/earthquake/search" target="_blank" rel="noopener">NOAA NCEI: base de datos de sismos históricos</a></li>
      <li><a href="https://photon.komoot.io/" target="_blank" rel="noopener">Photon</a> y <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>: búsqueda de lugares</li>
      <li><a href="${esc(ev.url)}" target="_blank" rel="noopener">Página del sismo en el USGS</a></li>
      <li><a href="${esc(ev.url)}/shakemap" target="_blank" rel="noopener">ShakeMap: intensidad por zona</a></li>
      <li><a href="${esc(ev.url)}/pager" target="_blank" rel="noopener">PAGER: población expuesta</a></li>
      <li><a href="${esc(ev.url)}/oaf" target="_blank" rel="noopener">Pronóstico de réplicas</a></li>
      <li><a href="${esc(ev.url)}/tellus" target="_blank" rel="noopener">Cuéntale al USGS si lo sentiste</a></li>
    </ul>
  </section>`;
}

export function mount(el, { ev, shocks }) {
  reveal(el);
  if (ev.inPanama) drawSeismogram($('#seismo', el), ev);
  history($('#history-card', el), ev);
  const slider = $('#m', el), orb = $('#orb', el);
  const update = () => {
    const m = +slider.value, ratio = energy(ev.mag) / energy(m);
    $('#m-val', el).textContent = `M${num(m, 1)}`;
    orb.style.setProperty('--s', Math.max(0.02, Math.min(2.2, Math.sqrt(1 / ratio))));
    orb.style.setProperty('--c', magColor(m));
    $('#m-out', el).textContent = Math.abs(ratio - 1) < 0.05 ? 'La misma energía'
      : ratio > 1 ? `Este sismo liberó ${ratio >= 1e4 ? compact(ratio) : int(ratio)} veces más energía`
      : `Ese liberaría ${1 / ratio >= 1e4 ? compact(1 / ratio) : int(1 / ratio)} veces más energía que este`;
  };
  slider.addEventListener('input', update);
  update();

  const days = $('#days', el);
  if (days) {
    const n = Math.max(1, Math.min(30, Math.ceil((Date.now() - ev.time) / 864e5)));
    const counts = Array(n).fill(0);
    for (const s of shocks) { const d = Math.floor((s.time - ev.time) / 864e5); if (d >= 0 && d < n) counts[d]++; }
    const max = Math.max(1, ...counts);
    days.innerHTML = counts.map((c, i) => `<div class="day" style="--h:${c / max * 100}%;--i:${i}"><b>${c}</b><span>${i + 1}</span></div>`).join('');
    new IntersectionObserver(([e], io) => { if (e.isIntersecting) { days.classList.add('grow'); io.disconnect(); } }).observe(days);
  }
}

async function history(card, ev) {
  const past = (await loadHistory(ev).catch(() => [])).filter(h => h.mag >= 6 && Math.abs(h.time - ev.time) > 864e5);
  if (!past.length || !card.isConnected) return;
  const year = t => new Date(t).getUTCFullYear();
  card.hidden = false;
  card.innerHTML = `
    <h2>No es la primera vez</h2>
    <p class="muted small">Sismos fuertes que el USGS registra cerca de este, del más reciente al más antiguo.</p>
    <div class="history">${past.slice(0, 8).map(h => `
      <div class="hist">
        <span class="hist-year">${year(h.time)}</span>
        <span class="mag-dot" style="--c:${magColor(h.mag)}">${num(h.mag, 1)}</span>
        <span class="grow"><b>A ${int(h.distance)} km de este epicentro</b>
          <small>Intensidad máxima ${h.maxMMI ? `<i style="color:${mmiColor(h.maxMMI)}">${h.maxMMI}</i>` : 'desconocida'}${h.deaths ? ` · ${int(h.deaths)} fallecidos` : ''}${h.tsunami ? ' · tsunami' : ''}</small></span>
      </div>`).join('')}</div>`;
  card.classList.add('in');
}

async function drawSeismogram(box, ev) {
  const canvas = box.querySelector('canvas'), msg = box.querySelector('.seismo-msg');
  let trace;
  try { trace = await loadSeismogram(BCIP, ev.time, 600); } catch { trace = null; }
  if (!box.isConnected) return;
  if (!trace?.samples.length) { msg.textContent = 'La estación todavía no publica este registro.'; return; }
  msg.remove();

  const dpr = Math.min(2, devicePixelRatio || 1), w = box.clientWidth, h = 170;
  canvas.width = w * dpr; canvas.height = h * dpr; canvas.style.height = `${h}px`;
  const g = canvas.getContext('2d');
  g.scale(dpr, dpr);

  // Min/max per pixel column keeps every peak visible at any width.
  const s = trace.samples, cols = Math.floor(w), per = s.length / cols;
  let mean = 0; for (let i = 0; i < s.length; i++) mean += s[i] / s.length;
  const lo = new Float32Array(cols), hi = new Float32Array(cols);
  let peak = 1;
  for (let c = 0; c < cols; c++) {
    let a = Infinity, b = -Infinity;
    for (let i = Math.floor(c * per); i < Math.floor((c + 1) * per); i++) { const v = s[i] - mean; if (v < a) a = v; if (v > b) b = v; }
    lo[c] = a; hi[c] = b; peak = Math.max(peak, Math.abs(a), Math.abs(b));
  }
  const seconds = s.length / trace.rate, x = t => (t - (trace.start - ev.time) / 1000) / seconds * w;
  const dist = Math.hypot(km(ev.lat, ev.lon, BCIP.lat, BCIP.lon), ev.depth || 10);
  const marks = [['p', dist / 6.5, '#7fd4ff'], ['s', dist / 3.6, '#ffb547']];
  const grad = g.createLinearGradient(0, 0, w, 0);
  grad.addColorStop(0, '#7fd4ff'); grad.addColorStop(0.35, '#ffb547'); grad.addColorStop(1, '#ff6a4a');

  const paint = upto => {
    g.clearRect(0, 0, w, h);
    g.strokeStyle = 'rgba(255,255,255,.06)'; g.beginPath(); g.moveTo(0, h / 2); g.lineTo(w, h / 2); g.stroke();
    for (let m = 1; m < seconds / 60; m++) { // minute ticks
      const tx = m * 60 / seconds * w;
      g.fillStyle = 'rgba(255,255,255,.25)'; g.fillRect(tx, h - 6, 1, 6);
      g.font = '10px Manrope, sans-serif'; g.fillText(`${m} min`, tx + 3, h - 1);
    }
    for (const [, t, color] of marks) { const mx = x(t); if (mx < upto) { g.fillStyle = color; g.globalAlpha = .7; g.fillRect(mx, 0, 1.5, h - 10); g.globalAlpha = 1; } }
    g.strokeStyle = grad; g.lineWidth = 1; g.shadowColor = '#ffb547'; g.shadowBlur = 6;
    g.beginPath();
    for (let c = 0; c < Math.min(cols, upto); c++) {
      const y1 = h / 2 - hi[c] / peak * (h / 2 - 12), y2 = h / 2 - lo[c] / peak * (h / 2 - 12);
      g.moveTo(c + .5, y1); g.lineTo(c + .5, Math.max(y2, y1 + 1));
    }
    g.stroke(); g.shadowBlur = 0;
  };
  if (reduceMotion()) { paint(cols); return; }
  const start = performance.now();
  const step = now => { const t = Math.min(1, (now - start) / 3800); paint(cols * t); if (t < 1 && box.isConnected) requestAnimationFrame(step); };
  new IntersectionObserver(([e], io) => { if (e.isIntersecting) { io.disconnect(); requestAnimationFrame(step); } }, { threshold: .4 }).observe(box);
}
