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

// Server-side in-memory prompt history bank across sessions
const serverPromptHistoryBank = new Set<string>();

export function getSmartThinkingConfig(targetModel: string, budget = 2048): any {
  // Empower AI reasoning with an active thinking budget for models supporting extended thinking (3.8, 2.5, 3.1-pro)
  if (targetModel.includes("2.5") || targetModel.includes("3.8") || targetModel.includes("pro") || targetModel.includes("thinking")) {
    return { thinkingBudget: budget };
  }
  return undefined;
}

export function sanitizeModel(model?: string): string {
  if (!model) return "gemini-3.5-flash-lite";
  const m = model.trim().toLowerCase();
  if (m.includes("3.5")) return "gemini-3.5-flash-lite";
  if (m.includes("3.8") || m === "gemini-3.8-flash") return "gemini-3.8-flash";
  if (m.includes("3.1-flash-lite") || m.includes("flash-lite") || m.includes("lite")) return "gemini-3.1-flash-lite";
  if (m.includes("2.5-flash-lite")) return "gemini-2.5-flash-lite";
  if (m.includes("2.5") || m === "gemini-2.5-flash") return "gemini-2.5-flash";
  if (m.includes("3.1-pro") || m.includes("pro")) return "gemini-3.1-pro-preview";
  if (m === "gemini-flash-latest") return "gemini-flash-latest";
  return "gemini-3.5-flash-lite";
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
  const fallbackOrder = ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-2.5-flash", "gemini-3.8-flash", "gemini-flash-latest", "gemini-3.1-pro-preview"];
  const candidateModels = [
    primaryModel,
    ...(primaryModel === "gemini-3.5-flash-lite" ? ["gemini-3.5-flash-lite-preview", "gemini-3.1-flash-lite"] : []),
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

        const isNotFound =
          msg.includes("not found") ||
          msg.includes("404") ||
          msg.includes("not supported") ||
          msg.includes("unrecognized") ||
          msg.includes("is not found");

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

        if (isNotFound || isQuota) {
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

  const previousPrompts: string[] = Array.isArray(body.previousPrompts) ? body.previousPrompts : [];
  const mergedBank = Array.from(new Set([...previousPrompts, ...serverPromptHistoryBank])).slice(0, 20);
  const negativeList = mergedBank.length > 0
    ? `\nANTI-REPETITION MANDATE (ABSOLUTELY NEVER REPEAT PREVIOUS PROMPTS ACROSS DAYS OR SESSIONS):\nDo NOT generate any concept, subject, or composition similar to these previously generated prompts:\n${mergedBank.map((p, idx) => `[Prior #${idx + 1}]: ${p}`).join('\n')}\nYou MUST invent a completely novel, fresh subject and distinct mechanical/artistic composition.`
    : '';

  const dynamicSessionSeed = `${Date.now().toString(36)}-${Math.floor(Math.random() * 1000000).toString(36)}`;

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
Generate exactly 1 professional, highly marketable FULL-FRAME MOTION BACKGROUND prompt in English (Seed: ${dynamicSessionSeed}).

MANDATORY RULES FOR FULL-FRAME MOTION BACKGROUNDS (STRICT ZERO PARTICLES & ZERO WHITE FLARES):
1. FULL-FRAME EDGE-TO-EDGE CANVAS COVERAGE:
   - The prompt MUST describe a continuous, edge-to-edge widescreen looping motion graphics environment spanning the entire 100% canvas from corner to corner (e.g. "Fluid multi-layered chromatic wave ribbons flowing diagonally across widescreen viewport", "3D perspective neon cyber grid terrain receding toward luminous horizon with waving contour lines", "Architectural structural geometric lattice mesh with dynamic linkage lines across full screen", "Luxury obsidian black silk satin fabric undulating with rich champagne gold light caustics").
   - FORBIDDEN: Isolated centered icons, symbols, floating emblems, logos, or empty border margins.
   - STRICT BAN ON PARTICLES: NEVER describe floating particles, dust motes, stardust, or loose dots. Visuals must be pure continuous wave ribbons, geometric topographic contours, or undulating silk caustics.
   - STRICT BAN ON WHITE FLARES & WHITEOUTS: NEVER describe blinding white light flares, central white radial bursts, or harsh whiteouts. All lighting must be subtle, chromatic, and elegant with deep background contrast.
2. 3-TIER ATMOSPHERIC DEPTH:
   - Deep background atmospheric gradient, dynamic midground motion graphics, and subtle foreground ambient chromatic sweeps.
3. 60 FPS SEAMLESS HARMONIC LOOP:
   - Smooth periodic wave functions, continuous flow, and studio-grade cinematic motion.
${negativeList}

${categoryLine}Animation Type: FULL-FRAME BACKGROUND MOTION
Visual Style: ${style}${colorModeDirective}${glowDirective}
Special Directives: ${typeInstruction}${keywordsDirective}${greenScreenDirective}

Output format: JSON array containing exactly 1 string, e.g. ["Fluid multi-layered chromatic wave ribbons flowing diagonally across widescreen viewport..."]`
        : `You are a Principal Motion Graphic Director for Adobe Stock & Shutterstock.
Generate exactly ${batchCount} UNIQUE FULL-FRAME MOTION BACKGROUND prompts (Seed: ${dynamicSessionSeed}). STRICT RULE: NO REPETITION. Each prompt must describe a completely different atmospheric environment, motion dynamic, and visual theme. Start EVERY prompt with a unique [ID_CODE] (e.g., [CHROMATIC_WAVES], [CYBER_HORIZON], [AURORA_RIBBONS], [SILK_CAUSTICS]).

MANDATORY RULES FOR FULL-FRAME BACKGROUND DIVERSITY (STRICT ZERO PARTICLES & ZERO WHITE FLARES):
1. NO REPETITION & NO CENTERING: Each prompt MUST describe a FULL-FRAME EDGE-TO-EDGE motion graphics scene filling the entire widescreen canvas. NEVER describe isolated icons, centered logos, or static borders.
2. STRICT BAN ON PARTICLES: DO NOT describe floating particles, dust motes, or loose speckled dots. All graphics must be clean continuous spline ribbons, 3D perspective grids, topographic contour waves, or luxury liquid caustics.
3. STRICT BAN ON WHITE LIGHT FLARES: NEVER describe white flares, white light bursts, or blinding center blooms. Use rich, moody chromatic palette harmonies.
4. DIVERSE VISUAL CONCEPTS:
   - Prompt 1: Multi-layered chromatic fluid wave ribbons and smooth liquid gradient displacement.
   - Prompt 2: 3D perspective cyber grid, digital wireframe topography, or matrix elevation lines.
   - Prompt 3: Interconnected structural geometric lattice mesh with clean vector linkage lines.
   - Prompt 4: Luxury satin fabric folds, liquid metallic gold waves, or ambient studio caustics.
   - (Vary concepts continuously across all items).
5. 60 FPS SEAMLESS KINETICS: Include harmonic wave oscillations, continuous panning, and atmospheric depth.
${negativeList}

${categoryLine}Animation Type: FULL-FRAME BACKGROUND MOTION
Visual Style: ${style}${colorModeDirective}${glowDirective}
Special Directives: ${typeInstruction}${keywordsDirective}${greenScreenDirective}

Output format: JSON array of ${batchCount} strings e.g. ["prompt 1", "prompt 2"]`;
    } else {
      promptContent = isSingle
        ? `You are a Principal Motion Graphic Director for Adobe Stock & Shutterstock.
Generate exactly 1 professional, highly marketable, and semantically rich animation prompt in English (Seed: ${dynamicSessionSeed}).

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

Output format: JSON array containing exactly 1 string, e.g. ["Masterpiece 3D volumetric model of professional DSLR Camera: standalone sculpted solid body with rich titanium chiaroscuro gradients, beveled chamfers with crisp 1.5px specular highlight rails, concentric multi-ring cylindrical optical lens barrel with glass reflections, spring-loaded shutter button, and soft breathing elliptical ground shadow on green screen (completely standalone, zero background plates, zero rhombus)..."]`
        : `You are a Principal Motion Graphic Director for Adobe Stock & Shutterstock.
Generate exactly ${batchCount} UNIQUE animation prompts (Seed: ${dynamicSessionSeed}). STRICT RULE: NO REPETITION. Each prompt must describe a completely different object, concept, and movement, using varied vocabulary and structure. Start EVERY prompt with a unique [ID_CODE] (e.g., [CAMERA_3D], [BELL_VOLUMETRIC], [VAULT_3D]).

MANDATORY RULES FOR STANDALONE 3D VOLUMETRIC OBJECT (STRICT ZERO RHOMBUS, ZERO SHIELD, ZERO PLATES):
1. STANDALONE VOLUMETRIC 3D ICON OBJECT (THE OBJECT ITSELF IS 3D):
   - Each prompt must describe a solid standalone 3D volumetric physical object (e.g., 3D Camera, 3D Notification Bell, 3D Microphone, 3D Padlock, 3D Trophy) with rich chiaroscuro surface, beveled chamfers with crisp specular highlight rails, and elliptical ground contact shadow.
   - STRICT BAN: ZERO diamond/rhombus plates, ZERO shield badges, ZERO background cards. The object must stand completely uncontained on the canvas.
2. EXTREME PROMPT DIVERSITY & STRUCTURAL VARIATION:
   - EACH prompt in this batch MUST have a COMPLETELY DIFFERENT sentence structure, vocabulary, and thematic focus from the category: ${catMeta?.enName || subCategory}.
3. STRICT BAN ON GEAR WHEELS / SPROCKETS (ZERO GEARS):
   - NEVER describe rotating gear wheels or cogs on icons.
4. ELASTIC KINETIC 60 FPS SPRING DYNAMICS:
   - Include harmonic vertical floating with elastic squash-and-stretch spring bounce, synchronized internal articulation on rigid anchors, and clipped specular sheen sweep.
${negativeList}

${categoryLine}Animation Type: ${String(type).toUpperCase()}
Visual Style: ${style === 'minimalist' ? '3d_crest' : style}${colorModeDirective}${glowDirective}
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
          const thinkingConfig = getSmartThinkingConfig(currentModel, 512);
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
        for (const p of chunkPrompts) {
          if (serverPromptHistoryBank.size > 800) {
            const first = serverPromptHistoryBank.values().next().value;
            if (first) serverPromptHistoryBank.delete(first);
          }
          serverPromptHistoryBank.add(p);
        }
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
- DILARANG KERAS MENGGAMBAR BANGUN BELAH KETUPAT (RHOMBUS), DIAMOND, KOTAK ALAS DENGAN BAUT, PERISAI (SHIELD/CREST), ATAU BINGKAI KARTU DI BELAKANG IKON!
- OBJEK IKON HARUS BERDIRI SENDIRI SECARA MURNI (100% STANDALONE 3D SCULPTED OBJECT) langsung di atas canvas / green screen murni!
- BUKAN pelatnya yang digambar, melainkan OBJEK IKON ITU SENDIRI (jika Kamera, maka bodi kamera bervolume; jika Lonceng, maka cawan lonceng berlekuk; jika Mikrofon, maka kapsul & stand mikrofon)!

[CACAT 6: DILARANG EKSTRUSI 6 SISI MANUAL YANG CACAT (ZERO BROKEN 3D POLYGON MESH)]:
- DILARANG mencoba menghitung poligon isometrik 6 sisi (depan-belakang-kanan-kiri-atas-bawah) secara manual dengan offset vertex silang yang menghasilkan garis patah, poligon menindih tak beraturan, atau bentuk terdistorsi!
- Bentuk siluet objek WAJIB menggunakan kurva native 2D Canvas yang mulus dan presisi (roundRect, bezierCurveTo, quadraticCurveTo, arc, ellipse) sehingga BEBAS CACAT STRUKTUR 100%.

======================================================================
2. MASTER ULTRA-REALISTIC CHIAROSCURO & VOLUMETRIC BLUEPRINT (ZERO DEFECT & BUG-FREE 2D CANVAS):
======================================================================
Kesan 3D bervolume ultra-realistis dibangun melalui sistem pencahayaan studio (Chiaroscuro) yang kokoh dan bebas bug:

[LAYER 1: BAYANGAN KONTAK LANTAI (Breathing Ground Contact Shadow)]:
- Elips bayangan kontak lantai halus langsung di bawah objek icon di canvas/green screen:
  const groundY = S * 0.44;
  const shadowScale = 1 - Math.sin(t * 2) * 0.12;
  ctx.beginPath();
  ctx.ellipse(0, groundY, S * 0.38 * shadowScale, S * 0.08 * shadowScale, 0, 0, Math.PI * 2);
  ctx.fillStyle = isGreenScreen ? 'rgba(0, 30, 0, 0.4)' : 'rgba(0, 0, 0, 0.35)';
  ctx.fill();

[LAYER 2: KINETIKA MELAYANG & ELEVASI 3D (Floating Bobbing & 3D Pitch/Roll)]:
- Objek icon melayang anggun naik-turun dan sedikit miring isometrik:
  const floatY = Math.sin(t * 2) * (S * 0.05);
  const tiltAngle = Math.cos(t * 1.5) * 0.03;
  ctx.save();
  ctx.translate(0, floatY);
  ctx.rotate(tiltAngle);

[LAYER 3: CHIAROSCURO VOLUMETRIC BODY GRADIENT (Pencahayaan Studio 45°)]:
- Permukaan badan utama diisi gradien multi-stop directional 45° dari kiri-atas (-w*0.5, -h*0.5) ke kanan-bawah (w*0.5, h*0.5):
  - Stop 0.0: Key-light highlight (warna bodi + 35% tint putih cerah)
  - Stop 0.25: Warna primer solid cemerlang
  - Stop 0.70: Nada midtone dalam
  - Stop 1.0: Bayangan ambien gelap pekat (-45% luminance, misal navy/dark slate/deep bronze)

[LAYER 4: CRISP SPECULAR BEVEL HIGHLIGHT RAILS (Chamfer Tepi 3D 1.5–2px)]:
- Tepi atas dan kiri bodi yang menghadap sumber cahaya diberi stroke tipis 1.5–2px warna putih transparan (rgba(255, 255, 255, 0.65) memudar ke 0.15) untuk memberikan efek chamfer tepi 3D yang sangat tajam dan berkilau mewah.

[LAYER 5: AMBIENT OCCLUSION CREASES & UNDER-RIM SHADOW]:
- Garis sambungan nat dan batas bawah bodi diberi stroke bayangan tipis 1.5px (rgba(0, 0, 0, 0.4)) untuk memberikan ilusi kedalaman fisik nyata tanpa perlu poligon ekstrusi terpisah.

[LAYER 6: RADIAL SPECULAR SHADING PADA ELEMEN BULAT / SILINDER]:
- Pada komponen bulat (lensa kamera, tombol, bola clapper, kubah mic), gunakan ctx.createRadialGradient(-r*0.35, -r*0.35, r*0.05, 0, 0, r) untuk memberikan efek cembung 3D instan yang bebas cacat!
ctx.restore();

======================================================================
3. SEMANTIC GEOMETRIC BLUEPRINT COMPENDIUM (RESEP SUBJEK STANDALONE):
======================================================================
Gunakan resep subjek berikut bila prompt meminta objek spesifik ini (SEMUANYA STANDALONE TANPA BELAH KETUPAT/SHIELD):

[A. TOPI TOGA WISUDA (ACADEMIC GRADUATION CAP - ZERO RHOMBUS PLATFORM)]:
1. Papan Persegi Isometrik Atas (Isometric Top Mortarboard):
   Papan atas berbentuk jajaran genjang horizontal isometrik (boardW = S * 0.44, boardH = S * 0.14, boardY = -S * 0.12).
   Gunakan gradien gelap berkilau (capGrad), bevel stroke 1.5px di tepi atas, dan bibir rim gelap tebal di bagian bawah. DILARANG menggambar pelat diamond terpisah di belakang topi!
2. Kubah Bodi Topi (Skull Cap Dome):
   Menempel langsung di bawah papan tengah tanpa celah dengan kurva quadraticCurveTo mulus.
3. Kancing Tengah & Tassel Sutra Menjuntai (Center Button & Silk Tassel):
   Kancing emas bulat di tengah, tali kuning meliuk ke kanan lalu menjuntai ke bawah dengan ayunan pendulum lembut 60 FPS (swingTassel).

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

  // --- INISIALISASI VARIABEL / ELEMEN ---

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

Outputkan HANYA file HTML lengkap tanpa teks pembuka atau penjelas markdown apapun:`;

  let cleanHTML = '';
  const { response } = await generateContentWithFallback(
    ai,
    targetModel,
    (currentModel) => {
      const animConfig: any = {
        temperature: 0.35,
        maxOutputTokens: 8192,
      };
      const animThinking = getSmartThinkingConfig(currentModel, 2048);
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

    const { response } = await generateContentWithFallback(
      ai,
      targetModel,
      (currentModel) => {
        const config: any = {
          temperature: 0.12,
          maxOutputTokens: 8192,
        };
        const smartThinking = getSmartThinkingConfig(currentModel, 2048);
        if (smartThinking) config.thinkingConfig = smartThinking;
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
        const smartThinking = getSmartThinkingConfig(currentModel, 512);
        if (smartThinking) config.thinkingConfig = smartThinking;
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
