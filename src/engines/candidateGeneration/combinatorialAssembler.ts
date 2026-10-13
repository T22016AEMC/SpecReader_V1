import {
  CandidateOriginCategory,
  StructuralConstraints,
  StructuralScaffoldCandidate,
} from "../../types/spectrum";
import {
  ChemistryEngine,
  KNOWN_STRUCTURAL_LIBRARY,
  KnownCompoundEntry,
} from "../chemistryEngine";
import {
  AtomBudget,
  DIVALENT_LINKERS,
  MONOVALENT_FRAGMENTS,
  MONOVALENT_R_GROUPS,
  MonovalentFragment,
} from "./fragmentLibrary";
import { ChemicalGraphValidator } from "./graphValidator";

export interface AssembledRawCandidate {
  id: string;
  name: string;
  iupacName: string;
  smiles: string;
  canonicalSignature: string;
  molecularFormula: string;
  origin: CandidateOriginCategory;
  generationMethodLabel: string;
  sourceProvenance: string;
  assemblyNotes: string;
  scaffoldType?: string;
  pubchemCid?: number;
  pubchemUrl?: string;
}

/**
 * FormulaConstraintEngine & ScaffoldInferenceEngine (V5)
 * Evaluates molecular formula, DBE = C - H/2 + N/2 + 1, Nitrogen Rule parity,
 * and infers possible structural scaffolds.
 */
export class FormulaConstraintEngine {
  static evaluateFormula(
    formulaStr: string,
    constraints?: StructuralConstraints
  ): {
    formula: string;
    counts: Record<string, number>;
    dbe: number;
    nominalMass: number;
    nitrogenRuleValid: boolean;
    possibleScaffolds: StructuralScaffoldCandidate[];
    summaryZh: string;
  } {
    const counts = ChemistryEngine.parseFormulaCounts(formulaStr);
    const C = counts.C || 0;
    const H = counts.H || 0;
    const N = counts.N || 0;
    const O = counts.O || 0;
    const S = counts.S || 0;
    const Br = counts.Br || 0;
    const Cl = counts.Cl || 0;
    const F = counts.F || 0;
    const I = counts.I || 0;
    const dbe = ChemistryEngine.calculateDBE(counts);
    const nominalMass =
      C * 12 +
      H * 1 +
      N * 14 +
      O * 16 +
      S * 32 +
      Br * 79 +
      Cl * 35 +
      F * 19 +
      I * 127;
    const nitrogenRuleValid = nominalMass % 2 === N % 2;

    const pEnvs = constraints?.protonEnvironments || [];
    const cEnvs = constraints?.carbonEnvironments || [];
    const hasExplicitHeteroAromConstraint =
      constraints?.heteroaromatic?.status === "PRESENT" ||
      constraints?.heteroaromaticConstraints?.status === "PRESENT";
    const hasPyridineCouplingHint = pEnvs.some(
      (e) =>
        e.shiftPpm >= 8.2 &&
        e.shiftPpm <= 9.2 &&
        (e.jCouplingHz || []).some((j) => j >= 4.2 && j <= 5.7)
    );
    const hasHeteroAromSignal =
      N >= 1 && (hasExplicitHeteroAromConstraint || hasPyridineCouplingHint);
    const hasAromSignal =
      constraints?.aromaticity?.status === "PRESENT" ||
      pEnvs.some((e) => e.shiftPpm >= 6.4 && e.shiftPpm <= 9.25) ||
      cEnvs.some((c) => c.shiftPpm >= 105 && c.shiftPpm <= 165);
    const hasNitrileSignal = (
      constraints?.requiredFunctionalGroups || []
    ).some((fg) => fg.groupFamily === "Nitrile");

    const possibleScaffolds: StructuralScaffoldCandidate[] = [];

    if (dbe >= 4 && C >= 6) {
      possibleScaffolds.push({
        scaffoldId: "scaffold-benzenoid",
        nameZh:
          N >= 1
            ? "取代苯環芳香骨架（含胺基/醯胺/硝基/腈基等取代基之苯環）"
            : "苯環芳香骨架 (Benzenoid Ring)",
        nameEn: "Benzenoid Aromatic Ring",
        category: "AROMATIC",
        smilesTemplate: "c1ccccc1",
        dbeRequired: 4,
        plausibilityScore: hasAromSignal ? 90 : 84,
        rationaleZh: `C ≥ 6 且 DBE = ${dbe} ≥ 4，高度相容於六元苯環核心（1 環 + 3 雙鍵）${
          N >= 1 ? "搭配含氮取代基（如 -NH₂、-NHCOR、-NO₂、-C≡N）" : ""
        }`,
        matchedEvidenceIds: hasAromSignal ? ["Aromatic signals"] : [],
      });
    }

    if (dbe >= 4 && C >= 5 && N >= 1) {
      const isExactPyridine = C === 5 && H === 5 && N === 1 && O === 0;
      let score = isExactPyridine ? 90 : 74;
      if (hasHeteroAromSignal) score = Math.min(94, score + 12);
      else if (hasAromSignal && isExactPyridine) score = Math.min(92, score + 4);
      possibleScaffolds.push({
        scaffoldId: isExactPyridine
          ? "scaffold-pyridine"
          : "scaffold-substituted-pyridine",
        nameZh: isExactPyridine
          ? "吡啶六元含氮雜芳環 (Pyridine C₅H₅N)"
          : "取代吡啶六元含氮雜芳環 (Substituted Pyridine, 競爭性骨架假設)",
        nameEn: isExactPyridine ? "Pyridine" : "Substituted Pyridine",
        category: "HETEROAROMATIC",
        smilesTemplate: "c1ccncc1",
        dbeRequired: 4,
        plausibilityScore: score,
        rationaleZh: isExactPyridine
          ? `分子式 C₅H₅N 具 DBE = 4（1 個六元環 + 3 個共軛雙鍵），相容於吡啶 (Pyridine, C₂v 對稱) 或開鏈二烯腈/環戊二烯亞胺異構物`
          : `分子式 ${formulaStr} 具 DBE = ${dbe} 且含氮原子，六元含氮雜芳環（吡啶核心 DBE=4）為競爭性骨架之一（需與含氮取代苯環比較 ³J 耦合與 IR 特徵）`,
        matchedEvidenceIds: hasHeteroAromSignal
          ? ["1H/13C Heteroaromatic α-N"]
          : [],
      });
    }

    if (dbe >= 4 && C >= 4 && N >= 2) {
      possibleScaffolds.push({
        scaffoldId: "scaffold-diazine",
        nameZh: "雙氮六元雜芳環（嘧啶 / 吡嗪 / 噠嗪）",
        nameEn: "Diazine (Pyrimidine / Pyrazine)",
        category: "HETEROAROMATIC",
        smilesTemplate: "c1cncnc1",
        dbeRequired: 4,
        plausibilityScore: hasHeteroAromSignal ? 86 : 74,
        rationaleZh: `DBE = ${dbe} 且 N ≥ 2，相容於六元雙氮雜芳環骨架`,
        matchedEvidenceIds: [],
      });
    }

    if (dbe >= 6 && C >= 8 && N >= 1) {
      possibleScaffolds.push({
        scaffoldId: "scaffold-bicyclic-heteroaromatic",
        nameZh:
          dbe >= 7 && C >= 9 ? "喹啉/異喹啉稠合雜芳環" : "吲哚稠合雜芳環",
        nameEn: dbe >= 7 && C >= 9 ? "Quinoline / Isoquinoline" : "Indole",
        category: "BICYCLIC",
        smilesTemplate:
          dbe >= 7 && C >= 9 ? "c1ccc2ncccc2c1" : "c1ccc2[nH]ccc2c1",
        dbeRequired: dbe >= 7 && C >= 9 ? 7 : 6,
        plausibilityScore: hasAromSignal ? 85 : 75,
        rationaleZh: `高不飽和度 (DBE = ${dbe}) 且含氮，相容於苯并雜芳環雙環共軛系統`,
        matchedEvidenceIds: [],
      });
    }

    if (dbe >= 3 && C >= 4 && (N >= 1 || O >= 1 || S >= 1)) {
      possibleScaffolds.push({
        scaffoldId: "scaffold-5mem-heteroaromatic",
        nameZh: "五元雜芳環骨架（吡咯 / 呋喃 / 噻吩衍生物）",
        nameEn: "5-Membered Heteroaromatic (Pyrrole / Furan / Thiophene)",
        category: "HETEROAROMATIC",
        smilesTemplate:
          N >= 1 ? "c1cc[nH]c1" : O >= 1 ? "c1ccoc1" : "c1ccsc1",
        dbeRequired: 3,
        plausibilityScore: 72,
        rationaleZh: `DBE ≥ 3 且含雜原子，可構成五元雜芳環（1 環 + 2 雙鍵 = 3 DBE）加側鏈不飽和單元`,
        matchedEvidenceIds: [],
      });
    }

    if (dbe >= 2 && C >= 3 && N >= 1) {
      let score = hasNitrileSignal ? 84 : 62;
      if (hasHeteroAromSignal && !hasNitrileSignal) score = 38;
      possibleScaffolds.push({
        scaffoldId: "scaffold-unsaturated-nitrile",
        nameZh: "開鏈不飽和腈 / 烯炔腈異構物 (Open-chain Unsaturated Nitrile)",
        nameEn: "Unsaturated Nitrile (Conjugated Dienenitrile / Alkynylnitrile)",
        category: "ACYCLIC_UNSATURATED",
        smilesTemplate: "C=CC=CC#N",
        dbeRequired: dbe,
        plausibilityScore: score,
        rationaleZh: `氰基 (-C≡N) 貢獻 2 DBE，其餘 ${dbe - 2} DBE 可由共軛雙鍵或炔鍵提供（需 IR ~2220 cm⁻¹ 驗證）`,
        matchedEvidenceIds: hasNitrileSignal ? ["IR C≡N"] : [],
      });
    }

    if (dbe >= 2 && C >= 4 && N >= 1) {
      possibleScaffolds.push({
        scaffoldId: "scaffold-cyclic-imine",
        nameZh: "環狀亞胺 / 不飽和氮雜脂環異構物 (Cyclic Imine)",
        nameEn: "Cyclic Imine / Unsaturated Alicyclic",
        category: "ALICYCLIC",
        smilesTemplate: "N=C1C=CC=C1",
        dbeRequired: dbe,
        plausibilityScore: hasHeteroAromSignal ? 35 : 55,
        rationaleZh: `由環系與 C=N 亞胺雙鍵及環內烯鍵共同滿足 DBE = ${dbe}`,
        matchedEvidenceIds: [],
      });
    }

    possibleScaffolds.sort((a, b) => b.plausibilityScore - a.plausibilityScore);

    return {
      formula: formulaStr,
      counts,
      dbe,
      nominalMass,
      nitrogenRuleValid,
      possibleScaffolds,
      summaryZh: `分子式 ${formulaStr}：DBE = ${dbe}，名目質量 = ${nominalMass} Da（${
        nitrogenRuleValid ? "符合氮規則" : "氮規則異常"
      }），推論出 ${possibleScaffolds.length} 類可能結構骨架（首選：${
        possibleScaffolds[0]?.nameZh || "一般有機骨架"
      }）。`,
    };
  }
}

function getAtomCount(
  budget: Partial<AtomBudget>,
  el: keyof AtomBudget
): number {
  return budget[el] || 0;
}

function budgetsEqual(
  a: Partial<AtomBudget>,
  b: Partial<AtomBudget>
): boolean {
  const keys: (keyof AtomBudget)[] = [
    "C",
    "H",
    "O",
    "N",
    "Br",
    "Cl",
    "F",
    "I",
    "S",
    "Si",
  ];
  for (const k of keys) {
    if (getAtomCount(a, k) !== getAtomCount(b, k)) return false;
  }
  return true;
}

function addBudgets(
  a: Partial<AtomBudget>,
  b: Partial<AtomBudget>
): Partial<AtomBudget> {
  return {
    C: getAtomCount(a, "C") + getAtomCount(b, "C"),
    H: getAtomCount(a, "H") + getAtomCount(b, "H"),
    O: getAtomCount(a, "O") + getAtomCount(b, "O"),
    N: getAtomCount(a, "N") + getAtomCount(b, "N"),
    Br: getAtomCount(a, "Br") + getAtomCount(b, "Br"),
    Cl: getAtomCount(a, "Cl") + getAtomCount(b, "Cl"),
    F: getAtomCount(a, "F") + getAtomCount(b, "F"),
    I: getAtomCount(a, "I") + getAtomCount(b, "I"),
    S: getAtomCount(a, "S") + getAtomCount(b, "S"),
    Si: getAtomCount(a, "Si") + getAtomCount(b, "Si"),
  };
}

function subtractBudgets(
  total: Partial<AtomBudget>,
  sub: Partial<AtomBudget>
): Partial<AtomBudget> | null {
  const keys: (keyof AtomBudget)[] = [
    "C",
    "H",
    "O",
    "N",
    "Br",
    "Cl",
    "F",
    "I",
    "S",
    "Si",
  ];
  const res: Partial<AtomBudget> = {};
  for (const k of keys) {
    const diff = getAtomCount(total, k) - getAtomCount(sub, k);
    if (diff < 0) return null;
    if (diff > 0) res[k] = diff;
  }
  return res;
}

function formatHillFormulaFromBudget(budget: Partial<AtomBudget>): string {
  const counts: Record<string, number> = {};
  for (const [k, v] of Object.entries(budget)) {
    if (typeof v === "number" && v > 0) {
      counts[k] = v;
    }
  }
  return ChemistryEngine.formatFormula(counts);
}

let cachedLibraryCanonicalMap: Map<string, KnownCompoundEntry> | null = null;

function getLibraryCanonicalMap(): Map<string, KnownCompoundEntry> {
  if (cachedLibraryCanonicalMap) return cachedLibraryCanonicalMap;
  cachedLibraryCanonicalMap = new Map<string, KnownCompoundEntry>();
  for (const entry of KNOWN_STRUCTURAL_LIBRARY) {
    for (const alias of entry.smilesAliases) {
      const val = ChemicalGraphValidator.validateCandidateSmiles(alias);
      if (val.valid && val.canonicalSignature) {
        cachedLibraryCanonicalMap.set(val.canonicalSignature, entry);
      }
    }
  }
  return cachedLibraryCanonicalMap;
}

export class CombinatorialCandidateAssembler {
  static inferFormulaSpaceFromConstraints(
    constraints: StructuralConstraints
  ): string[] {
    if (
      constraints.userSuppliedFormulaValidation &&
      (!constraints.userSuppliedFormulaValidation.isValid ||
        !constraints.userSuppliedFormulaValidation.isSupported)
    ) {
      return [];
    }

    if (
      constraints.userSuppliedFormula?.isValid &&
      constraints.userSuppliedFormula.normalizedFormula
    ) {
      return [constraints.userSuppliedFormula.normalizedFormula];
    }

    if (constraints.molecularFormula?.lockedFormula) {
      return [constraints.molecularFormula.lockedFormula];
    }

    if (
      constraints.molecularFormula?.candidates &&
      constraints.molecularFormula.candidates.length > 0
    ) {
      return constraints.molecularFormula.candidates.map((c) => c.formula);
    }

    const reqGroups = constraints.requiredFunctionalGroups || [];
    const reqMotifs = constraints.requiredSubstructures || [];
    const pEnvs = constraints.protonEnvironments || [];
    const cEnvs = constraints.carbonEnvironments || [];
    const fragConstraints = constraints.fragmentationConstraints || [];

    const hasAromatic =
      constraints.aromaticity?.status === "PRESENT" ||
      constraints.heteroaromatic?.status === "PRESENT" ||
      constraints.heteroaromaticConstraints?.status === "PRESENT" ||
      reqGroups.some(
        (g) => g.groupFamily === "Aromatic" || g.groupFamily === "Heteroaromatic"
      ) ||
      reqMotifs.some(
        (m) =>
          m.motifLabel.toLowerCase().includes("phenyl") ||
          m.motifLabel.toLowerCase().includes("pyridine") ||
          m.motifLabel.includes("苯") ||
          m.motifLabel.includes("吡啶") ||
          m.motifId.includes("aromatic") ||
          m.motifId.includes("pyridine") ||
          m.motifId.includes("para") ||
          m.motifId.includes("oxy-ar")
      ) ||
      pEnvs.some((p) => p.shiftPpm >= 6.4 && p.shiftPpm <= 9.25) ||
      cEnvs.some((c) => c.shiftPpm >= 110 && c.shiftPpm < 165);

    const nExplicitlyExcluded = (constraints.heteroAtoms || []).some(
      (h) => h.element === "N" && h.status === "EXCLUDED"
    );

    const hasPyridineOrHeteroaromatic =
      !nExplicitlyExcluded &&
      (constraints.heteroaromatic?.status === "PRESENT" ||
        constraints.heteroaromaticConstraints?.status === "PRESENT" ||
        reqGroups.some(
          (g) => g.groupFamily === "Heteroaromatic" && g.status === "REQUIRED"
        ) ||
        reqMotifs.some(
          (m) =>
            (m.motifId.includes("pyridine") || m.motifLabel.includes("吡啶")) &&
            m.status === "REQUIRED"
        ));

    const aromaticExplicitlyAbsent =
      constraints.aromaticity?.status === "ABSENT" && !hasAromatic;

    const carbonylSubtypes = new Set<string>(
      constraints.carbonyl?.status === "PRESENT" ||
        constraints.carbonyl?.status === "POSSIBLE"
        ? constraints.carbonyl.allowedSubtypes
        : []
    );
    for (const fg of reqGroups) {
      if (
        ["Aldehyde", "Ketone", "Ester", "Carboxylic acid", "Amide"].includes(
          fg.groupFamily
        )
      ) {
        carbonylSubtypes.add(fg.groupFamily);
      }
    }
    if (pEnvs.some((p) => p.shiftPpm >= 9.3 && p.shiftPpm <= 10.6)) {
      carbonylSubtypes.add("Aldehyde");
    }
    if (pEnvs.some((p) => p.shiftPpm > 10.6 && p.shiftPpm <= 13.5)) {
      carbonylSubtypes.add("Carboxylic acid");
    }
    if (pEnvs.some((p) => p.shiftPpm >= 2.0 && p.shiftPpm <= 2.9)) {
      if (
        !carbonylSubtypes.has("Aldehyde") &&
        !carbonylSubtypes.has("Carboxylic acid")
      ) {
        carbonylSubtypes.add("Ketone");
      }
    }
    if (cEnvs.some((c) => c.shiftPpm >= 188 && c.shiftPpm <= 218)) {
      if (!carbonylSubtypes.has("Aldehyde") && !carbonylSubtypes.has("Ketone")) {
        carbonylSubtypes.add("Aldehyde");
        carbonylSubtypes.add("Ketone");
      }
    }
    if (cEnvs.some((c) => c.shiftPpm >= 165.5 && c.shiftPpm < 188)) {
      if (
        !carbonylSubtypes.has("Ester") &&
        !carbonylSubtypes.has("Carboxylic acid") &&
        !carbonylSubtypes.has("Amide")
      ) {
        carbonylSubtypes.add("Ester");
        carbonylSubtypes.add("Carboxylic acid");
      }
    }

    const carbonylExplicitlyAbsent =
      constraints.carbonyl?.status === "ABSENT" ||
      (cEnvs.length >= 3 &&
        !cEnvs.some((c) => c.shiftPpm >= 165.5 && c.shiftPpm <= 220));

    const hasCarbonyl =
      !carbonylExplicitlyAbsent &&
      (constraints.carbonyl?.status === "PRESENT" ||
        reqGroups.some((g) =>
          [
            "Carbonyl",
            "Aldehyde",
            "Ketone",
            "Ester",
            "Carboxylic acid",
            "Amide",
          ].includes(g.groupFamily)
        ) ||
        cEnvs.some((c) => c.shiftPpm >= 165.5 && c.shiftPpm <= 220) ||
        pEnvs.some(
          (p) =>
            (p.shiftPpm >= 9.3 && p.shiftPpm <= 13.5) ||
            (!hasPyridineOrHeteroaromatic &&
              p.shiftPpm >= 2.0 &&
              p.shiftPpm <= 2.9)
        ));

    const hasEtherOrAlkoxy =
      reqGroups.some((g) => ["Ether", "Ester"].includes(g.groupFamily)) ||
      reqMotifs.some(
        (m) =>
          m.motifId.includes("och3") ||
          m.motifId.includes("oc2h5") ||
          m.motifId.includes("alkoxy")
      ) ||
      pEnvs.some((p) => p.shiftPpm >= 3.3 && p.shiftPpm <= 4.6) ||
      cEnvs.some((c) => c.shiftPpm >= 50 && c.shiftPpm <= 90);

    const hasAlcoholOrPhenol =
      reqGroups.some((g) =>
        ["Alcohol", "Phenol", "Alcohol/Phenol"].includes(g.groupFamily)
      ) ||
      reqMotifs.some(
        (m) => m.motifId.includes("oh") || m.motifId.includes("phenol")
      ) ||
      fragConstraints.some((fc) => fc.ionMz === 94 || fc.neutralLossDa === 18);

    const hasAmine =
      reqGroups.some((g) => ["Amine", "Amide"].includes(g.groupFamily)) ||
      reqMotifs.some(
        (m) => m.motifId.includes("nh2") || m.motifId.includes("amine")
      ) ||
      (constraints.heteroAtoms || []).some(
        (h) =>
          h.element === "N" &&
          (h.status === "REQUIRED" || h.status === "PROBABLE")
      );

    const hasNitrile =
      reqGroups.some((g) => g.groupFamily === "Nitrile") ||
      reqMotifs.some(
        (m) => m.motifId.includes("nitrile") || m.motifId.includes("cn")
      );

    const hasSiloxane =
      reqGroups.some((g) => g.groupFamily === "Siloxane") ||
      reqMotifs.some(
        (m) => m.motifId.includes("siloxane") || m.motifId.includes("pdms")
      ) ||
      (constraints.heteroAtoms || []).some(
        (h) =>
          h.element === "Si" &&
          (h.status === "REQUIRED" || h.status === "PROBABLE")
      ) ||
      Boolean(constraints.isotopeConstraints?.hasSiliconOrSulfur);

    const hasBr =
      Boolean(constraints.isotopeConstraints?.hasBromine) ||
      (constraints.heteroAtoms || []).some((h) => h.element === "Br") ||
      reqGroups.some((g) => g.groupFamily.includes("Br"));
    const hasCl =
      Boolean(constraints.isotopeConstraints?.hasChlorine) ||
      (constraints.heteroAtoms || []).some((h) => h.element === "Cl") ||
      reqGroups.some((g) => g.groupFamily.includes("Cl"));

    const hasAliphaticConstraint =
      reqGroups.some(
        (g) =>
          g.groupFamily.includes("Alkane") ||
          g.groupFamily.includes("Alkyl") ||
          g.groupFamily.includes("Aliphatic") ||
          g.groupFamily.includes("Alkene") ||
          g.groupFamily.includes("Alkyne")
      ) ||
      pEnvs.length >= 1 ||
      cEnvs.length >= 1;

    const diagnosticFeatureCount = [
      hasAromatic,
      hasPyridineOrHeteroaromatic,
      hasCarbonyl,
      hasEtherOrAlkoxy,
      hasAlcoholOrPhenol,
      hasAmine,
      hasNitrile,
      hasSiloxane,
      hasBr,
      hasCl,
      hasAliphaticConstraint,
      pEnvs.length >= 1,
      cEnvs.length >= 1,
      fragConstraints.length >= 1,
    ].filter(Boolean).length;

    if (diagnosticFeatureCount < 1) {
      return [];
    }

    const derivedBudgets: Partial<AtomBudget>[] = [];

    if (hasPyridineOrHeteroaromatic) {
      const hasAliphSignal =
        pEnvs.some((p) => p.shiftPpm >= 0.5 && p.shiftPpm < 4.5) ||
        cEnvs.some((c) => c.shiftPpm >= 5 && c.shiftPpm < 60);
      if (!hasCarbonyl && !hasAliphSignal) {
        derivedBudgets.push({ C: 5, H: 5, N: 1 });
        derivedBudgets.push({ C: 6, H: 7, N: 1 });
        derivedBudgets.push({ C: 4, H: 4, N: 2 });
      } else if (!hasCarbonyl && hasAliphSignal) {
        derivedBudgets.push({ C: 6, H: 7, N: 1 });
        derivedBudgets.push({ C: 7, H: 9, N: 1 });
        derivedBudgets.push({ C: 5, H: 5, N: 1 });
      } else if (hasCarbonyl) {
        derivedBudgets.push({ C: 6, H: 5, N: 1, O: 1 });
        derivedBudgets.push({ C: 7, H: 7, N: 1, O: 1 });
        derivedBudgets.push({ C: 6, H: 7, N: 1 });
      }
    }

    if (hasSiloxane) {
      const endCaps: Partial<AtomBudget> = { C: 6, H: 18, Si: 2, O: 1 };
      const repeatUnit: Partial<AtomBudget> = { C: 2, H: 6, Si: 1, O: 1 };
      derivedBudgets.push(addBudgets(endCaps, repeatUnit));
    }

    const precursorNominal =
      constraints.molecularFormula?.nominalMass ||
      constraints.exactMass?.nominalMw ||
      constraints.estimatedMolecularWeight ||
      (constraints.exactMass?.observedIonMz
        ? Math.round(constraints.exactMass.observedIonMz)
        : null);
    if (precursorNominal && precursorNominal >= 58 && precursorNominal <= 250) {
      if (hasAromatic || !aromaticExplicitlyAbsent) {
        const coreMono: Partial<AtomBudget> = { C: 6, H: 5 };
        const coreDi: Partial<AtomBudget> = { C: 6, H: 4 };
        for (const f1 of MONOVALENT_FRAGMENTS) {
          const b1 = addBudgets(coreMono, f1.atoms);
          const mw1 =
            getAtomCount(b1, "C") * 12 +
            getAtomCount(b1, "H") * 1 +
            getAtomCount(b1, "O") * 16 +
            getAtomCount(b1, "N") * 14 +
            getAtomCount(b1, "Br") * 79 +
            getAtomCount(b1, "Cl") * 35;
          if (Math.abs(mw1 - precursorNominal) <= 1) {
            derivedBudgets.push(b1);
          }
          for (const f2 of MONOVALENT_FRAGMENTS) {
            const b2 = addBudgets(addBudgets(coreDi, f1.atoms), f2.atoms);
            const mw2 =
              getAtomCount(b2, "C") * 12 +
              getAtomCount(b2, "H") * 1 +
              getAtomCount(b2, "O") * 16 +
              getAtomCount(b2, "N") * 14 +
              getAtomCount(b2, "Br") * 79 +
              getAtomCount(b2, "Cl") * 35;
            if (Math.abs(mw2 - precursorNominal) <= 1) {
              derivedBudgets.push(b2);
            }
          }
        }
      }
    }

    const findFrag = (id: string) =>
      MONOVALENT_FRAGMENTS.find((f) => f.id === id)!;
    const rEt = MONOVALENT_R_GROUPS.find((r) => r.id === "r-et")!;
    const rMe = MONOVALENT_R_GROUPS.find((r) => r.id === "r-me")!;
    const rPr =
      MONOVALENT_R_GROUPS.find((r) => r.id === "r-npr" || r.id === "r-pr") ||
      MONOVALENT_R_GROUPS[2];

    if (hasAromatic) {
      const coreMono: Partial<AtomBudget> = { C: 6, H: 5 };
      const coreDi: Partial<AtomBudget> = { C: 6, H: 4 };

      // Check for Aspirin (Carboxylic acid + Ester)
      if (
        carbonylSubtypes.has("Carboxylic acid") &&
        (carbonylSubtypes.has("Ester") || hasEtherOrAlkoxy)
      ) {
        derivedBudgets.push(
          addBudgets(
            addBudgets(coreDi, findFrag("frag-cooh").atoms),
            findFrag("frag-ococh3").atoms
          )
        );
      }

      if (hasCarbonyl && hasAmine) {
        derivedBudgets.push(
          addBudgets(
            addBudgets(coreDi, findFrag("frag-nhcoch3").atoms),
            findFrag("frag-oh").atoms
          )
        );
        derivedBudgets.push(
          addBudgets(
            addBudgets(coreDi, findFrag("frag-cooc2h5").atoms),
            findFrag("frag-nh2").atoms
          )
        );
        derivedBudgets.push(
          addBudgets(
            addBudgets(coreDi, findFrag("frag-cooch3").atoms),
            findFrag("frag-nh2").atoms
          )
        );
        derivedBudgets.push(
          addBudgets(coreMono, findFrag("frag-conh2").atoms)
        );
      }

      if (hasCarbonyl && (hasBr || hasCl)) {
        const halFrag = hasBr ? findFrag("frag-br") : findFrag("frag-cl");
        derivedBudgets.push(
          addBudgets(
            addBudgets(coreDi, findFrag("frag-acetyl").atoms),
            halFrag.atoms
          )
        );
      }

      if (hasCarbonyl && hasEtherOrAlkoxy) {
        derivedBudgets.push(
          addBudgets(
            addBudgets(coreDi, findFrag("frag-och3").atoms),
            findFrag("frag-cho").atoms
          )
        );
        const hasEthylSignal =
          (pEnvs.some((p) => (p.multiplicity === "q" || p.multiplicity === "quartet") && p.shiftPpm >= 2.5) &&
            pEnvs.some((p) => (p.multiplicity === "t" || p.multiplicity === "triplet") && p.shiftPpm <= 1.8)) ||
          cEnvs.length >= 7;
        if (hasEthylSignal) {
          derivedBudgets.push(
            addBudgets(coreMono, findFrag("frag-cooc2h5").atoms)
          );
        }
      }

      if (hasCarbonyl && !hasAmine && !hasBr && !hasCl) {
        derivedBudgets.push(
          addBudgets(coreMono, findFrag("frag-cooch3").atoms)
        );
        derivedBudgets.push(
          addBudgets(coreMono, findFrag("frag-acetyl").atoms)
        );
        derivedBudgets.push(addBudgets(coreMono, findFrag("frag-cho").atoms));
      }

      if (!hasCarbonyl && hasEtherOrAlkoxy) {
        derivedBudgets.push(addBudgets(coreMono, findFrag("frag-och3").atoms));
        derivedBudgets.push(addBudgets(coreMono, findFrag("frag-oc2h5").atoms));
        if (hasAlcoholOrPhenol) {
          derivedBudgets.push(
            addBudgets(
              addBudgets(coreDi, findFrag("frag-och3").atoms),
              findFrag("frag-oh").atoms
            )
          );
        }
      }

      if (!hasCarbonyl && hasAlcoholOrPhenol) {
        derivedBudgets.push(
          addBudgets(
            addBudgets(coreDi, findFrag("frag-me").atoms),
            findFrag("frag-oh").atoms
          )
        );
        derivedBudgets.push(addBudgets(coreMono, findFrag("frag-oh").atoms));
      }

      if (!hasCarbonyl && hasAmine) {
        derivedBudgets.push(addBudgets(coreMono, findFrag("frag-nh2").atoms));
        derivedBudgets.push(
          addBudgets(
            addBudgets(coreDi, findFrag("frag-me").atoms),
            findFrag("frag-nh2").atoms
          )
        );
      }

      if (!hasCarbonyl && hasNitrile) {
        derivedBudgets.push(addBudgets(coreMono, findFrag("frag-cn").atoms));
      }

      if (derivedBudgets.length === 0) {
        derivedBudgets.push(addBudgets(coreMono, findFrag("frag-och3").atoms));
        derivedBudgets.push(addBudgets(coreMono, findFrag("frag-acetyl").atoms));
      }
    }

    if (!hasAromatic) {
      if (hasCarbonyl) {
        if (
          carbonylSubtypes.has("Ester") ||
          carbonylSubtypes.has("Carboxylic acid") ||
          hasEtherOrAlkoxy
        ) {
          derivedBudgets.push(
            addBudgets(rEt.atoms, findFrag("frag-ococh3").atoms)
          );
          if ((constraints.molecularFormula?.minCarbonCount || 0) >= 5) {
            derivedBudgets.push(
              addBudgets(rPr.atoms, findFrag("frag-ococh3").atoms)
            );
          }
        }
        if (
          carbonylSubtypes.has("Ketone") ||
          carbonylSubtypes.has("Aldehyde") ||
          carbonylSubtypes.size === 0
        ) {
          derivedBudgets.push(
            addBudgets(rEt.atoms, findFrag("frag-acetyl").atoms)
          );
          derivedBudgets.push(
            addBudgets(rMe.atoms, findFrag("frag-acetyl").atoms)
          );
          if ((constraints.molecularFormula?.minCarbonCount || 0) >= 5) {
            derivedBudgets.push(
              addBudgets(rPr.atoms, findFrag("frag-acetyl").atoms)
            );
          }
        }
        if (!aromaticExplicitlyAbsent) {
          const coreMono: Partial<AtomBudget> = { C: 6, H: 5 };
          derivedBudgets.push(
            addBudgets(coreMono, findFrag("frag-acetyl").atoms)
          );
          if (hasEtherOrAlkoxy || carbonylSubtypes.has("Ester")) {
            derivedBudgets.push(
              addBudgets(coreMono, findFrag("frag-cooch3").atoms)
            );
          }
        }
      } else if (hasAlcoholOrPhenol || hasEtherOrAlkoxy) {
        derivedBudgets.push(addBudgets(rPr.atoms, findFrag("frag-oh").atoms));
        derivedBudgets.push(addBudgets(rEt.atoms, findFrag("frag-och3").atoms));
        if (!aromaticExplicitlyAbsent) {
          const coreMono: Partial<AtomBudget> = { C: 6, H: 5 };
          derivedBudgets.push(addBudgets(coreMono, findFrag("frag-oh").atoms));
          derivedBudgets.push(
            addBudgets(coreMono, findFrag("frag-och3").atoms)
          );
        }
      } else if (hasAmine) {
        derivedBudgets.push(addBudgets(rPr.atoms, findFrag("frag-nh2").atoms));
        if (!aromaticExplicitlyAbsent) {
          const coreMono: Partial<AtomBudget> = { C: 6, H: 5 };
          derivedBudgets.push(addBudgets(coreMono, findFrag("frag-nh2").atoms));
        }
      } else if (hasNitrile) {
        derivedBudgets.push(addBudgets(rEt.atoms, findFrag("frag-cn").atoms));
        if (!aromaticExplicitlyAbsent) {
          const coreMono: Partial<AtomBudget> = { C: 6, H: 5 };
          derivedBudgets.push(addBudgets(coreMono, findFrag("frag-cn").atoms));
        }
      } else if (cEnvs.length >= 2 || pEnvs.length >= 2) {
        derivedBudgets.push({ C: 3, H: 6, O: 1 });
        derivedBudgets.push(
          addBudgets(rEt.atoms, findFrag("frag-acetyl").atoms)
        );
        derivedBudgets.push(
          addBudgets(rEt.atoms, findFrag("frag-ococh3").atoms)
        );
      }
    }

    const uniqueFormulas: string[] = [];
    for (const b of derivedBudgets) {
      const f = formatHillFormulaFromBudget(b);
      if (f && !uniqueFormulas.includes(f)) {
        uniqueFormulas.push(f);
      }
    }

    return uniqueFormulas.slice(0, 6);
  }

  static assembleCandidatesForFormula(
    formulaStr: string,
    _dbe?: number,
    _constraints?: StructuralConstraints
  ): AssembledRawCandidate[] {
    const counts = ChemistryEngine.parseFormulaCounts(formulaStr);
    const targetBudget: Partial<AtomBudget> = {
      C: counts.C || 0,
      H: counts.H || 0,
      O: counts.O || 0,
      N: counts.N || 0,
      Br: counts.Br || 0,
      Cl: counts.Cl || 0,
      F: counts.F || 0,
      I: counts.I || 0,
      S: counts.S || 0,
      Si: counts.Si || 0,
    };
    const targetDbe = ChemistryEngine.calculateDBE(counts);
    const C = getAtomCount(targetBudget, "C");
    const Si = getAtomCount(targetBudget, "Si");

    const results: AssembledRawCandidate[] = [];
    const seenCanonicalSignatures = new Set<string>();
    const libCanonicalMap = getLibraryCanonicalMap();

    const tryRegisterCandidate = (
      smiles: string,
      generatedNameZh: string,
      generatedIupac: string,
      assemblyNotes: string,
      scaffoldType?: string
    ) => {
      const val = ChemicalGraphValidator.validateCandidateSmiles(
        smiles,
        formulaStr
      );
      if (!val.valid || !val.canonicalSignature) {
        return;
      }
      if (seenCanonicalSignatures.has(val.canonicalSignature)) {
        return;
      }
      seenCanonicalSignatures.add(val.canonicalSignature);

      const matchedLib = libCanonicalMap.get(val.canonicalSignature);

      results.push({
        id: matchedLib
          ? matchedLib.id
          : `gen-${formulaStr}-${results.length + 1}`,
        name: matchedLib ? matchedLib.name : generatedNameZh,
        iupacName: matchedLib ? matchedLib.iupacName : generatedIupac,
        smiles: matchedLib ? matchedLib.smilesAliases[0] : smiles,
        canonicalSignature: val.canonicalSignature,
        molecularFormula: formulaStr,
        origin: matchedLib
          ? "[Known Library Candidate]"
          : "[Generated Candidate]",
        generationMethodLabel: matchedLib
          ? "Combinatorial Graph Assembly + Known Library Reference"
          : "Combinatorial Chemical Graph & Fragment Assembly",
        sourceProvenance: matchedLib
          ? `化學結構圖組合生成引擎 + 內建參考庫標記 (${matchedLib.name}, PubChem CID: ${matchedLib.pubchemCid})`
          : `Candidate Generation Engine（依分子式 ${formulaStr}, DBE=${targetDbe} 進行骨架與官能基拓樸組合生成）`,
        assemblyNotes,
        scaffoldType,
        pubchemCid: matchedLib?.pubchemCid,
        pubchemUrl: matchedLib
          ? `https://pubchem.ncbi.nlm.nih.gov/compound/${matchedLib.pubchemCid}`
          : undefined,
      });
    };

    const N = getAtomCount(targetBudget, "N");
    const O = getAtomCount(targetBudget, "O");
    const S = getAtomCount(targetBudget, "S");

    // PATH 1: Aromatic Core Combinatorial Partitioning (DBE >= 4, C >= 6, Si == 0)
    // Prioritized before substituted heteroaromatic permutations so benzenoid isomers (e.g., aniline, nitrobenzene, benzonitrile, paracetamol, phenol, esters) are never crowded out by pyridine templates.
    if (targetDbe >= 4 && C >= 6 && Si === 0) {
      if (targetDbe === 4 && budgetsEqual(targetBudget, { C: 6, H: 6 })) {
        tryRegisterCandidate(
          "c1ccccc1",
          "苯 (Benzene)",
          "benzene",
          "由 C6H6 (DBE=4) 組合：未取代六元苯環 (D₆h 對稱)",
          "Benzene (苯環)"
        );
      }

      const monoCoreBudget: Partial<AtomBudget> = { C: 6, H: 5 };
      const remMono = subtractBudgets(targetBudget, monoCoreBudget);
      const remMonoDbe = targetDbe - 4;

      if (remMono && remMonoDbe >= 0) {
        for (const frag of MONOVALENT_FRAGMENTS) {
          if (frag.dbe === remMonoDbe && budgetsEqual(frag.atoms, remMono)) {
            const smiles = `${frag.prefixSmiles}c1ccccc1`;
            tryRegisterCandidate(
              smiles,
              `單取代苯環-${frag.labelZh} (${formulaStr} 拓樸組合候選)`,
              `phenyl ${frag.iupacPrefixOrSuffix}`,
              `由 ${formulaStr} (DBE=${targetDbe}) 組合：單取代苯環骨架 (C₆H₅-, DBE=4) + ${frag.labelZh}`,
              "Monosubstituted Benzene (單取代苯環)"
            );
          }
        }
      }

      const diCoreBudget: Partial<AtomBudget> = { C: 6, H: 4 };
      const remDi = subtractBudgets(targetBudget, diCoreBudget);
      const remDiDbe = targetDbe - 4;

      if (remDi && remDiDbe >= 0) {
        for (let i = 0; i < MONOVALENT_FRAGMENTS.length; i++) {
          const f1: MonovalentFragment = MONOVALENT_FRAGMENTS[i];
          if (f1.dbe > remDiDbe) continue;
          const afterF1 = subtractBudgets(remDi, f1.atoms);
          if (!afterF1) continue;

          for (let j = i; j < MONOVALENT_FRAGMENTS.length; j++) {
            const f2: MonovalentFragment = MONOVALENT_FRAGMENTS[j];
            if (f1.dbe + f2.dbe !== remDiDbe) continue;
            if (!budgetsEqual(f2.atoms, afterF1)) continue;

            const smilesPara = `${f1.prefixSmiles}c1ccc(${f2.suffixSmiles})cc1`;
            tryRegisterCandidate(
              smilesPara,
              `對位-${f1.labelZh}-${f2.labelZh}苯 (${formulaStr} 拓樸生成異構物)`,
              `1,4-disubstituted (${f1.iupacPrefixOrSuffix}, ${f2.iupacPrefixOrSuffix})benzene`,
              `由 ${formulaStr} (DBE=${targetDbe}) 組合：1,4-對位雙取代苯環 (DBE=4) + ${f1.labelZh} + ${f2.labelZh}`,
              "1,4-Disubstituted Benzene (對位雙取代苯環)"
            );

            const smilesMeta = `${f1.prefixSmiles}c1cccc(${f2.suffixSmiles})c1`;
            tryRegisterCandidate(
              smilesMeta,
              `間位-${f1.labelZh}-${f2.labelZh}苯 (${formulaStr} 拓樸生成異構物)`,
              `1,3-disubstituted (${f1.iupacPrefixOrSuffix}, ${f2.iupacPrefixOrSuffix})benzene`,
              `由 ${formulaStr} (DBE=${targetDbe}) 組合：1,3-間位雙取代苯環 (DBE=4) + ${f1.labelZh} + ${f2.labelZh}`,
              "1,3-Disubstituted Benzene (間位雙取代苯環)"
            );

            const smilesOrtho = `${f1.prefixSmiles}c1c(${f2.suffixSmiles})cccc1`;
            tryRegisterCandidate(
              smilesOrtho,
              `鄰位-${f1.labelZh}-${f2.labelZh}苯 (${formulaStr} 拓樸生成異構物)`,
              `1,2-disubstituted (${f1.iupacPrefixOrSuffix}, ${f2.iupacPrefixOrSuffix})benzene`,
              `由 ${formulaStr} (DBE=${targetDbe}) 組合：1,2-鄰位雙取代苯環 (DBE=4) + ${f1.labelZh} + ${f2.labelZh}`,
              "1,2-Disubstituted Benzene (鄰位雙取代苯環)"
            );
          }
        }
      }
    }

    // PATH 0: Heteroaromatic & Unsaturated Cyclic Scaffolds (Competing Hypotheses when N/O/S present)
    if (Si === 0) {
      if (
        targetDbe === 4 &&
        budgetsEqual(targetBudget, { C: 5, H: 5, N: 1 })
      ) {
        tryRegisterCandidate(
          "c1ccncc1",
          "吡啶 (Pyridine)",
          "pyridine",
          "由 C5H5N (DBE=4) 組合：六元含氮雜芳環核心 (Pyridine 6-membered N-heteroaromatic ring, C₂v 對稱)",
          "Pyridine (六元含氮雜芳環)"
        );
        tryRegisterCandidate(
          "N=C1C=CC=C1",
          "環戊-2,4-二烯-1-亞胺 (Cyclopenta-2,4-dien-1-imine)",
          "cyclopenta-2,4-dien-1-imine",
          "由 C5H5N (DBE=4) 組合：五元共軛環戊二烯環 + 環外亞胺雙鍵 (C=NH)",
          "Cyclic Imine (環戊二烯亞胺)"
        );
        tryRegisterCandidate(
          "C=CC=CC#N",
          "2,4-戊二烯腈 (Penta-2,4-dienenitrile)",
          "(2E)-penta-2,4-dienenitrile",
          "由 C5H5N (DBE=4) 組合：1,3-丁二烯共軛雙鍵鏈 (DBE=2) + 末端腈基 (-C≡N, DBE=2)",
          "Unsaturated Nitrile (共軛二烯腈)"
        );
        tryRegisterCandidate(
          "C=C(C=C)C#N",
          "2-亞甲基丁-3-烯腈 (2-Methylidenebut-3-enenitrile)",
          "2-methylidenebut-3-enenitrile",
          "由 C5H5N (DBE=4) 組合：支鏈共軛二烯 (DBE=2) + 腈基 (-C≡N, DBE=2)",
          "Unsaturated Nitrile (支鏈二烯腈)"
        );
        tryRegisterCandidate(
          "C#CCCC#N",
          "4-戊炔腈 (Pent-4-ynenitrile)",
          "pent-4-ynenitrile",
          "由 C5H5N (DBE=4) 組合：末端炔基 (-C≡CH, DBE=2) + 亞甲基鏈 + 腈基 (-C≡N, DBE=2)",
          "Alkynylnitrile (末端炔基腈)"
        );
        tryRegisterCandidate(
          "CCC#CC#N",
          "2-戊炔腈 (Pent-2-ynenitrile)",
          "pent-2-ynenitrile",
          "由 C5H5N (DBE=4) 組合：內部炔基 (-C≡C-, DBE=2) + 乙基 + 腈基 (-C≡N, DBE=2)",
          "Alkynylnitrile (內部炔基腈)"
        );
      }

      if (targetDbe >= 4 && C >= 5 && N >= 1) {
        const pyCoreBudget: Partial<AtomBudget> = { C: 5, H: 4, N: 1 };
        const remPy = subtractBudgets(targetBudget, pyCoreBudget);
        const remPyDbe = targetDbe - 4;
        if (remPy && remPyDbe >= 0) {
          for (const frag of MONOVALENT_FRAGMENTS) {
            if (frag.dbe === remPyDbe && budgetsEqual(frag.atoms, remPy)) {
              tryRegisterCandidate(
                `${frag.prefixSmiles}c1ccncc1`,
                `4-${frag.labelZh}吡啶 (${formulaStr} 雜芳環異構物)`,
                `4-(${frag.iupacPrefixOrSuffix})pyridine`,
                `由 ${formulaStr} (DBE=${targetDbe}) 組合：4-取代吡啶骨架 (DBE=4) + ${frag.labelZh}`,
                "4-Substituted Pyridine (4-取代吡啶)"
              );
              tryRegisterCandidate(
                `${frag.prefixSmiles}c1cccnc1`,
                `3-${frag.labelZh}吡啶 (${formulaStr} 雜芳環異構物)`,
                `3-(${frag.iupacPrefixOrSuffix})pyridine`,
                `由 ${formulaStr} (DBE=${targetDbe}) 組合：3-取代吡啶骨架 (DBE=4) + ${frag.labelZh}`,
                "3-Substituted Pyridine (3-取代吡啶)"
              );
              tryRegisterCandidate(
                `${frag.prefixSmiles}c1ccccn1`,
                `2-${frag.labelZh}吡啶 (${formulaStr} 雜芳環異構物)`,
                `2-(${frag.iupacPrefixOrSuffix})pyridine`,
                `由 ${formulaStr} (DBE=${targetDbe}) 組合：2-取代吡啶骨架 (DBE=4) + ${frag.labelZh}`,
                "2-Substituted Pyridine (2-取代吡啶)"
              );
            }
          }
        }
      }

      if (targetDbe >= 4 && C >= 7 && N >= 1) {
        const pyDiCoreBudget: Partial<AtomBudget> = { C: 5, H: 3, N: 1 };
        const remPyDi = subtractBudgets(targetBudget, pyDiCoreBudget);
        const remPyDiDbe = targetDbe - 4;
        if (remPyDi && remPyDiDbe >= 0) {
          for (let i = 0; i < MONOVALENT_FRAGMENTS.length; i++) {
            for (let j = i; j < MONOVALENT_FRAGMENTS.length; j++) {
              const f1 = MONOVALENT_FRAGMENTS[i];
              const f2 = MONOVALENT_FRAGMENTS[j];
              if (f1.dbe + f2.dbe !== remPyDiDbe) continue;
              const sumFrag = addBudgets(f1.atoms, f2.atoms);
              if (!budgetsEqual(sumFrag, remPyDi)) continue;

              tryRegisterCandidate(
                `${f1.prefixSmiles}c1cccc(${f2.suffixSmiles})n1`,
                `2,6-二(${f1.labelZh}/${f2.labelZh})吡啶 (${formulaStr} 雜芳環異構物)`,
                `2-(${f1.iupacPrefixOrSuffix})-6-(${f2.iupacPrefixOrSuffix})pyridine`,
                `由 ${formulaStr} (DBE=${targetDbe}) 組合：2,6-二取代吡啶骨架 (DBE=4) + ${f1.labelZh} + ${f2.labelZh}`,
                "2,6-Disubstituted Pyridine (2,6-二取代吡啶)"
              );
              tryRegisterCandidate(
                `${f1.prefixSmiles}c1cc(${f2.suffixSmiles})cnc1`,
                `3,5-二(${f1.labelZh}/${f2.labelZh})吡啶 (${formulaStr} 雜芳環異構物)`,
                `3-(${f1.iupacPrefixOrSuffix})-5-(${f2.iupacPrefixOrSuffix})pyridine`,
                `由 ${formulaStr} (DBE=${targetDbe}) 組合：3,5-二取代吡啶骨架 (DBE=4) + ${f1.labelZh} + ${f2.labelZh}`,
                "3,5-Disubstituted Pyridine (3,5-二取代吡啶)"
              );
              tryRegisterCandidate(
                `${f1.prefixSmiles}c1cc(${f2.suffixSmiles})ccn1`,
                `2,4-二(${f1.labelZh}/${f2.labelZh})吡啶 (${formulaStr} 雜芳環異構物)`,
                `2-(${f1.iupacPrefixOrSuffix})-4-(${f2.iupacPrefixOrSuffix})pyridine`,
                `由 ${formulaStr} (DBE=${targetDbe}) 組合：2,4-二取代吡啶骨架 (DBE=4) + ${f1.labelZh} + ${f2.labelZh}`,
                "2,4-Disubstituted Pyridine (2,4-二取代吡啶)"
              );
            }
          }
        }
      }

      if (targetDbe === 4 && budgetsEqual(targetBudget, { C: 4, H: 4, N: 2 })) {
        tryRegisterCandidate(
          "c1cncnc1",
          "嘧啶 (Pyrimidine)",
          "pyrimidine",
          "由 C4H4N2 (DBE=4) 組合：1,3-雙氮六元雜芳環 (Pyrimidine)",
          "Pyrimidine (嘧啶)"
        );
        tryRegisterCandidate(
          "c1cnccn1",
          "吡嗪 (Pyrazine)",
          "pyrazine",
          "由 C4H4N2 (DBE=4) 組合：1,4-對稱雙氮六元雜芳環 (Pyrazine, D₂h 對稱)",
          "Pyrazine (吡嗪)"
        );
        tryRegisterCandidate(
          "c1ccnnc1",
          "噠嗪 (Pyridazine)",
          "pyridazine",
          "由 C4H4N2 (DBE=4) 組合：1,2-雙氮六元雜芳環 (Pyridazine)",
          "Pyridazine (噠嗪)"
        );
      }

      if (targetDbe === 3 && budgetsEqual(targetBudget, { C: 4, H: 5, N: 1 })) {
        tryRegisterCandidate(
          "c1cc[nH]c1",
          "吡咯 (1H-Pyrrole)",
          "1H-pyrrole",
          "由 C4H5N (DBE=3) 組合：五元含氮芳雜環 (Pyrrole)",
          "Pyrrole (五元含氮雜芳環)"
        );
      }
      if (targetDbe === 3 && budgetsEqual(targetBudget, { C: 4, H: 4, O: 1 })) {
        tryRegisterCandidate(
          "c1ccoc1",
          "呋喃 (Furan)",
          "furan",
          "由 C4H4O (DBE=3) 組合：五元含氧芳雜環 (Furan)",
          "Furan (五元含氧雜芳環)"
        );
      }
      if (targetDbe === 3 && budgetsEqual(targetBudget, { C: 4, H: 4, S: 1 })) {
        tryRegisterCandidate(
          "c1ccsc1",
          "噻吩 (Thiophene)",
          "thiophene",
          "由 C4H4S (DBE=3) 組合：五元含硫芳雜環 (Thiophene)",
          "Thiophene (五元含硫雜芳環)"
        );
      }
      if (targetDbe >= 3 && C >= 5 && (N >= 1 || O >= 1 || S >= 1)) {
        const fiveCores: {
          budget: Partial<AtomBudget>;
          ringSmiles: string;
          nameZh: string;
          nameEn: string;
        }[] = [
          {
            budget: { C: 4, H: 4, N: 1 },
            ringSmiles: "c1ccc[nH]1",
            nameZh: "吡咯",
            nameEn: "1H-pyrrole",
          },
          {
            budget: { C: 4, H: 3, O: 1 },
            ringSmiles: "c1ccco1",
            nameZh: "呋喃",
            nameEn: "furan",
          },
          {
            budget: { C: 4, H: 3, S: 1 },
            ringSmiles: "c1cccs1",
            nameZh: "噻吩",
            nameEn: "thiophene",
          },
        ];
        for (const core of fiveCores) {
          const rem5 = subtractBudgets(targetBudget, core.budget);
          const rem5Dbe = targetDbe - 3;
          if (rem5 && rem5Dbe >= 0) {
            for (const frag of MONOVALENT_FRAGMENTS) {
              if (frag.dbe === rem5Dbe && budgetsEqual(frag.atoms, rem5)) {
                tryRegisterCandidate(
                  `${frag.prefixSmiles}${core.ringSmiles}`,
                  `2-${frag.labelZh}${core.nameZh} (${formulaStr} 五元雜芳環候選)`,
                  `2-(${frag.iupacPrefixOrSuffix})-${core.nameEn}`,
                  `由 ${formulaStr} (DBE=${targetDbe}) 組合：2-取代${core.nameZh}骨架 (DBE=3) + ${frag.labelZh}`,
                  `Substituted ${core.nameEn} (五元雜芳環)`
                );
              }
            }
          }
        }
      }

      if (targetDbe === 6 && budgetsEqual(targetBudget, { C: 8, H: 7, N: 1 })) {
        tryRegisterCandidate(
          "c1ccc2[nH]ccc2c1",
          "吲哚 (1H-Indole)",
          "1H-indole",
          "由 C8H7N (DBE=6) 組合：苯并吡咯稠合雙環雜芳系統 (Indole)",
          "Indole (吲哚稠合雜芳環)"
        );
      }
      if (targetDbe === 7 && budgetsEqual(targetBudget, { C: 9, H: 7, N: 1 })) {
        tryRegisterCandidate(
          "c1ccc2ncccc2c1",
          "喹啉 (Quinoline)",
          "quinoline",
          "由 C9H7N (DBE=7) 組合：苯并吡啶稠合雙環雜芳系統 (Quinoline)",
          "Quinoline (喹啉稠合雜芳環)"
        );
        tryRegisterCandidate(
          "c1ccc2cnccc2c1",
          "異喹啉 (Isoquinoline)",
          "isoquinoline",
          "由 C9H7N (DBE=7) 組合：苯并吡啶異構體 (Isoquinoline)",
          "Isoquinoline (異喹啉稠合雜芳環)"
        );
      }
    }

    // PATH 2: Divalent Linker Combinatorial Partitioning (R1 - Linker - R2)
    if (Si === 0) {
      for (const linker of DIVALENT_LINKERS) {
        if (linker.dbe > targetDbe) continue;
        const remAfterLinker = subtractBudgets(targetBudget, linker.atoms);
        if (!remAfterLinker) continue;
        const remDbe = targetDbe - linker.dbe;

        for (let i = 0; i < MONOVALENT_R_GROUPS.length; i++) {
          const r1 = MONOVALENT_R_GROUPS[i];
          if (r1.dbe > remDbe) continue;
          const remAfterR1 = subtractBudgets(remAfterLinker, r1.atoms);
          if (!remAfterR1) continue;

          for (let j = 0; j < MONOVALENT_R_GROUPS.length; j++) {
            const r2 = MONOVALENT_R_GROUPS[j];
            if (r1.dbe + r2.dbe !== remDbe) continue;
            if (!budgetsEqual(r2.atoms, remAfterR1)) continue;

            const smiles = linker.joinSmiles(r1, r2);
            tryRegisterCandidate(
              smiles,
              `${r1.nameZh}${r2.nameZh}${linker.labelZh} (${formulaStr} 拓樸生成候選)`,
              `${r2.iupacGroup} ${r1.iupacGroup} ${linker.iupacClass}`,
              `由 ${formulaStr} (DBE=${targetDbe}) 組合：${r1.nameZh} + ${linker.labelZh} + ${r2.nameZh}`
            );
          }
        }
      }
    }

    // PATH 3: Acyclic Monovalent Functional Group Partitioning (R - TerminalGroup)
    if (Si === 0) {
      for (const rGroup of MONOVALENT_R_GROUPS) {
        if (rGroup.dbe > targetDbe) continue;
        const remAfterR = subtractBudgets(targetBudget, rGroup.atoms);
        if (!remAfterR) continue;
        const remDbe = targetDbe - rGroup.dbe;

        for (const termFrag of MONOVALENT_FRAGMENTS) {
          if (termFrag.dbe !== remDbe) continue;
          if (!budgetsEqual(termFrag.atoms, remAfterR)) continue;

          const smiles = `${rGroup.leftSmiles}${termFrag.suffixSmiles}`;
          tryRegisterCandidate(
            smiles,
            `${rGroup.nameZh}${termFrag.labelZh} (${formulaStr} 拓樸生成候選)`,
            `${rGroup.iupacGroup} ${termFrag.iupacPrefixOrSuffix}`,
            `由 ${formulaStr} (DBE=${targetDbe}) 組合：${rGroup.nameZh} + ${termFrag.labelZh}`
          );
        }
      }
    }

    // PATH 4: Organosilicon & Homologous Long-Chain / Alicyclic Scaffolds
    if (Si > 0) {
      if (
        Si >= 2 &&
        getAtomCount(targetBudget, "O") === Si - 1 &&
        C === 2 * Si + 2 &&
        getAtomCount(targetBudget, "H") === 6 * Si + 6
      ) {
        const middleUnits = Array(Si - 2)
          .fill("O[Si](C)(C)")
          .join("");
        const siloxaneSmiles = `C[Si](C)(C)${middleUnits}O[Si](C)(C)C`;
        tryRegisterCandidate(
          siloxaneSmiles,
          `聚二甲基矽氧烷寡聚物 (${formulaStr} 矽氧烷鏈)`,
          `polydimethylsiloxane oligomer (${formulaStr})`,
          `由 ${formulaStr} (DBE=${targetDbe}) 組合：Si-O-Si 矽氧烷重複單元與三甲基矽基端基`
        );
      }
    }

    if (results.length === 0 && C >= 2 && C <= 15 && Si === 0) {
      const H = getAtomCount(targetBudget, "H");
      if (targetDbe === 1 && O === 1 && N === 0 && H === 2 * C) {
        tryRegisterCandidate(
          `${"C".repeat(C - 1)}C=O`,
          `直鏈脂肪醛 (${formulaStr} 拓樸生成候選)`,
          `n-alkanal (${formulaStr})`,
          `由 ${formulaStr} (DBE=1) 組合：C${C - 1} 直鏈烷基 + 醛基 (-CHO)`
        );
        if (C >= 3) {
          tryRegisterCandidate(
            `CC(=O)${"C".repeat(C - 2)}`,
            `甲基烷基酮 (${formulaStr} 拓樸生成候選)`,
            `alkan-2-one (${formulaStr})`,
            `由 ${formulaStr} (DBE=1) 組合：甲基酮骨架 (CH₃-C(=O)-R)`
          );
        }
      } else if (targetDbe === 1 && O === 2 && N === 0 && H === 2 * C) {
        tryRegisterCandidate(
          `${"C".repeat(C - 1)}C(=O)O`,
          `直鏈脂肪羧酸 (${formulaStr} 拓樸生成候選)`,
          `n-alkanoic acid (${formulaStr})`,
          `由 ${formulaStr} (DBE=1) 組合：C${C - 1} 直鏈烷基 + 羧酸基 (-COOH)`
        );
        if (C >= 3) {
          tryRegisterCandidate(
            `COC(=O)${"C".repeat(C - 2)}`,
            `脂肪族甲酯 (${formulaStr} 拓樸生成候選)`,
            `methyl alkanoate (${formulaStr})`,
            `由 ${formulaStr} (DBE=1) 組合：甲酯骨架 (-COOCH₃) + C${C - 2} 烷基`
          );
        }
      } else if (targetDbe === 5 && C >= 7 && O >= 1 && N === 0) {
        const sideC = C - 7;
        if (O === 1 && sideC >= 1) {
          tryRegisterCandidate(
            `${"C".repeat(sideC)}c1ccc(C=O)cc1`,
            `對烷基苯甲醛 (${formulaStr} 拓樸生成候選)`,
            `4-alkylbenzaldehyde (${formulaStr})`,
            `由 ${formulaStr} (DBE=${5}) 組合：1,4-對位雙取代苯環 + C${sideC} 烷基 + 醛基 (-CHO)`
          );
          tryRegisterCandidate(
            `${"C".repeat(sideC)}C(=O)c1ccccc1`,
            `烷基苯基酮 (${formulaStr} 拓樸生成候選)`,
            `1-phenylalkan-1-one (${formulaStr})`,
            `由 ${formulaStr} (DBE=5) 組合：單取代苯環 + 醯基鏈 (-C(=O)R)`
          );
        } else if (O === 2 && sideC >= 1) {
          tryRegisterCandidate(
            `${"C".repeat(sideC)}c1ccc(C(=O)O)cc1`,
            `對烷基苯甲酸 (${formulaStr} 拓樸生成候選)`,
            `4-alkylbenzoic acid (${formulaStr})`,
            `由 ${formulaStr} (DBE=5) 組合：1,4-對位雙取代苯環 + C${sideC} 烷基 + 羧酸基 (-COOH)`
          );
        }
      } else if (targetDbe === 1 && O === 0 && N === 0 && H === 2 * C && C >= 3) {
        const ringSmiles = `C1${"C".repeat(C - 1)}1`;
        tryRegisterCandidate(
          ringSmiles,
          `環烷烴 (${formulaStr} 脂環候選)`,
          `cycloalkane (${formulaStr})`,
          `由 ${formulaStr} (DBE=1) 組合：飽和單環烷烴骨架`
        );
      } else if (targetDbe === 0 && O === 0 && N === 0 && H === 2 * C + 2) {
        tryRegisterCandidate(
          "C".repeat(C),
          `直鏈烷烴 (${formulaStr} 飽和碳氫候選)`,
          `n-alkane (${formulaStr})`,
          `由 ${formulaStr} (DBE=0) 組合：飽和直鏈烷烴骨架`
        );
      }
    }

    return results;
  }
}
