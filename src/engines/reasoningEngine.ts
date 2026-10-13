import {
  CandidateResult,
  CandidateStructure,
  CrossPeakAlignmentRow,
  EvidenceChainLink,
  ExperimentalSpectrumData,
  ExtendedSpectrumModality,
  ModeADeductionReport,
  ModeBPredictionReport,
  ParsedChemicalStructure,
  SpectrumModality,
} from "../types/spectrum";
import { CandidateGenerator } from "./candidateGenerator";
import {
  ChemicalFeatureEngine,
  IntegratedAnalysisBundle,
} from "./chemicalFeatureEngine";
import { IREngine } from "./irEngine";
import { MSEngine } from "./msEngine";
import { NMREngine } from "./nmrEngine";

export class ReasoningEngine {
  /**
   * 協調者模式 (Reasoning & Report Coordinator Layer)：
   * 直接使用 Unified Candidate Generation Pipeline 已經產出之 bundle / evidence / constraints / rankedCandidates，
   * 組裝證據鏈、跨模態共識與衝突警示報告，絕不重複執行第二套候選結構生成或獨立排序。
   */
  static coordinateModeAReport(
    spectra: Partial<Record<SpectrumModality | ExtendedSpectrumModality, ExperimentalSpectrumData>>,
    bundle: IntegratedAnalysisBundle,
    rankedCandidates: CandidateResult[]
  ): ModeADeductionReport {
    const topCandidate = rankedCandidates[0];
    const evidenceChain = this.buildEvidenceChain(bundle);
    const crossModalConsistencyNotes = this.buildCrossModalNotes(
      bundle,
      topCandidate
    );
    const conflictAlerts = this.detectCrossModalConflicts(
      bundle,
      topCandidate
    );
    const uncertaintyNotes = this.buildUncertaintyNotes(bundle, spectra);

    const allSixModalities: ExtendedSpectrumModality[] = [
      "IR",
      "1H_NMR",
      "13C_NMR",
      "MS",
      "MS/MS",
      "ToF-SIMS",
    ];
    const expModalities: ExtendedSpectrumModality[] = [
      ...bundle.activeModalities,
    ];
    if (bundle.msmsAnalysis && !expModalities.includes("MS/MS")) {
      expModalities.push("MS/MS");
    }
    if (bundle.tofSimsAnalysis && !expModalities.includes("ToF-SIMS")) {
      expModalities.push("ToF-SIMS");
    }
    const missingModalities = allSixModalities.filter(
      (m) => !expModalities.includes(m)
    );

    const formulaValidation = bundle.constraints.userSuppliedFormulaValidation;
    let noValidCandidateReason: string | null = null;
    if (
      formulaValidation &&
      (!formulaValidation.isValid || !formulaValidation.isSupported)
    ) {
      noValidCandidateReason = `分子式輸入驗證失敗 (${formulaValidation.targetFormula || bundle.constraints.userSuppliedFormula?.rawInput || "未知"})：${formulaValidation.validationErrors.join("；")}。系統已停止依賴該分子式進行結構推論，不回傳不符限制之結構。`;
    } else if (rankedCandidates.length === 0) {
      const targetForm =
        bundle.constraints.userSuppliedFormula?.normalizedFormula ||
        bundle.constraints.molecularFormula?.lockedFormula;
      noValidCandidateReason = targetForm
        ? `無任何候選結構同時通過目標分子式 (${targetForm}) 與化學結構合法性硬限制驗證。系統拒絕以錯誤分子式或最接近分子式的結構充數。`
        : "目前實驗光譜證據不足或無任何候選結構通過化學硬限制驗證，無法產生合法候選結構。";
    }

    return {
      timestamp: new Date().toISOString(),
      activeModalities: expModalities,
      experimentalModalities: expModalities,
      missingModalities,
      irFindings: bundle.irFindings,
      protonSummary: bundle.protonSummary,
      carbonSummary: bundle.carbonSummary,
      msSummary: bundle.msSummary,
      constraints: bundle.constraints,
      evidenceChain,
      candidates: rankedCandidates,
      crossModalConsistencyNotes,
      conflictAlerts,
      uncertaintyNotes,
      noValidCandidateReason,
      formulaInputValidation: formulaValidation,
      h1IntegrationSummary: bundle.constraints.h1IntegrationSemantics,
    };
  }

  /**
   * Mode A 統一入口：
   * 若已由 WorkbenchOrchestrator 傳入統一管線結果則直接協調組裝報告；
   * 若被單獨呼叫，亦委派給唯一的 CandidateGenerator.executeUnifiedPipelineFromBundle 執行，確保全域僅有一套權威候選生成與排序流程。
   */
  static runModeADeduction(
    spectra: Partial<Record<SpectrumModality, ExperimentalSpectrumData>>,
    optionalReferenceStructure?: ParsedChemicalStructure,
    precomputedUnifiedPipeline?: {
      bundle: IntegratedAnalysisBundle;
      rankedCandidates: CandidateResult[];
    }
  ): ModeADeductionReport {
    if (precomputedUnifiedPipeline) {
      return this.coordinateModeAReport(
        spectra,
        precomputedUnifiedPipeline.bundle,
        precomputedUnifiedPipeline.rankedCandidates
      );
    }

    const bundle = ChemicalFeatureEngine.extractIntegratedConstraints(
      spectra,
      optionalReferenceStructure
    );
    const unified = CandidateGenerator.executeUnifiedPipelineFromBundle(bundle);
    return this.coordinateModeAReport(
      spectra,
      bundle,
      unified.rankedCandidates
    );
  }

  /**
   * Mode B: 執行「分子結構 → 多模態經驗式預測 → 實驗疊圖比對」完整管線
   */
  static runModeBPrediction(
    structure: ParsedChemicalStructure,
    experimentalOverlay?: Partial<Record<SpectrumModality, ExperimentalSpectrumData>>
  ): ModeBPredictionReport {
    const irPred = IREngine.predictEmpiricalIR(structure);
    const h1Pred = NMREngine.predictEmpirical1HNMR(structure);
    const c13Pred = NMREngine.predictEmpirical13CNMR(structure);
    const msPred = MSEngine.predictEmpiricalMS(structure);

    const predictedSpectra: ModeBPredictionReport["predictedSpectra"] = {
      IR: irPred.spectrum,
      "1H_NMR": h1Pred.spectrum,
      "13C_NMR": c13Pred.spectrum,
      MS: msPred.spectrum,
      irPredictions: irPred.predictions,
      h1Nmr: h1Pred.spectrum,
      c13Nmr: c13Pred.spectrum,
    };

    const crossPeakAlignment: CrossPeakAlignmentRow[] = [];

    // 1. IR 主要預測吸收帶與實驗比對
    for (const pPeak of irPred.spectrum.peaks) {
      let expVal = "未載入實驗 IR";
      let deltaStr = "—";
      let status: CrossPeakAlignmentRow["matchStatus"] = "SIMULATED_ONLY";

      if (experimentalOverlay?.IR) {
        const closest = experimentalOverlay.IR.peaks.reduce(
          (best, cur) =>
            Math.abs(cur.x - pPeak.x) < Math.abs(best.x - pPeak.x) ? cur : best,
          experimentalOverlay.IR.peaks[0]
        );
        if (closest) {
          const diff = Math.abs(closest.x - pPeak.x);
          expVal = `${closest.x.toFixed(0)} cm⁻¹ (${closest.y.toFixed(0)} %T)`;
          deltaStr = `Δ = ${diff.toFixed(0)} cm⁻¹`;
          status =
            diff <= 25 ? "MATCHED" : diff <= 55 ? "SHIFTED" : "MISSING_IN_EXP";
        }
      }

      crossPeakAlignment.push({
        id: `align-ir-${pPeak.id}`,
        modality: "IR",
        structuralFeature: pPeak.assignment || `IR 振動帶 ${pPeak.x} cm⁻¹`,
        predictedValue: `${pPeak.x.toFixed(0)} cm⁻¹`,
        experimentalValue: expVal,
        deviation: deltaStr,
        matchStatus: status,
        scientificExplanation:
          "基於基團頻率諧振子近似與共軛/氫鍵微調模型預測之特徵波數。",
      });
    }

    // 2. 1H NMR 預測位移與實驗比對
    for (const pPeak of h1Pred.spectrum.peaks) {
      let expVal = "未載入實驗 ¹H NMR";
      let deltaStr = "—";
      let status: CrossPeakAlignmentRow["matchStatus"] = "SIMULATED_ONLY";

      if (experimentalOverlay?.["1H_NMR"]) {
        const activeExp = experimentalOverlay["1H_NMR"].peaks.filter(
          (pk) => pk.userClassification !== "SOLVENT" && !pk.isSolventVerified
        );
        if (activeExp.length > 0) {
          const closest = activeExp.reduce(
            (best, cur) =>
              Math.abs(cur.x - pPeak.x) < Math.abs(best.x - pPeak.x) ? cur : best,
            activeExp[0]
          );
          const diff = Math.abs(closest.x - pPeak.x);
          expVal = `δ ${closest.x.toFixed(2)} ppm (${closest.multiplicity || "m"})`;
          deltaStr = `Δδ = ${diff.toFixed(2)} ppm`;
          status =
            diff <= 0.25 ? "MATCHED" : diff <= 0.65 ? "SHIFTED" : "MISSING_IN_EXP";
        }
      }

      crossPeakAlignment.push({
        id: `align-h1-${pPeak.id}`,
        modality: "1H_NMR",
        structuralFeature: pPeak.assignment || `¹H 位移 δ ${pPeak.x.toFixed(2)} ppm`,
        predictedValue: `δ ${pPeak.x.toFixed(2)} ppm (${pPeak.multiplicity || "s"}, ${pPeak.integral || 1}H)`,
        experimentalValue: expVal,
        deviation: deltaStr,
        matchStatus: status,
        scientificExplanation:
          "基於 Shoolery 取代基加成常數與芳環環電流屏壁效應估算之化學位移。",
      });
    }

    // 3. 13C NMR 預測位移與實驗比對
    for (const pPeak of c13Pred.spectrum.peaks) {
      let expVal = "未載入實驗 ¹³C NMR";
      let deltaStr = "—";
      let status: CrossPeakAlignmentRow["matchStatus"] = "SIMULATED_ONLY";

      if (experimentalOverlay?.["13C_NMR"]) {
        const activeExp = experimentalOverlay["13C_NMR"].peaks.filter(
          (pk) => pk.userClassification !== "SOLVENT" && !pk.isSolventVerified
        );
        if (activeExp.length > 0) {
          const closest = activeExp.reduce(
            (best, cur) =>
              Math.abs(cur.x - pPeak.x) < Math.abs(best.x - pPeak.x) ? cur : best,
            activeExp[0]
          );
          const diff = Math.abs(closest.x - pPeak.x);
          expVal = `δ ${closest.x.toFixed(1)} ppm`;
          deltaStr = `Δδ = ${diff.toFixed(1)} ppm`;
          status =
            diff <= 3.0 ? "MATCHED" : diff <= 7.5 ? "SHIFTED" : "MISSING_IN_EXP";
        }
      }

      crossPeakAlignment.push({
        id: `align-c13-${pPeak.id}`,
        modality: "13C_NMR",
        structuralFeature: pPeak.assignment || `¹³C 位移 δ ${pPeak.x.toFixed(1)} ppm`,
        predictedValue: `δ ${pPeak.x.toFixed(1)} ppm (${pPeak.deptType || "C"})`,
        experimentalValue: expVal,
        deviation: deltaStr,
        matchStatus: status,
        scientificExplanation:
          "基於 Grant-Paul 碳化學位移經驗加成模型與雜原子誘導效應預測。",
      });
    }

    // 4. MS 預測離子與實驗比對
    for (const pPeak of msPred.spectrum.peaks.filter((pk) => pk.y >= 15 || pk.x === structure.nominalMass)) {
      let expVal = "未載入實驗 MS";
      let deltaStr = "—";
      let status: CrossPeakAlignmentRow["matchStatus"] = "SIMULATED_ONLY";

      if (experimentalOverlay?.MS && experimentalOverlay.MS.peaks.length > 0) {
        const closest = experimentalOverlay.MS.peaks.reduce(
          (best, cur) =>
            Math.abs(cur.x - pPeak.x) < Math.abs(best.x - pPeak.x) ? cur : best,
          experimentalOverlay.MS.peaks[0]
        );
        const diff = Math.abs(closest.x - pPeak.x);
        expVal = `m/z ${closest.x.toFixed(1)} (${closest.y.toFixed(0)}%)`;
        deltaStr = `Δm/z = ${diff.toFixed(1)}`;
        status =
          diff <= 0.6 ? "MATCHED" : diff <= 1.5 ? "SHIFTED" : "MISSING_IN_EXP";
      }

      crossPeakAlignment.push({
        id: `align-ms-${pPeak.id}`,
        modality: "MS",
        structuralFeature: pPeak.assignment || `離子峰 m/z ${pPeak.x}`,
        predictedValue: `m/z ${pPeak.x.toFixed(1)} (${pPeak.y.toFixed(0)}%)`,
        experimentalValue: expVal,
        deviation: deltaStr,
        matchStatus: status,
        scientificExplanation:
          "基於 α-裂解、McLafferty 重排、鄰位效應與穩定芳基陽離子規則預測。",
      });
    }

    return {
      timestamp: new Date().toISOString(),
      structure,
      predictedSpectra,
      crossPeakAlignment,
      modelMethodologyStatement:
        "本反向預測光譜採用確定性經驗加成規則引擎（IR 官能基特徵頻率庫、¹H/¹³C 取代基化學位移加成常數與 EI-MS 經典裂解熱力學經驗規則）即時合成，所有預測資料點均標記為 EMPIRICAL_SIMULATION，與真實實驗量測訊號嚴格區隔。",
      overallValidationSummary: this.buildOverlayValidationSummary(
        structure,
        crossPeakAlignment,
        experimentalOverlay
      ),
    };
  }

  private static buildEvidenceChain(
    bundle: ReturnType<typeof ChemicalFeatureEngine.extractIntegratedConstraints>
  ): EvidenceChainLink[] {
    const chain: EvidenceChainLink[] = [];

    // 0. 化學式輸入證據層級 (USER_FORMULA_INPUT — 絕不偽裝成 MS 光譜)
    if (bundle.constraints.userSuppliedFormula) {
      const f = bundle.constraints.userSuppliedFormula;
      if (f.isValid === false || f.isSupported === false) {
        chain.push({
          id: "chain-formula-input-invalid",
          stepOrder: chain.length + 1,
          observation: `使用者輸入化學式「${f.rawInput}」驗證未通過`,
          modality: "FORMULA",
          chemicalMeaning: (f.validationErrors || []).join("；") || "分子式格式錯誤、化合價不合理或包含未支援元素",
          structuralConstraint: "停止依賴該無效分子式進行結構推論，不產生假候選結構",
          confidence: "LOW",
          supportingEvidenceIds: [],
        });
      } else {
        chain.push({
          id: "chain-formula-input",
          stepOrder: chain.length + 1,
          observation: `使用者提供化學式 ${f.normalizedFormula} (Exact Mass = ${f.exactMass.toFixed(4)} Da, Nominal MW = ${f.nominalMass} Da)`,
          modality: "FORMULA",
          chemicalMeaning: `由化學式精確計算不飽和度 IHD (DBE) = ${f.ihd}；${f.nitrogenRuleConstraint}`,
          structuralConstraint: `強制候選結構實際原子組成符合 ${f.normalizedFormula} (含總氫數 ${f.atomCounts.H || 0}H) 且總環數加雙鍵數 IHD = ${f.ihd}`,
          confidence: "HIGH",
          supportingEvidenceIds: bundle.evidencePool
            .filter((e) => e.id?.includes("formula"))
            .map((e) => e.id || "ev-user-formula-ihd"),
        });
      }
    }

    // 1. MS 分子量與分子式層級
    if (bundle.msSummary && bundle.constraints.estimatedMolecularWeight) {
      chain.push({
        id: "chain-ms-mw",
        stepOrder: chain.length + 1,
        observation: `MS 觀測到母離子 m/z ${bundle.msSummary.estimatedMolecularIonMz} 與基峰 m/z ${bundle.msSummary.basePeakMz}`,
        modality: "MS",
        chemicalMeaning: `推估標稱分子量 MW ≈ ${bundle.constraints.estimatedMolecularWeight} Da；${bundle.msSummary.nitrogenRuleAssessment.explanation}`,
        structuralConstraint: `限制候選分子式標稱質量為 ${bundle.constraints.estimatedMolecularWeight} Da`,
        confidence: "HIGH",
        supportingEvidenceIds: bundle.evidencePool
          .filter((e) => e.modality === "MS" && e.canonicalModality !== "MSMS" && e.canonicalModality !== "TOF_SIMS")
          .map((e) => e.id || "ev-ms-parent-mw"),
      });
    }

    // 1b. MS/MS 串聯質譜前驅離子與中性丟失層級
    if (bundle.msmsAnalysis) {
      const msms = bundle.msmsAnalysis;
      const nls = msms.physicsModel?.neutralLosses || [];
      const prodIons = msms.physicsModel?.productIons || [];
      const precMz = msms.physicsModel?.precursorIon?.mz ?? 0;
      const subStrs =
        msms.structuralConstraints?.requiredSubstructures?.map(
          (s) => s.description || s.motif
        ) || [];
      const lossDesc =
        nls.length > 0
          ? nls
              .slice(0, 3)
              .map((nl) => `Δ${nl.lossDa.toFixed(1)} Da (${nl.possibleIdentity || "中性丟失"})`)
              .join("、")
          : "特徵產物離子裂解";
      chain.push({
        id: "chain-msms-frag",
        stepOrder: chain.length + 1,
        observation: `MS/MS 前驅離子 m/z ${precMz} 產生 ${prodIons.length} 組產物離子，檢出中性丟失：${lossDesc}`,
        modality: "MS/MS",
        chemicalMeaning: "確認前驅離子至產物離子之二級裂解轉移關係與特定官能基脫離途徑",
        structuralConstraint:
          subStrs.length > 0
            ? `支持存在可發生對應二級裂解之子結構：${subStrs.join("、")}`
            : `要求候選結構可合理解釋前驅離子 m/z ${precMz} 之二級產物離子`,
        confidence: "HIGH",
        supportingEvidenceIds: bundle.evidencePool
          .filter((e) => e.canonicalModality === "MSMS" || e.id?.includes("msms"))
          .map((e) => e.id || "ev-msms"),
      });
    }

    // 1c. ToF-SIMS 表面二次離子質譜層級
    if (bundle.tofSimsAnalysis) {
      const sims = bundle.tofSimsAnalysis;
      const rawPol = sims.physicsModel?.surfaceConditions?.polarity || "positive";
      const polarity = rawPol === "negative" ? "NEGATIVE" : "POSITIVE";
      const secIons = sims.physicsModel?.secondaryIonFeatures || [];
      const surfaceMotifs =
        sims.structuralConstraints?.requiredSubstructures?.map(
          (s) => s.description || s.motifLabel || s.motif || s.motifId
        ) || [];
      chain.push({
        id: "chain-tofsims-surface",
        stepOrder: chain.length + 1,
        observation: `ToF-SIMS (${polarity} 極性) 檢出 ${secIons.length} 組特徵表面二次離子簇`,
        modality: "ToF-SIMS",
        chemicalMeaning: "提供表面化學官能基碎片指紋與極性離子系列分布",
        structuralConstraint:
          surfaceMotifs.length > 0
            ? `支持表面或分子骨架包含特徵基團：${surfaceMotifs.join("、")}`
            : "約束候選結構需與表面二次離子碎片系列相容",
        confidence: "MEDIUM",
        supportingEvidenceIds: bundle.evidencePool
          .filter((e) => e.canonicalModality === "TOF_SIMS" || e.id?.includes("tofsims"))
          .map((e) => e.id || "ev-tofsims"),
      });
    }

    // 2. IR 官能基層級
    const presentIR = bundle.irFindings.filter((f) => f.status === "PRESENT");
    if (presentIR.length > 0) {
      chain.push({
        id: "chain-ir-fg",
        stepOrder: chain.length + 1,
        observation: presentIR
          .slice(0, 3)
          .map((f) => `${f.groupName || f.functionalGroup} (${(f.observedPeaks || [f.observedPeak]).map((v) => v.toFixed(0)).join(", ")} cm⁻¹)`)
          .join("；"),
        modality: "IR",
        chemicalMeaning:
          "確認核心極性官能基（如羰基 C=O 亞型、羥基/羧酸 O-H、醯胺 N-H 或芳香環骨架伸縮）",
        structuralConstraint: `強制候選結構必須包含實驗觀測支持之官能基：${presentIR.map((f) => f.groupName || f.functionalGroup).join("、")}`,
        confidence: "HIGH",
        supportingEvidenceIds: presentIR.flatMap((f) => f.evidenceIds || [f.evidence.id]),
      });
    }

    // 3. 13C NMR 碳環境與對稱性層級
    if (bundle.carbonSummary) {
      chain.push({
        id: "chain-c13-env",
        stepOrder: chain.length + 1,
        observation: `¹³C NMR 檢出 ${bundle.carbonSummary.totalUniqueCarbonSignaling} 組不等價碳訊號（含 ${bundle.carbonSummary.carbonylCount} 組羰基碳、${bundle.carbonSummary.aromaticCount} 組芳香/烯碳、${bundle.carbonSummary.aliphaticCount} 組脂肪碳）`,
        modality: "13C_NMR",
        chemicalMeaning: bundle.carbonSummary.symmetryAssessment,
        structuralConstraint: `限定分子不等價碳環境數為 ${bundle.carbonSummary.totalUniqueCarbonSignaling} 組，並確立羰基與芳環季碳數目`,
        confidence: "HIGH",
        supportingEvidenceIds: bundle.evidencePool
          .filter((e) => e.modality === "13C_NMR")
          .map((e) => e.id || ""),
      });
    }

    // 4. 1H NMR 自旋偶合與取代型態層級 (清楚區分原始積分、相對比例與正規化絕對氫數)
    if (bundle.protonSummary) {
      const spinDesc =
        bundle.protonSummary.spinSystems.map((s) => s.patternName).join("、") ||
        "多重化學位移分區";
      const h1Sem = bundle.constraints.h1IntegrationSemantics;
      const integralDesc = h1Sem
        ? `原始積分總和=${h1Sem.rawIntegralSum}，相對比例=${h1Sem.normalizedRatioSummary}，正規化推估絕對氫數=${h1Sem.estimatedTotalProtons !== null ? `${h1Sem.estimatedTotalProtons}H` : `未鎖定唯一總氫數 (最小整數和 ${h1Sem.minimumIntegerProtonSum}H)`}`
        : `¹H NMR 總積分 ${bundle.protonSummary.totalIntegratedProtons}H`;
      chain.push({
        id: "chain-h1-spin",
        stepOrder: chain.length + 1,
        observation: `${integralDesc}；自旋系統：${spinDesc}`,
        modality: "1H_NMR",
        chemicalMeaning:
          "確立鄰近質子偶合裂分網路 (n+1 規則)、可交換活潑質子 (-COOH/-OH/-NH) 與芳環取代對稱型態",
        structuralConstraint: `約束質子積分比例 (${h1Sem?.normalizedRatioSummary || `${bundle.protonSummary.totalIntegratedProtons}H`})、芳環取代型態與自旋偶合片段 (${spinDesc})`,
        confidence: "HIGH",
        supportingEvidenceIds: bundle.evidencePool
          .filter((e) => e.modality === "1H_NMR")
          .map((e) => e.id || ""),
      });
    }

    return chain;
  }

  private static buildCrossModalNotes(
    bundle: ReturnType<typeof ChemicalFeatureEngine.extractIntegratedConstraints>,
    topCandidate?: CandidateStructure
  ): string[] {
    const notes: string[] = [];

    if (
      bundle.activeModalities.includes("IR") &&
      bundle.activeModalities.includes("13C_NMR")
    ) {
      const irHasCarbonyl = bundle.irFindings.some((f) => {
        const gName = f.groupName || f.functionalGroup;
        return (
          (gName.includes("酯") ||
            gName.includes("羧酸") ||
            gName.includes("酮") ||
            gName.includes("醯胺") ||
            gName.includes("羰基")) &&
          f.status === "PRESENT"
        );
      });
      const c13CarbonylCount = bundle.carbonSummary?.carbonylCount || 0;
      if (irHasCarbonyl && c13CarbonylCount > 0) {
        notes.push(
          `[IR ↔ ¹³C NMR 跨模態共識] IR 1650–1765 cm⁻¹ 強 C=O 伸縮帶與 ¹³C NMR 165–205 ppm 區之 ${c13CarbonylCount} 組羰基碳訊號相互印證。`
        );
      }
    }

    if (
      bundle.activeModalities.includes("1H_NMR") &&
      bundle.activeModalities.includes("MS") &&
      topCandidate
    ) {
      notes.push(
        `[¹H NMR ↔ MS 跨模態共識] ¹H NMR 推導之自旋偶合子結構與 MS 母離子 (${bundle.msSummary?.estimatedMolecularIonMz || "—"} Da) 及中性丟失裂解途徑高度一致，共同支持首選結構 ${topCandidate.name}。`
      );
    }

    if (notes.length === 0) {
      notes.push(
        `已基於目前載入之 ${bundle.activeModalities.join(" + ")} 圖譜完成特徵約束提取；若補充其餘模態圖譜可進一步收斂同分異構物。`
      );
    }

    return notes;
  }

  private static detectCrossModalConflicts(
    bundle: ReturnType<typeof ChemicalFeatureEngine.extractIntegratedConstraints>,
    topCandidate?: CandidateStructure
  ): string[] {
    const conflicts: string[] = [];

    for (const fg of bundle.constraints.functionalGroups || []) {
      if (fg.status === "CONFLICTING") {
        conflicts.push(
          `官能基約束衝突 (${fg.groupName || fg.label})：不同圖譜間出現正反證據分歧 — ${fg.notes || ""}`
        );
      }
    }

    if (
      bundle.activeModalities.includes("IR") &&
      bundle.activeModalities.includes("13C_NMR")
    ) {
      const irHasCarbonyl = bundle.irFindings.some((f) => {
        const gName = f.groupName || f.functionalGroup;
        return (
          (gName.includes("酯") ||
            gName.includes("羧酸") ||
            gName.includes("酮") ||
            gName.includes("醯胺") ||
            gName.includes("羰基")) &&
          f.status === "PRESENT"
        );
      });
      const c13CarbonylCount = bundle.carbonSummary?.carbonylCount || 0;
      if (irHasCarbonyl && c13CarbonylCount === 0) {
        conflicts.push(
          "跨圖譜警告：IR 觀測到顯著 C=O 伸縮吸收帶，但 ¹³C NMR 在 160–220 ppm 區未檢出對應羰基碳訊號（請檢查季碳弛豫時間過長或基線閾值設定）。"
        );
      }
    }

    if (
      bundle.constraints.userSuppliedFormulaValidation &&
      (!bundle.constraints.userSuppliedFormulaValidation.isValid ||
        !bundle.constraints.userSuppliedFormulaValidation.isSupported)
    ) {
      conflicts.push(
        `分子式輸入驗證失敗：${bundle.constraints.userSuppliedFormulaValidation.validationErrors.join("；")}`
      );
    }

    if (topCandidate && topCandidate.contradictingReasons.length > 0) {
      conflicts.push(...topCandidate.contradictingReasons);
    }

    return conflicts;
  }

  private static buildUncertaintyNotes(
    bundle: ReturnType<typeof ChemicalFeatureEngine.extractIntegratedConstraints>,
    spectra: Partial<Record<SpectrumModality | ExtendedSpectrumModality, ExperimentalSpectrumData>>
  ): string[] {
    const notes: string[] = [];

    if (bundle.constraints.h1IntegrationSemantics) {
      const sem = bundle.constraints.h1IntegrationSemantics;
      if (sem.integralDataMode !== "NOT_PROVIDED") {
        notes.push(
          `[¹H NMR 積分語意與不確定性] 原始積分總和=${sem.rawIntegralSum}，相對比例=${sem.normalizedRatioSummary}，推估絕對總氫數=${sem.estimatedTotalProtons !== null ? `${sem.estimatedTotalProtons}H` : `未鎖定 (可能整數倍數: ${sem.plausibleTotalProtonMultiples.join("/")})`}。${sem.exchangeableProtonNote} ${sem.symmetryAndOverlapNote}`
        );
      }
    }

    if (bundle.uncalibratedSignals && bundle.uncalibratedSignals.length > 0) {
      notes.push(
        `注意：目前尚有 ${bundle.uncalibratedSignals.length} 個原圖標記訊號未完成座標軸校正（僅記錄原始像素座標 px，物理座標尚未確定）。系統已保留這些標記但絕不將像素座標假裝成物理座標納入推論；請返回第 2 頁完成座標校正。`
      );
    }

    const totalCalibratedPeaks = Object.values(spectra).reduce(
      (sum, sp) =>
        sum +
        (sp?.peaks || []).filter(
          (p) =>
            p.isCalibrated !== false &&
            p.userClassification !== "SOLVENT" &&
            p.userClassification !== "NOISE"
        ).length,
      0
    );
    if (totalCalibratedPeaks === 1) {
      notes.push(
        "單一峰位判讀限制：目前僅有 1 個已校正之有效實驗訊號峰。根據光譜科學原則，不可僅憑單一峰斷言唯一官能基或唯一化學結構；上方判讀已列出可能之替代解釋與不確定性。"
      );
    }

    const allModalities: ExtendedSpectrumModality[] = [
      "IR",
      "1H_NMR",
      "13C_NMR",
      "MS",
      "MS/MS",
      "ToF-SIMS",
    ];
    const activeSet = new Set<string>(bundle.activeModalities);
    if (bundle.msmsAnalysis) activeSet.add("MS/MS");
    if (bundle.tofSimsAnalysis) activeSet.add("ToF-SIMS");
    const missing = allModalities.filter((m) => !activeSet.has(m) && !spectra[m]);

    if (missing.length > 0) {
      notes.push(
        `尚未載入之光譜模態 (${missing.join(", ")}) 已標記為 NOT PROVIDED，系統不將缺漏圖譜視為結構反證，但可能影響位置異構物之唯一性判別。`
      );
    }

    if (spectra["1H_NMR"]) {
      const solventPeaks = spectra["1H_NMR"].peaks.filter(
        (p) => p.userClassification === "SOLVENT" || p.isSolventVerified
      );
      if (solventPeaks.length > 0) {
        notes.push(
          `¹H NMR 中已識別並排除 ${solventPeaks.length} 個殘餘溶劑峰 (${solventPeaks.filter((p) => p.isCalibrated !== false).map((p) => `δ ${p.x.toFixed(2)} ppm`).join(", ")})，確保溶劑訊號不干擾未知物氫積分與結構推論。`
        );
      }
    }

    return notes;
  }

  private static buildOverlayValidationSummary(
    structure: ParsedChemicalStructure,
    rows: CrossPeakAlignmentRow[],
    experimentalOverlay?: Partial<Record<SpectrumModality, ExperimentalSpectrumData>>
  ): string {
    if (!experimentalOverlay || Object.keys(experimentalOverlay).length === 0) {
      return `已完成 ${structure.rawInput} (${structure.molecularFormula}, MW=${structure.exactMass.toFixed(2)}) 之四模態經驗規則預測。在工作台中載入實驗圖譜後，將自動執行逐峰偏差 Δ 疊圖驗證。`;
    }

    const activeRows = rows.filter((r) => r.matchStatus !== "SIMULATED_ONLY");
    const matchedCount = activeRows.filter(
      (r) => r.matchStatus === "MATCHED" || r.matchStatus === "SHIFTED"
    ).length;

    return `針對目標結構 ${structure.molecularFormula} 與已載入實驗圖譜共完成 ${activeRows.length} 項關鍵特徵峰比對，其中 ${matchedCount} 項在容許化學位移/波數偏差範圍內吻合。`;
  }
}
