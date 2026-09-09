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
 * Returns optimal H.264 codecs according to resolution and device tier.
 * Baseline profile codecs are universally hardware-accelerated on mobile SoCs (Qualcomm, MediaTek, Exynos, Apple A-series).
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
    'avc1.42001f', // Baseline Profile Level 3.1 - Universal support on mobile phones & low-spec PCs
    'avc1.420028', // Baseline Profile Level 4.0 - Universal 1080p mobile & desktop
    'avc1.42E01E', // Constrained Baseline Level 3.0
    'avc1.42001e', // Baseline Level 3.0
    'avc1.4d002a', // Main Profile Level 4.2
    'avc1.640028', // High Profile Level 4.0
    'avc1.64002a', // High Profile Level 4.2
  ];
}

const ACCELERATION_PREFERENCES: ('no-preference' | 'prefer-hardware' | 'prefer-software')[] = [
  'no-preference', // Lets browser choose best hardware GPU or built-in OpenH264/FFmpeg
  'prefer-software', // Highly reliable fallback for low-spec dual-core PCs and budget phones
  'prefer-hardware',
];

/**
 * Checks and finds a working H.264 WebCodecs configuration.
 */
export async function findWorkingWebCodecsConfig(
  width = 1920,
  height = 1080,
  fps = 60,
  bitrateMbps = 18
): Promise<{ supported: boolean; codec: string; hardwareAcceleration: 'no-preference' | 'prefer-hardware' | 'prefer-software' }> {
  if (typeof window === 'undefined' || !('VideoEncoder' in window) || !('VideoFrame' in window)) {
    return { supported: false, codec: '', hardwareAcceleration: 'no-preference' };
  }

  const codecs = getCandidateCodecs(width, height);

  for (const accel of ACCELERATION_PREFERENCES) {
    for (const codec of codecs) {
      try {
        const support = await (window as any).VideoEncoder.isConfigSupported({
          codec,
          width,
          height,
          bitrate: bitrateMbps * 1_000_000,
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
          const canvases = document.querySelectorAll('canvas');
          canvases.forEach(function(c) {
            if (c.width !== ${width} || c.height !== ${height}) {
              c.width = ${width};
              c.height = ${height};
            }
          });
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
 * Universal high-performance video renderer optimized for low-spec PCs & mobile devices:
 * - Backpressure Control: caps memory usage to ≤ 2 frames in-flight (avoids browser OOM/crashes)
 * - Non-blocking frame loop: regularly yields to event loop so low-spec CPUs don't freeze or lag
 * - Battery & GPU friendly: replaces heavy backdrop blur with lightweight high-contrast styling
 * - Tier 1: WebCodecs H.264 FastStart MP4 (Instant hardware/software encoding)
 * - Tier 2: Universal Stream Recorder fallback (100% compatible on iOS Safari, Android, and older devices)
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

  const isGreen =
    isGreenScreen ||
    /#00ff00|#00FF00|rgb\(\s*0\s*,\s*255\s*,\s*0\s*\)/i.test(htmlContent);
  const canvasBgColor = isGreen ? '#00ff00' : '#000000';

  const totalFrames = Math.max(1, Math.round(fps * duration));
  const frameIntervalMs = 1000 / fps;

  let isCancelled = false;

  // Lightweight high-performance overlay (no heavy backdrop-filter blur to keep low-spec devices & mobile fast)
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
        <div style="font-size: 11px; color: #94a3b8; font-family: sans-serif;">${width}x${height} • ${fps} FPS • ${bitrate} Mbps</div>
      </div>
    </div>
    <div style="display: flex; align-items: center; gap: 8px;">
      <span id="bigma-render-badge" style="font-size: 10px; font-weight: 700; color: #4ade80; background: rgba(74, 222, 128, 0.15); border: 1px solid rgba(74, 222, 128, 0.3); padding: 2px 8px; border-radius: 9999px; font-family: sans-serif;">
        Mode Hemat Memori
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

  const iframe = document.createElement('iframe');
  iframe.style.width = `${width}px`;
  iframe.style.height = `${height}px`;
  iframe.style.position = 'absolute';
  iframe.style.top = '0';
  iframe.style.left = '0';
  iframe.style.transformOrigin = 'top left';
  iframe.style.border = 'none';
  iframe.sandbox.add('allow-scripts', 'allow-same-origin');

  previewBox.appendChild(iframe);

  const statusText = document.createElement('div');
  statusText.style.display = 'flex';
  statusText.style.justifyContent = 'space-between';
  statusText.style.fontSize = '12px';
  statusText.style.fontWeight = '600';
  statusText.style.color = '#38bdf8';
  statusText.style.fontFamily = 'sans-serif';
  statusText.innerHTML = `<span>Menyiapkan pipeline konversi...</span><span>0%</span>`;

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

  const updateUIProgress = (pct: number, msg: string) => {
    progressBar.style.width = `${pct}%`;
    statusText.innerHTML = `<span>${msg}</span><span>${pct}%</span>`;
    onProgress?.(pct, msg);
  };

  /**
   * Helper: Wait for encoder queue to drain (Backpressure Control).
   * Prevents accumulating uncompressed frames in RAM/VRAM, keeping memory usage minimal.
   */
  const waitForBackpressure = async (encoder: any, maxQueue = 2): Promise<void> => {
    if (!encoder || encoder.encodeQueueSize <= maxQueue) return;
    await new Promise<void>((resolve) => {
      let resolved = false;
      const finish = () => {
        if (!resolved) {
          resolved = true;
          try {
            encoder.removeEventListener('dequeue', finish);
          } catch {}
          resolve();
        }
      };
      try {
        encoder.addEventListener('dequeue', finish);
      } catch {
        encoder.ondequeue = finish;
      }
      setTimeout(finish, 8);
    });
  };

  try {
    updateUIProgress(5, 'Menyiapkan canvas rendering engine...');

    const preparedHtml = prepareHtmlForVideo(htmlContent, mode, width, height, fps, isGreen);
    const blobHtml = new Blob([preparedHtml], { type: 'text/html;charset=utf-8' });
    const iframeUrl = URL.createObjectURL(blobHtml);

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Timeout memuat animasi HTML')), 10000);
      iframe.onload = () => {
        clearTimeout(timeout);
        resolve();
      };
      iframe.src = iframeUrl;
    });

    URL.revokeObjectURL(iframeUrl);
    updateIframeScale();

    if (isCancelled) throw new Error('Render dibatalkan oleh pengguna.');

    const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
    if (iframeDoc && (iframeDoc as any).fonts) {
      try {
        await (iframeDoc as any).fonts.ready;
      } catch {}
    }
    await new Promise((r) => setTimeout(r, 400));

    let iframeCanvas = iframeDoc?.querySelector('canvas') as HTMLCanvasElement | null;
    if (iframeCanvas) {
      iframeCanvas.width = width;
      iframeCanvas.height = height;
    }

    // Master High-Res Target Canvas with optimized 2D context
    const targetCanvas = document.createElement('canvas');
    targetCanvas.width = width;
    targetCanvas.height = height;
    const ctx = targetCanvas.getContext('2d', {
      alpha: false,
      desynchronized: true,
      willReadFrequently: false,
    });
    if (!ctx) throw new Error('Tidak dapat membuat Canvas 2D context');

    // =========================================================================
    // TIER 1: Optimized WebCodecs H.264 FastStart MP4 (With Backpressure Control)
    // =========================================================================
    let webCodecsSuccess = false;
    let mp4Result: VideoRenderResult | null = null;

    if (typeof window !== 'undefined' && 'VideoEncoder' in window && 'VideoFrame' in window) {
      const candidateCodecs = getCandidateCodecs(width, height);

      for (const accel of ACCELERATION_PREFERENCES) {
        if (webCodecsSuccess || isCancelled) break;

        for (const codec of candidateCodecs) {
          if (webCodecsSuccess || isCancelled) break;

          let videoEncoder: any = null;
          try {
            updateUIProgress(8, `Inisialisasi encoder H.264 (${codec})...`);

            const muxer = new Muxer({
              target: new ArrayBufferTarget(),
              video: {
                codec: 'avc',
                width,
                height,
                frameRate: fps,
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
              codec,
              width,
              height,
              bitrate: bitrate * 1_000_000,
              framerate: fps,
              hardwareAcceleration: accel,
              avc: { format: 'avc' },
            });

            // Test first frame encoding to verify hardware/software pipeline
            ctx.fillStyle = canvasBgColor;
            ctx.fillRect(0, 0, width, height);
            if (iframeCanvas && iframeCanvas.width > 0 && iframeCanvas.height > 0) {
              ctx.drawImage(iframeCanvas, 0, 0, width, height);
            }

            const testFrame = new (window as any).VideoFrame(targetCanvas, { timestamp: 0 });
            videoEncoder.encode(testFrame, { keyFrame: true });
            testFrame.close();

            if (encodeError) {
              try { videoEncoder.close(); } catch {}
              continue;
            }

            // Encoder validated! Render full frame sequence with strict backpressure
            updateUIProgress(10, `Encoding MP4 (${width}x${height} @ ${fps}fps)...`);

            for (let frame = 1; frame < totalFrames; frame++) {
              if (isCancelled) throw new Error('Render dibatalkan oleh pengguna.');
              if (encodeError) throw encodeError;

              // Backpressure: wait if encoder queue exceeds 2 frames (bounds memory to ~16MB)
              await waitForBackpressure(videoEncoder, 2);

              ctx.fillStyle = canvasBgColor;
              ctx.fillRect(0, 0, width, height);
              if (iframeCanvas && iframeCanvas.width > 0 && iframeCanvas.height > 0) {
                ctx.drawImage(iframeCanvas, 0, 0, width, height);
              }

              const timestampMicroseconds = Math.round((frame * 1_000_000) / fps);
              const isKeyFrame = frame % (fps * 2) === 0;

              const videoFrame = new (window as any).VideoFrame(targetCanvas, {
                timestamp: timestampMicroseconds,
              });

              videoEncoder.encode(videoFrame, { keyFrame: isKeyFrame });
              videoFrame.close();

              const pct = Math.round(10 + (frame / totalFrames) * 82);
              if (frame % Math.max(1, Math.round(fps / 5)) === 0 || frame === totalFrames - 1) {
                updateUIProgress(pct, `Merender Frame #${frame + 1}/${totalFrames} (${pct}%)...`);
              }

              // Frame pacing: wait for animation iframe
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

              // Anti-hang: yield to browser event loop every 8 frames for smooth UI & garbage collection
              if (frame % 8 === 0) {
                await new Promise((r) => setTimeout(r, 0));
              }
            }

            if (isCancelled) throw new Error('Render dibatalkan oleh pengguna.');

            updateUIProgress(94, 'Finalisasi MP4 FastStart header...');
            await videoEncoder.flush();
            muxer.finalize();

            const mp4Buffer = muxer.target.buffer;
            const mp4Blob = new Blob([mp4Buffer], { type: 'video/mp4' });
            const videoUrl = URL.createObjectURL(mp4Blob);

            updateUIProgress(100, 'Selesai! Video MP4 siap diunduh.');
            await new Promise((r) => setTimeout(r, 250));

            mp4Result = {
              blob: mp4Blob,
              url: videoUrl,
              format: 'mp4',
              sizeFormatted: `${(mp4Blob.size / (1024 * 1024)).toFixed(2)} MB`,
              width,
              height,
              duration,
              engineUsed: 'webcodecs',
            };
            webCodecsSuccess = true;
            try { videoEncoder.close(); } catch {}
            break;
          } catch (codecErr: any) {
            if (isCancelled) throw codecErr;
            if (videoEncoder) {
              try { videoEncoder.close(); } catch {}
            }
            console.warn(`WebCodecs codec ${codec} (${accel}) failed, trying next candidate...`, codecErr);
            continue;
          }
        }
      }
    }

    if (webCodecsSuccess && mp4Result) {
      return mp4Result;
    }

    if (isCancelled) throw new Error('Render dibatalkan oleh pengguna.');

    // =========================================================================
    // TIER 2: Ultra-Resilient Universal Recorder (100% device compatibility)
    // Runs on iOS Safari, Android, and low-spec systems where WebCodecs is absent
    // =========================================================================
    updateUIProgress(10, `Mengaktifkan Universal Stream Recorder (${fps} FPS)...`);

    const stream = targetCanvas.captureStream ? targetCanvas.captureStream(fps) : (iframeCanvas as any)?.captureStream?.(fps);
    if (!stream) {
      throw new Error('Perekam video tidak didukung pada browser ini.');
    }

    const mimeCandidates = [
      'video/mp4;codecs=avc1.42001f,mp4a.40.2',
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
        ? { mimeType: chosenMime, videoBitsPerSecond: bitrate * 1_000_000 }
        : { videoBitsPerSecond: bitrate * 1_000_000 }
    );

    mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        chunks.push(e.data);
      }
    };

    const recordPromise = new Promise<Blob>((resolve) => {
      mediaRecorder.onstop = () => {
        const finalType = chosenMime.includes('webm') ? 'video/webm' : 'video/mp4';
        resolve(new Blob(chunks, { type: finalType }));
      };
    });

    mediaRecorder.start(100);

    // Active frame render loop throttled to target frame rate to prevent GPU overload on 90Hz/120Hz mobile screens
    let isRecordingActive = true;
    let animId = 0;
    let lastDrawTime = 0;
    const targetInterval = 1000 / fps;

    const renderLoop = (timestamp: number) => {
      if (!isRecordingActive) return;

      if (!lastDrawTime || timestamp - lastDrawTime >= targetInterval * 0.9) {
        lastDrawTime = timestamp;
        ctx.fillStyle = canvasBgColor;
        ctx.fillRect(0, 0, width, height);
        if (iframeCanvas && iframeCanvas.width > 0 && iframeCanvas.height > 0) {
          ctx.drawImage(iframeCanvas, 0, 0, width, height);
        }
      }

      if (iframe.contentWindow && iframe.contentWindow.requestAnimationFrame) {
        animId = iframe.contentWindow.requestAnimationFrame(renderLoop);
      } else {
        animId = requestAnimationFrame(renderLoop);
      }
    };
    animId = requestAnimationFrame(renderLoop);

    const startTime = performance.now();
    const interval = setInterval(() => {
      if (isCancelled) {
        clearInterval(interval);
        isRecordingActive = false;
        if (mediaRecorder.state === 'recording') mediaRecorder.stop();
        return;
      }
      const elapsed = (performance.now() - startTime) / 1000;
      const pct = Math.min(92, Math.round(10 + (elapsed / duration) * 82));
      updateUIProgress(pct, `Merekam video (${pct}%)...`);
    }, 250);

    await new Promise((r) => setTimeout(r, duration * 1000));
    clearInterval(interval);
    isRecordingActive = false;
    cancelAnimationFrame(animId);

    if (isCancelled) throw new Error('Render dibatalkan oleh pengguna.');

    if (mediaRecorder.state === 'recording') {
      mediaRecorder.stop();
    }

    updateUIProgress(96, 'Menyusun berkas video final...');
    const recordedBlob = await recordPromise;
    const videoUrl = URL.createObjectURL(recordedBlob);

    updateUIProgress(100, 'Selesai! Video siap diunduh.');
    await new Promise((r) => setTimeout(r, 250));

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
    if (document.body.contains(overlay)) {
      document.body.removeChild(overlay);
    }
  }
}
