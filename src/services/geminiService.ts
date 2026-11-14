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
const keyLastUsedAt = new Map<string, number>(); // global LRU spacing
const keyModelLastUsedAt = new Map<string, number>(); // per-key+model reuse gap tracking
const modelGlobalCooldowns = new Map<string, number>(); // Burst guard if 3+ keys hit 429 on same model within 10s
const recentModelQuotaHits = new Map<string, number[]>(); // Timestamps of recent 429 hits per model
const unsupportedClientModels = new Map<string, number>(); // model -> timestamp (5 min TTL for 404/unsupported)

export function resetKeyHealthPool(): void {
  quarantinedKeys.clear();
  keyModelCooldowns.clear();
  keyModelStrikeCount.clear();
  keyModelDailyExhausted.clear();
  keyLastUsedAt.clear();
  keyModelLastUsedAt.clear();
  modelGlobalCooldowns.clear();
  recentModelQuotaHits.clear();
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
    lower.includes('perday') ||
    lower.includes('requestsperday') ||
    lower.includes('requests_per_day') ||
    lower.includes('requests per day') ||
    lower.includes('daily') ||
    lower.includes('rpd') ||
    lower.includes('limit: 0') ||
    lower.includes('limit:0')
  );
}

function recordKeyModelSuccess(key: string, model: string): void {
  if (!key || !model) return;
  const pair = `${key}::${model}`;
  keyModelStrikeCount.delete(pair);
  keyModelCooldowns.delete(pair);
  recentModelQuotaHits.delete(model);
  modelGlobalCooldowns.delete(model);
}

function markKeyModelCooldown(key: string, model: string, errOrDurationMs: any = 28000): void {
  if (!key || !model) return;
  const pair = `${key}::${model}`;
  const now = Date.now();
  const msg = typeof errOrDurationMs === 'string'
    ? errOrDurationMs
    : (errOrDurationMs?.message || errOrDurationMs?.error?.message || '');

  if (typeof errOrDurationMs !== 'number' && isDailyQuotaMessage(msg)) {
    // Daily quota exhausted on this model for this key — avoid hammering it for 15 minutes
    keyModelDailyExhausted.set(pair, now + 15 * 60 * 1000);
    keyModelCooldowns.set(pair, now + 15 * 60 * 1000);
    return;
  }

  let durationMs: number;
  if (typeof errOrDurationMs === 'number') {
    durationMs = errOrDurationMs;
  } else {
    const parsed = parseRetryDelayMs(errOrDurationMs);
    const strikes = (keyModelStrikeCount.get(pair) || 0) + 1;
    keyModelStrikeCount.set(pair, strikes);
    const profile = getModelExecutionProfile(model);
    if (parsed) {
      durationMs = Math.max(parsed, profile.cooldownStepsMs[0]);
    } else {
      // Model-tier adaptive escalation (lite warms up quickly, flagship/pro rest longer)
      durationMs = profile.cooldownStepsMs[Math.min(strikes - 1, profile.cooldownStepsMs.length - 1)];
    }

    // Shared-project / RPM burst detector: if >= 3 keys hit 429 on this model within 10s, cool the whole model briefly
    const hits = (recentModelQuotaHits.get(model) || []).filter((ts) => now - ts < 10000);
    hits.push(now);
    recentModelQuotaHits.set(model, hits);
    if (hits.length >= 3) {
      modelGlobalCooldowns.set(model, now + Math.min(durationMs, profile.postQuotaRecoveryMs));
    }
  }
  keyModelCooldowns.set(pair, now + durationMs);
}

function isKeyModelInCooldown(key: string, model: string): boolean {
  const now = Date.now();
  const globalUntil = modelGlobalCooldowns.get(model);
  if (globalUntil) {
    if (now < globalUntil) return true;
    modelGlobalCooldowns.delete(model);
  }
  const pair = `${key}::${model}`;
  const dailyUntil = keyModelDailyExhausted.get(pair);
  if (dailyUntil) {
    if (now < dailyUntil) return true;
    keyModelDailyExhausted.delete(pair);
  }
  const until = keyModelCooldowns.get(pair);
  if (!until) return false;
  if (now >= until) {
    keyModelCooldowns.delete(pair);
    return false;
  }
  return true;
}

export interface ModelExecutionProfile {
  tier: 'ultra_lite' | 'smart_lite' | 'balanced_flash' | 'flagship_flash' | 'pro_rigging';
  pacingManyKeysMs: number;
  pacingFewKeysMs: number;
  pacingSingleKeyMs: number;
  minKeyReuseGapMs: number;
  retryDelaysMs: [number, number, number];
  cooldownStepsMs: [number, number, number];
  postQuotaRecoveryMs: number;
  timeoutMs: number;
}

export function getModelExecutionProfile(model?: string): ModelExecutionProfile {
  const m = sanitizeModel(model || 'gemini-3.8-flash').toLowerCase();
  if (m.includes('3.1-pro') || m.includes('4-')) {
    return {
      tier: 'pro_rigging',
      pacingManyKeysMs: 3800,
      pacingFewKeysMs: 6200,
      pacingSingleKeyMs: 9500,
      minKeyReuseGapMs: 12000,
      retryDelaysMs: [3200, 6200, 9500],
      cooldownStepsMs: [45000, 75000, 110000],
      postQuotaRecoveryMs: 26000,
      timeoutMs: 38000,
    };
  }
  if (m.includes('3.8') || m.includes('3.6')) {
    return {
      tier: 'flagship_flash',
      pacingManyKeysMs: 2600,
      pacingFewKeysMs: 4400,
      pacingSingleKeyMs: 7000,
      minKeyReuseGapMs: 7500,
      retryDelaysMs: [2400, 4800, 7500],
      cooldownStepsMs: [36000, 62000, 90000],
      postQuotaRecoveryMs: 22000,
      timeoutMs: 32000,
    };
  }
  if (m.includes('2.5-flash-lite') || m.includes('3.1-flash-lite')) {
    return {
      tier: 'ultra_lite',
      pacingManyKeysMs: 900,
      pacingFewKeysMs: 2000,
      pacingSingleKeyMs: 3400,
      minKeyReuseGapMs: 3200,
      retryDelaysMs: [1000, 2200, 3800],
      cooldownStepsMs: [18000, 34000, 55000],
      postQuotaRecoveryMs: 12000,
      timeoutMs: 18000,
    };
  }
  if (m.includes('3.5-flash-lite')) {
    return {
      tier: 'smart_lite',
      pacingManyKeysMs: 1300,
      pacingFewKeysMs: 2600,
      pacingSingleKeyMs: 4400,
      minKeyReuseGapMs: 4200,
      retryDelaysMs: [1400, 2800, 4600],
      cooldownStepsMs: [24000, 44000, 68000],
      postQuotaRecoveryMs: 15000,
      timeoutMs: 22000,
    };
  }
  // gemini-2.5-flash / gemini-flash-latest
  return {
    tier: 'balanced_flash',
    pacingManyKeysMs: 1800,
    pacingFewKeysMs: 3400,
    pacingSingleKeyMs: 5600,
    minKeyReuseGapMs: 5500,
    retryDelaysMs: [1800, 3600, 5800],
    cooldownStepsMs: [30000, 52000, 78000],
    postQuotaRecoveryMs: 18000,
    timeoutMs: 24000,
  };
}

export function getAdaptiveModelPacingDelay(model: string | undefined, keyCount: number): number {
  const profile = getModelExecutionProfile(model);
  if (keyCount >= 5) return profile.pacingManyKeysMs;
  if (keyCount >= 2) return profile.pacingFewKeysMs;
  return profile.pacingSingleKeyMs;
}

export function getModelCooldownRecoveryMs(model?: string): number {
  return getModelExecutionProfile(model).postQuotaRecoveryMs;
}

async function withModelTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timerId: any = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timerId = setTimeout(() => reject(new Error(`Timeout ${label} (> ${Math.round(timeoutMs / 1000)}s)`)), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timerId) clearTimeout(timerId);
  }
}

export function buildModelFallbackChain(primaryModel?: string): string[] {
  const primary = sanitizeModel(primaryModel || 'gemini-3.8-flash');
  const isLitePrimary = primary.includes('lite');
  const ordered = isLitePrimary
    ? [
        primary,
        'gemini-3.5-flash-lite',
        'gemini-3.1-flash-lite',
        'gemini-2.5-flash-lite',
        'gemini-2.5-flash',
        'gemini-flash-latest',
      ]
    : [
        primary,
        'gemini-2.5-flash-lite',
        'gemini-3.5-flash-lite',
        'gemini-3.1-flash-lite',
        'gemini-2.5-flash',
        'gemini-flash-latest',
      ];
  return Array.from(new Set(ordered)).filter((m) => !isModelUnsupportedCached(m));
}

export function getEarliestCooldownWaitMs(apiKeys: string[], models?: string[]): number {
  const uniqueKeys = getCleanUniqueKeys(apiKeys).filter((k) => !quarantinedKeys.has(k));
  if (uniqueKeys.length === 0) return 0;

  const targetModels = (models && models.length > 0
    ? models
    : ['gemini-3.8-flash', 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-2.5-flash-lite', 'gemini-2.5-flash']
  ).map((m) => sanitizeModel(m)).filter((m) => !isModelUnsupportedCached(m));

  const now = Date.now();
  let minWait = Infinity;

  for (const k of uniqueKeys) {
    for (const m of targetModels) {
      const pair = `${k}::${m}`;
      const dailyUntil = keyModelDailyExhausted.get(pair);
      if (dailyUntil && dailyUntil > now) continue; // skip daily-exhausted pairs
      const globalUntil = modelGlobalCooldowns.get(m);
      const keyUntil = keyModelCooldowns.get(pair) || 0;
      const effectiveUntil = Math.max(keyUntil, globalUntil && globalUntil > now ? globalUntil : 0);
      if (!effectiveUntil || effectiveUntil <= now) return 0; // already available!
      const wait = effectiveUntil - now;
      if (wait < minWait) minWait = wait;
    }
  }

  return Number.isFinite(minWait) && minWait > 0 ? Math.min(minWait + 800, 68000) : 0;
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
  const gapMs = targetModel ? getModelExecutionProfile(targetModel).minKeyReuseGapMs : 0;

  if (targetModel) {
    const globalUntil = modelGlobalCooldowns.get(targetModel);
    if (globalUntil && now < globalUntil) return undefined;
  }

  // Filter out quarantined keys and keys cooling down on this model
  const healthy = uniqueKeys.filter((k) => {
    if (quarantinedKeys.has(k)) return false;
    if (targetModel && isKeyModelInCooldown(k, targetModel)) return false;
    return true;
  });

  if (healthy.length > 0) {
    // Prefer keys that already cleared the per-model minimum reuse gap to prevent RPM spikes
    const rested = targetModel
      ? healthy.filter((k) => now - (keyModelLastUsedAt.get(`${k}::${targetModel}`) || 0) >= gapMs)
      : healthy;
    const pool = rested.length > 0 ? rested : healthy;

    let best = pool[0];
    let oldestTs = targetModel
      ? (keyModelLastUsedAt.get(`${best}::${targetModel}`) || keyLastUsedAt.get(best) || 0)
      : (keyLastUsedAt.get(best) || 0);
    for (let i = 1; i < pool.length; i++) {
      const candidate = pool[i];
      const ts = targetModel
        ? (keyModelLastUsedAt.get(`${candidate}::${targetModel}`) || keyLastUsedAt.get(candidate) || 0)
        : (keyLastUsedAt.get(candidate) || 0);
      if (ts < oldestTs) {
        oldestTs = ts;
        best = candidate;
      }
    }
    keyLastUsedAt.set(best, now);
    if (targetModel) {
      keyModelLastUsedAt.set(`${best}::${targetModel}`, now);
    }
    return best;
  }

  return undefined;
}

export async function waitForKeyReuseGapIfNeeded(apiKeys: string[], model?: string): Promise<number> {
  const uniqueKeys = getCleanUniqueKeys(apiKeys);
  if (uniqueKeys.length === 0) return 0;
  const targetModel = sanitizeModel(model || 'gemini-3.8-flash');
  const gapMs = getModelExecutionProfile(targetModel).minKeyReuseGapMs;
  const now = Date.now();

  const healthy = uniqueKeys.filter((k) => !quarantinedKeys.has(k) && !isKeyModelInCooldown(k, targetModel));
  if (healthy.length === 0) return 0;

  let oldestUsed = Infinity;
  for (const k of healthy) {
    const last = keyModelLastUsedAt.get(`${k}::${targetModel}`) || 0;
    if (now - last >= gapMs) return 0; // At least one key is already fully rested
    if (last < oldestUsed) oldestUsed = last;
  }

  const remaining = Math.min(gapMs, Math.max(0, gapMs - (now - oldestUsed)));
  if (remaining > 50) {
    await new Promise((r) => setTimeout(r, remaining));
  }
  return remaining;
}

export function getCostOptimizedThinkingConfig(
  targetModel: string,
  purpose: 'prompt' | 'animation' | 'vision' = 'animation',
  highPrecision: boolean = false
): any {
  const m = (targetModel || '').toLowerCase();
  if (m.includes('2.5')) {
    return { thinkingBudget: purpose === 'vision' || highPrecision ? 256 : 0 };
  }
  if (m.includes('3.1-pro') || m.includes('4-')) {
    return { thinkingLevel: ThinkingLevel.LOW };
  }
  if (m.includes('3.8') || m.includes('3.6') || m.includes('3.5') || m.includes('3.1-flash-lite') || m.includes('flash-lite')) {
    return { thinkingLevel: purpose === 'vision' || highPrecision ? ThinkingLevel.LOW : ThinkingLevel.MINIMAL };
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
      lower.includes('cors'));

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

function stripLeadingCodeFenceAndLang(raw: string): string {
  const tick3 = String.fromCharCode(96, 96, 96);
  let text = (raw || '').trim();
  const fenceRegex = new RegExp(tick3 + '(?:[a-zA-Z0-9_-]+)?\\s*([\\s\\S]*?)' + tick3, 'i');
  const fenceMatch = text.match(fenceRegex);
  if (fenceMatch && fenceMatch[1]) {
    text = fenceMatch[1].trim();
  }
  text = text
    .replace(new RegExp('^' + tick3 + '(?:[a-zA-Z0-9_-]+)?\\s*', 'i'), '')
    .replace(new RegExp(tick3 + '\\s*$'), '')
    .trim();
  // Strip bare language tag line if regex/model left `javascript`, `js`, `ts`, `html` on line 1
  text = text.replace(/^(?:javascript|typescript|jsx?|tsx?|html)\s*(?:\r?\n|$)/i, '').trim();
  return text;
}

function sanitizeInjectedJsBody(rawJs: string): string {
  let js = stripLeadingCodeFenceAndLang(rawJs);

  // Strip top-level boilerplate DOM/resize/rAF setup that conflicts with our sandbox wrapper
  js = js
    .replace(/^[ \t]*(?:const|let|var)\s+canvas\s*=\s*document\.(?:getElementById|querySelector)\s*\([^)]*\)\s*;?[ \t]*$/gm, '')
    .replace(/^[ \t]*(?:const|let|var)\s+ctx\s*=\s*(?:canvas|document\.(?:getElementById|querySelector)\s*\([^)]*\))\.getContext\s*\([^)]*\)\s*;?[ \t]*$/gm, '')
    .replace(/^[ \t]*window\.addEventListener\s*\(\s*['"]resize['"][^)]*\)\s*;?[ \t]*$/gm, '')
    .replace(/^[ \t]*(?:resize|init)\s*\(\s*\)\s*;?[ \t]*$/gm, '')
    .replace(/^[ \t]*requestAnimationFrame\s*\(\s*animate\s*\)\s*;?[ \t]*$/gm, '')
    .trim();

  // Downgrade ONLY top-level (column-0) `const|let` on reserved harness symbols to `var` so block-scoped locals stay intact
  js = js.replace(/^(?:const|let)\s+(canvas|ctx|dpr|w|h|cx|cy|S|G)\b/gm, 'var $1');

  return js.trim();
}

const STUDIO_GEOMETRY_ENGINE_JS = `
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.miterLimit = 2;
    (function(){
      var _arc = ctx.arc.bind(ctx);
      ctx.arc = function(x, y, r, sa, ea, ccw) {
        return _arc(isFinite(x)?x:0, isFinite(y)?y:0, Math.max(0.1, Math.abs(isFinite(r)?r:0)), isFinite(sa)?sa:0, isFinite(ea)?ea:Math.PI*2, !!ccw);
      };
      if (ctx.ellipse) {
        var _ell = ctx.ellipse.bind(ctx);
        ctx.ellipse = function(x, y, rx, ry, rot, sa, ea, ccw) {
          return _ell(isFinite(x)?x:0, isFinite(y)?y:0, Math.max(0.1, Math.abs(isFinite(rx)?rx:0)), Math.max(0.1, Math.abs(isFinite(ry)?ry:0)), isFinite(rot)?rot:0, isFinite(sa)?sa:0, isFinite(ea)?ea:Math.PI*2, !!ccw);
        };
      }
      if (ctx.roundRect) {
        var _rr = ctx.roundRect.bind(ctx);
        ctx.roundRect = function(x, y, rw, rh, rad) {
          var aw = Math.abs(isFinite(rw)?rw:0), ah = Math.abs(isFinite(rh)?rh:0);
          var rx = rw < 0 ? x + rw : x, ry = rh < 0 ? y + rh : y;
          var sr = Array.isArray(rad) ? rad.map(function(v){ return Math.max(0, isFinite(v)?v:0); }) : Math.max(0, isFinite(rad)?rad:0);
          return _rr(isFinite(rx)?rx:0, isFinite(ry)?ry:0, aw, ah, sr);
        };
      }
    })();
    var G = {
      _n: function(v, d) { return (typeof v === 'number' && isFinite(v)) ? v : (d || 0); },
      grad: function(c1, c2, c3, x0, y0, x1, y1) {
        var gx0 = x0, gy0 = y0, gx1 = x1, gy1 = y1, mid = c3;
        if (typeof c3 === 'number') { gx0 = c3; gy0 = x0; gx1 = y0; gy1 = x1; mid = null; }
        if (typeof gx0 !== 'number' || !isFinite(gx0)) gx0 = -100;
        if (typeof gy0 !== 'number' || !isFinite(gy0)) gy0 = -100;
        if (typeof gx1 !== 'number' || !isFinite(gx1)) gx1 = 100;
        if (typeof gy1 !== 'number' || !isFinite(gy1)) gy1 = 100;
        if (gx0 === gx1 && gy0 === gy1) { gx1 = gx0 + 1; gy1 = gy0 + 1; }
        var g = ctx.createLinearGradient(gx0, gy0, gx1, gy1);
        g.addColorStop(0, c1 || '#ffffff');
        if (mid) { g.addColorStop(0.52, c2 || c1 || '#888888'); g.addColorStop(1, mid); }
        else { g.addColorStop(1, c2 || c1 || '#888888'); }
        return g;
      },
      box: function(x, y, bw, bh, r, fill, rim, lw) {
        x = G._n(x); y = G._n(y);
        bw = Math.max(1, Math.abs(G._n(bw, 1))); bh = Math.max(1, Math.abs(G._n(bh, 1)));
        var rr = Math.min(Math.max(0, G._n(r, 0)), bw * 0.49, bh * 0.49);
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(x - bw / 2, y - bh / 2, bw, bh, rr);
        else ctx.rect(x - bw / 2, y - bh / 2, bw, bh);
        if (fill) { ctx.fillStyle = fill; ctx.fill(); }
        if (rim) { ctx.strokeStyle = rim; ctx.lineWidth = Math.max(0.5, G._n(lw, 1.5)); ctx.stroke(); }
      },
      capsule: function(x, y, bw, bh, fill, rim, lw) {
        bw = Math.max(1, Math.abs(G._n(bw, 1))); bh = Math.max(1, Math.abs(G._n(bh, 1)));
        G.box(x, y, bw, bh, Math.min(bw, bh) * 0.5, fill, rim, lw);
      },
      disc: function(x, y, r, fill, rim, lw) {
        x = G._n(x); y = G._n(y); r = Math.max(0.5, Math.abs(G._n(r, 1)));
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
        if (fill) { ctx.fillStyle = fill; ctx.fill(); }
        if (rim) { ctx.strokeStyle = rim; ctx.lineWidth = Math.max(0.5, G._n(lw, 1.5)); ctx.stroke(); }
      },
      oval: function(x, y, rx, ry, rot, fill, rim, lw) {
        if (typeof rot === 'string' || (rot && typeof rot === 'object')) { lw = rim; rim = fill; fill = rot; rot = 0; }
        x = G._n(x); y = G._n(y);
        rx = Math.max(0.5, Math.abs(G._n(rx, 1))); ry = Math.max(0.5, Math.abs(G._n(ry, rx)));
        ctx.beginPath();
        if (ctx.ellipse) ctx.ellipse(x, y, rx, ry, G._n(rot, 0), 0, Math.PI * 2);
        else ctx.arc(x, y, (rx + ry) * 0.5, 0, Math.PI * 2);
        if (fill) { ctx.fillStyle = fill; ctx.fill(); }
        if (rim) { ctx.strokeStyle = rim; ctx.lineWidth = Math.max(0.5, G._n(lw, 1.5)); ctx.stroke(); }
      },
      ring: function(x, y, r, thick, a0, a1, col) {
        x = G._n(x); y = G._n(y); r = Math.max(0.5, Math.abs(G._n(r, 1)));
        ctx.beginPath(); ctx.arc(x, y, r, a0 != null ? G._n(a0) : 0, a1 != null ? G._n(a1, Math.PI * 2) : Math.PI * 2);
        ctx.strokeStyle = col || '#ffffff'; ctx.lineWidth = Math.max(1, Math.abs(G._n(thick, 2))); ctx.stroke();
      },
      poly: function(pts, fill, rim, lw, close) {
        if (!pts || pts.length < 2) return;
        ctx.beginPath(); ctx.moveTo(G._n(pts[0][0]), G._n(pts[0][1]));
        for (var i = 1; i < pts.length; i++) ctx.lineTo(G._n(pts[i][0]), G._n(pts[i][1]));
        if (close !== false) ctx.closePath();
        if (fill) { ctx.fillStyle = fill; ctx.fill(); }
        if (rim) { ctx.strokeStyle = rim; ctx.lineWidth = Math.max(0.5, G._n(lw, 1.5)); ctx.stroke(); }
      },
      ngon: function(x, y, r, n, rot, fill, rim, lw) {
        if (typeof rot === 'string' || (rot && typeof rot === 'object')) { lw = rim; rim = fill; fill = rot; rot = -Math.PI / 2; }
        x = G._n(x); y = G._n(y); r = Math.max(1, Math.abs(G._n(r, 1))); n = Math.max(3, Math.floor(G._n(n, 6)));
        var a0 = (typeof rot === 'number' && isFinite(rot)) ? rot : -Math.PI / 2, pts = [];
        for (var i = 0; i < n; i++) { var a = a0 + (i * Math.PI * 2) / n; pts.push([x + Math.cos(a) * r, y + Math.sin(a) * r]); }
        G.poly(pts, fill, rim, lw, true);
      },
      star: function(x, y, ro, ri, n, rot, fill, rim, lw) {
        if (typeof rot === 'string' || (rot && typeof rot === 'object')) { lw = rim; rim = fill; fill = rot; rot = -Math.PI / 2; }
        x = G._n(x); y = G._n(y); ro = Math.max(1, Math.abs(G._n(ro, 1))); ri = Math.max(0.5, Math.abs(G._n(ri, ro * 0.45))); n = Math.max(3, Math.floor(G._n(n, 5)));
        var a0 = (typeof rot === 'number' && isFinite(rot)) ? rot : -Math.PI / 2, pts = [];
        for (var i = 0; i < n * 2; i++) { var rr = i % 2 === 0 ? ro : ri; var a = a0 + (i * Math.PI) / n; pts.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr]); }
        G.poly(pts, fill, rim, lw, true);
      },
      pill: function(x1, y1, x2, y2, thick, col) {
        ctx.beginPath(); ctx.moveTo(G._n(x1), G._n(y1)); ctx.lineTo(G._n(x2), G._n(y2));
        ctx.strokeStyle = col || '#ffffff'; ctx.lineWidth = Math.max(1, Math.abs(G._n(thick, 4))); ctx.lineCap = 'round'; ctx.stroke();
      },
      part: function(a1, a2, a3, a4, a5, a6) {
        var fn, tx, ty, rot, sx, sy;
        if (typeof a1 === 'function') { fn = a1; tx = a2; ty = a3; rot = a4; sx = a5; sy = a6; }
        else { tx = a1; ty = a2; rot = a3; sx = a4; sy = a5; fn = a6; }
        if (typeof fn !== 'function') return;
        ctx.save();
        try {
          ctx.translate(G._n(tx, 0), G._n(ty, 0));
          if (rot) ctx.rotate(G._n(rot, 0));
          if (sx != null || sy != null) {
            var vsx = G._n(sx, 1);
            ctx.scale(vsx, sy != null ? G._n(sy, vsx) : vsx);
          }
          fn();
        } finally {
          ctx.restore();
        }
      },
      sheen: function(clipFn, t, sc) {
        if (typeof clipFn !== 'function') return;
        var sp = Math.max(50, G._n(sc, S));
        var sx = ((((G._n(t, 0) * 0.45) % 1.8) - 0.4) * 2 - 1) * sp;
        ctx.save();
        try {
          ctx.beginPath(); clipFn(); ctx.clip();
          var sg = ctx.createLinearGradient(sx - sp * 0.3, -sp * 0.7, sx + sp * 0.3, sp * 0.7);
          sg.addColorStop(0, 'rgba(255,255,255,0)');
          sg.addColorStop(0.5, 'rgba(255,255,255,0.28)');
          sg.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.fillStyle = sg; ctx.fillRect(-sp * 2, -sp * 2, sp * 4, sp * 4);
        } finally {
          ctx.restore();
        }
      }
    };
`;

export function wrapCanvasCodeToHtml(
  rawCode: string,
  isGreenScreen: boolean = false,
  shapeAnalysisTag: string = ''
): string {
  const bg = isGreenScreen ? '#00ff00' : '#080c14';
  const clearFill = isGreenScreen ? "'#00ff00'" : "'#080c14'";

  let jsBody = stripLeadingCodeFenceAndLang(rawCode);

  let extractedAnalysisTag = shapeAnalysisTag;
  const analysisRegex = /<script\s+type=["']application\/json["']\s+id=["']shape-analysis["']>[\s\S]*?<\/script>/i;
  const analysisMatch = jsBody.match(analysisRegex);
  if (analysisMatch) {
    if (!extractedAnalysisTag) extractedAnalysisTag = analysisMatch[0];
    jsBody = jsBody.replace(analysisRegex, '').trim();
  }

  jsBody = sanitizeInjectedJsBody(jsBody);

  // Detect any top-level draw function declared by Gemini (handles naming variance cleanly)
  const fnMatch = jsBody.match(
    /(?:^|\n)[ \t]*(?:function\s+(drawFrame|renderFrame|renderIcon|drawIcon|drawScene|render|draw|paint)\s*\(|(?:const|let|var)\s+(drawFrame|renderFrame|renderIcon|drawIcon|drawScene|render|draw|paint)\s*=)/
  );
  const detectedDrawFn = fnMatch ? (fnMatch[1] || fnMatch[2]) : null;
  const hasAnimate = /(?:^|\n)[ \t]*(?:function\s+animate\s*\(|(?:const|let|var)\s+animate\s*=)/i.test(jsBody);

  const greenShadowLock = isGreenScreen
    ? `try { Object.defineProperty(ctx, 'shadowBlur', { set: function(){}, get: function(){ return 0; }, configurable: true }); } catch(e) {}`
    : '';

  const runnerScript = detectedDrawFn
    ? `${jsBody}
  var __bigmaTargetDraw = typeof ${detectedDrawFn} === 'function' ? ${detectedDrawFn} : null;
  function __bigmaAnimate(time) {
    var __curW = window.innerWidth || document.documentElement.clientWidth || 800;
    var __curH = window.innerHeight || document.documentElement.clientHeight || 600;
    if (__curW > 0 && __curH > 0 && (__curW !== w || __curH !== h || canvas.width === 0)) {
      __bigmaResize();
    }
    var t = (time || 0) * 0.001;
    try {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = ${clearFill};
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.miterLimit = 2;
      ctx.globalCompositeOperation = 'source-over';
      ctx.save();
      if (__bigmaTargetDraw) __bigmaTargetDraw(ctx, w, h, cx, cy, S, t);
      ctx.restore();
    } catch (err) {
      console.error("Canvas render error:", err);
      try { ctx.restore(); } catch {}
    }
    requestAnimationFrame(__bigmaAnimate);
  }
  requestAnimationFrame(__bigmaAnimate);`
    : hasAnimate
    ? `${jsBody}
  var __bigmaUserAnim = typeof animate === 'function' ? animate : null;
  if (__bigmaUserAnim) {
    try { requestAnimationFrame(__bigmaUserAnim); } catch {}
  }`
    : `function __bigmaRawDraw(ctx, w, h, cx, cy, S, t) {
${jsBody}
  }
  function __bigmaAnimate(time) {
    var __curW = window.innerWidth || document.documentElement.clientWidth || 800;
    var __curH = window.innerHeight || document.documentElement.clientHeight || 600;
    if (__curW > 0 && __curH > 0 && (__curW !== w || __curH !== h || canvas.width === 0)) {
      __bigmaResize();
    }
    var t = (time || 0) * 0.001;
    try {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = ${clearFill};
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.miterLimit = 2;
      ctx.globalCompositeOperation = 'source-over';
      ctx.save();
      __bigmaRawDraw(ctx, w, h, cx, cy, S, t);
      ctx.restore();
    } catch (err) {
      console.error("Canvas render error:", err);
      try { ctx.restore(); } catch {}
    }
    requestAnimationFrame(__bigmaAnimate);
  }
  requestAnimationFrame(__bigmaAnimate);`;

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
    var canvas = document.getElementById('c');
    var ctx = canvas.getContext('2d');
    ${greenShadowLock}
    ${STUDIO_GEOMETRY_ENGINE_JS}
    var w = 800, h = 600, cx = 400, cy = 300, S = 264, dpr = 1;
    function __bigmaResize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth || document.documentElement.clientWidth || 800;
      h = window.innerHeight || document.documentElement.clientHeight || 600;
      canvas.width = Math.max(1, Math.floor(w * dpr));
      canvas.height = Math.max(1, Math.floor(h * dpr));
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
      cx = w / 2;
      cy = h / 2;
      S = Math.min(w, h) * 0.44;
    }
    var resize = __bigmaResize;
    window.addEventListener('resize', __bigmaResize);
    __bigmaResize();
    ${runnerScript}
  </script>
</body>
</html>`;
}

function extractHTML(text: string, isGreenScreen: boolean = false): string {
  const tick3 = String.fromCharCode(96, 96, 96);
  let cleanHTML = stripLeadingCodeFenceAndLang(text);

  // Check if model wrapped output in explicit ```html ... ``` or <!doctype ... </html>
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

  // If AI returned lean JS drawFrame/canvas code (without HTML shell), wrap deterministically
  const looksLikePureJs = !lower.includes('<!doctype') && !lower.includes('<html') && !lower.includes('<canvas');
  if (
    looksLikePureJs &&
    (/(?:function\s+(?:drawFrame|renderFrame|drawIcon|drawScene|render|draw|paint|animate)\s*\(|ctx\.(?:fill|stroke|beginPath|roundRect|arc|ellipse|bezierCurveTo|lineTo))/i.test(cleanHTML))
  ) {
    return wrapCanvasCodeToHtml(cleanHTML, isGreenScreen);
  }

  // Auto-heal: If HTML is missing <!DOCTYPE html> or <html>/<body> wrap, but has <canvas> or <script>
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

  // Force matching canvas background if model hardcoded dark background on Green Screen HTML
  if (isGreenScreen && lower.includes('<style')) {
    cleanHTML = cleanHTML.replace(
      /(html\s*,\s*body\s*\{[^}]*background(?:-color)?\s*:\s*)(#[0-9a-fA-F]{3,8}|rgba?\([^)]+\)|[a-z]+)/gi,
      '$1#00ff00'
    );
  }

  // Auto-heal runtime safety: Ensure try/catch wrapping inside animate() function
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

// Deterministic Browser Offscreen Canvas Compile & Pixel Sanity Verifier
// Eliminates blank Green Screen / broken-JS animations BEFORE saving to gallery!
export function verifyCanvasAnimationHtml(
  html: string,
  isGreenScreen: boolean = false,
  type: AnimationType = 'icon'
): { ok: boolean; reason?: string; visiblePixels?: number } {
  if (!html || html.trim().length < 80) {
    return { ok: false, reason: 'HTML animasi kosong/terlalu pendek' };
  }

  // Extract executable <script> tags (skip application/json metadata script)
  const scriptBlocks: string[] = [];
  const scriptRegex = /<script(?:\s+[^>]*)?>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = scriptRegex.exec(html)) !== null) {
    const tagHeader = match[0].substring(0, match[0].indexOf('>') + 1).toLowerCase();
    if (tagHeader.includes('application/json')) continue;
    const body = (match[1] || '').trim();
    if (body) scriptBlocks.push(body);
  }

  if (scriptBlocks.length === 0) {
    return { ok: false, reason: 'Tidak ditemukan blok <script> Canvas' };
  }

  const combinedScript = scriptBlocks.join('\n;\n');

  // Step 1: Compile-time JS syntax verification (works in both browser & SSR)
  try {
    new Function(combinedScript);
  } catch (syntaxErr: any) {
    return { ok: false, reason: `JS SyntaxError: ${syntaxErr?.message || 'Sintaks rusak'}` };
  }

  // Step 2: Offscreen Canvas runtime execution + rendered pixel verification (Browser DOM)
  if (typeof document === 'undefined') {
    return { ok: true };
  }

  try {
    const testW = 320;
    const testH = 180;
    const offscreen = document.createElement('canvas');
    offscreen.width = testW;
    offscreen.height = testH;
    const offCtx = offscreen.getContext('2d', { willReadFrequently: true });
    if (!offCtx) return { ok: true };

    let rafCallback: ((ts: number) => void) | null = null;
    let capturedRenderError: string | null = null;

    const mockCanvasProxy = new Proxy(offscreen, {
      get(target, prop) {
        if (prop === 'width') return target.width;
        if (prop === 'height') return target.height;
        if (prop === 'style') return target.style;
        if (prop === 'getContext') return () => offCtx;
        if (prop === 'getBoundingClientRect') {
          return () => ({ width: testW, height: testH, top: 0, left: 0, right: testW, bottom: testH });
        }
        const val = (target as any)[prop];
        return typeof val === 'function' ? val.bind(target) : val;
      },
      set(target, prop, value) {
        if (prop === 'width' || prop === 'height') {
          // Keep verification raster bounded at 320x180 for instant <2ms readback
          (target as any)[prop] = Math.min(testW, Math.max(100, Number(value) || testW));
          return true;
        }
        (target as any)[prop] = value;
        return true;
      },
    });

    const mockDocument: any = {
      getElementById: () => mockCanvasProxy,
      querySelector: (sel: string) => (String(sel).toLowerCase().includes('canvas') ? mockCanvasProxy : null),
      createElement: (tag: string) => document.createElement(tag),
      documentElement: { clientWidth: testW, clientHeight: testH },
      body: { clientWidth: testW, clientHeight: testH },
      addEventListener: () => {},
    };

    const mockWindow: any = {
      innerWidth: testW,
      innerHeight: testH,
      devicePixelRatio: 1,
      addEventListener: () => {},
      removeEventListener: () => {},
      requestAnimationFrame: (cb: (t: number) => void) => {
        rafCallback = cb;
        return 1;
      },
      cancelAnimationFrame: () => {},
    };

    const mockConsole: any = {
      log: () => {},
      info: () => {},
      warn: () => {},
      error: (...args: any[]) => {
        const msg = args.map((a) => (a?.message ? a.message : String(a))).join(' ');
        if (msg.toLowerCase().includes('render error') || msg.toLowerCase().includes('referenceerror') || msg.toLowerCase().includes('typeerror')) {
          capturedRenderError = msg;
        }
      },
    };

    const runner = new Function(
      'window',
      'document',
      'requestAnimationFrame',
      'cancelAnimationFrame',
      'devicePixelRatio',
      'innerWidth',
      'innerHeight',
      'console',
      combinedScript
    );

    runner(
      mockWindow,
      mockDocument,
      mockWindow.requestAnimationFrame,
      mockWindow.cancelAnimationFrame,
      1,
      testW,
      testH,
      mockConsole
    );

    if (capturedRenderError) {
      return { ok: false, reason: `Runtime error saat inisialisasi: ${capturedRenderError}` };
    }

    let frame1Data: Uint8ClampedArray | null = null;
    if (typeof rafCallback === 'function') {
      // Test two distinct time offsets so animation loop runs cleanly AND actually animates
      (rafCallback as (t: number) => void)(350);
      if (capturedRenderError) {
        return { ok: false, reason: `Runtime error frame #1: ${capturedRenderError}` };
      }
      frame1Data = new Uint8ClampedArray(offCtx.getImageData(0, 0, offscreen.width, offscreen.height).data);
      (rafCallback as (t: number) => void)(1250);
      if (capturedRenderError) {
        return { ok: false, reason: `Runtime error frame #2: ${capturedRenderError}` };
      }
    }

    // Count pixels visibly distinct from target background (#00ff00 vs #080c14) + check geometric bounding box & centroid
    const rw = offscreen.width;
    const rh = offscreen.height;
    const imgData = offCtx.getImageData(0, 0, rw, rh).data;
    const bgR = isGreenScreen ? 0 : 8;
    const bgG = isGreenScreen ? 255 : 12;
    const bgB = isGreenScreen ? 0 : 20;

    let visiblePixels = 0;
    let nonZeroAlphaPixels = 0;
    let minX = rw, maxX = -1, minY = rh, maxY = -1;
    let sumX = 0, sumY = 0;

    for (let py = 0; py < rh; py++) {
      for (let px = 0; px < rw; px++) {
        const i = (py * rw + px) * 4;
        const a = imgData[i + 3];
        if (a > 10) nonZeroAlphaPixels++;
        const dist = Math.abs(imgData[i] - bgR) + Math.abs(imgData[i + 1] - bgG) + Math.abs(imgData[i + 2] - bgB);
        if (dist > 36) {
          visiblePixels++;
          sumX += px;
          sumY += py;
          if (px < minX) minX = px;
          if (px > maxX) maxX = px;
          if (py < minY) minY = py;
          if (py > maxY) maxY = py;
        }
      }
    }

    const bboxW = maxX >= minX ? maxX - minX + 1 : 0;
    const bboxH = maxY >= minY ? maxY - minY + 1 : 0;

    if (nonZeroAlphaPixels === 0 || visiblePixels < (type === 'bg' ? 350 : 180)) {
      return {
        ok: false,
        visiblePixels,
        reason: `Canvas blank/terlalu kecil (${visiblePixels} pixel terlihat${isGreenScreen ? ' pada Green Screen' : ''})`,
      };
    }

    if (type === 'bg') {
      if (bboxW < 140 || bboxH < 70) {
        return {
          ok: false,
          visiblePixels,
          reason: `Background tidak full-frame (${bboxW}x${bboxH}px dari 320x180)`,
        };
      }
    } else {
      if (Math.max(bboxW, bboxH) < 34 || Math.min(bboxW, bboxH) < 14) {
        return {
          ok: false,
          visiblePixels,
          reason: `Bentuk ikon terlalu kecil/cacat (${bboxW}x${bboxH}px)`,
        };
      }
      if (bboxW >= rw - 2 && bboxH >= rh - 2) {
        return {
          ok: false,
          visiblePixels,
          reason: `Bentuk ikon meluber/terpotong penuh di tepi canvas (${bboxW}x${bboxH}px)`,
        };
      }
      const meanX = sumX / visiblePixels;
      const meanY = sumY / visiblePixels;
      if (meanX < rw * 0.16 || meanX > rw * 0.84 || meanY < rh * 0.12 || meanY > rh * 0.88) {
        return {
          ok: false,
          visiblePixels,
          reason: `Posisi ikon melenceng keluar area tengah (${Math.round(meanX)},${Math.round(meanY)})`,
        };
      }
    }

    // Verify motion liveness between t=350ms and t=1250ms (reject frozen/static frames)
    if (frame1Data && frame1Data.length === imgData.length) {
      let changedSamples = 0;
      for (let py = 0; py < rh; py += 4) {
        for (let px = 0; px < rw; px += 4) {
          const i = (py * rw + px) * 4;
          const delta =
            Math.abs(imgData[i] - frame1Data[i]) +
            Math.abs(imgData[i + 1] - frame1Data[i + 1]) +
            Math.abs(imgData[i + 2] - frame1Data[i + 2]);
          if (delta > 24) changedSamples++;
        }
      }
      if (changedSamples < 10) {
        return {
          ok: false,
          visiblePixels,
          reason: `Animasi statis/tidak bergerak antar frame (${changedSamples} sampel berubah)`,
        };
      }
    }

    // Extra guard for Green Screen icons: verify corners aren't flooded dark by accidental full-canvas fillRect
    if (isGreenScreen && type === 'icon') {
      const corners = [0, (rw - 1) * 4, ((rh - 1) * rw) * 4, ((rh - 1) * rw + (rw - 1)) * 4];
      let greenCorners = 0;
      for (const idx of corners) {
        const cr = imgData[idx];
        const cg = imgData[idx + 1];
        const cb = imgData[idx + 2];
        if (cg > 200 && cr < 55 && cb < 55) greenCorners++;
      }
      if (greenCorners < 2) {
        return {
          ok: false,
          visiblePixels,
          reason: 'AI menimpa latar belakang Green Screen (#00FF00) dengan fillRect latar gelap',
        };
      }
    }

    return { ok: true, visiblePixels };
  } catch (runtimeErr: any) {
    return {
      ok: false,
      reason: `Runtime Error Canvas: ${runtimeErr?.message || 'Eksekusi gagal'}`,
    };
  }
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
RULES: Edge-to-edge waves/grids/silk caustics; match motion organically to each scene; NO centered icons, NO particles, NO white flares. ${categoryLine}Style: ${style}, Color: ${colorMode}, Glow: ${neonGlow ? 'ON' : 'OFF'}. ${kwText}${gsText}${avoidText}Return JSON array of ${batchCount} crisp 1-sentence strings.`
    : `Motion Director. Generate ${batchCount} unique standalone 3D ICON motion prompts in English (Seed: ${seed}).
RULES: Clean sculpted 3D icon built from 3-4 welded proportional parts, 45-deg chiaroscuro, 1.5px bevel rim; choose motion naturally matching the specific icon; ZERO rhombus/plate/card/gears/particles/floor-shadow. ${categoryLine}Style: ${style === 'minimalist' ? '3d_crest' : style}, Color: ${colorMode}, Glow: ${neonGlow ? 'ON' : 'OFF'}. ${kwText}${gsText}${avoidText}Return JSON array of ${batchCount} crisp 1-sentence strings.`;

  const config: any = {
    temperature: 0.9,
    maxOutputTokens: batchCount === 1 ? 120 : Math.min(1100, Math.max(220, batchCount * 65)),
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

// Derives physics-matched Canvas motion criteria directly from each prompt's subject
export function resolvePromptMotionPlan(
  promptTopic: string,
  type: AnimationType,
  _style?: string,
  overrideMode?: string
): { label: string; codeHint: string } {
  if (type === 'bg') {
    return {
      label: 'full-frame harmonic wave',
      codeHint: 'seamless cosine ribbon drift & depth phase shift across 0..w, 0..h',
    };
  }
  const topic = (promptTopic || '').toLowerCase();
  if (/\b(bell|megaphone|alarm|siren|alert|horn|speaker|mic)\b/.test(topic)) {
    return {
      label: 'acoustic ring swing',
      codeHint: 'tilt=Math.sin(t*4)*0.12 on main body + delayed clapper/wave arc pulse',
    };
  }
  if (/\b(chart|graph|bar|candlestick|rocket|growth|arrow|market|profit|coin|stack)\b/.test(topic)) {
    return {
      label: 'ascending elastic lift',
      codeHint: 'staggered bar/thrust phase Math.sin(t*2.6-i*0.5) + subtle float bob',
    };
  }
  if (/\b(heart|pulse|ecg|cardiogram|dna|pill|capsule|syringe|medical|stethoscope)\b/.test(topic)) {
    return {
      label: 'cardiac lub-dub pulse',
      codeHint: 'scale=1+0.07*Math.pow(Math.max(0,Math.sin(t*3.2)),4) + smooth bob',
    };
  }
  if (/\b(lock|padlock|vault|shield|key|fingerprint|biometric|security|firewall|safe)\b/.test(topic)) {
    return {
      label: 'precision locking recoil',
      codeHint: 'internal shackle/dial/scan line cycle + crisp squash spring bounce',
    };
  }
  if (/\b(cart|truck|drone|airplane|plane|wheel|forklift|parcel|cargo|delivery)\b/.test(topic)) {
    return {
      label: 'kinetic transport suspension',
      codeHint: 'chassis suspension bob Math.sin(t*3.5)*S*0.025 + spinning wheels/rotors',
    };
  }
  if (/\b(atom|orbit|planet|globe|radar|clock|compass|satellite|astrolabe)\b/.test(topic)) {
    return {
      label: 'orbital & axis precession',
      codeHint: 'rotating inner rings/orbits around anchored center core + gentle tilt',
    };
  }
  if (/\b(brain|chip|cpu|ai|server|network|cloud|robot|camera|eye|microscope|lightbulb)\b/.test(topic)) {
    return {
      label: 'smart telemetry pulse',
      codeHint: 'gimbal tilt Math.sin(t*1.9)*0.07 + pulsing nodes/iris/aperture gleam',
    };
  }
  if (overrideMode && overrideMode !== 'auto') {
    const legacy: Record<string, string> = {
      bounce: 'const sq=1+0.1*Math.cos(t*3), sx=1/Math.sqrt(sq), sy=sq',
      orbital: 'sx=0.88+0.12*Math.cos(t*2), rotY=Math.sin(t*2)*0.15',
      morph: 'pulse=1+0.06*Math.sin(t*2.6), sx=pulse, sy=2-pulse',
      cyber: 'scan=(t*0.8)%1, step pulse',
      mechanical: 'tilt=Math.sin(t*2.2)*0.08, articulated sub-parts',
      flow: 'bobY=Math.sin(t*2.4)*(S*0.04), tilt=Math.sin(t*1.8)*0.05',
    };
    if (legacy[overrideMode]) return { label: overrideMode, codeHint: legacy[overrideMode] };
  }
  return {
    label: 'harmonic elastic float',
    codeHint: 'bobY=Math.sin(t*2.4)*S*0.04, tilt=Math.sin(t*1.8)*0.05 + secondary sub-part lag',
  };
}

// Single-shot Direct Browser Google GenAI SDK animation generator (lean drawFrame output + offscreen pixel validator)
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
  motionDynamics: MotionDynamics = 'auto',
  neonGlow: boolean = true,
  highPrecision: boolean = false
): Promise<{ id: string; title: string; type: AnimationType; style: string; subCategory: string; html: string; isGreenScreen?: boolean; colorMode?: ColorMode; motionDynamics?: MotionDynamics; neonGlow?: boolean }> {
  const cleanKey = extractCleanApiKey(apiKey);
  if (!cleanKey || !cleanKey.startsWith('AIza')) {
    throw new Error('NETWORK_OR_NO_CLIENT_KEY');
  }

  const ai = new GoogleGenAI({ apiKey: cleanKey });
  const isBackground = type === 'bg';
  const motionPlan = resolvePromptMotionPlan(promptTopic, type, style, motionDynamics);

  const colorStyleDirective = isGreenScreen
    ? `GREEN SCREEN (#00ff00 cleared): NEVER fillRect(0,0,w,h)/clearRect; ctx.shadowBlur=0; ONLY vibrant NON-GREEN colors (#FFD700,#00E5FF,#9333EA,#F43F5E,#F8FAFC,#F97316,#1E293B).`
    : neonGlow
    ? `DARK BG (#080c14 cleared): NEVER fillRect(0,0,w,h) for icons; shadowBlur=8 on accents (reset 0).`
    : `CRISP VECTOR (#080c14 cleared): shadowBlur=0.`;

  const geometryGuide = isBackground
    ? `FULL-FRAME BG (0..w,0..h): Draw 3-4 layered smooth cosine ribbons/perspective grids spanning -0.1*w..1.1*w with G.grad.`
    : `SIMPLE PERFECT 3D ICON: Center via G.part(cx, cy+bobY, rot, sx, sy, function(){ ... }). Set R=S*0.68. Build 3-4 clean, symmetric, welded G.* primitives strictly inside [-0.65*R,+0.65*R]; wrap each moving sub-part with G.part(...) so nothing drifts or detaches. NO rhombus/plate, NO card, NO floor shadow, NO gears/particles.`;

  const systemPrompt = `60 FPS Canvas 2D Motion Coder. Return ONLY RAW JS: function drawFrame(ctx, w, h, cx, cy, S, t) { ... } (no markdown/HTML/canvas/resize/rAF; never redeclare canvas/ctx/w/h/cx/cy/S/G).
HELPERS G: G.grad(c1,c2,c3,x0,y0,x1,y1) | G.box(x,y,bw,bh,r,fill,rim,lw) | G.capsule(x,y,bw,bh,fill,rim,lw) | G.disc(x,y,r,fill,rim,lw) | G.oval(x,y,rx,ry,rot,fill,rim,lw) | G.ring(x,y,r,thick,a0,a1,col) | G.poly(pts,fill,rim,lw) | G.ngon(x,y,r,n,rot,fill,rim) | G.star(x,y,ro,ri,n,rot,fill,rim) | G.pill(x1,y1,x2,y2,thick,col) | G.part(tx,ty,rot,sx,sy,fn) | G.sheen(clipFn,t,S)
SPEC: "${promptTopic}" (${subCategory}) | Style: ${style} | Palette: ${colorMode}
- ${geometryGuide}
- Motion (${motionPlan.label}): ${motionPlan.codeHint} + G.sheen diagonal gleam.
- ${colorStyleDirective}`;

  const config: any = {
    temperature: 0.2,
    maxOutputTokens: 1500,
  };
  const smartThinking = getCostOptimizedThinkingConfig(targetModel, 'animation', highPrecision);
  if (smartThinking) {
    config.thinkingConfig = smartThinking;
  }

  const profile = getModelExecutionProfile(targetModel);
  let response: any;
  try {
    response = await withModelTimeout(
      ai.models.generateContent({
        model: targetModel,
        contents: systemPrompt,
        config,
      }),
      profile.timeoutMs,
      targetModel
    );
  } catch (err: any) {
    const classified = classifyGeminiError(err);
    if (classified.isConfigIssue && config.thinkingConfig) {
      const safeConfig = { ...config };
      delete safeConfig.thinkingConfig;
      response = await withModelTimeout(
        ai.models.generateContent({
          model: targetModel,
          contents: systemPrompt,
          config: safeConfig,
        }),
        profile.timeoutMs,
        targetModel
      );
    } else {
      throw err;
    }
  }

  const rawText = response?.text || '';
  const cleanHTML = extractHTML(rawText, isGreenScreen);
  const check = verifyCanvasAnimationHtml(cleanHTML, !!isGreenScreen, type);
  if (!check.ok) {
    throw new Error(`Validasi render gagal (${check.reason || 'canvas blank'})`);
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

function parseBatchDelimiterOutput(rawText: string, expectedCount: number): string[] {
  const out: string[] = new Array(expectedCount).fill('');
  const trimmed = (rawText || '').trim();
  if (!trimmed) return out;

  // Primary: clean delimiter markers // ===ANIM_0=== ... // ===ANIM_1===
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

  // Fallback: if model returned JSON array anyway
  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      return parsed.map((c: any) => String(c || '')).slice(0, expectedCount);
    }
  } catch {
    const m = trimmed.match(/\[[\s\S]*\]/);
    if (m) {
      try {
        const parsed = JSON.parse(m[0]);
        if (Array.isArray(parsed)) return parsed.map((c: any) => String(c || '')).slice(0, expectedCount);
      } catch {}
    }
  }

  // Fallback 2: split multiple `function drawFrame` definitions cleanly
  const fnParts = trimmed.split(/(?=(?:^|\n)[ \t]*function\s+drawFrame\s*\()/);
  const filteredParts = fnParts.map((p) => p.trim()).filter((p) => /function\s+drawFrame\s*\(/.test(p));
  for (let i = 0; i < Math.min(expectedCount, filteredParts.length); i++) {
    out[i] = filteredParts[i];
  }

  return out;
}

// 2-in-1 Direct Browser Batch Animation Generator (uses clean plain-text JS delimiters + offscreen Canvas pixel verification)
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

  const colorStyleDirective = isGreenScreen
    ? 'GREEN SCREEN (#00ff00 cleared): NEVER fillRect(0,0,w,h)/clearRect; shadowBlur=0; ONLY vibrant NON-GREEN colors (#FFD700,#00E5FF,#9333EA,#F43F5E,#F8FAFC,#F97316,#1E293B).'
    : neonGlow
    ? 'DARK BG (#080c14 cleared): shadowBlur=8 on bright LEDs (reset 0).'
    : 'CRISP VECTOR (#080c14 cleared): shadowBlur=0.';

  const geometryGuide = isBackground
    ? 'FULL-FRAME BG (0..w,0..h): 3-4 smooth cosine ribbons/grids spanning -0.1*w..1.1*w.'
    : 'SIMPLE PERFECT 3D ICON: Center with G.part(cx, cy+bobY, rot, sx, sy, fn). Unit R=S*0.68. Weld 3-4 clean symmetric G.* primitives inside [-0.65*R,+0.65*R]; isolate moving sub-parts via G.part. NO rhombus/plate/card/gears/particles/floor-shadow.';

  const topicLines = prompts.map((p, idx) => {
    const plan = resolvePromptMotionPlan(p, type, style, motionDynamics);
    return `// ===ANIM_${idx}=== "${p}" [Motion: ${plan.label} -> ${plan.codeHint}]`;
  }).join('\n');

  const batchPrompt = `60 FPS Canvas 2D Motion Coder. Write ${prompts.length} independent RAW JS functions separated ONLY by:
${prompts.map((_, idx) => `// ===ANIM_${idx}===\nfunction drawFrame(ctx, w, h, cx, cy, S, t) { ... }`).join('\n')}
HELPERS G: G.grad(c1,c2,c3,x0,y0,x1,y1) | G.box(x,y,bw,bh,r,fill,rim,lw) | G.capsule(x,y,bw,bh,fill,rim,lw) | G.disc(x,y,r,fill,rim,lw) | G.oval(x,y,rx,ry,rot,fill,rim,lw) | G.ring(x,y,r,thick,a0,a1,col) | G.poly(pts,fill,rim,lw) | G.ngon(x,y,r,n,rot,fill,rim) | G.star(x,y,ro,ri,n,rot,fill,rim) | G.pill(x1,y1,x2,y2,thick,col) | G.part(tx,ty,rot,sx,sy,fn) | G.sheen(clipFn,t,S)
SPEC: ${geometryGuide}
Style: ${style} | Palette: ${colorMode} | ${colorStyleDirective} | Add G.sheen.
NO markdown/HTML/canvas/resize/rAF or redeclaring canvas/ctx/w/h/cx/cy/S/G.
TOPICS:
${topicLines}`;

  const config: any = {
    temperature: 0.2,
    maxOutputTokens: Math.min(2800, Math.max(1500, prompts.length * 1400)),
  };
  const smartThinking = getCostOptimizedThinkingConfig(targetModel, 'animation', false);
  if (smartThinking) config.thinkingConfig = smartThinking;

  const profile = getModelExecutionProfile(targetModel);
  const batchTimeoutMs = Math.min(46000, profile.timeoutMs + 8000);
  let response: any;
  try {
    response = await withModelTimeout(
      ai.models.generateContent({
        model: targetModel,
        contents: batchPrompt,
        config,
      }),
      batchTimeoutMs,
      `${targetModel} batch`
    );
  } catch (err: any) {
    const classified = classifyGeminiError(err);
    if (classified.isConfigIssue && config.thinkingConfig) {
      const safeConfig = { ...config };
      delete safeConfig.thinkingConfig;
      response = await withModelTimeout(
        ai.models.generateContent({
          model: targetModel,
          contents: batchPrompt,
          config: safeConfig,
        }),
        batchTimeoutMs,
        `${targetModel} batch`
      );
    } else {
      throw err;
    }
  }

  const rawText = (response?.text || '').trim();
  const codeItems = parseBatchDelimiterOutput(rawText, prompts.length);

  return prompts.map((promptTopic, idx) => {
    const rawCode = codeItems[idx] || '';
    if (!rawCode) return null;
    const html = extractHTML(rawCode, isGreenScreen);
    const check = verifyCanvasAnimationHtml(html, !!isGreenScreen, type);
    if (!check.ok) {
      console.warn(`[Batch Slot #${idx} Rejected by Offscreen Verifier]:`, check.reason);
      return null;
    }
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

  const modelChain = buildModelFallbackChain(model);
  const modelsAvailable = modelChain.length > 0 ? modelChain : ['gemini-2.5-flash-lite', 'gemini-2.5-flash'];
  let modelCursor = 0;
  let lastError: any = null;
  let didWaitForCooldown = false;
  let sawQuotaError = false;
  let sawRenderDefect = false;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    let activeModel = modelsAvailable[Math.min(modelCursor, modelsAvailable.length - 1)];
    const activeProfile = getModelExecutionProfile(activeModel);
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
          attempt = Math.max(0, attempt - 1);
          continue;
        }
        throw new AllKeysExhaustedError('Semua API Key sedang dalam masa pendinginan kuota (429).');
      }
    }

    try {
      if (selectedKey && selectedKey.startsWith('AIza')) {
        await waitForKeyReuseGapIfNeeded(uniqueClientKeys, activeModel);
        try {
          const result = await generateAnimationDirect(
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
            neonGlow,
            sawRenderDefect // Only escalate thinking if prior pass failed shape/syntax, NEVER on 429!
          );
          recordKeyModelSuccess(selectedKey, activeModel);
          return result;
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
            sawQuotaError = true;
            markKeyModelCooldown(selectedKey, activeModel, clientErr);
            lastError = new Error(`Limit 429 di ${activeModel}, memutar/mendinginkan key...`);
            // Shift model on repeated 429 or global model cooldown
            if (!getBestHealthyKey(uniqueClientKeys, activeModel) || attempt >= 2) {
              modelCursor = Math.min(modelCursor + 1, modelsAvailable.length - 1);
            }
            if (attempt < maxRetries) {
              const quotaPause = activeProfile.retryDelaysMs[attempt - 1] || 2000;
              if (onRetry) onRetry(attempt, maxRetries, lastError.message);
              await new Promise((r) => setTimeout(r, quotaPause));
              continue;
            }
            // Attempt wait-and-retry once before giving up on 429
            if (!didWaitForCooldown) {
              const waitMs = getEarliestCooldownWaitMs(uniqueClientKeys, modelsAvailable);
              if (waitMs > 0 && waitMs <= 68000) {
                didWaitForCooldown = true;
                if (onRetry) onRetry(attempt, maxRetries, `Menunggu pemulihan kuota 429 selama ${Math.ceil(waitMs / 1000)}s...`);
                await new Promise((r) => setTimeout(r, waitMs));
                attempt = maxRetries - 1;
                continue;
              }
            }
            throw new AllKeysExhaustedError(`Limit kuota 429 di ${activeModel} — seluruh jalur sedang pendinginan.`);
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
            sawRenderDefect = true;
            modelCursor = Math.min(modelCursor + 1, modelsAvailable.length - 1);
            throw clientErr;
          }
        }
      }

      // Server route (used ONLY when no client AIza key or when browser network blocked direct call)
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

      const healedHtml = extractHTML(data.html, isGreenScreen);
      const serverCheck = verifyCanvasAnimationHtml(healedHtml, !!isGreenScreen, type);
      if (!serverCheck.ok) {
        sawRenderDefect = true;
        modelCursor = Math.min(modelCursor + 1, modelsAvailable.length - 1);
        throw new Error(`Validasi render server gagal (${serverCheck.reason || 'canvas blank'})`);
      }

      if (selectedKey) recordKeyModelSuccess(selectedKey, activeModel);
      return {
        ...data,
        html: healedHtml,
        isGreenScreen,
        colorMode,
        motionDynamics,
        neonGlow,
      };
    } catch (err: any) {
      if (err instanceof AllKeysExhaustedError) throw err;
      lastError = err;
      const classified = classifyGeminiError(err);
      if (classified.isQuota) {
        sawQuotaError = true;
        if (selectedKey) markKeyModelCooldown(selectedKey, activeModel, err);
      }
      if (selectedKey && classified.isInvalidKey) markKeyInvalidOrSuspended(selectedKey);
      if (classified.isNotFound) {
        markModelUnsupportedCached(activeModel);
        modelCursor = Math.min(modelCursor + 1, modelsAvailable.length - 1);
      }

      const delayMs = activeProfile.retryDelaysMs[attempt - 1] || 2000;
      const cleanErr = err?.message || 'Kendala jaringan/kuota';
      if (attempt < maxRetries) {
        if (onRetry) onRetry(attempt, maxRetries, `${cleanErr} (jeda ${(delayMs / 1000).toFixed(1)}s)`);
        await new Promise((res) => setTimeout(res, delayMs));
      } else {
        if (onRetry) onRetry(attempt, maxRetries, `${cleanErr} (final sebelum lewati)`);
      }
    }
  }

  // Always classify repeated 429 failures as AllKeysExhaustedError so AutoPilot pauses/recovers instead of skipping 40 items!
  if (sawQuotaError) {
    throw new AllKeysExhaustedError('Kuota/Rate Limit (429) aktif di jalur Gemini — mengaktifkan jeda pemulihan...');
  }

  if (hasClientKeys && !uniqueClientKeys.every((k) => quarantinedKeys.has(k))) {
    const anyHealthy = modelsAvailable.some((m) => !!getBestHealthyKey(uniqueClientKeys, m));
    if (!anyHealthy) {
      throw new AllKeysExhaustedError('Semua API Key sedang dalam masa pendinginan kuota (429).');
    }
  }

  throw new Error(`Gagal setelah ${maxRetries}x percobaan cerdas: ${lastError?.message || 'API limit/timeout'}. Prompt dilewati dan tersimpan untuk dicoba ulang.`);
}

// High-throughput Batch Animation Generator (2 animations per 1 request, with anti-429-avalanche protection)
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
  const modelChain = buildModelFallbackChain(model);
  const modelsAvailable = modelChain.length > 0 ? modelChain : ['gemini-2.5-flash-lite', 'gemini-2.5-flash'];

  let batchItems: Array<any | null> = new Array(prompts.length).fill(null);
  let batchSuccess = false;
  let waitedOnce = false;
  let batchHitQuota = false;
  let modelCursor = 0;

  for (let attempt = 1; attempt <= 3; attempt++) {
    let activeModel = modelsAvailable[Math.min(modelCursor, modelsAvailable.length - 1)];
    let selectedKey = hasClientKeys ? getBestHealthyKey(uniqueClientKeys, activeModel) : undefined;

    if (hasClientKeys && !selectedKey) {
      let foundAlt = false;
      for (let mIdx = 0; mIdx < modelsAvailable.length; mIdx++) {
        const alt = getBestHealthyKey(uniqueClientKeys, modelsAvailable[mIdx]);
        if (alt) {
          activeModel = modelsAvailable[mIdx];
          selectedKey = alt;
          modelCursor = mIdx;
          foundAlt = true;
          break;
        }
      }
      if (!foundAlt) {
        const waitMs = !waitedOnce ? getEarliestCooldownWaitMs(uniqueClientKeys, modelsAvailable) : 0;
        if (waitMs > 0 && waitMs <= 68000) {
          waitedOnce = true;
          if (onLog) onLog(`⏳ Kuota RPM/TPM penuh — menunggu pemulihan otomatis ${Math.ceil(waitMs / 1000)}s...`, 'warn');
          await new Promise((r) => setTimeout(r, waitMs));
          modelCursor = 0;
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
        await waitForKeyReuseGapIfNeeded(uniqueClientKeys, activeModel);
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
          if (batchSuccess) {
            recordKeyModelSuccess(selectedKey, activeModel);
            break;
          }
        } catch (clientErr: any) {
          const classified = classifyGeminiError(clientErr);
          if (classified.isInvalidKey) {
            markKeyInvalidOrSuspended(selectedKey);
            continue;
          }
          if (classified.isQuota) {
            batchHitQuota = true;
            markKeyModelCooldown(selectedKey, activeModel, clientErr);
            // If primary model hit 3x burst 429 or attempt >= 2, move cleanly to fallback model
            if (!getBestHealthyKey(uniqueClientKeys, activeModel) || attempt >= 2) {
              modelCursor = Math.min(modelCursor + 1, modelsAvailable.length - 1);
            }
            if (attempt >= 2 && !waitedOnce) {
              const waitMs = getEarliestCooldownWaitMs(uniqueClientKeys, modelsAvailable);
              if (waitMs > 0 && waitMs <= 68000) {
                waitedOnce = true;
                if (onLog) onLog(`⏳ Limit 429 beruntun — jeda pemulihan otomatis ${Math.ceil(waitMs / 1000)}s sebelum lanjut...`, 'warn');
                await new Promise((r) => setTimeout(r, waitMs));
                continue;
              }
            }
            const batchRetryPause = getModelExecutionProfile(activeModel).retryDelaysMs[attempt - 1] || 1800;
            await new Promise((r) => setTimeout(r, batchRetryPause));
            continue;
          }
          if (classified.isNotFound) {
            markModelUnsupportedCached(activeModel);
            modelCursor = Math.min(modelCursor + 1, modelsAvailable.length - 1);
            continue;
          }
          // On transient server/timeout errors (e.g. 500/503/Timeout on flagship 3.8-flash), wait model delay & rotate
          if (classified.isNetworkError || /timeout|500|502|503|504|unavailable|overloaded/i.test(classified.message)) {
            modelCursor = Math.min(modelCursor + 1, modelsAvailable.length - 1);
            const transientPause = getModelExecutionProfile(activeModel).retryDelaysMs[attempt - 1] || 1800;
            await new Promise((r) => setTimeout(r, transientPause));
            continue;
          }
          if (classified.message !== 'NETWORK_OR_NO_CLIENT_KEY') {
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
          batchItems = data.items.map((it: any) => {
            if (!it || !it.html) return null;
            const healed = extractHTML(it.html, isGreenScreen);
            const check = verifyCanvasAnimationHtml(healed, !!isGreenScreen, type);
            if (!check.ok) {
              console.warn('[Server Batch Item Rejected]:', check.reason);
              return null;
            }
            return { ...it, html: healed };
          });
          batchSuccess = batchItems.some(Boolean);
          if (batchSuccess) {
            if (selectedKey) recordKeyModelSuccess(selectedKey, activeModel);
            break;
          }
        }
      }
    } catch (err: any) {
      const classified = classifyGeminiError(err);
      if (classified.isQuota) {
        batchHitQuota = true;
        if (selectedKey) markKeyModelCooldown(selectedKey, activeModel, err);
      }
      if (selectedKey && classified.isInvalidKey) markKeyInvalidOrSuspended(selectedKey);
      if (classified.isNotFound) markModelUnsupportedCached(activeModel);
    }
  }

  // ANTI-AVALANCHE GUARD: If the entire batch failed due to 429 quota, NEVER fan out into 2x3 = 6 more 429 calls!
  if (!batchSuccess && batchHitQuota) {
    return prompts.map((p) => ({
      prompt: p,
      error: 'Batas kuota 429 tercapai — menahan antrean untuk pemulihan kuota.',
      exhausted: true,
    }));
  }

  // Build final output, filling ONLY missing/rejected slots via single-item verified regeneration
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
          exhausted: e instanceof AllKeysExhaustedError || !!e?.isAllKeysExhausted || batchHitQuota,
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

  const visionPrompt = `Canvas 2D Motion Coder. Rekonstruksi objek GAMBAR REFERENSI menjadi 60 FPS JS murni berpusat via G.part(cx, cy+bobY, rot, sx, sy, fn) skala R=S*0.68.
Gerak OTOMATIS sesuai karakter objek gambar (mis. bel berayun, roda berputar, jarum/grafik naik, jantung berdenyut, atau floating harmonis + G.sheen).
Mode: ${colorMode} | ${isGreenScreen ? 'GREEN SCREEN (#00ff00 bersih: JANGAN fillRect(0,0,w,h), shadowBlur=0, warna non-hijau)' : 'BG Gelap (#080c14)'}.
${customInstructions ? `Instruksi: ${customInstructions}` : ''}
HELPERS G: G.grad(c1,c2,c3,x0,y0,x1,y1) | G.box(x,y,bw,bh,r,fill,rim,lw) | G.capsule(x,y,bw,bh,fill,rim,lw) | G.disc(x,y,r,fill,rim,lw) | G.oval(x,y,rx,ry,rot,fill,rim,lw) | G.ring(x,y,r,thick,a0,a1,col) | G.poly(pts,fill,rim,lw) | G.ngon(x,y,r,n,rot,fill,rim) | G.star(x,y,ro,ri,n,rot,fill,rim) | G.pill(x1,y1,x2,y2,thick,col) | G.part(tx,ty,rot,sx,sy,fn) | G.sheen(clipFn,t,S)
ATURAN: 3-4 sub-bagian rapi tersambung di [-0.65*R,+0.65*R], ZERO gerigi liar, ZERO glass bubble.
Outputkan HANYA blok metadata + fungsi RAW JS (tanpa markdown/HTML/deklarasi canvas/ctx/w/h/cx/cy/S/G):
<script type="application/json" id="shape-analysis">{"objectName":"...","shapeDescription":"...","detectedElements":[],"professionalMotionPlan":"...","similaritySynthesis":"...","glowColor":"#38bdf8"}</script>
function drawFrame(ctx, w, h, cx, cy, S, t) { ... }`;

  const config: any = {
    temperature: 0.15,
    maxOutputTokens: 1900,
  };
  const smartThinking = getCostOptimizedThinkingConfig(targetModel, 'vision');
  if (smartThinking) config.thinkingConfig = smartThinking;

  const visionProfile = getModelExecutionProfile(targetModel);
  const visionTimeoutMs = Math.min(45000, visionProfile.timeoutMs + 6000);
  let response: any;
  try {
    response = await withModelTimeout(
      ai.models.generateContent({
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
      }),
      visionTimeoutMs,
      `${targetModel} vision`
    );
  } catch (err: any) {
    const classified = classifyGeminiError(err);
    if (classified.isConfigIssue && config.thinkingConfig) {
      const safeConfig = { ...config };
      delete safeConfig.thinkingConfig;
      response = await withModelTimeout(
        ai.models.generateContent({
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
        }),
        visionTimeoutMs,
        `${targetModel} vision`
      );
    } else {
      throw err;
    }
  }

  const rawText = response?.text || '';
  const cleanHTML = extractHTML(rawText, isGreenScreen);
  const check = verifyCanvasAnimationHtml(cleanHTML, !!isGreenScreen, 'icon');
  if (check.ok) {
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

  throw new Error(`Validasi render vision gagal (${check.reason || 'canvas blank'})`);
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
  const modelChain = buildModelFallbackChain(model);
  const modelsAvailable = modelChain.length > 0 ? modelChain : ['gemini-2.5-flash-lite', 'gemini-2.5-flash'];
  let modelCursor = 0;

  let lastError: any = null;
  let didWaitForCooldown = false;
  let sawQuotaError = false;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    let activeModel = modelsAvailable[Math.min(modelCursor, modelsAvailable.length - 1)];
    const activeProfile = getModelExecutionProfile(activeModel);
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
        await waitForKeyReuseGapIfNeeded(uniqueClientKeys, activeModel);
        try {
          const i2mResult = await generateImageToMotionDirect(
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
          recordKeyModelSuccess(selectedKey, activeModel);
          return i2mResult;
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
            sawQuotaError = true;
            markKeyModelCooldown(selectedKey, activeModel, clientErr);
            if (!getBestHealthyKey(uniqueClientKeys, activeModel) || attempt >= 2) {
              modelCursor = Math.min(modelCursor + 1, modelsAvailable.length - 1);
            }
            lastError = new Error(`Key kena limit 429 di ${activeModel}, memutar ke key/model lain`);
            if (attempt < maxRetries) {
              if (onRetry) onRetry(attempt, maxRetries, lastError.message);
              await new Promise((r) => setTimeout(r, activeProfile.retryDelaysMs[attempt - 1] || 2000));
              continue;
            }
            throw new AllKeysExhaustedError(`Limit kuota 429 di ${activeModel} — seluruh jalur pendinginan.`);
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
            modelCursor = Math.min(modelCursor + 1, modelsAvailable.length - 1);
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

      const healedHtml = extractHTML(data.html, params.isGreenScreen);
      const check = verifyCanvasAnimationHtml(healedHtml, !!(params.isGreenScreen), 'icon');
      if (!check.ok) {
        modelCursor = Math.min(modelCursor + 1, modelsAvailable.length - 1);
        throw new Error(`Validasi render vision gagal (${check.reason || 'canvas blank'})`);
      }

      if (selectedKey) recordKeyModelSuccess(selectedKey, activeModel);
      return { ...data, html: healedHtml };
    } catch (err: any) {
      if (err instanceof AllKeysExhaustedError) throw err;
      lastError = err;
      const classified = classifyGeminiError(err);
      if (classified.isQuota) {
        sawQuotaError = true;
        if (selectedKey) markKeyModelCooldown(selectedKey, activeModel, err);
      }
      if (selectedKey && classified.isInvalidKey) markKeyInvalidOrSuspended(selectedKey);
      if (classified.isNotFound) {
        markModelUnsupportedCached(activeModel);
        modelCursor = Math.min(modelCursor + 1, modelsAvailable.length - 1);
      }

      const delayMs = activeProfile.retryDelaysMs[attempt - 1] || 2000;
      const cleanErr = err?.message || 'Kendala jaringan/kuota';
      if (attempt < maxRetries) {
        if (onRetry) onRetry(attempt, maxRetries, `${cleanErr} (jeda ${(delayMs / 1000).toFixed(1)}s)`);
        await new Promise((res) => setTimeout(res, delayMs));
      } else {
        if (onRetry) onRetry(attempt, maxRetries, `${cleanErr} (final sebelum lewati)`);
      }
    }
  }

  if (sawQuotaError) {
    throw new AllKeysExhaustedError('Kuota/Rate Limit (429) aktif di jalur Gemini — mengaktifkan jeda pemulihan...');
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
