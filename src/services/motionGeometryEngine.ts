// Shared Canvas 2D Motion Geometry Engine, Seed Variation DNA & Prompt-to-Motion Resolver
// Single Source of Truth used by both client (geminiService.ts) and server (server/app.ts).

import { ENGINE_BASE_PRIMITIVES_JS, ENGINE_HERO_ICONS_A_JS } from './motionEngineIconsA';
import { ENGINE_HERO_ICONS_B_JS, ENGINE_BG_HELPERS_JS } from './motionEngineIconsB';
import { ENGINE_HERO_ICONS_C_JS } from './motionEngineIconsC';

export const STUDIO_GEOMETRY_ENGINE_JS = `${ENGINE_BASE_PRIMITIVES_JS}${ENGINE_HERO_ICONS_A_JS}${ENGINE_HERO_ICONS_B_JS}${ENGINE_HERO_ICONS_C_JS}${ENGINE_BG_HELPERS_JS}
    };`;

export const HELPERS_G_BASE_DOC =
  'G.grad(c1,c2,c3,x0,y0,x1,y1) | G.box(x,y,bw,bh,r,f,rim,lw) | G.bar(x,yB,bw,bh,r,f,rim,lw) | G.capsule(x,y,bw,bh,f,rim,lw) | G.disc(x,y,r,f,rim,lw) | G.oval(x,y,rx,ry,rot,f,rim,lw) | G.ring(x,y,r,th,a0,a1,col) | G.poly(pts,f,rim,lw,cl) | G.ngon(x,y,r,n,rot,f,rim) | G.star(x,y,ro,ri,n,rot,f,rim) | G.pill(x1,y1,x2,y2,th,col) | G.arrow(x1,y1,x2,y2,th,hL,col) | G.person(x,y,s,b,h,rim) | G.check(x,y,s,th,col) | G.pie(x,y,r,a0,sw,sC,bC,rim) | G.rays(x,y,rI,rO,n,rot,th,col) | G.dome(x,y,bw,bh,f,rim,lw) | G.wave(x,y,w,amp,freq,ph,th,col) | G.grid(x,y,bw,bh,cols,rows,r,act,f,aF,rim,lw) | G.bolt(x,y,s,f,rim,lw) | G.cross(x,y,s,th,f,rim,lw) | G.leaf(x,y,s,rot,f,rim,lw) | G.part(tx,ty,rot,sx,sy,fn)';

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
  'bobY=Math.sin(t*2.2)*0.03*R, rot=Math.sin(t*1.4)*0.025',
  'bobY=Math.cos(t*2.4)*0.032*R, rot=Math.sin(t*1.6)*0.028, sc=1+0.02*Math.sin(t*2.8)',
  'bobX=Math.sin(t*1.5)*0.015*R, bobY=Math.sin(t*2.5)*0.028*R, rot=Math.cos(t*1.5)*0.022',
  'bobY=Math.sin(t*2.0+0.8)*0.032*R, rot=-Math.sin(t*1.7)*0.026, sx=1+0.018*Math.sin(t*2.6), sy=1-0.018*Math.sin(t*2.6)',
  'bobY=Math.sin(t*2.7)*0.028*R, rot=Math.sin(t*1.9)*0.030',
  'bobY=Math.cos(t*2.1)*0.03*R, sc=1+0.024*Math.cos(t*2.4), rot=Math.sin(t*1.3)*0.020',
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

  // ICON: Bespoke Structural Anatomy Blueprint — NEVER forces a cloned template!
  // Builds prompt-accurate compound objects inside [-0.66*R, +0.66*R] with connected Painter's-Order geometry.
  let structuralGuide =
    'Build the EXACT literal object from the prompt using 4-7 cohesive, overlapping sub-parts inside [-0.66*R,+0.66*R] (1: outer housing/chassis silhouette; 2: secondary structural trim/frame/roof/stand physically joined with >=0.04*R overlap; 3: authentic internal functional mechanism; 4: animated focal element + crisp accent highlight).';
  let themeMotion = 'upright stable hover bobY=Math.sin(t*2.2)*0.028*R, |rot|<=0.04, plus smooth theme-driven internal part articulation';

  if (/\b(booth|kiosk|cabin|shelter|house|home|building|tower|store|shop|bank|office)\b/.test(topic)) {
    structuralGuide =
      'ARCHITECTURAL SILHOUETTE: Join crown/roof (G.dome or sloped G.poly) directly onto main structure G.box body -> crisp window/door G.grid panes -> interior subject detail (handset/hub/door) + solid foundation base G.box. Keep every sub-part physically anchored vertically with zero detached floating corner fragments.';
    themeMotion = 'gentle grounded hover bobY=Math.sin(t*2.0)*0.022*R (keep upright |rot|<=0.02) + illuminated G.grid active pane pulse / beacon ring';
  } else if (/\b(headset|headphone|call\s*center|earphone|mic|microphone|speaker|megaphone|audio|voice|podcast|music)\b/.test(topic)) {
    structuralGuide =
      'ACOUSTIC HARDWARE: Draw curved headband G.ring or flared cone G.poly connected seamlessly to padded earcups G.capsule / grille G.dome -> attached boom arm G.pill + acoustic G.wave waveform / sound arcs.';
    themeMotion = 'rhythmic beat hover + oscillating G.wave voice/audio waveform + subtle acoustic G.ring pulse';
  } else if (/\b(lock|padlock|encrypt|decrypt|cipher|vault|safe|key|shield|firewall|security|antivirus)\b/.test(topic)) {
    structuralGuide =
      'SECURITY ARTIFACT: Combine distinct security mechanism (arched G.ring shackle / faceted shield G.poly / machined G.pill key shaft+teeth) welded into sturdy armored G.box casing + centered keyhole/cipher G.grid or G.disc core (ZERO stock padlocks unless prompt is padlock; if encryption/cipher/key, build key/cipher dial/matrix!).';
    themeMotion = 'steady upright float + sliding latch/bolt/key-turn or animated cipher G.grid scan';
  } else if (/\b(browser|web|app|monitor|laptop|tablet|phone|smartphone|screen|terminal|dashboard|ui|ux|interface|window|error|loading)\b/.test(topic)) {
    structuralGuide =
      'DEVICE / UI FRAME: Main outer bezel G.box with top titlebar G.box & window controls -> clean inner viewport -> bespoke internal scene/alert/chart specific to THIS prompt (e.g. G.wave signal, G.bar KPIs, broken G.pill link, caution G.ngon triangle badge, progress G.capsule) nested completely inside the screen.';
    themeMotion = 'upright hover + live internal screen motion (sweeping progress capsule / rising bars / smooth warning badge pulse)';
  } else if (/\b(router|modem|wifi|wireless|network|server|cloud|cable|plug|disconnect|satellite|antenna|iot|smart\s*home)\b/.test(topic)) {
    structuralGuide =
      'CONNECTED HARDWARE / TELEMETRY: Build tangible prompt-specific hardware (e.g. house+hub, split cable plugs, server rack stack with G.grid LEDs, orbited satellite, parabolic dish G.dome, cloud silhouette of welded G.disc+G.box) with physically attached antennas/leads and synchronized signal arcs.';
    themeMotion = 'smooth phase signal propagation along G.ring arcs / sequential G.grid LED telemetry / plug separation-rejoin bounce';
  } else if (/\b(heart|medical|doctor|syringe|stethoscope|dna|pill|hospital|clinic|ambulance|virus|vaccine|health|lab|flask|microscope)\b/.test(topic)) {
    structuralGuide =
      'MEDICAL / SCIENCE INSTRUMENT: Craft the exact clinical instrument/anatomy (twin G.wave helix strands, Erlenmeyer triangular G.poly+neck G.box flask with rising bubbles, curved G.ring stethoscope chestpiece, sleek G.capsule syringe+plunger, or beveled G.cross core) with high contrast and clean bevel rims.';
    themeMotion = 'organic double-beat pulse / rising bubbles / oscillating ECG G.wave or metered plunger glide';
  } else if (/\b(cart|truck|delivery|drone|rocket|car|ship|plane|logistics|wallet|coin|bank|scale|calculator|calendar|clock|camera|trophy|book|grad|atom|palette)\b/.test(topic)) {
    structuralGuide =
      'BESPOKE HERO OBJECT: Assemble exact real-world geometry with recognizable proportions (wheels below chassis with G.ngon spokes, wings angled from fuselage, tripod/strap attached to body, stacked/peeking elements connected cleanly).';
    themeMotion = 'authentic mechanical physics (rotating wheels/gears, swinging pendulum/arms, gliding progress, buoyant flight bob)';
  }

  const twistHints = [
    'Composition Twist: clean bold front-facing isometric/flat-3D vector with crisp outer rim lw=Math.max(2,0.032*R)',
    'Composition Twist: subtle volumetric depth shadow offset layer beneath primary casing using darker palette tone c0 + vivid c2/c3 front highlight',
    'Composition Twist: crisp architectural symmetry with secondary animated kinetic highlight accent sweep inside main frame',
  ];

  const overrideMap: Record<string, string> = {
    bounce: 'elastic bounce bobY=-Math.abs(Math.sin(t*2.6))*0.045*R with subtle squash-stretch sx/sy',
    orbital: 'smooth orbital float bobY=Math.sin(t*2.1)*0.028*R + harmonic tilt rot=Math.sin(t*1.5)*0.03',
    morph: 'fluid breathing scale sx=1+0.024*Math.sin(t*2.4), sy=1-0.024*Math.sin(t*2.4)',
    cyber: 'crisp stepped electronic pulse + kinetic scanline/LED wave sweep',
    mechanical: 'precision geared/articulated sub-part motion with damped spring settling',
    flow: 'silky harmonic 60 FPS sine float + coordinated internal element flow',
  };

  return {
    label: `custom bespoke vector`,
    helperName: 'custom',
    anatomyHint: `${structuralGuide} ${twistHints[cm]}. ZERO generic stock clones; 100% tailored silhouette for "${promptTopic.slice(0, 80)}".`,
    codeHint: (overrideMode && overrideMap[overrideMode]) ? overrideMap[overrideMode] : themeMotion,
  };
}

