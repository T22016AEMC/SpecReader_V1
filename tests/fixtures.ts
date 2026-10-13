import type {ExperimentalSpectrumData,SpectralPeak} from '../src/types/spectrum';
export function spectrum(modality:ExperimentalSpectrumData['modality'],peaks:SpectralPeak[],unit='Intensity'):ExperimentalSpectrumData {
  return {modality,fileName:'synthetic-fixture.csv',sourceFormat:'CSV',isSimulated:false,sourceType:'NUMERIC_EXPERIMENTAL',xUnit:modality==='IR'?'cm⁻¹':modality==='MS'?'m/z':'ppm',yUnit:unit,points:peaks.map(p=>({x:p.x,y:p.y})),peaks,validation:{isValid:true,qualityScore:95,issues:[]}};
}
