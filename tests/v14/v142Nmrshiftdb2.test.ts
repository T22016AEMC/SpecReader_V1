import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {V12_CONFIG} from '../../src/engines/constraints/v12Config';
import {ChemistryEngine} from '../../src/engines/chemistryEngine';
import {NMRGraphPredictor} from '../../src/engines/scientificEngines/nmrAtomicEnvironmentModel';
import {S26_CLASSES, s26Class, s26GateOpen} from '../../src/engines/scientificEngines/h1Nmrshiftdb2';
import {round3Class} from '../../src/engines/scientificEngines/h1Round3';
import {canonicalizeMolecule} from '../../src/engines/scientificEngines/rdkitAdapter';
import {scoreScientificEvidence} from '../../src/engines/scientificEngines/evidenceLedger';
import {WorkbenchOrchestrator} from '../../src/engines/workbenchOrchestrator';
import {fixtureSpectra} from '../helpers/v121Golden';
import type {V121Fixture} from '../helpers/v121Golden';
import {loadStop7, needFulmer} from '../helpers/v140Truth';
// v1.4.2 stop 36 (F): the stop-7 spectra (Fulmer 2010 Table S7) are local-only; empty lists without the file (the tests that read them skip)
const {STOP7_SPECTRA} = await loadStop7();
import {REAL_STRUCTURE_PANEL} from '../fixtures/v140/realStructurePanel';
import {applySetting, clearEnvCache, evalTier1, evalTier2, evalTier3, SETTINGS, type Item} from '../helpers/v140Truth';
import {BEFORE, CDCL3_LABELS, S26_EXCLUDED, compoundErrors, errorSummary, graphOf, initStudy, itemsFromTruth, loadTruthFile, smartsClasses, TRUTH_FILE, type S26Item} from '../helpers/v142Nmrshiftdb2Study';
import {PARTITIONS, gateClass, newItems, oldItems, plainPartition} from '../helpers/v142S28';
// v1.4.2 stop 36 (F): the Fulmer 2010 files (tier 1, stop-7 spectra) are local-only; the gate A, the effect on the older truth sets and the 31 stop-7 spectra skip without them (one-line note).
const NEED_F = needFulmer('v142Nmrshiftdb2: the gate A, the effect on the older truth sets and the 31 stop-7 spectra');

// v1.4.2 stop 26 + stop 28 (no new flag: the class shifts sit under v140.oxygen (O-CH, acetal-type) and v140.calibration2 (the rest; the small carbocycles also need v140.round3); all need useV140H1, DEFAULT OFF).
// Stop 28: the rules were re-fitted under the adoption gate A (tests/helpers/v142S28.ts: >= 3 skeletons, skeleton-weighted fit, leave-one-out / held-out under both weightings, no older-truth signal worse by more than 0.15, merged refit where old truth exists). 8 classes remain of the 11 of stop 26.
// Truth values: MEASURED CDCl3 1H spectra of nmrshiftdb2, adopted classes only (tests/fixtures/v140/nmrshiftdb2/h1TruthNmrshiftdb2.json, with the license text next to it).
// Contains information from nmrshiftdb2 (www.nmrshiftdb.org), which is made available here under the nmrshiftdb2 Database License (https://nmrshiftdb.nmr.uni-koeln.de/nmrshiftdbhtml/nmrshiftdb2datalicense.txt).
// The class study over the WHOLE extraction (every declared class, adopted or not) needs the SD file, which is not in the repository; its results are pinned here as documentation (NOT_ADOPTED) and in notes/v1.4.2.
// No spectrum of the user's is used. A pinned number is not a claim of accuracy.
const here = path.dirname(fileURLToPath(import.meta.url));
const FIXDIR = path.dirname(TRUTH_FILE);
const RESULTS = path.resolve(here, '..', '..', '..', 'notes', 'v1.4.2', 'S28_RESULTS.txt');
const notes: string[] = [];
type Err2 = {c: number; s: number};
const cfg = V12_CONFIG.v142Nmrshiftdb2 as unknown as {rules: Record<string, {deltaPpm: number; nCompounds: number; nSkeletons: number; nCompoundsOld: number; smallSample: boolean; before: Err2; leaveOneOut: Err2; after: Err2; heldOut: {n: number; before: Err2; after: Err2} | null; sourceError: {new: [number, number] | null; old: [number, number] | null}}>};
const RULES = cfg.rules;
const was = JSON.parse(JSON.stringify({u: V12_CONFIG.useV140H1, v: V12_CONFIG.v140}));
const f2 = (v: number) => (Number.isFinite(v) ? v.toFixed(2) : '—');
const sg = (v: number) => (Number.isFinite(v) ? (v >= 0 ? '+' : '') + v.toFixed(2) : '—');
/** run fn with the stop-26 rules switched off (the "before") or on */
function withRules<T>(on: boolean, fn: () => T): T {
  const saved = cfg.rules;
  if (!on) cfg.rules = {};
  clearEnvCache();
  try { return fn(); } finally { cfg.rules = saved; clearEnvCache(); }
}
const ALL_ON = () => { V12_CONFIG.useV140H1 = true; Object.assign(V12_CONFIG.v140, {alkene: true, oxygen: true, matching: true, plausibility: true, coverage: true, solvent: true, calibration2: true, round3: true}); };
beforeAll(async () => { await initStudy(); }, 120000);
afterAll(() => {
  const c = V12_CONFIG as unknown as Record<string, unknown>; c.useV140H1 = was.u; Object.assign(V12_CONFIG.v140, was.v); clearEnvCache();
  try { fs.writeFileSync(RESULTS, notes.join('\n') + '\n'); } catch { /* the notes file is a convenience */ }
});

// The classes adopted after the gate A of stop 28 (notes/v1.4.2/S28_GATE_FINAL.txt) and the declared classes that are NOT adopted, with the reason. The stage-1 study of stop 26 (the old rule, whole extraction) is pinned in v142Nmrshiftdb2Full.test.ts.
const ADOPTED = ['OCH_ETHER_RING_ALPHA_QUAT', 'OCH_ETHER_RING_NO_QUAT', 'ACETAL_CH_RING', 'OCH2O_ARYL', 'CYCLOPROPANE_CH', 'CYCLOBUTANE_CH', 'INDOLE_H2', 'BENZOFURAN_H2'];
const NOT_ADOPTED: [string, string][] = [
  // stage 1 (stop 26 rule: data size, accuracy, leave-one-out) - unchanged
  ['OCH_ALCOHOL_CHAIN', 'stop 26: leave-one-out not lower'], ['OCH_ALCOHOL_RING', 'stop 26: leave-one-out not lower'], ['OCH_ETHER_CHAIN', 'stop 26: insufficient data'], ['OCH_ESTER_RING', 'stop 26: leave-one-out not lower'],
  ['OCH_ARYLETHER_RING', 'stop 26: insufficient data'], ['ORTHOESTER_CH', 'stop 26: insufficient data'], ['OXETANE_H', 'stop 26: insufficient data'], ['CYCLOPROPANE_CH2', 'stop 26: insufficient data'], ['CYCLOBUTANE_CH2', 'stop 26: insufficient data'],
  ['INDOLE_H3', 'stop 26: insufficient data'], ['BENZOFURAN_H3', 'stop 26: insufficient data'], ['BENZOTHIOPHENE_H2', 'stop 26: insufficient data'], ['BENZOTHIOPHENE_H3', 'stop 26: insufficient data'],
  ['LACTAM_N_CH', 'stop 26: leave-one-out not lower'], ['LACTAM_ALPHA_CH', 'stop 26: leave-one-out not lower'], ['LACTAM_RING_CH', 'stop 26: leave-one-out not lower'], ['LACTAM_N_CH3', 'stop 26: insufficient data'],
  ['ALKENE_1_CH2', 'stop 26: accurate enough'], ['ALKENE_ISO_CH2', 'stop 26: accurate enough'],
  // adopted in stop 26, revoked / not adopted by the gate A of stop 28
  ['OCH_ESTER_CHAIN', 'stop 28 revoked: A.2 leave-one-out not lower after the merged refit; A.3 isopropyl acetate +0.00 -> +0.20 and the old source error 0.07 -> 0.27'],
  ['OCH_ARYLETHER_CHAIN', 'stop 28 revoked: A.1 one skeleton (benzene) among 4 compounds'],
  ['ACETAL_CH_CHAIN', 'stop 28 not adopted: A.2 leave-one-out not lower (open-chain acetal, 3 skeletons)'],
  ['OCH2O_ALIPH', 'stop 28 not adopted: A.2 leave-one-out not lower; A.3 dimethoxymethane +0.00 -> +0.16 and 1,3-dioxolane +0.33 -> +0.49'],
  ['EPOXIDE_H', 'stop 28 revoked: A.3a propylene oxide CH2 and ethylene oxide CH2 each worse by 0.17'],
  ['ALKENE_1_CH', 'stop 28 revoked: A.2 leave-one-out not lower under both weightings (skeleton-weighted 0.20 -> 0.21)'],
];

describe('stop 26 / 28: rules and gates', () => {
  it('the declared classes are exactly the adopted plus the not-adopted ones; only the adopted have a rule', () => {
    expect([...ADOPTED, ...NOT_ADOPTED.map(r => r[0])].sort()).toEqual(S26_CLASSES.map(d => d.id).sort());
    expect(Object.keys(RULES).sort()).toEqual([...ADOPTED].sort());
    expect(V12_CONFIG.v142Nmrshiftdb2.gate).toEqual({minSkeletons: 3, worseItemPpm: 0.15, worseSourcePpm: 0.05, unreportedConsistentPpm: 0.1});
  });
  it('no new flag: the gate of a class is v140.oxygen (O-CH, acetal-type), v140.calibration2, or calibration2 + round3 (small carbocycles)', () => {
    const gate = (id: string) => S26_CLASSES.find(d => d.id === id)!.gate;
    for (const id of ['OCH_ETHER_RING_ALPHA_QUAT', 'OCH_ETHER_RING_NO_QUAT', 'ACETAL_CH_RING', 'OCH2O_ARYL']) expect(gate(id), id).toBe('oxygen');
    for (const id of ['INDOLE_H2', 'BENZOFURAN_H2']) expect(gate(id), id).toBe('calibration2');
    for (const id of ['CYCLOPROPANE_CH', 'CYCLOBUTANE_CH']) expect(gate(id), id).toBe('calibration2+round3');
    expect(s26GateOpen('calibration2+round3', {oxygen: true, calibration2: true, round3: false})).toBe(false);
    const flagsNow = Object.keys(V12_CONFIG.v140).sort();
    expect(flagsNow).toEqual(['alkene', 'calibration2', 'coverage', 'matching', 'oxygen', 'parseFix', 'plausibility', 'round3', 'solvent']);
  });
  const PROBE: [string, string][] = [['1,3-benzodioxole', 'c1ccc2c(c1)OCO2'], ['2-methoxytetrahydropyran', 'COC1CCCCO1'], ['indole', 'c1ccc2[nH]ccc2c1'], ['cyclopropyl methyl ketone', 'CC(=O)C1CC1']];
// the classes revoked / not adopted in stop 28 must not move at all (isopropyl acetate, dimethoxymethane, propylene oxide, 1-hexene, an open-chain acetal)
const REVOKED_PROBE: [string, string][] = [['isopropyl acetate', 'CC(=O)OC(C)C'], ['isopropyl formate', 'O=COC(C)C'], ['isopropyl phenyl ether', 'CC(C)Oc1ccccc1'], ['dimethoxymethane', 'COCOC'], ['1,3-dioxolane', 'C1COCO1'], ['propylene oxide', 'CC1CO1'], ['ethylene oxide', 'C1CO1'], ['1-hexene', 'C=CCCCC'], ['1,1-diethoxyethane', 'CC(OCC)OCC'], ['bromoacetaldehyde dimethyl acetal', 'COC(CBr)OC']];
  const pred = (smi: string) => (NMRGraphPredictor.predict1HFromStructureGraph(ChemistryEngine.parseStructureInput({smiles: smi}), {solvent: 'CDCl3'}).environments as {shiftPpm: number}[]).map(e => e.shiftPpm);
  it('useV140H1 off (whatever the sub-flags): the rules change nothing', () => {
    V12_CONFIG.useV140H1 = false; Object.assign(V12_CONFIG.v140, {oxygen: true, calibration2: true, round3: true});
    for (const [n, s] of PROBE) expect(withRules(true, () => pred(s)), n).toEqual(withRules(false, () => pred(s)));
  });
  it('oxygen on, calibration2 off: only the oxygen classes move; calibration2 on, round3 off: the small carbocycles do not move', () => {
    const moved = (sub: Partial<typeof V12_CONFIG.v140>) => PROBE.filter(([, s]) => { ALL_ON(); Object.assign(V12_CONFIG.v140, sub); const a = withRules(false, () => pred(s)); ALL_ON(); Object.assign(V12_CONFIG.v140, sub); const b = withRules(true, () => pred(s)); return JSON.stringify(a) !== JSON.stringify(b); }).map(p => p[0]);
    expect(moved({calibration2: false})).toEqual(['1,3-benzodioxole', '2-methoxytetrahydropyran']);
    expect(moved({round3: false})).toEqual(['1,3-benzodioxole', '2-methoxytetrahydropyran', 'indole']);
    expect(moved({})).toEqual(['1,3-benzodioxole', '2-methoxytetrahydropyran', 'indole', 'cyclopropyl methyl ketone']);
  });
  it('stop 28: the revoked / not adopted classes do not move any hydrogen (every v1.4.x 1H layer on, rules on = rules off)', () => {
    ALL_ON();
    for (const [n, smi] of REVOKED_PROBE) expect(withRules(true, () => pred(smi)), n).toEqual(withRules(false, () => pred(smi)));
  });
});

describe('stop 26: truth table, license, extraction', () => {
  it('the license text sits next to the truth table (the file the user downloaded, unchanged) and the table carries the notice and the source', () => {
    const lic = fs.readFileSync(path.join(FIXDIR, 'nmrshiftdb2datalicense.txt'));
    expect(crypto.createHash('sha256').update(lic).digest('hex')).toBe('00322cc450c2e53e305c082e1ab7454f108b7df51c0dbee0a07932666b245516');
    expect(lic.toString('utf8')).toContain('4.3 Notice for using output (Contents)');
    const t = loadTruthFile();
    expect(String(t.meta.notice)).toBe('Contains information from nmrshiftdb2 (www.nmrshiftdb.org), which is made available here under the nmrshiftdb2 Database License.');
    expect(String(t.meta.license)).toContain('https://nmrshiftdb.nmr.uni-koeln.de/nmrshiftdbhtml/nmrshiftdb2datalicense.txt');
    expect(String(t.meta.source)).toContain('0e86688360e23c88ccf0eb82a1251315fa57ec6f5b376dc8886f3311793a0afe');
    expect(String(t.meta.sourceLabel)).toContain('NMRShiftDB2');
  });
  it('the attribution (license section 4.3 example notice + license URI) is in docs/licenses/Data-Sources.txt (deployed in /THIRD_PARTY_NOTICES.txt), THIRD_PARTY_NOTICES.md and the fixture README', () => {
    const ROOT = path.resolve(here, '..', '..');
    const notice = 'Contains information from nmrshiftdb2 (www.nmrshiftdb.org), which is made available here under the nmrshiftdb2 Database License.';
    const uri = 'https://nmrshiftdb.nmr.uni-koeln.de/nmrshiftdbhtml/nmrshiftdb2datalicense.txt';
    for (const f of [path.join(ROOT, 'docs', 'licenses', 'Data-Sources.txt'), path.join(ROOT, 'THIRD_PARTY_NOTICES.md')]) { const s = fs.readFileSync(f, 'utf8'); expect(s, f).toContain(notice); expect(s, f).toContain(uri); }
    const readme = fs.readFileSync(path.join(FIXDIR, 'README.md'), 'utf8');
    expect(readme).toContain('Contains information from nmrshiftdb2 (www.nmrshiftdb.org)'); expect(readme).toContain(uri);
    expect(fs.readFileSync(path.join(ROOT, 'THIRD_PARTY_NOTICES.md'), 'utf8')).toContain('4.5');
  });
  it('only adopted classes, only CDCl3, each entry with its nmrshiftdb2 ID / spectrum / solvent; no excluded record among the entries', () => {
    const t = loadTruthFile();
    expect(new Set(t.entries.map(e => e.cls))).toEqual(new Set(ADOPTED));
    for (const e of t.entries) { expect(CDCL3_LABELS).toContain(e.solvent); expect(e.id).toMatch(/^\d+$/); expect(Number.isInteger(e.spectrum)).toBe(true); }
    expect(t.entries.some(e => S26_EXCLUDED.some(x => x.id === e.id))).toBe(false);
    expect(t.excluded.map(e => [e.id, e.cls])).toEqual([['20092495', 'OCH_ETHER_RING_ALPHA_QUAT']]);
    expect(t.entries.length).toBe(102);
    expect(new Set(t.entries.map(e => e.smiles)).size).toBe(71);
    // stop 28: the entries of the revoked classes are gone (the table keeps only what a deployed rule uses); every entry has the class the CURRENT class definitions give
    for (const e of t.entries) expect(s26Class(graphOf(e.smiles)!, e.atoms[0]), `${e.id} ${e.cls}`).toBe(e.cls);
  });
  it('extraction record: 177 computed 1H spectra excluded (Spartan 174, Quantum ESPRESSO 3; none had a solvent), 18,045 measured kept; solvent distribution of the measured ones', () => {
    const s = JSON.parse(fs.readFileSync(path.join(FIXDIR, 'extraction_stats.json'), 'utf8'));
    expect(s.counts['1H spectra']).toBe(18222);
    expect(s.counts['1H spectra excluded: computed (total)']).toBe(177);
    expect(s.counts['1H spectra kept as measured']).toBe(18045);
    expect(s.programOfComputed1H).toEqual({Spartan: 174, 'Quantum ESPRESSO': 3});
    expect(s.solventOfComputed1H).toEqual({'(no solvent entry)': 177});
    expect(s.solventOfMeasured1H.Unreported).toBe(15705);
    expect(s.solventOfMeasured1H['Chloroform-D1 (CDCl3)']).toBe(1169);
    expect(s.unreadableSignalCount).toBe(0);
    // stop 33: the file carries the nmrshiftdb2 notice itself (license section 4.2), not only the folder README
    expect(s.notice).toBe('Contains information from nmrshiftdb2 (www.nmrshiftdb.org), which is made available here under the nmrshiftdb2 Database License.');
    expect(s.license).toContain('nmrshiftdb2datalicense.txt');
  });
  it('the extractor drops a computed spectrum and an auto-assigned one and keeps the measured one (synthetic SD; skipped when no python)', () => {
    const py = ['python', 'python3'].find(p => spawnSync(p, ['--version']).status === 0);
    if (!py) return;
    const mol = ['', '  test', '', '  2  1  0  0  0  0  0  0  0  0999 V2000', '    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0', '    1.0000    0.0000    0.0000 O   0  0  0  0  0  0  0  0  0  0  0  0', '  1  2  1  0  0  0  0', 'M  END'];
    const rec = (id: number, extra: string[]) => [...mol, '> <nmrshiftdb2 ID>', String(id), '', ...extra, '$$$$'].join('\n');
    const sd = [
      rec(1, ['> <Spectrum 1H 0>', '3.38;0.0;0|', '', '> <Solvent>', '0:Chloroform-D1 (CDCl3) ', '']),
      rec(2, ['> <Spectrum 1H 1>', '3.10;0.0;0|', '', '> <NMRProgram>', '1:Spartan ', '', '> <NMRMethod>', '1:Hartree-Fock ', '']),
      rec(3, ['> <Spectrum 1H 0>', '3.40;0.0;0|', '', '> <Solvent>', '0:Chloroform-D1 (CDCl3) ', '', '> <Assignment Method>', '0:nmrshiftdb2 auto assignment ', '']),
    ].join('\n') + '\n';
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 's26-'));
    fs.writeFileSync(path.join(dir, 'in.sd'), sd);
    const r = spawnSync(py, ['-I', path.resolve(here, '..', '..', 'scripts', 'nmrshiftdb2', 'extract_h1.py'), path.join(dir, 'in.sd'), path.join(dir, 'out')]);
    expect(r.status, String(r.stderr)).toBe(0);
    const kept = fs.readFileSync(path.join(dir, 'out', 'h1_records.jsonl'), 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
    expect(kept.map(k => k.id)).toEqual(['1']);
    const st = JSON.parse(fs.readFileSync(path.join(dir, 'out', 'extract_stats.json'), 'utf8'));
    expect(st.counts['1H spectra excluded: computed (total)']).toBe(1);
    expect(st.counts['1H spectra excluded: nmrshiftdb2 auto assignment']).toBe(1);
    expect(st.notice).toBe('Contains information from nmrshiftdb2 (www.nmrshiftdb.org), which is made available here under the nmrshiftdb2 Database License.');   // stop 33: the extractor writes the notice into its output
    fs.rmSync(dir, {recursive: true, force: true});
  });
});

describe('stop 26: classes (SMARTS = structure-graph definition)', () => {
  const PROBES: [string, string][] = [
    ['isopropyl acetate', 'CC(=O)OC(C)C'], ['cyclohexyl acetate', 'CC(=O)OC1CCCCC1'], ['isopropyl formate', 'O=COC(C)C'], ['2-propanol', 'CC(C)O'], ['cyclohexanol', 'OC1CCCCC1'], ['2-methyltetrahydrofuran', 'CC1CCCO1'],
    ['diisopropyl ether', 'CC(C)OC(C)C'], ['isopropyl phenyl ether', 'CC(C)Oc1ccccc1'], ['1,1-dimethoxyethane', 'CC(OC)OC'], ['trimethyl orthoformate', 'COC(OC)OC'], ['dimethoxymethane', 'COCOC'], ['1,3-benzodioxole', 'c1ccc2c(c1)OCO2'],
    ['1,3-dioxolane', 'C1COCO1'], ['propylene oxide', 'CC1CO1'], ['oxetane', 'C1COC1'], ['cyclopropanecarboxylic acid', 'OC(=O)C1CC1'], ['cyclobutanone', 'O=C1CCC1'], ['benzocyclobutene', 'C1Cc2ccccc12'], ['pinane', 'CC1CCC2CC1C2(C)C'],
    ['indole', 'c1ccc2[nH]ccc2c1'], ['1-methylindole', 'Cn1ccc2ccccc21'], ['1-phenylindole', 'c1ccc(-n2ccc3ccccc32)cc1'], ['1-Boc-indole', 'CC(C)(C)OC(=O)n1ccc2ccccc21'], ['benzofuran', 'c1ccc2occc2c1'], ['benzothiophene', 'c1ccc2sccc2c1'],
    ['2-pyrrolidinone', 'O=C1CCCN1'], ['N-methylpyrrolidinone', 'CN1CCCC1=O'], ['caprolactam', 'O=C1CCCCCN1'], ['succinimide', 'O=C1CCC(=O)N1'], ['1-hexene', 'C=CCCCC'], ['isobutylene', 'C=C(C)C'], ['methylenecyclohexane', 'C=C1CCCCC1'],
    ['3-buten-2-ol', 'C=CC(C)O'], ['vinyl acetate', 'C=COC(C)=O'], ['methylenecyclobutane', 'C=C1CCC1'], ['glycerol triacetate', 'CC(=O)OCC(COC(C)=O)OC(C)=O'],
  ];
  it('the RDKit SMARTS class and the structure-graph class agree on every H-bearing atom of the probes and of the truth table', () => {
    const bad: string[] = [];
    const check = (smi: string) => { const {cls} = smartsClasses(smi); const g = graphOf(smi)!; g.atoms.forEach((a, i) => { if (a.totalHydrogens < 1) return; const x = cls.get(i) ?? null, y = s26Class(g, i); if (x !== y) bad.push(`${smi} ${i}: ${x} / ${y}`); }); };
    for (const [, s] of PROBES) check(canonicalizeMolecule(s).canonical);   // the structure graph is built from the RDKit canonical SMILES, so the probes are canonicalised first
    for (const s of new Set(loadTruthFile().entries.map(e => e.smiles))) check(s);
    expect(bad).toEqual([]);
  });
  it('spot checks (the class of named atoms)', () => {
    const at = (raw: string, smarts: string) => { const smi = canonicalizeMolecule(raw).canonical; const g = graphOf(smi)!; const {cls} = smartsClasses(smi); const hits = [...cls.keys()].filter(i => cls.get(i) === smarts); return hits.length ? s26Class(g, hits[0]) : null; };
    expect(at('CC(=O)OC(C)C', 'OCH_ESTER_CHAIN')).toBe('OCH_ESTER_CHAIN');
    expect(at('CC(=O)OC1CCCCC1', 'OCH_ESTER_RING')).toBe('OCH_ESTER_RING');
    expect(at('c1ccc2c(c1)OCO2', 'OCH2O_ARYL')).toBe('OCH2O_ARYL');
    expect(at('c1ccccc1OCOc1ccccc1', 'OCH2O_ARYL')).toBe('OCH2O_ARYL');   // diaryl formal: both oxygens on an aromatic carbon, not necessarily one ring
    expect(at('COCOC', 'OCH2O_ALIPH')).toBe('OCH2O_ALIPH'); expect(at('C1COCO1', 'OCH2O_ALIPH')).toBe('OCH2O_ALIPH'); expect(at('COCOc1ccccc1', 'OCH2O_ALIPH')).toBe('OCH2O_ALIPH');   // mixed = aliphatic part
    expect(at('COC1CCCCO1', 'ACETAL_CH_RING')).toBe('ACETAL_CH_RING'); expect(at('CC(OCC)OCC', 'ACETAL_CH_CHAIN')).toBe('ACETAL_CH_CHAIN');
    expect(at('CC1(C)CCCOC1C', 'OCH_ETHER_RING_ALPHA_QUAT')).toBe('OCH_ETHER_RING_ALPHA_QUAT');   // 2,3,3-trimethyl-THP: the C3 neighbour of the O-CH carbon has no H and four heavy neighbours
    expect(at('C1CCOC1C', 'OCH_ETHER_RING_NO_QUAT')).toBe('OCH_ETHER_RING_NO_QUAT');
    expect(at('c1ccc(-n2ccc3ccccc32)cc1', 'INDOLE_H2')).toBe('INDOLE_H2');   // the parser gives this n one H as well; the class counts heavy neighbours
    expect(at('C=C1CCC1', 'ALKENE_ISO_CH2')).toBeNull();
    expect(at('C=COC(C)=O', 'ALKENE_1_CH')).toBeNull();
  });
  it('the small carbocycle classes stay inside the round3 domain (round3Class) on every truth-table atom', () => {
    for (const e of loadTruthFile().entries.filter(x => x.cls.startsWith('CYCLO'))) {
      const r = round3Class(graphOf(e.smiles)!, e.atoms[0]);
      expect(r?.l0, `${e.id} ${e.smiles}`).toBe(e.cls === 'CYCLOPROPANE_CH' ? 'CYCLOPROPANE_METHINE' : 'CYCLOBUTANE_CH');
    }
  });
});

let before: S26Item[] = [], after: S26Item[] = [];
describe('stop 28: the gate A (from the truth tables in the repository) reproduces the deployed rules', () => {
  it.skipIf(NEED_F)('every adopted class passes the gate A again (nmrshiftdb2 table + older truth sets) and V12_CONFIG.v142Nmrshiftdb2.rules is exactly the fit (shift +-0.006, counts, both mean errors +-0.006, held-out half, per-source errors)', () => {
    ALL_ON(); applySetting(BEFORE);
    const E = loadTruthFile().entries;
    before = withRules(false, () => itemsFromTruth(E, BEFORE));
    const {N, O} = withRules(false, () => ({N: newItems(E), O: oldItems()}));
    const rows = ['class | compounds (new + old) | skeletons | delta | before comp / skel | leave-one-out comp / skel | in-sample after comp / skel | held-out half | source error new / old | A.1 A.2 A.3a A.3b'];
    const near = (x: number, y: number, what: string) => expect(Math.abs(x - y), what).toBeLessThan(0.006);
    for (const id of ADOPTED) {
      const r = gateClass(id, N.filter(i => i.cls === id), O.filter(i => i.cls === id && i.fit), O.filter(i => i.cls === id)), R = RULES[id];
      rows.push(`${id} | ${r.nCompoundsNew} + ${r.nCompoundsOld} | ${r.nSkeletons} | ${sg(r.delta)} | ${f2(r.before.comp)} / ${f2(r.before.skel)} | ${f2(r.loo.comp)} / ${f2(r.loo.skel)} | ${f2(r.after.comp)} / ${f2(r.after.skel)} | ${r.held ? `${r.held.nHeld}: ${f2(r.held.before.comp)} -> ${f2(r.held.after.comp)} / ${f2(r.held.before.skel)} -> ${f2(r.held.after.skel)}` : '—'} | ${r.src.new ? f2(r.src.new.before) + ' -> ' + f2(r.src.new.after) : '—'} / ${r.src.old ? f2(r.src.old.before) + ' -> ' + f2(r.src.old.after) : '—'} | ${r.a1} ${r.a2} ${r.a3a} ${r.a3b}`);
      expect(r.reasons, id).toEqual([]); expect(r.pass, id).toBe(true);
      near(R.deltaPpm, r.delta, id + ' delta'); expect(R.nCompounds, id).toBe(r.nCompounds); expect(R.nSkeletons, id).toBe(r.nSkeletons); expect(R.nCompoundsOld, id).toBe(r.nCompoundsOld);
      near(R.before.c, r.before.comp, id + ' before c'); near(R.before.s, r.before.skel, id + ' before s'); near(R.leaveOneOut.c, r.loo.comp, id + ' loo c'); near(R.leaveOneOut.s, r.loo.skel, id + ' loo s'); near(R.after.c, r.after.comp, id + ' after c'); near(R.after.s, r.after.skel, id + ' after s');
      expect(R.smallSample, id).toBe(r.nCompounds < V12_CONFIG.v142Nmrshiftdb2.heldOutMinCompounds);
      if (r.nCompounds >= V12_CONFIG.v142Nmrshiftdb2.heldOutMinCompounds) { expect(R.heldOut, id).not.toBeNull(); expect(R.heldOut!.n).toBe(r.held!.nHeld); near(R.heldOut!.after.c, r.held!.after.comp, id + ' held c'); near(R.heldOut!.after.s, r.held!.after.skel, id + ' held s'); expect(r.held!.falls, id).toBe(true); } else expect(R.heldOut, id).toBeNull();
      if (r.src.new) { near(R.sourceError.new![0], r.src.new.before, id + ' new before'); near(R.sourceError.new![1], r.src.new.after, id + ' new after'); } else expect(R.sourceError.new).toBeNull();
      if (r.src.old) { near(R.sourceError.old![0], r.src.old.before, id + ' old before'); near(R.sourceError.old![1], r.src.old.after, id + ' old after'); } else expect(R.sourceError.old).toBeNull();
    }
    notes.push('=== stop 28 gate A (truth tables in the repository; c = compound-weighted, s = skeleton-weighted)', ...rows, '');
  });
  it.skipIf(NEED_F)('the merged ether O-CH ring class (both parts together) does NOT pass the gate: its held-out half (seed 20261114, split by skeleton) rises; ring size and oxygen-outside-ring partitions each have a failing part; alpha-quaternary is the partition whose every part passes (C of the planner)', () => {
    ALL_ON();
    const E = loadTruthFile().entries.filter(e => e.cls.startsWith('OCH_ETHER_RING'));
    const run = (part: typeof plainPartition, ids: string[]) => withRules(false, () => { const N = newItems(E, part), O = oldItems(part); return ids.map(id => gateClass(id, N.filter(i => i.cls === id), O.filter(i => i.cls === id && i.fit), O.filter(i => i.cls === id))); });
    const [merged] = run((_g, _i, c) => (c?.startsWith('OCH_ETHER_RING') ? 'OCH_ETHER_RING' : c), ['OCH_ETHER_RING']);
    expect(merged.nCompounds).toBe(28); expect(merged.nSkeletons).toBe(17); expect(merged.pass).toBe(false);
    expect(merged.reasons.join(' ')).toMatch(/A\.2: held-out half not lower \(compound 0\.40 -> 0\.51/);
    const size = run(PARTITIONS.size, ['OCH_ETHER_RING.ring5', 'OCH_ETHER_RING.ring6']);
    expect(size.map(r => r.pass)).toEqual([true, false]); expect(size[1].reasons.join(' ')).toMatch(/A\.2: leave-one-out not lower/);
    const ox = run(PARTITIONS.oxygenOutside, ['OCH_ETHER_RING.oxInRing', 'OCH_ETHER_RING.oxOutside']);
    expect(ox.map(r => r.pass)).toEqual([false, true]); expect(ox[0].reasons.join(' ')).toMatch(/A\.2: held-out half not lower/);
    const quat = run(PARTITIONS.alphaQuaternary, ['OCH_ETHER_RING.alphaNoQuat', 'OCH_ETHER_RING.alphaQuat']);
    expect(quat.map(r => r.pass)).toEqual([true, true]); expect(quat.map(r => r.nSkeletons)).toEqual([15, 3]);
    notes.push('=== C: ether O-CH ring partitions (the merged class and the three pre-approved features)', `merged: ${merged.nCompounds} compounds / ${merged.nSkeletons} skeletons, held-out ${merged.held ? f2(merged.held.before.comp) + ' -> ' + f2(merged.held.after.comp) : '—'}: ${merged.reasons.join('; ')}`, ...[...size, ...ox, ...quat].map(r => `${r.cls}: ${r.nCompounds} compounds / ${r.nSkeletons} skeletons, LOO ${f2(r.before.comp)} -> ${f2(r.loo.comp)} (skeleton-weighted ${f2(r.before.skel)} -> ${f2(r.loo.skel)}) ${r.pass ? 'PASS' : 'FAIL: ' + r.reasons.join('; ')}`), '');
  });
  it.skipIf(NEED_F)('before / after per adopted class (truth table, in-sample): mean, median, share > 0.3 ppm; the engine moves every item by exactly its class shift', () => {
    ALL_ON();
    after = withRules(true, () => itemsFromTruth(loadTruthFile().entries, {...BEFORE, name: 'stop26 after'}));
    expect(after.length).toBe(before.length);
    after.forEach((a, i) => expect(Math.abs((before[i].predicted - a.predicted) + RULES[a.cls].deltaPpm), `${a.id} ${a.cls}`).toBeLessThan(0.002));
    const rows = ['class | compounds | before mean | median | >0.3 | after mean | median | >0.3'];
    for (const cls of ADOPTED) {
      const b = errorSummary(compoundErrors(before.filter(i => i.cls === cls))), a = errorSummary(compoundErrors(after.filter(i => i.cls === cls)));
      rows.push(`${cls} | ${b.n} | ${f2(b.mean)} | ${f2(b.median)} | ${(100 * b.over03).toFixed(0)}% | ${f2(a.mean)} | ${f2(a.median)} | ${(100 * a.over03).toFixed(0)}%`);
      expect(a.mean, cls).toBeLessThan(b.mean);
    }
    notes.push('=== before / after per adopted class (in-sample; the leave-one-out figure is in the fit table)', ...rows, '');
  });
});

describe('stop 26: the shifts were fitted on the full stack; where its gate opens, a class has the same "before" in the smaller stacks', () => {
  it('oxygen classes: identical with only the useV140H1 defaults (alkene + oxygen); epoxide differs only without calibration2, cyclopropane CH only without round3 (their gates); cyclobutane CH needs neither (gated with round3 anyway, as declared)', () => {
    const E = loadTruthFile().entries;
    const run = (s: typeof BEFORE) => withRules(false, () => { applySetting(s); return itemsFromTruth(E, s); });
    const full = run(BEFORE), base = run({...SETTINGS.base, name: 's26 base'}), noR3 = run({...SETTINGS.stackCal2, name: 's26 noR3'});
    const differs = (other: S26Item[]) => [...new Set(full.filter((x, i) => Math.abs(other[i].predicted - x.predicted) > 1e-9).map(x => x.cls))].sort();
    expect(differs(base)).toEqual(['CYCLOPROPANE_CH']);   // stop 28: EPOXIDE_H is no longer a deployed class
    expect(differs(noR3)).toEqual(['CYCLOPROPANE_CH']);
  });
});

describe('stop 26: effect on the older truth sets (tier 1 CDCl3, tier 2 rounds 1-2, round 3), every v1.4.x 1H layer on, rules off / on', () => {
  it.skipIf(NEED_F)('lists every signal that moves and every one that gets worse by more than 0.15 ppm', () => {
    ALL_ON();
    const run = (on: boolean) => withRules(on, () => [...evalTier1({...BEFORE, name: `t-${on}`}, 'CDCl3'), ...evalTier2({...BEFORE, name: `t-${on}`}, 'round1'), ...evalTier2({...BEFORE, name: `t-${on}`}, 'round2'), ...evalTier3({...BEFORE, name: `t-${on}`})]);
    const b = run(false), a = run(true);
    expect(a.length).toBe(b.length);
    const moved: string[] = [], worse: string[] = [];
    const keep = (i: Item) => !i.exchangeable && i.error !== null && !i.rangeOnly;
    b.forEach((x, k) => { const y = a[k]; if (!keep(x) || !keep(y)) return; const d = Math.abs(y.error!) - Math.abs(x.error!); if (Math.abs(y.predicted! - x.predicted!) > 1e-9) moved.push(`${x.compound} | ${x.label} | truth ${f2(x.truth)} | ${sg(x.error!)} -> ${sg(y.error!)}`); if (d > 0.15) worse.push(`${x.compound} ${x.label}: ${sg(x.error!)} -> ${sg(y.error!)}`); });
    const m = (arr: Item[]) => { const v = arr.filter(keep).map(i => Math.abs(i.error!)); return v.reduce((s, t) => s + t, 0) / v.length; };
    notes.push('=== older truth sets: signals the stop-26 rules move (error = prediction - truth)', ...moved, `moved: ${moved.length}; mean error of all ${b.filter(keep).length} signals ${f2(m(b))} -> ${f2(m(a))}`, 'worse by > 0.15 ppm: ' + (worse.length ? worse.join('; ') : 'none'), '');
    // PINNED (stop 28): the gate A (A.3a) requires that no older signal gets worse by more than 0.15 ppm; the count is 0.
    expect(worse).toEqual([]);
    notes.push(`stop 28 target: older signals worse by more than 0.15 ppm = ${worse.length} (target 0)`, '');
    // PINNED (stop 28): 19 older signals move (indole H2, benzofuran H2, 13 cyclopropyl methines + 3 ring CH of cyclopropylmethyl compounds, 3-bromocyclobutanone); the mean over all 444 does not rise (0.18 -> 0.17).
    expect(moved.length).toBe(19);
  });
});

type SPeakT = {x: number; integration: number; multiplicity: string};
const fx = (id: string, formula: string, smiles: string, h1: SPeakT[]): V121Fixture => ({
  id, description: 'literature 1H table (CDCl3)', targetSmiles: smiles, formula,
  h1: {solvent: 'CDCl3', frequencyMHz: 400, peaks: h1}, ir: {yAxis: 'transmittance percent', coverageCm1: [4000, 450], calibrated: true, peaks: [{x: 2970, y: 40}, {x: 1100, y: 20}]},
} as V121Fixture);
const h1Score = (smi: string, f: V121Fixture) => scoreScientificEvidence(smi, WorkbenchOrchestrator.prepareModeAEvidence(fixtureSpectra(f, {denseBaseline: true}), {}).bundle).modalityScores['1H_NMR'] as number;
describe('stop 26: the 31 single-compound spectra and the 55-structure panel (every v1.4.x 1H layer on), rules off / on', () => {
  it.skipIf(NEED_F)('31 single-compound 1H scores: the changes', () => {
    const run = (on: boolean) => STOP7_SPECTRA.map(([name, smi, formula, peaks]) => { ALL_ON(); return {name, v: withRules(on, () => h1Score(smi, fx(name, formula, smi, peaks)))}; });
    const off = run(false), on = run(true);
    expect(on.length).toBe(31);
    const rows: string[] = ['compound | 1H score rules off | on | change'];
    on.forEach((r, i) => { const d = r.v - off[i].v; if (Math.abs(d) >= 0.05) rows.push(`${r.name} | ${off[i].v.toFixed(1)} | ${r.v.toFixed(1)} | ${sg(d)}`); });
    notes.push('=== 31 single-compound 1H scores (changed ones only)', ...rows, `unchanged: ${on.filter((r, i) => Math.abs(r.v - off[i].v) < 0.05).length} of 31`, '');
    // PINNED (stop 28): no single-compound spectrum changes (stop 26: only propylene, through the 1-alkene =CH shift that is revoked now)
    expect(on.map((r, i) => [r.name, Number((r.v - off[i].v).toFixed(1))]).filter(x => x[1] !== 0)).toEqual([]);
  }, 600000);
  it('55-structure panel: each structure scored against ITS OWN rules-off prediction; the structures the rules touch', () => {
    const rows: string[] = ['structure | SMILES | 1H score rules off | on | change'], touched: string[] = [];
    for (const [name, smi] of REAL_STRUCTURE_PANEL.map(r => [r[0], r[1]] as [string, string])) {
      ALL_ON();
      const st = ChemistryEngine.parseStructureInput({smiles: smi});
      const envs = withRules(false, () => NMRGraphPredictor.predict1HFromStructureGraph(st, {solvent: 'CDCl3'}).environments.filter(e => !e.isExchangeable));
      const peaks = envs.map(e => ({x: Number(e.shiftPpm.toFixed(2)), integration: e.integration ?? 1, multiplicity: 's'}));
      const f = fx(name, st.molecularFormula, smi, peaks.length ? peaks : [{x: 1, integration: 1, multiplicity: 's'}]);
      const a = withRules(false, () => h1Score(smi, f)), b = withRules(true, () => h1Score(smi, f));
      if (Math.abs(b - a) >= 0.05) { rows.push(`${name} | ${smi} | ${a.toFixed(1)} | ${b.toFixed(1)} | ${sg(b - a)}`); touched.push(name); }
    }
    notes.push('=== 55-structure panel (1H score against the structure own rules-off prediction)', ...rows, `structures changed: ${touched.length}`, '');
    expect(REAL_STRUCTURE_PANEL.length).toBe(55);
    // PINNED (stop 28): 14 structures are touched (sugars and their cyclic acetals, benzofuran, THF/THP ethers; stop 26: 28). A touched structure can only lose against its own old list; this lists which ones the rules reach.
    // The epoxides, dimethoxymethane, 1,3-dioxolane and 1,3,5-trioxane are no longer touched (those classes were revoked / not adopted).
    expect(touched.length).toBe(14);
    expect(touched).toContain('benzofuran'); expect(touched).toContain('2-methoxytetrahydropyran');
    for (const n of ['1,3,5-trioxane', 'dimethoxymethane', '1,3-dioxolane', 'ethylene oxide', 'propylene oxide', 'styrene oxide', 'cyclohexene oxide', 'acetaldehyde diethyl acetal']) expect(touched, n).not.toContain(n);
  }, 600000);
});
