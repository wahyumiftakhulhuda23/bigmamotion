import React, { useRef, useEffect } from 'react';
import { AnimationItem, LogItem } from '../types';

interface RightPanelProps {
  logs: LogItem[];
  onClearLogs: () => void;
  progressShow: boolean;
  progressText: string;
  progressPercent: number;
  latestAnimation: AnimationItem | null;
  onOpenGalleryModal: () => void;
  onOpenFullscreen: (item: AnimationItem) => void;
  onDownloadSingle: (item: AnimationItem) => void;
  onExportMp4Single?: (item: AnimationItem) => void;
  isExportingMp4Id?: string | null;
}

export const RightPanel: React.FC<RightPanelProps> = ({
  logs,
  onClearLogs,
  progressShow,
  progressText,
  progressPercent,
  latestAnimation,
  onOpenGalleryModal,
  onOpenFullscreen,
  onDownloadSingle,
  onExportMp4Single,
  isExportingMp4Id,
}) => {
  const logConsoleRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logConsoleRef.current) {
      logConsoleRef.current.scrollTop = logConsoleRef.current.scrollHeight;
    }
  }, [logs]);

  const getLogColorClass = (type: LogItem['type']) => {
    switch (type) {
      case 'success':
        return 'text-emerald-400 font-bold';
      case 'error':
        return 'text-red-400 font-bold';
      case 'warn':
        return 'text-amber-400';
      case 'cyan':
        return 'text-cyan-400 font-bold';
      case 'green':
        return 'text-green-400 font-bold';
      default:
        return 'text-gray-300';
    }
  };

  const isRenderingMp4 = latestAnimation && isExportingMp4Id === latestAnimation.id;

  return (
    <section className="lg:col-span-7 flex flex-col gap-6">
      {/* Live System Activity Log Box */}
      <div className="glass-card rounded-2xl p-4 border border-gray-800 space-y-3">
        <div className="flex justify-between items-center pb-2 border-b border-gray-800">
          <div className="flex items-center gap-2 text-xs font-bold text-gray-200">
            <i className="fa-solid fa-terminal text-emerald-400"></i>
            <span>System Console Log</span>
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
          </div>
          <button
            onClick={onClearLogs}
            className="text-[10px] text-gray-400 hover:text-gray-200 px-2 py-0.5 rounded bg-gray-800 border border-gray-700 transition cursor-pointer"
          >
            <i className="fa-solid fa-eraser mr-1"></i> Bersihkan Log
          </button>
        </div>
        <div
          ref={logConsoleRef}
          id="activity-log-console"
          className="h-32 overflow-y-auto bg-black/80 rounded-xl p-3 font-mono text-[11px] text-gray-300 space-y-1 border border-gray-900 shadow-inner"
        >
          {logs.length === 0 ? (
            <div className="text-gray-500 italic">
              [System Ready] Silakan atur konfigurasi AI di menu atas atau langsung buat animasi...
            </div>
          ) : (
            logs.map((log) => (
              <div
                key={log.id}
                className={`${getLogColorClass(log.type)} py-0.5 border-b border-gray-800/40 leading-relaxed`}
              >
                <span className="text-gray-600 mr-1.5">[{log.timestamp}]</span>
                {log.text}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Progress Status Bar */}
      {progressShow && (
        <div
          id="progress-container"
          className="glass-card rounded-2xl p-4 border border-sky-500/30 bg-sky-950/20 space-y-2 animate-fadeIn"
        >
          <div className="flex justify-between text-xs font-semibold">
            <span className="text-sky-300 flex items-center gap-2">
              <i className="fa-solid fa-spinner fa-spin"></i> {progressText}
            </span>
            <span className="text-sky-400 font-bold">{progressPercent}%</span>
          </div>
          <div className="w-full bg-gray-800 h-2 rounded-full overflow-hidden">
            <div
              className="bg-gradient-to-r from-sky-500 to-emerald-500 h-full transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            ></div>
          </div>
        </div>
      )}

      {/* Gallery Header */}
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-base text-gray-200 flex items-center gap-2">
          <i className="fa-solid fa-desktop text-sky-400"></i> Preview Animasi Terbaru
        </h2>
        <div className="flex gap-2">
          <button
            onClick={onOpenGalleryModal}
            className="text-xs text-sky-100 hover:text-white flex items-center gap-1.5 transition px-3.5 py-2 rounded-xl bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 shadow-lg shadow-sky-500/20 font-bold border border-sky-400/30 cursor-pointer"
          >
            <i className="fa-solid fa-images"></i> Buka Galeri Antrean
          </button>
        </div>
      </div>

      {/* Latest Animation or Empty State */}
      {!latestAnimation ? (
        <div
          id="empty-state"
          className="glass-card rounded-2xl p-12 border border-dashed border-gray-800 text-center flex flex-col items-center justify-center gap-3"
        >
          <div className="w-16 h-16 rounded-2xl bg-gray-800/80 border border-gray-700 flex items-center justify-center text-gray-500 text-2xl">
            <i className="fa-solid fa-photo-film"></i>
          </div>
          <h3 className="font-bold text-gray-300 text-sm">Belum Ada Animasi Ditampilkan</h3>
          <p className="text-xs text-gray-500 max-w-sm">
            Jalankan "Generate Prompt AI" lalu "Generate Animasi" atau gunakan "Auto Pilot" untuk melihat hasilnya di
            sini.
          </p>
        </div>
      ) : (
        <div className="glass-card rounded-2xl overflow-hidden border border-sky-500/30 shadow-xl shadow-sky-900/20 transition hover:border-sky-500/60 flex flex-col">
          <div className="aspect-16-9 w-full bg-slate-950 relative flex items-center justify-center group overflow-hidden">
            <iframe
              srcDoc={latestAnimation.html}
              title={latestAnimation.title}
              className="w-full h-full border-0 pointer-events-none"
              sandbox="allow-scripts"
            />
            <div className="absolute inset-0 bg-transparent flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/60 backdrop-blur-sm gap-2.5 p-4 flex-wrap">
              <button
                onClick={() => onOpenFullscreen(latestAnimation)}
                className="px-4 py-2.5 bg-sky-500 hover:bg-sky-400 text-white font-bold text-xs rounded-xl flex items-center gap-2 transition transform hover:scale-105 shadow-lg shadow-sky-500/50 cursor-pointer"
              >
                <i className="fa-solid fa-expand"></i> Fullscreen
              </button>
              <button
                onClick={() => onDownloadSingle(latestAnimation)}
                className="px-4 py-2.5 bg-gray-800/90 hover:bg-gray-700 text-gray-200 font-bold text-xs rounded-xl flex items-center gap-2 transition border border-gray-700 shadow-lg cursor-pointer"
                title="Unduh Kode HTML"
              >
                <i className="fa-solid fa-code"></i> Unduh HTML
              </button>
              {onExportMp4Single && (
                <button
                  onClick={() => onExportMp4Single(latestAnimation)}
                  disabled={!!isRenderingMp4}
                  className="px-4 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 text-white font-bold text-xs rounded-xl flex items-center gap-2 transition shadow-lg shadow-purple-500/30 cursor-pointer disabled:opacity-50"
                  title="Export MP4 Video (H.264)"
                >
                  {isRenderingMp4 ? (
                    <>
                      <i className="fa-solid fa-circle-notch fa-spin text-purple-200"></i> Rendering MP4...
                    </>
                  ) : (
                    <>
                      <i className="fa-solid fa-film text-purple-300"></i> Unduh MP4 (H.264)
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
          <div className="p-4 sm:p-5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-gray-900/60">
            <div className="flex-1 min-w-0">
              <h3 className="font-bold text-gray-100 text-base truncate w-full flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                {latestAnimation.title}
              </h3>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <span className="text-[10px] bg-sky-900/60 text-sky-400 border border-sky-800/80 px-2 py-0.5 rounded uppercase font-bold">
                  {latestAnimation.type}
                </span>
                <span className="text-[10px] bg-gray-800 text-gray-400 border border-gray-700 px-2 py-0.5 rounded capitalize">
                  {latestAnimation.style}
                </span>
                {latestAnimation.account && latestAnimation.account !== 'Manual' && (
                  <span className="text-[10px] bg-amber-900/40 text-amber-400 border border-amber-800/50 px-2 py-0.5 rounded flex items-center gap-1">
                    <i className="fa-solid fa-robot"></i> {latestAnimation.account}
                  </span>
                )}
                <span className="text-[10px] bg-emerald-950 text-emerald-400 border border-emerald-800/50 px-2 py-0.5 rounded font-bold">
                  1080p 60 FPS
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => onDownloadSingle(latestAnimation)}
                className="px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-semibold border border-gray-700 transition flex items-center gap-1.5 cursor-pointer"
              >
                <i className="fa-solid fa-download text-sky-400"></i> HTML
              </button>
              {onExportMp4Single && (
                <button
                  onClick={() => onExportMp4Single(latestAnimation)}
                  disabled={!!isRenderingMp4}
                  className="px-3.5 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-md shadow-purple-600/30 disabled:opacity-50"
                >
                  {isRenderingMp4 ? (
                    <i className="fa-solid fa-spinner fa-spin"></i>
                  ) : (
                    <i className="fa-solid fa-film"></i>
                  )}
                  <span>MP4 Video</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
