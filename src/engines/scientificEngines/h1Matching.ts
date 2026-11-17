import {V12_CONFIG} from '../constraints/v12Config';
import {globalPeakAssignment} from './globalPeakAssignment';

/**
 * v1.4.0 stop 8 (useV140H1 and v140.matching): the matching layer of the 1H score. Pure functions, no shift rule and no knowledge-base value in here: they only decide how an observed signal is paired with a predicted
 * environment and which integral scale is used. Called from evidenceLedger.scoreCore only while v140MatchingActive().
 */
type Family = 'free' | 'S' | 'simple' | 'compound' | 'aromatic' | null;

/** "d, J = 8.4", "AA′BB′", "app t", " Dd " -> a bare label; the J part and the apostrophe style are not part of the label. */
export function normalizeMultiplicity(label: string): string {
  let s = String(label).trim().replace(/[′’‘`´]/g, "'");
  s = s.split(/[,(;]/)[0].trim().replace(/^(app\.?|apparent)\s+/i, '').replace(/\s+/g, ' ');
  return s;
}
export function multiplicityFamily(label: string): Family {
  const M = V12_CONFIG.v140MatchRules, n = normalizeMultiplicity(label), lower = n.toLowerCase();
  if (M.freeLabels.includes(lower)) return 'free';
  if (M.aromaticSystemFamily.some(a => a.toUpperCase() === n.toUpperCase())) return 'aromatic';
  if (M.singletFamily.includes(lower)) return 'S';
  if (M.simpleMultipletFamily.includes(lower)) return 'simple';
  if (M.compoundMultipletFamily.includes(lower)) return 'compound';
  return null;
}
/**
 * Is an observed multiplicity label compatible with a predicted one (no x0.5)? The flag-off rule was: any different string is penalised unless the observed label is m / unresolved / br s.
 * Kept here: an observed m / unresolved / multiplet / br s / br is never penalised (broad or unresolved signals). New: a predicted m is compatible with every multiplet and aromatic-system label (not with a singlet).
 */
export function multiplicityCompatible(observed: string, predicted: string): boolean {
  if (observed === predicted) return true;
  const o = multiplicityFamily(observed), p = multiplicityFamily(predicted);
  const no = normalizeMultiplicity(observed).toLowerCase();
  if (o === 'free' || no === 'br s' || no === 'br') return true;
  if (o === null || p === null) return false; // an unknown label keeps the exact-string rule
  if (p === 'free') return o !== 'S';
  if (o === 'S' || p === 'S') return o === 'S' && p === 'S';
  const M = V12_CONFIG.v140MatchRules;
  if (o === 'aromatic' || p === 'aromatic') {
    const other = o === 'aromatic' ? normalizeMultiplicity(predicted).toLowerCase() : no;
    const otherFamily = o === 'aromatic' ? p : o;
    return otherFamily === 'aromatic' || M.aromaticCompatible.includes(other);
  }
  if (o === 'simple' && p === 'simple') return no === normalizeMultiplicity(predicted).toLowerCase();
  return true; // at least one compound label: a simple label with a further coupling
}

export interface MatchPred {shiftPpm: number; integration?: number | null; isExchangeable?: boolean}
const SIGMA_LN = 0.4; // the same sigma as the flag-off integral factor
const gaussian = (d: number, s: number) => Math.exp(-0.5 * (d / Math.max(s, 1e-6)) ** 2);
const usable = (p: MatchPred) => !p.isExchangeable && (p.integration ?? 0) > 0;
const median = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];

/** H attributed to each predicted environment: its own, or - for an environment matched to a signal and the unmatched ones sitting inside the same signal (within overlapShiftPpm of it) - their sum. */
export function groupedPredictedH(hPred: MatchPred[], assignment: Map<number, number>, obsIntegral: (number | null | undefined)[], overlapPpm: number): number[] {
  const eff = hPred.map(p => p.integration ?? 0);
  const anchors = [...assignment].filter(([i, j]) => (obsIntegral[i] ?? 0) > 0 && usable(hPred[j])).map(([, j]) => j);
  const anchorSet = new Set(anchors), total = new Map<number, number>(anchors.map(j => [j, hPred[j].integration ?? 0])), member = new Map<number, number>();
  hPred.forEach((p, j) => {
    if (anchorSet.has(j) || !usable(p)) return;
    let best = -1, bestD = Infinity;
    for (const q of anchors) { const d = Math.abs(hPred[q].shiftPpm - p.shiftPpm); if (d <= overlapPpm && d < bestD) { best = q; bestD = d; } }
    if (best >= 0) { total.set(best, total.get(best)! + (p.integration ?? 0)); member.set(j, best); }
  });
  for (const [j, t] of total) eff[j] = t;
  for (const [j, q] of member) eff[j] = total.get(q)!;
  return eff;
}
/** Clusters of non-exchangeable environments chained by shifts within overlapPpm; every member of a multi-member cluster gets the cluster's total H. */
function clusterH(hPred: MatchPred[], overlapPpm: number): number[] {
  const idx = hPred.map((_, j) => j).filter(j => usable(hPred[j])).sort((a, b) => hPred[a].shiftPpm - hPred[b].shiftPpm);
  const eff = hPred.map(p => p.integration ?? 0);
  let group: number[] = [];
  const flush = () => { const t = group.reduce((s, j) => s + (hPred[j].integration ?? 0), 0); for (const j of group) eff[j] = t; group = []; };
  for (const j of idx) { if (group.length && hPred[j].shiftPpm - hPred[group[group.length - 1]].shiftPpm > overlapPpm) flush(); group.push(j); }
  flush();
  return eff;
}
function ratiosOf(assignment: Map<number, number>, obsIntegral: (number | null | undefined)[], hPred: MatchPred[], eff: number[]): number[] {
  return [...assignment].flatMap(([i, j]) => { const v = obsIntegral[i]; return v != null && v > 0 && usable(hPred[j]) && eff[j] > 0 ? [v / eff[j]] : []; });
}
const lnRange = (r: number[]) => r.length < 2 ? 0 : Math.log(Math.max(...r) / Math.min(...r));
function scaled(base: number[][], obsIntegral: (number | null | undefined)[], hPred: MatchPred[], scale: number, eff: number[]): number[][] {
  return base.map((row, i) => row.map((v, j) => { const x = obsIntegral[i]; return x != null && x > 0 && usable(hPred[j]) && eff[j] > 0 ? v * gaussian(Math.log(x / (scale * eff[j])), SIGMA_LN) : v; }));
}
const totalWeight = (m: number[][], a: Map<number, number>) => [...a].reduce((s, [i, j]) => s + (m[i]?.[j] ?? 0), 0);

export interface IntegralMatch {assignment: Map<number, number>; scale: number | null; matrix: number[][]; mode: 'none' | 'legacy' | 'grouped' | 'searched'; effH: number[]}
/**
 * Pairing and integral scale of the 1H score under v140.matching. base = shift x multiplicity x J compatibility (no integral factor yet).
 * 1. First pairing A0 on base. With fewer than two integral ratios there is no scale (as before).
 * 2. Scale from A0: either every matched environment against its own H (flag-off) or against the summed H of the environments inside the same observed signal (more consistent ratios win).
 * 3. If the matched ratios still disagree by more than scaleSearchLogSpread (two predictions too close in shift to be told apart: the pairing itself is probably swapped), candidate scales v_i / H_j are tried, each with the
 *    environments counted singly or per overlap cluster; the scale whose one-to-one pairing has the highest total compatibility wins, but only if it beats the flag-off scale.
 */
export function matchWithIntegrals(base: number[][], obsIntegral: (number | null | undefined)[], hPred: MatchPred[]): IntegralMatch {
  const M = V12_CONFIG.v140MatchRules, overlap = V12_CONFIG.scoring.overlapShiftPpm;
  const own = hPred.map(p => p.integration ?? 0);
  const a0 = globalPeakAssignment(base);
  const rOwn = ratiosOf(a0, obsIntegral, hPred, own);
  if (rOwn.length < 2) return {assignment: a0, scale: null, matrix: base.map(r => r.slice()), mode: 'none', effH: own};
  const grp = groupedPredictedH(hPred, a0, obsIntegral, overlap), rGrp = ratiosOf(a0, obsIntegral, hPred, grp);
  const useGrouped = rGrp.length >= 2 && grp.some((h, j) => h !== own[j]) && lnRange(rGrp) < lnRange(rOwn) - 1e-9;
  const eff0 = useGrouped ? grp : own, r0 = useGrouped ? rGrp : rOwn, s0 = median(r0);
  const finish = (scale: number, eff: number[], mode: IntegralMatch['mode']): IntegralMatch => { const matrix = scaled(base, obsIntegral, hPred, scale, eff); return {assignment: globalPeakAssignment(matrix), scale, matrix, mode, effH: eff}; };
  const first = finish(s0, eff0, useGrouped ? 'grouped' : 'legacy');
  if (lnRange(r0) <= M.scaleSearchLogSpread) return first;
  // search
  const cluster = clusterH(hPred, overlap), variants: number[][] = [own];
  if (cluster.some((h, j) => h !== own[j])) variants.push(cluster);
  let best = first, bestW = totalWeight(first.matrix, first.assignment);
  for (const eff of variants) {
    const cands: [number, number][] = [];
    base.forEach((row, i) => { const v = obsIntegral[i]; if (v == null || !(v > 0)) return; row.forEach((c, j) => { if (c >= M.scaleSearchMinShiftCompat && usable(hPred[j]) && eff[j] > 0) cands.push([v / eff[j], c]); }); });
    const seen = new Set<string>(), list = cands.sort((a, b) => b[1] - a[1]).filter(([s]) => { const k = s.toPrecision(3); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, M.maxScaleCandidates);
    for (const [s] of list) { const r = finish(s, eff, 'searched'), w = totalWeight(r.matrix, r.assignment); if (w > bestW + 1e-9) { best = r; bestW = w; } }
  }
  return best;
}
