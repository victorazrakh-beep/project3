// Real seismograms from the EarthScope (IRIS) archive: fetch miniSEED and decode Steim-1/2.

const DATASELECT = 'https://service.earthscope.org/fdsnws/dataselect/1/query';

/** Station BCIP (Isla Barro Colorado, in the Panama Canal) of the Caribbean network, operated with the USGS. */
export const BCIP = { net: 'CU', sta: 'BCIP', loc: '00', cha: 'BHZ', lat: 9.1665, lon: -79.8373, name: 'Isla Barro Colorado, Panamá' };

const cache = new Map();
/** Fetched once per station and window (the home screen and Ciencia share it). */
export function loadSeismogram(station, startMs, seconds) {
  const key = `${station.sta}-${startMs}-${seconds}`;
  if (!cache.has(key)) cache.set(key, fetchSeismogram(station, startMs, seconds).catch(e => { cache.delete(key); throw e; }));
  return cache.get(key);
}
async function fetchSeismogram(station, startMs, seconds) {
  const iso = t => new Date(t).toISOString().slice(0, 19);
  const q = new URLSearchParams({ net: station.net, sta: station.sta, loc: station.loc, cha: station.cha,
    starttime: iso(startMs), endtime: iso(startMs + seconds * 1000) });
  const res = await fetch(`${DATASELECT}?${q}`);
  if (res.status === 204 || !res.ok) return null;
  return decode(await res.arrayBuffer());
}

/** Returns { start, rate, samples: Float32Array } stitched from every record (assumes no gaps). */
export function decode(buf) {
  const view = new DataView(buf);
  const chunks = [];
  let offset = 0, start = null, rate = 0;
  while (offset + 64 <= buf.byteLength) {
    const nsamp = view.getUint16(offset + 30);
    const factor = view.getInt16(offset + 32), mult = view.getInt16(offset + 34);
    rate = factor > 0 ? (mult > 0 ? factor * mult : -factor / mult) : (mult > 0 ? -mult / factor : 1 / (factor * mult));
    const dataStart = view.getUint16(offset + 44);
    const b1000 = view.getUint16(offset + 46);
    const encoding = view.getUint8(offset + b1000 + 4);
    const recLen = 2 ** view.getUint8(offset + b1000 + 6);
    if (start === null) {
      const year = view.getUint16(offset + 20), day = view.getUint16(offset + 22);
      start = Date.UTC(year, 0, day, view.getUint8(offset + 24), view.getUint8(offset + 25), view.getUint8(offset + 26)) + view.getUint16(offset + 28) / 10;
    }
    if (encoding === 10 || encoding === 11) chunks.push(steim(view, offset + dataStart, offset + recLen, nsamp, encoding === 11));
    offset += recLen;
  }
  const total = chunks.reduce((a, c) => a + c.length, 0);
  const samples = new Float32Array(total);
  let i = 0;
  for (const c of chunks) { samples.set(c, i); i += c.length; }
  return { start, rate, samples };
}

function steim(view, from, to, nsamp, v2) {
  const diffs = [];
  let x0 = 0;
  for (let frame = from; frame + 64 <= to && diffs.length < nsamp + 1; frame += 64) {
    const ctrl = view.getUint32(frame);
    for (let w = 1; w < 16; w++) {
      const word = frame + w * 4, c = (ctrl >>> (30 - 2 * w)) & 3;
      if (frame === from && w === 1) { x0 = view.getInt32(word); continue; }
      if (frame === from && w === 2) continue; // reverse integration constant
      if (c === 0) continue;
      if (c === 1) { for (let b = 0; b < 4; b++) diffs.push(view.getInt8(word + b)); continue; }
      const v = view.getUint32(word);
      if (!v2) {
        if (c === 2) { diffs.push(view.getInt16(word), view.getInt16(word + 2)); } else diffs.push(view.getInt32(word));
        continue;
      }
      const dnib = v >>> 30;
      const unpack = (count, bits) => {
        for (let k = count - 1; k >= 0; k--) {
          let d = (v >>> (k * bits)) & ((1 << bits) - 1);
          if (d & (1 << (bits - 1))) d -= 1 << bits; // sign-extend
          diffs.push(d);
        }
      };
      if (c === 2) { if (dnib === 1) unpack(1, 30); else if (dnib === 2) unpack(2, 15); else if (dnib === 3) unpack(3, 10); }
      else { if (dnib === 0) unpack(5, 6); else if (dnib === 1) unpack(6, 5); else if (dnib === 2) unpack(7, 4); }
    }
  }
  const out = new Float32Array(nsamp);
  let x = x0;
  for (let i = 0; i < nsamp; i++) { if (i > 0) x += diffs[i] ?? 0; out[i] = x; }
  return out;
}
