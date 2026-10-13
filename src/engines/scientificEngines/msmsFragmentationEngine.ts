import {
  ChemicalFeatureEvidence,
  EvidenceProvenance,
  ExperimentalSpectrumData,
  FragmentRelation,
  NeutralLoss,
  PossibleCleavage,
  PrecursorIon,
  ProductIon,
  SpectrumScientificEngine,
  StructuralConstraints,
} from "../../types/spectrum";
import { MSAnalysisEngine } from "../msEngine";

export interface MSMSPhysicsModel {
  precursorIon: PrecursorIon | null;
  productIons: ProductIon[];
  neutralLosses: NeutralLoss[];
  fragmentRelations: FragmentRelation[];
  possibleCleavages: PossibleCleavage[];
}

/**
 * Independent MS/MS Fragmentation Scientific Engine (V5)
 * Scientific Basis:
 * Precursor Ion Isolation -> Ion Activation (CID / HCD) ->
 * Unimolecular Dissociation -> Product Ions + Possible Neutral Losses (H2O, CO, CO2, NH3, etc.).
 */
export class MSMSFragmentationEngine
  implements SpectrumScientificEngine<MSMSPhysicsModel>
{
  readonly engineName = "MSMSFragmentationEngine";
  readonly engineVersion = "1.0.0-scientific-foundation";
  readonly modality = "MSMS" as const;
  readonly scientificTheoryBasis =
    "Tandem Mass Spectrometry (MS/MS): Precursor Ion Activation, Product Ion Formation, and Possible Neutral Loss Pathways";

  static createProvenance(
    confidence: number,
    method: "EMPIRICAL" | "REFERENCE_BASED" = "EMPIRICAL"
  ): EvidenceProvenance {
    const normConf = Number(Math.max(0, Math.min(1, confidence)).toFixed(2));
    return {
      source: "MSMS",
      model: "MSMSFragmentationEngine",
      modelVersion: "1.0.0-scientific-foundation",
      basis:
        "precursor-to-product ion dissociation and possible neutral loss mass differences",
      method,
      isTheoretical: false,
      isEmpirical: method === "EMPIRICAL",
      isReferenceBased: method === "REFERENCE_BASED",
      isHeuristic: false,
      isQuantumBackend: false,
      confidence: normConf,
    };
  }

  extractPhysicsModel(spectrum?: ExperimentalSpectrumData): MSMSPhysicsModel {
    if (
      !spectrum ||
      spectrum.digitizationFailed ||
      !spectrum.validation.isValid ||
      spectrum.peaks.length === 0
    ) {
      return {
        precursorIon: null,
        productIons: [],
        neutralLosses: [],
        fragmentRelations: [],
        possibleCleavages: [],
      };
    }

    const sortedPeaks = spectrum.peaks
      .filter(
        (pk) =>
          pk.userClassification !== "SOLVENT" &&
          pk.userClassification !== "NOISE" &&
          pk.userClassification !== "IMPURITY"
      )
      .slice()
      .sort((a, b) => b.x - a.x);
    const precursorMz =
      spectrum.msParams?.precursorMz ??
      (sortedPeaks.length > 0 ? sortedPeaks[0].x : null);

    if (precursorMz === null) {
      return {
        precursorIon: null,
        productIons: [],
        neutralLosses: [],
        fragmentRelations: [],
        possibleCleavages: [],
      };
    }

    const ionization = spectrum.msParams?.ionization || "ESI+";
    const precursorIon: PrecursorIon = {
      mz: precursorMz,
      charge: ionization === "ESI-" ? -1 : 1,
      adductType:
        spectrum.msParams?.adductType && spectrum.msParams.adductType !== "Auto"
          ? spectrum.msParams.adductType
          : ionization === "ESI+"
            ? "[M+H]+"
            : ionization === "ESI-"
              ? "[M-H]-"
              : "[M]+•",
      activationMethod:
        spectrum.msParams?.msType === "MS/MS" ? "CID" : "NOT_PROVIDED",
      collisionEnergyEv:
        typeof spectrum.msParams?.collisionEnergyEv === "number"
          ? spectrum.msParams.collisionEnergyEv
          : "NOT_PROVIDED",
    };

    const productIons: ProductIon[] = [];
    const neutralLosses: NeutralLoss[] = [];
    const fragmentRelations: FragmentRelation[] = [];
    const possibleCleavages: PossibleCleavage[] = [];

    for (const pk of sortedPeaks) {
      if (Math.abs(pk.x - precursorMz) <= 0.4) continue;
      const mzRound = Math.round(pk.x);
      let possibleFormula = "Product ion fragment";
      let structuralMotifHint: string | undefined = undefined;
      let productMechanismType: PossibleCleavage["mechanismType"] | null = null;
      let productMechanismLabel: PossibleCleavage["mechanismLabel"] | undefined =
        undefined;

      if (mzRound === 43) {
        possibleFormula = "CH3CO+ / C3H7+";
        structuralMotifHint =
          "Acetyl acylium cation (CH3-C≡O+) or propyl cation via α-cleavage";
        productMechanismType = "alpha_cleavage";
        productMechanismLabel = "α-cleavage";
      } else if (mzRound === 58) {
        possibleFormula = "[CH3C(OH)=CH2]+•";
        structuralMotifHint =
          "Methyl ketone McLafferty rearrangement enol radical cation";
        productMechanismType = "McLafferty_rearrangement";
        productMechanismLabel = "McLafferty";
      } else if (mzRound === 60) {
        possibleFormula = "[CH2=C(OH)2]+•";
        structuralMotifHint =
          "Aliphatic carboxylic acid McLafferty rearrangement ion";
        productMechanismType = "McLafferty_rearrangement";
        productMechanismLabel = "McLafferty";
      } else if (mzRound === 74) {
        possibleFormula = "[CH2=C(OH)OCH3]+•";
        structuralMotifHint =
          "Methyl ester McLafferty rearrangement radical cation";
        productMechanismType = "McLafferty_rearrangement";
        productMechanismLabel = "McLafferty";
      } else if (mzRound === 77) {
        possibleFormula = "C6H5+";
        structuralMotifHint =
          "Monosubstituted phenyl cation (C6H5+) via α-cleavage";
        productMechanismType = "alpha_cleavage";
        productMechanismLabel = "α-cleavage";
      } else if (mzRound === 91) {
        possibleFormula = "C7H7+";
        structuralMotifHint =
          "Tropylium / benzyl cation (C7H7+) via Benzylic cleavage";
        productMechanismType = "benzylic_cleavage";
        productMechanismLabel = "Benzylic cleavage";
      } else if (mzRound === 94) {
        possibleFormula = "C6H6O+•";
        structuralMotifHint = "Phenol radical ion / phenoxy-related fragment";
        productMechanismType = "charge_directed_fragmentation";
        productMechanismLabel = "Charge-directed fragmentation";
      } else if (mzRound === 105) {
        possibleFormula = "C7H5O+";
        structuralMotifHint =
          "Benzoyl acylium ion (Ph-C≡O+) via carbonyl α-cleavage";
        productMechanismType = "alpha_cleavage";
        productMechanismLabel = "α-cleavage";
      } else if (mzRound === 107) {
        possibleFormula = "C7H7O+";
        structuralMotifHint =
          "Methoxybenzyl / hydroxytropylium cation via Benzylic cleavage";
        productMechanismType = "benzylic_cleavage";
        productMechanismLabel = "Benzylic cleavage";
      } else if (mzRound === 109) {
        possibleFormula = "[M+H-CO]+ / C7H9O+";
        structuralMotifHint = "Product ion after -28 Da loss";
        productMechanismType = "charge_directed_fragmentation";
        productMechanismLabel = "Charge-directed fragmentation";
      } else if (mzRound === 120) {
        possibleFormula = "H2N-C6H4-CO+";
        structuralMotifHint =
          "p-Aminobenzoyl acylium cation via ester α-cleavage";
        productMechanismType = "alpha_cleavage";
        productMechanismLabel = "α-cleavage";
      } else if (mzRound === 135) {
        possibleFormula = "C8H7O2+";
        structuralMotifHint =
          "Methoxybenzoyl / anisoyl cation via aldehyde/ketone α-cleavage";
        productMechanismType = "alpha_cleavage";
        productMechanismLabel = "α-cleavage";
      }

      productIons.push({
        mz: Number(pk.x.toFixed(4)),
        intensity: Number(pk.y.toFixed(1)),
        charge: precursorIon.charge,
        possibleFormula,
        structuralMotifHint,
        confidence: pk.y >= 40 ? 0.82 : 0.72,
      });

      if (productMechanismType && structuralMotifHint) {
        possibleCleavages.push({
          mechanismType: productMechanismType,
          mechanismLabel: productMechanismLabel,
          status: "POSSIBLE_MECHANISM_HYPOTHESIS",
          relatedIonMz: Number(pk.x.toFixed(4)),
          structuralMotifImplied: `Candidate fragmentation pathway (${productMechanismLabel}): ${structuralMotifHint}`,
          confidence: pk.y >= 40 ? 0.8 : 0.72,
        });
      }

      const lossDa = Number((precursorMz - pk.x).toFixed(4));
      const lossRound = Math.round(lossDa);
      if (lossRound > 0) {
        let possibleIdentity: NeutralLoss["possibleIdentity"] | null = null;
        let scientificNote = "";
        let mechanismType: PossibleCleavage["mechanismType"] =
          "charge_directed_fragmentation";
        let mechanismLabel: PossibleCleavage["mechanismLabel"] =
          "Charge-directed fragmentation";

        if (lossRound === 1) {
          possibleIdentity = "H•";
          scientificNote =
            "Candidate fragmentation pathway (-1 Da, H•): α-cleavage of aldehyde C(O)-H or benzylic C-H bond.";
          mechanismType = "alpha_cleavage";
          mechanismLabel = "α-cleavage";
        } else if (lossRound === 15) {
          possibleIdentity = "CH3•";
          scientificNote =
            "Candidate fragmentation pathway (-15 Da, CH3•): α-cleavage of methyl ketone, methoxy ether, or methyl substituent.";
          mechanismType = "alpha_cleavage";
          mechanismLabel = "α-cleavage";
        } else if (lossRound === 18) {
          possibleIdentity = "H2O";
          scientificNote =
            "Candidate fragmentation pathway (-18 Da, H2O): charge-directed dehydration suggesting hydroxyl or carboxylic acid motif.";
          mechanismType = "charge_directed_fragmentation";
          mechanismLabel = "Charge-directed fragmentation";
        } else if (lossRound === 17) {
          possibleIdentity = "NH3";
          scientificNote =
            "Candidate fragmentation pathway (-17 Da, NH3 or OH•): charge-directed deamination suggesting primary amine or amide.";
          mechanismType = "charge_directed_fragmentation";
          mechanismLabel = "Charge-directed fragmentation";
        } else if (lossRound === 27) {
          possibleIdentity = "HCN";
          scientificNote =
            "Candidate fragmentation pathway (-27 Da, HCN): ring contraction elimination characteristic of pyridine / N-heterocycles or aromatic amines.";
          mechanismType = "charge_directed_fragmentation";
          mechanismLabel = "Charge-directed fragmentation";
        } else if (lossRound === 28) {
          possibleIdentity = "CO / C2H4";
          scientificNote =
            "Candidate fragmentation pathway (-28 Da, CO or C2H4): compatible with McLafferty γ-H alkene elimination (-C2H4) or carbonyl CO extrusion.";
          mechanismType = "McLafferty_rearrangement";
          mechanismLabel = "McLafferty";
        } else if (lossRound === 29) {
          possibleIdentity = "CHO• / C2H5•";
          scientificNote =
            "Candidate fragmentation pathway (-29 Da, CHO• or C2H5•): α-cleavage of aldehyde formyl group or ethyl radical.";
          mechanismType = "alpha_cleavage";
          mechanismLabel = "α-cleavage";
        } else if (lossRound === 31) {
          possibleIdentity = "OCH3•";
          scientificNote =
            "Candidate fragmentation pathway (-31 Da, OCH3•): α-cleavage of methyl ester or methoxy group.";
          mechanismType = "alpha_cleavage";
          mechanismLabel = "α-cleavage";
        } else if (lossRound === 32) {
          possibleIdentity = "CH3OH";
          scientificNote =
            "Candidate fragmentation pathway (-32 Da, CH3OH): charge-directed methanol elimination from methyl ester or ortho-methoxy motif.";
          mechanismType = "charge_directed_fragmentation";
          mechanismLabel = "Charge-directed fragmentation";
        } else if (lossRound === 42) {
          possibleIdentity = "C3H6 / CH2CO";
          scientificNote =
            "Candidate fragmentation pathway (-42 Da, C3H6 or ketene): McLafferty γ-H rearrangement propene loss or ketene elimination.";
          mechanismType = "McLafferty_rearrangement";
          mechanismLabel = "McLafferty";
        } else if (lossRound === 43) {
          possibleIdentity = "CH3CO•";
          scientificNote =
            "Candidate fragmentation pathway (-43 Da, CH3CO• or C3H7•): α-cleavage of acetyl or propyl substituent.";
          mechanismType = "alpha_cleavage";
          mechanismLabel = "α-cleavage";
        } else if (lossRound === 44) {
          possibleIdentity = "CO2";
          scientificNote =
            "Candidate fragmentation pathway (-44 Da, CO2): charge-directed decarboxylation of carboxylic acid or lactone.";
          mechanismType = "charge_directed_fragmentation";
          mechanismLabel = "Charge-directed fragmentation";
        } else if (lossRound === 45) {
          possibleIdentity = "OC2H5• / COOH•";
          scientificNote =
            "Candidate fragmentation pathway (-45 Da, OC2H5• or COOH•): α-cleavage of ethyl ester ethoxy group or benzylic/carboxyl loss.";
          mechanismType = "alpha_cleavage";
          mechanismLabel = "α-cleavage";
        } else if (lossRound === 60) {
          possibleIdentity = "CH3COOH";
          scientificNote =
            "Candidate fragmentation pathway (-60 Da, CH3COOH): ortho-effect acetic acid elimination characteristic of o-acetoxybenzoic acid.";
          mechanismType = "charge_directed_fragmentation";
          mechanismLabel = "Charge-directed fragmentation";
        }

        if (possibleIdentity) {
          neutralLosses.push({
            precursorMz,
            productMz: Number(pk.x.toFixed(4)),
            lossDa,
            possibleIdentity,
            status: "POSSIBLE",
            scientificNote,
            confidence: 0.78,
          });
          fragmentRelations.push({
            parentIonMz: precursorMz,
            productIonMz: Number(pk.x.toFixed(4)),
            neutralLossDa: lossDa,
            possibleNeutralLoss: possibleIdentity,
            confidence: 0.78,
          });
          possibleCleavages.push({
            mechanismType,
            mechanismLabel,
            status: "POSSIBLE_MECHANISM_HYPOTHESIS",
            relatedIonMz: Number(pk.x.toFixed(4)),
            structuralMotifImplied: `Candidate fragmentation pathway (${mechanismLabel}): ${possibleIdentity} neutral loss hypothesis (${lossRound} Da)`,
            confidence: 0.76,
          });
        }
      }
    }

    return {
      precursorIon,
      productIons,
      neutralLosses,
      fragmentRelations,
      possibleCleavages,
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

    for (const nl of model.neutralLosses) {
      const prov = MSMSFragmentationEngine.createProvenance(
        nl.confidence,
        "EMPIRICAL"
      );
      let featureKey: ChemicalFeatureEvidence["featureKey"] = "CARBONYL";
      if (nl.possibleIdentity === "H2O") featureKey = "ALCOHOL_OR_PHENOL";
      else if (nl.possibleIdentity === "NH3") featureKey = "AMINE";
      else if (nl.possibleIdentity === "CO2") featureKey = "CARBOXYLIC_ACID";
      else if (nl.possibleIdentity === "CH3OH") featureKey = "ESTER";

      evidence.push({
        id: `msms-ev-nl-${Math.round(nl.lossDa)}-${Math.round(nl.productMz)}`,
        featureId: `msms-ev-nl-${Math.round(nl.lossDa)}-${Math.round(nl.productMz)}`,
        featureKey,
        featureName: `MS/MS 可能中性丟失證據 (Possible Neutral Loss -${Math.round(nl.lossDa)} Da: ${nl.possibleIdentity})`,
        featureType: "MS/MS Possible Neutral Loss",
        feature: `Possible Neutral Loss -${Math.round(nl.lossDa)} Da (${nl.possibleIdentity})`,
        value: nl.lossDa,
        unit: "Da",
        supportLevel: "MODERATE",
        confidence: nl.confidence,
        uncertainty: Number((1 - nl.confidence).toFixed(2)),
        status: "POSSIBLE",
        provenance: prov,
        scientificBasis: this.scientificTheoryBasis,
        category: "Structural Motif",
        sourceSpectrum: ["MSMS", "MS/MS"],
        supportingSignals: [
          {
            modality: "MS/MS",
            signalLabel: `Precursor m/z ${nl.precursorMz} -> Product m/z ${nl.productMz} (-${Math.round(nl.lossDa)} Da)`,
            observedValue: `-${nl.lossDa} Da`,
            interpretation: nl.scientificNote,
            confidence: nl.confidence,
          },
        ],
        contradictingSignals: [],
        interpretation: nl.scientificNote,
        possibleFunctionalGroups: [
          `Possible motif associated with -${Math.round(nl.lossDa)} Da (${nl.possibleIdentity})`,
        ],
        possibleStructuralMotifs: [
          `Possible Neutral Loss: ${nl.possibleIdentity}`,
        ],
        evidenceStrength: "Moderate",
        contradictions: [],
        limitations: [
          "Neutral loss mass difference is treated strictly as a POSSIBLE pathway hypothesis, not a unique mechanism proof.",
        ],
        provenanceType: "EMPIRICAL",
      });
    }

    for (const prod of model.productIons) {
      if (prod.structuralMotifHint) {
        const prov = MSMSFragmentationEngine.createProvenance(
          prod.confidence,
          "EMPIRICAL"
        );
        const mzRound = Math.round(prod.mz);
        evidence.push({
          id: `msms-ev-prod-${mzRound}`,
          featureId: `msms-ev-prod-${mzRound}`,
          featureKey: [77, 91, 94, 105, 135].includes(mzRound)
            ? "AROMATIC_SYSTEM"
            : "CARBONYL",
          featureName: `MS/MS 產物離子證據 (Product Ion m/z ${mzRound})`,
          featureType: "MS/MS Product Ion",
          feature: `${prod.possibleFormula} (${prod.structuralMotifHint})`,
          value: prod.mz,
          unit: "m/z",
          supportLevel: prod.intensity >= 50 ? "STRONG" : "MODERATE",
          confidence: prod.confidence,
          uncertainty: Number((1 - prod.confidence).toFixed(2)),
          status: "SUPPORTED",
          provenance: prov,
          scientificBasis: this.scientificTheoryBasis,
          category: "Structural Motif",
          sourceSpectrum: ["MSMS", "MS/MS"],
          supportingSignals: [
            {
              modality: "MS/MS",
              signalLabel: `Product ion m/z ${prod.mz} (${prod.intensity}%)`,
              observedValue: `m/z ${prod.mz}`,
              interpretation: prod.structuralMotifHint,
              confidence: prod.confidence,
            },
          ],
          contradictingSignals: [],
          interpretation: prod.structuralMotifHint,
          possibleFunctionalGroups: [prod.structuralMotifHint],
          possibleStructuralMotifs: [prod.possibleFormula],
          evidenceStrength: prod.intensity >= 50 ? "Strong" : "Moderate",
          contradictions: [],
          limitations: [],
          provenanceType: "EMPIRICAL",
        });
      }
    }

    return evidence;
  }

  deriveStructuralConstraints(
    spectrum?: ExperimentalSpectrumData
  ): StructuralConstraints {
    if (!spectrum) {
      return { source: "MS", confidence: 0, evidence: [] };
    }
    const specWithMsms: ExperimentalSpectrumData = {
      ...spectrum,
      msParams: {
        ...spectrum.msParams,
        msType: "MS/MS",
        ionization: spectrum.msParams?.ionization || "ESI+",
      },
    };
    return MSAnalysisEngine.buildMSStructuralConstraints(specWithMsms);
  }

  static analyze(spectrum?: ExperimentalSpectrumData) {
    const instance = new MSMSFragmentationEngine();
    return {
      physicsModel: instance.extractPhysicsModel(spectrum),
      extractedEvidence: instance.generateEvidence(spectrum),
      structuralConstraints: instance.deriveStructuralConstraints(spectrum),
    };
  }
}
