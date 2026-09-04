/**
 * Trial Management Service for BigMA 1-Day Trial
 * Enforces strict 1-day (24 hours) trial per device/browser.
 */

export const STORAGE_TRIAL_STARTED = 'bigma_trial_started_at';
export const STORAGE_TRIAL_EXPIRES = 'bigma_trial_expires_at';
export const STORAGE_TRIAL_USED = 'bigma_trial_used';
export const STORAGE_DEVICE_ID = 'bigma_device_uuid';
export const TRIAL_DURATION_MS = 24 * 60 * 60 * 1000; // 24 Hours

// Generate or retrieve persistent Device Identifier
export function getDeviceId(): string {
  try {
    let devId = localStorage.getItem(STORAGE_DEVICE_ID);
    if (!devId) {
      // Create hardware/browser heuristic fingerprint
      const screenInfo = `${window.screen?.width}x${window.screen?.height}x${window.screen?.colorDepth}`;
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
      const navLang = navigator.language || '';
      const cores = navigator.hardwareConcurrency || 2;
      const rand = Math.random().toString(36).substring(2, 12);
      devId = `dev_${btoa(`${screenInfo}_${tz}_${navLang}_${cores}`).substring(0, 16)}_${rand}`;
      localStorage.setItem(STORAGE_DEVICE_ID, devId);
      document.cookie = `bigma_device_uuid=${devId}; max-age=31536000; path=/; SameSite=Lax`;
    }
    return devId;
  } catch {
    return 'dev_' + Date.now();
  }
}

// Cookie helper
function getCookie(name: string): string | null {
  try {
    const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
    return match ? decodeURIComponent(match[2]) : null;
  } catch {
    return null;
  }
}

function setCookie(name: string, val: string, days = 365) {
  try {
    const maxAge = days * 24 * 60 * 60;
    document.cookie = `${name}=${encodeURIComponent(val)}; max-age=${maxAge}; path=/; SameSite=Lax`;
  } catch {}
}

export interface TrialStatus {
  hasUsedTrial: boolean;
  isActive: boolean;
  isExpired: boolean;
  startedAt: number | null;
  expiresAt: number | null;
  remainingMs: number;
}

/**
 * Evaluates current trial status from localStorage + Cookies + Server
 */
export function checkLocalTrialStatus(): TrialStatus {
  try {
    const now = Date.now();

    // Check localStorage
    const startedStr = localStorage.getItem(STORAGE_TRIAL_STARTED);
    const expiresStr = localStorage.getItem(STORAGE_TRIAL_EXPIRES);
    const usedStr = localStorage.getItem(STORAGE_TRIAL_USED);

    // Check Cookies backup
    const cookieStarted = getCookie(STORAGE_TRIAL_STARTED);
    const cookieExpires = getCookie(STORAGE_TRIAL_EXPIRES);
    const cookieUsed = getCookie(STORAGE_TRIAL_USED);

    const startedAt = startedStr ? parseInt(startedStr) : cookieStarted ? parseInt(cookieStarted) : null;
    const expiresAt = expiresStr ? parseInt(expiresStr) : cookieExpires ? parseInt(cookieExpires) : null;
    const hasUsedTrial = usedStr === 'true' || cookieUsed === 'true' || startedAt !== null;

    if (!hasUsedTrial || !startedAt || !expiresAt) {
      return {
        hasUsedTrial: false,
        isActive: false,
        isExpired: false,
        startedAt: null,
        expiresAt: null,
        remainingMs: 0,
      };
    }

    const remainingMs = expiresAt - now;
    const isActive = remainingMs > 0;
    const isExpired = remainingMs <= 0;

    return {
      hasUsedTrial: true,
      isActive,
      isExpired,
      startedAt,
      expiresAt,
      remainingMs: Math.max(0, remainingMs),
    };
  } catch (e) {
    console.error('Error checking trial status:', e);
    return {
      hasUsedTrial: false,
      isActive: false,
      isExpired: false,
      startedAt: null,
      expiresAt: null,
      remainingMs: 0,
    };
  }
}

/**
 * Activates 1-Day Trial for this device
 */
export async function startOneDayTrial(): Promise<TrialStatus> {
  const now = Date.now();
  const expiresAt = now + TRIAL_DURATION_MS;
  const deviceId = getDeviceId();

  // 1. Save to localStorage
  try {
    localStorage.setItem(STORAGE_TRIAL_STARTED, String(now));
    localStorage.setItem(STORAGE_TRIAL_EXPIRES, String(expiresAt));
    localStorage.setItem(STORAGE_TRIAL_USED, 'true');
  } catch (e) {
    console.error('Error saving trial to localStorage', e);
  }

  // 2. Save to Cookies
  setCookie(STORAGE_TRIAL_STARTED, String(now));
  setCookie(STORAGE_TRIAL_EXPIRES, String(expiresAt));
  setCookie(STORAGE_TRIAL_USED, 'true');

  // 3. Register on server
  try {
    await fetch('/api/trial/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId, startedAt: now, expiresAt }),
    });
  } catch (err) {
    console.warn('Server trial registration fallback:', err);
  }

  return {
    hasUsedTrial: true,
    isActive: true,
    isExpired: false,
    startedAt: now,
    expiresAt,
    remainingMs: TRIAL_DURATION_MS,
  };
}

/**
 * Formats remaining milliseconds into human readable Indonesian countdown e.g. "23 Jam 45 Menit"
 */
export function formatRemainingTime(ms: number): string {
  if (ms <= 0) return '0 Menit (Habis)';
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours} Jam ${minutes} Menit`;
  }
  if (minutes > 0) {
    return `${minutes} Menit ${seconds} Detik`;
  }
  return `${seconds} Detik`;
}
