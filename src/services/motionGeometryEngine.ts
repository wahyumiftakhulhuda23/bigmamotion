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
  let structuralGuide =
    'LITERAL COMPOUND ANATOMY: Build the exact recognizable object from 4-7 tightly joined layers inside [-0.58*R,+0.58*R] using shared edge variables (e.g. topY=y-h/2) so sub-parts touch/overlap cleanly (>=0.04*R). ZERO loose floating corner blobs, ZERO dark circular backdrop behind non-round icons.';
  let themeMotion = 'upright hoverY=Math.sin(t*2.0)*0.022*R (rot=0), articulating ONLY internal mechanism parts around fixed joints';

  if (/\b(booth|kiosk|phone\s*booth|telephone\s*booth|cabin|shelter)\b/.test(topic)) {
    structuralGuide =
      'BOOTH ARCHITECTURE: Wide base plinth G.box at bottom -> tall outer frame G.box seated flush -> crowned with G.dome roof welded on top seam -> inner multi-pane glass G.grid + centered telephone handset G.uArc/G.curveArc inside booth.';
    themeMotion = 'upright rot=0 steady stance; sequential illuminated G.grid pane highlight + subtle ringing handset pulse inside booth';
  } else if (/\b(headset\w*|headphone\w*|call\s*center|earphone\w*)\b/.test(topic)) {
    structuralGuide =
      'HEADSET ASSEMBLY: Centered padded ear-cups G.capsule on left & right snapped cleanly to ends of arched overhead G.uArc(...,"d") headband -> attached boom mic G.curveArc ending at mic G.disc + centered live G.wave/user badge.';
    themeMotion = 'upright rot=0 hover; live oscillating acoustic G.wave & subtle ear-cup ring pulse';
  } else if (/\b(megaphone\w*|bullhorn\w*)\b/.test(topic)) {
    structuralGuide =
      'MEGAPHONE CONE: Flared G.trap cone rotated horizontally (or 4-pt horn G.poly) with rear grip handle G.box welded underneath + 2 concentric curved sound G.ring arcs directly in front of horn mouth.';
    themeMotion = 'gentle horn recoil bob + outward-pulsing acoustic G.ring arcs from mouth';
  } else if (/\b(mic|microphone\w*|podcast\w*|voice\s*record\w*)\b/.test(topic)) {
    structuralGuide =
      'MICROPHONE RIG: Rounded-top G.capsule grille with horizontal pill slots -> seated inside lower G.uArc(...,"u") cradle + vertical stem G.box welded to flat base G.capsule stand.';
    themeMotion = 'upright rot=0; internal grille meter/wave pulse + subtle side sound G.ring arcs';
  } else if (/\b(recover\w*|backup\w*|restor\w*)\b/.test(topic)) {
    structuralGuide =
      'RECOVERY / BACKUP DRIVE: Stacked cylinder/rack storage G.box tiers with glowing LED G.pill bars -> crisp circular restore G.ring arc (>240deg) with arrowhead G.poly wrapping smoothly around corner/side edge.';
    themeMotion = 'upright rot=0; rotating circular restore arrow G.ring + sequential tier LED scan';
  } else if (/\b(padlock\w*|lock\s*icon|locked|security\s*lock|smart\s*lock)\b/.test(topic)) {
    structuralGuide =
      'PADLOCK ASSEMBLY: Top U-shackle G.uArc(...,"d") whose bottom legs penetrate >=0.06*R into thick armored G.box lock body -> centered keyhole G.disc + G.trap slot inside lock face.';
    themeMotion = 'upright rot=0; vertical shackle latch slide (smooth open-close breath) + glowing keyhole core';
  } else if (/\b(encrypt\w*|decrypt\w*|cipher\w*|password\w*|vault\w*|safe)\b/.test(topic)) {
    structuralGuide =
      'ENCRYPTION / CIPHER ARTIFACT: Faceted G.crest or G.box armored frame -> recessed dark inner chamber -> animated G.grid cipher matrix or rotating tumbler G.gearWheel/dial + crisp keyhole/G.check lock core.';
    themeMotion = 'upright rot=0; rotating combination dial / sequential G.grid cipher scan inside frame';
  } else if (/\b(shield\w*|firewall\w*|antivirus|protect\w*|defender\w*|secur\w*)\b/.test(topic)) {
    structuralGuide =
      'CREST SHIELD: Outer G.crest bevelled armor -> inset dual-tone inner G.crest -> centered verification emblem (G.check, G.cross, or mini lock G.box) layered cleanly on top.';
    themeMotion = 'upright rot=0; crisp verification checkmark/emblem pulse + smooth vertical highlight sweep inside crest';
  } else if (/\b(key|keyring|access\s*key)\b/.test(topic)) {
    structuralGuide =
      'PRECISION KEY: Ornate G.disc/G.ring bow on left with inner hole -> horizontal cylindrical G.capsule shaft extending right -> stepped notch teeth G.box welded flush to bottom edge of shaft.';
    themeMotion = 'smooth gentle key rotation turn (Math.sin(t*1.8)*0.14 rad) around bow + metallic tooth glint';
  } else if (/\b(disconnect\w*|unplug\w*|cable\w*|plug\w*|broken\s*link|offline)\b/.test(topic)) {
    structuralGuide =
      'SPLIT PLUG / CONNECTION: Left cable G.curveArc + plug housing G.box with twin G.pill metal prongs facing right -> matching right socket G.box facing left -> centered small gap spark G.bolt or warning badge.';
    themeMotion = 'upright rot=0; synchronized inward-outward horizontal plug reconnect oscillation + center spark G.bolt pulse';
  } else if (/\b(troubleshoot\w*|diagnos\w*|repair\w*|fix\w*|bug\w*|warning\w*|alert\w*|error\w*)\b/.test(topic)) {
    structuralGuide =
      'DIAGNOSTIC / ALERT PANEL: Clean G.box UI frame with header bar + prominent G.ngon(3) warning triangle or G.gearWheel + wrench/exclamation G.capsule+G.disc centered sharply inside.';
    themeMotion = 'upright rot=0; crisp warning/exclamation pulse or diagnostic gear inspection turn inside frame';
  } else if (/\b(browser\w*|webpage\w*|website\w*|internet|tab|window)\b/.test(topic)) {
    structuralGuide =
      'BROWSER WINDOW: Rounded G.box window -> full-width top header G.box with 3 left window dots G.disc -> structured inner layout (G.globe / content G.bar rows / hero G.box card) strictly inside window bounds.';
    themeMotion = 'upright rot=0; smooth loading G.capsule bar progress + interactive viewport element animation';
  } else if (/\b(dashboard\w*|analytic\w*|chart\w*|graph\w*|kpi|monitor\w*|laptop\w*|tablet\w*|smartphone\w*|phone|screen|terminal|ui|ux|interface)\b/.test(topic)) {
    structuralGuide =
      'DEVICE / UI WORKSPACE: Outer hardware bezel G.box (+ attached stand G.trap or laptop base G.capsule if monitor/laptop) -> dark inset screen G.box -> rising anchored G.bar columns, G.wave trendline, or G.pie strictly inside screen!';
    themeMotion = 'upright rot=0; live bar heights oscillating >=0.14*R + smooth line/pie progress sweep inside screen';
  } else if (/\b(smart\s*home|house|home)\b/.test(topic)) {
    structuralGuide =
      'SMART HOME / HOUSE: Sloped G.poly triangular gable roof overhanging slightly -> solid G.box house walls overlapping roof seam -> centered arched G.dome door or G.grid window -> centered pulsing Wi-Fi G.ring arcs above/inside roof.';
    themeMotion = 'upright rot=0; sequential outward propagation of wireless G.ring signal arcs + warm window pane pulse';
  } else if (/\b(bank|courthouse|temple|office|building|tower|store|shop)\b/.test(topic)) {
    structuralGuide =
      'CLASSIC BUILDING FACADE: Triangular pediment G.poly + cornice G.box -> 3-4 evenly spaced vertical G.box pillars or G.grid lit windows -> wide stepped foundation base G.box anchored cleanly underneath.';
    themeMotion = 'upright rot=0; subtle architectural window G.grid illumination + clean beacon/emblem pulse';
  } else if (/\b(router\w*|modem\w*|wifi|wireless|hotspot|antenna\w*|network\w*|server\w*|database\w*|rack\w*)\b/.test(topic)) {
    structuralGuide =
      'NETWORK / SERVER HARDWARE: Sleek multi-tier G.box chassis/stack with crisp status G.pill LEDs -> vertical G.pill antennas welded to top edge (if wireless/router) + centered radiating G.ring signal arcs.';
    themeMotion = 'upright rot=0; smooth staggered Wi-Fi arc wave / left-to-right G.grid telemetry LED chase';
  } else if (/\b(cloud\w*|sync\w*|upload\w*|download\w*|saas)\b/.test(topic)) {
    structuralGuide =
      'UNIFIED CLOUD SILHOUETTE: Single crisp G.cloudShape contour (never jagged disconnected blobs!) -> centered directional G.arrow (upload/download) or interlocking circular sync G.ring arcs seated cleanly inside cloud.';
    themeMotion = 'upright rot=0 soft float; vertical arrow transfer glide or continuous rotating sync arcs inside cloud';
  } else if (/\b(hourglass\w*|sandglass\w*)\b/.test(topic)) {
    structuralGuide =
      'HOURGLASS FRAME: Top & bottom horizontal G.capsule wooden caps -> upper & lower G.trap glass bulbs meeting cleanly at center waist -> falling sand stream G.pill + rising lower sand triangle G.trap.';
    themeMotion = 'upright rot=0 (or periodic crisp 180 flip); animated falling sand stream + sand level shift';
  } else if (/\b(clock\w*|timer\w*|stopwatch\w*|alarm\s*clock|watch\w*)\b/.test(topic)) {
    structuralGuide =
      'CLOCK / TIMER FACE: Outer circular G.disc bezel -> high-contrast inner dial G.disc + 12 radial G.rays hour ticks -> center pivot G.disc anchoring rotating hour & minute G.pill hands.';
    themeMotion = 'upright rot=0; continuous smooth clockwise hand rotation from exact dial center (minute 6x faster than hour)';
  } else if (/\b(calendar\w*|schedul\w*|appointment\w*|planner\w*|deadline\w*)\b/.test(topic)) {
    structuralGuide =
      'CALENDAR PAGE: Crisp G.box card -> colored top month header G.box -> 2 top binder rings G.capsule straddling top edge -> neat 4x3 date G.grid inside body with animated active day cell + G.check.';
    themeMotion = 'upright rot=0; smooth sequential day-cell focus pulse + checkmark bounce';
  } else if (/\b(troph\w*|award\w*|cup|medal\w*|podium|winner)\b/.test(topic)) {
    structuralGuide =
      'TROPHY / AWARD CHALICE: Wide-top G.trap chalice bowl -> twin curved C-handles G.uArc(...,"l"/"r") touching upper bowl flanks -> narrow stem G.box + stepped G.trap/G.box pedestal base + shining G.star on bowl face.';
    themeMotion = 'upright rot=0 proud float; twinkling G.star gleam + subtle shimmer sweep across chalice rim';
  } else if (/\b(wallet\w*|purse|payment\w*|credit\s*card\w*)\b/.test(topic)) {
    structuralGuide =
      'WALLET & PEEKING CARD: Slightly tilted peeking card G.box tucked into top edge of wide rounded leather G.box wallet body -> overlapping right clasp strap G.capsule + metallic snap G.disc.';
    themeMotion = 'upright rot=0; smooth vertical card peek glide + clasp metallic gleam';
  } else if (/\b(coin\w*|money|dollar\w*|crypto\w*|revenue|profit|cash)\b/.test(topic)) {
    structuralGuide =
      'COIN / FINANCE STACK: Layered cylindrical coin G.oval discs stacked cleanly from bottom up (overlapping vertically) + bold front circular coin G.disc with inner G.ring rim & G.star/G.bolt emblem or upward G.arrow.';
    themeMotion = 'upright rot=0; staggered gentle stack settle + upward value G.arrow / rim shine';
  } else if (/\b(camera\w*|photo\w*|lens\w*|snapshot\w*)\b/.test(topic)) {
    structuralGuide =
      'CAMERA OPTICS: Rounded G.box camera body -> beveled viewfinder hump G.trap flush on top + shutter G.capsule button -> large centered multi-ring G.disc lens + corner flash G.disc.';
    themeMotion = 'upright rot=0; smooth aperture ring expansion-contraction + periodic soft flash G.rays glint';
  } else if (/\b(microscope\w*)\b/.test(topic)) {
    structuralGuide =
      'LAB MICROSCOPE: Angled optical barrel G.capsule -> curved C-arm G.uArc(...,"r") connecting barrel down to horizontal specimen stage G.box -> tapered heavy base G.trap.';
    themeMotion = 'upright rot=0; fine focus barrel/eyepiece micro-glide + illuminated specimen beam pulse';
  } else if (/\b(flask\w*|beaker\w*|chemistr\w*|potion\w*|test\s*tube\w*)\b/.test(topic)) {
    structuralGuide =
      'ERLENMEYER LAB FLASK: Conical G.trap lower vessel + cylindrical neck G.box + rounded lip G.capsule at top -> glowing inner liquid trapezoid filling bottom 55% + rising tiny bubbles G.disc strictly inside vessel!';
    themeMotion = 'upright rot=0; gently undulating liquid surface & staggered rising bubbles inside flask';
  } else if (/\b(dna|gene\w*|helix|atom\w*|molecule\w*|physics)\b/.test(topic)) {
    structuralGuide =
      'SCIENCE HELIX / ATOM: If DNA: twin opposing G.wave strands bridged by horizontal G.pill rungs. If Atom: glowing center G.disc nucleus + 3 symmetrically tilted orbital G.oval ellipses with orbiting electron G.disc dots on path.';
    themeMotion = 'smooth phase-shifted helix ripple or synchronized multi-plane electron orbit around center';
  } else if (/\b(heart\w*|ecg|medic\w*|health\w*|clinic\w*|hospital\w*|syring\w*|vaccin\w*|pill\w*)\b/.test(topic)) {
    structuralGuide =
      'CLINICAL / HEALTH EMBLEM: Bold G.heartShape or G.cross/G.crest medical badge (or sleek angled syringe G.capsule + plunger G.pill + needle) with high-contrast internal ECG G.wave monitor trace.';
    themeMotion = 'authentic double-beat lub-dub pulse (1 + 0.06*pow(sin,4)) + scrolling ECG G.wave pulse across emblem';
  } else if (/\b(gear\w*|cog\w*|setting\w*|engin\w*|automat\w*|mech\w*)\b/.test(topic)) {
    structuralGuide =
      'INTERLOCKING GEARS: Primary larger G.gearWheel(x1,y1,r1,8,rot1,...) + secondary smaller meshed G.gearWheel(x2,y2,r2,6,rot2,...) positioned so outer teeth mesh cleanly without crashing.';
    themeMotion = 'upright rot=0 centers; strictly counter-rotating synchronized gear teeth (omega2 = -omega1 * (8/6))';
  } else if (/\b(magnif\w*|search\w*|inspect\w*|audit\w*|zoom\w*)\b/.test(topic)) {
    structuralGuide =
      'MAGNIFIER GLASS: Document/chart G.box subtly behind (optional) + thick circular lens G.ring bezel with bright glass G.disc + solid diagonal handle G.pill connected flush at 45deg rim edge (ZERO gap!).';
    themeMotion = 'smooth elliptical scanning sweep over target center with crisp inner highlight reflection';
  } else if (/\b(lightbulb\w*|idea\w*|lamp\w*|innovat\w*|creativ\w*)\b/.test(topic)) {
    structuralGuide =
      'IDEA LIGHTBULB: Bright circular G.disc upper glass + tapered collar G.trap leading seamlessly into horizontal screw threads G.capsule -> internal filament G.curveArc/G.bolt + 6-8 clean outward G.rays.';
    themeMotion = 'upright rot=0; warm filament brightness pulse + radially breathing G.rays burst';
  } else if (/\b(batter\w*|charg\w*|power\w*|energ\w*|lightning|bolt)\b/.test(topic)) {
    structuralGuide =
      'POWER BATTERY CELL: Tall vertical G.box shell + small top positive terminal G.box anchored flush -> stacked segmented charge G.box bars bottom-to-top -> crisp centered G.bolt overlay.';
    themeMotion = 'upright rot=0; sequential bottom-up charge bar illumination + crisp energy bolt pulse';
  } else if (/\b(rocket\w*|launch\w*|spacecraft\w*)\b/.test(topic)) {
    structuralGuide =
      'SPACE ROCKET: Pointed fuselage (G.dome nose + tapered G.trap/G.box body) + symmetric left & right swept triangular fins G.poly welded to lower flanks + circular porthole G.disc + flickering G.dropShape flame under nozzle.';
    themeMotion = 'smooth vertical thrust float + energetic exhaust flame length pulse (rot stays aligned along flight axis)';
  } else if (/\b(drone\w*|quadcopter\w*|uav)\b/.test(topic)) {
    structuralGuide =
      'QUADCOPTER DRONE: Sleek center pod G.box with front camera G.disc -> left & right landing skids + angled arm struts G.pill -> horizontal spinning rotor blades G.oval centered directly atop arm tips.';
    themeMotion = 'smooth aerodynamic hover + high-speed horizontal rotor blur width oscillation';
  } else if (/\b(truck\w*|deliver\w*|shipp\w*|van|cargo)\b/.test(topic)) {
    structuralGuide =
      'DELIVERY TRUCK: Large rectangular cargo box G.box + front angled cab G.trap snapped flush side-by-side + horizontal chassis bar -> 2 circular wheels G.disc seated cleanly at chassis bottom line.';
    themeMotion = 'smooth road suspension bounce (y only) + spinning spoke dots inside grounded wheels';
  } else if (/\b(cart\w*|basket\w*|trolley\w*|shopp\w*)\b/.test(topic)) {
    structuralGuide =
      'SHOPPING CART: Angled push handle G.pill entering upper-left rim of wide-top G.trap basket frame + horizontal basket slots -> bottom axle + 2 wheels G.disc touching axle underneath.';
    themeMotion = 'gentle forward roll glide + spinning wheel hubs + cargo item bounce inside basket';
  } else if (/\b(compass\w*|gps|map\s*pin|locat\w*|navigat\w*|pin)\b/.test(topic)) {
    structuralGuide =
      'COMPASS / MAP PIN: Inverted teardrop G.dropShape(rot=Math.PI) pin with crisp center G.disc hole over flat map base G.trap, OR circular G.disc compass bezel with rotating 2-tone diamond needle G.poly.';
    themeMotion = 'if pin: crisp vertical drop-bounce onto ground shadow oval; if compass: smooth magnetic needle seek-oscillation';
  } else if (/\b(globe\w*|world|earth|global|planet\w*)\b/.test(topic)) {
    structuralGuide =
      'WIREFRAME GLOBE: Spherical G.disc + elliptical longitude meridian G.oval + horizontal latitude G.pill chords clipped visually inside sphere circumference (+ orbiting satellite dot or ring if orbital).';
    themeMotion = 'upright rot=0; smooth meridian rx expansion sweep simulating 3D sphere rotation';
  } else if (/\b(envelop\w*|email\w*|mail\w*|inbox\w*|newsletter\w*)\b/.test(topic)) {
    structuralGuide =
      'ENVELOPE MAIL: Wide G.box envelope body -> crisp V-shaped top flap G.poly touching exact upper-left/right corners + subtle letter card G.box peeking out top edge + centered badge.';
    themeMotion = 'upright rot=0; smooth flap open-peek animation lifting inner message card slightly';
  } else if (/\b(chat\w*|comment\w*|messag\w*|convers\w*|dialog\w*|bubbl\w*)\b/.test(topic)) {
    structuralGuide =
      'SPEECH BUBBLES: Rounded primary G.box bubble + seamless corner pointer tail G.poly welded to bottom edge + 3 staggered typing dots G.disc inside (plus secondary overlapping bubble behind if dialogue).';
    themeMotion = 'upright rot=0; wave-bouncing 3 typing dots (phase staggered 0, 0.7, 1.4 rad) inside bubble';
  } else if (/\b(bell\w*|notific\w*|ringing|chime\w*|alarm\w*)\b/.test(topic)) {
    structuralGuide =
      'NOTIFICATION BELL: Top ring loop G.disc -> flared G.dome bell body + wide lower flared G.capsule rim -> circular clapper G.disc tucked just below rim edge + symmetrical ringing arcs outside.';
    themeMotion = 'pendulum swing around top loop pivot (rot=Math.sin(t*5)*0.11) + synchronized opposing clapper sway & sound arcs';
  } else if (/\b(grad\w*|graduation|mortarboard|diploma)\b/.test(topic)) {
    structuralGuide =
      'GRADUATION CAP: Diamond mortarboard top G.poly overlapping trapezoidal under-cap G.trap cleanly -> hanging cord G.pill + tassel G.dropShape anchored at top center corner.';
    themeMotion = 'upright hover + gentle tassel pendulum swing from top corner anchor';
  } else if (/\b(book\w*|librar\w*|notebook\w*|study|manual\w*)\b/.test(topic)) {
    structuralGuide =
      'OPEN / STACKED BOOK: Symmetric left & right angled page G.poly panels joined along solid central spine G.box + bookmark ribbon G.trap draping neatly + printed G.pill lines on pages.';
    themeMotion = 'upright rot=0; subtle breathing page lift + gliding bookmark ribbon / reading line highlight';
  } else if (/\b(briefcase\w*|portfolio\w*|suitcase\w*)\b/.test(topic)) {
    structuralGuide =
      'BRIEFCASE PORTFOLIO: Wide rounded G.box case -> top U-handle G.uArc(...,"d") anchored firmly into top seam -> overlapping upper flap G.box with centered metallic clasp G.box.';
    themeMotion = 'upright rot=0 carry bob + subtle clasp glint';
  } else if (/\b(folder\w*|director\w*|archiv\w*)\b/.test(topic)) {
    structuralGuide =
      'DOCUMENT FOLDER: Back G.box folder plate with protruding top-left index tab G.box -> peeking white file edge G.box -> tilted/slotted front pocket G.trap.';
    themeMotion = 'upright rot=0; subtle front pocket open-close tilt revealing peeking file card';
  } else if (/\b(document\w*|checklist\w*|form\w*|clipboard\w*|contract\w*|report\w*|file\w*)\b/.test(topic)) {
    structuralGuide =
      'DOCUMENT / CHECKLIST SHEET: Crisp vertical G.box page + colored header bar or top clip G.capsule -> 3 aligned rows of small G.check/G.disc bullets + horizontal text G.pill bars strictly inside page.';
    themeMotion = 'upright rot=0; sequential row highlight / animated line draw & checkmark pop';
  } else if (/\b(gamepad\w*|joystick\w*|controller\w*|gaming|vr)\b/.test(topic)) {
    structuralGuide =
      'GAMEPAD CONTROLLER: Ergonomic wide bridge G.capsule + angled left/right grip G.capsule handles welded cleanly -> left G.cross D-pad + right 4-dot action G.disc cluster.';
    themeMotion = 'gentle playful tilt (|rot|<=0.06) + alternating action button highlight pulse';
  } else if (/\b(palett\w*|paint\w*|brush\w*|design\w*|art|draw\w*)\b/.test(topic)) {
    structuralGuide =
      'ARTIST PALETTE & BRUSH: Angled oval/bean G.oval palette with thumb hole G.disc + 4 vivid paint G.disc dollops arranged around upper curve + angled brush G.pill+G.dropShape.';
    themeMotion = 'gentle brush dab oscillation + sequential vivid paint swatch pop';
  }

  const twistHints = [
    'Clean crisp flat-3D vector with uniform rim lw=Math.max(2,0.032*R)',
    'Subtle recessed darker c0 depth plate behind main body + bright c2/c3 front focal accents',
    'Crisp layered symmetry with smooth animated specular sweep inside main container',
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
    label: `bespoke vector`,
    helperName: 'custom',
    anatomyHint: `${structuralGuide} ${twistHints[cm]}.`,
    codeHint: (overrideMode && overrideMap[overrideMode]) ? overrideMap[overrideMode] : themeMotion,
  };
}

