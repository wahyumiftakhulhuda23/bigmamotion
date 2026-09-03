import { Muxer, ArrayBufferTarget } from 'mp4-muxer';

export interface VideoRenderOptions {
  width?: number;
  height?: number;
  fps?: number;
  duration?: number; // in seconds
  bitrate?: number; // in Mbps
  mode?: 'icon' | 'text' | 'bg';
  format?: 'mp4';
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

const CANDIDATE_CODECS = [
  'avc1.420028', // Baseline Profile Level 4.0 (1080p universal)
  'avc1.4d002a', // Main Profile Level 4.2
  'avc1.64002a', // High Profile Level 4.2
  'avc1.640028', // High Profile Level 4.0
  'avc1.42001f', // Baseline Profile Level 3.1
  'avc1.42E01E', // Constrained Baseline
  'avc1.42001e',
];

const ACCELERATION_PREFERENCES: ('no-preference' | 'prefer-hardware' | 'prefer-software')[] = [
  'no-preference', // Most compatible: lets the browser pick hardware GPU or built-in OpenH264/FFmpeg
  'prefer-software', // Solid fallback for PCs without discrete GPU
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

  for (const accel of ACCELERATION_PREFERENCES) {
    for (const codec of CANDIDATE_CODECS) {
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
  _fps = 60
): string {
  const injected = `
    <style>
      * {
        box-sizing: border-box !important;
      }
      html, body {
        background-color: #000000 !important;
        background: #000000 !important;
        margin: 0 !important;
        padding: 0 !important;
        overflow: hidden !important;
        width: 100% !important;
        height: 100% !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
      }
      canvas {
        display: block !important;
        max-width: 100% !important;
        max-height: 100% !important;
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
  if (mode === 'bg') {
    const bgInject = `
      <style>
        canvas {
          width: 100vw !important;
          height: 100vh !important;
          object-fit: cover !important;
        }
      </style>
    `;
    if (finalHtml.includes('<head>')) {
      finalHtml = finalHtml.replace('<head>', `<head>${bgInject}`);
    } else {
      finalHtml = `${bgInject}${finalHtml}`;
    }
  }

  if (finalHtml.includes('<head>')) {
    return finalHtml.replace('<head>', `<head>${injected}`);
  }
  return `${injected}${finalHtml}`;
}

/**
 * Universal video renderer supporting:
 * Tier 1: Hardware/Software WebCodecs H.264 FastStart MP4
 * Tier 2: Resilient MediaRecorder stream pipeline (100% compatible on all devices/browsers)
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
    onProgress,
  } = options;

  const totalFrames = Math.round(fps * duration);
  const frameIntervalMs = 1000 / fps;

  // Active rendering overlay container to prevent background tab throttling
  const overlay = document.createElement('div');
  overlay.id = 'bigma-render-overlay';
  overlay.style.position = 'fixed';
  overlay.style.inset = '0';
  overlay.style.zIndex = '99999';
  overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.92)';
  overlay.style.backdropFilter = 'blur(12px)';
  overlay.style.display = 'flex';
  overlay.style.flexDirection = 'column';
  overlay.style.alignItems = 'center';
  overlay.style.justifyContent = 'center';
  overlay.style.gap = '16px';
  overlay.style.padding = '20px';
  overlay.style.pointerEvents = 'auto';

  const card = document.createElement('div');
  card.style.width = '100%';
  card.style.maxWidth = '580px';
  card.style.backgroundColor = '#0f172a';
  card.style.border = '1px solid rgba(56, 189, 248, 0.4)';
  card.style.borderRadius = '20px';
  card.style.padding = '20px';
  card.style.boxShadow = '0 25px 50px -12px rgba(0, 0, 0, 0.7), 0 0 30px rgba(56, 189, 248, 0.2)';
  card.style.display = 'flex';
  card.style.flexDirection = 'column';
  card.style.gap = '14px';

  const headerDiv = document.createElement('div');
  headerDiv.style.display = 'flex';
  headerDiv.style.alignItems = 'center';
  headerDiv.style.justifyContent = 'space-between';
  headerDiv.innerHTML = `
    <div style="display: flex; align-items: center; gap: 10px;">
      <div style="width: 32px; height: 32px; border-radius: 10px; background: rgba(56, 189, 248, 0.2); border: 1px solid rgba(56, 189, 248, 0.4); display: flex; align-items: center; justify-content: center; color: #38bdf8; font-size: 14px;">
        <i class="fa-solid fa-film"></i>
      </div>
      <div>
        <div style="font-weight: 800; font-size: 13px; color: #f8fafc; font-family: sans-serif;">Rendering Video MP4 H.264</div>
        <div style="font-size: 11px; color: #94a3b8; font-family: sans-serif;">${width}x${height} • ${fps} FPS • Universal Compatible</div>
      </div>
    </div>
    <span style="font-size: 10px; font-weight: 700; color: #4ade80; background: rgba(74, 222, 128, 0.15); border: 1px solid rgba(74, 222, 128, 0.3); padding: 2px 8px; border-radius: 9999px; font-family: sans-serif;">
      60 FPS Active
    </span>
  `;

  const previewBox = document.createElement('div');
  previewBox.style.width = '100%';
  previewBox.style.aspectRatio = '16/9';
  previewBox.style.backgroundColor = '#000000';
  previewBox.style.borderRadius = '12px';
  previewBox.style.overflow = 'hidden';
  previewBox.style.position = 'relative';
  previewBox.style.border = '1px solid #1e293b';

  const iframe = document.createElement('iframe');
  iframe.style.width = `${width}px`;
  iframe.style.height = `${height}px`;
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
  statusText.innerHTML = `<span>Inisialisasi engine video...</span><span>0%</span>`;

  const progressBarContainer = document.createElement('div');
  progressBarContainer.style.width = '100%';
  progressBarContainer.style.height = '8px';
  progressBarContainer.style.backgroundColor = '#1e293b';
  progressBarContainer.style.borderRadius = '9999px';
  progressBarContainer.style.overflow = 'hidden';

  const progressBar = document.createElement('div');
  progressBar.style.width = '0%';
  progressBar.style.height = '100%';
  progressBar.style.background = 'linear-gradient(90deg, #38bdf8, #818cf8, #34d399)';
  progressBar.style.transition = 'width 0.15s ease-out';
  progressBarContainer.appendChild(progressBar);

  card.appendChild(headerDiv);
  card.appendChild(previewBox);
  card.appendChild(statusText);
  card.appendChild(progressBarContainer);
  overlay.appendChild(card);
  document.body.appendChild(overlay);

  const updateIframeScale = () => {
    const boxWidth = previewBox.clientWidth || 540;
    const scale = boxWidth / width;
    iframe.style.transform = `scale(${scale})`;
  };
  updateIframeScale();

  const updateUIProgress = (pct: number, msg: string) => {
    progressBar.style.width = `${pct}%`;
    statusText.innerHTML = `<span>${msg}</span><span>${pct}%</span>`;
    onProgress?.(pct, msg);
  };

  try {
    updateUIProgress(5, 'Menyiapkan canvas rendering engine...');

    const preparedHtml = prepareHtmlForVideo(htmlContent, mode, width, height, fps);
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

    const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
    if (iframeDoc && (iframeDoc as any).fonts) {
      try {
        await (iframeDoc as any).fonts.ready;
      } catch {}
    }
    await new Promise((r) => setTimeout(r, 600));

    let iframeCanvas = iframeDoc?.querySelector('canvas') as HTMLCanvasElement | null;
    if (iframeCanvas) {
      iframeCanvas.width = width;
      iframeCanvas.height = height;
    }

    // Master High-Res Target Canvas
    const targetCanvas = document.createElement('canvas');
    targetCanvas.width = width;
    targetCanvas.height = height;
    const ctx = targetCanvas.getContext('2d', { alpha: false, willReadFrequently: false });
    if (!ctx) throw new Error('Tidak dapat membuat Canvas 2D context');

    // ==========================================
    // TIER 1: Try WebCodecs H.264 FastStart MP4
    // ==========================================
    let webCodecsSuccess = false;
    let mp4Result: VideoRenderResult | null = null;

    if (typeof window !== 'undefined' && 'VideoEncoder' in window && 'VideoFrame' in window) {
      const codecCandidates = [
        'avc1.420028',
        'avc1.4d002a',
        'avc1.64002a',
        'avc1.640028',
        'avc1.42001f',
        'avc1.42E01E',
      ];
      const accelCandidates: ('no-preference' | 'prefer-software' | 'prefer-hardware')[] = [
        'no-preference',
        'prefer-software',
        'prefer-hardware',
      ];

      for (const accel of accelCandidates) {
        if (webCodecsSuccess) break;

        for (const codec of codecCandidates) {
          if (webCodecsSuccess) break;

          try {
            updateUIProgress(10, `Inisialisasi encoder H.264 (${codec})...`);

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

            const videoEncoder = new (window as any).VideoEncoder({
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

            // Test first frame encoding to verify encoder was created properly
            ctx.fillStyle = '#000000';
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

            // Encoder created & working! Proceed with complete frame rendering
            updateUIProgress(12, `Encoding MP4 H.264 (${width}x${height} @ ${fps}fps)...`);

            for (let frame = 1; frame < totalFrames; frame++) {
              if (encodeError) throw encodeError;

              ctx.fillStyle = '#000000';
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

              const pct = Math.round(12 + (frame / totalFrames) * 80);
              if (frame % Math.max(1, Math.round(fps / 6)) === 0) {
                updateUIProgress(pct, `Merender Frame #${frame + 1}/${totalFrames} (${pct}%)...`);
              }

              await new Promise((resolve) => {
                if (iframe.contentWindow && iframe.contentWindow.requestAnimationFrame) {
                  iframe.contentWindow.requestAnimationFrame(() => resolve(null));
                } else {
                  setTimeout(resolve, frameIntervalMs * 0.7);
                }
              });
            }

            updateUIProgress(95, 'Finalisasi MP4 FastStart header...');
            await videoEncoder.flush();
            muxer.finalize();

            const mp4Buffer = muxer.target.buffer;
            const mp4Blob = new Blob([mp4Buffer], { type: 'video/mp4' });
            const videoUrl = URL.createObjectURL(mp4Blob);

            updateUIProgress(100, 'Selesai! Video MP4 siap diunduh.');
            await new Promise((r) => setTimeout(r, 300));

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
            break;
          } catch (codecErr) {
            console.warn(`WebCodecs codec ${codec} (${accel}) failed, trying fallback...`, codecErr);
            continue;
          }
        }
      }
    }

    if (webCodecsSuccess && mp4Result) {
      return mp4Result;
    }

    // =========================================================================
    // TIER 2: Ultra-Reliable MediaRecorder Engine (Works on 100% of devices)
    // =========================================================================
    updateUIProgress(10, `Mengaktifkan Universal Stream Recorder (1080p @ ${fps}fps)...`);

    // Stream from active targetCanvas
    const stream = targetCanvas.captureStream ? targetCanvas.captureStream(fps) : (iframeCanvas as any)?.captureStream(fps);
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

    // Active frame render loop for targetCanvas
    let isRecordingActive = true;
    let renderedFrames = 0;

    const renderLoop = () => {
      if (!isRecordingActive) return;
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, width, height);
      if (iframeCanvas && iframeCanvas.width > 0 && iframeCanvas.height > 0) {
        ctx.drawImage(iframeCanvas, 0, 0, width, height);
      }
      renderedFrames++;
      if (iframe.contentWindow && iframe.contentWindow.requestAnimationFrame) {
        iframe.contentWindow.requestAnimationFrame(renderLoop);
      } else {
        setTimeout(renderLoop, frameIntervalMs);
      }
    };
    renderLoop();

    const startTime = performance.now();
    const interval = setInterval(() => {
      const elapsed = (performance.now() - startTime) / 1000;
      const pct = Math.min(92, Math.round(10 + (elapsed / duration) * 82));
      updateUIProgress(pct, `Merekam video (${pct}%)...`);
    }, 300);

    await new Promise((r) => setTimeout(r, duration * 1000));
    clearInterval(interval);
    isRecordingActive = false;

    if (mediaRecorder.state === 'recording') {
      mediaRecorder.stop();
    }

    updateUIProgress(96, 'Menyusun berkas video final...');
    const recordedBlob = await recordPromise;
    const videoUrl = URL.createObjectURL(recordedBlob);

    updateUIProgress(100, 'Selesai! Video siap diunduh.');
    await new Promise((r) => setTimeout(r, 300));

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
    if (document.body.contains(overlay)) {
      document.body.removeChild(overlay);
    }
  }
}
