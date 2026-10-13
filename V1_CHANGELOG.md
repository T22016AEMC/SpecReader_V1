# V1 變更與 V0 比較

2026-10-13。以原 ZIP 解壓副本逐步修改；V0 SHA-256：`a9315297d71842d0e1111c9ad90f271c9f6b1bc300f9ccddd1e23cc1df5b312a`。未修改 V0 或其他 Render 服務。

|階段／模組|V0 問題與 V1 實作位置|改變與驗證|
|---|---|---|
|0 工程基準|`package.json`、`tsconfig.json`、`vitest.config.ts`、`playwright.config.ts`|保留原兩組 22 項測試；記錄原基準 14 通過／8 失敗。固定 TypeScript 5.8.3、啟用 strict，加入可重現命令；失敗測試未刪除或跳過|
|1 型別與執行|`candidateGenerator.ts`、`types/spectrum.ts`|修 ¹³C 排名 `hasEthoxyEster`／`hasAcetylPeak` 未定義；移除重複加分分支，保留圖環境評估；補齊實際輸出型別|
|1 分子圖|`rdkitAdapter.ts`、`chemistryEngine.ts`、`main.tsx`、`scripts/prepare-assets.mjs`|真正初始化 RDKit/WASM；canonical SMILES、價態與 SMARTS 執行，資源由同一網站供應；原解析器作環境分析，載入失敗明示限制|
|1／3 ¹H NMR|`nmrEngine.ts`、`chemicalHardConstraintValidator.ts`、`nmrFragmentEvidence.ts`|相對積分不再變成已確認 H 數；Unknown 溶劑不變成 CDCl₃；乙基／異丙基需跨訊號比例、多重性、位移與選填 J；不虛構 J 值；未觀測交換氫不固定扣分|
|2 IR 數值|`irSignalProcessing.ts`、`whittakerBaseline.ts`、`irEngine.ts`|尺度分明、合法 T 取 −log₁₀(T)、%T 先除 100；AsLS 帶狀求解、雜訊門檻、FWHM／相對強度；掃描範圍外及圖像不能作缺峰反證；保留經驗官能基規則與競爭解釋|
|3 ¹³C NMR|`nmrEngine.ts`、`spectralEvidenceExtractor.ts`|DEPT-90／135 與 APT 的限制分離，正相 DEPT-135 不唯一決定 CH／CH₃；不將約 160 ppm 自動定為羰基或含氮芳環硬限制|
|4 MS|`formulaEngine.ts`、`ionMass.ts`、`isotopeEnvelope.ts`、`massSpectrometryEngine.ts`、`msEngine.ts`|元素範圍內質量列舉、電荷／加合、真正實測 ppm、自然同位素卷積；分子式單獨輸入不產生假 HRMS 資料。列舉有明示上限，並非完整化學空間|
|4 MS/MS|`msmsFragmentationEngine.ts`、`graphFragmentation.ts`|同價電荷的中性損失換算；候選圖單鍵碎片與有限重排／損失相容，不能以同式分子給固定相同分数|
|4 ToF-SIMS|`tofSimsScientificEngine.ts`、`graphFragmentation.ts`|正／負表面離子分開，低質量碎片只弱支持環境；未推定 ESI、未模擬基質或離子產率|
|5 跨模態／排名|`evidenceLedger.ts`、`chemicalFeatureEngine.ts`、`crossSpectrumValidator.ts`、`candidateGenerator.ts`|正式排名使用同一帳本；原始觀測 ID、來源、替代解釋、範圍、同源群與權重可追溯。同一峰競爭假設不多次獨立加分，未測模態為 null，分子式硬限制不再假裝光譜加分|
|6 Mode B|`irEngine.ts`、`msEngine.ts`、`fragmentSpectrumPrediction.ts`、`predictionAndValidationFramework.ts`、`reasoningEngine.ts`|IR 官能基不以 SMILES regex 判定；去除 MS 固定 MW−15 與特定範例強度；六模態預測獨立且標示預測／示意權重；峰匹配一對一，可能碎片缺席不視為必然缺峰|
|6／8 輸入|`jcampAdapter.ts`、`spectrumParser.ts`、`scientificInputValidation.ts`|JCAMP 使用 MIT 固定版本解壓並保留單位／因素；CSV 不截斷 HRMS m/z；24 筆 NMR 標注仍保留；錯誤電荷／多加合不使其他模態失效|
|7 公開服務|`server.ts`、`render.yaml`、`pnpm-workspace.yaml`|PORT／0.0.0.0、正式靜態檔及 SPA、health、大小／頻率限制、逾時／受控 API 錯誤。沒有 Gemini Key 仍可數值分析與分子圖預測|
|8 驗證|`tests/`、`validation/`、`scripts/validate-measured-ir.mts`|六模態無式、63 種組合、十二個結構、圖一致性、質量／同位素、證據去重、API 與桌面 E2E；四份公開實測 IR 小樣本配對比較|

## 功能保留

原桌面版面、光譜 SVG／圖片、CSV／TXT／JCAMP／Excel、手動標峰與編輯、兩／三點校正、三頁 Mode A、結構輸入與 Mode B、候選及診斷、參考範例、PubChem 與選填外部 AI API 均保留。介面只補上既有 Mode B 選擇列中的 MS/MS／ToF-SIMS，以及科學相容度／預測限制文字，未重設計桌面佈局或新增手機適配。

## 仍未改成完整科學模型

保留的 IR／NMR 知識庫仍為經驗區間。候選生成仍由既有片段／結構庫與組合器提供有限集合，不是全部異構物；MS/MS／ToF 預測為圖碎片候選，不是經訓練的強度或碰撞能量模型。完整限制見 `V1_KNOWN_LIMITATIONS.md`。

公開依賴安全：原 SheetJS 0.18.5 的兩項 high 公告已改為官方固定 0.20.3；實際 xlsx 二進位回歸保留積分／多重性，更新後 production audit 公告 0 件。來源與授權見官方文件及 THIRD_PARTY_NOTICES.md。

PubChem 相容修正：server.ts 請求 SMILES／ConnectivitySMILES，保留立體資訊與舊 API 回傳欄位；MonoisotopicMass 與最可能同位素組成 ExactMass 分開。tests/api.test.ts 包含新欄位、含溴參考值與外部失效契約回歸。

發布審查補正：未知 IR 強度方向不能產生缺峰陰性證據；保留正向相對特徵假設。舊 MS 診斷的單鹵素同位素文字改為相容假設而非唯一確認，經驗片段來源標記 heuristic。最終相關回歸見 release-final-audit-results.json。
