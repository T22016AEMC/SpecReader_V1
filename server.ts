import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import dotenv from "dotenv";
import { GoogleGenAI, Type } from "@google/genai";

dotenv.config();

const PORT = Number(process.env.PORT || 3000);
const externalTimeout = Math.max(1000, Math.min(60000, Number(process.env.EXTERNAL_API_TIMEOUT_MS) || 20000));
const remoteFetch: typeof fetch = (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(externalTimeout) });
const errorMessage = (err: unknown): string => err instanceof Error ? err.message : 'Unknown error';

function getGenAIClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "MY_GEMINI_API_KEY" || apiKey.trim() === "") {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      timeout: externalTimeout,
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

export async function createApp(options: { serveClient?: boolean } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  const clients = new Map<string, { count: number; expires: number }>();
  const requestLimit = Math.max(1, Math.min(1000, Number(process.env.REQUEST_LIMIT_PER_MINUTE) || 30));
  app.use('/api', (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (req.path === '/health') return next();
    const now = Date.now();
    if (clients.size >= 10000) for (const [id, state] of clients) if (state.expires <= now) clients.delete(id);
    const id = req.ip || 'unknown';
    const state = clients.get(id);
    if(!state && clients.size>=10000) return res.status(429).set('Retry-After','60').json({error:'服務繁忙，請稍後再試。'});
    const entry = state && state.expires > now ? state : { count: 0, expires: now + 60000 };
    entry.count++;
    clients.set(id, entry);
    if (entry.count > requestLimit) return res.status(429).set('Retry-After', '60').json({ error: '請求過於頻繁，請稍後再試。' });
    next();
  });
  const uploadLimit = Math.max(1, Math.min(25, Number(process.env.UPLOAD_LIMIT_MB) || 12));
  app.use(express.json({ limit: `${uploadLimit}mb`, strict: true }));
  app.get('/api/health', (_req, res) => res.json({ status: 'ok', version: '1.1.1', revision:process.env.RENDER_GIT_COMMIT??null, localScientificEngines: true }));

  // 0. System & Model Availability Endpoint
  app.get("/api/system-status", (_req, res) => {
    const aiAvailable = Boolean(getGenAIClient());
    return res.json({
      irQuantumDftBackend: false,
      h1NmrGiaoQuantumBackend: false,
      c13NmrGiaoQuantumBackend: false,
      msFormulaEngine: true,
      internalReferencePresets: true,
      externalNistSdbsLiveConnection: false,
      pubchemRestConnection: true,
      geminiAiAvailable: aiAvailable,
    });
  });

  // 1. PubChem Proxy / Lookup Endpoint (Real verifiable chemical database)
  app.get("/api/pubchem/compound", async (req, res) => {
    try {
      const query = String(req.query.q || "").trim();
      const type = String(req.query.type || "name").trim();
      if (!query) {
        return res.status(400).json({
          found: false,
          pubchemStatus: "API_ERROR",
          message: "缺少查詢參數",
        });
      }

      const encoded = encodeURIComponent(query);
      const propFields =
        "IUPACName,MolecularFormula,MolecularWeight,ExactMass,MonoisotopicMass,SMILES,ConnectivitySMILES,InChI,InChIKey";

      let response: Response;
      if (type === "inchi" || query.startsWith("InChI=")) {
        const propUrl = `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/inchi/property/${propFields}/JSON`;
        response = await remoteFetch(propUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Accept: "application/json",
          },
          body: `inchi=${encodeURIComponent(query)}`,
        });
      } else {
        const namespace = type === "smiles" ? "smiles" : "name";
        const propUrl = `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/${namespace}/${encoded}/property/${propFields}/JSON`;
        response = await remoteFetch(propUrl, {
          headers: { Accept: "application/json" },
        });
      }

      if (!response.ok) {
        return res.status(404).json({
          found: false,
          pubchemStatus: "NOT_FOUND",
          message: "PubChem 查詢未找到對應化合物紀錄。",
        });
      }

      const data = await response.json();
      const props = data?.PropertyTable?.Properties?.[0];
      if (!props) {
        return res.status(404).json({
          found: false,
          pubchemStatus: "NOT_FOUND",
          message: "PubChem 回傳資料無效。",
        });
      }

      return res.json({
        found: true,
        pubchemStatus: "SUCCESS",
        cid: props.CID,
        iupacName: props.IUPACName || query,
        molecularFormula: props.MolecularFormula,
        molecularWeight: Number(props.MolecularWeight),
        exactMass: Number(props.MonoisotopicMass??props.ExactMass),
        mostAbundantIsotopeMass: Number(props.ExactMass),
        canonicalSmiles: props.SMILES??props.ConnectivitySMILES??props.IsomericSMILES??props.CanonicalSMILES,
        connectivitySmiles: props.ConnectivitySMILES??props.CanonicalSMILES,
        inchi: props.InChI,
        inchiKey: props.InChIKey,
        pubchemUrl: `https://pubchem.ncbi.nlm.nih.gov/compound/${props.CID}`,
      });
    } catch (err: unknown) {
      console.error(JSON.stringify({ event: "external_api_failure", kind: err instanceof Error ? err.name : "UnknownError" }));
      return res.status(500).json({
        found: false,
        pubchemStatus: "API_ERROR",
        error: "PubChem 查詢暫時失敗，請稍後再試。",
      });
    }
  });

  // 2. Chemical Structure Image Recognition Endpoint (NEVER guess by filename!)
  app.post("/api/recognize-structure-image", async (req, res) => {
    try {
      const { imageBase64, mimeType } = req.body;
      if (!imageBase64) {
        return res.status(400).json({
          recognized: false,
          message: "未收到結構圖片資料。",
        });
      }

      const ai = getGenAIClient();
      if (!ai) {
        return res.status(503).json({
          recognized: false,
          aiAvailable: false,
          message: "目前無法連線至 Gemini Vision 結構光學辨識服務，無法可靠辨識此化學結構圖片，請使用 SMILES / InChI 或重新上傳清晰結構圖。",
        });
      }

      const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, "");
      const prompt = `你是 SpecReader 化學結構光學辨識（OCSR）模組。
請仔細檢查這張圖片是否為清晰的 2D 化學結構式：
1. 辨識圖中的原子（C, H, O, N, S, P, Si, F, Cl, Br, I 等）、共價鍵（單鍵、雙鍵、參鍵、芳香環）、電荷與立體化學。
2. 若圖片中確實包含可清楚辨識的單一化學結構，請將其轉換為標準 SMILES、InChI（若可推導）與分子式（Molecular Formula），並將 recognized 設為 true。
3. 若圖片模糊、不是化學結構式（例如是一般風景、光譜曲線或無法辨識取代基），請將 recognized 設為 false，絕對不要猜測或捏造已知化合物！`;

      const response = await ai.models.generateContent({
        model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: mimeType || "image/png",
                data: cleanBase64,
              },
            },
            { text: prompt },
          ],
        },
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              recognized: { type: Type.BOOLEAN },
              smiles: { type: Type.STRING },
              inchi: { type: Type.STRING },
              molecularFormula: { type: Type.STRING },
              compoundNameZh: { type: Type.STRING },
              detectedAtomsAndBondsSummary: { type: Type.STRING },
              failureReason: { type: Type.STRING },
            },
            required: ["recognized", "smiles", "molecularFormula", "detectedAtomsAndBondsSummary"],
          },
        },
      });

      const text = response.text;
      if (!text) {
        return res.status(422).json({
          recognized: false,
          message: "無法可靠辨識此化學結構圖片，請使用 SMILES / InChI 或重新上傳清晰結構圖。",
        });
      }

      const parsed = JSON.parse(text);
      if (!parsed.recognized || !parsed.smiles || parsed.smiles.trim() === "") {
        return res.status(422).json({
          recognized: false,
          message:
            parsed.failureReason ||
            "無法可靠辨識此化學結構圖片，請使用 SMILES / InChI 或重新上傳清晰結構圖。",
        });
      }

      return res.json({
        recognized: true,
        aiAvailable: true,
        ...parsed,
      });
    } catch {
      return res.status(500).json({
        recognized: false,
        message: "無法可靠辨識此化學結構圖片，請使用 SMILES / InChI 或重新上傳清晰結構圖。",
      });
    }
  });

  // 3. AI Spectrum Image Digitization Endpoint (No fake fallback peaks!)
  app.post("/api/digitize-spectrum", async (req, res) => {
    try {
      const { imageBase64, mimeType, spectrumType } = req.body;
      if(spectrumType==='IR')return res.status(422).json({aiAvailable:false,digitizedSuccess:false,error:'IR 請使用瀏覽器原始像素擷取與手動座標校正；不接受生成式 AI 峰值替代實測。'});
      if (!imageBase64) {
        return res.status(400).json({
          aiAvailable: false,
          digitizedSuccess: false,
          error: "缺少圖片資料",
        });
      }

      const ai = getGenAIClient();
      if (!ai) {
        return res.status(503).json({
          aiAvailable: false,
          digitizedSuccess: false,
          error: "Gemini Vision 未啟用，僅使用本地端 Canvas 視覺掃描。",
        });
      }

      const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, "");
      const prompt = `你是 SpecReader 科學光譜圖片數位化引擎。
請檢查此圖片是否為清晰的 ${spectrumType || "科學"} 光譜圖：
1. 若圖片並非光譜圖，或座標軸與峰位完全無法辨識，請將 isReadableSpectrum 設為 false，peaks 設為空陣列 []，絕對禁止捏造峰值！
2. 若可辨識，請讀取 X 軸範圍、Y 軸範圍與主要實際觀測峰值（x 座標、相對強度 y 0-100）。`;

      const response = await ai.models.generateContent({
        model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: mimeType || "image/png",
                data: cleanBase64,
              },
            },
            { text: prompt },
          ],
        },
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              isReadableSpectrum: { type: Type.BOOLEAN },
              xAxisMin: { type: Type.NUMBER },
              xAxisMax: { type: Type.NUMBER },
              xAxisUnit: { type: Type.STRING },
              yAxisUnit: { type: Type.STRING },
              detectedQualityNotes: { type: Type.STRING },
              peaks: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    x: { type: Type.NUMBER },
                    y: { type: Type.NUMBER },
                    width: { type: Type.NUMBER },
                    label: { type: Type.STRING },
                  },
                  required: ["x", "y"],
                },
              },
            },
            required: ["isReadableSpectrum", "peaks"],
          },
        },
      });

      const text = response.text;
      if (!text) {
        throw new Error("Empty response from Gemini Vision");
      }
      const parsed = JSON.parse(text);
      return res.json({
        aiAvailable: true,
        digitizedSuccess: Boolean(parsed.isReadableSpectrum && parsed.peaks?.length > 0),
        ...parsed,
      });
    } catch (err: unknown) {
      console.error(JSON.stringify({ event: "external_api_failure", kind: err instanceof Error ? err.name : "UnknownError" }));
      return res.status(500).json({
        aiAvailable: false,
        digitizedSuccess: false,
        error: "外部服務暫時無法使用；本地科學分析仍可操作。",
      });
    }
  });

  // 4. Gemini AI Evidence Integration & Reasoning Layer (Strictly constrained!)
  app.post("/api/ai-reasoning", async (req, res) => {
    try {
      const {
        mode,
        irSummary,
        h1Summary,
        c13Summary,
        msSummary,
        expectedStructure,
        formulaCandidates,
        deterministicCandidates,
      } = req.body;

      const ai = getGenAIClient();
      if (!ai) {
        return res.status(503).json({
          aiAvailable: false,
          message: "Gemini AI 推理服務目前未啟用，系統已使用內建物理/化學規則與經驗模型完成候選排序。",
        });
      }

      const systemInstruction = `你是 SpecReader 平台的「AI 證據整合與推理層（AI Evidence Integration Layer）」。
請嚴格遵守以下科學規範（全程使用台灣繁體中文回答）：
1. 你絕對不可以自己憑空猜測化學結構，只能根據已輸入的 IR、¹H NMR、¹³C NMR、MS、MS/MS、ToF-SIMS 實驗證據與候選結構進行交叉比對與推理。
2. 嚴格禁止捏造任何未觀測到的光譜峰位（peaks）、禁止捏造 DOI、禁止捏造論文標題或作者、禁止宣稱 NIST/SDBS 資料庫命中。
3. 必須明確解釋為什麼排名第一的候選結構（Candidate 1）比其他候選異構物（Candidate 2 / 3）更符合或不符合觀測光譜。
4. 若目前輸入的光譜證據不足（例如僅有單一光譜或缺乏關鍵耦合/分子量資訊），請誠實指出「目前證據不足以唯一確認結構」，並列出最有價值的後續驗證實驗。`;

      const prompt = `請針對以下 SpecReader 分析結果進行多光譜證據整合與跨候選結構推理（請以台灣繁體中文輸出）：
- 分析模式：${mode}
- 預期結構（若有）：${expectedStructure ? JSON.stringify(expectedStructure) : "未提供（未知結構解析模式）"}
- MS 分子式候選清單：${JSON.stringify(formulaCandidates || [])}
- IR 官能基篩選證據：${JSON.stringify(irSummary || [])}
- ¹H NMR 訊號證據：${JSON.stringify(h1Summary || [])}
- ¹³C NMR 訊號證據：${JSON.stringify(c13Summary || {})}
- MS / MS/MS / ToF-SIMS 證據：${JSON.stringify(msSummary || {})}
- 經驗與規則引擎產生之候選結構清單：${JSON.stringify(deterministicCandidates || [])}

請回傳結構化 JSON，包含：整體證據整合摘要（executiveAssessment）、候選結構優劣比較（candidateComparisonReasoning）、關鍵物理與化學結構約束（keyStructuralConstraints）、跨光譜分析衝突（crossSpectrumConflicts）、以及建議後續實驗（recommendedExperiments）。`;

      const response = await ai.models.generateContent({
        model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
        contents: prompt,
        config: {
          systemInstruction,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              executiveAssessment: { type: Type.STRING },
              candidateComparisonReasoning: { type: Type.STRING },
              keyStructuralConstraints: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              crossSpectrumConflicts: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              recommendedExperiments: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              aiProposedCandidates: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    smiles: { type: Type.STRING },
                    name: { type: Type.STRING },
                    reasoning: { type: Type.STRING },
                  },
                  required: ["smiles", "name", "reasoning"],
                },
              },
            },
            required: [
              "executiveAssessment",
              "candidateComparisonReasoning",
              "keyStructuralConstraints",
              "crossSpectrumConflicts",
              "recommendedExperiments",
            ],
          },
        },
      });

      const text = response.text;
      if (!text) {
        throw new Error("Empty response from Gemini reasoning");
      }
      return res.json({
        aiAvailable: true,
        ...JSON.parse(text),
      });
    } catch (err: unknown) {
      console.error(JSON.stringify({ event: "external_api_failure", kind: err instanceof Error ? err.name : "UnknownError" }));
      return res.status(500).json({
        aiAvailable: false,
        error: "外部服務暫時無法使用；本地科學分析仍可操作。",
      });
    }
  });

  if (options.serveClient !== false && process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else if (options.serveClient !== false) {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res, next) => {
      if (req.path.startsWith("/api/")) return next();
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.use('/api', (_req, res) => res.status(404).json({ error: 'API_NOT_FOUND' }));
  app.use((err: { status?: number; type?: string }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const status = err.status === 413 ? 413 : err.status === 400 ? 400 : 500;
    res.status(status).json({ error: status === 413 ? 'UPLOAD_TOO_LARGE' : status === 400 ? 'INVALID_JSON' : 'INTERNAL_ERROR' });
  });
  return app;
}

async function startServer() {
  if (!Number.isInteger(PORT) || PORT < 0 || PORT > 65535) throw new Error('Invalid PORT');
  const app = await createApp();
  const server = app.listen(PORT, '0.0.0.0', () => console.log(JSON.stringify({ event: 'server_started', version: '1.1.1', port: PORT })));
  server.requestTimeout = 65000;
  process.on('SIGTERM', () => server.close(() => process.exit(0)));
}
if (process.env.NODE_ENV !== 'test') startServer().catch(() => { console.error('SERVER_START_FAILED'); process.exitCode = 1; });
