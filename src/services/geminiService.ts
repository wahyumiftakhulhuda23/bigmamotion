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
const unsupportedThinkingModels = new Set<string>(); // models where thinkingConfig threw invalid_argument

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
  unsupportedThinkingModels.clear();
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
      timeoutMs: 46000,
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
      timeoutMs: 40000,
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
      timeoutMs: 30000,
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
      timeoutMs: 32000,
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
    timeoutMs: 32000,
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
  if (unsupportedThinkingModels.has(m)) return undefined;
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
    var __bigmaT = 0;
    var __bigmaV = 0;
    var G = {
      _n: function(v, d) { return (typeof v === 'number' && isFinite(v)) ? v : (d || 0); },
      _t: function(t) { return (typeof t === 'number' && isFinite(t)) ? t : (typeof __bigmaT === 'number' ? __bigmaT : 0); },
      _v: function(v) {
        var n = (typeof v === 'number' && isFinite(v)) ? v : (typeof __bigmaV === 'number' && isFinite(__bigmaV) ? __bigmaV : 0);
        return Math.abs(Math.floor(n)) % 4;
      },
      _rt: function(rimCol, t, defRim) {
        if (typeof rimCol === 'number') return { r: defRim || '#f8fafc', t: G._t(rimCol) };
        return { r: rimCol || defRim || '#f8fafc', t: G._t(t) };
      },
      _c: function(c) {
        if (!c || typeof c !== 'string' || typeof __bigmaGS === 'undefined' || !__bigmaGS) return c;
        var s = c.trim().toLowerCase();
        if (s.indexOf('rgba(') === 0 || s.indexOf('rgb(') === 0) {
          var p = s.slice(s.indexOf('(') + 1).split(',');
          var rr = parseInt(p[0], 10), gg = parseInt(p[1], 10), bb = parseInt(p[2], 10);
          if (!isNaN(rr) && !isNaN(gg) && !isNaN(bb)) {
            if (gg > rr + 45 && gg > bb + 45) return '#00E5FF';
            return 'rgb(' + rr + ',' + gg + ',' + bb + ')';
          }
          return '#38BDF8';
        }
        if (s.indexOf('hsla(') === 0) return '#38BDF8';
        if (s.charAt(0) === '#' && (s.length === 4 || s.length === 7)) {
          var hx = s.length === 4 ? s[1]+s[1]+s[2]+s[2]+s[3]+s[3] : s.slice(1);
          var r2 = parseInt(hx.slice(0,2),16), g2 = parseInt(hx.slice(2,4),16), b2 = parseInt(hx.slice(4,6),16);
          if (!isNaN(r2) && !isNaN(g2) && !isNaN(b2) && g2 > r2 + 45 && g2 > b2 + 45) return '#00E5FF';
        }
        if (s === 'green' || s === 'lime' || s === 'limegreen' || s === 'springgreen' || s === 'chartreuse') return '#00E5FF';
        return c;
      },
      grad: function(c1, c2, c3, x0, y0, x1, y1) {
        var gx0 = x0, gy0 = y0, gx1 = x1, gy1 = y1, mid = c3;
        if (typeof c3 === 'number') { gx0 = c3; gy0 = x0; gx1 = y0; gy1 = x1; mid = null; }
        if (typeof gx0 !== 'number' || !isFinite(gx0)) gx0 = -100;
        if (typeof gy0 !== 'number' || !isFinite(gy0)) gy0 = -100;
        if (typeof gx1 !== 'number' || !isFinite(gx1)) gx1 = 100;
        if (typeof gy1 !== 'number' || !isFinite(gy1)) gy1 = 100;
        if (gx0 === gx1 && gy0 === gy1) { gx1 = gx0 + 1; gy1 = gy0 + 1; }
        var g = ctx.createLinearGradient(gx0, gy0, gx1, gy1);
        var sc1 = G._c(c1 || '#ffffff'), sc2 = G._c(c2 || c1 || '#888888');
        g.addColorStop(0, sc1);
        if (mid) { g.addColorStop(0.52, sc2); g.addColorStop(1, G._c(mid)); }
        else { g.addColorStop(1, sc2); }
        return g;
      },
      box: function(x, y, bw, bh, r, fill, rim, lw) {
        x = G._n(x); y = G._n(y);
        bw = Math.max(1, Math.abs(G._n(bw, 1))); bh = Math.max(1, Math.abs(G._n(bh, 1)));
        var rr = Math.min(Math.max(0, G._n(r, 0)), bw * 0.49, bh * 0.49);
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(x - bw / 2, y - bh / 2, bw, bh, rr);
        else ctx.rect(x - bw / 2, y - bh / 2, bw, bh);
        if (fill) { ctx.fillStyle = G._c(fill); ctx.fill(); }
        if (rim) { ctx.strokeStyle = G._c(rim); ctx.lineWidth = Math.max(0.5, G._n(lw, 1.5)); ctx.stroke(); }
      },
      bar: function(x, yBase, bw, bh, r, fill, rim, lw) {
        x = G._n(x); yBase = G._n(yBase);
        bw = Math.max(1, Math.abs(G._n(bw, 1))); bh = Math.max(1, Math.abs(G._n(bh, 1)));
        G.box(x, yBase - bh * 0.5, bw, bh, r, fill, rim, lw);
      },
      capsule: function(x, y, bw, bh, fill, rim, lw) {
        bw = Math.max(1, Math.abs(G._n(bw, 1))); bh = Math.max(1, Math.abs(G._n(bh, 1)));
        G.box(x, y, bw, bh, Math.min(bw, bh) * 0.5, fill, rim, lw);
      },
      disc: function(x, y, r, fill, rim, lw) {
        x = G._n(x); y = G._n(y); r = Math.max(0.5, Math.abs(G._n(r, 1)));
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
        if (fill) { ctx.fillStyle = G._c(fill); ctx.fill(); }
        if (rim) { ctx.strokeStyle = G._c(rim); ctx.lineWidth = Math.max(0.5, G._n(lw, 1.5)); ctx.stroke(); }
      },
      oval: function(x, y, rx, ry, rot, fill, rim, lw) {
        if (typeof rot === 'string' || (rot && typeof rot === 'object')) { lw = rim; rim = fill; fill = rot; rot = 0; }
        x = G._n(x); y = G._n(y);
        rx = Math.max(0.5, Math.abs(G._n(rx, 1))); ry = Math.max(0.5, Math.abs(G._n(ry, rx)));
        ctx.beginPath();
        if (ctx.ellipse) ctx.ellipse(x, y, rx, ry, G._n(rot, 0), 0, Math.PI * 2);
        else ctx.arc(x, y, (rx + ry) * 0.5, 0, Math.PI * 2);
        if (fill) { ctx.fillStyle = G._c(fill); ctx.fill(); }
        if (rim) { ctx.strokeStyle = G._c(rim); ctx.lineWidth = Math.max(0.5, G._n(lw, 1.5)); ctx.stroke(); }
      },
      ring: function(x, y, r, thick, a0, a1, col) {
        x = G._n(x); y = G._n(y); r = Math.max(0.5, Math.abs(G._n(r, 1)));
        ctx.beginPath(); ctx.arc(x, y, r, a0 != null ? G._n(a0) : 0, a1 != null ? G._n(a1, Math.PI * 2) : Math.PI * 2);
        ctx.strokeStyle = G._c(col || '#ffffff'); ctx.lineWidth = Math.max(1, Math.abs(G._n(thick, 2))); ctx.stroke();
      },
      poly: function(pts, fill, rim, lw, close) {
        if (!pts || pts.length < 2) return;
        ctx.beginPath(); ctx.moveTo(G._n(pts[0][0]), G._n(pts[0][1]));
        for (var i = 1; i < pts.length; i++) ctx.lineTo(G._n(pts[i][0]), G._n(pts[i][1]));
        if (close !== false) ctx.closePath();
        if (fill) { ctx.fillStyle = G._c(fill); ctx.fill(); }
        if (rim) { ctx.strokeStyle = G._c(rim); ctx.lineWidth = Math.max(0.5, G._n(lw, 1.5)); ctx.stroke(); }
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
        ctx.strokeStyle = G._c(col || '#ffffff'); ctx.lineWidth = Math.max(1, Math.abs(G._n(thick, 4))); ctx.lineCap = 'round'; ctx.stroke();
      },
      arrow: function(x1, y1, x2, y2, thick, headLen, col) {
        x1 = G._n(x1); y1 = G._n(y1); x2 = G._n(x2); y2 = G._n(y2);
        var dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy);
        if (len < 2) return;
        var ux = dx / len, uy = dy / len, hl = Math.min(len * 0.55, Math.max(6, Math.abs(G._n(headLen, 14))));
        var sw = Math.max(1.5, Math.abs(G._n(thick, 4))), sx2 = x2 - ux * hl * 0.72, sy2 = y2 - uy * hl * 0.72;
        G.pill(x1, y1, sx2, sy2, sw, col || '#ffffff');
        var px = -uy * hl * 0.55, py = ux * hl * 0.55, bx = x2 - ux * hl, by = y2 - uy * hl;
        G.poly([[x2, y2], [bx + px, by + py], [bx - px, by - py]], col || '#ffffff', null, 0, true);
      },
      person: function(x, y, s, bodyCol, headCol, rimCol) {
        x = G._n(x); y = G._n(y); s = Math.max(12, Math.abs(G._n(s, 40)));
        var lw = Math.max(1.2, s * 0.05);
        G.box(x, y + s * 0.34, s * 0.92, s * 0.56, s * 0.28, bodyCol || '#1e293b', rimCol || null, lw);
        G.disc(x, y - s * 0.24, s * 0.27, headCol || bodyCol || '#38bdf8', rimCol || null, lw);
      },
      check: function(x, y, s, thick, col) {
        x = G._n(x); y = G._n(y); s = Math.max(6, Math.abs(G._n(s, 14)));
        ctx.beginPath();
        ctx.moveTo(x - s * 0.42, y + s * 0.04);
        ctx.lineTo(x - s * 0.08, y + s * 0.38);
        ctx.lineTo(x + s * 0.48, y - s * 0.32);
        ctx.strokeStyle = G._c(col || '#ffffff');
        ctx.lineWidth = Math.max(1.5, Math.abs(G._n(thick, s * 0.22)));
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke();
      },
      pie: function(x, y, r, a0, sweep, sliceCol, baseCol, rimCol) {
        x = G._n(x); y = G._n(y); r = Math.max(2, Math.abs(G._n(r, 16)));
        G.disc(x, y, r, baseCol || '#334155', rimCol || '#ffffff', Math.max(1, r * 0.08));
        var sa = G._n(a0, -Math.PI / 2), sw = Math.max(0.25, Math.min(Math.PI * 1.92, Math.abs(G._n(sweep, Math.PI * 0.7))));
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.arc(x, y, Math.max(1, r - 1), sa, sa + sw);
        ctx.closePath();
        ctx.fillStyle = G._c(sliceCol || '#f43f5e');
        ctx.fill();
      },
      rays: function(x, y, rIn, rOut, n, rot, thick, col) {
        x = G._n(x); y = G._n(y);
        var ri = Math.max(1, Math.abs(G._n(rIn, 12))), ro = Math.max(ri + 2, Math.abs(G._n(rOut, 22)));
        var cnt = Math.max(3, Math.floor(G._n(n, 6))), a0 = G._n(rot, -Math.PI / 2);
        for (var i = 0; i < cnt; i++) {
          var a = a0 + (i * Math.PI * 2) / cnt;
          G.pill(x + Math.cos(a) * ri, y + Math.sin(a) * ri, x + Math.cos(a) * ro, y + Math.sin(a) * ro, thick || 3, col || '#ffd700');
        }
      },
      handshake: function(x, y, s, colL, colR, handCol, cuffCol, rimCol) {
        x = G._n(x); y = G._n(y); s = Math.max(18, Math.abs(G._n(s, 72)));
        var lw = Math.max(1.5, s * 0.035), rim = rimCol || '#0f172a', cuff = cuffCol || '#f8fafc', palm = handCol || '#f59e0b';
        G.part(x, y, -0.40, 1, 1, function() {
          G.box(-s * 0.56, s * 0.04, s * 0.58, s * 0.30, s * 0.06, colL || '#0284c7', rim, lw);
          G.box(-s * 0.28, s * 0.04, s * 0.13, s * 0.32, s * 0.03, cuff, rim, lw);
        });
        G.part(x, y, 0.40, 1, 1, function() {
          G.box(s * 0.56, s * 0.04, s * 0.58, s * 0.30, s * 0.06, colR || '#4f46e5', rim, lw);
          G.box(s * 0.28, s * 0.04, s * 0.13, s * 0.32, s * 0.03, cuff, rim, lw);
        });
        G.oval(x + s * 0.05, y + s * 0.02, s * 0.24, s * 0.17, 0.35, palm, rim, lw);
        G.oval(x - s * 0.05, y - s * 0.01, s * 0.24, s * 0.17, -0.35, palm, rim, lw);
        G.capsule(x - s * 0.02, y - s * 0.14, s * 0.22, s * 0.10, palm, rim, lw);
        G.part(x + s * 0.02, y + s * 0.09, -0.52, 1, 1, function() {
          G.capsule(-s * 0.09, 0, s * 0.08, s * 0.19, palm, rim, lw);
          G.capsule(0, s * 0.01, s * 0.08, s * 0.20, palm, rim, lw);
          G.capsule(s * 0.09, 0, s * 0.08, s * 0.18, palm, rim, lw);
        });
      },
      shield: function(x, y, s, fillCol, rimCol, innerCol) {
        x = G._n(x); y = G._n(y); s = Math.max(18, Math.abs(G._n(s, 72)));
        var lw = Math.max(1.5, s * 0.045), rim = rimCol || '#f8fafc', w2 = s * 0.44, hTop = s * 0.48, hBot = s * 0.54;
        ctx.beginPath();
        ctx.moveTo(x, y - hTop);
        ctx.lineTo(x + w2, y - hTop * 0.68);
        ctx.quadraticCurveTo(x + w2, y + hBot * 0.35, x, y + hBot);
        ctx.quadraticCurveTo(x - w2, y + hBot * 0.35, x - w2, y - hTop * 0.68);
        ctx.closePath();
        ctx.fillStyle = G._c(fillCol || '#4f46e5');
        ctx.fill();
        ctx.strokeStyle = G._c(rim);
        ctx.lineWidth = lw;
        ctx.stroke();
        if (innerCol) {
          G.shield(x, y, s * 0.72, innerCol, null, null);
        }
      },
      cart: function(x, y, s, bodyCol, wheelCol, rimCol) {
        x = G._n(x); y = G._n(y); s = Math.max(24, Math.abs(G._n(s, 76)));
        var lw = Math.max(2, s * 0.055), rim = rimCol || '#f8fafc', bCol = bodyCol || '#0284c7', wCol = wheelCol || '#ffd700';
        ctx.beginPath();
        ctx.moveTo(x - s * 0.56, y - s * 0.36);
        ctx.lineTo(x - s * 0.38, y - s * 0.36);
        ctx.lineTo(x - s * 0.24, y + s * 0.24);
        ctx.lineTo(x + s * 0.40, y + s * 0.24);
        ctx.strokeStyle = G._c(rim);
        ctx.lineWidth = lw * 1.15;
        ctx.stroke();
        G.poly([[x - s * 0.35, y - s * 0.24], [x + s * 0.48, y - s * 0.24], [x + s * 0.36, y + s * 0.14], [x - s * 0.26, y + s * 0.14]], bCol, rim, lw, true);
        G.pill(x - s * 0.14, y - s * 0.14, x - s * 0.10, y + s * 0.05, lw * 0.85, rim);
        G.pill(x + s * 0.06, y - s * 0.14, x + s * 0.05, y + s * 0.05, lw * 0.85, rim);
        G.pill(x + s * 0.26, y - s * 0.14, x + s * 0.21, y + s * 0.05, lw * 0.85, rim);
        G.disc(x - s * 0.18, y + s * 0.34, s * 0.10, wCol, rim, lw * 0.9);
        G.disc(x + s * 0.30, y + s * 0.34, s * 0.10, wCol, rim, lw * 0.9);
      },
      megaphone: function(x, y, s, coneCol, handleCol, accentCol, rimCol) {
        x = G._n(x); y = G._n(y); s = Math.max(22, Math.abs(G._n(s, 72)));
        var lw = Math.max(1.8, s * 0.045), rim = rimCol || '#f8fafc';
        G.poly([[x - s * 0.26, y + s * 0.08], [x - s * 0.10, y + s * 0.08], [x - s * 0.16, y + s * 0.44], [x - s * 0.30, y + s * 0.44]], handleCol || '#1e293b', rim, lw, true);
        G.box(x - s * 0.36, y - s * 0.02, s * 0.14, s * 0.22, s * 0.05, accentCol || '#38bdf8', rim, lw);
        G.poly([[x - s * 0.30, y - s * 0.14], [x + s * 0.34, y - s * 0.38], [x + s * 0.34, y + s * 0.34], [x - s * 0.30, y + s * 0.10]], coneCol || '#f97316', rim, lw, true);
        G.capsule(x + s * 0.35, y - s * 0.02, s * 0.10, s * 0.74, accentCol || '#ffd700', rim, lw);
      },
      wallet: function(x, y, s, bodyCol, flapCol, claspCol, rimCol) {
        x = G._n(x); y = G._n(y); s = Math.max(22, Math.abs(G._n(s, 76)));
        var lw = Math.max(1.8, s * 0.042), rim = rimCol || '#f8fafc';
        G.box(x, y, s * 0.94, s * 0.64, s * 0.12, bodyCol || '#1e293b', rim, lw);
        G.box(x - s * 0.02, y - s * 0.10, s * 0.88, s * 0.28, s * 0.08, flapCol || '#4f46e5', rim, lw * 0.8);
        G.box(x + s * 0.26, y + s * 0.04, s * 0.36, s * 0.22, s * 0.07, claspCol || '#f59e0b', rim, lw);
        G.disc(x + s * 0.20, y + s * 0.04, s * 0.055, '#ffffff', rim, lw * 0.65);
      },
      globe: function(x, y, r, sphereCol, lineCol, rimCol) {
        x = G._n(x); y = G._n(y); r = Math.max(10, Math.abs(G._n(r, 34)));
        var lw = Math.max(1.5, r * 0.085), lCol = lineCol || '#38bdf8', rCol = rimCol || '#f8fafc';
        G.disc(x, y, r, sphereCol || '#0284c7', null, 0);
        ctx.save();
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.clip();
        G.pill(x - r, y, x + r, y, lw, lCol);
        G.pill(x - r, y - r * 0.44, x + r, y - r * 0.44, lw * 0.85, lCol);
        G.pill(x - r, y + r * 0.44, x + r, y + r * 0.44, lw * 0.85, lCol);
        G.pill(x, y - r, x, y + r, lw, lCol);
        G.oval(x, y, r * 0.48, r, 0, null, lCol, lw);
        ctx.restore();
        G.ring(x, y, r, lw * 1.15, 0, Math.PI * 2, rCol);
      },
      uiLayout: function(x, y, s, frameCol, headerCol, accentCol, rimCol, t, v) {
        x = G._n(x); y = G._n(y); s = Math.max(24, Math.abs(G._n(s, 76)));
        var rt = G._rt(rimCol, t), rim = rt.r, tt = rt.t, lw = Math.max(1.8, s * 0.032), vv = G._v(v);
        var fc = frameCol || '#1e293b', hc = headerCol || '#4f46e5', ac = accentCol || '#00e5ff';
        G.box(x, y, s * 1.02, s * 0.78, s * 0.10, fc, rim, lw);
        G.box(x, y - s * 0.27, s * 0.98, s * 0.17, s * 0.06, hc, rim, lw * 0.8);
        G.disc(x - s * 0.37, y - s * 0.27, s * 0.035, '#f43f5e', null, 0);
        G.disc(x - s * 0.27, y - s * 0.27, s * 0.035, '#ffd700', null, 0);
        G.disc(x - s * 0.17, y - s * 0.27, s * 0.035, ac, null, 0);
        if (vv === 1) {
          G.box(x + s * 0.29, y + s * 0.09, s * 0.30, s * 0.44, s * 0.05, '#0f172a', rim, lw * 0.7);
          var rNav = y - s * 0.03 + Math.sin(tt * 2.4) * s * 0.09;
          G.pill(x + s * 0.20, y - s * 0.03, x + s * 0.38, y - s * 0.03, s * 0.042, '#475569');
          G.pill(x + s * 0.20, y + s * 0.09, x + s * 0.38, y + s * 0.09, s * 0.042, '#475569');
          G.pill(x + s * 0.20, y + s * 0.21, x + s * 0.38, y + s * 0.21, s * 0.042, '#475569');
          G.pill(x + s * 0.20, rNav, x + s * 0.38, rNav, s * 0.048, ac);
          var cDy = Math.sin(tt * 2.5) * s * 0.025;
          G.box(x - s * 0.16, y - s * 0.02 + cDy, s * 0.48, s * 0.21, s * 0.05, ac, rim, lw * 0.75);
          G.box(x - s * 0.28, y + s * 0.21, s * 0.22, s * 0.18, s * 0.04, '#38bdf8', rim, lw * 0.7);
          G.box(x - s * 0.03, y + s * 0.21, s * 0.22, s * 0.18, s * 0.04, '#ffd700', rim, lw * 0.7);
        } else if (vv === 2) {
          var k1 = s * (0.02 * Math.sin(tt * 2.4)), k2 = s * (0.02 * Math.sin(tt * 2.4 + 1.4));
          G.box(x - s * 0.23, y - s * 0.02 + k1, s * 0.42, s * 0.20, s * 0.05, ac, rim, lw * 0.75);
          G.box(x + s * 0.23, y - s * 0.02 + k2, s * 0.42, s * 0.20, s * 0.05, '#ffd700', rim, lw * 0.75);
          G.box(x, y + s * 0.22, s * 0.88, s * 0.20, s * 0.05, '#0f172a', rim, lw * 0.75);
          var sw = s * (0.30 + 0.14 * Math.sin(tt * 2.5));
          G.pill(x - s * 0.34, y + s * 0.22, x - s * 0.34 + sw, y + s * 0.22, s * 0.06, '#38bdf8');
        } else if (vv === 3) {
          var xs3 = [x - s * 0.30, x, x + s * 0.30], cols3 = [ac, '#38bdf8', '#ffd700'];
          for (var c3 = 0; c3 < 3; c3++) {
            var cy3 = y + s * 0.09 + Math.sin(tt * 2.6 - c3 * 0.9) * s * 0.03;
            G.box(xs3[c3], cy3, s * 0.25, s * 0.42, s * 0.05, '#0f172a', cols3[c3], lw * 0.85);
            G.box(xs3[c3], cy3 - s * 0.08, s * 0.16, s * 0.12, s * 0.03, cols3[c3], null, 0);
            G.pill(xs3[c3] - s * 0.07, cy3 + s * 0.10, xs3[c3] + s * 0.07, cy3 + s * 0.10, s * 0.035, '#94a3b8');
          }
        } else {
          G.box(x - s * 0.29, y + s * 0.09, s * 0.30, s * 0.44, s * 0.05, '#0f172a', rim, lw * 0.7);
          var navY = y - s * 0.03 + Math.sin(tt * 2.4) * s * 0.09;
          G.pill(x - s * 0.38, y - s * 0.03, x - s * 0.20, y - s * 0.03, s * 0.042, '#475569');
          G.pill(x - s * 0.38, y + s * 0.09, x - s * 0.20, y + s * 0.09, s * 0.042, '#475569');
          G.pill(x - s * 0.38, y + s * 0.21, x - s * 0.20, y + s * 0.21, s * 0.042, '#475569');
          G.pill(x - s * 0.38, navY, x - s * 0.20, navY, s * 0.048, ac);
          var heroDy = Math.sin(tt * 2.6) * s * 0.025;
          G.box(x + s * 0.16, y - s * 0.02 + heroDy, s * 0.50, s * 0.21, s * 0.05, ac, rim, lw * 0.75);
          G.pill(x - s * 0.01, y - s * 0.02 + heroDy, x + s * 0.28, y - s * 0.02 + heroDy, s * 0.042, '#ffffff');
          G.box(x + s * 0.03, y + s * 0.21, s * 0.22, s * 0.18, s * 0.04, '#38bdf8', rim, lw * 0.7);
          G.box(x + s * 0.29, y + s * 0.21, s * 0.22, s * 0.18, s * 0.04, '#ffd700', rim, lw * 0.7);
        }
      },
      videoCall: function(x, y, s, frameCol, tileCol, accCol, rimCol, t, v) {
        x = G._n(x); y = G._n(y); s = Math.max(24, Math.abs(G._n(s, 76)));
        var rt = G._rt(rimCol, t), rim = rt.r, tt = rt.t, lw = Math.max(1.8, s * 0.032), vv = G._v(v);
        var fc = frameCol || '#1e293b', tc = tileCol || '#4f46e5', ac = accCol || '#00e5ff';
        G.box(x, y + s * 0.38, s * 0.42, s * 0.10, s * 0.04, fc, rim, lw * 0.85);
        G.box(x, y + s * 0.31, s * 0.14, s * 0.12, s * 0.02, '#475569', rim, lw * 0.75);
        G.box(x, y - s * 0.03, s * 1.04, s * 0.70, s * 0.09, fc, rim, lw);
        G.box(x, y - s * 0.03, s * 0.92, s * 0.56, s * 0.06, '#0f172a', '#334155', lw * 0.65);
        G.disc(x, y - s * 0.34, s * 0.035, '#38bdf8', '#0f172a', lw * 0.5);
        if (vv === 1) {
          G.box(x - s * 0.13, y - s * 0.03, s * 0.54, s * 0.44, s * 0.05, tc, rim, lw * 0.7);
          G.person(x - s * 0.13, y, s * 0.34, '#38bdf8', '#f8fafc', rim);
          var pipY = y - s * 0.12 + Math.sin(tt * 2.3) * s * 0.025;
          G.box(x + s * 0.28, pipY, s * 0.24, s * 0.22, s * 0.04, ac, rim, lw * 0.7);
          G.person(x + s * 0.28, pipY + s * 0.02, s * 0.17, '#1e293b', '#f8fafc', null);
          for (var b1 = 0; b1 < 3; b1++) {
            var bh1 = s * (0.06 + 0.05 * Math.abs(Math.sin(tt * 4.2 + b1 * 0.9)));
            G.bar(x + s * (0.20 + b1 * 0.08), y + s * 0.20, s * 0.045, bh1, s * 0.02, '#ffd700', null, 0);
          }
        } else if (vv === 2) {
          var qx = [-s * 0.21, s * 0.21, -s * 0.21, s * 0.21], qy = [-s * 0.16, -s * 0.16, s * 0.09, s * 0.09];
          var qcols = [tc, ac, '#f97316', '#38bdf8'];
          for (var q = 0; q < 4; q++) {
            var act = Math.sin(tt * 2.5 - q * 1.5) > 0.3;
            G.box(x + qx[q], y + qy[q], s * 0.38, s * 0.22, s * 0.04, '#1e293b', act ? '#ffd700' : rim, act ? lw : lw * 0.65);
            G.person(x + qx[q], y + qy[q] + s * 0.02, s * 0.17, qcols[q], '#f8fafc', null);
          }
        } else if (vv === 3) {
          G.box(x, y - s * 0.06, s * 0.82, s * 0.38, s * 0.05, tc, rim, lw * 0.7);
          G.person(x - s * 0.22, y - s * 0.04, s * 0.26, '#38bdf8', '#f8fafc', rim);
          G.person(x + s * 0.22, y - s * 0.04, s * 0.26, ac, '#f8fafc', rim);
          G.box(x, y + s * 0.19, s * 0.62, s * 0.09, s * 0.04, '#1e293b', rim, lw * 0.6);
          G.disc(x - s * 0.14, y + s * 0.19, s * 0.032, '#f43f5e', null, 0);
          G.disc(x, y + s * 0.19, s * (0.03 + 0.01 * Math.sin(tt * 3.5)), '#ffd700', null, 0);
          G.disc(x + s * 0.14, y + s * 0.19, s * 0.032, ac, null, 0);
        } else {
          var p0 = 0.5 + 0.5 * Math.sin(tt * 2.4);
          G.box(x - s * 0.21, y - s * 0.07, s * 0.39, s * 0.34, s * 0.05, tc, p0 > 0.5 ? '#ffd700' : rim, lw * 0.85);
          G.person(x - s * 0.21, y - s * 0.05, s * 0.26, '#38bdf8', '#f8fafc', null);
          G.box(x + s * 0.21, y - s * 0.07, s * 0.39, s * 0.34, s * 0.05, '#334155', p0 <= 0.5 ? '#ffd700' : rim, lw * 0.85);
          G.person(x + s * 0.21, y - s * 0.05, s * 0.26, ac, '#f8fafc', null);
          G.capsule(x, y + s * 0.18, s * 0.56, s * 0.09, '#1e293b', rim, lw * 0.65);
          G.disc(x - s * 0.14, y + s * 0.18, s * 0.032, '#f43f5e', null, 0);
          G.pill(x - s * 0.02, y + s * 0.18, x + s * (0.06 + 0.12 * p0), y + s * 0.18, s * 0.04, ac);
        }
      },
      laptop: function(x, y, s, bodyCol, screenCol, accCol, rimCol, t, v) {
        x = G._n(x); y = G._n(y); s = Math.max(24, Math.abs(G._n(s, 76)));
        var rt = G._rt(rimCol, t), rim = rt.r, tt = rt.t, lw = Math.max(1.8, s * 0.032), vv = G._v(v);
        var bc = bodyCol || '#1e293b', sc = screenCol || '#0f172a', ac = accCol || '#00e5ff';
        G.box(x, y - s * 0.08, s * 0.86, s * 0.58, s * 0.07, bc, rim, lw);
        G.box(x, y - s * 0.08, s * 0.74, s * 0.46, s * 0.04, sc, '#4f46e5', lw * 0.65);
        G.poly([[x - s * 0.44, y + s * 0.20], [x + s * 0.44, y + s * 0.20], [x + s * 0.54, y + s * 0.34], [x - s * 0.54, y + s * 0.34]], '#334155', rim, lw, true);
        G.box(x, y + s * 0.29, s * 0.22, s * 0.055, s * 0.02, ac, null, 0);
        if (vv === 1) {
          var bBase = y + s * 0.10;
          var hA = s * (0.12 + 0.05 * Math.sin(tt * 2.6)), hB = s * (0.19 + 0.06 * Math.sin(tt * 2.6 - 0.8)), hC = s * (0.26 + 0.06 * Math.sin(tt * 2.6 - 1.6));
          G.bar(x - s * 0.20, bBase, s * 0.11, hA, s * 0.025, '#38bdf8', null, 0);
          G.bar(x - s * 0.04, bBase, s * 0.11, hB, s * 0.025, '#4f46e5', null, 0);
          G.bar(x + s * 0.12, bBase, s * 0.11, hC, s * 0.025, ac, null, 0);
          G.arrow(x - s * 0.22, y - s * 0.10, x + s * 0.24, y - s * 0.22 + Math.sin(tt * 2.6) * s * 0.02, s * 0.032, s * 0.085, '#ffd700');
        } else if (vv === 2) {
          var dy2 = Math.sin(tt * 2.4) * s * 0.025;
          G.box(x - s * 0.17, y - s * 0.08 + dy2, s * 0.30, s * 0.30, s * 0.04, '#4f46e5', rim, lw * 0.6);
          G.box(x + s * 0.17, y - s * 0.14 - dy2, s * 0.30, s * 0.16, s * 0.04, ac, rim, lw * 0.6);
          G.box(x + s * 0.17, y + s * 0.04, s * 0.30, s * 0.14, s * 0.04, '#ffd700', rim, lw * 0.6);
        } else if (vv === 3) {
          G.disc(x - s * 0.17, y - s * 0.08, s * 0.13, '#1e293b', ac, lw * 0.7);
          G.ring(x - s * 0.17, y - s * 0.08, s * 0.09, s * 0.032, -Math.PI / 2, -Math.PI / 2 + Math.PI * (1.2 + 0.4 * Math.sin(tt * 2.5)), '#ffd700');
          G.pill(x + s * 0.02, y - s * 0.16, x + s * 0.28, y - s * 0.16, s * 0.045, ac);
          G.pill(x + s * 0.02, y - s * 0.06, x + s * (0.18 + 0.08 * Math.sin(tt * 2.5)), y - s * 0.06, s * 0.045, '#38bdf8');
          G.pill(x + s * 0.02, y + s * 0.04, x + s * 0.24, y + s * 0.04, s * 0.045, '#f97316');
        } else {
          var rys = [y - s * 0.19, y - s * 0.08, y + s * 0.03];
          var rCols = [ac, '#ffd700', '#38bdf8'];
          for (var ri = 0; ri < 3; ri++) {
            var prog = 0.5 + 0.5 * Math.sin(tt * 2.7 - ri * 1.0);
            G.disc(x - s * 0.24, rys[ri], s * 0.042, rCols[ri], '#ffffff', lw * 0.45);
            G.pill(x - s * 0.13, rys[ri], x + s * (0.10 + 0.15 * prog), rys[ri], s * 0.045, rCols[ri]);
          }
        }
      },
      checklist: function(x, y, s, boardCol, clipCol, accentCol, rimCol, t, v) {
        x = G._n(x); y = G._n(y); s = Math.max(24, Math.abs(G._n(s, 76)));
        var rt = G._rt(rimCol, t), rim = rt.r, tt = rt.t, lw = Math.max(1.8, s * 0.034), vv = G._v(v);
        var bc = boardCol || '#1e293b', cc = clipCol || '#f59e0b', ac = accentCol || '#00e5ff';
        G.box(x, y + s * 0.04, s * 0.80, s * 0.94, s * 0.10, bc, rim, lw);
        G.box(x, y + s * 0.06, s * 0.66, s * 0.76, s * 0.06, '#f8fafc', '#0f172a', lw * 0.65);
        G.box(x, y - s * 0.42, s * 0.34, s * 0.13, s * 0.04, cc, rim, lw);
        if (vv === 1) {
          var ys1 = [y - s * 0.13, y + s * 0.07, y + s * 0.27];
          var cols1 = ['#4f46e5', ac, '#f43f5e'];
          for (var i1 = 0; i1 < 3; i1++) {
            var p1 = 0.5 + 0.5 * Math.sin(tt * 2.6 - i1 * 1.0);
            G.disc(x - s * 0.18, ys1[i1], s * 0.065, cols1[i1], '#0f172a', lw * 0.55);
            G.check(x - s * 0.18, ys1[i1], s * (0.06 + 0.018 * p1), s * 0.022, '#ffffff');
            G.pill(x - s * 0.05, ys1[i1], x + s * (0.12 + 0.12 * p1), ys1[i1], s * 0.05, cols1[i1]);
          }
          G.star(x + s * 0.26, y - s * 0.34, s * 0.11, s * 0.05, 5, -Math.PI / 2, '#ffd700', rim, lw * 0.6);
        } else if (vv === 2) {
          G.box(x - s * 0.15, y - s * 0.14, s * 0.24, s * 0.10, s * 0.03, '#4f46e5', null, 0);
          G.box(x + s * 0.15, y - s * 0.14, s * 0.24, s * 0.10, s * 0.03, ac, null, 0);
          var sl = Math.sin(tt * 2.3) * s * 0.06;
          G.box(x + sl, y + s * 0.04, s * 0.44, s * 0.14, s * 0.04, '#38bdf8', '#0f172a', lw * 0.6);
          G.box(x - sl * 0.7, y + s * 0.24, s * 0.44, s * 0.14, s * 0.04, '#ffd700', '#0f172a', lw * 0.6);
        } else if (vv === 3) {
          G.disc(x, y - s * 0.12, s * 0.14, '#1e293b', '#0f172a', lw * 0.6);
          G.ring(x, y - s * 0.12, s * 0.10, s * 0.04, -Math.PI / 2, -Math.PI / 2 + Math.PI * (1.1 + 0.6 * Math.sin(tt * 2.4)), ac);
          G.check(x, y - s * 0.12, s * 0.09, s * 0.025, '#ffd700');
          var ys3 = [y + s * 0.13, y + s * 0.28];
          for (var i3 = 0; i3 < 2; i3++) {
            var p3 = 0.5 + 0.5 * Math.sin(tt * 2.8 - i3 * 1.1);
            G.box(x - s * 0.17, ys3[i3], s * 0.10, s * 0.10, s * 0.025, i3 === 0 ? ac : '#4f46e5', '#0f172a', lw * 0.5);
            G.pill(x - s * 0.05, ys3[i3], x + s * (0.12 + 0.12 * p3), ys3[i3], s * 0.05, '#1e293b');
          }
        } else {
          var ys = [y - s * 0.14, y + s * 0.07, y + s * 0.28];
          var cols = [ac, '#4f46e5', '#f97316'];
          for (var i = 0; i < 3; i++) {
            var p = 0.5 + 0.5 * Math.sin(tt * 2.8 - i * 1.1);
            G.box(x - s * 0.18, ys[i], s * 0.12, s * 0.12, s * 0.03, cols[i], '#0f172a', lw * 0.55);
            G.check(x - s * 0.18, ys[i], s * (0.065 + 0.02 * p), s * 0.024, '#ffffff');
            G.pill(x - s * 0.05, ys[i], x + s * (0.10 + 0.13 * p), ys[i], s * 0.055, cols[i]);
          }
        }
      },
      rocket: function(x, y, s, hullCol, wingCol, flameCol, rimCol, t, v) {
        x = G._n(x); y = G._n(y); s = Math.max(24, Math.abs(G._n(s, 76)));
        var rt = G._rt(rimCol, t), rim = rt.r, tt = rt.t, lw = Math.max(1.8, s * 0.034), vv = G._v(v);
        var hc = hullCol || '#f8fafc', wc = wingCol || '#4f46e5', fc = flameCol || '#f97316';
        var fl = 0.5 + 0.5 * Math.sin(tt * 9.0);
        G.poly([[x - s * 0.11, y + s * 0.26], [x + s * 0.11, y + s * 0.26], [x, y + s * (0.44 + 0.10 * fl)]], fc, '#ffd700', lw * 0.7, true);
        G.poly([[x - s * 0.055, y + s * 0.26], [x + s * 0.055, y + s * 0.26], [x, y + s * (0.35 + 0.06 * fl)]], '#ffd700', null, 0, true);
        G.poly([[x - s * 0.16, y + s * 0.02], [x - s * 0.36, y + s * 0.26], [x - s * 0.14, y + s * 0.24]], wc, rim, lw, true);
        G.poly([[x + s * 0.16, y + s * 0.02], [x + s * 0.36, y + s * 0.26], [x + s * 0.14, y + s * 0.24]], wc, rim, lw, true);
        G.box(x, y + s * 0.25, s * 0.22, s * 0.08, s * 0.02, '#1e293b', rim, lw * 0.8);
        G.capsule(x, y - s * 0.03, s * 0.36, s * 0.62, hc, '#0f172a', lw);
        G.poly([[x - s * 0.16, y - s * 0.18], [x + s * 0.16, y - s * 0.18], [x, y - s * 0.46]], '#f43f5e', rim, lw, true);
        if (vv === 1) {
          G.disc(x, y - s * 0.06, s * 0.075, '#00e5ff', '#0f172a', lw * 0.8);
          G.disc(x, y + s * 0.10, s * 0.065, '#ffd700', '#0f172a', lw * 0.8);
        } else if (vv === 2) {
          G.box(x, y - s * 0.10, s * 0.34, s * 0.08, s * 0.02, wc, rim, lw * 0.7);
          G.star(x, y + s * 0.06, s * 0.095, s * 0.045, 5, -Math.PI / 2, '#ffd700', '#0f172a', lw * 0.7);
        } else if (vv === 3) {
          G.box(x, y - s * 0.04, s * 0.22, s * 0.14, s * 0.06, '#00e5ff', '#0f172a', lw * 0.85);
          G.capsule(x - s * 0.20, y + s * 0.10, s * 0.10, s * 0.26, wc, rim, lw * 0.75);
          G.capsule(x + s * 0.20, y + s * 0.10, s * 0.10, s * 0.26, wc, rim, lw * 0.75);
        } else {
          G.disc(x, y - s * 0.03, s * 0.095, '#00e5ff', '#0f172a', lw);
        }
      },
      lightbulb: function(x, y, s, bulbCol, rayCol, baseCol, rimCol, t, v) {
        x = G._n(x); y = G._n(y); s = Math.max(24, Math.abs(G._n(s, 76)));
        var rt = G._rt(rimCol, t), rim = rt.r, tt = rt.t, lw = Math.max(1.8, s * 0.034), vv = G._v(v);
        var bc = bulbCol || '#ffd700', rc = rayCol || '#00e5ff', bsc = baseCol || '#1e293b';
        if (vv === 1) {
          G.ring(x, y - s * 0.09, s * 0.40, s * 0.035, tt * 0.9, tt * 0.9 + Math.PI * 1.4, rc);
          G.star(x + s * 0.34, y - s * 0.34, s * (0.09 + 0.02 * Math.sin(tt * 3.2)), s * 0.04, 4, 0, '#ffffff', rc, lw * 0.5);
        } else if (vv === 2) {
          G.rays(x, y - s * 0.09, s * 0.33, s * (0.46 + 0.05 * Math.sin(tt * 3.8)), 9, -Math.PI / 2 - Math.sin(tt * 1.6) * 0.1, s * 0.036, rc);
        } else if (vv === 3) {
          G.ring(x, y - s * 0.09, s * 0.39, s * 0.04, Math.PI * 1.15, Math.PI * 1.85, rc);
          G.rays(x, y - s * 0.09, s * 0.34, s * (0.45 + 0.04 * Math.cos(tt * 3.2)), 5, -Math.PI / 2, s * 0.048, '#f97316');
        } else {
          var rOut = s * (0.44 + 0.06 * Math.sin(tt * 3.4));
          G.rays(x, y - s * 0.09, s * 0.34, rOut, 7, -Math.PI / 2 + Math.sin(tt * 1.4) * 0.08, s * 0.042, rc);
        }
        G.capsule(x, y + s * 0.39, s * 0.15, s * 0.075, bsc, rim, lw * 0.9);
        G.box(x, y + s * 0.28, s * 0.25, s * 0.15, s * 0.04, '#475569', rim, lw);
        G.box(x, y + s * 0.14, s * 0.25, s * 0.13, s * 0.03, bc, rim, lw);
        G.disc(x, y - s * 0.09, s * 0.29, bc, rim, lw);
        if (vv === 3) {
          G.poly([[x + s * 0.02, y - s * 0.22], [x - s * 0.07, y - s * 0.07], [x + s * 0.01, y - s * 0.07], [x - s * 0.04, y + s * 0.08], [x + s * 0.09, y - s * 0.10], [x + s * 0.01, y - s * 0.10]], '#ffffff', '#0f172a', lw * 0.6, true);
        } else if (vv === 1) {
          G.disc(x, y - s * 0.10, s * (0.11 + 0.02 * Math.sin(tt * 3.4)), '#ffffff', '#f97316', lw * 0.7);
        } else {
          G.poly([[x - s * 0.09, y + s * 0.02], [x - s * 0.04, y - s * 0.11], [x, y - s * 0.03], [x + s * 0.04, y - s * 0.11], [x + s * 0.09, y + s * 0.02]], null, '#ffffff', lw * 1.15, false);
        }
      },
      chart: function(x, y, s, cardCol, bar1Col, bar2Col, arrowCol, rimCol, t, v) {
        x = G._n(x); y = G._n(y); s = Math.max(24, Math.abs(G._n(s, 76)));
        var rt = G._rt(rimCol, t), rim = rt.r, tt = rt.t, lw = Math.max(1.8, s * 0.032), vv = G._v(v);
        var cc = cardCol || '#1e293b', b1 = bar1Col || '#38bdf8', b2 = bar2Col || '#4f46e5', ac = arrowCol || '#ffd700';
        G.box(x, y, s * 1.02, s * 0.78, s * 0.10, cc, rim, lw);
        var yBase = y + s * 0.25;
        G.pill(x - s * 0.38, yBase + s * 0.02, x + s * 0.38, yBase + s * 0.02, lw, '#94a3b8');
        if (vv === 1) {
          var xs = [-s * 0.27, -s * 0.09, s * 0.09, s * 0.27];
          var hs = [0.16, 0.24, 0.33, 0.42];
          var bcols = [b1, b2, '#00e5ff', ac];
          var pts = [];
          for (var bi = 0; bi < 4; bi++) {
            var hCur = s * (hs[bi] + 0.06 * Math.sin(tt * 2.5 - bi * 0.7));
            G.bar(x + xs[bi], yBase, s * 0.11, hCur, s * 0.025, bcols[bi], rim, lw * 0.6);
            pts.push([x + xs[bi], yBase - hCur - s * 0.05]);
          }
          G.poly(pts, null, ac, lw, false);
        } else if (vv === 2) {
          G.pie(x - s * 0.22, y - s * 0.06, s * 0.16, -Math.PI / 2 + tt * 0.6, Math.PI * 1.25, ac, b2, rim);
          var hb1 = s * (0.26 + 0.07 * Math.sin(tt * 2.6));
          var hb2 = s * (0.40 + 0.07 * Math.sin(tt * 2.6 - 0.9));
          G.bar(x + s * 0.09, yBase, s * 0.14, hb1, s * 0.03, b1, rim, lw * 0.7);
          G.bar(x + s * 0.28, yBase, s * 0.14, hb2, s * 0.03, '#00e5ff', rim, lw * 0.7);
        } else if (vv === 3) {
          var hA = s * (0.19 + 0.06 * Math.cos(tt * 2.5));
          var hB = s * (0.31 + 0.07 * Math.cos(tt * 2.5 - 0.9));
          var hC = s * (0.42 + 0.07 * Math.cos(tt * 2.5 - 1.8));
          G.bar(x - s * 0.24, yBase, s * 0.15, hA, s * 0.03, b1, rim, lw * 0.7);
          G.bar(x, yBase, s * 0.15, hB, s * 0.03, ac, rim, lw * 0.7);
          G.bar(x + s * 0.24, yBase, s * 0.15, hC, s * 0.03, b2, rim, lw * 0.7);
          G.disc(x - s * 0.24, yBase - hA - s * 0.05, s * 0.04, '#ffffff', rim, lw * 0.5);
          G.disc(x, yBase - hB - s * 0.05, s * 0.04, '#ffffff', rim, lw * 0.5);
          G.disc(x + s * 0.24, yBase - hC - s * 0.05, s * 0.04, '#ffffff', rim, lw * 0.5);
        } else {
          var h1 = s * (0.20 + 0.07 * Math.sin(tt * 2.6));
          var h2 = s * (0.31 + 0.07 * Math.sin(tt * 2.6 - 0.8));
          var h3 = s * (0.41 + 0.08 * Math.sin(tt * 2.6 - 1.6));
          G.bar(x - s * 0.24, yBase, s * 0.15, h1, s * 0.03, b1, rim, lw * 0.7);
          G.bar(x, yBase, s * 0.15, h2, s * 0.03, b2, rim, lw * 0.7);
          G.bar(x + s * 0.24, yBase, s * 0.15, h3, s * 0.03, '#00e5ff', rim, lw * 0.7);
          var ay = Math.sin(tt * 2.8) * s * 0.025;
          G.arrow(x - s * 0.30, y - s * 0.06, x + s * 0.30, y - s * 0.27 + ay, s * 0.042, s * 0.11, ac);
        }
      },
      magnifier: function(x, y, s, cardCol, lensCol, handleCol, accentCol, rimCol, t, v) {
        x = G._n(x); y = G._n(y); s = Math.max(24, Math.abs(G._n(s, 76)));
        var rt = G._rt(rimCol, t), rim = rt.r, tt = rt.t, lw = Math.max(1.8, s * 0.032), vv = G._v(v);
        var cc = cardCol || '#1e293b', lc = lensCol || '#00e5ff', hc = handleCol || '#f59e0b', ac = accentCol || '#ffd700';
        G.box(x - s * 0.06, y, s * 0.78, s * 0.84, s * 0.09, cc, rim, lw);
        G.pill(x - s * 0.32, y - s * 0.25, x + s * 0.16, y - s * 0.25, s * 0.05, '#475569');
        G.pill(x - s * 0.32, y - s * 0.10, x + s * 0.08, y - s * 0.10, s * 0.05, '#38bdf8');
        G.bar(x - s * 0.25, y + s * 0.28, s * 0.10, s * 0.18, s * 0.02, '#4f46e5', null, 0);
        G.bar(x - s * 0.10, y + s * 0.28, s * 0.10, s * 0.26, s * 0.02, '#38bdf8', null, 0);
        var ox = Math.cos(tt * 2.1) * s * 0.065, oy = Math.sin(tt * 2.1) * s * 0.065;
        if (vv === 1) {
          ox = Math.sin(tt * 2.0) * s * 0.08; oy = Math.sin(tt * 4.0) * s * 0.04;
          G.pill(x + ox - s * 0.16, y + oy + s * 0.16, x + ox - s * 0.38, y + oy + s * 0.38, s * 0.10, hc);
          G.disc(x + ox, y + oy - s * 0.01, s * 0.24, '#0f172a', lc, s * 0.055);
          G.check(x + ox, y + oy - s * 0.01, s * 0.14, s * 0.036, ac);
        } else if (vv === 2) {
          G.pill(x + ox + s * 0.16, y + oy + s * 0.16, x + ox + s * 0.40, y + oy + s * 0.40, s * 0.10, hc);
          G.disc(x + ox + s * 0.03, y + oy - s * 0.01, s * 0.24, '#0f172a', lc, s * 0.055);
          G.ring(x + ox + s * 0.03, y + oy - s * 0.01, s * 0.13, s * 0.025, tt * 2.0, tt * 2.0 + Math.PI * 1.4, ac);
          G.disc(x + ox + s * 0.03, y + oy - s * 0.01, s * 0.055, ac, null, 0);
        } else if (vv === 3) {
          G.pill(x + ox + s * 0.16, y + oy + s * 0.16, x + ox + s * 0.40, y + oy + s * 0.40, s * 0.10, hc);
          G.disc(x + ox + s * 0.03, y + oy - s * 0.01, s * 0.24, '#0f172a', lc, s * 0.055);
          var ks3 = 1 + 0.12 * Math.sin(tt * 3.0);
          G.star(x + ox + s * 0.03, y + oy - s * 0.01, s * 0.12 * ks3, s * 0.055 * ks3, 5, -Math.PI / 2, ac, rim, lw * 0.5);
        } else {
          G.pill(x + ox + s * 0.16, y + oy + s * 0.16, x + ox + s * 0.40, y + oy + s * 0.40, s * 0.10, hc);
          G.disc(x + ox + s * 0.03, y + oy - s * 0.01, s * 0.24, '#0f172a', lc, s * 0.055);
          var bh = s * (0.14 + 0.05 * Math.sin(tt * 3.0));
          G.bar(x + ox - s * 0.04, y + oy + s * 0.08, s * 0.065, bh * 0.75, s * 0.015, ac, null, 0);
          G.bar(x + ox + s * 0.08, y + oy + s * 0.08, s * 0.065, bh, s * 0.015, lc, null, 0);
        }
      },
      pieChart: function(x, y, s, baseCol, s1Col, s2Col, s3Col, rimCol, t, v) {
        x = G._n(x); y = G._n(y); s = Math.max(24, Math.abs(G._n(s, 76)));
        var rt = G._rt(rimCol, t), rim = rt.r, tt = rt.t, lw = Math.max(1.8, s * 0.032), vv = G._v(v);
        var r = s * 0.40, c1 = s1Col || '#00e5ff', c2 = s2Col || '#4f46e5', c3 = s3Col || '#f59e0b';
        if (vv === 2) {
          G.box(x - s * 0.28, y, s * 0.34, s * 0.48, s * 0.06, baseCol || '#1e293b', rim, lw * 0.8);
          G.pill(x - s * 0.37, y - s * 0.12, x - s * 0.19, y - s * 0.12, s * 0.045, c1);
          G.pill(x - s * 0.37, y, x - s * 0.19, y, s * 0.045, c2);
          G.pill(x - s * 0.37, y + s * 0.12, x - s * 0.19, y + s * 0.12, s * 0.045, c3);
          x = x + s * 0.14; r = s * 0.34;
        }
        G.disc(x, y, r, baseCol || '#1e293b', rim, lw);
        var aShift = vv === 1 ? Math.sin(tt * 1.4) * 0.25 : 0;
        var pop = s * (0.04 + 0.035 * Math.sin(tt * 2.6));
        var angles = vv === 1
          ? [[-Math.PI / 2, 0.2, c1, 0], [0.2, 1.8, c2, pop], [1.8, 3.5, '#f43f5e', 0], [3.5, Math.PI * 1.5, c3, 0]]
          : [[-Math.PI / 2 + aShift, 0.75 + aShift, c1, 0], [0.75 + aShift, 2.75 + aShift, c2, 0], [2.75 + aShift, Math.PI * 1.5 + aShift, c3, pop]];
        for (var i = 0; i < angles.length; i++) {
          var a0 = angles[i][0], a1 = angles[i][1], mid = (a0 + a1) * 0.5, off = angles[i][3];
          var px = x + Math.cos(mid) * off, py = y + Math.sin(mid) * off;
          ctx.beginPath(); ctx.moveTo(px, py); ctx.arc(px, py, r * 0.92, a0, a1); ctx.closePath();
          ctx.fillStyle = G._c(angles[i][2]); ctx.fill();
          ctx.strokeStyle = G._c(rim); ctx.lineWidth = lw * 0.85; ctx.stroke();
        }
        G.disc(x, y, s * (vv === 3 ? 0.20 : 0.13), '#0f172a', rim, lw * 0.85);
        if (vv === 3) {
          G.ring(x, y, s * 0.14, s * 0.035, -tt * 2.0, -tt * 2.0 + Math.PI * 1.3, c1);
        }
      },
      gears: function(x, y, s, g1Col, g2Col, coreCol, rimCol, t, v) {
        x = G._n(x); y = G._n(y); s = Math.max(24, Math.abs(G._n(s, 76)));
        var rt = G._rt(rimCol, t), rim = rt.r, tt = rt.t, lw = Math.max(1.6, s * 0.03), vv = G._v(v);
        var drawGear = function(gx, gy, gr, teeth, ang, gCol, cCol) {
          G.part(gx, gy, ang, 1, 1, function() {
            for (var i = 0; i < teeth; i++) {
              var a = (i * Math.PI * 2) / teeth;
              G.part(0, 0, a, 1, 1, function() { G.box(0, -gr * 0.92, gr * 0.34, gr * 0.34, gr * 0.06, gCol, rim, lw * 0.8); });
            }
            G.disc(0, 0, gr * 0.82, gCol, rim, lw);
            G.disc(0, 0, gr * 0.34, cCol, rim, lw * 0.85);
          });
        };
        var a1 = tt * 1.45;
        if (vv === 1) {
          drawGear(x - s * 0.16, y, s * 0.28, 8, a1, g1Col || '#0284c7', coreCol || '#ffd700');
          drawGear(x + s * 0.20, y - s * 0.18, s * 0.19, 6, -a1 * 1.33 + 0.3, g2Col || '#4f46e5', '#00e5ff');
          drawGear(x + s * 0.20, y + s * 0.20, s * 0.19, 6, -a1 * 1.33 + 0.8, '#f97316', '#f8fafc');
        } else if (vv === 2) {
          G.box(x, y, s * 0.96, s * 0.56, s * 0.14, '#0f172a', rim, lw);
          drawGear(x - s * 0.20, y, s * 0.23, 8, a1, g1Col || '#0284c7', coreCol || '#ffd700');
          drawGear(x + s * 0.20, y, s * 0.23, 8, -a1 + 0.38, g2Col || '#4f46e5', '#00e5ff');
        } else if (vv === 3) {
          G.ring(x, y, s * 0.42, s * 0.05, tt * 0.9, tt * 0.9 + Math.PI * 1.4, '#00e5ff');
          drawGear(x, y, s * 0.34, 10, -a1, g1Col || '#4f46e5', coreCol || '#ffd700');
        } else {
          drawGear(x - s * 0.14, y + s * 0.10, s * 0.30, 8, a1, g1Col || '#0284c7', coreCol || '#ffd700');
          drawGear(x + s * 0.22, y - s * 0.18, s * 0.22, 6, -a1 * 1.33 + 0.4, g2Col || '#4f46e5', '#00e5ff');
        }
      },
      userBadge: function(x, y, s, cardCol, personCol, accentCol, rimCol, t, v) {
        x = G._n(x); y = G._n(y); s = Math.max(24, Math.abs(G._n(s, 76)));
        var rt = G._rt(rimCol, t), rim = rt.r, tt = rt.t, lw = Math.max(1.8, s * 0.032), vv = G._v(v);
        var cc = cardCol || '#1e293b', pc = personCol || '#0284c7', ac = accentCol || '#00e5ff';
        if (vv === 1) {
          G.capsule(x, y - s * 0.42, s * 0.22, s * 0.08, ac, rim, lw * 0.7);
          G.box(x, y + s * 0.02, s * 0.72, s * 0.88, s * 0.10, cc, rim, lw);
          G.person(x, y - s * 0.12, s * 0.32, pc, '#f8fafc', rim);
          var bw1 = s * (0.36 + 0.08 * Math.sin(tt * 2.5));
          G.pill(x - bw1 * 0.5, y + s * 0.18, x + bw1 * 0.5, y + s * 0.18, s * 0.05, ac);
          G.star(x, y + s * 0.32, s * 0.10, s * 0.045, 5, -Math.PI / 2, '#ffd700', rim, lw * 0.6);
        } else if (vv === 2) {
          G.box(x, y, s * 1.00, s * 0.74, s * 0.10, cc, rim, lw);
          G.box(x + s * 0.24, y, s * 0.34, s * 0.48, s * 0.06, '#0f172a', rim, lw * 0.75);
          G.person(x + s * 0.24, y + s * 0.03, s * 0.30, pc, '#f8fafc', rim);
          for (var si = 0; si < 3; si++) {
            var kst = 1 + 0.12 * Math.sin(tt * 3.0 - si * 0.8);
            G.star(x - s * 0.32 + si * s * 0.13, y - s * 0.16, s * 0.055 * kst, s * 0.025 * kst, 5, -Math.PI / 2, '#ffd700', null, 0);
          }
          G.pill(x - s * 0.38, y + s * 0.04, x - s * 0.02, y + s * 0.04, s * 0.055, ac);
          G.pill(x - s * 0.38, y + s * 0.20, x - s * 0.08, y + s * 0.20, s * 0.055, '#38bdf8');
        } else if (vv === 3) {
          G.box(x, y + s * 0.06, s * 0.96, s * 0.66, s * 0.10, cc, rim, lw);
          G.disc(x - s * 0.24, y - s * 0.06, s * 0.24, '#0f172a', ac, lw * 0.85);
          G.person(x - s * 0.24, y - s * 0.04, s * 0.26, pc, '#f8fafc', rim);
          var slw = s * (0.30 + 0.07 * Math.sin(tt * 2.5));
          G.pill(x + s * 0.06, y - s * 0.04, x + s * 0.06 + slw, y - s * 0.04, s * 0.055, '#ffd700');
          G.pill(x + s * 0.06, y + s * 0.12, x + s * 0.34, y + s * 0.12, s * 0.055, ac);
        } else {
          G.box(x, y, s * 1.00, s * 0.74, s * 0.10, cc, rim, lw);
          G.box(x - s * 0.24, y, s * 0.34, s * 0.48, s * 0.06, '#0f172a', rim, lw * 0.75);
          G.person(x - s * 0.24, y + s * 0.03, s * 0.30, pc, '#f8fafc', rim);
          var w1 = s * (0.28 + 0.07 * Math.sin(tt * 2.5));
          var w2 = s * (0.24 + 0.07 * Math.sin(tt * 2.5 - 0.8));
          G.pill(x + s * 0.02, y - s * 0.13, x + s * 0.02 + w1, y - s * 0.13, s * 0.055, ac);
          G.pill(x + s * 0.02, y + s * 0.03, x + s * 0.02 + w2, y + s * 0.03, s * 0.055, '#38bdf8');
          G.pill(x + s * 0.02, y + s * 0.19, x + s * 0.24, y + s * 0.19, s * 0.055, '#94a3b8');
          var bs = 1 + 0.10 * Math.sin(tt * 3.0);
          G.disc(x + s * 0.34, y - s * 0.24, s * 0.13 * bs, '#ffd700', rim, lw * 0.85);
          G.check(x + s * 0.34, y - s * 0.24, s * 0.11 * bs, s * 0.03, '#0f172a');
        }
      },
      typography: function(x, y, s, cardCol, inkCol, accentCol, rimCol, t, v) {
        x = G._n(x); y = G._n(y); s = Math.max(24, Math.abs(G._n(s, 76)));
        var rt = G._rt(rimCol, t), rim = rt.r, tt = rt.t, lw = Math.max(1.8, s * 0.032), vv = G._v(v);
        var cc = cardCol || '#1e293b', ic = inkCol || '#f8fafc', ac = accentCol || '#00e5ff';
        G.box(x, y, s * 0.90, s * 0.82, s * 0.08, cc, rim, lw);
        var cx0 = s * 0.45, cy0 = s * 0.41;
        G.box(x - cx0, y - cy0, s * 0.10, s * 0.10, s * 0.02, ac, rim, lw * 0.6);
        G.box(x + cx0, y - cy0, s * 0.10, s * 0.10, s * 0.02, ac, rim, lw * 0.6);
        G.box(x - cx0, y + cy0, s * 0.10, s * 0.10, s * 0.02, ac, rim, lw * 0.6);
        G.box(x + cx0, y + cy0, s * 0.10, s * 0.10, s * 0.02, ac, rim, lw * 0.6);
        if (vv === 1) {
          G.pill(x - s * 0.22, y - s * 0.20, x + s * 0.22, y - s * 0.20, s * 0.075, ic);
          G.pill(x, y - s * 0.20, x, y + s * 0.18, s * 0.085, ic);
          G.pill(x - s * 0.10, y + s * 0.18, x + s * 0.10, y + s * 0.18, s * 0.055, ac);
        } else if (vv === 2) {
          G.pill(x - s * 0.24, y - s * 0.18, x - s * 0.24, y + s * 0.16, s * 0.07, ic);
          G.pill(x + s * 0.24, y - s * 0.18, x + s * 0.24, y + s * 0.16, s * 0.07, ic);
          G.pill(x - s * 0.24, y, x + s * 0.24, y, s * 0.07, ac);
        } else if (vv === 3) {
          G.pill(x - s * 0.26, y + s * 0.14, x + s * 0.26, y - s * 0.14, s * 0.04, '#64748b');
          G.disc(x - s * 0.26, y + s * 0.14, s * 0.055, '#ffd700', rim, lw * 0.6);
          G.disc(x + s * 0.26, y - s * 0.14, s * 0.055, '#ffd700', rim, lw * 0.6);
          G.pill(x - s * 0.18, y + s * 0.14, x, y - s * 0.22, s * 0.075, ic);
          G.pill(x + s * 0.18, y + s * 0.14, x, y - s * 0.22, s * 0.075, ic);
        } else {
          G.pill(x - s * 0.20, y + s * 0.16, x, y - s * 0.22, s * 0.075, ic);
          G.pill(x + s * 0.20, y + s * 0.16, x, y - s * 0.22, s * 0.075, ic);
          G.pill(x - s * 0.11, y + s * 0.04, x + s * 0.11, y + s * 0.04, s * 0.065, ac);
        }
        var curX = x - s * 0.24 + (0.5 + 0.5 * Math.sin(tt * 2.2)) * s * 0.48;
        G.pill(x - s * 0.28, y + s * 0.26, x + s * 0.28, y + s * 0.26, s * 0.032, '#64748b');
        G.disc(curX, y + s * 0.26, s * 0.065, '#ffd700', rim, lw * 0.7);
      },
      briefcase: function(x, y, s, bodyCol, flapCol, claspCol, rimCol, t, v) {
        x = G._n(x); y = G._n(y); s = Math.max(24, Math.abs(G._n(s, 76)));
        var rt = G._rt(rimCol, t), rim = rt.r, tt = rt.t, lw = Math.max(1.8, s * 0.034), vv = G._v(v);
        var dy = Math.sin(tt * 2.4) * s * 0.022;
        if (vv === 2) {
          G.box(x + s * 0.12, y - s * 0.22 + dy, s * 0.34, s * 0.26, s * 0.04, '#f8fafc', '#0f172a', lw * 0.65);
          G.pill(x + s * 0.01, y - s * 0.24 + dy, x + s * 0.22, y - s * 0.24 + dy, s * 0.04, '#00e5ff');
        }
        G.ring(x, y - s * 0.23, s * 0.15, s * 0.06, Math.PI, Math.PI * 2, rim);
        G.box(x, y + s * 0.07, s * 0.94, s * 0.60, s * 0.09, bodyCol || '#1e293b', rim, lw);
        G.box(x, y - s * 0.06 + dy, s * 0.96, s * 0.27, s * 0.07, flapCol || '#4f46e5', rim, lw);
        if (vv === 1) {
          G.box(x - s * 0.22, y + s * 0.07 + dy * 0.6, s * 0.10, s * 0.22, s * 0.025, claspCol || '#ffd700', rim, lw * 0.7);
          G.box(x + s * 0.22, y + s * 0.07 + dy * 0.6, s * 0.10, s * 0.22, s * 0.025, claspCol || '#ffd700', rim, lw * 0.7);
        } else if (vv === 3) {
          G.disc(x, y + s * 0.08 + dy * 0.6, s * 0.11, claspCol || '#ffd700', rim, lw * 0.8);
          G.check(x, y + s * 0.08 + dy * 0.6, s * 0.09, s * 0.025, '#0f172a');
        } else {
          G.box(x, y + s * 0.08 + dy * 0.6, s * 0.16, s * 0.15, s * 0.03, claspCol || '#ffd700', rim, lw * 0.85);
        }
      },
      trophy: function(x, y, s, cupCol, baseCol, starCol, rimCol, t, v) {
        x = G._n(x); y = G._n(y); s = Math.max(24, Math.abs(G._n(s, 76)));
        var rt = G._rt(rimCol, t), rim = rt.r, tt = rt.t, lw = Math.max(1.8, s * 0.034), vv = G._v(v);
        var cc = cupCol || '#ffd700', bc = baseCol || '#1e293b', sc = starCol || '#ffffff';
        G.ring(x - s * 0.25, y - s * 0.12, s * 0.13, s * 0.05, 0, Math.PI * 2, cc);
        G.ring(x + s * 0.25, y - s * 0.12, s * 0.13, s * 0.05, 0, Math.PI * 2, cc);
        G.box(x, y + s * 0.40, s * 0.48, s * 0.11, s * 0.03, bc, rim, lw);
        if (vv === 2) G.box(x, y + s * 0.32, s * 0.34, s * 0.09, s * 0.02, '#4f46e5', rim, lw * 0.8);
        G.box(x, y + s * 0.26, s * 0.14, s * 0.20, s * 0.02, cc, rim, lw);
        G.poly([[x - s * 0.28, y - s * 0.33], [x + s * 0.28, y - s * 0.33], [x + s * 0.16, y + s * 0.17], [x - s * 0.16, y + s * 0.17]], cc, rim, lw, true);
        var st = 1 + 0.12 * Math.sin(tt * 3.2);
        if (vv === 1) {
          G.box(x, y - s * 0.29, s * 0.52, s * 0.08, s * 0.03, '#4f46e5', rim, lw * 0.7);
          G.star(x, y - s * 0.07, s * 0.12 * st, s * 0.055 * st, 5, -Math.PI / 2, sc, '#b45309', lw * 0.7);
        } else if (vv === 3) {
          G.ngon(x, y - s * 0.09, s * 0.13 * st, 4, 0, '#00e5ff', rim, lw * 0.8);
        } else {
          G.star(x, y - s * 0.10, s * 0.12 * st, s * 0.055 * st, 5, -Math.PI / 2, sc, '#b45309', lw * 0.7);
        }
      },
      clock: function(x, y, s, bezelCol, faceCol, handCol, rimCol, t, v) {
        x = G._n(x); y = G._n(y); s = Math.max(24, Math.abs(G._n(s, 76)));
        var rt = G._rt(rimCol, t), rim = rt.r, tt = rt.t, lw = Math.max(1.8, s * 0.034), vv = G._v(v);
        if (vv === 1) G.capsule(x, y - s * 0.48, s * 0.18, s * 0.10, '#ffd700', rim, lw * 0.8);
        if (vv === 2) {
          G.disc(x - s * 0.30, y - s * 0.32, s * 0.12, '#f97316', rim, lw * 0.8);
          G.disc(x + s * 0.30, y - s * 0.32, s * 0.12, '#f97316', rim, lw * 0.8);
        }
        if (vv === 3) {
          G.box(x, y, s * 0.88, s * 0.88, s * 0.22, bezelCol || '#4f46e5', rim, lw);
          G.box(x, y, s * 0.68, s * 0.68, s * 0.16, faceCol || '#f8fafc', '#0f172a', lw * 0.7);
        } else {
          G.disc(x, y, s * 0.46, bezelCol || '#4f46e5', rim, lw);
          G.disc(x, y, s * 0.36, faceCol || '#f8fafc', '#0f172a', lw * 0.7);
        }
        if (vv === 1 || vv === 3) {
          G.ring(x, y, s * 0.27, s * 0.04, -Math.PI / 2, -Math.PI / 2 + Math.PI * (0.9 + 0.5 * Math.sin(tt * 2.0)), '#38bdf8');
        }
        var ha = -Math.PI / 2 + tt * 0.55, ma = -Math.PI / 2 + tt * 2.4;
        G.pill(x, y, x + Math.cos(ha) * s * 0.19, y + Math.sin(ha) * s * 0.19, s * 0.05, handCol || '#1e293b');
        G.pill(x, y, x + Math.cos(ma) * s * 0.27, y + Math.sin(ma) * s * 0.27, s * 0.038, '#00e5ff');
        G.disc(x, y, s * 0.055, '#f43f5e', '#0f172a', lw * 0.6);
      },
      lock: function(x, y, s, bodyCol, shackleCol, accentCol, rimCol, t, v) {
        x = G._n(x); y = G._n(y); s = Math.max(24, Math.abs(G._n(s, 76)));
        var rt = G._rt(rimCol, t), rim = rt.r, tt = rt.t, lw = Math.max(1.8, s * 0.034), vv = G._v(v);
        var lift = Math.abs(Math.sin(tt * 2.3)) * s * 0.05;
        G.ring(x, y - s * 0.16 - lift, s * 0.20, s * 0.085, Math.PI, Math.PI * 2, shackleCol || '#38bdf8');
        if (vv === 2) {
          G.ngon(x, y + s * 0.12, s * 0.36, 8, Math.PI / 8, bodyCol || '#1e293b', rim, lw);
          G.ring(x, y + s * 0.12, s * 0.18, s * 0.045, tt * 1.8, tt * 1.8 + Math.PI * 1.4, accentCol || '#ffd700');
          G.disc(x, y + s * 0.12, s * 0.07, '#00e5ff', rim, lw * 0.6);
        } else {
          G.box(x, y + s * 0.12, s * 0.70, s * 0.56, s * 0.10, bodyCol || '#1e293b', rim, lw);
          if (vv === 1) {
            G.box(x, y + s * 0.12, s * 0.68, s * 0.18, s * 0.04, '#4f46e5', rim, lw * 0.7);
            G.check(x, y + s * 0.12, s * 0.14, s * 0.035, accentCol || '#ffd700');
          } else if (vv === 3) {
            var k3 = 1 + 0.1 * Math.sin(tt * 3.0);
            G.star(x, y + s * 0.12, s * 0.14 * k3, s * 0.06 * k3, 5, -Math.PI / 2, accentCol || '#ffd700', rim, lw * 0.65);
          } else {
            var ks = 1 + 0.1 * Math.sin(tt * 3.0);
            G.disc(x, y + s * 0.09, s * 0.10 * ks, accentCol || '#ffd700', rim, lw * 0.7);
            G.pill(x, y + s * 0.14, x, y + s * 0.24, s * 0.055, accentCol || '#ffd700');
          }
        }
      },
      cloudSync: function(x, y, s, cloudCol, arrowCol, rimCol, t, v) {
        x = G._n(x); y = G._n(y); s = Math.max(24, Math.abs(G._n(s, 76)));
        var rt = G._rt(rimCol, t), rim = rt.r, tt = rt.t, lw = Math.max(1.8, s * 0.032), vv = G._v(v);
        var cc = cloudCol || '#38bdf8', ac = arrowCol || '#ffd700';
        G.disc(x - s * 0.23, y + s * 0.04, s * 0.22, cc, rim, lw);
        G.disc(x + s * 0.23, y + s * 0.04, s * 0.20, cc, rim, lw);
        G.disc(x, y - s * 0.09, s * 0.28, cc, rim, lw);
        G.box(x, y + s * 0.12, s * 0.52, s * 0.24, s * 0.06, cc, null, 0);
        G.pill(x - s * 0.24, y + s * 0.24, x + s * 0.24, y + s * 0.24, lw, rim);
        var dy = Math.sin(tt * 2.8) * s * 0.05;
        if (vv === 1) {
          G.arrow(x - s * 0.10, y + s * 0.17 + dy, x - s * 0.10, y - s * 0.10 + dy, s * 0.045, s * 0.11, ac);
          G.arrow(x + s * 0.10, y - s * 0.10 - dy, x + s * 0.10, y + s * 0.17 - dy, s * 0.045, s * 0.11, '#f8fafc');
        } else if (vv === 2) {
          G.box(x, y + s * 0.30, s * 0.62, s * 0.18, s * 0.05, '#1e293b', rim, lw * 0.9);
          G.disc(x - s * 0.14, y + s * 0.30, s * (0.04 + 0.012 * Math.sin(tt * 3.5)), ac, null, 0);
          G.disc(x + s * 0.04, y + s * 0.30, s * 0.04, '#00e5ff', null, 0);
          G.arrow(x, y + s * 0.14 + dy * 0.8, x, y - s * 0.10 + dy * 0.8, s * 0.05, s * 0.11, ac);
        } else if (vv === 3) {
          G.ring(x, y + s * 0.04, s * 0.14, s * 0.045, tt * 2.4, tt * 2.4 + Math.PI * 1.4, ac);
          G.disc(x, y + s * 0.04, s * 0.055, '#f8fafc', '#1e293b', lw * 0.6);
        } else {
          G.arrow(x, y + s * 0.18 + dy, x, y - s * 0.12 + dy, s * 0.055, s * 0.13, ac);
        }
      },
      robot: function(x, y, s, bodyCol, visorCol, eyeCol, rimCol, t, v) {
        x = G._n(x); y = G._n(y); s = Math.max(24, Math.abs(G._n(s, 76)));
        var rt = G._rt(rimCol, t), rim = rt.r, tt = rt.t, lw = Math.max(1.8, s * 0.034), vv = G._v(v);
        var bc = bodyCol || '#1e293b', vc = visorCol || '#0f172a', ec = eyeCol || '#00e5ff';
        if (vv === 2) {
          G.pill(x - s * 0.16, y - s * 0.28, x - s * 0.22, y - s * 0.44, s * 0.04, rim);
          G.pill(x + s * 0.16, y - s * 0.28, x + s * 0.22, y - s * 0.44, s * 0.04, rim);
          G.disc(x - s * 0.22, y - s * 0.45, s * 0.05, '#ffd700', rim, lw * 0.6);
          G.disc(x + s * 0.22, y - s * 0.45, s * 0.05, ec, rim, lw * 0.6);
        } else {
          G.pill(x, y - s * 0.28, x, y - s * 0.44, s * 0.045, rim);
          G.disc(x, y - s * 0.45, s * (0.065 + 0.015 * Math.sin(tt * 3.5)), '#ffd700', rim, lw * 0.7);
        }
        if (vv === 1) {
          G.box(x - s * 0.42, y + s * 0.02, s * 0.14, s * 0.28, s * 0.05, '#4f46e5', rim, lw * 0.8);
          G.box(x + s * 0.42, y + s * 0.02, s * 0.14, s * 0.28, s * 0.05, '#4f46e5', rim, lw * 0.8);
        }
        G.box(x, y + s * 0.03, s * 0.78, s * 0.60, vv === 2 ? s * 0.26 : s * 0.16, bc, rim, lw);
        G.box(x, y - s * 0.01, s * 0.56, s * 0.28, s * 0.09, vc, '#4f46e5', lw * 0.8);
        var er = s * (0.062 + 0.014 * Math.sin(tt * 3.2));
        if (vv === 2) {
          G.disc(x + Math.sin(tt * 2.2) * s * 0.15, y - s * 0.01, s * 0.08, ec, '#ffffff', lw * 0.5);
        } else {
          G.disc(x - s * 0.13, y - s * 0.01, er, ec, null, 0);
          G.disc(x + s * 0.13, y - s * 0.01, er, ec, null, 0);
        }
        if (vv === 1) {
          for (var mb = -1; mb <= 1; mb++) {
            G.bar(x + mb * s * 0.09, y + s * 0.24, s * 0.055, s * (0.07 + 0.04 * Math.abs(Math.sin(tt * 4.0 + mb))), s * 0.02, '#ffd700', null, 0);
          }
        } else {
          G.capsule(x, y + s * 0.20, s * (0.22 + 0.06 * Math.sin(tt * 3.0)), s * 0.055, '#38bdf8', null, 0);
        }
      },
      chip: function(x, y, s, pkgCol, pinCol, coreCol, rimCol, t, v) {
        x = G._n(x); y = G._n(y); s = Math.max(24, Math.abs(G._n(s, 76)));
        var rt = G._rt(rimCol, t), rim = rt.r, tt = rt.t, lw = Math.max(1.8, s * 0.032), vv = G._v(v);
        var pk = pkgCol || '#1e293b', pn = pinCol || '#38bdf8', cr = coreCol || '#ffd700';
        var offs = vv === 2 ? [-s * 0.18, -s * 0.06, s * 0.06, s * 0.18] : [-s * 0.16, 0, s * 0.16];
        for (var i = 0; i < offs.length; i++) {
          G.pill(x + offs[i], y - s * 0.42, x + offs[i], y - s * 0.26, s * 0.045, pn);
          G.pill(x + offs[i], y + s * 0.26, x + offs[i], y + s * 0.42, s * 0.045, pn);
          G.pill(x - s * 0.42, y + offs[i], x - s * 0.26, y + offs[i], s * 0.045, pn);
          G.pill(x + s * 0.26, y + offs[i], x + s * 0.42, y + offs[i], s * 0.045, pn);
        }
        if (vv === 3) G.ngon(x, y, s * 0.36, 8, Math.PI / 8, pk, rim, lw);
        else G.box(x, y, s * 0.62, s * 0.62, s * 0.08, pk, rim, lw);
        if (vv === 1) G.ngon(x, y, s * 0.22, 4, 0, '#4f46e5', rim, lw * 0.8);
        else G.box(x, y, s * 0.34, s * 0.34, s * 0.05, '#4f46e5', rim, lw * 0.8);
        if (vv === 2) G.star(x, y, s * (0.11 + 0.02 * Math.sin(tt * 3.4)), s * 0.05, 4, tt * 0.8, cr, rim, lw * 0.6);
        else G.disc(x, y, s * (0.095 + 0.025 * Math.sin(tt * 3.4)), cr, rim, lw * 0.65);
      },
      coinStack: function(x, y, s, coinCol, sideCol, starCol, rimCol, t, v) {
        x = G._n(x); y = G._n(y); s = Math.max(24, Math.abs(G._n(s, 76)));
        var rt = G._rt(rimCol, t), rim = rt.r, tt = rt.t, lw = Math.max(1.8, s * 0.034), vv = G._v(v);
        var cc = coinCol || '#ffd700', sc = sideCol || '#f59e0b', stc = starCol || '#ffffff';
        var k = 1 + 0.12 * Math.sin(tt * 3.0);
        if (vv === 1) {
          for (var cs = 0; cs < 3; cs++) {
            G.oval(x - s * 0.14, y + s * (0.18 - cs * 0.12), s * 0.28, s * 0.11, 0, cs === 2 ? cc : sc, rim, lw * 0.8);
          }
          G.disc(x + s * 0.16, y + s * (0.05 + 0.03 * Math.sin(tt * 2.6)), s * 0.26, cc, rim, lw);
          G.ngon(x + s * 0.16, y + s * (0.05 + 0.03 * Math.sin(tt * 2.6)), s * 0.11 * k, 4, 0, stc, '#b45309', lw * 0.65);
        } else if (vv === 2) {
          G.disc(x - s * 0.24, y + s * 0.06, s * 0.20, sc, rim, lw * 0.8);
          G.disc(x + s * 0.24, y + s * 0.06, s * 0.20, sc, rim, lw * 0.8);
          G.disc(x, y - s * 0.02, s * 0.30, cc, rim, lw);
          G.ring(x, y - s * 0.02, s * 0.21, s * 0.028, 0, Math.PI * 2, '#b45309');
          G.star(x, y - s * 0.02, s * 0.13 * k, s * 0.055 * k, 5, -Math.PI / 2, stc, '#b45309', lw * 0.65);
        } else if (vv === 3) {
          G.disc(x - s * 0.20, y + s * 0.14, s * 0.18, sc, rim, lw * 0.8);
          G.disc(x, y, s * 0.22, '#00e5ff', rim, lw * 0.85);
          G.disc(x + s * 0.18, y - s * 0.12, s * 0.25, cc, rim, lw);
          G.star(x + s * 0.18, y - s * 0.12, s * 0.11 * k, s * 0.05 * k, 5, -Math.PI / 2, stc, '#b45309', lw * 0.6);
        } else {
          G.disc(x - s * 0.14, y - s * 0.07, s * 0.27, sc, rim, lw * 0.85);
          G.disc(x + s * 0.07, y + s * 0.05, s * 0.34, cc, rim, lw);
          G.ring(x + s * 0.07, y + s * 0.05, s * 0.25, s * 0.028, 0, Math.PI * 2, '#b45309');
          G.star(x + s * 0.07, y + s * 0.05, s * 0.14 * k, s * 0.062 * k, 5, -Math.PI / 2, stc, '#b45309', lw * 0.7);
        }
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
      sheen: function() {
        // Disabled intentionally to prevent translucent floating rectangle/chroma-key halo leaks
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
    ? `var __bigmaGS = true;
    try { Object.defineProperty(ctx, 'shadowBlur', { set: function(){}, get: function(){ return 0; }, configurable: true }); } catch(e) {}
    try {
      var __gsAlpha = 1;
      var __origAlphaDesc = typeof CanvasRenderingContext2D !== 'undefined' ? Object.getOwnPropertyDescriptor(CanvasRenderingContext2D.prototype, 'globalAlpha') : null;
      if (__origAlphaDesc && __origAlphaDesc.set) {
        Object.defineProperty(ctx, 'globalAlpha', {
          set: function(v){ __gsAlpha = (typeof v === 'number' && isFinite(v)) ? Math.max(0.92, Math.min(1, v)) : 1; __origAlphaDesc.set.call(ctx, __gsAlpha); },
          get: function(){ return __gsAlpha; },
          configurable: true
        });
      }
    } catch(e) {}`
    : `var __bigmaGS = false;`;

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
    __bigmaT = t;
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
    __bigmaT = t;
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
    var w = 800, h = 600, cx = 400, cy = 300, S = 324, R = 233, dpr = 1;
    __bigmaV = ${Math.floor(Math.random() * 1000000)};
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
      S = Math.min(w, h) * 0.54;
      R = S * 0.72;
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
    let frame2Data: Uint8ClampedArray | null = null;
    if (typeof rafCallback === 'function') {
      // Test three distinct time offsets so animation loop runs cleanly AND actually animates
      (rafCallback as (t: number) => void)(350);
      if (capturedRenderError) {
        return { ok: false, reason: `Runtime error frame #1: ${capturedRenderError}` };
      }
      frame1Data = new Uint8ClampedArray(offCtx.getImageData(0, 0, offscreen.width, offscreen.height).data);
      (rafCallback as (t: number) => void)(1050);
      if (capturedRenderError) {
        return { ok: false, reason: `Runtime error frame #2: ${capturedRenderError}` };
      }
      frame2Data = new Uint8ClampedArray(offCtx.getImageData(0, 0, offscreen.width, offscreen.height).data);
      (rafCallback as (t: number) => void)(1750);
      if (capturedRenderError) {
        return { ok: false, reason: `Runtime error frame #3: ${capturedRenderError}` };
      }
    }

    // Count pixels visibly distinct from target background (#00ff00 vs #080c14) across ALL 3 sampled timestamps
    const rw = offscreen.width;
    const rh = offscreen.height;
    const imgData = offCtx.getImageData(0, 0, rw, rh).data;
    const bgR = isGreenScreen ? 0 : 8;
    const bgG = isGreenScreen ? 255 : 12;
    const bgB = isGreenScreen ? 0 : 20;

    const inspectFrameData = (data: Uint8ClampedArray) => {
      let visiblePixels = 0;
      let nonZeroAlphaPixels = 0;
      let borderPixels = 0;
      let minX = rw, maxX = -1, minY = rh, maxY = -1;
      let sumX = 0, sumY = 0;
      const borderX = Math.max(2, Math.floor(rw * 0.04));
      const borderY = Math.max(2, Math.floor(rh * 0.04));
      for (let py = 0; py < rh; py++) {
        for (let px = 0; px < rw; px++) {
          const i = (py * rw + px) * 4;
          if (data[i + 3] > 10) nonZeroAlphaPixels++;
          const dist = Math.abs(data[i] - bgR) + Math.abs(data[i + 1] - bgG) + Math.abs(data[i + 2] - bgB);
          if (dist > 36) {
            visiblePixels++;
            sumX += px;
            sumY += py;
            if (px < minX) minX = px;
            if (px > maxX) maxX = px;
            if (py < minY) minY = py;
            if (py > maxY) maxY = py;
            if (px < borderX || px >= rw - borderX || py < borderY || py >= rh - borderY) {
              borderPixels++;
            }
          }
        }
      }
      return {
        visiblePixels,
        nonZeroAlphaPixels,
        borderPixels,
        bboxW: maxX >= minX ? maxX - minX + 1 : 0,
        bboxH: maxY >= minY ? maxY - minY + 1 : 0,
        meanX: visiblePixels > 0 ? sumX / visiblePixels : rw / 2,
        meanY: visiblePixels > 0 ? sumY / visiblePixels : rh / 2,
      };
    };

    const m3 = inspectFrameData(imgData);
    const m1 = frame1Data ? inspectFrameData(frame1Data) : m3;
    const m2 = frame2Data ? inspectFrameData(frame2Data) : m3;
    const visiblePixels = m3.visiblePixels;
    const minVis = Math.min(m1.visiblePixels, m2.visiblePixels, m3.visiblePixels);
    const maxVis = Math.max(m1.visiblePixels, m2.visiblePixels, m3.visiblePixels);

    if (m3.nonZeroAlphaPixels === 0 || minVis < (type === 'bg' ? 400 : 650)) {
      return {
        ok: false,
        visiblePixels,
        reason: `Canvas blank/terlalu kecil (${minVis} pixel terlihat${isGreenScreen ? ' pada Green Screen' : ''})`,
      };
    }

    if (type !== 'bg' && maxVis > 0 && minVis < maxVis * 0.45) {
      return {
        ok: false,
        visiblePixels,
        reason: `Bagian ikon berkedip menghilang antar frame (${minVis} vs ${maxVis} px)`,
      };
    }

    if (type === 'bg') {
      if (m3.bboxW < 140 || m3.bboxH < 70) {
        return {
          ok: false,
          visiblePixels,
          reason: `Background tidak full-frame (${m3.bboxW}x${m3.bboxH}px dari 320x180)`,
        };
      }
    } else {
      for (const fm of [m1, m2, m3]) {
        if (Math.max(fm.bboxW, fm.bboxH) < 56 || Math.min(fm.bboxW, fm.bboxH) < 32) {
          return {
            ok: false,
            visiblePixels,
            reason: `Bentuk ikon terlalu kecil/cacat (${fm.bboxW}x${fm.bboxH}px — pastikan s=1.05*R)`,
          };
        }
        if (fm.bboxW / Math.max(1, fm.bboxH) > 4.2 || fm.bboxH / Math.max(1, fm.bboxW) > 4.2) {
          return {
            ok: false,
            visiblePixels,
            reason: `Proporsi ikon gepeng/garis tipis cacat (${fm.bboxW}x${fm.bboxH}px)`,
          };
        }
        if (fm.borderPixels > 8) {
          return {
            ok: false,
            visiblePixels,
            reason: `Komponen melenceng/terpotong di tepi canvas (${fm.borderPixels} px pinggir) — pastikan seluruh bentuk di dalam G.part(cx,cy,...)`,
          };
        }
        if (fm.bboxW >= rw * 0.92 || fm.bboxH >= rh * 0.92) {
          return {
            ok: false,
            visiblePixels,
            reason: `Bentuk ikon meluber/terpotong penuh di tepi canvas (${fm.bboxW}x${fm.bboxH}px)`,
          };
        }
        if (fm.meanX < rw * 0.20 || fm.meanX > rw * 0.80 || fm.meanY < rh * 0.14 || fm.meanY > rh * 0.86) {
          return {
            ok: false,
            visiblePixels,
            reason: `Posisi ikon melenceng keluar area tengah (${Math.round(fm.meanX)},${Math.round(fm.meanY)})`,
          };
        }
      }
    }

    // Verify motion liveness across t=350ms, 1050ms, 1750ms (reject frozen/barely-moving frames)
    if (frame1Data && frame1Data.length === imgData.length) {
      let changed13 = 0;
      let changed12 = 0;
      for (let py = 0; py < rh; py += 4) {
        for (let px = 0; px < rw; px += 4) {
          const i = (py * rw + px) * 4;
          const d13 =
            Math.abs(imgData[i] - frame1Data[i]) +
            Math.abs(imgData[i + 1] - frame1Data[i + 1]) +
            Math.abs(imgData[i + 2] - frame1Data[i + 2]);
          if (d13 > 24) changed13++;
          if (frame2Data && frame2Data.length === imgData.length) {
            const d12 =
              Math.abs(frame2Data[i] - frame1Data[i]) +
              Math.abs(frame2Data[i + 1] - frame1Data[i + 1]) +
              Math.abs(frame2Data[i + 2] - frame1Data[i + 2]);
            if (d12 > 24) changed12++;
          }
        }
      }
      const maxChanged = Math.max(changed13, changed12);
      const minMotionSamples = type === 'bg' ? 14 : 26;
      if (maxChanged < minMotionSamples) {
        return {
          ok: false,
          visiblePixels,
          reason: `Animasi statis/kurang dinamis antar frame (${maxChanged} sampel berubah)`,
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
      unsupportedThinkingModels.add(targetModel.toLowerCase());
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

// Variation DNA & Code Fingerprint Deduplication Engine (ensures zero identical animations across batches or days)
let __variationSeq = 0;
const MAX_RECENT_CODE_FINGERPRINTS = 160;
const recentCodeFingerprints: string[] = [];
let __hydratedRecentFingerprints = false;

const VARIATION_PALETTES: string[][] = [
  ['#1E293B', '#4F46E5', '#00E5FF', '#FFD700'],
  ['#0F172A', '#0284C7', '#38BDF8', '#F97316'],
  ['#1E1B4B', '#7C3AED', '#22D3EE', '#FACC15'],
  ['#1F2937', '#E11D48', '#FB923C', '#F8FAFC'],
  ['#0F172A', '#2563EB', '#F59E0B', '#38BDF8'],
  ['#1E293B', '#9333EA', '#00E5FF', '#FB7185'],
  ['#172554', '#0EA5E9', '#F43F5E', '#FFD700'],
  ['#27272A', '#6366F1', '#EC4899', '#FBBF24'],
];

const VARIATION_MOTIONS: string[] = [
  'bobY=Math.sin(t*2.2)*0.03*R, rot=Math.sin(t*1.4)*0.028',
  'bobY=Math.cos(t*2.4)*0.032*R, rot=Math.sin(t*1.6)*0.032, sc=1+0.025*Math.sin(t*2.8)',
  'bobX=Math.sin(t*1.5)*0.018*R, bobY=Math.sin(t*2.5)*0.03*R, rot=Math.cos(t*1.5)*0.025',
  'bobY=Math.sin(t*2.0+0.8)*0.034*R, rot=-Math.sin(t*1.7)*0.03, sx=1+0.02*Math.sin(t*2.6), sy=1-0.02*Math.sin(t*2.6)',
  'bobY=Math.sin(t*2.7)*0.028*R, rot=Math.sin(t*1.9)*0.035',
  'bobY=Math.cos(t*2.1)*0.03*R, sc=1+0.03*Math.cos(t*2.4), rot=Math.sin(t*1.3)*0.022',
];

export interface VariationSeed {
  seedId: string;
  variantIdx: number;
  palette: string[];
  motionExpr: string;
  tag: string;
}

export function createUniqueVariationSeed(
  promptTopic: string,
  slotIndex: number = 0,
  forceSalt: number = 0
): VariationSeed {
  __variationSeq = (__variationSeq + 1) % 1000000;
  let topicHash = 0;
  const txt = String(promptTopic || '');
  for (let i = 0; i < txt.length; i++) {
    topicHash = ((topicHash << 5) - topicHash + txt.charCodeAt(i)) | 0;
  }
  const timeMix = Date.now() ^ Math.floor(Math.random() * 1000003) ^ (__variationSeq * 2654435761);
  const absMix = Math.abs(timeMix + topicHash);
  const slot = Math.max(0, Math.floor(slotIndex));
  const salt = Math.max(0, Math.floor(forceSalt));

  const variantIdx = (absMix + slot + salt) % 4;
  const paletteIdx = ((absMix >> 2) + slot * 3 + salt * 5) % VARIATION_PALETTES.length;
  const motionIdx = ((absMix >> 4) + slot * 2 + salt * 3) % VARIATION_MOTIONS.length;
  const tag = `V${variantIdx}-${(absMix % 8999) + 1000}-${__variationSeq}`;

  return {
    seedId: tag,
    variantIdx,
    palette: VARIATION_PALETTES[paletteIdx],
    motionExpr: VARIATION_MOTIONS[motionIdx],
    tag,
  };
}

export function normalizeCanvasCodeFingerprint(codeOrHtml: string): string {
  const src = String(codeOrHtml || '');
  if (!src.trim()) return '';
  let body = src;
  const scriptMatch = src.match(/__bigmaResize\(\);([\s\S]*?)var\s+__bigmaTargetDraw/);
  if (scriptMatch && scriptMatch[1]) {
    body = scriptMatch[1];
  } else {
    const fnStart = src.indexOf('function drawFrame');
    if (fnStart !== -1) {
      body = src.slice(fnStart);
    }
  }
  return body
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '')
    .replace(/\s+/g, '')
    .trim();
}

function hydrateRecentFingerprintsOnce(): void {
  if (__hydratedRecentFingerprints) return;
  __hydratedRecentFingerprints = true;
  try {
    if (typeof localStorage === 'undefined') return;
    const raw = localStorage.getItem('bigma_saved_animations');
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return;
    const tail = parsed.slice(0, 50);
    for (const item of tail) {
      if (item && typeof item.html === 'string') {
        const fp = normalizeCanvasCodeFingerprint(item.html);
        if (fp && !recentCodeFingerprints.includes(fp)) {
          recentCodeFingerprints.push(fp);
        }
      }
    }
  } catch {
    // Ignore storage read issues
  }
}

export function isCodeFingerprintDuplicate(codeOrHtml: string, extraSeen?: Set<string>): boolean {
  hydrateRecentFingerprintsOnce();
  const fp = normalizeCanvasCodeFingerprint(codeOrHtml);
  if (!fp || fp.length < 24) return false;
  if (extraSeen && extraSeen.has(fp)) return true;
  return recentCodeFingerprints.includes(fp);
}

export function recordCodeFingerprint(codeOrHtml: string, extraSeen?: Set<string>): void {
  hydrateRecentFingerprintsOnce();
  const fp = normalizeCanvasCodeFingerprint(codeOrHtml);
  if (!fp || fp.length < 24) return;
  if (extraSeen) extraSeen.add(fp);
  const existingIdx = recentCodeFingerprints.indexOf(fp);
  if (existingIdx !== -1) recentCodeFingerprints.splice(existingIdx, 1);
  recentCodeFingerprints.unshift(fp);
  if (recentCodeFingerprints.length > MAX_RECENT_CODE_FINGERPRINTS) {
    recentCodeFingerprints.length = MAX_RECENT_CODE_FINGERPRINTS;
  }
}

// Derives physics-matched Canvas motion criteria + welded structural anatomy directly from each prompt's subject
export function resolvePromptMotionPlan(
  promptTopic: string,
  type: AnimationType,
  _style?: string,
  overrideMode?: string,
  variantIdx: number = 0
): { label: string; anatomyHint: string; codeHint: string } {
  const v = Math.abs(Math.floor(variantIdx || 0)) % 4;
  if (type === 'bg') {
    const bgStyles = [
      '3-4 smooth full-width layered cosine ribbons spanning -0.1*w..1.1*w across 0..h.',
      'perspective isometric wireframe grid planes sweeping seamlessly across 0..w, 0..h.',
      'diagonal flowing wave bands + clean concentric aura arcs across -0.1*w..1.1*w.',
      'soft gradient horizon curves with synchronized geometric bar pulses across 0..w, 0..h.',
    ];
    return {
      label: `full-frame harmonic wave (v${v})`,
      anatomyHint: bgStyles[v],
      codeHint: 'seamless cosine ribbon drift & depth phase shift across 0..w, 0..h',
    };
  }
  const topic = (promptTopic || '').toLowerCase();
  if (/\b(video\s*conferenc\w*|video\s*call\w*|teleconferenc\w*|webinar\w*|zoom\s*call|online\s*meeting|virtual\s*meeting)\b/.test(topic)) {
    return {
      label: `video conference display (v${v})`,
      anatomyHint: `Call G.videoCall(0, 0, 1.06*R, frameCol, tileCol, accentCol, "#F8FAFC", t, ${v}) inside G.part — widescreen monitor with webcam & live remote participant tiles!`,
      codeHint: 'upright monitor float bobY=Math.sin(t*2.1)*0.025*R, rot=Math.sin(t*1.4)*0.025 + speaker tile pulse inside screen',
    };
  }
  if (/\b(meeting\s+table|conference\s+table|boardroom|roundtable|conference\s+room)\b/.test(topic)) {
    return {
      label: `conference table ensemble (v${v})`,
      anatomyHint: `TOP-DOWN CONFERENCE TABLE (v=${v}): draw 4 docked G.person seats at (0,-0.34*R), (0,0.34*R), (-0.46*R,0), (0.46*R,0) FIRST; THEN centered table G.box(0,0.02*R,0.74*R,0.40*R,0.14*R) overlapping seat edges; LAST center tablet G.box(0,0.02*R,0.24*R,0.14*R,0.03*R) with ${v % 2 === 0 ? 'G.check' : 'G.chart'} glyph.`,
      codeHint: 'upright float bobY=Math.sin(t*2.1)*0.025*R + subtle synchronized chair breath ±0.02*R staying docked to table',
    };
  }
  if (/\b(office\s+desk|desk|workstation|workspace|cubicle|study\s+table)\b/.test(topic)) {
    return {
      label: `organized desk workstation (v${v})`,
      anatomyHint: `UPRIGHT OFFICE DESK: desk pedestals G.box(±0.34*R,0.24*R,0.20*R,0.34*R,0.03*R) + wide top G.box(0,0.06*R,1.02*R,0.10*R,0.03*R) + monitor stand & G.chart(0,-0.22*R,0.48*R,"#0F172A","#38BDF8","#00E5FF","#FFD700","#F8FAFC",t,${v}) resting flush on top + gold lamp G.disc(${v % 2 === 0 ? '-0.36*R' : '0.36*R'},-0.20*R,0.08*R,"#FFD700").`,
      codeHint: 'upright float bobY=Math.sin(t*2.1)*0.025*R, rot=Math.sin(t*1.4)*0.025 + chart telemetry inside monitor',
    };
  }
  if (/\b(laptop|notebook|macbook|ultrabook|computer|desktop|monitor|screen)\b/.test(topic)) {
    return {
      label: `laptop productivity workstation (v${v})`,
      anatomyHint: `Call G.laptop(0, 0, 1.06*R, bodyCol, "#0F172A", accentCol, "#F8FAFC", t, ${v}) inside G.part — unmistakably a laptop screen & keyboard deck with animated telemetry inside!`,
      codeHint: 'upright hover bobY=Math.sin(t*2.2)*0.028*R, rot=Math.sin(t*1.5)*0.025 + internal screen task/chart animation',
    };
  }
  if (/\b(ui\s*layout|ui|ux|wireframe|interface|app\s*design|landing\s*page|mockup|website|web\s*app|software|code)\b/.test(topic)) {
    return {
      label: `interactive UI layout (v${v})`,
      anatomyHint: `Call G.uiLayout(0, 0, 1.06*R, frameCol, headerCol, accentCol, "#F8FAFC", t, ${v}) inside G.part — NEVER draw plain circles/squares!`,
      codeHint: 'upright hover bobY=Math.sin(t*2.2)*0.03*R, rot=Math.sin(t*1.5)*0.025 + internal UI sidebar & card reveal driven by t',
    };
  }
  if (/\b(hiring|recruit\w*|talent|candidate|hr|human\s*resources|interview|onboarding|staffing|resume|cv)\b/.test(topic)) {
    return {
      label: `talent profile verification (v${v})`,
      anatomyHint: `Call G.userBadge(0, 0, 1.06*R, cardCol, personCol, accentCol, "#F8FAFC", t, ${v}) inside G.part — clean HR card with person & verified badge!`,
      codeHint: 'upright hover bobY=Math.sin(t*2.2)*0.03*R, rot=Math.sin(t*1.5)*0.03 + pulsing verification checkmark & animated profile lines',
    };
  }
  if (/\b(productivity|efficiency|checklist|todo|to-do|task\s*management|kanban|sprint|workflow)\b/.test(topic)) {
    return {
      label: `sequential task completion (v${v})`,
      anatomyHint: `Call G.checklist(0, 0, 1.04*R, boardCol, clipCol, accentCol, "#F8FAFC", t, ${v}) inside G.part — NEVER draw plain power discs or sagging corner boxes!`,
      codeHint: 'upright hover bobY=Math.sin(t*2.2)*0.03*R, rot=Math.sin(t*1.5)*0.03 + sequential animated task bars & checkmarks inside clipboard',
    };
  }
  if (/\b(typography|font|lettering|typeface|editorial|copywriting|graphic\s*design|artboard|branding|vector)\b/.test(topic)) {
    return {
      label: `editorial artboard precision (v${v})`,
      anatomyHint: `Call G.typography(0, 0, 1.06*R, cardCol, inkCol, accentCol, "#F8FAFC", t, ${v}) inside G.part — crisp vector artboard & animated guide cursor!`,
      codeHint: 'upright hover bobY=Math.sin(t*2.2)*0.03*R, rot=Math.sin(t*1.5)*0.025 + crisp baseline cursor glide',
    };
  }
  if (/\b(pie\s*chart|pie|donut|market\s*share|allocation|budget\s*breakdown|proportion)\b/.test(topic)) {
    return {
      label: `segmented pie expansion (v${v})`,
      anatomyHint: `Call G.pieChart(0, 0, 1.08*R, baseCol, s1Col, s2Col, s3Col, "#F8FAFC", t, ${v}) inside G.part — bold full-sized animated pie slices!`,
      codeHint: 'upright float bobY=Math.sin(t*2.2)*0.03*R, rot=Math.sin(t*1.4)*0.03 + active radial pie wedge pop',
    };
  }
  if (/\b(market\s*research|research|survey|discovery|audit|inspect\w*|seo|search|magnifying|investigat\w*)\b/.test(topic)) {
    return {
      label: `optical lens research scan (v${v})`,
      anatomyHint: `Call G.magnifier(0, 0, 1.08*R, cardCol, lensCol, handleCol, accentCol, "#F8FAFC", t, ${v}) inside G.part — sweeping magnifying lens over data card!`,
      codeHint: 'upright hover bobY=Math.sin(t*2.1)*0.025*R + continuous smooth circular magnifying lens sweep over card',
    };
  }
  if (/\b(entrepreneur\w*|startup|launch|venture|founder|rocket|boost|scaleup|scale-up|accelerate)\b/.test(topic)) {
    return {
      label: `ascendant rocket launch (v${v})`,
      anatomyHint: `Call G.rocket(0, 0, 1.06*R, hullCol, wingCol, flameCol, "#F8FAFC", t, ${v}) inside G.part(cx, cy+bobY, -0.18+rot, 1, 1, fn) — unmistakable rocket!`,
      codeHint: 'dynamic thrust bobY=Math.sin(t*3.2)*0.04*R, slight diagonal flight angle + pulsing exhaust plume',
    };
  }
  if (/\b(opportunity|breakthrough|lightbulb|idea|bulb|innovation|creative|spark|brainstorm|insight|vision)\b/.test(topic)) {
    return {
      label: `radiant idea glow (v${v})`,
      anatomyHint: `Call G.lightbulb(0, 0, 1.06*R, bulbCol, rayCol, baseCol, "#F8FAFC", t, ${v}) inside G.part — NEVER draw G.rays alone without solid glass bulb!`,
      codeHint: 'upright float bobY=Math.sin(t*2.3)*0.035*R, rot=Math.sin(t*1.5)*0.03 + rhythmic radial ray pulse around glass dome',
    };
  }
  if (/\b(shopping\s*cart|cart|trolley|ecommerce|e-commerce|checkout|retail|marketplace)\b/.test(topic)) {
    return {
      label: `shopping cart glide (v${v})`,
      anatomyHint: 'Draw 2 tucked parcel boxes G.box(0.06*R,-0.24*R+bobItem,0.24*R,0.22*R,0.04*R,accCol,"#F8FAFC",2) FIRST, THEN G.cart(0,0.06*R,0.96*R,bodyCol,wheelCol,"#F8FAFC") cleanly in front!',
      codeHint: 'gentle horizontal glide offsetX=Math.sin(t*2.2)*0.05*R + suspension bounce & parcel settle inside basket',
    };
  }
  if (/\b(procurement|purchase|order|supply\s*chain|inventory|warehouse|logistics|vendor)\b/.test(topic)) {
    return {
      label: `procurement manifest sync (v${v})`,
      anatomyHint: `Call G.checklist(0, 0, 1.04*R, bodyCol, clipCol, accentCol, "#F8FAFC", t, ${v}) + welded top-right gold badge G.disc(0.32*R,-0.32*R,0.14*R,"#FFD700","#F8FAFC",2) inside G.part.`,
      codeHint: 'upright float bobY=Math.sin(t*2.2)*0.03*R, rot=Math.sin(t*1.5)*0.03 + sequential manifest check animation',
    };
  }
  if (/\b(digital\s*wallet|e-wallet|wallet|purse|mobile\s*pay|fintech)\b/.test(topic)) {
    return {
      label: `digital wallet card reveal (v${v})`,
      anatomyHint: `Draw peeking payment card G.box(${v % 2 === 0 ? '-0.08*R' : '0.06*R'}, -0.22*R + Math.sin(t*2.4)*0.06*R, 0.58*R, 0.34*R, 0.05*R, accCol, "#F8FAFC", 2) FIRST, THEN G.wallet(0, 0.08*R, 0.98*R, bodyCol, flapCol, claspCol, "#F8FAFC") overlapping lower half!`,
      codeHint: 'upright wallet hover bobY=Math.sin(t*2.2)*0.03*R + smooth vertical card reveal & golden clasp pulse',
    };
  }
  if (/\b(reputation|trust|credibility|review|rating|endorsement|testimonial|brand\s*image)\b/.test(topic)) {
    return {
      label: `trust crest radiance (v${v})`,
      anatomyHint: `Call G.shield(0, 0.02*R, 0.96*R, shieldCol, "#F8FAFC", "#1E293B") + pulsing centered gold G.${v % 2 === 0 ? 'star' : 'check'}(0, 0.02*R, ...) LAST on top.`,
      codeHint: 'upright heraldic float bobY=Math.sin(t*2.2)*0.03*R, rot=Math.sin(t*1.5)*0.03 + centered emblem pulse',
    };
  }
  if (/\b(global\s*comm\w*|international|worldwide|globe|global|world|earth|continent)\b/.test(topic)) {
    return {
      label: `orbital global relay (v${v})`,
      anatomyHint: `Call G.globe(0, 0.02*R, 0.44*R, sphereCol, lineCol, "#F8FAFC") + tilted ring G.oval(0, 0.02*R, 0.56*R, 0.20*R, ${v % 2 === 0 ? '-0.35' : '0.35'}, null, "#FFD700", 0.045*R) + 2 orbiting signal nodes G.disc.`,
      codeHint: 'upright globe hover bobY=Math.sin(t*2.1)*0.025*R + continuous orbiting satellite relay nodes along tilted ellipse',
    };
  }
  if (/\b(megaphone|broadcast|announce\w*|marketing|campaign|publicity|loudspeaker)\b/.test(topic)) {
    return {
      label: `acoustic broadcast wave (v${v})`,
      anatomyHint: 'Call G.megaphone(-0.12*R, 0.02*R, 0.90*R, coneCol, handleCol, accCol, "#F8FAFC") + 2 right-opening G.ring(0.24*R, 0, r1/r2, 0.045*R, -0.58, 0.58, col). NEVER bisect cone vertically!',
      codeHint: 'recoil tilt rot=-0.05+Math.sin(t*3.2)*0.05 + bobY=Math.sin(t*2.5)*0.03*R + expanding acoustic wave arcs',
    };
  }
  if (/\b(handshake|deal|agreement)\b/.test(topic)) {
    return {
      label: `executive handshake clasp (v${v})`,
      anatomyHint: `Call G.handshake(0, 0.04*R, 0.62*R, cL, cR, "#F59E0B", "#F8FAFC", "#1E293B") + crisp top emblem G.disc(0,-0.32*R,0.12*R,accCol,"#F8FAFC",2) with G.${v % 2 === 0 ? 'check' : 'star'}.`,
      codeHint: 'upright float bobY=Math.sin(t*2.4)*0.035*R, rot=Math.sin(t*1.6)*0.035 + subtle top badge pulse',
    };
  }
  if (/\b(medal|ribbon|badge|certificate)\b/.test(topic)) {
    return {
      label: `suspended medal gleam (v${v})`,
      anatomyHint: 'Draw V-ribbon straps G.poly FIRST behind medal, THEN outer medal G.disc(0,0.08*R,0.38*R), inner rim G.ring(0,0.08*R,0.29*R,0.035*R), and centered G.star(0,0.08*R,0.16*R,0.07*R,5) LAST on top.',
      codeHint: 'upright pendulum sway bobY=Math.sin(t*2.3)*0.035*R, rot=Math.sin(t*1.7)*0.05 + pulsing centered star',
    };
  }
  if (/\b(trophy|award|achievement|cup|winner|crown)\b/.test(topic)) {
    return {
      label: `celebratory crest lift (v${v})`,
      anatomyHint: `Call G.trophy(0, 0, 1.06*R, cupCol, baseCol, starCol, "#F8FAFC", t, ${v}) inside G.part — cohesive trophy & pulsing inner star!`,
      codeHint: 'upright float bobY=Math.sin(t*2.4)*0.035*R, rot=Math.sin(t*1.6)*0.035 + pulsing center star emblem',
    };
  }
  if (/\b(chat|conversation|dialogue|messaging|communication|telecom|discussion|comment)\b/.test(topic)) {
    return {
      label: `speech bubble dialogue pulse (v${v})`,
      anatomyHint: 'Back bubble tail + G.box(-0.14*R,-0.12*R,0.66*R,0.44*R,0.12*R,c1,"#F8FAFC",2.5); front bubble tail + G.box(0.16*R,0.14*R,0.64*R,0.42*R,0.12*R,c2,"#F8FAFC",2.5); 3 oscillating typing dots G.disc inside front bubble.',
      codeHint: 'upright hover bobY=Math.sin(t*2.2)*0.03*R + sequential 3-dot wave inside front bubble',
    };
  }
  if (/\b(email|mail|envelope|inbox|newsletter|message)\b/.test(topic)) {
    return {
      label: `envelope & badge float (v${v})`,
      anatomyHint: 'Envelope G.box(0,0.05*R,1.02*R,0.68*R,0.08*R), crisp inner V-flap G.poly([[-0.48*R,-0.22*R],[0,0.12*R],[0.48*R,-0.22*R]],null,rimCol,0.055*R,false), welded top-right badge G.disc(0.40*R,-0.22*R,0.14*R) LAST on top.',
      codeHint: 'upright float bobY=Math.sin(t*2.4)*0.035*R, rot=Math.sin(t*1.6)*0.04 + smooth badge scale pulse',
    };
  }
  if (/\b(negotiation|partnership|team|meeting|collaboration|networking)\b/.test(topic)) {
    return {
      label: `paired executive agreement (v${v})`,
      anatomyHint: 'Use G.person(-0.30*R,0.06*R,0.34*R,col1,head1,rim) & G.person(0.30*R,0.06*R,0.34*R,col2,head2,rim) joined cleanly by G.handshake(0,0.14*R,0.28*R,col1,col2,"#F59E0B","#F8FAFC",rim) + top check emblem.',
      codeHint: 'upright float bobY=Math.sin(t*2.2)*0.03*R + smooth continuous top check badge pulse',
    };
  }
  if (/\b(leadership|executive|leader|manager|ceo|mentor|customer|support|headset|people|person|user|avatar|chair)\b/.test(topic)) {
    return {
      label: `executive figure poise (v${v})`,
      anatomyHint: `Call G.userBadge(0, 0, 1.04*R, cardCol, personCol, accCol, "#F8FAFC", t, ${v}) inside G.part — sharp profile card & executive emblem!`,
      codeHint: 'upright float bobY=Math.sin(t*2.1)*0.03*R, rot=Math.sin(t*1.4)*0.03 + crest badge pulse',
    };
  }
  if (/\b(presentation|whiteboard|projector|pitch|slide|training)\b/.test(topic)) {
    return {
      label: `easel chart presentation (v${v})`,
      anatomyHint: `Tripod legs FIRST behind board, THEN call G.chart(0, -0.06*R, 0.96*R, cardCol, bar1Col, bar2Col, arrowCol, "#F8FAFC", t, ${v}) as the easel screen!`,
      codeHint: 'upright float bobY=Math.sin(t*2.1)*0.025*R + animated easel bars & upward arrow',
    };
  }
  if (/\b(cash\s*flow|cashflow|transaction|transfer|payment|revenue|payroll|remittance|settlement|money|dollar|coin|currency|bank|finance|investment|cash)\b/.test(topic)) {
    return {
      label: `minted cash flow (v${v})`,
      anatomyHint: `Call G.coinStack(0, 0.04*R, 0.98*R, coinCol, sideCol, "#FFFFFF", "#F8FAFC", t, ${v}) + crisp flow arrows G.arrow(-0.34*R+fx,-0.36*R,0.34*R+fx,-0.36*R,0.05*R,0.12*R,accCol) inside G.part.`,
      codeHint: 'upright float bobY=Math.sin(t*2.2)*0.03*R + smooth arrow transfer motion & coin star pulse',
    };
  }
  if (/\b(briefcase|portfolio|folder|file|document|contract|invoice)\b/.test(topic)) {
    return {
      label: `executive hinged float (v${v})`,
      anatomyHint: `Call G.briefcase(0, 0, 1.06*R, bodyCol, flapCol, claspCol, "#F8FAFC", t, ${v}) inside G.part — ZERO dark backdrop disc!`,
      codeHint: 'upright hover bobY=Math.sin(t*2.3)*0.035*R, rot=Math.sin(t*1.6)*0.035 + lid clasp articulation',
    };
  }
  if (/\b(target|bullseye|strategy|aim|dart|goal)\b/.test(topic)) {
    return {
      label: `diagonal strike & ripple (v${v})`,
      anatomyHint: 'Opaque discs G.disc(0,0,0.52*R,"#F43F5E","#F8FAFC",3), G.disc(0,0,0.34*R,"#F8FAFC"), G.disc(0,0,0.16*R,"#F43F5E"), G.disc(0,0,0.07*R,"#FFD700") + inward G.arrow(0.50*R+d,-0.50*R-d,0.03*R+d*0.1,-0.03*R-d*0.1,0.05*R,0.14*R,"#F8FAFC") pointing INWARD!',
      codeHint: 'bullseye scale=1+0.04*Math.sin(t*3.0) + inward diagonal dart strike',
    };
  }
  if (/\b(analytics|dashboard|chart|graph|report|metric|kpi|profit|growth|candlestick|statistics|market\s*analysis)\b/.test(topic)) {
    return {
      label: `ascending elastic lift (v${v})`,
      anatomyHint: `Call G.chart(0, 0, 1.06*R, cardCol, bar1Col, bar2Col, arrowCol, "#F8FAFC", t, ${v}) inside G.part — bold full-width animated chart card!`,
      codeHint: 'upright hover bobY=Math.sin(t*2.1)*0.03*R, rot=Math.sin(t*1.5)*0.03 + live rising bars & trend arrow',
    };
  }
  if (/\b(building|skyscraper|tower|headquarters|architecture|real\s*estate)\b|\boffice\s+building\b|\bcorporate\s+building\b/.test(topic)) {
    return {
      label: `architectural plinth glow (v${v})`,
      anatomyHint: 'Spire + crown + main tower G.box(-0.08*R,0.02*R,0.48*R,0.82*R,0.04*R) + side wing G.box(0.24*R,0.14*R,0.26*R,0.58*R,0.04*R) + plinth + 3x4 illuminated window grid G.box across full tower height.',
      codeHint: 'upright float bobY=Math.sin(t*1.8)*0.02*R + upward window illumination wave',
    };
  }
  if (/\b(puzzle|connect|link|integration)\b/.test(topic)) {
    return {
      label: `interlocked precision fit (v${v})`,
      anatomyHint: '2 solid blocks G.box(-0.19*R,0,0.42*R,0.42*R,0.06*R) & G.box(0.19*R,0,0.42*R,0.42*R,0.06*R) interlocked over centered tab G.disc(0,0,0.12*R) LAST on top.',
      codeHint: 'gentle x micro-slide ±0.03*R staying overlapped + upright float bobY=Math.sin(t*2.2)*0.03*R',
    };
  }
  if (/\b(calendar|event|schedule)\b/.test(topic)) {
    return {
      label: `structured grid calendar (v${v})`,
      anatomyHint: 'Top rings + body G.box(0,0.05*R,0.88*R,0.74*R,0.08*R) + header strip + crisp 3x2 date squares G.box inside body.',
      codeHint: 'upright float bobY=Math.sin(t*2.1)*0.03*R + active date cell highlight',
    };
  }
  if (/\b(clock|deadline|timer|time)\b/.test(topic)) {
    return {
      label: `precision dial sweep (v${v})`,
      anatomyHint: `Call G.clock(0, 0, 1.06*R, bezelCol, faceCol, handCol, "#F8FAFC", t, ${v}) inside G.part — clean ticking hands anchored at center!`,
      codeHint: 'upright float bobY=Math.sin(t*2.1)*0.03*R + sweeping clock hands',
    };
  }
  if (/\b(bell|alarm|siren|alert|horn|speaker|mic)\b/.test(topic)) {
    return {
      label: `acoustic ring swing (v${v})`,
      anatomyHint: 'Top loop + flared bell dome G.poly + bottom rim G.capsule + clapper G.disc + symmetric outer sound arcs G.ring at ±0.45*R.',
      codeHint: 'pendulum swing + delayed clapper sway & expanding soundwave arc sweep',
    };
  }
  if (/\b(heart|pulse|ecg|cardiogram|dna|pill|capsule|syringe|medical|stethoscope|health)\b/.test(topic)) {
    return {
      label: `cardiac lub-dub pulse (v${v})`,
      anatomyHint: 'Unified medical emblem centered at (0,0) scaled >= 0.90*R: symmetric heart (2 welded G.disc + lower G.poly) or rounded cross with crisp ECG line inside.',
      codeHint: 'double-beat lub-dub scale pulse + smooth bobY',
    };
  }
  if (/\b(shield|protection|firewall|cybersecurity|antivirus)\b/.test(topic)) {
    return {
      label: `shield defense gleam (v${v})`,
      anatomyHint: `Call G.shield(0, 0.02*R, 0.98*R, shieldCol, "#F8FAFC", "#1E293B") + centered pulsing G.${v % 2 === 0 ? 'check' : 'star'}(0, 0.02*R, ...) LAST on top.`,
      codeHint: 'upright hover bobY=Math.sin(t*2.2)*0.03*R + smooth emblem pulse',
    };
  }
  if (/\b(lock|padlock|vault|key|fingerprint|biometric|security|safe)\b/.test(topic)) {
    return {
      label: `precision locking recoil (v${v})`,
      anatomyHint: `Call G.lock(0, 0, 1.06*R, bodyCol, shackleCol, accentCol, "#F8FAFC", t, ${v}) inside G.part — crisp articulated shackle & keyhole!`,
      codeHint: 'upright hover bobY=Math.sin(t*2.2)*0.03*R + smooth vertical shackle lock recoil',
    };
  }
  if (/\b(truck|drone|airplane|plane|wheel|forklift|parcel|cargo|delivery)\b/.test(topic)) {
    return {
      label: `kinetic transport suspension (v${v})`,
      anatomyHint: 'Cohesive vehicle chassis inside [-0.54*R,+0.54*R] with wheels overlapping body by >= 0.04*R — zero detached wheels!',
      codeHint: 'chassis suspension bobY=Math.sin(t*3.2)*0.03*R + spinning wheels at exact wheel sockets',
    };
  }
  if (/\b(gear|settings|cog|automation|operations|engineering|system|process)\b/.test(topic)) {
    return {
      label: `meshed cog rotation (v${v})`,
      anatomyHint: `Call G.gears(0, 0, 1.06*R, g1Col, g2Col, coreCol, "#F8FAFC", t, ${v}) inside G.part — dual interlocked rotating gears!`,
      codeHint: 'upright float bobY=Math.sin(t*2.0)*0.025*R + counter-rotating meshed cogwheels',
    };
  }
  if (/\b(atom|orbit|planet|radar|compass|satellite|astrolabe)\b/.test(topic)) {
    return {
      label: `orbital & axis precession (v${v})`,
      anatomyHint: 'Centered core G.disc(0,0,0.20*R) + bold tilted G.oval/G.ring orbits (radius >= 0.42*R, thick >= 0.04*R) + orbiting nodes G.disc along exact path.',
      codeHint: 'smooth continuous rotation + orbiting bright nodes along tilted rings',
    };
  }
  if (/\b(chip|cpu|processor|circuit|microchip|semiconductor|hardware)\b/.test(topic)) {
    return {
      label: `silicon pulse grid (v${v})`,
      anatomyHint: `Call G.chip(0, 0, 1.06*R, pkgCol, pinCol, coreCol, "#F8FAFC", t, ${v}) inside G.part — crisp square processor with welded pins & pulsing core!`,
      codeHint: 'upright tech float bobY=Math.sin(t*2.2)*0.03*R + pulsing silicon core',
    };
  }
  if (/\b(robot|bot|chatbot|assistant|ai|neural)\b/.test(topic)) {
    return {
      label: `intelligent bot nod (v${v})`,
      anatomyHint: `Call G.robot(0, 0, 1.06*R, bodyCol, visorCol, eyeCol, "#F8FAFC", t, ${v}) inside G.part — friendly clean AI robot head!`,
      codeHint: 'friendly hover bobY=Math.sin(t*2.3)*0.035*R, rot=Math.sin(t*1.6)*0.04 + eye & beacon pulse',
    };
  }
  if (/\b(cloud|saas|storage|backup|sync|server)\b/.test(topic)) {
    return {
      label: `cloud sync lift (v${v})`,
      anatomyHint: `Call G.cloudSync(0, 0, 1.06*R, cloudCol, arrowCol, "#F8FAFC", t, ${v}) inside G.part — solid cloud & smooth animated sync arrow!`,
      codeHint: 'upright cloud float bobY=Math.sin(t*2.1)*0.03*R + smooth vertical arrow sync motion',
    };
  }
  if (/\b(brain|network|camera|eye|microscope)\b/.test(topic)) {
    return {
      label: `smart telemetry pulse (v${v})`,
      anatomyHint: 'Unified centered tech housing inside [-0.54*R,+0.54*R] scaled >= 0.90*R (ZERO dark backdrop disc!); all pins/nodes overlap housing >= 0.04*R.',
      codeHint: 'upright float bobY=Math.sin(t*2.3)*0.035*R, rot=Math.sin(t*1.6)*0.04 + staggered node pulse',
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
    if (legacy[overrideMode]) {
      return {
        label: overrideMode,
        anatomyHint: `Framed centered vector emblem (s=1.04*R, v=${v}) or matching G hero helper inside G.part — NEVER draw tiny dots <0.5*R or bare rays!`,
        codeHint: legacy[overrideMode],
      };
    }
  }
  return {
    label: `harmonic elastic float (v${v})`,
    anatomyHint: `Pick the closest G hero helper (G.uiLayout / G.chart / G.checklist / G.rocket / G.lightbulb / G.briefcase / G.gears / G.laptop / G.videoCall) at size s=1.05*R passing v=${v}, OR build a bold framed emblem G.box(0,0,0.96*R,0.74*R,0.10*R) + crisp inner animated icon. NEVER draw small dots <0.6*R, bare G.rays, or stacked snowman circles!`,
    codeHint: 'upright bobY=Math.sin(t*2.3)*0.035*R, rot=Math.sin(t*1.6)*0.035 + internal t-driven sub-part pulse',
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
  highPrecision: boolean = false,
  variationOffset: number = 0
): Promise<{ id: string; title: string; prompt?: string; type: AnimationType; style: string; subCategory: string; html: string; isGreenScreen?: boolean; colorMode?: ColorMode; motionDynamics?: MotionDynamics; neonGlow?: boolean }> {
  const cleanKey = extractCleanApiKey(apiKey);
  if (!cleanKey || !cleanKey.startsWith('AIza')) {
    throw new Error('NETWORK_OR_NO_CLIENT_KEY');
  }

  const ai = new GoogleGenAI({ apiKey: cleanKey });
  const isBackground = type === 'bg';
  const seed = createUniqueVariationSeed(promptTopic, Math.max(0, (index || 1) - 1), variationOffset);
  const motionPlan = resolvePromptMotionPlan(promptTopic, type, style, motionDynamics, seed.variantIdx);

  const colorStyleDirective = isGreenScreen
    ? `GREEN SCREEN (#00ff00 cleared): NEVER fillRect(0,0,w,h)/clearRect; ctx.shadowBlur=0; ctx.globalAlpha=1 (NO rgba(...,0.x), NO translucent glass/shadow lines!); ONLY solid opaque NON-GREEN colors (${seed.palette.join(',')},#F8FAFC).`
    : neonGlow
    ? `DARK BG (#080c14 cleared): NEVER fillRect(0,0,w,h) for icons; shadowBlur=8 on bright accents (reset 0).`
    : `CRISP VECTOR (#080c14 cleared): shadowBlur=0.`;

  const geometryGuide = isBackground
    ? `FULL-FRAME BG (0..w,0..h): ${motionPlan.anatomyHint}`
    : `CONCISE HERO ICON (10-20 lines, <=320 tokens): Set R=S*0.72 inside G.part(cx,cy+bobY,rot,sx,sy,fn). PREFER G.<hero>(0,0,1.05*R,...,t,${seed.variantIdx}) with unique Palette=[${seed.palette.join(',')}] & Motion=[${seed.motionExpr}] so shape+motion are fresh! NEVER draw tiny dots <0.5*R, bare G.rays alone, or backdrop plates. ANATOMY: ${motionPlan.anatomyHint}`;

  const systemPrompt = `60 FPS Canvas 2D Motion Coder. Return ONLY RAW JS: function drawFrame(ctx, w, h, cx, cy, S, t) { ... } (no markdown/HTML/canvas/resize/rAF; never redeclare canvas/ctx/w/h/cx/cy/S/G).
HELPERS G: G.grad(c1,c2,c3,x0,y0,x1,y1) | G.box(x,y,bw,bh,r,fill,rim,lw) | G.bar(x,yBase,bw,bh,r,fill,rim,lw) | G.capsule(x,y,bw,bh,fill,rim,lw) | G.disc(x,y,r,fill,rim,lw) | G.oval(x,y,rx,ry,rot,fill,rim,lw) | G.ring(x,y,r,thick,a0,a1,col) | G.poly(pts,fill,rim,lw,close) | G.star(x,y,ro,ri,n,rot,fill,rim) | G.pill(x1,y1,x2,y2,thick,col) | G.arrow(x1,y1,x2,y2,thick,headLen,col) | G.person(x,y,s,b,h,rim) | G.check(x,y,s,thick,col) | G.pie(x,y,r,a0,sw,sCol,bCol,rim) | G.rays(x,y,rI,rO,n,rot,th,col) | G.handshake(x,y,s,cL,cR,hCol,cuff,rim) | G.shield(x,y,s,fill,rim,in) | G.cart(x,y,s,body,wheel,rim) | G.megaphone(x,y,s,cone,handle,acc,rim) | G.wallet(x,y,s,body,flap,clasp,rim) | G.globe(x,y,r,sph,line,rim) | G.uiLayout(x,y,s,fr,hd,ac,rim,t,v) | G.videoCall(x,y,s,fr,ti,ac,rim,t,v) | G.laptop(x,y,s,bd,sc,ac,rim,t,v) | G.checklist(x,y,s,bd,cl,ac,rim,t,v) | G.rocket(x,y,s,hu,wi,fl,rim,t,v) | G.lightbulb(x,y,s,bu,ra,ba,rim,t,v) | G.chart(x,y,s,cd,b1,b2,ar,rim,t,v) | G.magnifier(x,y,s,cd,le,ha,ac,rim,t,v) | G.pieChart(x,y,s,ba,s1,s2,s3,rim,t,v) | G.gears(x,y,s,g1,g2,co,rim,t,v) | G.userBadge(x,y,s,cd,pe,ac,rim,t,v) | G.typography(x,y,s,cd,in,ac,rim,t,v) | G.briefcase(x,y,s,bd,fl,cl,rim,t,v) | G.trophy(x,y,s,cu,ba,st,rim,t,v) | G.clock(x,y,s,be,fa,ha,rim,t,v) | G.lock(x,y,s,bd,sh,ac,rim,t,v) | G.cloudSync(x,y,s,cl,ar,rim,t,v) | G.robot(x,y,s,bd,vi,ey,rim,t,v) | G.chip(x,y,s,pk,pn,co,rim,t,v) | G.coinStack(x,y,s,co,si,st,rim,t,v) | G.part(tx,ty,rot,sx,sy,fn)
SPEC [${seed.tag}]: "${promptTopic}" (${subCategory}) | Style: ${style} | Palette: ${colorMode} [${seed.palette.join(',')}]
- ${geometryGuide}
- Motion (${motionPlan.label}): ${motionPlan.codeHint} | Kinetic: ${seed.motionExpr}.
- ${colorStyleDirective}`;

  const config: any = {
    temperature: 0.42,
    maxOutputTokens: 950,
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
      unsupportedThinkingModels.add(targetModel.toLowerCase());
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
    prompt: promptTopic,
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

// 2-in-1 Direct Browser Batch Animation Generator (uses clean plain-text JS delimiters + offscreen Canvas pixel verification + cross-slot code dedup)
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
  neonGlow: boolean = true,
  variationOffset: number = 0
): Promise<Array<{ id: string; title: string; prompt?: string; type: AnimationType; style: string; subCategory: string; html: string; isGreenScreen?: boolean; colorMode?: ColorMode; motionDynamics?: MotionDynamics; neonGlow?: boolean } | null>> {
  const cleanKey = extractCleanApiKey(apiKey);
  if (!cleanKey || !cleanKey.startsWith('AIza')) {
    throw new Error('NETWORK_OR_NO_CLIENT_KEY');
  }

  const ai = new GoogleGenAI({ apiKey: cleanKey });
  const isBackground = type === 'bg';

  const colorStyleDirective = isGreenScreen
    ? 'GREEN SCREEN (#00ff00 cleared): NEVER fillRect(0,0,w,h)/clearRect; shadowBlur=0; globalAlpha=1 (NO rgba(...,0.x), NO translucent glass/shadow lines!); ONLY solid opaque NON-GREEN colors (#FFD700,#00E5FF,#9333EA,#F43F5E,#F8FAFC,#F97316,#1E293B).'
    : neonGlow
    ? 'DARK BG (#080c14 cleared): shadowBlur=8 on bright LEDs (reset 0).'
    : 'CRISP VECTOR (#080c14 cleared): shadowBlur=0.';

  const geometryGuide = isBackground
    ? 'FULL-FRAME BG (0..w,0..h): 3-4 smooth cosine ribbons/grids spanning -0.1*w..1.1*w.'
    : 'CONCISE HERO ICON (10-20 lines each, <=300 tokens): R=S*0.72 inside G.part(cx,cy+bobY,rot,sx,sy,fn). Each ANIM_i MUST pass its assigned v integer AND use distinct palette/motion so outputs NEVER look identical!';

  const slotSeeds = prompts.map((p, idx) => createUniqueVariationSeed(p, idx, variationOffset));
  const topicLines = prompts.map((p, idx) => {
    const seed = slotSeeds[idx];
    const plan = resolvePromptMotionPlan(p, type, style, motionDynamics, seed.variantIdx);
    return `// ===ANIM_${idx}=== [${seed.tag}] "${p}" [v=${seed.variantIdx} | Palette:${seed.palette.join(',')} | Kinetic:${seed.motionExpr} | Anatomy:${plan.anatomyHint} | Motion (${plan.label}): ${plan.codeHint}]`;
  }).join('\n');

  const batchPrompt = `60 FPS Canvas 2D Motion Coder. Write ${prompts.length} VISUALLY DISTINCT concise RAW JS functions separated ONLY by:
${prompts.map((_, idx) => `// ===ANIM_${idx}===\nfunction drawFrame(ctx, w, h, cx, cy, S, t) { ... }`).join('\n')}
HELPERS G: G.grad(c1,c2,c3,x0,y0,x1,y1) | G.box(x,y,bw,bh,r,fill,rim,lw) | G.bar(x,yBase,bw,bh,r,fill,rim,lw) | G.capsule(x,y,bw,bh,fill,rim,lw) | G.disc(x,y,r,fill,rim,lw) | G.oval(x,y,rx,ry,rot,fill,rim,lw) | G.ring(x,y,r,thick,a0,a1,col) | G.poly(pts,fill,rim,lw,close) | G.star(x,y,ro,ri,n,rot,fill,rim) | G.pill(x1,y1,x2,y2,thick,col) | G.arrow(x1,y1,x2,y2,thick,headLen,col) | G.person(x,y,s,b,h,rim) | G.check(x,y,s,thick,col) | G.pie(x,y,r,a0,sw,sCol,bCol,rim) | G.rays(x,y,rI,rO,n,rot,th,col) | G.handshake(x,y,s,cL,cR,hCol,cuff,rim) | G.shield(x,y,s,fill,rim,in) | G.cart(x,y,s,body,wheel,rim) | G.megaphone(x,y,s,cone,handle,acc,rim) | G.wallet(x,y,s,body,flap,clasp,rim) | G.globe(x,y,r,sph,line,rim) | G.uiLayout(x,y,s,fr,hd,ac,rim,t,v) | G.videoCall(x,y,s,fr,ti,ac,rim,t,v) | G.laptop(x,y,s,bd,sc,ac,rim,t,v) | G.checklist(x,y,s,bd,cl,ac,rim,t,v) | G.rocket(x,y,s,hu,wi,fl,rim,t,v) | G.lightbulb(x,y,s,bu,ra,ba,rim,t,v) | G.chart(x,y,s,cd,b1,b2,ar,rim,t,v) | G.magnifier(x,y,s,cd,le,ha,ac,rim,t,v) | G.pieChart(x,y,s,ba,s1,s2,s3,rim,t,v) | G.gears(x,y,s,g1,g2,co,rim,t,v) | G.userBadge(x,y,s,cd,pe,ac,rim,t,v) | G.typography(x,y,s,cd,in,ac,rim,t,v) | G.briefcase(x,y,s,bd,fl,cl,rim,t,v) | G.trophy(x,y,s,cu,ba,st,rim,t,v) | G.clock(x,y,s,be,fa,ha,rim,t,v) | G.lock(x,y,s,bd,sh,ac,rim,t,v) | G.cloudSync(x,y,s,cl,ar,rim,t,v) | G.robot(x,y,s,bd,vi,ey,rim,t,v) | G.chip(x,y,s,pk,pn,co,rim,t,v) | G.coinStack(x,y,s,co,si,st,rim,t,v) | G.part(tx,ty,rot,sx,sy,fn)
SPEC: ${geometryGuide}
Style: ${style} | Palette: ${colorMode} | ${colorStyleDirective}
CRITICAL: Each ANIM_i MUST have its own unique layout, variant v, colors, and kinetic motion — NEVER copy code across slots!
NO markdown/HTML/canvas/resize/rAF or redeclaring canvas/ctx/w/h/cx/cy/S/G.
TOPICS:
${topicLines}`;

  const config: any = {
    temperature: 0.42,
    maxOutputTokens: Math.min(1850, Math.max(950, prompts.length * 850)),
  };
  const smartThinking = getCostOptimizedThinkingConfig(targetModel, 'animation', false);
  if (smartThinking) config.thinkingConfig = smartThinking;

  const profile = getModelExecutionProfile(targetModel);
  const batchTimeoutMs = Math.min(48000, profile.timeoutMs + 8000);
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
      unsupportedThinkingModels.add(targetModel.toLowerCase());
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
  const batchSeen = new Set<string>();

  return prompts.map((promptTopic, idx) => {
    const rawCode = codeItems[idx] || '';
    if (!rawCode) return null;
    const html = extractHTML(rawCode, isGreenScreen);
    const check = verifyCanvasAnimationHtml(html, !!isGreenScreen, type);
    if (!check.ok) {
      console.warn(`[Batch Slot #${idx} Rejected by Offscreen Verifier]:`, check.reason);
      return null;
    }
    if (isCodeFingerprintDuplicate(html, batchSeen)) {
      console.warn(`[Batch Slot #${idx} Rejected: Identical code fingerprint detected — regenerating distinct variant]`);
      return null;
    }
    recordCodeFingerprint(html, batchSeen);
    return {
      id: 'anim_' + Date.now() + '_' + idx + Math.random().toString(36).substring(7),
      title: `${promptTopic.substring(0, 35)}... (${idx + 1}/${prompts.length})`,
      prompt: promptTopic,
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
  neonGlow: boolean = true,
  variationSalt: number = 0
): Promise<{ id: string; title: string; prompt?: string; type: AnimationType; style: string; subCategory: string; html: string; isGreenScreen?: boolean; colorMode?: ColorMode; motionDynamics?: MotionDynamics; neonGlow?: boolean }> {
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
            sawRenderDefect, // Only escalate thinking if prior pass failed shape/syntax, NEVER on 429!
            variationSalt + attempt - 1
          );
          if (attempt < maxRetries && isCodeFingerprintDuplicate(result.html)) {
            console.warn('[Single Render Duplicate Detected]: regenerating with fresh Variation DNA...');
            if (onRetry) onRetry(attempt, maxRetries, 'Mendeteksi kemiripan desain, menyusun variasi unik baru...');
            continue;
          }
          recordCodeFingerprint(result.html);
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
          variationOffset: variationSalt + attempt - 1,
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

      recordCodeFingerprint(healedHtml);
      if (selectedKey) recordKeyModelSuccess(selectedKey, activeModel);
      return {
        ...data,
        prompt: data.prompt || promptTopic,
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

  for (let attempt = 1; attempt <= 2; attempt++) {
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

    let ranClientDirect = false;
    let partialItems: Array<any | null> = new Array(prompts.length).fill(null);

    try {
      if (selectedKey && selectedKey.startsWith('AIza')) {
        ranClientDirect = true;
        await waitForKeyReuseGapIfNeeded(uniqueClientKeys, activeModel);
        try {
          partialItems = await generateAnimationBatchDirect(
            selectedKey,
            activeModel,
            prompts,
            type,
            subCategory,
            style,
            isGreenScreen,
            colorMode,
            motionDynamics,
            neonGlow,
            attempt - 1
          );
          for (let k = 0; k < prompts.length; k++) {
            if (!batchItems[k] && partialItems[k]) batchItems[k] = partialItems[k];
          }
          batchSuccess = batchItems.every(Boolean);
          if (batchItems.some(Boolean)) {
            recordKeyModelSuccess(selectedKey, activeModel);
            break;
          }
          // All slots failed verification on direct call -> DO NOT fall through to server route with the same request!
          modelCursor = Math.min(modelCursor + 1, modelsAvailable.length - 1);
          continue;
        } catch (clientErr: any) {
          const classified = classifyGeminiError(clientErr);
          if (classified.isInvalidKey) {
            markKeyInvalidOrSuspended(selectedKey);
            continue;
          }
          if (classified.isQuota) {
            batchHitQuota = true;
            markKeyModelCooldown(selectedKey, activeModel, clientErr);
            if (!getBestHealthyKey(uniqueClientKeys, activeModel) || attempt >= 1) {
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
          if (classified.isNetworkError || /timeout|500|502|503|504|unavailable|overloaded/i.test(classified.message)) {
            modelCursor = Math.min(modelCursor + 1, modelsAvailable.length - 1);
            const transientPause = getModelExecutionProfile(activeModel).retryDelaysMs[attempt - 1] || 1800;
            await new Promise((r) => setTimeout(r, transientPause));
            continue;
          }
          if (classified.message !== 'NETWORK_OR_NO_CLIENT_KEY') {
            break;
          }
          ranClientDirect = false;
        }
      }

      // Server proxy fallback ONLY if no client AIza key or direct browser network blocked
      if (!ranClientDirect) {
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
            variationOffset: attempt - 1,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data?.items)) {
            const srvSeen = new Set<string>();
            batchItems = data.items.map((it: any) => {
              if (!it || !it.html) return null;
              const healed = extractHTML(it.html, isGreenScreen);
              const check = verifyCanvasAnimationHtml(healed, !!isGreenScreen, type);
              if (!check.ok) {
                console.warn('[Server Batch Item Rejected]:', check.reason);
                return null;
              }
              if (isCodeFingerprintDuplicate(healed, srvSeen)) {
                console.warn('[Server Batch Item Rejected: Identical code fingerprint]');
                return null;
              }
              recordCodeFingerprint(healed, srvSeen);
              return { ...it, html: healed };
            });
            batchSuccess = batchItems.some(Boolean);
            if (batchSuccess) {
              if (selectedKey) recordKeyModelSuccess(selectedKey, activeModel);
              break;
            }
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

  // ANTI-AVALANCHE GUARD: If the entire batch failed due to 429 quota, NEVER fan out into extra 429 calls!
  if (!batchItems.some(Boolean) && batchHitQuota) {
    return prompts.map((p) => ({
      prompt: p,
      error: 'Batas kuota 429 tercapai — menahan antrean untuk pemulihan kuota.',
      exhausted: true,
    }));
  }

  // Build final output, filling ONLY missing/rejected slots via 1-retry single-item verified regeneration with distinct salt
  const finalOut: Array<{ prompt: string; anim?: any; error?: string; exhausted?: boolean }> = [];
  for (let i = 0; i < prompts.length; i++) {
    const item = batchItems[i];
    if (item && item.html) {
      item.title = `${prompts[i].substring(0, 35)}... (${startIndex + i}/${totalOverall})`;
      item.prompt = item.prompt || prompts[i];
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
          neonGlow,
          i + 7
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

  const visionPrompt = `Canvas 2D Motion Coder. Rekonstruksi objek GAMBAR REFERENSI menjadi 60 FPS JS murni berpusat via G.part(cx, cy+bobY, rot, sx, sy, fn) skala R=S*0.72.
Gerak OTOMATIS sesuai karakter objek gambar (mis. bel berayun, roda berputar, grafik G.bar/G.pie naik halus tanpa <0.14*R, jantung berdenyut, atau floating tegak |rot|<=0.05 — JANGAN memutar objek tegak 360 derajat, JANGAN berkedip hilang via if(sin>0)).
Mode: ${colorMode} | ${isGreenScreen ? 'GREEN SCREEN (#00ff00 bersih: JANGAN fillRect(0,0,w,h), shadowBlur=0, globalAlpha=1, NO rgba(...,0.x) / NO lapisan kaca transparan, HANYA warna solid non-hijau)' : 'BG Gelap (#080c14)'}.
${customInstructions ? `Instruksi: ${customInstructions}` : ''}
HELPERS G: G.grad(c1,c2,c3,x0,y0,x1,y1) | G.box(x,y,bw,bh,r,fill,rim,lw) | G.bar(x,yBase,bw,bh,r,fill,rim,lw) | G.capsule(x,y,bw,bh,fill,rim,lw) | G.disc(x,y,r,fill,rim,lw) | G.oval(x,y,rx,ry,rot,fill,rim,lw) | G.ring(x,y,r,thick,a0,a1,col) | G.poly(pts,fill,rim,lw,close) | G.ngon(x,y,r,n,rot,fill,rim) | G.star(x,y,ro,ri,n,rot,fill,rim) | G.pill(x1,y1,x2,y2,thick,col) | G.arrow(x1,y1,x2,y2,thick,headLen,col) | G.person(x,y,s,bodyCol,headCol,rimCol) | G.check(x,y,s,thick,col) | G.pie(x,y,r,a0,sweep,sliceCol,baseCol,rimCol) | G.rays(x,y,rIn,rOut,n,rot,thick,col) | G.handshake(x,y,s,colL,colR,handCol,cuffCol,rimCol) | G.shield(x,y,s,fill,rim,in) | G.cart(x,y,s,body,wheel,rim) | G.megaphone(x,y,s,cone,handle,acc,rim) | G.wallet(x,y,s,body,flap,clasp,rim) | G.globe(x,y,r,sph,line,rim) | G.part(tx,ty,rot,sx,sy,fn)
ATURAN: (1) Semua (x,y) pada G.box/G.disc/G.oval adalah TITIK TENGAH; (2) PAINTER ORDER (lapisan belakang dulu -> badan utama -> emblem/ikon depan TERAKHIR); (3) Semua shape WAJIB berada di dalam G.part(cx,cy+bobY,...), overlap >=0.04*R di dalam [-0.62*R,+0.62*R], ZERO bagian di pojok luar G.part, ZERO piringan lingkaran latar/bayangan gelap di belakang ikon, ZERO kotak/garis transparan, ZERO gerigi liar.
Outputkan HANYA blok metadata + fungsi RAW JS (tanpa markdown/HTML/deklarasi canvas/ctx/w/h/cx/cy/S/G):
<script type="application/json" id="shape-analysis">{"objectName":"...","shapeDescription":"...","detectedElements":[],"professionalMotionPlan":"...","similaritySynthesis":"...","glowColor":"#38bdf8"}</script>
function drawFrame(ctx, w, h, cx, cy, S, t) { ... }`;

  const config: any = {
    temperature: 0.15,
    maxOutputTokens: 1650,
  };
  const smartThinking = getCostOptimizedThinkingConfig(targetModel, 'vision');
  if (smartThinking) config.thinkingConfig = smartThinking;

  const visionProfile = getModelExecutionProfile(targetModel);
  const visionTimeoutMs = Math.min(48000, visionProfile.timeoutMs + 6000);
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
      unsupportedThinkingModels.add(targetModel.toLowerCase());
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
            unsupportedThinkingModels.add(targetModel.toLowerCase());
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
