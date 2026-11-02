import fs from 'node:fs';
import path from 'node:path';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {V12_CONFIG} from '../../src/engines/constraints/v12Config';
import {initializeRDKit} from '../../src/engines/scientificEngines/rdkitAdapter';
import {measureSample} from '../helpers/v123Samples';
import type {SampleMeasure} from '../helpers/v123Samples';

// v1.2.3 A class acceptance (flag ON), SYNTHETIC samples, step budget only. p-cresol (4 versions, the last one reproduces the facts of a real diagnostic): the p-cresol structure is in the top 3
// and no implausible nitrogen structure (N(O)O, N–O–N, N(O)N(O), N=C(O)O) is in the top 5; BPA is not worse than the recorded baseline; a formula does not take most of the steps.
// "Bypass" tests: with the flag off the same samples fail the same checks (so the checks do test the fix).
const baseline = (JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'goldens', 'v123.baseline.json'), 'utf8')).samples as SampleMeasure[]);
const base = (id: string, mode: string) => baseline.find(b => b.id === id && b.mode === mode)!;
const wasTotal = V12_CONFIG.useV123;
beforeAll(() => initializeRDKit(), 60000);
afterAll(() => { V12_CONFIG.useV123 = wasTotal; });

const PCRESOL = ['P1', 'P2', 'P3', 'P4'] as const;
const run = async (id: string, mode: 'sparse' | 'dense', flag: boolean) => { V12_CONFIG.useV123 = flag; try { return await measureSample(id, mode); } finally { V12_CONFIG.useV123 = wasTotal; } };

describe('A class acceptance, flag on', () => {
  for (const id of PCRESOL) for (const mode of ['sparse', 'dense'] as const) {
    it(`${id} ${mode}: p-cresol in the top 3, no implausible N structure in the top 5, no N formula at all in the top 5`, async () => {
      const m = await run(id, mode, true);
      expect(m.targetRank).not.toBeNull();
      expect(m.targetRank!).toBeLessThanOrEqual(3);
      expect(m.implausibleNInTop5).toBe(0);
      expect(m.nInTop5).toBe(0);
      expect(m.targetSearched).toBe(true);
    }, 300000);
  }
  it('P3 / P4 (misread nitrogen): the nitrogen mode is NONE with the flag on and EVIDENCE with it off; the N-free formula C7H8O is searched', async () => {
    for (const id of ['P3', 'P4']) {
      const on = await run(id, 'sparse', true), off = await run(id, 'sparse', false);
      expect(on.nitrogen.mode).toBe('NONE');
      expect(off.nitrogen.mode).toBe('EVIDENCE');
      expect(on.targetSearched).toBe(true);
    }
  }, 300000);
  it('BPA (B1 physical, S2 existing) is not worse than the recorded baseline, sparse and dense', async () => {
    for (const id of ['B1', 'S2']) for (const mode of ['sparse', 'dense'] as const) {
      const m = await run(id === 'S2' ? 'v121/S2' : id, mode, true);
      expect(m.targetRank, `${id} ${mode}`).not.toBeNull();
      expect(m.targetRank!, `${id} ${mode}`).toBeLessThanOrEqual(base(id, mode).targetRank!);
    }
  }, 300000);
  it('A7: with the misread nitrogen no single formula takes most of the steps (flag on ≤ 50 %; flag off the N2 formula took 95 %)', async () => {
    for (const id of ['P3', 'P4']) {
      const on = await run(id, 'sparse', true), off = await run(id, 'sparse', false);
      const share = (m: SampleMeasure) => Math.max(...m.runs.map(r => r.visited)) / m.steps;
      expect(share(on), id).toBeLessThanOrEqual(0.5);
      expect(share(off), id).toBeGreaterThan(0.9);
      expect(on.runs.some(r => r.reasons.includes('ROUND2_STEP_CAP'))).toBe(true);
    }
  }, 300000);
});

describe('bypass: with the flag off the same samples fail the checks (1.2.2 behaviour)', () => {
  it('P3 and P4 sparse: p-cresol not in the output and implausible N structures in the top 5', async () => {
    for (const id of ['P3', 'P4']) {
      const m = await run(id, 'sparse', false);
      expect(m.targetRank).toBeNull();
      expect(m.implausibleNInTop5).toBeGreaterThan(0);
    }
  }, 300000);
});
