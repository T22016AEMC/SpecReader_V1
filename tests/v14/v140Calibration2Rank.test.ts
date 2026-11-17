import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {V12_CONFIG} from '../../src/engines/constraints/v12Config';
import {initializeRDKit} from '../../src/engines/scientificEngines/rdkitAdapter';
import {measureV132, V132_CASES, type V132Measure} from '../helpers/v132Samples';

// v1.4.0 stop 13 (flag v140.calibration2): the ranking samples through the whole flow (executeSixStepAnalysis, step budget only), all earlier v1.4.0 flags on, without / with calibration2.
// Pass criterion (planner): no sample's target rank gets worse. The 44 cases of V132_CASES contain the 16 ranking samples of the earlier stops (the list of those 16 is not stored in the repository, so the superset is run).
// Progress goes to notes/v1.4.0/STOP13_RANK.txt after every sample (a long test: read the file, do not poll the process).
const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(here, '..', '..', '..', 'notes', 'v1.4.0', 'STOP13_RANK.txt');
const was = JSON.parse(JSON.stringify({u: V12_CONFIG.useV140H1, v: V12_CONFIG.v140}));
beforeAll(async () => { await initializeRDKit(); fs.writeFileSync(OUT, 'sample | typed | target rank without -> with | candidates without -> with | top-1 without | top-1 with | first 10 equal\n'); }, 120000);
afterAll(() => { const c = V12_CONFIG as unknown as Record<string, unknown>; c.useV140H1 = was.u; Object.assign(V12_CONFIG.v140, was.v); });
const setAll = (cal2: boolean) => { V12_CONFIG.useV140H1 = true; Object.assign(V12_CONFIG.v140, {alkene: true, oxygen: true, matching: true, plausibility: true, coverage: true, solvent: true, calibration2: cal2}); };
const rankOf = (m: V132Measure) => m.targetRank ?? Number.POSITIVE_INFINITY;

describe('ranking samples, whole flow, without / with calibration2', () => {
  for (const c of V132_CASES) {
    it(`${c.sample}${c.typed ? ' (typed formula)' : ''}: the target rank does not get worse`, async () => {
      setAll(false); const off = await measureV132(c, 10);
      setAll(true); const on = await measureV132(c, 10);
      const same = off.top.length === on.top.length && off.top.every((t, i) => t.smiles === on.top[i].smiles);
      fs.appendFileSync(OUT, `${c.sample} | ${c.typed ? 'typed' : ''} | ${off.targetRank ?? 'none'} -> ${on.targetRank ?? 'none'} | ${off.ranked} -> ${on.ranked} | ${off.top[0]?.smiles ?? '—'} | ${on.top[0]?.smiles ?? '—'} | ${same ? 'yes' : 'NO'}\n`);
      expect(rankOf(on), `${c.sample}: target rank ${off.targetRank} -> ${on.targetRank}`).toBeLessThanOrEqual(rankOf(off));
    }, 600000);
  }
});
