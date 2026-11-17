import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {V12_CONFIG} from '../../src/engines/constraints/v12Config';
import {initializeRDKit, matchingSMARTS} from '../../src/engines/scientificEngines/rdkitAdapter';
import {NO_PLAUSIBILITY_EVIDENCE, plausibilityViolations} from '../../src/engines/scientificEngines/structurePlausibility';
import {V140_FORBIDDEN_FRAGMENTS, activeForbiddenFragments, forbiddenById} from '../../src/engines/constraints/forbiddenFragments';
import {REAL_STRUCTURE_PANEL} from '../fixtures/v140/realStructurePanel';

// v1.4.0 stop 9 (useV140H1 and v140.plausibility, default off): four ring-strain fragments. Hard criterion: 0 false kills over a panel of 40+ public, known compounds; every rule has a positive
// test (stopped) and a negative test (a near-identical real structure that must not be stopped). SMILES are hand-written from the common structural formulas.
const was = {h1: V12_CONFIG.useV140H1, p: V12_CONFIG.v140.plausibility};
beforeAll(async () => { await initializeRDKit(); }, 60000);
afterAll(() => { V12_CONFIG.useV140H1 = was.h1; V12_CONFIG.v140.plausibility = was.p; });
const set = (h1: boolean, plausibility: boolean) => { V12_CONFIG.useV140H1 = h1; V12_CONFIG.v140.plausibility = plausibility; };
const ids = V140_FORBIDDEN_FRAGMENTS.map(f => f.id);
const hits = (smi: string): string[] => (matchingSMARTS(smi, V140_FORBIDDEN_FRAGMENTS.map(f => f.smarts)) ?? []).map(i => V140_FORBIDDEN_FRAGMENTS[i].id);

describe('the gate', () => {
  it('four fragments, listed only while useV140H1 and v140.plausibility are both on', () => {
    expect(ids).toEqual(['OXETE_RING_ALKENE', 'ALKYLIDENE_OXIRANE_OXETANE', 'ALPHA_LACTONE', 'OXYGEN_ON_EPOXIDE_CARBON']);
    for (const [h, p] of [[false, false], [false, true], [true, false]] as [boolean, boolean][]) { set(h, p); expect(activeForbiddenFragments().some(f => ids.includes(f.id)), `${h} ${p}`).toBe(false); }
    set(true, true);
    expect(ids.every(id => activeForbiddenFragments().some(f => f.id === id))).toBe(true);
    expect(forbiddenById('ALPHA_LACTONE')?.label).toContain('α-內酯');
  });
  it('the plausibility gate reports FORBIDDEN_<id> only with the flag on; the Q1 first-rank candidate of flag off (an alpha-lactone with an oxygen on the ring carbon) is stopped', () => {
    const q1 = 'CC(C)OC1(C)OC1=O';
    set(true, false);
    expect(plausibilityViolations(q1, NO_PLAUSIBILITY_EVIDENCE).filter(v => v.rule.startsWith('FORBIDDEN_') && ids.some(i => v.rule === `FORBIDDEN_${i}`))).toEqual([]);
    set(true, true);
    const rules = plausibilityViolations(q1, NO_PLAUSIBILITY_EVIDENCE).map(v => v.rule);
    expect(rules).toContain('FORBIDDEN_ALPHA_LACTONE');
    expect(rules).toContain('FORBIDDEN_OXYGEN_ON_EPOXIDE_CARBON');
  });
});

describe('each rule: positive (stopped) and negative (a near-identical real structure, not stopped)', () => {
  const cases: [string, string[], string[]][] = [
    ['OXETE_RING_ALKENE', ['C1=CCO1', 'CC1C=CO1', 'CC1=COC1', 'CC1(C)C=CO1'], ['C1=CCC1', 'C1COC1', 'C1=CCOCC1', 'C1=COCC1', 'C=C1COC1', 'O=C1COC1', 'O=C1CCO1', 'O=C1C=CC1', 'C1Cc2ccccc12']],
    ['ALKYLIDENE_OXIRANE_OXETANE', ['C=C1CO1', 'CC(C)=C1CO1', 'C=C1CCO1', 'CC=C1CCO1'], ['C=C1COC1', 'C=C1CCCO1', 'C=C1CCCCO1', 'C=C1CCC1', 'C=C1CC1', 'C=C1CCOC1=O', 'C=COC', 'C1=COCC1']],
    ['ALPHA_LACTONE', ['O=C1OC1', 'CC1(C)OC1=O', 'CC(C)OC1(C)OC1=O'], ['O=C1CCO1', 'O=C1CCCO1', 'O=C1CCCCO1', 'C1CO1', 'COC(=O)C1CO1', 'O=C1CC1', 'O=C1OCCO1']],
    ['OXYGEN_ON_EPOXIDE_CARBON', ['COC1CO1', 'CC(=O)OC1CO1', 'CCOC1(C)CO1', 'CC(C)OC1(C)OC1=O'], ['C1CO1', 'CC1CO1', 'OCC1CO1', 'COCC1CO1', 'CC(=O)OCC1CO1', 'CC1(C)CO1', 'CC(=O)C1CO1', 'COC1CCCCO1', 'OC1CCCO1']],
  ];
  for (const [id, pos, neg] of cases) {
    it(`${id}: stops ${pos.length} structures, spares ${neg.length}`, () => {
      for (const s of pos) expect(hits(s), `${id} should stop ${s}`).toContain(id);
      for (const s of neg) expect(hits(s), `${id} must not stop ${s}`).not.toContain(id);
    });
  }
  it('rules do not overlap more than they should: methyleneoxirane is the alkylidene rule only; alpha-lactone is not an oxete', () => {
    expect(hits('C=C1CO1')).toEqual(['ALKYLIDENE_OXIRANE_OXETANE']);
    expect(hits('O=C1OC1')).toEqual(['ALPHA_LACTONE']);
    expect(hits('C1=CCO1')).toEqual(['OXETE_RING_ALKENE']);
  });
});

describe('0 false kills on a panel of real, public compounds', () => {
  it(`${REAL_STRUCTURE_PANEL.length} compounds (at least 40), none hit by any of the four fragments`, () => {
    expect(REAL_STRUCTURE_PANEL.length).toBeGreaterThanOrEqual(40);
    const killed = REAL_STRUCTURE_PANEL.map(([name, smi]) => ({name, smi, hit: hits(smi)})).filter(r => r.hit.length);
    expect(killed).toEqual([]);
  });
  it('the panel contains every compound the criterion names', () => {
    const names = REAL_STRUCTURE_PANEL.map(p => p[0]).join('|').toLowerCase();
    for (const n of ['ethylene oxide', 'propylene oxide', 'styrene oxide', 'cyclohexene oxide', 'glycidol', 'oxetane', '3-oxetanone', 'beta-propiolactone', 'gamma-butyrolactone', 'delta-valerolactone', 'glucopyranose', 'glucofuranose', 'ribo', 'furan', '2,3-dihydrofuran', '3,4-dihydro-2h-pyran', '2-methylfuran', '2-methoxytetrahydropyran']) expect(names, n).toContain(n);
    const group = (g: string) => REAL_STRUCTURE_PANEL.filter(p => p[2] === g).length;
    expect(group('acetal')).toBeGreaterThanOrEqual(2);
    expect(group('ketal')).toBeGreaterThanOrEqual(2);
    expect(group('hemiacetal')).toBeGreaterThanOrEqual(2);
  });
  it('the whole plausibility gate with the flag on raises no v1.4.0 rule on any panel compound', () => {
    set(true, true);
    const bad = REAL_STRUCTURE_PANEL.flatMap(([name, smi]) => plausibilityViolations(smi, NO_PLAUSIBILITY_EVIDENCE).filter(v => ids.some(i => v.rule === `FORBIDDEN_${i}`)).map(v => `${name}: ${v.rule}`));
    expect(bad).toEqual([]);
  });
});
