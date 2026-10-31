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
| `planning.maxOxygenVariantsPerKey` | 2 | 每個 (k, C) 鍵保留的 O 變體 |
| `planning.oxygenAllowedAboveFloor` | 1 | O 下限＋1 以內不扣分、可搜尋 |
| `planning.maxRound1Formulas` | 18 | 第 1 輪搜尋的分子式數 |
| `planning.round1MaxStatesPerFormula` | 50 000 | 第 1 輪每個分子式的步數上限 |
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
