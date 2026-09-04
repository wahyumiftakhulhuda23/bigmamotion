import React, { useRef, useEffect, useState } from 'react';
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
  const [isLogExpanded, setIsLogExpanded] = useState(true);

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
        return 'text-rose-400 font-bold';
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
    <section className="lg:col-span-7 flex flex-col gap-4">
      {/* Live System Activity Log Box (Collapsible & Compact) */}
      <div className="glass-card rounded-2xl p-3.5 border border-gray-800/90 space-y-2 shadow-lg">
        <div className="flex justify-between items-center">
          <button
            onClick={() => setIsLogExpanded(!isLogExpanded)}
            className="flex items-center gap-2 text-xs font-extrabold text-gray-200 hover:text-sky-300 transition cursor-pointer"
          >
            <i className={`fa-solid fa-chevron-${isLogExpanded ? 'down' : 'right'} text-[10px] text-gray-500`}></i>
            <i className="fa-solid fa-terminal text-emerald-400"></i>
            <span>System Console</span>
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            {logs.length > 0 && (
              <span className="text-[10px] text-gray-500 font-mono">({logs.length} events)</span>
            )}
          </button>
          <div className="flex items-center gap-1.5">
            <button
              onClick={onClearLogs}
              className="text-[10px] text-gray-400 hover:text-gray-200 px-2 py-0.5 rounded-lg bg-gray-900 border border-gray-800 transition cursor-pointer"
            >
              <i className="fa-solid fa-eraser mr-1"></i> Bersihkan
            </button>
          </div>
        </div>

        {isLogExpanded && (
          <div
            ref={logConsoleRef}
            id="activity-log-console"
            className="h-24 overflow-y-auto bg-black/90 rounded-xl p-2.5 font-mono text-[11px] text-gray-300 space-y-1 border border-gray-900 shadow-inner"
          >
            {logs.length === 0 ? (
              <div className="text-gray-500 italic text-[10px]">
                [System Ready] Generator siap digunakan. Silakan mulai buat animasi...
              </div>
            ) : (
              logs.map((log) => (
                <div
                  key={log.id}
                  className={`${getLogColorClass(log.type)} py-0.2 border-b border-gray-850/30 leading-snug`}
                >
                  <span className="text-gray-600 mr-1 text-[10px]">[{log.timestamp}]</span>
                  {log.text}
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Progress Status Bar */}
      {progressShow && (
        <div
          id="progress-container"
          className="glass-card rounded-2xl p-3.5 border border-sky-500/30 bg-sky-950/20 space-y-1.5 animate-fadeIn"
        >
          <div className="flex justify-between text-xs font-semibold">
            <span className="text-sky-300 flex items-center gap-2">
              <i className="fa-solid fa-spinner fa-spin text-sky-400"></i> {progressText}
            </span>
            <span className="text-sky-400 font-bold font-mono">{progressPercent}%</span>
          </div>
          <div className="w-full bg-gray-800 h-1.5 rounded-full overflow-hidden">
            <div
              className="bg-gradient-to-r from-sky-500 via-indigo-500 to-emerald-500 h-full transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            ></div>
          </div>
        </div>
      )}

      {/* Gallery Header */}
      <div className="flex items-center justify-between">
        <h2 className="font-extrabold text-sm text-gray-200 flex items-center gap-2">
          <i className="fa-solid fa-desktop text-sky-400"></i>
          <span>Live Preview Animasi</span>
        </h2>
        <div className="flex gap-2">
          <button
            onClick={onOpenGalleryModal}
            className="text-xs text-sky-100 hover:text-white flex items-center gap-1.5 transition px-3 py-1.5 rounded-xl bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 shadow-md shadow-sky-500/20 font-bold border border-sky-400/30 cursor-pointer active:scale-95"
          >
            <i className="fa-solid fa-images"></i>
            <span>Buka Galeri</span>
          </button>
        </div>
      </div>

      {/* Latest Animation or Empty State */}
      {!latestAnimation ? (
        <div
          id="empty-state"
          className="glass-card rounded-2xl p-10 border border-dashed border-gray-800 text-center flex flex-col items-center justify-center gap-2.5 shadow-md"
        >
          <div className="w-14 h-14 rounded-2xl bg-gray-900/80 border border-gray-800 flex items-center justify-center text-gray-500 text-xl shadow-inner animate-pulse">
            <i className="fa-solid fa-photo-film"></i>
          </div>
          <h3 className="font-bold text-gray-300 text-xs sm:text-sm">Belum Ada Animasi Ditampilkan</h3>
          <p className="text-[11px] text-gray-500 max-w-sm">
            Klik "Generate Prompt AI" lalu "Generate Animasi" untuk melihat preview 60 FPS di sini.
          </p>
        </div>
      ) : (
        <div className="glass-card rounded-2xl overflow-hidden border border-sky-500/30 shadow-xl shadow-sky-950/20 transition hover:border-sky-500/50 flex flex-col">
          <div className="aspect-16-9 w-full bg-slate-950 relative flex items-center justify-center group overflow-hidden">
            <iframe
              srcDoc={latestAnimation.html}
              title={latestAnimation.title}
              className="w-full h-full border-0 pointer-events-none"
              sandbox="allow-scripts"
            />
            {/* Hover Action Overlay */}
            <div className="absolute inset-0 bg-transparent flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/65 backdrop-blur-sm gap-2 p-3 flex-wrap">
              <button
                onClick={() => onOpenFullscreen(latestAnimation)}
                className="px-3.5 py-2 bg-sky-500 hover:bg-sky-400 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 transition transform hover:scale-105 shadow-lg shadow-sky-500/50 cursor-pointer"
              >
                <i className="fa-solid fa-expand"></i> Fullscreen
              </button>
              <button
                onClick={() => onDownloadSingle(latestAnimation)}
                className="px-3.5 py-2 bg-gray-800/90 hover:bg-gray-700 text-gray-200 font-bold text-xs rounded-xl flex items-center gap-1.5 transition border border-gray-700 shadow-md cursor-pointer"
                title="Unduh Kode HTML"
              >
                <i className="fa-solid fa-code"></i> Unduh HTML
              </button>
              {onExportMp4Single && (
                <button
                  onClick={() => onExportMp4Single(latestAnimation)}
                  disabled={!!isRenderingMp4}
                  className="px-3.5 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 transition shadow-lg shadow-purple-500/30 cursor-pointer disabled:opacity-50"
                  title="Export MP4 Video (H.264)"
                >
                  {isRenderingMp4 ? (
                    <>
                      <i className="fa-solid fa-circle-notch fa-spin text-purple-200"></i> Rendering MP4...
                    </>
                  ) : (
                    <>
                      <i className="fa-solid fa-film text-purple-300"></i> Unduh MP4
                    </>
                  )}
                </button>
              )}
            </div>
          </div>

          {/* Bottom Card Bar */}
          <div className="p-3 sm:p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-gray-900/70 border-t border-gray-800/80">
            <div className="flex-1 min-w-0">
              <h3 className="font-bold text-gray-100 text-xs sm:text-sm truncate w-full flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0"></span>
                <span className="truncate">{latestAnimation.title}</span>
              </h3>
              <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                <span className="text-[9px] bg-sky-950/80 text-sky-400 border border-sky-800/80 px-1.5 py-0.2 rounded uppercase font-bold">
                  {latestAnimation.type}
                </span>
                <span className="text-[9px] bg-gray-800 text-gray-400 border border-gray-700 px-1.5 py-0.2 rounded capitalize">
                  {latestAnimation.style}
                </span>
                {(latestAnimation.isGreenScreen || /#00ff00|rgb\(0,\s*255,\s*0\)/i.test(latestAnimation.html)) && (
                  <span className="text-[9px] bg-emerald-950/90 text-emerald-300 border border-emerald-700/60 px-1.5 py-0.2 rounded font-bold flex items-center gap-1">
                    <i className="fa-solid fa-circle text-[6px] text-emerald-400"></i> Green Screen
                  </span>
                )}
                {latestAnimation.account && latestAnimation.account !== 'Manual' && (
                  <span className="text-[9px] bg-amber-950/60 text-amber-400 border border-amber-800/50 px-1.5 py-0.2 rounded flex items-center gap-1">
                    <i className="fa-solid fa-robot"></i> {latestAnimation.account}
                  </span>
                )}
                <span className="text-[9px] bg-emerald-950/80 text-emerald-400 border border-emerald-800/50 px-1.5 py-0.2 rounded font-bold">
                  60 FPS HD
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={() => onDownloadSingle(latestAnimation)}
                className="px-2.5 py-1 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-[11px] font-semibold border border-gray-700 transition flex items-center gap-1 cursor-pointer"
              >
                <i className="fa-solid fa-download text-sky-400 text-[10px]"></i> HTML
              </button>
              {onExportMp4Single && (
                <button
                  onClick={() => onExportMp4Single(latestAnimation)}
                  disabled={!!isRenderingMp4}
                  className="px-3 py-1 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-[11px] font-bold transition flex items-center gap-1 cursor-pointer shadow-sm shadow-purple-600/30 disabled:opacity-50"
                >
                  {isRenderingMp4 ? (
                    <i className="fa-solid fa-spinner fa-spin text-[10px]"></i>
                  ) : (
                    <i className="fa-solid fa-film text-[10px]"></i>
                  )}
                  <span>MP4</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
