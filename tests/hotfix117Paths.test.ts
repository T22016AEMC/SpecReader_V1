import {beforeAll,describe,expect,it} from 'vitest';
import {spectrum} from './fixtures';
import {initializeRDKit} from '../src/engines/scientificEngines/rdkitAdapter';
import {WorkbenchOrchestrator} from '../src/engines/workbenchOrchestrator';
import {CandidateGenerator} from '../src/engines/candidateGenerator';
import type {ExperimentalSpectrumData,SpectralPeak} from '../src/types/spectrum';

// Work 1 (v1.1.7-hotfix.1): the N gate covers every generation path, including the synchronous fallback of
// DeterministicStructureGenerator. All spectra are SYNTHETIC peak tables written for logic tests.
beforeAll(()=>initializeRDKit());
type Mod=ExperimentalSpectrumData['modality'];
const mk=(mod:Mod,peaks:Partial<SpectralPeak>[],extra:Partial<ExperimentalSpectrumData>={}):ExperimentalSpectrumData=>({...spectrum(mod,peaks.map((p,i)=>({id:`${mod}-${i}`,manualPeak:true,y:60,...p})) as SpectralPeak[]),...extra});
const hasN=(f:string)=>/N(?![a-z])/.test(f);
const fallback=(spectra:Partial<Record<Mod,ExperimentalSpectrumData>>,extraInput:Record<string,unknown>={})=>{
 const {bundle,spectrumEvidenceList}=WorkbenchOrchestrator.prepareModeAEvidence(spectra,extraInput);
 return CandidateGenerator.executeUnifiedPipelineFromBundle(bundle,spectrumEvidenceList);   // no searchResult → synchronous fallback
};
// The legacy IR engine lists "Amine" as a candidate group for a broad 3350 band, which opened N for the fallback
// search before this fix. There is no N-specific evidence here.
const noNitrogen=()=>({
 '1H_NMR':mk('1H_NMR',[{x:7.2,integration:5,multiplicity:'m'},{x:3.6,integration:2,multiplicity:'t',jValues:[7]},{x:2.8,integration:2,multiplicity:'t',jValues:[7]},{x:1.8,integration:1,multiplicity:'br s',isBroad:true}]),
 '13C_NMR':mk('13C_NMR',[{x:138.6},{x:129.0},{x:128.5},{x:126.4},{x:63.6},{x:39.2}]),
 IR:mk('IR',[{x:3350,y:70,isBroad:true,shape:'broad'},{x:3030,y:20},{x:2930,y:40},{x:1050,y:60}]),
});

describe('work 1: N gate on every generation path',()=>{
 it('the synchronous fallback produces no N candidate without N evidence',()=>{
  // Control: forcing "evidence" on the same input does yield N graphs, so this test is sensitive to the gate.
  const {bundle,spectrumEvidenceList}=WorkbenchOrchestrator.prepareModeAEvidence(noNitrogen(),{});
  const forced=CandidateGenerator.executeUnifiedPipelineFromBundle(bundle,spectrumEvidenceList,{nitrogenEvidence:{mode:'EVIDENCE',allowed:true,reasons:[],note:''}});
  expect(forced.rankedCandidates.some(c=>hasN(c.molecularFormula))).toBe(true);
  const out=fallback(noNitrogen());
  expect(out.validatedGraphs.some(g=>hasN(g.candidate.molecularFormula))).toBe(false);
  expect(out.rankedCandidates.some(c=>hasN(c.molecularFormula))).toBe(false);
  expect(out.solvedConstraintSpace.searchResult).toBeDefined();
  expect(out.solvedConstraintSpace.searchResult!.smiles.some(s=>/N|n/.test(s.replace(/Cl|Br/g,'')))).toBe(false);
 });
 it('the fallback keeps N when there is N-specific evidence (IR C≡N)',()=>{
  const out=fallback({...noNitrogen(),IR:mk('IR',[{x:3350,y:70,isBroad:true,shape:'broad'},{x:2250,y:70},{x:3030,y:20}])});
  expect(out.rejectedCandidates.some(r=>r.violatedConstraints.some(v=>v.includes('無 N 專屬證據')))).toBe(false);
  expect(out.rankedCandidates.some(c=>hasN(c.molecularFormula))).toBe(true);
 });
 it('a user formula overrides the N gate on the fallback path',()=>{
  const out=fallback(noNitrogen(),{molecularFormula:'C8H11N'});
  expect(out.rankedCandidates.every(c=>c.molecularFormula==='C8H11N')).toBe(true);
  expect(out.rejectedCandidates.some(r=>r.violatedConstraints.some(v=>v.includes('無 N 專屬證據')))).toBe(false);
 });
});
