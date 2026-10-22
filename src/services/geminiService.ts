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

export class AllKeysExhaustedError extends Error {
  isAllKeysExhausted: boolean = true;
  constructor(message: string = 'Semua API Key telah mencapai batas kuota atau rate limit') {
    super(message);
    this.name = 'AllKeysExhaustedError';
    Object.setPrototypeOf(this, AllKeysExhaustedError.prototype);
  }
}

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
    ...['gemini-2.5-flash', 'gemini-flash-latest', 'gemini-3.1-flash-lite', 'gemini-3.1-pro-preview'].filter(
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

  const promptContent = isBackground
    ? `You are a Principal Motion Graphic Director for Adobe Stock & Shutterstock.
Generate exactly 1 professional, highly marketable FULL-FRAME MOTION BACKGROUND prompt in English (Collection item #${index + 1} of ${total}).

MANDATORY RULES FOR FULL-FRAME MOTION BACKGROUNDS:
1. FULL-FRAME EDGE-TO-EDGE CANVAS COVERAGE:
   - The prompt MUST describe a continuous, edge-to-edge widescreen looping motion graphics environment spanning the entire 100% canvas from corner to corner (e.g. "Fluid multi-layered chromatic wave ribbons flowing diagonally across widescreen viewport", "3D perspective neon cyber grid terrain receding toward luminous horizon with waving contour lines", "Interconnected particle plexus constellation with drifting nodes and dynamic energy filaments across full screen", "Luxury obsidian black silk satin fabric undulating with rich champagne gold light caustics").
   - FORBIDDEN: Isolated centered icons, symbols, floating emblems, logos, or empty border margins.
2. 3-TIER ATMOSPHERIC DEPTH:
   - Deep background atmospheric gradient, dynamic midground motion graphics, and subtle foreground ambient light swells.
3. 60 FPS SEAMLESS HARMONIC LOOP:
   - Smooth periodic wave functions, continuous flow, and studio-grade cinematic motion.

${categoryLine}Animation Type: FULL-FRAME BACKGROUND MOTION
Visual Style: ${style}${colorModeDirective}${glowDirective}
Special Directives: ${typeInstruction}${keywordsDirective}${greenScreenDirective}

Output format: Return ONLY the prompt text string, concise, descriptive and studio-grade. No bullet points, no markdown code block, no quotes. Just the clean single prompt text.`
    : `You are a Principal Motion Graphic Director for Adobe Stock & Shutterstock.
Generate exactly 1 professional, highly marketable, and semantically rich animation prompt in English (Collection item #${index + 1} of ${total}).

MANDATORY RULES FOR HIGH-CLASS SHAPES, ATTACHED RIGGING & ZERO DEFECTS:
1. RECOGNIZABLE SUBJECT & SLEEK VECTOR ART:
   - The prompt MUST describe a concrete, clearly identifiable, meaningful visual object or scene (e.g. "Isometric Crypto Gold Coin with beveled edge and glowing currency core", "Solid Volumetric Shopping Cart with metallic deep basket, locked chassis, spinning dual wheels, and dynamic payload", "Biotech DNA Double Helix rotating smoothly with glowing nucleotide rungs", "Cybersecurity Hologram Shield with interlocking hexagonal plates and pulsing central keyhole core", "Sleek Aerodynamic Electric Vehicle with chassis, roof cabin, and glowing alloy wheels").
   - FORBIDDEN: Abstract meaningless blobs, deformed random polygons, loose floating scribbles, wireframe line skeletons, or vague geometry.
2. DETAILED RIGGED ANATOMY (NO DETACHED PARTS):
   - Explicitly specify how all components are attached to the main body: e.g. wheels locked inside chassis wheel arches, handles welded firmly to bag/mug rim, camera lens mounted flush to chassis, sensors connected at ports.
3. 60 FPS COORDINATED KINETIC DYNAMICS:
   - Unified parent floating oscillation (amplitude ±12px) and gentle breathing scale (0.98x-1.02x), paired with continuous synchronized rotation of internal wheels/gears/dial needles on their locked anchors, plus a dynamic 45-degree diagonal specular gleam sweep across surfaces.

${categoryLine}Animation Type: ${String(type).toUpperCase()}
Visual Style: ${style}${colorModeDirective}${glowDirective}
Special Directives: ${typeInstruction}${keywordsDirective}${greenScreenDirective}

Output format: Return ONLY the prompt text string, concise, descriptive and studio-grade. No bullet points, no markdown code block, no quotes. Just the clean single prompt text.`;

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
            temperature: 0.8,
            maxOutputTokens: 250, // Ultra lightweight and fast
            thinkingConfig: { thinkingBudget: 0 },
          },
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error?.message || `Google API Error ${res.status}`);
      }

      const data = await res.json();
      const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      let cleanPrompt = rawText.trim();

      // Clean markdown code blocks, quotes, or JSON arrays if returned
      try {
        const parsed = JSON.parse(cleanPrompt);
        if (Array.isArray(parsed) && parsed.length > 0) {
          cleanPrompt = String(parsed[0]).trim();
        } else if (typeof parsed === 'string') {
          cleanPrompt = parsed.trim();
        } else if (parsed && typeof parsed.prompt === 'string') {
          cleanPrompt = parsed.prompt.trim();
        }
      } catch {
        cleanPrompt = cleanPrompt
          .replace(/^```[a-z]*\s*/i, '')
          .replace(/```$/, '')
          .replace(/^["'\[\]]+|["'\[\]]+$/g, '')
          .replace(/^[-*0-9.]+\s*/, '')
          .trim();
      }

      if (cleanPrompt.length >= 10) {
        return cleanPrompt;
      }
    } catch (err: any) {
      lastDirectError = err;
      continue;
    }
  }

  throw lastDirectError || new Error('Gagal menghasilkan prompt dari Google Gemini');
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

export type PromptProgressCallback = (prompt: string, index: number, total: number) => void;

// Generate Prompts Satu per Satu Secara Cepat dengan Rotasi Key & Jaminan Anti-Gagal 100%
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

  // Concurrency: 1 for single key to prevent 429 quota exhaustion, max 2 for multiple keys
  const concurrency = Math.min(2, Math.max(1, apiKeys && apiKeys.length > 1 ? 2 : 1));
  let currentIndex = 0;

  async function worker(): Promise<void> {
    while (currentIndex < targetCount) {
      const idx = currentIndex++;
      const apiKey = getRotatedKey(apiKeys);
      let promptText = '';

      // 1. Direct call to Google API (fastest 1-by-1 ~250-400ms)
      if (apiKey) {
        try {
          promptText = await generateSinglePromptDirect(
            apiKey,
            model,
            type,
            subCategory,
            style,
            idx,
            targetCount,
            keywords,
            isGreenScreen,
            colorMode,
            motionDynamics,
            neonGlow
          );
        } catch (directErr) {
          console.warn(`[generatePromptsViaGemini] Direct call for prompt #${idx + 1} failed:`, directErr);
        }
      }

      // 2. Server proxy fallback if direct call was empty
      if (!promptText || promptText.length < 10) {
        try {
          const res = await fetch('/api/gemini/generate-prompts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              apiKey,
              model: model || 'gemini-2.5-flash',
              type,
              subCategory,
              style,
              count: 1, // Single prompt per call for max speed & zero truncation!
              keywords,
              isGreenScreen,
              colorMode,
              motionDynamics,
              neonGlow,
              startIndex: idx,
            }),
          });
          if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data.prompts) && data.prompts[0]) {
              promptText = data.prompts[0];
            }
          }
        } catch (serverErr) {
          console.warn(`[generatePromptsViaGemini] Server call for prompt #${idx + 1} failed:`, serverErr);
        }
      }

      // 3. Guaranteed High-Quality Procedural Synthesizer with distinct offset index
      if (!promptText || promptText.length < 10) {
        const fallbacks = generateProceduralPrompts(
          1,
          type,
          subCategory,
          style,
          colorMode,
          motionDynamics,
          neonGlow,
          keywords,
          idx
        );
        promptText = fallbacks[0];
      }

      collectedPrompts[idx] = promptText;

      // Trigger progress callback immediately for this single prompt!
      if (onProgress) {
        try {
          onProgress(promptText, idx, targetCount);
        } catch (cbErr) {
          console.error('[generatePromptsViaGemini] onProgress error:', cbErr);
        }
      }

      // Pacing pause for network breathability and API quota safety
      await new Promise((r) => setTimeout(r, 250));
    }
  }

  const workers: Promise<void>[] = [];
  const activeWorkers = Math.min(concurrency, targetCount);
  for (let w = 0; w < activeWorkers; w++) {
    workers.push(worker());
  }

  await Promise.all(workers);

  // Guarantee all slots are populated with unique procedural prompts
  for (let i = 0; i < targetCount; i++) {
    if (!collectedPrompts[i] || collectedPrompts[i].length < 10) {
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
      collectedPrompts[i] = fallback;
      if (onProgress) {
        onProgress(fallback, i, targetCount);
      }
    }
  }

  return collectedPrompts;
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
  if (isGreenScreen || colorMode === 'flat' || !neonGlow) {
    styleAndColorGuide = `
PANDUAN WARNA & STYLE: CRISP VECTOR / NO SHADOW BLUR (WAJIB DIPATUHI):
- ctx.shadowBlur = 0; ctx.shadowColor = 'transparent';
- DILARANG KERAS menggunakan ctx.shadowBlur atau shadowColor! (Penggunaan shadowBlur pada canvas menghasilkan kotak/persegi halo kotor yang merusak chroma key dan tampilan vektor).
${colorMode === 'flat' ? '- DILARANG menggunakan createLinearGradient atau createRadialGradient. Gunakan 100% solid hex color (misal: #FF4757, #2ED573, #1E90FF, #FFA502, #FFFFFF, #2F3542, #70A1FF) bergaya Flat Art Vector modern!' : '- Gunakan gradien multi-stop linear (createLinearGradient) solid dan kontur stroke tebal presisi (ctx.lineWidth = 3-4, round join).'}
- Bentuk garis tepi tajam, tebal terdefinisi, dan bidang warna solid bervolume tanpa efek blur.`;
  } else {
    styleAndColorGuide = `
PANDUAN WARNA & NEON GLOW (AKTIF):
- Terapkan efek luminescence HANYA pada aksen kecil (LED / laser tipis / garis sirkuit): ctx.shadowBlur = 12; ctx.shadowColor = primaryColor; (DILARANG memberikan shadowBlur pada bodi utama atau background!).
${colorMode === 'neon' ? '- Palet Neon Cyber: Cyan (#00f3ff), Neon Magenta (#ff007f), Electric Lime (#39ff14), Neon Gold (#ffd700).' : ''}
${colorMode === 'monochrome' ? '- Palet Monochrome: Putih murni (#ffffff), Slate Silver (#cbd5e1), Graphite (#475569), dengan aksen glow putih kristal.' : ''}
${colorMode === 'pastel' ? '- Palet Pastel: Soft Lavender (#c4b5fd), Mint (#a7f3d0), Peach (#fdba74), Baby Blue (#93c5fd).' : ''}
${colorMode === 'luxury' ? '- Palet Luxury: Imperial Gold (#d4af37), Warm Amber (#f59e0b), Champagne (#fef08a), Bronze (#cd7f32).' : ''}
${colorMode === 'gradient' ? '- Gunakan createLinearGradient / createRadialGradient dinamis yang bergerak seiring waktu t.' : ''}`;
  }

  const greenScreenDirective = isGreenScreen
    ? `
MANDATORY GREEN SCREEN CHROMA-KEY RULES:
- Background kanvas HARUS 100% murni hijau polos (#00ff00).
- DILARANG KERAS MENGGAMBAR KOTAK WADAH, KARTU LATAR, ROUNDED RECTANGLE CONTAINER, ATAU AURA BACKDROP APAPUN DI KANVAS! Latar hijau #00ff00 di luar objek harus 100% murni tanpa goresan transparan sekecil apapun!
- DILARANG KERAS ctx.shadowBlur pada green screen! (Gunakan ctx.shadowBlur = 0; ctx.shadowColor = 'transparent').
- Objek utama HARUS menggunakan warna kontras jelas (Cyan, Gold, Ungu, Putih, Oranye, Merah, Biru). JANGAN gunakan warna hijau #00ff00 pada objek.`
    : '';

  const isBackground = type === 'bg';

  const typeSpecificRules = isBackground
    ? `
ATURAN MASTER FULL-FRAME BACKGROUND MOTION GRAPHICS (100% EDGE-TO-EDGE CANVAS):
1. CAKUPAN PENUH 100% SELURUH KANVAS (EDGE-TO-EDGE WIDESCREEN):
   - Animasi latar belakang WAJIB mengisi SELURUH layar secara penuh dari sudut (0, 0) hingga (w, h).
   - DILARANG KERAS menggambar icon/simbol terisolasi di tengah layar!
   - DILARANG menyisakan ruang kosong, tepi mati, atau batas kanvas kosong yang tidak terisi gerakan motion graphics.
   - Gerakan visual mengalir secara dinamis melintasi seluruh lebar dan tinggi layar (widescreen viewport).

2. ARSITEKTUR 3 LAPIS KEDALAMAN MOTION BACKGROUND (3-TIER PARALLAX DEPTH):
   a. Lapisan Dasar / Deep Atmosphere (Background Depth):
      - Gradien atmosfer dinamis atau mesh halus yang bergeser perlahan memberikan nuansa ruang dan kedalaman (misal: shifting linear/radial gradient, ambient dark glow).
   b. Lapisan Gerakan Utama (Dynamic Flow Graphics):
      - Elemen utama sesuai prompt yang mengalir secara kontinu:
        * Jika Wave / Fluid / Ribbon: 3-5 lapisan gelombang sinusoidal bezier (ctx.bezierCurveTo / ctx.quadraticCurveTo) yang bertumpuk dengan opasitas berbeda, mengalir lembut secara horizontal atau diagonal melintasi kanvas penuh.
        * Jika Cyber Grid / Topografi: Garis perspektif 3D yang membentang ke cakrawala dengan vanishing point atau jaring kawat topografi bergerak yang membentang dari kiri ke kanan.
        * Jika Plexus / Constellation: 35-60 titik/node bercahaya yang melayang di seluruh viewport kanvas dengan garis koneksi otomatis dinamis antara node yang berdekatan (distance < threshold, ctx.globalAlpha = 1 - d/threshold).
        * Jika Silk / Luxury Auroral: Pita cahaya satin lembut bertingkat dengan gradien multi-stop berkilau yang meliuk elegan di seluruh layar.
        * Jika Speed / Energy Tunnel: Garis-garis energi berkecepatan tinggi yang memancar dari titik fokus ke seluruh tepi layar.
   c. Lapisan Ambient Glow & Specular Light:
      - Pendaran cahaya lembut (ambient light swells) dan partikel cahaya halus yang mengambang perlahan memperkaya atmosfer sinematik.

3. 60 FPS SEAMLESS LOOPING & SMOOTH KINETICS:
   - Waktu t dihitung dari timestamp (t = time * 0.001).
   - Seluruh rumus gerakan periodik menggunakan fungsi trigonometri harmonis (Math.sin, Math.cos) sehingga animasi berputar (loop) secara mulus tanpa sentakan tajam (seamless infinite loop).
   - Pergerakan terasa elegan, modern, profesional, dan bernilai jual tinggi layaknya motion background kelas studio Adobe Stock / Shutterstock.

4. TIDAK BOLEH ADA TEKS / HURUF / ANGKA:
   - Murni motion graphics visual canvas 2D yang bersih dan profesional.`
    : `
ATURAN MASTER IKON MOTION 60 FPS ULTRA-PROFESIONAL & PRESISI TINGGI (ZERO DEFECT & RIGID ATTACHMENT):

1. MUTLAK: ARSITEKTUR KOORDINAT TUNGGAL (SINGLE ROOT MATRIX - 100% ZERO DETACHED PARTS):
   - SEMUA komponen suatu objek (badan, keranjang, roda, sasis, gagang, muatan, aksesoris) WAJIB DIGAMBAR DI DALAM SATU BLOK ROOT MATRIX UTAMA:
     ctx.save();
     ctx.translate(cx, cy + Math.sin(t * 2.0) * 8); // Floating HANYA di root ini (amplitude halus ±8px)
     ctx.rotate(Math.sin(t * 1.5) * 0.025);         // Kemiringan HANYA di root ini (±0.025 rad)
     ctx.scale(1 + Math.sin(t * 2.0) * 0.015, 1 + Math.sin(t * 2.0) * 0.015); // Breathing scale

     // PERATURAN KOORDINAT MUTLAK:
     // - Semua posisi sub-bagian dihitung secara relatif terhadap titik pusat (0, 0)!
     // - DILARANG KERAS MEMBUKA ctx.translate(cx, cy) KEDUA!
     // - DILARANG KERAS MENGGUNAKAN KOORDINAT ABSOLUT SEPERTI (0, 0) KANVAS YANG MEMBUAT OBJEK MELAYANG KE POJOK KANVAS!
     // - DILARANG KERAS memberikan translasi atau rotasi independen pada bagian struktural bodi (misal keranjang miring tapi roda tegak, atau keranjang melayang meninggalkan sasis)! Bagian struktural 100% TERKUNCI MATI.
     
     // ATURAN RODA / GEAR / SUB-KOMPONEN BERPUTAR:
     // Roda terpasang kaku pada titik poros sasis (-wheelOffsetX, wheelOffsetY) dan (+wheelOffsetX, wheelOffsetY):
     // ctx.save();
     // ctx.translate(wheelOffsetX, wheelOffsetY); // Pindah ke titik poros lokal pada sasis
     // ctx.rotate(t * wheelSpeed);               // Putaran velg/spokes pada poros
     // // Gambar velg, ban, dan jari-jari centered di (0, 0)
     // ctx.restore();
     // Roda TETAP terikat mati di titik poros sasis, TIDAK AKAN PERNAH TERLEPAS!

     ctx.restore();

2. MUTLAK: ZERO-GLARE OVERFLOW & ZERO BACKGROUND BOX (BEBAS KOTAK AURA / BEBAS CAHAYA BLINDING):
   - DILARANG KERAS menggambar kotak wadah, kartu latar, rounded rectangle background, atau aura plate di belakang icon! Kanvas di sekeliling icon harus 100% bersih tanpa coretan transparan apapun.
   - DILARANG KERAS menggambar lingkaran kilau putih raksasa / radial burst / whiteout flash yang menutupi icon atau layar!
   - Efek kilau (specular gleam / light sweep) WAJIB 100% DI-CLIP di dalam siluet bentuk badan icon:
     ctx.save();
     ctx.beginPath();
     // Gambar path bentuk bodi utama persis sama:
     ctx.roundRect(-bodyW/2, -bodyH/2, bodyW, bodyH, 16);
     ctx.clip(); // CLIPPING: Mencegah kilau merembes/bocor keluar batas objek!
     
     // Gambar sapuan kilau diagonal 45 derajat tipis di dalam clip:
     const gleamX = (((t * 0.6) % 2.5) - 1.25) * bodyW * 1.5;
     const gleamGrad = ctx.createLinearGradient(gleamX - 25, -bodyH, gleamX + 25, bodyH);
     gleamGrad.addColorStop(0, 'rgba(255, 255, 255, 0)');
     gleamGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.4)');
     gleamGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
     ctx.fillStyle = gleamGrad;
     ctx.fillRect(-bodyW, -bodyH, bodyW * 2, bodyH * 2);
     ctx.restore();

3. MUTLAK: VEKTOR VOLUMETRIK 3D BERKELAS STUDIO (DILARANG WIREFRAME / GARIS TIPIS KOSONG):
   - DILARANG KERAS menggambar objek hanya berupa garis kawat (wireframe strokes) tanpa isi padat!
   - Objek WAJIB memiliki konstruksi solid 2.5D / isometrik bervolume:
     * Dinding belakang (back wall) terisi warna gradien gelap solid untuk ilusi kedalaman rongga.
     * Muatan/isi di dalam bodi (misal parcel, boks belanja, data cube) berupa bentuk 3D solid dengan gradien cerah dan aksen pita/garis.
     * Kisi-kisi/dinding depan berupa batangan tubular tebal (lineWidth 4-6px) dengan gradien metalik dan ujung membulat.
     * Sasis bawah berupa pipa padat berbobot dengan bracket dudukan roda.
     * Roda pejal dengan ban karet tebal, velg alloy, dan jari-jari berputar.
     * Kontur garis luar rapi dan kontras (lineWidth 3-4px, round joins).
     * Bevel specular edge: Garis lengkung tipis di tepi atas bibir bodi memberi kesan material glossy premium.

4. MUTLAK: SETIAP SUB-ELEMEN FUNGSIONAL WAJIB HIDUP & AKTIF BERGERAK 60 FPS:
   - Objek bukan gambar mati! Semua komponen fungsional beroperasi secara kinetik:
     * Roda / Gear / Turbin: Berputar mulus 60 FPS pada porosnya (ctx.rotate(t * speed)).
     * Muatan / Konten Internal: Membal lembut secara kinetik di dalam wadah (Math.sin(t * 3.5) * 3).
     * Sinar Laser Scanner / Sensor: Garis pemindai tipis menyapu bolak-balik di atas muatan/layar (Math.sin(t * 2.5) * scanRange).
     * Lampu Indikator / LED: Berkedip ritmis (Math.sin(t * 5.0) > 0.2).
     * Pulsa Energi: Aliran pulsa dinamis pada sasis/kabel (ctx.lineDashOffset = -t * 30).
     * Specular Gleam: Sapuan kilau diagonal ter-clip melintasi bodi setiap interval looping.

5. ISOLASI TOTAL & KEBERSIHAN KANVAS:
   - Skala S = Math.min(w, h) * 0.44; Objek terpusat sempurna di (cx, cy).
   - DILARANG partikel liar, debu mengambang, atau serpihan di luar objek utama.`;

  const systemPrompt = `Anda adalah Lead HTML5 Motion Designer & Master Computer Vision Artist (Microstock & Lottie Specialist).
Tugas: Buat 1 file HTML animasi Canvas 2D yang SANGAT PRESISI, BERMAKNA SEMANTIK TINGGI, BENTUK AKURAT SESUAI PROMPT, dan 100% BEBAS CACAT.

PARAMETER TERPILIH:
- Subjek/Prompt: "${promptTopic}"
- Tipe Animasi: ${String(type).toUpperCase()} ${isBackground ? '(FULL-FRAME MOTION BACKGROUND)' : '(CENTRAL RIGGED ICON)'}
- Kategori Microstock: ${catInfo}
- Gaya Visual: ${style}
- Mode Warna: ${colorMode.toUpperCase()}
- Status Neon Glow: ${neonGlow ? 'AKTIF (Luminescent Glow)' : 'NONAKTIF (Flat / Crisp Edges Tanpa Blur)'}
- Gerakan: KINETIC 60 FPS LINEAR (Selaras & terintegrasi dengan deskripsi Prompt)
${isGreenScreen ? '- Mode: Pure Green Screen #00FF00 (Chroma Key)' : ''}

${typeInstructions}
${motionGuide}
${styleAndColorGuide}
${greenScreenDirective}

${typeSpecificRules}

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
    S = ${isBackground ? 'Math.max(w, h)' : 'Math.min(w, h) * 0.44'};
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

      const directGenConfig: any = {
        temperature: 0.1,
        maxOutputTokens: 8192,
      };
      if (currentModel.includes('2.5') || currentModel.includes('flash')) {
        directGenConfig.thinkingConfig = { thinkingBudget: 0 };
      }

      let res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: systemPrompt }] }],
          generationConfig: directGenConfig,
        }),
      });

      if (!res.ok && directGenConfig.thinkingConfig) {
        // Fallback without thinkingConfig if model rejects thinkingBudget 0
        delete directGenConfig.thinkingConfig;
        res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: systemPrompt }] }],
            generationConfig: directGenConfig,
          }),
        });
      }

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

// Generate Single Animation Code with Multi-Level Fallback & Resilient Rate-Limit Handling
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
  // Delay berjenjang adaptif untuk pemulihan kuota Gemini (15 RPM leaky-bucket):
  // Percobaan 1 gagal: 6s, Percobaan 2 gagal: 10s, Percobaan 3 gagal: 15s
  const retryDelays = [6000, 10000, 15000];

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Rotasi API key setiap percobaan untuk bypass rate limit per-key
      const apiKey = getRotatedKey(apiKeys);

      // If user provided an API key, try direct client call first for 0-latency
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
          console.warn(`Direct generation attempt #${attempt} failed, trying server route...`, clientErr);
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
        throw new Error(errData?.error || `Koneksi API sementara tidak tersedia (${response.status})`);
      }

      const data = await response.json();
      if (!data.html || data.html.trim().length === 0) {
        if (data.error) {
          throw new Error(data.error);
        }
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
      const delayMs = retryDelays[attempt - 1] || 6000;
      const cleanErr = err?.message || 'Kendala jaringan/kuota';
      if (attempt < maxRetries) {
        if (onRetry) onRetry(attempt, maxRetries, `${cleanErr} (menunggu jeda ${delayMs / 1000}s)`);
        await new Promise((res) => setTimeout(res, delayMs));
      } else {
        if (onRetry) onRetry(attempt, maxRetries, `${cleanErr} (jeda akhir ${delayMs / 1000}s sebelum lewati)`);
        await new Promise((res) => setTimeout(res, delayMs));
      }
    }
  }

  // Jika gagal 3x bertahap (6s, 10s, 15s), lewati prompt ini dan simpan ke daftar coba ulang
  throw new Error(`Gagal setelah 3x percobaan bertahap (6s, 10s, 15s): ${lastError?.message || 'API limit/timeout'}. Prompt dilewati dan tersimpan untuk dicoba ulang.`);
}

// Zero-Dummy Policy: Animasi murni disusun oleh AI sesuai prompt & referensi. Tidak ada fallback dummy/template.

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
            temperature: 0.1,
            maxOutputTokens: 3800,
            thinkingConfig: { thinkingBudget: 0 },
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

  // Jika AI gagal, lemparkan error agar dicoba ulang bertahap atau diskip (TIDAK menyajikan template dummy)
  if (!generatedHtml) {
    throw new Error('AI tidak berhasil menyusun kode animasi Canvas dari gambar referensi');
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
  const retryDelays = [3000, 5000, 10000];

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
        } catch (clientErr: any) {
          console.warn(`Direct Image-To-Motion attempt #${attempt} failed, trying server route...`, clientErr);
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
        throw new Error(errData?.error || `Koneksi API sementara tidak tersedia (${res.status})`);
      }

      const data = await res.json();
      if (!data.html || data.html.trim().length === 0) {
        if (data.error) throw new Error(data.error);
        throw new Error('AI mengembalikan kode kosong.');
      }

      return data;
    } catch (err: any) {
      lastError = err;
      const delayMs = retryDelays[attempt - 1] || 3000;
      const cleanErr = err?.message || 'Kendala jaringan/kuota';
      if (attempt < maxRetries) {
        if (onRetry) onRetry(attempt, maxRetries, `${cleanErr} (menunggu jeda ${delayMs / 1000}s)`);
        await new Promise((res) => setTimeout(res, delayMs));
      } else {
        if (onRetry) onRetry(attempt, maxRetries, `${cleanErr} (jeda akhir ${delayMs / 1000}s sebelum lewati)`);
        await new Promise((res) => setTimeout(res, delayMs));
      }
    }
  }

  throw new Error(`Gagal memproses gambar setelah 3x percobaan bertahap (3s, 5s, 10s): ${lastError?.message || 'API limit/timeout'}. Item dilewati dan tersimpan untuk dicoba ulang.`);
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
                temperature: 0.3,
                maxOutputTokens: 600,
                thinkingConfig: { thinkingBudget: 0 },
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
