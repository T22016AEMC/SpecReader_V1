# V1.1.4 — Mode A 路徑地圖與基準評測工具（P0）

基準 V1.1.3（`1866a29`），開發分支 `claude-mode`。**本版只新增文件與評測工具，沒有修改任何科學邏輯、Mode A／Mode B 引擎、UI 行為或既有測試的預期值。**

新增：

- `docs/MODE_A_PATH_MAP.md`：Mode A 正式路徑地圖。依實際 import 與 V8 執行追蹤整理七個階段的檔案與函式、不在正式路徑的檔案、Mode B 使用的檔案（後續階段不得修改）、各模態預測函式的位置，以及追蹤過程中發現與預期不符之處。
- `docs/BENCHMARK_FORMAT.md`：基準案例格式與使用方式（benchmark 資料夾在倉庫外，附同內容的 `benchmark\README.md`）。
- `scripts/benchmark/run-benchmark.mts` 與 `scripts/benchmark/benchmarkLib.mts`，`package.json` 新增 `pnpm benchmark`：
  - 透過正式入口 `executeSixStepAnalysis` 評測；每案例跑 `noFormula`（主要指標）與 `withFormula`（`extraInput.molecularFormula`）兩個條件。
  - 預設以狀態數為預算（`maxStates=120000`，`timeMs=600000` 僅作安全上限）以利重現；`--ui-budget` 改用正式 UI 的 12 秒預算。
  - 數值光譜走 `SpectrumParser.parseUploadedFile`（與 UI 上傳同一條路徑）；峰表 JSON 比照 `tests/fixtures.ts` 以人工標峰進入；圖片型光譜列為「需人工轉成峰表」並略過。
  - 以 RDKit 去除立體資訊後比對答案；記錄正確結構名次、候選數、正確分子式名次、終止原因、展開狀態數、耗時與錯誤；匯總 top-1／5／10、找到率與正確分子式找到率，依條件與模態組合分組。
  - 完整結果寫到 benchmark 資料夾外的 notes；倉庫內只寫不含光譜數值的匯總 `validation/benchmark/summary-v<版本>.md`。
- `tests/benchmarkHarness.test.ts`：以程式內建的 synthetic 小案例驗證格式讀取、條件切換、SMILES 比對、匯總計算與報告產生；synthetic 案例只寫在系統暫存資料夾，不計入準確率。

變更：

- `package.json` 版本 1.1.3 → 1.1.4。`server.ts` 內寫死的 `/api/health` 版本字串仍為 `1.1.3`（P0 不修改 `server.ts`）。

驗收：`pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm test:e2e` 結果見 `notes\v1.1.4\P0_REPORT.md` 與 PR 說明。
