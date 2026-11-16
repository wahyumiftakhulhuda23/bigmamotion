import express, { Router, Request, Response } from "express";
import dotenv from "dotenv";
import { GoogleGenAI, Type, ThinkingLevel } from "@google/genai";
import { findCategoryById, generateProceduralPrompts } from "../src/constants/categories";

dotenv.config();

export function getClient(apiKey?: string) {
  let key = (apiKey && apiKey.trim().length > 0) ? apiKey.trim() : process.env.GEMINI_API_KEY;
  if ((!key || key.toLowerCase() === "default" || key.toLowerCase() === "system") && process.env.GEMINI_API_KEY) {
    key = process.env.GEMINI_API_KEY.trim();
  }
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

// Server-side in-memory prompt history bank & unsupported-model short-circuit cache (5 min TTL)
const serverPromptHistoryBank = new Set<string>();
const unsupportedServerModels = new Map<string, number>();
const unsupportedServerThinkingModels = new Set<string>();

export function isServerModelCachedUnsupported(model: string): boolean {
  const ts = unsupportedServerModels.get(model);
  if (!ts) return false;
  if (Date.now() - ts > 5 * 60 * 1000) {
    unsupportedServerModels.delete(model);
    return false;
  }
  return true;
}

export function getSmartThinkingConfig(
  targetModel: string,
  budgetOrPurpose: number | 'prompt' | 'animation' | 'vision' = 'animation'
): any {
  const purpose = typeof budgetOrPurpose === 'string' ? budgetOrPurpose : (budgetOrPurpose >= 1024 ? 'vision' : 'prompt');
  const m = (targetModel || '').toLowerCase();
  if (unsupportedServerThinkingModels.has(m)) return undefined;

  // Gemini 2.5 series: uses numeric thinkingBudget (0 skips reasoning tokens completely for fast/cheap codegen)
  if (m.includes('2.5')) {
    return { thinkingBudget: purpose === 'vision' ? 256 : 0 };
  }

  // Gemini 3.1-Pro / 4.x Pro series: uses ThinkingLevel.LOW
  if (m.includes('3.1-pro') || m.includes('4-') || m.includes('thinking')) {
    return { thinkingLevel: ThinkingLevel.LOW };
  }

  // Gemini 3.x Flash & Flash-Lite series (3.1-flash-lite, 3.5-flash-lite, 3.6, 3.8):
  // MINIMAL for prompt/animation saves ~75-90% hidden thinking tokens; LOW for vision
  if (m.includes('3.8') || m.includes('3.6') || m.includes('3.5') || m.includes('3.1-flash-lite') || m.includes('flash-lite')) {
    return { thinkingLevel: purpose === 'vision' ? ThinkingLevel.LOW : ThinkingLevel.MINIMAL };
  }

  return undefined;
}

export function sanitizeModel(model?: string): string {
  if (!model) return "gemini-3.8-flash";
  const m = model.trim().toLowerCase();
  if (m.includes("3.8") || m === "gemini-3.8-flash") return "gemini-3.8-flash";
  // Transparent mapping: Google v1beta uses gemini-3.8-flash or gemini-3.5-flash-lite for next-gen flash
  if (m.includes("3.6") || m === "gemini-3.6-flash") return "gemini-3.8-flash";
  if (m.includes("3.5")) return "gemini-3.5-flash-lite";
  if (m.includes("3.1-flash-lite") || m.includes("flash-lite") || m.includes("lite")) return "gemini-3.1-flash-lite";
  if (m.includes("2.5-flash-lite")) return "gemini-2.5-flash-lite";
  if (m.includes("2.5") || m === "gemini-2.5-flash") return "gemini-2.5-flash";
  if (m.includes("3.1-pro") || m.includes("pro")) return "gemini-3.1-pro-preview";
  if (m === "gemini-flash-latest") return "gemini-flash-latest";
  return "gemini-3.8-flash";
}

export function cleanErrorMessage(err: any): string {
  if (!err) return "Terjadi kesalahan tidak diketahui";
  if (typeof err === "string") {
    try {
      const jsonMatch = err.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed?.error?.message) return parsed.error.message;
      }
    } catch {}
    return err;
  }
  if (typeof err.message === "string" && err.message) {
    try {
      const jsonMatch = err.message.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed?.error?.message) return parsed.error.message;
      }
    } catch {}
    return err.message;
  }
  if (typeof err.error === "string" && err.error) return err.error;
  if (typeof err.error?.message === "string" && err.error.message) return err.error.message;
  try {
    const raw = JSON.stringify(err);
    if (raw && raw !== '{}') {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed?.error?.message) return parsed.error.message;
      }
      return raw;
    }
  } catch {}
  return String(err?.message || err || "Terjadi kesalahan tidak diketahui");
}

export function getServerModelTimeoutMs(model: string): number {
  const m = sanitizeModel(model).toLowerCase();
  if (m.includes("3.1-pro") || m.includes("4-")) return 40000;
  if (m.includes("3.8") || m.includes("3.6")) return 34000;
  if (m.includes("2.5-flash-lite") || m.includes("3.1-flash-lite")) return 24000;
  if (m.includes("3.5-flash-lite")) return 26000;
  return 26000;
}

export function getServerModelRetryWaitMs(model: string): number {
  const m = sanitizeModel(model).toLowerCase();
  if (m.includes("3.1-pro") || m.includes("4-")) return 1100;
  if (m.includes("3.8") || m.includes("3.6")) return 850;
  if (m.includes("2.5-flash-lite") || m.includes("3.1-flash-lite")) return 350;
  if (m.includes("3.5-flash-lite")) return 500;
  return 650;
}

export async function generateContentWithFallback(
  ai: GoogleGenAI,
  primaryModel: string,
  generateParams: (model: string) => { contents: any; config?: any },
  maxRetriesPerModel = 1
): Promise<{ response: any; usedModel: string }> {
  const startedAt = Date.now();
  const VERCEL_SAFE_BUDGET_MS = 52000; // Leave 8s headroom below Vercel maxDuration: 60s

  // Put high-RPM lite models first in fallback chain, skipping any model recently cached as unsupported (404)
  const fallbackOrder = [
    "gemini-3.5-flash-lite",
    "gemini-3.1-flash-lite",
    "gemini-2.5-flash-lite",
    "gemini-2.5-flash",
    "gemini-flash-latest",
    "gemini-3.8-flash",
  ];
  const candidateModels = Array.from(new Set([
    primaryModel,
    ...fallbackOrder,
  ]))
    .filter((m) => !isServerModelCachedUnsupported(m))
    .slice(0, 3);

  const modelsToTry = candidateModels.length > 0 ? candidateModels : ["gemini-3.5-flash-lite", "gemini-2.5-flash-lite"];
  let lastError: any = null;

  for (const model of modelsToTry) {
    const allowedAttempts = maxRetriesPerModel;

    for (let attempt = 1; attempt <= allowedAttempts; attempt++) {
      const remainingBudget = VERCEL_SAFE_BUDGET_MS - (Date.now() - startedAt);
      if (remainingBudget < 5000) {
        throw new Error(cleanErrorMessage(lastError) || "Batas waktu aman server Vercel tercapai — mencoba model lebih cepat pada request berikutnya");
      }
      const modelTimeoutMs = Math.min(getServerModelTimeoutMs(model), remainingBudget);

      try {
        let timerId: any = null;
        const timeoutPromise = new Promise((_, reject) => {
          timerId = setTimeout(
            () => reject(new Error(`Timeout ${model} (> ${Math.round(modelTimeoutMs / 1000)}s)`)),
            modelTimeoutMs
          );
        });

        const { contents, config } = generateParams(model);
        const genPromise = ai.models.generateContent({
          model,
          contents,
          config,
        });

        try {
          const response: any = await Promise.race([genPromise, timeoutPromise]);
          return { response, usedModel: model };
        } finally {
          if (timerId) clearTimeout(timerId);
        }
      } catch (err: any) {
        lastError = err;
        const msg = cleanErrorMessage(err).toLowerCase();

        // Fail fast on invalid/unauthorized key — NEVER burn fallback models with a bad key
        const isAuthError =
          msg.includes("api_key_invalid") ||
          msg.includes("api key not valid") ||
          msg.includes("key is not valid") ||
          msg.includes("invalid api key") ||
          msg.includes("api_key_expired") ||
          msg.includes("unauthenticated") ||
          msg.includes("permission_denied") ||
          msg.includes("401") ||
          msg.includes("403");
        if (isAuthError) {
          throw new Error(cleanErrorMessage(err));
        }

        // Only retry same model without thinkingConfig if the error is specifically about thinking/budget/config argument
        const isConfigIssue =
          msg.includes("thinking") ||
          msg.includes("budget") ||
          msg.includes("invalid_argument") ||
          msg.includes("unsupported field");
        if (isConfigIssue) {
          try {
            const { contents, config } = generateParams(model);
            if (config && config.thinkingConfig) {
              unsupportedServerThinkingModels.add(model.toLowerCase());
              const safeConfig = { ...config };
              delete safeConfig.thinkingConfig;
              const retryRemaining = VERCEL_SAFE_BUDGET_MS - (Date.now() - startedAt);
              if (retryRemaining >= 5000) {
                const retryTimeoutMs = Math.min(Math.max(12000, getServerModelTimeoutMs(model) - 4000), retryRemaining);
                let retryTimer: any = null;
                const retryTimeout = new Promise((_, reject) => {
                  retryTimer = setTimeout(() => reject(new Error(`Timeout Retry (> ${Math.round(retryTimeoutMs / 1000)}s)`)), retryTimeoutMs);
                });
                try {
                  const retryResp: any = await Promise.race([
                    ai.models.generateContent({
                      model,
                      contents,
                      config: safeConfig,
                    }),
                    retryTimeout,
                  ]);
                  return { response: retryResp, usedModel: model };
                } finally {
                  if (retryTimer) clearTimeout(retryTimer);
                }
              }
            }
          } catch {
            // proceed to next fallback model
          }
        }

        const isNotFound =
          msg.includes("not found") ||
          msg.includes("404") ||
          msg.includes("not supported") ||
          msg.includes("unrecognized") ||
          msg.includes("proxy_generation_disabled") ||
          msg.includes("is not found");

        if (isNotFound) {
          unsupportedServerModels.set(model, Date.now());
          break;
        }

        const isQuota =
          msg.includes("quota") ||
          msg.includes("exceeded") ||
          msg.includes("resource_exhausted") ||
          msg.includes("429") ||
          msg.includes("billing");

        const isTransient =
          msg.includes("504") ||
          msg.includes("502") ||
          msg.includes("timeout") ||
          msg.includes("network") ||
          msg.includes("high demand") ||
          msg.includes("unavailable");

        if (isQuota || msg.includes("500") || msg.includes("overloaded") || msg.includes("503") || msg.includes("internal")) {
          // Model-specific breather before switching fallback model so Google burst subsides
          const left = VERCEL_SAFE_BUDGET_MS - (Date.now() - startedAt);
          if (left > 8000) {
            await new Promise((res) => setTimeout(res, getServerModelRetryWaitMs(model)));
          }
          break;
        } else if (isTransient && attempt < allowedAttempts) {
          await new Promise((res) => setTimeout(res, Math.min(1400, getServerModelRetryWaitMs(model) * attempt)));
          continue;
        } else {
          break;
        }
      }
    }
  }

  throw new Error(cleanErrorMessage(lastError));
}

function stripLeadingCodeFenceAndLang(raw: string): string {
  const tick3 = String.fromCharCode(96, 96, 96);
  let text = (raw || '').trim();
  const fenceRegex = new RegExp(tick3 + '(?:[a-zA-Z0-9_-]+)?\\s*([\\s\\S]*?)' + tick3, 'i');
  const fenceMatch = text.match(fenceRegex);
  if (fenceMatch && fenceMatch[1]) {
    text = fenceMatch[1].trim();
  }
  text = text
    .replace(new RegExp('^' + tick3 + '(?:[a-zA-Z0-9_-]+)?\\s*', 'i'), '')
    .replace(new RegExp(tick3 + '\\s*$'), '')
    .trim();
  text = text.replace(/^(?:javascript|typescript|jsx?|tsx?|html)\s*(?:\r?\n|$)/i, '').trim();
  return text;
}

function sanitizeInjectedJsBody(rawJs: string): string {
  let js = stripLeadingCodeFenceAndLang(rawJs);
  js = js
    .replace(/^[ \t]*(?:const|let|var)\s+canvas\s*=\s*document\.(?:getElementById|querySelector)\s*\([^)]*\)\s*;?[ \t]*$/gm, '')
    .replace(/^[ \t]*(?:const|let|var)\s+ctx\s*=\s*(?:canvas|document\.(?:getElementById|querySelector)\s*\([^)]*\))\.getContext\s*\([^)]*\)\s*;?[ \t]*$/gm, '')
    .replace(/^[ \t]*window\.addEventListener\s*\(\s*['"]resize['"][^)]*\)\s*;?[ \t]*$/gm, '')
    .replace(/^[ \t]*(?:resize|init)\s*\(\s*\)\s*;?[ \t]*$/gm, '')
    .replace(/^[ \t]*requestAnimationFrame\s*\(\s*animate\s*\)\s*;?[ \t]*$/gm, '')
    .trim();
  js = js.replace(/^(?:const|let)\s+(canvas|ctx|dpr|w|h|cx|cy|S|G)\b/gm, 'var $1');
  return js.trim();
}

const STUDIO_GEOMETRY_ENGINE_JS = `
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.miterLimit = 2;
    (function(){
      var _arc = ctx.arc.bind(ctx);
      ctx.arc = function(x, y, r, sa, ea, ccw) {
        return _arc(isFinite(x)?x:0, isFinite(y)?y:0, Math.max(0.1, Math.abs(isFinite(r)?r:0)), isFinite(sa)?sa:0, isFinite(ea)?ea:Math.PI*2, !!ccw);
      };
      if (ctx.ellipse) {
        var _ell = ctx.ellipse.bind(ctx);
        ctx.ellipse = function(x, y, rx, ry, rot, sa, ea, ccw) {
          return _ell(isFinite(x)?x:0, isFinite(y)?y:0, Math.max(0.1, Math.abs(isFinite(rx)?rx:0)), Math.max(0.1, Math.abs(isFinite(ry)?ry:0)), isFinite(rot)?rot:0, isFinite(sa)?sa:0, isFinite(ea)?ea:Math.PI*2, !!ccw);
        };
      }
      if (ctx.roundRect) {
        var _rr = ctx.roundRect.bind(ctx);
        ctx.roundRect = function(x, y, rw, rh, rad) {
          var aw = Math.abs(isFinite(rw)?rw:0), ah = Math.abs(isFinite(rh)?rh:0);
          var rx = rw < 0 ? x + rw : x, ry = rh < 0 ? y + rh : y;
          var sr = Array.isArray(rad) ? rad.map(function(v){ return Math.max(0, isFinite(v)?v:0); }) : Math.max(0, isFinite(rad)?rad:0);
          return _rr(isFinite(rx)?rx:0, isFinite(ry)?ry:0, aw, ah, sr);
        };
      }
    })();
    var __bigmaT = 0;
    var __bigmaV = 0;
    var G = {
      _n: function(v, d) { return (typeof v === 'number' && isFinite(v)) ? v : (d || 0); },
      _t: function(t) { return (typeof t === 'number' && isFinite(t)) ? t : (typeof __bigmaT === 'number' ? __bigmaT : 0); },
      _v: function(v) {
        var n = (typeof v === 'number' && isFinite(v)) ? v : (typeof __bigmaV === 'number' && isFinite(__bigmaV) ? __bigmaV : 0);
        return Math.abs(Math.floor(n)) % 4;
      },
      _rt: function(rimCol, t, defRim) {
        if (typeof rimCol === 'number') return { r: defRim || '#f8fafc', t: G._t(rimCol) };
        return { r: rimCol || defRim || '#f8fafc', t: G._t(t) };
      },
      _c: function(c) {
        if (!c || typeof c !== 'string' || typeof __bigmaGS === 'undefined' || !__bigmaGS) return c;
        var s = c.trim().toLowerCase();
        if (s.indexOf('rgba(') === 0 || s.indexOf('rgb(') === 0) {
          var p = s.slice(s.indexOf('(') + 1).split(',');
          var rr = parseInt(p[0], 10), gg = parseInt(p[1], 10), bb = parseInt(p[2], 10);
          if (!isNaN(rr) && !isNaN(gg) && !isNaN(bb)) {
            if (gg > rr + 45 && gg > bb + 45) return '#00E5FF';
            return 'rgb(' + rr + ',' + gg + ',' + bb + ')';
          }
          return '#38BDF8';
        }
        if (s.indexOf('hsla(') === 0) return '#38BDF8';
        if (s.charAt(0) === '#' && (s.length === 4 || s.length === 7)) {
          var hx = s.length === 4 ? s[1]+s[1]+s[2]+s[2]+s[3]+s[3] : s.slice(1);
          var r2 = parseInt(hx.slice(0,2),16), g2 = parseInt(hx.slice(2,4),16), b2 = parseInt(hx.slice(4,6),16);
          if (!isNaN(r2) && !isNaN(g2) && !isNaN(b2) && g2 > r2 + 45 && g2 > b2 + 45) return '#00E5FF';
        }
        if (s === 'green' || s === 'lime' || s === 'limegreen' || s === 'springgreen' || s === 'chartreuse') return '#00E5FF';
        return c;
      },
      grad: function(c1, c2, c3, x0, y0, x1, y1) {
        var gx0 = x0, gy0 = y0, gx1 = x1, gy1 = y1, mid = c3;
        if (typeof c3 === 'number') { gx0 = c3; gy0 = x0; gx1 = y0; gy1 = x1; mid = null; }
        if (typeof gx0 !== 'number' || !isFinite(gx0)) gx0 = -100;
        if (typeof gy0 !== 'number' || !isFinite(gy0)) gy0 = -100;
        if (typeof gx1 !== 'number' || !isFinite(gx1)) gx1 = 100;
        if (typeof gy1 !== 'number' || !isFinite(gy1)) gy1 = 100;
        if (gx0 === gx1 && gy0 === gy1) { gx1 = gx0 + 1; gy1 = gy0 + 1; }
        var g = ctx.createLinearGradient(gx0, gy0, gx1, gy1);
        var sc1 = G._c(c1 || '#ffffff'), sc2 = G._c(c2 || c1 || '#888888');
        g.addColorStop(0, sc1);
        if (mid) { g.addColorStop(0.52, sc2); g.addColorStop(1, G._c(mid)); }
        else { g.addColorStop(1, sc2); }
        return g;
      },
      box: function(x, y, bw, bh, r, fill, rim, lw) {
        x = G._n(x); y = G._n(y);
        bw = Math.max(1, Math.abs(G._n(bw, 1))); bh = Math.max(1, Math.abs(G._n(bh, 1)));
        var rr = Math.min(Math.max(0, G._n(r, 0)), bw * 0.49, bh * 0.49);
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(x - bw / 2, y - bh / 2, bw, bh, rr);
        else ctx.rect(x - bw / 2, y - bh / 2, bw, bh);
        if (fill) { ctx.fillStyle = G._c(fill); ctx.fill(); }
        if (rim) { ctx.strokeStyle = G._c(rim); ctx.lineWidth = Math.max(0.5, G._n(lw, 1.5)); ctx.stroke(); }
      },
      bar: function(x, yBase, bw, bh, r, fill, rim, lw) {
        x = G._n(x); yBase = G._n(yBase);
        bw = Math.max(1, Math.abs(G._n(bw, 1))); bh = Math.max(1, Math.abs(G._n(bh, 1)));
        G.box(x, yBase - bh * 0.5, bw, bh, r, fill, rim, lw);
      },
      capsule: function(x, y, bw, bh, fill, rim, lw) {
        bw = Math.max(1, Math.abs(G._n(bw, 1))); bh = Math.max(1, Math.abs(G._n(bh, 1)));
        G.box(x, y, bw, bh, Math.min(bw, bh) * 0.5, fill, rim, lw);
      },
      disc: function(x, y, r, fill, rim, lw) {
        x = G._n(x); y = G._n(y); r = Math.max(0.5, Math.abs(G._n(r, 1)));
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
        if (fill) { ctx.fillStyle = G._c(fill); ctx.fill(); }
        if (rim) { ctx.strokeStyle = G._c(rim); ctx.lineWidth = Math.max(0.5, G._n(lw, 1.5)); ctx.stroke(); }
      },
      oval: function(x, y, rx, ry, rot, fill, rim, lw) {
        if (typeof rot === 'string' || (rot && typeof rot === 'object')) { lw = rim; rim = fill; fill = rot; rot = 0; }
        x = G._n(x); y = G._n(y);
        rx = Math.max(0.5, Math.abs(G._n(rx, 1))); ry = Math.max(0.5, Math.abs(G._n(ry, rx)));
        ctx.beginPath();
        if (ctx.ellipse) ctx.ellipse(x, y, rx, ry, G._n(rot, 0), 0, Math.PI * 2);
        else ctx.arc(x, y, (rx + ry) * 0.5, 0, Math.PI * 2);
        if (fill) { ctx.fillStyle = G._c(fill); ctx.fill(); }
        if (rim) { ctx.strokeStyle = G._c(rim); ctx.lineWidth = Math.max(0.5, G._n(lw, 1.5)); ctx.stroke(); }
      },
      ring: function(x, y, r, thick, a0, a1, col) {
        x = G._n(x); y = G._n(y); r = Math.max(0.5, Math.abs(G._n(r, 1)));
        ctx.beginPath(); ctx.arc(x, y, r, a0 != null ? G._n(a0) : 0, a1 != null ? G._n(a1, Math.PI * 2) : Math.PI * 2);
        ctx.strokeStyle = G._c(col || '#ffffff'); ctx.lineWidth = Math.max(1, Math.abs(G._n(thick, 2))); ctx.stroke();
      },
      poly: function(pts, fill, rim, lw, close) {
        if (!pts || pts.length < 2) return;
        ctx.beginPath(); ctx.moveTo(G._n(pts[0][0]), G._n(pts[0][1]));
        for (var i = 1; i < pts.length; i++) ctx.lineTo(G._n(pts[i][0]), G._n(pts[i][1]));
        if (close !== false) ctx.closePath();
        if (fill) { ctx.fillStyle = G._c(fill); ctx.fill(); }
        if (rim) { ctx.strokeStyle = G._c(rim); ctx.lineWidth = Math.max(0.5, G._n(lw, 1.5)); ctx.stroke(); }
      },
      ngon: function(x, y, r, n, rot, fill, rim, lw) {
        if (typeof rot === 'string' || (rot && typeof rot === 'object')) { lw = rim; rim = fill; fill = rot; rot = -Math.PI / 2; }
        x = G._n(x); y = G._n(y); r = Math.max(1, Math.abs(G._n(r, 1))); n = Math.max(3, Math.floor(G._n(n, 6)));
        var a0 = (typeof rot === 'number' && isFinite(rot)) ? rot : -Math.PI / 2, pts = [];
        for (var i = 0; i < n; i++) { var a = a0 + (i * Math.PI * 2) / n; pts.push([x + Math.cos(a) * r, y + Math.sin(a) * r]); }
        G.poly(pts, fill, rim, lw, true);
      },
      star: function(x, y, ro, ri, n, rot, fill, rim, lw) {
        if (typeof rot === 'string' || (rot && typeof rot === 'object')) { lw = rim; rim = fill; fill = rot; rot = -Math.PI / 2; }
        x = G._n(x); y = G._n(y); ro = Math.max(1, Math.abs(G._n(ro, 1))); ri = Math.max(0.5, Math.abs(G._n(ri, ro * 0.45))); n = Math.max(3, Math.floor(G._n(n, 5)));
        var a0 = (typeof rot === 'number' && isFinite(rot)) ? rot : -Math.PI / 2, pts = [];
        for (var i = 0; i < n * 2; i++) { var rr = i % 2 === 0 ? ro : ri; var a = a0 + (i * Math.PI) / n; pts.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr]); }
        G.poly(pts, fill, rim, lw, true);
      },
      pill: function(x1, y1, x2, y2, thick, col) {
        ctx.beginPath(); ctx.moveTo(G._n(x1), G._n(y1)); ctx.lineTo(G._n(x2), G._n(y2));
        ctx.strokeStyle = G._c(col || '#ffffff'); ctx.lineWidth = Math.max(1, Math.abs(G._n(thick, 4))); ctx.lineCap = 'round'; ctx.stroke();
      },
      arrow: function(x1, y1, x2, y2, thick, headLen, col) {
        x1 = G._n(x1); y1 = G._n(y1); x2 = G._n(x2); y2 = G._n(y2);
        var dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy);
        if (len < 2) return;
        var ux = dx / len, uy = dy / len, hl = Math.min(len * 0.55, Math.max(6, Math.abs(G._n(headLen, 14))));
        var sw = Math.max(1.5, Math.abs(G._n(thick, 4))), sx2 = x2 - ux * hl * 0.72, sy2 = y2 - uy * hl * 0.72;
        G.pill(x1, y1, sx2, sy2, sw, col || '#ffffff');
        var px = -uy * hl * 0.55, py = ux * hl * 0.55, bx = x2 - ux * hl, by = y2 - uy * hl;
        G.poly([[x2, y2], [bx + px, by + py], [bx - px, by - py]], col || '#ffffff', null, 0, true);
      },
      person: function(x, y, s, bodyCol, headCol, rimCol) {
        x = G._n(x); y = G._n(y); s = Math.max(12, Math.abs(G._n(s, 40)));
        var lw = Math.max(1.2, s * 0.05);
        G.box(x, y + s * 0.34, s * 0.92, s * 0.56, s * 0.28, bodyCol || '#1e293b', rimCol || null, lw);
        G.disc(x, y - s * 0.24, s * 0.27, headCol || bodyCol || '#38bdf8', rimCol || null, lw);
      },
      check: function(x, y, s, thick, col) {
        x = G._n(x); y = G._n(y); s = Math.max(6, Math.abs(G._n(s, 14)));
        ctx.beginPath();
        ctx.moveTo(x - s * 0.42, y + s * 0.04);
        ctx.lineTo(x - s * 0.08, y + s * 0.38);
        ctx.lineTo(x + s * 0.48, y - s * 0.32);
        ctx.strokeStyle = G._c(col || '#ffffff');
        ctx.lineWidth = Math.max(1.5, Math.abs(G._n(thick, s * 0.22)));
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke();
      },
      pie: function(x, y, r, a0, sweep, sliceCol, baseCol, rimCol) {
        x = G._n(x); y = G._n(y); r = Math.max(2, Math.abs(G._n(r, 16)));
        G.disc(x, y, r, baseCol || '#334155', rimCol || '#ffffff', Math.max(1, r * 0.08));
        var sa = G._n(a0, -Math.PI / 2), sw = Math.max(0.25, Math.min(Math.PI * 1.92, Math.abs(G._n(sweep, Math.PI * 0.7))));
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.arc(x, y, Math.max(1, r - 1), sa, sa + sw);
        ctx.closePath();
        ctx.fillStyle = G._c(sliceCol || '#f43f5e');
        ctx.fill();
      },
      rays: function(x, y, rIn, rOut, n, rot, thick, col) {
        x = G._n(x); y = G._n(y);
        var ri = Math.max(1, Math.abs(G._n(rIn, 12))), ro = Math.max(ri + 2, Math.abs(G._n(rOut, 22)));
        var cnt = Math.max(3, Math.floor(G._n(n, 6))), a0 = G._n(rot, -Math.PI / 2);
        for (var i = 0; i < cnt; i++) {
          var a = a0 + (i * Math.PI * 2) / cnt;
          G.pill(x + Math.cos(a) * ri, y + Math.sin(a) * ri, x + Math.cos(a) * ro, y + Math.sin(a) * ro, thick || 3, col || '#ffd700');
        }
      },
      handshake: function(x, y, s, colL, colR, handCol, cuffCol, rimCol) {
        x = G._n(x); y = G._n(y); s = Math.max(18, Math.abs(G._n(s, 72)));
        var lw = Math.max(1.5, s * 0.035), rim = rimCol || '#0f172a', cuff = cuffCol || '#f8fafc', palm = handCol || '#f59e0b';
        G.part(x, y, -0.40, 1, 1, function() {
          G.box(-s * 0.56, s * 0.04, s * 0.58, s * 0.30, s * 0.06, colL || '#0284c7', rim, lw);
          G.box(-s * 0.28, s * 0.04, s * 0.13, s * 0.32, s * 0.03, cuff, rim, lw);
        });
        G.part(x, y, 0.40, 1, 1, function() {
          G.box(s * 0.56, s * 0.04, s * 0.58, s * 0.30, s * 0.06, colR || '#4f46e5', rim, lw);
          G.box(s * 0.28, s * 0.04, s * 0.13, s * 0.32, s * 0.03, cuff, rim, lw);
        });
        G.oval(x + s * 0.05, y + s * 0.02, s * 0.24, s * 0.17, 0.35, palm, rim, lw);
        G.oval(x - s * 0.05, y - s * 0.01, s * 0.24, s * 0.17, -0.35, palm, rim, lw);
        G.capsule(x - s * 0.02, y - s * 0.14, s * 0.22, s * 0.10, palm, rim, lw);
        G.part(x + s * 0.02, y + s * 0.09, -0.52, 1, 1, function() {
          G.capsule(-s * 0.09, 0, s * 0.08, s * 0.19, palm, rim, lw);
          G.capsule(0, s * 0.01, s * 0.08, s * 0.20, palm, rim, lw);
          G.capsule(s * 0.09, 0, s * 0.08, s * 0.18, palm, rim, lw);
        });
      },
      shield: function(x, y, s, fillCol, rimCol, innerCol) {
        x = G._n(x); y = G._n(y); s = Math.max(18, Math.abs(G._n(s, 72)));
        var lw = Math.max(1.5, s * 0.045), rim = rimCol || '#f8fafc', w2 = s * 0.44, hTop = s * 0.48, hBot = s * 0.54;
        ctx.beginPath();
        ctx.moveTo(x, y - hTop);
        ctx.lineTo(x + w2, y - hTop * 0.68);
        ctx.quadraticCurveTo(x + w2, y + hBot * 0.35, x, y + hBot);
        ctx.quadraticCurveTo(x - w2, y + hBot * 0.35, x - w2, y - hTop * 0.68);
        ctx.closePath();
        ctx.fillStyle = G._c(fillCol || '#4f46e5');
        ctx.fill();
        ctx.strokeStyle = G._c(rim);
        ctx.lineWidth = lw;
        ctx.stroke();
        if (innerCol) {
          G.shield(x, y, s * 0.72, innerCol, null, null);
        }
      },
      cart: function(x, y, s, bodyCol, wheelCol, rimCol) {
        x = G._n(x); y = G._n(y); s = Math.max(24, Math.abs(G._n(s, 76)));
        var lw = Math.max(2, s * 0.055), rim = rimCol || '#f8fafc', bCol = bodyCol || '#0284c7', wCol = wheelCol || '#ffd700';
        ctx.beginPath();
        ctx.moveTo(x - s * 0.56, y - s * 0.36);
        ctx.lineTo(x - s * 0.38, y - s * 0.36);
        ctx.lineTo(x - s * 0.24, y + s * 0.24);
        ctx.lineTo(x + s * 0.40, y + s * 0.24);
        ctx.strokeStyle = G._c(rim);
        ctx.lineWidth = lw * 1.15;
        ctx.stroke();
        G.poly([[x - s * 0.35, y - s * 0.24], [x + s * 0.48, y - s * 0.24], [x + s * 0.36, y + s * 0.14], [x - s * 0.26, y + s * 0.14]], bCol, rim, lw, true);
        G.pill(x - s * 0.14, y - s * 0.14, x - s * 0.10, y + s * 0.05, lw * 0.85, rim);
        G.pill(x + s * 0.06, y - s * 0.14, x + s * 0.05, y + s * 0.05, lw * 0.85, rim);
        G.pill(x + s * 0.26, y - s * 0.14, x + s * 0.21, y + s * 0.05, lw * 0.85, rim);
        G.disc(x - s * 0.18, y + s * 0.34, s * 0.10, wCol, rim, lw * 0.9);
        G.disc(x + s * 0.30, y + s * 0.34, s * 0.10, wCol, rim, lw * 0.9);
      },
      megaphone: function(x, y, s, coneCol, handleCol, accentCol, rimCol) {
        x = G._n(x); y = G._n(y); s = Math.max(22, Math.abs(G._n(s, 72)));
        var lw = Math.max(1.8, s * 0.045), rim = rimCol || '#f8fafc';
        G.poly([[x - s * 0.26, y + s * 0.08], [x - s * 0.10, y + s * 0.08], [x - s * 0.16, y + s * 0.44], [x - s * 0.30, y + s * 0.44]], handleCol || '#1e293b', rim, lw, true);
        G.box(x - s * 0.36, y - s * 0.02, s * 0.14, s * 0.22, s * 0.05, accentCol || '#38bdf8', rim, lw);
        G.poly([[x - s * 0.30, y - s * 0.14], [x + s * 0.34, y - s * 0.38], [x + s * 0.34, y + s * 0.34], [x - s * 0.30, y + s * 0.10]], coneCol || '#f97316', rim, lw, true);
        G.capsule(x + s * 0.35, y - s * 0.02, s * 0.10, s * 0.74, accentCol || '#ffd700', rim, lw);
      },
      wallet: function(x, y, s, bodyCol, flapCol, claspCol, rimCol) {
        x = G._n(x); y = G._n(y); s = Math.max(22, Math.abs(G._n(s, 76)));
        var lw = Math.max(1.8, s * 0.042), rim = rimCol || '#f8fafc';
        G.box(x, y, s * 0.94, s * 0.64, s * 0.12, bodyCol || '#1e293b', rim, lw);
        G.box(x - s * 0.02, y - s * 0.10, s * 0.88, s * 0.28, s * 0.08, flapCol || '#4f46e5', rim, lw * 0.8);
        G.box(x + s * 0.26, y + s * 0.04, s * 0.36, s * 0.22, s * 0.07, claspCol || '#f59e0b', rim, lw);
        G.disc(x + s * 0.20, y + s * 0.04, s * 0.055, '#ffffff', rim, lw * 0.65);
      },
      globe: function(x, y, r, sphereCol, lineCol, rimCol) {
        x = G._n(x); y = G._n(y); r = Math.max(10, Math.abs(G._n(r, 34)));
        var lw = Math.max(1.5, r * 0.085), lCol = lineCol || '#38bdf8', rCol = rimCol || '#f8fafc';
        G.disc(x, y, r, sphereCol || '#0284c7', null, 0);
        ctx.save();
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.clip();
        G.pill(x - r, y, x + r, y, lw, lCol);
        G.pill(x - r, y - r * 0.44, x + r, y - r * 0.44, lw * 0.85, lCol);
        G.pill(x - r, y + r * 0.44, x + r, y + r * 0.44, lw * 0.85, lCol);
        G.pill(x, y - r, x, y + r, lw, lCol);
        G.oval(x, y, r * 0.48, r, 0, null, lCol, lw);
        ctx.restore();
        G.ring(x, y, r, lw * 1.15, 0, Math.PI * 2, rCol);
      },
      uiLayout: function(x, y, s, frameCol, headerCol, accentCol, rimCol, t, v) {
        x = G._n(x); y = G._n(y); s = Math.max(24, Math.abs(G._n(s, 76)));
        var rt = G._rt(rimCol, t), rim = rt.r, tt = rt.t, lw = Math.max(1.8, s * 0.032), vv = G._v(v);
        var fc = frameCol || '#1e293b', hc = headerCol || '#4f46e5', ac = accentCol || '#00e5ff';
        G.box(x, y, s * 1.02, s * 0.78, s * 0.10, fc, rim, lw);
        G.box(x, y - s * 0.27, s * 0.98, s * 0.17, s * 0.06, hc, rim, lw * 0.8);
        G.disc(x - s * 0.37, y - s * 0.27, s * 0.035, '#f43f5e', null, 0);
        G.disc(x - s * 0.27, y - s * 0.27, s * 0.035, '#ffd700', null, 0);
        G.disc(x - s * 0.17, y - s * 0.27, s * 0.035, ac, null, 0);
        if (vv === 1) {
          G.box(x + s * 0.29, y + s * 0.09, s * 0.30, s * 0.44, s * 0.05, '#0f172a', rim, lw * 0.7);
          var rNav = y - s * 0.03 + Math.sin(tt * 2.4) * s * 0.09;
          G.pill(x + s * 0.20, y - s * 0.03, x + s * 0.38, y - s * 0.03, s * 0.042, '#475569');
          G.pill(x + s * 0.20, y + s * 0.09, x + s * 0.38, y + s * 0.09, s * 0.042, '#475569');
          G.pill(x + s * 0.20, y + s * 0.21, x + s * 0.38, y + s * 0.21, s * 0.042, '#475569');
          G.pill(x + s * 0.20, rNav, x + s * 0.38, rNav, s * 0.048, ac);
          var cDy = Math.sin(tt * 2.5) * s * 0.025;
          G.box(x - s * 0.16, y - s * 0.02 + cDy, s * 0.48, s * 0.21, s * 0.05, ac, rim, lw * 0.75);
          G.box(x - s * 0.28, y + s * 0.21, s * 0.22, s * 0.18, s * 0.04, '#38bdf8', rim, lw * 0.7);
          G.box(x - s * 0.03, y + s * 0.21, s * 0.22, s * 0.18, s * 0.04, '#ffd700', rim, lw * 0.7);
        } else if (vv === 2) {
          var k1 = s * (0.02 * Math.sin(tt * 2.4)), k2 = s * (0.02 * Math.sin(tt * 2.4 + 1.4));
          G.box(x - s * 0.23, y - s * 0.02 + k1, s * 0.42, s * 0.20, s * 0.05, ac, rim, lw * 0.75);
          G.box(x + s * 0.23, y - s * 0.02 + k2, s * 0.42, s * 0.20, s * 0.05, '#ffd700', rim, lw * 0.75);
          G.box(x, y + s * 0.22, s * 0.88, s * 0.20, s * 0.05, '#0f172a', rim, lw * 0.75);
          var sw = s * (0.30 + 0.14 * Math.sin(tt * 2.5));
          G.pill(x - s * 0.34, y + s * 0.22, x - s * 0.34 + sw, y + s * 0.22, s * 0.06, '#38bdf8');
        } else if (vv === 3) {
          var xs3 = [x - s * 0.30, x, x + s * 0.30], cols3 = [ac, '#38bdf8', '#ffd700'];
          for (var c3 = 0; c3 < 3; c3++) {
            var cy3 = y + s * 0.09 + Math.sin(tt * 2.6 - c3 * 0.9) * s * 0.03;
            G.box(xs3[c3], cy3, s * 0.25, s * 0.42, s * 0.05, '#0f172a', cols3[c3], lw * 0.85);
            G.box(xs3[c3], cy3 - s * 0.08, s * 0.16, s * 0.12, s * 0.03, cols3[c3], null, 0);
            G.pill(xs3[c3] - s * 0.07, cy3 + s * 0.10, xs3[c3] + s * 0.07, cy3 + s * 0.10, s * 0.035, '#94a3b8');
          }
        } else {
          G.box(x - s * 0.29, y + s * 0.09, s * 0.30, s * 0.44, s * 0.05, '#0f172a', rim, lw * 0.7);
          var navY = y - s * 0.03 + Math.sin(tt * 2.4) * s * 0.09;
          G.pill(x - s * 0.38, y - s * 0.03, x - s * 0.20, y - s * 0.03, s * 0.042, '#475569');
          G.pill(x - s * 0.38, y + s * 0.09, x - s * 0.20, y + s * 0.09, s * 0.042, '#475569');
          G.pill(x - s * 0.38, y + s * 0.21, x - s * 0.20, y + s * 0.21, s * 0.042, '#475569');
          G.pill(x - s * 0.38, navY, x - s * 0.20, navY, s * 0.048, ac);
          var heroDy = Math.sin(tt * 2.6) * s * 0.025;
          G.box(x + s * 0.16, y - s * 0.02 + heroDy, s * 0.50, s * 0.21, s * 0.05, ac, rim, lw * 0.75);
          G.pill(x - s * 0.01, y - s * 0.02 + heroDy, x + s * 0.28, y - s * 0.02 + heroDy, s * 0.042, '#ffffff');
          G.box(x + s * 0.03, y + s * 0.21, s * 0.22, s * 0.18, s * 0.04, '#38bdf8', rim, lw * 0.7);
          G.box(x + s * 0.29, y + s * 0.21, s * 0.22, s * 0.18, s * 0.04, '#ffd700', rim, lw * 0.7);
        }
      },
      videoCall: function(x, y, s, frameCol, tileCol, accCol, rimCol, t, v) {
        x = G._n(x); y = G._n(y); s = Math.max(24, Math.abs(G._n(s, 76)));
        var rt = G._rt(rimCol, t), rim = rt.r, tt = rt.t, lw = Math.max(1.8, s * 0.032), vv = G._v(v);
        var fc = frameCol || '#1e293b', tc = tileCol || '#4f46e5', ac = accCol || '#00e5ff';
        G.box(x, y + s * 0.38, s * 0.42, s * 0.10, s * 0.04, fc, rim, lw * 0.85);
        G.box(x, y + s * 0.31, s * 0.14, s * 0.12, s * 0.02, '#475569', rim, lw * 0.75);
        G.box(x, y - s * 0.03, s * 1.04, s * 0.70, s * 0.09, fc, rim, lw);
        G.box(x, y - s * 0.03, s * 0.92, s * 0.56, s * 0.06, '#0f172a', '#334155', lw * 0.65);
        G.disc(x, y - s * 0.34, s * 0.035, '#38bdf8', '#0f172a', lw * 0.5);
        if (vv === 1) {
          G.box(x - s * 0.13, y - s * 0.03, s * 0.54, s * 0.44, s * 0.05, tc, rim, lw * 0.7);
          G.person(x - s * 0.13, y, s * 0.34, '#38bdf8', '#f8fafc', rim);
          var pipY = y - s * 0.12 + Math.sin(tt * 2.3) * s * 0.025;
          G.box(x + s * 0.28, pipY, s * 0.24, s * 0.22, s * 0.04, ac, rim, lw * 0.7);
          G.person(x + s * 0.28, pipY + s * 0.02, s * 0.17, '#1e293b', '#f8fafc', null);
          for (var b1 = 0; b1 < 3; b1++) {
            var bh1 = s * (0.06 + 0.05 * Math.abs(Math.sin(tt * 4.2 + b1 * 0.9)));
            G.bar(x + s * (0.20 + b1 * 0.08), y + s * 0.20, s * 0.045, bh1, s * 0.02, '#ffd700', null, 0);
          }
        } else if (vv === 2) {
          var qx = [-s * 0.21, s * 0.21, -s * 0.21, s * 0.21], qy = [-s * 0.16, -s * 0.16, s * 0.09, s * 0.09];
          var qcols = [tc, ac, '#f97316', '#38bdf8'];
          for (var q = 0; q < 4; q++) {
            var act = Math.sin(tt * 2.5 - q * 1.5) > 0.3;
            G.box(x + qx[q], y + qy[q], s * 0.38, s * 0.22, s * 0.04, '#1e293b', act ? '#ffd700' : rim, act ? lw : lw * 0.65);
            G.person(x + qx[q], y + qy[q] + s * 0.02, s * 0.17, qcols[q], '#f8fafc', null);
          }
        } else if (vv === 3) {
          G.box(x, y - s * 0.06, s * 0.82, s * 0.38, s * 0.05, tc, rim, lw * 0.7);
          G.person(x - s * 0.22, y - s * 0.04, s * 0.26, '#38bdf8', '#f8fafc', rim);
          G.person(x + s * 0.22, y - s * 0.04, s * 0.26, ac, '#f8fafc', rim);
          G.box(x, y + s * 0.19, s * 0.62, s * 0.09, s * 0.04, '#1e293b', rim, lw * 0.6);
          G.disc(x - s * 0.14, y + s * 0.19, s * 0.032, '#f43f5e', null, 0);
          G.disc(x, y + s * 0.19, s * (0.03 + 0.01 * Math.sin(tt * 3.5)), '#ffd700', null, 0);
          G.disc(x + s * 0.14, y + s * 0.19, s * 0.032, ac, null, 0);
        } else {
          var p0 = 0.5 + 0.5 * Math.sin(tt * 2.4);
          G.box(x - s * 0.21, y - s * 0.07, s * 0.39, s * 0.34, s * 0.05, tc, p0 > 0.5 ? '#ffd700' : rim, lw * 0.85);
          G.person(x - s * 0.21, y - s * 0.05, s * 0.26, '#38bdf8', '#f8fafc', null);
          G.box(x + s * 0.21, y - s * 0.07, s * 0.39, s * 0.34, s * 0.05, '#334155', p0 <= 0.5 ? '#ffd700' : rim, lw * 0.85);
          G.person(x + s * 0.21, y - s * 0.05, s * 0.26, ac, '#f8fafc', null);
          G.capsule(x, y + s * 0.18, s * 0.56, s * 0.09, '#1e293b', rim, lw * 0.65);
          G.disc(x - s * 0.14, y + s * 0.18, s * 0.032, '#f43f5e', null, 0);
          G.pill(x - s * 0.02, y + s * 0.18, x + s * (0.06 + 0.12 * p0), y + s * 0.18, s * 0.04, ac);
        }
      },
      laptop: function(x, y, s, bodyCol, screenCol, accCol, rimCol, t, v) {
        x = G._n(x); y = G._n(y); s = Math.max(24, Math.abs(G._n(s, 76)));
        var rt = G._rt(rimCol, t), rim = rt.r, tt = rt.t, lw = Math.max(1.8, s * 0.032), vv = G._v(v);
        var bc = bodyCol || '#1e293b', sc = screenCol || '#0f172a', ac = accCol || '#00e5ff';
        G.box(x, y - s * 0.08, s * 0.86, s * 0.58, s * 0.07, bc, rim, lw);
        G.box(x, y - s * 0.08, s * 0.74, s * 0.46, s * 0.04, sc, '#4f46e5', lw * 0.65);
        G.poly([[x - s * 0.44, y + s * 0.20], [x + s * 0.44, y + s * 0.20], [x + s * 0.54, y + s * 0.34], [x - s * 0.54, y + s * 0.34]], '#334155', rim, lw, true);
        G.box(x, y + s * 0.29, s * 0.22, s * 0.055, s * 0.02, ac, null, 0);
        if (vv === 1) {
          var bBase = y + s * 0.10;
          var hA = s * (0.12 + 0.05 * Math.sin(tt * 2.6)), hB = s * (0.19 + 0.06 * Math.sin(tt * 2.6 - 0.8)), hC = s * (0.26 + 0.06 * Math.sin(tt * 2.6 - 1.6));
          G.bar(x - s * 0.20, bBase, s * 0.11, hA, s * 0.025, '#38bdf8', null, 0);
          G.bar(x - s * 0.04, bBase, s * 0.11, hB, s * 0.025, '#4f46e5', null, 0);
          G.bar(x + s * 0.12, bBase, s * 0.11, hC, s * 0.025, ac, null, 0);
          G.arrow(x - s * 0.22, y - s * 0.10, x + s * 0.24, y - s * 0.22 + Math.sin(tt * 2.6) * s * 0.02, s * 0.032, s * 0.085, '#ffd700');
        } else if (vv === 2) {
          var dy2 = Math.sin(tt * 2.4) * s * 0.025;
          G.box(x - s * 0.17, y - s * 0.08 + dy2, s * 0.30, s * 0.30, s * 0.04, '#4f46e5', rim, lw * 0.6);
          G.box(x + s * 0.17, y - s * 0.14 - dy2, s * 0.30, s * 0.16, s * 0.04, ac, rim, lw * 0.6);
          G.box(x + s * 0.17, y + s * 0.04, s * 0.30, s * 0.14, s * 0.04, '#ffd700', rim, lw * 0.6);
        } else if (vv === 3) {
          G.disc(x - s * 0.17, y - s * 0.08, s * 0.13, '#1e293b', ac, lw * 0.7);
          G.ring(x - s * 0.17, y - s * 0.08, s * 0.09, s * 0.032, -Math.PI / 2, -Math.PI / 2 + Math.PI * (1.2 + 0.4 * Math.sin(tt * 2.5)), '#ffd700');
          G.pill(x + s * 0.02, y - s * 0.16, x + s * 0.28, y - s * 0.16, s * 0.045, ac);
          G.pill(x + s * 0.02, y - s * 0.06, x + s * (0.18 + 0.08 * Math.sin(tt * 2.5)), y - s * 0.06, s * 0.045, '#38bdf8');
          G.pill(x + s * 0.02, y + s * 0.04, x + s * 0.24, y + s * 0.04, s * 0.045, '#f97316');
        } else {
          var rys = [y - s * 0.19, y - s * 0.08, y + s * 0.03];
          var rCols = [ac, '#ffd700', '#38bdf8'];
          for (var ri = 0; ri < 3; ri++) {
            var prog = 0.5 + 0.5 * Math.sin(tt * 2.7 - ri * 1.0);
            G.disc(x - s * 0.24, rys[ri], s * 0.042, rCols[ri], '#ffffff', lw * 0.45);
            G.pill(x - s * 0.13, rys[ri], x + s * (0.10 + 0.15 * prog), rys[ri], s * 0.045, rCols[ri]);
          }
        }
      },
      checklist: function(x, y, s, boardCol, clipCol, accentCol, rimCol, t, v) {
        x = G._n(x); y = G._n(y); s = Math.max(24, Math.abs(G._n(s, 76)));
        var rt = G._rt(rimCol, t), rim = rt.r, tt = rt.t, lw = Math.max(1.8, s * 0.034), vv = G._v(v);
        var bc = boardCol || '#1e293b', cc = clipCol || '#f59e0b', ac = accentCol || '#00e5ff';
        G.box(x, y + s * 0.04, s * 0.80, s * 0.94, s * 0.10, bc, rim, lw);
        G.box(x, y + s * 0.06, s * 0.66, s * 0.76, s * 0.06, '#f8fafc', '#0f172a', lw * 0.65);
        G.box(x, y - s * 0.42, s * 0.34, s * 0.13, s * 0.04, cc, rim, lw);
        if (vv === 1) {
          var ys1 = [y - s * 0.13, y + s * 0.07, y + s * 0.27];
          var cols1 = ['#4f46e5', ac, '#f43f5e'];
          for (var i1 = 0; i1 < 3; i1++) {
            var p1 = 0.5 + 0.5 * Math.sin(tt * 2.6 - i1 * 1.0);
            G.disc(x - s * 0.18, ys1[i1], s * 0.065, cols1[i1], '#0f172a', lw * 0.55);
            G.check(x - s * 0.18, ys1[i1], s * (0.06 + 0.018 * p1), s * 0.022, '#ffffff');
            G.pill(x - s * 0.05, ys1[i1], x + s * (0.12 + 0.12 * p1), ys1[i1], s * 0.05, cols1[i1]);
          }
          G.star(x + s * 0.26, y - s * 0.34, s * 0.11, s * 0.05, 5, -Math.PI / 2, '#ffd700', rim, lw * 0.6);
        } else if (vv === 2) {
          G.box(x - s * 0.15, y - s * 0.14, s * 0.24, s * 0.10, s * 0.03, '#4f46e5', null, 0);
          G.box(x + s * 0.15, y - s * 0.14, s * 0.24, s * 0.10, s * 0.03, ac, null, 0);
          var sl = Math.sin(tt * 2.3) * s * 0.06;
          G.box(x + sl, y + s * 0.04, s * 0.44, s * 0.14, s * 0.04, '#38bdf8', '#0f172a', lw * 0.6);
          G.box(x - sl * 0.7, y + s * 0.24, s * 0.44, s * 0.14, s * 0.04, '#ffd700', '#0f172a', lw * 0.6);
        } else if (vv === 3) {
          G.disc(x, y - s * 0.12, s * 0.14, '#1e293b', '#0f172a', lw * 0.6);
          G.ring(x, y - s * 0.12, s * 0.10, s * 0.04, -Math.PI / 2, -Math.PI / 2 + Math.PI * (1.1 + 0.6 * Math.sin(tt * 2.4)), ac);
          G.check(x, y - s * 0.12, s * 0.09, s * 0.025, '#ffd700');
          var ys3 = [y + s * 0.13, y + s * 0.28];
          for (var i3 = 0; i3 < 2; i3++) {
            var p3 = 0.5 + 0.5 * Math.sin(tt * 2.8 - i3 * 1.1);
            G.box(x - s * 0.17, ys3[i3], s * 0.10, s * 0.10, s * 0.025, i3 === 0 ? ac : '#4f46e5', '#0f172a', lw * 0.5);
            G.pill(x - s * 0.05, ys3[i3], x + s * (0.12 + 0.12 * p3), ys3[i3], s * 0.05, '#1e293b');
          }
        } else {
          var ys = [y - s * 0.14, y + s * 0.07, y + s * 0.28];
          var cols = [ac, '#4f46e5', '#f97316'];
          for (var i = 0; i < 3; i++) {
            var p = 0.5 + 0.5 * Math.sin(tt * 2.8 - i * 1.1);
            G.box(x - s * 0.18, ys[i], s * 0.12, s * 0.12, s * 0.03, cols[i], '#0f172a', lw * 0.55);
            G.check(x - s * 0.18, ys[i], s * (0.065 + 0.02 * p), s * 0.024, '#ffffff');
            G.pill(x - s * 0.05, ys[i], x + s * (0.10 + 0.13 * p), ys[i], s * 0.055, cols[i]);
          }
        }
      },
      rocket: function(x, y, s, hullCol, wingCol, flameCol, rimCol, t, v) {
        x = G._n(x); y = G._n(y); s = Math.max(24, Math.abs(G._n(s, 76)));
        var rt = G._rt(rimCol, t), rim = rt.r, tt = rt.t, lw = Math.max(1.8, s * 0.034), vv = G._v(v);
        var hc = hullCol || '#f8fafc', wc = wingCol || '#4f46e5', fc = flameCol || '#f97316';
        var fl = 0.5 + 0.5 * Math.sin(tt * 9.0);
        G.poly([[x - s * 0.11, y + s * 0.26], [x + s * 0.11, y + s * 0.26], [x, y + s * (0.44 + 0.10 * fl)]], fc, '#ffd700', lw * 0.7, true);
        G.poly([[x - s * 0.055, y + s * 0.26], [x + s * 0.055, y + s * 0.26], [x, y + s * (0.35 + 0.06 * fl)]], '#ffd700', null, 0, true);
        G.poly([[x - s * 0.16, y + s * 0.02], [x - s * 0.36, y + s * 0.26], [x - s * 0.14, y + s * 0.24]], wc, rim, lw, true);
        G.poly([[x + s * 0.16, y + s * 0.02], [x + s * 0.36, y + s * 0.26], [x + s * 0.14, y + s * 0.24]], wc, rim, lw, true);
        G.box(x, y + s * 0.25, s * 0.22, s * 0.08, s * 0.02, '#1e293b', rim, lw * 0.8);
        G.capsule(x, y - s * 0.03, s * 0.36, s * 0.62, hc, '#0f172a', lw);
        G.poly([[x - s * 0.16, y - s * 0.18], [x + s * 0.16, y - s * 0.18], [x, y - s * 0.46]], '#f43f5e', rim, lw, true);
        if (vv === 1) {
          G.disc(x, y - s * 0.06, s * 0.075, '#00e5ff', '#0f172a', lw * 0.8);
          G.disc(x, y + s * 0.10, s * 0.065, '#ffd700', '#0f172a', lw * 0.8);
        } else if (vv === 2) {
          G.box(x, y - s * 0.10, s * 0.34, s * 0.08, s * 0.02, wc, rim, lw * 0.7);
          G.star(x, y + s * 0.06, s * 0.095, s * 0.045, 5, -Math.PI / 2, '#ffd700', '#0f172a', lw * 0.7);
        } else if (vv === 3) {
          G.box(x, y - s * 0.04, s * 0.22, s * 0.14, s * 0.06, '#00e5ff', '#0f172a', lw * 0.85);
          G.capsule(x - s * 0.20, y + s * 0.10, s * 0.10, s * 0.26, wc, rim, lw * 0.75);
          G.capsule(x + s * 0.20, y + s * 0.10, s * 0.10, s * 0.26, wc, rim, lw * 0.75);
        } else {
          G.disc(x, y - s * 0.03, s * 0.095, '#00e5ff', '#0f172a', lw);
        }
      },
      lightbulb: function(x, y, s, bulbCol, rayCol, baseCol, rimCol, t, v) {
        x = G._n(x); y = G._n(y); s = Math.max(24, Math.abs(G._n(s, 76)));
        var rt = G._rt(rimCol, t), rim = rt.r, tt = rt.t, lw = Math.max(1.8, s * 0.034), vv = G._v(v);
        var bc = bulbCol || '#ffd700', rc = rayCol || '#00e5ff', bsc = baseCol || '#1e293b';
        if (vv === 1) {
          G.ring(x, y - s * 0.09, s * 0.40, s * 0.035, tt * 0.9, tt * 0.9 + Math.PI * 1.4, rc);
          G.star(x + s * 0.34, y - s * 0.34, s * (0.09 + 0.02 * Math.sin(tt * 3.2)), s * 0.04, 4, 0, '#ffffff', rc, lw * 0.5);
        } else if (vv === 2) {
          G.rays(x, y - s * 0.09, s * 0.33, s * (0.46 + 0.05 * Math.sin(tt * 3.8)), 9, -Math.PI / 2 - Math.sin(tt * 1.6) * 0.1, s * 0.036, rc);
        } else if (vv === 3) {
          G.ring(x, y - s * 0.09, s * 0.39, s * 0.04, Math.PI * 1.15, Math.PI * 1.85, rc);
          G.rays(x, y - s * 0.09, s * 0.34, s * (0.45 + 0.04 * Math.cos(tt * 3.2)), 5, -Math.PI / 2, s * 0.048, '#f97316');
        } else {
          var rOut = s * (0.44 + 0.06 * Math.sin(tt * 3.4));
          G.rays(x, y - s * 0.09, s * 0.34, rOut, 7, -Math.PI / 2 + Math.sin(tt * 1.4) * 0.08, s * 0.042, rc);
        }
        G.capsule(x, y + s * 0.39, s * 0.15, s * 0.075, bsc, rim, lw * 0.9);
        G.box(x, y + s * 0.28, s * 0.25, s * 0.15, s * 0.04, '#475569', rim, lw);
        G.box(x, y + s * 0.14, s * 0.25, s * 0.13, s * 0.03, bc, rim, lw);
        G.disc(x, y - s * 0.09, s * 0.29, bc, rim, lw);
        if (vv === 3) {
          G.poly([[x + s * 0.02, y - s * 0.22], [x - s * 0.07, y - s * 0.07], [x + s * 0.01, y - s * 0.07], [x - s * 0.04, y + s * 0.08], [x + s * 0.09, y - s * 0.10], [x + s * 0.01, y - s * 0.10]], '#ffffff', '#0f172a', lw * 0.6, true);
        } else if (vv === 1) {
          G.disc(x, y - s * 0.10, s * (0.11 + 0.02 * Math.sin(tt * 3.4)), '#ffffff', '#f97316', lw * 0.7);
        } else {
          G.poly([[x - s * 0.09, y + s * 0.02], [x - s * 0.04, y - s * 0.11], [x, y - s * 0.03], [x + s * 0.04, y - s * 0.11], [x + s * 0.09, y + s * 0.02]], null, '#ffffff', lw * 1.15, false);
        }
      },
      chart: function(x, y, s, cardCol, bar1Col, bar2Col, arrowCol, rimCol, t, v) {
        x = G._n(x); y = G._n(y); s = Math.max(24, Math.abs(G._n(s, 76)));
        var rt = G._rt(rimCol, t), rim = rt.r, tt = rt.t, lw = Math.max(1.8, s * 0.032), vv = G._v(v);
        var cc = cardCol || '#1e293b', b1 = bar1Col || '#38bdf8', b2 = bar2Col || '#4f46e5', ac = arrowCol || '#ffd700';
        G.box(x, y, s * 1.02, s * 0.78, s * 0.10, cc, rim, lw);
        var yBase = y + s * 0.25;
        G.pill(x - s * 0.38, yBase + s * 0.02, x + s * 0.38, yBase + s * 0.02, lw, '#94a3b8');
        if (vv === 1) {
          var xs = [-s * 0.27, -s * 0.09, s * 0.09, s * 0.27];
          var hs = [0.16, 0.24, 0.33, 0.42];
          var bcols = [b1, b2, '#00e5ff', ac];
          var pts = [];
          for (var bi = 0; bi < 4; bi++) {
            var hCur = s * (hs[bi] + 0.06 * Math.sin(tt * 2.5 - bi * 0.7));
            G.bar(x + xs[bi], yBase, s * 0.11, hCur, s * 0.025, bcols[bi], rim, lw * 0.6);
            pts.push([x + xs[bi], yBase - hCur - s * 0.05]);
          }
          G.poly(pts, null, ac, lw, false);
        } else if (vv === 2) {
          G.pie(x - s * 0.22, y - s * 0.06, s * 0.16, -Math.PI / 2 + tt * 0.6, Math.PI * 1.25, ac, b2, rim);
          var hb1 = s * (0.26 + 0.07 * Math.sin(tt * 2.6));
          var hb2 = s * (0.40 + 0.07 * Math.sin(tt * 2.6 - 0.9));
          G.bar(x + s * 0.09, yBase, s * 0.14, hb1, s * 0.03, b1, rim, lw * 0.7);
          G.bar(x + s * 0.28, yBase, s * 0.14, hb2, s * 0.03, '#00e5ff', rim, lw * 0.7);
        } else if (vv === 3) {
          var hA = s * (0.19 + 0.06 * Math.cos(tt * 2.5));
          var hB = s * (0.31 + 0.07 * Math.cos(tt * 2.5 - 0.9));
          var hC = s * (0.42 + 0.07 * Math.cos(tt * 2.5 - 1.8));
          G.bar(x - s * 0.24, yBase, s * 0.15, hA, s * 0.03, b1, rim, lw * 0.7);
          G.bar(x, yBase, s * 0.15, hB, s * 0.03, ac, rim, lw * 0.7);
          G.bar(x + s * 0.24, yBase, s * 0.15, hC, s * 0.03, b2, rim, lw * 0.7);
          G.disc(x - s * 0.24, yBase - hA - s * 0.05, s * 0.04, '#ffffff', rim, lw * 0.5);
          G.disc(x, yBase - hB - s * 0.05, s * 0.04, '#ffffff', rim, lw * 0.5);
          G.disc(x + s * 0.24, yBase - hC - s * 0.05, s * 0.04, '#ffffff', rim, lw * 0.5);
        } else {
          var h1 = s * (0.20 + 0.07 * Math.sin(tt * 2.6));
          var h2 = s * (0.31 + 0.07 * Math.sin(tt * 2.6 - 0.8));
          var h3 = s * (0.41 + 0.08 * Math.sin(tt * 2.6 - 1.6));
          G.bar(x - s * 0.24, yBase, s * 0.15, h1, s * 0.03, b1, rim, lw * 0.7);
          G.bar(x, yBase, s * 0.15, h2, s * 0.03, b2, rim, lw * 0.7);
          G.bar(x + s * 0.24, yBase, s * 0.15, h3, s * 0.03, '#00e5ff', rim, lw * 0.7);
          var ay = Math.sin(tt * 2.8) * s * 0.025;
          G.arrow(x - s * 0.30, y - s * 0.06, x + s * 0.30, y - s * 0.27 + ay, s * 0.042, s * 0.11, ac);
        }
      },
      magnifier: function(x, y, s, cardCol, lensCol, handleCol, accentCol, rimCol, t, v) {
        x = G._n(x); y = G._n(y); s = Math.max(24, Math.abs(G._n(s, 76)));
        var rt = G._rt(rimCol, t), rim = rt.r, tt = rt.t, lw = Math.max(1.8, s * 0.032), vv = G._v(v);
        var cc = cardCol || '#1e293b', lc = lensCol || '#00e5ff', hc = handleCol || '#f59e0b', ac = accentCol || '#ffd700';
        G.box(x - s * 0.06, y, s * 0.78, s * 0.84, s * 0.09, cc, rim, lw);
        G.pill(x - s * 0.32, y - s * 0.25, x + s * 0.16, y - s * 0.25, s * 0.05, '#475569');
        G.pill(x - s * 0.32, y - s * 0.10, x + s * 0.08, y - s * 0.10, s * 0.05, '#38bdf8');
        G.bar(x - s * 0.25, y + s * 0.28, s * 0.10, s * 0.18, s * 0.02, '#4f46e5', null, 0);
        G.bar(x - s * 0.10, y + s * 0.28, s * 0.10, s * 0.26, s * 0.02, '#38bdf8', null, 0);
        var ox = Math.cos(tt * 2.1) * s * 0.065, oy = Math.sin(tt * 2.1) * s * 0.065;
        if (vv === 1) {
          ox = Math.sin(tt * 2.0) * s * 0.08; oy = Math.sin(tt * 4.0) * s * 0.04;
          G.pill(x + ox - s * 0.16, y + oy + s * 0.16, x + ox - s * 0.38, y + oy + s * 0.38, s * 0.10, hc);
          G.disc(x + ox, y + oy - s * 0.01, s * 0.24, '#0f172a', lc, s * 0.055);
          G.check(x + ox, y + oy - s * 0.01, s * 0.14, s * 0.036, ac);
        } else if (vv === 2) {
          G.pill(x + ox + s * 0.16, y + oy + s * 0.16, x + ox + s * 0.40, y + oy + s * 0.40, s * 0.10, hc);
          G.disc(x + ox + s * 0.03, y + oy - s * 0.01, s * 0.24, '#0f172a', lc, s * 0.055);
          G.ring(x + ox + s * 0.03, y + oy - s * 0.01, s * 0.13, s * 0.025, tt * 2.0, tt * 2.0 + Math.PI * 1.4, ac);
          G.disc(x + ox + s * 0.03, y + oy - s * 0.01, s * 0.055, ac, null, 0);
        } else if (vv === 3) {
          G.pill(x + ox + s * 0.16, y + oy + s * 0.16, x + ox + s * 0.40, y + oy + s * 0.40, s * 0.10, hc);
          G.disc(x + ox + s * 0.03, y + oy - s * 0.01, s * 0.24, '#0f172a', lc, s * 0.055);
          var ks3 = 1 + 0.12 * Math.sin(tt * 3.0);
          G.star(x + ox + s * 0.03, y + oy - s * 0.01, s * 0.12 * ks3, s * 0.055 * ks3, 5, -Math.PI / 2, ac, rim, lw * 0.5);
        } else {
          G.pill(x + ox + s * 0.16, y + oy + s * 0.16, x + ox + s * 0.40, y + oy + s * 0.40, s * 0.10, hc);
          G.disc(x + ox + s * 0.03, y + oy - s * 0.01, s * 0.24, '#0f172a', lc, s * 0.055);
          var bh = s * (0.14 + 0.05 * Math.sin(tt * 3.0));
          G.bar(x + ox - s * 0.04, y + oy + s * 0.08, s * 0.065, bh * 0.75, s * 0.015, ac, null, 0);
          G.bar(x + ox + s * 0.08, y + oy + s * 0.08, s * 0.065, bh, s * 0.015, lc, null, 0);
        }
      },
      pieChart: function(x, y, s, baseCol, s1Col, s2Col, s3Col, rimCol, t, v) {
        x = G._n(x); y = G._n(y); s = Math.max(24, Math.abs(G._n(s, 76)));
        var rt = G._rt(rimCol, t), rim = rt.r, tt = rt.t, lw = Math.max(1.8, s * 0.032), vv = G._v(v);
        var r = s * 0.40, c1 = s1Col || '#00e5ff', c2 = s2Col || '#4f46e5', c3 = s3Col || '#f59e0b';
        if (vv === 2) {
          G.box(x - s * 0.28, y, s * 0.34, s * 0.48, s * 0.06, baseCol || '#1e293b', rim, lw * 0.8);
          G.pill(x - s * 0.37, y - s * 0.12, x - s * 0.19, y - s * 0.12, s * 0.045, c1);
          G.pill(x - s * 0.37, y, x - s * 0.19, y, s * 0.045, c2);
          G.pill(x - s * 0.37, y + s * 0.12, x - s * 0.19, y + s * 0.12, s * 0.045, c3);
          x = x + s * 0.14; r = s * 0.34;
        }
        G.disc(x, y, r, baseCol || '#1e293b', rim, lw);
        var aShift = vv === 1 ? Math.sin(tt * 1.4) * 0.25 : 0;
        var pop = s * (0.04 + 0.035 * Math.sin(tt * 2.6));
        var angles = vv === 1
          ? [[-Math.PI / 2, 0.2, c1, 0], [0.2, 1.8, c2, pop], [1.8, 3.5, '#f43f5e', 0], [3.5, Math.PI * 1.5, c3, 0]]
          : [[-Math.PI / 2 + aShift, 0.75 + aShift, c1, 0], [0.75 + aShift, 2.75 + aShift, c2, 0], [2.75 + aShift, Math.PI * 1.5 + aShift, c3, pop]];
        for (var i = 0; i < angles.length; i++) {
          var a0 = angles[i][0], a1 = angles[i][1], mid = (a0 + a1) * 0.5, off = angles[i][3];
          var px = x + Math.cos(mid) * off, py = y + Math.sin(mid) * off;
          ctx.beginPath(); ctx.moveTo(px, py); ctx.arc(px, py, r * 0.92, a0, a1); ctx.closePath();
          ctx.fillStyle = G._c(angles[i][2]); ctx.fill();
          ctx.strokeStyle = G._c(rim); ctx.lineWidth = lw * 0.85; ctx.stroke();
        }
        G.disc(x, y, s * (vv === 3 ? 0.20 : 0.13), '#0f172a', rim, lw * 0.85);
        if (vv === 3) {
          G.ring(x, y, s * 0.14, s * 0.035, -tt * 2.0, -tt * 2.0 + Math.PI * 1.3, c1);
        }
      },
      gears: function(x, y, s, g1Col, g2Col, coreCol, rimCol, t, v) {
        x = G._n(x); y = G._n(y); s = Math.max(24, Math.abs(G._n(s, 76)));
        var rt = G._rt(rimCol, t), rim = rt.r, tt = rt.t, lw = Math.max(1.6, s * 0.03), vv = G._v(v);
        var drawGear = function(gx, gy, gr, teeth, ang, gCol, cCol) {
          G.part(gx, gy, ang, 1, 1, function() {
            for (var i = 0; i < teeth; i++) {
              var a = (i * Math.PI * 2) / teeth;
              G.part(0, 0, a, 1, 1, function() { G.box(0, -gr * 0.92, gr * 0.34, gr * 0.34, gr * 0.06, gCol, rim, lw * 0.8); });
            }
            G.disc(0, 0, gr * 0.82, gCol, rim, lw);
            G.disc(0, 0, gr * 0.34, cCol, rim, lw * 0.85);
          });
        };
        var a1 = tt * 1.45;
        if (vv === 1) {
          drawGear(x - s * 0.16, y, s * 0.28, 8, a1, g1Col || '#0284c7', coreCol || '#ffd700');
          drawGear(x + s * 0.20, y - s * 0.18, s * 0.19, 6, -a1 * 1.33 + 0.3, g2Col || '#4f46e5', '#00e5ff');
          drawGear(x + s * 0.20, y + s * 0.20, s * 0.19, 6, -a1 * 1.33 + 0.8, '#f97316', '#f8fafc');
        } else if (vv === 2) {
          G.box(x, y, s * 0.96, s * 0.56, s * 0.14, '#0f172a', rim, lw);
          drawGear(x - s * 0.20, y, s * 0.23, 8, a1, g1Col || '#0284c7', coreCol || '#ffd700');
          drawGear(x + s * 0.20, y, s * 0.23, 8, -a1 + 0.38, g2Col || '#4f46e5', '#00e5ff');
        } else if (vv === 3) {
          G.ring(x, y, s * 0.42, s * 0.05, tt * 0.9, tt * 0.9 + Math.PI * 1.4, '#00e5ff');
          drawGear(x, y, s * 0.34, 10, -a1, g1Col || '#4f46e5', coreCol || '#ffd700');
        } else {
          drawGear(x - s * 0.14, y + s * 0.10, s * 0.30, 8, a1, g1Col || '#0284c7', coreCol || '#ffd700');
          drawGear(x + s * 0.22, y - s * 0.18, s * 0.22, 6, -a1 * 1.33 + 0.4, g2Col || '#4f46e5', '#00e5ff');
        }
      },
      userBadge: function(x, y, s, cardCol, personCol, accentCol, rimCol, t, v) {
        x = G._n(x); y = G._n(y); s = Math.max(24, Math.abs(G._n(s, 76)));
        var rt = G._rt(rimCol, t), rim = rt.r, tt = rt.t, lw = Math.max(1.8, s * 0.032), vv = G._v(v);
        var cc = cardCol || '#1e293b', pc = personCol || '#0284c7', ac = accentCol || '#00e5ff';
        if (vv === 1) {
          G.capsule(x, y - s * 0.42, s * 0.22, s * 0.08, ac, rim, lw * 0.7);
          G.box(x, y + s * 0.02, s * 0.72, s * 0.88, s * 0.10, cc, rim, lw);
          G.person(x, y - s * 0.12, s * 0.32, pc, '#f8fafc', rim);
          var bw1 = s * (0.36 + 0.08 * Math.sin(tt * 2.5));
          G.pill(x - bw1 * 0.5, y + s * 0.18, x + bw1 * 0.5, y + s * 0.18, s * 0.05, ac);
          G.star(x, y + s * 0.32, s * 0.10, s * 0.045, 5, -Math.PI / 2, '#ffd700', rim, lw * 0.6);
        } else if (vv === 2) {
          G.box(x, y, s * 1.00, s * 0.74, s * 0.10, cc, rim, lw);
          G.box(x + s * 0.24, y, s * 0.34, s * 0.48, s * 0.06, '#0f172a', rim, lw * 0.75);
          G.person(x + s * 0.24, y + s * 0.03, s * 0.30, pc, '#f8fafc', rim);
          for (var si = 0; si < 3; si++) {
            var kst = 1 + 0.12 * Math.sin(tt * 3.0 - si * 0.8);
            G.star(x - s * 0.32 + si * s * 0.13, y - s * 0.16, s * 0.055 * kst, s * 0.025 * kst, 5, -Math.PI / 2, '#ffd700', null, 0);
          }
          G.pill(x - s * 0.38, y + s * 0.04, x - s * 0.02, y + s * 0.04, s * 0.055, ac);
          G.pill(x - s * 0.38, y + s * 0.20, x - s * 0.08, y + s * 0.20, s * 0.055, '#38bdf8');
        } else if (vv === 3) {
          G.box(x, y + s * 0.06, s * 0.96, s * 0.66, s * 0.10, cc, rim, lw);
          G.disc(x - s * 0.24, y - s * 0.06, s * 0.24, '#0f172a', ac, lw * 0.85);
          G.person(x - s * 0.24, y - s * 0.04, s * 0.26, pc, '#f8fafc', rim);
          var slw = s * (0.30 + 0.07 * Math.sin(tt * 2.5));
          G.pill(x + s * 0.06, y - s * 0.04, x + s * 0.06 + slw, y - s * 0.04, s * 0.055, '#ffd700');
          G.pill(x + s * 0.06, y + s * 0.12, x + s * 0.34, y + s * 0.12, s * 0.055, ac);
        } else {
          G.box(x, y, s * 1.00, s * 0.74, s * 0.10, cc, rim, lw);
          G.box(x - s * 0.24, y, s * 0.34, s * 0.48, s * 0.06, '#0f172a', rim, lw * 0.75);
          G.person(x - s * 0.24, y + s * 0.03, s * 0.30, pc, '#f8fafc', rim);
          var w1 = s * (0.28 + 0.07 * Math.sin(tt * 2.5));
          var w2 = s * (0.24 + 0.07 * Math.sin(tt * 2.5 - 0.8));
          G.pill(x + s * 0.02, y - s * 0.13, x + s * 0.02 + w1, y - s * 0.13, s * 0.055, ac);
          G.pill(x + s * 0.02, y + s * 0.03, x + s * 0.02 + w2, y + s * 0.03, s * 0.055, '#38bdf8');
          G.pill(x + s * 0.02, y + s * 0.19, x + s * 0.24, y + s * 0.19, s * 0.055, '#94a3b8');
          var bs = 1 + 0.10 * Math.sin(tt * 3.0);
          G.disc(x + s * 0.34, y - s * 0.24, s * 0.13 * bs, '#ffd700', rim, lw * 0.85);
          G.check(x + s * 0.34, y - s * 0.24, s * 0.11 * bs, s * 0.03, '#0f172a');
        }
      },
      typography: function(x, y, s, cardCol, inkCol, accentCol, rimCol, t, v) {
        x = G._n(x); y = G._n(y); s = Math.max(24, Math.abs(G._n(s, 76)));
        var rt = G._rt(rimCol, t), rim = rt.r, tt = rt.t, lw = Math.max(1.8, s * 0.032), vv = G._v(v);
        var cc = cardCol || '#1e293b', ic = inkCol || '#f8fafc', ac = accentCol || '#00e5ff';
        G.box(x, y, s * 0.90, s * 0.82, s * 0.08, cc, rim, lw);
        var cx0 = s * 0.45, cy0 = s * 0.41;
        G.box(x - cx0, y - cy0, s * 0.10, s * 0.10, s * 0.02, ac, rim, lw * 0.6);
        G.box(x + cx0, y - cy0, s * 0.10, s * 0.10, s * 0.02, ac, rim, lw * 0.6);
        G.box(x - cx0, y + cy0, s * 0.10, s * 0.10, s * 0.02, ac, rim, lw * 0.6);
        G.box(x + cx0, y + cy0, s * 0.10, s * 0.10, s * 0.02, ac, rim, lw * 0.6);
        if (vv === 1) {
          G.pill(x - s * 0.22, y - s * 0.20, x + s * 0.22, y - s * 0.20, s * 0.075, ic);
          G.pill(x, y - s * 0.20, x, y + s * 0.18, s * 0.085, ic);
          G.pill(x - s * 0.10, y + s * 0.18, x + s * 0.10, y + s * 0.18, s * 0.055, ac);
        } else if (vv === 2) {
          G.pill(x - s * 0.24, y - s * 0.18, x - s * 0.24, y + s * 0.16, s * 0.07, ic);
          G.pill(x + s * 0.24, y - s * 0.18, x + s * 0.24, y + s * 0.16, s * 0.07, ic);
          G.pill(x - s * 0.24, y, x + s * 0.24, y, s * 0.07, ac);
        } else if (vv === 3) {
          G.pill(x - s * 0.26, y + s * 0.14, x + s * 0.26, y - s * 0.14, s * 0.04, '#64748b');
          G.disc(x - s * 0.26, y + s * 0.14, s * 0.055, '#ffd700', rim, lw * 0.6);
          G.disc(x + s * 0.26, y - s * 0.14, s * 0.055, '#ffd700', rim, lw * 0.6);
          G.pill(x - s * 0.18, y + s * 0.14, x, y - s * 0.22, s * 0.075, ic);
          G.pill(x + s * 0.18, y + s * 0.14, x, y - s * 0.22, s * 0.075, ic);
        } else {
          G.pill(x - s * 0.20, y + s * 0.16, x, y - s * 0.22, s * 0.075, ic);
          G.pill(x + s * 0.20, y + s * 0.16, x, y - s * 0.22, s * 0.075, ic);
          G.pill(x - s * 0.11, y + s * 0.04, x + s * 0.11, y + s * 0.04, s * 0.065, ac);
        }
        var curX = x - s * 0.24 + (0.5 + 0.5 * Math.sin(tt * 2.2)) * s * 0.48;
        G.pill(x - s * 0.28, y + s * 0.26, x + s * 0.28, y + s * 0.26, s * 0.032, '#64748b');
        G.disc(curX, y + s * 0.26, s * 0.065, '#ffd700', rim, lw * 0.7);
      },
      briefcase: function(x, y, s, bodyCol, flapCol, claspCol, rimCol, t, v) {
        x = G._n(x); y = G._n(y); s = Math.max(24, Math.abs(G._n(s, 76)));
        var rt = G._rt(rimCol, t), rim = rt.r, tt = rt.t, lw = Math.max(1.8, s * 0.034), vv = G._v(v);
        var dy = Math.sin(tt * 2.4) * s * 0.022;
        if (vv === 2) {
          G.box(x + s * 0.12, y - s * 0.22 + dy, s * 0.34, s * 0.26, s * 0.04, '#f8fafc', '#0f172a', lw * 0.65);
          G.pill(x + s * 0.01, y - s * 0.24 + dy, x + s * 0.22, y - s * 0.24 + dy, s * 0.04, '#00e5ff');
        }
        G.ring(x, y - s * 0.23, s * 0.15, s * 0.06, Math.PI, Math.PI * 2, rim);
        G.box(x, y + s * 0.07, s * 0.94, s * 0.60, s * 0.09, bodyCol || '#1e293b', rim, lw);
        G.box(x, y - s * 0.06 + dy, s * 0.96, s * 0.27, s * 0.07, flapCol || '#4f46e5', rim, lw);
        if (vv === 1) {
          G.box(x - s * 0.22, y + s * 0.07 + dy * 0.6, s * 0.10, s * 0.22, s * 0.025, claspCol || '#ffd700', rim, lw * 0.7);
          G.box(x + s * 0.22, y + s * 0.07 + dy * 0.6, s * 0.10, s * 0.22, s * 0.025, claspCol || '#ffd700', rim, lw * 0.7);
        } else if (vv === 3) {
          G.disc(x, y + s * 0.08 + dy * 0.6, s * 0.11, claspCol || '#ffd700', rim, lw * 0.8);
          G.check(x, y + s * 0.08 + dy * 0.6, s * 0.09, s * 0.025, '#0f172a');
        } else {
          G.box(x, y + s * 0.08 + dy * 0.6, s * 0.16, s * 0.15, s * 0.03, claspCol || '#ffd700', rim, lw * 0.85);
        }
      },
      trophy: function(x, y, s, cupCol, baseCol, starCol, rimCol, t, v) {
        x = G._n(x); y = G._n(y); s = Math.max(24, Math.abs(G._n(s, 76)));
        var rt = G._rt(rimCol, t), rim = rt.r, tt = rt.t, lw = Math.max(1.8, s * 0.034), vv = G._v(v);
        var cc = cupCol || '#ffd700', bc = baseCol || '#1e293b', sc = starCol || '#ffffff';
        G.ring(x - s * 0.25, y - s * 0.12, s * 0.13, s * 0.05, 0, Math.PI * 2, cc);
        G.ring(x + s * 0.25, y - s * 0.12, s * 0.13, s * 0.05, 0, Math.PI * 2, cc);
        G.box(x, y + s * 0.40, s * 0.48, s * 0.11, s * 0.03, bc, rim, lw);
        if (vv === 2) G.box(x, y + s * 0.32, s * 0.34, s * 0.09, s * 0.02, '#4f46e5', rim, lw * 0.8);
        G.box(x, y + s * 0.26, s * 0.14, s * 0.20, s * 0.02, cc, rim, lw);
        G.poly([[x - s * 0.28, y - s * 0.33], [x + s * 0.28, y - s * 0.33], [x + s * 0.16, y + s * 0.17], [x - s * 0.16, y + s * 0.17]], cc, rim, lw, true);
        var st = 1 + 0.12 * Math.sin(tt * 3.2);
        if (vv === 1) {
          G.box(x, y - s * 0.29, s * 0.52, s * 0.08, s * 0.03, '#4f46e5', rim, lw * 0.7);
          G.star(x, y - s * 0.07, s * 0.12 * st, s * 0.055 * st, 5, -Math.PI / 2, sc, '#b45309', lw * 0.7);
        } else if (vv === 3) {
          G.ngon(x, y - s * 0.09, s * 0.13 * st, 4, 0, '#00e5ff', rim, lw * 0.8);
        } else {
          G.star(x, y - s * 0.10, s * 0.12 * st, s * 0.055 * st, 5, -Math.PI / 2, sc, '#b45309', lw * 0.7);
        }
      },
      clock: function(x, y, s, bezelCol, faceCol, handCol, rimCol, t, v) {
        x = G._n(x); y = G._n(y); s = Math.max(24, Math.abs(G._n(s, 76)));
        var rt = G._rt(rimCol, t), rim = rt.r, tt = rt.t, lw = Math.max(1.8, s * 0.034), vv = G._v(v);
        if (vv === 1) G.capsule(x, y - s * 0.48, s * 0.18, s * 0.10, '#ffd700', rim, lw * 0.8);
        if (vv === 2) {
          G.disc(x - s * 0.30, y - s * 0.32, s * 0.12, '#f97316', rim, lw * 0.8);
          G.disc(x + s * 0.30, y - s * 0.32, s * 0.12, '#f97316', rim, lw * 0.8);
        }
        if (vv === 3) {
          G.box(x, y, s * 0.88, s * 0.88, s * 0.22, bezelCol || '#4f46e5', rim, lw);
          G.box(x, y, s * 0.68, s * 0.68, s * 0.16, faceCol || '#f8fafc', '#0f172a', lw * 0.7);
        } else {
          G.disc(x, y, s * 0.46, bezelCol || '#4f46e5', rim, lw);
          G.disc(x, y, s * 0.36, faceCol || '#f8fafc', '#0f172a', lw * 0.7);
        }
        if (vv === 1 || vv === 3) {
          G.ring(x, y, s * 0.27, s * 0.04, -Math.PI / 2, -Math.PI / 2 + Math.PI * (0.9 + 0.5 * Math.sin(tt * 2.0)), '#38bdf8');
        }
        var ha = -Math.PI / 2 + tt * 0.55, ma = -Math.PI / 2 + tt * 2.4;
        G.pill(x, y, x + Math.cos(ha) * s * 0.19, y + Math.sin(ha) * s * 0.19, s * 0.05, handCol || '#1e293b');
        G.pill(x, y, x + Math.cos(ma) * s * 0.27, y + Math.sin(ma) * s * 0.27, s * 0.038, '#00e5ff');
        G.disc(x, y, s * 0.055, '#f43f5e', '#0f172a', lw * 0.6);
      },
      lock: function(x, y, s, bodyCol, shackleCol, accentCol, rimCol, t, v) {
        x = G._n(x); y = G._n(y); s = Math.max(24, Math.abs(G._n(s, 76)));
        var rt = G._rt(rimCol, t), rim = rt.r, tt = rt.t, lw = Math.max(1.8, s * 0.034), vv = G._v(v);
        var lift = Math.abs(Math.sin(tt * 2.3)) * s * 0.05;
        G.ring(x, y - s * 0.16 - lift, s * 0.20, s * 0.085, Math.PI, Math.PI * 2, shackleCol || '#38bdf8');
        if (vv === 2) {
          G.ngon(x, y + s * 0.12, s * 0.36, 8, Math.PI / 8, bodyCol || '#1e293b', rim, lw);
          G.ring(x, y + s * 0.12, s * 0.18, s * 0.045, tt * 1.8, tt * 1.8 + Math.PI * 1.4, accentCol || '#ffd700');
          G.disc(x, y + s * 0.12, s * 0.07, '#00e5ff', rim, lw * 0.6);
        } else {
          G.box(x, y + s * 0.12, s * 0.70, s * 0.56, s * 0.10, bodyCol || '#1e293b', rim, lw);
          if (vv === 1) {
            G.box(x, y + s * 0.12, s * 0.68, s * 0.18, s * 0.04, '#4f46e5', rim, lw * 0.7);
            G.check(x, y + s * 0.12, s * 0.14, s * 0.035, accentCol || '#ffd700');
          } else if (vv === 3) {
            var k3 = 1 + 0.1 * Math.sin(tt * 3.0);
            G.star(x, y + s * 0.12, s * 0.14 * k3, s * 0.06 * k3, 5, -Math.PI / 2, accentCol || '#ffd700', rim, lw * 0.65);
          } else {
            var ks = 1 + 0.1 * Math.sin(tt * 3.0);
            G.disc(x, y + s * 0.09, s * 0.10 * ks, accentCol || '#ffd700', rim, lw * 0.7);
            G.pill(x, y + s * 0.14, x, y + s * 0.24, s * 0.055, accentCol || '#ffd700');
          }
        }
      },
      cloudSync: function(x, y, s, cloudCol, arrowCol, rimCol, t, v) {
        x = G._n(x); y = G._n(y); s = Math.max(24, Math.abs(G._n(s, 76)));
        var rt = G._rt(rimCol, t), rim = rt.r, tt = rt.t, lw = Math.max(1.8, s * 0.032), vv = G._v(v);
        var cc = cloudCol || '#38bdf8', ac = arrowCol || '#ffd700';
        G.disc(x - s * 0.23, y + s * 0.04, s * 0.22, cc, rim, lw);
        G.disc(x + s * 0.23, y + s * 0.04, s * 0.20, cc, rim, lw);
        G.disc(x, y - s * 0.09, s * 0.28, cc, rim, lw);
        G.box(x, y + s * 0.12, s * 0.52, s * 0.24, s * 0.06, cc, null, 0);
        G.pill(x - s * 0.24, y + s * 0.24, x + s * 0.24, y + s * 0.24, lw, rim);
        var dy = Math.sin(tt * 2.8) * s * 0.05;
        if (vv === 1) {
          G.arrow(x - s * 0.10, y + s * 0.17 + dy, x - s * 0.10, y - s * 0.10 + dy, s * 0.045, s * 0.11, ac);
          G.arrow(x + s * 0.10, y - s * 0.10 - dy, x + s * 0.10, y + s * 0.17 - dy, s * 0.045, s * 0.11, '#f8fafc');
        } else if (vv === 2) {
          G.box(x, y + s * 0.30, s * 0.62, s * 0.18, s * 0.05, '#1e293b', rim, lw * 0.9);
          G.disc(x - s * 0.14, y + s * 0.30, s * (0.04 + 0.012 * Math.sin(tt * 3.5)), ac, null, 0);
          G.disc(x + s * 0.04, y + s * 0.30, s * 0.04, '#00e5ff', null, 0);
          G.arrow(x, y + s * 0.14 + dy * 0.8, x, y - s * 0.10 + dy * 0.8, s * 0.05, s * 0.11, ac);
        } else if (vv === 3) {
          G.ring(x, y + s * 0.04, s * 0.14, s * 0.045, tt * 2.4, tt * 2.4 + Math.PI * 1.4, ac);
          G.disc(x, y + s * 0.04, s * 0.055, '#f8fafc', '#1e293b', lw * 0.6);
        } else {
          G.arrow(x, y + s * 0.18 + dy, x, y - s * 0.12 + dy, s * 0.055, s * 0.13, ac);
        }
      },
      robot: function(x, y, s, bodyCol, visorCol, eyeCol, rimCol, t, v) {
        x = G._n(x); y = G._n(y); s = Math.max(24, Math.abs(G._n(s, 76)));
        var rt = G._rt(rimCol, t), rim = rt.r, tt = rt.t, lw = Math.max(1.8, s * 0.034), vv = G._v(v);
        var bc = bodyCol || '#1e293b', vc = visorCol || '#0f172a', ec = eyeCol || '#00e5ff';
        if (vv === 2) {
          G.pill(x - s * 0.16, y - s * 0.28, x - s * 0.22, y - s * 0.44, s * 0.04, rim);
          G.pill(x + s * 0.16, y - s * 0.28, x + s * 0.22, y - s * 0.44, s * 0.04, rim);
          G.disc(x - s * 0.22, y - s * 0.45, s * 0.05, '#ffd700', rim, lw * 0.6);
          G.disc(x + s * 0.22, y - s * 0.45, s * 0.05, ec, rim, lw * 0.6);
        } else {
          G.pill(x, y - s * 0.28, x, y - s * 0.44, s * 0.045, rim);
          G.disc(x, y - s * 0.45, s * (0.065 + 0.015 * Math.sin(tt * 3.5)), '#ffd700', rim, lw * 0.7);
        }
        if (vv === 1) {
          G.box(x - s * 0.42, y + s * 0.02, s * 0.14, s * 0.28, s * 0.05, '#4f46e5', rim, lw * 0.8);
          G.box(x + s * 0.42, y + s * 0.02, s * 0.14, s * 0.28, s * 0.05, '#4f46e5', rim, lw * 0.8);
        }
        G.box(x, y + s * 0.03, s * 0.78, s * 0.60, vv === 2 ? s * 0.26 : s * 0.16, bc, rim, lw);
        G.box(x, y - s * 0.01, s * 0.56, s * 0.28, s * 0.09, vc, '#4f46e5', lw * 0.8);
        var er = s * (0.062 + 0.014 * Math.sin(tt * 3.2));
        if (vv === 2) {
          G.disc(x + Math.sin(tt * 2.2) * s * 0.15, y - s * 0.01, s * 0.08, ec, '#ffffff', lw * 0.5);
        } else {
          G.disc(x - s * 0.13, y - s * 0.01, er, ec, null, 0);
          G.disc(x + s * 0.13, y - s * 0.01, er, ec, null, 0);
        }
        if (vv === 1) {
          for (var mb = -1; mb <= 1; mb++) {
            G.bar(x + mb * s * 0.09, y + s * 0.24, s * 0.055, s * (0.07 + 0.04 * Math.abs(Math.sin(tt * 4.0 + mb))), s * 0.02, '#ffd700', null, 0);
          }
        } else {
          G.capsule(x, y + s * 0.20, s * (0.22 + 0.06 * Math.sin(tt * 3.0)), s * 0.055, '#38bdf8', null, 0);
        }
      },
      chip: function(x, y, s, pkgCol, pinCol, coreCol, rimCol, t, v) {
        x = G._n(x); y = G._n(y); s = Math.max(24, Math.abs(G._n(s, 76)));
        var rt = G._rt(rimCol, t), rim = rt.r, tt = rt.t, lw = Math.max(1.8, s * 0.032), vv = G._v(v);
        var pk = pkgCol || '#1e293b', pn = pinCol || '#38bdf8', cr = coreCol || '#ffd700';
        var offs = vv === 2 ? [-s * 0.18, -s * 0.06, s * 0.06, s * 0.18] : [-s * 0.16, 0, s * 0.16];
        for (var i = 0; i < offs.length; i++) {
          G.pill(x + offs[i], y - s * 0.42, x + offs[i], y - s * 0.26, s * 0.045, pn);
          G.pill(x + offs[i], y + s * 0.26, x + offs[i], y + s * 0.42, s * 0.045, pn);
          G.pill(x - s * 0.42, y + offs[i], x - s * 0.26, y + offs[i], s * 0.045, pn);
          G.pill(x + s * 0.26, y + offs[i], x + s * 0.42, y + offs[i], s * 0.045, pn);
        }
        if (vv === 3) G.ngon(x, y, s * 0.36, 8, Math.PI / 8, pk, rim, lw);
        else G.box(x, y, s * 0.62, s * 0.62, s * 0.08, pk, rim, lw);
        if (vv === 1) G.ngon(x, y, s * 0.22, 4, 0, '#4f46e5', rim, lw * 0.8);
        else G.box(x, y, s * 0.34, s * 0.34, s * 0.05, '#4f46e5', rim, lw * 0.8);
        if (vv === 2) G.star(x, y, s * (0.11 + 0.02 * Math.sin(tt * 3.4)), s * 0.05, 4, tt * 0.8, cr, rim, lw * 0.6);
        else G.disc(x, y, s * (0.095 + 0.025 * Math.sin(tt * 3.4)), cr, rim, lw * 0.65);
      },
      coinStack: function(x, y, s, coinCol, sideCol, starCol, rimCol, t, v) {
        x = G._n(x); y = G._n(y); s = Math.max(24, Math.abs(G._n(s, 76)));
        var rt = G._rt(rimCol, t), rim = rt.r, tt = rt.t, lw = Math.max(1.8, s * 0.034), vv = G._v(v);
        var cc = coinCol || '#ffd700', sc = sideCol || '#f59e0b', stc = starCol || '#ffffff';
        var k = 1 + 0.12 * Math.sin(tt * 3.0);
        if (vv === 1) {
          for (var cs = 0; cs < 3; cs++) {
            G.oval(x - s * 0.14, y + s * (0.18 - cs * 0.12), s * 0.28, s * 0.11, 0, cs === 2 ? cc : sc, rim, lw * 0.8);
          }
          G.disc(x + s * 0.16, y + s * (0.05 + 0.03 * Math.sin(tt * 2.6)), s * 0.26, cc, rim, lw);
          G.ngon(x + s * 0.16, y + s * (0.05 + 0.03 * Math.sin(tt * 2.6)), s * 0.11 * k, 4, 0, stc, '#b45309', lw * 0.65);
        } else if (vv === 2) {
          G.disc(x - s * 0.24, y + s * 0.06, s * 0.20, sc, rim, lw * 0.8);
          G.disc(x + s * 0.24, y + s * 0.06, s * 0.20, sc, rim, lw * 0.8);
          G.disc(x, y - s * 0.02, s * 0.30, cc, rim, lw);
          G.ring(x, y - s * 0.02, s * 0.21, s * 0.028, 0, Math.PI * 2, '#b45309');
          G.star(x, y - s * 0.02, s * 0.13 * k, s * 0.055 * k, 5, -Math.PI / 2, stc, '#b45309', lw * 0.65);
        } else if (vv === 3) {
          G.disc(x - s * 0.20, y + s * 0.14, s * 0.18, sc, rim, lw * 0.8);
          G.disc(x, y, s * 0.22, '#00e5ff', rim, lw * 0.85);
          G.disc(x + s * 0.18, y - s * 0.12, s * 0.25, cc, rim, lw);
          G.star(x + s * 0.18, y - s * 0.12, s * 0.11 * k, s * 0.05 * k, 5, -Math.PI / 2, stc, '#b45309', lw * 0.6);
        } else {
          G.disc(x - s * 0.14, y - s * 0.07, s * 0.27, sc, rim, lw * 0.85);
          G.disc(x + s * 0.07, y + s * 0.05, s * 0.34, cc, rim, lw);
          G.ring(x + s * 0.07, y + s * 0.05, s * 0.25, s * 0.028, 0, Math.PI * 2, '#b45309');
          G.star(x + s * 0.07, y + s * 0.05, s * 0.14 * k, s * 0.062 * k, 5, -Math.PI / 2, stc, '#b45309', lw * 0.7);
        }
      },
      part: function(a1, a2, a3, a4, a5, a6) {
        var fn, tx, ty, rot, sx, sy;
        if (typeof a1 === 'function') { fn = a1; tx = a2; ty = a3; rot = a4; sx = a5; sy = a6; }
        else { tx = a1; ty = a2; rot = a3; sx = a4; sy = a5; fn = a6; }
        if (typeof fn !== 'function') return;
        ctx.save();
        try {
          ctx.translate(G._n(tx, 0), G._n(ty, 0));
          if (rot) ctx.rotate(G._n(rot, 0));
          if (sx != null || sy != null) {
            var vsx = G._n(sx, 1);
            ctx.scale(vsx, sy != null ? G._n(sy, vsx) : vsx);
          }
          fn();
        } finally {
          ctx.restore();
        }
      },
      sheen: function() {
        // Disabled intentionally to prevent translucent floating rectangle/chroma-key halo leaks
      }
    };
`;

export function wrapCanvasCodeToHtml(
  rawCode: string,
  isGreenScreen: boolean = false,
  shapeAnalysisTag: string = ""
): string {
  const bg = isGreenScreen ? '#00ff00' : '#080c14';
  const clearFill = isGreenScreen ? "'#00ff00'" : "'#080c14'";

  let jsBody = stripLeadingCodeFenceAndLang(rawCode);

  let extractedAnalysisTag = shapeAnalysisTag;
  const analysisRegex = /<script\s+type=["']application\/json["']\s+id=["']shape-analysis["']>[\s\S]*?<\/script>/i;
  const analysisMatch = jsBody.match(analysisRegex);
  if (analysisMatch) {
    if (!extractedAnalysisTag) extractedAnalysisTag = analysisMatch[0];
    jsBody = jsBody.replace(analysisRegex, '').trim();
  }

  jsBody = sanitizeInjectedJsBody(jsBody);

  const fnMatch = jsBody.match(
    /(?:^|\n)[ \t]*(?:function\s+(drawFrame|renderFrame|renderIcon|drawIcon|drawScene|render|draw|paint)\s*\(|(?:const|let|var)\s+(drawFrame|renderFrame|renderIcon|drawIcon|drawScene|render|draw|paint)\s*=)/
  );
  const detectedDrawFn = fnMatch ? (fnMatch[1] || fnMatch[2]) : null;
  const hasAnimate = /(?:^|\n)[ \t]*(?:function\s+animate\s*\(|(?:const|let|var)\s+animate\s*=)/i.test(jsBody);

  const greenShadowLock = isGreenScreen
    ? `var __bigmaGS = true;
    try { Object.defineProperty(ctx, 'shadowBlur', { set: function(){}, get: function(){ return 0; }, configurable: true }); } catch(e) {}
    try {
      var __gsAlpha = 1;
      var __origAlphaDesc = typeof CanvasRenderingContext2D !== 'undefined' ? Object.getOwnPropertyDescriptor(CanvasRenderingContext2D.prototype, 'globalAlpha') : null;
      if (__origAlphaDesc && __origAlphaDesc.set) {
        Object.defineProperty(ctx, 'globalAlpha', {
          set: function(v){ __gsAlpha = (typeof v === 'number' && isFinite(v)) ? Math.max(0.92, Math.min(1, v)) : 1; __origAlphaDesc.set.call(ctx, __gsAlpha); },
          get: function(){ return __gsAlpha; },
          configurable: true
        });
      }
    } catch(e) {}`
    : `var __bigmaGS = false;`;

  const runnerScript = detectedDrawFn
    ? `${jsBody}
  var __bigmaTargetDraw = typeof ${detectedDrawFn} === 'function' ? ${detectedDrawFn} : null;
  function __bigmaAnimate(time) {
    var __curW = window.innerWidth || document.documentElement.clientWidth || 800;
    var __curH = window.innerHeight || document.documentElement.clientHeight || 600;
    if (__curW > 0 && __curH > 0 && (__curW !== w || __curH !== h || canvas.width === 0)) {
      __bigmaResize();
    }
    var t = (time || 0) * 0.001;
    __bigmaT = t;
    try {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = ${clearFill};
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.miterLimit = 2;
      ctx.globalCompositeOperation = 'source-over';
      ctx.save();
      if (__bigmaTargetDraw) __bigmaTargetDraw(ctx, w, h, cx, cy, S, t);
      ctx.restore();
    } catch (err) {
      console.error("Canvas render error:", err);
      try { ctx.restore(); } catch {}
    }
    requestAnimationFrame(__bigmaAnimate);
  }
  requestAnimationFrame(__bigmaAnimate);`
    : hasAnimate
    ? `${jsBody}
  var __bigmaUserAnim = typeof animate === 'function' ? animate : null;
  if (__bigmaUserAnim) {
    try { requestAnimationFrame(__bigmaUserAnim); } catch {}
  }`
    : `function __bigmaRawDraw(ctx, w, h, cx, cy, S, t) {
${jsBody}
  }
  function __bigmaAnimate(time) {
    var __curW = window.innerWidth || document.documentElement.clientWidth || 800;
    var __curH = window.innerHeight || document.documentElement.clientHeight || 600;
    if (__curW > 0 && __curH > 0 && (__curW !== w || __curH !== h || canvas.width === 0)) {
      __bigmaResize();
    }
    var t = (time || 0) * 0.001;
    __bigmaT = t;
    try {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = ${clearFill};
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.miterLimit = 2;
      ctx.globalCompositeOperation = 'source-over';
      ctx.save();
      __bigmaRawDraw(ctx, w, h, cx, cy, S, t);
      ctx.restore();
    } catch (err) {
      console.error("Canvas render error:", err);
      try { ctx.restore(); } catch {}
    }
    requestAnimationFrame(__bigmaAnimate);
  }
  requestAnimationFrame(__bigmaAnimate);`;

  return `<!DOCTYPE html>
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
  ${extractedAnalysisTag}
</head>
<body>
  <canvas id="c"></canvas>
  <script>
    var canvas = document.getElementById('c');
    var ctx = canvas.getContext('2d');
    ${greenShadowLock}
    ${STUDIO_GEOMETRY_ENGINE_JS}
    var w = 800, h = 600, cx = 400, cy = 300, S = 324, R = 233, dpr = 1;
    __bigmaV = ${Math.floor(Math.random() * 1000000)};
    function __bigmaResize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth || document.documentElement.clientWidth || 800;
      h = window.innerHeight || document.documentElement.clientHeight || 600;
      canvas.width = Math.max(1, Math.floor(w * dpr));
      canvas.height = Math.max(1, Math.floor(h * dpr));
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
      cx = w / 2;
      cy = h / 2;
      S = Math.min(w, h) * 0.54;
      R = S * 0.72;
    }
    var resize = __bigmaResize;
    window.addEventListener('resize', __bigmaResize);
    __bigmaResize();
    ${runnerScript}
  </script>
</body>
</html>`;
}

export function extractHTMLFromMarkdown(text: string, isGreenScreen: boolean = false): string {
  const tick3 = String.fromCharCode(96, 96, 96);
  let cleanHTML = stripLeadingCodeFenceAndLang(text);

  const htmlFenceRegex = new RegExp(tick3 + 'html\\s*([\\s\\S]*?)' + tick3, 'i');
  const htmlMatch = (text || '').match(htmlFenceRegex);
  if (htmlMatch && htmlMatch[1]) {
    cleanHTML = htmlMatch[1].trim();
  } else {
    const startIdx = (text || '').toLowerCase().indexOf('<!doctype');
    const endIdx = (text || '').toLowerCase().lastIndexOf('</html>');
    if (startIdx !== -1 && endIdx !== -1) {
      cleanHTML = text.substring(startIdx, endIdx + 7).trim();
    }
  }

  cleanHTML = stripLeadingCodeFenceAndLang(cleanHTML);

  const lower = cleanHTML.toLowerCase();
  const bg = isGreenScreen ? '#00ff00' : '#080c14';

  const looksLikePureJs = !lower.includes('<!doctype') && !lower.includes('<html') && !lower.includes('<canvas');
  if (
    looksLikePureJs &&
    (/(?:function\s+(?:drawFrame|renderFrame|drawIcon|drawScene|render|draw|paint|animate)\s*\(|ctx\.(?:fill|stroke|beginPath|roundRect|arc|ellipse|bezierCurveTo|lineTo))/i.test(cleanHTML))
  ) {
    return wrapCanvasCodeToHtml(cleanHTML, isGreenScreen);
  }

  if (!lower.includes('<!doctype') || !lower.includes('</html>')) {
    if (lower.includes('<script') || lower.includes('requestanimationframe') || lower.includes('<canvas')) {
      let bodyContent = cleanHTML;
      if (!bodyContent.toLowerCase().includes('</script>')) {
        bodyContent += '\n  }\n  requestAnimationFrame(animate);\n</' + 'script>';
      }
      if (!bodyContent.toLowerCase().includes('<canvas')) {
        bodyContent = `<canvas id="c"></canvas>\n` + bodyContent;
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

  if (isGreenScreen && lower.includes('<style')) {
    cleanHTML = cleanHTML.replace(
      /(html\s*,\s*body\s*\{[^}]*background(?:-color)?\s*:\s*)(#[0-9a-fA-F]{3,8}|rgba?\([^)]+\)|[a-z]+)/gi,
      '$1#00ff00'
    );
  }

  if (cleanHTML.includes('function animate(') && !cleanHTML.includes('catch')) {
    cleanHTML = cleanHTML.replace(
      /function animate\s*\(([^)]*)\)\s*\{([\s\S]*?)(requestAnimationFrame\s*\(\s*animate\s*\);?\s*\})/,
      (fullMatch, param, body, reqCall) => {
        if (body.includes('try {')) return fullMatch;
        return `function animate(${param}) {\n    try {\n${body}\n    } catch (err) {\n      console.error("Canvas render error:", err);\n    }\n    ${reqCall}`;
      }
    );
  }

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

// Logic for testing a single API key with target model support and resilient diagnostics
export function extractCleanApiKey(rawKey: string): string {
  if (!rawKey) return "";
  let key = rawKey.trim();
  key = key.replace(/^["'`\s]+|["'`\s,;]+$/g, "");
  const match = key.match(/AIza[0-9A-Za-z-_]{35}/);
  if (match) {
    return match[0];
  }
  return key;
}

// Logic for testing a single API key with target model support and resilient diagnostics
export async function handleTestSingleKeyLogic(rawKey: string, requestedModel?: string) {
  let key = extractCleanApiKey(rawKey);
  const isDefaultOrSystem = !key || key.toLowerCase() === "default" || key.toLowerCase() === "system";
  if (isDefaultOrSystem && process.env.GEMINI_API_KEY) {
    key = process.env.GEMINI_API_KEY.trim();
  }

  const maskedKey = (isDefaultOrSystem && process.env.GEMINI_API_KEY)
    ? "Server System Key (Aktif)"
    : key.length > 10
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

  const primaryModel = sanitizeModel(requestedModel || "gemini-3.8-flash");
  // Test only primaryModel + max 1 GA fallback to avoid wasting RPM quota during key checks
  const candidateModels = Array.from(new Set([
    primaryModel,
    "gemini-2.5-flash",
  ])).slice(0, 2);

  const ai = new GoogleGenAI({
    apiKey: key,
    httpOptions: { headers: { "User-Agent": "aistudio-build" } },
  });

  let lastError: any = null;
  let encounteredQuota = false;

  for (const model of candidateModels) {
    try {
      let timerId: any = null;
      const timeoutPromise = new Promise((_, reject) => {
        timerId = setTimeout(() => reject(new Error("Timeout verifikasi (> 4s)")), 4000);
      });

      const probePromise = (async () => {
        try {
          return await ai.models.countTokens({
            model,
            contents: "ping",
          });
        } catch (tokErr: any) {
          const cleanTok = cleanErrorMessage(tokErr);
          const tokMsg = cleanTok.toLowerCase();
          if (
            tokMsg.includes("api_key_invalid") ||
            tokMsg.includes("api key not valid") ||
            tokMsg.includes("key is not valid") ||
            tokMsg.includes("invalid api key") ||
            tokMsg.includes("api_key_expired") ||
            tokMsg.includes("unauthenticated") ||
            tokMsg.includes("401")
          ) {
            throw tokErr;
          }
          return await ai.models.generateContent({
            model,
            contents: "hi",
            config: { maxOutputTokens: 1 },
          });
        }
      })();

      try {
        await Promise.race([probePromise, timeoutPromise]);
        return {
          key,
          maskedKey,
          valid: true,
          testedModel: model,
          latencyMs: Date.now() - start,
        };
      } finally {
        if (timerId) clearTimeout(timerId);
      }
    } catch (err: any) {
      lastError = err;
      const cleanMsg = cleanErrorMessage(err);
      const msg = cleanMsg.toLowerCase();

      const isTrueKeyInvalid =
        msg.includes("api_key_invalid") ||
        msg.includes("api key not valid") ||
        msg.includes("key is not valid") ||
        msg.includes("invalid api key") ||
        msg.includes("api_key_expired") ||
        msg.includes("unauthenticated") ||
        msg.includes("401");

      if (isTrueKeyInvalid) {
        return {
          key,
          maskedKey,
          valid: false,
          error: "API Key tidak valid atau salah",
          latencyMs: Date.now() - start,
        };
      }

      if (msg.includes("resource_exhausted") || msg.includes("429") || msg.includes("quota")) {
        encounteredQuota = true;
        continue;
      }

      continue;
    }
  }

  if (encounteredQuota) {
    return {
      key,
      maskedKey,
      valid: true,
      isQuotaLimit: true,
      error: "Key Valid • Kuota limit sementara (Gunakan model Gemini 3.8/3.5)",
      latencyMs: Date.now() - start,
    };
  }

  const rawMsg = cleanErrorMessage(lastError) || "Gagal verifikasi API key";
  return {
    key,
    maskedKey,
    valid: false,
    error: rawMsg.length > 70 ? rawMsg.substring(0, 70) + "..." : rawMsg,
    latencyMs: Date.now() - start,
  };
}

// Logic for testing all models compatibility with an API key
export async function handleTestModelsLogic(rawKey: string) {
  let key = (rawKey || "").trim();
  if ((!key || key.toLowerCase() === "default" || key.toLowerCase() === "system") && process.env.GEMINI_API_KEY) {
    key = process.env.GEMINI_API_KEY.trim();
  }
  if (!key) {
    return {
      success: false,
      error: "API Key tidak boleh kosong",
      models: [],
    };
  }

  const modelsToTest = [
    { id: "gemini-3.8-flash", name: "Gemini 3.8 Flash", badge: "Next-Gen Flagship (Animasi Super Pintar)" },
    { id: "gemini-3.6-flash", name: "Gemini 3.6 Flash", badge: "Pintar, Elegan & Detail Kompleks" },
    { id: "gemini-3.5-flash-lite", name: "Gemini 3.5 Flash Lite", badge: "Next-Gen Pintar & Hemat" },
    { id: "gemini-3.1-flash-lite", name: "Gemini 3.1 Flash Lite", badge: "Super Ringan (RPM Tinggi)" },
    { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", badge: "Stabil & Teruji" },
    { id: "gemini-3.1-pro-preview", name: "Gemini 3.1 Pro Preview", badge: "Masterpiece Rigging" },
  ];

  const ai = new GoogleGenAI({
    apiKey: key,
    httpOptions: { headers: { "User-Agent": "aistudio-build" } },
  });

  // Probe in gentle batches of 2 with 150ms spacing to prevent burst 429 rate-limiting on free-tier keys
  const modelResults: any[] = [];
  for (let i = 0; i < modelsToTest.length; i += 2) {
    const pair = modelsToTest.slice(i, i + 2);
    const pairResults = await Promise.all(
      pair.map(async (m) => {
        const start = Date.now();
        try {
          let timerId: any = null;
          const toPromise = new Promise((_, reject) => {
            timerId = setTimeout(() => reject(new Error("Timeout (> 6s)")), 6000);
          });

          const testTargetModel = sanitizeModel(m.id);
          // Zero-output-token countTokens probe first (preserves generation quota)
          const testRun = ai.models.countTokens({
            model: testTargetModel,
            contents: "ping",
          });

          try {
            await Promise.race([testRun, toPromise]);
            return {
              id: m.id,
              name: m.name,
              badge: m.badge,
              status: "active" as const,
              valid: true,
              latencyMs: Date.now() - start,
              message: "Siap Digunakan • Hemat Token",
            };
          } finally {
            if (timerId) clearTimeout(timerId);
          }
        } catch (err: any) {
          const raw = cleanErrorMessage(err);
          const lower = raw.toLowerCase();

          if (
            lower.includes("api_key_invalid") ||
            lower.includes("api key not valid") ||
            lower.includes("key is not valid")
          ) {
            return {
              id: m.id,
              name: m.name,
              badge: m.badge,
              status: "invalid_key" as const,
              valid: false,
              latencyMs: Date.now() - start,
              message: "API Key Salah / Tidak Ditemukan",
            };
          }

          if (lower.includes("resource_exhausted") || lower.includes("429") || lower.includes("quota")) {
            return {
              id: m.id,
              name: m.name,
              badge: m.badge,
              status: "quota_exhausted" as const,
              valid: true,
              latencyMs: Date.now() - start,
              message: "Key Valid • Kuota Limit (Gunakan Model Lain)",
            };
          }

          if (lower.includes("not found") || lower.includes("404") || lower.includes("unrecognized") || lower.includes("not supported")) {
            return {
              id: m.id,
              name: m.name,
              badge: m.badge,
              status: "not_available" as const,
              valid: true,
              latencyMs: Date.now() - start,
              message: "Model Belum Tersedia di Region Akun Ini",
            };
          }

          if (lower.includes("permission") || lower.includes("403")) {
            return {
              id: m.id,
              name: m.name,
              badge: m.badge,
              status: "permission_denied" as const,
              valid: true,
              latencyMs: Date.now() - start,
              message: "Akses Belum Diaktifkan di GCP Console",
            };
          }

          return {
            id: m.id,
            name: m.name,
            badge: m.badge,
            status: "network_issue" as const,
            valid: true,
            latencyMs: Date.now() - start,
            message: lower.includes("timeout") ? "Respon Lambat (> 6s)" : raw.substring(0, 50),
          };
        }
      })
    );
    modelResults.push(...pairResults);
    if (i + 2 < modelsToTest.length) {
      await new Promise((res) => setTimeout(res, 150));
    }
  }

  const activeCount = modelResults.filter((r) => r.status === "active").length;
  const isKeyValid = !modelResults.some((r) => r.status === "invalid_key");

  return {
    success: true,
    isKeyValid,
    activeCount,
    total: modelResults.length,
    models: modelResults,
  };
}

export async function handleTestKeysLogic(keysInput: any, requestedModel?: string) {
  let keys: string[] = [];
  if (Array.isArray(keysInput)) {
    keys = keysInput;
  } else if (typeof keysInput === "string") {
    keys = [keysInput];
  }

  if (keys.length === 0) {
    return { results: [], validCount: 0, total: 0 };
  }

  const concurrency = 5;
  const results: any[] = new Array(keys.length);

  for (let i = 0; i < keys.length; i += concurrency) {
    const chunk = keys.slice(i, i + concurrency);
    const chunkResults = await Promise.all(
      chunk.map((k) => handleTestSingleKeyLogic(k, requestedModel))
    );
    for (let j = 0; j < chunkResults.length; j++) {
      results[i + j] = chunkResults[j];
    }
  }

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
  // Keep top 8 concise snippets for anti-repetition to save hundreds of input tokens per request
  const mergedBank = Array.from(new Set([...previousPrompts, ...serverPromptHistoryBank]))
    .slice(0, 8)
    .map((p) => p.substring(0, 75));
  const negativeList = mergedBank.length > 0
    ? `\nAVOID repeating concepts similar to: ${mergedBank.join(' | ')}`
    : '';

  const dynamicSessionSeed = `${Date.now().toString(36)}-${Math.floor(Math.random() * 100000).toString(36)}`;

  const targetCount = Math.max(1, count || 1);
  const CHUNK_SIZE = 10;
  const numChunks = Math.ceil(targetCount / CHUNK_SIZE);
  let allPrompts: string[] = [];

  for (let c = 0; c < numChunks; c++) {
    const needed = targetCount - allPrompts.length;
    if (needed <= 0) break;
    const batchCount = Math.min(CHUNK_SIZE, needed);

    const isSingle = batchCount === 1;
    let promptContent = '';
    if (type === 'bg') {
      promptContent = `Motion Director. Generate ${batchCount} unique FULL-FRAME 60 FPS looping MOTION BACKGROUND prompt(s) in English (Seed: ${dynamicSessionSeed}).
RULES: Edge-to-edge waves/grids/silk caustics; match motion organically to each scene; NO centered icons, NO particles, NO white flares.${negativeList}
${categoryLine}Style: ${style}${colorModeDirective}${glowDirective}
${typeInstruction}${keywordsDirective}${greenScreenDirective}
Return JSON array of ${batchCount} crisp 1-sentence string(s).`;
    } else {
      promptContent = `Motion Director. Generate ${batchCount} unique standalone 3D ICON motion prompt(s) in English (Seed: ${dynamicSessionSeed}).
RULES: Clean sculpted 3D icon built from 3-4 welded proportional parts, 45-deg chiaroscuro, 1.5px bevel rim; choose motion naturally matching the specific icon; ZERO rhombus/plate/card/gears/particles/floor-shadow.${negativeList}
${categoryLine}Style: ${style === 'minimalist' ? '3d_crest' : style}${colorModeDirective}${glowDirective}
${typeInstruction}${keywordsDirective}${greenScreenDirective}
Return JSON array of ${batchCount} crisp 1-sentence string(s).`;
    }

    try {
      const { response } = await generateContentWithFallback(
        ai,
        targetModel,
        (currentModel) => {
          const batchMaxTokens = isSingle ? 120 : Math.min(1100, Math.max(220, batchCount * 65));
          const config: any = {
            temperature: 0.9,
            maxOutputTokens: batchMaxTokens,
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.ARRAY,
              items: {
                type: Type.STRING,
              },
            },
          };
          const thinkingConfig = getSmartThinkingConfig(currentModel, 'prompt');
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

let __serverVariationSeq = 0;

const SERVER_VARIATION_PALETTES: string[][] = [
  ['#1E293B', '#4F46E5', '#00E5FF', '#FFD700'],
  ['#0F172A', '#0284C7', '#38BDF8', '#F97316'],
  ['#1E1B4B', '#7C3AED', '#22D3EE', '#FACC15'],
  ['#1F2937', '#E11D48', '#FB923C', '#F8FAFC'],
  ['#0F172A', '#2563EB', '#F59E0B', '#38BDF8'],
  ['#1E293B', '#9333EA', '#00E5FF', '#FB7185'],
  ['#172554', '#0EA5E9', '#F43F5E', '#FFD700'],
  ['#27272A', '#6366F1', '#EC4899', '#FBBF24'],
];

const SERVER_VARIATION_MOTIONS: string[] = [
  'bobY=Math.sin(t*2.2)*0.03*R, rot=Math.sin(t*1.4)*0.028',
  'bobY=Math.cos(t*2.4)*0.032*R, rot=Math.sin(t*1.6)*0.032, sc=1+0.025*Math.sin(t*2.8)',
  'bobX=Math.sin(t*1.5)*0.018*R, bobY=Math.sin(t*2.5)*0.03*R, rot=Math.cos(t*1.5)*0.025',
  'bobY=Math.sin(t*2.0+0.8)*0.034*R, rot=-Math.sin(t*1.7)*0.03, sx=1+0.02*Math.sin(t*2.6), sy=1-0.02*Math.sin(t*2.6)',
  'bobY=Math.sin(t*2.7)*0.028*R, rot=Math.sin(t*1.9)*0.035',
  'bobY=Math.cos(t*2.1)*0.03*R, sc=1+0.03*Math.cos(t*2.4), rot=Math.sin(t*1.3)*0.022',
];

function createServerUniqueVariationSeed(promptTopic: string, slotIndex: number = 0, forceSalt: number = 0) {
  __serverVariationSeq = (__serverVariationSeq + 1) % 1000000;
  let topicHash = 0;
  const txt = String(promptTopic || '');
  for (let i = 0; i < txt.length; i++) {
    topicHash = ((topicHash << 5) - topicHash + txt.charCodeAt(i)) | 0;
  }
  const timeMix = Date.now() ^ Math.floor(Math.random() * 1000003) ^ (__serverVariationSeq * 2654435761);
  const absMix = Math.abs(timeMix + topicHash);
  const slot = Math.max(0, Math.floor(slotIndex));
  const salt = Math.max(0, Math.floor(forceSalt));

  const variantIdx = (absMix + slot + salt) % 4;
  const paletteIdx = ((absMix >> 2) + slot * 3 + salt * 5) % SERVER_VARIATION_PALETTES.length;
  const motionIdx = ((absMix >> 4) + slot * 2 + salt * 3) % SERVER_VARIATION_MOTIONS.length;
  const tag = `V${variantIdx}-${(absMix % 8999) + 1000}-${__serverVariationSeq}`;

  return {
    variantIdx,
    palette: SERVER_VARIATION_PALETTES[paletteIdx],
    motionExpr: SERVER_VARIATION_MOTIONS[motionIdx],
    tag,
  };
}

function normalizeServerCodeFingerprint(codeOrHtml: string): string {
  const src = String(codeOrHtml || '');
  if (!src.trim()) return '';
  let body = src;
  const scriptMatch = src.match(/__bigmaResize\(\);([\s\S]*?)var\s+__bigmaTargetDraw/);
  if (scriptMatch && scriptMatch[1]) {
    body = scriptMatch[1];
  } else {
    const fnStart = src.indexOf('function drawFrame');
    if (fnStart !== -1) body = src.slice(fnStart);
  }
  return body
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '')
    .replace(/\s+/g, '')
    .trim();
}

export function resolveServerPromptMotionPlan(
  promptTopic: string,
  type: string,
  overrideMode?: string,
  variantIdx: number = 0
): { label: string; anatomyHint: string; codeHint: string } {
  const v = Math.abs(Math.floor(variantIdx || 0)) % 4;
  if (type === 'bg') {
    const bgStyles = [
      '3-4 smooth full-width layered cosine ribbons spanning -0.1*w..1.1*w across 0..h.',
      'perspective isometric wireframe grid planes sweeping seamlessly across 0..w, 0..h.',
      'diagonal flowing wave bands + clean concentric aura arcs across -0.1*w..1.1*w.',
      'soft gradient horizon curves with synchronized geometric bar pulses across 0..w, 0..h.',
    ];
    return {
      label: `full-frame harmonic wave (v${v})`,
      anatomyHint: bgStyles[v],
      codeHint: 'seamless cosine ribbon drift & depth phase shift across 0..w, 0..h',
    };
  }
  const topic = (promptTopic || '').toLowerCase();
  if (/\b(video\s*conferenc\w*|video\s*call\w*|teleconferenc\w*|webinar\w*|zoom\s*call|online\s*meeting|virtual\s*meeting)\b/.test(topic)) {
    return {
      label: `video conference display (v${v})`,
      anatomyHint: `Call G.videoCall(0, 0, 1.06*R, frameCol, tileCol, accentCol, "#F8FAFC", t, ${v}) inside G.part — widescreen monitor with webcam & live remote participant tiles!`,
      codeHint: 'upright monitor float bobY=Math.sin(t*2.1)*0.025*R, rot=Math.sin(t*1.4)*0.025 + speaker tile pulse inside screen',
    };
  }
  if (/\b(meeting\s+table|conference\s+table|boardroom|roundtable|conference\s+room)\b/.test(topic)) {
    return {
      label: `conference table ensemble (v${v})`,
      anatomyHint: `TOP-DOWN CONFERENCE TABLE (v=${v}): draw 4 docked G.person seats at (0,-0.34*R), (0,0.34*R), (-0.46*R,0), (0.46*R,0) FIRST; THEN centered table G.box(0,0.02*R,0.74*R,0.40*R,0.14*R) overlapping seat edges; LAST center tablet G.box(0,0.02*R,0.24*R,0.14*R,0.03*R) with ${v % 2 === 0 ? 'G.check' : 'G.chart'} glyph.`,
      codeHint: 'upright float bobY=Math.sin(t*2.1)*0.025*R + subtle synchronized chair breath ±0.02*R staying docked to table',
    };
  }
  if (/\b(office\s+desk|desk|workstation|workspace|cubicle|study\s+table)\b/.test(topic)) {
    return {
      label: `organized desk workstation (v${v})`,
      anatomyHint: `UPRIGHT OFFICE DESK: desk pedestals G.box(±0.34*R,0.24*R,0.20*R,0.34*R,0.03*R) + wide top G.box(0,0.06*R,1.02*R,0.10*R,0.03*R) + monitor stand & G.chart(0,-0.22*R,0.48*R,"#0F172A","#38BDF8","#00E5FF","#FFD700","#F8FAFC",t,${v}) resting flush on top + gold lamp G.disc(${v % 2 === 0 ? '-0.36*R' : '0.36*R'},-0.20*R,0.08*R,"#FFD700").`,
      codeHint: 'upright float bobY=Math.sin(t*2.1)*0.025*R, rot=Math.sin(t*1.4)*0.025 + chart telemetry inside monitor',
    };
  }
  if (/\b(laptop|notebook|macbook|ultrabook|computer|desktop|monitor|screen)\b/.test(topic)) {
    return {
      label: `laptop productivity workstation (v${v})`,
      anatomyHint: `Call G.laptop(0, 0, 1.06*R, bodyCol, "#0F172A", accentCol, "#F8FAFC", t, ${v}) inside G.part — unmistakably a laptop screen & keyboard deck with animated telemetry inside!`,
      codeHint: 'upright hover bobY=Math.sin(t*2.2)*0.028*R, rot=Math.sin(t*1.5)*0.025 + internal screen task/chart animation',
    };
  }
  if (/\b(ui\s*layout|ui|ux|wireframe|interface|app\s*design|landing\s*page|mockup|website|web\s*app|software|code)\b/.test(topic)) {
    return {
      label: `interactive UI layout (v${v})`,
      anatomyHint: `Call G.uiLayout(0, 0, 1.06*R, frameCol, headerCol, accentCol, "#F8FAFC", t, ${v}) inside G.part — NEVER draw plain circles/squares!`,
      codeHint: 'upright hover bobY=Math.sin(t*2.2)*0.03*R, rot=Math.sin(t*1.5)*0.025 + internal UI sidebar & card reveal driven by t',
    };
  }
  if (/\b(hiring|recruit\w*|talent|candidate|hr|human\s*resources|interview|onboarding|staffing|resume|cv)\b/.test(topic)) {
    return {
      label: `talent profile verification (v${v})`,
      anatomyHint: `Call G.userBadge(0, 0, 1.06*R, cardCol, personCol, accentCol, "#F8FAFC", t, ${v}) inside G.part — clean HR card with person & verified badge!`,
      codeHint: 'upright hover bobY=Math.sin(t*2.2)*0.03*R, rot=Math.sin(t*1.5)*0.03 + pulsing verification checkmark & animated profile lines',
    };
  }
  if (/\b(productivity|efficiency|checklist|todo|to-do|task\s*management|kanban|sprint|workflow)\b/.test(topic)) {
    return {
      label: `sequential task completion (v${v})`,
      anatomyHint: `Call G.checklist(0, 0, 1.04*R, boardCol, clipCol, accentCol, "#F8FAFC", t, ${v}) inside G.part — NEVER draw plain power discs or sagging corner boxes!`,
      codeHint: 'upright hover bobY=Math.sin(t*2.2)*0.03*R, rot=Math.sin(t*1.5)*0.03 + sequential animated task bars & checkmarks inside clipboard',
    };
  }
  if (/\b(typography|font|lettering|typeface|editorial|copywriting|graphic\s*design|artboard|branding|vector)\b/.test(topic)) {
    return {
      label: `editorial artboard precision (v${v})`,
      anatomyHint: `Call G.typography(0, 0, 1.06*R, cardCol, inkCol, accentCol, "#F8FAFC", t, ${v}) inside G.part — crisp vector artboard & animated guide cursor!`,
      codeHint: 'upright hover bobY=Math.sin(t*2.2)*0.03*R, rot=Math.sin(t*1.5)*0.025 + crisp baseline cursor glide',
    };
  }
  if (/\b(pie\s*chart|pie|donut|market\s*share|allocation|budget\s*breakdown|proportion)\b/.test(topic)) {
    return {
      label: `segmented pie expansion (v${v})`,
      anatomyHint: `Call G.pieChart(0, 0, 1.08*R, baseCol, s1Col, s2Col, s3Col, "#F8FAFC", t, ${v}) inside G.part — bold full-sized animated pie slices!`,
      codeHint: 'upright float bobY=Math.sin(t*2.2)*0.03*R, rot=Math.sin(t*1.4)*0.03 + active radial pie wedge pop',
    };
  }
  if (/\b(market\s*research|research|survey|discovery|audit|inspect\w*|seo|search|magnifying|investigat\w*)\b/.test(topic)) {
    return {
      label: `optical lens research scan (v${v})`,
      anatomyHint: `Call G.magnifier(0, 0, 1.08*R, cardCol, lensCol, handleCol, accentCol, "#F8FAFC", t, ${v}) inside G.part — sweeping magnifying lens over data card!`,
      codeHint: 'upright hover bobY=Math.sin(t*2.1)*0.025*R + continuous smooth circular magnifying lens sweep over card',
    };
  }
  if (/\b(entrepreneur\w*|startup|launch|venture|founder|rocket|boost|scaleup|scale-up|accelerate)\b/.test(topic)) {
    return {
      label: `ascendant rocket launch (v${v})`,
      anatomyHint: `Call G.rocket(0, 0, 1.06*R, hullCol, wingCol, flameCol, "#F8FAFC", t, ${v}) inside G.part(cx, cy+bobY, -0.18+rot, 1, 1, fn) — unmistakable rocket!`,
      codeHint: 'dynamic thrust bobY=Math.sin(t*3.2)*0.04*R, slight diagonal flight angle + pulsing exhaust plume',
    };
  }
  if (/\b(opportunity|breakthrough|lightbulb|idea|bulb|innovation|creative|spark|brainstorm|insight|vision)\b/.test(topic)) {
    return {
      label: `radiant idea glow (v${v})`,
      anatomyHint: `Call G.lightbulb(0, 0, 1.06*R, bulbCol, rayCol, baseCol, "#F8FAFC", t, ${v}) inside G.part — NEVER draw G.rays alone without solid glass bulb!`,
      codeHint: 'upright float bobY=Math.sin(t*2.3)*0.035*R, rot=Math.sin(t*1.5)*0.03 + rhythmic radial ray pulse around glass dome',
    };
  }
  if (/\b(shopping\s*cart|cart|trolley|ecommerce|e-commerce|checkout|retail|marketplace)\b/.test(topic)) {
    return {
      label: `shopping cart glide (v${v})`,
      anatomyHint: 'Draw 2 tucked parcel boxes G.box(0.06*R,-0.24*R+bobItem,0.24*R,0.22*R,0.04*R,accCol,"#F8FAFC",2) FIRST, THEN G.cart(0,0.06*R,0.96*R,bodyCol,wheelCol,"#F8FAFC") cleanly in front!',
      codeHint: 'gentle horizontal glide offsetX=Math.sin(t*2.2)*0.05*R + suspension bounce & parcel settle inside basket',
    };
  }
  if (/\b(procurement|purchase|order|supply\s*chain|inventory|warehouse|logistics|vendor)\b/.test(topic)) {
    return {
      label: `procurement manifest sync (v${v})`,
      anatomyHint: `Call G.checklist(0, 0, 1.04*R, bodyCol, clipCol, accentCol, "#F8FAFC", t, ${v}) + welded top-right gold badge G.disc(0.32*R,-0.32*R,0.14*R,"#FFD700","#F8FAFC",2) inside G.part.`,
      codeHint: 'upright float bobY=Math.sin(t*2.2)*0.03*R, rot=Math.sin(t*1.5)*0.03 + sequential manifest check animation',
    };
  }
  if (/\b(digital\s*wallet|e-wallet|wallet|purse|mobile\s*pay|fintech)\b/.test(topic)) {
    return {
      label: `digital wallet card reveal (v${v})`,
      anatomyHint: `Draw peeking payment card G.box(${v % 2 === 0 ? '-0.08*R' : '0.06*R'}, -0.22*R + Math.sin(t*2.4)*0.06*R, 0.58*R, 0.34*R, 0.05*R, accCol, "#F8FAFC", 2) FIRST, THEN G.wallet(0, 0.08*R, 0.98*R, bodyCol, flapCol, claspCol, "#F8FAFC") overlapping lower half!`,
      codeHint: 'upright wallet hover bobY=Math.sin(t*2.2)*0.03*R + smooth vertical card reveal & golden clasp pulse',
    };
  }
  if (/\b(reputation|trust|credibility|review|rating|endorsement|testimonial|brand\s*image)\b/.test(topic)) {
    return {
      label: `trust crest radiance (v${v})`,
      anatomyHint: `Call G.shield(0, 0.02*R, 0.96*R, shieldCol, "#F8FAFC", "#1E293B") + pulsing centered gold G.${v % 2 === 0 ? 'star' : 'check'}(0, 0.02*R, ...) LAST on top.`,
      codeHint: 'upright heraldic float bobY=Math.sin(t*2.2)*0.03*R, rot=Math.sin(t*1.5)*0.03 + centered emblem pulse',
    };
  }
  if (/\b(global\s*comm\w*|international|worldwide|globe|global|world|earth|continent)\b/.test(topic)) {
    return {
      label: `orbital global relay (v${v})`,
      anatomyHint: `Call G.globe(0, 0.02*R, 0.44*R, sphereCol, lineCol, "#F8FAFC") + tilted ring G.oval(0, 0.02*R, 0.56*R, 0.20*R, ${v % 2 === 0 ? '-0.35' : '0.35'}, null, "#FFD700", 0.045*R) + 2 orbiting signal nodes G.disc.`,
      codeHint: 'upright globe hover bobY=Math.sin(t*2.1)*0.025*R + continuous orbiting satellite relay nodes along tilted ellipse',
    };
  }
  if (/\b(megaphone|broadcast|announce\w*|marketing|campaign|publicity|loudspeaker)\b/.test(topic)) {
    return {
      label: `acoustic broadcast wave (v${v})`,
      anatomyHint: 'Call G.megaphone(-0.12*R, 0.02*R, 0.90*R, coneCol, handleCol, accCol, "#F8FAFC") + 2 right-opening G.ring(0.24*R, 0, r1/r2, 0.045*R, -0.58, 0.58, col). NEVER bisect cone vertically!',
      codeHint: 'recoil tilt rot=-0.05+Math.sin(t*3.2)*0.05 + bobY=Math.sin(t*2.5)*0.03*R + expanding acoustic wave arcs',
    };
  }
  if (/\b(handshake|deal|agreement)\b/.test(topic)) {
    return {
      label: `executive handshake clasp (v${v})`,
      anatomyHint: `Call G.handshake(0, 0.04*R, 0.62*R, cL, cR, "#F59E0B", "#F8FAFC", "#1E293B") + crisp top emblem G.disc(0,-0.32*R,0.12*R,accCol,"#F8FAFC",2) with G.${v % 2 === 0 ? 'check' : 'star'}.`,
      codeHint: 'upright float bobY=Math.sin(t*2.4)*0.035*R, rot=Math.sin(t*1.6)*0.035 + subtle top badge pulse',
    };
  }
  if (/\b(medal|ribbon|badge|certificate)\b/.test(topic)) {
    return {
      label: `suspended medal gleam (v${v})`,
      anatomyHint: 'Draw V-ribbon straps G.poly FIRST behind medal, THEN outer medal G.disc(0,0.08*R,0.38*R), inner rim G.ring(0,0.08*R,0.29*R,0.035*R), and centered G.star(0,0.08*R,0.16*R,0.07*R,5) LAST on top.',
      codeHint: 'upright pendulum sway bobY=Math.sin(t*2.3)*0.035*R, rot=Math.sin(t*1.7)*0.05 + pulsing centered star',
    };
  }
  if (/\b(trophy|award|achievement|cup|winner|crown)\b/.test(topic)) {
    return {
      label: `celebratory crest lift (v${v})`,
      anatomyHint: `Call G.trophy(0, 0, 1.06*R, cupCol, baseCol, starCol, "#F8FAFC", t, ${v}) inside G.part — cohesive trophy & pulsing inner star!`,
      codeHint: 'upright float bobY=Math.sin(t*2.4)*0.035*R, rot=Math.sin(t*1.6)*0.035 + pulsing center star emblem',
    };
  }
  if (/\b(chat|conversation|dialogue|messaging|communication|telecom|discussion|comment)\b/.test(topic)) {
    return {
      label: `speech bubble dialogue pulse (v${v})`,
      anatomyHint: 'Back bubble tail + G.box(-0.14*R,-0.12*R,0.66*R,0.44*R,0.12*R,c1,"#F8FAFC",2.5); front bubble tail + G.box(0.16*R,0.14*R,0.64*R,0.42*R,0.12*R,c2,"#F8FAFC",2.5); 3 oscillating typing dots G.disc inside front bubble.',
      codeHint: 'upright hover bobY=Math.sin(t*2.2)*0.03*R + sequential 3-dot wave inside front bubble',
    };
  }
  if (/\b(email|mail|envelope|inbox|newsletter|message)\b/.test(topic)) {
    return {
      label: `envelope & badge float (v${v})`,
      anatomyHint: 'Envelope G.box(0,0.05*R,1.02*R,0.68*R,0.08*R), crisp inner V-flap G.poly([[-0.48*R,-0.22*R],[0,0.12*R],[0.48*R,-0.22*R]],null,rimCol,0.055*R,false), welded top-right badge G.disc(0.40*R,-0.22*R,0.14*R) LAST on top.',
      codeHint: 'upright float bobY=Math.sin(t*2.4)*0.035*R, rot=Math.sin(t*1.6)*0.04 + smooth badge scale pulse',
    };
  }
  if (/\b(negotiation|partnership|team|meeting|collaboration|networking)\b/.test(topic)) {
    return {
      label: `paired executive agreement (v${v})`,
      anatomyHint: 'Use G.person(-0.30*R,0.06*R,0.34*R,col1,head1,rim) & G.person(0.30*R,0.06*R,0.34*R,col2,head2,rim) joined cleanly by G.handshake(0,0.14*R,0.28*R,col1,col2,"#F59E0B","#F8FAFC",rim) + top check emblem.',
      codeHint: 'upright float bobY=Math.sin(t*2.2)*0.03*R + smooth continuous top check badge pulse',
    };
  }
  if (/\b(leadership|executive|leader|manager|ceo|mentor|customer|support|headset|people|person|user|avatar|chair)\b/.test(topic)) {
    return {
      label: `executive figure poise (v${v})`,
      anatomyHint: `Call G.userBadge(0, 0, 1.04*R, cardCol, personCol, accCol, "#F8FAFC", t, ${v}) inside G.part — sharp profile card & executive emblem!`,
      codeHint: 'upright float bobY=Math.sin(t*2.1)*0.03*R, rot=Math.sin(t*1.4)*0.03 + crest badge pulse',
    };
  }
  if (/\b(presentation|whiteboard|projector|pitch|slide|training)\b/.test(topic)) {
    return {
      label: `easel chart presentation (v${v})`,
      anatomyHint: `Tripod legs FIRST behind board, THEN call G.chart(0, -0.06*R, 0.96*R, cardCol, bar1Col, bar2Col, arrowCol, "#F8FAFC", t, ${v}) as the easel screen!`,
      codeHint: 'upright float bobY=Math.sin(t*2.1)*0.025*R + animated easel bars & upward arrow',
    };
  }
  if (/\b(cash\s*flow|cashflow|transaction|transfer|payment|revenue|payroll|remittance|settlement|money|dollar|coin|currency|bank|finance|investment|cash)\b/.test(topic)) {
    return {
      label: `minted cash flow (v${v})`,
      anatomyHint: `Call G.coinStack(0, 0.04*R, 0.98*R, coinCol, sideCol, "#FFFFFF", "#F8FAFC", t, ${v}) + crisp flow arrows G.arrow(-0.34*R+fx,-0.36*R,0.34*R+fx,-0.36*R,0.05*R,0.12*R,accCol) inside G.part.`,
      codeHint: 'upright float bobY=Math.sin(t*2.2)*0.03*R + smooth arrow transfer motion & coin star pulse',
    };
  }
  if (/\b(briefcase|portfolio|folder|file|document|contract|invoice)\b/.test(topic)) {
    return {
      label: `executive hinged float (v${v})`,
      anatomyHint: `Call G.briefcase(0, 0, 1.06*R, bodyCol, flapCol, claspCol, "#F8FAFC", t, ${v}) inside G.part — ZERO dark backdrop disc!`,
      codeHint: 'upright hover bobY=Math.sin(t*2.3)*0.035*R, rot=Math.sin(t*1.6)*0.035 + lid clasp articulation',
    };
  }
  if (/\b(target|bullseye|strategy|aim|dart|goal)\b/.test(topic)) {
    return {
      label: `diagonal strike & ripple (v${v})`,
      anatomyHint: 'Opaque discs G.disc(0,0,0.52*R,"#F43F5E","#F8FAFC",3), G.disc(0,0,0.34*R,"#F8FAFC"), G.disc(0,0,0.16*R,"#F43F5E"), G.disc(0,0,0.07*R,"#FFD700") + inward G.arrow(0.50*R+d,-0.50*R-d,0.03*R+d*0.1,-0.03*R-d*0.1,0.05*R,0.14*R,"#F8FAFC") pointing INWARD!',
      codeHint: 'bullseye scale=1+0.04*Math.sin(t*3.0) + inward diagonal dart strike',
    };
  }
  if (/\b(analytics|dashboard|chart|graph|report|metric|kpi|profit|growth|candlestick|statistics|market\s*analysis)\b/.test(topic)) {
    return {
      label: `ascending elastic lift (v${v})`,
      anatomyHint: `Call G.chart(0, 0, 1.06*R, cardCol, bar1Col, bar2Col, arrowCol, "#F8FAFC", t, ${v}) inside G.part — bold full-width animated chart card!`,
      codeHint: 'upright hover bobY=Math.sin(t*2.1)*0.03*R, rot=Math.sin(t*1.5)*0.03 + live rising bars & trend arrow',
    };
  }
  if (/\b(building|skyscraper|tower|headquarters|architecture|real\s*estate)\b|\boffice\s+building\b|\bcorporate\s+building\b/.test(topic)) {
    return {
      label: `architectural plinth glow (v${v})`,
      anatomyHint: 'Spire + crown + main tower G.box(-0.08*R,0.02*R,0.48*R,0.82*R,0.04*R) + side wing G.box(0.24*R,0.14*R,0.26*R,0.58*R,0.04*R) + plinth + 3x4 illuminated window grid G.box across full tower height.',
      codeHint: 'upright float bobY=Math.sin(t*1.8)*0.02*R + upward window illumination wave',
    };
  }
  if (/\b(puzzle|connect|link|integration)\b/.test(topic)) {
    return {
      label: `interlocked precision fit (v${v})`,
      anatomyHint: '2 solid blocks G.box(-0.19*R,0,0.42*R,0.42*R,0.06*R) & G.box(0.19*R,0,0.42*R,0.42*R,0.06*R) interlocked over centered tab G.disc(0,0,0.12*R) LAST on top.',
      codeHint: 'gentle x micro-slide ±0.03*R staying overlapped + upright float bobY=Math.sin(t*2.2)*0.03*R',
    };
  }
  if (/\b(calendar|event|schedule)\b/.test(topic)) {
    return {
      label: `structured grid calendar (v${v})`,
      anatomyHint: 'Top rings + body G.box(0,0.05*R,0.88*R,0.74*R,0.08*R) + header strip + crisp 3x2 date squares G.box inside body.',
      codeHint: 'upright float bobY=Math.sin(t*2.1)*0.03*R + active date cell highlight',
    };
  }
  if (/\b(clock|deadline|timer|time)\b/.test(topic)) {
    return {
      label: `precision dial sweep (v${v})`,
      anatomyHint: `Call G.clock(0, 0, 1.06*R, bezelCol, faceCol, handCol, "#F8FAFC", t, ${v}) inside G.part — clean ticking hands anchored at center!`,
      codeHint: 'upright float bobY=Math.sin(t*2.1)*0.03*R + sweeping clock hands',
    };
  }
  if (/\b(bell|alarm|siren|alert|horn|speaker|mic)\b/.test(topic)) {
    return {
      label: `acoustic ring swing (v${v})`,
      anatomyHint: 'Top loop + flared bell dome G.poly + bottom rim G.capsule + clapper G.disc + symmetric outer sound arcs G.ring at ±0.45*R.',
      codeHint: 'pendulum swing + delayed clapper sway & expanding soundwave arc sweep',
    };
  }
  if (/\b(heart|pulse|ecg|cardiogram|dna|pill|capsule|syringe|medical|stethoscope|health)\b/.test(topic)) {
    return {
      label: `cardiac lub-dub pulse (v${v})`,
      anatomyHint: 'Unified medical emblem centered at (0,0) scaled >= 0.90*R: symmetric heart (2 welded G.disc + lower G.poly) or rounded cross with crisp ECG line inside.',
      codeHint: 'double-beat lub-dub scale pulse + smooth bobY',
    };
  }
  if (/\b(shield|protection|firewall|cybersecurity|antivirus)\b/.test(topic)) {
    return {
      label: `shield defense gleam (v${v})`,
      anatomyHint: `Call G.shield(0, 0.02*R, 0.98*R, shieldCol, "#F8FAFC", "#1E293B") + centered pulsing G.${v % 2 === 0 ? 'check' : 'star'}(0, 0.02*R, ...) LAST on top.`,
      codeHint: 'upright hover bobY=Math.sin(t*2.2)*0.03*R + smooth emblem pulse',
    };
  }
  if (/\b(lock|padlock|vault|key|fingerprint|biometric|security|safe)\b/.test(topic)) {
    return {
      label: `precision locking recoil (v${v})`,
      anatomyHint: `Call G.lock(0, 0, 1.06*R, bodyCol, shackleCol, accentCol, "#F8FAFC", t, ${v}) inside G.part — crisp articulated shackle & keyhole!`,
      codeHint: 'upright hover bobY=Math.sin(t*2.2)*0.03*R + smooth vertical shackle lock recoil',
    };
  }
  if (/\b(truck|drone|airplane|plane|wheel|forklift|parcel|cargo|delivery)\b/.test(topic)) {
    return {
      label: `kinetic transport suspension (v${v})`,
      anatomyHint: 'Cohesive vehicle chassis inside [-0.54*R,+0.54*R] with wheels overlapping body by >= 0.04*R — zero detached wheels!',
      codeHint: 'chassis suspension bobY=Math.sin(t*3.2)*0.03*R + spinning wheels at exact wheel sockets',
    };
  }
  if (/\b(gear|settings|cog|automation|operations|engineering|system|process)\b/.test(topic)) {
    return {
      label: `meshed cog rotation (v${v})`,
      anatomyHint: `Call G.gears(0, 0, 1.06*R, g1Col, g2Col, coreCol, "#F8FAFC", t, ${v}) inside G.part — dual interlocked rotating gears!`,
      codeHint: 'upright float bobY=Math.sin(t*2.0)*0.025*R + counter-rotating meshed cogwheels',
    };
  }
  if (/\b(atom|orbit|planet|radar|compass|satellite|astrolabe)\b/.test(topic)) {
    return {
      label: `orbital & axis precession (v${v})`,
      anatomyHint: 'Centered core G.disc(0,0,0.20*R) + bold tilted G.oval/G.ring orbits (radius >= 0.42*R, thick >= 0.04*R) + orbiting nodes G.disc along exact path.',
      codeHint: 'smooth continuous rotation + orbiting bright nodes along tilted rings',
    };
  }
  if (/\b(chip|cpu|processor|circuit|microchip|semiconductor|hardware)\b/.test(topic)) {
    return {
      label: `silicon pulse grid (v${v})`,
      anatomyHint: `Call G.chip(0, 0, 1.06*R, pkgCol, pinCol, coreCol, "#F8FAFC", t, ${v}) inside G.part — crisp square processor with welded pins & pulsing core!`,
      codeHint: 'upright tech float bobY=Math.sin(t*2.2)*0.03*R + pulsing silicon core',
    };
  }
  if (/\b(robot|bot|chatbot|assistant|ai|neural)\b/.test(topic)) {
    return {
      label: `intelligent bot nod (v${v})`,
      anatomyHint: `Call G.robot(0, 0, 1.06*R, bodyCol, visorCol, eyeCol, "#F8FAFC", t, ${v}) inside G.part — friendly clean AI robot head!`,
      codeHint: 'friendly hover bobY=Math.sin(t*2.3)*0.035*R, rot=Math.sin(t*1.6)*0.04 + eye & beacon pulse',
    };
  }
  if (/\b(cloud|saas|storage|backup|sync|server)\b/.test(topic)) {
    return {
      label: `cloud sync lift (v${v})`,
      anatomyHint: `Call G.cloudSync(0, 0, 1.06*R, cloudCol, arrowCol, "#F8FAFC", t, ${v}) inside G.part — solid cloud & smooth animated sync arrow!`,
      codeHint: 'upright cloud float bobY=Math.sin(t*2.1)*0.03*R + smooth vertical arrow sync motion',
    };
  }
  if (/\b(brain|network|camera|eye|microscope)\b/.test(topic)) {
    return {
      label: `smart telemetry pulse (v${v})`,
      anatomyHint: 'Unified centered tech housing inside [-0.54*R,+0.54*R] scaled >= 0.90*R (ZERO dark backdrop disc!); all pins/nodes overlap housing >= 0.04*R.',
      codeHint: 'upright float bobY=Math.sin(t*2.3)*0.035*R, rot=Math.sin(t*1.6)*0.04 + staggered node pulse',
    };
  }
  if (overrideMode && overrideMode !== 'auto') {
    const legacy: Record<string, string> = {
      bounce: 'sq=1+0.1*Math.cos(t*3), sx=1/Math.sqrt(sq), sy=sq',
      orbital: 'sx=0.88+0.12*Math.cos(t*2), rotY=Math.sin(t*2)*0.15',
      morph: 'pulse=1+0.06*Math.sin(t*2.6), sx=pulse, sy=2-pulse',
      cyber: 'scan=(t*0.8)%1, step pulse',
      mechanical: 'tilt=Math.sin(t*2.2)*0.08, articulated sub-parts',
      flow: 'bobY=Math.sin(t*2.4)*(S*0.04), tilt=Math.sin(t*1.8)*0.05',
    };
    if (legacy[overrideMode]) {
      return {
        label: overrideMode,
        anatomyHint: `Framed centered vector emblem (s=1.04*R) or matching G hero helper(..., t, ${v}) inside G.part — NEVER draw tiny dots <0.5*R or bare rays!`,
        codeHint: legacy[overrideMode],
      };
    }
  }
  return {
    label: `harmonic elastic float (v${v})`,
    anatomyHint: `Pick the closest G hero helper (G.uiLayout / G.videoCall / G.laptop / G.chart / G.checklist / G.rocket / G.lightbulb / G.briefcase / G.gears) at size s=1.05*R with t,${v}, OR build a bold framed emblem G.box(0,0,0.96*R,0.74*R,0.10*R) + crisp inner animated icon. NEVER draw small dots <0.6*R, bare G.rays, or stacked snowman circles!`,
    codeHint: 'upright bobY=Math.sin(t*2.3)*0.035*R, rot=Math.sin(t*1.6)*0.035 + internal t-driven sub-part pulse',
  };
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
    motionDynamics = "auto",
    neonGlow = true,
    variationOffset = 0,
  } = body;

  if (!promptTopic) {
    throw new Error("Prompt topic wajib diisi");
  }

  const ai = getClient(apiKey);
  const targetModel = sanitizeModel(model);

  const catMeta = findCategoryById(subCategory, type);
  const catInfo = catMeta ? `${catMeta.enName} (${catMeta.name}) - ${catMeta.description}` : subCategory;

  const isBackground = type === 'bg';
  const seed = createServerUniqueVariationSeed(promptTopic, Math.max(0, Number(index) - 1), Number(variationOffset) || 0);
  const motionPlan = resolveServerPromptMotionPlan(promptTopic, type, motionDynamics, seed.variantIdx);

  const colorStyleDirective = isGreenScreen
    ? `GREEN SCREEN (#00ff00 cleared): NEVER fillRect(0,0,w,h)/clearRect; ctx.shadowBlur=0; ctx.globalAlpha=1 (NO rgba(...,0.x), NO translucent glass/shadow lines!); ONLY solid opaque NON-GREEN colors (#FFD700,#00E5FF,#9333EA,#F43F5E,#F8FAFC,#F97316,#1E293B).`
    : (neonGlow
        ? "DARK BG (#080c14 cleared): NEVER fillRect(0,0,w,h) for icons; shadowBlur=8 on bright accents (reset 0)."
        : "CRISP VECTOR (#080c14 cleared): shadowBlur=0.");

  const geometryGuide = isBackground
    ? `FULL-FRAME BG (0..w,0..h): ${motionPlan.anatomyHint}`
    : `CONCISE HERO ICON (10-20 lines, <=320 tokens): Set R=S*0.72 inside G.part(cx,cy+bobY,rot,sx,sy,fn). PREFER G.<hero>(0,0,1.05*R,...,t,${seed.variantIdx}) with unique Palette=[${seed.palette.join(',')}] & Motion=[${seed.motionExpr}] so shape+motion are fresh! NEVER draw tiny dots <0.5*R, bare G.rays alone, or backdrop plates. ANATOMY: ${motionPlan.anatomyHint}`;

  const systemPrompt = `60 FPS Canvas 2D Motion Coder. Return ONLY RAW JS: function drawFrame(ctx, w, h, cx, cy, S, t) { ... } (no markdown/HTML/canvas/resize/rAF; never redeclare canvas/ctx/w/h/cx/cy/S/G).
HELPERS G: G.grad(c1,c2,c3,x0,y0,x1,y1) | G.box(x,y,bw,bh,r,fill,rim,lw) | G.bar(x,yBase,bw,bh,r,fill,rim,lw) | G.capsule(x,y,bw,bh,fill,rim,lw) | G.disc(x,y,r,fill,rim,lw) | G.oval(x,y,rx,ry,rot,fill,rim,lw) | G.ring(x,y,r,thick,a0,a1,col) | G.poly(pts,fill,rim,lw,close) | G.star(x,y,ro,ri,n,rot,fill,rim) | G.pill(x1,y1,x2,y2,thick,col) | G.arrow(x1,y1,x2,y2,thick,headLen,col) | G.person(x,y,s,b,h,rim) | G.check(x,y,s,thick,col) | G.pie(x,y,r,a0,sw,sCol,bCol,rim) | G.rays(x,y,rI,rO,n,rot,th,col) | G.handshake(x,y,s,cL,cR,hCol,cuff,rim) | G.shield(x,y,s,fill,rim,in) | G.cart(x,y,s,body,wheel,rim) | G.megaphone(x,y,s,cone,handle,acc,rim) | G.wallet(x,y,s,body,flap,clasp,rim) | G.globe(x,y,r,sph,line,rim) | G.uiLayout(x,y,s,fr,hd,ac,rim,t,v) | G.videoCall(x,y,s,fr,ti,ac,rim,t,v) | G.laptop(x,y,s,bd,sc,ac,rim,t,v) | G.checklist(x,y,s,bd,cl,ac,rim,t,v) | G.rocket(x,y,s,hu,wi,fl,rim,t,v) | G.lightbulb(x,y,s,bu,ra,ba,rim,t,v) | G.chart(x,y,s,cd,b1,b2,ar,rim,t,v) | G.magnifier(x,y,s,cd,le,ha,ac,rim,t,v) | G.pieChart(x,y,s,ba,s1,s2,s3,rim,t,v) | G.gears(x,y,s,g1,g2,co,rim,t,v) | G.userBadge(x,y,s,cd,pe,ac,rim,t,v) | G.typography(x,y,s,cd,in,ac,rim,t,v) | G.briefcase(x,y,s,bd,fl,cl,rim,t,v) | G.trophy(x,y,s,cu,ba,st,rim,t,v) | G.clock(x,y,s,be,fa,ha,rim,t,v) | G.lock(x,y,s,bd,sh,ac,rim,t,v) | G.cloudSync(x,y,s,cl,ar,rim,t,v) | G.robot(x,y,s,bd,vi,ey,rim,t,v) | G.chip(x,y,s,pk,pn,co,rim,t,v) | G.coinStack(x,y,s,co,si,st,rim,t,v) | G.part(tx,ty,rot,sx,sy,fn)
SPEC [${seed.tag}]: "${promptTopic}" (${catInfo}) | Style: ${style} | Palette: ${colorMode} [${seed.palette.join(',')}]
- ${geometryGuide}
- Motion (${motionPlan.label}): ${motionPlan.codeHint} | Kinetic: ${seed.motionExpr}.
- ${colorStyleDirective}`;

  const { response } = await generateContentWithFallback(
    ai,
    targetModel,
    (currentModel) => {
      const animConfig: any = {
        temperature: 0.42,
        maxOutputTokens: 950,
      };
      const smartThinking = getSmartThinkingConfig(currentModel, 'animation');
      if (smartThinking) {
        animConfig.thinkingConfig = smartThinking;
      }
      return { contents: systemPrompt, config: animConfig };
    }
  );

  const rawText = response.text || "";
  const cleanHTML = extractHTMLFromMarkdown(rawText, isGreenScreen);

  if (!cleanHTML || (!cleanHTML.toLowerCase().includes('<script') && !cleanHTML.toLowerCase().includes('<canvas'))) {
    throw new Error('AI mengembalikan kode yang belum lengkap');
  }

  return {
    id: 'anim_' + Date.now() + Math.random().toString(36).substring(7),
    title: `${promptTopic.substring(0, 35)}... (${index}/${total})`,
    prompt: promptTopic,
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

function parseServerBatchDelimiterOutput(rawText: string, expectedCount: number): string[] {
  const out: string[] = new Array(expectedCount).fill('');
  const trimmed = (rawText || '').trim();
  if (!trimmed) return out;

  const markerRegex = /\/\/\s*={2,}\s*ANIM[_\s-]*(\d+)\s*={2,}/gi;
  const matches = Array.from(trimmed.matchAll(markerRegex));
  if (matches.length > 0) {
    for (let i = 0; i < matches.length; i++) {
      const idx = parseInt(matches[i][1], 10);
      if (Number.isNaN(idx) || idx < 0 || idx >= expectedCount) continue;
      const start = (matches[i].index || 0) + matches[i][0].length;
      const end = i + 1 < matches.length ? (matches[i + 1].index || trimmed.length) : trimmed.length;
      out[idx] = trimmed.slice(start, end).trim();
    }
    if (out.some(Boolean)) return out;
  }

  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) return parsed.map((c: any) => String(c || '')).slice(0, expectedCount);
  } catch {
    const m = trimmed.match(/\[[\s\S]*\]/);
    if (m) {
      try {
        const parsed = JSON.parse(m[0]);
        if (Array.isArray(parsed)) return parsed.map((c: any) => String(c || '')).slice(0, expectedCount);
      } catch {}
    }
  }

  const fnParts = trimmed.split(/(?=(?:^|\n)[ \t]*function\s+drawFrame\s*\()/);
  const filteredParts = fnParts.map((p) => p.trim()).filter((p) => /function\s+drawFrame\s*\(/.test(p));
  for (let i = 0; i < Math.min(expectedCount, filteredParts.length); i++) {
    out[i] = filteredParts[i];
  }

  return out;
}

// 2-in-1 Batch Animation Code Generator (delimiter raw JS — eliminates JSON string escaping corruption)
export async function handleGenerateAnimationBatchLogic(body: any) {
  const {
    apiKey,
    model,
    prompts = [],
    type = "icon",
    subCategory = "teknologi",
    style = "minimalist",
    isGreenScreen = false,
    colorMode = "gradient",
    motionDynamics = "auto",
    neonGlow = true,
    variationOffset = 0,
  } = body;

  const promptList: string[] = Array.isArray(prompts)
    ? prompts.map((p: any) => String(p).trim()).filter(Boolean)
    : [];

  if (promptList.length === 0) {
    throw new Error("Daftar prompt batch wajib diisi");
  }

  const ai = getClient(apiKey);
  const targetModel = sanitizeModel(model);
  const isBackground = type === 'bg';

  const colorStyleDirective = isGreenScreen
    ? "GREEN SCREEN (#00ff00 cleared): NEVER fillRect(0,0,w,h)/clearRect; shadowBlur=0; globalAlpha=1 (NO rgba(...,0.x), NO translucent glass/shadow lines!); ONLY solid opaque NON-GREEN colors (#FFD700,#00E5FF,#9333EA,#F43F5E,#F8FAFC,#F97316,#1E293B)."
    : (neonGlow ? "DARK BG (#080c14 cleared): shadowBlur=8 on bright LEDs (reset 0)." : "CRISP VECTOR (#080c14 cleared): shadowBlur=0.");

  const geometryGuide = isBackground
    ? "FULL-FRAME BG (0..w,0..h): 3-4 smooth cosine ribbons/grids spanning -0.1*w..1.1*w."
    : "CONCISE HERO ICON (10-20 lines each, <=300 tokens): R=S*0.72 inside G.part(cx,cy+bobY,rot,sx,sy,fn). PREFER matching G.<hero>(0,0,1.05*R,...,t,v) with its UNIQUE v, Palette & Kinetic! NEVER draw tiny dots <0.5*R, bare G.rays alone, or backdrop plates.";

  const seeds = promptList.map((p, idx) => createServerUniqueVariationSeed(p, idx, Number(variationOffset) || 0));

  const topicLines = promptList.map((p, idx) => {
    const seed = seeds[idx];
    const plan = resolveServerPromptMotionPlan(p, type, motionDynamics, seed.variantIdx);
    return `// ===ANIM_${idx}=== "${p}" [${seed.tag}] v=${seed.variantIdx} | Anatomy: ${plan.anatomyHint} | Motion (${plan.label}): ${plan.codeHint} | Palette=[${seed.palette.join(',')}] | Kinetic: ${seed.motionExpr}`;
  }).join('\n');

  const batchPrompt = `60 FPS Canvas 2D Motion Coder. Write ${promptList.length} concise RAW JS functions separated ONLY by:
${promptList.map((_, idx) => `// ===ANIM_${idx}===\nfunction drawFrame(ctx, w, h, cx, cy, S, t) { ... }`).join('\n')}
CRITICAL: Each ANIM_i MUST have its own unique layout, variant index v, color palette, and motion trajectory (NEVER emit identical code across items or sessions)!
HELPERS G: G.grad(c1,c2,c3,x0,y0,x1,y1) | G.box(x,y,bw,bh,r,fill,rim,lw) | G.bar(x,yBase,bw,bh,r,fill,rim,lw) | G.capsule(x,y,bw,bh,fill,rim,lw) | G.disc(x,y,r,fill,rim,lw) | G.oval(x,y,rx,ry,rot,fill,rim,lw) | G.ring(x,y,r,thick,a0,a1,col) | G.poly(pts,fill,rim,lw,close) | G.star(x,y,ro,ri,n,rot,fill,rim) | G.pill(x1,y1,x2,y2,thick,col) | G.arrow(x1,y1,x2,y2,thick,headLen,col) | G.person(x,y,s,b,h,rim) | G.check(x,y,s,thick,col) | G.pie(x,y,r,a0,sw,sCol,bCol,rim) | G.rays(x,y,rI,rO,n,rot,th,col) | G.handshake(x,y,s,cL,cR,hCol,cuff,rim) | G.shield(x,y,s,fill,rim,in) | G.cart(x,y,s,body,wheel,rim) | G.megaphone(x,y,s,cone,handle,acc,rim) | G.wallet(x,y,s,body,flap,clasp,rim) | G.globe(x,y,r,sph,line,rim) | G.uiLayout(x,y,s,fr,hd,ac,rim,t,v) | G.videoCall(x,y,s,fr,ti,ac,rim,t,v) | G.laptop(x,y,s,bd,sc,ac,rim,t,v) | G.checklist(x,y,s,bd,cl,ac,rim,t,v) | G.rocket(x,y,s,hu,wi,fl,rim,t,v) | G.lightbulb(x,y,s,bu,ra,ba,rim,t,v) | G.chart(x,y,s,cd,b1,b2,ar,rim,t,v) | G.magnifier(x,y,s,cd,le,ha,ac,rim,t,v) | G.pieChart(x,y,s,ba,s1,s2,s3,rim,t,v) | G.gears(x,y,s,g1,g2,co,rim,t,v) | G.userBadge(x,y,s,cd,pe,ac,rim,t,v) | G.typography(x,y,s,cd,in,ac,rim,t,v) | G.briefcase(x,y,s,bd,fl,cl,rim,t,v) | G.trophy(x,y,s,cu,ba,st,rim,t,v) | G.clock(x,y,s,be,fa,ha,rim,t,v) | G.lock(x,y,s,bd,sh,ac,rim,t,v) | G.cloudSync(x,y,s,cl,ar,rim,t,v) | G.robot(x,y,s,bd,vi,ey,rim,t,v) | G.chip(x,y,s,pk,pn,co,rim,t,v) | G.coinStack(x,y,s,co,si,st,rim,t,v) | G.part(tx,ty,rot,sx,sy,fn)
SPEC: ${geometryGuide}
Style: ${style} | Palette: ${colorMode} | ${colorStyleDirective}
NO markdown/HTML/canvas/resize/rAF or redeclaring canvas/ctx/w/h/cx/cy/S/G.
TOPICS:
${topicLines}`;

  const { response } = await generateContentWithFallback(
    ai,
    targetModel,
    (currentModel) => {
      const cfg: any = {
        temperature: 0.42,
        maxOutputTokens: Math.min(1850, Math.max(950, promptList.length * 850)),
      };
      const smartThinking = getSmartThinkingConfig(currentModel, 'animation');
      if (smartThinking) cfg.thinkingConfig = smartThinking;
      return { contents: batchPrompt, config: cfg };
    }
  );

  const rawText = (response.text || "").trim();
  const codeItems = parseServerBatchDelimiterOutput(rawText, promptList.length);
  const batchSeen = new Set<string>();

  const results = promptList.map((promptTopic, idx) => {
    const rawCode = codeItems[idx] || '';
    const html = rawCode ? extractHTMLFromMarkdown(rawCode, isGreenScreen) : '';
    const valid = /\b(?:G\.\w+|ctx\.(?:fill|stroke|beginPath|roundRect|arc|ellipse|bezierCurveTo|lineTo))\s*\(/i.test(rawCode);
    if (!html || !valid) return null;
    const fp = normalizeServerCodeFingerprint(html);
    if (fp && batchSeen.has(fp)) {
      return null;
    }
    if (fp) batchSeen.add(fp);
    return {
      id: 'anim_' + Date.now() + '_' + idx + Math.random().toString(36).substring(7),
      title: `${promptTopic.substring(0, 35)}... (${idx + 1}/${promptList.length})`,
      prompt: promptTopic,
      type,
      style,
      subCategory,
      colorMode,
      motionDynamics,
      neonGlow,
      html,
      isGreenScreen,
    };
  });

  return { items: results };
}

// Server-side streaming endpoint for real-time animation code generation via Server-Sent Events (SSE)
export async function handleStreamAnimationLogic(body: any, res: Response) {
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
    motionDynamics = "auto",
    neonGlow = true,
    variationOffset = 0,
  } = body;

  if (!promptTopic) {
    res.status(400).json({ error: "Prompt topic wajib diisi" });
    return;
  }

  const ai = getClient(apiKey);
  const targetModel = sanitizeModel(model);
  const isBackground = type === 'bg';
  const seed = createServerUniqueVariationSeed(promptTopic, Math.max(0, Number(index) - 1), Number(variationOffset) || 0);
  const motionPlan = resolveServerPromptMotionPlan(promptTopic, type, motionDynamics, seed.variantIdx);

  const colorStyleDirective = isGreenScreen
    ? "- GREEN SCREEN (#00ff00 cleared): NEVER fillRect(0,0,w,h); shadowBlur=0; globalAlpha=1 (NO rgba(...,0.x), NO translucent glass/shadow lines!); ONLY solid opaque NON-GREEN colors."
    : (neonGlow
        ? "- DARK BG (#080c14): shadowBlur=8 on accents (reset 0)."
        : "- CRISP VECTOR (#080c14): shadowBlur=0.");

  const geometryGuide = isBackground
    ? `FULL-FRAME BG (0..w,0..h): ${motionPlan.anatomyHint}`
    : `CONCISE HERO ICON (10-20 lines, <=320 tokens): Set R=S*0.72 inside G.part(cx,cy+bobY,rot,sx,sy,fn). PREFER G.<hero>(0,0,1.05*R,...,t,${seed.variantIdx}) with unique Palette=[${seed.palette.join(',')}] & Motion=[${seed.motionExpr}]! NEVER draw tiny dots <0.5*R, bare G.rays alone, or backdrop plates. ANATOMY: ${motionPlan.anatomyHint}`;

  const systemPrompt = `60 FPS Canvas 2D Motion Coder. Output ONLY RAW JS: function drawFrame(ctx, w, h, cx, cy, S, t) { ... } (no markdown/HTML/canvas/resize/rAF; never redeclare canvas/ctx/w/h/cx/cy/S/G).
HELPERS G: G.grad(c1,c2,c3,x0,y0,x1,y1) | G.box(x,y,bw,bh,r,fill,rim,lw) | G.bar(x,yBase,bw,bh,r,fill,rim,lw) | G.capsule(x,y,bw,bh,fill,rim,lw) | G.disc(x,y,r,fill,rim,lw) | G.oval(x,y,rx,ry,rot,fill,rim,lw) | G.ring(x,y,r,thick,a0,a1,col) | G.poly(pts,fill,rim,lw,close) | G.star(x,y,ro,ri,n,rot,fill,rim) | G.pill(x1,y1,x2,y2,thick,col) | G.arrow(x1,y1,x2,y2,thick,headLen,col) | G.person(x,y,s,b,h,rim) | G.check(x,y,s,thick,col) | G.pie(x,y,r,a0,sw,sCol,bCol,rim) | G.rays(x,y,rI,rO,n,rot,th,col) | G.handshake(x,y,s,cL,cR,hCol,cuff,rim) | G.shield(x,y,s,fill,rim,in) | G.cart(x,y,s,body,wheel,rim) | G.megaphone(x,y,s,cone,handle,acc,rim) | G.wallet(x,y,s,body,flap,clasp,rim) | G.globe(x,y,r,sph,line,rim) | G.uiLayout(x,y,s,fr,hd,ac,rim,t,v) | G.videoCall(x,y,s,fr,ti,ac,rim,t,v) | G.laptop(x,y,s,bd,sc,ac,rim,t,v) | G.checklist(x,y,s,bd,cl,ac,rim,t,v) | G.rocket(x,y,s,hu,wi,fl,rim,t,v) | G.lightbulb(x,y,s,bu,ra,ba,rim,t,v) | G.chart(x,y,s,cd,b1,b2,ar,rim,t,v) | G.magnifier(x,y,s,cd,le,ha,ac,rim,t,v) | G.pieChart(x,y,s,ba,s1,s2,s3,rim,t,v) | G.gears(x,y,s,g1,g2,co,rim,t,v) | G.userBadge(x,y,s,cd,pe,ac,rim,t,v) | G.typography(x,y,s,cd,in,ac,rim,t,v) | G.briefcase(x,y,s,bd,fl,cl,rim,t,v) | G.trophy(x,y,s,cu,ba,st,rim,t,v) | G.clock(x,y,s,be,fa,ha,rim,t,v) | G.lock(x,y,s,bd,sh,ac,rim,t,v) | G.cloudSync(x,y,s,cl,ar,rim,t,v) | G.robot(x,y,s,bd,vi,ey,rim,t,v) | G.chip(x,y,s,pk,pn,co,rim,t,v) | G.coinStack(x,y,s,co,si,st,rim,t,v) | G.part(tx,ty,rot,sx,sy,fn)
SPEC [${seed.tag}]: "${promptTopic}" | ${geometryGuide} | Style: ${style} | Palette: ${colorMode} [${seed.palette.join(',')}] | Motion (${motionPlan.label}): ${motionPlan.codeHint} | Kinetic: ${seed.motionExpr}.
${colorStyleDirective}`;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  try {
    const animConfig: any = {
      temperature: 0.42,
      maxOutputTokens: 950,
    };
    const smartThinking = getSmartThinkingConfig(targetModel, 'animation');
    if (smartThinking) {
      animConfig.thinkingConfig = smartThinking;
    }

    const responseStream = await ai.models.generateContentStream({
      model: targetModel,
      contents: systemPrompt,
      config: animConfig,
    });

    let fullText = "";
    for await (const chunk of responseStream) {
      const text = chunk.text || "";
      fullText += text;
      res.write(`data: ${JSON.stringify({ chunk: text })}\n\n`);
    }

    const cleanHTML = extractHTMLFromMarkdown(fullText, isGreenScreen);

    res.write(`data: ${JSON.stringify({
      done: true,
      id: 'anim_' + Date.now() + Math.random().toString(36).substring(7),
      title: `${promptTopic.substring(0, 35)}... (${index}/${total})`,
      prompt: promptTopic,
      type,
      style,
      subCategory,
      colorMode,
      motionDynamics,
      neonGlow,
      html: cleanHTML,
      isGreenScreen,
    })}\n\n`);
    res.end();
  } catch (err: any) {
    res.write(`data: ${JSON.stringify({ error: cleanErrorMessage(err) || "Gagal streaming animasi" })}\n\n`);
    res.end();
  }
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

    const masterMultimodalPrompt = `Canvas 2D Motion Coder. Rekonstruksi objek GAMBAR REFERENSI menjadi 60 FPS JS murni berpusat via G.part(cx, cy+bobY, rot, sx, sy, fn) skala R=S*0.72.
Gerak OTOMATIS sesuai karakter objek gambar (mis. bel berayun, roda berputar, grafik G.bar/G.pie naik halus tanpa <0.14*R, jantung berdenyut, atau floating tegak |rot|<=0.05 — JANGAN memutar objek tegak 360 derajat, JANGAN berkedip hilang via if(sin>0)).
Mode: ${colorMode} | ${isGreenScreen ? 'GREEN SCREEN (#00ff00 bersih: JANGAN fillRect(0,0,w,h), shadowBlur=0, globalAlpha=1, NO rgba(...,0.x) / NO lapisan kaca transparan, HANYA warna solid non-hijau)' : 'BG Gelap (#080c14)'}.
${customInstructions ? `Instruksi: ${customInstructions}` : ''}
HELPERS G: G.grad(c1,c2,c3,x0,y0,x1,y1) | G.box(x,y,bw,bh,r,fill,rim,lw) | G.bar(x,yBase,bw,bh,r,fill,rim,lw) | G.capsule(x,y,bw,bh,fill,rim,lw) | G.disc(x,y,r,fill,rim,lw) | G.oval(x,y,rx,ry,rot,fill,rim,lw) | G.ring(x,y,r,thick,a0,a1,col) | G.poly(pts,fill,rim,lw,close) | G.ngon(x,y,r,n,rot,fill,rim) | G.star(x,y,ro,ri,n,rot,fill,rim) | G.pill(x1,y1,x2,y2,thick,col) | G.arrow(x1,y1,x2,y2,thick,headLen,col) | G.person(x,y,s,bodyCol,headCol,rimCol) | G.check(x,y,s,thick,col) | G.pie(x,y,r,a0,sweep,sliceCol,baseCol,rimCol) | G.rays(x,y,rIn,rOut,n,rot,thick,col) | G.handshake(x,y,s,colL,colR,handCol,cuffCol,rimCol) | G.shield(x,y,s,fill,rim,in) | G.cart(x,y,s,body,wheel,rim) | G.megaphone(x,y,s,cone,handle,acc,rim) | G.wallet(x,y,s,body,flap,clasp,rim) | G.globe(x,y,r,sph,line,rim) | G.part(tx,ty,rot,sx,sy,fn)
ATURAN: (1) Semua (x,y) pada G.box/G.disc/G.oval adalah TITIK TENGAH; (2) PAINTER ORDER (lapisan belakang dulu -> badan utama -> emblem/ikon depan TERAKHIR); (3) Semua shape WAJIB berada di dalam G.part(cx,cy+bobY,...), overlap >=0.04*R di dalam [-0.62*R,+0.62*R], ZERO bagian di pojok luar G.part, ZERO piringan lingkaran latar/bayangan gelap di belakang ikon, ZERO kotak/garis transparan, ZERO gerigi liar.
Outputkan HANYA blok metadata + fungsi RAW JS (tanpa markdown/HTML/deklarasi canvas/ctx/w/h/cx/cy/S/G):
<script type="application/json" id="shape-analysis">{"objectName":"...","shapeDescription":"...","detectedElements":[],"professionalMotionPlan":"...","similaritySynthesis":"...","glowColor":"#38bdf8"}</script>
function drawFrame(ctx, w, h, cx, cy, S, t) { ... }`;

    const { response } = await generateContentWithFallback(
      ai,
      targetModel,
      (currentModel) => {
        const config: any = {
          temperature: 0.15,
          maxOutputTokens: 1650,
        };
        const smartThinking = getSmartThinkingConfig(currentModel, 'vision');
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

    const rawText = response.text || "";
    const cleanHTML = extractHTMLFromMarkdown(rawText, isGreenScreen);

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
          maxOutputTokens: 450,
        };
        const smartThinking = getSmartThinkingConfig(currentModel, 'prompt');
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
      1
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

  // Test Single API Key (Supports target model)
  const testSingleKeyHandler = async (req: Request, res: Response) => {
    try {
      const body = parseSafeBody(req);
      const key = body.key || req.body?.key || "";
      const model = body.model || req.body?.model;
      const result = await handleTestSingleKeyLogic(key, model);
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
      const model = body.model || req.body?.model;
      const result = await handleTestKeysLogic(keys, model);
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

  // Test Models Compatibility for a single API Key (Full Health Diagnostic)
  const testModelsHandler = async (req: Request, res: Response) => {
    try {
      const body = parseSafeBody(req);
      const key = body.key || req.body?.key || "";
      const result = await handleTestModelsLogic(key);
      res.json(result);
    } catch (err: any) {
      console.error("[TestModels] Error:", err);
      res.status(200).json({
        success: false,
        isKeyValid: false,
        activeCount: 0,
        total: 0,
        error: cleanErrorMessage(err) || "Gagal memeriksa kompatibilitas model",
        models: [],
      });
    }
  };
  router.post("/gemini/test-models", testModelsHandler);
  router.post("/api/gemini/test-models", testModelsHandler);

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

  // Generate Batch HTML5 Animation Code (2-in-1 per request)
  const generateAnimationBatchHandler = async (req: Request, res: Response) => {
    try {
      const body = parseSafeBody(req);
      const result = await handleGenerateAnimationBatchLogic(body);
      res.json(result);
    } catch (err: any) {
      console.warn("[GenerateAnimationBatch] Handled gracefully:", cleanErrorMessage(err));
      res.status(200).json({
        success: false,
        error: cleanErrorMessage(err) || "Gagal menghasilkan batch animasi",
        items: [],
      });
    }
  };
  router.post("/gemini/generate-animation-batch", generateAnimationBatchHandler);
  router.post("/api/gemini/generate-animation-batch", generateAnimationBatchHandler);

  // Stream Single HTML5 Animation Code (Server-Sent Events)
  const streamAnimationHandler = async (req: Request, res: Response) => {
    try {
      const body = parseSafeBody(req);
      await handleStreamAnimationLogic(body, res);
    } catch (err: any) {
      console.warn("[StreamAnimation] Error:", cleanErrorMessage(err));
      if (!res.headersSent) {
        res.status(200).json({
          success: false,
          error: cleanErrorMessage(err) || "Gagal streaming animasi",
          html: "",
        });
      }
    }
  };
  router.post("/gemini/stream-animation", streamAnimationHandler);
  router.post("/api/gemini/stream-animation", streamAnimationHandler);

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
