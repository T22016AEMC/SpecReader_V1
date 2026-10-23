import {SpectrumParser} from '../src/engines/spectrumParser';
import type {ExperimentalSpectrumData} from '../src/types/spectrum';

/**
 * SYNTHETIC IR image with a segmented wavenumber axis (scale changes at 2000 cm⁻¹, 2:1), shaped like the user's
 * report (3000 → px 331, 1500 → px 824, 500 → px 1319). Not a measured spectrum: bands and axis are generated here.
 */
export const BREAK_CM=2000;
export const ABOVE_PX_PER_CM=0.2465;   // left part (above 2000 cm⁻¹)
export const BELOW_PX_PER_CM=0.493;    // right part (below 2000 cm⁻¹), 2 × the left
export const BREAK_PX=577.5;
export const PLOT={top:60,bottom:560};
export function pixelOf(cm:number):number {
 return cm>=BREAK_CM?BREAK_PX-ABOVE_PX_PER_CM*(cm-BREAK_CM):BREAK_PX+BELOW_PX_PER_CM*(BREAK_CM-cm);
}
export function cmOf(px:number):number {
 return px<=BREAK_PX?BREAK_CM+(BREAK_PX-px)/ABOVE_PX_PER_CM:BREAK_CM-(px-BREAK_PX)/BELOW_PX_PER_CM;
}
/** [centre cm⁻¹, width cm⁻¹, depth %T]. */
export const BANDS:[number,number,number][]=[[3500,120,35],[3050,15,15],[2960,14,40],[2870,12,28],[1600,10,45],[1510,10,50],[1385,6,20],[1365,6,24],[1240,18,60],[830,12,40]];
export function transmittance(cm:number,bands:[number,number,number][]=BANDS):number {
 let y=95;for(const [c,w,h] of bands)y-=h*Math.exp(-.5*((cm-c)/w)**2);return y;
}
const pyOf=(t:number)=>PLOT.bottom-(t/100)*(PLOT.bottom-PLOT.top);
/** Calibration reference points the user would click: wavenumber → its true pixel on this synthetic axis. */
export const refPoint=(cm:number)=>({pixelX:Number(pixelOf(cm).toFixed(1)),physicalX:cm});
/** Image spectrum with a traced curve and one user mark at the true pixel of every band (uncalibrated). */
export function syntheticSegmentedIRImage(marks:number[]=BANDS.map(b=>b[0]),bands:[number,number,number][]=BANDS):ExperimentalSpectrumData {
 const width=1450,height=640;
 const left=Math.ceil(pixelOf(4000)),right=Math.floor(pixelOf(400));
 const spectrum=SpectrumParser.createImageSpectrum({
  modality:'IR',fileName:'synthetic-segmented-axis.png',originalImageUrl:'data:image/png;base64,',imageDimensions:{width,height},
  calibration:{plotLeftPx:left,plotRightPx:right,plotTopPx:PLOT.top,plotBottomPx:PLOT.bottom,plotBoundaryStatus:'DETECTED'},
  digitizationMethod:'Manual',
  detectedSignals:marks.map(cm=>({pixelX:Number(pixelOf(cm).toFixed(1)),pixelY:Number(pyOf(transmittance(cm,bands)).toFixed(1)),label:'',source:'USER' as const,verifiedByUser:true,confidence:1})),
 });
 const curve:{x:number;y:number}[]=[];
 for(let px=left;px<=right;px++)curve.push({x:px,y:Number(pyOf(transmittance(cmOf(px),bands)).toFixed(2))});
 // Same intensity settings as the real traced-image path (SpectrumParser image trace): relative image scale, unknown %T/A.
 return {...spectrum,irPixelCurve:curve,irIntensityScale:'UNKNOWN',yUnit:'相對影像尺度（非吸光度）'};
}
