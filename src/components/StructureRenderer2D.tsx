import React,{useEffect,useState} from 'react';
import {depictMolecule,initializeRDKit,type MolecularDepiction} from '../engines/scientificEngines/rdkitAdapter';
import {ChemistryEngine} from '../engines/chemistryEngine';
interface StructureRenderer2DProps {smiles?:string;formula?:string;title?:string;compact?:boolean;showValidationBadge?:boolean;partial?:boolean}
export function StructureRenderer2D({smiles='',formula,title,compact=false,showValidationBadge=true,partial=false}:StructureRenderer2DProps){
 const [drawing,setDrawing]=useState<MolecularDepiction|null>(null),[computed,setComputed]=useState('');
 useEffect(()=>{let active=true;setDrawing(null);setComputed('');void initializeRDKit().then(()=>{const image=depictMolecule(smiles,compact?280:360,compact?185:235,partial);if(!active)return;setDrawing(image);if(!image.error)setComputed(ChemistryEngine.parseStructureInput(smiles).molecularFormula);});return()=>{active=false;};},[smiles,compact,partial]);
 return <div className="rounded-lg border border-slate-700 bg-slate-950 p-2" data-testid="molecular-depiction" data-smiles={smiles} data-atom-count={drawing?.atomCount??0} data-bond-count={drawing?.bondCount??0} data-formula={computed} data-partial={partial}>
  {partial&&<p className="text-amber-300">局部結構假設；開放連接尚未確認</p>}
  {!drawing?<p className="text-xs text-slate-400">載入分子圖…</p>:drawing.error?<p role="alert" className="text-xs text-amber-300">{drawing.error}</p>:<div className="w-full overflow-hidden rounded bg-white [&_svg]:h-auto [&_svg]:w-full" role="img" aria-label={partial?'局部結構假設':'完整分子圖'} dangerouslySetInnerHTML={{__html:drawing.svg}}/>}
  {showValidationBadge&&computed&&<p className="text-xs text-cyan-300">圖計算分子式：{computed}{formula&&formula!==computed?'；注意：傳入組成與圖不一致':''}</p>}
  <p className="break-all text-[10px] text-slate-400">SMILES: {smiles||'未提供'}</p>{title&&<p className="text-xs text-slate-300">{title}</p>}
 </div>;
}
