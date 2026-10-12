// Sharing a result: WhatsApp, an Instagram-story image, a link that reopens the same result,
// and the phone's own share menu. The story image is drawn here on a canvas.
import { esc, num, int, mmiInfo, mmiColor, MMI, haptic, placeES } from './util.js';

const W = 1080, H = 1920;

/** Link that reopens this exact result (the point is rounded to ~100 m). */
export function resultLink(ev, spot, choice) {
  const q = new URLSearchParams({ lat: spot.lat.toFixed(3), lon: spot.lon.toFixed(3) });
  if (spot.name) q.set('n', spot.name);
  if (choice.place !== 'casa') q.set('p', choice.place);
  if (choice.place === 'edificio') { q.set('f', choice.floor); q.set('F', choice.floors); }
  if (choice.ground !== 'nose') q.set('g', choice.ground);
  const e = new URLSearchParams(location.search).get('e');
  return `${location.origin}${location.pathname}${e ? `?e=${encodeURIComponent(e)}` : ''}#/tu?${q}`;
}

/** Opens the share sheet for a result. */
export function openShare({ ev, total, spot, choice, distance }) {
  const info = mmiInfo(total);
  const where = spot.name || 'donde yo estaba';
  const text = `Sentí el sismo M${num(ev.mag, 1)} de ${placeES(ev.place).split(', ').pop()} con intensidad ${num(total, 1)} (${info.name.toLowerCase()}) en ${where}. ¿Y tú?`;
  const url = resultLink(ev, spot, choice);
  let file = null;

  // On phones the browser can't write to the gallery by itself: the share menu is the way in ("Guardar imagen" on iPhone, Fotos/Galería on Android).
  const phone = !!navigator.canShare && matchMedia('(pointer: coarse)').matches;
  const box = document.createElement('div');
  box.className = 'sheet-backdrop share';
  box.innerHTML = `
    <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="share-title">
      <div class="sheet-head"><h2 id="share-title">Compartir mi resultado</h2><button class="link" data-close>Cerrar</button></div>
      <div class="sheet-body">
        <div class="share-preview"><div class="share-ph"></div></div>
        <div class="share-grid">
          ${btn('wa', 'WhatsApp', ICONS.wa)}
          ${btn('ig', 'Historia de Instagram', ICONS.ig)}
          ${btn('copy', 'Copiar enlace', ICONS.link)}
          ${btn('save', phone ? 'Guardar en galería' : 'Guardar imagen', ICONS.save)}
          ${navigator.share ? btn('more', 'Más opciones', ICONS.more) : ''}
        </div>
        <p class="muted small share-note">El enlace abre este mismo resultado: tu punto aproximado (unos 100 m), el piso y el suelo que elegiste.</p>
      </div>
    </div>`;
  document.body.append(box);
  requestAnimationFrame(() => box.classList.add('open'));
  const close = () => { box.classList.remove('open'); setTimeout(() => box.remove(), 320); removeEventListener('keydown', onKey); };
  const onKey = e => { if (e.key === 'Escape') close(); };
  addEventListener('keydown', onKey);

  // Draw the story image straight away, so the Instagram button can share it inside the tap.
  const ready = storyImage({ ev, total, spot, choice, distance }).then(blob => {
    file = new File([blob], 'onda-mi-intensidad.png', { type: 'image/png' });
    const img = new Image();
    img.src = URL.createObjectURL(blob);
    img.alt = 'Vista previa de la imagen para compartir';
    box.querySelector('.share-preview').replaceChildren(img);
    return file;
  }).catch(() => null);

  box.addEventListener('click', async e => {
    if (e.target === box || e.target.closest('[data-close]')) return close();
    const b = e.target.closest('[data-act]');
    if (!b) return;
    haptic(10);
    const act = b.dataset.act;
    if (act === 'wa') {
      open(`https://wa.me/?text=${encodeURIComponent(`${text}\n${url}`)}`, '_blank', 'noopener');
    } else if (act === 'copy') {
      try { await navigator.clipboard.writeText(url); flash(b, '¡Copiado!'); } catch { prompt('Copia este enlace:', url); }
    } else if (act === 'more') {
      navigator.share({ title: 'Mi intensidad · Onda', text, url }).catch(() => {});
    } else if (act === 'ig' || act === 'save') {
      const f = file || await ready;
      if (!f) return flash(b, 'No se pudo crear');
      // On phones the share menu lists Instagram → Historia and Guardar imagen; elsewhere the file downloads.
      if (navigator.canShare?.({ files: [f] }) && (act === 'ig' || phone)) {
        // "Guardar en galería": the share menu offers Guardar imagen / Fotos. If sharing fails (not cancelled), fall back to a download.
        navigator.share({ files: [f] }).catch(err => { if (err?.name !== 'AbortError') download(f, b, act); });
      } else {
        download(f, b, act);
      }
    }
  });
}

function download(f, b, act) {
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(f), download: f.name });
  document.body.append(a); a.click(); a.remove();
  flash(b, act === 'ig' ? 'Imagen guardada: súbela a tu historia' : 'Imagen guardada');
}

const btn = (act, label, icon) => `<button class="share-btn" data-act="${act}"><span class="share-ic ic-${act}">${icon}</span><span class="share-lbl">${esc(label)}</span></button>`;
function flash(b, msg) {
  const l = b.querySelector('.share-lbl'), old = l.textContent;
  l.textContent = msg; b.classList.add('done');
  setTimeout(() => { l.textContent = old; b.classList.remove('done'); }, 2200);
}

const ICONS = {
  wa: '<svg viewBox="0 0 24 24" width="26" height="26"><path d="M12 3a9 9 0 0 0-7.8 13.5L3 21l4.6-1.2A9 9 0 1 0 12 3z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M8.8 8.2c.2-.4.5-.4.8-.4h.5c.2 0 .4 0 .5.4l.7 1.7c.1.2 0 .4-.1.6l-.5.6c-.1.1-.2.3 0 .5.4.7 1.6 2 2.9 2.5.2.1.4 0 .5-.1l.6-.7c.2-.2.4-.2.6-.1l1.6.8c.2.1.4.2.4.4 0 .5-.2 1.2-.7 1.5-.6.4-1.5.6-2.6.2-2.1-.8-4-2.6-4.9-4.6-.5-1-.5-2.2.2-3.3z" fill="currentColor"/></svg>',
  ig: '<svg viewBox="0 0 24 24" width="26" height="26"><rect x="3" y="3" width="18" height="18" rx="5.5" fill="none" stroke="currentColor" stroke-width="1.9"/><circle cx="12" cy="12" r="4.2" fill="none" stroke="currentColor" stroke-width="1.9"/><circle cx="17.4" cy="6.6" r="1.2" fill="currentColor"/></svg>',
  link: '<svg viewBox="0 0 24 24" width="26" height="26"><path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1.2 1.2M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1.2-1.2" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>',
  save: '<svg viewBox="0 0 24 24" width="26" height="26"><path d="M12 4v11m0 0l-4.5-4.5M12 15l4.5-4.5M5 19h14" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  more: '<svg viewBox="0 0 24 24" width="26" height="26"><circle cx="5.5" cy="12" r="1.8" fill="currentColor"/><circle cx="12" cy="12" r="1.8" fill="currentColor"/><circle cx="18.5" cy="12" r="1.8" fill="currentColor"/></svg>',
};

// ---- The story image ----
let envelope;
const getEnvelope = () => (envelope ||= fetch('data/bcip-envelope.json').then(r => r.json()).then(d => d.env).catch(() => null));

async function storyImage({ ev, total, spot, choice, distance }) {
  await Promise.all([
    document.fonts?.load('800 120px "Bricolage Grotesque"'), document.fonts?.load('700 40px "Manrope"'), document.fonts?.load('500 40px "Manrope"'),
  ].map(p => p?.catch?.(() => {})));
  const env = await getEnvelope();
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const color = mmiColor(total), info = mmiInfo(total);
  const D = '"Bricolage Grotesque", "Avenir Next", system-ui, sans-serif', B = 'Manrope, system-ui, sans-serif';

  // Background: deep night with a glow in the intensity color.
  g.fillStyle = '#05070c'; g.fillRect(0, 0, W, H);
  let rg = g.createRadialGradient(W / 2, 1000, 40, W / 2, 1000, 900);
  rg.addColorStop(0, hexA(color, 0.28)); rg.addColorStop(0.55, 'rgba(14,23,41,.6)'); rg.addColorStop(1, 'rgba(5,7,12,0)');
  g.fillStyle = rg; g.fillRect(0, 0, W, H);

  // The real seismogram of the quake, faint, across the lower part.
  if (env) {
    const mid = 1000, sc = 300;
    const lg = g.createLinearGradient(0, 0, W, 0);
    lg.addColorStop(0, 'rgba(127,212,255,.55)'); lg.addColorStop(0.4, 'rgba(255,181,71,.55)'); lg.addColorStop(1, 'rgba(255,77,61,.35)');
    g.globalAlpha = 0.32; g.strokeStyle = lg; g.lineWidth = W / env.length * 0.8;
    g.beginPath();
    env.forEach(([lo, hi], i) => { const x = i / env.length * W; g.moveTo(x, mid - hi * sc); g.lineTo(x, mid - lo * sc); });
    g.stroke(); g.globalAlpha = 1;
  }

  // Header: brand and quake.
  g.save(); g.translate(90, 120);
  g.lineWidth = 9; g.lineCap = 'round'; g.lineJoin = 'round';
  const wg = g.createLinearGradient(0, 0, 90, 0);
  wg.addColorStop(0, '#7fd4ff'); wg.addColorStop(0.55, '#ffb547'); wg.addColorStop(1, '#ff4d3d');
  g.strokeStyle = wg;
  g.beginPath(); [[0, 50], [15, 50], [24, 22], [36, 75], [48, 36], [57, 50], [80, 50]].forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke();
  g.restore();
  g.fillStyle = '#eef2fb'; g.font = `800 64px ${D}`; g.fillText('Onda', 196, 192);
  g.textAlign = 'right'; g.fillStyle = '#8d97ad'; g.font = `700 34px ${B}`;
  g.fillText(`SISMO M${num(ev.mag, 1)} · ${new Date(ev.time).toLocaleDateString('es-PA', { day: 'numeric', month: 'short', year: 'numeric' }).toUpperCase()}`, W - 90, 186);
  g.textAlign = 'left';

  // Title.
  g.fillStyle = '#ffb547'; g.font = `700 36px ${B}`; spaced(g, 'LO QUE SENTÍ', 90, 380, 8);
  g.fillStyle = '#eef2fb'; g.font = `800 92px ${D}`;
  wrap(g, spot.name || 'Donde yo estaba', 90, 480, W - 180, 96, 2);

  // Gauge.
  const cx = W / 2, cy = 1010, R = 280;
  const a0 = -210 * Math.PI / 180, a1 = 30 * Math.PI / 180;
  g.lineCap = 'butt'; g.lineWidth = 40;
  MMI.slice(1).forEach((m, i) => {
    const s = a0 + (a1 - a0) * i / 10 + 0.02, e = a0 + (a1 - a0) * (i + 1) / 10 - 0.02;
    g.strokeStyle = m.color; g.globalAlpha = i + 1 <= Math.round(total) ? 1 : 0.28;
    g.beginPath(); g.arc(cx, cy, R, s, e); g.stroke();
  });
  g.globalAlpha = 1;
  const an = a0 + (a1 - a0) * (Math.max(1, Math.min(10, total)) - 1) / 9;
  g.strokeStyle = '#fff'; g.lineWidth = 12; g.lineCap = 'round';
  g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(an) * (R - 70), cy + Math.sin(an) * (R - 70)); g.stroke();
  g.fillStyle = '#fff'; g.beginPath(); g.arc(cx, cy, 22, 0, Math.PI * 2); g.fill();

  // The number.
  g.textAlign = 'center';
  g.shadowColor = color; g.shadowBlur = 80;
  g.fillStyle = color; g.font = `800 230px ${D}`; g.fillText(num(total, 1), cx, cy + 225);
  g.shadowBlur = 0;
  g.fillStyle = '#8d97ad'; g.font = `700 34px ${B}`; spaced(g, 'INTENSIDAD', cx, cy + 285, 10, true);
  g.fillStyle = color; g.font = `800 84px ${D}`; g.fillText(info.name, cx, cy + 390);
  g.fillStyle = '#c3cadb'; g.font = `500 38px ${B}`;
  wrap(g, info.text, cx, cy + 455, W - 200, 50, 2, true);

  // Details.
  const bits = [`a ${int(distance)} km del epicentro`];
  if (choice.place === 'edificio') bits.push(`piso ${choice.floor} de ${choice.floors}`);
  else if (choice.place === 'afuera') bits.push('al aire libre');
  else if (choice.place === 'vehiculo') bits.push('en un carro');
  g.fillStyle = '#eef2fb'; g.font = `700 36px ${B}`;
  g.fillText(bits.join('  ·  '), cx, 1612);
  g.fillStyle = '#8d97ad'; g.font = `600 34px ${B}`;
  g.fillText(`La onda más fuerte llegó a los ${int(Math.hypot(distance, ev.depth || 10) / 3.6)} segundos`, cx, 1662);

  // Footer.
  g.fillStyle = '#ffb547'; g.font = `800 50px ${D}`; g.fillText('¿Y tú? Calcula el tuyo', cx, 1745);
  g.fillStyle = '#8d97ad'; g.font = `600 32px ${B}`; g.fillText(`${location.host}${location.pathname.replace(/\/$/, '')}`, cx, 1800);
  g.font = `700 30px ${B}`; g.fillStyle = '#6d7891'; g.fillText('Hecho por vahprojects', cx, 1858);
  g.textAlign = 'left';

  return new Promise((res, rej) => c.toBlob(b => (b ? res(b) : rej(new Error('no image'))), 'image/png'));
}

function spaced(g, text, x, y, gap, center) {
  const w = [...text].reduce((a, ch) => a + g.measureText(ch).width + gap, -gap);
  let px = center ? x - w / 2 : x;
  const align = g.textAlign; g.textAlign = 'left';
  for (const ch of text) { g.fillText(ch, px, y); px += g.measureText(ch).width + gap; }
  g.textAlign = align;
}
function wrap(g, text, x, y, max, lh, lines, center) {
  const words = text.split(' ');
  let line = '', n = 0;
  for (let i = 0; i < words.length; i++) {
    const test = line ? `${line} ${words[i]}` : words[i];
    if (g.measureText(test).width > max && line) {
      if (n === lines - 1) { g.fillText(`${line}…`, x, y + n * lh); return; }
      g.fillText(line, x, y + n * lh); n++; line = words[i];
    } else line = test;
  }
  g.fillText(line, x, y + n * lh);
  void center;
}
function hexA(hex, a) {
  const v = parseInt(hex.slice(1), 16);
  return `rgba(${v >> 16},${(v >> 8) & 255},${v & 255},${a})`;
}
