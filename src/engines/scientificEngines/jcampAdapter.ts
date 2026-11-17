import {convert} from 'jcampconverter';
import type {DataPoint} from '../../types/spectrum';
interface DecodedSpectrum {data?:{x?:unknown;y?:unknown};xUnits?:unknown;yUnits?:unknown}
/**
 * v1.4.2 stop 29 (B): wavelength axes are converted to wavenumbers (cm-1) when the file is read, because every IR rule works in cm-1.
 * MICROMETERS (also MICRON / MICRONS): x -> 10000 / x.  NANOMETERS: x -> 1e7 / x.  Everything else (1/CM, CM-1, PPM, M/Z, HZ, ...) is left exactly as it was.
 * The points are re-sorted ascending after the conversion (the conversion reverses the order). The unit is then reported as '1/CM' (the spelling the JCAMP files that are already in cm-1 use) and the original unit is returned as `xUnitOriginal`.
 */
const X_TO_WAVENUMBER:{unit:RegExp;numerator:number}[]=[
  {unit:/^micro(meter|metre|n)s?$/i,numerator:1e4},
  {unit:/^nano(meter|metre)s?$/i,numerator:1e7},
];
/** MIT jcampconverter 9.6.4. Decode factors, SQZ/DIF/DUP; never reinterpret T as 100−T. */
export function decodeJcamp(text:string):{points:DataPoint[];xUnit:string;yUnit:string;xUnitOriginal?:string} {
  if(text.length>12*1024*1024)throw new Error('JCAMP 檔案超過 12 MB 限制。');
  const declared=Number(text.match(/^##NPOINTS\s*=\s*(\d+)/mi)?.[1]);
  if(declared>50000)throw new Error('桌面科學流程目前限制 50,000 點；請先按儀器解析度合理降採樣。');
  const result=convert(text,{noContour:true});
  const spectra=result.flatten.flatMap(e=>e.spectra) as DecodedSpectrum[];
  if(spectra.length!==1)throw new Error('需要單一一維 JCAMP 光譜；多區塊／二維資料請先分離。');
  const spectrum=spectra[0],x=spectrum.data?.x,y=spectrum.data?.y;
  if(!Array.isArray(x)||!Array.isArray(y)||x.length!==y.length||!x.length||x.length>50000)throw new Error('JCAMP 數值資料無效或超過 50,000 點限制。');
  const points=x.map((value,i)=>({x:Number(value),y:Number(y[i])}));
  if(points.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)))throw new Error('JCAMP 含無效座標。');
  const xUnit=String(spectrum.xUnits??'Unknown'),conversion=X_TO_WAVENUMBER.find(c=>c.unit.test(xUnit.trim()));
  if(!conversion)return {points,xUnit,yUnit:String(spectrum.yUnits??'Unknown')};
  const converted=points.map(p=>({x:conversion.numerator/p.x,y:p.y}));
  if(converted.some(p=>!Number.isFinite(p.x)||p.x<=0))throw new Error(`JCAMP 的 x 軸單位是 ${xUnit}，換算成波數時遇到 0 或負值，無法換算。`);
  converted.sort((a,b)=>a.x-b.x);
  return {points:converted,xUnit:'1/CM',yUnit:String(spectrum.yUnits??'Unknown'),xUnitOriginal:xUnit};
}
