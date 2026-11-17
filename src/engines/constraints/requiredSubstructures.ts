import type {ObservedEvidence} from '../reasoning/types';
import {V12_CONFIG, type StrongEvidenceRuleDef} from './v12Config';
import {v132StrongCarbonylActive,v132WindowsActive} from '../composition/planningGate';

/** A substructure that strong evidence requires in every candidate (matches may overlap other atoms and substructures). */
export interface RequiredSubstructure {id: string; smarts: string; label: string; evidenceObservationIds: string[]; strength: 'STRONG'}

const inRange = (v: number, [lo, hi]: readonly [number, number]) => v >= lo && v <= hi;

/** IR observations whose band lies in `range` and is at least `minRelative` × the strongest IR band. Unknown intensities never qualify. */
export function strongIrBands(observations: ObservedEvidence[], range: [number, number], minRelative: number): ObservedEvidence[] {
  const ir = observations.filter(o => o.modality === 'IR' && !o.optional);
  const strongest = Math.max(0, ...ir.map(o => (o.relativeIntensity !== null && o.relativeIntensity > 0 ? o.relativeIntensity : 0)));
  if (strongest <= 0) return [];
  return ir.filter(o => inRange(o.value, range) && o.relativeIntensity !== null && o.relativeIntensity >= minRelative * strongest);
}

/**
 * v1.3.2: THE "strong C=O" judgement. Every place that asks whether a C=O band is strong calls this (oxygen floor, STRONG_CARBONYL required substructure, ester / aldehyde / conjugated-carbonyl gates; the
 * DBE demotion and the O window follow from the floor). A band in v132StrongCarbonyl.rangeCm1 (1700–1800 cm-1) is strong at v132StrongCarbonyl.relativeIntensity of the strongest IR band while v132StrongCarbonylActive();
 * a band elsewhere in `range`, or any band with the flag off, is judged at `minRelative` (the caller's old share, 0.5). C–O and other bands do not use this function. 工程判斷，未查證 (see v12Config).
 */
export function strongCarbonylBands(observations: ObservedEvidence[], range: [number, number], minRelative: number): ObservedEvidence[] {
  if (!v132StrongCarbonylActive()) return strongIrBands(observations, range, minRelative);
  const c0 = V12_CONFIG.v132StrongCarbonyl;
  const c = v132WindowsActive() ? {...c0, rangeCm1: [c0.rangeCm1[0], c0.upperEdgeWindowsCm1] as [number, number]} : c0;
  if (v132WindowsActive() && range[1] === 1800) range = [range[0], c0.upperEdgeWindowsCm1];
  const ir = observations.filter(o => o.modality === 'IR' && !o.optional);
  const strongest = Math.max(0, ...ir.map(o => (o.relativeIntensity !== null && o.relativeIntensity > 0 ? o.relativeIntensity : 0)));
  if (strongest <= 0) return [];
  return ir.filter(o => inRange(o.value, range) && o.relativeIntensity !== null && o.relativeIntensity >= (inRange(o.value, c.rangeCm1) ? Math.min(minRelative, c.relativeIntensity) : minRelative) * strongest);
}

function paraDoublets(observations: ObservedEvidence[]): string[] | null {
  const c = V12_CONFIG.paraDoublets;
  const h = observations.filter(o => o.modality === '1H_NMR' && !o.optional && inRange(o.value, c.aromaticRangePpm) && o.multiplicity !== null && c.multiplicities.includes(o.multiplicity) && o.jHz.some(j => inRange(j, c.jRangeHz)) && o.relativeIntegral !== null && o.relativeIntegral > 0);
  const ids = new Set<string>();
  for (let i = 0; i < h.length; i++) for (let j = i + 1; j < h.length; j++) {
    if (Math.abs(Math.log(h[i].relativeIntegral! / h[j].relativeIntegral!)) < c.equalIntegralLogTolerance) { ids.add(h[i].id); ids.add(h[j].id); }
  }
  return ids.size ? [...ids] : null;
}

function ethylQt(observations: ObservedEvidence[]): string[] | null {
  const c = V12_CONFIG.ethylQt;
  const h = observations.filter(o => o.modality === '1H_NMR' && !o.optional && o.relativeIntegral !== null && o.relativeIntegral > 0);
  const ids = new Set<string>();
  for (const q of h) for (const t of h) {
    if (q.multiplicity !== 'q' || t.multiplicity !== 't' || q.value >= c.qMaxPpm || t.value >= c.tMaxPpm) continue;
    if (Math.abs(q.relativeIntegral! / t.relativeIntegral! - 2 / 3) >= c.ratioTolerance) continue;
    if (!q.jHz.some(a => t.jHz.some(b => Math.abs(a - b) < c.sharedJToleranceHz))) continue;
    ids.add(q.id); ids.add(t.id);
  }
  return ids.size ? [...ids] : null;
}

function detect(rule: StrongEvidenceRuleDef, observations: ObservedEvidence[]): string[] | null {
  if (rule.modality === 'IR' && rule.irRangeCm1 && rule.irMinRelativeIntensity !== undefined) {
    const hits = (rule.carbonyl ? strongCarbonylBands : strongIrBands)(observations, rule.irRangeCm1, rule.irMinRelativeIntensity);
    return hits.length ? hits.map(o => o.id) : null;
  }
  if (rule.h1Kind === 'PARA_DOUBLETS') return paraDoublets(observations);
  if (rule.h1Kind === 'ETHYL_QT') return ethylQt(observations);
  return null;
}

/** The strong-evidence rules (config) that fire on these observations. Ordinary IR bands are used for scoring only and never required. */
export function requiredFromEvidence(observations: ObservedEvidence[], rules: StrongEvidenceRuleDef[] = V12_CONFIG.strongEvidenceRules): RequiredSubstructure[] {
  const out: RequiredSubstructure[] = [];
  for (const rule of rules) {
    const ids = detect(rule, observations);
    if (ids) out.push({id: rule.id, smarts: rule.smarts, label: rule.label, evidenceObservationIds: ids, strength: 'STRONG'});
  }
  return out;
}
