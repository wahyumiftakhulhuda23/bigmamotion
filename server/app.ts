import express, { Router, Request, Response } from "express";
import dotenv from "dotenv";
import { GoogleGenAI, Type, ThinkingLevel } from "@google/genai";

dotenv.config();

export function getClient(apiKey?: string) {
  const key = (apiKey && apiKey.trim().length > 0) ? apiKey.trim() : process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error("API Key tidak ditemukan. Mohon atur GEMINI_API_KEY di Secrets/Environment Variables atau masukkan API Key di menu Header.");
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
  if (m.includes("3.1-flash-lite") || m.includes("lite")) return "gemini-3.1-flash-lite";
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
  const fallbackOrder = ["gemini-2.5-flash", "gemini-3.1-flash-lite", "gemini-3.1-pro-preview"];
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

export function createApiRouter(): Router {
  const router = Router();

  // Health / Status Check
  router.get("/health", (_req: Request, res: Response) => {
    res.json({
      status: "ok",
      hasServerKey: !!process.env.GEMINI_API_KEY,
      defaultModel: "gemini-2.5-flash"
    });
  });

  // Test API Keys
  router.post("/gemini/test-keys", async (req: Request, res: Response) => {
    try {
      const { keys } = req.body;
      if (!Array.isArray(keys) || keys.length === 0) {
        return res.status(400).json({ error: "Daftar API key kosong" });
      }

      const results = await Promise.all(
        keys.map(async (rawKey: string) => {
          const key = (rawKey || "").trim();
          const maskedKey =
            key.length > 10
              ? `${key.substring(0, 6)}...${key.substring(key.length - 4)}`
              : key;
          const start = Date.now();

          if (!key) {
            return {
              key,
              maskedKey: "(kosong)",
              valid: false,
              error: "Key tidak boleh kosong",
              latencyMs: 0,
            };
          }

          if (!key.startsWith("AIza") && key.length < 25) {
            return {
              key,
              maskedKey,
              valid: false,
              error: "Format salah (umumnya diawali 'AIza...')",
              latencyMs: Date.now() - start,
            };
          }

          try {
            const ai = new GoogleGenAI({
              apiKey: key,
              httpOptions: { headers: { "User-Agent": "aistudio-build" } },
            });

            const countPromise = ai.models.countTokens({
              model: "gemini-2.5-flash",
              contents: "ping",
            });

            const timeoutPromise = new Promise((_, reject) =>
              setTimeout(() => reject(new Error("Timeout (koneksi lambat > 3.5s)")), 3500)
            );

            await Promise.race([countPromise, timeoutPromise]);
            return {
              key,
              maskedKey,
              valid: true,
              latencyMs: Date.now() - start,
            };
          } catch (e: any) {
            let msg = e.message || "Gagal verifikasi";
            if (msg.includes("API_KEY_INVALID") || msg.includes("API key not valid")) {
              msg = "API Key tidak valid atau salah";
            } else if (msg.includes("RESOURCE_EXHAUSTED") || msg.includes("429")) {
              msg = "Rate limit / kuota habis";
            } else if (msg.includes("PERMISSION_DENIED")) {
              msg = "Izin ditolak untuk project ini";
            }
            return {
              key,
              maskedKey,
              valid: false,
              error: msg,
              latencyMs: Date.now() - start,
            };
          }
        })
      );

      const validCount = results.filter((r) => r.valid).length;
      res.json({ results, validCount, total: keys.length });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Gagal menguji API key" });
    }
  });

  // Generate Microstock Prompts
  router.post("/gemini/generate-prompts", async (req: Request, res: Response) => {
    try {
      const { apiKey, model, type = "icon", subCategory = "teknologi", style = "minimalist", count = 3 } = req.body;
      const ai = getClient(apiKey);
      const targetModel = sanitizeModel(model);

      let typeInstruction = '';
      if (type === 'icon') {
        typeInstruction = 'Every prompt must describe 1 single central visual icon/symbol (no letters/text), sleek, modern and high precision.';
      } else if (type === 'text') {
        typeInstruction = "Every prompt must include a bold catchy main text slogan with glowing aura effects, particles, and energy lines.";
      } else if (type === 'bg') {
        typeInstruction = 'Every prompt must describe an elegant looping motion background concept (no text), harmonious gradients, particles or geometric waves.';
      }

      const promptContent = `Generate exactly ${count} concise, creative microstock animation prompts in English (5 to 8 words per prompt).
Category: ${subCategory}
Animation Type: ${String(type).toUpperCase()}
Visual Style: ${style}
Special Directive: ${typeInstruction}
Requirement: Focus strictly on the central geometric object, color palette (neon/glow/cyber/gold), and smooth motion.`;

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
          `Glowing neon ${subCategory} ${type} with smooth pulse`,
          `Dynamic cyber ${style} ${subCategory} animation loop`,
          `Minimalist geometric ${subCategory} motion with particle trails`,
        ];
      }

      res.json({ prompts: prompts.slice(0, count) });
    } catch (err: any) {
      console.error("Error generating prompts:", err);
      res.status(500).json({ error: cleanErrorMessage(err) || "Gagal menghasilkan prompt" });
    }
  });

  // Generate Single HTML5 Animation Code
  router.post("/gemini/generate-animation", async (req: Request, res: Response) => {
    try {
      const {
        apiKey,
        model,
        promptTopic,
        type = "icon",
        subCategory = "teknologi",
        style = "minimalist",
        index = 1,
        total = 1,
      } = req.body;

      if (!promptTopic) {
        return res.status(400).json({ error: "Prompt topic wajib diisi" });
      }

      const ai = getClient(apiKey);
      const targetModel = sanitizeModel(model);

      let typeInstructions = '';
      if (type === 'icon') {
        typeInstructions = `
ATURAN UTAMA ICON MOTION:
- Tampilkan 1 simbol/vektor sentral berpresisi tinggi yang merepresentasikan subjek secara akurat.
- DILARANG TEKS/HURUF. Gunakan bentuk geometris terstruktur (misal: perisai, cap kelulusan, roket, cloud, chart bar).`;
      } else if (type === 'text') {
        typeInstructions = `
ATURAN UTAMA TEXT EFFECT:
- Tampilkan Teks Utama yang tebal & terdistribusi rapi di tengah canvas.
- Tambahkan efek latar belakang & aura seperti glowing pulse, running highlight, atau partikel energi halus.`;
      } else if (type === 'bg') {
        typeInstructions = `
ATURAN UTAMA BACKGROUND MOTION:
- Animasi latar belakang bergerak penuh (motion background grid, flowing liquid mesh gradient, ambient bokeh, sinewaves).
- DILARANG TEKS/HURUF. Warna harmonis, mewah, dan bergerak dengan ritme konstan.`;
      }

      const systemPrompt = `Anda adalah Senior HTML5 Motion Designer Spesialis Microstock (Shutterstock/Envato Standard).
Tugas: Buat 1 file HTML animasi menggunakan Canvas 2D API & Vanilla JS.

KUALITAS VISUAL & TREN MODERN (MANDATORY):
1. BENTUK & GERAKAN AKURAT: Bentuk visual HARUS presisi sesuai deskripsi prompt. Gerakan HARUS halus menggunakan fungsi matematika (Math.sin, Math.cos, easing). DILARANG gerakan acak patah-patah!
2. POLISH VISUAL ELEGANKAN: Gunakan efek neon glow halus (ctx.shadowBlur = 15; ctx.shadowColor = 'rgba(...)'), gradien dinamis (createLinearGradient / createRadialGradient), dan partikel ambient lembut.
3. PALET WARNA TRENDY: Cyan Cyber (#00f3ff), Vibrant Violet (#a855f7), Emerald (#10b981), Warm Gold (#fbbf24), dengan background gelap eksklusif (#080c14).

ATURAN UKURAN KODE (ANTI TERPOTONG / ZERO MAX TOKENS ERROR):
- Tulis kode prosedural yang ringkas, bersih, modular, dan efisien (target 180 - 250 baris kode).
- WAJIB gunakan struktur boilerplate standar berikut tanpa mengubah skema canvas:

<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>
  body { margin: 0; padding: 0; overflow: hidden; background-color: #080c14; font-family: system-ui, sans-serif; }
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
  let w, h, cx, cy;
  
  function resize() {
    w = canvas.width = window.innerWidth;
    h = canvas.height = window.innerHeight;
    cx = w / 2;
    cy = h / 2;
  }
  window.addEventListener('resize', resize);
  resize();

  // --- INISIALISASI ELEMEN / PARTIKEL ---

  function animate(time) {
    const t = time * 0.001; // Detik untuk gerakan halus
    ctx.fillStyle = 'rgba(8, 12, 20, 0.25)'; // Trail halus
    ctx.fillRect(0, 0, w, h);

    // --- LOGIKA MENGGAMBAR ANIMASI PRESISI ---

    requestAnimationFrame(animate);
  }
  animate(0);
</script>
</body>
</html>

Brief Animasi:
- Subjek/Prompt: "${promptTopic}"
- Tipe Animasi: ${String(type).toUpperCase()}
- Kategori Niche: ${subCategory}
- Gaya Visual: ${style}

${typeInstructions}

Outputkan HANYA file HTML lengkap tanpa teks pembuka atau markdown lainnya:`;

      const { response } = await generateContentWithFallback(
        ai,
        targetModel,
        (currentModel) => {
          const animConfig: any = {
            temperature: 0.6,
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

      res.json({
        id: 'anim_' + Date.now() + Math.random().toString(36).substring(7),
        title: `${promptTopic.substring(0, 35)}... (${index}/${total})`,
        type,
        style,
        subCategory,
        html: cleanHTML
      });
    } catch (err: any) {
      console.error("Error generating animation:", err);
      res.status(500).json({ error: cleanErrorMessage(err) || "Gagal menghasilkan kode animasi" });
    }
  });

  return router;
}

export function createExpressApp() {
  const app = express();
  app.use(express.json({ limit: "10mb" }));

  const apiRouter = createApiRouter();
  // Support both /api/* and direct route matching for maximum deployment compatibility (Vercel & Express)
  app.use("/api", apiRouter);
  app.use("/", apiRouter);

  return app;
}
