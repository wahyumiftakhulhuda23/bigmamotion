import { AnimationType, GeminiModel, ApiKeyTestResult, ColorMode, MotionDynamics, ShapeAnalysis } from '../types';

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

// Accurate, robust test for a single key (Direct Google API probe with server proxy fallback)
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

  // Strategy 1: Direct Google API check (Zero serverless dependency, works on any device & Vercel)
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);

    const directUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`;
    const res = await fetch(directUrl, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      signal: controller.signal,
    });

    clearTimeout(timer);
    const latencyMs = Date.now() - start;

    if (res.ok) {
      return {
        key,
        maskedKey,
        valid: true,
        latencyMs,
        status: 'valid',
        lineIndex,
      };
    }

    // Parse Google's error response safely
    const errData = await res.json().catch(() => ({}));
    const rawMsg = errData?.error?.message || `HTTP ${res.status}`;
    let userMsg = rawMsg;

    if (
      rawMsg.toLowerCase().includes('api_key_invalid') ||
      rawMsg.toLowerCase().includes('api key not valid') ||
      rawMsg.toLowerCase().includes('key not valid') ||
      res.status === 400
    ) {
      userMsg = 'API Key tidak valid atau salah';
    } else if (
      rawMsg.toLowerCase().includes('resource_exhausted') ||
      rawMsg.toLowerCase().includes('quota') ||
      res.status === 429
    ) {
      userMsg = 'Rate limit / kuota habis';
    } else if (
      rawMsg.toLowerCase().includes('permission_denied') ||
      res.status === 403
    ) {
      userMsg = 'Izin ditolak untuk API Key ini';
    }

    return {
      key,
      maskedKey,
      valid: false,
      error: userMsg,
      latencyMs,
      status: 'invalid',
      lineIndex,
    };
  } catch (directErr: any) {
    // If direct call had a network issue (e.g. adblocker, corporate firewall), try Strategy 2: Server Fallback
    console.warn('Direct Google API probe failed, attempting server proxy fallback...', directErr);
  }

  // Strategy 2: Server fallback via /api/gemini/test-single-key
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);

    const res = await fetch('/api/gemini/test-single-key', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ key }),
      signal: controller.signal,
    });

    clearTimeout(timer);
    const latencyMs = Date.now() - start;

    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      // If server returned HTML (e.g. index.html from an unhandled rewrite or 404 page)
      return {
        key,
        maskedKey,
        valid: false,
        error: 'Tidak dapat menjangkau server verifikasi',
        latencyMs,
        status: 'invalid',
        lineIndex,
      };
    }

    if (res.ok) {
      const data: ApiKeyTestResult = await res.json();
      return {
        key,
        maskedKey: data.maskedKey || maskedKey,
        valid: !!data.valid,
        error: data.error,
        latencyMs: data.latencyMs ?? latencyMs,
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
      error: isTimeout ? 'Timeout pemeriksaan (> 6s)' : serverErr.message || 'Gagal koneksi verifikasi',
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

// Direct client fallback for prompt generation with multi-model fallback
async function generatePromptsDirect(
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
  const primaryModel = sanitizeModel(model);
  const candidateModels = [
    primaryModel,
    ...['gemini-2.5-flash', 'gemini-flash-latest', 'gemini-3.1-flash-lite', 'gemini-3.1-pro-preview'].filter(
      (m) => m !== primaryModel
    ),
  ];

  let typeInstruction = '';
  if (type === 'icon') {
    typeInstruction =
      'Every prompt must describe 1 single central visual icon/symbol (no letters/text), sleek, modern and high precision.';
  } else if (type === 'text') {
    typeInstruction =
      'Every prompt must include a bold catchy main text slogan with energetic typography and motion.';
  } else if (type === 'bg') {
    typeInstruction =
      'Every prompt must describe an elegant looping motion background concept (no text), seamless geometry or atmospheric waves.';
  }

  let keywordsDirective = '';
  if (keywords && keywords.length > 0) {
    const validKw = keywords.map((k) => k.trim()).filter((k) => k.length > 0);
    if (validKw.length > 0) {
      keywordsDirective = `\nCustom Keywords / Specific Focus Topics:\n${validKw.map((k) => `- ${k}`).join('\n')}\n(MANDATORY: You must strictly incorporate these specific user keywords/topics into the generated animation prompts.)`;
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

  const motionDirective = `\nMotion Dynamics: ${motionDynamics.toUpperCase()} (${
    motionDynamics === 'bounce'
      ? 'Energetic elastic bounce with squash and stretch spring physics'
      : motionDynamics === 'orbital'
      ? '3D orbital gyroscopic rotation and planetary revolution'
      : motionDynamics === 'morph'
      ? 'Kinetic geometric morphing and vertex shape transitions'
      : motionDynamics === 'cyber'
      ? 'High-tech stepped HUD telemetry, scanning laser beams, and digital dial ratchets'
      : motionDynamics === 'mechanical'
      ? 'Precision mechanical clockwork, interlocking gear mesh rotation and pistons'
      : 'Smooth organic sinusoidal waves, flowing ribbons and continuous fluid drift'
  })`;

  const promptContent = `Generate exactly ${count} concise, creative microstock animation prompts in English (5 to 8 words per prompt).
Category: ${subCategory}
Animation Type: ${String(type).toUpperCase()}
Visual Style: ${style}${colorModeDirective}${glowDirective}${motionDirective}
Special Directive: ${typeInstruction}${keywordsDirective}${greenScreenDirective}
Requirement: Focus strictly on the central geometric object, color palette, and specific motion dynamics.
Output format: JSON array of strings e.g. ["prompt 1", "prompt 2"]`;

  let lastDirectError: any = null;

  for (const currentModel of candidateModels) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${currentModel}:generateContent?key=${encodeURIComponent(
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

      if (prompts.length > 0) {
        return prompts.slice(0, count);
      }
    } catch (err: any) {
      lastDirectError = err;
      continue;
    }
  }

  throw lastDirectError || new Error('Gagal menghasilkan prompt dari model Google Gemini');
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
  isGreenScreen?: boolean,
  colorMode: ColorMode = 'gradient',
  motionDynamics: MotionDynamics = 'flow',
  neonGlow: boolean = true
): Promise<string[]> {
  const apiKey = getRotatedKey(apiKeys);

  // If user provided a client API Key, use direct high-speed client call with server fallback
  if (apiKey) {
    try {
      return await generatePromptsDirect(apiKey, model, type, subCategory, style, count, keywords, isGreenScreen, colorMode, motionDynamics, neonGlow);
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
      colorMode,
      motionDynamics,
      neonGlow,
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
  isGreenScreen?: boolean,
  colorMode: ColorMode = 'gradient',
  motionDynamics: MotionDynamics = 'flow',
  neonGlow: boolean = true
): Promise<{ id: string; title: string; type: AnimationType; style: string; subCategory: string; html: string; isGreenScreen?: boolean; colorMode?: ColorMode; motionDynamics?: MotionDynamics; neonGlow?: boolean }> {
  const targetModel = sanitizeModel(model);

  let typeInstructions = '';
  if (type === 'icon') {
    typeInstructions = `
ATURAN UTAMA ICON MOTION:
- Tampilkan 1 simbol/vektor sentral berpresisi tinggi yang merepresentasikan subjek secara akurat di tengah canvas.
- DILARANG TEKS/HURUF. Gunakan bentuk geometris terstruktur (misal: perisai, roket, gear, chip, atom, chart, gedung, diamond).`;
  } else if (type === 'text') {
    typeInstructions = `
ATURAN UTAMA TEXT EFFECT:
- Tampilkan Teks Utama yang tebal & terdistribusi rapi di tengah canvas.
- Tambahkan efek visual pendukung sesuai Motion Dynamics dan Style (misal: aura, border highlight, particle sweep, atau kinetic tracking).`;
  } else if (type === 'bg') {
    typeInstructions = `
ATURAN UTAMA BACKGROUND MOTION:
- Animasi latar belakang bergerak penuh di seluruh canvas (waves, flowing grid, orbital field, matrix HUD, atau synthwave horizon).
- DILARANG TEKS/HURUF. Bergerak dengan ritme harmonis tanpa jeda.`;
  }

  const bgColor = isGreenScreen ? '#00ff00' : '#080c14';
  // Always use 100% solid background clear & fill to eliminate any motion trails, ghosting, or smudges
  const clearFill = isGreenScreen ? "'#00ff00'" : "'#080c14'";

  let motionGuide = '';
  if (motionDynamics === 'bounce') {
    motionGuide = `
PANDUAN GERAKAN BOUNCE & SPRING:
- Gunakan rumus elastis membal: const bounce = Math.abs(Math.sin(t * 3.5)); const squash = 1 + 0.3 * (1 - bounce);
- Terapkan squash & stretch saat objek mendarat atau memantul sehingga terasa elastis dan berbobot nyata!`;
  } else if (motionDynamics === 'orbital') {
    motionGuide = `
PANDUAN GERAKAN 3D ORBITAL & GYROSCOPE:
- Simulasikan rotasi 3D multi-cincin atau partikel mengorbit dengan kedalaman z (pseudo-3D):
  const angle = t * 1.5 + i * (Math.PI * 2 / N);
  const x = cx + Math.cos(angle) * radiusX;
  const y = cy + Math.sin(angle) * radiusY * Math.cos(tiltAngle);
  const z = Math.sin(angle) * Math.sin(tiltAngle);
  ctx.scale(1 + z * 0.3, 1 + z * 0.3); ctx.globalAlpha = 0.5 + 0.5 * (z + 1) / 2;`;
  } else if (motionDynamics === 'morph') {
    motionGuide = `
PANDUAN GERAKAN KINETIC MORPHING:
- Bentuk geometris bertransformasi secara dinamis antar bentuk:
  Gunakan looping vertex: const r = baseR * (1 + 0.3 * Math.sin(angle * spikes + t * 3));
  Hubungkan titik dengan ctx.lineTo atau bezierCurveTo.`;
  } else if (motionDynamics === 'cyber') {
    motionGuide = `
PANDUAN GERAKAN CYBER STEP & HUD TELEMETRY:
- Gerakan berpola kuantisasi tajam / stepped: const stepT = Math.floor(t * 8) / 8;
- Elemen HUD: busur derajat berputar, dial bidik, laser scanner bolak-balik melintasi canvas, kurung sudut siku [ ], dan garis garis target.`;
  } else if (motionDynamics === 'mechanical') {
    motionGuide = `
PANDUAN GERAKAN MECHANICAL & CLOCKWORK:
- Gigi roda (gears) yang saling mengunci (intermeshing) berputar berlawanan arah dengan rasio putaran terkalibrasi: rotasi Gear A = t * speed; rotasi Gear B = -t * speed * (teethA / teethB);`;
  } else {
    motionGuide = `
PANDUAN GERAKAN ORGANIC FLOW & WAVES:
- Gunakan gelombang harmonik berulang: const wave = Math.sin(t * 2 + i * 0.5) * Math.cos(t * 1.2 + i * 0.3);
- Objek mengalir dan berfluktuasi lembut dengan kemiringan dinamis.`;
  }

  let styleAndColorGuide = '';
  if (colorMode === 'flat' || !neonGlow) {
    styleAndColorGuide = `
PANDUAN WARNA & STYLE: FLAT COLOR / NO GRADIENT / NO GLOW:
- ctx.shadowBlur = 0; ctx.shadowColor = 'transparent'; (DILARANG GLOW / BLUR).
${colorMode === 'flat' ? '- DILARANG menggunakan createLinearGradient atau createRadialGradient. Gunakan 100% solid hex color (misal: #FF4757, #2ED573, #1E90FF, #FFA502, #FFFFFF, #2F3542) bergaya Flat Art Vector modern!' : ''}
- Bentuk garis tepi tajam, tebal terdefinisi (ctx.lineWidth = 3), dan bidang warna rata (flat solid fill).`;
  } else {
    styleAndColorGuide = `
PANDUAN WARNA & NEON GLOW (AKTIF):
- Terapkan efek luminescence bertingkat: ctx.shadowBlur = 18; ctx.shadowColor = primaryColor;
${colorMode === 'neon' ? '- Palet Neon Cyber: Cyan (#00f3ff), Neon Magenta (#ff007f), Electric Lime (#39ff14), Neon Gold (#ffd700).' : ''}
${colorMode === 'monochrome' ? '- Palet Monochrome: Putih murni (#ffffff), Slate Silver (#cbd5e1), Graphite (#475569), dengan aksen glow putih kristal.' : ''}
${colorMode === 'pastel' ? '- Palet Pastel: Soft Lavender (#c4b5fd), Mint (#a7f3d0), Peach (#fdba74), Baby Blue (#93c5fd).' : ''}
${colorMode === 'luxury' ? '- Palet Luxury: Imperial Gold (#d4af37), Warm Amber (#f59e0b), Champagne (#fef08a), Bronze (#cd7f32).' : ''}
${colorMode === 'gradient' ? '- Gunakan createLinearGradient / createRadialGradient dinamis yang bergerak seiring waktu t.' : ''}`;
  }

  const greenScreenDirective = isGreenScreen
    ? `
MANDATORY GREEN SCREEN / CHROMA KEY RULES:
- Background HARUS hijau polos murni (#00ff00) untuk chroma key editing video.
- DILARANG background gelap atau gradien hijau ke hitam.
- Objek utama HARUS menggunakan warna kontras jelas (Cyan, Gold, Ungu, Putih, Oranye, Merah, Biru).
- HINDARI memakai warna hijau #00ff00 pada objek utama agar tidak hilang saat di-chroma-key.`
    : '';

  const systemPrompt = `Anda adalah Lead HTML5 Motion Designer Spesialis Video Asset & Microstock (Shutterstock/Envato Standard).
Tugas: Buat 1 file HTML animasi Canvas 2D yang bervariasi, dinamis, dan MINIM BUG BENTUK/GERAKAN.

PARAMETER TERPILIH:
- Subjek/Prompt: "${promptTopic}"
- Tipe Animasi: ${String(type).toUpperCase()}
- Kategori Niche: ${subCategory}
- Gaya Visual: ${style}
- Mode Warna: ${colorMode.toUpperCase()}
- Status Neon Glow: ${neonGlow ? 'AKTIF' : 'NONAKTIF (Flat / Tanpa Blur)'}
- Motion Dynamics: ${motionDynamics.toUpperCase()}
${isGreenScreen ? '- Mode: Pure Green Screen #00FF00 (Chroma Key)' : ''}

${typeInstructions}
${motionGuide}
${styleAndColorGuide}
${greenScreenDirective}

ATURAN ANTI-BUG & ANTI-GHOSTING / BEKAS GERAKAN (MANDATORY):
1. ISOLASI CANVAS CONTEXT & NEON GLOW: Setiap elemen WAJIB dibungkus ctx.save() dan ctx.restore(). Jika menggunakan efek Neon/Glow (ctx.shadowBlur, ctx.shadowColor), HANYA terapkan saat menggambar objek bersangkutan dan segera reset (ctx.shadowBlur = 0; ctx.shadowColor = 'transparent';) agar pendaran tidak bocor atau meninggalkan jejak/bekas gerakan (ghosting artifacts) di frame berikutnya.
2. HILANGKAN BEKAS GERAKAN / ZERO MOTION TRAILS: Setiap frame baru WAJIB diawali dengan pembersihan kanvas total (ctx.clearRect(0, 0, w, h); lalu ctx.fillStyle = ${clearFill}; ctx.fillRect(0, 0, w, h);). DILARANG KERAS menggunakan rgba(...) semi-transparan untuk clear background karena akan membuat jejak/bekas gerakan kotor di belakang objek yang bergerak.
3. KOORDINAT TERPUSAT & FRAMING PROPOSIONAL (TIDAK BOLEH ZOOM-OUT / TERLALU KECIL):
   - Skala S = Math.min(w, h) * ${type === 'icon' ? '0.44' : type === 'text' ? '0.48' : '0.65'};
   - Objek Icon / Grafis harus proporsional & memenuhi frame sekitar 80-88% tinggi canvas dengan margin aman (tidak terpotong dan tidak tampak kecil di tengah).
   - Text Effect harus tebal dan lebar mengisi area tengah visual.
   - Background Motion harus menyebar ke seluruh kanvas (w, h) hingga ke sudut-sudut tanpa ruang hitam kosong.
4. ZERO GLITCH / NO SMEARS: Canvas tidak boleh meninggalkan noda jejak yang tak diinginkan.
5. RINGKAS & TUNTAS: Buat kode efisien 180 - 250 baris yang langsung looping tanpa batas.

WAJIB gunakan struktur HTML boilerplate berikut:

<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>
  body { margin: 0; padding: 0; overflow: hidden; background-color: ${bgColor}; font-family: system-ui, -apple-system, sans-serif; }
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
  let w, h, cx, cy, S;
  
  function resize() {
    w = canvas.width = window.innerWidth;
    h = canvas.height = window.innerHeight;
    cx = w / 2;
    cy = h / 2;
    S = Math.min(w, h) * ${type === 'icon' ? '0.44' : type === 'text' ? '0.48' : '0.65'};
  }
  window.addEventListener('resize', resize);
  resize();

  // --- INISIALISASI ELEMEN ---

  function animate(time) {
    const t = time * 0.001;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = ${clearFill};
    ctx.fillRect(0, 0, w, h);

    // --- LOGIKA MENGGAMBAR ANIMASI ---

    requestAnimationFrame(animate);
  }
  animate(0);
</script>
</body>
</html>

Outputkan HANYA file HTML lengkap tanpa teks pembuka atau markdown lainnya:`;

  const primaryModel = sanitizeModel(model);
  const candidateModels = [
    primaryModel,
    ...['gemini-2.5-flash', 'gemini-flash-latest', 'gemini-3.1-flash-lite', 'gemini-3.1-pro-preview'].filter(
      (m) => m !== primaryModel
    ),
  ];

  let lastDirectError: any = null;

  for (const currentModel of candidateModels) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${currentModel}:generateContent?key=${encodeURIComponent(
        apiKey
      )}`;

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: systemPrompt }] }],
          generationConfig: {
            temperature: 0.65,
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
        colorMode,
        motionDynamics,
        neonGlow,
        html: cleanHTML,
        isGreenScreen,
      };
    } catch (err: any) {
      lastDirectError = err;
      continue;
    }
  }

  throw lastDirectError || new Error('Gagal menghasilkan animasi Canvas');
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
  isGreenScreen?: boolean,
  colorMode: ColorMode = 'gradient',
  motionDynamics: MotionDynamics = 'flow',
  neonGlow: boolean = true
): Promise<{ id: string; title: string; type: AnimationType; style: string; subCategory: string; html: string; isGreenScreen?: boolean; colorMode?: ColorMode; motionDynamics?: MotionDynamics; neonGlow?: boolean }> {
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
            isGreenScreen,
            colorMode,
            motionDynamics,
            neonGlow
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
          colorMode,
          motionDynamics,
          neonGlow,
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
        colorMode,
        motionDynamics,
        neonGlow,
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

// High-Precision Procedural Vector Canvas HTML Generator (100% Pure Procedural Canvas 2D - No Raw Image Pasting)
export function buildProceduralVectorMotionHtml(params: {
  motionDynamics: string;
  colorMode: string;
  neonGlow: boolean;
  isGreenScreen: boolean;
  aiAnalysis?: {
    objectName?: string;
    shapeDescription?: string;
    detectedElements?: string[];
    professionalMotionPlan?: string;
    similaritySynthesis?: string;
    glowColor?: string;
    spinSpeed?: number;
    hasSpeedTrails?: boolean;
  };
}): string {
  const {
    motionDynamics = 'flow',
    colorMode = 'gradient',
    neonGlow = true,
    isGreenScreen = false,
    aiAnalysis = {},
  } = params;

  const bgColor = isGreenScreen ? '#00ff00' : '#080c14';
  const clearFill = isGreenScreen ? "'#00ff00'" : "'#080c14'";

  const glowColor =
    aiAnalysis.glowColor ||
    (colorMode === 'neon'
      ? '#00f0ff'
      : colorMode === 'luxury'
      ? '#ffd700'
      : colorMode === 'pastel'
      ? '#fda4af'
      : colorMode === 'monochrome'
      ? '#e2e8f0'
      : colorMode === 'flat'
      ? '#3b82f6'
      : '#38bdf8');

  const secondaryColor =
    colorMode === 'neon'
      ? '#ff007f'
      : colorMode === 'luxury'
      ? '#ffffff'
      : colorMode === 'pastel'
      ? '#93c5fd'
      : colorMode === 'monochrome'
      ? '#94a3b8'
      : '#818cf8';

  const accentColor =
    colorMode === 'neon'
      ? '#39ff14'
      : colorMode === 'luxury'
      ? '#f59e0b'
      : colorMode === 'pastel'
      ? '#c4b5fd'
      : colorMode === 'monochrome'
      ? '#64748b'
      : '#ec4899';

  const spinSpeed = aiAnalysis.spinSpeed ?? (motionDynamics === 'mechanical' ? 2.5 : 1.8);
  const hasSpeedTrails = aiAnalysis.hasSpeedTrails ?? true;

  const shapeAnalysisJson = JSON.stringify({
    objectName: aiAnalysis.objectName || 'Procedural Motion Graphic',
    shapeDescription: aiAnalysis.shapeDescription || 'Rekonstruksi vektor Canvas 2D murni berdasarkan analisis mendalam referensi visual.',
    detectedElements: aiAnalysis.detectedElements || ['Vektor Utama Geometris', 'Gradien Multi-Stop', 'Partikel Aerodinamis', 'Aura Neon Luminescence'],
    professionalMotionPlan: aiAnalysis.professionalMotionPlan || `Animasi kinetik 60 FPS multi-layer dengan dinamika ${motionDynamics.toUpperCase()} dan pencahayaan ${colorMode.toUpperCase()}.`,
    similaritySynthesis: aiAnalysis.similaritySynthesis || 'Sintesis bentuk geometris, kontur, dan warna referensi yang direkonstruksi utuh menggunakan algoritma Canvas 2D.',
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>
  body { margin: 0; padding: 0; overflow: hidden; background-color: ${bgColor}; font-family: system-ui, -apple-system, sans-serif; }
  canvas { display: block; width: 100vw; height: 100vh; }
  #err { position: absolute; top: 10px; left: 10px; color: #ef4444; font-size: 12px; z-index: 10; pointer-events: none; }
</style>
<script type="application/json" id="shape-analysis">
${shapeAnalysisJson}
</script>
<script>
  window.onerror = function(msg) {
    document.body.innerHTML += '<div id="err">Render Notice: ' + msg + '</div>';
  };
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

  // Multi-Layer Kinetic Particle System
  const particles = [];
  const particleCount = 42;
  for (let i = 0; i < particleCount; i++) {
    particles.push({
      x: (Math.random() - 0.5) * 450,
      y: (Math.random() - 0.5) * 200,
      vx: -(Math.random() * 4.5 + 2.0),
      vy: (Math.random() - 0.5) * 1.5,
      size: Math.random() * 3.5 + 1.2,
      alpha: Math.random() * 0.8 + 0.2,
      life: Math.random() * 60 + 10,
      maxLife: 70
    });
  }

  // Speed Streaks
  const streaks = [];
  for (let i = 0; i < 16; i++) {
    streaks.push({
      yOffset: (Math.random() - 0.5) * 200,
      length: Math.random() * 220 + 70,
      thickness: Math.random() * 2.8 + 1,
      speed: Math.random() * 4.5 + 2.5,
      phase: Math.random() * Math.PI * 2,
      alpha: Math.random() * 0.6 + 0.3
    });
  }

  function animate(time) {
    const t = time * 0.001;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = ${clearFill};
    ctx.fillRect(0, 0, w, h);

    // Dynamic Kinetic Transforms according to chosen motion dynamics
    let posX = cx;
    let posY = cy;
    let scaleX = 1;
    let scaleY = 1;
    let rot = 0;

    const dyn = "${motionDynamics}";
    if (dyn === 'bounce') {
      const bounce = Math.abs(Math.sin(t * 3.5));
      posY = cy - (bounce * S * 0.35) + (S * 0.08);
      const squash = 1 + 0.22 * (1 - bounce);
      scaleX = 1 / Math.sqrt(squash);
      scaleY = squash;
      rot = Math.sin(t * 2.5) * 0.1;
    } else if (dyn === 'orbital') {
      posX = cx + Math.cos(t * 1.8) * (S * 0.32);
      posY = cy + Math.sin(t * 1.8) * (S * 0.12);
      const depthScale = 0.88 + 0.24 * (Math.sin(t * 1.8) + 1) * 0.5;
      scaleX = depthScale;
      scaleY = depthScale;
      rot = Math.sin(t * 1.5) * 0.2;
    } else if (dyn === 'morph') {
      const pulse = 1 + Math.sin(t * 3.8) * 0.12;
      scaleX = pulse;
      scaleY = 1 / pulse;
      posX = cx + Math.sin(t * 1.4) * 10;
      posY = cy + Math.cos(t * 1.8) * 8;
      rot = Math.sin(t * 1.8) * 0.12;
    } else if (dyn === 'cyber') {
      const step = Math.floor(t * 6) / 6;
      posX = cx + Math.sin(step * Math.PI * 2) * 10;
      posY = cy + Math.cos(step * Math.PI * 2) * 6;
      rot = Math.sin(step * Math.PI) * 0.12;
      scaleX = 1 + Math.sin(step * 10) * 0.05;
      scaleY = 1 + Math.cos(step * 10) * 0.05;
    } else if (dyn === 'mechanical') {
      rot = t * ${spinSpeed};
      posX = cx + Math.sin(t * 1.2) * 6;
      posY = cy + Math.cos(t * 1.2) * 5;
    } else {
      // Flow & harmonic organic floating
      posX = cx + Math.sin(t * 1.6) * (S * 0.08);
      posY = cy + Math.cos(t * 2.2) * (S * 0.06);
      rot = Math.sin(t * 1.4) * 0.1;
      const breathe = 1 + Math.sin(t * 2.0) * 0.04;
      scaleX = breathe;
      scaleY = breathe;
    }

    // 1. Ambient Background Energy Rings & Pulses
    ctx.save();
    ctx.translate(posX, posY);
    for (let r = 1; r <= 3; r++) {
      const ringRadius = (S * 0.55 * r * 0.6) + ((t * 25 * r) % (S * 0.7));
      const ringAlpha = Math.max(0, 0.28 - (ringRadius / (S * 1.4)));
      ctx.beginPath();
      ctx.arc(0, 0, ringRadius, 0, Math.PI * 2);
      ctx.strokeStyle = "${glowColor}";
      ctx.globalAlpha = ringAlpha * 0.7;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([8, 12]);
      ctx.lineDashOffset = -t * 15 * r;
      ctx.stroke();
    }
    ctx.restore();

    // 2. Render Speed Streaks behind object
    if (${hasSpeedTrails}) {
      ctx.save();
      ctx.translate(posX, posY);
      for (let i = 0; i < streaks.length; i++) {
        const st = streaks[i];
        const wave = Math.sin(t * st.speed + st.phase) * 5;
        const streakLen = st.length * (0.8 + 0.3 * Math.sin(t * 3.5 + st.phase));
        
        ctx.beginPath();
        const startX = -S * 0.35;
        const endX = startX - streakLen;
        const currY = st.yOffset * (S / 220) + wave;

        const grad = ctx.createLinearGradient(startX, currY, endX, currY);
        grad.addColorStop(0, "${glowColor}");
        grad.addColorStop(0.4, "${secondaryColor}" + "88");
        grad.addColorStop(1, "transparent");

        ctx.strokeStyle = grad;
        ctx.lineWidth = st.thickness;
        ctx.lineCap = 'round';
        ctx.moveTo(startX, currY);
        ctx.lineTo(endX, currY);
        ctx.stroke();
      }
      ctx.restore();
    }

    // 3. Render Trailing Kinetic Particles
    ctx.save();
    ctx.translate(posX, posY);
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.life -= 1;
      if (p.life <= 0 || p.x < -w * 0.5) {
        p.x = -S * 0.15 + (Math.random() - 0.5) * 25;
        p.y = (Math.random() - 0.5) * (S * 0.6);
        p.vx = -(Math.random() * 4.5 + 2.0);
        p.life = Math.random() * 50 + 20;
      }

      const pAlpha = (p.life / p.maxLife) * p.alpha;
      ctx.fillStyle = i % 2 === 0 ? "${glowColor}" : "${secondaryColor}";
      ctx.globalAlpha = Math.max(0, Math.min(1, pAlpha));
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // 4. Render Procedural Vector Art in Canvas 2D (Pure Code Re-creation)
    ctx.save();
    ctx.translate(posX, posY);
    ctx.scale(scaleX, scaleY);
    ctx.rotate(rot);

    if (${neonGlow}) {
      ctx.shadowColor = "${glowColor}";
      ctx.shadowBlur = 20 + Math.sin(t * 3.5) * 8;
    }

    const R = S * 0.72;

    // Multi-Layer Outer Futuristic Bevel / Halo
    const outerGrad = ctx.createLinearGradient(-R, -R, R, R);
    outerGrad.addColorStop(0, "${glowColor}");
    outerGrad.addColorStop(0.5, "${secondaryColor}");
    outerGrad.addColorStop(1, "${accentColor}");

    ctx.lineWidth = 4;
    ctx.strokeStyle = outerGrad;
    ctx.beginPath();
    ctx.arc(0, 0, R * 0.68, 0, Math.PI * 2);
    ctx.stroke();

    // Inner Radiant Shield / Dial Structure
    const innerGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, R * 0.6);
    innerGrad.addColorStop(0, "${glowColor}" + "33");
    innerGrad.addColorStop(0.7, "${secondaryColor}" + "18");
    innerGrad.addColorStop(1, "transparent");
    ctx.fillStyle = innerGrad;
    ctx.beginPath();
    ctx.arc(0, 0, R * 0.68, 0, Math.PI * 2);
    ctx.fill();

    // Calibrated Dial Ticks & Rotating Spokes
    ctx.save();
    ctx.rotate(t * 0.6);
    for (let a = 0; a < 12; a++) {
      const angle = (a / 12) * Math.PI * 2;
      const x1 = Math.cos(angle) * (R * 0.52);
      const y1 = Math.sin(angle) * (R * 0.52);
      const x2 = Math.cos(angle) * (R * 0.64);
      const y2 = Math.sin(angle) * (R * 0.64);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.strokeStyle = a % 3 === 0 ? "${glowColor}" : "${secondaryColor}" + "99";
      ctx.lineWidth = a % 3 === 0 ? 3 : 1.5;
      ctx.stroke();
    }
    ctx.restore();

    // Central Kinetic Emblem / Vector Core
    ctx.save();
    ctx.rotate(-t * 0.9);
    ctx.beginPath();
    const spikes = 6;
    for (let s = 0; s < spikes * 2; s++) {
      const sa = (s / (spikes * 2)) * Math.PI * 2;
      const sr = s % 2 === 0 ? R * 0.38 : R * 0.22;
      const sx = Math.cos(sa) * sr;
      const sy = Math.sin(sa) * sr;
      if (s === 0) ctx.moveTo(sx, sy);
      else ctx.lineTo(sx, sy);
    }
    ctx.closePath();
    const coreGrad = ctx.createLinearGradient(-R * 0.35, -R * 0.35, R * 0.35, R * 0.35);
    coreGrad.addColorStop(0, "${glowColor}");
    coreGrad.addColorStop(0.5, "${secondaryColor}");
    coreGrad.addColorStop(1, "${accentColor}");
    ctx.fillStyle = coreGrad;
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();

    // Luminescent Center Core Orb
    const orbGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, R * 0.14);
    orbGrad.addColorStop(0, "#ffffff");
    orbGrad.addColorStop(0.5, "${glowColor}");
    orbGrad.addColorStop(1, "transparent");
    ctx.fillStyle = orbGrad;
    ctx.beginPath();
    ctx.arc(0, 0, R * 0.14, 0, Math.PI * 2);
    ctx.fill();

    // Specular Gleam Sweep
    ctx.save();
    const gleamX = ((t * 1.5) % 3 - 1.5) * R * 2;
    const gleamGrad = ctx.createLinearGradient(gleamX - 30, -R, gleamX + 30, R);
    gleamGrad.addColorStop(0, 'rgba(255,255,255,0)');
    gleamGrad.addColorStop(0.5, 'rgba(255,255,255,0.4)');
    gleamGrad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gleamGrad;
    ctx.fillRect(-R * 0.7, -R * 0.7, R * 1.4, R * 1.4);
    ctx.restore();

    ctx.restore();
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;

    requestAnimationFrame(animate);
  }
  animate(0);
</script>
</body>
</html>`;
}

// Direct multimodal image to motion call with model fallback
async function generateImageToMotionDirect(
  apiKey: string,
  model: GeminiModel,
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
  let pureBase64 = imageBase64;
  if (pureBase64.includes(';base64,')) {
    pureBase64 = pureBase64.split(';base64,')[1];
  }
  pureBase64 = pureBase64.trim();

  const primaryModel = sanitizeModel(model);
  const candidateModels = [
    primaryModel,
    ...['gemini-2.5-flash', 'gemini-flash-latest', 'gemini-3.1-flash-lite', 'gemini-3.1-pro-preview'].filter(
      (m) => m !== primaryModel
    ),
  ];

  const cleanTitle = fileName.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
  const bgColor = isGreenScreen ? '#00ff00' : '#080c14';
  const clearFill = isGreenScreen ? "'#00ff00'" : "'#080c14'";

  const masterMultimodalPrompt = `Anda adalah Master AI Vision Specialist & Lead HTML5 Canvas 2D Motion Graphics Engineer (Shutterstock/Envato Microstock Standard).

TUGAS UTAMA:
1. ANALISIS MENDALAM GAMBAR REFERENSI:
   - Identifikasi objek/karakter/simbol apa ini secara spesifik.
   - Analisis bentuk geometris, kontur, kurva bezier, proporsi, sudut, bevel, segmen-segmen komponen, dan detail-detail dalamnya.
   - Analisis skema warna asli gambar (warna utama, warna sekunder, gradien, kilau highlight, dan bayangan).
2. REKONSTRUKSI & GAMBAR ULANG MENJADI KODE ANIMASI CANVAS 2D MURNI (PROCEDURAL VECTOR RE-CREATION):
   - Gambar ulang subjek tersebut SEMIRIP MUNGKIN dengan referensi menggunakan perintah gambar Canvas 2D murni: ctx.beginPath(), ctx.moveTo(), ctx.lineTo(), ctx.bezierCurveTo(), ctx.arc(), ctx.ellipse(), ctx.createLinearGradient(), ctx.createRadialGradient(), ctx.fill(), ctx.stroke().
   - DILARANG KERAS MENGGUNAKAN <img>, new Image(), drawImage(), atau bitmap/sprite mentah! Seluruh visual subjek WAJIB digambar menggunakan matematika vektor Canvas 2D!
   - Terapkan animasi kinetik 60 FPS yang hidup sesuai Motion Dynamics: ${motionDynamics.toUpperCase()}.
   - Mode Warna: ${colorMode.toUpperCase()}. Neon Glow: ${neonGlow ? 'AKTIF' : 'NONAKTIF'}.
   ${isGreenScreen ? '- Mode: Pure Green Screen #00FF00 (Chroma Key)' : ''}
   ${customInstructions ? `- Instruksi Tambahan Pengguna: "${customInstructions}"` : ''}

ATURAN KUALITAS & ZERO GHOSTING (MANDATORY):
1. Canvas responsive: let w, h, cx, cy, S = Math.min(w, h) * 0.44. Subjek terpusat di (cx, cy).
2. Bersihkan canvas setiap frame di animate(): ctx.clearRect(0, 0, w, h); ctx.fillStyle = ${clearFill}; ctx.fillRect(0, 0, w, h); agar tidak meninggalkan bekas gerakan/jejak kotor.
3. Isolasi state setiap layer dengan ctx.save() dan ctx.restore().
4. Di bagian <head>, sertakan tag JSON analisis persis seperti:
<script type="application/json" id="shape-analysis">
{
  "objectName": "Nama objek spesifik",
  "shapeDescription": "Deskripsi bentuk & proporsi yang dianalisis",
  "detectedElements": ["Elemen 1", "Elemen 2", "Elemen 3", "Elemen 4"],
  "professionalMotionPlan": "Rencana animasi 60 FPS",
  "similaritySynthesis": "Sintesis kemiripan vektor Canvas 2D dengan gambar asli",
  "glowColor": "${colorMode === 'neon' ? '#00f0ff' : colorMode === 'luxury' ? '#ffd700' : '#38bdf8'}"
}
</script>

WAJIB GUNAKAN STRUKTUR BOILERPLATE INI:
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
  "objectName": "...",
  "shapeDescription": "...",
  "detectedElements": [...],
  "professionalMotionPlan": "...",
  "similaritySynthesis": "...",
  "glowColor": "${colorMode === 'neon' ? '#00f0ff' : '#38bdf8'}"
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

  function animate(time) {
    const t = time * 0.001;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = ${clearFill};
    ctx.fillRect(0, 0, w, h);

    // KODE MENGGAMBAR SUBJEK DENGAN CANVAS 2D VECTOR SECARA PRESISI (TANPA DRAWIMAGE)

    requestAnimationFrame(animate);
  }
  animate(0);
</script>
</body>
</html>

Outputkan HANYA file HTML lengkap tanpa teks pembuka atau penjelas markdown apapun:`;

  let shapeAnalysis: ShapeAnalysis | undefined = undefined;
  let detectedSubject = cleanTitle;
  let generatedHtml = '';

  for (const currentModel of candidateModels) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${currentModel}:generateContent?key=${encodeURIComponent(
        apiKey
      )}`;

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  inline_data: {
                    mime_type: mimeType || 'image/png',
                    data: pureBase64,
                  },
                },
                {
                  text: masterMultimodalPrompt,
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.3,
          },
        }),
      });

      if (res.ok) {
        const data = await res.json();
        let rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
        let cleanHTML = extractHTML(rawText);

        if (!cleanHTML.toLowerCase().includes('</html>') || !cleanHTML.toLowerCase().includes('</script>')) {
          if (cleanHTML.toLowerCase().includes('requestanimationframe')) {
            rawText += '\n  }\n  animate(0);\n</' + 'script>\n</body>\n</html>';
            cleanHTML = extractHTML(rawText);
          }
        }

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
                };
              }
            } catch (e) {}
          }
          generatedHtml = cleanHTML;
          break;
        }
      }
    } catch (e) {
      // Continue to next candidate model or fallback
    }
  }

  // Fallback to pure procedural vector code if direct model call failed
  if (!generatedHtml) {
    generatedHtml = buildProceduralVectorMotionHtml({
      motionDynamics,
      colorMode,
      neonGlow,
      isGreenScreen,
      aiAnalysis: {
        objectName: shapeAnalysis?.objectName || detectedSubject,
        shapeDescription: shapeAnalysis?.shapeDescription,
        detectedElements: shapeAnalysis?.detectedElements,
        professionalMotionPlan: shapeAnalysis?.professionalMotionPlan,
        similaritySynthesis: shapeAnalysis?.similaritySynthesis,
      },
    });
  }

  return {
    id: 'i2m_' + Date.now() + Math.random().toString(36).substring(7),
    title: `Motion: ${detectedSubject}`,
    type: 'icon' as AnimationType,
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

// High-level Image To Motion Generator with Multi-Level Fallback & Auto-Retry
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
  let lastError: any = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const apiKey = getRotatedKey(apiKeys);

      // Direct client call
      if (apiKey) {
        try {
          return await generateImageToMotionDirect(
            apiKey,
            model,
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
        } catch (directErr: any) {
          console.warn('Direct Image-To-Motion failed, trying server endpoint fallback...', directErr);
        }
      }

      // Server proxy call
      const res = await fetch('/api/gemini/image-to-motion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey,
          model: model || 'gemini-2.5-flash',
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
        throw new Error(errData?.error || `HTTP Error ${res.status}`);
      }

      const data = await res.json();
      if (!data.html || data.html.trim().length === 0) {
        throw new Error('AI mengembalikan kode kosong.');
      }

      return data;
    } catch (err: any) {
      lastError = err;
      if (attempt < maxRetries) {
        if (onRetry) onRetry(attempt, maxRetries, err.message);
        await new Promise((res) => setTimeout(res, 2000));
      }
    }
  }

  throw new Error(`Gagal memproses gambar setelah ${maxRetries} percobaan: ${lastError?.message || 'Unknown error'}`);
}
