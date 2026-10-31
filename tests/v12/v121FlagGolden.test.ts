import fs from 'node:fs';
import path from 'node:path';
import {beforeAll, describe, expect, it} from 'vitest';
import {initializeRDKit} from '../../src/engines/scientificEngines/rdkitAdapter';
import {V12_CONFIG} from '../../src/engines/constraints/v12Config';
import {compareGolden, v121GoldenScenarios} from '../helpers/v121Golden';

// v1.2.1 flag guarantee: with useV121Planning = false the whole pipeline (hypothesis list, searched list, runs, candidates, ranking, score ledger
// and the composition-panel model with all its texts) equals what v1.2.0 produced. The golden was recorded on the unmodified v1.2.0 code
// (first commit of the stage). Step counters may differ by a few tens (see compareGolden), nothing else may.
beforeAll(() => initializeRDKit(), 60000);
const file = path.resolve(__dirname, '..', 'goldens', 'v12.v120.pipeline.json');
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
      expect(compareGolden(out[name], golden()[name], name)).toEqual([]);
    });
  }
  it('the panel texts and the search list of the golden are really compared (non-trivial scenarios)', () => {
    expect(out.S1_noFormula.hypotheses.length).toBe(200);
    expect(out.S1_noFormula.searchList.length).toBe(8);
    expect(out.S1_noFormula.panel.rows.length).toBe(200);
    expect(out.S1_noFormula.panel.planning).toBeUndefined();
  });
});
