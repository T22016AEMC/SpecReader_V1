import {ChemistryEngine} from '../chemistryEngine';
import {canonicalizeMolecule,rdkitStatus} from './rdkitAdapter';
export interface DeNovoSearchResult {smiles:string[];status:'BOUNDED'|'UNSUPPORTED'|'UNAVAILABLE';visited:number;note:string}
type Edge={a:number;b:number;order:number};
const valence:Record<string,number>={C:4,N:3,O:2,F:1,Cl:1,Br:1};
function molBlock(atoms:string[],edges:Edge[]):string {
  const pad=(n:number)=>String(n).padStart(3,' ');
  return ['SpecReader graph search','  SpecReader','',`${pad(atoms.length)}${pad(edges.length)}  0  0  0  0            999 V2000`,
    ...atoms.map((a,i)=>`${(i*1.5).toFixed(4).padStart(10)}    0.0000    0.0000 ${a.padEnd(3)} 0  0  0  0  0  0  0  0  0  0  0`),
    ...edges.map(e=>`${pad(e.a+1)}${pad(e.b+1)}${pad(e.order)}  0  0  0  0`),'M  END'].join('\n');
}
/** Connected atom/edge enumeration, not a compound list or SMILES template.
 * Tree growth, bond-order augmentation and ring closure obey neutral valence.
 * RDKit sanitization and canonical SMILES perform the final graph gate.
 * Deliberately bounded small CHNO/halogen search; no exhaustive guarantee.
 */
export function searchMolecularGraphs(formula:string,options:{maxResults?:number;maxStates?:number;timeMs?:number}={}):DeNovoSearchResult {
  const result:DeNovoSearchResult={smiles:[],visited:0,status:'BOUNDED',note:'有界連通分子圖搜尋；未枚舉全部異構物／立體異構物'};
  if(!rdkitStatus().available)return {...result,status:'UNAVAILABLE',note:'RDKit 未載入，分子圖生成未執行'};
  const counts=ChemistryEngine.parseFormulaCounts(formula),atoms=Object.entries(counts).filter(([e])=>e!=='H').flatMap(([e,n])=>Array(n).fill(e) as string[]);
  if(atoms.length<1||atoms.length>9||atoms.some(a=>!valence[a]))return {...result,status:'UNSUPPORTED',note:'本輪圖枚舉支援至多九個重原子的中性 C/N/O/F/Cl/Br；其他組成仍保留資料庫／片段路徑'};
  const targetH=counts.H??0,totalV=atoms.reduce((s,a)=>s+valence[a],0),targetBondOrder=(totalV-targetH)/2;
  if(!Number.isInteger(targetBondOrder)||targetBondOrder<atoms.length-1)return result;
  const deadline=performance.now()+(options.timeMs??150),maxStates=options.maxStates??6000,maxResults=options.maxResults??24,seen=new Set<string>();
  const degree=(es:Edge[],i:number)=>es.reduce((s,e)=>s+(e.a===i||e.b===i?e.order:0),0);
  let stopped=false;
  const visit=(es:Edge[],size:number,nextPair=0):void=>{
    if(stopped||++result.visited>maxStates||performance.now()>deadline||result.smiles.length>=maxResults){stopped=true;return;}
    if(size<atoms.length){
      for(let i=0;i<size;i++)if(degree(es,i)<valence[atoms[i]])visit([...es,{a:i,b:size,order:1}],size+1);
      return;
    }
    const order=es.reduce((s,e)=>s+e.order,0);
    if(order===targetBondOrder){
      const canonical=canonicalizeMolecule(molBlock(atoms,es));
      if(canonical.valid&&!seen.has(canonical.canonical)){
        const parsed=ChemistryEngine.parseStructureInput(canonical.canonical);
        if(parsed.molecularFormula===ChemistryEngine.formatFormula(counts)){seen.add(canonical.canonical);result.smiles.push(canonical.canonical);}
      }
      return;
    }
    if(order>targetBondOrder)return;
    let pair=0;
    for(let a=0;a<atoms.length;a++)for(let b=a+1;b<atoms.length;b++,pair++){
      if(pair<nextPair||degree(es,a)>=valence[atoms[a]]||degree(es,b)>=valence[atoms[b]])continue;
      const existing=es.find(e=>e.a===a&&e.b===b);if(existing&&existing.order>=3)continue;
      const augmented=es.map(e=>({...e}));
      const old=augmented.find(e=>e.a===a&&e.b===b);if(old)old.order++;else augmented.push({a,b,order:1});
      visit(augmented,size,pair);
    }
  };
  visit([],1);
  result.note+=`; ${result.visited} states; ${stopped?'已達資源界限':'限定空間搜尋結束'}; formula ${formula}`;
  return result;
}
