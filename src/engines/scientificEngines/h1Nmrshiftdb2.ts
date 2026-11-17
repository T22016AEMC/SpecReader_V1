import type {ParsedSmilesGraph, SmilesAtomNode} from '../chemistryEngine';
import type {ProtonEnvironment, SpectralPeak} from '../../types/spectrum';
import {V12_CONFIG} from '../constraints/v12Config';
import {smallestRingAtoms} from './h1Calibration2';
import {round3Class} from './h1Round3';

/**
 * v1.4.2 stop 26 (no new flag; under the existing sub-flags v140.oxygen and v140.calibration2, both need useV140H1, DEFAULT OFF): class corrections of the 1H predictor from MEASURED CDCl3 1H spectra of nmrshiftdb2.
 *
 * Contains information from nmrshiftdb2 (www.nmrshiftdb.org), which is made available here under the nmrshiftdb2 Database License
 * (https://nmrshiftdb.nmr.uni-koeln.de/nmrshiftdbhtml/nmrshiftdb2datalicense.txt). The truth values used are in tests/fixtures/v140/nmrshiftdb2/ (with the license text);
 * the extraction method is scripts/nmrshiftdb2/extract_h1.py. These values are a separate source, NOT tier 1 / tier 2 of stops 10-22.
 *
 * Classes (declared in notes/v1.4.2/STOP26_CHECKPOINT.md before any error number was computed): each class is given as a SMARTS on the H-bearing atom (S26_CLASSES); s26Class is the same definition on the
 * predictor's structure graph (tests/v14/v142Nmrshiftdb2.test.ts checks that both agree). The class is a function of the structure graph only (no shift value is looked at).
 * Stage-1 rule (planner, stops 13/22/26): >= 3 independent compounds (distinct canonical SMILES), leave-one-out mean error lower, mean error before above 0.15 ppm; classes with >= 20 compounds also need a lower error on a 50 % held-out
 * half (seeded); ONE additive shift per class.
 * Stop 28 (notes/v1.4.2/STOP28_CHECKPOINT.md, tests/helpers/v142S28.ts): the adoption gate A replaced the weighting and added: >= 3 different Bemis-Murcko skeletons, skeleton-weighted shift, leave-one-out / held-out lower under both weightings, no older-truth signal worse by more than 0.15 ppm,
 * merged refit with the older truth where both exist. Classes split on a structural feature with a chemical reason (O-CH2-O aryl / aliphatic, ether O-CH ring by an alpha quaternary carbon, acetal C-H ring / chain); 8 classes deployed (V12_CONFIG.v142Nmrshiftdb2.rules), the others are declared here but have no rule. The shifts were fitted against the stack of every v1.4.x 1H layer (alkene, oxygen, coverage, solvent, calibration2, round3) and are applied after round3.
 */
export const S26_CITATION_ID = 'NMRSHIFTDB2_STOP26';   // (the id is kept: it names the source layer introduced in stop 26; stop 28 re-fitted its rules under the gate A)
export type S26Gate = 'oxygen' | 'calibration2' | 'calibration2+round3';
export interface S26ClassDef {id: string; gate: S26Gate; smarts: string; labelZh: string}

const LACTAM_N = ['[CX4]1[NX3][CX3](=O)[#6][#6]1', '[CX4]1[NX3][CX3](=O)[#6][#6][#6]1', '[CX4]1[NX3][CX3](=O)[#6][#6][#6][#6]1'];
const LACTAM_A = ['[CX4]1[CX3](=O)[NX3][#6][#6]1', '[CX4]1[CX3](=O)[NX3][#6][#6][#6]1', '[CX4]1[CX3](=O)[NX3][#6][#6][#6][#6]1'];
const LACTAM_R = ['[CX4]1[#6][CX3](=O)[NX3][#6]1', '[CX4]1[#6][CX3](=O)[NX3][#6][#6]1', '[CX4]1[#6][NX3][CX3](=O)[#6][#6]1', '[CX4]1[#6][CX3](=O)[NX3][#6][#6][#6]1', '[CX4]1[#6][#6][CX3](=O)[NX3][#6][#6]1', '[CX4]1[#6][NX3][CX3](=O)[#6][#6][#6]1'];
const LACTAM_M = ['[CH3][NX3]1[CX3](=O)[#6][#6][#6]1', '[CH3][NX3]1[CX3](=O)[#6][#6][#6][#6]1', '[CH3][NX3]1[CX3](=O)[#6][#6][#6][#6][#6]1'];
const rec = (head: string, alts: string[]) => `[${head};${alts.map(a => `$(${a})`).join(',')}]`;
const OCH = (ring: boolean, o: string) => `[CX4H1;${ring ? 'R;!r3;!r4' : '!R'};D3;${o}]`;
const PLAIN_R = '[CX4;!$([CX4][!#6])]';
const C4RING = '[CX4,$([CX3]=[OX1]),c]';

/** The classes in priority order (the first that matches is the class of the atom). */
export const S26_CLASSES: S26ClassDef[] = [
  {id: 'OCH_ALCOHOL_CHAIN', gate: 'oxygen', smarts: OCH(false, '$([CX4]([CX4])([CX4])[OX2H1])'), labelZh: '醇 O–CH 次甲基（鏈狀）'},
  {id: 'OCH_ALCOHOL_RING', gate: 'oxygen', smarts: OCH(true, '$([CX4]([CX4])([CX4])[OX2H1])'), labelZh: '醇 O–CH 次甲基（環內）'},
  {id: 'OCH_ETHER_CHAIN', gate: 'oxygen', smarts: OCH(false, '$([CX4]([CX4])([CX4])[OX2][CX4])'), labelZh: '醚 O–CH 次甲基（鏈狀）'},
  // stop 28 (C of the planner): the ether O-CH ring class split by "an alpha carbon with no H and four heavy neighbours" (alpha quaternary); the two other pre-approved features (ring size, oxygen outside the ring) were tested and not adopted
  {id: 'OCH_ETHER_RING_ALPHA_QUAT', gate: 'oxygen', smarts: OCH(true, '$([CX4]([CX4])([CX4])[OX2][CX4]);$([CX4][CX4D4])'), labelZh: '醚 O–CH 次甲基（環內，α 位有四級碳）'},
  {id: 'OCH_ETHER_RING_NO_QUAT', gate: 'oxygen', smarts: OCH(true, '$([CX4]([CX4])([CX4])[OX2][CX4]);!$([CX4][CX4D4])'), labelZh: '醚 O–CH 次甲基（環內，α 位無四級碳）'},
  {id: 'OCH_ESTER_CHAIN', gate: 'oxygen', smarts: OCH(false, '$([CX4]([CX4])([CX4])[OX2][CX3](=O)[#6]),$([CX4]([CX4])([CX4])[OX2][CX3H1]=O)'), labelZh: '酯 O–CH 次甲基（鏈狀）'},
  {id: 'OCH_ESTER_RING', gate: 'oxygen', smarts: OCH(true, '$([CX4]([CX4])([CX4])[OX2][CX3](=O)[#6]),$([CX4]([CX4])([CX4])[OX2][CX3H1]=O)'), labelZh: '酯 O–CH 次甲基（環內，含環己酯與內酯）'},
  {id: 'OCH_ARYLETHER_CHAIN', gate: 'oxygen', smarts: OCH(false, '$([CX4]([CX4])([CX4])[OX2]c)'), labelZh: '芳基醚 O–CH 次甲基（鏈狀）'},
  {id: 'OCH_ARYLETHER_RING', gate: 'oxygen', smarts: OCH(true, '$([CX4]([CX4])([CX4])[OX2]c)'), labelZh: '芳基醚 O–CH 次甲基（環內）'},
  // stop 28 (A.5): acetal C-H split by chain / ring (the acetal carbon is a ring member)
  {id: 'ACETAL_CH_RING', gate: 'oxygen', smarts: '[CX4H1;D3;R;$([CX4]([#6])([OX2;!$([OX2][CX3]=O)])[OX2;!$([OX2][CX3]=O)])]', labelZh: '縮醛 C–H（環內）'},
  {id: 'ACETAL_CH_CHAIN', gate: 'oxygen', smarts: '[CX4H1;D3;!R;$([CX4]([#6])([OX2;!$([OX2][CX3]=O)])[OX2;!$([OX2][CX3]=O)])]', labelZh: '縮醛 C–H（鏈狀）'},
  // stop 28: O-CH2-O split in two (both oxygens on an aromatic carbon = methylenedioxybenzene / diaryl formal; aliphatic or mixed)
  {id: 'OCH2O_ARYL', gate: 'oxygen', smarts: '[CX4H2;D2;$([CX4]([OX2]c)[OX2]c)]', labelZh: 'O–CH₂–O（兩端氧都接芳環，亞甲二氧基苯）'},
  {id: 'OCH2O_ALIPH', gate: 'oxygen', smarts: '[CX4H2;D2;$([CX4]([OX2;!$([OX2][CX3]=O)])[OX2;!$([OX2][CX3]=O)]);!$([CX4]([OX2]c)[OX2]c)]', labelZh: 'O–CH₂–O（脂肪族或混合）'},
  {id: 'ORTHOESTER_CH', gate: 'oxygen', smarts: '[CX4H1;D3;$([CX4]([OX2])([OX2])[OX2])]', labelZh: '原酸酯 C–H'},
  {id: 'EPOXIDE_H', gate: 'calibration2', smarts: '[CX4;!H0;$([CX4]1[OX2][CX4]1)]', labelZh: '環氧環上 C–H'},
  {id: 'OXETANE_H', gate: 'calibration2', smarts: '[CX4;!H0;$([CX4]1[OX2][CX4][CX4]1),$([CX4]1[CX4][OX2][CX4]1)]', labelZh: '氧雜環丁烷環上 C–H'},
  {id: 'CYCLOPROPANE_CH', gate: 'calibration2+round3', smarts: '[CX4H1;$([CX4]1[CX4][CX4]1)]', labelZh: '環丙烷 CH'},
  {id: 'CYCLOPROPANE_CH2', gate: 'calibration2+round3', smarts: '[CX4H2;$([CX4]1[CX4][CX4]1)]', labelZh: '環丙烷環 CH₂'},
  {id: 'CYCLOBUTANE_CH', gate: 'calibration2+round3', smarts: `[CX4H1;!r3;$([CX4]1${C4RING}${C4RING}${C4RING}1)]`, labelZh: '環丁烷 CH'},
  {id: 'CYCLOBUTANE_CH2', gate: 'calibration2+round3', smarts: `[CX4H2;!r3;$([CX4]1${C4RING}${C4RING}${C4RING}1)]`, labelZh: '環丁烷環 CH₂'},
  {id: 'INDOLE_H2', gate: 'calibration2', smarts: '[cH1;$(c1[nX3]c2ccccc2c1)]', labelZh: '吲哚 H2'},
  {id: 'INDOLE_H3', gate: 'calibration2', smarts: '[cH1;$(c1c2ccccc2[nX3]c1)]', labelZh: '吲哚 H3'},
  {id: 'BENZOFURAN_H2', gate: 'calibration2', smarts: '[cH1;$(c1oc2ccccc2c1)]', labelZh: '苯并呋喃 H2'},
  {id: 'BENZOFURAN_H3', gate: 'calibration2', smarts: '[cH1;$(c1c2ccccc2oc1)]', labelZh: '苯并呋喃 H3'},
  {id: 'BENZOTHIOPHENE_H2', gate: 'calibration2', smarts: '[cH1;$(c1sc2ccccc2c1)]', labelZh: '苯并噻吩 H2'},
  {id: 'BENZOTHIOPHENE_H3', gate: 'calibration2', smarts: '[cH1;$(c1c2ccccc2sc1)]', labelZh: '苯并噻吩 H3'},
  {id: 'LACTAM_N_CH', gate: 'calibration2', smarts: rec('CX4;!H0', LACTAM_N), labelZh: '內醯胺 N–CH（環上）'},
  {id: 'LACTAM_ALPHA_CH', gate: 'calibration2', smarts: rec('CX4;!H0', LACTAM_A), labelZh: '內醯胺 α-CH（環上）'},
  {id: 'LACTAM_RING_CH', gate: 'calibration2', smarts: rec('CX4;!H0', LACTAM_R), labelZh: '內醯胺其他環上 CH'},
  {id: 'LACTAM_N_CH3', gate: 'calibration2', smarts: rec('CH3', LACTAM_M), labelZh: '內醯胺 N–CH₃'},
  {id: 'ALKENE_1_CH', gate: 'calibration2', smarts: `[CX3H1;$([CX3H1](=[CX3H2])${PLAIN_R})]`, labelZh: '1-烯 =CH'},
  {id: 'ALKENE_1_CH2', gate: 'calibration2', smarts: `[CX3H2;$([CX3H2]=[CX3H1]${PLAIN_R})]`, labelZh: '1-烯 =CH₂'},
  {id: 'ALKENE_ISO_CH2', gate: 'calibration2', smarts: `[CX3H2;$([CX3H2]=[CX3H0;!r3;!r4](${PLAIN_R})${PLAIN_R})]`, labelZh: '異丁烯型 =CH₂'},
];

// ---------------------------------------------------------------- the same definitions on the structure graph
const A = (g: ParsedSmilesGraph, i: number): SmilesAtomNode => g.atoms[i];
const X = (a: SmilesAtomNode) => a.neighbors.length + a.totalHydrogens;
const hasDoubleO = (g: ParsedSmilesGraph, a: SmilesAtomNode) => a.neighbors.some(n => n.order === 2 && A(g, n.toAtom).element === 'O');
type P = (a: SmilesAtomNode, i: number) => boolean;
/** aliphatic C with four connections (SMARTS [CX4]) */
const C4: P = a => a.element === 'C' && !a.isAromatic && X(a) === 4;
const singleOrArom = (b: {order: number; isAromatic: boolean}) => b.order === 1 || b.isAromatic;
/** Is there a cycle idx - p[0] - p[1] - ... - p[k-1] - idx through distinct atoms, every bond single or aromatic (the SMARTS default bond)? */
function cycle(g: ParsedSmilesGraph, idx: number, preds: P[]): boolean {
  const used = new Set<number>([idx]);
  const step = (from: number, k: number): boolean => {
    for (const n of A(g, from).neighbors) {
      if (!singleOrArom(n)) continue;
      if (k === preds.length) { if (n.toAtom === idx) return true; continue; }
      if (used.has(n.toAtom) || !preds[k](A(g, n.toAtom), n.toAtom)) continue;
      used.add(n.toAtom);
      if (step(n.toAtom, k + 1)) return true;
      used.delete(n.toAtom);
    }
    return false;
  };
  return step(idx, 0);
}
const ringOf = (g: ParsedSmilesGraph, idx: number) => smallestRingAtoms(g, idx);
const notIn34 = (g: ParsedSmilesGraph, idx: number) => { const r = ringOf(g, idx); return !r || (r.length !== 3 && r.length !== 4); };

const isC = (a: SmilesAtomNode) => a.element === 'C';
const N3: P = a => a.element === 'N' && !a.isAromatic && X(a) === 3;
const any6: P = a => isC(a);
/** [CX3](=O): aliphatic C with three connections and a double bond to O */
const carbonylC = (g: ParsedSmilesGraph): P => a => a.element === 'C' && !a.isAromatic && X(a) === 3 && hasDoubleO(g, a);

function lactamClass(g: ParsedSmilesGraph, idx: number): string | null {
  const c = A(g, idx), CO = carbonylC(g);
  if (C4(c, idx) && c.totalHydrogens >= 1) {
    for (const k of [2, 3, 4]) if (cycle(g, idx, [N3, CO, ...Array(k).fill(any6)])) return 'LACTAM_N_CH';
    for (const k of [2, 3, 4]) if (cycle(g, idx, [CO, N3, ...Array(k).fill(any6)])) return 'LACTAM_ALPHA_CH';
    const ringPats: P[][] = [[any6, CO, N3, any6], [any6, CO, N3, any6, any6], [any6, N3, CO, any6, any6], [any6, CO, N3, any6, any6, any6], [any6, any6, CO, N3, any6, any6], [any6, N3, CO, any6, any6, any6]];
    if (ringPats.some(p => cycle(g, idx, p))) return 'LACTAM_RING_CH';
  }
  if (c.element === 'C' && !c.isAromatic && c.totalHydrogens === 3 && c.neighbors.length === 1) {
    const nIdx = c.neighbors[0].toAtom, n = A(g, nIdx);
    if (N3(n, nIdx) && singleOrArom(c.neighbors[0]) && [3, 4, 5].some(k => cycle(g, nIdx, [CO, ...Array(k).fill(any6)]))) return 'LACTAM_N_CH3';
  }
  return null;
}

function fusedHetero(g: ParsedSmilesGraph, idx: number): string | null {
  const c = A(g, idx);
  if (!(c.element === 'C' && c.isAromatic && c.totalHydrogens === 1)) return null;
  // [nX3]: an aromatic N with three connections. Counted as three heavy neighbours OR two plus an H, because the SMILES parser gives an N-substituted aromatic n (n(-aryl), n(C(=O)...)) one H as well (a parser quirk found in stop 26)
  const het: Record<string, P> = {INDOLE: a => a.element === 'N' && a.isAromatic && (a.neighbors.length === 3 || (a.neighbors.length === 2 && a.totalHydrogens >= 1)), BENZOFURAN: a => a.element === 'O' && a.isAromatic, BENZOTHIOPHENE: a => a.element === 'S' && a.isAromatic};
  const ar: P = a => a.element === 'C' && a.isAromatic;
  for (const [name, h] of Object.entries(het)) {
    // H2: c1 [het] c2 c c c c c2 c1 -> the 5-ring idx-het-c7a-c3a-c3, and c7a / c3a joined by four more aromatic carbons
    // H3: c1 c2 c c c c c2 [het] c1 -> the 5-ring idx-c3a-c7a-het-c2
    for (const pos of ['H2', 'H3'] as const) {
      const preds: P[] = pos === 'H2' ? [h, ar, ar, ar] : [ar, ar, h, ar];
      // walk the 5-ring explicitly to get the fusion atoms
      const found = (() => {
        const used = new Set<number>([idx]); const path: number[] = [];
        const step = (from: number, k: number): boolean => {
          for (const n of A(g, from).neighbors) {
            if (!singleOrArom(n)) continue;
            if (k === preds.length) { if (n.toAtom === idx && benzo(path)) return true; continue; }
            if (used.has(n.toAtom) || !preds[k](A(g, n.toAtom), n.toAtom)) continue;
            used.add(n.toAtom); path.push(n.toAtom);
            if (step(n.toAtom, k + 1)) return true;
            used.delete(n.toAtom); path.pop();
          }
          return false;
        };
        const benzo = (p: number[]): boolean => {
          const [f1, f2] = pos === 'H2' ? [p[1], p[2]] : [p[1], p[0]];   // c7a, c3a
          // f1 - c - c - c - c - f2 through atoms not in the 5-ring
          const ring5 = new Set([idx, ...p]);
          const walk = (from: number, k: number, seen: Set<number>): boolean => {
            for (const n of A(g, from).neighbors) {
              if (!singleOrArom(n)) continue;
              if (k === 4) { if (n.toAtom === f2) return true; continue; }
              if (ring5.has(n.toAtom) || seen.has(n.toAtom) || !ar(A(g, n.toAtom), n.toAtom)) continue;
              seen.add(n.toAtom); if (walk(n.toAtom, k + 1, seen)) return true; seen.delete(n.toAtom);
            }
            return false;
          };
          return walk(f1, 0, new Set());
        };
        return step(idx, 0);
      })();
      if (found) return `${name}_${pos}`;
    }
  }
  return null;
}

function oxygenClass(g: ParsedSmilesGraph, idx: number): string | null {
  const c = A(g, idx);
  if (!C4(c, idx)) return null;
  const nb = c.neighbors.map(n => ({b: n, i: n.toAtom, a: A(g, n.toAtom)}));
  const notAcylO = (o: {i: number; a: SmilesAtomNode}) => o.a.element === 'O' && !o.a.isAromatic && X(o.a) === 2 && !o.a.neighbors.some(m => { const t = A(g, m.toAtom); return t.element === 'C' && !t.isAromatic && X(t) === 3 && hasDoubleO(g, t); });
  const oxX2 = (o: {a: SmilesAtomNode}) => o.a.element === 'O' && !o.a.isAromatic && X(o.a) === 2;
  if (c.totalHydrogens === 1 && nb.length === 3) {
    const os = nb.filter(n => n.a.element === 'O');
    // O-CH methine: one O + two [CX4]
    if (os.length === 1 && oxX2(os[0]) && nb.filter(n => C4(n.a, n.i)).length === 2) {
      const r = ringOf(g, idx), ring = r !== null;
      if (!ring || notIn34(g, idx)) {
        const o = os[0].a, other = o.neighbors.filter(m => m.toAtom !== idx).map(m => ({i: m.toAtom, a: A(g, m.toAtom)}));
        const suffix = ring ? 'RING' : 'CHAIN';
        if (o.totalHydrogens === 1 && other.length === 0) return `OCH_ALCOHOL_${suffix}`;
        if (other.length === 1) {
          const p = other[0].a;
          if (C4(p, other[0].i)) {
            if (!ring) return 'OCH_ETHER_CHAIN';
            // stop 28: ring ether O-CH split by an alpha quaternary carbon (a carbon neighbour with no H and four heavy neighbours)
            return nb.some(n => n.a.element === 'C' && C4(n.a, n.i) && n.a.neighbors.length === 4 && n.a.totalHydrogens === 0) ? 'OCH_ETHER_RING_ALPHA_QUAT' : 'OCH_ETHER_RING_NO_QUAT';
          }
          // [CX3](=O)[#6] (the [#6] bonded by a single / aromatic bond, the SMARTS default) or formate [CX3H1]=O
          if (carbonylC(g)(p, other[0].i) && (p.totalHydrogens === 1 || p.neighbors.some(m => A(g, m.toAtom).element === 'C' && singleOrArom(m)))) return `OCH_ESTER_${suffix}`;
          if (p.element === 'C' && p.isAromatic) return `OCH_ARYLETHER_${suffix}`;
        }
      }
    }
    // acetal C-H: one carbon + two non-acyl O; orthoester: three O
    if (os.length === 2 && os.every(notAcylO) && nb.filter(n => n.a.element === 'C').length === 1) return ringOf(g, idx) ? 'ACETAL_CH_RING' : 'ACETAL_CH_CHAIN';
    if (os.length === 3 && os.every(oxX2)) return 'ORTHOESTER_CH';
  }
  if (c.totalHydrogens === 2 && nb.length === 2 && nb.every(notAcylO)) {
    // stop 28: [OX2]c on both sides = both oxygens on an aromatic carbon
    const onAryl = (o: {i: number; a: SmilesAtomNode}) => o.a.neighbors.some(m => m.toAtom !== idx && A(g, m.toAtom).element === 'C' && A(g, m.toAtom).isAromatic);
    return nb.every(onAryl) ? 'OCH2O_ARYL' : 'OCH2O_ALIPH';
  }
  return null;
}

function smallRingEther(g: ParsedSmilesGraph, idx: number): string | null {
  const c = A(g, idx);
  if (!C4(c, idx) || c.totalHydrogens < 1) return null;
  const O2: P = a => a.element === 'O' && !a.isAromatic && X(a) === 2;
  if (cycle(g, idx, [O2, C4])) return 'EPOXIDE_H';
  if (cycle(g, idx, [O2, C4, C4]) || cycle(g, idx, [C4, O2, C4])) return 'OXETANE_H';
  return null;
}

function carbocycle(g: ParsedSmilesGraph, idx: number): string | null {
  const c = A(g, idx);
  if (!C4(c, idx) || (c.totalHydrogens !== 1 && c.totalHydrogens !== 2)) return null;
  if (cycle(g, idx, [C4, C4])) return c.totalHydrogens === 1 ? 'CYCLOPROPANE_CH' : 'CYCLOPROPANE_CH2';
  const r = ringOf(g, idx);
  if (r && r.length === 3) return null;
  const ringAtom: P = (a, i) => C4(a, i) || (a.element === 'C' && !a.isAromatic && X(a) === 3 && a.neighbors.some(n => n.order === 2 && A(g, n.toAtom).element === 'O' && X(A(g, n.toAtom)) === 1)) || (a.element === 'C' && a.isAromatic);
  if (cycle(g, idx, [ringAtom, ringAtom, ringAtom])) return c.totalHydrogens === 1 ? 'CYCLOBUTANE_CH' : 'CYCLOBUTANE_CH2';
  return null;
}

function simpleAlkene(g: ParsedSmilesGraph, idx: number): string | null {
  const c = A(g, idx);
  if (c.element !== 'C' || c.isAromatic || X(c) !== 3) return null;
  const plainR = (i: number) => { const a = A(g, i); return C4(a, i) && a.neighbors.every(m => A(g, m.toAtom).element === 'C'); };
  const dbl = c.neighbors.find(n => n.order === 2 && !n.isAromatic);
  if (!dbl) return null;
  const o = A(g, dbl.toAtom);
  if (o.element !== 'C' || o.isAromatic || X(o) !== 3) return null;
  if (c.totalHydrogens === 1 && o.totalHydrogens === 2) {
    const r = c.neighbors.find(n => n.toAtom !== dbl.toAtom);
    if (r && singleOrArom(r) && plainR(r.toAtom)) return 'ALKENE_1_CH';
  }
  if (c.totalHydrogens === 2) {
    const rs = o.neighbors.filter(n => n.toAtom !== idx);
    if (o.totalHydrogens === 1 && rs.length === 1 && singleOrArom(rs[0]) && plainR(rs[0].toAtom)) return 'ALKENE_1_CH2';
    if (o.totalHydrogens === 0 && rs.length === 2 && rs.every(n => singleOrArom(n) && plainR(n.toAtom)) && notIn34(g, dbl.toAtom)) return 'ALKENE_ISO_CH2';
  }
  return null;
}

/** The stop-26 class of a hydrogen-bearing atom (null = none). Same definitions and priority as S26_CLASSES. */
export function s26Class(g: ParsedSmilesGraph, idx: number): string | null {
  const a = A(g, idx);
  if (!a || a.totalHydrogens < 1) return null;
  return oxygenClass(g, idx) ?? smallRingEther(g, idx) ?? carbocycle(g, idx) ?? fusedHetero(g, idx) ?? lactamClass(g, idx) ?? simpleAlkene(g, idx);
}
/** round3Class is the domain the cyclopropane / cyclobutane classes of this stop stay inside (checked by the test). */
export const s26Round3Domain = round3Class;

// ---------------------------------------------------------------- application
/** c = compound-weighted mean error, s = skeleton-weighted (stop 28). sourceError = [before, after] of the new (nmrshiftdb2) and the old (tier 1 / 2 / 3) source, compound-weighted; null = no data of that source in the fit. */
export interface S26Rule {deltaPpm: number; nCompounds: number; nSkeletons: number; nCompoundsOld: number; smallSample: boolean; before: {c: number; s: number}; leaveOneOut: {c: number; s: number}; after: {c: number; s: number};
  heldOut: {n: number; before: {c: number; s: number}; after: {c: number; s: number}} | null; sourceError: {new: [number, number] | null; old: [number, number] | null}}
export interface S26Gates {oxygen: boolean; calibration2: boolean; round3: boolean}
export const s26GateOpen = (gate: S26Gate, g: S26Gates): boolean => (gate === 'oxygen' ? g.oxygen : gate === 'calibration2' ? g.calibration2 : g.calibration2 && g.round3);

/** Applies the stop-26 class shifts (after round3). Returns the original object when nothing applies. */
export function applyNmrshiftdb2H1<T extends {peaks: SpectralPeak[]; environments: ProtonEnvironment[]}>(result: T, graph: ParsedSmilesGraph, gates: S26Gates): T {
  const rules = V12_CONFIG.v142Nmrshiftdb2.rules as Record<string, S26Rule>;
  if (!Object.keys(rules).length) return result;
  let changed = false;
  const envs = result.environments.map(env => {
    const idx = env.atomIndices?.[0];
    if (idx === undefined || env.isExchangeable) return env;
    const cls = s26Class(graph, idx), rule = cls ? rules[cls] : undefined;
    const def = cls ? S26_CLASSES.find(d => d.id === cls) : undefined;
    if (!rule || !def || !s26GateOpen(def.gate, gates)) return env;
    changed = true;
    const s = Number((env.shiftPpm + rule.deltaPpm).toFixed(3)), unc = env.uncertaintyPpm ?? 0.3;
    return {...env, shiftPpm: s, chemicalShift: s, predictedDeltaPpm: s,
      expectedShiftRange: [Number((s - 2 * unc).toFixed(2)), Number((s + 2 * unc).toFixed(2))] as [number, number],
      appliedCorrections: [...(env.appliedCorrections ?? []), {termName: `class correction ${cls} (nmrshiftdb2)`, deltaPpm: rule.deltaPpm, reasonZh: `v1.4.2 第二十八站類別校準（${cls}；真值來源 NMRShiftDB2，CDCl3 實測${rule.nCompoundsOld ? '，與舊真值合併重擬合' : ''}${rule.smallSample ? '；小樣本' : ''}）`,
        applicableCondition: `${rule.nCompounds} compounds / ${rule.nSkeletons} skeletons (nmrshiftdb2, CDCl3${rule.nCompoundsOld ? ` + ${rule.nCompoundsOld} older-truth compounds` : ''}), leave-one-out ${rule.before.c.toFixed(2)} -> ${rule.leaveOneOut.c.toFixed(2)} ppm (skeleton-weighted ${rule.before.s.toFixed(2)} -> ${rule.leaveOneOut.s.toFixed(2)})${rule.heldOut ? `, held-out half ${rule.heldOut.before.c.toFixed(2)} -> ${rule.heldOut.after.c.toFixed(2)} ppm (${rule.heldOut.n} compounds)` : ''}${rule.smallSample ? ', small sample' : ''}`,
        dataNature: 'EMPIRICAL_INCREMENT_MODEL' as const, citationId: S26_CITATION_ID}]} as ProtonEnvironment;
  });
  if (!changed) return result;
  const peaks = result.peaks.map((p, i) => {
    const e = envs[i]; if (!p || !e || e === result.environments[i]) return p;
    return {...p, x: e.shiftPpm, predictedRange: e.expectedShiftRange} as SpectralPeak;
  });
  return {...result, environments: envs, peaks};
}
