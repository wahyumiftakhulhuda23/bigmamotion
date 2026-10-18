import { AnimationType, GeminiModel, ApiKeyTestResult, ColorMode, MotionDynamics, ShapeAnalysis } from '../types';
import { findCategoryById } from '../constants/categories';

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
      'Every prompt must describe 1 single central visual icon/symbol (no letters/text), sleek, modern and high precision. STRICT REQUIREMENT FOR ICON: Do NOT describe flying particles, debris, stars, or background clutter around the icon. Focus purely on the isolated icon itself and its internal geometric parts.';
  } else if (type === 'bg') {
    typeInstruction =
      'Every prompt must describe an elegant looping motion background concept (no text), seamless geometry, atmospheric waves, or thematic backdrop.';
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

  const catMeta = findCategoryById(subCategory, type);
  const categoryLine = catMeta
    ? `Microstock Category (Adobe Stock / Shutterstock): ${catMeta.enName} (${catMeta.name})\nCategory Theme & Keywords: ${catMeta.description} - ${catMeta.stockKeywords.join(', ')}\n`
    : (subCategory && subCategory !== 'all' && subCategory !== 'general' ? `Category / Domain: ${subCategory}\n` : '');

  const promptContent = `You are a Principal Motion Graphic Director for Adobe Stock & Shutterstock.
Generate exactly ${count} professional, highly marketable, and semantically rich animation prompts in English.

MANDATORY RULES FOR HIGH-QUALITY SHAPES & MEANING (ANTI-DEFECT):
1. MEANINGFUL & RECOGNIZABLE SUBJECT:
   - Each prompt MUST describe a concrete, clearly identifiable, meaningful visual object or scene (e.g. "Isometric Gold Crypto Coin with dimensional beveled rim and glowing holographic currency symbol", "Precision E-Commerce Shopping Cart with curved basket, rolling wheels, and glowing parcel", "Biotech DNA Double Helix rotating smoothly with glowing nucleotide rungs", "Cybersecurity Hologram Shield with interlocking hexagonal plates and pulsing central keyhole core", "Sleek Aerodynamic Electric Vehicle with chassis, roof cabin, and glowing alloy wheels").
   - STRICTLY FORBIDDEN: Abstract meaningless blobs, deformed random polygons, loose floating scribbles, or vague ambiguous geometry.
2. DETAILED SHAPE ANATOMY:
   - Clearly specify the primary body, secondary sub-components, physical joints, and dimensional lighting (specular reflection beam, gradient bevels, ambient inner glow).
3. COHERENT KINETIC MOTION:
   - Detail the coordinated continuous linear motion for each part (e.g. body breathes gently 0.96x-1.04x and floats ±10px on Y axis, wheels/gears rotate in sync, highlight beam sweeps across the surface, status lights cycle with smooth easing).

${categoryLine}Animation Type: ${String(type).toUpperCase()}
Visual Style: ${style}${colorModeDirective}${glowDirective}
Special Directives: ${typeInstruction}${keywordsDirective}${greenScreenDirective}

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

  const catMeta = findCategoryById(subCategory, type);
  const catInfo = catMeta ? `${catMeta.enName} (${catMeta.name}) - ${catMeta.description}` : subCategory;

  let typeInstructions = '';
  if (type === 'icon') {
    typeInstructions = `
ATURAN UTAMA ICON MOTION (SANGAT KRUSIAL - ANTI-BUG BENTUK & ZERO PARTICLE):
1. ISOLASI TOTAL ICON (TIDAK BOLEH ADA OBJEK/PARTIKEL ASING):
   - Tampilkan 1 simbol/vektor sentral berpresisi tinggi yang merepresentasikan subjek secara akurat di tengah canvas.
   - DILARANG KERAS memunculkan partikel melayang, debu berterbangan, bintik-bintik random, percikan/sparks liar, cincin orbit aneh, serpihan, pecahan, atau objek lain di luar bentuk icon utama!
   - Background kanvas di sekeliling icon HARUS 100% bersih, kosong, dan polos tanpa visual clutter atau noise apapun.
2. BENTUK GEOMETRIS IDEAL & PRESISI:
   - Bentuk geometris icon harus proporsional, solid, simetris/terstruktur rapi, tidak cacat, dan merepresentasikan subjek dengan presisi tinggi (rasio ketebalan garis rapi, penempatan fitur akurat, proporsi seimbang di cx, cy).
   - DILARANG TEKS/HURUF. Gunakan path vektor canvas yang bersih (ctx.beginPath(), ctx.roundRect(), ctx.arc(), ctx.lineTo()).
3. GERAKAN LINEAR SELARAS PROMPT:
   - Seluruh pergerakan animasi HARUS linear dan mengikuti deskripsi gerakan yang tertera di dalam prompt.
   - Gerakan kinetik HARUS diterapkan langsung pada badan icon dan anatomi internalnya (misal: rotasi halus elemen internal, breathing pulse 0.96x-1.04x, artikulasi roda gigi/lensa/tuas, osilasi floating lembut tanpa partikel luar).`;
  } else if (type === 'bg') {
    typeInstructions = `
ATURAN UTAMA BACKGROUND MOTION:
- Animasi latar belakang bergerak penuh di seluruh canvas (waves, flowing grid, orbital field, matrix HUD, atau synthwave horizon).
- DILARANG TEKS/HURUF. Bergerak dengan ritme harmonis linear tanpa jeda sejalan dengan kategori dan deskripsi prompt.`;
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
PANDUAN GERAKAN MECHANICAL & ARTICULATED:
- Komponen mekanik berputar dan berosilasi presisi seiring waktu t dengan artikulasi multi-part yang mulus dan bertenaga.`;
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
- Terapkan efek luminescence bertingkat: ctx.shadowBlur = 28 + Math.sin(t * 4.0) * 12; ctx.shadowColor = primaryColor;
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
- Objek utama WAJIB menggunakan warna yang SANGAT KONTRAS tajam terhadap latar hijau (Misal: Putih Salju #FFFFFF, Kuning Emas #FFD700, Cyan Terang #00F3FF, Magenta #FF007F, Oranye Menyala #FF6B00, Merah Terang #FF3333).
- HINDARI KERAS memakai warna hijau #00ff00, hijau lime, atau hijau tua pada objek utama agar objek tidak transparan/hilang saat di-chroma-key.`
    : '';

  const systemPrompt = `Anda adalah Lead HTML5 Motion Designer Spesialis Video Asset & Microstock (Shutterstock/Envato Standard).
Tugas: Buat 1 file HTML animasi Canvas 2D yang bervariasi, dinamis, dan MINIM BUG BENTUK/GERAKAN.

PARAMETER TERPILIH:
- Subjek/Prompt: "${promptTopic}"
- Tipe Animasi: ${String(type).toUpperCase()}
- Kategori Microstock: ${catInfo}
- Gaya Visual: ${style}
- Mode Warna: ${colorMode.toUpperCase()}
- Status Neon Glow: ${neonGlow ? 'AKTIF' : 'NONAKTIF (Flat / Tanpa Blur)'}
- Gerakan: LINEAR MOTION (Selaras & terintegrasi dengan deskripsi Prompt)
${isGreenScreen ? '- Mode: Pure Green Screen #00FF00 (Chroma Key)' : ''}

${typeInstructions}
${motionGuide}
${styleAndColorGuide}
${greenScreenDirective}

ATURAN ANTI-BUG, ANTI-CACAT BENTUK & KUALITAS SEMANTIK TINGGI (MANDATORY):
1. MAKNA BENTUK NYATA & BERKUALITAS TINGGI (HIGH SEMANTIC RECOGNITION):
   - Bentuk yang digambar WAJIB merepresentasikan subjek secara akurat, bermakna, dan langsung dikenali secara visual tanpa keraguan!
   - DILARANG KERAS menghasilkan bentuk cacat, poligon tak beraturan yang aneh, garis meliuk tak bermakna, atau lingkaran/kotak polos tanpa anatomi subjek.
   - ANATOMI SUBJEK WAJIB LENGKAP:
     * Finansial/Koin: Wajib bodi koin 3D dengan beveled rim ganda, simbol timbul di tengah ($, €, ₿, bintang, atau grafik naik), dan kilau cahaya sapuan (specular gleam).
     * Keranjang / E-Commerce: Wajib rangka keranjang kawat melengkung rapi, pegangan sudut dengan grip bar, 2 roda berporos rapi, dan bingkisan/paket di dalamnya.
     * Transportasi / Mobil: Wajib bodi sasis aerodinamis terpadu, lekukan kaca kabin, 2 roda ban tebal dengan velg berputar di pusat poros, dan lampu depan.
     * Teknologi / AI / Server: Wajib chip silikon/prosesor dengan pin emas, jalur sirkuit bercahaya yang presisi, dan inti core yang berdenyut ritmis.
     * Medis / Biotech: Wajib salib simetris dengan bevel halus atau heliks DNA berputar dengan anak tangga basa nukleotida yang presisi.
2. GEOMETRI VEKTOR BERSIH & JALUR TERTUTUP (ZERO SHAPE DEFECTS):
   - Setiap bidang bentuk WAJIB menggunakan ctx.beginPath() dan diakhiri ctx.closePath() sebelum ctx.fill() atau ctx.stroke().
   - Gunakan kurva matematika mulus: ctx.roundRect(), ctx.arc(), ctx.ellipse(), dan bezierCurveTo dengan titik kontrol tangen yang seimbang.
   - DILARANG titik vertex melenceng tajam atau kurva terbuka yang membuat bentuk tampak bocor/cacat.
3. SATU MATRIX INDUK UNTUK SATU OBJEK (UNIFIED PARENT MATRIX - ANTI-DETACH):
   - Seluruh bagian suatu objek WAJIB digambar di dalam SATU BLOK TRANSFORMASI INDUK yang sama:
     ctx.save();
     ctx.translate(posX, posY); // posX = cx, posY = cy + floating/bounce
     ctx.rotate(rot);
     ctx.scale(scaleX, scaleY);
     // SEMUA SUB-KOMPONEN DIGAMBAR RELATIF TERHADAP (0, 0)!
     ctx.restore();
4. ANATOMI LOGIS & SAMBUNGAN FISIK KOKOH:
   - Setiap bagian komponen harus melekat kokoh dan proporsional pada bodi utama (tidak boleh ada roda yang melayang di luar bodi, tidak boleh ada gagang yang melayang terpisah).
5. ISOLASI TOTAL ICON (ZERO PARTIKEL & ZERO NOISE LUAR):
   - Untuk tipe ICON: Kanvas di sekeliling icon HARUS 100% bersih, kosong, dan polos. DILARANG KERAS memunculkan partikel melayang, debu berterbangan, bintik-bintik random, percikan/sparks liar, cincin orbit aneh, serpihan, pecahan, atau objek lain di luar bentuk icon utama!
6. PENCAHAYAAN MIKROSTOK & SPECULAR BEAM:
   - Terapkan dual-tone gradient untuk volume (bagian atas lebih terang, bagian bawah lebih teduh).
   - Tambahkan sapuan pantulan cahaya berkilau (specular highlight beam) yang melintasi permukaan objek secara periodik.
7. ISOLASI CANVAS CONTEXT & NEON GLOW: Setiap elemen WAJIB dibungkus ctx.save() dan ctx.restore(). Jika menggunakan efek Neon/Glow (ctx.shadowBlur, ctx.shadowColor), HANYA terapkan saat menggambar objek bersangkutan dan segera reset (ctx.shadowBlur = 0; ctx.shadowColor = 'transparent';).
8. HILANGKAN BEKAS GERAKAN / ZERO MOTION TRAILS: Setiap frame baru WAJIB diawali dengan pembersihan kanvas total (ctx.clearRect(0, 0, w, h); lalu ctx.fillStyle = ${clearFill}; ctx.fillRect(0, 0, w, h);).
9. KOORDINAT TERPUSAT & FRAMING PROPOSIONAL:
   - Skala S = Math.min(w, h) * ${type === 'icon' ? '0.44' : '0.65'};
   - Objek Icon / Grafis harus proporsional & memenuhi frame sekitar 80-88% tinggi canvas dengan margin aman.
10. GERAKAN KINETIK NYATA 60 FPS LINEAR: Objek HARUS memiliki gerakan aktif yang linear dan selaras dengan prompt (floating osilasi Y ±(S*0.10), breathing scale pulse 0.96x-1.04x, artikulasi rotasi/transformasi internal yang halus).
11. RINGKAS & TUNTAS: Buat kode efisien 180 - 280 baris yang langsung looping 60 FPS tanpa henti.

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
    S = Math.min(w, h) * ${type === 'icon' ? '0.44' : '0.65'};
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

// High-Precision Procedural Vector Canvas HTML Generator (100% Pure Procedural Canvas 2D - Smart Semantic Subject Vector, No Generic Gear)
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

  const subjectTitle = (aiAnalysis.objectName || 'Vector Motion Subject').toLowerCase();

  const shapeAnalysisJson = JSON.stringify({
    objectName: aiAnalysis.objectName || 'Vector Motion Graphic',
    shapeDescription: aiAnalysis.shapeDescription || 'Rekonstruksi vektor Canvas 2D 60 FPS tingkat tinggi dengan multi-layer kinetic transforms.',
    detectedElements: aiAnalysis.detectedElements || ['Vektor Utama Geometris', 'Gradien Multi-Stop', 'Partikel Kinetik', 'Luminescence Aura'],
    professionalMotionPlan: aiAnalysis.professionalMotionPlan || `Animasi kinetik 60 FPS dengan dinamika ${motionDynamics.toUpperCase()} dan pencahayaan ${colorMode.toUpperCase()}.`,
    similaritySynthesis: aiAnalysis.similaritySynthesis || 'Sintesis bentuk geometris proporsional, kontur elegan, dan warna referensi yang direkonstruksi utuh.',
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

  function animate(time) {
    const t = time * 0.001;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = ${clearFill};
    ctx.fillRect(0, 0, w, h);

    // Active, energetic transforms (60 FPS clear kinetic movement)
    let posX = cx;
    let posY = cy;
    let scaleX = 1;
    let scaleY = 1;
    let rot = 0;

    const dyn = "${motionDynamics}";
    if (dyn === 'bounce') {
      const bounce = Math.abs(Math.sin(t * 3.8));
      posY = cy - (bounce * S * 0.35) + (S * 0.06);
      const squash = 1 + 0.25 * (1 - bounce);
      scaleX = 1 / Math.sqrt(squash);
      scaleY = squash;
      rot = Math.sin(t * 2.5) * 0.08;
    } else if (dyn === 'orbital') {
      posX = cx + Math.cos(t * 2.0) * (S * 0.25);
      posY = cy + Math.sin(t * 2.0) * (S * 0.12);
      const depthScale = 0.88 + 0.24 * (Math.sin(t * 2.0) + 1) * 0.5;
      scaleX = depthScale;
      scaleY = depthScale;
      rot = Math.sin(t * 1.8) * 0.15;
    } else if (dyn === 'morph') {
      const pulse = 1 + Math.sin(t * 4.0) * 0.08;
      scaleX = pulse;
      scaleY = 1 / pulse;
      posX = cx + Math.sin(t * 1.5) * 12;
      posY = cy + Math.cos(t * 2.0) * 8;
      rot = Math.sin(t * 2.0) * 0.10;
    } else if (dyn === 'cyber') {
      const step = Math.floor(t * 8) / 8;
      posX = cx + Math.sin(step * Math.PI * 2) * 10;
      posY = cy + Math.cos(step * Math.PI * 2) * 6;
      rot = Math.sin(step * Math.PI) * 0.10;
      scaleX = 1 + Math.sin(step * 10) * 0.04;
      scaleY = 1 + Math.cos(step * 10) * 0.04;
    } else if (dyn === 'mechanical') {
      posX = cx + Math.sin(t * 1.8) * 6;
      posY = cy + Math.cos(t * 2.2) * 5;
      rot = Math.sin(t * 2.0) * 0.08;
      scaleX = 1 + Math.sin(t * 3.0) * 0.03;
      scaleY = scaleX;
    } else {
      // Flow & harmonic organic floating with prominent lively amplitude
      posX = cx + Math.sin(t * 2.4) * (S * 0.12);
      posY = cy + Math.cos(t * 3.0) * (S * 0.14);
      rot = Math.sin(t * 2.0) * 0.08;
      const breathe = 1 + Math.sin(t * 3.2) * 0.05;
      scaleX = breathe;
      scaleY = breathe;
    }

    // 1. Central Semantic Vector Object (100% Unified Parent Matrix, Anti-Detach, Zero Particles)
    ctx.save();
    ctx.translate(posX, posY);
    ctx.scale(scaleX, scaleY);
    ctx.rotate(rot);

    if (${neonGlow}) {
      ctx.shadowColor = "${glowColor}";
      ctx.shadowBlur = 28 + Math.sin(t * 4.0) * 12;
    }

    const R = S * 0.75;
    const title = "${subjectTitle}";

    // =========================================================================
    // SMART SEMANTIC RECONSTRUCTION (100% Sensible Anatomy & Rigged Parts)
    // =========================================================================
    if (title.includes('phone') || title.includes('mobile') || title.includes('hp') || title.includes('handphone') || title.includes('smartphone') || title.includes('gadget') || title.includes('iphone') || title.includes('android')) {
      // 1. SMARTPHONE / MOBILE DEVICE (Pristine Symmetrical Chassis, Screen, Camera, Dynamic Island)
      const pw = R * 0.88;
      const ph = R * 1.62;

      // Outer Phone Titanium Chassis
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(-pw / 2, -ph / 2, pw, ph, 24);
      } else {
        ctx.rect(-pw / 2, -ph / 2, pw, ph);
      }
      const phoneChassisGrad = ctx.createLinearGradient(-pw / 2, -ph / 2, pw / 2, ph / 2);
      phoneChassisGrad.addColorStop(0, '#334155');
      phoneChassisGrad.addColorStop(0.5, '#0f172a');
      phoneChassisGrad.addColorStop(1, '#1e293b');
      ctx.fillStyle = phoneChassisGrad;
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = "${glowColor}";
      ctx.stroke();

      // Inner Screen Bezel & OLED Display
      ctx.save();
      ctx.beginPath();
      const sw = pw - 14;
      const sh = ph - 14;
      if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(-sw / 2, -sh / 2, sw, sh, 18);
      } else {
        ctx.rect(-sw / 2, -sh / 2, sw, sh);
      }
      const screenGrad = ctx.createLinearGradient(0, -sh / 2, 0, sh / 2);
      screenGrad.addColorStop(0, '#020617');
      screenGrad.addColorStop(0.5, '#0b1329');
      screenGrad.addColorStop(1, '#020617');
      ctx.fillStyle = screenGrad;
      ctx.fill();
      ctx.clip(); // Keep all screen graphics strictly inside the glass

      // Screen Wallpaper Glow Wave
      const waveGrad = ctx.createRadialGradient(0, Math.sin(t * 2) * 20, 10, 0, 0, sw * 0.7);
      waveGrad.addColorStop(0, "${glowColor}");
      waveGrad.addColorStop(0.6, "${secondaryColor}");
      waveGrad.addColorStop(1, 'rgba(2, 6, 23, 0)');
      ctx.fillStyle = waveGrad;
      ctx.globalAlpha = 0.45;
      ctx.beginPath();
      ctx.arc(0, Math.sin(t * 2) * 20, sw * 0.7, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1.0;

      // Glowing UI Cards / Analytics Chart inside display
      ctx.strokeStyle = "${accentColor}";
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (let x = -sw * 0.38; x <= sw * 0.38; x += 12) {
        const y = Math.sin(t * 4 + x * 0.08) * 16 + 10;
        if (x === -sw * 0.38) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // UI Metric Pill Cards
      ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
      if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(-sw * 0.38, -sh * 0.28, sw * 0.76, 32, 8);
        ctx.roundRect(-sw * 0.38, sh * 0.18, sw * 0.76, 24, 6);
      }
      ctx.fill();

      ctx.restore();

      // Top Dynamic Island Pill (Centered, firmly attached)
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(-22, -ph / 2 + 12, 44, 12, 6);
      } else {
        ctx.rect(-22, -ph / 2 + 12, 44, 12);
      }
      ctx.fillStyle = '#000000';
      ctx.fill();
      // Mini camera lens
      ctx.beginPath();
      ctx.arc(-8, -ph / 2 + 18, 3, 0, Math.PI * 2);
      ctx.fillStyle = '#1e293b';
      ctx.fill();

      // Bottom Home Indicator Bar (Centered, firmly attached)
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(-26, ph / 2 - 16, 52, 4, 2);
      } else {
        ctx.rect(-26, ph / 2 - 16, 52, 4);
      }
      ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
      ctx.fill();

    } else if (title.includes('bag') || title.includes('tas') || title.includes('backpack') || title.includes('tote') || title.includes('luggage') || title.includes('koper') || title.includes('ransel') || title.includes('wallet') || title.includes('dompet')) {
      // 2. BAG / TOTE / LUGGAGE (Unified Anchored Handles & Main Pouch)
      const bw = R * 1.18;
      const bh = R * 1.05;
      const topY = -bh * 0.42;

      // Handle Straps (WAJIB Kokoh menempel di bibir atas tas)
      const strapX = bw * 0.24;
      ctx.beginPath();
      ctx.moveTo(-strapX, topY);
      ctx.bezierCurveTo(-strapX, topY - R * 0.55, strapX, topY - R * 0.55, strapX, topY);
      ctx.lineWidth = 11;
      ctx.strokeStyle = "${secondaryColor}";
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(-strapX + 2, topY);
      ctx.bezierCurveTo(-strapX + 2, topY - R * 0.50, strapX - 2, topY - R * 0.50, strapX - 2, topY);
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();

      // Metal Grommets at Anchors
      ctx.fillStyle = "${accentColor}";
      ctx.beginPath();
      ctx.arc(-strapX, topY, 7, 0, Math.PI * 2);
      ctx.arc(strapX, topY, 7, 0, Math.PI * 2);
      ctx.fill();

      // Main Bag Body (Curved Luxury Pouch)
      ctx.beginPath();
      ctx.moveTo(-bw * 0.42, topY);
      ctx.lineTo(bw * 0.42, topY);
      ctx.quadraticCurveTo(bw * 0.52, topY + bh * 0.5, bw * 0.46, topY + bh);
      ctx.quadraticCurveTo(0, topY + bh + 14, -bw * 0.46, topY + bh);
      ctx.quadraticCurveTo(-bw * 0.52, topY + bh * 0.5, -bw * 0.42, topY);
      ctx.closePath();
      const bagGrad = ctx.createLinearGradient(-bw * 0.5, topY, bw * 0.5, topY + bh);
      bagGrad.addColorStop(0, "${glowColor}");
      bagGrad.addColorStop(0.5, "${secondaryColor}");
      bagGrad.addColorStop(1, '#0f172a');
      ctx.fillStyle = bagGrad;
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();

      // Front Flap / Leather Pocket
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(-bw * 0.34, topY + 22, bw * 0.68, bh * 0.42, 10);
      } else {
        ctx.rect(-bw * 0.34, topY + 22, bw * 0.68, bh * 0.42);
      }
      ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = "${accentColor}";
      ctx.stroke();

      // Center Metallic Emblem Clasp
      ctx.beginPath();
      ctx.arc(0, topY + bh * 0.42 + 22, 9, 0, Math.PI * 2);
      ctx.fillStyle = "${accentColor}";
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();

    } else if (title.includes('car') || title.includes('mobil') || title.includes('vehicle') || title.includes('truck') || title.includes('automotive') || title.includes('wheel') || title.includes('roda')) {
      // 3. AUTOMOTIVE / CAR (Streamlined Chassis with Integrated Spinning Wheels)
      const cw = R * 1.55;
      const ch = R * 0.65;
      const baseY = R * 0.18;
      const rearWheelX = -cw * 0.26;
      const frontWheelX = cw * 0.24;

      // Streamlined Car Chassis with Wheel Arches
      ctx.beginPath();
      ctx.moveTo(-cw * 0.50, baseY); // Rear bumper
      ctx.lineTo(-cw * 0.48, baseY - ch * 0.35); // Rear boot
      ctx.quadraticCurveTo(-cw * 0.35, baseY - ch * 0.42, -cw * 0.22, baseY - ch * 0.88); // Rear windshield
      ctx.lineTo(cw * 0.08, baseY - ch * 0.88); // Roof
      ctx.quadraticCurveTo(cw * 0.28, baseY - ch * 0.45, cw * 0.46, baseY - ch * 0.22); // Front windshield & bonnet
      ctx.lineTo(cw * 0.52, baseY); // Front bumper
      ctx.lineTo(frontWheelX + R * 0.22, baseY);
      ctx.arc(frontWheelX, baseY, R * 0.22, 0, Math.PI, true); // Front wheel arch
      ctx.lineTo(rearWheelX + R * 0.22, baseY);
      ctx.arc(rearWheelX, baseY, R * 0.22, 0, Math.PI, true); // Rear wheel arch
      ctx.lineTo(-cw * 0.50, baseY);
      ctx.closePath();

      const carGrad = ctx.createLinearGradient(-cw * 0.5, baseY - ch, cw * 0.5, baseY);
      carGrad.addColorStop(0, "${glowColor}");
      carGrad.addColorStop(0.5, "${secondaryColor}");
      carGrad.addColorStop(1, '#0f172a');
      ctx.fillStyle = carGrad;
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();

      // Tinted Windows
      ctx.beginPath();
      ctx.moveTo(-cw * 0.20, baseY - ch * 0.82);
      ctx.lineTo(cw * 0.06, baseY - ch * 0.82);
      ctx.lineTo(cw * 0.22, baseY - ch * 0.42);
      ctx.lineTo(-cw * 0.28, baseY - ch * 0.42);
      ctx.closePath();
      ctx.fillStyle = '#0f172a';
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = "${accentColor}";
      ctx.stroke();

      // Glowing Headlights
      ctx.beginPath();
      ctx.arc(cw * 0.48, baseY - ch * 0.15, 6, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();

      // Wheels Helper (Firmly locked inside wheel arches, rotating spokes)
      function drawRiggedWheel(wx, wy) {
        ctx.save();
        ctx.translate(wx, wy);

        // Black Rubber Tire
        ctx.beginPath();
        ctx.arc(0, 0, R * 0.20, 0, Math.PI * 2);
        ctx.fillStyle = '#090d16';
        ctx.fill();
        ctx.lineWidth = 3.5;
        ctx.strokeStyle = "${accentColor}";
        ctx.stroke();

        // Metallic Rim
        ctx.beginPath();
        ctx.arc(0, 0, R * 0.12, 0, Math.PI * 2);
        ctx.fillStyle = '#1e293b';
        ctx.fill();

        // Rotating Spokes (Velg berputar presisi di poros pusat roda)
        ctx.rotate(t * 12);
        for (let sp = 0; sp < 5; sp++) {
          const a = (sp / 5) * Math.PI * 2;
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(Math.cos(a) * (R * 0.12), Math.sin(a) * (R * 0.12));
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 2.5;
          ctx.stroke();
        }

        // Center Cap
        ctx.beginPath();
        ctx.arc(0, 0, 4, 0, Math.PI * 2);
        ctx.fillStyle = "${glowColor}";
        ctx.fill();

        ctx.restore();
      }

      drawRiggedWheel(rearWheelX, baseY);
      drawRiggedWheel(frontWheelX, baseY);

    } else if (title.includes('camera') || title.includes('foto') || title.includes('lens') || title.includes('kamera')) {
      // 4. CAMERA (Sleek Camera Chassis, Pulsing Aperture Rings, Shutter Button)
      const camW = R * 1.45;
      const camH = R * 1.05;

      // Camera Body
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(-camW / 2, -camH / 2, camW, camH, 20);
      } else {
        ctx.rect(-camW / 2, -camH / 2, camW, camH);
      }
      const camGrad = ctx.createLinearGradient(-camW / 2, -camH / 2, camW / 2, camH / 2);
      camGrad.addColorStop(0, "${glowColor}");
      camGrad.addColorStop(0.5, "${secondaryColor}");
      camGrad.addColorStop(1, '#0f172a');
      ctx.fillStyle = camGrad;
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();

      // Top Shutter Button & Flash Module (Firmly mounted)
      ctx.fillStyle = "${accentColor}";
      ctx.fillRect(-camW * 0.35, -camH / 2 - 10, 24, 10);
      ctx.beginPath();
      ctx.arc(camW * 0.28, -camH * 0.28, 9, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();

      // Concentric Master Lens Rings
      for (let lr = 3; lr >= 1; lr--) {
        const radius = R * 0.38 * (lr / 3);
        ctx.beginPath();
        ctx.arc(0, 6, radius, 0, Math.PI * 2);
        ctx.fillStyle = lr === 1 ? '#020617' : (lr === 2 ? "${secondaryColor}" : '#0f172a');
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.strokeStyle = lr === 1 ? "${glowColor}" : '#ffffff';
        ctx.stroke();
      }

      // Glowing Aperture Iris
      ctx.beginPath();
      ctx.arc(0, 6, R * 0.08 + Math.sin(t * 3) * 4, 0, Math.PI * 2);
      ctx.fillStyle = "${accentColor}";
      ctx.fill();

    } else if (title.includes('cart') || title.includes('shopping') || title.includes('belanja') || title.includes('toko') || title.includes('keranjang')) {
      // 5. SHOPPING CART (Sturdy Wireframe Basket, Firm Handle, Integrated Wheels)
      const basketW = R * 1.25;
      const basketH = R * 0.75;

      // Basket Wireframe
      ctx.beginPath();
      ctx.moveTo(-basketW * 0.45, -basketH * 0.45);
      ctx.lineTo(basketW * 0.45, -basketH * 0.45);
      ctx.lineTo(basketW * 0.32, basketH * 0.40);
      ctx.lineTo(-basketW * 0.35, basketH * 0.40);
      ctx.closePath();
      const cartGrad = ctx.createLinearGradient(-basketW * 0.5, -basketH * 0.5, basketW * 0.5, basketH * 0.5);
      cartGrad.addColorStop(0, "${glowColor}");
      cartGrad.addColorStop(1, "${secondaryColor}");
      ctx.fillStyle = cartGrad;
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();

      // Handle (Welded firmly to top left)
      ctx.beginPath();
      ctx.moveTo(-basketW * 0.45, -basketH * 0.45);
      ctx.lineTo(-basketW * 0.62, -basketH * 0.72);
      ctx.lineWidth = 6;
      ctx.strokeStyle = "${accentColor}";
      ctx.stroke();

      // Lower Wheels (Firmly seated on base)
      ctx.beginPath();
      ctx.arc(-basketW * 0.22, basketH * 0.58, 12, 0, Math.PI * 2);
      ctx.arc(basketW * 0.22, basketH * 0.58, 12, 0, Math.PI * 2);
      ctx.fillStyle = '#0f172a';
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = "${glowColor}";
      ctx.stroke();

    } else if (title.includes('cup') || title.includes('coffee') || title.includes('tea') || title.includes('kopi') || title.includes('cangkir') || title.includes('mug')) {
      // 6. COFFEE CUP / MUG (Solid Ceramic Body, Side Handle, Animated Steam)
      const cupW = R * 1.1;
      const cupH = R * 0.95;

      // Side Handle (Firmly attached to right wall)
      ctx.beginPath();
      ctx.arc(cupW * 0.38, 0, cupH * 0.32, -Math.PI * 0.45, Math.PI * 0.45);
      ctx.lineWidth = 9;
      ctx.strokeStyle = "${secondaryColor}";
      ctx.stroke();

      // Cup Body (Tapered Cylinder)
      ctx.beginPath();
      ctx.moveTo(-cupW * 0.45, -cupH * 0.42);
      ctx.lineTo(cupW * 0.45, -cupH * 0.42);
      ctx.quadraticCurveTo(cupW * 0.42, cupH * 0.48, 0, cupH * 0.48);
      ctx.quadraticCurveTo(-cupW * 0.42, cupH * 0.48, -cupW * 0.45, -cupH * 0.42);
      ctx.closePath();
      const cupGrad = ctx.createLinearGradient(-cupW * 0.5, -cupH * 0.5, cupW * 0.5, cupH * 0.5);
      cupGrad.addColorStop(0, "${glowColor}");
      cupGrad.addColorStop(0.5, "${secondaryColor}");
      cupGrad.addColorStop(1, '#0f172a');
      ctx.fillStyle = cupGrad;
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();

      // Rising Harmonic Steam
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = "${accentColor}";
      for (let s = -1; s <= 1; s++) {
        ctx.beginPath();
        const steamX = s * 22;
        ctx.moveTo(steamX, -cupH * 0.48);
        ctx.quadraticCurveTo(steamX + Math.sin(t * 3 + s) * 12, -cupH * 0.72, steamX, -cupH * 0.96);
        ctx.stroke();
      }

    } else if (title.includes('laptop') || title.includes('computer') || title.includes('pc') || title.includes('monitor') || title.includes('komputer')) {
      // 7. LAPTOP / COMPUTER (Angled Display, Base Keyboard Deck, Trackpad)
      const lapW = R * 1.45;
      const lapH = R * 0.92;

      // Upper Screen
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(-lapW * 0.42, -lapH * 0.85, lapW * 0.84, lapH * 0.75, 10);
      } else {
        ctx.rect(-lapW * 0.42, -lapH * 0.85, lapW * 0.84, lapH * 0.75);
      }
      ctx.fillStyle = '#0f172a';
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = "${glowColor}";
      ctx.stroke();

      // Glowing Screen Content
      ctx.fillStyle = "${secondaryColor}";
      ctx.fillRect(-lapW * 0.35, -lapH * 0.75, lapW * 0.70, lapH * 0.55);

      // Bottom Keyboard Deck
      ctx.beginPath();
      ctx.moveTo(-lapW * 0.48, -lapH * 0.05);
      ctx.lineTo(lapW * 0.48, -lapH * 0.05);
      ctx.lineTo(lapW * 0.52, lapH * 0.25);
      ctx.lineTo(-lapW * 0.52, lapH * 0.25);
      ctx.closePath();
      ctx.fillStyle = '#1e293b';
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();

      // Trackpad
      ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.fillRect(-20, lapH * 0.08, 40, 14);

    } else if (title.includes('heart') || title.includes('love') || title.includes('health') || title.includes('medis')) {
      // 8. HEART / MEDICAL (Symmetrical Bezier Heart with Pulse Cardiogram)
      const hw = R * 1.1;
      const hh = R * 1.1;
      ctx.beginPath();
      ctx.moveTo(0, hh * 0.45);
      ctx.bezierCurveTo(hw * 0.65, 0, hw * 0.65, -hh * 0.45, 0, -hh * 0.20);
      ctx.bezierCurveTo(-hw * 0.65, -hh * 0.45, -hw * 0.65, 0, 0, hh * 0.45);
      ctx.closePath();
      const heartGrad = ctx.createLinearGradient(0, -hh * 0.5, 0, hh * 0.5);
      heartGrad.addColorStop(0, '#ff007f');
      heartGrad.addColorStop(0.5, "${glowColor}");
      heartGrad.addColorStop(1, '#7f00ff');
      ctx.fillStyle = heartGrad;
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();

      // Pulsing ECG Cardiogram Line
      ctx.beginPath();
      ctx.moveTo(-hw * 0.38, 0);
      ctx.lineTo(-12, 0);
      ctx.lineTo(-4, -18);
      ctx.lineTo(6, 18);
      ctx.lineTo(14, 0);
      ctx.lineTo(hw * 0.38, 0);
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();

    } else if (title.includes('shield') || title.includes('protect') || title.includes('security') || title.includes('lock') || title.includes('gembok')) {
      // 9. SECURITY SHIELD & EMBLEM
      ctx.beginPath();
      ctx.moveTo(0, -R * 0.75);
      ctx.lineTo(R * 0.65, -R * 0.5);
      ctx.lineTo(R * 0.65, R * 0.15);
      ctx.quadraticCurveTo(R * 0.65, R * 0.65, 0, R * 0.85);
      ctx.quadraticCurveTo(-R * 0.65, R * 0.65, -R * 0.65, R * 0.15);
      ctx.lineTo(-R * 0.65, -R * 0.5);
      ctx.closePath();
      const grad = ctx.createLinearGradient(-R * 0.65, -R * 0.75, R * 0.65, R * 0.85);
      grad.addColorStop(0, "${glowColor}");
      grad.addColorStop(0.5, "${secondaryColor}");
      grad.addColorStop(1, "${accentColor}");
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();

      // Center Keyhole / Lock Core
      ctx.beginPath();
      ctx.arc(0, -R * 0.08, R * 0.16, 0, Math.PI * 2);
      ctx.fillStyle = '#0f172a';
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-6, -R * 0.04);
      ctx.lineTo(6, -R * 0.04);
      ctx.lineTo(10, R * 0.22);
      ctx.lineTo(-10, R * 0.22);
      ctx.closePath();
      ctx.fillStyle = '#0f172a';
      ctx.fill();

    } else if (title.includes('rocket') || title.includes('launch') || title.includes('space') || title.includes('fly') || title.includes('roket')) {
      // 10. SPACE ROCKET
      ctx.beginPath();
      ctx.moveTo(0, -R * 0.85);
      ctx.bezierCurveTo(R * 0.45, -R * 0.4, R * 0.45, R * 0.4, 0, R * 0.6);
      ctx.bezierCurveTo(-R * 0.45, R * 0.4, -R * 0.45, -R * 0.4, 0, -R * 0.85);
      ctx.closePath();
      const rGrad = ctx.createLinearGradient(0, -R * 0.85, 0, R * 0.6);
      rGrad.addColorStop(0, '#ffffff');
      rGrad.addColorStop(0.4, "${glowColor}");
      rGrad.addColorStop(1, "${secondaryColor}");
      ctx.fillStyle = rGrad;
      ctx.fill();
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();

      // Porthole Window
      ctx.beginPath();
      ctx.arc(0, -R * 0.2, R * 0.18, 0, Math.PI * 2);
      ctx.fillStyle = '#0f172a';
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = "${accentColor}";
      ctx.stroke();

      // Exhaust Thruster Flame (Pulsating)
      const flameLen = R * (0.35 + Math.sin(t * 18) * 0.12);
      ctx.beginPath();
      ctx.moveTo(-R * 0.18, R * 0.6);
      ctx.lineTo(0, R * 0.6 + flameLen);
      ctx.lineTo(R * 0.18, R * 0.6);
      ctx.closePath();
      ctx.fillStyle = "${accentColor}";
      ctx.fill();

    } else {
      // 11. MASTER HIGH-TECH GEOMETRIC CORE (Pristine Hexagonal Vector Emblem)
      ctx.beginPath();
      for (let s = 0; s < 6; s++) {
        const ang = (s / 6) * Math.PI * 2 - Math.PI / 2;
        const hx = Math.cos(ang) * (R * 0.72);
        const hy = Math.sin(ang) * (R * 0.72);
        if (s === 0) ctx.moveTo(hx, hy);
        else ctx.lineTo(hx, hy);
      }
      ctx.closePath();
      const hexGrad = ctx.createLinearGradient(-R * 0.7, -R * 0.7, R * 0.7, R * 0.7);
      hexGrad.addColorStop(0, "${glowColor}");
      hexGrad.addColorStop(0.5, "${secondaryColor}");
      hexGrad.addColorStop(1, "${accentColor}");
      ctx.fillStyle = hexGrad;
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();

      // Inner Glowing Diamond
      ctx.save();
      ctx.rotate(Math.sin(t * 2.5) * 0.2);
      ctx.beginPath();
      ctx.moveTo(0, -R * 0.38);
      ctx.lineTo(R * 0.38, 0);
      ctx.lineTo(0, R * 0.38);
      ctx.lineTo(-R * 0.38, 0);
      ctx.closePath();
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.fill();
      ctx.restore();

      // Concentric Orbital Ring
      ctx.beginPath();
      ctx.ellipse(0, 0, R * 0.92, R * 0.35, Math.sin(t * 1.5) * 0.4, 0, Math.PI * 2);
      ctx.strokeStyle = "${accentColor}";
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }

    // Specular Gleam Sweep (Dynamic light sheen across surface)
    ctx.save();
    const gleamX = ((t * 1.4) % 3 - 1.5) * R * 2.2;
    const gleamGrad = ctx.createLinearGradient(gleamX - 35, -R, gleamX + 35, R);
    gleamGrad.addColorStop(0, 'rgba(255,255,255,0)');
    gleamGrad.addColorStop(0.5, 'rgba(255,255,255,0.55)');
    gleamGrad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gleamGrad;
    ctx.fillRect(-R * 0.85, -R * 0.85, R * 1.7, R * 1.7);
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

  const masterMultimodalPrompt = `Anda adalah Master Canvas 2D Motion Graphics & Senior Computer Vision Engineer (Adobe After Effects / Lottie 60 FPS Microstock Specialist).

TUGAS UTAMA:
Analisis GAMBAR REFERENSI yang diunggah secara visual pixel-by-pixel, lalu REKONSTRUKSI MENJADI KODE HTML5 CANVAS 2D yang SANGAT MIRIP dengan gambar aslinya (bentuk anatomi objek, letak elemen, kode warna HEX asli) dan BERIKAN GERAKAN KINETIK 60 FPS YANG JELAS, AKTIF, DAN BERTENAGA!

=============================================================================
ATURAN KETAT (ANTI-FALLBACK, ANTI-LEPAS & KESESUAIAN TINGGI):
=============================================================================
1. SATU MATRIX INDUK UNTUK SATU OBJEK (UNIFIED PARENT MATRIX - WAJIB ANTI-DETACH):
   - Seluruh bagian suatu objek (misal: badan tas + gagang tali; bodi mobil + roda; bodi smartphone + layar + kamera; cangkir + pegangan; kamera + lensa + shutter) WAJIB digambar di dalam SATU BLOK TRANSFORMASI INDUK yang sama:
     ctx.save();
     ctx.translate(posX, posY); // posX = cx, posY = cy + floating/bounce
     ctx.rotate(rot);
     ctx.scale(scaleX, scaleY);
     // SEMUA SUB-KOMPONEN DIGAMBAR DENGAN KOORDINAT RELATIF TERHADAP (0, 0)!
     // DILARANG MEMBERIKAN TRANSLASI POSISI X/Y TERPISAH PADA GAGANG ATAU RODA YANG MEMBUATNYA LEPAS DARI BADAN!
     ctx.restore();
2. ANATOMI LOGIS & SAMBUNGAN FISIK KOKOH (PHYSICAL ATTACHMENT):
   - TAS & KOPER: Gagang/tali tas WAJIB menempel menyatu kokoh di bibir atas badan tas pada (-strapOffset, topBagY) dan (+strapOffset, topBagY). DILARANG gagang melayang terpisah dari tas!
   - KENDARAAN & MOBIL: Bodi mobil aerodinamis dengan spakbor (wheel arches). Roda mobil WAJIB tertanam presisi di dalam lubang spakbor sasis bawah di (-wheelDist, axleY) dan (+wheelDist, axleY). Roda bergerak 100% mengikuti bodi sasis; hanya velg di dalam ban yang berputar di poros masing-masing. DILARANG roda terpental, melayang liar, atau berada di luar bodi!
   - SMARTPHONE & GADGET: Bodi ponsel WAJIB berbentuk persegi panjang dengan sudut membulat sempurna (rasio standar 9:19.5, ctx.roundRect(-w/2, -h/2, w, h, 20)), bezel tipis simetris, dynamic island terpusat di atas, home bar di bawah, dan layar kaca menyala di dalam bezel. DILARANG bentuk tidak beraturan atau poligon asimetris cacat!
   - DILARANG partikel berhamburan/debu liar di luar icon. Background kanvas harus 100% bersih.
3. DILARANG KERAS menghasilkan bentuk kotak roda gerigi berputar jika gambar aslinya bukan roda gigi! Gambarlah bentuk visual subjek aslinya (misal: Mikrofon, Kamera, Roket, Tas Belanja, Robot, Gedung, Mobil, Karakter, dll.).
4. DILARANG bentuk acak/tidak beraturan atau garis melayang tanpa arti. Setiap elemen Canvas harus terhubung rapi membentuk objek referensi yang proporsional dan solid.
5. DILARANG gerakan minim / samar / hanya glow tipis statis. Animasi WAJIB memiliki gerakan 60 FPS yang nyata dan bertenaga (osilasi floating Y, breathing scale pulse, specular gleam sweep, artikulasi sub-bagian).

=============================================================================
1. REPRODUKSI BENTUK & KODE WARNA HEX 1:1 DARI GAMBAR:
=============================================================================
- Identifikasi subjek utama secara akurat.
- Ekstrak PALET WARNA HEX ASLI (#RRGGBB) dari gambar untuk setiap bagian objek (warna badan utama, bayangan kontur, highlight, aksen pendaran glow, dan garis stroke).
- Gambar setiap komponen secara proporsional dan presisi menggunakan fungsi Canvas 2D: \`ctx.roundRect\`, \`ctx.arc\`, \`ctx.ellipse\`, \`ctx.bezierCurveTo\`, \`ctx.lineTo\`, dan \`ctx.fill()\` / \`ctx.stroke()\`.
- Skala objek S = Math.min(w, h) * 0.44. Objek harus terpusat di (cx, cy) dengan ukuran proporsional (mengisi 75-85% kanvas).

=============================================================================
2. GERAKAN KINETIK 60 FPS YANG DINAMIS & TEGAS (ACTIVE MOTION):
=============================================================================
- Gerak Utama Objek:
  * Floating/Osilasi: \`posY = cy + Math.sin(t * 2.8) * (S * 0.14); rot = Math.sin(t * 2.0) * 0.10;\`
  * Dynamic Breathing Pulse: \`scaleX = 1 + Math.sin(t * 3.2) * 0.05; scaleY = 1 - Math.sin(t * 3.2) * 0.04;\`
  * Artikulasi Sub-Komponen: Gerakkan bagian yang logis dari subjek (misal: lensa memancarkan sinar pulsa, baling-baling/rotor berputar, indikator lampu berkedip, sayap bergetar, dial radar berputar).
  * Efek Kilau Spekular: Sapuan garis kilau cahaya miring terang yang melintasi permukaan objek (\`const shineX = ((t * 1.5) % 3 - 1.5) * S * 2;\`).
- Efek Pendaran Luminescence (Neon Glow):
  * Gunakan \`ctx.shadowBlur = 28 + Math.sin(t * 4.0) * 12;\` dengan warna glow menyala terang (\`ctx.shadowColor = primaryGlowHex;\`).
  * Isolasi glow dengan \`ctx.save()\` & \`ctx.restore()\` dan reset \`ctx.shadowBlur = 0\` setelah menggambar objek.

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
  "shapeDescription": "Rekonstruksi bentuk dan warna asli referensi dengan Canvas 2D 60 FPS",
  "detectedElements": ["Elemen Utama", "Aksen Warna Asli", "Efek Kinetik"],
  "professionalMotionPlan": "Animasi kinetik 60 FPS dinamis dengan artikulasi layer",
  "similaritySynthesis": "Rekonstruksi presisi kode warna dan proporsi gambar",
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

  function animate(time) {
    const t = time * 0.001;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = ${clearFill};
    ctx.fillRect(0, 0, w, h);

    // RENDER ANIMASI OBJEK SESUAI BENTUK GAMBAR ASLI DENGAN WARNA HEX ASLI & GERAKAN KINETIK NYATA 60 FPS

    requestAnimationFrame(animate);
  }
  animate(0);
</script>
</body>
</html>

Outputkan HANYA file HTML lengkap tanpa teks pembuka atau penjelas markdown:`;

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
                  inlineData: {
                    mimeType: mimeType || 'image/png',
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
            temperature: 0.25,
            maxOutputTokens: 8192,
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

// High-level Image to Prompt Motion generator (analyzes image and produces 1 pure clean motion prompt)
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
  const apiKey = getRotatedKey(apiKeys);
  const pureBase64 = params.imageBase64.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, '');

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // 1. Direct browser API call if user has configured key
      if (apiKey) {
        try {
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

          const targetModel = sanitizeModel(model);
          const url = `https://generativelanguage.googleapis.com/v1beta/models/${targetModel}:generateContent?key=${encodeURIComponent(apiKey)}`;
          const directRes = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [
                {
                  parts: [
                    {
                      inlineData: {
                        data: pureBase64,
                        mimeType: params.mimeType || 'image/png',
                      },
                    },
                    {
                      text: promptDirective,
                    },
                  ],
                },
              ],
              generationConfig: {
                temperature: 0.35,
                maxOutputTokens: 2048,
              },
            }),
          });

          if (directRes.ok) {
            const resultData = await directRes.json();
            const text = resultData?.candidates?.[0]?.content?.parts?.[0]?.text || '';
            let clean = text
              .replace(/^["'`\s]+|["'`\s]+$/g, '')
              .replace(/^(?:Prompt|Motion Prompt|Result|Output|Here is the prompt)[\s:=*-]+/i, '')
              .replace(/\r?\n+/g, ' ')
              .replace(/\s{2,}/g, ' ')
              .trim();

            if (clean && clean.length > 20) {
              return clean;
            }
          }
        } catch (directErr) {
          console.warn('Direct Image-to-Prompt error, trying server fallback...', directErr);
        }
      }

      // 2. Server proxy fallback
      const res = await fetch('/api/gemini/image-to-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey,
          model: model || 'gemini-2.5-flash',
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
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  // Graceful deterministic fallback
  const baseName = params.fileName.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9]/g, ' ');
  return `Dynamic 60 FPS motion graphic animation of ${baseName} featuring smooth articulated transformations, cyber glow particle trails, rhythmic kinetic bouncing, and seamless looping easing curves on a clean dark studio background.`;
}
