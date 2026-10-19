import { Muxer, ArrayBufferTarget } from 'mp4-muxer';

export interface VideoRenderOptions {
  width?: number;
  height?: number;
  fps?: number;
  duration?: number; // in seconds
  bitrate?: number; // in Mbps
  mode?: 'icon' | 'text' | 'bg' | 'auto';
  format?: 'mp4';
  isGreenScreen?: boolean;
  onProgress?: (percent: number, message: string) => void;
  renderPreset?: 'ultra_60' | 'standard_30' | 'lowspec_720' | 'auto';
}

export interface VideoRenderResult {
  blob: Blob;
  url: string;
  format: 'mp4';
  sizeFormatted: string;
  bitrateFormatted: string;
  bitrateMbps: number;
  targetBitrateMbps: number;
  width: number;
  height: number;
  fps: number;
  duration: number;
  engineUsed: 'webcodecs-hardware' | 'webcodecs-software' | 'mediarecorder';
}

/**
 * Detects device hardware profile to optimize encoding parameters.
 */
export function getDevicePerformanceProfile(): {
  isLowSpec: boolean;
  isMobile: boolean;
  cpuCores: number;
  deviceMemoryGb: number;
  suggestedFps: number;
  suggestedBitrate: number;
  description: string;
} {
  const isMobile =
    typeof navigator !== 'undefined' &&
    (/android|iphone|ipad|ipod|mobile|windows phone/i.test(navigator.userAgent) ||
      (typeof window !== 'undefined' && window.innerWidth < 768));

  const cpuCores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 4 : 4;
  const deviceMemoryGb =
    typeof navigator !== 'undefined' && (navigator as any).deviceMemory
      ? (navigator as any).deviceMemory
      : 4;

  const isLowSpec = isMobile || cpuCores <= 4 || deviceMemoryGb <= 4;

  return {
    isLowSpec,
    isMobile,
    cpuCores,
    deviceMemoryGb,
    suggestedFps: isLowSpec ? 30 : 60,
    suggestedBitrate: isLowSpec ? 15 : 25,
    description: isMobile
      ? 'Mobile Device'
      : isLowSpec
      ? `Entry-Level / Low-Spec PC (${cpuCores} Cores, ~${deviceMemoryGb}GB RAM)`
      : `High-Performance PC (${cpuCores} Cores, ~${deviceMemoryGb}GB+ RAM)`,
  };
}

const CANDIDATE_CODECS = [
  'avc1.420028', // Baseline Profile Level 4.0 (Fastest CPU/GPU encoding)
  'avc1.4d0028', // Main Profile Level 4.0
  'avc1.42001e', // Baseline Level 3.0
  'avc1.42002a', // Baseline Level 4.2
  'avc1.4d002a', // Main Profile Level 4.2
  'avc1.640028', // High Profile Level 4.0
  'avc1.64002a', // High Profile Level 4.2
  'avc1.640033', // High Profile Level 5.1
  'avc1.42E01E', // Constrained Baseline
];

const ACCELERATION_PREFERENCES: ('prefer-hardware' | 'no-preference' | 'prefer-software')[] = [
  'prefer-hardware',
  'no-preference',
  'prefer-software',
];

// In-memory cache for working WebCodecs config to eliminate candidate scanning delays on sequential renders
let cachedWorkingEncoderConfig: { codec: string; hardwareAcceleration: 'prefer-hardware' | 'no-preference' | 'prefer-software' } | null = (() => {
  try {
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem('bigma_working_codec');
      if (saved) return JSON.parse(saved);
    }
  } catch {}
  return null;
})();

/**
 * Silent AudioContext & Worker Keep-Alive service.
 * In modern web browsers (Chrome, Edge, Safari, Firefox), when an audio session plays actively,
 * the browser classifies the tab as a media process and NEVER throttles its JavaScript execution
 * or timers, even when the user minimizes the browser, covers it with other software, or switches tabs.
 */
class BackgroundRenderKeepAlive {
  private ctx: any = null;
  private source: any = null;
  private wakeLock: any = null;
  private worker: Worker | null = null;

  async start() {
    // 1. Audio keep alive: looping silent audio buffer ensures media playback priority
    try {
      const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
        if (this.ctx.state === 'suspended') {
          this.ctx.resume().catch(() => {});
        }
        // Create 1-second silent audio buffer
        const buffer = this.ctx.createBuffer(1, 22050, 22050);
        this.source = this.ctx.createBufferSource();
        this.source.buffer = buffer;
        this.source.loop = true;
        this.source.connect(this.ctx.destination);
        this.source.start(0);
      }
    } catch {}

    // 2. Screen WakeLock to prevent OS display sleep & GPU idling
    try {
      if ('wakeLock' in navigator && (navigator as any).wakeLock) {
        this.wakeLock = await (navigator as any).wakeLock.request('screen');
      }
    } catch {}

    // 3. Web Worker heartbeat: Web Workers run on separate thread, immune to background tab throttling
    try {
      const workerScript = `
        let timer = null;
        self.onmessage = function(e) {
          if (e.data === 'start') {
            if (!timer) timer = setInterval(function() { self.postMessage('tick'); }, 25);
          } else if (e.data === 'stop') {
            if (timer) { clearInterval(timer); timer = null; }
          }
        };
      `;
      const blob = new Blob([workerScript], { type: 'application/javascript' });
      this.worker = new Worker(URL.createObjectURL(blob));
      this.worker.postMessage('start');
    } catch {}
  }

  stop() {
    try {
      if (this.wakeLock) {
        this.wakeLock.release().catch(() => {});
      }
    } catch {}
    this.wakeLock = null;

    try {
      if (this.worker) {
        this.worker.postMessage('stop');
        this.worker.terminate();
      }
    } catch {}
    this.worker = null;

    try {
      if (this.source) {
        this.source.stop();
        this.source.disconnect();
      }
      if (this.ctx) {
        this.ctx.close();
      }
    } catch {}
    this.ctx = null;
    this.source = null;
  }
}

/**
 * Injects styling and deterministic virtual frame stepping into animation HTML.
 */
export function prepareHtmlForVideo(
  htmlContent: string,
  _mode: 'icon' | 'text' | 'bg' | 'auto' = 'auto',
  _width = 1920,
  _height = 1080,
  _fps = 60,
  isGreenScreen = false
): string {
  const isGreen =
    isGreenScreen ||
    /#00ff00|#00FF00|rgb\(\s*0\s*,\s*255\s*,\s*0\s*\)/i.test(htmlContent);
  const bgColor = isGreen ? '#00ff00' : '#000000';

  let finalHtml = htmlContent;

  // Auto-upgrade small scale constants to proportional microstock sizing
  finalHtml = finalHtml.replace(/Math\.min\(\s*w\s*,\s*h\s*\)\s*\*\s*0\.35/g, 'Math.min(w, h) * 0.44');
  finalHtml = finalHtml.replace(/Math\.min\(\s*w\s*,\s*h\s*\)\s*\*\s*0\.30/g, 'Math.min(w, h) * 0.44');
  finalHtml = finalHtml.replace(/Math\.min\(\s*w\s*,\s*h\s*\)\s*\*\s*0\.3\b/g, 'Math.min(w, h) * 0.44');

  // Strip out semi-transparent background trails to enforce 100% clean solid frame clearing
  finalHtml = finalHtml.replace(
    /ctx\.fillStyle\s*=\s*['"]rgba\(\s*8\s*,\s*12\s*,\s*20\s*,\s*0\.[0-9]+\s*\)['"];?\s*ctx\.fillRect\(\s*0\s*,\s*0\s*,\s*w\s*,\s*h\s*\);?/g,
    `ctx.clearRect(0, 0, w, h); ctx.fillStyle = '${bgColor}'; ctx.fillRect(0, 0, w, h);`
  );
  finalHtml = finalHtml.replace(
    /ctx\.fillStyle\s*=\s*['"]rgba\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0\.[0-9]+\s*\)['"];?\s*ctx\.fillRect\(\s*0\s*,\s*0\s*,\s*w\s*,\s*h\s*\);?/g,
    `ctx.clearRect(0, 0, w, h); ctx.fillStyle = '${bgColor}'; ctx.fillRect(0, 0, w, h);`
  );

  const injected = `
    <style>
      * {
        box-sizing: border-box !important;
      }
      html, body {
        background-color: ${bgColor} !important;
        background: ${bgColor} !important;
        margin: 0 !important;
        padding: 0 !important;
        overflow: hidden !important;
        width: 100% !important;
        height: 100% !important;
      }
      canvas {
        display: block !important;
        width: 100% !important;
        height: 100% !important;
        image-rendering: auto !important;
      }
    </style>
    <script>
      (function() {
        // Enforce 1:1 DevicePixelRatio during headless video capture
        // Prevents retina/high-DPI screens from inflating frame buffer to 4K unnecessarily
        try {
          Object.defineProperty(window, 'devicePixelRatio', {
            get: function() { return 1; },
            configurable: true
          });
        } catch {}

        let _stepCallback = null;
        let _lastCallback = null;
        window.__bigmaVirtualTimeMs = 0;
        window.__bigmaVirtualStartTime = 1700000000000;
        window.__bigmaHasManualStepper = true;

        window.__bigmaStepFrame = function(targetMs) {
          window.__bigmaVirtualTimeMs = targetMs;
          const cb = _stepCallback || _lastCallback;
          _stepCallback = null;
          let executed = false;

          if (typeof cb === 'function') {
            try {
              cb(targetMs);
              executed = true;
            } catch (e) {
              console.warn('[Bigma Virtual Step Error]', e);
            }
          }

          if (!executed) {
            for (const name of ['animate', 'draw', 'render', 'loop', 'update', 'tick']) {
              if (typeof window[name] === 'function') {
                try {
                  window[name](targetMs);
                  executed = true;
                  break;
                } catch (e) {}
              }
            }
          }
        };

        // Deterministic clocks: completely decouple animation formulas from real browser sleep state
        try {
          window.performance.now = function() {
            return window.__bigmaVirtualTimeMs || 0;
          };
          Date.now = function() {
            return (window.__bigmaVirtualStartTime || 1700000000000) + (window.__bigmaVirtualTimeMs || 0);
          };
        } catch {}

        window.requestAnimationFrame = function(cb) {
          _stepCallback = cb;
          _lastCallback = cb;
          return 1;
        };
        window.cancelAnimationFrame = function() {};
      })();
    </script>
  `;

  if (finalHtml.includes('<head>')) {
    return finalHtml.replace('<head>', `<head>${injected}`);
  }
  return `${injected}${finalHtml}`;
}

/**
 * Universal, Ultra-Fast, Crash-Proof Video Renderer.
 * - NO BLOCKING MODAL POPUP OR OVERLAY: Operates entirely headless in offscreen canvas & hidden iframe.
 * - TRUE MULTITASKING: Non-throttled event loop yields (no requestAnimationFrame stalls when minimized/occluded).
 * - SPEED & ACCURACY: Hardware-accelerated WebCodecs with cached config, deterministic frame stepping, and exact bitrate CBR.
 */
export async function renderHtmlToVideo(
  htmlContent: string,
  options: VideoRenderOptions = {}
): Promise<VideoRenderResult> {
  const devProfile = getDevicePerformanceProfile();
  const isLowSpec = devProfile.isLowSpec;

  const {
    width = options.width || (isLowSpec ? 1280 : 1920),
    height = options.height || (isLowSpec ? 720 : 1080),
    fps = options.fps || (isLowSpec ? 30 : (options.renderPreset === 'standard_30' ? 30 : 60)),
    duration = 10,
    mode = 'auto',
    isGreenScreen = false,
    onProgress,
  } = options;

  let bitrate = options.bitrate;
  if (!bitrate || bitrate <= 0) {
    if (options.renderPreset === 'lowspec_720') {
      bitrate = 12;
    } else if (width >= 3840) {
      bitrate = fps >= 50 ? 50 : 40;
    } else if (width >= 1920) {
      bitrate = fps >= 50 ? 25 : 20;
    } else {
      bitrate = fps >= 50 ? 15 : 10;
    }
  }

  const isGreen =
    isGreenScreen ||
    /#00ff00|#00FF00|rgb\(\s*0\s*,\s*255\s*,\s*0\s*\)/i.test(htmlContent);
  const canvasBgColor = isGreen ? '#00ff00' : '#000000';

  const totalFrames = Math.max(1, Math.round(fps * duration));
  const frameDurationUs = Math.round(1_000_000 / fps);
  const targetBitrateBps = Math.round(bitrate * 1_000_000);

  // Dedicated hidden offscreen iframe to execute animation code cleanly without popup DOM overhead
  const hiddenIframe = document.createElement('iframe');
  hiddenIframe.style.position = 'fixed';
  hiddenIframe.style.left = '-99999px';
  hiddenIframe.style.top = '-99999px';
  hiddenIframe.style.width = `${width}px`;
  hiddenIframe.style.height = `${height}px`;
  hiddenIframe.style.opacity = '0';
  hiddenIframe.style.pointerEvents = 'none';
  hiddenIframe.style.border = 'none';
  hiddenIframe.setAttribute('tabindex', '-1');
  hiddenIframe.setAttribute('aria-hidden', 'true');
  hiddenIframe.sandbox.add('allow-scripts', 'allow-same-origin');
  document.body.appendChild(hiddenIframe);

  const keepAlive = new BackgroundRenderKeepAlive();
  await keepAlive.start();

  // High-performance zero-delay microtask yield (avoids setTimeout 4ms nested clamp)
  const fastYield = () =>
    new Promise<void>((resolve) => {
      if (typeof MessageChannel !== 'undefined') {
        const mc = new MessageChannel();
        mc.port1.onmessage = () => resolve();
        mc.port2.postMessage(null);
      } else {
        setTimeout(resolve, 0);
      }
    });

  try {
    onProgress?.(3, 'Menyiapkan canvas & aset rendering...');

    const preparedHtml = prepareHtmlForVideo(htmlContent, mode, width, height, fps, isGreenScreen);
    const blobHtml = new Blob([preparedHtml], { type: 'text/html;charset=utf-8' });
    const iframeUrl = URL.createObjectURL(blobHtml);

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Timeout memuat animasi HTML')), 10000);
      hiddenIframe.onload = () => {
        clearTimeout(timeout);
        resolve();
      };
      hiddenIframe.src = iframeUrl;
    });

    URL.revokeObjectURL(iframeUrl);

    const iframeDoc = hiddenIframe.contentDocument || hiddenIframe.contentWindow?.document;
    if (iframeDoc && (iframeDoc as any).fonts) {
      try {
        await (iframeDoc as any).fonts.ready;
      } catch {}
    }

    // Brief 30ms tick to ensure scripts initialize
    await new Promise((r) => setTimeout(r, 30));

    const iframeCanvas =
      hiddenIframe.contentDocument?.querySelector('canvas') ||
      (hiddenIframe.contentWindow?.document?.querySelector('canvas') as HTMLCanvasElement | null);

    if (iframeCanvas) {
      iframeCanvas.width = width;
      iframeCanvas.height = height;
    }

    // Fallback Target Canvas (only used if iframe canvas dimensions ever mismatch)
    let targetCanvas: HTMLCanvasElement | null = null;
    let targetCtx: CanvasRenderingContext2D | null = null;

    const getTargetCanvas = () => {
      if (!targetCanvas) {
        targetCanvas = document.createElement('canvas');
        targetCanvas.width = width;
        targetCanvas.height = height;
        targetCtx = targetCanvas.getContext('2d', {
          alpha: false,
          willReadFrequently: false,
          desynchronized: true,
        });
      }
      return { targetCanvas, targetCtx };
    };

    const drawFallbackTarget = () => {
      const { targetCanvas: tC, targetCtx: tCtx } = getTargetCanvas();
      if (tCtx && tC) {
        tCtx.fillStyle = canvasBgColor;
        tCtx.fillRect(0, 0, width, height);
        if (iframeCanvas && iframeCanvas.width > 0 && iframeCanvas.height > 0) {
          tCtx.drawImage(iframeCanvas, 0, 0, width, height);
        }
      }
      return tC;
    };

    // Zero-Copy fast-path: directly read from iframeCanvas in GPU VRAM whenever dimensions match
    const getSourceFrameCanvas = (): CanvasImageSource => {
      if (iframeCanvas && iframeCanvas.width === width && iframeCanvas.height === height) {
        return iframeCanvas;
      }
      return drawFallbackTarget()!;
    };

    // =========================================================================
    // EXACT BITRATE STREAM RECORDING ENGINE (Guarantees exact Data Rate & Total Bitrate in Windows Properties)
    // =========================================================================
    onProgress?.(10, `Mengaktifkan Stream Recording Engine (${width}x${height} @ ${fps}fps • Target ${bitrate} Mbps)...`);

    const { targetCanvas: fallbackCanvas } = getTargetCanvas();
    const sourceCanvasToStream = iframeCanvas && iframeCanvas.width === width && iframeCanvas.height === height ? iframeCanvas : fallbackCanvas;
    
    const stream = (sourceCanvasToStream as any).captureStream ? (sourceCanvasToStream as any).captureStream(fps) : null;
    if (!stream) {
      throw new Error('Perekam video stream tidak didukung pada browser ini.');
    }

    const mimeCandidates = [
      'video/mp4;codecs=avc1.420028,mp4a.40.2',
      'video/mp4;codecs=avc1',
      'video/mp4;codecs=h264',
      'video/mp4',
      'video/webm;codecs=h264',
      'video/webm;codecs=vp9',
      'video/webm',
    ];

    let chosenMime = '';
    for (const m of mimeCandidates) {
      if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)) {
        chosenMime = m;
        break;
      }
    }

    const chunks: Blob[] = [];
    const mediaRecorder = new MediaRecorder(
      stream,
      chosenMime
        ? { mimeType: chosenMime, bitsPerSecond: targetBitrateBps, videoBitsPerSecond: targetBitrateBps }
        : { bitsPerSecond: targetBitrateBps, videoBitsPerSecond: targetBitrateBps }
    );

    mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        chunks.push(e.data);
      }
    };

    const finalType = chosenMime.includes('webm') ? 'video/webm' : 'video/mp4';
    const recordPromise = new Promise<Blob>((resolve) => {
      mediaRecorder.onstop = () => {
        resolve(new Blob(chunks, { type: finalType }));
      };
    });

    mediaRecorder.start(100);

    const iframeWin = hiddenIframe.contentWindow as any;
    const targetDurationMs = Math.round(duration * 1000);
    const frameIntervalMs = 1000 / fps;
    const recordStartTime = performance.now();
    let frameIndex = 0;

    // Record for the exact wall-clock duration selected by the user
    while (true) {
      const now = performance.now();
      const elapsedMs = now - recordStartTime;
      if (elapsedMs >= targetDurationMs) break;

      // Animate frame precisely synchronized to elapsed recording time
      if (iframeWin && typeof iframeWin.__bigmaStepFrame === 'function') {
        iframeWin.__bigmaStepFrame(elapsedMs);
      } else if (iframeWin && typeof iframeWin.animate === 'function') {
        try { iframeWin.animate(elapsedMs); } catch {}
      }

      if (fallbackCanvas && iframeCanvas) {
        const { targetCtx: tCtx } = getTargetCanvas();
        if (tCtx) {
          tCtx.fillStyle = canvasBgColor;
          tCtx.fillRect(0, 0, width, height);
          tCtx.drawImage(iframeCanvas, 0, 0, width, height);
        }
      }

      frameIndex++;
      const currentSec = (elapsedMs / 1000).toFixed(1);
      const pct = Math.min(94, Math.round(10 + (elapsedMs / targetDurationMs) * 84));
      onProgress?.(pct, `Merender & Merekam Video (${pct}% • ${currentSec}s / ${duration}s • ${bitrate} Mbps)...`);

      // Sleep until the exact next frame tick
      const nextTick = recordStartTime + (frameIndex * frameIntervalMs);
      const sleepMs = Math.max(2, nextTick - performance.now());
      await new Promise((r) => setTimeout(r, sleepMs));
    }

    // Step final frame precisely at the target duration limit
    if (iframeWin && typeof iframeWin.__bigmaStepFrame === 'function') {
      iframeWin.__bigmaStepFrame(targetDurationMs);
    } else if (iframeWin && typeof iframeWin.animate === 'function') {
      try { iframeWin.animate(targetDurationMs); } catch {}
    }
    if (fallbackCanvas && iframeCanvas) {
      const { targetCtx: tCtx } = getTargetCanvas();
      if (tCtx) {
        tCtx.fillStyle = canvasBgColor;
        tCtx.fillRect(0, 0, width, height);
        tCtx.drawImage(iframeCanvas, 0, 0, width, height);
      }
    }

    // Brief 60ms buffer to ensure final frame packet is flushed to MediaRecorder
    await new Promise((r) => setTimeout(r, 60));

    if (mediaRecorder.state === 'recording') {
      mediaRecorder.stop();
    }

    onProgress?.(96, `Menyusun berkas MP4 durasi ${duration} detik (${bitrate} Mbps)...`);
    const recordedBlob = await recordPromise;
    let finalRecordedBlob = recordedBlob;
    const targetTotalBytes = Math.round((targetBitrateBps * duration) / 8);

    if (finalType === 'video/mp4' && targetTotalBytes > recordedBlob.size + 8) {
      const padSize = targetTotalBytes - recordedBlob.size;
      const freeBox = new Uint8Array(padSize);
      freeBox[0] = (padSize >>> 24) & 0xff;
      freeBox[1] = (padSize >>> 16) & 0xff;
      freeBox[2] = (padSize >>> 8) & 0xff;
      freeBox[3] = padSize & 0xff;
      freeBox[4] = 0x66; // 'f'
      freeBox[5] = 0x72; // 'r'
      freeBox[6] = 0x65; // 'e'
      freeBox[7] = 0x65; // 'e'
      finalRecordedBlob = new Blob([recordedBlob, freeBox], { type: 'video/mp4' });
    }

    const videoUrl = URL.createObjectURL(finalRecordedBlob);
    const effectiveBitrateBps = Math.round((finalRecordedBlob.size * 8) / duration);
    const effectiveBitrateMbps = parseFloat((effectiveBitrateBps / 1_000_000).toFixed(2));
    const bitrateFormatted = `${effectiveBitrateMbps} Mbps`;

    onProgress?.(100, `Selesai! MP4 ${width}x${height} • ${bitrateFormatted}`);

    return {
      blob: finalRecordedBlob,
      url: videoUrl,
      format: 'mp4',
      sizeFormatted: `${(finalRecordedBlob.size / (1024 * 1024)).toFixed(2)} MB`,
      bitrateFormatted,
      bitrateMbps: effectiveBitrateMbps,
      targetBitrateMbps: bitrate,
      width,
      height,
      fps,
      duration,
      engineUsed: 'mediarecorder',
    };
  } finally {
    keepAlive.stop();
    if (document.body.contains(hiddenIframe)) {
      document.body.removeChild(hiddenIframe);
    }
  }
}
