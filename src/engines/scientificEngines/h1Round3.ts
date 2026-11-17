import type {ParsedSmilesGraph, SmilesAtomNode} from '../chemistryEngine';
import type {ProtonEnvironment, SpectralPeak} from '../../types/spectrum';
import {V12_CONFIG} from '../constraints/v12Config';
import {smallestRingAtoms} from './h1Calibration2';

/**
 * v1.4.1 stop 22 (flags useV140H1 and v140.round3, DEFAULT OFF): the third 1H round, part 1 - classes of the small-ring C-H (cyclopropane, cyclobutane) and the aromatic S-H.
 * The class of a hydrogen-bearing atom is a function of the structure graph only (no shift value is looked at).
 */
const A = (g: ParsedSmilesGraph, i: number): SmilesAtomNode => g.atoms[i];
const HETERO_LINK = ['N', 'O', 'F', 'Cl', 'Br', 'I'];

export interface Round3Class {l0: string; l1: string | null}
/**
 * The declared refinement attributes (written down in notes/v1.4.1/STOP22_CHECKPOINT.md BEFORE any leave-one-out number was computed; they were chosen after the 'before' error table had been seen):
 *  - cyclopropane (methine and ring CH2): is a substituent of the ring bonded through N, O or a halogen (_HETERO), or through carbon / silicon, or is there none (the parent; _OTHER)?
 *  - cyclobutane CH2: does the ring contain a carbonyl (_RING_CARBONYL) or not (_NO_RING_CARBONYL)?
 */
const ringSubstituentLinks = (g: ParsedSmilesGraph, ring: number[]): string[] => ring.flatMap(i => A(g, i).neighbors.filter(n => !ring.includes(n.toAtom)).map(n => A(g, n.toAtom).element)).filter(el => el !== 'H');
const ringHasCarbonyl = (g: ParsedSmilesGraph, ring: number[]): boolean => ring.some(i => A(g, i).neighbors.some(n => n.order === 2 && A(g, n.toAtom).element === 'O'));

/** The small-ring carbocycle class of a hydrogen-bearing sp3 carbon (null = not this round's class). */
export function round3Class(g: ParsedSmilesGraph, idx: number): Round3Class | null {
  const c = A(g, idx);
  if (c.element !== 'C' || c.isAromatic || c.totalHydrogens < 1 || !c.neighbors.every(n => n.order === 1)) return null;
  const ring = smallestRingAtoms(g, idx);
  if (!ring || (ring.length !== 3 && ring.length !== 4) || !ring.every(i => A(g, i).element === 'C')) return null;
  if (ring.length === 3) {
    // cyclopropane: every ring atom sp3 (no cyclopropene, no methylenecyclopropane)
    if (!ring.every(i => A(g, i).neighbors.every(n => n.order === 1))) return null;
    const hetero = ringSubstituentLinks(g, ring).some(el => HETERO_LINK.includes(el)) ? 'HETERO' : 'OTHER';
    if (c.totalHydrogens === 1) return {l0: 'CYCLOPROPANE_METHINE', l1: `CYCLOPROPANE_METHINE_${hetero}`};
    if (c.totalHydrogens === 2) return {l0: 'CYCLOPROPANE_CH2', l1: `CYCLOPROPANE_CH2_${hetero}`};
    return null;
  }
  // cyclobutane: the ring may carry a carbonyl or an aromatic fusion (cyclobutanone, benzocyclobutene), which is what the data cover; a ring or exocyclic C=C (cyclobutene, methylenecyclobutane) is outside the data and not in the class; the C-H itself is sp3
  const dataDomain = (i: number) => A(g, i).isAromatic || A(g, i).neighbors.every(n => n.order === 1 || (n.order === 2 && A(g, n.toAtom).element === 'O'));
  if (!ring.every(dataDomain)) return null;
  if (c.totalHydrogens === 1) return {l0: 'CYCLOBUTANE_CH', l1: null};
  if (c.totalHydrogens === 2) return {l0: 'CYCLOBUTANE_CH2', l1: ringHasCarbonyl(g, ring) ? 'CYCLOBUTANE_CH2_RING_CARBONYL' : 'CYCLOBUTANE_CH2_NO_RING_CARBONYL'};
  return null;
}

// ---------------------------------------------------------------- application
export const ROUND3_CITATION_ID = 'STOP22_PLANNER_LIST_2026_11_13';
export interface Round3Rule {deltaPpm: number; level: 0 | 1; compounds: string[]; maeBefore: number; maeLeaveOneOut: number}
/** The deployed rule of a class pair (level 0 first, then the level-1 refinement); at most one applies. */
export function round3RuleFor(cls: Round3Class): {id: string; rule: Round3Rule} | null {
  const rules = V12_CONFIG.v140Round3.rules as Record<string, Round3Rule>;
  if (rules[cls.l0]) return {id: cls.l0, rule: rules[cls.l0]};
  if (cls.l1 && rules[cls.l1]) return {id: cls.l1, rule: rules[cls.l1]};
  return null;
}
/** An S-H on an aromatic carbon (thiophenol type); the sulfur itself is not aromatic (thiophene has no S-H). */
export function isAromaticThiolHydrogen(g: ParsedSmilesGraph, idx: number): boolean {
  const s = A(g, idx);
  return s.element === 'S' && !s.isAromatic && s.totalHydrogens >= 1 && s.neighbors.some(n => A(g, n.toAtom).element === 'C' && A(g, n.toAtom).isAromatic);
}

/**
 * Applies the round-3 corrections to a predictor result (after the additive, coverage and calibration2 layers): the aromatic S-H class (centre and tolerance, exchangeable: nothing is calibrated) and the cyclopropane / cyclobutane class shifts.
 * Returns the original object when nothing applies.
 */
export function applyRound3H1<T extends {peaks: SpectralPeak[]; environments: ProtonEnvironment[]}>(result: T, graph: ParsedSmilesGraph): T {
  const cfg = V12_CONFIG.v140Round3;
  let changed = false;
  const envs = result.environments.map(env => {
    const idx = env.atomIndices?.[0];
    if (idx === undefined) return env;
    if (env.isExchangeable) {
      if (!isAromaticThiolHydrogen(graph, idx)) return env;
      const s = cfg.arylSH.centrePpm, unc = cfg.arylSH.toleranceFloorPpm;
      changed = true;
      return {...env, shiftPpm: s, chemicalShift: s, predictedDeltaPpm: s, uncertaintyPpm: unc, expectedShiftRange: [Number((s - 2 * unc).toFixed(2)), Number((s + 2 * unc).toFixed(2))] as [number, number],
        appliedCorrections: [...(env.appliedCorrections ?? []), {termName: 'aromatic S-H class centre', deltaPpm: Number((s - env.shiftPpm).toFixed(3)), reasonZh: 'v1.4.1 第二十二站 芳香 SH 類別（教科書常見範圍 3.3–3.4 的中點，未經校準；單一化合物僅作驗證）',
          applicableCondition: `textbook range ${cfg.arylSH.rangeTextbookPpm[0]}-${cfg.arylSH.rangeTextbookPpm[1]} ppm, tolerance ${unc} ppm, not calibrated (exchangeable proton)`, dataNature: 'GENERAL_THEORY' as const, citationId: ROUND3_CITATION_ID}]} as ProtonEnvironment;
    }
    const cls = round3Class(graph, idx), hit = cls ? round3RuleFor(cls) : null;
    if (!hit) return env;
    changed = true;
    const s = Number((env.shiftPpm + hit.rule.deltaPpm).toFixed(3)), unc = env.uncertaintyPpm ?? 0.3;
    return {...env, shiftPpm: s, chemicalShift: s, predictedDeltaPpm: s,
      expectedShiftRange: [Number((s - 2 * unc).toFixed(2)), Number((s + 2 * unc).toFixed(2))] as [number, number],
      appliedCorrections: [...(env.appliedCorrections ?? []), {termName: `class correction ${hit.id}`, deltaPpm: hit.rule.deltaPpm, reasonZh: `v1.4.1 第二十二站類別校準（${hit.id}）`, applicableCondition: `${hit.rule.compounds.length} independent compounds, leave-one-out ${hit.rule.maeBefore.toFixed(2)} -> ${hit.rule.maeLeaveOneOut.toFixed(2)} ppm`, dataNature: 'EMPIRICAL_INCREMENT_MODEL' as const, citationId: ROUND3_CITATION_ID}]} as ProtonEnvironment;
  });
  if (!changed) return result;
  const peaks = result.peaks.map((p, i) => {
    const e = envs[i]; if (!p || !e || e === result.environments[i]) return p;
    return {...p, x: e.shiftPpm, predictedRange: e.expectedShiftRange} as SpectralPeak;
  });
  return {...result, environments: envs, peaks};
}
