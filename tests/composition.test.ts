import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import {findMFs} from 'mf-finder';
import {beforeAll,describe,expect,it} from 'vitest';
import {spectrum} from './fixtures';
import {createApp} from '../server';
import {findPackageVersion,readAppVersion} from '../src/appVersion';
import {initializeRDKit} from '../src/engines/scientificEngines/rdkitAdapter';
import {WorkbenchOrchestrator} from '../src/engines/workbenchOrchestrator';
import {createReasoningPlan} from '../src/engines/reasoning/hypothesisGenerator';
import {executeSixStepAnalysis} from '../src/engines/reasoning/sixStepAnalysis';
import {inferComposition} from '../src/engines/composition/inferComposition';
import {enumerateFormulas} from '../src/engines/composition/formulaEnumerator';
import {commonRangeViolations,formatHill,hardViolation,parseCounts,dbeOf} from '../src/engines/composition/goldenRules';
import {simplestIntegerRatio} from '../src/engines/composition/nmrComposition';
import {combineBounds,functionalGroupFeatures} from '../src/engines/composition/functionalGroupBounds';
import {generateForCompositions,type StructureGenerator} from '../src/engines/composition/structureGenerator';
import {COMPOSITION_CONFIG} from '../src/engines/composition/compositionConfig';
import type {CompositionHypothesis,CompositionInferenceResult} from '../src/engines/composition/types';
import type {DeNovoSearchResult} from '../src/engines/scientificEngines/deNovoGraphSearch';
import type {ExperimentalSpectrumData,IRFunctionalGroupFinding,SpectralPeak} from '../src/types/spectrum';

// All spectra below are SYNTHETIC peak lists written for logic tests. No measured compound spectra are used,
// and nothing here claims identification accuracy: tests only check that the logic behaves as designed.
beforeAll(()=>initializeRDKit());
type Mod=ExperimentalSpectrumData['modality'];
const mk=(mod:Mod,peaks:Partial<SpectralPeak>[],extra:Partial<ExperimentalSpectrumData>={}):ExperimentalSpectrumData=>({...spectrum(mod,peaks.map((p,i)=>({id:`${mod}-${i}`,manualPeak:true,y:100,...p})) as SpectralPeak[]),...extra});
const ei=(peaks:Partial<SpectralPeak>[],params:Partial<NonNullable<ExperimentalSpectrumData['msParams']>>={})=>mk('MS',peaks,{msParams:{msType:'EI-MS',ionization:'EI',...params}});
const infer=(spectra:Partial<Record<Mod,ExperimentalSpectrumData>>,extraInput:Record<string,unknown>={})=>{
 const prepared=WorkbenchOrchestrator.prepareModeAEvidence(spectra,extraInput);
 const plan=createReasoningPlan(prepared.bundle);
 return {r:inferComposition({bundle:prepared.bundle,observations:plan.observations,userFormula:plan.userFormula}),plan,prepared};
};
const formulas=(r:CompositionInferenceResult)=>r.hypotheses.map(h=>h.formula);
const count=(h:CompositionHypothesis,e:string)=>(h.counts as Record<string,number>)[e]??0;
// Synthetic EI list for a C9H10O2 molecular ion (M+1 ≈ 10 %, M+2 ≈ 1 %) plus two fragments.
const ethylBenzoateLike=()=>ei([{x:150,y:30},{x:151,y:3.0},{x:152,y:0.3},{x:105,y:100},{x:77,y:60}]);

describe('MS composition evidence',()=>{
 it('keeps the expected formula among several competing hypotheses with uncalibrated confidence',()=>{
  const {r}=infer({MS:ethylBenzoateLike()});
  expect(r.status).toBe('INFERRED');
  expect(formulas(r)).toContain('C9H10O2');
  expect(r.hypotheses.length).toBeGreaterThan(1);
  expect(r.hypotheses.every(h=>h.calibrated===false&&h.massBasis==='LOW_RES_MS'&&h.sizeConfirmed)).toBe(true);
  expect(r.hypotheses.reduce((s,h)=>s+h.relativeConfidence,0)).toBeCloseTo(1,6);
  const top=r.hypotheses.find(h=>h.formula==='C9H10O2')!;
  expect(top.support.some(x=>x.source==='MS_ISOTOPE'&&x.observationIds.length===2)).toBe(true);
  expect(r.limitations.some(l=>l.includes('未校準'))).toBe(true);
 });
 it('reads Cl (M+2 ≈ 32 %) and Br (M+2 ≈ 98 %) from the isotope pattern',()=>{
  const cl=infer({MS:ei([{x:112,y:100},{x:113,y:6.6},{x:114,y:32},{x:77,y:40}])}).r;
  expect(cl.hypotheses[0].formula).toBe('C6H5Cl');
  const br=infer({MS:ei([{x:156,y:100},{x:157,y:6.6},{x:158,y:97},{x:77,y:60}])}).r;
  expect(br.hypotheses[0].formula).toBe('C6H5Br');
 });
 it('hard-excludes Cl/Br only when a small M+2 is actually marked; an unmarked M+2 stays unknown',()=>{
  const marked=infer({MS:ethylBenzoateLike()}).r;
  expect(marked.hypotheses.filter(h=>h.ionHypothesisId==='ion-0-M+').some(h=>count(h,'Cl')||count(h,'Br'))).toBe(false);
  // The fragment-ion hypotheses (m/z 105, 77) have no marked M+2, so Cl/Br stay possible there and are not excluded globally.
  expect(marked.limitations.some(l=>l.includes('ion-0-M+')&&l.includes('Cl／Br'))).toBe(true);
  const only=infer({MS:ei([{x:150,y:100},{x:151,y:10},{x:152,y:1}])}).r;
  expect(only.elementsExcluded.map(e=>e.element)).toEqual(expect.arrayContaining(['Cl','Br']));
  expect(only.hypotheses.some(h=>count(h,'Cl')||count(h,'Br'))).toBe(false);
  const unmarked=infer({MS:ei([{x:150,y:30},{x:151,y:3.0},{x:105,y:100}])}).r;
  expect(unmarked.elementsExcluded.map(e=>e.element)).not.toContain('Cl');
  expect(unmarked.elementsConsidered).toEqual(expect.arrayContaining(['Cl','Br']));
  const top=unmarked.hypotheses.find(h=>h.formula==='C9H10O2')!;
  expect(top.unknown.some(x=>x.text.includes('M+2/M 未標記'))).toBe(true);
 });
 it('follows the nitrogen rule for [M]+• and flips it for [M+H]+',()=>{
  const odd=infer({MS:ei([{x:121,y:80},{x:122,y:6.4},{x:105,y:100}])}).r;
  const fromM=odd.hypotheses.filter(h=>h.ionHypothesisId==='ion-0-M+');
  expect(fromM.length).toBeGreaterThan(0);
  expect(fromM.every(h=>(count(h,'N')+count(h,'P'))%2===1)).toBe(true);
  const esi=infer({MS:mk('MS',[{x:122.06,y:100}],{msParams:{msType:'LC-MS',ionization:'ESI+'}})}).r;
  const fromMH=esi.hypotheses.filter(h=>h.ionHypothesisId==='ion-0-M+H+');
  expect(fromMH.length).toBeGreaterThan(0);
  expect(fromMH.every(h=>count(h,'N')%2===1)).toBe(true);
 });
 it('rejects the highest peak as [M]+• when a marked peak implies an implausible loss',()=>{
  const {r,plan}=infer({MS:ei([{x:160,y:20},{x:152,y:50},{x:153,y:4},{x:105,y:100}])});
  const rejected=r.ionHypotheses.find(i=>i.observedMz===160)!;
  expect(rejected.rejected).toBe(true);
  const inWindow=plan.observations.filter(o=>o.modality==='MS'&&(o.value===152||o.value===153)).map(o=>o.id);
  expect(inWindow.some(id=>rejected.rejectionReason!.includes(id))).toBe(true);
  expect(r.hypotheses.some(h=>h.ionHypothesisId===rejected.id)).toBe(false);
 });
 it('enumerates within a ppm window for high-resolution data',()=>{
  const peaks=[{x:150.0675,y:30},{x:151.071,y:3.0},{x:105,y:100}];
  const hr=infer({MS:ei(peaks,{isHighResolution:true,massTolerancePpm:5})}).r;
  const lr=infer({MS:ei(peaks)}).r;
  expect(formulas(hr)).toContain('C9H10O2');
  const fromHr=hr.hypotheses.filter(h=>h.massBasis==='HRMS');
  expect(fromHr.every(h=>Math.abs(h.massErrorPpm!)<=5)).toBe(true);
  expect(fromHr.length).toBeLessThan(lr.hypotheses.filter(h=>h.ionHypothesisId==='ion-0-M+').length);
 });
 it('lists both polarities when ionization and polarity are unknown, with unconfirmed forms down-weighted',()=>{
  const {r}=infer({MS:mk('MS',[{x:150,y:30},{x:151,y:3},{x:105,y:100}])});
  const adducts=new Set(r.ionHypotheses.map(i=>i.adduct));
  expect(adducts.has('[M]+•')&&adducts.has('[M+H]+')&&adducts.has('[M-H]-')).toBe(true);
  expect(r.ionHypotheses.every(i=>!i.confirmedByUser&&i.prior<0)).toBe(true);
  const confirmed=infer({MS:ei([{x:150,y:30},{x:151,y:3},{x:105,y:100}],{adductType:'[M]+•',chargeState:1,ionAssignmentConfirmed:true})}).r;
  expect(confirmed.ionHypotheses.every(i=>i.adduct==='[M]+•')).toBe(true);
  expect(confirmed.ionHypotheses[0].prior).toBe(0);
 });
});

describe('NMR and functional-group bounds',()=>{
 const c13=(shifts:number[])=>mk('13C_NMR',shifts.map(x=>({x})));
 it('uses the 13C signal count as a carbon lower bound and penalizes large symmetry assumptions without a mass',()=>{
  const {r}=infer({'13C_NMR':c13([170.1,140.2,130.3,129.4,128.5,60.6,30.7,14.8])});
  expect(r.status).toBe('INFERRED');
  expect(r.hypotheses.every(h=>count(h,'C')>=8)).toBe(true);
  expect(r.bounds.carbon).toEqual([8,18]);
  const best=(pred:(h:CompositionHypothesis)=>boolean)=>Math.max(0,...r.hypotheses.filter(pred).map(h=>h.relativeConfidence));
  expect(best(h=>count(h,'C')<=8)).toBeGreaterThan(best(h=>count(h,'C')>16));
 });
 it('reduces 1H integrals to the simplest integer ratio and lists integer multiples',()=>{
  expect(simplestIntegerRatio([4,6,10])).toEqual([2,3,5]);
  expect(simplestIntegerRatio([2.0,2.9,5.1])).toEqual([2,3,5]);
  expect(simplestIntegerRatio([1,1.5])).toEqual([2,3]);
  expect(simplestIntegerRatio([1,1.37],0.15,2)).toBeNull();
  const h1=mk('1H_NMR',[{x:7.8,integration:4},{x:4.3,integration:6},{x:1.3,integration:10}]);
  const {r}=infer({'1H_NMR':h1,'13C_NMR':c13([170.1,130.2,60.3,14.4])});
  expect(r.bounds.hydrogenMultiples).toEqual([10,20,30,40,50,60]);
  const allowed=new Set(r.bounds.hydrogenMultiples!.flatMap(v=>[v,v+1,v+2]));
  expect(r.hypotheses.every(h=>allowed.has(count(h,'H')))).toBe(true);
 });
 it('turns functional groups into element/DBE minima: IR alone is soft, two modalities are hard',()=>{
  const irPeak=mk('IR',[{x:1720,y:90}]);
  const obs=createReasoningPlan(WorkbenchOrchestrator.prepareModeAEvidence({IR:irPeak,'13C_NMR':c13([170.4])},{}).bundle).observations;
  const finding={family:'ester',functionalGroup:'ester C=O',observedPeak:1720,matchLevel:'Strong',status:'PRESENT'} as IRFunctionalGroupFinding;
  const nmrBoth={c13:{count:1,observationIds:[],optionalCount:0,complete:false,deptHydrogenMin:null,deptIds:[],carbonylIds:[obs.find(o=>o.modality==='13C_NMR')!.id],heteroSp3Ids:[],aromaticIds:[],nitrileIds:[]},h1:null,elementEvidence:[],limitations:[]};
  const both=functionalGroupFeatures(obs,[finding],nmrBoth);
  expect(both.find(f=>f.key==='CARBONYL')).toMatchObject({hard:true,modalities:['13C_NMR','IR']});
  expect(both.find(f=>f.key==='ESTER_ACID')).toMatchObject({hard:false,modalities:['IR']});
  expect(combineBounds(both.filter(f=>f.hard))).toEqual({mins:{O:1},dbeMin:1});
  const irOnly=functionalGroupFeatures(obs,[finding],{...nmrBoth,c13:{...nmrBoth.c13,carbonylIds:[]}});
  expect(irOnly.every(f=>!f.hard)).toBe(true);
 });
 it('enforces cross-modal hard bounds, and relaxes them to soft when they remove every hypothesis',()=>{
  const aromatic13=c13([155.1,140.2,130.3,128.4,126.5,40.6]),aromatic1=mk('1H_NMR',[{x:7.3},{x:7.1}]);
  const fits=infer({'13C_NMR':aromatic13,'1H_NMR':aromatic1,MS:ei([{x:150,y:40},{x:151,y:4.4},{x:91,y:100}])}).r;
  expect(fits.bounds.hardBoundsRelaxed).toBe(false);
  expect(fits.hypotheses.length).toBeGreaterThan(0);
  expect(fits.hypotheses.every(h=>count(h,'C')>=6&&h.dbe>=4)).toBe(true);
  const conflict=infer({'13C_NMR':aromatic13,'1H_NMR':aromatic1,MS:ei([{x:58,y:100}])}).r;
  expect(conflict.bounds.hardBoundsRelaxed).toBe(true);
  expect(conflict.limitations.some(l=>l.includes('退回軟證據'))).toBe(true);
 });
});

describe('enumeration and filters',()=>{
 it('Golden Rules and SENIOR reject unreasonable formulas',()=>{
  expect(hardViolation({C:1,H:40},16)).not.toBeNull();
  expect(hardViolation({C:2,H:5},29)).not.toBeNull();
  expect(hardViolation({C:6,Cl:6},282)).toBeNull();
  expect(hardViolation({C:9,H:10,O:2},150)).toBeNull();
 });
 it('uses the Kind & Fiehn 2007 Table 1 caps (larger of DNP/Wiley) and Table 2 ranges',()=>{
  expect(hardViolation({C:40,H:2},482)).toContain('Golden Rule 1');        // C 39 below 500 Da
  expect(hardViolation({C:39,H:2},470)).toBeNull();                         // H/C 0.05: hard lower bound 0, soft only
  expect(hardViolation({C:9,H:36,Si:9},396)).toContain('Golden Rule 1');    // Si 8 below 500 Da (Wiley column)
  expect(hardViolation({C:8,H:32,Si:8},352)).toBeNull();
  expect(hardViolation({C:41,H:84},576)).toBeNull();                        // C 78 / H 126 between 500 and 1000 Da
  expect(hardViolation({C:3,H:1,Cl:7},282)).toContain('Golden Rule 5');     // Cl/C 2.33 > extended 2 (C ≥ 3)
  expect(hardViolation({C:12,H:52,Si:13},560)).toContain('Golden Rule 5');  // C10+: Table 2 still hard (Si/C 1.08 > 1)
  expect(hardViolation({C:3,H:1,N:13},223)).toContain('Golden Rule 5');     // N/C 4.33 > extended 4
  expect(commonRangeViolations({C:6,Cl:6})).toEqual(expect.arrayContaining([expect.stringContaining('H/C')]));
  expect(commonRangeViolations({C:1,H:2,O:2}).some(v=>v.startsWith('O/C'))).toBe(true);   // O/C 2 > common 1.2
  expect(commonRangeViolations({C:9,H:10,O:2})).toEqual([]);
 });
 it('treats Table 2 ratios as soft penalties for C1–C2 formulas (CHCl3, CH2Cl2, CCl4, CF3Br)',()=>{
  for(const [counts,mass] of [[{C:1,H:1,Cl:3},117.91],[{C:1,H:2,Cl:2},83.95],[{C:1,Cl:4},151.88],[{C:1,F:3,Br:1},147.91]] as const)expect(hardViolation(counts,mass)).toBeNull();
  // CHCl3 (Cl/C 3) and CCl4 (Cl/C 4) exceed the extended range: kept, but penalized.
  for(const counts of [{C:1,H:1,Cl:3},{C:1,Cl:4}])expect(commonRangeViolations(counts).some(v=>v.includes('只作軟懲罰'))).toBe(true);
  expect(hardViolation({C:3,H:1,Cl:7},282)).not.toBeNull();
  const ccl4=infer({MS:ei([{x:152,y:60},{x:154,y:78},{x:156,y:38},{x:117,y:100}])}).r;
  expect(formulas(ccl4)).toContain('CCl4');
  const out=enumerateFormulas({neutralMass:100,toleranceDa:0.5,caps:{C:39,N:20,O:20,S:2},mins:{},carbonRange:[1,39]});
  expect(out.formulas.length).toBeGreaterThan(0);
  expect(out.formulas.every(f=>{const c=f.counts as Record<string,number>;return (c.H??0)/c.C<=6&&Number.isInteger(dbeOf(f.counts))&&dbeOf(f.counts)>=0;})).toBe(true);
 });
 it('agrees with mf-finder (devDependency, test-only cross-check) on the formulas inside the mass window',async()=>{
  for(const [mass,tol] of [[150.0681,0.4],[182.0368,0.3]] as const){
   const ours=new Set(enumerateFormulas({neutralMass:mass,toleranceDa:tol,caps:{C:20,N:4,O:6,S:2},mins:{},carbonRange:[1,20]}).formulas.map(f=>formatHill(f.counts)));
   const result=await findMFs(mass,{ranges:'C0-20 H0-40 N0-4 O0-6 S0-2',precision:tol/mass*1e6,allowNeutral:true,limit:100000,filter:{unsaturation:{min:0,onlyInteger:true}}} as never) as unknown as {mfs:{mf:string;em:number}[]};
   const theirs=new Set(result.mfs.map(m=>parseCounts(m.mf.replace(/\s/g,''))!).filter(c=>c&&(c.C??0)>=1&&!hardViolation(c,mass)).map(formatHill));
   expect(theirs.size).toBeGreaterThan(5);
   expect([...ours].sort()).toEqual([...theirs].sort());
  }
 });
 it('reports truncation instead of silently dropping formulas',()=>{
  const small=enumerateFormulas({neutralMass:400,toleranceDa:0.5,caps:{C:39,N:20,O:20,S:2},mins:{},carbonRange:[1,39],maxNodes:50});
  expect(small.truncated).toBe(true);
  const {r}=infer({MS:ei([{x:580,y:30},{x:581,y:12},{x:300,y:100}])});
  expect(r.enumeration.droppedByKeepLimit).toBeGreaterThan(0);
  expect(r.hypotheses).toHaveLength(COMPOSITION_CONFIG.maxHypotheses);
  expect(r.limitations.some(l=>l.includes('捨棄'))).toBe(true);
 });
 it('is deterministic for identical input',()=>{
  const strip=(r:CompositionInferenceResult)=>JSON.stringify({...r,elapsedMs:0});
  const a=infer({MS:ethylBenzoateLike(),'13C_NMR':mk('13C_NMR',[{x:166.6},{x:132.8},{x:130.5},{x:60.9},{x:14.3}])}).r;
  const b=infer({MS:ethylBenzoateLike(),'13C_NMR':mk('13C_NMR',[{x:166.6},{x:132.8},{x:130.5},{x:60.9},{x:14.3}])}).r;
  expect(strip(a)).toBe(strip(b));
 });
 it('stays under one second for masses up to 600 (low resolution and HRMS)',()=>{
  for(const params of [{},{isHighResolution:true}]){
   const t=performance.now();
   infer({MS:ei([{x:580.2,y:30},{x:581.2,y:12},{x:300,y:100}],params)});
   expect(performance.now()-t).toBeLessThan(1000);
  }
 });
});

describe('user formula, no-mass marking and element gating',()=>{
 it('makes the user formula the only hypothesis and records contradictions without overriding it',()=>{
  const {r}=infer({MS:ei([{x:136,y:40},{x:137,y:3.5},{x:105,y:100}])},{molecularFormula:'C9H10O2'});
  expect(r.status).toBe('USER_FORMULA');
  expect(r.hypotheses).toHaveLength(1);
  expect(r.hypotheses[0]).toMatchObject({formula:'C9H10O2',relativeConfidence:1,massBasis:'USER_FORMULA'});
  expect(r.hypotheses[0].contradiction.some(x=>x.text.includes('不在容差內'))).toBe(true);
  const si=infer({'13C_NMR':mk('13C_NMR',[{x:10}])},{molecularFormula:'C4H12Si'}).r;
  expect(si.hypotheses[0].formula).toBe('C4H12Si');
 });
 it('marks every hypothesis without a mass as size-unconfirmed',()=>{
  const {r}=infer({'13C_NMR':mk('13C_NMR',[{x:170.1},{x:130.2},{x:60.3},{x:14.4}]),'1H_NMR':mk('1H_NMR',[{x:4.1,integration:2},{x:1.2,integration:3}])});
  expect(r.hypotheses.length).toBeGreaterThan(0);
  expect(r.hypotheses.every(h=>h.massBasis==='NONE'&&!h.sizeConfirmed&&h.unknown.some(u=>u.text==='無質量依據，分子大小未確認'))).toBe(true);
  expect(r.limitations.some(l=>l.startsWith('無質量依據，分子大小未確認'))).toBe(true);
  // v1.1.6: 1H with integrals now enumerates (H = k·S, C = k·V + q); only 1H without integrals stays INSUFFICIENT_DATA.
  expect(infer({'1H_NMR':mk('1H_NMR',[{x:1.2}])}).r.status).toBe('INSUFFICIENT_DATA');
 });
 it('without mass, 13C and 1H integrals reports element clues, enumerates nothing and falls back to the no-formula search',async()=>{
  // v1.1.6: the same signals WITH integrals now enumerate formulas (tests/v116Nitrogen.test.ts), so integrals are omitted here.
  const h=mk('1H_NMR',[{x:9.95,multiplicity:'s'},{x:7.85,multiplicity:'d',jValues:[8]},{x:7.5,multiplicity:'d',jValues:[8]}]);
  const {r}=infer({'1H_NMR':h});
  expect(r.status).toBe('INSUFFICIENT_DATA');
  expect(r.hypotheses).toEqual([]);
  expect(r.enumeration.enumeratedNodes).toBe(0);
  expect(r.elementClues).toEqual(expect.arrayContaining([
   expect.objectContaining({element:'C',minimum:6,strength:'SOFT',source:'HYPOTHESIS'}),
   expect.objectContaining({element:'O',minimum:1,strength:'SOFT'}),
  ]));
  expect(r.elementClues.every(c=>c.observationIds.length>0)).toBe(true);
  const result=await executeSixStepAnalysis({spectra:{'1H_NMR':h},extraInput:{}},{timeMs:3000,maxStates:3000});
  expect(result.reasoningTrace!.compositionSearch?.mode).toBe('NO_FORMULA');
  expect(result.compositionInference?.elementClues.length).toBeGreaterThan(0);
 },30000);
 it('keeps F/I/P/Si out unless specific evidence opens them',()=>{
  const plain=infer({MS:ethylBenzoateLike()}).r;
  expect(plain.elementsExcluded.map(e=>e.element)).toEqual(expect.arrayContaining(['F','I','P','Si']));
  expect(plain.hypotheses.some(h=>['F','I','P','Si'].some(e=>count(h,e)))).toBe(false);
  const iodo=infer({MS:ei([{x:204,y:100},{x:205,y:6.6},{x:127,y:20},{x:77,y:60}])}).r;
  expect(iodo.elementsExcluded.map(e=>e.element)).not.toContain('I');
  expect(formulas(iodo)).toContain('C6H5I');
  const fluoro=infer({MS:ei([{x:96,y:100},{x:97,y:6.6},{x:77,y:30}]),'13C_NMR':mk('13C_NMR',[{x:163,multiplicity:'d',jValues:[246]},{x:130},{x:124},{x:115}])}).r;
  expect(formulas(fluoro)).toContain('C6H5F');
 });
});

describe('solvent marks (審核決定 1, 6)',()=>{
 it('excludes only explicit USER marks; automatic solvent matches stay as optional observations',()=>{
  const h=mk('1H_NMR',[{x:7.26,y:30},{x:6.9,y:80,integration:2},{x:7.0,y:80,integration:2},{x:2.1,y:60,integration:3,userClassification:'IMPURITY',classificationSource:'USER'}]);
  const tagged=WorkbenchOrchestrator.applyNmrSolventTagging({...h,nmrSolvent:'CDCl3'},'CDCl3');
  expect(tagged.peaks[0]).toMatchObject({userClassification:'SOLVENT',classificationSource:'AUTO_SOLVENT_REFERENCE'});
  const prepared=WorkbenchOrchestrator.prepareModeAEvidence({'1H_NMR':tagged},{});
  const s=prepared.spectra['1H_NMR']!;
  expect(s.excludedObservations).toEqual([{peakId:'1H_NMR-3',x:2.1,label:'IMPURITY'}]);
  const plan=createReasoningPlan(prepared.bundle);
  expect(plan.observations.map(o=>o.value).sort()).toEqual([6.9,7,7.26]);
  expect(plan.observations.find(o=>o.value===7.26)!.optional).toBe(true);
  expect(s.peaks.find(p=>p.x===7.26)).toMatchObject({optionalObservation:true,autoNonAnalyteLabel:'SOLVENT'});
 });
 it('treats legacy SOLVENT marks without a source as automatic (kept)',()=>{
  const h=mk('1H_NMR',[{x:7.26,userClassification:'SOLVENT',isSolventVerified:true},{x:3.7}]);
  const plan=createReasoningPlan(WorkbenchOrchestrator.prepareModeAEvidence({'1H_NMR':h},{}).bundle);
  expect(plan.observations.map(o=>o.value).sort()).toEqual([3.7,7.26]);
 });
 it('automatic solvent candidates neither raise the 13C carbon minimum nor enter the 1H ratio',()=>{
  const c=WorkbenchOrchestrator.applyNmrSolventTagging({...mk('13C_NMR',[{x:77.16},{x:170.1},{x:130.2},{x:60.3},{x:14.4}]),nmrSolvent:'CDCl3'},'CDCl3');
  const h=WorkbenchOrchestrator.applyNmrSolventTagging({...mk('1H_NMR',[{x:7.26,integration:5},{x:4.1,integration:2},{x:1.2,integration:3}]),nmrSolvent:'CDCl3'},'CDCl3');
  const {r}=infer({'13C_NMR':c,'1H_NMR':h});
  expect(r.bounds.carbon![0]).toBe(4);
  expect(r.bounds.hydrogenMultiples![0]).toBe(5);
  expect(r.limitations.some(l=>l.includes('不計入碳數下限'))&&r.limitations.some(l=>l.includes('不計入積分總和'))).toBe(true);
 });
});

describe('server version',()=>{
 it('/api/health reports the package.json version',async()=>{
  const pkg=JSON.parse(fs.readFileSync(path.resolve(__dirname,'..','package.json'),'utf8')) as {version:string};
  const res=await request(await createApp({serveClient:false})).get('/api/health');
  expect(res.body.version).toBe(pkg.version);
  expect(readAppVersion()).toBe(pkg.version);
 });
 it('finds package.json one level above a bundled dist/ directory',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'specreader-version-'));
  try{
   fs.writeFileSync(path.join(root,'package.json'),JSON.stringify({name:'x',version:'9.8.7'}));
   fs.mkdirSync(path.join(root,'dist'));
   expect(findPackageVersion(path.join(root,'dist'))).toBe('9.8.7');
  }finally{fs.rmSync(root,{recursive:true,force:true});}
 });
});

describe('generator bridge',()=>{
 const hyp=(formula:string,supported=true):CompositionHypothesis=>({id:`comp-${formula}`,formula,counts:parseCounts(formula)!,dbe:0,monoisotopicMass:0,massBasis:'LOW_RES_MS',ionHypothesisId:null,massErrorDa:null,massErrorPpm:null,relativeConfidence:0.25,calibrated:false,score:0,support:[],contradiction:[],unknown:[],generatorSupported:supported,unsupportedElements:supported?[]:['S'],searched:false,sizeConfirmed:true,symmetryMultiple:null});
 const composition=(hs:CompositionHypothesis[]):CompositionInferenceResult=>({status:'INFERRED',hypotheses:hs,ionHypotheses:[],elementsConsidered:[],elementsExcluded:[],elementClues:[],nitrogenEvidence:{mode:'EVIDENCE',allowed:true,reasons:[],note:''},bounds:{carbon:null,hydrogenMultiples:null,heteroMinimums:{},dbeMin:0,hardBoundsRelaxed:false},enumeration:{enumeratedNodes:0,passedHardFilters:0,returned:hs.length,truncatedByNodes:false,droppedByKeepLimit:0},limitations:[],elapsedMs:0});
 const budget={timeMs:12000,maxStates:120000,maxResults:48,maxFrontier:4096,beamWidth:64};
 const fake=()=>{
  const calls:{formula:string|undefined;maxStates:number;timeMs:number;maxResults:number}[]=[];
  const generator:StructureGenerator={generateStructures:async({formula,budget:b})=>{
   calls.push({formula,maxStates:b.maxStates,timeMs:b.timeMs,maxResults:b.maxResults});
   const smiles=formula==='C2H6O'?['CCO','COC']:formula==='C3H8O'?['CCCO','COC']:[`X${calls.length}`];
   return {smiles,status:'BOUNDED',visited:Math.floor(b.maxStates/2),note:'',termination:'OUTPUT_BUDGET',complete:false,partialHypotheses:[],rejectedByComposition:0,derivations:{},elapsedMs:b.timeMs/2} as DeNovoSearchResult;
  }};
  return {calls,generator};
 };
 it('searches the top three supported formulas within the original total budget and tags each candidate',async()=>{
  const {calls,generator}=fake();
  const comp=composition([hyp('C2H6O'),hyp('C2H6S',false),hyp('C3H8O'),hyp('C4H10O'),hyp('C5H12O')]);
  const out=await generateForCompositions({userFormula:null,composition:comp,hints:{},budget,generator});
  expect(out.mode).toBe('COMPOSITION_HYPOTHESES');
  expect(calls.map(c=>c.formula)).toEqual(['C2H6O','C3H8O','C4H10O']);
  // Unused budget carries over, so per-run caps may add up to more than the total; actual consumption may not.
  expect(out.runs.reduce((s,r)=>s+r.visited,0)).toBeLessThanOrEqual(120000);
  expect(out.runs.reduce((s,r)=>s+r.elapsedMs,0)).toBeLessThanOrEqual(12000);
  expect(calls[0]).toMatchObject({maxStates:40000,timeMs:4000});
  expect(calls[2].maxStates).toBe(120000-out.runs[0].visited-out.runs[1].visited);
  expect(calls.every(c=>c.maxResults===COMPOSITION_CONFIG.maxResultsPerFormula)).toBe(true);
  expect(out.search.smiles).toEqual(['CCO','COC','CCCO','X3']);
  expect(out.search.formulaSources!.COC).toEqual(['comp-C2H6O','comp-C3H8O']);
  expect(comp.hypotheses.map(h=>h.searched)).toEqual([true,false,true,true,false]);
 });
 it('keeps the single full-budget run for a user formula and the original run without hypotheses',async()=>{
  const a=fake();
  const user=await generateForCompositions({userFormula:'C2H6O',composition:null,hints:{},budget,generator:a.generator});
  expect(user.mode).toBe('USER_FORMULA');expect(a.calls).toEqual([{formula:'C2H6O',maxStates:120000,timeMs:12000,maxResults:48}]);
  const b=fake();
  const none=await generateForCompositions({userFormula:null,composition:{...composition([]),status:'INSUFFICIENT_DATA'},hints:{},budget,generator:b.generator});
  expect(none.mode).toBe('NO_FORMULA');expect(b.calls).toEqual([{formula:undefined,maxStates:120000,timeMs:12000,maxResults:48}]);
 });
 it('runs inside executeSixStepAnalysis without changing the six-stage contract',async()=>{
  const ms=ethylBenzoateLike(),h=mk('1H_NMR',[{x:8.05,integration:2,multiplicity:'m'},{x:7.45,integration:3,multiplicity:'m'},{x:4.37,integration:2,multiplicity:'q',jValues:[7.1]},{x:1.39,integration:3,multiplicity:'t',jValues:[7.1]}]);
  const steps:number[]=[];
  const result=await executeSixStepAnalysis({spectra:{MS:ms,'1H_NMR':h},extraInput:{}},{timeMs:6000,maxStates:6000,onProgress:p=>steps.push(p.step)});
  expect([...new Set(steps)]).toEqual([1,2,3,4,5,6]);
  expect(result.compositionInference?.status).toBe('INFERRED');
  const trace=result.reasoningTrace!;
  expect(trace.stages).toHaveLength(6);
  expect(trace.composition?.hypotheses.length).toBeGreaterThan(1);
  expect(trace.compositionSearch?.mode).toBe('COMPOSITION_HYPOTHESES');
  const runs=trace.compositionSearch!.runs;
  expect(runs.length).toBeGreaterThan(1);
  // The generator may count one state past its cap before stopping.
  expect(runs.reduce((s,r)=>s+r.visited,0)).toBeLessThanOrEqual(6000+runs.length);
  const searched=new Set(trace.composition!.hypotheses.filter(x=>x.searched).map(x=>x.id));
  expect(trace.candidates.every(c=>(c.compositionHypothesisIds??[]).every(id=>searched.has(id)))).toBe(true);
  const withFormula=await executeSixStepAnalysis({spectra:{MS:ms,'1H_NMR':h},extraInput:{molecularFormula:'C9H10O2'}},{timeMs:6000,maxStates:6000});
  expect(withFormula.reasoningTrace!.compositionSearch?.mode).toBe('USER_FORMULA');
  expect(withFormula.compositionInference?.status).toBe('USER_FORMULA');
 },60000);
});
