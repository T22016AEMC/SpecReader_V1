import {refreshIRSnapshot} from '../engines/scientificEngines/irSignalProcessing';
import {initializeRDKit,rdkitStatus} from '../engines/scientificEngines/rdkitAdapter';
import {executeSixStepAnalysis} from '../engines/reasoning/sixStepAnalysis';
import type {AnalysisInput} from '../engines/analysisSession';
let cancelled=false,running=false;
self.onmessage=async(e:MessageEvent<AnalysisInput|{type:'cancel'}>)=>{
 if('type' in e.data&&e.data.type==='cancel'){cancelled=true;return;}if(running)return;
 running=true;cancelled=false;
 try {
  const input=e.data as AnalysisInput;await initializeRDKit();if(input.spectra.IR?.irManualSettings)input.spectra.IR=refreshIRSnapshot(input.spectra.IR);
  const result=await executeSixStepAnalysis(input,{shouldCancel:()=>cancelled,onProgress:progress=>self.postMessage({type:'progress',progress})});
  self.postMessage({type:'result',result:{...result,runtime:{rdkitAvailable:rdkitStatus().available}}});
 }catch(error){self.postMessage({error:error instanceof Error?error.message:'資料處理失敗'});}finally{running=false;}
};
