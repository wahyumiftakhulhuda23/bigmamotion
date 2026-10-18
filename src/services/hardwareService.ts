export interface HardwareProfile {
  ramStr: string;
  cpuCores: number;
  gpuInfo: string;
  osInfo: string;
  isLowSpec: boolean;
  recommendedResolution: { width: number; height: number; label: string };
  recommendedFps: number;
  recommendedBitrate: number;
  recommendedDuration: number;
}

export function detectDeviceHardware(): HardwareProfile {
  const cores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 4 : 4;
  const mem = typeof navigator !== 'undefined' && (navigator as any).deviceMemory ? (navigator as any).deviceMemory : 4;
  const ramStr = mem >= 8 ? `~${mem} GB RAM (High-Performance)` : mem >= 4 ? `~${mem} GB RAM (Standard)` : `~${mem || 2} GB RAM (Low Spec / Minimum)`;

  let gpuInfo = 'GPU / Hardware Acceleration Active';
  try {
    const canvas = document.createElement('canvas');
    const gl = (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')) as any;
    if (gl) {
      const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
      if (debugInfo) {
        const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
        if (renderer) gpuInfo = renderer;
      }
    }
  } catch {}

  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  let osInfo = 'Desktop OS';
  if (/android/i.test(ua)) osInfo = 'Android Mobile';
  else if (/iphone|ipad|ipod/i.test(ua)) osInfo = 'iOS Device';
  else if (/win/i.test(ua)) osInfo = 'Windows PC';
  else if (/mac/i.test(ua)) osInfo = 'macOS';
  else if (/linux/i.test(ua)) osInfo = 'Linux PC';

  const isLowSpec = /android|iphone|ipad|ipod|mobile/i.test(ua) || cores <= 4 || mem <= 4 || /celeron|pentium|atom|intel hd/i.test(gpuInfo);

  return {
    ramStr,
    cpuCores: cores,
    gpuInfo,
    osInfo,
    isLowSpec,
    recommendedResolution: isLowSpec
      ? { width: 1280, height: 720, label: '720p HD (1280x720 • Ringan & Cepat)' }
      : { width: 1920, height: 1080, label: '1080p Full HD (1920x1080 • Standar Pro)' },
    recommendedFps: isLowSpec ? 30 : 60,
    recommendedBitrate: isLowSpec ? 15 : 25,
    recommendedDuration: 10,
  };
}
