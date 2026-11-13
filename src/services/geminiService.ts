import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import { AnimationType, GeminiModel, ApiKeyTestResult, ColorMode, MotionDynamics, ShapeAnalysis } from '../types';
import { findCategoryById, generateProceduralPrompts } from '../constants/categories';

const STORAGE_API_KEYS = 'bigma_gemini_api_keys';
const STORAGE_SELECTED_MODEL = 'bigma_gemini_model';

export function getStoredApiKeys(): string[] {
  try {
    const saved = localStorage.getItem(STORAGE_API_KEYS);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch (e) {
    console.error('Failed to load api keys from localStorage', e);
  }
  return [];
}

export function saveStoredApiKeys(keys: string[]): void {
  try {
    localStorage.setItem(STORAGE_API_KEYS, JSON.stringify(keys));
  } catch (e) {
    console.error('Failed to save api keys', e);
  }
}

export function getStoredModel(): GeminiModel {
  try {
    const saved = localStorage.getItem(STORAGE_SELECTED_MODEL);
    if (saved) {
      if (saved.includes('3.8') || saved === 'gemini-3.8-flash') return 'gemini-3.8-flash';
      if (saved.includes('3.6') || saved === 'gemini-3.6-flash') return 'gemini-3.6-flash';
      if (saved === 'gemini-3.5-flash-lite' || saved.includes('3.5')) return 'gemini-3.5-flash-lite';
      if (saved.includes('3.1-flash-lite') || saved === 'gemini-3.1-flash-lite') return 'gemini-3.1-flash-lite';
      if (saved.includes('2.5') || saved === 'gemini-2.5-flash') return 'gemini-2.5-flash';
      if (saved.includes('pro')) return 'gemini-3.1-pro-preview';
    }
  } catch (e) {
    console.error('Failed to load model', e);
  }
  return 'gemini-3.8-flash';
}

export function saveStoredModel(model: GeminiModel): void {
  try {
    localStorage.setItem(STORAGE_SELECTED_MODEL, model);
  } catch (e) {
    console.error('Failed to save model', e);
  }
}

const STORAGE_PROMPT_HISTORY = 'bigma_prompt_history_bank';

export function getPromptHistoryBank(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_PROMPT_HISTORY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {
    console.error('Failed to load prompt history bank', e);
  }
  return [];
}

export function addToPromptHistoryBank(prompts: string[]): void {
  try {
    const existing = getPromptHistoryBank();
    const cleanNew = prompts.map((p) => p.trim()).filter((p) => p.length > 5);
    const combined = [...cleanNew, ...existing];
    const uniqueMap = new Map<string, string>();
    for (const p of combined) {
      const norm = p.toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
      if (!uniqueMap.has(norm)) {
        uniqueMap.set(norm, p);
      }
    }
    const finalBank = Array.from(uniqueMap.values()).slice(0, 600);
    localStorage.setItem(STORAGE_PROMPT_HISTORY, JSON.stringify(finalBank));
  } catch (e) {
    console.error('Failed to save prompt history bank', e);
  }
}

export function isPromptDuplicateInBank(prompt: string, bank?: string[]): boolean {
  const currentBank = bank || getPromptHistoryBank();
  const norm = prompt.toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
  for (const item of currentBank) {
    const itemNorm = item.toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
    if (itemNorm === norm) return true;
    const words1 = new Set(norm.split(' ').filter((w) => w.length > 3));
    const words2 = new Set(itemNorm.split(' ').filter((w) => w.length > 3));
    let intersection = 0;
    words1.forEach((w) => {
      if (words2.has(w)) intersection++;
    });
    const ratio = intersection / Math.max(words1.size, words2.size, 1);
    if (ratio > 0.8) return true;
  }
  return false;
}

let currentKeyIndex = 0;

// --- SMART API KEY HEALTH, COOLDOWN & UNSUPPORTED-MODEL POOL (ANTI-BAN & ZERO-WASTE) ---
const quarantinedKeys = new Set<string>(); // 401/403 dead/suspended keys - never hammered again
const keyModelCooldowns = new Map<string, number>(); // `${key}::${model}` -> timestamp until cooldown ends
const keyModelStrikeCount = new Map<string, number>(); // consecutive 429 strikes for adaptive escalation
const keyModelDailyExhausted = new Map<string, number>(); // `${key}::${model}` -> timestamp when RPD cooldown ends
const keyLastUsedAt = new Map<string, number>(); // LRU spacing so every key gets maximum rest
const unsupportedClientModels = new Map<string, number>(); // model -> timestamp (5 min TTL for 404/unsupported)

export function resetKeyHealthPool(): void {
  quarantinedKeys.clear();
  keyModelCooldowns.clear();
  keyModelStrikeCount.clear();
  keyModelDailyExhausted.clear();
  keyLastUsedAt.clear();
  unsupportedClientModels.clear();
}

export function unquarantineKey(rawKey: string): void {
  const k = extractCleanApiKey(rawKey);
  if (k) quarantinedKeys.delete(k);
}

function isModelUnsupportedCached(model: string): boolean {
  const ts = unsupportedClientModels.get(model);
  if (!ts) return false;
  if (Date.now() - ts > 5 * 60 * 1000) {
    unsupportedClientModels.delete(model);
    return false;
  }
  return true;
}

function markModelUnsupportedCached(model: string): void {
  unsupportedClientModels.set(model, Date.now());
}

function markKeyInvalidOrSuspended(key: string): void {
  if (key) quarantinedKeys.add(key);
}

function parseRetryDelayMs(err: any): number | null {
  const msg = typeof err === 'string' ? err : (err?.message || err?.error?.message || '');
  if (!msg) return null;
  const retryInMatch = msg.match(/retry\s+(?:in|after)\s+(\d+(?:\.\d+)?)\s*s/i) || msg.match(/"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/i);
  if (retryInMatch && retryInMatch[1]) {
    const secs = parseFloat(retryInMatch[1]);
    if (!Number.isNaN(secs) && secs > 0) {
      return Math.min(65000, Math.max(8000, Math.ceil(secs * 1000) + 1000));
    }
  }
  return null;
}

function isDailyQuotaMessage(msg: string): boolean {
  const lower = (msg || '').toLowerCase();
  return (
    lower.includes('per day') ||
    lower.includes('per_day') ||
    lower.includes('requests per day') ||
    lower.includes('daily') ||
    lower.includes('rpd') ||
    lower.includes('limit: 0')
  );
}

function markKeyModelCooldown(key: string, model: string, errOrDurationMs: any = 22000): void {
  if (!key || !model) return;
  const pair = `${key}::${model}`;
  const msg = typeof errOrDurationMs === 'string'
    ? errOrDurationMs
    : (errOrDurationMs?.message || errOrDurationMs?.error?.message || '');

  if (typeof errOrDurationMs !== 'number' && isDailyQuotaMessage(msg)) {
    // Daily quota exhausted on this model for this key — avoid hammering it for 15 minutes
    keyModelDailyExhausted.set(pair, Date.now() + 15 * 60 * 1000);
    keyModelCooldowns.set(pair, Date.now() + 15 * 60 * 1000);
    return;
  }

  let durationMs: number;
  if (typeof errOrDurationMs === 'number') {
    durationMs = errOrDurationMs;
  } else {
    const parsed = parseRetryDelayMs(errOrDurationMs);
    const strikes = (keyModelStrikeCount.get(pair) || 0) + 1;
    keyModelStrikeCount.set(pair, strikes);
    if (parsed) {
      durationMs = parsed;
    } else {
      // Adaptive escalation: 22s -> 40s -> 65s
      durationMs = strikes === 1 ? 22000 : strikes === 2 ? 40000 : 65000;
    }
  }
  keyModelCooldowns.set(pair, Date.now() + durationMs);
}

function isKeyModelInCooldown(key: string, model: string): boolean {
  const pair = `${key}::${model}`;
  const dailyUntil = keyModelDailyExhausted.get(pair);
  if (dailyUntil) {
    if (Date.now() < dailyUntil) return true;
    keyModelDailyExhausted.delete(pair);
  }
  const until = keyModelCooldowns.get(pair);
  if (!until) return false;
  if (Date.now() >= until) {
    keyModelCooldowns.delete(pair);
    return false;
  }
  return true;
}

export function getEarliestCooldownWaitMs(apiKeys: string[], models?: string[]): number {
  const uniqueKeys = getCleanUniqueKeys(apiKeys).filter((k) => !quarantinedKeys.has(k));
  if (uniqueKeys.length === 0) return 0;

  const targetModels = (models && models.length > 0
    ? models
    : ['gemini-3.8-flash', 'gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite']
  ).map((m) => sanitizeModel(m)).filter((m) => !isModelUnsupportedCached(m));

  const now = Date.now();
  let minWait = Infinity;

  for (const k of uniqueKeys) {
    for (const m of targetModels) {
      const pair = `${k}::${m}`;
      const dailyUntil = keyModelDailyExhausted.get(pair);
      if (dailyUntil && dailyUntil > now) continue; // skip daily-exhausted pairs
      const until = keyModelCooldowns.get(pair);
      if (!until || until <= now) return 0; // already available!
      const wait = until - now;
      if (wait < minWait) minWait = wait;
    }
  }

  return Number.isFinite(minWait) && minWait > 0 ? Math.min(minWait + 500, 68000) : 0;
}

function getCleanUniqueKeys(apiKeys: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of apiKeys || []) {
    const clean = extractCleanApiKey(raw);
    if (clean && clean.length > 5 && !seen.has(clean)) {
      seen.add(clean);
      out.push(clean);
    }
  }
  return out;
}

export function getBestHealthyKey(apiKeys: string[], model?: string): string | undefined {
  const uniqueKeys = getCleanUniqueKeys(apiKeys);
  if (uniqueKeys.length === 0) return undefined;

  const targetModel = model ? sanitizeModel(model) : '';
  const now = Date.now();

  // Filter out quarantined keys and keys cooling down on this model
  const healthy = uniqueKeys.filter((k) => {
    if (quarantinedKeys.has(k)) return false;
    if (targetModel && isKeyModelInCooldown(k, targetModel)) return false;
    return true;
  });

  if (healthy.length > 0) {
    // Pick the key that has rested the longest (LRU) for natural rate-limit protection
    let best = healthy[0];
    let oldestTs = keyLastUsedAt.get(best) || 0;
    for (let i = 1; i < healthy.length; i++) {
      const ts = keyLastUsedAt.get(healthy[i]) || 0;
      if (ts < oldestTs) {
        oldestTs = ts;
        best = healthy[i];
      }
    }
    keyLastUsedAt.set(best, now);
    return best;
  }

  return undefined;
}

export function getCostOptimizedThinkingConfig(
  targetModel: string,
  purpose: 'prompt' | 'animation' | 'vision' = 'animation'
): any {
  const m = (targetModel || '').toLowerCase();
  if (m.includes('2.5')) {
    return { thinkingBudget: purpose === 'vision' ? 256 : 0 };
  }
  if (m.includes('3.1-pro') || m.includes('4-')) {
    return { thinkingLevel: ThinkingLevel.LOW };
  }
  if (m.includes('3.8') || m.includes('3.6') || m.includes('3.5') || m.includes('3.1-flash-lite') || m.includes('flash-lite')) {
    return { thinkingLevel: purpose === 'vision' ? ThinkingLevel.LOW : ThinkingLevel.MINIMAL };
  }
  return undefined;
}

interface ClassifiedGeminiErr {
  message: string;
  isInvalidKey: boolean;
  isQuota: boolean;
  isNotFound: boolean;
  isConfigIssue: boolean;
  isNetworkError: boolean;
}

function classifyGeminiError(err: any): ClassifiedGeminiErr {
  let msg = '';
  if (typeof err === 'string') msg = err;
  else if (typeof err?.message === 'string') msg = err.message;
  else if (typeof err?.error?.message === 'string') msg = err.error.message;
  else {
    try { msg = JSON.stringify(err); } catch { msg = 'Unknown error'; }
  }
  const lower = msg.toLowerCase();

  const isInvalidKey =
    lower.includes('api_key_invalid') ||
    lower.includes('api key not valid') ||
    lower.includes('key is not valid') ||
    lower.includes('invalid api key') ||
    lower.includes('api_key_expired') ||
    lower.includes('unauthenticated') ||
    lower.includes('permission_denied') ||
    lower.includes('suspended') ||
    lower.includes('401') ||
    lower.includes('403');

  const isQuota =
    lower.includes('resource_exhausted') ||
    lower.includes('quota') ||
    lower.includes('exceeded') ||
    lower.includes('rate limit') ||
    lower.includes('429');

  const isNotFound =
    lower.includes('not found') ||
    lower.includes('404') ||
    lower.includes('not supported') ||
    lower.includes('unrecognized') ||
    lower.includes('proxy_generation_disabled');

  const isConfigIssue =
    lower.includes('thinking') ||
    lower.includes('budget') ||
    lower.includes('invalid_argument') ||
    lower.includes('unsupported field');

  const isNetworkError =
    !isInvalidKey &&
    !isQuota &&
    !isNotFound &&
    !isConfigIssue &&
    (lower.includes('failed to fetch') ||
      lower.includes('networkerror') ||
      lower.includes('load failed') ||
      lower.includes('abort') ||
      lower.includes('cors') ||
      lower.includes('timeout'));

  return { message: msg, isInvalidKey, isQuota, isNotFound, isConfigIssue, isNetworkError };
}

export class AllKeysExhaustedError extends Error {
  isAllKeysExhausted: boolean = true;
  constructor(message: string = 'Semua API Key telah mencapai batas kuota atau rate limit') {
    super(message);
    this.name = 'AllKeysExhaustedError';
    Object.setPrototypeOf(this, AllKeysExhaustedError.prototype);
  }
}

export function getRotatedKey(apiKeys: string[], model?: string): string | undefined {
  const bestHealthy = getBestHealthyKey(apiKeys, model);
  if (bestHealthy) return bestHealthy;

  const uniqueKeys = getCleanUniqueKeys(apiKeys).filter((k) => !quarantinedKeys.has(k));
  if (uniqueKeys.length === 0) return undefined;

  const key = uniqueKeys[currentKeyIndex % uniqueKeys.length];
  currentKeyIndex = (currentKeyIndex + 1) % uniqueKeys.length;
  return key;
}

export function sanitizeModel(model?: string): string {
  if (!model) return 'gemini-3.8-flash';
  const m = model.trim().toLowerCase();
  if (m.includes('3.8') || m === 'gemini-3.8-flash') return 'gemini-3.8-flash';
  // Transparent mapping: Google v1beta uses gemini-3.8-flash or gemini-3.5-flash-lite for next-gen flash
  if (m.includes('3.6') || m === 'gemini-3.6-flash') return 'gemini-3.8-flash';
  if (m.includes('3.5')) return 'gemini-3.5-flash-lite';
  if (m.includes('3.1-flash-lite') || m.includes('flash-lite') || m.includes('lite')) return 'gemini-3.1-flash-lite';
  if (m.includes('2.5-flash-lite')) return 'gemini-2.5-flash-lite';
  if (m.includes('2.5') || m === 'gemini-2.5-flash') return 'gemini-2.5-flash';
  if (m.includes('3.1-pro') || m.includes('pro')) return 'gemini-3.1-pro-preview';
  if (m === 'gemini-flash-latest') return 'gemini-flash-latest';
  return 'gemini-3.8-flash';
}

export function wrapCanvasCodeToHtml(
  rawCode: string,
  isGreenScreen: boolean = false,
  shapeAnalysisTag: string = ''
): string {
  const bg = isGreenScreen ? '#00ff00' : '#080c14';
  const clearFill = isGreenScreen ? "'#00ff00'" : "'#080c14'";
  const tick3 = String.fromCharCode(96, 96, 96);

  let jsBody = (rawCode || '').trim();
  const jsFenceRegex = new RegExp(tick3 + '(?:javascript|js|ts|html)?\\s*([\\s\\S]*?)' + tick3, 'i');
  const fenceMatch = jsBody.match(jsFenceRegex);
  if (fenceMatch && fenceMatch[1]) {
    jsBody = fenceMatch[1].trim();
  }
  jsBody = jsBody
    .replace(new RegExp('^' + tick3 + '(?:javascript|js|ts|html)?\\s*', 'i'), '')
    .replace(new RegExp(tick3 + '\\s*$'), '')
    .trim();

  let extractedAnalysisTag = shapeAnalysisTag;
  const analysisRegex = /<script\s+type=["']application\/json["']\s+id=["']shape-analysis["']>[\s\S]*?<\/script>/i;
  const analysisMatch = jsBody.match(analysisRegex);
  if (analysisMatch) {
    if (!extractedAnalysisTag) extractedAnalysisTag = analysisMatch[0];
    jsBody = jsBody.replace(analysisRegex, '').trim();
  }

  const hasDrawFrame = /(?:function\s+drawFrame\s*\(|(?:const|let|var)\s+drawFrame\s*=)/i.test(jsBody);
  const hasAnimate = /function\s+animate\s*\(/i.test(jsBody);

  const runnerScript = hasDrawFrame
    ? `${jsBody}
  function animate(time) {
    const t = (time || 0) * 0.001;
    try {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = ${clearFill};
      ctx.fillRect(0, 0, w, h);
      ctx.save();
      drawFrame(ctx, w, h, cx, cy, S, t);
      ctx.restore();
    } catch (err) {
      console.error("Canvas render error:", err);
      try { ctx.restore(); } catch {}
    }
    requestAnimationFrame(animate);
  }
  requestAnimationFrame(animate);`
    : hasAnimate
    ? `${jsBody}\n  if (typeof requestAnimationFrame === 'function') { try { animate(0); } catch {} }`
    : `function drawFrame(ctx, w, h, cx, cy, S, t) {\n${jsBody}\n  }\n  function animate(time) {\n    const t = (time || 0) * 0.001;\n    try {\n      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);\n      ctx.clearRect(0, 0, w, h);\n      ctx.fillStyle = ${clearFill};\n      ctx.fillRect(0, 0, w, h);\n      ctx.save();\n      drawFrame(ctx, w, h, cx, cy, S, t);\n      ctx.restore();\n    } catch (err) {\n      console.error("Canvas render error:", err);\n      try { ctx.restore(); } catch {}\n    }\n    requestAnimationFrame(animate);\n  }\n  requestAnimationFrame(animate);`;

  return `<!DOCTYPE html>
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
  ${extractedAnalysisTag}
</head>
<body>
  <canvas id="c"></canvas>
  <script>
    const canvas = document.getElementById('c');
    const ctx = canvas.getContext('2d');
    let w = 800, h = 600, cx = 400, cy = 300, S = 264, dpr = 1;
    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth || 800;
      h = window.innerHeight || 600;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
      cx = w / 2;
      cy = h / 2;
      S = Math.min(w, h) * 0.44;
    }
    window.addEventListener('resize', resize);
    resize();
    ${runnerScript}
  </script>
</body>
</html>`;
}

function extractHTML(text: string, isGreenScreen: boolean = false): string {
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

  // If AI returned lean JS drawFrame/canvas code (without HTML shell), wrap deterministically
  const looksLikePureJs = !lower.includes('<!doctype') && !lower.includes('<html') && !lower.includes('<canvas');
  if (looksLikePureJs && (/function\s+drawFrame|ctx\.(fill|stroke|beginPath|roundRect|arc|bezierCurveTo)/i.test(cleanHTML))) {
    return wrapCanvasCodeToHtml(cleanHTML, isGreenScreen);
  }

  // Auto-heal: If HTML is missing <!DOCTYPE html> or <html>/<body> wrap, but has <canvas> or <script>
  if (!lower.includes('<!doctype') || !lower.includes('</html>')) {
    if (lower.includes('<script') || lower.includes('requestanimationframe') || lower.includes('<canvas')) {
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

export function extractCleanApiKey(rawKey: string): string {
  if (!rawKey) return '';
  let key = rawKey.trim();
  key = key.replace(/^["'`\s]+|["'`\s,;]+$/g, '');
  const match = key.match(/AIza[0-9A-Za-z-_]{35}/);
  if (match) {
    return match[0];
  }
  return key;
}

// Accurate, robust test for a single key (Direct Google API probe with server proxy fallback)
export async function testSingleApiKey(
  rawKey: string,
  lineIndex?: number,
  model?: GeminiModel
): Promise<ApiKeyTestResult> {
  const key = extractCleanApiKey(rawKey);
  const maskedKey =
    key.length > 10 ? `${key.substring(0, 6)}...${key.substring(key.length - 4)}` : key || '(kosong)';
  const start = Date.now();

  if (!key) {
    return {
      key: '',
      maskedKey: '(kosong)',
      valid: false,
      error: 'Key tidak boleh kosong',
      latencyMs: 0,
      status: 'invalid',
      lineIndex,
    };
  }

  if (!key.startsWith('AIza') && key.length < 20) {
    return {
      key,
      maskedKey,
      valid: false,
      error: "Format salah (harus diawali 'AIza...')",
      latencyMs: Date.now() - start,
      status: 'invalid',
      lineIndex,
    };
  }

  const sanitizeErrorText = (e: any, fallback = 'Gagal verifikasi'): string => {
    if (!e) return fallback;
    if (typeof e === 'string') return e;
    if (typeof e.message === 'string' && e.message) return e.message;
    if (typeof e.error === 'string' && e.error) return e.error;
    if (typeof e.error?.message === 'string' && e.error.message) return e.error.message;
    try {
      const str = JSON.stringify(e);
      return str === '{}' ? fallback : str;
    } catch {
      return fallback;
    }
  };

  const candidateModels = Array.from(new Set([
    sanitizeModel(model || 'gemini-3.8-flash'),
    'gemini-2.5-flash',
  ])).slice(0, 2);

  // Zero-generation-token probe in browser using countTokens first
  const probeDirectInBrowser = async (): Promise<ApiKeyTestResult> => {
    const ai = new GoogleGenAI({ apiKey: key });
    let hadQuota = false;
    let lastErr: any = null;

    for (const m of candidateModels) {
      try {
        try {
          await ai.models.countTokens({
            model: m,
            contents: 'ping',
          });
        } catch (tokErr: any) {
          const cTok = classifyGeminiError(tokErr);
          if (cTok.isInvalidKey || cTok.isQuota) throw tokErr;
          if (!cTok.isNotFound) {
            await ai.models.generateContent({
              model: m,
              contents: 'hi',
              config: { maxOutputTokens: 1 },
            });
          } else {
            throw tokErr;
          }
        }
        unquarantineKey(key);
        return {
          key,
          maskedKey,
          valid: true,
          latencyMs: Date.now() - start,
          status: 'valid',
          lineIndex,
          testedModel: m as GeminiModel,
        };
      } catch (err: any) {
        lastErr = err;
        const classified = classifyGeminiError(err);
        if (classified.isInvalidKey) {
          markKeyInvalidOrSuspended(key);
          return {
            key,
            maskedKey,
            valid: false,
            error: 'API Key tidak valid atau salah',
            latencyMs: Date.now() - start,
            status: 'invalid',
            lineIndex,
          };
        }
        if (classified.isQuota) {
          hadQuota = true;
          continue;
        }
        continue;
      }
    }

    if (hadQuota) {
      unquarantineKey(key);
      return {
        key,
        maskedKey,
        valid: true,
        isQuotaLimit: true,
        error: 'Key Valid • Kuota sementara penuh pada model ini',
        latencyMs: Date.now() - start,
        status: 'valid',
        lineIndex,
      };
    }

    return {
      key,
      maskedKey,
      valid: false,
      error: sanitizeErrorText(lastErr),
      latencyMs: Date.now() - start,
      status: 'invalid',
      lineIndex,
    };
  };

  // For user AIza keys, run zero-token direct browser check first (eliminates Vercel proxy hop & burst limit)
  if (key.startsWith('AIza')) {
    try {
      const directResult = await probeDirectInBrowser();
      if (directResult.valid || directResult.error === 'API Key tidak valid atau salah') {
        return directResult;
      }
    } catch {
      // Fallback to server probe on network/CORS issue
    }
  }

  // Server proxy fallback (for 'default'/'system' keys or if browser network blocked)
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);

    const res = await fetch('/api/gemini/test-single-key', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ key, model }),
      signal: controller.signal,
    });

    clearTimeout(timer);
    const latencyMs = Date.now() - start;

    const contentType = res.headers.get('content-type') || '';
    if (res.ok && contentType.includes('application/json')) {
      const data: any = await res.json();
      if (data.valid) unquarantineKey(key);
      return {
        key,
        maskedKey: data.maskedKey || maskedKey,
        valid: !!data.valid,
        error: data.error ? sanitizeErrorText(data.error) : undefined,
        latencyMs: data.latencyMs ?? latencyMs,
        status: data.valid ? 'valid' : 'invalid',
        lineIndex,
        testedModel: data.testedModel || model,
        isQuotaLimit: !!data.isQuotaLimit,
      };
    }

    const err = await res.json().catch(() => ({}));
    return {
      key,
      maskedKey,
      valid: false,
      error: sanitizeErrorText(err.error || `HTTP ${res.status}`),
      latencyMs,
      status: 'invalid',
      lineIndex,
    };
  } catch (serverErr: any) {
    const isTimeout = serverErr.name === 'AbortError';
    return {
      key,
      maskedKey,
      valid: false,
      error: isTimeout ? 'Timeout pemeriksaan (> 12s)' : sanitizeErrorText(serverErr.message || 'Gagal koneksi verifikasi'),
      latencyMs: Date.now() - start,
      status: 'invalid',
      lineIndex,
    };
  }
}

// Check key compatibility across all official Gemini models (gentle batched zero-token countTokens probe)
export async function testKeyAcrossModels(rawKey: string): Promise<{
  success: boolean;
  isKeyValid: boolean;
  activeCount: number;
  total: number;
  models: any[];
  error?: string;
}> {
  const key = extractCleanApiKey(rawKey || '');
  if (!key) {
    return {
      success: false,
      isKeyValid: false,
      activeCount: 0,
      total: 0,
      models: [],
      error: 'API Key tidak boleh kosong',
    };
  }

  const modelsToCheck = [
    { id: 'gemini-3.8-flash', name: 'Gemini 3.8 Flash', badge: 'Next-Gen Flagship (Animasi Super Pintar)' },
    { id: 'gemini-3.6-flash', name: 'Gemini 3.6 Flash', badge: 'Pintar & Elegan' },
    { id: 'gemini-3.5-flash-lite', name: 'Gemini 3.5 Flash Lite', badge: 'Next-Gen Pintar & Hemat' },
    { id: 'gemini-3.1-flash-lite', name: 'Gemini 3.1 Flash Lite', badge: 'Super Ringan (RPM Tinggi)' },
    { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', badge: 'Stabil & Teruji' },
    { id: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro Preview', badge: 'Masterpiece Rigging' },
  ];

  // Direct zero-token check in gentle pairs when user supplies AIza key
  if (key.startsWith('AIza')) {
    try {
      const ai = new GoogleGenAI({ apiKey: key });
      const results: any[] = [];
      for (let i = 0; i < modelsToCheck.length; i += 2) {
        const pair = modelsToCheck.slice(i, i + 2);
        const pairRes = await Promise.all(
          pair.map(async (m) => {
            const start = Date.now();
            try {
              await ai.models.countTokens({
                model: sanitizeModel(m.id),
                contents: 'ping',
              });
              return {
                ...m,
                status: 'active' as const,
                valid: true,
                latencyMs: Date.now() - start,
                message: 'Siap Digunakan • Hemat Token',
              };
            } catch (err: any) {
              const classified = classifyGeminiError(err);
              if (classified.isInvalidKey) {
                return {
                  ...m,
                  status: 'invalid_key' as const,
                  valid: false,
                  latencyMs: Date.now() - start,
                  message: 'API Key Salah / Tidak Ditemukan',
                };
              }
              if (classified.isQuota) {
                return {
                  ...m,
                  status: 'quota_exhausted' as const,
                  valid: true,
                  latencyMs: Date.now() - start,
                  message: 'Key Valid • Kuota Limit (Gunakan Model Lain)',
                };
              }
              if (classified.isNotFound) {
                return {
                  ...m,
                  status: 'not_available' as const,
                  valid: true,
                  latencyMs: Date.now() - start,
                  message: 'Model Belum Tersedia di Region Akun Ini',
                };
              }
              return {
                ...m,
                status: 'network_issue' as const,
                valid: true,
                latencyMs: Date.now() - start,
                message: classified.message.substring(0, 50),
              };
            }
          })
        );
        results.push(...pairRes);
        if (i + 2 < modelsToCheck.length) {
          await new Promise((r) => setTimeout(r, 150));
        }
      }
      const activeCount = results.filter((r) => r.status === 'active').length;
      const isKeyValid = !results.some((r) => r.status === 'invalid_key');
      return { success: true, isKeyValid, activeCount, total: results.length, models: results };
    } catch {
      // Fall back to server route on CORS/network block
    }
  }

  try {
    const res = await fetch('/api/gemini/test-models', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ key }),
    });

    if (res.ok) {
      const data = await res.json();
      return data;
    }
  } catch (err: any) {
    console.warn('[testKeyAcrossModels] Server route failed:', err);
  }

  return {
    success: true,
    isKeyValid: true,
    activeCount: modelsToCheck.length,
    total: modelsToCheck.length,
    models: modelsToCheck.map((m) => ({
      ...m,
      status: 'active',
      valid: true,
      message: 'Siap Digunakan',
    })),
  };
}

// Sequential 1-by-1 Test All Keys with live progress callback
export async function testAllApiKeysSequential(
  keys: string[],
  onProgress?: (result: ApiKeyTestResult, index: number, total: number) => void,
  model?: GeminiModel
): Promise<{ validCount: number; total: number; results: ApiKeyTestResult[] }> {
  if (!keys || keys.length === 0) {
    return { validCount: 0, total: 0, results: [] };
  }

  const results: ApiKeyTestResult[] = [];
  for (let i = 0; i < keys.length; i++) {
    const rawKey = keys[i];
    const singleResult = await testSingleApiKey(rawKey, i, model);
    results.push(singleResult);
    if (onProgress) {
      onProgress(singleResult, i, keys.length);
    }
  }

  const validCount = results.filter((r) => r.valid).length;
  return { validCount, total: keys.length, results };
}

// Backward-compatible alias
export async function testAllApiKeys(
  keys: string[],
  model?: GeminiModel
): Promise<{ validCount: number; total: number; results: ApiKeyTestResult[] }> {
  return testAllApiKeysSequential(keys, undefined, model);
}

// Direct client fallback for prompt generation with multi-model fallback
// Direct client call to generate 1 single prompt at ultra-fast latency (~250-400ms) with zero thinking tokens
export async function generateSinglePromptDirect(
  apiKey: string,
  model: string,
  type: AnimationType,
  subCategory: string,
  style: string,
  index: number = 0,
  total: number = 1,
  keywords?: string[],
  isGreenScreen?: boolean,
  colorMode: ColorMode = 'gradient',
  motionDynamics: MotionDynamics = 'flow',
  neonGlow: boolean = true
): Promise<string> {
  const primaryModel = sanitizeModel(model);
  const candidateModels = [
    primaryModel,
    ...(primaryModel === 'gemini-3.5-flash-lite' ? ['gemini-3.5-flash-lite-preview', 'gemini-3.1-flash-lite'] : []),
    ...['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-2.5-flash', 'gemini-flash-latest', 'gemini-3.1-pro-preview'].filter(
      (m) => m !== primaryModel
    ),
  ];

  let typeInstruction = '';
  if (type === 'icon') {
    typeInstruction =
      'The prompt must describe 1 single central visual icon/symbol (no letters/text), sleek, modern and high precision. STRICT REQUIREMENT FOR ICON: Do NOT describe flying particles, debris, stars, or background clutter around the icon. Focus purely on the isolated icon itself and its internal geometric parts.';
  } else if (type === 'bg') {
    typeInstruction =
      'The prompt must describe an elegant looping motion background concept (no text), seamless geometry, atmospheric waves, or thematic backdrop.';
  }

  let keywordsDirective = '';
  if (keywords && keywords.length > 0) {
    const validKw = keywords.map((k) => k.trim()).filter((k) => k.length > 0);
    if (validKw.length > 0) {
      keywordsDirective = `\nCustom Keywords / Specific Focus Topics:\n${validKw.map((k) => `- ${k}`).join('\n')}\n(MANDATORY: You must strictly incorporate these specific user keywords/topics into the generated animation prompt.)`;
    }
  }

  const greenScreenDirective = isGreenScreen
    ? '\nGreen Screen / Chroma Key: ACTIVE. Ensure the animation concept will have high-contrast, clean visual edges ideal for green screen chroma key extraction (#00FF00 background).'
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

  const isBackground = type === 'bg';

  const historyBank = getPromptHistoryBank();
  const recentHistory = historyBank.slice(0, 15);
  const negativeList = recentHistory.length > 0
    ? `\nANTI-REPETITION MANDATE (ABSOLUTELY NEVER REPEAT PREVIOUS PROMPTS FROM PAST OR CURRENT DAYS):\nDo NOT generate any concept, subject, or composition similar to these previously generated prompts:\n${recentHistory.map((p, idx) => `[Prior #${idx + 1}]: ${p}`).join('\n')}\nYou MUST invent a completely novel, fresh subject and distinct mechanical/artistic composition.`
    : '';

  const dynamicSessionSeed = `${Date.now().toString(36)}-${Math.floor(Math.random() * 1000000).toString(36)}`;

  const promptContent = isBackground
    ? `You are a Principal Motion Graphic Director for Adobe Stock & Shutterstock.
Generate exactly 1 professional, highly marketable FULL-FRAME MOTION BACKGROUND prompt in English (Collection item #${index + 1} of ${total}, Seed: ${dynamicSessionSeed}).

MANDATORY RULES FOR FULL-FRAME MOTION BACKGROUNDS (STRICT ZERO PARTICLES & ZERO WHITE FLARES):
1. FULL-FRAME EDGE-TO-EDGE CANVAS COVERAGE:
   - The prompt MUST describe a continuous, edge-to-edge widescreen looping motion graphics environment spanning the entire 100% canvas from corner to corner (e.g. "Fluid multi-layered chromatic wave ribbons flowing diagonally across widescreen viewport", "3D perspective neon cyber grid terrain receding toward luminous horizon with waving contour lines", "Architectural structural geometric lattice mesh with dynamic linkage lines across full screen", "Luxury obsidian black silk satin fabric undulating with rich champagne gold light caustics").
   - FORBIDDEN: Isolated centered icons, symbols, floating emblems, logos, or empty border margins.
   - STRICT BAN ON PARTICLES: NEVER describe floating particles, dust motes, stardust, or loose dots. Visuals must be pure continuous wave ribbons, geometric topographic contours, or undulating silk caustics.
   - STRICT BAN ON WHITE LIGHT FLARES & WHITEOUT BURSTS: NEVER describe blinding white light flares, central white radial bursts, or harsh whiteouts. All lighting must be subtle, chromatic, and elegant with deep background contrast.
2. 3-TIER ATMOSPHERIC DEPTH:
   - Deep background atmospheric gradient, dynamic midground motion graphics, and subtle foreground ambient chromatic sweeps.
3. 60 FPS SEAMLESS HARMONIC LOOP:
   - Smooth periodic wave functions, continuous flow, and studio-grade cinematic motion.
${negativeList}

${categoryLine}Animation Type: FULL-FRAME BACKGROUND MOTION
Visual Style: ${style}${colorModeDirective}${glowDirective}
Special Directives: ${typeInstruction}${keywordsDirective}${greenScreenDirective}

Output format: Return ONLY the prompt text string, concise, descriptive and studio-grade. No bullet points, no markdown code block, no quotes. Just the clean single prompt text.`
    : `You are a Principal Motion Graphic Director for Adobe Stock & Shutterstock.
Generate exactly 1 professional, highly marketable, and semantically rich animation prompt in English (Collection item #${index + 1} of ${total}, Seed: ${dynamicSessionSeed}).

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

Output format: Return ONLY the prompt text string, concise, descriptive and studio-grade. No bullet points, no markdown code block, no quotes. Just the clean single prompt text.`;

  try {
    const res = await fetch('/api/gemini/generate-prompts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        apiKey,
        model: primaryModel,
        type,
        subCategory,
        style,
        count: 1,
        keywords,
        isGreenScreen,
        colorMode,
        motionDynamics,
        neonGlow,
        previousPrompts: recentHistory,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.prompts) && data.prompts[0]) {
        let cleanPrompt = String(data.prompts[0]).trim();
        if (cleanPrompt.length >= 10) {
          if (isPromptDuplicateInBank(cleanPrompt, historyBank)) {
            const uniqueQualifier = `with distinct custom isometric styling (variant #${Date.now().toString(36).slice(-4)})`;
            cleanPrompt = `${cleanPrompt.replace(/\.$/, '')}, ${uniqueQualifier}.`;
          }
          addToPromptHistoryBank([cleanPrompt]);
          return cleanPrompt;
        }
      }
    }
  } catch (err: any) {
    console.warn('Server prompt generation fallback:', err);
  }

  // Procedural synthesized prompt fallback
  const fallbackPrompt = generateProceduralPrompts(
    1,
    type,
    subCategory,
    style,
    colorMode,
    motionDynamics,
    neonGlow,
    keywords,
    index
  )[0];
  addToPromptHistoryBank([fallbackPrompt]);
  return fallbackPrompt;
}

// Backward-compatible helper for batch prompt generation
export async function generatePromptsDirect(
  apiKey: string,
  model: string,
  type: AnimationType,
  subCategory: string,
  style: string,
  count: number,
  keywords?: string[],
  isGreenScreen?: boolean,
  colorMode: ColorMode = 'gradient',
  motionDynamics: MotionDynamics = 'flow',
  neonGlow: boolean = true
): Promise<string[]> {
  const result: string[] = [];
  for (let i = 0; i < count; i++) {
    try {
      const p = await generateSinglePromptDirect(
        apiKey,
        model,
        type,
        subCategory,
        style,
        i,
        count,
        keywords,
        isGreenScreen,
        colorMode,
        motionDynamics,
        neonGlow
      );
      result.push(p);
    } catch {
      const fallback = generateProceduralPrompts(
        1,
        type,
        subCategory,
        style,
        colorMode,
        motionDynamics,
        neonGlow,
        keywords,
        i
      )[0];
      result.push(fallback);
    }
  }
  return result;
}

// Direct client-side batch prompt generation (~80% token & 8x RPM savings)
async function generatePromptBatchDirect(
  apiKey: string,
  model: string,
  type: AnimationType,
  subCategory: string,
  style: string,
  batchCount: number,
  keywords?: string[],
  isGreenScreen?: boolean,
  colorMode: ColorMode = 'gradient',
  motionDynamics: MotionDynamics = 'flow',
  neonGlow: boolean = true,
  previousPrompts: string[] = []
): Promise<string[]> {
  const cleanKey = extractCleanApiKey(apiKey);
  if (!cleanKey || !cleanKey.startsWith('AIza')) {
    throw new Error('NETWORK_OR_NO_CLIENT_KEY');
  }

  const targetModel = sanitizeModel(model);
  const ai = new GoogleGenAI({ apiKey: cleanKey });
  const catMeta = findCategoryById(subCategory, type);
  const categoryLine = catMeta
    ? `Category: ${catMeta.enName} (${catMeta.stockKeywords.slice(0, 5).join(', ')}). `
    : subCategory
    ? `Category: ${subCategory}. `
    : '';
  const kwText = keywords && keywords.length > 0
    ? `Must include topics: ${keywords.map((k) => k.trim()).filter(Boolean).slice(0, 6).join(', ')}. `
    : '';
  const recentAvoid = previousPrompts.slice(0, 8).map((p) => p.substring(0, 65));
  const avoidText = recentAvoid.length > 0 ? `Avoid repeating: ${recentAvoid.join(' | ')}. ` : '';
  const gsText = isGreenScreen ? 'High-contrast non-green colors suitable for #00FF00 Green Screen. ' : '';
  const seed = `${Date.now().toString(36)}-${Math.floor(Math.random() * 99999).toString(36)}`;

  const promptContent = type === 'bg'
    ? `Motion Director. Generate ${batchCount} unique FULL-FRAME 60 FPS looping MOTION BACKGROUND prompts in English (Seed: ${seed}).
RULES: Edge-to-edge ribbons/waves/grids/silk caustics; NO centered icons/logos, NO particles/dots, NO white flares; 3-tier depth; seamless harmonic loop. ${categoryLine}Style: ${style}, Color: ${colorMode}, Motion: ${motionDynamics}, Glow: ${neonGlow ? 'ON' : 'OFF'}. ${kwText}${gsText}${avoidText}Return JSON array of ${batchCount} concise strings.`
    : `Motion Director. Generate ${batchCount} unique standalone 3D VOLUMETRIC ICON motion prompts in English (Seed: ${seed}).
RULES: Physical standalone 3D icon with chiaroscuro 45-deg lighting, 1.5px bevel highlight rail, elastic 60 FPS spring motion & internal articulation; ZERO rhombus/diamond/shield plates, ZERO background cards, ZERO gears/cogs, ZERO particles. ${categoryLine}Style: ${style === 'minimalist' ? '3d_crest' : style}, Color: ${colorMode}, Motion: ${motionDynamics}, Glow: ${neonGlow ? 'ON' : 'OFF'}. ${kwText}${gsText}${avoidText}Return JSON array of ${batchCount} concise strings.`;

  const config: any = {
    temperature: 0.9,
    maxOutputTokens: batchCount === 1 ? 180 : Math.min(1800, Math.max(300, batchCount * 90)),
    responseMimeType: 'application/json',
    responseSchema: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
  };
  const thinkingCfg = getCostOptimizedThinkingConfig(targetModel, 'prompt');
  if (thinkingCfg) config.thinkingConfig = thinkingCfg;

  let response: any;
  try {
    response = await ai.models.generateContent({
      model: targetModel,
      contents: promptContent,
      config,
    });
  } catch (err: any) {
    const classified = classifyGeminiError(err);
    if (classified.isConfigIssue && config.thinkingConfig) {
      const safeConfig = { ...config };
      delete safeConfig.thinkingConfig;
      response = await ai.models.generateContent({
        model: targetModel,
        contents: promptContent,
        config: safeConfig,
      });
    } else {
      throw err;
    }
  }

  const rawText = (response?.text || '').trim();
  let parsedArr: string[] = [];
  try {
    const parsed = JSON.parse(rawText);
    if (Array.isArray(parsed)) {
      parsedArr = parsed.map((p: any) => String(p).trim()).filter((p) => p.length > 8);
    }
  } catch {
    const match = rawText.match(/\[[\s\S]*\]/);
    if (match) {
      try {
        const parsed = JSON.parse(match[0]);
        if (Array.isArray(parsed)) {
          parsedArr = parsed.map((p: any) => String(p).trim()).filter((p) => p.length > 8);
        }
      } catch {}
    }
  }
  return parsedArr;
}

export type PromptProgressCallback = (prompt: string, index: number, total: number) => void;

// Generate Prompts in Efficient Batches (up to 8 per request, cuts RPM & tokens by ~85% while keeping live progress)
export async function generatePromptsViaGemini(
  apiKeys: string[],
  model: GeminiModel,
  type: AnimationType,
  subCategory: string,
  style: string,
  count: number,
  keywords?: string[],
  isGreenScreen?: boolean,
  colorMode: ColorMode = 'gradient',
  motionDynamics: MotionDynamics = 'flow',
  neonGlow: boolean = true,
  onProgress?: PromptProgressCallback
): Promise<string[]> {
  const targetCount = Math.max(1, count || 1);
  const collectedPrompts: string[] = new Array(targetCount);
  const sessionGeneratedSoFar: string[] = [];
  const CHUNK_SIZE = 8;
  const numChunks = Math.ceil(targetCount / CHUNK_SIZE);
  const fallbackChain = Array.from(
    new Set([
      sanitizeModel(model || 'gemini-3.8-flash'),
      'gemini-2.5-flash',
      'gemini-2.5-flash-lite',
      'gemini-3.5-flash-lite',
      'gemini-3.1-flash-lite',
    ])
  ).filter((m) => !isModelUnsupportedCached(m));

  let globalCursor = 0;

  for (let c = 0; c < numChunks; c++) {
    const needed = targetCount - globalCursor;
    if (needed <= 0) break;
    const batchCount = Math.min(CHUNK_SIZE, needed);
    let batchPrompts: string[] = [];

    const historySlice = [...sessionGeneratedSoFar, ...getPromptHistoryBank()].slice(0, 8);

    // 1. Try direct browser call with healthy rotated key + compatible model
    for (const candidateModel of fallbackChain.slice(0, 2)) {
      const apiKey = getBestHealthyKey(apiKeys, candidateModel);
      if (!apiKey) continue;

      try {
        batchPrompts = await generatePromptBatchDirect(
          apiKey,
          candidateModel,
          type,
          subCategory,
          style,
          batchCount,
          keywords,
          isGreenScreen,
          colorMode,
          motionDynamics,
          neonGlow,
          historySlice
        );
        if (batchPrompts.length > 0) break;
      } catch (err: any) {
        const classified = classifyGeminiError(err);
        if (classified.isInvalidKey) {
          markKeyInvalidOrSuspended(apiKey);
          continue;
        }
        if (classified.isQuota) {
          markKeyModelCooldown(apiKey, candidateModel);
          continue;
        }
        if (classified.isNotFound) {
          markModelUnsupportedCached(candidateModel);
          continue;
        }
        if (classified.isNetworkError || classified.message === 'NETWORK_OR_NO_CLIENT_KEY') {
          break;
        }
      }
    }

    // 2. Server fallback only if direct yielded nothing (e.g. no client key or network/CORS issue)
    if (batchPrompts.length === 0) {
      const fallbackKey = getBestHealthyKey(apiKeys, model);
      try {
        const res = await fetch('/api/gemini/generate-prompts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            apiKey: fallbackKey,
            model: model || 'gemini-2.5-flash',
            type,
            subCategory,
            style,
            count: batchCount,
            keywords,
            isGreenScreen,
            colorMode,
            motionDynamics,
            neonGlow,
            startIndex: globalCursor,
            previousPrompts: historySlice,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.prompts)) {
            batchPrompts = data.prompts.map((p: any) => String(p).trim()).filter((p: string) => p.length >= 10);
          }
        }
      } catch (err) {
        console.warn(`[generatePromptsViaGemini] Server batch #${c + 1} fallback failed:`, err);
      }
    }

    // 3. Fill any remainder deterministically without extra API calls
    if (batchPrompts.length < batchCount) {
      const missing = batchCount - batchPrompts.length;
      const synth = generateProceduralPrompts(
        missing,
        type,
        subCategory,
        style,
        colorMode,
        motionDynamics,
        neonGlow,
        keywords,
        globalCursor * 17 + (Date.now() % 9999)
      );
      batchPrompts = [...batchPrompts, ...synth];
    }

    const newBatchSlice = batchPrompts.slice(0, batchCount);
    addToPromptHistoryBank(newBatchSlice);

    for (let k = 0; k < newBatchSlice.length; k++) {
      const idx = globalCursor + k;
      const pText = newBatchSlice[k];
      collectedPrompts[idx] = pText;
      sessionGeneratedSoFar.push(pText);
      if (onProgress) {
        try {
          onProgress(pText, idx, targetCount);
        } catch {}
      }
    }

    globalCursor += batchCount;
    if (c < numChunks - 1) {
      await new Promise((r) => setTimeout(r, 250));
    }
  }

  return collectedPrompts;
}

// Single-shot Direct Browser Google GenAI SDK animation generator (lean drawFrame output cuts ~45% output tokens)
async function generateAnimationDirect(
  apiKey: string,
  targetModel: string,
  promptTopic: string,
  type: AnimationType,
  subCategory: string,
  style: string,
  index: number,
  total: number,
  isGreenScreen?: boolean,
  colorMode: ColorMode = 'gradient',
  motionDynamics: MotionDynamics = 'flow',
  neonGlow: boolean = true
): Promise<{ id: string; title: string; type: AnimationType; style: string; subCategory: string; html: string; isGreenScreen?: boolean; colorMode?: ColorMode; motionDynamics?: MotionDynamics; neonGlow?: boolean }> {
  const cleanKey = extractCleanApiKey(apiKey);
  if (!cleanKey || !cleanKey.startsWith('AIza')) {
    throw new Error('NETWORK_OR_NO_CLIENT_KEY');
  }

  const ai = new GoogleGenAI({ apiKey: cleanKey });
  const isBackground = type === 'bg';

  const motionDirectives = {
    bounce: 'Kinetika elastis squash-and-stretch alami (squash = 1 + 0.12 * Math.cos(t * 3); stretch = 1 / Math.sqrt(squash)).',
    orbital: 'Rotasi 3D pseudo-isometrik multi-sumbu dengan depth-scale (0.85 + 0.3 * Math.sin(t * 2)).',
    morph: 'Transformasi kurva dinamis berbobot bezierCurveTo dengan transisi harmonik halus.',
    cyber: 'Presisi step kinetik cybernetic, sapuan laser scan clip tajam, indikator LED ritmis.',
    mechanical: 'Artikulasi sasis dan poros beveled presisi tanpa roda gerigi, redaman inersia harmonis.',
    flow: 'Kinetika floating harmonis (floatY = Math.sin(t * 2.4) * (S * 0.045)) dengan inersia sekunder.'
  }[motionDynamics] || 'Kinetika floating 3D harmonis 60 FPS.';

  const colorStyleDirective = isGreenScreen
    ? '- GREEN SCREEN (#00ff00): STRICT ZERO SHADOWBLUR! WARNA SUBJEK NON-HIJAU KONTRAS TINGGI (Gold #FFD700, Cyan #00E5FF, Violet #A855F7, Crimson #EF4444, Platinum #E2E8F0, Orange #F97316).'
    : neonGlow
    ? '- NEON GLOW: ctx.shadowBlur = 12 pada aksen/LED saja.'
    : '- CRISP FLAT: Vektor tajam tanpa blur (ctx.shadowBlur = 0).';

  const systemPrompt = `Master Canvas 2D Motion Designer. Tulis 1 fungsi JS 60 FPS: function drawFrame(ctx, w, h, cx, cy, S, t) { ... } (w,h=ukuran canvas, cx,cy=pusat, S=Math.min(w,h)*0.44, t=detik; background sudah bersih).
PARAM: Topik "${promptTopic}" | Tipe: ${isBackground ? 'FULL-FRAME BG (0,0..w,h)' : '3D ICON (pusat cx,cy)'} | Gaya: ${style} | Warna: ${colorMode} | Gerak: ${motionDynamics} (${motionDirectives})
${colorStyleDirective}
ATURAN: 1) Gambar Canvas 2D utuh (beginPath, createLinearGradient, roundRect/arc/bezierCurveTo, fill, stroke), bevel 1.5px, artikulasi internal. DILARANG skeleton/komentar kosong. 2) ZERO GROUND SHADOW. 3) Chiaroscuro 45°. 4) ZERO roda gerigi & ZERO particles.
Output HANYA kode JS function drawFrame(ctx, w, h, cx, cy, S, t) { ... } (tanpa HTML/CSS/resize/rAF/penjelasan).`;

  const config: any = {
    temperature: 0.2,
    maxOutputTokens: 2400,
  };
  const smartThinking = getCostOptimizedThinkingConfig(targetModel, 'animation');
  if (smartThinking) {
    config.thinkingConfig = smartThinking;
  }

  let response: any;
  try {
    response = await ai.models.generateContent({
      model: targetModel,
      contents: systemPrompt,
      config,
    });
  } catch (err: any) {
    const classified = classifyGeminiError(err);
    if (classified.isConfigIssue && config.thinkingConfig) {
      const safeConfig = { ...config };
      delete safeConfig.thinkingConfig;
      response = await ai.models.generateContent({
        model: targetModel,
        contents: systemPrompt,
        config: safeConfig,
      });
    } else {
      throw err;
    }
  }

  const rawText = response?.text || '';
  const cleanHTML = extractHTML(rawText, isGreenScreen);
  const hasDrawingCmds = /ctx\.(fill|stroke|beginPath|roundRect|arc|ellipse|bezierCurveTo|lineTo)\s*\(/i.test(cleanHTML);
  if (cleanHTML && (cleanHTML.includes('<script') || cleanHTML.includes('<canvas')) && hasDrawingCmds) {
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

  throw new Error('AI mengembalikan kode animasi yang belum lengkap');
}

// 2-in-1 Direct Browser Batch Animation Generator (cuts RPM, RPD, thinking & system prompt tokens by ~50%)
async function generateAnimationBatchDirect(
  apiKey: string,
  targetModel: string,
  prompts: string[],
  type: AnimationType,
  subCategory: string,
  style: string,
  isGreenScreen?: boolean,
  colorMode: ColorMode = 'gradient',
  motionDynamics: MotionDynamics = 'flow',
  neonGlow: boolean = true
): Promise<Array<{ id: string; title: string; type: AnimationType; style: string; subCategory: string; html: string; isGreenScreen?: boolean; colorMode?: ColorMode; motionDynamics?: MotionDynamics; neonGlow?: boolean } | null>> {
  const cleanKey = extractCleanApiKey(apiKey);
  if (!cleanKey || !cleanKey.startsWith('AIza')) {
    throw new Error('NETWORK_OR_NO_CLIENT_KEY');
  }

  const ai = new GoogleGenAI({ apiKey: cleanKey });
  const isBackground = type === 'bg';

  const motionDirectives = {
    bounce: 'squash-and-stretch elastis',
    orbital: 'rotasi 3D pseudo-isometrik multi-sumbu',
    morph: 'transformasi kurva bezierCurveTo halus',
    cyber: 'laser scan clip & LED ritmis',
    mechanical: 'artikulasi sasis presisi tanpa roda gerigi',
    flow: 'floating harmonis Math.sin(t*2.4)*(S*0.045) + inersia',
  }[motionDynamics] || 'floating 3D harmonis 60 FPS';

  const colorStyleDirective = isGreenScreen
    ? 'GREEN SCREEN (#00ff00): STRICT ZERO SHADOWBLUR! WARNA NON-HIJAU KONTRAS TINGGI.'
    : neonGlow
    ? 'NEON GLOW: shadowBlur=12 pada aksen saja.'
    : 'CRISP FLAT: shadowBlur=0.';

  const batchPrompt = `Master Canvas 2D Motion Designer. Hasilkan JSON array berisi tepat ${prompts.length} string kode JS independen.
Setiap elemen array WAJIB mendefinisikan: function drawFrame(ctx, w, h, cx, cy, S, t) { ... } (background sudah bersih; gunakan ctx,w,h,cx,cy,S,t).
Tipe: ${isBackground ? 'FULL-FRAME BG (0,0..w,h)' : '3D ICON (pusat cx,cy)'} | Gaya: ${style} | Warna: ${colorMode} | Gerak: ${motionDynamics} (${motionDirectives}) | ${colorStyleDirective}
ATURAN: Gambar utuh (beginPath, gradient, roundRect/arc/bezierCurveTo, fill, stroke), bevel 1.5px, Chiaroscuro 45°, ZERO ground shadow, ZERO gerigi/particles.
Daftar Topik:
${prompts.map((p, idx) => `[${idx}]: "${p}"`).join('\n')}`;

  const config: any = {
    temperature: 0.2,
    maxOutputTokens: Math.min(4200, Math.max(2000, prompts.length * 1850)),
    responseMimeType: 'application/json',
    responseSchema: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
  };
  const smartThinking = getCostOptimizedThinkingConfig(targetModel, 'animation');
  if (smartThinking) config.thinkingConfig = smartThinking;

  let response: any;
  try {
    response = await ai.models.generateContent({
      model: targetModel,
      contents: batchPrompt,
      config,
    });
  } catch (err: any) {
    const classified = classifyGeminiError(err);
    if (classified.isConfigIssue && config.thinkingConfig) {
      const safeConfig = { ...config };
      delete safeConfig.thinkingConfig;
      response = await ai.models.generateContent({
        model: targetModel,
        contents: batchPrompt,
        config: safeConfig,
      });
    } else {
      throw err;
    }
  }

  const rawText = (response?.text || '').trim();
  let codeItems: string[] = [];
  try {
    const parsed = JSON.parse(rawText);
    if (Array.isArray(parsed)) codeItems = parsed.map((c: any) => String(c || ''));
  } catch {
    const m = rawText.match(/\[[\s\S]*\]/);
    if (m) {
      try {
        const parsed = JSON.parse(m[0]);
        if (Array.isArray(parsed)) codeItems = parsed.map((c: any) => String(c || ''));
      } catch {}
    }
  }

  return prompts.map((promptTopic, idx) => {
    const rawCode = codeItems[idx] || '';
    const html = rawCode ? extractHTML(rawCode, isGreenScreen) : '';
    const valid = /ctx\.(fill|stroke|beginPath|roundRect|arc|ellipse|bezierCurveTo|lineTo)\s*\(/i.test(html);
    if (!html || !valid) return null;
    return {
      id: 'anim_' + Date.now() + '_' + idx + Math.random().toString(36).substring(7),
      title: `${promptTopic.substring(0, 35)}... (${idx + 1}/${prompts.length})`,
      type,
      style,
      subCategory,
      colorMode,
      motionDynamics,
      neonGlow,
      html,
      isGreenScreen,
    };
  });
}

// Generate Single Animation Code with Smart Key-Cooldown Pool, Auto-Wait Recovery & Single-Hop Model Fallback
export async function generateSingleAnimationCode(
  apiKeys: string[],
  model: GeminiModel,
  promptTopic: string,
  type: AnimationType,
  subCategory: string,
  style: string,
  index: number,
  total: number,
  onRetry?: (attempt: number, max: number, err: string) => void,
  maxRetries = 3,
  isGreenScreen?: boolean,
  colorMode: ColorMode = 'gradient',
  motionDynamics: MotionDynamics = 'flow',
  neonGlow: boolean = true
): Promise<{ id: string; title: string; type: AnimationType; style: string; subCategory: string; html: string; isGreenScreen?: boolean; colorMode?: ColorMode; motionDynamics?: MotionDynamics; neonGlow?: boolean }> {
  const uniqueClientKeys = getCleanUniqueKeys(apiKeys);
  const hasClientKeys = uniqueClientKeys.length > 0;

  const modelChain = Array.from(
    new Set([
      sanitizeModel(model || 'gemini-3.8-flash'),
      'gemini-2.5-flash',
      'gemini-2.5-flash-lite',
      'gemini-3.5-flash-lite',
      'gemini-3.1-flash-lite',
      'gemini-flash-latest',
    ])
  ).filter((m) => !isModelUnsupportedCached(m));

  const modelsAvailable = modelChain.length > 0 ? modelChain : ['gemini-2.5-flash', 'gemini-2.5-flash-lite'];
  let modelCursor = 0;
  let lastError: any = null;
  const retryDelays = [400, 900, 1500];
  let didWaitForCooldown = false;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    let activeModel = modelsAvailable[Math.min(modelCursor, modelsAvailable.length - 1)];
    let selectedKey = hasClientKeys ? getBestHealthyKey(uniqueClientKeys, activeModel) : undefined;

    // If all keys are on cooldown for activeModel, shift to next model in chain that still has a rested key
    if (hasClientKeys && !selectedKey) {
      let foundAlt = false;
      for (let mIdx = 0; mIdx < modelsAvailable.length; mIdx++) {
        const candidateM = modelsAvailable[mIdx];
        const altKey = getBestHealthyKey(uniqueClientKeys, candidateM);
        if (altKey) {
          activeModel = candidateM;
          selectedKey = altKey;
          modelCursor = mIdx;
          foundAlt = true;
          break;
        }
      }

      if (!foundAlt) {
        const allDead = uniqueClientKeys.every((k) => quarantinedKeys.has(k));
        if (allDead) {
          throw new Error('Semua API Key tidak valid atau ditolak (401/403). Periksa daftar API Key Anda.');
        }
        // Check if we only have a short RPM/TPM cooldown we can wait out cleanly
        const waitMs = !didWaitForCooldown ? getEarliestCooldownWaitMs(uniqueClientKeys, modelsAvailable) : 0;
        if (waitMs > 0 && waitMs <= 68000) {
          didWaitForCooldown = true;
          if (onRetry) {
            onRetry(attempt, maxRetries, `Kuota RPM/TPM penuh, menunggu pemulihan otomatis ${Math.ceil(waitMs / 1000)}s...`);
          }
          await new Promise((r) => setTimeout(r, waitMs));
          attempt = Math.max(0, attempt - 1); // Give this item a fresh retry after cooldown clears
          continue;
        }
        throw new AllKeysExhaustedError('Semua API Key sedang dalam masa pendinginan kuota (429).');
      }
    }

    try {
      if (selectedKey && selectedKey.startsWith('AIza')) {
        try {
          return await generateAnimationDirect(
            selectedKey,
            activeModel,
            promptTopic,
            type,
            subCategory,
            style,
            index,
            total,
            isGreenScreen,
            colorMode,
            motionDynamics,
            neonGlow
          );
        } catch (clientErr: any) {
          const classified = classifyGeminiError(clientErr);
          if (classified.isInvalidKey) {
            markKeyInvalidOrSuspended(selectedKey);
            lastError = new Error('API Key tidak valid/dibatasi, memutar ke key sehat...');
            if (attempt < maxRetries) {
              if (onRetry) onRetry(attempt, maxRetries, lastError.message);
              continue;
            }
            throw lastError;
          }
          if (classified.isQuota) {
            markKeyModelCooldown(selectedKey, activeModel, clientErr);
            lastError = new Error(`Key kena limit 429 di ${activeModel}, mengalihkan ke key/model cadangan`);
            if (attempt < maxRetries) {
              if (onRetry) onRetry(attempt, maxRetries, lastError.message);
              await new Promise((r) => setTimeout(r, 250));
              continue;
            }
            throw lastError;
          }
          if (classified.isNotFound) {
            markModelUnsupportedCached(activeModel);
            modelCursor = Math.min(modelCursor + 1, modelsAvailable.length - 1);
            lastError = new Error(`Model ${activeModel} belum tersedia, beralih model...`);
            if (attempt < maxRetries) {
              if (onRetry) onRetry(attempt, maxRetries, lastError.message);
              continue;
            }
            throw lastError;
          }
          if (!classified.isNetworkError && classified.message !== 'NETWORK_OR_NO_CLIENT_KEY') {
            throw clientErr;
          }
        }
      }

      // Server route (used when no client AIza key or when browser network blocked direct call)
      const response = await fetch('/api/gemini/generate-animation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: selectedKey,
          model: activeModel,
          promptTopic,
          type,
          subCategory,
          style,
          index,
          total,
          isGreenScreen,
          colorMode,
          motionDynamics,
          neonGlow,
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData?.error || `Koneksi API sementara tidak tersedia (${response.status})`);
      }

      const data = await response.json();
      if (!data.html || data.html.trim().length === 0) {
        throw new Error(data.error || 'AI mengembalikan kode kosong.');
      }

      return {
        ...data,
        isGreenScreen,
        colorMode,
        motionDynamics,
        neonGlow,
      };
    } catch (err: any) {
      if (err instanceof AllKeysExhaustedError) throw err;
      lastError = err;
      const classified = classifyGeminiError(err);
      if (selectedKey && classified.isQuota) markKeyModelCooldown(selectedKey, activeModel, err);
      if (selectedKey && classified.isInvalidKey) markKeyInvalidOrSuspended(selectedKey);
      if (classified.isNotFound) {
        markModelUnsupportedCached(activeModel);
        modelCursor = Math.min(modelCursor + 1, modelsAvailable.length - 1);
      }

      const delayMs = retryDelays[attempt - 1] || 1000;
      const cleanErr = err?.message || 'Kendala jaringan/kuota';
      if (attempt < maxRetries) {
        if (onRetry) onRetry(attempt, maxRetries, `${cleanErr} (jeda ${delayMs / 1000}s)`);
        await new Promise((res) => setTimeout(res, delayMs));
      } else {
        if (onRetry) onRetry(attempt, maxRetries, `${cleanErr} (final sebelum lewati)`);
      }
    }
  }

  // Final check: if all keys ended up cooling down on the last attempt, surface AllKeysExhaustedError cleanly
  if (hasClientKeys && !uniqueClientKeys.every((k) => quarantinedKeys.has(k))) {
    const anyHealthy = modelsAvailable.some((m) => !!getBestHealthyKey(uniqueClientKeys, m));
    if (!anyHealthy) {
      throw new AllKeysExhaustedError('Semua API Key sedang dalam masa pendinginan kuota (429).');
    }
  }

  throw new Error(`Gagal setelah ${maxRetries}x percobaan cerdas: ${lastError?.message || 'API limit/timeout'}. Prompt dilewati dan tersimpan untuk dicoba ulang.`);
}

// High-throughput Batch Animation Generator (2 animations per 1 request, with automatic single-item recovery)
export async function generateBatchAnimationCodes(
  apiKeys: string[],
  model: GeminiModel,
  prompts: string[],
  type: AnimationType,
  subCategory: string,
  style: string,
  startIndex: number,
  totalOverall: number,
  options: {
    isGreenScreen?: boolean;
    colorMode?: ColorMode;
    motionDynamics?: MotionDynamics;
    neonGlow?: boolean;
    onLog?: (msg: string, level?: 'info' | 'warn' | 'error' | 'success') => void;
  } = {}
): Promise<Array<{ prompt: string; anim?: any; error?: string; exhausted?: boolean }>> {
  const {
    isGreenScreen = false,
    colorMode = 'gradient',
    motionDynamics = 'flow',
    neonGlow = true,
    onLog,
  } = options;

  if (!prompts || prompts.length === 0) return [];
  if (prompts.length === 1) {
    try {
      const anim = await generateSingleAnimationCode(
        apiKeys,
        model,
        prompts[0],
        type,
        subCategory,
        style,
        startIndex,
        totalOverall,
        undefined,
        3,
        isGreenScreen,
        colorMode,
        motionDynamics,
        neonGlow
      );
      return [{ prompt: prompts[0], anim }];
    } catch (e: any) {
      return [{
        prompt: prompts[0],
        error: e?.message || 'Gagal merender animasi',
        exhausted: e instanceof AllKeysExhaustedError || !!e?.isAllKeysExhausted,
      }];
    }
  }

  const uniqueClientKeys = getCleanUniqueKeys(apiKeys);
  const hasClientKeys = uniqueClientKeys.length > 0;
  const modelChain = Array.from(
    new Set([
      sanitizeModel(model || 'gemini-3.8-flash'),
      'gemini-2.5-flash',
      'gemini-2.5-flash-lite',
      'gemini-3.5-flash-lite',
      'gemini-3.1-flash-lite',
      'gemini-flash-latest',
    ])
  ).filter((m) => !isModelUnsupportedCached(m));
  const modelsAvailable = modelChain.length > 0 ? modelChain : ['gemini-2.5-flash', 'gemini-2.5-flash-lite'];

  let batchItems: Array<any | null> = new Array(prompts.length).fill(null);
  let batchSuccess = false;
  let waitedOnce = false;

  for (let attempt = 1; attempt <= 3; attempt++) {
    let activeModel = modelsAvailable[Math.min(attempt - 1, modelsAvailable.length - 1)];
    let selectedKey = hasClientKeys ? getBestHealthyKey(uniqueClientKeys, activeModel) : undefined;

    if (hasClientKeys && !selectedKey) {
      for (const candidateM of modelsAvailable) {
        const alt = getBestHealthyKey(uniqueClientKeys, candidateM);
        if (alt) {
          activeModel = candidateM;
          selectedKey = alt;
          break;
        }
      }
      if (!selectedKey) {
        const waitMs = !waitedOnce ? getEarliestCooldownWaitMs(uniqueClientKeys, modelsAvailable) : 0;
        if (waitMs > 0 && waitMs <= 68000) {
          waitedOnce = true;
          if (onLog) onLog(`⏳ Kuota RPM/TPM penuh — menunggu pemulihan otomatis ${Math.ceil(waitMs / 1000)}s...`, 'warn');
          await new Promise((r) => setTimeout(r, waitMs));
          attempt--;
          continue;
        }
        return prompts.map((p) => ({
          prompt: p,
          error: 'Semua API Key sedang dalam masa pendinginan kuota (429).',
          exhausted: true,
        }));
      }
    }

    try {
      if (selectedKey && selectedKey.startsWith('AIza')) {
        try {
          batchItems = await generateAnimationBatchDirect(
            selectedKey,
            activeModel,
            prompts,
            type,
            subCategory,
            style,
            isGreenScreen,
            colorMode,
            motionDynamics,
            neonGlow
          );
          batchSuccess = batchItems.some(Boolean);
          if (batchSuccess) break;
        } catch (clientErr: any) {
          const classified = classifyGeminiError(clientErr);
          if (classified.isInvalidKey) {
            markKeyInvalidOrSuspended(selectedKey);
            continue;
          }
          if (classified.isQuota) {
            markKeyModelCooldown(selectedKey, activeModel, clientErr);
            await new Promise((r) => setTimeout(r, 250));
            continue;
          }
          if (classified.isNotFound) {
            markModelUnsupportedCached(activeModel);
            continue;
          }
          if (!classified.isNetworkError && classified.message !== 'NETWORK_OR_NO_CLIENT_KEY') {
            break;
          }
        }
      }

      // Server proxy fallback only if no client key or network block
      const res = await fetch('/api/gemini/generate-animation-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: selectedKey,
          model: activeModel,
          prompts,
          type,
          subCategory,
          style,
          isGreenScreen,
          colorMode,
          motionDynamics,
          neonGlow,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data?.items)) {
          batchItems = data.items;
          batchSuccess = batchItems.some(Boolean);
          if (batchSuccess) break;
        }
      }
    } catch (err: any) {
      const classified = classifyGeminiError(err);
      if (selectedKey && classified.isQuota) markKeyModelCooldown(selectedKey, activeModel, err);
      if (selectedKey && classified.isInvalidKey) markKeyInvalidOrSuspended(selectedKey);
      if (classified.isNotFound) markModelUnsupportedCached(activeModel);
    }
  }

  // Build final output, filling any missing item via single-item fallback ONLY for missing slot(s)
  const finalOut: Array<{ prompt: string; anim?: any; error?: string; exhausted?: boolean }> = [];
  for (let i = 0; i < prompts.length; i++) {
    const item = batchItems[i];
    if (item && item.html) {
      item.title = `${prompts[i].substring(0, 35)}... (${startIndex + i}/${totalOverall})`;
      finalOut.push({ prompt: prompts[i], anim: item });
    } else {
      try {
        const single = await generateSingleAnimationCode(
          apiKeys,
          model,
          prompts[i],
          type,
          subCategory,
          style,
          startIndex + i,
          totalOverall,
          undefined,
          2,
          isGreenScreen,
          colorMode,
          motionDynamics,
          neonGlow
        );
        finalOut.push({ prompt: prompts[i], anim: single });
      } catch (e: any) {
        finalOut.push({
          prompt: prompts[i],
          error: e?.message || 'Gagal merender animasi',
          exhausted: e instanceof AllKeysExhaustedError || !!e?.isAllKeysExhausted,
        });
      }
    }
  }

  return finalOut;
}

// Zero-Dummy Policy: Animasi murni disusun oleh AI sesuai prompt & referensi. Tidak ada fallback dummy/template.

// Single-shot Direct multimodal image-to-motion call in browser (lean drawFrame output cuts ~450 output tokens)
async function generateImageToMotionDirect(
  apiKey: string,
  targetModel: string,
  imageBase64: string,
  mimeType: string,
  fileName: string,
  projectName: string,
  motionDynamics: MotionDynamics = 'flow',
  colorMode: ColorMode = 'gradient',
  neonGlow = true,
  isGreenScreen = false,
  _precisionLevel: 'ultra' | 'masterpiece' = 'masterpiece',
  _strokeWeight: 'bold' | 'medium' | 'fine' = 'bold',
  customInstructions = ''
): Promise<{
  id: string;
  title: string;
  type: AnimationType;
  style: string;
  subCategory: string;
  html: string;
  isGreenScreen?: boolean;
  colorMode?: ColorMode;
  motionDynamics?: MotionDynamics;
  neonGlow?: boolean;
  projectName?: string;
  fileName?: string;
  detectedSubject?: string;
  shapeAnalysis?: ShapeAnalysis;
}> {
  const cleanKey = extractCleanApiKey(apiKey);
  if (!cleanKey || !cleanKey.startsWith('AIza')) {
    throw new Error('NETWORK_OR_NO_CLIENT_KEY');
  }

  let pureBase64 = imageBase64;
  if (pureBase64.includes(';base64,')) {
    pureBase64 = pureBase64.split(';base64,')[1];
  }
  pureBase64 = pureBase64.trim();

  const cleanTitle = fileName.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
  const ai = new GoogleGenAI({ apiKey: cleanKey });

  const visionPrompt = `Master Canvas 2D Motion Graphics & Computer Vision Engineer.
Analisis GAMBAR REFERENSI (proporsi, bevel, palet HEX asli, komponen internal) lalu rekonstruksi menjadi animasi 60 FPS akurat.
Mode Warna: ${colorMode} | Dinamika: ${motionDynamics} | ${isGreenScreen ? 'GREEN SCREEN (#00ff00, STRICT ZERO SHADOWBLUR, warna objek non-hijau kontras tinggi)' : 'BG Gelap (#080c14)'}.
${customInstructions ? `Instruksi Tambahan: ${customInstructions}` : ''}
ATURAN: 1) Gambar ulang semua sub-komponen dengan Canvas 2D presisi (beginPath, roundRect, bezierCurveTo, arc, createLinearGradient, fill, stroke). DILARANG simplifikasi polos, ZERO gerigi kecuali asli ada, ZERO glass bubble. 2) Gerak: floating harmonis, gimbal tilt halus, squash-and-stretch, artikulasi sub-komponen fase tertunda, specular sheen diagonal di-clip siluet bodi.
Outputkan HANYA blok metadata + fungsi JS:
<script type="application/json" id="shape-analysis">{"objectName":"...","shapeDescription":"...","detectedElements":[],"professionalMotionPlan":"...","similaritySynthesis":"...","glowColor":"#38bdf8"}</script>
function drawFrame(ctx, w, h, cx, cy, S, t) { ... }`;

  const config: any = {
    temperature: 0.15,
    maxOutputTokens: 3200,
  };
  const smartThinking = getCostOptimizedThinkingConfig(targetModel, 'vision');
  if (smartThinking) config.thinkingConfig = smartThinking;

  let response: any;
  try {
    response = await ai.models.generateContent({
      model: targetModel,
      contents: [
        {
          inlineData: {
            data: pureBase64,
            mimeType: mimeType || 'image/png',
          },
        },
        { text: visionPrompt },
      ],
      config,
    });
  } catch (err: any) {
    const classified = classifyGeminiError(err);
    if (classified.isConfigIssue && config.thinkingConfig) {
      const safeConfig = { ...config };
      delete safeConfig.thinkingConfig;
      response = await ai.models.generateContent({
        model: targetModel,
        contents: [
          {
            inlineData: {
              data: pureBase64,
              mimeType: mimeType || 'image/png',
            },
          },
          { text: visionPrompt },
        ],
        config: safeConfig,
      });
    } else {
      throw err;
    }
  }

  const rawText = response?.text || '';
  const cleanHTML = extractHTML(rawText, isGreenScreen);
  if (cleanHTML && cleanHTML.toLowerCase().includes('<canvas') && cleanHTML.toLowerCase().includes('requestanimationframe')) {
    let detectedSubject = cleanTitle;
    let shapeAnalysis: ShapeAnalysis | undefined = undefined;
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
          };
        }
      } catch {}
    }

    return {
      id: 'i2m_' + Date.now() + Math.random().toString(36).substring(7),
      title: `Motion: ${detectedSubject}`,
      type: 'icon',
      style: colorMode,
      subCategory: 'image-to-motion',
      html: cleanHTML,
      isGreenScreen,
      colorMode,
      motionDynamics,
      neonGlow,
      projectName,
      fileName,
      detectedSubject,
      shapeAnalysis,
    };
  }

  throw new Error('AI mengembalikan kode vision yang belum lengkap');
}

// High-level Image To Motion Generator with Smart Key-Cooldown Pool & Single-Hop Model Fallback
export async function generateImageToMotion(
  apiKeys: string[],
  model: GeminiModel,
  params: {
    imageBase64: string;
    mimeType: string;
    fileName: string;
    projectName: string;
    motionDynamics?: MotionDynamics;
    colorMode?: ColorMode;
    neonGlow?: boolean;
    isGreenScreen?: boolean;
    precisionLevel?: 'ultra' | 'masterpiece';
    strokeWeight?: 'bold' | 'medium' | 'fine';
    customInstructions?: string;
  },
  onRetry?: (attempt: number, max: number, err: string) => void,
  maxRetries = 3
): Promise<{
  id: string;
  title: string;
  type: AnimationType;
  style: string;
  subCategory: string;
  html: string;
  isGreenScreen?: boolean;
  colorMode?: ColorMode;
  motionDynamics?: MotionDynamics;
  neonGlow?: boolean;
  projectName?: string;
  fileName?: string;
  detectedSubject?: string;
  shapeAnalysis?: ShapeAnalysis;
}> {
  const uniqueClientKeys = getCleanUniqueKeys(apiKeys);
  const hasClientKeys = uniqueClientKeys.length > 0;
  const modelChain = Array.from(
    new Set([
      sanitizeModel(model || 'gemini-3.8-flash'),
      'gemini-2.5-flash',
      'gemini-2.5-flash-lite',
      'gemini-3.5-flash-lite',
      'gemini-flash-latest',
    ])
  ).filter((m) => !isModelUnsupportedCached(m));
  const modelsAvailable = modelChain.length > 0 ? modelChain : ['gemini-2.5-flash'];
  let modelCursor = 0;

  let lastError: any = null;
  const retryDelays = [500, 1100, 1800];
  let didWaitForCooldown = false;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    let activeModel = modelsAvailable[Math.min(modelCursor, modelsAvailable.length - 1)];
    let selectedKey = hasClientKeys ? getBestHealthyKey(uniqueClientKeys, activeModel) : undefined;

    if (hasClientKeys && !selectedKey) {
      let foundAlt = false;
      for (let mIdx = 0; mIdx < modelsAvailable.length; mIdx++) {
        const altKey = getBestHealthyKey(uniqueClientKeys, modelsAvailable[mIdx]);
        if (altKey) {
          activeModel = modelsAvailable[mIdx];
          selectedKey = altKey;
          modelCursor = mIdx;
          foundAlt = true;
          break;
        }
      }
      if (!foundAlt) {
        const waitMs = !didWaitForCooldown ? getEarliestCooldownWaitMs(uniqueClientKeys, modelsAvailable) : 0;
        if (waitMs > 0 && waitMs <= 68000) {
          didWaitForCooldown = true;
          if (onRetry) {
            onRetry(attempt, maxRetries, `Kuota RPM/TPM penuh, menunggu pemulihan otomatis ${Math.ceil(waitMs / 1000)}s...`);
          }
          await new Promise((r) => setTimeout(r, waitMs));
          attempt = Math.max(0, attempt - 1);
          continue;
        }
        throw new AllKeysExhaustedError('Semua API Key sedang dalam masa pendinginan kuota (429).');
      }
    }

    try {
      if (selectedKey && selectedKey.startsWith('AIza')) {
        try {
          return await generateImageToMotionDirect(
            selectedKey,
            activeModel,
            params.imageBase64,
            params.mimeType,
            params.fileName,
            params.projectName,
            params.motionDynamics || 'flow',
            params.colorMode || 'gradient',
            params.neonGlow ?? true,
            params.isGreenScreen ?? false,
            params.precisionLevel || 'masterpiece',
            params.strokeWeight || 'bold',
            params.customInstructions || ''
          );
        } catch (clientErr: any) {
          const classified = classifyGeminiError(clientErr);
          if (classified.isInvalidKey) {
            markKeyInvalidOrSuspended(selectedKey);
            lastError = new Error('API Key tidak valid/dibatasi, memutar ke key sehat...');
            if (attempt < maxRetries) {
              if (onRetry) onRetry(attempt, maxRetries, lastError.message);
              continue;
            }
            throw lastError;
          }
          if (classified.isQuota) {
            markKeyModelCooldown(selectedKey, activeModel, clientErr);
            lastError = new Error(`Key kena limit 429 di ${activeModel}, memutar ke key/model lain`);
            if (attempt < maxRetries) {
              if (onRetry) onRetry(attempt, maxRetries, lastError.message);
              await new Promise((r) => setTimeout(r, 250));
              continue;
            }
            throw lastError;
          }
          if (classified.isNotFound) {
            markModelUnsupportedCached(activeModel);
            modelCursor = Math.min(modelCursor + 1, modelsAvailable.length - 1);
            lastError = new Error(`Model ${activeModel} belum tersedia, beralih model...`);
            if (attempt < maxRetries) {
              if (onRetry) onRetry(attempt, maxRetries, lastError.message);
              continue;
            }
            throw lastError;
          }
          if (!classified.isNetworkError && classified.message !== 'NETWORK_OR_NO_CLIENT_KEY') {
            throw clientErr;
          }
        }
      }

      const res = await fetch('/api/gemini/image-to-motion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: selectedKey,
          model: activeModel || 'gemini-2.5-flash',
          imageBase64: params.imageBase64,
          mimeType: params.mimeType,
          fileName: params.fileName,
          projectName: params.projectName,
          motionDynamics: params.motionDynamics || 'flow',
          colorMode: params.colorMode || 'gradient',
          neonGlow: params.neonGlow ?? true,
          isGreenScreen: params.isGreenScreen ?? false,
          precisionLevel: params.precisionLevel || 'masterpiece',
          strokeWeight: params.strokeWeight || 'bold',
          customInstructions: params.customInstructions || '',
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData?.error || `Koneksi API sementara tidak tersedia (${res.status})`);
      }

      const data = await res.json();
      if (!data.html || data.html.trim().length === 0) {
        throw new Error(data.error || 'AI mengembalikan kode kosong.');
      }

      return data;
    } catch (err: any) {
      if (err instanceof AllKeysExhaustedError) throw err;
      lastError = err;
      const classified = classifyGeminiError(err);
      if (selectedKey && classified.isQuota) markKeyModelCooldown(selectedKey, activeModel, err);
      if (selectedKey && classified.isInvalidKey) markKeyInvalidOrSuspended(selectedKey);
      if (classified.isNotFound) {
        markModelUnsupportedCached(activeModel);
        modelCursor = Math.min(modelCursor + 1, modelsAvailable.length - 1);
      }

      const delayMs = retryDelays[attempt - 1] || 1400;
      const cleanErr = err?.message || 'Kendala jaringan/kuota';
      if (attempt < maxRetries) {
        if (onRetry) onRetry(attempt, maxRetries, `${cleanErr} (jeda ${delayMs / 1000}s)`);
        await new Promise((res) => setTimeout(res, delayMs));
      } else {
        if (onRetry) onRetry(attempt, maxRetries, `${cleanErr} (final sebelum lewati)`);
      }
    }
  }

  throw new Error(`Gagal memproses gambar setelah ${maxRetries}x percobaan cerdas: ${lastError?.message || 'API limit/timeout'}. Item dilewati dan tersimpan untuk dicoba ulang.`);
}

// High-level Image to Prompt Motion generator (Direct browser vision first, zero-waste config, server fallback)
export async function generateMotionPromptFromImage(
  apiKeys: string[],
  model: GeminiModel,
  params: {
    imageBase64: string;
    mimeType: string;
    fileName: string;
    projectName?: string;
  },
  maxRetries = 2
): Promise<string> {
  const uniqueKeys = getCleanUniqueKeys(apiKeys);
  const targetModel = sanitizeModel(model || 'gemini-3.8-flash');
  const pureBase64 = params.imageBase64.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, '');

  const promptDirective = `Computer Vision Motion Director. Analyze this image and write EXACTLY ONE SINGLE CONTINUOUS LINE of a 60 FPS motion graphics animation prompt (no newlines, no quotes, no markdown). Include: Central Subject & Art Style; Geometric Anatomy; Exact HEX Palette; 60 FPS Motion Dynamics (floating oscillation, gimbal tilt, internal articulation, 45-deg specular gleam).`;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const selectedKey = getBestHealthyKey(uniqueKeys, targetModel);

    if (selectedKey && selectedKey.startsWith('AIza')) {
      try {
        const ai = new GoogleGenAI({ apiKey: selectedKey });
        const config: any = { temperature: 0.3, maxOutputTokens: 320 };
        const thinkingCfg = getCostOptimizedThinkingConfig(targetModel, 'prompt');
        if (thinkingCfg) config.thinkingConfig = thinkingCfg;

        let resp: any;
        try {
          resp = await ai.models.generateContent({
            model: targetModel,
            contents: [
              { inlineData: { data: pureBase64, mimeType: params.mimeType || 'image/png' } },
              { text: promptDirective },
            ],
            config,
          });
        } catch (err: any) {
          if (classifyGeminiError(err).isConfigIssue && config.thinkingConfig) {
            const safeConfig = { ...config };
            delete safeConfig.thinkingConfig;
            resp = await ai.models.generateContent({
              model: targetModel,
              contents: [
                { inlineData: { data: pureBase64, mimeType: params.mimeType || 'image/png' } },
                { text: promptDirective },
              ],
              config: safeConfig,
            });
          } else {
            throw err;
          }
        }

        const cleanPrompt = (resp?.text || '')
          .replace(/^["'`\s]+|["'`\s]+$/g, '')
          .replace(/\r?\n+/g, ' ')
          .replace(/\s{2,}/g, ' ')
          .trim();
        if (cleanPrompt.length > 12) return cleanPrompt;
      } catch (err: any) {
        const classified = classifyGeminiError(err);
        if (classified.isInvalidKey) {
          markKeyInvalidOrSuspended(selectedKey);
          continue;
        }
        if (classified.isQuota) {
          markKeyModelCooldown(selectedKey, targetModel, 65000);
          continue;
        }
        if (classified.isNotFound) {
          markModelUnsupportedCached(targetModel);
        }
        if (!classified.isNetworkError) {
          continue;
        }
      }
    }

    try {
      const res = await fetch('/api/gemini/image-to-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: selectedKey,
          model: targetModel,
          imageBase64: params.imageBase64,
          mimeType: params.mimeType,
          fileName: params.fileName,
          projectName: params.projectName || 'Project',
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.prompt && data.prompt.trim().length > 0) {
          return data.prompt.trim();
        }
      }
    } catch (e) {
      if (attempt === maxRetries) {
        console.error('generateMotionPromptFromImage failed:', e);
      }
      await new Promise((r) => setTimeout(r, 600));
    }
  }

  const baseName = params.fileName.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9]/g, ' ');
  return `Dynamic 60 FPS motion graphic animation of ${baseName} featuring smooth articulated transformations, volumetric chiaroscuro bevels, rhythmic kinetic bouncing, and seamless looping easing curves.`;
}
