import {
  REFERENCE_SAMPLE_PRESETS,
  buildPresetSpectra,
} from "./referencePresets";
import { CandidateGenerator } from "../../src/engines/candidateGenerator";
import {
  CombinatorialCandidateAssembler,
  FormulaConstraintEngine,
} from "../../src/engines/candidateGeneration/combinatorialAssembler";
import { EvidenceAccumulator } from "../../src/engines/chemicalFeatureEngine";
import { ReasoningEngine } from "../../src/engines/reasoningEngine";
import {
  IRScientificEngine,
  MassSpectrometryEngine,
  NMRScientificEngine,
} from "../../src/engines/scientificEngines";
import { ChemicalHardConstraintValidator } from "../../src/engines/scientificEngines/chemicalHardConstraintValidator";
import { CrossSpectrumValidator } from "../../src/engines/scientificEngines/crossSpectrumValidator";
import { MolecularGraphValidator } from "../../src/engines/scientificEngines/molecularGraphValidator";
import { SpectrumParser } from "../../src/engines/spectrumParser";
import { WorkbenchOrchestrator } from "../../src/engines/workbenchOrchestrator";

export interface ScientificTestCaseResult {
  id: string;
  category: string;
  name: string;
  passed: boolean;
  expectedSummary: string;
  actualSummary: string;
  durationMs: number;
}

export class ScientificEngineTestSuite {
  /**
   * 執行內建確定性科學引擎與單一權威候選生成管線自動化測試套件
   */
  static runAllTests(): ScientificTestCaseResult[] {
    const results: ScientificTestCaseResult[] = [];

    // Test 1: Aspirin 四模態未知物推導與鄰位/對位異構物區分 (Mode A)
    const t0 = performance.now();
    const aspirinPreset = REFERENCE_SAMPLE_PRESETS.find(
      (p) => p.id === "preset-aspirin" || p.id === "aspirin"
    )!;
    const aspirinSpectra = buildPresetSpectra(aspirinPreset);
    const aspirinState =
      WorkbenchOrchestrator.runFullWorkbenchPipeline(aspirinSpectra);
    const topAspirin = aspirinState.rankedCandidates[0];
    const t1 = performance.now();

    results.push({
      id: "test-aspirin-elucidation",
      category: "Mode A 多模態推導",
      name: "乙醯水楊酸 (Aspirin, C9H8O4) 四譜聯合推導與異構物排序",
      passed:
        Boolean(topAspirin) &&
        topAspirin.molecularFormula === "C9H8O4" &&
        topAspirin.smiles === "CC(=O)Oc1ccccc1C(=O)O" &&
        topAspirin.scoreBreakdown.totalScore >= 85,
      expectedSummary:
        "Top #1 候選應為 CC(=O)Oc1ccccc1C(=O)O (C9H8O4)，總分 ≥ 85%",
      actualSummary: topAspirin
        ? `Top #1: ${topAspirin.name} (${topAspirin.molecularFormula}, Score=${topAspirin.scoreBreakdown.totalScore}%)`
        : "無候選產出",
      durationMs: Number((t1 - t0).toFixed(1)),
    });

    // Test 2: Paracetamol 奇數分子量氮規則與對二取代 AA'BB' 識別 (MS & NMR)
    const t2 = performance.now();
    const paraPreset = REFERENCE_SAMPLE_PRESETS.find(
      (p) => p.id === "preset-paracetamol" || p.id === "paracetamol"
    )!;
    const paraSpectra = buildPresetSpectra(paraPreset);
    const paraState =
      WorkbenchOrchestrator.runFullWorkbenchPipeline(paraSpectra);
    const topPara = paraState.rankedCandidates[0];
    const t3 = performance.now();

    results.push({
      id: "test-paracetamol-nitrogen-rule",
      category: "MS 氮規則與 NMR 對稱性",
      name: "對乙醯胺基酚 (Paracetamol, MW=151) 奇數分子量氮規則與對位芳環判別",
      passed:
        paraState.modeAReport.constraints.nitrogenRuleParity === "ODD" &&
        paraState.modeAReport.constraints.aromaticSubstitutionPattern ===
          "PARA_DISUBSTITUTED" &&
        topPara?.molecularFormula === "C8H9NO2",
      expectedSummary:
        "NitrogenRule=ODD, Aromatic=PARA_DISUBSTITUTED, Top #1=C8H9NO2",
      actualSummary: `NitrogenRule=${paraState.modeAReport.constraints.nitrogenRuleParity}, Aromatic=${paraState.modeAReport.constraints.aromaticSubstitutionPattern}, Top #1=${topPara?.molecularFormula}`,
      durationMs: Number((t3 - t2).toFixed(1)),
    });

    // Test 3: 溶劑峰排除測試 (CDCl3 δH 7.26 ppm 不得干擾未知物氫積分)
    const t4 = performance.now();
    const ebPreset = REFERENCE_SAMPLE_PRESETS.find(
      (p) => p.id === "preset-ethyl-benzoate" || p.id === "ethyl_benzoate"
    )!;
    const ebSpectra = buildPresetSpectra(ebPreset);
    const h1WithSolvent = WorkbenchOrchestrator.addManualPeak(
      ebSpectra["1H_NMR"]!,
      {
        x: 7.26,
        y: 65,
        multiplicity: "s",
        integral: 5,
        assignment: "CDCl3 殘餘溶劑峰",
        userClassification: "COMPOUND",
      }
    );
    const taggedH1 = WorkbenchOrchestrator.applyNmrSolventTagging(
      h1WithSolvent,
      "CDCl3"
    );
    const ebState = WorkbenchOrchestrator.runFullWorkbenchPipeline({
      ...ebSpectra,
      "1H_NMR": taggedH1,
    });
    const protonIntegral =
      ebState.modeAReport.protonSummary?.totalIntegratedProtons;
    const t5 = performance.now();

    results.push({
      id: "test-solvent-exclusion",
      category: "NMR 溶劑峰自動排除",
      name: "CDCl₃ (δ 7.26 ppm) 溶劑峰標記與未知物積分保護",
      passed: protonIntegral === 10,
      expectedSummary:
        "排除 δ 7.26 ppm (5H) 溶劑峰後，苯甲酸乙酯未知物總積分維持 10H",
      actualSummary: `未知物有效積分 = ${protonIntegral}H (CDCl₃ 溶劑峰已排除於結構推論外)`,
      durationMs: Number((t5 - t4).toFixed(1)),
    });

    // Test 4: 缺漏光譜應標記為 NOT_PROVIDED 而非 CONTRADICTED (Cross-Spectrum)
    const t6 = performance.now();
    const partialSpectra = {
      IR: aspirinSpectra.IR,
      "1H_NMR": aspirinSpectra["1H_NMR"],
    };
    const partialState =
      WorkbenchOrchestrator.runFullWorkbenchPipeline(partialSpectra);
    const firstRow = partialState.validationMatrix[0];
    const t7 = performance.now();

    results.push({
      id: "test-missing-modality-not-provided",
      category: "跨光譜驗證規則",
      name: "未提供 ¹³C NMR 與 MS 時應標記為 NOT_PROVIDED 而不扣分",
      passed:
        firstRow?.modalityStatus["13C_NMR"] === "NOT_PROVIDED" &&
        firstRow?.modalityStatus.MS === "NOT_PROVIDED",
      expectedSummary: "13C_NMR = NOT_PROVIDED, MS = NOT_PROVIDED",
      actualSummary: `13C_NMR = ${firstRow?.modalityStatus["13C_NMR"]}, MS = ${firstRow?.modalityStatus.MS}`,
      durationMs: Number((t7 - t6).toFixed(1)),
    });

    // Test 5: 確定性分子圖拓撲檢驗器 (合法 SMILES vs 非法五價碳/未閉合環)
    const t8 = performance.now();
    const validGraph = MolecularGraphValidator.validateSmilesGraph(
      "CC(=O)Oc1ccccc1C(=O)O",
      "C9H8O4"
    );
    const invalidGraph = MolecularGraphValidator.validateSmilesGraph(
      "CC(=O)(C)(C)c1ccccc",
      "C9H8O4"
    );
    const t9 = performance.now();

    results.push({
      id: "test-molecular-graph-validator",
      category: "分子圖拓撲與化合價檢驗",
      name: "合法 SMILES 通過驗證且非法五價碳/未閉合環被攔截",
      passed: validGraph.isValid === true && invalidGraph.isValid === false,
      expectedSummary: "ValidGraph=true (C9H8O4, DBE=6), InvalidGraph=false",
      actualSummary: `ValidGraph=${validGraph.isValid} (${validGraph.computedFormula}, DBE=${validGraph.computedDBE}), InvalidGraph=${invalidGraph.isValid} (${invalidGraph.errors.length} errors)`,
      durationMs: Number((t9 - t8).toFixed(1)),
    });

    // Test 6: V5 Candidate Generation Phase 1 (FormulaConstraintEngine + CombinatorialCandidateAssembler)
    const t10 = performance.now();
    const formulaEval = FormulaConstraintEngine.evaluateFormula(
      "C9H8O4",
      aspirinState.modeAReport.constraints
    );
    const assembledForC9H8O4 =
      CombinatorialCandidateAssembler.assembleCandidatesForFormula(
        "C9H8O4",
        6,
        aspirinState.modeAReport.constraints
      );
    const t11 = performance.now();

    results.push({
      id: "test-v5-combinatorial-phase1",
      category: "V5 組合組裝與分子式評估",
      name: "FormulaConstraintEngine 與 CombinatorialCandidateAssembler 完整結構組裝",
      passed:
        formulaEval.dbe === 6 &&
        formulaEval.nitrogenRuleValid === true &&
        assembledForC9H8O4.length >= 2 &&
        assembledForC9H8O4.some((c) => c.smiles === "CC(=O)Oc1ccccc1C(=O)O"),
      expectedSummary:
        "DBE=6, NitrogenRule=valid, 組裝出包含 Aspirin 之多個合法結構異構物",
      actualSummary: `DBE=${formulaEval.dbe}, Assembled=${assembledForC9H8O4.length} isomers (含 Aspirin=${assembledForC9H8O4.some((c) => c.smiles === "CC(=O)Oc1ccccc1C(=O)O")})`,
      durationMs: Number((t11 - t10).toFixed(1)),
    });

    // Test 7: V5 Scientific Engines (IR / NMR / MS / EvidenceAccumulator)
    const t12 = performance.now();
    const irSciOut = IRScientificEngine.analyze(aspirinSpectra.IR!);
    const h1SciOut = NMRScientificEngine.analyze1H(aspirinSpectra["1H_NMR"]!);
    const c13SciOut = NMRScientificEngine.analyze13C(
      aspirinSpectra["13C_NMR"]!
    );
    const msSciOut = MassSpectrometryEngine.analyze(aspirinSpectra.MS!);
    const unifiedEv =
      EvidenceAccumulator.extractUnifiedEvidence(aspirinSpectra);
    const t13 = performance.now();

    results.push({
      id: "test-v5-scientific-engines",
      category: "V5 獨立科學引擎測試",
      name: "IR / ¹H NMR / ¹³C NMR / MS 科學引擎與 EvidenceAccumulator 證據提取",
      passed:
        irSciOut.extractedEvidence.length > 0 &&
        h1SciOut.extractedEvidence.length > 0 &&
        c13SciOut.extractedEvidence.length > 0 &&
        msSciOut.extractedEvidence.length > 0 &&
        unifiedEv.length >= 6,
      expectedSummary:
        "四個獨立科學引擎均產出標準化證據且 EvidenceAccumulator 匯總 ≥ 6 項證據",
      actualSummary: `IR=${irSciOut.extractedEvidence.length}, 1H=${h1SciOut.extractedEvidence.length}, 13C=${c13SciOut.extractedEvidence.length}, MS=${msSciOut.extractedEvidence.length}, Total=${unifiedEv.length}`,
      durationMs: Number((t13 - t12).toFixed(1)),
    });

    // Test 8: Regression Test — 單一權威 Candidate Pipeline 與無重複、一致排序保證
    const t14 = performance.now();
    const directUnified =
      CandidateGenerator.runUnifiedCandidatePipeline(aspirinSpectra);
    const reasoningReport = ReasoningEngine.runModeADeduction(aspirinSpectra);

    const orchCandidates = aspirinState.rankedCandidates;
    const modeACandidates = aspirinState.modeAReport.candidates;
    const directCandidates = directUnified.rankedCandidates;
    const standaloneReasoningCandidates = reasoningReport.candidates;

    // 檢查 candidate 不重複 (by SMILES)
    const uniqueSmilesSet = new Set(orchCandidates.map((c) => c.smiles));
    const noDuplicateCandidates =
      uniqueSmilesSet.size === orchCandidates.length;

    // 檢查所有入口產出之候選序列與最終分數完全一致
    const sameLength =
      orchCandidates.length === modeACandidates.length &&
      orchCandidates.length === directCandidates.length &&
      orchCandidates.length === standaloneReasoningCandidates.length;

    const sameRankingAndScores =
      sameLength &&
      orchCandidates.every(
        (c, idx) =>
          c.smiles === modeACandidates[idx]?.smiles &&
          c.smiles === directCandidates[idx]?.smiles &&
          c.smiles === standaloneReasoningCandidates[idx]?.smiles &&
          c.finalScore === directCandidates[idx]?.finalScore &&
          c.scoreBreakdown.totalScore ===
            standaloneReasoningCandidates[idx]?.scoreBreakdown.totalScore
      );

    // 檢查單一 CandidateResult schema 欄位完整性與 Hard Constraint 一致性
    const schemaConsistent = orchCandidates.every(
      (c) =>
        Boolean(c.smiles) &&
        Boolean(c.molecularFormula) &&
        typeof c.molecularWeight === "number" &&
        c.graphValidationResult?.isValid === true &&
        c.constraintSatisfaction?.hardConstraintPassed === true &&
        c.hardConstraintPassed === true &&
        Array.isArray(c.evidenceSupport) &&
        typeof c.spectrumConsistencyScore === "number" &&
        typeof c.crossSpectrumScore === "number" &&
        typeof c.finalScore === "number" &&
        Array.isArray(c.rejectionReasons) &&
        Array.isArray(c.violatedConstraints)
    );
    const t15 = performance.now();

    results.push({
      id: "test-unified-candidate-pipeline-regression",
      category: "單一權威候選管線迴歸驗證",
      name: "單一 Candidate Generation / Ranking 來源、無重複候選與 Schema 一致性",
      passed:
        noDuplicateCandidates && sameRankingAndScores && schemaConsistent,
      expectedSummary:
        "NoDuplicates=true, IdenticalRankingAcrossAllEntryPoints=true, UnifiedCandidateResultSchema=true",
      actualSummary: `Count=${orchCandidates.length}, NoDuplicates=${noDuplicateCandidates}, SameRanking=${sameRankingAndScores}, SchemaConsistent=${schemaConsistent}`,
      durationMs: Number((t15 - t14).toFixed(1)),
    });

    // Test 9: 空白未知物樣品 (Empty Unknown Sample) 無預設結構、無 Aspirin Bias 驗證
    const t16 = performance.now();
    const emptyState = WorkbenchOrchestrator.runFullWorkbenchPipeline(
      {},
      undefined,
      ""
    );
    const emptyPassed =
      emptyState.rankedCandidates.length === 0 &&
      emptyState.validatedGraphs.length === 0 &&
      emptyState.solvedConstraintSpace.plausibleFormulas.length === 0 &&
      emptyState.bidirectionalReport === null &&
      emptyState.selectedCandidate === null;
    const t17 = performance.now();

    results.push({
      id: "test-empty-unknown-sample-zero-bias",
      category: "空白未知物無偏誤保證",
      name: "Empty Unknown Sample 啟動時不產生預設化合物、不注入 Aspirin 或預設分子式",
      passed: emptyPassed,
      expectedSummary:
        "Candidates=0, Formulas=0, BidirectionalReport=null, SelectedCandidate=null",
      actualSummary: `Candidates=${emptyState.rankedCandidates.length}, Formulas=${emptyState.solvedConstraintSpace.plausibleFormulas.length}, BidirectionalReport=${String(emptyState.bidirectionalReport)}`,
      durationMs: Number((t17 - t16).toFixed(1)),
    });

    // Test 10: PNG/JPG 原始光譜圖片保留原圖、零合成假曲線、2點/3點校正與手動標記進入完整科學分析管線
    const t18 = performance.now();
    const rawImgIr = SpectrumParser.createImageSpectrum({
      modality: "IR",
      fileName: "Unknown_IR_Original.png",
      originalImageUrl:
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      imageDimensions: { width: 800, height: 450 },
      detectedSignals: [
        {
          pixelX: 250,
          pixelY: 360,
          signalType: "BAND",
          source: "ALGORITHM",
          label: "Broad O-H stretch",
        },
      ],
    });
    const calibratedImgIr = WorkbenchOrchestrator.applyThreePointCalibration(
      rawImgIr,
      {
        pointA: { pixelX: 100, pixelY: 400, realX: 3600, realY: 10 },
        pointB: { pixelX: 700, pixelY: 80, realX: 600, realY: 90 },
        pointC: { pixelX: 480, pixelY: 220, realX: 1700, realY: 50 },
      }
    );
    const markedImgIr = WorkbenchOrchestrator.addManualPeak(calibratedImgIr, {
      x: 1755,
      y: 88,
      pixelX: 469,
      pixelY: 340,
      assignment: "Ester C=O stretch (手動標記於原圖)",
      userClassification: "COMPOUND",
    });
    const imgPipelineState = WorkbenchOrchestrator.runFullWorkbenchPipeline({
      IR: markedImgIr,
      "1H_NMR": aspirinSpectra["1H_NMR"],
      "13C_NMR": aspirinSpectra["13C_NMR"],
      MS: aspirinSpectra.MS,
    });
    const imgPassed =
      markedImgIr.points.length === 0 &&
      markedImgIr.peaks.length === 2 &&
      (markedImgIr.imageCalibration?.rSquared ?? 0) > 0.99 &&
      imgPipelineState.modeAReport.irFindings.length > 0 &&
      imgPipelineState.spectrumEvidenceList.length > 0 &&
      imgPipelineState.rankedCandidates.length > 0;
    const t19 = performance.now();

    results.push({
      id: "test-image-spectrum-full-pipeline",
      category: "PNG/JPG 原始影像光譜與校正標記管線",
      name: "原始圖片零合成假曲線 (Points=0)、3點 OLS 校正與原圖手動標記直接觸發完整科學分析",
      passed: imgPassed,
      expectedSummary:
        "SyntheticPoints=0, CalibratedPeaks=2, R²>0.99, IRFindings>0, RankedCandidates>0",
      actualSummary: `SyntheticPoints=${markedImgIr.points.length}, Peaks=${markedImgIr.peaks.length}, R²=${markedImgIr.imageCalibration?.rSquared?.toFixed(4)}, IRFindings=${imgPipelineState.modeAReport.irFindings.length}, Candidates=${imgPipelineState.rankedCandidates.length}`,
      durationMs: Number((t19 - t18).toFixed(1)),
    });

    // Test 11 (Work Package A5): 六種模態 (IR, 1H_NMR, 13C_NMR, MS, MS/MS, ToF-SIMS) 完整資料流與不混淆驗收
    const t20 = performance.now();
    const msmsSpec = SpectrumParser.parseTextSpectrum(
      "MS",
      "aspirin_msms.csv",
      "mz,intensity\n180,15\n138,85\n120,100\n92,45",
      { msType: "MS/MS", ionization: "ESI+", precursorMz: 180 }
    );
    const tofSimsSpec = SpectrumParser.parseTextSpectrum(
      "MS",
      "aspirin_tofsims.csv",
      "mz,intensity\n43,95\n77,60\n91,45\n121,80",
      { msType: "ToF-SIMS", ionization: "ToF-SIMS+" }
    );
    const sixModalityState = WorkbenchOrchestrator.runModeAPipeline({
      ...aspirinSpectra,
      "MS/MS": msmsSpec,
      "ToF-SIMS": tofSimsSpec,
    });
    const evTypes = new Set(
      sixModalityState.spectrumEvidenceList.map((e) => e.spectrumType)
    );
    const hasAllSixInEvidence =
      evTypes.has("IR") &&
      evTypes.has("1H_NMR") &&
      evTypes.has("13C_NMR") &&
      evTypes.has("MS") &&
      evTypes.has("MS/MS") &&
      evTypes.has("ToF-SIMS");
    const msmsEvidences = sixModalityState.spectrumEvidenceList.filter(
      (e) => e.spectrumType === "MS/MS"
    );
    const tofEvidences = sixModalityState.spectrumEvidenceList.filter(
      (e) => e.spectrumType === "ToF-SIMS"
    );
    const msmsNotConfusedWithMs =
      msmsEvidences.length > 0 &&
      msmsEvidences.some(
        (e) =>
          (e.chemicalMeaning || "").includes("Precursor") ||
          (e.chemicalMeaning || "").includes("Neutral Loss") ||
          (e.chemicalMeaning || "").includes("Product Ion")
      ) &&
      msmsEvidences.every((e) => e.sourceSpectrum === "MS/MS");
    const tofPreservesPolarity =
      tofEvidences.length > 0 &&
      tofEvidences.every(
        (e) =>
          e.sourceSpectrum === "ToF-SIMS" &&
          String(e.intensity).includes("POSITIVE")
      );
    const matrixFirstRow = sixModalityState.validationMatrix[0];
    const matrixHasSixModalities = Boolean(
      matrixFirstRow &&
        matrixFirstRow.modalityStatus.IR !== "NOT_PROVIDED" &&
        matrixFirstRow.modalityStatus["1H_NMR"] !== "NOT_PROVIDED" &&
        matrixFirstRow.modalityStatus["13C_NMR"] !== "NOT_PROVIDED" &&
        matrixFirstRow.modalityStatus.MS !== "NOT_PROVIDED" &&
        matrixFirstRow.modalityStatus["MS/MS"] !== "NOT_PROVIDED" &&
        matrixFirstRow.modalityStatus["ToF-SIMS"] !== "NOT_PROVIDED"
    );
    const reportHasSixExperimentalModalities =
      (sixModalityState.modeAReport.experimentalModalities?.length || 0) === 6 &&
      (sixModalityState.modeAReport.missingModalities?.length || 0) === 0;
    const t21 = performance.now();

    results.push({
      id: "test-six-modalities-end-to-end-contract",
      category: "工作包 A：六種光譜模態資料契約驗收",
      name: "IR / ¹H NMR / ¹³C NMR / MS / MS-MS / ToF-SIMS 六模態解析、證據抽取、驗證矩陣與報告不混淆",
      passed:
        hasAllSixInEvidence &&
        msmsNotConfusedWithMs &&
        tofPreservesPolarity &&
        matrixHasSixModalities &&
        reportHasSixExperimentalModalities,
      expectedSummary:
        "AllSixInEvidence=true, MSMSDistinct=true, ToFPolarityPreserved=true, Matrix6Modalities=true",
      actualSummary: `AllSix=${hasAllSixInEvidence}, MSMSCount=${msmsEvidences.length}, ToFCount=${tofEvidences.length}, Matrix6=${matrixHasSixModalities}, ReportModalities=${sixModalityState.modeAReport.experimentalModalities?.join(",")}`,
      durationMs: Number((t21 - t20).toFixed(1)),
    });

    // Test 12 (Work Package B5): 化學式進入 Mode A 推理與峰值→官能基→結構限制→候選結構來源追蹤驗收
    const t22 = performance.now();
    const formulaAndIrState = WorkbenchOrchestrator.runModeAPipeline(
      {
        IR: aspirinSpectra.IR,
        "1H_NMR": aspirinSpectra["1H_NMR"],
      },
      {
        molecularFormula: "C9H8O4",
        chemicalNotes: "NaHCO3 冒泡陽性 (羧酸測試)",
      }
    );
    const formulaEv = formulaAndIrState.spectrumEvidenceList.find(
      (e) => e.spectrumType === "FORMULA"
    );
    const formulaNotDisguisedAsMs =
      Boolean(formulaEv) &&
      formulaEv?.evidenceCategory === "CHEMICAL_FORMULA_EVIDENCE" &&
      formulaEv?.sourceSpectrum === "FORMULA" &&
      formulaAndIrState.bundle.constraints.userSuppliedFormula?.normalizedFormula === "C9H8O4" &&
      formulaAndIrState.bundle.constraints.userSuppliedFormula?.sourceType === "USER_FORMULA_INPUT" &&
      !formulaAndIrState.modeAReport.activeModalities.includes("MS");
    const irEvWithPeakLink = formulaAndIrState.spectrumEvidenceList.find(
      (e) => e.spectrumType === "IR" && (e.sourcePeakIds?.length || 0) > 0
    );
    const fgHasEvidenceLink =
      (formulaAndIrState.bundle.constraints.requiredFunctionalGroups?.length || 0) > 0 &&
      formulaAndIrState.bundle.irFindings.some(
        (f) => f.status === "PRESENT" && (f.evidenceIds?.length || 0) > 0
      );
    const topCandWithTrace = formulaAndIrState.rankedCandidates[0];
    const candidateHasEvidenceSupport =
      Boolean(topCandWithTrace) &&
      topCandWithTrace.molecularFormula === "C9H8O4" &&
      (topCandWithTrace.evidenceSupport?.length || 0) > 0;
    const h1ChainStep = formulaAndIrState.modeAReport.evidenceChain.find(
      (s) => s.modality === "1H_NMR"
    );
    const noCandidateReversePollutionInEvidenceChain =
      Boolean(h1ChainStep) &&
      !(h1ChainStep?.structuralConstraint || "").includes(topCandWithTrace.name);
    const t23 = performance.now();

    results.push({
      id: "test-mode-a-formula-and-provenance-chain",
      category: "工作包 B：證據推理鏈來源追蹤與反污染驗收",
      name: "化學式獨立進入 Mode A、峰值→特徵→官能基→限制→候選結構來源可追溯且無反向污染",
      passed:
        formulaNotDisguisedAsMs &&
        Boolean(irEvWithPeakLink) &&
        fgHasEvidenceLink &&
        candidateHasEvidenceSupport &&
        noCandidateReversePollutionInEvidenceChain,
      expectedSummary:
        "FormulaEvidence=true, PeakToFeatureLink=true, FGToConstraintLink=true, CandidateSupport=true, NoReversePollution=true",
      actualSummary: `Formula=${formulaNotDisguisedAsMs}, PeakLink=${Boolean(irEvWithPeakLink)}, FGLink=${fgHasEvidenceLink}, CandSupport=${topCandWithTrace?.evidenceSupport?.length || 0}, NoPollution=${noCandidateReversePollutionInEvidenceChain}`,
      durationMs: Number((t23 - t22).toFixed(1)),
    });

    // Test 13 (Work Package C1/C2/C3): 兩點與三點校正判定一致性、人工操作優先權與原始數據快照保留驗收
    const t24 = performance.now();
    const uncalImg = SpectrumParser.createImageSpectrum({
      modality: "IR",
      fileName: "uncal_ir.png",
      originalImageUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      imageDimensions: { width: 800, height: 450 },
      calibrationFailed: true,
      detectedSignals: [],
    });
    const isUncalFalse = !SpectrumParser.isSpectrumCalibrated(uncalImg);
    const twoPtImg = WorkbenchOrchestrator.applyTwoPointCalibration(uncalImg, {
      pointA: { pixelX: 100, pixelY: 380, realX: 3600, realY: 10 },
      pointB: { pixelX: 700, pixelY: 100, realX: 600, realY: 90 },
    });
    const threePtImg = WorkbenchOrchestrator.applyThreePointCalibration(uncalImg, {
      pointA: { pixelX: 100, pixelY: 380, realX: 3600, realY: 10 },
      pointB: { pixelX: 700, pixelY: 100, realX: 600, realY: 90 },
      pointC: { pixelX: 400, pixelY: 240, realX: 2100, realY: 50 },
    });
    const bothCalibratedConsistent =
      SpectrumParser.isSpectrumCalibrated(twoPtImg) &&
      SpectrumParser.isSpectrumCalibrated(threePtImg);

    // 數值光譜人工新增、修改、刪除後重新自動尋峰不覆蓋人工操作且保留原始數據快照
    const numIr = SpectrumParser.parseTextSpectrum(
      "IR",
      "sample_ir.csv",
      "wavenumber,absorbance\n3500,10\n3400,85\n3300,12\n1750,15\n1715,92\n1680,14\n1200,20"
    );
    const firstAutoPeak = numIr.peaks[0];
    const afterDelete = WorkbenchOrchestrator.deletePeak(numIr, firstAutoPeak.id);
    const afterAddManual = WorkbenchOrchestrator.addManualPeak(afterDelete, {
      x: 2250,
      y: 78,
      assignment: "Manual Nitrile C≡N Stretch",
      userClassification: "COMPOUND",
    });
    const afterReRunAuto = SpectrumParser.reRunAutoPeakDetection(afterAddManual);
    const deletedStillGone = !afterReRunAuto.peaks.some(
      (p) => p.id === firstAutoPeak.id
    );
    const manualStillKept = afterReRunAuto.peaks.some(
      (p) =>
        Math.abs(p.x - 2250) < 1e-2 &&
        p.assignment === "Manual Nitrile C≡N Stretch"
    );
    const rawSnapshotIntact =
      (afterReRunAuto.rawExperimentalSnapshot?.rawPoints?.length || 0) === 7;
    const t25 = performance.now();

    results.push({
      id: "test-calibration-and-manual-edit-consistency",
      category: "工作包 C：校正一致性、人工操作不覆蓋與原始資料保留驗收",
      name: "2點與3點校正統一判定、人工新增/刪除於重新自動讀譜後完整保留、原始數據不覆寫",
      passed:
        isUncalFalse &&
        bothCalibratedConsistent &&
        deletedStillGone &&
        manualStillKept &&
        rawSnapshotIntact,
      expectedSummary:
        "Uncal=false, 2Pt&3PtCalibrated=true, DeletedNotRestored=true, ManualKept=true, RawIntact=true",
      actualSummary: `UncalFalse=${isUncalFalse}, BothCal=${bothCalibratedConsistent}, DeletedGone=${deletedStillGone}, ManualKept=${manualStillKept}, RawPts=${afterReRunAuto.rawExperimentalSnapshot?.rawPoints?.length || 0}`,
      durationMs: Number((t25 - t24).toFixed(1)),
    });

    // Test 14 (Work Package D & E): 自動讀譜與手動覆核整合進入 Mode A 推理及 Mode A/B 隔離驗收
    const t26 = performance.now();
    const autoReadIr = SpectrumParser.parseTextSpectrum(
      "IR",
      "auto_ir.csv",
      "wavenumber,absorbance\n3000,15\n1718,95\n1600,65\n1280,82\n750,55"
    );
    const hasAutoSuggested = (autoReadIr.autoSuggestedPeaks?.length || 0) > 0;
    const modeAWithAutoRead = WorkbenchOrchestrator.runModeAPipeline(
      { IR: autoReadIr },
      { molecularFormula: "C8H8O2" }
    );
    const modeBInvalidFormulaOnly = WorkbenchOrchestrator.runModeBPrediction(
      "C8H8O2",
      ["IR", "1H_NMR"]
    );
    const modeBValidStructure = WorkbenchOrchestrator.runModeBPrediction(
      "CC(=O)Oc1ccccc1C(=O)O",
      ["IR", "1H_NMR"]
    );
    const predictedFlaggedProperly =
      modeBValidStructure.modeBReport?.predictedSpectra.IR.isSimulated === true &&
      modeBValidStructure.modeBReport?.predictedSpectra.IR.dataOrigin === "EMPIRICAL_SIMULATION" &&
      modeBValidStructure.modeBReport?.predictedSpectra.IR.sourceType === "PREDICTED_SPECTRUM";
    const t27 = performance.now();

    results.push({
      id: "test-auto-reading-and-mode-isolation",
      category: "工作包 D & E：自動讀譜整合與 Mode A/B 嚴格隔離驗收",
      name: "自動讀譜建議峰進入 Mode A 推理、Mode B 拒絕純分子式輸入且預測光譜明確標記為預測資料",
      passed:
        hasAutoSuggested &&
        modeAWithAutoRead.rankedCandidates.length > 0 &&
        modeBInvalidFormulaOnly.bidirectionalReport === null &&
        Boolean(modeBInvalidFormulaOnly.errorMessage) &&
        predictedFlaggedProperly,
      expectedSummary:
        "AutoSuggested>0, ModeACandidates>0, ModeBRejectsFormulaOnly=true, PredictedMarkedSimulated=true",
      actualSummary: `AutoSuggested=${autoReadIr.autoSuggestedPeaks?.length || 0}, ModeACands=${modeAWithAutoRead.rankedCandidates.length}, ModeBFormulaErr=${Boolean(modeBInvalidFormulaOnly.errorMessage)}, PredictedSimulated=${predictedFlaggedProperly}`,
      durationMs: Number((t27 - t26).toFixed(1)),
    });

    // Test 15 (Phase 1 F1): 明確目標分子式硬限制測試
    // 即使傳入 Aspirin (C9H8O4) 實驗光譜，但使用者明確指定目標分子式為 C8H9NO2 時，
    // 所有最終候選的 computedFormula 必須 100% 為 C8H9NO2，絕無 C9H8O4 或 C8H8O3 混入！
    const t28 = performance.now();
    const explicitFormulaOverrideState = WorkbenchOrchestrator.runModeAPipeline(
      aspirinSpectra,
      { molecularFormula: "C8H9NO2" }
    );
    const allMatchExplicitFormula =
      explicitFormulaOverrideState.rankedCandidates.length > 0 &&
      explicitFormulaOverrideState.rankedCandidates.every(
        (c) =>
          c.computedFormula === "C8H9NO2" &&
          c.molecularFormula === "C8H9NO2" &&
          c.formulaMatch === true &&
          c.hardValidation?.isValid === true &&
          c.hardValidation?.atomCounts.C === 8 &&
          c.hardValidation?.atomCounts.H === 9 &&
          c.hardValidation?.atomCounts.N === 1 &&
          c.hardValidation?.atomCounts.O === 2
      );
    const t29 = performance.now();

    results.push({
      id: "test-phase1-authoritative-formula-hard-constraint",
      category: "Phase 1 F1：明確目標分子式硬限制驗收",
      name: "明確輸入目標分子式時所有最終候選 computedFormula 100% 完全一致，無其他分子式混入",
      passed: allMatchExplicitFormula,
      expectedSummary:
        "AllCandidatesComputedFormula=C8H9NO2, FormulaMatch=true, NoOtherFormulaLeaked=true",
      actualSummary: `CandCount=${explicitFormulaOverrideState.rankedCandidates.length}, Formulas=${explicitFormulaOverrideState.rankedCandidates.map((c) => c.computedFormula).join(",")}`,
      durationMs: Number((t29 - t28).toFixed(1)),
    });

    // Test 16 (Phase 1 F2): 宣告分子式與實際結構不一致測試
    // 構造一個候選，其 formula 欄位宣稱符合目標分子式 C9H8O4，但 SMILES 實際為水楊酸甲酯 (COC(=O)c1ccccc1O, C8H8O3)
    const t30 = performance.now();
    const spoofedCheck =
      ChemicalHardConstraintValidator.validateCandidateStructure(
        "COC(=O)c1ccccc1O", // 實際為 C8H8O3
        "C9H8O4", // 偽造宣告為 C9H8O4
        "C9H8O4" // 目標分子式 C9H8O4
      );
    // 並測試試圖繞過前置驗證進入 rankCandidates 時，Pre-Ranking Hard Filter Gate 必須將其刷掉
    const spoofedCrossEval = CrossSpectrumValidator.evaluateCrossSpectrum(
      [
        {
          candidate: {
            id: "spoofed-cand",
            name: "偽造分子式候選",
            iupacName: "methyl 2-hydroxybenzoate",
            molecularFormula: "C9H8O4",
            smiles: "COC(=O)c1ccccc1O",
            unsaturationIndex: 6,
            nominalMass: 180,
            exactMass: 180.0423,
            assembledFragments: ["鄰二取代苯環"],
            structuralClass: "Spoofed",
            keyStructuralFeatures: [],
            assemblyNotes: "Spoofed formula",
          },
          graphValidation: {
            smiles: "COC(=O)c1ccccc1O",
            isValid: true,
            isConnected: true,
            isRingClosureBalanced: true,
            allValencesValid: true,
            computedFormula: "C8H8O3",
            computedAtomCounts: { C: 8, H: 8, O: 3 },
            computedDBE: 5,
            ringCount: 1,
            heavyAtomCount: 11,
            atoms: [],
            bonds: [],
            errors: [],
          },
          hardValidation: spoofedCheck,
          canonicalSignature: "SPOOFED_SIG",
          rawCombinatorialCandidate: {
            id: "spoofed-cand",
            name: "偽造分子式候選",
            iupacName: "methyl 2-hydroxybenzoate",
            smiles: "COC(=O)c1ccccc1O",
            canonicalSignature: "SPOOFED_SIG",
            molecularFormula: "C9H8O4",
            origin: "[Generated Candidate]",
            generationMethodLabel: "Test",
            sourceProvenance: "Test",
            assemblyNotes: "Spoofed",
          },
          hardConstraintPassed: true,
          satisfiedConstraints: [],
          violatedConstraints: [],
          rejectionReasons: [],
        },
      ],
      formulaAndIrState.bundle
    );
    const spoofedRanked = CandidateGenerator.rankCandidates(
      spoofedCrossEval,
      formulaAndIrState.bundle
    );
    const t31 = performance.now();

    results.push({
      id: "test-phase1-declared-vs-computed-formula-mismatch",
      category: "Phase 1 F2：宣告分子式與實際結構不一致淘汰驗收",
      name: "候選宣稱分子式為 C9H8O4 但實際 SMILES 為 C8H8O3 時必須被硬性淘汰",
      passed:
        !spoofedCheck.isValid &&
        spoofedCheck.computedFormula === "C8H8O3" &&
        spoofedCheck.formulaMatch === false &&
        spoofedRanked.length === 0,
      expectedSummary:
        "SpoofedValid=false, ComputedFormula=C8H8O3, FormulaMatch=false, RankedCount=0",
      actualSummary: `SpoofedValid=${spoofedCheck.isValid}, Computed=${spoofedCheck.computedFormula}, FormulaMatch=${spoofedCheck.formulaMatch}, RankedCount=${spoofedRanked.length}`,
      durationMs: Number((t31 - t30).toFixed(1)),
    });

    // Test 17 (Phase 1 F3): 氫數不一致淘汰測試
    // 當目標分子式固定為 C8H8O (8H) 時，總氫數為 10H 的結構 (如乙苯 C8H10 或 1-苯乙醇 CC(O)c1ccccc1 C8H10O) 必須視為硬限制失敗並淘汰
    const t32 = performance.now();
    const wrongHydrogenCheck =
      ChemicalHardConstraintValidator.validateCandidateStructure(
        "CC(O)c1ccccc1", // C8H10O (10H)
        "C8H8O",
        "C8H8O" // 目標 8H
      );
    const t33 = performance.now();

    results.push({
      id: "test-phase1-hydrogen-count-mismatch-rejection",
      category: "Phase 1 F3：氫數不一致硬限制淘汰驗收",
      name: "目標分子式固定時，實際總氫數不符 (10H ≠ 8H) 的結構必須判定為硬限制失敗並淘汰",
      passed:
        !wrongHydrogenCheck.isValid &&
        wrongHydrogenCheck.formulaMatch === false &&
        wrongHydrogenCheck.protonConsistency?.computedTotalHydrogens === 10 &&
        wrongHydrogenCheck.protonConsistency?.targetFormulaHydrogens === 8 &&
        wrongHydrogenCheck.protonConsistency?.isHardFailure === true,
      expectedSummary:
        "Valid=false, ComputedH=10, TargetH=8, IsHardFailure=true",
      actualSummary: `Valid=${wrongHydrogenCheck.isValid}, ComputedH=${wrongHydrogenCheck.protonConsistency?.computedTotalHydrogens}, TargetH=${wrongHydrogenCheck.protonConsistency?.targetFormulaHydrogens}, HardFail=${wrongHydrogenCheck.protonConsistency?.isHardFailure}`,
      durationMs: Number((t33 - t32).toFixed(1)),
    });

    // Test 18 (Phase 1 F4): ¹H NMR 相對積分與絕對氫數區分測試
    // 測試相對積分 (1 : 2 : 3，總和 6) 在目標分子式 C8H12O4 (12H) 下正規化為 2H : 4H : 6H (總和 12H)；
    // 在無目標分子式且輸入原始面積積分 (例如 14.2 : 28.4 : 42.6) 時，僅推估相對比例 1:2:3 與最小整數倍數 (6, 12, 18, 24)，不武斷鎖定唯一絕對總氫數！
    const t34 = performance.now();
    const relEnvs = [
      {
        id: "p1",
        environmentLabel: "CH",
        shiftPpm: 5.8,
        expectedShiftRange: [5.5, 6.2] as [number, number],
        multiplicity: "s" as const,
        integration: 1,
        rawIntegralValue: 1,
        coupledNeighborsCount: 0,
        deducedFragment: "=CH-",
        confidence: 0.9,
      },
      {
        id: "p2",
        environmentLabel: "OCH2",
        shiftPpm: 4.2,
        expectedShiftRange: [4.0, 4.4] as [number, number],
        multiplicity: "q" as const,
        integration: 2,
        rawIntegralValue: 2,
        coupledNeighborsCount: 3,
        deducedFragment: "-OCH2-",
        confidence: 0.9,
      },
      {
        id: "p3",
        environmentLabel: "CH3",
        shiftPpm: 1.3,
        expectedShiftRange: [1.1, 1.5] as [number, number],
        multiplicity: "t" as const,
        integration: 3,
        rawIntegralValue: 3,
        coupledNeighborsCount: 2,
        deducedFragment: "-CH3",
        confidence: 0.9,
      },
    ];
    const scaledWithTarget =
      ChemicalHardConstraintValidator.analyzeH1NMRIntegrals(relEnvs, "C8H12O4");
    const rawArbitraryEnvs = relEnvs.map((e, i) => ({
      ...e,
      integration: [14.2, 28.4, 42.6][i],
      rawIntegralValue: [14.2, 28.4, 42.6][i],
    }));
    const unscaledWithoutTarget =
      ChemicalHardConstraintValidator.analyzeH1NMRIntegrals(
        rawArbitraryEnvs,
        null
      );
    const t35 = performance.now();

    results.push({
      id: "test-phase1-h1-nmr-relative-vs-absolute-integrals",
      category: "Phase 1 F4：¹H NMR 相對積分與絕對氫數正規化驗收",
      name: "相對積分 1:2:3 依目標分子式 C8H12O4 正規化為 2H:4H:6H (12H)；無目標分子式時原始面積不武斷鎖定唯一總氫數",
      passed:
        scaledWithTarget.summary.estimatedTotalProtons === 12 &&
        scaledWithTarget.environments.map((e) => e.integration).join(":") ===
          "2:4:6" &&
        unscaledWithoutTarget.summary.integralDataMode ===
          "RAW_UNNORMALIZED_AREA" &&
        unscaledWithoutTarget.summary.estimatedTotalProtons === null &&
        unscaledWithoutTarget.summary.minimumIntegerProtonSum === 6 &&
        (
          unscaledWithoutTarget.summary.plausibleTotalProtonMultiples || []
        ).includes(12),
      expectedSummary:
        "WithTarget(C8H12O4)=2:4:6(12H), WithoutTarget(RawArea)=EstimatedTotalProtons:null, MinIntSum:6",
      actualSummary: `WithTarget=${scaledWithTarget.environments.map((e) => e.integration).join(":")}(${scaledWithTarget.summary.estimatedTotalProtons}H), WithoutTargetMode=${unscaledWithoutTarget.summary.integralDataMode}, EstTotal=${unscaledWithoutTarget.summary.estimatedTotalProtons}, MinInt=${unscaledWithoutTarget.summary.minimumIntegerProtonSum}`,
      durationMs: Number((t35 - t34).toFixed(1)),
    });

    // Test 19 (Phase 1 F5): 可交換質子容忍測試
    // 含 -COOH 與 -OH 的結構 (例如水楊酸 OC(=O)c1ccccc1O, C7H6O3, 總氫數 6H = 4 碳上氫 + 2 可交換氫)，
    // 當 ¹H NMR 在重水交換或寬化下僅觀測到 4H 芳環碳上氫時，不得誤判為總氫數硬性錯誤，且報告必須留下可交換質子說明！
    const t36 = performance.now();
    const onlyCarbonH = [
      {
        id: "ar1",
        environmentLabel: "Ar-H",
        shiftPpm: 7.85,
        expectedShiftRange: [7.7, 8.0] as [number, number],
        multiplicity: "d" as const,
        integration: 1,
        rawIntegralValue: 1,
        coupledNeighborsCount: 1,
        deducedFragment: "Ar-H",
        confidence: 0.9,
      },
      {
        id: "ar2",
        environmentLabel: "Ar-H",
        shiftPpm: 7.48,
        expectedShiftRange: [7.3, 7.6] as [number, number],
        multiplicity: "t" as const,
        integration: 1,
        rawIntegralValue: 1,
        coupledNeighborsCount: 2,
        deducedFragment: "Ar-H",
        confidence: 0.9,
      },
      {
        id: "ar3",
        environmentLabel: "Ar-H",
        shiftPpm: 6.95,
        expectedShiftRange: [6.8, 7.1] as [number, number],
        multiplicity: "d" as const,
        integration: 1,
        rawIntegralValue: 1,
        coupledNeighborsCount: 1,
        deducedFragment: "Ar-H",
        confidence: 0.9,
      },
      {
        id: "ar4",
        environmentLabel: "Ar-H",
        shiftPpm: 6.88,
        expectedShiftRange: [6.7, 7.0] as [number, number],
        multiplicity: "t" as const,
        integration: 1,
        rawIntegralValue: 1,
        coupledNeighborsCount: 2,
        deducedFragment: "Ar-H",
        confidence: 0.9,
      },
    ];
    const exchSem = ChemicalHardConstraintValidator.analyzeH1NMRIntegrals(
      onlyCarbonH,
      "C7H6O3"
    );
    const salicylicCheck =
      ChemicalHardConstraintValidator.validateCandidateStructure(
        "OC(=O)c1ccccc1O", // 水楊酸 C7H6O3: 4 C-H + 2 O-H
        "C7H6O3",
        "C7H6O3",
        exchSem.summary
      );
    const t37 = performance.now();

    results.push({
      id: "test-phase1-exchangeable-proton-tolerance",
      category: "Phase 1 F5：可交換質子容忍與不確定性說明驗收",
      name: "含 OH/COOH 結構 (C7H6O3, 4 C-H + 2 O-H) 在 ¹H NMR 缺少可交換質子峰 (僅見 4H) 時不被誤判為硬性錯誤並附說明",
      passed:
        salicylicCheck.isValid === true &&
        salicylicCheck.protonConsistency?.isHardFailure === false &&
        salicylicCheck.protonConsistency?.computedTotalHydrogens === 6 &&
        salicylicCheck.protonConsistency?.computedCarbonBoundHydrogens === 4 &&
        salicylicCheck.protonConsistency?.computedExchangeableHydrogens === 2 &&
        salicylicCheck.protonConsistency?.status ===
          "CONSISTENT_WITH_EXCHANGEABLE_OR_OVERLAP" &&
        (salicylicCheck.protonConsistency?.uncertaintyExplanation || "").includes(
          "可交換質子"
        ),
      expectedSummary:
        "Valid=true, HardFailure=false, TotalH=6, CarbonH=4, ExchangeableH=2, Status=CONSISTENT_WITH_EXCHANGEABLE_OR_OVERLAP",
      actualSummary: `Valid=${salicylicCheck.isValid}, Status=${salicylicCheck.protonConsistency?.status}, C-H=${salicylicCheck.protonConsistency?.computedCarbonBoundHydrogens}, Exch-H=${salicylicCheck.protonConsistency?.computedExchangeableHydrogens}`,
      durationMs: Number((t37 - t36).toFixed(1)),
    });

    // Test 20 (Phase 1 F6): 不合法結構拒絕測試
    // 價數錯誤 (五價碳 CC(C)(C)(C)C)、無法解析之 SMILES (c1ccc)、負數或非整數 DBE (C2H8 / C4H7)、不支援元素 (C6H5FeCl) 均不得通過驗證
    const t38 = performance.now();
    const pentavalentCheck =
      ChemicalHardConstraintValidator.validateCandidateStructure(
        "CC(C)(C)(C)C",
        "C6H14"
      );
    const brokenSmilesCheck =
      ChemicalHardConstraintValidator.validateCandidateStructure(
        "c1ccc(C(=O)O",
        "C7H6O2"
      );
    const negativeDbeFormulaCheck =
      ChemicalHardConstraintValidator.parseAndValidateFormula("C2H8");
    const nonIntegerDbeFormulaCheck =
      ChemicalHardConstraintValidator.parseAndValidateFormula("C4H7");
    const unsupportedElementFormulaCheck =
      ChemicalHardConstraintValidator.parseAndValidateFormula("C10H10Fe");
    const unsupportedElementSmilesCheck =
      ChemicalHardConstraintValidator.validateCandidateStructure(
        "c1ccccc1[Fe]",
        "C6H5Fe"
      );
    const t39 = performance.now();

    results.push({
      id: "test-phase1-illegal-structure-and-formula-rejection",
      category: "Phase 1 F6：不合法結構與不支援元素拒絕驗收",
      name: "五價碳、斷裂 SMILES、負數或半整數 DBE (C2H8 / C4H7)、未支援金屬元素 (Fe) 全部明確拒絕",
      passed:
        !pentavalentCheck.isValid &&
        !brokenSmilesCheck.isValid &&
        !negativeDbeFormulaCheck.isValid &&
        !nonIntegerDbeFormulaCheck.isValid &&
        !unsupportedElementFormulaCheck.isValid &&
        !unsupportedElementFormulaCheck.isSupported &&
        !unsupportedElementSmilesCheck.isValid,
      expectedSummary:
        "Pentavalent=false, BrokenSMILES=false, NegDBE=false, HalfDBE=false, UnsupportedElement=false",
      actualSummary: `Pentavalent=${pentavalentCheck.isValid}, Broken=${brokenSmilesCheck.isValid}, C2H8=${negativeDbeFormulaCheck.isValid}, C4H7=${nonIntegerDbeFormulaCheck.isValid}, FeSupported=${unsupportedElementFormulaCheck.isSupported}`,
      durationMs: Number((t39 - t38).toFixed(1)),
    });

    // Test 21 (Phase 1 F7): 位置異構物保留與光譜排序測試
    // 同分子式 C9H8O4 的 ortho / meta / para 乙醯氧基苯甲酸異構物都能通過分子式硬限制進入光譜比對，
    // 在 Aspirin (鄰位) 光譜下 ortho 排第 1；在 Paracetamol (C8H9NO2 對位光譜) 下 para 排第 1 且 ortho/meta 皆保留在候選清單中！
    const t40 = performance.now();
    const aspirinIsomers = aspirinState.rankedCandidates.filter(
      (c) => c.computedFormula === "C9H8O4"
    );
    const hasOrthoC9H8O4 = aspirinIsomers.some(
      (c) =>
        c.smiles === "CC(=O)Oc1ccccc1C(=O)O" ||
        c.smiles === "OC(=O)c1ccccc1OC(=O)C"
    );
    const hasMetaC9H8O4 = aspirinIsomers.some(
      (c) =>
        c.smiles.includes("c1cccc(") ||
        (c.smiles.includes("c1cc(") && c.smiles.includes(")ccc1"))
    );
    const hasParaC9H8O4 = aspirinIsomers.some((c) =>
      c.smiles.includes("c1ccc(")
    );
    const orthoWinsForAspirin =
      aspirinIsomers[0]?.smiles === "CC(=O)Oc1ccccc1C(=O)O";

    const paraIsomers = paraState.rankedCandidates.filter(
      (c) => c.computedFormula === "C8H9NO2"
    );
    const hasParaC8H9NO2 = paraIsomers.some((c) =>
      c.smiles.includes("c1ccc(")
    );
    const hasOrthoC8H9NO2 = paraIsomers.some(
      (c) =>
        c.smiles.includes("c1ccccc1") && !c.smiles.endsWith("c1ccccc1")
    );
    const hasMetaC8H9NO2 = paraIsomers.some(
      (c) =>
        c.smiles.includes("c1cccc(") ||
        (c.smiles.includes("c1cc(") && c.smiles.includes(")ccc1"))
    );
    const paraWinsForParacetamol =
      paraIsomers[0]?.smiles === "CC(=O)Nc1ccc(O)cc1";
    const t41 = performance.now();

    results.push({
      id: "test-phase1-positional-isomers-retention-and-ranking",
      category: "Phase 1 F7：位置異構物 (ortho/meta/para) 保留與光譜證據排序驗收",
      name: "同分子式之 ortho / meta / para 位置異構物全部保留通過硬限制，並依 ¹H/¹³C/IR/MS 光譜證據決定勝負",
      passed:
        hasOrthoC9H8O4 &&
        hasMetaC9H8O4 &&
        hasParaC9H8O4 &&
        orthoWinsForAspirin &&
        hasParaC8H9NO2 &&
        hasOrthoC8H9NO2 &&
        hasMetaC8H9NO2 &&
        paraWinsForParacetamol,
      expectedSummary:
        "C9H8O4(ortho+meta+para retained, ortho #1), C8H9NO2(ortho+meta+para retained, para #1)",
      actualSummary: `C9H8O4[o=${hasOrthoC9H8O4},m=${hasMetaC9H8O4},p=${hasParaC9H8O4},#1=${aspirinIsomers[0]?.smiles}], C8H9NO2[o=${hasOrthoC8H9NO2},m=${hasMetaC8H9NO2},p=${hasParaC8H9NO2},#1=${paraIsomers[0]?.smiles}]`,
      durationMs: Number((t41 - t40).toFixed(1)),
    });

    // Test 22 (Phase 1 F8): 無合格候選時的誠實回報測試
    // 當使用者輸入無效分子式 (如 C2H8) 或所有候選均無法滿足極端分子式 (如 C19H4O9) 時，
    // 系統必須回傳 0 個候選並提供明確 noValidCandidateReason，絕不回傳錯誤分子式候選充數！
    const t42 = performance.now();
    const invalidFormulaState = WorkbenchOrchestrator.runModeAPipeline(
      aspirinSpectra,
      { molecularFormula: "C2H8" }
    );
    const unconstructableFormulaState = WorkbenchOrchestrator.runModeAPipeline(
      aspirinSpectra,
      { molecularFormula: "C19H4O9" }
    );
    const honestInvalidReport =
      invalidFormulaState.rankedCandidates.length === 0 &&
      Boolean(invalidFormulaState.modeAReport.noValidCandidateReason) &&
      invalidFormulaState.modeAReport.formulaInputValidation?.isValid === false;
    const honestEmptyReport =
      unconstructableFormulaState.rankedCandidates.length === 0 &&
      Boolean(unconstructableFormulaState.modeAReport.noValidCandidateReason);
    const t43 = performance.now();

    results.push({
      id: "test-phase1-no-valid-candidate-honest-reporting",
      category: "Phase 1 F8：無合格候選時誠實回報與禁止充數驗收",
      name: "當分子式無效或無任何候選通過目標分子式硬限制時，回傳空候選清單與明確原因，絕不回傳錯誤分子式充數",
      passed: honestInvalidReport && honestEmptyReport,
      expectedSummary:
        "InvalidFormula(C2H8)=>0 candidates + error reason; UnmatchedFormula(C19H4O9)=>0 candidates + reason",
      actualSummary: `C2H8_Cands=${invalidFormulaState.rankedCandidates.length}(Reason=${Boolean(invalidFormulaState.modeAReport.noValidCandidateReason)}), C19H4O9_Cands=${unconstructableFormulaState.rankedCandidates.length}(Reason=${Boolean(unconstructableFormulaState.modeAReport.noValidCandidateReason)})`,
      durationMs: Number((t43 - t42).toFixed(1)),
    });

    // Test 23 (Phase 1 G2/G3/G7/G11/G12): 模板/GraphAssembly 硬篩選、完整 ¹H 積分淘汰高分矛盾結構與未輸入分子式不偽造目標分子式
    const t44 = performance.now();
    // 1. 未輸入分子式時，Mode A 不得偽造 userSuppliedFormula，且所有候選 formulaMatch 應標記為 NOT_SPECIFIED
    const noUserFormulaState =
      WorkbenchOrchestrator.runFullWorkbenchPipeline(aspirinSpectra);
    const noFabricatedTargetFormula =
      !noUserFormulaState.modeAReport.constraints.userSuppliedFormula &&
      noUserFormulaState.rankedCandidates.length > 0 &&
      noUserFormulaState.rankedCandidates.every(
        (c) =>
          c.hardValidation?.targetFormula === null &&
          c.hardValidation?.formulaMatch === "NOT_SPECIFIED"
      );
    // 2. 可靠完整 ¹H NMR 積分 (8H, 7 C-H + 1 O-H) 下，碳上氫高達 10H 的高分結構必須被硬性拒絕，不得被 IR/MS 分數掩蓋
    const complete8H = ChemicalHardConstraintValidator.analyzeH1NMRIntegrals(
      aspirinState.modeAReport.constraints.protonEnvironments || [],
      "C9H8O4"
    );
    const highCarbonHCandCheck =
      ChemicalHardConstraintValidator.validateCandidateStructure(
        "CCOC(=O)c1ccccc1C(=O)CC", // C12H14O3 (14H, 14 C-H)
        "C12H14O3",
        null,
        complete8H.summary
      );
    // 3. Mode B 預測流程不受 Mode A 分子式硬限制影響
    const modeBIndependentCheck = WorkbenchOrchestrator.runModeBPrediction(
      "CCOC(=O)c1ccccc1",
      ["IR", "1H_NMR", "13C_NMR", "MS"]
    );
    const t45 = performance.now();

    results.push({
      id: "test-phase1-unprovided-formula-and-integral-hard-gate",
      category: "Phase 1 G7/G11/G12：未提供分子式不偽造目標、完整 ¹H 積分硬攔截與 Mode B 獨立性驗收",
      name: "未提供分子式時不偽造 targetFormula、完整 ¹H 積分下氫數矛盾不可被軟性高分掩蓋、Mode B 預測完全獨立",
      passed:
        noFabricatedTargetFormula &&
        highCarbonHCandCheck.protonConsistency?.isHardFailure === true &&
        highCarbonHCandCheck.isValid === false &&
        Boolean(modeBIndependentCheck.modeBReport) &&
        !modeBIndependentCheck.errorMessage,
      expectedSummary:
        "NoFabricatedTarget=true, HighCarbonHHardFail=true, ModeBIndependent=true",
      actualSummary: `NoFabricatedTarget=${noFabricatedTargetFormula}, HighCHHardFail=${highCarbonHCandCheck.protonConsistency?.isHardFailure}, ModeBOk=${Boolean(modeBIndependentCheck.modeBReport)}`,
      durationMs: Number((t45 - t44).toFixed(1)),
    });

    return results;
  }
}
