import fs from 'node:fs';
import path from 'node:path';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {V12_CONFIG} from '../../src/engines/constraints/v12Config';
import {initializeRDKit} from '../../src/engines/scientificEngines/rdkitAdapter';
import {measureV131, V131_CASES} from '../helpers/v131Samples';
import type {V131Measure} from '../helpers/v131Samples';
import {measureV130, V130_CASES} from '../helpers/v130Samples';

// v1.3.1 (A) acceptance (useV131 on): the rank of the target of every parsimony sample against the v1.3.0 baseline (tests/goldens/v131.baseline.json, flag off). Step budget only, dense IR baseline.
// Rules: no sample gets worse (the protected samples BPA, di-p-tolyl ether, unsymmetric biaryl, ester, amide, acid keep rank 1 and carry no penalty); the p-cresol with OH in 1H and no 3335 band improves from 3 to 2;
// the penalty only ever touches a multiple of a smaller candidate (it is one point at most) and nothing else changes its score.
const was = {v123: V12_CONFIG.useV123, v130: V12_CONFIG.useV130, v131: V12_CONFIG.useV131};
beforeAll(async () => { await initializeRDKit(); V12_CONFIG.useV123 = true; V12_CONFIG.useV130 = true; V12_CONFIG.useV131 = true; }, 60000);
afterAll(() => { V12_CONFIG.useV123 = was.v123; V12_CONFIG.useV130 = was.v130; V12_CONFIG.useV131 = was.v131; });
const baseline = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'goldens', 'v131.baseline.json'), 'utf8')).samples as V131Measure[];
const EXPECTED_RANK: Record<string, number> = {'v130/CR1': 1, P1: 1, P2: 1, 'v130/CR0': 2, 'v131/CR2': 2, B1: 1, 'v131/ETH1': 1, 'v131/ASY1': 1, 'v130/EST1': 1, M1: 1, 'v130/AMD1': 1, 'v130/HCA': 1};
const PROTECTED = ['B1', 'v131/ETH1', 'v131/ASY1', 'v130/EST1', 'M1', 'v130/AMD1', 'v130/HCA'];

describe('v1.3.1 parsimony prior: ranks against the v1.3.0 baseline', () => {
  it('v130/ALK0 (1-octene, formula typed; v130Acceptance pins 27 with useV131 off): the symmetric 4-octene (a 2x multiple of a smaller candidate, 47 -> 46) drops below the target, so the target moves 27 -> 26', async () => {
    const c = V130_CASES.find(x => x.sample === 'v130/ALK0')!;
    const after = await measureV130(c);
    expect(after.targetRank).toBe(26);
  }, 300000);
  for (const c of V131_CASES) {
    it(`${c.sample}${c.typed ? ' (formula typed)' : ''}: target rank ${EXPECTED_RANK[c.sample]}, not worse than the baseline`, async () => {
      const before = baseline.find(b => b.sample === c.sample && b.typed === c.typed)!;
      const after = await measureV131(c);
      expect(after.targetRank).toBe(EXPECTED_RANK[c.sample]);
      expect(after.targetRank!).toBeLessThanOrEqual(before.targetRank!);
      // the target itself is never penalised in these samples, and a penalised candidate loses at most one point
      expect(after.top.find(t => t.isTarget)?.prior ?? 0).toBe(0);
      for (const t of after.top) {
        expect(t.prior).toBeLessThanOrEqual(V12_CONFIG.parsimonyV131.penaltyPoints);
        const old = before.top.find(b => b.smiles === t.smiles);
        if (old && t.prior === 0) expect(t.score).toBe(old.score);                       // untouched candidates keep their score
        if (old && t.prior > 0) expect(old.score! - t.score!).toBeLessThanOrEqual(1);   // round(total - 1) = round(total) - 1
      }
      if (PROTECTED.includes(c.sample)) expect(after.top.find(t => t.isTarget)!.score).toBe(before.top.find(b => b.isTarget)!.score);
    }, 300000);
  }
  it('CR1: the tri(p-tolyl)carbinol that tied with p-cresol (68 / 68) is the one that loses the point; p-cresol stays first with a clear margin in the final score', async () => {
    const c = V131_CASES.find(x => x.sample === 'v130/CR1')!;
    const before = baseline.find(b => b.sample === c.sample)!, after = await measureV131(c);
    const carbinol = 'Cc1ccc(C(O)(c2ccc(C)cc2)c2ccc(C)cc2)cc1';
    expect(before.top[0].score).toBe(before.top.find(t => t.smiles === carbinol)!.score);   // before: a tie of the rounded score
    const a = after.top.find(t => t.smiles === carbinol)!;
    expect(a.prior).toBe(1);
    expect(a.score!).toBeLessThan(after.top[0].score!);                                      // after: the tie is gone
    expect(after.top[0].isTarget).toBe(true);
  }, 300000);
});
