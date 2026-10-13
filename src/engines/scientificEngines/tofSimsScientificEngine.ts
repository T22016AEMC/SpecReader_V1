import {
  ChemicalFeatureEvidence,
  EvidenceProvenance,
  ExperimentalSpectrumData,
  SpectrumScientificEngine,
  StructuralConstraints,
  ToFSIMSFeature,
  ToFSIMSSurfaceConditionState,
} from "../../types/spectrum";
import { MSAnalysisEngine } from "../msEngine";

export interface ToFSIMSPhysicsModel {
  surfaceConditions: ToFSIMSSurfaceConditionState;
  secondaryIonFeatures: ToFSIMSFeature[];
  hasOrganosiliconBackboneSeries: boolean;
  hasAromaticOverlayerSeries: boolean;
  hasPolarOxygenatedOrNitrogenatedSurfaceIons: boolean;
}

/**
 * Independent ToF-SIMS Surface Scientific Engine (V5)
 * Scientific Basis:
 * Primary Ion Beam (e.g. Bi3+, Cs+, Ar_n+) + Solid Surface + Primary Ion Energy +
 * Matrix Effect + Polarity -> Collision Cascade & Secondary Ion Sputtering ->
 * Detected Positive/Negative Secondary Ions.
 */
export class ToFSIMSScientificEngine
  implements SpectrumScientificEngine<ToFSIMSPhysicsModel>
{
  readonly engineName = "ToFSIMSScientificEngine";
  readonly engineVersion = "1.0.0-scientific-foundation";
  readonly modality = "TOF_SIMS" as const;
  readonly scientificTheoryBasis =
    "Time-of-Flight Secondary Ion Mass Spectrometry (ToF-SIMS): Primary Ion Collision Cascade, Matrix Effect, and Surface Secondary Ion Emission";

  static createProvenance(
    confidence: number,
    method: "EMPIRICAL" | "REFERENCE_BASED" = "REFERENCE_BASED"
  ): EvidenceProvenance {
    const normConf = Number(Math.max(0, Math.min(1, confidence)).toFixed(2));
    return {
      source: "TOF_SIMS",
      model: "ToFSIMSScientificEngine",
      modelVersion: "1.0.0-scientific-foundation",
      basis:
        "surface secondary ion sputtering, polarity-dependent ion yield, and characteristic cluster series",
      method,
      isTheoretical: false,
      isEmpirical: method === "EMPIRICAL",
      isReferenceBased: method === "REFERENCE_BASED",
      isHeuristic: false,
      isQuantumBackend: false,
      confidence: normConf,
    };
  }

  extractSurfaceConditions(
    spectrum?: ExperimentalSpectrumData
  ): ToFSIMSSurfaceConditionState {
    const rawParams = spectrum?.msParams?.tofSims;
    let polarity: ToFSIMSSurfaceConditionState["polarity"] = "NOT_PROVIDED";
    if (rawParams?.polarity === "Positive") {
      polarity = "positive";
    } else if (rawParams?.polarity === "Negative") {
      polarity = "negative";
    } else if (spectrum?.msParams?.ionization === "ESI-") {
      polarity = "negative";
    } else if (spectrum?.msParams?.ionization === "ESI+") {
      polarity = "positive";
    }

    return {
      polarity,
      primaryIon: rawParams?.primaryIon ? rawParams.primaryIon : "NOT_PROVIDED",
      primaryIonEnergy:
        typeof rawParams?.primaryIonEnergyKeV === "number"
          ? `${rawParams.primaryIonEnergyKeV} keV`
          : "NOT_PROVIDED",
      dose: rawParams?.ionDoseRegime ? rawParams.ionDoseRegime : "NOT_PROVIDED",
      fluence: "NOT_PROVIDED",
      matrix: rawParams?.substrateMaterial
        ? rawParams.substrateMaterial
        : "NOT_PROVIDED",
    };
  }

  extractPhysicsModel(
    spectrum?: ExperimentalSpectrumData
  ): ToFSIMSPhysicsModel {
    const surfaceConditions = this.extractSurfaceConditions(spectrum);

    if (
      !spectrum ||
      spectrum.digitizationFailed ||
      !spectrum.validation.isValid ||
      spectrum.peaks.length === 0
    ) {
      return {
        surfaceConditions,
        secondaryIonFeatures: [],
        hasOrganosiliconBackboneSeries: false,
        hasAromaticOverlayerSeries: false,
        hasPolarOxygenatedOrNitrogenatedSurfaceIons: false,
      };
    }

    const secondaryIonFeatures: ToFSIMSFeature[] = spectrum.peaks
      .filter(
        (pk) =>
          pk.userClassification !== "SOLVENT" &&
          pk.userClassification !== "NOISE" &&
          pk.userClassification !== "IMPURITY"
      )
      .slice()
      .sort((a, b) => b.x - a.x)
      .map((pk) => {
        const mzRound = Math.round(pk.x);
        let ionAssignment = "Secondary surface fragment ion";
        let ionClass: ToFSIMSFeature["ionClass"] = "unassigned_secondary_ion";
        let fragmentClass = "Surface organic/inorganic secondary ion";
        let surfaceFragmentationMechanism =
          "Collision cascade bond scission at top 1–2 nm surface monolayer";
        let surfaceRelevance: ToFSIMSFeature["surfaceRelevance"] =
          "General Secondary Ion Fragment";
        let confidence = 0.35;
        if(surfaceConditions.polarity === "negative" && [16,17,35,37,45].includes(mzRound)) {
          ionAssignment=mzRound===16?"O− 元素陰離子":mzRound===17?"OH− 表面羥基或吸附水假設":mzRound===45?"CHO2− 羧酸／含氧表面碎片假設":"Cl− 氯陰離子（需 35/37 同位素比例佐證）";
          ionClass="oxygenated_secondary_ion";confidence=.55;
        }

        if (
          [28, 59, 73, 147, 207, 221].includes(mzRound) &&
          surfaceConditions.polarity !== "negative"
        ) {
          ionClass = "organosilicon_secondary_ion";
          fragmentClass =
            "Polydimethylsiloxane (PDMS) / Organosilicon positive cluster series";
          surfaceRelevance = "Polymer / Siloxane Surface Backbone";
          surfaceFragmentationMechanism =
            "Soft momentum-transfer zone oligomer unzipping & Si-CH3 homolytic demethylation";
          confidence = 0.86;
          if (mzRound === 73)
            ionAssignment = "[Si(CH3)3]+ trimethylsilyl secondary cation";
          else if (mzRound === 59)
            ionAssignment = "[SiH(CH3)2]+ dimethylsilyl secondary cation";
          else if (mzRound === 147)
            ionAssignment =
              "[Si2O(CH3)5]+ pentamethyldisiloxanyl secondary cation";
          else if (mzRound === 207)
            ionAssignment =
              "[Si3O3(CH3)5]+ cyclic/linear siloxane secondary cation";
          else if (mzRound === 221)
            ionAssignment =
              "[Si3O2(CH3)7]+ heptamethyltrisiloxanyl secondary cation";
          else ionAssignment = "Si+ elemental silicon secondary ion";
        } else if (
          [60, 75, 77, 149].includes(mzRound) &&
          surfaceConditions.polarity === "negative"
        ) {
          ionClass = "organosilicon_secondary_ion";
          fragmentClass =
            "Silicate / Organosiloxane negative secondary ion series";
          surfaceRelevance = "Polymer / Siloxane Surface Backbone";
          surfaceFragmentationMechanism =
            "Surface Si-O bond cleavage & deprotonation/demethylation yielding oxy-silicon anions";
          confidence = 0.85;
          if (mzRound === 60)
            ionAssignment = "[SiO2]- silicon dioxide secondary anion";
          else if (mzRound === 75)
            ionAssignment = "[CH3SiO2]- methylsilicate secondary anion";
          else if (mzRound === 77)
            ionAssignment = "[HSiO3]- hydrosilicate secondary anion";
          else
            ionAssignment =
              "[(CH3)3SiO-Si(CH3)O2]- disiloxane secondary anion";
        } else if ([77, 91, 105, 115, 128].includes(mzRound) && surfaceConditions.polarity === "positive") {
          ionClass = "aromatic_hydrocarbon_secondary_ion";
          fragmentClass =
            "Aromatic phenyl / tropylium / polycyclic secondary ion series";
          surfaceRelevance = "Aromatic / Organic Overlayer";
          surfaceFragmentationMechanism =
            "Proximal collision zone benzylic / aryl bond scission preserving conjugated ring";
          confidence = 0.8;
          if (mzRound === 77) ionAssignment = "C6H5+ phenyl secondary cation";
          else if (mzRound === 91)
            ionAssignment = "C7H7+ tropylium / benzyl secondary cation";
          else ionAssignment = `m/z ${mzRound} aromatic secondary ion`;
        } else if ([27, 29, 41, 55, 57].includes(mzRound) && surfaceConditions.polarity === "positive") {
          ionClass = "aliphatic_hydrocarbon_secondary_ion";
          fragmentClass =
            "Aliphatic CnH(2n+1)+ / CnH(2n-1)+ hydrocarbon series";
          surfaceRelevance = "Aliphatic Hydrocarbon Chain";
          surfaceFragmentationMechanism =
            "Direct C-C / C-H bond scission along alkyl chain in collision cascade";
          confidence = 0.74;
          ionAssignment = `m/z ${mzRound} aliphatic alkyl/alkenyl secondary cation`;
        } else if ([31, 43, 45, 59].includes(mzRound) && surfaceConditions.polarity === "positive") {
          ionClass = "oxygenated_secondary_ion";
          fragmentClass = "Oxygenated C_xH_yO+ secondary ion series";
          surfaceRelevance = "Polar Functional Surface Group";
          surfaceFragmentationMechanism =
            "Charge-stabilized α-scission adjacent to surface C-O / C=O functional groups";
          confidence = 0.76;
          if (mzRound === 31)
            ionAssignment = "CH3O+ hydroxymethyl / methoxy secondary ion";
          else if (mzRound === 43)
            ionAssignment = "C2H3O+ / C3H7+ acylium/alkyl secondary ion";
          else if (mzRound === 45)
            ionAssignment = "C2H5O+ / CHO2+ oxygenated secondary ion";
          else ionAssignment = "C3H7O+ oxygenated secondary ion";
        } else if ([30, 44, 58, 72, 79, 80].includes(mzRound) && surfaceConditions.polarity === "positive") {
          ionClass = "nitrogenated_secondary_ion";
          fragmentClass =
            "Immonium / amine / pyridinium secondary ion series";
          surfaceRelevance = "Polar Functional Surface Group";
          surfaceFragmentationMechanism =
            "Protonation or α-cleavage of nitrogen-containing surface functional groups / heterocycles";
          confidence = 0.76;
          ionAssignment = `m/z ${mzRound} amine/immonium/pyridinium secondary ion`;
        }

        return {
          mz: Number(pk.x.toFixed(4)),
          intensity: Number(pk.y.toFixed(1)),
          polarity: surfaceConditions.polarity,
          ionAssignment,
          ionClass,
          fragmentClass,
          surfaceFragmentationMechanism,
          surfaceRelevance,
          confidence,
        };
      });

    const hasOrganosiliconBackboneSeries = secondaryIonFeatures.some(
      (f) =>
        f.ionClass === "organosilicon_secondary_ion" &&
        [60, 73, 75, 147, 149, 207, 221].includes(Math.round(f.mz))
    );
    const hasAromaticOverlayerSeries = secondaryIonFeatures.some(
      (f) => f.ionClass === "aromatic_hydrocarbon_secondary_ion"
    );
    const hasPolarOxygenatedOrNitrogenatedSurfaceIons =
      secondaryIonFeatures.some(
        (f) =>
          f.ionClass === "oxygenated_secondary_ion" ||
          f.ionClass === "nitrogenated_secondary_ion"
      );

    return {
      surfaceConditions,
      secondaryIonFeatures,
      hasOrganosiliconBackboneSeries,
      hasAromaticOverlayerSeries,
      hasPolarOxygenatedOrNitrogenatedSurfaceIons,
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

    const conditionNote = `Surface Parameters — Polarity: ${model.surfaceConditions.polarity}, Primary Ion: ${model.surfaceConditions.primaryIon}, Energy: ${model.surfaceConditions.primaryIonEnergy}, Dose: ${model.surfaceConditions.dose}, Fluence: ${model.surfaceConditions.fluence}, Matrix: ${model.surfaceConditions.matrix}`;

    if (model.hasOrganosiliconBackboneSeries) {
      const siIons = model.secondaryIonFeatures.filter(
        (f) => f.ionClass === "organosilicon_secondary_ion"
      );
      const conf = 0.86;
      const prov = ToFSIMSScientificEngine.createProvenance(
        conf,
        "REFERENCE_BASED"
      );
      evidence.push({
        id: "tofsims-ev-siloxane-series",
        featureId: "tofsims-ev-siloxane-series",
        featureKey: "SILOXANE_MOTIF",
        featureName:
          "ToF-SIMS 矽氧烷表面特徵二次離子簇 (PDMS / Siloxane Secondary Ion Family)",
        featureType: "ToF-SIMS Surface Secondary Ion Series",
        feature: siIons
          .map((i) => `m/z ${Math.round(i.mz)} (${i.ionAssignment})`)
          .join(", "),
        value: siIons[0]?.mz ?? 73,
        unit: "m/z",
        supportLevel: "STRONG",
        confidence: conf,
        uncertainty: Number((1 - conf).toFixed(2)),
        status: "SUPPORTED",
        provenance: prov,
        scientificBasis: this.scientificTheoryBasis,
        category: "Structural Motif",
        sourceSpectrum: ["TOF_SIMS", "ToF-SIMS"],
        supportingSignals: siIons.map((i) => ({
          modality: "ToF-SIMS",
          signalLabel: `m/z ${i.mz} (${i.intensity}%, polarity: ${i.polarity})`,
          observedValue: `m/z ${i.mz}`,
          interpretation: `${i.ionAssignment} [${i.surfaceRelevance}]`,
          confidence: i.confidence,
        })),
        contradictingSignals: [],
        interpretation: `Characteristic ToF-SIMS organosilicon secondary ions (${siIons
          .map((i) => `m/z ${Math.round(i.mz)}`)
          .join(", ")}) indicate a polydimethylsiloxane / siloxane motif. (${conditionNote})`,
        possibleFunctionalGroups: [
          "Siloxane (Si-O-Si)",
          "Trimethylsilyl (-Si(CH3)3)",
        ],
        possibleStructuralMotifs: [
          "Polydimethylsiloxane (PDMS) oligomer / surface repeat unit",
        ],
        evidenceStrength: "Strong",
        contradictions: [],
        limitations: [
          conditionNote,
          "ToF-SIMS reflects top 1–2 nm surface secondary ion sputtering and cannot uniquely determine bulk molecular weight without orthogonal MS/NMR.",
        ],
        provenanceType: "EMPIRICAL",
      });
    }

    if (model.hasAromaticOverlayerSeries) {
      const arIons = model.secondaryIonFeatures.filter(
        (f) => f.ionClass === "aromatic_hydrocarbon_secondary_ion"
      );
      const conf = 0.78;
      const prov = ToFSIMSScientificEngine.createProvenance(
        conf,
        "REFERENCE_BASED"
      );
      evidence.push({
        id: "tofsims-ev-aromatic-series",
        featureId: "tofsims-ev-aromatic-series",
        featureKey: "AROMATIC_SYSTEM",
        featureName:
          "ToF-SIMS 芳香族表面二次離子簇 (Aromatic Secondary Ions m/z 77/91)",
        featureType: "ToF-SIMS Surface Secondary Ion Series",
        feature: arIons
          .map((i) => `m/z ${Math.round(i.mz)} (${i.ionAssignment})`)
          .join(", "),
        value: arIons[0]?.mz ?? 91,
        unit: "m/z",
        supportLevel: "MODERATE",
        confidence: conf,
        uncertainty: Number((1 - conf).toFixed(2)),
        status: "POSSIBLE",
        provenance: prov,
        scientificBasis: this.scientificTheoryBasis,
        category: "Structural Motif",
        sourceSpectrum: ["TOF_SIMS", "ToF-SIMS"],
        supportingSignals: arIons.map((i) => ({
          modality: "ToF-SIMS",
          signalLabel: `m/z ${i.mz} (${i.intensity}%, polarity: ${i.polarity})`,
          observedValue: `m/z ${i.mz}`,
          interpretation: `${i.ionAssignment} [${i.surfaceRelevance}]`,
          confidence: i.confidence,
        })),
        contradictingSignals: [],
        interpretation: `Aromatic secondary ions (${arIons
          .map((i) => `m/z ${Math.round(i.mz)}`)
          .join(", ")}) indicate phenyl/benzyl surface motifs. (${conditionNote})`,
        possibleFunctionalGroups: ["Aromatic Ring (Phenyl / Benzyl)"],
        possibleStructuralMotifs: [
          "C6H5+ / C7H7+ aromatic secondary ion motif",
        ],
        evidenceStrength: "Moderate",
        contradictions: [],
        limitations: [conditionNote],
        provenanceType: "EMPIRICAL",
      });
    }

    if (
      !model.hasOrganosiliconBackboneSeries &&
      !model.hasAromaticOverlayerSeries &&
      model.hasPolarOxygenatedOrNitrogenatedSurfaceIons
    ) {
      const polarIons = model.secondaryIonFeatures.filter(
        (f) =>
          f.ionClass === "oxygenated_secondary_ion" ||
          f.ionClass === "nitrogenated_secondary_ion"
      );
      const isNitrogen = polarIons.some(
        (f) => f.ionClass === "nitrogenated_secondary_ion"
      );
      const conf = 0.74;
      const prov = ToFSIMSScientificEngine.createProvenance(conf, "EMPIRICAL");
      evidence.push({
        id: "tofsims-ev-polar-series",
        featureId: "tofsims-ev-polar-series",
        featureKey: isNitrogen ? "AMINE" : "ETHER_OR_ALKOXY",
        featureName: isNitrogen
          ? "ToF-SIMS 含氮表面二次離子簇 (Nitrogenated Secondary Ions)"
          : "ToF-SIMS 含氧表面二次離子簇 (Oxygenated Secondary Ions)",
        featureType: "ToF-SIMS Surface Secondary Ion Series",
        feature: polarIons
          .map((i) => `m/z ${Math.round(i.mz)} (${i.ionAssignment})`)
          .join(", "),
        value: polarIons[0]?.mz ?? 45,
        unit: "m/z",
        supportLevel: "MODERATE",
        confidence: conf,
        uncertainty: Number((1 - conf).toFixed(2)),
        status: "POSSIBLE",
        provenance: prov,
        scientificBasis: this.scientificTheoryBasis,
        category: "Functional Group",
        sourceSpectrum: ["TOF_SIMS", "ToF-SIMS"],
        supportingSignals: polarIons.map((i) => ({
          modality: "ToF-SIMS",
          signalLabel: `m/z ${i.mz} (${i.intensity}%, polarity: ${i.polarity})`,
          observedValue: `m/z ${i.mz}`,
          interpretation: i.ionAssignment,
          confidence: i.confidence,
        })),
        contradictingSignals: [],
        interpretation: `Polar surface secondary ions observed. (${conditionNote})`,
        possibleFunctionalGroups: isNitrogen
          ? ["Amine / Amide surface group"]
          : ["Alcohol / Ether / Ester oxygenated surface group"],
        possibleStructuralMotifs: [
          polarIons[0]?.fragmentClass || "Polar surface motif",
        ],
        evidenceStrength: "Suggestive",
        contradictions: [],
        limitations: [conditionNote],
        provenanceType: "EMPIRICAL",
      });
    }

    return evidence;
  }

  deriveStructuralConstraints(
    spectrum?: ExperimentalSpectrumData
  ): StructuralConstraints {
    if (!spectrum) {
      return { source: "MS", confidence: 0, evidence: [] };
    }
    const specWithTofSims: ExperimentalSpectrumData = {
      ...spectrum,
      msParams: {
        ...spectrum.msParams,
        ionization: spectrum.msParams?.ionization || "SIMS / ToF-SIMS",
        msType: "ToF-SIMS",
      },
    };
    return MSAnalysisEngine.buildMSStructuralConstraints(specWithTofSims);
  }

  static analyze(spectrum?: ExperimentalSpectrumData) {
    const instance = new ToFSIMSScientificEngine();
    return {
      physicsModel: instance.extractPhysicsModel(spectrum),
      extractedEvidence: instance.generateEvidence(spectrum),
      structuralConstraints: instance.deriveStructuralConstraints(spectrum),
    };
  }
}
