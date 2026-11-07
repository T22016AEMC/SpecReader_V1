import {executeSixStepAnalysis} from '../../src/engines/reasoning/sixStepAnalysis';
import {canonNoStereo, fixtureSpectra, SHAPE_BUDGET} from './v121Golden';
import {loadV123} from './v123Samples';

// v1.3.1 synthetic samples for the parsimony prior (all hand-written, CDCl3 400 MHz declared, dense IR baseline, step budget only): the p-cresol family in its four 3335 / OH markings,
// the protected samples (BPA, di-p-tolyl ether, an unsymmetric biaryl) and the ester / amide / acid types of v1.3.0. `typed` = the molecular formula is typed in.
export interface V131Case {sample: string; typed: boolean; note: string}
export const V131_CASES: V131Case[] = [
  {sample: 'v130/CR1', typed: false, note: 'p-cresol, IR 3335, 1H without OH (the case of the task)'},
  {sample: 'P1', typed: false, note: 'p-cresol, IR 3338, 1H without OH, physical intensities'},
  {sample: 'P2', typed: false, note: 'p-cresol, IR 3338 and OH 4.70 in 1H'},
  {sample: 'v130/CR0', typed: false, note: 'p-cresol-size data without the 3335 band, 1H without OH (the ether competes)'},
  {sample: 'v131/CR2', typed: false, note: 'p-cresol, OH 4.70 in 1H, no 3335 band'},
  {sample: 'B1', typed: false, note: 'bisphenol A type (needs the larger molecule)'},
  {sample: 'v131/ETH1', typed: false, note: 'di-p-tolyl ether: aryl ether C-O, no O-H, 1H without OH (needs the larger molecule)'},
  {sample: 'v131/ASY1', typed: false, note: 'unsymmetric biaryl, six 1H signals (more than a monomer has)'},
  {sample: 'v130/EST1', typed: false, note: 'ethyl benzoate'},
  {sample: 'M1', typed: false, note: 'PMA type'},
  {sample: 'v130/AMD1', typed: false, note: 'acetanilide'},
  {sample: 'v130/HCA', typed: true, note: '3-phenylpropanoic acid, formula typed'},
];
export interface V131Measure {sample: string; typed: boolean; targetRank: number | null; ranked: number; top: {smiles: string; score: number | null; isTarget: boolean; prior: number}[]}
export async function measureV131(c: V131Case, top = 6): Promise<V131Measure> {
  const f = loadV123(c.sample);
  const r = await executeSixStepAnalysis({spectra: fixtureSpectra(f, {denseBaseline: true}), extraInput: c.typed ? {molecularFormula: f.formula} : {}}, SHAPE_BUDGET);
  const tc = canonNoStereo(f.targetSmiles), ranked = r.rankedCandidates;
  const i = ranked.findIndex(x => canonNoStereo(x.smiles) === tc);
  return {sample: c.sample, typed: c.typed, targetRank: i < 0 ? null : i + 1, ranked: ranked.length,
    top: ranked.slice(0, top).map(x => ({smiles: x.smiles, score: x.finalScore ?? null, isTarget: canonNoStereo(x.smiles) === tc, prior: x.parsimonyPrior?.penalty ?? 0}))};
}
