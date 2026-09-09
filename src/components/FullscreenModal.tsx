import React, { useState } from 'react';
import { AnimationItem } from '../types';
import { renderHtmlToVideo } from '../services/videoRenderer';

interface FullscreenModalProps {
  isOpen: boolean;
  item: AnimationItem | null;
  onClose: () => void;
  showToast?: (msg: string, type?: 'info' | 'success' | 'warn' | 'error') => void;
}

export const FullscreenModal: React.FC<FullscreenModalProps> = ({ isOpen, item, onClose, showToast }) => {
  const [isExporting, setIsExporting] = useState(false);

  if (!isOpen || !item) return null;

  const handleDownloadHtml = () => {
    const htmlBlob = new Blob([item.html], { type: 'text/html;charset=utf-8' });
    const downloadUrl = URL.createObjectURL(htmlBlob);
    const a = document.createElement('a');
    a.href = downloadUrl;
    const safeTitle = item.title.replace(/[^a-z0-9]/gi, '_').toLowerCase().substring(0, 20);
    const acc = item.account ? item.account.toLowerCase() : 'manual';
    a.download = `microstock_${acc}_${item.type}_${safeTitle}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(downloadUrl), 5000);
    showToast?.('File HTML berhasil diunduh!', 'success');
  };

  const handleExportMp4 = async () => {
    setIsExporting(true);
    showToast?.('Merender video MP4 H.264 60 FPS...', 'info');

    try {
      const result = await renderHtmlToVideo(item.html, {
        width: 1920,
        height: 1080,
        fps: 60,
        duration: 10,
        bitrate: 18,
        format: 'mp4',
        mode: item.type,
      });

      const a = document.createElement('a');
      a.href = result.url;
      const safeTitle = item.title.replace(/[^a-z0-9]/gi, '_').toLowerCase().substring(0, 20);
      const acc = item.account ? item.account.toLowerCase() : 'manual';
      a.download = `microstock_${acc}_${item.type}_${safeTitle}.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(result.url), 5000);

      showToast?.(`Video MP4 (${result.sizeFormatted}) siap diputar!`, 'success');
    } catch (e: any) {
      showToast?.(`Gagal export MP4: ${e.message}`, 'error');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div
      id="fullscreen-modal"
      className="fixed inset-0 z-50 bg-black/95 backdrop-blur-xl flex flex-col p-4 sm:p-6 transition-all duration-300"
    >
      <div className="flex justify-between items-center pb-4 border-b border-gray-800 max-w-7xl mx-auto w-full">
        <div className="flex items-center gap-3">
          <span className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse"></span>
          <h3 id="fullscreen-title" className="font-bold text-gray-100 text-base sm:text-lg truncate max-w-xl">
            {item.title}
          </h3>
          <span
            id="fullscreen-badge"
            className="text-xs bg-sky-900/60 text-sky-300 border border-sky-700/50 px-2.5 py-0.5 rounded-full font-bold"
          >
            1080p 60 FPS
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleDownloadHtml}
            className="px-3.5 py-2 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
          >
            <i className="fa-solid fa-code text-sky-400"></i> Unduh HTML
          </button>
          <button
            onClick={handleExportMp4}
            disabled={isExporting}
            className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-lg shadow-purple-600/30 disabled:opacity-50"
          >
            {isExporting ? (
              <>
                <i className="fa-solid fa-spinner fa-spin"></i> Rendering MP4...
              </>
            ) : (
              <>
                <i className="fa-solid fa-film"></i> Export MP4 (H.264)
              </>
            )}
          </button>
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-300 flex items-center justify-center text-base transition cursor-pointer"
          >
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>
      </div>

      <div className="flex-1 max-w-7xl mx-auto w-full flex items-center justify-center py-4 overflow-hidden">
        <div className="w-full h-full max-h-[85vh] aspect-16-9 bg-black rounded-2xl overflow-hidden border border-gray-800 shadow-2xl relative flex items-center justify-center">
          <iframe
            id="fullscreen-iframe"
            srcDoc={item.html}
            title={item.title}
            className="w-full h-full border-0"
            sandbox="allow-scripts"
          />
        </div>
      </div>

      <div className="max-w-7xl mx-auto w-full flex justify-between items-center pt-2">
        <span className="text-xs text-gray-400 flex items-center gap-2">
          <i className="fa-solid fa-circle-play text-sky-400"></i> Display Mode: Fullscreen Canvas 16:9 60 FPS
        </span>
        <button
          onClick={onClose}
          className="px-4 py-2 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs font-semibold transition cursor-pointer"
        >
          Tutup Preview
        </button>
      </div>
    </div>
  );
};
