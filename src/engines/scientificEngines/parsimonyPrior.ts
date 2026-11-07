import {V12_CONFIG} from '../constraints/v12Config';
import type {ScoreLedgerEntry} from './evidenceLedger';

/**
 * v1.3.1 (A): parsimony prior. With the same integral ratio (and an IR that only shows the same functional groups) a dimer or trimer is hard to tell from the monomer: the integral ratio is scaled
 * to any hydrogen count, a broad O–H band is explained by every candidate that has an O–H, and the weak IR fingerprint bands add a point or two either way (measured: tests/fixtures/v130/CR1, p-cresol vs
 * tri(p-tolyl)carbinol, ledger totals 68.48 and 67.83, the gap coming from fingerprint bands). Without further evidence the smaller molecule is preferred.
 *
 * It is a SEPARATE item: the ledger and the modality scores are not touched; rankCandidates subtracts the penalty from the total only for the final score and the order, and records it on the candidate.
 * Numbers: V12_CONFIG.parsimonyV131 (ENGINEERING JUDGEMENT, NOT CALIBRATED; 工程判斷，待 1.4.0 檢討).
 *
 * "Multiple": the hydrogens per integral unit (the ledger's integral scale) of the candidate are an integer m >= 2 times those of the other candidate.
 * "Extra evidence" (no penalty): the multiple explains an observation (weight >= extraMinWeight, compatibility >= explainedMin) that the smaller candidate does not (compatibility < unexplainedMax or no entry).
 * That covers an extra inequivalent hydrogen environment (a 1H signal only the larger candidate has an environment for) and an extra functional-group band, with the same rule.
 */
export interface ParsimonyInput {key: string; total: number; hydrogensPerUnit: number | null; entries: ScoreLedgerEntry[]}
export interface ParsimonyOutcome {penalty: number; baseKey: string | null; multiple: number | null; exempt: boolean}

/** m when the ratio is an integer >= 2 within the tolerance, else null. */
export function multipleOf(larger: number, smaller: number, tolerance = 0.15): number | null {
  if (!(larger > 0) || !(smaller > 0)) return null;
  const ratio = larger / smaller, m = Math.round(ratio);
  return m >= 2 && Math.abs(ratio - m) <= tolerance * m ? m : null;
}

/** An observation-level entry (not a two-way 1H summary line): the key is the evidence id. */
const observationEntries = (entries: ScoreLedgerEntry[]) => entries.filter(e => !e.display && e.weight > 0 && (e.sourceModality === 'IR' || e.sourceModality === '1H_NMR' || e.sourceModality === '13C_NMR'));

/** True when `multiple` explains an observation that `base` does not. */
export function hasExtraEvidence(multiple: ScoreLedgerEntry[], base: ScoreLedgerEntry[]): boolean {
  const cfg = V12_CONFIG.parsimonyV131;
  const baseById = new Map(base.map(e => [e.evidenceId, e]));
  return observationEntries(multiple).some(e => {
    if (e.weight < cfg.extraMinWeight || (e.compatibility ?? 0) < cfg.explainedMin) return false;
    const other = baseById.get(e.evidenceId);
    return !other || other.weight <= 0 || (other.compatibility ?? 0) < cfg.unexplainedMax;
  });
}

export function parsimonyPenalties(items: ParsimonyInput[]): Map<string, ParsimonyOutcome> {
  const cfg = V12_CONFIG.parsimonyV131, out = new Map<string, ParsimonyOutcome>();
  for (const c of items) {
    let result: ParsimonyOutcome = {penalty: 0, baseKey: null, multiple: null, exempt: false};
    if (c.hydrogensPerUnit !== null) {
      for (const a of items) {
        if (a === c || a.hydrogensPerUnit === null) continue;
        const m = multipleOf(c.hydrogensPerUnit, a.hydrogensPerUnit);
        if (m === null || Math.abs(c.total - a.total) >= cfg.windowPoints) continue;
        if (hasExtraEvidence(c.entries, a.entries)) { if (result.baseKey === null) result = {penalty: 0, baseKey: a.key, multiple: m, exempt: true}; continue; }
        // the nearest-scoring smaller candidate is the one named; one non-exempt base is enough for the penalty
        if (result.penalty === 0 || Math.abs(c.total - a.total) < Math.abs(c.total - items.find(x => x.key === result.baseKey)!.total)) result = {penalty: cfg.penaltyPoints, baseKey: a.key, multiple: m, exempt: false};
      }
    }
    out.set(c.key, result);
  }
  return out;
}
