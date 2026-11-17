// Shared Canvas 2D Motion Geometry Engine, Seed Variation DNA & Prompt-to-Motion Resolver
// Single Source of Truth used by both client (geminiService.ts) and server (server/app.ts).

import { ENGINE_BASE_PRIMITIVES_JS, ENGINE_HERO_ICONS_A_JS } from './motionEngineIconsA';
import { ENGINE_HERO_ICONS_B_JS, ENGINE_BG_HELPERS_JS } from './motionEngineIconsB';
import { ENGINE_HERO_ICONS_C_JS } from './motionEngineIconsC';

export const STUDIO_GEOMETRY_ENGINE_JS = `${ENGINE_BASE_PRIMITIVES_JS}${ENGINE_HERO_ICONS_A_JS}${ENGINE_HERO_ICONS_B_JS}${ENGINE_HERO_ICONS_C_JS}${ENGINE_BG_HELPERS_JS}
    };`;

export const HELPERS_G_BASE_DOC =
  'G.grad(c1,c2,c3,x0,y0,x1,y1) | G.box(x,y,bw,bh,r,f,rim,lw) | G.bar(x,yB,bw,bh,r,f,rim,lw) | G.capsule(x,y,bw,bh,f,rim,lw) | G.disc(x,y,r,f,rim,lw) | G.oval(x,y,rx,ry,rot,f,rim,lw) | G.ring(x,y,r,th,a0,a1,col) | G.poly(pts,f,rim,lw,cl) | G.ngon(x,y,r,n,rot,f,rim) | G.star(x,y,ro,ri,n,rot,f,rim) | G.pill(x1,y1,x2,y2,th,col) | G.arrow(x1,y1,x2,y2,th,hL,col) | G.person(x,y,s,b,h,rim) | G.check(x,y,s,th,col) | G.pie(x,y,r,a0,sw,sC,bC,rim) | G.rays(x,y,rI,rO,n,rot,th,col) | G.part(tx,ty,rot,sx,sy,fn)';

export const HELPERS_G_HERO_DOC =
  'HERO G (s=1.05*R,...,t,v=0..5): G.uiLayout | G.videoCall | G.laptop | G.checklist | G.rocket | G.lightbulb | G.chart | G.magnifier | G.pieChart | G.gears | G.userBadge | G.typography | G.briefcase | G.trophy | G.clock | G.lock | G.cloudSync | G.robot | G.chip | G.coinStack | G.handshake | G.shield | G.cart | G.megaphone | G.wallet | G.globe | G.building | G.document | G.folder | G.target | G.envelope | G.chat | G.network | G.server | G.calendar | G.candlestick | G.desk | G.negotiation | G.medical | G.delivery | G.puzzle | G.bell | G.calculator | G.scales | G.compass | G.camera | G.gamepad | G.vrHeadset | G.dice | G.headphones | G.atom | G.microscope | G.telescope | G.flask | G.book | G.gradCap | G.dna | G.stethoscope | G.syringe | G.heartbeat | G.palette | G.layers | G.ruler | G.penTool | G.drone | G.satellite | G.key | G.battery';

export const HELPERS_G_BG_DOC =
  'BG G (full-frame 0..w,0..h): G.bgWaves(w,h,c1,c2,c3,t,v) | G.bgGrid(w,h,c1,c2,c3,t,v) | G.bgGeo(w,h,c1,c2,c3,t,v)';

export const HELPERS_G_DOC = `${HELPERS_G_BASE_DOC} | ${HELPERS_G_HERO_DOC}`;

export const HELPERS_G_VISION_DOC = `${HELPERS_G_BASE_DOC} | G.handshake | G.shield | G.cart | G.megaphone | G.wallet | G.globe | G.building | G.document | G.folder | G.target | G.envelope | G.chat | G.network | G.server | G.calendar | G.candlestick | G.desk | G.negotiation | G.medical | G.delivery | G.puzzle | G.bell | G.calculator | G.scales | G.compass | G.camera | G.uiLayout | G.videoCall | G.laptop | G.checklist | G.rocket | G.lightbulb | G.chart | G.magnifier | G.pieChart | G.gears | G.userBadge | G.typography | G.briefcase | G.trophy | G.clock | G.lock | G.cloudSync | G.robot | G.chip | G.coinStack | G.gamepad | G.vrHeadset | G.dice | G.headphones | G.atom | G.microscope | G.telescope | G.flask | G.book | G.gradCap | G.dna | G.stethoscope | G.syringe | G.heartbeat | G.palette | G.layers | G.ruler | G.penTool | G.drone | G.satellite | G.key | G.battery`;

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

  let topicHash = 0;
  for (let i = 0; i < topic.length; i++) {
    topicHash = ((topicHash << 5) - topicHash + topic.charCodeAt(i)) | 0;
  }
  const absTopicHash = Math.abs(topicHash);

  if (type === 'bg') {
    if (/\b(grid|cyber|matrix|network|tech|circuit|wireframe|digital|future|perspective|mesh|hud|radar)\b/.test(topic)) {
      return {
        label: `cyber wireframe grid (v${v})`,
        helperName: 'bgGrid',
        anatomyHint: `Call G.bgGrid(w, h, c1, c2, c3, t, ${v}) directly in drawFrame (full-frame 0..w, 0..h)!`,
        codeHint: 'seamless scrolling perspective/grid telemetry lattice across full canvas',
      };
    }
    if (/\b(geo|geometric|minimal|ribbon|bar|hexagon|hex|polygon|triangle|shape|abstract|isometric|cube)\b/.test(topic)) {
      return {
        label: `geometric rhythm field (v${v})`,
        helperName: 'bgGeo',
        anatomyHint: `Call G.bgGeo(w, h, c1, c2, c3, t, ${v}) directly in drawFrame (full-frame 0..w, 0..h)!`,
        codeHint: 'gliding geometric capsules/hexagons + central harmonic orbital ring across full canvas',
      };
    }
    return {
      label: `full-frame harmonic waves (v${v})`,
      helperName: 'bgWaves',
      anatomyHint: `Call G.bgWaves(w, h, c1, c2, c3, t, ${v}) directly in drawFrame (full-frame 0..w, 0..h)!`,
      codeHint: 'layered smooth cosine ribbon waves drifting seamlessly across 0..w, 0..h',
    };
  }

  // Secondary kinetic polish NEVER replaces the cohesive hero helper (prevents random detached primitives!)
  const withPolish = (plan: PromptMotionPlan): PromptMotionPlan => {
    if (cm === 1) {
      return {
        label: `${plan.label} + pulse`,
        helperName: plan.helperName,
        anatomyHint: plan.anatomyHint,
        codeHint: `${plan.codeHint} + smooth subtle scale breathe sx=sy=1+0.022*Math.sin(t*2.6)`,
      };
    }
    if (cm === 2) {
      return {
        label: `${plan.label} + counter-sway`,
        helperName: plan.helperName,
        anatomyHint: plan.anatomyHint,
        codeHint: `${plan.codeHint} + gentle counter-tilt rot=Math.sin(t*1.5)*0.03`,
      };
    }
    return plan;
  };

  // --- PRIORITY 1: CONCRETE PHYSICAL SUBJECTS (Gaming, Science, Edu, Medical, Design, Hardware) ---
  // Evaluated BEFORE broad nouns like "network", "design", "ui", "ai", "system" so specific items stay 100% on-theme!

  // Gaming & Entertainment
  if (/\b(gamepad|controller|joystick|console|arcade|esport\w*|d-pad|dpad|gaming\s*pad|retro\s*game)\b/.test(topic)) {
    return withPolish({
      label: `gaming controller console (v${v})`,
      helperName: 'gamepad',
      anatomyHint: `Call G.gamepad(0, 0, 1.05*R, bodyCol, padCol, btnCol, "#F8FAFC", t, ${v}) inside G.part!`,
      codeHint: 'upright hover bobY=Math.sin(t*2.4)*0.028*R + live button & stick motion',
    });
  }
  if (/\b(vr\b|virtual\s*reality|metaverse|vr\s*headset|vr\s*goggles|ar\s*glass\w*|spatial\s*visor|head-mounted)\b/.test(topic)) {
    return withPolish({
      label: `VR spatial headset (v${v})`,
      helperName: 'vrHeadset',
      anatomyHint: `Call G.vrHeadset(0, 0, 1.05*R, bodyCol, visorCol, accentCol, "#F8FAFC", t, ${v}) inside G.part!`,
      codeHint: 'upright hover bobY=Math.sin(t*2.2)*0.026*R + glowing visor scan sweep',
    });
  }
  if (/\b(dice|board\s*game|tabletop|casino|roulette|rng|gamification|lucky\s*cube)\b/.test(topic)) {
    return withPolish({
      label: `3D gaming dice (v${v})`,
      helperName: 'dice',
      anatomyHint: `Call G.dice(0, 0, 1.05*R, faceCol, "#F8FAFC", accentCol, "#F8FAFC", t, ${v}) inside G.part!`,
      codeHint: 'buoyant tumble bobY=Math.sin(t*2.5)*0.03*R + playful cube rock & pip gleam',
    });
  }
  if (/\b(headphone\w*|headset|earphone\w*|earbud\w*|equalizer|podcast|audio\s*studio|music\s*player|soundtrack)\b/.test(topic)) {
    return withPolish({
      label: `audio studio headphones (v${v})`,
      helperName: 'headphones',
      anatomyHint: `Call G.headphones(0, 0, 1.05*R, bandCol, cupCol, accentCol, "#F8FAFC", t, ${v}) inside G.part!`,
      codeHint: 'rhythmic float bobY=Math.sin(t*2.6)*0.028*R + live soundwave equalizer',
    });
  }

  // Education & Science
  if (/\b(atom\w*|quantum|physics|molecule|molecular|electron|proton|nucleus|bohr|nuclear|particle\s*orbit)\b/.test(topic)) {
    return withPolish({
      label: `atomic orbital model (v${v})`,
      helperName: 'atom',
      anatomyHint: `Call G.atom(0, 0, 1.05*R, nucCol, orb1Col, orb2Col, "#F8FAFC", t, ${v}) inside G.part!`,
      codeHint: 'smooth precession float + continuous orbital electron revolution',
    });
  }
  if (/\b(microscope|specimen|pathology|histology|microbiology|cell\s*research|petri|lens\s*turret)\b/.test(topic)) {
    return withPolish({
      label: `laboratory microscope (v${v})`,
      helperName: 'microscope',
      anatomyHint: `Call G.microscope(0, 0, 1.05*R, bodyCol, lensCol, accentCol, "#F8FAFC", t, ${v}) inside G.part!`,
      codeHint: 'upright lab hover bobY=Math.sin(t*2.0)*0.024*R + precision optical turret focus',
    });
  }
  if (/\b(telescope|astronomy|observatory|astrophysics|cosmos|starfinder|planetarium)\b/.test(topic)) {
    return withPolish({
      label: `astronomy telescope (v${v})`,
      helperName: 'telescope',
      anatomyHint: `Call G.telescope(0, 0, 1.05*R, tubeCol, tripCol, accentCol, "#F8FAFC", t, ${v}) inside G.part!`,
      codeHint: 'gentle celestial float + smooth sky-scanning barrel sweep',
    });
  }
  if (/\b(flask|beaker|erlenmeyer|chemistry|chemical|reagent|potion|test\s*tube|experiment|alchemy)\b/.test(topic)) {
    return withPolish({
      label: `chemistry lab flask (v${v})`,
      helperName: 'flask',
      anatomyHint: `Call G.flask(0, 0, 1.05*R, glassCol, liqCol, bubCol, "#F8FAFC", t, ${v}) inside G.part!`,
      codeHint: 'upright flask float bobY=Math.sin(t*2.2)*0.026*R + rising effervescent bubbles',
    });
  }
  if (/\b(graduat\w*|mortarboard|diploma|academic|university|campus|scholarship|degree|convocation|tassel)\b/.test(topic)) {
    return withPolish({
      label: `graduation cap & tassel (v${v})`,
      helperName: 'gradCap',
      anatomyHint: `Call G.gradCap(0, 0, 1.05*R, capCol, "#F8FAFC", tasCol, accCol, t, ${v}) inside G.part!`,
      codeHint: 'upright academic float bobY=Math.sin(t*2.1)*0.026*R + swinging golden tassel',
    });
  }
  if (/\b(book\w*|textbook|e-learning|elearning|ebook|library|reading|encyclopedia|dictionary|syllabus|curriculum|study)\b/.test(topic)) {
    return withPolish({
      label: `open knowledge book (v${v})`,
      helperName: 'book',
      anatomyHint: `Call G.book(0, 0, 1.05*R, coverCol, "#F8FAFC", accentCol, "#1E293B", t, ${v}) inside G.part!`,
      codeHint: 'upright float bobY=Math.sin(t*2.1)*0.026*R + rhythmic page turn pulse',
    });
  }

  // Medical & Health (Split cleanly across 4 distinct icons!)
  if (/\b(dna|helix|genetic\w*|genome|chromosom\w*|biotech\w*)\b/.test(topic)) {
    return withPolish({
      label: `DNA double helix (v${v})`,
      helperName: 'dna',
      anatomyHint: `Call G.dna(0, 0, 1.05*R, s1Col, s2Col, rungCol, "#F8FAFC", t, ${v}) inside G.part!`,
      codeHint: 'upright biotech float + smooth double-helix base-pair phase rotation',
    });
  }
  if (/\b(stethoscope|auscultat\w*|doctor|physician|checkup|check-up|diagnosis|pediatric)\b/.test(topic)) {
    return withPolish({
      label: `clinical stethoscope (v${v})`,
      helperName: 'stethoscope',
      anatomyHint: `Call G.stethoscope(0, 0, 1.05*R, tubeCol, metalCol, accentCol, "#F8FAFC", t, ${v}) inside G.part!`,
      codeHint: 'upright medical float + rhythmic chestpiece diaphragm pulse',
    });
  }
  if (/\b(syringe|vaccine|vaccinat\w*|injection|needle|immuniz\w*|booster|serum)\b/.test(topic)) {
    return withPolish({
      label: `precision vaccine syringe (v${v})`,
      helperName: 'syringe',
      anatomyHint: `Call G.syringe(0, 0, 1.05*R, "#F8FAFC", fluidCol, accentCol, "#1E293B", t, ${v}) inside G.part!`,
      codeHint: 'angled precision float + smooth metered plunger glide',
    });
  }
  if (/\b(heartbeat|cardiogram|ecg|ekg|pulse|cardio\w*|heart\s*rate|oximeter|vital\s*signs|defibrillator)\b/.test(topic)) {
    return withPolish({
      label: `cardiac heartbeat ECG (v${v})`,
      helperName: 'heartbeat',
      anatomyHint: `Call G.heartbeat(0, 0, 1.05*R, heartCol, "#F8FAFC", accentCol, "#F8FAFC", t, ${v}) inside G.part!`,
      codeHint: 'rhythmic lub-dub cardiac expansion + live ECG wave beat',
    });
  }
  if (/\b(pill|capsule|tablet|medicine|medical|cross|hospital|clinic|pharmacy|first\s*aid|ambulance|health|wellness)\b/.test(topic)) {
    return withPolish({
      label: `medical care emblem (v${v})`,
      helperName: 'medical',
      anatomyHint: `Call G.medical(0, 0, 1.05*R, "#F8FAFC", crossCol, accentCol, "#1E293B", t, ${v}) inside G.part!`,
      codeHint: 'double-beat wellness pulse + clean medical cross / shield beat',
    });
  }

  // UI Design & Graphic Design (Split cleanly across 5 distinct design tools!)
  if (/\b(palette|paint\w*|brush|color\s*wheel|swatch\w*|illustrat\w*|artist|canvas\s*art|watercolor|pigment)\b/.test(topic)) {
    return withPolish({
      label: `color palette & brush (v${v})`,
      helperName: 'palette',
      anatomyHint: `Call G.palette(0, 0, 1.05*R, boardCol, c1Col, c2Col, "#F8FAFC", t, ${v}) inside G.part!`,
      codeHint: 'upright creative float bobY=Math.sin(t*2.2)*0.026*R + oscillating artist brush/swatches',
    });
  }
  if (/\b(layer\w*|stack|figma|component\s*library|prototype|prototyping|isometric\s*plane|design\s*system|card\s*stack)\b/.test(topic)) {
    return withPolish({
      label: `stacked UI design layers (v${v})`,
      helperName: 'layers',
      anatomyHint: `Call G.layers(0, 0, 1.05*R, topCol, midCol, botCol, "#F8FAFC", t, ${v}) inside G.part!`,
      codeHint: 'isometric float + rhythmic Z-axis layer separation wave',
    });
  }
  if (/\b(ruler|set\s*square|caliper|measurement|spacing|grid\s*tool|drafting|blueprint|measure|dimension)\b/.test(topic)) {
    return withPolish({
      label: `precision design ruler (v${v})`,
      helperName: 'ruler',
      anatomyHint: `Call G.ruler(0, 0, 1.05*R, rulCol, penCol, accentCol, "#F8FAFC", t, ${v}) inside G.part!`,
      codeHint: 'upright studio float + sliding alignment guide & caliper',
    });
  }
  if (/\b(pen\s*tool|bezier|anchor\s*point|path\s*curve|vector\s*tool|spline|nib|stylus)\b/.test(topic)) {
    return withPolish({
      label: `vector bezier pen tool (v${v})`,
      helperName: 'penTool',
      anatomyHint: `Call G.penTool(0, 0, 1.05*R, nibCol, nodeCol, curveCol, "#F8FAFC", t, ${v}) inside G.part!`,
      codeHint: 'upright vector hover + oscillating bezier anchor handles',
    });
  }
  if (/\b(typography|font|lettering|typeface|serif|calligraphy|editorial\s*type)\b/.test(topic)) {
    return withPolish({
      label: `editorial typography glyph (v${v})`,
      helperName: 'typography',
      anatomyHint: `Call G.typography(0, 0, 1.05*R, cardCol, inkCol, accentCol, "#F8FAFC", t, ${v}) inside G.part!`,
      codeHint: 'upright hover bobY=Math.sin(t*2.2)*0.026*R + baseline cursor glide',
    });
  }

  // Robotics, Aerospace, Telecom, Power & Crypto Keys
  if (/\b(drone|quadcopter|uav|aerial\s*bot|delivery\s*drone)\b/.test(topic)) {
    return withPolish({
      label: `autonomous UAV drone (v${v})`,
      helperName: 'drone',
      anatomyHint: `Call G.drone(0, 0, 1.05*R, bodyCol, rotorCol, camCol, "#F8FAFC", t, ${v}) inside G.part!`,
      codeHint: 'hovering flight bobY=Math.sin(t*3.0)*0.035*R + high-speed rotor blur',
    });
  }
  if (/\b(satellite|radar|dish|telemetry|antenna|radio\s*tower|5g|wireless|wifi|signal\s*relay|telecom\w*)\b/.test(topic)) {
    return withPolish({
      label: `orbital signal satellite (v${v})`,
      helperName: 'satellite',
      anatomyHint: `Call G.satellite(0, 0, 1.05*R, bodyCol, wingCol, beamCol, "#F8FAFC", t, ${v}) inside G.part!`,
      codeHint: 'gentle orbital sway + pulsing concentric telemetry beams',
    });
  }
  if (/\b(encryption\s*key|encryption\s+\w+\s+key|security\s*key|crypto\s*key|digital\s*key|api\s*key|passkey|password|token\s*key|access\s*key|credential)\b/.test(topic)) {
    return withPolish({
      label: `digital encryption key (v${v})`,
      helperName: 'key',
      anatomyHint: `Call G.key(0, 0, 1.05*R, keyCol, bowCol, accentCol, "#F8FAFC", t, ${v}) inside G.part!`,
      codeHint: 'metallic float + smooth security key turn rotation',
    });
  }
  if (/\b(battery|eco-charger|charger|charging|ev\b|photovoltaic|clean\s*energy|power\s*cell|volt\w*)\b/.test(topic)) {
    return withPolish({
      label: `clean energy battery cell (v${v})`,
      helperName: 'battery',
      anatomyHint: `Call G.battery(0, 0, 1.05*R, shellCol, chargeCol, boltCol, "#F8FAFC", t, ${v}) inside G.part!`,
      codeHint: 'upright power float + progressive segmented energy charge',
    });
  }

  // --- PRIORITY 2: SPECIFIC COMPOUND WORK & ENTERPRISE SUBJECTS ---
  if (/\b(video\s*conferenc\w*|video\s*call\w*|teleconferenc\w*|webinar\w*|zoom\s*call|online\s*meeting|virtual\s*meeting)\b/.test(topic)) {
    return withPolish({
      label: `video conference display (v${v})`,
      helperName: 'videoCall',
      anatomyHint: `Call G.videoCall(0, 0, 1.05*R, frameCol, tileCol, accentCol, "#F8FAFC", t, ${v}) inside G.part!`,
      codeHint: 'upright monitor float bobY=Math.sin(t*2.1)*0.025*R, rot=Math.sin(t*1.4)*0.025 + active tile pulse',
    });
  }
  if (/\b(office\s+desk|desk|workstation|workspace|cubicle|study\s+table)\b/.test(topic)) {
    return withPolish({
      label: `organized desk workstation (v${v})`,
      helperName: 'desk',
      anatomyHint: `Call G.desk(0, 0, 1.05*R, deskCol, screenCol, accentCol, "#F8FAFC", t, ${v}) inside G.part!`,
      codeHint: 'upright desk workstation bobY=Math.sin(t*2.1)*0.025*R + live monitor screen motion',
    });
  }
  if (/\b(candlestick|trading|stock\s*market|forex|crypto\w*|bitcoin|exchange)\b/.test(topic)) {
    return withPolish({
      label: `market candlestick chart (v${v})`,
      helperName: 'candlestick',
      anatomyHint: `Call G.candlestick(0, 0, 1.05*R, frameCol, bullCol, bearCol, "#F8FAFC", t, ${v}) inside G.part!`,
      codeHint: 'upright trading float bobY=Math.sin(t*2.1)*0.025*R + animated candlestick bar motion',
    });
  }
  if (/\b(contract|agreement|invoice|receipt|certificate|policy|report|annual\s*report|document|resume|cv|audit|compliance|tax\s*form)\b/.test(topic)) {
    return withPolish({
      label: `executive document seal (v${v})`,
      helperName: 'document',
      anatomyHint: `Call G.document(0, 0, 1.05*R, "#F8FAFC", headerCol, accentCol, "#1E293B", t, ${v}) inside G.part!`,
      codeHint: 'upright float bobY=Math.sin(t*2.1)*0.025*R + internal highlight scan & badge pulse',
    });
  }
  if (/\b(folder|archive|directory|binder|filing|repository)\b/.test(topic)) {
    return withPolish({
      label: `tabbed archive folder (v${v})`,
      helperName: 'folder',
      anatomyHint: `Call G.folder(0, 0, 1.05*R, backCol, frontCol, accentCol, "#F8FAFC", t, ${v}) inside G.part!`,
      codeHint: 'upright hover bobY=Math.sin(t*2.2)*0.028*R + smooth vertical card peek inside folder',
    });
  }
  if (/\b(building|skyscraper|tower|headquarters|architecture|real\s*estate|bank\s*vault|institution)\b|\boffice\s+building\b|\bcorporate\s+building\b/.test(topic)) {
    return withPolish({
      label: `corporate headquarters (v${v})`,
      helperName: 'building',
      anatomyHint: `Call G.building(0, 0, 1.05*R, bodyCol, winCol, accentCol, "#F8FAFC", t, ${v}) inside G.part!`,
      codeHint: 'upright architectural float bobY=Math.sin(t*1.9)*0.022*R + window illumination wave',
    });
  }
  if (/\b(calculator|accounting|bookkeeping|budgeting|expense)\b/.test(topic)) {
    return withPolish({
      label: `financial calculator console (v${v})`,
      helperName: 'calculator',
      anatomyHint: `Call G.calculator(0, 0, 1.05*R, bodyCol, screenCol, btnCol, "#F8FAFC", t, ${v}) inside G.part!`,
      codeHint: 'upright hover bobY=Math.sin(t*2.2)*0.026*R + sequential glowing key pulse',
    });
  }
  if (/\b(troubleshoot\w*|diagnostic\w*|repair|maintenance|debug\w*|gear|settings|cog|automation|operations|engineering)\b/.test(topic)) {
    return withPolish({
      label: `meshed cog rotation (v${v})`,
      helperName: 'gears',
      anatomyHint: `Call G.gears(0, 0, 1.05*R, g1Col, g2Col, coreCol, "#F8FAFC", t, ${v}) inside G.part!`,
      codeHint: 'upright float bobY=Math.sin(t*2.0)*0.025*R + counter-rotating meshed cogwheels',
    });
  }
  if (/\b(bell|alarm|siren|alert|notification|error\s*notification|warning|reminder)\b/.test(topic)) {
    return withPolish({
      label: `acoustic ring bell (v${v})`,
      helperName: 'bell',
      anatomyHint: `Call G.bell(0, 0, 1.05*R, bellCol, clapperCol, accentCol, "#F8FAFC", t, ${v}) inside G.part!`,
      codeHint: 'pendulum swing rot=Math.sin(t*3.2)*0.06 + opposite clapper swing',
    });
  }
  if (/\b(encrypt\w*|decrypt\w*|cipher|cryptograph\w*|ssl|tls|vpn|lock|padlock|vault|fingerprint|biometric|security|safe)\b/.test(topic)) {
    return withPolish({
      label: `precision security lock (v${v})`,
      helperName: 'lock',
      anatomyHint: `Call G.lock(0, 0, 1.05*R, bodyCol, shackleCol, accentCol, "#F8FAFC", t, ${v}) inside G.part!`,
      codeHint: 'upright hover bobY=Math.sin(t*2.2)*0.028*R + smooth vertical shackle lock recoil',
    });
  }
  if (/\b(chip|cpu|processor|circuit|microchip|semiconductor|hardware|silicon|logic\s*cube|smart\s*home|iot)\b/.test(topic)) {
    return withPolish({
      label: `silicon processor chip (v${v})`,
      helperName: 'chip',
      anatomyHint: `Call G.chip(0, 0, 1.05*R, pkgCol, pinCol, coreCol, "#F8FAFC", t, ${v}) inside G.part!`,
      codeHint: 'upright tech float bobY=Math.sin(t*2.2)*0.028*R + pulsing silicon core',
    });
  }
  if (/\b(robot\w*|android|chatbot|ai\s*agent|assistant|gripper|humanoid|brain\b|synthetic\s*ai)\b/.test(topic)) {
    return withPolish({
      label: `intelligent AI bot (v${v})`,
      helperName: 'robot',
      anatomyHint: `Call G.robot(0, 0, 1.05*R, bodyCol, visorCol, eyeCol, "#F8FAFC", t, ${v}) inside G.part!`,
      codeHint: 'friendly hover bobY=Math.sin(t*2.3)*0.03*R + eye & antenna beacon pulse',
    });
  }
  if (/\b(server|database|sql|hosting|datacenter|rack|mainframe)\b/.test(topic)) {
    return withPolish({
      label: `stacked server cluster (v${v})`,
      helperName: 'server',
      anatomyHint: `Call G.server(0, 0, 1.05*R, rackCol, ledCol, accentCol, "#F8FAFC", t, ${v}) inside G.part!`,
      codeHint: 'upright float bobY=Math.sin(t*2.1)*0.025*R + sequential LED telemetry scan',
    });
  }
  if (/\b(cloud|saas|storage|backup|sync|upload|download|recovery|restore|failover|snapshot)\b/.test(topic)) {
    return withPolish({
      label: `cloud data sync (v${v})`,
      helperName: 'cloudSync',
      anatomyHint: `Call G.cloudSync(0, 0, 1.05*R, cloudCol, arrowCol, "#F8FAFC", t, ${v}) inside G.part!`,
      codeHint: 'upright cloud float bobY=Math.sin(t*2.1)*0.028*R + smooth vertical arrow sync',
    });
  }
  if (/\b(neural\s*network|network\s*node\w*|blockchain|api\s*mesh|topology|network|intranet|connectivity|router|broadband|lan|wan)\b/.test(topic)) {
    return withPolish({
      label: `connected network topology (v${v})`,
      helperName: 'network',
      anatomyHint: `Call G.network(0, 0, 1.05*R, coreCol, nodeCol, linkCol, "#F8FAFC", t, ${v}) inside G.part!`,
      codeHint: 'upright float bobY=Math.sin(t*2.0)*0.025*R + pulsing perceptron/mesh nodes',
    });
  }
  if (/\b(laptop|notebook|macbook|ultrabook|computer|desktop|monitor|screen)\b/.test(topic)) {
    return withPolish({
      label: `laptop workstation (v${v})`,
      helperName: 'laptop',
      anatomyHint: `Call G.laptop(0, 0, 1.05*R, bodyCol, "#0F172A", accentCol, "#F8FAFC", t, ${v}) inside G.part!`,
      codeHint: 'upright hover bobY=Math.sin(t*2.2)*0.028*R, rot=Math.sin(t*1.5)*0.025 + internal screen animation',
    });
  }
  if (/\b(browser|web\s*browser|webpage|website|web\s*portal|ui\s*layout|wireframe|interface|app\s*design|landing\s*page|mockup|web\s*app|dashboard\s*ui|ux\s*flow)\b/.test(topic)) {
    return withPolish({
      label: `interactive UI layout (v${v})`,
      helperName: 'uiLayout',
      anatomyHint: `Call G.uiLayout(0, 0, 1.05*R, frameCol, headerCol, accentCol, "#F8FAFC", t, ${v}) inside G.part!`,
      codeHint: 'upright hover bobY=Math.sin(t*2.2)*0.028*R + animated UI blocks & progress bars',
    });
  }
  if (/\b(hiring|recruit\w*|talent|candidate|hr\b|human\s*resources|interview|onboarding|staffing|leadership|executive|leader|manager|ceo|mentor|customer|support|avatar)\b/.test(topic)) {
    return withPolish({
      label: `talent & leadership badge (v${v})`,
      helperName: 'userBadge',
      anatomyHint: `Call G.userBadge(0, 0, 1.05*R, cardCol, personCol, accentCol, "#F8FAFC", t, ${v}) inside G.part!`,
      codeHint: 'upright hover bobY=Math.sin(t*2.2)*0.028*R + verification crest & bar pulse',
    });
  }
  if (/\b(productivity|efficiency|checklist|todo|to-do|task\s*management|kanban|sprint|workflow)\b/.test(topic)) {
    return withPolish({
      label: `task checklist flow (v${v})`,
      helperName: 'checklist',
      anatomyHint: `Call G.checklist(0, 0, 1.05*R, boardCol, clipCol, accentCol, "#F8FAFC", t, ${v}) inside G.part!`,
      codeHint: 'upright hover bobY=Math.sin(t*2.2)*0.028*R + sequential animated task bars',
    });
  }
  if (/\b(pie\s*chart|pie|donut|market\s*share|allocation|budget\s*breakdown|proportion)\b/.test(topic)) {
    return withPolish({
      label: `segmented pie chart (v${v})`,
      helperName: 'pieChart',
      anatomyHint: `Call G.pieChart(0, 0, 1.05*R, baseCol, s1Col, s2Col, s3Col, "#F8FAFC", t, ${v}) inside G.part!`,
      codeHint: 'upright float bobY=Math.sin(t*2.2)*0.028*R + active pie slice expansion',
    });
  }
  if (/\b(market\s*research|survey|discovery|inspect\w*|seo\b|search\s*engine|magnifying|investigat\w*)\b/.test(topic)) {
    return withPolish({
      label: `optical lens research scan (v${v})`,
      helperName: 'magnifier',
      anatomyHint: `Call G.magnifier(0, 0, 1.05*R, cardCol, lensCol, handleCol, accentCol, "#F8FAFC", t, ${v}) inside G.part!`,
      codeHint: 'upright hover bobY=Math.sin(t*2.1)*0.025*R + smooth circular lens sweep',
    });
  }
  if (/\b(entrepreneur\w*|startup|launch|venture|founder|rocket|boost|scaleup|scale-up|accelerate|spaceship)\b/.test(topic)) {
    return withPolish({
      label: `ascendant rocket launch (v${v})`,
      helperName: 'rocket',
      anatomyHint: `Call G.rocket(0, 0, 1.05*R, hullCol, wingCol, flameCol, "#F8FAFC", t, ${v}) inside G.part(cx, cy+bobY, -0.16+rot, 1, 1, fn)!`,
      codeHint: 'dynamic thrust bobY=Math.sin(t*3.0)*0.038*R + angled ascent & live exhaust flame',
    });
  }
  if (/\b(opportunity|breakthrough|lightbulb|idea|bulb|innovation|brainstorm|insight)\b/.test(topic)) {
    return withPolish({
      label: `radiant idea lightbulb (v${v})`,
      helperName: 'lightbulb',
      anatomyHint: `Call G.lightbulb(0, 0, 1.05*R, bulbCol, rayCol, baseCol, "#F8FAFC", t, ${v}) inside G.part!`,
      codeHint: 'upright float bobY=Math.sin(t*2.3)*0.03*R + rhythmic radial ray glow',
    });
  }
  if (/\b(shopping\s*cart|cart|trolley|ecommerce|e-commerce|checkout|retail|marketplace|shopping\s*bag)\b/.test(topic)) {
    return withPolish({
      label: `e-commerce shopping cart (v${v})`,
      helperName: 'cart',
      anatomyHint: `Call G.cart(0, 0, 1.05*R, bodyCol, wheelCol, accentCol, "#F8FAFC", t, ${v}) inside G.part!`,
      codeHint: 'gentle horizontal glide offsetX=Math.sin(t*2.2)*0.04*R + internal parcel settle',
    });
  }
  if (/\b(procurement|purchase|order|supply\s*chain|inventory|warehouse|logistics|truck|cargo|delivery|shipping|parcel|courier)\b/.test(topic)) {
    return withPolish({
      label: `express logistics delivery (v${v})`,
      helperName: 'delivery',
      anatomyHint: `Call G.delivery(0, 0, 1.05*R, truckCol, cargoCol, accentCol, "#F8FAFC", t, ${v}) inside G.part!`,
      codeHint: 'suspension glide bobY=Math.sin(t*2.8)*0.025*R + forward cargo & wheel roll',
    });
  }
  if (/\b(digital\s*wallet|e-wallet|wallet|purse|mobile\s*pay|fintech)\b/.test(topic)) {
    return withPolish({
      label: `digital wallet reveal (v${v})`,
      helperName: 'wallet',
      anatomyHint: `Call G.wallet(0, 0, 1.05*R, bodyCol, flapCol, claspCol, "#F8FAFC", t, ${v}) inside G.part!`,
      codeHint: 'upright hover bobY=Math.sin(t*2.2)*0.028*R + smooth card reveal & clasp pulse',
    });
  }
  if (/\b(reputation|trust|credibility|review|rating|endorsement|testimonial|shield|protection|firewall|cybersecurity|antivirus)\b/.test(topic)) {
    return withPolish({
      label: `shield trust crest (v${v})`,
      helperName: 'shield',
      anatomyHint: `Call G.shield(0, 0, 1.05*R, shieldCol, "#F8FAFC", innerCol, accentCol, t, ${v}) inside G.part!`,
      codeHint: 'upright heraldic float bobY=Math.sin(t*2.2)*0.028*R + pulsing emblem center',
    });
  }
  if (/\b(global\s*comm\w*|international|worldwide|globe|global|world|earth|continent)\b/.test(topic)) {
    return withPolish({
      label: `orbital global relay (v${v})`,
      helperName: 'globe',
      anatomyHint: `Call G.globe(0, 0, 0.50*R, sphereCol, lineCol, accentCol, "#F8FAFC", t, ${v}) inside G.part!`,
      codeHint: 'upright globe hover bobY=Math.sin(t*2.1)*0.025*R + meridian spin & orbital relay',
    });
  }
  if (/\b(megaphone|broadcast|announce\w*|marketing|campaign|publicity|loudspeaker)\b/.test(topic)) {
    return withPolish({
      label: `acoustic broadcast megaphone (v${v})`,
      helperName: 'megaphone',
      anatomyHint: `Call G.megaphone(0, 0, 1.05*R, coneCol, handleCol, accentCol, "#F8FAFC", t, ${v}) inside G.part!`,
      codeHint: 'recoil tilt rot=-0.04+Math.sin(t*3.0)*0.04 + expanding acoustic wave arcs',
    });
  }
  if (/\b(handshake|deal)\b/.test(topic)) {
    return withPolish({
      label: `executive handshake clasp (v${v})`,
      helperName: 'handshake',
      anatomyHint: `Call G.handshake(0, 0, 1.05*R, cL, cR, "#F59E0B", "#F8FAFC", "#1E293B", t, ${v}) inside G.part!`,
      codeHint: 'upright float bobY=Math.sin(t*2.4)*0.03*R + synchronized hand clasp motion',
    });
  }
  if (/\b(trophy|award|achievement|cup|winner|crown|medal|ribbon|badge|champion\w*|leaderboard)\b/.test(topic)) {
    return withPolish({
      label: `celebratory trophy crest (v${v})`,
      helperName: 'trophy',
      anatomyHint: `Call G.trophy(0, 0, 1.05*R, cupCol, baseCol, starCol, "#F8FAFC", t, ${v}) inside G.part!`,
      codeHint: 'upright float bobY=Math.sin(t*2.4)*0.03*R + pulsing victory star',
    });
  }
  if (/\b(telephone|phone\s*booth|payphone|landline|intercom|voip|telephony|chat|conversation|dialogue|messaging|communication|discussion|comment|helpdesk|call\s*center|hotline)\b/.test(topic)) {
    return withPolish({
      label: `speech dialogue communication (v${v})`,
      helperName: 'chat',
      anatomyHint: `Call G.chat(0, 0, 1.05*R, b1Col, b2Col, accentCol, "#F8FAFC", t, ${v}) inside G.part!`,
      codeHint: 'upright hover bobY=Math.sin(t*2.2)*0.028*R + animated dialogue wave dots',
    });
  }
  if (/\b(email|mail|envelope|inbox|newsletter|message)\b/.test(topic)) {
    return withPolish({
      label: `corporate envelope dispatch (v${v})`,
      helperName: 'envelope',
      anatomyHint: `Call G.envelope(0, 0, 1.05*R, bodyCol, flapCol, accentCol, "#F8FAFC", t, ${v}) inside G.part!`,
      codeHint: 'upright float bobY=Math.sin(t*2.4)*0.03*R + rising letter / seal pulse',
    });
  }
  if (/\b(negotiation|partnership|team|meeting|collaboration|networking|conference|boardroom|roundtable)\b/.test(topic)) {
    return withPolish({
      label: `team & partnership dialogue (v${v})`,
      helperName: 'negotiation',
      anatomyHint: `Call G.negotiation(0, 0, 1.05*R, p1Col, p2Col, accentCol, "#F8FAFC", t, ${v}) inside G.part!`,
      codeHint: 'upright float bobY=Math.sin(t*2.2)*0.028*R + synchronized agreement emblem',
    });
  }
  if (/\b(cash\s*flow|cashflow|transaction|transfer|payment|revenue|payroll|remittance|settlement|money|dollar|coin|currency|finance|investment|cash)\b/.test(topic)) {
    return withPolish({
      label: `minted cash flow coins (v${v})`,
      helperName: 'coinStack',
      anatomyHint: `Call G.coinStack(0, 0, 1.05*R, coinCol, sideCol, "#FFFFFF", "#F8FAFC", t, ${v}) inside G.part!`,
      codeHint: 'upright float bobY=Math.sin(t*2.2)*0.028*R + coin & star emblem pulse',
    });
  }
  if (/\b(briefcase|portfolio)\b/.test(topic)) {
    return withPolish({
      label: `executive briefcase float (v${v})`,
      helperName: 'briefcase',
      anatomyHint: `Call G.briefcase(0, 0, 1.05*R, bodyCol, flapCol, claspCol, "#F8FAFC", t, ${v}) inside G.part!`,
      codeHint: 'upright hover bobY=Math.sin(t*2.3)*0.03*R + hinged lid clasp articulation',
    });
  }
  if (/\b(target|bullseye|strategy|aim|dart|goal|okr)\b/.test(topic)) {
    return withPolish({
      label: `precision bullseye strike (v${v})`,
      helperName: 'target',
      anatomyHint: `Call G.target(0, 0, 1.05*R, outerCol, "#F8FAFC", dartCol, "#1E293B", t, ${v}) inside G.part!`,
      codeHint: 'upright hover bobY=Math.sin(t*2.2)*0.026*R + inward dart strike & bullseye pulse',
    });
  }
  if (/\b(analytics|chart|graph|metric|kpi|profit|growth|statistics|market\s*analysis|presentation|whiteboard|projector|pitch|slide|training)\b/.test(topic)) {
    return withPolish({
      label: `analytics growth dashboard (v${v})`,
      helperName: 'chart',
      anatomyHint: `Call G.chart(0, 0, 1.05*R, cardCol, bar1Col, bar2Col, arrowCol, "#F8FAFC", t, ${v}) inside G.part!`,
      codeHint: 'upright hover bobY=Math.sin(t*2.1)*0.028*R + live rising bars & upward arrow',
    });
  }
  if (/\b(puzzle|connect|integration|synergy)\b/.test(topic)) {
    return withPolish({
      label: `interlocked puzzle fit (v${v})`,
      helperName: 'puzzle',
      anatomyHint: `Call G.puzzle(0, 0, 1.05*R, p1Col, p2Col, accentCol, "#F8FAFC", t, ${v}) inside G.part!`,
      codeHint: 'upright hover bobY=Math.sin(t*2.2)*0.026*R + synchronized interlocking piece fit',
    });
  }
  if (/\b(calendar|event|schedule|roadmap|timeline|milestone)\b/.test(topic)) {
    return withPolish({
      label: `structured grid calendar (v${v})`,
      helperName: 'calendar',
      anatomyHint: `Call G.calendar(0, 0, 1.05*R, "#F8FAFC", topCol, accentCol, "#1E293B", t, ${v}) inside G.part!`,
      codeHint: 'upright float bobY=Math.sin(t*2.1)*0.026*R + active calendar cell animation',
    });
  }
  if (/\b(clock|deadline|timer|time|stopwatch)\b/.test(topic)) {
    return withPolish({
      label: `precision dial clock (v${v})`,
      helperName: 'clock',
      anatomyHint: `Call G.clock(0, 0, 1.05*R, bezelCol, faceCol, handCol, "#F8FAFC", t, ${v}) inside G.part!`,
      codeHint: 'upright float bobY=Math.sin(t*2.1)*0.028*R + sweeping clock hands',
    });
  }
  if (/\b(legal|law|justice|scale|scales|governance|balance|risk)\b/.test(topic)) {
    return withPolish({
      label: `balanced governance scales (v${v})`,
      helperName: 'scales',
      anatomyHint: `Call G.scales(0, 0, 1.05*R, beamCol, panCol, accentCol, "#F8FAFC", t, ${v}) inside G.part!`,
      codeHint: 'upright poise bobY=Math.sin(t*2.0)*0.024*R + balanced scale beam oscillation',
    });
  }
  if (/\b(compass|navigation|direction|journey|guide|explore)\b/.test(topic)) {
    return withPolish({
      label: `navigation dial compass (v${v})`,
      helperName: 'compass',
      anatomyHint: `Call G.compass(0, 0, 1.05*R, ringCol, dialCol, needleCol, "#F8FAFC", t, ${v}) inside G.part!`,
      codeHint: 'upright poise bobY=Math.sin(t*2.1)*0.026*R + oscillating compass needle',
    });
  }
  if (/\b(camera|photo|photography|video|studio|cinema|film|shutter|clapperboard)\b/.test(topic)) {
    return withPolish({
      label: `media camera shutter (v${v})`,
      helperName: 'camera',
      anatomyHint: `Call G.camera(0, 0, 1.05*R, bodyCol, lensCol, accentCol, "#F8FAFC", t, ${v}) inside G.part!`,
      codeHint: 'upright hover bobY=Math.sin(t*2.2)*0.026*R + pulsing optical aperture lens',
    });
  }

  // --- PRIORITY 3: CATEGORY-AWARE DOMAIN POOL FOR BROAD / GENERAL PROMPTS ---
  type HelperEntry = { name: string; call: (vv: number) => string };
  const makeEntry = (name: string, callFn: (vv: number) => string): HelperEntry => ({ name, call: callFn });

  const categoryPools: Array<{ test: RegExp; pool: HelperEntry[] }> = [
    {
      test: /(^|[\s_-])(medic\w*|health\w*|kesehatan|clinic\w*|hospital\w*|biotech\w*|pharma\w*)($|[\s_-])/,
      pool: [
        makeEntry('stethoscope', (vv) => `G.stethoscope(0, 0, 1.05*R, c2, c1, c3, "#F8FAFC", t, ${vv})`),
        makeEntry('heartbeat', (vv) => `G.heartbeat(0, 0, 1.05*R, c3, "#F8FAFC", c2, "#F8FAFC", t, ${vv})`),
        makeEntry('syringe', (vv) => `G.syringe(0, 0, 1.05*R, "#F8FAFC", c2, c3, "#1E293B", t, ${vv})`),
        makeEntry('dna', (vv) => `G.dna(0, 0, 1.05*R, c2, c1, c3, "#F8FAFC", t, ${vv})`),
        makeEntry('medical', (vv) => `G.medical(0, 0, 1.05*R, "#F8FAFC", c3, c2, "#1E293B", t, ${vv})`),
        makeEntry('microscope', (vv) => `G.microscope(0, 0, 1.05*R, c0, c2, c3, "#F8FAFC", t, ${vv})`),
      ],
    },
    {
      test: /(^|[\s_-])(edu\w*|pendidik\w*|sains|science|learn\w*|school|academic|edtech)($|[\s_-])/,
      pool: [
        makeEntry('book', (vv) => `G.book(0, 0, 1.05*R, c1, "#F8FAFC", c3, "#1E293B", t, ${vv})`),
        makeEntry('gradCap', (vv) => `G.gradCap(0, 0, 1.05*R, c0, "#F8FAFC", c3, c1, t, ${vv})`),
        makeEntry('atom', (vv) => `G.atom(0, 0, 1.05*R, c3, c2, c1, "#F8FAFC", t, ${vv})`),
        makeEntry('microscope', (vv) => `G.microscope(0, 0, 1.05*R, c0, c2, c3, "#F8FAFC", t, ${vv})`),
        makeEntry('flask', (vv) => `G.flask(0, 0, 1.05*R, c0, c2, c3, "#F8FAFC", t, ${vv})`),
        makeEntry('telescope', (vv) => `G.telescope(0, 0, 1.05*R, c1, c0, c3, "#F8FAFC", t, ${vv})`),
        makeEntry('lightbulb', (vv) => `G.lightbulb(0, 0, 1.05*R, c3, c2, c0, "#F8FAFC", t, ${vv})`),
      ],
    },
    {
      test: /(^|[\s_-])(game\w*|gaming|hibur\w*|entertain\w*|esport\w*|arcade|tabletop)($|[\s_-])/,
      pool: [
        makeEntry('gamepad', (vv) => `G.gamepad(0, 0, 1.05*R, c0, c1, c2, "#F8FAFC", t, ${vv})`),
        makeEntry('vrHeadset', (vv) => `G.vrHeadset(0, 0, 1.05*R, c0, c2, c3, "#F8FAFC", t, ${vv})`),
        makeEntry('dice', (vv) => `G.dice(0, 0, 1.05*R, c1, "#F8FAFC", c3, "#F8FAFC", t, ${vv})`),
        makeEntry('headphones', (vv) => `G.headphones(0, 0, 1.05*R, c1, c0, c2, "#F8FAFC", t, ${vv})`),
        makeEntry('trophy', (vv) => `G.trophy(0, 0, 1.05*R, c3, c0, "#FFFFFF", "#F8FAFC", t, ${vv})`),
        makeEntry('rocket', (vv) => `G.rocket(0, 0, 1.05*R, "#F8FAFC", c1, c3, c0, t, ${vv})`),
      ],
    },
    {
      test: /(^|[\s_-])(ui|ux|design\w*|grafis|creative|multimedia|art|graphic\w*|vector)($|[\s_-])/,
      pool: [
        makeEntry('palette', (vv) => `G.palette(0, 0, 1.05*R, c0, c3, c2, "#F8FAFC", t, ${vv})`),
        makeEntry('layers', (vv) => `G.layers(0, 0, 1.05*R, c2, c1, c0, "#F8FAFC", t, ${vv})`),
        makeEntry('ruler', (vv) => `G.ruler(0, 0, 1.05*R, c3, c1, c2, "#F8FAFC", t, ${vv})`),
        makeEntry('penTool', (vv) => `G.penTool(0, 0, 1.05*R, c1, c3, c2, "#F8FAFC", t, ${vv})`),
        makeEntry('uiLayout', (vv) => `G.uiLayout(0, 0, 1.05*R, c0, c1, c2, "#F8FAFC", t, ${vv})`),
        makeEntry('typography', (vv) => `G.typography(0, 0, 1.05*R, c0, "#F8FAFC", c2, "#F8FAFC", t, ${vv})`),
        makeEntry('camera', (vv) => `G.camera(0, 0, 1.05*R, c0, c2, c3, "#F8FAFC", t, ${vv})`),
      ],
    },
    {
      test: /(^|[\s_-])(ecolog\w*|green|energy|solar|wind|eco)($|[\s_-])/,
      pool: [
        makeEntry('battery', (vv) => `G.battery(0, 0, 1.05*R, c0, c2, c3, "#F8FAFC", t, ${vv})`),
        makeEntry('globe', (vv) => `G.globe(0, 0, 0.50*R, c1, c2, c3, "#F8FAFC", t, ${vv})`),
        makeEntry('lightbulb', (vv) => `G.lightbulb(0, 0, 1.05*R, c3, c2, c0, "#F8FAFC", t, ${vv})`),
        makeEntry('atom', (vv) => `G.atom(0, 0, 1.05*R, c3, c2, c1, "#F8FAFC", t, ${vv})`),
      ],
    },
    {
      test: /(^|[\s_-])(secur\w*|cyber\w*|privasi|protect\w*)($|[\s_-])/,
      pool: [
        makeEntry('shield', (vv) => `G.shield(0, 0, 1.05*R, c0, "#F8FAFC", c1, c3, t, ${vv})`),
        makeEntry('lock', (vv) => `G.lock(0, 0, 1.05*R, c0, c2, c3, "#F8FAFC", t, ${vv})`),
        makeEntry('key', (vv) => `G.key(0, 0, 1.05*R, c3, c1, c2, "#F8FAFC", t, ${vv})`),
        makeEntry('server', (vv) => `G.server(0, 0, 1.05*R, c0, c2, c3, "#F8FAFC", t, ${vv})`),
      ],
    },
    {
      test: /(^|[\s_-])(social\w*|communicat\w*|komunikasi|telecom\w*|media\s*sosial)($|[\s_-])/,
      pool: [
        makeEntry('chat', (vv) => `G.chat(0, 0, 1.05*R, c1, c2, c3, "#F8FAFC", t, ${vv})`),
        makeEntry('megaphone', (vv) => `G.megaphone(0, 0, 1.05*R, c2, c0, c3, "#F8FAFC", t, ${vv})`),
        makeEntry('satellite', (vv) => `G.satellite(0, 0, 1.05*R, c0, c1, c2, "#F8FAFC", t, ${vv})`),
        makeEntry('globe', (vv) => `G.globe(0, 0, 0.50*R, c1, c2, c3, "#F8FAFC", t, ${vv})`),
        makeEntry('envelope', (vv) => `G.envelope(0, 0, 1.05*R, "#F8FAFC", c1, c3, "#1E293B", t, ${vv})`),
        makeEntry('bell', (vv) => `G.bell(0, 0, 1.05*R, c3, c1, c2, "#F8FAFC", t, ${vv})`),
        makeEntry('headphones', (vv) => `G.headphones(0, 0, 1.05*R, c1, c0, c2, "#F8FAFC", t, ${vv})`),
      ],
    },
    {
      test: /(^|[\s_-])(tech\w*|ai|teknologi|data|software|digital|robot\w*|cloud)($|[\s_-])/,
      pool: [
        makeEntry('chip', (vv) => `G.chip(0, 0, 1.05*R, c0, c1, c2, "#F8FAFC", t, ${vv})`),
        makeEntry('robot', (vv) => `G.robot(0, 0, 1.05*R, c0, c1, c2, "#F8FAFC", t, ${vv})`),
        makeEntry('network', (vv) => `G.network(0, 0, 1.05*R, c1, c2, c3, "#F8FAFC", t, ${vv})`),
        makeEntry('server', (vv) => `G.server(0, 0, 1.05*R, c0, c2, c3, "#F8FAFC", t, ${vv})`),
        makeEntry('cloudSync', (vv) => `G.cloudSync(0, 0, 1.05*R, c1, c3, "#F8FAFC", t, ${vv})`),
        makeEntry('satellite', (vv) => `G.satellite(0, 0, 1.05*R, c0, c1, c2, "#F8FAFC", t, ${vv})`),
        makeEntry('drone', (vv) => `G.drone(0, 0, 1.05*R, c0, c2, c3, "#F8FAFC", t, ${vv})`),
        makeEntry('atom', (vv) => `G.atom(0, 0, 1.05*R, c3, c2, c1, "#F8FAFC", t, ${vv})`),
      ],
    },
  ];

  const defaultPool: HelperEntry[] = [
    makeEntry('chart', (vv) => `G.chart(0, 0, 1.05*R, c0, c1, c2, c3, "#F8FAFC", t, ${vv})`),
    makeEntry('uiLayout', (vv) => `G.uiLayout(0, 0, 1.05*R, c0, c1, c2, "#F8FAFC", t, ${vv})`),
    makeEntry('briefcase', (vv) => `G.briefcase(0, 0, 1.05*R, c0, c1, c3, "#F8FAFC", t, ${vv})`),
    makeEntry('target', (vv) => `G.target(0, 0, 1.05*R, c1, "#F8FAFC", c3, c0, t, ${vv})`),
    makeEntry('rocket', (vv) => `G.rocket(0, 0, 1.05*R, "#F8FAFC", c1, c3, c0, t, ${vv})`),
    makeEntry('coinStack', (vv) => `G.coinStack(0, 0, 1.05*R, c3, c1, "#FFFFFF", "#F8FAFC", t, ${vv})`),
    makeEntry('shield', (vv) => `G.shield(0, 0, 1.05*R, c0, "#F8FAFC", c1, c3, t, ${vv})`),
  ];

  const subNorm = sub.replace(/[_-]+/g, ' ');
  const matchedPool =
    categoryPools.find((c) => c.test.test(subNorm))?.pool ||
    categoryPools.find((c) => c.test.test(topic))?.pool ||
    defaultPool;
  const chosenEntry = matchedPool[(absTopicHash + v) % matchedPool.length];
  const fallbackCall = chosenEntry.call(v);

  if (overrideMode && overrideMode !== 'auto') {
    const legacy: Record<string, string> = {
      bounce: 'bobY=-Math.abs(Math.sin(t*2.8))*0.05*R, sc=1+0.03*Math.cos(t*2.8)',
      orbital: 'bobY=Math.sin(t*2.1)*0.028*R, rot=Math.sin(t*1.6)*0.035',
      morph: 'bobY=Math.sin(t*2.3)*0.028*R, sx=1+0.025*Math.sin(t*2.6), sy=1-0.025*Math.sin(t*2.6)',
      cyber: 'bobY=Math.sin(t*2.4)*0.025*R, rot=Math.sin(t*1.8)*0.025',
      mechanical: 'bobY=Math.sin(t*2.2)*0.025*R, rot=Math.sin(t*2.0)*0.04',
      flow: 'bobY=Math.sin(t*2.4)*0.032*R, rot=Math.sin(t*1.6)*0.03',
    };
    if (legacy[overrideMode]) {
      return withPolish({
        label: `${chosenEntry.name} ${overrideMode} (v${v})`,
        helperName: chosenEntry.name,
        anatomyHint: `Call ${fallbackCall} (or the closest matching G.<hero> at s=1.05*R with t,${v}) inside G.part! NEVER scatter tiny disconnected dots or overlapping circles.`,
        codeHint: legacy[overrideMode],
      });
    }
  }

  return withPolish({
    label: `${chosenEntry.name} icon motion (v${v})`,
    helperName: chosenEntry.name,
    anatomyHint: `Call ${fallbackCall} (or the closest matching G.<hero> at s=1.05*R with t,${v}) inside G.part! NEVER scatter loose disconnected circles/boxes.`,
    codeHint: 'upright bobY=Math.sin(t*2.2)*0.03*R, rot=Math.sin(t*1.5)*0.028 + internal t-driven motion',
  });
}
