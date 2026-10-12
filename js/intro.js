// The opening: the real seismogram of the 7.7 draws itself, the words take the hit when the
// S wave arrives, and the screen breaks along a fault whose two sides slide past each other.
// Loaded on its own (no imports) so it runs before the rest of the app.

const root = document.getElementById('intro');
let settle, finish;
// app.js waits on these: start the heavy map once the words have landed, fly in as the screen splits.
window.introSettled = new Promise(r => { settle = r; });
window.introDone = new Promise(r => { finish = r; });

const wait = ms => new Promise(r => setTimeout(r, ms));
const COLORS = ['#7fd4ff', '#a9cfff', '#ffd27a', '#ffb547', '#ff7d4a', '#ff4d3d'];

if (!root || new URLSearchParams(location.search).has('sinintro')) { root?.remove(); settle(); finish(); }
else run();

async function run() {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const stage = root.querySelector('.intro-stage'), canvas = root.querySelector('.intro-trace');
  const title = root.querySelector('.intro-title');
  const letters = [...title.querySelectorAll('.w > span')];
  letters.forEach((l, i) => l.style.setProperty('--r', `${((i * 37) % 21) - 10}deg`));
  root.querySelectorAll('.l2 .w > span').forEach((l, i) => l.style.color = COLORS[i]);
  document.documentElement.classList.add('intro-on');

  let skipped = false;
  const skip = () => { skipped = true; };
  root.addEventListener('pointerdown', skip);
  addEventListener('keydown', skip, { once: true });

  if (reduce) {
    root.classList.add('hit', 'settled');
    settle();
    await wait(1500);
    return crack(true);
  }

  const env = await fetch('data/bcip-envelope.json').then(r => r.json()).then(d => d.env).catch(() => null) || synthetic();
  const N = env.length, amp = env.map(([lo, hi]) => Math.max(-lo, hi));
  const peak = amp.indexOf(Math.max(...amp));
  const onset = Math.max(1, amp.findIndex(a => a > 0.3)); // the S wave, roughly
  const firstMove = Math.max(1, amp.findIndex(a => a > 0.04)); // the P wave
  // Pace the pen so the strong shaking lands about 1.1 s in, then the tail draws quickly.
  const HIT = 1100, DRAW = 2300;
  const indexAt = t => t < HIT ? onset * (t / HIT) : onset + (N - onset) * Math.min(1, (t - HIT) / (DRAW - HIT));

  const ctx = canvas.getContext('2d');
  const dpr = Math.min(2, devicePixelRatio || 1);
  let W = 0, H = 0;
  const size = () => { W = canvas.clientWidth; H = canvas.clientHeight; canvas.width = W * dpr; canvas.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); };
  size();
  addEventListener('resize', size);

  const grad = () => {
    const g = ctx.createLinearGradient(0, 0, W, 0);
    g.addColorStop(0, '#7fd4ff'); g.addColorStop(onset / N, '#ffd27a'); g.addColorStop(peak / N, '#ff4d3d'); g.addColorStop(1, '#ffb547');
    return g;
  };
  function draw(upto) {
    ctx.clearRect(0, 0, W, H);
    const mid = H * 0.5, scale = H * 0.3, n = Math.floor(upto);
    // Baseline still to be written.
    ctx.strokeStyle = 'rgba(127,212,255,.12)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(n / N * W, mid); ctx.lineTo(W, mid); ctx.stroke();
    ctx.strokeStyle = grad(); ctx.lineWidth = Math.max(1, W / N * 0.9);
    ctx.beginPath();
    for (let i = 0; i < n; i++) { const x = i / N * W; ctx.moveTo(x, mid - env[i][1] * scale); ctx.lineTo(x, mid - env[i][0] * scale); }
    ctx.stroke();
    // The pen.
    const x = n / N * W, a = amp[Math.min(N - 1, n)] || 0;
    ctx.fillStyle = '#fff'; ctx.shadowColor = '#ffb547'; ctx.shadowBlur = 18 + a * 30;
    ctx.beginPath(); ctx.arc(x, mid, 3 + a * 4, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
  }

  const start = performance.now();
  let hit = false, pre = false;
  await new Promise(resolve => {
    const step = now => {
      const t = skipped ? DRAW : now - start;
      const i = indexAt(t), a = amp[Math.min(N - 1, Math.floor(i))] || 0;
      draw(i);
      if (!pre && i >= firstMove) { pre = true; root.classList.add('pre'); vibrate(15); }
      if (!hit && i >= onset) {
        hit = true;
        root.classList.add('hit');
        vibrate([70, 40, 140, 40, 220]);
      }
      // The whole screen shakes with the recorded ground motion, plus a colour split on the words.
      const k = hit ? a : a * 0.4;
      stage.style.transform = k > 0.02 ? `translate(${(Math.random() * 2 - 1) * k * 16}px, ${(Math.random() * 2 - 1) * k * 11}px) rotate(${(Math.random() * 2 - 1) * k * 0.9}deg)` : '';
      title.style.setProperty('--ab', `${(k * 9).toFixed(1)}px`);
      if (t < DRAW) requestAnimationFrame(step);
      else { stage.style.transform = ''; title.style.setProperty('--ab', '0px'); resolve(); }
    };
    requestAnimationFrame(step);
  });
  if (!hit) root.classList.add('hit');
  root.classList.add('settled');
  settle();
  // Hold the title while the map builds behind it (that work would make the split stutter),
  // at least 1.2 s and at most 3.2 s, or until someone taps.
  for (let w = 0; !skipped && w < 3200 && (w < 1200 || !window.introMapReady); w += 50) await wait(50);
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  crack(skipped);
}

/** A jagged fault line across the screen; the two halves slide apart along it. */
async function crack(fast) {
  const pts = [];
  const steps = 16;
  for (let i = 0; i <= steps; i++) {
    const x = (i / steps) * 110 - 5;
    const y = 57 - (i / steps) * 14 + (i % 2 ? 1 : -1) * (1.2 + ((i * 53) % 7) * 0.5);
    pts.push([x, y]);
  }
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'intro-crack');
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.innerHTML = `<polyline points="${pts.map(p => p.join(',')).join(' ')}" pathLength="1"/>`;
  root.append(svg);
  vibrate(fast ? 30 : [30, 30, 90]);
  await wait(fast ? 120 : 340);

  const stage = root.querySelector('.intro-stage');
  const canvas = stage.querySelector('canvas');
  root.classList.add('settled', 'still');
  const other = stage.cloneNode(true);
  other.querySelector('canvas').getContext('2d').drawImage(canvas, 0, 0);
  root.insertBefore(other, svg);
  const poly = side => `polygon(${side === 'top'
    ? ['0% 0%', '100% 0%', ...[...pts].reverse().map(([x, y]) => `${x}% ${y}%`)].join(',')
    : [...pts.map(([x, y]) => `${x}% ${y}%`), '100% 100%', '0% 100%'].join(',')})`;
  stage.style.clipPath = poly('top');
  other.style.clipPath = poly('bottom');
  root.classList.add('split');
  finish();
  // Strike-slip: one side slides left, the other right, then both drop away.
  const ms = fast ? 650 : 1100, easing = 'cubic-bezier(.55,0,.2,1)';
  const a = stage.animate([{ transform: 'none', opacity: 1 }, { transform: 'translate(-4vw, -1.5vh)', opacity: 1, offset: 0.35 }, { transform: 'translate(-30vw, -70vh) rotate(-4deg)', opacity: 0 }], { duration: ms, easing, fill: 'forwards' });
  other.animate([{ transform: 'none', opacity: 1 }, { transform: 'translate(4vw, 1.5vh)', opacity: 1, offset: 0.35 }, { transform: 'translate(30vw, 70vh) rotate(3deg)', opacity: 0 }], { duration: ms, easing, fill: 'forwards' });
  svg.animate([{ opacity: 1 }, { opacity: 0 }], { duration: ms * 0.5, delay: ms * 0.25, fill: 'forwards' });
  await a.finished.catch(() => {});
  root.remove();
  document.documentElement.classList.remove('intro-on');
}

function vibrate(p) { try { navigator.vibrate?.(p); } catch { /* not allowed before a tap on some phones */ } }

/** If the recording can't load: quiet, a P wave, then strong shaking that rings down. */
function synthetic() {
  return Array.from({ length: 360 }, (_, i) => {
    const a = i < 37 ? 0.01 : i < 90 ? 0.06 + Math.random() * 0.05 : Math.exp(-((i - 120) ** 2) / 2500) * 0.9 + 0.05;
    return [-a * (0.6 + Math.random() * 0.4), a * (0.6 + Math.random() * 0.4)];
  });
}
