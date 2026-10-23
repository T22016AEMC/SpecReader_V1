import {beforeAll,describe,expect,it} from 'vitest';
import {spectrum} from './fixtures';
import {initializeRDKit} from '../src/engines/scientificEngines/rdkitAdapter';
import {WorkbenchOrchestrator} from '../src/engines/workbenchOrchestrator';
import {createReasoningPlan} from '../src/engines/reasoning/hypothesisGenerator';
import type {ExperimentalSpectrumData,SpectralPeak} from '../src/types/spectrum';

// Work 2 (v1.1.7-hotfix.1): tighter N-specific evidence. SYNTHETIC IR peak tables only.
beforeAll(()=>initializeRDKit());
type Mod=ExperimentalSpectrumData['modality'];
const mk=(mod:Mod,peaks:Partial<SpectralPeak>[]):ExperimentalSpectrumData=>spectrum(mod,peaks.map((p,i)=>({id:`${mod}-${i}`,manualPeak:true,y:50,...p})) as SpectralPeak[]);
const h1=()=>mk('1H_NMR',[{x:7.2,integration:2,multiplicity:'d',jValues:[8.5]},{x:6.8,integration:2,multiplicity:'d',jValues:[8.5]},{x:1.3,integration:9,multiplicity:'s'}]);
const mode=(ir:Partial<SpectralPeak>[])=>createReasoningPlan(WorkbenchOrchestrator.prepareModeAEvidence({'1H_NMR':h1(),IR:mk('IR',ir)},{}).bundle).nitrogenEvidence!;
// Acceptance A IR: alkyl-aromatic phenol-type bands with no N-specific feature.
const alkylAromaticIR=[{x:3300,y:70,isBroad:true,shape:'broad'},{x:3050,y:20},{x:2960,y:60},{x:2870,y:40},{x:1600,y:40},{x:1510,y:60},{x:1385,y:30},{x:1365,y:35},{x:1240,y:80},{x:830,y:50}] as Partial<SpectralPeak>[];

describe('nitro (acceptance C)',()=>{
 it('two strong bands of similar intensity count as N evidence',()=>{
  const m=mode([{x:3100,y:20},{x:1525,y:95},{x:1345,y:90},{x:850,y:40}]);
  expect(m.mode).toBe('EVIDENCE');
  expect(m.reasons.some(r=>r.text.includes('硝基'))).toBe(true);
 });
 it('the alkyl-aromatic pattern (1510 + 1360–1385) is not N evidence',()=>{
  expect(mode(alkylAromaticIR).mode).toBe('NONE');
  expect(mode([{x:1510,y:90},{x:1365,y:90},{x:2960,y:60}]).mode).toBe('NONE');
 });
 it('weak, unequal or intensity-less pairs are insufficient',()=>{
  expect(mode([{x:1525,y:20},{x:1345,y:20},{x:1700,y:100}]).mode).toBe('NONE');          // both weak
  expect(mode([{x:1525,y:100},{x:1345,y:40},{x:1700,y:90}]).mode).toBe('NONE');          // ratio 2.5
  expect(mode([{x:1525,intensityKnown:false},{x:1345,intensityKnown:false}]).mode).toBe('NONE');  // positions only
 });
});
describe('amide, amine doublet and nitrile',()=>{
 it('amide needs amide I, amide II and a sharp N–H stretch together',()=>{
  expect(mode([{x:3300,y:60},{x:1660,y:100},{x:1550,y:70}]).mode).toBe('EVIDENCE');
  expect(mode([{x:1660,y:100},{x:1550,y:70}]).mode).toBe('NONE');                          // no N–H
  expect(mode([{x:3300,y:60,isBroad:true,shape:'broad'},{x:1660,y:100},{x:1550,y:70}]).mode).toBe('NONE');  // broad X–H is ambiguous
  expect(mode([{x:3300,y:60},{x:1660,y:100}]).mode).toBe('NONE');                          // no amide II
 });
 it('a primary-amine doublet needs two sharp bands',()=>{
  expect(mode([{x:3420,y:50},{x:3340,y:50},{x:1620,y:60}]).mode).toBe('EVIDENCE');
  expect(mode([{x:3420,y:50,isBroad:true,shape:'broad'},{x:3340,y:50,isBroad:true,shape:'broad'}]).mode).toBe('NONE');
  expect(mode([{x:3420,y:2},{x:3340,y:2},{x:1240,y:100}]).mode).toBe('NONE');              // negligible bands
 });
 it('a marked C≡N band is still evidence',()=>{
  expect(mode([{x:2229,y:60},{x:3060,y:20}]).mode).toBe('EVIDENCE');
 });
 it('acceptance A IR gives no N evidence',()=>{
  const m=mode(alkylAromaticIR);
  expect(m.mode).toBe('NONE');
  expect(m.allowed).toBe(false);
 });
});
