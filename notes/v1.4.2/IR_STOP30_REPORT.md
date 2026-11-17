# v1.4.2 第三十站：負向證據子旗標拆分、末端炔補樣本、JCAMP YUNITS、IR 第三輪設計（結果摘要）

分支 v1.4.2，本機，未推送、未升版、未打包、未部署。**本檔不含 NIST 譜圖或峰表**（NIST 資料只在倉庫外 `SpecReader/data/nist_ir_s30/`，腳本與原始輸出在倉庫外 `SpecReader/notes/v1.4.2/s30/`）。倉庫內的新測試檔全部用合成資料。

## 0. 先講最重要的發現：產品裡沒有「確認峰表完整」
寫 C 的介面提醒時發現：**沒有任何產品程式碼把 IR 的 `observationCoverage` 設成 `CONFIRMED_COMPLETE`**。只有測試的 `fixtureSpectra` 會設；`observationSemantics.ts` 預設 `PARTIAL_MARKERS`；介面（`App.tsx`、`components/`、`ui/`）沒有任何按鈕或選項改它；git 歷史裡也沒有出現過這樣的控制（這個欄位在 1927ee3 加進型別與 `irRangeCovered` 時就只有讀取端）。後果：
- 負向證據的資料閘 G2 在產品裡**永遠關**——就算 `?exp=ir2neg` 也不會扣任何分。第二十五至三十站量到的誤殺率、效用，都是「如果使用者能確認完整」的假設情境（驗證腳本用 `fixtureSpectra`，會設成完整）。
- `IR:coverage` 缺帶項同樣永遠不觸發；¹H 的雙向扣分也永遠走「涵蓋未確認、扣分減半」。
- **所以 C 的介面提醒「放在『確認峰表完整』按鈕附近」沒有地方放，這一項沒有做**（加按鈕是新的介面控制，依慣例要先出設計給你審）。列入「需要你決定的事」第 1 項。

## A. 負向證據子旗標拆成三個（完成；預設全關，行為逐位元相同）
- **設定**（`v12Config.ts`）：`v142IR` 新增 `negNitrile`、`negNitro`、`negAlkyne`，預設 false。某一組的規則開著＝`useV142IR` 且（`negativeEvidence` 或該組旗標）。`negativeEvidence` 保留，意思是「三組一起開」。
- **判斷**（`planningGate.ts`）：新函式 `v142NegRuleActive(id)`；`v142NegativeEvidenceActive()` 改成「三組任一開」——只用總旗標時，與原本的定義完全相同。
- **評分**（`negativeEvidence.ts`、`evidenceLedger.ts`）：只評開著的規則；閘門 G1 的窗也只取開著的規則（總旗標開時＝全部規則，與原本相同）；單一候選上限 0.20 只在開著的規則間分配。`IR:coverage:2100-2300` 的跳過改成跟腈規則走（這一項本來就從不觸發，行為不變）。
- **開關**（`experimentFlags.ts`）：新增 `?exp=ir2neg-nitrile`、`?exp=ir2neg-nitro`、`?exp=ir2neg-alkyne`，可與其他名稱用逗號組合；**`?exp=ir2neg` 行為不變**。三個單組同時開時回報成 `ir2neg`。
- **診斷摘要**（`diagnosticSummary.ts`）：任一組開時，在「已啟用實驗功能：…」下面多一行，例如 `負向證據（IR 第二輪）：腈 關／硝基 開／末端炔 關`；都沒開就沒有這一行。第一行的標籤：單組開時是 `IR 第二輪（負向證據：硝基）` 這種寫法；`ir2neg` 的舊標籤不變。
- **新測試**：`tests/v14/v142NegSplit.test.ts`（9 個）：三個旗標的預設；每種組合下哪條規則有效；全關／父旗標關時帳本逐位元相同；**只開其中一組時，另外兩組的候選（各 3 個）與對照組（4 個）在 4 張探針表上的帳本與全關逐位元相同**；三組單開＝總旗標（含兩基團候選與上限）；兩基團候選只拿開著那組的扣分；`IR:coverage` 釘值。`tests/v14/v142ExperimentFlags.test.ts` 新增 6 個（新名稱的解析、單組開的設定與回報、`ir2neg` 不變、兩行診斷文字、主執行緒傳給 Worker、Worker 端套用）。
- **受影響的既有測試：0 個失敗**。改了兩個既有測試檔的輔助部分（不是期望值）：`v142ExperimentFlags.test.ts` 的 `DEFAULTS` 補三個新鍵（讓 `restore()` 也重設它們）；`tests/helpers/v142Probe.ts` 的 `setV142` 預設也重設三個新鍵。

## B. 末端炔凝相樣本（取得 0 個新的凝相譜）
- **已試過、這次不重試**（第二十七／二十九站，選譜規則的結果）：1-己炔（只有氣相）、1-庚炔／1-辛炔／苯乙炔／1-乙炔基環己醇／2-甲基-3-丁炔-2-醇（凝相，已計入 6 個）、4-乙炔基甲苯（NIST 頁面沒有 IR）、3-丁炔-1-醇與丙炔酸甲酯（只有氣相）。名單上這 9 個都在其中。
- **新試 7 個**（`compounds30.py`、`fetch_nist30.py`，同第二十七／二十九站規則：自訂簡短 User-Agent、每次請求間隔 1.5 秒、分子式與名稱核對，沒有被擋或限流）：

| 檔 | 化合物（NIST 名稱） | NIST ID | 結果 |
|---|---|---|---|
| alkyne_t23 | 1-Propyne, 3-bromo-（炔丙基溴） | C106967 | **只有氣相** |
| alkyne_t24 | 1-Propyne, 3-chloro-（炔丙基氯） | C624657 | 頁面沒有 IR |
| alkyne_t25 | Propiolic acid（丙炔酸） | C471250 | 頁面沒有 IR |
| alkyne_t26 | Propargylamine（丙炔胺） | C2450717 | 頁面沒有 IR |
| alkyne_t27 | Benzene, 1-ethynyl-4-methoxy- | C768605 | 頁面沒有 IR |
| alkyne_t28 | 3-Butyn-2-one | C1423605 | **只有氣相** |
| alkyne_t29 | Cyclohexene, 1-ethynyl- | C931497 | 頁面沒有 IR |

五個「沒有 IR」都以 ID 直接開頁再確認一次（頁面沒有任何 IR 區塊）。
- **末端炔凝相總數：仍 6 個**（第二十七站 6＋第二十九站 0＋第三十站 0）。**其中 3 個含 O–H**（炔丙醇、1-乙炔基環己醇、2-甲基-3-丁炔-2-醇），第二十九站起被炔規則豁免，所以**真正測到炔規則的凝相樣本只有 3 個**（1-庚炔、1-辛炔、苯乙炔）。名單裡的丙炔酸、丙炔胺即使取得也一樣會被豁免。
- **完整表誤殺率**（三站合併，末端炔全部 20 個化合物×A、B 兩張表＝40 張；ir141＋ir2＋負向證據，以及只開 `negAlkyne`；`S30_ALKYNE_TARGETS.txt`）：**誤殺 0／40**（A 表 0／20，其中凝相 6、閘開 6；B 表 0／20）。只開 `negAlkyne` 的分數與三組全開逐筆相同。新的 2 張氣相譜：A、B 都沒被扣（炔丙基溴 B 表閘關 MISSING_STATUS）。
- 新 2 譜的候選池：整套流程只產生 2–3 個候選，目標都是第一名，池內沒有可比較的末端炔對手（`S30_POOL.json`）；**這部分沒有資訊量**。
- **各組可否預設開的建議**（標準：該組凝相 ≥10 且完整表誤殺 0）：

| 組 | 凝相 | 完整表誤殺 | 標準 | 建議 |
|---|---|---|---|---|
| 腈 | 12（第二十九站） | 0 | 達標 | **可以考慮預設開，但先解決第 0 節**：產品裡沒有「確認完整」，開了也不會觸發 |
| 硝基 | 11（第二十九站） | 0 | 達標 | 同上；另外候選產生器產不出硝基（第二十九站），規則在整套流程內的效用量不到 |
| 末端炔 | 6（有效 3） | 0 | **不達標** | **維持預設關** |

## C. JCAMP YUNITS 與介面提醒
用合成檔實測（`s30Yunits.test.ts`，倉庫外；輸出 `S30_YUNITS.txt`）：每種寫法都和「正確標示的同一張譜」比較——讀檔後的峰、分析用的峰、5 個候選的 IR 分與帳本、`irRangeCovered`，以及觀測表顯示的「基線相對強度」。分「讀進來的樣子」（產品實際狀態，未確認完整）與「假設已確認完整」兩種。

| 寫法 | 峰 | 分數（產品實際狀態） | 假設已確認完整 | 判定 |
|---|---|---|---|---|
| ① TRANSMITTANCE 但值 0–100 | 與 0–1 檔**完全相同** | 5／5 帳本相同 | 缺帶判斷全不做（`irRangeCovered` 全 false）；只有苯乙炔候選不同：56.75 對正確檔 55.91（涵蓋判斷不同，2230 峰的相容度 0.650 對 0.585）——方向是**錯誤標示的檔分數略高（少扣）**，其餘 4 個帳本相同 | **保守，不改**；但觀測表「基線相對強度」顯示成 1−y（例如 −38.21，正確應為 0.61），**這是顯示錯誤**，不進分析 |
| ② TRANSMITTANCE 基線略大於 1 | **完全相同** | 5／5 相同 | 同上，少扣 | **保守，不改** |
| ③ ABSORPTION（值是吸光度），一般譜 | **完全相同**（中位數推斷方向推對了） | 5／5 相同 | 同上 | — |
| ③ ABSORPTION，大範圍高平台（600–3900 吸光度 1.5、兩端接近 0；為了讓中位數偏高而構造的） | **全錯**：方向被推成向下，9 個峰全落在真實帶之間（722、992、1140…） | 苯甲腈候選 30.09 對正確 47.39、甲苯 26.22 對 43.12 | — | **得到錯峰 → 修正** |

- **修正**（預設生效）：`resolveIRScale`（`irSignalProcessing.ts`）把含「absorp」的單位字串（ABSORPTION、absorptance、% ABSORPTION）也判成吸光度（方向向上）。同一函式也用在 CSV／TXT 的欄名，欄名寫「Absorption」的數值檔也一樣受益。
- **新測試**（`tests/jcampUnits.test.ts` 新增 3 個，合成檔）：單位字串的判定（ARBITRARY UNITS 仍是 UNKNOWN）；高平台譜標 ABSORPTION 與標 ABSORBANCE 的峰相同、帶在預期位置；① ② 的峰與 0–1 檔相同（釘住「不改」的現況）。**對照**：把修正拿掉，前兩個新測試失敗（判成 UNKNOWN、峰全錯），第三個照樣過。
- **受影響的既有測試：0 個**（沒有既有測試用到「ABSORPTION」字串）。
- 沒改的寫進 `KNOWN_LIMITS.md` 第 14 節：①② 的保守行為、① 的顯示錯誤、其他 UNKNOWN 單位仍靠推斷、以吸收百分比寫的 ABSORPTION 檔強度比例不同。
- **介面提醒：沒有做**（見第 0 節）。

## D. IR 第三輪設計報告
`notes/v1.4.2/IR_ROUND3_DESIGN.md`（只讀，沒有改程式）。a–h 每項都寫了目前缺什麼、文獻（書目確定；**表號頁碼一律標待查**）、建議規則、影響、風險、驗證方法（隨機峰誤解釋＋留出名單，名單沒有下載）；第 2 節是順序、旗標與驗收標準；第 4 節是 9 項待決定事項。

## E. 驗證範圍（只跑 A、C 相關測試；沒跑全套與 E2E）
- **預設設定**（15 檔）：`jcampUnits`、`inputPrecision`、`irProcessing`、`irPiecewiseCalibration`、`irRecalibrationPeaks`、`v142NegSplit`、`v142NegativeEvidence`、`v142AlkeneOOP`、`v142Ir2Snapshot`（含 43 樣本整套流程名次）、`v142ExperimentFlags`、`v141ExperimentFlags`、`v141Sp2CH`、`v141FlagOnSnapshot`、`v132MultiBand`、`v142Ir2Samples`：**279 個全過**。
- **全開設定**（`vitest.flagon140.config.ts`，10 檔：`v132MultiBand`、`v141ExperimentFlags`、`v142ExperimentFlags`、`v141Sp2CH`、`v142NegativeEvidence`、`v142NegSplit`、`v142AlkeneOOP`、`jcampUnits`、`inputPrecision`、`irProcessing`）：第一次 141／142，**失敗的是我新寫的 `v142NegSplit`「原始碼預設」測試**（讀的是執行期的 `negativeEvidence`，全開設定本來就把它打開）；改成讀原始碼（與 `v142Ir2Snapshot`、`v142AlkeneOOP` 的預設釘值同一做法）後，`v142NegSplit` 在預設與全開下都 9／9 過。其餘 9 檔沒有失敗。
- `tsc --noEmit`：沒有錯誤（第一次跑時唯一的錯誤在倉庫外暫存腳本 `tests/_scratch/s30Panel.test.ts`，移除後乾淨）。
- 原始輸出：`s30/RELATED_default.log`、`RELATED_flagon.log`、`NEGSPLIT_default.log`、`NEGSPLIT_flagon.log`、`TSC.log`。

暫存測試 `tests/_scratch/s30*.test.ts` 已複製到倉庫外 `s30/` 後從工作樹移除（`tests/_scratch/` 本來就不在版本控制內）。

## 需要你決定的事
1. **IR「確認峰表完整」沒有設定點**：要不要加這個控制（先出介面設計給你審）？加了之後負向證據、`IR:coverage`、¹H 雙向扣分的「完整」才會在產品裡生效；C 的提醒文字也才有地方放。若不加，負向證據要不要乾脆標成「目前產品中不會觸發」。
2. 負向證據預設：腈、硝基達標、末端炔不達標。要不要只把腈（或腈＋硝基）預設開（在 1 解決之前開了也不會觸發）。
3. 末端炔凝相樣本：NIST 連續兩站取不到（16 個名字全是氣相或沒有 IR），而且含 O–H／N–H 的樣本被豁免、不算有效樣本。要換來源（例如 SDBS，需要先讀授權）、用你的真實譜，還是調整標準（例如只算有效樣本、或接受氣相）。
4. JCAMP ①「TRANSMITTANCE 配 0–100」在觀測表顯示錯的「基線相對強度」：要不要修（例如值大於 1.5 就當百分比）。修了也會讓這類檔的缺帶判斷打開（在 1 解決之後才有實際影響）。
5. IR 第三輪設計報告第 4 節的 9 項（順序、驗收上限、書目頁碼要不要逐項查、二氯甲烷那一筆指的是哪個、硝基產生器旗標的位置等）。
