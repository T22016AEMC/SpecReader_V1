# V1.1.3 六步驟交付紀錄（2026-10-16）

基準b5ca641；分支feat/v113-six-step-reasoning。保留原本候選生成、硬閘門、科學評分及桌面流程；新階段正式接入同一管線。沒有外部AI呼叫或固定完整化合物答案。下列測試是工程及受控化學邏輯驗證，不是實測準確率。

## 六步驟的實際傳遞

| 步驟 | 模組／輸入 → 輸出 → 下一步 | 可重現測試 |
|---|---|---|
|1|`reasoning/hypothesisGenerator.collectObservedEvidence`：原有已校正bundle → 真實峰ID、值、人工來源、條件、未知精度；未提供模態不補峰 → 假設生成|`sixStepReasoning` actual observed roots；六模態獨立回歸|
|2|`generateChemicalHypotheses`：觀測及IR／共用NMR環境 → 多個環境、比例／J、替代關係與根ID → 局部圖|relative equality and J；coupling hypotheses|
|3|`localStructureInference.inferLocalStructures`：假設 → 實際原子、鍵、開放端點、環取代位置、可能／未知關係 → 搜尋hints.localStructures|芳環六碳六鍵、對間鄰競爭、相同比例尺度、無假2D直接連接|
|4|`deNovoGraphSearch.searchMolecularGraphsAsync`：局部圖、軟環境、可選使用者組成／可靠質量 → 局部圖種子／端點接合／原子擴展、canonical圖與derivations → 既有生成器驗證|local atom/bond graphs；17-heavy-atom fragment joins；不同組成；取消保留有效圖|
|5|`DeterministicStructureGenerator`與原有硬Validator／`evidenceLedger.scoreScientificEvidence`：生成圖及所有已提供光譜 → 合法完整候選與支持／矛盾／未知帳本 → trace／畫面|six stages pass actual IDs；evidenceLedger、massScience、nmrJointEvidence、evidenceGuidedSearch|
|6|`reasoningTrace.completeReasoningTrace`、`ReasoningPanel`、`StructureRenderer2D`：同一批候選／組裝／帳本 → 完整RDKit圖、圖計算分子式、SMILES及證據|RDKit full graph／位置異構物；Chrome six-step-reasoning實際顯示與取消|

所有模組在`src/engines/`（元件在`src/components/`）；正式入口為`workers/modeA.worker.ts` → `reasoning/sixStepAnalysis.executeSixStepAnalysis`。只有App開始分析建立Worker；資料編輯不呼叫以上階段。同步Workbench入口保留給既有程式與測試，不構成另一套競爭引擎。

## BUG逐項結果

| BUG | 狀態／根因與實際修改位置 | 測試／限制 |
|---|---|---|
|002|已完成本輪局部推理：原本大多只有標籤／搜尋旗標；`hypothesisGenerator`、`localStructureInference`將位移、比例、多重性、共同J轉為可組裝圖與取代模式。一般13C積分保留而不算碳數。|新測試驗證J／比例變化、倍率不變、碳羰基局部圖；既有NMR帳本回歸。未求解強耦合、構象與唯一歸屬。|
|003|原本已取消猜式主流程，經驗證保留；`sixStepAnalysis`只傳plan.userFormula，完整候選式由圖計算。|spy確認不呼叫FormulaGenerator；無公式搜尋不同組成；指定公式候選相同組成。|
|004|已有真實圖文法，本輪補局部圖種子及端點接合；`deNovoGraphSearch`不讀固定化合物清單。|derivations可追溯local ID與實際join操作；沒有固定未知物答案。文法有界非通用完整枚舉。|
|006|原有逐峰Evidence Ledger及硬閘門已符合，保留並加入候選trace。組裝優先程度不作額外光譜加分。|既有ledger／質量／NMR對比；新測試根ID唯一及跨階段串接。經驗預測仍有限。|
|008|原本寬／窄、自動未知及人工覆寫已符合，保留。|`evidenceGuidedSearch`實測取樣形態工程測試、Chrome人工覆寫；未虛構手動峰寬。|
|010|原本光譜層級MS條件與單峰m/z／強度／備註已符合，保留。|massScience及Chrome三模態條件保存；未知離子不當中性質量。|
|011|部分完成：早已移除九原子硬拒絕，本輪局部圖接合改善正常規模搜尋。|C15H16O2 DBE8／17重原子、受控片段接合產生合法同式圖；不保證一般組成或真實未知物能找到完整候選。|
|013|已完成：既有結構化狀態加CANCELLED，保留局部圖及部分候選；generationStatus不把超時作不合法。|時間／狀態／unsupported／執行／未完整／取消的受控測試；Chrome取消狀態。|
|018|原本部分覆蓋／未知已符合，保留。觀測模型再明確區分PARTIAL／CONFIRMED_COMPLETE。|少量人工峰不建立缺峰陰性；未提供模態無帳本分數。|
|021|原本區間知識已符合，保留；新假設引用同一IR結果。|寬3240較支持OH；窄NH及加入羰基的相對變化；單峰不確認醯胺。|
|022|原本IR顯示已移除偽機率，保留。推理顯示實際支持理由及替代假設。|Chrome無「可信度N%」；來源及不確定性可檢視。內部分數非機率。|
|023|已完成：原Renderer含固定整體結構版型及R示意；以既有RDKit直接繪實際完整圖，保留元件介面及錯誤資訊。|不同位置／官能基SVG不同、實際重原子／鍵數、非法與wildcard完整圖拒絕；Chrome完整圖及公式。|
|024|已完成本輪工作流程：實查舊正式同步預算900ms；改Worker協作搜尋12秒／120000狀態／4096前沿／48輸出、真實進度、取消及部分保留。|async取消後結果仍合法；Chrome畫面可操作且可取消。仍是有限搜尋；驗證同步小批不保證即時取消。|

## 工程結果與限制

- 既有125項測試保留；本輪先整體132/132通過，再新增17重原子局部接合測試，目標檔8/8通過（合計133個不同案例）。TypeScript、Vite前端及esbuild後端通過。
- Chrome首次15項：13通過；2個IR驗收選到新摺疊區的同名隱藏文字。修正為定位可見證據，保留實際拖曳／縮放／校正／套用／重入／停用等斷言，重跑IR與MS條件3/3通過；15個不同案例均已取得通過。未刪除或跳過失敗測試。
- 無新增依賴。僅沿用已整合RDKit.js；第三方notice保持。TEST SPEC以原SHA保護，不讀取其未知答案。
- 未驗證真實未知分子的正確率；沒有高精度振動／NMR、完整MS重排、ToF-SIMS基質產率模型。無2D資料時局部連接及等價性是競爭假設。
- 支援有限中性C/N/O/F/Cl/Br、非稠合芳環／鏈／有限閉環。離子、稠合／雜芳環、立體等搜尋覆蓋仍不足。取消／預算截斷不表示不存在化學合理結構。
- 正式GitHub／Render SHA與公開驗收以交付時健康端點及部署紀錄為準；沒有把本機Build或Git推送當作已上線。
