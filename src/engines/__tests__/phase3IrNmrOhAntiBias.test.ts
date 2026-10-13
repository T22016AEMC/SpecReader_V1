import { describe, expect, it } from "vitest";
import { CandidateGenerator } from "../candidateGenerator";
import { ChemicalFeatureEngine } from "../chemicalFeatureEngine";
import { ChemistryEngine } from "../chemistryEngine";
import { IRAnalysisEngine } from "../irEngine";
import { NMRAnalysisEngine } from "../nmrEngine";
import { ChemicalHardConstraintValidator } from "../scientificEngines/chemicalHardConstraintValidator";
import { WorkbenchOrchestrator } from "../workbenchOrchestrator";
import { ExperimentalSpectrumData, SpectralPeak } from "../../types/spectrum";

function makeSpectrum(
  modality: "IR" | "1H_NMR" | "13C_NMR",
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
    xUnit: modality === "IR" ? "cm⁻¹" : "ppm",
    yUnit: modality === "IR" ? "%" : "intensity",
    points: peaks.map((p) => ({ x: p.x, y: p.y })),
    peaks,
    validation: {
      isValid: true,
      pointCount: peaks.length,
      xRange:
        modality === "IR"
          ? [400, 4000]
          : [0, modality === "1H_NMR" ? 14 : 220],
      yRange: [0, 100],
      issues: [],
      
      qualityScore: 95,
    },
  };
}

describe("SpecReader Phase 3 — NMR / IR Joint Scientific Engine, OH/NH Interpretation & Anti-Bias Verification", () => {
  it("1. 含 OH 的醇類化合物 (Alcohol: 1-Propanol CCCO) — IR O-H + C-O 多峰協同與 NMR OH 判讀", () => {
    const irSpec = makeSpectrum("IR", [
      { id: "ir-oh", x: 3340, y: 72, width: 95, shape: "broad", isBroad: true },
      { id: "ir-ch", x: 2960, y: 55, width: 28, shape: "medium" },
      { id: "ir-co", x: 1058, y: 78, width: 24, shape: "sharp" },
    ]);
    const h1Spec = makeSpectrum("1H_NMR", [
      { id: "h-ch2o", x: 3.58, y: 82, integration: 2, multiplicity: "t", jValues: [6.7] },
      { id: "h-oh", x: 2.15, y: 45, integration: 1, multiplicity: "br s", isBroad: true },
      { id: "h-ch2", x: 1.56, y: 75, integration: 2, multiplicity: "m", jValues: [7.0] },
      { id: "h-ch3", x: 0.92, y: 95, integration: 3, multiplicity: "t", jValues: [7.4] },
    ]);

    const irRes = IRAnalysisEngine.analyzeExperimentalIR(irSpec);
    const ohFinding = irRes.findings.find((f) => f.family === "Alcohol");
    expect(ohFinding).toBeDefined();
    expect(ohFinding!.inferenceLevel).toBe("LEVEL_3_FUNCTIONAL_GROUP_HYPOTHESIS");
    expect(ohFinding!.companionPeaksObserved.length).toBeGreaterThan(0);
    // Must NOT misattribute broad OH + C-O (without N) to Amine
    expect(irRes.findings.some((f) => f.family === "Amine")).toBe(false);

    const h1Res = NMRAnalysisEngine.analyzeExperimental1HNMR(h1Spec, {
      dbe: 0, symmetryFactor: "unknown", uniqueProtonEnvironmentsCount: 4, uniqueCarbonEnvironmentsCount: 3, sourceMethod: "Molecular Formula",
      molecularFormula: "C3H8O",
      name: "1-Propanol",
      smiles: "CCCO",
      molecularWeight: 60,
      exactMass: 60.0575,
      unsaturationIndex: 0,
      atomCounts: { C: 3, H: 8, O: 1 },
      detectedFunctionalGroups: ["醇羥基 (-OH)"],
      isFormulaOnly: true,
    });
    const ohEnv = h1Res.environments.find((e) => Math.abs(e.shiftPpm - 2.15) < 0.05);
    expect(ohEnv?.isExchangeable).toBe(true);
    expect(ohEnv?.inferenceLevel).toBe("LEVEL_2_LOCAL_CHEMICAL_ENVIRONMENT");
  });

  it("2. 含 OH 的酚類化合物 (Phenol / 4-Methylphenol Cc1ccc(O)cc1) — ¹³C 154–162 ppm 氧取代芳碳絕不誤判為吡啶環", () => {
    const irSpec = makeSpectrum("IR", [
      { id: "ir-oh", x: 3335, y: 74, width: 92, shape: "broad", isBroad: true },
      { id: "ir-ar1", x: 1602, y: 65, width: 20, shape: "sharp" },
      { id: "ir-ar2", x: 1512, y: 72, width: 20, shape: "sharp" },
      { id: "ir-co", x: 1235, y: 84, width: 24, shape: "sharp" },
      { id: "ir-oop", x: 822, y: 70, width: 22, shape: "sharp" },
    ]);
    const h1Spec = makeSpectrum("1H_NMR", [
      { id: "h-ar1", x: 7.04, y: 88, integration: 2, multiplicity: "d", jValues: [8.3] },
      { id: "h-ar2", x: 6.74, y: 86, integration: 2, multiplicity: "d", jValues: [8.3] },
      { id: "h-oh", x: 5.18, y: 48, integration: 1, multiplicity: "br s", isBroad: true },
      { id: "h-me", x: 2.26, y: 98, integration: 3, multiplicity: "s" },
    ]);
    const c13Spec = makeSpectrum("13C_NMR", [
      { id: "c-ipso-o", x: 153.8, y: 55, deptType: "C" },
      { id: "c-ar2", x: 130.1, y: 88, deptType: "CH" },
      { id: "c-ipso-c", x: 129.8, y: 52, deptType: "C" },
      { id: "c-ar3", x: 115.2, y: 90, deptType: "CH" },
      { id: "c-me", x: 20.5, y: 80, deptType: "CH3" },
    ]);

    const bundle = ChemicalFeatureEngine.buildIntegratedBundle(
      { IR: irSpec, "1H_NMR": h1Spec, "13C_NMR": c13Spec },
      undefined,
      { userSuppliedFormula: "C7H8O" }
    );

    // Crucial Anti-Bias check: C7H8O has NO nitrogen; heteroaromatic constraint MUST NOT be triggered!
    expect(bundle.constraints.heteroaromatic).toBeUndefined();
    const c153Env = bundle.carbonSummary?.environments.find(
      (e) => Math.abs((e.shiftPpm ?? 0) - 153.8) < 0.5
    );
    expect(c153Env?.regionLabel).toContain("氧取代芳香四級碳");
    expect(c153Env?.regionLabel).not.toContain("鄰氮");

    const pipeline = CandidateGenerator.executeUnifiedPipelineFromBundle(bundle);
    expect(pipeline.rankedCandidates.length).toBeGreaterThan(0);
    // Top candidate should be 4-methylphenol (p-cresol) or a phenol isomer, never a pyridine!
    expect(
      pipeline.rankedCandidates.some((c) => /n1/i.test(c.smiles))
    ).toBe(false);
    expect(["Cc1ccc(O)cc1", "Oc1ccc(C)cc1"]).toContain(
      pipeline.rankedCandidates[0].smiles
    );
  });

  it("3. 含羧酸的化合物 (4-Methylbenzoic acid Cc1ccc(C(=O)O)cc1) — IR 超寬二聚體 O-H + C=O 與 NMR 協同", () => {
    const irSpec = makeSpectrum("IR", [
      { id: "ir-cooh", x: 2920, y: 68, width: 165, shape: "broad", isBroad: true },
      { id: "ir-co", x: 1690, y: 96, width: 24, shape: "sharp" },
      { id: "ir-ar", x: 1610, y: 62, width: 20, shape: "sharp" },
      { id: "ir-c-o", x: 1280, y: 74, width: 26, shape: "medium" },
      { id: "ir-oop", x: 935, y: 48, width: 28, shape: "broad", isBroad: true },
    ]);
    const h1Spec = makeSpectrum("1H_NMR", [
      { id: "h-cooh", x: 12.1, y: 42, integration: 1, multiplicity: "br s", isBroad: true },
      { id: "h-ar1", x: 7.98, y: 90, integration: 2, multiplicity: "d", jValues: [8.2] },
      { id: "h-ar2", x: 7.26, y: 88, integration: 2, multiplicity: "d", jValues: [8.2] },
      { id: "h-me", x: 2.41, y: 98, integration: 3, multiplicity: "s" },
    ]);
    const c13Spec = makeSpectrum("13C_NMR", [
      { id: "c-cooh", x: 172.1, y: 58, deptType: "C" },
      { id: "c-ar1", x: 144.6, y: 55, deptType: "C" },
      { id: "c-ar2", x: 130.2, y: 90, deptType: "CH" },
      { id: "c-ar3", x: 129.3, y: 88, deptType: "CH" },
      { id: "c-ar4", x: 126.7, y: 54, deptType: "C" },
      { id: "c-me", x: 21.7, y: 82, deptType: "CH3" },
    ]);

    const bundle = ChemicalFeatureEngine.buildIntegratedBundle(
      { IR: irSpec, "1H_NMR": h1Spec, "13C_NMR": c13Spec },
      undefined,
      { userSuppliedFormula: "C8H8O2" }
    );

    expect(bundle.constraints.carbonyl?.status).toBe("PRESENT");
    expect(bundle.constraints.carbonyl?.allowedSubtypes).toContain("Carboxylic acid");
    const pipeline = CandidateGenerator.executeUnifiedPipelineFromBundle(bundle);
    expect(["Cc1ccc(C(=O)O)cc1", "OC(=O)c1ccc(C)cc1"]).toContain(
      pipeline.rankedCandidates[0].smiles
    );
  });

  it("4. 含酯基但不含 OH 的化合物 (Methyl benzoate COC(=O)c1ccccc1) — IR 無 O-H 寬帶負向排除羧酸異構物", () => {
    const irSpec = makeSpectrum("IR", [
      { id: "ir-ch", x: 2952, y: 38, width: 24, shape: "sharp" },
      { id: "ir-co", x: 1722, y: 96, width: 22, shape: "sharp" },
      { id: "ir-ar", x: 1601, y: 52, width: 20, shape: "sharp" },
      { id: "ir-c-o-as", x: 1278, y: 92, width: 26, shape: "sharp" },
      { id: "ir-c-o-s", x: 1110, y: 68, width: 24, shape: "medium" },
      { id: "ir-oop1", x: 712, y: 74, width: 20, shape: "sharp" },
    ]);
    const h1Spec = makeSpectrum("1H_NMR", [
      { id: "h-ar1", x: 8.04, y: 88, integration: 2, multiplicity: "d", jValues: [7.6] },
      { id: "h-ar2", x: 7.56, y: 68, integration: 1, multiplicity: "t", jValues: [7.4] },
      { id: "h-ar3", x: 7.44, y: 82, integration: 2, multiplicity: "t", jValues: [7.6] },
      { id: "h-ome", x: 3.92, y: 98, integration: 3, multiplicity: "s" },
    ]);
    const c13Spec = makeSpectrum("13C_NMR", [
      { id: "c1", x: 167.1, y: 60, deptType: "C" },
      { id: "c2", x: 132.9, y: 78, deptType: "CH" },
      { id: "c3", x: 130.2, y: 56, deptType: "C" },
      { id: "c4", x: 129.6, y: 90, deptType: "CH" },
      { id: "c5", x: 128.4, y: 88, deptType: "CH" },
      { id: "c6", x: 52.1, y: 84, deptType: "CH3" },
    ]);

    const bundle = ChemicalFeatureEngine.buildIntegratedBundle(
      { IR: irSpec, "1H_NMR": h1Spec, "13C_NMR": c13Spec },
      undefined,
      { userSuppliedFormula: "C8H8O2" }
    );

    expect(bundle.constraints.carbonyl?.allowedSubtypes[0]).toBe("Ester");
    // A selected peak list does not establish complete coverage or absence of OH.
    expect(Boolean(bundle.constraints.excludedFunctionalGroups?.some(
      (fg) => fg.groupFamily === "Carboxylic acid" || fg.groupFamily === "Alcohol"
    ))).toBe(false);

    const pipeline = CandidateGenerator.executeUnifiedPipelineFromBundle(bundle);
    expect(["COC(=O)c1ccccc1", "CC(=O)Oc1ccccc1"]).toContain(
      pipeline.rankedCandidates[0].smiles
    );
  });

  it("5. 含酮或醛但不含 OH 的化合物 (4-Methoxybenzaldehyde COc1ccc(C=O)cc1) — 醛基 Fermi 雙峰 + ¹H 9.88 ppm + ¹³C 191 ppm 與 164 ppm 芳氧碳不誤判為吡啶", () => {
    const irSpec = makeSpectrum("IR", [
      { id: "ir-fermi1", x: 2838, y: 36, width: 22, shape: "sharp" },
      { id: "ir-fermi2", x: 2742, y: 32, width: 22, shape: "sharp" },
      { id: "ir-co", x: 1692, y: 98, width: 22, shape: "sharp" },
      { id: "ir-ar", x: 1600, y: 82, width: 20, shape: "sharp" },
      { id: "ir-coc", x: 1258, y: 88, width: 24, shape: "sharp" },
      { id: "ir-oop", x: 832, y: 72, width: 22, shape: "sharp" },
    ]);
    const h1Spec = makeSpectrum("1H_NMR", [
      { id: "h-cho", x: 9.88, y: 80, integration: 1, multiplicity: "s" },
      { id: "h-ar1", x: 7.84, y: 92, integration: 2, multiplicity: "d", jValues: [8.7] },
      { id: "h-ar2", x: 7.00, y: 90, integration: 2, multiplicity: "d", jValues: [8.7] },
      { id: "h-ome", x: 3.88, y: 98, integration: 3, multiplicity: "s" },
    ]);
    const c13Spec = makeSpectrum("13C_NMR", [
      { id: "c-cho", x: 190.8, y: 62, deptType: "CH" },
      { id: "c-ipso-o", x: 164.6, y: 55, deptType: "C" },
      { id: "c-ar1", x: 132.0, y: 90, deptType: "CH" },
      { id: "c-ipso-c", x: 129.9, y: 54, deptType: "C" },
      { id: "c-ar2", x: 114.3, y: 88, deptType: "CH" },
      { id: "c-ome", x: 55.6, y: 82, deptType: "CH3" },
    ]);

    const bundle = ChemicalFeatureEngine.buildIntegratedBundle(
      { IR: irSpec, "1H_NMR": h1Spec, "13C_NMR": c13Spec },
      undefined,
      { userSuppliedFormula: "C8H8O2" }
    );

    expect(bundle.constraints.carbonyl?.allowedSubtypes).toContain("Aldehyde");
    expect(bundle.constraints.heteroaromatic).toBeUndefined();
    const pipeline = CandidateGenerator.executeUnifiedPipelineFromBundle(bundle);
    expect(pipeline.rankedCandidates[0].smiles).toBe("COc1ccc(C=O)cc1");
  });

  it("6. 含 N 但不是吡啶的化合物 (Nitrobenzene C6H5NO2 & Acetanilide C8H9NO) — 8.22 ppm 強拉電子基鄰位苯環質子不強制鎖定為吡啶", () => {
    // Nitrobenzene C6H5NO2 has 2H ortho to -NO2 at 8.22 ppm (d, J=8.5 Hz)!
    // Previously 8.22 ppm could trigger pyridine bias when N>=1; now with IR NO2 (1525 + 1348 cm-1) and J=8.5 Hz, Nitrobenzene must win!
    const irNitro = makeSpectrum("IR", [
      { id: "ir-ar", x: 1604, y: 48, width: 20, shape: "sharp" },
      { id: "ir-no2-as", x: 1524, y: 95, width: 22, shape: "sharp" },
      { id: "ir-no2-s", x: 1348, y: 90, width: 22, shape: "sharp" },
      { id: "ir-oop1", x: 704, y: 76, width: 20, shape: "sharp" },
    ]);
    const h1Nitro = makeSpectrum("1H_NMR", [
      { id: "h-o", x: 8.22, y: 88, integration: 2, multiplicity: "d", jValues: [8.4] },
      { id: "h-p", x: 7.68, y: 65, integration: 1, multiplicity: "t", jValues: [7.5] },
      { id: "h-m", x: 7.54, y: 82, integration: 2, multiplicity: "t", jValues: [7.9] },
    ]);
    const c13Nitro = makeSpectrum("13C_NMR", [
      { id: "c-ipso", x: 148.3, y: 50, deptType: "C" },
      { id: "c-p", x: 134.6, y: 78, deptType: "CH" },
      { id: "c-m", x: 129.4, y: 90, deptType: "CH" },
      { id: "c-o", x: 123.5, y: 88, deptType: "CH" },
    ]);

    const bundleNitro = ChemicalFeatureEngine.buildIntegratedBundle(
      { IR: irNitro, "1H_NMR": h1Nitro, "13C_NMR": c13Nitro },
      undefined,
      { userSuppliedFormula: "C6H5NO2" }
    );

    // Since 148.3 ppm is DEPT "C" (quaternary C-NO2) and J=8.4 Hz is benzene ortho, heteroaromatic status is NOT "PRESENT"
    expect(bundleNitro.constraints.heteroaromatic?.status).not.toBe("PRESENT");

    const pipelineNitro = CandidateGenerator.executeUnifiedPipelineFromBundle(bundleNitro);
    expect(pipelineNitro.rankedCandidates.length).toBeGreaterThan(0);
    // Top candidate for C6H5NO2 with NO2 IR bands and monosubstituted benzene NMR must be Nitrobenzene, not nicotinic acid!
    expect([
      "O=[N+]([O-])c1ccccc1",
      "[O-][N+](=O)c1ccccc1",
      "c1ccc([N+](=O)[O-])cc1",
    ]).toContain(pipelineNitro.rankedCandidates[0].smiles);
  });

  it("7. 真正的吡啶或含氮雜環化合物 (Pyridine C5H5N & 4-Methylpyridine C6H7N) — 保留正交確認之含氮雜芳環高準確度辨識", () => {
    const h1Pyr = makeSpectrum("1H_NMR", [
      { id: "h-a", x: 8.60, y: 90, integration: 2, multiplicity: "d", jValues: [4.8] },
      { id: "h-g", x: 7.68, y: 68, integration: 1, multiplicity: "t", jValues: [7.6] },
      { id: "h-b", x: 7.28, y: 85, integration: 2, multiplicity: "dd", jValues: [7.5, 4.9] },
    ]);
    const c13Pyr = makeSpectrum("13C_NMR", [
      { id: "c-a", x: 149.9, y: 88, deptType: "CH" },
      { id: "c-g", x: 135.9, y: 76, deptType: "CH" },
      { id: "c-b", x: 123.8, y: 86, deptType: "CH" },
    ]);

    const bundlePyr = ChemicalFeatureEngine.buildIntegratedBundle(
      { "1H_NMR": h1Pyr, "13C_NMR": c13Pyr },
      undefined,
      { userSuppliedFormula: "C5H5N" }
    );

    // With N=1, 8.60 ppm (³J=4.8 Hz) and 149.9 ppm (DEPT CH), orthogonal verification confirms heteroaromatic PRESENT!
    expect(bundlePyr.constraints.heteroaromatic?.status).toBe("PRESENT");
    const pipelinePyr = CandidateGenerator.executeUnifiedPipelineFromBundle(bundlePyr);
    expect(pipelinePyr.rankedCandidates[0].smiles).toBe("c1ccncc1");
  });

  it("8. OH 訊號在 ¹H NMR 中因氘交換消失、但 IR 有明顯 OH 的情況 (4-Methoxyphenol in CD3OD) — 不誤判為缺氫矛盾或含 N 結構", () => {
    // 4-Methoxyphenol (COc1ccc(O)cc1, C7H8O2) in CD3OD:
    // IR shows clear broad O-H at 3350 cm-1 + Ar-O at 1235 cm-1.
    // 1H NMR in CD3OD only shows 4H aromatic (6.80 ppm, s, 4H) + 3H OCH3 (3.73 ppm, s, 3H) = 7H (missing 1H phenolic OH due to CD3OD deuterium exchange).
    const irSpec = makeSpectrum("IR", [
      { id: "ir-oh", x: 3350, y: 74, width: 95, shape: "broad", isBroad: true },
      { id: "ir-ar", x: 1510, y: 82, width: 22, shape: "sharp" },
      { id: "ir-co", x: 1235, y: 88, width: 24, shape: "sharp" },
      { id: "ir-oop", x: 825, y: 72, width: 22, shape: "sharp" },
    ]);
    const h1Spec = makeSpectrum(
      "1H_NMR",
      [
        { id: "h-ar", x: 6.78, y: 92, integration: 4, multiplicity: "s" },
        { id: "h-ome", x: 3.74, y: 98, integration: 3, multiplicity: "s" },
      ],
      "CD3OD"
    );

    const bundle = ChemicalFeatureEngine.buildIntegratedBundle(
      { IR: irSpec, "1H_NMR": h1Spec },
      undefined,
      { userSuppliedFormula: "C7H8O2" }
    );

    // Cross-modal synthesis must record that IR confirms Alcohol/Phenol OH despite 1H exchange in CD3OD
    expect(
      bundle.constraints.requiredFunctionalGroups?.some((fg) =>
        fg.groupFamily.includes("Alcohol")
      )
    ).toBe(true);
    expect(
      bundle.constraints.crossModalNotes?.some((n) =>
        n.includes("IR 觀測到明確羥基吸收帶")
      )
    ).toBe(true);

    const pipeline = CandidateGenerator.executeUnifiedPipelineFromBundle(bundle);
    expect(pipeline.rankedCandidates.length).toBeGreaterThan(0);
    // 4-Methoxyphenol (COc1ccc(O)cc1) must pass proton consistency (7H carbon-bound + 1H exchangeable = 8H) and rank at the top!
    const meoPhenol = pipeline.rankedCandidates.find(
      (c) => c.smiles === "COc1ccc(O)cc1" || c.smiles === "Oc1ccc(OC)cc1"
    );
    expect(meoPhenol).toBeDefined();
    expect(meoPhenol!.nmrConsistencyAnalysis?.protonIntegrationConsistency.status).toBe(
      "CONSISTENT_WITH_EXCHANGEABLE_OR_OVERLAP"
    );
  });

  it("9. 相對積分與絕對氫數不同的情況 (Symmetric 1:1 relative ratio on C8H10 p-xylene)", () => {
    const h1Relative = makeSpectrum("1H_NMR", [
      { id: "h-ar", x: 7.06, y: 85, integration: 2, multiplicity: "s" },
      { id: "h-me", x: 2.30, y: 98, integration: 3, multiplicity: "s" },
    ]);
    const summary = ChemicalHardConstraintValidator.analyzeH1NMRIntegrationSemantics(
      NMRAnalysisEngine.analyzeExperimental1HNMR(h1Relative).environments,
      false,
      false,
      { C: 8, H: 10 }
    );
    expect(summary.integralDataMode).toBe("RELATIVE_INTEGRAL_RATIO");
    expect(summary.inferredMinimumProtonUnitSum).toBe(5);
    // A formula must not calibrate its own purported independent NMR evidence.
    expect(summary.inferredTotalProtons).toBeNull();
    expect(summary.canDetermineAbsoluteProtonCount).toBe(false);

    const consistency = ChemicalHardConstraintValidator.evaluateProtonCountConsistency(
      "Cc1ccc(C)cc1",
      "C8H10",
      summary,
      "CDCl3"
    );
    expect(consistency.disposition).toBe("PASS");
    expect(consistency.comparisonResult).toBe("RELATIVE_RATIO_COMPATIBLE");
  });

  it("10. 不同氘代溶劑下的分析 (CDCl3 vs DMSO-d6 vs D2O 對 OH/NH 化學位移與交換行為之影響)", () => {
    const phenolStruct = ChemistryEngine.parseStructureInput({
      smiles: "Oc1ccccc1",
      formula: "C6H6O",
      name: "Phenol",
    });

    const predCdcl3 = NMRAnalysisEngine.predict1HNMRFromStructure(phenolStruct, {
      solvent: "CDCl3",
    });
    const predDmso = NMRAnalysisEngine.predict1HNMRFromStructure(phenolStruct, {
      solvent: "DMSO-d6",
    });
    const predD2o = NMRAnalysisEngine.predict1HNMRFromStructure(phenolStruct, {
      solvent: "D2O",
    });

    const ohCdcl3 = predCdcl3.environments.find((e) => e.isExchangeable);
    const ohDmso = predDmso.environments.find((e) => e.isExchangeable);
    const ohD2o = predD2o.environments.find((e) => e.isExchangeable);

    expect(ohCdcl3).toBeDefined();
    expect(ohDmso).toBeDefined();
    expect(ohD2o).toBeDefined();
    // In DMSO-d6, strong S=O···H-O hydrogen bonding shifts phenolic OH downfield (>8.5 ppm) compared to CDCl3 (~5.3 ppm)
    expect(ohDmso!.shiftPpm).toBeGreaterThan(ohCdcl3!.shiftPpm + 2.0);
    // In D2O, protic deuterium exchange note is explicitly recorded
    expect(ohD2o!.exchangeabilityNote).toContain("D2O");
  });

  it("11. Mode A 與 Mode B 的科學一致性測試 (Salicylic acid / Methyl salicylate 雙向驗證)", () => {
    const modeBRes = WorkbenchOrchestrator.runModeBPrediction("COC(=O)c1ccccc1O");
    expect(modeBRes.parsedStructure?.molecularFormula).toBe("C8H8O3");

    // Mode B IR prediction for Methyl salicylate (1,2-ortho-hydroxybenzoate) must include intramolecular chelated OH and red-shifted conjugated ester C=O
    const irPreds = modeBRes.modeBReport?.predictedSpectra.irPredictions || [];
    expect(irPreds.some((p) => p.family === "Alcohol" || p.family === "Phenol")).toBe(true);
    expect(irPreds.some((p) => p.family === "Ester")).toBe(true);

    // Feed Mode B predicted spectra back into Mode A consistency evaluation for the same structure
    const consistency = NMRAnalysisEngine.evaluateCandidateNMRConsistency({
      candidateStructure: modeBRes.parsedStructure!,
      expH1Spectrum: modeBRes.modeBReport?.predictedSpectra["1H_NMR"],
      expC13Spectrum: modeBRes.modeBReport?.predictedSpectra["13C_NMR"],
      authoritativeTargetFormula: "C8H8O3",
    });

    expect(["CONSISTENT", "HIGHLY_CONSISTENT"]).toContain(consistency.overallStatus);
    expect(consistency.overallScore).toBeGreaterThanOrEqual(80);
  });

  it("12. 分子式硬限制與跨光譜排序同時存在且無重複計分 (Locked Formula C7H7NO2 — 4-Aminobenzoic acid vs 4-Nitrotoluene)", () => {
    // Experimental IR + 1H + 13C for 4-Nitrotoluene (Cc1ccc([N+](=O)[O-])cc1, C7H7NO2):
    // IR: NO2 at 1518 & 1346 cm-1, NO O-H or N-H stretch in 2500-3600 cm-1!
    // 1H: 8.10 ppm (2H, d, J=8.5 Hz), 7.32 ppm (2H, d, J=8.5 Hz), 2.45 ppm (3H, s)
    const irSpec = makeSpectrum("IR", [
      { id: "ir-ch", x: 2925, y: 35, width: 24, shape: "sharp" },
      { id: "ir-no2-a", x: 1518, y: 94, width: 22, shape: "sharp" },
      { id: "ir-no2-s", x: 1346, y: 90, width: 22, shape: "sharp" },
      { id: "ir-oop", x: 838, y: 74, width: 22, shape: "sharp" },
    ]);
    const h1Spec = makeSpectrum("1H_NMR", [
      { id: "h-ar1", x: 8.12, y: 90, integration: 2, multiplicity: "d", jValues: [8.6] },
      { id: "h-ar2", x: 7.31, y: 88, integration: 2, multiplicity: "d", jValues: [8.6] },
      { id: "h-me", x: 2.45, y: 98, integration: 3, multiplicity: "s" },
    ]);
    const c13Spec = makeSpectrum("13C_NMR", [
      { id: "c1", x: 146.2, y: 55, deptType: "C" },
      { id: "c2", x: 145.8, y: 56, deptType: "C" },
      { id: "c3", x: 129.9, y: 90, deptType: "CH" },
      { id: "c4", x: 123.6, y: 88, deptType: "CH" },
      { id: "c5", x: 21.7, y: 82, deptType: "CH3" },
    ]);

    const bundle = ChemicalFeatureEngine.buildIntegratedBundle(
      { IR: irSpec, "1H_NMR": h1Spec, "13C_NMR": c13Spec },
      undefined,
      { userSuppliedFormula: "C7H7NO2" }
    );

    const pipeline = CandidateGenerator.executeUnifiedPipelineFromBundle(bundle);
    expect(pipeline.rankedCandidates.length).toBeGreaterThan(0);

    // Every surviving candidate MUST strictly have computedFormula === "C7H7NO2"
    for (const cand of pipeline.rankedCandidates) {
      expect(cand.hardValidation?.computedFormula).toBe("C7H7NO2");
      expect(cand.hardValidation?.isValid).toBe(true);
    }

    // 4-Nitrotoluene (Cc1ccc([N+](=O)[O-])cc1 / [O-][N+](=O)c1ccc(C)cc1 / O=[N+]([O-])c1ccc(C)cc1) must outrank carboxylic acid / pyridine isomers because IR has NO2 and excludes O-H/N-H!
    expect([
      "Cc1ccc([N+](=O)[O-])cc1",
      "[O-][N+](=O)c1ccc(C)cc1",
      "O=[N+]([O-])c1ccc(C)cc1",
    ]).toContain(pipeline.rankedCandidates[0].smiles);
  });
});
