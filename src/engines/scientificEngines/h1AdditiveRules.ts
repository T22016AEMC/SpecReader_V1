import type {ParsedSmilesGraph, SmilesAtomNode} from '../chemistryEngine';
import type {ProtonEnvironment, SpectralPeak} from '../../types/spectrum';
import {AMBIT_HNMR_KNOWLEDGE_BASE_TEXT} from './ambitHnmrKnowledgeBase';
import {V12_CONFIG} from '../constraints/v12Config';

/**
 * v1.4.0 stop 2 (flag useV140H1, default off): the 1H additive-rule layer over the graph predictor.
 *
 * SOURCE OF THE NUMBERS: the Ambit-HNMR v1.2 knowledge base (Kochev, Tsoneva, Frenkeva, Jeliazkova; CC-BY-4.0; https://doi.org/10.5281/zenodo.4629851; third_party/ambit-hnmr), itself built on the additive
 * schemes of Pretsch. It is read by SUBSTITUENT NAME: each row is `name, SMARTS, value(s)`. SpecReader does NOT run the SMARTS of the file; it classifies the atoms of its own graph with the predicates below and takes the numbers of the row
 * with the same name (so the file is used as data, unchanged). Blocks used: ALKANES/CH3, CH2, CH (columns alpha, beta) and ALKENES (columns gem, cis, trans; base 5.25).
 *
 * WHAT IS CHANGED (and only that), when every substituent of the atom is recognised (otherwise the atom keeps the value of the graph predictor):
 *  - alkene C–H (=CH2 and =CH): 5.25 + gem + cis + trans (Pretsch alkene scheme as tabulated in the knowledge base); a terminal =CH2 becomes TWO 1H environments (one cis, one trans to the substituent);
 *  - sp3 C–H next to a C=C (allylic CH3 / CH2 / CH): base + alpha + beta of the ALKANES block;
 *  - sp3 C–H on a carbon that carries an oxygen (ether O–CH2, ester/alcohol O–CH, acetal O–CH–O): the same ALKANES-block sum.
 * Where the knowledge base is silent or a substituent is not recognised (organometallics, strained rings …) NOTHING is changed; stop 14: a heteroaryl or a CX3 / CHX2 substituent of an alkene is read as the closest tabulated row (alkeneSubstituentApprox), so that the =CH2 pair is split. No value was tuned to a sample or a rank.
 * Uncertainty of a rule shift: UNCERTAINTY_PPM = 0.3 (工程判斷, at the level of the 1H MAE of HOSE codes 0.33 ppm and of a GNN 0.28 ppm on NMRShiftDB2, Jonas & Kuhn, J. Cheminform. 2019, 11:50, doi 10.1186/s13321-019-0374-3).
 */
export const AMBIT_CITATION_ID = 'AMBIT_HNMR_2021';
export const UNCERTAINTY_PPM = 0.3;

interface KbRow {name: string; values: number[]}
interface KbBlock {name: string; base: number; designations: string[]; rows: Map<string, number[]>}
let kb: Map<string, KbBlock> | null = null;
/** The knowledge base as blocks (parsed once). Row line: `$$SUBST= name SMARTS-or-'--' number number [number]`; the number of values is the number of SHIFT_DESIGNATIONS. */
export function knowledgeBase(): Map<string, KbBlock> {
  if (kb) return kb;
  const out = new Map<string, KbBlock>();
  for (const chunk of AMBIT_HNMR_KNOWLEDGE_BASE_TEXT.split('$$H_ATOM_ENVIRONMENT=').slice(1)) {
    const lines = chunk.split('\n').map(l => l.trim()).filter(Boolean);
    const field = (key: string) => lines.find(l => l.startsWith(`$$${key}`))?.split('=').slice(1).join('=').trim() ?? '';
    const name = field('NAME'), designations = field('SHIFT_DESIGNATIONS').split(/\s+/).filter(Boolean);
    const rows = new Map<string, number[]>();
    for (const l of lines.filter(x => x.startsWith('$$SUBST='))) {
      const tok = l.slice('$$SUBST='.length).trim().split(/\s+/);
      const nums = tok.slice(-designations.length).map(Number);
      if (nums.length === designations.length && nums.every(Number.isFinite)) rows.set(tok[0], nums);
    }
    out.set(name, {name, base: Number(field('BASIC_SHIFT')), designations: name === 'ALKENES' ? ['gem', 'cis', 'trans'] : designations, rows});
  }
  kb = out;
  return out;
}

const A = (g: ParsedSmilesGraph, i: number): SmilesAtomNode => g.atoms[i];
const heavyNb = (g: ParsedSmilesGraph, i: number, except: number[] = []) => A(g, i).neighbors.filter(n => !except.includes(n.toAtom));
const hasOrder = (g: ParsedSmilesGraph, i: number, order: number, el?: string) => A(g, i).neighbors.some(n => n.order === order && (!el || A(g, n.toAtom).element === el));
/** The bond i–j lies in a ring: i and j stay connected without it. */
function bondInRing(g: ParsedSmilesGraph, i: number, j: number): boolean {
  const seen = new Set<number>([i]), q = [i];
  while (q.length) {
    const u = q.shift()!;
    for (const n of A(g, u).neighbors) {
      if ((u === i && n.toAtom === j) || seen.has(n.toAtom)) continue;
      if (n.toAtom === j) return true;
      seen.add(n.toAtom); q.push(n.toAtom);
    }
  }
  return false;
}
const atomInRing = (g: ParsedSmilesGraph, i: number) => A(g, i).neighbors.some(n => bondInRing(g, i, n.toAtom));
const benzeneLike = (g: ParsedSmilesGraph, i: number) => {
  // an aromatic carbon of a ring made of carbons only (benzene, naphthalene …): every aromatic neighbour chain stays carbon
  const seen = new Set<number>(), q = [i];
  while (q.length) { const u = q.shift()!; if (seen.has(u)) continue; seen.add(u); if (A(g, u).element !== 'C') return false; for (const n of A(g, u).neighbors) if (A(g, n.toAtom).isAromatic) q.push(n.toAtom); }
  return true;
};

/** Substituent row name for the ALKANES blocks (same names as the file), or null when the atom is not recognised. `parent` is the atom it hangs on. */
export function alkaneSubstituent(g: ParsedSmilesGraph, idx: number, parent: number): string | null {
  const a = A(g, idx), others = a.neighbors.filter(n => n.toAtom !== parent);
  switch (a.element) {
    case 'C': {
      if (a.isAromatic) return benzeneLike(g, idx) ? '-phenyl' : null;
      if (hasOrder(g, idx, 3, 'N')) return '-CN';
      if (hasOrder(g, idx, 3, 'C')) return '-C#C';
      if (hasOrder(g, idx, 2, 'O')) {
        const nb = a.neighbors.filter(n => n.order === 1).map(n => A(g, n.toAtom));
        if (nb.some(x => x.element === 'Cl')) return '-COCl';
        if (nb.some(x => x.element === 'N')) return '-CO-N';
        if (nb.some(x => x.element === 'O')) return nb.some(x => x.element === 'O' && x.totalHydrogens > 0) ? '-COOH' : '-COO-';
        if (a.totalHydrogens > 0) return '-CHO';
        return nb.every(x => x.element === 'C') ? '-CO-' : null;
      }
      if (hasOrder(g, idx, 2, 'C')) return others.some(n => ['O', 'N', 'S'].includes(A(g, n.toAtom).element)) ? null : '-C=C';
      if (a.neighbors.every(n => n.order === 1)) return '-C_alkyl';
      return null;
    }
    case 'O': {
      if (a.totalHydrogens > 0) return '-OH';
      const o = others.map(n => A(g, n.toAtom));
      if (o.length !== 1) return null;
      const x = o[0];
      if (x.element !== 'C') return null;
      if (x.isAromatic) return '-o-phenyl';
      if (hasOrder(g, x.index, 2, 'O')) return '-O(C=O)';
      if (hasOrder(g, x.index, 2, 'C')) return '-OC=C';
      return x.neighbors.every(n => n.order === 1) ? '-O-C' : null;
    }
    case 'N': {
      const o = others.map(n => A(g, n.toAtom));
      if (o.filter(x => x.element === 'O').length === 2) return '-NO2';
      if (a.formalCharge > 0 || a.neighbors.length === 4) return '-N+';
      if (o.some(x => x.element === 'C' && hasOrder(g, x.index, 2, 'O'))) return '-N(C=O)-';
      return a.neighbors.every(n => n.order === 1) ? '-N' : null;
    }
    case 'F': return '-F';
    case 'Cl': return '-Cl';
    case 'Br': return '-Br';
    case 'I': return '-I';
    case 'S': return a.neighbors.length === 2 && a.neighbors.every(n => n.order === 1) && !others.some(n => hasOrder(g, n.toAtom, 2, 'O')) ? '-S-' : null;
    default: return null;
  }
}

export interface RuleTerm {name: string; deltaPpm: number; basis: string}

/** Atoms of the shortest ring through the bond a-b (BFS from b back to a without the bond), or null. */
function ringThroughBond(g: ParsedSmilesGraph, a: number, b: number): number[] | null {
  const parent = new Map<number, number>([[b, -1]]), q = [b];
  while (q.length) {
    const u = q.shift()!;
    for (const n of A(g, u).neighbors) {
      if (u === b && n.toAtom === a) continue;
      if (n.toAtom === a) { const ring = [a]; for (let x = u; x !== -1; x = parent.get(x)!) ring.push(x); return ring; }
      if (!parent.has(n.toAtom)) { parent.set(n.toAtom, u); q.push(n.toAtom); }
    }
  }
  return null;
}

/**
 * v1.4.0 stop 11: finer oxygen environments (V12_CONFIG.v140Oxygen). Calibration / held-out (CDCl3 shifts; tier 1 = Fulmer 2010 SI Table S1, tier-1 quality = stated by the planner, tier 2 = Reich / user-looked-up values):
 *  - ESTER_METHINE: calibration isopropyl acetate OCH 4.98 (RSC SI, tier-1 quality); held out cyclohexyl acetate OCH 4.75 (RSC SI, tier-1 quality) and isopropyl formate OCH 5.13 (Reich). Before 4.31 (error -0.67 / -0.46 / -0.82).
 *  - ACETAL_CH2: calibration dimethoxymethane OCH2O (user list, tier 2, grade A, NAMED by the planner as the calibration point; the value is in the local-only file since v1.4.2 stop 36; the Reich / Pretsch value is also accepted by the validation); held out 1,3-dioxolane OCH2O (grade A, local-only). Before 5.45.
 *    The acetal C-H (O-CH-O: 1,1-diethoxyethane, trimethyl orthoformate, bromoacetaldehyde acetal) has held-out points only, NO calibration point: no rule. The ketal OCH3 (2,2-dimethoxypropane 3.19) is already within 0.05.
 *  - CYCLIC_ETHER: calibration tetrahydrofuran OCH2 3.76 (tier 1); held out tetrahydropyran OCH2 3.65 (Reich). Before 3.37 (error -0.39 / -0.28). 1,4-dioxane and 18-crown-6 (two or more O, tier 1) are not this class.
 *  - GLYCOL_OCH3: OCH3 of CH3-O-CH2-C-O (a second ether O three bonds from the carbon): calibration 1,2-dimethoxyethane CH3 3.40 (tier 1); held out diglyme OCH3 3.39 (tier 1, other compound). Before 3.24 (error -0.16 / -0.15).
 *  - secondary alcohol C-H: NO rule. The only acyclic point is 2-propanol 4.04 (tier 1); the other secondary alcohol, cyclohexanol (user list, grade A, value local-only), is cyclic and is already predicted (3.55). One point cannot calibrate a class.
 * Overlap: each is a finer environment of the oxygen group (the knowledge-base sum is kept; one correction term is added); nothing outside these three environments changes.
 */
function oxygenCorrection(g: ParsedSmilesGraph, idx: number, nb: number[]): RuleTerm | null {
  const R = V12_CONFIG.v140Oxygen;
  if (!R.enabled) return null;
  const c = A(g, idx), oxy = nb.filter(j => A(g, j).element === 'O');
  if (c.totalHydrogens === 1 && nb.length === 3 && oxy.length === 1 && alkaneSubstituent(g, oxy[0], idx) === '-O(C=O)' && !bondInRing(g, idx, oxy[0]) && nb.filter(j => j !== oxy[0]).every(j => alkaneSubstituent(g, j, idx) === '-C_alkyl'))
    return {name: 'acyloxy methine (calibrated)', deltaPpm: R.esterMethine.deltaPpm, basis: 'calibration isopropyl acetate OCH 4.98; held out cyclohexyl acetate, isopropyl formate'};
  if (c.totalHydrogens === 3 && nb.length === 1 && oxy.length === 1 && alkaneSubstituent(g, oxy[0], idx) === '-O-C') {
    const c1 = A(g, oxy[0]).neighbors.map(n => n.toAtom).find(j => j !== idx);
    const a1 = c1 === undefined ? null : A(g, c1);
    if (c1 !== undefined && a1 && a1.element === 'C' && !a1.isAromatic && a1.totalHydrogens === 2 && a1.neighbors.every(n => n.order === 1)
      && a1.neighbors.some(n => n.toAtom !== oxy[0] && A(g, n.toAtom).element === 'C' && A(g, n.toAtom).neighbors.some(m => m.toAtom !== c1 && A(g, m.toAtom).element === 'O' && alkaneSubstituent(g, m.toAtom, n.toAtom) === '-O-C')))
      return {name: 'glycol-type methyl ether OCH3 (calibrated)', deltaPpm: R.glycolOCH3.deltaPpm, basis: 'calibration 1,2-dimethoxyethane CH3 3.40; held out diglyme OCH3'};
  }
  if (c.totalHydrogens === 2 && nb.length === 2 && oxy.length === 2 && oxy.every(j => alkaneSubstituent(g, j, idx) === '-O-C'))
    return {name: 'acetal O-CH2-O (calibrated)', deltaPpm: R.acetalCH2.deltaPpm, basis: 'calibration dimethoxymethane OCH2O; held out 1,3-dioxolane'};
  if (c.totalHydrogens === 2 && nb.length === 2 && oxy.length === 1 && alkaneSubstituent(g, oxy[0], idx) === '-O-C') {
    const other = nb.find(j => j !== oxy[0])!;
    const ring = alkaneSubstituent(g, other, idx) === '-C_alkyl' ? ringThroughBond(g, idx, oxy[0]) : null;
    if (ring && R.cyclicEther.ringSizes.includes(ring.length) && ring.every(j => j === oxy[0] || (A(g, j).element === 'C' && !A(g, j).isAromatic && A(g, j).neighbors.every(n => n.order === 1))))
      return {name: 'cyclic ether O-CH2 (calibrated)', deltaPpm: R.cyclicEther.deltaPpm, basis: 'calibration tetrahydrofuran OCH2 3.76; held out tetrahydropyran'};
  }
  return null;
}
/** group: which switch (V12_CONFIG.v140) owns the result: 'oxygen' = the carbon has an oxygen neighbour (whatever else it has); 'alkene' = allylic C-H without oxygen, and every alkene C-H. */
export type RuleGroup = 'alkene' | 'oxygen';
export interface AdditiveResult {shiftPpm: number; uncertaintyPpm: number; terms: RuleTerm[]; rule: string; group: RuleGroup}

/** sp3 C–H next to a C=C or on a carbon with oxygen: ALKANES block, base + alpha (each atom bonded to the carbon) + beta (each atom bonded to those atoms). null = not this rule or something unrecognised. */
export function alkaneShift(g: ParsedSmilesGraph, idx: number): AdditiveResult | null {
  const c = A(g, idx);
  if (c.element !== 'C' || c.isAromatic || c.totalHydrogens < 1 || c.totalHydrogens > 3 || !c.neighbors.every(n => n.order === 1)) return null;
  const nb = c.neighbors.map(n => n.toAtom);
  const allylic = nb.some(j => A(g, j).element === 'C' && !A(g, j).isAromatic && hasOrder(g, j, 2, 'C'));
  const withO = nb.some(j => A(g, j).element === 'O');
  if (!allylic && !withO) return null;
  const blockName = `ALKANES/CH${c.totalHydrogens === 3 ? '3' : c.totalHydrogens === 2 ? '2' : ''}`;
  const block = knowledgeBase().get(blockName);
  if (!block) return null;
  const terms: RuleTerm[] = [{name: `${blockName} base`, deltaPpm: block.base, basis: `Ambit-HNMR ${blockName} BASIC_SHIFT`}];
  for (const j of nb) {
    const rowName = alkaneSubstituent(g, j, idx);
    const v = rowName ? block.rows.get(rowName) : undefined;
    if (!rowName || !v) return null;
    terms.push({name: `alpha ${rowName}`, deltaPpm: v[0], basis: `Ambit-HNMR ${blockName} row ${rowName}`});
    if (rowName !== '-C_alkyl') continue;   // beta substituents hang on an alkyl carbon; every other alpha substituent is one whole group (OR, OC(=O)R, C(=O)R, phenyl …)
    for (const n of heavyNb(g, j, [idx])) {
      const b = alkaneSubstituent(g, n.toAtom, j);
      const bv = b ? block.rows.get(b) : undefined;
      if (!b || !bv) {
        // an unclassifiable beta atom: hydrogen-like or not in the table -> treat only plain hydrogens (absent from the graph) as zero; anything else is unrecognised
        return null;
      }
      terms.push({name: `beta ${b}`, deltaPpm: bv[1], basis: `Ambit-HNMR ${blockName} row ${b}`});
    }
  }
  if (withO && !allylic) { const extra = oxygenCorrection(g, idx, nb); if (extra) terms.push(extra); }
  return {shiftPpm: terms.reduce((s, t) => s + t.deltaPpm, 0), uncertaintyPpm: UNCERTAINTY_PPM, terms, rule: allylic ? 'ALLYLIC_C-H' : 'O-C-H', group: withO ? 'oxygen' : 'alkene'};
}

/** Substituent row name for the ALKENES block, or null. */
export function alkeneSubstituent(g: ParsedSmilesGraph, idx: number, parent: number): string | null {
  const a = A(g, idx), others = a.neighbors.filter(n => n.toAtom !== parent);
  switch (a.element) {
    case 'C': {
      if (a.isAromatic) return benzeneLike(g, idx) ? '-phenyl' : null;
      if (hasOrder(g, idx, 3, 'N')) return '-CN';
      if (hasOrder(g, idx, 3, 'C')) return '-C#C';
      if (hasOrder(g, idx, 2, 'O')) {
        const nb = a.neighbors.filter(n => n.order === 1).map(n => A(g, n.toAtom));
        if (nb.some(x => x.element === 'Cl')) return '-COCl';
        if (nb.some(x => x.element === 'N')) return '-CO-N';
        if (nb.some(x => x.element === 'O')) return nb.some(x => x.element === 'O' && x.totalHydrogens > 0) ? '-COOH' : '-COOR';
        if (a.totalHydrogens > 0) return '-CHO';
        return nb.every(x => x.element === 'C') ? '-CO-' : null;
      }
      if (hasOrder(g, idx, 2, 'C')) return others.some(n => ['O', 'N', 'S'].includes(A(g, n.toAtom).element)) ? null : '-C=C';
      if (a.neighbors.every(n => n.order === 1)) {
        const nbEl = others.map(n => A(g, n.toAtom));
        if (nbEl.some(x => x.element === 'C' && x.isAromatic)) return a.totalHydrogens === 2 ? '-CH2-phenyl' : null;
        if (nbEl.filter(x => x.element === 'F').length === 3) return '-CF3';
        if (a.totalHydrogens === 2 && nbEl.length === 1) {
          const x = nbEl[0];
          if (x.element === 'F') return '-CH2F';
          if (x.element === 'Br') return '-CH2Br';
          if (x.element === 'O') return '-CH2O';
          if (x.element === 'N') return '-CH2N';
        }
        if (nbEl.some(x => ['O', 'N', 'S', 'F', 'Cl', 'Br', 'I'].includes(x.element))) return null;
        return atomInRing(g, idx) ? '-alkyl_ring' : '-C_alkyl';
      }
      return null;
    }
    case 'O': {
      const o = others.map(n => A(g, n.toAtom));
      if (o.length !== 1 || o[0].element !== 'C') return null;
      if (hasOrder(g, o[0].index, 2, 'O')) return '-OCO-';
      if (o[0].isAromatic || hasOrder(g, o[0].index, 2, 'C')) return '-OC(sp2)';
      return o[0].neighbors.every(n => n.order === 1) ? '-OC(sp3)' : null;
    }
    case 'N': {
      const o = others.map(n => A(g, n.toAtom));
      if (o.filter(x => x.element === 'O').length === 2) return '-NO2';
      if (o.some(x => x.element === 'C' && hasOrder(g, x.index, 2, 'O'))) return '-NCO-R';
      if (a.totalHydrogens === 2) return '-NH2';
      return o.length === 2 && o.every(x => x.element === 'C' && x.neighbors.every(n => n.order === 1)) ? '-NC2_C_(sp3)' : null;
    }
    case 'F': return '-F';
    case 'Cl': return '-C1';
    case 'Br': return '-Br';
    case 'I': return '-I';
    case 'S': return a.neighbors.length === 2 && a.neighbors.every(n => n.order === 1) ? '-S-' : null;
    default: return null;
  }
}

/**
 * v1.4.0 stop 14: the closest tabulated ALKENES row for a substituent that alkeneSubstituent does not recognise, so that the two hydrogens of a terminal =CH2 can still be told apart (cis / trans to the substituent).
 * Only two kinds are read (both seen in the stop-13 truth set), each as the row of the closest tabulated group; anything else stays unrecognised (null) and the carbon keeps the graph value:
 *  - a heteroaromatic carbon (4-pyridyl, 2-furyl …; alkeneSubstituent only accepts all-carbon rings): the '-phenyl' row;
 *  - an sp3 carbon with three halogens and no hydrogen (CCl3, CBr3, CF3): the '-CF3' row; with one hydrogen and two halogens (CHCl2 …): the '-CHF2' row.
 * The row is a stand-in, not a measurement of that group: the term names it ("closest tabulated row") and the uncertainty of the shift grows by APPROX_SUBSTITUENT_UNCERTAINTY_PPM per stand-in (工程判斷, the size of the
 * cis / trans spread the code already adds for an unknown E/Z geometry).
 */
export const APPROX_SUBSTITUENT_UNCERTAINTY_PPM = 0.2;
export function alkeneSubstituentApprox(g: ParsedSmilesGraph, idx: number, parent: number): {row: string; why: string} | null {
  const a = A(g, idx), others = a.neighbors.filter(n => n.toAtom !== parent);
  if (a.element !== 'C') return null;
  if (a.isAromatic) return benzeneLike(g, idx) ? null : {row: '-phenyl', why: 'heteroaromatic ring read as phenyl'};
  if (a.neighbors.every(n => n.order === 1)) {
    const hal = others.filter(n => ['F', 'Cl', 'Br', 'I'].includes(A(g, n.toAtom).element)).length;
    if (hal === 3 && others.length === 3) return {row: '-CF3', why: 'CX3 read as CF3'};
    if (hal === 2 && a.totalHydrogens === 1 && others.length === 2) return {row: '-CHF2', why: 'CHX2 read as CHF2'};
  }
  return null;
}

/**
 * v1.4.1 stop 22 (flags useV140H1 and v140.round3, DEFAULT OFF): the substituents of a vinyl group that neither alkeneSubstituent nor alkeneSubstituentApprox read, so that the =CH2 pair of CH2=CH-X is still split into two 1H.
 * The Ambit ALKENES block was looked at row by row (hnmr-knowledgebase.txt lines 137-187); each substituent got the tabulated row of the closest group, or none when no row is a reasonable stand-in. No number of any row was changed and nothing was
 * fitted (there is no truth value for these groups; this step only splits, it does not tune):
 *  - sulfone C-SO2-R (vinyl sulfones): the tabulated row '-SO2-' ([SX4](=O)(=O)); it is the same group, so no surcharge (exact).
 *  - phosphonate C-P(=O)(OR)2: the tabulated row '-PO(OCH2CH3)2' (diethyl phosphonate). Diethyl esters use it as it is (exact); other esters (dimethyl ...) borrow it (same P(=O)(OC)2 group, different alkyl, three bonds away): stand-in, +APPROX_SUBSTITUENT_UNCERTAINTY_PPM.
 *  - secondary carbinol CH(OH)R / CH(OR)R (one H, one oxygen, one alkyl carbon; CH(OH)CH3): the tabulated row '-CH2O' ([CX4H2][OX2-]): the same sp3 carbon with one oxygen (the extra alkyl branch is not in the row): stand-in, + surcharge.
 *  - NOT read (kept as they were, the =CH2 stays one 2H environment): trialkylsilyl C-SiR3. Silicon is electropositive and no tabulated group (halogens, O, N, S, carbonyls, alkyl) is electronically close to it; the nearest in size (a tert-butyl-type '-C_alkyl')
 *    is a carbon, not a silicon, and borrowing it would put a different kind of substituent effect on the pair than silicon has. Recorded in V12_CONFIG.v140Round3.unsplitVinylSubstituents and notes/v1.4.1/STOP22_CHECKPOINT.md.
 *  - CHCl2 and 2-furyl are NOT in this function: alkeneSubstituentApprox (stop 14) already reads them (CHX2 as CHF2, heteroaryl as phenyl), so their =CH2 is already split; the stop-15 known-limits list was out of date on those two.
 */
export function alkeneSubstituentRound3(g: ParsedSmilesGraph, idx: number, parent: number): {row: string; why: string; exact: boolean} | null {
  if (!(V12_CONFIG.useV140H1 && V12_CONFIG.v140.round3)) return null;
  const a = A(g, idx), others = a.neighbors.filter(n => n.toAtom !== parent);
  if (a.element === 'S') {
    const oxo = others.filter(n => n.order === 2 && A(g, n.toAtom).element === 'O');
    const rest = others.filter(n => !(n.order === 2 && A(g, n.toAtom).element === 'O'));
    if (oxo.length === 2 && rest.length === 1 && rest[0].order === 1 && A(g, rest[0].toAtom).element === 'C') return {row: '-SO2-', why: 'sulfone', exact: true};
    return null;
  }
  if (a.element === 'P') {
    const oxo = others.filter(n => n.order === 2 && A(g, n.toAtom).element === 'O');
    const esters = others.filter(n => n.order === 1 && A(g, n.toAtom).element === 'O');
    if (oxo.length !== 1 || esters.length !== 2 || others.length !== 3) return null;
    const alkylOf = (o: number) => A(g, o).neighbors.filter(n => n.toAtom !== idx);
    if (!esters.every(n => { const t = alkylOf(n.toAtom); return t.length === 1 && A(g, t[0].toAtom).element === 'C' && !A(g, t[0].toAtom).isAromatic && A(g, t[0].toAtom).neighbors.every(m => m.order === 1); })) return null;
    const ethyl = (o: number) => { const c = A(g, alkylOf(o)[0].toAtom); return c.totalHydrogens === 2 && c.neighbors.length === 2 && c.neighbors.some(m => m.toAtom !== o && A(g, m.toAtom).element === 'C' && A(g, m.toAtom).totalHydrogens === 3 && A(g, m.toAtom).neighbors.length === 1); };
    const diethyl = esters.every(n => ethyl(n.toAtom));
    return {row: '-PO(OCH2CH3)2', why: 'phosphonate ester read as the diethyl phosphonate row', exact: diethyl};
  }
  if (a.element === 'C' && !a.isAromatic && a.neighbors.every(n => n.order === 1) && a.totalHydrogens === 1 && others.length === 2) {
    const oxy = others.filter(n => A(g, n.toAtom).element === 'O'), alk = others.filter(n => A(g, n.toAtom).element === 'C');
    if (oxy.length === 1 && alk.length === 1) {
      const c = A(g, alk[0].toAtom);
      const ownOxygenIsEtherOrAlcohol = A(g, oxy[0].toAtom).neighbors.filter(n => n.toAtom !== idx).every(n => A(g, n.toAtom).element === 'C' && !A(g, n.toAtom).isAromatic && n.order === 1 && A(g, n.toAtom).neighbors.filter(m => m.toAtom !== oxy[0].toAtom).every(m => m.order === 1 && A(g, m.toAtom).element === 'C'));
      if (!c.isAromatic && c.neighbors.every(m => m.order === 1 && (A(g, m.toAtom).element === 'C')) && ownOxygenIsEtherOrAlcohol) return {row: '-CH2O', why: 'CH(O)R (secondary carbinol) read as CH2O', exact: false};
    }
  }
  return null;
}

export interface AlkeneHResult {shiftsPpm: number[]; uncertaintyPpm: number; terms: RuleTerm[][]; rule: string}
/**
 * Alkene C–H of carbon `idx` (=CH2 or =CH): 5.25 + gem (substituents on this carbon) + cis / trans (substituents on the other carbon). Returns one shift per hydrogen kind:
 * a =CH2 gives two (the hydrogen cis, the hydrogen trans to the first substituent of the other carbon), a =CH one. With the E/Z geometry unknown (the graph has none) a substituent of the other carbon
 * contributes the mean of cis and trans, and the uncertainty grows by half their difference; in a ring the ring substituent of the other carbon is trans to the hydrogen (Pretsch / the file's "-alkyl_ring" row).
 */
export function alkeneShifts(g: ParsedSmilesGraph, idx: number): AlkeneHResult | null {
  const c = A(g, idx);
  if (c.element !== 'C' || c.isAromatic || c.totalHydrogens < 1 || c.totalHydrogens > 2) return null;
  const dbl = c.neighbors.filter(n => n.order === 2);
  if (dbl.length !== 1 || A(g, dbl[0].toAtom).element !== 'C' || A(g, dbl[0].toAtom).isAromatic) return null;
  if (c.neighbors.some(n => n.order === 3)) return null;
  const block = knowledgeBase().get('ALKENES');
  if (!block) return null;
  const p = dbl[0].toAtom;
  const gemSubs = c.neighbors.filter(n => n.order === 1).map(n => n.toAtom);
  const farSubs = A(g, p).neighbors.filter(n => n.toAtom !== idx && n.order === 1).map(n => n.toAtom);
  if (A(g, p).neighbors.some(n => n.toAtom !== idx && n.order !== 1)) return null;   // allene / cumulated
  const classify = (list: number[], parent: number): Array<{atom: number; row: string; v: number[]; approx?: string; r3?: string}> | null => {
    const out: Array<{atom: number; row: string; v: number[]; approx?: string; r3?: string}> = [];
    for (const j of list) {
      const r = alkeneSubstituent(g, j, parent), v = r ? block.rows.get(r) : undefined;
      if (r && v) { out.push({atom: j, row: r, v}); continue; }
      const ap = alkeneSubstituentApprox(g, j, parent), av = ap ? block.rows.get(ap.row) : undefined;
      if (ap && av) { out.push({atom: j, row: ap.row, v: av, approx: ap.why}); continue; }
      const r3 = alkeneSubstituentRound3(g, j, parent), rv = r3 ? block.rows.get(r3.row) : undefined;   // stop 22 (v140.round3): sulfone, phosphonate ester, CH(O)R
      if (!r3 || !rv) return null;
      out.push({atom: j, row: r3.row, v: rv, r3: r3.why, ...(r3.exact ? {} : {approx: r3.why})});
    }
    return out;
  };
  const note = (s: {approx?: string; r3?: string}) => (s.approx ? `; closest tabulated row (${s.approx}), substituent not in the table` : s.r3 ? `; ${s.r3} (v140.round3 mapping, the tabulated row of this group)` : '');
  const gem = classify(gemSubs, idx), far = classify(farSubs, p);
  if (!gem || !far) return null;
  const terms: RuleTerm[] = [{name: 'ALKENES base', deltaPpm: block.base, basis: 'Ambit-HNMR ALKENES BASIC_SHIFT (Pretsch ethylene 5.25)'}];
  let fixed = block.base, unc = UNCERTAINTY_PPM;
  for (const s of gem) {
    // a ring substituent of this carbon in a ring that contains the double bond is tabulated as '-alkyl_ring'
    const inRingWithDbl = bondInRing(g, idx, s.atom) && bondInRing(g, idx, p);
    const row = inRingWithDbl && block.rows.get('-alkyl_ring') && s.row === '-C_alkyl' ? '-alkyl_ring' : s.row;
    const v = block.rows.get(row)!;
    fixed += v[0]; if (s.approx) unc += APPROX_SUBSTITUENT_UNCERTAINTY_PPM; terms.push({name: `gem ${row}`, deltaPpm: v[0], basis: `Ambit-HNMR ALKENES row ${row}${note(s)}`});
  }
  // substituents of the other carbon: cis / trans relative to a hydrogen of this carbon
  const ringFar = (s: {atom: number}) => bondInRing(g, p, s.atom) && bondInRing(g, idx, p);
  if (c.totalHydrogens === 2) {
    // =CH2: hydrogen A is cis to far[0] and trans to far[1]; hydrogen B the other way round
    const sums = [fixed, fixed], lists: RuleTerm[][] = [terms.slice(), terms.slice()];
    far.forEach((s, k) => {
      const aCis = k === 0;
      const vA = aCis ? s.v[1] : s.v[2], vB = aCis ? s.v[2] : s.v[1];
      sums[0] += vA; sums[1] += vB; if (s.approx) unc += APPROX_SUBSTITUENT_UNCERTAINTY_PPM;
      lists[0].push({name: `${aCis ? 'cis' : 'trans'} ${s.row}`, deltaPpm: vA, basis: `Ambit-HNMR ALKENES row ${s.row}${note(s)}`});
      lists[1].push({name: `${aCis ? 'trans' : 'cis'} ${s.row}`, deltaPpm: vB, basis: `Ambit-HNMR ALKENES row ${s.row}${note(s)}`});
    });
    if (Math.abs(sums[0] - sums[1]) < 1e-9) return {shiftsPpm: [Number(sums[0].toFixed(3))], uncertaintyPpm: unc, terms: [lists[0]], rule: 'ALKENE_CH2'};
    return {shiftsPpm: sums.map(x => Number(x.toFixed(3))), uncertaintyPpm: unc, terms: lists, rule: 'ALKENE_CH2_SPLIT'};
  }
  let sum = fixed;
  const meanTerms: RuleTerm[] = [];
  for (const s of far) {
    const cis = s.v[1], trans = s.v[2];
    if (s.approx) unc += APPROX_SUBSTITUENT_UNCERTAINTY_PPM;
    if (ringFar(s)) { sum += trans; meanTerms.push({name: `trans ${s.row} (ring)`, deltaPpm: trans, basis: `Ambit-HNMR ALKENES row ${s.row}${note(s)}`}); }
    else { const m = (cis + trans) / 2; sum += m; unc += Math.abs(cis - trans) / 4; meanTerms.push({name: `mean(cis,trans) ${s.row}`, deltaPpm: m, basis: `Ambit-HNMR ALKENES row ${s.row}; E/Z unknown${note(s)}`}); }
  }
  return {shiftsPpm: [Number(sum.toFixed(3))], uncertaintyPpm: Number(unc.toFixed(3)), terms: [terms.concat(meanTerms)], rule: 'ALKENE_CH'};
}

/**
 * v1.4.0 stop 6: the two methyls of a =C(CH3)2 group whose E / Z methyls are NOT equivalent. Returns the carbon's two CH3 neighbours when atom `c` is a non-aromatic sp2 carbon (one double bond, to a carbon) with exactly two methyl
 * neighbours (a methyl = carbon with three H and no other heavy neighbour) AND the other alkene carbon carries two different substituents (=CH-R, or =C(R)(R') with R and R' differing in element, H count or degree). An sp3 gem-dimethyl
 * (C(CH3)2, tert-butyl, isopropyl), a C(CH3)2 on a carbonyl, and a =C(CH3)2 whose partner is =CH2 or =C(CH3)2 (the two methyls really are equivalent there) are NOT this and stay one 6H signal.
 */
export function gemDimethylOnAlkene(g: ParsedSmilesGraph, c: number): [number, number] | null {
  const a = A(g, c);
  if (a.element !== 'C' || a.isAromatic) return null;
  const dbl = a.neighbors.filter(n => n.order === 2 && A(g, n.toAtom).element === 'C' && !A(g, n.toAtom).isAromatic);
  if (dbl.length !== 1) return null;
  const me = a.neighbors.filter(n => n.order === 1 && A(g, n.toAtom).element === 'C' && !A(g, n.toAtom).isAromatic && A(g, n.toAtom).totalHydrogens === 3 && A(g, n.toAtom).neighbors.length === 1).map(n => n.toAtom);
  if (me.length !== 2) return null;
  const d = A(g, dbl[0].toAtom), subs = d.neighbors.filter(n => n.toAtom !== c && n.order === 1).map(n => A(g, n.toAtom));
  const differ = d.totalHydrogens >= 2 ? false : d.totalHydrogens === 1 ? subs.length === 1
    : subs.length === 2 && (subs[0].element !== subs[1].element || subs[0].totalHydrogens !== subs[1].totalHydrogens || subs[0].neighbors.length !== subs[1].neighbors.length);
  return differ ? [me[0], me[1]] : null;
}
/** True when the graph has at least one =C(CH3)2 group. */
export const hasGemDimethylOnAlkene = (g: ParsedSmilesGraph): boolean => g.atoms.some(a => gemDimethylOnAlkene(g, a.index) !== null);
/**
 * Splits every predicted 6H environment that is exactly the two methyls of one =C(CH3)2 into two 3H environments (same shift, ids -m1 / -m2); every other environment is returned unchanged.
 */
export function splitGemDimethylEnvs<T extends ProtonEnvironment>(envs: T[], g: ParsedSmilesGraph): {envs: T[]; split: number} {
  const out: T[] = []; let split = 0;
  for (const e of envs) {
    const ai = e.atomIndices;
    const parent = ai && ai.length === 2 && !e.isExchangeable && e.integration === 6 ? A(g, ai[0]).neighbors[0]?.toAtom : undefined;
    const pair = parent !== undefined ? gemDimethylOnAlkene(g, parent) : null;
    if (!ai || !pair || !(pair.includes(ai[0]) && pair.includes(ai[1]))) { out.push(e); continue; }
    split++;
    ai.forEach((atom, k) => out.push({...e, id: `${e.id}-m${k + 1}`, atomIndices: [atom], integration: 3, expectedProtonCount: 3, inferredProtonCount: 3} as T));
  }
  return {envs: out, split};
}
/** The observed side of the =C(CH3)2 reading: two singlet-type 1H signals inside the allylic-methyl window with equal integrals (V12_CONFIG.gemDimethylReading). */
export function gemDimethylObservedPair(obs: {position?: number; relativeIntegral?: number | null; multiplicity?: string | null}[]): boolean {
  const G = V12_CONFIG.gemDimethylReading;
  const ok = obs.filter(o => o.position !== undefined && o.position >= G.windowPpm[0] && o.position <= G.windowPpm[1] && o.relativeIntegral != null && o.relativeIntegral > 0 && (!o.multiplicity || G.multiplicities.includes(o.multiplicity)));
  for (let i = 0; i < ok.length; i++) for (let j = i + 1; j < ok.length; j++) if (Math.abs(ok[i].relativeIntegral! - ok[j].relativeIntegral!) <= G.integralTolerance * Math.max(ok[i].relativeIntegral!, ok[j].relativeIntegral!)) return true;
  return false;
}

/** Pretsch / Karplus-free J per environment type (first order), used for the two =CH2 hydrogens: trans 11–18 Hz, cis 6–15 Hz (工程判斷 centre values 17 and 10; 出處 Pretsch, tabulated ranges already used by the predictor). */
export const J_ALKENE = {trans: 17, cis: 10, ranges: {trans: [11, 18], cis: [6, 15]}} as const;

/**
 * Applies the rules to a graph-predictor result. environments[i] <-> peaks[i] (same order, ids pred-h1-env-N / pred-h1-N). Returns the original object unchanged when no rule applies.
 */
export function applyAdditiveH1<T extends {peaks: SpectralPeak[]; environments: ProtonEnvironment[]}>(result: T, graph: ParsedSmilesGraph, groups: Record<RuleGroup, boolean> = {alkene: true, oxygen: true}): T {
  const envs: ProtonEnvironment[] = [], peaks: SpectralPeak[] = [];
  let changed = false;
  result.environments.forEach((env, i) => {
    const peak = result.peaks[i];
    const idx = env.atomIndices?.[0];
    const natoms = env.atomIndices?.length ?? 1;
    const mark = (shifts: number[], unc: number, terms: RuleTerm[][], rule: string) => {
      changed = true;
      shifts.forEach((s, k) => {
        const integ = shifts.length === 2 ? natoms : (env.integration ?? 0);
        const suffix = shifts.length === 2 ? (k === 0 ? '-a' : '-b') : '';
        const corrections = terms[k].map(t => ({termName: t.name, deltaPpm: t.deltaPpm, reasonZh: `Ambit-HNMR 加成規則（${rule}）`, applicableCondition: t.basis, dataNature: 'EMPIRICAL_INCREMENT_MODEL' as const, citationId: AMBIT_CITATION_ID}));
        const e2 = {...env, id: `${env.id}${suffix}`, shiftPpm: s, chemicalShift: s, predictedDeltaPpm: s, uncertaintyPpm: unc, expectedShiftRange: [Number((s - 2 * unc).toFixed(2)), Number((s + 2 * unc).toFixed(2))] as [number, number],
          integration: integ, expectedProtonCount: integ, inferredProtonCount: integ, appliedCorrections: corrections} as ProtonEnvironment;
        if (shifts.length === 2 && e2.couplings) {
          const jv = k === 0 ? J_ALKENE.cis : J_ALKENE.trans;   // hydrogen A is the one cis to the first substituent
          e2.couplings = e2.couplings.map(cp => (/alkene/.test(String(cp.couplingType)) ? {...cp, J: jv, literatureRangeHz: k === 0 ? [...J_ALKENE.ranges.cis] as [number, number] : [...J_ALKENE.ranges.trans] as [number, number]} : cp));
          e2.jCouplingHz = e2.couplings.map(cp => cp.J);
        }
        envs.push(e2);
        if (peak) peaks.push({...peak, id: `${peak.id}${suffix}`, x: s, integration: integ, integral: integ, predictedRange: [Number((s - 2 * unc).toFixed(2)), Number((s + 2 * unc).toFixed(2))] as [number, number]} as SpectralPeak);
      });
    };
    if (idx !== undefined && !env.isExchangeable) {
      const alk = groups.alkene ? alkeneShifts(graph, idx) : null;
      if (alk) { mark(alk.shiftsPpm, alk.uncertaintyPpm, alk.terms, alk.rule); return; }
      const sp3 = alkaneShift(graph, idx);
      if (sp3 && groups[sp3.group]) { mark([Number(sp3.shiftPpm.toFixed(3))], sp3.uncertaintyPpm, [sp3.terms], sp3.rule); return; }
    }
    envs.push(env); if (peak) peaks.push(peak);
  });
  return changed ? {...result, environments: envs, peaks} : result;
}
