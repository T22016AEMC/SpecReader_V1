import {beforeAll,it,expect,vi} from 'vitest';
import {spectrum} from './fixtures';
import {initializeRDKit,depictMolecule} from '../src/engines/scientificEngines/rdkitAdapter';
import {ChemistryEngine} from '../src/engines/chemistryEngine';
import {ChemicalFeatureEngine} from '../src/engines/chemicalFeatureEngine';
import {createReasoningPlan} from '../src/engines/reasoning/hypothesisGenerator';
import {executeSixStepAnalysis,planningSearchHints} from '../src/engines/reasoning/sixStepAnalysis';
import {searchMolecularGraphsAsync,graphSearchHints} from '../src/engines/scientificEngines/deNovoGraphSearch';
import {FormulaGenerator} from '../src/engines/candidateGeneration/formulaGenerator';
import type {AnalysisProgress} from '../src/engines/reasoning/types';
beforeAll(()=>initializeRDKit());
const aromatic=(scale=1,j=8)=>spectrum('1H_NMR',[
 {id:'a',x:6.9,y:80,integration:2*scale,multiplicity:'d',jValues:[j],manualPeak:true},
 {id:'b',x:7.3,y:90,integration:2*scale,multiplicity:'d',jValues:[j],manualPeak:true},
]);
it('actual observed roots preserve conditions, unknown precision and partial coverage',()=>{
 const h=aromatic();h.nmrSolvent='DMSO-d6';h.spectrometerFrequencyMHz=400;
 const plan=createReasoningPlan(ChemicalFeatureEngine.buildIntegratedBundle({'1H_NMR':h}));
 expect(plan.observations).toHaveLength(2);expect(plan.userFormula).toBeNull();
 expect(plan.observations.every(o=>o.origin==='MANUAL'&&o.coverage==='PARTIAL'&&o.uncertainty===null)).toBe(true);
 expect(plan.observations[0].metadata).toMatchObject({solvent:'DMSO-d6',frequencyMHz:400});
 expect(plan.hypotheses.every(p=>p.observationIds.length&&p.observationIds.every(id=>plan.observations.some(o=>o.id===id)))).toBe(true);
});
it('relative equality and J create competing substitution graphs, never absolute hydrogen counts',()=>{
 const plan=(scale:number,j:number)=>createReasoningPlan(ChemicalFeatureEngine.buildIntegratedBundle({'1H_NMR':aromatic(scale,j)}));
 const p=plan(1,8),scaled=plan(100,8),weak=plan(1,2);
 expect(p.hypotheses.find(h=>h.kind==='ARYL_PARA')?.level).toBe('SUPPORTED');
 expect(weak.hypotheses.find(h=>h.kind==='ARYL_PARA')?.level).toBe('POSSIBLE');
 expect(p.hypotheses.map(h=>h.kind)).toEqual(scaled.hypotheses.map(h=>h.kind));
 for(const kind of ['ARYL_PARA','ARYL_META','ARYL_ORTHO']){
  const l=p.localStructures.find(l=>l.kind===kind)!;expect(l.atoms).toHaveLength(6);expect(l.bonds).toHaveLength(6);expect(l.ports).toHaveLength(6);
  expect(l.observationIds).toHaveLength(2);expect(l.status).toBe('LOCAL_HYPOTHESIS');expect(l.constraintStrength).toBe('SOFT');
 }
 expect(p.localStructures.find(l=>l.kind==='AROMATIC')?.substitutionSites).toBeUndefined();
 expect(p.localStructures.some(l=>l.relations.some(r=>r.kind==='SUPPORTED_CONNECTION'))).toBe(false);
 const aromaticOnly=p.hypotheses.filter(h=>h.description.includes('芳香／雜芳香'));
 expect(aromaticOnly.some(h=>h.kind==='NITROGENATED')).toBe(false);
});
it('coupling hypotheses need shift, ratio, multiplicity and compatible J together',()=>{
 const plan=(ratio=3,j=7)=>createReasoningPlan(ChemicalFeatureEngine.buildIntegratedBundle({'1H_NMR':spectrum('1H_NMR',[
  {id:'q',x:3.6,y:80,integration:2,multiplicity:'q',jValues:[j]}, {id:'t',x:1.2,y:90,integration:ratio,multiplicity:'t',jValues:[7]},
 ])}));
 expect(plan().localStructures.some(l=>l.kind==='ETHYL'&&l.bonds.length===1)).toBe(true);
 expect(plan(8).localStructures.some(l=>l.kind==='ETHYL')).toBe(false);expect(plan(3,17).localStructures.some(l=>l.kind==='ETHYL')).toBe(false);
 const c=createReasoningPlan(ChemicalFeatureEngine.buildIntegratedBundle({'13C_NMR':spectrum('13C_NMR',[{id:'c',x:205,y:80,integration:100}])}));
 expect(c.hypotheses.some(h=>h.kind==='CARBONYL')).toBe(true);
 expect(c.localStructures.every(l=>l.atoms.length<100)).toBe(true);expect(c.observations[0].relativeIntegral).toBe(100);
});
it('local atom/bond graphs actually seed assembly; canonical graph determines formula',async()=>{
 const b=ChemicalFeatureEngine.buildIntegratedBundle({'1H_NMR':aromatic()}),plan=createReasoningPlan(b);
 const result=await searchMolecularGraphsAsync(undefined,{hints:planningSearchHints(plan,graphSearchHints(b.constraints)),timeMs:2000,maxResults:16});
 expect(result.smiles.length).toBeGreaterThan(1);
 expect(new Set(result.smiles.map(s=>ChemistryEngine.parseStructureInput(s).molecularFormula)).size).toBeGreaterThan(1);
 const derived=Object.entries(result.derivations!).filter(([,d])=>d.localStructureIds.length);
 expect(derived.length).toBeGreaterThan(0);
 for(const [s,d] of derived){expect(ChemistryEngine.parseStructureInput(s).atomCounts.C).toBeGreaterThanOrEqual(6);expect(d.observationIds.length).toBeGreaterThan(0);expect(d.localStructureIds.every(id=>plan.localStructures.some(l=>l.id===id))).toBe(true);}
});
it('cooperative search accepts cancellation and retains already validated partial graphs',async()=>{
 let cancel=false,ticks=0;
 const result=await searchMolecularGraphsAsync('C8H10',{timeMs:5000,maxResults:100,hints:{aromatic:true},onProgress:p=>{ticks++;if(p.candidateCount>0)cancel=true;},shouldCancel:()=>cancel});
 expect(ticks).toBeGreaterThan(1);expect(result.termination).toBe('CANCELLED');expect(result.smiles.length).toBeGreaterThan(0);
 for(const s of result.smiles)expect(ChemistryEngine.parseStructureInput(s).molecularFormula).toBe('C8H10');
 expect(result.complete).toBe(false);expect(result.frontierPeak).toBeLessThanOrEqual(4096);
 const pre=await searchMolecularGraphsAsync('C15H16O2',{hints:{aromatic:true},shouldCancel:()=>true});expect(pre.termination).toBe('CANCELLED');
});
it('evidence-seeded fragment joins handle a 17-heavy-atom composition without a size rejection',async()=>{
 const ir=spectrum('IR',[{id:'oh',x:3300,y:80,shape:'broad',userOverride:true,manualPeak:true}]);ir.points=[];
 const b=ChemicalFeatureEngine.buildIntegratedBundle({IR:ir,'1H_NMR':aromatic()},undefined,{molecularFormula:'C15H16O2'}),p=createReasoningPlan(b);
 const r=await searchMolecularGraphsAsync(p.userFormula!,{hints:planningSearchHints(p,graphSearchHints(b.constraints)),timeMs:5000,maxResults:2,beamWidth:24,maxStates:20000});
 expect(ChemistryEngine.calculateDBE(ChemistryEngine.parseFormulaCounts(p.userFormula!))).toBe(8);
 expect(r.smiles.length).toBeGreaterThan(0);
 for(const s of r.smiles){const graph=ChemistryEngine.parseStructureInput(s);expect(graph.molecularFormula).toBe('C15H16O2');expect(graph.atomCounts.C+graph.atomCounts.O).toBe(17);}
 expect(Object.values(r.derivations!).some(d=>d.localStructureIds.length&&d.operations.some(op=>op.startsWith('join ')))).toBe(true);
});
it('six stages pass actual IDs into assembly and independent candidate evidence, without formula enumeration',async()=>{
 const stages:AnalysisProgress[]=[];const enumerate=vi.spyOn(FormulaGenerator,'enumeratePlausibleFormulas');
 const h=spectrum('1H_NMR',[{id:'q',x:3.6,y:80,integration:2,multiplicity:'q',jValues:[7]},{id:'t',x:1.2,y:100,integration:3,multiplicity:'t',jValues:[7]}]);
 const result=await executeSixStepAnalysis({spectra:{'1H_NMR':h},extraInput:{molecularFormula:'C2H6O'}},{timeMs:1800,onProgress:p=>stages.push(p)});
 expect(enumerate).not.toHaveBeenCalled();enumerate.mockRestore();
 expect([...new Set(stages.map(p=>p.step))]).toEqual([1,2,3,4,5,6]);
 const trace=result.reasoningTrace!;expect(trace.stages).toHaveLength(6);expect(trace.userFormula).toBe('C2H6O');expect(trace.candidates.length).toBeGreaterThan(0);
 expect(trace.stages[1].inputIds).toEqual(trace.stages[0].outputIds);
 expect(trace.stages[2].inputIds).toEqual(trace.stages[1].outputIds);expect(trace.stages[3].inputIds).toEqual(trace.stages[2].outputIds);
 expect(trace.candidates.some(c=>c.assembly?.localStructureIds.length)).toBe(true);
 for(const c of trace.candidates){expect(ChemistryEngine.parseStructureInput(c.smiles).molecularFormula).toBe('C2H6O');expect(c.formula).toBe('C2H6O');
  const roots=c.evidence.filter(e=>e.modality!=='FORMULA').flatMap(e=>e.observationIds);expect(roots.filter(id=>!trace.observations.some(o=>o.id===id))).toEqual([]);expect(roots.length).toBe(new Set(roots).size);
  expect(c.evidence.every(e=>e.modality==='1H_NMR'||e.modality==='FORMULA')).toBe(true);
  expect(c.evidence.find(e=>e.modality==='FORMULA')?.observationIds).toEqual(['user-formula']);
 }
});
it('RDKit depicts the full actual graph and positional isomers, rejecting invalid or partial complete structures',()=>{
 const structures=['CCOc1ccc(C(=O)O)cc1','CCOc1cc(C(=O)O)ccc1','NCC(=O)O'];
 const drawings=structures.map(s=>depictMolecule(s));
 for(let i=0;i<drawings.length;i++){const d=drawings[i],g=ChemistryEngine.parseStructureInput(structures[i]);expect(d.error).toBeNull();expect(d.svg).toContain('<svg');expect(d.bondCount).toBeGreaterThan(0);expect(d.atomCount).toBe(Object.entries(g.atomCounts).reduce((n,[e,c])=>n+(e==='H'?0:c),0));expect(d.svg).not.toMatch(/>R</);}
 expect(drawings[0].svg).not.toBe(drawings[1].svg);
 expect(depictMolecule('C(C)(C)(C)(C)C').error).toBeTruthy();expect(depictMolecule('*CC').error).toBeTruthy();expect(depictMolecule('*CC',320,210,true).error).toBeNull();
});
