import type {MainModule} from '@rdkit/rdkit';
let rdkit: MainModule | null = null;
let initialization: Promise<void> | null = null;
let failure: string | null = null;
type Factory = (options?:unknown) => Promise<MainModule>;
declare global {interface Window {initRDKitModule?:Factory}}
export function initializeRDKit():Promise<void> {
  if (initialization) return initialization;
  initialization=(async()=>{
    try {
      if (typeof window==='undefined') {
        const factory=(await import('@rdkit/rdkit')).default;
        rdkit=await factory(typeof location!=='undefined'?{locateFile:(file:string)=>new URL('/rdkit/'+file,location.href).href}:undefined);
      } else {
        await new Promise<void>((resolve,reject)=>{
          const script=document.createElement('script');script.src='/rdkit/RDKit_minimal.js';
          script.onload=()=>resolve();script.onerror=()=>reject(new Error('RDKit script unavailable'));
          document.head.appendChild(script);
        });
        if (!window.initRDKitModule) throw new Error('RDKit initialization unavailable');
        rdkit=await window.initRDKitModule({locateFile:(file:string)=>`/rdkit/${file}`});
      }
    } catch {
      failure='RDKit/WASM 未載入；僅使用內建解析器，進階價態及立體驗證未完成。';
    }
  })();
  return initialization;
}
export function rdkitStatus():{available:boolean;version:string|null;limitation:string|null} {
  return {available:rdkit!==null,version:rdkit?.version()??null,limitation:failure};
}
export function canonicalizeMolecule(smiles:string):{available:boolean;valid:boolean;canonical:string} {
  if (!rdkit) return {available:false,valid:true,canonical:smiles};
  const mol=rdkit.get_mol(smiles);
  if (!mol) return {available:true,valid:false,canonical:''};
  try {return {available:true,valid:mol.is_valid(),canonical:mol.get_smiles()};}
  finally {mol.delete();}
}
export function matchesSMARTS(smiles:string,smarts:string):boolean|null {
  if (!rdkit) return null;
  const mol=rdkit.get_mol(smiles),query=rdkit.get_qmol(smarts);
  if (!mol || !query) {mol?.delete();query?.delete();return false;}
  try {return mol.get_substruct_match(query)!=='{}';}
  finally {mol.delete();query.delete();}
}

export interface MolecularDepiction {svg:string;canonicalSmiles:string;formula:string;atomCount:number;bondCount:number;error:string|null}
/** Draw the actual sanitized molecular graph. No scaffold diagrams or substituent aliases. */
export function depictMolecule(smiles:string,width=320,height=210,partial=false):MolecularDepiction {
 const empty={svg:'',canonicalSmiles:smiles,formula:'',atomCount:0,bondCount:0,error:null};
 if(!rdkit)return {...empty,error:'RDKit/WASM 尚未可用；保留SMILES，未繪製替代示意圖。'};
 let mol:ReturnType<MainModule['get_mol']>|null=null;
 try {
  mol=rdkit.get_mol(smiles);if(!mol||!mol.is_valid())return {...empty,error:'無法解析有效分子圖。'};
  const json=JSON.parse(mol.get_json()) as {molecules?:{atoms?:{z?:number}[];bonds?:unknown[]}[]};const graph=json.molecules?.[0];
  if(!partial&&graph?.atoms?.some(a=>a.z===0))return {...empty,error:'包含未知原子／開放連接點，只能作局部結構假設。'};
  const svg=mol.get_svg_with_highlights(JSON.stringify({width,height,clearBackground:false,addAtomIndices:false,explicitMethyl:true}));
  if(!svg.includes('<svg')||!svg.includes('bond-')&&Number(graph?.atoms?.length)>1)return {...empty,error:'分子圖繪製失敗；未以R或固定骨架替代。'};
  return {svg:svg.replace(/<\?xml[^>]*>/g,''),canonicalSmiles:mol.get_smiles(),formula:'',atomCount:graph?.atoms?.length??0,bondCount:graph?.bonds?.length??0,error:null};
 }catch{return {...empty,error:'分子圖繪製失敗；SMILES已保留。'};}finally{mol?.delete();}
}

// ---------------------------------------------------------------------------------------------------- v1.2 leaf analysis
// One parsed molecule serves canonical SMILES, aromatic perception and substructure matching (queries are parsed once per request).
type RDMol=NonNullable<ReturnType<MainModule['get_mol']>>;
export interface LeafQueries {
  /** Number of required-substructure queries that parsed (all or nothing: `failed` lists the SMARTS that did not). */
  failed:string[];
  delete():void;
  /** @internal */ required:RDMol[];
  /** @internal */ aromaticAtom:RDMol|null;
  /** @internal */ aromaticBond:RDMol|null;
}
/** Parses the required-substructure SMARTS and the two aromaticity queries once. null = RDKit is not available. */
export function compileLeafQueries(requiredSmarts:string[]):LeafQueries|null {
  if (!rdkit) return null;
  const required:RDMol[]=[],failed:string[]=[];
  for (const smarts of requiredSmarts) {const q=rdkit.get_qmol(smarts);if(q)required.push(q);else failed.push(smarts);}
  const aromaticAtom=rdkit.get_qmol('[a]'),aromaticBond=rdkit.get_qmol('[a]:[a]');
  return {failed,required,aromaticAtom,aromaticBond,delete(){for(const q of [...required,aromaticAtom,aromaticBond])q?.delete();}};
}
export interface LeafMol {
  valid:boolean;
  /** RDKit canonical SMILES of the molecule exactly as the mol block was parsed (atom order untouched). */
  smiles:string;
  /** Number of distinct (overlap-allowed) matches of required query i, counted up to `limit`. */
  matchCount(queryIndex:number,limit:number):number;
  /** 1 for every atom that is aromatic after sanitization (query [a]). */
  aromaticAtoms(atomCount:number):Uint8Array;
  /** Aromatic bonds as atom pairs (query [a]:[a]). */
  aromaticBonds():[number,number][];
  close():void;
}
/** Parses a mol block once (sanitized). Atom indices of every result are the atom order of the mol block. Call close() when done. */
export function openLeafMol(molBlock:string,queries:LeafQueries):LeafMol {
  const mol=rdkit?rdkit.get_mol(molBlock):null;
  if (!mol||!mol.is_valid()) {mol?.delete();return {valid:false,smiles:'',matchCount:()=>0,aromaticAtoms:n=>new Uint8Array(n),aromaticBonds:()=>[],close(){}};}
  const matches=(q:RDMol)=>{const v=JSON.parse(mol.get_substruct_matches(q)) as unknown;return Array.isArray(v)?v as {atoms:number[]}[]:[];}; // no match is the object {}
  return {
    valid:true,
    smiles:mol.get_smiles(),
    matchCount(i,limit){
      const q=queries.required[i];if(!q)return 0;
      if (limit<=1) return mol.get_substruct_match(q)!=='{}'?1:0;
      return Math.min(limit,matches(q).length);
    },
    aromaticAtoms(n){const out=new Uint8Array(n);if(queries.aromaticAtom)for(const m of matches(queries.aromaticAtom))out[m.atoms[0]]=1;return out;},
    aromaticBonds(){return queries.aromaticBond?matches(queries.aromaticBond).map(m=>[m.atoms[0],m.atoms[1]] as [number,number]):[];},
    close(){mol.delete();},
  };
}
