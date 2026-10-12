// "Casa": a walk-through damage check with a clear verdict at the top.
import { $, $$, esc, store, haptic, reveal } from '../util.js';

const GROUPS = [
  {
    id: 'ya', tone: 'red', title: 'Antes de entrar',
    note: 'Si encuentras cualquiera de estas, sal, aléjate y no vuelvas a entrar.',
    items: [
      ['gas', 'Olor a gas', 'No enciendas luces, fósforos ni el celular adentro. Si puedes, cierra la llave del tanque y sal.'],
      ['columnas', 'Columnas o vigas rotas', 'Grietas en diagonal o en forma de X, concreto desprendido o varillas de hierro a la vista.'],
      ['inclinada', 'La casa se inclinó o se movió', 'Paredes fuera de plomo, pisos hundidos o la casa separada de su base.'],
      ['cables', 'Cables o chispas', 'Cables caídos, chispas u olor a quemado. Baja el interruptor principal solo si llegas sin pisar agua.'],
    ],
  },
  {
    id: 'experto', tone: 'amber', title: 'Pide que la revise un experto',
    note: 'No es una emergencia, pero un ingeniero o la autoridad local debe verlo antes de que sigas usando ese espacio.',
    items: [
      ['grietas', 'Grietas anchas en paredes', 'Más anchas que una moneda de canto (unos 3 mm), sobre todo cerca de puertas y ventanas.'],
      ['puertas', 'Puertas o ventanas que ya no cierran', 'Señal de que el marco o la pared se deformaron.'],
      ['escaleras', 'Escaleras agrietadas o separadas', 'Revisa dónde la escalera se une al piso y a la pared.'],
      ['techo', 'Techo o cielo raso flojo', 'Láminas corridas, cielo raso combado o piezas colgando.'],
      ['tanque', 'Tanque de agua o muro movido', 'Tanques elevados desplazados, muros perimetrales inclinados o bardas agrietadas.'],
    ],
  },
  {
    id: 'vigila', tone: 'calm', title: 'Revisa y vigila',
    note: 'Normalmente no es peligroso, pero vale la pena revisarlo después de cada réplica fuerte.',
    items: [
      ['repello', 'Fisuras finas en el repello', 'Líneas delgadas como un cabello en la pintura o el acabado.'],
      ['agua', 'Fugas de agua', 'Manchas húmedas, goteos o baja presión pueden indicar tuberías rotas.'],
      ['muebles', 'Muebles y objetos altos', 'Baja o asegura lo que pueda caer en una réplica: espejos, repisas, televisores.'],
      ['salida', 'Rutas de salida', 'Que las puertas abran y los pasillos estén despejados.'],
    ],
  },
];

const READY = [
  'Ten una mochila con agua, linterna, botiquín, medicinas, copias de documentos y un cargador.',
  'Acuerda con tu familia un punto de encuentro fuera de casa.',
  'Durante una réplica: agáchate, cúbrete y sujétate. No corras hacia afuera mientras se mueve.',
  'Usa mensajes de texto en lugar de llamadas para no saturar la red.',
];

export function render({ ev }) {
  const marks = store.get(`onda-casa-${ev.id}`, {});
  return `
  <section class="hero reveal">
    <p class="kicker">Tu casa</p>
    <h1 class="title">Revisa antes de volver</h1>
    <p class="lead">Recorre tu casa con esta lista. Marca cada punto y te diremos qué hacer. Si algo te da mala espina, confía en tu instinto y espera afuera.</p>
  </section>

  <section class="verdict reveal" id="verdict"></section>

  ${GROUPS.map(g => `
  <section class="card check-group tone-${g.tone} reveal">
    <h2>${esc(g.title)}</h2>
    <p class="muted small">${esc(g.note)}</p>
    ${g.items.map(([id, title, text]) => `
    <div class="check ${marks[id] ? `is-${marks[id]}` : ''}" data-id="${id}">
      <div class="check-text"><b>${esc(title)}</b><small>${esc(text)}</small></div>
      <div class="check-btns">
        <button data-mark="ok" aria-pressed="${marks[id] === 'ok'}">Todo bien</button>
        <button data-mark="found" aria-pressed="${marks[id] === 'found'}">Lo encontré</button>
      </div>
    </div>`).join('')}
  </section>`).join('')}

  <section class="card reveal">
    <h2>Para las próximas réplicas</h2>
    <ul class="ticks">${READY.map(t => `<li>${esc(t)}</li>`).join('')}</ul>
    <button class="btn ghost wide" id="reset">Empezar la revisión de nuevo</button>
  </section>

  <section class="card reveal">
    <h2>Guías oficiales</h2>
    <p class="muted small">Esta lista resume los criterios de estas guías. Ante la duda, sigue lo que digan las autoridades.</p>
    <ul class="ticks sources">
      ${ev.inPanama ? `<li><a href="https://www.sinaproc.gob.pa/mochila-de-72-horas-sinaproc/" target="_blank" rel="noopener">SINAPROC: la mochila de 72 horas</a></li>` : ''}
      <li><a href="https://www.cenapred.unam.mx/es/Publicaciones/archivos/486-GUIA_RAPIDA_REVISION_VIVIENDA_TRAS_SISMO.PDF" target="_blank" rel="noopener">CENAPRED: guía rápida para revisar tu vivienda después de un sismo</a></li>
      <li><a href="https://www.fema.gov/sites/default/files/2020-08/fema_earthquakes_fema-p-530-earthquake-safety-at-home-march-2020.pdf" target="_blank" rel="noopener">FEMA P-530: seguridad en casa ante sismos</a> (en inglés)</li>
      <li><a href="https://atcouncil.org/pdfs/rapid.pdf" target="_blank" rel="noopener">ATC-20: evaluación rápida de edificios tras un sismo</a> (en inglés)</li>
      ${ev.inPanama ? `<li><a href="https://superseguros.gob.pa/proteccion-al-consumidor-de-seguros/" target="_blank" rel="noopener">Superintendencia de Seguros: si vas a reclamar a tu seguro</a></li>` : ''}
    </ul>
  </section>`;
}

function verdict(marks) {
  const found = g => g.items.some(([id]) => marks[id] === 'found');
  const total = GROUPS.reduce((a, g) => a + g.items.length, 0);
  const done = Object.keys(marks).length;
  if (found(GROUPS[0])) return ['red', 'Sal y no vuelvas a entrar', 'Encontraste una señal de peligro. Aléjate de la casa y llama al 911 o a las autoridades locales.'];
  if (found(GROUPS[1])) return ['amber', 'Pide una revisión antes de usarla', 'Evita las áreas dañadas y no duermas ahí hasta que un experto la revise.'];
  if (done === total) return ['green', 'No encontraste señales de peligro', 'Sigue atento después de cada réplica fuerte y repite la revisión si notas algo nuevo.'];
  return ['neutral', `Llevas ${done} de ${total}`, 'Empieza por la lista de arriba antes de entrar.'];
}

export function mount(el, { ev }) {
  const key = `onda-casa-${ev.id}`;
  let marks = store.get(key, {});
  const box = $('#verdict', el);
  const paint = () => {
    const [tone, title, text] = verdict(marks);
    box.className = `verdict tone-${tone} reveal in`;
    box.innerHTML = `<span class="verdict-icon"></span><div><b>${esc(title)}</b><small>${esc(text)}</small></div>`;
  };
  paint();
  reveal(el);
  el.addEventListener('click', e => {
    const b = e.target.closest('[data-mark]');
    if (b) {
      const row = b.closest('.check'), id = row.dataset.id;
      marks[id] = marks[id] === b.dataset.mark ? undefined : b.dataset.mark;
      if (!marks[id]) delete marks[id];
      row.className = `check ${marks[id] ? `is-${marks[id]}` : ''}`;
      $$('button', row).forEach(x => x.setAttribute('aria-pressed', marks[id] === x.dataset.mark));
      store.set(key, marks);
      haptic(marks[id] === 'found' ? [20, 40, 20] : 10);
      const before = box.className;
      paint();
      if (box.className !== before) box.animate([{ transform: 'scale(.97)' }, { transform: 'scale(1)' }], { duration: 320, easing: 'cubic-bezier(.2,.9,.3,1.3)' });
    }
    if (e.target.closest('#reset')) {
      marks = {};
      store.set(key, marks);
      $$('.check', el).forEach(r => { r.className = 'check'; $$('button', r).forEach(x => x.setAttribute('aria-pressed', 'false')); });
      paint();
      box.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  });
}
