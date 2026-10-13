import {
  ChemicalFeatureEvidence,
  EvidenceProvenance,
  ExperimentalSpectrumData,
  IRQuantumBackendAdapter,
  SpectrumScientificEngine,
  StructuralConstraints,
  VibrationalMode,
} from "../../types/spectrum";
import { IRAnalysisEngine } from "../irEngine";

export class DefaultIRQuantumBackendAdapter implements IRQuantumBackendAdapter {
  readonly adapterName =
    "IRQuantumBackendAdapter (Harmonic/Anharmonic Hessian Interface)";
  readonly status = "NOT_CONNECTED" as const;
  readonly fallbackMethod = "EMPIRICAL" as const;
  readonly scientificHonestyNote =
    "Quantum chemistry normal-mode Hessian calculation (DFT) is NOT_CONNECTED in the current phase. Using REFERENCE_BASED / EMPIRICAL characteristic vibrational group frequencies.";

  computeNormalModes(_smiles: string): {
    status: "NOT_CONNECTED";
    fallbackMethod: "REFERENCE_BASED" | "EMPIRICAL";
    modes: VibrationalMode[];
    message: string;
  } {
    return {
      status: "NOT_CONNECTED",
      fallbackMethod: "EMPIRICAL",
      modes: [],
      message: this.scientificHonestyNote,
    };
  }
}

export interface IRPhysicsModel {
  quantumBackend: IRQuantumBackendAdapter;
  vibrationalModes: VibrationalMode[];
  hasDipoleActiveCarbonylStretch: boolean;
  hasDipoleActiveHydroxylOrAmineStretch: boolean;
  hasAromaticRingSkeletalModes: boolean;
}

/**
 * Independent IR Scientific Engine (V5 Scientific Engine + V7 Solvent/Noise/Impurity Exclusion)
 * Scientific Basis:
 * Molecular Structure -> Molecular Geometry -> Vibrational Normal Modes ->
 * Dipole Moment Derivative (∂μ/∂Q ≠ 0) -> IR Activity & Vibrational Frequency (cm⁻¹) -> IR Absorption Band.
 */
export class IRScientificEngine
  implements SpectrumScientificEngine<IRPhysicsModel>
{
  readonly engineName = "IRScientificEngine";
  readonly engineVersion = "1.0.0-scientific-foundation";
  readonly modality = "IR" as const;
  readonly scientificTheoryBasis =
    "Molecular Vibrational Spectroscopy & Dipole Moment Change (|∂μ/∂Q| > 0)";
  readonly quantumBackend: IRQuantumBackendAdapter =
    new DefaultIRQuantumBackendAdapter();

  static createProvenance(
    confidence: number,
    method: "EMPIRICAL" | "REFERENCE_BASED" = "EMPIRICAL"
  ): EvidenceProvenance {
    const normConf = Number(Math.max(0, Math.min(1, confidence)).toFixed(2));
    return {
      source: "IR",
      model: "IRScientificEngine",
      modelVersion: "1.0.0-scientific-foundation",
      basis: "vibrational spectroscopy (dipole moment change ∂μ/∂Q)",
      method,
      isTheoretical: false,
      isEmpirical: method === "EMPIRICAL",
      isReferenceBased: method === "REFERENCE_BASED",
      isHeuristic: false,
      isQuantumBackend: false,
      confidence: normConf,
    };
  }

  extractPhysicsModel(spectrum?: ExperimentalSpectrumData): IRPhysicsModel {
    if (
      !spectrum ||
      spectrum.digitizationFailed ||
      !spectrum.validation.isValid ||
      spectrum.peaks.length === 0
    ) {
      return {
        quantumBackend: this.quantumBackend,
        vibrationalModes: [],
        hasDipoleActiveCarbonylStretch: false,
        hasDipoleActiveHydroxylOrAmineStretch: false,
        hasAromaticRingSkeletalModes: false,
      };
    }

    const analytePeaks = spectrum.peaks.filter(
      (pk) =>
        (!pk.role || pk.role === "ANALYTE") &&
        (!pk.signalRole || pk.signalRole === "ANALYTE") &&
        pk.userClassification !== "SOLVENT" &&
        pk.userClassification !== "NOISE" &&
        pk.userClassification !== "IMPURITY" &&
        !pk.isSolventVerified
    );
    const sortedPeaks = analytePeaks.slice().sort((a, b) => b.x - a.x);
    const hasBroadCarboxylicOH = sortedPeaks.some(
      (p) =>
        p.x >= 2500 &&
        p.x <= 3300 &&
        (p.isBroad || p.shape === "broad" || p.shape === "BROAD" || (p.width || 0) >= 65)
    );
    const hasStrongCOBand = sortedPeaks.some(
      (p) => p.x >= 1020 && p.x <= 1295 && p.y >= 45
    );
    const hasAmideIBand = sortedPeaks.some(
      (p) => p.x >= 1630 && p.x <= 1695 && p.y >= 55
    );
    const hasAlkyneTripleBand = sortedPeaks.some(
      (p) => p.x >= 2100 && p.x <= 2260 && p.y >= 15
    );

    const vibrationalModes: VibrationalMode[] = sortedPeaks.map((pk, idx) => {
      const freq = pk.x;
      const intensity =
        pk.irIntensity === "strong" || pk.irIntensity === "STRONG"
          ? Math.max(pk.y, 85)
          : pk.irIntensity === "medium" || pk.irIntensity === "MEDIUM"
            ? Math.max(pk.y, 55)
            : pk.irIntensity === "weak" || pk.irIntensity === "WEAK"
              ? Math.min(pk.y, 35)
              : pk.y;

      const isBroad =
        Boolean(pk.isBroad) ||
        pk.shape === "broad" ||
        pk.shape === "BROAD" ||
        (pk.width || 25) >= 55;

      let bandRegion: VibrationalMode["bandRegion"] =
        "Fingerprint Region (400–1500 cm⁻¹)";
      if (freq >= 2500) {
        bandRegion = "X-H Stretch (2500–4000 cm⁻¹)";
      } else if (freq >= 2000) {
        bandRegion = "Triple Bond (2000–2500 cm⁻¹)";
      } else if (freq >= 1500) {
        bandRegion = "Double Bond / Carbonyl (1500–2000 cm⁻¹)";
      }

      const dipoleDerivativeActivity: VibrationalMode["dipoleDerivativeActivity"] =
        intensity >= 75
          ? "IR_ACTIVE_STRONG (Large |∂μ/∂Q|)"
          : intensity >= 40
            ? "IR_ACTIVE_MODERATE (Moderate |∂μ/∂Q|)"
            : "IR_ACTIVE_WEAK (Small |∂μ/∂Q|)";

      let assignment = "Skeletal / bending vibrational mode in fingerprint region (Level 2 local environment)";
      let possibleFunctionalGroups: string[] = [
        "Aliphatic / skeletal C-C / C-X vibration",
      ];
      let confidence = 0.65;

      if (freq >= 3580 && freq <= 3670 && !isBroad) {
        assignment = "Free / non-hydrogen-bonded O-H stretching mode (ν O-H free)";
        possibleFunctionalGroups = ["Free Alcohol / Sterically Hindered Phenol (-OH)"];
        confidence = 0.84;
      } else if (freq >= 3260 && freq <= 3330 && !isBroad && hasAlkyneTripleBand) {
        assignment = "Terminal alkyne sp C-H stretching mode (ν ≡C-H)";
        possibleFunctionalGroups = ["Terminal Alkyne (-C≡C-H)"];
        confidence = 0.86;
      } else if (freq >= 3180 && freq <= 3580) {
        if (isBroad) {
          assignment =
            "Intermolecular hydrogen-bonded O-H stretching mode (ν O-H broad polymer/dimer)";
          possibleFunctionalGroups = hasStrongCOBand
            ? ["Alcohol (-OH)", "Phenol (Ar-OH)", "Carboxylic Acid (-COOH)"]
            : ["Alcohol / Phenol (-OH)", "Trace Water (H-O-H)", "Hydrogen-bonded N-H"];
          confidence = hasStrongCOBand ? 0.86 : 0.78;
        } else {
          assignment = hasAmideIBand
            ? "Amide N-H stretching mode (ν N-H coupled with Amide I)"
            : "Primary/Secondary N-H or weakly H-bonded O-H stretching mode (ν N-H / ν O-H)";
          possibleFunctionalGroups = hasAmideIBand
            ? ["Amide (-CONH- / -CONH₂)", "Alcohol / Phenol (-OH)"]
            : ["Primary/Secondary Amine (-NH₂ / -NH-)", "Alcohol / Phenol (-OH)"];
          confidence = 0.78;
        }
      } else if (freq >= 2500 && freq < 3180 && isBroad && hasBroadCarboxylicOH) {
        assignment =
          "Carboxylic acid centrosymmetric dimer hydrogen-bonded O-H stretching mode (ν O-H dimer)";
        possibleFunctionalGroups = [
          "Carboxylic Acid (-COOH dimer)",
          "Intramolecularly Chelated Hydroxyl (O-H···O=C)",
        ];
        confidence = 0.85;
      } else if (freq >= 3005 && freq < 3120) {
        assignment = "Unsaturated / Aromatic sp² C-H stretching mode (ν =C-H)";
        possibleFunctionalGroups = ["Aromatic Ring (Ar-H)", "Alkene (=C-H)"];
        confidence = 0.78;
      } else if (freq >= 2840 && freq <= 3000) {
        assignment =
          "Aliphatic sp³ C-H asymmetric/symmetric stretching mode (ν C-H)";
        possibleFunctionalGroups = [
          "Alkyl chain (-CH₃ / -CH₂-)",
          "Methoxy (-OCH₃)",
        ];
        confidence = 0.76;
      } else if (freq >= 2700 && freq < 2840) {
        assignment = "Aldehyde C-H Fermi resonance doublet candidate (ν CHO + 2δ CHO)";
        possibleFunctionalGroups = ["Aldehyde (-CHO)"];
        confidence = 0.84;
      } else if (freq >= 2210 && freq <= 2265) {
        assignment = "Triple-bond C≡N stretching mode (ν C≡N)";
        possibleFunctionalGroups = ["Nitrile (-C≡N)", "Unsymmetrical Alkyne (-C≡C-)"];
        confidence = 0.86;
      } else if (freq >= 2100 && freq < 2210) {
        assignment = "Triple-bond C≡C stretching mode (ν C≡C)";
        possibleFunctionalGroups = ["Alkyne (-C≡C-)"];
        confidence = 0.84;
      } else if (freq >= 1785 && freq <= 1835) {
        assignment =
          "High-frequency carbonyl C=O stretching mode (Anhydride coupled doublet or Acyl Halide / strained ring)";
        possibleFunctionalGroups = ["Anhydride (-CO-O-CO-)", "Acyl Chloride (-COCl)", "Strained 4-membered Lactone/Ketone"];
        confidence = 0.84;
      } else if (freq >= 1630 && freq <= 1784) {
        assignment =
          "Carbonyl C=O stretching mode (ν C=O, large dipole derivative ∂μ/∂Q; subtype modulated by conjugation, inductive, ring-strain & H-bond effects)";
        possibleFunctionalGroups = [
          "Carbonyl (Ketone / Aldehyde / Ester / Carboxylic Acid / Amide)",
        ];
        confidence = intensity >= 65 ? 0.85 : 0.74;
      } else if (freq >= 1480 && freq < 1630) {
        assignment =
          "Aromatic ring C=C skeletal stretching, Nitro ν_as(NO₂), or Amide II / N-H bending mode";
        possibleFunctionalGroups = [
          "Aromatic Ring (C=C)",
          "Nitro (-NO₂)",
          "Amide II / Amine N-H bend",
        ];
        confidence = 0.78;
      } else if (freq >= 1000 && freq <= 1320) {
        assignment =
          "C-O / C-N / Si-O stretching vibration in fingerprint region (requires functional group region corroboration)";
        possibleFunctionalGroups = [
          "Ester (C-O)",
          "Alcohol / Phenol (C-O)",
          "Ether (C-O-C)",
          "Siloxane (Si-O-Si)",
        ];
        confidence = 0.75;
      } else if (freq >= 680 && freq <= 880) {
        assignment =
          "Aromatic C-H out-of-plane (OOP) bending, Si-C rocking, or fingerprint C-Cl candidate";
        possibleFunctionalGroups = [
          "Substituted Benzene Ring (OOP bending)",
          "Organosilicon (Si-C)",
        ];
        confidence = 0.74;
      }

      return {
        modeIndex: idx + 1,
        frequency: Number(freq.toFixed(1)),
        intensity: Number(intensity.toFixed(1)),
        bandRegion,
        symmetry:
          "Empirical group mode (Point-group symmetry requires quantum Hessian)",
        dipoleDerivativeActivity,
        assignment,
        possibleFunctionalGroups,
        confidence,
        source: "EMPIRICAL",
        provenance: IRScientificEngine.createProvenance(confidence, "EMPIRICAL"),
      };
    });

    const hasDipoleActiveCarbonylStretch = vibrationalModes.some(
      (m) => m.frequency >= 1630 && m.frequency <= 1835 && m.intensity >= 50
    );
    const hasDipoleActiveHydroxylOrAmineStretch = vibrationalModes.some(
      (m) => m.frequency >= 3180 && m.frequency <= 3670 && m.intensity >= 20
    );
    const hasAromaticRingSkeletalModes =
      vibrationalModes.some((m) => m.frequency >= 1580 && m.frequency <= 1620) &&
      vibrationalModes.some((m) => m.frequency >= 1480 && m.frequency <= 1525);

    return {
      quantumBackend: this.quantumBackend,
      vibrationalModes,
      hasDipoleActiveCarbonylStretch,
      hasDipoleActiveHydroxylOrAmineStretch,
      hasAromaticRingSkeletalModes,
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

    const physicsModel = this.extractPhysicsModel(spectrum);
    const irResult = IRAnalysisEngine.analyzeExperimentalIR(spectrum);
    const evidenceList: ChemicalFeatureEvidence[] = [];

    for (const mode of physicsModel.vibrationalModes) {
      if (
        mode.frequency >= 1630 &&
        mode.frequency <= 1835 &&
        mode.intensity >= 50
      ) {
        const hasAldehydeFermi = physicsModel.vibrationalModes.some(
          (m) => m.frequency >= 2700 && m.frequency <= 2850
        );
        const hasEsterCO =
          mode.frequency >= 1715 &&
          physicsModel.vibrationalModes.some(
            (m) => m.frequency >= 1150 && m.frequency <= 1290 && m.intensity >= 55
          );
        const conf = mode.confidence;
        const prov = IRScientificEngine.createProvenance(conf, "EMPIRICAL");
        const signalKey = `IR_PEAK_${Math.round(mode.frequency)}`;

        evidenceList.push({
          id: `ir-ev-mode-${mode.modeIndex}-${Math.round(mode.frequency)}`,
          featureId: `ir-ev-mode-${mode.modeIndex}-${Math.round(mode.frequency)}`,
          featureKey: "CARBONYL",
          featureName:
            "紅外線 C=O 伸縮振動帶證據 (Level 2/3 Carbonyl Vibrational Evidence)",
          featureType: "Vibrational Mode / Functional Group",
          feature: "Carbonyl C=O stretching vibration (∂μ/∂Q active)",
          value: mode.frequency,
          unit: "cm⁻¹",
          supportLevel: mode.intensity >= 75 ? "STRONG" : "MODERATE",
          confidence: conf,
          uncertainty: Number((1 - conf).toFixed(2)),
          status: hasAldehydeFermi || hasEsterCO ? "SUPPORTED" : "POSSIBLE",
          provenance: prov,
          scientificBasis: this.scientificTheoryBasis,
          category: "Functional Group",
          sourceSpectrum: ["IR"],
          sourceSignalKey: signalKey,
          inferenceLevel: "LEVEL_2_LOCAL_CHEMICAL_ENVIRONMENT",
          alternativeExplanations: [
            "共軛烯烴或強偶極芳環骨架模式（若波數 < 1660 cm⁻¹ 且強度中等）",
          ],
          supportingSignals: [
            {
              modality: "IR",
              signalLabel: `${mode.frequency} cm⁻¹ (${mode.intensity}% intensity, ${mode.bandRegion})`,
              observedValue: `${mode.frequency} cm⁻¹`,
              interpretation: `${mode.assignment} — C=O stretching region provides carbonyl evidence (${
                hasAldehydeFermi
                  ? "accompanied by Fermi doublet ~2730/2830 cm⁻¹"
                  : hasEsterCO
                    ? "accompanied by strong C-O stretch ~1150–1290 cm⁻¹"
                    : "subtype Ketone/Aldehyde/Ester/Acid/Amide requires orthogonal confirmation"
              })`,
              confidence: conf,
            },
          ],
          contradictingSignals: [],
          interpretation: mode.assignment,
          possibleFunctionalGroups: mode.possibleFunctionalGroups,
          possibleStructuralMotifs: ["C=O Dipole-Active Carbonyl Motif (DBE ≥ 1)"],
          evidenceStrength: mode.intensity >= 75 ? "Strong" : "Moderate",
          contradictions: [],
          limitations: [
            "IR C=O stretching frequency alone indicates carbonyl environment (Level 2); distinguishing ketone, aldehyde, ester, acid, or amide (Level 3) requires companion bands and NMR/MS.",
          ],
          provenanceType: "EMPIRICAL",
        });
      }
    }

    for (const finding of irResult.findings) {
      const conf = Number((finding.confidence / 100).toFixed(2));
      const prov = IRScientificEngine.createProvenance(conf, "REFERENCE_BASED");
      let featureKey: ChemicalFeatureEvidence["featureKey"] = "ALIPHATIC_CHAIN";
      if (finding.family === "Aldehyde") featureKey = "ALDEHYDE";
      else if (finding.family === "Ketone") featureKey = "KETONE";
      else if (finding.family === "Ester") featureKey = "ESTER";
      else if (finding.family === "Carboxylic acid")
        featureKey = "CARBOXYLIC_ACID";
      else if (finding.family === "Amide") featureKey = "AMIDE";
      else if (finding.family === "Aromatic") featureKey = "AROMATIC_SYSTEM";
      else if (finding.family === "Heteroaromatic")
        featureKey = "AROMATIC_SYSTEM"; // Prevent premature Heteroaromatic featureKey jump from IR alone!
      else if (finding.family === "Alcohol") featureKey = "ALCOHOL_OR_PHENOL";
      else if (finding.family === "Amine") featureKey = "AMINE";
      else if (finding.family === "Nitrile") featureKey = "NITRILE";
      else if (finding.family === "Alkyne" || finding.family === "C≡C")
        featureKey = "ALKYNE";
      else if (finding.family === "Ether") featureKey = "ETHER_OR_ALKOXY";
      else if (finding.family === "Siloxane") featureKey = "SILOXANE_MOTIF";
      else if (finding.family === "Nitro") featureKey = "NITRO";
      else if (finding.family === "Sulfonyl") featureKey = "SULFONYL";
      else if (finding.family === "Anhydride") featureKey = "ANHYDRIDE";
      else if (finding.family === "Acyl chloride") featureKey = "ACYL_CHLORIDE";

      const signalKey = `IR_PEAK_${Math.round(finding.observedPeak)}`;

      evidenceList.push({
        id: `ir-ev-finding-${finding.id}`,
        featureId: `ir-ev-finding-${finding.id}`,
        featureKey,
        featureName: finding.functionalGroup,
        featureType: "IR Vibrational Group Frequency",
        feature: finding.assignment,
        value: finding.observedPeak,
        unit: "cm⁻¹",
        supportLevel:
          finding.matchLevel === "Strong"
            ? "STRONG"
            : finding.matchLevel === "Moderate"
              ? "MODERATE"
              : "WEAK",
        confidence: conf,
        uncertainty: Number((1 - conf).toFixed(2)),
        status: finding.matchLevel === "Strong" ? "SUPPORTED" : "POSSIBLE",
        provenance: prov,
        scientificBasis: this.scientificTheoryBasis,
        category: "Functional Group",
        sourceSpectrum: ["IR"],
        sourceSignalKey: signalKey,
        inferenceLevel: finding.inferenceLevel || "LEVEL_3_FUNCTIONAL_GROUP_HYPOTHESIS",
        alternativeExplanations: finding.alternativeExplanations || [],
        competingHypotheses: finding.competingHypotheses || [],
        supportingSignals: [
          {
            modality: "IR",
            signalLabel: `${finding.observedPeak} cm⁻¹ (${finding.region})`,
            observedValue: `${finding.observedPeak} cm⁻¹`,
            interpretation: finding.reasoning,
            confidence: conf,
          },
        ],
        contradictingSignals: [],
        interpretation: finding.reasoning,
        possibleFunctionalGroups: [finding.functionalGroup],
        possibleStructuralMotifs: [finding.assignment],
        evidenceStrength:
          finding.matchLevel === "Strong" ? "Strong" : "Moderate",
        contradictions: [],
        limitations: [
          "Reference/empirical vibrational group frequency correlation (IRQuantumBackendAdapter status: NOT_CONNECTED).",
        ],
        provenanceType: "EMPIRICAL",
      });
    }

    return evidenceList;
  }

  deriveStructuralConstraints(
    spectrum?: ExperimentalSpectrumData
  ): StructuralConstraints {
    return IRAnalysisEngine.buildStructuralConstraints(spectrum);
  }

  static analyze(spectrum?: ExperimentalSpectrumData): {
    physicsModel: IRPhysicsModel;
    extractedEvidence: ChemicalFeatureEvidence[];
    structuralConstraints: StructuralConstraints;
  } {
    const instance = new IRScientificEngine();
    return {
      physicsModel: instance.extractPhysicsModel(spectrum),
      extractedEvidence: instance.generateEvidence(spectrum),
      structuralConstraints: instance.deriveStructuralConstraints(spectrum),
    };
  }
}

