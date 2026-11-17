import type {ParsedSmilesGraph} from '../chemistryEngine';
import type {ProtonEnvironment, SpectralPeak} from '../../types/spectrum';
import {V12_CONFIG} from '../constraints/v12Config';
import {coarseClass, envCategoryOfGraph} from './h1EnvClass';

/**
 * v1.4.0 stop 12 (flag useV140H1 and v140.solvent, DEFAULT OFF): solvent shift by environment class instead of one global number per solvent.
 *
 * SOURCE: Fulmer 2010 SI Table S1 (tier 1): for every (compound, signal) with a value in CDCl3 and in the solvent, shift(solvent) - shift(CDCl3), grouped by the class of the environment (h1EnvClass.coarseClass).
 * PROCEDURE (written before the numbers were looked at; tests/helpers/v140SolventStudy.ts, tests/v14/v140Solvent.test.ts): a (solvent, class) pair gets a correction only if (C2) the class has at least 3 compounds and a
 * standard deviation of at most 0.6 x the global standard deviation of the solvent, and (C3) on a held-out half of the compounds (seeded shuffle, seed 20261109; half A estimates, half B validates) the class correction is
 * not worse than the correction the predictor applied before (its own solvent difference), and (C3b) the solvent as a whole is not worse on half B (acetone-d6 and DMSO-d6 were, by 0.001 and 0.002 ppm, and keep the previous behaviour). The deployed value of an adopted pair is the mean over ALL compounds (A and B). The residual class 'other' (S, halogen, Si, nitro ...)
 * and 'CHCl3-type' (2 compounds) never get a correction; the pairs that failed C2 or C3 keep the previous behaviour.
 * The corrected shift is shift(CDCl3 prediction of the same environment, same flags) + class correction. Before this flag the environments of the additive rules (alkene / oxygen groups) carried NO solvent term at all.
 * EXCHANGEABLE protons (OH, NH, SH, COOH): the centre is NOT touched; the tolerance is widened in quadrature by the spread (standard deviation) of the shift difference of that solvent (only solvents with >= 3 compounds).
 */
export const SOLVENT_CITATION_ID = 'FULMER_2010_ORGANOMET';
const A = (g: ParsedSmilesGraph, i: number) => g.atoms[i];

/** The classes of the solvent study that can carry a correction. */
export const SOLVENT_CLASSES = ['alkyl CH', 'O-CH', 'N-CH', 'aromatic CH', 'vinyl CH', 'next to carbonyl'] as const;

/**
 * result = the prediction in the solvent (what the predictor gives without this flag); reference = the prediction of the same structure in CDCl3 under the same flags.
 * The environments are listed by shift, so their order differs between solvents: they are matched by their atoms (the k-th of the environments of one atom set in ascending shift order, for the split =CH2 hydrogens).
 */
export function applySolventClasses<T extends {peaks: SpectralPeak[]; environments: ProtonEnvironment[]}>(result: T, reference: T, graph: ParsedSmilesGraph, solvent: string): T {
  const cfg = V12_CONFIG.v140Solvent, table = cfg.table[solvent] as Record<string, number> | undefined, sd = cfg.exchangeableSdPpm[solvent];
  if ((!table && sd === undefined) || reference.environments.length !== result.environments.length) return result;
  let changed = false;
  const key = (e: ProtonEnvironment) => (e.atomIndices ?? []).join(',');
  const rank = (list: ProtonEnvironment[]) => { const m = new Map<ProtonEnvironment, number>(), count = new Map<string, number>(); [...list].sort((a, b) => a.shiftPpm - b.shiftPpm).forEach(e => { const n = count.get(key(e)) ?? 0; count.set(key(e), n + 1); m.set(e, n); }); return m; };
  const refRank = rank(reference.environments), ownRank = rank(result.environments);
  const refOf = (e: ProtonEnvironment) => reference.environments.find(r => key(r) === key(e) && refRank.get(r) === ownRank.get(e));
  const envs = result.environments.map(env => {
    const ref = refOf(env), idx = env.atomIndices?.[0];
    if (idx === undefined || !ref) return env;
    if (env.isExchangeable) {
      if (sd === undefined) return env;
      changed = true;
      const unc = Number(Math.sqrt((env.uncertaintyPpm ?? 0.45) ** 2 + sd ** 2).toFixed(3));
      return {...env, uncertaintyPpm: unc, expectedShiftRange: [Number((env.shiftPpm - 2 * unc).toFixed(2)), Number((env.shiftPpm + 2 * unc).toFixed(2))] as [number, number]} as ProtonEnvironment;
    }
    const cls = coarseClass(envCategoryOfGraph(graph, idx)), delta = table?.[cls];
    if (delta === undefined || A(graph, idx).element !== 'C') return env;
    changed = true;
    const s = Number((ref.shiftPpm + delta).toFixed(3)), unc = env.uncertaintyPpm;
    return {...env, shiftPpm: s, chemicalShift: s, predictedDeltaPpm: s,
      expectedShiftRange: [Number((s - 2 * (unc ?? 0.3)).toFixed(2)), Number((s + 2 * (unc ?? 0.3)).toFixed(2))] as [number, number],
      appliedCorrections: [...(ref.appliedCorrections ?? []).filter(c => !/^Solvent/.test(c.termName)), {termName: `Solvent shift of the class '${cls}' (${solvent})`, deltaPpm: delta, reasonZh: `v1.4.0 依環境類別的溶劑位移（${cls}，${solvent}）`, applicableCondition: `Fulmer 2010 SI Table S1, ${cls}`, dataNature: 'EMPIRICAL_INCREMENT_MODEL' as const, citationId: SOLVENT_CITATION_ID}]} as ProtonEnvironment;
  });
  if (!changed) return result;
  const peaks = result.peaks.map((p, i) => {
    const e = envs[i]; if (!p || !e || e === result.environments[i]) return p;
    return {...p, x: e.shiftPpm, predictedRange: e.expectedShiftRange} as SpectralPeak;
  });
  return {...result, environments: envs, peaks};
}
