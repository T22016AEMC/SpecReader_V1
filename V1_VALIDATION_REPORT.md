# V1 工程與科學驗證

日期：2026-10-13。工程測試、合成規則測試、公開實測及未驗證項目分開。本報告不宣稱任意分數是結構正確機率。

## V0 基準與失敗紀錄

原 V0 两組 22 項測試：14 通過／8 失敗；原 TypeScript 檢查失敗，原 production build 通過。記錄於 `validation/phase0-baseline-results.json`（原始詳細 log 留本機）。主要失敗是 ¹³C 候選評分 ReferenceError 與型別／欄位契約不一致。原測試未删除／skip；相對積分由分子式自行校準的舊期望改為化學合理的「無法確認絕對氫數」，並保留測試目的。

初次 Render 部署失敗是 pnpm 11 build script 政策；加入顯式 allowBuilds 後基準 LIVE。Mode B 擴充初次 typecheck 失敗與一項可觀測性測試失敗均留在階段 JSON，修正後才發布。

## 工程／合成測試

各階段保存 `validation/*-results.json`，命令 `node scripts/check-phase.mjs <phase>` 依序跑資源、strict TypeScript、全部 Vitest、Vite 與 Express build。最新通過數與時刻以 `release-final-results.json`／發布後更新紀錄為準。

已測：原 22 項回歸、¹³C 排名不崩潰、IR T／%T／吸光度／覆蓋／基線／峰寬、相對積分尺度不變與 J 相容、DEPT／APT、實測 ppm 不歸零、常見正負加合／多價、自然同位素、同式不同碎片排名、原始峰去重／總分重建、六模態無分子式正式 Mode A、分子式單獨、63 種光譜組合、十二種結構 Mode B／六種單獨預測／等價 SMILES、非法結構、合法離子、輸入質量／電荷錯誤隔離、JCAMP 解壓與 HRMS 精度、NMR 多筆標注、API 頻率／大小／JSON。

測試化合物：ethanol、phenol、acetone、ethyl acetate、benzoic acid、benzaldehyde、aniline、acetamide、ethylene glycol、diethyl ether、pyridine、acetic acid。這些多數是圖與合成峰測試，**不是十二種實測光譜都已驗證**。

桌面 Chrome 正式伺服器基準及六模態 Mode B 已實際通過；本轮增加 CSV／人工標峰／三頁流與排名。最終本機／公開網站結果另以 `validation/public-smoke.json` 與 E2E 結果更新，不把早期基準的成功當成最終版本驗收。

## 公開實測 IR 配對比較

來源：NIST SRD 69 四份氣相 index 0 記錄：ethanol、phenol、acetone、ethyl acetate。各 880 點，Absorbance。資料 URL、狀態、SHA-256 見 `validation/measured-ir-manifest.json`；真實資料快取在 V1 外，不提交原始波形。十個官能基類別的 micro 指標採人工結構標籤；所有輸出該類別均算陽性，包括低可信競爭假設，因此刻意沒有只挑正確答案。

|方法|TP|FP|FN|Precision|Recall|F1|
|---|---:|---:|---:|---:|---:|---:|
|V0 原始 JCAMP → 判讀|0|0|5|0*|0|0|
|V0 判讀＋同一 V1 解碼／峰值|0|0|5|0*|0|0|
|V1 JCAMP → 判讀|4|3|1|0.5714|0.8000|0.6667|

*沒有任何陽性輸出時 precision 定義分母為零，本腳本以 0 的計算慣例記錄，不能解讀為有量測 precision 的樣本。V0 原始流程讀出 0 點，核心比較是輸入流程修復；第二列還受到 V0 未正規化尺度限制，且使用 V1 峰值，不是獨立端對端 V0。不得把這結果稱為普遍「V1 準確率提升 66.67%」。

已看到的限制：ethanol 誤報羧酸；acetone 的酯候選誤報；phenol 只被 Alcohol 泛用假設包含而沒有專屬 Phenol 類別，造成一個漏報及另一個類別誤報。其他不在十類標籤中的指紋假設沒有納入本指标，完整輸出保留 JSON。此為四份便利／開發樣本，無信賴區間或盲測分割，不代表不同相態、溶劑或儀器。

Mode B IR 與同一實測的模型相容分亦保存，但這不是完整振動波形／強度误差，不作準確率證據。

重現（PowerShell）：
```powershell
$env:MEASURED_DATA_DIR='../v1_dev_records/measured_data'
$env:V0_ROOT='../audit_workspace/V0_review'
pnpm test:measured
```

其他環境將這兩路徑設為資料快取與原 V0 解壓目錄；先安裝原 V0 自己的依賴，不能修改 V0。若未设 V0_ROOT，V0 指標為 null。無快取者經遵守 NIST 資料使用條款可執行 `pnpm test:measured --download`；雜湊不符則停止，不混入不同資料版本。

## 尚未驗證的指標與後續方法

|指標|本輪狀態|可重現驗收設計|
|---|---|---|
|IR precision／recall／F1|四份便利樣本，有限|多相態／儀器、固定分子留出集，區分競爭假設／確定判讀，micro／macro 與 bootstrap|
|¹H 環境／片段|合成規則，無實測准确率|來源峰表／FID、溶劑／溫度／J 與相對積分，分子留出精確／部分匹配|
|¹³C MAE／RMSE|未取得獨立實測配對|以已指認等價原子對齊，不以預測作 ground truth；記錄 coverage 与误差|
|MS formula／adduct|精確常數／合成測試|實測 HRMS、電荷、加合／偏差記錄；Top-k formula 與歸屬准确率|
|MS/MS 碎片匹配|圖／合成相容，未實測|固定前驅、極性、離子化／CE，獨立譜庫；precision／recall 與一對一匹配|
|ToF-SIMS|合成表面片段，未實測|相同基底／矩陣／束流條件的已知樣品，正負極性分開；不可用 ESI 代替|
|Mode A Top-1／Top-5|未實測|同候選集合與真實结构，含候選缺失率、並列政策、無式／各單模態／任意組合|
|Mode B 波形／強度|未證明|相態／條件匹配，峰位 MAE 與匹配覆盖；示意強度不作物理预测误差|

V0／V1 使用同資料、同 truth、同候選集合／容差，原失敗計為流程失敗而不當作錯誤化學預測；學習／校準資料與驗收分子分開。任何高精度模型在完成此程序前不得宣稱充分科學驗證。

發布前補充：SheetJS 更新後新增實際 xlsx 回歸；檔案上限 12 MB、單一數值／JCAMP 50,000 點，避免巨大宣告／過量資料導致瀏覽器計算失敗。最終發布檢查以 release-final-checked-results.json 為準，不能以先前階段通過掩蓋新變更。


本機發布驗證：89 項 unit／integration／API／科學規則測試與 strict TypeScript／production build 檢查見 release-final-checked-results.json；Windows Chrome 八項桌面測試全部通過（local-desktop-summary.json），含六模態單獨無式上傳、人工標峰、校正頁／排名與 Mode B 六模態。遠端最終結果待 public-desktop-summary.json／public-smoke.json 更新，不能將本機通過等同遠端通過。

恢復後發布檢查：release-complete-results.json 的 strict、91 項測試及兩種 production build 全通過。中斷期間曾有 Vitest worker 載入 evidenceLedger 逾時（release-pubchem-results.json），該輪只有 62 項通過且一套件未執行；保留失敗紀錄，沒有 skip 或刪除。重跑 release-resumed／release-complete 都全通過。新增 API 契約／外部失效測試；PubChem 含溴質量值是參考資料，不當作實測準確率。

最終科學語意檢查：release-final-audit-results.json 為 strict／92 項測試／前後端 production build 全通過；新增未知 IR 強度方向不得作陰性證據的測試，舊同位素診斷改為相容假設。四份實測 IR 比較未外推为整体準確率。
