import type {ParsedSmilesGraph, SmilesAtomNode} from '../chemistryEngine';
import type {ProtonEnvironment, SpectralPeak} from '../../types/spectrum';
import {V12_CONFIG} from '../constraints/v12Config';

/**
 * v1.4.0 stop 13 (flag useV140H1 and v140.calibration2, DEFAULT OFF): class corrections of the 1H predictor from tier-2 and tier-1-candidate truth values (planner list of 2026-11-10 plus the round-1 tier-2 values).
 *
 * CALIBRATION RULE (planner, stop 13). A class may be calibrated on tier-2 or candidate data only if (1) it has >= 3 INDEPENDENT compounds (distinct canonical SMILES; a compound with several sources or several signals of the class
 * counts once), (2) the leave-one-out validation lowers the mean error, and (3) the mean error is not already within the tier-2 tolerance (0.15 ppm - my reading of "mean error falls": a class that accurate is recorded as
 * "accurate enough, not changed"). A class missing a condition is only validated and recorded as "insufficient data" / "accurate enough" / "leave-one-out not lower". The exception of stop 11 (dimethoxymethane OCH2O, one point) stays as it was.
 *  - Model: ONE additive shift per class = the mean over the class's compounds of (truth - prediction of the stack of the earlier v1.4.0 flags: alkene, oxygen, coverage, solvent), every compound weighted equally (its value is the
 *    mean over its signals). Leave-one-out: the shift without compound i predicts compound i; mean error = mean over the compounds of their mean absolute error. Each compound is therefore both a calibration point (of the deployed
 *    shift) and, in turn, the left-out validation point; there is no separate held-out set in this stop (the planner's rule is leave-one-out).
 *  - Level 0 is the class as the planner named it; level 1 is ONE declared refinement attribute (heteroatom on the propargylic carbon, halogen identity, ring size, ...). Per class the pooled shift (level 0) and the refined shifts
 *    (level-1 sub-classes that pass the rule on their own, the others uncorrected) are compared by their class-level leave-one-out mean error; the lower one is deployed if it is lower than the uncorrected error (tests/helpers/v140Calibration2Study.ts, decide).
 *    The refinement attributes were fixed before the leave-one-out numbers were computed but AFTER the "before" error table of the round-2 data had been seen.
 *  - Exchangeable protons (OH, SH, NH, COOH) are never calibrated; only their tolerance is widened to at least 0.5 ppm (the centre is never touched).
 *  - Shifts are CDCl3 shifts; round-2 values with another stated solvent (DMSO-d6, acetone-d6) and interval-only values (aromatic multiplets, ring CH2 of unknown assignment) are validation only. The solvent term is added afterwards by the predictor.
 *  - Calibrated against the stack of the earlier v1.4.0 flags: the shifts are valid with alkene, oxygen and coverage on (they are on by default when useV140H1 is on, except coverage).
 * The deployed shifts, with source, compounds, leave-one-out result and mean error before / after per rule, are in V12_CONFIG.v140Calibration2.rules (tests/v14/v140Calibration2.test.ts pins every number to the fit).
 * The class of a hydrogen-bearing atom is a function of the structure graph only (no shift value is looked at).
 */
export const CAL2_CITATION_ID = 'STOP13_PLANNER_LIST_2026_11_10';
const A = (g: ParsedSmilesGraph, i: number): SmilesAtomNode => g.atoms[i];
const HAL = ['F', 'Cl', 'Br', 'I'];
const isHetero = (a: SmilesAtomNode) => a.element !== 'C' && a.element !== 'H';
const isSp3C = (a: SmilesAtomNode) => a.element === 'C' && !a.isAromatic && a.neighbors.every(n => n.order === 1);
const hasDouble = (g: ParsedSmilesGraph, a: SmilesAtomNode, el: string) => a.neighbors.some(n => n.order === 2 && A(g, n.toAtom).element === el);
const alkyneCarbon = (g: ParsedSmilesGraph, a: SmilesAtomNode) => a.element === 'C' && a.neighbors.some(n => n.order === 3 && A(g, n.toAtom).element === 'C');

/** The atoms of the smallest ring through `idx` (null when it is in no ring). */
export function smallestRingAtoms(g: ParsedSmilesGraph, idx: number): number[] | null {
  let best: number[] | null = null;
  const nbs = A(g, idx).neighbors.map(n => n.toAtom);
  for (let x = 0; x < nbs.length; x++) for (let y = x + 1; y < nbs.length; y++) {
    const prev = new Map<number, number>([[nbs[x], -1]]), q = [nbs[x]];
    while (q.length && !prev.has(nbs[y])) {
      const u = q.shift()!;
      for (const n of A(g, u).neighbors) if (n.toAtom !== idx && !prev.has(n.toAtom)) { prev.set(n.toAtom, u); q.push(n.toAtom); }
    }
    if (!prev.has(nbs[y])) continue;
    const ring = [idx]; for (let u: number = nbs[y]; u !== -1; u = prev.get(u)!) ring.push(u);
    if (!best || ring.length < best.length) best = ring;
  }
  return best;
}

export interface Cal2Class {l0: string; l1: string | null}
/** The classes of a hydrogen-bearing carbon: level 0 (the class as named by the planner) and the declared level-1 refinement. null = no class of this stop. */
export function calibration2Class(g: ParsedSmilesGraph, idx: number): Cal2Class | null {
  const c = A(g, idx);
  if (c.element !== 'C' || c.totalHydrogens < 1) return null;
  const H = c.totalHydrogens;
  const nb = c.neighbors.map(n => ({order: n.order, idx: n.toAtom, atom: A(g, n.toAtom)}));
  const heteros = nb.filter(n => isHetero(n.atom)), hals = nb.filter(n => HAL.includes(n.atom.element));

  // ---------------------------------------------------------------- sp2 / sp / aromatic carbons
  if (c.isAromatic) {
    const ring = smallestRingAtoms(g, idx);
    if (ring && ring.length === 5 && ring.some(i => isHetero(A(g, i))) && ring.some(i => A(g, i).neighbors.filter(n => A(g, n.toAtom).isAromatic).length === 3)) {
      return {l0: 'FUSED_5RING_HETEROAROMATIC_H', l1: null};   // indole / benzofuran H2, H3 (the benzo ring is not this class)
    }
    return null;
  }
  if (nb.length === 1 && nb[0].order === 3 && nb[0].atom.element === 'C' && H === 1) {
    const q = nb[0].atom, subst = q.neighbors.filter(n => n.toAtom !== idx);
    if (subst.length !== 1 || subst[0].order !== 1) return null;
    const pc = A(g, subst[0].toAtom);
    if (pc.element !== 'C' || pc.isAromatic) return null;
    return {l0: 'ALKYNE_CH', l1: pc.neighbors.some(n => isHetero(A(g, n.toAtom))) ? 'ALKYNE_CH_HETERO' : 'ALKYNE_CH_ALKYL'};
  }
  if (hasDouble(g, c, 'O') && H === 1 && nb.length === 2 && nb.some(n => n.order === 1 && n.atom.element === 'C')) {
    const r = nb.find(n => n.order === 1)!.atom;
    return {l0: 'ALDEHYDE_CHO', l1: r.isAromatic ? 'ALDEHYDE_CHO_AROMATIC' : 'ALDEHYDE_CHO_ALIPHATIC'};
  }
  if (nb.some(n => n.order === 2 && n.atom.element === 'C')) {
    const dbl = nb.find(n => n.order === 2 && n.atom.element === 'C')!;
    const other = dbl.atom;
    // monosubstituted terminal vinyl H2C=CH-R: this carbon is =CH2 (H = 2) or the =CH (H = 1, one more single bond, the partner is =CH2)
    if (H === 2 && nb.length === 1 && other.totalHydrogens === 1 && other.neighbors.length === 2) return {l0: 'VINYL_MONO', l1: 'VINYL_MONO_CH2'};
    if (H === 1 && nb.length === 2 && other.totalHydrogens === 2 && other.neighbors.length === 1) return {l0: 'VINYL_MONO', l1: 'VINYL_MONO_CH'};
    return null;
  }
  if (!nb.every(n => n.order === 1)) return null;

  // ---------------------------------------------------------------- sp3 C-H
  const ring = smallestRingAtoms(g, idx);
  const ringHas = (pred: (a: SmilesAtomNode) => boolean) => ring !== null && ring.some(i => pred(A(g, i)));
  // lactam: a ring containing an amide N-C(=O) bond; H on its ring carbons, or the N-methyl of that N
  const lactamRing = (r: number[] | null): boolean => r !== null && r.some(i => A(g, i).element === 'N' && A(g, i).neighbors.some(n => r.includes(n.toAtom) && A(g, n.toAtom).element === 'C' && hasDouble(g, A(g, n.toAtom), 'O')));
  if (lactamRing(ring) && ring!.length >= 5 && ring!.length <= 7 && ring!.every(i => A(g, i).element === 'C' || A(g, i).element === 'N')) {
    const bondedN = nb.some(n => n.atom.element === 'N');
    const bondedCO = nb.some(n => n.atom.element === 'C' && hasDouble(g, n.atom, 'O'));
    return {l0: 'LACTAM_CH', l1: bondedN ? 'LACTAM_NCH2' : bondedCO ? 'LACTAM_ALPHA_CH2' : 'LACTAM_RING_CH2'};
  }
  if (c.neighbors.length === 1 && nb[0].atom.element === 'N') {
    const n = nb[0].atom, ringN = smallestRingAtoms(g, nb[0].idx);
    if (H === 3 && n.neighbors.some(m => m.toAtom !== idx && A(g, m.toAtom).element === 'C' && hasDouble(g, A(g, m.toAtom), 'O')) && lactamRing(ringN)) return {l0: 'LACTAM_CH', l1: 'LACTAM_NCH3'};
  }
  if (ring && (ring.length === 3 || ring.length === 4)) {
    if (ringHas(a => a.element === 'O') && !ring.some(i => A(g, i).neighbors.some(m => ring.includes(m.toAtom) && A(g, m.toAtom).element === 'C' && hasDouble(g, A(g, m.toAtom), 'O')))) {
      return {l0: 'SMALL_RING_ETHER_H', l1: ring.length === 3 ? 'SMALL_RING_ETHER_H_3' : 'SMALL_RING_ETHER_H_4'};
    }
    if (ring.every(i => A(g, i).element === 'C')) return {l0: 'SMALL_CARBOCYCLE_CH', l1: ring.length === 3 ? 'SMALL_CARBOCYCLE_CH_3' : 'SMALL_CARBOCYCLE_CH_4'};
  }
  // sulfur: a C-H on a carbon bonded to sulfur that is not bonded to an aromatic ring (aryl sulfides: rule ARYL_S_CH of stop 10)
  if (heteros.length === 1 && heteros[0].atom.element === 'S') {
    const s = heteros[0].atom;
    if (s.neighbors.some(n => A(g, n.toAtom).isAromatic)) return null;
    const oxidised = s.neighbors.some(n => A(g, n.toAtom).element === 'O');
    return {l0: 'S_ALPHA_CH', l1: oxidised ? 'S_ALPHA_CH_OXIDISED' : 'S_ALPHA_CH_DIVALENT'};
  }
  // propargylic: an sp3 C-H bonded to a C#C carbon (carbon-only, or with one heteroatom on the same carbon)
  if (nb.some(n => alkyneCarbon(g, n.atom))) {
    if (heteros.length === 0) return {l0: 'PROPARGYL_CH', l1: 'PROPARGYL_CH_ALKYL'};
    if (heteros.length === 1) {
      const e = heteros[0].atom.element;
      return {l0: 'PROPARGYL_CH', l1: HAL.includes(e) ? 'PROPARGYL_CH_HALOGEN' : e === 'O' ? 'PROPARGYL_CH_OXYGEN' : 'PROPARGYL_CH_OTHER'};
    }
    return null;
  }
  // halogens
  if (hals.length >= 2 && nb.length === hals.length) {   // only halogens besides H: CH2X2, CHX3
    return {l0: 'POLYHALO_CH', l1: `POLYHALO_CH_${hals.every(h => h.atom.element === hals[0].atom.element) ? hals[0].atom.element : 'MIXED'}`};
  }
  if (hals.length === 1 && heteros.length === 1) {
    const x = hals[0].atom.element, carbons = nb.filter(n => n.atom.element === 'C');
    const plain = carbons.every(n => isSp3C(n.atom) && !hasDouble(g, n.atom, 'O'));
    if (plain && H === 2 && carbons.length === 1) return {l0: 'HALO_CH2X', l1: `HALO_CH2X_${x}`};
    if (plain && H === 1 && carbons.length === 2) return {l0: 'HALO_CHX_SECONDARY', l1: `HALO_CHX_SECONDARY_${x}`};
    if (plain && H === 3) return {l0: 'HALO_CH3X', l1: `HALO_CH3X_${x}`};
  }
  // beta to halogen: the carbon has only carbon neighbours and one of them is CH2X / CHX (one halogen, nothing else hetero)
  if (heteros.length === 0 && (H === 3 || H === 2)) {
    const beta = nb.filter(n => isSp3C(n.atom) && n.atom.neighbors.some(m => HAL.includes(A(g, m.toAtom).element)) && n.atom.neighbors.filter(m => isHetero(A(g, m.toAtom))).length === 1 && !n.atom.neighbors.some(m => A(g, m.toAtom).element === 'C' && hasDouble(g, A(g, m.toAtom), 'O')));
    if (beta.length === 1) return {l0: 'HALO_BETA_CH', l1: `HALO_BETA_CH_${A(g, beta[0].atom.neighbors.find(m => HAL.includes(A(g, m.toAtom).element))!.toAtom).element}`};
  }
  // amine beta: a C-H whose carbon neighbour is bonded to an amine nitrogen (sp3 N, only C neighbours)
  if (heteros.length === 0) {
    const betaN = nb.filter(n => isSp3C(n.atom) && n.atom.totalHydrogens >= 1 && n.atom.neighbors.some(m => { const t = A(g, m.toAtom); return t.element === 'N' && t.formalCharge === 0 && t.neighbors.every(k => k.order === 1 && A(g, k.toAtom).element === 'C' && isSp3C(A(g, k.toAtom))); }));
    if (betaN.length === 1 && (H === 3 || H === 2)) return {l0: 'AMINE_BETA_CH', l1: H === 3 ? 'AMINE_BETA_CH3' : 'AMINE_BETA_CH2'};
  }
  // acetal / orthoester C-H: one H, two or three single-bonded ether-type oxygens (no carbonyl on them)
  if (H === 1 && heteros.length >= 2 && heteros.every(n => n.atom.element === 'O' && n.atom.neighbors.every(m => !hasDouble(g, A(g, m.toAtom), 'O')))) {
    return {l0: 'ACETAL_CH', l1: heteros.length === 3 ? 'ACETAL_CH_ORTHOESTER' : 'ACETAL_CH_ACETAL'};
  }
  // cyclic ester O-CH: one H, one acyloxy oxygen, the carbon in a ring of 5-7 (cyclohexyl acetate), the other neighbours sp3 carbons
  if (H === 1 && heteros.length === 1 && heteros[0].atom.element === 'O' && ring && ring.length >= 5) {
    const o = heteros[0].atom, other = o.neighbors.find(n => n.toAtom !== idx);
    if (other && A(g, other.toAtom).element === 'C' && hasDouble(g, A(g, other.toAtom), 'O') && nb.filter(n => n.atom.element === 'C').every(n => isSp3C(n.atom))) return {l0: 'CYCLIC_ESTER_OCH', l1: null};
  }
  return null;
}

// ---------------------------------------------------------------- application
export interface Cal2Rule {deltaPpm: number; level: 0 | 1; compounds: string[]; maeBefore: number; maeLeaveOneOut: number}
/** The deployed rule of a class pair (level 0 first, then the level-1 refinement); at most one applies. */
export function cal2RuleFor(cls: Cal2Class): {id: string; rule: Cal2Rule} | null {
  const rules = V12_CONFIG.v140Calibration2.rules as Record<string, Cal2Rule>;
  if (rules[cls.l0]) return {id: cls.l0, rule: rules[cls.l0]};
  if (cls.l1 && rules[cls.l1]) return {id: cls.l1, rule: rules[cls.l1]};
  return null;
}

/** A hydrogen of a polyhalomethane carbon whose halogens include F or I (V12_CONFIG.v140Calibration2.insufficientHalogens): the class of which this stop has too few compounds to give a number. */
export function isInsufficientPolyhalo(g: ParsedSmilesGraph, idx: number): boolean {
  const cls = calibration2Class(g, idx);
  if (!cls || cls.l0 !== 'POLYHALO_CH') return false;
  return A(g, idx).neighbors.some(n => (V12_CONFIG.v140Calibration2.insufficientHalogens).includes(A(g, n.toAtom).element));
}

/** What the predictor lists instead of a number for such a carbon: no shift field at all. */
export interface InsufficientDataEnvironment {atomIndices: number[]; integration: number; classId: string; labelZh: string; reasonZh: string}

/** Applies the class corrections to a predictor result (after the additive and coverage rules). Returns the original object when nothing applies. */
export function applyCalibration2H1<T extends {peaks: SpectralPeak[]; environments: ProtonEnvironment[]}>(result: T, graph: ParsedSmilesGraph): T {
  const cfg = V12_CONFIG.v140Calibration2;
  let changed = false;
  const insufficient: InsufficientDataEnvironment[] = [];
  const keep: boolean[] = [];
  const envs = result.environments.map((env, i) => {
    const idx = env.atomIndices?.[0];
    keep[i] = true;
    if (idx === undefined) return env;
    if (!env.isExchangeable && isInsufficientPolyhalo(graph, idx)) {
      keep[i] = false; changed = true;
      insufficient.push({atomIndices: env.atomIndices ?? [idx], integration: env.integration ?? 0, classId: 'POLYHALO_CH', labelZh: '資料不足', reasonZh: '同碳多鹵（含 F 或 I）的 C-H：真值只有各 2 個化合物，不輸出預測位移，也不當排名依據'});
      return env;
    }
    if (env.isExchangeable) {
      // exchangeable protons: the centre is never calibrated; the tolerance is not narrower than 0.5 ppm
      const unc = env.uncertaintyPpm ?? 0.45;
      if (unc >= cfg.exchangeableToleranceFloorPpm) return env;
      changed = true;
      return {...env, uncertaintyPpm: cfg.exchangeableToleranceFloorPpm, expectedShiftRange: [Number((env.shiftPpm - 2 * cfg.exchangeableToleranceFloorPpm).toFixed(2)), Number((env.shiftPpm + 2 * cfg.exchangeableToleranceFloorPpm).toFixed(2))] as [number, number]} as ProtonEnvironment;
    }
    const cls = calibration2Class(graph, idx), hit = cls ? cal2RuleFor(cls) : null;
    if (!hit) return env;
    changed = true;
    const s = Number((env.shiftPpm + hit.rule.deltaPpm).toFixed(3)), unc = env.uncertaintyPpm ?? 0.3;
    return {...env, shiftPpm: s, chemicalShift: s, predictedDeltaPpm: s,
      expectedShiftRange: [Number((s - 2 * unc).toFixed(2)), Number((s + 2 * unc).toFixed(2))] as [number, number],
      appliedCorrections: [...(env.appliedCorrections ?? []), {termName: `class correction ${hit.id}`, deltaPpm: hit.rule.deltaPpm, reasonZh: `v1.4.0 第十三站類別校準（${hit.id}）`, applicableCondition: `${hit.rule.compounds.length} independent compounds, leave-one-out ${hit.rule.maeBefore.toFixed(2)} -> ${hit.rule.maeLeaveOneOut.toFixed(2)} ppm`, dataNature: 'EMPIRICAL_INCREMENT_MODEL' as const, citationId: CAL2_CITATION_ID}]} as ProtonEnvironment;
  });
  if (!changed) return result;
  const peaks = result.peaks.map((p, i) => {
    const e = envs[i]; if (!p || !e || e === result.environments[i]) return p;
    return {...p, x: e.shiftPpm, predictedRange: e.expectedShiftRange} as SpectralPeak;
  });
  if (!insufficient.length) return {...result, environments: envs, peaks};
  return {...result, environments: envs.filter((_, i) => keep[i]), peaks: peaks.filter((_, i) => keep[i]), insufficientDataEnvironments: insufficient};
}
