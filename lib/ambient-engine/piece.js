// piece.js — the deterministic heart of Infinite Ambient.
//
// A "key" is a short string. Hashed, it seeds a small PRNG from which an entire
// *piece* is derived: its root frequency, its interval structure, and — via a
// per-step deterministic RNG — its whole evolution over time. The same key
// always unlocks the same piece, so a key can be shared and recreated exactly.
//
// Deliberately NOT Western-scale music theory. There are no note names, no keys
// in the C-major sense, no 12-tone grid. A piece is a set of frequency *ratios*
// above a (microtonal, continuous) root — built either by equally dividing a
// period into an arbitrary number of steps and stacking a generator (a
// moment-of-symmetry / xenharmonic scale), or from a pool of just-intonation
// ratios reaching into the 7- and 11-limit. Intervals are what matter; the exact
// pitches float off the equal-tempered grid on purpose.
//
// No Web Audio, no DOM here — everything is a pure function of the key, so it is
// all unit-testable under `node --test`.

export function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}
export function lerp(a, b, t) {
  return a + (b - a) * clamp(t, 0, 1);
}

// Stable 32-bit string hash (cyrb-style). Same string → same integer, forever.
export function hashSeed(str) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  const s = String(str);
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h1 ^ h2) >>> 0;
}

function gcd(a, b) {
  while (b) [a, b] = [b, a % b];
  return a;
}

// mulberry32 — a tiny, fast, decent-quality seeded PRNG returning floats in [0,1).
export function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A PRNG seeded by a key string or an integer.
export function makeRng(seed) {
  return mulberry32(typeof seed === "number" ? seed >>> 0 : hashSeed(seed));
}

// A PRNG for one specific step of the timeline. Positional, so step N is the same
// whether you reach it fresh or after a pause — the evolution is reproducible
// without threading any running state through the scheduler.
export function stepRng(seedInt, step) {
  return mulberry32(((seedInt >>> 0) ^ Math.imul(step + 1, 2654435761)) >>> 0);
}

// Equal divisions of the period to draw from (mostly non-12 — that's the point).
const EDO_CHOICES = [5, 7, 9, 10, 11, 13, 14, 17, 19];
// Just-intonation ratios within an octave, mixing 3-, 5-, 7- and 11-limit — the
// 7/6, 11/9, 11/8, 7/5, 11/7 members are the microtonal, non-Western colours.
const JUST_POOL = [
  9 / 8, 8 / 7, 7 / 6, 6 / 5, 11 / 9, 5 / 4, 9 / 7, 4 / 3, 11 / 8,
  7 / 5, 3 / 2, 11 / 7, 8 / 5, 5 / 3, 7 / 4, 11 / 6, 15 / 8, 13 / 7,
];

// Build the complete, deterministic specification of a piece from its key.
export function buildPiece(key) {
  const seedInt = hashSeed(key);
  const rng = mulberry32(seedInt);

  // Root: low and continuous — a microtonal fundamental, not snapped to A440.
  const rootHz = 41 * Math.pow(2, rng() * 0.95); // ~41 Hz … ~79 Hz

  // Period of equivalence: usually the octave, sometimes a *stretched* octave
  // (slow, shimmering mistuning) and occasionally the tritave (3/1, the
  // Bohlen-Pierce world — no octaves at all).
  let period;
  const pr = rng();
  if (pr < 0.66) period = 2.0;
  else if (pr < 0.9) period = 2.0 * Math.pow(2, (rng() - 0.5) * 0.06); // ±~2%
  else period = 3.0;

  // Interval set.
  const mode = rng() < 0.6 ? "edo" : "just";
  let intervals;
  if (mode === "edo") {
    const edo = EDO_CHOICES[Math.floor(rng() * EDO_CHOICES.length)];
    // Stack a generator near a chosen consonance, modulo the period — a
    // moment-of-symmetry scale that stays coherent in any division.
    const targets = [3 / 2, 4 / 3, 5 / 4, 7 / 4, 5 / 3];
    const target = targets[Math.floor(rng() * targets.length)];
    let g = Math.round((edo * Math.log(target)) / Math.log(period));
    g = ((g % edo) + edo) % edo || 1;
    // Make the generator coprime to the division so stacking it visits every
    // degree — otherwise it collapses into a tiny subgroup (e.g. 7 over 14).
    while (gcd(g, edo) !== 1) g = (g % edo) + 1;
    const want = Math.min(4 + Math.floor(rng() * 4), edo); // 4..7 tones
    const degs = new Set([0]);
    let cur = 0, guard = 0;
    while (degs.size < want && guard++ < edo * 2) {
      cur = (cur + g) % edo;
      degs.add(cur);
    }
    intervals = [...degs].sort((a, b) => a - b).map((d) => Math.pow(period, d / edo));
  } else {
    const pool = [...JUST_POOL];
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const count = 3 + Math.floor(rng() * 4); // 3..6 (+ the root)
    const chosen = [1, ...pool.slice(0, count).filter((r) => r < period)];
    intervals = chosen.sort((a, b) => a - b).filter((v, i, arr) => i === 0 || v - arr[i - 1] > 1e-6);
  }
  if (Math.abs(intervals[0] - 1) > 1e-9) intervals = [1, ...intervals];

  // Character — starting values for the live controls, so each key arrives with
  // its own temperament. The listener can still move every slider afterwards.
  const character = {
    motion: 0.2 + rng() * 0.5,
    shimmer: 0.2 + rng() * 0.6,
    brightness: 0.28 + rng() * 0.55,
    space: 0.55 + rng() * 0.4,
    pace: 0.18 + rng() * 0.34,
  };

  return { key: String(key), seedInt, rootHz, period, intervals, mode, character };
}

// The frequency at an integer index that walks up through the interval set,
// wrapping into successive periods. Negative indices reach below the root.
export function freqAt(piece, index) {
  const n = piece.intervals.length;
  const p = Math.floor(index / n);
  const r = piece.intervals[((index % n) + n) % n];
  return piece.rootHz * Math.pow(piece.period, p) * r;
}

// A flat, ascending list of frequencies spanning [loPeriods, hiPeriods) periods —
// the pool the pads, bells, and arpeggios draw pitches from.
export function gamutFreqs(piece, loPeriods = 0, hiPeriods = 3) {
  const out = [];
  for (let p = loPeriods; p < hiPeriods; p++) {
    const base = piece.rootHz * Math.pow(piece.period, p);
    for (const r of piece.intervals) out.push(base * r);
  }
  return out.sort((a, b) => a - b);
}

// Readable, shareable random key: a couple of coined syllable-words plus two
// digits. Uses Math.random (a *new* key is meant to be unpredictable); once
// created it hashes deterministically like any other key.
const ONSET = ["v", "s", "th", "m", "k", "dr", "l", "n", "gl", "r", "br", "z", "ph", "t"];
const NUCLEUS = ["a", "e", "i", "o", "u", "ae", "ei", "au", "ia"];
const CODA = ["l", "n", "r", "th", "m", "sk", "ff", "ll", "st", ""];
// Coined words are shared, so re-roll any that land on something we'd rather not
// hand someone. Small, intentionally coarse substring block.
const BLOCK = ["sex", "cum", "fuk", "fuc", "ass", "tit", "kkk", "nig", "fag"];
function coin(rand) {
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  for (let tries = 0; tries < 8; tries++) {
    const w = pick(ONSET) + pick(NUCLEUS) + pick(CODA);
    if (!BLOCK.some((b) => w.includes(b))) return w;
  }
  return "lum";
}
export function randomKey(rand = Math.random) {
  const digits = String(10 + Math.floor(rand() * 90));
  return `${coin(rand)}-${coin(rand)}-${digits}`;
}
