import fs from 'node:fs';
import path from 'node:path';
import {beforeAll, describe, expect, it} from 'vitest';
import {initializeRDKit} from '../../src/engines/scientificEngines/rdkitAdapter';
import {V12_CONFIG} from '../../src/engines/constraints/v12Config';
import {compactSnapshot, compareGolden, v121GoldenScenarios} from '../helpers/v121Golden';

// v1.2.1 flag guarantee: with useV121Planning = false the whole pipeline (hypothesis list, searched list, runs, candidates, ranking, score ledger
// and the composition-panel model with all its texts) equals what v1.2.0 produced. The golden was recorded on the unmodified v1.2.0 code
// (commit 86e6066) and stored in a compact form (v1.2.1b: converted from that full recording, not recorded again): lists and facts as they are,
// candidate sets / ranking / ledger / panel as counts, hashes and short samples. Step counters may differ by a few tens (see compareGolden).
beforeAll(() => initializeRDKit(), 60000);
const file = path.resolve(__dirname, '..', 'goldens', 'v12.v120.pipeline.compact.json');
const golden = () => JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, any>;

describe('useV121Planning = false is identical to v1.2.0', () => {
  let out: Record<string, any>;
  beforeAll(async () => {
    const was = V12_CONFIG.useV121Planning;
    V12_CONFIG.useV121Planning = false;
    try { out = JSON.parse(JSON.stringify(await v121GoldenScenarios())); } finally { V12_CONFIG.useV121Planning = was; }
  }, 600000);

  const scenarios = ['diphenylpropaneFormula', 'ethylEsterFormula', 'ethylNoFormula', 'h1OnlyNoFormula', 'userFormulaWithS', 'S1_noFormula', 'G1_noFormula', 'E1_noFormula', 'G3_noFormula', 'D1_noFormula', 'S1_withFormula'];
  for (const name of scenarios) {
    it(`${name} matches the v1.2.0 golden`, () => {
      // a mismatch prints the current value and the stored one (hashes included) for each differing path
      expect(compareGolden(compactSnapshot(out[name]), golden()[name], name)).toEqual([]);
    });
  }
  it('the golden file is small and still covers the non-trivial parts (200 hypotheses, 8 searched formulas, a panel of 200 rows)', () => {
    expect(fs.statSync(file).size).toBeLessThan(500 * 1024);
    const g = golden();
    expect(Object.keys(g)).toHaveLength(scenarios.length);
    expect(g.S1_noFormula.hypotheses).toHaveLength(200);
    expect(g.S1_noFormula.searchList).toHaveLength(8);
    expect(g.S1_noFormula.panel.rowHashes).toHaveLength(200);
    expect(g.S1_noFormula.panel.rowsText30).toHaveLength(30);
    expect(g.S1_noFormula.candidateSet.count).toBeGreaterThan(20);
    expect(out.S1_noFormula.panel.planning).toBeUndefined();
  });
  it('the compact form detects a change (a different panel row, a different candidate set)', () => {
    const changed = JSON.parse(JSON.stringify(out.S1_noFormula));
    changed.panel.rows[7].search.text += '!';
    changed.candidateSet = changed.candidateSet.slice(1);
    const problems = compareGolden(compactSnapshot(changed), golden().S1_noFormula, 'S1');
    expect(problems.some(p => p.includes('rowHashes[7]'))).toBe(true);
    expect(problems.some(p => p.includes('candidateSet'))).toBe(true);
  });
});
