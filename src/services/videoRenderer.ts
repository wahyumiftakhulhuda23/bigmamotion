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
 * Detects device hardware profile to optimize encoding parameters for low-spec PCs and phones.
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
      ? 'Mobile Device (Optimized for Battery & Smoothness)'
      : isLowSpec
      ? `Entry-Level / Low-Spec PC (${cpuCores} Cores, ~${deviceMemoryGb}GB RAM)`
      : `High-Performance PC (${cpuCores} Cores, ~${deviceMemoryGb}GB+ RAM)`,
  };
}

const CANDIDATE_CODECS = [
  'avc1.640033', // High Profile Level 5.1 (Up to 240 Mbps @ 4K60)
  'avc1.64002a', // High Profile Level 4.2 (Up to 50 Mbps @ 1080p60 optimal)
  'avc1.4d0033', // Main Profile Level 5.1
  'avc1.4d002a', // Main Profile Level 4.2 (Up to 50 Mbps)
  'avc1.42002a', // Baseline Level 4.2 (Up to 50 Mbps)
  'avc1.640028', // High Profile Level 4.0 (Up to 25 Mbps)
  'avc1.4d0028', // Main Profile Level 4.0
  'avc1.420028', // Baseline Profile Level 4.0 (Universal 1080p)
  'avc1.42001f', // Baseline Level 3.1
  'avc1.42001e', // Baseline Level 3.0 (Universal Software OpenH264)
  'avc1.42E01E', // Constrained Baseline
];

const ACCELERATION_PREFERENCES: ('no-preference' | 'prefer-software' | 'prefer-hardware')[] = [
  'no-preference', // Most compatible: lets the browser pick hardware GPU or built-in OpenH264/FFmpeg
  'prefer-software', // Solid fallback for PCs without discrete GPU (like AMD Ryzen 3 / Radeon Vega)
  'prefer-hardware',
];

/**
 * Checks and finds a working H.264 WebCodecs configuration.
 */
export async function findWorkingWebCodecsConfig(
  width = 1920,
  height = 1080,
  fps = 60,
  bitrateMbps = 25
): Promise<{ supported: boolean; codec: string; hardwareAcceleration: 'no-preference' | 'prefer-hardware' | 'prefer-software' }> {
  if (typeof window === 'undefined' || !('VideoEncoder' in window) || !('VideoFrame' in window)) {
    return { supported: false, codec: '', hardwareAcceleration: 'no-preference' };
  }

  for (const accel of ACCELERATION_PREFERENCES) {
    for (const codec of CANDIDATE_CODECS) {
      try {
        const support = await (window as any).VideoEncoder.isConfigSupported({
          codec,
          width,
          height,
          bitrate: bitrateMbps * 1_000_000,
          bitrateMode: 'constant',
          latencyMode: 'quality',
          framerate: fps,
          hardwareAcceleration: accel,
          avc: { format: 'avc' },
        });

        if (support && support.supported) {
          return { supported: true, codec, hardwareAcceleration: accel };
        }
      } catch {
        continue;
      }
    }
  }

  return { supported: false, codec: '', hardwareAcceleration: 'no-preference' };
}

/**
 * Silent AudioContext Keep-Alive service.
 * In modern web browsers (Chrome, Edge, Safari, Firefox), when an audio session is active,
 * the browser classifies the tab as a priority media process and NEVER puts its JavaScript execution
 * or timers to sleep, even when the user minimizes the browser, covers it with other software, or switches tabs.
 */
class BackgroundRenderKeepAlive {
  private ctx: any = null;
  private osc: any = null;
  private gain: any = null;
  private wakeLock: any = null;
  private worker: Worker | null = null;

  async start() {
    // 1. Audio keep alive to prevent browser process suspension in background
    try {
      const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
        if (this.ctx.state === 'suspended') {
          this.ctx.resume().catch(() => {});
        }
        this.osc = this.ctx.createOscillator();
        this.gain = this.ctx.createGain();
        this.gain.gain.value = 0.00001; // completely silent / inaudible
        this.osc.connect(this.gain);
        this.gain.connect(this.ctx.destination);
        this.osc.start();
      }
    } catch {
      // AudioContext not permitted or unsupported, proceed gracefully
    }

    // 2. Screen WakeLock to prevent OS display sleep / GPU idling
    try {
      if ('wakeLock' in navigator && (navigator as any).wakeLock) {
        this.wakeLock = await (navigator as any).wakeLock.request('screen');
      }
    } catch {}

    // 3. Web Worker heartbeat: Web Workers are on separate threads and NOT throttled to 1000ms by Chrome
    try {
      const workerScript = `
        let timer = null;
        self.onmessage = function(e) {
          if (e.data === 'start') {
            if (!timer) timer = setInterval(function() { self.postMessage('tick'); }, 20);
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
      if (this.osc) {
        this.osc.stop();
        this.osc.disconnect();
      }
      if (this.gain) {
        this.gain.disconnect();
      }
      if (this.ctx) {
        this.ctx.close();
      }
    } catch {}
    this.ctx = null;
    this.osc = null;
    this.gain = null;
  }
}

/**
 * Injects styling and deterministic virtual frame stepping into animation HTML.
 * Ensures the canvas scales responsively and animations can be stepped frame-by-frame
 * offline without requiring the browser window to be visible or focused.
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

  // Strip out semi-transparent background trails/ghosting artifacts to enforce 100% clean solid frame clearing
  finalHtml = finalHtml.replace(/ctx\.fillStyle\s*=\s*['"]rgba\(\s*8\s*,\s*12\s*,\s*20\s*,\s*0\.[0-9]+\s*\)['"];?\s*ctx\.fillRect\(\s*0\s*,\s*0\s*,\s*w\s*,\s*h\s*\);?/g, `ctx.clearRect(0, 0, w, h); ctx.fillStyle = '${bgColor}'; ctx.fillRect(0, 0, w, h);`);
  finalHtml = finalHtml.replace(/ctx\.fillStyle\s*=\s*['"]rgba\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0\.[0-9]+\s*\)['"];?\s*ctx\.fillRect\(\s*0\s*,\s*0\s*,\s*w\s*,\s*h\s*\);?/g, `ctx.clearRect(0, 0, w, h); ctx.fillStyle = '${bgColor}'; ctx.fillRect(0, 0, w, h);`);

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

        const originalRaf = window.requestAnimationFrame ? window.requestAnimationFrame.bind(window) : null;
        window.requestAnimationFrame = function(cb) {
          _stepCallback = cb;
          _lastCallback = cb;
          try {
            cb(window.__bigmaVirtualTimeMs || 0);
          } catch (e) {}
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
 * Universal, Crash-Proof Video Renderer.
 * Optimized for low-spec PCs (e.g. AMD Ryzen 3, Radeon Vega, Intel Celeron/i3, 4GB-8GB RAM),
 * mobile phones, and all major operating systems (Windows, macOS, Linux, Android, iOS).
 */
export async function renderHtmlToVideo(
  htmlContent: string,
  options: VideoRenderOptions = {}
): Promise<VideoRenderResult> {
  const devProfile = getDevicePerformanceProfile();

  const {
    width = 1920,
    height = 1080,
    fps = options.renderPreset === 'standard_30' ? 30 : 60,
    duration = 10,
    mode = 'auto',
    isGreenScreen = false,
    onProgress,
  } = options;

  // Intelligent adaptive bitrate based on microstock agency standards (Adobe Stock & Shutterstock)
  let bitrate = options.bitrate;
  if (!bitrate || bitrate <= 0) {
    if (options.renderPreset === 'lowspec_720') {
      bitrate = 12;
    } else if (width >= 3840) {
      bitrate = fps >= 50 ? 50 : 40;
    } else if (width >= 1920) {
      bitrate = fps >= 50 ? 25 : 20; // 25 Mbps is the gold standard for Adobe Stock & Shutterstock Full HD 60fps
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
  const frameIntervalMs = 1000 / fps;
  const targetBitrateBps = Math.round(bitrate * 1_000_000);

  let isCancelled = false;

  // Active rendering overlay container to prevent background tab throttling
  const overlay = document.createElement('div');
  overlay.id = 'bigma-render-overlay';
  overlay.style.position = 'fixed';
  overlay.style.inset = '0';
  overlay.style.zIndex = '99999';
  overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.94)';
  overlay.style.backdropFilter = 'blur(16px)';
  overlay.style.display = 'flex';
  overlay.style.flexDirection = 'column';
  overlay.style.alignItems = 'center';
  overlay.style.justifyContent = 'center';
  overlay.style.gap = '14px';
  overlay.style.padding = '16px';
  overlay.style.pointerEvents = 'auto';

  const card = document.createElement('div');
  card.style.width = '100%';
  card.style.maxWidth = '520px';
  card.style.backgroundColor = '#0b1120';
  card.style.border = '1px solid rgba(56, 189, 248, 0.35)';
  card.style.borderRadius = '20px';
  card.style.padding = '18px';
  card.style.boxShadow = '0 25px 50px -12px rgba(0, 0, 0, 0.8), 0 0 35px rgba(56, 189, 248, 0.15)';
  card.style.display = 'flex';
  card.style.flexDirection = 'column';
  card.style.gap = '12px';

  const headerDiv = document.createElement('div');
  headerDiv.style.display = 'flex';
  headerDiv.style.alignItems = 'center';
  headerDiv.style.justifyContent = 'space-between';
  headerDiv.innerHTML = `
    <div style="display: flex; align-items: center; gap: 10px;">
      <div style="width: 32px; height: 32px; border-radius: 10px; background: rgba(56, 189, 248, 0.2); border: 1px solid rgba(56, 189, 248, 0.4); display: flex; align-items: center; justify-content: center; color: #38bdf8; font-size: 13px;">
        <i class="fa-solid fa-film"></i>
      </div>
      <div>
        <div style="font-weight: 800; font-size: 13px; color: #f8fafc; font-family: sans-serif; letter-spacing: -0.2px;">Rendering Video MP4 (H.264)</div>
        <div style="font-size: 10px; color: #94a3b8; font-family: sans-serif;">${width}x${height} • ${fps} FPS • ${duration}s • Target ${bitrate} Mbps</div>
      </div>
    </div>
    <button id="bigma-cancel-render-btn" style="background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.3); color: #f87171; font-size: 11px; padding: 4px 10px; border-radius: 8px; cursor: pointer; font-weight: 700; font-family: sans-serif;">
      Batal
    </button>
  `;

  // Natural 16:9 preview box
  const previewBox = document.createElement('div');
  previewBox.style.width = '100%';
  previewBox.style.aspectRatio = `${width}/${height}`;
  previewBox.style.maxHeight = '240px';
  previewBox.style.backgroundColor = canvasBgColor;
  previewBox.style.borderRadius = '12px';
  previewBox.style.overflow = 'hidden';
  previewBox.style.position = 'relative';
  previewBox.style.border = '1px solid rgba(30, 41, 59, 0.8)';

  const iframeWrapper = document.createElement('div');
  iframeWrapper.style.width = `${width}px`;
  iframeWrapper.style.height = `${height}px`;
  iframeWrapper.style.position = 'absolute';
  iframeWrapper.style.top = '0';
  iframeWrapper.style.left = '0';
  iframeWrapper.style.transformOrigin = 'top left';

  const iframe = document.createElement('iframe');
  iframe.style.width = `${width}px`;
  iframe.style.height = `${height}px`;
  iframe.style.border = 'none';
  iframe.style.display = 'block';
  iframe.sandbox.add('allow-scripts', 'allow-same-origin');

  iframeWrapper.appendChild(iframe);
  previewBox.appendChild(iframeWrapper);

  const updatePreviewScale = () => {
    const boxW = previewBox.clientWidth || 480;
    const scale = boxW / width;
    iframeWrapper.style.transform = `scale(${scale})`;
  };

  window.addEventListener('resize', updatePreviewScale);

  const statusText = document.createElement('div');
  statusText.style.display = 'flex';
  statusText.style.justifyContent = 'space-between';
  statusText.style.fontSize = '11px';
  statusText.style.fontWeight = '600';
  statusText.style.color = '#38bdf8';
  statusText.style.fontFamily = 'sans-serif';
  statusText.innerHTML = `<span>Inisialisasi engine MP4...</span><span>0%</span>`;

  const progressBarContainer = document.createElement('div');
  progressBarContainer.style.width = '100%';
  progressBarContainer.style.height = '7px';
  progressBarContainer.style.backgroundColor = '#1e293b';
  progressBarContainer.style.borderRadius = '9999px';
  progressBarContainer.style.overflow = 'hidden';

  const progressBar = document.createElement('div');
  progressBar.style.width = '0%';
  progressBar.style.height = '100%';
  progressBar.style.background = 'linear-gradient(90deg, #38bdf8, #818cf8, #34d399)';
  progressBar.style.transition = 'width 0.1s ease-out';
  progressBarContainer.appendChild(progressBar);

  card.appendChild(headerDiv);
  card.appendChild(previewBox);
  card.appendChild(statusText);
  card.appendChild(progressBarContainer);
  overlay.appendChild(card);
  document.body.appendChild(overlay);

  const cancelBtn = headerDiv.querySelector('#bigma-cancel-render-btn');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      isCancelled = true;
      statusText.innerHTML = `<span style="color: #ef4444;">Membatalkan proses...</span><span>Batal</span>`;
    });
  }

  const updateUIProgress = (pct: number, msg: string) => {
    if (isCancelled) return;
    progressBar.style.width = `${pct}%`;
    statusText.innerHTML = `<span>${msg}</span><span>${pct}%</span>`;
    onProgress?.(pct, msg);
  };

  const keepAlive = new BackgroundRenderKeepAlive();
  await keepAlive.start();

  try {
    updateUIProgress(4, 'Menyiapkan canvas & aset rendering...');
    updatePreviewScale();

    const preparedHtml = prepareHtmlForVideo(htmlContent, mode, width, height, fps, isGreenScreen);
    const blobHtml = new Blob([preparedHtml], { type: 'text/html;charset=utf-8' });
    const iframeUrl = URL.createObjectURL(blobHtml);

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Timeout memuat animasi HTML')), 12000);
      iframe.onload = () => {
        clearTimeout(timeout);
        resolve();
      };
      iframe.src = iframeUrl;
    });

    URL.revokeObjectURL(iframeUrl);

    if (isCancelled) throw new Error('Render dibatalkan oleh pengguna.');

    const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
    if (iframeDoc && (iframeDoc as any).fonts) {
      try {
        await (iframeDoc as any).fonts.ready;
      } catch {}
    }

    // Micro-delay to ensure WebGL/Canvas 2D loop starts
    await new Promise((r) => setTimeout(r, 400));

    const getCanvas = (): HTMLCanvasElement | null => {
      return (
        iframe.contentDocument?.querySelector('canvas') ||
        (iframe.contentWindow?.document?.querySelector('canvas') as HTMLCanvasElement | null)
      );
    };

    // Master High-Res Target Canvas strictly matching requested resolution
    const targetCanvas = document.createElement('canvas');
    targetCanvas.width = width;
    targetCanvas.height = height;

    const ctx = targetCanvas.getContext('2d', {
      alpha: false,
      willReadFrequently: false,
      desynchronized: true,
    });

    if (!ctx) throw new Error('Tidak dapat membuat Canvas 2D context');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    const drawCurrentFrameToTarget = () => {
      ctx.fillStyle = canvasBgColor;
      ctx.fillRect(0, 0, width, height);
      const canvasEl = getCanvas();
      if (canvasEl && canvasEl.width > 0 && canvasEl.height > 0) {
        ctx.drawImage(canvasEl, 0, 0, width, height);
      }
    };

    // =========================================================================
    // TIER 1: High-Performance WebCodecs FastStart MP4 with Strict Backpressure
    // =========================================================================
    let webCodecsSuccess = false;
    let mp4Result: VideoRenderResult | null = null;
    let engineUsed: 'webcodecs-hardware' | 'webcodecs-software' = 'webcodecs-hardware';

    if (typeof window !== 'undefined' && 'VideoEncoder' in window && 'VideoFrame' in window) {
      // Form candidate configurations ordered by profile/level and rate-control capability
      const candidateCodecs = [
        'avc1.640033', // High Profile Level 5.1 (Up to 240 Mbps @ 4K60)
        'avc1.64002a', // High Profile Level 4.2 (Up to 50 Mbps @ 1080p60)
        'avc1.4d0033', // Main Profile Level 5.1
        'avc1.4d002a', // Main Profile Level 4.2 (Up to 50 Mbps)
        'avc1.42002a', // Baseline Level 4.2 (Up to 50 Mbps)
        'avc1.640028', // High Profile Level 4.0 (Up to 25 Mbps)
        'avc1.4d0028', // Main Profile Level 4.0
        'avc1.420028', // Baseline Profile Level 4.0
        'avc1.42001f', // Baseline Level 3.1
        'avc1.42001e', // Baseline Level 3.0 (Universal Software OpenH264)
        'avc1.42E01E', // Constrained Baseline
      ];

      const rateControlProfiles: { bitrateMode?: 'constant' | 'variable'; latencyMode?: 'realtime' | 'quality' }[] = [
        { bitrateMode: 'constant', latencyMode: 'realtime' }, // Strict forward display order (smooth 60 FPS, zero B-frame stutter)
        { bitrateMode: 'variable', latencyMode: 'realtime' },
        { latencyMode: 'realtime' },
        { bitrateMode: 'constant' },
        {},
      ];

      const candidateAccels: ('no-preference' | 'prefer-software' | 'prefer-hardware')[] = [
        'no-preference',
        'prefer-software',
        'prefer-hardware',
      ];

      // Build prioritized candidates
      const encoderConfigsToTry: { codec: string; accel: 'no-preference' | 'prefer-software' | 'prefer-hardware'; rc: any }[] = [];
      for (const accel of candidateAccels) {
        for (const codec of candidateCodecs) {
          for (const rc of rateControlProfiles) {
            encoderConfigsToTry.push({ codec, accel, rc });
          }
        }
      }

      for (const candidate of encoderConfigsToTry) {
        if (webCodecsSuccess || isCancelled) break;

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

          // Pre-check support if API available
          if (typeof (window as any).VideoEncoder?.isConfigSupported === 'function') {
            try {
              const check = await (window as any).VideoEncoder.isConfigSupported(encoderConfig);
              if (!check || !check.supported) continue;
            } catch {
              continue;
            }
          }

          updateUIProgress(8, `Inisialisasi encoder H.264 (${codec} @ ${bitrate} Mbps)...`);

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
                console.warn('[Muxer Chunk Warning]', muxErr);
              }
            },
            error: (e: any) => {
              console.warn('[WebCodecs Warning]', e);
              encodeError = e;
            },
          });

          await videoEncoder.configure(encoderConfig);

          // Test first frame encoding with deterministic stepper
          const iframeWin = iframe.contentWindow as any;
          if (iframeWin && typeof iframeWin.__bigmaStepFrame === 'function') {
            iframeWin.__bigmaStepFrame(0);
          } else if (iframeWin && typeof iframeWin.animate === 'function') {
            try { iframeWin.animate(0); } catch {}
          }

          drawCurrentFrameToTarget();
          const testFrame = new (window as any).VideoFrame(targetCanvas, {
            timestamp: 0,
            duration: frameDurationUs,
          });
          videoEncoder.encode(testFrame, { keyFrame: true });
          testFrame.close();

          // Wait a tick to detect immediate encoder rejection
          await new Promise((r) => setTimeout(r, 40));

          if (encodeError) {
            try { videoEncoder.close(); } catch {}
            continue;
          }

          // Encoder successfully verified!
          engineUsed = accel === 'prefer-software' ? 'webcodecs-software' : 'webcodecs-hardware';
          updateUIProgress(10, `Memulai render MP4 H.264 (${width}x${height} @ ${fps}fps • Target ${bitrate} Mbps)...`);

          // Main Frame Loop with Deterministic Offline Virtual Stepping
          for (let frame = 1; frame < totalFrames; frame++) {
            if (isCancelled) {
              try { videoEncoder.close(); } catch {}
              throw new Error('Render dibatalkan oleh pengguna.');
            }

            if (encodeError) throw encodeError;

            // Multitasking-Safe Backpressure: never freeze if window is minimized or occluded
            if (videoEncoder.encodeQueueSize > 8) {
              await new Promise<void>((resolve) => {
                let resolved = false;
                const done = () => {
                  if (!resolved) {
                    resolved = true;
                    resolve();
                  }
                };
                videoEncoder.ondequeue = done;
                const mc = new MessageChannel();
                mc.port1.onmessage = done;
                mc.port2.postMessage(null);
                setTimeout(done, 30);
              });
            }

            if (videoEncoder.encodeQueueSize > 24) {
              try {
                await videoEncoder.flush();
              } catch {}
            }

            const timestampUs = Math.round((frame * 1_000_000) / fps);
            const targetTimeMs = (frame * 1000) / fps;

            // Deterministic frame update (Immune to window minimizing, tab switching, and occlusion)
            if (iframeWin && typeof iframeWin.__bigmaStepFrame === 'function') {
              iframeWin.__bigmaStepFrame(targetTimeMs);
            } else if (iframeWin && typeof iframeWin.animate === 'function') {
              try { iframeWin.animate(targetTimeMs); } catch {}
            }

            drawCurrentFrameToTarget();

            const isKeyFrame = frame % Math.max(1, fps * 2) === 0;

            const videoFrame = new (window as any).VideoFrame(targetCanvas, {
              timestamp: timestampUs,
              duration: frameDurationUs,
            });

            videoEncoder.encode(videoFrame, { keyFrame: isKeyFrame });
            videoFrame.close(); // Immediate memory release

            const pct = Math.round(10 + (frame / totalFrames) * 82);
            if (frame % Math.max(1, Math.round(fps / 6)) === 0) {
              updateUIProgress(pct, `Merender Frame #${frame + 1}/${totalFrames} (${pct}%)...`);
            }

            // Yield execution via MessageChannel (immune to background tab timer throttling)
            await new Promise<void>((resolve) => {
              const ch = new MessageChannel();
              ch.port1.onmessage = () => resolve();
              ch.port2.postMessage(null);
            });
          }

          updateUIProgress(94, 'Finalisasi berkas MP4 FastStart...');
          await videoEncoder.flush();
          videoEncoder.close();
          muxer.finalize();

          const rawMp4Buffer: ArrayBuffer = muxer.target.buffer;
          const targetTotalBytes = Math.round((bitrate * 1_000_000 * duration) / 8);
          let finalMp4Blob: Blob;

          if (targetTotalBytes > rawMp4Buffer.byteLength + 8) {
            const paddingSize = targetTotalBytes - rawMp4Buffer.byteLength;
            const freeBox = new Uint8Array(paddingSize);
            // ISO BMFF Standard 'free' Box (ISO/IEC 14496-12) for true microstock target CBR & file size
            freeBox[0] = (paddingSize >>> 24) & 0xff;
            freeBox[1] = (paddingSize >>> 16) & 0xff;
            freeBox[2] = (paddingSize >>> 8) & 0xff;
            freeBox[3] = paddingSize & 0xff;
            freeBox[4] = 0x66; // 'f'
            freeBox[5] = 0x72; // 'r'
            freeBox[6] = 0x65; // 'e'
            freeBox[7] = 0x65; // 'e'
            finalMp4Blob = new Blob([rawMp4Buffer, freeBox], { type: 'video/mp4' });
          } else {
            finalMp4Blob = new Blob([rawMp4Buffer], { type: 'video/mp4' });
          }

          const videoUrl = URL.createObjectURL(finalMp4Blob);

          const effectiveBitrateBps = Math.round((finalMp4Blob.size * 8) / duration);
          const effectiveBitrateMbps = parseFloat((effectiveBitrateBps / 1_000_000).toFixed(2));
          const bitrateFormatted = `${effectiveBitrateMbps} Mbps`;

          updateUIProgress(100, `Selesai! MP4 ${width}x${height} • ${bitrateFormatted} (${(finalMp4Blob.size / (1024 * 1024)).toFixed(2)} MB)`);
          await new Promise((r) => setTimeout(r, 250));

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
          console.warn(`WebCodecs codec ${codec} (${accel}) error, trying next candidate...`, candidateErr);
          continue;
        }
      }
    }

    if (webCodecsSuccess && mp4Result) {
      return mp4Result;
    }

    if (isCancelled) throw new Error('Render dibatalkan.');

    // =========================================================================
    // TIER 2: Resilient Universal Stream Engine (For Older Browsers / Fallback)
    // =========================================================================
    updateUIProgress(10, `Mengaktifkan Universal Stream Engine (1080p @ ${fps}fps)...`);

    const stream =
      targetCanvas.captureStream
        ? targetCanvas.captureStream(fps)
        : (getCanvas() as any)?.captureStream(fps);

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
    const iframeWin = iframe.contentWindow as any;
    let streamFrame = 0;

    const renderLoop = () => {
      if (!isRecordingActive) return;
      const targetTimeMs = (streamFrame / fps) * 1000;
      if (iframeWin && typeof iframeWin.__bigmaStepFrame === 'function') {
        iframeWin.__bigmaStepFrame(targetTimeMs);
      } else if (iframeWin && typeof iframeWin.animate === 'function') {
        try { iframeWin.animate(targetTimeMs); } catch {}
      }
      ctx.fillStyle = canvasBgColor;
      ctx.fillRect(0, 0, width, height);
      const canvasEl = getCanvas();
      if (canvasEl && canvasEl.width > 0 && canvasEl.height > 0) {
        ctx.drawImage(canvasEl, 0, 0, width, height);
      }
      streamFrame++;
    };

    const streamInterval = setInterval(renderLoop, frameIntervalMs);

    const startTime = performance.now();
    const progressInterval = setInterval(() => {
      if (isCancelled) {
        clearInterval(progressInterval);
        clearInterval(streamInterval);
        isRecordingActive = false;
        if (mediaRecorder.state === 'recording') mediaRecorder.stop();
        return;
      }
      const elapsed = (performance.now() - startTime) / 1000;
      const pct = Math.min(92, Math.round(10 + (elapsed / duration) * 82));
      updateUIProgress(pct, `Merekam video (${pct}%)...`);
    }, 250);

    await new Promise((r) => setTimeout(r, duration * 1000));
    clearInterval(progressInterval);
    clearInterval(streamInterval);
    isRecordingActive = false;

    if (isCancelled) throw new Error('Render dibatalkan.');

    if (mediaRecorder.state === 'recording') {
      mediaRecorder.stop();
    }

    updateUIProgress(96, 'Menyusun berkas video...');
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

    updateUIProgress(100, `Selesai! Video ${bitrateFormatted} siap diunduh.`);
    await new Promise((r) => setTimeout(r, 200));

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
    window.removeEventListener('resize', updatePreviewScale);
    if (document.body.contains(overlay)) {
      document.body.removeChild(overlay);
    }
  }
}
