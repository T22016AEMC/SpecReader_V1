# V1.1 整合修正版部署（1.1.2）

Repository：[T22016AEMC/SpecReader_V1](https://github.com/T22016AEMC/SpecReader_V1)，Public授權不變。修復分支 `fix/v11-explicit-analysis-observation-inputs`，基準74e5158；保留V1／既有V1.1歷史。

既有獨立免費Node服務：[SpecReader](https://specreader-v1.onrender.com)，srv-db6udpgu01pc73bl1tog，工作區tea-db6qffon74is738k4q30。未更動V0／EluSim，無新增付費服務。

Build：`npm install -g pnpm@11.25.0 && pnpm install --frozen-lockfile && pnpm run build`；Start：`node dist/server.mjs`；Node24.19.0，NODE_ENV=production，PORT平台注入並綁0.0.0.0。API Key只放伺服器環境；本地科學不依賴Gemini。

工程檢查（2026-10-15）：

- TypeScript檢查通過；前端Vite（包含獨立modeA.worker資源）與後端esbuild正式建置成功。保留bundle體積提示。
- 保留的15個單元／整合檔，共115項通過；包含新增13項觀測／組成／分析控制案例。
- 桌面整體12項流程曾全數通過；最終相關變更再跑明確分析、觀測列編輯、原圖基線三項。包含Worker RDKit可用、編輯不啟動Worker、兩次明確開始才兩個任務、結果過時提示、寬峰／J／空白積分及真實原圖拖曳。
- 所有數據是少量工程／可驗算案例，不是科學準確率驗收。未新增大型Benchmark。
- TEST SPEC四圖SHA256與修改前一致，不上傳公開Repo。舊測試物移出正式App、legacy檔保留；進一步實體刪除遭自動核准拒絕。

公開站以 `/api/health` 的version=1.1.2及revision核對GitHub main；另查 `/api/system-status`、WASM、Worker資源與公開互動。發佈結果以實際健康回應及交付回覆為準，不硬編碼自身commit雜湊。平台既有healthCheckPath先前為空／TCP，HTTP端點另行驗證，不能以YAML推定已修改平台。

發佈前執行 `node scripts/verify-distribution.mjs`，排除.env（只留範例）、密鑰、node_modules、dist、快取及使用者原始圖譜。無新增套件／GPU／Python或模型權重；既有授權notice仍隨建置產生。
