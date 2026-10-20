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
  const m = (targetModel || "").toLowerCase();
  if (m.includes("2.5")) {
    // 0 thinking budget disables token-wasting reasoning steps for ultra-fast response & zero token waste
    return { thinkingBudget: 0 };
  }
  if (m.includes("3.1-flash-lite") || m.includes("lite")) {
    return { thinkingLevel: ThinkingLevel.LOW };
  }
  if (m.includes("pro") || m.includes("3.1")) {
    return { thinkingLevel: ThinkingLevel.LOW };
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

        const isOverloaded =
          msg.includes("503") ||
          msg.includes("high demand") ||
          msg.includes("unavailable") ||
          msg.includes("overloaded");

        if (isQuota) {
          break;
        } else if (isOverloaded && attempt < allowedAttempts) {
          await new Promise((res) => setTimeout(res, 400 * attempt));
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
Generate exactly ${batchCount} professional, highly marketable, and semantically rich animation prompts in English (Batch ${c + 1}).

MANDATORY RULES FOR HIGH-CLASS SHAPES, ATTACHED RIGGING & ZERO DEFECTS:
1. RECOGNIZABLE SUBJECT & SLEEK VECTOR ART:
   - Each prompt MUST describe a concrete, clearly identifiable, meaningful visual object or scene (e.g. "Isometric Crypto Gold Coin with beveled edge and glowing currency core", "Precision E-Commerce Shopping Cart with curved wireframe basket, locked wheels, and glowing parcel", "Biotech DNA Double Helix rotating smoothly with glowing nucleotide rungs", "Cybersecurity Hologram Shield with interlocking hexagonal plates and pulsing central keyhole core", "Sleek Aerodynamic Electric Vehicle with chassis, roof cabin, and glowing alloy wheels").
   - FORBIDDEN: Abstract meaningless blobs, deformed random polygons, loose floating scribbles, or vague geometry.
2. DETAILED RIGGED ANATOMY (NO DETACHED PARTS):
   - Explicitly specify how all components are attached to the main body: e.g. wheels locked inside chassis wheel arches, handles welded firmly to bag/mug rim, camera lens mounted flush to chassis, sensors connected at ports.
3. 60 FPS COORDINATED KINETIC DYNAMICS:
   - Unified parent floating oscillation (amplitude ±12px) and gentle breathing scale (0.98x-1.02x), paired with continuous synchronized rotation of internal wheels/gears/dial needles on their locked anchors, plus a dynamic 45-degree diagonal specular gleam sweep across surfaces.

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
            temperature: 0.8,
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

  const { response } = await generateContentWithFallback(
    ai,
    targetModel,
    (currentModel) => {
      const animConfig: any = {
        temperature: 0.1,
        maxOutputTokens: 3800,
      };
      const animThinking = getFastThinkingConfig(currentModel);
      if (animThinking) {
        animConfig.thinkingConfig = animThinking;
      }
      return { contents: systemPrompt, config: animConfig };
    }
  );

  let rawText = response.text || "";
  let cleanHTML = extractHTMLFromMarkdown(rawText);

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

//// Master High-Precision Procedural Vector Canvas HTML Generator (Smart Semantic Vector, No Generic Gear)
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
    } else if (title.includes('hearing') || title.includes('ear') || title.includes('telinga') || title.includes('aid') || title.includes('audio') || title.includes('sound')) {
      // 11. HEARING AID (Behind-The-Ear Casing, Acoustic Tube, Earpiece, Radiating Soundwaves)
      const haw = R * 1.1;
      const hah = R * 1.35;
      
      // Main BTE (Behind-The-Ear) Ergonomic Casing
      ctx.beginPath();
      ctx.moveTo(-haw * 0.15, -hah * 0.38);
      ctx.bezierCurveTo(haw * 0.45, -hah * 0.38, haw * 0.48, hah * 0.22, -haw * 0.05, hah * 0.38);
      ctx.bezierCurveTo(-haw * 0.35, hah * 0.42, -haw * 0.38, -hah * 0.15, -haw * 0.15, -hah * 0.38);
      ctx.closePath();
      const haGrad = ctx.createLinearGradient(-haw * 0.3, -hah * 0.4, haw * 0.4, hah * 0.4);
      haGrad.addColorStop(0, "${glowColor}");
      haGrad.addColorStop(0.5, "${secondaryColor}");
      haGrad.addColorStop(1, '#0f172a');
      ctx.fillStyle = haGrad;
      ctx.fill();
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();

      // Metallic Volume Dial & Mic Ports
      ctx.fillStyle = "${accentColor}";
      ctx.beginPath();
      ctx.arc(haw * 0.12, -hah * 0.12, 6, 0, Math.PI * 2);
      ctx.arc(haw * 0.16, 0, 5, 0, Math.PI * 2);
      ctx.fill();

      // Transparent Acoustic Ear Hook Tube (Firmly anchored at top of casing)
      ctx.beginPath();
      ctx.moveTo(-haw * 0.12, -hah * 0.35);
      ctx.bezierCurveTo(-haw * 0.52, -hah * 0.50, -haw * 0.65, -hah * 0.10, -haw * 0.45, hah * 0.05);
      ctx.lineWidth = 7;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
      ctx.stroke();
      ctx.lineWidth = 3;
      ctx.strokeStyle = "${accentColor}";
      ctx.stroke();

      // Soft In-Ear Mold (Ear Tip)
      ctx.beginPath();
      ctx.arc(-haw * 0.45, hah * 0.05, 12, 0, Math.PI * 2);
      ctx.fillStyle = "${accentColor}";
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();

      // Concentric Radiating Sound Waves (Smooth expanding pulse from earpiece)
      for (let sw = 0; sw < 3; sw++) {
        const waveProgress = ((t * 1.5 + sw * 0.33) % 1);
        const waveRadius = 14 + waveProgress * (R * 0.45);
        const waveAlpha = Math.max(0, 1 - waveProgress);
        ctx.save();
        ctx.globalAlpha = waveAlpha;
        ctx.strokeStyle = "${glowColor}";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(-haw * 0.45, hah * 0.05, waveRadius, -Math.PI * 0.65, Math.PI * 0.65);
        ctx.stroke();
        ctx.restore();
      }

    } else if (title.includes('prosthetic') || title.includes('limb') || title.includes('bionic') || title.includes('palsu') || title.includes('leg') || title.includes('foot') || title.includes('kaki')) {
      // 12. PROSTHETIC LIMB (Carbon Socket, Articulated Knee Hinge, Dynamic Blade Foot)
      const plw = R * 0.75;
      const plh = R * 1.5;

      // Upper Titanium Socket (Thigh / Shank Adapter)
      ctx.beginPath();
      ctx.moveTo(-plw * 0.42, -plh * 0.45);
      ctx.lineTo(plw * 0.42, -plh * 0.45);
      ctx.lineTo(plw * 0.28, -plh * 0.08);
      ctx.lineTo(-plw * 0.28, -plh * 0.08);
      ctx.closePath();
      const socketGrad = ctx.createLinearGradient(-plw * 0.5, -plh * 0.45, plw * 0.5, -plh * 0.08);
      socketGrad.addColorStop(0, '#475569');
      socketGrad.addColorStop(0.5, "${glowColor}");
      socketGrad.addColorStop(1, '#0f172a');
      ctx.fillStyle = socketGrad;
      ctx.fill();
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();

      // Articulated Knee/Ankle Hinge Pivot (Joint Anchor at [0, -plh * 0.06])
      const kneeY = -plh * 0.06;
      ctx.save();
      ctx.translate(0, kneeY);
      const kneeFlex = Math.sin(t * 3.0) * 0.16; // Smooth natural walking flex
      ctx.rotate(kneeFlex);

      // Central Joint Bolt
      ctx.beginPath();
      ctx.arc(0, 0, 14, 0, Math.PI * 2);
      ctx.fillStyle = '#1e293b';
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = "${accentColor}";
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();

      // Aerodynamic Carbon Pylon Tube
      ctx.beginPath();
      ctx.moveTo(-plw * 0.12, 0);
      ctx.lineTo(plw * 0.12, 0);
      ctx.lineTo(plw * 0.08, plh * 0.38);
      ctx.lineTo(-plw * 0.08, plh * 0.38);
      ctx.closePath();
      ctx.fillStyle = "${secondaryColor}";
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();

      // Curved Dynamic Running Blade / Foot Spring (C-shaped carbon fiber)
      ctx.beginPath();
      ctx.moveTo(-plw * 0.08, plh * 0.38);
      ctx.bezierCurveTo(-plw * 0.08, plh * 0.55, plw * 0.65, plh * 0.55, plw * 0.55, plh * 0.48);
      ctx.lineWidth = 8;
      ctx.strokeStyle = "${glowColor}";
      ctx.stroke();

      // Rubber Sole Grip
      ctx.beginPath();
      ctx.moveTo(plw * 0.15, plh * 0.54);
      ctx.lineTo(plw * 0.52, plh * 0.50);
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();

      ctx.restore();

    } else if (title.includes('therapy') || title.includes('band') || title.includes('resistance') || title.includes('fisioterapi') || title.includes('fitness') || title.includes('exercise') || title.includes('gym')) {
      // 13. PHYSICAL THERAPY RESISTANCE BAND & DUMBBELL
      const tbw = R * 1.45;
      const tbh = R * 0.85;

      // Elastic Stretching Resistance Ribbon (Smooth sinusoidal stretch)
      const stretchAmp = Math.sin(t * 3.2) * 22;
      ctx.beginPath();
      ctx.moveTo(-tbw * 0.45, -16 + stretchAmp * 0.5);
      ctx.bezierCurveTo(-tbw * 0.15, 28 - stretchAmp, tbw * 0.15, -28 + stretchAmp, tbw * 0.45, 16 - stretchAmp * 0.5);
      ctx.lineWidth = 18;
      const bandGrad = ctx.createLinearGradient(-tbw * 0.5, 0, tbw * 0.5, 0);
      bandGrad.addColorStop(0, "${glowColor}");
      bandGrad.addColorStop(0.5, "${secondaryColor}");
      bandGrad.addColorStop(1, "${accentColor}");
      ctx.strokeStyle = bandGrad;
      ctx.stroke();

      // Inner Highlight Sheen Line
      ctx.beginPath();
      ctx.moveTo(-tbw * 0.42, -16 + stretchAmp * 0.5);
      ctx.bezierCurveTo(-tbw * 0.15, 28 - stretchAmp, tbw * 0.15, -28 + stretchAmp, tbw * 0.42, 16 - stretchAmp * 0.5);
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();

      // Dual Ergonomic Foam Handles
      function drawBandHandle(hx, hy) {
        ctx.save();
        ctx.translate(hx, hy);
        ctx.beginPath();
        if (typeof ctx.roundRect === 'function') {
          ctx.roundRect(-8, -24, 16, 48, 8);
        } else {
          ctx.rect(-8, -24, 16, 48);
        }
        ctx.fillStyle = '#0f172a';
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();
        // Inner comfort ridges
        for (let r = -12; r <= 12; r += 8) {
          ctx.fillStyle = "${accentColor}";
          ctx.fillRect(-6, r - 1.5, 12, 3);
        }
        ctx.restore();
      }

      drawBandHandle(-tbw * 0.48, -16 + stretchAmp * 0.5);
      drawBandHandle(tbw * 0.48, 16 - stretchAmp * 0.5);

    } else if (title.includes('walker') || title.includes('walking') || title.includes('tongkat') || title.includes('elderly') || title.includes('lansia') || title.includes('rehab') || title.includes('crutch')) {
      // 14. MOBILITY WALKER / WALKING FRAME FOR ELDERLY
      const wkw = R * 1.35;
      const wkh = R * 1.45;
      
      // Top Curved Handle Grip Bar
      ctx.beginPath();
      ctx.moveTo(-wkw * 0.42, -wkh * 0.42);
      ctx.lineTo(wkw * 0.42, -wkh * 0.42);
      ctx.lineWidth = 12;
      ctx.strokeStyle = "${secondaryColor}";
      ctx.stroke();
      
      // Soft Foam Hand Grips (Left & Right)
      ctx.lineWidth = 16;
      ctx.strokeStyle = '#0f172a';
      ctx.beginPath();
      ctx.moveTo(-wkw * 0.40, -wkh * 0.42);
      ctx.lineTo(-wkw * 0.18, -wkh * 0.42);
      ctx.moveTo(wkw * 0.18, -wkh * 0.42);
      ctx.lineTo(wkw * 0.40, -wkh * 0.42);
      ctx.stroke();

      // Dual Cross-Brace Stabilizer Bars
      ctx.lineWidth = 5;
      ctx.strokeStyle = "${glowColor}";
      ctx.beginPath();
      ctx.moveTo(-wkw * 0.38, -wkh * 0.15);
      ctx.lineTo(wkw * 0.38, -wkh * 0.15);
      ctx.moveTo(-wkw * 0.40, wkh * 0.12);
      ctx.lineTo(wkw * 0.40, wkh * 0.12);
      ctx.stroke();

      // 4 Robust Legs (Tapered outward for stability)
      const legs = [-wkw * 0.38, -wkw * 0.22, wkw * 0.22, wkw * 0.38];
      for (const lx of legs) {
        ctx.beginPath();
        ctx.moveTo(lx * 0.9, -wkh * 0.42);
        ctx.lineTo(lx * 1.15, wkh * 0.45);
        ctx.lineWidth = 6;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();

        // Heavy-Duty Non-Slip Rubber Stoppers (Feet)
        ctx.beginPath();
        if (typeof ctx.roundRect === 'function') {
          ctx.roundRect(lx * 1.15 - 9, wkh * 0.45 - 2, 18, 12, 4);
        } else {
          ctx.rect(lx * 1.15 - 9, wkh * 0.45 - 2, 18, 12);
        }
        ctx.fillStyle = "${accentColor}";
        ctx.fill();
      }

    } else if (title.includes('pediatric') || title.includes('baby') || title.includes('cradle') || title.includes('bottle') || title.includes('infant') || title.includes('bayi') || title.includes('anak')) {
      // 15. PEDIATRIC & BABY HEALTHCARE (Nurturing Bottle & Heartbeat / Stethoscope)
      const bbw = R * 0.85;
      const bbh = R * 1.45;

      // Baby Bottle Clear Body
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(-bbw * 0.45, -bbh * 0.15, bbw * 0.9, bbh * 0.62, 18);
      } else {
        ctx.rect(-bbw * 0.45, -bbh * 0.15, bbw * 0.9, bbh * 0.62);
      }
      ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.fill();
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = "${glowColor}";
      ctx.stroke();

      // Warm Glowing Milk Level (Gentle fluid ripple inside)
      ctx.save();
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(-bbw * 0.42, 0, bbw * 0.84, bbh * 0.45, 14);
      } else {
        ctx.rect(-bbw * 0.42, 0, bbw * 0.84, bbh * 0.45);
      }
      const milkGrad = ctx.createLinearGradient(0, 0, 0, bbh * 0.45);
      milkGrad.addColorStop(0, '#ffffff');
      milkGrad.addColorStop(1, "${accentColor}");
      ctx.fillStyle = milkGrad;
      ctx.fill();
      ctx.restore();

      // Measurement Markings (ml Scale)
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2.5;
      for (let m = -bbh * 0.05; m <= bbh * 0.35; m += 14) {
        ctx.beginPath();
        ctx.moveTo(-bbw * 0.40, m);
        ctx.lineTo(-bbw * 0.22, m);
        ctx.stroke();
      }

      // Bottle Screw Collar Ring
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(-bbw * 0.48, -bbh * 0.26, bbw * 0.96, 16, 6);
      } else {
        ctx.rect(-bbw * 0.48, -bbh * 0.26, bbw * 0.96, 16);
      }
      ctx.fillStyle = "${secondaryColor}";
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();

      // Soft Silicone Teat / Nipple
      ctx.beginPath();
      ctx.moveTo(-bbw * 0.22, -bbh * 0.26);
      ctx.bezierCurveTo(-bbw * 0.22, -bbh * 0.52, bbw * 0.22, -bbh * 0.52, bbw * 0.22, -bbh * 0.26);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();

    } else if (title.includes('coin') || title.includes('finance') || title.includes('money') || title.includes('crypto') || title.includes('koin') || title.includes('uang') || title.includes('dollar')) {
      // 16. FINANCIAL 3D EMBOSSED COIN
      const cr = R * 0.85;

      // Outer Beveled Coin Rim
      ctx.beginPath();
      ctx.arc(0, 0, cr, 0, Math.PI * 2);
      const coinGrad = ctx.createLinearGradient(-cr, -cr, cr, cr);
      coinGrad.addColorStop(0, '#ffd700');
      coinGrad.addColorStop(0.4, '#fffbeb');
      coinGrad.addColorStop(0.7, '#d97706');
      coinGrad.addColorStop(1, '#78350f');
      ctx.fillStyle = coinGrad;
      ctx.fill();
      ctx.lineWidth = 5;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();

      // Inner Coin Ring
      ctx.beginPath();
      ctx.arc(0, 0, cr * 0.82, 0, Math.PI * 2);
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
      ctx.stroke();

      // Embossed Currency Dollar / Crypto Emblem
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold ' + Math.floor(cr * 0.95) + 'px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('$', 0, 4);

    } else if (title.includes('leaf') || title.includes('solar') || title.includes('eco') || title.includes('energy') || title.includes('green') || title.includes('daun') || title.includes('wind')) {
      // 17. ECO / CLEAN GREEN ENERGY (Botanical Sprout & Solar Grid)
      const lr = R * 0.95;

      // Sculpted Natural Leaf Silhouette
      ctx.beginPath();
      ctx.moveTo(0, lr * 0.65);
      ctx.bezierCurveTo(lr * 0.75, lr * 0.35, lr * 0.65, -lr * 0.45, 0, -lr * 0.75);
      ctx.bezierCurveTo(-lr * 0.65, -lr * 0.45, -lr * 0.75, lr * 0.35, 0, lr * 0.65);
      ctx.closePath();
      const leafGrad = ctx.createLinearGradient(0, -lr * 0.75, 0, lr * 0.65);
      leafGrad.addColorStop(0, '#4ade80');
      leafGrad.addColorStop(0.5, '#16a34a');
      leafGrad.addColorStop(1, '#064e3b');
      ctx.fillStyle = leafGrad;
      ctx.fill();
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();

      // Central Pulsing Vein & Offshoots
      ctx.beginPath();
      ctx.moveTo(0, lr * 0.62);
      ctx.lineTo(0, -lr * 0.68);
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.stroke();

      for (let v = -lr * 0.35; v <= lr * 0.25; v += 18) {
        ctx.beginPath();
        ctx.moveTo(0, v);
        ctx.lineTo(lr * 0.28, v - 16);
        ctx.moveTo(0, v);
        ctx.lineTo(-lr * 0.28, v - 16);
        ctx.stroke();
      }

    } else if (title.includes('drone') || title.includes('quadcopter') || title.includes('uav')) {
      // 18. DRONE / QUADCOPTER (Central Aerodynamic Pod, 4 Rigid Arms, 4 Rotating Propellers)
      const dw = R * 1.35;
      const dh = R * 1.0;

      // 4 Carbon Fiber Arms (Rigidly welded to center body)
      ctx.lineWidth = 6;
      ctx.strokeStyle = '#334155';
      ctx.beginPath();
      ctx.moveTo(-dw * 0.45, -dh * 0.45);
      ctx.lineTo(dw * 0.45, dh * 0.45);
      ctx.moveTo(dw * 0.45, -dh * 0.45);
      ctx.lineTo(-dw * 0.45, dh * 0.45);
      ctx.stroke();

      // 4 Propeller Rotors (Locked at exact arm tips, spinning at high FPS)
      const motors = [
        [-dw * 0.45, -dh * 0.45],
        [dw * 0.45, -dh * 0.45],
        [-dw * 0.45, dh * 0.45],
        [dw * 0.45, dh * 0.45],
      ];
      for (const [mx, my] of motors) {
        ctx.save();
        ctx.translate(mx, my);
        // Motor Mount
        ctx.beginPath();
        ctx.arc(0, 0, 9, 0, Math.PI * 2);
        ctx.fillStyle = "${accentColor}";
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();

        // High-Speed Spinning Twin Blades
        ctx.rotate(t * 18);
        ctx.beginPath();
        ctx.ellipse(0, 0, R * 0.32, 4, 0, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
        ctx.fill();
        ctx.restore();
      }

      // Central Aerodynamic Fuselage Pod
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(-dw * 0.22, -dh * 0.28, dw * 0.44, dh * 0.56, 16);
      } else {
        ctx.rect(-dw * 0.22, -dh * 0.28, dw * 0.44, dh * 0.56);
      }
      const droneGrad = ctx.createLinearGradient(-dw * 0.25, -dh * 0.3, dw * 0.25, dh * 0.3);
      droneGrad.addColorStop(0, "${glowColor}");
      droneGrad.addColorStop(0.5, "${secondaryColor}");
      droneGrad.addColorStop(1, '#0f172a');
      ctx.fillStyle = droneGrad;
      ctx.fill();
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();

      // Front 4K Sensor Camera Dome
      ctx.beginPath();
      ctx.arc(0, dh * 0.28, 12, 0, Math.PI * 2);
      ctx.fillStyle = '#0f172a';
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = "${accentColor}";
      ctx.stroke();

    } else if (title.includes('headset') || title.includes('headphone') || title.includes('earphone') || title.includes('audio')) {
      // 19. PROFESSIONAL STUDIO HEADPHONES (Ergonomic Padded Arch & Cushioned Ear Cups)
      const hsw = R * 1.35;
      const hsh = R * 1.25;

      // Padded Arch Headband (Stretching symmetrically across the top)
      ctx.beginPath();
      ctx.arc(0, -hsh * 0.08, hsw * 0.48, Math.PI * 0.88, Math.PI * 0.12, true);
      ctx.lineWidth = 14;
      ctx.strokeStyle = "${secondaryColor}";
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(0, -hsh * 0.08, hsw * 0.48, Math.PI * 0.88, Math.PI * 0.12, true);
      ctx.lineWidth = 6;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();

      // Dual Cushioned Ear Cups (Locked at left & right ends)
      function drawEarCup(ex, isLeft) {
        ctx.save();
        ctx.translate(ex, hsh * 0.12);
        ctx.beginPath();
        if (typeof ctx.roundRect === 'function') {
          ctx.roundRect(-14, -hsh * 0.28, 28, hsh * 0.56, 12);
        } else {
          ctx.rect(-14, -hsh * 0.28, 28, hsh * 0.56);
        }
        const cupGrad = ctx.createLinearGradient(-14, -hsh * 0.28, 14, hsh * 0.28);
        cupGrad.addColorStop(0, "${glowColor}");
        cupGrad.addColorStop(0.5, '#1e293b');
        cupGrad.addColorStop(1, '#020617');
        ctx.fillStyle = cupGrad;
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();

        // Glowing Core Ring
        ctx.beginPath();
        ctx.arc(0, 0, 10, 0, Math.PI * 2);
        ctx.fillStyle = "${accentColor}";
        ctx.fill();
        ctx.restore();
      }

      drawEarCup(-hsw * 0.48, true);
      drawEarCup(hsw * 0.48, false);

    } else if (title.includes('watch') || title.includes('clock') || title.includes('jam') || title.includes('smartwatch')) {
      // 20. LUXURY SMARTWATCH (Circular Bezel, Attached Straps, Smooth Sweeping Hands)
      const wr = R * 0.68;

      // Upper & Lower Textured Straps (Firmly anchored to casing)
      ctx.beginPath();
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(-wr * 0.42, -R * 0.95, wr * 0.84, R * 0.95);
      ctx.fillRect(-wr * 0.42, 0, wr * 0.84, R * 0.95);
      ctx.lineWidth = 3;
      ctx.strokeStyle = "${secondaryColor}";
      ctx.strokeRect(-wr * 0.42, -R * 0.95, wr * 0.84, R * 1.90);

      // Circular Watch Chassis & Bezel
      ctx.beginPath();
      ctx.arc(0, 0, wr, 0, Math.PI * 2);
      const watchGrad = ctx.createLinearGradient(-wr, -wr, wr, wr);
      watchGrad.addColorStop(0, "${glowColor}");
      watchGrad.addColorStop(0.5, '#0f172a');
      watchGrad.addColorStop(1, "${accentColor}");
      ctx.fillStyle = watchGrad;
      ctx.fill();
      ctx.lineWidth = 5;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();

      // OLED Dial Face
      ctx.beginPath();
      ctx.arc(0, 0, wr * 0.82, 0, Math.PI * 2);
      ctx.fillStyle = '#020617';
      ctx.fill();

      // Sweeping Clock Hands (Smooth continuous 60 FPS sweep)
      ctx.save();
      ctx.rotate(t * 1.5);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, -wr * 0.65);
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = "${glowColor}";
      ctx.stroke();
      ctx.restore();

      ctx.save();
      ctx.rotate(t * 0.25);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(wr * 0.45, 0);
      ctx.lineWidth = 4.5;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();
      ctx.restore();

      // Center Pin
      ctx.beginPath();
      ctx.arc(0, 0, 5, 0, Math.PI * 2);
      ctx.fillStyle = "${accentColor}";
      ctx.fill();

    } else if (title.includes('box') || title.includes('paket') || title.includes('delivery') || title.includes('kurir') || title.includes('kardus') || title.includes('shipping') || title.includes('package')) {
      // 21. DELIVERY PARCEL & LOGISTICS PACKAGE (3D Isometric Box, Packaging Tape, Glowing Barcode)
      const bw = R * 1.25;
      const bh = R * 1.05;

      // Isometric Carton Box
      ctx.beginPath();
      ctx.moveTo(0, -bh * 0.45);
      ctx.lineTo(bw * 0.45, -bh * 0.2);
      ctx.lineTo(bw * 0.45, bh * 0.35);
      ctx.lineTo(0, bh * 0.58);
      ctx.lineTo(-bw * 0.45, bh * 0.35);
      ctx.lineTo(-bw * 0.45, -bh * 0.2);
      ctx.closePath();
      const boxGrad = ctx.createLinearGradient(-bw * 0.5, -bh * 0.5, bw * 0.5, bh * 0.5);
      boxGrad.addColorStop(0, '#f59e0b');
      boxGrad.addColorStop(0.5, '#d97706');
      boxGrad.addColorStop(1, '#78350f');
      ctx.fillStyle = boxGrad;
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();

      // Center Sealing Tape
      ctx.beginPath();
      ctx.moveTo(0, -bh * 0.45);
      ctx.lineTo(0, bh * 0.58);
      ctx.lineWidth = 14;
      ctx.strokeStyle = 'rgba(254, 243, 199, 0.45)';
      ctx.stroke();

      // Glowing Shipping Barcode Tag
      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.fillRect(-bw * 0.28, -bh * 0.05, bw * 0.22, bh * 0.22);
      ctx.strokeStyle = '#020617';
      ctx.lineWidth = 2;
      for (let bc = -bw * 0.25; bc <= -bw * 0.08; bc += 5) {
        ctx.beginPath();
        ctx.moveTo(bc, -bh * 0.02);
        ctx.lineTo(bc, bh * 0.14);
        ctx.stroke();
      }

    } else if (title.includes('robot') || title.includes('cyborg') || title.includes('bot') || title.includes('ai') || title.includes('mascot')) {
      // 22. AI CYBORG / ROBOT MASCOT (Attached Antenna, Visor Display, Articulated Head)
      const rw = R * 1.15;
      const rh = R * 1.15;

      // Top Antenna Pin (Locked to head crown)
      ctx.beginPath();
      ctx.moveTo(0, -rh * 0.45);
      ctx.lineTo(0, -rh * 0.68);
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, -rh * 0.68, 8, 0, Math.PI * 2);
      ctx.fillStyle = "${accentColor}";
      ctx.fill();

      // Robot Rounded Head
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(-rw * 0.42, -rh * 0.45, rw * 0.84, rh * 0.75, 18);
      } else {
        ctx.rect(-rw * 0.42, -rh * 0.45, rw * 0.84, rh * 0.75);
      }
      const robGrad = ctx.createLinearGradient(-rw * 0.5, -rh * 0.5, rw * 0.5, rh * 0.5);
      robGrad.addColorStop(0, "${glowColor}");
      robGrad.addColorStop(0.5, "${secondaryColor}");
      robGrad.addColorStop(1, '#0f172a');
      ctx.fillStyle = robGrad;
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();

      // Glowing Cyber Visor
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(-rw * 0.32, -rh * 0.22, rw * 0.64, rh * 0.28, 10);
      } else {
        ctx.rect(-rw * 0.32, -rh * 0.22, rw * 0.64, rh * 0.28);
      }
      ctx.fillStyle = '#020617';
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = "${accentColor}";
      ctx.stroke();

      // Visor Eye Pulse
      ctx.beginPath();
      ctx.arc(-16, -rh * 0.08, 6, 0, Math.PI * 2);
      ctx.arc(16, -rh * 0.08, 6, 0, Math.PI * 2);
      ctx.fillStyle = "${accentColor}";
      ctx.fill();

    } else if (title.includes('bulb') || title.includes('lampu') || title.includes('idea') || title.includes('inovasi') || title.includes('creativity')) {
      // 23. INNOVATION LIGHTBULB (Glass Bulb Contour, Radiant Filament, Threaded Screw Base)
      const lr = R * 0.72;

      // Bottom Screw Base (Firmly welded to bulb neck)
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(-lr * 0.35, lr * 0.65, lr * 0.70, lr * 0.38, 4);
      } else {
        ctx.rect(-lr * 0.35, lr * 0.65, lr * 0.70, lr * 0.38);
      }
      ctx.fillStyle = '#475569';
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();

      // Glass Bulb Sphere & Tapered Neck
      ctx.beginPath();
      ctx.arc(0, -lr * 0.15, lr, Math.PI * 0.75, Math.PI * 0.25);
      ctx.lineTo(lr * 0.35, lr * 0.65);
      ctx.lineTo(-lr * 0.35, lr * 0.65);
      ctx.closePath();
      const bulbGrad = ctx.createRadialGradient(0, -lr * 0.15, 10, 0, -lr * 0.15, lr * 1.1);
      bulbGrad.addColorStop(0, '#fef08a');
      bulbGrad.addColorStop(0.5, "${glowColor}");
      bulbGrad.addColorStop(1, 'rgba(15, 23, 42, 0.45)');
      ctx.fillStyle = bulbGrad;
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();

      // Glowing Tungsten Filament
      ctx.beginPath();
      ctx.moveTo(-lr * 0.22, lr * 0.35);
      ctx.lineTo(-lr * 0.12, -lr * 0.15);
      ctx.lineTo(0, -lr * 0.35);
      ctx.lineTo(lr * 0.12, -lr * 0.15);
      ctx.lineTo(lr * 0.22, lr * 0.35);
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = "${accentColor}";
      ctx.stroke();

    } else if (title.includes('plane') || title.includes('pesawat') || title.includes('airplane') || title.includes('jet') || title.includes('flight')) {
      // 24. AERO JET / AIRPLANE (Streamlined Fuselage, Swept Wings, Jet Thrusters)
      const pw = R * 1.45;
      const ph = R * 1.45;

      // Swept Wings (Locked rigidly across middle fuselage)
      ctx.beginPath();
      ctx.moveTo(0, -ph * 0.1);
      ctx.lineTo(pw * 0.52, ph * 0.22);
      ctx.lineTo(pw * 0.42, ph * 0.32);
      ctx.lineTo(-pw * 0.42, ph * 0.32);
      ctx.lineTo(-pw * 0.52, ph * 0.22);
      ctx.closePath();
      ctx.fillStyle = "${secondaryColor}";
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();

      // Main Aerodynamic Fuselage
      ctx.beginPath();
      ctx.moveTo(0, -ph * 0.55);
      ctx.bezierCurveTo(pw * 0.15, -ph * 0.25, pw * 0.15, ph * 0.35, 0, ph * 0.52);
      ctx.bezierCurveTo(-pw * 0.15, ph * 0.35, -pw * 0.15, -ph * 0.25, 0, -ph * 0.55);
      ctx.closePath();
      const jetGrad = ctx.createLinearGradient(-pw * 0.15, -ph * 0.55, pw * 0.15, ph * 0.52);
      jetGrad.addColorStop(0, '#ffffff');
      jetGrad.addColorStop(0.5, "${glowColor}");
      jetGrad.addColorStop(1, '#0f172a');
      ctx.fillStyle = jetGrad;
      ctx.fill();
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();

      // Cockpit Windshield
      ctx.beginPath();
      ctx.ellipse(0, -ph * 0.32, pw * 0.06, ph * 0.08, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#0f172a';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = "${accentColor}";
      ctx.stroke();

    } else if (title.includes('mic') || title.includes('mikrofon') || title.includes('podcast') || title.includes('broadcast')) {
      // 25. STUDIO BROADCAST MICROPHONE (Mesh Capsule, Metal Body, Tripod Stand)
      const mw = R * 0.65;
      const mh = R * 1.35;

      // Heavy Metal Base & Stand
      ctx.beginPath();
      ctx.moveTo(-mw * 0.65, mh * 0.48);
      ctx.lineTo(mw * 0.65, mh * 0.48);
      ctx.lineWidth = 10;
      ctx.strokeStyle = '#334155';
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(0, mh * 0.48);
      ctx.lineTo(0, mh * 0.08);
      ctx.lineWidth = 7;
      ctx.strokeStyle = '#64748b';
      ctx.stroke();

      // Mic Body & Mesh Capsule
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(-mw * 0.45, -mh * 0.45, mw * 0.90, mh * 0.52, 16);
      } else {
        ctx.rect(-mw * 0.45, -mh * 0.45, mw * 0.90, mh * 0.52);
      }
      const micGrad = ctx.createLinearGradient(-mw * 0.5, -mh * 0.45, mw * 0.5, mh * 0.07);
      micGrad.addColorStop(0, "${glowColor}");
      micGrad.addColorStop(0.5, "${secondaryColor}");
      micGrad.addColorStop(1, '#0f172a');
      ctx.fillStyle = micGrad;
      ctx.fill();
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();

      // Mesh Cross-Hatch Lines
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
      ctx.lineWidth = 1.5;
      for (let my = -mh * 0.38; my <= -mh * 0.05; my += 8) {
        ctx.beginPath();
        ctx.moveTo(-mw * 0.38, my);
        ctx.lineTo(mw * 0.38, my);
        ctx.stroke();
      }

    } else if (title.includes('book') || title.includes('buku') || title.includes('learn') || title.includes('study') || title.includes('belajar')) {
      // 26. OPEN KNOWLEDGE BOOK (Hardcover Spine, Curving Pages, Glowing Aura)
      const bkw = R * 1.35;
      const bkh = R * 0.95;

      // Hardcover Backing
      ctx.beginPath();
      ctx.moveTo(-bkw * 0.48, -bkh * 0.38);
      ctx.quadraticCurveTo(-bkw * 0.25, -bkh * 0.45, 0, -bkh * 0.32);
      ctx.quadraticCurveTo(bkw * 0.25, -bkh * 0.45, bkw * 0.48, -bkh * 0.38);
      ctx.lineTo(bkw * 0.45, bkh * 0.42);
      ctx.quadraticCurveTo(bkw * 0.25, bkh * 0.35, 0, bkh * 0.48);
      ctx.quadraticCurveTo(-bkw * 0.25, bkh * 0.35, -bkw * 0.45, bkh * 0.42);
      ctx.closePath();
      ctx.fillStyle = '#0f172a';
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = "${secondaryColor}";
      ctx.stroke();

      // Glowing Open Pages (Gentle flutter effect)
      ctx.beginPath();
      ctx.moveTo(-bkw * 0.42, -bkh * 0.32);
      ctx.quadraticCurveTo(-bkw * 0.22, -bkh * 0.38, 0, -bkh * 0.28);
      ctx.quadraticCurveTo(bkw * 0.22, -bkh * 0.38, bkw * 0.42, -bkh * 0.32);
      ctx.lineTo(bkw * 0.40, bkh * 0.36);
      ctx.quadraticCurveTo(bkw * 0.22, bkh * 0.30, 0, bkh * 0.40);
      ctx.quadraticCurveTo(-bkw * 0.22, bkh * 0.30, -bkw * 0.40, bkh * 0.36);
      ctx.closePath();
      const pageGrad = ctx.createLinearGradient(0, -bkh * 0.4, 0, bkh * 0.4);
      pageGrad.addColorStop(0, '#ffffff');
      pageGrad.addColorStop(1, "${glowColor}");
      ctx.fillStyle = pageGrad;
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();

    } else {
      // 27. MASTER HIGH-TECH GEOMETRIC CORE (Pristine Hexagonal Vector Emblem)
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

  // If AI generation did not return valid HTML, use rich procedural vector fallback
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
      console.error("[GenerateAnimation] Error:", err);
      res.status(500).json({ error: cleanErrorMessage(err) || "Gagal menghasilkan kode animasi" });
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
      console.error("[ImageToMotion] Error:", err);
      res.status(500).json({ error: cleanErrorMessage(err) || "Gagal menganalisa gambar dan membuat animasi" });
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
      console.error("[ImageToPrompt] Error:", err);
      res.status(500).json({ error: cleanErrorMessage(err) || "Gagal menganalisa gambar ke motion prompt" });
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

  return app;
}
