import React,{useRef} from 'react';
import type {DataPoint,ExperimentalSpectrumData} from '../types/spectrum';
import {prepareIR,resolveIRScale} from '../engines/scientificEngines/irSignalProcessing';
import {baselineAt,defaultPixelBaseline,irSettingsKey,type IRManualSettings} from '../engines/scientificEngines/irManualBaseline';
import {SpectrumParser} from '../engines/spectrumParser';

export function initialIRSettings(s:ExperimentalSpectrumData):IRManualSettings {
 if(s.irManualSettings)return s.irManualSettings;
 const c=s.imageCalibration??SpectrumParser.buildImageCalibration('IR',s.imageDimensions??{width:800,height:450});
 if(s.originalImageUrl)return {...defaultPixelBaseline(s,c),enabled:true};
 const points=(s.rawExperimentalSnapshot?.rawPoints??s.points).slice().sort((a,b)=>a.x-b.x);
 const min=points[0]?.x??400,max=points.at(-1)?.x??4000;
 const ys=points.map(p=>p.y).sort((a,b)=>a-b),y=ys[Math.floor(ys.length*.8)]??0;
 return {direction:'AUTO',enabled:true,coordinateSpace:'PHYSICAL',intensityScale:resolveIRScale(s.yUnit,s.irIntensityScale),anchors:Array.from({length:5},(_,i)=>({x:min+(max-min)*i/4,y}))};
}
export function IRCalibrationPanel({s,settings,onDraft,onApply}:{s:ExperimentalSpectrumData;settings:IRManualSettings;onDraft:(v:IRManualSettings)=>void;onApply:(v:IRManualSettings)=>void}) {
 const preview=prepareIR({...s,irProcessingApplied:false,irManualSettings:{...settings,enabled:settings.enabled}});
 const changed=irSettingsKey(settings)!==irSettingsKey(s.irManualSettings);
 const valid=settings.anchors.length===5&&new Set(settings.anchors.map(p=>p.x)).size===5;
 const curve=preview.irCorrectedPoints??[],ys=curve.map(p=>p.y),lo=Math.min(...ys,0),hi=Math.max(...ys,1);
 const display=curve.filter((_,i)=>i%Math.max(1,Math.ceil(curve.length/1000))===0);
 return <div className="mb-2 rounded border border-amber-600/40 bg-slate-950 p-2 text-xs text-slate-300" data-testid="ir-calibration-panel">
   <p className="font-semibold text-amber-200">IR 五點基線 · 與原圖座標校正共用畫布</p>
   <div className="flex flex-wrap gap-2 my-2">
    <label>吸收方向 <select aria-label="IR 吸收方向" className="bg-slate-900" value={settings.direction} onChange={e=>onDraft({...settings,direction:e.target.value as IRManualSettings['direction']})}><option value="AUTO">自動辨識</option><option value="DOWN">吸收峰朝下</option><option value="UP">吸收峰朝上</option></select></label>
    <label>原始尺度 <select aria-label="IR 原始尺度" className="bg-slate-900" value={settings.intensityScale??'UNKNOWN'} onChange={e=>onDraft({...settings,intensityScale:e.target.value as IRManualSettings['intensityScale']})}><option value="UNKNOWN">未知／相對影像</option><option value="PERCENT_TRANSMITTANCE">%T</option><option value="TRANSMITTANCE">T (0–1)</option><option value="ABSORBANCE">Absorbance</option><option value="NORMALIZED">相對數值</option></select></label>
    {s.originalImageUrl&&<><label>Y 軸下端 <input aria-label="IR Y 軸下端" type="number" step="any" className="w-16 bg-slate-900" value={settings.yAxisRange?.[0]??''} onChange={e=>onDraft({...settings,yAxisRange:[Number(e.target.value),settings.yAxisRange?.[1]??100]})}/></label><label>上端 <input aria-label="IR Y 軸上端" type="number" step="any" className="w-16 bg-slate-900" value={settings.yAxisRange?.[1]??''} onChange={e=>onDraft({...settings,yAxisRange:[settings.yAxisRange?.[0]??0,Number(e.target.value)]})}/></label></>}
    <label><input aria-label="啟用 IR 五點基線" type="checkbox" checked={settings.enabled} onChange={e=>onDraft({...settings,enabled:e.target.checked})}/>使用五點基線</label>
    <button type="button" onClick={()=>{const clean={...s,irManualSettings:undefined};onDraft({...initialIRSettings(clean),enabled:true});}}>重設五點基線</button>
    <button type="button" disabled={!valid||settings.yAxisRange?.[0]===settings.yAxisRange?.[1]&&settings.yAxisRange!==undefined} onClick={()=>onApply(settings)}>套用 IR 設定並更新分析</button>
    <button type="button" onClick={()=>{const next={...settings,enabled:false};onDraft(next);onApply(next);}}>停用基線並重新分析</button>
   </div>
   <p data-testid="ir-draft-status">{changed?'預覽：尚未套用':'正式設定'} · 已套用版本 {s.irManualSettings?.revision??0}；直接拖曳原圖黃色五點。</p>
   {!s.irPixelCurve?.length&&s.originalImageUrl&&<p className="text-amber-300">尚未擷取到可靠曲線；五點仍可調整，但不能自動產生實測峰，請校正或人工標峰。</p>}
   <p>基線穿過寬 OH／NH 或弱峰可能移除真實吸收，請對照原圖。未知 Y 刻度僅為相對影像尺度；不轉換成吸光度。</p>
   <details><summary>同設定相對吸收預覽（未套用不影響第 3 頁）</summary><p data-testid="ir-preview-features">{preview.peaks.length} 個峰；{curve.length} 個相對吸收數值；負值保留作基線品質判斷。</p><svg viewBox="0 0 500 90" className="w-full h-24" aria-label="IR 基線相對吸收預覽"><polyline fill="none" stroke="#22d3ee" points={display.map((p,i,a)=>`${i*500/Math.max(1,a.length-1)},${85-(p.y-lo)*80/Math.max(1e-9,hi-lo)}`).join(' ')}/></svg></details>
 </div>;
}
export function IRBaselineHandles({settings,onChange,mapPoint,unmapPoint,width,height,bounds}:{settings:IRManualSettings;onChange:(s:IRManualSettings)=>void;mapPoint:(p:DataPoint)=>DataPoint;unmapPoint:(p:DataPoint)=>DataPoint;width:number;height:number;bounds:{left:number;right:number;top:number;bottom:number}}){
 const drag=useRef<number|null>(null);
 const sorted=settings.anchors.slice().sort((a,b)=>a.x-b.x);
 const samples=Array.from({length:101},(_,i)=>{const x=sorted[0].x+(sorted[4].x-sorted[0].x)*i/100;return mapPoint({x,y:baselineAt(x,sorted)});});
 return <g data-testid="ir-baseline-overlay" onMouseMove={e=>e.stopPropagation()} onClick={e=>e.stopPropagation()} onMouseDown={e=>e.stopPropagation()}>
   <polyline data-testid="ir-baseline-line" fill="none" stroke="#111827" strokeWidth="6" pointerEvents="none" points={samples.map(p=>`${p.x},${p.y}`).join(' ')}/>
   <polyline fill="none" stroke="#fbbf24" strokeWidth="3" pointerEvents="none" points={samples.map(p=>`${p.x},${p.y}`).join(' ')}/>
   {settings.anchors.map((p,i)=>{const q=mapPoint(p);return <g key={i}>
    <circle aria-label={`原圖基線控制點 ${i+1}`} data-x={p.x} data-y={p.y} cx={q.x} cy={q.y} r={14} fill="#fbbf24" fillOpacity=".22" stroke="#111827" strokeWidth="2" style={{cursor:'move',touchAction:'none'}}
      onPointerDown={e=>{e.preventDefault();e.stopPropagation();drag.current=i;e.currentTarget.setPointerCapture(e.pointerId);}}
      onPointerMove={e=>{if(drag.current!==i)return;e.preventDefault();e.stopPropagation();const rect=e.currentTarget.ownerSVGElement!.getBoundingClientRect();const raw=unmapPoint({x:(e.clientX-rect.left)*width/rect.width,y:(e.clientY-rect.top)*height/rect.height});const others=settings.anchors.filter((_,j)=>j!==i).map(a=>a.x);let x=Math.max(bounds.left,Math.min(bounds.right,raw.x));if(others.some(v=>Math.abs(v-x)<.001))x=p.x;onChange({...settings,anchors:settings.anchors.map((a,j)=>j===i?{x,y:Math.max(bounds.top,Math.min(bounds.bottom,raw.y))}:a)});}}
      onPointerUp={e=>{e.stopPropagation();drag.current=null;if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);}}
      onPointerCancel={()=>{drag.current=null;}}/>
    <circle cx={q.x} cy={q.y} r="5" fill="#fbbf24" stroke="#111827" pointerEvents="none"/>
    <text x={q.x+16} y={q.y-12} fill="#d97706" stroke="#fff" strokeWidth=".5" fontSize="16" pointerEvents="none">{i+1}</text>
   </g>;})}
 </g>;
}
