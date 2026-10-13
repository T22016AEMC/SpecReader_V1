import {
  CandidateNMRConsistencyAnalysis,
  CarbonEnvironment,
  CarbonNMRModel,
  ChemicalFeatureEvidence,
  EvidenceProvenance,
  ExperimentalSpectrumData,
  JCoupling,
  KarplusModel,
  NMRLiteratureReference,
  NMRQuantumBackendAdapter,
  ParsedChemicalStructure,
  ProtonEnvironment,
  ProtonNMRModel,
  SpectrumScientificEngine,
  StructuralConstraints,
  TwoDNMREvidenceProvider,
} from "../../types/spectrum";
import { NMRAnalysisEngine } from "../nmrEngine";
import {
  DEUTERATED_SOLVENT_PROFILES,
  NMR_LITERATURE_REGISTRY,
} from "./nmrReferenceDatabase";

export class DefaultKarplusModel implements KarplusModel {
  readonly modelName = "Karplus Vicinal 3J(H,H) Dihedral Relation Interface";
  readonly status = "INTERFACE_RESERVED" as const;

  estimateVicinalJFromDihedral(dihedralAngleDeg?: number): {
    estimatedJHz: number | null;
    dihedralAngle: number | "NOT_PROVIDED";
    note: string;
  } {
    if (typeof dihedralAngleDeg !== "number") {
      return {
        estimatedJHz: null,
        dihedralAngle: "NOT_PROVIDED",
        note: "3D conformer dihedral angle (ϕ) is NOT_PROVIDED; Karplus 3J(H,H) = A cos²ϕ + B cosϕ + C calculation is reserved for 3D geometry phase.",
      };
    }
    const rad = (dihedralAngleDeg * Math.PI) / 180;
    const cosPhi = Math.cos(rad);
    const jEst = Number(
      (7.76 * cosPhi * cosPhi - 1.1 * cosPhi + 1.4).toFixed(2)
    );
    return {
      estimatedJHz: jEst,
      dihedralAngle: dihedralAngleDeg,
      note: "Estimated via empirical Karplus equation interface.",
    };
  }
}

export class DefaultNMRQuantumBackendAdapter
  implements NMRQuantumBackendAdapter
{
  readonly adapterName =
    "NMRQuantumBackendAdapter (GIAO / DFT Magnetic Shielding Interface)";
  readonly status = "NOT_CONNECTED" as const;
  readonly supportedMethods: ("GIAO" | "DFT_SHIELDING")[] = [
    "GIAO",
    "DFT_SHIELDING",
  ];
  readonly fallbackMethod = "EMPIRICAL_ESTIMATE" as const;
  readonly scientificHonestyNote =
    "GIAO / DFT magnetic shielding tensor (σ_iso) calculation is NOT_CONNECTED (cf. Bühl, DOI: 10.1002/wcms.63). Chemical shifts δ are evaluated using traceable empirical substituent additivity rules and reference data (cf. Jonas et al., DOI: 10.1002/mrc.5234).";

  computeShieldingTensor(_smiles: string): {
    status: "NOT_CONNECTED";
    fallbackMethod: "REFERENCE_BASED" | "EMPIRICAL_ESTIMATE";
    message: string;
  } {
    return {
      status: "NOT_CONNECTED",
      fallbackMethod: "EMPIRICAL_ESTIMATE",
      message: this.scientificHonestyNote,
    };
  }
}

export class ReservedTwoDNMREvidenceProvider
  implements TwoDNMREvidenceProvider
{
  readonly providerName =
    "TwoDNMREvidenceProvider (Reserved for Phase 9 2D-NMR)";
  readonly supportedExperiments: (
    | "COSY"
    | "TOCSY"
    | "HSQC"
    | "HMQC"
    | "HMBC"
    | "NOESY"
    | "ROESY"
  )[] = ["COSY", "TOCSY", "HSQC", "HMQC", "HMBC", "NOESY", "ROESY"];
  readonly status = "INTERFACE_RESERVED_NOT_IMPLEMENTED" as const;

  extractEvidence(): ChemicalFeatureEvidence[] {
    return [];
  }
}

export interface NMRCombinedPhysicsModel {
  quantumBackend: NMRQuantumBackendAdapter;
  twoDNmrProvider: TwoDNMREvidenceProvider;
  protonModel: ProtonNMRModel;
  carbonModel: CarbonNMRModel;
  literatureReferences: NMRLiteratureReference[];
}

/**
 * Independent NMR Scientific Engine (Phase 2 Upgraded: Literature-backed 1H/13C Shielding, Spin Coupling Network, & Deuterated Solvent Effects)
 * Strictly separates ProtonNMRModel (¹H) and CarbonNMRModel (¹³C) while sharing molecular graph, solvent profiles, and provenance tracking.
 */
export class NMRScientificEngine
  implements SpectrumScientificEngine<NMRCombinedPhysicsModel>
{
  readonly engineName = "NMRScientificEngine";
  readonly engineVersion = "2.0.0-phase2-nmr-scientific-upgrade";
  readonly modality = "NMR" as const;
  readonly scientificTheoryBasis =
    "Nuclear Magnetic Resonance: Local Electronic Shielding (σ), Substituent Additivity (Z), Spin-Spin Coupling Network (J), & Deuterated Solvent Effects (Jonas 2022 DOI:10.1002/mrc.5234; Casabianca 2020 DOI:10.1002/mrc.4994; Gottlieb 1997; Fulmer 2010)";
  readonly quantumBackend: NMRQuantumBackendAdapter =
    new DefaultNMRQuantumBackendAdapter();
  readonly karplusModel: KarplusModel = new DefaultKarplusModel();
  readonly twoDNmrProvider: TwoDNMREvidenceProvider =
    new ReservedTwoDNMREvidenceProvider();

  static createProvenance(
    source: "H1_NMR" | "C13_NMR",
    confidence: number,
    method: "EMPIRICAL" | "REFERENCE_BASED" = "EMPIRICAL"
  ): EvidenceProvenance {
    const normConf = Number(Math.max(0, Math.min(1, confidence)).toFixed(2));
    return {
      source,
      model:
        source === "H1_NMR"
          ? "NMRScientificEngine.ProtonNMRModel"
          : "NMRScientificEngine.CarbonNMRModel",
      modelVersion: "2.0.0-phase2-nmr-scientific-upgrade",
      basis:
        source === "H1_NMR"
          ? "1H nuclear magnetic shielding (δ ppm), spin integration semantics, spin-coupling network (J Hz), and deuterated solvent effects (DOI:10.1002/mrc.5234, DOI:10.1002/mrc.4994)"
          : "13C nuclear magnetic shielding (δ ppm), carbon hybridization (sp/sp2/sp3), Grant-Paul/aromatic Z-additivity, quaternary T1 relaxation, and symmetry equivalence",
      method,
      isTheoretical: false,
      isEmpirical: method === "EMPIRICAL",
      isReferenceBased: method === "REFERENCE_BASED",
      isHeuristic: false,
      isQuantumBackend: false,
      confidence: normConf,
    };
  }

  /**
   * ¹H NMR Dedicated Physics Model (ProtonNMRModel)
   */
  extractProtonModel(spectrum?: ExperimentalSpectrumData): ProtonNMRModel {
    if (
      !spectrum ||
      spectrum.modality !== "1H_NMR" ||
      spectrum.digitizationFailed ||
      !spectrum.validation.isValid ||
      spectrum.peaks.length === 0
    ) {
      return {
        nucleus: "1H",
        spinQuantumNumber: 0.5,
        gyromagneticRatioMHzPerT: 42.577,
        observedEnvironments: [],
        couplings: [],
        totalIntegratedProtons: 0,
        karplusInterface: this.karplusModel,
        quantumBackendStatus: "NOT_CONNECTED",
        estimationMethod: "EMPIRICAL_ESTIMATE",
      };
    }

    const raw = NMRAnalysisEngine.analyzeExperimental1HNMR(spectrum);
    const couplings: JCoupling[] = [];

    const observedEnvironments: ProtonEnvironment[] = raw.environments.map(
      (env, idx) => {
        const atomId = env.atomId || `H_env_${idx + 1}`;
        const envCouplings: JCoupling[] =
          env.couplings && env.couplings.length > 0
            ? env.couplings
            : (env.jCouplingHz || []).map((jVal, jIdx) => {
                let couplingType: JCoupling["couplingType"] = "unassigned";
                if (env.shiftPpm >= 6.5 && env.shiftPpm <= 9.2) {
                  if (jVal >= 6.5 && jVal <= 9.5)
                    couplingType = "ortho-aromatic (3J)";
                  else if (jVal >= 4.2 && jVal < 6.5)
                    couplingType = "heteroaromatic-ortho (3J)";
                  else if (jVal >= 1.2 && jVal <= 3.5)
                    couplingType = "meta-aromatic (4J)";
                  else if (jVal < 1.2) couplingType = "para-aromatic (5J)";
                } else if (env.shiftPpm >= 4.5 && env.shiftPpm < 6.5) {
                  if (jVal >= 14.5 && jVal <= 19.0)
                    couplingType = "trans-alkene (3J)";
                  else if (jVal >= 9.0 && jVal < 14.5)
                    couplingType = "cis-alkene (3J)";
                  else if (jVal <= 3.5) couplingType = "geminal-alkene (2J)";
                } else if (jVal >= 11 && jVal <= 16) {
                  couplingType = "geminal (2J)";
                } else if (jVal >= 5.5 && jVal <= 8.5) {
                  couplingType = "vicinal (3J)";
                }

                return {
                  atomA: atomId,
                  atomB: env.coupledPartnerShift
                    ? `H_partner_δ${env.coupledPartnerShift}`
                    : `H_coupled_${idx + 1}_${jIdx + 1}`,
                  J: jVal,
                  couplingType,
                  dihedralAngle: "NOT_PROVIDED" as const,
                  confidence: Number((env.confidence / 100).toFixed(2)),
                };
              });

        couplings.push(...envCouplings);

        return {
          ...env,
          atomId,
          chemicalShift: env.shiftPpm,
          environment: env.environmentLabel,
          symmetry: env.symmetryNote,
          couplings: envCouplings,
        };
      }
    );

    const totalIntegratedProtons = observedEnvironments.reduce(
      (sum, e) => sum + (e.integration ?? 0),
      0
    );

    return {
      nucleus: "1H",
      spinQuantumNumber: 0.5,
      gyromagneticRatioMHzPerT: 42.577,
      observedEnvironments,
      couplings,
      totalIntegratedProtons,
      karplusInterface: this.karplusModel,
      quantumBackendStatus: "NOT_CONNECTED",
      estimationMethod: "EMPIRICAL_ESTIMATE",
    };
  }

  /**
   * ¹³C NMR Dedicated Physics Model (CarbonNMRModel)
   */
  extractCarbonModel(spectrum?: ExperimentalSpectrumData): CarbonNMRModel {
    if (
      !spectrum ||
      spectrum.modality !== "13C_NMR" ||
      spectrum.digitizationFailed ||
      !spectrum.validation.isValid ||
      spectrum.peaks.length === 0
    ) {
      return {
        nucleus: "13C",
        spinQuantumNumber: 0.5,
        gyromagneticRatioMHzPerT: 10.708,
        observedEnvironments: [],
        uniqueCarbonSignalCount: 0,
        quantumBackendStatus: "NOT_CONNECTED",
        estimationMethod: "EMPIRICAL_ESTIMATE",
      };
    }

    const raw = NMRAnalysisEngine.analyzeExperimental13CNMR(spectrum);
    const observedEnvironments: CarbonEnvironment[] =
      raw.summary.environments.map((c, idx) => {
        const hybridization: CarbonEnvironment["hybridization"] =
          c.hybridization ||
          (c.shiftPpm >= 100 && c.shiftPpm <= 225
            ? "sp2"
            : c.shiftPpm >= 65 && c.shiftPpm < 100 && c.assignment.includes("炔")
              ? "sp"
              : "sp3");

        return {
          ...c,
          atomId: c.atomId || `C_env_${idx + 1}`,
          chemicalShift: c.shiftPpm,
          hybridization,
          environment: c.assignment,
          equivalenceClass:
            c.equivalenceClass ||
            `Symmetry/Equivalence Class C_${idx + 1} (δ ${c.shiftPpm} ppm)`,
        };
      });

    return {
      nucleus: "13C",
      spinQuantumNumber: 0.5,
      gyromagneticRatioMHzPerT: 10.708,
      observedEnvironments,
      uniqueCarbonSignalCount: observedEnvironments.length,
      quantumBackendStatus: "NOT_CONNECTED",
      estimationMethod: "EMPIRICAL_ESTIMATE",
    };
  }

  extractPhysicsModel(
    spectrum?: ExperimentalSpectrumData
  ): NMRCombinedPhysicsModel {
    return {
      quantumBackend: this.quantumBackend,
      twoDNmrProvider: this.twoDNmrProvider,
      protonModel:
        spectrum?.modality === "1H_NMR"
          ? this.extractProtonModel(spectrum)
          : this.extractProtonModel(undefined),
      carbonModel:
        spectrum?.modality === "13C_NMR"
          ? this.extractCarbonModel(spectrum)
          : this.extractCarbonModel(undefined),
      literatureReferences: Object.values(NMR_LITERATURE_REGISTRY),
    };
  }

  static getSolventProfiles() {
    return DEUTERATED_SOLVENT_PROFILES;
  }

  static getLiteratureRegistry() {
    return NMR_LITERATURE_REGISTRY;
  }

  static evaluateCandidateNMRConsistency(params: {
    candidateStructure: ParsedChemicalStructure;
    expH1Spectrum?: ExperimentalSpectrumData;
    expC13Spectrum?: ExperimentalSpectrumData;
    authoritativeTargetFormula?: string | null;
  }): CandidateNMRConsistencyAnalysis {
    return NMRAnalysisEngine.evaluateCandidateNMRConsistency(params);
  }

  generateProtonEvidence(
    spectrum?: ExperimentalSpectrumData
  ): ChemicalFeatureEvidence[] {
    const model = this.extractProtonModel(spectrum);
    if (model.observedEnvironments.length === 0) return [];

    const evidence: ChemicalFeatureEvidence[] = [];
    for (const env of model.observedEnvironments) {
      const conf = Number((env.confidence / 100).toFixed(2));
      const prov = NMRScientificEngine.createProvenance(
        "H1_NMR",
        conf,
        "EMPIRICAL"
      );

      const hasHeteroAromaticCoupling = (env.couplings || []).some(
        (c) =>
          c.couplingType === "heteroaromatic-ortho (3J)" ||
          (c.J >= 4.2 && c.J <= 5.6 && env.shiftPpm >= 8.15 && env.shiftPpm <= 9.25)
      );
      const hasStandardBenzeneOrthoCoupling = (env.couplings || []).some(
        (c) => c.J >= 7.0 && c.J <= 9.2
      );

      let featureKey: ChemicalFeatureEvidence["featureKey"] = "ALIPHATIC_CHAIN";
      let inferenceLevel: ChemicalFeatureEvidence["inferenceLevel"] =
        "LEVEL_2_LOCAL_CHEMICAL_ENVIRONMENT";
      let alternativeExplanations: string[] = env.alternativeExplanations || [];
      let possibleFunctionalGroups: string[] = [env.environmentLabel];
      let possibleStructuralMotifs: string[] = [env.regionCategory];

      if (env.shiftPpm >= 9.3 && env.shiftPpm <= 10.6 && !env.isExchangeable) {
        featureKey = "ALDEHYDE";
        inferenceLevel = "LEVEL_3_FUNCTIONAL_GROUP_HYPOTHESIS";
        alternativeExplanations = [
          "分子內強氫鍵酚羥基 Ar-OH 或水楊酸/鄰羥基芳酮螯合質子 (9.5–13.0 ppm，通常為寬單峰或可氘交換)",
          "強去遮蔽醯胺或磺醯胺 N-H (DMSO-d6 中 9.3–10.6 ppm)",
        ];
      } else if (env.shiftPpm > 10.6 && env.shiftPpm <= 14.5) {
        featureKey = "CARBOXYLIC_ACID";
        inferenceLevel = "LEVEL_3_FUNCTIONAL_GROUP_HYPOTHESIS";
        alternativeExplanations = [
          "分子內六元環螯合酚羥基或 β-二酮烯醇 O-H (10.5–16.0 ppm)",
          "強去遮蔽雜環 N-H 或酸性磺醯亞胺 N-H",
        ];
      } else if (
        env.isExchangeable ||
        env.environmentLabel.includes("羥基") ||
        env.environmentLabel.includes("酚") ||
        env.environmentLabel.includes("-OH")
      ) {
        featureKey = "ALCOHOL_OR_PHENOL";
        inferenceLevel = "LEVEL_3_FUNCTIONAL_GROUP_HYPOTHESIS";
        possibleFunctionalGroups = [
          "醇羥基 Alcohol (-OH)",
          "酚羥基 Phenol (Ar-OH)",
          "可交換活潑氫 (Exchangeable O-H / N-H)",
        ];
        alternativeExplanations = [
          "一級/二級胺或醯胺可交換 N-H（若分子式含氮且 IR 具 N-H 吸收帶與 C-N 特徵）",
          "微量結晶水或溶劑交換水峰 H₂O / HOD",
        ];
      } else if (env.shiftPpm >= 8.2 && env.shiftPpm <= 9.25) {
        // Phase 3 Critical Anti-Bias Rule: Do NOT jump from 8.2–9.25 ppm directly to PYRIDINE_RING (Level 4)!
        // Only classify as HETEROAROMATIC_RING if characteristic 3J(H2,H3) ~ 4.4-5.5 Hz coupling is observed,
        // and even then keep EWG-substituted benzene as a competing hypothesis!
        if (hasHeteroAromaticCoupling && !hasStandardBenzeneOrthoCoupling) {
          featureKey = "HETEROAROMATIC_RING";
          inferenceLevel = "LEVEL_3_FUNCTIONAL_GROUP_HYPOTHESIS";
          possibleFunctionalGroups = [
            "去遮蔽雜芳環質子候選 (³J ≈ 4.4–5.5 Hz，如吡啶/嘧啶 α-H)",
            "強吸電子基取代芳香環 (-NO₂, -CN, -COR, -SO₂R 鄰位 Ar-H)",
          ];
          possibleStructuralMotifs = [
            "Deshielded Aromatic / Heteroaromatic C-H Environment (Level 2/3)",
          ];
        } else {
          featureKey = "AROMATIC_SYSTEM";
          inferenceLevel = "LEVEL_2_LOCAL_CHEMICAL_ENVIRONMENT";
          possibleFunctionalGroups = [
            "強去遮蔽芳香環質子 (如 -NO₂, -CN, -COR, -COOR, -SO₂R 鄰位苯環 H)",
            "多環芳烴或含氮雜芳環 α-H 競爭假設 (需分子式含 N 與 ³J ≈ 4.8 Hz 驗證)",
            "DMSO-d6 中之酚羥基 Ar-OH 或醯胺 CONH 單峰候選",
          ];
          possibleStructuralMotifs = [
            "Strongly Deshielded sp² Aromatic C-H or H-bonded X-H Environment (Level 2)",
          ];
        }
        alternativeExplanations = [
          "硝基苯、氰基苯、苯甲酸酯/苯乙酮/苯磺醯基等強吸電子基 (-EWG) 鄰位苯環質子 (δ 8.1–8.5 ppm)",
          "DMSO-d6 溶劑中之酚羥基 Ar-OH (δ 8.5–10.5 ppm) 或芳基醯胺 N-H (δ 8.2–10.2 ppm)",
          "含氮雜芳環 (如吡啶 H-2/H-6，僅在分子式含 N 且觀測到 ³J ≈ 4.4–5.5 Hz 耦合時支持)",
        ];
      } else if (env.shiftPpm >= 6.4 && env.shiftPpm < 8.2) {
        featureKey = "AROMATIC_SYSTEM";
        inferenceLevel = "LEVEL_3_FUNCTIONAL_GROUP_HYPOTHESIS";
        alternativeExplanations = [
          "共軛雙鍵烯烴質子 (=C-H，若具有 J_trans ≈ 15–17 Hz 或 J_cis ≈ 10–12 Hz)",
          "酚羥基 Ar-OH 或一級/二級醯胺 N-H 寬峰",
        ];
      } else if (env.shiftPpm >= 3.3 && env.shiftPpm <= 4.6) {
        featureKey =
          env.environmentLabel.includes("醇") || env.environmentLabel.includes("羥基")
            ? "ALCOHOL_OR_PHENOL"
            : "ETHER_OR_ALKOXY";
        inferenceLevel = "LEVEL_2_LOCAL_CHEMICAL_ENVIRONMENT";
        possibleFunctionalGroups = [
          "連接氧原子之烷氧基/醇次甲基或亞甲基 (-O-CH₃ / -O-CH₂- / HO-CH-)",
          "酯基烷氧基側鏈 (-C(=O)-O-CH₂- / -C(=O)-O-CH₃)",
          "苄基鹵素或雜原子鄰位亞甲基",
        ];
        alternativeExplanations = [
          "醇 α-H (HO-CH₂-/HO-CH-，若 IR 具 3200–3550 cm⁻¹ O-H 寬帶)",
          "醚或酯之烷氧基 (-O-CH₂-/-O-CH₃，若 IR 無 O-H 寬帶)",
          "芳香胺或脂肪胺可交換 -NH₂ 寬峰 (3.2–4.5 ppm)",
        ];
      } else if (
        env.shiftPpm >= 2.0 &&
        env.shiftPpm <= 2.9 &&
        env.environmentLabel.includes("炔")
      ) {
        featureKey = "ALKYNE";
        inferenceLevel = "LEVEL_3_FUNCTIONAL_GROUP_HYPOTHESIS";
      } else if (env.shiftPpm >= 1.95 && env.shiftPpm <= 2.85) {
        featureKey = "CARBONYL";
        inferenceLevel = "LEVEL_2_LOCAL_CHEMICAL_ENVIRONMENT";
        possibleFunctionalGroups = [
          "羰基 α-質子 (-C(=O)-CH₃ / -C(=O)-CH₂- / 乙醯氧基 CH₃COO- / 乙醯胺基 CH₃CONH-)",
          "芳香環苄基質子 (Ar-CH₃ / Ar-CH₂-)",
          "醇羥基可交換質子 (-OH，於 CDCl₃ 中常出現於 1.5–2.8 ppm 寬單峰)",
        ];
        alternativeExplanations = [
          "甲苯/二甲苯類之芳環甲基 (Ar-CH₃, δ 2.15–2.45 ppm, 無需含羰基)",
          "甲基酮、乙酸酯或乙醯胺之乙醯基甲基 (CH₃-C=O, δ 2.0–2.6 ppm)",
          "CDCl₃ 中之脂肪醇可交換 -OH 質子",
        ];
      }

      const signalKey = `H1_PEAK_${Math.round(env.shiftPpm * 20)}`;

      evidence.push({
        id: `h1-ev-${env.atomId}-${Math.round(env.shiftPpm * 100)}`,
        featureId: `h1-ev-${env.atomId}-${Math.round(env.shiftPpm * 100)}`,
        featureKey,
        featureName: `¹H NMR 質子磁遮蔽環境 (${env.environmentLabel})`,
        featureType: "1H Chemical Shift & Spin Coupling",
        feature: env.environmentLabel,
        value: env.shiftPpm,
        unit: "ppm",
        supportLevel: conf >= 0.8 ? "STRONG" : "MODERATE",
        confidence: conf,
        uncertainty: Number((1 - conf).toFixed(2)),
        status: conf >= 0.8 ? "SUPPORTED" : "POSSIBLE",
        provenance: prov,
        scientificBasis:
          "1H Nuclear Magnetic Shielding (σ), Spin Integration, & Scalar Spin-Spin Coupling (J Hz)",
        category: "Structural Motif",
        sourceSpectrum: ["H1_NMR", "1H_NMR"],
        sourceSignalKey: signalKey,
        inferenceLevel,
        alternativeExplanations,
        supportingSignals: [
          {
            modality: "1H_NMR",
            signalLabel: `δ ${env.shiftPpm} ppm (${
              env.integration !== null ? `${env.integration}H` : "?H"
            }, ${env.multiplicity || "?"}, J=${
              env.jCouplingHz.length > 0
                ? env.jCouplingHz.join("/") + " Hz"
                : "unresolved"
            })`,
            observedValue: `${env.shiftPpm} ppm`,
            interpretation: env.reasoning,
            confidence: conf,
          },
        ],
        contradictingSignals: [],
        interpretation: env.reasoning,
        possibleFunctionalGroups,
        possibleStructuralMotifs,
        evidenceStrength: conf >= 0.8 ? "Strong" : "Moderate",
        contradictions: [],
        limitations: [
          "Empirical chemical shift shielding correlation (NMRQuantumBackendAdapter GIAO status: NOT_CONNECTED). Single downfield shifts are evaluated at Level 2/3 without jumping directly to Level 4 heterocyclic scaffolds.",
        ],
        provenanceType: "EMPIRICAL",
      });
    }

    return evidence;
  }

  generateCarbonEvidence(
    spectrum?: ExperimentalSpectrumData
  ): ChemicalFeatureEvidence[] {
    const model = this.extractCarbonModel(spectrum);
    if (model.observedEnvironments.length === 0) return [];

    const evidence: ChemicalFeatureEvidence[] = [];
    for (const c of model.observedEnvironments) {
      const conf = Number((c.confidence / 100).toFixed(2));
      const prov = NMRScientificEngine.createProvenance(
        "C13_NMR",
        conf,
        "EMPIRICAL"
      );

      let featureKey: ChemicalFeatureEvidence["featureKey"] = "ALIPHATIC_CHAIN";
      let inferenceLevel: ChemicalFeatureEvidence["inferenceLevel"] =
        "LEVEL_2_LOCAL_CHEMICAL_ENVIRONMENT";
      let alternativeExplanations: string[] = c.alternativeExplanations || [];
      let possibleFunctionalGroups: string[] = [c.assignment];

      if (c.shiftPpm >= 188 && c.shiftPpm <= 220) {
        featureKey = "CARBONYL";
        inferenceLevel = "LEVEL_3_FUNCTIONAL_GROUP_HYPOTHESIS";
        possibleFunctionalGroups = ["酮基羰基碳 (Ketone C=O)", "醛基羰基碳 (Aldehyde CH=O)"];
        alternativeExplanations = [
          "若 DEPT 為 CH 且 ¹H 有 9.3–10.5 ppm 訊號則為醛基 (Aldehyde)；若為四級碳 C_quat 則為酮基 (Ketone)",
        ];
      } else if (c.shiftPpm >= 163 && c.shiftPpm < 188) {
        featureKey = "CARBONYL";
        inferenceLevel = "LEVEL_3_FUNCTIONAL_GROUP_HYPOTHESIS";
        possibleFunctionalGroups = [
          "羧酸衍生物羰基碳 (酯 Ester / 羧酸 Carboxylic Acid / 醯胺 Amide -C(=O)X)",
        ];
        alternativeExplanations = [
          "酯基 -COOR (165–176 ppm，搭配 IR ~1720–1750 cm⁻¹ 與 C-O 強帶)",
          "羧酸 -COOH (168–182 ppm，搭配 IR 2500–3300 cm⁻¹ 二聚體 O-H 寬帶)",
          "醯胺 -CONR₂ (163–175 ppm，搭配 IR 1630–1690 cm⁻¹ Amide I 帶與含氮分子式)",
        ];
      } else if (c.shiftPpm >= 145 && c.shiftPpm < 163) {
        // Phase 3 Critical Anti-Bias Rule: 145–163 ppm in 13C NMR is commonly Phenolic / Aryl Ether ipso C-O (Ar-OH, Ar-OR, Ar-OCOR) or EWG-substituted ipso Ar-C!
        // Never jump directly to PYRIDINE_RING!
        featureKey = "AROMATIC_SYSTEM";
        inferenceLevel = "LEVEL_2_LOCAL_CHEMICAL_ENVIRONMENT";
        possibleFunctionalGroups = [
          "連氧芳香四級碳 ipso Ar-O (酚 Ar-OH、芳基醚 Ar-OR、芳基酯 Ar-OCOR，δ 148–162 ppm)",
          "吸電子基取代芳香碳 (如 Ar-NO₂, δ ~148 ppm)",
          "含氮雜芳環鄰氮碳候選 (C=N α-C，僅在 DEPT 為 CH 且分子式含氮時作為競爭假設)",
        ];
        alternativeExplanations = [
          "酚羥基或甲氧基苯醚之連氧芳香碳 C_ipso-O (極常見於 150–162 ppm，完全不含氮)",
          "硝基苯或取代苯環之四級碳 (145–155 ppm)",
          "吡啶或亞胺 C=N 碳 (需分子式含 N 與 ¹H 耦合網路正交支持)",
        ];
      } else if (
        c.shiftPpm >= 114 &&
        c.shiftPpm <= 122 &&
        c.assignment.includes("腈")
      ) {
        featureKey = "NITRILE";
        inferenceLevel = "LEVEL_3_FUNCTIONAL_GROUP_HYPOTHESIS";
        alternativeExplanations = [
          "高遮蔽芳香環 CH 碳（如酚或苯胺鄰/對位碳 δ 114–121 ppm，極常見且不含腈基！）",
        ];
      } else if (c.shiftPpm >= 100 && c.shiftPpm < 145) {
        featureKey = "AROMATIC_SYSTEM";
        inferenceLevel = "LEVEL_2_LOCAL_CHEMICAL_ENVIRONMENT";
      } else if (
        c.shiftPpm >= 65 &&
        c.shiftPpm < 95 &&
        c.assignment.includes("炔")
      ) {
        featureKey = "ALKYNE";
        inferenceLevel = "LEVEL_2_LOCAL_CHEMICAL_ENVIRONMENT";
      } else if (c.shiftPpm >= 50 && c.shiftPpm < 95) {
        featureKey = "ETHER_OR_ALKOXY";
        inferenceLevel = "LEVEL_2_LOCAL_CHEMICAL_ENVIRONMENT";
        possibleFunctionalGroups = [
          "連氧飽和碳 C-O (醇 C-OH、醚 C-O-C、酯烷氧基 -O-CH₂-/-O-CH₃，δ 50–85 ppm)",
        ];
        alternativeExplanations = [
          "一級/二級/三級醇之 α-C-OH (搭配 IR 3200–3550 cm⁻¹ O-H 寬帶)",
          "醚或酯之烷氧基碳 (搭配無 O-H 之 IR C-O 伸縮帶)",
          "連氮或硝基脂肪碳 (C-N / C-NO₂，δ 50–70 ppm)",
        ];
      } else if (c.shiftPpm < 5) {
        featureKey = "SILOXANE_MOTIF";
        inferenceLevel = "LEVEL_3_FUNCTIONAL_GROUP_HYPOTHESIS";
      }

      const signalKey = `C13_PEAK_${Math.round(c.shiftPpm * 2)}`;

      evidence.push({
        id: `c13-ev-${c.atomId}-${Math.round(c.shiftPpm * 10)}`,
        featureId: `c13-ev-${c.atomId}-${Math.round(c.shiftPpm * 10)}`,
        featureKey,
        featureName: `¹³C NMR 碳核遮蔽與混成環境 (${c.assignment})`,
        featureType: "13C Chemical Shift & Hybridization",
        feature: `${c.assignment} (${c.hybridization})`,
        value: c.shiftPpm,
        unit: "ppm",
        supportLevel: conf >= 0.8 ? "STRONG" : "MODERATE",
        confidence: conf,
        uncertainty: Number((1 - conf).toFixed(2)),
        status: conf >= 0.8 ? "SUPPORTED" : "POSSIBLE",
        provenance: prov,
        scientificBasis:
          "13C Nuclear Magnetic Shielding, Hybridization (sp/sp2/sp3), and Equivalence Class",
        category: "Carbon Skeleton",
        sourceSpectrum: ["C13_NMR", "13C_NMR"],
        sourceSignalKey: signalKey,
        inferenceLevel,
        alternativeExplanations,
        supportingSignals: [
          {
            modality: "13C_NMR",
            signalLabel: `δ ${c.shiftPpm} ppm (${c.hybridization}, DEPT: ${c.deptType})`,
            observedValue: `${c.shiftPpm} ppm`,
            interpretation: c.assignment,
            confidence: conf,
          },
        ],
        contradictingSignals: [],
        interpretation: c.assignment,
        possibleFunctionalGroups,
        possibleStructuralMotifs: [c.regionCategory],
        evidenceStrength: conf >= 0.8 ? "Strong" : "Moderate",
        contradictions: [],
        limitations: [
          "Empirical 13C shielding correlation (NMRQuantumBackendAdapter GIAO status: NOT_CONNECTED). Downfield sp2 carbons (145–165 ppm) consider phenolic/aryl-ether C-O ipso carbons and EWG-substituted aromatic carbons alongside heteroaromatic hypotheses.",
        ],
        provenanceType: "EMPIRICAL",
      });
    }

    return evidence;
  }

  generateEvidence(
    spectrum?: ExperimentalSpectrumData
  ): ChemicalFeatureEvidence[] {
    if (!spectrum) return [];
    if (spectrum.modality === "1H_NMR") {
      return this.generateProtonEvidence(spectrum);
    }
    if (spectrum.modality === "13C_NMR") {
      return this.generateCarbonEvidence(spectrum);
    }
    return [];
  }

  deriveStructuralConstraints(
    spectrum?: ExperimentalSpectrumData
  ): StructuralConstraints {
    if (spectrum?.modality === "13C_NMR") {
      return NMRAnalysisEngine.build13CNMRStructuralConstraints(spectrum);
    }
    return NMRAnalysisEngine.build1HNMRStructuralConstraints(spectrum);
  }

  static analyze1H(spectrum?: ExperimentalSpectrumData) {
    const instance = new NMRScientificEngine();
    return {
      protonModel: instance.extractProtonModel(spectrum),
      extractedEvidence: instance.generateProtonEvidence(spectrum),
      structuralConstraints:
        NMRAnalysisEngine.build1HNMRStructuralConstraints(spectrum),
    };
  }

  static analyze13C(spectrum?: ExperimentalSpectrumData) {
    const instance = new NMRScientificEngine();
    return {
      carbonModel: instance.extractCarbonModel(spectrum),
      extractedEvidence: instance.generateCarbonEvidence(spectrum),
      structuralConstraints:
        NMRAnalysisEngine.build13CNMRStructuralConstraints(spectrum),
    };
  }
}
