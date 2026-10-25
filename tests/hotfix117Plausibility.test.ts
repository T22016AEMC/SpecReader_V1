import {describe,expect,it} from 'vitest';
import {NO_PLAUSIBILITY_EVIDENCE as NONE,buildPlausibilityEvidence,plausibilityViolations,type PlausibilityEvidence,type PlausibilityRule} from '../src/engines/scientificEngines/structurePlausibility';
import {V12_CONFIG} from '../src/engines/constraints/v12Config';
import type {ObservedEvidence} from '../src/engines/reasoning/types';

// Work 4 (v1.1.7-hotfix.1): chemical-plausibility gate. Each rule has a rejected case and a must-not-reject case.
const rules=(smiles:string,ev:PlausibilityEvidence=NONE):PlausibilityRule[]=>plausibilityViolations(smiles,ev).map(v=>v.rule);
const nEvidence:PlausibilityEvidence={...NONE,nitrogenEvidence:true,irNO:true};

describe('plausibility rules',()=>{
 it('PEROXIDE: O–O rejected; allowed with a user formula; esters untouched',()=>{
  expect(rules('CCOOC')).toContain('PEROXIDE');
  expect(rules('CC(=O)OO')).toContain('PEROXIDE');
  expect(rules('CCOOC',{...NONE,userFormula:true})).not.toContain('PEROXIDE');
  expect(rules('CCOC(=O)C')).toEqual([]);
 });
 it('N_O_N: rejected; allowed with N evidence and an IR N–O band; plain diamines untouched',()=>{
  expect(rules('CNONC')).toContain('N_O_N');
  expect(rules('CNONC',nEvidence)).toEqual([]);
  expect(rules('CNONC',{...NONE,nitrogenEvidence:true})).toContain('N_O_N');   // N evidence alone is not enough
  expect(rules('CNCCNC')).toEqual([]);
 });
 it('N_DI_OH: N(OH)2 and N–N(OH)2 rejected; tertiary amines untouched',()=>{
  expect(rules('CN(O)O')).toContain('N_DI_OH');
  expect(rules('NN(O)O')).toContain('N_DI_OH');
  expect(rules('CN(O)O',{...NONE,nitrogenEvidence:true,irNOxide:true})).toEqual([]);
  expect(rules('OCCN(C)C')).toEqual([]);
 });
 it('N_O_LINK: hydroxylamine and oxime rejected without evidence; amides untouched',()=>{
  expect(rules('CNO')).toContain('N_O_LINK');
  expect(rules('CC(C)=NO')).toContain('N_O_LINK');
  expect(rules('CC(C)=NO',nEvidence)).toEqual([]);
  expect(rules('CC(=O)N')).toEqual([]);
 });
 it('CUMULATED_N: azide rejected without a strong 2100–2160 band; azo untouched',()=>{
  expect(rules('CN=[N+]=[N-]')).toContain('CUMULATED_N');
  expect(rules('CN=[N+]=[N-]',{...NONE,irCumulatedN:true})).not.toContain('CUMULATED_N');
  expect(rules('CN=NC')).not.toContain('CUMULATED_N');
 });
 it('GEM_DIOL: two free OH on one sp³ C rejected; acetals and hemiacetals untouched',()=>{
  // v1.2.0: the acyclic hemiacetal rule (W5) belongs to the 1H-constraint layer; this test states the v1.1.x rule set, so the flag is set off here.
  // The flag-on behaviour (acyclic hemiacetal rejected) is tested in tests/v12/stage3.test.ts.
  const was=V12_CONFIG.useV12Constraints;V12_CONFIG.useV12Constraints=false;
  try{
   expect(rules('CC(O)O')).toContain('GEM_DIOL');
   expect(rules('CC(OC)OC')).toEqual([]);
   expect(rules('CC(O)OC')).toEqual([]);
  }finally{V12_CONFIG.useV12Constraints=was;}
 });
 it('ENOL: non-aromatic C=C–OH rejected; phenols untouched',()=>{
  expect(rules('CC(O)=CC')).toContain('ENOL');
  expect(rules('Oc1ccccc1')).toEqual([]);
 });
 it('KETENE: C=C=O rejected without a strong ~2150 band; allenes untouched',()=>{
  expect(rules('CC=C=O')).toContain('KETENE');
  expect(rules('CC=C=O',{...NONE,irKetene:true})).toEqual([]);
  expect(rules('CC=C=CC')).toEqual([]);
 });
 it('AMINAL: acyclic sp³ C with two N or N + OH rejected; cyclic, carbonyl, aromatic and imine carbons untouched',()=>{
  expect(rules('CC(N)N')).toContain('AMINAL');
  expect(rules('CC(N)O')).toContain('AMINAL');
  expect(rules('C1CNCN1')).toEqual([]);          // cyclic aminal carbon
  expect(rules('NC(=O)N')).toEqual([]);          // urea (carbonyl carbon)
  expect(rules('c1ncncc1')).toEqual([]);         // aromatic carbon between two N
  expect(rules('CC(=N)N')).toEqual([]);          // amidine (imine carbon)
  expect(rules('COC(=O)N')).toEqual([]);         // carbamate
 });
});

describe('plausibility evidence from IR observations',()=>{
 const ir=(value:number,relativeIntensity:number|null):ObservedEvidence=>({id:`IR:x:${value}`,modality:'IR',signalId:String(value),sourceId:'x',value,unit:'cm-1',relativeIntensity,relativeIntegral:null,multiplicity:null,jHz:[],shape:'NARROW',uncertainty:null,origin:'MANUAL',userOverride:false,metadata:{},coverage:'PARTIAL',unknown:[]});
 it('marks N–O bands by presence and cumulated/ketene bands only when strong',()=>{
  const ev=buildPlausibilityEvidence({observations:[ir(950,10),ir(2140,90),ir(1700,100)],userFormula:null,nitrogenEvidence:true});
  expect(ev).toMatchObject({irNO:true,irNOxide:false,irCumulatedN:true,irKetene:true,nitrogenEvidence:true,userFormula:false});
  const weak=buildPlausibilityEvidence({observations:[ir(2140,20),ir(1700,100)],userFormula:'C2H6O2',nitrogenEvidence:false});
  expect(weak).toMatchObject({irCumulatedN:false,irKetene:false,userFormula:true});
  expect(buildPlausibilityEvidence({observations:[ir(2140,null)],userFormula:null,nitrogenEvidence:false}).irKetene).toBe(false);
 });
});
