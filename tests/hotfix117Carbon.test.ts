import {beforeAll,describe,expect,it} from 'vitest';
import {spectrum} from './fixtures';
import {initializeRDKit} from '../src/engines/scientificEngines/rdkitAdapter';
import {WorkbenchOrchestrator} from '../src/engines/workbenchOrchestrator';
import {createReasoningPlan} from '../src/engines/reasoning/hypothesisGenerator';
import {inferComposition} from '../src/engines/composition/inferComposition';
import {COMPOSITION_CONFIG} from '../src/engines/composition/compositionConfig';
import type {ExperimentalSpectrumData,SpectralPeak} from '../src/types/spectrum';

// 1H-only carbon estimate (v1.1.7-hotfix.1). Generic SYNTHETIC peak tables written for these tests; each class's true
// carbon count must fall inside the estimated range of the multiple k whose H count k·S matches the true H count
// (e.g. integrals 4:4:2:6 reduce to 2:2:1:3, S = 8, so H16 is k = 2).
beforeAll(()=>initializeRDKit());
const h1=(peaks:Partial<SpectralPeak>[]):ExperimentalSpectrumData=>spectrum('1H_NMR',peaks.map((p,i)=>({id:`h-${i}`,manualPeak:true,y:50,...p})) as SpectralPeak[]);
const infer=(s:ExperimentalSpectrumData)=>{
 const prepared=WorkbenchOrchestrator.prepareModeAEvidence({'1H_NMR':s},{});
 const plan=createReasoningPlan(prepared.bundle);
 return inferComposition({bundle:prepared.bundle,observations:plan.observations,userFormula:null,nitrogen:plan.nitrogenEvidence});
};
const cases:{name:string;trueC:number;trueH:number;peaks:Partial<SpectralPeak>[]}[]=[
 // tert-butylbenzene type: 5 aromatic H + a 9H singlet (three equivalent CH3 on an invisible quaternary C). C10H14.
 {name:'tert-butylbenzene type (9H singlet)',trueC:10,trueH:14,peaks:[{x:7.38,integration:2,multiplicity:'d',jValues:[7.8]},{x:7.31,integration:2,multiplicity:'t',jValues:[7.8]},{x:7.18,integration:1,multiplicity:'t',jValues:[7.8]},{x:1.32,integration:9,multiplicity:'s'}]},
 // symmetric disubstituted benzenes: two 4H doublets, a 2H bridge singlet and a 6H singlet. C15H16.
 {name:'symmetric disubstituted benzenes (two 4H doublets)',trueC:15,trueH:16,peaks:[{x:7.06,integration:4,multiplicity:'d',jValues:[8.1]},{x:6.98,integration:4,multiplicity:'d',jValues:[8.1]},{x:3.86,integration:2,multiplicity:'s'},{x:2.3,integration:6,multiplicity:'s'}]},
 // bi-aryl with a 6H methyl singlet: two 4H aromatic signals and 6H of equivalent CH3. C14H14.
 {name:'bi-aryl with a 6H methyl singlet',trueC:14,trueH:14,peaks:[{x:7.48,integration:4,multiplicity:'d',jValues:[8.0]},{x:7.23,integration:4,multiplicity:'d',jValues:[8.0]},{x:2.38,integration:6,multiplicity:'s'}]},
];

describe('1H-only carbon estimate',()=>{
 for(const c of cases)it(`${c.name}: true C = ${c.trueC} is inside the estimate for the matching k`,()=>{
  const r=infer(h1(c.peaks));
  expect(r.status).toBe('INFERRED');
  const S=r.bounds.hydrogenMultiples![0],k=c.trueH/S;
  expect(Number.isInteger(k)&&k>=1&&k<=COMPOSITION_CONFIG.h1OnlyMaxMultiple).toBe(true);
  const sameK=r.hypotheses.filter(h=>h.symmetryMultiple===k);
  const cs=sameK.map(h=>h.counts.C??0);
  expect(Math.min(...cs)).toBeLessThanOrEqual(c.trueC);
  expect(Math.max(...cs)).toBeGreaterThanOrEqual(c.trueC);
  expect(r.bounds.carbon![0]).toBeLessThanOrEqual(c.trueC);
  expect(r.bounds.carbon![1]).toBeGreaterThanOrEqual(c.trueC);
  // k·S equals the true H count here, so the true CxHy formula is enumerated (v1.1.6 capped k = 1 at C ≤ V + 4 and missed it).
  expect(r.hypotheses.some(h=>h.counts.C===c.trueC&&h.counts.H===c.trueH&&!h.counts.O&&!h.counts.N)).toBe(true);
 });
 it('caps the enumerated formulas and reports the cut',()=>{
  // A wide synthetic case: many signals with large integrals widen the carbon range and the formula count.
  const r=infer(h1([{x:7.3,integration:10,multiplicity:'m'},{x:4.4,integration:4,multiplicity:'q',jValues:[7]},{x:3.9,integration:6,multiplicity:'s'},{x:2.6,integration:8,multiplicity:'m'},{x:1.4,integration:12,multiplicity:'t',jValues:[7]},{x:6.1,integration:1,multiplicity:'br s',isBroad:true}]));
  expect(r.enumeration.droppedByKeepLimit).toBeGreaterThan(0);
  expect(r.limitations.some(l=>l.includes(`超過上限 ${COMPOSITION_CONFIG.h1OnlyMaxCandidateFormulas}`))).toBe(true);
  expect(r.hypotheses.length).toBeLessThanOrEqual(COMPOSITION_CONFIG.maxHypotheses);
 });
});
