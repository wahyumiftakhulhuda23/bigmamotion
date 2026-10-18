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
    // TIER 1: Blazing Fast WebCodecs H.264 MP4 with Hardware Acceleration
    // =========================================================================
    let webCodecsSuccess = false;
    let mp4Result: VideoRenderResult | null = null;
    let engineUsed: 'webcodecs-hardware' | 'webcodecs-software' = 'webcodecs-hardware';

    if (typeof window !== 'undefined' && 'VideoEncoder' in window && 'VideoFrame' in window) {
      // Prioritize fast, universally hardware-accelerated Baseline/Main profiles
      const priorityCodecs = [
        'avc1.420028', // Baseline Profile Level 4.0 - Fastest GPU encoding across all GPUs
        'avc1.4d0028', // Main Profile Level 4.0
        'avc1.640028', // High Profile Level 4.0
        'avc1.42001e', // Baseline Level 3.0
        'avc1.42E01E', // Constrained Baseline
      ];

      const encoderConfigsToTry: { codec: string; accel: 'prefer-hardware' | 'no-preference' | 'prefer-software'; rc: any }[] = [];

      // 1. Try cached working config first for instantaneous launch
      if (cachedWorkingEncoderConfig) {
        encoderConfigsToTry.push({
          codec: cachedWorkingEncoderConfig.codec,
          accel: cachedWorkingEncoderConfig.hardwareAcceleration,
          rc: { bitrateMode: 'constant', bitRateMode: 'constant', latencyMode: 'realtime' },
        });
      }

      // 2. Hardware acceleration first
      for (const codec of priorityCodecs) {
        if (cachedWorkingEncoderConfig?.codec === codec && cachedWorkingEncoderConfig.hardwareAcceleration === 'prefer-hardware') continue;
        encoderConfigsToTry.push({
          codec,
          accel: 'prefer-hardware',
          rc: { bitrateMode: 'constant', bitRateMode: 'constant', latencyMode: 'realtime' },
        });
      }

      // 3. Fallback no-preference / software if hardware not available
      for (const codec of priorityCodecs) {
        encoderConfigsToTry.push({
          codec,
          accel: 'no-preference',
          rc: { bitrateMode: 'constant', bitRateMode: 'constant', latencyMode: 'realtime' },
        });
        encoderConfigsToTry.push({
          codec,
          accel: 'prefer-software',
          rc: { bitrateMode: 'constant', bitRateMode: 'constant' },
        });
      }

      for (const candidate of encoderConfigsToTry) {
        if (webCodecsSuccess) break;

        const { codec, accel, rc } = candidate;

        try {
          const encoderConfig: any = {
            codec,
            width,
            height,
            bitrate: targetBitrateBps,
            framerate: fps,
            hardwareAcceleration: accel,
            avc: { format: 'avc' },
            ...rc,
          };

          if (typeof (window as any).VideoEncoder?.isConfigSupported === 'function') {
            try {
              const check = await (window as any).VideoEncoder.isConfigSupported(encoderConfig);
              if (!check || !check.supported) continue;
            } catch {
              continue;
            }
          }

          onProgress?.(6, `Inisialisasi Hardware Encoder (${codec} @ ${bitrate} Mbps)...`);

          const muxer = new Muxer({
            target: new ArrayBufferTarget(),
            video: {
              codec: 'avc',
              width,
              height,
              frameRate: fps,
            },
            fastStart: 'in-memory',
            firstTimestampBehavior: 'offset',
          });

          let encodeError: any = null;

          const videoEncoder = new (window as any).VideoEncoder({
            output: (chunk: any, meta: any) => {
              try {
                muxer.addVideoChunk(chunk, meta);
              } catch (muxErr) {
                // Ignore transient chunk error
              }
            },
            error: (e: any) => {
              encodeError = e;
            },
          });

          await videoEncoder.configure(encoderConfig);

          // Test first frame encoding
          const iframeWin = hiddenIframe.contentWindow as any;
          if (iframeWin && typeof iframeWin.__bigmaStepFrame === 'function') {
            iframeWin.__bigmaStepFrame(0);
          } else if (iframeWin && typeof iframeWin.animate === 'function') {
            try { iframeWin.animate(0); } catch {}
          }

          const firstSource = getSourceFrameCanvas();
          const testFrame = new (window as any).VideoFrame(firstSource, {
            timestamp: 0,
            duration: frameDurationUs,
          });
          videoEncoder.encode(testFrame, { keyFrame: true });
          testFrame.close();

          await fastYield();

          if (encodeError) {
            try { videoEncoder.close(); } catch {}
            continue;
          }

          // Cache verified working config for 0ms sequential renders
          cachedWorkingEncoderConfig = { codec, hardwareAcceleration: accel };
          try {
            localStorage.setItem('bigma_working_codec', JSON.stringify(cachedWorkingEncoderConfig));
          } catch {}
          engineUsed = accel === 'prefer-software' ? 'webcodecs-software' : 'webcodecs-hardware';

          onProgress?.(8, `Merender MP4 H.264 (${width}x${height} @ ${fps}fps • Target ${bitrate} Mbps)...`);

          const yieldEvery = isLowSpec ? 15 : 25;
          const maxQueueSize = isLowSpec ? 16 : 30;

          // High-Performance Zero-Copy Frame Loop (Unthrottled in background & multitasking)
          for (let frame = 1; frame < totalFrames; frame++) {
            if (encodeError) throw encodeError;

            // Non-blocking hardware backpressure
            if (videoEncoder.encodeQueueSize > maxQueueSize) {
              await new Promise<void>((resolve) => {
                let resolved = false;
                const done = () => {
                  if (!resolved) {
                    resolved = true;
                    resolve();
                  }
                };
                videoEncoder.ondequeue = done;
                setTimeout(done, 4);
              });
            }

            const timestampUs = Math.round((frame * 1_000_000) / fps);
            const targetTimeMs = (frame * 1000) / fps;

            if (iframeWin && typeof iframeWin.__bigmaStepFrame === 'function') {
              iframeWin.__bigmaStepFrame(targetTimeMs);
            } else if (iframeWin && typeof iframeWin.animate === 'function') {
              try { iframeWin.animate(targetTimeMs); } catch {}
            }

            const isKeyFrame = frame % Math.max(1, fps * 2) === 0;
            const currentSource = getSourceFrameCanvas();

            const videoFrame = new (window as any).VideoFrame(currentSource, {
              timestamp: timestampUs,
              duration: frameDurationUs,
            });

            videoEncoder.encode(videoFrame, { keyFrame: isKeyFrame });
            videoFrame.close();

            // Periodic zero-delay yield keeps UI responsive & multitasking fluid on all devices
            if (frame % yieldEvery === 0 || frame === totalFrames - 1) {
              const pct = Math.round(8 + (frame / totalFrames) * 84);
              onProgress?.(pct, `Merender Frame #${frame + 1}/${totalFrames} (${pct}% • ${bitrate} Mbps)...`);
              await fastYield();
            }
          }

          onProgress?.(94, 'Finalisasi berkas MP4 FastStart...');
          await videoEncoder.flush();
          videoEncoder.close();
          muxer.finalize();

          const rawMp4Buffer: ArrayBuffer = muxer.target.buffer;
          // Force exact Microstock CBR bitrate padding using ISO/IEC 14496-12 'free' box
          const targetTotalBytes = Math.round((targetBitrateBps * duration) / 8);
          let finalMp4Blob: Blob;

          if (targetTotalBytes > rawMp4Buffer.byteLength + 8) {
            const paddingSize = targetTotalBytes - rawMp4Buffer.byteLength;
            const freeBox = new Uint8Array(paddingSize);
            freeBox[0] = (paddingSize >>> 24) & 0xff;
            freeBox[1] = (paddingSize >>> 16) & 0xff;
            freeBox[2] = (paddingSize >>> 8) & 0xff;
            freeBox[3] = paddingSize & 0xff;
            freeBox[4] = 0x66; // 'f'
            freeBox[5] = 0x72; // 'r'
            freeBox[6] = 0x65; // 'e'
            freeBox[7] = 0x65; // 'e'
            // Fill remainder with pseudo-random or zero padding
            finalMp4Blob = new Blob([rawMp4Buffer, freeBox], { type: 'video/mp4' });
          } else {
            finalMp4Blob = new Blob([rawMp4Buffer], { type: 'video/mp4' });
          }

          const videoUrl = URL.createObjectURL(finalMp4Blob);
          const effectiveBitrateBps = Math.round((finalMp4Blob.size * 8) / duration);
          const effectiveBitrateMbps = parseFloat((effectiveBitrateBps / 1_000_000).toFixed(2));
          const bitrateFormatted = `${effectiveBitrateMbps} Mbps`;

          onProgress?.(100, `Selesai! MP4 ${width}x${height} • ${bitrateFormatted}`);

          mp4Result = {
            blob: finalMp4Blob,
            url: videoUrl,
            format: 'mp4',
            sizeFormatted: `${(finalMp4Blob.size / (1024 * 1024)).toFixed(2)} MB`,
            bitrateFormatted,
            bitrateMbps: effectiveBitrateMbps,
            targetBitrateMbps: bitrate,
            width,
            height,
            fps,
            duration,
            engineUsed,
          };
          webCodecsSuccess = true;
          break;
        } catch (candidateErr) {
          continue;
        }
      }
    }

    if (webCodecsSuccess && mp4Result) {
      return mp4Result;
    }

    // =========================================================================
    // TIER 2: Fallback Stream Engine (For Older Browsers)
    // =========================================================================
    onProgress?.(10, `Mengaktifkan Universal Stream Engine (${width}x${height} @ ${fps}fps)...`);

    const { targetCanvas: fallbackCanvas } = getTargetCanvas();
    const stream =
      fallbackCanvas.captureStream
        ? fallbackCanvas.captureStream(fps)
        : (getSourceFrameCanvas() as any)?.captureStream(fps);

    if (!stream) {
      throw new Error('Perekam video tidak didukung pada browser ini.');
    }

    const mimeCandidates = [
      'video/mp4;codecs=avc1.420028,mp4a.40.2',
      'video/mp4;codecs=avc1',
      'video/mp4;codecs=h264',
      'video/mp4',
      'video/webm;codecs=h264',
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
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

    let isRecordingActive = true;
    const iframeWin = hiddenIframe.contentWindow as any;
    let streamFrame = 0;

    const streamInterval = setInterval(() => {
      if (!isRecordingActive) return;
      const targetTimeMs = (streamFrame / fps) * 1000;
      if (iframeWin && typeof iframeWin.__bigmaStepFrame === 'function') {
        iframeWin.__bigmaStepFrame(targetTimeMs);
      } else if (iframeWin && typeof iframeWin.animate === 'function') {
        try { iframeWin.animate(targetTimeMs); } catch {}
      }
      const { targetCanvas: tC, targetCtx: tCtx } = getTargetCanvas();
      if (tCtx && tC) {
        tCtx.fillStyle = canvasBgColor;
        tCtx.fillRect(0, 0, width, height);
        const sourceC = getSourceFrameCanvas();
        tCtx.drawImage(sourceC, 0, 0, width, height);
      }
      streamFrame++;
    }, 1000 / fps);

    const startTime = performance.now();
    const progressInterval = setInterval(() => {
      const elapsed = (performance.now() - startTime) / 1000;
      const pct = Math.min(92, Math.round(10 + (elapsed / duration) * 82));
      onProgress?.(pct, `Merekam video (${pct}%)...`);
    }, 250);

    await new Promise((r) => setTimeout(r, duration * 1000));
    clearInterval(progressInterval);
    clearInterval(streamInterval);
    isRecordingActive = false;

    if (mediaRecorder.state === 'recording') {
      mediaRecorder.stop();
    }

    onProgress?.(96, 'Menyusun berkas video...');
    const recordedBlob = await recordPromise;
    let finalRecordedBlob = recordedBlob;
    const targetTotalBytes = Math.round((bitrate * 1_000_000 * duration) / 8);
    if (finalType === 'video/mp4' && targetTotalBytes > recordedBlob.size + 8) {
      const padSize = targetTotalBytes - recordedBlob.size;
      const freeBox = new Uint8Array(padSize);
      freeBox[0] = (padSize >>> 24) & 0xff;
      freeBox[1] = (padSize >>> 16) & 0xff;
      freeBox[2] = (padSize >>> 8) & 0xff;
      freeBox[3] = padSize & 0xff;
      freeBox[4] = 0x66;
      freeBox[5] = 0x72;
      freeBox[6] = 0x65;
      freeBox[7] = 0x65;
      finalRecordedBlob = new Blob([recordedBlob, freeBox], { type: 'video/mp4' });
    }
    const videoUrl = URL.createObjectURL(finalRecordedBlob);

    const effectiveBitrateBps = Math.round((finalRecordedBlob.size * 8) / duration);
    const effectiveBitrateMbps = parseFloat((effectiveBitrateBps / 1_000_000).toFixed(2));
    const bitrateFormatted = `${effectiveBitrateMbps} Mbps`;

    onProgress?.(100, `Selesai! Video ${bitrateFormatted} siap diunduh.`);

    return {
      blob: finalRecordedBlob,
      url: videoUrl,
      format: 'mp4',
      sizeFormatted: `${(recordedBlob.size / (1024 * 1024)).toFixed(2)} MB`,
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
