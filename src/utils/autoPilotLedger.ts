import { AnimationItem } from '../types';
import type { FailedAutoPilotItem } from '../components/AutoPilotModal';

export const STORAGE_COMPLETED_LEDGER = 'bigma_autopilot_completed_ledger';
export const STORAGE_FAILED_AUTOPILOT = 'bigma_autopilot_failed_items';
export const STORAGE_ANIMATIONS_KEY = 'bigma_saved_animations';

export type CompletedLedger = Record<string, string[]>;

export function normalizeAccountKey(accountName?: string): string {
  return String(accountName || 'manual')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

export function normalizePromptKey(text?: string): string {
  return String(text || '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

// Dual independent 32-bit hashes -> compact 16-char base36 signature (~18 bytes per prompt)
export function hashPromptKey(normPrompt: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (let i = 0; i < normPrompt.length; i++) {
    const ch = normPrompt.charCodeAt(i);
    h1 ^= ch;
    h1 = Math.imul(h1, 0x01000193);
    h2 = Math.imul(h2 ^ ch, 0x85ebca6b);
    h2 ^= h2 >>> 13;
  }
  return `${(h1 >>> 0).toString(36)}_${(h2 >>> 0).toString(36)}`;
}

// Safely write small critical keys even if STORAGE_ANIMATIONS previously consumed localStorage headroom
export function safeLocalStorageSetCritical(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    try {
      const rawAnims = localStorage.getItem(STORAGE_ANIMATIONS_KEY);
      if (rawAnims) {
        const parsed = JSON.parse(rawAnims);
        if (Array.isArray(parsed) && parsed.length > 5) {
          for (const cap of [Math.floor(parsed.length * 0.5), 40, 20, 10, 5]) {
            try {
              localStorage.setItem(STORAGE_ANIMATIONS_KEY, JSON.stringify(parsed.slice(0, cap)));
              localStorage.setItem(key, value);
              return true;
            } catch {}
          }
        }
      }
      // Last-resort trim of bulky prompt bank / i2m cache if still over 5MB quota
      for (const bulkyKey of ['bigma_prompt_history_bank', 'bigma_i2m_items']) {
        try {
          const rawBulky = localStorage.getItem(bulkyKey);
          if (!rawBulky) continue;
          const parsedBulky = JSON.parse(rawBulky);
          if (Array.isArray(parsedBulky) && parsedBulky.length > 10) {
            localStorage.setItem(bulkyKey, JSON.stringify(parsedBulky.slice(0, 10)));
            localStorage.setItem(key, value);
            return true;
          }
        } catch {}
      }
    } catch {}
    return false;
  }
}

export function loadCompletedLedger(): CompletedLedger {
  try {
    const raw = localStorage.getItem(STORAGE_COMPLETED_LEDGER);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: CompletedLedger = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (Array.isArray(v)) {
        const acc = normalizeAccountKey(k);
        const uniq = Array.from(new Set(v.map((x) => String(x || '')).filter(Boolean)));
        if (uniq.length > 0) out[acc] = uniq;
      }
    }
    return out;
  } catch {
    return {};
  }
}

export function saveCompletedLedger(ledger: CompletedLedger): void {
  safeLocalStorageSetCritical(STORAGE_COMPLETED_LEDGER, JSON.stringify(ledger));
}

export function recordCompletedPrompt(
  ledger: CompletedLedger,
  accountName: string,
  promptText: string
): CompletedLedger {
  const normPrompt = normalizePromptKey(promptText);
  if (!normPrompt) return ledger;
  const accKey = normalizeAccountKey(accountName);
  const sig = hashPromptKey(normPrompt);
  const existing = ledger[accKey] || [];
  if (existing.includes(sig)) return ledger;
  const next: CompletedLedger = {
    ...ledger,
    [accKey]: [...existing, sig],
  };
  saveCompletedLedger(next);
  return next;
}

export function syncLedgerFromAnimations(
  ledger: CompletedLedger,
  animations: AnimationItem[]
): CompletedLedger {
  let changed = false;
  const next: CompletedLedger = { ...ledger };
  const setMap = new Map<string, Set<string>>();

  for (const [acc, list] of Object.entries(next)) {
    setMap.set(acc, new Set(list));
  }

  for (const anim of animations) {
    if (!anim || !anim.prompt) continue;
    const normPrompt = normalizePromptKey(anim.prompt);
    if (!normPrompt) continue;
    const accKey = normalizeAccountKey(anim.account || 'manual');
    const sig = hashPromptKey(normPrompt);
    let set = setMap.get(accKey);
    if (!set) {
      set = new Set<string>();
      setMap.set(accKey, set);
    }
    if (!set.has(sig)) {
      set.add(sig);
      changed = true;
    }
  }

  if (!changed) return ledger;
  for (const [acc, set] of setMap.entries()) {
    next[acc] = Array.from(set);
  }
  saveCompletedLedger(next);
  return next;
}

export function removeCompletedPrompt(
  ledger: CompletedLedger,
  accountName: string,
  promptText: string
): CompletedLedger {
  const normPrompt = normalizePromptKey(promptText);
  if (!normPrompt) return ledger;
  const accKey = normalizeAccountKey(accountName);
  const existing = ledger[accKey];
  if (!existing || existing.length === 0) return ledger;
  const sig = hashPromptKey(normPrompt);
  if (!existing.includes(sig)) return ledger;
  const filtered = existing.filter((s) => s !== sig);
  const next = { ...ledger };
  if (filtered.length > 0) {
    next[accKey] = filtered;
  } else {
    delete next[accKey];
  }
  saveCompletedLedger(next);
  return next;
}

export function resetAccountCompletedLedger(
  ledger: CompletedLedger,
  accountName: string
): CompletedLedger {
  const accKey = normalizeAccountKey(accountName);
  if (!ledger[accKey]) return ledger;
  const next = { ...ledger };
  delete next[accKey];
  saveCompletedLedger(next);
  return next;
}

export function isPromptCompleted(
  ledger: CompletedLedger,
  animList: AnimationItem[],
  accountName: string,
  promptText: string
): boolean {
  const normPrompt = normalizePromptKey(promptText);
  if (!normPrompt) return false;
  const accKey = normalizeAccountKey(accountName);
  const sig = hashPromptKey(normPrompt);

  if (ledger[accKey]?.includes(sig)) {
    return true;
  }

  return animList.some((a) => {
    if (normalizeAccountKey(a.account || 'manual') !== accKey) return false;
    return Boolean(a.prompt && normalizePromptKey(a.prompt) === normPrompt);
  });
}

export function getAccountCompletedCount(
  ledger: CompletedLedger,
  animList: AnimationItem[],
  accountName: string,
  customPrompts?: string[]
): number {
  const accKey = normalizeAccountKey(accountName);
  if (Array.isArray(customPrompts) && customPrompts.length > 0) {
    const seen = new Set<string>();
    let done = 0;
    for (const p of customPrompts) {
      const np = normalizePromptKey(p);
      if (!np || seen.has(np)) continue;
      seen.add(np);
      if (isPromptCompleted(ledger, animList, accountName, p)) done++;
    }
    return done;
  }

  const sigs = new Set<string>(ledger[accKey] || []);
  for (const a of animList) {
    if (normalizeAccountKey(a.account || 'manual') !== accKey) continue;
    if (a.prompt) {
      const np = normalizePromptKey(a.prompt);
      if (np) sigs.add(hashPromptKey(np));
    }
  }
  return sigs.size;
}

export function isPendingAutoPromptItem(item: FailedAutoPilotItem): boolean {
  return Boolean(
    item.isAutoPromptPending ||
      item.prompt.startsWith('(Auto Prompt:') ||
      item.prompt.startsWith('(Generate Prompts:')
  );
}

export function deduplicateFailedItems(items: FailedAutoPilotItem[]): FailedAutoPilotItem[] {
  const seen = new Set<string>();
  const out: FailedAutoPilotItem[] = [];
  for (const it of items) {
    const accKey = normalizeAccountKey(it.accountName);
    const promptKey = normalizePromptKey(it.prompt);
    const key = isPendingAutoPromptItem(it) ? `${accKey}::AUTO` : `${accKey}::${promptKey}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push(it);
    }
  }
  return out;
}

export function filterPendingFailedItems(
  items: FailedAutoPilotItem[],
  ledger: CompletedLedger,
  animList: AnimationItem[]
): FailedAutoPilotItem[] {
  return deduplicateFailedItems(
    items.filter((it) => isPendingAutoPromptItem(it) || !isPromptCompleted(ledger, animList, it.accountName, it.prompt))
  );
}

export function loadFailedAutoPilotItems(): FailedAutoPilotItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_FAILED_AUTOPILOT);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? deduplicateFailedItems(parsed) : [];
  } catch {
    return [];
  }
}

export function saveFailedAutoPilotItems(items: FailedAutoPilotItem[]): void {
  const deduped = deduplicateFailedItems(items);
  if (deduped.length === 0) {
    try {
      localStorage.removeItem(STORAGE_FAILED_AUTOPILOT);
    } catch {}
    return;
  }
  safeLocalStorageSetCritical(STORAGE_FAILED_AUTOPILOT, JSON.stringify(deduped));
}
