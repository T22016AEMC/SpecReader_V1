// v1.4.2 stop 33: the inputs on which vendor/median-select must behave exactly like the npm package median-quickselect 1.0.1 it replaces.
// Deterministic (seeded) so the golden file (tests/fixtures/vendor/medianSelect.golden.json, recorded from median-quickselect 1.0.1 before it was removed) can be re-checked at any time.
export type Arr = number[] | Float64Array | Int32Array;
export interface MedianCase {id: string; make: () => Arr}

function lcg(seed: number) { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }
const fill = (n: number, f: (i: number, r: () => number) => number, seed: number): number[] => { const r = lcg(seed); return Array.from({length: n}, (_, i) => f(i, r)); };

const LENGTHS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 16, 17, 31, 32, 99, 100, 101, 1000, 1001, 4096, 4097];
const KINDS: Record<string, (i: number, r: () => number, n: number) => number> = {
  float: (_i, r) => r() * 2000 - 1000,
  dup4: (_i, r) => Math.floor(r() * 4),          // many duplicates
  dup2: (_i, r) => (r() < 0.5 ? 1 : 2),
  equal: () => 7.25,                              // all equal
  asc: (i) => i * 0.5,
  desc: (i, _r, n) => (n - i) * 0.5,
  organ: (i, _r, n) => Math.min(i, n - 1 - i),    // organ pipe
  zeros: (_i, r) => (r() < 0.5 ? 0 : -0),         // 0 and -0 compare equal: which one is returned depends on the exact swap order
  zeroMix: (_i, r) => { const v = r(); return v < 0.3 ? 0 : v < 0.6 ? -0 : v < 0.8 ? -1 : 1; },
  inf: (_i, r) => { const v = r(); return v < 0.2 ? Infinity : v < 0.4 ? -Infinity : v * 10; },
  nan: (_i, r) => { const v = r(); return v < 0.15 ? NaN : v * 10; },   // NaN breaks the ordering; the result is whatever the fixed comparison sequence gives
  int: (_i, r) => Math.floor(r() * 1e6) - 5e5,
};
export const MEDIAN_CASES: MedianCase[] = [];
let seed = 1;
for (const [kind, f] of Object.entries(KINDS)) for (const n of LENGTHS) {
  const s = seed++;
  MEDIAN_CASES.push({id: `${kind}/n${n}`, make: () => fill(n, (i, r) => f(i, r, n), s)});
  if (kind === 'float' || kind === 'dup4' || kind === 'nan' || kind === 'zeros') MEDIAN_CASES.push({id: `${kind}/n${n}/f64`, make: () => Float64Array.from(fill(n, (i, r) => f(i, r, n), s))});
  if (kind === 'int' || kind === 'dup4') MEDIAN_CASES.push({id: `${kind}/n${n}/i32`, make: () => Int32Array.from(fill(n, (i, r) => f(i, r, n), s))});
}

/** Exact text of a value (keeps -0, NaN, Infinity, undefined apart). */
export const exact = (v: unknown): string => (v === undefined ? 'undefined' : typeof v === 'number' ? (Object.is(v, -0) ? '-0' : String(v)) : JSON.stringify(v));
/** FNV-1a 32-bit of the exact texts of the array after the call (the in-place order). */
export function orderHash(a: ArrayLike<number>): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < a.length; i++) { const t = exact(a[i]) + ','; for (let k = 0; k < t.length; k++) { h ^= t.charCodeAt(k); h = Math.imul(h, 0x01000193) >>> 0; } }
  return h.toString(16).padStart(8, '0');
}
