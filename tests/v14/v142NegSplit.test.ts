import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {V12_CONFIG} from '../../src/engines/constraints/v12Config';
import {v142NegativeEvidenceActive, v142NegRuleActive} from '../../src/engines/composition/planningGate';
import {initializeRDKit} from '../../src/engines/scientificEngines/rdkitAdapter';
import {BASE6, negProbe, setV142} from '../helpers/v142Probe';
import type {NegTable} from '../helpers/v142Probe';

// v1.4.2 stop 30 (A): the negative-evidence sub-flag split into one flag per group (v142IR.negNitrile / negNitro / negAlkyne, each DEFAULT FALSE). negativeEvidence keeps its meaning "all three on" (?exp=ir2neg unchanged).
// A rule is on when useV142IR AND (negativeEvidence OR its own flag). Probe tables are hand-written (circular), they test wiring only (tests/helpers/v142Probe.ts).
beforeAll(async () => { await initializeRDKit(); }, 60000);
let restore: (() => void) | null = null;
const use = (parent: boolean, sub: Parameters<typeof setV142>[1] = {}) => { restore?.(); restore = setV142(parent, sub); };
afterAll(() => restore?.());

// candidates with exactly ONE of the three groups (and no O-H / N-H, so the alkyne rule is not exempted), plus controls without any
const GROUPS = {
  nitrile: ['CCCCC#N', 'N#Cc1ccccc1', 'CC(C)CC#N'],
  nitro: ['CC[N+](=O)[O-]', 'O=[N+]([O-])c1ccccc1', 'CCCC[N+](=O)[O-]'],
  alkyneCH: ['C#CCCCC', 'C#Cc1ccccc1', 'C#CC(=O)OC'],
} as const;
const CONTROLS = ['CCCCCC', 'CC(C)=O', 'Cc1ccccc1', 'CCOC(C)=O'];
const FLAG = {nitrile: 'negNitrile', nitro: 'negNitro', alkyneCH: 'negAlkyne'} as const;
const ID = {nitrile: 'IR:neg:nitrile', nitro: 'IR:neg:nitro', alkyneCH: 'IR:neg:alkyneCH'} as const;
const TABLES: NegTable[] = [{peaks: BASE6}, {peaks: [...BASE6, {x: 2245, y: 50}]}, {peaks: [...BASE6, {x: 1540, y: 40}]}, {peaks: [...BASE6, {x: 3300, y: 40}]}];
const ledgerJson = (smi: string, t: NegTable) => JSON.stringify(negProbe(smi, t).ledger);
type G = keyof typeof GROUPS;
const ALL: G[] = ['nitrile', 'nitro', 'alkyneCH'];

describe('stop 30: defaults and the effective state of each rule', () => {
  it('source defaults: the three single-group flags are false; negativeEvidence false (read from the source: the flag-all-on test config switches negativeEvidence on at run time)', () => {
    const src = fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'src', 'engines', 'constraints', 'v12Config.ts'), 'utf8');
    expect(src).toMatch(/v142IR: {alkeneOOP: true as boolean, negativeEvidence: false as boolean,/);
    expect(src).toMatch(/negNitrile: false as boolean, negNitro: false as boolean, negAlkyne: false as boolean,/);
    expect(typeof V12_CONFIG.v142IR.negNitrile).toBe('boolean');
  });
  it('a rule is on only with the parent AND (total OR its own flag); the "any" helper is the OR of the three', () => {
    for (const parent of [false, true]) for (const total of [false, true]) for (const g of ALL) {
      use(parent, {negativeEvidence: total, [FLAG[g]]: true});
      for (const h of ALL) expect(v142NegRuleActive(h), `${parent}/${total}/${g}->${h}`).toBe(parent && (total || h === g));
      expect(v142NegativeEvidenceActive()).toBe(parent);
    }
    use(true); expect(ALL.map(v142NegRuleActive)).toEqual([false, false, false]); expect(v142NegativeEvidenceActive()).toBe(false);
  });
});

describe('stop 30: all off is bit-identical to before (default), the parent still wins', () => {
  it('parent off with every sub-flag on, and parent on with every sub-flag off: the ledger equals the plain flag-off ledger', () => {
    for (const smi of [...ALL.flatMap(g => GROUPS[g]), ...CONTROLS]) for (const t of TABLES) {
      use(false); const off = ledgerJson(smi, t);
      use(false, {negativeEvidence: true, negNitrile: true, negNitro: true, negAlkyne: true}); expect(ledgerJson(smi, t), smi).toBe(off);
      use(true, {alkeneOOP: false}); const parentOnly = ledgerJson(smi, t);
      use(true, {alkeneOOP: false, negativeEvidence: false, negNitrile: false, negNitro: false, negAlkyne: false}); expect(ledgerJson(smi, t), smi).toBe(parentOnly);
    }
  });
});

describe('stop 30: one group on alone', () => {
  for (const g of ALL) {
    it(`only ${g}: the candidates of the OTHER two groups (and the controls) are scored exactly as with all off; its own candidates get its item`, () => {
      for (const t of TABLES) {
        const others = [...ALL.filter(h => h !== g).flatMap(h => GROUPS[h]), ...CONTROLS];
        use(true, {alkeneOOP: false}); const off = others.map(s => ledgerJson(s, t));
        use(true, {alkeneOOP: false, [FLAG[g]]: true}); expect(others.map(s => ledgerJson(s, t))).toEqual(off);
      }
      use(true, {alkeneOOP: false, [FLAG[g]]: true});
      for (const smi of GROUPS[g]) expect(negProbe(smi).ids, smi).toEqual([ID[g]]); // the bare table has none of the three bands
    });
  }
  it('the three single flags together = the total sub-flag (ledger by ledger, also for a candidate with two groups and the cap)', () => {
    for (const smi of [...ALL.flatMap(g => GROUPS[g]), 'N#CCCC[N+](=O)[O-]', 'C#CCCC#N', 'C#CCCCO', ...CONTROLS]) for (const t of TABLES) {
      use(true, {negativeEvidence: true}); const total = ledgerJson(smi, t);
      use(true, {negNitrile: true, negNitro: true, negAlkyne: true}); expect(ledgerJson(smi, t), smi).toBe(total);
    }
  });
  it('a candidate with two groups gets only the item of the group that is on, at its full share (the cap 0.20 is shared by the rules that are on only)', () => {
    use(true, {negNitro: true}); let p = negProbe('N#CCCC[N+](=O)[O-]'); expect(p.ids).toEqual(['IR:neg:nitro']); expect(p.share[0]).toBeCloseTo(0.15, 6);
    use(true, {negAlkyne: true}); p = negProbe('C#CCCC#N'); expect(p.ids).toEqual(['IR:neg:alkyneCH']); expect(p.share[0]).toBeCloseTo(0.075, 6);
    use(true, {negNitrile: true}); p = negProbe('C#CCCC#N'); expect(p.ids).toEqual(['IR:neg:nitrile']); expect(p.share[0]).toBeCloseTo(0.15, 6);
  });
  it('IR:coverage 2100-2300 follows the nitrile rule (documentation pin: that item never fires today)', () => {
    for (const sub of [{negNitrile: true}, {negNitro: true}, {negAlkyne: true}, {negativeEvidence: true}]) { use(true, sub); expect(negProbe('CCCCC#N').ledger.entries.some(e => e.evidenceId === 'IR:coverage:2100-2300')).toBe(false); }
  });
});
