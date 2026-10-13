# 第三方來源及再散布聲明

- RDKit／`@rdkit/rdkit` 2026.9.1：BSD-3-Clause；完整官方聲明 `docs/licenses/RDKit.txt`，建置時複製到 `/rdkit/LICENSE.txt`。使用官方 npm WASM，沒有重製私有模型或資料庫。
- `jcampconverter` **9.6.4**：MIT，Copyright (c) 2014 Luc Patiny；完整包內聲明 `docs/licenses/jcampconverter-9.6.4.txt`。固定版本，禁止以新版不同授權取代。
- SheetJS Community Edition 0.20.3：Apache-2.0，官方固定 tarball／lockfile integrity；`docs/licenses/SheetJS-0.20.3.txt`。修原 0.18.5 的 prototype pollution／ReDoS 公告，保留 Excel 功能。三份完整授權合併供 `/THIRD_PARTY_NOTICES.txt`。
- 原 React／Vite／Express／SheetJS／圖形元件及間接依賴的版本見 `pnpm-lock.yaml`，各自 npm 套件中的 LICENSE 保留；本項目公開不變更其著作權。
- Whittaker／AsLS 求解、質量卷積及圖片段程式碼由本輪依數學原理自行實作，没有複製 pybaselines、pyteomics、CFM-ID 或其他未確認許可的程式碼。
- 不包含 SIRIUS／CFM-ID／FullSSPrUCe 權重、未授權譜庫或 NIST 原始實測光譜。公開 JSON 只含來源／雜湊／比較結果，不含波形。
- 此 Repository 可公開查看；SpecReader 自有原始碼的獨立開源 LICENSE 尚未由擁有人指定。第三方的寬鬆授權不自動授權整個產品；不代替使用者授權作出新的自有軟體許可承諾。
