import {
  CandidateStructure,
  CandidateValidationReport,
  ChemicalFeatureEvidence,
  EvidenceSpectrumSource,
  OverallEvidenceLevel,
  StructuralConstraints,
  TieredConfidenceMetrics,
} from "../../types/spectrum";
import { AssembledRawCandidate } from "./combinatorialAssembler";
import { ChemicalGraphValidator } from "./graphValidator";

/**
 * Constraint Validation & Candidate Ranking Engine (V5 + V7 Unified ScoreBreakdown)
 * Evaluates generated molecular graphs strictly against Unified StructuralConstraints & Unified Evidence.
 */
export class ConstraintValidatorAndRanker {
  static validateAndScoreAgainstStructuralConstraints(
    raw: AssembledRawCandidate,
    constraints: StructuralConstraints,
    knownConstraintsSummary: string[],
    unifiedEvidence: ChemicalFeatureEvidence[] = []
  ): CandidateStructure | null {
    const graphCheck = ChemicalGraphValidator.validateCandidateSmiles(
      raw.smiles,
      raw.molecularFormula
    );
    if (!graphCheck.valid || !graphCheck.parsedStructure || !graphCheck.graph) {
      return null;
    }

    const parsed = graphCheck.parsedStructure;
    const graph = graphCheck.graph;
    const fgText = parsed.detectedFunctionalGroups.join(" ");

    const activeSources =
      constraints.contributingSources &&
      constraints.contributingSources.length > 0
        ? constraints.contributingSources
        : [constraints.source];
    const isSingleModality =
      activeSources.length <= 1 &&
      constraints.source !== "CROSS_VALIDATION" &&
      constraints.source !== "MULTI_MODAL";
    const capScore = isSingleModality
      ? 55
      : activeSources.length === 2
        ? 74
        : 85;

    const isIR =
      activeSources.includes("IR") ||
      (constraints.requiredFunctionalGroups || []).some(
        (fg) => fg.sourceModality === "IR"
      );
    const isH1 =
      activeSources.includes("1H_NMR") ||
      (constraints.protonEnvironments?.length || 0) > 0;
    const isC13 =
      activeSources.includes("13C_NMR") ||
      (constraints.carbonEnvironments?.length || 0) > 0;
    const isMS =
      activeSources.includes("MS") ||
      activeSources.includes("HRMS") ||
      (constraints.molecularFormula?.candidates?.length || 0) > 0;
    const isMSMS =
      activeSources.includes("MSMS") ||
      (constraints.fragmentationConstraints || []).some(
        (fc) => fc.neutralLossDa !== undefined
      );
    const isToFSIMS =
      activeSources.includes("TOF_SIMS") ||
      (constraints.requiredFunctionalGroups || []).some(
        (fg) =>
          fg.sourceModality === "TOF_SIMS" || fg.sourceModality === "ToF-SIMS"
      );

    let score = 50;
    const supporting: string[] = [
      `[候選產生來源: ${constraints.source}] ${raw.assemblyNotes}`,
    ];
    const contradicting: string[] = [];
    const missing: string[] = [];
    const unknownEvidence: string[] = [];

    const evidenceProvenanceByModality: Partial<
      Record<EvidenceSpectrumSource, string[]>
    > = {
      IR: [],
      H1_NMR: [],
      C13_NMR: [],
      MS: [],
      MSMS: [],
      TOF_SIMS: [],
    };

    const recordModalityProvenance = (
      mod: EvidenceSpectrumSource,
      entry: string
    ) => {
      if (!evidenceProvenanceByModality[mod]) {
        evidenceProvenanceByModality[mod] = [];
      }
      evidenceProvenanceByModality[mod]!.push(entry);
    };

    for (const ev of unifiedEvidence) {
      if (ev.status === "SUPPORTED" || ev.status === "POSSIBLE") {
        const provMod = ev.provenance?.source;
        if (provMod && provMod !== "MULTI_MODAL") {
          recordModalityProvenance(
            provMod,
            `[${provMod} | ${ev.provenance?.model || "ScientificEngine"} | ${
              ev.provenance?.method || "EMPIRICAL"
            }] ${ev.featureName} (conf=${ev.confidence}, unc=${
              ev.uncertainty ?? Number((1 - ev.confidence).toFixed(2))
            })`
          );
        }
      }
    }

    if (!isIR) {
      const msg = "IR: NOT_PROVIDED (未提供紅外光譜，非 CONTRADICTED)";
      missing.push(msg);
      unknownEvidence.push(msg);
    }
    if (!isH1) {
      const msg = "H1_NMR: NOT_PROVIDED (未提供 ¹H NMR 光譜，非 CONTRADICTED)";
      missing.push(msg);
      unknownEvidence.push(msg);
    }
    if (!isC13) {
      const msg = "C13_NMR: NOT_PROVIDED (未提供 ¹³C NMR 光譜，非 CONTRADICTED)";
      missing.push(msg);
      unknownEvidence.push(msg);
    }
    if (!isMS) {
      const msg = "MS: NOT_PROVIDED (未提供 MS 質譜，非 CONTRADICTED)";
      missing.push(msg);
      unknownEvidence.push(msg);
    }
    if (!isMSMS) {
      unknownEvidence.push(
        "MSMS: NOT_PROVIDED (未提供 MS/MS 串聯質譜，非 CONTRADICTED)"
      );
    }
    if (!isToFSIMS) {
      unknownEvidence.push(
        "TOF_SIMS: NOT_PROVIDED (未提供 ToF-SIMS 表面質譜，非 CONTRADICTED)"
      );
    }

    if (constraints.carbonyl?.status === "PRESENT") {
      const allowed = constraints.carbonyl.allowedSubtypes;
      const hasAld = fgText.includes("醛");
      const hasKet = fgText.includes("酮");
      const hasEst = fgText.includes("酯");
      const hasAcid = fgText.includes("羧酸");
      const hasAmide = fgText.includes("醯胺");

      const matchesSubtype =
        (allowed.includes("Aldehyde") && hasAld) ||
        (allowed.includes("Ketone") && hasKet) ||
        (allowed.includes("Ester") && hasEst) ||
        (allowed.includes("Carboxylic acid") && hasAcid) ||
        (allowed.includes("Amide") && hasAmide);

      if (matchesSubtype) {
        score += 14;
        const msg = `符合 [${constraints.source}] 羰基次類型約束 (${allowed.join("/")})`;
        supporting.push(msg);
        if (isIR) recordModalityProvenance("IR", msg);
      } else if (hasAld || hasKet || hasEst || hasAcid || hasAmide) {
        score -= 10;
        contradicting.push(
          `羰基次類型與 [${constraints.source}] 首選約束 (${allowed.join("/")}) 不完全吻合`
        );
      } else {
        score -= 22;
        contradicting.push(`缺少 [${constraints.source}] 要求之羰基官能基`);
      }
    } else if (constraints.carbonyl?.status === "ABSENT") {
      if (
        fgText.includes("醛") ||
        fgText.includes("酮") ||
        fgText.includes("酯") ||
        fgText.includes("羧酸") ||
        fgText.includes("醯胺")
      ) {
        score -= 25;
        contradicting.push(`違反 [${constraints.source}] 無羰基排除約束`);
      }
    }

    const candHasHeteroAromatic =
      graph.atoms.some(
        (a) =>
          a.isAromatic &&
          (a.element === "N" || a.element === "O" || a.element === "S")
      ) ||
      fgText.includes("吡啶") ||
      fgText.includes("雜芳") ||
      fgText.includes("嘧啶") ||
      fgText.includes("吡嗪") ||
      fgText.includes("吡咯") ||
      fgText.includes("呋喃") ||
      fgText.includes("噻吩");

    const aromaticNAtoms = graph.atoms.filter(
      (a) => a.isAromatic && a.element === "N"
    );
    const isSixMemberedPyridineFamily =
      graph.aromaticAtomCount === 6 && aromaticNAtoms.length === 1;
    const ringSubstituentCount = graph.atoms.filter(
      (a) =>
        a.isAromatic &&
        a.neighbors.some((nb) => !graph.atoms[nb.toAtom].isAromatic)
    ).length;

    const heteroConstraint =
      constraints.heteroaromatic || constraints.heteroaromaticConstraints;

    if (heteroConstraint?.status === "PRESENT") {
      if (candHasHeteroAromatic) {
        score += 16;
        const msg = `符合 [${constraints.source}] 正交確認之含氮/雜原子芳香環骨架約束 (Heteroaromatic ring)`;
        supporting.push(msg);
        if (isH1) recordModalityProvenance("H1_NMR", msg);
        if (isC13) recordModalityProvenance("C13_NMR", msg);

        const symType =
          heteroConstraint.symmetryType || heteroConstraint.symmetryHint || "";
        if (isSixMemberedPyridineFamily) {
          if (
            (symType.includes("unsubstituted") ||
              symType === "C2v-pyridine") &&
            ringSubstituentCount === 0
          ) {
            score += 14;
            const symMsg =
              "六元含氮雜芳環無環外取代基 (C₂v 對稱，3 組芳香質子 2H:1H:2H 與 3 組芳香碳 Cα/Cβ/Cγ) 契合實驗對稱性與鄰氮去遮蔽";
            supporting.push(symMsg);
            if (isH1) recordModalityProvenance("H1_NMR", symMsg);
          } else if (
            symType.includes("4_substituted") &&
            (graph.ringSubstitutionTopology === "1,4-para" ||
              raw.scaffoldType?.includes("4-Substituted"))
          ) {
            score += 12;
            const symMsg =
              "4-取代吡啶環之 C₂v 對稱軸 (2 組芳香質子 AA'BB' 與 3 組芳香碳) 契合實驗對稱性";
            supporting.push(symMsg);
            if (isH1) recordModalityProvenance("H1_NMR", symMsg);
          } else if (
            symType.includes("2_or_3_substituted") &&
            ringSubstituentCount === 1 &&
            !raw.scaffoldType?.includes("4-Substituted")
          ) {
            score += 10;
            const symMsg =
              "2-或 3-單取代吡啶環之非對稱拓樸 (4 組不等價芳香質子與 5 組芳香碳) 契合實驗對稱性";
            supporting.push(symMsg);
            if (isH1) recordModalityProvenance("H1_NMR", symMsg);
          }
        }
      } else {
        score -= 14;
        contradicting.push(
          `與 [${constraints.source}] 含氮雜芳環首選假設不同：此結構為苯環衍生物或非雜芳環異構物`
        );
      }
    } else if (heteroConstraint?.status === "POSSIBLE") {
      // Competing hypothesis (Level 2/3): reward both heteroaromatic and EWG-substituted benzenoid isomers without penalizing benzenoids
      if (candHasHeteroAromatic) {
        score += 6;
        supporting.push(
          `相容於 [${constraints.source}] 含氮雜芳環競爭假設 (Level 3/4 Competing Hypothesis)`
        );
      } else if (graph.aromaticAtomCount >= 6) {
        score += 6;
        supporting.push(
          `相容於 [${constraints.source}] 拉電子基取代苯環或芳基羰基/亞胺競爭假設 (Level 3 Competing Hypothesis)`
        );
      }
    } else if (
      candHasHeteroAromatic &&
      (constraints.protonEnvironments?.length || 0) > 0 &&
      !(constraints.protonEnvironments || []).some((p) => p.shiftPpm >= 8.15)
    ) {
      score -= 18;
      contradicting.push(
        "[H1_NMR] 候選結構含吡啶/雜芳環核心，但實驗 ¹H NMR 未觀測到 δ > 8.15 ppm 之鄰氮去遮蔽質子訊號"
      );
    }

    if (constraints.aromaticity?.status === "PRESENT") {
      if (graph.aromaticAtomCount >= 5) {
        score += 10;
        const msg = `符合 [${constraints.source}] 芳香/雜芳香環結構約束`;
        supporting.push(msg);
        const hint = constraints.aromaticity.substitutionPatternHint;
        if (hint && hint !== "unknown") {
          const isSymHeteroMatch =
            isSixMemberedPyridineFamily &&
            ((ringSubstituentCount === 0 && hint === "monosubstituted") ||
              (raw.scaffoldType?.includes("4-Substituted") &&
                hint === "1,4-para"));
          if (graph.ringSubstitutionTopology === hint || isSymHeteroMatch) {
            score += 12;
            supporting.push(
              `符合 [${constraints.source}] 芳香環取代對稱性約束 (${hint})`
            );
          } else {
            score -= 8;
            contradicting.push(
              `芳香環取代型態 (${graph.ringSubstitutionTopology}) 與 [${constraints.source}] 對稱性提示 (${hint}) 不同`
            );
          }
        }
      } else {
        score -= 22;
        contradicting.push(`缺少 [${constraints.source}] 要求之芳香/雜芳香環系統`);
      }
    } else if (constraints.aromaticity?.status === "ABSENT") {
      if (graph.aromaticAtomCount > 0) {
        score -= 22;
        contradicting.push(`違反 [${constraints.source}] 非芳香族排除約束`);
      }
    }

    for (const reqFg of constraints.requiredFunctionalGroups || []) {
      const fam = reqFg.groupFamily;
      const matchesFg =
        (fam === "Aldehyde" && fgText.includes("醛")) ||
        (fam === "Ketone" && fgText.includes("酮")) ||
        (fam === "Ester" && fgText.includes("酯")) ||
        (fam === "Carboxylic acid" && fgText.includes("羧酸")) ||
        (fam === "Amide" && fgText.includes("醯胺")) ||
        (fam === "Ether" &&
          (fgText.includes("醚") || fgText.includes("酯"))) ||
        ((fam === "Alcohol" || fam === "Alcohol/Phenol") &&
          (fgText.includes("醇") ||
            fgText.includes("酚") ||
            fgText.includes("羥") ||
            fgText.includes("羧酸"))) ||
        (fam === "Amine" &&
          (fgText.includes("胺") || fgText.includes("醯胺"))) ||
        (fam === "Nitrile" && fgText.includes("腈")) ||
        (fam === "Alkyne" && fgText.includes("炔")) ||
        (fam === "Nitro" && fgText.includes("硝基")) ||
        (fam === "Heteroaromatic" && candHasHeteroAromatic) ||
        (fam === "Aromatic" && graph.aromaticAtomCount >= 5) ||
        (fam === "Siloxane" && (parsed.atomCounts.Si || 0) > 0) ||
        (fam.includes("Br") && (parsed.atomCounts.Br || 0) > 0) ||
        (fam.includes("Cl") && (parsed.atomCounts.Cl || 0) > 0) ||
        fam === "Carbonyl" ||
        fam === "C-H";

      if (matchesFg) {
        score += 4;
        const modKey: EvidenceSpectrumSource =
          reqFg.sourceModality === "1H_NMR"
            ? "H1_NMR"
            : reqFg.sourceModality === "13C_NMR"
              ? "C13_NMR"
              : reqFg.sourceModality === "MS/MS" ||
                  reqFg.sourceModality === "MSMS"
                ? "MSMS"
                : reqFg.sourceModality === "ToF-SIMS" ||
                    reqFg.sourceModality === "TOF_SIMS"
                  ? "TOF_SIMS"
                  : reqFg.sourceModality === "MS" ||
                      reqFg.sourceModality === "HRMS"
                    ? "MS"
                    : "IR";
        recordModalityProvenance(
          modKey,
          `[${modKey}] 符合官能基限制：${reqFg.label} (${reqFg.observedSignal || "observed"})`
        );
      } else if (reqFg.status === "REQUIRED") {
        score -= 10;
        contradicting.push(
          `缺少 [${reqFg.sourceModality}] 必要官能基約束：${reqFg.label}`
        );
      }
    }

    for (const exFg of constraints.excludedFunctionalGroups || []) {
      const fam = exFg.groupFamily;
      const hasExcluded =
        (fam === "Aldehyde" && fgText.includes("醛")) ||
        (fam === "Carboxylic acid" && fgText.includes("羧酸")) ||
        (fam === "Nitrile" && fgText.includes("腈")) ||
        (fam === "Alkyne" && fgText.includes("炔")) ||
        (fam === "Alkene" && fgText.includes("烯")) ||
        ((fam === "Alcohol" || fam === "Alcohol/Phenol" || fam.includes("O-H")) &&
          (fgText.includes("醇") || fgText.includes("酚"))) ||
        (fam === "Aliphatic" &&
          graph.atoms.some(
            (a) => !a.isAromatic && a.element === "C" && a.implicitHydrogens > 0
          ) &&
          !fgText.includes("烯") &&
          !fgText.includes("炔"));
      if (hasExcluded) {
        score -= 14;
        contradicting.push(
          `違反 [${exFg.sourceModality}] 負向排除約束：${exFg.label} (${exFg.observedSignal || "absent"})`
        );
      }
    }

    const pEnvs = constraints.protonEnvironments || [];
    if (pEnvs.length > 0) {
      let shiftHits = 0;
      const hasAldehydeFg = /醛|Aldehyde|CHO/i.test(fgText);
      const hasAcidFg = /羧酸|Carboxylic|COOH/i.test(fgText);
      const hasLabileOhNhFg =
        /醇|酚|羥|羧酸|胺|醯胺|Alcohol|Phenol|Hydroxyl|Carboxylic|Amine|Amide/i.test(
          fgText
        ) ||
        graph.atoms.some(
          (a) => (a.element === "O" || a.element === "N") && a.totalHydrogens > 0
        );
      const hasAromaticFg =
        graph.aromaticAtomCount >= 5 || /芳|苯|Aromatic|Benzene/i.test(fgText);
      const hasAlkoxyOrEsterFg =
        /酯|醚|醇|酚|甲氧|Ester|Ether|Alcohol|Phenol|Methoxy|Acetoxy/i.test(
          fgText
        );
      const hasAliphaticFg =
        (parsed.atomCounts.C || 0) > graph.aromaticAtomCount;

      for (const e of pEnvs) {
        if (e.isExchangeable && hasLabileOhNhFg) {
          shiftHits++;
        } else if (
          e.shiftPpm >= 9.0 &&
          e.shiftPpm <= 10.6 &&
          (hasAldehydeFg || hasLabileOhNhFg)
        ) {
          shiftHits++;
        } else if (e.shiftPpm >= 10.5 && (hasAcidFg || hasLabileOhNhFg)) {
          shiftHits++;
        } else if (
          e.shiftPpm >= 6.3 &&
          e.shiftPpm <= 9.25 &&
          (hasAromaticFg || hasLabileOhNhFg)
        ) {
          shiftHits++;
        } else if (
          e.shiftPpm >= 3.1 &&
          e.shiftPpm <= 6.3 &&
          (hasAlkoxyOrEsterFg ||
            hasLabileOhNhFg ||
            (parsed.atomCounts.O || 0) >= 1 ||
            (parsed.atomCounts.N || 0) >= 1)
        ) {
          shiftHits++;
        } else if (
          e.shiftPpm < 3.2 &&
          (hasAliphaticFg || hasLabileOhNhFg)
        ) {
          shiftHits++;
        }
      }

      const expectedEnvCount =
        parsed.uniqueProtonEnvironmentsCount ?? pEnvs.length;
      const envCountDiff = Math.abs(pEnvs.length - expectedEnvCount);
      if (
        shiftHits === pEnvs.length &&
        (envCountDiff <= 1 || hasLabileOhNhFg) &&
        pEnvs.length > 0
      ) {
        score += 24;
        const msg = `[H1_NMR] 符合 ¹H NMR 質子化學位移區域、積分與環境數約束 (${shiftHits}/${pEnvs.length} 組吻合)`;
        supporting.push(msg);
        recordModalityProvenance("H1_NMR", msg);
      } else if (shiftHits >= Math.max(1, pEnvs.length - 1)) {
        score += 12;
        const msg = `[H1_NMR] 部分符合 ¹H NMR 質子化學位移與環境數約束 (${shiftHits}/${pEnvs.length} 組吻合)`;
        supporting.push(msg);
        recordModalityProvenance("H1_NMR", msg);
      } else if (shiftHits === 0) {
        score -= 18;
        contradicting.push(
          "[H1_NMR] 候選結構缺乏與實驗 ¹H NMR 化學位移對應之質子化學環境"
        );
      } else {
        score -= 10;
        contradicting.push(
          `[H1_NMR] 僅 ${shiftHits}/${pEnvs.length} 組實驗質子環境獲得結構支持`
        );
      }
    }

    const cEnvs = constraints.carbonEnvironments || [];
    if (cEnvs.length > 0) {
      let cHits = 0;
      const hasCarbonylFg =
        /羰|酮|醛|酯|羧酸|醯胺|Carbonyl|Ketone|Aldehyde|Ester|Carboxylic|Amide/i.test(
          fgText
        );
      const hasAromFg =
        graph.aromaticAtomCount >= 5 || /芳|苯|烯|Aromatic|Alkene/i.test(fgText);
      const hasOxygenatedOrHeteroArom =
        hasAromFg &&
        ((parsed.atomCounts.O || 0) >= 1 ||
          (parsed.atomCounts.N || 0) >= 1 ||
          (parsed.atomCounts.F || 0) >= 1);
      const hasSp3Carbon = (parsed.atomCounts.C || 0) > graph.aromaticAtomCount;

      for (const e of cEnvs) {
        if (
          e.shiftPpm >= 165 &&
          (hasCarbonylFg || (e.shiftPpm <= 168 && hasOxygenatedOrHeteroArom))
        ) {
          cHits++;
        } else if (
          e.shiftPpm >= 95 &&
          e.shiftPpm < 166 &&
          (hasAromFg || hasCarbonylFg || fgText.includes("腈"))
        ) {
          cHits++;
        } else if (e.shiftPpm < 100 && hasSp3Carbon) {
          cHits++;
        }
      }

      const expectedCarbonEnvs =
        parsed.uniqueCarbonEnvironmentsCount ?? (parsed.atomCounts.C || 0);
      const countDiff = Math.abs(cEnvs.length - expectedCarbonEnvs);
      if (cHits === cEnvs.length && countDiff <= 1 && cEnvs.length > 0) {
        score += 18;
        const msg = `[C13_NMR] 符合 ¹³C NMR 碳訊號數量、對稱性與位移區域約束 (${cHits}/${cEnvs.length} 組吻合)`;
        supporting.push(msg);
        recordModalityProvenance("C13_NMR", msg);
      } else if (cHits >= Math.max(1, cEnvs.length - 1) && countDiff <= 2) {
        score += 10;
        const msg = `[C13_NMR] 符合 ¹³C NMR 碳訊號位移區域約束 (${cHits}/${cEnvs.length} 組吻合)`;
        supporting.push(msg);
        recordModalityProvenance("C13_NMR", msg);
      } else if (countDiff >= 3 || cHits === 0) {
        score -= 12;
        contradicting.push(
          `[C13_NMR] 結構碳環境數 (${expectedCarbonEnvs}) 或碳化學位移區域與觀測 ¹³C 訊號 (${cEnvs.length} 組) 不符`
        );
      }
    }

    const fragConsts = constraints.fragmentationConstraints || [];
    if (fragConsts.length > 0) {
      let fragHits = 0;
      for (const fc of fragConsts) {
        if (fc.neutralLossDa !== undefined) {
          const nl = Math.round(fc.neutralLossDa);
          if (
            (nl === 18 && /羥|醇|羧酸|Hydroxyl|Alcohol|Carboxylic/i.test(fgText)) ||
            (nl === 42 && /乙醯|酯|Acetyl|Acetoxy|Ester/i.test(fgText)) ||
            (nl === 44 && /羧酸|酯|Carboxylic|Ester/i.test(fgText)) ||
            (nl === 15 && (parsed.atomCounts.C || 0) >= 1) ||
            (nl === 28 && /羰|酮|醛|酯|Carbonyl/i.test(fgText))
          ) {
            fragHits++;
          }
        } else if (fc.ionMz !== undefined) {
          const mzRound = Math.round(fc.ionMz);
          if (
            (mzRound === 77 && graph.aromaticAtomCount >= 6) ||
            (mzRound === 91 &&
              graph.aromaticAtomCount >= 6 &&
              (parsed.atomCounts.C || 0) >= 7) ||
            (mzRound === 43 && /乙醯|酮|酯|Acetyl|Ketone|Ester/i.test(fgText)) ||
            (mzRound === 105 &&
              graph.aromaticAtomCount >= 6 &&
              /羰|酮|酯|酸|Carbonyl|Benzoyl/i.test(fgText)) ||
            (mzRound === 120 &&
              graph.aromaticAtomCount >= 6 &&
              (parsed.atomCounts.O || 0) >= 2) ||
            (mzRound === 138 &&
              graph.aromaticAtomCount >= 6 &&
              (parsed.atomCounts.O || 0) >= 3)
          ) {
            fragHits++;
          }
        }
      }
      if (fragHits > 0) {
        score += Math.min(14, fragHits * 5);
        const msg = `[${
          isMSMS ? "MS/MS" : isToFSIMS ? "ToF-SIMS" : "MS"
        }] 結構骨架與官能基可解釋 ${fragHits} 組實驗質譜特徵離子或中性脫去約束`;
        supporting.push(msg);
        recordModalityProvenance(
          isMSMS ? "MSMS" : isToFSIMS ? "TOF_SIMS" : "MS",
          msg
        );
      }
    }

    if (isIR && parsed.detectedFunctionalGroups.length > 0) {
      score += 4;
    }

    const isFormulaOnly = constraints.source === "FORMULA_ONLY";
    if (isFormulaOnly) {
      if (graph.aromaticAtomCount >= 5) {
        score += 4;
      }
      supporting.push(
        "【僅分子式約束】目前僅有分子式與 DBE 限制，尚未有實驗光譜證據區分憲法異構物。"
      );
    }

    const effectiveCap = isFormulaOnly ? 42 : capScore;
    const cappedRaw = Math.min(effectiveCap, Math.round(score));
    const finalScore = Math.max(18, cappedRaw - contradicting.length * 10);

    const tieredConfidence: TieredConfidenceMetrics = {
      functionalGroupConfidence: isIR
        ? Math.min(88, finalScore + 28)
        : isFormulaOnly
          ? 25
          : Math.min(78, finalScore + 15),
      formulaConfidence:
        isMS || isFormulaOnly ? Math.min(90, finalScore + 30) : 0,
      substructureConfidence:
        isH1 || isC13
          ? Math.min(88, finalScore + 28)
          : isFormulaOnly
            ? 30
            : Math.min(72, finalScore + 12),
      connectivityConfidence:
        isH1 && isC13
          ? Math.min(82, finalScore + 15)
          : isFormulaOnly
            ? 20
            : Math.min(58, finalScore),
      structureConfidence: finalScore,
    };

    const evidenceLevel: OverallEvidenceLevel = isFormulaOnly
      ? "Insufficient Evidence"
      : isSingleModality
        ? "Low"
        : activeSources.length === 2
          ? "Medium"
          : "High";

    const validationReport: CandidateValidationReport = {
      structureParserValid: true,
      formulaMatch: true,
      exactMassMatch: true,
      dbeMatch: true,
      functionalGroupCompatibility: isFormulaOnly
        ? "Not Available"
        : tieredConfidence.functionalGroupConfidence,
      irCompatibility: isIR
        ? tieredConfidence.functionalGroupConfidence
        : "Not Available",
      h1NmrCompatibility: isH1
        ? tieredConfidence.substructureConfidence
        : "Not Available",
      c13NmrCompatibility: isC13
        ? tieredConfidence.substructureConfidence
        : "Not Available",
      msCompatibility: isMS
        ? tieredConfidence.formulaConfidence
        : "Not Available",
      msmsCompatibility: isMSMS ? 78 : "Not Available",
      structuralValidityScore: 95,
      contradictionCount: contradicting.length,
      validationSummaryZh: isFormulaOnly
        ? `已通過分子式 (${parsed.molecularFormula}) 與 DBE (${parsed.dbe}) 拓樸檢核；目前僅有分子式限制，尚未有光譜證據區分異構物。`
        : `已通過化學圖價數與連通性驗證 (Canonical Graph Signature)，並完成 [${activeSources.join(
            " + "
          )}] 結構限制檢核。`,
    };

    const structuralMotifs: string[] = [];
    if (graph.aromaticAtomCount >= 5) {
      structuralMotifs.push(
        `芳香/雜芳環骨架 (${graph.ringSubstitutionTopology})`
      );
    }
    for (const fg of parsed.detectedFunctionalGroups) {
      if (!structuralMotifs.includes(fg)) {
        structuralMotifs.push(fg);
      }
    }

    return {
      rank: 1,
      id: raw.id,
      name: raw.name,
      iupacName: raw.iupacName,
      smiles: raw.smiles,
      molecularFormula: parsed.molecularFormula,
      molecularWeight: parsed.molecularWeight,
      exactMass: parsed.exactMass,
      dbe: parsed.dbe,
      unsaturationIndex: parsed.dbe,
      scaffoldType: raw.scaffoldType,
      isFormulaCompatibleOnly: isFormulaOnly,
      functionalGroups: parsed.detectedFunctionalGroups,
      structuralMotifs,
      sourceConstraints: knownConstraintsSummary,
      confidence: finalScore,
      tieredConfidence,
      overallScore: finalScore,
      evidenceLevel,
      modelType: "EMPIRICAL",
      certaintyLabel: "Estimated",
      candidateOrigin: raw.origin,
      generationMethodLabel: raw.generationMethodLabel,
      sourceProvenance: raw.sourceProvenance,
      validationReport,
      modalityScores: {
        formulaAndMass:
          isMS || isFormulaOnly
            ? tieredConfidence.formulaConfidence
            : "Not Available",
        functionalGroup: isFormulaOnly
          ? "Not Available"
          : tieredConfidence.functionalGroupConfidence,
        ir: isIR
          ? tieredConfidence.functionalGroupConfidence
          : "Not Available",
        h1Nmr: isH1 ? tieredConfidence.substructureConfidence : "Not Available",
        c13Nmr: isC13
          ? tieredConfidence.substructureConfidence
          : "Not Available",
        ms: isMS ? tieredConfidence.formulaConfidence : "Not Available",
        msms: isMSMS ? 78 : "Not Available",
        tofSims: isToFSIMS ? 76 : "Not Available",
        structuralValidity: 95,
      },
      supportingEvidence: supporting,
      contradictingEvidence: contradicting,
      missingEvidence: missing,
      supportingReasons: supporting,
      contradictingReasons: contradicting,
      unknownEvidence,
      evidenceProvenanceByModality,
      recommendedExperiments: isFormulaOnly
        ? [
            "目前僅有分子式限制，請補充 ¹H NMR、¹³C NMR 或 IR 光譜以區分同分異構物",
          ]
        : [],
      pubchemCid: raw.pubchemCid,
      pubchemUrl: raw.pubchemUrl,
      scoreBreakdown: {
        totalScore: finalScore,
        formulaScore: tieredConfidence.formulaConfidence,
        functionalGroupScore: tieredConfidence.functionalGroupConfidence,
        irMatchScore: isIR ? tieredConfidence.functionalGroupConfidence : null,
        nmr1HMatchScore: isH1 ? tieredConfidence.substructureConfidence : null,
        nmr13CMatchScore: isC13
          ? tieredConfidence.substructureConfidence
          : null,
        msMatchScore: isMS ? tieredConfidence.formulaConfidence : null,
        contradictionPenalty: contradicting.length * 10,
      },
    };
  }
}
