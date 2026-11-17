// Shared Canvas 2D Motion Geometry Engine, Seed Variation DNA & Prompt-to-Motion Resolver
// Single Source of Truth used by both client (geminiService.ts) and server (server/app.ts).

import { ENGINE_BASE_PRIMITIVES_JS, ENGINE_HERO_ICONS_A_JS } from './motionEngineIconsA';
import { ENGINE_HERO_ICONS_B_JS, ENGINE_BG_HELPERS_JS } from './motionEngineIconsB';

export const STUDIO_GEOMETRY_ENGINE_JS = `${ENGINE_BASE_PRIMITIVES_JS}${ENGINE_HERO_ICONS_A_JS}${ENGINE_HERO_ICONS_B_JS}${ENGINE_BG_HELPERS_JS}
    };`;

export const HELPERS_G_BASE_DOC =
  'G.grad(c1,c2,c3,x0,y0,x1,y1) | G.box(x,y,bw,bh,r,f,rim,lw) | G.bar(x,yB,bw,bh,r,f,rim,lw) | G.capsule(x,y,bw,bh,f,rim,lw) | G.disc(x,y,r,f,rim,lw) | G.oval(x,y,rx,ry,rot,f,rim,lw) | G.ring(x,y,r,th,a0,a1,col) | G.poly(pts,f,rim,lw,cl) | G.ngon(x,y,r,n,rot,f,rim) | G.star(x,y,ro,ri,n,rot,f,rim) | G.pill(x1,y1,x2,y2,th,col) | G.arrow(x1,y1,x2,y2,th,hL,col) | G.person(x,y,s,b,h,rim) | G.check(x,y,s,th,col) | G.pie(x,y,r,a0,sw,sC,bC,rim) | G.rays(x,y,rI,rO,n,rot,th,col) | G.part(tx,ty,rot,sx,sy,fn)';

export const HELPERS_G_HERO_DOC =
  'HERO G (s=1.05*R,...,t,v=0..5): G.uiLayout | G.videoCall | G.laptop | G.checklist | G.rocket | G.lightbulb | G.chart | G.magnifier | G.pieChart | G.gears | G.userBadge | G.typography | G.briefcase | G.trophy | G.clock | G.lock | G.cloudSync | G.robot | G.chip | G.coinStack | G.handshake | G.shield | G.cart | G.megaphone | G.wallet | G.globe | G.building | G.document | G.folder | G.target | G.envelope | G.chat | G.network | G.server | G.calendar | G.candlestick | G.desk | G.negotiation | G.medical | G.delivery | G.puzzle | G.bell | G.calculator | G.scales | G.compass | G.camera';

export const HELPERS_G_BG_DOC =
  'BG G (full-frame 0..w,0..h): G.bgWaves(w,h,c1,c2,c3,t,v) | G.bgGrid(w,h,c1,c2,c3,t,v) | G.bgGeo(w,h,c1,c2,c3,t,v)';

export const HELPERS_G_DOC = `${HELPERS_G_BASE_DOC} | ${HELPERS_G_HERO_DOC}`;

export const HELPERS_G_VISION_DOC = `${HELPERS_G_BASE_DOC} | G.handshake | G.shield | G.cart | G.megaphone | G.wallet | G.globe | G.building | G.document | G.folder | G.target | G.envelope | G.chat | G.network | G.server | G.calendar | G.candlestick | G.desk | G.negotiation | G.medical | G.delivery | G.puzzle | G.bell | G.calculator | G.scales | G.compass | G.camera | G.uiLayout | G.videoCall | G.laptop | G.checklist | G.rocket | G.lightbulb | G.chart | G.magnifier | G.pieChart | G.gears | G.userBadge | G.typography | G.briefcase | G.trophy | G.clock | G.lock | G.cloudSync | G.robot | G.chip | G.coinStack`;

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
  const timeMix = Date.now() ^ Math.floor(Math.random() * 1000003) ^ (__variationSeq * 2654435761);
  const absMix = Math.abs(timeMix + topicHash);
  const slot = Math.max(0, Math.floor(slotIndex));
  const salt = Math.max(0, Math.floor(forceSalt));

  const variantIdx = (bucketSeq + slot + salt) % 6;
  const compMode = (bucketSeq + slot * 2 + salt) % 3;
  const paletteIdx = (absMix + bucketSeq * 3 + slot * 5 + salt * 7) % VARIATION_PALETTES.length;
  const motionIdx = (bucketSeq + slot * 2 + salt * 3 + (absMix >> 4)) % VARIATION_MOTIONS.length;
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
  anatomyHint: string;
  codeHint: string;
}

export function resolvePromptMotionPlan(
  promptTopic: string,
  type: 'icon' | 'bg' | string,
  _style?: string,
  overrideMode?: string,
  variantIdx: number = 0,
  compMode: number = 0
): PromptMotionPlan {
  const v = Math.abs(Math.floor(variantIdx || 0)) % 6;
  const cm = Math.abs(Math.floor(compMode || 0)) % 3;
  const topic = (promptTopic || '').toLowerCase();

  if (type === 'bg') {
    if (/\b(grid|cyber|matrix|network|tech|circuit|wireframe|digital|future|perspective|mesh)\b/.test(topic)) {
      return {
        label: `cyber wireframe grid (v${v})`,
        anatomyHint: `Call G.bgGrid(w, h, c1, c2, c3, t, ${v}) directly in drawFrame (full-frame 0..w, 0..h)!`,
        codeHint: 'seamless scrolling perspective/grid telemetry lattice across full canvas',
      };
    }
    if (/\b(geo|geometric|minimal|ribbon|bar|hexagon|hex|polygon|triangle|shape|abstract)\b/.test(topic)) {
      return {
        label: `geometric rhythm field (v${v})`,
        anatomyHint: `Call G.bgGeo(w, h, c1, c2, c3, t, ${v}) directly in drawFrame (full-frame 0..w, 0..h)!`,
        codeHint: 'gliding geometric capsules/hexagons + central harmonic orbital ring across full canvas',
      };
    }
    return {
      label: `full-frame harmonic waves (v${v})`,
      anatomyHint: `Call G.bgWaves(w, h, c1, c2, c3, t, ${v}) directly in drawFrame (full-frame 0..w, 0..h)!`,
      codeHint: 'layered smooth cosine ribbon waves drifting seamlessly across 0..w, 0..h',
    };
  }

  // Secondary kinetic polish NEVER replaces the cohesive hero helper (prevents random detached primitives!)
  const withPolish = (plan: PromptMotionPlan): PromptMotionPlan => {
    if (cm === 1) {
      return {
        label: `${plan.label} + pulse`,
        anatomyHint: plan.anatomyHint,
        codeHint: `${plan.codeHint} + smooth subtle scale breathe sx=sy=1+0.022*Math.sin(t*2.6)`,
      };
    }
    if (cm === 2) {
      return {
        label: `${plan.label} + counter-sway`,
        anatomyHint: plan.anatomyHint,
        codeHint: `${plan.codeHint} + gentle counter-tilt rot=Math.sin(t*1.5)*0.03`,
      };
    }
    return plan;
  };

  if (/\b(video\s*conferenc\w*|video\s*call\w*|teleconferenc\w*|webinar\w*|zoom\s*call|online\s*meeting|virtual\s*meeting)\b/.test(topic)) {
    return withPolish({
      label: `video conference display (v${v})`,
      anatomyHint: `Call G.videoCall(0, 0, 1.05*R, frameCol, tileCol, accentCol, "#F8FAFC", t, ${v}) inside G.part!`,
      codeHint: 'upright monitor float bobY=Math.sin(t*2.1)*0.025*R, rot=Math.sin(t*1.4)*0.025 + active tile pulse',
    });
  }
  if (/\b(office\s+desk|desk|workstation|workspace|cubicle|study\s+table)\b/.test(topic)) {
    return withPolish({
      label: `organized desk workstation (v${v})`,
      anatomyHint: `Call G.desk(0, 0, 1.05*R, deskCol, screenCol, accentCol, "#F8FAFC", t, ${v}) inside G.part!`,
      codeHint: 'upright desk workstation bobY=Math.sin(t*2.1)*0.025*R + live monitor screen motion',
    });
  }
  if (/\b(candlestick|trading|stock\s*market|forex|crypto|bitcoin|exchange)\b/.test(topic)) {
    return withPolish({
      label: `market candlestick chart (v${v})`,
      anatomyHint: `Call G.candlestick(0, 0, 1.05*R, frameCol, bullCol, bearCol, "#F8FAFC", t, ${v}) inside G.part!`,
      codeHint: 'upright trading float bobY=Math.sin(t*2.1)*0.025*R + animated candlestick bar motion',
    });
  }
  if (/\b(contract|agreement|invoice|receipt|certificate|policy|report|annual\s*report|document|resume|cv|audit|compliance|tax\s*form)\b/.test(topic)) {
    return withPolish({
      label: `executive document seal (v${v})`,
      anatomyHint: `Call G.document(0, 0, 1.05*R, "#F8FAFC", headerCol, accentCol, "#1E293B", t, ${v}) inside G.part!`,
      codeHint: 'upright float bobY=Math.sin(t*2.1)*0.025*R + internal highlight scan & badge pulse',
    });
  }
  if (/\b(folder|archive|directory|binder|filing|repository)\b/.test(topic)) {
    return withPolish({
      label: `tabbed archive folder (v${v})`,
      anatomyHint: `Call G.folder(0, 0, 1.05*R, backCol, frontCol, accentCol, "#F8FAFC", t, ${v}) inside G.part!`,
      codeHint: 'upright hover bobY=Math.sin(t*2.2)*0.028*R + smooth vertical card peek inside folder',
    });
  }
  if (/\b(building|skyscraper|tower|headquarters|architecture|real\s*estate|bank|treasury|lending|institution)\b|\boffice\s+building\b|\bcorporate\s+building\b/.test(topic)) {
    return withPolish({
      label: `corporate headquarters (v${v})`,
      anatomyHint: `Call G.building(0, 0, 1.05*R, bodyCol, winCol, accentCol, "#F8FAFC", t, ${v}) inside G.part!`,
      codeHint: 'upright architectural float bobY=Math.sin(t*1.9)*0.022*R + window illumination wave',
    });
  }
  if (/\b(calculator|accounting|bookkeeping|budgeting|expense)\b/.test(topic)) {
    return withPolish({
      label: `financial calculator console (v${v})`,
      anatomyHint: `Call G.calculator(0, 0, 1.05*R, bodyCol, screenCol, btnCol, "#F8FAFC", t, ${v}) inside G.part!`,
      codeHint: 'upright hover bobY=Math.sin(t*2.2)*0.026*R + sequential glowing key pulse',
    });
  }
  if (/\b(network|nodes|blockchain|api|mesh|topology|ecosystem)\b/.test(topic)) {
    return withPolish({
      label: `connected network topology (v${v})`,
      anatomyHint: `Call G.network(0, 0, 1.05*R, coreCol, nodeCol, linkCol, "#F8FAFC", t, ${v}) inside G.part!`,
      codeHint: 'upright float bobY=Math.sin(t*2.0)*0.025*R + orbiting/pulsing nodes along links',
    });
  }
  if (/\b(server|database|sql|hosting|datacenter|rack)\b/.test(topic)) {
    return withPolish({
      label: `stacked server cluster (v${v})`,
      anatomyHint: `Call G.server(0, 0, 1.05*R, rackCol, ledCol, accentCol, "#F8FAFC", t, ${v}) inside G.part!`,
      codeHint: 'upright float bobY=Math.sin(t*2.1)*0.025*R + sequential LED telemetry scan',
    });
  }
  if (/\b(laptop|notebook|macbook|ultrabook|computer|desktop|monitor|screen)\b/.test(topic)) {
    return withPolish({
      label: `laptop workstation (v${v})`,
      anatomyHint: `Call G.laptop(0, 0, 1.05*R, bodyCol, "#0F172A", accentCol, "#F8FAFC", t, ${v}) inside G.part!`,
      codeHint: 'upright hover bobY=Math.sin(t*2.2)*0.028*R, rot=Math.sin(t*1.5)*0.025 + internal screen animation',
    });
  }
  if (/\b(ui\s*layout|ui|ux|wireframe|interface|app\s*design|landing\s*page|mockup|website|web\s*app|software|code)\b/.test(topic)) {
    return withPolish({
      label: `interactive UI layout (v${v})`,
      anatomyHint: `Call G.uiLayout(0, 0, 1.05*R, frameCol, headerCol, accentCol, "#F8FAFC", t, ${v}) inside G.part!`,
      codeHint: 'upright hover bobY=Math.sin(t*2.2)*0.028*R + animated UI blocks & progress bars',
    });
  }
  if (/\b(hiring|recruit\w*|talent|candidate|hr|human\s*resources|interview|onboarding|staffing|leadership|executive|leader|manager|ceo|mentor|customer|support|people|person|user|avatar)\b/.test(topic)) {
    return withPolish({
      label: `talent & leadership badge (v${v})`,
      anatomyHint: `Call G.userBadge(0, 0, 1.05*R, cardCol, personCol, accentCol, "#F8FAFC", t, ${v}) inside G.part!`,
      codeHint: 'upright hover bobY=Math.sin(t*2.2)*0.028*R + verification crest & bar pulse',
    });
  }
  if (/\b(productivity|efficiency|checklist|todo|to-do|task\s*management|kanban|sprint|workflow)\b/.test(topic)) {
    return withPolish({
      label: `task checklist flow (v${v})`,
      anatomyHint: `Call G.checklist(0, 0, 1.05*R, boardCol, clipCol, accentCol, "#F8FAFC", t, ${v}) inside G.part!`,
      codeHint: 'upright hover bobY=Math.sin(t*2.2)*0.028*R + sequential animated task bars',
    });
  }
  if (/\b(typography|font|lettering|typeface|editorial|copywriting|graphic\s*design|artboard|branding|vector)\b/.test(topic)) {
    return withPolish({
      label: `editorial typography artboard (v${v})`,
      anatomyHint: `Call G.typography(0, 0, 1.05*R, cardCol, inkCol, accentCol, "#F8FAFC", t, ${v}) inside G.part!`,
      codeHint: 'upright hover bobY=Math.sin(t*2.2)*0.026*R + baseline cursor glide',
    });
  }
  if (/\b(pie\s*chart|pie|donut|market\s*share|allocation|budget\s*breakdown|proportion)\b/.test(topic)) {
    return withPolish({
      label: `segmented pie chart (v${v})`,
      anatomyHint: `Call G.pieChart(0, 0, 1.05*R, baseCol, s1Col, s2Col, s3Col, "#F8FAFC", t, ${v}) inside G.part!`,
      codeHint: 'upright float bobY=Math.sin(t*2.2)*0.028*R + active pie slice expansion',
    });
  }
  if (/\b(market\s*research|research|survey|discovery|inspect\w*|seo|search|magnifying|investigat\w*)\b/.test(topic)) {
    return withPolish({
      label: `optical lens research scan (v${v})`,
      anatomyHint: `Call G.magnifier(0, 0, 1.05*R, cardCol, lensCol, handleCol, accentCol, "#F8FAFC", t, ${v}) inside G.part!`,
      codeHint: 'upright hover bobY=Math.sin(t*2.1)*0.025*R + smooth circular lens sweep',
    });
  }
  if (/\b(entrepreneur\w*|startup|launch|venture|founder|rocket|boost|scaleup|scale-up|accelerate)\b/.test(topic)) {
    return withPolish({
      label: `ascendant rocket launch (v${v})`,
      anatomyHint: `Call G.rocket(0, 0, 1.05*R, hullCol, wingCol, flameCol, "#F8FAFC", t, ${v}) inside G.part(cx, cy+bobY, -0.16+rot, 1, 1, fn)!`,
      codeHint: 'dynamic thrust bobY=Math.sin(t*3.0)*0.038*R + angled ascent & live exhaust flame',
    });
  }
  if (/\b(opportunity|breakthrough|lightbulb|idea|bulb|innovation|creative|spark|brainstorm|insight|vision)\b/.test(topic)) {
    return withPolish({
      label: `radiant idea lightbulb (v${v})`,
      anatomyHint: `Call G.lightbulb(0, 0, 1.05*R, bulbCol, rayCol, baseCol, "#F8FAFC", t, ${v}) inside G.part!`,
      codeHint: 'upright float bobY=Math.sin(t*2.3)*0.03*R + rhythmic radial ray glow',
    });
  }
  if (/\b(shopping\s*cart|cart|trolley|ecommerce|e-commerce|checkout|retail|marketplace)\b/.test(topic)) {
    return withPolish({
      label: `e-commerce shopping cart (v${v})`,
      anatomyHint: `Call G.cart(0, 0, 1.05*R, bodyCol, wheelCol, accentCol, "#F8FAFC", t, ${v}) inside G.part!`,
      codeHint: 'gentle horizontal glide offsetX=Math.sin(t*2.2)*0.04*R + internal parcel settle',
    });
  }
  if (/\b(procurement|purchase|order|supply\s*chain|inventory|warehouse|logistics|truck|drone|cargo|delivery|shipping|parcel|courier)\b/.test(topic)) {
    return withPolish({
      label: `express logistics delivery (v${v})`,
      anatomyHint: `Call G.delivery(0, 0, 1.05*R, truckCol, cargoCol, accentCol, "#F8FAFC", t, ${v}) inside G.part!`,
      codeHint: 'suspension glide bobY=Math.sin(t*2.8)*0.025*R + forward cargo & wheel roll',
    });
  }
  if (/\b(digital\s*wallet|e-wallet|wallet|purse|mobile\s*pay|fintech)\b/.test(topic)) {
    return withPolish({
      label: `digital wallet reveal (v${v})`,
      anatomyHint: `Call G.wallet(0, 0, 1.05*R, bodyCol, flapCol, claspCol, "#F8FAFC", t, ${v}) inside G.part!`,
      codeHint: 'upright hover bobY=Math.sin(t*2.2)*0.028*R + smooth card reveal & clasp pulse',
    });
  }
  if (/\b(reputation|trust|credibility|review|rating|endorsement|testimonial|brand\s*image|shield|protection|firewall|cybersecurity|antivirus)\b/.test(topic)) {
    return withPolish({
      label: `shield trust crest (v${v})`,
      anatomyHint: `Call G.shield(0, 0, 1.05*R, shieldCol, "#F8FAFC", innerCol, accentCol, t, ${v}) inside G.part!`,
      codeHint: 'upright heraldic float bobY=Math.sin(t*2.2)*0.028*R + pulsing emblem center',
    });
  }
  if (/\b(global\s*comm\w*|international|worldwide|globe|global|world|earth|continent)\b/.test(topic)) {
    return withPolish({
      label: `orbital global relay (v${v})`,
      anatomyHint: `Call G.globe(0, 0, 0.50*R, sphereCol, lineCol, accentCol, "#F8FAFC", t, ${v}) inside G.part!`,
      codeHint: 'upright globe hover bobY=Math.sin(t*2.1)*0.025*R + meridian spin & orbital relay',
    });
  }
  if (/\b(megaphone|broadcast|announce\w*|marketing|campaign|publicity|loudspeaker)\b/.test(topic)) {
    return withPolish({
      label: `acoustic broadcast megaphone (v${v})`,
      anatomyHint: `Call G.megaphone(0, 0, 1.05*R, coneCol, handleCol, accentCol, "#F8FAFC", t, ${v}) inside G.part!`,
      codeHint: 'recoil tilt rot=-0.04+Math.sin(t*3.0)*0.04 + expanding acoustic wave arcs',
    });
  }
  if (/\b(handshake|deal)\b/.test(topic)) {
    return withPolish({
      label: `executive handshake clasp (v${v})`,
      anatomyHint: `Call G.handshake(0, 0, 1.05*R, cL, cR, "#F59E0B", "#F8FAFC", "#1E293B", t, ${v}) inside G.part!`,
      codeHint: 'upright float bobY=Math.sin(t*2.4)*0.03*R + synchronized hand clasp motion',
    });
  }
  if (/\b(trophy|award|achievement|cup|winner|crown|medal|ribbon|badge)\b/.test(topic)) {
    return withPolish({
      label: `celebratory trophy crest (v${v})`,
      anatomyHint: `Call G.trophy(0, 0, 1.05*R, cupCol, baseCol, starCol, "#F8FAFC", t, ${v}) inside G.part!`,
      codeHint: 'upright float bobY=Math.sin(t*2.4)*0.03*R + pulsing victory star',
    });
  }
  if (/\b(chat|conversation|dialogue|messaging|communication|telecom|discussion|comment|headset|helpdesk|call\s*center|hotline)\b/.test(topic)) {
    return withPolish({
      label: `speech dialogue communication (v${v})`,
      anatomyHint: `Call G.chat(0, 0, 1.05*R, b1Col, b2Col, accentCol, "#F8FAFC", t, ${v}) inside G.part!`,
      codeHint: 'upright hover bobY=Math.sin(t*2.2)*0.028*R + animated dialogue wave dots',
    });
  }
  if (/\b(email|mail|envelope|inbox|newsletter|message)\b/.test(topic)) {
    return withPolish({
      label: `corporate envelope dispatch (v${v})`,
      anatomyHint: `Call G.envelope(0, 0, 1.05*R, bodyCol, flapCol, accentCol, "#F8FAFC", t, ${v}) inside G.part!`,
      codeHint: 'upright float bobY=Math.sin(t*2.4)*0.03*R + rising letter / seal pulse',
    });
  }
  if (/\b(negotiation|partnership|team|meeting|collaboration|networking|conference|boardroom|roundtable)\b/.test(topic)) {
    return withPolish({
      label: `team & partnership dialogue (v${v})`,
      anatomyHint: `Call G.negotiation(0, 0, 1.05*R, p1Col, p2Col, accentCol, "#F8FAFC", t, ${v}) inside G.part!`,
      codeHint: 'upright float bobY=Math.sin(t*2.2)*0.028*R + synchronized agreement emblem',
    });
  }
  if (/\b(cash\s*flow|cashflow|transaction|transfer|payment|revenue|payroll|remittance|settlement|money|dollar|coin|currency|finance|investment|cash)\b/.test(topic)) {
    return withPolish({
      label: `minted cash flow coins (v${v})`,
      anatomyHint: `Call G.coinStack(0, 0, 1.05*R, coinCol, sideCol, "#FFFFFF", "#F8FAFC", t, ${v}) inside G.part!`,
      codeHint: 'upright float bobY=Math.sin(t*2.2)*0.028*R + coin & star emblem pulse',
    });
  }
  if (/\b(briefcase|portfolio)\b/.test(topic)) {
    return withPolish({
      label: `executive briefcase float (v${v})`,
      anatomyHint: `Call G.briefcase(0, 0, 1.05*R, bodyCol, flapCol, claspCol, "#F8FAFC", t, ${v}) inside G.part!`,
      codeHint: 'upright hover bobY=Math.sin(t*2.3)*0.03*R + hinged lid clasp articulation',
    });
  }
  if (/\b(target|bullseye|strategy|aim|dart|goal|okr)\b/.test(topic)) {
    return withPolish({
      label: `precision bullseye strike (v${v})`,
      anatomyHint: `Call G.target(0, 0, 1.05*R, outerCol, "#F8FAFC", dartCol, "#1E293B", t, ${v}) inside G.part!`,
      codeHint: 'upright hover bobY=Math.sin(t*2.2)*0.026*R + inward dart strike & bullseye pulse',
    });
  }
  if (/\b(analytics|dashboard|chart|graph|metric|kpi|profit|growth|statistics|market\s*analysis|presentation|whiteboard|projector|pitch|slide|training)\b/.test(topic)) {
    return withPolish({
      label: `analytics growth dashboard (v${v})`,
      anatomyHint: `Call G.chart(0, 0, 1.05*R, cardCol, bar1Col, bar2Col, arrowCol, "#F8FAFC", t, ${v}) inside G.part!`,
      codeHint: 'upright hover bobY=Math.sin(t*2.1)*0.028*R + live rising bars & upward arrow',
    });
  }
  if (/\b(puzzle|connect|link|integration|synergy)\b/.test(topic)) {
    return withPolish({
      label: `interlocked puzzle fit (v${v})`,
      anatomyHint: `Call G.puzzle(0, 0, 1.05*R, p1Col, p2Col, accentCol, "#F8FAFC", t, ${v}) inside G.part!`,
      codeHint: 'upright hover bobY=Math.sin(t*2.2)*0.026*R + synchronized interlocking piece fit',
    });
  }
  if (/\b(calendar|event|schedule|roadmap|timeline|milestone)\b/.test(topic)) {
    return withPolish({
      label: `structured grid calendar (v${v})`,
      anatomyHint: `Call G.calendar(0, 0, 1.05*R, "#F8FAFC", topCol, accentCol, "#1E293B", t, ${v}) inside G.part!`,
      codeHint: 'upright float bobY=Math.sin(t*2.1)*0.026*R + active calendar cell animation',
    });
  }
  if (/\b(clock|deadline|timer|time)\b/.test(topic)) {
    return withPolish({
      label: `precision dial clock (v${v})`,
      anatomyHint: `Call G.clock(0, 0, 1.05*R, bezelCol, faceCol, handCol, "#F8FAFC", t, ${v}) inside G.part!`,
      codeHint: 'upright float bobY=Math.sin(t*2.1)*0.028*R + sweeping clock hands',
    });
  }
  if (/\b(bell|alarm|siren|alert|notification|reminder)\b/.test(topic)) {
    return withPolish({
      label: `acoustic ring bell (v${v})`,
      anatomyHint: `Call G.bell(0, 0, 1.05*R, bellCol, clapperCol, accentCol, "#F8FAFC", t, ${v}) inside G.part!`,
      codeHint: 'pendulum swing rot=Math.sin(t*3.2)*0.06 + opposite clapper swing',
    });
  }
  if (/\b(heart|pulse|ecg|cardiogram|dna|pill|capsule|syringe|medical|stethoscope|health|wellness|clinic|hospital|pharmacy)\b/.test(topic)) {
    return withPolish({
      label: `medical wellness pulse (v${v})`,
      anatomyHint: `Call G.medical(0, 0, 1.05*R, "#F8FAFC", crossCol, accentCol, "#1E293B", t, ${v}) inside G.part!`,
      codeHint: 'double-beat cardiac pulse + clean medical cross / waveform beat',
    });
  }
  if (/\b(lock|padlock|vault|key|fingerprint|biometric|security|safe)\b/.test(topic)) {
    return withPolish({
      label: `precision security lock (v${v})`,
      anatomyHint: `Call G.lock(0, 0, 1.05*R, bodyCol, shackleCol, accentCol, "#F8FAFC", t, ${v}) inside G.part!`,
      codeHint: 'upright hover bobY=Math.sin(t*2.2)*0.028*R + smooth vertical shackle lock recoil',
    });
  }
  if (/\b(gear|settings|cog|automation|operations|engineering|system|process)\b/.test(topic)) {
    return withPolish({
      label: `meshed cog rotation (v${v})`,
      anatomyHint: `Call G.gears(0, 0, 1.05*R, g1Col, g2Col, coreCol, "#F8FAFC", t, ${v}) inside G.part!`,
      codeHint: 'upright float bobY=Math.sin(t*2.0)*0.025*R + counter-rotating meshed cogwheels',
    });
  }
  if (/\b(legal|law|justice|scale|scales|governance|balance|risk)\b/.test(topic)) {
    return withPolish({
      label: `balanced governance scales (v${v})`,
      anatomyHint: `Call G.scales(0, 0, 1.05*R, beamCol, panCol, accentCol, "#F8FAFC", t, ${v}) inside G.part!`,
      codeHint: 'upright poise bobY=Math.sin(t*2.0)*0.024*R + balanced scale beam oscillation',
    });
  }
  if (/\b(compass|navigation|direction|journey|guide|explore)\b/.test(topic)) {
    return withPolish({
      label: `navigation dial compass (v${v})`,
      anatomyHint: `Call G.compass(0, 0, 1.05*R, ringCol, dialCol, needleCol, "#F8FAFC", t, ${v}) inside G.part!`,
      codeHint: 'upright poise bobY=Math.sin(t*2.1)*0.026*R + oscillating compass needle',
    });
  }
  if (/\b(camera|photo|photography|video|studio|media|cinema|film)\b/.test(topic)) {
    return withPolish({
      label: `media camera shutter (v${v})`,
      anatomyHint: `Call G.camera(0, 0, 1.05*R, bodyCol, lensCol, accentCol, "#F8FAFC", t, ${v}) inside G.part!`,
      codeHint: 'upright hover bobY=Math.sin(t*2.2)*0.026*R + pulsing optical aperture lens',
    });
  }
  if (/\b(chip|cpu|processor|circuit|microchip|semiconductor|hardware)\b/.test(topic)) {
    return withPolish({
      label: `silicon processor chip (v${v})`,
      anatomyHint: `Call G.chip(0, 0, 1.05*R, pkgCol, pinCol, coreCol, "#F8FAFC", t, ${v}) inside G.part!`,
      codeHint: 'upright tech float bobY=Math.sin(t*2.2)*0.028*R + pulsing silicon core',
    });
  }
  if (/\b(robot|bot|chatbot|assistant|ai|neural|brain)\b/.test(topic)) {
    return withPolish({
      label: `intelligent AI bot (v${v})`,
      anatomyHint: `Call G.robot(0, 0, 1.05*R, bodyCol, visorCol, eyeCol, "#F8FAFC", t, ${v}) inside G.part!`,
      codeHint: 'friendly hover bobY=Math.sin(t*2.3)*0.03*R + eye & antenna beacon pulse',
    });
  }
  if (/\b(cloud|saas|storage|backup|sync|upload|download)\b/.test(topic)) {
    return withPolish({
      label: `cloud data sync (v${v})`,
      anatomyHint: `Call G.cloudSync(0, 0, 1.05*R, cloudCol, arrowCol, "#F8FAFC", t, ${v}) inside G.part!`,
      codeHint: 'upright cloud float bobY=Math.sin(t*2.1)*0.028*R + smooth vertical arrow sync',
    });
  }

  // Deterministic structural fallback for unseen prompts — cycles across clean welded icon archetypes (NO messy raw primitives!)
  const fallbackHelpers = [
    `G.uiLayout(0, 0, 1.05*R, c0, c1, c2, "#F8FAFC", t, ${v})`,
    `G.chart(0, 0, 1.05*R, c0, c1, c2, c3, "#F8FAFC", t, ${v})`,
    `G.target(0, 0, 1.05*R, c1, "#F8FAFC", c3, c0, t, ${v})`,
    `G.network(0, 0, 1.05*R, c1, c2, c3, "#F8FAFC", t, ${v})`,
    `G.shield(0, 0, 1.05*R, c0, "#F8FAFC", c1, c3, t, ${v})`,
    `G.rocket(0, 0, 1.05*R, "#F8FAFC", c1, c3, c0, t, ${v})`,
  ];

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
        label: `${overrideMode} (v${v})`,
        anatomyHint: `Pick the closest matching G.<hero> helper at s=1.05*R with t,${v} (e.g. ${fallbackHelpers[v]}) inside G.part! NEVER scatter tiny disconnected dots or overlapping circles.`,
        codeHint: legacy[overrideMode],
      });
    }
  }

  return withPolish({
    label: `precision icon motion (v${v})`,
    anatomyHint: `Pick the closest matching G.<hero> helper at s=1.05*R with t,${v} (e.g. ${fallbackHelpers[v]}) OR compose a crisp welded badge frame with inner animated glyph inside [-0.52*R,+0.52*R]!`,
    codeHint: 'upright bobY=Math.sin(t*2.2)*0.03*R, rot=Math.sin(t*1.5)*0.028 + internal t-driven motion',
  });
}
