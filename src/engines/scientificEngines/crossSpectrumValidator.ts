import {scoreScientificEvidence,type CandidateScoreLedger} from "./evidenceLedger";
import {
  CandidateStructure,
  ExtendedSpectrumModality,
  SpectrumModality,
} from "../../types/spectrum";
import { IntegratedAnalysisBundle } from "../chemicalFeatureEngine";
import {
  CandidateModalityConsistencyEvaluation,
  SpectrumConsistencyEvaluator,
} from "../candidateGeneration/spectrumConsistencyEvaluator";
import { ValidatedCandidateGraph } from "./deterministicStructureGenerator";

export interface CrossSpectrumValidationMatrixRow {
  candidateId: string;
  candidateName: string;
  smiles: string;
  formula: string;
  totalScore: number;
  modalityStatus: Record<
    ExtendedSpectrumModality,
    "SUPPORTED" | "COMPATIBLE" | "CONTRADICTED" | "NOT_PROVIDED"
  >;
  modalityScores: Record<ExtendedSpectrumModality, number | null>;
  graphValid: boolean;
  keySupportingEvidence: string[];
  keyContradictions: string[];
}

export interface CrossSpectrumCandidateEvaluation {
  scientificScoreLedger: CandidateScoreLedger;
  validatedGraph: ValidatedCandidateGraph;
  modalityEvaluation: CandidateModalityConsistencyEvaluation;
  modalityStatus: Record<
    ExtendedSpectrumModality,
    "SUPPORTED" | "COMPATIBLE" | "CONTRADICTED" | "NOT_PROVIDED"
  >;
  modalityScores: Record<ExtendedSpectrumModality, number | null>;
  crossSpectrumScore: number;
  supportedModalityCount: number;
  contradictedModalityCount: number;
}

export class CrossSpectrumValidator {
  /**
   * 跨光譜一致性驗證引擎 (Cross-Spectrum Validator)：
   * 位於 MolecularGraphValidator 之後、Unified Ranking 之前：
   * Candidate Generation → MolecularGraphValidator → CrossSpectrumValidator → Unified Ranking
   * 支援完整六種光譜模態 (IR / ¹H NMR / ¹³C NMR / MS / MS/MS / ToF-SIMS)，未提供之模態嚴格標記為 NOT_PROVIDED。
   */
  static evaluateCrossSpectrum(
    validatedGraphs: ValidatedCandidateGraph[],
    bundle: IntegratedAnalysisBundle
  ): CrossSpectrumCandidateEvaluation[] {
    return validatedGraphs.map((validatedGraph) => {
      const modalityEvaluation =
        SpectrumConsistencyEvaluator.evaluateCandidateModalities(
          validatedGraph.candidate,
          bundle
        );

      const mapStatus = (
        mod: SpectrumModality
      ): "SUPPORTED" | "COMPATIBLE" | "CONTRADICTED" | "NOT_PROVIDED" => {
        const d =
          mod === "IR"
            ? modalityEvaluation.irEval
            : mod === "1H_NMR"
              ? modalityEvaluation.h1Eval
              : mod === "13C_NMR"
                ? modalityEvaluation.c13Eval
                : modalityEvaluation.msEval;

        if (!d || !d.available || d.status === "NOT_PROVIDED") {
          return "NOT_PROVIDED";
        }
        if (
          d.status === "MAJOR_CONFLICT" ||
          d.status === "PARTIAL_CONFLICT" ||
          d.status === "CONTRADICTED"
        ) {
          return "CONTRADICTED";
        }
        if (
          (d.status === "CONSISTENT" || d.status === "SUPPORTED") &&
          d.score >= 85
        ) {
          return "SUPPORTED";
        }
        return "COMPATIBLE";
      };

      const hasMsms = Boolean(bundle.msmsAnalysis);
      const hasTofSims = Boolean(bundle.tofSimsAnalysis);

      const scientificScoreLedger=scoreScientificEvidence(validatedGraph.candidate.smiles,bundle);
      const msmsScore=scientificScoreLedger.modalityScores["MS/MS"]??null;
      const tofSimsScore=scientificScoreLedger.modalityScores["ToF-SIMS"]??null;
      const msmsStatus=msmsScore===null?"NOT_PROVIDED":msmsScore>=85?"SUPPORTED":msmsScore<25?"CONTRADICTED":"COMPATIBLE";
      const tofSimsStatus=tofSimsScore===null?"NOT_PROVIDED":tofSimsScore>=85?"SUPPORTED":tofSimsScore<25?"CONTRADICTED":"COMPATIBLE";
      for(const [mod,detail] of [["IR",modalityEvaluation.irEval],["1H_NMR",modalityEvaluation.h1Eval],["13C_NMR",modalityEvaluation.c13Eval],["MS",modalityEvaluation.msEval]] as const) {
        const score=scientificScoreLedger.modalityScores[mod];
        if(score!=null){detail.score=score;detail.status=score>=85?"SUPPORTED":score<25?"CONTRADICTED":"COMPATIBLE";}
      }
      const modalityStatus: Record<
        ExtendedSpectrumModality,
        "SUPPORTED" | "COMPATIBLE" | "CONTRADICTED" | "NOT_PROVIDED"
      > = {
        IR: mapStatus("IR"),
        "1H_NMR": mapStatus("1H_NMR"),
        "13C_NMR": mapStatus("13C_NMR"),
        MS: mapStatus("MS"),
        "MS/MS": msmsStatus,
        "ToF-SIMS": tofSimsStatus,
      };

      const modalityScores: Record<ExtendedSpectrumModality, number | null> = {
        IR: scientificScoreLedger.modalityScores.IR??null,
        "1H_NMR": scientificScoreLedger.modalityScores["1H_NMR"]??null,
        "13C_NMR": scientificScoreLedger.modalityScores["13C_NMR"]??null,
        MS: scientificScoreLedger.modalityScores.MS??null,
        "MS/MS": msmsScore,
        "ToF-SIMS": tofSimsScore,
      };

      const statuses = Object.values(modalityStatus);
      const supportedModalityCount = statuses.filter(
        (s) => s === "SUPPORTED"
      ).length;
      const compatibleModalityCount = statuses.filter(
        (s) => s === "COMPATIBLE"
      ).length;
      const contradictedModalityCount = statuses.filter(
        (s) => s === "CONTRADICTED"
      ).length;
      const providedCount =
        supportedModalityCount +
        compatibleModalityCount +
        contradictedModalityCount;

      const crossSpectrumScore=scientificScoreLedger.totalScore;

      return {
        validatedGraph,
        scientificScoreLedger,
        modalityEvaluation,
        modalityStatus,
        modalityScores,
        crossSpectrumScore,
        supportedModalityCount,
        contradictedModalityCount,
      };
    });
  }

  /**
   * 由 Unified Candidate Ranking 產出之最終權威候選列表建立跨光譜驗證矩陣列
   */
  static buildValidationMatrix(
    rankedCandidates: CandidateStructure[],
    bundle?: IntegratedAnalysisBundle
  ): CrossSpectrumValidationMatrixRow[] {
    const hasMsms = Boolean(bundle?.msmsAnalysis);
    const hasTofSims = Boolean(bundle?.tofSimsAnalysis);

    return rankedCandidates.map((cand) => {
      const details = cand.scoreBreakdown.modalityDetails;

      const mapStatus = (
        mod: SpectrumModality
      ): "SUPPORTED" | "COMPATIBLE" | "CONTRADICTED" | "NOT_PROVIDED" => {
        const d = details?.[mod];
        if (!d || !d.available || d.status === "NOT_PROVIDED") {
          return "NOT_PROVIDED";
        }
        if (
          d.status === "MAJOR_CONFLICT" ||
          d.status === "PARTIAL_CONFLICT" ||
          d.status === "CONTRADICTED"
        ) {
          return "CONTRADICTED";
        }
        if (
          (d.status === "CONSISTENT" || d.status === "SUPPORTED") &&
          d.score >= 85
        ) {
          return "SUPPORTED";
        }
        return "COMPATIBLE";
      };

      const msmsScoreVal = hasMsms
        ? typeof cand.modalityScores?.msms === "number"
          ? cand.modalityScores.msms
          : null
        : null;
      const tofSimsScoreVal = hasTofSims
        ? typeof cand.modalityScores?.tofSims === "number"
          ? cand.modalityScores.tofSims
          : null
        : null;

      return {
        candidateId: cand.id,
        candidateName: cand.name,
        smiles: cand.smiles,
        formula: cand.molecularFormula,
        totalScore: cand.finalScore ?? cand.scoreBreakdown.totalScore,
        modalityStatus: {
          IR: mapStatus("IR"),
          "1H_NMR": mapStatus("1H_NMR"),
          "13C_NMR": mapStatus("13C_NMR"),
          MS: mapStatus("MS"),
          "MS/MS": hasMsms
            ? (msmsScoreVal ?? 0) >= 85
              ? "SUPPORTED"
              : "COMPATIBLE"
            : "NOT_PROVIDED",
          "ToF-SIMS": hasTofSims
            ? (tofSimsScoreVal ?? 0) >= 85
              ? "SUPPORTED"
              : "COMPATIBLE"
            : "NOT_PROVIDED",
        },
        modalityScores: {
          IR: cand.irScore ?? (details?.IR?.available ? details.IR.score : null),
          "1H_NMR":
            cand.h1NmrScore ??
            (details?.["1H_NMR"]?.available ? details["1H_NMR"].score : null),
          "13C_NMR":
            cand.c13NmrScore ??
            (details?.["13C_NMR"]?.available ? details["13C_NMR"].score : null),
          MS: cand.msScore ?? (details?.MS?.available ? details.MS.score : null),
          "MS/MS": msmsScoreVal,
          "ToF-SIMS": tofSimsScoreVal,
        },
        graphValid: cand.graphValidationResult?.isValid ?? true,
        keySupportingEvidence: cand.supportingReasons,
        keyContradictions: cand.contradictingReasons,
      };
    });
  }
}
