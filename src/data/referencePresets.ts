import { DataValidator } from "../engines/dataValidator";
import { SpectrumParser } from "../engines/spectrumParser";
import { ExperimentalSpectrumData, SpectrumModality } from "../types/spectrum";

export interface ReferenceSamplePreset {
  id: string;
  sampleCode: string;
  title: string;
  subtitle: string;
  name?: string;
  description?: string;
  expectedFormula?: string;
  referenceSmiles?: string;
  dataOriginLabel: string;
  smiles: string;
  inchi: string;
  formula: string;
  defaultWithExpectedStructure: boolean;
  WrongExpectedStructureOption?: {
    label: string;
    smiles: string;
  };
  spectra: Partial<Record<SpectrumModality, ExperimentalSpectrumData>>;
}

function buildPresetSpectrum(
  modality: SpectrumModality,
  fileName: string,
  peaks: ExperimentalSpectrumData["peaks"],
  msParams?: ExperimentalSpectrumData["msParams"]
): ExperimentalSpectrumData {
  const points = SpectrumParser.synthesizeCurveFromPeaks(modality, peaks);
  const validation = DataValidator.validateSpectrum(modality, "PRESET", points, peaks, false);
  const { xUnit, yUnit } = SpectrumParser.defaultUnits(modality);
  return {
    modality,
    fileName,
    sourceFormat: "PRESET",
    dataOrigin: "DEMO_REFERENCE_PRESET",
    modelType: "REFERENCE",
    isSimulated: true,
    xUnit,
    yUnit,
    points,
    peaks,
    validation,
    msParams,
  };
}

export const REFERENCE_SAMPLE_PRESETS: ReferenceSamplePreset[] = [
  {
    id: "preset-anisaldehyde",
    sampleCode: "SR-DEMO-101",
    title: "對甲氧基苯甲醛 (4-Methoxybenzaldehyde)",
    subtitle: "完整 IR + ¹H NMR + ¹³C NMR + EI-MS（芳香醛與甲氧基醚標準示範組）",
    dataOriginLabel: "Demo Reference Data（示範參考資料 — 內建參考光譜模擬）",
    smiles: "COc1ccc(C=O)cc1",
    inchi: "InChI=1S/C8H8O2/c1-10-8-4-2-7(6-9)3-5-8/h2-6H,1H3",
    formula: "C8H8O2",
    defaultWithExpectedStructure: false,
    WrongExpectedStructureOption: {
      label: "測試異構物衝突：載入「苯甲酸甲酯 (Methyl Benzoate, C8H8O2)」作為預期結構",
      smiles: "COC(=O)c1ccccc1",
    },
    spectra: {
      IR: buildPresetSpectrum("IR", "Demo_SR101_Anisaldehyde_FTIR.jdx", [
        { id: "ir-101-1", x: 3074, y: 24, width: 22, shape: "sharp", assignment: "芳香環 sp² C-H 伸縮" },
        { id: "ir-101-2", x: 2940, y: 32, width: 26, shape: "medium", assignment: "甲氧基 sp³ C-H 伸縮" },
        { id: "ir-101-3", x: 2838, y: 38, width: 20, shape: "sharp", assignment: "醛基 C-H Fermi 共振帶 I" },
        { id: "ir-101-4", x: 2740, y: 33, width: 20, shape: "sharp", assignment: "醛基 C-H Fermi 共振帶 II" },
        { id: "ir-101-5", x: 1696, y: 99, width: 24, shape: "sharp", assignment: "共軛芳香醛 C=O 伸縮振動" },
        { id: "ir-101-6", x: 1600, y: 84, width: 18, shape: "sharp", assignment: "芳香環骨架 C=C 伸縮 I" },
        { id: "ir-101-7", x: 1512, y: 70, width: 18, shape: "sharp", assignment: "芳香環骨架 C=C 伸縮 II" },
        { id: "ir-101-8", x: 1260, y: 94, width: 26, shape: "sharp", assignment: "Ar-O-CH₃ 非對稱 C-O-C 伸縮" },
        { id: "ir-101-9", x: 1026, y: 72, width: 24, shape: "sharp", assignment: "甲氧基對稱 C-O-C 伸縮" },
        { id: "ir-101-10", x: 833, y: 74, width: 20, shape: "sharp", assignment: "對位雙取代苯環 C-H 面外彎曲 (OOP)" },
      ]),
      "1H_NMR": buildPresetSpectrum("1H_NMR", "Demo_SR101_Anisaldehyde_1H.jdx", [
        { id: "h1-101-1", x: 9.88, y: 56, integration: 1, multiplicity: "s", jValues: [], assignment: "醛基質子 -CHO" },
        { id: "h1-101-2", x: 7.84, y: 94, integration: 2, multiplicity: "d", jValues: [8.7], assignment: "Ar-H2,6 (鄰近 -CHO)" },
        { id: "h1-101-3", x: 7.01, y: 92, integration: 2, multiplicity: "d", jValues: [8.7], assignment: "Ar-H3,5 (鄰近 -OCH₃)" },
        { id: "h1-101-4", x: 3.89, y: 100, integration: 3, multiplicity: "s", jValues: [], assignment: "甲氧基 -OCH₃" },
      ]),
      "13C_NMR": buildPresetSpectrum("13C_NMR", "Demo_SR101_Anisaldehyde_13C.jdx", [
        { id: "c13-101-1", x: 190.8, y: 66, deptType: "CH", assignment: "醛基羰基碳 C=O" },
        { id: "c13-101-2", x: 164.6, y: 58, deptType: "C", assignment: "Ar-C4 (O-取代四級碳)" },
        { id: "c13-101-3", x: 132.0, y: 100, deptType: "CH", assignment: "Ar-C2,6 (2C 等價對)" },
        { id: "c13-101-4", x: 130.0, y: 54, deptType: "C", assignment: "Ar-C1 (CHO-取代四級碳)" },
        { id: "c13-101-5", x: 114.3, y: 96, deptType: "CH", assignment: "Ar-C3,5 (2C 等價對)" },
        { id: "c13-101-6", x: 55.6, y: 82, deptType: "CH3", assignment: "甲氧基碳 -OCH₃" },
      ]),
      MS: buildPresetSpectrum(
        "MS",
        "Demo_SR101_Anisaldehyde_EIMS.jdx",
        [
          { id: "ms-101-1", x: 137, y: 6.8, isotopeAnnotation: "M+1 (¹³C)" },
          { id: "ms-101-2", x: 136, y: 74, isMolecularIonCandidate: true, assignment: "[M]⁺• (C8H8O2)" },
          { id: "ms-101-3", x: 135, y: 100, isBasePeak: true, assignment: "[M-H]⁺ (對甲氧基苯甲醯基正離子基峰)" },
          { id: "ms-101-4", x: 107, y: 28, assignment: "[M-CHO]⁺" },
          { id: "ms-101-5", x: 92, y: 22, assignment: "[C₆H₄O]⁺•" },
          { id: "ms-101-6", x: 77, y: 38, assignment: "[C₆H₅]⁺ (苯基正離子)" },
          { id: "ms-101-7", x: 65, y: 16, assignment: "[C₅H₅]⁺" },
        ],
        { msType: "EI-MS", ionization: "EI", massToleranceDa: 0.5, isHighResolution: false }
      ),
    },
  },
  {
    id: "preset-benzocaine",
    sampleCode: "SR-DEMO-204",
    title: "對胺基苯甲酸乙酯 (Benzocaine)",
    subtitle: "IR + ¹H NMR + ¹³C NMR + ESI+ MS/MS（一級芳香胺與共軛乙酯示範組）",
    dataOriginLabel: "Demo Reference Data（示範參考資料 — 內建參考光譜模擬）",
    smiles: "CCOC(=O)c1ccc(N)cc1",
    inchi: "InChI=1S/C9H11NO2/c1-2-12-9(11)7-3-5-8(10)6-4-7/h3-6H,2,10H2,1H3",
    formula: "C9H11NO2",
    defaultWithExpectedStructure: true,
    spectra: {
      IR: buildPresetSpectrum("IR", "Demo_SR204_Benzocaine_FTIR.jdx", [
        { id: "ir-204-1", x: 3422, y: 54, width: 24, shape: "sharp", assignment: "一級胺非對稱 N-H 伸縮" },
        { id: "ir-204-2", x: 3342, y: 58, width: 24, shape: "sharp", assignment: "一級胺對稱 N-H 伸縮" },
        { id: "ir-204-3", x: 2981, y: 38, width: 26, shape: "medium", assignment: "乙基 sp³ C-H 伸縮" },
        { id: "ir-204-4", x: 1716, y: 97, width: 24, shape: "sharp", assignment: "共軛芳香酯 C=O 伸縮" },
        { id: "ir-204-5", x: 1634, y: 66, width: 22, shape: "medium", assignment: "NH₂ 剪式彎曲振動" },
        { id: "ir-204-6", x: 1603, y: 80, width: 18, shape: "sharp", assignment: "芳香環 C=C 伸縮" },
        { id: "ir-204-7", x: 1278, y: 92, width: 28, shape: "sharp", assignment: "酯基 C(=O)-O 非對稱伸縮" },
        { id: "ir-204-8", x: 1110, y: 64, width: 24, shape: "medium", assignment: "酯基 O-CH₂CH₃ 伸縮" },
        { id: "ir-204-9", x: 842, y: 70, width: 20, shape: "sharp", assignment: "對位雙取代 C-H OOP 彎曲" },
      ]),
      "1H_NMR": buildPresetSpectrum("1H_NMR", "Demo_SR204_Benzocaine_1H.jdx", [
        { id: "h1-204-1", x: 7.85, y: 90, integration: 2, multiplicity: "d", jValues: [8.6], assignment: "Ar-H2,6 (鄰近酯基)" },
        { id: "h1-204-2", x: 6.64, y: 88, integration: 2, multiplicity: "d", jValues: [8.6], assignment: "Ar-H3,5 (鄰近 -NH₂)" },
        { id: "h1-204-3", x: 4.31, y: 78, integration: 2, multiplicity: "q", jValues: [7.1], assignment: "酯基 -OCH₂-" },
        { id: "h1-204-4", x: 4.08, y: 46, integration: 2, multiplicity: "br s", jValues: [], assignment: "一級胺 -NH₂ (活潑氫)" },
        { id: "h1-204-5", x: 1.36, y: 100, integration: 3, multiplicity: "t", jValues: [7.1], assignment: "酯基末端 -CH₃" },
      ]),
      "13C_NMR": buildPresetSpectrum("13C_NMR", "Demo_SR204_Benzocaine_13C.jdx", [
        { id: "c13-204-1", x: 166.7, y: 62, deptType: "C", assignment: "酯基羰基 C=O" },
        { id: "c13-204-2", x: 150.8, y: 56, deptType: "C", assignment: "Ar-C4 (NH₂-取代碳)" },
        { id: "c13-204-3", x: 131.6, y: 100, deptType: "CH", assignment: "Ar-C2,6 (2C)" },
        { id: "c13-204-4", x: 120.1, y: 52, deptType: "C", assignment: "Ar-C1 (COOEt-取代碳)" },
        { id: "c13-204-5", x: 113.8, y: 96, deptType: "CH", assignment: "Ar-C3,5 (2C)" },
        { id: "c13-204-6", x: 60.4, y: 78, deptType: "CH2", assignment: "酯基 -OCH₂-" },
        { id: "c13-204-7", x: 14.4, y: 84, deptType: "CH3", assignment: "酯基 -CH₃" },
      ]),
      MS: buildPresetSpectrum(
        "MS",
        "Demo_SR204_Benzocaine_ESI_MSMS.jdx",
        [
          { id: "ms-204-1", x: 166, y: 64, isPrecursorIon: true, assignment: "前驅離子 [M+H]⁺ (C9H12NO2⁺)" },
          { id: "ms-204-2", x: 138, y: 34, assignment: "[M+H - C₂H₄]⁺ (-28 Da)" },
          { id: "ms-204-3", x: 120, y: 100, isBasePeak: true, assignment: "[H₂N-C₆H₄-C≡O]⁺ (-C₂H₅OH 脫乙醇基峰)" },
          { id: "ms-204-4", x: 92, y: 46, assignment: "[H₂N-C₆H₄]⁺ (-CO)" },
          { id: "ms-204-5", x: 65, y: 26, assignment: "[C₅H₅]⁺ (-HCN)" },
        ],
        {
          msType: "MS/MS",
          ionization: "ESI+",
          precursorMz: 166,
          collisionEnergyEv: 20,
          massToleranceDa: 0.5,
          isHighResolution: false,
        }
      ),
    },
  },
  {
    id: "preset-bromoacetophenone",
    sampleCode: "SR-DEMO-309",
    title: "對溴苯乙酮 (4-Bromoacetophenone)",
    subtitle: "鹵素同位素雙峰 (⁷⁹Br/⁸¹Br 1:1 M/M+2) + 共軛芳香甲基酮示範組",
    dataOriginLabel: "Demo Reference Data（示範參考資料 — 內建參考光譜模擬）",
    smiles: "CC(=O)c1ccc(Br)cc1",
    inchi: "InChI=1S/C8H7BrO/c1-6(10)7-2-4-8(9)5-3-7/h2-5H,1H3",
    formula: "C8H7BrO",
    defaultWithExpectedStructure: false,
    spectra: {
      IR: buildPresetSpectrum("IR", "Demo_SR309_4Bromoacetophenone_IR.jdx", [
        { id: "ir-309-1", x: 3068, y: 22, width: 22, shape: "sharp", assignment: "芳香環 C-H 伸縮" },
        { id: "ir-309-2", x: 2925, y: 28, width: 24, shape: "medium", assignment: "甲基 C-H 伸縮" },
        { id: "ir-309-3", x: 1685, y: 98, width: 24, shape: "sharp", assignment: "共軛芳香酮 C=O 伸縮" },
        { id: "ir-309-4", x: 1586, y: 76, width: 20, shape: "sharp", assignment: "芳香環 C=C 伸縮" },
        { id: "ir-309-5", x: 1396, y: 52, width: 22, shape: "sharp", assignment: "CH₃ 對稱傘狀彎曲" },
        { id: "ir-309-6", x: 826, y: 74, width: 20, shape: "sharp", assignment: "對位雙取代 C-H OOP 彎曲" },
        { id: "ir-309-7", x: 590, y: 58, width: 22, shape: "sharp", assignment: "芳基 C-Br 伸縮振動" },
      ]),
      "1H_NMR": buildPresetSpectrum("1H_NMR", "Demo_SR309_4Bromoacetophenone_1H.jdx", [
        { id: "h1-309-1", x: 7.82, y: 92, integration: 2, multiplicity: "d", jValues: [8.5], assignment: "Ar-H2,6 (鄰近 C=O)" },
        { id: "h1-309-2", x: 7.61, y: 90, integration: 2, multiplicity: "d", jValues: [8.5], assignment: "Ar-H3,5 (鄰近 Br)" },
        { id: "h1-309-3", x: 2.59, y: 100, integration: 3, multiplicity: "s", jValues: [], assignment: "乙醯基甲基 -C(=O)CH₃" },
      ]),
      "13C_NMR": buildPresetSpectrum("13C_NMR", "Demo_SR309_4Bromoacetophenone_13C.jdx", [
        { id: "c13-309-1", x: 197.0, y: 64, deptType: "C", assignment: "酮基 C=O" },
        { id: "c13-309-2", x: 135.8, y: 55, deptType: "C", assignment: "Ar-C1 (C=O 取代碳)" },
        { id: "c13-309-3", x: 131.9, y: 98, deptType: "CH", assignment: "Ar-C3,5 (2C)" },
        { id: "c13-309-4", x: 129.8, y: 100, deptType: "CH", assignment: "Ar-C2,6 (2C)" },
        { id: "c13-309-5", x: 128.3, y: 52, deptType: "C", assignment: "Ar-C4 (Br 取代碳)" },
        { id: "c13-309-6", x: 26.5, y: 80, deptType: "CH3", assignment: "乙醯基 -CH₃" },
      ]),
      MS: buildPresetSpectrum(
        "MS",
        "Demo_SR309_4Bromoacetophenone_EIMS.jdx",
        [
          { id: "ms-309-1", x: 200, y: 47, isotopeAnnotation: "⁸¹Br [M+2]⁺•", assignment: "[C₈H₇(⁸¹Br)O]⁺•" },
          { id: "ms-309-2", x: 198, y: 48, isMolecularIonCandidate: true, assignment: "[C₈H₇(⁷⁹Br)O]⁺•" },
          { id: "ms-309-3", x: 185, y: 98, assignment: "[⁸¹Br-C₆H₄-CO]⁺ (-CH₃)" },
          { id: "ms-309-4", x: 183, y: 100, isBasePeak: true, assignment: "[⁷⁹Br-C₆H₄-CO]⁺ (-CH₃ 基峰)" },
          { id: "ms-309-5", x: 157, y: 32, assignment: "[⁸¹Br-C₆H₄]⁺ (-CO)" },
          { id: "ms-309-6", x: 155, y: 33, assignment: "[⁷⁹Br-C₆H₄]⁺ (-CO)" },
          { id: "ms-309-7", x: 76, y: 38, assignment: "[C₆H₄]⁺• (-Br•)" },
        ],
        { msType: "EI-MS", ionization: "EI", massToleranceDa: 0.5, isHighResolution: false }
      ),
    },
  },
  {
    id: "preset-ibuprofen",
    sampleCode: "SR-DEMO-412",
    title: "布洛芬 (Ibuprofen)",
    subtitle: "羧酸二聚體寬強 O-H + 異丁基/丙酸多重耦合 ¹H NMR + EI-MS 示範組",
    dataOriginLabel: "Demo Reference Data（示範參考資料 — 內建參考光譜模擬）",
    smiles: "CC(C)Cc1ccc(cc1)C(C)C(=O)O",
    inchi: "InChI=1S/C13H18O2/c1-9(2)8-11-4-6-12(7-5-11)10(3)13(14)15/h4-7,9-10H,8H2,1-3H3,(H,14,15)",
    formula: "C13H18O2",
    defaultWithExpectedStructure: true,
    spectra: {
      IR: buildPresetSpectrum("IR", "Demo_SR412_Ibuprofen_FTIR.jdx", [
        { id: "ir-412-1", x: 2955, y: 66, width: 165, shape: "broad", assignment: "羧酸二聚體 O-H 寬強伸縮與 sp³ C-H 重疊" },
        { id: "ir-412-2", x: 1712, y: 99, width: 26, shape: "sharp", assignment: "羧酸 C=O 伸縮振動" },
        { id: "ir-412-3", x: 1510, y: 48, width: 20, shape: "sharp", assignment: "芳香環 C=C 伸縮" },
        { id: "ir-412-4", x: 1420, y: 52, width: 24, shape: "medium", assignment: "C-O-H 面內彎曲" },
        { id: "ir-412-5", x: 1232, y: 68, width: 28, shape: "medium", assignment: "羧酸 C-O 伸縮" },
        { id: "ir-412-6", x: 935, y: 46, width: 32, shape: "broad", assignment: "羧酸二聚體 O-H 面外擺動" },
      ]),
      "1H_NMR": buildPresetSpectrum("1H_NMR", "Demo_SR412_Ibuprofen_1H.jdx", [
        { id: "h1-412-1", x: 11.4, y: 38, integration: 1, multiplicity: "br s", jValues: [], assignment: "羧酸質子 -COOH" },
        { id: "h1-412-2", x: 7.22, y: 80, integration: 2, multiplicity: "d", jValues: [8.1], assignment: "Ar-H (2H)" },
        { id: "h1-412-3", x: 7.10, y: 78, integration: 2, multiplicity: "d", jValues: [8.1], assignment: "Ar-H (2H)" },
        { id: "h1-412-4", x: 3.71, y: 48, integration: 1, multiplicity: "q", jValues: [7.2], assignment: "α-次甲基 -CH(CH₃)COOH" },
        { id: "h1-412-5", x: 2.45, y: 65, integration: 2, multiplicity: "d", jValues: [7.2], assignment: "苄基 -CH₂-" },
        { id: "h1-412-6", x: 1.85, y: 36, integration: 1, multiplicity: "sept", jValues: [6.8], assignment: "異丁基次甲基 -CH(CH₃)₂" },
        { id: "h1-412-7", x: 1.49, y: 82, integration: 3, multiplicity: "d", jValues: [7.2], assignment: "α-甲基 -CH₃" },
        { id: "h1-412-8", x: 0.90, y: 100, integration: 6, multiplicity: "d", jValues: [6.8], assignment: "異丁基等價雙甲基 2× -CH₃" },
      ]),
      "13C_NMR": buildPresetSpectrum("13C_NMR", "Demo_SR412_Ibuprofen_13C.jdx", [
        { id: "c13-412-1", x: 181.2, y: 58, deptType: "C", assignment: "羧酸 C=O" },
        { id: "c13-412-2", x: 140.8, y: 54, deptType: "C", assignment: "Ar-C4" },
        { id: "c13-412-3", x: 137.0, y: 54, deptType: "C", assignment: "Ar-C1" },
        { id: "c13-412-4", x: 129.4, y: 96, deptType: "CH", assignment: "Ar-C3,5 (2C)" },
        { id: "c13-412-5", x: 127.3, y: 98, deptType: "CH", assignment: "Ar-C2,6 (2C)" },
        { id: "c13-412-6", x: 45.1, y: 76, deptType: "CH", assignment: "α-CH" },
        { id: "c13-412-7", x: 45.0, y: 74, deptType: "CH2", assignment: "苄基 CH₂" },
        { id: "c13-412-8", x: 30.2, y: 72, deptType: "CH", assignment: "異丁基 CH" },
        { id: "c13-412-9", x: 22.4, y: 100, deptType: "CH3", assignment: "異丁基 2× CH₃" },
        { id: "c13-412-10", x: 18.1, y: 80, deptType: "CH3", assignment: "α-CH₃" },
      ]),
      MS: buildPresetSpectrum(
        "MS",
        "Demo_SR412_Ibuprofen_EIMS.jdx",
        [
          { id: "ms-412-1", x: 206, y: 44, isMolecularIonCandidate: true, assignment: "[M]⁺• (C13H18O2)" },
          { id: "ms-412-2", x: 163, y: 36, assignment: "[M - C₃H₇]⁺" },
          { id: "ms-412-3", x: 161, y: 100, isBasePeak: true, assignment: "[M - COOH]⁺ (-45 Da 基峰)" },
          { id: "ms-412-4", x: 119, y: 52, assignment: "[C₉H₁₁]⁺" },
          { id: "ms-412-5", x: 91, y: 48, assignment: "[C₇H₇]⁺ (Tropylium)" },
        ],
        { msType: "EI-MS", ionization: "EI", massToleranceDa: 0.5, isHighResolution: false }
      ),
    },
  },
  {
    id: "preset-tofsims-pdms",
    sampleCode: "SR-DEMO-508",
    title: "聚二甲基矽氧烷表面塗層 (PDMS Surface Oligomer)",
    subtitle: "ToF-SIMS (Bi₃⁺ 25 keV, Positive) + ATR-FTIR 矽氧烷表面分析示範組",
    dataOriginLabel: "Demo Reference Data（示範參考資料 — 內建參考光譜模擬）",
    smiles: "C[Si](C)(C)O[Si](C)(C)O[Si](C)(C)C",
    inchi: "InChI=1S/C8H24O2Si3/c1-11(2,3)9-13(7,8)10-12(4,5)6/h1-8H3",
    formula: "C8H24O2Si3",
    defaultWithExpectedStructure: false,
    spectra: {
      IR: buildPresetSpectrum("IR", "Demo_SR508_PDMS_ATR_IR.jdx", [
        { id: "ir-508-1", x: 2963, y: 54, width: 22, shape: "sharp", assignment: "Si-CH₃ 非對稱 C-H 伸縮" },
        { id: "ir-508-2", x: 1261, y: 88, width: 16, shape: "sharp", assignment: "Si-CH₃ 對稱傘狀變形" },
        { id: "ir-508-3", x: 1085, y: 98, width: 36, shape: "broad", assignment: "Si-O-Si 非對稱伸縮帶 I" },
        { id: "ir-508-4", x: 1022, y: 100, width: 38, shape: "broad", assignment: "Si-O-Si 非對稱伸縮帶 II" },
        { id: "ir-508-5", x: 800, y: 84, width: 24, shape: "sharp", assignment: "Si-(CH₃)₂ 搖擺與 Si-C 伸縮" },
      ]),
      "1H_NMR": buildPresetSpectrum("1H_NMR", "Demo_SR508_PDMS_1H.jdx", [
        { id: "h1-508-1", x: 0.09, y: 100, integration: 18, multiplicity: "s", jValues: [], assignment: "末端 -Si(CH₃)₃ (M-unit)" },
        { id: "h1-508-2", x: 0.05, y: 42, integration: 6, multiplicity: "s", jValues: [], assignment: "中段 -O-Si(CH₃)₂-O- (D-unit)" },
      ]),
      MS: buildPresetSpectrum(
        "MS",
        "Demo_SR508_PDMS_ToFSIMS_Pos.jdx",
        [
          { id: "ms-508-1", x: 59, y: 24, assignment: "[SiH(CH₃)₂]⁺" },
          { id: "ms-508-2", x: 73, y: 100, isBasePeak: true, assignment: "[Si(CH₃)₃]⁺ (PDMS 診斷二次正離子基峰)" },
          { id: "ms-508-3", x: 133, y: 18, assignment: "[Si₂O(CH₃)₃CH₂]⁺" },
          { id: "ms-508-4", x: 147, y: 68, assignment: "[Si₂O(CH₃)₅]⁺ (五甲基二矽氧烷正離子)" },
          { id: "ms-508-5", x: 207, y: 34, assignment: "[Si₃O₃(CH₃)₅]⁺ (環狀 D₃ - CH₃ 碎片)" },
          { id: "ms-508-6", x: 221, y: 26, isMolecularIonCandidate: true, assignment: "[Si₃O₂(CH₃)₇]⁺ (寡聚物 [M-CH₃]⁺)" },
        ],
        {
          msType: "ToF-SIMS",
          ionization: "SIMS / ToF-SIMS",
          massToleranceDa: 0.5,
          isHighResolution: false,
          tofSims: {
            polarity: "Positive",
            primaryIon: "Bi3+",
            primaryIonEnergyKeV: 25,
            massRange: [1, 800],
            ionDoseRegime: "Static (< 10^12 ions/cm²)",
            substrateMaterial: "Si(100) 晶圓",
            surfaceMatrixNote: "單分子層有機矽表面範圍，靜態離子劑量保持分子碎片特徵。",
          },
        }
      ),
    },
  },
  {
    id: "preset-aspirin",
    sampleCode: "SR-DEMO-601",
    title: "乙醯水楊酸 (Aspirin / Acetylsalicylic Acid)",
    subtitle: "羧酸與酚乙酸酯雙羰基 IR + 鄰位非對稱 ¹H/¹³C NMR + EI-MS 脫乙烯酮/乙酸示範組",
    dataOriginLabel: "Demo Reference Data（示範參考資料 — 內建參考光譜模擬）",
    smiles: "CC(=O)Oc1ccccc1C(=O)O",
    inchi: "InChI=1S/C9H8O4/c1-6(10)13-8-5-3-2-4-7(8)9(11)12/h2-5H,1H3,(H,11,12)",
    formula: "C9H8O4",
    defaultWithExpectedStructure: false,
    spectra: {
      IR: buildPresetSpectrum("IR", "Demo_SR601_Aspirin_FTIR.jdx", [
        { id: "ir-601-1", x: 2980, y: 65, width: 160, shape: "broad", isBroad: true, assignment: "羧酸二聚體 O-H 寬強伸縮帶 (2500–3300 cm⁻¹)" },
        { id: "ir-601-2", x: 1754, y: 94, width: 22, shape: "sharp", assignment: "酚乙酸酯基 C=O 伸縮 (Ar-OCOCH₃)" },
        { id: "ir-601-3", x: 1688, y: 98, width: 24, shape: "sharp", assignment: "共軛芳香羧酸 C=O 伸縮 (-COOH)" },
        { id: "ir-601-4", x: 1605, y: 74, width: 18, shape: "sharp", assignment: "芳香環 C=C 骨架伸縮" },
        { id: "ir-601-5", x: 1305, y: 82, width: 24, shape: "sharp", assignment: "羧酸 C-O 伸縮" },
        { id: "ir-601-6", x: 1188, y: 92, width: 26, shape: "sharp", assignment: "乙酸酯 C-O-C 非對稱伸縮" },
        { id: "ir-601-7", x: 756, y: 72, width: 20, shape: "sharp", assignment: "鄰位雙取代苯環 C-H OOP 彎曲" },
      ]),
      "1H_NMR": buildPresetSpectrum("1H_NMR", "Demo_SR601_Aspirin_1H.jdx", [
        { id: "h1-601-1", x: 11.20, y: 40, integration: 1, multiplicity: "br s", jValues: [], assignment: "羧酸質子 -COOH" },
        { id: "h1-601-2", x: 8.12, y: 78, integration: 1, multiplicity: "dd", jValues: [7.8, 1.7], assignment: "Ar-H6 (鄰近 -COOH)" },
        { id: "h1-601-3", x: 7.62, y: 74, integration: 1, multiplicity: "td", jValues: [7.8, 1.7], assignment: "Ar-H4" },
        { id: "h1-601-4", x: 7.35, y: 72, integration: 1, multiplicity: "td", jValues: [7.6, 1.2], assignment: "Ar-H5" },
        { id: "h1-601-5", x: 7.14, y: 76, integration: 1, multiplicity: "dd", jValues: [8.1, 1.2], assignment: "Ar-H3 (鄰近 -OAc)" },
        { id: "h1-601-6", x: 2.35, y: 100, integration: 3, multiplicity: "s", jValues: [], assignment: "乙醯氧基甲基 -OCOCH₃" },
      ]),
      "13C_NMR": buildPresetSpectrum("13C_NMR", "Demo_SR601_Aspirin_13C.jdx", [
        { id: "c13-601-1", x: 170.2, y: 58, deptType: "C", assignment: "羧酸羰基碳 -COOH" },
        { id: "c13-601-2", x: 169.7, y: 56, deptType: "C", assignment: "乙酸酯羰基碳 -OCOCH₃" },
        { id: "c13-601-3", x: 151.2, y: 54, deptType: "C", assignment: "Ar-C2 (OAc 取代四級碳)" },
        { id: "c13-601-4", x: 134.8, y: 88, deptType: "CH", assignment: "Ar-C4" },
        { id: "c13-601-5", x: 132.4, y: 86, deptType: "CH", assignment: "Ar-C6" },
        { id: "c13-601-6", x: 126.1, y: 84, deptType: "CH", assignment: "Ar-C5" },
        { id: "c13-601-7", x: 124.0, y: 85, deptType: "CH", assignment: "Ar-C3" },
        { id: "c13-601-8", x: 122.4, y: 52, deptType: "C", assignment: "Ar-C1 (COOH 取代四級碳)" },
        { id: "c13-601-9", x: 21.0, y: 82, deptType: "CH3", assignment: "乙醯基甲基碳 -CH₃" },
      ]),
      MS: buildPresetSpectrum(
        "MS",
        "Demo_SR601_Aspirin_EIMS.jdx",
        [
          { id: "ms-601-1", x: 180, y: 8, isMolecularIonCandidate: true, assignment: "[M]⁺• (C9H8O4)" },
          { id: "ms-601-2", x: 138, y: 58, assignment: "[M - CH₂=C=O]⁺• (-42 Da 水楊酸離子)" },
          { id: "ms-601-3", x: 120, y: 100, isBasePeak: true, assignment: "[C₇H₄O₂]⁺• (-CH₃COOH 鄰位效應基峰)" },
          { id: "ms-601-4", x: 92, y: 30, assignment: "[C₆H₄O]⁺• (-CO)" },
          { id: "ms-601-5", x: 43, y: 26, assignment: "[CH₃CO]⁺ (乙醯基正離子)" },
        ],
        { msType: "EI-MS", ionization: "EI", massToleranceDa: 0.5, isHighResolution: false }
      ),
    },
  },
  {
    id: "preset-ethyl-benzoate",
    sampleCode: "DEMO-SR-701",
    title: "苯甲酸乙酯 (Ethyl Benzoate) [示範參考資料]",
    subtitle: "共軛芳香酯 + 單取代苯環 (5H) + 乙氧基四重峰/三重峰自旋系統",
    dataOriginLabel: "示範參考資料 (Demo / Simulated Reference Data)",
    smiles: "CCOC(=O)c1ccccc1",
    inchi: "InChI=1S/C9H10O2/c1-2-11-9(10)8-6-4-3-5-7-8/h3-7H,2H2,1H3",
    formula: "C9H10O2",
    defaultWithExpectedStructure: false,
    spectra: {
      IR: buildPresetSpectrum("IR", "Demo_SR701_EthylBenzoate_FTIR.jdx", [
        { id: "ir-701-1", x: 1720, y: 98, width: 22, shape: "sharp", assignment: "共軛芳香酯 C=O 伸縮 (Ar-COOCH₂CH₃)" },
        { id: "ir-701-2", x: 1602, y: 65, width: 18, shape: "sharp", assignment: "芳香環 C=C 骨架伸縮" },
        { id: "ir-701-3", x: 1275, y: 94, width: 26, shape: "sharp", assignment: "芳香酯 C-O-C 非對稱強伸縮" },
        { id: "ir-701-4", x: 1110, y: 80, width: 24, shape: "sharp", assignment: "酯 O-CH₂-C 伸縮" },
        { id: "ir-701-5", x: 712, y: 84, width: 20, shape: "sharp", assignment: "單取代苯環 C-H OOP 彎曲" },
      ]),
      "1H_NMR": buildPresetSpectrum("1H_NMR", "Demo_SR701_EthylBenzoate_1H.jdx", [
        { id: "h1-701-1", x: 8.05, y: 88, integration: 2, integral: 2, multiplicity: "d", jValues: [7.6], assignment: "Ar-H2,6 (鄰位 2H)" },
        { id: "h1-701-2", x: 7.55, y: 68, integration: 1, integral: 1, multiplicity: "t", jValues: [7.5], assignment: "Ar-H4 (對位 1H)" },
        { id: "h1-701-3", x: 7.43, y: 82, integration: 2, integral: 2, multiplicity: "t", jValues: [7.6], assignment: "Ar-H3,5 (間位 2H)" },
        { id: "h1-701-4", x: 4.37, y: 86, integration: 2, integral: 2, multiplicity: "q", jValues: [7.1], assignment: "-OCH₂CH₃ 四重峰 (2H)" },
        { id: "h1-701-5", x: 1.39, y: 100, integration: 3, integral: 3, multiplicity: "t", jValues: [7.1], assignment: "-OCH₂CH₃ 三重峰 (3H)" },
      ]),
      "13C_NMR": buildPresetSpectrum("13C_NMR", "Demo_SR701_EthylBenzoate_13C.jdx", [
        { id: "c13-701-1", x: 166.6, y: 58, deptType: "C", assignment: "酯羰基碳 -COO-" },
        { id: "c13-701-2", x: 132.8, y: 82, deptType: "CH", assignment: "Ar-C4" },
        { id: "c13-701-3", x: 130.5, y: 54, deptType: "C", assignment: "Ar-C1 (季碳)" },
        { id: "c13-701-4", x: 129.5, y: 96, deptType: "CH", assignment: "Ar-C2,6 (對稱 2C)" },
        { id: "c13-701-5", x: 128.3, y: 94, deptType: "CH", assignment: "Ar-C3,5 (對稱 2C)" },
        { id: "c13-701-6", x: 60.9, y: 84, deptType: "CH2", assignment: "-OCH₂-" },
        { id: "c13-701-7", x: 14.3, y: 80, deptType: "CH3", assignment: "-CH₃" },
      ]),
      MS: buildPresetSpectrum(
        "MS",
        "Demo_SR701_EthylBenzoate_EIMS.jdx",
        [
          { id: "ms-701-1", x: 150, y: 32, isMolecularIonCandidate: true, assignment: "[M]⁺• (C9H10O2)" },
          { id: "ms-701-2", x: 122, y: 38, assignment: "[M - C₂H₄]⁺• (McLafferty 脫乙烯)" },
          { id: "ms-701-3", x: 105, y: 100, isBasePeak: true, assignment: "[C₆H₅CO]⁺ (苯甲醯基正離子基峰)" },
          { id: "ms-701-4", x: 77, y: 56, assignment: "[C₆H₅]⁺ (苯基正離子)" },
        ],
        { msType: "EI-MS", ionization: "EI", massToleranceDa: 0.5, isHighResolution: false }
      ),
    },
  },
  {
    id: "preset-paracetamol",
    sampleCode: "DEMO-SR-801",
    title: "乙醯胺酚 (Paracetamol / Acetaminophen) [示範參考資料]",
    subtitle: "奇數分子量氮規則 (MW=151) + 1,4-對二取代 AA'BB' + 醯胺 Amide I/II",
    dataOriginLabel: "示範參考資料 (Demo / Simulated Reference Data)",
    smiles: "CC(=O)Nc1ccc(O)cc1",
    inchi: "InChI=1S/C8H9NO2/c1-6(10)9-7-2-4-8(11)5-3-7/h2-5,11H,1H3,(H,9,10)",
    formula: "C8H9NO2",
    defaultWithExpectedStructure: false,
    spectra: {
      IR: buildPresetSpectrum("IR", "Demo_SR801_Paracetamol_FTIR.jdx", [
        { id: "ir-801-1", x: 3325, y: 78, width: 32, shape: "sharp", assignment: "仲醯胺 N-H 伸縮" },
        { id: "ir-801-2", x: 3160, y: 72, width: 120, shape: "broad", isBroad: true, assignment: "酚羥基 Ar-OH 氫鍵伸縮" },
        { id: "ir-801-3", x: 1654, y: 98, width: 24, shape: "sharp", assignment: "醯胺 Amide I 帶 (C=O 伸縮)" },
        { id: "ir-801-4", x: 1564, y: 86, width: 24, shape: "sharp", assignment: "醯胺 Amide II 帶 (N-H 彎曲 + C-N 伸縮)" },
        { id: "ir-801-5", x: 1506, y: 82, width: 20, shape: "sharp", assignment: "對位取代芳環骨架伸縮" },
        { id: "ir-801-6", x: 836, y: 76, width: 20, shape: "sharp", assignment: "1,4-對二取代苯環 C-H OOP 彎曲" },
      ]),
      "1H_NMR": buildPresetSpectrum("1H_NMR", "Demo_SR801_Paracetamol_1H.jdx", [
        { id: "h1-801-1", x: 9.65, y: 52, integration: 1, integral: 1, multiplicity: "s", jValues: [], assignment: "醯胺質子 -NHCO-" },
        { id: "h1-801-2", x: 9.14, y: 48, integration: 1, integral: 1, multiplicity: "s", jValues: [], assignment: "酚羥基質子 Ar-OH" },
        { id: "h1-801-3", x: 7.34, y: 90, integration: 2, integral: 2, multiplicity: "d", jValues: [8.8], assignment: "Ar-H (鄰近 -NHAc, AA'BB' 2H)" },
        { id: "h1-801-4", x: 6.68, y: 88, integration: 2, integral: 2, multiplicity: "d", jValues: [8.8], assignment: "Ar-H (鄰近 -OH, AA'BB' 2H)" },
        { id: "h1-801-5", x: 1.98, y: 100, integration: 3, integral: 3, multiplicity: "s", jValues: [], assignment: "乙醯胺甲基 -NHCOCH₃ (3H)" },
      ]),
      "13C_NMR": buildPresetSpectrum("13C_NMR", "Demo_SR801_Paracetamol_13C.jdx", [
        { id: "c13-801-1", x: 168.1, y: 60, deptType: "C", assignment: "醯胺羰基碳 -NHC(=O)-" },
        { id: "c13-801-2", x: 153.4, y: 56, deptType: "C", assignment: "Ar-C4 (酚羥基接位季碳)" },
        { id: "c13-801-3", x: 131.3, y: 54, deptType: "C", assignment: "Ar-C1 (醯胺基接位季碳)" },
        { id: "c13-801-4", x: 121.0, y: 94, deptType: "CH", assignment: "Ar-C2,6 (對稱 2C)" },
        { id: "c13-801-5", x: 115.2, y: 92, deptType: "CH", assignment: "Ar-C3,5 (對稱 2C)" },
        { id: "c13-801-6", x: 24.0, y: 84, deptType: "CH3", assignment: "乙醯基甲基碳 -CH₃" },
      ]),
      MS: buildPresetSpectrum(
        "MS",
        "Demo_SR801_Paracetamol_EIMS.jdx",
        [
          { id: "ms-801-1", x: 151, y: 64, isMolecularIonCandidate: true, assignment: "[M]⁺• (奇數分子量 151 Da，符合 1N 氮規則)" },
          { id: "ms-801-2", x: 109, y: 100, isBasePeak: true, assignment: "[M - CH₂=C=O]⁺• (m/z 109 對胺基苯酚基峰)" },
          { id: "ms-801-3", x: 80, y: 32, assignment: "[C₅H₆N]⁺ (脫 CO 次級碎片)" },
          { id: "ms-801-4", x: 43, y: 42, assignment: "[CH₃CO]⁺ (乙醯基正離子)" },
        ],
        { msType: "EI-MS", ionization: "EI", massToleranceDa: 0.5, isHighResolution: false }
      ),
    },
  },
].map((p) => ({
  ...p,
  name: p.title,
  description: p.subtitle,
  expectedFormula: p.formula,
  referenceSmiles: p.smiles,
}));

export function buildPresetSpectra(
  preset?: ReferenceSamplePreset
): Partial<Record<SpectrumModality, ExperimentalSpectrumData>> {
  if (!preset || !preset.spectra) return {};
  const clone: Partial<Record<SpectrumModality, ExperimentalSpectrumData>> = {};
  for (const mod of ["IR", "1H_NMR", "13C_NMR", "MS"] as SpectrumModality[]) {
    const s = preset.spectra[mod];
    if (s) {
      clone[mod] = {
        ...s,
        points: s.points.map((pt) => ({ ...pt })),
        peaks: s.peaks.map((pk) => ({
          ...pk,
          integral: pk.integral ?? pk.integration ?? undefined,
          userClassification: pk.userClassification ?? pk.classificationTag ?? "COMPOUND",
        })),
      };
    }
  }
  return clone;
}



