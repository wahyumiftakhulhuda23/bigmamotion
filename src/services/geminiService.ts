import { AnimationType, GeminiModel, ApiKeyTestResult } from '../types';

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
      if (saved.includes('2.5') || saved === 'gemini-2.5-flash') return 'gemini-2.5-flash';
      if (saved.includes('flash-lite')) return 'gemini-3.1-flash-lite';
      if (saved.includes('pro')) return 'gemini-3.1-pro-preview';
    }
  } catch (e) {
    console.error('Failed to load model', e);
  }
  return 'gemini-2.5-flash';
}

export function saveStoredModel(model: GeminiModel): void {
  try {
    localStorage.setItem(STORAGE_SELECTED_MODEL, model);
  } catch (e) {
    console.error('Failed to save model', e);
  }
}

let currentKeyIndex = 0;

export function getRotatedKey(apiKeys: string[]): string | undefined {
  if (!apiKeys || apiKeys.length === 0) {
    return undefined;
  }
  const key = apiKeys[currentKeyIndex % apiKeys.length];
  currentKeyIndex = (currentKeyIndex + 1) % apiKeys.length;
  return key;
}

export function sanitizeModel(model?: string): string {
  if (!model) return 'gemini-2.5-flash';
  const m = model.trim().toLowerCase();
  if (m.includes('2.5') || m === 'gemini-2.5-flash') return 'gemini-2.5-flash';
  if (m.includes('3.1-flash-lite') || m.includes('lite')) return 'gemini-3.1-flash-lite';
  if (m.includes('3.1-pro') || m.includes('pro')) return 'gemini-3.1-pro-preview';
  return 'gemini-2.5-flash';
}

function extractHTML(text: string): string {
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
    .replace(new RegExp(tick3 + '\\s*$'), '');

  return cleanHTML.trim();
}

// Accurate and fast test for a single key via server backend proxy (No browser CORS errors)
export async function testSingleApiKey(rawKey: string, lineIndex?: number): Promise<ApiKeyTestResult> {
  const key = (rawKey || '').trim();
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

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);

    const res = await fetch('/api/gemini/test-single-key', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key }),
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (res.ok) {
      const data: ApiKeyTestResult = await res.json();
      return {
        key,
        maskedKey: data.maskedKey || maskedKey,
        valid: !!data.valid,
        error: data.error,
        latencyMs: data.latencyMs ?? (Date.now() - start),
        status: data.valid ? 'valid' : 'invalid',
        lineIndex,
      };
    }

    const err = await res.json().catch(() => ({}));
    return {
      key,
      maskedKey,
      valid: false,
      error: err.error || `HTTP ${res.status}`,
      latencyMs: Date.now() - start,
      status: 'invalid',
      lineIndex,
    };
  } catch (e: any) {
    const isTimeout = e.name === 'AbortError';
    return {
      key,
      maskedKey,
      valid: false,
      error: isTimeout ? 'Timeout (> 6s)' : e.message || 'Gagal koneksi ke server',
      latencyMs: Date.now() - start,
      status: 'invalid',
      lineIndex,
    };
  }
}

// Sequential 1-by-1 Test All Keys with live progress callback
export async function testAllApiKeysSequential(
  keys: string[],
  onProgress?: (result: ApiKeyTestResult, index: number, total: number) => void
): Promise<{ validCount: number; total: number; results: ApiKeyTestResult[] }> {
  if (!keys || keys.length === 0) {
    return { validCount: 0, total: 0, results: [] };
  }

  const results: ApiKeyTestResult[] = [];
  for (let i = 0; i < keys.length; i++) {
    const rawKey = keys[i];
    const singleResult = await testSingleApiKey(rawKey, i);
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
  keys: string[]
): Promise<{ validCount: number; total: number; results: ApiKeyTestResult[] }> {
  return testAllApiKeysSequential(keys);
}

// Direct client fallback for prompt generation
async function generatePromptsDirect(
  apiKey: string,
  model: string,
  type: AnimationType,
  subCategory: string,
  style: string,
  count: number,
  keywords?: string[],
  isGreenScreen?: boolean
): Promise<string[]> {
  const targetModel = sanitizeModel(model);
  let typeInstruction = '';
  if (type === 'icon') {
    typeInstruction =
      'Every prompt must describe 1 single central visual icon/symbol (no letters/text), sleek, modern and high precision.';
  } else if (type === 'text') {
    typeInstruction =
      'Every prompt must include a bold catchy main text slogan with glowing aura effects, particles, and energy lines.';
  } else if (type === 'bg') {
    typeInstruction =
      'Every prompt must describe an elegant looping motion background concept (no text), harmonious gradients, particles or geometric waves.';
  }

  let keywordsDirective = '';
  if (keywords && keywords.length > 0) {
    const validKw = keywords.map((k) => k.trim()).filter((k) => k.length > 0);
    if (validKw.length > 0) {
      keywordsDirective = `\nCustom Keywords / Specific Focus Topics:\n${validKw.map((k) => `- ${k}`).join('\n')}\n(MANDATORY: You must strictly incorporate these specific user keywords/topics into the generated animation prompts.)`;
    }
  }

  const greenScreenDirective = isGreenScreen
    ? '\nGreen Screen / Chroma Key: ACTIVE. Ensure the animation concept will have high-contrast, clean visual edges ideal for green screen chroma key extraction.'
    : '';

  const promptContent = `Generate exactly ${count} concise, creative microstock animation prompts in English (5 to 8 words per prompt).
Category: ${subCategory}
Animation Type: ${String(type).toUpperCase()}
Visual Style: ${style}
Special Directive: ${typeInstruction}${keywordsDirective}${greenScreenDirective}
Requirement: Focus strictly on the central geometric object, color palette (neon/glow/cyber/gold), and smooth motion.
Output format: JSON array of strings e.g. ["prompt 1", "prompt 2"]`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${targetModel}:generateContent?key=${encodeURIComponent(
    apiKey
  )}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: promptContent }] }],
      generationConfig: {
        temperature: 0.75,
        responseMimeType: 'application/json',
      },
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Google API Error ${res.status}`);
  }

  const data = await res.json();
  const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  let prompts: string[] = [];

  try {
    const parsed = JSON.parse(rawText);
    if (Array.isArray(parsed)) {
      prompts = parsed.map((p: any) => String(p).trim()).filter((p: string) => p.length > 0);
    }
  } catch {
    const jsonMatch = rawText.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      try {
        prompts = JSON.parse(jsonMatch[0]);
      } catch {
        prompts = rawText
          .split('\n')
          .map((p: string) => p.replace(/^[-*0-9.]+\s*/, '').replace(/["'[\]]/g, '').trim())
          .filter((p: string) => p.length > 4);
      }
    }
  }

  if (prompts.length === 0) {
    prompts = [
      `Glowing neon ${subCategory} ${type} with smooth pulse`,
      `Dynamic cyber ${style} ${subCategory} animation loop`,
      `Minimalist geometric ${subCategory} motion with particle trails`,
    ];
  }

  return prompts.slice(0, count);
}

// Generate Prompts with Auto Fallback
export async function generatePromptsViaGemini(
  apiKeys: string[],
  model: GeminiModel,
  type: AnimationType,
  subCategory: string,
  style: string,
  count: number,
  keywords?: string[],
  isGreenScreen?: boolean
): Promise<string[]> {
  const apiKey = getRotatedKey(apiKeys);

  // If user provided a client API Key, use direct high-speed client call with server fallback
  if (apiKey) {
    try {
      return await generatePromptsDirect(apiKey, model, type, subCategory, style, count, keywords, isGreenScreen);
    } catch (directErr: any) {
      console.warn('Direct prompt generation fallback to server API...', directErr);
    }
  }

  // Fallback to server API route
  const response = await fetch('/api/gemini/generate-prompts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      apiKey,
      model: model || 'gemini-2.5-flash',
      type,
      subCategory,
      style,
      count,
      keywords,
      isGreenScreen,
    }),
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData?.error || `HTTP Error ${response.status}`);
  }

  const data = await response.json();
  if (!data.prompts || !Array.isArray(data.prompts) || data.prompts.length === 0) {
    throw new Error('AI tidak mengembalikan daftar prompt yang valid.');
  }

  return data.prompts;
}

// Direct client fallback for HTML animation generation
async function generateAnimationDirect(
  apiKey: string,
  model: GeminiModel,
  promptTopic: string,
  type: AnimationType,
  subCategory: string,
  style: string,
  index: number,
  total: number,
  isGreenScreen?: boolean
): Promise<{ id: string; title: string; type: AnimationType; style: string; subCategory: string; html: string; isGreenScreen?: boolean }> {
  const targetModel = sanitizeModel(model);

  let typeInstructions = '';
  if (type === 'icon') {
    typeInstructions = `
ATURAN UTAMA ICON MOTION:
- Tampilkan 1 simbol/vektor sentral berpresisi tinggi yang merepresentasikan subjek secara akurat.
- DILARANG TEKS/HURUF. Gunakan bentuk geometris terstruktur (misal: perisai, cap kelulusan, roket, cloud, chart bar).`;
  } else if (type === 'text') {
    typeInstructions = `
ATURAN UTAMA TEXT EFFECT:
- Tampilkan Teks Utama yang tebal & terdistribusi rapi di tengah canvas.
- Tambahkan efek latar belakang & aura seperti glowing pulse, running highlight, atau partikel energi halus.`;
  } else if (type === 'bg') {
    typeInstructions = `
ATURAN UTAMA BACKGROUND MOTION:
- Animasi latar belakang bergerak penuh (motion background grid, flowing liquid mesh gradient, ambient bokeh, sinewaves).
- DILARANG TEKS/HURUF. Warna harmonis, mewah, dan bergerak dengan ritme konstan.`;
  }

  const bgColor = isGreenScreen ? '#00ff00' : '#080c14';
  const clearFill = isGreenScreen ? "'#00ff00'" : "'rgba(8, 12, 20, 0.25)'";

  const greenScreenDirective = isGreenScreen
    ? `
MANDATORY GREEN SCREEN / CHROMA KEY RULES:
- Background HARUS hijau polos murni (#00ff00 / rgb(0, 255, 0)) untuk keperluan chroma key editing video.
- DILARANG background gelap/hitam atau gradien gelap ke hijau.
- Elemen grafis/animasi utama HARUS menggunakan warna kontras yang jelas (Cyan #00f3ff, Gold #fbbf24, Violet #a855f7, Putih #ffffff, Oranye #f97316, Merah #ef4444, Biru #3b82f6).
- HINDARI memakai warna hijau #00ff00 pada objek utama agar tidak hilang saat di-chroma-key.`
    : `
3. PALET WARNA TRENDY: Cyan Cyber (#00f3ff), Vibrant Violet (#a855f7), Emerald (#10b981), Warm Gold (#fbbf24), dengan background gelap eksklusif (#080c14).`;

  const systemPrompt = `Anda adalah Senior HTML5 Motion Designer Spesialis Microstock (Shutterstock/Envato Standard).
Tugas: Buat 1 file HTML animasi menggunakan Canvas 2D API & Vanilla JS.

KUALITAS VISUAL & TREN MODERN (MANDATORY):
1. BENTUK & GERAKAN AKURAT: Bentuk visual HARUS presisi sesuai deskripsi prompt. Gerakan HARUS halus menggunakan fungsi matematika (Math.sin, Math.cos, easing). DILARANG gerakan acak patah-patah!
2. POLISH VISUAL ELEGANKAN: Gunakan efek glow halus (ctx.shadowBlur = 15; ctx.shadowColor = 'rgba(...)'), gradien dinamis (createLinearGradient / createRadialGradient), dan partikel ambient lembut.${greenScreenDirective}

ATURAN UKURAN KODE (ANTI TERPOTONG / ZERO MAX TOKENS ERROR):
- Tulis kode prosedural yang ringkas, bersih, modular, dan efisien (target 180 - 250 baris kode).
- WAJIB gunakan struktur boilerplate standar berikut tanpa mengubah skema canvas:

<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>
  body { margin: 0; padding: 0; overflow: hidden; background-color: ${bgColor}; font-family: system-ui, sans-serif; }
  canvas { display: block; width: 100vw; height: 100vh; }
  #err { position: absolute; top: 10px; left: 10px; color: #ef4444; font-size: 12px; z-index: 10; pointer-events: none; }
</style>
<script>
  window.onerror = function(msg, url, line) {
      document.body.innerHTML += '<div id="err">Render Warning: ' + msg + '</div>';
  };
</script>
</head>
<body>
<canvas id="c"></canvas>
<script>
  const canvas = document.getElementById('c');
  const ctx = canvas.getContext('2d');
  let w, h, cx, cy;
  
  function resize() {
    w = canvas.width = window.innerWidth;
    h = canvas.height = window.innerHeight;
    cx = w / 2;
    cy = h / 2;
  }
  window.addEventListener('resize', resize);
  resize();

  // --- INISIALISASI ELEMEN / PARTIKEL ---

  function animate(time) {
    const t = time * 0.001; // Detik untuk gerakan halus
    ctx.fillStyle = ${clearFill};
    ctx.fillRect(0, 0, w, h);

    // --- LOGIKA MENGGAMBAR ANIMASI PRESISI ---

    requestAnimationFrame(animate);
  }
  animate(0);
</script>
</body>
</html>

Brief Animasi:
- Subjek/Prompt: "${promptTopic}"
- Tipe Animasi: ${String(type).toUpperCase()}
- Kategori Niche: ${subCategory}
- Gaya Visual: ${style}
${isGreenScreen ? '- Background: Pure Green Screen #00FF00 (Chroma Key)' : ''}

${typeInstructions}

Outputkan HANYA file HTML lengkap tanpa teks pembuka atau markdown lainnya:`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${targetModel}:generateContent?key=${encodeURIComponent(
    apiKey
  )}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: systemPrompt }] }],
      generationConfig: {
        temperature: 0.6,
      },
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Google API Error ${res.status}`);
  }

  const data = await res.json();
  let rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  let cleanHTML = extractHTML(rawText);

  if (!cleanHTML.toLowerCase().includes('</html>') || !cleanHTML.toLowerCase().includes('</script>')) {
    if (cleanHTML.toLowerCase().includes('requestanimationframe')) {
      rawText += '\n  }\n  animate(0);\n</' + 'script>\n</body>\n</html>';
      cleanHTML = extractHTML(rawText);
    } else {
      throw new Error('Kode dari AI terpotong sebelum selesai');
    }
  }

  return {
    id: 'anim_' + Date.now() + Math.random().toString(36).substring(7),
    title: `${promptTopic.substring(0, 35)}... (${index}/${total})`,
    type,
    style,
    subCategory,
    html: cleanHTML,
    isGreenScreen,
  };
}

// Generate Single Animation Code with Multi-Level Fallback
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
  isGreenScreen?: boolean
): Promise<{ id: string; title: string; type: AnimationType; style: string; subCategory: string; html: string; isGreenScreen?: boolean }> {
  let lastError: any = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const apiKey = getRotatedKey(apiKeys);

      // If user provided an API key, try direct client call first for 0-latency and no 500 server error
      if (apiKey) {
        try {
          return await generateAnimationDirect(
            apiKey,
            model,
            promptTopic,
            type,
            subCategory,
            style,
            index,
            total,
            isGreenScreen
          );
        } catch (clientErr: any) {
          console.warn('Direct generation failed, trying server endpoint fallback...', clientErr);
        }
      }

      const response = await fetch('/api/gemini/generate-animation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey,
          model: model || 'gemini-2.5-flash',
          promptTopic,
          type,
          subCategory,
          style,
          index,
          total,
          isGreenScreen,
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData?.error || `HTTP Error ${response.status}`);
      }

      const data = await response.json();
      if (!data.html || data.html.trim().length === 0) {
        throw new Error('AI mengembalikan kode kosong.');
      }

      return {
        ...data,
        isGreenScreen,
      };
    } catch (err: any) {
      lastError = err;
      if (attempt < maxRetries) {
        if (onRetry) onRetry(attempt, maxRetries, err.message);
        await new Promise((res) => setTimeout(res, 2000));
      }
    }
  }

  throw new Error(`Gagal memproses setelah ${maxRetries} percobaan: ${lastError?.message || 'Unknown error'}`);
}
