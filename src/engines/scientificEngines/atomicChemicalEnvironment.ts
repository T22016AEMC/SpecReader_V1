import {StructureParserAdapter} from '../chemistryEngine';
import type {NMRSolvent,SpectralPeak,ProtonEnvironment,CarbonEnvironment} from '../../types/spectrum';
export interface AtomicChemicalEnvironment {
 atomId:string;element:string;hybridization:'sp'|'sp2'|'sp3'|'UNKNOWN';aromatic:boolean;formalCharge:number;
 neighbors:{atomId:string;element:string;bondOrder:number}[];hydrogenCount:number;
 functionalEnvironment:string[];electronWithdrawingNeighbors:number;conjugated:boolean;
 smallestRing:number|null;hydrogenBondRole:'DONOR'|'ACCEPTOR'|'DONOR_ACCEPTOR'|'POSSIBLE'|'NONE';
 symmetryClass:string;chemicalEquivalence:'TOPOLOGICAL_POSSIBLE';magneticEquivalence:'NOT_DETERMINED';
 solvent:NMRSolvent;temperatureK:number|null;conformation:'NOT_PROVIDED';uncertaintyReasons:string[];
}
export interface SignalEnvironmentHypothesis {id:string;label:string;range:[number,number];hybridization:string;neighborElements:string[];compatibility:number;uncertaintyPpm:number;support:string[];alternatives:string[];source:string}
export interface NMRCorrelationConstraint {
 id:string;kind:'PROTON_PROTON_COUPLING'|'DIRECT_HC'|'LONG_RANGE_HC'|'SPATIAL';experiment:'COSY'|'HSQC'|'HMBC'|'NOESY'|'ROESY';
 atomAssignments:string[];signalAssignments:string[];bondDistance:[number,number]|null;confidence:number|null;
 conflicts:string[];origin:'MEASURED'|'GRAPH_HYPOTHESIS';observedCrossPeak?:[number,number];
}
const cache=new Map<string,AtomicChemicalEnvironment[]>();
export function describeAtomicEnvironments(smiles:string,conditions:{solvent?:NMRSolvent;temperatureK?:number}={}):AtomicChemicalEnvironment[]{
 const key=JSON.stringify([smiles,conditions]);if(cache.has(key))return cache.get(key)!;
 const graph=StructureParserAdapter.parseSmilesGraph(smiles).graph;if(!graph)return [];
 const atoms=graph.atoms;
 let colors=atoms.map(a=>`${a.element}:${a.isAromatic}:${a.formalCharge}:${a.totalHydrogens}`);
 for(let round=0;round<3;round++){const signatures=atoms.map(a=>`${colors[a.index]}[${a.neighbors.map(n=>`${n.order}:${colors[n.toAtom]}`).sort().join(',')}]`);const unique=[...new Set(signatures)].sort();colors=signatures.map(s=>String(unique.indexOf(s)));}
 const output=atoms.map(a=>{
   const ns=a.neighbors.map(n=>({atom:atoms[n.toAtom],order:n.order}));
   const carbonyl=a.element==='C'&&ns.some(n=>n.order===2&&n.atom.element==='O');
   let ring:number|null=null;
   for(let i=0;i<ns.length;i++)for(let j=i+1;j<ns.length;j++){
     const q:[number,number][]=[[ns[i].atom.index,0]],seen=new Set([a.index]);
     for(let k=0;k<q.length;k++){const [v,d]=q[k];if(v===ns[j].atom.index){ring=Math.min(ring??Infinity,d+2);break;}if(seen.has(v)||d>=8)continue;seen.add(v);for(const n of atoms[v].neighbors)if(!seen.has(n.toAtom))q.push([n.toAtom,d+1]);}
   }
   const reasons=['未提供構象／立體平均；局部環境不保證磁等價'];
   if(!conditions.solvent||conditions.solvent==='Unknown')reasons.push('溶劑未知');
   if(!conditions.temperatureK)reasons.push('溫度未知');
   if(ns.some(n=>['S','P','Si','I'].includes(n.atom.element)))reasons.push('少見雜原子取代參數有限');
   if(ring&&ring<=4)reasons.push('小環張力與構象效應');
   return {atomId:`Atom_${a.index+1}`,element:a.element,hybridization:a.isAromatic||ns.some(n=>n.order===2)?'sp2':ns.some(n=>n.order===3)?'sp':'sp3',aromatic:a.isAromatic,formalCharge:a.formalCharge,neighbors:ns.map(n=>({atomId:`Atom_${n.atom.index+1}`,element:n.atom.element,bondOrder:n.order})),hydrogenCount:a.totalHydrogens,functionalEnvironment:[...(carbonyl?['CARBONYL']:[]),...(a.isAromatic?['AROMATIC']:[]),...(ns.some(n=>['O','N','S','F','Cl','Br'].includes(n.atom.element))?['HETERO_SUBSTITUTED']:[])],electronWithdrawingNeighbors:ns.filter(n=>['O','N','F','Cl','Br'].includes(n.atom.element)).length,conjugated:ns.some(n=>n.atom.isAromatic||n.atom.neighbors.some(m=>m.toAtom!==a.index&&m.order>1)),smallestRing:ring,hydrogenBondRole:['O','N','S'].includes(a.element)?a.formalCharge>0?(a.totalHydrogens?'DONOR':'NONE'):ns.some(n=>n.atom.element==='C'&&n.atom.neighbors.some(m=>m.order===2&&atoms[m.toAtom].element==='O'))&&a.element==='N'?(a.totalHydrogens?'DONOR':'NONE'):a.totalHydrogens?(a.isAromatic?'DONOR':'DONOR_ACCEPTOR'):'ACCEPTOR':'NONE',symmetryClass:colors[a.index],chemicalEquivalence:'TOPOLOGICAL_POSSIBLE',magneticEquivalence:'NOT_DETERMINED',solvent:conditions.solvent??'Unknown',temperatureK:conditions.temperatureK??null,conformation:'NOT_PROVIDED',uncertaintyReasons:reasons} as AtomicChemicalEnvironment;
 });
 if(cache.size>=128)cache.delete(cache.keys().next().value!);cache.set(key,output);return output;
}
const SOURCE='https://www2.chemistry.msu.edu/faculty/reusch/VirtTxtJml/Spectrpy/nmr/nmr1.htm';
type EnvironmentRule={id:string;label:string;range:[number,number];hybridization:string;neighborElements:string[];exchange?:boolean;nitrogenAmbiguous?:boolean};
const hRules:EnvironmentRule[]=[
 {id:'alkyl',label:'飽和脂肪族 C–H',range:[.5,2],hybridization:'sp3',neighborElements:['C','H']},
 {id:'allyl-benzyl',label:'烯丙／苄位／羰基鄰位 C–H',range:[1.6,3.2],hybridization:'sp3',neighborElements:['C']},
 {id:'hetero-ns',label:'鄰 N／S 的飽和 C–H',range:[2.1,4],hybridization:'sp3',neighborElements:['N','S']},
 {id:'hetero-ohal',label:'鄰 O／鹵素 C–H',range:[3,4.7],hybridization:'sp3',neighborElements:['O','F','Cl','Br']},
 {id:'acetal',label:'縮醛／多雜原子取代 C–H',range:[4.1,6.2],hybridization:'sp3',neighborElements:['O','N']},
 {id:'alkyne-h',label:'末端炔 C–H',range:[1.7,3.5],hybridization:'sp',neighborElements:['C']},
 {id:'vinyl',label:'烯基／共軛 C–H',range:[4.4,7],hybridization:'sp2',neighborElements:['C']},
 {id:'aromatic-h',label:'芳香／雜芳香 C–H 競爭環境',range:[6,9],hybridization:'sp2',neighborElements:['C','N']},
 {id:'aldehyde-h',label:'醛氫或強去屏蔽 C–H',range:[9,10.5],hybridization:'sp2',neighborElements:['O','C']},
 {id:'exchange-h',label:'OH／NH 可交換氫',range:[.5,12],hybridization:'variable',neighborElements:['O','N'],exchange:true},
 {id:'acid-h',label:'酸／強氫鍵可交換氫',range:[10,14],hybridization:'variable',neighborElements:['O','N'],exchange:true},
];
const cRules:EnvironmentRule[]=[
 {id:'alkyl-c',label:'sp³ 脂肪碳',range:[0,50],hybridization:'sp3',neighborElements:['C','H']},
 {id:'n-s-c',label:'sp³ 鄰 N／S／鹵素碳',range:[20,70],hybridization:'sp3',neighborElements:['N','S','Cl','Br','I']},
 {id:'o-c',label:'sp³ 連 O 碳',range:[45,90],hybridization:'sp3',neighborElements:['O']},
 {id:'acetal-c',label:'縮醛／多雜原子碳',range:[85,115],hybridization:'sp3',neighborElements:['O','N']},
 {id:'sp-c',label:'sp 炔碳',range:[65,95],hybridization:'sp',neighborElements:['C']},
 {id:'nitrile-c',label:'腈碳／不飽和重疊環境',range:[105,125],hybridization:'sp',neighborElements:['N']},
 {id:'aromatic-c',label:'sp² 芳香／烯基碳',range:[100,155],hybridization:'sp2',neighborElements:['C']},
 {id:'aryl-hetero-c',label:'sp² 連 O／N 碳（非特定骨架）',range:[140,166],hybridization:'sp2',neighborElements:['O','N']},
 {id:'acid-derivative-c',label:'羧酸／酯／醯胺羰基競爭環境',range:[160,185],hybridization:'sp2',neighborElements:['O','N']},
 {id:'aldehyde-ketone-c',label:'醛／酮羰基競爭環境',range:[185,225],hybridization:'sp2',neighborElements:['O','C']},
];
/**
 * Without N-specific evidence (v1.1.6, options.nitrogenAllowed=false) N is removed from every rule:
 * the 13C nitrile rule is dropped (a 105–125 ppm carbon is a nitrile only with the IR C≡N band) and
 * other O/N or N/S neighbours default to O, with a note that N stays possible but unsupported.
 * The default (true) keeps the original rules for nmrEngine and Mode B.
 */
function nitrogenGated(rules:EnvironmentRule[]):EnvironmentRule[] {
 return rules.filter(r=>r.id!=='nitrile-c').map(r=>r.neighborElements.includes('N')?{...r,neighborElements:[...new Set(r.neighborElements.map(e=>e==='N'?'O':e))],nitrogenAmbiguous:true}:r);
}
export function inferSignalEnvironments(modality:'1H_NMR'|'13C_NMR',p:SpectralPeak,solvent:NMRSolvent='Unknown',options:{nitrogenAllowed?:boolean}={}):SignalEnvironmentHypothesis[]{
 const all=modality==='1H_NMR'?hRules:cRules,base=modality==='1H_NMR'?.35:6;
 const rules=options.nitrogenAllowed===false?nitrogenGated(all):all;
 return rules.map(r=>{const d=Math.max(r.range[0]-p.x,0,p.x-r.range[1]);let score=Math.exp(-.5*(d/base)**2);
  const support=[`實測 δ ${p.x} ppm；區間 ${r.range.join('–')}`];
  if(r.nitrogenAmbiguous)support.push('也可能是 N，但無 N 專屬證據；預設歸 O');
  if(p.multiplicity){support.push(`已提供 ${p.multiplicity}；只作局部耦合約束，不直接指定分子`);if(r.exchange&&!['br s','s','m','unresolved'].includes(p.multiplicity))score*=.55;}
  if(p.integration!=null||p.integral!=null)support.push('相對積分已提供；只能形成訊號比例，非絕對氫數');
  if(p.jValues?.length)support.push(`J=${p.jValues.join(',')} Hz；可比較共同耦合，未求解二階系統`);
  if(p.isExchangeable)score*=r.exchange?1:.35;
  if(r.exchange&&!(p.isBroad||p.shape==='broad'))score*=.65;
  if(solvent==='Unknown')score*=.85;
  return {id:r.id,label:r.label,range:r.range,hybridization:r.hybridization,neighborElements:r.neighborElements,compatibility:score,uncertaintyPpm:base*(solvent==='Unknown'?1.5:1),support,alternatives:['位移重疊／溶劑／溫度／構象可能改變歸屬','缺少 2D 關聯時不能唯一連接原子'],source:SOURCE};
 }).filter(r=>r.compatibility>.2).sort((a,b)=>b.compatibility-a.compatibility).slice(0,4);
}
export function enrichAtomicPrediction<T extends ProtonEnvironment|CarbonEnvironment>(result:{peaks:SpectralPeak[];environments:T[]},smiles:string,modality:'1H_NMR'|'13C_NMR',conditions:{solvent?:NMRSolvent;temperatureK?:number}={}):{peaks:SpectralPeak[];environments:T[]}{
 const descriptors=describeAtomicEnvironments(smiles,conditions);
 return {...result,environments:result.environments.map(e=>{
  const selected=descriptors.filter(d=>e.atomIndices?.some(i=>d.atomId===`Atom_${i+1}`));
  const extra=(conditions.solvent&&conditions.solvent!=='Unknown'?0:modality==='1H_NMR'?.15:2)+(selected.some(d=>d.uncertaintyReasons.some(r=>r.includes('少見')))?modality==='1H_NMR'?.4:5:0);
  return {...e,atomicEnvironment:selected,uncertaintyPpm:(e.uncertaintyPpm??(modality==='1H_NMR'?.4:8))+extra};
 })};
}
