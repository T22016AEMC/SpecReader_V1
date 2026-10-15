# V1.1.3 本輪11項逐項驗收

基準 `3a90a41`；修復分支 `fix/v11-evidence-guided-search`。下列完成度只指程式、受控邏輯與操作，不是未知實測準確度。

| BUG／完成度 | 確認的根因、檔案與主要函式 | 實際修改與測試結果 | 仍有限制 |
|---|---|---|---|
| **002 已修復基本約束** | `evidenceLedger.ts::scoreScientificEvidence` 原將部分積分除以候選全部氫；`chemicalHardConstraintValidator.ts::checkCandidateProtonConsistency` 原有相對比單元／部分積分總和對總H作通過或扣分。 | 改已配對局部積分比例＋位移／multiplicity／J全域匹配；未獨立校準則總H判定INCONCLUSIVE。`deNovoGraphSearch.ts::graphSearchHints` 使用芳香／羰基局部環境及q/t+約2:3+共同J；不把相對值轉總H。等比例縮放、錯比／錯J降相容、部分積分200不否定6H圖、普通13C積分不計碳數：通過。 | 一階、局部環境近似；不完整解重疊、強耦合／構象。 |
| **003 已修復架構** | `fragmentConstraintSolver.ts::solveConstraintSpace` 曾先執行FormulaGenerator；`deterministicStructureGenerator.ts::generateValidatedStructuresWithRejections` 曾只取前幾個猜測式並加入固定C2–C4清單。 | 正式路徑不呼叫分子式枚舉／已知完整骨架組裝；直接圖增長，使用者分子式唯一組成硬限制。偽造低信心locked C2H2不限制芳香NMR圖，生成不同組成候選；每候選圖重算式，皆通過。`App.tsx`頂部只顯示使用者指定式，各卡顯示自身式。 | 無總組成時僅代表性圖／局部假設，非已確認完整分子。 |
| **004 已核對並修正正式路徑** | 舊路徑雖有真圖枚舉，仍混用前置分子式／片段完整骨架組裝。 | `deNovoGraphSearch.ts::searchMolecularGraphs` 實際原子接合、鍵級增長、閉環、六碳芳環通用片段；價態／元素剪枝、WL類別縮減、RDKit淨化去重。候選方法標記De novo，無庫命中加分。非固定列表的組成測試及正式路徑來源／無枚舉spy通過。 | 有界圖文法，不是通用完整De novo；未支援帶電共振、稠環等完整空間。 |
| **006 已核對並補修基本比較** | 帳本本已核對六模態、使用同一權威總分，硬式閘門已存在；部分NMR積分分母仍有誤。 | 保留逐原始峰去重、模態獨立、支持／矛盾／未知及硬限制；修正局部比例。帳本重建、同峰重複不加分、候選特定碎片差異、異構物獨立候選池NMR區分、未測模態無分，通過。 | 結構特定IR/NMR為經驗預測；MS/MS無完整重排／CE模型，ToF為弱表面相容。 |
| **008 已修復** | `PeakObservationTable.tsx` 原五種選項、手填區間且以區間當FWHM。 | 只顯示寬／窄；`irSignalProcessing.ts::measureIRBandMorphology` 從真取樣與相同基線插值量FWHM，資訊不足UNRESOLVED。`irShapeSource`分AUTO／USER／UNKNOWN，人工覆寫不捏造寬度。窄Gaussian幾何量測、寬峰、無曲線未知、覆寫保存；Chrome自動窄→人工寬→跨頁保存：通過。 | 55 cm⁻¹為經驗分類界線，非跨儀器校準。未校正圖片可先未知。 |
| **010 原有輸入已符合，補修質量來源** | `MassExperimentConditions.tsx` 已在光譜層級保存模式／離子化／前驅／CE／表面備註；峰列只有m/z、相對強度、備註。`msEngine.ts`約束exactMass仍可能取枚舉首式的理論值。 | 保留UI及資料模型，exactMass改實測離子換算中性質量與z對應容差；`chemicalFeatureEngine.ts`傳遞可靠前驅質量。已確認2價[M+H]輸入實算100Da、不確認則null；三種MS的欄位保存與不自動分析Chrome操作，通過。 | 母離子候選仍需實驗確認；無已知加合／電荷不能當中性質量。 |
| **011 部分完成，實際擴充** | 舊searchMolecularGraphs直接拒絕>9重原子。 | 改化學預算與證據優先的增量beam圖搜尋，無低重原子產品門檻。C15H16O2→DBE8、17重原子；通用芳環／原子接合生成多個RDKit有效、組成相同的完整圖，非該式特製結構。30碳不再立即UNSUPPORTED，可回資源界限。通過。 | 不能保證任意正常小分子皆在900ms中取得完整候選；瀏覽器含IR限制的C15案例可為TIME_BUDGET，正確保留組成／局部證據。不是所有異構物已搜尋。 |
| **013 已修復狀態傳遞** | 舊流程空陣列加字串判斷，大小常被當搜尋不支援。 | `generationStatus.ts::generationStatus`接收真正searchResult：INPUT_MISSING、格式／中性化學限制、工具／文法不支援、TIME／STATE、BEAM未完整、硬衝突、指定文法無匹配、局部／部分候選、執行錯誤。Worker結果傳至同一畫面。受控預算及錯誤狀態測試通過；C15 UI不稱化學無效。 | 前沿限制為固定狀態容量，而非精確量測瀏覽器heap；搜尋未完整不聲稱無解。 |
| **018 已核對並補修NMR路徑** | 主IR帳本已有CONFIRMED_COMPLETE保護，但NMR總積分語意仍可能影射未標記訊號缺失。 | 未校準相對積分不比較全分子總H。普通人工IR／NMR只有正面觀測；未提供模態null、未標記IR區無coverage扣分。每原始峰一個帳本項、單峰／少量峰與部分積分測試通過。 | 只有明確完整數值IR資料才可作有限弱陰性；不存在假定完整人工峰表。 |
| **021 已修復常見軟規則** | `irBandKnowledge.ts`二級胺及醯胺NH原variable峰形，對3240寬峰支持過高。 | 通常窄NH／寬氫鍵OH作軟比較，保留例外；醯胺NH強支持另需1630–1695伴隨羰基。3240.87寬峰較支持OH、不是強支持醯胺；窄NH增支持、加入CO改支持，通過。 | 氫鍵、相態、重疊可改變峰形，單IR不能唯一指定官能基。 |
| **022 已修復顯示語意** | `App.tsx`把經驗匹配confidence顯成百分比，包含預設70%。 | 移除IR／綜合官能基的可信度%，改較支持／可能／證據不足及實測峰型、相對強度、已標記伴隨與未確認條件；IR模型仍可保留內部相容分，但非機率。Chrome確認沒有「可信度N%」，有未確認證據文字，通過。 | 無校準機率模型，候選分數亦僅內部相容度。 |

## 可重現檢查

- `node node_modules/typescript/bin/tsc --noEmit`。
- `node node_modules/vitest/vitest.mjs run --maxWorkers=1`：最終整體回歸125/125，16個檔案全數通過。
- `pnpm run build`：Vite前端與esbuild後端通過，保留既有大chunk／RDKit瀏覽器externalization警告，未停用型別。
- Chrome14項案例已逐項取得通過：第一次12通過2失敗；修正過時驗收假設後重跑含失敗項的11項全過。基線實際mouse拖五點／縮放／套用／往返、資料變更不自動分析、六模態獨立、Mode B、MS欄位及IR寬窄覆寫皆有操作證據。
- 初始失敗如實記錄：舊測試仍要求30C直接不支援、相對比證明總H、固定目錄物必在搜尋第一名；已改為資源狀態、局部證據及獨立候選池排序的可驗證斷言，沒有刪除／skip測試，也未為固定分子加規則。新增Gaussian測試補明確零基線後驗算FWHM。
- TEST SPEC四圖僅作SHA256完整性核對，沒有更動或拿來設定答案。

部署與最後專項結果記錄在 V1_1_DEPLOYMENT.md。本文件不宣稱盲測、Top-1或實測科學準確率。
