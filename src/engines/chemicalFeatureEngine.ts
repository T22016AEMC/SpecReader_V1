import {
  Carbon13SummaryAnalysis,
  ChemicalFeatureEvidence,
  EvidenceReference,
  ExperimentalSpectrumData,
  ExtendedSpectrumModality,
  FunctionalGroupConstraint,
  H1NMRIntegrationSummary,
  IRFunctionalGroupFinding,
  MSComprehensiveAnalysis,
  NMRSubstructureConstraint,
  ParsedChemicalStructure,
  ProtonEnvironment,
  SpectrumModality,
  StructuralConstraints,
  StructuralMotifConstraint,
} from "../types/spectrum";
import { IRAnalysisEngine } from "./irEngine";
import { MSAnalysisEngine } from "./msEngine";
import { NMRAnalysisEngine } from "./nmrEngine";
import {
  IRScientificEngine,
  MassSpectrometryEngine,
  MSMSFragmentationEngine,
  NMRScientificEngine,
  ToFSIMSScientificEngine,
} from "./scientificEngines";
import { ChemicalHardConstraintValidator } from "./scientificEngines/chemicalHardConstraintValidator";
import {validateScientificInput} from './scientificEngines/scientificInputValidation';

export interface ModalityFeatureAdapter {
  modality: SpectrumModality | ExtendedSpectrumModality | "MSMS" | "TOF_SIMS";
  extractFeatures(
    spectrum: ExperimentalSpectrumData,
    expectedStructure?: ParsedChemicalStructure | null
  ): {
    evidence: ChemicalFeatureEvidence[];
    constraints: StructuralConstraints;
  };
}

export class IRFeatureAdapter implements ModalityFeatureAdapter {
  modality = "IR" as const;
  extractFeatures(spectrum: ExperimentalSpectrumData): {
    evidence: ChemicalFeatureEvidence[];
    constraints: StructuralConstraints;
  } {
    const out = IRScientificEngine.analyze(spectrum);
    return {
      evidence: out.extractedEvidence,
      constraints: out.structuralConstraints,
    };
  }
}

export class H1NMRFeatureAdapter implements ModalityFeatureAdapter {
  modality = "1H_NMR" as const;
  extractFeatures(
    spectrum: ExperimentalSpectrumData,
    _expectedStructure?: ParsedChemicalStructure | null
  ): {
    evidence: ChemicalFeatureEvidence[];
    constraints: StructuralConstraints;
  } {
    const out = NMRScientificEngine.analyze1H(spectrum);
    return {
      evidence: out.extractedEvidence,
      constraints: out.structuralConstraints,
    };
  }
}

export class C13NMRFeatureAdapter implements ModalityFeatureAdapter {
  modality = "13C_NMR" as const;
  extractFeatures(
    spectrum: ExperimentalSpectrumData,
    _expectedStructure?: ParsedChemicalStructure | null
  ): {
    evidence: ChemicalFeatureEvidence[];
    constraints: StructuralConstraints;
  } {
    const out = NMRScientificEngine.analyze13C(spectrum);
    return {
      evidence: out.extractedEvidence,
      constraints: out.structuralConstraints,
    };
  }
}

export class MSFeatureAdapter implements ModalityFeatureAdapter {
  modality = "MS" as const;
  extractFeatures(
    spectrum: ExperimentalSpectrumData,
    _expectedStructure?: ParsedChemicalStructure | null
  ): {
    evidence: ChemicalFeatureEvidence[];
    constraints: StructuralConstraints;
  } {
    const out = MassSpectrometryEngine.analyze(spectrum);
    return {
      evidence: out.extractedEvidence,
      constraints: out.structuralConstraints,
    };
  }
}

export class MSMSFeatureAdapter implements ModalityFeatureAdapter {
  modality = "MSMS" as const;
  extractFeatures(
    spectrum: ExperimentalSpectrumData,
    _expectedStructure?: ParsedChemicalStructure | null
  ): {
    evidence: ChemicalFeatureEvidence[];
    constraints: StructuralConstraints;
  } {
    const out = MSMSFragmentationEngine.analyze(spectrum);
    return {
      evidence: out.extractedEvidence,
      constraints: out.structuralConstraints,
    };
  }
}

export class ToFSIMSFeatureAdapter implements ModalityFeatureAdapter {
  modality = "TOF_SIMS" as const;
  extractFeatures(spectrum: ExperimentalSpectrumData): {
    evidence: ChemicalFeatureEvidence[];
    constraints: StructuralConstraints;
  } {
    const out = ToFSIMSScientificEngine.analyze(spectrum);
    return {
      evidence: out.extractedEvidence,
      constraints: out.structuralConstraints,
    };
  }
}

export class EvidenceAccumulator {
  static readonly irAdapter = new IRFeatureAdapter();
  static readonly h1Adapter = new H1NMRFeatureAdapter();
  static readonly c13Adapter = new C13NMRFeatureAdapter();
  static readonly msAdapter = new MSFeatureAdapter();
  static readonly msmsAdapter = new MSMSFeatureAdapter();
  static readonly tofSimsAdapter = new ToFSIMSFeatureAdapter();

  static extractUnifiedEvidence(
    spectra: Partial<
      Record<
        SpectrumModality | "MSMS" | "TOF_SIMS",
        ExperimentalSpectrumData
      >
    >,
    expectedStructure?: ParsedChemicalStructure | null
  ): ChemicalFeatureEvidence[] {
    const rawEvidence: ChemicalFeatureEvidence[] = [];
    if (spectra.IR) {
      rawEvidence.push(...this.irAdapter.extractFeatures(spectra.IR).evidence);
    }
    if (spectra["1H_NMR"]) {
      rawEvidence.push(
        ...this.h1Adapter.extractFeatures(spectra["1H_NMR"], expectedStructure).evidence
      );
    }
    if (spectra["13C_NMR"]) {
      rawEvidence.push(
        ...this.c13Adapter.extractFeatures(spectra["13C_NMR"], expectedStructure).evidence
      );
    }
    if (spectra.MS) {
      rawEvidence.push(
        ...this.msAdapter.extractFeatures(spectra.MS, expectedStructure).evidence
      );
    }
    if (spectra.MSMS) {
      rawEvidence.push(
        ...this.msmsAdapter.extractFeatures(spectra.MSMS, expectedStructure).evidence
      );
    }
    if (spectra.TOF_SIMS) {
      rawEvidence.push(
        ...this.tofSimsAdapter.extractFeatures(spectra.TOF_SIMS).evidence
      );
    }

    const formulaForbidN =
      expectedStructure?.atomCounts !== undefined &&
      (expectedStructure.atomCounts.N ?? 0) === 0;
    const formulaForbidO =
      expectedStructure?.atomCounts !== undefined &&
      (expectedStructure.atomCounts.O ?? 0) === 0;

    // De-duplicate by (sourceModality, featureCode, sourceSignalKey) & enforce formula element hard constraints
    const seenKeys = new Set<string>();
    const unifiedEvidence: ChemicalFeatureEvidence[] = [];

    for (const ev of rawEvidence) {
      if (
        formulaForbidN &&
        ["PYRIDINE_RING", "PRIMARY_AMINE", "SECONDARY_AMINE", "AMIDE_GROUP", "NITRILE_GROUP", "NITRO_GROUP"].includes(
          ev.featureKey
        )
      ) {
        continue;
      }
      if (
        formulaForbidO &&
        ["ALCOHOL_OH", "PHENOL_OH", "CARBOXYLIC_ACID", "ESTER_GROUP", "ALDEHYDE_GROUP", "KETONE_GROUP", "ETHER_C_O"].includes(
          ev.featureKey
        )
      ) {
        continue;
      }
      const dedupKey = `${ev.provenance?.source || "MOD"}::${ev.featureKey}::${ev.sourceSignalKey || ev.featureName}`;
      if (seenKeys.has(dedupKey)) continue;
      seenKeys.add(dedupKey);
      unifiedEvidence.push(ev);
    }

    return unifiedEvidence;
  }
}

export interface ProtonSpinSystemSummary {
  patternName: string;
  chemicalShifts: number[];
  jValues: number[];
  protonCount: number;
}

export interface ExchangeableProtonInfo {
  shift: number;
  integral: number;
  label: string;
}

export interface ExtendedProtonSummary {
  solvent: string;
  totalIntegratedProtons: number;
  aromaticPatternHint: string;
  environments: ProtonEnvironment[];
  spinSystems: ProtonSpinSystemSummary[];
  exchangeableProtons: ExchangeableProtonInfo[];
  integrationAnalysis?: H1NMRIntegrationSummary;
  hasAldehydeProton: boolean;
  hasCarboxylicAcidProton: boolean;
  hasExchangeableProton: boolean;
  hasMethoxyGroup: boolean;
  hasAcetoxyOrMethylKetone: boolean;
  summaryNotes: string[];
}

export interface ExtendedCarbonEnvironmentItem {
  peakId: string;
  shift: number;
  shiftPpm: number;
  deptType: string;
  regionLabel: string;
  environmentType: "CARBONYL_C" | "AROMATIC_C" | "ALIPHATIC_C";
  candidateFragments: string[];
  confidence: "HIGH" | "MEDIUM" | "LOW";
  isSolvent?: boolean;
}

export interface ExtendedCarbonSummary {
  observedSignalCount: number;
  totalUniqueCarbonSignaling: number;
  carbonylCount: number;
  aromaticCount: number;
  aliphaticCount: number;
  expectedTheoreticalEnvironments: number | null;
  environments: ExtendedCarbonEnvironmentItem[];
  symmetryAssessment: string;
  symmetryAndOverlapNote: string;
  limitationsNote: string;
}

export interface ExtendedMSDetectedIon {
  id: string;
  mz: number;
  relativeIntensity: number;
  ionType: "M+•" | "[M+H]+" | "BasePeak" | "Fragment" | "Isotope";
  ionRole:
    | "MOLECULAR_ION"
    | "QUASI_MOLECULAR_ION"
    | "BASE_PEAK"
    | "ISOTOPE_M_PLUS_1"
    | "ISOTOPE_M_PLUS_2"
    | "CHARACTERISTIC_FRAGMENT"
    | "MINOR_FRAGMENT";
  label: string;
  proposedFormulaOrIdentity: string;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  reasoning: string;
}

export interface ExtendedMSNeutralLoss {
  fromMz: number;
  toMz: number;
  lossMass: number;
  candidateFormula: string;
  proposedNeutralFormula: string;
  chemicalMeaning: string;
  structuralImplication: string;
  chemicalImplication: string;
  confidence: "HIGH" | "MEDIUM";
}

export interface ExtendedMSSummary {
  msType: string;
  ionizationMode: string;
  molecularIonMz: number | null;
  estimatedMolecularIonMz: number | null;
  basePeakMz: number | null;
  nitrogenRuleAssessment: {
    parity: "ODD" | "EVEN" | "UNKNOWN";
    explanation: string;
  };
  detectedIons: ExtendedMSDetectedIon[];
  neutralLosses: ExtendedMSNeutralLoss[];
  isotopeReport: {
    molecularIonMz: number | null;
    mPlus1IntensityPercent: number | null;
    mPlus2IntensityPercent: number | null;
    estimatedCarbonCount: number | null;
    halogenHint: "NONE" | "CHLORINE_1" | "BROMINE_1" | "SULFUR_POSSIBLE" | "UNKNOWN";
    nitrogenRuleParity: "ODD_NITROGEN" | "EVEN_OR_ZERO_NITROGEN" | "UNKNOWN";
    notes: string[];
  };
  summaryNotes: string[];
}

export interface UncalibratedSignalRecord {
  modality: string;
  id: string;
  pixelX?: number;
  pixelY?: number;
  label?: string;
}

export interface ExtraChemicalEvidenceInput {
  userSuppliedFormula?: string;
  molecularFormula?: string;
  chemicalNotes?: string;
  msmsSpectrum?: ExperimentalSpectrumData;
  tofSimsSpectrum?: ExperimentalSpectrumData;
}

export interface IntegratedAnalysisBundle {
  scientificSources?: Partial<Record<import('../types/spectrum').ExtendedSpectrumModality,ExperimentalSpectrumData>>;
  scientificEvidence?: ScientificEvidence[];
  irFindings: IRFunctionalGroupFinding[];
  h1Environments: ProtonEnvironment[];
  h1SymmetrySummary: string;
  totalIntegratedProtons: number | null;
  c13Summary: Carbon13SummaryAnalysis;
  msAnalysis: MSComprehensiveAnalysis | null;
  protonSummary: ExtendedProtonSummary | null;
  carbonSummary: ExtendedCarbonSummary | null;
  msSummary: ExtendedMSSummary | null;
  msmsAnalysis?: ReturnType<typeof MSMSFragmentationEngine.analyze> | null;
  tofSimsAnalysis?: ReturnType<typeof ToFSIMSScientificEngine.analyze> | null;
  calibratedSpectra?: Partial<Record<SpectrumModality, ExperimentalSpectrumData>>;
  uncalibratedSignals?: UncalibratedSignalRecord[];
  userSuppliedFormula?: string;
  userChemicalNotes?: string;
  constraints: StructuralConstraints;
  independentConstraints: Partial<Record<SpectrumModality, StructuralConstraints>>;
  evidencePool: EvidenceReference[];
  unifiedEvidence: ChemicalFeatureEvidence[];
  knownConstraintsSummary: string[];
  activeModalities: SpectrumModality[];
}

export class ChemicalFeatureEngine {
  static parseExplicitMolecularFormula(formulaInput: string): {
    cleanFormula: string;
    atomCounts: Record<string, number>;
    nominalMass: number;
    exactMass: number;
    dbe: number;
    nitrogenParity: "ODD" | "EVEN";
  } | null {
    const val = ChemicalHardConstraintValidator.parseAndValidateFormula(
      formulaInput
    );
    if (!val.isValid || !val.isSupported || val.dbe === null) {
      return null;
    }
    const nominalMass = val.nominalMass ?? 0;
    return {
      cleanFormula: val.computedFormula,
      atomCounts: val.atomCounts,
      nominalMass,
      exactMass: val.exactMass ?? 0,
      dbe: val.dbe,
      nitrogenParity: nominalMass % 2 === 1 ? "ODD" : "EVEN",
    };
  }

  /**
   * 整合已載入之實驗光譜 (IR / 1H NMR / 13C NMR / MS / MS-MS / ToF-SIMS) 與使用者輸入之分子式/化學證據，
   * 執行確定性跨譜官能基共識合併、排除約束與結構約束匯總。
   * 同時嚴格過濾尚未完成座標校正 (isCalibrated === false) 之原始像素標記，避免未校正像素假裝成物理座標。
   */
  static buildIntegratedBundle(
    rawSpectra: Partial<
      Record<
        SpectrumModality | import("../types/spectrum").ExtendedSpectrumModality,
        ExperimentalSpectrumData
      >
    >,
    expectedStructure?: ParsedChemicalStructure | null,
    extraInput?: ExtraChemicalEvidenceInput
  ): IntegratedAnalysisBundle {
    rawSpectra=Object.fromEntries(Object.entries(rawSpectra).map(([mod,s])=>[mod,s?{...s,peaks:uniqueObservations(s.peaks)}:s]));
    if(extraInput) extraInput={...extraInput,...(extraInput.msmsSpectrum?{msmsSpectrum:{...extraInput.msmsSpectrum,peaks:uniqueObservations(extraInput.msmsSpectrum.peaks)}}:{}),...(extraInput.tofSimsSpectrum?{tofSimsSpectrum:{...extraInput.tofSimsSpectrum,peaks:uniqueObservations(extraInput.tofSimsSpectrum.peaks)}}:{})};

    return this.extractIntegratedConstraints(rawSpectra, expectedStructure, extraInput);
  }

  static extractIntegratedConstraints(
    rawSpectra: Partial<
      Record<
        SpectrumModality | import("../types/spectrum").ExtendedSpectrumModality,
        ExperimentalSpectrumData
      >
    >,
    expectedStructure?: ParsedChemicalStructure | null,
    extraInput?: ExtraChemicalEvidenceInput
  ): IntegratedAnalysisBundle {
    const uncalibratedSignals: UncalibratedSignalRecord[] = [];
    rawSpectra=Object.fromEntries(Object.entries(rawSpectra).map(([mod,s])=>[mod,s?validateScientificInput({...s,peaks:uniqueObservations(s.peaks)}):s]));
    const spectra: Partial<Record<SpectrumModality, ExperimentalSpectrumData>> = {};

    let rawMsmsSpec = extraInput?.msmsSpectrum || rawSpectra["MS/MS"];
    let rawTofSimsSpec = extraInput?.tofSimsSpectrum || rawSpectra["ToF-SIMS"];
    if(rawMsmsSpec) rawMsmsSpec=validateScientificInput({...rawMsmsSpec,peaks:uniqueObservations(rawMsmsSpec.peaks)});
    if(rawTofSimsSpec) rawTofSimsSpec=validateScientificInput({...rawTofSimsSpec,peaks:uniqueObservations(rawTofSimsSpec.peaks)});

    for (const mod of ["IR", "1H_NMR", "13C_NMR", "MS"] as SpectrumModality[]) {
      const sp = rawSpectra[mod];
      if (!sp) continue;
      // 防止 MS/MS 或 ToF-SIMS 光譜被當成一般 MS 處理 (Work Package A4)
      if (mod === "MS") {
        if (sp.canonicalModality === "MSMS" || sp.msParams?.msType === "MS/MS") {
          if (!rawMsmsSpec) rawMsmsSpec = sp;
          continue;
        }
        if (
          sp.canonicalModality === "TOF_SIMS" ||
          sp.msParams?.msType === "ToF-SIMS"
        ) {
          if (!rawTofSimsSpec) rawTofSimsSpec = sp;
          continue;
        }
      }
      const calibratedPeaks = (sp.peaks || []).filter((pk) => {
        if (pk.isCalibrated === false) {
          uncalibratedSignals.push({
            modality: mod,
            id: pk.id,
            pixelX: pk.pixelX,
            pixelY: pk.pixelY,
            label: pk.assignment,
          });
          return false;
        }
        return true;
      });
      spectra[mod] = {
        ...sp,
        peaks: calibratedPeaks,
      };
    }

    const activeModalities: SpectrumModality[] = [];
    const independentConstraints: Partial<
      Record<SpectrumModality, StructuralConstraints>
    > = {};
    const evidencePool: EvidenceReference[] = [];

    let irFindings: IRFunctionalGroupFinding[] = [];
    let h1Environments: ProtonEnvironment[] = [];
    let h1SymmetrySummary = "尚未載入 ¹H NMR 圖譜。";
    let totalIntegratedProtons: number | null = null;
    let c13Summary: Carbon13SummaryAnalysis = {
      observedSignalCount: 0, uniqueCarbonCount: 0,
      expectedTheoreticalEnvironments: null,
      environments: [],
      symmetryAndOverlapNote: "尚未載入 ¹³C NMR 圖譜。",
      limitationsNote: "",
    };
    let msAnalysis: MSComprehensiveAnalysis | null = null;
    let protonSummary: ExtendedProtonSummary | null = null;
    let carbonSummary: ExtendedCarbonSummary | null = null;
    let msSummary: ExtendedMSSummary | null = null;

    const rawUserFormulaStr =
      (
        extraInput?.molecularFormula ||
        (extraInput as { userSuppliedFormula?: string } | undefined)?.userSuppliedFormula ||
        ""
      ).trim();
    const userFormulaValidation = rawUserFormulaStr
      ? ChemicalHardConstraintValidator.parseAndValidateFormula(rawUserFormulaStr)
      : undefined;
    const parsedUserFormula =
      userFormulaValidation &&
      userFormulaValidation.isValid &&
      userFormulaValidation.isSupported
        ? this.parseExplicitMolecularFormula(rawUserFormulaStr)
        : null;

    // Construct a formula-context structure when expectedStructure is not passed in Mode A,
    // so 1H/13C NMR and IR analyzers immediately respect authoritative element counts (e.g. N=0 or O>0).
    const effectiveStructureContext: ParsedChemicalStructure | null | undefined =
      expectedStructure ??
      (parsedUserFormula
        ? {
            name: parsedUserFormula.cleanFormula,
            smiles: "", symmetryFactor: "unknown", uniqueProtonEnvironmentsCount: 0, uniqueCarbonEnvironmentsCount: 0, sourceMethod: "Molecular Formula",
            molecularFormula: parsedUserFormula.cleanFormula,
            molecularWeight: parsedUserFormula.nominalMass,
            exactMass: parsedUserFormula.exactMass,
            unsaturationIndex: parsedUserFormula.dbe,
            dbe: parsedUserFormula.dbe,
            atomCounts: parsedUserFormula.atomCounts,
            detectedFunctionalGroups: [],
            isValid: true,
            isFormulaOnly: true,
          }
        : undefined);

    const formulaForbidN =
      effectiveStructureContext?.atomCounts !== undefined &&
      (effectiveStructureContext.atomCounts.N ?? 0) === 0;

    const requiredFG: FunctionalGroupConstraint[] = [];
    const excludedFG: FunctionalGroupConstraint[] = [];
    const requiredSubstructures: StructuralMotifConstraint[] = [];
    const nmrSubstructures: NMRSubstructureConstraint[] = [];

    if (spectra.IR) {
      activeModalities.push("IR");
      const irRes = IRAnalysisEngine.analyzeExperimentalIR(spectra.IR);
      irFindings = irRes.findings.map((f) => ({
        ...f,
        groupName: f.groupName || f.functionalGroup,
        groupFamily: f.groupFamily || f.family,
        observedPeaks: f.observedPeaks || (f.observedPeak > 0 ? [f.observedPeak] : []),
        observedIntensities: f.observedIntensities || [85],
        bandShape: f.bandShape || f.observedWidthAndShape || "Sharp",
        vibrationMode: f.vibrationMode || f.assignment,
        status:
          f.status ||
          (f.matchLevel === "Strong"
            ? "PRESENT"
            : f.matchLevel === "Moderate" || f.matchLevel === "Weak"
              ? "POSSIBLE"
              : "ABSENT"),
        evidenceIds: f.evidenceIds || [f.evidence.id],
      }));
      independentConstraints.IR = irRes.structuralConstraints;
      if (irRes.structuralConstraints.requiredFunctionalGroups) {
        requiredFG.push(
          ...irRes.structuralConstraints.requiredFunctionalGroups
            .filter(
              (g) =>
                !formulaForbidN ||
                !["Amine", "Amide", "Nitrile", "Nitro", "Heteroaromatic"].includes(
                  g.groupFamily
                )
            )
            .map((g) => ({
              ...g,
              groupName: g.groupName || g.label,
              notes: g.reasoning || g.observedSignal || g.label,
            }))
        );
      }
      if (irRes.structuralConstraints.excludedFunctionalGroups) {
        excludedFG.push(
          ...irRes.structuralConstraints.excludedFunctionalGroups.map((g) => ({
            ...g,
            groupName: g.groupName || g.label,
            notes: g.reasoning || g.observedSignal || g.label,
          }))
        );
      }
      if (irRes.structuralConstraints.evidence) {
        evidencePool.push(
          ...irRes.structuralConstraints.evidence.map((e, idx) => ({
            ...e,
            id: e.id || `ev-ir-${idx}`,
          }))
        );
      }
    }

    if (spectra["1H_NMR"]) {
      activeModalities.push("1H_NMR");
      const h1Res = NMRAnalysisEngine.analyzeExperimental1HNMR(
        spectra["1H_NMR"],
        effectiveStructureContext
      );
      h1Environments = h1Res.environments;
      h1SymmetrySummary = h1Res.symmetrySummary;
      totalIntegratedProtons = h1Res.totalIntegratedProtons;
      independentConstraints["1H_NMR"] = h1Res.structuralConstraints;

      if (h1Res.structuralConstraints.requiredFunctionalGroups) {
        requiredFG.push(
          ...h1Res.structuralConstraints.requiredFunctionalGroups
            .filter(
              (g) =>
                !formulaForbidN ||
                !["Amine", "Amide", "Nitrile", "Nitro", "Heteroaromatic"].includes(
                  g.groupFamily
                )
            )
            .map((g) => ({
              ...g,
              groupName: g.groupName || g.label,
              notes: g.reasoning || g.observedSignal || g.label,
            }))
        );
      }
      if (h1Res.structuralConstraints.requiredSubstructures) {
        requiredSubstructures.push(
          ...h1Res.structuralConstraints.requiredSubstructures
        );
      }
      if (h1Res.structuralConstraints.evidence) {
        evidencePool.push(
          ...h1Res.structuralConstraints.evidence.map((e, idx) => ({
            ...e,
            id: e.id || `ev-h1-${idx}`,
          }))
        );
      }

      const spinSystems: ProtonSpinSystemSummary[] = h1Environments.map((env) => ({
        patternName: env.environmentLabel,
        chemicalShifts: [env.shiftPpm],
        jValues: env.jCouplingHz,
        protonCount: env.integration || 1,
      }));

      // Check for ethoxy quartet + triplet pattern with joint compatibility
      const hasQuartet4 = h1Environments.some(
        (e) =>
          e.shiftPpm >= 3.95 &&
          e.shiftPpm <= 4.55 &&
          (e.multiplicity === "q" || e.multiplicity === "quartet" || (e.multiplicity === null && (e.integration ?? 0) === 2)) &&
          (e.integration === null || (e.integration ?? 0) >= 1.5)
      );
      const hasTriplet1 = h1Environments.some(
        (e) =>
          e.shiftPpm >= 1.1 &&
          e.shiftPpm <= 1.55 &&
          (e.multiplicity === "t" || e.multiplicity === "triplet" || (e.multiplicity === null && (e.integration ?? 0) === 3)) &&
          (e.integration === null || (e.integration ?? 0) >= 2.4)
      );
      if (hasQuartet4 && hasTriplet1) {
        spinSystems.push({
          patternName: "乙氧基偶合系統 (-OCH2CH3, q + t)",
          chemicalShifts: [4.35, 1.38],
          jValues: [7.1],
          protonCount: 5,
        });
      }

      const exchangeableProtons: ExchangeableProtonInfo[] = h1Environments
        .filter((e) => e.shiftPpm >= 8.8 || e.environmentLabel.includes("羧酸") || e.environmentLabel.includes("酚") || e.environmentLabel.includes("醯胺"))
        .map((e) => ({
          shift: e.shiftPpm,
          integral: e.integration || 1,
          label: e.environmentLabel,
        }));

      for (const env of h1Environments) {
        nmrSubstructures.push({
          motif: env.environmentLabel,
          fragmentType: env.environmentLabel,
          description: env.reasoning,
          sourceModality: "1H_NMR",
          chemicalShiftPpm: env.shiftPpm,
          multiplicity: env.multiplicity || undefined,
          integral: env.integration || undefined,
          jCouplingHz: env.jCouplingHz,
          confidence: env.confidence,
          evidenceIds: [env.id],
        });
      }

      protonSummary = {
        solvent: spectra["1H_NMR"].nmrSolvent || "CDCl3",
        totalIntegratedProtons: totalIntegratedProtons || 0,
        aromaticPatternHint: h1SymmetrySummary,
        environments: h1Environments,
        spinSystems,
        exchangeableProtons,
        hasAldehydeProton: h1Environments.some((e) => e.shiftPpm >= 9.3 && e.shiftPpm <= 10.3),
        hasCarboxylicAcidProton: h1Environments.some((e) => e.shiftPpm >= 10.5),
        hasExchangeableProton: exchangeableProtons.length > 0,
        hasMethoxyGroup: h1Environments.some((e) => e.shiftPpm >= 3.65 && e.shiftPpm <= 4.0 && (e.integration ?? 3) === 3),
        hasAcetoxyOrMethylKetone: h1Environments.some((e) => e.shiftPpm >= 1.9 && e.shiftPpm <= 2.65 && (e.integration ?? 3) === 3),
        summaryNotes: [h1SymmetrySummary],
      };
    }

    if (spectra["13C_NMR"]) {
      activeModalities.push("13C_NMR");
      const c13Res = NMRAnalysisEngine.analyzeExperimental13CNMR(
        spectra["13C_NMR"],
        effectiveStructureContext
      );
      c13Summary = c13Res.summary;
      independentConstraints["13C_NMR"] = c13Res.structuralConstraints;
      if (c13Res.structuralConstraints.requiredFunctionalGroups) {
        requiredFG.push(
          ...c13Res.structuralConstraints.requiredFunctionalGroups
            .filter(
              (g) =>
                !formulaForbidN ||
                !["Amine", "Amide", "Nitrile", "Nitro", "Heteroaromatic"].includes(
                  g.groupFamily
                )
            )
            .map((g) => ({
              ...g,
              groupName: g.groupName || g.label,
              notes: g.reasoning || g.observedSignal || g.label,
            }))
        );
      }
      if (c13Res.structuralConstraints.evidence) {
        evidencePool.push(
          ...c13Res.structuralConstraints.evidence.map((e, idx) => ({
            ...e,
            id: e.id || `ev-c13-${idx}`,
          }))
        );
      }

      const extEnvs: ExtendedCarbonEnvironmentItem[] = c13Summary.environments.map(
        (env) => ({
          peakId: env.id,
          shift: env.shiftPpm,
          shiftPpm: env.shiftPpm,
          deptType: env.deptType,
          regionLabel: env.regionCategory,
          environmentType:
            env.shiftPpm >= 166
              ? "CARBONYL_C"
              : env.shiftPpm >= 100
                ? "AROMATIC_C"
                : "ALIPHATIC_C",
          candidateFragments: [env.assignment],
          confidence: env.confidence >= 85 ? "HIGH" : "MEDIUM",
          isSolvent: false,
        })
      );

      carbonSummary = {
        observedSignalCount: c13Summary.observedSignalCount,
        totalUniqueCarbonSignaling: c13Summary.observedSignalCount,
        carbonylCount: extEnvs.filter((e) => e.environmentType === "CARBONYL_C").length,
        aromaticCount: extEnvs.filter((e) => e.environmentType === "AROMATIC_C").length,
        aliphaticCount: extEnvs.filter((e) => e.environmentType === "ALIPHATIC_C").length,
        expectedTheoreticalEnvironments: c13Summary.expectedTheoreticalEnvironments,
        environments: extEnvs,
        symmetryAssessment: c13Summary.symmetryAndOverlapNote,
        symmetryAndOverlapNote: c13Summary.symmetryAndOverlapNote,
        limitationsNote: c13Summary.limitationsNote,
      };
    }

    if (spectra.MS) {
      activeModalities.push("MS");
      const msRes = MSAnalysisEngine.analyzeExperimentalMS(
        spectra.MS,
        expectedStructure
      );
      msAnalysis = msRes.analysis;
      independentConstraints.MS = msRes.structuralConstraints;
      if (msRes.structuralConstraints.evidence) {
        evidencePool.push(
          ...msRes.structuralConstraints.evidence.map((e, idx) => ({
            ...e,
            id: e.id || `ev-ms-${idx}`,
          }))
        );
      }

      if (msAnalysis) {
        const mw = msAnalysis.estimatedNominalMw;
        const parity: "ODD" | "EVEN" | "UNKNOWN" =
          mw !== null ? (mw % 2 === 1 ? "ODD" : "EVEN") : "UNKNOWN";

        msSummary = {
          msType: msAnalysis.msType,
          ionizationMode: msAnalysis.ionization,
          molecularIonMz: msAnalysis.molecularIonCandidateMz,
          estimatedMolecularIonMz: msAnalysis.estimatedNominalMw,
          basePeakMz: msAnalysis.basePeakMz,
          nitrogenRuleAssessment: {
            parity,
            explanation:
              parity === "ODD"
                ? `標稱分子量 ${mw} Da 為奇數，依據氮規則提示含有奇數個氮原子 (如 1N 醯胺/胺/吡啶)。`
                : parity === "EVEN"
                  ? `標稱分子量 ${mw} Da 為偶數，符合零氮或偶數氮原子組成。`
                  : "母離子未明確檢出。",
          },
          detectedIons: msAnalysis.fragments.map((f, idx) => ({
            id: `ms-ion-${idx}`,
            mz: f.mz,
            relativeIntensity: f.relativeIntensity,
            ionType:
              f.ionType === "分子離子 [M]+•"
                ? "M+•"
                : f.ionType === "質子化分子離子 [M+H]+"
                  ? "[M+H]+"
                  : f.ionType === "基峰 Base Peak"
                    ? "BasePeak"
                    : f.ionType === "同位素峰 Isotope Peak"
                      ? "Isotope"
                      : "Fragment",
            ionRole:
              f.ionType === "分子離子 [M]+•"
                ? "MOLECULAR_ION"
                : f.ionType === "質子化分子離子 [M+H]+"
                  ? "QUASI_MOLECULAR_ION"
                  : f.ionType === "基峰 Base Peak"
                    ? "BASE_PEAK"
                    : "CHARACTERISTIC_FRAGMENT",
            label: `${f.ionType} — ${f.formulaSuggestion} (${f.cleavagePathway})`,
            proposedFormulaOrIdentity: f.formulaSuggestion,
            confidence: f.confidence >= 85 ? "HIGH" : "MEDIUM",
            reasoning: f.cleavagePathway,
          })),
          neutralLosses: msAnalysis.msmsPathways.map((p) => ({
            fromMz: p.precursorMz,
            toMz: p.productMz,
            lossMass: p.neutralLossDa,
            candidateFormula: p.neutralLossFormula,
            proposedNeutralFormula: p.neutralLossFormula,
            chemicalMeaning: p.cleavageMechanism,
            structuralImplication: p.candidateCompatibility,
            chemicalImplication: p.cleavageMechanism,
            confidence: p.likelihood === "高可能性候選路徑" ? "HIGH" : "MEDIUM",
          })),
          isotopeReport: {
            molecularIonMz: msAnalysis.molecularIonCandidateMz,
            mPlus1IntensityPercent: null,
            mPlus2IntensityPercent: null,
            estimatedCarbonCount:
              msAnalysis.isotopePatternSummary.estimatedCarbonCountFromMPlus1,
            halogenHint: msAnalysis.isotopePatternSummary.hasBromineSignature
              ? "BROMINE_1"
              : msAnalysis.isotopePatternSummary.hasChlorineSignature
                ? "CHLORINE_1"
                : "NONE",
            nitrogenRuleParity:
              parity === "ODD"
                ? "ODD_NITROGEN"
                : parity === "EVEN"
                  ? "EVEN_OR_ZERO_NITROGEN"
                  : "UNKNOWN",
            notes: [msAnalysis.isotopePatternSummary.description],
          },
          summaryNotes: [msAnalysis.isotopePatternSummary.description],
        };
      }
    }

    const h1Const = independentConstraints["1H_NMR"];
    const irConst = independentConstraints.IR;
    const c13Const = independentConstraints["13C_NMR"];
    const msConst = independentConstraints.MS;

    const minDbe = Math.max(
      irConst?.dbe?.minDbe || 0,
      h1Const?.dbe?.minDbe || 0,
      c13Const?.dbe?.minDbe || 0,
      msConst?.molecularFormula?.candidates?.[0]?.dbe || 0
    );

    const aromaticHint =
      h1Const?.aromaticity?.substitutionPatternHint ||
      irConst?.aromaticity?.substitutionPatternHint;

    const paraDoublets = h1Environments.filter(
      (e) =>
        e.shiftPpm >= 6.4 &&
        e.shiftPpm <= 8.4 &&
        e.multiplicity === "d" &&
        (e.integration ?? 0) === 2
    );

    let aromaticSubstitutionPattern: string | null = null;
    if (aromaticHint === "1,4-para" || paraDoublets.length >= 2) {
      aromaticSubstitutionPattern = "PARA_DISUBSTITUTED";
      if (protonSummary && !protonSummary.aromaticPatternHint.includes("對二取代")) {
        protonSummary.aromaticPatternHint = `1,4-對二取代苯環 (AA'BB' 對稱雙二重峰) — ${protonSummary.aromaticPatternHint}`;
      }
    } else if (aromaticHint === "1,3-meta") {
      aromaticSubstitutionPattern = "META_DISUBSTITUTED";
      if (protonSummary && !protonSummary.aromaticPatternHint.includes("間二取代")) {
        protonSummary.aromaticPatternHint = `1,3-間二取代苯環 (1H 孤立窄訊號 + 3H 偶合系統) — ${protonSummary.aromaticPatternHint}`;
      }
    } else if (
      aromaticHint === "1,2-ortho" ||
      h1Environments.filter((e) => e.shiftPpm >= 6.8 && e.shiftPpm <= 8.3).length === 4
    ) {
      aromaticSubstitutionPattern = "ORTHO_DISUBSTITUTED";
      if (protonSummary && !protonSummary.aromaticPatternHint.includes("鄰二取代")) {
        protonSummary.aromaticPatternHint = `1,2-鄰二取代苯環 (非對稱四組芳氫) — ${protonSummary.aromaticPatternHint}`;
      }
    } else if (aromaticHint === "monosubstituted") {
      aromaticSubstitutionPattern = "MONOSUBSTITUTED";
      if (protonSummary && !protonSummary.aromaticPatternHint.includes("單取代")) {
        protonSummary.aromaticPatternHint = `單取代苯環 (5H) — ${protonSummary.aromaticPatternHint}`;
      }
    }

    // 對 ¹H NMR 執行積分語意分析（區分原始值、相對比、已正規化絕對氫數、部分積分與可交換氫）
    let h1IntegrationSemantics: H1NMRIntegrationSummary | undefined;
    if (spectra["1H_NMR"] && protonSummary) {
      const isImgH1 =
        spectra["1H_NMR"].sourceType === "IMAGE_EXPERIMENTAL" ||
        Boolean(spectra["1H_NMR"].digitizedFromImage);
      const hasOverlapH1 = (spectra["1H_NMR"].peaks || []).some(
        (pk) =>
          pk.userClassification === "OVERLAP" ||
          pk.classificationTag === "OVERLAP"
      );
      h1IntegrationSemantics =
        ChemicalHardConstraintValidator.analyzeH1NMRIntegrationSemantics(
          h1Environments,
          isImgH1,
          hasOverlapH1,
          parsedUserFormula?.atomCounts || null,
          spectra["1H_NMR"].nmrSolvent
        );
      protonSummary.integrationAnalysis = h1IntegrationSemantics;
      totalIntegratedProtons = h1IntegrationSemantics.inferredTotalProtons;
      protonSummary.totalIntegratedProtons = totalIntegratedProtons ?? 0;
      if (h1IntegrationSemantics.uncertaintyReasons.length > 0) {
        protonSummary.summaryNotes.push(
          ...h1IntegrationSemantics.uncertaintyReasons
        );
      }
    }

    if (parsedUserFormula) {
      evidencePool.push({
        id: "ev-user-formula-ihd",
        modality: "USER",
        canonicalModality: "FORMULA",
        signalPosition: parsedUserFormula.exactMass,
        unit: "Da",
        description: `使用者輸入化學式 ${parsedUserFormula.cleanFormula} (Exact Mass = ${parsedUserFormula.exactMass.toFixed(4)} Da, IHD = ${parsedUserFormula.dbe})`,
        confidence: 99,
      });
    } else if (userFormulaValidation && !userFormulaValidation.isValid) {
      evidencePool.push({
        id: "ev-user-formula-invalid",
        modality: "USER",
        canonicalModality: "FORMULA",
        description: `使用者輸入化學式「${rawUserFormulaStr}」驗證未通過：${userFormulaValidation.validationErrors.join("；")}`,
        confidence: 0,
      });
    }

    let msmsAnalysis: ReturnType<typeof MSMSFragmentationEngine.analyze> | null = null;
    if (rawMsmsSpec) {
      const msmsCalibratedPeaks = (rawMsmsSpec.peaks || []).filter((pk) => {
        if (pk.isCalibrated === false) {
          uncalibratedSignals.push({
            modality: "MS/MS",
            id: pk.id,
            pixelX: pk.pixelX,
            pixelY: pk.pixelY,
            label: pk.assignment,
          });
          return false;
        }
        return true;
      });
      msmsAnalysis = MSMSFragmentationEngine.analyze({
        ...rawMsmsSpec,
        peaks: msmsCalibratedPeaks,
      });
      if (msmsAnalysis.structuralConstraints.requiredFunctionalGroups) {
        requiredFG.push(
          ...msmsAnalysis.structuralConstraints.requiredFunctionalGroups.map((g) => ({
            ...g,
            groupName: g.groupName || g.label,
            notes: g.reasoning || g.observedSignal || g.label,
          }))
        );
      }
      if (msmsAnalysis.structuralConstraints.requiredSubstructures) {
        requiredSubstructures.push(
          ...msmsAnalysis.structuralConstraints.requiredSubstructures
        );
      }
      if (msmsAnalysis.structuralConstraints.evidence) {
        evidencePool.push(
          ...msmsAnalysis.structuralConstraints.evidence.map((e, idx) => ({
            ...e,
            id: e.id || `ev-msms-${idx}`,
            canonicalModality: "MSMS" as const,
          }))
        );
      }
    }

    let tofSimsAnalysis: ReturnType<typeof ToFSIMSScientificEngine.analyze> | null = null;
    if (rawTofSimsSpec) {
      const tofCalibratedPeaks = (rawTofSimsSpec.peaks || []).filter((pk) => {
        if (pk.isCalibrated === false) {
          uncalibratedSignals.push({
            modality: "ToF-SIMS",
            id: pk.id,
            pixelX: pk.pixelX,
            pixelY: pk.pixelY,
            label: pk.assignment,
          });
          return false;
        }
        return true;
      });
      tofSimsAnalysis = ToFSIMSScientificEngine.analyze({
        ...rawTofSimsSpec,
        peaks: tofCalibratedPeaks,
      });
      if (tofSimsAnalysis.structuralConstraints.requiredSubstructures) {
        requiredSubstructures.push(
          ...tofSimsAnalysis.structuralConstraints.requiredSubstructures
        );
      }
      if (tofSimsAnalysis.structuralConstraints.evidence) {
        evidencePool.push(
          ...tofSimsAnalysis.structuralConstraints.evidence.map((e, idx) => ({
            ...e,
            id: e.id || `ev-tofsims-${idx}`,
            canonicalModality: "TOF_SIMS" as const,
          }))
        );
      }
    }

    const allFunctionalGroups: FunctionalGroupConstraint[] = [
      ...requiredFG.map((g) => ({
        ...g,
        groupName: g.groupName || g.label,
        notes: g.notes || g.reasoning || g.observedSignal || g.label,
      })),
      ...excludedFG.map((g) => ({
        ...g,
        groupName: g.groupName || g.label,
        notes: g.notes || g.reasoning || g.observedSignal || g.label,
      })),
    ];

    const estMw = parsedUserFormula
      ? parsedUserFormula.nominalMass
      : userFormulaValidation && !userFormulaValidation.isValid
        ? null
        : msAnalysis?.estimatedNominalMw ??
          (msmsAnalysis?.physicsModel.precursorIon
            ? Math.round(
                msmsAnalysis.physicsModel.precursorIon.mz -
                  (msmsAnalysis.physicsModel.precursorIon.adductType === "[M+H]+"
                    ? 1
                    : msmsAnalysis.physicsModel.precursorIon.adductType === "[M-H]-"
                      ? -1
                      : 0)
              )
            : null);

    const nitrogenParity: "ODD" | "EVEN" | "UNKNOWN" = parsedUserFormula
      ? parsedUserFormula.nitrogenParity
      : estMw !== null
        ? estMw % 2 === 1
          ? "ODD"
          : "EVEN"
        : "UNKNOWN";

    const effectiveMinDbe = parsedUserFormula
      ? parsedUserFormula.dbe
      : minDbe;

    // Section C: 使用者明確輸入有效分子式時，將其鎖定為唯一權威目標，不混入不符該分子式的 MS 推估分子式；
    // 若使用者輸入之分子式格式無效或不支援，則清空分子式候選並停止依賴該分子式推論。
    // User formula is a hard composition input, never a fabricated mass measurement.
    const explicitFormulaCandidates = parsedUserFormula
      ? msConst?.molecularFormula?.candidates?.filter(c=>c.formula===parsedUserFormula.cleanFormula) ?? []
      : userFormulaValidation && !userFormulaValidation.isValid ? [] : msConst?.molecularFormula?.candidates;

    const contributingSources: StructuralConstraints["contributingSources"] = [
      ...activeModalities,
    ];
    if (
      rawMsmsSpec &&
      (rawMsmsSpec.peaks || []).some((p) => p.isCalibrated !== false)
    ) {
      contributingSources.push("MS/MS");
    }
    if (
      rawTofSimsSpec &&
      (rawTofSimsSpec.peaks || []).some((p) => p.isCalibrated !== false)
    ) {
      contributingSources.push("ToF-SIMS");
    }

    // Phase 3 Section 六、八: Cross-Modality Carbonyl, OH/NH Deuterium-Exchange & Heteroaromatic Joint Synthesis
    const crossModalNotes: string[] = [];
    const hasIrOh = irFindings.some(
      (f) =>
        (f.family === "Alcohol" ||
          f.family === "Phenol" ||
          f.groupFamily === "Alcohol" ||
          f.groupFamily === "Phenol") &&
        (f.status === "PRESENT" || f.status === "POSSIBLE")
    );
    const hasIrNitro = irFindings.some(
      (f) => (f.family === "Nitro" || f.groupFamily === "Nitro") && f.status === "PRESENT"
    );
    const h1HasExchangeableOh = h1Environments.some((e) => e.isExchangeable);
    const h1Solvent = spectra["1H_NMR"]?.nmrSolvent || "CDCl3";

    if (hasIrOh && spectra["1H_NMR"] && !h1HasExchangeableOh) {
      crossModalNotes.push(
        `IR 觀測到明確羥基吸收帶 (O-H stretch)，雖 ¹H NMR (於 ${h1Solvent}) 未直接檢出獨立可交換 OH 峰（可能因 H/D 同位素交換消失或與芳環/水峰重疊），跨光譜協同仍支持含 -OH (醇/酚) 結構，不視為缺氫矛盾。`
      );
    }

    const irCarbonylAbsent = irConst?.carbonyl?.status === "ABSENT";
    const c13CarbonylAbsent =
      Boolean(spectra["13C_NMR"]) &&
      c13Summary.environments.length > 0 &&
      !c13Summary.environments.some((c) => c.shiftPpm >= 162);

    let synthesizedCarbonyl =
      irConst?.carbonyl || c13Const?.carbonyl || h1Const?.carbonyl;

    if (irCarbonylAbsent && (c13CarbonylAbsent || !spectra["13C_NMR"])) {
      synthesizedCarbonyl = {
        status: "ABSENT",
        allowedSubtypes: [],
        excludedSubtypes: ["Aldehyde", "Ketone", "Ester", "Carboxylic acid", "Amide"],
        supportingSignals: [
          ...(irConst?.carbonyl?.supportingSignals || ["IR 1615–1850 cm⁻¹ 無 C=O 強吸收"]),
          ...(c13CarbonylAbsent ? ["¹³C NMR 162–220 ppm 無羰基碳訊號"] : []),
        ],
        confidence: 92,
      };
      // Remove speculative 1H 2.0-2.9 ppm Ketone / Ester hypotheses when IR & 13C prove C=O is absent (e.g., benzylic Ar-CH3 at 2.2-2.5 ppm)
      for (let i = requiredFG.length - 1; i >= 0; i--) {
        if (
          requiredFG[i].sourceModality === "1H_NMR" &&
          ["Ketone", "Ester", "Carbonyl"].includes(requiredFG[i].groupFamily)
        ) {
          requiredFG.splice(i, 1);
        }
      }
    } else if (synthesizedCarbonyl && (irConst?.carbonyl || c13Const?.carbonyl)) {
      const hasAldH1 = h1Environments.some(
        (e) => e.shiftPpm >= 9.3 && e.shiftPpm <= 10.6
      );
      const hasAcidH1 = h1Environments.some(
        (e) => e.shiftPpm > 10.6 && e.shiftPpm <= 14.0
      );
      const hasKetAldC13 = c13Summary.environments.some(
        (c) => c.shiftPpm >= 188 && c.shiftPpm <= 220
      );
      const hasEsterAcidC13 = c13Summary.environments.some(
        (c) => c.shiftPpm >= 164 && c.shiftPpm < 188
      );
      const hasIrAcidOH = irFindings.some(
        (f) =>
          (f.groupFamily === "Carboxylic acid" || f.family === "Carboxylic acid") &&
          f.status === "PRESENT"
      );
      const hasIrEsterCO = irFindings.some(
        (f) =>
          (f.groupFamily === "Ester" || f.family === "Ester") &&
          f.status === "PRESENT"
      );

      if (hasKetAldC13) {
        synthesizedCarbonyl = {
          status: "PRESENT",
          allowedSubtypes:
            spectra["1H_NMR"] && h1Environments.length > 0
              ? hasAldH1
                ? ["Aldehyde"]
                : ["Ketone"]
              : ["Ketone", "Aldehyde"],
          excludedSubtypes:
            spectra["1H_NMR"] && h1Environments.length > 0 && !hasAldH1
              ? ["Aldehyde", "Carboxylic acid"]
              : ["Carboxylic acid"],
          supportingSignals: [
            ...(irConst?.carbonyl?.supportingSignals || []),
            ...(c13Const?.carbonyl?.supportingSignals || []),
          ],
          confidence: 92,
        };
      } else if (hasEsterAcidC13) {
        const sub: ("Aldehyde" | "Ketone" | "Ester" | "Carboxylic acid" | "Amide")[] = [];
        if (hasIrAcidOH || hasAcidH1) sub.push("Carboxylic acid");
        if (hasIrEsterCO || !hasIrAcidOH) sub.push("Ester");
        if (!formulaForbidN && !hasIrAcidOH) sub.push("Amide");
        synthesizedCarbonyl = {
          status: "PRESENT",
          allowedSubtypes: sub.length > 0 ? sub : ["Ester", "Carboxylic acid"],
          excludedSubtypes: ["Aldehyde", "Ketone"],
          supportingSignals: [
            ...(irConst?.carbonyl?.supportingSignals || []),
            ...(c13Const?.carbonyl?.supportingSignals || []),
          ],
          confidence: 90,
        };
      }
    }

    // Phase 3 Section 三: Cross-Modality Anti-Bias on Heteroaromatic (Pyridine) Constraint
    // 1. If formula has N = 0, heteroaromatic is strictly undefined (and N is EXCLUDED in heteroAtoms).
    // 2. If IR confirms Nitro (-NO2) or if 13C NMR shows that 145–162 ppm carbons are strictly quaternary (DEPT = C, e.g. C-NO2 or C-O) with no downfield CH,
    //    do NOT lock heteroaromatic status to PRESENT!
    let synthesizedHeteroaromatic = formulaForbidN
      ? undefined
      : h1Const?.heteroaromaticConstraints || c13Const?.heteroaromaticConstraints;

    if (synthesizedHeteroaromatic && !formulaForbidN) {
      const c13DownfieldHasOnlyQuaternaryC =
        Boolean(spectra["13C_NMR"]) &&
        c13Summary.environments.length > 0 &&
        c13Summary.environments
          .filter((c) => c.shiftPpm >= 145 && c.shiftPpm <= 162)
          .every((c) => c.deptType === "C");
      const formulaNCount = parsedUserFormula?.atomCounts?.N;

      if (
        (hasIrNitro && (formulaNCount === undefined || formulaNCount <= 1)) ||
        c13DownfieldHasOnlyQuaternaryC
      ) {
        synthesizedHeteroaromatic = {
          ...synthesizedHeteroaromatic,
          status: "POSSIBLE",
          confidence: Math.min(65, synthesizedHeteroaromatic.confidence),
        };
      }
    }

    const constraints: StructuralConstraints = {
      source: "MULTI_MODAL",
      contributingSources,
      crossModalNotes: crossModalNotes.length > 0 ? crossModalNotes : undefined,
      formulaNotSpecifiedByUser: !rawUserFormulaStr,
      userSuppliedFormulaValidation: userFormulaValidation,
      h1IntegrationSemantics,
      heteroaromatic: synthesizedHeteroaromatic,
      heteroaromaticConstraints: synthesizedHeteroaromatic,
      heteroAtoms: formulaForbidN
        ? [
            {
              element: "N",
              status: "EXCLUDED",
              supportingObservation: "使用者提供的分子式 N = 0",
              supportingSignals: ["分子式 N = 0"],
              confidence: 99,
            },
          ]
        : undefined,
      userSuppliedFormula: parsedUserFormula
        ? {
            rawInput: rawUserFormulaStr,
            normalizedFormula: parsedUserFormula.cleanFormula,
            atomCounts: parsedUserFormula.atomCounts,
            exactMass: parsedUserFormula.exactMass,
            nominalMass: parsedUserFormula.nominalMass,
            ihd: parsedUserFormula.dbe,
            nitrogenRuleConstraint:
              parsedUserFormula.nitrogenParity === "ODD"
                ? "含奇數個氮原子 (Odd N)"
                : "含零或偶數個氮原子 (Even/Zero N)",
            isValid: true,
            isSupported: true,
            validationErrors: [],
            validationWarnings: userFormulaValidation?.validationWarnings || [],
            sourceType: "USER_FORMULA_INPUT",
          }
        : userFormulaValidation
          ? {
              rawInput: rawUserFormulaStr,
              normalizedFormula: userFormulaValidation.computedFormula || rawUserFormulaStr,
              atomCounts: userFormulaValidation.atomCounts,
              exactMass: userFormulaValidation.exactMass || 0,
              nominalMass: userFormulaValidation.nominalMass || 0,
              ihd: userFormulaValidation.dbe ?? 0,
              isValid: false,
              isSupported: userFormulaValidation.isSupported,
              validationErrors: userFormulaValidation.validationErrors,
              validationWarnings: userFormulaValidation.validationWarnings,
              sourceType: "USER_FORMULA_INPUT",
            }
          : undefined,
      userChemicalNotes: extraInput?.chemicalNotes?.trim() || undefined,
      molecularFormula: parsedUserFormula
        ? {
            candidates: explicitFormulaCandidates || [],
            lockedFormula: parsedUserFormula.cleanFormula,
            exactMass: parsedUserFormula.exactMass,
            nominalMass: parsedUserFormula.nominalMass,
            confidence: 99,
          }
        : userFormulaValidation && !userFormulaValidation.isValid
          ? {
              candidates: [],
              lockedFormula: rawUserFormulaStr,
              confidence: 0,
            }
          : msConst?.molecularFormula,
      exactMass: msConst?.exactMass,
      dbe: {
        minDbe: effectiveMinDbe,
        maxDbe: parsedUserFormula ? parsedUserFormula.dbe : effectiveMinDbe + 2,
        allowsAromaticRing: Boolean(
          (parsedUserFormula && parsedUserFormula.dbe >= 4) ||
            irConst?.dbe?.allowsAromaticRing ||
            h1Const?.dbe?.allowsAromaticRing ||
            c13Const?.dbe?.allowsAromaticRing
        ),
        allowsCarbonylOrUnsaturation: Boolean(
          (parsedUserFormula && parsedUserFormula.dbe >= 1) ||
            irConst?.dbe?.allowsCarbonylOrUnsaturation ||
            h1Const?.dbe?.allowsCarbonylOrUnsaturation ||
            c13Const?.dbe?.allowsCarbonylOrUnsaturation
        ),
        confidence: parsedUserFormula ? 98 : 88,
      },
      requiredFunctionalGroups: requiredFG,
      excludedFunctionalGroups: excludedFG,
      functionalGroups: allFunctionalGroups,
      substructures: nmrSubstructures,
      requiredSubstructures,
      aromaticity: h1Const?.aromaticity || irConst?.aromaticity || c13Const?.aromaticity,
      aromaticSubstitutionPattern,
      unsaturationEstimateRange: parsedUserFormula
        ? [parsedUserFormula.dbe, parsedUserFormula.dbe]
        : [effectiveMinDbe, Math.max(effectiveMinDbe + 2, 6)],
      estimatedMolecularWeight: estMw,
      nitrogenRuleParity: nitrogenParity,
      estimatedProtonCount:
        totalIntegratedProtons ??
        (parsedUserFormula ? parsedUserFormula.atomCounts.H || null : null),
      estimatedCarbonEnvironmentCount:
        c13Summary.observedSignalCount > 0 ? c13Summary.observedSignalCount : null,
      symmetryHint: c13Summary.symmetryAndOverlapNote,
      carbonyl: synthesizedCarbonyl,
      protonEnvironments: h1Const?.protonEnvironments,
      protonNMR: h1Const?.protonNMR,
      carbonEnvironments: c13Const?.carbonEnvironments,
      carbonNMR: c13Const?.carbonNMR,
      connectivityConstraints: h1Const?.connectivityConstraints,
      isotopeConstraints: msConst?.isotopeConstraints,
      fragmentationConstraints: msConst?.fragmentationConstraints,
      confidence: 88,
      evidence: evidencePool,
    };

    const unifiedEvidence = EvidenceAccumulator.extractUnifiedEvidence(
      {
        ...spectra,
        ...(rawMsmsSpec ? { MSMS: rawMsmsSpec } : {}),
        ...(rawTofSimsSpec ? { TOF_SIMS: rawTofSimsSpec } : {}),
      },
      effectiveStructureContext
    );
    const knownConstraintsSummary: string[] = [];
    if (parsedUserFormula) {
      knownConstraintsSummary.push(
        `正式分子式輸入 (硬限制)：${parsedUserFormula.cleanFormula} (MW=${parsedUserFormula.nominalMass} Da, IHD/DBE=${parsedUserFormula.dbe})`
      );
    } else if (userFormulaValidation && !userFormulaValidation.isValid) {
      knownConstraintsSummary.push(
        `分子式輸入驗證失敗 (${rawUserFormulaStr})：${userFormulaValidation.validationErrors.join("；")}`
      );
    } else {
      knownConstraintsSummary.push(
        "分子式狀態：使用者未指定目標分子式（由實驗光譜證據推估）"
      );
      if (estMw !== null) {
        knownConstraintsSummary.push(`推估標稱分子量 MW ≈ ${estMw} Da (${nitrogenParity})`);
      }
    }
    if (totalIntegratedProtons !== null) {
      knownConstraintsSummary.push(`¹H NMR 總積分 (已正規化絕對氫數) ${totalIntegratedProtons}H`);
    } else if (h1IntegrationSemantics && h1IntegrationSemantics.integralDataMode !== "NOT_PROVIDED") {
      knownConstraintsSummary.push(
        `¹H NMR 積分型態：${h1IntegrationSemantics.integralDataMode} (${h1IntegrationSemantics.normalizedRatioSummary})`
      );
    }
    if (c13Summary.observedSignalCount > 0) {
      knownConstraintsSummary.push(`¹³C NMR ${c13Summary.observedSignalCount} 組碳訊號`);
    }
    if (aromaticSubstitutionPattern) {
      knownConstraintsSummary.push(`芳環取代型態：${aromaticSubstitutionPattern}`);
    }
    for (const fg of requiredFG) {
      knownConstraintsSummary.push(`必備官能基：${fg.groupName || fg.label}`);
    }
    if (extraInput?.chemicalNotes?.trim()) {
      knownConstraintsSummary.push(`其他化學證據：${extraInput.chemicalNotes.trim()}`);
    }

    const bundle: IntegratedAnalysisBundle = {
      scientificSources: {...spectra, ...(rawMsmsSpec ? {"MS/MS":rawMsmsSpec}:{}), ...(rawTofSimsSpec ? {"ToF-SIMS":rawTofSimsSpec}:{})},
      irFindings,
      h1Environments,
      h1SymmetrySummary,
      totalIntegratedProtons,
      c13Summary,
      msAnalysis,
      protonSummary,
      carbonSummary,
      msSummary,
      msmsAnalysis,
      tofSimsAnalysis,
      calibratedSpectra: spectra,
      uncalibratedSignals,
      userSuppliedFormula: parsedUserFormula?.cleanFormula,
      userChemicalNotes: extraInput?.chemicalNotes?.trim() || undefined,
      constraints,
      independentConstraints,
      evidencePool,
      unifiedEvidence,
      knownConstraintsSummary,
      activeModalities,
    };
    bundle.scientificEvidence=buildScientificEvidence(bundle);
    return bundle;
  }
}
import {buildScientificEvidence,uniqueObservations,type ScientificEvidence} from './scientificEngines/evidenceLedger';
