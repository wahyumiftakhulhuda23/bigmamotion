import express, { Router, Request, Response } from "express";
import dotenv from "dotenv";
import { GoogleGenAI, Type, ThinkingLevel } from "@google/genai";
import { findCategoryById, generateProceduralPrompts } from "../src/constants/categories";

dotenv.config();

export function getClient(apiKey?: string) {
  const key = (apiKey && apiKey.trim().length > 0) ? apiKey.trim() : process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error("API Key tidak ditemukan. Mohon masukkan API Key Anda di menu Header (ikon Kunci).");
  }
  return new GoogleGenAI({
    apiKey: key,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

export function getFastThinkingConfig(targetModel: string): any {
  // Only apply thinkingBudget if model is 3.1-pro or explicitly supports thinking to prevent 400 Bad Request
  if (targetModel.includes("pro") || targetModel.includes("thinking")) {
    return { thinkingBudget: 0 };
  }
  return undefined;
}

export function sanitizeModel(model?: string): string {
  if (!model) return "gemini-2.5-flash";
  const m = model.trim().toLowerCase();
  if (m.includes("2.5") || m === "gemini-2.5-flash") return "gemini-2.5-flash";
  if (m.includes("3.1-flash-lite") || m.includes("flash-lite") || m.includes("lite")) return "gemini-3.1-flash-lite";
  if (m.includes("3.1-pro") || m.includes("pro")) return "gemini-3.1-pro-preview";
  if (m === "gemini-flash-latest") return "gemini-flash-latest";
  return "gemini-2.5-flash";
}

export function cleanErrorMessage(err: any): string {
  if (!err) return "Terjadi kesalahan tidak diketahui";
  const raw = err.message || String(err);
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed?.error?.message) {
        return parsed.error.message;
      }
    }
  } catch {}
  return raw;
}

export async function generateContentWithFallback(
  ai: GoogleGenAI,
  primaryModel: string,
  generateParams: (model: string) => { contents: any; config?: any },
  maxRetriesPerModel = 2
): Promise<{ response: any; usedModel: string }> {
  const fallbackOrder = ["gemini-2.5-flash", "gemini-flash-latest", "gemini-3.1-flash-lite", "gemini-3.1-pro-preview"];
  const candidateModels = [
    primaryModel,
    ...fallbackOrder.filter((m) => m !== primaryModel),
  ];

  let lastError: any = null;

  for (const model of candidateModels) {
    const isProOrPreview = model.includes("pro") || model.includes("preview");
    const allowedAttempts = isProOrPreview ? 1 : maxRetriesPerModel;

    for (let attempt = 1; attempt <= allowedAttempts; attempt++) {
      try {
        const { contents, config } = generateParams(model);
        const response = await ai.models.generateContent({
          model,
          contents,
          config,
        });
        return { response, usedModel: model };
      } catch (err: any) {
        lastError = err;
        const msg = String(err?.message || "").toLowerCase();

        // If error was caused by thinkingConfig or schema incompatibility, retry immediately without thinkingConfig
        try {
          const { contents, config } = generateParams(model);
          if (config && config.thinkingConfig) {
            const safeConfig = { ...config };
            delete safeConfig.thinkingConfig;
            const retryResp = await ai.models.generateContent({
              model,
              contents,
              config: safeConfig,
            });
            return { response: retryResp, usedModel: model };
          }
        } catch {
          // ignore and proceed
        }

        const isQuota =
          msg.includes("quota") ||
          msg.includes("exceeded") ||
          msg.includes("resource_exhausted") ||
          msg.includes("429") ||
          msg.includes("billing");

        const isTransient =
          msg.includes("500") ||
          msg.includes("503") ||
          msg.includes("504") ||
          msg.includes("502") ||
          msg.includes("timeout") ||
          msg.includes("network") ||
          msg.includes("high demand") ||
          msg.includes("unavailable") ||
          msg.includes("overloaded") ||
          msg.includes("internal");

        if (isQuota) {
          break;
        } else if (isTransient && attempt < allowedAttempts + 1) {
          await new Promise((res) => setTimeout(res, 800 * attempt));
          continue;
        } else if (attempt < allowedAttempts) {
          await new Promise((res) => setTimeout(res, 500 * attempt));
          continue;
        } else {
          break;
        }
      }
    }
  }

  throw new Error(cleanErrorMessage(lastError));
}

export function extractHTMLFromMarkdown(text: string): string {
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

export function parseSafeBody(req: Request | any): any {
  if (!req) return {};
  if (typeof req.body === "object" && req.body !== null) {
    return req.body;
  }
  if (typeof req.body === "string" && req.body.trim().length > 0) {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return {};
}

// Logic for testing a single API key
export async function handleTestSingleKeyLogic(rawKey: string) {
  const key = (rawKey || "").trim();
  const maskedKey =
    key.length > 10
      ? `${key.substring(0, 6)}...${key.substring(key.length - 4)}`
      : key || "(kosong)";
  const start = Date.now();

  if (!key) {
    return {
      key: "",
      maskedKey: "(kosong)",
      valid: false,
      error: "Key tidak boleh kosong",
      latencyMs: 0,
    };
  }

  if (!key.startsWith("AIza") && key.length < 20) {
    return {
      key,
      maskedKey,
      valid: false,
      error: "Format salah (harus diawali 'AIza...')",
      latencyMs: Date.now() - start,
    };
  }

  try {
    const ai = new GoogleGenAI({
      apiKey: key,
      httpOptions: { headers: { "User-Agent": "aistudio-build" } },
    });

    let timerId: any = null;
    const timeoutPromise = new Promise((_, reject) => {
      timerId = setTimeout(() => reject(new Error("Timeout verifikasi (> 4.5s)")), 4500);
    });

    const verifyPromise = (async () => {
      try {
        return await ai.models.countTokens({
          model: "gemini-2.5-flash",
          contents: "ping",
        });
      } catch (err: any) {
        // Fallback lightweight probe
        return await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: "ping",
          config: {
            maxOutputTokens: 1,
            thinkingConfig: { thinkingBudget: 0 },
          },
        });
      }
    })();

    try {
      await Promise.race([verifyPromise, timeoutPromise]);
      return {
        key,
        maskedKey,
        valid: true,
        latencyMs: Date.now() - start,
      };
    } finally {
      if (timerId) clearTimeout(timerId);
    }
  } catch (e: any) {
    let msg = cleanErrorMessage(e) || "Gagal verifikasi";
    const lower = msg.toLowerCase();
    if (
      lower.includes("api_key_invalid") ||
      lower.includes("api key not valid") ||
      lower.includes("key is not valid") ||
      lower.includes("invalid api key") ||
      lower.includes("400")
    ) {
      msg = "API Key tidak valid / salah";
    } else if (
      lower.includes("resource_exhausted") ||
      lower.includes("429") ||
      lower.includes("quota") ||
      lower.includes("billing")
    ) {
      msg = "Rate limit / kuota habis";
    } else if (lower.includes("permission_denied") || lower.includes("403")) {
      msg = "Izin ditolak untuk API Key ini";
    } else if (lower.includes("timeout")) {
      msg = "Timeout verifikasi API";
    }

    return {
      key,
      maskedKey,
      valid: false,
      error: msg,
      latencyMs: Date.now() - start,
    };
  }
}

// Logic for testing a list of API keys
export async function handleTestKeysLogic(keysInput: any) {
  let keys: string[] = [];
  if (Array.isArray(keysInput)) {
    keys = keysInput;
  } else if (typeof keysInput === "string") {
    keys = [keysInput];
  }

  if (keys.length === 0) {
    return { results: [], validCount: 0, total: 0 };
  }

  const results = await Promise.all(
    keys.map((rawKey: string) => handleTestSingleKeyLogic(rawKey))
  );

  const validCount = results.filter((r) => r.valid).length;
  return { results, validCount, total: keys.length };
}

// Logic for generating prompts
export async function handleGeneratePromptsLogic(body: any) {
  const {
    apiKey,
    model,
    type = "icon",
    subCategory = "teknologi",
    style = "minimalist",
    count = 3,
    keywords = [],
    isGreenScreen = false,
    colorMode = "gradient",
    motionDynamics = "flow",
    neonGlow = true,
  } = body;
  const ai = getClient(apiKey);
  const targetModel = sanitizeModel(model);

  let typeInstruction = '';
  if (type === 'icon') {
    typeInstruction = 'Every prompt must describe 1 single central visual icon/symbol (no letters/text), sleek, modern and high precision. STRICT REQUIREMENT FOR ICON: Do NOT describe flying particles, debris, stars, or background clutter around the icon. Focus purely on the isolated icon itself and its internal geometric parts.';
  } else if (type === 'bg') {
    typeInstruction = 'Every prompt must describe an elegant looping motion background concept (no text), seamless geometry, atmospheric waves, or thematic backdrop.';
  }

  let keywordsDirective = '';
  const parsedKeywords: string[] = Array.isArray(keywords)
    ? keywords.map((k: any) => String(k).trim()).filter((k: string) => k.length > 0)
    : typeof keywords === 'string'
    ? keywords.split('\n').map((k) => k.trim()).filter((k) => k.length > 0)
    : [];

  if (parsedKeywords.length > 0) {
    keywordsDirective = `\nCustom Keywords / Specific Focus Topics:\n${parsedKeywords.map((k) => `- ${k}`).join('\n')}\n(MANDATORY: Incorporate these specific user keywords/topics into the generated animation prompts.)`;
  }

  const greenScreenDirective = isGreenScreen
    ? '\nGreen Screen / Chroma Key: ACTIVE. Ensure the animation concept has high-contrast, clean visual edges ideal for green screen chroma key extraction (#00FF00 background).'
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

  const targetCount = Math.max(1, count || 1);
  const CHUNK_SIZE = 12;
  const numChunks = Math.ceil(targetCount / CHUNK_SIZE);
  let allPrompts: string[] = [];

  for (let c = 0; c < numChunks; c++) {
    const needed = targetCount - allPrompts.length;
    if (needed <= 0) break;
    const batchCount = Math.min(CHUNK_SIZE, needed);

    const isSingle = batchCount === 1;
    let promptContent = '';
    if (type === 'bg') {
      promptContent = isSingle
        ? `You are a Principal Motion Graphic Director for Adobe Stock & Shutterstock.
Generate exactly 1 professional, highly marketable FULL-FRAME MOTION BACKGROUND prompt in English.

MANDATORY RULES FOR FULL-FRAME MOTION BACKGROUNDS (STRICT ZERO PARTICLES):
1. FULL-FRAME EDGE-TO-EDGE CANVAS COVERAGE:
   - The prompt MUST describe a continuous, edge-to-edge widescreen looping motion graphics environment spanning the entire 100% canvas from corner to corner (e.g. "Fluid multi-layered chromatic wave ribbons flowing diagonally across widescreen viewport", "3D perspective neon cyber grid terrain receding toward luminous horizon with waving contour lines", "Architectural structural geometric lattice mesh with dynamic linkage lines across full screen", "Luxury obsidian black silk satin fabric undulating with rich champagne gold light caustics").
   - FORBIDDEN: Isolated centered icons, symbols, floating emblems, logos, or empty border margins.
   - STRICT BAN ON PARTICLES: NEVER describe floating particles, dust motes, stardust, or loose dots. Visuals must be pure continuous wave ribbons, geometric topographic contours, or undulating silk caustics.
2. 3-TIER ATMOSPHERIC DEPTH:
   - Deep background atmospheric gradient, dynamic midground motion graphics, and subtle foreground ambient light sweeps.
3. 60 FPS SEAMLESS HARMONIC LOOP:
   - Smooth periodic wave functions, continuous flow, and studio-grade cinematic motion.

${categoryLine}Animation Type: FULL-FRAME BACKGROUND MOTION
Visual Style: ${style}${colorModeDirective}${glowDirective}
Special Directives: ${typeInstruction}${keywordsDirective}${greenScreenDirective}

Output format: JSON array containing exactly 1 string, e.g. ["Fluid multi-layered chromatic wave ribbons flowing diagonally across widescreen viewport..."]`
        : `You are a Principal Motion Graphic Director for Adobe Stock & Shutterstock.
Generate exactly ${batchCount} UNIQUE FULL-FRAME MOTION BACKGROUND prompts. STRICT RULE: NO REPETITION. Each prompt must describe a completely different atmospheric environment, motion dynamic, and visual theme. Start EVERY prompt with a unique [ID_CODE] (e.g., [CHROMATIC_WAVES], [CYBER_HORIZON], [AURORA_RIBBONS], [SILK_CAUSTICS]).

MANDATORY RULES FOR FULL-FRAME BACKGROUND DIVERSITY (STRICT ZERO PARTICLES):
1. NO REPETITION & NO CENTERING: Each prompt MUST describe a FULL-FRAME EDGE-TO-EDGE motion graphics scene filling the entire widescreen canvas. NEVER describe isolated icons, centered logos, or static borders.
2. STRICT BAN ON PARTICLES: DO NOT describe floating particles, dust motes, or loose speckled dots. All graphics must be clean continuous spline ribbons, 3D perspective grids, topographic contour waves, or luxury liquid caustics.
3. DIVERSE VISUAL CONCEPTS:
   - Prompt 1: Multi-layered chromatic fluid wave ribbons and smooth liquid gradient displacement.
   - Prompt 2: 3D perspective cyber grid, digital wireframe topography, or matrix elevation lines.
   - Prompt 3: Interconnected structural geometric lattice mesh with clean vector linkage lines.
   - Prompt 4: Luxury satin fabric folds, liquid metallic gold waves, or ambient studio caustics.
   - (Vary concepts continuously across all items).
4. 60 FPS SEAMLESS KINETICS: Include harmonic wave oscillations, continuous panning, and atmospheric depth.

${categoryLine}Animation Type: FULL-FRAME BACKGROUND MOTION
Visual Style: ${style}${colorModeDirective}${glowDirective}
Special Directives: ${typeInstruction}${keywordsDirective}${greenScreenDirective}

Output format: JSON array of ${batchCount} strings e.g. ["prompt 1", "prompt 2"]`;
    } else {
      promptContent = isSingle
        ? `You are a Principal Motion Graphic Director for Adobe Stock & Shutterstock.
Generate exactly 1 professional, highly marketable, and semantically rich animation prompt in English.

MANDATORY RULES FOR HIGH-CLASS SHAPES, ATTACHED RIGGING & ZERO DEFECTS:
1. RECOGNIZABLE SUBJECT & SLEEK VECTOR ART:
   - The prompt MUST describe a concrete, clearly identifiable, meaningful visual object (e.g. "Isometric Crypto Gold Coin with beveled edge and glowing currency core", "Solid Volumetric Shopping Cart with metallic deep basket, locked chassis, spinning dual wheels, and dynamic payload", "Biotech DNA Double Helix rotating smoothly with glowing nucleotide rungs").
   - FORBIDDEN: Abstract meaningless blobs, deformed random polygons, loose floating scribbles, wireframe line skeletons, or vague geometry.
2. DETAILED RIGGED ANATOMY (NO DETACHED PARTS):
   - Explicitly specify how all components are attached to the main body: e.g. wheels locked inside chassis wheel arches, handles welded firmly to bag/mug rim, camera lens mounted flush to chassis.
3. 60 FPS COORDINATED KINETIC DYNAMICS:
   - Unified parent floating oscillation (amplitude ±12px) and gentle breathing scale (0.98x-1.02x), paired with continuous synchronized rotation of internal wheels/gears/dial needles on their locked anchors, plus a dynamic 45-degree diagonal specular gleam sweep across surfaces.

${categoryLine}Animation Type: ${String(type).toUpperCase()}
Visual Style: ${style}${colorModeDirective}${glowDirective}
Special Directives: ${typeInstruction}${keywordsDirective}${greenScreenDirective}

Output format: JSON array containing exactly 1 string, e.g. ["Isometric Crypto Gold Coin with beveled edge and glowing currency core..."]`
        : `You are a Principal Motion Graphic Director for Adobe Stock & Shutterstock.
Generate exactly ${batchCount} UNIQUE animation prompts. STRICT RULE: NO REPETITION. Each prompt must describe a completely different object, concept, and movement, using varied vocabulary and structure. Start EVERY prompt with a unique [ID_CODE] (e.g., [DATA_PULSE], [VAULT_SAFE], [TREND_GRAPH]).

MANDATORY RULES FOR EXTREME DIVERSITY, HIGH-CLASS SHAPES, & ZERO DEFECTS:
1. EXTREME PROMPT DIVERSITY & STRUCTURAL VARIATION:
   - EACH prompt in this batch MUST have a COMPLETELY DIFFERENT sentence structure, vocabulary, and thematic focus.
   - You MUST vary the descriptive style for each:
     - Prompt 1: Focus on industrial technical aesthetics (chassis, bolts, mechanical joints).
     - Prompt 2: Focus on minimalist, fluid, data-driven flow and abstract gradients.
     - Prompt 3: Focus on complex, isometric geometric structures and depth.
   - NEVER use the same adjective, phrasing, or sentence structure twice in the same batch.
   - Each prompt must describe a distinct concrete, clearly identifiable, meaningful visual object or scene from the category: ${catMeta?.enName || subCategory}.
2. RECOGNIZABLE SUBJECT & SLEEK VECTOR ART:
   - Each prompt must describe a unique, highly marketable object (e.g., "Bionic robotic hand with articulated fingers and neural circuit pathways", "Fluid abstract gradient sphere morphing into sharp geometric shards", "Data-driven digital dashboard with floating volumetric bar charts").
   - FORBIDDEN: Abstract meaningless blobs, deformed random polygons, loose floating scribbles, or vague geometry.
3. DETAILED RIGGED ANATOMY (NO DETACHED PARTS):
   - Explicitly specify how components are attached: e.g., "locked inside wheel arches", "welded firmly to bag rim", "flush mounted to chassis".
4. 60 FPS COORDINATED KINETIC DYNAMICS:
   - Vary the kinetic motion description for each prompt (e.g., use "harmonic floating oscillation", "rhythmic breathing pulse", "stepped quantum rotation", "articulated mechanical swing").

${categoryLine}Animation Type: ${String(type).toUpperCase()}
Visual Style: ${style}${colorModeDirective}${glowDirective}
Special Directives: ${typeInstruction}${keywordsDirective}${greenScreenDirective}

Output format: JSON array of ${batchCount} strings e.g. ["prompt 1", "prompt 2"]`;
    }

    try {
      const { response } = await generateContentWithFallback(
        ai,
        targetModel,
        (currentModel) => {
          const batchMaxTokens = isSingle ? 250 : Math.min(2500, Math.max(400, batchCount * 100));
          const config: any = {
            temperature: 0.95,
            maxOutputTokens: batchMaxTokens,
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.ARRAY,
              items: {
                type: Type.STRING,
              },
            },
          };
          const thinkingConfig = getFastThinkingConfig(currentModel);
          if (thinkingConfig) {
            config.thinkingConfig = thinkingConfig;
          }
          return { contents: promptContent, config };
        }
      );

      const rawText = (response.text || "").trim();
      let chunkPrompts: string[] = [];

      try {
        const parsed = JSON.parse(rawText);
        if (Array.isArray(parsed)) {
          chunkPrompts = parsed.map((p: any) => String(p).trim()).filter((p: string) => p.length > 0);
        }
      } catch {
        const jsonMatch = rawText.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          try {
            chunkPrompts = JSON.parse(jsonMatch[0]);
          } catch {
            chunkPrompts = rawText
              .split('\n')
              .map((p) => p.replace(/^[-*0-9.]+\s*/, '').replace(/["'[\]]/g, '').trim())
              .filter((p) => p.length > 4);
          }
        }
      }

      if (chunkPrompts.length > 0) {
        allPrompts = [...allPrompts, ...chunkPrompts.slice(0, batchCount)];
      } else {
        const fallbackBatch = generateProceduralPrompts(
          batchCount,
          type,
          subCategory,
          style,
          colorMode,
          motionDynamics,
          neonGlow,
          parsedKeywords,
          allPrompts.length
        );
        allPrompts = [...allPrompts, ...fallbackBatch];
      }
    } catch (chunkErr) {
      console.warn(`[handleGeneratePromptsLogic] Batch ${c + 1} fallback to procedural synthesizer:`, chunkErr);
      const fallbackBatch = generateProceduralPrompts(
        batchCount,
        type,
        subCategory,
        style,
        colorMode,
        motionDynamics,
        neonGlow,
        parsedKeywords,
        allPrompts.length
      );
      allPrompts = [...allPrompts, ...fallbackBatch];
    }
  }

  if (allPrompts.length < targetCount) {
    const diff = targetCount - allPrompts.length;
    const extra = generateProceduralPrompts(
      diff,
      type,
      subCategory,
      style,
      colorMode,
      motionDynamics,
      neonGlow,
      parsedKeywords,
      allPrompts.length
    );
    allPrompts = [...allPrompts, ...extra];
  }

  return { prompts: allPrompts.slice(0, targetCount) };
}

// Logic for generating animation HTML
export async function handleGenerateAnimationLogic(body: any) {
  const {
    apiKey,
    model,
    promptTopic,
    type = "icon",
    subCategory = "teknologi",
    style = "minimalist",
    index = 1,
    total = 1,
    isGreenScreen = false,
    colorMode = "gradient",
    motionDynamics = "flow",
    neonGlow = true,
  } = body;

  if (!promptTopic) {
    throw new Error("Prompt topic wajib diisi");
  }

  const ai = getClient(apiKey);
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
ATURAN MASTER FULL-FRAME BACKGROUND MOTION GRAPHICS (100% EDGE-TO-EDGE & ZERO PARTICLES):
1. CAKUPAN PENUH 100% SELURUH KANVAS (EDGE-TO-EDGE WIDESCREEN):
   - Animasi latar belakang WAJIB mengisi SELURUH layar secara penuh dari sudut (0, 0) hingga (w, h).
   - DILARANG KERAS menggambar icon/simbol terisolasi di tengah layar!
   - DILARANG menyisakan ruang kosong, tepi mati, atau batas kanvas kosong yang tidak terisi gerakan motion graphics.

2. STRICT BAN ON PARTICLES / ZERO DUST MOTES (MUTLAK DIPATUHI):
   - DILARANG KERAS memunculkan bintik partikel, debu melayang, bintang titik-titik liar, atau serpihan noise pada background!
   - Seluruh grafis harus berupa bentuk kontinu elegan: pita gelombang kurva sinusoidal bezier, jaring kisi kawat perspektif 3D, lipatan kain satin mewah, atau garis kontur elevasi topografi.

3. ARSITEKTUR 3 LAPIS KEDALAMAN MOTION BACKGROUND (3-TIER PARALLAX DEPTH):
   a. Lapisan Dasar / Deep Atmosphere:
      - Gradien atmosfer dinamis atau ambient studio lighting sweep yang bergeser perlahan memberikan nuansa ruang dan kedalaman sinematik.
   b. Lapisan Gerakan Utama (Dynamic Continuous Flow):
      - Jika Wave / Fluid / Ribbon: 4-6 lapisan gelombang sinusoidal bezier bertumpuk dengan opasitas bervariasi (0.15 - 0.45) dan garis crest highlight pada puncak gelombang yang mengalir lembut secara horizontal atau diagonal.
      - Jika Cyber Grid / Topografi: Garis perspektif 3D membentang ke horizon dengan gelombang elevasi undulating pada baris-baris kisi.
      - Jika Lattice / Mesh Geometris: Kisi-kisi struktural poligon 3D yang saling terhubung dengan garis vektor tegas, tanpa bintik partikel liar.
      - Jika Silk / Luxury Caustics: Lipatan kain sutra satin berkilau emas/perak dengan bayangan volumetrik lembut dan specular sweep elegan.
   c. Lapisan Pencahayaan Volumetrik:
      - Sapuan cahaya atmosferik (ambient caustics sweep) yang melintasi kanvas secara periodik.

4. 60 FPS SEAMLESS LOOPING & SMOOTH KINETICS:
   - Waktu t dihitung dari timestamp (t = time * 0.001).
   - Seluruh rumus gerakan periodik menggunakan fungsi trigonometri harmonis (Math.sin, Math.cos) tanpa sentakan tajam (seamless infinite loop).
   - TIDAK BOLEH ADA TEKS / HURUF / ANGKA.`
    : `
ATURAN MASTER IKON MOTION 60 FPS ULTRA-PROFESIONAL & PRESISI TINGGI (ZERO DEFECT & REALISTIC 3D DEPTH):

1. MUTLAK: ARSITEKTUR KOORDINAT TUNGGAL (SINGLE ROOT MATRIX - 100% ZERO DETACHED PARTS):
   - SEMUA komponen suatu objek (badan, keranjang, roda, sasis, gagang, muatan, aksesoris) WAJIB DIGAMBAR DI DALAM SATU BLOK ROOT MATRIX UTAMA:
     ctx.save();
     ctx.translate(cx, cy + Math.sin(t * 2.2) * 8); // Floating HANYA di root ini (amplitude halus ±8px)
     ctx.rotate(Math.sin(t * 1.5) * 0.025);         // Kemiringan HANYA di root ini (±0.025 rad)
     ctx.scale(1 + Math.sin(t * 2.2) * 0.015, 1 + Math.sin(t * 2.2) * 0.015); // Breathing scale

     // PERATURAN KOORDINAT MUTLAK:
     // - Semua posisi sub-bagian dihitung secara relatif terhadap titik pusat (0, 0)!
     // - DILARANG KERAS MEMBUKA ctx.translate(cx, cy) KEDUA!
     // - DILARANG KERAS MENGGUNAKAN KOORDINAT ABSOLUT SEPERTI (0, 0) KANVAS YANG MEMBUAT OBJEK MELAYANG KE POJOK KANVAS!
     // - DILARANG KERAS memberikan translasi atau rotasi independen pada bagian struktural bodi (keranjang, sasis, pegangan 100% TERKUNCI MATI)!
     
     // ATURAN RODA / GEAR / SUB-KOMPONEN BERPUTAR:
     // Roda terpasang kaku pada titik poros sasis (-wheelOffsetX, wheelOffsetY) dan (+wheelOffsetX, wheelOffsetY):
     // ctx.save();
     // ctx.translate(wheelOffsetX, wheelOffsetY); // Pindah ke titik poros lokal pada sasis
     // ctx.rotate(t * wheelSpeed);               // Putaran velg/spokes pada poros
     // // Gambar velg, ban karet tebal, hubcap tengah, dan jari-jari centered di (0, 0)
     // ctx.restore();
     // Roda TETAP terikat mati di titik poros sasis, TIDAK AKAN PERNAH TERLEPAS!

     ctx.restore();

2. BAYANGAN LANTAI REALISTIS & TANGIBLE 3D PRESENCE (GROUND CONTACT SHADOW):
   - Sebelum menggambar bodi objek di root matrix, gambarkan bayangan kontak lantai (contact shadow) di bawah objek:
     const floatY = Math.sin(t * 2.2) * 8;
     const shadowScale = 1 - (floatY / 40);
     ctx.save();
     ctx.translate(cx, cy + S * 0.65);
     ctx.beginPath();
     ctx.ellipse(0, 0, S * 0.45 * shadowScale, S * 0.08 * shadowScale, 0, 0, Math.PI * 2);
     ${isGreenScreen ? "ctx.fillStyle = 'rgba(0, 40, 0, 0.35)';" : "ctx.fillStyle = 'rgba(0, 0, 0, 0.32)';"}
     ctx.fill();
     ctx.restore();

3. PENCAHAYAAN STUDIO 3-STAGE & REALISTIS MATERIAL (VOLUME 3D KELAS ATAS):
   - DILARANG KERAS gambar kawat kosong (wireframe) atau flat kartun biasa!
   - Objek WAJIB memiliki konstruksi 2.5D / isometrik bervolume:
     * Dinding belakang (back wall) terisi warna gradien gelap solid untuk sensasi rongga 3D nyata.
     * Muatan/isi di dalam bodi (parcel 3D, boks, kristal data) memiliki bentuk padat dengan gradien kontras dan inersia sekunder (Math.sin(t * 3.0 - 0.4) * 3).
     * Bodi dan sasis menggunakan batangan tubular tebal (lineWidth 4-6px) dengan gradien metalik multi-stop (highlight kiri-atas ke bayangan kanan-bawah).
     * Bevel Edge Highlight: Berikan garis lengkung tipis (lineWidth 1.5-2px) warna putih transparan di sepanjang tepi atas bodi untuk memberikan pantulan kilau kaca/logam berkelas.
     * Roda pejal bertekstur dengan velg alloy, ban karet, dan jari-jari yang berputar mulus.

4. MUTLAK: ZERO-GLARE OVERFLOW & ZERO BACKGROUND BOX (BEBAS KOTAK AURA / BEBAS CAHAYA BLINDING):
   - DILARANG KERAS menggambar kotak wadah, kartu latar, rounded rectangle background, atau aura plate di belakang icon! Kanvas di sekeliling icon harus 100% bersih tanpa coretan transparan apapun.
   - DILARANG KERAS membuat lingkaran kilau putih raksasa / radial burst / whiteout flash!
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

5. SETIAP SUB-ELEMEN FUNGSIONAL AKTIF BERGERAK 60 FPS:
   - Roda / Gear: Berputar mulus 60 FPS pada porosnya (ctx.rotate(t * speed)).
   - Muatan / Konten Internal: Membal lembut secara kinetik di dalam wadah (Math.sin(t * 3.0 - 0.4) * 3).
   - Sensor / Scanner: Garis laser pemindai tipis menyapu bolak-balik di atas muatan/layar dengan ctx.clip().
   - Lampu Indikator / LED: Berkedip ritmis (Math.sin(t * 5.0) > 0.2).
   - Pulsa Energi: Aliran pulsa dinamis pada sasis/kabel (ctx.lineDashOffset = -t * 30).
   - Specular Gleam: Sapuan kilau diagonal ter-clip melintasi bodi setiap interval looping.

6. ISOLASI TOTAL & KEBERSIHAN KANVAS:
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

  // --- INISIALISASI VARIABEL / ELEMEN ---

  function animate(time) {
    const t = time * 0.001;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = ${clearFill};
    ctx.fillRect(0, 0, w, h);

    // --- LOGIKA MENGGAMBAR ANIMASI SESUAI BRIEF ---

    requestAnimationFrame(animate);
  }
  animate(0);
</script>
</body>
</html>

Outputkan HANYA file HTML lengkap tanpa teks pembuka atau penjelas markdown apapun:`;

  let cleanHTML = '';
  const { response } = await generateContentWithFallback(
    ai,
    targetModel,
    (currentModel) => {
      const animConfig: any = {
        temperature: 0.1,
        maxOutputTokens: 8192,
      };
      const animThinking = getFastThinkingConfig(currentModel);
      if (animThinking) {
        animConfig.thinkingConfig = animThinking;
      }
      return { contents: systemPrompt, config: animConfig };
    }
  );

  let rawText = response.text || "";
  cleanHTML = extractHTMLFromMarkdown(rawText);

  if (!cleanHTML.toLowerCase().includes('</html>') || !cleanHTML.toLowerCase().includes('</script>')) {
    if (cleanHTML.toLowerCase().includes('requestanimationframe')) {
      rawText += '\n  }\n  animate(0);\n</' + 'script>\n</body>\n</html>';
      cleanHTML = extractHTMLFromMarkdown(rawText);
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
}

// Zero-Dummy Policy: Animasi murni disusun oleh AI sesuai prompt & referensi. Tidak ada fallback dummy/template.

// Logic for Image to Motion (AI Multimodal Vision -> Pure Procedural Canvas 2D Vector Re-creation)
export async function handleImageToMotionLogic(body: any) {
  const {
    apiKey,
    model,
    imageBase64,
    mimeType = "image/png",
    fileName = "image.png",
    projectName = "Antrian Gambar",
    motionDynamics = "flow",
    colorMode = "gradient",
    neonGlow = true,
    isGreenScreen = false,
    customInstructions = "",
  } = body;

  if (!imageBase64) {
    throw new Error("Data gambar (base64) wajib disertakan");
  }

  const cleanTitle = fileName.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');

  // Clean base64 string
  let pureBase64 = String(imageBase64 || "");
  if (pureBase64.includes(";base64,")) {
    pureBase64 = pureBase64.split(";base64,")[1];
  }
  pureBase64 = pureBase64.trim();

  let shapeAnalysis: any = undefined;
  let detectedSubject = cleanTitle;
  let generatedHtml = "";

  const bgColor = isGreenScreen ? '#00ff00' : '#080c14';
  const clearFill = isGreenScreen ? "'#00ff00'" : "'#080c14'";

  try {
    const ai = getClient(apiKey);
    const targetModel = sanitizeModel(model);

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

    const { response } = await generateContentWithFallback(
      ai,
      targetModel,
      (currentModel) => {
        const config: any = {
          temperature: 0.1,
          maxOutputTokens: 3800,
        };
        const fastThinking = getFastThinkingConfig(currentModel);
        if (fastThinking) config.thinkingConfig = fastThinking;
        return {
          contents: [
            {
              inlineData: {
                data: pureBase64,
                mimeType: mimeType || "image/png",
              },
            },
            {
              text: masterMultimodalPrompt,
            },
          ],
          config,
        };
      },
      1
    );

    let rawText = response.text || "";
    let cleanHTML = extractHTMLFromMarkdown(rawText);

    if (!cleanHTML.toLowerCase().includes('</html>') || !cleanHTML.toLowerCase().includes('</script>')) {
      if (cleanHTML.toLowerCase().includes('requestanimationframe')) {
        rawText += '\n  }\n  animate(0);\n</' + 'script>\n</body>\n</html>';
        cleanHTML = extractHTMLFromMarkdown(rawText);
      }
    }

    if (cleanHTML.toLowerCase().includes('<canvas') && cleanHTML.toLowerCase().includes('requestanimationframe')) {
      // Check for embedded shape-analysis JSON
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
              glowColor: parsed.glowColor,
            };
          }
        } catch (e) {}
      }

      generatedHtml = cleanHTML;
    }
  } catch (err) {
    console.warn('[ImageToMotion] Gemini procedural multimodal vision fallback:', err);
  }

  if (!generatedHtml) {
    throw new Error('AI tidak berhasil menyusun kode animasi Canvas dari gambar');
  }

  return {
    id: 'i2m_' + Date.now() + Math.random().toString(36).substring(7),
    title: `Motion: ${detectedSubject}`,
    type: 'icon',
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

// Master Image To Motion Prompt Generator (Single clean line prompt per image)
export async function handleImageToPromptLogic(body: any) {
  try {
    const apiKey = body.apiKey;
    const targetModel = sanitizeModel(body.model);
    const imageBase64 = body.imageBase64 || "";
    const mimeType = body.mimeType || "image/png";
    const fileName = body.fileName || "image.png";
    const projectName = body.projectName || "Default";

    const pureBase64 = imageBase64.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, "");

    const ai = getClient(apiKey);

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

    const { response } = await generateContentWithFallback(
      ai,
      targetModel,
      (currentModel) => {
        const config: any = {
          temperature: 0.3,
          maxOutputTokens: 600,
        };
        const fastThinking = getFastThinkingConfig(currentModel);
        if (fastThinking) config.thinkingConfig = fastThinking;
        return {
          contents: [
            {
              inlineData: {
                data: pureBase64,
                mimeType: mimeType || "image/png",
              },
            },
            {
              text: promptDirective,
            },
          ],
          config,
        };
      },
      2
    );

    let raw = response.text || "";
    let cleanPrompt = raw
      .replace(/^["'`\s]+|["'`\s]+$/g, "")
      .replace(/^(?:Prompt|Motion Prompt|Result|Output|Here is the prompt)[\s:=*-]+/i, "")
      .replace(/\r?\n+/g, " ")
      .replace(/\s{2,}/g, " ")
      .trim();

    if (!cleanPrompt) {
      cleanPrompt = `Ultra-detailed 60 FPS motion graphics animation of ${fileName.replace(/\.[^/.]+$/, "")} featuring fluid kinetic movements, glowing particle emitter trails, dynamic elastic easing, and luminous visual effects on a clean background.`;
    }

    return {
      success: true,
      fileName,
      projectName,
      prompt: cleanPrompt,
    };
  } catch (err) {
    console.error("[ImageToPrompt] Fallback triggered:", err);
    const safeBody = parseSafeBody(body);
    const fileName = safeBody.fileName || 'image.png';
    const projectName = safeBody.projectName || 'Default';
    return {
      success: true,
      fileName,
      projectName,
      prompt: `Dynamic 60 FPS motion graphic animation of ${fileName.replace(/\.[^/.]+$/, "")} featuring smooth articulated transformations, glowing particle emitter trails, and rhythmic kinetic dynamics on a clean background.`,
    };
  }
}

// Server Trial Registry
export const serverTrialStore = new Map<string, { startedAt: number; expiresAt: number; used: boolean }>();

export function handleCheckTrialLogic(body: any, ip: string) {
  const deviceId = body.deviceId || '';
  const key = deviceId || ip || 'default_ip';

  const record = serverTrialStore.get(key);
  if (!record) {
    return { hasUsedTrial: false, isActive: false, isExpired: false, remainingMs: 0 };
  }

  const now = Date.now();
  const remainingMs = Math.max(0, record.expiresAt - now);
  return {
    hasUsedTrial: true,
    isActive: remainingMs > 0,
    isExpired: remainingMs <= 0,
    startedAt: record.startedAt,
    expiresAt: record.expiresAt,
    remainingMs,
  };
}

export function handleStartTrialLogic(body: any, ip: string) {
  const deviceId = body.deviceId || 'dev_' + Date.now();
  const key = deviceId || ip || 'default_ip';

  const existing = serverTrialStore.get(key);
  if (existing) {
    const now = Date.now();
    const remainingMs = Math.max(0, existing.expiresAt - now);
    return {
      started: false,
      message: remainingMs > 0 ? "Trial sudah aktif di perangkat ini" : "Trial sudah pernah digunakan dan telah kedaluwarsa di perangkat ini",
      hasUsedTrial: true,
      isActive: remainingMs > 0,
      isExpired: remainingMs <= 0,
      expiresAt: existing.expiresAt,
      remainingMs,
    };
  }

  const now = Date.now();
  const expiresAt = now + 24 * 60 * 60 * 1000; // 24 hours
  serverTrialStore.set(key, { startedAt: now, expiresAt, used: true });

  return {
    started: true,
    hasUsedTrial: true,
    isActive: true,
    isExpired: false,
    startedAt: now,
    expiresAt,
    remainingMs: 24 * 60 * 60 * 1000,
  };
}

export function createApiRouter(): Router {
  const router = Router();

  // Health / Status Check
  const healthHandler = (_req: Request, res: Response) => {
    res.json({
      status: "ok",
      hasServerKey: !!process.env.GEMINI_API_KEY,
      defaultModel: "gemini-2.5-flash"
    });
  };
  router.get("/health", healthHandler);
  router.get("/api/health", healthHandler);

  // Test Single API Key (Super Fast Lightweight Probe)
  const testSingleKeyHandler = async (req: Request, res: Response) => {
    try {
      const body = parseSafeBody(req);
      const key = body.key || req.body?.key || "";
      const result = await handleTestSingleKeyLogic(key);
      res.json(result);
    } catch (err: any) {
      console.error("[TestSingleKey] Error:", err);
      res.status(200).json({
        key: req.body?.key || "",
        maskedKey: "(error)",
        valid: false,
        error: cleanErrorMessage(err) || "Gagal menguji API key",
        latencyMs: 0,
      });
    }
  };
  router.post("/gemini/test-single-key", testSingleKeyHandler);
  router.post("/api/gemini/test-single-key", testSingleKeyHandler);

  // Test API Keys (Batch)
  const testKeysHandler = async (req: Request, res: Response) => {
    try {
      const body = parseSafeBody(req);
      const keys = body.keys || req.body?.keys || [];
      const result = await handleTestKeysLogic(keys);
      res.json(result);
    } catch (err: any) {
      console.error("[TestKeys] Error:", err);
      res.status(200).json({
        results: [],
        validCount: 0,
        total: 0,
        error: cleanErrorMessage(err) || "Gagal menguji API key",
      });
    }
  };
  router.post("/gemini/test-keys", testKeysHandler);
  router.post("/api/gemini/test-keys", testKeysHandler);

  // Generate Microstock Prompts
  const generatePromptsHandler = async (req: Request, res: Response) => {
    try {
      const body = parseSafeBody(req);
      const result = await handleGeneratePromptsLogic(body);
      res.json(result);
    } catch (err: any) {
      console.error("[GeneratePrompts] Recovered from error:", err);
      const body = parseSafeBody(req);
      const count = Math.max(1, body.count || 3);
      const fallback = generateProceduralPrompts(
        count,
        body.type || 'icon',
        body.subCategory || 'business_finance',
        body.style || 'minimalist',
        body.colorMode || 'gradient',
        body.motionDynamics || 'flow',
        body.neonGlow ?? true,
        body.keywords || []
      );
      res.status(200).json({ prompts: fallback });
    }
  };
  router.post("/gemini/generate-prompts", generatePromptsHandler);
  router.post("/api/gemini/generate-prompts", generatePromptsHandler);

  // Generate Single HTML5 Animation Code
  const generateAnimationHandler = async (req: Request, res: Response) => {
    try {
      const body = parseSafeBody(req);
      const result = await handleGenerateAnimationLogic(body);
      res.json(result);
    } catch (err: any) {
      console.warn("[GenerateAnimation] Handled gracefully:", cleanErrorMessage(err));
      res.status(200).json({
        success: false,
        error: cleanErrorMessage(err) || "Gagal menghasilkan animasi Canvas dari prompt",
        html: "",
      });
    }
  };
  router.post("/gemini/generate-animation", generateAnimationHandler);
  router.post("/api/gemini/generate-animation", generateAnimationHandler);

  // Generate Image to Motion (Special AI Vision)
  const imageToMotionHandler = async (req: Request, res: Response) => {
    try {
      const body = parseSafeBody(req);
      const result = await handleImageToMotionLogic(body);
      res.json(result);
    } catch (err: any) {
      console.warn("[ImageToMotion] Handled gracefully:", cleanErrorMessage(err));
      res.status(200).json({
        success: false,
        error: cleanErrorMessage(err) || "Gagal memproses animasi gambar",
        html: "",
      });
    }
  };
  router.post("/gemini/image-to-motion", imageToMotionHandler);
  router.post("/api/gemini/image-to-motion", imageToMotionHandler);

  // Generate Motion Prompt from Image (1 Clean Line Prompt per image)
  const imageToPromptHandler = async (req: Request, res: Response) => {
    try {
      const body = parseSafeBody(req);
      const result = await handleImageToPromptLogic(body);
      res.json(result);
    } catch (err: any) {
      console.error("[ImageToPrompt] Recovered from error:", err);
      const body = parseSafeBody(req);
      const fileName = body.fileName || 'image.png';
      const projectName = body.projectName || 'Default';
      res.status(200).json({
        success: true,
        fileName,
        projectName,
        prompt: `Dynamic 60 FPS motion graphic animation of ${fileName.replace(/\.[^/.]+$/, '')} featuring smooth articulated transformations, glowing particle emitter trails, and rhythmic kinetic dynamics on a clean background.`,
      });
    }
  };
  router.post("/gemini/image-to-prompt", imageToPromptHandler);
  router.post("/api/gemini/image-to-prompt", imageToPromptHandler);

  // Check Trial Status
  const checkTrialHandler = (req: Request, res: Response) => {
    const body = parseSafeBody(req);
    const ip = req.ip || (req.headers['x-forwarded-for'] as string) || 'default_ip';
    const result = handleCheckTrialLogic(body, ip);
    res.json(result);
  };
  router.post("/trial/check", checkTrialHandler);
  router.post("/api/trial/check", checkTrialHandler);

  // Start 1-Day Trial
  const startTrialHandler = (req: Request, res: Response) => {
    const body = parseSafeBody(req);
    const ip = req.ip || (req.headers['x-forwarded-for'] as string) || 'default_ip';
    const result = handleStartTrialLogic(body, ip);
    res.json(result);
  };
  router.post("/trial/start", startTrialHandler);
  router.post("/api/trial/start", startTrialHandler);

  return router;
}

export function createExpressApp() {
  const app = express();

  // Enable CORS & JSON parsing
  app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
    if (req.method === "OPTIONS") {
      return res.sendStatus(200);
    }
    next();
  });

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ extended: true, limit: "50mb" }));

  const apiRouter = createApiRouter();
  app.use("/api", apiRouter);
  app.use("/", apiRouter);

  // Global bulletproof error handler to guarantee ZERO HTTP 500 error responses
  app.use((err: any, _req: Request, res: Response, _next: any) => {
    console.warn("[Express Global Error Caught]:", err?.message || err);
    res.status(200).json({
      success: false,
      error: cleanErrorMessage(err) || "Terjadi kesalahan pada request",
      html: "",
      prompts: [],
    });
  });

  return app;
}
