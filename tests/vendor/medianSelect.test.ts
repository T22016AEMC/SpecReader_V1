import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {describe, expect, it} from 'vitest';
import selectLowerMedian from '../../vendor/median-select/index.js';
import {MEDIAN_CASES, exact, orderHash} from './medianSelectCases';

// v1.4.2 stop 33: vendor/median-select replaces the npm package median-quickselect 1.0.1 (no license file, no copyright line). The golden file was recorded from the original package
// before it was removed (tests/_scratch, not in the repository); here the replacement must give the same return value AND the same in-place order on every case.
const golden = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../fixtures/vendor/medianSelect.golden.json'), 'utf8')) as {rows: {id: string; n: number; inputHash: string; result: string; orderAfter: string}[]};
const req = createRequire(import.meta.url);

describe('vendor/median-select = median-quickselect 1.0.1, bit for bit', () => {
  it('the golden file covers every case of the generator (same ids, same inputs)', () => {
    expect(golden.rows.map(r => r.id)).toEqual(MEDIAN_CASES.map(c => c.id));
    for (const c of MEDIAN_CASES) { const a = c.make(), g = golden.rows.find(r => r.id === c.id)!; expect(a.length).toBe(g.n); expect(orderHash(a)).toBe(g.inputHash); }
    expect(golden.rows.length).toBeGreaterThanOrEqual(400);
  });
  it('same return value and same in-place order on all cases (duplicates, even lengths, empty, -0, NaN, Infinity, typed arrays)', () => {
    const bad: string[] = [];
    for (const c of MEDIAN_CASES) {
      const a = c.make(), r = selectLowerMedian(a as number[]), g = golden.rows.find(x => x.id === c.id)!;
      if (exact(r) !== g.result || orderHash(a) !== g.orderAfter) bad.push(`${c.id}: ${exact(r)} vs ${g.result}`);
    }
    expect(bad).toEqual([]);
  });
  it('the golden file is sensitive: some cases return -0, some NaN, and the empty array returns undefined', () => {
    expect(golden.rows.some(r => r.result === '-0')).toBe(true);
    expect(golden.rows.some(r => r.result === 'NaN')).toBe(true);
    expect(golden.rows.filter(r => r.n === 0).every(r => r.result === 'undefined')).toBe(true);
  });
  it('boundary cases by hand: empty, one, two, even length returns the LOWER middle (no averaging), duplicates', () => {
    expect(selectLowerMedian([])).toBeUndefined();
    expect(selectLowerMedian([5])).toBe(5);
    expect(selectLowerMedian([9, 3])).toBe(3);
    expect(selectLowerMedian([4, 1, 3, 2])).toBe(2);
    expect(selectLowerMedian([1, 2, 3, 4, 5, 6])).toBe(3);
    expect(selectLowerMedian([2, 2, 2, 1, 3])).toBe(2);
    expect(selectLowerMedian(Float64Array.from([0.5, -1, 8]))).toBe(0.5);
  });
  it('for comparable values it is the element of rank floor((n-1)/2) of the sorted array', () => {
    for (const c of MEDIAN_CASES) {
      const a = Array.from(c.make()); if (!a.length || a.some(v => Number.isNaN(v))) continue;   // NaN has no rank
      const sorted = [...a].sort((x, y) => x - y);
      expect(selectLowerMedian(a) === sorted[Math.floor((a.length - 1) / 2)]).toBe(true);   // === : 0 and -0 have the same rank (which of the two comes back is pinned by the golden test above)
    }
  }, 30000);
  it('the dependency chain jcampconverter -> ml-array-median -> median-quickselect resolves to vendor/median-select (pnpm-workspace.yaml overrides), and ml-array-median gives the same medians', () => {
    const jc = fs.realpathSync(path.resolve(__dirname, '../../node_modules/jcampconverter'));   // the package's exports map hides package.json
    const mam = path.dirname(fs.realpathSync(createRequire(path.join(jc, 'package.json')).resolve('ml-array-median/package.json')));
    const mq = fs.realpathSync(createRequire(path.join(mam, 'package.json')).resolve('median-quickselect'));
    expect(mq.split(path.sep).join('/')).toMatch(/\/vendor\/median-select\/index\.js$/);
    const median = createRequire(path.join(mam, 'package.json'))('ml-array-median') as (a: ArrayLike<number>) => number;
    for (const c of MEDIAN_CASES) {
      const a = c.make(); if (!a.length) continue;   // ml-array-median throws on an empty array (its own check, unchanged)
      const copy = Array.from(a);
      expect(exact(median(a))).toBe(golden.rows.find(r => r.id === c.id)!.result);
      expect(Array.from(a)).toEqual(copy);   // ml-array-median works on a copy
    }
    expect(() => median([])).toThrow(/must not be empty/);
  });
  it('the registry package is gone from package.json and the lockfile packages', () => {
    const root = path.resolve(__dirname, '../..');
    expect(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).not.toMatch(/median-quickselect/);
    const lock = fs.readFileSync(path.join(root, 'pnpm-lock.yaml'), 'utf8');
    expect(lock).not.toMatch(/median-quickselect@1\.0\.1/);
  });
});
