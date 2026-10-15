import {inferIRBands,irCandidateBands} from './scientificEngines/irBandKnowledge';
import {prepareIR} from "./scientificEngines/irSignalProcessing";
import {
  ExperimentalSpectrumData,
  FunctionalGroupConstraint,
  IRFunctionalGroupFinding,
  ParsedChemicalStructure,
  SpectralPeak,
  StructuralConstraints,
} from "../types/spectrum";
import { DataValidator } from "./dataValidator";
import { SpectrumParser } from "./spectrumParser";

export class IRAnalysisEngine {
  static analyzeExperimentalIR(spectrum?: ExperimentalSpectrumData): {
    findings: IRFunctionalGroupFinding[];
    structuralConstraints: StructuralConstraints;
    statusMessage: string;
  } {
    if (spectrum) spectrum = prepareIR(spectrum);
    if (!spectrum || spectrum.digitizationFailed || !spectrum.validation.isValid || spectrum.peaks.length === 0) {
      return {
        findings: [],
        structuralConstraints: {
          source: "IR",
          confidence: 0,
          evidence: [],
        },
        statusMessage: spectrum?.digitizationFailed
          ? "IR 分析無法可靠完成（圖片數位化失敗，未擷取到有效峰值）。"
          : "IR 資料不足或未提供，無法執行 IR 官能基篩選。",
      };
    }

    const findings=inferIRBands(spectrum);
    return {findings,structuralConstraints:this.buildStructuralConstraints(spectrum,findings),statusMessage:`區間與化學環境競爭模型：${findings.length} 項假設；峰型、寬度、相對強度及伴隨峰已參與，非唯一結構確認。`};
  }

  static buildStructuralConstraints(
    spectrum?: ExperimentalSpectrumData,
    precomputedFindings?: IRFunctionalGroupFinding[]
  ): StructuralConstraints {
    if (spectrum) spectrum = prepareIR(spectrum);
    if (!spectrum || spectrum.digitizationFailed || spectrum.peaks.length === 0) {
      return { source: "IR", confidence: 0, evidence: [] };
    }

    const findings =
      precomputedFindings !== undefined
        ? precomputedFindings
        : this.analyzeExperimentalIR(spectrum).findings;

    // IR interpretations compete. Neither a group-frequency hypothesis nor a
    // missing band is an elemental/valence hard constraint.
    const groups:FunctionalGroupConstraint[]=findings.map(f=>({
      groupFamily:f.family,label:f.functionalGroup,status:'CANDIDATE',
      observedSignal:`${f.observedPeak} cm⁻¹ (${f.observedWidthAndShape})`,
      expectedRange:f.expectedRange,sourceModality:'IR',confidence:f.confidence,reasoning:f.reasoning,
    }));
    const aromatic=findings.filter(f=>f.family==='Aromatic');
    const carbonyl=findings.filter(f=>['Aldehyde','Ketone','Ester','Carboxylic acid','Amide','Anhydride','Acyl halide'].includes(f.family)&&f.observedPeak>=1600&&f.observedPeak<=1870);
    const subtypes=carbonyl.map(f=>f.family).filter((f):f is 'Aldehyde'|'Ketone'|'Ester'|'Carboxylic acid'|'Amide'=>['Aldehyde','Ketone','Ester','Carboxylic acid','Amide'].includes(f));
    return {source:'IR',requiredFunctionalGroups:groups,excludedFunctionalGroups:[],
      aromaticity:aromatic.length?{status:'POSSIBLE',substitutionPatternHint:'unknown',supportingSignals:aromatic.map(f=>`${f.observedPeak} cm⁻¹`),confidence:Math.min(70,...aromatic.map(f=>f.confidence))}:undefined,
      carbonyl:carbonyl.length?{status:'POSSIBLE',allowedSubtypes:[...new Set(subtypes)],supportingSignals:carbonyl.map(f=>`${f.observedPeak} cm⁻¹：${f.family}`),confidence:Math.min(70,Math.max(...carbonyl.map(f=>f.confidence)))}:undefined,
      dbe:{minDbe:0,allowsAromaticRing:aromatic.length>0,allowsCarbonylOrUnsaturation:carbonyl.length>0||aromatic.length>0,confidence:50},
      confidence:findings.length?Math.max(...findings.map(f=>f.confidence)):0,
      evidence:findings.map(f=>({modality:'IR',observation:`${f.observedPeak} cm⁻¹ (${f.observedWidthAndShape})`,interpretation:f.functionalGroup,constraintSummary:`競爭假設：${f.family}；不可用來硬排除其他候選`,modelType:'EMPIRICAL',confidence:f.confidence,signalPosition:f.observedPeak,unit:'cm⁻¹'})),
    };
  }

  /**
   * Mode B: 依據使用者輸入分子結構之實際化學圖、官能基、共軛、誘導效應、環張力與分子內/分子間氫鍵，預測 IR 振動光譜與科學解釋
   */
  static predictIRFromStructure(structure: ParsedChemicalStructure): {
    spectrum: ExperimentalSpectrumData;
    predictions: IRFunctionalGroupFinding[];
  } {
    const bands=irCandidateBands(structure.smiles??'');
    const peaks:SpectralPeak[]=bands.map(k=>({id:`ir-range-pred-${k.id}`,x:(k.range[0]+k.range[1])/2,y:k.intensity==='strong'?85:k.intensity==='medium'?55:k.intensity==='weak'?25:45,width:k.shape==='broad'?(k.widthRange[0]+k.widthRange[1])/2:25,shape:k.shape==='broad'?'broad':'sharp',isBroad:k.shape==='broad',isPredictedPeak:true,predictedRange:[k.range[0]-k.uncertainty,k.range[1]+k.uncertainty],assignment:`${k.label}／${k.environment}（條件競爭假設，未必同時出現）`}));
    const spectrum:ExperimentalSpectrumData={modality:'IR',fileName:`${structure.molecularFormula}_range_IR.jdx`,sourceFormat:'SIMULATED',sourceType:'PREDICTED_SPECTRUM',dataOrigin:'EMPIRICAL_SIMULATION',modelType:'EMPIRICAL',isSimulated:true,xUnit:'波數 (cm⁻¹)',yUnit:'經驗相對特徵（非量子吸光度）',points:SpectrumParser.synthesizeCurveFromPeaks('IR',peaks),peaks,validation:DataValidator.validateSpectrum('IR','SIMULATED',[],peaks,false)};
    return {spectrum,predictions:inferIRBands({...spectrum,isSimulated:false})};
  }

  static predictEmpiricalIR(structure: ParsedChemicalStructure) {
    return this.predictIRFromStructure(structure);
  }
}

export { IRAnalysisEngine as IREngine };



