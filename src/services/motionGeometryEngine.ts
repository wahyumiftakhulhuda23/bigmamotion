// Shared Canvas 2D Motion Geometry Engine, Seed Variation DNA & Prompt-to-Motion Resolver
// Single Source of Truth used by both client (geminiService.ts) and server (server/app.ts).

import { ENGINE_BASE_PRIMITIVES_JS, ENGINE_HERO_ICONS_A_JS } from './motionEngineIconsA';
import { ENGINE_HERO_ICONS_B_JS, ENGINE_BG_HELPERS_JS } from './motionEngineIconsB';
import { ENGINE_HERO_ICONS_C_JS } from './motionEngineIconsC';

export const STUDIO_GEOMETRY_ENGINE_JS = `${ENGINE_BASE_PRIMITIVES_JS}${ENGINE_HERO_ICONS_A_JS}${ENGINE_HERO_ICONS_B_JS}${ENGINE_HERO_ICONS_C_JS}${ENGINE_BG_HELPERS_JS}
    };`;

export const HELPERS_G_BASE_DOC =
  'G.grad(c1,c2,c3,x0,y0,x1,y1) | G.box(x,y,bw,bh,r,f,rim,lw) | G.bar(x,yB,bw,bh,r,f,rim,lw) | G.capsule(x,y,bw,bh,f,rim,lw) | G.disc(x,y,r,f,rim,lw) | G.oval(x,y,rx,ry,rot,f,rim,lw) | G.ring(x,y,r,th,a0,a1,col) | G.poly(pts,f,rim,lw,cl) | G.trap(x,y,tw,bw,h,r,f,rim,lw) | G.uArc(x,y,w,h,th,dir,col) | G.crest(x,y,bw,bh,f,rim,lw) | G.cloudShape(x,y,bw,bh,f,rim,lw) | G.gearWheel(x,y,r,teeth,rot,f,hC,rim,lw) | G.heartShape(x,y,s,f,rim,lw) | G.dropShape(x,y,s,rot,f,rim,lw) | G.curveArc(x1,y1,cx1,cy1,x2,y2,th,col) | G.ngon(x,y,r,n,rot,f,rim) | G.star(x,y,ro,ri,n,rot,f,rim) | G.pill(x1,y1,x2,y2,th,col) | G.arrow(x1,y1,x2,y2,th,hL,col) | G.person(x,y,s,b,h,rim) | G.check(x,y,s,th,col) | G.pie(x,y,r,a0,sw,sC,bC,rim) | G.rays(x,y,rI,rO,n,rot,th,col) | G.dome(x,y,bw,bh,f,rim,lw) | G.wave(x,y,w,amp,freq,ph,th,col) | G.grid(x,y,bw,bh,cols,rows,r,act,f,aF,rim,lw) | G.bolt(x,y,s,f,rim,lw) | G.cross(x,y,s,th,f,rim,lw) | G.leaf(x,y,s,rot,f,rim,lw) | G.part(tx,ty,rot,sx,sy,fn)';

export const HELPERS_G_HERO_DOC = '';

export const HELPERS_G_BG_DOC =
  `${HELPERS_G_BASE_DOC} | G.bgBackdrop(w,h,c0,c1,c2,dir)`;

export const HELPERS_G_DOC = HELPERS_G_BASE_DOC;

export const HELPERS_G_VISION_DOC =
  `${HELPERS_G_BASE_DOC} | G.bgBackdrop(w,h,c0,c1,c2,dir)`;

export function stripLeadingCodeFenceAndLang(raw: string): string {
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

export function sanitizeInjectedJsBody(rawJs: string): string {
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

export function wrapCanvasCodeToHtml(
  rawCode: string,
  isGreenScreen: boolean = false,
  shapeAnalysisTag: string = ''
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
    var __bigmaClearing = false;
    var __gsRawFill = null;
    var __gsRawStroke = null;
    var __gsStateStack = [];
    var __bigmaResetGS = function() {
      __bigmaGSAlpha = 1;
      __gsRawFill = null;
      __gsRawStroke = null;
      __gsStateStack.length = 0;
    };
    try { Object.defineProperty(ctx, 'shadowBlur', { set: function(){}, get: function(){ return 0; }, configurable: true }); } catch(e) {}
    try {
      var __origAlphaDesc = typeof CanvasRenderingContext2D !== 'undefined' ? Object.getOwnPropertyDescriptor(CanvasRenderingContext2D.prototype, 'globalAlpha') : null;
      var __origFillDesc = typeof CanvasRenderingContext2D !== 'undefined' ? Object.getOwnPropertyDescriptor(CanvasRenderingContext2D.prototype, 'fillStyle') : null;
      var __origStrokeDesc = typeof CanvasRenderingContext2D !== 'undefined' ? Object.getOwnPropertyDescriptor(CanvasRenderingContext2D.prototype, 'strokeStyle') : null;
      if (__origAlphaDesc && __origAlphaDesc.set) {
        Object.defineProperty(ctx, 'globalAlpha', {
          set: function(v){
            var n = (typeof v === 'number' && isFinite(v)) ? Math.max(0, Math.min(1, v)) : 1;
            __bigmaGSAlpha = n;
            __origAlphaDesc.set.call(ctx, n < 0.16 ? 0 : 1);
            if (!__bigmaClearing && typeof G !== 'undefined' && G._c) {
              if (typeof __gsRawFill === 'string' && __origFillDesc && __origFillDesc.set) {
                __origFillDesc.set.call(ctx, G._c(__gsRawFill));
              }
              if (typeof __gsRawStroke === 'string' && __origStrokeDesc && __origStrokeDesc.set) {
                __origStrokeDesc.set.call(ctx, G._c(__gsRawStroke));
              }
            }
          },
          get: function(){ return (typeof __bigmaGSAlpha === 'number') ? __bigmaGSAlpha : 1; },
          configurable: true
        });
      }
      if (__origFillDesc && __origFillDesc.set) {
        Object.defineProperty(ctx, 'fillStyle', {
          set: function(v){
            __gsRawFill = (!__bigmaClearing && typeof v === 'string') ? v : null;
            var nextV = (__gsRawFill && typeof G !== 'undefined' && G._c) ? G._c(__gsRawFill) : v;
            __origFillDesc.set.call(ctx, nextV);
          },
          get: function(){ return __origFillDesc.get ? __origFillDesc.get.call(ctx) : '#ffffff'; },
          configurable: true
        });
      }
      if (__origStrokeDesc && __origStrokeDesc.set) {
        Object.defineProperty(ctx, 'strokeStyle', {
          set: function(v){
            __gsRawStroke = (!__bigmaClearing && typeof v === 'string') ? v : null;
            var nextV = (__gsRawStroke && typeof G !== 'undefined' && G._c) ? G._c(__gsRawStroke) : v;
            __origStrokeDesc.set.call(ctx, nextV);
          },
          get: function(){ return __origStrokeDesc.get ? __origStrokeDesc.get.call(ctx) : '#ffffff'; },
          configurable: true
        });
      }
      var _origSaveGS = ctx.save.bind(ctx);
      var _origRestoreGS = ctx.restore.bind(ctx);
      ctx.save = function() {
        __gsStateStack.push([typeof __bigmaGSAlpha === 'number' ? __bigmaGSAlpha : 1, __gsRawFill, __gsRawStroke]);
        return _origSaveGS();
      };
      ctx.restore = function() {
        var r = _origRestoreGS();
        if (__gsStateStack.length > 0) {
          var st = __gsStateStack.pop();
          __bigmaGSAlpha = st[0];
          __gsRawFill = st[1];
          __gsRawStroke = st[2];
        } else {
          __bigmaGSAlpha = 1;
          __gsRawFill = null;
          __gsRawStroke = null;
        }
        return r;
      };
      var _isFullCanvasWipe = function(rw, rh) {
        var aw = Math.abs(typeof rw === 'number' && isFinite(rw) ? rw : 0);
        var ah = Math.abs(typeof rh === 'number' && isFinite(rh) ? rh : 0);
        var cw = (typeof w === 'number' && w > 0) ? w : 320;
        var ch = (typeof h === 'number' && h > 0) ? h : 180;
        var scX = 1, scY = 1;
        try {
          if (ctx.getTransform) {
            var m = ctx.getTransform();
            var d = (typeof dpr === 'number' && dpr > 0) ? dpr : 1;
            scX = Math.hypot(m.a, m.b) / d;
            scY = Math.hypot(m.c, m.d) / d;
          }
        } catch(e) {}
        return (aw * scX >= cw * 0.80 && ah * scY >= ch * 0.80);
      };
      var _origFillRectGS = ctx.fillRect.bind(ctx);
      ctx.fillRect = function(rx, ry, rw, rh) {
        if (!__bigmaClearing && !(typeof __bigmaBgActive !== 'undefined' && __bigmaBgActive) && _isFullCanvasWipe(rw, rh)) {
          return;
        }
        return _origFillRectGS(rx, ry, rw, rh);
      };
      var _origClearRectGS = ctx.clearRect.bind(ctx);
      ctx.clearRect = function(rx, ry, rw, rh) {
        if (!__bigmaClearing && !(typeof __bigmaBgActive !== 'undefined' && __bigmaBgActive) && _isFullCanvasWipe(rw, rh)) {
          _origSaveGS();
          try {
            var d = (typeof dpr === 'number' && dpr > 0) ? dpr : 1;
            ctx.setTransform(d, 0, 0, d, 0, 0);
            __bigmaClearing = true;
            if (__origAlphaDesc && __origAlphaDesc.set) __origAlphaDesc.set.call(ctx, 1);
            if (__origFillDesc && __origFillDesc.set) __origFillDesc.set.call(ctx, '#00ff00');
            _origFillRectGS(0, 0, (typeof w === 'number' && w > 0) ? w : 320, (typeof h === 'number' && h > 0) ? h : 180);
          } finally {
            __bigmaClearing = false;
            _origRestoreGS();
          }
          return;
        }
        return _origClearRectGS(rx, ry, rw, rh);
      };
    } catch(e) {}`
    : `var __bigmaGS = false; var __bigmaClearing = false; var __bigmaResetGS = function(){};`;

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
      __bigmaClearing = true;
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = ${clearFill};
      ctx.fillRect(0, 0, w, h);
      __bigmaClearing = false;
      __bigmaResetGS();
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
      __bigmaClearing = false;
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
      __bigmaClearing = true;
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = ${clearFill};
      ctx.fillRect(0, 0, w, h);
      __bigmaClearing = false;
      __bigmaResetGS();
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
      __bigmaClearing = false;
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
    var w = 800, h = 600, cx = 400, cy = 300, S = 372, R = 298, dpr = 1;
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
      S = Math.min(w, h) * 0.62;
      R = S * 0.80;
    }
    var resize = __bigmaResize;
    window.addEventListener('resize', __bigmaResize);
    __bigmaResize();
    ${runnerScript}
  </script>
</body>
</html>`;
}

let __variationSeq = 0;
const subjectVariantCursor = new Map<string, number>();

export const VARIATION_PALETTES: string[][] = [
  ['#1E293B', '#4F46E5', '#00E5FF', '#FFD700'],
  ['#0F172A', '#0284C7', '#38BDF8', '#F97316'],
  ['#1E1B4B', '#7C3AED', '#22D3EE', '#FACC15'],
  ['#1F2937', '#E11D48', '#FB923C', '#F8FAFC'],
  ['#0F172A', '#2563EB', '#F59E0B', '#38BDF8'],
  ['#1E293B', '#9333EA', '#00E5FF', '#FB7185'],
  ['#172554', '#0EA5E9', '#F43F5E', '#FFD700'],
  ['#27272A', '#6366F1', '#EC4899', '#FBBF24'],
];

export const VARIATION_MOTIONS: string[] = [
  'hoverY=Math.sin(t*2.0)*0.022*R, rot=0, phase=0',
  'hoverY=Math.cos(t*2.1)*0.024*R, rot=0, phase=0.8',
  'hoverY=Math.sin(t*1.9+0.6)*0.020*R, rot=0, phase=1.6',
  'hoverY=Math.sin(t*2.2)*0.022*R, rot=0, phase=2.4',
  'hoverY=Math.cos(t*1.85)*0.024*R, rot=0, phase=3.1',
  'hoverY=Math.sin(t*2.3+1.1)*0.020*R, rot=0, phase=4.0',
];

function getPromptTopicBucket(promptTopic: string): string {
  const stopWords = new Set([
    'create', 'a', 'an', 'the', 'minimalist', 'corporate', 'business', 'modern', 'professional',
    'clean', 'flat', '3d', 'ui', 'icon', 'animation', 'animated', 'design', 'concept', 'style',
    'isolated', 'background', 'seamless', 'loop', 'motion', 'with', 'and', 'for', 'of', 'in', 'on',
  ]);
  const tokens = String(promptTopic || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stopWords.has(w));
  return tokens.slice(0, 3).join('_') || '_default';
}

export interface VariationSeed {
  seedId: string;
  variantIdx: number;
  compMode: number;
  palette: string[];
  motionExpr: string;
  tag: string;
}

export function createUniqueVariationSeed(
  promptTopic: string,
  slotIndex: number = 0,
  forceSalt: number = 0
): VariationSeed {
  __variationSeq = (__variationSeq + 1) % 1000000;
  const bucket = getPromptTopicBucket(promptTopic);
  const bucketSeq = subjectVariantCursor.get(bucket) || 0;
  subjectVariantCursor.set(bucket, bucketSeq + 1);
  if (subjectVariantCursor.size > 400) {
    const oldestKey = subjectVariantCursor.keys().next().value;
    if (oldestKey !== undefined) subjectVariantCursor.delete(oldestKey);
  }

  let topicHash = 0;
  const txt = String(promptTopic || '');
  for (let i = 0; i < txt.length; i++) {
    topicHash = ((topicHash << 5) - topicHash + txt.charCodeAt(i)) | 0;
  }
  const absHash = Math.abs(topicHash);
  const timeMix = Date.now() ^ Math.floor(Math.random() * 1000003) ^ (__variationSeq * 2654435761);
  const absMix = Math.abs(timeMix + topicHash);
  const slot = Math.max(0, Math.floor(slotIndex));
  const salt = Math.max(0, Math.floor(forceSalt));

  // Coprime rotation guarantees every consecutive prompt rotates v=0..5 and cm=0..2 even across unique prompt strings
  const variantIdx = (absHash + __variationSeq * 5 + bucketSeq + slot * 3 + salt) % 6;
  const compMode = ((absHash >> 2) + __variationSeq * 2 + bucketSeq + slot + salt) % 3;
  const paletteIdx = (absMix + bucketSeq * 3 + slot * 5 + salt * 7) % VARIATION_PALETTES.length;
  const motionIdx = (absHash + __variationSeq + bucketSeq + slot * 2 + salt * 3) % VARIATION_MOTIONS.length;
  const tag = `V${variantIdx}C${compMode}-${(absMix % 8999) + 1000}-${__variationSeq}`;

  return {
    seedId: tag,
    variantIdx,
    compMode,
    palette: VARIATION_PALETTES[paletteIdx],
    motionExpr: VARIATION_MOTIONS[motionIdx],
    tag,
  };
}

export function normalizeCanvasCodeFingerprint(codeOrHtml: string): string {
  const src = String(codeOrHtml || '');
  if (!src.trim()) return '';
  let body = src;
  const scriptMatch = src.match(/__bigmaResize\(\);([\s\S]*?)var\s+__bigmaTargetDraw/);
  if (scriptMatch && scriptMatch[1]) {
    body = scriptMatch[1];
  } else {
    const fnStart = src.indexOf('function drawFrame');
    if (fnStart !== -1) {
      body = src.slice(fnStart);
    }
  }
  return body
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '')
    .replace(/['"]#[0-9a-f]{3,8}['"]/gi, "'#C'")
    .replace(/#[0-9a-f]{3,8}/gi, '#C')
    .replace(/['"]rgba?\([^)]*\)['"]/gi, "'#C'")
    .replace(/rgba?\([^)]*\)/gi, '#C')
    .replace(/['"](?:white|black|cyan|gold|orange|indigo|blue|purple|red|pink|yellow|slate|amber|rose|violet|sky|teal|emerald)['"]/gi, "'#C'")
    .replace(/(Math\.(?:sin|cos)\(\s*t\s*\*\s*)[0-9]+(?:\.[0-9]+)?/gi, '$1T')
    .replace(/\s+/g, '')
    .trim();
}

export interface PromptMotionPlan {
  label: string;
  helperName: string;
  anatomyHint: string;
  codeHint: string;
}

export function resolvePromptMotionPlan(
  promptTopic: string,
  type: 'icon' | 'bg' | string,
  _style?: string,
  overrideMode?: string,
  variantIdx: number = 0,
  compMode: number = 0,
  subCategory: string = ''
): PromptMotionPlan {
  const v = Math.abs(Math.floor(variantIdx || 0)) % 6;
  const cm = Math.abs(Math.floor(compMode || 0)) % 3;
  const topic = (promptTopic || '').toLowerCase();
  const sub = (subCategory || '').toLowerCase();

  if (type === 'bg') {
    const bgDirection = ['v', 'd', 'r', 'h'][(v + cm) % 4];
    const motionDrift = [
      'smooth diagonal phase drift + depth parallax waves',
      'continuous horizontal perspective scroll + atmospheric gleam',
      'breathing concentric horizon waves + synchronized kinetic ribbons',
    ][cm];

    if (/\b(retro|synthwave|vaporwave|80s|sunset|horizon|neon\s*grid)\b/.test(topic) || sub.includes('retro')) {
      return {
        label: 'retro synthwave horizon',
        helperName: 'custom_bg',
        anatomyHint: `3 FULL-BLEED LAYERS (0..w,0..h): (1) G.bgBackdrop(w,h,c0,c1,c2,'v'); (2) Segmented striped G.disc horizon sun near (cx,cy*0.72) + dark mountain G.poly ridge; (3) Perspective grid floor (y=cy*0.78..h) with receding perspective lines + phase-scrolled horizontal speed rails across 0..w.`,
        codeHint: `perspective horizon scroll (t*k % 1) + horizontal slice shimmer on sun (${motionDrift})`,
      };
    }
    if (/\b(grid|cyber|scifi|sci-fi|hud|circuit|matrix|telemetry|radar|wireframe|fintech|data|network)\b/.test(topic) || /cyber|fintech|corporate/.test(sub)) {
      return {
        label: 'cyber telemetry architecture',
        helperName: 'custom_bg',
        anatomyHint: `3 FULL-BLEED LAYERS (0..w,0..h): (1) G.bgBackdrop(w,h,c0,c1,c2,'${bgDirection}'); (2) Edge-to-edge architectural G.grid/circuit trace G.pill lines spanning -0.05*w..1.05*w; (3) Off-center sweeping radar G.ring arcs + sliding G.capsule telemetry beams.`,
        codeHint: `continuous circuit/lattice travel + smooth ring arc precession (${motionDrift})`,
      };
    }
    if (/\b(botanical|leaf|leaves|forest|nature|plant|flora|organic|eco|canopy)\b/.test(topic) || sub.includes('botanical')) {
      return {
        label: 'botanical layered canopy',
        helperName: 'custom_bg',
        anatomyHint: `3 FULL-BLEED LAYERS (0..w,0..h): (1) G.bgBackdrop(w,h,c0,c1,c2,'d'); (2) Oversized layered G.leaf silhouettes anchored from bottom/side frame edges (-0.05*w..1.05*w, -0.05*h..1.05*h) swaying softly; (3) Flowing G.wave breeze currents across whole viewport.`,
        codeHint: `gentle wind-sway rotation on perimeter G.leaf stems + smooth breeze wave (${motionDrift})`,
      };
    }
    if (/\b(gold|silk|luxury|champagne|satin|ribbon|marble|royal|premium)\b/.test(topic) || sub.includes('luxury')) {
      return {
        label: 'luxury flowing silk ribbons',
        helperName: 'custom_bg',
        anatomyHint: `3 FULL-BLEED LAYERS (0..w,0..h): (1) G.bgBackdrop(w,h,c0,c1,c2,'${bgDirection}'); (2) 5-7 full-width overlapping multi-amplitude G.wave satin caustics sweeping corner-to-corner (-0.08*w..1.08*w); (3) Slow diagonal metallic gleam bands.`,
        codeHint: `velvety low-frequency sine drape phase + subtle diagonal luster sweep (${motionDrift})`,
      };
    }
    if (/\b(speed|energy|hyper|warp|streak|tunnel|kinetic|dynamic|motion\s*blur|turbo)\b/.test(topic) || sub.includes('speed')) {
      return {
        label: 'dynamic kinetic energy streaks',
        helperName: 'custom_bg',
        anatomyHint: `3 FULL-BLEED LAYERS (0..w,0..h): (1) G.bgBackdrop(w,h,c0,c1,c2,'r'); (2) Full-frame diagonal or radial velocity G.capsule streaks wrapping smoothly from edge to edge (-0.1*w..1.1*w); (3) Expanding concentric pulse G.ring + G.rays sweeps.`,
        codeHint: `continuous velocity warp wrap + pulsing kinetic rays (${motionDrift})`,
      };
    }
    if (/\b(geo|geometric|isometric|prism|mosaic|triangle|hexagon|polygon|bauhaus|abstract)\b/.test(topic) || sub.includes('abstract')) {
      return {
        label: 'full-frame architectural geometric field',
        helperName: 'custom_bg',
        anatomyHint: `3 FULL-BLEED LAYERS (0..w,0..h): (1) G.bgBackdrop(w,h,c0,c1,c2,'${bgDirection}'); (2) Repeating tessellated G.ngon / G.poly / G.capsule architectural ribbons filling -0.06*w..1.06*w & -0.06*h..1.06*h; (3) Coordinated depth-shifted foreground geometric sweeps.`,
        codeHint: `synchronized geometric glide + scale/phase wave across full canvas (${motionDrift})`,
      };
    }
    return {
      label: 'atmospheric multi-layer motion',
      helperName: 'custom_bg',
      anatomyHint: `3 FULL-BLEED LAYERS (0..w,0..h): (1) G.bgBackdrop(w,h,c0,c1,c2,'${bgDirection}'); (2) Custom edge-to-edge thematic geometry matching "${promptTopic.slice(0, 60)}" spanning -0.08*w..1.08*w & -0.08*h..1.08*h with smooth overlapping G.wave/G.poly/G.oval/G.grid depth planes; (3) Continuous corner-to-corner foreground light flow.`,
      codeHint: `bespoke theme-matched seamless 60 FPS motion (${motionDrift})`,
    };
  }

  // ICON: Bespoke Structural Anatomy & Physical Motion Blueprint
  // Anchors child parts directly onto parent seams inside [-0.58*R, +0.58*R] with Painter's Order.
  let primaryKey = 'generic';
  let structuralGuide =
    'LITERAL COMPOUND ANATOMY: Build the exact recognizable physical object named in the prompt from 4-6 tightly joined layers inside [-0.58*R,+0.58*R] using shared seam variables (e.g. topY=y-h/2) so attached parts touch/overlap (>=0.04*R). ZERO loose floating corner blobs, ZERO dark circular backdrop behind non-round icons.';
  let themeMotion = 'upright hoverY=Math.sin(t*2.0)*0.022*R (rot=0), articulating ONLY internal functional parts around fixed joints';

  if (/\b(booth|kiosk|phone\s*booth|telephone\s*booth|cabin|shelter)\b/.test(topic)) {
    primaryKey = 'booth';
    structuralGuide =
      'BOOTH ARCHITECTURE: Wide base plinth G.box at bottom -> tall outer frame G.box seated flush -> crowned with G.dome roof welded on top seam -> inner multi-pane glass G.grid + centered telephone handset G.uArc/G.curveArc inside booth.';
    themeMotion = 'upright rot=0 steady stance; sequential illuminated G.grid pane highlight + subtle ringing handset pulse inside booth';
  } else if (/\b(headset\w*|headphone\w*|call\s*center|earphone\w*)\b/.test(topic)) {
    primaryKey = 'headset';
    structuralGuide =
      'HEADSET ASSEMBLY: Centered padded ear-cups G.capsule on left & right snapped cleanly to ends of arched overhead G.uArc(...,"d") headband -> attached boom mic G.curveArc ending at mic G.disc + centered live G.wave/user badge.';
    themeMotion = 'upright rot=0 hover; live oscillating acoustic G.wave & subtle ear-cup ring pulse';
  } else if (/\b(megaphone\w*|bullhorn\w*|loudspeaker\w*|speaker\w*|audio|volume)\b/.test(topic)) {
    primaryKey = 'audio';
    structuralGuide =
      'SPEAKER / MEGAPHONE: Left driver G.box + flared horn cone G.trap/G.poly welded side-by-side (or megaphone cone + bottom grip G.box) + 2 concentric curved sound G.ring arcs directly in front of horn/cone mouth.';
    themeMotion = 'gentle acoustic recoil bob + outward-pulsing curved G.ring sound arcs';
  } else if (/\b(mic|microphone\w*|podcast\w*|voice\s*record\w*)\b/.test(topic)) {
    primaryKey = 'mic';
    structuralGuide =
      'MICROPHONE RIG: Rounded-top G.capsule grille with horizontal pill slots -> seated inside lower G.uArc(...,"u") cradle + vertical stem G.box welded to flat base G.capsule stand.';
    themeMotion = 'upright rot=0; internal grille meter/wave pulse + subtle side sound G.ring arcs';
  } else if (/\b(umbrella\w*|parasol\w*|rainproof|insur\w*)\b/.test(topic)) {
    primaryKey = 'umbrella';
    structuralGuide =
      'UMBRELLA CANOPY: Wide dome canopy G.dome with scalloped bottom curve + pointed top finial spire G.poly welded on crown -> straight center shaft G.pill extending down to hooked J-handle G.uArc(...,"u") at bottom seam.';
    themeMotion = 'upright rot=0 gentle shelter sway + smooth subtle canopy breathe';
  } else if (/\b(magnet\w*|attract\w*|lead\s*gen\w*)\b/.test(topic)) {
    primaryKey = 'magnet';
    structuralGuide =
      'HORSESHOE MAGNET: Bold thick U-shaped horseshoe body G.uArc(...,"d" or "u", th=0.18*R) -> twin metallic pole tips G.box welded flush onto both open arm ends + small crisp energy G.bolt or pulled G.disc dot anchored right between poles.';
    themeMotion = 'upright subtle magnetic pulse + attracted particle/bolt pull strictly toward pole gap';
  } else if (/\b(gift\w*|present\w*|reward\w*|bonus|prize\s*box)\b/.test(topic)) {
    primaryKey = 'gift';
    structuralGuide =
      'GIFT BOX: Rounded square parcel G.box -> wider overhanging lid G.box overlapping top seam + vertical & horizontal ribbon bands G.box/G.pill -> twin symmetric bow loops G.oval/G.leaf seated cleanly atop lid center.';
    themeMotion = 'upright rot=0 joyful bounce + lid hover gap lifting slightly revealing glowing sparkle inside seam';
  } else if (/\b(coffee|mug|teacup|cup|espresso|cafe)\b/.test(topic)) {
    primaryKey = 'coffee';
    structuralGuide =
      'COFFEE CUP: Tapered cylindrical mug G.trap/G.box with saucer base G.capsule underneath -> C-shaped handle G.uArc(...,"r") overlapping right rim wall >=0.04*R -> 2-3 smooth rising aromatic steam G.wave curls directly above top rim.';
    themeMotion = 'upright steady mug rot=0; continuous rising wavy G.wave steam curls drifting softly upward';
  } else if (/\b(speedometer|gauge|tachometer|performance\s*meter|latency|bandwidth\s*meter)\b/.test(topic)) {
    primaryKey = 'gauge';
    structuralGuide =
      'SPEEDOMETER GAUGE: Half-circle arc track G.ring(0,0.08*R,r,th,Math.PI,0) with colored segments -> bottom plinth G.capsule closing dial floor -> centered pivot G.disc anchoring sweeping triangular needle G.poly.';
    themeMotion = 'upright dial rot=0; smooth needle sweep back-and-forth across arc ticks + active segment highlight';
  } else if (/\b(thermometer\w*|temperature|climate|heat|fever)\b/.test(topic)) {
    primaryKey = 'thermometer';
    structuralGuide =
      'THERMOMETER: Tall vertical pill stem G.capsule overlapping circular lower bulb G.disc cleanly -> rising inner red/gold mercury G.bar & bulb G.disc inside + 4 crisp horizontal tick G.pill marks welded along stem edge.';
    themeMotion = 'upright rot=0; smooth rising/falling inner mercury G.bar level + warm core glow inside bulb';
  } else if (/\b(scissor\w*|shear\w*|trim\w*)\b/.test(topic)) {
    primaryKey = 'scissors';
    structuralGuide =
      'SCISSORS: Two crossing tapered blades G.pill/G.poly intersecting cleanly at central pivot screw G.disc -> twin circular ring handles G.ring welded cleanly to opposite rear ends of shafts.';
    themeMotion = 'smooth articulated snipping open-close scissor angle around exact center pivot G.disc';
  } else if (/\b(crown\w*|king|royal\w*|vip|majest\w*)\b/.test(topic)) {
    primaryKey = 'crown';
    structuralGuide =
      'ROYAL CROWN: Curved base band G.box/G.capsule -> 3 or 5 peaked crown points G.poly overlapping band seamlessly -> luminous jewel G.disc tips mounted atop peaks + center crest jewel G.ngon(4).';
    themeMotion = 'upright rot=0 regal float; sequential jewel crown gleam + twinkling star glint';
  } else if (/\b(paper\s*plane|paper\s*airplane|telegram|dispatch)\b/.test(topic)) {
    primaryKey = 'paper_plane';
    structuralGuide =
      'ORIGAMI PAPER PLANE: Crisp folded asymmetric dual-wing G.poly dart pointing upper-right + darker recessed center crease fold triangle G.poly tucked seamlessly inside fold.';
    themeMotion = 'smooth aerodynamic glide oscillation along diagonal nose axis + crisp trail streak G.curveArc behind tail';
  } else if (/\b(anchor\w*|harbor|marine|maritime|stabil\w*)\b/.test(topic)) {
    primaryKey = 'anchor';
    structuralGuide =
      'NAVAL ANCHOR: Top mooring G.ring -> vertical shank G.pill with horizontal crossbar G.capsule near top -> wide upward-curved lower fluke bow G.uArc(...,"u") welded cleanly with twin triangular arrowhead G.poly tips.';
    themeMotion = 'gentle moored pendulum rock (|rot|<=0.09) around top G.ring pivot';
  } else if (/\b(diamond\w*|gem\w*|crystal\w*|jewel\w*)\b/.test(topic)) {
    primaryKey = 'diamond';
    structuralGuide =
      'FACETED DIAMOND: Wide beveled crown G.trap upper tier welded flush onto pointed lower pavilion G.poly base -> internal geometric facet triangles & crisp specular top highlight.';
    themeMotion = 'upright rot=0 jewel levitation + periodic sparkling cross-star G.star/glint sweep across facets';
  } else if (/\b(qr\s*code|barcode|scanner|scan\s*code)\b/.test(topic)) {
    primaryKey = 'scanner';
    structuralGuide =
      'QR / BARCODE SCANNER: Outer 4 crisp L-corner bracket viewfinder + dense interior G.grid/G.box pattern matrix -> glowing horizontal laser scanline G.capsule sweeping cleanly top-to-bottom across code.';
    themeMotion = 'upright rot=0; continuous smooth vertical laser scanline bar + corner bracket breath';
  } else if (/\b(price\s*tag|tag\w*|label\w*|coupon\w*|ticket\w*|discount\w*)\b/.test(topic)) {
    primaryKey = 'tag';
    structuralGuide =
      'PRICE TAG / TICKET: Angled beveled pentagonal tag G.poly (or notched ticket G.box) with reinforced punch hole G.disc/G.ring + interior horizontal line G.pill & star/percent emblem.';
    themeMotion = 'gentle hanging pendulum swing around hole ring (|rot|<=0.08) + interior shimmer';
  } else if (/\b(target\w*|bullseye|archery|goal|aim|focus)\b/.test(topic)) {
    primaryKey = 'target';
    structuralGuide =
      'BULLSEYE TARGET: 3 concentric alternating target rings G.disc seated around vibrant center dot -> crisp angled arrow G.arrow + fletching tail embedded cleanly right into bullseye center.';
    themeMotion = 'upright subtle concentric ring pulse + gentle arrow settle recoil oscillation into center';
  } else if (/\b(puzzl\w*|jigsaw|plugin|integrat\w*|addon|interlock\w*)\b/.test(topic)) {
    primaryKey = 'puzzle';
    structuralGuide =
      'INTERLOCKING PUZZLE: 2x2 joined crisp rounded puzzle tiles G.box connected tightly by circular tab G.disc connectors spanning block seams so all blocks read as one cohesive interlocking square.';
    themeMotion = 'upright rot=0; synchronized smooth corner tile slide-in lock + seam glow pulse';
  } else if (/\b(robot\w*|droid\w*|chatbot\w*|ai\s*agent|assistant\s*bot)\b/.test(topic)) {
    primaryKey = 'robot';
    structuralGuide =
      'ROBOT HEAD / BOT: Rounded visor chassis G.box + dark inset visor screen G.box with 2 glowing circular eyes G.disc -> left & right ear pods G.capsule welded on flanks + top antenna stem G.pill & glowing tip G.disc.';
    themeMotion = 'upright playful hover; blinking/scanning glowing eyes inside visor + pulsing antenna beacon';
  } else if (/\b(cpu|microchip|processor|chipset|semiconductor|silicon|circuit\s*chip)\b/.test(topic)) {
    primaryKey = 'cpu';
    structuralGuide =
      'MICROCHIP CPU: Crisp central square silicon die G.box + inner gold/cyan core G.grid -> symmetric metallic I/O pin legs G.pill extending evenly from all 4 outer sides (top/bottom/left/right)!';
    themeMotion = 'upright rot=0; sequential electrical signal trace lighting core grid & alternating edge pins';
  } else if (/\b(pie\s*chart|donut\s*chart|market\s*share)\b/.test(topic)) {
    primaryKey = 'pie_chart';
    structuralGuide =
      'PIE / DONUT CHART: Crisp multi-sector circular diagram via G.pie (with distinct vibrant slice angle) + optional centered circular cutout for donut + neatly docked legend bar G.capsule at flank seam.';
    themeMotion = 'upright rot=0; smooth radial slice sweep growth + subtle active wedge pop';
  } else if (/\b(smart\s*home|house|home)\b/.test(topic)) {
    primaryKey = 'home';
    structuralGuide =
      'SMART HOME / HOUSE: Sloped G.poly triangular gable roof overhanging slightly -> solid G.box house walls overlapping roof seam -> centered arched G.dome door or G.grid window -> centered pulsing Wi-Fi G.ring arcs above/inside roof.';
    themeMotion = 'upright rot=0; sequential outward propagation of wireless G.ring signal arcs + warm window pane pulse';
  } else if (/\b(bank|courthouse|temple|office|building|tower|store|shop)\b/.test(topic)) {
    primaryKey = 'building';
    structuralGuide =
      'CLASSIC BUILDING FACADE: Triangular pediment G.poly + cornice G.box -> 3-4 evenly spaced vertical G.box pillars or G.grid lit windows -> wide stepped foundation base G.box anchored cleanly underneath.';
    themeMotion = 'upright rot=0; subtle architectural window G.grid illumination + clean beacon/emblem pulse';
  } else if (/\b(cloud\w*|saas)\b/.test(topic)) {
    primaryKey = 'cloud';
    structuralGuide =
      'UNIFIED CLOUD SILHOUETTE: Single crisp G.cloudShape contour (never jagged disconnected blobs!) -> centered directional G.arrow (upload/download) or interlocking circular sync G.ring arcs seated cleanly inside cloud.';
    themeMotion = 'upright rot=0 soft float; vertical arrow transfer glide or continuous rotating sync arcs inside cloud';
  } else if (/\b(wallet\w*|purse|payment\w*|credit\s*card\w*)\b/.test(topic)) {
    primaryKey = 'wallet';
    structuralGuide =
      'WALLET & PEEKING CARD: Slightly tilted peeking card G.box tucked into top edge of wide rounded leather G.box wallet body -> overlapping right clasp strap G.capsule + metallic snap G.disc.';
    themeMotion = 'upright rot=0; smooth vertical card peek glide + clasp metallic gleam';
  } else if (/\b(browser\w*|webpage\w*|website\w*|internet|tab|window)\b/.test(topic)) {
    primaryKey = 'browser';
    structuralGuide =
      'BROWSER WINDOW: Rounded G.box window -> full-width top header G.box with 3 left window dots G.disc -> structured inner layout (G.globe / content G.bar rows / hero G.box card) strictly inside window bounds.';
    themeMotion = 'upright rot=0; smooth loading G.capsule bar progress + interactive viewport element animation';
  } else if (/\b(monitor\w*|laptop\w*|tablet\w*|smartphone\w*|phone|dashboard\w*)\b/.test(topic)) {
    primaryKey = 'device';
    structuralGuide =
      'DEVICE / UI WORKSPACE: Outer hardware bezel G.box (+ attached stand G.trap or laptop base G.capsule if monitor/laptop) -> dark inset screen G.box -> rising anchored G.bar columns, G.wave trendline, or G.pie strictly inside screen!';
    themeMotion = 'upright rot=0; live bar heights oscillating >=0.14*R + smooth line/pie progress sweep inside screen';
  } else if (/\b(recover\w*|backup\w*|restor\w*)\b/.test(topic)) {
    primaryKey = 'backup';
    structuralGuide =
      'RECOVERY / BACKUP DRIVE: Stacked cylinder/rack storage G.box tiers with glowing LED G.pill bars -> crisp circular restore G.ring arc (>240deg) with arrowhead G.poly wrapping smoothly around corner/side edge.';
    themeMotion = 'upright rot=0; rotating circular restore arrow G.ring + sequential tier LED scan';
  } else if (/\b(disconnect\w*|unplug\w*|cable\w*|plug\w*|broken\s*link|offline)\b/.test(topic)) {
    primaryKey = 'plug';
    structuralGuide =
      'SPLIT PLUG / CONNECTION: Left cable G.curveArc + plug housing G.box with twin G.pill metal prongs facing right -> matching right socket G.box facing left -> centered small gap spark G.bolt or warning badge.';
    themeMotion = 'upright rot=0; synchronized inward-outward horizontal plug reconnect oscillation + center spark G.bolt pulse';
  } else if (/\b(troubleshoot\w*|diagnos\w*|repair\w*|fix\w*|bug\w*|warning\w*|alert\w*|error\w*)\b/.test(topic)) {
    primaryKey = 'alert';
    structuralGuide =
      'DIAGNOSTIC / ALERT PANEL: Clean G.box UI frame with header bar + prominent G.ngon(3) warning triangle or G.gearWheel + wrench/exclamation G.capsule+G.disc centered sharply inside.';
    themeMotion = 'upright rot=0; crisp warning/exclamation pulse or diagnostic gear inspection turn inside frame';
  } else if (/\b(padlock\w*|lock\s*icon|locked|security\s*lock|smart\s*lock)\b/.test(topic)) {
    primaryKey = 'padlock';
    structuralGuide =
      'PADLOCK ASSEMBLY: Top U-shackle G.uArc(...,"d") whose bottom legs penetrate >=0.06*R into thick armored G.box lock body -> centered keyhole G.disc + G.trap slot inside lock face.';
    themeMotion = 'upright rot=0; vertical shackle latch slide (smooth open-close breath) + glowing keyhole core';
  } else if (/\b(encrypt\w*|decrypt\w*|cipher\w*|password\w*|vault\w*|safe)\b/.test(topic)) {
    primaryKey = 'encrypt';
    structuralGuide =
      'ENCRYPTION / CIPHER ARTIFACT: Faceted G.crest or G.box armored frame -> recessed dark inner chamber -> animated G.grid cipher matrix or rotating tumbler G.gearWheel/dial + crisp keyhole/G.check lock core.';
    themeMotion = 'upright rot=0; rotating combination dial / sequential G.grid cipher scan inside frame';
  } else if (/\b(shield\w*|firewall\w*|antivirus|protect\w*|defender\w*|secur\w*)\b/.test(topic)) {
    primaryKey = 'shield';
    structuralGuide =
      'CREST SHIELD: Outer G.crest bevelled armor -> inset dual-tone inner G.crest -> centered verification emblem (G.check, G.cross, or mini lock G.box) layered cleanly on top.';
    themeMotion = 'upright rot=0; crisp verification checkmark/emblem pulse + smooth vertical highlight sweep inside crest';
  } else if (/\b(key|keyring|access\s*key)\b/.test(topic)) {
    primaryKey = 'key';
    structuralGuide =
      'PRECISION KEY: Ornate G.disc/G.ring bow on left with inner hole -> horizontal cylindrical G.capsule shaft extending right -> stepped notch teeth G.box welded flush to bottom edge of shaft.';
    themeMotion = 'smooth gentle key rotation turn (Math.sin(t*1.8)*0.14 rad) around bow + metallic tooth glint';
  } else if (/\b(analytic\w*|chart\w*|graph\w*|kpi|screen|terminal|ui|ux|interface)\b/.test(topic)) {
    primaryKey = 'device';
    structuralGuide =
      'DEVICE / UI WORKSPACE: Outer hardware bezel G.box (+ attached stand G.trap or laptop base G.capsule if monitor/laptop) -> dark inset screen G.box -> rising anchored G.bar columns, G.wave trendline, or G.pie strictly inside screen!';
    themeMotion = 'upright rot=0; live bar heights oscillating >=0.14*R + smooth line/pie progress sweep inside screen';
  } else if (/\b(router\w*|modem\w*|wifi|wireless|hotspot|antenna\w*|network\w*|server\w*|database\w*|rack\w*|sync\w*|upload\w*|download\w*)\b/.test(topic)) {
    primaryKey = 'network';
    structuralGuide =
      'NETWORK / SERVER HARDWARE: Sleek multi-tier G.box chassis/stack with crisp status G.pill LEDs -> vertical G.pill antennas welded to top edge (if wireless/router) + centered radiating G.ring signal arcs.';
    themeMotion = 'upright rot=0; smooth staggered Wi-Fi arc wave / left-to-right G.grid telemetry LED chase';
  } else if (/\b(hourglass\w*|sandglass\w*)\b/.test(topic)) {
    primaryKey = 'hourglass';
    structuralGuide =
      'HOURGLASS FRAME: Top & bottom horizontal G.capsule wooden caps -> upper & lower G.trap glass bulbs meeting cleanly at center waist -> falling sand stream G.pill + rising lower sand triangle G.trap.';
    themeMotion = 'upright rot=0 (or periodic crisp 180 flip); animated falling sand stream + sand level shift';
  } else if (/\b(clock\w*|timer\w*|stopwatch\w*|alarm\s*clock|watch\w*)\b/.test(topic)) {
    primaryKey = 'clock';
    structuralGuide =
      'CLOCK / TIMER FACE: Outer circular G.disc bezel -> high-contrast inner dial G.disc + 12 radial G.rays hour ticks -> center pivot G.disc anchoring rotating hour & minute G.pill hands.';
    themeMotion = 'upright rot=0; continuous smooth clockwise hand rotation from exact dial center (minute 6x faster than hour)';
  } else if (/\b(calendar\w*|schedul\w*|appointment\w*|planner\w*|deadline\w*)\b/.test(topic)) {
    primaryKey = 'calendar';
    structuralGuide =
      'CALENDAR PAGE: Crisp G.box card -> colored top month header G.box -> 2 top binder rings G.capsule straddling top edge -> neat 4x3 date G.grid inside body with animated active day cell + G.check.';
    themeMotion = 'upright rot=0; smooth sequential day-cell focus pulse + checkmark bounce';
  } else if (/\b(troph\w*|award\w*|medal\w*|podium|winner)\b/.test(topic)) {
    primaryKey = 'trophy';
    structuralGuide =
      'TROPHY / AWARD CHALICE: Wide-top G.trap chalice bowl -> twin curved C-handles G.uArc(...,"l"/"r") touching upper bowl flanks -> narrow stem G.box + stepped G.trap/G.box pedestal base + shining G.star on bowl face.';
    themeMotion = 'upright rot=0 proud float; twinkling G.star gleam + subtle shimmer sweep across chalice rim';
  } else if (/\b(wallet\w*|purse|payment\w*|credit\s*card\w*)\b/.test(topic)) {
    primaryKey = 'wallet';
    structuralGuide =
      'WALLET & PEEKING CARD: Slightly tilted peeking card G.box tucked into top edge of wide rounded leather G.box wallet body -> overlapping right clasp strap G.capsule + metallic snap G.disc.';
    themeMotion = 'upright rot=0; smooth vertical card peek glide + clasp metallic gleam';
  } else if (/\b(coin\w*|money|dollar\w*|crypto\w*|revenue|profit|cash|blockchain|cube|dice)\b/.test(topic)) {
    primaryKey = 'coin';
    structuralGuide =
      'COIN / FINANCE STACK OR CUBE: Layered cylindrical coin G.oval discs stacked cleanly from bottom up (overlapping vertically) + bold front circular coin G.disc with inner G.ring rim & G.star/G.bolt emblem (or isometric G.ngon(6) cube with inner 3-face Y edges).';
    themeMotion = 'upright rot=0; staggered gentle stack settle + upward value G.arrow / rim shine';
  } else if (/\b(camera\w*|photo\w*|lens\w*|snapshot\w*)\b/.test(topic)) {
    primaryKey = 'camera';
    structuralGuide =
      'CAMERA OPTICS: Rounded G.box camera body -> beveled viewfinder hump G.trap flush on top + shutter G.capsule button -> large centered multi-ring G.disc lens + corner flash G.disc.';
    themeMotion = 'upright rot=0; smooth aperture ring expansion-contraction + periodic soft flash G.rays glint';
  } else if (/\b(microscope\w*)\b/.test(topic)) {
    primaryKey = 'microscope';
    structuralGuide =
      'LAB MICROSCOPE: Angled optical barrel G.capsule -> curved C-arm G.uArc(...,"r") connecting barrel down to horizontal specimen stage G.box -> tapered heavy base G.trap.';
    themeMotion = 'upright rot=0; fine focus barrel/eyepiece micro-glide + illuminated specimen beam pulse';
  } else if (/\b(flask\w*|beaker\w*|chemistr\w*|potion\w*|test\s*tube\w*)\b/.test(topic)) {
    primaryKey = 'flask';
    structuralGuide =
      'ERLENMEYER LAB FLASK: Conical G.trap lower vessel + cylindrical neck G.box + rounded lip G.capsule at top -> glowing inner liquid trapezoid filling bottom 55% + rising tiny bubbles G.disc strictly inside vessel!';
    themeMotion = 'upright rot=0; gently undulating liquid surface & staggered rising bubbles inside flask';
  } else if (/\b(dna|gene\w*|helix|atom\w*|molecule\w*|physics)\b/.test(topic)) {
    primaryKey = 'science';
    structuralGuide =
      'SCIENCE HELIX / ATOM: If DNA: twin opposing G.wave strands bridged by horizontal G.pill rungs. If Atom: glowing center G.disc nucleus + 3 symmetrically tilted orbital G.oval ellipses with orbiting electron G.disc dots on path.';
    themeMotion = 'smooth phase-shifted helix ripple or synchronized multi-plane electron orbit around center';
  } else if (/\b(stethoscope\w*|heart\w*|ecg|medic\w*|health\w*|clinic\w*|hospital\w*|syring\w*|vaccin\w*|pill\w*)\b/.test(topic)) {
    primaryKey = 'health';
    structuralGuide =
      'CLINICAL / HEALTH EMBLEM: Bold G.heartShape or G.cross/G.crest medical badge (or sleek angled syringe G.capsule + plunger G.pill + needle, or stethoscope G.uArc + tube G.curveArc + chestpiece G.disc) with crisp ECG G.wave pulse trace.';
    themeMotion = 'authentic double-beat lub-dub pulse (1 + 0.06*pow(sin,4)) + scrolling ECG G.wave pulse across emblem';
  } else if (/\b(gear\w*|cog\w*|setting\w*|engin\w*|automat\w*|mech\w*)\b/.test(topic)) {
    primaryKey = 'gear';
    structuralGuide =
      'INTERLOCKING GEARS: Primary larger G.gearWheel(x1,y1,r1,8,rot1,...) + secondary smaller meshed G.gearWheel(x2,y2,r2,6,rot2,...) positioned so outer teeth mesh cleanly without crashing.';
    themeMotion = 'upright rot=0 centers; strictly counter-rotating synchronized gear teeth (omega2 = -omega1 * (8/6))';
  } else if (/\b(magnif\w*|search\w*|inspect\w*|audit\w*|zoom\w*)\b/.test(topic)) {
    primaryKey = 'search';
    structuralGuide =
      'MAGNIFIER GLASS: Document/chart G.box subtly behind (optional) + thick circular lens G.ring bezel with bright glass G.disc + solid diagonal handle G.pill connected flush at 45deg rim edge (ZERO gap!).';
    themeMotion = 'smooth elliptical scanning sweep over target center with crisp inner highlight reflection';
  } else if (/\b(lightbulb\w*|idea\w*|lamp\w*|innovat\w*|creativ\w*)\b/.test(topic)) {
    primaryKey = 'bulb';
    structuralGuide =
      'IDEA LIGHTBULB: Bright circular G.disc upper glass + tapered collar G.trap leading seamlessly into horizontal screw threads G.capsule -> internal filament G.curveArc/G.bolt + 6-8 clean outward G.rays.';
    themeMotion = 'upright rot=0; warm filament brightness pulse + radially breathing G.rays burst';
  } else if (/\b(batter\w*|charg\w*|power\w*|energ\w*|lightning|bolt|solar|sun\w*)\b/.test(topic)) {
    primaryKey = 'energy';
    structuralGuide =
      'POWER BATTERY / ENERGY: Tall vertical G.box shell + small top positive terminal G.box anchored flush -> stacked segmented charge G.box bars bottom-to-top -> crisp centered G.bolt overlay (or radiating G.disc+G.rays sun).';
    themeMotion = 'upright rot=0; sequential bottom-up charge bar illumination + crisp energy bolt/rays pulse';
  } else if (/\b(rocket\w*|launch\w*|spacecraft\w*)\b/.test(topic)) {
    primaryKey = 'rocket';
    structuralGuide =
      'SPACE ROCKET: Pointed fuselage (G.dome nose + tapered G.trap/G.box body) + symmetric left & right swept triangular fins G.poly welded to lower flanks + circular porthole G.disc + flickering G.dropShape flame under nozzle.';
    themeMotion = 'smooth vertical thrust float + energetic exhaust flame length pulse (rot stays aligned along flight axis)';
  } else if (/\b(drone\w*|quadcopter\w*|uav)\b/.test(topic)) {
    primaryKey = 'drone';
    structuralGuide =
      'QUADCOPTER DRONE: Sleek center pod G.box with front camera G.disc -> left & right landing skids + angled arm struts G.pill -> horizontal spinning rotor blades G.oval centered directly atop arm tips.';
    themeMotion = 'smooth aerodynamic hover + high-speed horizontal rotor blur width oscillation';
  } else if (/\b(truck\w*|deliver\w*|shipp\w*|van|cargo)\b/.test(topic)) {
    primaryKey = 'truck';
    structuralGuide =
      'DELIVERY TRUCK: Large rectangular cargo box G.box + front angled cab G.trap snapped flush side-by-side + horizontal chassis bar -> 2 circular wheels G.disc seated cleanly at chassis bottom line.';
    themeMotion = 'smooth road suspension bounce (y only) + spinning spoke dots inside grounded wheels';
  } else if (/\b(cart\w*|basket\w*|trolley\w*|shopp\w*)\b/.test(topic)) {
    primaryKey = 'cart';
    structuralGuide =
      'SHOPPING CART: Angled push handle G.pill entering upper-left rim of wide-top G.trap basket frame + horizontal basket slots -> bottom axle + 2 wheels G.disc touching axle underneath.';
    themeMotion = 'gentle forward roll glide + spinning wheel hubs + cargo item bounce inside basket';
  } else if (/\b(compass\w*|gps|map\s*pin|locat\w*|navigat\w*|pin)\b/.test(topic)) {
    primaryKey = 'pin';
    structuralGuide =
      'COMPASS / MAP PIN: Inverted teardrop G.dropShape(rot=Math.PI) pin with crisp center G.disc hole over flat map base G.trap, OR circular G.disc compass bezel with rotating 2-tone diamond needle G.poly.';
    themeMotion = 'if pin: crisp vertical drop-bounce onto map deck; if compass: smooth magnetic needle seek-oscillation';
  } else if (/\b(globe\w*|world|earth|global|planet\w*)\b/.test(topic)) {
    primaryKey = 'globe';
    structuralGuide =
      'WIREFRAME GLOBE: Spherical G.disc + elliptical longitude meridian G.oval + horizontal latitude G.pill chords clipped visually inside sphere circumference (+ orbiting satellite dot or ring if orbital).';
    themeMotion = 'upright rot=0; smooth meridian rx expansion sweep simulating 3D sphere rotation';
  } else if (/\b(envelop\w*|email\w*|mail\w*|inbox\w*|newsletter\w*)\b/.test(topic)) {
    primaryKey = 'mail';
    structuralGuide =
      'ENVELOPE MAIL: Wide G.box envelope body -> crisp V-shaped top flap G.poly touching exact upper-left/right corners + subtle letter card G.box peeking out top edge + centered badge.';
    themeMotion = 'upright rot=0; smooth flap open-peek animation lifting inner message card slightly';
  } else if (/\b(chat\w*|comment\w*|messag\w*|convers\w*|dialog\w*|bubbl\w*)\b/.test(topic)) {
    primaryKey = 'chat';
    structuralGuide =
      'SPEECH BUBBLES: Rounded primary G.box bubble + seamless corner pointer tail G.poly welded to bottom edge + 3 staggered typing dots G.disc inside (plus secondary overlapping bubble behind if dialogue).';
    themeMotion = 'upright rot=0; wave-bouncing 3 typing dots (phase staggered 0, 0.7, 1.4 rad) inside bubble';
  } else if (/\b(bell\w*|notific\w*|ringing|chime\w*|alarm\w*)\b/.test(topic)) {
    primaryKey = 'bell';
    structuralGuide =
      'NOTIFICATION BELL: Top ring loop G.disc -> flared G.dome bell body + wide lower flared G.capsule rim -> circular clapper G.disc tucked just below rim edge + symmetrical ringing arcs outside.';
    themeMotion = 'pendulum swing around top loop pivot (rot=Math.sin(t*5)*0.11) + synchronized opposing clapper sway & sound arcs';
  } else if (/\b(grad\w*|graduation|mortarboard|diploma)\b/.test(topic)) {
    primaryKey = 'grad';
    structuralGuide =
      'GRADUATION CAP: Diamond mortarboard top G.poly overlapping trapezoidal under-cap G.trap cleanly -> hanging cord G.pill + tassel G.dropShape anchored at top center corner.';
    themeMotion = 'upright hover + gentle tassel pendulum swing from top corner anchor';
  } else if (/\b(book\w*|librar\w*|notebook\w*|study|manual\w*|bookmark\w*)\b/.test(topic)) {
    primaryKey = 'book';
    structuralGuide =
      'OPEN / STACKED BOOK: Symmetric left & right angled page G.poly panels joined along solid central spine G.box + bookmark ribbon G.trap draping neatly + printed G.pill lines on pages.';
    themeMotion = 'upright rot=0; subtle breathing page lift + gliding bookmark ribbon / reading line highlight';
  } else if (/\b(briefcase\w*|portfolio\w*|suitcase\w*)\b/.test(topic)) {
    primaryKey = 'briefcase';
    structuralGuide =
      'BRIEFCASE PORTFOLIO: Wide rounded G.box case -> top U-handle G.uArc(...,"d") anchored firmly into top seam -> overlapping upper flap G.box with centered metallic clasp G.box.';
    themeMotion = 'upright rot=0 carry bob + subtle clasp glint';
  } else if (/\b(folder\w*|director\w*|archiv\w*)\b/.test(topic)) {
    primaryKey = 'folder';
    structuralGuide =
      'DOCUMENT FOLDER: Back G.box folder plate with protruding top-left index tab G.box -> peeking white file edge G.box -> tilted/slotted front pocket G.trap.';
    themeMotion = 'upright rot=0; subtle front pocket open-close tilt revealing peeking file card';
  } else if (/\b(trash|recycle|bin|delete\w*)\b/.test(topic)) {
    primaryKey = 'trash';
    structuralGuide =
      'TRASH / RECYCLE BIN: Tapered G.trap bin container with 3 neat vertical G.pill flute ribs -> overhanging top lid G.box + centered handle loop G.uArc(...,"d") welded on lid crown.';
    themeMotion = 'upright rot=0; smooth lid lift-tilt hinge on left corner seam revealing interior rim';
  } else if (/\b(flag\w*|milestone\w*|finish\s*line)\b/.test(topic)) {
    primaryKey = 'flag';
    structuralGuide =
      'MILESTONE FLAG: Upright vertical mast pole G.pill anchored in stepped base G.capsule -> undulating waving pennant banner G.poly attached cleanly flush along upper left mast edge.';
    themeMotion = 'upright sturdy pole rot=0; continuous smooth wind-ripple wave across flag tail points';
  } else if (/\b(id\s*card|profile\w*|avatar\w*|user\w*|member\w*|team\w*|person)\b/.test(topic)) {
    primaryKey = 'user';
    structuralGuide =
      'USER PROFILE / ID BADGE: Rounded outer frame G.box/G.disc -> centered G.person silhouette cleanly framed inside + crisp horizontal bio bars G.pill aligned beside/below avatar.';
    themeMotion = 'upright rot=0; subtle breathing profile ring highlight + smooth bio bar progress scan';
  } else if (/\b(document\w*|checklist\w*|form\w*|clipboard\w*|contract\w*|report\w*|file\w*)\b/.test(topic)) {
    primaryKey = 'document';
    structuralGuide =
      'DOCUMENT / CHECKLIST SHEET: Crisp vertical G.box page + colored header bar or top clip G.capsule -> 3 aligned rows of small G.check/G.disc bullets + horizontal text G.pill bars strictly inside page.';
    themeMotion = 'upright rot=0; sequential row highlight / animated line draw & checkmark pop';
  } else if (/\b(gamepad\w*|joystick\w*|controller\w*|gaming|vr)\b/.test(topic)) {
    primaryKey = 'gamepad';
    structuralGuide =
      'GAMEPAD CONTROLLER: Ergonomic wide bridge G.capsule + angled left/right grip G.capsule handles welded cleanly -> left G.cross D-pad + right 4-dot action G.disc cluster.';
    themeMotion = 'gentle playful tilt (|rot|<=0.06) + alternating action button highlight pulse';
  } else if (/\b(palett\w*|paint\w*|brush\w*|design\w*|art|draw\w*)\b/.test(topic)) {
    primaryKey = 'palette';
    structuralGuide =
      'ARTIST PALETTE & BRUSH: Angled oval/bean G.oval palette with thumb hole G.disc + 4 vivid paint G.disc dollops arranged around upper curve + angled brush G.pill+G.dropShape.';
    themeMotion = 'gentle brush dab oscillation + sequential vivid paint swatch pop';
  } else if (/\b(leaf|leaves|eco|green\s*tech|sustain\w*|plant|sprout|nature)\b/.test(topic)) {
    primaryKey = 'leaf';
    structuralGuide =
      'ECO LEAF / SPROUT: Twin balanced G.leaf blades springing cleanly from shared Y-forked central stem G.pill anchored in rounded soil/badge base.';
    themeMotion = 'gentle organic breeze sway (|rot|<=0.08) + subtle fresh vein shimmer';
  } else if (/\b(fire|flame\w*|hot|burn\w*|trend\w*)\b/.test(topic)) {
    primaryKey = 'flame';
    structuralGuide =
      'FLAME ICON: Outer vivid G.dropShape teardrop silhouette + inset brighter inner core G.dropShape aligned symmetrically along bottom base curve.';
    themeMotion = 'smooth rhythmic vertical flame stretch-flicker around bottom anchor without leaving base';
  } else if (/\b(water|droplet\w*|liquid|aqua|hydrat\w*)\b/.test(topic)) {
    primaryKey = 'drop';
    structuralGuide =
      'WATER DROPLET: Sleek smooth G.dropShape body + subtle curved inner crescent specular accent G.curveArc tucked cleanly inside left curve.';
    themeMotion = 'upright buoyant bob + gentle inner wave meniscus ripple';
  }

  // Compound Multi-Subject Overlay: ensure prompts pairing 2 concepts (e.g. "Smart home network security") render BOTH welded cleanly together
  let secondaryOverlay = '';
  if (primaryKey !== 'shield' && /\b(shield\w*|protect\w*|defender\w*|firewall\w*|guard\w*|secur\w*)\b/.test(topic)) {
    secondaryOverlay = ' + COMPOUND BADGE: weld mini shield G.crest(0.32*R,0.28*R,0.28*R,0.32*R,c2,rim,lw) overlapping bottom-right corner seam cleanly';
  } else if (primaryKey !== 'padlock' && primaryKey !== 'encrypt' && /\b(padlock|lock\w*|encrypt\w*|cipher\w*|privat\w*)\b/.test(topic)) {
    secondaryOverlay = ' + COMPOUND BADGE: weld mini padlock (G.uArc + G.box) cleanly onto bottom-right rim at (0.30*R,0.26*R)';
  } else if (primaryKey !== 'network' && primaryKey !== 'home' && primaryKey !== 'headset' && /\b(wifi|wireless|network\w*|signal|hotspot|5g)\b/.test(topic)) {
    secondaryOverlay = ' + COMPOUND SIGNAL: attach 2 radiating Wi-Fi G.ring arcs neatly anchored right above/beside top-right rim seam';
  } else if (primaryKey !== 'alert' && /\b(error\w*|warning\w*|alert\w*|bug\w*|troubleshoot\w*)\b/.test(topic)) {
    secondaryOverlay = ' + COMPOUND ALERT: weld crisp G.ngon(3) warning badge with inner ! dot at bottom-right (0.30*R,0.26*R)';
  } else if (primaryKey !== 'device' && primaryKey !== 'pie_chart' && primaryKey !== 'coin' && /\b(analytic\w*|chart\w*|graph\w*|growth|metrics|stats)\b/.test(topic)) {
    secondaryOverlay = ' + COMPOUND ANALYTICS: embed crisp 3-bar G.bar sequence or upward G.arrow inside/overlapping front panel';
  } else if (primaryKey !== 'energy' && /\b(fast|speed|turbo|bolt|lightning|power|charg\w*)\b/.test(topic)) {
    secondaryOverlay = ' + COMPOUND ENERGY: mount crisp G.bolt accent joined cleanly across center/upper-right edge';
  } else if (primaryKey !== 'gear' && primaryKey !== 'alert' && /\b(gear\w*|setting\w*|config\w*|automat\w*)\b/.test(topic)) {
    secondaryOverlay = ' + COMPOUND GEAR: mesh crisp rotating G.gearWheel tucked partially behind top-right corner seam';
  } else if (primaryKey !== 'document' && primaryKey !== 'calendar' && primaryKey !== 'shield' && /\b(check\w*|verif\w*|approv\w*|success)\b/.test(topic)) {
    secondaryOverlay = ' + COMPOUND CHECK: weld circular G.disc + crisp G.check badge overlapping lower-right corner seam';
  }

  const twistHints = [
    'Clean crisp flat-3D vector with uniform rim lw=Math.max(2.2,0.034*R)',
    'Subtle recessed darker c0 depth plate behind main body + bright c2/c3 front focal accents',
    'Crisp layered symmetry with solid opaque light-vs-shadow step shading (NO translucent haze)',
  ];

  const overrideMap: Record<string, string> = {
    bounce: 'upright elastic hover bobY=-Math.abs(Math.sin(t*2.4))*0.04*R with coordinated internal motion',
    orbital: 'smooth float hoverY=Math.sin(t*2.0)*0.025*R + subtle internal orbit motion',
    morph: 'fluid breathing scale 1+0.02*Math.sin(t*2.2) with synchronized interior motion',
    cyber: 'crisp digital telemetry pulse + kinetic LED/scanline sweep inside object',
    mechanical: 'precision articulated sub-part rotation/sliding anchored to fixed joints',
    flow: 'silky harmonic 60 FPS float + coordinated internal element animation',
  };

  return {
    label: `bespoke ${primaryKey}`,
    helperName: 'custom',
    anatomyHint: `${structuralGuide}${secondaryOverlay} ${twistHints[cm]}.`,
    codeHint: (overrideMode && overrideMap[overrideMode]) ? overrideMap[overrideMode] : themeMotion,
  };
}

