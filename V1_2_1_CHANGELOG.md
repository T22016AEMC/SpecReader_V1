# V1.2.1（草稿，階段 1：A 類——分子式搜尋範圍）

基準 `1.2.0`（`d23c70e`）。**版本號未改**：`appVersion`／`package.json` 維持 `1.2.0`（階段 3 才改）。本檔是階段 1 的變更紀錄草稿。
只含工程測試的 pass／fail，不含任何準確度宣稱；測試只用自造的合成資料（`tests/fixtures/v121/`）；沒有使用 `benchmark\` 的任何檔案。
所有新常數都是**未校準的工程預設**，只依五個合成形狀的步數與耗時決定，沒有依任何實測化合物調整。

## 1. 旗標

`V12_CONFIG.useV121Planning`，預設 **true**。A 類只有在下列三者同時成立時才生效（`composition/planningGate.ts`）：

- `useV121Planning`
- `useV12Constraints`（false 時維持 1.1.8 行為與黃金檔）
- `useExhaustiveEnumerator`（false 時維持 1.1.7-hotfix.2 行為與黃金檔）

`useV121Planning = false`：輸出（假設清單、搜尋清單、各 run、候選、排名、評分帳本與**面板文字**）與 1.2.0 的黃金檔 `tests/goldens/v12.v120.pipeline.json` 相同（`tests/v12/v121FlagGolden.test.ts`；步數計數器 `visited`／`leaves`／`duplicatesMerged` 與面板句「葉端檢查：N 個葉」允許微小差異，見 §6）。
使用者自填分子式的路徑、MS 路徑的分子式搜尋、`useV12Constraints = false` 的路徑都不套用兩輪搜尋；A1（S 規則）另外也套用在 MS 路徑的分子式列舉。

## 2. 功能

| 項 | 內容 | 位置 |
|---|---|---|
| A1 | 沒有 S 專屬證據（既有 `hasEvidence('S')`＝MS 同位素）就不列含 S 分子式（h1-only、無質量、MS 三條路徑）。面板：`未考慮 S（沒有 S 專屬證據；組成層白名單不含 S）` | `composition/inferComposition.ts` |
| A2 | `oxygenEvidenceFloor`：寬 O–H→1；強 C=O 或強 C–O→1；兩者並有→2；酸酐型（成對強 C=O＋強 C–O）→3；僅由範圍比對（irFindings）產生的 SOFT 特徵不計入；「強」沿用 `strongIrBands()`／`irStrongRelativeIntensity` | `composition/functionalGroupBounds.ts` |
| A2 | h1-only 列舉下限 `mins` 只用 HARD（SOFT 的上限仍用於 O 的上界，列表上端不縮小）；O 超過下限＋1 起逐級扣 `weights.oxygenExcess`（0.5，未校準），只扣分不剔除；MS 路徑的 O 規則不變 | `inferComposition.ts`、`compositionScoring.ts`、`compositionConfig.ts` |
| A3 | `planFormulaSearch`：O 在 [下限, 下限＋1]；每個 (k, C 數) 鍵至多 2 個 O 變體；k=1、2、3 輪流取「通過 ¹H 可行性」的最佳分子式；其餘留在 200 清單內並標原因 | `composition/searchPlanning.ts`、`structureGenerator.ts` |
| A4 | 第 1 輪：只跑無烯基讀法、每分子式步數上限、**不退回彈性原子路徑、不做舊 beam 補充**；沒有可用讀法→`ROUND1_NO_TEMPLATE_READING`（visited＝0）；烯基例外；第 2 輪：各 k 第 1 輪後最高分者各一個（最多 3 個）跑烯基讀法，剩餘預算平分。誠實性：`VINYL_READINGS_NOT_RUN`、`ROUND1_STEP_CAP`；`run.complete` 只有所有讀法都完成才為 true；候選出處標籤加 `round` | `enumeration/exhaustiveGenerator.ts`（`generatePlanned`）、`structureGenerator.ts`（`plannedSearch`、`mergeRounds`） |
| A5 | `h1Feasibility`：存在不含烯基的讀法（或烯基例外）、片段組合能放進分子式（`buildProblem`）、並以 64 步探測確認搜尋空間不是一開始就空；只用 ¹H 積分比、位移類別、多重性與分子式；k=1／2／3 一視同仁；不可行者標「未搜尋（¹H 清單不可行：原因）」。**不宣稱提高正確分子式的名次** | `composition/searchPlanning.ts` |
| 面板 | 輪次徽章（第一輪（芳香模板）／第一輪（烯基例外）／第二輪（含烯基）／未搜尋）、未搜尋原因分類與筆數、O 下限推導說明（來源 IR 帶）、S 說明、固定限制句 | `compositionPanelModel.ts`、`CompositionPanel.tsx` |

## 3. 新常數（`V12_CONFIG.planning`、`COMPOSITION_CONFIG`；全部未校準）

| 常數 | 值 | 說明 |
|---|---|---|
| `planning.maxOxygenVariantsPerKey` | 2 | k=1：每個 (k, C) 鍵保留的 O 變體 |
| `planning.maxOxygenVariantsPerKeyMultiple` | 3 | k≥2：每個鍵保留的 O 變體（階段 1b） |
| `planning.oxygenAllowedAboveFloor` | 1 | O 視窗上緣＝k × 下限 ＋ 此值（階段 1b；階段 1 是 下限＋此值） |
| `planning.maxRound1Formulas` | 12（階段 1：18） | 第 1 輪搜尋的分子式數 |
| `planning.round1MaxStatesPerFormula` | 150 000（階段 1：50 000） | 第 1 輪每個分子式的步數上限 |
| `planning.round1TimeFraction` | 0.4 | 第 1 輪合計最多用牆鐘預算的比例（牆鐘仍是最後安全閥） |
| `planning.maxRound2Formulas` | 3 | 第 2 輪（烯基讀法）的分子式數上限，各 k 一個 |
| `planning.round2EvidenceWeight` / `round2EvidenceCandidates` | 0.5 / 200 | 第 2 輪選擇的「第 1 輪證據」：1/(1＋候選的拓樸 ¹H 環境數與觀測訊號數的最小差) × 權重 |
| `weights.oxygenExcess` | 0.5 | O 超過下限＋1 每多一個的扣分 |
| `oxygenFloor.*` | 1650–1800、1000–1300、1800–1870、1740–1790 cm⁻¹ | 讀取 O 下限的 IR 視窗 |

## 4. 與指令不同或指令沒寫明、由實測決定的地方（請規劃者確認）

1. **範圍比對的 SOFT 特徵不再扣分（`ignoreRangeMatchedSoftBounds`）。** 指令寫「SOFT 只留作扣分」。實測：保留 `softBoundViolation`（1.5）時，IR 範圍比對的假特徵（例如 1612 cm⁻¹ 被當醯胺 I、3030／2965 cm⁻¹ 被當羧酸 O–H、1658 cm⁻¹ 被當芳環）讓 G1（C9H12O）與 G3（C5H8O2）的目標分子式掉出 200 清單，因此不可能被搜尋。改為：無質量路徑上，單一模態（只有 IR 範圍比對）的特徵不再扣分，只在理由欄位註明；兩種模態共同支持的 HARD 特徵照舊扣分。
2. **同分排序**：分子式分數相同時，原本用 `formula.localeCompare`（字串序，`C10` 排在 `C4` 前）；A 類改為依 C、H、其他元素個數由小到大（`planningActive()` 時才套用）。
3. **O 變體鍵**照指令字面用 (k, C 數)，不含 H 數。
4. **烯基例外**以訊號層級定義：該分子式沒有任何不含烯基的讀法，**且**有訊號只能由烯基類別解釋（例如 5.84 ppm 在芳香窗之外）。沒有這種訊號、只是元素不夠放芳香環模板的分子式，由 A5 判為不可行（不搜尋），不跑烯基讀法。
5. A5 的可行性判斷在 `ROUND1_NO_TEMPLATE_READING` 之前，所以流程中這個原因碼只會在 A5 與實際建構不一致時出現；它仍由生成器單元測試覆蓋。
6. 合併兩輪時，若第 1 輪本身因預算停止，第 2 輪的 `VINYL_READINGS_BUDGET` 改記為一般預算原因（否則標籤「不含烯基的讀法已完成」會不實）。
7. 面板在無 IR 觀測帶時不推導 O 下限（O 數不受 IR 下限限制）。

## 5. 既有測試因 A 類而改變的地方（舊 → 新 → 原因）

| 測試 | 舊 | 新 | 原因 |
|---|---|---|---|
| `tests/hotfix117FullFlow.test.ts` B「IR C≡N 2229」 | 斷言至少一個含 N 的分子式被搜尋 | 原斷言原樣保留，改在 `useV121Planning = false` 下執行；另加新測試：含 N 的假設，每一個不是被搜尋就是有「未搜尋」原因 | 該合成形狀（2:1:2 芳香 ¹H＋C≡N）的 200 清單裡，含 N 的分子式碳數都放不進 ¹H 訊號，A5 判為不可行。v1.2.0 是搜尋了不可能的分子式才讓斷言成立。k=1 的 C7H5N 在 A 類下可被列舉（把 300／200 的截斷拿掉時排第 5），但被既有的「先驗截斷到 300」（DBE 超額被排後面）擠出清單，與 A 類的搜尋計畫無關 |
| `tests/v12/provenance.test.ts`「real tiny-budget analysis: no candidate survives」 | 16000 步、不填分子式 → 零候選 | 原斷言原樣保留，改在 `useV121Planning = false` 下執行；另加新測試：計畫式搜尋用 20 步預算同樣零候選且說明含「步數預算」，且沒有任何 run 退回 | 計畫式搜尋用同一個 16000 步預算已找得到候選（第 1 輪只花在可行的分子式上） |
| `tests/v12/v121FlagGolden.test.ts`（新增） | — | 旗標 false ＝ 1.2.0 黃金檔 | 步數計數器在同一份程式的兩次執行間會差幾十步（舊 beam 搜尋有自己的計時），比較時允許 10％或 500 步；面板句「葉端檢查：N 個葉」同理 |

以下既有測試**沒有**因 A 類改變：`tests/p1bPipeline.test.ts`（含 flow (iii)）、`tests/v12/legacyGolden.test.ts`（`useV12Constraints = false` 的 1.1.8 黃金檔）、`tests/v12/atomInventory.test.ts`。它們一度失敗，是因為 A 類在 `useV12Constraints = false` 或 `useExhaustiveEnumerator = false` 時也生效；加上 `planningActive()` 閘門後不需修改任何斷言。

## 6. 面板文字（旗標 false 時全部不出現）

| 舊 | 新 | 位置 |
|---|---|---|
| （無） | 區段「搜尋計畫（v1.2.1：k 輪流、兩輪預算）」：共 N 個分子式被搜尋（x 個只跑第一輪、y 個也跑第二輪）；未搜尋的原因與筆數；`O 下限 n（來源：…）`；S 說明 | 分子式假設表之後 |
| （無） | 列內徽章：`第一輪（芳香模板）`／`第一輪（烯基例外）`／`第二輪（含烯基）`／`未搜尋` | 「窮舉結果」欄 |
| `未搜尋（排名在搜尋範圍之外或預算已用完）` | `未搜尋（同骨架 O 變體超過保留數…）`、`未搜尋（k 輪流名額已滿…）`、`未搜尋（O 超過／少於 IR 證據的 O 下限…）`、`未搜尋（¹H 清單不可行：…）` | 「窮舉結果」欄（只在計畫式搜尋時） |
| （無） | 「未完整」原因：`含烯基（C=C–H）的讀法尚未執行…`、`第一輪達到每個分子式的步數上限…`、`第一輪沒有可容納此分子式的模板讀法…` | `REASON_LABEL` |
| （無） | 限制句：`兩輪搜尋下，烯基讀法只給各 k 第一輪最高分者；其餘分子式只跑了不含烯基的讀法（各分子式的「未完整」原因會寫明）。` | 限制 |
| 元素排除清單 | 多一行 `S：未考慮 S（沒有 S 專屬證據；組成層白名單不含 S）` | 元素線索與邊界 |
| 候選來源 `窮舉器` | `窮舉器｜第一輪`／`窮舉器｜第二輪（含烯基）` | 候選卡片 |

## 7. 沒有動的東西（本階段範圍外）

禁含片段清單、B3 烯基位移視窗、B4 缺羰基帶、GEM_DIOL、IR 帶表、版本號。

## 8. 階段 1b（A 類補強）

旗標仍是 `useV121Planning`（false ＝ v1.2.0）。版本號仍 1.2.0。

| 項 | 變更 |
|---|---|
| 1b-1 預算 | 以「每個形狀」第 1 輪 ≤ 6 s（步數預算與預設牆鐘兩種條件）、S1 的 C15H16O2 第 1 輪步數餘裕 ≥ 2 倍重新量測（12 格矩陣見 `notes/v1.2.1/P1B_REPORT.md`）；選 `round1MaxStatesPerFormula` 150 000、`maxRound1Formulas` 12 |
| 1b-2 第 2 輪資格 | 各 k 的第 2 輪候選只從第 1 輪 `GRAMMAR_EXHAUSTED` 或至少 1 個候選的分子式中選（沒有模板讀法者不算）；沒有符合者的 k 不進第 2 輪，預算轉給其他 k；全無符合者時第 2 輪不執行，面板寫明 |
| 1b-3 排序 | 計畫順序：分數 ↓、DBE 超額 ↑、C ↑、H ↑、O ↑。DBE 超額＝max(0, 分子式 DBE − 證據需要的 DBE)；證據需要的 DBE＝可行讀法中（環模板 DBE 總和＋烯基 C=C 數，C=C 數至少為烯基 CH 原子數的一半）的最小值，＋ `oxygenEvidenceFloor` 有強 C=O 時 +1。只當排序鍵，不是扣分 |
| 1b-4 O 視窗 | k≥2：O 視窗 [下限, k×下限＋1]、每個 (k, C) 鍵 3 個變體，O＝下限與 O＝k×下限優先；k=1 不變。**「O 變體」改為不同的 O 個數、每個 O 個數只留分數最高的一個分子式**（H、N 的變體不算 O 變體、共用一個名額）——階段 1 的做法是每個 (k, C) 鍵留 N 個分子式，改了優先順序後 O＝下限的 H／N 變體會佔滿名額，把含 O 的變體擠掉（`hotfix117FullFlow` B 的計畫式版本因此失敗過）。`weights.oxygenExcess` 以視窗上緣計算（視窗內不扣）；列舉的 O 上限對每個 k 至少是 k×下限＋1 |
| 1b-5 黃金檔 | 由 `86e6066` 的完整擷取轉成精簡格式 `tests/goldens/v12.v120.pipeline.compact.json`（2.8 MB → 約 110 KB），非重新擷取 |

### 既有測試／測試資料因 1b 而改變

| 項目 | 舊 | 新 | 原因 |
|---|---|---|---|
| `tests/goldens/v12.v120.pipeline.json` | 完整擷取 2.8 MB | 刪除；改 `...pipeline.compact.json` | 指令 1b-5。假設表、搜尋清單、每個 run 的終止／步數／候選數／原因碼仍逐項比對；候選集合、排名、評分帳本、面板改為筆數＋雜湊＋樣本；不再逐項比對每個 run 的讀法明細與拒絕統計 |
| `tests/v12/v121Planning.test.ts`「O above … is scored down」 | G1 的 C10H12O3（k=1，O=3）仍在清單 | 改用 S1，逐一比對同 (k, C, H) 的 O=1 手足，扣分 ＝ 0.5 × max(0, O − (k×下限＋1)) | O 視窗隨 k 縮放後，k≥2 的 O=3 不再扣分並佔去清單位置，G1 清單裡沒有 k=1、O=3 的分子式；斷言的性質（視窗外逐級扣分、不剔除）沒有削弱，反而逐式驗證 |

## 9. 階段 1c（A 類最後補強）

旗標仍是 `useV121Planning`（false ＝ v1.2.0，11 個情境的精簡黃金檔未改）。版本號仍 1.2.0。

| 項 | 變更 |
|---|---|
| 1c-1 S2 | 新增合成形狀 S2（S1 去掉 4.75 ppm 的 OH 峰，IR 不變，k=2、額外可交換 H e=2）。每個 (k, C) 鍵內，每個保留的 O 個數除了分數最高者，另外保留「額外可交換 H 的最佳者」（e>0），不再被 e=0 吞掉。IR 有寬 X–H 帶而 ¹H 表沒有寬峰時（`hiddenExchangeableEvidence`），排序鍵不計「缺失可交換 H」的先驗扣分（只影響順序，假設分數不變）。假設新增選填欄位 `extraExchangeable`（H − k·S，只在計畫式 ¹H-only 路徑填） |
| 1c-2 溶劑 | 測試輔助 `fixtureSpectra` 以前把溶劑與頻率寫在無人讀取的欄位，所有形狀都以溶劑 "Unknown" 執行；現在寫入 `nmrSolvent`／`spectrometerFrequencyMHz`。v1.2.0 黃金檔的情境用 `declareSolvent: false` 保持原輸入 |
| 1c-3 第 2 輪分級 | A 級＝第 1 輪已有候選；B 級＝只因 `GRAMMAR_EXHAUSTED` 而具資格、0 候選。每個 k 先選 A 級最佳；該 k 沒有 A 級才選 B 級最佳，B 級先跑，單一分子式步數上限 `round2ExploreMaxSteps`＝500,000（工程判斷，未查證），其餘預算留給 A 級。新原因碼 `ROUND2_EXPLORE_CAP` |
| 1c-4 名額兩輪取 | 新常數 `nameOrder`（`ONE_PASS`＝1b 的順序，預設；`TWO_PASS`＝第一輪每個 (k, C) 只取一個代表 O 變體、第二輪補其餘）與 `representativeOxygen`（`EITHER`／`K_FLOOR`）。**預設維持 `ONE_PASS`**：`TWO_PASS`＋`EITHER` 會讓 S1 的目標分子式失去名額（見 `notes/v1.2.1/P1C_REPORT.md`） |

### 面板文字（旗標 false 時不出現）

| 舊 | 新 | 位置 |
|---|---|---|
| （無） | `其中 n 個是探索性的：該 k 沒有第一輪已有候選的分子式，所以只給固定的步數上限（500000），其餘預算留給有候選的 k。` | 搜尋計畫摘要 |
| （無） | 「未完整」原因 `ROUND2_EXPLORE_CAP`：`第二輪（含烯基）是探索性的：…` | `REASON_LABEL` |
| `同 O 數只保留分數最高的一個（H、N 的變體不算 O 變體）` | 後面加 `；有額外可交換 H 的變體另外保留分數最高的一個` | 未搜尋原因 |
| 搜尋說明 | 多一句（只在有「隱藏的可交換 H」證據時）：`IR 有寬 X–H 帶而 ¹H 表沒有寬峰：排序時不計「缺失可交換 H」的先驗扣分…` | 搜尋說明 |

### 既有測試／測試資料因 1c 而改變

| 項目 | 舊 | 新 | 原因 |
|---|---|---|---|
| `tests/helpers/v121Golden.ts` `fixtureSpectra` | 溶劑寫在 `solvent`／`frequencyMHz` | 寫入 `nmrSolvent`／`spectrometerFrequencyMHz`；黃金檔情境傳 `declareSolvent: false` | 見 1c-2；黃金檔輸入不變 |
| `tests/v12/v121Shapes.test.ts` | 驗收迴圈 S1、G1、E1、G3 | 加上 S2 | 指令 1c-1（沒有放寬任何斷言） |

## 10. 階段 2B（B 類：合理性、烯基視窗、缺羰基帶）

旗標：全部掛在 `planningActive()`（`useV121Planning` ＆ `useV12Constraints` ＆ `useExhaustiveEnumerator`）之下；`useV121Planning = false` 的輸出（含面板文字）仍等於 v1.2.0 黃金檔，`useV12Constraints = false` 的黃金檔不變。版本號仍 1.2.0。
另在 `V12_CONFIG.planning` 加三個子開關（預設 true，只供測試與診斷，不在 UI）：`forbiddenFragments`（B1、B2）、`vinylWindows`（B3）、`carbonylBand`（B4）。關掉其中一個，只有對應規則不執行。
範圍：B1／B2（合理性）與 B4（評分）不限路徑；**B3 只在「無分子式」路徑**（使用者自填分子式與 MS 路徑的烯基視窗維持 v1.2.0 的 4.5–7.5 ppm、每原子 1 或 2 個 H）。
沒有使用 `benchmark\` 的任何檔案；所有新增的禁含片段、窗、門檻、權重，凡無文獻出處者，出處欄寫「工程判斷，未查證」。

| 項 | 內容 | 位置 |
|---|---|---|
| 共通 | 新檔 `constraints/forbiddenFragments.ts`（`ForbiddenFragment {id, smarts, label, reason, source, stage}`）；葉端新階段 `forbidden`（放在必含子結構之後、芳香／等價之前，命中的分子會被記住）；下游閘規則 `FORBIDDEN_<id>`；舊 beam 補充的候選套同一份清單（`legacySupplement.droppedByForbidden(ById)`）；命中統計 `rejected.v12.forbiddenById`，面板與「沒有候選」說明共用 `exclusionStats().forbidden`；沒有其他葉端檢查的集合也走葉端管線（只為了禁含檢查，其計時不計入 `leafCost`） | `enumeration/leafChecks.ts`、`enumerate.ts`、`exclusionStats.ts`、`exhaustiveGenerator.ts`、`structurePlausibility.ts`、`rdkitAdapter.ts` |
| B1 | 苯環（小寫 c）對位以 ≤ 4 個原子的橋、間位以 ≤ 3 個原子的橋相連者禁含；7 條 SMARTS（PARA_BRIDGE_1…4、META_BRIDGE_1…3）。[2.2] 對／間環芳烷（路徑經過第二個環）與雜芳環不擋，列為已知限制。出處：工程判斷，未查證 | `forbiddenFragments.ts` |
| B2 | 環狀 C(OH)(OR)(OR)：`[CX4;R]([OX2H1])([OX2][#6])[OX2][#6]`；GEM_DIOL 維持一律擋、無例外；與 HEMIACETAL_ACYCLIC／ORTHOESTER_ACYCLIC 以環內／環外分開，不重疊 | `forbiddenFragments.ts` |
| B3 | `ShiftClassDef.hPerAtomWindows`；`VINYL_CH`：=CH₂（2H）基本窗 4.5–6.0、放寬窗 6.0–6.5 ppm；=CH（1H）基本窗 4.5–7.5、放寬窗 7.5–7.8 ppm；放寬窗只在 `IrAldehydeContext.conjugatedCarbonyl === true` 時允許（false 與 null 都不放寬）。共軛 C=O 脈絡由 `irAldehydeContext` 產生：影像 IR、校正可信、強度已知，1630–1735 cm⁻¹ 有 ≥ 最強帶 50% 的帶＝true，否則 false；峰表型（非影像）IR、校正不可信、強度未知、沒有 IR＝null。其餘 7 個位移類別不變。出處：工程判斷，未查證 | `v12Config.ts`、`shiftClasses.ts`、`atomInventory.ts`、`v12Evidence.ts`、`searchPlanning.ts`、`exhaustiveGenerator.ts`、`sixStepAnalysis.ts` |
| B4 | 影像 IR 缺羰基帶扣分：候選含酯 1710–1750、共軛酮 1650–1700、醯胺 1630–1680、醌 1650–1690、酸酐 1740–1870、醯鹵 1770–1815 cm⁻¹ 的羰基類別，而這些窗的聯集內沒有 ≥ 最強帶 50% 的帶時，加**一筆**（每個候選最多一筆，階段 2C-0）`IR:carbonyl-missing:<類別>`——候選有多個羰基類別時 id 與說明文字列出全部類別，例如 `IR:carbonyl-missing:ESTER+AMIDE`（compatibility 0、權重 0.8 × `irDataQuality`、帶 `display`；只有一個類別時 id、文字、分數與 2B 完全相同）；扣分不剔除。啟用條件：影像 IR；`irCalibrationTrusted`（來源為使用者校正且未失敗；分段線性 ≥ 3 個使用者點且窗口在最小與最大點之間；三點最小平方最大殘差 ≤ 0.5% 軸跨度；兩點一律不可信）；`irImageRangeCovered`（有描線曲線 ≥ 50 點、換算後涵蓋窗口）。峰表型 IR 不啟用，既有 0.2 的舊規則一字不動。權重 0.8、3 個點、0.5%、50% 都是工程判斷，未查證 | `carbonylClasses.ts`（新）、`evidenceLedger.ts`、`irSignalProcessing.ts`、`v12Config.ts` |

### 新常數（全部未校準）

| 常數 | 值 | 出處 |
|---|---|---|
| `BRIDGE_LIMITS` | 對位 ≤ 4、間位 ≤ 3 個橋原子 | 工程判斷，未查證 |
| `planning.forbiddenFragments`／`vinylWindows`／`carbonylBand` | true／true／true | 診斷用子開關 |
| `shiftClasses[VINYL_CH].hPerAtomWindows` | 2H：4.5–6.0（放寬 6.0–6.5）；1H：4.5–7.5（放寬 7.5–7.8） | 工程判斷，未查證 |
| `conjugatedCarbonylIr` | 1630–1735 cm⁻¹、≥ 最強帶的 50% | 工程判斷，未查證 |
| `irMissingBand.weight` | 0.8（× `irDataQuality`） | 未校準，工程判斷，未查證 |
| `irMissingBand.strongRelativeIntensity`／`minCurvePoints`／`minUserCalibrationPoints` | 0.5／50／3 | 工程判斷，未查證 |
| 三點殘差上限 | 0.5% 軸跨度（沿用 `AXIS_CALIBRATION_CONFIG.linearityResidualFractionOfSpan`） | 工程判斷，未查證 |
| 六個羰基窗 | 見上表 | 規劃者放寬的窗；與 Coates, *Interpretation of Infrared Spectra, A Practical Approach*, Table 9（文章第 13 頁）核對，結果見 `notes/v1.2.1/P2B_REPORT.md` §4 |

### 面板文字（旗標 false 或對應子開關 false 時全部不出現）

| 舊 | 新 | 位置 |
|---|---|---|
| （無） | `禁含片段『…』排除了 N 個`（每條有命中的規則一行，零命中不列）；其後固定一行 `禁含片段的出處：工程判斷，未查證`；葉端統計行多 `、禁含片段 N` | 「被排除的結構（全部分子式合計）」、「沒有候選」說明、各分子式的葉端統計 |
| （無） | 區塊「影像 IR 缺羰基帶檢查」：`影像 IR 涵蓋並且校正可信（範圍 1630–1870 cm⁻¹）時，缺帶檢查才會啟用，目前已啟用。是否對某個候選扣分，看該候選的證據欄…`（不宣稱逐候選判斷）或 `未啟用（原因：不是影像 IR／校正不可信／沒有涵蓋羰基窗的描線／峰強度未知）`，並列六個窗 | 組成面板，搜尋計畫之後 |
| （無） | 搜尋計畫區塊多一句烯基視窗：`烯基 CH₂ 的視窗為 4.5–6.0 ppm（6.0–6.5 需要 IR 共軛 C=O）；=CH 上限 7.5 ppm（有共軛 C=O 時 7.8）…` | 搜尋計畫（只在無分子式的計畫式搜尋） |
| 訊號表「類別」欄 | 放寬發生時加註 `（烯基視窗已依 IR 共軛 C=O 放寬）` | 原子清單的訊號表 |
| 候選卡片「實測支持與矛盾」 | 缺羰基帶時多一行 `IR（影像）：候選含酯羰基，但在 1710–1750 cm⁻¹ 沒有強帶（校正可信、描線涵蓋該範圍）；已扣分，未剔除` | 候選卡片 |

### 既有測試因 B 類而改變的地方（舊斷言 → 新斷言 → 原因）

規劃者預先核准的 7 項中，4 項沒有失敗（B3 限定在無分子式路徑後，它們走的是使用者自填分子式的路徑）；其餘 3 項如下。清單以外沒有既有測試失敗。

| 測試 | 舊斷言 | 新斷言 | 原因 |
|---|---|---|---|
| #1 `tests/v12/enumeratorC1.test.ts` › C1 everything together（C9H10O） | 窮舉器輸出＝暴力參考解 `['CC1(C)Oc2ccc1cc2']` | 暴力參考解 `bruteForceV12.ts` 也套同一份禁含清單（清單由測試傳入，檔案仍不 import `src/engines`），兩邊都是 `[]`；另加一個測試：兩邊都關掉禁含清單時，參考解與窮舉器仍都是原來那一個分子 | 該分子是對位橋 2 個原子的環（B1 要禁的結構）；斷言方向沒有放寬，兩邊以同一份規格比對 |
| #5 `tests/v12/stage3.test.ts` › W7（C10H10O，DMSO-d6，9.2 ppm 1H／1.3 ppm 9H） | `{timeMs: 15000, maxStates: 3_000_000}`；`path === 'INVENTORY'` 等斷言 | 斷言一字不動；預算改為 `{timeMs: STEP_ONLY_TIME_MS, maxStates: 3_000_000}` | 失敗原因**不是 B3**（此輸入走使用者分子式路徑，烯基視窗不變）。惟一的庫存候選要到第二個讀法約 0.7 M 步才找到，剛好落在 15 秒牆鐘邊緣：關掉子開關或把旗標關掉，同一台機器上也會有一次找不到；改步數預算後結果與機器速度無關。輸入的光譜與分子式沒有改 |
| #6 `tests/v12/v121TwoRound.test.ts` › round-2 eligibility（E1） | E1 至少有 1 個分子式進第 2 輪 | 改用 G1，斷言一字不動（第 2 輪有分子式、有不合資格者、某個 k 沒有第 2 輪、第 2 輪分子式少於 3 個） | B3 後 E1 沒有含烯基的替代解讀，第 2 輪無事可做（E1 在第 1 輪就讀完）。G1 仍有烯基讀法，且四項條件都成立（第 2 輪 1 個、不合資格 8 個） |
| #2 `atomInventory.test.ts`、#3 `generatorV12.test.ts` C4、#4 `stage3.test.ts` W4、#7 `p1bPipeline.test.ts` flow (i) | — | 不需修改 | 2A 的原型把 B3 同時用在使用者自填分子式路徑才會失敗；B3 限定在無分子式路徑後這四項照舊通過 |

新增測試檔：`tests/v12/v121bForbidden.test.ts`、`v121bBridges.test.ts`、`v121bVinyl.test.ts`、`v121bCarbonyl.test.ts`、`v121bPanel.test.ts`。

## 11. 階段 2C-0：B4 一筆化

| 項 | 內容 |
|---|---|
| 問題 | 候選有多個羰基類別（例如酯＋醯胺），且所有類別窗的聯集內都沒有強帶時，2B 每個類別各扣一筆：同一個事實（聯集內沒有強帶）被重複扣分，並稀釋 IR 模態的可靠度權重 |
| 修法 | 每個候選最多一筆 `IR:carbonyl-missing:<類別>[+<類別>…]`，說明文字列出所有涉及的類別與各自的窗；權重仍是 `irMissingBand.weight × irDataQuality`，compatibility 0，不剔除。聯集內任一窗有強帶仍不扣分 |
| 單一類別 | id、文字與分數不變（present 83.924；missing 旗標 false 80.064、旗標 true 77.702、IR 模態 23.304→18.162；untrusted 84.054；對照候選 70.936） |
| 面板 | 「影像 IR 缺羰基帶檢查」不再宣稱逐候選判斷：`影像 IR 涵蓋並且校正可信（範圍 1630–1870 cm⁻¹）時，缺帶檢查才會啟用，目前已啟用。是否對某個候選扣分，看該候選的證據欄（扣分不剔除；權重是未校準的工程判斷）。`；旗標 false 時整個區塊不出現 |
| 測試 | `tests/v12/v121bCarbonyl.test.ts` 新增 4 個（雙類別只有一筆、任一窗有強帶沒有項目、單類別數字不變、旗標與子開關關閉不執行）；`v121bPanel.test.ts` 的面板措辭 |

## 12. 已知限制

以下是 v1.2.1 已知、且刻意不在本版處理的限制（多數留給 v1.3.0）。化合物準確性一律由使用者實測，本檔不宣稱任何準確率。

1. **IR 範圍比對的誤判**：IR 官能基的「範圍比對」會把 3030／2965 cm⁻¹ 誤判為羧酸 O–H、把 1612 cm⁻¹ 誤判為醯胺 I（留 v1.3.0）。v1.2.1 的 A 類因此不讓「只由範圍比對產生的軟特徵」影響 O 下限與扣分。
2. **先驗截斷**：分子式清單依先驗截斷（456→300→200）對高 DBE（不飽和度）的分子式不利；清單同分排序仍是 C 數少者優先。
3. **搜尋名額只有 12 個**：每個 k（對稱單元重複數）只涵蓋最小的 2 個 C 數。含多個不可見四級碳（沒有 H、不產生 1H 訊號的碳）的化合物，正確分子式可能落在名額之外。
4. **烯基讀法覆蓋窄**：B3 之後，7.5 ppm 以下「4 個 =CH」的讀法仍存在；B3 只作用於不填分子式的路徑（使用者自填分子式與 MS 路徑維持 v1.2.0 的 4.5–7.5 ppm）。
5. **預設牆鐘下的部分搜尋與機器速度**：預設牆鐘模式下，第 1 輪有部分非目標分子式被時間份額截斷；慢機器的搜尋深度會下降（同程式、同步數，秒數可差約 50%）。
6. **額外可交換 H 先驗**：缺失的可交換 H 先驗（0.3／個）未校準；`hiddenExchangeableEvidence`（IR 有寬 X–H 帶而 1H 表沒有寬峰時不計該先驗）依「寬峰」判斷。
7. **B1 只擋苯環**：不擋雜芳環與 [2.2] 對環芳烷；對位橋 5 個原子、間位橋 4 個原子也不擋（規格以外）。
8. **B4 的啟用條件窄**：只在影像 IR（5 點分段線性，或可信的 3 點最小平方，且有描線曲線涵蓋羰基窗）啟用；非影像 IR（峰表與數值曲線）的共軛 C=O 脈絡一律是 null（烯基放寬窗不會放寬）；六個羰基窗（已與 Coates 的羰基頻率表核對）、校正可信門檻（3 個使用者點、0.5% 軸跨度）、權重 0.8 都是工程判斷，未查證。
9. **影像 IR 的校正殘差沒有資訊**：分段線性與兩點校正的殘差在建構上為 0，不能用殘差判斷可信度；v1.2.1 改用結構性條件（來源、使用者點數、窗口是否被點包夾）。
10. **早期量測的溶劑**：P0／P1／P1B 階段的形狀量測都是在溶劑 "Unknown" 下做的（測試輔助寫錯欄位，階段 1c 修正）；之後的數字都已宣告溶劑。
