# 測試穩定性診斷：`tests/v12/v121FlagGolden.test.ts`（停點 3 開始前）

只診斷，**沒有修改**該測試、引擎或 golden 檔。日期：2026-11-01。機器：16 個邏輯核心，Windows 11；關掉 3000 埠的開發伺服器後在閒置狀態（CPU 約 6–9%）跑。使用者本人的瀏覽器視窗沒有關（未動使用者的檔案與工作）。

## 結論（一句話）
**這不是介面程式造成的，也不是單純「機器忙碌」；是這個測試本身有一個沒被關掉的牆上時鐘預算（500 毫秒），結果會隨 CPU 速度與程式暖機程度而變，連 `origin/main`（v1.2.1，4d55117）在閒置時 5 次裡也失敗了 1 次。**

## 1. 本分支（`v1.2.2-ui`，停點 2 提交 3c8e35f）連跑 5 次（`v121FlagGolden` 整個檔案，13 個測試）
| 次 | 秒數 | 結果 |
|---|---|---|
| 1 | 104 | 13／13 通過 |
| 2 | 103 | 13／13 通過 |
| 3 | 144 | 13／13 通過 |
| 4 | 186 | 13／13 通過 |
| 5 | 180 | 13／13 通過 |

**5 次全過。**（秒數不一致：第 3–5 次我同時在讀程式碼與編輯檔案，所以嚴格說不是「完全閒置」；無法證明它們與速度無關。）

## 2. `origin/main`（v1.2.1，4d55117，用 `git worktree` 取出，node_modules 以連結共用）連跑 5 次
| 次 | 秒數 | 結果 |
|---|---|---|
| 1 | 181 | 13／13 通過 |
| 2 | 203 | 13／13 通過 |
| 3 | 106 | **12／13：`h1OnlyNoFormula` 失敗**（57 項差異） |
| 4 | 101 | 13／13 通過 |
| 5 | 103 | 13／13 通過 |

**5 次中 1 次失敗，而且失敗的那一次是速度正常的一次（106 秒），不是慢的那兩次。** 失敗的是 v1.2.1 原版程式碼，所以與 v1.2.2 的介面改動無關。（停點 2 的 `ethylNoFormula` 失敗是同一個機制，只是挑中不同的情境。）

## 3. 測試用的是牆鐘還是步數預算？
- 測試用的預算設定（`tests/helpers/v121Golden.ts`）：步數預算（`maxStates` 60000／2,000,000／4,000,000／8,000,000）**加上**刻意放大的牆鐘 `timeMs = STEP_ONLY_TIME_MS = 3,600,000`（一小時），意圖是「只由步數決定」。
- 但是流程裡還有**寫死的牆鐘預算沒被這個設定關掉**：舊的有界圖搜尋（legacy beam search）每個分子式固定 **500 毫秒**（`ENUMERATION_CONFIG.legacySupplement.timeMsPerRun = 500`；`deNovoGraphSearch` 預設也是 500 ms）。它用掉多少步，會被合併進後面分子式的步數預算（`structureGenerator.ts` 的 `usedStates`），所以後面的分子式（例如 C7H7N）多或少幾十步，就會多找到或少找到幾個結構（候選數 203 或 205）。測試檔自己的註解也承認「步數計數器會差幾十」。
- 我用一個臨時的探針測試（副本在 `flaky-diagnosis/probe.test.ts.txt`，已不在 `tests/` 內）證實：
  - **同一個行程內連跑 6 次（閒置）**：第 1–3 次與 golden 完全一致；**第 4、5、6 次都失敗**（候選數 205≠203，C7H7N 的步數 6952 對 golden 的 6901）。也就是程式暖機後在 500 ms 內跑得更快、走更多步，就偏離了。見 `flaky-diagnosis/probe-1-idle-then-stressed.log`。
  - **同時開 16 個空轉程序把 CPU 吃滿（變慢）**：6 次中 5 次與 golden 一致、1 次有 1 項差異（面板列雜湊）。**變快會失敗，變慢也會偶爾失敗**，所以不是單純「忙碌」。
  - **把那個 500 ms 改成 1 小時**：8 次全部穩定地「與 golden 不同」（`ethylNoFormula` 42 項、`h1OnlyNoFormula` 70 項差異），證明 golden 是在「500 ms 牆鐘會真的觸發」的條件下錄的，golden 本身內含牆鐘結果。見 `flaky-diagnosis/probe-2-legacy-500ms-raised-to-1h.log`。
- 這違反驗收原則「時間驗收用決定性的步數、秒數只當參考」。

### 修正建議（本階段不實作）
1. 在 `v121GoldenScenarios()` 的情境設定中，同時把 `ENUMERATION_CONFIG.legacySupplement.timeMsPerRun` 和 beam search 的預設時限放大到與 `STEP_ONLY_TIME_MS` 同級，只留 `maxStatesPerRun` 的步數限制；
2. **在未改動的 v1.2.0 程式碼（提交 86e6066）上用同樣的步數設定重新錄 golden**（不是在目前程式上錄），再比對目前程式，這樣「旗標關閉＝與 v1.2.0 相同」的保證仍然成立，而且結果與機器速度無關；
3. 這屬於引擎的測試基礎設施，不在 UI 版（1.2.2）範圍，需要規劃者決定是否另開一版處理；在修好前，這一個測試的失敗不應阻擋 UI 的發佈，但建議每次報告都如實列出。

## 4. 回答「機器忙碌還是行為真的變了」
- **不是介面程式引入的**：`git diff origin/main -- src/engines src/workers src/types` 為空；本分支 5／5 通過；`origin/main` 自己 5 次也失敗 1 次。
- **也不只是機器忙碌**：失敗與 CPU 速度有關（變快或變慢都可能），根因是未關閉的 500 ms 牆鐘預算，會因速度與暖機程度改變步數預算的分配。
- 所以這是**既有的測試穩定性問題（一直存在於 v1.2.1）**，建議另案以上述方式修。

## 檔案
`flaky-diagnosis/runs-5x5-full-file.log`（10 次完整檔案的紀錄）、`probe-1-idle-then-stressed.log`、`probe-1-first-failure-detail.log`、`probe-2-legacy-500ms-raised-to-1h.log`、`probe.test.ts.txt`（探針原始碼；執行方式：複製成 `tests/zzprobe.test.ts`，設環境變數 `PROBE_LOG=<檔案路徑>`，用 `vitest run tests/zzprobe.test.ts`）。
