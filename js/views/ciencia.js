// "Ciencia": what moved, how deep, how much energy, and how aftershocks fade.
import { $, esc, num, int, compact, reveal, magColor } from '../util.js';

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

  <section class="card reveal">
    <h2>Fuentes</h2>
    <ul class="ticks sources">
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
