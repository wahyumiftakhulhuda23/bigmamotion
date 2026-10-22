import React, { useState, useEffect } from 'react';
import { AnimationItem } from '../types';
import { renderHtmlToVideo } from '../services/videoRenderer';

interface FullscreenModalProps {
  isOpen: boolean;
  item: AnimationItem | null;
  animations?: AnimationItem[];
  onClose: () => void;
  onSelectItem?: (item: AnimationItem) => void;
  onDeleteAnimation?: (id: string) => void;
  showToast?: (msg: string, type?: 'info' | 'success' | 'warn' | 'error') => void;
  renderResolution?: { width: number; height: number; label: string };
  renderFps?: number;
  renderDuration?: number;
  exportBitrate?: number;
}

export const FullscreenModal: React.FC<FullscreenModalProps> = ({
  isOpen,
  item,
  animations = [],
  onClose,
  onSelectItem,
  onDeleteAnimation,
  showToast,
  renderResolution = { width: 1920, height: 1080, label: '1080p Full HD' },
  renderFps = 60,
  renderDuration = 10,
  exportBitrate = 18,
}) => {
  const [isExporting, setIsExporting] = useState(false);

  const list = animations && animations.length > 0 ? animations : item ? [item] : [];
  const activeIndex = item ? list.findIndex((a) => a.id === item.id) : 0;
  const currentIndex = activeIndex >= 0 ? activeIndex : 0;
  const currentItem = list[currentIndex] || item;

  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < list.length - 1;

  const handlePrev = () => {
    if (hasPrev && onSelectItem) {
      onSelectItem(list[currentIndex - 1]);
    }
  };

  const handleNext = () => {
    if (hasNext && onSelectItem) {
      onSelectItem(list[currentIndex + 1]);
    }
  };

  const handleDeleteCurrent = () => {
    if (!currentItem) return;
    const targetId = currentItem.id;
    if (onDeleteAnimation) {
      onDeleteAnimation(targetId);
      showToast?.('Animasi berhasil dihapus dari daftar!', 'info');
      if (hasNext && onSelectItem) {
        onSelectItem(list[currentIndex + 1]);
      } else if (hasPrev && onSelectItem) {
        onSelectItem(list[currentIndex - 1]);
      } else {
        onClose();
      }
    }
  };

  // Keyboard navigation: Left Arrow (Prev), Right Arrow (Next), Escape (Close)
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handlePrev();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        handleNext();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, hasPrev, hasNext, currentIndex, list]);

  if (!isOpen || !currentItem) return null;

  const handleDownloadHtml = () => {
    const htmlBlob = new Blob([currentItem.html], { type: 'text/html;charset=utf-8' });
    const downloadUrl = URL.createObjectURL(htmlBlob);
    const a = document.createElement('a');
    a.href = downloadUrl;
    const safeTitle = currentItem.title.replace(/[^a-z0-9]/gi, '_').toLowerCase().substring(0, 20);
    const acc = currentItem.account ? currentItem.account.toLowerCase() : 'manual';
    a.download = `microstock_${acc}_${currentItem.type}_${safeTitle}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(downloadUrl), 5000);
    showToast?.('File HTML berhasil diunduh!', 'success');
  };

  const handleExportMp4 = async () => {
    setIsExporting(true);
    showToast?.(
      `Merender video MP4 H.264 (${renderResolution.width}x${renderResolution.height} @ ${renderFps}FPS • ${exportBitrate} Mbps)...`,
      'info'
    );

    try {
      const result = await renderHtmlToVideo(currentItem.html, {
        width: renderResolution.width,
        height: renderResolution.height,
        fps: renderFps,
        duration: renderDuration,
        bitrate: exportBitrate,
        format: 'mp4',
        mode: currentItem.type,
      });

      const a = document.createElement('a');
      a.href = result.url;
      const safeTitle = currentItem.title.replace(/[^a-z0-9]/gi, '_').toLowerCase().substring(0, 20);
      const acc = currentItem.account ? currentItem.account.toLowerCase() : 'manual';
      a.download = `microstock_${acc}_${currentItem.type}_${safeTitle}_${renderDuration}s_${exportBitrate}Mbps.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(result.url), 5000);

      showToast?.(`Video MP4 (${result.sizeFormatted} • ${result.bitrateFormatted}) berhasil diunduh!`, 'success');
    } catch (e: any) {
      showToast?.(`Gagal export MP4: ${e.message}`, 'error');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div
      id="fullscreen-modal"
      className="fixed inset-0 z-[200] bg-black/95 backdrop-blur-xl flex flex-col p-3 sm:p-5 transition-all duration-300"
    >
      {/* Top Bar Navigation & Actions */}
      <div className="flex flex-wrap justify-between items-center pb-3 border-b border-gray-800 max-w-7xl mx-auto w-full gap-2">
        {/* Left: Indicator, Title & Next/Prev Controls */}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <span className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse shrink-0"></span>

          {list.length > 1 && (
            <div className="flex items-center gap-1 bg-gray-900 border border-gray-700/80 rounded-xl px-2 py-1 shrink-0">
              <button
                onClick={handlePrev}
                disabled={!hasPrev}
                className="p-1 text-gray-300 hover:text-white disabled:opacity-25 disabled:cursor-not-allowed transition rounded hover:bg-gray-800 cursor-pointer"
                title="Sebelumnya (Keyboard ←)"
              >
                <i className="fa-solid fa-chevron-left text-xs"></i>
              </button>
              <span className="text-[11px] font-mono font-bold text-sky-300 px-1">
                {currentIndex + 1} / {list.length}
              </span>
              <button
                onClick={handleNext}
                disabled={!hasNext}
                className="p-1 text-gray-300 hover:text-white disabled:opacity-25 disabled:cursor-not-allowed transition rounded hover:bg-gray-800 cursor-pointer"
                title="Selanjutnya (Keyboard →)"
              >
                <i className="fa-solid fa-chevron-right text-xs"></i>
              </button>
            </div>
          )}

          <h3 id="fullscreen-title" className="font-bold text-gray-100 text-sm sm:text-base truncate max-w-md">
            {currentItem.title}
          </h3>

          <span
            id="fullscreen-badge"
            className="hidden sm:inline-block text-[10px] bg-sky-900/60 text-sky-300 border border-sky-700/50 px-2 py-0.5 rounded-full font-bold shrink-0"
          >
            {renderResolution.width}x{renderResolution.height} • {renderFps} FPS
          </span>
        </div>

        {/* Right: Quick Sort Actions (Delete, Download, Export, Close) */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {onDeleteAnimation && (
            <button
              onClick={handleDeleteCurrent}
              className="px-3 py-1.5 rounded-xl bg-rose-950/80 hover:bg-rose-900 border border-rose-800/80 text-rose-300 hover:text-rose-100 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer shadow-sm active:scale-95"
              title="Hapus animasi ini (Sortir langsung)"
            >
              <i className="fa-solid fa-trash-can text-rose-400"></i>
              <span className="hidden sm:inline">Hapus</span>
            </button>
          )}

          <button
            onClick={handleDownloadHtml}
            className="px-3 py-1.5 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer border border-gray-700 active:scale-95"
          >
            <i className="fa-solid fa-code text-sky-400"></i>
            <span className="hidden sm:inline">Unduh HTML</span>
          </button>

          <button
            onClick={handleExportMp4}
            disabled={isExporting}
            className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 text-white text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-lg shadow-purple-600/30 disabled:opacity-50 active:scale-95"
          >
            {isExporting ? (
              <>
                <i className="fa-solid fa-spinner fa-spin"></i>
                <span>Rendering...</span>
              </>
            ) : (
              <>
                <i className="fa-solid fa-film"></i>
                <span>Export MP4 ({exportBitrate}M)</span>
              </>
            )}
          </button>

          <button
            onClick={onClose}
            className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white flex items-center justify-center text-sm transition cursor-pointer ml-1 active:scale-95 border border-gray-700"
            title="Tutup Preview (Esc)"
          >
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>
      </div>

      {/* Main Preview Screen with Floating Side Arrows */}
      <div className="flex-1 flex items-center justify-center relative p-1 sm:p-3 max-w-7xl mx-auto w-full overflow-hidden">
        {/* Floating Side Arrow: Previous */}
        {list.length > 1 && (
          <button
            onClick={handlePrev}
            disabled={!hasPrev}
            className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 z-20 w-11 h-11 sm:w-13 sm:h-13 rounded-full bg-slate-900/80 hover:bg-slate-800 text-white border border-gray-700 shadow-2xl backdrop-blur-md flex items-center justify-center transition disabled:opacity-20 disabled:cursor-not-allowed group cursor-pointer hover:scale-105 active:scale-95"
            title="Animasi Sebelumnya (Panah Kiri ←)"
          >
            <i className="fa-solid fa-chevron-left text-base sm:text-lg text-gray-300 group-hover:text-sky-400"></i>
          </button>
        )}

        {/* Floating Side Arrow: Next */}
        {list.length > 1 && (
          <button
            onClick={handleNext}
            disabled={!hasNext}
            className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 z-20 w-11 h-11 sm:w-13 sm:h-13 rounded-full bg-slate-900/80 hover:bg-slate-800 text-white border border-gray-700 shadow-2xl backdrop-blur-md flex items-center justify-center transition disabled:opacity-20 disabled:cursor-not-allowed group cursor-pointer hover:scale-105 active:scale-95"
            title="Animasi Selanjutnya (Panah Kanan →)"
          >
            <i className="fa-solid fa-chevron-right text-base sm:text-lg text-gray-300 group-hover:text-sky-400"></i>
          </button>
        )}

        <div className="relative w-full h-full max-h-[82vh] rounded-2xl overflow-hidden shadow-2xl border border-gray-800 bg-slate-950 flex items-center justify-center">
          <iframe
            srcDoc={currentItem.html}
            title={currentItem.title}
            className="w-full h-full border-0"
            sandbox="allow-scripts"
          />
        </div>
      </div>
    </div>
  );
};
