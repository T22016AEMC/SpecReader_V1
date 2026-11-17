import {executeSixStepAnalysis} from '../../src/engines/reasoning/sixStepAnalysis';
import {WorkbenchOrchestrator} from '../../src/engines/workbenchOrchestrator';
import {createReasoningPlan} from '../../src/engines/reasoning/hypothesisGenerator';
import {inferComposition} from '../../src/engines/composition/inferComposition';
import {planFormulaSearch} from '../../src/engines/composition/searchPlanning';
import {sourceSpectra} from '../../src/engines/scientificEngines/evidenceLedger';
import {irRangeCovered} from '../../src/engines/scientificEngines/irSignalProcessing';
import {V12_CONFIG} from '../../src/engines/constraints/v12Config';
import {canonNoStereo, fixtureSpectra, SHAPE_BUDGET} from './v121Golden';
import {loadV123} from './v123Samples';
import {spectrum} from '../fixtures';

// v1.4.3: synthetic bisphenol-A-type samples (notes/v1.4.3/BPA_BISECT.md). Numbers only: no spectrum file, screenshot or JSON of the user. No molecular formula is typed in; 1H and IR only.
export const BPA_SMILES = 'CC(C)(c1ccc(O)cc1)c1ccc(O)cc1';
export const BPA_FORMULA = 'C15H16O2';
/** The 22 IR peaks of BPA_BISECT (x, y %T, broad). IR coverage is NOT declared (the table is not confirmed complete), as in the bisect. */
const IR: [number, number, boolean?][] = [[3369, 45, true], [3076, 85], [3045, 85], [2934, 80], [2980, 78], [1612, 70], [1599, 72], [1510, 40], [1431, 70], [1449, 72], [1386, 75], [1365, 75], [1294, 65], [1236, 35], [1218, 55], [1173, 55], [1081, 70], [1010, 72], [832, 30], [756, 75], [568, 70], [550, 70]];

export interface BpaSample {id: string; solvent: 'DMSO-d6' | 'CDCl3'; oh: null | 'sharp' | 'broad'}
export const BPA_SAMPLES: BpaSample[] = [
  {id: 'BPA-A', solvent: 'DMSO-d6', oh: 'sharp'},
  {id: 'BPA-B', solvent: 'DMSO-d6', oh: 'broad'},
  {id: 'BPA-C', solvent: 'DMSO-d6', oh: null},
  {id: 'BPA-D', solvent: 'CDCl3', oh: 'sharp'},
];

export function bpaSpectra(s: BpaSample): any {
  const rows: {x: number; integration: number; multiplicity: string; broad?: boolean}[] = [
    ...(s.oh ? [{x: 9.19, integration: 1, multiplicity: s.oh === 'broad' ? 'br s' : 's', broad: s.oh === 'broad'}] : []),
    {x: 6.99, integration: 2, multiplicity: 'd'}, {x: 6.66, integration: 2, multiplicity: 'd'}, {x: 1.55, integration: 3, multiplicity: 's'},
  ];
  const h1 = {...spectrum('1H_NMR', rows.map((p, i) => ({id: `1H_NMR-${i}`, manualPeak: true, y: 50, x: p.x, integration: p.integration, multiplicity: p.multiplicity, ...(p.broad ? {isBroad: true, shape: 'broad'} : {})})) as any), solvent: s.solvent, nmrSolvent: s.solvent} as any;
  const irPeaks = IR.map(p => ({x: p[0], y: p[1], ...(p[2] ? {isBroad: true, shape: 'broad'} : {})}));
  const ir = {...spectrum('IR', irPeaks.map((p, i) => ({id: `IR-${i}`, manualPeak: true, ...p})) as any, '%Transmittance'), irYAxisSemantics: 'TRANSMITTANCE_PERCENT'} as any;
  const near = (x: number) => irPeaks.some(p => Math.abs(p.x - x) < 12), shoulder = (x: number) => irPeaks.some((p: any) => p.isBroad && Math.abs(p.x - x) <= 250);
  const base: {x: number; y: number}[] = [];
  for (let x = 400; x <= 4000; x += 25) if (!near(x) && !shoulder(x)) base.push({x, y: 99});
  for (const p of irPeaks as any[]) if (p.isBroad) for (let d = -250; d <= 250; d += 25) { const x = p.x + d; if (d === 0 || x < 400 || x > 4000 || near(x)) continue; base.push({x, y: 99 - (99 - p.y) / (1 + (d / 120) ** 2)}); }
  ir.points = [...base, ...irPeaks.map(p => ({x: p.x, y: p.y}))].sort((a, b) => b.x - a.x);
  return {'1H_NMR': h1, IR: ir};
}

/** Existing samples: p-cresol without / with the OH peak (P1, P2) and the two PMA samples (M1, M1b); declared solvent, same builder as the v1.2.3 shapes. */
export const EXISTING_SAMPLES = ['P1', 'P2', 'M1', 'M1b'] as const;
export const existingSpectra = (id: string): any => fixtureSpectra(loadV123(id), {denseBaseline: true});
export const existingTarget = (id: string) => { const f = loadV123(id); return {formula: f.formula, smiles: f.targetSmiles}; };

/** Layer 1: the formula table only (composition inference + planFormulaSearch, no structure search). */
export function layer1(spectra: any, formula: string) {
  const prepared = WorkbenchOrchestrator.prepareModeAEvidence(spectra, {});
  const plan = createReasoningPlan(prepared.bundle);
  const composition = inferComposition({bundle: prepared.bundle, observations: plan.observations, userFormula: plan.userFormula, nitrogen: plan.nitrogenEvidence});
  const ir = sourceSpectra(prepared.bundle).IR;
  const evidence = {observations: plan.observations, irCoversAldehydeRegion: Boolean(ir) && irRangeCovered(ir!, V12_CONFIG.aldehydeIr.rangeCm1[0], V12_CONFIG.aldehydeIr.rangeCm1[1]), nitrogenAllowed: plan.nitrogenEvidence?.mode === 'EVIDENCE'};
  const hyps = composition.hypotheses ?? [];
  const result = planFormulaSearch(hyps, composition.v121?.oxygenFloor ?? null, evidence);
  const target = hyps.find(h => h.formula === formula) ?? null;
  const ns = target ? result.notSearched.get(target.id) : undefined;
  return {inTable: Boolean(target), searched: Boolean(target) && result.chosen.some(p => p.hypothesis.formula === formula), reason: ns?.reason ?? null, order: result.chosen.findIndex(p => p.hypothesis.formula === formula) + 1 || null,
    hiddenExchangeable: result.hiddenExchangeable, chosen: result.chosen.map(p => `${p.hypothesis.formula}(k${p.hypothesis.symmetryMultiple ?? '-'})`), feasibilityChecked: result.feasibilityChecked, feasibilityMs: Math.round(result.feasibilityMs)};
}

/** Layer 2: one full analysis with the step budget only (deterministic). rank = 1 + the number of candidates with a score at least as high that are not the target (a tie counts against the target). */
export async function layer2(spectra: any, smiles: string, formula: string) {
  const r: any = await executeSixStepAnalysis({spectra, extraInput: {}}, SHAPE_BUDGET);
  const tc = canonNoStereo(smiles), ranked: any[] = r.rankedCandidates;
  const i = ranked.findIndex(x => canonNoStereo(x.smiles) === tc);
  const score = (x: any): number | null => x.finalScore ?? x.score ?? null;
  const rank = i < 0 ? null : (() => { const s = score(ranked[i]); return s === null ? i + 1 : 1 + ranked.filter((x, j) => j !== i && score(x) !== null && score(x)! >= s).length; })();
  const hyp = (r.compositionInference?.hypotheses ?? []).find((h: any) => h.formula === formula);
  return {found: i >= 0, rank, rankPlain: i < 0 ? null : i + 1, of: ranked.length, targetFormulaSearched: Boolean(hyp?.searched), top3: ranked.slice(0, 3).map(x => [x.smiles, score(x)])};
}
