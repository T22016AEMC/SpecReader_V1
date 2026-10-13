import {neutralMassFromIon} from "./ionMass";
import {
  ChemicalFeatureEvidence,
  EvidenceProvenance,
  ExperimentalSpectrumData,
  FormulaCandidate,
  MassFeature,
  SpectrumScientificEngine,
  StructuralConstraints,
} from "../../types/spectrum";
import { ChemistryEngine } from "../chemistryEngine";
import { MSAnalysisEngine } from "../msEngine";

const MONOISOTOPIC_MASS_TABLE: Record<string, number> = {
  C: 12.0,
  H: 1.0078250322,
  N: 14.0030740044,
  O: 15.9949146196,
  S: 31.9720711744,
  Cl: 34.968852682,
  Br: 78.9183376,
  Si: 27.976926535,
  F: 18.998403163,
  P: 30.973761998,
  I: 126.9044719,
};

const AVERAGE_ATOMIC_WEIGHT_TABLE: Record<string, number> = {
  C: 12.011,
  H: 1.008,
  N: 14.007,
  O: 15.999,
  S: 32.06,
  Cl: 35.45,
  Br: 79.904,
  Si: 28.085,
  F: 18.998,
  P: 30.974,
  I: 126.904,
};

/**
 * ExactMassCalculator (V5 Mass Spectrometry Scientific Engine)
 * Explicitly distinguishes monoisotopic mass from average molecular mass.
 */
export class ExactMassCalculator {
  static calculateMonoisotopicMass(
    formulaOrCounts: string | Record<string, number>
  ): number {
    const counts =
      typeof formulaOrCounts === "string"
        ? ChemistryEngine.parseFormulaCounts(formulaOrCounts)
        : formulaOrCounts;
    let sum = 0;
    for (const [el, count] of Object.entries(counts)) {
      const m = MONOISOTOPIC_MASS_TABLE[el] ?? 0;
      sum += m * count;
    }
    return Number(sum.toFixed(6));
  }

  static calculateAverageMolecularMass(
    formulaOrCounts: string | Record<string, number>
  ): number {
    const counts =
      typeof formulaOrCounts === "string"
        ? ChemistryEngine.parseFormulaCounts(formulaOrCounts)
        : formulaOrCounts;
    let sum = 0;
    for (const [el, count] of Object.entries(counts)) {
      const m = AVERAGE_ATOMIC_WEIGHT_TABLE[el] ?? 0;
      sum += m * count;
    }
    return Number(sum.toFixed(4));
  }

  static calculateDBE(
    formulaOrCounts: string | Record<string, number>
  ): number {
    const counts =
      typeof formulaOrCounts === "string"
        ? ChemistryEngine.parseFormulaCounts(formulaOrCounts)
        : formulaOrCounts;
    return ChemistryEngine.calculateDBE(counts);
  }

  static resolveAdductToNeutralMonoisotopicMass(
    observedMz: number,
    adductType:
      | "neutral molecule [M]+•"
      | "[M+H]+"
      | "[M-H]-"
      | "[M+Na]+"
      | "[M+NH4]+"
  ): number {
    return neutralMassFromIon(observedMz, adductType === "neutral molecule [M]+•" ? "[M]+•" : adductType);

  }
}

export interface MSPhysicsModel {
  massFeatures: MassFeature[];
  formulaCandidates: FormulaCandidate[];
  adductModel: {
    detectedAdduct:
      | "neutral molecule [M]+•"
      | "[M+H]+"
      | "[M-H]-"
      | "[M+Na]+"
      | "[M+NH4]+";
    supportedAdducts: (
      | "neutral molecule [M]+•"
      | "[M+H]+"
      | "[M-H]-"
      | "[M+Na]+"
      | "[M+NH4]+"
    )[];
  };
  isotopeEnvelope: {
    elementsTracked: ("C" | "H" | "N" | "O" | "S" | "Cl" | "Br")[];
    hasChlorineSignature: boolean;
    hasBromineSignature: boolean;
    hasSulfurOrSiliconSignature: boolean;
  };
}

/**
 * Independent Mass Spectrometry Scientific Engine (V5)
 */
export class MassSpectrometryEngine
  implements SpectrumScientificEngine<MSPhysicsModel>
{
  readonly engineName = "MassSpectrometryEngine";
  readonly engineVersion = "1.0.0-scientific-foundation";
  readonly modality = "MS" as const;
  readonly scientificTheoryBasis =
    "Ion Formation, Monoisotopic Mass-to-Charge (m/z), Adduct Deconvolution, and Isotopic Envelope Analysis";

  static createProvenance(
    confidence: number,
    method: "THEORETICAL" | "EMPIRICAL" = "THEORETICAL"
  ): EvidenceProvenance {
    const normConf = Number(Math.max(0, Math.min(1, confidence)).toFixed(2));
    return {
      source: "MS",
      model: "MassSpectrometryEngine",
      modelVersion: "1.0.0-scientific-foundation",
      basis:
        "ion m/z, monoisotopic exact mass, DBE valence theorem, and natural isotope distribution",
      method,
      isTheoretical: method === "THEORETICAL",
      isEmpirical: method === "EMPIRICAL",
      isReferenceBased: false,
      isHeuristic: false,
      isQuantumBackend: false,
      confidence: normConf,
    };
  }

  extractPhysicsModel(spectrum?: ExperimentalSpectrumData): MSPhysicsModel {
    const supportedAdducts: (
      | "neutral molecule [M]+•"
      | "[M+H]+"
      | "[M-H]-"
      | "[M+Na]+"
      | "[M+NH4]+"
    )[] = [
      "neutral molecule [M]+•",
      "[M+H]+",
      "[M-H]-",
      "[M+Na]+",
      "[M+NH4]+",
    ];

    if (
      !spectrum ||
      spectrum.digitizationFailed ||
      !spectrum.validation.isValid ||
      spectrum.peaks.length === 0
    ) {
      return {
        massFeatures: [],
        formulaCandidates: [],
        adductModel: {
          detectedAdduct: "neutral molecule [M]+•",
          supportedAdducts,
        },
        isotopeEnvelope: {
          elementsTracked: ["C", "H", "N", "O", "S", "Cl", "Br"],
          hasChlorineSignature: false,
          hasBromineSignature: false,
          hasSulfurOrSiliconSignature: false,
        },
      };
    }

    const msRes = MSAnalysisEngine.analyzeExperimentalMS(spectrum);
    const analysis = msRes.analysis;
    if (!analysis) {
      return {
        massFeatures: [],
        formulaCandidates: [],
        adductModel: {
          detectedAdduct: "neutral molecule [M]+•",
          supportedAdducts,
        },
        isotopeEnvelope: {
          elementsTracked: ["C", "H", "N", "O", "S", "Cl", "Br"],
          hasChlorineSignature: false,
          hasBromineSignature: false,
          hasSulfurOrSiliconSignature: false,
        },
      };
    }
    const mIonMz = analysis.molecularIonCandidateMz;

    const ionization = spectrum.msParams?.ionization || "EI";
    const explicitAdduct = spectrum.msParams?.adductType;
    let detectedAdduct: MSPhysicsModel["adductModel"]["detectedAdduct"] =
      "neutral molecule [M]+•";
    if (explicitAdduct && explicitAdduct !== "Auto") {
      detectedAdduct = explicitAdduct === "[M]+•" ? "neutral molecule [M]+•" : explicitAdduct;
    } else if (ionization === "ESI+") {
      detectedAdduct = "[M+H]+";
    } else if (ionization === "ESI-") {
      detectedAdduct = "[M-H]-";
    }

    const massFeatures: MassFeature[] = spectrum.peaks
      .filter(
        (pk) =>
          pk.userClassification !== "SOLVENT" &&
          pk.userClassification !== "NOISE" &&
          pk.userClassification !== "IMPURITY"
      )
      .slice()
      .sort((a, b) => b.x - a.x)
      .map((pk) => {
        let isotopeRelation: MassFeature["isotopeRelation"] = "fragment";
        let ionType: MassFeature["ionType"] = "fragment_ion";

        if (mIonMz !== null) {
          const diff = pk.x - mIonMz;
          if (Math.abs(diff) <= 0.35) {
            isotopeRelation = "M";
            ionType =
              detectedAdduct === "neutral molecule [M]+•"
                ? "neutral_radical_cation_[M]+•"
                : detectedAdduct;
          } else if (Math.abs(diff - 1.00335483507 / Math.abs(spectrum.msParams?.chargeState ?? 1)) <= 0.35) {
            isotopeRelation = "M+1";
            ionType = "isotope_peak";
          } else if (Math.abs(diff - 1.997 / Math.abs(spectrum.msParams?.chargeState ?? 1)) <= 0.35) {
            isotopeRelation = "M+2";
            ionType = "isotope_peak";
          }
        }

        return {
          mz: Number(pk.x.toFixed(4)),
          intensity: Number(pk.y.toFixed(1)),
          charge: (detectedAdduct === "[M-H]-" ? -1 : 1) * Math.abs(spectrum.msParams?.chargeState ?? 1),
          ionType,
          isotopeRelation,
          confidence: isotopeRelation === "M" ? 0.88 : 0.8,
        };
      });

    const formulaCandidates: FormulaCandidate[] =
      analysis.candidateFormulas.map((fc) => {
        const exactMass = ExactMassCalculator.calculateMonoisotopicMass(
          fc.formula
        );
        const averageMolecularMass =
          ExactMassCalculator.calculateAverageMolecularMass(fc.formula);
        const dbe = ExactMassCalculator.calculateDBE(fc.formula);

        return {
          formula: fc.formula.split(/[\s(（\[]/)[0] || fc.formula,
          exactMass,
          averageMolecularMass,
          massError: fc.massErrorDa,
          ppmError: fc.massErrorPpm,
          DBE: dbe,
          isotopeCompatibility:
            fc.isotopeCompatibility === "High"
              ? 0.92
              : fc.isotopeCompatibility === "Moderate"
                ? 0.75
                : 0.45,
          adductType: detectedAdduct,
          confidence: Number(Math.min(0.95, fc.score / 100).toFixed(2)),
        };
      });

    return {
      massFeatures,
      formulaCandidates,
      adductModel: {
        detectedAdduct,
        supportedAdducts,
      },
      isotopeEnvelope: {
        elementsTracked: ["C", "H", "N", "O", "S", "Cl", "Br"],
        hasChlorineSignature:
          analysis.isotopePatternSummary.hasChlorineSignature,
        hasBromineSignature: analysis.isotopePatternSummary.hasBromineSignature,
        hasSulfurOrSiliconSignature:
          analysis.isotopePatternSummary.hasSulfurOrSiliconSignature,
      },
    };
  }

  generateEvidence(
    spectrum?: ExperimentalSpectrumData
  ): ChemicalFeatureEvidence[] {
    if (
      !spectrum ||
      spectrum.digitizationFailed ||
      !spectrum.validation.isValid ||
      spectrum.peaks.length === 0
    ) {
      return [];
    }

    const model = this.extractPhysicsModel(spectrum);
    const evidence: ChemicalFeatureEvidence[] = [];

    if (model.formulaCandidates.length > 0) {
      const top = model.formulaCandidates[0];
      const prov = MassSpectrometryEngine.createProvenance(
        top.confidence,
        "THEORETICAL"
      );
      evidence.push({
        id: `ms-ev-formula-${top.formula}`,
        featureId: `ms-ev-formula-${top.formula}`,
        featureKey: top.DBE >= 4 ? "AROMATIC_SYSTEM" : "ALIPHATIC_CHAIN",
        featureName: `質譜單一同位素分子式與不飽和度 (${top.formula}, DBE=${top.DBE})`,
        featureType: "Molecular Formula & DBE Constraint",
        feature: `${top.formula} (Monoisotopic=${top.exactMass.toFixed(4)} Da, Avg=${top.averageMolecularMass.toFixed(3)} Da, DBE=${top.DBE})`,
        value: top.exactMass,
        unit: "Da",
        supportLevel: top.confidence >= 0.8 ? "STRONG" : "MODERATE",
        confidence: top.confidence,
        uncertainty: Number((1 - top.confidence).toFixed(2)),
        status: top.confidence >= 0.8 ? "SUPPORTED" : "POSSIBLE",
        provenance: prov,
        scientificBasis: this.scientificTheoryBasis,
        category: "Element / Isotope",
        sourceSpectrum: ["MS"],
        supportingSignals: [
          {
            modality: "MS",
            signalLabel: `Adduct ${top.adductType} -> ${top.formula} (DBE=${top.DBE})`,
            observedValue: `${top.exactMass.toFixed(4)} Da`,
            interpretation: `Monoisotopic mass ${top.exactMass.toFixed(4)} Da vs average mass ${top.averageMolecularMass.toFixed(3)} Da; DBE = ${top.DBE}`,
            confidence: top.confidence,
          },
        ],
        contradictingSignals: [],
        interpretation: `Formula candidate ${top.formula} with DBE=${top.DBE} derived from ${top.adductType}.`,
        possibleFunctionalGroups:
          top.DBE >= 4
            ? ["Aromatic Ring / High Unsaturation (DBE ≥ 4)"]
            : ["Aliphatic / Low Unsaturation"],
        possibleStructuralMotifs: [`DBE = ${top.DBE}`],
        evidenceStrength: top.confidence >= 0.8 ? "Strong" : "Moderate",
        contradictions: [],
        limitations: [],
        provenanceType: "THEORETICAL",
      });
    }

    if (model.isotopeEnvelope.hasBromineSignature) {
      const prov = MassSpectrometryEngine.createProvenance(0.92, "THEORETICAL");
      evidence.push({
        id: "ms-ev-isotope-br",
        featureId: "ms-ev-isotope-br",
        featureKey: "HALOGEN_BROMINE",
        featureName:
          "溴同位素豐度特徵 (⁷⁹Br/⁸¹Br 1:1 M/M+2 Isotope Envelope)",
        featureType: "Isotope Distribution Pattern",
        feature: "Bromine 79Br/81Br (~1:1 M/M+2) isotopic signature",
        value: "M : M+2 ≈ 1 : 1",
        unit: "ratio",
        supportLevel: "STRONG",
        confidence: 0.92,
        uncertainty: 0.08,
        status: "SUPPORTED",
        provenance: prov,
        scientificBasis:
          "Natural isotopic abundance of 79Br (50.69%) and 81Br (49.31%)",
        category: "Element / Isotope",
        sourceSpectrum: ["MS"],
        supportingSignals: [
          {
            modality: "MS",
            signalLabel: "M / M+2 ≈ 1:1 twin molecular ion cluster",
            observedValue: "1:1 M/M+2",
            interpretation: "Characteristic monobromo isotopic envelope",
            confidence: 0.92,
          },
        ],
        contradictingSignals: [],
        interpretation:
          "Strong M/M+2 (~1:1) isotope cluster confirms presence of 1 Br atom.",
        possibleFunctionalGroups: ["Bromo-substituted compound (C-Br)"],
        possibleStructuralMotifs: ["-Br"],
        evidenceStrength: "Strong",
        contradictions: [],
        limitations: [],
        provenanceType: "THEORETICAL",
      });
    }

    if (model.isotopeEnvelope.hasChlorineSignature) {
      const prov = MassSpectrometryEngine.createProvenance(0.91, "THEORETICAL");
      evidence.push({
        id: "ms-ev-isotope-cl",
        featureId: "ms-ev-isotope-cl",
        featureKey: "HALOGEN_CHLORINE",
        featureName:
          "氯同位素豐度特徵 (³⁵Cl/³⁷Cl 3:1 M/M+2 Isotope Envelope)",
        featureType: "Isotope Distribution Pattern",
        feature: "Chlorine 35Cl/37Cl (~3:1 M/M+2) isotopic signature",
        value: "M : M+2 ≈ 3 : 1",
        unit: "ratio",
        supportLevel: "STRONG",
        confidence: 0.91,
        uncertainty: 0.09,
        status: "SUPPORTED",
        provenance: prov,
        scientificBasis:
          "Natural isotopic abundance of 35Cl (75.78%) and 37Cl (24.22%)",
        category: "Element / Isotope",
        sourceSpectrum: ["MS"],
        supportingSignals: [
          {
            modality: "MS",
            signalLabel: "M / M+2 ≈ 3:1 molecular ion cluster",
            observedValue: "3:1 M/M+2",
            interpretation: "Characteristic monochloro isotopic envelope",
            confidence: 0.91,
          },
        ],
        contradictingSignals: [],
        interpretation:
          "M/M+2 (~3:1) isotope cluster confirms presence of 1 Cl atom.",
        possibleFunctionalGroups: ["Chloro-substituted compound (C-Cl)"],
        possibleStructuralMotifs: ["-Cl"],
        evidenceStrength: "Strong",
        contradictions: [],
        limitations: [],
        provenanceType: "THEORETICAL",
      });
    }

    for (const mf of model.massFeatures) {
      if (mf.isotopeRelation === "fragment" && mf.intensity >= 25) {
        const mzRound = Math.round(mf.mz);
        if ([43, 77, 91, 105, 107, 135].includes(mzRound)) {
          const prov = MassSpectrometryEngine.createProvenance(
            0.8,
            "EMPIRICAL"
          );
          const isArom = [77, 91, 105, 107, 135].includes(mzRound);
          evidence.push({
            id: `ms-ev-frag-${mzRound}`,
            featureId: `ms-ev-frag-${mzRound}`,
            featureKey: isArom ? "AROMATIC_SYSTEM" : "CARBONYL",
            featureName: `質譜特徵碎片離子 m/z ${mzRound}`,
            featureType: "Mass Fragment Ion",
            feature: `Characteristic fragment ion at m/z ${mzRound}`,
            value: mf.mz,
            unit: "m/z",
            supportLevel: mf.intensity >= 60 ? "STRONG" : "MODERATE",
            confidence: 0.8,
            uncertainty: 0.2,
            status: "SUPPORTED",
            provenance: prov,
            scientificBasis: this.scientificTheoryBasis,
            category: "Structural Motif",
            sourceSpectrum: ["MS"],
            supportingSignals: [
              {
                modality: "MS",
                signalLabel: `m/z ${mf.mz} (${mf.intensity}%)`,
                observedValue: `m/z ${mf.mz}`,
                interpretation: isArom
                  ? `Aromatic/acylium fragment ion at m/z ${mzRound}`
                  : `Acylium/alkyl fragment ion at m/z ${mzRound}`,
                confidence: 0.8,
              },
            ],
            contradictingSignals: [],
            interpretation: `Observed fragment ion at m/z ${mzRound} (${mf.intensity}%).`,
            possibleFunctionalGroups: isArom
              ? ["Aromatic Ring / Benzoyl / Anisoyl"]
              : ["Acetyl / Ketone"],
            possibleStructuralMotifs: [`m/z ${mzRound} ion`],
            evidenceStrength: mf.intensity >= 60 ? "Strong" : "Moderate",
            contradictions: [],
            limitations: [],
            provenanceType: "EMPIRICAL",
          });
        }
      }
    }

    return evidence;
  }

  deriveStructuralConstraints(
    spectrum?: ExperimentalSpectrumData
  ): StructuralConstraints {
    return MSAnalysisEngine.buildMSStructuralConstraints(spectrum);
  }

  static analyze(spectrum?: ExperimentalSpectrumData) {
    const instance = new MassSpectrometryEngine();
    return {
      physicsModel: instance.extractPhysicsModel(spectrum),
      extractedEvidence: instance.generateEvidence(spectrum),
      structuralConstraints: instance.deriveStructuralConstraints(spectrum),
    };
  }
}
