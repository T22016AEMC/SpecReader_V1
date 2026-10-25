# P1c 階段 4：組成推斷面板（1H 約束區段）UI 設計（待審核，尚未實作）

狀態：**設計稿。UI 尚未實作**；等你審核後才實作。基準：`claude-mode`（階段 1–3 完成後）。
範圍：沿用 P1b 的「組成推斷（分子式假設）」面板（`docs/P1B_COMPOSITION_PANEL_DESIGN.md`、`CompositionPanel.tsx`、`compositionPanelModel.ts`），新增兩個區段與數個原因／徽章文字。**不改既有版面、不新增輸入、不新增頁面。**
前提：所有新區段只在 `useV12Constraints` 開啟且該分子式有 `run.enumeration.v12` 診斷時出現；旗標關閉（1.1.8 行為）時面板的資料與畫面逐字不變（既有 E2E 與 `compositionPanelModel.test.ts` 不改）。
文字全為繁體中文；所有分數／信心文字沿用「未校準」說法，不出現百分比或準確度字樣。

## 1. 位置與收合行為

外層面板結構不變：`<details data-testid="composition-panel">`，預設收合，摘要列一行。展開後的順序：

1. 分子式假設表（既有，預設展開）。表內「窮舉結果」欄的文字與 `各讀法` 照舊；v12 的原因由 `REASON_LABEL` 顯示（見 §3）。
2. **（新）「由 1H 推得的原子清單」**：`<details data-testid="composition-inventory">`，**預設收合**。
3. **（新）「實際套用的約束」**：`<details data-testid="composition-constraints">`，**預設收合**。
4. 窮舉總覽、支持／矛盾／未知理由、N 證據、元素線索與邊界、限制（既有）。

兩個新區段放在表之後、總覽之前，因為它們解釋「這個分子式的窮舉依據什麼」。區段內每個分子式一個子 `<details>`（標題＝分子式；只有一個分子式時預設展開，多個時預設全部收合），子區段內的長清單（作廢原因、替代解讀預覽）再各自 `<details>` 收合。

摘要列：文字格式不變。新增一種徽章（琥珀色，沿用 `composition-badge`）：`V12_FALLBACK`，只要任何一個分子式的 v12 路徑退回就出現在摘要列與該列的「窮舉結果」欄；既有的「未完整」徽章照舊並存。沒有其他新徽章（截斷、模板不足、烯基預算都只用既有的「未完整」徽章＋原因文字，避免摘要列變擠）。

## 2. 資料欄位（additive，唯讀）

來源：`runs[i].enumeration.v12`（`V12RunDiagnostic`，已在階段 1–3 寫入）。階段 4 實作時補兩個欄位（純診斷資料，不影響搜尋）：

- `inventory.alternativesPreview`：前 `maxPreview`（預設 6）個替代解讀的摘要 `{id, k, extraExchangeable, groups: [{observationId, shiftClasses, hTotal, atomCount, hPerAtom, element, aromatic, alkene, equivalent, singletRule}], rings: [{templateId, ch, patterns}], zeroHAtoms, hasVinyl}`。
- `constraints`：`{pinnedAtoms, equivalentGroups: number, aromaticPools: number[], singletGroups: number, alkeneGroups: number, strainProfile, symmetryPruning}`，取第一個可執行的替代解讀的數量；另有 `perCandidate` 不放在這裡（見問題 2）。

### 2.1 區段 A「由 1H 推得的原子清單」

每個分子式顯示：

| 內容 | 欄位 |
|---|---|
| 狀態行 | `path`（INVENTORY／FLEX_NO_INTEGRALS／FALLBACK）、`inventory.status`、`inventory.reason`（不可用或退回的原因） |
| 讀法組合（每個 k、額外 OH 一行） | `inventory.combinations[]`（`k`、`extraExchangeable`、`ratio`）＋ `runs[]`（`alternatives`、`sets`、`complete`、`visited`、`candidates`、`incompleteReasons`） |
| 訊號表（每個 1H 訊號一列） | `inventory.signals[]`：`shiftPpm`、`relativeIntegral`、`ratio`、`multiplicity`、`broad`、`classes[]`、`singletRuleApplied`、`equivalenceRequired`；H 數＝`k × ratio` |
| 替代解讀預覽 | `inventory.alternativesPreview[]`（每個群：類別、每原子 H、原子數、等價、單峰規則、是否烯基；環：模板、CH 數、取代型式數） |
| 數量與截斷 | `inventory.alternatives`、`patternSets`、`truncated`、`patternTruncated` |
| 作廢原因 | `inventory.voided[]`（原因＋次數，預設只列前 5 筆，其餘「顯示全部」展開） |
| 模板不足 | `inventory.aromaticLimited[]`（k、額外 OH、芳香 CH 數、原因） |

訊號表欄位標題：`δ (ppm)`、`積分`、`最簡比`、`H 數`、`多重性`、`位移類別`、`每原子 H`、`原子數`、`等價`、`單峰規則`。「位移類別」顯示 `ARO_CH` 等代碼的中文名（見 §3.3）。

### 2.2 區段 B「實際套用的約束」

| 內容 | 欄位 |
|---|---|
| v1.2 狀態 | 固定句：`1H 約束：開啟（useV12Constraints）`；`path` 為 FLEX_NO_INTEGRALS 時改為 `1H 沒有積分：使用舊的彈性原子路徑，只套用強證據子結構` |
| 必含子結構 | `required[]`：`id`、`label`、`smarts`、`evidenceObservationIds`（顯示為觀測位移／波數，不顯示內部 id） |
| 結構性約束 | `constraints`：釘住 H 的原子數、等價群數、芳香池（需要等價的芳香 CH 訊號大小）、單峰規則群數、烯基群數、應變規則、對稱剪枝 |
| 葉端檢查 | `leafCost`（葉數、軌道檢查次數、被芳香／必含／等價／烯基檢查排除的數量 `rejected.v12`） |
| 評分（雙向） | 見問題 2：預測多出的 1H 環境數、被豁免數（重疊／可交換／涵蓋未確認）、環境數比、H 總數比 |

## 3. 文字

### 3.1 原因代碼（`REASON_LABEL`，顯示於「窮舉結果」欄的「未完整（INCOMPLETE：…）」）

| 代碼 | 顯示文字 |
|---|---|
| `INVENTORY_ALTERNATIVES_TRUNCATED` | 1H 原子清單的替代解讀超過上限，只列舉最前面的（每個 k／額外 OH 組合至多 64 個，取代型式至多 128 組） |
| `AROMATIC_TEMPLATE_LIMITED` | 芳香 CH 超出環模板庫（目前只有苯、萘，有 N 證據時才有吡啶；呋喃、噻吩、吡咯等五員雜環是已知限制） |
| `VINYL_READINGS_BUDGET` | 含烯基（C=C–H）的讀法在預算內沒有跑完；不含烯基的讀法已完成 |
| `V12_CONSTRAINTS_FALLBACK` | 1H 約束未能套用（已退回）：改用舊的彈性原子讀法 |

既有代碼（TIME_BUDGET 等）文字不變。

### 3.2 徽章

| id | 文字 | 顏色 | 出現位置 |
|---|---|---|---|
| `V12_FALLBACK`（新） | 1H 約束未能套用（已退回） | 琥珀（同 `composition-badge`） | 摘要列、該分子式的「窮舉結果」欄、區段 A 該分子式標題旁 |
| `INCOMPLETE`（既有） | 未完整 | 琥珀 | 不變 |

退回時區段 A 的狀態行第二行顯示原因，格式：`原因：<inventory.reason 或 run.v12.reason>`（例如「分子式 H=12 與積分的整數比總和 S=7 不相容…」「原子清單的 N 個讀法沒有產生任何候選」）。

### 3.3 位移類別中文名

`ARO_CH` 芳香 CH｜`VINYL_CH` 烯基 CH｜`ALDEHYDE` 醛基 H｜`O_CH` 接 O 的碳 H｜`N_CH` 接 N 的碳 H｜`ALPHA_CH` 鄰羰基／芳環／炔的碳 H｜`ALKYL_CH` 烷基 H｜`EXCHANGEABLE` 可交換 H（OH／NH）。

### 3.4 固定說明句（區段 A 底部，小字）

- 「原子清單是由 1H 積分與位移類別推得的假設讀法，不是確認的結構；位移類別的數值是工程預設，未校準。」
- 「位移類別只決定每原子 H 數與環模板，不要求原子的混成或鄰接元素（例如 3.9 ppm 的 CH2 可以不接 O）；位移的鑑別留給評分。」
- 「整數比容差 ±0.15；積分誤差過大時整組讀法都可能錯。」

## 4. 空狀態與錯誤狀態

| 情況 | 顯示 |
|---|---|
| 旗標關閉、或沒有任何 `v12` 診斷 | 兩個區段都不出現（面板與 1.1.8 相同） |
| 沒有分子式（NO_FORMULA）或該分子式走舊 beam 搜尋 | 該分子式不列；若所有分子式都沒有 v12 診斷則區段不出現 |
| 1H 沒有積分（`FLEX_NO_INTEGRALS`） | 區段 A：「1H 沒有積分，無法建立原子清單；使用舊的彈性原子路徑」；區段 B 仍列必含子結構 |
| 已退回（`FALLBACK`） | 區段 A 顯示徽章與原因；訊號表仍顯示（若有）；預覽為空時顯示「沒有可執行的替代解讀」 |
| 沒有必含子結構 | 區段 B：「沒有強證據規則被觸發」 |
| 資料已變更（`analysisStale`） | 與既有相同：標題旁「資料已變更，以下為舊結果」，內容不更新 |

## 5. 測試計畫

- **模型單元測試**（`compositionPanelModel.test.ts` 新增，純函式，不需瀏覽器）：旗標關閉時 `buildCompositionPanel` 輸出的 `inventory`／`constraints` 為 `null`，其餘欄位與 1.1.8 輸入的結果深度相等；有 v12 診斷時訊號表列數、H 數＝k×比、類別中文名、截斷／模板不足／退回／烯基預算各自出現正確文字與徽章；`FLEX_NO_INTEGRALS`、`FALLBACK`、空必含子結構的空狀態文字。
- **既有測試不改**：既有 11 個面板模型測試與 E2E `composition-panel.spec.ts` 照舊通過。
- **E2E**（新增 `tests/e2e/composition-panel-v12.spec.ts`）：需要在瀏覽器內開啟旗標（見問題 1）。內容：合成 1H 表（4 個訊號、積分）＋使用者分子式 → 展開面板 → 兩個新區段預設收合、可展開、訊號表欄位與列數正確；退回案例（H 與積分不相容）→ 摘要列出現 `V12_FALLBACK` 徽章與原因；無積分案例的空狀態；資料變更後標示舊結果；無頁面錯誤。
- **可及性**：新區段用原生 `<details>`／`<table>`，欄位標題用 `<th>`；徽章有文字，不只靠顏色。

## 6. 版本與紀錄（實作時）

版本號 1.2.0、`CHANGELOG`（UI 文字逐項列出：§3.1 四條原因、§3.2 一個徽章、兩個區段標題與欄位標題、§3.4 三句固定說明、§4 空狀態句）、PR（merge commit）、health 輪詢、同步、zip、`notes\v1.2.0\REPORT.md`。`useV12Constraints` 預設 true 的切換在發佈步驟，另行確認。

## 7. 需要你決定的問題

1. **E2E 如何開啟旗標？** 旗標是模組常數，瀏覽器內沒有開關。選項：(a) 只測模型與元件（不跑 E2E 的 v12 流程），E2E 只確認旗標關閉時畫面不變；(b) 加一個僅限開發／測試建置的開關（例如 `?v12=1` 或 `localStorage`），預設不存在；(c) 1.2.0 發佈時旗標預設 true，E2E 直接測（發佈前的階段 4 仍無法在 E2E 測）。我建議 (a)＋發佈時 (c)；(b) 會增加一個使用者可見的行為。
2. **W4 雙向評分摘要放哪裡？** 它是每個候選的資料（預測多出的環境數、豁免數），不是每個分子式的。選項：(a) 只留在既有的候選評分帳本顯示（不改面板）；(b) 區段 B 顯示「該分子式排名最高候選」的摘要；(c) 候選卡片新增一行。我建議 (a)（面板維持分子式層級）。
3. **區段預設收合是否可以？** 我選收合以免面板變長；也可以讓區段 A 在有 v12 診斷時預設展開。
4. **替代解讀預覽要多少個？** 預設 6 個（每個一行摘要）；最多可 64 個，但很長。
5. **`V12_FALLBACK` 徽章要不要也出現在候選卡片的來源標籤？** 目前候選來源標籤是「窮舉器／舊 beam 搜尋…」；退回路徑產生的候選仍是「窮舉器」。我建議不加，面板的徽章已足夠。
6. 文字細節：§3.1 的四條原因句與 §3.2 徽章文字（徽章你已指定「1H 約束未能套用（已退回）」）是否可以？原因代碼名稱 `VINYL_READINGS_BUDGET`、`V12_CONSTRAINTS_FALLBACK` 是否保留？
