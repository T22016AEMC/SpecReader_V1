# V1.1 科學資料流

七項平行選填來源保持不變；Mode A／B 共用分子圖與環境模型，不要求分子式。

Mode A：保存原始資料／編輯觀測與條件（不推論） → 使用者按「開始分析」 → 獨立Worker讀取快照 → 各模態特徵與競爭局部環境 → `ChemicalFeatureEngine` → 明示的片段組裝與 De novo 圖搜尋 → RDKit 有效性／canonical 去重 → 候選經驗預測對實測比較 → 單一 `evidenceLedger` 排名。資料庫命中、名稱、檔名不是證據。

IR：`irBandKnowledge.ts` 的資料列含振動模式、化學環境、區間／偏移不確定性、定性強度、峰型／寬度、肩峰可能性、伴隨峰、指紋區、混淆解釋、缺峰條件、相態／量測限制與來源。`inferIRBands` 產生競爭假設；`irCandidateBands` 以候選分子圖／SMARTS 選出適用模式；`irBandMatch` 比對區間、峰型、相對強度與其他原始峰的伴隨關係。最終每原始峰取候選最佳解釋一次，不累加同峰各個官能基假設。未掃描區不作陰性證據，圖片缺峰不作排除；IR 推測均為軟假設。

NMR：`nmrAtomicEnvironmentModel.ts` 為唯一通用圖環境預測入口；`nmrReferenceDatabase.ts` 僅相容匯出，核心不依完整分子答案庫。`atomicChemicalEnvironment.ts` 共用元素、鍵級、hybridization、芳香性、鄰原子、局部官能基、電子取代、共軛、氫鍵角色、小環、拓樸可能等價類、條件與不確定性。¹H／¹³C 人工訊號回推競爭環境，再進局部片段與候選比較。多重性、相對積分及 J 保留並參與全域訊號配對；未知溶劑維持 Unknown。未提供 DEPT/APT 不決定 CHn；交換性缺峰不作固定強反證。

共用模型仍為局部圖經驗參數：拓樸類不保證磁等價，構象／氫鍵／溫度只有有限表示及不確定性，未連接 DFT／GIAO。`NMRCorrelationConstraint` 預留 COSY／HSQC／HMBC／NOE 的訊號與原子指派、鍵距、信心／衝突；本輪沒有 2D UI 或假預測。

De novo 使用連通原子圖、價態剪枝、鍵級／環閉合、MOL block 與 RDKit 驗證。中性 C/N/O/F/Cl/Br，最多九重原子；每組成 2,500 states／80 ms，管線 450 ms／36 個輸出；不保證完整枚舉，較大或不支援組成明示範圍，仍呈現局部環境／其他來源。沒有把固定資料庫清單冒充 De novo。

MS 為精確質量／離子／組成約束，MS/MS 為候選單鍵斷裂與有限中性損失，ToF-SIMS 為獨立弱表面碎片相容性。七入口仍獨立；單獨 MS 類提醒尚不足可靠確定完整結構。

Mode B：候選分子圖 → 同一原子／振動環境模型 → 經驗範圍與可能碎片，標示預測及限制。排名是未校準相容度，非結構正確機率。實測證據、推論、預測、資料庫來源分開；品質低降權，缺少模態不扣分。


1.1.2觀測語義：`observationCoverage` 預設 PARTIAL_MARKERS，只有明確確認完整觀測才可評估缺峰。`observationSpectrum` 保留人工觀測，`softenNMRConstraints` 不以1D位移指定氮環或缺峰排除骨架。¹³C積分只有明確定量實驗旗標才參與比例評分。MS未確認歸屬不回填中性質量；MS/MS缺前驅／電荷不算中性損失。`generationStatus` 區分組成錯誤／不支援／搜尋限制／無匹配與執行失敗。

`analysisSession`／`modeA.worker` 是唯一UI完整Mode A分析入口；45秒任務超時、完成即終止Worker，編輯中不重啟。結果保存輸入key，與目前不同時標示過時。空UI由純資料工廠建立，不跑一次空白管線。IR預覽僅座標／基線運算；Parser編輯不再執行舊化學分類。
