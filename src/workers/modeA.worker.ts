import {refreshIRSnapshot} from '../engines/scientificEngines/irSignalProcessing';
import {WorkbenchOrchestrator} from '../engines/workbenchOrchestrator';
import {initializeRDKit,rdkitStatus} from '../engines/scientificEngines/rdkitAdapter';
import type {AnalysisInput} from '../engines/analysisSession';
self.onmessage=async(e:MessageEvent<AnalysisInput>)=>{try{await initializeRDKit();if(e.data.spectra.IR?.irManualSettings)e.data.spectra.IR=refreshIRSnapshot(e.data.spectra.IR);const result=WorkbenchOrchestrator.runModeAPipeline(e.data.spectra,e.data.extraInput);self.postMessage({result:{...result,inputSpectra:e.data.spectra,runtime:{rdkitAvailable:rdkitStatus().available}}});}catch(error){self.postMessage({error:error instanceof Error?error.message:'資料處理失敗'});}};
