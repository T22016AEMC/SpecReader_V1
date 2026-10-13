import { ModelType, TheoreticalModelMetadata } from "../types/spectrum";

export interface SpectrumModel {
  getMetadata(): TheoreticalModelMetadata;
}

export interface QuantumChemistryAdapter {
  readonly backendName: string;
  readonly isAvailable: boolean;
  getUnavailableReason(): string;
}

export class DefaultQuantumChemistryAdapter implements QuantumChemistryAdapter {
  readonly backendName = "External Quantum Chemistry & DFT/GIAO Engine (ORCA / Gaussian / Psi4 Adapter)";
  readonly isAvailable = false;

  getUnavailableReason(): string {
    return "目前執行環境未掛載外部量子化學計算叢集（DFT / Hessian 簡正模態分析 / GIAO 磁遮蔽張量計算不可用）。系統已自動切換至內建驗證之經驗式模型（Internal Empirical Model）與參考光譜模擬，絕不偽造量子化學計算數據。";
  }
}

export class IRModelAdapter implements SpectrumModel {
  private quantumAdapter = new DefaultQuantumChemistryAdapter();

  getMetadata(): TheoreticalModelMetadata {
    return {
      adapterId: "IRModelAdapter",
      modelName: "FT-IR 振動光譜模型介面 (IRModelAdapter)",
      modelType: this.quantumAdapter.isAvailable ? "THEORETICAL" : "EMPIRICAL",
      theoreticalBasis:
        "理想理論流程：Chemical Structure → 3D 分子幾何結構 → Geometry Optimization → Hessian 力常數矩陣 → Normal Mode Analysis (簡正模態分析) → 諧振/非諧振頻率與偶極矩微分強度。目前執行：內建快速官能基篩選與共軛經驗加成模型 (Fast Screening & Empirical Vibrational Model)。",
      inputRequirements: ["2D/3D 分子連接性 (SMILES / InChI)", "官能基子結構與共軛狀態"],
      outputDescription: "預測波數 (cm⁻¹)、相對吸收強度、峰寬與多峰協同指認",
      computationalStatus: this.quantumAdapter.isAvailable
        ? "AVAILABLE"
        : "UNAVAILABLE_FALLBACK_ACTIVE",
      activeExecutionMode: this.quantumAdapter.isAvailable
        ? "量子化學計算 (Quantum/DFT)"
        : "經驗式預測 (Internal Empirical Model)",
      limitations: [
        "未啟用 DFT Hessian 計算時，指紋區 (1500–400 cm⁻¹) 骨架耦合振動僅提供代表性經驗峰。",
        "固態 KBr 壓片、ATR 晶體折射率與溶劑氫鍵效應可能導致實驗峰位偏移 ±15–30 cm⁻¹。",
      ],
    };
  }
}

export class ProtonNMRModelAdapter implements SpectrumModel {
  private quantumAdapter = new DefaultQuantumChemistryAdapter();

  getMetadata(): TheoreticalModelMetadata {
    return {
      adapterId: "ProtonNMRModelAdapter",
      modelName: "¹H NMR 化學位移與自旋耦合模型介面 (ProtonNMRModelAdapter)",
      modelType: this.quantumAdapter.isAvailable ? "THEORETICAL" : "EMPIRICAL",
      theoreticalBasis:
        "理想理論流程：Molecular Structure → 3D 構象搜尋 → Quantum GIAO (Gauge-Independent Atomic Orbital) 磁遮蔽張量計算 → TMS 參考轉換 δ (ppm) → 自旋耦合常數 J 與高階自旋系統模擬。目前執行：經驗化學位移加成規則與結構片段預測模型。",
      inputRequirements: ["分子結構式 (SMILES / InChI)", "對稱性與鄰近拉電子/推電子取代基"],
      outputDescription: "預測化學位移 δ (ppm)、理論積分比、多重峰型與耦合常數 J (Hz)",
      computationalStatus: this.quantumAdapter.isAvailable
        ? "AVAILABLE"
        : "UNAVAILABLE_FALLBACK_ACTIVE",
      activeExecutionMode: this.quantumAdapter.isAvailable
        ? "量子化學計算 (Quantum/DFT)"
        : "經驗式預測 (Internal Empirical Model)",
      limitations: [
        "未啟用量子 GIAO 計算時，無法精確預測三維空間環電流異向性與構象平均效應。",
        "活潑氫 (-OH, -NH, -COOH) 之化學位移與峰寬受溶劑、濃度、微量水分與溫度影響極大。",
        "實驗光譜若未提供原始積分面積或多重峰分裂，系統將忠實標示為「未知」，絕不以峰高捏造積分。",
      ],
    };
  }
}

export class Carbon13NMRModelAdapter implements SpectrumModel {
  private quantumAdapter = new DefaultQuantumChemistryAdapter();

  getMetadata(): TheoreticalModelMetadata {
    return {
      adapterId: "Carbon13NMRModelAdapter",
      modelName: "¹³C NMR 碳化學環境模型介面 (Carbon13NMRModelAdapter)",
      modelType: this.quantumAdapter.isAvailable ? "THEORETICAL" : "EMPIRICAL",
      theoreticalBasis:
        "理想理論流程：Structure → 3D 幾何最佳化 → GIAO ¹³C 等向性磁遮蔽計算 → 預測 ¹³C 化學位移 δ (ppm)。目前執行：HOSE-like 子結構環境與取代基加成經驗模型。",
      inputRequirements: ["分子結構連接性", "碳原子混成軌域 (sp³, sp², sp) 與雜原子鄰近效應"],
      outputDescription: "理論獨特碳環境數、預測 ¹³C 化學位移 δ (ppm) 與 DEPT (C / CH / CH₂ / CH₃) 類型",
      computationalStatus: this.quantumAdapter.isAvailable
        ? "AVAILABLE"
        : "UNAVAILABLE_FALLBACK_ACTIVE",
      activeExecutionMode: this.quantumAdapter.isAvailable
        ? "量子化學計算 (Quantum/DFT)"
        : "經驗式預測 (Internal Empirical Model)",
      limitations: [
        "觀察到的 ¹³C 訊號數不等於分子總碳數：受分子對稱性（等價碳）、訊號偶然重疊（Accidental Overlap）影響。",
        "四級碳（Quaternary Carbon, 如 C=O 或無氫芳香碳）因弛豫時間 T₁ 較長且無 NOE 增益，在實驗圖譜中訊號可能極弱或缺失。",
      ],
    };
  }
}

export class MSModelAdapter implements SpectrumModel {
  getMetadata(): TheoreticalModelMetadata {
    return {
      adapterId: "MSModelAdapter",
      modelName: "MS 精確質量、同位素與分子式推算模型 (MSModelAdapter)",
      modelType: "EMPIRICAL",
      theoreticalBasis:
        "IUPAC 單同位素精確質量 (Monoisotopic Exact Mass)、天然同位素豐度分佈 (¹³C, ³⁵Cl/³⁷Cl, ⁷⁹Br/⁸¹Br, ²⁸Si/²⁹Si/³⁰Si, ³²S/³⁴S)、氮規則 (Nitrogen Rule)、不飽和度 (DBE) 與離子化加合形式 ([M]+•, [M+H]+, [M-H]-, [M+Na]+, [M+NH4]+)。",
      inputRequirements: ["觀測 m/z 列表", "離子化模式與質量誤差容許範圍"],
      outputDescription: "候選分子式清單、質量誤差 (Da / ppm)、DBE、氮規則檢核與鹵素同位素吻合度",
      computationalStatus: "AVAILABLE",
      activeExecutionMode: "經驗式預測 (Internal Empirical Model)",
      limitations: [
        "若僅有整數名目質量 (Nominal Mass) 而無高解析精確質量 (HRMS)，同一個 m/z 可能對應多個等質量分子式 (Isobaric Formulas)，無法單憑 MS 唯一鎖定分子式。",
      ],
    };
  }
}

export class MSMSModelAdapter implements SpectrumModel {
  getMetadata(): TheoreticalModelMetadata {
    return {
      adapterId: "MSMSModelAdapter",
      modelName: "MS/MS 串聯質譜裂解路徑模型 (MSMSModelAdapter)",
      modelType: "EMPIRICAL",
      theoreticalBasis:
        "Precursor Ion (前驅離子) → 化學鍵斷裂 (α-Cleavage / Benzylic Cleavage / Inductive Cleavage / Retro-Diels-Alder) → 中性分子或自由基丟失 (Neutral Loss: H₂O, CO, CO₂, NH₃, CH₃•, C₂H₄, OCH₃•, OC₂H₅•) → Product Ion (子離子精確質量與結構相容性評估)。",
      inputRequirements: ["前驅離子 m/z", "子離子 m/z 列表", "碰撞能量 (CID eV)"],
      outputDescription: "候選裂解路徑、中性丟失指認、子離子化學式與候選結構相容性",
      computationalStatus: "AVAILABLE",
      activeExecutionMode: "經驗式預測 (Internal Empirical Model)",
      limitations: [
        "MS/MS 裂解路徑為候選推論而非必然結果；重排反應 (Rearrangement) 與碰撞能量差異會顯著改變子離子相對強度。",
      ],
    };
  }
}

export class ToFSIMSModelAdapter implements SpectrumModel {
  getMetadata(): TheoreticalModelMetadata {
    return {
      adapterId: "ToFSIMSModelAdapter",
      modelName: "ToF-SIMS 表面二次離子質譜條件依賴模型 (ToFSIMSModelAdapter)",
      modelType: "EMPIRICAL",
      theoreticalBasis:
        "考量極性 (Positive / Negative)、一次離子種類 (Bi₃⁺, Bi⁺, Cs⁺, C₆₀⁺, Arₙ⁺)、一次離子能量 (keV)、靜態/動態離子劑量 (Static vs Dynamic SIMS)、基底材料基質效應與表面組成之條件依賴經驗模型。",
      inputRequirements: ["極性", "一次離子源與能量 (keV)", "質量範圍", "基底材質", "表面分子結構"],
      outputDescription: "條件依賴之預期二次離子家族、準分子加合離子與指紋碎片相對可能性",
      computationalStatus: "AVAILABLE",
      activeExecutionMode: "經驗式預測 (Internal Empirical Model)",
      limitations: [
        "此為「條件依賴的經驗式預測」，並非完整二元碰撞近似 (BCA) 或分子動力學 (MD) 濺射物理模擬。",
        "表面基質效應 (Matrix Effect)、微量鹼金屬污染 (Na⁺, K⁺) 與表面帶電會強烈改變實際二次離子產率。",
      ],
    };
  }
}

export class TheoreticalModelRegistry {
  static readonly irAdapter = new IRModelAdapter();
  static readonly protonNmrAdapter = new ProtonNMRModelAdapter();
  static readonly carbon13NmrAdapter = new Carbon13NMRModelAdapter();
  static readonly msAdapter = new MSModelAdapter();
  static readonly msmsAdapter = new MSMSModelAdapter();
  static readonly tofSimsAdapter = new ToFSIMSModelAdapter();
  static readonly quantumAdapter = new DefaultQuantumChemistryAdapter();

  static getAllModelsMetadata(): TheoreticalModelMetadata[] {
    return [
      this.irAdapter.getMetadata(),
      this.protonNmrAdapter.getMetadata(),
      this.carbon13NmrAdapter.getMetadata(),
      this.msAdapter.getMetadata(),
      this.msmsAdapter.getMetadata(),
      this.tofSimsAdapter.getMetadata(),
    ];
  }

  static getAllModels(): (TheoreticalModelMetadata & {
    id: string;
    modelId: string;
    name: string;
    approximationLevel: string;
    status: string;
  })[] {
    return this.getAllModelsMetadata().map((m) => ({
      ...m,
      id: m.adapterId,
      modelId: m.adapterId,
      name: m.modelName,
      approximationLevel: m.activeExecutionMode,
      status:
        m.computationalStatus === "AVAILABLE" ? "ACTIVE" : "EMPIRICAL_FALLBACK",
    }));
  }

  static getModelTypeLabelZh(modelType: ModelType): string {
    switch (modelType) {
      case "EXPERIMENTAL":
        return "實驗量測資料 [Experimental]";
      case "REFERENCE":
        return "參考資料模擬 [Reference]";
      case "LITERATURE":
        return "文獻資料 [Literature]";
      case "THEORETICAL":
        return "理論量子計算 [Theoretical]";
      case "EMPIRICAL":
        return "內建快速經驗模型 [Empirical]";
      case "SIMULATED":
        return "程式模擬光譜 [Simulated]";
      case "AI_INFERENCE":
        return "Gemini AI 證據推理 [AI]";
    }
  }
}

