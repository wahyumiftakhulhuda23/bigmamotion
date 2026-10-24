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
  if (!model) return 'gemini-2.5-flash';
  const m = model.trim().toLowerCase();
  if (m.includes('3.8') || m === 'gemini-3.8-flash') return 'gemini-3.8-flash';
  if (m.includes('2.5') || m === 'gemini-2.5-flash') return 'gemini-2.5-flash';
  if (m.includes('3.1-flash-lite') || m.includes('lite')) return 'gemini-3.1-flash-lite';
  if (m.includes('3.1-pro') || m.includes('pro')) return 'gemini-3.1-pro-preview';
  if (m === 'gemini-flash-latest') return 'gemini-flash-latest';
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

MANDATORY RULES FOR STANDALONE 3D VOLUMETRIC OBJECT (STRICT ZERO RHOMBUS, ZERO SHIELD, ZERO BACKGROUND PLATES):
1. STANDALONE VOLUMETRIC 3D ICON OBJECT (THE OBJECT ITSELF IS 3D):
   - The prompt MUST describe the subject/icon itself (e.g. 3D Camera, 3D Notification Bell, 3D Studio Microphone, 3D Padlock, 3D Trophy, 3D Crypto Vault, 3D Shopping Cart) as a physical, chunky, standalone 3D isometric artifact.
   - STRICT ZERO CONTAINER / ZERO RHOMBUS / ZERO SHIELD RULE:
     * NEVER place the icon on a diamond (belah ketupat), hexagon, shield plate, medallion base, or background card!
     * The icon must stand 100% naked and standalone on the canvas/green screen.
   - PHYSICAL 3D ATTRIBUTES ON THE ICON ITSELF:
     * Thick 3D isometric extrusion walls on side/bottom showing tangible mass with deep ambient shadow (-40% contrast).
     * Smooth beveled chamfers and curved fillets with crisp 1.5px specular highlight rails catching key studio lighting.
     * Rich multi-stop chiaroscuro gradients across front facets (e.g. lustrous imperial gold, chrome titanium, matte obsidian, or vivid saturated materials).
     * Soft breathing elliptical ground contact shadow cast directly below the object on the canvas/green screen.
2. DETAILED MONOLITHIC RIGGED ANATOMY (ZERO DETACHED PARTS, ZERO BUBBLES):
   - All internal components (lens barrel on camera, clapper inside bell, mesh grille on microphone, dial on vault) are physically welded into the unified 3D chassis.
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

  let typeInstructions = '';
  if (type === 'icon') {
    typeInstructions = `
ATURAN MASTER IKON MOTION 3D ULTRA-REALISTIS & BERKELAS TINGGI (ZERO DEFECT & REALISTIC DEPTH):
1. ANATOMI VOLUMETRIK 3D REALISTIS (BUKAN SKETSA/KARTUN BIASA):
   - Ikon WAJIB tampak berbobot fisik nyata, berdimensi 2.5D / isometric, memiliki ketebalan material yang solid dan mewah (seperti plastik glossy Apple, logam alloy terpoles, kaca kristal, atau bodi ter-bevel presisi).
   - DILARANG KERAS bentuk 2D datar, sketsa garis kawat (wireframe), atau potongan geometris mentah tanpa volume!
   - BAYANGAN LANTAI (GROUND CONTACT SHADOW): Buat elips bayangan kontak di bawah objek yang bernapas secara harmonis selaras dengan osilasi vertikal (floatY).
   - PENCAHAYAAN STUDIO 3-TITIK: Key light specular di sudut kiri-atas, bodi gradien kaya 3-4 stop warna, dan ambient occlusion / bayangan lipatan di celah antar komponen.
2. ISOLASI TOTAL & KEBERSIHAN KANVAS:
   - Tampilkan 1 simbol sentral berpresisi tinggi di tengah canvas (cx, cy).
   - DILARANG KERAS memunculkan partikel melayang, debu, bintik-bintik random, serpihan liar, atau aura blur di luar objek utama! Kanvas di sekeliling ikon HARUS 100% bersih.
3. KINETIKA & INERSIA SEKUNDER REALISTIS 60 FPS:
   - Gerakan tidak boleh kaku atau monoton: Gabungkan floating harmonis root (±8px) dengan gerakan inersia sekunder (muatan internal berosilasi dengan jeda fase, jarum pengukur bergetar responsif, velg roda berputar mulus, lampu indikator berkedip ritmis).`;
  } else if (type === 'bg') {
    typeInstructions = `
ATURAN MASTER FULL-FRAME BACKGROUND MOTION (STRICT ZERO PARTICLES & CINEMATIC REALISM):
1. DILARANG KERAS MENGGAMBAR PARTIKEL, DEBU MELAYANG, ATAU BINTIK-BINTIK ACAK:
   - Visual latar belakang WAJIB 100% BERSIH DARI PARTIKEL/DEBU/NOISE! DILARANG partikel mengambang, bintik stardust, atau serpihan titik-titik liar.
   - Latar belakang WAJIB berupa karya motion graphics kelas atas: 3-5 lapisan pita gelombang cairan sinusoidal (fluid wave ribbons), lipatan kain sutra mewah (luxury silk caustics), grid perspektif cakrawala 3D bergelombang, atau jaring poligon topografi berkontur yang membentang luas.
2. CAKUPAN PENUH 100% WIDESCREEN & KEDALAMAN VOLUMETRIK:
   - Mengisi seluruh canvas secara penuh dari sudut (0, 0) hingga (w, h). Tidak boleh ada ruang mati atau ikon terisolasi di tengah.
   - Bergerak dengan ritme harmonis linear 60 FPS yang memukau dan bernilai jual tinggi layaknya motion background studio Adobe Stock / Envato Elements.`;
  }

  const bgColor = isGreenScreen ? '#00ff00' : '#080c14';
  // Always use 100% solid background clear & fill to eliminate any motion trails, ghosting, or smudges
  const clearFill = isGreenScreen ? "'#00ff00'" : "'#080c14'";

  let motionGuide = '';
  if (motionDynamics === 'bounce') {
    motionGuide = `
PANDUAN GERAKAN BOUNCE & SPRING (REALISTIS BERBOBOT):
- Gunakan rumus elastis membal (spring physics): const bounce = Math.abs(Math.sin(t * 3.2)); const squash = 1 + 0.18 * (1 - bounce); const stretch = 1 / squash;
- Terapkan squash & stretch saat objek mendarat atau memantul. Objek terasa elastis dan berbobot nyata!`;
  } else if (motionDynamics === 'orbital') {
    motionGuide = `
PANDUAN GERAKAN 3D ORBITAL & GYROSCOPE (REALISTIS KINETIK):
- Simulasikan rotasi 3D multi-cincin dengan kedalaman sumbu z (pseudo-3D):
  const angle = t * 1.5 + i * (Math.PI * 2 / N);
  const x = Math.cos(angle) * radiusX;
  const y = Math.sin(angle) * radiusY * Math.cos(tiltAngle);
  const z = Math.sin(angle) * Math.sin(tiltAngle);
  ctx.scale(1 + z * 0.25, 1 + z * 0.25); ctx.globalAlpha = 0.6 + 0.4 * (z + 1) / 2;`;
  } else if (motionDynamics === 'morph') {
    motionGuide = `
PANDUAN GERAKAN KINETIC MORPHING (ORGANIK HALUS):
- Bentuk geometris bertransformasi dinamis antar fase menggunakan kurva lengkung kontinu (bezierCurveTo) dengan osilasi harmonik harmonis.`;
  } else if (motionDynamics === 'cyber') {
    motionGuide = `
PANDUAN GERAKAN CYBER STEP & HUD TELEMETRY:
- Gerakan berpola kuantisasi tajam terkalibrasi: busur derajat berputar presisi, dial bidik melingkar, laser scanner bolak-balik melintasi area target (ctx.clip()), dan sudut siku telemetri [ ].`;
  } else if (motionDynamics === 'mechanical') {
    motionGuide = `
PANDUAN GERAKAN MECHANICAL & ARTICULATED (FISIKA MESIN NYATA):
- Roda gigi interlocking berputar sinkron berlawanan arah, poros engsel berayun dengan redaman fisika, dan tuas bergerak dengan artikulasi bertenaga.`;
  } else {
    motionGuide = `
PANDUAN GERAKAN ORGANIC FLOW & WAVES:
- Gunakan gelombang sinusoidal multi-frekuensi: const wave = Math.sin(t * 2.0 + i * 0.6) * 0.7 + Math.cos(t * 1.1 + i * 0.3) * 0.3;
- Objek dan pita mengalir lembut dengan kemiringan dinamis elegan.`;
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
${colorMode === 'gradient' ? '- Gunakan createLinearGradient dinamis multi-stop yang kaya dan elegan.' : ''}`;
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
ATURAN MASTER FULL-FRAME BACKGROUND MOTION GRAPHICS (100% EDGE-TO-EDGE, ZERO PARTICLES, ZERO WHITE FLARES & DIVERSE STYLES):
1. CAKUPAN PENUH 100% SELURUH KANVAS (EDGE-TO-EDGE WIDESCREEN):
   - Animasi latar belakang WAJIB mengisi SELURUH layar secara penuh dari sudut (0, 0) hingga (w, h).
   - DILARANG KERAS menggambar icon/simbol terisolasi di tengah layar!
   - DILARANG menyisakan ruang kosong, tepi mati, atau batas kanvas kosong yang tidak terisi gerakan motion graphics.

2. STRICT BAN ON PARTICLES / ZERO DUST MOTES (MUTLAK DIPATUHI):
   - DILARANG KERAS memunculkan bintik partikel, debu melayang, bintang titik-titik liar, partikel emitter, atau serpihan noise pada background!
   - Seluruh visual harus berupa grafis kontinu studio profesional yang megah dan berkelas tinggi.

3. STRICT BAN ON WHITE LIGHT FLARES & WHITEOUT RADIAL BURSTS (MUTLAK DIPATUHI):
   - DILARANG KERAS MENGGAMBAR FLARE CAHAYA PUTIH (WHITE FLARE), LINGKARAN RADIAL BURST PUTIH DI TENGAH, SOROTAN LAMPU PUTIH MENYILAU KANVAS, ATAU SAPUAN KABUT PUTIH (WHITEOUT GLARE)!
   - DILARANG menggunakan gradien putih murni (#FFFFFF atau rgba(255, 255, 255, >0.15)) sebagai pusat sorotan layar atau sumber cahaya besar!
   - Semua pencahayaan dan gradien atmosferik WAJIB menggunakan warna kromatik bertingkat elegan (misal: deep cyan, royal violet, emerald, rich amber, midnight sapphire, champagne gold, atau obsidian slate) dengan opacity lembut (alpha 0.05 - 0.25) dan transisi halus berkelas tinggi.

4. MINIMALISIR KEMIRIPAN GAYA & DIFERENSIASI TOTAL (ARSITEKTUR VISUAL WAJIB BERBEDA SESUAI BRIEF):
   Animasi WAJIB mengadopsi salah satu dari 6 arsitektur visual berikut yang paling relevan dengan subjek prompt (JANGAN semua dibuat gelombang biasa):
   - Arsitektur 1 (Fluid Chromatic Splines): 4-6 pita cairan sinusoidal bergradien kaya yang saling meliuk dengan frekuensi harmonis berbeda dan mode translusen bertumpuk.
   - Arsitektur 2 (3D Perspective Horizon Grid): Grid perspektif kawat digital membentang ke horizon dengan vanishing point di (cx, cy * 0.45) dan gelombang elevasi undulating pada baris-baris kisi.
   - Arsitektur 3 (Luxury Silk & Satin Folds): Lipatan kain sutra satin tebal berkilau emas/sampanye/obsidian dengan bayangan volumetrik dramatis (chiaroscuro) dan kilau caustics yang meliuk mewah.
   - Arsitektur 4 (Topographic Elevation Contours): Garis-garis kontur elevasi topografi bergelombang yang mengalir dinamis melintasi kanvas seperti peta survei geologi modern bergradien.
   - Arsitektur 5 (Architectural Origami & Faceted Planes): Bidang-bidang poligon isometrik 3D translusen yang bergeser dan berlipat elegan secara pseudo-3D.
   - Arsitektur 6 (Chromatic Prismatic Caustics): Aliran pita cahaya prisma kromatik halus bersudut lembut (cyan, ungu, dan emas berpadu dengan blending screen translusen rendah) tanpa flare putih silau.

5. 60 FPS SEAMLESS LOOPING & SMOOTH KINETICS:
   - Waktu t dihitung dari timestamp (t = time * 0.001).
   - Seluruh rumus gerakan periodik menggunakan fungsi trigonometri harmonis (Math.sin, Math.cos) tanpa sentakan tajam (seamless infinite loop).
   - TIDAK BOLEH ADA TEKS / HURUF / ANGKA.`
    : `
ATURAN MASTER IKON MOTION 60 FPS ULTRA-REALISTIS & BERKELAS TINGGI (ZERO DEFECT, ZERO BUBBLE, ZERO BOX-ABSTRACTION):

======================================================================
1. LARANGAN MUTLAK ANTI-CACAT (STRICT NEGATIVE PROHIBITIONS - ZERO DEFECT):
======================================================================
[CACAT 1: ABSTRAKSI KOTAK TEGAK - STRICT BAN ON VERTICAL BOX ABSTRACTION]:
- DILARANG KERAS menyederhanakan objek dunia nyata (seperti Topi Toga Wisuda, Lonceng, Model Atom, Trofi, Mikroskop, Mobil, Roket, Kamera) menjadi kotak persegi panjang / rounded rectangle berdiri tegak dengan tangkai/tongkat!
- Objek WAJIB memiliki bentuk geometris khas aslinya (diamond horizontal untuk topi toga, flared bezier untuk lonceng, 3 elips miring tertutup untuk atom, U-shackle melengkung untuk gembok, dsb.).

[CACAT 2: BOLA KACA WADAH / ENCLOSING CONTAINER BUBBLE - STRICT ZERO BUBBLE]:
- DILARANG KERAS membungkus icon (seperti model atom Bohr, molekul, bola dunia, gadget, gear, logo) di dalam gelembung bulat transparan besar, orb kaca berkabut (milky sphere), atau kapsul melingkar (ctx.arc(0, 0, S, ...) dengan alpha fill)!
- Objek harus berdiri sendiri secara telanjang, murni, dan presisi di atas canvas tanpa kubah/gelembung pembungkus yang merusak chroma key dan kejernihan icon!

[CACAT 3: KARTU WADAH / BACKDROP CONTAINER - STRICT ZERO BACKDROP PLATE]:
- DILARANG KERAS menggambar rounded rectangle transparan, pelat kartu latar, atau kotak container di belakang icon. Kanvas di sekitar icon harus 100% tembus pandang (hijau murni #00ff00 pada greenscreen, gelap solid pada dark mode).

[CACAT 4: LINTASAN CACAT & BAGIAN TERPISAH - ZERO DETACHED PARTS & NO BROKEN ARCS]:
- Semua lintasan orbit harus elips tertutup kontinu sempurna (ctx.ellipse(...)), dan seluruh komponen penyusun (tassel ke topi toga, roda ke sasis troli, bibir lonceng, dsb.) harus MENYATU FISIK KOKOH tanpa celah udara mengambang!

[CACAT 5: DILARANG MEMBUAT BANGUN BELAH KETUPAT / PERISAI / PELAT ALAS (STRICT ZERO RHOMBUS / ZERO SHIELD CONTAINER)]:
- DILARANG KERAS menggambar bangun belah ketupat (rhombus), diamond, perisai (shield/crest), medali plat, emblem badge, atau bingkai kartu di belakang icon!
- OBJEK ICON HARUS BERDIRI SENDIRI SECARA MURNI (100% STANDALONE 3D OBJECT) langsung di atas canvas/green screen!
- BUKAN pelatnya yang dibuat 3D, melainkan OBJEK ICON ITU SENDIRI yang dibuat 3D bervolume (jika Kamera, maka bodi kamera 3D tebal; jika Lonceng, maka bodi lonceng 3D tebal; jika Mikrofon, maka kapsul & stand mikrofon 3D tebal)!

======================================================================
2. MASTER STANDALONE 3D VOLUMETRIC ICON BLUEPRINT (CHUNKY 3D SOLID OBJECT):
======================================================================
IKON MOTION HARUS MENERAPKAN TEKNIK 3D VOLUMETRIK PADA OBJEK ICON ITU SENDIRI (MURNI OBJEK 3D TUNGGAL, TANPA BELAH KETUPAT, TANPA PERISAI, TANPA CONTAINER):
Visual 3D ultra-realistis dibangun langsung pada anatomi fisik objek icon melalui 6 layer terpadu:

[LAYER 1: BAYANGAN KONTAK LANTAI (Breathing Ground Contact Shadow)]:
- Elips bayangan kontak lantai langsung di bawah objek icon di canvas/green screen:
  const groundY = S * 0.44;
  const shadowScale = 1 - Math.sin(t * 2) * 0.12;
  ctx.beginPath();
  ctx.ellipse(0, groundY, S * 0.38 * shadowScale, S * 0.08 * shadowScale, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0, 30, 0, 0.4)'; // Bayangan lembut pada green screen (atau rgba(0, 0, 0, 0.35) pada dark mode)
  ctx.fill();

[LAYER 2: KINETIKA MELAYANG & ELEVASI 3D (Floating Bobbing & 3D Pitch/Roll)]:
- Objek icon melayang anggun naik-turun dan sedikit miring isometrik:
  const floatY = Math.sin(t * 2) * (S * 0.05);
  const tiltAngle = Math.cos(t * 1.5) * 0.035; // kemiringan mikro sudut 3D
  ctx.save();
  ctx.translate(0, floatY);
  ctx.rotate(tiltAngle);

[LAYER 3: DINDING KETEBALAN EKSTRUSI 3D LATERAL & BAWAH (Chunky 3D Extrusion Side-Walls)]:
- Objek icon (bodi kamera, kubah lonceng, bodi gembok, rangka trofi, dsb.) memiliki dinding samping kanan dan bawah yang diekstrusi tebal (extX = S * 0.08, extY = S * 0.06):
  // Poligon ekstrusi samping kanan-bawah dengan warna bayangan ambient gelap pekat:
  // (Gunakan warna bayangan 40-50% lebih gelap dari warna permukaan depan, misal #0f172a, #162032, atau #78350f untuk emas).
  // Sambungkan vertex depan objek ke vertex offset (x + extX, y + extY).
  ctx.fillStyle = darkExtrusionColor;
  ctx.fill();

[LAYER 4: FASAD DEPAN OBJEK DENGAN GRADIEN MULTI-STOP KAYA (Vibrant Multi-Stop Face)]:
- Fasad depan objek digambar presisi sesuai bentuk aslinya dengan gradien multi-stop (misal emas: #fffbeb -> #fde047 -> #eab308 -> #ca8a04 -> #78350f; titanium: #475569 -> #334155 -> #1e293b; cobalt: #38bdf8 -> #0284c7 -> #0369a1).

[LAYER 5: CRISP SPECULAR BEVEL HIGHLIGHT RAILS (Garis Kilau Spekular Tepi 3D)]:
- Tepi atas dan kiri objek yang menghadap sumber cahaya studio diberi stroke 1.5–2px putih cerah bergradien (rgba(255, 255, 255, 0.65) memudar ke 0.15) untuk memberikan efek chamfer berkilau mewah.

[LAYER 6: DETAIL MEKANIKAL/FISIK INTERNAL TERPADU]:
- Komponen internal objek (lensa kamera berlapis kaca konsentris, lidah clapper lonceng, tombol shutter silinder, kisi mesh mic) dipasang menyatu kokoh dengan bayangan oklusi sendiri.
ctx.restore();

======================================================================
3. SEMANTIC GEOMETRIC BLUEPRINT COMPENDIUM (RESEP SUBJEK STANDALONE):
======================================================================
Gunakan resep geometris matematis berikut sesuai subjek yang diminta dalam prompt (SEMUANYA STANDALONE TANPA BELAH KETUPAT/SHIELD):

[A. TOPI TOGA WISUDA (ACADEMIC GRADUATION MORTARBOARD CAP)]:
1. Papan Atas Belah Ketupat Horizontal Isometrik 3D (Diamond Rhombus Top Board):
   Papan atas BUKAN KOTAK TEGAK, melainkan belah ketupat horizontal 3D lebar:
   const boardW = S * 0.44; const boardH = S * 0.15; const boardY = -S * 0.12;
   // Tebal bibir bawah 3D (Beveled Rim Underbelly):
   ctx.beginPath();
   ctx.moveTo(-boardW, boardY);
   ctx.lineTo(0, boardY + boardH);
   ctx.lineTo(boardW, boardY);
   ctx.lineTo(boardW, boardY + 8);
   ctx.lineTo(0, boardY + boardH + 8);
   ctx.lineTo(-boardW, boardY + 8);
   ctx.closePath();
   ctx.fillStyle = '#0f172a'; ctx.fill(); // Bayangan rim gelap tebal
   // Papan atas berlian (Rhombus Face):
   ctx.beginPath();
   ctx.moveTo(0, boardY - boardH); // apex atas
   ctx.lineTo(boardW, boardY);     // sudut kanan
   ctx.lineTo(0, boardY + boardH); // sudut bawah
   ctx.lineTo(-boardW, boardY);    // sudut kiri
   ctx.closePath();
   ctx.fillStyle = capGrad; ctx.fill();
2. Kubah Bodi Topi (Skull Cap Dome):
   Menempel langsung di bawah papan tengah tanpa celah:
   ctx.beginPath();
   ctx.moveTo(-boardW * 0.45, boardY + 6);
   ctx.quadraticCurveTo(-boardW * 0.42, boardY + S * 0.28, 0, boardY + S * 0.28);
   ctx.quadraticCurveTo(boardW * 0.42, boardY + S * 0.28, boardW * 0.45, boardY + 6);
   ctx.closePath();
   ctx.fillStyle = '#1e293b'; ctx.fill();
3. Kancing Tengah & Tassel Sutra Menjuntai (Center Button & Dangling Silk Tassel):
   // Kancing tengah:
   ctx.beginPath(); ctx.ellipse(0, boardY, 6, 3, 0, 0, Math.PI * 2); ctx.fillStyle = '#ffd700'; ctx.fill();
   // Tali meliuk anggun dari kancing melintasi sudut kanan lalu menjuntai ke bawah:
   const swingTassel = Math.sin(t * 2.8) * (S * 0.04);
   ctx.beginPath();
   ctx.moveTo(0, boardY);
   ctx.quadraticCurveTo(boardW * 0.6, boardY - 3, boardW + 2, boardY + 8);
   ctx.quadraticCurveTo(boardW + 6 + swingTassel * 0.5, boardY + S * 0.16, boardW + 4 + swingTassel, boardY + S * 0.28);
   ctx.lineWidth = 3.5; ctx.strokeStyle = '#ffd700'; ctx.stroke();
   // Bandul rumbai rumbai emas bervolume:
   ctx.beginPath();
   ctx.roundRect(boardW + 4 + swingTassel - 5, boardY + S * 0.28, 10, 16, 3);
   ctx.fillStyle = '#f59e0b'; ctx.fill();

[B. MODEL ATOM BOHR / QUANTUM ATOM (STRICT ZERO ENCLOSING BUBBLES)]:
1. TANPA BOLA WADAH: DILARANG keras menggambar lingkaran/bola kaca transparan pembungkus!
2. Inti Atom Bervolume 3D (Glowing Nucleus):
   Bola pejal di pusat (0, 0) dengan gradien radial 3D (highlight di kiri atas):
   const nucGrad = ctx.createRadialGradient(-4, -4, 2, 0, 0, S * 0.13);
   nucGrad.addColorStop(0, '#ffffff'); nucGrad.addColorStop(0.3, '#38bdf8'); nucGrad.addColorStop(1, '#0284c7');
   ctx.beginPath(); ctx.arc(0, 0, S * 0.11, 0, Math.PI * 2); ctx.fillStyle = nucGrad; ctx.fill();
3. Tiga Orbit Elips Tertutup 3D Kontinu (3 Tilted 3D Closed Ellipses):
   Tiga cincin orbit diputar pada sudut 0, Math.PI/3 (60°), dan -Math.PI/3 (-60°):
   const rx = S * 0.44; const ry = S * 0.14;
   [0, Math.PI / 3, -Math.PI / 3].forEach((ang, idx) => {
     ctx.save();
     ctx.rotate(ang);
     ctx.beginPath();
     ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2); // ELIPS KONTINU PENUH TERTUTUP (BUKAN BUSUR PUTUS!)
     ctx.lineWidth = 3.5;
     ctx.strokeStyle = idx === 0 ? 'rgba(56, 189, 248, 0.8)' : idx === 1 ? 'rgba(168, 85, 247, 0.8)' : 'rgba(236, 72, 153, 0.8)';
     ctx.stroke();
     // Elektron padat 3D mengorbit 60 FPS:
     const eSpeed = t * 2.2 + idx * (Math.PI * 2 / 3);
     const ex = Math.cos(eSpeed) * rx;
     const ey = Math.sin(eSpeed) * ry;
     const depthScale = 1 + Math.sin(eSpeed) * 0.35; // Membesar saat di depan
     ctx.beginPath();
     ctx.arc(ex, ey, 6.5 * depthScale, 0, Math.PI * 2);
     ctx.fillStyle = '#ffffff'; ctx.fill();
     ctx.restore();
   });

[C. LONCENG NOTIFIKASI / BRASS ALERT BELL]:
1. TANPA KOTAK / TANPA LOLLIPOP: Lonceng memiliki bentuk cawan akustik flared yang melengkung indah!
2. Cincin Gantungan Atas (Hanger Loop):
   ctx.beginPath(); ctx.arc(0, -S * 0.36, 12, 0, Math.PI * 2); ctx.lineWidth = 4; ctx.strokeStyle = '#d97706'; ctx.stroke();
3. Badan Cawan Akustik Flared (Acoustic Bell Cup):
   const lipW = S * 0.32; const lipY = S * 0.22; const waistY = -S * 0.24;
   ctx.beginPath();
   ctx.moveTo(-lipW, lipY);
   ctx.bezierCurveTo(-lipW * 0.85, 0, -S * 0.14, waistY, 0, waistY);
   ctx.bezierCurveTo(S * 0.14, waistY, lipW * 0.85, 0, lipW, lipY);
   ctx.bezierCurveTo(lipW * 0.5, lipY + 12, -lipW * 0.5, lipY + 12, -lipW, lipY);
   ctx.closePath();
   ctx.fillStyle = bellGrad; ctx.fill();
4. Bibir Flens Bawah 3D (Beveled Rim Lip Ellipse):
   ctx.beginPath(); ctx.ellipse(0, lipY, lipW, 10, 0, 0, Math.PI * 2); ctx.fillStyle = '#b45309'; ctx.fill();
5. Bandul Pemukul Berayun (Internal Clapper Pendulum):
   const clapperSwing = Math.sin(t * 3.8) * (S * 0.08);
   ctx.beginPath(); ctx.arc(clapperSwing, lipY + 10, 11, 0, Math.PI * 2); ctx.fillStyle = '#78350f'; ctx.fill();

[D. TROFI JUARA (CHAMPIONSHIP TROPHY CUP)]:
Cawan piala meliuk cembung flared, 2 pegangan kuping telinga simetris melengkung kokoh di kiri-kanan, pilar batang berundak, dan bantalan marmer kubus 3D di bawahnya.

[E. SHOPPING CART / TROLI BELANJA]:
Sasis tubular horizontal di bawah (y = S * 0.18); Keranjang bervolume tebal menempel LANGSUNG menindih rapat di atas sasis dari y = -S * 0.22 sampai y = S * 0.18 (dasar keranjang menyentuh persis sasis tanpa celah!); Pegangan/handle berakar langsung dari bibir atas kiri keranjang; Roda terpasang menempel pada poros sasis bawah (-wheelX, axleY) dan (+wheelX, axleY).

[F. BUKU TERBUKA (OPEN ENCYCLOPEDIA / BOOK)]:
Punggung buku tebal di tengah (0, S * 0.15). Dua sayap lembaran kertas kiri dan kanan melengkung anggun menggunakan kurva sinusoidal bergelombang halus dengan halaman tipis yang membalik secara periodik.

[G. GEMBOK KEAMANAN (SECURITY PADLOCK)]:
Badan balok chamfered 3D di bawah (y = 0 hingga y = S * 0.28). Leher besi pengait (U-shackle) berbentuk busur tebal setengah lingkaran yang kedua ujung kakinya MENANCAP LANGSUNG KE DALAM DUA LUBANG di pelat atas bodi gembok.

[H. KAMERA PROFESIONAL 3D (STANDALONE 3D CAMERA - ZERO CONTAINER)]:
1. Bodi Utama Balok 3D Chamfered (Chunky 3D Camera Body):
   Bodi kamera tebal mandiri (w = S * 0.52, h = S * 0.34) dengan dinding ekstrusi lateral gelap di kanan-bawah:
   ctx.beginPath(); ctx.roundRect(-w * 0.5, -h * 0.35, w, h, 14); ctx.fillStyle = cameraBodyGrad; ctx.fill();
2. Lensa Silinder Bertingkat 3D (Stepped Concentric Cylindrical Lens):
   Cincin laras lensa timbul ke depan di tengah bodi:
   const lensR = S * 0.17;
   ctx.beginPath(); ctx.arc(0, 0, lensR, 0, Math.PI * 2); ctx.fillStyle = '#1e293b'; ctx.fill();
   ctx.beginPath(); ctx.arc(0, 0, lensR * 0.72, 0, Math.PI * 2); ctx.fillStyle = lensGlassGrad; ctx.fill();
3. Pentaprisma Atas & Tombol Shutter (Top Pentaprism & Spring Shutter Button):
   Tonjolan pentaprisma trapesium di atas bodi tengah, tombol shutter silinder di kiri-atas yang menekan halus secara periodik, dan lampu LED indikator merah merekah lembut.

[I. MIKROFON STUDIO 3D (STANDALONE 3D STUDIO MICROPHONE - ZERO CONTAINER)]:
1. Kapsul Silinder Kisi Mesh 3D (Cylindrical Wire Mesh Capsule):
   Kapsul silinder atas (w = S * 0.22, h = S * 0.30) dengan kubah busur di atas, tekstur kisi kawat melengkung halus, dan cincin shock-mount beveled di bawahnya.
2. Tiang Stand & Plat Kaki Berat (Heavy Metallic Stand Base):
   Tiang logam vertikal menghubungkan kapsul ke piringan alas kaki bulat berbobot di dasar kanvas, menghasilkan bayangan kontak lantai elips yang solid.

======================================================================
4. ARSITEKTUR 3D VOLUMETRIK & CHIAROSCURO REALISTIS:
======================================================================
Bentuk objek WAJIB mengadopsi gaya 3D volumetrik profesional berkelas tinggi (seperti microstock 3D vector):
- Bidang Atas (Top Plane): Menghadap key light studio, diwarnai dengan gradien terang atau hex cerah (+20% tint).
- Bidang Muka (Front Facade): Warna midtone solid utama yang kaya, padat, dan berbobot.
- Bidang Bawah / Samping (Underside / Shadow Plane): Bayangan ambien dalam (Ambient Occlusion Shadow), diwarnai dengan nada gelap berbobot (-35% hingga -45% dark shade) untuk menciptakan ilusi 3D volumetrik seketika!
- Bevel Highlight Rails: Garis lengkung tipis 1.5–2px warna putih translusen (rgba(255, 255, 255, 0.5)) di tepian atas bodi memberikan pantulan kilau material premium.
- Crevice Seam Shadows: Garis celah bayangan gelap 1–2px (rgba(0, 0, 0, 0.35)) di sambungan nat antar komponen.

======================================================================
5. KINETIKA ELASTIS 60 FPS (SQUASH-AND-STRETCH & INERSIA SEKUNDER):
======================================================================
- Osilasi vertikal elastis: Objek sedikit membal pipih (squash) saat melayang ke bawah dan meregang (stretch) saat melayang naik menggunakan rasio spring:
  const squash = 1 + 0.06 * Math.cos(t * 2.5);
  const stretch = 1 / Math.sqrt(squash);
- Inersia Sekunder (Secondary Spring Damping): Muatan internal atau elemen aksesoris berayun dengan fase redaman alami (Math.sin(t * 2.5 - 0.45) * 4px), membuat animasi terasa elastis, berbobot, dan hidup!
- Artikulasi Struktural Presisi: Engsel, silinder geser, atau indikator status beroperasi dengan pergerakan terkalibrasi tanpa sentakan.

======================================================================
6. MUTLAK: ZERO-GLARE OVERFLOW & ZERO BACKGROUND BOX:
======================================================================
- DILARANG KERAS menggambar kotak wadah, kartu latar, rounded rectangle background, bangun belah ketupat, atau aura plate di belakang icon! Kanvas di sekeliling icon harus 100% bersih tanpa coretan transparan apapun.
- DILARANG KERAS membuat lingkaran kilau putih raksasa / radial burst / whiteout flash!
- Efek kilau (specular gleam / light sweep) WAJIB 100% DI-CLIP di dalam siluet bentuk badan icon.

======================================================================
7. LARANGAN TOTAL RODA GERIGI PADA SELURUH ANIMASI IKON (STRICT ZERO GEARS / ZERO COGWHEELS):
======================================================================
- DILARANG KERAS MENGGAMBAR RODA GERIGI, GIR BERPUTAR, ATAU SPROCKET PADA ANIMASI IKON!
- Gerigi/gir seringkali muncul tanpa esensi dan merusak nilai estetika ikon. Hilangkan roda gerigi 100% dari seluruh ikon (dompet, brankas, kartu kredit, grafik pertumbuhan, smartphone, buku, roket, dll.).
- Gantilah dengan detail 3D isometrik yang bermakna dan berkelas modern: pelat bodi beveled chamfered, tombol keypad digital, kunci baut kokoh, engsel elegan, chip sirkuit terukir, atau indikator status LED lembut.

======================================================================
8. PRESISI 3D VOLUMETRIK 6 SISI (FRONT, BACK, LEFT, RIGHT, TOP, BOTTOM):
======================================================================
- Setiap objek icon WAJIB memiliki konstruksi 3D isometrik yang memperlihatkan presisi penuh dari segala sisi (permukaan atas/top yang diterangi key light, fasad depan/front yang kaya warna midtone, sisi kiri/kanan lateral yang terbayang, sisi bawah/bottom dengan ambient occlusion, dan struktur belakang yang menyatu kokoh).
- DILARANG Keras objek pipih 2D, bentuk tanpa sisi, atau bagian mengambang/terlepas.`;

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

  // --- UNIVERSAL SAFE FALLBACK GRADIENTS & CONSTANTS (PREVENTS ReferenceError) ---
  const darkTone = '#0f172a';
  const lightTone = '#38bdf8';
  const primaryColor = '#3b82f6';
  const secondaryColor = '#8b5cf6';
  const accentColor = '#f59e0b';
  const capGrad = ctx.createLinearGradient(-100, -100, 100, 100);
  capGrad.addColorStop(0, '#1e293b'); capGrad.addColorStop(1, '#0f172a');
  const bellGrad = ctx.createLinearGradient(-100, -100, 100, 100);
  bellGrad.addColorStop(0, '#fbbf24'); bellGrad.addColorStop(1, '#d97706');

  // --- INISIALISASI ELEMEN ---

  function animate(time) {
    const t = time * 0.001;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = ${clearFill};
    ctx.fillRect(0, 0, w, h);

${isBackground ? `    // --- FULL-FRAME MOTION BACKGROUND LAYER (100% COVERAGE, ZERO PARTICLES) ---
    // (Render edge-to-edge mathematical motion graphics across (0, 0) to (w, h))` : `    // 1. BAYANGAN LANTAI REALISTIS (GROUND CONTACT SHADOW)
    const floatY = Math.sin(t * 2.5) * (S * 0.038);
    const shadowScale = Math.max(0.65, 1 - (floatY / (S * 0.12)));
    ctx.save();
    ctx.translate(cx, cy + S * 0.52);
    ctx.beginPath();
    ctx.ellipse(0, 0, S * 0.38 * shadowScale, S * 0.06 * shadowScale, 0, 0, Math.PI * 2);
    ${isGreenScreen ? "ctx.fillStyle = 'rgba(0, 40, 0, 0.35)';" : "ctx.fillStyle = 'rgba(0, 0, 0, 0.32)';"}
    ctx.fill();
    ctx.restore();

    // 2. ROOT MATRIX TUNGGAL - 3D FLAT ELASTIS, BERBOBOT, & SOLID (100% ZERO DETACHED PARTS):
    const squash = 1 + 0.06 * Math.cos(t * 2.5);
    const stretch = 1 / Math.sqrt(squash);
    ctx.save();
    ctx.translate(cx, cy + floatY);
    ctx.rotate(Math.sin(t * 1.8) * 0.025);
    ctx.scale(squash, stretch); // Kinetika elastis squash-and-stretch alami

    // [GAMBARKAN SELURUH ANATOMI 3D FLAT IKON MENYATU KOKOH DI SINI (SEMUA KOORDINAT RELATIF TERHADAP (0, 0))]:
    // - PATUHI BENTUK GEOMETRIS ASLI SESUAI SUBJEK (Gunakan resep Bagian 2 di atas: Topi Toga = Diamond Rhombus; Atom Bohr = 3 Tilted Closed Ellipses TANPA outer glass bubble; Lonceng = Flared Bezier Bell Lip)
    // - DILARANG KERAS MENGABSTRAKSI MENJADI KOTAK TEGAK (STRICT ZERO VERTICAL RECTANGLES)!
    // - DILARANG KERAS BOLA KACA PEMBUNGKUS / ENCLOSING CONTAINER BUBBLES!
    // - DILARANG KERAS KARTU CONTAINER / BACKDROP PLATES!
    // - BIDANG ATAS (Top Plane): Warna terang (+20% highlight / key light specular)
    // - BIDANG DEPAN (Front Facade): Warna midtone solid utama yang kaya
    // - BIDANG BAWAH/SAMPING (Underside Shadow): Warna gelap (-35% ambient occlusion chiaroscuro)
    // - BEVEL HIGHLIGHT RAILS: Garis 1.5px putih translusen (rgba(255, 255, 255, 0.45)) di tepi atas
    // - INERSIA SEKUNDER: Muatan/isi berayun elastis dengan jeda fase (Math.sin(t * 2.5 - 0.45) * 4)
    // - DILARANG KERAS RODA GERIGI / GIR: Fokus pada bentuk 3D isometrik asli yang solid dan elegan
    // - SPECULAR GLEAM: Garis kilau diagonal 45 derajat di-clip di dalam bodi (ctx.clip())

    ctx.restore();`}

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
    ...['gemini-2.5-flash', 'gemini-3.8-flash', 'gemini-flash-latest', 'gemini-3.1-flash-lite', 'gemini-3.1-pro-preview'].filter(
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
        temperature: 0.35,
        maxOutputTokens: 8192,
      };
      if (currentModel.includes('2.5') || currentModel.includes('3.8') || currentModel.includes('flash') || currentModel.includes('pro')) {
        directGenConfig.thinkingConfig = { thinkingBudget: 2048 };
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
    const shadowScale = Math.max(0.68, 1 - (floatY / (S * 0.14)));
    ctx.save();
    ctx.translate(cx, cy + S * 0.52);
    ctx.beginPath();
    ctx.ellipse(0, 0, S * 0.38 * shadowScale, S * 0.06 * shadowScale, 0, 0, Math.PI * 2);
    ${isGreenScreen ? "ctx.fillStyle = 'rgba(0, 40, 0, 0.35)';" : "ctx.fillStyle = 'rgba(0, 0, 0, 0.32)';"}
    ctx.fill();
    ctx.restore();

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
