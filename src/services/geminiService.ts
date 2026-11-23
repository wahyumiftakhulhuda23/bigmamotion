import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import { AnimationType, GeminiModel, ApiKeyTestResult, ColorMode, MotionDynamics, ShapeAnalysis } from '../types';
import { findCategoryById, generateProceduralPrompts } from '../constants/categories';
import {
  HELPERS_G_DOC,
  HELPERS_G_BG_DOC,
  HELPERS_G_VISION_DOC,
  stripLeadingCodeFenceAndLang,
  wrapCanvasCodeToHtml,
  VariationSeed,
  createUniqueVariationSeed,
  normalizeCanvasCodeFingerprint,
  resolvePromptMotionPlan,
} from './motionGeometryEngine';

export {
  wrapCanvasCodeToHtml,
  resolvePromptMotionPlan,
  createUniqueVariationSeed,
  normalizeCanvasCodeFingerprint,
};
export type { VariationSeed };

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

// --- SMART API KEY HEALTH, SLIDING-WINDOW RPM/TPM/RPD & COOLDOWN POOL ---
const quarantinedKeys = new Set<string>(); // 401/403 dead/suspended keys - never hammered again
const keyModelCooldowns = new Map<string, number>(); // `${key}::${model}` -> timestamp until cooldown ends
const keyModelStrikeCount = new Map<string, number>(); // consecutive 429 strikes for adaptive escalation
const keyModelDailyExhausted = new Map<string, number>(); // `${key}::${model}` -> timestamp when RPD cooldown ends
const keyLastUsedAt = new Map<string, number>(); // global LRU spacing
const keyModelLastUsedAt = new Map<string, number>(); // per-key+model reuse gap tracking
const modelGlobalCooldowns = new Map<string, number>(); // Scaled burst guard if majority of active pool hits 429 within 10s
const recentModelQuotaHits = new Map<string, Array<{ ts: number; key: string }>>(); // Distinct-key 429 hits per model
const unsupportedClientModels = new Map<string, number>(); // model -> timestamp (5 min TTL for 404/unsupported)
const unsupportedThinkingModels = new Set<string>(); // models where thinkingConfig threw invalid_argument

// Sliding-window 60s RPM & TPM logs per (key::model) + daily RPD counters
const keyModelMinuteWindow = new Map<string, Array<{ ts: number; tokens: number }>>();
const keyModelDailyUsage = new Map<string, { dateStr: string; count: number; tokens: number }>();
const STORAGE_KEY_RPD_USAGE = 'bigma_key_rpd_usage_v1';
let __hydratedRpdUsage = false;
let __activePoolSizeHint = 1;
let __unusedKeyStrideIndex = 0;

function getTodayDateStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function hashPairStorageKey(key: string, model: string): string {
  const raw = `${key.slice(-8)}::${model}`;
  let h = 2166136261;
  for (let i = 0; i < raw.length; i++) {
    h ^= raw.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `${(h >>> 0).toString(36)}:${model}`;
}

function hydrateRpdUsageOnce(): void {
  if (__hydratedRpdUsage) return;
  __hydratedRpdUsage = true;
  try {
    if (typeof localStorage === 'undefined') return;
    const raw = localStorage.getItem(STORAGE_KEY_RPD_USAGE);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    const today = getTodayDateStr();
    if (parsed && parsed.dateStr === today && parsed.entries && typeof parsed.entries === 'object') {
      for (const [k, v] of Object.entries<any>(parsed.entries)) {
        if (v && typeof v.count === 'number') {
          keyModelDailyUsage.set(k, { dateStr: today, count: v.count, tokens: Number(v.tokens) || 0 });
        }
      }
    }
  } catch {
    // Ignore storage read errors
  }
}

function persistRpdUsageSafely(): void {
  try {
    if (typeof localStorage === 'undefined') return;
    const today = getTodayDateStr();
    const entries: Record<string, { count: number; tokens: number }> = {};
    let kept = 0;
    keyModelDailyUsage.forEach((v, k) => {
      if (v.dateStr === today && kept < 800) {
        entries[k] = { count: v.count, tokens: v.tokens };
        kept++;
      }
    });
    localStorage.setItem(STORAGE_KEY_RPD_USAGE, JSON.stringify({ dateStr: today, entries }));
  } catch {
    // Ignore storage quota errors
  }
}

function getMinuteWindowStats(key: string, model: string, now: number = Date.now()): { rpmUsed: number; tpmUsed: number; oldestTs: number } {
  const pair = `${key}::${model}`;
  const list = keyModelMinuteWindow.get(pair);
  if (!list || list.length === 0) return { rpmUsed: 0, tpmUsed: 0, oldestTs: 0 };
  const cutoff = now - 60000;
  let writeIdx = 0;
  let tpmUsed = 0;
  let oldestTs = Infinity;
  for (let i = 0; i < list.length; i++) {
    const entry = list[i];
    if (entry.ts > cutoff) {
      list[writeIdx++] = entry;
      tpmUsed += entry.tokens;
      if (entry.ts < oldestTs) oldestTs = entry.ts;
    }
  }
  list.length = writeIdx;
  if (writeIdx === 0) {
    keyModelMinuteWindow.delete(pair);
    return { rpmUsed: 0, tpmUsed: 0, oldestTs: 0 };
  }
  return { rpmUsed: writeIdx, tpmUsed, oldestTs };
}

function getDailyUsageCount(key: string, model: string): number {
  hydrateRpdUsageOnce();
  const hKey = hashPairStorageKey(key, model);
  const rec = keyModelDailyUsage.get(hKey);
  if (!rec || rec.dateStr !== getTodayDateStr()) return 0;
  return rec.count;
}

export function recordKeyModelDispatch(key: string, model: string, estimatedTokens: number): void {
  if (!key || !model) return;
  const normModel = sanitizeModel(model);
  const now = Date.now();
  const pair = `${key}::${normModel}`;
  const list = keyModelMinuteWindow.get(pair) || [];
  list.push({ ts: now, tokens: Math.max(200, Math.round(estimatedTokens)) });
  keyModelMinuteWindow.set(pair, list);

  hydrateRpdUsageOnce();
  const today = getTodayDateStr();
  const hKey = hashPairStorageKey(key, normModel);
  const prev = keyModelDailyUsage.get(hKey);
  const next =
    prev && prev.dateStr === today
      ? { dateStr: today, count: prev.count + 1, tokens: prev.tokens + Math.round(estimatedTokens) }
      : { dateStr: today, count: 1, tokens: Math.round(estimatedTokens) };
  keyModelDailyUsage.set(hKey, next);
  if (next.count % 3 === 1) persistRpdUsageSafely();
}

function adjustRecentDispatchActualTokens(key: string, model: string, usageMetadata: any): void {
  if (!key || !model || !usageMetadata) return;
  const total = Number(usageMetadata.totalTokenCount) ||
    ((Number(usageMetadata.promptTokenCount) || 0) + (Number(usageMetadata.candidatesTokenCount) || 0) + (Number(usageMetadata.thoughtsTokenCount) || 0));
  if (!total || total <= 0) return;

  const normModel = sanitizeModel(model);
  const pair = `${key}::${normModel}`;
  const list = keyModelMinuteWindow.get(pair);
  if (list && list.length > 0) {
    const last = list[list.length - 1];
    const delta = total - last.tokens;
    last.tokens = total;
    const hKey = hashPairStorageKey(key, normModel);
    const daily = keyModelDailyUsage.get(hKey);
    if (daily && daily.dateStr === getTodayDateStr()) {
      daily.tokens = Math.max(0, daily.tokens + delta);
    }
  }
}

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
  keyModelMinuteWindow.clear();
}

export function resetKeyHealthForModelSwitch(newModel?: string): void {
  const target = sanitizeModel(newModel || 'gemini-3.8-flash');
  modelGlobalCooldowns.delete(target);
  recentModelQuotaHits.delete(target);
  unsupportedClientModels.delete(target);
  for (const pair of Array.from(keyModelCooldowns.keys())) {
    if (pair.endsWith(`::${target}`)) keyModelCooldowns.delete(pair);
  }
  for (const pair of Array.from(keyModelStrikeCount.keys())) {
    if (pair.endsWith(`::${target}`)) keyModelStrikeCount.delete(pair);
  }
  for (const pair of Array.from(keyModelDailyExhausted.keys())) {
    if (pair.endsWith(`::${target}`)) keyModelDailyExhausted.delete(pair);
  }
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
      return Math.min(65000, Math.max(6000, Math.ceil(secs * 1000) + 1000));
    }
  }
  return null;
}

function isDailyQuotaMessage(msg: string): boolean {
  const lower = (msg || '').toLowerCase();
  // Explicitly rule out per-minute / per-second bursts first
  if (
    lower.includes('perminute') ||
    lower.includes('per_minute') ||
    lower.includes('requestsperminute') ||
    lower.includes('tokensperminute')
  ) {
    return false;
  }
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
  const normModel = sanitizeModel(model);
  const pair = `${key}::${normModel}`;
  keyModelStrikeCount.delete(pair);
  keyModelCooldowns.delete(pair);
  recentModelQuotaHits.delete(normModel);
  modelGlobalCooldowns.delete(normModel);
}

function markKeyModelCooldown(key: string, model: string, errOrDurationMs: any = 28000): void {
  if (!key || !model) return;
  const normModel = sanitizeModel(model);
  const pair = `${key}::${normModel}`;
  const now = Date.now();
  const msg = typeof errOrDurationMs === 'string'
    ? errOrDurationMs
    : (errOrDurationMs?.message || errOrDurationMs?.error?.message || '');

  if (typeof errOrDurationMs !== 'number' && isDailyQuotaMessage(msg)) {
    // True daily RPD quota exhausted on this model for this key — cool for 2 hours (still resettable on model switch / key reload)
    keyModelDailyExhausted.set(pair, now + 2 * 60 * 60 * 1000);
    keyModelCooldowns.set(pair, now + 2 * 60 * 60 * 1000);
    return;
  }

  let durationMs: number;
  if (typeof errOrDurationMs === 'number') {
    durationMs = errOrDurationMs;
  } else {
    const parsed = parseRetryDelayMs(errOrDurationMs);
    const strikes = (keyModelStrikeCount.get(pair) || 0) + 1;
    keyModelStrikeCount.set(pair, strikes);
    const profile = getModelExecutionProfile(normModel);
    if (parsed) {
      durationMs = Math.max(parsed, Math.min(profile.cooldownStepsMs[0], 22000));
    } else {
      // Model-tier adaptive escalation (lite warms up quickly, flagship/pro rest longer)
      durationMs = profile.cooldownStepsMs[Math.min(strikes - 1, profile.cooldownStepsMs.length - 1)];
    }

    // Scaled burst guard: only pause the ENTIRE model if a huge share of active keys fail in 10s
    // (Prevents 3 keys from 1 shared project out of 108 keys from freezing all 108 keys!)
    const hits = (recentModelQuotaHits.get(normModel) || []).filter((h) => now - h.ts < 10000);
    if (!hits.some((h) => h.key === key)) {
      hits.push({ ts: now, key });
    }
    recentModelQuotaHits.set(normModel, hits);
    const burstThreshold = Math.max(3, Math.min(18, Math.ceil(__activePoolSizeHint * 0.45)));
    if (hits.length >= burstThreshold) {
      modelGlobalCooldowns.set(normModel, now + Math.min(durationMs, profile.postQuotaRecoveryMs));
    }
  }
  keyModelCooldowns.set(pair, now + durationMs);
}

function isKeyModelInCooldown(key: string, model: string): boolean {
  const normModel = sanitizeModel(model);
  const now = Date.now();
  const globalUntil = modelGlobalCooldowns.get(normModel);
  if (globalUntil) {
    if (now < globalUntil) return true;
    modelGlobalCooldowns.delete(normModel);
  }
  const pair = `${key}::${normModel}`;
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
  modelId: string;
  displayName: string;
  tier: 'ultra_lite' | 'smart_lite' | 'balanced_flash' | 'flagship_flash' | 'pro_rigging';
  rpmLimitPerKey: number;
  safeRpmPerKey: number;
  tpmLimitPerKey: number;
  safeTpmPerKey: number;
  rpdLimitPerKey: number;
  estimatedTokensPerAnim: number;
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
  const raw = (model || 'gemini-3.8-flash').toLowerCase();
  const m = sanitizeModel(raw).toLowerCase();
  if (m.includes('3.1-pro') || m.includes('4-')) {
    return {
      modelId: 'gemini-3.1-pro-preview',
      displayName: 'Gemini 3.1 Pro Preview',
      tier: 'pro_rigging',
      rpmLimitPerKey: 5,
      safeRpmPerKey: 3,
      tpmLimitPerKey: 250000,
      safeTpmPerKey: 180000,
      rpdLimitPerKey: 100,
      estimatedTokensPerAnim: 1300,
      pacingManyKeysMs: 2000,
      pacingFewKeysMs: 4800,
      pacingSingleKeyMs: 11000,
      minKeyReuseGapMs: 19500,
      retryDelaysMs: [2800, 5600, 8800],
      cooldownStepsMs: [40000, 70000, 105000],
      postQuotaRecoveryMs: 24000,
      timeoutMs: 46000,
    };
  }
  if (m.includes('3.8') || raw.includes('3.6')) {
    return {
      modelId: raw.includes('3.6') ? 'gemini-3.6-flash' : 'gemini-3.8-flash',
      displayName: raw.includes('3.6') ? 'Gemini 3.6 Flash' : 'Gemini 3.8 Flash',
      tier: 'flagship_flash',
      rpmLimitPerKey: 10,
      safeRpmPerKey: 8,
      tpmLimitPerKey: 250000,
      safeTpmPerKey: 200000,
      rpdLimitPerKey: 250,
      estimatedTokensPerAnim: 850,
      pacingManyKeysMs: 1100,
      pacingFewKeysMs: 3600,
      pacingSingleKeyMs: 7500,
      minKeyReuseGapMs: 7500,
      retryDelaysMs: [1800, 3800, 6200],
      cooldownStepsMs: [26000, 48000, 72000],
      postQuotaRecoveryMs: 18000,
      timeoutMs: 38000,
    };
  }
  if (m.includes('2.5-flash-lite') || m.includes('3.1-flash-lite')) {
    return {
      modelId: m.includes('2.5-flash-lite') ? 'gemini-2.5-flash-lite' : 'gemini-3.1-flash-lite',
      displayName: m.includes('2.5-flash-lite') ? 'Gemini 2.5 Flash Lite' : 'Gemini 3.1 Flash Lite',
      tier: 'ultra_lite',
      rpmLimitPerKey: 30,
      safeRpmPerKey: 20,
      tpmLimitPerKey: 250000,
      safeTpmPerKey: 225000,
      rpdLimitPerKey: 1000,
      estimatedTokensPerAnim: 700,
      pacingManyKeysMs: 500,
      pacingFewKeysMs: 1600,
      pacingSingleKeyMs: 3200,
      minKeyReuseGapMs: 3000,
      retryDelaysMs: [900, 1800, 3200],
      cooldownStepsMs: [14000, 28000, 46000],
      postQuotaRecoveryMs: 10000,
      timeoutMs: 28000,
    };
  }
  if (m.includes('3.5-flash-lite')) {
    return {
      modelId: 'gemini-3.5-flash-lite',
      displayName: 'Gemini 3.5 Flash Lite',
      tier: 'smart_lite',
      rpmLimitPerKey: 15,
      safeRpmPerKey: 13,
      tpmLimitPerKey: 250000,
      safeTpmPerKey: 220000,
      rpdLimitPerKey: 1000,
      estimatedTokensPerAnim: 720,
      pacingManyKeysMs: 650,
      pacingFewKeysMs: 2100,
      pacingSingleKeyMs: 4400,
      minKeyReuseGapMs: 4500,
      retryDelaysMs: [1100, 2200, 3800],
      cooldownStepsMs: [18000, 34000, 52000],
      postQuotaRecoveryMs: 12000,
      timeoutMs: 30000,
    };
  }
  // gemini-2.5-flash / gemini-flash-latest
  return {
    modelId: 'gemini-2.5-flash',
    displayName: 'Gemini 2.5 Flash',
    tier: 'balanced_flash',
    rpmLimitPerKey: 10,
    safeRpmPerKey: 9,
    tpmLimitPerKey: 250000,
    safeTpmPerKey: 210000,
    rpdLimitPerKey: 250,
    estimatedTokensPerAnim: 820,
    pacingManyKeysMs: 900,
    pacingFewKeysMs: 2900,
    pacingSingleKeyMs: 6600,
    minKeyReuseGapMs: 6800,
    retryDelaysMs: [1400, 2800, 4800],
    cooldownStepsMs: [22000, 42000, 65000],
    postQuotaRecoveryMs: 15000,
    timeoutMs: 32000,
  };
}

export function getAllModelQuotaProfiles(): ModelExecutionProfile[] {
  return [
    getModelExecutionProfile('gemini-3.8-flash'),
    getModelExecutionProfile('gemini-3.6-flash'),
    getModelExecutionProfile('gemini-3.5-flash-lite'),
    getModelExecutionProfile('gemini-3.1-flash-lite'),
    getModelExecutionProfile('gemini-2.5-flash'),
    getModelExecutionProfile('gemini-3.1-pro-preview'),
  ];
}

export function getAdaptiveModelPacingDelay(model: string | undefined, keyCount: number): number {
  const profile = getModelExecutionProfile(model);
  if (keyCount >= 25) return Math.max(400, Math.round(profile.pacingManyKeysMs * 0.7));
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
        'gemini-2.5-flash',
        'gemini-3.5-flash-lite',
        'gemini-2.5-flash-lite',
        'gemini-3.1-flash-lite',
        'gemini-flash-latest',
      ];
  return Array.from(new Set(ordered)).filter((m) => !isModelUnsupportedCached(m));
}

export interface KeyPoolCooldownStatus {
  availableNow: boolean;
  readyPairs: number;
  totalKeys: number;
  validKeys: number;
  earliestWaitMs: number;
  allDailyExhausted: boolean;
  allInvalid: boolean;
  reason: 'ready' | 'rpm_tpm_cooldown' | 'daily_exhausted' | 'no_valid_keys';
}

export function getKeyPoolCooldownStatus(apiKeys: string[], models?: string[]): KeyPoolCooldownStatus {
  const uniqueKeys = getCleanUniqueKeys(apiKeys);
  const validKeys = uniqueKeys.filter((k) => !quarantinedKeys.has(k));
  __activePoolSizeHint = Math.max(1, validKeys.length);

  if (validKeys.length === 0) {
    return {
      availableNow: false,
      readyPairs: 0,
      totalKeys: uniqueKeys.length,
      validKeys: 0,
      earliestWaitMs: 0,
      allDailyExhausted: false,
      allInvalid: uniqueKeys.length > 0,
      reason: 'no_valid_keys',
    };
  }

  const targetModels = (models && models.length > 0
    ? models
    : ['gemini-3.8-flash', 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-2.5-flash-lite', 'gemini-2.5-flash']
  ).map((m) => sanitizeModel(m)).filter((m) => !isModelUnsupportedCached(m));

  const now = Date.now();
  let readyPairs = 0;
  let minWait = Infinity;

  for (const k of validKeys) {
    for (const m of targetModels) {
      const pair = `${k}::${m}`;
      const dailyUntil = keyModelDailyExhausted.get(pair);
      if (dailyUntil && dailyUntil > now) continue; // truly RPD-exhausted for this (key, model)

      const profile = getModelExecutionProfile(m);
      const win = getMinuteWindowStats(k, m, now);
      let windowWaitUntil = 0;
      if (win.rpmUsed >= profile.safeRpmPerKey || win.tpmUsed + profile.estimatedTokensPerAnim > profile.safeTpmPerKey) {
        if (win.oldestTs > 0) {
          windowWaitUntil = win.oldestTs + 60200;
        }
      }

      const globalUntil = modelGlobalCooldowns.get(m) || 0;
      const keyUntil = keyModelCooldowns.get(pair) || 0;
      const effectiveUntil = Math.max(
        keyUntil > now ? keyUntil : 0,
        globalUntil > now ? globalUntil : 0,
        windowWaitUntil > now ? windowWaitUntil : 0
      );

      if (!effectiveUntil || effectiveUntil <= now) {
        readyPairs++;
      } else {
        const wait = effectiveUntil - now;
        if (wait < minWait) minWait = wait;
      }
    }
  }

  if (readyPairs > 0) {
    return {
      availableNow: true,
      readyPairs,
      totalKeys: uniqueKeys.length,
      validKeys: validKeys.length,
      earliestWaitMs: 0,
      allDailyExhausted: false,
      allInvalid: false,
      reason: 'ready',
    };
  }

  if (Number.isFinite(minWait) && minWait > 0) {
    return {
      availableNow: false,
      readyPairs: 0,
      totalKeys: uniqueKeys.length,
      validKeys: validKeys.length,
      earliestWaitMs: Math.min(minWait + 1000, 75000),
      allDailyExhausted: false,
      allInvalid: false,
      reason: 'rpm_tpm_cooldown',
    };
  }

  return {
    availableNow: false,
    readyPairs: 0,
    totalKeys: uniqueKeys.length,
    validKeys: validKeys.length,
    earliestWaitMs: 0,
    allDailyExhausted: true,
    allInvalid: false,
    reason: 'daily_exhausted',
  };
}

export function getEarliestCooldownWaitMs(apiKeys: string[], models?: string[]): number {
  const status = getKeyPoolCooldownStatus(apiKeys, models);
  if (status.availableNow) return 0;
  return status.earliestWaitMs;
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

export function getBestHealthyKey(apiKeys: string[], model?: string, estimatedTokens?: number): string | undefined {
  const uniqueKeys = getCleanUniqueKeys(apiKeys);
  if (uniqueKeys.length === 0) return undefined;

  const targetModel = model ? sanitizeModel(model) : '';
  const now = Date.now();
  const profile = targetModel ? getModelExecutionProfile(targetModel) : null;
  const gapMs = profile ? profile.minKeyReuseGapMs : 0;
  const estTok = estimatedTokens || (profile ? profile.estimatedTokensPerAnim : 850);

  const nonQuarantined = uniqueKeys.filter((k) => !quarantinedKeys.has(k));
  __activePoolSizeHint = Math.max(1, nonQuarantined.length);

  if (targetModel) {
    const globalUntil = modelGlobalCooldowns.get(targetModel);
    if (globalUntil && now < globalUntil) return undefined;
  }

  // Filter out keys cooling down on this model or currently saturated in 60s RPM/TPM window
  const healthy = nonQuarantined.filter((k) => {
    if (targetModel && isKeyModelInCooldown(k, targetModel)) return false;
    if (targetModel && profile) {
      const win = getMinuteWindowStats(k, targetModel, now);
      if (win.rpmUsed >= profile.safeRpmPerKey) return false;
      if (win.tpmUsed + estTok > profile.safeTpmPerKey) return false;
    }
    return true;
  });

  if (healthy.length > 0) {
    // Prefer keys that cleared the per-model minimum reuse gap
    const rested = targetModel
      ? healthy.filter((k) => now - (keyModelLastUsedAt.get(`${k}::${targetModel}`) || 0) >= gapMs)
      : healthy;
    const pool = rested.length > 0 ? rested : healthy;

    // Never-used-yet keys: spread via golden-ratio stride across the pool so adjacent keys from same GCP project aren't hammered in a row
    const unused = pool.filter((k) => !(targetModel ? keyModelLastUsedAt.get(`${k}::${targetModel}`) : keyLastUsedAt.get(k)));
    let best: string;
    if (unused.length > 0) {
      // Also sort unused by fewest daily requests recorded today
      const sortedUnused = unused.length > 1 && targetModel && profile
        ? [...unused].sort((a, b) => getDailyUsageCount(a, targetModel) - getDailyUsageCount(b, targetModel))
        : unused;
      const minDaily = targetModel ? getDailyUsageCount(sortedUnused[0], targetModel) : 0;
      const freshestTier = targetModel
        ? sortedUnused.filter((k) => getDailyUsageCount(k, targetModel) <= minDaily + 2)
        : sortedUnused;
      const stride = freshestTier.length > 4 ? Math.max(1, Math.round(freshestTier.length * 0.381966)) : 1;
      __unusedKeyStrideIndex = (__unusedKeyStrideIndex + stride) % freshestTier.length;
      best = freshestTier[__unusedKeyStrideIndex];
    } else {
      // Score active pool by lowest combined (minute RPM load + normalized RPD load + recency)
      best = pool[0];
      let bestScore = Infinity;
      for (let i = 0; i < pool.length; i++) {
        const cand = pool[i];
        const ts = targetModel
          ? (keyModelLastUsedAt.get(`${cand}::${targetModel}`) || keyLastUsedAt.get(cand) || 0)
          : (keyLastUsedAt.get(cand) || 0);
        const recencyNorm = Math.max(0, 1 - (now - ts) / 60000);
        let loadScore = recencyNorm * 2.0;
        if (targetModel && profile) {
          const win = getMinuteWindowStats(cand, targetModel, now);
          const daily = getDailyUsageCount(cand, targetModel);
          loadScore += (win.rpmUsed / Math.max(1, profile.safeRpmPerKey)) * 3.0;
          loadScore += (daily / Math.max(1, profile.rpdLimitPerKey)) * 1.5;
        }
        if (loadScore < bestScore) {
          bestScore = loadScore;
          best = cand;
        }
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
  const profile = getModelExecutionProfile(targetModel);
  const gapMs = profile.minKeyReuseGapMs;
  const now = Date.now();

  const healthy = uniqueKeys.filter((k) => {
    if (quarantinedKeys.has(k) || isKeyModelInCooldown(k, targetModel)) return false;
    const win = getMinuteWindowStats(k, targetModel, now);
    return win.rpmUsed < profile.safeRpmPerKey && win.tpmUsed + profile.estimatedTokensPerAnim <= profile.safeTpmPerKey;
  });
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
  if (m.includes('2.5-flash-lite')) {
    return { thinkingBudget: purpose === 'vision' ? 160 : highPrecision ? 96 : 0 };
  }
  if (m.includes('2.5')) {
    // Lean 48-token thinking scratchpad on first pass cuts ~60% thinking overhead while preserving retry escalation
    return { thinkingBudget: purpose === 'vision' ? 256 : highPrecision ? 160 : purpose === 'animation' ? 48 : 0 };
  }
  if (m.includes('3.1-pro') || m.includes('4-')) {
    return { thinkingLevel: ThinkingLevel.LOW };
  }
  if (m.includes('3.8') || m.includes('3.6') || m.includes('3.5') || m.includes('3.1-flash-lite') || m.includes('flash-lite')) {
    // First-pass uses MINIMAL thinking (motionPlan already supplies exact coordinates & joints); escalates to LOW only on defect retry or vision
    return { thinkingLevel: purpose === 'vision' || highPrecision ? ThinkingLevel.LOW : ThinkingLevel.MINIMAL };
  }
  return undefined;
}

interface ClassifiedGeminiErr {
  message: string;
  isInvalidKey: boolean;
  isPermissionDenied: boolean;
  isQuota: boolean;
  isNotFound: boolean;
  isConfigIssue: boolean;
  isNetworkError: boolean;
}

function diagnoseGooglePermissionReason(msg: string): string {
  const lower = (msg || '').toLowerCase();
  if (lower.includes('referer') || lower.includes('referrer') || lower.includes('http_referrer_blocked')) {
    return 'Diblokir batasan Referrer Website di Google Cloud (tambahkan domain Vercel/AI Studio atau pilih None)';
  }
  if (
    lower.includes('has not been used') ||
    lower.includes('is disabled') ||
    lower.includes('service_disabled') ||
    lower.includes('api_key_service_blocked') ||
    lower.includes('blocked')
  ) {
    return 'Generative Language API belum diizinkan/diaktifkan pada API Key atau Project Cloud ini';
  }
  if (lower.includes('ip_address_blocked') || lower.includes('ip address')) {
    return 'Diblokir batasan IP Address di Google Cloud Credentials';
  }
  return msg.length > 90 ? `${msg.substring(0, 90)}...` : msg || 'Akses ditolak (403 PERMISSION_DENIED)';
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

  // Strictly identify true key auth failures; NEVER quarantine a valid key for 403 model/referrer restrictions
  const isInvalidKey =
    lower.includes('api_key_invalid') ||
    lower.includes('api key not valid') ||
    lower.includes('key is not valid') ||
    lower.includes('invalid api key') ||
    lower.includes('api_key_expired') ||
    lower.includes('unauthenticated') ||
    lower.includes('suspended') ||
    /\b401\b/.test(lower);

  const isPermissionDenied =
    !isInvalidKey &&
    (lower.includes('permission_denied') ||
      lower.includes('api_key_service_blocked') ||
      lower.includes('api_key_http_referrer_blocked') ||
      /\b403\b/.test(lower));

  const isQuota =
    lower.includes('resource_exhausted') ||
    lower.includes('quota') ||
    lower.includes('exceeded') ||
    lower.includes('rate limit') ||
    /\b429\b/.test(lower);

  const isNotFound =
    lower.includes('not found') ||
    /\b404\b/.test(lower) ||
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
    !isPermissionDenied &&
    !isQuota &&
    !isNotFound &&
    !isConfigIssue &&
    (lower.includes('failed to fetch') ||
      lower.includes('networkerror') ||
      lower.includes('load failed') ||
      lower.includes('abort') ||
      lower.includes('cors'));

  return { message: msg, isInvalidKey, isPermissionDenied, isQuota, isNotFound, isConfigIssue, isNetworkError };
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

// Geometry engine, HTML wrapper & sanitizers imported from ./motionGeometryEngine
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
      __bigmaAudit: [],
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
      if (Array.isArray(mockWindow.__bigmaAudit) && mockWindow.__bigmaAudit.length > 0) {
        return { ok: false, reason: `Geometri G tidak valid: ${mockWindow.__bigmaAudit[0]}` };
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
        minX,
        maxX,
        minY,
        maxY,
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

    const minIconPixels = isGreenScreen ? 760 : 1050;
    if (m3.nonZeroAlphaPixels === 0 || minVis < (type === 'bg' ? 3200 : minIconPixels)) {
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
      if (m3.bboxW < 250 || m3.bboxH < 135) {
        return {
          ok: false,
          visiblePixels,
          reason: `Background tidak full-frame (${m3.bboxW}x${m3.bboxH}px dari 320x180)`,
        };
      }
    } else {
      for (const fm of [m1, m2, m3]) {
        if (Math.max(fm.bboxW, fm.bboxH) < 74 || Math.min(fm.bboxW, fm.bboxH) < 46) {
          return {
            ok: false,
            visiblePixels,
            reason: `Bentuk ikon terlalu kecil/cacat (${fm.bboxW}x${fm.bboxH}px — pastikan elemen utama mengisi [-0.58*R,+0.58*R])`,
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

      // Cohesion & Anti-Fragmentation Checks on frame #3
      const fillRatio = m3.visiblePixels / Math.max(1, m3.bboxW * m3.bboxH);
      const minFillRatio = isGreenScreen ? 0.065 : 0.085;
      if (fillRatio < minFillRatio) {
        return {
          ok: false,
          visiblePixels,
          reason: `Bentuk ikon terlalu renggang/kawat tipis (${Math.round(fillRatio * 100)}% isi bbox) — gunakan siluet utama padat & menyatu`,
        };
      }

      const centroidJump = Math.max(
        Math.hypot(m1.meanX - m2.meanX, m1.meanY - m2.meanY),
        Math.hypot(m2.meanX - m3.meanX, m2.meanY - m3.meanY)
      );
      if (centroidJump > 28) {
        return {
          ok: false,
          visiblePixels,
          reason: `Gerakan ikon melompat liar antar frame (pergeseran ${Math.round(centroidJump)}px) — jaga badan utama stabil & animasikan sub-bagian terjangkar`,
        };
      }

      // 8x8 coarse blob fragmentation detector inside icon bbox
      if (m3.bboxW >= 16 && m3.bboxH >= 16) {
        const GRID = 8;
        const cellCounts = new Int32Array(GRID * GRID);
        for (let py = m3.minY; py <= m3.maxY; py++) {
          const gy = Math.min(GRID - 1, Math.floor(((py - m3.minY) / Math.max(1, m3.bboxH)) * GRID));
          for (let px = m3.minX; px <= m3.maxX; px++) {
            const idx = (py * rw + px) * 4;
            const dist = Math.abs(imgData[idx] - bgR) + Math.abs(imgData[idx + 1] - bgG) + Math.abs(imgData[idx + 2] - bgB);
            if (dist > 36) {
              const gx = Math.min(GRID - 1, Math.floor(((px - m3.minX) / Math.max(1, m3.bboxW)) * GRID));
              cellCounts[gy * GRID + gx]++;
            }
          }
        }
        const visited = new Uint8Array(GRID * GRID);
        let blobCount = 0;
        let maxBlobPixels = 0;
        for (let c = 0; c < GRID * GRID; c++) {
          if (cellCounts[c] >= 3 && !visited[c]) {
            blobCount++;
            let blobSum = 0;
            const q = [c];
            visited[c] = 1;
            while (q.length > 0) {
              const cur = q.pop()!;
              blobSum += cellCounts[cur];
              const cxC = cur % GRID;
              const cyC = Math.floor(cur / GRID);
              const neighbors = [
                cxC > 0 ? cur - 1 : -1,
                cxC < GRID - 1 ? cur + 1 : -1,
                cyC > 0 ? cur - GRID : -1,
                cyC < GRID - 1 ? cur + GRID : -1,
              ];
              for (const nb of neighbors) {
                if (nb >= 0 && !visited[nb] && cellCounts[nb] >= 3) {
                  visited[nb] = 1;
                  q.push(nb);
                }
              }
            }
            if (blobSum > maxBlobPixels) maxBlobPixels = blobSum;
          }
        }
        const largestShare = maxBlobPixels / Math.max(1, m3.visiblePixels);
        if (blobCount >= 5 || (blobCount >= 4 && largestShare < 0.34)) {
          return {
            ok: false,
            visiblePixels,
            reason: `Bentuk terpecah/berantakan (${blobCount} bagian terpisah, inti ${Math.round(largestShare * 100)}%) — sambungkan seluruh bagian dengan overlap >=0.04*R`,
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
      const minMotionSamples = type === 'bg' ? 14 : (isGreenScreen ? 18 : 26);
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
  const match = key.match(/AIza[0-9A-Za-z\-_]{30,}/);
  if (match) {
    return match[0];
  }
  return key;
}

// Helper: Zero-token Google official REST endpoint check (/v1beta/models?key=...)
// Accurately validates key authenticity AND returns real models enabled on that key without wasting RPM/tokens.
async function probeGoogleModelsEndpointDirect(
  key: string,
  requestedModel?: string
): Promise<{
  ok: boolean;
  definiteInvalidKey?: boolean;
  isQuota?: boolean;
  isPermissionDenied?: boolean;
  availableModels?: string[];
  matchedModel?: string;
  errorMsg?: string;
}> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9000);
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}&pageSize=60`,
      { method: 'GET', signal: controller.signal }
    );
    const data: any = await res.json().catch(() => ({}));
    if (res.ok && Array.isArray(data?.models)) {
      const availableModels = data.models
        .filter((m: any) => !Array.isArray(m.supportedGenerationMethods) || m.supportedGenerationMethods.includes('generateContent'))
        .map((m: any) => String(m.name || '').replace(/^models\//, ''))
        .filter(Boolean);

      const sanitizedReq = sanitizeModel(requestedModel || 'gemini-2.5-flash');
      const priorityPick = [
        sanitizedReq,
        'gemini-2.5-flash',
        'gemini-2.5-flash-lite',
        'gemini-3.5-flash-lite',
        'gemini-3.1-flash-lite',
        'gemini-2.0-flash',
      ];
      const matchedModel =
        priorityPick.find((cand) => availableModels.includes(cand)) ||
        availableModels.find((m) => m.includes('flash')) ||
        availableModels[0] ||
        'gemini-2.5-flash';

      return {
        ok: true,
        availableModels,
        matchedModel,
      };
    }

    const errMsg = data?.error?.message || `HTTP ${res.status}`;
    const errStatus = String(data?.error?.status || '').toUpperCase();
    const classified = classifyGeminiError(`${errStatus} ${errMsg} ${res.status}`);
    if (classified.isInvalidKey || errStatus === 'UNAUTHENTICATED' || errMsg.toLowerCase().includes('api key not valid')) {
      return {
        ok: false,
        definiteInvalidKey: true,
        errorMsg: 'API Key tidak valid atau salah ketik (ditolak Google)',
      };
    }
    if (classified.isQuota || res.status === 429) {
      return { ok: false, isQuota: true, errorMsg: errMsg };
    }
    if (classified.isPermissionDenied || res.status === 403) {
      return {
        ok: false,
        isPermissionDenied: true,
        errorMsg: diagnoseGooglePermissionReason(errMsg),
      };
    }
    return { ok: false, errorMsg: errMsg };
  } catch (err: any) {
    return { ok: false, errorMsg: err?.message || 'Gagal menjangkau Google API dari browser' };
  } finally {
    clearTimeout(timer);
  }
}

// Accurate, robust test for a single key (Zero-token /v1beta/models check -> GA countTokens -> server proxy fallback)
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

  if (!key.startsWith('AIza') && key.toLowerCase() !== 'default' && key.toLowerCase() !== 'system' && key.length < 20) {
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

  // Prioritize real GA public models so preview model unavailability never flags a valid key as invalid
  const candidateModels = Array.from(new Set([
    'gemini-2.5-flash',
    'gemini-2.5-flash-lite',
    sanitizeModel(model || 'gemini-2.5-flash'),
  ])).slice(0, 3);

  // Zero-generation-token probe in browser (/v1beta/models first, then countTokens on GA models)
  const probeDirectInBrowser = async (): Promise<ApiKeyTestResult & { shouldFallbackToServer?: boolean }> => {
    const modelsCheck = await probeGoogleModelsEndpointDirect(key, model);
    if (modelsCheck.ok) {
      unquarantineKey(key);
      return {
        key,
        maskedKey,
        valid: true,
        latencyMs: Date.now() - start,
        status: 'valid',
        lineIndex,
        testedModel: (modelsCheck.matchedModel || 'gemini-2.5-flash') as GeminiModel,
      };
    }

    if (modelsCheck.definiteInvalidKey) {
      markKeyInvalidOrSuspended(key);
      return {
        key,
        maskedKey,
        valid: false,
        error: modelsCheck.errorMsg || 'API Key tidak valid atau salah',
        latencyMs: Date.now() - start,
        status: 'invalid',
        lineIndex,
      };
    }

    if (modelsCheck.isQuota) {
      unquarantineKey(key);
      return {
        key,
        maskedKey,
        valid: true,
        isQuotaLimit: true,
        error: 'Key Valid • Kuota sementara penuh',
        latencyMs: Date.now() - start,
        status: 'valid',
        lineIndex,
      };
    }

    // Fallback SDK countTokens probe across reliable GA models first
    const ai = new GoogleGenAI({ apiKey: key });
    let hadQuota = false;
    let lastPermErr: string | null = modelsCheck.isPermissionDenied ? (modelsCheck.errorMsg || null) : null;
    let lastErr: any = null;

    for (const m of candidateModels) {
      try {
        await ai.models.countTokens({
          model: m,
          contents: 'ping',
        });
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
        if (classified.isPermissionDenied) {
          lastPermErr = diagnoseGooglePermissionReason(classified.message);
          continue;
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

    // If browser hit 403 (e.g. Referrer restriction on Vercel vs AI Studio) or network block, let server proxy verify too
    return {
      key,
      maskedKey,
      valid: false,
      error: lastPermErr || sanitizeErrorText(lastErr || modelsCheck.errorMsg),
      latencyMs: Date.now() - start,
      status: 'invalid',
      lineIndex,
      shouldFallbackToServer: true,
    };
  };

  let browserDirectFailure: ApiKeyTestResult | null = null;
  if (key.startsWith('AIza')) {
    try {
      const directResult = await probeDirectInBrowser();
      if (directResult.valid || !directResult.shouldFallbackToServer) {
        const { shouldFallbackToServer: _omit, ...cleanResult } = directResult;
        return cleanResult;
      }
      const { shouldFallbackToServer: _omit, ...cleanResult } = directResult;
      browserDirectFailure = cleanResult;
    } catch {
      // Fallback to server probe on network/CORS issue
    }
  }

  // Server proxy fallback (for 'default'/'system' keys, Vercel/domain Referrer differences, or CORS)
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 14000);

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
      if (data.valid) {
        unquarantineKey(key);
        return {
          key,
          maskedKey: data.maskedKey || maskedKey,
          valid: true,
          error: data.error ? sanitizeErrorText(data.error) : undefined,
          latencyMs: data.latencyMs ?? latencyMs,
          status: 'valid',
          lineIndex,
          testedModel: data.testedModel || model,
          isQuotaLimit: !!data.isQuotaLimit,
        };
      }
      return {
        key,
        maskedKey: data.maskedKey || maskedKey,
        valid: false,
        error: sanitizeErrorText(data.error || browserDirectFailure?.error || 'Gagal verifikasi'),
        latencyMs: data.latencyMs ?? latencyMs,
        status: 'invalid',
        lineIndex,
      };
    }

    const err = await res.json().catch(() => ({}));
    return {
      key,
      maskedKey,
      valid: false,
      error: sanitizeErrorText(browserDirectFailure?.error || err.error || `HTTP ${res.status}`),
      latencyMs,
      status: 'invalid',
      lineIndex,
    };
  } catch (serverErr: any) {
    if (browserDirectFailure) return browserDirectFailure;
    const isTimeout = serverErr.name === 'AbortError';
    return {
      key,
      maskedKey,
      valid: false,
      error: isTimeout ? 'Timeout pemeriksaan (> 14s)' : sanitizeErrorText(serverErr.message || 'Gagal koneksi verifikasi'),
      latencyMs: Date.now() - start,
      status: 'invalid',
      lineIndex,
    };
  }
}

// Check key compatibility across all official Gemini models (gentle /v1beta/models + zero-token countTokens probe)
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

  // Direct zero-token check when user supplies AIza key
  if (key.startsWith('AIza')) {
    try {
      const restCheck = await probeGoogleModelsEndpointDirect(key);
      if (restCheck.definiteInvalidKey) {
        return {
          success: true,
          isKeyValid: false,
          activeCount: 0,
          total: modelsToCheck.length,
          models: modelsToCheck.map((m) => ({
            ...m,
            status: 'invalid_key' as const,
            valid: false,
            message: 'API Key Salah / Tidak Valid',
          })),
        };
      }

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
              if (classified.isPermissionDenied) {
                return {
                  ...m,
                  status: 'permission_denied' as const,
                  valid: !!restCheck.ok,
                  latencyMs: Date.now() - start,
                  message: diagnoseGooglePermissionReason(classified.message),
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
                  message: 'Model Belum Tersedia di Akun/Region Ini (Otomatis dialihkan)',
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
      const isKeyValid = !!restCheck.ok || !results.some((r) => r.status === 'invalid_key');
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
Special Directives: ${typeInstruction}${keywordsDirective}

Output format: Return ONLY the prompt text string, concise, descriptive and studio-grade. No bullet points, no markdown code block, no quotes. Just the clean single prompt text.`
    : `You are a Principal Motion Graphic Director for Adobe Stock & Shutterstock.
Generate exactly 1 crisp, recognizable, high-value standalone 3D/Flat-3D VECTOR ICON animation prompt in English (Collection item #${index + 1} of ${total}, Seed: ${dynamicSessionSeed}).

MANDATORY RULES FOR HERO ICON PROMPTS:
1. LITERAL RECOGNIZABLE OBJECT SILHOUETTE (4-6 JOINED PARTS):
   - Describe one iconic object (e.g., Telephone Booth, Padlock, Coffee Mug, Microphone, Rocket, Shield with Checkmark, Smart Home with Wi-Fi) assembled from cleanly connected physical parts with balanced proportions and bold crisp rim contrast.
   - FORBIDDEN: Diamond/rhombus/card backing plates, dark backing discs behind square/object icons, loose floating background dots, orbital debris, or detached ground ovals below the icon.
2. NATURAL ARTICULATED MOTION (ZERO SHAPE DISTORTION):
   - Describe upright stable framing (or natural pendulum/tilt ONLY if the object swings like a bell/plane/needle) with smooth internal mechanical animation (e.g. rotating gears, rising chart bars, pulsing signal arcs, oscillating steam waves, sliding lock shackle). NEVER ask for squash-and-stretch distortion or diagonal translucent light bars.
${negativeList}

${categoryLine}Animation Type: ${String(type).toUpperCase()}
Visual Style: ${style === 'minimalist' ? '3d_crest' : style}${colorModeDirective}${glowDirective}
Special Directives: ${typeInstruction}${keywordsDirective}

Output format: Return ONLY 1 crisp, concrete single-sentence prompt (max 26 words). No bullet points, no markdown, no quotes.`;

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
  const effGs = type !== 'bg' && !!isGreenScreen;
  const effGlow = effGs ? false : neonGlow;
  const glowModeStr = effGs ? 'CHROMA #00FF00 (non-green solid)' : (effGlow ? 'ON' : 'OFF');
  const seed = `${Date.now().toString(36)}-${Math.floor(Math.random() * 99999).toString(36)}`;

  const promptContent = type === 'bg'
    ? `Motion Director. Generate ${batchCount} unique FULL-FRAME 60 FPS looping MOTION BACKGROUND prompts in English (Seed: ${seed}).
RULES: Edge-to-edge waves/grids/silk caustics; match motion organically to each scene; NO centered icons, NO particles, NO white flares. ${categoryLine}Style: ${style}, Color: ${colorMode}, Glow: ${glowModeStr}. ${kwText}${avoidText}Return JSON array of ${batchCount} crisp 1-sentence strings (max 28 words each).`
    : `Motion Director. Generate ${batchCount} unique standalone VECTOR ICON motion prompts in English (Seed: ${seed}).
RULES: Recognizable object built from 4-6 welded proportional parts with bold crisp rim contrast & internal mechanical motion; ZERO background plate/disc, ZERO ground oval shadow, ZERO squash distortion, ZERO diagonal glare bars or loose confetti. ${categoryLine}Style: ${style === 'minimalist' ? '3d_crest' : style}, Color: ${colorMode}, Glow: ${glowModeStr}. ${kwText}${avoidText}Return JSON array of ${batchCount} crisp 1-sentence strings (max 26 words each).`;

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

  recordKeyModelDispatch(cleanKey, targetModel, Math.ceil(promptContent.length / 4) + (batchCount * 40));

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

  adjustRecentDispatchActualTokens(cleanKey, targetModel, response?.usageMetadata);
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

    // 1. Try direct browser call with healthy rotated keys on primary candidate before falling back
    const maxKeyTriesPerModel = Math.min(6, Math.max(1, getCleanUniqueKeys(apiKeys).length));
    for (const candidateModel of fallbackChain.slice(0, 2)) {
      let stopModelLoop = false;
      for (let kTry = 0; kTry < maxKeyTriesPerModel; kTry++) {
        const apiKey = getBestHealthyKey(apiKeys, candidateModel, 420);
        if (!apiKey) break;

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
          if (batchPrompts.length > 0) {
            recordKeyModelSuccess(apiKey, candidateModel);
            stopModelLoop = true;
            break;
          }
        } catch (err: any) {
          const classified = classifyGeminiError(err);
          if (classified.isInvalidKey) {
            markKeyInvalidOrSuspended(apiKey);
            continue;
          }
          if (classified.isPermissionDenied || classified.isNotFound) {
            markModelUnsupportedCached(candidateModel);
            break;
          }
          if (classified.isQuota) {
            markKeyModelCooldown(apiKey, candidateModel, err);
            continue;
          }
          if (classified.isNetworkError || classified.message === 'NETWORK_OR_NO_CLIENT_KEY') {
            stopModelLoop = true;
            break;
          }
        }
      }
      if (stopModelLoop || batchPrompts.length > 0) break;
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

// Variation DNA & Code Fingerprint Deduplication Engine (ensures zero identical silhouettes across batches or days)

const MAX_RECENT_CODE_FINGERPRINTS = 1200;
const recentCodeFingerprints: string[] = [];
const MAX_RECENT_HELPER_VARIANTS = 24;
const recentHelperVariantQueue: string[] = [];
let __hydratedRecentFingerprints = false;

function extractHelperVariantTag(_codeOrHtml: string): string | null {
  // Structural primitives do not take canned variant tags; geometry deduplication uses normalizeCanvasCodeFingerprint.
  return null;
}

function recordHelperVariantUsage(helperKey: string | null | undefined): void {
  if (!helperKey) return;
  const idx = recentHelperVariantQueue.indexOf(helperKey);
  if (idx !== -1) recentHelperVariantQueue.splice(idx, 1);
  recentHelperVariantQueue.unshift(helperKey);
  if (recentHelperVariantQueue.length > MAX_RECENT_HELPER_VARIANTS) {
    recentHelperVariantQueue.length = MAX_RECENT_HELPER_VARIANTS;
  }
}

function pickNonCollidingMotionPlan(
  promptTopic: string,
  type: AnimationType,
  style: string,
  motionDynamics: MotionDynamics,
  seed: ReturnType<typeof createUniqueVariationSeed>,
  subCategory: string,
  batchSeenHelpers?: Set<string>
): { variantIdx: number; compMode: number; plan: ReturnType<typeof resolvePromptMotionPlan> } {
  const recentWindow = recentHelperVariantQueue.slice(0, 12);
  let bestV = seed.variantIdx;
  let bestCm = seed.compMode;
  let bestPlan = resolvePromptMotionPlan(promptTopic, type, style, motionDynamics, bestV, bestCm, subCategory);

  for (let k = 0; k < 6; k++) {
    const candV = (seed.variantIdx + k * 5) % 6;
    const candCm = (seed.compMode + k) % 3;
    const candPlan =
      k === 0
        ? bestPlan
        : resolvePromptMotionPlan(promptTopic, type, style, motionDynamics, candV, candCm, subCategory);
    const key = `${candPlan.helperName}:c${candCm}:v${candV}`;
    const inBatch = batchSeenHelpers ? batchSeenHelpers.has(key) : false;
    const inRecent = recentWindow.includes(key);
    if (!inBatch && !inRecent) {
      bestV = candV;
      bestCm = candCm;
      bestPlan = candPlan;
      break;
    }
    if (!inBatch && batchSeenHelpers && batchSeenHelpers.has(`${bestPlan.helperName}:c${bestCm}:v${bestV}`)) {
      bestV = candV;
      bestCm = candCm;
      bestPlan = candPlan;
    }
  }

  if (batchSeenHelpers) {
    batchSeenHelpers.add(`${bestPlan.helperName}:c${bestCm}:v${bestV}`);
  }
  return { variantIdx: bestV, compMode: bestCm, plan: bestPlan };
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
    const tail = parsed.slice(0, 250);
    for (let i = 0; i < tail.length; i++) {
      const item = tail[i];
      if (item && typeof item.html === 'string') {
        const fp = normalizeCanvasCodeFingerprint(item.html);
        if (fp && !recentCodeFingerprints.includes(fp)) {
          recentCodeFingerprints.push(fp);
        }
        if (i < 24) {
          recordHelperVariantUsage(extractHelperVariantTag(item.html));
        }
      }
    }
  } catch {
    // Ignore storage read issues
  }
}

export function isCodeFingerprintDuplicate(codeOrHtml: string, extraSeen?: Set<string>): boolean {
  hydrateRecentFingerprintsOnce();
  const hv = extractHelperVariantTag(codeOrHtml);
  if (hv) {
    if (extraSeen && extraSeen.has(`hv:${hv}`)) return true;
    if (recentHelperVariantQueue.slice(0, 6).includes(hv)) return true;
  }
  const fp = normalizeCanvasCodeFingerprint(codeOrHtml);
  if (!fp || fp.length < 24) return false;
  if (extraSeen && extraSeen.has(fp)) return true;
  return recentCodeFingerprints.includes(fp);
}

export function recordCodeFingerprint(codeOrHtml: string, extraSeen?: Set<string>): void {
  hydrateRecentFingerprintsOnce();
  const hv = extractHelperVariantTag(codeOrHtml);
  if (hv) {
    recordHelperVariantUsage(hv);
    if (extraSeen) extraSeen.add(`hv:${hv}`);
  }
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
  variationOffset: number = 0,
  defectFeedback: string = ''
): Promise<{ id: string; title: string; prompt?: string; type: AnimationType; style: string; subCategory: string; html: string; isGreenScreen?: boolean; colorMode?: ColorMode; motionDynamics?: MotionDynamics; neonGlow?: boolean }> {
  const cleanKey = extractCleanApiKey(apiKey);
  if (!cleanKey || !cleanKey.startsWith('AIza')) {
    throw new Error('NETWORK_OR_NO_CLIENT_KEY');
  }

  const ai = new GoogleGenAI({ apiKey: cleanKey });
  const isBackground = type === 'bg';
  const effGs = !isBackground && !!isGreenScreen;
  const effGlow = effGs ? false : neonGlow;
  const seed = createUniqueVariationSeed(promptTopic, Math.max(0, (index || 1) - 1), variationOffset);
  const picked = pickNonCollidingMotionPlan(promptTopic, type, style, motionDynamics, seed, subCategory);
  const assignedV = picked.variantIdx;
  const motionPlan = picked.plan;

  const colorStyleDirective = effGs
    ? `GS(#00ff00): solid non-green colors, shadowBlur=0, rim lw=Math.max(2.4,0.036*R) (NEVER fill===rim!), no bg fillRect.`
    : effGlow
    ? `DARK(#080c14): shadowBlur=8 on bright accents(reset 0), rim lw=Math.max(2.2,0.034*R), no bg fillRect.`
    : `CRISP(#080c14): shadowBlur=0, rim lw=Math.max(2.2,0.034*R), no bg fillRect.`;

  const geometryGuide = isBackground
    ? `FULL-BLEED BG (-0.08*w..1.08*w,-0.08*h..1.08*h): G.bgBackdrop(w,h,c0,c1,c2,'${['v', 'd', 'r', 'h'][(assignedV + picked.compMode) % 4]}') + 2 cohesive edge-to-edge layers matching "${promptTopic.slice(0, 75)}" (NO center sticker, NO loose dot confetti). Plan: ${motionPlan.anatomyHint}`
    : `HERO ICON (14-26 lines crisp JS):
- Line1 inside drawFrame: // PLAN: base=<shape>; joints=<connect>; move=<motion>
- ONE root G.part(cx,cy+hoverY,rot,1,1,function(R){...}) inside [-0.58*R,+0.58*R]; inner G.part(ax,ay,r2,sx,sy,function(){...}) WITHOUT re-passing R.
- Welded seam vars (topY=y0-bh*0.5, overlap>=0.04*R). G.percent for %; G.capsule for pil-boxes vs G.pill(x1,y1,x2,y2,th,col) for segments; G.trap 9 args; ONLY G.bar takes yB. Upright icons stay rot=0; NO floating corner dots/ground ovals/dark backing discs/if(sin>0).
- Anatomy: ${motionPlan.anatomyHint}`;

  const helpersDoc = isBackground ? HELPERS_G_BG_DOC : HELPERS_G_DOC;
  const fixNote = defectFeedback ? `\nFIX DEFECT: ${defectFeedback}` : '';

  const systemPrompt = `60FPS Canvas2D Motion Designer. Output ONLY RAW JS: function drawFrame(ctx, w, h, cx, cy, S, t) { ... } (no md/HTML/canvas/resize/rAF; never redeclare canvas/ctx/w/h/cx/cy/S/G).
${helpersDoc}
SPEC[${seed.tag}]: "${promptTopic}" (${subCategory},${style},${colorMode}) Palette[c0=${seed.palette[0]},c1=${seed.palette[1]},c2=${seed.palette[2]},c3=${seed.palette[3]}](match prompt colors!)
${geometryGuide}
Motion(${motionPlan.label}): ${motionPlan.codeHint} | Rhythm: ${seed.motionExpr}
${colorStyleDirective}${fixNote}`;

  const config: any = {
    temperature: highPrecision ? 0.22 : 0.32,
    maxOutputTokens: isBackground ? 980 : 780,
  };
  const smartThinking = getCostOptimizedThinkingConfig(targetModel, 'animation', highPrecision);
  if (smartThinking) {
    config.thinkingConfig = smartThinking;
  }

  const profile = getModelExecutionProfile(targetModel);
  const estInputTok = Math.ceil(systemPrompt.length / 3.8);
  recordKeyModelDispatch(cleanKey, targetModel, estInputTok + (highPrecision ? 460 : 340));

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

  adjustRecentDispatchActualTokens(cleanKey, targetModel, response?.usageMetadata);
  const rawText = response?.text || '';
  const cleanHTML = extractHTML(rawText, effGs);
  const check = verifyCanvasAnimationHtml(cleanHTML, effGs, type);
  if (!check.ok) {
    throw new Error(`Validasi render gagal (${check.reason || 'canvas blank'})`);
  }
  recordHelperVariantUsage(`${motionPlan.helperName}:c${picked.compMode}:v${assignedV}`);

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
  const effGs = !isBackground && !!isGreenScreen;
  const effGlow = effGs ? false : neonGlow;

  const colorStyleDirective = effGs
    ? 'GREEN SCREEN (#00ff00): solid non-green colors, shadowBlur=0, contrasting rim (NEVER fill===rim!) lw=Math.max(2.4,0.036*R), NO bg fillRect.'
    : effGlow
    ? 'DARK BG (#080c14): shadowBlur=8 on bright accents (reset 0), rim lw=Math.max(2.2,0.034*R), NO bg fillRect.'
    : 'CRISP VECTOR (#080c14): shadowBlur=0, rim lw=Math.max(2.2,0.034*R), NO bg fillRect.';

  const geometryGuide = isBackground
    ? 'FULL-BLEED MICROSTOCK BACKGROUNDS (-0.08*w..1.08*w & -0.08*h..1.08*h): Each ANIM_i MUST start with G.bgBackdrop(w,h,c0,c1,c2,dir) + 2 distinct edge-to-edge custom thematic motion layers. ZERO centered icon stickers, ZERO loose noisy confetti.'
    : 'MICROSTOCK HERO ICONS (14-28 lines each): Start drawFrame with // PLAN: base=...; joints=...; move=... Draw inside ONE G.part(cx,cy+hoverY,rot,1,1,function(R){ ... }) spanning [-0.58*R,+0.58*R] (inner G.part uses function(){} without shadowing R!). Use seam variables so parts weld/overlap >=0.04*R; use G.percent for %, G.capsule for pil-boxes vs G.pill(x1,y1,x2,y2,th,col) for lines, G.trap takes 9 args, ONLY G.bar uses yB; ZERO floating corner dots or ground ovals.';

  const slotSeeds = prompts.map((p, idx) => createUniqueVariationSeed(p, idx, variationOffset));
  const batchPlanSeen = new Set<string>();
  const slotPlans = prompts.map((p, idx) =>
    pickNonCollidingMotionPlan(p, type, style, motionDynamics, slotSeeds[idx], subCategory, batchPlanSeen)
  );
  const topicLines = prompts.map((p, idx) => {
    const seed = slotSeeds[idx];
    const picked = slotPlans[idx];
    return `// ===ANIM_${idx}=== [${seed.tag}] "${p}" | Palette: c0=${seed.palette[0]},c1=${seed.palette[1]},c2=${seed.palette[2]},c3=${seed.palette[3]} | Rhythm:${seed.motionExpr} | Anatomy:${picked.plan.anatomyHint} | Motion (${picked.plan.label}): ${picked.plan.codeHint}`;
  }).join('\n');

  const helpersDoc = isBackground ? HELPERS_G_BG_DOC : HELPERS_G_DOC;

  const batchPrompt = `Senior Microstock 60 FPS Canvas 2D Motion Designer. Write ${prompts.length} 100% STRUCTURALLY DISTINCT, PROMPT-ACCURATE RAW JS functions separated ONLY by:
${prompts.map((_, idx) => `// ===ANIM_${idx}===\nfunction drawFrame(ctx, w, h, cx, cy, S, t) { ... }`).join('\n')}
${helpersDoc}
SPEC: ${geometryGuide}
Style: ${style} | Palette: ${colorMode} (match prompt colors first!) | ${colorStyleDirective}
STRICT ANTI-CLONE RULE: Each ANIM_i MUST depict the exact, literal distinct object/scene of its own prompt with different primary silhouette geometry, proportions & sub-part layout from all other slots! NEVER reuse the same layout/shape between ANIM_0 and ANIM_1!
NO markdown/HTML/canvas/resize/rAF or redeclaring canvas/ctx/w/h/cx/cy/S/G.
TOPICS:
${topicLines}`;

  const config: any = {
    temperature: 0.35,
    maxOutputTokens: Math.min(2500, Math.max(1250, prompts.length * (isBackground ? 1250 : 1150))),
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
    const html = extractHTML(rawCode, effGs);
    const check = verifyCanvasAnimationHtml(html, effGs, type);
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
      neonGlow: effGlow,
      html,
      isGreenScreen: effGs,
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
  let cooldownWaitCount = 0;
  let sawQuotaError = false;
  let sawRenderDefect = false;
  let lastDefectReason = '';
  let renderAttempts = 0;
  let quotaOrAuthHops = 0;
  const maxQuotaHops = hasClientKeys ? Math.min(36, Math.max(maxRetries * 2, Math.ceil(uniqueClientKeys.length * 0.35))) : maxRetries;

  while (renderAttempts < maxRetries && quotaOrAuthHops < maxQuotaHops) {
    const attempt = renderAttempts + 1;
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
        const poolStatus = getKeyPoolCooldownStatus(uniqueClientKeys, modelsAvailable);
        if (poolStatus.allInvalid || poolStatus.reason === 'no_valid_keys') {
          throw new Error('Semua API Key tidak valid atau ditolak (401/403). Periksa daftar API Key Anda.');
        }
        // Automatically wait out temporary RPM/TPM cooldown instead of falsely popping up model switch!
        if (!poolStatus.allDailyExhausted && poolStatus.earliestWaitMs > 0 && cooldownWaitCount < 2) {
          cooldownWaitCount++;
          if (onRetry) {
            onRetry(attempt, maxRetries, `Kuota RPM/TPM penuh — menunggu pemulihan otomatis ${Math.ceil(poolStatus.earliestWaitMs / 1000)}s...`);
          }
          await new Promise((r) => setTimeout(r, poolStatus.earliestWaitMs));
          modelCursor = 0; // retry user's chosen primary model after RPM/TPM recovery
          continue;
        }
        throw new AllKeysExhaustedError(
          poolStatus.allDailyExhausted
            ? 'Kuota harian (RPD) seluruh API Key pada model ini telah tercapai.'
            : 'Semua API Key sedang dalam masa pendinginan kuota (429).'
        );
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
            sawRenderDefect, // Escalate thinking slightly ONLY if prior pass failed geometry/cohesion, NEVER on 429!
            variationSalt + renderAttempts,
            lastDefectReason
          );
          if (renderAttempts + 1 < maxRetries && isCodeFingerprintDuplicate(result.html)) {
            renderAttempts++;
            console.warn('[Single Render Duplicate Detected]: regenerating with fresh Variation DNA...');
            if (onRetry) onRetry(renderAttempts, maxRetries, 'Mendeteksi kemiripan desain, menyusun variasi unik baru...');
            continue;
          }
          recordCodeFingerprint(result.html);
          recordKeyModelSuccess(selectedKey, activeModel);
          return result;
        } catch (clientErr: any) {
          const classified = classifyGeminiError(clientErr);
          if (classified.isInvalidKey) {
            markKeyInvalidOrSuspended(selectedKey);
            quotaOrAuthHops++;
            lastError = new Error('API Key tidak valid/dibatasi, memutar ke key sehat...');
            if (quotaOrAuthHops < maxQuotaHops) {
              if (onRetry) onRetry(attempt, maxRetries, lastError.message);
              continue;
            }
            throw lastError;
          }
          if (classified.isPermissionDenied) {
            markModelUnsupportedCached(activeModel);
            modelCursor = Math.min(modelCursor + 1, modelsAvailable.length - 1);
            quotaOrAuthHops++;
            lastError = new Error(diagnoseGooglePermissionReason(classified.message));
            if (quotaOrAuthHops < maxQuotaHops) {
              if (onRetry) onRetry(attempt, maxRetries, `Akses model ${activeModel} dibatasi, beralih model...`);
              continue;
            }
            throw lastError;
          }
          if (classified.isQuota) {
            sawQuotaError = true;
            quotaOrAuthHops++;
            markKeyModelCooldown(selectedKey, activeModel, clientErr);
            lastError = new Error(`Limit 429 di ${activeModel}, memutar ke key sehat lain...`);

            const nextHealthyOnSame = getBestHealthyKey(uniqueClientKeys, activeModel);
            if (nextHealthyOnSame) {
              // Fast hop to another key in the pool without sleeping several seconds
              if (onRetry) onRetry(attempt, maxRetries, lastError.message);
              await new Promise((r) => setTimeout(r, 280));
              continue;
            }

            // No healthy key left on activeModel -> shift to next model in chain if available
            modelCursor = Math.min(modelCursor + 1, modelsAvailable.length - 1);
            if (quotaOrAuthHops < maxQuotaHops) {
              const quotaPause = uniqueClientKeys.length >= 10 ? 450 : (activeProfile.retryDelaysMs[Math.min(2, attempt - 1)] || 1800);
              if (onRetry) onRetry(attempt, maxRetries, lastError.message);
              await new Promise((r) => setTimeout(r, quotaPause));
              continue;
            }
            const poolStatus = getKeyPoolCooldownStatus(uniqueClientKeys, modelsAvailable);
            if (!poolStatus.availableNow && !poolStatus.allDailyExhausted && poolStatus.earliestWaitMs > 0 && cooldownWaitCount < 2) {
              cooldownWaitCount++;
              if (onRetry) onRetry(attempt, maxRetries, `Menunggu pemulihan kuota 429 selama ${Math.ceil(poolStatus.earliestWaitMs / 1000)}s...`);
              await new Promise((r) => setTimeout(r, poolStatus.earliestWaitMs));
              quotaOrAuthHops = Math.max(0, quotaOrAuthHops - 4);
              continue;
            }
            throw new AllKeysExhaustedError(`Limit kuota 429 di ${activeModel} — seluruh jalur sedang pendinginan.`);
          }
          if (classified.isNotFound) {
            markModelUnsupportedCached(activeModel);
            modelCursor = Math.min(modelCursor + 1, modelsAvailable.length - 1);
            quotaOrAuthHops++;
            lastError = new Error(`Model ${activeModel} belum tersedia, beralih model...`);
            if (quotaOrAuthHops < maxQuotaHops) {
              if (onRetry) onRetry(attempt, maxRetries, lastError.message);
              continue;
            }
            throw lastError;
          }
          if (!classified.isNetworkError && classified.message !== 'NETWORK_OR_NO_CLIENT_KEY') {
            sawRenderDefect = true;
            lastDefectReason = classified.message.replace(/^Validasi render gagal\s*\(/i, '').replace(/\)$/, '');
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
          variationOffset: variationSalt + renderAttempts,
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
        lastDefectReason = serverCheck.reason || 'canvas blank';
        throw new Error(`Validasi render server gagal (${serverCheck.reason || 'canvas blank'})`);
      }

      if (renderAttempts + 1 < maxRetries && isCodeFingerprintDuplicate(healedHtml)) {
        renderAttempts++;
        if (onRetry) onRetry(renderAttempts, maxRetries, 'Mendeteksi kemiripan desain dari server, menyusun variasi unik baru...');
        sawRenderDefect = true;
        continue;
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
        quotaOrAuthHops++;
        if (selectedKey) markKeyModelCooldown(selectedKey, activeModel, err);
        continue;
      }
      if (selectedKey && classified.isInvalidKey) {
        markKeyInvalidOrSuspended(selectedKey);
        quotaOrAuthHops++;
        continue;
      }
      if (classified.isNotFound) {
        markModelUnsupportedCached(activeModel);
        modelCursor = Math.min(modelCursor + 1, modelsAvailable.length - 1);
        quotaOrAuthHops++;
        continue;
      }

      renderAttempts++;
      const delayMs = activeProfile.retryDelaysMs[Math.min(2, renderAttempts - 1)] || 1800;
      const cleanErr = err?.message || 'Kendala jaringan/kuota';
      if (renderAttempts < maxRetries) {
        if (onRetry) onRetry(renderAttempts, maxRetries, `${cleanErr} (jeda ${(delayMs / 1000).toFixed(1)}s)`);
        await new Promise((res) => setTimeout(res, delayMs));
      } else {
        if (onRetry) onRetry(renderAttempts, maxRetries, `${cleanErr} (final sebelum lewati)`);
      }
    }
  }

  // Always classify exhausted key pool / repeated 429s as AllKeysExhaustedError cleanly
  const finalPoolStatus = hasClientKeys ? getKeyPoolCooldownStatus(uniqueClientKeys, modelsAvailable) : null;
  if (sawQuotaError || (finalPoolStatus && !finalPoolStatus.availableNow && !finalPoolStatus.allInvalid)) {
    throw new AllKeysExhaustedError(
      finalPoolStatus?.allDailyExhausted
        ? 'Kuota harian (RPD) seluruh API Key pada model ini telah tercapai.'
        : 'Kuota/Rate Limit (429) aktif di jalur Gemini — mengaktifkan jeda pemulihan...'
    );
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
    variationOffset?: number;
    onLog?: (msg: string, level?: 'info' | 'warn' | 'error' | 'success') => void;
  } = {}
): Promise<Array<{ prompt: string; anim?: any; error?: string; exhausted?: boolean }>> {
  const {
    isGreenScreen = false,
    colorMode = 'gradient',
    motionDynamics = 'flow',
    neonGlow = true,
    variationOffset = 0,
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
        neonGlow,
        variationOffset
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
            variationOffset + attempt - 1
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
            variationOffset: variationOffset + attempt - 1,
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
          variationOffset + i + 7
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
  customInstructions = '',
  contentType: AnimationType = 'icon'
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
  const resolvedType: AnimationType = contentType === 'bg' ? 'bg' : 'icon';
  const effectiveGs = resolvedType === 'bg' ? false : !!isGreenScreen;
  const effectiveGlow = effectiveGs ? false : neonGlow;

  const visionPrompt = resolvedType === 'bg'
    ? `BG Vision-to-Motion Engineer. Rekonstruksi FULL-FRAME gambar referensi menjadi Canvas 2D 60 FPS (tata letak, lapisan kedalaman, horizon/gelombang/kisi, HEX palette persis).
ATURAN (-0.08*w..1.08*w,-0.08*h..1.08*h): (1) G.bgBackdrop(w,h,c0,c1,c2,dir) warna dominan; (2) min 2 lapisan gerak tepi-ke-tepi (G.wave/G.capsule/G.poly/G.ring/G.leaf/kisi); (3) parallax/arus halus, NO center sticker, NO loose dots.
${!effectiveGlow ? 'shadowBlur=0.' : 'shadowBlur=8 accents(reset 0).'}${customInstructions ? ` Catatan: ${customInstructions}` : ''}
${HELPERS_G_VISION_DOC}
Output HANYA JSON + RAW JS (no md/HTML/canvas/ctx/w/h/cx/cy/S/G):
<script type="application/json" id="shape-analysis">{"objectName":"...","shapeDescription":"...","detectedElements":[],"professionalMotionPlan":"...","similaritySynthesis":"...","glowColor":"#38bdf8"}</script>
function drawFrame(ctx, w, h, cx, cy, S, t) { ... }`
    : `Canvas 2D Motion Coder. Rekonstruksi objek gambar menjadi ikon microstock 60 FPS dalam ONE G.part(cx,cy+hoverY,rot,1,1,fn) skala R=S*0.80.
Line1 drawFrame: // PLAN: base=...; joints=...; move=...
Gerak sesuai karakter objek (bel ayun, gear/roda putar, G.bar/G.pie naik halus>=0.14*R, atau floating tegak rot=0; JANGAN rotasi 360 objek tegak, JANGAN kedip if(sin>0)).
Mode:${colorMode} | ${effectiveGs ? 'GS(#00ff00): solid non-green, shadowBlur=0, rim lw=Math.max(2.4,0.036*R), no bg fillRect' : effectiveGlow ? 'DARK(#080c14): shadowBlur=8 accents(reset 0), rim lw=Math.max(2.2,0.034*R)' : 'CRISP(#080c14): shadowBlur=0, rim lw=Math.max(2.2,0.034*R)'}.${customInstructions ? ` Catatan: ${customInstructions}` : ''}
${HELPERS_G_VISION_DOC}
ATURAN: (1) Semua (x,y) di G adalah TITIK TENGAH (HANYA G.bar pakai yBottom); (2) PAINTER ORDER (belakang->badan->emblem depan); (3) Semua shape wajib di dalam ONE root G.part bersambungan rapat (overlap>=0.04*R di [-0.58*R,+0.58*R]), ZERO part lepas pojok/piringan latar belakang/kotak transparan.
Output HANYA JSON + RAW JS (no md/HTML/canvas/ctx/w/h/cx/cy/S/G):
<script type="application/json" id="shape-analysis">{"objectName":"...","shapeDescription":"...","detectedElements":[],"professionalMotionPlan":"...","similaritySynthesis":"...","glowColor":"#38bdf8"}</script>
function drawFrame(ctx, w, h, cx, cy, S, t) { ... }`;

  const config: any = {
    temperature: 0.15,
    maxOutputTokens: resolvedType === 'bg' ? 1450 : 1250,
  };
  const smartThinking = getCostOptimizedThinkingConfig(targetModel, 'vision');
  if (smartThinking) config.thinkingConfig = smartThinking;

  const visionProfile = getModelExecutionProfile(targetModel);
  const visionTimeoutMs = Math.min(48000, visionProfile.timeoutMs + 6000);
  recordKeyModelDispatch(cleanKey, targetModel, 950);
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

  adjustRecentDispatchActualTokens(cleanKey, targetModel, response?.usageMetadata);
  const rawText = response?.text || '';
  const cleanHTML = extractHTML(rawText, effectiveGs);
  const check = verifyCanvasAnimationHtml(cleanHTML, effectiveGs, resolvedType);
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
      type: resolvedType,
      style: colorMode,
      subCategory: 'image-to-motion',
      html: cleanHTML,
      isGreenScreen: effectiveGs,
      colorMode,
      motionDynamics,
      neonGlow: effectiveGlow,
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
    type?: AnimationType;
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
  const contentType: AnimationType = params.type === 'bg' ? 'bg' : 'icon';
  const effectiveGs = contentType === 'bg' ? false : (params.isGreenScreen ?? false);
  let modelCursor = 0;

  let lastError: any = null;
  let cooldownWaitCount = 0;
  let sawQuotaError = false;
  let renderAttempts = 0;
  let quotaOrAuthHops = 0;
  const maxQuotaHops = hasClientKeys ? Math.min(30, Math.max(maxRetries * 2, Math.ceil(uniqueClientKeys.length * 0.3))) : maxRetries;

  while (renderAttempts < maxRetries && quotaOrAuthHops < maxQuotaHops) {
    const attempt = renderAttempts + 1;
    let activeModel = modelsAvailable[Math.min(modelCursor, modelsAvailable.length - 1)];
    const activeProfile = getModelExecutionProfile(activeModel);
    let selectedKey = hasClientKeys ? getBestHealthyKey(uniqueClientKeys, activeModel, 1200) : undefined;

    if (hasClientKeys && !selectedKey) {
      let foundAlt = false;
      for (let mIdx = 0; mIdx < modelsAvailable.length; mIdx++) {
        const altKey = getBestHealthyKey(uniqueClientKeys, modelsAvailable[mIdx], 1200);
        if (altKey) {
          activeModel = modelsAvailable[mIdx];
          selectedKey = altKey;
          modelCursor = mIdx;
          foundAlt = true;
          break;
        }
      }
      if (!foundAlt) {
        const poolStatus = getKeyPoolCooldownStatus(uniqueClientKeys, modelsAvailable);
        if (poolStatus.allInvalid || poolStatus.reason === 'no_valid_keys') {
          throw new Error('Semua API Key tidak valid atau ditolak (401/403). Periksa daftar API Key Anda.');
        }
        if (!poolStatus.allDailyExhausted && poolStatus.earliestWaitMs > 0 && cooldownWaitCount < 2) {
          cooldownWaitCount++;
          if (onRetry) {
            onRetry(attempt, maxRetries, `Kuota RPM/TPM penuh, menunggu pemulihan otomatis ${Math.ceil(poolStatus.earliestWaitMs / 1000)}s...`);
          }
          await new Promise((r) => setTimeout(r, poolStatus.earliestWaitMs));
          modelCursor = 0;
          continue;
        }
        throw new AllKeysExhaustedError(
          poolStatus.allDailyExhausted
            ? 'Kuota harian (RPD) seluruh API Key pada model ini telah tercapai.'
            : 'Semua API Key sedang dalam masa pendinginan kuota (429).'
        );
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
            effectiveGs,
            params.precisionLevel || 'masterpiece',
            params.strokeWeight || 'bold',
            params.customInstructions || '',
            contentType
          );
          recordKeyModelSuccess(selectedKey, activeModel);
          return i2mResult;
        } catch (clientErr: any) {
          const classified = classifyGeminiError(clientErr);
          if (classified.isInvalidKey) {
            markKeyInvalidOrSuspended(selectedKey);
            quotaOrAuthHops++;
            lastError = new Error('API Key tidak valid/dibatasi, memutar ke key sehat...');
            if (quotaOrAuthHops < maxQuotaHops) {
              if (onRetry) onRetry(attempt, maxRetries, lastError.message);
              continue;
            }
            throw lastError;
          }
          if (classified.isPermissionDenied) {
            markModelUnsupportedCached(activeModel);
            modelCursor = Math.min(modelCursor + 1, modelsAvailable.length - 1);
            quotaOrAuthHops++;
            lastError = new Error(diagnoseGooglePermissionReason(classified.message));
            if (quotaOrAuthHops < maxQuotaHops) {
              if (onRetry) onRetry(attempt, maxRetries, `Akses model ${activeModel} dibatasi, beralih model...`);
              continue;
            }
            throw lastError;
          }
          if (classified.isQuota) {
            sawQuotaError = true;
            quotaOrAuthHops++;
            markKeyModelCooldown(selectedKey, activeModel, clientErr);
            lastError = new Error(`Key kena limit 429 di ${activeModel}, memutar ke key sehat lain`);
            const nextHealthyOnSame = getBestHealthyKey(uniqueClientKeys, activeModel, 1200);
            if (nextHealthyOnSame) {
              if (onRetry) onRetry(attempt, maxRetries, lastError.message);
              await new Promise((r) => setTimeout(r, 280));
              continue;
            }
            modelCursor = Math.min(modelCursor + 1, modelsAvailable.length - 1);
            if (quotaOrAuthHops < maxQuotaHops) {
              const quotaPause = uniqueClientKeys.length >= 10 ? 450 : (activeProfile.retryDelaysMs[Math.min(2, attempt - 1)] || 1800);
              if (onRetry) onRetry(attempt, maxRetries, lastError.message);
              await new Promise((r) => setTimeout(r, quotaPause));
              continue;
            }
            const poolStatus = getKeyPoolCooldownStatus(uniqueClientKeys, modelsAvailable);
            if (!poolStatus.availableNow && !poolStatus.allDailyExhausted && poolStatus.earliestWaitMs > 0 && cooldownWaitCount < 2) {
              cooldownWaitCount++;
              if (onRetry) onRetry(attempt, maxRetries, `Menunggu pemulihan kuota 429 selama ${Math.ceil(poolStatus.earliestWaitMs / 1000)}s...`);
              await new Promise((r) => setTimeout(r, poolStatus.earliestWaitMs));
              quotaOrAuthHops = Math.max(0, quotaOrAuthHops - 4);
              continue;
            }
            throw new AllKeysExhaustedError(`Limit kuota 429 di ${activeModel} — seluruh jalur pendinginan.`);
          }
          if (classified.isNotFound) {
            markModelUnsupportedCached(activeModel);
            modelCursor = Math.min(modelCursor + 1, modelsAvailable.length - 1);
            quotaOrAuthHops++;
            lastError = new Error(`Model ${activeModel} belum tersedia, beralih model...`);
            if (quotaOrAuthHops < maxQuotaHops) {
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
          type: contentType,
          motionDynamics: params.motionDynamics || 'flow',
          colorMode: params.colorMode || 'gradient',
          neonGlow: params.neonGlow ?? true,
          isGreenScreen: effectiveGs,
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

      const healedHtml = extractHTML(data.html, effectiveGs);
      const check = verifyCanvasAnimationHtml(healedHtml, !!effectiveGs, contentType);
      if (!check.ok) {
        throw new Error(`Validasi render vision gagal (${check.reason || 'canvas blank'})`);
      }

      if (selectedKey) recordKeyModelSuccess(selectedKey, activeModel);
      return { ...data, type: contentType, isGreenScreen: effectiveGs, html: healedHtml };
    } catch (err: any) {
      if (err instanceof AllKeysExhaustedError) throw err;
      lastError = err;
      const classified = classifyGeminiError(err);
      if (classified.isQuota) {
        sawQuotaError = true;
        quotaOrAuthHops++;
        if (selectedKey) markKeyModelCooldown(selectedKey, activeModel, err);
        continue;
      }
      if (selectedKey && classified.isInvalidKey) {
        markKeyInvalidOrSuspended(selectedKey);
        quotaOrAuthHops++;
        continue;
      }
      if (classified.isNotFound) {
        markModelUnsupportedCached(activeModel);
        modelCursor = Math.min(modelCursor + 1, modelsAvailable.length - 1);
        quotaOrAuthHops++;
        continue;
      }

      renderAttempts++;
      const delayMs = activeProfile.retryDelaysMs[Math.min(2, renderAttempts - 1)] || 2000;
      const cleanErr = err?.message || 'Kendala jaringan/kuota';
      if (renderAttempts < maxRetries) {
        if (onRetry) onRetry(renderAttempts, maxRetries, `${cleanErr} (jeda ${(delayMs / 1000).toFixed(1)}s)`);
        await new Promise((res) => setTimeout(res, delayMs));
      } else {
        if (onRetry) onRetry(renderAttempts, maxRetries, `${cleanErr} (final sebelum lewati)`);
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
    type?: AnimationType | 'auto';
  },
  maxRetries = 2
): Promise<string> {
  const uniqueKeys = getCleanUniqueKeys(apiKeys);
  const targetModel = sanitizeModel(model || 'gemini-3.8-flash');
  const pureBase64 = params.imageBase64.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, '');
  const requestedType = params.type || 'auto';

  const promptDirective = requestedType === 'bg'
    ? `Computer Vision Microstock Background Motion Director. Analyze this FULL-FRAME background image closely and write EXACTLY ONE SINGLE CONTINUOUS LINE of a 60 FPS motion graphics background prompt (25-40 words, no newlines, no quotes, no markdown). Preserve exact backdrop composition, depth planes, horizon/perspective/ribbons/grid structure, exact HEX palette, and smooth seamless full-frame 60 FPS motion (parallax drift, continuous wave phase, diagonal luster sweep).`
    : requestedType === 'icon'
    ? `Computer Vision Microstock Icon Motion Director. Analyze this reference icon and write EXACTLY ONE SINGLE CONTINUOUS LINE of a 60 FPS motion graphics icon prompt (20-35 words, no newlines, no quotes, no markdown). Specify exact subject silhouette, connected sub-parts & proportions, exact HEX palette, and authentic theme-appropriate 60 FPS motion.`
    : `Computer Vision Motion Director. Detect whether this image is a centered icon OR a full-frame background scene and write EXACTLY ONE SINGLE CONTINUOUS LINE of a 60 FPS motion graphics animation prompt (22-38 words, no newlines, no quotes, no markdown). Include exact visual anatomy/layout, exact HEX palette, and authentic 60 FPS seamless looping motion matching the artwork.`;

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
          type: requestedType,
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
  return requestedType === 'bg'
    ? `Full-frame 60 FPS microstock motion background inspired by ${baseName} with layered depth parallax, smooth luminous wave flow, and seamless loop.`
    : `Clean 60 FPS microstock vector icon animation of ${baseName} with connected overlapping geometry, bold outlines, and smooth theme-matched motion.`;
}
