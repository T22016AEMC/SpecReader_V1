import {WorkbenchOrchestrator} from '../../src/engines/workbenchOrchestrator';
import {scoreScientificEvidence} from '../../src/engines/scientificEngines/evidenceLedger';
import type {CandidateScoreLedger} from '../../src/engines/scientificEngines/evidenceLedger';
import {fixtureSpectra} from './v121Golden';
import type {V121Fixture} from './v121Golden';
import {V12_CONFIG} from '../../src/engines/constraints/v12Config';
import {openV132Gates} from './v132Gates';

// v1.4.1: IR probes for the candidate score. A probe is a hand-written textbook-position peak list (cm-1, transmittance %) scored against one structure; nothing here comes from a measured spectrum.
export interface IrPeak {x: number; y: number}
const fx = (smiles: string, peaks: IrPeak[]): V121Fixture => ({
  id: 'v141-probe', description: 'synthetic IR probe', targetSmiles: smiles, formula: 'C1', h1: {solvent: 'CDCl3', frequencyMHz: 400, peaks: [{x: 1.2, integration: 3, multiplicity: 's'}]},
  ir: {yAxis: 'transmittance percent', coverageCm1: [4000, 450], calibrated: true, peaks},
});
export const irLedger = (smiles: string, peaks: IrPeak[]): CandidateScoreLedger => {
  const bundle = WorkbenchOrchestrator.prepareModeAEvidence(fixtureSpectra(fx(smiles, peaks), {denseBaseline: true}), {}).bundle;
  return scoreScientificEvidence(smiles, bundle);
};
/** IR score (one decimal) and the ids of the IR deduction items. */
export const irProbe = (smiles: string, peaks: IrPeak[]) => {
  const l = irLedger(smiles, peaks);
  return {ir: Number((l.modalityScores.IR as number).toFixed(1)), missing: l.entries.filter(e => e.evidenceId.startsWith('IR:carbonyl-missing')).map(e => e.evidenceId), total: l.totalScore};
};
/** The probe of the design report: 2960 / C=O / 1170 / 1020. The y values (transmittance %) are chosen so that ethyl acetate with C=O at 1745 scores 39.3 (the design report's figure; the report's own y values were not kept). */
export const carbonylProbe = (smiles: string, co: number | number[]) => irProbe(smiles, [{x: 2960, y: 10}, ...(Array.isArray(co) ? co : [co]).map(x => ({x, y: 30})), {x: 1170, y: 40}, {x: 1020, y: 40}]);

/** Opens the gates the missing-carbonyl item needs (v1.3.0 chain), sets the v1.4.1 flags, returns the function that restores everything. */
export function setV141(parent: boolean, sub: Partial<typeof V12_CONFIG.v141IR> = {}): () => void {
  const restoreGates = openV132Gates();
  // v1.4.2 stop 25 (4): these probes and snapshots pin the v1.4.1 state, so useV142IR is switched off for their duration (the full-on setup of vitest.flagon140.config.ts has it on)
  const was = {p: V12_CONFIG.useV141IR, s: {...V12_CONFIG.v141IR}, p2: V12_CONFIG.useV142IR};
  V12_CONFIG.useV141IR = parent; V12_CONFIG.useV142IR = false; Object.assign(V12_CONFIG.v141IR, {alkylBend: true, esterCO: true, ringCarbonyl: true, sp2CH: true}, sub);
  return () => { V12_CONFIG.useV141IR = was.p; V12_CONFIG.useV142IR = was.p2; Object.assign(V12_CONFIG.v141IR, was.s); restoreGates(); };
}
