# v1.4.3 分子式篩選修正（旗標 useV143Select）

分支 v1.4.3（從 v1.4.2 標籤開）；不升版號、不推送、不碰 package.json。

## 1. 結論
- **BPA-A：修改前 C15H16O2 沒進搜尋名單（OXYGEN_VARIANT_LIMIT），修改後進（第 2 順位）。** 完整分析：雙酚 A 修改前找不到（7 個候選），修改後第 3／17（已知取捨，丁烯異構物分較高）。
- BPA-B：修改前就進（第 2 順位），修改後仍第 2；雙酚 A 都是第 3／19。
- BPA-C：修改前進（第 2 順位），修改後仍進，**但掉到第 11 順位（名額 12，差一格）**。原因是第 3 件事（見第 6 節）。BPA-C 的目標式 H=16 對 ¹H 總和 7 是 k=2、e=2，不是 BPA-A 那種 e=0。
- 對甲酚（P1、P2）與 PMA（M1、M1b）：搜尋順位與完整分析名次修改前後相同（皆第 1）。

## 2. 前後對照（第一層＝分子式表，第二層＝完整分析，步數預算、不用牆鐘）
| 樣本 | 目標式 | 修改前：被搜尋／順位 | 修改後：被搜尋／順位 | 第二層名次 前→後 |
|---|---|---|---|---|
| BPA-A（DMSO-d6，9.19 s） | C15H16O2 | 否（OXYGEN_VARIANT_LIMIT） | 是／2 | 找不到→3（共 17） |
| BPA-B（9.19 br s） | C15H16O2 | 是／2 | 是／2 | 3→3（共 19） |
| BPA-C（無 9.19） | C15H16O2 | 是／2 | 是／11 | 未跑 |
| BPA-D（CDCl3） | C15H16O2 | 否（OXYGEN_VARIANT_LIMIT） | 否（H1_INFEASIBLE） | 未跑（只記錄） |
| 對甲酚無 OH（P1） | C7H8O | 是／1 | 是／1 | 1→1（候選 12→9 個） |
| 對甲酚有 OH（P2，br s 4.7） | C7H8O | 是／1 | 是／1 | 1→1 |
| PMA（M1） | C6H12O3 | 是／4 | 是／4 | 1→1 |
| PMA（M1b） | C6H12O3 | 是／4 | 是／4 | 1→1 |
名次＝平手算輸。第二層用 `SHAPE_BUDGET`（只有步數）而不是 BISECT 的產品時鐘，所以和 BISECT 的名次不保證逐位相同；每格只跑一次。BPA-D 在 CDCl3 下 9.19 單峰不在 OH 窗（0.5–6 ppm、>10 ppm），C15H16O2 本來就不可行，不當失敗。

## 3. 「可交換 H 範圍」規則（一句話）
¹H 表有一個非溶劑峰「被標為可交換，或位移 >10 ppm，或是落在該溶劑 OH 窗（DMSO-d6 4–12、CDCl3 0.5–6，沿用 exchangeableSingletRange）的單峰，**且位移高於 ARO_CH 上限 8.5 ppm**」時，不論有沒有標寬都不啟用漏列加回。
**我加了「>8.5 ppm」這個條件，是對你的規格的偏離**：沒有它，CDCl3 的任何 CH3 單峰（2.3 ppm）或 DMSO 的環上單峰都算「已列出 OH」，會讓沒有 OH 峰的樣本（P1）誤關加回。結果是 CDCl3 的酚 OH（約 4.7）不算已列出、維持舊行為。要不要拿掉這個條件由你決定。

## 4. 改動
- `src/engines/composition/searchPlanning.ts`：①分組挑代表前先做 ¹H 可行性（每式一次、快取；每個 O 數取最高分的**可行**式，e>0 變體與無 N 變體也只從可行式挑；整組都不可行才整組丟，標 H1_INFEASIBLE）；②③planScore。名額分配、O 變體上限、k 輪流、12 個名額都沒動。
- `src/engines/composition/functionalGroupBounds.ts`：新增 `listedExchangeableSignal`。
- `src/engines/composition/planningGate.ts`、`src/engines/constraints/v12Config.ts`：旗標 **useV143Select（預設 true）**，`v143SelectActive = planningActive() && useV143Select`。
- 測試：`tests/v12/v143Select.test.ts`（11）、`tests/helpers/v143Bpa.ts`（合成樣本，只有數值）；`tests/helpers/v142PreDefaults.ts` 加一行 `useV143Select: false`（既有的旗標關閉 golden 用它還原舊預設，沒改任何期望值）。
- 旗標關閉：碰到 planFormulaSearch 的 golden 檔有 **v123Baseline（35）、v130Baseline（15）、v131Baseline（13）、v132Baseline（44）**，全過（我用暫時計數確認；legacyGolden 2、v121FlagGolden 13 不呼叫它，也都過）。

## 5. 跑了哪些測試
v121Planning 27／27、v121bPlanning 12／12、v123Nitrogen 13／13、v143Select 11／11、**v121cPlanning 19 個中 17 過、2 失敗**。其他全套、E2E、建置都沒跑。typecheck 過。

## 6. 失敗與要你判斷的事（期望值都沒改）
兩個失敗都在 `tests/v12/v121cPlanning.test.ts`，都來自第 3 件事：
1. 「S2: the search list carries formulas with extra exchangeable H」（第 57 行）：斷言 k=2 的每個被搜尋式都是 e=2。新規則下 e=0 的式也進名單。
2. 「with hidden-exchangeable evidence the order key does not charge …」（第 76 行）：合成分數把 e=2 少 0.6（全額），但 ¹H 表未確認完整時真實分數只少 0.3；加回改成 0.3 之後 e=0 排第一，不再是舊斷言的順序。
原因：`scoreComposition` 在 ¹H 表未確認完整時 e 只扣 0.3×0.5，舊 planScore 卻加回完整 0.3，等於讓 e>0 多得 0.15／個。我把 planScore 改成「加回＝實際扣掉的量」（同係數），所以 e=0 與 e>0 平手，再由 DBE 過量、C、H 決定。你的指示是兩邊一致；另一種做法是改 scoreComposition（全域影響，超出這次範圍，沒做）。副作用就是 BPA-C 的目標式從第 2 掉到第 11，以及上面兩個舊斷言。
另：可行性檢查變多（BPA-A：84→180 次、約 67→224 ms；其他樣本 ≤130 ms）。

---
# 第二輪（撤回加回量改動＋發布前驗證）
- **撤回**：planScore 的漏列加回維持 v1.4.2 的完整 0.3×e，沒動組成分數。保留：可行性先於代表、「¹H 表已列可交換峰（含 >8.5 ppm 條件）不啟用加回」、旗標 useV143Select（預設 true）。commit 2e8d434；版本 1.4.3＝7021a14。
- **重跑同一批樣本**（步數預算，flag on；順位＝第一層名單順位，名次＝第二層、平手算輸）：
| 樣本 | 目標式 | 修改前（v1.4.2）順位／名次 | 現在 順位／名次 |
|---|---|---|---|
| BPA-A | C15H16O2 | 不在名單／找不到 | 2／3（共 17） |
| BPA-B | C15H16O2 | 2／3 | 2／3 |
| BPA-C | C15H16O2 | 2／— | 2／3（共 13） |
| BPA-D（CDCl3） | C15H16O2 | 不在名單 | 不在名單（H1_INFEASIBLE）／找不到 |
| P1、P2 | C7H8O | 1／1 | 1／1 |
| M1、M1b | C6H12O3 | 4／1 | 4／1 |
  停止條件未觸發：BPA-C 在前 3、舊樣本沒有變差。
- **v121cPlanning 兩個失敗**撤回後都回到通過（第 57、76 行），沒有改任何斷言。規劃測試 v121Planning 27、v121bPlanning 12、v121cPlanning 19、v123Nitrogen 13、v143Select 11 全過。
- **已知限制**：CDCl3 下 4–6 ppm 的尖銳酚 OH 不算「已列出」，維持 v1.4.2 的行為（寫在 `V12_CONFIG.useV143Select` 註解與 RELEASE_NOTES.md）。
- **發布前驗證**（使用者指示不跑全套，只跑相關檔）：全套（139 檔、單一工作程序）跑到 6 個檔、0 失敗時依指示停止（見 CHECKPOINT.md）；改跑「會走到 planFormulaSearch／分子式篩選」的 52 個檔（靜態搜尋：直接 import planFormulaSearch／useV143Select／generateForCompositions／executeSixStepAnalysis，或 import 走完整流程的 helper；排除已通過的 6 檔）：**52 檔 870 測試全過**，4 個工作程序並行，1033 s。建置通過（dist 2026-11-18 23:26）；E2E **39／39**（4.7 分）。
- **單一工作程序的原因**：第一輪我用專案的 `test` 腳本（`vitest run --maxWorkers=1`）跑全套，沒有覆蓋它；這個設定是專案原有的（RDKit WASM 記憶體與耗時型測試的穩定性），不是機器只有一個核心（16 個邏輯處理器）。這次改 4 個並行，沒有出現因並行造成的失敗。
