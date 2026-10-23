import React,{useState} from 'react';
import type {ExperimentalSpectrumData,ExtendedSpectrumModality,SpectralPeak} from '../types/spectrum';
import {baselineAt,physicalIRInputs} from '../engines/scientificEngines/irManualBaseline';
import {pixelFromPhysical} from '../engines/scientificEngines/axisCalibration';
import {resolveIRScale,measureIRBandMorphology} from '../engines/scientificEngines/irSignalProcessing';
const style='w-24 rounded border border-slate-700 bg-slate-950 px-1 py-1 text-xs';
const numberOrUndefined=(s:string)=>s.trim()===''?undefined:Number.isFinite(Number(s))?Number(s):undefined;
const shapes=[['sharp','窄峰（Narrow band）'],['broad','寬峰（Broad band）']];
/** Local coordinate/intensity measurement only. No chemical inference on edit. */
export function irObservedHeight(s:ExperimentalSpectrumData,p:SpectralPeak):number|null {
 const settings=s.irManualSettings,scale=resolveIRScale(s.yUnit,settings?.intensityScale??s.irIntensityScale);
 if(p.pixelX!==undefined&&!p.isCalibrated)return null;
 if(settings?.enabled){
  const {raw,anchors}=physicalIRInputs(s);if(anchors.length!==5)return null;
  const sample=raw.length?raw.reduce((best,q)=>Math.abs(q.x-p.x)<Math.abs(best.x-p.x)?q:best,raw[0]):null;
  if(!sample)return null;
  const direction=settings.direction==='AUTO'?(scale==='ABSORBANCE'?'UP':scale==='PERCENT_TRANSMITTANCE'||scale==='TRANSMITTANCE'?'DOWN':null):settings.direction;
  if(!direction)return null;
  try{return (direction==='DOWN'?-1:1)*(sample.y-baselineAt(p.x,anchors));}catch{return null;}
 }
 if(s.originalImageUrl)return null;
 const raw=physicalIRInputs(s).raw;
 const sample=raw.length&&p.x>=Math.min(...raw.map(q=>q.x))&&p.x<=Math.max(...raw.map(q=>q.x))?raw.reduce((best,q)=>Math.abs(q.x-p.x)<Math.abs(best.x-p.x)?q:best,raw[0]):null;
 const y=sample?.y??(p.intensityKnown===false?null:p.y);if(y===null)return null;
 if(scale==='PERCENT_TRANSMITTANCE')return 100-y;
 if(scale==='TRANSMITTANCE')return 1-y;
 return scale==='ABSORBANCE'||scale==='NORMALIZED'?y:null;
}
function JInput({peak,label,onChange}:{peak:SpectralPeak;label:string;onChange:(values:number[])=>void}){
 const [text,setText]=useState(peak.jValues?.join(', ')??'');
 return <input aria-label={`${label} J Hz`} className={style} value={text} placeholder="選填，如 7.2, 1.5" onChange={e=>{setText(e.target.value);onChange(e.target.value.split(/[,;\s]+/).filter(Boolean).map(Number).filter(n=>Number.isFinite(n)&&n>0));}}/>;
}
export function PeakObservationTable({spectrum:s,modality,selectedId,onSelect,onUpdate,onDelete}:{spectrum:ExperimentalSpectrumData;modality:ExtendedSpectrumModality;selectedId:string|null;onSelect:(id:string)=>void;onUpdate:(id:string,patch:Partial<SpectralPeak>)=>void;onDelete:(id:string)=>void}) {
 const nmr=modality==='1H_NMR'||modality==='13C_NMR';
 return <table className="w-full text-left text-xs" data-testid="observation-table"><thead><tr><th>{modality==='IR'?'波數 cm⁻¹':nmr?'δ ppm':'m/z'}</th><th>{nmr?'相對積分（選填）':modality==='IR'?'基線相對強度':'相對強度'}</th><th>{modality==='IR'?'吸收帶形態':modality==='1H_NMR'?'多重性／J Hz':'觀測資訊'}</th><th>備註（選填）</th><th>操作</th></tr></thead><tbody>{s.peaks.map((p,i)=>{
 const uncal=p.pixelX!==undefined&&p.isCalibrated!==true;
 const label=`${modality} 標記 ${i+1}`;
 const integral=p.integration??p.integral;
 const morphology=modality==='IR'?measureIRBandMorphology(s,p).shape:'UNRESOLVED';
 return <tr key={p.id} data-testid="observation-row" className={selectedId===p.id?'bg-cyan-950/40':''} onClick={()=>onSelect(p.id)}>
 <td><input aria-label={`${label} 位置`} className={style} type="number" step="any" value={uncal?p.pixelX:p.x} onChange={e=>{const v=numberOrUndefined(e.target.value);if(v===undefined)return;const c=s.imageCalibration;const patch:Partial<SpectralPeak>=uncal?{pixelX:v}:{x:v};if(!uncal&&p.pixelX!==undefined&&c&&c.piecewiseKnots&&c.piecewiseKnots.length>=2)patch.pixelX=pixelFromPhysical(c.piecewiseKnots,v);else if(!uncal&&p.pixelX!==undefined&&c){const slope=c.slope??(c.xAxisEnd-c.xAxisStart)/(c.plotRightPx-c.plotLeftPx),intercept=c.intercept??c.xAxisStart-c.plotLeftPx*slope;if(slope)patch.pixelX=(v-intercept)/slope;}onUpdate(p.id,patch);}}/>{uncal&&<span> px（待校正）</span>}</td>
 <td>{nmr?<input aria-label={`${label} 相對積分`} className={style} type="number" min="0" step="any" value={integral??''} onChange={e=>{const v=numberOrUndefined(e.target.value);onUpdate(p.id,{integration:v??null,integral:v});}}/>:modality==='IR'?<span data-testid="ir-relative-intensity">{irObservedHeight(s,p)?.toFixed(2)??'未知'}</span>:<input aria-label={`${label} 相對強度`} className={style} type="number" min="0" step="any" value={p.intensityKnown===false?'':p.y} onChange={e=>{const v=numberOrUndefined(e.target.value);onUpdate(p.id,{y:v??0,intensityKnown:v!==undefined});}}/>}</td>
 <td>{modality==='IR'?<><select aria-label={`${label} 吸收帶形態`} className={style} value={morphology==='broad'||morphology==='sharp'?morphology:''} onChange={e=>onUpdate(p.id,{shape:e.target.value as SpectralPeak['shape'],isBroad:e.target.value==='broad',irShapeSource:'USER',userOverride:true})}><option value="" disabled hidden>未判定</option>{shapes.map(([v,t])=><option key={v} value={v}>{t}</option>)}</select></>:modality==='1H_NMR'?<><select aria-label={`${label} 多重性`} className={style} value={p.multiplicity??'unresolved'} onChange={e=>onUpdate(p.id,{multiplicity:e.target.value as SpectralPeak['multiplicity']})}>{['unresolved','s','d','t','q','dd','dt','td','ddd','quint','sext','sept','m','br s','ABq'].map(v=><option key={v} value={v}>{v==='unresolved'?'未知':v}</option>)}</select><JInput peak={p} label={label} onChange={values=>onUpdate(p.id,{jValues:values})}/></>:<span>{modality==='13C_NMR'?'一般積分不代表碳數':'離子歸屬待分析'}</span>}</td>
 <td><input aria-label={`${label} 備註`} className={style} value={p.note??''} onChange={e=>onUpdate(p.id,{note:e.target.value})}/></td>
 <td><button type="button" aria-label={`${label} 刪除`} onClick={e=>{e.stopPropagation();onDelete(p.id);}}>刪除</button></td></tr>;
 })}</tbody></table>;
}
