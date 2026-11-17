import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {V12_CONFIG} from '../../src/engines/constraints/v12Config';
import {initializeRDKit} from '../../src/engines/scientificEngines/rdkitAdapter';
import {ChemistryEngine} from '../../src/engines/chemistryEngine';
import {NMRGraphPredictor} from '../../src/engines/scientificEngines/nmrAtomicEnvironmentModel';

// v1.4.0 stops 3-5: error of the 1H predictor against the independent truth set tests/fixtures/v140/h1Truth.json (experimental CDCl3 shifts of Fulmer 2010, SI Table S7, values given by the planner).
// Four settings: off = v1.3.2 predictor; alkene = useV140H1 with only v140.alkene; oxygen = only v140.oxygen; both = both groups. This file measures; it pins the flag-off predictions, the truth file and which group owns
// which class, it does NOT assert that a rule makes the error smaller. The classes without values (allylic CH2 without O, acetal, ester-oxygen methine) are empty on purpose: "待規劃者補充，附出處".
const here = path.dirname(fileURLToPath(import.meta.url));
interface Entry {compound: string; environment: string; smiles: string; atom: number; nH: number; shiftPpm: number; multiplicity: string; solvent: string; source: string; note?: string}
const truth = JSON.parse(fs.readFileSync(path.resolve(here, '..', 'fixtures', 'v140', 'h1Truth.json'), 'utf8')) as {classes: Record<string, Entry[]>};
const CLASSES = ['terminal_vinyl_CH2', 'vinyl_CH', 'allylic_CH2', 'allylic_CH3', 'acetal_CH', 'ester_oxygen_methine', 'ether_O_CH2', 'ester_O_CH2', 'alcohol_O_CH2', 'allylic_oxygen_CH2', 'other'];
const EMPTY_ON_PURPOSE = ['allylic_CH2', 'acetal_CH', 'ester_oxygen_methine'];
const ALKENE_CLASSES = ['terminal_vinyl_CH2', 'vinyl_CH', 'allylic_CH3'];
const OXYGEN_CLASSES = ['ether_O_CH2', 'ester_O_CH2', 'alcohol_O_CH2'];
type Mode = 'off' | 'alkene' | 'oxygen' | 'both';
const MODES: Record<Mode, [boolean, boolean, boolean]> = {off: [false, true, true], alkene: [true, true, false], oxygen: [true, false, true], both: [true, true, true]};

const was = {h1: V12_CONFIG.useV140H1, a: V12_CONFIG.v140.alkene, o: V12_CONFIG.v140.oxygen};
beforeAll(async () => { await initializeRDKit(); }, 60000);
afterAll(() => { V12_CONFIG.useV140H1 = was.h1; V12_CONFIG.v140.alkene = was.a; V12_CONFIG.v140.oxygen = was.o; });

const envs = (smi: string, solvent: string, mode: Mode) => {
  [V12_CONFIG.useV140H1, V12_CONFIG.v140.alkene, V12_CONFIG.v140.oxygen] = MODES[mode];
  return NMRGraphPredictor.predict1HFromStructureGraph(ChemistryEngine.parseStructureInput({smiles: smi}), {solvent: solvent as never}).environments;
};
/** Helper for whoever fills the truth file: atom index (as the predictor numbers it), shift and H count of every predicted environment. */
export const listEnvironments = (smi: string, mode: Mode = 'both') => envs(smi, 'CDCl3', mode).map(e => ({atom: e.atomIndices?.[0], shiftPpm: Number(e.shiftPpm.toFixed(2)), nH: e.integration}));
type Env = ReturnType<typeof envs>[number];
/**
 * Predicted environments for every entry of a class. Entries on the same atom (the two =CH2 hydrogens) are a group: when the predictor has exactly one environment per entry (split =CH2) the truth values
 * and the predicted environments are paired in ascending order of shift; otherwise (one 2H / 4H environment) each entry is compared with that environment. A single entry takes the environment holding its atom.
 */
function predictClass(list: Entry[], mode: Mode): {entry: Entry; env: Env | null; expectedH: number}[] {
  const out: {entry: Entry; env: Env | null; expectedH: number}[] = [];
  const groups = new Map<string, Entry[]>();
  for (const x of list) groups.set(`${x.smiles}|${x.atom}`, [...(groups.get(`${x.smiles}|${x.atom}`) ?? []), x]);
  for (const g of groups.values()) {
    const hit = envs(g[0].smiles, g[0].solvent, mode).filter(e => e.atomIndices?.includes(g[0].atom)).sort((a, b) => a.shiftPpm - b.shiftPpm);
    const paired = g.length > 1 && hit.length === g.length;
    const sorted = [...g].sort((a, b) => a.shiftPpm - b.shiftPpm);
    for (const x of g) {
      const env = paired ? hit[sorted.indexOf(x)] : (hit.length ? [...hit].sort((a, b) => Math.abs(a.shiftPpm - x.shiftPpm) - Math.abs(b.shiftPpm - x.shiftPpm))[0] : null);
      out.push({entry: x, env: env ?? null, expectedH: paired || g.length === 1 ? x.nH : g.reduce((s, y) => s + y.nH, 0)});
    }
  }
  return list.map(x => out.find(o => o.entry === x)!);
}
const shifts = (list: Entry[], mode: Mode) => predictClass(list, mode).map(o => o.env!.shiftPpm);

/** The flag-off (v1.3.2) predictions of the truth entries, pinned (rounded to 0.01). Recorded from the unchanged v1.3.2 predictor, which the v1.3.2 goldens also cover. */
const OFF_PIN: Record<string, number> = {
  'ether_O_CH2|乙醚 diethyl ether|OCH2': 3.6, 'ether_O_CH2|四氫呋喃 tetrahydrofuran|OCH2 (2,5)': 3.6, 'ether_O_CH2|1,4-二氧六環 1,4-dioxane|CH2': 3.92,
  'ester_O_CH2|乙酸乙酯 ethyl acetate|OCH2': 4.3,
  'alcohol_O_CH2|乙醇 ethanol|OCH2': 3.6, 'alcohol_O_CH2|甲醇 methanol|CH3': 3.36, 'alcohol_O_CH2|異丙醇 2-propanol|CH': 3.9,
  'terminal_vinyl_CH2|丙烯 propylene|CH2(1)': 5.25, 'terminal_vinyl_CH2|丙烯 propylene|CH2(2)': 5.25, 'vinyl_CH|丙烯 propylene|CH': 5.7, 'allylic_CH3|丙烯 propylene|CH3': 0.88,
  'terminal_vinyl_CH2|乙烯 ethylene|CH2': 5.25,
  'terminal_vinyl_CH2|乙酸烯丙酯 allyl acetate|CHCH2(1)': 5.25, 'terminal_vinyl_CH2|乙酸烯丙酯 allyl acetate|CHCH2(2)': 5.25, 'vinyl_CH|乙酸烯丙酯 allyl acetate|CH': 5.7,
  'terminal_vinyl_CH2|碳酸二烯丙酯 diallyl carbonate|CHCH2(1)': 5.25, 'terminal_vinyl_CH2|碳酸二烯丙酯 diallyl carbonate|CHCH2(2)': 5.25, 'vinyl_CH|碳酸二烯丙酯 diallyl carbonate|CH': 5.7,
  'allylic_oxygen_CH2|乙酸烯丙酯 allyl acetate|OCH2': 4.3, 'allylic_oxygen_CH2|碳酸二烯丙酯 diallyl carbonate|OCH2': 4.3,
  'other|乙酸烯丙酯 allyl acetate|CH3CO': 2.1,
};

describe('truth file', () => {
  it('has the agreed classes; every entry carries compound / environment / SMILES / atom / shift / multiplicity / solvent / source; the unsourced classes are empty', () => {
    expect(Object.keys(truth.classes)).toEqual(CLASSES);
    for (const c of EMPTY_ON_PURPOSE) expect(truth.classes[c], c).toEqual([]);
    for (const [cls, list] of Object.entries(truth.classes)) for (const x of list) {
      const id = `${cls} ${x.compound} ${x.environment}`;
      expect(x.compound && x.environment && x.smiles && x.multiplicity, id).toBeTruthy();
      expect(Number.isInteger(x.atom) && Number.isInteger(x.nH) && Number.isFinite(x.shiftPpm), id).toBe(true);
      expect(x.solvent, id).toBe('CDCl3');
      expect(x.source, id).toBe('Fulmer 2010 SI Table S7');
    }
    expect(CLASSES.reduce((s, c) => s + truth.classes[c].length, 0)).toBe(35);
  });
  it('the truth values are exactly the ones given by the planner (Fulmer 2010 SI Table S7, CDCl3): stop 3 (ethers, esters, alcohols, others), stop 4 (propylene), stop 5 (ethylene, allyl acetate, diallyl carbonate)', () => {
    const got = CLASSES.flatMap(c => truth.classes[c].map(x => `${x.smiles}|${x.environment}|${x.shiftPpm}|${x.multiplicity}`)).sort();
    const want = [
      'CC(=O)OCC|CH3CO|2.05|s', 'CC(=O)OCC|OCH2|4.12|q', 'CC(=O)OCC|CH3 (of OCH2CH3)|1.26|t',
      'CCOCC|OCH2|3.48|q', 'CCOCC|CH3|1.21|t',
      'C1CCOC1|OCH2 (2,5)|3.76|m', 'C1CCOC1|CH2 (3,4)|1.85|m',
      'C1COCCO1|CH2|3.71|s',
      'CCO|OCH2|3.72|q', 'CCO|CH3|1.25|t',
      'CC(C)O|CH|4.04|sept', 'CC(C)O|CH3|1.22|d',
      'CO|CH3|3.49|s',
      'CCC(C)=O|CH3CO|2.14|s', 'CCC(C)=O|CH2|2.46|q', 'CCC(C)=O|CH2CH3|1.06|t',
      'CCCCCC|CH3|0.88|t', 'CCCCCC|CH2 (C2/C5)|1.26|m', 'CCCCCC|CH2 (C3/C4)|1.26|m',
      'Cc1ccccc1|CH3|2.36|s',
      'ClCCl|CH2|5.3|s',
      'C=CC|CH2(1)|4.94|dm (J 10)', 'C=CC|CH2(2)|5.03|dm (J 17)', 'C=CC|CH|5.83|m', 'C=CC|CH3|1.73|dt (J 6.4, 1.5)',
      'C=C|CH2|5.4|s',
      'CC(=O)OCC=C|CHCH2(1)|5.32|ddt', 'CC(=O)OCC=C|CHCH2(2)|5.24|ddt', 'CC(=O)OCC=C|CH|5.93|ddt', 'CC(=O)OCC=C|OCH2|4.57|ddd', 'CC(=O)OCC=C|CH3CO|2.09|s',
      'C=CCOC(=O)OCC=C|CHCH2(1)|5.37|ddt', 'C=CCOC(=O)OCC=C|CHCH2(2)|5.27|ddt', 'C=CCOC(=O)OCC=C|CH|5.94|ddt', 'C=CCOC(=O)OCC=C|OCH2|4.64|ddd',
    ].sort();
    expect(got).toEqual(want);
  });
});

describe('which group owns which class (pins the design of the two sub-flags on the truth entries)', () => {
  it('alkene classes: only oxygen = off; oxygen classes: only alkene = off; allylic O-CH2: only alkene = off, only oxygen = both', () => {
    for (const c of ALKENE_CLASSES) expect(shifts(truth.classes[c], 'oxygen'), c).toEqual(shifts(truth.classes[c], 'off'));
    for (const c of OXYGEN_CLASSES) expect(shifts(truth.classes[c], 'alkene'), c).toEqual(shifts(truth.classes[c], 'off'));
    const a = truth.classes.allylic_oxygen_CH2;
    expect(shifts(a, 'alkene')).toEqual(shifts(a, 'off'));
    expect(shifts(a, 'oxygen')).toEqual(shifts(a, 'both'));
    expect(shifts(a, 'both')).not.toEqual(shifts(a, 'off'));
  });
});

describe('error against the truth set (printed)', () => {
  const f = (a: number[], g: (a: number[]) => number) => (a.length ? g(a).toFixed(2) : '—');
  const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length, max = (a: number[]) => Math.max(...a);
  const sgn = (v: number) => (v >= 0 ? '+' : '') + v.toFixed(2);
  /** per-entry table and per-class summary of the given classes under the given modes; every entry must find its environment with the stated H count; flag off equals the pin */
  function table(title: string, classes: string[], modes: Mode[]): string[] {
    const rows: string[] = [`## ${title}`, `class | compound | environment | truth | ${modes.map(m => `${m} pred (err)`).join(' | ')}`];
    const err: Record<string, Record<Mode, number[]>> = {};
    for (const cls of classes) {
      err[cls] = {off: [], alkene: [], oxygen: [], both: []};
      const list = truth.classes[cls];
      const pr = Object.fromEntries(modes.map(m => [m, predictClass(list, m)])) as Record<Mode, ReturnType<typeof predictClass>>;
      list.forEach((x, i) => {
        const cells = modes.map(m => {
          const p = pr[m][i];
          expect(p.env, `${cls} ${x.compound} ${x.environment} [${m}]: no predicted environment holds atom ${x.atom}`).not.toBeNull();
          expect(p.env!.integration, `${x.compound} ${x.environment} [${m}]: H count`).toBe(p.expectedH);
          if (m === 'off') { const key = `${cls}|${x.compound}|${x.environment}`; if (key in OFF_PIN) expect(Number(p.env!.shiftPpm.toFixed(2)), `flag-off pin ${key}`).toBeCloseTo(OFF_PIN[key], 2); }
          const e = p.env!.shiftPpm - x.shiftPpm; err[cls][m].push(Math.abs(e));
          return `${p.env!.shiftPpm.toFixed(2)} (${sgn(e)})`;
        });
        rows.push(`${cls} | ${x.compound} | ${x.environment} | ${x.shiftPpm.toFixed(2)} | ${cells.join(' | ')}`);
      });
    }
    rows.push('', `class | n | ${modes.map(m => `${m} mean / max`).join(' | ')}`);
    const line = (name: string, per: Record<Mode, number[]>) => `${name} | ${per[modes[0]].length} | ${modes.map(m => `${f(per[m], mean)} / ${f(per[m], max)}`).join(' | ')}`;
    for (const cls of classes) rows.push(line(cls, err[cls]));
    if (classes.length > 1) rows.push(line('all together', Object.fromEntries((['off', 'alkene', 'oxygen', 'both'] as Mode[]).map(m => [m, classes.flatMap(c => err[c][m])])) as Record<Mode, number[]>));
    return rows;
  }
  it('alkene classes (terminal =CH2 incl. ethylene, vinyl CH, allylic CH3): off / only alkene / both; allylic O-CH2: off / only alkene / only oxygen / both; the oxygen and "other" classes: off / both', () => {
    const out = [
      ...table('alkene classes', ALKENE_CLASSES, ['off', 'alkene', 'both']), '',
      ...table('allylic O-CH2 ("烯丙基接氧")', ['allylic_oxygen_CH2'], ['off', 'alkene', 'oxygen', 'both']), '',
      ...table('oxygen classes (ether / ester / alcohol O-CH)', OXYGEN_CLASSES, ['off', 'both']), '',
      ...table('other', ['other'], ['off', 'both']),
    ];
    console.log(out.join('\n'));
    expect(Object.keys(OFF_PIN).every(k => truth.classes[k.split('|')[0]].some(x => k === `${k.split('|')[0]}|${x.compound}|${x.environment}`))).toBe(true);
  });
});

describe('matcher self-check (synthetic structures, NOT truth values)', () => {
  it('a split terminal =CH2: the two truth hydrogens pair with the two predicted ones in ascending order; with the alkene rules off both compare with the single 2H environment', () => {
    const mk = (environment: string, shiftPpm: number): Entry => ({compound: 'self-check', environment, smiles: 'C=CCCCCCC', atom: 0, nH: 1, shiftPpm, multiplicity: 'm', solvent: 'CDCl3', source: 'Fulmer 2010 SI Table S7'});
    const pair = [mk('a', 5.2), mk('b', 4.9)];     // deliberately in the wrong order: ascending pairing must give b -> 4.97, a -> 5.03
    expect(predictClass(pair, 'both').map(o => o.env!.shiftPpm.toFixed(2))).toEqual(['5.03', '4.97']);
    expect(predictClass(pair, 'alkene').map(o => o.env!.shiftPpm.toFixed(2))).toEqual(['5.03', '4.97']);
    expect(predictClass(pair, 'oxygen').map(o => o.env!.shiftPpm.toFixed(2))).toEqual(['5.25', '5.25']);
    expect(predictClass(pair, 'off').map(o => o.env!.shiftPpm.toFixed(2))).toEqual(['5.25', '5.25']);
    expect(predictClass(pair, 'off').map(o => o.expectedH)).toEqual([2, 2]);
  });
});
