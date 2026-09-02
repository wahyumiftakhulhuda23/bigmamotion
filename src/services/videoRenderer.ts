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
}

/**
 * Checks if WebCodecs H.264 VideoEncoder is supported in the browser.
 */
export async function checkH264Support(
  width = 1920,
  height = 1080,
  fps = 60,
  bitrateMbps = 18
): Promise<{ supported: boolean; codec: string }> {
  if (typeof window === 'undefined' || !('VideoEncoder' in window) || !('VideoFrame' in window)) {
    return { supported: false, codec: '' };
  }

  const candidateCodecs = [
    'avc1.640028', // High profile level 4.0
    'avc1.4d002a', // Main profile level 4.2
    'avc1.42001f', // Baseline profile level 3.1
    'avc1.42E01E', // Constrained baseline
    'avc1.420028', // Baseline level 4.0
  ];

  for (const codec of candidateCodecs) {
    try {
      const support = await (window as any).VideoEncoder.isConfigSupported({
        codec,
        width,
        height,
        bitrate: bitrateMbps * 1_000_000,
        framerate: fps,
      });
      if (support && support.supported) {
        return { supported: true, codec };
      }
    } catch {
      continue;
    }
  }

  return { supported: false, codec: '' };
}

/**
 * Injects styling and frame synchronization into animation HTML.
 * Guarantees that internal canvas is sized to full HD / 4K resolution
 * and animation runs smoothly.
 */
export function prepareHtmlForVideo(
  htmlContent: string,
  mode: 'icon' | 'text' | 'bg' = 'icon',
  width = 1920,
  height = 1080,
  fps = 60
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
        // Enforce high-res canvas resolution on mount & resize
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
 * Render animation HTML directly to universal MP4 (H.264 FastStart).
 * Keeps the rendering iframe in active DOM layer so browser requestAnimationFrame
 * is never throttled or frozen, producing continuous 60 FPS video.
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
    bitrate = 18, // 18 Mbps high quality for microstock
    mode = 'icon',
    onProgress,
  } = options;

  const totalFrames = Math.round(fps * duration);
  const frameIntervalMs = 1000 / fps;

  // Create an active visual overlay container so browsers (Chrome/Safari)
  // do NOT freeze or throttle requestAnimationFrame
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

  // Live render card
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
        <div style="font-size: 11px; color: #94a3b8; font-family: sans-serif;">${width}x${height} • ${fps} FPS • FastStart</div>
      </div>
    </div>
    <span style="font-size: 10px; font-weight: 700; color: #4ade80; background: rgba(74, 222, 128, 0.15); border: 1px solid rgba(74, 222, 128, 0.3); padding: 2px 8px; border-radius: 9999px; font-family: sans-serif;">
      60 FPS Active
    </span>
  `;

  // Preview viewport where canvas runs live
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

  // Scale iframe to fit in the previewBox
  previewBox.appendChild(iframe);

  const statusText = document.createElement('div');
  statusText.style.display = 'flex';
  statusText.style.justifyContent = 'space-between';
  statusText.style.fontSize = '12px';
  statusText.style.fontWeight = '600';
  statusText.style.color = '#38bdf8';
  statusText.style.fontFamily = 'sans-serif';
  statusText.innerHTML = `<span>Inisialisasi encoder H.264...</span><span>0%</span>`;

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

  // Resize listener to dynamically scale iframe inside previewBox
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

    // Wait for fonts & initial frame render
    const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
    if (iframeDoc && (iframeDoc as any).fonts) {
      try {
        await (iframeDoc as any).fonts.ready;
      } catch {}
    }
    await new Promise((r) => setTimeout(r, 600));

    // Find canvas in iframe
    let iframeCanvas = iframeDoc?.querySelector('canvas') as HTMLCanvasElement | null;
    if (iframeCanvas) {
      iframeCanvas.width = width;
      iframeCanvas.height = height;
    }

    // Check H.264 WebCodecs support
    const h264Check = await checkH264Support(width, height, fps, bitrate);
    const useWebCodecsMP4 = h264Check.supported;

    if (useWebCodecsMP4) {
      updateUIProgress(10, `Encoding MP4 H.264 Universal (${width}x${height} @ ${fps}fps)...`);

      // Master high-res render canvas
      const targetCanvas = document.createElement('canvas');
      targetCanvas.width = width;
      targetCanvas.height = height;
      const ctx = targetCanvas.getContext('2d', { alpha: false, willReadFrequently: false });

      if (!ctx) throw new Error('Tidak dapat membuat Canvas 2D rendering context');

      const muxer = new Muxer({
        target: new ArrayBufferTarget(),
        video: {
          codec: 'avc',
          width,
          height,
          frameRate: fps,
        },
        fastStart: 'in-memory', // Ensures moov atom is at the beginning of the MP4 for 100% desktop playback
        firstTimestampBehavior: 'strict',
      });

      let encodeError: any = null;

      const videoEncoder = new (window as any).VideoEncoder({
        output: (chunk: any, meta: any) => {
          muxer.addVideoChunk(chunk, meta);
        },
        error: (e: any) => {
          console.error('[WebCodecs Error]', e);
          encodeError = e;
        },
      });

      await videoEncoder.configure({
        codec: h264Check.codec,
        width,
        height,
        bitrate: bitrate * 1_000_000,
        framerate: fps,
        hardwareAcceleration: 'prefer-hardware',
        avc: { format: 'avc' },
      });

      // Frame-by-frame live encoding loop
      for (let frame = 0; frame < totalFrames; frame++) {
        if (encodeError) throw encodeError;

        // Clear target canvas
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, width, height);

        // Capture current active canvas frame from iframe
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

        // Update progress
        const pct = Math.round(10 + (frame / totalFrames) * 82);
        if (frame % Math.max(1, Math.round(fps / 6)) === 0) {
          updateUIProgress(pct, `Merender Frame #${frame + 1}/${totalFrames} (${pct}%)...`);
        }

        // Wait for next animation frame in the live iframe
        await new Promise((resolve) => {
          if (iframe.contentWindow && iframe.contentWindow.requestAnimationFrame) {
            iframe.contentWindow.requestAnimationFrame(() => resolve(null));
          } else {
            setTimeout(resolve, frameIntervalMs * 0.7);
          }
        });
      }

      updateUIProgress(94, 'Finalisasi MP4 FastStart header...');
      await videoEncoder.flush();
      muxer.finalize();

      const mp4Buffer = muxer.target.buffer;
      const mp4Blob = new Blob([mp4Buffer], { type: 'video/mp4' });
      const videoUrl = URL.createObjectURL(mp4Blob);

      updateUIProgress(100, 'Selesai! Video MP4 siap diunduh.');
      await new Promise((r) => setTimeout(r, 400));

      return {
        blob: mp4Blob,
        url: videoUrl,
        format: 'mp4',
        sizeFormatted: `${(mp4Blob.size / (1024 * 1024)).toFixed(2)} MB`,
        width,
        height,
        duration,
      };
    } else {
      // Fallback MediaRecorder using canvas.captureStream with high bitrate
      updateUIProgress(10, `Merekam video (${duration}s @ ${fps}fps)...`);

      let stream: MediaStream | null = null;
      if (iframeCanvas && typeof (iframeCanvas as any).captureStream === 'function') {
        stream = (iframeCanvas as any).captureStream(fps);
      }

      if (!stream) {
        throw new Error('Canvas captureStream tidak didukung di browser ini.');
      }

      // Check supported MP4/H.264 mime
      let chosenMime = 'video/mp4;codecs=h264';
      if (!MediaRecorder.isTypeSupported(chosenMime)) {
        chosenMime = 'video/mp4';
      }
      if (!MediaRecorder.isTypeSupported(chosenMime)) {
        chosenMime = 'video/webm;codecs=vp9';
      }

      const chunks: Blob[] = [];
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: chosenMime,
        videoBitsPerSecond: bitrate * 1_000_000,
      });

      mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          chunks.push(e.data);
        }
      };

      const recordPromise = new Promise<Blob>((resolve) => {
        mediaRecorder.onstop = () => {
          const resultBlob = new Blob(chunks, { type: 'video/mp4' });
          resolve(resultBlob);
        };
      });

      mediaRecorder.start(100);

      const startTime = performance.now();
      const interval = setInterval(() => {
        const elapsed = (performance.now() - startTime) / 1000;
        const pct = Math.min(92, Math.round(10 + (elapsed / duration) * 82));
        updateUIProgress(pct, `Merekam video MP4 (${pct}%)...`);
      }, 400);

      await new Promise((r) => setTimeout(r, duration * 1000));
      clearInterval(interval);

      if (mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
      }

      const recordedBlob = await recordPromise;
      const videoUrl = URL.createObjectURL(recordedBlob);
      updateUIProgress(100, 'Selesai! Video MP4 siap diunduh.');
      await new Promise((r) => setTimeout(r, 400));

      return {
        blob: recordedBlob,
        url: videoUrl,
        format: 'mp4',
        sizeFormatted: `${(recordedBlob.size / (1024 * 1024)).toFixed(2)} MB`,
        width,
        height,
        duration,
      };
    }
  } finally {
    // Clean up render overlay
    if (document.body.contains(overlay)) {
      document.body.removeChild(overlay);
    }
  }
}
