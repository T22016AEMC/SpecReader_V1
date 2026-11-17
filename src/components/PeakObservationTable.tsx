import React,{useState} from 'react';
import type {ExperimentalSpectrumData,ExtendedSpectrumModality,SpectralPeak} from '../types/spectrum';
import {baselineAt,physicalIRInputs} from '../engines/scientificEngines/irManualBaseline';
import {pixelFromPhysical} from '../engines/scientificEngines/axisCalibration';
import {resolveIRScale,measureIRBandMorphology} from '../engines/scientificEngines/irSignalProcessing';
const style='w-24 rounded border border-slate-700 bg-slate-950 px-1 py-1 text-xs';
const numberOrUndefined=(s:string)=>s.trim()===''?undefined:Number.isFinite(Number(s))?Number(s):undefined;
const shapes=[['sharp','窄峰（Narrow band）'],['broad','寬峰（Broad band）']];
/**
 * Display only (v1.4.2 stop 31). A unit that reads "Transmittance" (not "%") is taken as a 0–1 fraction, so the display baseline is 1. When the same data is actually on 0–100 (largest value above 1.5; a fraction
 * that overshoots 1 a little, like 1.02, stays a fraction) the baseline is 100, otherwise 1 − 39.21 shows −38.21. The analysis (prepareIR, band processing) is not touched and does not use this.
 */
export function transmittanceFullScale(values:number[]):1|100 {
 const finite=values.filter(Number.isFinite);
 return finite.length&&Math.max(...finite)>1.5?100:1;
}
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
 if(scale==='TRANSMITTANCE')return transmittanceFullScale(raw.length?raw.map(q=>q.y):s.peaks.filter(q=>q.intensityKnown!==false).map(q=>q.y))-y;
 return scale==='ABSORBANCE'||scale==='NORMALIZED'?y:null;
}
function JInput({peak,label,onChange}:{peak:SpectralPeak;label:string;onChange:(values:number[])=>void}){
 const [text,setText]=useState(peak.jValues?.join(', ')??'');
 return <input aria-label={`${label} J Hz`} className={style} value={text} placeholder="選填，如 7.2, 1.5" onChange={e=>{setText(e.target.value);onChange(e.target.value.split(/[,;\s]+/).filter(Boolean).map(Number).filter(n=>Number.isFinite(n)&&n>0));}}/>;
}
const caption='text-[10px] text-slate-400';
/**
 * Marked-signal list (v1.2.2 P2a). Always visible per row: position, relative integral / intensity, the IR band-shape / 1H multiplicity selects and delete.
 * Fields that are usually "unknown" (IR baseline-relative intensity, J, note) sit in the row's own <details>
 * ("明細"), inside the same `observation-row` element, so row-scoped queries still reach them once the row is expanded.
 * The list grows with its content; the page (<main>) is the only scroll area.
 */
export function PeakObservationTable({spectrum:s,modality,selectedId,onSelect,onUpdate,onDelete,openIds,onToggleOpen}:{spectrum:ExperimentalSpectrumData;modality:ExtendedSpectrumModality;selectedId:string|null;onSelect:(id:string)=>void;onUpdate:(id:string,patch:Partial<SpectralPeak>)=>void;onDelete:(id:string)=>void;openIds?:ReadonlySet<string>;onToggleOpen?:(id:string,open:boolean)=>void}) {
 const nmr=modality==='1H_NMR'||modality==='13C_NMR';
 return <ul className="space-y-1.5" data-testid="observation-table">{s.peaks.map((p,i)=>{
 const uncal=p.pixelX!==undefined&&p.isCalibrated!==true;
 const label=`${modality} 標記 ${i+1}`;
 const integral=p.integration??p.integral;
 const morphology=modality==='IR'?measureIRBandMorphology(s,p).shape:'UNRESOLVED';
 const detailOpen=openIds?openIds.has(p.id):undefined;
 return <li key={p.id} data-testid="observation-row" className={`rounded-lg border px-2 py-1.5 ${selectedId===p.id?'border-cyan-600/60 bg-cyan-950/40':'border-slate-800 bg-slate-950/60'}`} onClick={()=>onSelect(p.id)}>
 <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
 <label className="flex items-center gap-1"><span className={caption}>{modality==='IR'?'波數':nmr?'δ':'m/z'}</span><input aria-label={`${label} 位置`} className={style} type="number" step="any" value={uncal?p.pixelX:p.x} onChange={e=>{const v=numberOrUndefined(e.target.value);if(v===undefined)return;const c=s.imageCalibration;const patch:Partial<SpectralPeak>=uncal?{pixelX:v}:{x:v};if(!uncal&&p.pixelX!==undefined&&c&&c.piecewiseKnots&&c.piecewiseKnots.length>=2)patch.pixelX=pixelFromPhysical(c.piecewiseKnots,v);else if(!uncal&&p.pixelX!==undefined&&c){const slope=c.slope??(c.xAxisEnd-c.xAxisStart)/(c.plotRightPx-c.plotLeftPx),intercept=c.intercept??c.xAxisStart-c.plotLeftPx*slope;if(slope)patch.pixelX=(v-intercept)/slope;}onUpdate(p.id,patch);}}/>{uncal&&<span className="text-amber-300"> px（待校正）</span>}</label>
 {nmr?<label className="flex items-center gap-1"><span className={caption}>積分</span><input aria-label={`${label} 相對積分`} className={style} type="number" min="0" step="any" value={integral??''} onChange={e=>{const v=numberOrUndefined(e.target.value);onUpdate(p.id,{integration:v??null,integral:v});}}/></label>:modality==='IR'?null:<label className="flex items-center gap-1"><span className={caption}>強度</span><input aria-label={`${label} 相對強度`} className={style} type="number" min="0" step="any" value={p.intensityKnown===false?'':p.y} onChange={e=>{const v=numberOrUndefined(e.target.value);onUpdate(p.id,{y:v??0,intensityKnown:v!==undefined});}}/></label>}
 {modality==='IR'&&<label className="flex items-center gap-1"><span className={caption}>吸收帶形態</span><select aria-label={`${label} 吸收帶形態`} className={style} value={morphology==='broad'||morphology==='sharp'?morphology:''} onChange={e=>onUpdate(p.id,{shape:e.target.value as SpectralPeak['shape'],isBroad:e.target.value==='broad',irShapeSource:'USER',userOverride:true})}><option value="" disabled hidden>未判定</option>{shapes.map(([v,t])=><option key={v} value={v}>{t}</option>)}</select></label>}
 {modality==='1H_NMR'&&<label className="flex items-center gap-1"><span className={caption}>多重性</span><select aria-label={`${label} 多重性`} className={style} value={p.multiplicity??'unresolved'} onChange={e=>onUpdate(p.id,{multiplicity:e.target.value as SpectralPeak['multiplicity']})}>{['unresolved','s','d','t','q','dd','dt','td','ddd','quint','sext','sept','m','br s','ABq'].map(v=><option key={v} value={v}>{v==='unresolved'?'未知':v}</option>)}</select></label>}
 <button type="button" className="ml-auto rounded border border-slate-700 px-2 py-0.5 text-[11px] text-rose-300 hover:bg-slate-800" aria-label={`${label} 刪除`} onClick={e=>{e.stopPropagation();onDelete(p.id);}}>刪除</button>
 </div>
 <details className="mt-1" open={detailOpen} onToggle={e=>onToggleOpen?.(p.id,e.currentTarget.open)}>
 <summary className="cursor-pointer text-[11px] text-slate-400 hover:text-slate-200">明細</summary>
 <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
 {modality==='IR'&&<span className={caption}>基線相對強度 <span className="text-slate-200" data-testid="ir-relative-intensity">{irObservedHeight(s,p)?.toFixed(2)??'未知'}</span></span>}
 {modality==='1H_NMR'&&<JInput peak={p} label={label} onChange={values=>onUpdate(p.id,{jValues:values})}/>}
 {modality==='13C_NMR'&&<span className={caption}>一般積分不代表碳數</span>}
 {(modality==='MS'||modality==='MS/MS'||modality==='ToF-SIMS')&&<span className={caption}>離子歸屬待分析</span>}
 <label className="flex items-center gap-1"><span className={caption}>備註</span><input aria-label={`${label} 備註`} className={style} value={p.note??''} onChange={e=>onUpdate(p.id,{note:e.target.value})}/></label>
 </div>
 </details>
 </li>;
 })}</ul>;
}
