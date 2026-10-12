// A small 3D building that sways like a real one: the top moves most, at the building's own rhythm.
import { reduceMotion, mmiColor } from './util.js';

const STORY_M = 3;            // metres per floor
const period = n => 0.1 * n;  // rule of thumb: about 0.1 s per floor
/** No practical ceiling on height: the drawing groups floors once there are too many to show one by one. */
export const MAX_FLOORS = 1e9;
const MAX_BLOCKS = 120;       // most floor blocks drawn per frame, however tall the building

/**
 * Draws an isometric tower on a canvas.
 * set({ floors, floor, mmi }) updates it; kick(strength) gives it a jolt (the S wave);
 * onPick(floor) fires when someone taps or drags along the building.
 */
export function createTower(canvas, { onPick } = {}) {
  const ctx = canvas.getContext('2d');
  const state = { floors: 10, floor: 3, mmi: null };
  // Smoothly animated values.
  const anim = { floors: 0, floor: 3, floorV: 0, kick: 0, kickAt: 0 };
  let w = 0, h = 0, raf = 0, last = 0, t0 = performance.now(), visible = true, dirty = true;

  const resize = () => {
    const dpr = Math.min(2, devicePixelRatio || 1);
    w = canvas.clientWidth; h = canvas.clientHeight;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    dirty = true;
  };
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) loop(); });
  io.observe(canvas);

  // Geometry, recomputed each frame from the (animated) floor count.
  function layout(n) {
    const base = h - 34;
    const fh = Math.min(24, (h - 78) / Math.max(n, 4)); // shrinks so any height fits the canvas
    const fw = n <= 2 ? 104 : n <= 6 ? 88 : 70;
    const depth = fw * 0.55;
    return { base, fh, fw, dx: depth * 0.62, dy: depth * 0.36, cx: w * 0.42 - fw / 2 };
  }

  // Lateral offset at a height ratio r (0 = street, 1 = roof): the first-mode shape of a tall building.
  function sway(r, time) {
    const n = Math.max(1, state.floors);
    const T = Math.max(0.42, period(n));
    const shaking = state.mmi ?? 2.5;
    const amp = Math.max(0.6, Math.min(10, (shaking - 2.4) * 1.5)) * (n <= 2 ? 0.35 : n <= 5 ? 0.7 : 1);
    const since = (time - anim.kickAt) / 1000;
    const kick = anim.kick * Math.exp(-since / 1.6) * Math.sin(since * 2 * Math.PI / Math.max(0.5, T * 0.9));
    const shape = 1 - Math.cos(r * Math.PI / 2);
    return shape * (amp * Math.sin(time / 1000 * 2 * Math.PI / T) + kick * 26);
  }

  function draw(time) {
    ctx.clearRect(0, 0, w, h);
    const n = anim.floors, whole = Math.ceil(n - 0.001);
    const L = layout(Math.max(n, 1));
    const color = mmiColor(state.mmi ?? 5);
    const total = Math.max(1, n) * L.fh;

    // Ground: a soft shadow and ripples that grow with the shaking.
    const gx = L.cx + L.fw / 2 + L.dx / 2, gy = L.base - L.dy / 2;
    const glow = ctx.createRadialGradient(gx, gy, 4, gx, gy, L.fw * 1.5);
    glow.addColorStop(0, 'rgba(127,212,255,.16)'); glow.addColorStop(1, 'rgba(127,212,255,0)');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.ellipse(gx, gy, L.fw * 1.5, L.fw * 0.45, 0, 0, Math.PI * 2); ctx.fill();
    if (!reduceMotion()) {
      const strength = Math.min(1, Math.max(0.15, ((state.mmi ?? 3) - 2) / 6) + anim.kick * Math.exp(-(time - anim.kickAt) / 1600));
      for (let k = 0; k < 3; k++) {
        const p = ((time / 2200) + k / 3) % 1;
        ctx.strokeStyle = `rgba(255,181,71,${(1 - p) * 0.35 * strength})`;
        ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.ellipse(gx, gy, L.fw * (0.7 + p * 1.1), L.fw * (0.2 + p * 0.33), 0, 0, Math.PI * 2); ctx.stroke();
      }
    }

    // Tall buildings are drawn in blocks of several floors, so the cost stays flat at any height.
    const g = Math.max(1, Math.ceil(whole / MAX_BLOCKS)), blocks = Math.ceil(whole / g);
    for (let i = 0; i < blocks; i++) {
      const start = i * g, cnt = Math.min(g, whole - start), bh = cnt * L.fh;
      // The newest block drops into place as the count grows.
      const grow = Math.min(1, Math.max(0, (n - start) / cnt));
      const drop = (1 - grow) * -28;
      const r0 = start * L.fh / total, r1 = (start + cnt) * L.fh / total;
      const s0 = sway(r0, time), s1 = sway(r1, time);
      const y0 = L.base - start * L.fh + drop, y1 = y0 - bh;
      const x0 = L.cx + s0, x1 = L.cx + s1;
      const mine = Math.round(anim.floor) > start && Math.round(anim.floor) <= start + cnt;
      ctx.globalAlpha = grow;

      // Side face.
      ctx.fillStyle = mine ? hexA(color, 0.55) : 'rgba(38,58,92,.55)';
      quad(x0 + L.fw, y0, x0 + L.fw + L.dx, y0 - L.dy, x1 + L.fw + L.dx, y1 - L.dy, x1 + L.fw, y1);
      ctx.fill();
      // Front face.
      ctx.fillStyle = mine ? hexA(color, 0.85) : 'rgba(127,212,255,.08)';
      if (mine) { ctx.shadowColor = color; ctx.shadowBlur = 22; }
      quad(x0, y0, x0 + L.fw, y0, x1 + L.fw, y1, x1, y1);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = mine ? 'rgba(255,255,255,.9)' : 'rgba(127,212,255,.45)';
      ctx.lineWidth = mine ? 1.4 : 0.8;
      ctx.stroke();
      quad(x0 + L.fw, y0, x0 + L.fw + L.dx, y0 - L.dy, x1 + L.fw + L.dx, y1 - L.dy, x1 + L.fw, y1);
      ctx.strokeStyle = mine ? 'rgba(255,255,255,.6)' : 'rgba(127,212,255,.28)';
      ctx.stroke();

      // Windows, lit in a fixed pseudo-random pattern.
      if (bh >= 8 && !mine) {
        const cols = L.fw > 80 ? 4 : 3;
        for (let c = 0; c < cols; c++) {
          if (((i * 7 + c * 13) % 5) > 2) continue;
          const u = (c + 0.5) / cols, wx = x0 + (x1 - x0) * 0.5 + u * L.fw - 3, wy = y0 - bh * 0.68;
          ctx.fillStyle = (i * 3 + c) % 4 === 0 ? 'rgba(255,214,140,.65)' : 'rgba(255,214,140,.25)';
          ctx.fillRect(wx, wy, 6, Math.max(2, bh * 0.38));
        }
      }
      // Roof.
      if (i === blocks - 1) {
        quad(x1, y1, x1 + L.fw, y1, x1 + L.fw + L.dx, y1 - L.dy, x1 + L.dx, y1 - L.dy);
        ctx.fillStyle = mine ? hexA(color, 0.7) : 'rgba(127,212,255,.16)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(127,212,255,.5)';
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    // "Tú" tag next to your floor, following its sway.
    const f = Math.min(Math.max(anim.floor, 1), Math.max(n, 1));
    const ry = L.base - (f - 0.5) * L.fh;
    const rs = sway((f - 0.5) * L.fh / total, time);
    const tx = L.cx + rs + L.fw + L.dx + 14, ty = ry - L.dy / 2;
    ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(L.cx + rs + L.fw + L.dx * 0.5, ry - L.dy * 0.25); ctx.lineTo(tx - 4, ty); ctx.stroke();
    const label = state.floors <= 1 ? 'Tú' : `Tú · piso ${state.floor}`;
    ctx.font = '700 13px Manrope, system-ui, sans-serif';
    const lw = ctx.measureText(label).width + 18;
    ctx.fillStyle = color;
    round(tx, ty - 12, lw, 24, 12); ctx.fill();
    ctx.fillStyle = '#0b0f17';
    ctx.fillText(label, tx + 9, ty + 4.5);
  }

  function quad(ax, ay, bx, by, cx, cy, dx, dy) {
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.lineTo(cx, cy); ctx.lineTo(dx, dy); ctx.closePath();
  }
  function round(x, y, rw, rh, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + rw, y, x + rw, y + rh, r); ctx.arcTo(x + rw, y + rh, x, y + rh, r);
    ctx.arcTo(x, y + rh, x, y, r); ctx.arcTo(x, y, x + rw, y, r); ctx.closePath();
  }

  function loop() {
    if (raf) return;
    const step = now => {
      raf = 0;
      if (!canvas.isConnected) return destroy();
      const dt = Math.min(0.05, (now - (last || now)) / 1000);
      last = now;
      if (reduceMotion()) {
        anim.floors = state.floors; anim.floor = state.floor;
        if (dirty) { draw(t0); dirty = false; }
        return;
      }
      // Springs: floors pop in one by one; your floor highlight glides.
      anim.floors += (state.floors - anim.floors) * Math.min(1, dt * 7);
      if (Math.abs(state.floors - anim.floors) < 0.01) anim.floors = state.floors;
      const a = (state.floor - anim.floor) * 180 - anim.floorV * 22;
      anim.floorV += a * dt; anim.floor += anim.floorV * dt;
      draw(now);
      if (visible && !document.hidden) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  }

  // Tap or drag along the building to choose your floor.
  function floorAt(e) {
    const rect = canvas.getBoundingClientRect();
    const L = layout(state.floors);
    const y = e.clientY - rect.top;
    return Math.max(1, Math.min(state.floors, Math.floor((L.base - y) / L.fh) + 1));
  }
  // Mouse: press and drag. Touch: a tap picks the floor, while a swipe scrolls the page as usual.
  let dragging = false;
  canvas.addEventListener('pointerdown', e => {
    dragging = true;
    if (e.pointerType === 'touch') return;
    canvas.setPointerCapture(e.pointerId);
    onPick?.(floorAt(e));
  });
  canvas.addEventListener('pointermove', e => { if (dragging && e.pointerType !== 'touch') onPick?.(floorAt(e)); });
  canvas.addEventListener('pointerup', e => { if (dragging && e.pointerType === 'touch') onPick?.(floorAt(e)); dragging = false; });
  canvas.addEventListener('pointercancel', () => { dragging = false; });

  function destroy() { cancelAnimationFrame(raf); raf = 0; ro.disconnect(); io.disconnect(); }

  resize();
  loop();
  return {
    set(next) {
      Object.assign(state, next);
      state.floors = Math.max(1, Math.min(MAX_FLOORS, Math.round(state.floors)));
      state.floor = Math.max(1, Math.min(state.floors, Math.round(state.floor)));
      dirty = true;
      loop();
    },
    /** A jolt that rings down, like the building catching the S wave. */
    kick(strength = 1) { anim.kick = strength; anim.kickAt = performance.now(); loop(); },
    destroy,
  };
}

/** Building facts shown next to the drawing. */
export function towerFacts(floors, floor) {
  const height = floors * STORY_M;
  // ASCE 7: objects at height z feel up to (1 + 2·z/h) times the ground acceleration.
  const ratio = floors <= 1 ? 1 : 1 + 2 * (floor - 1) / (floors - 1);
  return { height, period: period(floors), ratio };
}

function hexA(hex, a) {
  const v = parseInt(hex.slice(1), 16);
  return `rgba(${v >> 16},${(v >> 8) & 255},${v & 255},${a})`;
}
