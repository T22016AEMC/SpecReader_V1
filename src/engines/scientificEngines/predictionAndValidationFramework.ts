import {
  ChemicalFeatureEvidence,
  EvidenceSpectrumSource,
  ExperimentalSpectrumData,
  ModalityPredictionAdapter,
  ParsedChemicalStructure,
  PredictedSpectrumBundle,
  SpectrumModality,
  ValidationResult,
} from "../../types/spectrum";
import { ChemistryEngine } from "../chemistryEngine";
import { IRAnalysisEngine, IREngine } from "../irEngine";
import { MSAnalysisEngine, MSEngine } from "../msEngine";
import { NMRAnalysisEngine, NMREngine } from "../nmrEngine";
import { MolecularGraphValidator } from "./molecularGraphValidator";

export type PeakComparisonCategory =
  | "COMPATIBLE"
  | "SHIFTED"
  | "MISSING_IN_EXPERIMENTAL"
  | "EXTRA_IN_EXPERIMENTAL"
  | "SOLVENT_IGNORED";

export interface PeakValidationComparisonItem {
  id: string;
  modality: SpectrumModality;
  category: PeakComparisonCategory;
  predictedPosition?: number;
  experimentalPosition?: number;
  delta?: number;
  unit: string;
  featureAssignment: string;
  explanation: string;
}

export interface ModalityBidirectionalValidationReport {
  modality: SpectrumModality;
  experimentalProvided: boolean;
  predictedSpectrum: ExperimentalSpectrumData;
  experimentalSpectrum?: ExperimentalSpectrumData;
  compatibleCount: number;
  shiftedCount: number;
  missingPeakCount: number;
  extraPeakCount: number;
  solventPeakCount: number;
  consistencyScore: number | null;
  status: "SUPPORTED" | "COMPATIBLE" | "CONTRADICTED" | "NOT_PROVIDED";
  items: PeakValidationComparisonItem[];
  summaryText: string;
}

export interface BidirectionalValidationReport {
  structure: ParsedChemicalStructure;
  graphValidationPassed: boolean;
  graphValidationErrors: string[];
  modalityReports: Record<SpectrumModality, ModalityBidirectionalValidationReport>;
  overallConsistencyScore: number | null;
  overallVerdict: "STRONG_MATCH" | "PARTIAL_MATCH" | "CONFLICT_DETECTED" | "PREDICTION_ONLY";
}

export class PredictionAndValidationFramework {
  /**
   * 雙向結構 ↔ 光譜預測與驗證框架 (Bidirectional Prediction & Validation Framework)：
   * 同時支援：
   * 1. 輸入任意 SMILES / 結構名稱 / 候選結構，先執行確定性圖驗證與正規化
   * 2. 預測 IR / 1H NMR / 13C NMR / MS 理論經驗圖譜
   * 3. 若有實驗圖譜，自動計算：
   *    - Compatible Peaks (吻合峰)
   *    - Shifted Peaks (偏移但相容峰)
   *    - Missing Peaks (預測應有但實驗未見之峰)
   *    - Extra Peaks (實驗多出之未指認峰 / 雜質峰)
   *    - Solvent Peaks (已自動排除之溶劑峰)
   */
  static runBidirectionalValidation(
    structureInputOrParsed: string | ParsedChemicalStructure,
    experimentalSpectra: Partial<
      Record<SpectrumModality, ExperimentalSpectrumData>
    > = {},
    selectedModalities: SpectrumModality[] = ["IR", "1H_NMR", "13C_NMR", "MS"]
  ): BidirectionalValidationReport {
    const structure =
      typeof structureInputOrParsed === "string"
        ? ChemistryEngine.parseStructureInput(structureInputOrParsed)
        : structureInputOrParsed;

    const graphVal = structure.smiles
      ? MolecularGraphValidator.validateSmilesGraph(
          structure.smiles,
          structure.molecularFormula
        )
      : {
          isValid: structure.isValid ?? !structure.parseFailed,
          errors: structure.validationErrors ?? [],
        };

    const createSkippedReport = (
      modality: SpectrumModality,
      xUnit: string,
      yUnit: string
    ): ModalityBidirectionalValidationReport => ({
      modality,
      experimentalProvided: false,
      predictedSpectrum: {
        modality,
        fileName: `Unselected_${modality}.sim`,
        sourceFormat: "SIMULATED",
        dataOrigin: "EMPIRICAL_SIMULATION",
        modelType: "EMPIRICAL",
        isSimulated: true,
        xUnit,
        yUnit,
        points: [],
        peaks: [],
        validation: {
          isValid: true,
          qualityScore: 0,
          dataQuality: "LOW",
          pointCount: 0,
          peakCount: 0,
          xRange: [0, 0],
          yRange: [0, 0],
          issues: [
            {
              severity: "info",
              code: "MODALITY_NOT_SELECTED",
              message: "使用者未選擇預測此模態",
              recommendation: "如需比對此模態，請於預測設定勾選。",
            },
          ],
        },
      },
      compatibleCount: 0,
      shiftedCount: 0,
      missingPeakCount: 0,
      extraPeakCount: 0,
      solventPeakCount: 0,
      consistencyScore: null,
      status: "NOT_PROVIDED",
      items: [],
      summaryText: "未選擇預測此模態 — 使用者未勾選此光譜種類。",
    });

    const irReport = selectedModalities.includes("IR")
      ? this.compareModality(
          "IR",
          IREngine.predictEmpiricalIR(structure).spectrum,
          experimentalSpectra.IR,
          28,
          60,
          "cm⁻¹"
        )
      : createSkippedReport("IR", "cm⁻¹", "%T");

    const h1Report = selectedModalities.includes("1H_NMR")
      ? this.compareModality(
          "1H_NMR",
          NMREngine.predictEmpirical1HNMR(structure).spectrum,
          experimentalSpectra["1H_NMR"],
          0.25,
          0.65,
          "ppm"
        )
      : createSkippedReport("1H_NMR", "ppm", "Relative Intensity");

    const c13Report = selectedModalities.includes("13C_NMR")
      ? this.compareModality(
          "13C_NMR",
          NMREngine.predictEmpirical13CNMR(structure).spectrum,
          experimentalSpectra["13C_NMR"],
          3.0,
          7.5,
          "ppm"
        )
      : createSkippedReport("13C_NMR", "ppm", "Relative Intensity");

    const msReport = selectedModalities.includes("MS")
      ? this.compareModality(
          "MS",
          MSEngine.predictEmpiricalMS(structure).spectrum,
          experimentalSpectra.MS,
          0.6,
          1.5,
          "m/z"
        )
      : createSkippedReport("MS", "m/z", "Relative Abundance (%)");

    const modalityReports: Record<
      SpectrumModality,
      ModalityBidirectionalValidationReport
    > = {
      IR: irReport,
      "1H_NMR": h1Report,
      "13C_NMR": c13Report,
      MS: msReport,
    };

    const activeScores = Object.values(modalityReports)
      .filter(
        (r) =>
          selectedModalities.includes(r.modality) &&
          r.experimentalProvided &&
          r.consistencyScore !== null
      )
      .map((r) => r.consistencyScore as number);

    const overallConsistencyScore =
      activeScores.length > 0
        ? Math.round(
            activeScores.reduce((acc, v) => acc + v, 0) / activeScores.length
          )
        : null;

    let overallVerdict: BidirectionalValidationReport["overallVerdict"] =
      "PREDICTION_ONLY";
    if (overallConsistencyScore !== null) {
      if (overallConsistencyScore >= 82) {
        overallVerdict = "STRONG_MATCH";
      } else if (overallConsistencyScore >= 60) {
        overallVerdict = "PARTIAL_MATCH";
      } else {
        overallVerdict = "CONFLICT_DETECTED";
      }
    }

    return {
      structure,
      graphValidationPassed: graphVal.isValid,
      graphValidationErrors: graphVal.errors,
      modalityReports,
      overallConsistencyScore,
      overallVerdict,
    };
  }

  private static compareModality(
    modality: SpectrumModality,
    predictedSpectrum: ExperimentalSpectrumData,
    experimentalSpectrum: ExperimentalSpectrumData | undefined,
    strictTolerance: number,
    looseTolerance: number,
    unit: string
  ): ModalityBidirectionalValidationReport {
    if (!experimentalSpectrum) {
      const items: PeakValidationComparisonItem[] = predictedSpectrum.peaks.map(
        (pk) => ({
          id: `pred-only-${modality}-${pk.id}`,
          modality,
          category: "COMPATIBLE",
          predictedPosition: Number(pk.x.toFixed(2)),
          unit,
          featureAssignment: pk.assignment || `理論預測峰 ${pk.x.toFixed(2)} ${unit}`,
          explanation: "NOT PROVIDED — 尚未載入實驗圖譜，僅顯示理論預測峰位置。",
        })
      );

      return {
        modality,
        experimentalProvided: false,
        predictedSpectrum,
        compatibleCount: 0,
        shiftedCount: 0,
        missingPeakCount: 0,
        extraPeakCount: 0,
        solventPeakCount: 0,
        consistencyScore: null,
        status: "NOT_PROVIDED",
        items,
        summaryText: "NOT PROVIDED — 未載入此模態之實驗圖譜。",
      };
    }

    const items: PeakValidationComparisonItem[] = [];
    const matchedExpIds = new Set<string>();
    let compatibleCount = 0;
    let shiftedCount = 0;
    let missingPeakCount = 0;
    let extraPeakCount = 0;
    let solventPeakCount = 0;

    // 1. 先標記實驗圖譜中的溶劑峰
    const activeExpPeaks = experimentalSpectrum.peaks.filter((pk) => {
      if (
        pk.userClassification === "SOLVENT" ||
        pk.role === "SOLVENT" ||
        pk.signalRole === "SOLVENT" ||
        pk.isSolventVerified
      ) {
        solventPeakCount++;
        items.push({
          id: `solv-${modality}-${pk.id}`,
          modality,
          category: "SOLVENT_IGNORED",
          experimentalPosition: Number(pk.x.toFixed(2)),
          unit,
          featureAssignment: pk.assignment || "殘餘溶劑訊號 (Solvent Peak)",
          explanation:
            "已標記為溶劑殘餘峰，保留於實驗圖譜但自動排除於結構推論與缺漏峰扣分之外。",
        });
        return false;
      }
      return (
        pk.userClassification !== "NOISE" &&
        pk.userClassification !== "IMPURITY" &&
        pk.role !== "IMPURITY" &&
        pk.signalRole !== "IMPURITY"
      );
    });

    // 2. 針對每個主要預測峰尋找最接近之實驗峰
    const majorPredPeaks =
      modality === "MS"
        ? predictedSpectrum.peaks.filter((p) => p.y >= 10)
        : predictedSpectrum.peaks;

    for (const pPeak of majorPredPeaks) {
      let bestExp = activeExpPeaks[0];
      let bestDiff = Infinity;

      for (const ePeak of activeExpPeaks) {
        const diff = Math.abs(ePeak.x - pPeak.x);
        if (diff < bestDiff) {
          bestDiff = diff;
          bestExp = ePeak;
        }
      }

      if (bestExp && bestDiff <= strictTolerance) {
        compatibleCount++;
        matchedExpIds.add(bestExp.id);
        items.push({
          id: `match-${modality}-${pPeak.id}`,
          modality,
          category: "COMPATIBLE",
          predictedPosition: Number(pPeak.x.toFixed(2)),
          experimentalPosition: Number(bestExp.x.toFixed(2)),
          delta: Number(bestDiff.toFixed(2)),
          unit,
          featureAssignment: pPeak.assignment || "預測特徵峰",
          explanation: `實驗峰 (${bestExp.x.toFixed(2)} ${unit}) 與預測位置高度吻合 (Δ = ${bestDiff.toFixed(2)} ${unit})。`,
        });
      } else if (bestExp && bestDiff <= looseTolerance) {
        shiftedCount++;
        matchedExpIds.add(bestExp.id);
        items.push({
          id: `shift-${modality}-${pPeak.id}`,
          modality,
          category: "SHIFTED",
          predictedPosition: Number(pPeak.x.toFixed(2)),
          experimentalPosition: Number(bestExp.x.toFixed(2)),
          delta: Number(bestDiff.toFixed(2)),
          unit,
          featureAssignment: pPeak.assignment || "預測特徵峰",
          explanation: `實驗峰 (${bestExp.x.toFixed(2)} ${unit}) 存在些微溶劑/基質位移 (Δ = ${bestDiff.toFixed(2)} ${unit})，但仍屬相容範圍。`,
        });
      } else {
        missingPeakCount++;
        items.push({
          id: `missing-${modality}-${pPeak.id}`,
          modality,
          category: "MISSING_IN_EXPERIMENTAL",
          predictedPosition: Number(pPeak.x.toFixed(2)),
          unit,
          featureAssignment: pPeak.assignment || "預期特徵峰",
          explanation: `結構預期在 ${pPeak.x.toFixed(2)} ${unit} 出現訊號，但實驗圖譜中未見對應峰 (Missing Peak)。`,
        });
      }
    }

    // 3. 檢查實驗圖譜中顯著但未被預測模型解釋的多餘峰 (Extra Peaks)
    for (const ePeak of activeExpPeaks) {
      if (matchedExpIds.has(ePeak.id)) continue;
      const minDistance = predictedSpectrum.peaks.reduce(
        (min, p) => Math.min(min, Math.abs(p.x - ePeak.x)),
        Infinity
      );
      if (minDistance > looseTolerance) {
        const isSignificant =
          modality === "MS"
            ? ePeak.y >= 20
            : modality === "IR"
              ? ePeak.y <= 55
              : ePeak.y >= 18;
        if (isSignificant) {
          extraPeakCount++;
          items.push({
            id: `extra-${modality}-${ePeak.id}`,
            modality,
            category: "EXTRA_IN_EXPERIMENTAL",
            experimentalPosition: Number(ePeak.x.toFixed(2)),
            unit,
            featureAssignment:
              ePeak.assignment || `實驗額外訊號 ${ePeak.x.toFixed(2)} ${unit}`,
            explanation: `實驗圖譜於 ${ePeak.x.toFixed(2)} ${unit} 出現顯著訊號，但目標結構未預測此峰 (Extra Peak)。`,
          });
        }
      }
    }

    const totalEvaluated = Math.max(
      1,
      compatibleCount + shiftedCount + missingPeakCount
    );
    const rawRatio =
      (compatibleCount * 1.0 + shiftedCount * 0.78) / totalEvaluated;
    const extraPenalty = Math.min(25, extraPeakCount * 8);
    const consistencyScore = Math.max(
      10,
      Math.min(99, Math.round(rawRatio * 96 - extraPenalty))
    );

    const status: ModalityBidirectionalValidationReport["status"] =
      consistencyScore >= 82
        ? "SUPPORTED"
        : consistencyScore >= 60
          ? "COMPATIBLE"
          : "CONTRADICTED";

    const summaryText = `吻合峰 ${compatibleCount} 個、偏移相容峰 ${shiftedCount} 個、預期但缺席峰 ${missingPeakCount} 個、實驗多出峰 ${extraPeakCount} 個${
      solventPeakCount > 0 ? `（另已排除 ${solventPeakCount} 個溶劑峰）` : ""
    }。`;

    return {
      modality,
      experimentalProvided: true,
      predictedSpectrum,
      experimentalSpectrum,
      compatibleCount,
      shiftedCount,
      missingPeakCount,
      extraPeakCount,
      solventPeakCount,
      consistencyScore,
      status,
      items,
      summaryText,
    };
  }
}

// ============================================================================
// V5 Modality Prediction Adapters & PredictionEngine Framework
// ============================================================================

export class IRPredictionAdapter
  implements ModalityPredictionAdapter<ExperimentalSpectrumData>
{
  readonly adapterName = "IRPredictionAdapter";
  readonly modality = "IR" as const;
  readonly calculationMethod = "EMPIRICAL" as const;
  readonly quantumBackendStatus = "NOT_CONNECTED" as const;
  readonly scientificDisclaimer =
    "Empirical/reference group-frequency vibrational model (NOT DFT harmonic/anharmonic normal-mode calculation; IRQuantumBackendAdapter: NOT_CONNECTED).";

  predictForStructure(
    structure: ParsedChemicalStructure
  ): ExperimentalSpectrumData {
    return IRAnalysisEngine.predictIRFromStructure(structure).spectrum;
  }
}

export class NMRPredictionAdapter
  implements
    ModalityPredictionAdapter<{
      h1Spectrum: ExperimentalSpectrumData;
      c13Spectrum: ExperimentalSpectrumData;
    }>
{
  readonly adapterName = "NMRPredictionAdapter";
  readonly modality = "NMR" as const;
  readonly calculationMethod = "EMPIRICAL" as const;
  readonly quantumBackendStatus = "NOT_CONNECTED" as const;
  readonly scientificDisclaimer =
    "Empirical substituent shielding additivity estimate (NOT GIAO / DFT magnetic shielding calculation; NMRQuantumBackendAdapter: NOT_CONNECTED).";

  predictForStructure(structure: ParsedChemicalStructure): {
    h1Spectrum: ExperimentalSpectrumData;
    c13Spectrum: ExperimentalSpectrumData;
  } {
    return {
      h1Spectrum: NMRAnalysisEngine.predict1HNMRFromStructure(structure)
        .spectrum,
      c13Spectrum: NMRAnalysisEngine.predict13CNMRFromStructure(structure)
        .spectrum,
    };
  }
}

export class MSPredictionAdapter
  implements ModalityPredictionAdapter<ExperimentalSpectrumData>
{
  readonly adapterName = "MSPredictionAdapter";
  readonly modality = "MS" as const;
  readonly calculationMethod = "EMPIRICAL" as const;
  readonly quantumBackendStatus = "NOT_CONNECTED" as const;
  readonly scientificDisclaimer =
    "Theoretical monoisotopic mass & natural isotopic abundance envelope combined with empirical EI/ESI fragmentation rules.";

  predictForStructure(
    structure: ParsedChemicalStructure
  ): ExperimentalSpectrumData {
    return MSAnalysisEngine.predictMSFromStructure(structure).spectrum;
  }
}

export class MSMSPredictionAdapter
  implements ModalityPredictionAdapter<ExperimentalSpectrumData>
{
  readonly adapterName = "MSMSPredictionAdapter";
  readonly modality = "MSMS" as const;
  readonly calculationMethod = "EMPIRICAL" as const;
  readonly quantumBackendStatus = "NOT_CONNECTED" as const;
  readonly scientificDisclaimer =
    "Empirical neutral-loss and product-ion rule adapter (NOT quantum chemical trajectory / QCEIMS MS/MS simulation; quantumBackendStatus: NOT_CONNECTED).";

  predictForStructure(
    structure: ParsedChemicalStructure
  ): ExperimentalSpectrumData {
    const baseMs = MSAnalysisEngine.predictMSFromStructure(structure).spectrum;
    return {
      ...baseMs,
      msParams: {
        ...baseMs.msParams,
        msType: "MS/MS",
        ionization: "ESI+",
        precursorMz: Number(((structure.exactMass || 0) + 1.007276).toFixed(4)),
      },
    };
  }
}

export class ToFSIMSPredictionAdapter
  implements ModalityPredictionAdapter<ExperimentalSpectrumData>
{
  readonly adapterName = "ToFSIMSPredictionAdapter";
  readonly modality = "TOF_SIMS" as const;
  readonly calculationMethod = "REFERENCE_BASED" as const;
  readonly quantumBackendStatus = "NOT_CONNECTED" as const;
  readonly scientificDisclaimer =
    "Reference-based characteristic secondary ion fragment family lookup (NOT molecular dynamics sputtering cascade simulation; quantumBackendStatus: NOT_CONNECTED).";

  predictForStructure(
    structure: ParsedChemicalStructure
  ): ExperimentalSpectrumData {
    const baseMs = MSAnalysisEngine.predictMSFromStructure(structure).spectrum;
    return {
      ...baseMs,
      msParams: {
        ...baseMs.msParams,
        msType: "ToF-SIMS",
        ionization: "SIMS / ToF-SIMS",
      },
    };
  }
}

export class PredictionEngine {
  static readonly irAdapter = new IRPredictionAdapter();
  static readonly nmrAdapter = new NMRPredictionAdapter();
  static readonly msAdapter = new MSPredictionAdapter();
  static readonly msmsAdapter = new MSMSPredictionAdapter();
  static readonly tofSimsAdapter = new ToFSIMSPredictionAdapter();

  static predictSpectrumBundle(
    structure: ParsedChemicalStructure
  ): PredictedSpectrumBundle & {
    adapterStatusSummary: Record<
      string,
      {
        calculationMethod: "REFERENCE_BASED" | "EMPIRICAL";
        quantumBackendStatus: "NOT_CONNECTED";
        scientificDisclaimer: string;
      }
    >;
  } {
    const irPred = IRAnalysisEngine.predictIRFromStructure(structure);
    const h1Pred = NMRAnalysisEngine.predict1HNMRFromStructure(structure);
    const c13Pred = NMRAnalysisEngine.predict13CNMRFromStructure(structure);
    const msPred = MSAnalysisEngine.predictMSFromStructure(structure);

    return {
      structure,
      modelMetadataList: [],
      computationalStatus: "EMPIRICAL / REFERENCE_BASED",
      backendNotice: this.irAdapter.scientificDisclaimer,
      ir: irPred.spectrum,
      irPredictions: irPred.predictions,
      irExpectedBands: irPred.predictions,
      h1Nmr: h1Pred.spectrum,
      h1Predictions: h1Pred.environments,
      h1ExpectedEnvironments: h1Pred.environments,
      c13Nmr: c13Pred.spectrum,
      c13Predictions: c13Pred.environments,
      c13ExpectedEnvironments: c13Pred.environments,
      ms: msPred.spectrum,
      msPredictions: msPred.analysis,
      msExpectedFragments: msPred.analysis.fragments,
      evidenceList: [],
      adapterStatusSummary: {
        IR: {
          calculationMethod: this.irAdapter.calculationMethod,
          quantumBackendStatus: this.irAdapter.quantumBackendStatus,
          scientificDisclaimer: this.irAdapter.scientificDisclaimer,
        },
        NMR: {
          calculationMethod: this.nmrAdapter.calculationMethod,
          quantumBackendStatus: this.nmrAdapter.quantumBackendStatus,
          scientificDisclaimer: this.nmrAdapter.scientificDisclaimer,
        },
        MS: {
          calculationMethod: this.msAdapter.calculationMethod,
          quantumBackendStatus: this.msAdapter.quantumBackendStatus,
          scientificDisclaimer: this.msAdapter.scientificDisclaimer,
        },
        MSMS: {
          calculationMethod: this.msmsAdapter.calculationMethod,
          quantumBackendStatus: this.msmsAdapter.quantumBackendStatus,
          scientificDisclaimer: this.msmsAdapter.scientificDisclaimer,
        },
        TOF_SIMS: {
          calculationMethod: this.tofSimsAdapter.calculationMethod,
          quantumBackendStatus: this.tofSimsAdapter.quantumBackendStatus,
          scientificDisclaimer: this.tofSimsAdapter.scientificDisclaimer,
        },
      },
    };
  }

  static buildValidationResult(params: {
    candidateSmiles: string;
    candidateFormula: string;
    overallCompatibilityScore: number;
    accumulatedFeatures: ChemicalFeatureEvidence[];
    modalityStatusMap: Record<EvidenceSpectrumSource, "PROVIDED" | "NOT_PROVIDED">;
  }): ValidationResult {
    const {
      candidateSmiles,
      candidateFormula,
      overallCompatibilityScore,
      accumulatedFeatures,
      modalityStatusMap,
    } = params;

    const supportingEvidence = accumulatedFeatures.filter(
      (f) => f.status === "SUPPORTED" || f.status === "POSSIBLE"
    );
    const contradictingEvidence = accumulatedFeatures.filter(
      (f) => f.status === "CONTRADICTED"
    );
    const unknownOrNotProvidedModalities = (
      Object.keys(modalityStatusMap) as EvidenceSpectrumSource[]
    ).filter((k) => modalityStatusMap[k] === "NOT_PROVIDED");

    const modalityComparisonSummary: Partial<
      Record<EvidenceSpectrumSource, string>
    > = {};
    for (const mod of Object.keys(modalityStatusMap) as EvidenceSpectrumSource[]) {
      if (modalityStatusMap[mod] === "NOT_PROVIDED") {
        modalityComparisonSummary[mod] = "NOT_PROVIDED (非 CONTRADICTED)";
      } else {
        const modSup = supportingEvidence.filter((e) =>
          e.sourceSpectrum.some(
            (s) =>
              s.replace("/", "").replace("-", "_") === mod || s === mod
          )
        ).length;
        const modCon = contradictingEvidence.filter((e) =>
          e.sourceSpectrum.some(
            (s) =>
              s.replace("/", "").replace("-", "_") === mod || s === mod
          )
        ).length;
        modalityComparisonSummary[mod] = `PROVIDED — Supporting: ${modSup}, Contradicting: ${modCon}`;
      }
    }

    return {
      candidateSmiles,
      candidateFormula,
      overallCompatibilityScore,
      supportingEvidence,
      contradictingEvidence,
      unknownOrNotProvidedModalities,
      modalityComparisonSummary,
      provenanceNote:
        "ValidationResult derived from unified ChemicalFeatureEvidence and reference/empirical prediction adapters (quantum backends NOT_CONNECTED).",
    };
  }
}

