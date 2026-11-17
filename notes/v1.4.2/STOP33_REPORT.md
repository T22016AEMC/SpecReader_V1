# 第三十三站報告：Q3 根因、套件與個資清理、聲明補齊、刪除遠端備份分支

分支 v1.4.2，本機。沒有升版（仍 1.3.1）、標籤、Release、打包、部署、LICENSE 檔，授權欄位沒動。本機 commit 兩個（程式＋測試、文件），**都沒有推送**。本站唯一的遠端操作是刪除遠端 `v1.4.2` 分支（E 節）。
倉庫內這份不含個資與 NIST 資料；倉庫外的完整版在 `SpecReader/notes/v1.4.2/STOP33_REPORT.md`，原始輸出與暫存腳本在 `SpecReader/notes/v1.4.2/s33/`。

## 先講結論
1. **Q3 的根因在舊的預設程式（v1.2.3 酯 O–CH 閘＋v1 的 IR 涵蓋判斷＋v1.2.3 的 k=1 步數上限），不在旗標後面的新程式。依指示沒有改程式**，只寫位置、原因、影響與建議修法（A.3、A.4）。
2. **依你給的判準，這是缺陷**：同一份 Q3 輸入，目標有沒有被產生取決於「IR 是否確認完整」。但它不是硬排除：把 k=1 的步數上限從 50 萬提高到 300 萬，未確認狀態下目標回到第 3 名（與完整狀態相同）。是「保守地多保留一種讀法」把搜尋空間撐大、在固定步數內跑不到目標。
3. M7（候選 51→158）與 Q3 是**同一個機制**；v121/S3（候選 11→15）是**另一個**（v1.2.0 的醛基讀法刪除，STOP31 表第 4 項）。兩者都與 ¹H 的 0.5 係數、候選卡片區塊**無關**。
4. median-quickselect 已換成自己的實作，逐位元一致（450 個案例的回傳值與就地排列順序都相同），鎖定檔與建置不再含它。
5. 遠端 `v1.4.2` 已刪除；其他分支、main、標籤沒動，本機分支與所有 commit 都在。

## A. Q3 與候選數變動的根因

### A.1 做法
- 暫存腳本（倉庫外）對 Q3、M7、v121/S3 各跑「完整」（`fixtureSpectra`：IR `CONFIRMED_COMPLETE`）與「未確認」（刪掉 IR 的 `observationCoverage`，產品預設），全關旗標，讀 `reasoningTrace.compositionSearch.runs` 的每個分子式的列舉診斷（讀法數、步數、終止原因、候選數）。
- 反事實：**暫時**改 `v12Evidence.irAldehydeContext`，讓「酯羰基狀態」與「醛基刪除」各自（或一起）當作 IR 有涵蓋，在未確認狀態重跑；跑完以 `git checkout` 還原（`git status` 乾淨）。另以暫存腳本把 `V12_CONFIG.v123.round1MaxStatesK1` 提高到 300 萬重跑 Q3（沒有改原始碼）。

### A.2 Q3：目標在哪一步沒被產生
Q3＝2-(4-甲基-3-戊烯氧基)乙醇（C8H16O2），¹H 有一個真的烯 CH（5.10，t，1H），IR 沒有 C=O。

| 分子式（k=1） | 完整：候選／步數／結束 | 未確認：候選／步數／結束 |
|---|---|---|
| C8H16O2（目標） | 245／449,943／**走完**（GRAMMAR_EXHAUSTED） | 68／**500,000**／**步數用完**（ROUND1_STEP_CAP），目標不在 68 個裡 |
| C7H16O2 | 0／269／走完 | 57／65,825／走完 |
| C8H16O（O=1） | 37／106,584／走完 | 相同 |
（k=2、3 的分子式：完整時有兩個走完、四個步數用完；未確認時全部步數用完，都沒有候選。讀法數「alternatives」在兩種狀態相同，差在每個讀法內的選項。）

**逐步的因果鏈**（全部是預設開的舊程式）：
1. `irSignalProcessing.irRangeCovered`（v1 基線）：第一行 `observationCoverage !== 'CONFIRMED_COMPLETE'` 就回 false。產品中永遠是這樣。
2. `sixStepAnalysis.ts:34`（v1.2.0）：`irCoversAldehydeRegion = irRangeCovered(IR, 1680, 1740)` → false。
3. `v12Evidence.irAldehydeContext`（v1.2.3 第三站）：`esterCarbonyl = coversRegion && known ? … : 'UNKNOWN'` → **UNKNOWN**（完整時是 ABSENT：涵蓋且 1700–1780 沒有強帶）。
4. `shiftClasses.classifySignal` 的酯 O–CH 閘（v1.2.3，`ctx.ir.esterCarbonyl !== 'ABSENT'`）：5.10 ppm 落在 `ESTER_O_CH`（4.7–5.3）與 `ACETAL_O_CH`（4.5–5.5）的窗內，且分子式 O ≥ 2（`esterMethine.minOxygen`）→ 兩個類別都加進來，標「延後」（deferred）。完整時這一步整個跳過。
5. `atomInventory`：5.10 的那一組多了「sp3 O–CH（酯／縮醛）」的選項；Q3 是「只能用烯 CH 解釋」的情形（`vinylException`），烯讀法與延後讀法在**第 1 輪同一個步數上限**內一起跑。
6. 步數上限 `V12_CONFIG.v123.round1MaxStatesK1 = 500,000`（v1.2.3，k=1 的分子式）：完整時 C8H16O2 用 449,943 步走完；未確認時多出的 sp3 選項讓搜尋空間變大，50 萬步用完時只找到 68 個候選，目標還沒走到。
7. 結果：目標沒被產生；其他分子式（例如 C7H16O2）多出的候選補進來，總數 153→95。

**反事實確認**（未確認狀態下）：
- 只讓酯羰基狀態當作有涵蓋（ABSENT）：Q3 名次 3、候選 153，**每個分子式的候選數與步數都和完整狀態相同**；M7 也完全恢復（候選 51）。
- 只讓醛基刪除當作有涵蓋：Q3、M7 不變（仍沒產生／158）。
- 兩者都當作有涵蓋：三個樣本的列舉逐項與完整狀態相同；Q3 前 8 名的順序相同，但有幾個分數差 1 分（例如目標 55 對 56）——這是評分層的 STOP31 第 2 項（伴隨帶缺失輕扣），與產生候選無關。
- 不改涵蓋、只把 k=1 上限提高到 300 萬：Q3 目標回到第 3 名（候選 300 個；C8H16O2 用了 2,471,978 步、812 個候選，仍沒走完）。

### A.3 M7、v121/S3 的候選數為何變多；與 STOP31 的關係
- **M7（異戊烯醇，C5H10O）**：5.40 ppm 的烯 CH 落在 `ACETAL_O_CH`（4.5–5.5）窗內 → 同 A.2 第 3–5 步，在 **O ≥ 2 的分子式**多出縮醛讀法：C5H10O2 候選 22→56、C6H10O2 102→247，C9H20O2、C13H28O2 等從「走完、0 個」變成「步數用完」。目標分子式 C5H10O（O=1）不受影響，所以名次不變（5），只是多了一堆含 2 個 O 的候選。**和 Q3 同一個機制**（STOP31 表第 5 項：酯羰基狀態恆 UNKNOWN）。
- **v121/S3（雙酚 A，DMSO-d6，酚 OH 9.20 寬單峰）**：9.20 落在 `ALDEHYDE`（9.0–10.5）窗內；完整時「IR 涵蓋 1680–1740 但沒有強 C=O」→ 刪掉醛基讀法（`shiftClasses.ts` 的 D5，v1.2.0）；未確認時保留。多出的醛基讀法讓組成推斷選了不同的分子式（例如 C22H24O、C16H16O、C23H24O 取代 C22H24O3、C16H16O3、C24H24O3），目標分子式 C15H16O2 的讀法數 11→17、第 2 輪步數同樣用完。**目標沒有丟**；名次 2→1 是因為完整狀態下排在目標前面的兩個環氧異構物，在未確認狀態下沒被產生（第 2 輪的步數被醛基讀法吃掉）——**這不是變好，是對手少了**。這是 **STOP31 表第 4 項**（醛基刪除從不生效），與 Q3／M7 不同機制。
- **與 ¹H 的 0.5 係數（STOP31 表第 7、8 項）和候選卡片的「NMR 科學一致性」區塊（第 12 項）無關**：
  - 0.5 係數看的是 **¹H** 的 `observationCoverage`；`fixtureSpectra` 從不設 ¹H，所以兩種狀態下 ¹H 都是「未確認」，係數在兩邊相同，不可能造成差異。反事實裡只改 IR 的涵蓋判斷就完全重現了完整狀態，也證明這一點。
  - 卡片區塊（`candidateGenerator.ts` 的 `nmrConsistencyAnalysis`）只決定顯示與否，在排名之後才附上，不參與產生或排序。
  - 註：指令括號裡把第 4、5 項寫成「0.5 係數、卡片區塊」，與 STOP31 的表號不同；STOP31 表的第 4、5 項是「醛基刪除」「酯羰基狀態」，正是這次的根因。兩種讀法都回答了。

### A.4 判斷與建議（不改，由你決定）
- **判斷**：依「目標候選被產生不應取決於是否確認完整」，Q3 是**缺陷**。拆開看：第 3–4 步「沒有證據說沒羰基 → 保留酯／縮醛讀法」本身是合理的保守行為（Q3 是 v1.2.3 為 IR 確認無羰基的情境寫的樣本，產品裡那個情境永遠不會成立）；**缺陷在第 5–6 步**：保守多出的延後讀法與烯讀法在同一個步數上限內一起跑，把原本走得完的搜尋擠到跑不完，而且只顯示「未完整」，看不出是誰把步數用掉。M7 是同一機制但沒丟目標；S3 是醛基刪除失效，丟的是對手。
- **位置**（都是 v1.3.1 已出貨的預設程式）：`src/engines/scientificEngines/irSignalProcessing.ts`（`irRangeCovered` 第 1 行）、`src/engines/reasoning/sixStepAnalysis.ts:34`、`src/engines/constraints/v12Evidence.ts:41`、`src/engines/constraints/shiftClasses.ts`（酯 O–CH 閘、醛基刪除）、`src/engines/constraints/v12Config.ts`（`v123.round1MaxStatesK1`、`esterMethine`）。
- **影響範圍**：分子式 O ≥ 2、且 ¹H 有 4.5–5.5 ppm 訊號的樣本（酯／縮醛讀法多出來）；有 IR、且 ¹H 有 9.0–10.5 ppm 訊號的樣本（醛基讀法不刪）。43 個流程樣本裡只有這 3 個不同（每個旗標組合都一樣）。
- **建議的修法**（擇一或組合；我建議 ①）：
  ① **把延後讀法真的排在後面**：「只能用烯解釋」（`vinylException`）的第 1 輪，先只跑非延後的讀法，跑完（或用完自己的步數）才跑延後的酯／縮醛讀法、另給步數。這樣完整狀態走得完的那組讀法，在未確認狀態拿到同樣的步數，目標的產生就不再取決於涵蓋狀態（Q3 的烯讀法完整時用 449,943 步，小於 50 萬）。需要重算黃金檔與 43 樣本。
  ② 提高 k=1 上限（例如 300 萬）：Q3 會回來，但 Q3 的 C8H16O2 一個分子式就要約 247 萬步，牆鐘成本大，且只是把門檻往後推。
  ③ 產品加「確認峰表完整」的控制（STOP31 未決項）：使用者確認後 ABSENT 分支與醛基刪除都會生效；但預設仍是未確認，不解決預設行為。
  ④ 依峰表本身推斷（峰表有標其他強帶、1700–1780 沒有任何標記 → 當作 ABSENT）：等於假設峰表完整，正是未確認的那件事，**不建議**。

### A.5 43 流程樣本重跑（未確認狀態，六組旗標）
（A 沒有改程式，所以沒有「修正後」；B 的 median 取代在匯入鏈上，所以照指示重跑，確認 B 沒有改到任何結果。）

| 組合 | 目標沒產生 | top1 | top3 | top5 | 與全關比：變好／變差／不變 | 與第三十二站同組輸出 |
|---|---|---|---|---|---|---|
| 全關 | 8 | 25 | 31 | 32 | — | 逐位元相同 |
| h1 | 6 | 30 | 37 | 37 | 10／3／30 | 逐位元相同 |
| ir | 8 | 27 | 31 | 32 | 4／0／39 | 逐位元相同 |
| ir2 | 8 | 25 | 32 | 33 | 3／0／40 | 逐位元相同 |
| ir+ir2 | 8 | 27 | 32 | 33 | 5／0／38 | 逐位元相同 |
| h1+ir+ir2 | 6 | 32 | 37 | 37 | 10／3／30 | 逐位元相同 |
（「不變」含兩邊都沒產生目標的樣本，所以和第三十二站表裡的 24／31… 不同；第三十二站只數有被產生的。逐位元相同＝名次、候選數、前 40 名清單含分數全部相同。）
- 變差：只有 `h1` 系的 B1、v121/S2、v121/S3（雙酚 A 型，第 1→3），與第三十二站相同。
- **Q3**：六組都**沒有產生目標**（候選 95）。**M7**：全關／ir／ir2／ir+ir2 第 5 名（候選 158），h1 系第 1 名（候選 125）。**v121/S3**：全關／ir 系第 1 名、h1 系第 3 名（候選 15；第 1 名是因為環氧對手沒被產生，見 A.3）。
- 原始輸出：倉庫外 `s33/S33_FLOW_unconfirmed_*.json`、`S33_FLOW_SUMMARY.txt`。

## B. 清理（只改工作樹，git 歷史沒動）

### B.1 median-quickselect → 自己的實作
- 它不在 `package.json`，是 `jcampconverter → ml-array-median → median-quickselect` 帶進來的。做法：新增 `vendor/median-select/`（`index.js`、`index.d.ts`、`package.json`，依 Wirth／Numerical Recipes 的 quickselect 描述自寫），在 `pnpm-workspace.yaml` 加 `overrides: median-quickselect: link:./vendor/median-select`，`pnpm install --offline` 重寫鎖定檔：`median-quickselect@1.0.1` 的 packages／snapshots 項目刪除，`ml-array-median` 的相依改指本地套件。
- 行為：回傳 rank floor((n−1)/2) 的元素（偶數長度取較小的中間值、不平均），就地重排；空陣列回 `undefined`。比較順序、樞紐選法、交換順序都固定，所以 −0／0、NaN、重複值的結果也一樣。
- 測試 `tests/vendor/medianSelect.test.ts`（7 個）：移除前先用**原套件**對 450 個決定性案例（12 種資料型態 × 25 種長度，含 0、1、2、偶數、4096／4097、Float64Array、Int32Array）錄下回傳值與就地排列的雜湊（`tests/fixtures/vendor/medianSelect.golden.json`），新實作逐案相同；另有手寫邊界、與排序結果比對、相依鏈確實解析到本地套件且 `ml-array-median` 結果相同、`package.json`／鎖定檔不含它。改壞一個比較（`>` 改 `>=`）會讓 2 個測試失敗，已還原。
- 建置：`dist` 的套件清單 16→15 個，沒有 MISSING；`dist/` 全文搜不到 `median-quickselect`。`scripts/append-npm-notices.mjs` 為它寫的查找說明還在（已無作用；`v141NpmNotices` 測試拿它當資料），沒刪。

### B.2 第三方聲明草稿
`notes/v1.4.2/THIRD_PARTY_NOTICES_DRAFT.md`。RDKit 的 npm 包**沒有任何 LICENSE／NOTICE 檔**（只有 3 個 dist 檔＋README，README 寫 BSD-3）。從 WASM 字串確認存在：Boost（`boost::json`、`property_tree`；BSL-1.0）、**InChI 1.07.3**、coordgenlibs、RingDecomposerLib、FreeType（高可信）、**Telex 字型（字型內帶「SIL Open Font License 1.1」聲明）**、Emscripten／libc++abi。zlib、Avalon 只有零星字串，待查；maeparser 等沒有證據。各元件的授權原文都沒在套件裡讀到，草稿逐項標「確定／待查」。其餘 npm 套件沿用第三十二站。

### B.3 個資（先列後改）
| 位置 | 內容 | 改法 |
|---|---|---|
| `notes/v1.2.2/P2_REPORT.md`（1 處）、`notes/v1.4.1/LOCAL_PREVIEW.md`（3 處） | 含使用者名稱的本機路徑 | 改成 `<本機路徑>\SpecReader_V1`；LOCAL_PREVIEW 第一次出現處加一句「`<本機路徑>` 換成你放倉庫的資料夾」 |
| `V1_DEPLOYMENT.md`、`V1_1_DEPLOYMENT.md` | Render 服務 ID、Workspace ID（後者另有 1 個部署 ID） | `<Render 服務 ID>`、`<Render Workspace ID>`、`<Render 部署 ID>` |
| `validation/public-deployment.json`、`validation/v11-release.json` | 同上（JSON 欄位值） | 欄位保留，值改成 `"<Render service ID: not published; see the Render dashboard>"` 等；沒有程式讀這些欄位，JSON 仍合法 |
| `notes/v1.4.1/`、`notes/v1.4.2/RELEASE_CANDIDATE_CHECKLIST.md` | 列出這兩個 ID 的稽核句 | 改成 `srv-…`／`tea-…` 並註明工作樹已改、歷史仍有原值 |
- `render.yaml` 本身沒有服務 ID（只有服務名稱、建置指令、環境變數名），沒改。部署 ID 不在指令清單內，但與服務 ID 同類，一併改了（如不需要可還原）。
- 改完後全工作樹（已追蹤檔）搜使用者名稱與這三類 ID：0 筆。git 歷史沒動。

### B.4 NMRShiftDB2 聲明
- `tests/fixtures/v140/nmrshiftdb2/extraction_stats.json`：最前面加 `notice`（聲明句原文）與 `license`（授權名稱、同目錄全文、URI）兩個欄位，格式與 `h1TruthNmrshiftdb2.json` 的 meta 一致；同目錄 README 的檔案表註明這個欄位。讀它的測試（`v142Nmrshiftdb2.test.ts`）只讀計數，不受影響，另加兩行斷言釘住 `notice`。
- `scripts/nmrshiftdb2/extract_h1.py`：檔頭加聲明句、授權名稱與 URI、授權全文位置；輸出的 `extract_stats.json` 也寫入同樣的 `notice`／`license` 欄位（以後重新抽取時檔案自帶聲明）。合成 SD 的抽取測試（有 Python 時執行，這次有執行）加一行斷言確認輸出有 `notice`。

## C. 面板口徑
今後面板名次以「**平手算輸**」為主要口徑，「平手算贏」只列參考。`STOP32_REPORT.md`（倉庫內摘要與倉庫外完整版）A.3、A.4 改寫：主要數字改成平手算輸，變好／變差數由第三十二站的同一批輸出檔重算（沒有重跑量測）：未確認 `ir` 28 好 6 壞、`ir2` 2／1、`ir+ir2` 30／6（平手算贏時是 14／16、0／2、14／17）。`RELEASE_NOTES_DRAFT.md` 第 3 節「排名與平手」加一條口徑說明（發布說明裡沒有第三十二站的面板數字；第二十七、二十九站的面板數字是當時平手算贏的算法，註明引用時要說明）。

## D. 驗證與提交
- 驗證範圍（依指示不跑全套與 E2E）：
  - `tsc --noEmit`：乾淨。
  - 輕量組：`tests/vendor`、`jcampUnits`、`inputPrecision`、`v141NpmNotices`、`v141DeployedNotices`、`v141ExperimentFlags`、`v142ExperimentFlags`、`v142Nmrshiftdb2`（含有 Python 時執行的抽取測試）、`v142Nmrshiftdb2Full`：8 檔 86 個通過、1 個跳過（Full 需要倉庫外的 SD 檔）。
  - 候選產生／ir／ir2／h1：`tests/v12`（全部）、`tests/enumeration`、`tests/v14`（全部）、`p1bPipeline`、`evidenceGuidedSearch`、`irProcessing`、`irNumericGolden`、`sixStepReasoning`：92 檔 1,657 個，**1 個失敗**、1,655 通過、1 跳過。失敗的是 `p1bPipeline.test.ts` 的「flow (i): diphenylpropane-shaped … the old 48-candidate cap no longer applies」（`expected 41 to be greater than 48`；這個測試接受 `TIME_BUDGET` 結束，候選數受牆鐘影響；當時 92 檔並行，測試總時間 11,034 s 擠在 1,423 s 牆鐘內，同時另有暫存量測在跑完後收尾）。**單獨重跑該檔 10／10 通過**（該測試 17.1 s）。沒有改斷言、沒有調逾時。
  - 建置：`corepack pnpm@11.25.0 run build` 成功，套件清單 15 個、無 MISSING。
  - 43 流程樣本六組：與第三十二站逐位元相同（A.5）。
- 提交（本機，**沒有推送**）：程式＋測試 `a653e7a`；文件 commit 見 git log（本報告、`THIRD_PARTY_NOTICES_DRAFT.md`、STOP32 報告口徑、發布說明／檢查清單、個資改寫的文件與 `validation/*.json`、nmrshiftdb2 README）。
- 倉庫外：暫存腳本 `tests/_scratch/s33Trace.test.ts`、`s33Flow.test.ts`、`mkMedianGolden.mts`（被 git 排除；副本在 `s33/`）。

## E. 刪除遠端備份分支
- 刪除前確認（刪除前一刻再確認一次）：遠端分支 13 條（claude-mode、feat/v113-six-step-reasoning、fix/v11-evidence-guided-search、fix/v11-explicit-analysis-observation-inputs、fix/v11-ir-image-calibration-environments、main、v1-baseline-e190a8d、v1.1-scientific-core、v1.2.2-ui、v1.2.3、v1.3.0、v1.3.1、v1.4.2）；`gh pr list --head v1.4.2 --state all`：**0 個 PR**（含已關閉、已合併）；遠端 v1.4.2 = `11e7a58`，是本機 HEAD 的祖先（本機較新，多 7ccef6f、4048f37、a653e7a）；遠端沒有標籤。
- 執行：`git push origin --delete v1.4.2` → `[deleted] v1.4.2`。沒有碰其他分支、main、標籤。
- 刪除後：`git ls-remote --heads origin` 已無 v1.4.2，剩 **12 條**：claude-mode、feat/v113-six-step-reasoning、fix/v11-evidence-guided-search、fix/v11-explicit-analysis-observation-inputs、fix/v11-ir-image-calibration-environments、main、v1-baseline-e190a8d、v1.1-scientific-core、v1.2.2-ui、v1.2.3、v1.3.0、v1.3.1。本機 `v1.4.2` 分支與所有 commit 都在（追蹤狀態顯示 `origin/v1.4.2: gone`）。
- 提醒：倉庫仍是公開的；刪掉分支不會刪掉 GitHub 上已存在的 commit 物件快取，也不影響別人已抓下的副本。

## 需要我決定的事
1. **Q3 的修法**（A.4）：要不要改？選哪一種（我建議 ①「延後讀法真的排在後面、另給步數」；② 提高 k=1 上限；③ 加「確認峰表完整」控制；④ 不建議）。改的話是舊預設程式，會動到 v1.3.1 已出貨的行為與黃金檔，需要另一站。
2. **S3 的醛基讀法**（STOP31 表第 4 項）：IR 未確認時保留 δ9–10.5 的醛基讀法、因而吃掉對手的步數——要不要一起處理（同 ① 的思路，或等「確認完整」控制）？
3. **個資改寫**：部署 ID 不在你的清單內，我也改了；要保留還是還原？`render.yaml` 本來就沒有 ID，沒改。
4. **RDKit WASM 第三方元件**：要不要我去讀 RDKit 上游倉庫（`license.txt`、MinimalLib 建置腳本、External 子目錄）把「待查」逐項確認（InChI 1.07.3、coordgenlibs、RingDecomposerLib、FreeType、Emscripten／musl）？Telex 字型（OFL 1.1）要不要在正式聲明另附全文？
5. `scripts/append-npm-notices.mjs` 裡為 median-quickselect 寫的查找說明（已無作用）：正式整理時刪除，還是保留作紀錄？
6. 第二十七、二十九站報告裡的面板數字是「平手算贏」：要不要也改寫成平手算輸（需要從那兩站的輸出檔重算，不重跑量測）？
7. 第三十二站留下的未決項仍待你決定：倉庫公開與歷史（email、Fulmer 整表轉錄）、SDBS／Reich／Pretsch／Coates 條款、nmrshiftdb2 頁尾聲明、專案 LICENSE（Apache-2.0？）、旗標預設。
