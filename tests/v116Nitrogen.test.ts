import {beforeAll,describe,expect,it} from 'vitest';
import {spectrum} from './fixtures';
import {initializeRDKit} from '../src/engines/scientificEngines/rdkitAdapter';
import {WorkbenchOrchestrator} from '../src/engines/workbenchOrchestrator';
import {createReasoningPlan} from '../src/engines/reasoning/hypothesisGenerator';
import {executeSixStepAnalysis,planningSearchHints} from '../src/engines/reasoning/sixStepAnalysis';
import {graphSearchHints,type DeNovoSearchResult} from '../src/engines/scientificEngines/deNovoGraphSearch';
import {inferSignalEnvironments} from '../src/engines/scientificEngines/atomicChemicalEnvironment';
import {inferComposition} from '../src/engines/composition/inferComposition';
import {generateForCompositions,replicateUnit,symmetricUnit,type StructureGenerator} from '../src/engines/composition/structureGenerator';
import type {CompositionHypothesis,CompositionInferenceResult} from '../src/engines/composition/types';
import type {ExperimentalSpectrumData,SpectralPeak} from '../src/types/spectrum';

// v1.1.6 acceptance A–D. Every peak table here is SYNTHETIC (written for logic tests); no measured spectra are used
// and nothing here claims identification accuracy.
beforeAll(()=>initializeRDKit());
type Mod=ExperimentalSpectrumData['modality'];
const mk=(mod:Mod,peaks:Partial<SpectralPeak>[],extra:Partial<ExperimentalSpectrumData>={}):ExperimentalSpectrumData=>({...spectrum(mod,peaks.map((p,i)=>({id:`${mod}-${i}`,manualPeak:true,y:80,...p})) as SpectralPeak[]),...extra});
const plan=(spectra:Partial<Record<Mod,ExperimentalSpectrumData>>,extraInput:Record<string,unknown>={})=>{
 const prepared=WorkbenchOrchestrator.prepareModeAEvidence(spectra,extraInput);
 const p=createReasoningPlan(prepared.bundle);
 const composition=inferComposition({bundle:prepared.bundle,observations:p.observations,userFormula:p.userFormula,nitrogen:p.nitrogenEvidence});
 return {prepared,plan:p,composition};
};
const hasN=(formula:string)=>/N(?![a-z])/.test(formula);
// A: aromatic 1H, exchangeable broad 1H, an O/N-ambiguous 3.7 ppm CH2, IR broad 3350 — and nothing N-specific.
const noNitrogen=()=>({
 '1H_NMR':mk('1H_NMR',[{x:7.32,integration:5,multiplicity:'m'},{x:3.71,integration:2,multiplicity:'t',jValues:[6.8]},{x:2.84,integration:2,multiplicity:'t',jValues:[6.8]},{x:1.9,integration:1,multiplicity:'br s',isBroad:true,shape:'broad'}]),
 IR:mk('IR',[{x:3350,y:70,isBroad:true,shape:'broad'},{x:3030,y:30},{x:2930,y:45},{x:1600,y:35},{x:1045,y:60}]),
});

describe('A. without N-specific evidence N never enters',()=>{
 it('keeps N out of hypotheses, fragments, element clues, formulas and the search alphabet',()=>{
  const {plan:p,composition,prepared}=plan(noNitrogen());
  expect(p.nitrogenEvidence?.mode).toBe('NONE');
  expect(p.hypotheses.some(h=>['AMINO','NITROGENATED','NITRILE'].includes(h.kind))).toBe(false);
  expect(p.hypotheses.some(h=>h.constraints.elementPossibilities.includes('N'))).toBe(false);
  expect(p.localStructures.some(l=>l.atoms.some(a=>a.element==='N'))).toBe(false);
  expect(p.hypotheses.some(h=>h.description.includes('也可能是 N')||h.support.some(s=>s.includes('也可能是 N')))).toBe(true);
  expect(composition.status).toBe('INFERRED');
  expect(composition.hypotheses.length).toBeGreaterThan(0);
  expect(composition.hypotheses.some(h=>hasN(h.formula))).toBe(false);
  expect(composition.elementClues.some(c=>c.element==='N')).toBe(false);
  expect(composition.elementsExcluded.map(e=>e.element)).toContain('N');
  const hints=planningSearchHints(p,graphSearchHints(prepared.bundle.constraints));
  expect(hints).toMatchObject({nitrogen:false,nitrogenForbidden:true});
 });
 it('O/N-ambiguous signals default to O: broad 3350 + exchangeable 1H give O ≥ 1',()=>{
  const {composition}=plan(noNitrogen());
  expect(composition.elementClues).toEqual(expect.arrayContaining([expect.objectContaining({element:'O',minimum:1,strength:'HARD'})]));
  expect(composition.hypotheses.every(h=>(h.counts.O??0)>=1)).toBe(true);
 });
 it('produces no N in any generated candidate',async()=>{
  const result=await executeSixStepAnalysis({spectra:noNitrogen(),extraInput:{}},{timeMs:4000,maxStates:4000});
  expect(result.rankedCandidates.some(c=>hasN(c.molecularFormula))).toBe(false);
  expect((result.solvedConstraintSpace.searchResult?.smiles??[]).some(s=>/N|n/.test(s.replace(/Cl|Br|Na/g,'')))).toBe(false);
 },30000);
 it('environment rules drop N only when asked; nmrEngine/Mode B keep the default rules',()=>{
  const peak={id:'p',x:3.0,y:50} as SpectralPeak,c13={id:'c',x:118,y:50} as SpectralPeak;
  expect(inferSignalEnvironments('1H_NMR',peak,'Unknown',{nitrogenAllowed:false}).some(e=>e.neighborElements.includes('N'))).toBe(false);
  expect(inferSignalEnvironments('13C_NMR',c13,'Unknown',{nitrogenAllowed:false}).some(e=>e.id==='nitrile-c')).toBe(false);
  expect(inferSignalEnvironments('1H_NMR',peak).some(e=>e.neighborElements.includes('N'))).toBe(true);
  expect(inferSignalEnvironments('13C_NMR',c13).some(e=>e.id==='nitrile-c')).toBe(true);
 });
});

describe('B. N-specific evidence keeps N available',()=>{
 const aromatic=()=>mk('1H_NMR',[{x:7.62,integration:2,multiplicity:'d',jValues:[8]},{x:7.46,integration:1,multiplicity:'t',jValues:[8]},{x:7.4,integration:2,multiplicity:'t',jValues:[8]}]);
 it('IR C≡N at 2229 cm⁻¹ allows N in formulas and in the search alphabet',()=>{
  const {plan:p,composition,prepared}=plan({'1H_NMR':aromatic(),IR:mk('IR',[{x:2229,y:60},{x:3065,y:20},{x:1598,y:30}])});
  expect(p.nitrogenEvidence?.mode).toBe('EVIDENCE');
  expect(p.nitrogenEvidence?.reasons[0].text).toContain('C≡N');
  expect(composition.elementsExcluded.map(e=>e.element)).not.toContain('N');
  expect(composition.hypotheses.some(h=>hasN(h.formula))).toBe(true);
  expect(planningSearchHints(p,graphSearchHints(prepared.bundle.constraints)).nitrogenForbidden).toBeUndefined();
 });
 it('an N–H doublet (3400/3330) is N evidence; a single broad 3350 is not',()=>{
  expect(plan({'1H_NMR':aromatic(),IR:mk('IR',[{x:3400,y:40},{x:3330,y:40},{x:1620,y:50}])}).plan.nitrogenEvidence?.mode).toBe('EVIDENCE');
  expect(plan({'1H_NMR':aromatic(),IR:mk('IR',[{x:3350,y:60,isBroad:true,shape:'broad'}])}).plan.nitrogenEvidence?.mode).toBe('NONE');
 });
 it('an N-containing user formula is evidence and reaches the candidates',async()=>{
  const spectra={'1H_NMR':aromatic(),IR:mk('IR',[{x:3065,y:20},{x:1598,y:30}])};
  expect(plan(spectra,{molecularFormula:'C7H5N'}).plan.nitrogenEvidence?.mode).toBe('EVIDENCE');
  const result=await executeSixStepAnalysis({spectra,extraInput:{molecularFormula:'C7H5N'}},{timeMs:6000,maxStates:8000});
  expect(result.rankedCandidates.length).toBeGreaterThan(0);
  expect(result.rankedCandidates.every(c=>c.molecularFormula==='C7H5N')).toBe(true);
 },30000);
 it('MS: an odd confirmed molecular ion is N evidence; an even one only keeps N possible with lower confidence',()=>{
  const ei=(mz:number)=>mk('MS',[{x:mz,y:60},{x:mz+1,y:5},{x:77,y:100}],{msParams:{msType:'EI-MS',ionization:'EI',adductType:'[M]+•',chargeState:1,ionAssignmentConfirmed:true}});
  expect(plan({MS:ei(121)}).plan.nitrogenEvidence?.mode).toBe('EVIDENCE');
  const even=plan({MS:ei(150)});
  expect(even.plan.nitrogenEvidence?.mode).toBe('EVEN_ION_ONLY');
  const withN=even.composition.hypotheses.filter(h=>hasN(h.formula));
  expect(withN.length).toBeGreaterThan(0);
  expect(withN.every(h=>h.unknown.some(u=>u.text.includes('偶數名義質量')))).toBe(true);
 });
});

describe('C. 1H + IR without mass or 13C',()=>{
 it('enumerates several k multiples, all marked as size-unconfirmed',()=>{
  const {composition}=plan(noNitrogen());
  expect(composition.status).toBe('INFERRED');
  const ks=new Set(composition.hypotheses.map(h=>h.symmetryMultiple));
  expect(ks.size).toBeGreaterThan(1);
  expect([...ks].every(k=>k!==null&&k>=1&&k<=3)).toBe(true);
  expect(composition.bounds.hydrogenMultiples).toEqual([10,20,30]);
  // v1.1.7-hotfix.1: per-signal carbon estimate. Visible signals 5H, 2H, 2H (the broad exchangeable 1H carries no C):
  // k=1 → [2+1+1, 9+4] = [4,13]; k=2 → [4+2+2, 18+4] = [8,22]; k=3 → [5+2+2, 27+4] = [9,31]. (v1.1.6 expected [3,13].)
  expect(composition.bounds.carbon).toEqual([4,31]);
  expect(composition.hypotheses.every(h=>h.massBasis==='NONE'&&!h.sizeConfirmed&&h.unknown.some(u=>u.text==='無質量依據，分子大小未確認'))).toBe(true);
  expect(composition.limitations.some(l=>l.startsWith('無質量依據，分子大小未確認')&&l.includes('k=1–3'))).toBe(true);
  expect(composition.elementClues.length).toBeGreaterThan(0);
  for(const h of composition.hypotheses){
   const k=h.symmetryMultiple!,H=h.counts.H??0,C=h.counts.C??0;
   expect(H-10*k).toBeGreaterThanOrEqual(0);expect(H-10*k).toBeLessThanOrEqual(2);
   const [lo,hi]=({1:[4,13],2:[8,22],3:[9,31]} as Record<number,[number,number]>)[k];
   expect(C).toBeGreaterThanOrEqual(lo);expect(C).toBeLessThanOrEqual(hi);
  }
 });
 it('a user formula is the only hypothesis',()=>{
  const {composition}=plan(noNitrogen(),{molecularFormula:'C9H12O'});
  expect(composition.status).toBe('USER_FORMULA');
  expect(composition.hypotheses.map(h=>h.formula)).toEqual(['C9H12O']);
 });
});

describe('D. symmetric-unit hypothesis',()=>{
 // Synthetic q/t ethyl pattern plus an aromatic doublet pair: integrals 2:3:2:2.
 const unitSpectra=()=>({'1H_NMR':mk('1H_NMR',[{x:7.9,integration:2,multiplicity:'d',jValues:[8.5]},{x:7.0,integration:2,multiplicity:'d',jValues:[8.5]},{x:4.1,integration:2,multiplicity:'q',jValues:[7]},{x:1.4,integration:3,multiplicity:'t',jValues:[7]}])});
 const hyp=(formula:string,k:number|null):CompositionHypothesis=>({id:`comp-${formula}`,formula,counts:{},dbe:0,monoisotopicMass:0,massBasis:'NONE',ionHypothesisId:null,massErrorDa:null,massErrorPpm:null,relativeConfidence:1,calibrated:false,score:0,support:[],contradiction:[],unknown:[],generatorSupported:true,unsupportedElements:[],searched:false,sizeConfirmed:false,symmetryMultiple:k});
 const comp=(hs:CompositionHypothesis[]):CompositionInferenceResult=>({status:'INFERRED',hypotheses:hs,ionHypotheses:[],elementsConsidered:[],elementsExcluded:[],elementClues:[],nitrogenEvidence:{mode:'NONE',allowed:false,reasons:[],note:''},bounds:{carbon:null,hydrogenMultiples:null,heteroMinimums:{},dbeMin:0,hardBoundsRelaxed:false},enumeration:{enumeratedNodes:0,passedHardFilters:0,returned:hs.length,truncatedByNodes:false,droppedByKeepLimit:0},limitations:[],elapsedMs:0});
 const budget={timeMs:12000,maxStates:120000,maxResults:48,maxFrontier:4096,beamWidth:64};
 it('passes k copies of the unit as required fragments and counts them correctly',async()=>{
  const {plan:p,prepared}=plan(unitSpectra());
  const hints=planningSearchHints(p,graphSearchHints(prepared.bundle.constraints));
  const unit=symmetricUnit(p.localStructures);
  expect(unit.length).toBeGreaterThan(0);
  expect(unit.length).toBeLessThan(p.localStructures.length+1);
  const seen:number[]=[];
  const generator:StructureGenerator={generateStructures:async({hints:h})=>{seen.push(h.localStructures?.length??0);return {smiles:[],status:'BOUNDED',visited:10,note:'',termination:'BEAM_PRUNED',complete:false,partialHypotheses:[],rejectedByComposition:0,derivations:{}} as DeNovoSearchResult;}};
  const out=await generateForCompositions({userFormula:null,composition:comp([hyp('C18H18O2',2),hyp('C27H27O3',3),hyp('C9H10O',1)]),hints,budget,generator});
  const [r2,r3,r1]=out.runs;
  expect(r2.symmetry).toMatchObject({k:2,unitIds:unit.map(l=>l.id)});
  expect(r2.symmetry!.requiredFragmentIds).toHaveLength(2*unit.length);
  expect(r3.symmetry!.requiredFragmentIds).toHaveLength(3*unit.length);
  expect(new Set(r3.symmetry!.requiredFragmentIds).size).toBe(3*unit.length);
  expect(r1.symmetry).toBeNull();
  expect(seen).toEqual([p.localStructures.length+unit.length,p.localStructures.length+2*unit.length,p.localStructures.length]);
  // Failure diagnostics say why nothing was produced.
  expect(r2.diagnostic).toContain('沒有產生候選');expect(r2.diagnostic).toContain(`${2*unit.length} 個必要片段`);
  expect(out.note).toContain('所有分子式假設都沒有產生候選');
 });
 it('copies get distinct ids and observation ids so the generator can join every copy',()=>{
  const {plan:p}=plan(unitSpectra());
  const unit=symmetricUnit(p.localStructures);
  const {copies,requiredIds}=replicateUnit(unit,3);
  expect(copies).toHaveLength(2*unit.length);
  expect(copies.every(c=>c.observationIds.every(o=>/#[23]$/.test(o)))).toBe(true);
  expect(requiredIds.slice(0,unit.length)).toEqual(unit.map(l=>l.id));
 });
 it('reports when the unit copies cannot fit the formula, and counts candidates that used every copy',async()=>{
  const {plan:p,prepared}=plan(unitSpectra());
  const hints=planningSearchHints(p,graphSearchHints(prepared.bundle.constraints));
  const unit=symmetricUnit(p.localStructures),req=replicateUnit(unit,2).requiredIds;
  const generator:StructureGenerator={generateStructures:async({formula})=>formula==='C2H6'
   ?{smiles:[],status:'BOUNDED',visited:3,note:'',termination:'GRAMMAR_EXHAUSTED',complete:true,partialHypotheses:[],rejectedByComposition:0,derivations:{}} as DeNovoSearchResult
   :{smiles:['A','B'],status:'BOUNDED',visited:5,note:'',termination:'OUTPUT_BUDGET',complete:false,partialHypotheses:[],rejectedByComposition:0,derivations:{A:{localStructureIds:req,operations:[],observationIds:[]},B:{localStructureIds:[req[0]],operations:[],observationIds:[]}}} as DeNovoSearchResult};
  const out=await generateForCompositions({userFormula:null,composition:comp([hyp('C2H6',2),hyp('C18H18O2',2)]),hints,budget,generator});
  expect(out.runs[0].diagnostic).toContain('超過分子式 C2H6');
  expect(out.runs[1].symmetry!.candidatesContainingAllCopies).toBe(1);
  expect(out.search.smiles).toEqual(['A','B']);
 });
});
