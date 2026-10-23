import {AXIS_CALIBRATION_CONFIG as CFG,type AxisPresetId} from './axisCalibrationConfig';
import {buildPiecewiseAxis,checkLinearity,physicalFromPixel,reproductionTolerance,type AxisKnot,type AxisPoint} from './axisCalibration';

/**
 * Pure model of the page-2 calibration panel (v1.1.7-hotfix.2): which mapping each mode would apply and how far every
 * calibration point lands from its entered value. Mirrors the calibration engines but writes nothing.
 */
export type PanelCalibrationMode='TWO_POINT'|'THREE_POINT'|'PIECEWISE';
export interface PanelPoint extends AxisPoint {label:string}
export interface CalibrationCheckRow {label:string;pixelX:number;input:number;converted:number;diff:number;flagged:boolean}
export interface CalibrationCheck {
 basis:PanelCalibrationMode;rows:CalibrationCheckRow[];tolerance:number;
 /** Non-linearity warning for a straight-line mode; null when the line fits or the mode is piecewise. */
 warning:string|null;
 /** Why the mode cannot be previewed or applied (piecewise validation); null when it can. */
 error:string|null;
 knots:AxisKnot[]|null;
}

/** Ordinary least squares of physical value on pixel position — the same fit the 3-point engine uses. */
export function olsLine(points:AxisPoint[]):{slope:number;intercept:number}|null {
 const n=points.length;if(n<2)return null;
 const mx=points.reduce((a,p)=>a+p.pixelX,0)/n,my=points.reduce((a,p)=>a+p.physicalX,0)/n;
 const sxx=points.reduce((a,p)=>a+(p.pixelX-mx)**2,0),sxy=points.reduce((a,p)=>a+(p.pixelX-mx)*(p.physicalX-my),0);
 if(sxx<1e-12)return null;const slope=sxy/sxx;return {slope,intercept:my-slope*mx};
}

const rowsFor=(points:PanelPoint[],map:(px:number)=>number,tolerance:number):CalibrationCheckRow[]=>points.map(p=>{
 const converted=map(p.pixelX),diff=converted-p.physicalX;
 return {label:p.label,pixelX:p.pixelX,input:p.physicalX,converted,diff,flagged:Math.abs(diff)>tolerance};
});

export function buildCalibrationCheck(mode:PanelCalibrationMode,points:PanelPoint[],presetId:AxisPresetId|null=null):CalibrationCheck {
 const valid=points.filter(p=>Number.isFinite(p.pixelX)&&Number.isFinite(p.physicalX));
 const span=valid.length>=2?Math.max(...valid.map(p=>p.physicalX))-Math.min(...valid.map(p=>p.physicalX)):0;
 if(mode==='PIECEWISE'){
  const built=buildPiecewiseAxis(valid,{presetId});
  if(!built.ok)return {basis:mode,rows:[],tolerance:reproductionTolerance(span),warning:null,error:built.error,knots:null};
  return {basis:mode,rows:rowsFor(valid,px=>physicalFromPixel(built.knots,px),built.tolerance),tolerance:built.tolerance,warning:null,error:null,knots:built.knots};
 }
 const fitPoints=mode==='TWO_POINT'?valid.slice(0,2):valid.slice(0,3);
 const tolerance=CFG.linearityResidualFractionOfSpan*(fitPoints.length>=2?Math.max(...fitPoints.map(p=>p.physicalX))-Math.min(...fitPoints.map(p=>p.physicalX)):0);
 const line=mode==='TWO_POINT'
  ?(fitPoints.length===2&&Math.abs(fitPoints[1].pixelX-fitPoints[0].pixelX)>1e-9?{slope:(fitPoints[1].physicalX-fitPoints[0].physicalX)/(fitPoints[1].pixelX-fitPoints[0].pixelX),intercept:fitPoints[0].physicalX-fitPoints[0].pixelX*(fitPoints[1].physicalX-fitPoints[0].physicalX)/(fitPoints[1].pixelX-fitPoints[0].pixelX)}:null)
  :olsLine(fitPoints);
 if(!line)return {basis:mode,rows:[],tolerance,warning:null,error:null,knots:null};
 const map=(px:number)=>line.intercept+line.slope*px;
 const rows=rowsFor(fitPoints,map,tolerance);
 // A 2-point line passes through both points by construction, so only 3 or more points can reveal non-linearity.
 const warning=mode==='THREE_POINT'?checkLinearity(fitPoints,map).warning:null;
 return {basis:mode,rows,tolerance,warning,error:null,knots:null};
}

/** Why a 3-point calibration was not applied, in Traditional Chinese, with the fit figures when the engine produced them. */
export function threePointFailureMessage(result:{digitizationErrorMessage?:string;imageCalibration?:{rSquared?:number;rmse?:number;calibrationQuality?:string}},physicalSpan:number):string {
 const c=result.imageCalibration,parts:string[]=[];
 if(c?.calibrationQuality)parts.push(`品質：${c.calibrationQuality}`);
 if(c?.rSquared!==undefined)parts.push(`R² = ${c.rSquared.toFixed(4)}`);
 if(c?.rmse!==undefined&&physicalSpan>0)parts.push(`標準化 RMSE = ${(c.rmse/physicalSpan).toFixed(3)}`);
 const reason=result.digitizationErrorMessage||'三個校正點無法以同一條直線擬合。';
 return `${CFG.ui.threePointFailedPrefix}${parts.length?`（${parts.join('，')}）`:''}：${reason}${CFG.ui.threePointFailedNoApplyText}`;
}
