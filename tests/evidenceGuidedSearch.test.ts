import {FormulaGenerator} from '../src/engines/candidateGeneration/formulaGenerator';
import {CandidateGenerator} from '../src/engines/candidateGenerator';
import {beforeAll,it,expect,vi} from 'vitest';
import {initializeRDKit} from '../src/engines/scientificEngines/rdkitAdapter';
import {searchMolecularGraphs} from '../src/engines/scientificEngines/deNovoGraphSearch';
import {ChemistryEngine} from '../src/engines/chemistryEngine';
beforeAll(()=>initializeRDKit());
it('incremental graph grammar handles atom budgets without a heavy-atom gate',()=>{
 for(const formula of ['C2H6O','C3H7N','C15H16O2']){
 const r=searchMolecularGraphs(formula,{timeMs:10000,maxStates:12000,maxResults:3,beamWidth:24,hints:{aromatic:formula==='C15H16O2'}});

 expect(r.smiles.length).toBeGreaterThan(0);
 for(const s of r.smiles)expect(ChemistryEngine.parseStructureInput(s).molecularFormula).toBe(formula);
 }
});

import {graphSearchHints} from '../src/engines/scientificEngines/deNovoGraphSearch';
import {WorkbenchOrchestrator} from '../src/engines/workbenchOrchestrator';
import {ChemicalFeatureEngine} from '../src/engines/chemicalFeatureEngine';
import {scoreScientificEvidence} from '../src/engines/scientificEngines/evidenceLedger';
import {generationStatus} from '../src/engines/candidateGeneration/generationStatus';
import {inferIRBands,IR_BAND_KNOWLEDGE,irBandMatch} from '../src/engines/scientificEngines/irBandKnowledge';
import {measureIRBandMorphology,prepareIR} from '../src/engines/scientificEngines/irSignalProcessing';
import {spectrum} from './fixtures';
import type {SpectralPeak} from '../src/types/spectrum';
const broad:SpectralPeak={id:'oh',x:3240.87,y:80,shape:'broad',userOverride:true,manualPeak:true};
it('a broad 3240 band supports hydrogen-bond OH, not confirmed amide; CO changes amide support',()=>{
 const nh=IR_BAND_KNOWLEDGE.find(k=>k.id==='amide-nh')!,oh=IR_BAND_KNOWLEDGE.find(k=>k.id==='oh-hbond')!;
 expect(irBandMatch(oh,broad,[broad])).toBeGreaterThan(irBandMatch(nh,broad,[broad]));
 const narrow={...broad,x:3340,shape:'sharp' as const},co={id:'co',x:1660,y:85};
 expect(irBandMatch(nh,narrow,[narrow])).toBeGreaterThan(irBandMatch(nh,{...narrow,shape:'broad'},[narrow]));
 expect(irBandMatch(nh,narrow,[narrow,co])).toBeGreaterThan(irBandMatch(nh,narrow,[narrow]));
 const findings=inferIRBands(spectrum('IR',[broad]));expect(findings.some(f=>f.family==='Alcohol')).toBe(true);expect(findings.some(f=>f.family==='Amide'&&f.matchLevel==='Strong')).toBe(false);
 expect(findings.every(f=>f.reasoning.includes('未提供確認'))).toBe(true);
});
it('actual sampled FWHM gives shape; manual broad/narrow override has no fabricated width',()=>{
 for(const sigma of [12,85]){
 const s=spectrum('IR',[],'Absorbance');s.points=Array.from({length:401},(_,i)=>({x:3100+i,y:Math.exp(-.5*((3100+i-3300)/sigma)**2)}));
 s.irManualSettings={enabled:true,direction:'UP',coordinateSpace:'PHYSICAL',intensityScale:'ABSORBANCE',anchors:[3100,3200,3300,3400,3500].map(x=>({x,y:0}))};
 const p={id:'p',x:3300,y:1,manualPeak:true};const m=measureIRBandMorphology(s,p);expect(m.shape).toBe(sigma===12?'sharp':'broad');expect(m.fwhm).toBeCloseTo(2.3548*sigma,0);
 const marked=WorkbenchOrchestrator.addManualPeak(s,{x:3300,y:1});const mark=marked.peaks.find(q=>q.x===3300)!;expect(mark.shape).toBe(m.shape);
 const forced={...p,shape:'broad' as const,userOverride:true};expect(measureIRBandMorphology(s,forced)).toEqual({shape:'broad'});
 s.peaks=[forced];expect(prepareIR(s).peaks.find(q=>q.id==='p')?.shape).toBe('broad');
 }
 const noCurve=spectrum('IR',[]);expect(measureIRBandMorphology(noCurve,broad).fwhm).toBeUndefined();expect(measureIRBandMorphology(noCurve,{...broad,userOverride:false,shape:'UNRESOLVED'}).shape).toBe('UNRESOLVED');
});
it('NMR guided graph route does not call formula enumeration or adopt a low-confidence locked guess',()=>{
 const h=spectrum('1H_NMR',[{id:'a',x:7.1,y:80,integration:2,multiplicity:'d',jValues:[8]},{id:'b',x:7.6,y:90,integration:2,multiplicity:'d',jValues:[8]}]);
 const bundle=ChemicalFeatureEngine.buildIntegratedBundle({'1H_NMR':h});bundle.constraints.molecularFormula={lockedFormula:'C2H2',candidates:[],confidence:1};
 const hints=graphSearchHints(bundle.constraints);expect(hints.aromatic).toBe(true);
 const r=searchMolecularGraphs(undefined,{hints,timeMs:600,maxResults:8});expect(r.smiles.length).toBeGreaterThan(1);
 const formulas=new Set(r.smiles.map(s=>ChemistryEngine.parseStructureInput(s).molecularFormula));expect(formulas.size).toBeGreaterThan(1);
 for(const s of r.smiles){const p=ChemistryEngine.parseStructureInput(s);expect(p.atomCounts.C).toBeGreaterThanOrEqual(6);expect(p.molecularFormula).not.toBe('C2H2');}
 const enumerate=vi.spyOn(FormulaGenerator,'enumeratePlausibleFormulas');const pipeline=CandidateGenerator.executeUnifiedPipelineFromBundle(bundle);expect(enumerate).not.toHaveBeenCalled();enumerate.mockRestore();expect(pipeline.solvedConstraintSpace.plausibleFormulas).toEqual([]);expect(pipeline.bundle.constraints.h1IntegrationSemantics?.inferredTotalProtons).toBeNull();
});
it('partial NMR ratios are scale-invariant and extra unmarked candidate hydrogens do not define the ratio denominator',()=>{
 const make=(k:number,ratio=3,j=7)=>ChemicalFeatureEngine.buildIntegratedBundle({'1H_NMR':spectrum('1H_NMR',[{id:'a',x:3.7,y:80,integration:2*k,multiplicity:'q',jValues:[j]},{id:'b',x:1.2,y:80,integration:ratio*k,multiplicity:'t',jValues:[7]}])});
 expect(scoreScientificEvidence('CCO',make(1)).totalScore).toBeCloseTo(scoreScientificEvidence('CCO',make(100)).totalScore,6);
 expect(scoreScientificEvidence('CCO',make(1)).totalScore).toBeGreaterThan(scoreScientificEvidence('CCO',make(1,8)).totalScore);
 expect(scoreScientificEvidence('CCO',make(1)).totalScore).toBeGreaterThan(scoreScientificEvidence('CCO',make(1,3,17)).totalScore);
 const p=WorkbenchOrchestrator.runModeAPipeline({'1H_NMR':spectrum('1H_NMR',[{id:'a',x:1.2,y:80,integration:200},{id:'b',x:3.7,y:80}])},{molecularFormula:'C2H6O'});
 expect(p.rankedCandidates.length).toBeGreaterThan(0);expect(p.validatedGraphs.every(g=>g.hardValidation.protonConsistency?.penaltyPoints===0)).toBe(true);
});
it('resource status preserves partial hypotheses and distinguishes time, state, chemistry and execution',()=>{
 const time=searchMolecularGraphs('C15H16O2',{timeMs:-1,hints:{aromatic:true}});expect(time.termination).toBe('TIME_BUDGET');
 const state=searchMolecularGraphs('C15H16O2',{maxStates:0,hints:{aromatic:true}});expect(state.termination).toBe('STATE_BUDGET');
 const c={confidence:0};expect(generationStatus(c,0,[],undefined,time).code).toBe('TIME_BUDGET');expect(generationStatus(c,0,[],undefined,state).code).toBe('STATE_BUDGET');
 expect(generationStatus(c,1,[],undefined,time).code).toBe('PARTIAL_CANDIDATES');expect(time.partialHypotheses.length).toBeGreaterThan(0);
 expect(generationStatus(c,0,[],'controlled failure').code).toBe('EXECUTION_ERROR');
 const local=searchMolecularGraphs(undefined,{hints:{oxygen:true,observedSignals:1}});expect(generationStatus(c,0,[],undefined,local).code).toBe('LOCAL_HYPOTHESES_ONLY');
});
it('an unmarked carbonyl region is not negative evidence and each actual observation is counted once',()=>{
 const s=spectrum('IR',[broad]);s.points=[];s.sourceFormat='MANUAL';
 const b=ChemicalFeatureEngine.buildIntegratedBundle({IR:s});const ledger=scoreScientificEvidence('CC(=O)N',b);
 expect(ledger.entries.filter(e=>e.sourceModality==='IR')).toHaveLength(1);expect(ledger.entries.some(e=>e.evidenceId.includes('coverage'))).toBe(false);
 expect(ledger.modalityScores['13C_NMR']).toBeNull();expect(ledger.modalityScores['1H_NMR']).toBeNull();
});

it('MS observed neutral mass uses actual ion/adduct/charge, not the first enumerated formula',()=>{
 const s=spectrum('MS',[{id:'m',x:51.007276466621,y:100}]);s.msParams={msType:'LC-MS',ionization:'ESI+',adductType:'[M+H]+',chargeState:2,ionAssignmentConfirmed:true,isHighResolution:true,massTolerancePpm:5,polarity:'Positive',conditionNotes:'controlled ion input'};
 const b=ChemicalFeatureEngine.buildIntegratedBundle({MS:s});expect(b.constraints.exactMass?.exactMass).toBeCloseTo(100,7);expect(b.scientificSources?.MS?.msParams?.conditionNotes).toBe('controlled ion input');
 s.msParams!.ionAssignmentConfirmed=false;expect(ChemicalFeatureEngine.buildIntegratedBundle({MS:s}).constraints.exactMass?.exactMass).toBeNull();
});
it('explicitly distinguish no matches in grammar, hard rejection, unsupported chemistry and execution error',()=>{
 const c={confidence:0},r=searchMolecularGraphs('C2H6O',{maxResults:1});
 expect(generationStatus(c,0,[],undefined,{...r,smiles:[],termination:'GRAMMAR_EXHAUSTED',rejectedByComposition:0}).code).toBe('NO_MATCH_WITHIN_SEARCH');
 expect(generationStatus(c,0,[],undefined,{...r,rejectedByComposition:1}).code).toBe('HARD_CONSTRAINT_CONFLICT');
 expect(generationStatus(c,0,[],undefined,{...r,smiles:[],termination:'BEAM_PRUNED'}).code).toBe('SEARCH_INCOMPLETE');
 expect(generationStatus(c,0,[],undefined,{...r,termination:'UNSUPPORTED_CHEMISTRY'}).code).toBe('SEARCH_LIMIT');
 expect(generationStatus(c,0,[],undefined,{...r,termination:'EXECUTION_ERROR',error:'controlled data error'}).message).toContain('controlled data error');
});


it('joint multiplicity, ratio and shared J form a local coupling hypothesis, not total H',()=>{
 const hint=(j:number,ratio:number)=>graphSearchHints(ChemicalFeatureEngine.buildIntegratedBundle({'1H_NMR':spectrum('1H_NMR',[{id:'q',x:3.6,y:80,integration:2,multiplicity:'q',jValues:[j]},{id:'t',x:1.2,y:90,integration:ratio,multiplicity:'t',jValues:[7]}])}).constraints);
 expect(hint(7,3).coupledEthyl).toBe(true);expect(hint(14,3).coupledEthyl).toBe(false);expect(hint(7,8).coupledEthyl).toBe(false);
 expect(generationStatus({contributingSources:[],confidence:0},0,[]).code).toBe('INPUT_MISSING');
});
