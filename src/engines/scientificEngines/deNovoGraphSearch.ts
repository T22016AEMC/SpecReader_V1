import type {LocalStructureHypothesis,AssemblyDerivation} from '../reasoning/types';
import {ChemistryEngine} from '../chemistryEngine';
import {canonicalizeMolecule,rdkitStatus} from './rdkitAdapter';
import type {StructuralConstraints} from '../../types/spectrum';
export type SearchTermination='OUTPUT_BUDGET'|'TIME_BUDGET'|'STATE_BUDGET'|'BEAM_PRUNED'|'GRAMMAR_EXHAUSTED'|'INSUFFICIENT_CONSTRAINTS'|'UNSUPPORTED_CHEMISTRY'|'INVALID_COMPOSITION'|'UNAVAILABLE'|'EXECUTION_ERROR'|'CANCELLED';
export interface GraphSearchHints {aromatic?:boolean;carbonyl?:boolean;oxygen?:boolean;nitrogen?:boolean;observedSignals?:number;coupledEthyl?:boolean;couplingNotes?:string[];neutralMass?:number;massTolerance?:number;localStructures?:LocalStructureHypothesis[]}
export interface DeNovoSearchResult {smiles:string[];status:'BOUNDED'|'UNSUPPORTED'|'UNAVAILABLE';visited:number;note:string;termination:SearchTermination;complete:boolean;partialHypotheses:string[];rejectedByComposition:number;error?:string;derivations?:Record<string,AssemblyDerivation>;elapsedMs?:number;frontierPeak?:number}
export interface GraphSearchOptions {maxResults?:number;maxStates?:number;timeMs?:number;beamWidth?:number;hints?:GraphSearchHints;maxFrontier?:number;shouldCancel?:()=>boolean;onProgress?:(p:GraphSearchProgress)=>void}
export interface GraphSearchProgress {visited:number;candidateCount:number;elapsedMs:number;frontier:number}
type Edge={a:number;b:number;order:number};
type Graph={atoms:string[];edges:Edge[];rings:number;aromaticRings:number;localIds?:string[];operations?:string[];observationIds?:string[];placements?:{localId:string;map:number[]}[]};
const valence:Record<string,number>={C:4,N:3,O:2,F:1,Cl:1,Br:1};
function molBlock(g:Graph):string {
 const pad=(n:number)=>String(n).padStart(3,' ');
 return ['SpecReader graph growth','  SpecReader','',`${pad(g.atoms.length)}${pad(g.edges.length)}  0  0  0  0            999 V2000`,...g.atoms.map((a,i)=>`${(i*1.5).toFixed(4).padStart(10)}    0.0000    0.0000 ${a.padEnd(3)} 0  0  0  0  0  0  0  0  0  0  0`),...g.edges.map(e=>`${pad(e.a+1)}${pad(e.b+1)}${pad(e.order)}  0  0  0  0`),'M  END'].join('\n');
}
const degree=(g:Graph,i:number)=>g.edges.reduce((s,e)=>s+(e.a===i||e.b===i?e.order:0),0);
const hydrogen=(g:Graph)=>g.atoms.reduce((s,a,i)=>s+valence[a]-degree(g,i),0);
const unsaturation=(g:Graph)=>g.edges.reduce((s,e)=>s+e.order,0)-g.atoms.length+1;
function counts(g:Graph):Record<string,number>{const c:Record<string,number>={};for(const a of g.atoms)c[a]=(c[a]??0)+1;return c;}
// WL colours prune equivalent expansion sites; final RDKit canonicalization is authoritative.
function colours(g:Graph):string[]{let c=g.atoms.map((a,i)=>a+degree(g,i));for(let k=0;k<3;k++){const labels=c.map((v,i)=>v+'('+g.edges.flatMap(e=>e.a===i?[e.order+':'+c[e.b]]:e.b===i?[e.order+':'+c[e.a]]:[]).sort().join(',')+')');const unique=[...new Set(labels)].sort();c=labels.map(v=>String(unique.indexOf(v)));}return c;}
function signature(g:Graph):string {const c=colours(g);return g.atoms.map((a,i)=>a+c[i]).sort().join(',')+'|'+g.edges.map(e=>[c[e.a],c[e.b]].sort().join('-')+':'+e.order).sort().join(',')+'|'+(g.placements??[]).map(p=>p.localId).sort().join(',');}
function ring(g:Graph,attach?:number):Graph {const n=g.atoms.length,edges=[...g.edges];for(let i=0;i<6;i++)edges.push({a:n+i,b:n+(i+1)%6,order:i%2?1:2});if(attach!==undefined)edges.push({a:attach,b:n,order:1});return {...g,atoms:[...g.atoms,...Array<string>(6).fill('C')],edges,rings:g.rings+1,aromaticRings:g.aromaticRings+1,operations:[...(g.operations??[]),`attach aromatic six-carbon primitive at ${attach??'seed'}`].slice(-32)};}
export function graphSearchHints(c:StructuralConstraints):GraphSearchHints {
 const h=c.protonEnvironments??[],carbon=c.carbonEnvironments??[],groups=(c.functionalGroups??[]).filter(g=>!['EXCLUDED','FORBIDDEN'].includes(g.status)).map(g=>[g.groupFamily,g.groupName,g.label].join(' ')).join(' ');
 const ethyl=h.some(q=>q.multiplicity==='q'&&q.integration!=null&&q.integration>0&&q.shiftPpm<4.5&&h.some(t=>t.multiplicity==='t'&&t.shiftPpm<2.5&&t.integration!=null&&t.integration>0&&Math.abs(q.integration!/t.integration-2/3)<.15&&q.jCouplingHz.some(j=>t.jCouplingHz.some(k=>Math.abs(j-k)<1.5))));
 const couplingNotes=ethyl?['相容 q/t、相對積分約 2:3 與共同 J 支持乙基局部連接（不確認總氫數或完整分子）']:[];
 return {coupledEthyl:ethyl,couplingNotes,aromatic:h.filter(e=>e.shiftPpm>=6.3&&e.shiftPpm<=8.3).length>=2||carbon.filter(e=>e.shiftPpm>=110&&e.shiftPpm<=160).length>=2,carbonyl:carbon.some(e=>e.shiftPpm>=160)||/carbonyl|ketone|ester|amide|aldehyde|羰|酮|酯|醯胺|醛/i.test(groups),oxygen:/alcohol|phenol|ether|ester|acid|O–H|羥|醇|酚|醚|酸/i.test(groups)||h.some(e=>e.shiftPpm>=3.1&&e.shiftPpm<=4.5),nitrogen:/amine|amide|nitrile|nitro|胺|腈|硝/i.test(groups),observedSignals:Math.max(h.length,carbon.length),neutralMass:c.molecularMassConstraint?.exactMass??c.exactMass?.exactMass??c.estimatedMolecularWeight??undefined,massTolerance:c.molecularMassConstraint?.toleranceDa??c.exactMass?.toleranceDa??1};
}
/** Chemical graph grammar: valence-limited atom attachment, bond augmentation,
 * closure and six-carbon aromatic motif attachment. Beam pruning bounds memory;
 * budgets bound work, never declare a molecular size chemically impossible.
 * This grammar is a non-exhaustive constitutional search, not a general enumerator.
 * With no composition, graphs are local representative hypotheses, not measured formulae.
 */
function* iterateGraphSearch(formula:string|undefined,options:GraphSearchOptions={}):Generator<GraphSearchProgress,DeNovoSearchResult> {
 const started=performance.now();
 const hints=options.hints??{},r:DeNovoSearchResult={smiles:[],status:'BOUNDED',visited:0,note:'',termination:'GRAMMAR_EXHAUSTED',complete:false,partialHypotheses:[...(hints.couplingNotes??[]),...(hints.aromatic?['芳香六碳環／取代環假設（不是完整分子確認）']:[]),...(hints.carbonyl?['羰基局部環境，種類待比較']:[]),...(hints.oxygen?['含氧或相近位移的競爭局部環境']:[])],rejectedByComposition:0,derivations:{},frontierPeak:0};
 const finish=(termination:SearchTermination):DeNovoSearchResult=>{r.termination=termination;r.elapsedMs=performance.now()-started;r.note=`增量原子／芳香片段圖搜尋：${r.visited} states；${termination}；${r.smiles.length} 個有效圖。僅搜尋中性 C/N/O/F/Cl/Br、非稠合六員芳環／鏈／有限閉環；未搜尋所有異構物。`;return r;};
 if(!rdkitStatus().available){r.status='UNAVAILABLE';return finish('UNAVAILABLE');}
 const target=formula?ChemistryEngine.parseFormulaCounts(formula):null;
 if(target&&(!Object.keys(target).length||Object.keys(target).some(e=>e!=='H'&&!valence[e]))){r.status='UNSUPPORTED';return finish('UNSUPPORTED_CHEMISTRY');}
 const heavy=target?Object.entries(target).reduce((s,[e,n])=>s+(e==='H'?0:n),0):null;
 const targetDBE=target?ChemistryEngine.calculateDBE(target):null;
 if(target&&(heavy===0||(targetDBE??0)<0||!Number.isInteger(targetDBE)))return finish('INVALID_COMPOSITION');
 if(!target&&!hints.neutralMass&&(hints.observedSignals??0)<2)return finish('INSUFFICIENT_CONSTRAINTS');
 const maxFrontier=options.maxFrontier??4096,maxStates=options.maxStates??12000,maxResults=options.maxResults??24,beamWidth=options.beamWidth??48,deadline=performance.now()+(options.timeMs??500);
 // Depth is an explicit search budget when composition is unknown, not an inferred formula.
 const depth=heavy??Math.max(hints.aromatic?7:3,Math.max((hints.observedSignals??0)*2+2,hints.neutralMass?Math.floor(hints.neutralMass/12):0));
 const allowed=target?Object.keys(target).filter(e=>e!=='H'):['C',...(hints.oxygen||hints.carbonyl||hints.neutralMass?['O']:[]),...(hints.nitrogen||hints.neutralMass?['N']:[])];
 const locals=hints.localStructures??[];
 const seen=new Set<string>(),canonicalSeen=new Set<string>();let pruned=false;
 const feasible=(g:Graph)=>{const c=counts(g),d=unsaturation(g);return g.atoms.length<=depth&&g.atoms.every((a,i)=>degree(g,i)<=valence[a])&&(!target||Object.entries(c).every(([e,n])=>n<=(target[e]??0))&&d<=targetDBE!);};
 const localPriority=(g:Graph)=>{
  const supports=new Map<string,number>();
  for(const placement of g.placements??[]){const l=locals.find(v=>v.id===placement.localId);if(!l)continue;
   let value=4;
   if(l.substitutionSites&&l.atoms.length===6){const outside=placement.map.filter(atom=>g.edges.some(e=>(e.a===atom&&!placement.map.includes(e.b))||(e.b===atom&&!placement.map.includes(e.a)))).map(atom=>placement.map.indexOf(atom));
    if(outside.length===2){const d=Math.min(Math.abs(outside[0]-outside[1]),6-Math.abs(outside[0]-outside[1]));value=d===Math.abs(l.substitutionSites[1]-l.substitutionSites[0])?(l.supportLevel==='SUPPORTED'?16:10):-4;}
   }
   const group=l.observationIds.slice().sort().join('|');supports.set(group,Math.max(supports.get(group)??-10,value));
  }
  return [...supports.values()].reduce((n,v)=>n+v,0);
 };
 const score=(g:Graph)=>{const co=g.edges.some(e=>e.order===2&&((g.atoms[e.a]==='C'&&g.atoms[e.b]==='O')||(g.atoms[e.b]==='C'&&g.atoms[e.a]==='O')));const ethyl=g.atoms.some((a,i)=>a==='C'&&valence.C-degree(g,i)===3&&g.edges.some(e=>(e.a===i||e.b===i)&&e.order===1&&g.atoms[e.a===i?e.b:e.a]==='C'&&valence.C-degree(g,e.a===i?e.b:e.a)===2));return localPriority(g)+(hints.coupledEthyl&&ethyl?8:0)+(hints.aromatic?Math.min(1,g.aromaticRings)*20:0)+(hints.carbonyl&&co?15:0)+(target?Math.min(unsaturation(g),targetDBE!)*2:0)+g.atoms.length*.1;};

 let beam:Graph[]=allowed.map(a=>({atoms:[a],edges:[],rings:0,aromaticRings:0}));if((targetDBE??0)>=4||hints.aromatic){const g=ring({atoms:[],edges:[],rings:0,aromaticRings:0});if(feasible(g))beam.push(g);}
 for(const l of locals){const g:Graph={atoms:l.atoms.map(a=>a.element),edges:l.bonds.map(b=>({...b})),rings:l.atoms.length>=6?1:0,aromaticRings:l.atoms.length>=6?1:0,localIds:[l.id],operations:[`seed ${l.id}: ${l.description}`],observationIds:l.observationIds,placements:[{localId:l.id,map:l.atoms.map((_,i)=>i)}]};if(feasible(g))beam.push(g);}
 yield {visited:0,candidateCount:0,elapsedMs:0,frontier:beam.length};

 try {
 for(let generation=0;beam.length&&generation<depth*3;generation++){
  const next=new Map<string,Graph>();
  const enqueue=(g:Graph)=>{if(performance.now()>deadline||next.size>=maxFrontier){pruned=true;return;}if(!feasible(g))return;const key=signature(g);if(seen.has(key)||next.has(key))return;next.set(key,g);};
  for(const g of beam){
   if(options.shouldCancel?.())return finish('CANCELLED');
   if(r.visited%16===0)yield {visited:r.visited,candidateCount:r.smiles.length,elapsedMs:performance.now()-started,frontier:beam.length};
   if(performance.now()>deadline)return finish('TIME_BUDGET');if(++r.visited>maxStates)return finish('STATE_BUDGET');
   const c=counts(g),exact=target?g.atoms.length===heavy&&hydrogen(g)===(target.H??0)&&Object.entries(target).every(([e,n])=>e==='H'||c[e]===n):g.atoms.length>=(hints.aromatic?6:Math.max(2,hints.observedSignals??2));
   if(exact){const m=canonicalizeMolecule(molBlock(g));if(m.valid&&!canonicalSeen.has(m.canonical)){canonicalSeen.add(m.canonical);const parsed=ChemistryEngine.parseStructureInput(m.canonical);if((!target||parsed.molecularFormula===ChemistryEngine.formatFormula(target))&&(!hints.neutralMass||Math.abs(parsed.exactMass-hints.neutralMass)<=(hints.massTolerance??1))){r.smiles.push(m.canonical);r.derivations![m.canonical]={localStructureIds:[...new Set(g.localIds??[])],operations:g.operations??['incremental atom/bond expansion'],observationIds:[...new Set(g.observationIds??[])]};if(r.smiles.length>=maxResults)return finish('OUTPUT_BUDGET');}else r.rejectedByComposition++;}}
   const cs=colours(g),sites=new Set<string>();
   for(let i=0;i<g.atoms.length;i++){
    const free=valence[g.atoms[i]]-degree(g,i);if(!free||sites.has(g.atoms[i]+cs[i]))continue;sites.add(g.atoms[i]+cs[i]);
    for(const a of allowed)for(let order=1;order<=Math.min(3,free,valence[a]);order++){
     if(order>1&&(!target&&!hints.carbonyl&&a==='O'))continue;
     enqueue({...g,atoms:[...g.atoms,a],edges:[...g.edges,{a:i,b:g.atoms.length,order}],operations:[...(g.operations??[]),`atom ${a} via bond ${order} at ${i}`].slice(-32)});
    }
    for(const l of locals){
     // Competing interpretations of the same observation are separate branches.
     if((g.observationIds??[]).some(id=>l.observationIds.includes(id))&&!(g.localIds??[]).includes(l.id))continue;
     for(const port of l.ports){const offset=g.atoms.length;
      enqueue({...g,atoms:[...g.atoms,...l.atoms.map(a=>a.element)],edges:[...g.edges,...l.bonds.map(b=>({a:b.a+offset,b:b.b+offset,order:b.order})),{a:i,b:offset+port.atom,order:1}],rings:g.rings+(l.atoms.length>=6?1:0),aromaticRings:g.aromaticRings+(l.atoms.length>=6?1:0),localIds:[...new Set([...(g.localIds??[]),l.id])],observationIds:[...new Set([...(g.observationIds??[]),...l.observationIds])],placements:[...(g.placements??[]),{localId:l.id,map:l.atoms.map((_,k)=>offset+k)}],operations:[...(g.operations??[]),`join ${l.id} port ${port.atom} to atom ${i}; connection hypothesis, not measured bond`].slice(-32)});
     }
    }
    if(((targetDBE??0)-unsaturation(g)>=4||!target&&hints.aromatic)&&g.atoms[i]==='C')enqueue(ring(g,i));
   }
   // Bond order growth is needed after atom budgets are filled.
   for(let j=0;j<g.edges.length;j++){const e=g.edges[j];if(e.order>=3||(g.placements??[]).some(p=>locals.find(l=>l.id===p.localId)?.bonds.some(b=>(p.map[b.a]===e.a&&p.map[b.b]===e.b)||(p.map[b.a]===e.b&&p.map[b.b]===e.a))))continue;enqueue({...g,edges:g.edges.map((v,k)=>k===j?{...v,order:v.order+1}:v)});}
   // Sparse ring closure, bounded by free valence. Fused systems remain unsupported.
   if(g.rings===0)for(let a=0;a<g.atoms.length;a++)for(let b=a+3;b<g.atoms.length;b++)if(!g.edges.some(e=>e.a===a&&e.b===b||e.b===a&&e.a===b))enqueue({...g,rings:1,edges:[...g.edges,{a,b,order:1}]});
  }
  r.frontierPeak=Math.max(r.frontierPeak??0,next.size);
  for(const g of beam)seen.add(signature(g));
  const ordered=[...next.values()].sort((a,b)=>score(b)-score(a));
  // Stratify by size so fast motif expansion cannot starve atom-by-atom paths.
  const buckets=new Map<number,Graph[]>();for(const g of ordered){const key=g.atoms.length;const list=buckets.get(key)??[];if(list.length<beamWidth)buckets.set(key,[...list,g]);else pruned=true;}
  beam=[...buckets.values()].flat();if(beam.length>beamWidth*4){pruned=true;beam=beam.slice(0,beamWidth*4);}
 }
 if(options.shouldCancel?.())return finish('CANCELLED');
 if(performance.now()>deadline)return finish('TIME_BUDGET');
 return finish(pruned||beam.length?'BEAM_PRUNED':'GRAMMAR_EXHAUSTED');
 }catch(error){r.error=String(error);return finish('EXECUTION_ERROR');}
}

/** Compatibility entry for deterministic unit/CLI callers. Production UI uses cooperative async search. */
export function searchMolecularGraphs(formula:string|undefined,options:GraphSearchOptions={}):DeNovoSearchResult {
 const iterator=iterateGraphSearch(formula,options);let state=iterator.next();while(!state.done){options.onProgress?.(state.value);state=iterator.next();}return state.value;
}
export async function searchMolecularGraphsAsync(formula:string|undefined,options:GraphSearchOptions={}):Promise<DeNovoSearchResult>{
 const iterator=iterateGraphSearch(formula,options);let state=iterator.next();
 while(!state.done){options.onProgress?.(state.value);await new Promise<void>(resolve=>setTimeout(resolve,0));state=iterator.next();}
 return state.value;
}
