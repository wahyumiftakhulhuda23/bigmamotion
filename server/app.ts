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
  if (m.includes("3.1-pro") || m.includes("4-")) return 36000;
  if (m.includes("3.8") || m.includes("3.6")) return 30000;
  if (m.includes("2.5-flash-lite") || m.includes("3.1-flash-lite")) return 17000;
  if (m.includes("3.5-flash-lite")) return 21000;
  return 23000;
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
    var G = {
      _n: function(v, d) { return (typeof v === 'number' && isFinite(v)) ? v : (d || 0); },
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
    var w = 800, h = 600, cx = 400, cy = 300, S = 324, dpr = 1;
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

export function resolveServerPromptMotionPlan(
  promptTopic: string,
  type: string,
  overrideMode?: string
): { label: string; anatomyHint: string; codeHint: string } {
  if (type === 'bg') {
    return {
      label: 'full-frame harmonic wave',
      anatomyHint: '3-4 smooth full-width layered cosine ribbons or perspective grid planes spanning -0.1*w..1.1*w across 0..h.',
      codeHint: 'seamless cosine ribbon drift & depth phase shift across 0..w, 0..h',
    };
  }
  const topic = (promptTopic || '').toLowerCase();
  if (/\b(meeting\s+table|conference\s+table|boardroom|roundtable|conference\s+room)\b/.test(topic)) {
    return {
      label: 'conference table ensemble',
      anatomyHint: 'PAINTER ORDER (TOP-DOWN / 3-4 VIEW CONFERENCE TABLE): draw 4 docked executive seats FIRST around edges G.person(0,-0.34*R,0.22*R,c1,h1,rim), G.person(0,0.34*R,0.22*R,c1,h1,rim), G.person(-0.46*R,0,0.22*R,c2,h2,rim), G.person(0.46*R,0,0.22*R,c2,h2,rim); THEN draw centered conference table G.box(0,0.02*R,0.74*R,0.40*R,0.14*R,tableCol,rim,2.5) cleanly overlapping chair edges; LAST on top: miniature agenda tablet G.box(0,0.02*R,0.24*R,0.14*R,0.03*R). ZERO detached orbiting squares!',
      codeHint: 'upright float bobY=Math.sin(t*2.1)*0.025*R + subtle synchronized chair breath ±0.02*R staying docked to table & gentle center tablet highlight',
    };
  }
  if (/\b(office\s+desk|desk|workstation|workspace|cubicle|study\s+table)\b/.test(topic)) {
    return {
      label: 'organized desk workstation',
      anatomyHint: 'UPRIGHT FRONT OFFICE DESK (PAINTER ORDER): (1) left/right desk leg pedestals G.box(-0.34*R,0.24*R,0.20*R,0.34*R,0.03*R) & G.box(0.34*R,0.24*R,0.20*R,0.34*R,0.03*R) with tidy drawer handles; (2) wide desk top G.box(0,0.06*R,1.02*R,0.10*R,0.03*R); (3) monitor stand G.box(0,-0.03*R,0.10*R,0.12*R,0.02*R) + crisp monitor G.box(0,-0.22*R,0.52*R,0.34*R,0.04*R) with dark screen & 2 mini G.bar sitting FLUSH on desk; (4) neat mug G.box(0.37*R,-0.05*R,0.11*R,0.12*R,0.03*R) & steady lamp G.pill(-0.37*R,0.01*R,-0.40*R,-0.18*R,0.035*R) + G.disc(-0.36*R,-0.20*R,0.08*R,"#FFD700") (NEVER blink lamp or tint green!).',
      codeHint: 'upright float bobY=Math.sin(t*2.1)*0.025*R, rot=Math.sin(t*1.4)*0.025 + smooth telemetry bar motion inside monitor screen (keep lamp 100% steady gold!)',
    };
  }
  if (/\b(handshake|deal|agreement)\b/.test(topic)) {
    return {
      label: 'executive handshake clasp',
      anatomyHint: 'Use G.handshake(0, 0.05*R, 0.58*R, "#0284C7", "#4F46E5", "#F59E0B", "#F8FAFC", "#1E293B") as the unified central silhouette + optional crisp top check emblem G.disc(0,-0.32*R,0.12*R,"#38BDF8") with G.check(0,-0.32*R,0.07*R,3,"#FFFFFF"). NEVER draw horizontal capsule bandages, swirl balls, or noisy outer tick circles!',
      codeHint: 'upright confident clasp float bobY=Math.sin(t*2.5)*0.035*R, rot=Math.sin(t*1.7)*0.035 + subtle badge scale=1+0.07*Math.sin(t*3.0)',
    };
  }
  if (/\b(medal|ribbon|badge|certificate)\b/.test(topic)) {
    return {
      label: 'suspended medal gleam',
      anatomyHint: 'PAINTER ORDER (back-to-front): draw V-ribbon straps FIRST behind medal G.poly([[-0.22*R,-0.46*R],[-0.06*R,-0.10*R],[-0.20*R,-0.10*R],[-0.34*R,-0.46*R]]) & right strap, THEN outer medal G.disc(0,0.08*R,0.38*R), inner rim G.ring(0,0.08*R,0.29*R,0.035*R), and centered G.star(0,0.08*R,0.16*R,0.07*R,5) LAST on top (NEVER draw stem/plinth over medal!).',
      codeHint: 'upright pendulum sway bobY=Math.sin(t*2.3)*0.035*R, rot=Math.sin(t*1.7)*0.055 + pulsing centered star scale=1+0.07*Math.sin(t*3.2)',
    };
  }
  if (/\b(trophy|award|achievement|cup|winner|crown)\b/.test(topic)) {
    return {
      label: 'celebratory crest lift',
      anatomyHint: 'PAINTER ORDER (back-to-front): draw side handles G.ring(±0.26*R,-0.10*R,0.13*R,0.05*R), base plinth G.box(0,0.42*R,0.48*R,0.10*R,0.03*R), and stem G.box(0,0.28*R,0.13*R,0.20*R,0.02*R) FIRST; THEN draw front chalice G.poly([[-0.30*R,-0.32*R],[0.30*R,-0.32*R],[0.17*R,0.19*R],[-0.17*R,0.19*R]]) overlapping stem; and centered G.star(0,-0.08*R,0.12*R,0.055*R,5) LAST on top.',
      codeHint: 'upright float bobY=Math.sin(t*2.4)*0.04*R, rot=Math.sin(t*1.7)*0.04 + pulsing centered star emblem inside cup',
    };
  }
  if (/\b(email|mail|envelope|inbox|newsletter|message|chat|comment|communication)\b/.test(topic)) {
    return {
      label: 'envelope & badge float',
      anatomyHint: 'Envelope body G.box(0,0.05*R,1.02*R,0.68*R,0.08*R), crisp inner V-flap crease G.poly([[-0.48*R,-0.22*R],[0,0.12*R],[0.48*R,-0.22*R]],null,rimCol,0.055*R,false), plus welded top-right badge G.disc(0.40*R,-0.22*R,0.14*R) LAST on top (NEVER slide paper below envelope, NEVER draw briefcase handle!).',
      codeHint: 'upright float bobY=Math.sin(t*2.4)*0.035*R, rot=Math.sin(t*1.6)*0.04 + smooth badge pulse scale=1+0.12*Math.sin(t*3.4) (ALWAYS visible, NEVER blink-hide)',
    };
  }
  if (/\b(negotiation|partnership|team|meeting|collaboration|networking)\b/.test(topic)) {
    return {
      label: 'paired executive agreement',
      anatomyHint: 'Use G.person(-0.30*R,0.06*R,0.34*R,col1,head1,rim) & G.person(0.30*R,0.06*R,0.34*R,col2,head2,rim) joined cleanly at center by G.handshake(0,0.14*R,0.28*R,col1,col2,"#F59E0B","#F8FAFC",rim), plus top emblem G.disc(0,-0.30*R,0.13*R) with G.check(0,-0.30*R,0.07*R) LAST on top (NO bottom shadow line, NO hiding!).',
      codeHint: 'upright float bobY=Math.sin(t*2.2)*0.03*R + smooth continuous badge pulse scale=1+0.09*Math.sin(t*3) (NEVER use if(sin>0) blink!)',
    };
  }
  if (/\b(leadership|executive|leader|manager|ceo|mentor|customer|support|headset|people|person|user|avatar|chair)\b/.test(topic)) {
    return {
      label: 'executive figure poise',
      anatomyHint: 'Draw podium/seat base G.box(0,0.34*R,0.56*R,0.22*R,0.04*R) FIRST, THEN centered G.person(0,-0.02*R,0.42*R,bodyCol,headCol,rimCol) cleanly resting on base, plus crest G.star(0,-0.44*R,0.10*R,0.045*R,5) cleanly above head (NEVER draw floating triangles or stick-legs!).',
      codeHint: 'upright dignified float bobY=Math.sin(t*2.1)*0.03*R, rot=Math.sin(t*1.4)*0.03 + smooth crest star pulse scale=1+0.09*Math.sin(t*3)',
    };
  }
  if (/\b(lightbulb|idea|bulb|innovation|creative|spark)\b/.test(topic)) {
    return {
      label: 'radiant filament pulse',
      anatomyHint: 'PAINTER ORDER: screw cap G.box(0,0.30*R,0.24*R,0.16*R,0.04*R) & base tip G.capsule(0,0.40*R,0.14*R,0.06*R) FIRST; solid opaque glass bulb G.disc(0,-0.02*R,0.28*R) + welded neck G.box(0,0.16*R,0.24*R,0.14*R,0.02*R); inner filament G.poly([[-0.08*R,0.06*R],[0,-0.08*R],[0.08*R,0.06*R]],null,col,0.04*R,false); plus 5 clean radial G.rays(0,-0.04*R,0.36*R,0.48*R,5,rot,0.045*R). NO giant half-circle dome, NO confetti squares!',
      codeHint: 'upright float bobY=Math.sin(t*2.3)*0.035*R + smooth radial ray length oscillation 0.44*R+0.06*R*Math.sin(t*3.2) & filament pulse',
    };
  }
  if (/\b(presentation|whiteboard|projector|pitch|slide|training)\b/.test(topic)) {
    return {
      label: 'easel chart presentation',
      anatomyHint: 'PAINTER ORDER: tripod legs G.pill(0,0,-0.24*R,0.44*R,0.045*R) & G.pill(0,0,0.24*R,0.44*R,0.045*R) FIRST; upright easel board G.box(0,-0.08*R,0.92*R,0.62*R,0.06*R); inner chart G.bar at x=[-0.22*R,-0.07*R,0.08*R], yBase=0.14*R, height [0.16*R..0.34*R] + rising trend G.arrow(0.16*R,0.08*R,0.34*R,-0.16*R,0.04*R,0.10*R).',
      codeHint: 'upright float bobY=Math.sin(t*2.1)*0.025*R + staggered G.bar waves & rising G.arrow inside board',
    };
  }
  if (/\b(laptop|computer|desktop|monitor|screen|software|code|web)\b/.test(topic)) {
    return {
      label: 'upright display telemetry',
      anatomyHint: 'PAINTER ORDER: base stand G.box(0,0.34*R,0.36*R,0.08*R,0.03*R) & neck G.box(0,0.22*R,0.14*R,0.18*R,0.02*R) FIRST; widescreen monitor G.box(0,-0.04*R,0.96*R,0.62*R,0.07*R) & inner display G.box(0,-0.04*R,0.82*R,0.46*R,0.04*R); inside screen: 3 G.bar & G.pie cleanly separated.',
      codeHint: 'upright float bobY=Math.sin(t*2.1)*0.025*R + smooth dashboard bars & ring pulse strictly inside monitor screen',
    };
  }
  if (/\b(money|dollar|coin|currency|bank|finance|investment|revenue|payment|cash)\b/.test(topic)) {
    return {
      label: 'minted value gleam',
      anatomyHint: 'PAINTER ORDER: stacked back gold coins G.disc(-0.18*R,-0.06*R,0.30*R,"#F59E0B","#F8FAFC",2) FIRST; front hero coin G.disc(0.08*R,0.06*R,0.36*R,"#FFD700","#F8FAFC",3), inner ring G.ring(0.08*R,0.06*R,0.27*R,0.03*R,0,Math.PI*2,"#B45309"), centered G.star(0.08*R,0.06*R,0.13*R,0.055*R,5,"#FFFFFF") LAST on top.',
      codeHint: 'upright coin gleam float bobY=Math.sin(t*2.3)*0.035*R, rot=Math.sin(t*1.6)*0.04 + crisp front star crest pulse',
    };
  }
  if (/\b(briefcase|portfolio|folder|file|document|contract|invoice|resume|wallet)\b/.test(topic)) {
    return {
      label: 'executive hinged float',
      anatomyHint: 'Wide horizontal body G.box(0,0.06*R,1.04*R,0.68*R,0.09*R), welded top handle G.ring(0,-0.28*R,0.16*R,0.06*R,Math.PI,Math.PI*2), overlapping lid G.box(0,-0.08*R,1.06*R,0.28*R,0.07*R), centered clasp G.box(0,0.06*R,0.16*R,0.14*R,0.03*R).',
      codeHint: 'upright hover bobY=Math.sin(t*2.4)*0.035*R, rot=Math.sin(t*1.6)*0.04 (NEVER spin 360deg!) + gentle lid/clasp breath scaleY=1+0.04*Math.sin(t*3)',
    };
  }
  if (/\b(target|bullseye|strategy|aim|dart|goal)\b/.test(topic)) {
    return {
      label: 'diagonal strike & ripple',
      anatomyHint: 'PAINTER ORDER (ALL 3 DISCS ALWAYS 100% OPAQUE & VISIBLE — NEVER fade/hide outer discs or use green!): (1) outer disc G.disc(0,0,0.52*R,"#F43F5E","#F8FAFC",3); (2) middle disc G.disc(0,0,0.34*R,"#F8FAFC"); (3) center disc G.disc(0,0,0.16*R,"#F43F5E"); (4) bullseye dot G.disc(0,0,0.07*R,"#FFD700"); (5) LAST ON TOP: inward dart G.arrow(0.50*R+d,-0.50*R-d, 0.03*R+d*0.1,-0.03*R-d*0.1, 0.05*R, 0.14*R, "#F8FAFC") where arrowhead TIP ALWAYS points INWARD toward (0,0)!',
      codeHint: 'bullseye pulse scale=1+0.04*Math.sin(t*3.0) + inward dart strike d=Math.pow(Math.max(0,Math.sin(t*2.2)),2)*0.12*R along top-right diagonal (NEVER reverse arrow outward, NEVER blink/fade rings!)',
    };
  }
  if (/\b(dashboard|analytics|chart|graph|report|metric|kpi|profit|growth|candlestick)\b/.test(topic)) {
    return {
      label: 'ascending elastic lift',
      anatomyHint: 'Upright tablet card G.box(0,0,1.08*R,0.74*R,0.09*R) — NEVER spin! STRICT SEPARATED ZONES: left 3 G.bar at x=-0.34*R, -0.19*R, -0.04*R with yBase=0.22*R, bw=0.10*R, height ALWAYS in [0.16*R..0.44*R] (NEVER shrink below 0.16*R!); right side G.pie(0.27*R,0,0.17*R,-Math.PI/2,sweep,sliceCol,trackCol) cleanly clear of bars.',
      codeHint: 'upright hover bobY=Math.sin(t*2.1)*0.03*R, rot=Math.sin(t*1.5)*0.03 (NEVER >4deg!) + staggered G.bar height (0.28+0.12*Math.sin(t*2.6-i*0.8))*R & G.pie sweep 2.2+0.9*Math.sin(t*2.2)',
    };
  }
  if (/\b(building|skyscraper|tower|headquarters|architecture)\b|\boffice\s+building\b|\bcorporate\s+building\b/.test(topic)) {
    return {
      label: 'architectural plinth glow',
      anatomyHint: 'PAINTER ORDER: (1) roof spire G.pill(-0.08*R,-0.46*R,-0.08*R,-0.56*R,0.035*R) & crown G.box(-0.08*R,-0.41*R,0.26*R,0.08*R,0.02*R); (2) main tower G.box(-0.08*R,0.02*R,0.48*R,0.82*R,0.04*R) & side wing G.box(0.24*R,0.14*R,0.26*R,0.58*R,0.04*R); (3) plinth G.box(0,0.44*R,0.96*R,0.09*R,0.03*R); (4) FULL-HEIGHT WINDOW GRID: draw 3 cols x 4 rows G.box(x,y,0.09*R,0.10*R,0.02*R) at x=[-0.21*R,-0.08*R,0.05*R], y=[-0.28*R,-0.12*R,0.04*R,0.20*R], lobby door G.box(-0.08*R,0.34*R,0.14*R,0.14*R,0.03*R), plus 2x3 wing windows x=[0.19*R,0.29*R], y=[-0.04*R,0.10*R,0.24*R] (NEVER pack thin lines at bottom!).',
      codeHint: 'upright architectural poise bobY=Math.sin(t*1.8)*0.02*R, rot=Math.sin(t*1.2)*0.02 + warm gold/cyan floor-by-floor illumination wave sweeping upward across ALL 4 upper window rows',
    };
  }
  if (/\b(puzzle|connect|link)\b/.test(topic)) {
    return {
      label: 'interlocked precision fit',
      anatomyHint: '2 solid blocks G.box(-0.19*R,0,0.40*R,0.40*R,0.06*R) & G.box(0.19*R,0,0.40*R,0.40*R,0.06*R) interlocked over centered tab G.disc(0,0,0.11*R) LAST on top.',
      codeHint: 'gentle x micro-slide ±0.03*R staying overlapped over center tab + upright float bobY=Math.sin(t*2.2)*0.03*R',
    };
  }
  if (/\b(calendar|event|schedule)\b/.test(topic)) {
    return {
      label: 'structured grid calendar',
      anatomyHint: 'PAINTER ORDER: top rings G.pill(-0.22*R,-0.40*R,-0.22*R,-0.26*R,0.05*R) & G.pill(0.22*R,-0.40*R,0.22*R,-0.26*R,0.05*R); body G.box(0,0.05*R,0.88*R,0.74*R,0.08*R); header strip G.box(0,-0.20*R,0.88*R,0.20*R,0.04*R); crisp 3x2 date squares G.box inside body.',
      codeHint: 'upright float bobY=Math.sin(t*2.1)*0.03*R + smooth active date cell scale/color highlight',
    };
  }
  if (/\b(clock|deadline|timer|time)\b/.test(topic)) {
    return {
      label: 'precision dial sweep',
      anatomyHint: 'Centered bezel G.disc(0,0,0.48*R) + inner face G.disc(0,0,0.38*R) + hour/minute hands G.pill(0,0,hx,hy) & G.pill(0,0,mx,my) anchored at (0,0) + center cap G.disc(0,0,0.055*R) LAST on top.',
      codeHint: 'upright float bobY=Math.sin(t*2.1)*0.03*R + sweeping minute hand angle=t*2.0 & hour hand angle=t*0.35 anchored at (0,0)',
    };
  }
  if (/\b(search|magnifying|inspect|audit|find|research)\b/.test(topic)) {
    return {
      label: 'optical lens sweep',
      anatomyHint: 'PAINTER ORDER: solid handle G.pill(0.18*R,0.18*R,0.46*R,0.46*R,0.10*R,"#1E293B") FIRST; opaque inner lens G.disc(-0.08*R,-0.08*R,0.30*R,"#0F172A","#38BDF8",0.07*R) with mini rising G.bar inside lens.',
      codeHint: 'smooth circular scan offset dx=Math.cos(t*2)*0.04*R, dy=Math.sin(t*2)*0.04*R + inner chart bar wave',
    };
  }
  if (/\b(bell|megaphone|alarm|siren|alert|horn|speaker|mic)\b/.test(topic)) {
    return {
      label: 'acoustic ring swing',
      anatomyHint: 'Top loop G.ring(0,-0.42*R,0.08*R), flared dome G.poly + bottom rim G.capsule(0,0.24*R,0.66*R,0.10*R), tucked clapper G.disc(cxOff,0.32*R,0.09*R), symmetric outer sound arcs G.ring at ±0.45*R.',
      codeHint: 'pendulum pivot G.part(0,-0.36*R,Math.sin(t*4)*0.11,1,1,fn) + delayed clapper sway & expanding soundwave arc sweep',
    };
  }
  if (/\b(heart|pulse|ecg|cardiogram|dna|pill|capsule|syringe|medical|stethoscope|health)\b/.test(topic)) {
    return {
      label: 'cardiac lub-dub pulse',
      anatomyHint: 'Unified medical emblem centered at (0,0): symmetric heart (2 welded G.disc + lower triangle G.poly) or rounded cross/capsule with crisp centered ECG G.poly(...,false) strictly inside.',
      codeHint: 'double-beat lub-dub scale=1+0.08*(Math.pow(Math.max(0,Math.sin(t*3.4)),4)+0.5*Math.pow(Math.max(0,Math.sin(t*3.4-0.5)),4)) + smooth bob',
    };
  }
  if (/\b(lock|padlock|vault|shield|key|fingerprint|biometric|security|firewall|safe)\b/.test(topic)) {
    return {
      label: 'precision locking recoil',
      anatomyHint: 'PAINTER ORDER: top shackle G.ring(0,-0.16*R,0.21*R,0.09*R,Math.PI,Math.PI*2) FIRST behind body; unified shield G.poly or padlock body G.box(0,0.12*R,0.70*R,0.58*R,0.10*R) on top + centered keyhole/G.check inside body LAST.',
      codeHint: 'upright hover + shackle snap yOff=-Math.abs(Math.sin(t*2.6))*0.05*R + inner keyhole/check pulse (NEVER spin 360deg!)',
    };
  }
  if (/\b(cart|truck|drone|airplane|plane|wheel|forklift|parcel|cargo|delivery|rocket)\b/.test(topic)) {
    return {
      label: 'kinetic transport suspension',
      anatomyHint: 'Cohesive vehicle/rocket chassis at (0,0) with wheels/fins/thrusters overlapping main hull by >= 0.04*R — zero detached wheels or boxes.',
      codeHint: 'chassis suspension bobY=Math.sin(t*3.6)*0.03*R + synchronized spinning wheels/rotors G.part(wx,wy,t*5,1,1,fn) at exact wheel sockets',
    };
  }
  if (/\b(atom|orbit|planet|globe|radar|compass|satellite|astrolabe|gear|settings|cog)\b/.test(topic)) {
    return {
      label: 'orbital & axis precession',
      anatomyHint: 'Centered core G.disc(0,0,0.18*R) surrounded symmetrically by concentric/tilted G.ring orbits or gear teeth anchored at (0,0).',
      codeHint: 'smooth continuous rotation rot=t*1.4 around (0,0) + orbiting node G.disc along exact ring radius',
    };
  }
  if (/\b(brain|chip|cpu|ai|server|network|cloud|robot|camera|eye|microscope)\b/.test(topic)) {
    return {
      label: 'smart telemetry pulse',
      anatomyHint: 'Unified centered tech housing inside [-0.54*R,+0.54*R]; all pins, lenses, or network nodes physically overlap housing by >= 0.04*R.',
      codeHint: 'upright float bobY=Math.sin(t*2.3)*0.035*R, rot=Math.sin(t*1.6)*0.04 + staggered node/aperture harmonic pulse',
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
        anatomyHint: 'Unified centered emblem inside [-0.54*R,+0.54*R] with all sub-parts welded cleanly (overlap >= 0.04*R).',
        codeHint: legacy[overrideMode],
      };
    }
  }
  return {
    label: 'harmonic elastic float',
    anatomyHint: 'One unified recognizable silhouette centered at (0,0) inside [-0.54*R,+0.54*R]; every sub-part MUST overlap main body by >= 0.04*R (zero floating shapes).',
    codeHint: 'upright bobY=Math.sin(t*2.4)*0.035*R, rot=Math.sin(t*1.6)*0.04 (NEVER spin 360deg!) + crisp secondary sub-part harmonic pulse',
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
  } = body;

  if (!promptTopic) {
    throw new Error("Prompt topic wajib diisi");
  }

  const ai = getClient(apiKey);
  const targetModel = sanitizeModel(model);

  const catMeta = findCategoryById(subCategory, type);
  const catInfo = catMeta ? `${catMeta.enName} (${catMeta.name}) - ${catMeta.description}` : subCategory;

  const isBackground = type === 'bg';
  const motionPlan = resolveServerPromptMotionPlan(promptTopic, type, motionDynamics);

  const colorStyleDirective = isGreenScreen
    ? `GREEN SCREEN (#00ff00 cleared): NEVER fillRect(0,0,w,h)/clearRect; ctx.shadowBlur=0; ctx.globalAlpha=1 (NO rgba(...,0.x), NO translucent glass/shadow lines!); ONLY solid opaque NON-GREEN colors (#FFD700,#00E5FF,#9333EA,#F43F5E,#F8FAFC,#F97316,#1E293B).`
    : (neonGlow
        ? "DARK BG (#080c14 cleared): NEVER fillRect(0,0,w,h) for icons; shadowBlur=8 on bright accents (reset 0)."
        : "CRISP VECTOR (#080c14 cleared): shadowBlur=0.");

  const geometryGuide = isBackground
    ? `FULL-FRAME BG (0..w,0..h): ${motionPlan.anatomyHint}`
    : `WELDED 3D ICON: Center via G.part(cx, cy+bobY, rot, sx, sy, function(){ ... }). Set R=S*0.72. RULES: (1) G.box/G.disc/G.oval (x,y) ARE CENTER COORDS; (2) PAINTER ORDER: back parts first -> main body -> front emblems LAST; (3) NEVER blink-hide (if(sin>0)), NEVER shrink bars <0.14*R. ANATOMY: ${motionPlan.anatomyHint}`;

  const systemPrompt = `60 FPS Canvas 2D Motion Coder. Return ONLY RAW JS: function drawFrame(ctx, w, h, cx, cy, S, t) { ... } (no markdown/HTML/canvas/resize/rAF; never redeclare canvas/ctx/w/h/cx/cy/S/G).
HELPERS G: G.grad(c1,c2,c3,x0,y0,x1,y1) | G.box(x,y,bw,bh,r,fill,rim,lw) | G.bar(x,yBase,bw,bh,r,fill,rim,lw) | G.capsule(x,y,bw,bh,fill,rim,lw) | G.disc(x,y,r,fill,rim,lw) | G.oval(x,y,rx,ry,rot,fill,rim,lw) | G.ring(x,y,r,thick,a0,a1,col) | G.poly(pts,fill,rim,lw,close) | G.ngon(x,y,r,n,rot,fill,rim) | G.star(x,y,ro,ri,n,rot,fill,rim) | G.pill(x1,y1,x2,y2,thick,col) | G.arrow(x1,y1,x2,y2,thick,headLen,col) | G.person(x,y,s,bodyCol,headCol,rimCol) | G.check(x,y,s,thick,col) | G.pie(x,y,r,a0,sweep,sliceCol,baseCol,rimCol) | G.rays(x,y,rIn,rOut,n,rot,thick,col) | G.handshake(x,y,s,colL,colR,handCol,cuffCol,rimCol) | G.part(tx,ty,rot,sx,sy,fn)
SPEC: "${promptTopic}" (${catInfo}) | Style: ${style} | Palette: ${colorMode}
- ${geometryGuide}
- Motion (${motionPlan.label}): ${motionPlan.codeHint}.
- ${colorStyleDirective}`;

  const { response } = await generateContentWithFallback(
    ai,
    targetModel,
    (currentModel) => {
      const animConfig: any = {
        temperature: 0.2,
        maxOutputTokens: 1750,
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
    : "WELDED 3D ICON: Center with G.part(cx, cy+bobY, rot, sx, sy, fn), R=S*0.72. RULES: (1) G.box/G.disc/G.oval (x,y) ARE CENTER COORDS; (2) PAINTER ORDER: back parts first -> main body -> front emblems LAST; (3) Weld inside [-0.62*R,+0.62*R] (overlap >=0.04*R); (4) NEVER blink-hide (if(sin>0)), NEVER shrink bars <0.14*R.";

  const topicLines = promptList.map((p, idx) => {
    const plan = resolveServerPromptMotionPlan(p, type, motionDynamics);
    return `// ===ANIM_${idx}=== "${p}" [Anatomy: ${plan.anatomyHint} | Motion (${plan.label}): ${plan.codeHint}]`;
  }).join('\n');

  const batchPrompt = `60 FPS Canvas 2D Motion Coder. Write ${promptList.length} independent RAW JS functions separated ONLY by:
${promptList.map((_, idx) => `// ===ANIM_${idx}===\nfunction drawFrame(ctx, w, h, cx, cy, S, t) { ... }`).join('\n')}
HELPERS G: G.grad(c1,c2,c3,x0,y0,x1,y1) | G.box(x,y,bw,bh,r,fill,rim,lw) | G.bar(x,yBase,bw,bh,r,fill,rim,lw) | G.capsule(x,y,bw,bh,fill,rim,lw) | G.disc(x,y,r,fill,rim,lw) | G.oval(x,y,rx,ry,rot,fill,rim,lw) | G.ring(x,y,r,thick,a0,a1,col) | G.poly(pts,fill,rim,lw,close) | G.ngon(x,y,r,n,rot,fill,rim) | G.star(x,y,ro,ri,n,rot,fill,rim) | G.pill(x1,y1,x2,y2,thick,col) | G.arrow(x1,y1,x2,y2,thick,headLen,col) | G.person(x,y,s,bodyCol,headCol,rimCol) | G.check(x,y,s,thick,col) | G.pie(x,y,r,a0,sweep,sliceCol,baseCol,rimCol) | G.rays(x,y,rIn,rOut,n,rot,thick,col) | G.handshake(x,y,s,colL,colR,handCol,cuffCol,rimCol) | G.part(tx,ty,rot,sx,sy,fn)
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
        temperature: 0.2,
        maxOutputTokens: Math.min(3400, Math.max(1750, promptList.length * 1700)),
      };
      const smartThinking = getSmartThinkingConfig(currentModel, 'animation');
      if (smartThinking) cfg.thinkingConfig = smartThinking;
      return { contents: batchPrompt, config: cfg };
    }
  );

  const rawText = (response.text || "").trim();
  const codeItems = parseServerBatchDelimiterOutput(rawText, promptList.length);

  const results = promptList.map((promptTopic, idx) => {
    const rawCode = codeItems[idx] || '';
    const html = rawCode ? extractHTMLFromMarkdown(rawCode, isGreenScreen) : '';
    const valid = /ctx\.(fill|stroke|beginPath|roundRect|arc|ellipse|bezierCurveTo|lineTo)\s*\(/i.test(html);
    if (!html || !valid) return null;
    return {
      id: 'anim_' + Date.now() + '_' + idx + Math.random().toString(36).substring(7),
      title: `${promptTopic.substring(0, 35)}... (${idx + 1}/${promptList.length})`,
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
    motionDynamics = "flow",
    neonGlow = true,
  } = body;

  if (!promptTopic) {
    res.status(400).json({ error: "Prompt topic wajib diisi" });
    return;
  }

  const ai = getClient(apiKey);
  const targetModel = sanitizeModel(model);
  const isBackground = type === 'bg';
  const motionPlan = resolveServerPromptMotionPlan(promptTopic, type, motionDynamics);

  const colorStyleDirective = isGreenScreen
    ? "- GREEN SCREEN (#00ff00 cleared): NEVER fillRect(0,0,w,h); shadowBlur=0; globalAlpha=1 (NO rgba(...,0.x), NO translucent glass/shadow lines!); ONLY solid opaque NON-GREEN colors."
    : (neonGlow
        ? "- DARK BG (#080c14): shadowBlur=8 on accents (reset 0)."
        : "- CRISP VECTOR (#080c14): shadowBlur=0.");

  const geometryGuide = isBackground
    ? `FULL-FRAME BG (0..w,0..h): ${motionPlan.anatomyHint}`
    : `WELDED 3D ICON: Center via G.part(cx, cy+bobY, rot, sx, sy, fn), R=S*0.72. RULES: (1) G.box/G.disc/G.oval (x,y) ARE CENTER COORDS; (2) PAINTER ORDER: back parts first -> main body -> front emblems LAST; (3) NEVER blink-hide (if(sin>0)), NEVER shrink bars <0.14*R. ANATOMY: ${motionPlan.anatomyHint}`;

  const systemPrompt = `60 FPS Canvas 2D Motion Coder. Output ONLY RAW JS: function drawFrame(ctx, w, h, cx, cy, S, t) { ... } (no markdown/HTML/canvas/resize/rAF; never redeclare canvas/ctx/w/h/cx/cy/S/G).
HELPERS G: G.grad(c1,c2,c3,x0,y0,x1,y1) | G.box(x,y,bw,bh,r,fill,rim,lw) | G.bar(x,yBase,bw,bh,r,fill,rim,lw) | G.capsule(x,y,bw,bh,fill,rim,lw) | G.disc(x,y,r,fill,rim,lw) | G.oval(x,y,rx,ry,rot,fill,rim,lw) | G.ring(x,y,r,thick,a0,a1,col) | G.poly(pts,fill,rim,lw,close) | G.ngon(x,y,r,n,rot,fill,rim) | G.star(x,y,ro,ri,n,rot,fill,rim) | G.pill(x1,y1,x2,y2,thick,col) | G.arrow(x1,y1,x2,y2,thick,headLen,col) | G.person(x,y,s,bodyCol,headCol,rimCol) | G.check(x,y,s,thick,col) | G.pie(x,y,r,a0,sweep,sliceCol,baseCol,rimCol) | G.rays(x,y,rIn,rOut,n,rot,thick,col) | G.handshake(x,y,s,colL,colR,handCol,cuffCol,rimCol) | G.part(tx,ty,rot,sx,sy,fn)
SPEC: "${promptTopic}" | ${geometryGuide} | Style: ${style} | Palette: ${colorMode} | Motion (${motionPlan.label}): ${motionPlan.codeHint}.
${colorStyleDirective}`;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  try {
    const animConfig: any = {
      temperature: 0.2,
      maxOutputTokens: 1750,
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
HELPERS G: G.grad(c1,c2,c3,x0,y0,x1,y1) | G.box(x,y,bw,bh,r,fill,rim,lw) | G.bar(x,yBase,bw,bh,r,fill,rim,lw) | G.capsule(x,y,bw,bh,fill,rim,lw) | G.disc(x,y,r,fill,rim,lw) | G.oval(x,y,rx,ry,rot,fill,rim,lw) | G.ring(x,y,r,thick,a0,a1,col) | G.poly(pts,fill,rim,lw,close) | G.ngon(x,y,r,n,rot,fill,rim) | G.star(x,y,ro,ri,n,rot,fill,rim) | G.pill(x1,y1,x2,y2,thick,col) | G.arrow(x1,y1,x2,y2,thick,headLen,col) | G.person(x,y,s,bodyCol,headCol,rimCol) | G.check(x,y,s,thick,col) | G.pie(x,y,r,a0,sweep,sliceCol,baseCol,rimCol) | G.rays(x,y,rIn,rOut,n,rot,thick,col) | G.handshake(x,y,s,colL,colR,handCol,cuffCol,rimCol) | G.part(tx,ty,rot,sx,sy,fn)
ATURAN: (1) Semua (x,y) pada G.box/G.disc/G.oval adalah TITIK TENGAH; (2) PAINTER ORDER (lapisan belakang dulu -> badan utama -> emblem/ikon depan TERAKHIR); (3) Semua sub-bagian wajib menempel/overlap >=0.04*R di dalam [-0.62*R,+0.62*R], ZERO bagian melayang terpisah, ZERO kotak/garis transparan, ZERO gerigi liar.
Outputkan HANYA blok metadata + fungsi RAW JS (tanpa markdown/HTML/deklarasi canvas/ctx/w/h/cx/cy/S/G):
<script type="application/json" id="shape-analysis">{"objectName":"...","shapeDescription":"...","detectedElements":[],"professionalMotionPlan":"...","similaritySynthesis":"...","glowColor":"#38bdf8"}</script>
function drawFrame(ctx, w, h, cx, cy, S, t) { ... }`;

    const { response } = await generateContentWithFallback(
      ai,
      targetModel,
      (currentModel) => {
        const config: any = {
          temperature: 0.15,
          maxOutputTokens: 2100,
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
