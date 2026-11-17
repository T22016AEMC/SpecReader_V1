import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {V12_CONFIG} from '../../src/engines/constraints/v12Config';
import {S26_CLASSES, s26Class} from '../../src/engines/scientificEngines/h1Nmrshiftdb2';
import {BEFORE, buildCompounds, decideS26, graphOf, initStudy, itemsOfCompound, loadExtraction, smartsClasses, type S26Item} from '../helpers/v142Nmrshiftdb2Study';
import {gateClass, oldItems, skeletonOf, type PoolItem} from '../helpers/v142S28';
import {applySetting, clearEnvCache} from '../helpers/v140Truth';

// v1.4.2 stop 26 + 28: the WHOLE class study (every declared class, adopted or not) from the extraction of the nmrshiftdb2 SD file. The SD file and its extraction are NOT in the repository (license section 6.2: only the adopted
// classes are kept here), so this file runs only when NMRSHIFTDB2_EXTRACT names the folder written by scripts/nmrshiftdb2/extract_h1.py; otherwise it is skipped.
//   python -I scripts/nmrshiftdb2/extract_h1.py <nmrshiftdb2withsignals.sd> <folder>  &&  NMRSHIFTDB2_EXTRACT=<folder> npx vitest run tests/v14/v142Nmrshiftdb2Full.test.ts
// Contains information from nmrshiftdb2 (www.nmrshiftdb.org), which is made available here under the nmrshiftdb2 Database License (https://nmrshiftdb.nmr.uni-koeln.de/nmrshiftdbhtml/nmrshiftdb2datalicense.txt).
const DIR = process.env.NMRSHIFTDB2_EXTRACT;
// [class, independent CDCl3 compounds, stage-1 rule of stop 26 (data size, accuracy, leave-one-out, held-out half), gate A of stop 28 (skeletons, leave-one-out / held-out under both weightings, older truth)].
// A class is deployed only when BOTH hold. Classes that are not deployed although the gate A alone would pass (BENZOFURAN_H3: 2 compounds, ALKENE_ISO_CH2: mean error 0.09, already within 0.15) stay out: stage 1 is not re-opened (reported in notes/v1.4.2/S28_GATE_ALL.txt).
const PINNED: [string, number, boolean, boolean][] = [
  ['OCH_ALCOHOL_CHAIN', 10, false, false],
  ['OCH_ALCOHOL_RING', 64, false, false],
  ['OCH_ETHER_CHAIN', 1, false, false],
  ['OCH_ETHER_RING_ALPHA_QUAT', 3, true, true],
  ['OCH_ETHER_RING_NO_QUAT', 25, true, true],
  ['OCH_ESTER_CHAIN', 6, true, false],
  ['OCH_ESTER_RING', 45, false, false],
  ['OCH_ARYLETHER_CHAIN', 4, true, false],
  ['OCH_ARYLETHER_RING', 2, false, false],
  ['ACETAL_CH_RING', 12, true, true],
  ['ACETAL_CH_CHAIN', 1, false, false],
  ['OCH2O_ARYL', 15, true, true],
  ['OCH2O_ALIPH', 4, false, false],
  ['ORTHOESTER_CH', 1, false, false],
  ['EPOXIDE_H', 12, true, false],
  ['OXETANE_H', 2, false, false],
  ['CYCLOPROPANE_CH', 6, true, true],
  ['CYCLOPROPANE_CH2', 1, false, false],
  ['CYCLOBUTANE_CH', 7, true, true],
  ['CYCLOBUTANE_CH2', 2, false, false],
  ['INDOLE_H2', 8, true, true],
  ['INDOLE_H3', 1, false, false],
  ['BENZOFURAN_H2', 3, true, true],
  ['BENZOFURAN_H3', 2, false, true],
  ['BENZOTHIOPHENE_H2', 0, false, false],
  ['BENZOTHIOPHENE_H3', 0, false, false],
  ['LACTAM_N_CH', 3, false, false],
  ['LACTAM_ALPHA_CH', 3, false, false],
  ['LACTAM_RING_CH', 3, false, false],
  ['LACTAM_N_CH3', 2, false, false],
  ['ALKENE_1_CH', 17, true, false],
  ['ALKENE_1_CH2', 16, false, false],
  ['ALKENE_ISO_CH2', 9, false, true],
];
const was = JSON.parse(JSON.stringify({u: V12_CONFIG.useV140H1, v: V12_CONFIG.v140}));
const cfg = V12_CONFIG.v142Nmrshiftdb2 as unknown as {rules: Record<string, unknown>};
const saved = cfg.rules;
beforeAll(async () => { if (DIR) await initStudy(); }, 120000);
afterAll(() => { cfg.rules = saved; const c = V12_CONFIG as unknown as Record<string, unknown>; c.useV140H1 = was.u; Object.assign(V12_CONFIG.v140, was.v); clearEnvCache(); });

describe.skipIf(!DIR)('stop 26 / 28: the whole class study from the extraction (needs NMRSHIFTDB2_EXTRACT)', () => {
  it('1,040 CDCl3 compounds; the SMARTS class and the structure-graph class agree on every H-bearing atom; stage-1 decisions and gate-A results are the pinned ones; deployed = both', () => {
    cfg.rules = {};
    const {compounds, stats} = buildCompounds(loadExtraction(DIR!));
    expect(stats.compounds).toBe(1040);
    applySetting(BEFORE); clearEnvCache();
    const items: S26Item[] = []; const bad: string[] = [];
    for (const c of compounds) {
      const {cls} = smartsClasses(c.canonical), g = graphOf(c.canonical)!;
      g.atoms.forEach((a, i) => { if (a.totalHydrogens > 0 && (cls.get(i) ?? null) !== s26Class(g, i)) bad.push(`${c.id} ${i}`); });
      items.push(...itemsOfCompound(c, cls, BEFORE).items);
    }
    expect(bad).toEqual([]);
    const dec = decideS26(items), O = oldItems();
    const pool = (its: S26Item[]): PoolItem[] => its.map(i => ({src: 'new' as const, origin: `nmrshiftdb2 ${i.id}/${i.spectrum}`, canonical: i.canonical, skeleton: skeletonOf(i.canonical), cls: i.cls, label: i.atoms.join(','), solvent: 'CDCl3', truth: i.truth, predicted: i.predicted, residual: i.residual, fit: true}));
    const got = dec.map(d => [d.cls, d.n, d.adopt, gateClass(d.cls, pool(items.filter(i => i.cls === d.cls)), O.filter(i => i.cls === d.cls && i.fit), O.filter(i => i.cls === d.cls)).pass]);
    expect(got).toEqual(PINNED);
    expect(PINNED.map(p => p[0])).toEqual(S26_CLASSES.map(d => d.id));
    expect(PINNED.filter(p => p[2] && p[3]).map(p => p[0]).sort()).toEqual(Object.keys(saved).sort());
    cfg.rules = saved;
  }, 600000);
});
