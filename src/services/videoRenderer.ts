import { Muxer, ArrayBufferTarget } from 'mp4-muxer';

export interface VideoRenderOptions {
  width?: number;
  height?: number;
  fps?: number;
  duration?: number; // in seconds
  bitrate?: number; // in Mbps
  mode?: 'icon' | 'text' | 'bg';
  format?: 'mp4';
  isGreenScreen?: boolean;
  onProgress?: (percent: number, message: string) => void;
}

export interface VideoRenderResult {
  blob: Blob;
  url: string;
  format: 'mp4';
  sizeFormatted: string;
  width: number;
  height: number;
  duration: number;
  engineUsed: 'webcodecs' | 'mediarecorder';
}

/**
 * Detects if the current client is a smartphone, tablet, or touch-first mobile device.
 */
export const isMobileDevice = (): boolean => {
  if (typeof window === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const isTouch = 'ontouchstart' in window || (navigator.maxTouchPoints && navigator.maxTouchPoints > 1);
  const isMobileUa = /Android|iPhone|iPad|iPod|Mobile|webOS|BlackBerry|IEMobile|Opera Mini/i.test(ua);
  return isMobileUa || (Boolean(isTouch) && window.innerWidth <= 840);
};

/**
 * Returns candidate H.264 codecs for WebCodecs.
 * Standardized across Desktop, Android, and iOS Safari.
 */
function getCandidateCodecs(width: number, height: number): string[] {
  const is4K = width > 1920 || height > 1080;
  if (is4K) {
    return [
      'avc1.640033', // High Profile Level 5.1 (4K)
      'avc1.4d0033', // Main Profile Level 5.1 (4K)
      'avc1.420033', // Baseline Level 5.1 (4K)
      'avc1.64002a', // High Profile Level 4.2
      'avc1.4d002a', // Main Profile Level 4.2
      'avc1.420028', // Baseline Level 4.0
    ];
  }
  return [
    'avc1.42001f', // Baseline Profile Level 3.1 (Maximum mobile compatibility)
    'avc1.420028', // Baseline Profile Level 4.0 (1080p standard)
    'avc1.4d0028', // Main Profile Level 4.0
    'avc1.4d002a', // Main Profile Level 4.2
    'avc1.640028', // High Profile Level 4.0
    'avc1.64002a', // High Profile Level 4.2
  ];
}

const ACCELERATION_PREFERENCES: ('no-preference' | 'prefer-hardware' | 'prefer-software')[] = [
  'no-preference',
  'prefer-hardware',
  'prefer-software',
];

export interface WebCodecsConfigResult {
  supported: boolean;
  codec: string;
  hardwareAcceleration: 'no-preference' | 'prefer-hardware' | 'prefer-software';
  effectiveFps: number;
  effectiveBitrateMbps: number;
}

/**
 * Checks and finds a working H.264 WebCodecs configuration.
 * Fully compatible with iOS Safari (16.4+), Android Chrome, and Desktop.
 * DOES NOT pass `avc: { format: 'avc' }` because Apple WebKit rejects it.
 */
export async function findWorkingWebCodecsConfig(
  width = 1920,
  height = 1080,
  fps = 60,
  bitrateMbps = 18
): Promise<WebCodecsConfigResult> {
  const fallbackResult: WebCodecsConfigResult = {
    supported: false,
    codec: '',
    hardwareAcceleration: 'no-preference',
    effectiveFps: fps,
    effectiveBitrateMbps: bitrateMbps,
  };

  if (typeof window === 'undefined' || !('VideoEncoder' in window) || !('VideoFrame' in window)) {
    return fallbackResult;
  }

  const isMobile = isMobileDevice();
  // On mobile hardware, clamp bitrate to safe SoC limits (6-8 Mbps for 1080p, 10 Mbps for 4K)
  const safeBitrate = isMobile
    ? Math.min(bitrateMbps, width > 1920 ? 10 : width > 1280 ? 6 : 4)
    : bitrateMbps;

  // Test requested FPS, and if 60fps fails on mobile, try 30fps
  const fpsOptions = isMobile && fps > 30 ? [fps, 30] : [fps];
  const codecs = getCandidateCodecs(width, height);

  for (const testFps of fpsOptions) {
    for (const accel of ACCELERATION_PREFERENCES) {
      for (const codec of codecs) {
        try {
          // CRITICAL: Do NOT pass avc: { format: 'avc' } because WebKit (iOS Safari)
          // throws or returns unsupported on it. Standard config works across all engines.
          const support = await (window as any).VideoEncoder.isConfigSupported({
            codec,
            width,
            height,
            bitrate: safeBitrate * 1_000_000,
            framerate: testFps,
            hardwareAcceleration: accel,
          });

          if (support && support.supported) {
            return {
              supported: true,
              codec,
              hardwareAcceleration: accel,
              effectiveFps: testFps,
              effectiveBitrateMbps: safeBitrate,
            };
          }
        } catch {
          continue;
        }
      }
    }
  }

  return fallbackResult;
}

/**
 * Injects styling and frame synchronization into animation HTML.
 */
export function prepareHtmlForVideo(
  htmlContent: string,
  mode: 'icon' | 'text' | 'bg' = 'icon',
  width = 1920,
  height = 1080,
  _fps = 60,
  isGreenScreen = false
): string {
  const isGreen =
    isGreenScreen ||
    /#00ff00|#00FF00|rgb\(\s*0\s*,\s*255\s*,\s*0\s*\)/i.test(htmlContent);
  const bgColor = isGreen ? '#00ff00' : '#000000';

  const injected = `
    <style>
      * {
        box-sizing: border-box !important;
      }
      html, body {
        margin: 0 !important;
        padding: 0 !important;
        width: 100% !important;
        height: 100% !important;
        overflow: hidden !important;
        background-color: ${bgColor} !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        -webkit-font-smoothing: antialiased;
      }
      canvas {
        display: block !important;
        max-width: 100% !important;
        max-height: 100% !important;
        margin: auto !important;
        ${
          mode === 'bg'
            ? 'width: 100vw !important; height: 100vh !important; object-fit: cover !important;'
            : 'object-fit: contain !important;'
        }
      }
    </style>
    <script>
      (function() {
        function enforceCanvasSize() {
          var canvases = document.querySelectorAll('canvas');
          for (var i = 0; i < canvases.length; i++) {
            var c = canvases[i];
            if (c.width !== ${width} || c.height !== ${height}) {
              c.width = ${width};
              c.height = ${height};
            }
          }
        }
        window.addEventListener('DOMContentLoaded', enforceCanvasSize);
        window.addEventListener('load', function() {
          enforceCanvasSize();
          window.dispatchEvent(new Event('resize'));
        });
      })();
    </script>
  `;

  let finalHtml = htmlContent;

  if (isGreen) {
    finalHtml = finalHtml.replace(/background(-color)?\s*:\s*(#000|#000000|black|rgb\(0,\s*0,\s*0\))/gi, 'background-color: #00ff00');
    finalHtml = finalHtml.replace(/ctx\.fillStyle\s*=\s*['"](#000|#000000|black|rgba?\(0,\s*0,\s*0[^)]*\))['"]/gi, 'ctx.fillStyle = "#00ff00"');
    finalHtml = finalHtml.replace(/fill\(0\)/gi, 'fill(0, 255, 0)');
    finalHtml = finalHtml.replace(/background\(0\)/gi, 'background(0, 255, 0)');
  } else {
    finalHtml = finalHtml.replace(/rgba?\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0(\.0+)?\s*\)/gi, '#000000');
  }

  if (finalHtml.includes('</head>')) {
    return finalHtml.replace('</head>', `${injected}</head>`);
  }
  return `${injected}${finalHtml}`;
}

/**
 * Universal video renderer:
 * - Primary Engine (Mobile & Desktop): WebCodecs + mp4-muxer.
 *   Produces 100% authentic, high-speed MP4 (H.264 FastStart) compatible with iOS Safari (16.4+),
 *   Android Chrome, macOS, Windows, and Linux.
 * - Monotonic Progress: UI loading bar strictly progresses forward (never bounces or loops).
 * - Fallback Engine: Universal Stream Recorder with non-blocking timeslices and anti-deadlock resolution.
 */
export async function renderHtmlToVideo(
  htmlContent: string,
  options: VideoRenderOptions = {}
): Promise<VideoRenderResult> {
  const {
    width = 1920,
    height = 1080,
    fps = 60,
    duration = 10,
    bitrate = 18,
    mode = 'icon',
    isGreenScreen = false,
    onProgress,
  } = options;

  const isMobile = isMobileDevice();
  const isGreen =
    isGreenScreen ||
    /#00ff00|#00FF00|rgb\(\s*0\s*,\s*255\s*,\s*0\s*\)/i.test(htmlContent);
  const canvasBgColor = isGreen ? '#00ff00' : '#000000';

  let isCancelled = false;
  let targetCanvas: HTMLCanvasElement | null = null;

  // Lightweight UI overlay for rendering feedback
  const overlay = document.createElement('div');
  overlay.id = 'bigma-render-overlay';
  overlay.style.position = 'fixed';
  overlay.style.inset = '0';
  overlay.style.zIndex = '99999';
  overlay.style.backgroundColor = 'rgba(7, 11, 20, 0.96)';
  overlay.style.display = 'flex';
  overlay.style.flexDirection = 'column';
  overlay.style.alignItems = 'center';
  overlay.style.justifyContent = 'center';
  overlay.style.padding = '12px';
  overlay.style.pointerEvents = 'auto';

  const card = document.createElement('div');
  card.style.width = '94%';
  card.style.maxWidth = '520px';
  card.style.backgroundColor = '#0b1329';
  card.style.border = '1px solid rgba(56, 189, 248, 0.35)';
  card.style.borderRadius = '16px';
  card.style.padding = '14px 16px';
  card.style.boxShadow = '0 20px 40px rgba(0, 0, 0, 0.8)';
  card.style.display = 'flex';
  card.style.flexDirection = 'column';
  card.style.gap = '12px';

  const headerDiv = document.createElement('div');
  headerDiv.style.display = 'flex';
  headerDiv.style.alignItems = 'center';
  headerDiv.style.justifyContent = 'space-between';
  headerDiv.innerHTML = `
    <div style="display: flex; align-items: center; gap: 10px;">
      <div style="width: 32px; height: 32px; border-radius: 9px; background: rgba(56, 189, 248, 0.15); border: 1px solid rgba(56, 189, 248, 0.35); display: flex; align-items: center; justify-content: center; color: #38bdf8; font-size: 14px;">
        <i class="fa-solid fa-film"></i>
      </div>
      <div>
        <div style="font-weight: 800; font-size: 13px; color: #f8fafc; font-family: sans-serif;">Rendering Video MP4</div>
        <div style="font-size: 11px; color: #94a3b8; font-family: sans-serif;">${width}x${height} • ${duration}s • ${isMobile ? 'Mobile Optimized' : 'High Quality'}</div>
      </div>
    </div>
    <div style="display: flex; align-items: center; gap: 8px;">
      <span id="bigma-render-badge" style="font-size: 10px; font-weight: 700; color: #4ade80; background: rgba(74, 222, 128, 0.15); border: 1px solid rgba(74, 222, 128, 0.3); padding: 2px 8px; border-radius: 9999px; font-family: sans-serif;">
        H.264 FastStart
      </span>
      <button id="bigma-cancel-render-btn" style="background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.3); color: #f87171; font-size: 11px; font-weight: 700; padding: 3px 8px; border-radius: 6px; cursor: pointer; display: flex; align-items: center; gap: 4px; font-family: sans-serif;">
        <i class="fa-solid fa-xmark"></i> Batal
      </button>
    </div>
  `;

  const previewBox = document.createElement('div');
  previewBox.style.width = '100%';
  previewBox.style.aspectRatio = '16/9';
  previewBox.style.maxHeight = '200px';
  previewBox.style.backgroundColor = '#000000';
  previewBox.style.borderRadius = '10px';
  previewBox.style.overflow = 'hidden';
  previewBox.style.position = 'relative';
  previewBox.style.border = '1px solid #1e293b';

  // Iframe to run the animation scripts in the same origin (NO sandbox attribute to prevent cross-origin blocks)
  const iframe = document.createElement('iframe');
  iframe.style.width = `${width}px`;
  iframe.style.height = `${height}px`;
  iframe.style.position = 'absolute';
  iframe.style.top = '0';
  iframe.style.left = '0';
  iframe.style.transformOrigin = 'top left';
  iframe.style.border = 'none';
  iframe.style.zIndex = '1';

  previewBox.appendChild(iframe);

  const statusText = document.createElement('div');
  statusText.style.display = 'flex';
  statusText.style.justifyContent = 'space-between';
  statusText.style.fontSize = '12px';
  statusText.style.fontWeight = '600';
  statusText.style.color = '#38bdf8';
  statusText.style.fontFamily = 'sans-serif';
  statusText.innerHTML = `<span>Menyiapkan encoder video...</span><span>0%</span>`;

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
  progressBar.style.transition = 'width 0.12s ease-out';
  progressBarContainer.appendChild(progressBar);

  card.appendChild(headerDiv);
  card.appendChild(previewBox);
  card.appendChild(statusText);
  card.appendChild(progressBarContainer);
  overlay.appendChild(card);
  document.body.appendChild(overlay);

  // Wire Cancel Button
  const cancelBtn = headerDiv.querySelector('#bigma-cancel-render-btn');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      isCancelled = true;
      updateUIProgress(0, 'Membatalkan proses render...');
    });
  }

  const updateIframeScale = () => {
    const boxWidth = previewBox.clientWidth || 320;
    const boxHeight = previewBox.clientHeight || 180;
    const scale = Math.min(boxWidth / width, boxHeight / height, 1);
    iframe.style.transform = `scale(${scale})`;
  };
  updateIframeScale();
  window.addEventListener('resize', updateIframeScale);

  // STRICT MONOTONIC PROGRESS: The progress bar can NEVER move backwards
  let currentProgress = 0;
  const updateUIProgress = (pct: number, msg: string) => {
    currentProgress = Math.max(currentProgress, pct);
    progressBar.style.width = `${currentProgress}%`;
    statusText.innerHTML = `<span>${msg}</span><span>${currentProgress}%</span>`;
    onProgress?.(currentProgress, msg);
  };

  try {
    updateUIProgress(4, 'Menyiapkan canvas & animasi...');

    const preparedHtml = prepareHtmlForVideo(htmlContent, mode, width, height, fps, isGreen);

    // Load HTML via srcdoc (same origin, 100% accessible across all mobile & desktop browsers)
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Timeout memuat animasi HTML')), 10000);
      iframe.onload = () => {
        clearTimeout(timeout);
        resolve();
      };
      iframe.srcdoc = preparedHtml;
    });

    updateIframeScale();

    if (isCancelled) throw new Error('Render dibatalkan oleh pengguna.');

    const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
    if (iframeDoc && (iframeDoc as any).fonts) {
      try {
        await (iframeDoc as any).fonts.ready;
      } catch {}
    }
    await new Promise((r) => setTimeout(r, 350));

    // Master High-Res Target Canvas
    targetCanvas = document.createElement('canvas');
    targetCanvas.id = 'bigma-render-target-canvas';
    targetCanvas.width = width;
    targetCanvas.height = height;
    targetCanvas.style.position = 'absolute';
    targetCanvas.style.top = '0';
    targetCanvas.style.left = '0';
    targetCanvas.style.width = '100%';
    targetCanvas.style.height = '100%';
    targetCanvas.style.objectFit = 'contain';
    targetCanvas.style.zIndex = '10';
    targetCanvas.style.display = 'block';
    previewBox.appendChild(targetCanvas);

    const ctx = targetCanvas.getContext('2d', {
      alpha: false,
      willReadFrequently: false,
    });
    if (!ctx) throw new Error('Tidak dapat membuat Canvas 2D context');

    const getActiveIframeCanvas = (): HTMLCanvasElement | null => {
      try {
        const doc = iframe.contentDocument || iframe.contentWindow?.document;
        if (!doc) return null;
        const c = doc.querySelector('canvas');
        if (c && c.width > 0 && c.height > 0) return c;
      } catch {}
      return null;
    };

    // Draw initial frame
    ctx.fillStyle = canvasBgColor;
    ctx.fillRect(0, 0, width, height);
    const initialAnimCanvas = getActiveIframeCanvas();
    if (initialAnimCanvas) {
      ctx.drawImage(initialAnimCanvas, 0, 0, width, height);
    }

    // =========================================================================
    // PRIMARY ENGINE: WEBCODECS H.264 + MP4-MUXER
    // Supported on:
    // - iOS Safari (iOS 16.4+, iOS 17, iOS 18)
    // - Android Chrome (Chrome 94+)
    // - Desktop Chrome, Edge, Safari, Firefox, Opera
    // Produces genuine, fast-start, zero-overhead MP4 files without captureStream
    // =========================================================================
    let webCodecsConfig: WebCodecsConfigResult = await findWorkingWebCodecsConfig(
      width,
      height,
      fps,
      bitrate
    );

    if (webCodecsConfig.supported) {
      let videoEncoder: any = null;
      try {
        const renderFps = webCodecsConfig.effectiveFps;
        const renderBitrate = webCodecsConfig.effectiveBitrateMbps;
        const totalFrames = Math.max(1, Math.round(renderFps * duration));
        const frameIntervalMs = 1000 / renderFps;

        updateUIProgress(8, `Inisialisasi H.264 encoder (${width}x${height} @ ${renderFps}fps)...`);

        const muxer = new Muxer({
          target: new ArrayBufferTarget(),
          video: {
            codec: 'avc',
            width,
            height,
            frameRate: renderFps,
          },
          fastStart: 'in-memory',
          firstTimestampBehavior: 'strict',
        });

        let encodeError: any = null;

        videoEncoder = new (window as any).VideoEncoder({
          output: (chunk: any, meta: any) => {
            muxer.addVideoChunk(chunk, meta);
          },
          error: (e: any) => {
            console.warn('[WebCodecs Warning]', e);
            encodeError = e;
          },
        });

        await videoEncoder.configure({
          codec: webCodecsConfig.codec,
          width,
          height,
          bitrate: renderBitrate * 1_000_000,
          framerate: renderFps,
          hardwareAcceleration: webCodecsConfig.hardwareAcceleration,
        });

        updateUIProgress(10, `Memulai encode video MP4...`);

        for (let frame = 0; frame < totalFrames; frame++) {
          if (isCancelled) throw new Error('Render dibatalkan oleh pengguna.');
          if (encodeError) throw encodeError;

          // Backpressure throttling for smooth mobile RAM management
          if (videoEncoder.encodeQueueSize > 5) {
            await new Promise<void>((res) => {
              let done = false;
              const onDone = () => {
                if (!done) { done = true; res(); }
              };
              if (typeof videoEncoder.addEventListener === 'function') {
                videoEncoder.addEventListener('dequeue', onDone, { once: true });
              }
              setTimeout(onDone, 16);
            });
          }

          // Render active frame
          ctx.fillStyle = canvasBgColor;
          ctx.fillRect(0, 0, width, height);
          const animCanvas = getActiveIframeCanvas();
          if (animCanvas) {
            ctx.drawImage(animCanvas, 0, 0, width, height);
          }

          const timestampMicroseconds = Math.round((frame * 1_000_000) / renderFps);
          const isKeyFrame = frame === 0 || frame % (renderFps * 2) === 0;

          // Resilient VideoFrame creation across Safari & Chrome
          let videoFrame: any = null;
          try {
            videoFrame = new (window as any).VideoFrame(targetCanvas, {
              timestamp: timestampMicroseconds,
            });
          } catch {
            // Fallback for strict browser contexts
            const bitmap = await createImageBitmap(targetCanvas);
            videoFrame = new (window as any).VideoFrame(bitmap, {
              timestamp: timestampMicroseconds,
            });
            bitmap.close();
          }

          videoEncoder.encode(videoFrame, { keyFrame: isKeyFrame });
          videoFrame.close();

          const pct = Math.round(10 + (frame / totalFrames) * 84);
          if (frame % Math.max(1, Math.round(renderFps / 4)) === 0 || frame === totalFrames - 1) {
            updateUIProgress(pct, `Merender Frame #${frame + 1}/${totalFrames} (${pct}%)...`);
          }

          // Advance animation frame inside iframe
          await new Promise<void>((resolve) => {
            if (iframe.contentWindow && iframe.contentWindow.requestAnimationFrame) {
              let resolved = false;
              iframe.contentWindow.requestAnimationFrame(() => {
                if (!resolved) { resolved = true; resolve(); }
              });
              setTimeout(() => {
                if (!resolved) { resolved = true; resolve(); }
              }, frameIntervalMs);
            } else {
              setTimeout(resolve, frameIntervalMs * 0.7);
            }
          });

          // Yield to main UI thread to prevent UI freezing
          if (frame % 6 === 0) {
            await new Promise((r) => setTimeout(r, 0));
          }
        }

        if (isCancelled) throw new Error('Render dibatalkan oleh pengguna.');

        updateUIProgress(95, 'Finalisasi berkas MP4 FastStart...');
        await Promise.race([
          videoEncoder.flush(),
          new Promise((_, rej) => setTimeout(() => rej(new Error('Flush encoder timeout')), 10000)),
        ]);
        muxer.finalize();

        const mp4Buffer = muxer.target.buffer;
        const mp4Blob = new Blob([mp4Buffer], { type: 'video/mp4' });
        const videoUrl = URL.createObjectURL(mp4Blob);

        updateUIProgress(100, 'Selesai! Video MP4 siap diunduh.');
        await new Promise((r) => setTimeout(r, 200));

        try { videoEncoder.close(); } catch {}

        return {
          blob: mp4Blob,
          url: videoUrl,
          format: 'mp4',
          sizeFormatted: `${(mp4Blob.size / (1024 * 1024)).toFixed(2)} MB`,
          width,
          height,
          duration,
          engineUsed: 'webcodecs',
        };
      } catch (wcErr: any) {
        if (isCancelled) throw wcErr;
        console.warn('WebCodecs failed, evaluating fallback recorder:', wcErr);
        if (videoEncoder) {
          try { videoEncoder.close(); } catch {}
        }
      }
    }

    if (isCancelled) throw new Error('Render dibatalkan oleh pengguna.');

    // =========================================================================
    // SECONDARY FALLBACK: UNIVERSAL STREAM RECORDER
    // For legacy devices without WebCodecs support.
    // Enhanced with timesliced buffering and dead-lock prevention.
    // =========================================================================
    const badge = headerDiv.querySelector('#bigma-render-badge');
    if (badge) badge.textContent = 'Universal Stream';

    updateUIProgress(12, 'Menyiapkan perekam video cadangan...');

    const activeCanvas = getActiveIframeCanvas();
    const stream = targetCanvas.captureStream
      ? targetCanvas.captureStream(fps)
      : (activeCanvas as any)?.captureStream?.(fps);

    if (!stream) {
      if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) {
        throw new Error(
          'Browser iOS Anda memerlukan iOS 16.4+ (Safari WebCodecs) untuk mengekspor MP4 langsung dari canvas. Silakan perbarui iOS atau gunakan Google Chrome di PC.'
        );
      }
      throw new Error('Perekam canvas stream tidak didukung pada browser ini.');
    }

    const videoTrack = stream.getVideoTracks()[0] as any;

    const mimeCandidates = [
      'video/mp4;codecs=avc1',
      'video/mp4;codecs=h264',
      'video/mp4',
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
      'video/webm;codecs=h264',
      'video/webm',
    ];

    let mediaRecorder: MediaRecorder | null = null;
    let chosenMime = '';

    const mobileBitrate = Math.min(bitrate, width > 1920 ? 10 : width > 1280 ? 6 : 4) * 1_000_000;
    const effectiveBitrate = isMobile ? mobileBitrate : bitrate * 1_000_000;

    for (const m of mimeCandidates) {
      if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)) {
        try {
          mediaRecorder = new MediaRecorder(stream, {
            mimeType: m,
            videoBitsPerSecond: effectiveBitrate,
          });
          chosenMime = m;
          break;
        } catch {
          continue;
        }
      }
    }

    if (!mediaRecorder) {
      for (const m of mimeCandidates) {
        if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)) {
          try {
            mediaRecorder = new MediaRecorder(stream, { mimeType: m });
            chosenMime = m;
            break;
          } catch {
            continue;
          }
        }
      }
    }

    if (!mediaRecorder) {
      try {
        mediaRecorder = new MediaRecorder(stream);
        chosenMime = mediaRecorder.mimeType || 'video/mp4';
      } catch (err: any) {
        throw new Error(`MediaRecorder tidak didukung: ${err.message}`);
      }
    }

    const chunks: Blob[] = [];
    mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        chunks.push(e.data);
      }
    };

    let recordResolved = false;
    const recordPromise = new Promise<Blob>((resolve, reject) => {
      if (!mediaRecorder) return reject(new Error('MediaRecorder tidak tersedia'));

      mediaRecorder.onstop = () => {
        if (recordResolved) return;
        recordResolved = true;

        if (chunks.length === 0) {
          reject(new Error('Perekaman tidak menghasilkan frame video. Silakan coba lagi.'));
          return;
        }
        const finalType = chosenMime.includes('webm') ? 'video/webm' : 'video/mp4';
        resolve(new Blob(chunks, { type: finalType }));
      };

      mediaRecorder.onerror = (e: any) => {
        if (recordResolved) return;
        recordResolved = true;
        reject(new Error(`Perekaman gagal: ${e?.error?.message || 'MediaRecorder error'}`));
      };

      // Anti-hang safety: If onstop doesn't fire within 3s after stop() but chunks exist, resolve!
      setTimeout(() => {
        if (!recordResolved && chunks.length > 0) {
          recordResolved = true;
          const finalType = chosenMime.includes('webm') ? 'video/webm' : 'video/mp4';
          resolve(new Blob(chunks, { type: finalType }));
        }
      }, 3000);
    });

    // Start with 400ms timeslice: continuously buffers data and eliminates deadlocks on stop()
    mediaRecorder.start(400);

    let isRecordingActive = true;
    let animId = 0;
    let lastDrawTime = 0;
    const targetInterval = 1000 / fps;

    const renderLoop = (timestamp: number) => {
      if (!isRecordingActive) return;

      if (!lastDrawTime || timestamp - lastDrawTime >= targetInterval * 0.85) {
        lastDrawTime = timestamp;
        ctx.fillStyle = canvasBgColor;
        ctx.fillRect(0, 0, width, height);
        const animCanvas = getActiveIframeCanvas();
        if (animCanvas) {
          ctx.drawImage(animCanvas, 0, 0, width, height);
        }

        if (videoTrack && typeof videoTrack.requestFrame === 'function') {
          try {
            videoTrack.requestFrame();
          } catch {}
        }
      }

      animId = window.requestAnimationFrame(renderLoop);
    };
    animId = window.requestAnimationFrame(renderLoop);

    const startTime = performance.now();
    const durationMs = duration * 1000;

    await new Promise<void>((resolve) => {
      const interval = setInterval(() => {
        if (isCancelled) {
          clearInterval(interval);
          resolve();
          return;
        }
        const elapsed = performance.now() - startTime;
        const pct = Math.min(94, Math.round(12 + (elapsed / durationMs) * 82));
        updateUIProgress(pct, `Merekam video (${pct}%)...`);

        if (elapsed >= durationMs) {
          clearInterval(interval);
          resolve();
        }
      }, 150);
    });

    if (isCancelled) {
      isRecordingActive = false;
      cancelAnimationFrame(animId);
      throw new Error('Render dibatalkan oleh pengguna.');
    }

    updateUIProgress(95, 'Menyelesaikan perekaman video...');

    // Stop MediaRecorder while loop is active, then cleanup
    if (mediaRecorder.state === 'recording') {
      mediaRecorder.stop();
    }

    try {
      stream.getTracks().forEach((t) => t.stop());
    } catch {}

    isRecordingActive = false;
    cancelAnimationFrame(animId);

    updateUIProgress(97, 'Menyusun berkas video...');

    const recordedBlob = await Promise.race([
      recordPromise,
      new Promise<Blob>((_, reject) =>
        setTimeout(() => {
          if (chunks.length > 0) {
            const finalType = chosenMime.includes('webm') ? 'video/webm' : 'video/mp4';
            resolveBlob(new Blob(chunks, { type: finalType }));
          } else {
            reject(new Error('Timeout penyusunan file video MediaRecorder'));
          }
        }, 5000)
      ),
    ]);

    let resolveBlob: (b: Blob) => void = () => {};

    const videoUrl = URL.createObjectURL(recordedBlob);

    updateUIProgress(100, 'Selesai! Video siap diunduh.');
    await new Promise((r) => setTimeout(r, 200));

    return {
      blob: recordedBlob,
      url: videoUrl,
      format: 'mp4',
      sizeFormatted: `${(recordedBlob.size / (1024 * 1024)).toFixed(2)} MB`,
      width,
      height,
      duration,
      engineUsed: 'mediarecorder',
    };
  } finally {
    window.removeEventListener('resize', updateIframeScale);
    if (targetCanvas && previewBox.contains(targetCanvas)) {
      previewBox.removeChild(targetCanvas);
    }
    if (document.body.contains(overlay)) {
      document.body.removeChild(overlay);
    }
  }
}
