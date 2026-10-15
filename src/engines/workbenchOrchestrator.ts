import {measureIRBandMorphology} from './scientificEngines/irSignalProcessing';
import {generationStatus,type GenerationStatus} from './candidateGeneration/generationStatus';
import {observationSpectrum} from './scientificEngines/observationSemantics';
import {
  CandidateResult,
  CandidateStructure,
  ExperimentalSpectrumData,
  ExtendedSpectrumModality,
  ModeADeductionReport,
  ModeBPredictionReport,
  NMRSolvent,
  ParsedChemicalStructure,
  SpectralPeak,
  SpectrumEvidence,
  SpectrumModality,
} from "../types/spectrum";
import { CandidateGenerator } from "./candidateGenerator";
import {
  ExtraChemicalEvidenceInput,
  IntegratedAnalysisBundle,
} from "./chemicalFeatureEngine";
import { ChemistryEngine } from "./chemistryEngine";
import { DataValidator } from "./dataValidator";
import { ReasoningEngine } from "./reasoningEngine";
import { CrossSpectrumValidationMatrixRow } from "./scientificEngines/crossSpectrumValidator";
import {
  RejectedCandidateGraphRecord,
  ValidatedCandidateGraph,
} from "./scientificEngines/deterministicStructureGenerator";
import { SolvedConstraintSpace } from "./scientificEngines/fragmentConstraintSolver";
import {
  BidirectionalValidationReport,
  PredictionAndValidationFramework,
} from "./scientificEngines/predictionAndValidationFramework";
import { SpectralEvidenceExtractor } from "./scientificEngines/spectralEvidenceExtractor";
import { SpectrumParser } from "./spectrumParser";

export type WorkbenchStageId =
  | "STAGE_1_INPUT"
  | "STAGE_2_VALIDATION"
  | "STAGE_3_PEAKS_EVIDENCE"
  | "STAGE_4_CONSTRAINTS"
  | "STAGE_5_CANDIDATES"
  | "STAGE_6_VALIDATION_MATRIX"
  | "STAGE_7_REVERSE_PREDICTION";

export interface WorkbenchStageMeta {
  id: WorkbenchStageId;
  stepNumber: number;
  shortTitle: string;
  fullTitle: string;
  subtitle: string;
}

export const WORKBENCH_STAGES: WorkbenchStageMeta[] = [
  {
    id: "STAGE_1_INPUT",
    stepNumber: 1,
    shortTitle: "光譜輸入",
    fullTitle: "1. 實驗光譜輸入與數位化 (Spectrum Input & Digitization)",
    subtitle: "支援 IR / ¹H NMR / ¹³C NMR / MS / MS-MS / ToF-SIMS 多格式與兩點影像校正",
  },
  {
    id: "STAGE_2_VALIDATION",
    stepNumber: 2,
    shortTitle: "資料驗證",
    fullTitle: "2. 獨立光譜資料品質驗證 (Modality Data Validation)",
    subtitle: "檢驗座標軸範圍、波數方向、重複點、基線、雜訊與信號完整性",
  },
  {
    id: "STAGE_3_PEAKS_EVIDENCE",
    stepNumber: 3,
    shortTitle: "峰與證據",
    fullTitle: "3. 峰位編修、溶劑峰排除與規則證據提取 (Peaks & Rule Evidence)",
    subtitle: "手動新增/修改/標記 REAL·SOLVENT·NOISE，自動轉換為確定性光譜證據",
  },
  {
    id: "STAGE_4_CONSTRAINTS",
    stepNumber: 4,
    shortTitle: "結構約束",
    fullTitle: "4. 跨模態結構約束匯總 (Structural Constraints & Formula Space)",
    subtitle: "收斂標稱分子量、氮規則、不飽和度 (IHD)、碳氫環境數與必備/禁用子結構",
  },
  {
    id: "STAGE_5_CANDIDATES",
    stepNumber: 5,
    shortTitle: "候選結構",
    fullTitle: "5. 候選結構生成與分子圖拓撲檢驗 (Candidate Generation & Graph Check)",
    subtitle: "由片段庫組裝候選分子圖與同分異構物，強制通過化合價與連通性驗證",
  },
  {
    id: "STAGE_6_VALIDATION_MATRIX",
    stepNumber: 6,
    shortTitle: "結構驗證",
    fullTitle: "6. 跨光譜一致性驗證矩陣 (Cross-Spectrum Validation Matrix)",
    subtitle: "逐一檢驗 SUPPORTED / COMPATIBLE / CONTRADICTED / NOT PROVIDED",
  },
  {
    id: "STAGE_7_REVERSE_PREDICTION",
    stepNumber: 7,
    shortTitle: "反向光譜",
    fullTitle: "7. 反向光譜預測與雙向疊圖比對 (Structure → Spectrum Overlay)",
    subtitle: "結構正規化 → 理論預測 → 實驗疊圖 → 吻合峰 / 缺漏峰 / 額外峰診斷",
  },
];

export const NMR_SOLVENT_REFERENCE_SHIFTS: Record<
  NMRSolvent,
  { h1Shifts: number[]; c13Shifts: number[]; label: string }
> = {
  CDCl3: {
    h1Shifts: [7.26, 1.56],
    c13Shifts: [77.16],
    label: "CDCl₃ (δH 7.26 ppm s, H₂O 1.56 ppm; δC 77.16 ppm t)",
  },
  "DMSO-d6": {
    h1Shifts: [2.5, 3.33],
    c13Shifts: [39.52],
    label: "DMSO-d₆ (δH 2.50 ppm m, H₂O 3.33 ppm; δC 39.52 ppm)",
  },
  CD3OD: {
    h1Shifts: [3.31, 4.87],
    c13Shifts: [49.0],
    label: "CD₃OD (δH 3.31 ppm, HDO 4.87 ppm; δC 49.00 ppm)",
  },
  D2O: {
    h1Shifts: [4.79],
    c13Shifts: [],
    label: "D₂O (δH 4.79 ppm HDO)",
  },
  "Acetone-d6": {
    h1Shifts: [2.05, 2.84],
    c13Shifts: [29.84, 206.26],
    label: "Acetone-d₆ (δH 2.05 ppm, H₂O 2.84 ppm; δC 29.84, 206.26 ppm)",
  },
  CD3CN: {
    h1Shifts: [1.94, 2.13],
    c13Shifts: [1.32, 118.26],
    label: "CD₃CN (δH 1.94 ppm, H₂O 2.13 ppm; δC 1.32, 118.26 ppm)",
  },
  "C6D6": {
    h1Shifts: [7.16, 0.4],
    c13Shifts: [128.06],
    label: "C₆D₆ (δH 7.16 ppm, H₂O 0.40 ppm; δC 128.06 ppm)",
  },
  "THF-d8": {
    h1Shifts: [3.58, 1.72, 2.46],
    c13Shifts: [67.21, 25.31],
    label: "THF-d₈ (δH 3.58, 1.72 ppm, H₂O 2.46 ppm; δC 67.21, 25.31 ppm)",
  },
  CD2Cl2: {
    h1Shifts: [5.32, 1.52],
    c13Shifts: [53.84],
    label: "CD₂Cl₂ (δH 5.32 ppm, H₂O 1.52 ppm; δC 53.84 ppm)",
  },
  "Toluene-d8": {
    h1Shifts: [2.08, 6.97, 7.01, 7.09, 0.43],
    c13Shifts: [20.43, 125.13, 127.96, 128.87, 137.48],
    label: "Toluene-d₈ (δH 2.08, 6.97–7.09 ppm; δC 20.43, 125.1–137.5 ppm)",
  },
  Unknown: {
    h1Shifts: [],
    c13Shifts: [],
    label: "未指定溶劑 (Unknown)",
  },
};

export interface AuxiliaryModalityData {
  modality: "MS/MS" | "ToF-SIMS";
  fileName: string;
  precursorMz?: number;
  collisionEnergy?: string;
  polarity?: "POSITIVE" | "NEGATIVE";
  peaks: SpectralPeak[];
  diagnosticSummary: string[];
}

export interface WorkbenchOrchestrationState {
  generationStatus?:GenerationStatus;
  bundle: IntegratedAnalysisBundle;
  modeAReport: ModeADeductionReport;
  spectrumEvidenceList: SpectrumEvidence[];
  solvedConstraintSpace: SolvedConstraintSpace;
  validatedGraphs: ValidatedCandidateGraph[];
  rejectedCandidates: RejectedCandidateGraphRecord[];
  rankedCandidates: CandidateResult[];
  validationMatrix: CrossSpectrumValidationMatrixRow[];
  selectedCandidate: CandidateResult | null;
  bidirectionalReport: BidirectionalValidationReport | null;
  modeBReport: ModeBPredictionReport | null;
}

export class WorkbenchOrchestrator {
  /**
   * 獨立執行 Mode A 確定性科學推論管線（嚴格與 Mode B 執行隔離）：
   * 僅執行：實驗證據解析 → 官能基判定 → 結構限制建立 → 候選結構生成 → 跨光譜驗證與排序。
   * 絕不自動呼叫 Mode B 的反向光譜預測或雙向驗證函式，亦不因 selectedCandidateId 觸發任何預測。
   */
  static runModeAPipeline(
    spectra: Partial<
      Record<SpectrumModality | ExtendedSpectrumModality, ExperimentalSpectrumData>
    >,
    extraInput?: ExtraChemicalEvidenceInput
  ): Omit<
    WorkbenchOrchestrationState,
    "selectedCandidate" | "bidirectionalReport" | "modeBReport"
  > {
    spectra=Object.fromEntries(Object.entries(spectra).map(([key,value])=>[key,observationSpectrum(value)]));
    if(extraInput)extraInput={...extraInput,msmsSpectrum:extraInput.msmsSpectrum?observationSpectrum(extraInput.msmsSpectrum):undefined,tofSimsSpectrum:extraInput.tofSimsSpectrum?observationSpectrum(extraInput.tofSimsSpectrum):undefined};
    const normalizedExtraInput: ExtraChemicalEvidenceInput | undefined =
      extraInput || spectra["MS/MS"] || spectra["ToF-SIMS"]
        ? {
            ...extraInput,
            msmsSpectrum: extraInput?.msmsSpectrum || spectra["MS/MS"],
            tofSimsSpectrum: extraInput?.tofSimsSpectrum || spectra["ToF-SIMS"],
          }
        : undefined;

    // 1. Evidence Layer: 提取標準化證據與整合約束 (自動排除標記為 SOLVENT / NOISE 及未校正之訊號)
    const { bundle, spectrumEvidenceList } =
      SpectralEvidenceExtractor.extractAllEvidence(spectra, normalizedExtraInput);

    // 2. Unified Candidate Generation / Validation / Ranking Pipeline (全域唯一權威入口)
    const {
      solvedConstraintSpace,
      validatedGraphs,
      rejectedCandidates,
      rankedCandidates,
      validationMatrix,
    } = CandidateGenerator.executeUnifiedPipelineFromBundle(
      bundle,
      spectrumEvidenceList
    );

    // 3. ReasoningEngine 作為協調者，直接使用同一批權威 rankedCandidates 與 bundle 建立報告，絕不重複生成候選或呼叫 Mode B
    const modeAReport = ReasoningEngine.coordinateModeAReport(
      spectra,
      bundle,
      rankedCandidates
    );

    return {
      generationStatus:generationStatus(bundle.constraints,rankedCandidates.length,solvedConstraintSpace.solverLog,undefined,solvedConstraintSpace.searchResult?{...solvedConstraintSpace.searchResult,rejectedByComposition:solvedConstraintSpace.searchResult.rejectedByComposition+rejectedCandidates.length}:undefined),
      bundle,
      modeAReport,
      spectrumEvidenceList,
      solvedConstraintSpace,
      validatedGraphs,
      rejectedCandidates,
      rankedCandidates,
      validationMatrix,
    };
  }

  /**
   * 獨立執行 Mode B 反向光譜預測管線（必須由使用者明確選擇並提供有效結構輸入後才執行）：
   * 僅依使用者勾選之光譜種類 (selectedModalities) 執行理論預測，絕不自動套用 Mode A 候選結構或預設結構。
   */
  static runModeBPrediction(
    structureInput: string,
    selectedModalities: ExtendedSpectrumModality[] = ["IR", "1H_NMR", "13C_NMR", "MS"],
    experimentalSpectraForOptionalComparison: Partial<
      Record<ExtendedSpectrumModality, ExperimentalSpectrumData>
    > = {}
  ): {
    parsedStructure: ParsedChemicalStructure | null;
    bidirectionalReport: BidirectionalValidationReport | null;
    modeBReport: ModeBPredictionReport | null;
    errorMessage: string | null;
  } {
    const trimmed = (structureInput || "").trim();
    if (!trimmed) {
      return {
        parsedStructure: null,
        bidirectionalReport: null,
        modeBReport: null,
        errorMessage:
          "請輸入有效的化學結構（SMILES、InChI、系統命名或常見化合物名稱）後再執行 Mode B 預測。系統不會自動套用候選結構。",
      };
    }

    const parsedStructure = ChemistryEngine.parseStructureInput(trimmed);
    if (
      parsedStructure.parseFailed ||
      parsedStructure.isValid === false ||
      (!parsedStructure.smiles && !parsedStructure.isFormulaOnly)
    ) {
      return {
        parsedStructure,
        bidirectionalReport: null,
        modeBReport: null,
        errorMessage:
          parsedStructure.parseErrorMessage ||
          (parsedStructure.validationErrors || []).join("；") ||
          `無法解析輸入結構「${trimmed}」，請確認 SMILES 括號、環閉合數字與原子化合價是否正確。`,
      };
    }

    if (parsedStructure.isFormulaOnly || !parsedStructure.smiles) {
      return {
        parsedStructure,
        bidirectionalReport: null,
        modeBReport: null,
        errorMessage: `輸入「${trimmed}」僅為分子式 (${parsedStructure.molecularFormula})，缺乏明確原子連接拓撲 (SMILES)，無法執行唯一結構之 Mode B 光譜預測。請輸入具體結構 SMILES。`,
      };
    }

    const activeModalities: ExtendedSpectrumModality[] =
      selectedModalities.length > 0
        ? selectedModalities
        : ["IR", "1H_NMR", "13C_NMR", "MS"];

    const bidirectionalReport =
      PredictionAndValidationFramework.runBidirectionalValidation(
        parsedStructure,
        experimentalSpectraForOptionalComparison,
        activeModalities
      );

    const modeBReport = ReasoningEngine.runModeBPrediction(
      parsedStructure,
      experimentalSpectraForOptionalComparison
    );

    return {
      parsedStructure,
      bidirectionalReport,
      modeBReport,
      errorMessage: null,
    };
  }

  /**
   * 執行工作台管線（向後相容介面）：
   * Mode A 永遠獨立執行；僅當呼叫端明確傳入非空 customReverseStructureInput 時才執行 Mode B，
   * 絕不因 selectedCandidateId 或排名第一候選結構而自動啟動 Mode B。
   */
  static runFullWorkbenchPipeline(
    spectra: Partial<
      Record<SpectrumModality | ExtendedSpectrumModality, ExperimentalSpectrumData>
    >,
    selectedCandidateId?: string,
    customReverseStructureInput?: string,
    extraInput?: ExtraChemicalEvidenceInput
  ): WorkbenchOrchestrationState {
    const modeAState = this.runModeAPipeline(spectra, extraInput);

    const selectedCandidate =
      modeAState.rankedCandidates.find((c) => c.id === selectedCandidateId) ||
      modeAState.rankedCandidates[0] ||
      null;

    // 嚴格禁止以 selectedCandidate?.smiles 自動觸發 Mode B
    const explicitModeBInput = customReverseStructureInput?.trim() || "";

    let bidirectionalReport: BidirectionalValidationReport | null = null;
    let modeBReport: ModeBPredictionReport | null = null;

    if (explicitModeBInput) {
      const modeBOut = this.runModeBPrediction(
        explicitModeBInput,
        ["IR", "1H_NMR", "13C_NMR", "MS"],
        spectra
      );
      bidirectionalReport = modeBOut.bidirectionalReport;
      modeBReport = modeBOut.modeBReport;
    }

    return {
      ...modeAState,
      selectedCandidate,
      bidirectionalReport,
      modeBReport,
    };
  }

  /**
   * 當使用者變更 NMR 溶劑時，自動比對標準殘餘溶劑位移並標記為 SOLVENT，
   * 保留於原始實驗圖譜但排除於未知物結構推論之外。
   */
  static applyNmrSolventTagging(
    spectrum: ExperimentalSpectrumData,
    solvent: NMRSolvent
  ): ExperimentalSpectrumData {
    const ref = NMR_SOLVENT_REFERENCE_SHIFTS[solvent];
    if (!ref) return { ...spectrum, nmrSolvent: solvent };

    const targetShifts =
      spectrum.modality === "1H_NMR"
        ? ref.h1Shifts
        : spectrum.modality === "13C_NMR"
          ? ref.c13Shifts
          : [];
    const tolerance = spectrum.modality === "1H_NMR" ? 0.06 : 0.6;

    const updatedPeaks = spectrum.peaks.map((pk) => {
      const isSolventMatch = targetShifts.some(
        (s) => Math.abs(pk.x - s) <= tolerance
      );
      if (isSolventMatch) {
        return {
          ...pk,
          userClassification: "SOLVENT" as const,
          isSolventVerified: true,
          assignment:
            pk.assignment && pk.assignment.includes("溶劑")
              ? pk.assignment
              : `[${solvent} 殘餘溶劑峰] 已排除於結構推論`,
        };
      }
      // 若原本是自動標記的舊溶劑，切回 Compound
      if (pk.isSolventVerified && pk.userClassification === "SOLVENT") {
        return {
          ...pk,
          userClassification: "COMPOUND" as const,
          isSolventVerified: false,
        };
      }
      return pk;
    });

    return {
      ...spectrum,
      nmrSolvent: solvent,
      peaks: updatedPeaks,
    };
  }

  /**
   * 手動新增實驗峰並同步更新特徵訊號、原圖標記與驗證報告（絕不為圖片光譜合成假曲線）
   */
  static addManualPeak(
    spectrum: ExperimentalSpectrumData,
    newPeak: {
      x?: number;
      y?: number;
      pixelX?: number;
      pixelY?: number;
      multiplicity?: SpectralPeak["multiplicity"];
      integral?: number;
      integration?: number | null;
      jValues?: number[];
      deptType?: SpectralPeak["deptType"];
      carbonType?: SpectralPeak["carbonType"];
      irIntensity?: SpectralPeak["irIntensity"];
      bandShape?: SpectralPeak["bandShape"];
      vibrationType?: SpectralPeak["vibrationType"];
      isCalibrated?: boolean;
      signalDirection?: "PEAK_TOP" | "ABSORPTION_VALLEY" | "SHOULDER" | "ION_BAR";
      assignment?: string;
      userClassification?: SpectralPeak["userClassification"];
    }
  ): ExperimentalSpectrumData {
    const updated = SpectrumParser.upsertUserSignalAnnotation(spectrum, {
      x: newPeak.x,
      y: newPeak.y ?? 75,
      pixelX: newPeak.pixelX,
      pixelY: newPeak.pixelY,
      isCalibrated: newPeak.isCalibrated,
      signalDirection: newPeak.signalDirection,
      label: newPeak.assignment || "使用者手動標記訊號",
      assignment: newPeak.assignment || "使用者手動標記訊號",
      multiplicity: newPeak.multiplicity,
      integration: newPeak.integral ?? newPeak.integration ?? null,
      jValues: newPeak.jValues,
      deptType: newPeak.deptType,
      carbonType: newPeak.carbonType,
      irIntensity: newPeak.irIntensity,
      bandShape: newPeak.bandShape,
      vibrationType: newPeak.vibrationType,
      userClassification: newPeak.userClassification || "COMPOUND",
      classificationTag: newPeak.userClassification || "COMPOUND",
      isSolventVerified: newPeak.userClassification === "SOLVENT",
      provenance: "USER_DEFINED",
    });

    const sortedPeaks = [...updated.peaks].sort((a, b) =>
      spectrum.modality === "IR" ||
      spectrum.modality === "1H_NMR" ||
      spectrum.modality === "13C_NMR"
        ? b.x - a.x
        : a.x - b.x
    );

    return {
      ...updated,
      peaks: spectrum.modality==='IR'?sortedPeaks.map(p=>{const m=measureIRBandMorphology(spectrum,p);return {...p,shape:m.shape,isBroad:m.shape==='broad',irShapeSource:p.irShapeSource==='USER'?'USER':m.shape==='UNRESOLVED'?'UNKNOWN':'AUTO',fwhm:m.fwhm};}):sortedPeaks,
    };
  }

  /**
   * 手動修改既有實驗峰之位置、強度、裂分、積分、指認或標記 (REAL/SOLVENT/NOISE/IMPURITY/OVERLAP)
   */
  static updatePeak(
    spectrum: ExperimentalSpectrumData,
    peakId: string,
    patch: Partial<SpectralPeak>
  ): ExperimentalSpectrumData {
    const existing = spectrum.peaks.find((pk) => pk.id === peakId);
    if (!existing) return spectrum;

    const merged: SpectralPeak = {
      ...existing,
      ...patch,
      integral:
        patch.integral !== undefined
          ? patch.integral
          : patch.integration !== undefined
          ? patch.integration ?? undefined
          : existing.integral,
      integration:
        patch.integration !== undefined
          ? patch.integration
          : patch.integral !== undefined
          ? patch.integral
          : existing.integration,
      manualEdited: true,
      userModified: true,
      provenance:
        existing.provenance === "USER_DEFINED" ? "USER_DEFINED" : "USER_MODIFIED",
    };

    const effectiveClass = patch.userClassification ?? patch.classificationTag ?? merged.userClassification;
    if (effectiveClass === "SOLVENT") {
      merged.isSolventVerified = true;
      merged.role = "SOLVENT";
      merged.signalRole = "SOLVENT";
      merged.classificationTag = "SOLVENT";
      merged.userClassification = "SOLVENT";
    } else if (effectiveClass === "NOISE") {
      merged.isSolventVerified = false;
      merged.role = "ARTIFACT";
      merged.signalRole = "ARTIFACT";
      merged.classificationTag = "NOISE";
      merged.userClassification = "NOISE";
    } else if (effectiveClass === "IMPURITY") {
      merged.isSolventVerified = false;
      merged.role = "IMPURITY";
      merged.signalRole = "IMPURITY";
      merged.classificationTag = "IMPURITY";
      merged.userClassification = "IMPURITY";
    } else if (effectiveClass) {
      merged.isSolventVerified = false;
      merged.role = "ANALYTE";
      merged.signalRole = "ANALYTE";
      merged.classificationTag = effectiveClass;
      merged.userClassification = effectiveClass;
    }

    const updated = SpectrumParser.upsertUserSignalAnnotation(spectrum, {
      id: peakId,
      x: merged.x,
      y: merged.y,
      pixelX: merged.pixelX,
      pixelY: merged.pixelY,
      isCalibrated: merged.isCalibrated,
      signalDirection: merged.signalDirection,
      label: merged.assignment,
      assignment: merged.assignment,
      multiplicity: merged.multiplicity,
      integration: merged.integration ?? merged.integral ?? null,
      jValues: merged.jValues,
      deptType: merged.deptType,
      carbonType: merged.carbonType,
      irIntensity: merged.irIntensity,
      bandShape: merged.bandShape,
      vibrationType: merged.vibrationType,
      signalRole: merged.signalRole,
      role: merged.role,
      classificationTag: merged.classificationTag,
      userClassification: merged.userClassification,
      isSolventVerified: merged.isSolventVerified,
      solventName: merged.solventName,
      provenance: merged.provenance,
    });
    return {...updated,irProcessingApplied:false,dataVersion:(spectrum.dataVersion??0)+1,peaks:updated.peaks.map(p=>p.id===peakId?{...existing,...p,...patch,manualEdited:true,userModified:true}:p)};
  }

  /**
   * 刪除指定實驗峰
   */
  static deletePeak(
    spectrum: ExperimentalSpectrumData,
    peakId: string
  ): ExperimentalSpectrumData {
    return SpectrumParser.deletePeakAnnotation(spectrum, peakId);
  }

  /**
   * 執行兩點像素座標校正 (2-Point Pixel → Spectral Coordinate Calibration)
   * 對原始圖片光譜僅更新座標映射與峰值物理位置，絕不產生合成假曲線
   */
  static applyTwoPointCalibration(
    spectrum: ExperimentalSpectrumData,
    calibration: {
      pointA: { pixelX: number; pixelY: number; realX: number; realY: number };
      pointB: { pixelX: number; pixelY: number; realX: number; realY: number };
    }
  ): ExperimentalSpectrumData {
    const { pointA, pointB } = calibration;
    const dPixelX = pointB.pixelX - pointA.pixelX || 1;
    const dRealX = pointB.realX - pointA.realX;
    const scaleX = dRealX / dPixelX;

    if (
      spectrum.digitizedFromImage ||
      spectrum.sourceType === "IMAGE_EXPERIMENTAL" ||
      spectrum.sourceFormat === "IMAGE" ||
      spectrum.sourceFormat === "PNG" ||
      spectrum.sourceFormat === "JPG" ||
      spectrum.sourceFormat === "JPEG" ||
      spectrum.sourceFormat === "WEBP" ||
      spectrum.sourceFormat === "IMAGE_DIGITIZED"
    ) {
      const recalibrated = SpectrumParser.calibrateImageFromTwoPoints(
        spectrum,
        { pixelX: pointA.pixelX, physicalX: pointA.realX },
        { pixelX: pointB.pixelX, physicalX: pointB.realX }
      );
      const newMin = Math.min(pointA.realX, pointB.realX);
      const newMax = Math.max(pointA.realX, pointB.realX);

      return {
        ...recalibrated,
        points: [],
        digitizedMetadata: {
          ...(recalibrated.digitizedMetadata || {
            rawImageDataUrl:
              recalibrated.originalImageUrl ||
              recalibrated.imagePreviewUrl ||
              "",
            imageWidth: recalibrated.imageDimensions?.width || 800,
            imageHeight: recalibrated.imageDimensions?.height || 450,
            extractionMethod:
              recalibrated.digitizationMethod === "Gemini Vision"
                ? "GEMINI_VISION"
                : "LOCAL_CANVAS",
          }),
          isTwoPointCalibrated: true,
          calibrationPointA: pointA,
          calibrationPointB: pointB,
          xRange: [newMin, newMax],
          yRange: [
            Math.min(pointA.realY, pointB.realY),
            Math.max(pointA.realY, pointB.realY),
          ],
          calibrationQuality: "HIGH",
          digitizationConfidence: 0.96,
          confidenceScore: 0.96,
          methodDescription: `2-point calibrated [A(${pointA.pixelX},${pointA.pixelY})→(${pointA.realX},${pointA.realY}), B(${pointB.pixelX},${pointB.pixelY})→(${pointB.realX},${pointB.realY}), Δx/px=${scaleX.toFixed(4)}]`,
        },
      };
    }

    // 數值圖譜線性映射更新
    const allOldX = [
      ...spectrum.points.map((p) => p.x),
      ...spectrum.peaks.map((p) => p.x),
    ];
    const xMinOld = allOldX.length > 0 ? Math.min(...allOldX) : 0;
    const xMaxOld = allOldX.length > 0 ? Math.max(...allOldX) : 100;
    const oldSpan = xMaxOld - xMinOld || 1;
    const newMin = Math.min(pointA.realX, pointB.realX);
    const newMax = Math.max(pointA.realX, pointB.realX);
    const newSpan = newMax - newMin || oldSpan;

    const mapX = (oldX: number) =>
      Number((newMin + ((oldX - xMinOld) / oldSpan) * newSpan).toFixed(2));

    const updatedPoints = spectrum.points.map((pt) => ({
      x: mapX(pt.x),
      y: pt.y,
    }));

    const updatedPeaks = spectrum.peaks.map((pk) => ({
      ...pk,
      x: mapX(pk.x),
    }));

    const validation = DataValidator.validateSpectrum(
      spectrum.modality,
      spectrum.sourceFormat,
      updatedPoints,
      updatedPeaks,
      false
    );

    return {
      ...spectrum,
      points: updatedPoints,
      peaks: updatedPeaks,
      validation,
      digitizedMetadata: {
        ...(spectrum.digitizedMetadata || {
          xRange: [newMin, newMax],
          yRange: [
            Math.min(pointA.realY, pointB.realY),
            Math.max(pointA.realY, pointB.realY),
          ],
          confidenceScore: 0.94,
          calibrationQuality: "HIGH",
          methodDescription: "使用者手動兩點座標校正 (2-point calibrated)",
        }),
        isTwoPointCalibrated: true,
        calibrationPointA: pointA,
        calibrationPointB: pointB,
        xRange: [newMin, newMax],
        calibrationQuality: "HIGH",
        confidenceScore: Math.max(
          0.92,
          spectrum.digitizedMetadata?.confidenceScore || 0.92
        ),
        methodDescription: `2-point calibrated [A(${pointA.pixelX},${pointA.pixelY})→(${pointA.realX},${pointA.realY}), B(${pointB.pixelX},${pointB.pixelY})→(${pointB.realX},${pointB.realY}), Δx/px=${scaleX.toFixed(4)}]`,
      },
    };
  }

  /**
   * 執行三點最小平方法座標校正 (3-Point Linear Least-Squares Image Calibration)
   * 計算 slope, intercept, R², RMSE 與各點殘差 (residuals)
   */
  static applyThreePointCalibration(
    spectrum: ExperimentalSpectrumData,
    pointsOrObj:
      | [
          { pixelX: number; physicalX: number },
          { pixelX: number; physicalX: number },
          { pixelX: number; physicalX: number },
        ]
      | {
          pointA: { pixelX: number; pixelY?: number; realX: number; realY?: number };
          pointB: { pixelX: number; pixelY?: number; realX: number; realY?: number };
          pointC: { pixelX: number; pixelY?: number; realX: number; realY?: number };
        }
  ): ExperimentalSpectrumData {
    const [p1, p2, p3] = Array.isArray(pointsOrObj)
      ? pointsOrObj
      : [
          { pixelX: pointsOrObj.pointA.pixelX, physicalX: pointsOrObj.pointA.realX },
          { pixelX: pointsOrObj.pointB.pixelX, physicalX: pointsOrObj.pointB.realX },
          { pixelX: pointsOrObj.pointC.pixelX, physicalX: pointsOrObj.pointC.realX },
        ];
    const recalibrated = SpectrumParser.calibrateImageFromThreePoints(
      spectrum,
      p1,
      p2,
      p3
    );
    const cal = recalibrated.imageCalibration;
    return {
      ...recalibrated,
      points: [],
      digitizedMetadata: {
        ...(recalibrated.digitizedMetadata || {
          rawImageDataUrl:
            recalibrated.originalImageUrl ||
            recalibrated.imagePreviewUrl ||
            "",
          imageWidth: recalibrated.imageDimensions?.width || 800,
          imageHeight: recalibrated.imageDimensions?.height || 450,
          extractionMethod:
            recalibrated.digitizationMethod === "Gemini Vision"
              ? "GEMINI_VISION"
              : "LOCAL_CANVAS",
        }),
        isTwoPointCalibrated: true,
        calibrationQuality: cal?.calibrationQuality || "GOOD",
        digitizationConfidence: cal?.confidence ?? 0.96,
        confidenceScore: cal?.confidence ?? 0.96,
        methodDescription: `3-point OLS calibrated [R²=${(cal?.rSquared ?? 1).toFixed(5)}, RMSE=${(cal?.rmse ?? 0).toFixed(3)}, Grade=${cal?.calibrationQuality || "GOOD"}]`,
      },
    };
  }

  /**
   * 人工修正圖片圖表邊界 (plotLeftPx, plotRightPx, plotTopPx, plotBottomPx) 並重新映射訊號
   */
  static updatePlotBoundaries(
    spectrum: ExperimentalSpectrumData,
    bounds: {
      plotLeftPx: number;
      plotRightPx: number;
      plotTopPx: number;
      plotBottomPx: number;
    }
  ): ExperimentalSpectrumData {
    return SpectrumParser.updateImagePlotBoundaries(spectrum, bounds);
  }
}

