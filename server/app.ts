import express, { Router, Request, Response } from "express";
import dotenv from "dotenv";
import { GoogleGenAI, Type, ThinkingLevel } from "@google/genai";
import { findCategoryById, generateProceduralPrompts } from "../src/constants/categories";

dotenv.config();

export function getClient(apiKey?: string) {
  let key = (apiKey && apiKey.trim().length > 0) ? apiKey.trim() : process.env.GEMINI_API_KEY;
  if ((!key || key.toLowerCase() === "default" || key.toLowerCase() === "system") && process.env.GEMINI_API_KEY) {
    key = process.env.GEMINI_API_KEY.trim();
  }
  if (!key) {
    throw new Error("API Key tidak ditemukan. Mohon masukkan API Key Anda di menu Header (ikon Kunci).");
  }
  return new GoogleGenAI({
    apiKey: key,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

// Server-side in-memory prompt history bank across sessions
const serverPromptHistoryBank = new Set<string>();

export function getSmartThinkingConfig(targetModel: string, budget = 2048): any {
  // Empower AI reasoning with an active thinking budget for models supporting extended thinking (3.8, 3.6, 2.5, 3.1-pro)
  if (targetModel.includes("2.5") || targetModel.includes("3.8") || targetModel.includes("3.6") || targetModel.includes("pro") || targetModel.includes("thinking")) {
    return { thinkingBudget: budget };
  }
  return undefined;
}

export function sanitizeModel(model?: string): string {
  if (!model) return "gemini-3.8-flash";
  const m = model.trim().toLowerCase();
  if (m.includes("3.8") || m === "gemini-3.8-flash") return "gemini-3.8-flash";
  // Transparent mapping: Google v1beta uses gemini-3.8-flash or gemini-3.5-flash-lite for next-gen flash
  if (m.includes("3.6") || m === "gemini-3.6-flash") return "gemini-3.8-flash";
  if (m.includes("3.5")) return "gemini-3.5-flash-lite";
  if (m.includes("3.1-flash-lite") || m.includes("flash-lite") || m.includes("lite")) return "gemini-3.1-flash-lite";
  if (m.includes("2.5-flash-lite")) return "gemini-2.5-flash-lite";
  if (m.includes("2.5") || m === "gemini-2.5-flash") return "gemini-2.5-flash";
  if (m.includes("3.1-pro") || m.includes("pro")) return "gemini-3.1-pro-preview";
  if (m === "gemini-flash-latest") return "gemini-flash-latest";
  return "gemini-3.8-flash";
}

export function cleanErrorMessage(err: any): string {
  if (!err) return "Terjadi kesalahan tidak diketahui";
  if (typeof err === "string") {
    try {
      const jsonMatch = err.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed?.error?.message) return parsed.error.message;
      }
    } catch {}
    return err;
  }
  if (typeof err.message === "string" && err.message) {
    try {
      const jsonMatch = err.message.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed?.error?.message) return parsed.error.message;
      }
    } catch {}
    return err.message;
  }
  if (typeof err.error === "string" && err.error) return err.error;
  if (typeof err.error?.message === "string" && err.error.message) return err.error.message;
  try {
    const raw = JSON.stringify(err);
    if (raw && raw !== '{}') {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed?.error?.message) return parsed.error.message;
      }
      return raw;
    }
  } catch {}
  return String(err?.message || err || "Terjadi kesalahan tidak diketahui");
}

export async function generateContentWithFallback(
  ai: GoogleGenAI,
  primaryModel: string,
  generateParams: (model: string) => { contents: any; config?: any },
  maxRetriesPerModel = 2
): Promise<{ response: any; usedModel: string }> {
  const fallbackOrder = ["gemini-3.8-flash", "gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-2.5-flash", "gemini-flash-latest", "gemini-3.1-pro-preview"];
  const candidateModels = [
    primaryModel,
    ...(primaryModel === "gemini-3.5-flash-lite" ? ["gemini-3.5-flash-lite-preview", "gemini-3.1-flash-lite"] : []),
    ...fallbackOrder.filter((m) => m !== primaryModel),
  ];

  let lastError: any = null;

  for (const model of candidateModels) {
    const isProOrPreview = model.includes("pro") || model.includes("preview");
    const allowedAttempts = isProOrPreview ? 1 : maxRetriesPerModel;

    for (let attempt = 1; attempt <= allowedAttempts; attempt++) {
      try {
        const { contents, config } = generateParams(model);
        const response = await ai.models.generateContent({
          model,
          contents,
          config,
        });
        return { response, usedModel: model };
      } catch (err: any) {
        lastError = err;
        const msg = cleanErrorMessage(err).toLowerCase();

        // If error was caused by thinkingConfig or schema incompatibility, retry immediately without thinkingConfig
        try {
          const { contents, config } = generateParams(model);
          if (config && config.thinkingConfig) {
            const safeConfig = { ...config };
            delete safeConfig.thinkingConfig;
            const retryResp = await ai.models.generateContent({
              model,
              contents,
              config: safeConfig,
            });
            return { response: retryResp, usedModel: model };
          }
        } catch {
          // ignore and proceed
        }

        const isNotFound =
          msg.includes("not found") ||
          msg.includes("404") ||
          msg.includes("not supported") ||
          msg.includes("unrecognized") ||
          msg.includes("is not found");

        const isQuota =
          msg.includes("quota") ||
          msg.includes("exceeded") ||
          msg.includes("resource_exhausted") ||
          msg.includes("429") ||
          msg.includes("billing");

        const isTransient =
          msg.includes("504") ||
          msg.includes("502") ||
          msg.includes("timeout") ||
          msg.includes("network") ||
          msg.includes("high demand") ||
          msg.includes("unavailable");

        if (isNotFound || isQuota || msg.includes("500") || msg.includes("overloaded") || msg.includes("503") || msg.includes("internal")) {
          // Jika model mengalami error 500/overload di datacenter Google, langsung beralih ke model fallback berikutnya tanpa menunda
          break;
        } else if (isTransient && attempt < allowedAttempts) {
          await new Promise((res) => setTimeout(res, 500 * attempt));
          continue;
        } else {
          break;
        }
      }
    }
  }

  throw new Error(cleanErrorMessage(lastError));
}

export function extractHTMLFromMarkdown(text: string, isGreenScreen: boolean = false): string {
  let cleanHTML = text;
  
  const tick3 = String.fromCharCode(96, 96, 96);
  const regex = new RegExp(tick3 + '(?:html)?\\s*([\\s\\S]*?)' + tick3, 'i');
  const match = text.match(regex);
  
  if (match) {
    cleanHTML = match[1].trim();
  } else {
    const startIdx = text.toLowerCase().indexOf('<!doctype');
    const endIdx = text.toLowerCase().lastIndexOf('</html>');
    if (startIdx !== -1 && endIdx !== -1) {
      cleanHTML = text.substring(startIdx, endIdx + 7);
    } else {
      cleanHTML = text.trim();
    }
  }
  
  cleanHTML = cleanHTML
    .replace(new RegExp('^' + tick3 + 'html\\s*', 'i'), '')
    .replace(new RegExp('^' + tick3 + '\\s*'), '')
    .replace(new RegExp(tick3 + '\\s*$'), '')
    .trim();

  const lower = cleanHTML.toLowerCase();
  const bg = isGreenScreen ? '#00ff00' : '#080c14';

  // Auto-heal: If HTML is missing <!DOCTYPE html> or <html>/<body> wrap, but has <canvas> or <script>
  if (!lower.includes('<!doctype') || !lower.includes('</html>')) {
    if (lower.includes('<script') || lower.includes('requestanimationframe') || lower.includes('<canvas')) {
      // Ensure closing script and canvas exist
      let bodyContent = cleanHTML;
      if (!bodyContent.toLowerCase().includes('</script>')) {
        bodyContent += '\n  }\n  animate(0);\n</' + 'script>';
      }
      if (!bodyContent.toLowerCase().includes('<canvas')) {
        bodyContent = `<canvas id="canvas"></canvas>\n` + bodyContent;
      }
      cleanHTML = `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Canvas Animation</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; overflow: hidden; background: ${bg}; display: flex; align-items: center; justify-content: center; }
    canvas { display: block; width: 100%; height: 100%; }
  </style>
</head>
<body>
  ${bodyContent}
</body>
</html>`;
    }
  }

  // Auto-heal runtime safety: Ensure try/catch wrapping inside animate() function to prevent unhandled JS exceptions from blanking canvas
  if (cleanHTML.includes('function animate(') && !cleanHTML.includes('catch')) {
    cleanHTML = cleanHTML.replace(
      /function animate\s*\(([^)]*)\)\s*\{([\s\S]*?)(requestAnimationFrame\s*\(\s*animate\s*\);?\s*\})/,
      (fullMatch, param, body, reqCall) => {
        if (body.includes('try {')) return fullMatch;
        return `function animate(${param}) {\n    try {\n${body}\n    } catch (err) {\n      console.error("Canvas render error:", err);\n    }\n    ${reqCall}`;
      }
    );
  }
    
  return cleanHTML.trim();
}

export function parseSafeBody(req: Request | any): any {
  if (!req) return {};
  if (typeof req.body === "object" && req.body !== null) {
    return req.body;
  }
  if (typeof req.body === "string" && req.body.trim().length > 0) {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return {};
}

// Logic for testing a single API key with target model support and resilient diagnostics
export function extractCleanApiKey(rawKey: string): string {
  if (!rawKey) return "";
  let key = rawKey.trim();
  key = key.replace(/^["'`\s]+|["'`\s,;]+$/g, "");
  const match = key.match(/AIza[0-9A-Za-z-_]{35}/);
  if (match) {
    return match[0];
  }
  return key;
}

// Logic for testing a single API key with target model support and resilient diagnostics
export async function handleTestSingleKeyLogic(rawKey: string, requestedModel?: string) {
  let key = extractCleanApiKey(rawKey);
  const isDefaultOrSystem = !key || key.toLowerCase() === "default" || key.toLowerCase() === "system";
  if (isDefaultOrSystem && process.env.GEMINI_API_KEY) {
    key = process.env.GEMINI_API_KEY.trim();
  }

  const maskedKey = (isDefaultOrSystem && process.env.GEMINI_API_KEY)
    ? "Server System Key (Aktif)"
    : key.length > 10
      ? `${key.substring(0, 6)}...${key.substring(key.length - 4)}`
      : key || "(kosong)";
  const start = Date.now();

  if (!key) {
    return {
      key: "",
      maskedKey: "(kosong)",
      valid: false,
      error: "Key tidak boleh kosong",
      latencyMs: 0,
    };
  }

  if (!key.startsWith("AIza") && key.length < 20) {
    return {
      key,
      maskedKey,
      valid: false,
      error: "Format salah (harus diawali 'AIza...')",
      latencyMs: Date.now() - start,
    };
  }

  const primaryModel = sanitizeModel(requestedModel || "gemini-3.8-flash");
  const candidateModels = Array.from(new Set([
    primaryModel,
    "gemini-3.8-flash",
    "gemini-3.5-flash-lite",
    "gemini-3.1-flash-lite",
    "gemini-flash-latest",
    "gemini-2.5-flash",
  ]));

  const ai = new GoogleGenAI({
    apiKey: key,
    httpOptions: { headers: { "User-Agent": "aistudio-build" } },
  });

  let lastError: any = null;
  let encounteredQuota = false;

  for (const model of candidateModels) {
    try {
      let timerId: any = null;
      const timeoutPromise = new Promise((_, reject) => {
        timerId = setTimeout(() => reject(new Error("Timeout verifikasi (> 6s)")), 6000);
      });

      const probePromise = (async () => {
        try {
          return await ai.models.generateContent({
            model,
            contents: "hi",
            config: { maxOutputTokens: 1 },
          });
        } catch (genErr: any) {
          const cleanGen = cleanErrorMessage(genErr);
          const genMsg = cleanGen.toLowerCase();
          if (
            genMsg.includes("api_key_invalid") ||
            genMsg.includes("api key not valid") ||
            genMsg.includes("key is not valid") ||
            genMsg.includes("invalid api key") ||
            genMsg.includes("api_key_expired") ||
            genMsg.includes("unauthenticated") ||
            genMsg.includes("401")
          ) {
            throw genErr;
          }
          return await ai.models.countTokens({
            model,
            contents: "ping",
          });
        }
      })();

      try {
        await Promise.race([probePromise, timeoutPromise]);
        return {
          key,
          maskedKey,
          valid: true,
          testedModel: model,
          latencyMs: Date.now() - start,
        };
      } finally {
        if (timerId) clearTimeout(timerId);
      }
    } catch (err: any) {
      lastError = err;
      const cleanMsg = cleanErrorMessage(err);
      const msg = cleanMsg.toLowerCase();

      const isTrueKeyInvalid =
        msg.includes("api_key_invalid") ||
        msg.includes("api key not valid") ||
        msg.includes("key is not valid") ||
        msg.includes("invalid api key") ||
        msg.includes("api_key_expired") ||
        msg.includes("unauthenticated") ||
        msg.includes("401");

      if (isTrueKeyInvalid) {
        return {
          key,
          maskedKey,
          valid: false,
          error: "API Key tidak valid atau salah",
          latencyMs: Date.now() - start,
        };
      }

      if (msg.includes("resource_exhausted") || msg.includes("429") || msg.includes("quota")) {
        encounteredQuota = true;
        continue;
      }

      continue;
    }
  }

  if (encounteredQuota) {
    return {
      key,
      maskedKey,
      valid: true,
      isQuotaLimit: true,
      error: "Key Valid • Kuota limit sementara (Gunakan model Gemini 3.8/3.5)",
      latencyMs: Date.now() - start,
    };
  }

  const rawMsg = cleanErrorMessage(lastError) || "Gagal verifikasi API key";
  return {
    key,
    maskedKey,
    valid: false,
    error: rawMsg.length > 70 ? rawMsg.substring(0, 70) + "..." : rawMsg,
    latencyMs: Date.now() - start,
  };
}

// Logic for testing all models compatibility with an API key
export async function handleTestModelsLogic(rawKey: string) {
  let key = (rawKey || "").trim();
  if ((!key || key.toLowerCase() === "default" || key.toLowerCase() === "system") && process.env.GEMINI_API_KEY) {
    key = process.env.GEMINI_API_KEY.trim();
  }
  if (!key) {
    return {
      success: false,
      error: "API Key tidak boleh kosong",
      models: [],
    };
  }

  const modelsToTest = [
    { id: "gemini-3.8-flash", name: "Gemini 3.8 Flash", badge: "Next-Gen Flagship (Animasi Super Pintar)" },
    { id: "gemini-3.6-flash", name: "Gemini 3.6 Flash", badge: "Pintar, Elegan & Detail Kompleks" },
    { id: "gemini-3.5-flash-lite", name: "Gemini 3.5 Flash Lite", badge: "Next-Gen Pintar & Hemat" },
    { id: "gemini-3.1-flash-lite", name: "Gemini 3.1 Flash Lite", badge: "Super Ringan (RPM Tinggi)" },
    { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", badge: "Stabil & Teruji" },
    { id: "gemini-3.1-pro-preview", name: "Gemini 3.1 Pro Preview", badge: "Masterpiece Rigging" },
  ];

  const ai = new GoogleGenAI({
    apiKey: key,
    httpOptions: { headers: { "User-Agent": "aistudio-build" } },
  });

  const modelResults = await Promise.all(
    modelsToTest.map(async (m) => {
      const start = Date.now();
      try {
        let timerId: any = null;
        const toPromise = new Promise((_, reject) => {
          timerId = setTimeout(() => reject(new Error("Timeout (> 8s)")), 8000);
        });

        const testTargetModel = sanitizeModel(m.id);
        const testRun = (async () => {
          try {
            return await ai.models.countTokens({
              model: testTargetModel,
              contents: "ping",
            });
          } catch {
            return await ai.models.generateContent({
              model: testTargetModel,
              contents: "ok",
              config: { maxOutputTokens: 1 },
            });
          }
        })();

        try {
          await Promise.race([testRun, toPromise]);
          return {
            id: m.id,
            name: m.name,
            badge: m.badge,
            status: "active" as const,
            valid: true,
            latencyMs: Date.now() - start,
            message: "Siap Digunakan • Respon Cepat",
          };
        } finally {
          if (timerId) clearTimeout(timerId);
        }
      } catch (err: any) {
        const raw = cleanErrorMessage(err);
        const lower = raw.toLowerCase();

        if (
          lower.includes("api_key_invalid") ||
          lower.includes("api key not valid") ||
          lower.includes("key is not valid")
        ) {
          return {
            id: m.id,
            name: m.name,
            badge: m.badge,
            status: "invalid_key" as const,
            valid: false,
            latencyMs: Date.now() - start,
            message: "API Key Salah / Tidak Ditemukan",
          };
        }

        if (lower.includes("resource_exhausted") || lower.includes("429") || lower.includes("quota")) {
          return {
            id: m.id,
            name: m.name,
            badge: m.badge,
            status: "quota_exhausted" as const,
            valid: true, // Key is valid
            latencyMs: Date.now() - start,
            message: "Key Valid • Kuota Limit (Gunakan Model Lain)",
          };
        }

        if (lower.includes("not found") || lower.includes("404") || lower.includes("unrecognized")) {
          return {
            id: m.id,
            name: m.name,
            badge: m.badge,
            status: "not_available" as const,
            valid: true, // Key is valid
            latencyMs: Date.now() - start,
            message: "Model Belum Tersedia di Region Akun Ini",
          };
        }

        if (lower.includes("permission") || lower.includes("403")) {
          return {
            id: m.id,
            name: m.name,
            badge: m.badge,
            status: "permission_denied" as const,
            valid: true,
            latencyMs: Date.now() - start,
            message: "Akses Belum Diaktifkan di GCP Console",
          };
        }

        return {
          id: m.id,
          name: m.name,
          badge: m.badge,
          status: "network_issue" as const,
          valid: true,
          latencyMs: Date.now() - start,
          message: lower.includes("timeout") ? "Respon Lambat (> 8s)" : raw.substring(0, 50),
        };
      }
    })
  );

  const activeCount = modelResults.filter((r) => r.status === "active").length;
  const isKeyValid = !modelResults.some((r) => r.status === "invalid_key");

  return {
    success: true,
    isKeyValid,
    activeCount,
    total: modelResults.length,
    models: modelResults,
  };
}

export async function handleTestKeysLogic(keysInput: any, requestedModel?: string) {
  let keys: string[] = [];
  if (Array.isArray(keysInput)) {
    keys = keysInput;
  } else if (typeof keysInput === "string") {
    keys = [keysInput];
  }

  if (keys.length === 0) {
    return { results: [], validCount: 0, total: 0 };
  }

  const results: any[] = [];
  for (let i = 0; i < keys.length; i++) {
    const res = await handleTestSingleKeyLogic(keys[i], requestedModel);
    results.push(res);
    if (i < keys.length - 1) {
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  const validCount = results.filter((r) => r.valid).length;
  return { results, validCount, total: keys.length };
}

// Logic for generating prompts
export async function handleGeneratePromptsLogic(body: any) {
  const {
    apiKey,
    model,
    type = "icon",
    subCategory = "teknologi",
    style = "minimalist",
    count = 3,
    keywords = [],
    isGreenScreen = false,
    colorMode = "gradient",
    motionDynamics = "flow",
    neonGlow = true,
  } = body;
  const ai = getClient(apiKey);
  const targetModel = sanitizeModel(model);

  let typeInstruction = '';
  if (type === 'icon') {
    typeInstruction = 'Every prompt must describe 1 single central visual icon/symbol (no letters/text), sleek, modern and high precision. STRICT REQUIREMENT FOR ICON: Do NOT describe flying particles, debris, stars, or background clutter around the icon. Focus purely on the isolated icon itself and its internal geometric parts.';
  } else if (type === 'bg') {
    typeInstruction = 'Every prompt must describe an elegant looping motion background concept (no text), seamless geometry, atmospheric waves, or thematic backdrop.';
  }

  let keywordsDirective = '';
  const parsedKeywords: string[] = Array.isArray(keywords)
    ? keywords.map((k: any) => String(k).trim()).filter((k: string) => k.length > 0)
    : typeof keywords === 'string'
    ? keywords.split('\n').map((k) => k.trim()).filter((k) => k.length > 0)
    : [];

  if (parsedKeywords.length > 0) {
    keywordsDirective = `\nCustom Keywords / Specific Focus Topics:\n${parsedKeywords.map((k) => `- ${k}`).join('\n')}\n(MANDATORY: Incorporate these specific user keywords/topics into the generated animation prompts.)`;
  }

  const greenScreenDirective = isGreenScreen
    ? '\nGreen Screen / Chroma Key: ACTIVE. Ensure the animation concept has high-contrast, clean visual edges ideal for green screen chroma key extraction (#00FF00 background).'
    : '';

  const colorModeDirective = `\nColor Mode: ${colorMode.toUpperCase()} (${
    colorMode === 'flat'
      ? 'Crisp flat solid colors, NO gradients, clean modern flat vector design'
      : colorMode === 'neon'
      ? 'High-intensity cyber neon luminescent tones'
      : colorMode === 'monochrome'
      ? 'Minimalist monochrome black, white & slate shades'
      : colorMode === 'pastel'
      ? 'Soft aesthetic pastel tones (lavender, mint, peach, baby blue)'
      : colorMode === 'luxury'
      ? 'Luxury metallic gold, champagne and obsidian black'
      : 'Vibrant dynamic gradient color transitions'
  })`;

  const glowDirective = `\nNeon Glow: ${neonGlow ? 'ENABLED (luminous aura & radiant highlights)' : 'DISABLED (sharp crisp vector borders, zero blur/shadow)'}`;

  const catMeta = findCategoryById(subCategory, type);
  const categoryLine = catMeta
    ? `Microstock Category (Adobe Stock / Shutterstock): ${catMeta.enName} (${catMeta.name})\nCategory Theme & Keywords: ${catMeta.description} - ${catMeta.stockKeywords.join(', ')}\n`
    : (subCategory && subCategory !== 'all' && subCategory !== 'general' ? `Category / Domain: ${subCategory}\n` : '');

  const previousPrompts: string[] = Array.isArray(body.previousPrompts) ? body.previousPrompts : [];
  const mergedBank = Array.from(new Set([...previousPrompts, ...serverPromptHistoryBank])).slice(0, 20);
  const negativeList = mergedBank.length > 0
    ? `\nANTI-REPETITION MANDATE (ABSOLUTELY NEVER REPEAT PREVIOUS PROMPTS ACROSS DAYS OR SESSIONS):\nDo NOT generate any concept, subject, or composition similar to these previously generated prompts:\n${mergedBank.map((p, idx) => `[Prior #${idx + 1}]: ${p}`).join('\n')}\nYou MUST invent a completely novel, fresh subject and distinct mechanical/artistic composition.`
    : '';

  const dynamicSessionSeed = `${Date.now().toString(36)}-${Math.floor(Math.random() * 1000000).toString(36)}`;

  const targetCount = Math.max(1, count || 1);
  const CHUNK_SIZE = 12;
  const numChunks = Math.ceil(targetCount / CHUNK_SIZE);
  let allPrompts: string[] = [];

  for (let c = 0; c < numChunks; c++) {
    const needed = targetCount - allPrompts.length;
    if (needed <= 0) break;
    const batchCount = Math.min(CHUNK_SIZE, needed);

    const isSingle = batchCount === 1;
    let promptContent = '';
    if (type === 'bg') {
      promptContent = isSingle
        ? `You are a Principal Motion Graphic Director for Adobe Stock & Shutterstock.
Generate exactly 1 professional, highly marketable FULL-FRAME MOTION BACKGROUND prompt in English (Seed: ${dynamicSessionSeed}).

MANDATORY RULES FOR FULL-FRAME MOTION BACKGROUNDS (STRICT ZERO PARTICLES & ZERO WHITE FLARES):
1. FULL-FRAME EDGE-TO-EDGE CANVAS COVERAGE:
   - The prompt MUST describe a continuous, edge-to-edge widescreen looping motion graphics environment spanning the entire 100% canvas from corner to corner (e.g. "Fluid multi-layered chromatic wave ribbons flowing diagonally across widescreen viewport", "3D perspective neon cyber grid terrain receding toward luminous horizon with waving contour lines", "Architectural structural geometric lattice mesh with dynamic linkage lines across full screen", "Luxury obsidian black silk satin fabric undulating with rich champagne gold light caustics").
   - FORBIDDEN: Isolated centered icons, symbols, floating emblems, logos, or empty border margins.
   - STRICT BAN ON PARTICLES: NEVER describe floating particles, dust motes, stardust, or loose dots. Visuals must be pure continuous wave ribbons, geometric topographic contours, or undulating silk caustics.
   - STRICT BAN ON WHITE FLARES & WHITEOUTS: NEVER describe blinding white light flares, central white radial bursts, or harsh whiteouts. All lighting must be subtle, chromatic, and elegant with deep background contrast.
2. 3-TIER ATMOSPHERIC DEPTH:
   - Deep background atmospheric gradient, dynamic midground motion graphics, and subtle foreground ambient chromatic sweeps.
3. 60 FPS SEAMLESS HARMONIC LOOP:
   - Smooth periodic wave functions, continuous flow, and studio-grade cinematic motion.
${negativeList}

${categoryLine}Animation Type: FULL-FRAME BACKGROUND MOTION
Visual Style: ${style}${colorModeDirective}${glowDirective}
Special Directives: ${typeInstruction}${keywordsDirective}${greenScreenDirective}

Output format: JSON array containing exactly 1 string, e.g. ["Fluid multi-layered chromatic wave ribbons flowing diagonally across widescreen viewport..."]`
        : `You are a Principal Motion Graphic Director for Adobe Stock & Shutterstock.
Generate exactly ${batchCount} UNIQUE FULL-FRAME MOTION BACKGROUND prompts (Seed: ${dynamicSessionSeed}). STRICT RULE: NO REPETITION. Each prompt must describe a completely different atmospheric environment, motion dynamic, and visual theme. Start EVERY prompt with a unique [ID_CODE] (e.g., [CHROMATIC_WAVES], [CYBER_HORIZON], [AURORA_RIBBONS], [SILK_CAUSTICS]).

MANDATORY RULES FOR FULL-FRAME BACKGROUND DIVERSITY (STRICT ZERO PARTICLES & ZERO WHITE FLARES):
1. NO REPETITION & NO CENTERING: Each prompt MUST describe a FULL-FRAME EDGE-TO-EDGE motion graphics scene filling the entire widescreen canvas. NEVER describe isolated icons, centered logos, or static borders.
2. STRICT BAN ON PARTICLES: DO NOT describe floating particles, dust motes, or loose speckled dots. All graphics must be clean continuous spline ribbons, 3D perspective grids, topographic contour waves, or luxury liquid caustics.
3. STRICT BAN ON WHITE LIGHT FLARES: NEVER describe white flares, white light bursts, or blinding center blooms. Use rich, moody chromatic palette harmonies.
4. DIVERSE VISUAL CONCEPTS:
   - Prompt 1: Multi-layered chromatic fluid wave ribbons and smooth liquid gradient displacement.
   - Prompt 2: 3D perspective cyber grid, digital wireframe topography, or matrix elevation lines.
   - Prompt 3: Interconnected structural geometric lattice mesh with clean vector linkage lines.
   - Prompt 4: Luxury satin fabric folds, liquid metallic gold waves, or ambient studio caustics.
   - (Vary concepts continuously across all items).
5. 60 FPS SEAMLESS KINETICS: Include harmonic wave oscillations, continuous panning, and atmospheric depth.
${negativeList}

${categoryLine}Animation Type: FULL-FRAME BACKGROUND MOTION
Visual Style: ${style}${colorModeDirective}${glowDirective}
Special Directives: ${typeInstruction}${keywordsDirective}${greenScreenDirective}

Output format: JSON array of ${batchCount} strings e.g. ["prompt 1", "prompt 2"]`;
    } else {
      promptContent = isSingle
        ? `You are a Principal Motion Graphic Director for Adobe Stock & Shutterstock.
Generate exactly 1 professional, highly marketable, and semantically rich animation prompt in English (Seed: ${dynamicSessionSeed}).

MANDATORY RULES FOR STANDALONE 3D VOLUMETRIC OBJECT (STRICT ZERO RHOMBUS, ZERO BACKGROUND PLATES, ZERO BROKEN POLYGONS):
1. STANDALONE VOLUMETRIC 3D ICON OBJECT (THE OBJECT ITSELF IS 3D):
   - The prompt MUST describe the subject/icon itself (e.g. 3D Camera, 3D Notification Bell, 3D Studio Microphone, 3D Padlock, 3D Trophy, 3D Crypto Vault, 3D Shopping Cart) as a physical, sculpted, standalone 3D volumetric artifact.
   - STRICT ZERO CONTAINER / ZERO RHOMBUS / ZERO SHIELD RULE:
     * NEVER place the icon on a diamond (belah ketupat), rhombus plate, hexagon, shield plate, pedestal base, or background card!
     * The icon must stand 100% naked and standalone on the canvas/green screen.
   - ULTRA-REALISTIC CHIAROSCURO & VOLUMETRIC LIGHTING:
     * Pristine native curved silhouette with smooth chamfered fillets.
     * Crisp 1.5px specular highlight bevel rails along top-left edges catching key studio lighting.
     * Rich multi-stop directional chiaroscuro gradients across body facets (e.g. lustrous imperial gold, chrome titanium, matte obsidian, or vivid saturated materials).
     * Deep ambient occlusion crease shadows beneath joints and under-rims.
     * Soft breathing elliptical ground contact shadow cast directly below the object on the canvas/green screen.
2. DETAILED MONOLITHIC RIGGED ANATOMY (ZERO DETACHED PARTS, ZERO BUBBLES):
   - All internal components (lens barrel on camera, clapper inside bell, mesh grille on microphone, dial on vault) are physically welded into the unified chassis.
   - STRICT FORBIDDEN: Detached floating parts, exploded views, upright rectangle box abstractions, outer glass bubbles, or outer background cards.
3. STRICT BAN ON GEAR WHEELS / SPROCKETS (ZERO GEARS):
   - NEVER describe rotating gear wheels, sprockets, or cogs on icons (especially on wallets, vaults, charts, cards, devices, or documents).
4. ELASTIC KINETIC 60 FPS SPRING DYNAMICS:
   - Describe harmonic vertical floating with elastic squash-and-stretch spring bounce (body squashes slightly on dip), synchronized internal micro-articulation with secondary inertia, and a clipped 45-degree diagonal specular gleam sweep.
${negativeList}

${categoryLine}Animation Type: ${String(type).toUpperCase()}
Visual Style: ${style === 'minimalist' ? '3d_crest' : style}${colorModeDirective}${glowDirective}
Special Directives: ${typeInstruction}${keywordsDirective}${greenScreenDirective}

Output format: JSON array containing exactly 1 string, e.g. ["Masterpiece 3D volumetric model of professional DSLR Camera: standalone sculpted solid body with rich titanium chiaroscuro gradients, beveled chamfers with crisp 1.5px specular highlight rails, concentric multi-ring cylindrical optical lens barrel with glass reflections, spring-loaded shutter button, and soft breathing elliptical ground shadow on green screen (completely standalone, zero background plates, zero rhombus)..."]`
        : `You are a Principal Motion Graphic Director for Adobe Stock & Shutterstock.
Generate exactly ${batchCount} UNIQUE animation prompts (Seed: ${dynamicSessionSeed}). STRICT RULE: NO REPETITION. Each prompt must describe a completely different object, concept, and movement, using varied vocabulary and structure. Start EVERY prompt with a unique [ID_CODE] (e.g., [CAMERA_3D], [BELL_VOLUMETRIC], [VAULT_3D]).

MANDATORY RULES FOR STANDALONE 3D VOLUMETRIC OBJECT (STRICT ZERO RHOMBUS, ZERO SHIELD, ZERO PLATES):
1. STANDALONE VOLUMETRIC 3D ICON OBJECT (THE OBJECT ITSELF IS 3D):
   - Each prompt must describe a solid standalone 3D volumetric physical object (e.g., 3D Camera, 3D Notification Bell, 3D Microphone, 3D Padlock, 3D Trophy) with rich chiaroscuro surface, beveled chamfers with crisp specular highlight rails, and elliptical ground contact shadow.
   - STRICT BAN: ZERO diamond/rhombus plates, ZERO shield badges, ZERO background cards. The object must stand completely uncontained on the canvas.
2. EXTREME PROMPT DIVERSITY & STRUCTURAL VARIATION:
   - EACH prompt in this batch MUST have a COMPLETELY DIFFERENT sentence structure, vocabulary, and thematic focus from the category: ${catMeta?.enName || subCategory}.
3. STRICT BAN ON GEAR WHEELS / SPROCKETS (ZERO GEARS):
   - NEVER describe rotating gear wheels or cogs on icons.
4. ELASTIC KINETIC 60 FPS SPRING DYNAMICS:
   - Include harmonic vertical floating with elastic squash-and-stretch spring bounce, synchronized internal articulation on rigid anchors, and clipped specular sheen sweep.
${negativeList}

${categoryLine}Animation Type: ${String(type).toUpperCase()}
Visual Style: ${style === 'minimalist' ? '3d_crest' : style}${colorModeDirective}${glowDirective}
Special Directives: ${typeInstruction}${keywordsDirective}${greenScreenDirective}

Output format: JSON array of ${batchCount} strings e.g. ["prompt 1", "prompt 2"]`;
    }

    try {
      const { response } = await generateContentWithFallback(
        ai,
        targetModel,
        (currentModel) => {
          const batchMaxTokens = isSingle ? 250 : Math.min(2500, Math.max(400, batchCount * 100));
          const config: any = {
            temperature: 0.95,
            maxOutputTokens: batchMaxTokens,
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.ARRAY,
              items: {
                type: Type.STRING,
              },
            },
          };
          const thinkingConfig = getSmartThinkingConfig(currentModel, 512);
          if (thinkingConfig) {
            config.thinkingConfig = thinkingConfig;
          }
          return { contents: promptContent, config };
        }
      );

      const rawText = (response.text || "").trim();
      let chunkPrompts: string[] = [];

      try {
        const parsed = JSON.parse(rawText);
        if (Array.isArray(parsed)) {
          chunkPrompts = parsed.map((p: any) => String(p).trim()).filter((p: string) => p.length > 0);
        }
      } catch {
        const jsonMatch = rawText.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          try {
            chunkPrompts = JSON.parse(jsonMatch[0]);
          } catch {
            chunkPrompts = rawText
              .split('\n')
              .map((p) => p.replace(/^[-*0-9.]+\s*/, '').replace(/["'[\]]/g, '').trim())
              .filter((p) => p.length > 4);
          }
        }
      }

      if (chunkPrompts.length > 0) {
        allPrompts = [...allPrompts, ...chunkPrompts.slice(0, batchCount)];
        for (const p of chunkPrompts) {
          if (serverPromptHistoryBank.size > 800) {
            const first = serverPromptHistoryBank.values().next().value;
            if (first) serverPromptHistoryBank.delete(first);
          }
          serverPromptHistoryBank.add(p);
        }
      } else {
        const fallbackBatch = generateProceduralPrompts(
          batchCount,
          type,
          subCategory,
          style,
          colorMode,
          motionDynamics,
          neonGlow,
          parsedKeywords,
          allPrompts.length
        );
        allPrompts = [...allPrompts, ...fallbackBatch];
      }
    } catch (chunkErr) {
      console.warn(`[handleGeneratePromptsLogic] Batch ${c + 1} fallback to procedural synthesizer:`, chunkErr);
      const fallbackBatch = generateProceduralPrompts(
        batchCount,
        type,
        subCategory,
        style,
        colorMode,
        motionDynamics,
        neonGlow,
        parsedKeywords,
        allPrompts.length
      );
      allPrompts = [...allPrompts, ...fallbackBatch];
    }
  }

  if (allPrompts.length < targetCount) {
    const diff = targetCount - allPrompts.length;
    const extra = generateProceduralPrompts(
      diff,
      type,
      subCategory,
      style,
      colorMode,
      motionDynamics,
      neonGlow,
      parsedKeywords,
      allPrompts.length
    );
    allPrompts = [...allPrompts, ...extra];
  }

  return { prompts: allPrompts.slice(0, targetCount) };
}

// Logic for generating animation HTML
export async function handleGenerateAnimationLogic(body: any) {
  const {
    apiKey,
    model,
    promptTopic,
    type = "icon",
    subCategory = "teknologi",
    style = "minimalist",
    index = 1,
    total = 1,
    isGreenScreen = false,
    colorMode = "gradient",
    motionDynamics = "flow",
    neonGlow = true,
  } = body;

  if (!promptTopic) {
    throw new Error("Prompt topic wajib diisi");
  }

  const ai = getClient(apiKey);
  const targetModel = sanitizeModel(model);

  const catMeta = findCategoryById(subCategory, type);
  const catInfo = catMeta ? `${catMeta.enName} (${catMeta.name}) - ${catMeta.description}` : subCategory;

  const isBackground = type === 'bg';
  const bgColor = isGreenScreen ? '#00ff00' : '#080c14';
  const clearFill = isGreenScreen ? "'#00ff00'" : "'#080c14'";

  const motionDirectives = {
    bounce: "Kinetika elastis squash-and-stretch alami (squash = 1 + 0.12 * Math.cos(t * 3); stretch = 1 / Math.sqrt(squash)).",
    orbital: "Rotasi 3D pseudo-isometrik multi-sumbu dengan kedalaman depth-scale (depth = 0.85 + 0.3 * Math.sin(t * 2)).",
    morph: "Transformasi kurva dinamis berbobot dengan transisi harmonik halus bezierCurveTo.",
    cyber: "Presisi step kinetik cybernetic, sapuan laser scan clip tajam, dan indikator status LED ritmis.",
    mechanical: "Artikulasi sasis dan poros beveled presisi tanpa roda gerigi, redaman inersia harmonis.",
    flow: "Kinetika floating harmonis megah (floatY = Math.sin(t * 2.4) * (S * 0.045)) dengan inersia sekunder (Math.sin(t * 2.4 - 0.45) * 4px)."
  }[motionDynamics] || "Kinetika floating 3D harmonis 60 FPS dengan redaman inersia alami.";

  const colorStyleDirective = isGreenScreen
    ? "- KANVAS GREEN SCREEN MURNI: Background #00ff00. STRICT ZERO SHADOWBLUR! WARNA SUBJEK OBJEK WAJIB MENGGUNAKAN WARNA KONTRAS TINGGI yang BUKAN HIJAU (Gold #FFD700, Electric Cyan #00E5FF, Violet #A855F7, Crimson #EF4444, Platinum #E2E8F0, Vivid Orange #F97316) agar objek tidak pudar atau menyatu dengan green screen."
    : (neonGlow
        ? "- MODE NEON GLOW: Pencahayaan luminescent tajam pada aksen/LED (ctx.shadowBlur = 12; ctx.shadowColor = primaryColor). Dilarang shadowBlur pada seluruh kanvas."
        : "- MODE CRISP FLAT/SOLID: Vektor solid tajam tanpa blur (ctx.shadowBlur = 0).");

  const systemPrompt = `Anda adalah Master HTML5 Canvas 2D Motion Designer & Microstock Specialist.
Tugas: Buat 1 file HTML animasi Canvas 2D yang SANGAT PRESISI, BENTUK AKURAT SESUAI PROMPT, 60 FPS, dan 100% BEBAS CACAT.

PARAMETER PROMPT:
- Subjek/Topik: "${promptTopic}"
- Tipe Animasi: ${isBackground ? 'FULL-FRAME MOTION BACKGROUND (100% Widescreen Coverage)' : '3D MONOLITHIC ICON (Pusat Kanvas)'}
- Gaya Visual: ${style} | Mode Warna: ${colorMode}
- Dinamika Gerakan: ${motionDynamics.toUpperCase()} (${motionDirectives})
${colorStyleDirective}

ATURAN MUTLAK ANIMASI (ZERO DEFECT & STRICT ZERO GROUND SHADOW):
1. KODE MENGGAMBAR LENGKAP & UTUH (MANDATORY):
   - TULIS KODE KINETIK CANVAS 2D SECARA LENGKAP UTUH & PRESISI UNTUK "${promptTopic}". DILARANG MEMBIARKAN KOMENTAR KOSONG ATAU SKELETON KODE!
   - WAJIB gunakan ctx.beginPath(), ctx.fillStyle, ctx.createLinearGradient(), ctx.roundRect()/ctx.arc(), ctx.fill(), ctx.stroke() untuk melukis bodi 3D volumetric, bevel highlight rail 1.5px, dan detail internal objek.
2. STRICT ZERO GROUND SHADOW (MUTLAK):
   - DILARANG KERAS MENGGAMBAR BAYANGAN LANTAI, BAYANGAN DI BAWAH IKON, ATAU ELIPS HITAM/HIJAU DI BAWAH OBJEK! Objek melayang bersih 100%.
3. CHIAROSCURO VOLUMETRIC STUDIO LIGHTING:
   - Kesan 3D dibangun melalui gradien multi-stop directional 45°: Top plane (key light highlight cerah), Front facade (warna midtone kaya), dan Underside rim (ambient occlusion gelap -35%).
4. STRICT ZERO RODA GERIGI & ZERO PARTICLES:
   - Dilarang menggambar roda gerigi / gir berputar atau partikel debu liar.
${isBackground ? '5. FULL-FRAME COVERAGE: Animasi background WAJIB mengisi kanvas dari (0, 0) hingga (w, h) secara penuh dan bergerak 60 FPS seamless loop.' : ''}

WAJIB outputkan struktur HTML lengkap berikut (hanya kode HTML, tanpa penjelasan):
<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { width: 100vw; height: 100vh; overflow: hidden; background: ${bgColor}; display: flex; align-items: center; justify-content: center; }
  canvas { display: block; width: 100%; height: 100%; }
</style>
</head>
<body>
<canvas id="c"></canvas>
<script>
  const canvas = document.getElementById('c');
  const ctx = canvas.getContext('2d');
  let w, h, cx, cy, S;
  function resize() {
    w = canvas.width = window.innerWidth;
    h = canvas.height = window.innerHeight;
    cx = w / 2;
    cy = h / 2;
    S = ${isBackground ? 'Math.max(w, h)' : 'Math.min(w, h) * 0.44'};
  }
  window.addEventListener('resize', resize);
  resize();

  function animate(time) {
    try {
      const t = time * 0.001;
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = ${clearFill};
      ctx.fillRect(0, 0, w, h);

      ${isBackground ? '// Render Edge-to-Edge Widescreen Motion Graphics Latar Belakang di sini' : `const floatY = Math.sin(t * 2.4) * (S * 0.04);
      ctx.save();
      ctx.translate(cx, cy + floatY);
      // Tuliskan seluruh kode menggambar anatomi 3D volumetric subjek "${promptTopic}" dengan chiaroscuro 45° & bevel rail di sini
      ctx.restore();`}
    } catch (err) {
      console.error("Render loop error:", err);
    }

    requestAnimationFrame(animate);
  }
  requestAnimationFrame(animate);
</script>
</body>
</html>`;

  let cleanHTML = '';
  const { response } = await generateContentWithFallback(
    ai,
    targetModel,
    (currentModel) => {
      const animConfig: any = {
        temperature: 0.2,
        maxOutputTokens: 4096,
      };
      return { contents: systemPrompt, config: animConfig };
    }
  );

  let rawText = response.text || "";
  cleanHTML = extractHTMLFromMarkdown(rawText, isGreenScreen);

  if (!cleanHTML.toLowerCase().includes('</html>') || !cleanHTML.toLowerCase().includes('</script>')) {
    if (cleanHTML.toLowerCase().includes('requestanimationframe') || cleanHTML.toLowerCase().includes('<canvas') || cleanHTML.toLowerCase().includes('function animate')) {
      rawText += '\n  }\n  animate(0);\n</' + 'script>\n</body>\n</html>';
      cleanHTML = extractHTMLFromMarkdown(rawText, isGreenScreen);
    }
  }

  if (!cleanHTML || (!cleanHTML.toLowerCase().includes('<script') && !cleanHTML.toLowerCase().includes('<canvas'))) {
    throw new Error('AI mengembalikan kode yang belum lengkap');
  }

  return {
    id: 'anim_' + Date.now() + Math.random().toString(36).substring(7),
    title: `${promptTopic.substring(0, 35)}... (${index}/${total})`,
    type,
    style,
    subCategory,
    colorMode,
    motionDynamics,
    neonGlow,
    html: cleanHTML,
    isGreenScreen,
  };
}

// Server-side streaming endpoint for real-time animation code generation via Server-Sent Events (SSE)
export async function handleStreamAnimationLogic(body: any, res: Response) {
  const {
    apiKey,
    model,
    promptTopic,
    type = "icon",
    subCategory = "teknologi",
    style = "minimalist",
    index = 1,
    total = 1,
    isGreenScreen = false,
    colorMode = "gradient",
    motionDynamics = "flow",
    neonGlow = true,
  } = body;

  if (!promptTopic) {
    res.status(400).json({ error: "Prompt topic wajib diisi" });
    return;
  }

  const ai = getClient(apiKey);
  const targetModel = sanitizeModel(model);
  const isBackground = type === 'bg';
  const bgColor = isGreenScreen ? '#00ff00' : '#080c14';
  const clearFill = isGreenScreen ? "'#00ff00'" : "'#080c14'";

  const motionDirectives = {
    bounce: "Kinetika elastis squash-and-stretch alami (squash = 1 + 0.12 * Math.cos(t * 3); stretch = 1 / Math.sqrt(squash)).",
    orbital: "Rotasi 3D pseudo-isometrik multi-sumbu dengan kedalaman depth-scale (depth = 0.85 + 0.3 * Math.sin(t * 2)).",
    morph: "Transformasi kurva dinamis berbobot dengan transisi harmonik halus bezierCurveTo.",
    cyber: "Presisi step kinetik cybernetic, sapuan laser scan clip tajam, dan indikator status LED ritmis.",
    mechanical: "Artikulasi sasis dan poros beveled presisi tanpa roda gerigi, redaman inersia harmonis.",
    flow: "Kinetika floating harmonis megah (floatY = Math.sin(t * 2.4) * (S * 0.045)) dengan inersia sekunder (Math.sin(t * 2.4 - 0.45) * 4px)."
  }[motionDynamics] || "Kinetika floating 3D harmonis 60 FPS dengan redaman inersia alami.";

  const colorStyleDirective = isGreenScreen
    ? "- KANVAS GREEN SCREEN MURNI: Background #00ff00. STRICT ZERO SHADOWBLUR! WARNA SUBJEK OBJEK WAJIB MENGGUNAKAN WARNA KONTRAS TINGGI yang BUKAN HIJAU (Gold #FFD700, Electric Cyan #00E5FF, Violet #A855F7, Crimson #EF4444, Platinum #E2E8F0, Vivid Orange #F97316) agar objek tidak pudar atau menyatu dengan green screen."
    : (neonGlow
        ? "- MODE NEON GLOW: Pencahayaan luminescent tajam pada aksen/LED (ctx.shadowBlur = 12; ctx.shadowColor = primaryColor). Dilarang shadowBlur pada seluruh kanvas."
        : "- MODE CRISP FLAT/SOLID: Vektor solid tajam tanpa blur (ctx.shadowBlur = 0).");

  const systemPrompt = `Anda adalah Master HTML5 Canvas 2D Motion Designer & Microstock Specialist.
Tugas: Buat 1 file HTML animasi Canvas 2D yang SANGAT PRESISI, BENTUK AKURAT SESUAI PROMPT, 60 FPS, dan 100% BEBAS CACAT.

PARAMETER PROMPT:
- Subjek/Topik: "${promptTopic}"
- Tipe Animasi: ${isBackground ? 'FULL-FRAME MOTION BACKGROUND (100% Widescreen Coverage)' : '3D MONOLITHIC ICON (Pusat Kanvas)'}
- Gaya Visual: ${style} | Mode Warna: ${colorMode}
- Dinamika Gerakan: ${motionDynamics.toUpperCase()} (${motionDirectives})
${colorStyleDirective}

ATURAN MUTLAK ANIMASI (ZERO DEFECT & STRICT ZERO GROUND SHADOW):
1. KODE MENGGAMBAR LENGKAP & UTUH (MANDATORY):
   - TULIS KODE KINETIK CANVAS 2D SECARA LENGKAP UTUH & PRESISI UNTUK "${promptTopic}". DILARANG MEMBIARKAN KOMENTAR KOSONG ATAU SKELETON KODE!
   - WAJIB gunakan ctx.beginPath(), ctx.fillStyle, ctx.createLinearGradient(), ctx.roundRect()/ctx.arc(), ctx.fill(), ctx.stroke() untuk melukis bodi 3D volumetric, bevel highlight rail 1.5px, dan detail internal objek.
2. STRICT ZERO GROUND SHADOW (MUTLAK):
   - DILARANG KERAS MENGGAMBAR BAYANGAN LANTAI, BAYANGAN DI BAWAH IKON, ATAU ELIPS HITAM/HIJAU DI BAWAH OBJEK! Objek melayang bersih 100%.
3. CHIAROSCURO VOLUMETRIC STUDIO LIGHTING:
   - Kesan 3D dibangun melalui gradien multi-stop directional 45°: Top plane (key light highlight cerah), Front facade (warna midtone kaya), dan Underside rim (ambient occlusion gelap -35%).
4. STRICT ZERO RODA GERIGI & ZERO PARTICLES:
   - Dilarang menggambar roda gerigi / gir berputar atau partikel debu liar.
${isBackground ? '5. FULL-FRAME COVERAGE: Animasi background WAJIB mengisi kanvas dari (0, 0) hingga (w, h) secara penuh dan bergerak 60 FPS seamless loop.' : ''}

WAJIB outputkan struktur HTML lengkap (hanya kode HTML, tanpa penjelasan).`;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  try {
    const animConfig: any = {
      temperature: 0.2,
      maxOutputTokens: 4096,
    };

    const responseStream = await ai.models.generateContentStream({
      model: targetModel,
      contents: systemPrompt,
      config: animConfig,
    });

    let fullText = "";
    for await (const chunk of responseStream) {
      const text = chunk.text || "";
      fullText += text;
      res.write(`data: ${JSON.stringify({ chunk: text })}\n\n`);
    }

    let cleanHTML = extractHTMLFromMarkdown(fullText, isGreenScreen);
    if (!cleanHTML.toLowerCase().includes('</html>') || !cleanHTML.toLowerCase().includes('</script>')) {
      if (cleanHTML.toLowerCase().includes('requestanimationframe') || cleanHTML.toLowerCase().includes('<canvas') || cleanHTML.toLowerCase().includes('function animate')) {
        fullText += '\n  }\n  animate(0);\n</' + 'script>\n</body>\n</html>';
        cleanHTML = extractHTMLFromMarkdown(fullText, isGreenScreen);
      }
    }

    res.write(`data: ${JSON.stringify({
      done: true,
      id: 'anim_' + Date.now() + Math.random().toString(36).substring(7),
      title: `${promptTopic.substring(0, 35)}... (${index}/${total})`,
      type,
      style,
      subCategory,
      colorMode,
      motionDynamics,
      neonGlow,
      html: cleanHTML,
      isGreenScreen,
    })}\n\n`);
    res.end();
  } catch (err: any) {
    res.write(`data: ${JSON.stringify({ error: cleanErrorMessage(err) || "Gagal streaming animasi" })}\n\n`);
    res.end();
  }
}

// Zero-Dummy Policy: Animasi murni disusun oleh AI sesuai prompt & referensi. Tidak ada fallback dummy/template.

// Logic for Image to Motion (AI Multimodal Vision -> Pure Procedural Canvas 2D Vector Re-creation)
export async function handleImageToMotionLogic(body: any) {
  const {
    apiKey,
    model,
    imageBase64,
    mimeType = "image/png",
    fileName = "image.png",
    projectName = "Antrian Gambar",
    motionDynamics = "flow",
    colorMode = "gradient",
    neonGlow = true,
    isGreenScreen = false,
    customInstructions = "",
  } = body;

  if (!imageBase64) {
    throw new Error("Data gambar (base64) wajib disertakan");
  }

  const cleanTitle = fileName.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');

  // Clean base64 string
  let pureBase64 = String(imageBase64 || "");
  if (pureBase64.includes(";base64,")) {
    pureBase64 = pureBase64.split(";base64,")[1];
  }
  pureBase64 = pureBase64.trim();

  let shapeAnalysis: any = undefined;
  let detectedSubject = cleanTitle;
  let generatedHtml = "";

  const bgColor = isGreenScreen ? '#00ff00' : '#080c14';
  const clearFill = isGreenScreen ? "'#00ff00'" : "'#080c14'";

  try {
    const ai = getClient(apiKey);
    const targetModel = sanitizeModel(model);

    const masterMultimodalPrompt = `Anda adalah Master Canvas 2D Motion Graphics, Lead Computer Vision Engineer, dan Senior 3D Animator (Adobe After Effects / Lottie 60 FPS Microstock Specialist).

TUGAS UTAMA (ULTRA-DETAIL PROFESSIONAL IMAGE-TO-MOTION):
Analisis GAMBAR REFERENSI yang diunggah secara visual mendalam (pixel-level structural & chromatic analysis), lalu REKONSTRUKSI MENJADI KODE ANIMASI HTML5 CANVAS 2D yang SANGAT PRESISI, MIRIP DENGAN GAMBAR ASLI (bentuk anatomi, proporsi, rasio bevel, kode warna HEX asli), dan BERIKAN GERAKAN KINETIK 60 FPS KELAS ATAS (ULTRA-MODIFIKASI PROFESSIONAL)!

=============================================================================
1. ANALISIS ANATOMI & KEMIRIPAN TINGGI (HIGH FIDELITY VISUAL RECONSTRUCTION):
=============================================================================
- DEKONSTRUKSI ELEMEN GAMBAR ASLI:
  * Identifikasi subjek utama (apakah mikrofon studio, mobil, tas, trofi, kamera, roket, sepatu, gadget, robot, bangunan, kartu, dll.).
  * Teliti rasio proporsi lebar vs tinggi (aspect ratio) dan bentuk geometris spesifiknya (beveled rectangle, kurva bezier khusus, sudut chamfer, dll.).
  * EKSTRAK KODE WARNA HEX ASLI (#RRGGBB) langsung dari gambar: warna bodi utama, warna aksen sekunder, warna bayangan chiaroscuro (ambient occlusion), warna highlight kilau, dan warna garis kontur.
  * REKONSTRUKSI SETIAP DETAIL SUB-KOMPONEN: Gambar ulang seluruh bagian yang tampak di gambar referensi (tombol, layar, display digital, lensa, indikator LED, kabel, tali, pegangan, sasis) menggunakan fungsi Canvas 2D presisi (\`ctx.roundRect\`, \`ctx.bezierCurveTo\`, \`ctx.ellipse\`, \`ctx.arc\`, \`ctx.fill()\`, \`ctx.stroke()\`).
- DILARANG KERAS menyederhanakan menjadi bulatan/kotak biasa atau abstrak mentah! Bentuk harus sangat mirip dan dapat dikenali seketika sebagai kembaran animasi dari gambar referensi.
- DILARANG KERAS memunculkan roda gerigi jika gambar aslinya bukan roda gigi!
- DILARANG KERAS membungkus objek dalam gelembung bulat transparan (enclosing glass bubble) atau kotak kartu wadah latar belakang!

=============================================================================
2. PERGERAKAN KINETIK KELAS ATAS (ULTRA-MODIFIKASI PROFESSIONAL 60 FPS):
=============================================================================
Jangan buat animasi kaku atau monoton! Terapkan sistem pergerakan multi-layer yang hidup dan berbobot:
1. GERAKAN UTAMA (Root Floating & Inertia):
   - Osilasi vertikal harmonis yang bernapas: \`const floatY = Math.sin(t * 2.4) * (S * 0.04);\`
   - Kemiringan gimbal halus: \`const rot = Math.sin(t * 1.8) * 0.025;\`
   - Elastisitas squash-and-stretch alami: \`const squash = 1 + 0.03 * Math.cos(t * 2.4); const stretch = 1 / Math.sqrt(squash);\`
2. ARTIKULASI SUB-KOMPONEN SESUAI FUNGSI OBJEK (Secondary Kinetic Articulation):
   - Bagian-bagian internal/aksesoris bergerak dengan inersia fisika tertunda (phase lag: \`Math.sin(t * 2.4 - 0.4)\`):
     * Jika ada layar / display -> sapuan garis scanning laser ter-clip halus di area layar.
     * Jika ada indikator LED / tombol -> denyut pendaran luminescence lembut (\`ctx.shadowBlur = 8 + Math.sin(t * 3.5) * 4\`).
     * Jika ada lensa kamera / sensor -> denyut fokus halus atau aperture breathing.
     * Jika ada pegangan / antena / tali -> getaran elastis responsif.
     * Jika ada pelat / penutup -> artikulasi mikro pernapasan.
3. SPECULAR GLEAM SWEEP BERKELAS:
   - Sapuan kilau cahaya spekular miring 45 derajat yang menyapu melintasi permukaan objek (\`const gleamX = ((t * 0.8) % 3 - 1.5) * S * 2.5;\`) dan WAJIB di-clip di dalam siluet bentuk badan objek.
4. BAYANGAN KONTAK LANTAI (Ground Contact Shadow):
   - Bayangan elips di bawah objek yang membesar dan mengabur saat objek melayang naik, dan mengecil tajam saat objek turun.

=============================================================================
STRUKTUR WAJIB KODE HTML5 CANVAS 2D:
=============================================================================
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>
  body { margin: 0; padding: 0; overflow: hidden; background-color: ${bgColor}; font-family: system-ui, -apple-system, sans-serif; }
  canvas { display: block; width: 100vw; height: 100vh; }
  #err { position: absolute; top: 10px; left: 10px; color: #ef4444; font-size: 12px; z-index: 10; pointer-events: none; }
</style>
<script type="application/json" id="shape-analysis">
{
  "objectName": "Nama objek spesifik dari gambar referensi",
  "shapeDescription": "Deskripsi anatomi detail dan warna HEX asli yang dianalisis dari referensi",
  "detectedElements": ["Komponen Bodi Utama", "Detail Sub-Struktur", "Palet HEX Asli", "Aksen Kinetik"],
  "professionalMotionPlan": "Rencana pergerakan ultra modifikasi 60 FPS untuk setiap layer komponen",
  "similaritySynthesis": "Rekonstruksi presisi kode warna dan proporsi gambar 1:1",
  "glowColor": "${colorMode === 'neon' ? '#00f0ff' : colorMode === 'luxury' ? '#ffd700' : '#38bdf8'}"
}
</script>
<script>
  window.onerror = function(msg) { document.body.innerHTML += '<div id="err">Render Notice: ' + msg + '</div>'; };
</script>
</head>
<body>
<canvas id="c"></canvas>
<script>
  const canvas = document.getElementById('c');
  const ctx = canvas.getContext('2d');
  let w, h, cx, cy, S;
  
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = window.innerWidth;
    h = window.innerHeight;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    cx = w / 2;
    cy = h / 2;
    S = Math.min(w, h) * 0.44;
  }
  window.addEventListener('resize', resize);
  resize();

  // Safe fallback palette variables
  const darkTone = '#0f172a';
  const lightTone = '#38bdf8';
  const primaryColor = '#3b82f6';
  const secondaryColor = '#8b5cf6';
  const accentColor = '#f59e0b';

  function animate(time) {
    const t = time * 0.001;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = ${clearFill};
    ctx.fillRect(0, 0, w, h);

    // 1. BAYANGAN LANTAI VOLUMETRIK (GROUND CONTACT SHADOW)
    const floatY = Math.sin(t * 2.4) * (S * 0.038);


    // 2. ROOT MATRIX TUNGGAL UNTUK SELURUH OBJEK (SINGLE MONOLITHIC RIGID BODY):
    // WAJIB: SELURUH ELEMEN PENYUSUN OBJEK DIGAMBAR DI DALAM BLOK INI DENGAN TITIK PUSAT (0, 0)!
    const squash = 1 + 0.03 * Math.cos(t * 2.4);
    const stretch = 1 / Math.sqrt(squash);
    ctx.save();
    ctx.translate(cx, cy + floatY);
    ctx.rotate(Math.sin(t * 1.8) * 0.025);
    ctx.scale(squash, stretch);

    // [GAMBARKAN REKONSTRUKSI ULTRA DETAIL SESUAI GAMBAR REFERENSI DI SINI]:
    // - Gunakan kode warna HEX asli dari gambar referensi
    // - Gambar setiap komponen secara proporsional dan presisi (bodi, aksen, bevel, layar, lensa, tombol)
    // - Gerakkan sub-komponen dengan artikulasi inersia fase-tertunda
    // - Clip specular sheen miring di siluet bodi

    ctx.restore();

    requestAnimationFrame(animate);
  }
  animate(0);
</script>
</body>
</html>

Outputkan HANYA file HTML lengkap tanpa teks pembuka atau penjelas markdown:`;

    const { response } = await generateContentWithFallback(
      ai,
      targetModel,
      (currentModel) => {
        const config: any = {
          temperature: 0.12,
          maxOutputTokens: 8192,
        };
        const smartThinking = getSmartThinkingConfig(currentModel, 2048);
        if (smartThinking) config.thinkingConfig = smartThinking;
        return {
          contents: [
            {
              inlineData: {
                data: pureBase64,
                mimeType: mimeType || "image/png",
              },
            },
            {
              text: masterMultimodalPrompt,
            },
          ],
          config,
        };
      },
      1
    );

    let rawText = response.text || "";
    let cleanHTML = extractHTMLFromMarkdown(rawText);

    if (!cleanHTML.toLowerCase().includes('</html>') || !cleanHTML.toLowerCase().includes('</script>')) {
      if (cleanHTML.toLowerCase().includes('requestanimationframe')) {
        rawText += '\n  }\n  animate(0);\n</' + 'script>\n</body>\n</html>';
        cleanHTML = extractHTMLFromMarkdown(rawText);
      }
    }

    if (cleanHTML.toLowerCase().includes('<canvas') && cleanHTML.toLowerCase().includes('requestanimationframe')) {
      // Check for embedded shape-analysis JSON
      const analysisMatch = cleanHTML.match(/<script\s+type=["']application\/json["']\s+id=["']shape-analysis["']>([\s\S]*?)<\/script>/i);
      if (analysisMatch && analysisMatch[1]) {
        try {
          const parsed = JSON.parse(analysisMatch[1].trim());
          if (parsed.objectName) {
            detectedSubject = parsed.objectName;
            shapeAnalysis = {
              objectName: String(parsed.objectName || ''),
              shapeDescription: String(parsed.shapeDescription || ''),
              detectedElements: Array.isArray(parsed.detectedElements) ? parsed.detectedElements.map(String) : [],
              professionalMotionPlan: String(parsed.professionalMotionPlan || ''),
              similaritySynthesis: String(parsed.similaritySynthesis || ''),
              glowColor: parsed.glowColor,
            };
          }
        } catch (e) {}
      }

      generatedHtml = cleanHTML;
    }
  } catch (err) {
    console.warn('[ImageToMotion] Gemini procedural multimodal vision fallback:', err);
  }

  if (!generatedHtml) {
    throw new Error('AI tidak berhasil menyusun kode animasi Canvas dari gambar');
  }

  return {
    id: 'i2m_' + Date.now() + Math.random().toString(36).substring(7),
    title: `Motion: ${detectedSubject}`,
    type: 'icon',
    style: colorMode,
    subCategory: 'image-to-motion',
    colorMode,
    motionDynamics,
    neonGlow,
    html: generatedHtml,
    isGreenScreen,
    projectName,
    fileName,
    detectedSubject,
    shapeAnalysis,
  };
}

// Master Image To Motion Prompt Generator (Single clean line prompt per image)
export async function handleImageToPromptLogic(body: any) {
  try {
    const apiKey = body.apiKey;
    const targetModel = sanitizeModel(body.model);
    const imageBase64 = body.imageBase64 || "";
    const mimeType = body.mimeType || "image/png";
    const fileName = body.fileName || "image.png";
    const projectName = body.projectName || "Default";

    const pureBase64 = imageBase64.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, "");

    const ai = getClient(apiKey);

    const promptDirective = `You are a World-Class Computer Vision Engineer & Lead Motion Designer for Microstock Video Assets (Adobe After Effects / Lottie / 60 FPS HTML5 Canvas Specialist).

Analyze this reference image with extreme anatomical fidelity and output EXACTLY ONE SINGLE CONTINUOUS LINE of an ultra-detailed, production-ready motion graphics animation prompt that enables an AI code generator to recreate an animated twin identical to this image.

Your output prompt MUST strictly follow this comprehensive blueprint format (all in ONE single continuous line):
Central Subject: [Accurately name the central object/character/symbol, e.g. "Futuristic Studio Spotlight Camera", "Cyberpunk Delivery Drone", "Golden Bitcoin Shield", "Medical DNA Capsule", "Shopping Bag Icon"] with [Exact Art Style, e.g. "Modern Flat Vector Art with bold crisp outlines", "Isometric 3D Vector with clean lighting", "Glossy Glassmorphism with luminous cyber glow accents"];
Geometric Anatomy & Structure: [Describe all visual components from top to bottom and center outward with exact proportions, shapes, rounded caps, lenses, dials, chassis, wings, or brackets];
Exact Color Palette: Primary Body #[HEX], Secondary Structure #[HEX], Accent Trim #[HEX], Core Glow #[HEX], Outline #[HEX], Highlight #[HEX];
60 FPS Microstock Kinetic Dynamics: Smooth continuous vertical floating oscillation along Y-axis (amplitude ±14px, period 2.4s) paired with gentle harmonic gimbal tilt (±8 degrees, period 3.0s), rhythmic breathing pulse scale (0.96x to 1.04x on smooth ease-in-out curve), articulated kinetic movement of internal sub-components, brilliant 45-degree diagonal specular gleam light-sheen sweep across bevels every 2.0s, and radiating luminescent energy particles with soft neon glow blur.

CRITICAL RULES:
- Output MUST be EXACTLY ONE SINGLE CONTINUOUS LINE (NO line breaks, NO newlines).
- Output pure prompt text only (NO "Prompt:", NO quotes, NO bullet points, NO markdown bold).`;

    const { response } = await generateContentWithFallback(
      ai,
      targetModel,
      (currentModel) => {
        const config: any = {
          temperature: 0.3,
          maxOutputTokens: 600,
        };
        const smartThinking = getSmartThinkingConfig(currentModel, 512);
        if (smartThinking) config.thinkingConfig = smartThinking;
        return {
          contents: [
            {
              inlineData: {
                data: pureBase64,
                mimeType: mimeType || "image/png",
              },
            },
            {
              text: promptDirective,
            },
          ],
          config,
        };
      },
      2
    );

    let raw = response.text || "";
    let cleanPrompt = raw
      .replace(/^["'`\s]+|["'`\s]+$/g, "")
      .replace(/^(?:Prompt|Motion Prompt|Result|Output|Here is the prompt)[\s:=*-]+/i, "")
      .replace(/\r?\n+/g, " ")
      .replace(/\s{2,}/g, " ")
      .trim();

    if (!cleanPrompt) {
      cleanPrompt = `Ultra-detailed 60 FPS motion graphics animation of ${fileName.replace(/\.[^/.]+$/, "")} featuring fluid kinetic movements, glowing particle emitter trails, dynamic elastic easing, and luminous visual effects on a clean background.`;
    }

    return {
      success: true,
      fileName,
      projectName,
      prompt: cleanPrompt,
    };
  } catch (err) {
    console.error("[ImageToPrompt] Fallback triggered:", err);
    const safeBody = parseSafeBody(body);
    const fileName = safeBody.fileName || 'image.png';
    const projectName = safeBody.projectName || 'Default';
    return {
      success: true,
      fileName,
      projectName,
      prompt: `Dynamic 60 FPS motion graphic animation of ${fileName.replace(/\.[^/.]+$/, "")} featuring smooth articulated transformations, glowing particle emitter trails, and rhythmic kinetic dynamics on a clean background.`,
    };
  }
}

// Server Trial Registry
export const serverTrialStore = new Map<string, { startedAt: number; expiresAt: number; used: boolean }>();

export function handleCheckTrialLogic(body: any, ip: string) {
  const deviceId = body.deviceId || '';
  const key = deviceId || ip || 'default_ip';

  const record = serverTrialStore.get(key);
  if (!record) {
    return { hasUsedTrial: false, isActive: false, isExpired: false, remainingMs: 0 };
  }

  const now = Date.now();
  const remainingMs = Math.max(0, record.expiresAt - now);
  return {
    hasUsedTrial: true,
    isActive: remainingMs > 0,
    isExpired: remainingMs <= 0,
    startedAt: record.startedAt,
    expiresAt: record.expiresAt,
    remainingMs,
  };
}

export function handleStartTrialLogic(body: any, ip: string) {
  const deviceId = body.deviceId || 'dev_' + Date.now();
  const key = deviceId || ip || 'default_ip';

  const existing = serverTrialStore.get(key);
  if (existing) {
    const now = Date.now();
    const remainingMs = Math.max(0, existing.expiresAt - now);
    return {
      started: false,
      message: remainingMs > 0 ? "Trial sudah aktif di perangkat ini" : "Trial sudah pernah digunakan dan telah kedaluwarsa di perangkat ini",
      hasUsedTrial: true,
      isActive: remainingMs > 0,
      isExpired: remainingMs <= 0,
      expiresAt: existing.expiresAt,
      remainingMs,
    };
  }

  const now = Date.now();
  const expiresAt = now + 24 * 60 * 60 * 1000; // 24 hours
  serverTrialStore.set(key, { startedAt: now, expiresAt, used: true });

  return {
    started: true,
    hasUsedTrial: true,
    isActive: true,
    isExpired: false,
    startedAt: now,
    expiresAt,
    remainingMs: 24 * 60 * 60 * 1000,
  };
}

export function createApiRouter(): Router {
  const router = Router();

  // Health / Status Check
  const healthHandler = (_req: Request, res: Response) => {
    res.json({
      status: "ok",
      hasServerKey: !!process.env.GEMINI_API_KEY,
      defaultModel: "gemini-2.5-flash"
    });
  };
  router.get("/health", healthHandler);
  router.get("/api/health", healthHandler);

  // Test Single API Key (Supports target model)
  const testSingleKeyHandler = async (req: Request, res: Response) => {
    try {
      const body = parseSafeBody(req);
      const key = body.key || req.body?.key || "";
      const model = body.model || req.body?.model;
      const result = await handleTestSingleKeyLogic(key, model);
      res.json(result);
    } catch (err: any) {
      console.error("[TestSingleKey] Error:", err);
      res.status(200).json({
        key: req.body?.key || "",
        maskedKey: "(error)",
        valid: false,
        error: cleanErrorMessage(err) || "Gagal menguji API key",
        latencyMs: 0,
      });
    }
  };
  router.post("/gemini/test-single-key", testSingleKeyHandler);
  router.post("/api/gemini/test-single-key", testSingleKeyHandler);

  // Test API Keys (Batch)
  const testKeysHandler = async (req: Request, res: Response) => {
    try {
      const body = parseSafeBody(req);
      const keys = body.keys || req.body?.keys || [];
      const model = body.model || req.body?.model;
      const result = await handleTestKeysLogic(keys, model);
      res.json(result);
    } catch (err: any) {
      console.error("[TestKeys] Error:", err);
      res.status(200).json({
        results: [],
        validCount: 0,
        total: 0,
        error: cleanErrorMessage(err) || "Gagal menguji API key",
      });
    }
  };
  router.post("/gemini/test-keys", testKeysHandler);
  router.post("/api/gemini/test-keys", testKeysHandler);

  // Test Models Compatibility for a single API Key (Full Health Diagnostic)
  const testModelsHandler = async (req: Request, res: Response) => {
    try {
      const body = parseSafeBody(req);
      const key = body.key || req.body?.key || "";
      const result = await handleTestModelsLogic(key);
      res.json(result);
    } catch (err: any) {
      console.error("[TestModels] Error:", err);
      res.status(200).json({
        success: false,
        isKeyValid: false,
        activeCount: 0,
        total: 0,
        error: cleanErrorMessage(err) || "Gagal memeriksa kompatibilitas model",
        models: [],
      });
    }
  };
  router.post("/gemini/test-models", testModelsHandler);
  router.post("/api/gemini/test-models", testModelsHandler);

  // Generate Microstock Prompts
  const generatePromptsHandler = async (req: Request, res: Response) => {
    try {
      const body = parseSafeBody(req);
      const result = await handleGeneratePromptsLogic(body);
      res.json(result);
    } catch (err: any) {
      console.error("[GeneratePrompts] Recovered from error:", err);
      const body = parseSafeBody(req);
      const count = Math.max(1, body.count || 3);
      const fallback = generateProceduralPrompts(
        count,
        body.type || 'icon',
        body.subCategory || 'business_finance',
        body.style || 'minimalist',
        body.colorMode || 'gradient',
        body.motionDynamics || 'flow',
        body.neonGlow ?? true,
        body.keywords || []
      );
      res.status(200).json({ prompts: fallback });
    }
  };
  router.post("/gemini/generate-prompts", generatePromptsHandler);
  router.post("/api/gemini/generate-prompts", generatePromptsHandler);

  // Generate Single HTML5 Animation Code
  const generateAnimationHandler = async (req: Request, res: Response) => {
    try {
      const body = parseSafeBody(req);
      const result = await handleGenerateAnimationLogic(body);
      res.json(result);
    } catch (err: any) {
      console.warn("[GenerateAnimation] Handled gracefully:", cleanErrorMessage(err));
      res.status(200).json({
        success: false,
        error: cleanErrorMessage(err) || "Gagal menghasilkan animasi Canvas dari prompt",
        html: "",
      });
    }
  };
  router.post("/gemini/generate-animation", generateAnimationHandler);
  router.post("/api/gemini/generate-animation", generateAnimationHandler);

  // Stream Single HTML5 Animation Code (Server-Sent Events)
  const streamAnimationHandler = async (req: Request, res: Response) => {
    try {
      const body = parseSafeBody(req);
      await handleStreamAnimationLogic(body, res);
    } catch (err: any) {
      console.warn("[StreamAnimation] Error:", cleanErrorMessage(err));
      if (!res.headersSent) {
        res.status(200).json({
          success: false,
          error: cleanErrorMessage(err) || "Gagal streaming animasi",
          html: "",
        });
      }
    }
  };
  router.post("/gemini/stream-animation", streamAnimationHandler);
  router.post("/api/gemini/stream-animation", streamAnimationHandler);

  // Generate Image to Motion (Special AI Vision)
  const imageToMotionHandler = async (req: Request, res: Response) => {
    try {
      const body = parseSafeBody(req);
      const result = await handleImageToMotionLogic(body);
      res.json(result);
    } catch (err: any) {
      console.warn("[ImageToMotion] Handled gracefully:", cleanErrorMessage(err));
      res.status(200).json({
        success: false,
        error: cleanErrorMessage(err) || "Gagal memproses animasi gambar",
        html: "",
      });
    }
  };
  router.post("/gemini/image-to-motion", imageToMotionHandler);
  router.post("/api/gemini/image-to-motion", imageToMotionHandler);

  // Generate Motion Prompt from Image (1 Clean Line Prompt per image)
  const imageToPromptHandler = async (req: Request, res: Response) => {
    try {
      const body = parseSafeBody(req);
      const result = await handleImageToPromptLogic(body);
      res.json(result);
    } catch (err: any) {
      console.error("[ImageToPrompt] Recovered from error:", err);
      const body = parseSafeBody(req);
      const fileName = body.fileName || 'image.png';
      const projectName = body.projectName || 'Default';
      res.status(200).json({
        success: true,
        fileName,
        projectName,
        prompt: `Dynamic 60 FPS motion graphic animation of ${fileName.replace(/\.[^/.]+$/, '')} featuring smooth articulated transformations, glowing particle emitter trails, and rhythmic kinetic dynamics on a clean background.`,
      });
    }
  };
  router.post("/gemini/image-to-prompt", imageToPromptHandler);
  router.post("/api/gemini/image-to-prompt", imageToPromptHandler);

  // Check Trial Status
  const checkTrialHandler = (req: Request, res: Response) => {
    const body = parseSafeBody(req);
    const ip = req.ip || (req.headers['x-forwarded-for'] as string) || 'default_ip';
    const result = handleCheckTrialLogic(body, ip);
    res.json(result);
  };
  router.post("/trial/check", checkTrialHandler);
  router.post("/api/trial/check", checkTrialHandler);

  // Start 1-Day Trial
  const startTrialHandler = (req: Request, res: Response) => {
    const body = parseSafeBody(req);
    const ip = req.ip || (req.headers['x-forwarded-for'] as string) || 'default_ip';
    const result = handleStartTrialLogic(body, ip);
    res.json(result);
  };
  router.post("/trial/start", startTrialHandler);
  router.post("/api/trial/start", startTrialHandler);

  return router;
}

export function createExpressApp() {
  const app = express();

  // Enable CORS & JSON parsing
  app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
    if (req.method === "OPTIONS") {
      return res.sendStatus(200);
    }
    next();
  });

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ extended: true, limit: "50mb" }));

  const apiRouter = createApiRouter();
  app.use("/api", apiRouter);
  app.use("/", apiRouter);

  // Global bulletproof error handler to guarantee ZERO HTTP 500 error responses
  app.use((err: any, _req: Request, res: Response, _next: any) => {
    console.warn("[Express Global Error Caught]:", err?.message || err);
    res.status(200).json({
      success: false,
      error: cleanErrorMessage(err) || "Terjadi kesalahan pada request",
      html: "",
      prompts: [],
    });
  });

  return app;
}
