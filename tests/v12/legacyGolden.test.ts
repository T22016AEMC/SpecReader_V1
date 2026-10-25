import fs from 'node:fs';
import path from 'node:path';
import {beforeAll, describe, expect, it} from 'vitest';
import {initializeRDKit} from '../../src/engines/scientificEngines/rdkitAdapter';
import {V12_CONFIG} from '../../src/engines/constraints/v12Config';
import {irAndPeakTables, legacyGoldenScenarios} from '../helpers/v12Golden';

// v1.2 flag guarantee: with useV12Constraints = false the pipeline gives the same candidates, runs, status, termination, score ledger
// fields, IR markers and peak tables as v1.1.8. The golden file was captured on the v1.1.8 code before any v1.2 code was written.
// Since 1.2.0 the flag defaults to true, so the test sets it to false in code (and restores it).
beforeAll(() => initializeRDKit(), 60000);
const file = path.resolve(__dirname, '..', 'goldens', 'v12Legacy.v118.json');
const fileV12 = path.resolve(__dirname, '..', 'goldens', 'v12.v120.json');
const withFlag = async <T>(on: boolean, body: () => Promise<T> | T): Promise<T> => {
  const was = V12_CONFIG.useV12Constraints;
  V12_CONFIG.useV12Constraints = on;
  try { return await body(); } finally { V12_CONFIG.useV12Constraints = was; }
};

describe('useV12Constraints = false is identical to v1.1.8', () => {
  it('matches the golden recorded on v1.1.8', async () => {
    const out = JSON.parse(JSON.stringify(await withFlag(false, legacyGoldenScenarios)));
    expect(fs.existsSync(file)).toBe(true);
    expect(out).toEqual(JSON.parse(fs.readFileSync(file, 'utf8')));
    expect(out.diphenylpropaneFormula.smiles.length).toBeGreaterThan(0);
    expect(out.tables.observations.length).toBeGreaterThan(5);
  }, 300000);
});

describe('useV12Constraints = true (1.2.0): the expected changes of the tables, recorded once', () => {
  it('IR marker intensity from a pixel is 100·(bottom − py)/(bottom − top) instead of 100 − height × 0.85; everything else in the tables is unchanged', async () => {
    const legacy = JSON.parse(fs.readFileSync(file, 'utf8')).tables;
    const now = JSON.parse(JSON.stringify(await withFlag(true, irAndPeakTables)));
    if (!fs.existsSync(fileV12)) fs.writeFileSync(fileV12, JSON.stringify({tables: now}, null, 1));
    expect(now).toEqual(JSON.parse(fs.readFileSync(fileV12, 'utf8')).tables);
    // old → new (design W6): heights 100 %, 83.3 %, 50 %, 16.7 %, 0 % of the plot (py = 40, 90, 190, 290, 340 with top 40 / bottom 340)
    expect(legacy.pixelToPhysicalIR).toEqual([15, 29.2, 57.5, 85.8, 100]);
    expect(now.pixelToPhysicalIR).toEqual([100, 83.3, 50, 16.7, 0]);
    // direction kept: both definitions are monotone in the click height, the new one in the opposite sense (higher click = larger value)
    for (let i = 1; i < now.pixelToPhysicalIR.length; i++) expect(now.pixelToPhysicalIR[i]).toBeLessThan(now.pixelToPhysicalIR[i - 1]);
    for (let i = 1; i < legacy.pixelToPhysicalIR.length; i++) expect(legacy.pixelToPhysicalIR[i]).toBeGreaterThan(legacy.pixelToPhysicalIR[i - 1]);
    // not affected: NMR conversion, the observation table, the measured marker lists (pass-through) and the numeric IR peaks
    expect(now.pixelToPhysicalNMR).toEqual(legacy.pixelToPhysicalNMR);
    expect(now.observations).toEqual(legacy.observations);
    expect(now.irMeasuredPeaks).toEqual(legacy.irMeasuredPeaks);
    expect(now.transmittanceMarkers).toEqual(legacy.transmittanceMarkers);
    expect(now.absorptionMarkers).toEqual(legacy.absorptionMarkers);
  }, 120000);
});
