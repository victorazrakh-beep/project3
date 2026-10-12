// "Ciudades": how hard it shook in each town, and how many people felt each level.
import { $, esc, num, int, compact, roman, mmiInfo, mmiColor, reveal, haptic } from '../util.js';
import { showCities, focusPoint } from '../map.js';

const PAGE = 40;
const fold = s => s.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');

export function render({ ev }) {
  const exp = ev.exposure;
  const levels = exp ? exp.mmi.map((m, i) => ({ m, people: exp.aggregated_exposure[i] })).filter(l => l.m >= 3 && l.people > 0).reverse() : [];
  const most = Math.max(1, ...levels.map(l => l.people));
  const felt = levels.filter(l => l.m >= 4).reduce((a, l) => a + l.people, 0);
  return `
  <section class="hero reveal">
    <p class="kicker">Ciudades</p>
    <h1 class="title">Dónde se sintió más</h1>
    <p class="lead">Intensidad estimada por el USGS en cada pueblo y ciudad. Toca uno para verlo en el mapa.</p>
  </section>

  ${levels.length ? `
  <section class="card reveal">
    <h2>Cuánta gente lo sintió</h2>
    <p class="muted small"><b class="em" data-count="${felt}" data-compact="1">0</b> personas sintieron al menos una sacudida ligera.</p>
    <div class="exposure">
      ${levels.map(l => `
      <div class="exp-row">
        <span class="exp-level" style="--c:${mmiColor(l.m)}">${roman(l.m)}</span>
        <span class="exp-name">${esc(mmiInfo(l.m).name)}</span>
        <span class="bar"><span style="--w:${Math.max(1.5, l.people / most * 100)}%;--c:${mmiColor(l.m)}"></span></span>
        <b class="exp-n">${compact(l.people)}</b>
      </div>`).join('')}
    </div>
  </section>` : ''}

  <section class="card reveal">
    <h2>Pueblos y ciudades</h2>
    ${ev.cities?.length ? `
    <input id="filter" class="input" type="search" placeholder="Buscar en ${int(ev.cities.length)} lugares" autocomplete="off" aria-label="Buscar lugar">
    <div class="city-list" id="cities"></div>
    <button class="btn wide ghost" id="more" hidden>Ver más</button>`
    : `<p class="muted">El USGS todavía no publica la lista de ciudades para este sismo. Suele aparecer en la primera hora.</p>`}
  </section>`;
}

function rowHTML(c, i) {
  return `
  <button class="city" data-lon="${c.lon}" data-lat="${c.lat}" style="--i:${i % PAGE}">
    <span class="rank">${i + 1}</span>
    <span class="grow"><b>${esc(c.name)}</b>${c.iscap ? '<em class="cap">capital</em>' : ''}<small>${c.pop >= 1000 ? `${compact(c.pop)} habitantes` : ''}</small></span>
    <span class="city-bar"><span style="--w:${c.mmi / 10 * 100}%;--c:${mmiColor(c.mmi)}"></span></span>
    <b class="city-mmi" style="color:${mmiColor(c.mmi)}">${num(c.mmi, 1)}</b>
  </button>`;
}

export function mount(el, { ev }) {
  reveal(el);
  showCities(ev.cities);
  const list = $('#cities', el);
  if (!list) return;
  let rows = ev.cities, shown = 0;
  const more = $('#more', el);
  const draw = (reset) => {
    if (reset) { list.innerHTML = ''; shown = 0; }
    const next = rows.slice(shown, shown + PAGE);
    list.insertAdjacentHTML('beforeend', next.map((c, i) => rowHTML(c, shown + i)).join(''));
    shown += next.length;
    more.hidden = shown >= rows.length;
    if (!rows.length) list.innerHTML = '<p class="muted">Ningún lugar coincide.</p>';
  };
  draw(true);
  more.addEventListener('click', () => draw(false));
  $('#filter', el).addEventListener('input', e => {
    const q = fold(e.target.value.trim());
    rows = q ? ev.cities.filter(c => fold(c.name).includes(q)) : ev.cities;
    draw(true);
  });
  list.addEventListener('click', e => {
    const b = e.target.closest('.city');
    if (!b) return;
    haptic();
    focusPoint(+b.dataset.lon, +b.dataset.lat, 10);
  });
}

export function unmount() { showCities([]); }
