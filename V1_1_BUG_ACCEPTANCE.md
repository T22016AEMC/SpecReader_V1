# V1.1 整合修正逐項驗收（工程版本 1.1.2）

範圍：BUG-001～004、006～020，共19項。BUG編號為使用者追蹤號。以 `74e5158` 為基準，修復分支 `fix/v11-explicit-analysis-observation-inputs`；未重建專案，未修改 V0／EluSim。以下「已修復」只表示相應的程式邏輯與工程驗收，不代表實測解析準確度。

## 逐項結果

| BUG／狀態 | 根因與修改的實際檔案／函式 | 測試與實際結果 | 限制 |
|---|---|---|---|
| **001 已修復（約束偏好）** | `nmrEngine.ts` 的 1D 特定環型推論可進入結構約束；`observationSemantics.ts::softenNMRConstraints` 取消具名含氮環硬指定，保留局部競爭環境。`deterministicStructureGenerator.ts` 無質量／分子式時保留平衡 C/N/O 組成層；IR 低專一指紋帶降權，對 C–O／C–N 均適用。 | `observationWorkflow`：單一8.7ppm不強制含氮環；明確 C2H7N 可生成有效含氮圖，通過。保留 IR OH/NH 競爭測試，沒有要求含氧必勝。 | 經驗參數未經獨立統計校準，不能保證所有實測案例皆無偏。 |
| **002 已修復（資料與評分）** | `PeakObservationTable.tsx` 保存 δ、相對積分、multiplicity、J；`evidenceLedger.ts::scoreScientificEvidence` 全域配對使用位移不確定性、比例、多重性／J。¹³C積分只在 `quantitativeCarbonExperiment` 明確確認時作比例約束，一般不量化碳數。 | 積分等比例縮放不改分，改位移／多重性／J會改相容性；普通¹³C積分5→500不改分，無DEPT為Unknown；皆通過。 | 等價性／自旋仍為局部圖及一階近似；量測者須正確確認定量實驗條件。 |
| **003 已修復** | `generationStatus.ts` 分開userFormula／inferredFormulas；`chemistryEngine.ts::parseStructureInput` 不以已知 SMILES 的固定分子式覆寫圖解析；`candidateGenerator.ts::rankCandidates` 使用 hardCheck.computedFormula 並保留權威組成硬閘門。 | C2H6O候選逐一從其SMILES重算，皆與顯示及使用者輸入相同，通過；分子式單獨輸入不製造HRMS觀測。 | 目前圖解析／支援物種範圍仍有限，非通用鹽類／金屬化學。 |
| **004 已修復（核心來源）** | `graphAssemblyEngine.ts::assembleCandidates` 不再回傳固定參考骨架；`combinatorialAssembler.ts` 不再把生成圖改寫成已知庫名稱／SMILES／來源。`deNovoGraphSearch.ts::searchMolecularGraphs` 實際枚舉原子／鍵及環閉合並以RDKit驗證；保留明示的局部片段組裝來源。空白／無可支持組成的輸入不再任意生成。 | C2H6O／C2H7N圖有效性、正式管線De novo來源測試通過；空白或未確認MS組成回傳零完整候選並保留觀測。 | 中性C/N/O/F/Cl/Br最多9重原子；不是完整通用異構物枚舉。舊目錄資料尚未實體刪除，見020。 |
| **006 已修復** | `evidenceLedger.ts` 逐原始觀測核對已提供六模態；`candidateGenerator.ts` 支持／矛盾／未知原因改由同一帳本產生；`crossSpectrumValidator.ts` 矩陣及明細使用同一分數，新增INSUFFICIENT_DATA。組成／價態衝突先硬排除，未提供模態不加負分。 | 帳本重建總分、同峰去重、未輸入模態無假分、酸／酯候選結構碎片差異、組成硬限制測試通過。 | 相容分是模型內部評估，不是正確機率；MS缺電荷／前驅時只能列未知。 |
| **007 已修復** | `App.tsx` 移除四種通用標記模式UI；單一「標記圖譜」按鈕實際控制是否接受新標記；`SpectrumViewer` 保留選取／移動及刪除流程。 | 桌面觀測編輯測試確認舊IR Valley按鈕不存在，點圖／手動新增、修改、刪除入口保留。 | 座標校正仍是第2頁的獨立工具，並非化學峰型選擇。 |
| **008 已修復** | `PeakObservationTable.tsx` 建立後才選一般／尖銳／寬廣／肩峰／重疊吸收帶，寬峰保存起訖。`spectrumParser.ts::upsertSignalPeak` 在數值／圖片重建時保留既有欄位；`workbenchOrchestrator.ts::updatePeak` 合併原始觀測及修改，修正「改備註就清掉寬峰」根因。 | 真實瀏覽器填3100–3550再改備註，起訖仍保存；單元測試相同欄位連續更新通過。人工區間進IR模型／帳本測試通過。 | 未填完整起訖時顯示峰寬未知，不捏造FWHM。 |
| **009 已修復** | 同一觀測表對¹H提供空白積分／未知多重性／選填J與備註；¹³C提供空白積分與備註，不再逐峰選CHn。`spectrumParser.ts` 編輯走輕量 `measureSpectrumSignals`，取消自動填入積分及化學指認；欄位後續更新不遺失。 | 瀏覽器保存2.5積分、dd、7.2/1.4Hz及清空積分；¹³C保存9.5積分而無碳型下拉；通過。 | DEPT/APT為光譜層級可選條件，非預設單筆證據；不包含2D UI。 |
| **010 已修復** | `MassExperimentConditions.tsx` 將模式、離子化、電荷、加合、容差、前驅／活化／CE及量測備註存於msParams。`msEngine.ts` 未確認歸屬不枚舉中性式／不估中性MW；`ionMass.ts::confirmedNeutralMass` 處理確認條件。MS/MS無前驅／電荷時保留產品離子、電荷null、不算假中性損失。 | 未知101 m/z的中性MW為null且式候選空；缺前驅保留產品、不造損失；已知加合正逆計算與二價損失測試通過。 | 碎裂與ToF仍為有限特徵模型；條件未知無法可靠賦予完整離子結構。 |
| **011 部分修復** | `generationStatus.ts` 明示支援範圍；C15H16O2傳入後解析／DBE／質量正確，不把9重原子上限誤認成組成無效。 | C15H16O2有效、DBE=8、單同位素質量約228.11503Da；直接圖搜尋回UNSUPPORTED，最終診斷SEARCH_LIMIT，通過。 | **未擴充至17重原子的通用圖搜尋，C15H16O2仍可能零候選。** 不盲目放大枚舉或加入該分子式專用答案。 |
| **012 已修復** | `App.tsx` 用已執行快照的 `generationStatus.userFormula` 及來源欄位顯示狀態；零候選區改用實際診斷，取消一律要求補分子式。編輯輸入後舊結果明示過時。 | 瀏覽器C2H6O分析後改C15H16O2：不自動重算；再開始分析會收到已提供組成的搜尋界限，通過。 | 舊結果供參考時仍屬舊快照，需按分析更新。 |
| **013 已修復** | `generationStatus.ts::generationStatus` 區分未提供、格式錯誤、化學限制、SEARCH_LIMIT、指定範圍無匹配、EXECUTION_ERROR及成功；`analysisSession.ts` 處理Worker錯誤／45秒超時。 | 控制性狀態測試逐一核對各code與訊息通過；C15不顯示「分子式不合法」。 | 不是所有無結果都能判定唯一原因；達界限時不宣稱窮盡搜尋。 |
| **014 已修復** | `spectrumParser.ts` 移除30點啟動限制；`irSignalProcessing.ts` 少量標記獨立進入判讀，局部曲線特徵不足只為未知。`irRangeCovered` 需明確完整觀測狀態而非點數推定。 | 1／3個人工IR標峰及強度未知的單峰可提出位置假設，無假寬度；原圖校正及五點拖曳通過。 | 曲線峰寬／面積需足夠相鄰取樣，沒有可靠數值時不計算。 |
| **015 已修復** | `PeakObservationTable` 移除逐峰樣品／溶劑／雜質／雜訊下拉；`observationSemantics.ts::observationSpectrum` 把提供的觀測送入分析，不因舊自動分類刪除人工資料。 | 新表瀏覽器操作無分類問題；人工更新不呼叫分類引擎，測試通過。 | 不代表所有標記都必定來自分析物；後續判讀只提出競爭解釋。 |
| **016 已修復** | IR列僅觀測值、外觀、範圍、備註；官能基／水分／環境等在 `irBandKnowledge.ts` 分析階段提出，無逐峰預先污染物選擇。 | 不填化學歸屬即可完成IR標記／寬峰／分析，通過；人工峰不因常見污染區直接剔除。 | IR無法單獨證明污染來源或唯一結構。 |
| **017 已修復** | `App.tsx` 氘代溶劑存於整份圖譜；`nmrEngine.ts` 人工觀測接近溶劑位置仍保留；整合引擎與證據顯示不再把Unknown改為CDCl3。 | 手動7.26ppm／77.16ppm在CDCl3條件均保留；瀏覽器切換溶劑不刪列／不重分析，通過。 | 溶劑峰可與樣品重疊，保留不代表確認樣品歸屬。 |
| **018 已修復** | `observationCoverage` 預設PARTIAL_MARKERS；NMR軟化ABSENT／排除與DBE猜測，IR未標記區不作缺峰反證；最終排名／明細不再沿用舊缺失預期峰懲罰。 | 少量IR無excluded groups；交換性OH缺峰不形成硬失敗；帳本只核對提供觀測，通過。 | 未提供資訊不能補成完整峰表，強度未知也不製造量測值。 |
| **019 已修復** | `App.tsx::handleStartAnalysis` 取輸入快照；`analysisSession.ts` 建立一次Worker、重入鎖、逾時及錯誤處理；`modeA.worker.ts` 才呼叫完整管線。編輯／IR預覽／校正只保存資料與局部座標數值。舊結果key與目前輸入不同時提示重新分析。 | 瀏覽器監聽Worker：上傳／編輯／換頁=0；第一次開始=1；修改分子式仍1且過時；再開始=2。Worker RDKit可用；通過。 | Worker仍有資源上限，瀏覽器／WebAssembly需可用；不以失敗回傳假候選。 |
| **020 部分修復** | 移除正式App的測試物載入、固定測試入口與快速分子式測試；原 `src/data/referencePresets.ts`／`src/tests/scientificEngineTestSuite.ts` 移至 `tests/legacy/`，正式流程無引用；固定scaffold候選路徑已停用。保留必要單元／整合案例與通用科學知識。 | 必要回歸仍可執行；TEST SPEC四張圖逐檔SHA256與修改前相同，通過。 | 自動核准審查拒絕進一步刪除舊結構目錄／測試素材，因可能影響Mode B／解析，故保留舊目錄及legacy記錄；未宣稱實體清理全部完成。 |

## 工程檢查與失敗分類

- 型別檢查／正式Build／最終測試結果：發佈前更新於 `V1_1_DEPLOYMENT.md`。
- 新增 `tests/observationWorkflow.test.ts` 與兩個精簡桌面案例；使用少量受控數據與公式，不是實測準確率驗收。
- 保留原案例，修正舊測試不再適用的假設：等價SMILES使用canonical比較；完整掃描需明示coverage；已確認離子案例明示電荷與歸屬；1D訊號不直接確認吡啶，OH缺峰也不推算部分峰表的絕對氫數。沒有跳過／移除必要測試來製造通過。
- 本輪曾發生新增測試使用錯誤API名稱／選擇器，以及寬峰欄位更新遺失；前兩者屬測試整合錯誤，後者屬實際程式缺陷，均已修正並重測。舊測試語義變更與科學能力限制如上列示。
- TEST SPEC：`1H NMR TEST.png`、`13C NMR TEST.png`、`IR TEST.png`、`MS TEST.png`完整保留，沒有結構答案假設，也未將圖譜上傳公開儲存庫。

## 尚未交付的科學能力

大型通用De novo、完整MS/MS重排與碰撞能量模型、ToF基質／產率模型、高精度量子NMR、2D-NMR推論及實測準確率均未宣稱完成。此版交付的是可靠輸入、明確分析時機、可追溯證據與有界化學生成。
