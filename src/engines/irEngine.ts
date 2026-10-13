import {graphChemicalFeatures} from "./scientificEngines/graphChemicalFeatures";
import {matchesSMARTS} from "./scientificEngines/rdkitAdapter";
import {prepareIR, irRangeCovered} from "./scientificEngines/irSignalProcessing";
import {
  CompetingHypothesisRecord,
  EvidenceReference,
  ExperimentalSpectrumData,
  FunctionalGroupConstraint,
  InferenceLevel,
  IRFunctionalGroupFinding,
  ParsedChemicalStructure,
  SpectralPeak,
  StructuralConstraints,
} from "../types/spectrum";
import { StructureParserAdapter } from "./chemistryEngine";
import { DataValidator } from "./dataValidator";
import { SpectrumParser } from "./spectrumParser";

interface IRRuleDefinition {
  id: string;
  functionalGroup: string;
  family: string;
  minCm: number;
  maxCm: number;
  expectedRangeLabel: string;
  minIntensity: number;
  expectedShape?: "broad" | "sharp" | "medium";
  assignment: string;
  inferenceLevel: InferenceLevel;
  alternativeExplanations: string[];
  electronicAndHBondEffects: string[];
  companionChecks?: {
    label: string;
    minCm: number;
    maxCm: number;
    bonusConfidence: number;
    penaltyIfMissing: number;
  }[];
  referenceInfo: string;
}

const IR_SPECTROSCOPIC_RULES: IRRuleDefinition[] = [
  {
    id: "carboxylic-acid-oh",
    functionalGroup: "羧酸基 Carboxylic Acid (二聚體強氫鍵 O-H 與 C=O 協同吸收)",
    family: "Carboxylic acid",
    minCm: 2500,
    maxCm: 3300,
    expectedRangeLabel: "2500–3300 cm⁻¹ (超寬強二聚體 O-H 帶) + 1680–1730 cm⁻¹ (C=O) + 1210–1320 cm⁻¹ (C-O)",
    minIntensity: 32,
    expectedShape: "broad",
    assignment: "羧酸中心對稱二聚體強氫鍵 ν(O-H) 伸縮振動與 ν(C=O) 伸縮振動協同吸收",
    inferenceLevel: "LEVEL_3_FUNCTIONAL_GROUP_HYPOTHESIS",
    alternativeExplanations: [
      "分子內強螯合氫鍵酚/烯醇 O-H (2700–3200 cm⁻¹) 疊加脂族 C-H 伸縮帶",
      "銨鹽 N⁺-H 寬帶 (2400–3200 cm⁻¹，但缺乏 1700 cm⁻¹ 羧酸 C=O 峰)",
    ],
    electronicAndHBondEffects: [
      "中心對稱八元環二聚體強氫鍵使 O-H 力常數大幅下降 (紅移至 2500–3300 cm⁻¹) 並劇烈展寬",
      "芳環共軛羧酸 C=O 由 ~1712 cm⁻¹ 紅移至 1680–1700 cm⁻¹",
    ],
    companionChecks: [
      { label: "羧酸 C=O 伸縮振動 (1680–1735 cm⁻¹)", minCm: 1680, maxCm: 1735, bonusConfidence: 20, penaltyIfMissing: 38 },
      { label: "羧酸 C-O 伸縮振動 (1210–1320 cm⁻¹)", minCm: 1210, maxCm: 1320, bonusConfidence: 8, penaltyIfMissing: 5 },
      { label: "二聚體 O-H 面外彎曲振動 (900–960 cm⁻¹)", minCm: 900, maxCm: 960, bonusConfidence: 6, penaltyIfMissing: 0 },
    ],
    referenceInfo: "Silverstein / Socrates IR Group Frequencies (羧酸二聚體強氫鍵 O-H + C=O + C-O 多峰協同判讀模型)",
  },
  {
    id: "free-hydroxyl-oh",
    functionalGroup: "游離態或空間位阻羥基 Free / Sterically Hindered O-H (Alcohol / Phenol)",
    family: "Alcohol",
    minCm: 3580,
    maxCm: 3670,
    expectedRangeLabel: "3580–3670 cm⁻¹ (尖銳游離態 ν O-H) + 1020–1265 cm⁻¹ (ν C-O)",
    minIntensity: 20,
    expectedShape: "sharp",
    assignment: "未參與分子間氫鍵之游離態 O-H 伸縮振動（稀薄非極性溶液或鄰位大位阻酚）",
    inferenceLevel: "LEVEL_3_FUNCTIONAL_GROUP_HYPOTHESIS",
    alternativeExplanations: [
      "痕量游離單體水峰 (約 3610–3640 cm⁻¹)",
    ],
    electronicAndHBondEffects: [
      "無氫鍵削弱 O-H 鍵，保持高力常數 k 與窄半高寬 (FWHM < 25 cm⁻¹)",
    ],
    companionChecks: [
      { label: "醇/酚 C-O 伸縮振動 (1020–1265 cm⁻¹)", minCm: 1020, maxCm: 1265, bonusConfidence: 14, penaltyIfMissing: 12 },
    ],
    referenceInfo: "Socrates Infrared and Raman Characteristic Group Frequencies (Free ν O-H 3580–3670 cm⁻¹)",
  },
  {
    id: "alcohol-phenol-oh",
    functionalGroup: "醇或酚羥基 Alcohol / Phenol (分子間氫鍵 O-H)",
    family: "Alcohol",
    minCm: 3200,
    maxCm: 3575,
    expectedRangeLabel: "3200–3550 cm⁻¹ (分子間氫鍵寬峰) + 1020–1265 cm⁻¹ (C-O 伸縮：一級醇 ~1050、二級醇 ~1100、三級醇 ~1150、酚 ~1230 cm⁻¹)",
    minIntensity: 28,
    expectedShape: "broad",
    assignment: "分子間氫鍵多聚體 ν(O-H) 寬伸縮振動與 C-O 伸縮協同吸收",
    inferenceLevel: "LEVEL_3_FUNCTIONAL_GROUP_HYPOTHESIS",
    alternativeExplanations: [
      "樣品吸附水或結晶水 H-O-H 伸縮寬帶 (3300–3500 cm⁻¹，通常伴隨 1630 cm⁻¹ 弱彎曲帶且缺乏強 C-O 峰)",
      "氫鍵化醯胺或胺 N-H 伸縮 (若為 N-H 通常峰形較窄或具對稱/非對稱雙峰，且需含氮分子式支持)",
    ],
    electronicAndHBondEffects: [
      "分子間 O-H···O 氫鍵使頻率由 ~3620 cm⁻¹ 紅移至 3200–3550 cm⁻¹，且不同聚合度分布造成非均勻展寬",
      "酚基 Ar-OH 因氧孤對電子與芳環共振，C-O 鍵具雙鍵性質，ν(Ar-O) 藍移至 1200–1265 cm⁻¹",
    ],
    companionChecks: [
      { label: "醇/酚 C-O 伸縮振動 (1020–1265 cm⁻¹)", minCm: 1020, maxCm: 1265, bonusConfidence: 16, penaltyIfMissing: 14 },
      { label: "O-H 面內彎曲 δ(O-H) (1310–1420 cm⁻¹)", minCm: 1310, maxCm: 1420, bonusConfidence: 6, penaltyIfMissing: 0 },
    ],
    referenceInfo: "Silverstein / Pretsch Tables of Spectral Data (Intermolecular H-bonded ν O-H & C-O classification)",
  },
  {
    id: "intramolecular-chelated-oh",
    functionalGroup: "分子內氫鍵羥基 / 鄰羥基芳基羰基或烯醇 (Intramolecular H-Bonded O-H)",
    family: "Alcohol",
    minCm: 2700,
    maxCm: 3220,
    expectedRangeLabel: "2700–3220 cm⁻¹ (分子內六元環螯合寬 O-H) + 1615–1675 cm⁻¹ (強氫鍵紅移共軛 C=O)",
    minIntensity: 22,
    expectedShape: "broad",
    assignment: "分子內六元環螯合氫鍵 O-H···O=C 伸縮振動（如水楊酸衍生物、鄰羥基苯乙酮、β-二酮烯醇式）",
    inferenceLevel: "LEVEL_3_FUNCTIONAL_GROUP_HYPOTHESIS",
    alternativeExplanations: [
      "羧酸二聚體 O-H 寬帶 (2500–3300 cm⁻¹)",
    ],
    electronicAndHBondEffects: [
      "分子內六元環共振輔助氫鍵 (RAHB) 顯著紅移 ν(O-H) 至 2700–3220 cm⁻¹，同時使共軛 C=O 紅移 30–50 cm⁻¹ 至 1620–1670 cm⁻¹",
    ],
    companionChecks: [
      { label: "螯合紅移羰基 C=O 或共軛 C=C (1615–1680 cm⁻¹)", minCm: 1615, maxCm: 1680, bonusConfidence: 18, penaltyIfMissing: 25 },
      { label: "酚基 C-O 伸縮 (1200–1275 cm⁻¹)", minCm: 1200, maxCm: 1275, bonusConfidence: 8, penaltyIfMissing: 5 },
    ],
    referenceInfo: "Bellamy / Silverstein IR Spectroscopy (Intramolecular chelated H-bond O-H···O=C shift rules)",
  },
  {
    id: "primary-secondary-amine-nh",
    functionalGroup: "胺基候選 Amine (N-H 伸縮與彎曲 — 需與 O-H 及分子式含氮性交叉驗證)",
    family: "Amine",
    minCm: 3300,
    maxCm: 3500,
    expectedRangeLabel: "3300–3500 cm⁻¹ (-NH₂ 非對稱/對稱雙峰或 -NH- 單峰，較 O-H 尖銳) + 1580–1650 cm⁻¹ (NH₂ 剪式彎曲)",
    minIntensity: 18,
    assignment: "一級胺 (-NH₂) 非對稱/對稱雙峰或二級胺 (-NH-) 單峰 N-H 伸縮振動",
    inferenceLevel: "LEVEL_3_FUNCTIONAL_GROUP_HYPOTHESIS",
    alternativeExplanations: [
      "弱氫鍵或稀溶液醇/酚 O-H 伸縮帶 (3300–3550 cm⁻¹)",
      "醯胺 N-H 伸縮帶 (若同時存在 1630–1690 cm⁻¹ 強 Amide I C=O 帶則優先歸屬醯胺)",
    ],
    electronicAndHBondEffects: [
      "氮電負度低於氧，N-H···N 氫鍵較弱，故 N-H 吸收較 O-H 尖銳且偶極矩變化 |∂μ/∂Q| 較小（強度中至弱）",
      "三級胺 (-NR₃) 無 N-H 鍵，在 3200–3500 cm⁻¹ 不出現吸收峰，僅具 1080–1360 cm⁻¹ C-N 伸縮",
    ],
    companionChecks: [
      { label: "N-H 面內剪式彎曲振動 δ(NH₂) (1580–1650 cm⁻¹)", minCm: 1580, maxCm: 1650, bonusConfidence: 14, penaltyIfMissing: 12 },
      { label: "C-N 伸縮振動 (1080–1360 cm⁻¹)", minCm: 1080, maxCm: 1360, bonusConfidence: 10, penaltyIfMissing: 8 },
    ],
    referenceInfo: "Pretsch / Socrates IR Characteristic Frequencies (Primary doublet vs Secondary singlet N-H & δ NH₂)",
  },
  {
    id: "alkyne-ch-cc",
    functionalGroup: "炔基 Alkyne (C≡C / 末端 ≡C-H)",
    family: "C≡C",
    minCm: 2100,
    maxCm: 2260,
    expectedRangeLabel: "2100–2260 cm⁻¹ (C≡C 伸縮，對稱內炔偶極變化極小可能極弱)",
    minIntensity: 15,
    assignment: "碳-碳參鍵 ν(C≡C) 伸縮振動",
    inferenceLevel: "LEVEL_3_FUNCTIONAL_GROUP_HYPOTHESIS",
    alternativeExplanations: [
      "腈基 C≡N (2210–2265 cm⁻¹，通常強度較強且更偏高波數)",
    ],
    electronicAndHBondEffects: [
      "末端炔具較大偶極矩導數 ∂μ/∂Q；高對稱內炔因 ∂μ/∂Q ≈ 0 在 IR 中極弱或不可見",
    ],
    companionChecks: [
      { label: "末端炔 ≡C-H 尖銳伸縮 (3260–3330 cm⁻¹)", minCm: 3260, maxCm: 3330, bonusConfidence: 16, penaltyIfMissing: 0 },
    ],
    referenceInfo: "Silverstein IR Group Frequencies (Alkyne C≡C and sp ≡C-H stretch)",
  },
  {
    id: "nitrile-cn",
    functionalGroup: "腈基 Nitrile (C≡N)",
    family: "Nitrile",
    minCm: 2210,
    maxCm: 2265,
    expectedRangeLabel: "2215–2240 cm⁻¹ (芳香/共軛 C≡N) 或 2240–2260 cm⁻¹ (脂肪族 C≡N)",
    minIntensity: 25,
    expectedShape: "sharp",
    assignment: "共軛或脂肪族 C≡N 參鍵伸縮振動",
    inferenceLevel: "LEVEL_3_FUNCTIONAL_GROUP_HYPOTHESIS",
    alternativeExplanations: [
      "非對稱取代炔 C≡C (2190–2260 cm⁻¹，但缺乏含氮分子式與 ¹³C ~115–122 ppm 腈碳特徵)",
    ],
    electronicAndHBondEffects: [
      "與芳環或烯鍵共軛使 C≡N 參鍵力常數略降，波數由脂肪族 ~2250 cm⁻¹ 紅移至 2220–2235 cm⁻¹ 且強度增加",
    ],
    referenceInfo: "Pretsch / Silverstein IR Tables (Conjugated vs aliphatic nitrile ν C≡N)",
  },
  {
    id: "aldehyde-co-ch",
    functionalGroup: "醛基 Aldehyde (C=O 與 Fermi 共振 C-H 雙峰)",
    family: "Aldehyde",
    minCm: 1680,
    maxCm: 1740,
    expectedRangeLabel: "1685–1710 cm⁻¹ (共軛芳醛) 或 1720–1740 cm⁻¹ (脂肪醛) + 2700–2860 cm⁻¹ (Fermi 共振 C-H 雙峰)",
    minIntensity: 55,
    assignment: "醛基羰基 ν(C=O) 伸縮搭配醛基 C-H 伸縮與面內彎曲倍頻之 Fermi 共振雙峰",
    inferenceLevel: "LEVEL_3_FUNCTIONAL_GROUP_HYPOTHESIS",
    alternativeExplanations: [
      "酮基或酯基 C=O（若 2700–2850 cm⁻¹ 僅為一般脂族 C-H 尾巴且 ¹H NMR 無 9.3–10.5 ppm 醛基質子峰）",
    ],
    electronicAndHBondEffects: [
      "芳環或 α,β-不飽和共軛使 π 電子離域，降低 C=O 雙鍵成分，頻率由 ~1730 cm⁻¹ 紅移至 1685–1705 cm⁻¹",
      "醛基 ν(C-H) 基頻 (~2780 cm⁻¹) 與 2×δ(CHO) 倍頻 (~2780 cm⁻¹) 發生量子力學 Fermi 共振分裂為 ~2820 與 ~2720 cm⁻¹ 雙峰",
    ],
    companionChecks: [
      { label: "醛基 C-H Fermi 共振雙峰 (2700–2860 cm⁻¹)", minCm: 2700, maxCm: 2860, bonusConfidence: 22, penaltyIfMissing: 22 },
    ],
    referenceInfo: "Silverstein / Pretsch IR Spectroscopy (Aldehyde C=O & Fermi resonance doublet)",
  },
  {
    id: "ester-co",
    functionalGroup: "酯基 Ester (C=O 與 C-O-C 雙強帶協同)",
    family: "Ester",
    minCm: 1710,
    maxCm: 1780,
    expectedRangeLabel: "1735–1755 cm⁻¹ (飽和脂族酯)、1715–1730 cm⁻¹ (芳香共軛酯)、1755–1775 cm⁻¹ (酚酯/乙烯酯/五元內酯) + 1150–1290 cm⁻¹ (強 C-O)",
    minIntensity: 58,
    assignment: "酯基羰基 ν(C=O) 伸縮搭配強 C(=O)-O 非對稱伸縮與 O-C-C 伸縮振動",
    inferenceLevel: "LEVEL_3_FUNCTIONAL_GROUP_HYPOTHESIS",
    alternativeExplanations: [
      "五元環酮 (1740–1755 cm⁻¹，若缺乏 1150–1290 cm⁻¹ 強 C-O 伸縮帶且 ¹³C C=O 位於 >205 ppm)",
      "羧酸單體或脂肪酮（需結合 2500–3300 cm⁻¹ O-H 帶有無及 ¹³C 165–175 ppm 酯碳區確認）",
    ],
    electronicAndHBondEffects: [
      "烷氧基氧原子強誘導吸電子效應 (-I) 大於共振給電子 (+M)，使飽和酯 C=O 藍移至 1735–1750 cm⁻¹",
      "醯基側連接苯環 (Ar-COOR) 產生共軛紅移至 1715–1730 cm⁻¹；酚氧側連接苯環 (R-COO-Ar) 因氧孤對與苯環共振削弱對羰基 +M，藍移至 1755–1770 cm⁻¹",
      "五元環內酯 (γ-lactone) 因環張力提高羰基碳 s 成分，藍移至 1765–1780 cm⁻¹",
    ],
    companionChecks: [
      { label: "強酯基 C(=O)-O 非對稱伸縮 (1150–1295 cm⁻¹)", minCm: 1150, maxCm: 1295, bonusConfidence: 20, penaltyIfMissing: 25 },
      { label: "烷氧基 O-C 伸縮 (1020–1145 cm⁻¹)", minCm: 1020, maxCm: 1145, bonusConfidence: 6, penaltyIfMissing: 0 },
    ],
    referenceInfo: "Silverstein / Socrates IR Tables (Aliphatic, Conjugated Aryl, Phenolic Ester & Lactone C=O + C-O rules)",
  },
  {
    id: "ketone-co",
    functionalGroup: "酮基 Ketone (共軛芳酮 / 脂肪酮 / 環酮 C=O)",
    family: "Ketone",
    minCm: 1665,
    maxCm: 1755,
    expectedRangeLabel: "1675–1700 cm⁻¹ (芳基共軛酮)、1705–1725 cm⁻¹ (開鏈脂肪酮/六元環酮)、1740–1755 cm⁻¹ (五元環張力酮)",
    minIntensity: 58,
    assignment: "酮基羰基 ν(C=O) 伸縮振動（無 O-H 寬帶與無醛基 Fermi 雙峰）",
    inferenceLevel: "LEVEL_3_FUNCTIONAL_GROUP_HYPOTHESIS",
    alternativeExplanations: [
      "共軛芳香酯或醛基 (1685–1730 cm⁻¹，需檢查有無 1150–1290 cm⁻¹ 強エステル C-O 帶或 ¹H 9.5–10.2 ppm 醛氫)",
      "三級醯胺 (-CONR₂，1630–1680 cm⁻¹，若分子式含氮且 ¹³C C=O 位於 165–175 ppm)",
    ],
    electronicAndHBondEffects: [
      "烷基給電子效應使開鏈酮穩定於 ~1715 cm⁻¹；苯環或烯鍵共軛使 π* 軌域離域，紅移 25–35 cm⁻¹ 至 ~1685 cm⁻¹",
      "小環張力效應：六元環 ~1715 cm⁻¹ → 五元環 ~1745 cm⁻¹ → 四元環 ~1780 cm⁻¹",
    ],
    referenceInfo: "Silverstein / Pretsch IR Tables (Acyclic, Aryl Conjugated, and Ring-Strained Cyclic Ketone ν C=O)",
  },
  {
    id: "amide-co",
    functionalGroup: "醯胺基 Amide (Amide I C=O 與 Amide II N-H/C-N)",
    family: "Amide",
    minCm: 1630,
    maxCm: 1695,
    expectedRangeLabel: "1630–1690 cm⁻¹ (Amide I ν C=O) + 1510–1570 cm⁻¹ (Amide II δ N-H + ν C-N，三級醯胺無此帶) + 3180–3460 cm⁻¹ (ν N-H)",
    minIntensity: 55,
    assignment: "醯胺 I 帶 C=O 伸縮與醯胺 II 帶 N-H 彎曲/C-N 伸縮耦合振動",
    inferenceLevel: "LEVEL_3_FUNCTIONAL_GROUP_HYPOTHESIS",
    alternativeExplanations: [
      "分子內氫鍵共軛芳酮或水楊酸/鄰羥基芳基羰基 (1630–1685 cm⁻¹，若分子不含氮則為螯合共軛羰基或高強度烯鍵/芳環骨架帶)",
      "共軛烯烴或芳環骨架伸縮 (1600–1660 cm⁻¹，通常強度明顯弱於羰基)",
    ],
    electronicAndHBondEffects: [
      "氮孤對電子強烈共振推電子 (+M: O=C-N ↔ ⁻O-C=N⁺) 大幅降低 C=O 雙鍵級數，使頻率顯著紅移至 1630–1690 cm⁻¹",
      "一級/二級醯胺具 N-H 伸縮 (3180–3460 cm⁻¹) 與 Amide II 帶 (1510–1570 cm⁻¹)；三級醯胺 (-CONR₂) 僅具 Amide I 帶而無 N-H 吸收",
    ],
    companionChecks: [
      { label: "醯胺 N-H 伸縮振動 (3180–3460 cm⁻¹)", minCm: 3180, maxCm: 3460, bonusConfidence: 16, penaltyIfMissing: 14 },
      { label: "醯胺 II 帶 δ(N-H)+ν(C-N) (1510–1575 cm⁻¹)", minCm: 1510, maxCm: 1575, bonusConfidence: 12, penaltyIfMissing: 8 },
    ],
    referenceInfo: "Socrates / Silverstein IR Tables (Primary, Secondary, and Tertiary Amide I & II modes)",
  },
  {
    id: "aromatic-ring",
    functionalGroup: "芳香環 Aromatic Ring (C=C 骨架伸縮與 C-H 面外彎曲)",
    family: "Aromatic",
    minCm: 1580,
    maxCm: 1620,
    expectedRangeLabel: "1585–1615 & 1485–1525 cm⁻¹ (環 C=C 對偶峰) + 3010–3100 cm⁻¹ (sp² C-H) + 690–860 cm⁻¹ (C-H OOP)",
    minIntensity: 30,
    assignment: "芳香環骨架 C=C 面內伸縮振動與取代位置相關之 C-H 面外彎曲 (OOP)",
    inferenceLevel: "LEVEL_3_FUNCTIONAL_GROUP_HYPOTHESIS",
    alternativeExplanations: [
      "共軛烯烴 C=C 伸縮 (1600–1660 cm⁻¹) 或一級胺 NH₂ 剪式彎曲 (1580–1650 cm⁻¹)",
    ],
    electronicAndHBondEffects: [
      "芳環接有供電子基 (-OH, -OR, -NH₂) 或拉電子基 (-NO₂, -COR) 時，環偶極不對稱性提高，1600/1500 cm⁻¹ 骨架強度顯著增強",
    ],
    companionChecks: [
      { label: "第二芳香環骨架伸縮 (1485–1525 cm⁻¹)", minCm: 1485, maxCm: 1525, bonusConfidence: 14, penaltyIfMissing: 8 },
      { label: "芳香環 C-H 面外彎曲 OOP (690–860 cm⁻¹)", minCm: 690, maxCm: 860, bonusConfidence: 14, penaltyIfMissing: 8 },
      { label: "芳香族 sp² C-H 伸縮 (3010–3100 cm⁻¹)", minCm: 3010, maxCm: 3100, bonusConfidence: 6, penaltyIfMissing: 0 },
    ],
    referenceInfo: "Silverstein / Pretsch IR Tables (Aromatic 1600/1500 cm⁻¹ ring skeletal pair & OOP substitution patterns)",
  },
  {
    id: "nitro-no2",
    functionalGroup: "硝基 Nitro (-NO₂)",
    family: "Nitro",
    minCm: 1510,
    maxCm: 1565,
    expectedRangeLabel: "1510–1560 cm⁻¹ (非對稱 ν_as NO₂) + 1330–1375 cm⁻¹ (對稱 ν_s NO₂)",
    minIntensity: 55,
    assignment: "硝基 N=O 非對稱與對稱強耦合伸縮振動",
    inferenceLevel: "LEVEL_3_FUNCTIONAL_GROUP_HYPOTHESIS",
    alternativeExplanations: [
      "芳香環 1500 cm⁻¹ 骨架帶搭配脂族 CH₃ 1375 cm⁻¹ 傘狀彎曲（若分子式不含氮或缺乏雙強峰協同）",
      "二級醯胺 Amide II 帶 (1515–1560 cm⁻¹)",
    ],
    electronicAndHBondEffects: [
      "芳香共軛硝基 (Ar-NO₂) 使 ν_as 位於 1510–1535 cm⁻¹、ν_s 位於 1335–1355 cm⁻¹；同時強烈去遮蔽鄰位芳氫至 ¹H 8.1–8.4 ppm（易被誤判為吡啶，須注意區分）",
    ],
    companionChecks: [
      { label: "對稱 NO₂ 強伸縮 (1330–1375 cm⁻¹)", minCm: 1330, maxCm: 1375, bonusConfidence: 20, penaltyIfMissing: 30 },
    ],
    referenceInfo: "Silverstein IR Group Frequencies (Conjugated aryl and aliphatic nitro asymmetric/symmetric stretches)",
  },
  {
    id: "ether-co",
    functionalGroup: "醚基 / 芳基烷基醚或醇酯 C-O 伸縮候選 (C-O-C / C-O)",
    family: "Ether",
    minCm: 1225,
    maxCm: 1278,
    expectedRangeLabel: "1230–1275 cm⁻¹ (Ar-O 非對稱伸縮) + 1020–1060 cm⁻¹ (O-CH₃/O-CH₂ 對稱伸縮)",
    minIntensity: 45,
    assignment: "指紋區 C-O-C 非對稱與對稱伸縮振動（如甲氧基苯醚或酚/芳酯 Ar-O 伸縮）",
    inferenceLevel: "LEVEL_2_LOCAL_CHEMICAL_ENVIRONMENT",
    alternativeExplanations: [
      "酚羥基 Ar-OH 之 C-O 伸縮 (1200–1265 cm⁻¹，若同時存在 3200–3550 cm⁻¹ O-H 寬帶)",
      "芳香酯或乙酸酯之 C(=O)-O 伸縮 (1230–1280 cm⁻¹，若同時存在 1715–1765 cm⁻¹ C=O 強帶)",
    ],
    electronicAndHBondEffects: [
      "芳基氧 sp² 碳-氧鍵具部分雙鍵性質 (ν_as ~1250 cm⁻¹)，烷基氧 sp³ 碳-氧鍵位於 ~1030–1120 cm⁻¹",
    ],
    companionChecks: [
      { label: "對稱 C-O-C 伸縮 (1015–1065 cm⁻¹)", minCm: 1015, maxCm: 1065, bonusConfidence: 15, penaltyIfMissing: 8 },
    ],
    referenceInfo: "Silverstein / Socrates IR Tables (Aryl alkyl ether ~1250 & ~1030 cm⁻¹ vs phenol/ester C-O)",
  },
  {
    id: "aliphatic-alcohol-ether-co",
    functionalGroup: "脂肪醇或脂肪醚 C-O 伸縮環境 (Aliphatic C-O Stretch)",
    family: "Alcohol",
    minCm: 1030,
    maxCm: 1155,
    expectedRangeLabel: "1030–1075 cm⁻¹ (一級醇 C-O)、1085–1125 cm⁻¹ (二級醇/脂肪醚 C-O)、1130–1200 cm⁻¹ (三級醇 C-O)",
    minIntensity: 42,
    assignment: "sp³ 碳-氧單鍵 ν(C-O) 伸縮振動（需結合 3200–3600 cm⁻¹ O-H 帶區分醇與醚）",
    inferenceLevel: "LEVEL_2_LOCAL_CHEMICAL_ENVIRONMENT",
    alternativeExplanations: [
      "脂肪醚 C-O-C 非對稱伸縮 (1085–1150 cm⁻¹，無 3200–3600 cm⁻¹ O-H 吸收帶)",
      "酯基 O-C-C 伸縮或芳環面內 C-H 彎曲振動",
    ],
    electronicAndHBondEffects: [
      "α-碳支鏈增加使 C-C-O 對稱/非對稱耦合頻率升高：一級醇 (~1050 cm⁻¹) < 二級醇 (~1100 cm⁻¹) < 三級醇 (~1150 cm⁻¹)",
    ],
    companionChecks: [
      { label: "醇羥基 O-H 寬伸縮帶 (3200–3650 cm⁻¹)", minCm: 3200, maxCm: 3650, bonusConfidence: 18, penaltyIfMissing: 16 },
    ],
    referenceInfo: "Silverstein / Pretsch IR Tables (Primary, Secondary, Tertiary Alcohol vs Ether C-O stretch)",
  },
  {
    id: "siloxane-siosi",
    functionalGroup: "矽氧烷 Siloxane (Si-O-Si 與 Si-CH₃)",
    family: "Siloxane",
    minCm: 1010,
    maxCm: 1100,
    expectedRangeLabel: "1020–1095 cm⁻¹ (Si-O-Si) + 1255–1265 cm⁻¹ (Si-CH₃) + ~800 cm⁻¹ (Si-C)",
    minIntensity: 60,
    assignment: "Si-O-Si 主鏈非對稱伸縮搭配 Si-CH₃ 傘狀變形振動",
    inferenceLevel: "LEVEL_3_FUNCTIONAL_GROUP_HYPOTHESIS",
    alternativeExplanations: [
      "一般脂肪醇/醚 C-O 伸縮（若缺乏 1260 cm⁻¹ 尖銳 Si-CH₃ 峰與 ¹H ~0.1 ppm 訊號）",
    ],
    electronicAndHBondEffects: [
      "Si-O 鍵具高離子性與 dπ-pπ 作用，偶極矩導數極大，於 1020–1095 cm⁻¹ 產生極強寬帶",
    ],
    companionChecks: [
      { label: "Si-CH₃ 對稱傘狀變形 (1250–1270 cm⁻¹)", minCm: 1250, maxCm: 1270, bonusConfidence: 22, penaltyIfMissing: 25 },
      { label: "Si-C 伸縮與搖擺振動 (785–815 cm⁻¹)", minCm: 785, maxCm: 815, bonusConfidence: 15, penaltyIfMissing: 10 },
    ],
    referenceInfo: "Socrates Organosilicon IR Frequencies (1260 / 1020–1090 / 800 cm⁻¹ triad)",
  },
  {
    id: "sulfonyl-so2",
    functionalGroup: "磺醯基 Sulfonyl (-SO₂-)",
    family: "Sulfonyl",
    minCm: 1310,
    maxCm: 1360,
    expectedRangeLabel: "1310–1360 cm⁻¹ (非對稱 ν_as SO₂) + 1135–1175 cm⁻¹ (對稱 ν_s SO₂)",
    minIntensity: 55,
    assignment: "S=O 非對稱與對稱伸縮振動（指紋區雙強帶，需含硫分子式或 MS 同位素支持）",
    inferenceLevel: "LEVEL_2_LOCAL_CHEMICAL_ENVIRONMENT",
    alternativeExplanations: [
      "硝基對稱伸縮 (~1345 cm⁻¹) 或酯/酚 C-O 與 C-H 彎曲組合（若分子式不含硫 S 則排除磺醯基）",
    ],
    electronicAndHBondEffects: [
      "磺醯基強拉電子誘導效應使鄰近芳氫去遮蔽至 7.8–8.1 ppm",
    ],
    companionChecks: [
      { label: "對稱 SO₂ 伸縮 (1135–1175 cm⁻¹)", minCm: 1135, maxCm: 1175, bonusConfidence: 18, penaltyIfMissing: 28 },
    ],
    referenceInfo: "Silverstein IR Group Frequencies (Sulfone / Sulfonamide asymmetric & symmetric S=O stretches)",
  },
  {
    id: "aliphatic-ch",
    functionalGroup: "脂肪族 sp³ C-H (伸縮與彎曲)",
    family: "C-H",
    minCm: 2840,
    maxCm: 2995,
    expectedRangeLabel: "2850–2970 cm⁻¹ (sp³ C-H 伸縮) + 1370–1470 cm⁻¹ (CH₂ 剪式 / CH₃ 傘狀彎曲)",
    minIntensity: 20,
    assignment: "烷基 CH₃ / CH₂ 非對稱與對稱伸縮振動",
    inferenceLevel: "LEVEL_2_LOCAL_CHEMICAL_ENVIRONMENT",
    alternativeExplanations: [
      "羧酸 O-H 寬帶覆蓋區內之疊加飽和 C-H 峰",
    ],
    electronicAndHBondEffects: [
      "sp³ 碳-氫鍵力常數低於 sp² (=C-H > 3000 cm⁻¹)，固定出現於 2840–3000 cm⁻¹",
    ],
    companionChecks: [
      { label: "CH₂ 剪式 / CH₃ 傘狀彎曲 (1365–1475 cm⁻¹)", minCm: 1365, maxCm: 1475, bonusConfidence: 14, penaltyIfMissing: 5 },
    ],
    referenceInfo: "Silverstein IR Group Frequencies (Aliphatic sp³ C-H stretch and scissoring/umbrella bend)",
  },
  {
    id: "halide-cbr-ccl",
    functionalGroup: "指紋區低波數彎曲或碳-鹵素候選振動 (Fingerprint OOP / C-Cl / C-Br Candidate)",
    family: "C-Br / C-Cl",
    minCm: 500,
    maxCm: 800,
    expectedRangeLabel: "500–680 cm⁻¹ (C-Br 候選) 或 650–800 cm⁻¹ (C-Cl 或芳環 OOP 彎曲候選)",
    minIntensity: 30,
    assignment: "指紋區 C-X 伸縮或芳環面外彎曲候選振動（單憑指紋區不可直接判定鹵素，必須由分子式或 MS M+2 同位素峰驗證）",
    inferenceLevel: "LEVEL_2_LOCAL_CHEMICAL_ENVIRONMENT",
    alternativeExplanations: [
      "單取代或鄰/間位取代苯環之 C-H 面外彎曲 (OOP, 680–780 cm⁻¹)",
      "脂肪鏈 -(CH₂)_n- 搖擺振動 (~720 cm⁻¹)",
    ],
    electronicAndHBondEffects: [
      "重原子 Cl/Br 折合質量 μ 大，使 C-X 伸縮落入 500–800 cm⁻¹ 指紋區，與芳環 OOP 高度重疊",
    ],
    referenceInfo: "Silverstein IR Tables (Fingerprint C-X vs Aromatic OOP — requires MS isotope confirmation)",
  },
  {
    id: "carbonyl-acyl-chloride",
    functionalGroup: "醯氯羰基 (Acyl Chloride C=O)",
    family: "Acyl chloride",
    minCm: 1785,
    maxCm: 1815,
    expectedRangeLabel: "1785–1815 cm⁻¹ (強尖峰 C=O 伸縮)",
    minIntensity: 55,
    expectedShape: "sharp",
    assignment: "醯氯高波數 C=O 伸縮振動（Cl 強誘導吸電子效應提高力常數 k）",
    inferenceLevel: "LEVEL_3_FUNCTIONAL_GROUP_HYPOTHESIS",
    alternativeExplanations: [
      "酸酐高波數對稱耦合帶 (1800–1830 cm⁻¹，若同時存在 1740–1775 cm⁻¹ 第二組 C=O 帶則為酸酐)",
      "四元環張力內酯/環丁酮 (~1780–1800 cm⁻¹)",
    ],
    electronicAndHBondEffects: [
      "氯原子強 -I 誘導效應與極弱 +M 共振使 C=O 雙鍵力常數顯著上升至 ~1800 cm⁻¹",
    ],
    companionChecks: [
      { label: "C-Cl 伸縮振動 (650–800 cm⁻¹)", minCm: 650, maxCm: 800, bonusConfidence: 12, penaltyIfMissing: 5 },
    ],
    referenceInfo: "Silverstein IR Group Frequencies (Acyl halide C=O 1785–1815 cm⁻¹)",
  },
  {
    id: "carbonyl-anhydride",
    functionalGroup: "酸酐雙羰基 (Anhydride Coupled Symmetric/Asymmetric C=O)",
    family: "Anhydride",
    minCm: 1795,
    maxCm: 1835,
    expectedRangeLabel: "1800–1830 cm⁻¹ 與 1740–1775 cm⁻¹ 雙 C=O 伸縮 (間距 ~60 cm⁻¹) + 1040–1100 cm⁻¹ C-O",
    minIntensity: 50,
    expectedShape: "sharp",
    assignment: "酸酐對稱與非對稱機械耦合雙 C=O 伸縮振動",
    inferenceLevel: "LEVEL_3_FUNCTIONAL_GROUP_HYPOTHESIS",
    alternativeExplanations: [
      "醯氯 (僅單一 ~1800 cm⁻¹ C=O 帶，無 1740–1775 cm⁻¹ 配對峰)",
    ],
    electronicAndHBondEffects: [
      "O=C-O-C=O 雙振子透過中心氧原子產生機械振動耦合，分裂為對稱與非對稱雙吸收帶（相距約 50–65 cm⁻¹）",
    ],
    companionChecks: [
      { label: "第二組酸酐 C=O 伸縮 (1740–1780 cm⁻¹)", minCm: 1740, maxCm: 1780, bonusConfidence: 20, penaltyIfMissing: 28 },
      { label: "酸酐 C-O-C 伸縮 (1030–1120 cm⁻¹)", minCm: 1030, maxCm: 1120, bonusConfidence: 10, penaltyIfMissing: 8 },
    ],
    referenceInfo: "Silverstein IR Group Frequencies (Anhydride coupled C=O doublet & C-O stretch)",
  },
  {
    id: "alkyne-triple-bond",
    functionalGroup: "炔基參鍵 (Alkyne C≡C / ≡C-H)",
    family: "Alkyne",
    minCm: 2100,
    maxCm: 2260,
    expectedRangeLabel: "2100–2260 cm⁻¹ (C≡C 伸縮) + 3260–3330 cm⁻¹ (末端 ≡C-H 尖峰)",
    minIntensity: 20,
    expectedShape: "sharp",
    assignment: "炔基 C≡C 參鍵伸縮振動",
    inferenceLevel: "LEVEL_3_FUNCTIONAL_GROUP_HYPOTHESIS",
    alternativeExplanations: [
      "腈基 C≡N (2215–2260 cm⁻¹，若無 3260–3330 cm⁻¹ ≡C-H 峰且分子含氮)",
    ],
    electronicAndHBondEffects: [
      "sp 碳參鍵力常數高，位於 2100–2260 cm⁻¹ 參鍵專屬窗口",
    ],
    companionChecks: [
      { label: "末端炔 sp C-H 尖銳伸縮 (3260–3330 cm⁻¹)", minCm: 3260, maxCm: 3330, bonusConfidence: 18, penaltyIfMissing: 0 },
    ],
    referenceInfo: "Silverstein IR Group Frequencies (Alkyne C≡C & sp C-H)",
  },
  {
    id: "terminal-alkyne-sp-ch",
    functionalGroup: "末端炔 sp C-H 伸縮 (Terminal Alkyne ≡C-H)",
    family: "Alkyne",
    minCm: 3260,
    maxCm: 3330,
    expectedRangeLabel: "3260–3330 cm⁻¹ (尖銳強峰，半高寬窄，區別於寬 O-H 帶)",
    minIntensity: 35,
    expectedShape: "sharp",
    assignment: "sp 混成末端炔 ≡C-H 伸縮振動",
    inferenceLevel: "LEVEL_3_FUNCTIONAL_GROUP_HYPOTHESIS",
    alternativeExplanations: [
      "二級胺或醯胺 N-H 伸縮 (~3300 cm⁻¹，但缺乏 2100–2150 cm⁻¹ C≡C 伸縮與 610–680 cm⁻¹ ≡C-H 彎曲帶)",
    ],
    electronicAndHBondEffects: [
      "sp 混成軌域含 50% s 成分，C-H 鍵短且力常數大，頻率高達 ~3300 cm⁻¹ 且峰形尖銳",
    ],
    companionChecks: [
      { label: "炔基 C≡C 伸縮 (2100–2260 cm⁻¹)", minCm: 2100, maxCm: 2260, bonusConfidence: 18, penaltyIfMissing: 8 },
    ],
    referenceInfo: "Silverstein IR Group Frequencies (Terminal alkyne sp C-H ~3300 cm⁻¹)",
  },
  {
    id: "heteroaromatic-pyridine-ring",
    functionalGroup: "芳香環或含氮雜芳環骨架候選 (Aromatic / Heteroaromatic C=C, C=N Candidate)",
    family: "Heteroaromatic",
    minCm: 1570,
    maxCm: 1595,
    expectedRangeLabel: "1575–1595 cm⁻¹ 與 1430–1485 cm⁻¹ (環骨架伸縮，與取代苯環高度重疊)",
    minIntensity: 35,
    assignment: "芳環或含氮芳香雜環 C=C / C=N 骨架伸縮競爭假設（單憑 IR 不可直接指定吡啶環，必須有含氮分子式與 NMR ³J 耦合正交驗證）",
    inferenceLevel: "LEVEL_2_LOCAL_CHEMICAL_ENVIRONMENT",
    alternativeExplanations: [
      "取代苯環 (Substituted Benzene Ring) 之 1580–1600 cm⁻¹ 與 1450–1500 cm⁻¹ 正常骨架振動（極常見，無需含氮）",
      "共軛羰基或羧酸鹽非對稱伸縮側帶",
    ],
    electronicAndHBondEffects: [
      "苯環與吡啶環之環骨架伸縮均落於 1570–1615 cm⁻¹ 及 1430–1520 cm⁻¹，單憑紅外線波數不具雜環專一性",
    ],
    companionChecks: [
      { label: "環骨架伸縮 II (1430–1485 cm⁻¹)", minCm: 1430, maxCm: 1485, bonusConfidence: 8, penaltyIfMissing: 15 },
      { label: "芳香 C-H 面外彎曲 OOP (695–755 cm⁻¹)", minCm: 695, maxCm: 755, bonusConfidence: 6, penaltyIfMissing: 8 },
    ],
    referenceInfo: "Socrates / Silverstein IR Tables (Aromatic vs heteroaromatic ring modes — non-exclusive without MS/NMR N confirmation)",
  },
];

export class IRAnalysisEngine {
  static analyzeExperimentalIR(spectrum?: ExperimentalSpectrumData): {
    findings: IRFunctionalGroupFinding[];
    structuralConstraints: StructuralConstraints;
    statusMessage: string;
  } {
    if (spectrum) spectrum = prepareIR(spectrum);
    if (!spectrum || spectrum.digitizationFailed || !spectrum.validation.isValid || spectrum.peaks.length === 0) {
      return {
        findings: [],
        structuralConstraints: {
          source: "IR",
          confidence: 0,
          evidence: [],
        },
        statusMessage: spectrum?.digitizationFailed
          ? "IR 分析無法可靠完成（圖片數位化失敗，未擷取到有效峰值）。"
          : "IR 資料不足或未提供，無法執行 IR 官能基篩選。",
      };
    }

    const peaks = spectrum.peaks.filter(
      (p) =>
        (!p.role || p.role === "ANALYTE") &&
        (!p.signalRole || p.signalRole === "ANALYTE") &&
        p.userClassification !== "SOLVENT" &&
        p.userClassification !== "NOISE" &&
        p.userClassification !== "IMPURITY" &&
        p.classificationTag !== "SOLVENT" &&
        p.classificationTag !== "NOISE" &&
        p.classificationTag !== "IMPURITY" &&
        !p.isSolventVerified
    );
    const findings: IRFunctionalGroupFinding[] = [];

    // Pre-scan key multi-peak diagnostic regions to prevent OH/NH and Carbonyl misattribution
    const hasBroadOH = peaks.some(
      (p) =>
        p.x >= 3200 &&
        p.x <= 3580 &&
        (Boolean(p.isBroad) ||
          p.shape === "broad" ||
          p.shape === "BROAD" ||
          (p.width || 25) >= 55 ||
          Boolean(p.assignment?.toLowerCase().includes("broad")) ||
          Boolean(p.assignment?.includes("寬")))
    );
    const hasCarboxylicBroadOH = peaks.some(
      (p) =>
        p.x >= 2500 &&
        p.x <= 3300 &&
        (Boolean(p.isBroad) ||
          p.shape === "broad" ||
          p.shape === "BROAD" ||
          (p.width || 25) >= 65 ||
          Boolean(p.assignment?.toLowerCase().includes("broad")) ||
          Boolean(p.assignment?.includes("寬")))
    );
    const hasStrongCO = peaks.some((p) => p.x >= 1020 && p.x <= 1295 && p.y >= 45);
    const hasAmideICarbonyl = peaks.some((p) => p.x >= 1630 && p.x <= 1695 && p.y >= 55);
    const hasEsterCarbonyl = peaks.some((p) => p.x >= 1715 && p.x <= 1775 && p.y >= 55);
    const hasAldehydeFermi = peaks.some((p) => p.x >= 2700 && p.x <= 2850 && p.y >= 15);

    for (const rule of IR_SPECTROSCOPIC_RULES) {
      const candidates = peaks.filter((p) => {
        const effectiveY =
          p.irIntensity === "strong" || p.irIntensity === "STRONG"
            ? Math.max(p.y, 85)
            : p.irIntensity === "medium" || p.irIntensity === "MEDIUM"
            ? Math.max(p.y, 55)
            : p.irIntensity === "weak" || p.irIntensity === "WEAK"
            ? Math.min(p.y, 35)
            : p.y;
        return p.x >= rule.minCm && p.x <= rule.maxCm && effectiveY >= rule.minIntensity;
      });
      if (candidates.length === 0) continue;

      const primary = candidates.reduce((best, cur) => (cur.y > best.y ? cur : best), candidates[0]);
      const isPeakBroad =
        Boolean(primary.isBroad) ||
        primary.shape === "broad" ||
        primary.shape === "BROAD" ||
        (primary.width || 25) >= 55 ||
        Boolean(primary.assignment?.toLowerCase().includes("broad")) ||
        Boolean(primary.assignment?.includes("寬"));

      if (rule.expectedShape === "broad" && !isPeakBroad) {
        continue;
      }
      if (
        (rule.id === "terminal-alkyne-sp-ch" || rule.id === "free-hydroxyl-oh") &&
        isPeakBroad
      ) {
        continue;
      }
      // Critical Phase 3 Anti-Bias Rule: Do NOT misattribute a broad O-H band (3200-3550 cm-1) to Amine N-H!
      if (rule.id === "primary-secondary-amine-nh" && isPeakBroad && hasStrongCO && !hasAmideICarbonyl) {
        continue;
      }
      // Do not trigger intramolecular chelated OH if there is no carbonyl/chelated band in 1615-1680 cm-1
      if (
        rule.id === "intramolecular-chelated-oh" &&
        !peaks.some((p) => p.x >= 1615 && p.x <= 1680 && p.y >= 45)
      ) {
        continue;
      }
      // Do not duplicate aliphatic-alcohol-ether-co if alcohol-phenol-oh already captured the OH + C-O pair
      if (rule.id === "aliphatic-alcohol-ether-co" && hasBroadOH) {
        continue;
      }

      let confidence = Math.min(80, Math.round(48 + primary.y * 0.28));
      const companionObserved: string[] = [];
      let missingCriticalCompanion = false;

      if (rule.companionChecks && rule.companionChecks.length > 0) {
        for (const comp of rule.companionChecks) {
          const foundComp = peaks.find((p) => p.x >= comp.minCm && p.x <= comp.maxCm && p.y >= 15);
          if (foundComp) {
            confidence += comp.bonusConfidence;
            companionObserved.push(
              `觀測到協同峰：${comp.label} 於 ${foundComp.x.toFixed(0)} cm⁻¹ (${foundComp.y.toFixed(0)}%)`
            );
          } else if (irRangeCovered(spectrum, comp.minCm, comp.maxCm)) {
            confidence -= Math.min(10, comp.penaltyIfMissing);
            if (comp.penaltyIfMissing >= 20) {
              missingCriticalCompanion = true;
            }
          }
        }
      }

      // Multi-peak cross-checking for Carbonyl & OH/NH subtypes
      if (rule.family === "Ester") {
        if (hasAldehydeFermi && primary.x < 1715) continue;
        if (hasCarboxylicBroadOH && primary.x <= 1725) {
          confidence -= 15;
        }
      }
      if (rule.family === "Ketone") {
        if (hasAldehydeFermi) {
          confidence -= 18;
        }
        // If C=O is > 1718 cm-1 and strong C-O is present at 1150-1290 cm-1, Ester is a stronger explanation than Ketone
        if (primary.x >= 1718 && hasStrongCO) {
          confidence -= 14;
        }
        // If Carboxylic broad OH is present at 2500-3300 cm-1, Carboxylic acid is stronger than Ketone
        if (hasCarboxylicBroadOH) {
          confidence -= 16;
        }
      }
      if (rule.family === "Amine") {
        // Check if NH2 doublet (two peaks in 3300-3500 cm-1 separated by >= 45 cm-1) is present
        const nhPeaks = peaks.filter((p) => p.x >= 3300 && p.x <= 3500 && p.y >= 18);
        const hasNh2Doublet =
          nhPeaks.length >= 2 &&
          Math.abs(nhPeaks[0].x - nhPeaks[nhPeaks.length - 1].x) >= 40;
        if (hasNh2Doublet) {
          confidence += 8;
          companionObserved.push("觀測到 3300–3500 cm⁻¹ 一級胺 ν_as/ν_s(NH₂) 對稱/非對稱雙峰特徵");
        } else if (isPeakBroad) {
          confidence -= 20;
        }
      }
      if (rule.family === "Ether") {
        // If Ester C=O or Phenol OH is present, a 1230-1275 cm-1 C-O band may belong to Ester/Phenol rather than an isolated Ether
        if (hasEsterCarbonyl) {
          confidence -= 12;
        }
      }
      // Critical Phase 3 Anti-Bias Rule: Heteroaromatic IR band (1570-1595 cm-1) is Level 2/3 competing hypothesis ONLY, never high-confidence
      if (rule.family === "Heteroaromatic") {
        confidence = Math.min(56, confidence);
      }
      // Fingerprint halide (500-800 cm-1) overlaps heavily with aromatic OOP; cap confidence unless corroborated
      if (rule.family === "C-Br / C-Cl") {
        confidence = Math.min(58, confidence);
      }

      if (confidence < 40 || (missingCriticalCompanion && confidence < 52)) {
        continue;
      }

      confidence = Math.min(90, Math.max(42, confidence));
      const matchLevel: "Strong" | "Moderate" | "Weak" =
        confidence >= 78 ? "Strong" : confidence >= 60 ? "Moderate" : "Weak";

      const region =
        primary.x >= 1500
          ? "官能基區 (4000–1500 cm⁻¹)"
          : "指紋區 (1500–400 cm⁻¹)";

      const widthDesc = `${
        isPeakBroad ? "寬峰" : primary.shape === "medium" ? "中等峰寬" : "尖峰"
      } (半高寬 ~${primary.width || (isPeakBroad ? 85 : 24)} cm⁻¹, 相對強度 ${primary.y.toFixed(0)}%)`;

      const reasoningParts = [
        `[Level 1 觀測 → ${rule.inferenceLevel}] 於 ${primary.x.toFixed(0)} cm⁻¹ 偵測到吸收帶 [${widthDesc}]，符合 ${rule.expectedRangeLabel}。`,
      ];
      if (companionObserved.length > 0) {
        reasoningParts.push(`多峰協同驗證：${companionObserved.join("；")}。`);
      } else if (rule.companionChecks?.length) {
        reasoningParts.push("已執行伴隨吸收帶檢核，避免單一孤立吸收峰造成誤判。");
      }
      if (rule.alternativeExplanations.length > 0) {
        reasoningParts.push(`競爭/替代解釋：${rule.alternativeExplanations.join("；")}。`);
      }

      const competingHypotheses: CompetingHypothesisRecord[] =
        rule.alternativeExplanations.map((alt) => ({
          hypothesis: alt,
          level: rule.inferenceLevel,
          plausibility: confidence >= 78 ? "LOW" : "MODERATE",
          supportingConditions: [`波數區間於 ${primary.x.toFixed(0)} cm⁻¹ 存在重疊可能`],
          contradictingConditions:
            companionObserved.length > 0
              ? [`目前已觀測到 ${companionObserved.length} 項協同吸收峰支持主假設`]
              : [],
          requiredOrthogonalVerification:
            "需結合 ¹H/¹³C NMR 化學位移、積分及 MS 分子式/同位素正交驗證",
        }));

      findings.push({
        id: `ir-find-${rule.id}-${Math.round(primary.x)}`,
        functionalGroup: rule.functionalGroup,
        family: rule.family,
        observedPeak: Number(primary.x.toFixed(1)),
        observedWidthAndShape: widthDesc,
        expectedRange: rule.expectedRangeLabel,
        region,
        assignment: rule.assignment,
        companionPeaksObserved: companionObserved,
        matchLevel,
        modelType: "EMPIRICAL",
        confidence,
        reasoning: reasoningParts.join(" "),
        inferenceLevel: rule.inferenceLevel,
        alternativeExplanations: rule.alternativeExplanations,
        competingHypotheses,
        electronicAndHBondEffects: rule.electronicAndHBondEffects,
        evidence: {
          id: `ev-ir-${rule.id}`,
          tag: "[Empirical]",
          modelType: "EMPIRICAL",
          sourceType: "Empirical Chemical Rule",
          certaintyCategory: "Estimated",
          source: "Internal empirical model（SpecReader 振動模式與多峰協同經驗篩選模型）",
          reference: rule.referenceInfo,
          relevantInformation: `${rule.functionalGroup}：實驗觀測值 ${primary.x.toFixed(0)} cm⁻¹ vs 經驗區間 ${rule.expectedRangeLabel}`,
          confidence,
        },
      });
    }

    const sortedFindings = findings.sort((a, b) => b.confidence - a.confidence);
    const structuralConstraints = this.buildStructuralConstraints(spectrum, sortedFindings);

    return {
      findings: sortedFindings,
      structuralConstraints,
      statusMessage:
        sortedFindings.length > 0
          ? `已完成 IR 振動模式與多峰協同分析（共辨識 ${sortedFindings.length} 項特徵；涵蓋共軛、氫鍵、誘導效應與替代解釋評估，非量子 DFT 計算）。`
          : "IR 圖譜中未篩選出高可信度之典型官能基組合。",
    };
  }

  static buildStructuralConstraints(
    spectrum?: ExperimentalSpectrumData,
    precomputedFindings?: IRFunctionalGroupFinding[]
  ): StructuralConstraints {
    if (spectrum) spectrum = prepareIR(spectrum);
    if (!spectrum || spectrum.digitizationFailed || spectrum.peaks.length === 0) {
      return { source: "IR", confidence: 0, evidence: [] };
    }

    const findings =
      precomputedFindings !== undefined
        ? precomputedFindings
        : this.analyzeExperimentalIR(spectrum).findings;

    const requiredFunctionalGroups: FunctionalGroupConstraint[] = [];
    const excludedFunctionalGroups: FunctionalGroupConstraint[] = [];
    const evidence: EvidenceReference[] = [];

    for (const f of findings) {
      // Never allow a fingerprint-only or Heteroaromatic IR finding to become REQUIRED
      const isFingerprintOrNonExclusive =
        f.family === "Heteroaromatic" ||
        f.family === "C-Br / C-Cl" ||
        f.inferenceLevel === "LEVEL_2_LOCAL_CHEMICAL_ENVIRONMENT";

      const status: FunctionalGroupConstraint["status"] = isFingerprintOrNonExclusive
        ? "CANDIDATE"
        : f.confidence >= 76
          ? "REQUIRED"
          : f.confidence >= 60
            ? "PROBABLE"
            : "CANDIDATE";

      requiredFunctionalGroups.push({
        groupFamily: f.family,
        label: f.functionalGroup,
        status,
        observedSignal: `${f.observedPeak} cm⁻¹ (${f.observedWidthAndShape})`,
        expectedRange: f.expectedRange,
        sourceModality: "IR",
        confidence: f.confidence,
        reasoning: f.reasoning,
      });

      evidence.push({
        modality: "IR",
        observation: `IR peak = ${f.observedPeak} cm⁻¹ (${f.observedWidthAndShape})`,
        interpretation: `${f.functionalGroup} (${f.assignment})`,
        constraintSummary:
          status === "REQUIRED"
            ? `must contain or be compatible with ${f.family}`
            : `candidate functional group ${f.family}`,
        modelType: "EMPIRICAL",
        confidence: f.confidence,
        signalPosition: f.observedPeak,
        unit: "cm⁻¹",
      });
    }

    const peaks = spectrum.peaks.filter((p) => !p.role || p.role === "ANALYTE");
    const hasCarbonylBand = peaks.some(
      (p) =>
        p.x >= 1615 &&
        p.x <= 1850 &&
        (p.y >= 30 || p.irIntensity === "strong" || p.irIntensity === "STRONG" || p.irIntensity === "medium" || p.irIntensity === "MEDIUM")
    );
    const hasOhNhBand = peaks.some(
      (p) =>
        p.x >= 3180 &&
        p.x <= 3670 &&
        (p.y >= 20 || p.isBroad || p.shape === "broad" || p.shape === "BROAD")
    );
    const hasCarboxylicBroadBand = peaks.some(
      (p) =>
        p.x >= 2500 &&
        p.x <= 3300 &&
        (p.isBroad || p.shape === "broad" || p.shape === "BROAD" || (p.width || 0) >= 65)
    );
    const hasTripleBondBand = peaks.some((p) => p.x >= 2100 && p.x <= 2300 && p.y >= 18);

    if (!hasCarbonylBand && irRangeCovered(spectrum, 1615, 1850) && peaks.length >= 2) {
      excludedFunctionalGroups.push({
        groupFamily: "Carbonyl",
        label: "羰基 C=O (1615–1850 cm⁻¹ 無顯著吸收，排除醛/酮/酯/羧酸/醯胺/酸酐/醯氯)",
        status: "EXCLUDED",
        observedSignal: "1615–1850 cm⁻¹ 區間無顯著吸收峰",
        expectedRange: "1615–1850 cm⁻¹",
        sourceModality: "IR",
        confidence: 85,
      });
      evidence.push({
        modality: "IR",
        observation: "No significant IR peak in 1615–1850 cm⁻¹",
        interpretation: "Absence of strong C=O stretching band (Negative IR Evidence)",
        constraintSummary:
          "exclude unconjugated/conjugated carbonyl functional groups (Aldehyde, Ketone, Ester, Carboxylic acid, Amide)",
        modelType: "EMPIRICAL",
        confidence: 85,
      });
    }

    if (!hasOhNhBand && !hasCarboxylicBroadBand && irRangeCovered(spectrum, 2500, 3670) && peaks.length >= 2) {
      excludedFunctionalGroups.push({
        groupFamily: "O-H / N-H",
        label: "游離或氫鍵 O-H / N-H (2500–3670 cm⁻¹ 無寬帶或 N-H 伸縮，排除醇/酚/羧酸/一二級胺；惟三級胺無 N-H 不在此限)",
        status: "EXCLUDED",
        observedSignal: "3180–3670 cm⁻¹ 區間無顯著吸收峰",
        expectedRange: "3180–3670 cm⁻¹",
        sourceModality: "IR",
        confidence: 82,
      });
      excludedFunctionalGroups.push({
        groupFamily: "Alcohol",
        label: "排除醇或酚羥基 Alcohol / Phenol (-OH)",
        status: "EXCLUDED",
        observedSignal: "3200–3670 cm⁻¹ 無 O-H 伸縮帶",
        expectedRange: "3200–3670 cm⁻¹",
        sourceModality: "IR",
        confidence: 84,
      });
      excludedFunctionalGroups.push({
        groupFamily: "Carboxylic acid",
        label: "排除羧酸 Carboxylic acid (-COOH)",
        status: "EXCLUDED",
        observedSignal: "2500–3300 cm⁻¹ 無寬強二聚體 O-H 伸縮帶",
        expectedRange: "2500–3300 cm⁻¹",
        sourceModality: "IR",
        confidence: 86,
      });
      evidence.push({
        modality: "IR",
        observation: "No broad O-H or sharp N-H stretching band in 3180–3670 cm⁻¹",
        interpretation: "Absence of free or hydrogen-bonded O-H / primary-secondary N-H groups (Negative IR Evidence)",
        constraintSummary: "exclude Alcohol, Phenol, Carboxylic Acid, and Primary/Secondary Amine",
        modelType: "EMPIRICAL",
        confidence: 82,
      });
    }

    if (!hasTripleBondBand && irRangeCovered(spectrum, 2100, 2300) && peaks.length >= 2) {
      excludedFunctionalGroups.push({
        groupFamily: "Nitrile / Alkyne",
        label: "參鍵 C≡N / 末端 C≡C (2100–2300 cm⁻¹ 無吸收峰，排除腈與極性炔)",
        status: "EXCLUDED",
        observedSignal: "2100–2300 cm⁻¹ 區間無吸收峰",
        expectedRange: "2100–2300 cm⁻¹",
        sourceModality: "IR",
        confidence: 80,
      });
    }

    const carbonylFindings = findings.filter((f) =>
      ["Aldehyde", "Ketone", "Ester", "Carboxylic acid", "Amide", "Anhydride", "Acyl chloride"].includes(f.family)
    );
    const allowedSubtypes = carbonylFindings
      .map((f) => f.family)
      .filter((fam): fam is "Aldehyde" | "Ketone" | "Ester" | "Carboxylic acid" | "Amide" =>
        ["Aldehyde", "Ketone", "Ester", "Carboxylic acid", "Amide"].includes(fam)
      );

    // Prefer genuine Aromatic finding over low-confidence Heteroaromatic
    const aromaticFinding =
      findings.find((f) => f.family === "Aromatic") ||
      findings.find((f) => f.family === "Heteroaromatic");
    const hasParaOop = peaks.some((p) => p.x >= 800 && p.x <= 860 && p.y >= 25);
    const hasOrthoOop =
      !hasParaOop &&
      peaks.some((p) => p.x >= 735 && p.x <= 775 && p.y >= 30) &&
      !peaks.some((p) => p.x >= 685 && p.x <= 715 && p.y >= 22);
    const hasMetaOop =
      !hasParaOop &&
      peaks.some((p) => p.x >= 750 && p.x <= 810 && p.y >= 25) &&
      peaks.some((p) => p.x >= 680 && p.x <= 712 && p.y >= 20) &&
      peaks.some((p) => p.x >= 865 && p.x <= 905 && p.y >= 15);
    const hasMonoOop =
      !hasParaOop &&
      !hasMetaOop &&
      peaks.some((p) => p.x >= 730 && p.x <= 775 && p.y >= 25) &&
      peaks.some((p) => p.x >= 685 && p.x <= 715 && p.y >= 20);

    const topConf =
      findings.length > 0 ? Math.max(...findings.map((f) => f.confidence)) : 50;

    return {
      source: "IR",
      requiredFunctionalGroups,
      excludedFunctionalGroups,
      aromaticity: aromaticFinding
        ? {
            status: aromaticFinding.confidence >= 72 ? "PRESENT" : "POSSIBLE",
            substitutionPatternHint: hasParaOop
              ? "1,4-para"
              : hasMonoOop
                ? "monosubstituted"
                : hasMetaOop
                  ? "1,3-meta"
                  : hasOrthoOop
                    ? "1,2-ortho"
                    : "unknown",
            supportingSignals: [`${aromaticFinding.observedPeak} cm⁻¹ (${aromaticFinding.functionalGroup})`],
            confidence: aromaticFinding.confidence,
          }
        : undefined,
      carbonyl:
        carbonylFindings.length > 0
          ? {
              status: "PRESENT",
              allowedSubtypes:
                allowedSubtypes.length > 0
                  ? allowedSubtypes
                  : ["Aldehyde", "Ketone", "Ester", "Carboxylic acid", "Amide"],
              supportingSignals: carbonylFindings.map(
                (cf) => `${cf.observedPeak} cm⁻¹ (${cf.functionalGroup})`
              ),
              confidence: Math.max(...carbonylFindings.map((c) => c.confidence)),
            }
          : !hasCarbonylBand && peaks.length >= 2
          ? {
              status: "ABSENT",
              allowedSubtypes: [],
              excludedSubtypes: ["Aldehyde", "Ketone", "Ester", "Carboxylic acid", "Amide"],
              supportingSignals: ["1615–1850 cm⁻¹ 無顯著吸收峰"],
              confidence: 85,
            }
          : undefined,
      dbe: {
        minDbe: (aromaticFinding ? 4 : 0) + (carbonylFindings.length > 0 ? 1 : 0),
        allowsAromaticRing: Boolean(aromaticFinding) || peaks.some((p) => p.x >= 3000 && p.x <= 3100),
        allowsCarbonylOrUnsaturation: carbonylFindings.length > 0 || Boolean(aromaticFinding),
        confidence: topConf,
      },
      confidence: topConf,
      evidence,
    };
  }

  /**
   * Mode B: 依據使用者輸入分子結構之實際化學圖、官能基、共軛、誘導效應、環張力與分子內/分子間氫鍵，預測 IR 振動光譜與科學解釋
   */
  static predictIRFromStructure(structure: ParsedChemicalStructure): {
    spectrum: ExperimentalSpectrumData;
    predictions: IRFunctionalGroupFinding[];
  } {
    const peaks: SpectralPeak[] = [];
    const predictions: IRFunctionalGroupFinding[] = [];
    const groups = structure.detectedFunctionalGroups.join(" ").toLowerCase();
    const smiles = structure.smiles || "";
    const graphFeatures = graphChemicalFeatures(smiles);
    const parsedGraph = smiles ? StructureParserAdapter.parseSmilesGraph(smiles).graph : null;

    const addBand = (
      x: number,
      y: number,
      width: number,
      shape: "sharp" | "broad" | "medium",
      functionalGroup: string,
      family: string,
      expectedRange: string,
      assignment: string,
      confidence: number,
      effectsNote?: string
    ) => {
      if (peaks.some((pk) => Math.abs(pk.x - x) <= 4 && pk.shape === shape)) {
        return;
      }
      peaks.push({
        id: `pred-ir-${Math.round(x)}-${peaks.length + 1}`,
        x,
        y,
        width,
        shape,
        isPredictedPeak: true,
        predictedRange: [Math.round(x - Math.max(12, width * 0.6)), Math.round(x + Math.max(12, width * 0.6))],
        assignment: `[經驗振動模型預測] ${assignment}`,
      });
      predictions.push({
        id: `pred-ir-fg-${Math.round(x)}-${predictions.length + 1}`,
        functionalGroup,
        family,
        observedPeak: x,
        observedWidthAndShape: `${shape === "broad" ? "寬帶" : shape === "medium" ? "中等峰寬" : "尖峰"} 經驗模擬 (半高寬 ${width} cm⁻¹)`,
        expectedRange,
        region: x >= 1500 ? "官能基區 (4000–1500 cm⁻¹)" : "指紋區 (1500–400 cm⁻¹)",
        assignment,
        companionPeaksObserved: [
          effectsNote || "由分子圖局部鍵結環境、共軛、誘導與氫鍵位移規則推算（非量子化學 DFT Hessian 計算）",
        ],
        matchLevel: confidence >= 80 ? "Strong" : "Moderate",
        modelType: "EMPIRICAL",
        confidence,
        inferenceLevel: "LEVEL_3_FUNCTIONAL_GROUP_HYPOTHESIS",
        electronicAndHBondEffects: effectsNote ? [effectsNote] : undefined,
        reasoning: `[經驗式預測] 根據 ${structure.name || structure.molecularFormula} 之化學環境與振動偶極矩變化推算吸收位置。${effectsNote ? ` (${effectsNote})` : ""}`,
        evidence: {
          id: `ev-pred-ir-${Math.round(x)}`,
          tag: "[Empirical]",
          modelType: "EMPIRICAL",
          sourceType: "Empirical Chemical Rule",
          certaintyCategory: "Estimated",
          source: "Internal empirical model (IR 振動頻率與結構效應加成模型)",
          reference: "Silverstein / Pretsch / Socrates 特徵官能基頻率與共軛/氫鍵/環張力位移規則（非 DFT Hessian）",
          relevantInformation: `經驗預測 ${assignment} 約於 ${x} cm⁻¹ (預期範圍 ${expectedRange})`,
          confidence,
        },
      });
    };

    const integrity = structure.structureIntegrity;
    if (!structure.isFormulaOnly && smiles && integrity?.hasVerifiableConnectivity !== false) {
      const hasAromatic=graphFeatures.aromatic;
      const isPyridineLike=graphFeatures.heteroaromatic;
      const topo=parsedGraph?.ringSubstitutionTopology||integrity?.ringSubstitutionTopology||"";
      const isPara=topo==="PARA_DISUBSTITUTED"||topo==="1,4-para";
      const isOrtho=topo==="1,2-ortho";
      const isMeta=topo==="1,3-meta";
      const isMono=topo==="MONO_SUBSTITUTED"||topo==="monosubstituted";
      const hasCarboxylicAcid=graphFeatures.acid;
      const hasPhenolicOH=graphFeatures.phenol;
      const hasAliphaticOH=graphFeatures.alcohol;
      const hasIntramolecularChelatedOH=hasPhenolicOH&&isOrtho&&graphFeatures.carbonylCount>0;

      if (hasAromatic) {
        addBand(
          3068,
          24,
          24,
          "sharp",
          "芳香族 sp² C-H 伸縮",
          "Aromatic",
          "3010–3100 cm⁻¹",
          "sp² 芳香環 ν(=C-H) 伸縮振動",
          83,
          "sp² 碳 33% s 成分提高 C-H 力常數 (>3000 cm⁻¹)"
        );
        addBand(
          isPyridineLike ? 1584 : 1601,
          78,
          20,
          "sharp",
          isPyridineLike ? "含氮雜芳環 C=C/C=N 骨架伸縮 I" : "芳香環 C=C 骨架伸縮 I",
          isPyridineLike ? "Heteroaromatic" : "Aromatic",
          isPyridineLike ? "1575–1595 cm⁻¹" : "1585–1615 cm⁻¹",
          "芳香環共軛骨架面內伸縮振動",
          86
        );
        addBand(
          isPyridineLike ? 1472 : 1508,
          68,
          20,
          "sharp",
          isPyridineLike ? "含氮雜芳環 C=C/C=N 骨架伸縮 II" : "芳香環 C=C 骨架伸縮 II",
          isPyridineLike ? "Heteroaromatic" : "Aromatic",
          isPyridineLike ? "1430–1485 cm⁻¹" : "1485–1525 cm⁻¹",
          "芳香環面內骨架伸縮振動",
          84
        );
        addBand(
          isPara ? 832 : isOrtho ? 754 : isMeta ? 782 : isMono ? 750 : 785,
          70,
          22,
          "sharp",
          isPara
            ? "1,4-對二取代芳環 C-H 面外彎曲 (OOP, 2 相鄰 H)"
            : isOrtho
              ? "1,2-鄰二取代芳環 C-H 面外彎曲 (OOP, 4 相鄰 H)"
              : isMeta
                ? "1,3-間二取代芳環 C-H 面外彎曲 (OOP, 3 相鄰 H)"
                : isMono
                  ? "單取代苯環 C-H 面外彎曲 (OOP, 5 相鄰 H)"
                  : "芳香環 C-H 面外彎曲 (OOP)",
          "Aromatic",
          isPara
            ? "800–860 cm⁻¹"
            : isOrtho
              ? "735–770 cm⁻¹"
              : isMeta
                ? "750–810 & 680–710 cm⁻¹"
                : isMono
                  ? "730–770 & 690–715 cm⁻¹"
                  : "680–860 cm⁻¹",
          "芳香環相鄰 C-H 同相面外彎曲振動 (γ C-H OOP)",
          isPara || isMono || isOrtho || isMeta ? 84 : 72
        );
        if (isMono || isMeta) {
          addBand(
            698,
            56,
            20,
            "sharp",
            "芳香環面外環折疊彎曲 (Ring Puckering OOP)",
            "Aromatic",
            "685–715 cm⁻¹",
            "單取代/間位取代苯環面外環變形振動",
            80
          );
        }
      }

      // Alcohols & Phenols (-OH)
      if (hasIntramolecularChelatedOH) {
        addBand(
          3120,
          58,
          120,
          "broad",
          "分子內螯合氫鍵酚羥基 O-H 伸縮",
          "Alcohol",
          "2700–3220 cm⁻¹",
          "鄰位 O-H···O=C 六元環分子內氫鍵 ν(O-H) 寬帶",
          85,
          "分子內六元環螯合氫鍵使酚 O-H 顯著紅移並展寬"
        );
        addBand(
          1245,
          76,
          26,
          "sharp",
          "酚基 Ar-O 伸縮振動",
          "Alcohol",
          "1200–1265 cm⁻¹",
          "sp² 芳碳-氧 ν(Ar-O) 伸縮與 O-H 彎曲耦合",
          84
        );
      } else if (hasPhenolicOH) {
        addBand(
          3345,
          68,
          95,
          "broad",
          "酚羥基分子間氫鍵 O-H 寬伸縮帶",
          "Alcohol",
          "3200–3550 cm⁻¹",
          "分子間氫鍵酚羥基 ν(O-H) 寬伸縮振動",
          87,
          "分子間氫鍵降低 O-H 力常數並因氫鍵簇分布展寬；稀溶液中另可見 ~3610 cm⁻¹ 游離態峰"
        );
        addBand(
          1232,
          80,
          26,
          "sharp",
          "酚基 C-O 伸縮振動",
          "Alcohol",
          "1200–1265 cm⁻¹",
          "酚氧孤對與苯環共振強化之 ν(Ar-O) 伸縮振動",
          85,
          "孤對電子離域使 Ar-O 具部分雙鍵性質，波數高於一般脂肪醇 (1050–1150 cm⁻¹)"
        );
        addBand(
          1368,
          48,
          24,
          "medium",
          "酚 O-H 面內彎曲振動 δ(O-H)",
          "Alcohol",
          "1330–1420 cm⁻¹",
          "酚羥基 O-H 面內彎曲振動",
          79
        );
      } else if (hasAliphaticOH) {
        const isTertiaryOH = graphFeatures.tertiaryAlcohol;
        const isSecondaryOH = graphFeatures.secondaryAlcohol;
        const coFreq = isTertiaryOH ? 1158 : isSecondaryOH ? 1105 : 1055;
        const coLabel = isTertiaryOH
          ? "三級醇 C-O 伸縮 (1130–1200 cm⁻¹)"
          : isSecondaryOH
            ? "二級醇 C-O 伸縮 (1085–1125 cm⁻¹)"
            : "一級醇 C-O 伸縮 (1030–1075 cm⁻¹)";
        addBand(
          3358,
          66,
          92,
          "broad",
          "脂肪醇分子間氫鍵 O-H 寬伸縮帶",
          "Alcohol",
          "3200–3550 cm⁻¹",
          "脂肪醇分子間氫鍵 ν(O-H) 寬伸縮振動",
          86,
          "分子間 O-H···O 氫鍵紅移與多聚體展寬效應"
        );
        addBand(
          coFreq,
          76,
          26,
          "sharp",
          coLabel,
          "Alcohol",
          isTertiaryOH ? "1130–1200 cm⁻¹" : isSecondaryOH ? "1085–1125 cm⁻¹" : "1030–1075 cm⁻¹",
          "脂肪醇 sp³ ν(C-O) 伸縮振動",
          84,
          "α-碳取代度影響 C-C-O 耦合頻率：一級醇 (~1055) < 二級醇 (~1105) < 三級醇 (~1158 cm⁻¹)"
        );
      }

      if (graphFeatures.aldehyde) {
        const isConj = graphFeatures.conjugatedCarbonyl;
        addBand(
          isConj ? 1698 : 1726,
          98,
          24,
          "sharp",
          "醛基 C=O 伸縮",
          "Aldehyde",
          isConj ? "1685–1710 cm⁻¹ (共軛紅移)" : "1720–1740 cm⁻¹ (飽和醛)",
          "醛基羰基 ν(C=O) 伸縮振動",
          88,
          isConj ? "芳環/烯鍵共軛使 π 電子離域，降低 C=O 力常數紅移約 28 cm⁻¹" : "飽和脂肪醛標準 C=O 伸縮"
        );
        addBand(2828, 34, 22, "sharp", "醛基 C-H Fermi 共振帶 I", "Aldehyde", "2800–2860 cm⁻¹", "醛基 ν(C-H) 與 2δ(CHO) Fermi 共振雙峰 I", 82);
        addBand(2732, 30, 22, "sharp", "醛基 C-H Fermi 共振帶 II", "Aldehyde", "2700–2760 cm⁻¹", "醛基 ν(C-H) 與 2δ(CHO) Fermi 共振雙峰 II", 82);
      }

      if (graphFeatures.ester) {
        const isPhenolicOrVinylEster = graphFeatures.aromaticEsterO;
        const isArylConjugatedEster = !isPhenolicOrVinylEster && graphFeatures.conjugatedCarbonyl;
        const esterCoWave = hasIntramolecularChelatedOH
          ? 1682
          : isPhenolicOrVinylEster
            ? 1762
            : isArylConjugatedEster
              ? 1718
              : 1742;
        const esterRange = hasIntramolecularChelatedOH
          ? "1675–1695 cm⁻¹ (鄰羥基分子內氫鍵共軛芳酯)"
          : isPhenolicOrVinylEster
            ? "1755–1775 cm⁻¹ (酚酯/乙烯酯藍移)"
            : isArylConjugatedEster
              ? "1715–1730 cm⁻¹ (芳基共軛酯紅移)"
              : "1735–1750 cm⁻¹ (飽和脂肪酯)";
        addBand(
          esterCoWave,
          96,
          24,
          "sharp",
          "酯基 C=O 伸縮",
          "Ester",
          esterRange,
          "酯基羰基 ν(C=O) 伸縮振動",
          88,
          isPhenolicOrVinylEster
            ? "酚氧孤對與苯環共振，削弱對羰基之 +M 推電子效應，使 C=O 藍移至 ~1762 cm⁻¹"
            : isArylConjugatedEster
              ? "苯甲醯基與羰基共軛使 C=O 紅移至 ~1718 cm⁻¹"
              : "烷氧基 -I 誘導效應使飽和酯 C=O 位於 ~1742 cm⁻¹"
        );
        addBand(1268, 90, 28, "sharp", "酯基 C(=O)-O 非對稱伸縮", "Ester", "1180–1300 cm⁻¹", "酯鍵 C(=O)-O 強非對稱伸縮振動", 86);
        addBand(1108, 64, 26, "medium", "酯基 O-C-C 對稱伸縮", "Ester", "1030–1150 cm⁻¹", "烷氧基 O-C 伸縮振動", 81);
      }

      if (graphFeatures.ketone) {
        const isConj = graphFeatures.conjugatedCarbonyl;
        const isFiveMemberedCyclicKetone = matchesSMARTS(smiles,"[CX3;r5](=O)") === true;
        const ketoneWave = hasIntramolecularChelatedOH
          ? 1645
          : isFiveMemberedCyclicKetone
            ? 1745
            : isConj
              ? 1686
              : 1715;
        addBand(
          ketoneWave,
          96,
          24,
          "sharp",
          "酮基 C=O 伸縮",
          "Ketone",
          isFiveMemberedCyclicKetone
            ? "1740–1755 cm⁻¹ (五元環張力酮)"
            : isConj
              ? "1675–1700 cm⁻¹ (共軛紅移)"
              : "1705–1725 cm⁻¹ (脂肪酮)",
          "酮基羰基 ν(C=O) 伸縮振動",
          87,
          isFiveMemberedCyclicKetone
            ? "五元環內角張力增加 C=O 外環鍵 s 成分，力常數上升藍移至 ~1745 cm⁻¹"
            : isConj
              ? "芳環共軛降低 C=O 雙鍵成分，紅移至 ~1686 cm⁻¹"
              : "標準開鏈/六元環酮 C=O 伸縮"
        );
      }

      if (hasCarboxylicAcid) {
        const isConjAcid = hasAromatic;
        addBand(
          2965,
          64,
          170,
          "broad",
          "羧酸二聚體強氫鍵 O-H 超寬伸縮帶",
          "Carboxylic acid",
          "2500–3300 cm⁻¹",
          "羧酸八元環二聚體強氫鍵 ν(O-H) 超寬伸縮帶",
          88,
          "強分子間二聚體氫鍵大幅削弱 O-H 力常數並跨越 C-H 區展寬"
        );
        addBand(
          isConjAcid ? 1692 : 1712,
          98,
          26,
          "sharp",
          "羧酸 C=O 伸縮",
          "Carboxylic acid",
          isConjAcid ? "1680–1705 cm⁻¹ (芳香共軛羧酸)" : "1705–1725 cm⁻¹ (脂肪族羧酸)",
          "羧酸二聚體羰基 ν(C=O) 伸縮振動",
          88
        );
        addBand(1252, 66, 28, "medium", "羧酸 C-O 伸縮", "Carboxylic acid", "1210–1320 cm⁻¹", "羧酸 ν(C-O) 伸縮振動", 81);
        addBand(932, 46, 28, "broad", "羧酸二聚體 O-H 面外彎曲", "Carboxylic acid", "900–960 cm⁻¹", "羧酸二聚體 γ(O-H) 面外彎曲", 78);
      }

      // Amides (Primary, Secondary, Tertiary)
      if (graphFeatures.amide) {
        const isTertiaryAmide = graphFeatures.tertiaryAmide;
        const isPrimaryAmide = graphFeatures.primaryAmide;
        if (!isTertiaryAmide) {
          if (isPrimaryAmide) {
            addBand(3368, 58, 28, "medium", "一級醯胺非對稱 N-H 伸縮", "Amide", "3330–3420 cm⁻¹", "一級醯胺 ν_as(NH₂) 伸縮振動", 84);
            addBand(3192, 54, 28, "medium", "一級醯胺對稱 N-H 伸縮", "Amide", "3160–3240 cm⁻¹", "一級醯胺 ν_s(NH₂) 伸縮振動", 84);
          } else {
            addBand(3312, 56, 30, "medium", "二級醯胺 N-H 伸縮", "Amide", "3250–3360 cm⁻¹", "二級醯胺反式締合 ν(N-H) 伸縮振動", 85);
          }
          addBand(1542, 72, 24, "sharp", "醯胺 II 帶 (Amide II δ N-H + ν C-N)", "Amide", "1510–1570 cm⁻¹", "N-H 面內彎曲與 C-N 伸縮耦合振動", 85);
        }
        addBand(
          isTertiaryAmide ? 1648 : 1664,
          96,
          24,
          "sharp",
          "醯胺 I 帶 (Amide I C=O 伸縮)",
          "Amide",
          "1630–1690 cm⁻¹",
          "共振推電子紅移之醯胺 ν(C=O) 伸縮振動",
          89,
          isTertiaryAmide
            ? "三級醯胺具強 Amide I C=O 帶 (~1648 cm⁻¹)，但無 N-H 伸縮與無 Amide II 帶"
            : "氮孤對 +M 共振效應使醯胺 C=O 顯著紅移至 ~1664 cm⁻¹"
        );
      } else if (graphFeatures.amine) {
        const isPrimaryAmine = graphFeatures.primaryAmine;
        const isSecondaryAmine = graphFeatures.secondaryAmine;
        if (isPrimaryAmine) {
          addBand(3422, 48, 26, "sharp", "一級胺非對稱 N-H 伸縮", "Amine", "3400–3500 cm⁻¹", "一級胺 ν_as(NH₂) 伸縮振動", 83);
          addBand(3342, 46, 26, "sharp", "一級胺對稱 N-H 伸縮", "Amine", "3300–3400 cm⁻¹", "一級胺 ν_s(NH₂) 伸縮振動", 83);
          addBand(1618, 58, 24, "medium", "一級胺 NH₂ 剪式彎曲", "Amine", "1580–1650 cm⁻¹", "NH₂ 面內剪式變形 δ(NH₂)", 81);
        } else if (isSecondaryAmine) {
          addBand(3365, 36, 24, "sharp", "二級胺單峰 N-H 伸縮", "Amine", "3310–3450 cm⁻¹", "二級胺 ν(N-H) 單峰伸縮振動", 80);
        }
        addBand(
          hasAromatic ? 1285 : 1145,
          56,
          24,
          "sharp",
          hasAromatic ? "芳香胺 C-N 伸縮" : "脂肪胺 C-N 伸縮",
          "Amine",
          hasAromatic ? "1250–1360 cm⁻¹" : "1080–1220 cm⁻¹",
          "碳-氮單鍵 ν(C-N) 伸縮振動",
          80
        );
      }

      if (graphFeatures.nitrile) {
        const isConjNitrile = hasAromatic;
        addBand(
          isConjNitrile ? 2228 : 2252,
          72,
          16,
          "sharp",
          "腈基 C≡N 參鍵伸縮",
          "Nitrile",
          isConjNitrile ? "2215–2240 cm⁻¹ (共軛腈)" : "2240–2260 cm⁻¹ (脂肪族腈)",
          "腈基 ν(C≡N) 尖銳伸縮振動",
          88,
          isConjNitrile ? "與芳環共軛使 C≡N 頻率略紅移至 ~2228 cm⁻¹ 並增強偶極矩導數" : "脂肪族飽和腈 C≡N 伸縮"
        );
      }

      if (graphFeatures.nitro) {
        addBand(1524, 92, 22, "sharp", "硝基非對稱伸縮 ν_as(NO₂)", "Nitro", "1510–1560 cm⁻¹", "硝基非對稱強伸縮振動", 89);
        addBand(1348, 88, 22, "sharp", "硝基對稱伸縮 ν_s(NO₂)", "Nitro", "1330–1375 cm⁻¹", "硝基對稱強伸縮振動", 89);
      }

      if (groups.includes("醚基")) {
        addBand(1254, 88, 26, "sharp", "芳基/烷基醚非對稱 C-O-C 伸縮", "Ether", "1230–1275 cm⁻¹", "Ar-O-C 或 C-O-C 非對稱伸縮", 85);
        addBand(1032, 70, 24, "sharp", "醚基對稱 C-O-C 伸縮", "Ether", "1020–1060 cm⁻¹", "O-CH₃ / O-CH₂ 對稱伸縮", 82);
      }

      if (groups.includes("矽氧烷")) {
        addBand(2962, 54, 24, "sharp", "Si-CH₃ C-H 伸縮", "C-H", "2955–2970 cm⁻¹", "矽甲基 C-H 伸縮", 85);
        addBand(1261, 88, 18, "sharp", "Si-CH₃ 對稱傘狀變形", "Siloxane", "1255–1265 cm⁻¹", "Si-CH₃ 特徵尖峰變形", 89);
        addBand(1055, 100, 46, "broad", "Si-O-Si 主鏈非對稱伸縮", "Siloxane", "1020–1095 cm⁻¹", "矽氧烷 Si-O-Si 強寬帶", 90);
        addBand(802, 82, 24, "sharp", "Si-C 伸縮與 CH₃ 搖擺", "Siloxane", "785–815 cm⁻¹", "Si-(CH₃)₂ 搖擺伸縮", 86);
      }

      if ((structure.atomCounts.Br ?? 0)>0) {
        addBand(592, 54, 22, "sharp", "C-Br 伸縮振動", "C-Br", "500–680 cm⁻¹", "碳-溴鍵指紋區振動", 78);
      }
      if ((structure.atomCounts.Cl ?? 0)>0) {
        addBand(735, 56, 22, "sharp", "C-Cl 伸縮振動", "C-Cl", "650–800 cm⁻¹", "碳-氯鍵指紋區振動", 78);
      }

      if (!groups.includes("矽氧烷") && (structure.atomCounts.H || 0) > 4) {
        addBand(2935, 42, 28, "medium", "脂肪族 sp³ C-H 伸縮", "C-H", "2850–2970 cm⁻¹", "烷基 C-H 非對稱/對稱伸縮振動", 80);
        addBand(1456, 38, 22, "sharp", "脂肪族 CH₂/CH₃ 彎曲", "C-H", "1370–1470 cm⁻¹", "烷基 CH₂ 剪式 / CH₃ 傘狀變形振動", 78);
      }
    }

    const sortedPeaks = peaks.sort((a, b) => b.x - a.x);
    const points = SpectrumParser.synthesizeCurveFromPeaks("IR", sortedPeaks);
    const validation = DataValidator.validateSpectrum("IR", "SIMULATED", points, sortedPeaks, false);

    return {
      spectrum: {
        sourceType: "PREDICTED_SPECTRUM",
        modality: "IR",
        fileName: `${structure.molecularFormula}_Empirical_IR.jdx`,
        sourceFormat: "SIMULATED",
        dataOrigin: "EMPIRICAL_SIMULATION",
        modelType: "EMPIRICAL",
        isSimulated: true,
        xUnit: "波數 (cm⁻¹)",
        yUnit: "經驗式預測相對吸收強度 (%)",
        points,
        peaks: sortedPeaks,
        validation,
      },
      predictions,
    };
  }

  static predictEmpiricalIR(structure: ParsedChemicalStructure) {
    return this.predictIRFromStructure(structure);
  }
}

export { IRAnalysisEngine as IREngine };



