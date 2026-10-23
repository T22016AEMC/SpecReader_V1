import {beforeAll,describe,expect,it} from 'vitest';
import {spectrum} from './fixtures';
import {initializeRDKit} from '../src/engines/scientificEngines/rdkitAdapter';
import {refreshIRSnapshot} from '../src/engines/scientificEngines/irSignalProcessing';
import {executeSixStepAnalysis} from '../src/engines/reasoning/sixStepAnalysis';
import {WorkbenchOrchestrator} from '../src/engines/workbenchOrchestrator';
import {CandidateGenerator} from '../src/engines/candidateGenerator';
import {StructureParserAdapter} from '../src/engines/chemistryEngine';
import type {AnalysisInput} from '../src/engines/analysisSession';
import type {ExperimentalSpectrumData,SpectralPeak} from '../src/types/spectrum';

// Acceptance A, B, E, F (v1.1.7-hotfix.1) through the complete analysis flow. `runLikeWorker` performs exactly what
// src/workers/modeA.worker.ts does (RDKit init, IR snapshot refresh, executeSixStepAnalysis); a Web Worker is not
// available in Node. All spectra are SYNTHETIC peak tables written for these tests.
beforeAll(()=>initializeRDKit());
type Mod=ExperimentalSpectrumData['modality'];
const mk=(mod:Mod,peaks:Partial<SpectralPeak>[]):ExperimentalSpectrumData=>spectrum(mod,peaks.map((p,i)=>({id:`${mod}-${i}`,manualPeak:true,y:50,...p})) as SpectralPeak[]);
async function runLikeWorker(input:AnalysisInput){
 await initializeRDKit();
 const spectra={...input.spectra};
 if(spectra.IR?.irManualSettings)spectra.IR=refreshIRSnapshot(spectra.IR);
 return executeSixStepAnalysis({...input,spectra},{timeMs:8000,maxStates:16000});
}
const hasN=(formula:string)=>/N(?![a-z])/.test(formula);
const smilesHasN=(s:string)=>/N|n/.test(s.replace(/Cl|Br|Na/g,''));
function linkages(smiles:string){
 const g=StructureParserAdapter.parseSmilesGraph(smiles).graph;if(!g)return {peroxide:false,nDiOH:false,nOn:false};
 const at=g.atoms,el=(i:number)=>at[i].element,oh=(i:number)=>el(i)==='O'&&at[i].totalHydrogens>=1&&at[i].neighbors.length===1;
 return {
  peroxide:at.some((a,i)=>el(i)==='O'&&a.neighbors.some(n=>el(n.toAtom)==='O')),
  nDiOH:at.some((a,i)=>el(i)==='N'&&a.neighbors.filter(n=>oh(n.toAtom)).length>=2),
  nOn:at.some((a,i)=>el(i)==='O'&&a.neighbors.filter(n=>el(n.toAtom)==='N').length>=2),
 };
}
// Acceptance A: 1H + IR only, alkyl-aromatic phenol-type bands, no N-specific feature.
const acceptanceA=():AnalysisInput=>({extraInput:{},spectra:{
 '1H_NMR':mk('1H_NMR',[{x:7.25,integration:2,multiplicity:'d',jValues:[8.6]},{x:6.78,integration:2,multiplicity:'d',jValues:[8.6]},{x:4.75,integration:1,multiplicity:'br s',isBroad:true,shape:'broad'},{x:1.29,integration:9,multiplicity:'s'}]),
 IR:mk('IR',[{x:3300,y:70,isBroad:true,shape:'broad'},{x:3050,y:20},{x:2960,y:60},{x:2870,y:40},{x:1600,y:40},{x:1510,y:60},{x:1385,y:30},{x:1365,y:35},{x:1240,y:80},{x:830,y:50}]),
}});

describe('A. no N evidence: nothing with N anywhere in the complete flow',()=>{
 it('final candidates, formulas, element clues, search alphabet and fallback carry no N',async()=>{
  const r=await runLikeWorker(acceptanceA());
  const trace=r.reasoningTrace!;
  expect(trace.nitrogenEvidence?.mode).toBe('NONE');
  expect(r.rankedCandidates.length).toBeGreaterThan(0);
  expect(r.rankedCandidates.some(c=>hasN(c.molecularFormula))).toBe(false);
  expect((r.solvedConstraintSpace.searchResult?.smiles??[]).some(smilesHasN)).toBe(false);
  expect(r.compositionInference!.hypotheses.some(h=>hasN(h.formula))).toBe(false);
  expect(r.compositionInference!.elementClues.some(c=>c.element==='N')).toBe(false);
  expect(r.compositionInference!.elementsExcluded.map(e=>e.element)).toContain('N');
  expect(trace.localStructures.some(l=>l.atoms.some(a=>a.element==='N'))).toBe(false);
  // Synchronous fallback on the same evidence.
  const {bundle,spectrumEvidenceList}=WorkbenchOrchestrator.prepareModeAEvidence(acceptanceA().spectra,{});
  const fb=CandidateGenerator.executeUnifiedPipelineFromBundle(bundle,spectrumEvidenceList);
  expect(fb.rankedCandidates.some(c=>hasN(c.molecularFormula))).toBe(false);
  expect((fb.solvedConstraintSpace.searchResult?.smiles??[]).some(smilesHasN)).toBe(false);
 },120000);
});
describe('E. implausible linkages never reach the final candidates without evidence',()=>{
 it('no O–O, N(OH)2 or N–O–N among final candidates; rejections are recorded',async()=>{
  const r=await runLikeWorker(acceptanceA());
  for(const c of r.rankedCandidates){const l=linkages(c.smiles);expect(l.peroxide||l.nDiOH||l.nOn).toBe(false);}
  const reasons=r.rejectedCandidates.flatMap(x=>x.violatedConstraints).filter(v=>v.startsWith('PLAUSIBILITY('));
  // Whatever the search proposed and the gate removed is listed with its rule, not silently dropped.
  for(const v of reasons)expect(v).toMatch(/^PLAUSIBILITY\((PEROXIDE|N_O_N|N_DI_OH|N_O_LINK|CUMULATED_N|GEM_DIOL|ENOL|KETENE|AMINAL)\): /);
  // On this input the search does propose peroxides and gem-diols, so the gate is exercised (deterministic input).
  expect(reasons.length).toBeGreaterThan(0);
  expect(r.solvedConstraintSpace.solverLog.some(s=>s.startsWith('化學合理性檢查剔除候選'))).toBe(true);
 },120000);
 it('with a user formula the peroxide exception applies (no PEROXIDE rejection)',async()=>{
  const r=await runLikeWorker({extraInput:{molecularFormula:'C2H6O2'},spectra:{'1H_NMR':mk('1H_NMR',[{x:3.7,integration:4,multiplicity:'s'},{x:2.5,integration:2,multiplicity:'br s',isBroad:true}])}});
  expect(r.rejectedCandidates.some(x=>x.violatedConstraints.some(v=>v.startsWith('PLAUSIBILITY(PEROXIDE)')))).toBe(false);
  expect(r.rankedCandidates.every(c=>c.molecularFormula==='C2H6O2')).toBe(true);
 },120000);
});
describe('B. real N evidence keeps N available in the complete flow',()=>{
 it('IR C≡N 2229 cm⁻¹: N formulas are hypothesised and searched',async()=>{
  const r=await runLikeWorker({extraInput:{},spectra:{
   '1H_NMR':mk('1H_NMR',[{x:7.62,integration:2,multiplicity:'d',jValues:[8]},{x:7.46,integration:1,multiplicity:'t',jValues:[8]},{x:7.4,integration:2,multiplicity:'t',jValues:[8]}]),
   IR:mk('IR',[{x:3065,y:20},{x:2229,y:60},{x:1598,y:30},{x:760,y:50}]),
  }});
  expect(r.reasoningTrace!.nitrogenEvidence?.mode).toBe('EVIDENCE');
  expect(r.compositionInference!.hypotheses.some(h=>hasN(h.formula))).toBe(true);
  expect(r.reasoningTrace!.compositionSearch!.runs.some(run=>run.formula&&hasN(run.formula))).toBe(true);
 },120000);
 it('IR 3400/3330 sharp doublet is N evidence',async()=>{
  const r=await runLikeWorker({extraInput:{},spectra:{
   '1H_NMR':mk('1H_NMR',[{x:7.1,integration:2,multiplicity:'t',jValues:[7.8]},{x:6.75,integration:1,multiplicity:'t',jValues:[7.8]},{x:6.65,integration:2,multiplicity:'d',jValues:[7.8]},{x:3.6,integration:2,multiplicity:'br s',isBroad:true}]),
   IR:mk('IR',[{x:3430,y:45},{x:3355,y:50},{x:3040,y:20},{x:1620,y:70},{x:1500,y:60},{x:750,y:60}]),
  }});
  expect(r.reasoningTrace!.nitrogenEvidence?.mode).toBe('EVIDENCE');
  expect(r.compositionInference!.hypotheses.some(h=>hasN(h.formula))).toBe(true);
 },120000);
});
describe('F. a user formula with N still yields N candidates',()=>{
 it('C8H11N on N-free spectra',async()=>{
  const input=acceptanceA();input.extraInput={molecularFormula:'C8H11N'};
  const r=await runLikeWorker(input);
  expect(r.rankedCandidates.length).toBeGreaterThan(0);
  expect(r.rankedCandidates.every(c=>c.molecularFormula==='C8H11N')).toBe(true);
 },120000);
});
