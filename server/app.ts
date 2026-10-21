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
    const promptContent = isSingle
      ? `You are a Principal Motion Graphic Director for Adobe Stock & Shutterstock.
Generate exactly 1 professional, highly marketable, and semantically rich animation prompt in English.

MANDATORY RULES FOR HIGH-CLASS SHAPES, ATTACHED RIGGING & ZERO DEFECTS:
1. RECOGNIZABLE SUBJECT & SLEEK VECTOR ART:
   - The prompt MUST describe a concrete, clearly identifiable, meaningful visual object or scene (e.g. "Isometric Crypto Gold Coin with beveled edge and glowing currency core", "Precision E-Commerce Shopping Cart with curved wireframe basket, locked wheels, and glowing parcel", "Biotech DNA Double Helix rotating smoothly with glowing nucleotide rungs").
   - FORBIDDEN: Abstract meaningless blobs, deformed random polygons, loose floating scribbles, or vague geometry.
2. DETAILED RIGGED ANATOMY (NO DETACHED PARTS):
   - Explicitly specify how all components are attached to the main body: e.g. wheels locked inside chassis wheel arches, handles welded firmly to bag/mug rim, camera lens mounted flush to chassis.
3. 60 FPS COORDINATED KINETIC DYNAMICS:
   - Unified parent floating oscillation (amplitude ±12px) and gentle breathing scale (0.98x-1.02x), paired with continuous synchronized rotation of internal wheels/gears/dial needles on their locked anchors, plus a dynamic 45-degree diagonal specular gleam sweep across surfaces.

${categoryLine}Animation Type: ${String(type).toUpperCase()}
Visual Style: ${style}${colorModeDirective}${glowDirective}
Special Directives: ${typeInstruction}${keywordsDirective}${greenScreenDirective}

Output format: JSON array containing exactly 1 string, e.g. ["Isometric Crypto Gold Coin with beveled edge and glowing currency core..."]`
      : `You are a Principal Motion Graphic Director for Adobe Stock & Shutterstock.
Generate exactly ${batchCount} unique, highly creative, and semantically diverse animation prompts in English (Batch ${c + 1}).

MANDATORY RULES FOR DIVERSITY:
1. NO REPETITION: Each prompt MUST describe a COMPLETELY DIFFERENT visual subject. NEVER repeat starting phrases.
2. UNIQUE SEMANTIC ID: Start EVERY prompt with a unique [ID_CODE] (e.g., [DATA_PULSE], [VAULT_SAFE], [TREND_GRAPH]).
3. VARIETY: Vary the subject matter (e.g., instead of just chart, use: piggy bank, credit chip, digital vault, ticker tape, or flow).

MANDATORY RULES FOR EXTREME DIVERSITY, HIGH-CLASS SHAPES, & ZERO DEFECTS:
1. EXTREME PROMPT DIVERSITY & STRUCTURAL VARIATION:
   - EACH prompt in this batch MUST have a COMPLETELY DIFFERENT sentence structure, vocabulary, and thematic focus.
   - You MUST vary the descriptive style for each:
     - Prompt 1: Focus on industrial technical aesthetics (chassis, bolts, mechanical joints).
     - Prompt 2: Focus on minimalist, fluid, data-driven flow and abstract gradients.
     - Prompt 3: Focus on complex, isometric geometric structures and depth.
     - (And continue with highly distinct technical/artistic angles for subsequent prompts).
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
          parsedKeywords
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
        parsedKeywords
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
      parsedKeywords
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
- Gunakan rumus elastis membal (spring physics): const bounce = Math.abs(Math.sin(t * 3.5)); const squash = 1 + 0.3 * (1 - bounce); const stretch = 1 / squash;
- Terapkan squash & stretch saat objek mendarat atau memantul. Objek terasa elastis dan berbobot nyata!`;
  } else if (motionDynamics === 'orbital') {
    motionGuide = `
PANDUAN GERAKAN 3D ORBITAL & GYROSCOPE:
- Simulasikan rotasi 3D multi-cincin atau partikel yang mengorbit dengan kedalaman z (pseudo-3D):
  const angle = t * 1.5 + i * (Math.PI * 2 / N);
  const x = cx + Math.cos(angle) * radiusX;
  const y = cy + Math.sin(angle) * radiusY * Math.cos(tiltAngle);
  const z = Math.sin(angle) * Math.sin(tiltAngle);
  ctx.scale(1 + z * 0.3, 1 + z * 0.3); ctx.globalAlpha = 0.5 + 0.5 * (z + 1) / 2;`;
  } else if (motionDynamics === 'morph') {
    motionGuide = `
PANDUAN GERAKAN KINETIC MORPHING:
- Bentuk geometris bertransformasi secara dinamis antar bentuk (lingkaran <-> bintang <-> poligon):
  Gunakan looping vertex: const r = baseR * (1 + 0.3 * Math.sin(angle * spikes + t * 3));
  Hubungkan titik dengan ctx.lineTo atau bezierCurveTo untuk morphing organik yang memukau.`;
  } else if (motionDynamics === 'cyber') {
    motionGuide = `
PANDUAN GERAKAN CYBER STEP & HUD TELEMETRY:
- Gerakan berpola kuantisasi tajam / stepped: const stepT = Math.floor(t * 8) / 8;
- Elemen HUD: busur derajat berputar terkalibrasi, dial bidik melingkar, laser scanner bolak-balik melintasi canvas, kurung sudut siku [ ], dan garis garis target.`;
  } else if (motionDynamics === 'mechanical') {
    motionGuide = `
PANDUAN GERAKAN MECHANICAL & ARTICULATED:
- Komponen mekanik berputar dan berosilasi presisi seiring waktu t dengan artikulasi multi-part yang mulus dan bertenaga.`;
  } else {
    motionGuide = `
PANDUAN GERAKAN ORGANIC FLOW & WAVES:
- Gunakan gelombang harmonik berulang: const wave = Math.sin(t * 2 + i * 0.5) * Math.cos(t * 1.2 + i * 0.3);
- Objek mengalir dan berfluktuasi lembut dengan kemiringan dinamis: ctx.rotate(Math.sin(t * 1.2) * 0.12);`;
  }

  let styleAndColorGuide = '';
  if (colorMode === 'flat' || !neonGlow) {
    styleAndColorGuide = `
PANDUAN WARNA & STYLE: FLAT COLOR / NO GRADIENT / NO GLOW (WAJIB DIPATUHI):
- ctx.shadowBlur = 0; ctx.shadowColor = 'transparent'; (DILARANG GLOW / BLUR).
${colorMode === 'flat' ? '- DILARANG menggunakan createLinearGradient atau createRadialGradient. Gunakan 100% solid hex color (misal: #FF4757, #2ED573, #1E90FF, #FFA502, #FFFFFF, #2F3542, #70A1FF) bergaya Flat Art Vector modern!' : ''}
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
MANDATORY GREEN SCREEN RULES:
- Background HARUS hijau polos murni (#00ff00) untuk chroma key.
- DILARANG background gelap atau gradien hijau ke hitam.
- Objek utama HARUS menggunakan warna kontras jelas (Cyan, Gold, Ungu, Putih, Oranye, Merah, Biru).
- JANGAN gunakan warna hijau #00ff00 pada objek agar tidak terpotong chroma key.`
    : '';

  const systemPrompt = `Anda adalah Lead HTML5 Motion Designer & Master Computer Vision Artist (Microstock & Lottie Specialist).
Tugas: Buat 1 file HTML animasi Canvas 2D yang SANGAT PRESISI, BERMAKNA SEMANTIK TINGGI, BENTUK AKURAT SESUAI PROMPT, dan 100% BEBAS CACAT/LEPAS.

PARAMETER TERPILIH:
- Subjek/Prompt: "${promptTopic}"
- Tipe Animasi: ${String(type).toUpperCase()}
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

ATURAN WAJIB AKURASI BENTUK TINGGI & ZERO OBJEK TERPISAH (MANDATORY):
1. DEKONSTRUKSI ANATOMI SUBJEK SECARA AKURAT (HIGH SEMANTIC RECOGNITION):
   - Wajib gambar bentuk yang secara instan dikenali sebagai subjek dalam prompt: "${promptTopic}".
   - Pecah subjek menjadi siluet bentuk primer yang solid, kokoh, proporsional, dan terdefinisi jelas.
   - DILARANG KERAS menggambar bentuk poligon acak, garis meliuk tak bermakna, atau lingkaran/kotak polos tanpa anatomi subjek!
   - Contoh representasi akurat per tema:
     * Hearing Aid / Alat Bantu Dengar: Badan casing melengkung ergonomis di belakang telinga, tabung suara transparan/fleksibel melengkung, earpiece/mold masuk telinga, dan busur gelombang suara konsentris memancar keluar dari speaker dengan pemudaran halus (alpha = 1 - progress).
     * Prosthetic Limb / Kaki Palsu: Soket paha/betis aerodinamis, engsel lutut/pergelangan mekanis bersumbu baut presisi, dan bilah kaki carbon-fiber melengkung dinamis yang mengayun pada poros engsel.
     * Physical Therapy / Resistance Band: Pita karet lateks elastis dengan tekstur grip ganda di kedua ujung, berosilasi meregang secara harmonis dan elastis.
     * Walker / Tongkat Lansia: Rangka pipa aluminium berbentuk U ganda dengan 4 kaki berkaret hitam di bawah, pegangan grip busa, dan palang penguat horizontal.
     * Pediatric / Baby: Stetoskop dengan liontin boneka teddy bear imut / botol susu berkontur dengan dot silikon bening dan indikator mililiter timbul.
     * Medis / Cross / Biotech: Salib medis simetris tebal dengan bevel 3D dan garis denyut ECG elektrokardiogram bercahaya yang bergerak di tengahnya.
     * Koin / Finansial / Bisnis: Koin emas bertekstur beveled rim tebal dengan logo mata uang timbul dan kilau specular shine.
     * Kendaraan / Transportasi: Sasis aerodinamis dengan spakbor roda, roda ban terpasang mati di sasis dengan velg berputar di poros tengah.

2. ATURAN HIERARKI TUNGGAL & ZERO OBJEK TERPISAH (RIGID PARENT-CHILD MATRIX RIGGING):
   - SEMUA komponen suatu objek WAJIB berada di dalam SATU MATRIX INDUK BERSAMA:
     ctx.save();
     ctx.translate(cx, cy + floatY); // Osilasi/floating hanya di root matrix
     ctx.rotate(rootRot);             // Kemiringan hanya di root matrix
     ctx.scale(rootScale, rootScale); // Breathing scale hanya di root matrix
     
     // ATURAN ANATOMI TERIKAT (PHYSICAL JOINT ANCHORS):
     // 1. RODA MOBIL/GEROBAK: Axle roda WAJIB terpasang di (-axleX, axleY) dan (+axleX, axleY) sasis!
     //    Hanya velg di dalam ban yang berputar (ctx.rotate(t * 8)), posisi roda 100% terkunci mati di sasis!
     // 2. GAGANG TAS / MUG: Titik ujung pegangan WAJIB menempel persis di bibir objek!
     // 3. LAYAR HP/LAPTOP: Seluruh interface & wallpaper WAJIB di dalam bezel bodi (ctx.clip())!
     // 4. BALING-BALING/ROTOR/SENDI: Terpasang di sumbu pusat fisik komponen (ctx.translate(jointX, jointY); ctx.rotate(ang);)!
     // DILARANG KERAS menerapkan translate independen yang menyebabkan bagian tubuh atau aksesori melayang terpisah!

     ctx.restore();

3. GERAKAN KINETIK PROFESIONAL 60 FPS (NON-DEFORMING & PURPOSEFUL):
   - DILARANG squash & stretch ekstrem yang merusak bentuk objek menjadi seperti jelly/gelatin lembek.
   - Gerakan objek utama harus elegan dan menjaga integritas bentuk:
     * Gentle Float: const floatY = Math.sin(t * 1.8) * 10;
     * Gentle Root Sway: const rootRot = Math.sin(t * 1.4) * 0.04;
     * Gentle Breath: const rootScale = 1 + Math.sin(t * 2.0) * 0.015;
   - Implementasikan gerakan kinetik yang secara langsung mencerminkan kata kerja dalam prompt:
     * Jika "rotating / berputar": putar objek atau elemen indikatornya secara mulus pada poros tengahnya: ctx.rotate(t * speed);
     * Jika "pulse / gelombang / soundwaves / sinyal": gambar 2-3 cincin atau busur gelombang yang memancar dari lubang emitor/speaker, membesar secara proporsional dan memudar (ctx.globalAlpha = 1 - progress);
     * Jika "articulated / mekanis / mengayun": ayunkan bagian sendi dengan osilasi sudut halus: const jointAngle = Math.sin(t * 2.5) * 0.25;
     * Jika "stretching / lentur": ubah jarak ujung peregang secara elastis tanpa merusak ketebalan pita.

4. ISOLASI TOTAL & KEBERSIHAN KANVAS:
   - DILARANG memunculkan partikel mengambang, debu liar, bintik acak, atau serpihan di luar objek utama!
   - Background canvas harus bersih, solid, dan kontras.
   - Setiap frame baru WAJIB diawali dengan pembersihan kanvas total: ctx.clearRect(0, 0, w, h); ctx.fillStyle = ${clearFill}; ctx.fillRect(0, 0, w, h);.
   - Skala S = Math.min(w, h) * ${type === 'icon' ? '0.44' : '0.65'}; Objek terpusat di (cx, cy).

5. MANDATORY SPECULAR & GLOW CLIPPING RULE (ANTI-OVERFLOW GLOW - SANGAT PENTING):
   - Setiap efek kilau cahaya (specular highlight, gloss shine, reflection strip, atau light flare) pada objek WAJIB menggunakan ctx.save(); ctx.beginPath(); [gambar bentuk geometri objek utama]; ctx.clip(); sebelum menggambar kilau!
   - DILARANG KERAS menggambar kilau cahaya atau kotak/stripe kilau yang keluar melampaui batas (overflow) bentuk objek utama atau merembes ke latar belakang hijau (#00ff00).
   - Seluruh efek pantulan cahaya harus 100% berada di dalam batasan siluet objek.

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
        maxOutputTokens: 4096,
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
