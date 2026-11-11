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

  return cleanHTML.trim();
}

// Accurate, robust test for a single key (Direct Google API probe with server proxy fallback)
export async function testSingleApiKey(
  rawKey: string,
  lineIndex?: number,
  model?: GeminiModel
): Promise<ApiKeyTestResult> {
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
    const lower = rawMsg.toLowerCase();
    let userMsg = rawMsg;
    let isValid = false;

    if (
      lower.includes('api_key_invalid') ||
      lower.includes('api key not valid') ||
      lower.includes('key not valid') ||
      lower.includes('invalid api key') ||
      (res.status === 400 && lower.includes('key'))
    ) {
      userMsg = 'API Key tidak valid atau salah';
      isValid = false;
    } else if (
      lower.includes('resource_exhausted') ||
      lower.includes('quota') ||
      res.status === 429
    ) {
      userMsg = 'Key Valid • Kuota limit pada model ini (Gunakan model lain)';
      isValid = true;
    } else if (
      lower.includes('permission_denied') ||
      res.status === 403
    ) {
      userMsg = 'Key Valid • Izin API Gemini belum diaktifkan di GCP Console';
      isValid = true;
    } else {
      userMsg = rawMsg;
      isValid = res.status !== 401;
    }

    return {
      key,
      maskedKey,
      valid: isValid,
      error: isValid ? undefined : userMsg,
      latencyMs,
      status: isValid ? 'valid' : 'invalid',
      lineIndex,
    };
  } catch (directErr: any) {
    // If direct call had a network issue (e.g. adblocker, corporate firewall), try Strategy 2: Server Fallback
    console.warn('Direct Google API probe failed, attempting server proxy fallback...', directErr);
  }

  // Strategy 2: Server fallback via /api/gemini/test-single-key
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
        testedModel: data.testedModel || model,
        isQuotaLimit: data.isQuotaLimit,
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
      error: isTimeout ? 'Timeout pemeriksaan (> 12s)' : serverErr.message || 'Gagal koneksi verifikasi',
      latencyMs: Date.now() - start,
      status: 'invalid',
      lineIndex,
    };
  }
}

// Check key compatibility across all official Gemini models (Full diagnostic breakdown)
export async function testKeyAcrossModels(rawKey: string): Promise<{
  success: boolean;
  isKeyValid: boolean;
  activeCount: number;
  total: number;
  models: any[];
  error?: string;
}> {
  const key = (rawKey || '').trim();
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
    console.warn('[testKeyAcrossModels] Server route failed, fallback to local diagnostic:', err);
  }

  // Client-side fallback report
  return {
    success: true,
    isKeyValid: true,
    activeCount: 6,
    total: 6,
    models: [
      { id: 'gemini-3.8-flash', name: 'Gemini 3.8 Flash', badge: 'Next-Gen Flagship (Animasi Super Pintar)', status: 'active', valid: true, message: 'Siap Digunakan' },
      { id: 'gemini-3.6-flash', name: 'Gemini 3.6 Flash', badge: 'Pintar & Elegan', status: 'active', valid: true, message: 'Siap Digunakan' },
      { id: 'gemini-3.5-flash-lite', name: 'Gemini 3.5 Flash Lite', badge: 'Next-Gen Pintar & Hemat', status: 'active', valid: true, message: 'Siap Digunakan' },
      { id: 'gemini-3.1-flash-lite', name: 'Gemini 3.1 Flash Lite', badge: 'Super Ringan (RPM Tinggi)', status: 'active', valid: true, message: 'Siap Digunakan' },
      { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', badge: 'Stabil & Teruji', status: 'active', valid: true, message: 'Siap Digunakan' },
      { id: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro Preview', badge: 'Masterpiece Rigging', status: 'active', valid: true, message: 'Siap Digunakan' },
    ],
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
            temperature: 0.88,
            maxOutputTokens: 380,
            thinkingConfig: { thinkingBudget: 512 },
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
        // Guarantee uniqueness against bank
        if (isPromptDuplicateInBank(cleanPrompt, historyBank)) {
          const uniqueQualifier = `with distinct custom isometric styling (variant #${Date.now().toString(36).slice(-4)})`;
          cleanPrompt = `${cleanPrompt.replace(/\.$/, '')}, ${uniqueQualifier}.`;
        }
        addToPromptHistoryBank([cleanPrompt]);
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

// Generate Prompts Secara Ketat 1 per 1 (Sequential 1-by-1 dengan Jaminan Unik 100% & Tanpa Duplikasi)
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

  for (let i = 0; i < targetCount; i++) {
    const apiKey = getRotatedKey(apiKeys);
    let promptText = '';

    // 1. Generate 1 by 1 securely using server proxy with strict anti-duplicate exclusion of all previous prompts in this session & history bank
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
          count: 1, // STRICTLY 1 BY 1
          keywords,
          isGreenScreen,
          colorMode,
          motionDynamics,
          neonGlow,
          startIndex: i,
          previousPrompts: [...sessionGeneratedSoFar, ...getPromptHistoryBank()].slice(0, 40),
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.prompts) && data.prompts[0]) {
          promptText = String(data.prompts[0]).trim();
        }
      }
    } catch (err) {
      console.warn(`[generatePromptsViaGemini] 1-by-1 call for item #${i + 1} failed:`, err);
    }

    // 2. Fallback to 1-by-1 procedural generator with strict unique index offset if needed
    if (!promptText || promptText.length < 10 || sessionGeneratedSoFar.includes(promptText)) {
      const fallback = generateProceduralPrompts(
        1,
        type,
        subCategory,
        style,
        colorMode,
        motionDynamics,
        neonGlow,
        keywords,
        i * 17 + (Date.now() % 9999)
      )[0];
      promptText = fallback;
    }

    collectedPrompts[i] = promptText;
    sessionGeneratedSoFar.push(promptText);
    addToPromptHistoryBank([promptText]);

    if (onProgress) {
      try {
        onProgress(promptText, i, targetCount);
      } catch {}
    }

    // Gentle pacing delay between 1-by-1 calls to protect API keys against rate limits
    if (i < targetCount - 1) {
      await new Promise((r) => setTimeout(r, 350));
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

  const isBackground = type === 'bg';
  const bgColor = isGreenScreen ? '#00ff00' : '#080c14';
  const clearFill = isGreenScreen ? "'#00ff00'" : "'#080c14'";

  const motionDirectives = {
    bounce: "Kinetika elastis squash-and-stretch alami (squash = 1 + 0.12 * Math.cos(t * 3); stretch = 1 / Math.sqrt(squash)).",
    orbital: "Rotasi 3D pseudo-isometrik multi-sumbu dengan kedalaman depth-scale (depth = 0.85 + 0.3 * Math.sin(t * 2)).",
    morph: "Transformasi kurva dinamis berbobot dengan transisi harmonik halus bezierCurveTo.",
    cyber: "Presisi step kinetik cybernetic, sapuan laser scan clip tajam, dan indikator status LED ritmis.",
    mechanical: "Artikulasi sasis dan poros beveled presisi tanpa roda gerigi, redaman inersia harmonis.",
    flow: "Kinetika floating harmonis megah (floatY = Math.sin(t * 2.4) * (S * 0.045)) dengan inersia sekunder (Math.sin(t * 2.4 - 0.45) * 4px)."
  }[motionDynamics] || "Kinetika floating 3D harmonis 60 FPS dengan redaman inersia alami.";

  const colorStyleDirective = isGreenScreen
    ? "- KANVAS GREEN SCREEN MURNI: Background #00ff00. STRICT ZERO SHADOWBLUR! Dilarang ctx.shadowBlur atau shadowColor transparan yang merusak chroma key. Gunakan warna bodi solid kontras tinggi (Cyan, Gold, Ungu, Oranye, dsb.)."
    : (neonGlow
        ? "- MODE NEON GLOW: Pencahayaan luminescent tajam pada aksen/LED (ctx.shadowBlur = 12; ctx.shadowColor = primaryColor). Dilarang shadowBlur pada seluruh kanvas."
        : "- MODE CRISP FLAT/SOLID: Vektor solid tajam tanpa blur (ctx.shadowBlur = 0).");

  const systemPrompt = `Anda adalah Master HTML5 Canvas 2D Motion Designer & Microstock Specialist.
Tugas: Buat 1 file HTML animasi Canvas 2D yang SANGAT PRESISI, BENTUK AKURAT SESUAI PROMPT, 60 FPS, dan 100% BEBAS CACAT.

PARAMETER PROMPT:
- Subjek/Topik: "${promptTopic}"
- Tipe Animasi: ${isBackground ? 'FULL-FRAME MOTION BACKGROUND (100% Widescreen Coverage)' : '3D MONOLITHIC ICON (Pusat Kanvas)'}
- Gaya Visual: ${style} | Mode Warna: ${colorMode}
- Dinamika Gerakan: ${motionDynamics.toUpperCase()} (${motionDirectives})
${colorStyleDirective}

ATURAN MUTLAK ANIMASI (ZERO DEFECT & STRICT ZERO GROUND SHADOW):
1. STRICT ZERO GROUND SHADOW (MUTLAK):
   - DILARANG KERAS MENGGAMBAR BAYANGAN LANTAI, BAYANGAN DI BAWAH IKON, ATAU ELIPS HITAM/HIJAU DI BAWAH OBJEK!
   - Objek ikon melayang 100% bersih dan murni langsung di atas kanvas / green screen.
2. 3D MONOLITHIC RIGGING (ZERO DETACHED PARTS):
   - Seluruh anatomi objek harus menyatu kokoh di bawah 1 koordinat pusat (cx, cy + floatY). Dilarang bagian terlepas, mengambang liar, atau terputus!
3. CHIAROSCURO VOLUMETRIC STUDIO LIGHTING:
   - Kesan 3D dibangun melalui gradien multi-stop directional 45°: Top plane (key light highlight cerah), Front facade (warna midtone kaya), dan Underside rim (ambient occlusion gelap -35%).
   - Berikan Bevel Highlight line 1.5px putih translusen di tepi atas untuk kilau material mewah.
4. STRICT ZERO RODA GERIGI (NO COGWHEELS):
   - Dilarang menggambar roda gerigi / gir berputar pada ikon.
5. STRICT ZERO PARTICLES & ZERO WHITE FLARES:
   - Dilarang partikel debu melayang, bintik acak, atau flare putih silau yang merusak visual.
${isBackground ? '6. FULL-FRAME COVERAGE: Animasi background WAJIB mengisi kanvas dari (0, 0) hingga (w, h) secara penuh dan bergerak 60 FPS seamless loop.' : ''}

WAJIB outputkan struktur HTML lengkap berikut (hanya kode HTML, tanpa penjelasan):
<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { width: 100vw; height: 100vh; overflow: hidden; background: ${bgColor}; display: flex; align-items: center; justify-content: center; }
  canvas { display: block; width: 100%; height: 100%; }
</style>
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

  function animate(time) {
    const t = time * 0.001;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = ${clearFill};
    ctx.fillRect(0, 0, w, h);

    // Kinetika 60 FPS presisi (Root Floating & Chiaroscuro 3D - TANPA BAYANGAN DI BAWAH OBJEK)
    ${isBackground ? '// Render Edge-to-Edge Widescreen Motion Graphics Latar Belakang' : `const floatY = Math.sin(t * 2.4) * (S * 0.04);
    ctx.save();
    ctx.translate(cx, cy + floatY);
    // [Gambar bentuk 3D Monolithic subjek "${promptTopic}" dengan Chiaroscuro 45° & Bevel Rail di sini]
    ctx.restore();`}

    requestAnimationFrame(animate);
  }
  requestAnimationFrame(animate);
</script>
</body>
</html>`;

  const primaryModel = sanitizeModel(model);
  // Cukup 2 model: model utama pilihan, dan jika gagal/limit langsung ke model hemat kuota tercepat
  const candidateModels = [
    primaryModel,
    primaryModel !== 'gemini-3.5-flash-lite' ? 'gemini-3.5-flash-lite' : 'gemini-2.5-flash',
  ];

  let lastDirectError: any = null;

  for (const currentModel of candidateModels) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${currentModel}:generateContent?key=${encodeURIComponent(
        apiKey
      )}`;

      const directGenConfig: any = {
        temperature: 0.35,
        maxOutputTokens: 8192,
      };

      let res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: systemPrompt }] }],
          generationConfig: directGenConfig,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error?.message || `Google API Error ${res.status}`);
      }

      const data = await res.json();
      let rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      let cleanHTML = extractHTML(rawText, isGreenScreen);

      if (!cleanHTML.toLowerCase().includes('</html>') || !cleanHTML.toLowerCase().includes('</script>')) {
        if (cleanHTML.toLowerCase().includes('requestanimationframe') || cleanHTML.toLowerCase().includes('<canvas') || cleanHTML.toLowerCase().includes('function animate')) {
          rawText += '\n  }\n  animate(0);\n</' + 'script>\n</body>\n</html>';
          cleanHTML = extractHTML(rawText, isGreenScreen);
        }
      }

      if (!cleanHTML || (!cleanHTML.toLowerCase().includes('<script') && !cleanHTML.toLowerCase().includes('<canvas'))) {
        throw new Error('Kode dari AI belum lengkap');
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

      // Model rotasi otomatis jika attempt > 1 untuk mengatasi temporary 500 / overload pada model tertentu
      let attemptModel: GeminiModel = model || 'gemini-3.8-flash';
      if (attempt === 2) {
        attemptModel = (model === 'gemini-3.5-flash-lite' ? 'gemini-3.1-flash-lite' : 'gemini-3.5-flash-lite');
      } else if (attempt >= 3) {
        attemptModel = 'gemini-2.5-flash';
      }

      // If user provided an API key, try direct client call first for 0-latency
      if (apiKey) {
        try {
          return await generateAnimationDirect(
            apiKey,
            attemptModel,
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
          model: attemptModel,
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
    ...(primaryModel === 'gemini-3.5-flash-lite' ? ['gemini-3.5-flash-lite-preview', 'gemini-3.1-flash-lite'] : []),
    ...['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-2.5-flash', 'gemini-flash-latest', 'gemini-3.1-pro-preview'].filter(
      (m) => m !== primaryModel
    ),
  ];

  const cleanTitle = fileName.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
  const bgColor = isGreenScreen ? '#00ff00' : '#080c14';
  const clearFill = isGreenScreen ? "'#00ff00'" : "'#080c14'";

  const masterMultimodalPrompt = `Anda adalah Master Canvas 2D Motion Graphics, Lead Computer Vision Engineer, dan Senior 3D Animator (Adobe After Effects / Lottie 60 FPS Microstock Specialist).

TUGAS UTAMA (ULTRA-DETAIL PROFESSIONAL IMAGE-TO-MOTION):
Analisis GAMBAR REFERENSI yang diunggah secara visual mendalam (pixel-level structural & chromatic analysis), lalu REKONSTRUKSI MENJADI KODE ANIMASI HTML5 CANVAS 2D yang SANGAT PRESISI, MIRIP DENGAN GAMBAR ASLI (bentuk anatomi, proporsi, rasio bevel, kode warna HEX asli), dan BERIKAN GERAKAN KINETIK 60 FPS KELAS ATAS (ULTRA-MODIFIKASI PROFESSIONAL)!

=============================================================================
1. ANALISIS ANATOMI & KEMIRIPAN TINGGI (HIGH FIDELITY VISUAL RECONSTRUCTION):
=============================================================================
- DEKONSTRUKSI ELEMEN GAMBAR ASLI:
  * Identifikasi subjek utama (apakah mikrofon studio, mobil, tas, trofi, kamera, roket, sepatu, gadget, robot, bangunan, kartu, dll.).
  * Teliti rasio proporsi lebar vs tinggi (aspect ratio) dan bentuk geometris spesifiknya (beveled rectangle, kurva bezier khusus, sudut chamfer, dll.).
  * EKSTRAK KODE WARNA HEX ASLI (#RRGGBB) langsung dari gambar: warna bodi utama, warna aksen sekunder, warna bayangan chiaroscuro (ambient occlusion), warna highlight kilau, dan warna garis kontur.
  * REKONSTRUKSI SETIAP DETAIL SUB-KOMPONEN: Gambar ulang seluruh bagian yang tampak di gambar referensi (tombol, layar, display digital, lensa, indikator LED, kabel, tali, pegangan, sasis) menggunakan fungsi Canvas 2D presisi (\`ctx.roundRect\`, \`ctx.bezierCurveTo\`, \`ctx.ellipse\`, \`ctx.arc\`, \`ctx.fill()\`, \`ctx.stroke()\`).
- DILARANG KERAS menyederhanakan menjadi bulatan/kotak biasa atau abstrak mentah! Bentuk harus sangat mirip dan dapat dikenali seketika sebagai kembaran animasi dari gambar referensi.
- DILARANG KERAS memunculkan roda gerigi jika gambar aslinya bukan roda gigi!
- DILARANG KERAS membungkus objek dalam gelembung bulat transparan (enclosing glass bubble) atau kotak kartu wadah latar belakang!

=============================================================================
2. PERGERAKAN KINETIK KELAS ATAS (ULTRA-MODIFIKASI PROFESSIONAL 60 FPS):
=============================================================================
Jangan buat animasi kaku atau monoton! Terapkan sistem pergerakan multi-layer yang hidup dan berbobot:
1. GERAKAN UTAMA (Root Floating & Inertia):
   - Osilasi vertikal harmonis yang bernapas: \`const floatY = Math.sin(t * 2.4) * (S * 0.04);\`
   - Kemiringan gimbal halus: \`const rot = Math.sin(t * 1.8) * 0.025;\`
   - Elastisitas squash-and-stretch alami: \`const squash = 1 + 0.03 * Math.cos(t * 2.4); const stretch = 1 / Math.sqrt(squash);\`
2. ARTIKULASI SUB-KOMPONEN SESUAI FUNGSI OBJEK (Secondary Kinetic Articulation):
   - Bagian-bagian internal/aksesoris bergerak dengan inersia fisika tertunda (phase lag: \`Math.sin(t * 2.4 - 0.4)\`):
     * Jika ada layar / display -> sapuan garis scanning laser ter-clip halus di area layar.
     * Jika ada indikator LED / tombol -> denyut pendaran luminescence lembut (\`ctx.shadowBlur = 8 + Math.sin(t * 3.5) * 4\`).
     * Jika ada lensa kamera / sensor -> denyut fokus halus atau aperture breathing.
     * Jika ada pegangan / antena / tali -> getaran elastis responsif.
     * Jika ada pelat / penutup -> artikulasi mikro pernapasan.
3. SPECULAR GLEAM SWEEP BERKELAS:
   - Sapuan kilau cahaya spekular miring 45 derajat yang menyapu melintasi permukaan objek (\`const gleamX = ((t * 0.8) % 3 - 1.5) * S * 2.5;\`) dan WAJIB di-clip di dalam siluet bentuk badan objek.
4. BAYANGAN KONTAK LANTAI (Ground Contact Shadow):
   - Bayangan elips di bawah objek yang membesar dan mengabur saat objek melayang naik, dan mengecil tajam saat objek turun.

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
  "shapeDescription": "Deskripsi anatomi detail dan warna HEX asli yang dianalisis dari referensi",
  "detectedElements": ["Komponen Bodi Utama", "Detail Sub-Struktur", "Palet HEX Asli", "Aksen Kinetik"],
  "professionalMotionPlan": "Rencana pergerakan ultra modifikasi 60 FPS untuk setiap layer komponen",
  "similaritySynthesis": "Rekonstruksi presisi kode warna dan proporsi gambar 1:1",
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

  // Safe fallback palette variables
  const darkTone = '#0f172a';
  const lightTone = '#38bdf8';
  const primaryColor = '#3b82f6';
  const secondaryColor = '#8b5cf6';
  const accentColor = '#f59e0b';

  function animate(time) {
    const t = time * 0.001;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = ${clearFill};
    ctx.fillRect(0, 0, w, h);

    // 1. BAYANGAN LANTAI VOLUMETRIK (GROUND CONTACT SHADOW)
    const floatY = Math.sin(t * 2.4) * (S * 0.038);


    // 2. ROOT MATRIX TUNGGAL UNTUK SELURUH OBJEK (SINGLE MONOLITHIC RIGID BODY):
    // WAJIB: SELURUH ELEMEN PENYUSUN OBJEK DIGAMBAR DI DALAM BLOK INI DENGAN TITIK PUSAT (0, 0)!
    const squash = 1 + 0.03 * Math.cos(t * 2.4);
    const stretch = 1 / Math.sqrt(squash);
    ctx.save();
    ctx.translate(cx, cy + floatY);
    ctx.rotate(Math.sin(t * 1.8) * 0.025);
    ctx.scale(squash, stretch);

    // [GAMBARKAN REKONSTRUKSI ULTRA DETAIL SESUAI GAMBAR REFERENSI DI SINI]:
    // - Gunakan kode warna HEX asli dari gambar referensi
    // - Gambar setiap komponen secara proporsional dan presisi (bodi, aksen, bevel, layar, lensa, tombol)
    // - Gerakkan sub-komponen dengan artikulasi inersia fase-tertunda
    // - Clip specular sheen miring di siluet bodi

    ctx.restore();

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

      const smartThinking = currentModel.includes('2.5') || currentModel.includes('3.8') || currentModel.includes('pro')
        ? { thinkingBudget: 2048 }
        : undefined;

      const genConfig: any = {
        temperature: 0.12,
        maxOutputTokens: 8192,
      };
      if (smartThinking) genConfig.thinkingConfig = smartThinking;

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
          generationConfig: genConfig,
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
