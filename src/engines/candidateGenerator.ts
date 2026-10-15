import {
  CandidateConstraintSatisfaction,
  CandidateResult,
  CandidateScoreBreakdown,
  CandidateStructure,
  ExperimentalSpectrumData,
  SpectrumEvidence,
  SpectrumModality,
  StructuralConstraints,
} from "../types/spectrum";
import { IntegratedAnalysisBundle } from "./chemicalFeatureEngine";
import { FormulaConstraintEngine } from "./candidateGeneration/combinatorialAssembler";
import { ConstraintValidatorAndRanker } from "./candidateGeneration/constraintValidator";
import {
  CrossSpectrumCandidateEvaluation,
  CrossSpectrumValidationMatrixRow,
  CrossSpectrumValidator,
} from "./scientificEngines/crossSpectrumValidator";
import {
  DeterministicStructureGenerator,
  RejectedCandidateGraphRecord,
  ValidatedCandidateGraph,
} from "./scientificEngines/deterministicStructureGenerator";
import {
  FragmentConstraintSolver,
  SolvedConstraintSpace,
} from "./scientificEngines/fragmentConstraintSolver";
import { ChemicalHardConstraintValidator } from "./scientificEngines/chemicalHardConstraintValidator";
import { SpectralEvidenceExtractor } from "./scientificEngines/spectralEvidenceExtractor";

export interface UnifiedCandidatePipelineOutput {
  bundle: IntegratedAnalysisBundle;
  spectrumEvidenceList: SpectrumEvidence[];
  solvedConstraintSpace: SolvedConstraintSpace;
  validatedGraphs: ValidatedCandidateGraph[];
  rejectedCandidates: RejectedCandidateGraphRecord[];
  crossSpectrumEvaluations: CrossSpectrumCandidateEvaluation[];
  rankedCandidates: CandidateResult[];
  validationMatrix: CrossSpectrumValidationMatrixRow[];
}

/**
 * 唯一權威候選結構排序函式 (Single Authoritative Candidate Ranking Entry Point)：
 * 整合：
 * 1. 第一層 Hard Constraints 檢驗結果 (MolecularGraphValidator + 分子式/化合價/連通性)
 * 2. 第二層 Soft Evidence / Score：
 *    - 各模態相容度分數 (IR / 1H NMR / 13C NMR / MS)
 *    - SpectrumConsistencyEvaluator 光譜一致性分數
 *    - CrossSpectrumValidator 跨光譜共識分數
 *    - V5 ConstraintValidatorAndRanker 結構約束滿足度與矛盾扣分
 * 產出單一、無重複、結構一致之 CandidateResult[]。
 */
export function rankCandidates(
  crossSpectrumEvaluations: CrossSpectrumCandidateEvaluation[],
  bundle: IntegratedAnalysisBundle
): CandidateResult[] {
  const { evidencePool, constraints, knownConstraintsSummary, unifiedEvidence } =
    bundle;

  // Section C8: 若使用者輸入之分子式本身無效或不支援，禁止任何候選進入最終排名
  if (
    constraints.userSuppliedFormulaValidation &&
    (!constraints.userSuppliedFormulaValidation.isValid ||
      !constraints.userSuppliedFormulaValidation.isSupported)
  ) {
    return [];
  }

  const authoritativeTargetFormula =
    constraints.userSuppliedFormula?.isValid &&
    constraints.userSuppliedFormula.normalizedFormula
      ? constraints.userSuppliedFormula.normalizedFormula
      : null;

  const results: CandidateResult[] = [];
  const seenSmiles = new Set<string>();
  const seenCanonicalSignatures = new Set<string>();

  for (const crossEval of crossSpectrumEvaluations) {
    const {
      validatedGraph,
      modalityEvaluation,
      crossSpectrumScore,
      supportedModalityCount,
    } = crossEval;

    // 第一層：Pre-Ranking Hard Filter Gate（候選排序前硬性篩選閘門）
    if (
      !validatedGraph.hardConstraintPassed ||
      !validatedGraph.graphValidation.isValid
    ) {
      continue;
    }

    const graph = validatedGraph.candidate;
    const cleanSmiles = graph.smiles.trim();
    const canonicalSig =
      validatedGraph.canonicalSignature ||
      validatedGraph.rawCombinatorialCandidate?.canonicalSignature ||
      cleanSmiles;

    // 執行排序前獨立硬限制複核：確保實際結構解析、化合價、目標分子式、實際總氫數完全合規，絕不因 IR/NMR/MS 高分而繞過
    const hardCheck =
      validatedGraph.hardValidation ||
      ChemicalHardConstraintValidator.validateCandidateStructure(
        cleanSmiles,
        graph.molecularFormula,
        authoritativeTargetFormula,
        constraints.h1IntegrationSemantics
      );

    if (!hardCheck.isValid || !hardCheck.isSupported) {
      continue;
    }
    if (authoritativeTargetFormula && hardCheck.formulaMatch !== true) {
      continue;
    }
    if (
      authoritativeTargetFormula &&
      hardCheck.computedFormula !== authoritativeTargetFormula
    ) {
      continue;
    }
    if (hardCheck.protonConsistency?.isHardFailure) {
      continue;
    }

    if (
      seenSmiles.has(cleanSmiles) ||
      seenCanonicalSignatures.has(canonicalSig)
    ) {
      continue;
    }
    seenSmiles.add(cleanSmiles);
    seenCanonicalSignatures.add(canonicalSig);

    // 結合 V5 ConstraintValidatorAndRanker 進行深度結構限制與片段檢核
    const v5Evaluated =
      ConstraintValidatorAndRanker.validateAndScoreAgainstStructuralConstraints(
        validatedGraph.rawCombinatorialCandidate,
        constraints,
        knownConstraintsSummary || [],
        unifiedEvidence || []
      );

    // 合併支持證據與矛盾原因（保持確定性與去重）
    const supportingReasons: string[] = [
      ...modalityEvaluation.supportingReasons,
    ];
    if (v5Evaluated?.supportingReasons) {
      for (const s of v5Evaluated.supportingReasons) {
        if (
          !s.startsWith("[候選產生來源:") &&
          !supportingReasons.includes(s) &&
          supportingReasons.length < 8
        ) {
          supportingReasons.push(s);
        }
      }
    }

    const contradictingReasons: string[] = [
      ...modalityEvaluation.contradictingReasons,
    ];
    if (v5Evaluated?.contradictingReasons) {
      for (const c of v5Evaluated.contradictingReasons) {
        if (!contradictingReasons.includes(c)) {
          contradictingReasons.push(c);
        }
      }
    }

    const satisfiedConstraints: string[] = [
      ...validatedGraph.satisfiedConstraints,
      ...supportingReasons,
    ];
    const violatedConstraints: string[] = [
      ...validatedGraph.violatedConstraints,
      ...contradictingReasons,
    ];

    const constraintSatisfaction: CandidateConstraintSatisfaction = {
      hardConstraintPassed: true,
      satisfiedConstraints,
      violatedConstraints,
      rejectionReasons: [],
    };

    const contradictionPenalty = Math.min(
      55,
      modalityEvaluation.conflictPenalty +
        Math.max(
          0,
          contradictingReasons.length -
            modalityEvaluation.contradictingReasons.length
        ) *
          10
    );

    const spectrumConsistencyScore =
      modalityEvaluation.spectrumConsistencyScore;

    const scientificScoreLedger=crossEval.scientificScoreLedger;
    if(!scientificScoreLedger.formulaHardCompatible) continue;
    const finalScore=Math.round(scientificScoreLedger.totalScore);
    const ledgerScores=scientificScoreLedger.modalityScores;
    supportingReasons.splice(0);contradictingReasons.splice(0);
    const unknownEvidence:string[]=[];
    for(const entry of scientificScoreLedger.entries){
      const note=`${entry.sourceModality} [${entry.observationIds.join(',')}]: ${entry.method}`;
      if(entry.compatibility===null||entry.weight===0)unknownEvidence.push(note+'（資料不足）');
      else if(entry.compatibility>=.6)supportingReasons.push(note);
      else if(entry.compatibility<.25)contradictingReasons.push(note+'（實測特徵不相容）');
      else unknownEvidence.push(note+'（競爭解釋）');
    }
    satisfiedConstraints.splice(0,satisfiedConstraints.length,...supportingReasons);
    violatedConstraints.splice(0,violatedConstraints.length,...contradictingReasons);

    const ledgerNote="評分是未校準的相容度，非結構正確機率；同一原始觀測僅計一次。";
    const scoreNotes=Object.entries(ledgerScores).filter(([,v])=>v!=null).map(([mod,v])=>`${mod}：${scientificScoreLedger.entries.filter(e=>e.sourceModality===mod&&e.weight>0).length} 個獨立觀測，模型相容分 ${v!.toFixed(1)}/100；方法與原始觀測 ID 可由 scientificScoreLedger 追溯。`);
    supportingReasons.unshift(ledgerNote,...scoreNotes);
    const scoreBreakdown: CandidateScoreBreakdown = {
      irMatchScore: ledgerScores.IR ?? 0,
      nmr1HMatchScore: ledgerScores["1H_NMR"] ?? 0,
      nmr13CMatchScore: ledgerScores["13C_NMR"] ?? 0,
      msMatchScore: ledgerScores.MS ?? 0,
      formulaScore: v5Evaluated?.scoreBreakdown?.formulaScore ?? 90,
      functionalGroupScore:
        v5Evaluated?.scoreBreakdown?.functionalGroupScore ??
        (modalityEvaluation.irScore || 80),
      crossSpectrumBonus: 0,
      consistencyBonus: 0,
      conflictPenalty: 0,
      contradictionPenalty: 0,
      totalScore: finalScore,
      modalityDetails: {
        IR: modalityEvaluation.irEval,
        "1H_NMR": modalityEvaluation.h1Eval,
        "13C_NMR": modalityEvaluation.c13Eval,
        MS: modalityEvaluation.msEval,
      },
    };

    const matchedEvs = evidencePool.filter((e) =>
      modalityEvaluation.matchedEvidenceIds.includes(e.id || "")
    );

    results.push({
      id: graph.id,
      scientificScoreLedger, scoreMeaning:"UNCALIBRATED_COMPATIBILITY",
      rank: 1,
      name: graph.name,
      iupacName: graph.iupacName,
      smiles: cleanSmiles,
      molecularFormula: hardCheck.computedFormula || graph.molecularFormula,
      computedFormula: hardCheck.computedFormula,
      targetFormula: hardCheck.targetFormula,
      formulaMatch: hardCheck.formulaMatch,
      molecularWeight:
        validatedGraph.parsedStructure?.molecularWeight ?? graph.nominalMass,
      exactMass: hardCheck.exactMass || graph.exactMass,
      dbe: validatedGraph.graphValidation.computedDBE,
      unsaturationIndex: graph.unsaturationIndex,
      structuralClass: graph.structuralClass,
      keyStructuralFeatures: graph.keyStructuralFeatures,
      functionalGroups:
        validatedGraph.parsedStructure?.detectedFunctionalGroups ??
        v5Evaluated?.functionalGroups ??
        [],
      structuralMotifs:
        v5Evaluated?.structuralMotifs ?? graph.assembledFragments,
      scaffoldType:
        validatedGraph.rawCombinatorialCandidate.scaffoldType ??
        graph.structuralClass,
      sourceConstraints: knownConstraintsSummary,
      candidateOrigin: validatedGraph.rawCombinatorialCandidate.origin,
      generationMethodLabel:
        validatedGraph.rawCombinatorialCandidate.generationMethodLabel,
      sourceProvenance:
        validatedGraph.rawCombinatorialCandidate.sourceProvenance,
      candidateStructure: validatedGraph.parsedStructure,
      graphValidationResult: {
        isValid: validatedGraph.graphValidation.isValid,
        isConnected: validatedGraph.graphValidation.isConnected,
        isRingClosureBalanced:
          validatedGraph.graphValidation.isRingClosureBalanced,
        allValencesValid: validatedGraph.graphValidation.allValencesValid,
        computedFormula: validatedGraph.graphValidation.computedFormula,
        computedDBE: validatedGraph.graphValidation.computedDBE,
        ringCount: validatedGraph.graphValidation.ringCount,
        heavyAtomCount: validatedGraph.graphValidation.heavyAtomCount,
        errors: validatedGraph.graphValidation.errors,
      },
      hardValidation: hardCheck,
      protonConsistencyReport: hardCheck.protonConsistency,
      nmrConsistencyAnalysis: Object.values(bundle.scientificSources??{}).some(s=>s?.observationCoverage==='CONFIRMED_COMPLETE')?modalityEvaluation.nmrConsistencyAnalysis:undefined,
      constraintSatisfaction,
      hardConstraintPassed: true,
      evidenceSupport: supportingReasons,
      irScore: ledgerScores.IR ?? null,
      h1NmrScore: ledgerScores["1H_NMR"] ?? null,
      c13NmrScore: ledgerScores["13C_NMR"] ?? null,
      msScore: ledgerScores.MS ?? null,
      spectrumConsistencyScore,
      contradictionPenalty,
      crossSpectrumScore,
      finalScore,
      overallScore: finalScore,
      confidence: finalScore,
      rejectionReasons: [],
      violatedConstraints,
      validationReport: v5Evaluated?.validationReport,
      tieredConfidence: v5Evaluated?.tieredConfidence,
      modalityScores: {ir:ledgerScores.IR??"Not Available",h1Nmr:ledgerScores["1H_NMR"]??"Not Available",c13Nmr:ledgerScores["13C_NMR"]??"Not Available",ms:ledgerScores.MS??"Not Available",msms:ledgerScores["MS/MS"]??"Not Available",tofSims:ledgerScores["ToF-SIMS"]??"Not Available"},
      scoreBreakdown,
      supportingEvidence:
        matchedEvs.length > 0 ? matchedEvs : evidencePool.slice(0, 5),
      contradictingEvidence: contradictingReasons,
      unknownEvidence,
      missingEvidence: unknownEvidence,
      supportingReasons,
      contradictingReasons,
      missingExpectedFeatures: [],
      evidenceProvenanceByModality: v5Evaluated?.evidenceProvenanceByModality,
      recommendedExperiments: v5Evaluated?.recommendedExperiments,
      pubchemCid: validatedGraph.rawCombinatorialCandidate.pubchemCid,
      pubchemUrl: validatedGraph.rawCombinatorialCandidate.pubchemUrl,
      verificationSteps: [
        "可对照下方「跨光譜一致性驗證矩陣」或手動送入 Mode B 獨立預測理論光譜。",
        "若有同分異構物競爭，可搭配 2D HSQC / HMBC 驗證長程碳氫偶合連接關係。",
      ],
    });
  }

  // 唯一確定性排序
  results.sort((a, b) => {
    const scoreDiff = (b.finalScore ?? 0) - (a.finalScore ?? 0);
    if (scoreDiff !== 0) return scoreDiff;
    const conflictDiff =
      a.contradictingReasons.length - b.contradictingReasons.length;
    if (conflictDiff !== 0) return conflictDiff;
    const crossDiff = (b.crossSpectrumScore ?? 0) - (a.crossSpectrumScore ?? 0);
    if (crossDiff !== 0) return crossDiff;
    return a.id.localeCompare(b.id);
  });

  return results.map((cand, idx) => ({
    ...cand,
    rank: idx + 1,
  }));
}

export class CandidateGenerator {
  /**
   * 唯一權威候選結構管線 (Authoritative Unified Candidate Pipeline)：
   * Evidence Layer → Constraint Layer → V5 Full Candidate Generation →
   * MolecularGraphValidator (Hard Constraints) → CrossSpectrumValidator →
   * Unified Candidate Ranking (rankCandidates) → Final Candidate List
   */
  static executeUnifiedPipelineFromBundle(
    bundle: IntegratedAnalysisBundle,
    existingEvidenceList: SpectrumEvidence[] = []
  ): UnifiedCandidatePipelineOutput {
    // 1. Constraint Layer: 求解結構約束空間 (分子式候選、IHD 範圍、必備與禁用子結構)
    const solvedConstraintSpace =
      FragmentConstraintSolver.solveConstraintSpace(bundle.constraints);

    // 2. V5 Full Candidate Generation + Molecular Graph Validation (Hard Constraints)
    const { validatedGraphs, rejectedCandidates } =
      DeterministicStructureGenerator.generateValidatedStructuresWithRejections(
        bundle.constraints,
        solvedConstraintSpace
      );

    // 3. Cross-Spectrum Validation (針對同一批通過圖驗證之候選結構進行多模態交叉評估)
    const crossSpectrumEvaluations =
      CrossSpectrumValidator.evaluateCrossSpectrum(validatedGraphs, bundle);

    // 4. Unified Candidate Ranking (唯一權威排序入口)
    const rankedCandidates = rankCandidates(crossSpectrumEvaluations, bundle);

    // 5. 建立跨光譜驗證矩陣 (涵蓋 IR / 1H / 13C / MS / MS-MS / ToF-SIMS)
    const validationMatrix = CrossSpectrumValidator.buildValidationMatrix(
      rankedCandidates,
      bundle
    );

    return {
      bundle,
      spectrumEvidenceList: existingEvidenceList,
      solvedConstraintSpace,
      validatedGraphs,
      rejectedCandidates,
      crossSpectrumEvaluations,
      rankedCandidates,
      validationMatrix,
    };
  }

  /**
   * 從實驗光譜直接執行單一權威管線：
   * Experimental Spectra → SpectralEvidenceExtractor → executeUnifiedPipelineFromBundle
   */
  static runUnifiedCandidatePipeline(
    spectra: Partial<Record<SpectrumModality, ExperimentalSpectrumData>>
  ): UnifiedCandidatePipelineOutput {
    const { bundle, spectrumEvidenceList } =
      SpectralEvidenceExtractor.extractAllEvidence(spectra);
    return this.executeUnifiedPipelineFromBundle(bundle, spectrumEvidenceList);
  }

  /**
   * 統一候選結構產生與排序入口 (相容既有呼叫端，內部完全走單一權威管線)
   */
  static generateRankedCandidates(
    bundle: IntegratedAnalysisBundle
  ): CandidateResult[] {
    return this.executeUnifiedPipelineFromBundle(bundle).rankedCandidates;
  }

  /**
   * 轉發至唯一權威排序函式
   */
  static rankCandidates(
    crossSpectrumEvaluations: CrossSpectrumCandidateEvaluation[],
    bundle: IntegratedAnalysisBundle
  ): CandidateResult[] {
    return rankCandidates(crossSpectrumEvaluations, bundle);
  }
}

export const CandidateStructureGenerator = {
  evaluateFormula: FormulaConstraintEngine.evaluateFormula,
  generateRankedCandidates:
    CandidateGenerator.generateRankedCandidates.bind(CandidateGenerator),
  runUnifiedCandidatePipeline:
    CandidateGenerator.runUnifiedCandidatePipeline.bind(CandidateGenerator),
  executeUnifiedPipelineFromBundle:
    CandidateGenerator.executeUnifiedPipelineFromBundle.bind(
      CandidateGenerator
    ),
  rankCandidates,
};
import {scoreScientificEvidence} from './scientificEngines/evidenceLedger';
