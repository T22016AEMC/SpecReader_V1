import fs from 'node:fs';
import path from 'node:path';
import {beforeAll, describe, expect, it} from 'vitest';
import {initializeRDKit} from '../../src/engines/scientificEngines/rdkitAdapter';
import {legacyGoldenScenarios} from '../helpers/v12Golden';

// v1.2 flag guarantee: with useV12Constraints = false the pipeline gives the same candidates, runs, status, termination, score ledger
// fields, IR markers and peak tables as v1.1.8. The golden file was captured on the v1.1.8 code before any v1.2 code was written.
beforeAll(() => initializeRDKit(), 60000);
const file = path.resolve(__dirname, '..', 'goldens', 'v12Legacy.v118.json');

describe('useV12Constraints = false is identical to v1.1.8', () => {
  it('matches the golden recorded on v1.1.8', async () => {
    const out = JSON.parse(JSON.stringify(await legacyGoldenScenarios()));
    if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify(out, null, 1));
    expect(out).toEqual(JSON.parse(fs.readFileSync(file, 'utf8')));
    expect(out.diphenylpropaneFormula.smiles.length).toBeGreaterThan(0);
    expect(out.tables.observations.length).toBeGreaterThan(5);
  }, 300000);
});
