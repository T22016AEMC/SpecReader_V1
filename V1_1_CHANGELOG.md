# SpecReader V1.1 實際變更

V1 基準：`e190a8d347fde24026f40c1b2cd8d5e92209ae04`。開發分支：`v1.1-scientific-core`；保留 `v1-baseline-e190a8d`。V0 原始 ZIP 未修改。

- `spectrumParser.ts`／`irImageTrace.ts`：IR 直接擷取原圖像素，略過 Gemini 峰值來源；保留原圖與像素曲線，人工波數校正後送入分析。CSV／JCAMP 仍直接處理數值。
- `irSignalProcessing.ts`／`irManualBaseline.ts`：預設幾何鏡像，保存原始尺度；五點非等距線性基線、端點常數延伸、保留負值。加入 FWHM、面積、相對面積、非對稱性、prominence、訊噪比。
- `SpectrumViewer.tsx`／`App.tsx`：原有圖形區新增方向、原始／向上／校正視圖、五點選取／拖曳／重設／套用及峰型提示。拖曳只更新局部預覽，套用才更新正式分析來源。既有版面與流程保留。
- `nmrReferenceDatabase.ts`：移除已知分子對通用 ¹H／¹³C 位移、多重性及 J 的特殊覆寫。參考資料不再改寫通用預測。
- `globalPeakAssignment.ts`／`evidenceLedger.ts`／`predictionAndValidationFramework.ts`：以全域一對一配對替換貪婪配對；H 位移、多重性、相對積分與可選 J 共同影響排名。交換性缺峰不作固定重大扣分。
- `deNovoGraphSearch.ts`／`deterministicStructureGenerator.ts`：在每次候選生成中加入原子與鍵的有界枚舉、鍵級增加及環閉合；RDKit MOL block 驗證與 canonical SMILES 去重。資料庫、舊片段組裝與 De novo 分別標示來源。
- `candidateGenerator.ts`／`graphAssemblyEngine.ts`：只有明確使用者分子式作此層的元素硬限制；推估分子式不是唯一權威答案。
- `evidenceLedger.ts`：IR 候選預測特徵直接比對實測峰位、寬度、形狀及相對幾何強度；訊噪比、面積、prominence、圖片品質與基線風險調整權重。完整有效掃描內缺少預期強羰基／三鍵區訊號只作弱反證，不適用 OH／NH。
- MS/MS 匹配改用使用者 ppm／Da 容差；保留既有精確質量、加合、電荷、候選圖碎片與獨立 ToF-SIMS 路徑。未加入完整碰撞能量或表面產率模型。
- 最後來源核對：IR 像素定位的初始波數範圍標記為待確認預設，不稱 AI 判讀；去重優先採 RDKit canonical SMILES，內建 WL signature 僅在 RDKit 不可用時降級使用。透射率峰表採幾何峰深而非取對數；透射率／圖片的強度只調整實測相對權重，不與預測吸光強度直接混合。
- 伺服器健康版本更新為 `1.1.0`；公開 IR AI 數位化端點回傳受控提示，前端採本地像素擷取。

本輪工程測試不代表科學準確度；沒有新增模擬準確率 Benchmark。
