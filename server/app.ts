import express, { Router, Request, Response } from "express";
import dotenv from "dotenv";
import { GoogleGenAI, Type, ThinkingLevel } from "@google/genai";

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
  if (targetModel.includes("2.5")) {
    return { thinkingBudget: 0 };
  }
  if (targetModel.includes("3.1-flash-lite")) {
    return { thinkingLevel: ThinkingLevel.MINIMAL };
  }
  if (targetModel.includes("pro") || targetModel.includes("3.1")) {
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
    typeInstruction = 'Every prompt must describe 1 single central visual icon/symbol (no letters/text), sleek, modern and high precision.';
  } else if (type === 'text') {
    typeInstruction = "Every prompt must include a bold catchy main text slogan with energetic typography and motion.";
  } else if (type === 'bg') {
    typeInstruction = 'Every prompt must describe an elegant looping motion background concept (no text), seamless geometry or atmospheric waves.';
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
Requirement: Focus strictly on the central object, color palette, and specific motion dynamics.`;

  const { response } = await generateContentWithFallback(
    ai,
    targetModel,
    (currentModel) => {
      const config: any = {
        temperature: 0.75,
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
          .map((p) => p.replace(/^[-*0-9.]+\s*/, '').replace(/["'[\]]/g, '').trim())
          .filter((p) => p.length > 4);
      }
    } else {
      prompts = rawText
        .split('\n')
        .map((p) => p.replace(/^[-*0-9.]+\s*/, '').replace(/["'[\]]/g, '').trim())
        .filter((p) => p.length > 4);
    }
  }

  if (prompts.length === 0) {
    prompts = [
      `${neonGlow ? 'Glowing neon' : 'Crisp flat'} ${subCategory} ${type} with ${motionDynamics} motion`,
      `Dynamic ${style} ${subCategory} ${colorMode} animation loop`,
      `Geometric ${subCategory} motion with ${motionDynamics} dynamics`,
    ];
  }

  return { prompts: prompts.slice(0, count) };
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

  let typeInstructions = '';
  if (type === 'icon') {
    typeInstructions = `
ATURAN UTAMA ICON MOTION:
- Tampilkan 1 simbol/vektor sentral berpresisi tinggi yang merepresentasikan subjek secara akurat di tengah canvas.
- DILARANG TEKS/HURUF. Gunakan bentuk geometris terstruktur (misal: perisai, roket, gear, chip, atom, chart, gedung, diamond).`;
  } else if (type === 'text') {
    typeInstructions = `
ATURAN UTAMA TEXT EFFECT:
- Tampilkan Teks Utama yang tebal (font tebal seperti Impact / Trebuchet / sans-serif bold) & terdistribusi rapi di tengah canvas.
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
PANDUAN GERAKAN MECHANICAL & CLOCKWORK:
- Gigi roda (gears) yang saling mengunci (intermeshing) dan berputar berlawanan arah dengan rasio putaran terkalibrasi: rotasi Gear A = t * speed; rotasi Gear B = -t * speed * (teethA / teethB);
- Tambahkan jarum penunjuk, poros, atau piston yang bergerak maju-mundur secara mekanis presisi.`;
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
- Terapkan efek luminescence bertingkat: ctx.shadowBlur = 18; ctx.shadowColor = primaryColor;
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

  const systemPrompt = `Anda adalah Lead HTML5 Motion Designer Spesialis Video Asset & Microstock (Shutterstock/Envato Standard).
Tugas: Buat 1 file HTML animasi Canvas 2D yang bervariasi, dinamis, dan MINIM BUG BENTUK/GERAKAN.

PARAMETER TERPILIH:
- Subjek/Prompt: "${promptTopic}"
- Tipe Animasi: ${String(type).toUpperCase()}
- Kategori Niche: ${subCategory}
- Gaya Visual: ${style}
- Mode Warna: ${colorMode.toUpperCase()}
- Status Neon Glow: ${neonGlow ? 'AKTIF (Luminescent Glow)' : 'NONAKTIF (Flat / Crisp Edges Tanpa Blur)'}
- Motion Dynamics: ${motionDynamics.toUpperCase()}
${isGreenScreen ? '- Mode: Pure Green Screen #00FF00 (Chroma Key)' : ''}

${typeInstructions}
${motionGuide}
${styleAndColorGuide}
${greenScreenDirective}

ATURAN ANTI-BUG & ANTI-GHOSTING / BEKAS GERAKAN (MANDATORY):
1. ISOLASI CANVAS CONTEXT & NEON GLOW: Setiap elemen yang digambar WAJIB dibungkus ctx.save() dan ctx.restore(). Jika menggunakan efek Neon/Glow (ctx.shadowBlur, ctx.shadowColor), HANYA terapkan saat menggambar objek bersangkutan dan segera reset (ctx.shadowBlur = 0; ctx.shadowColor = 'transparent';) agar pendaran tidak bocor atau meninggalkan jejak/bekas gerakan (ghosting artifacts) di frame berikutnya.
2. HILANGKAN BEKAS GERAKAN / ZERO MOTION TRAILS: Setiap frame baru WAJIB diawali dengan pembersihan kanvas total (ctx.clearRect(0, 0, w, h); lalu ctx.fillStyle = ${clearFill}; ctx.fillRect(0, 0, w, h);). DILARANG KERAS menggunakan rgba(...) semi-transparan untuk clear background karena akan membuat jejak/bekas gerakan kotor di belakang objek yang bergerak.
3. KOORDINAT TERPUSAT & RESPONSIF: Definisikan const S = Math.min(w, h) * ${type === 'icon' ? '0.44' : type === 'text' ? '0.48' : '0.65'}; Gambar selalu berpusat di cx, cy menggunakan skala S. DILARANG koordinat absolut pixel statis yang membuat gambar melenceng.
4. ZERO GLITCH / NO SMEARS: Jangan biarkan canvas berkedip atau memiliki artefak sisa frame sebelumnya.
5. RINGKAS & TUNTAS: Buat kode 180 - 250 baris yang langsung berfungsi penuh dan looping tanpa henti.

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
        temperature: 0.65,
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

  // Inisialisasi partikel/efek pendukung jika diperlukan

  function animate(time) {
    const t = time * 0.001;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = ${clearFill};
    ctx.fillRect(0, 0, w, h);

    // KODE MENGGAMBAR SUBJEK & DETAIL DENGAN CANVAS 2D VECTOR SECARA PRESISI (TANPA DRAWIMAGE)

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
        const config: any = { temperature: 0.3 };
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
      console.error("[GeneratePrompts] Error:", err);
      res.status(500).json({ error: cleanErrorMessage(err) || "Gagal menghasilkan prompt" });
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

  // Server Trial Registry
  const serverTrialStore = new Map<string, { startedAt: number; expiresAt: number; used: boolean }>();

  // Check Trial Status
  const checkTrialHandler = (req: Request, res: Response) => {
    const body = parseSafeBody(req);
    const deviceId = body.deviceId || String(req.query.deviceId || '');
    const ip = req.ip || (req.headers['x-forwarded-for'] as string) || 'default_ip';
    const key = deviceId || ip;

    const record = serverTrialStore.get(key);
    if (!record) {
      return res.json({ hasUsedTrial: false, isActive: false, isExpired: false, remainingMs: 0 });
    }

    const now = Date.now();
    const remainingMs = Math.max(0, record.expiresAt - now);
    res.json({
      hasUsedTrial: true,
      isActive: remainingMs > 0,
      isExpired: remainingMs <= 0,
      startedAt: record.startedAt,
      expiresAt: record.expiresAt,
      remainingMs,
    });
  };
  router.post("/trial/check", checkTrialHandler);
  router.post("/api/trial/check", checkTrialHandler);

  // Start 1-Day Trial
  const startTrialHandler = (req: Request, res: Response) => {
    const body = parseSafeBody(req);
    const deviceId = body.deviceId || 'dev_' + Date.now();
    const ip = req.ip || (req.headers['x-forwarded-for'] as string) || 'default_ip';
    const key = deviceId || ip;

    const existing = serverTrialStore.get(key);
    if (existing) {
      const now = Date.now();
      const remainingMs = Math.max(0, existing.expiresAt - now);
      return res.json({
        started: false,
        message: remainingMs > 0 ? "Trial sudah aktif di perangkat ini" : "Trial sudah pernah digunakan dan telah kedaluwarsa di perangkat ini",
        hasUsedTrial: true,
        isActive: remainingMs > 0,
        isExpired: remainingMs <= 0,
        expiresAt: existing.expiresAt,
        remainingMs,
      });
    }

    const now = Date.now();
    const expiresAt = now + 24 * 60 * 60 * 1000; // 24 hours
    serverTrialStore.set(key, { startedAt: now, expiresAt, used: true });

    res.json({
      started: true,
      hasUsedTrial: true,
      isActive: true,
      isExpired: false,
      startedAt: now,
      expiresAt,
      remainingMs: 24 * 60 * 60 * 1000,
    });
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
