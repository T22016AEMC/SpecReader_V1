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
        rdkit=await factory();
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
