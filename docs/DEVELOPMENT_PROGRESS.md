# V1 最新進度（2026-10-13）

原 V0 ZIP SHA-256：a9315297d71842d0e1111c9ad90f271c9f6b1bc300f9ccddd1e23cc1df5b312a。V1 獨立建立，未覆蓋成果或其他服務。

|Phase|實際狀態|驗證與限制|
|---|---|---|
|0|基準完成|V0 22 項：14 通過／8 失敗；typecheck 失敗，build 成功，原紀錄保留|
|1 P0|本輪修正完成|¹³C ReferenceError、契約型別、相對積分、Unknown 溶劑、IR 尺度、離子質量、RDKit／合法離子|
|2 IR|基礎升級完成|AsLS／峰形／尺度／覆蓋；四份實測仍有誤報，未稱全域可靠|
|3 NMR|基礎升級完成|比例／J／位移片段、DEPT／APT 限制；尚無 FID／強耦合或學習模型|
|4 質譜三模態|基礎升級完成|有限質量列舉／同位素、圖碎片與中性損失、獨立表面弱證據；未完整 CE／重排／產率|
|5 整合排名|正式流程已接入|同源去重、原始觀測／來源、分數帳本；有限候選與未校準權重|
|6 Mode B|六模態已接入|分子圖／經驗峰／可能式，保留操作介面與預測來源|
|7 部署|獨立免費 V1 LIVE；驗收完成|指定 GitHub main／PORT／靜態 WASM；最終狀態見 public-deployment.json|
|8 驗證|工程與有限實測完成；遠端 Chrome／Edge 驗收完成|92 項與 strict／build 以 release-final-audit-results.json 為準；四份 IR F1 0.6667 只是開發便利樣本，其他實測未驗證|

首輪 Render pnpm build scripts、Mode B 型別／可觀測性、桌面不唯一選擇器、新 benchmark 腳本 implicit any 的失敗都保留紀錄並修正，不刪除／skip。原 SheetJS 0.18.5 的兩項 high 更新為官方固定 0.20.3，保留 Excel 並增加二進位回歸；更新後 production audit 公告 0 件，不是無漏洞保證。

主要變更／文獻／限制見根目錄五份 V1 文件；逐檔差異見 validation/v0-v1-file-comparison.json。沒有手機版或 UI 重設計。


最終交付驗收（2026-10-13）：92 項 unit／integration／API／科學規則測試、strict TypeScript 與 production build 全通過。公開 HTTPS 的 Windows Chrome 8／8、Windows Edge 8／8 通過，沒有 skip／flaky；含六模態單獨無式輸入、人工標峰、校正頁、排名、Mode B 六模態與重新整理。Render 免費獨立服務 LIVE；已驗收程式碼為 0fb180fc35fbb2753a94e024b36900c9fed0611a，health 提交一致，PubChem SMILES 修正已確認。詳見 validation/public-deployment.json、public-smoke.json、public-desktop-summary.json、public-edge-summary.json。
