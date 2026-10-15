import {initializeRDKit,canonicalizeMolecule} from '../scientificEngines/rdkitAdapter';
beforeAll(()=>initializeRDKit());
import { beforeAll, describe, expect, it } from "vitest";
import { CandidateGenerator } from "../candidateGenerator";
import { ChemicalFeatureEngine } from "../chemicalFeatureEngine";
import { ChemistryEngine } from "../chemistryEngine";
import { NMRAnalysisEngine } from "../nmrEngine";
import {
  DEUTERATED_SOLVENT_PROFILES,
  NMR_LITERATURE_REGISTRY,
  NMRGraphPredictor,
  SpinCouplingCalculator,
  TRACE_IMPURITY_REFERENCE_TABLE,
} from "../scientificEngines/nmrReferenceDatabase";
import { NMRScientificEngine } from "../scientificEngines/nmrScientificEngine";
import { ExperimentalSpectrumData, SpectralPeak } from "../../types/spectrum";

function makeSpectrum(
  modality: "1H_NMR" | "13C_NMR",
  peaks: SpectralPeak[],
  nmrSolvent: ExperimentalSpectrumData["nmrSolvent"] = "CDCl3",
  spectrometerFrequencyMHz = 400
): ExperimentalSpectrumData {
  return {
    modality,
    fileName: `test_${modality}.jdx`,
    sourceFormat: "JCAMP-DX",
    isSimulated: false,
    nmrSolvent,
    spectrometerFrequencyMHz,
    temperatureK: 298,
    xUnit: "ppm",
    yUnit: "intensity",
    points: peaks.map((p) => ({ x: p.x, y: p.y })),
    peaks,
    validation: {
      isValid: true,
      pointCount: peaks.length,
      xRange: [0, modality === "1H_NMR" ? 14 : 220],
      yRange: [0, 100],
      issues: [],
      
      qualityScore: 95,
    },
  };
}

describe("SpecReader Phase 2 — ¹H NMR / ¹³C NMR Scientific Engine Comprehensive Tests", () => {
  it("0. 驗證 NMR 文獻來源資料庫完整性與 DOI 追溯性 (Section 二)", () => {
    const lit = NMRScientificEngine.getLiteratureRegistry();
    expect(lit.JONAS_2022_MRC.doi).toBe("10.1002/mrc.5234");
    expect(lit.CASABIANCA_2020_MRC.doi).toBe("10.1002/mrc.4994");
    expect(lit.GOTTLIEB_1997_JOC.doi).toBe("10.1021/jo971176v");
    expect(lit.FULMER_2010_ORGANOMET.doi).toBe("10.1021/om100106e");
    expect(lit.BABIJ_2016_OPRD.doi).toBe("10.1021/acs.oprd.5b00417");
    expect(lit.BUHL_2011_WCMS.doi).toBe("10.1002/wcms.63");

    const engine = new NMRScientificEngine();
    expect(engine.quantumBackend.status).toBe("NOT_CONNECTED");
    expect(engine.quantumBackend.scientificHonestyNote).toContain("10.1002/wcms.63");
    expect(TRACE_IMPURITY_REFERENCE_TABLE.length).toBeGreaterThanOrEqual(8);
  });

  it("1. 簡單烷烴、醇、醚、酮、酯、羧酸、醯胺的 ¹H／¹³C 分子圖環境預測與修正項追溯 (Section 三、六、八.1)", () => {
    const testCases = [
      {
        name: "Butane (烷烴)",
        smiles: "CCCC",
        formula: "C4H10",
        expectH1Envs: 2,
        expectC13Envs: 2,
      },
      {
        name: "Ethanol (醇)",
        smiles: "CCO",
        formula: "C2H6O",
        expectH1Envs: 3, // CH3, CH2, OH
        expectC13Envs: 2,
      },
      {
        name: "1,2-Dimethoxyethane (醚)",
        smiles: "COCCOC",
        formula: "C4H10O2",
        expectH1Envs: 2, // Symmetric! 2x OCH3 + 2x OCH2
        expectC13Envs: 2,
      },
      {
        name: "2-Butanone (酮)",
        smiles: "CCC(=O)C",
        formula: "C4H8O",
        expectH1Envs: 3,
        expectC13Envs: 4,
      },
      {
        name: "Ethyl acetate (酯)",
        smiles: "CCOC(=O)C",
        formula: "C4H8O2",
        expectH1Envs: 3,
        expectC13Envs: 4,
      },
      {
        name: "Butyric acid (羧酸)",
        smiles: "CCCC(=O)O",
        formula: "C4H8O2",
        expectH1Envs: 4, // CH3, CH2, CH2, COOH
        expectC13Envs: 4,
      },
      {
        name: "Acetamide (醯胺)",
        smiles: "CC(=O)N",
        formula: "C2H5NO",
        expectH1Envs: 2, // CH3 + NH2
        expectC13Envs: 2,
      },
    ];

    for (const tc of testCases) {
      const struct = ChemistryEngine.parseStructureInput({
        smiles: tc.smiles,
        formula: tc.formula,
        name: tc.name,
      });
      const h1Pred = NMRAnalysisEngine.predict1HNMRFromStructure(struct, {
        solvent: "CDCl3",
      });
      const c13Pred = NMRAnalysisEngine.predict13CNMRFromStructure(struct, {
        solvent: "CDCl3",
      });

      expect(h1Pred.environments.length).toBe(tc.expectH1Envs);
      expect(c13Pred.environments.length).toBe(tc.expectC13Envs);

      // Every predicted signal must carry literature sources, uncertainty, and appliedCorrections
      for (const env of h1Pred.environments) {
        expect(env.uncertaintyPpm).toBeGreaterThan(0);
        expect(env.appliedCorrections?.length).toBeGreaterThan(0);
        expect(env.literatureSources?.length).toBeGreaterThan(0);
        expect(env.expectedProtonCount).toBeGreaterThan(0);
      }
      for (const cEnv of c13Pred.environments) {
        expect(cEnv.uncertaintyPpm).toBeGreaterThan(0);
        expect(cEnv.appliedCorrections?.length).toBeGreaterThan(0);
        expect(cEnv.deptCompatibility).toBeDefined();
      }
    }
  });

  it("2. 單取代苯、鄰／間／對二取代苯的 ¹H 耦合與 ¹³C 對稱性分析 (Section 三、六、八.2)", () => {
    const mono = ChemistryEngine.parseStructureInput({
      smiles: "CCOC(=O)c1ccccc1",
      formula: "C9H10O2",
      name: "Ethyl benzoate",
    });
    const ortho = ChemistryEngine.parseStructureInput({
      smiles: "CC(=O)Oc1ccccc1C(=O)O",
      formula: "C9H8O4",
      name: "Aspirin (1,2-ortho)",
    });
    const meta = ChemistryEngine.parseStructureInput({
      smiles: "CC(=O)Oc1cccc(C(=O)O)c1",
      formula: "C9H8O4",
      name: "3-Acetoxybenzoic acid (1,3-meta)",
    });
    const para = ChemistryEngine.parseStructureInput({
      smiles: "CC(=O)Oc1ccc(C(=O)O)cc1",
      formula: "C9H8O4",
      name: "4-Acetoxybenzoic acid (1,4-para)",
    });

    const monoC13 = NMRGraphPredictor.predict13CFromStructureGraph(mono);
    const orthoC13 = NMRGraphPredictor.predict13CFromStructureGraph(ortho);
    const metaC13 = NMRGraphPredictor.predict13CFromStructureGraph(meta);
    const paraC13 = NMRGraphPredictor.predict13CFromStructureGraph(para);

    // Ethyl benzoate has C2v symmetry on the phenyl ring: 4 unique aromatic C + 1 C=O + 2 ethoxy C = 7 signals
    expect(monoC13.environments.length).toBe(7);
    // Ortho and Meta C9H8O4 have no symmetry plane bisecting the ring: 9 unique carbons!
    expect(orthoC13.environments.length).toBe(9);
    expect(metaC13.environments.length).toBe(9);
    // Para C9H8O4 has C2v symmetry on the benzene ring: 4 unique aromatic C + 2 C=O + 1 CH3 = 7 unique carbons!
    expect(paraC13.environments.length).toBe(7);

    // Check Para 1H AA'BB' magnetic non-equivalence detection
    const paraH1 = NMRGraphPredictor.predict1HFromStructureGraph(para);
    const arParaEnvs = paraH1.environments.filter(
      (e) => e.chemicalEnvironmentClass === "AROMATIC_BENZENE_CH"
    );
    expect(arParaEnvs.length).toBe(2);
    expect(arParaEnvs[0].integration).toBe(2);
    expect(arParaEnvs[1].integration).toBe(2);
    expect(arParaEnvs[0].spinCouplingAnalysis?.isMagneticNonEquivalent).toBe(true);
    expect(arParaEnvs[0].spinCouplingAnalysis?.spinSystemNotation).toBe("AA'BB'");
  });

  it("3. 吡啶與雜芳環的 ¹H／¹³C 特徵位移與耦合 (Section 三、四、六、八.3)", () => {
    const pyr = ChemistryEngine.parseStructureInput({
      smiles: "c1ccncc1",
      formula: "C5H5N",
      name: "Pyridine",
    });
    const h1 = NMRAnalysisEngine.predict1HNMRFromStructure(pyr);
    const c13 = NMRAnalysisEngine.predict13CNMRFromStructure(pyr);

    // Pyridine has 3 unique 1H environments (H-2,6 at ~8.58 ppm; H-4 at ~7.66 ppm; H-3,5 at ~7.26 ppm)
    expect(h1.environments.length).toBe(3);
    const alphaH = h1.environments.find(
      (e) => e.chemicalEnvironmentClass === "PYRIDINE_ALPHA_CH"
    );
    expect(alphaH).toBeDefined();
    expect(alphaH!.shiftPpm).toBeGreaterThan(8.3);
    expect(alphaH!.integration).toBe(2);

    // Pyridine has 3 unique 13C environments (C-2,6 ~149.9 ppm; C-4 ~135.9 ppm; C-3,5 ~123.8 ppm)
    expect(c13.environments.length).toBe(3);
    expect(c13.environments[0].shiftPpm).toBeCloseTo(149.9, 0);
  });

  it("4. 烯烴 cis／trans／geminal J 值判讀與複合分裂樹模擬 (Section 四、八.4)", () => {
    // Test SpinCouplingCalculator on a terminal vinyl CH=CH2 group (dd with trans J=17.2 Hz, cis J=10.5 Hz)
    const mult = SpinCouplingCalculator.deriveMultipletNotation([
      { jHz: 17.2, partnerProtons: 1, couplingType: "trans-alkene (3J)" },
      { jHz: 10.5, partnerProtons: 1, couplingType: "cis-alkene (3J)" },
    ]);
    expect(mult.code).toBe("dd");
    expect(mult.descriptionZh).toContain("Doublet of doublets");

    const lines = SpinCouplingCalculator.simulateFirstOrderMultiplet(
      6.72,
      [
        { jHz: 17.2, partnerProtons: 1 },
        { jHz: 10.5, partnerProtons: 1 },
      ],
      400
    );
    expect(lines.length).toBe(4); // dd produces 4 equal-intensity lines

    // Test experimental 1H NMR with trans-alkene (J = 16.2 Hz) vs cis-alkene (J = 10.8 Hz)
    const expVinylSpec = makeSpectrum("1H_NMR", [
      {
        id: "v1",
        x: 6.75,
        y: 80,
        integration: 1,
        multiplicity: "dd",
        jValues: [16.8, 10.4],
      },
      {
        id: "v2",
        x: 5.78,
        y: 80,
        integration: 1,
        multiplicity: "dd",
        jValues: [16.8, 1.4],
      },
      {
        id: "v3",
        x: 5.26,
        y: 80,
        integration: 1,
        multiplicity: "dd",
        jValues: [10.4, 1.4],
      },
    ]);
    const analyzed = NMRAnalysisEngine.analyzeExperimental1HNMR(expVinylSpec);
    expect(
      analyzed.protonSummary.spinSystems.some((s) =>
        s.patternName.includes("單取代末端乙烯基")
      )
    ).toBe(true);
    const v1Couplings = analyzed.environments[0].couplings || [];
    expect(
      v1Couplings.some((c) => c.couplingType === "trans-alkene (3J)")
    ).toBe(true);
    expect(
      v1Couplings.some((c) => c.couplingType === "cis-alkene (3J)")
    ).toBe(true);
  });

  it("5. CH₂CH₃、CH(CH₃)₂、CH₂–CH₂ 等常見自旋耦合系統自動辨識 (Section 四、八.5)", () => {
    // Isopropyl group -CH(CH3)2 + Ethyl group -CH2CH3
    const expSpec = makeSpectrum("1H_NMR", [
      {
        id: "eth-q",
        x: 4.12,
        y: 82,
        integration: 2,
        multiplicity: "q",
        jValues: [7.1],
      },
      {
        id: "ipr-sep",
        x: 2.58,
        y: 65,
        integration: 1,
        multiplicity: "m",
        jValues: [6.9],
      },
      {
        id: "eth-t",
        x: 1.26,
        y: 95,
        integration: 3,
        multiplicity: "t",
        jValues: [7.1],
      },
      {
        id: "ipr-d",
        x: 1.16,
        y: 98,
        integration: 6,
        multiplicity: "d",
        jValues: [6.9],
      },
    ]);

    const analyzed = NMRAnalysisEngine.analyzeExperimental1HNMR(expSpec);
    const patterns = analyzed.protonSummary.spinSystems.map((s) => s.patternName);
    expect(patterns.some((p) => p.includes("乙基") || p.includes("乙氧基"))).toBe(true);
    expect(patterns.some((p) => p.includes("異丙基"))).toBe(true);
  });

  it("6. CDCl₃、DMSO-d₆、CD₃OD、D₂O 等溶劑峰、水分峰與 Gottlieb/Fulmer 痕量雜質峰排除 (Section 五、八.6)", () => {
    // Test DMSO-d6 spectrum containing residual DMSO-d5 (2.50 ppm) and H2O (3.33 ppm) + real paracetamol peaks
    const dmsoSpec = makeSpectrum(
      "1H_NMR",
      [
        { id: "nh", x: 9.65, y: 70, integration: 1, multiplicity: "s" },
        { id: "oh", x: 9.15, y: 70, integration: 1, multiplicity: "s" },
        { id: "ar1", x: 7.34, y: 92, integration: 2, multiplicity: "d", jValues: [8.8] },
        { id: "ar2", x: 6.68, y: 90, integration: 2, multiplicity: "d", jValues: [8.8] },
        { id: "water", x: 3.33, y: 85, integration: 4.5, multiplicity: "s" },
        { id: "dmso", x: 2.50, y: 60, integration: 0.8, multiplicity: "m" },
        { id: "ac", x: 1.98, y: 98, integration: 3, multiplicity: "s" },
      ],
      "DMSO-d6"
    );

    const analyzed = NMRAnalysisEngine.analyzeExperimental1HNMR(dmsoSpec);
    // Water (3.33 ppm) and DMSO-d5 (2.50 ppm) must be excluded from sample proton environments!
    expect(analyzed.environments.length).toBe(5);
    expect(analyzed.protonSummary.totalIntegratedProtons).toBeNull();
    expect(analyzed.integrationSemantics.rawIntegralSum).toBe(9);
    const waterPeak = analyzed.annotatedPeaks.find((p) => p.id === "water");
    const dmsoPeak = analyzed.annotatedPeaks.find((p) => p.id === "dmso");
    expect(waterPeak?.signalRole).toBe("WATER");
    expect(dmsoPeak?.signalRole).toBe("SOLVENT");

    // Verify 13C solvent exclusion in DMSO-d6 (39.52 ppm) and CD3OD (49.00 ppm)
    const c13Dmso = makeSpectrum(
      "13C_NMR",
      [
        { id: "c1", x: 168.1, y: 60, deptType: "C" },
        { id: "c2", x: 153.2, y: 58, deptType: "C" },
        { id: "c3", x: 131.1, y: 55, deptType: "C" },
        { id: "c4", x: 120.9, y: 90, deptType: "CH" },
        { id: "c5", x: 115.1, y: 88, deptType: "CH" },
        { id: "c-solv", x: 39.52, y: 95, deptType: "Unknown" },
        { id: "c6", x: 23.8, y: 82, deptType: "CH3" },
      ],
      "DMSO-d6"
    );
    const c13Analyzed = NMRAnalysisEngine.analyzeExperimental13CNMR(c13Dmso);
    expect(c13Analyzed.summary.uniqueCarbonCount).toBe(6);
    expect(c13Analyzed.excludedSolventShifts).toContain(39.52);

    // Check D2O and CD3OD protic deuterium exchange properties
    expect(DEUTERATED_SOLVENT_PROFILES.D2O.causesProticDeuteriumExchange).toBe(true);
    expect(DEUTERATED_SOLVENT_PROFILES.CD3OD.causesProticDeuteriumExchange).toBe(true);
  });

  it("7. 可交換氫 (-OH/-COOH/-NH) 造成實驗積分少於總氫數但碳上氫數完全吻合時判定為相容 (Section 五、七、八.7)", () => {
    // Aspirin C9H8O4 has 8 total H (7 carbon-attached H + 1 exchangeable COOH).
    // In D2O or moist CD3OD/CDCl3 where -COOH exchanges out, only 7H are observed on carbon!
    const exp7HSpec = makeSpectrum(
      "1H_NMR",
      [
        { id: "p1", x: 8.08, y: 80, integration: 1, multiplicity: "dd", jValues: [7.8, 1.6] },
        { id: "p2", x: 7.62, y: 78, integration: 1, multiplicity: "td", jValues: [7.8, 1.6] },
        { id: "p3", x: 7.34, y: 76, integration: 1, multiplicity: "td", jValues: [7.6, 1.2] },
        { id: "p4", x: 7.14, y: 78, integration: 1, multiplicity: "dd", jValues: [8.0, 1.2] },
        { id: "p5", x: 2.35, y: 98, integration: 3, multiplicity: "s" },
      ],
      "CD3OD"
    );

    const aspirinStruct = ChemistryEngine.parseStructureInput({
      smiles: "CC(=O)Oc1ccccc1C(=O)O",
      formula: "C9H8O4",
      name: "Aspirin",
    });

    const consistency = NMRAnalysisEngine.evaluateCandidateNMRConsistency({
      candidateStructure: aspirinStruct,
      expH1Spectrum: exp7HSpec,
      authoritativeTargetFormula: "C9H8O4",
    });

    expect(consistency.protonIntegrationConsistency.computedTotalH).toBe(8);
    expect(consistency.protonIntegrationConsistency.computedCarbonAttachedH).toBe(7);
    expect(consistency.protonIntegrationConsistency.computedExchangeableH).toBe(1);
    expect(consistency.protonIntegrationConsistency.status).toBe(
      "CONSISTENT_WITH_EXCHANGEABLE_OR_OVERLAP"
    );
    expect(consistency.structuralContradictions.length).toBe(0);
  });

  it("8. 積分明顯矛盾時排除或大幅降分錯誤候選結構 (Section 七、八.8)", () => {
    // Experimental spectrum clearly has 10H (e.g., Ethyl benzoate 5H + 2H + 3H = 10H),
    // evaluated against a C9H8O4 structure (only 8H total): must report CONTRADICTED!
    const exp10HSpec = makeSpectrum("1H_NMR", [
      { id: "ar1", x: 8.05, y: 88, integration: 2, multiplicity: "d", jValues: [7.5] },
      { id: "ar2", x: 7.55, y: 70, integration: 1, multiplicity: "t", jValues: [7.4] },
      { id: "ar3", x: 7.44, y: 84, integration: 2, multiplicity: "t", jValues: [7.5] },
      { id: "ch2", x: 4.38, y: 85, integration: 2, multiplicity: "q", jValues: [7.1] },
      { id: "ch3", x: 1.39, y: 96, integration: 3, multiplicity: "t", jValues: [7.1] },
    ]);

    const wrongCandidate = ChemistryEngine.parseStructureInput({
      smiles: "CC(=O)Oc1ccccc1C(=O)O",
      formula: "C9H8O4",
      name: "Aspirin",
    });

    const consistency = NMRAnalysisEngine.evaluateCandidateNMRConsistency({
      candidateStructure: wrongCandidate,
      expH1Spectrum: exp10HSpec,
    });

    expect(consistency.protonIntegrationConsistency.status).toBe("CONTRADICTED");
    expect(consistency.overallStatus).toBe("STRUCTURAL_CONTRADICTION");
    expect(consistency.structuralContradictions.length).toBeGreaterThan(0);
  });

  it("9. 同一分子式 (C9H8O4) 下鄰／間／對位三種位置異構物的 NMR 區分能力 (Section 三、四、六、七、八.9)", () => {
    // Case A: Experimental 1H + 13C NMR of 1,4-para-acetoxybenzoic acid (AA'BB' 2H+2H in 1H, 7 unique 13C signals)
    const paraH1 = makeSpectrum("1H_NMR", [
      { id: "cooh", x: 11.8, y: 40, integration: 1, multiplicity: "br s" },
      { id: "ar-a", x: 8.10, y: 90, integration: 2, multiplicity: "d", jValues: [8.6] },
      { id: "ar-b", x: 7.20, y: 88, integration: 2, multiplicity: "d", jValues: [8.6] },
      { id: "ac", x: 2.32, y: 98, integration: 3, multiplicity: "s" },
    ]);
    const paraC13 = makeSpectrum("13C_NMR", [
      { id: "c1", x: 170.8, y: 60, deptType: "C" },
      { id: "c2", x: 168.9, y: 58, deptType: "C" },
      { id: "c3", x: 154.8, y: 55, deptType: "C" },
      { id: "c4", x: 131.8, y: 92, deptType: "CH" },
      { id: "c5", x: 127.1, y: 56, deptType: "C" },
      { id: "c6", x: 121.9, y: 90, deptType: "CH" },
      { id: "c7", x: 21.2, y: 85, deptType: "CH3" },
    ]);

    const bundlePara = ChemicalFeatureEngine.buildIntegratedBundle(
      { "1H_NMR": paraH1, "13C_NMR": paraC13 },
      undefined,
      { userSuppliedFormula: "C9H8O4" }
    );
    expect(bundlePara.constraints.aromaticSubstitutionPattern).toBe(
      "PARA_DISUBSTITUTED"
    );

    const pipelinePara = CandidateGenerator.executeUnifiedPipelineFromBundle(bundlePara);
    expect(pipelinePara.rankedCandidates.length).toBeGreaterThanOrEqual(3);
    // Top ranked candidate for para NMR must be the 1,4-para isomer!
    expect(canonicalizeMolecule(pipelinePara.rankedCandidates[0].smiles).canonical).toBe(canonicalizeMolecule("CC(=O)Oc1ccc(C(=O)O)cc1").canonical);

    // Case B: Experimental 1H + 13C NMR of 1,3-meta-acetoxybenzoic acid (1H isolated narrow s/t at 7.82 ppm + 3x1H, 9 unique 13C signals)
    const metaH1 = makeSpectrum("1H_NMR", [
      { id: "cooh", x: 11.7, y: 40, integration: 1, multiplicity: "br s" },
      { id: "ar-m1", x: 7.98, y: 80, integration: 1, multiplicity: "d", jValues: [7.8] },
      { id: "ar-m2", x: 7.82, y: 82, integration: 1, multiplicity: "s", jValues: [2.0] },
      { id: "ar-m3", x: 7.50, y: 78, integration: 1, multiplicity: "t", jValues: [7.9] },
      { id: "ar-m4", x: 7.32, y: 78, integration: 1, multiplicity: "d", jValues: [8.0] },
      { id: "ac", x: 2.33, y: 98, integration: 3, multiplicity: "s" },
    ]);
    const metaC13 = makeSpectrum("13C_NMR", [
      { id: "c1", x: 170.5, y: 60, deptType: "C" },
      { id: "c2", x: 169.2, y: 58, deptType: "C" },
      { id: "c3", x: 150.8, y: 55, deptType: "C" },
      { id: "c4", x: 131.5, y: 56, deptType: "C" },
      { id: "c5", x: 129.6, y: 84, deptType: "CH" },
      { id: "c6", x: 127.8, y: 84, deptType: "CH" },
      { id: "c7", x: 126.9, y: 82, deptType: "CH" },
      { id: "c8", x: 123.4, y: 82, deptType: "CH" },
      { id: "c9", x: 21.1, y: 85, deptType: "CH3" },
    ]);

    const bundleMeta = ChemicalFeatureEngine.buildIntegratedBundle(
      { "1H_NMR": metaH1, "13C_NMR": metaC13 },
      undefined,
      { userSuppliedFormula: "C9H8O4" }
    );
    expect(bundleMeta.constraints.aromaticSubstitutionPattern).toBe(
      "META_DISUBSTITUTED"
    );

    const pipelineMeta = CandidateGenerator.executeUnifiedPipelineFromBundle(bundleMeta);
    expect([
      "CC(=O)Oc1cccc(C(=O)O)c1",
      "OC(=O)c1cccc(OC(=O)C)c1",
    ]).toContain(pipelineMeta.rankedCandidates[0].smiles);
  });
});
