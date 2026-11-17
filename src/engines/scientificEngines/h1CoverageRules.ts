import type {ParsedSmilesGraph, SmilesAtomNode} from '../chemistryEngine';
import type {ProtonEnvironment, SpectralPeak} from '../../types/spectrum';

/**
 * v1.4.0 stop 10 (flag useV140H1 and v140.coverage, DEFAULT OFF): 1H predictor rules for environments that had no rule (or a wrong one).
 *
 * RULE POLICY (planner's stop-10 instruction): a rule is written only for a class with at least two data points, one used to CALIBRATE it and at least one HELD OUT that does not take part in the calibration; a calibration point
 * must be tier 1 (Fulmer 2010 SI Table S1) or of tier-1 quality stated by the planner; tier 2 (Reich hand-read values, user-looked-up SDBS / ChemicalBook values) only validates. A class with fewer points is not given a rule; the
 * stop-10 report lists them. Existing rules, knowledge-base values and weights are NOT changed; the three rules below add environments (the overlap and the priority are stated per rule).
 * The numbers are CDCl3 shifts; the solvent term is added afterwards by the predictor exactly as for every other environment.
 *
 * FORMYL_HETERO  H–C(=O)–N or H–C(=O)–O (formamide, formate ester, formic acid). Calibration: N,N-dimethylformamide CH 8.02 (tier 1, S1). Held out: methyl formate 8.08, ethyl formate 8.04, isopropyl formate 8.02
 *   (tier 2, Reich, hand-read). Before: the aldehyde rule gives 9.76 (error +1.7). Overlap: the aldehyde environment (a C-bound CHO, base 9.76 / 9.96) is NOT touched; this rule applies only when the carbonyl carbon has a
 *   single-bonded N or O neighbour and takes priority there.
 * ARYL_S_CH  sp3 C–H on an S that carries an aromatic ring and no oxygen (aryl alkyl sulfide), the carbon's other neighbours being alkyl carbons or hydrogen. CH3: 0.88 + 1.58 = 2.46, calibration = aryl S–CH3 2.42–2.50
 *   (Chem. Sci. 2020 SI, CDCl3, tier-1 quality, centre of the range); held out: thioanisole 2.44 and 2.47 (Reich). CH2: 1.25 + 1.56 = 2.81, calibration = aryl decyl sulfide S–CH2 2.81 (same SI); held out: ethyl phenyl
 *   sulfide SCH2 2.86 (Reich). S–CH (secondary): ONE tier-1-quality point (cyclohexyl, 2.90), none held out: NO rule. Overlap: the graph predictor has no S rule (the carbon keeps the plain alkyl base), so this is a new
 *   environment. Dialkyl sulfides, thiols, disulfides, sulfoxides and sulfones: tier-2 values only (DMSO is tier 1 but has no held-out partner of its class): NO rule.
 * CYCLOALKANE_CH2  the CH2 of a parent cycloalkane (cyclopentane, cyclohexane, cycloheptane: every atom of the molecule is a ring CH2). Calibration: cyclohexane 1.43 (tier 1); held out: cyclopentane 1.51 and
 *   cycloheptane 1.53 (tier 2, Reich, hand-read). Before: 1.25 (error -0.18 / -0.26 / -0.28). Overlap: the graph predictor has no ring term, so this is a new environment; a substituted ring keeps 1.25 (+ its rules). Cyclopropane
 *   0.22 and cyclobutane 1.98 are tier 2 only and are NOT given a rule.
 * POLYHALOMETHANE  sp3 carbon whose heavy neighbours are n >= 2 halogens only (CH2X2, CHX3): the n halogen increments of the graph predictor saturate, total = alpha * n^p. p = 0.8893 is calibrated on chloroform
 *   (7.26, tier 1: 1.55 + 2.15 * 3^p = 7.26); held out: dichloromethane 5.30 (tier 1, a different compound of the same class): 1.25 + 2.15 * 2^p = 5.23. Overlap: for these carbons the graph predictor sums the
 *   increments linearly (CHCl3 8.00, CH2Cl2 5.55); this class replaces that output, only for carbons that bear halogens and nothing else. CH3X (n = 1) and every carbon with a carbon or other neighbour are unchanged.
 */
export const COVERAGE_CITATION_ID = 'FULMER_2010_ORGANOMET';
export const COVERAGE_UNCERTAINTY_PPM = 0.2;
export const COVERAGE_RULES = {
  formylHetero: {shiftPpm: 8.02},
  arylS: {ch3: {base: 0.88, increment: 1.58}, ch2: {base: 1.25, increment: 1.56}},
  cycloalkane: {shiftPpm: 1.43, ringSizes: [5, 6, 7] as number[]},
  polyhalo: {exponent: 0.8893, ch2Base: 1.25, chBase: 1.55, alpha: {F: 3.3, Cl: 2.15, Br: 1.95, I: 1.75} as Record<string, number>},
} as const;

const A = (g: ParsedSmilesGraph, i: number): SmilesAtomNode => g.atoms[i];
const HAL = ['F', 'Cl', 'Br', 'I'];
export interface CoverageResult {shiftPpm: number; uncertaintyPpm: number; rule: string; termName: string; deltaPpm: number; condition: string}

/** The coverage rule of the H-bearing carbon `idx`, or null. */
export function coverageShift(g: ParsedSmilesGraph, idx: number): CoverageResult | null {
  const c = A(g, idx);
  if (c.element !== 'C' || c.isAromatic) return null;
  const nb = c.neighbors.map(n => ({order: n.order, atom: A(g, n.toAtom)}));
  // --- FORMYL_HETERO
  if (c.totalHydrogens === 1 && nb.length === 2 && nb.some(n => n.order === 2 && n.atom.element === 'O') && nb.some(n => n.order === 1 && (n.atom.element === 'N' || n.atom.element === 'O'))) {
    const v = COVERAGE_RULES.formylHetero.shiftPpm;
    return {shiftPpm: v, uncertaintyPpm: COVERAGE_UNCERTAINTY_PPM, rule: 'FORMYL_HETERO', termName: 'H-C(=O)-N/O formyl', deltaPpm: v, condition: 'formamide / formate formyl H; calibration DMF 8.02 (Fulmer 2010 S1), held out methyl, ethyl, isopropyl formate'};
  }
  if (!nb.every(n => n.order === 1) || c.totalHydrogens < 1 || c.totalHydrogens > 3) return null;
  // --- CYCLOALKANE_CH2: the molecule is one parent cycloalkane (a cycle of 5-7 CH2, nothing else)
  if (c.totalHydrogens === 2 && nb.length === 2 && nb.every(n => n.atom.element === 'C')) {
    const seen = new Set<number>([idx]), q = [idx];
    let pure = true;
    while (q.length && pure) { const u = q.shift()!; const a = A(g, u); if (a.element !== 'C' || a.isAromatic || a.totalHydrogens !== 2 || a.neighbors.length !== 2 || !a.neighbors.every(n => n.order === 1)) { pure = false; break; } for (const n of a.neighbors) if (!seen.has(n.toAtom)) { seen.add(n.toAtom); q.push(n.toAtom); } }
    if (pure && COVERAGE_RULES.cycloalkane.ringSizes.includes(seen.size) && seen.size === g.atoms.length) {
      const v = COVERAGE_RULES.cycloalkane.shiftPpm;
      return {shiftPpm: v, uncertaintyPpm: COVERAGE_UNCERTAINTY_PPM, rule: 'CYCLOALKANE_CH2', termName: 'parent cycloalkane CH2', deltaPpm: Number((v - 1.25).toFixed(3)), condition: `parent cycloalkane C${seen.size}; calibration cyclohexane 1.43 (Fulmer 2010 S1), held out cyclopentane 1.51, cycloheptane 1.53 (Reich)`};
    }
  }
  // --- POLYHALOMETHANE: only halogens besides H, at least two of them
  const hal = nb.filter(n => HAL.includes(n.atom.element));
  if (hal.length >= 2 && hal.length === nb.length && c.totalHydrogens + hal.length === 4) {
    const P = COVERAGE_RULES.polyhalo, n = hal.length;
    const alpha = hal.reduce((s, h) => s + P.alpha[h.atom.element], 0) / n;
    const v = (c.totalHydrogens === 2 ? P.ch2Base : P.chBase) + alpha * Math.pow(n, P.exponent);
    return {shiftPpm: Number(v.toFixed(3)), uncertaintyPpm: COVERAGE_UNCERTAINTY_PPM, rule: 'POLYHALOMETHANE', termName: `${n} geminal halogens (saturating, p = ${P.exponent})`, deltaPpm: Number((v - (c.totalHydrogens === 2 ? P.ch2Base : P.chBase)).toFixed(3)), condition: 'carbon with only halogens besides H; calibration CHCl3 7.26, held out CH2Cl2 5.30 (Fulmer 2010 S1)'};
  }
  // --- ARYL_S_CH: S bearing an aromatic ring and no oxygen; the carbon's other neighbours are alkyl carbons or H
  const sNb = nb.filter(n => n.atom.element === 'S');
  if (sNb.length === 1 && nb.length - 1 === nb.filter(n => n.atom.element === 'C' && !n.atom.isAromatic && n.atom.neighbors.every(m => m.order === 1)).length && (c.totalHydrogens === 3 || c.totalHydrogens === 2)) {
    const s = sNb[0].atom;
    const sn = s.neighbors.filter(m => m.toAtom !== idx).map(m => ({order: m.order, atom: A(g, m.toAtom)}));
    if (sn.length === 1 && sn[0].order === 1 && sn[0].atom.isAromatic && sn[0].atom.element === 'C' && s.neighbors.length === 2) {
      const r = c.totalHydrogens === 3 ? COVERAGE_RULES.arylS.ch3 : COVERAGE_RULES.arylS.ch2;
      return {shiftPpm: Number((r.base + r.increment).toFixed(3)), uncertaintyPpm: COVERAGE_UNCERTAINTY_PPM, rule: 'ARYL_S_CH', termName: 'alpha aryl-S (thioether)', deltaPpm: r.increment, condition: `aryl alkyl sulfide ${c.totalHydrogens === 3 ? 'S-CH3' : 'S-CH2'}; calibration Chem. Sci. 2020 SI (tier-1 quality), held out thioanisole / ethyl phenyl sulfide (Reich)`};
    }
  }
  return null;
}

/** Applies the coverage rules to a predictor result (after the additive rules). Returns the original object when no rule applies. */
export function applyCoverageH1<T extends {peaks: SpectralPeak[]; environments: ProtonEnvironment[]}>(result: T, graph: ParsedSmilesGraph): T {
  let changed = false;
  const envs = result.environments.map(env => {
    const idx = env.atomIndices?.[0];
    if (idx === undefined || env.isExchangeable) return env;
    const r = coverageShift(graph, idx);
    if (!r) return env;
    changed = true;
    // the solvent term of the graph predictor (polar C-H / ASIS adjustment) is kept: the rule values are CDCl3 shifts
    const sol = env.appliedCorrections?.find(c => /^Solvent Polar/.test(c.termName))?.deltaPpm ?? 0;
    const s = Number((r.shiftPpm + sol).toFixed(3)), unc = r.uncertaintyPpm;
    return {...env, shiftPpm: s, chemicalShift: s, predictedDeltaPpm: s, uncertaintyPpm: unc, expectedShiftRange: [Number((s - 2 * unc).toFixed(2)), Number((s + 2 * unc).toFixed(2))] as [number, number],
      appliedCorrections: [{termName: r.termName, deltaPpm: r.deltaPpm, reasonZh: `v1.4.0 覆蓋規則（${r.rule}）`, applicableCondition: r.condition, dataNature: 'EMPIRICAL_INCREMENT_MODEL' as const, citationId: COVERAGE_CITATION_ID}, ...(sol !== 0 ? [{termName: 'Solvent Polar/ASIS Adjustment (kept)', deltaPpm: sol, reasonZh: '溶劑修正沿用圖預測器', applicableCondition: 'solvent', dataNature: 'GENERAL_THEORY' as const, citationId: 'CASABIANCA_2020_MRC'}] : [])]} as ProtonEnvironment;
  });
  if (!changed) return result;
  const peaks = result.peaks.map((p, i) => {
    const e = envs[i]; if (!p || e === result.environments[i]) return p;
    const s = e.shiftPpm;
    return {...p, x: s, predictedRange: e.expectedShiftRange} as SpectralPeak;
  });
  return {...result, environments: envs, peaks};
}
