import {V12_CONFIG} from '../../src/engines/constraints/v12Config';
import {irLedger} from './v141Probe';
import type {IrPeak} from './v141Probe';

// v1.4.2: flag helper and probe tables for the IR round-2 tests. A probe is a hand-written peak list (cm-1, transmittance %) scored against one structure; nothing here comes from a measured spectrum.
// The positions are taken from the MIDDLE of the textbook-style window of each rule, so a probe table is circular: it tests the wiring and the discrimination, not whether a range is right.
export type V142Sub = Partial<typeof V12_CONFIG.v142IR>;
/** Sets useV142IR and the sub-flags (alkeneOOP true, negativeEvidence false and, since stop 30, negNitrile / negNitro / negAlkyne false unless named: the defaults), returns the function that puts everything back. */
export function setV142(parent: boolean, sub: V142Sub = {}): () => void {
  const was = {p: V12_CONFIG.useV142IR, s: {...V12_CONFIG.v142IR}};
  V12_CONFIG.useV142IR = parent; Object.assign(V12_CONFIG.v142IR, {alkeneOOP: true, negativeEvidence: false, negNitrile: false, negNitro: false, negAlkyne: false}, sub);
  return () => { V12_CONFIG.useV142IR = was.p; Object.assign(V12_CONFIG.v142IR, was.s); };
}
/** The C–H base table (stretches, CH2 / CH3 bends). Transmittance %, small = strong. */
export const CH_BASE: IrPeak[] = [{x: 2960, y: 10}, {x: 2925, y: 10}, {x: 2855, y: 15}, {x: 1465, y: 30}, {x: 1378, y: 40}];
export const withPeaks = (...extra: IrPeak[]): IrPeak[] => [...CH_BASE, ...extra];
/** IR score (one decimal) and total of a probe. */
export const ir2Probe = (smiles: string, peaks: IrPeak[]) => { const l = irLedger(smiles, peaks); return {ir: Number((l.modalityScores.IR as number).toFixed(1)), total: l.totalScore, ids: l.entries.map(e => e.evidenceId)}; };

// ---- negative-evidence probes (ir2.negativeEvidence): tables whose data gate can be switched off one condition at a time
import {WorkbenchOrchestrator} from '../../src/engines/workbenchOrchestrator';
import {scoreScientificEvidence} from '../../src/engines/scientificEngines/evidenceLedger';
import type {CandidateScoreLedger} from '../../src/engines/scientificEngines/evidenceLedger';
import {fixtureSpectra} from './v121Golden';
import type {V121Fixture} from './v121Golden';
import {openV132Gates} from './v132Gates';
export interface NegTable {
  /** peaks as (x, y transmittance %); the gate needs 6 or more marked peaks, so the default table has 7 */
  peaks?: IrPeak[];
  /** observationCoverage of the IR (default CONFIRMED_COMPLETE, what fixtureSpectra writes) */
  coverage?: string;
  /** the indices of the peaks that are NOT marked by the user (manualPeak false): the curve detects them again as AUTO peaks */
  autoPeakIndices?: number[];
}
/** C-H base table plus a C-O peak: 6 marked peaks, both sides of the carbonyl region covered (the data gate's other conditions are met). */
export const BASE6: IrPeak[] = [...CH_BASE, {x: 1050, y: 45}];
const ledgerOf = (smiles: string, t: NegTable): CandidateScoreLedger => {
  const f: V121Fixture = {id: 'v142-probe', description: 'synthetic IR probe', targetSmiles: smiles, formula: 'C1', h1: {solvent: 'CDCl3', frequencyMHz: 400, peaks: [{x: 1.2, integration: 3, multiplicity: 's'}]}, ir: {yAxis: 'transmittance percent', coverageCm1: [4000, 450], calibrated: true, peaks: t.peaks ?? BASE6}};
  const spectra = fixtureSpectra(f, {denseBaseline: true}) as unknown as {IR: {peaks: Record<string, unknown>[]; observationCoverage: string}};
  if (t.coverage) spectra.IR.observationCoverage = t.coverage;
  for (const i of t.autoPeakIndices ?? []) Object.assign(spectra.IR.peaks[i], {manualPeak: false, detectionSource: 'AUTO'});
  return scoreScientificEvidence(smiles, WorkbenchOrchestrator.prepareModeAEvidence(spectra as never, {}).bundle);
};
/** The negative-evidence view of one probe: the ids of the new items, their weights, the IR score and total. The v1.3.0 gate chain is opened for the call (the missing-carbonyl item needs it; the new item does not). */
export function negProbe(smiles: string, t: NegTable = {}) {
  const restore = openV132Gates();
  try {
    const l = ledgerOf(smiles, t), neg = l.entries.filter(e => e.evidenceId.startsWith('IR:neg:'));
    const otherIr = l.entries.filter(e => e.sourceModality === 'IR' && !/^IR:(coverage|carbonyl-missing|neg)/.test(e.evidenceId)).reduce((s, e) => s + e.weight, 0);
    return {ledger: l, ids: neg.map(e => e.evidenceId), share: neg.map(e => e.weight / otherIr), otherIr, ir: Number((l.modalityScores.IR as number).toFixed(1)), total: l.totalScore};
  } finally { restore(); }
}
