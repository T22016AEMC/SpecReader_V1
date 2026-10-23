import React from 'react';
import {AXIS_CALIBRATION_CONFIG as CFG} from '../engines/scientificEngines/axisCalibrationConfig';
import type {AxisKnot} from '../engines/scientificEngines/axisCalibration';

export interface CalibPixelPoint {pixelX:number;pixelY:number;realX:number;realY:number}
export type ExtraKey='C'|'D'|'E';
const ROWS:{key:ExtraKey;color:string;badge:string;text:string}[]=[
 {key:'C',color:'text-purple-300',badge:'bg-purple-600',text:'border-purple-500/40 text-purple-200'},
 {key:'D',color:'text-emerald-300',badge:'bg-emerald-600',text:'border-emerald-500/40 text-emerald-200'},
 {key:'E',color:'text-pink-300',badge:'bg-pink-600',text:'border-pink-500/40 text-pink-200'},
];
const preset=CFG.presets.IR_SCALE_BREAK_2000;

/** Piecewise-linear calibration block (IR only): points C–E beside A/B, the opt-in 2000 cm⁻¹ preset and the inferred knots. */
export function PiecewiseCalibrationControls(p:{
 xUnit:string;points:Record<ExtraKey,CalibPixelPoint>;included:Record<ExtraKey,boolean>;
 onChange:(key:ExtraKey,patch:Partial<CalibPixelPoint>)=>void;onInclude:(key:ExtraKey,on:boolean)=>void;
 nextTarget:string;onSelectTarget:(key:ExtraKey)=>void;
 presetChecked:boolean;onPresetChange:(on:boolean)=>void;knots:AxisKnot[]|null;error:string|null;
}) {
 const inferred=(p.knots??[]).filter(k=>k.inferred);
 const num=(v:string)=>Number(v);
 return <div data-testid="piecewise-calibration" className="mt-2.5 space-y-2 rounded border border-sky-500/30 bg-sky-950/20 p-2.5">
  <p className="text-[10px] text-slate-400">{CFG.ui.piecewiseExplainText}</p>
  {ROWS.map(r=><div key={r.key} className="space-y-1.5 border-t border-slate-800/70 pt-2 first:border-t-0 first:pt-0">
   <div className="flex items-center justify-between">
    <label className={`flex items-center gap-1.5 font-mono font-bold ${r.color}`}>
     <input type="checkbox" aria-label={`使用校正點 ${r.key}`} checked={p.included[r.key]} onChange={e=>p.onInclude(r.key,e.target.checked)}/>
     校正點 {r.key}
    </label>
    <button type="button" onClick={()=>p.onSelectTarget(r.key)} className={`rounded px-2 py-0.5 font-mono text-[10px] font-semibold ${p.nextTarget===r.key?`${r.badge} text-white`:'bg-slate-800 text-slate-300'}`}>{p.nextTarget===r.key?`● 目前點圖設定 Pt ${r.key}`:`點圖取樣 ${r.key}`}</button>
   </div>
   <div className="grid grid-cols-2 gap-2">
    <div className="flex gap-1">
     <input type="number" aria-label={`校正點 ${r.key} 像素 X`} value={p.points[r.key].pixelX} onChange={e=>p.onChange(r.key,{pixelX:num(e.target.value)})} className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 font-mono text-xs"/>
     <input type="number" aria-label={`校正點 ${r.key} 像素 Y`} value={p.points[r.key].pixelY} onChange={e=>p.onChange(r.key,{pixelY:num(e.target.value)})} className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 font-mono text-xs"/>
    </div>
    <input type="number" step="any" aria-label={`校正點 ${r.key} 物理波數`} title={`實際刻度值 (${p.xUnit})`} value={p.points[r.key].realX} onChange={e=>p.onChange(r.key,{realX:num(e.target.value)})} className={`w-full rounded border bg-slate-900 px-2 py-1 font-mono text-xs ${r.text}`}/>
   </div>
  </div>)}
  <div className="border-t border-slate-800/70 pt-2">
   <label className="flex items-center gap-1.5 text-[11px] font-semibold text-sky-200">
    <input type="checkbox" aria-label={preset.label} checked={p.presetChecked} onChange={e=>p.onPresetChange(e.target.checked)}/>{preset.label}
   </label>
   <p className="mt-1 text-[10px] text-slate-400">{preset.helpText}{preset.alternativeText}</p>
   {p.presetChecked&&inferred.length>0&&<p data-testid="piecewise-inferred-knots" className="mt-1 font-mono text-[10px] text-sky-300">推定轉折點（由預設推出）：{inferred.map(k=>`px ≈ ${k.pixelX.toFixed(1)} → ${k.physicalX} ${p.xUnit}`).join('；')}</p>}
  </div>
  {p.error&&<p role="alert" data-testid="piecewise-error" className="text-[11px] font-semibold text-red-400">{p.error}</p>}
 </div>;
}
