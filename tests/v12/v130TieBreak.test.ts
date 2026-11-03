import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {V12_CONFIG} from '../../src/engines/constraints/v12Config';
import {executeSixStepAnalysis} from '../../src/engines/reasoning/sixStepAnalysis';
import {initializeRDKit} from '../../src/engines/scientificEngines/rdkitAdapter';
import {canonNoStereo, fixtureSpectra, SHAPE_BUDGET} from '../helpers/v121Golden';
import {loadV123} from '../helpers/v123Samples';

// v1.3.0 ranking tie-break: candidates with the same ROUNDED finalScore are ordered by the unrounded ledger total first (higher first); flag off keeps the v1.2.3 order (contradiction count first).
// SYNTHETIC sample CR1 (p-cresol type, tests/fixtures/v130): p-cresol and a triaryl carbinol both round to 68; the ledger totals are 68.48 and 67.83, the carbinol has fewer contradicting reasons.
const was = {total: V12_CONFIG.useV130, tie: V12_CONFIG.v130.tieBreak};
beforeAll(async () => { await initializeRDKit(); }, 60000);
afterAll(() => { V12_CONFIG.useV130 = was.total; V12_CONFIG.v130.tieBreak = was.tie; });
const TARGET = canonNoStereo('Cc1ccc(O)cc1');
async function rank(on: boolean) {
  V12_CONFIG.useV130 = true; V12_CONFIG.v130.tieBreak = on;
  const r = await executeSixStepAnalysis({spectra: fixtureSpectra(loadV123('v130/CR1'), {denseBaseline: true}), extraInput: {}}, SHAPE_BUDGET);
  return r.rankedCandidates;
}
const ledgerTotal = (c: Awaited<ReturnType<typeof rank>>[number]) => c.scientificScoreLedger.totalScore;

describe('v1.3.0 tie-break by the unrounded ledger total', () => {
  it('flag on: ties of finalScore are ordered by the ledger total (descending), and the target is first', async () => {
    const ranked = await rank(true);
    const ties = ranked.slice(1).map((c, i) => [ranked[i], c] as const).filter(([a, b]) => a.finalScore === b.finalScore);
    expect(ties.length).toBeGreaterThan(0);                                   // the situation under test exists
    for (const [a, b] of ties) expect(ledgerTotal(a)).toBeGreaterThanOrEqual(ledgerTotal(b));
    expect(canonNoStereo(ranked[0].smiles)).toBe(TARGET);
    expect(ranked.map(c => c.finalScore)).toEqual([...ranked.map(c => c.finalScore)].sort((x, y) => y! - x!)); // the scores themselves are untouched: still descending
  }, 120000);
  it('sub-switch tieBreak off (the whole-flag-off order is pinned by v130Baseline): the v1.2.3 order (the target is second behind the carbinol with fewer contradictions); the scores are the same as with the flag on', async () => {
    const off = await rank(false), on = await rank(true);
    expect(off.findIndex(c => canonNoStereo(c.smiles) === TARGET)).toBe(1);
    expect(off[0].finalScore).toBe(off[1].finalScore);
    expect(off[0].contradictingReasons.length).toBeLessThan(off[1].contradictingReasons.length);
    const byId = (list: typeof on) => Object.fromEntries(list.map(c => [c.smiles, c.finalScore]));
    expect(byId(on)).toEqual(byId(off));
  }, 240000);
});
