import express, { Router, Request, Response } from "express";
import dotenv from "dotenv";
import { GoogleGenAI, Type, ThinkingLevel } from "@google/genai";
import { findCategoryById, generateProceduralPrompts } from "../src/constants/categories";
import {
  HELPERS_G_DOC,
  HELPERS_G_BG_DOC,
  HELPERS_G_VISION_DOC,
  stripLeadingCodeFenceAndLang,
  wrapCanvasCodeToHtml,
  createUniqueVariationSeed,
  normalizeCanvasCodeFingerprint,
  resolvePromptMotionPlan,
} from "../src/services/motionGeometryEngine";

export { wrapCanvasCodeToHtml };
export const resolveServerPromptMotionPlan = resolvePromptMotionPlan;

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

// Server-side in-memory prompt history bank & unsupported-model short-circuit cache (5 min TTL)
const serverPromptHistoryBank = new Set<string>();
const unsupportedServerModels = new Map<string, number>();
const unsupportedServerThinkingModels = new Set<string>();

export function isServerModelCachedUnsupported(model: string): boolean {
  const ts = unsupportedServerModels.get(model);
  if (!ts) return false;
  if (Date.now() - ts > 5 * 60 * 1000) {
    unsupportedServerModels.delete(model);
    return false;
  }
  return true;
}

export function getSmartThinkingConfig(
  targetModel: string,
  budgetOrPurpose: number | 'prompt' | 'animation' | 'vision' = 'animation'
): any {
  const purpose = typeof budgetOrPurpose === 'string' ? budgetOrPurpose : (budgetOrPurpose >= 1024 ? 'vision' : 'prompt');
  const m = (targetModel || '').toLowerCase();
  if (unsupportedServerThinkingModels.has(m)) return undefined;

  // Gemini 2.5 series: lightweight 128-token scratchpad avoids garbled spatial math without excessive cost
  if (m.includes('2.5')) {
    return { thinkingBudget: purpose === 'vision' ? 320 : purpose === 'animation' ? 128 : 0 };
  }

  // Gemini 3.1-Pro / 4.x Pro series: uses ThinkingLevel.LOW
  if (m.includes('3.1-pro') || m.includes('4-') || m.includes('thinking')) {
    return { thinkingLevel: ThinkingLevel.LOW };
  }

  // Gemini 3.8 uses LOW for geometric consistency; Flash-Lite keeps MINIMAL on first pass
  if (m.includes('3.8')) {
    return { thinkingLevel: ThinkingLevel.LOW };
  }
  if (m.includes('3.6') || m.includes('3.5') || m.includes('3.1-flash-lite') || m.includes('flash-lite')) {
    return { thinkingLevel: purpose === 'vision' ? ThinkingLevel.LOW : ThinkingLevel.MINIMAL };
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

export function getServerModelTimeoutMs(model: string): number {
  const m = sanitizeModel(model).toLowerCase();
  if (m.includes("3.1-pro") || m.includes("4-")) return 40000;
  if (m.includes("3.8") || m.includes("3.6")) return 34000;
  if (m.includes("2.5-flash-lite") || m.includes("3.1-flash-lite")) return 24000;
  if (m.includes("3.5-flash-lite")) return 26000;
  return 26000;
}

export function getServerModelRetryWaitMs(model: string): number {
  const m = sanitizeModel(model).toLowerCase();
  if (m.includes("3.1-pro") || m.includes("4-")) return 1100;
  if (m.includes("3.8") || m.includes("3.6")) return 850;
  if (m.includes("2.5-flash-lite") || m.includes("3.1-flash-lite")) return 350;
  if (m.includes("3.5-flash-lite")) return 500;
  return 650;
}

export async function generateContentWithFallback(
  ai: GoogleGenAI,
  primaryModel: string,
  generateParams: (model: string) => { contents: any; config?: any },
  maxRetriesPerModel = 1
): Promise<{ response: any; usedModel: string }> {
  const startedAt = Date.now();
  const VERCEL_SAFE_BUDGET_MS = 52000; // Leave 8s headroom below Vercel maxDuration: 60s

  // Put high-RPM lite models first in fallback chain, skipping any model recently cached as unsupported (404)
  const fallbackOrder = [
    "gemini-3.5-flash-lite",
    "gemini-3.1-flash-lite",
    "gemini-2.5-flash-lite",
    "gemini-2.5-flash",
    "gemini-flash-latest",
    "gemini-3.8-flash",
  ];
  const candidateModels = Array.from(new Set([
    primaryModel,
    ...fallbackOrder,
  ]))
    .filter((m) => !isServerModelCachedUnsupported(m))
    .slice(0, 3);

  const modelsToTry = candidateModels.length > 0 ? candidateModels : ["gemini-3.5-flash-lite", "gemini-2.5-flash-lite"];
  let lastError: any = null;

  for (const model of modelsToTry) {
    const allowedAttempts = maxRetriesPerModel;

    for (let attempt = 1; attempt <= allowedAttempts; attempt++) {
      const remainingBudget = VERCEL_SAFE_BUDGET_MS - (Date.now() - startedAt);
      if (remainingBudget < 5000) {
        throw new Error(cleanErrorMessage(lastError) || "Batas waktu aman server Vercel tercapai — mencoba model lebih cepat pada request berikutnya");
      }
      const modelTimeoutMs = Math.min(getServerModelTimeoutMs(model), remainingBudget);

      try {
        let timerId: any = null;
        const timeoutPromise = new Promise((_, reject) => {
          timerId = setTimeout(
            () => reject(new Error(`Timeout ${model} (> ${Math.round(modelTimeoutMs / 1000)}s)`)),
            modelTimeoutMs
          );
        });

        const { contents, config } = generateParams(model);
        const genPromise = ai.models.generateContent({
          model,
          contents,
          config,
        });

        try {
          const response: any = await Promise.race([genPromise, timeoutPromise]);
          return { response, usedModel: model };
        } finally {
          if (timerId) clearTimeout(timerId);
        }
      } catch (err: any) {
        lastError = err;
        const msg = cleanErrorMessage(err).toLowerCase();

        // Fail fast on invalid/unauthorized key — NEVER burn fallback models with a bad key
        const isAuthError =
          msg.includes("api_key_invalid") ||
          msg.includes("api key not valid") ||
          msg.includes("key is not valid") ||
          msg.includes("invalid api key") ||
          msg.includes("api_key_expired") ||
          msg.includes("unauthenticated") ||
          msg.includes("permission_denied") ||
          msg.includes("401") ||
          msg.includes("403");
        if (isAuthError) {
          throw new Error(cleanErrorMessage(err));
        }

        // Only retry same model without thinkingConfig if the error is specifically about thinking/budget/config argument
        const isConfigIssue =
          msg.includes("thinking") ||
          msg.includes("budget") ||
          msg.includes("invalid_argument") ||
          msg.includes("unsupported field");
        if (isConfigIssue) {
          try {
            const { contents, config } = generateParams(model);
            if (config && config.thinkingConfig) {
              unsupportedServerThinkingModels.add(model.toLowerCase());
              const safeConfig = { ...config };
              delete safeConfig.thinkingConfig;
              const retryRemaining = VERCEL_SAFE_BUDGET_MS - (Date.now() - startedAt);
              if (retryRemaining >= 5000) {
                const retryTimeoutMs = Math.min(Math.max(12000, getServerModelTimeoutMs(model) - 4000), retryRemaining);
                let retryTimer: any = null;
                const retryTimeout = new Promise((_, reject) => {
                  retryTimer = setTimeout(() => reject(new Error(`Timeout Retry (> ${Math.round(retryTimeoutMs / 1000)}s)`)), retryTimeoutMs);
                });
                try {
                  const retryResp: any = await Promise.race([
                    ai.models.generateContent({
                      model,
                      contents,
                      config: safeConfig,
                    }),
                    retryTimeout,
                  ]);
                  return { response: retryResp, usedModel: model };
                } finally {
                  if (retryTimer) clearTimeout(retryTimer);
                }
              }
            }
          } catch {
            // proceed to next fallback model
          }
        }

        const isNotFound =
          msg.includes("not found") ||
          msg.includes("404") ||
          msg.includes("not supported") ||
          msg.includes("unrecognized") ||
          msg.includes("proxy_generation_disabled") ||
          msg.includes("is not found");

        if (isNotFound) {
          unsupportedServerModels.set(model, Date.now());
          break;
        }

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

        if (isQuota || msg.includes("500") || msg.includes("overloaded") || msg.includes("503") || msg.includes("internal")) {
          // Model-specific breather before switching fallback model so Google burst subsides
          const left = VERCEL_SAFE_BUDGET_MS - (Date.now() - startedAt);
          if (left > 8000) {
            await new Promise((res) => setTimeout(res, getServerModelRetryWaitMs(model)));
          }
          break;
        } else if (isTransient && attempt < allowedAttempts) {
          await new Promise((res) => setTimeout(res, Math.min(1400, getServerModelRetryWaitMs(model) * attempt)));
          continue;
        } else {
          break;
        }
      }
    }
  }

  throw new Error(cleanErrorMessage(lastError));
}

// Geometry engine, HTML wrapper & sanitizers imported from ../src/services/motionGeometryEngine
export function extractHTMLFromMarkdown(text: string, isGreenScreen: boolean = false): string {
  const tick3 = String.fromCharCode(96, 96, 96);
  let cleanHTML = stripLeadingCodeFenceAndLang(text);

  const htmlFenceRegex = new RegExp(tick3 + 'html\\s*([\\s\\S]*?)' + tick3, 'i');
  const htmlMatch = (text || '').match(htmlFenceRegex);
  if (htmlMatch && htmlMatch[1]) {
    cleanHTML = htmlMatch[1].trim();
  } else {
    const startIdx = (text || '').toLowerCase().indexOf('<!doctype');
    const endIdx = (text || '').toLowerCase().lastIndexOf('</html>');
    if (startIdx !== -1 && endIdx !== -1) {
      cleanHTML = text.substring(startIdx, endIdx + 7).trim();
    }
  }

  cleanHTML = stripLeadingCodeFenceAndLang(cleanHTML);

  const lower = cleanHTML.toLowerCase();
  const bg = isGreenScreen ? '#00ff00' : '#080c14';

  const looksLikePureJs = !lower.includes('<!doctype') && !lower.includes('<html') && !lower.includes('<canvas');
  if (
    looksLikePureJs &&
    (/(?:function\s+(?:drawFrame|renderFrame|drawIcon|drawScene|render|draw|paint|animate)\s*\(|ctx\.(?:fill|stroke|beginPath|roundRect|arc|ellipse|bezierCurveTo|lineTo))/i.test(cleanHTML))
  ) {
    return wrapCanvasCodeToHtml(cleanHTML, isGreenScreen);
  }

  if (!lower.includes('<!doctype') || !lower.includes('</html>')) {
    if (lower.includes('<script') || lower.includes('requestanimationframe') || lower.includes('<canvas')) {
      let bodyContent = cleanHTML;
      if (!bodyContent.toLowerCase().includes('</script>')) {
        bodyContent += '\n  }\n  requestAnimationFrame(animate);\n</' + 'script>';
      }
      if (!bodyContent.toLowerCase().includes('<canvas')) {
        bodyContent = `<canvas id="c"></canvas>\n` + bodyContent;
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

  if (isGreenScreen && lower.includes('<style')) {
    cleanHTML = cleanHTML.replace(
      /(html\s*,\s*body\s*\{[^}]*background(?:-color)?\s*:\s*)(#[0-9a-fA-F]{3,8}|rgba?\([^)]+\)|[a-z]+)/gi,
      '$1#00ff00'
    );
  }

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
  const match = key.match(/AIza[0-9A-Za-z\-_]{30,}/);
  if (match) {
    return match[0];
  }
  return key;
}

function diagnoseServerPermissionReason(msg: string): string {
  const lower = (msg || "").toLowerCase();
  if (lower.includes("referer") || lower.includes("referrer") || lower.includes("http_referrer_blocked")) {
    return "Dibatasi HTTP Referrer Website di Google Cloud (izinkan domain Vercel/AI Studio atau pilih None)";
  }
  if (
    lower.includes("has not been used") ||
    lower.includes("is disabled") ||
    lower.includes("service_disabled") ||
    lower.includes("api_key_service_blocked") ||
    lower.includes("blocked")
  ) {
    return "Generative Language API belum diizinkan/diaktifkan di Google Cloud project key ini";
  }
  if (lower.includes("ip_address_blocked") || lower.includes("ip address")) {
    return "Dibatasi IP Address di Google Cloud Credentials";
  }
  return msg.length > 85 ? msg.substring(0, 85) + "..." : msg || "Akses ditolak (403 PERMISSION_DENIED)";
}

async function probeServerModelsRest(key: string, requestedModel?: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9000);
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}&pageSize=60`,
      { method: "GET", signal: controller.signal }
    );
    const data: any = await res.json().catch(() => ({}));
    if (res.ok && Array.isArray(data?.models)) {
      const availableModels = data.models
        .filter((m: any) => !Array.isArray(m.supportedGenerationMethods) || m.supportedGenerationMethods.includes("generateContent"))
        .map((m: any) => String(m.name || "").replace(/^models\//, ""))
        .filter(Boolean);

      const primary = sanitizeModel(requestedModel || "gemini-2.5-flash");
      const priorityPick = [
        primary,
        "gemini-2.5-flash",
        "gemini-2.5-flash-lite",
        "gemini-3.5-flash-lite",
        "gemini-3.1-flash-lite",
        "gemini-2.0-flash",
      ];
      const matchedModel =
        priorityPick.find((cand) => availableModels.includes(cand)) ||
        availableModels.find((m: string) => m.includes("flash")) ||
        availableModels[0] ||
        "gemini-2.5-flash";

      return { ok: true as const, availableModels, matchedModel };
    }

    const errMsg = cleanErrorMessage(data?.error?.message || `HTTP ${res.status}`);
    const lower = errMsg.toLowerCase();
    const errStatus = String(data?.error?.status || "").toUpperCase();
    const isTrueInvalid =
      errStatus === "UNAUTHENTICATED" ||
      res.status === 401 ||
      lower.includes("api_key_invalid") ||
      lower.includes("api key not valid") ||
      lower.includes("key is not valid") ||
      lower.includes("invalid api key") ||
      lower.includes("api_key_expired") ||
      lower.includes("suspended");

    if (isTrueInvalid) {
      return { ok: false as const, definiteInvalidKey: true, errorMsg: "API Key tidak valid atau salah ketik (ditolak Google)" };
    }
    if (res.status === 429 || lower.includes("resource_exhausted") || lower.includes("quota")) {
      return { ok: false as const, isQuota: true, errorMsg: errMsg };
    }
    if (res.status === 403 || lower.includes("permission_denied") || errStatus === "PERMISSION_DENIED") {
      return { ok: false as const, isPermissionDenied: true, errorMsg: diagnoseServerPermissionReason(errMsg) };
    }
    return { ok: false as const, errorMsg: errMsg };
  } catch (err: any) {
    return { ok: false as const, errorMsg: cleanErrorMessage(err) };
  } finally {
    clearTimeout(timer);
  }
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

  // Step 1: Zero-token Google official /v1beta/models check (model-agnostic & cold-start friendly)
  const restCheck = await probeServerModelsRest(key, requestedModel);
  if (restCheck.ok) {
    return {
      key,
      maskedKey,
      valid: true,
      testedModel: restCheck.matchedModel,
      latencyMs: Date.now() - start,
    };
  }
  if (restCheck.definiteInvalidKey) {
    return {
      key,
      maskedKey,
      valid: false,
      error: restCheck.errorMsg || "API Key tidak valid atau salah",
      latencyMs: Date.now() - start,
    };
  }
  if (restCheck.isQuota) {
    return {
      key,
      maskedKey,
      valid: true,
      isQuotaLimit: true,
      error: "Key Valid • Kuota limit sementara",
      latencyMs: Date.now() - start,
    };
  }

  const primaryModel = sanitizeModel(requestedModel || "gemini-2.5-flash");
  // Prioritize proven GA models before preview models so missing preview access never invalidates a valid key
  const candidateModels = Array.from(new Set([
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
    primaryModel,
  ])).slice(0, 3);

  const ai = new GoogleGenAI({
    apiKey: key,
    httpOptions: { headers: { "User-Agent": "aistudio-build" } },
  });

  let lastError: any = null;
  let lastPermMsg: string | null = restCheck.isPermissionDenied ? (restCheck.errorMsg || null) : null;
  let encounteredQuota = false;

  for (const model of candidateModels) {
    try {
      let timerId: any = null;
      const timeoutPromise = new Promise((_, reject) => {
        timerId = setTimeout(() => reject(new Error("Timeout verifikasi (> 9s)")), 9000);
      });

      const probePromise = ai.models.countTokens({
        model,
        contents: "ping",
      });

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
        msg.includes("suspended") ||
        /\b401\b/.test(msg);

      if (isTrueKeyInvalid) {
        return {
          key,
          maskedKey,
          valid: false,
          error: "API Key tidak valid atau salah",
          latencyMs: Date.now() - start,
        };
      }

      if (msg.includes("permission_denied") || /\b403\b/.test(msg)) {
        lastPermMsg = diagnoseServerPermissionReason(cleanMsg);
        continue;
      }

      if (msg.includes("resource_exhausted") || /\b429\b/.test(msg) || msg.includes("quota")) {
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
      error: "Key Valid • Kuota limit sementara (Gunakan model lain)",
      latencyMs: Date.now() - start,
    };
  }

  const rawMsg = lastPermMsg || cleanErrorMessage(lastError) || restCheck.errorMsg || "Gagal verifikasi API key";
  return {
    key,
    maskedKey,
    valid: false,
    error: rawMsg.length > 90 ? rawMsg.substring(0, 90) + "..." : rawMsg,
    latencyMs: Date.now() - start,
  };
}

// Logic for testing all models compatibility with an API key
export async function handleTestModelsLogic(rawKey: string) {
  let key = extractCleanApiKey(rawKey || "");
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

  const restCheck = await probeServerModelsRest(key);
  if (restCheck.definiteInvalidKey) {
    return {
      success: true,
      isKeyValid: false,
      activeCount: 0,
      total: modelsToTest.length,
      models: modelsToTest.map((m) => ({
        ...m,
        status: "invalid_key" as const,
        valid: false,
        message: "API Key Salah / Tidak Valid",
      })),
    };
  }

  const ai = new GoogleGenAI({
    apiKey: key,
    httpOptions: { headers: { "User-Agent": "aistudio-build" } },
  });

  // Probe in gentle batches of 2 with 150ms spacing to prevent burst 429 rate-limiting on free-tier keys
  const modelResults: any[] = [];
  for (let i = 0; i < modelsToTest.length; i += 2) {
    const pair = modelsToTest.slice(i, i + 2);
    const pairResults = await Promise.all(
      pair.map(async (m) => {
        const start = Date.now();
        try {
          let timerId: any = null;
          const toPromise = new Promise((_, reject) => {
            timerId = setTimeout(() => reject(new Error("Timeout (> 8s)")), 8000);
          });

          const testTargetModel = sanitizeModel(m.id);
          // Zero-output-token countTokens probe first (preserves generation quota)
          const testRun = ai.models.countTokens({
            model: testTargetModel,
            contents: "ping",
          });

          try {
            await Promise.race([testRun, toPromise]);
            return {
              id: m.id,
              name: m.name,
              badge: m.badge,
              status: "active" as const,
              valid: true,
              latencyMs: Date.now() - start,
              message: "Siap Digunakan • Hemat Token",
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
            lower.includes("key is not valid") ||
            lower.includes("invalid api key") ||
            lower.includes("api_key_expired")
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

          if (lower.includes("resource_exhausted") || /\b429\b/.test(lower) || lower.includes("quota")) {
            return {
              id: m.id,
              name: m.name,
              badge: m.badge,
              status: "quota_exhausted" as const,
              valid: true,
              latencyMs: Date.now() - start,
              message: "Key Valid • Kuota Limit (Gunakan Model Lain)",
            };
          }

          if (lower.includes("not found") || /\b404\b/.test(lower) || lower.includes("unrecognized") || lower.includes("not supported")) {
            return {
              id: m.id,
              name: m.name,
              badge: m.badge,
              status: "not_available" as const,
              valid: true,
              latencyMs: Date.now() - start,
              message: "Model Belum Tersedia di Akun/Region Ini",
            };
          }

          if (lower.includes("permission") || /\b403\b/.test(lower)) {
            return {
              id: m.id,
              name: m.name,
              badge: m.badge,
              status: "permission_denied" as const,
              valid: !!restCheck.ok,
              latencyMs: Date.now() - start,
              message: diagnoseServerPermissionReason(raw),
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
    modelResults.push(...pairResults);
    if (i + 2 < modelsToTest.length) {
      await new Promise((res) => setTimeout(res, 150));
    }
  }

  const activeCount = modelResults.filter((r) => r.status === "active").length;
  const isKeyValid = !!restCheck.ok || !modelResults.some((r) => r.status === "invalid_key");

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

  const concurrency = 5;
  const results: any[] = new Array(keys.length);

  for (let i = 0; i < keys.length; i += concurrency) {
    const chunk = keys.slice(i, i + concurrency);
    const chunkResults = await Promise.all(
      chunk.map((k) => handleTestSingleKeyLogic(k, requestedModel))
    );
    for (let j = 0; j < chunkResults.length; j++) {
      results[i + j] = chunkResults[j];
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

  const effGs = type !== 'bg' && !!isGreenScreen;
  const effGlow = effGs ? false : neonGlow;

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

  const glowDirective = effGs
    ? `\nSurface: CHROMA #00FF00 (solid non-green colors, crisp hard edges)`
    : `\nNeon Glow: ${effGlow ? 'ENABLED (luminous aura & radiant highlights)' : 'DISABLED (sharp crisp vector borders, zero blur/shadow)'}`;

  const catMeta = findCategoryById(subCategory, type);
  const categoryLine = catMeta
    ? `Microstock Category (Adobe Stock / Shutterstock): ${catMeta.enName} (${catMeta.name})\nCategory Theme & Keywords: ${catMeta.description} - ${catMeta.stockKeywords.join(', ')}\n`
    : (subCategory && subCategory !== 'all' && subCategory !== 'general' ? `Category / Domain: ${subCategory}\n` : '');

  const previousPrompts: string[] = Array.isArray(body.previousPrompts) ? body.previousPrompts : [];
  // Keep top 8 concise snippets for anti-repetition to save hundreds of input tokens per request
  const mergedBank = Array.from(new Set([...previousPrompts, ...serverPromptHistoryBank]))
    .slice(0, 8)
    .map((p) => p.substring(0, 75));
  const negativeList = mergedBank.length > 0
    ? `\nAVOID repeating concepts similar to: ${mergedBank.join(' | ')}`
    : '';

  const dynamicSessionSeed = `${Date.now().toString(36)}-${Math.floor(Math.random() * 100000).toString(36)}`;

  const targetCount = Math.max(1, count || 1);
  const CHUNK_SIZE = 10;
  const numChunks = Math.ceil(targetCount / CHUNK_SIZE);
  let allPrompts: string[] = [];

  for (let c = 0; c < numChunks; c++) {
    const needed = targetCount - allPrompts.length;
    if (needed <= 0) break;
    const batchCount = Math.min(CHUNK_SIZE, needed);

    const isSingle = batchCount === 1;
    let promptContent = '';
    if (type === 'bg') {
      promptContent = `Motion Director. Generate ${batchCount} unique FULL-FRAME 60 FPS looping MOTION BACKGROUND prompt(s) in English (Seed: ${dynamicSessionSeed}).
RULES: Edge-to-edge waves/grids/silk caustics; match motion organically to each scene; NO centered icons, NO particles, NO white flares.${negativeList}
${categoryLine}Style: ${style}${colorModeDirective}${glowDirective}
${typeInstruction}${keywordsDirective}
Return JSON array of ${batchCount} crisp 1-sentence string(s).`;
    } else {
      promptContent = `Motion Director. Generate ${batchCount} unique standalone VECTOR ICON motion prompt(s) in English (Seed: ${dynamicSessionSeed}).
RULES: Recognizable object built from 4-6 welded proportional parts with bold crisp rim contrast & internal mechanical motion; ZERO background plate/disc, ZERO ground oval shadow, ZERO squash distortion, ZERO diagonal glare bars or loose confetti.${negativeList}
${categoryLine}Style: ${style === 'minimalist' ? '3d_crest' : style}${colorModeDirective}${glowDirective}
${typeInstruction}${keywordsDirective}
Return JSON array of ${batchCount} crisp 1-sentence string(s) (max 26 words each).`;
    }

    try {
      const { response } = await generateContentWithFallback(
        ai,
        targetModel,
        (currentModel) => {
          const batchMaxTokens = isSingle ? 120 : Math.min(1100, Math.max(220, batchCount * 65));
          const config: any = {
            temperature: 0.9,
            maxOutputTokens: batchMaxTokens,
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.ARRAY,
              items: {
                type: Type.STRING,
              },
            },
          };
          const thinkingConfig = getSmartThinkingConfig(currentModel, 'prompt');
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
    motionDynamics = "auto",
    neonGlow = true,
    variationOffset = 0,
  } = body;

  if (!promptTopic) {
    throw new Error("Prompt topic wajib diisi");
  }

  const ai = getClient(apiKey);
  const targetModel = sanitizeModel(model);

  const catMeta = findCategoryById(subCategory, type);
  const catInfo = catMeta ? `${catMeta.enName} (${catMeta.name}) - ${catMeta.description}` : subCategory;

  const isBackground = type === 'bg';
  const effGs = !isBackground && !!isGreenScreen;
  const effGlow = effGs ? false : neonGlow;
  const seed = createUniqueVariationSeed(promptTopic, Math.max(0, Number(index) - 1), Number(variationOffset) || 0);
  const motionPlan = resolvePromptMotionPlan(promptTopic, type, style, motionDynamics, seed.variantIdx, seed.compMode, subCategory);

  const colorStyleDirective = effGs
    ? `GREEN SCREEN (#00ff00): solid non-green colors, shadowBlur=0, rim lw=Math.max(2.4,0.036*R), NO bg fillRect.`
    : effGlow
    ? `DARK BG (#080c14): shadowBlur=8 on bright accents (reset 0), rim lw=Math.max(2.2,0.034*R), NO bg fillRect.`
    : `CRISP VECTOR (#080c14): shadowBlur=0, rim lw=Math.max(2.2,0.034*R), NO bg fillRect.`;

  const geometryGuide = isBackground
    ? `FULL-BLEED MICROSTOCK BACKGROUND (must span -0.08*w..1.08*w & -0.08*h..1.08*h): Start with G.bgBackdrop(w,h,c0,c1,c2,'${['v', 'd', 'r', 'h'][(seed.variantIdx + seed.compMode) % 4]}'), then paint 2 cohesive edge-to-edge depth & foreground motion layers tailored literally to "${promptTopic.slice(0, 75)}". NO centered hero sticker icon, NO sparse noisy dot confetti. Palette: c0="${seed.palette[0]}", c1="${seed.palette[1]}", c2="${seed.palette[2]}", c3="${seed.palette[3]}". Plan: ${motionPlan.anatomyHint}`
    : `MICROSTOCK HERO ICON (14-28 lines crisp JS):
- Line 1 inside drawFrame MUST be a brief plan comment: // PLAN: base=<shape>; joints=<how parts connect>; move=<what moves>
- Draw inside ONE root G.part(cx,cy+hoverY,rot,1,1,function(R){ ... }) with scale R=S*0.80 inside [-0.58*R,+0.58*R] (NEVER mix S with R!).
- JOINT ANCHORS & PAINTER ORDER: Compute seam variables first — e.g. var lw=Math.max(2.2,0.034*R), bw=0.66*R, bh=0.46*R, y0=0.06*R, topY=y0-bh*0.5; then weld roof/handle/shackle directly onto topY+/-0.04*R! Center-anchored helpers: G.box/trap/uArc/crest/cloudShape/gearWheel/heartShape/dropShape/disc/oval/dome/grid/bolt/cross/leaf/ngon/star take center (x,y); ONLY G.bar takes yBottom.
- ZERO SLOP & ARTICULATED MOTION: Keep upright icons upright (rot=0); animate ONLY functional sub-parts anchored at true joints! ZERO floating corner dots/confetti, ZERO ground shadow ovals underneath, ZERO dark circular backing discs behind square/object icons, NEVER hide parts via if(sin>0).
- Anatomy (${promptTopic.slice(0, 70)}): ${motionPlan.anatomyHint}`;

  const helpersDoc = isBackground ? HELPERS_G_BG_DOC : HELPERS_G_DOC;

  const systemPrompt = `Senior Microstock 60 FPS Canvas 2D Motion Designer. Return ONLY RAW JS: function drawFrame(ctx, w, h, cx, cy, S, t) { ... } (no markdown/HTML/canvas/resize/rAF; never redeclare canvas/ctx/w/h/cx/cy/S/G).
${helpersDoc}
SPEC [${seed.tag}]: "${promptTopic}" (${catInfo}) | Style: ${style} | Palette: ${colorMode} [c0=${seed.palette[0]},c1=${seed.palette[1]},c2=${seed.palette[2]},c3=${seed.palette[3]}]
- ${geometryGuide}
- Motion (${motionPlan.label}): ${motionPlan.codeHint} | Rhythm: ${seed.motionExpr}.
- ${colorStyleDirective}`;

  const { response } = await generateContentWithFallback(
    ai,
    targetModel,
    (currentModel) => {
      const animConfig: any = {
        temperature: 0.35,
        maxOutputTokens: isBackground ? 1350 : 1200,
      };
      const smartThinking = getSmartThinkingConfig(currentModel, 'animation');
      if (smartThinking) {
        animConfig.thinkingConfig = smartThinking;
      }
      return { contents: systemPrompt, config: animConfig };
    }
  );

  const rawText = response.text || "";
  const cleanHTML = extractHTMLFromMarkdown(rawText, effGs);

  if (!cleanHTML || (!cleanHTML.toLowerCase().includes('<script') && !cleanHTML.toLowerCase().includes('<canvas'))) {
    throw new Error('AI mengembalikan kode yang belum lengkap');
  }

  return {
    id: 'anim_' + Date.now() + Math.random().toString(36).substring(7),
    title: `${promptTopic.substring(0, 35)}... (${index}/${total})`,
    prompt: promptTopic,
    type,
    style,
    subCategory,
    colorMode,
    motionDynamics,
    neonGlow: effGlow,
    html: cleanHTML,
    isGreenScreen: effGs,
  };
}

function parseServerBatchDelimiterOutput(rawText: string, expectedCount: number): string[] {
  const out: string[] = new Array(expectedCount).fill('');
  const trimmed = (rawText || '').trim();
  if (!trimmed) return out;

  const markerRegex = /\/\/\s*={2,}\s*ANIM[_\s-]*(\d+)\s*={2,}/gi;
  const matches = Array.from(trimmed.matchAll(markerRegex));
  if (matches.length > 0) {
    for (let i = 0; i < matches.length; i++) {
      const idx = parseInt(matches[i][1], 10);
      if (Number.isNaN(idx) || idx < 0 || idx >= expectedCount) continue;
      const start = (matches[i].index || 0) + matches[i][0].length;
      const end = i + 1 < matches.length ? (matches[i + 1].index || trimmed.length) : trimmed.length;
      out[idx] = trimmed.slice(start, end).trim();
    }
    if (out.some(Boolean)) return out;
  }

  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) return parsed.map((c: any) => String(c || '')).slice(0, expectedCount);
  } catch {
    const m = trimmed.match(/\[[\s\S]*\]/);
    if (m) {
      try {
        const parsed = JSON.parse(m[0]);
        if (Array.isArray(parsed)) return parsed.map((c: any) => String(c || '')).slice(0, expectedCount);
      } catch {}
    }
  }

  const fnParts = trimmed.split(/(?=(?:^|\n)[ \t]*function\s+drawFrame\s*\()/);
  const filteredParts = fnParts.map((p) => p.trim()).filter((p) => /function\s+drawFrame\s*\(/.test(p));
  for (let i = 0; i < Math.min(expectedCount, filteredParts.length); i++) {
    out[i] = filteredParts[i];
  }

  return out;
}

// 2-in-1 Batch Animation Code Generator (delimiter raw JS — eliminates JSON string escaping corruption)
export async function handleGenerateAnimationBatchLogic(body: any) {
  const {
    apiKey,
    model,
    prompts = [],
    type = "icon",
    subCategory = "teknologi",
    style = "minimalist",
    isGreenScreen = false,
    colorMode = "gradient",
    motionDynamics = "auto",
    neonGlow = true,
    variationOffset = 0,
  } = body;

  const promptList: string[] = Array.isArray(prompts)
    ? prompts.map((p: any) => String(p).trim()).filter(Boolean)
    : [];

  if (promptList.length === 0) {
    throw new Error("Daftar prompt batch wajib diisi");
  }

  const ai = getClient(apiKey);
  const targetModel = sanitizeModel(model);
  const isBackground = type === 'bg';
  const effGs = !isBackground && !!isGreenScreen;
  const effGlow = effGs ? false : neonGlow;

  const colorStyleDirective = effGs
    ? "GREEN SCREEN (#00ff00): solid non-green colors, shadowBlur=0, rim lw=Math.max(2.4,0.036*R), NO bg fillRect."
    : effGlow
    ? "DARK BG (#080c14): shadowBlur=8 on bright accents (reset 0), rim lw=Math.max(2.2,0.034*R), NO bg fillRect."
    : "CRISP VECTOR (#080c14): shadowBlur=0, rim lw=Math.max(2.2,0.034*R), NO bg fillRect.";

  const geometryGuide = isBackground
    ? "FULL-BLEED MICROSTOCK BACKGROUNDS (-0.08*w..1.08*w & -0.08*h..1.08*h): Each ANIM_i MUST start with G.bgBackdrop(w,h,c0,c1,c2,dir) + 2 distinct edge-to-edge custom thematic motion layers. ZERO centered icon stickers, ZERO loose noisy confetti."
    : "MICROSTOCK HERO ICONS (14-28 lines each): Start drawFrame with // PLAN: base=...; joints=...; move=... Draw inside ONE G.part(cx,cy+hoverY,rot,1,1,function(R){ ... }) spanning [-0.58*R,+0.58*R]. Use shared seam variables (e.g. topY=y0-bh*0.5) so parts weld/overlap >=0.04*R (ONLY G.bar uses yB); keep upright icons upright (rot=0) & articulate connected sub-parts logically; ZERO floating corner dots, ground ovals, or circle soup.";

  const seeds = promptList.map((p, idx) => createUniqueVariationSeed(p, idx, Number(variationOffset) || 0));
  const batchPlanSeen = new Set<string>();

  const topicLines = promptList.map((p, idx) => {
    const seed = seeds[idx];
    let v = seed.variantIdx;
    let cm = seed.compMode;
    let plan = resolvePromptMotionPlan(p, type, style, motionDynamics, v, cm, subCategory);
    for (let k = 1; k < 6 && batchPlanSeen.has(`${plan.helperName}:c${cm}:v${v}`); k++) {
      v = (seed.variantIdx + k * 5) % 6;
      cm = (seed.compMode + k) % 3;
      plan = resolvePromptMotionPlan(p, type, style, motionDynamics, v, cm, subCategory);
    }
    batchPlanSeen.add(`${plan.helperName}:c${cm}:v${v}`);
    return `// ===ANIM_${idx}=== "${p}" [${seed.tag}] | Palette: c0=${seed.palette[0]},c1=${seed.palette[1]},c2=${seed.palette[2]},c3=${seed.palette[3]} | Anatomy: ${plan.anatomyHint} | Motion (${plan.label}): ${plan.codeHint} | Rhythm: ${seed.motionExpr}`;
  }).join('\n');

  const helpersDoc = isBackground ? HELPERS_G_BG_DOC : HELPERS_G_DOC;

  const batchPrompt = `Senior Microstock 60 FPS Canvas 2D Motion Designer. Write ${promptList.length} 100% STRUCTURALLY DISTINCT, PROMPT-ACCURATE RAW JS functions separated ONLY by:
${promptList.map((_, idx) => `// ===ANIM_${idx}===\nfunction drawFrame(ctx, w, h, cx, cy, S, t) { ... }`).join('\n')}
STRICT ANTI-CLONE RULE: Each ANIM_i MUST depict the exact, literal distinct object/scene of its own prompt with different primary silhouette geometry, proportions & sub-part layout from all other slots! NEVER reuse the same layout/shape between ANIM_0 and ANIM_1!
${helpersDoc}
SPEC: ${geometryGuide}
Style: ${style} | Palette: ${colorMode} | ${colorStyleDirective}
NO markdown/HTML/canvas/resize/rAF or redeclaring canvas/ctx/w/h/cx/cy/S/G.
TOPICS:
${topicLines}`;

  const { response } = await generateContentWithFallback(
    ai,
    targetModel,
    (currentModel) => {
      const cfg: any = {
        temperature: 0.35,
        maxOutputTokens: Math.min(2500, Math.max(1250, promptList.length * (isBackground ? 1250 : 1150))),
      };
      const smartThinking = getSmartThinkingConfig(currentModel, 'animation');
      if (smartThinking) cfg.thinkingConfig = smartThinking;
      return { contents: batchPrompt, config: cfg };
    }
  );

  const rawText = (response.text || "").trim();
  const codeItems = parseServerBatchDelimiterOutput(rawText, promptList.length);
  const batchSeen = new Set<string>();

  const results = promptList.map((promptTopic, idx) => {
    const rawCode = codeItems[idx] || '';
    const html = rawCode ? extractHTMLFromMarkdown(rawCode, effGs) : '';
    const valid = /\b(?:G\.\w+|ctx\.(?:fill|stroke|beginPath|roundRect|arc|ellipse|bezierCurveTo|lineTo))\s*\(/i.test(rawCode);
    if (!html || !valid) return null;
    const fp = normalizeCanvasCodeFingerprint(html);
    if (fp && batchSeen.has(fp)) {
      return null;
    }
    if (fp) batchSeen.add(fp);
    return {
      id: 'anim_' + Date.now() + '_' + idx + Math.random().toString(36).substring(7),
      title: `${promptTopic.substring(0, 35)}... (${idx + 1}/${promptList.length})`,
      prompt: promptTopic,
      type,
      style,
      subCategory,
      colorMode,
      motionDynamics,
      neonGlow: effGlow,
      html,
      isGreenScreen: effGs,
    };
  });

  return { items: results };
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
    motionDynamics = "auto",
    neonGlow = true,
    variationOffset = 0,
  } = body;

  if (!promptTopic) {
    res.status(400).json({ error: "Prompt topic wajib diisi" });
    return;
  }

  const ai = getClient(apiKey);
  const targetModel = sanitizeModel(model);
  const isBackground = type === 'bg';
  const effGs = !isBackground && !!isGreenScreen;
  const effGlow = effGs ? false : neonGlow;
  const seed = createUniqueVariationSeed(promptTopic, Math.max(0, Number(index) - 1), Number(variationOffset) || 0);
  const motionPlan = resolvePromptMotionPlan(promptTopic, type, style, motionDynamics, seed.variantIdx, seed.compMode, subCategory);

  const colorStyleDirective = effGs
    ? "- GREEN SCREEN (#00ff00): solid non-green colors, shadowBlur=0, rim lw=Math.max(2.4,0.036*R), NO bg fillRect."
    : effGlow
    ? "- DARK BG (#080c14): shadowBlur=8 on bright accents (reset 0), rim lw=Math.max(2.2,0.034*R), NO bg fillRect."
    : "- CRISP VECTOR (#080c14): shadowBlur=0, rim lw=Math.max(2.2,0.034*R), NO bg fillRect.";

  const geometryGuide = isBackground
    ? `FULL-BLEED MICROSTOCK BACKGROUND (-0.08*w..1.08*w & -0.08*h..1.08*h): Start with G.bgBackdrop(w,h,c0,c1,c2,'${['v', 'd', 'r', 'h'][(seed.variantIdx + seed.compMode) % 4]}'), then paint 2 cohesive edge-to-edge depth & foreground motion layers tailored literally to "${promptTopic.slice(0, 75)}". NO centered sticker icon. ${motionPlan.anatomyHint}`
    : `MICROSTOCK HERO ICON (14-28 lines crisp JS): Start drawFrame with // PLAN: base=...; joints=...; move=... Draw inside ONE G.part(cx,cy+hoverY,rot,1,1,function(R){ ... }) spanning [-0.58*R,+0.58*R]. Use shared seam variables (e.g. topY=y0-bh*0.5) so parts weld/overlap >=0.04*R (ONLY G.bar uses yB); keep upright icons upright (rot=0) & articulate connected sub-parts logically; ZERO floating corner dots, ground ovals, or circle soup. ANATOMY: ${motionPlan.anatomyHint}`;

  const helpersDoc = isBackground ? HELPERS_G_BG_DOC : HELPERS_G_DOC;

  const systemPrompt = `Senior Microstock 60 FPS Canvas 2D Motion Designer. Output ONLY RAW JS: function drawFrame(ctx, w, h, cx, cy, S, t) { ... } (no markdown/HTML/canvas/resize/rAF; never redeclare canvas/ctx/w/h/cx/cy/S/G).
${helpersDoc}
SPEC [${seed.tag}]: "${promptTopic}" | ${geometryGuide} | Style: ${style} | Palette: ${colorMode} [c0=${seed.palette[0]},c1=${seed.palette[1]},c2=${seed.palette[2]},c3=${seed.palette[3]}] | Motion (${motionPlan.label}): ${motionPlan.codeHint} | Rhythm: ${seed.motionExpr}.
${colorStyleDirective}`;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  try {
    const animConfig: any = {
      temperature: 0.35,
      maxOutputTokens: isBackground ? 1350 : 1200,
    };
    const smartThinking = getSmartThinkingConfig(targetModel, 'animation');
    if (smartThinking) {
      animConfig.thinkingConfig = smartThinking;
    }

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

    const cleanHTML = extractHTMLFromMarkdown(fullText, effGs);

    res.write(`data: ${JSON.stringify({
      done: true,
      id: 'anim_' + Date.now() + Math.random().toString(36).substring(7),
      title: `${promptTopic.substring(0, 35)}... (${index}/${total})`,
      prompt: promptTopic,
      type,
      style,
      subCategory,
      colorMode,
      motionDynamics,
      neonGlow: effGlow,
      html: cleanHTML,
      isGreenScreen: effGs,
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
    type = "icon",
    motionDynamics = "flow",
    colorMode = "gradient",
    neonGlow = true,
    isGreenScreen = false,
    customInstructions = "",
  } = body;

  if (!imageBase64) {
    throw new Error("Data gambar (base64) wajib disertakan");
  }

  const resolvedType: 'icon' | 'bg' = type === 'bg' ? 'bg' : 'icon';
  const effectiveGs = resolvedType === 'bg' ? false : !!isGreenScreen;
  const effectiveGlow = effectiveGs ? false : !!neonGlow;
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

  try {
    const ai = getClient(apiKey);
    const targetModel = sanitizeModel(model);

    const masterMultimodalPrompt = resolvedType === 'bg'
      ? `Microstock Background Vision-to-Motion Engineer. Rekonstruksi FULL-FRAME seluruh komposisi GAMBAR REFERENSI BACKGROUND ini menjadi animasi Canvas 2D 60 FPS murni yang hampir identik secara visual (tata letak, lapisan kedalaman, horizon, pola garis/gelombang/kisi, arah cahaya, dan palet warna HEX persis gambar).
ATURAN FULL-BLEED BACKGROUND (-0.08*w..1.08*w, -0.08*h..1.08*h):
1. Mulai dengan G.bgBackdrop(w, h, c0, c1, c2, dir) memakai warna HEX dominan gambar.
2. Bangun minimal 2 lapisan struktur & elemen latar sesuai analisa detail gambar referensi (misal lengkung gelombang G.wave, pita G.capsule, kisi/perspektif garis, puncak gunung G.poly, lengkung orbit G.ring, dedaunan tepi G.leaf) yang mengisi seluruh frame dari sisi ke sisi.
3. Berikan gerakan 60 FPS profesional sesuai karakter visual gambar (parallax kedalaman halus, arus gelombang kontinyu, geser kisi/garis kecepatan, sapuan cahaya diagonal) — JANGAN mengecilkan gambar menjadi stiker ikon di tengah canvas, JANGAN membuat partikel acak berantakan.
${!effectiveGlow ? 'Matikan glow berlebihan (shadowBlur=0).' : 'Gunakan shadowBlur=8 secukupnya pada aksen cahaya terang lalu reset 0.'}
${customInstructions ? `Instruksi khusus: ${customInstructions}` : ''}
HELPERS G: ${HELPERS_G_VISION_DOC}
Outputkan HANYA blok metadata JSON + fungsi RAW JS (tanpa markdown/HTML/deklarasi canvas/ctx/w/h/cx/cy/S/G):
<script type="application/json" id="shape-analysis">{"objectName":"...","shapeDescription":"...","detectedElements":[],"professionalMotionPlan":"...","similaritySynthesis":"...","glowColor":"#38bdf8"}</script>
function drawFrame(ctx, w, h, cx, cy, S, t) { ... }`
      : `Canvas 2D Motion Coder. Rekonstruksi objek GAMBAR REFERENSI menjadi animasi ikon microstock 60 FPS JS murni berpusat via G.part(cx, cy+hoverY, rot, 1, 1, fn) skala R=S*0.80.
Mulai isi drawFrame dengan 1 baris komentar // PLAN: base=...; joints=...; move=...
Gerak OTOMATIS sesuai karakter objek gambar (mis. bel berayun, roda/gearWheel berputar, grafik G.bar/G.pie naik halus tanpa <0.14*R, jantung berdenyut, atau floating tegak rot=0 — JANGAN memutar objek tegak 360 derajat, JANGAN berkedip hilang via if(sin>0)).
Mode: ${colorMode} | ${effectiveGs ? 'GREEN SCREEN (#00ff00): solid non-green colors, shadowBlur=0, rim lw=Math.max(2.4,0.036*R), NO bg fillRect' : effectiveGlow ? 'BG Gelap (#080c14): shadowBlur=8 accents (reset 0), rim lw=Math.max(2.2,0.034*R)' : 'BG Gelap (#080c14): shadowBlur=0 crisp vector, rim lw=Math.max(2.2,0.034*R)'}.
${customInstructions ? `Instruksi: ${customInstructions}` : ''}
HELPERS G: ${HELPERS_G_VISION_DOC}
ATURAN: (1) Semua (x,y) pada G.box/trap/uArc/crest/cloudShape/gearWheel/heartShape/dropShape/disc/oval/dome/grid/bolt/cross/leaf adalah TITIK TENGAH (HANYA G.bar pakai yBottom); (2) PAINTER ORDER (lapisan belakang dulu -> badan utama -> emblem/ikon depan TERAKHIR) dengan rim seragam; (3) Semua shape WAJIB berada di dalam ONE root G.part(cx,cy+hoverY,...) memakai anchor sambungan rapat (overlap >=0.04*R mengisi proporsional [-0.58*R,+0.58*R]), ZERO bagian lepas di pojok luar, ZERO piringan lingkaran latar gelap di belakang ikon, ZERO kotak/garis transparan, ZERO gerigi liar.
Outputkan HANYA blok metadata + fungsi RAW JS (tanpa markdown/HTML/deklarasi canvas/ctx/w/h/cx/cy/S/G):
<script type="application/json" id="shape-analysis">{"objectName":"...","shapeDescription":"...","detectedElements":[],"professionalMotionPlan":"...","similaritySynthesis":"...","glowColor":"#38bdf8"}</script>
function drawFrame(ctx, w, h, cx, cy, S, t) { ... }`;

    const { response } = await generateContentWithFallback(
      ai,
      targetModel,
      (currentModel) => {
        const config: any = {
          temperature: 0.15,
          maxOutputTokens: resolvedType === 'bg' ? 1900 : 1750,
        };
        const smartThinking = getSmartThinkingConfig(currentModel, 'vision');
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

    const rawText = response.text || "";
    const cleanHTML = extractHTMLFromMarkdown(rawText, effectiveGs);

    if (cleanHTML.toLowerCase().includes('<canvas') && cleanHTML.toLowerCase().includes('requestanimationframe')) {
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
    type: resolvedType,
    style: colorMode,
    subCategory: 'image-to-motion',
    colorMode,
    motionDynamics,
    neonGlow: effectiveGlow,
    html: generatedHtml,
    isGreenScreen: effectiveGs,
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
    const requestedType: 'icon' | 'bg' | 'auto' =
      body.type === 'bg' ? 'bg' : body.type === 'icon' ? 'icon' : 'auto';

    const pureBase64 = imageBase64.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, "");

    const ai = getClient(apiKey);

    const promptDirective = requestedType === 'bg'
      ? `Computer Vision Microstock Background Motion Director. Analyze this FULL-FRAME background image closely and write EXACTLY ONE SINGLE CONTINUOUS LINE of a 60 FPS motion graphics background prompt (25-40 words, NO line breaks, NO quotes, NO markdown). Preserve exact backdrop composition, depth layers, horizon/perspective/ribbons/grid pattern, exact HEX palette, and smooth seamless full-frame 60 FPS motion (parallax drift, wave phase, diagonal luster sweep).`
      : requestedType === 'icon'
      ? `Computer Vision Microstock Icon Motion Director. Analyze this reference icon and write EXACTLY ONE SINGLE CONTINUOUS LINE of a 60 FPS motion graphics icon prompt (20-35 words, NO line breaks, NO quotes, NO markdown). Specify exact central subject silhouette, connected sub-parts & proportions, exact HEX palette, and authentic theme-appropriate 60 FPS motion.`
      : `Computer Vision Motion Director. Detect whether this image is a centered icon OR a full-frame background scene and write EXACTLY ONE SINGLE CONTINUOUS LINE of a 60 FPS motion graphics animation prompt (22-38 words, NO line breaks, NO quotes, NO markdown). Include exact visual anatomy/layout, exact HEX palette, and authentic 60 FPS seamless looping motion matching the artwork.`;

    const { response } = await generateContentWithFallback(
      ai,
      targetModel,
      (currentModel) => {
        const config: any = {
          temperature: 0.3,
          maxOutputTokens: 320,
        };
        const smartThinking = getSmartThinkingConfig(currentModel, 'prompt');
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
      1
    );

    let raw = response.text || "";
    let cleanPrompt = raw
      .replace(/^["'`\s]+|["'`\s]+$/g, "")
      .replace(/^(?:Prompt|Motion Prompt|Result|Output|Here is the prompt)[\s:=*-]+/i, "")
      .replace(/\r?\n+/g, " ")
      .replace(/\s{2,}/g, " ")
      .trim();

    if (!cleanPrompt) {
      cleanPrompt = requestedType === 'bg'
        ? `Full-frame 60 FPS microstock motion background inspired by ${fileName.replace(/\.[^/.]+$/, "")} with layered depth parallax, smooth luminous wave flow, and seamless loop.`
        : `Clean 60 FPS microstock vector icon animation of ${fileName.replace(/\.[^/.]+$/, "")} with connected overlapping geometry, bold outlines, and smooth theme-matched motion.`;
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
    const requestedType = safeBody.type === 'bg' ? 'bg' : 'icon';
    return {
      success: true,
      fileName,
      projectName,
      prompt: requestedType === 'bg'
        ? `Full-frame 60 FPS microstock motion background inspired by ${fileName.replace(/\.[^/.]+$/, "")} with layered depth parallax, smooth luminous wave flow, and seamless loop.`
        : `Clean 60 FPS microstock vector icon animation of ${fileName.replace(/\.[^/.]+$/, "")} with connected overlapping geometry, bold outlines, and smooth theme-matched motion.`,
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
      const effGs = (body.type || 'icon') !== 'bg' && !!body.isGreenScreen;
      const effGlow = effGs ? false : (body.neonGlow ?? true);
      const fallback = generateProceduralPrompts(
        count,
        body.type || 'icon',
        body.subCategory || 'business_finance',
        body.style || 'minimalist',
        body.colorMode || 'gradient',
        body.motionDynamics || 'flow',
        effGlow,
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

  // Generate Batch HTML5 Animation Code (2-in-1 per request)
  const generateAnimationBatchHandler = async (req: Request, res: Response) => {
    try {
      const body = parseSafeBody(req);
      const result = await handleGenerateAnimationBatchLogic(body);
      res.json(result);
    } catch (err: any) {
      console.warn("[GenerateAnimationBatch] Handled gracefully:", cleanErrorMessage(err));
      res.status(200).json({
        success: false,
        error: cleanErrorMessage(err) || "Gagal menghasilkan batch animasi",
        items: [],
      });
    }
  };
  router.post("/gemini/generate-animation-batch", generateAnimationBatchHandler);
  router.post("/api/gemini/generate-animation-batch", generateAnimationBatchHandler);

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
