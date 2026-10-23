import React from 'react';
import {AXIS_CALIBRATION_CONFIG as CFG} from '../engines/scientificEngines/axisCalibrationConfig';
import type {CalibrationCheck} from '../engines/scientificEngines/axisCalibrationPanel';

/** Per-point check inside the preview panel: entered value, converted value and difference; red when beyond tolerance. */
export function CalibrationCheckTable({check,xUnit,digits}:{check:CalibrationCheck;xUnit:string;digits:number}) {
 if(check.rows.length===0)return null;
 return <div data-testid="calibration-check" className="mt-2">
  <div className="flex items-center justify-between text-[10px] text-slate-400">
   <span className="font-bold text-slate-200">{CFG.ui.checkTableTitle}</span><span>{CFG.ui.checkBasisText[check.basis]}（容許差值 {check.tolerance.toFixed(2)} {xUnit}）</span>
  </div>
  <table className="mt-1 w-full border-collapse text-left font-mono text-[11px]">
   <thead><tr className="border-b border-slate-800 text-[10px] text-slate-400"><th className="py-1 pr-2">點</th><th className="px-2 py-1">輸入值</th><th className="px-2 py-1">換算值</th><th className="py-1 pl-2">差值</th></tr></thead>
   <tbody className="divide-y divide-slate-800/60">{check.rows.map(r=><tr key={r.label+r.pixelX}>
    <td className="py-1 pr-2 text-slate-300">{r.label} (px {r.pixelX})</td><td className="px-2 py-1">{r.input.toFixed(digits)}</td><td className="px-2 py-1">{r.converted.toFixed(digits)}</td>
    <td data-flagged={r.flagged} className={`py-1 pl-2 font-bold ${r.flagged?'text-red-400':'text-emerald-300'}`}>{r.diff>=0?'+':''}{r.diff.toFixed(digits)}</td>
   </tr>)}</tbody>
  </table>
 </div>;
}
