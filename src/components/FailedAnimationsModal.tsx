import React, { useState } from 'react';
import { FailedAutoPilotItem } from './AutoPilotModal';

export interface UnifiedFailedItem {
  id: string;
  source: 'autopilot' | 'manual' | 'notepad';
  accountName?: string;
  prompt: string;
  error?: string;
  rawItem?: FailedAutoPilotItem;
  promptIndex?: number;
}

interface FailedAnimationsModalProps {
  isOpen: boolean;
  onClose: () => void;
  failedManualPrompts: string[];
  failedAutoPilotItems: FailedAutoPilotItem[];
  onRetrySingleManualPrompt: (prompt: string, index: number) => Promise<void>;
  onRetrySingleAutoPilotItem: (item: FailedAutoPilotItem) => Promise<void>;
  onRetryAllFailedManual: () => Promise<void>;
  onRetryAllFailedAutoPilot: () => Promise<void>;
  onClearAllFailed: () => void;
  onSendToPromptList: (prompts: string[]) => void;
  isProcessing?: boolean;
}

export const FailedAnimationsModal: React.FC<FailedAnimationsModalProps> = ({
  isOpen,
  onClose,
  failedManualPrompts,
  failedAutoPilotItems,
  onRetrySingleManualPrompt,
  onRetrySingleAutoPilotItem,
  onRetryAllFailedManual,
  onRetryAllFailedAutoPilot,
  onClearAllFailed,
  onSendToPromptList,
  isProcessing = false,
}) => {
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<'all' | 'autopilot' | 'manual'>('all');
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  // Combine failed items into a unified list
  const unifiedItems: UnifiedFailedItem[] = [
    ...failedAutoPilotItems.map((f, idx) => ({
      id: f.id || `auto_${idx}_${f.prompt.substring(0, 10)}`,
      source: 'autopilot' as const,
      accountName: f.accountName || 'Auto Pilot',
      prompt: f.prompt,
      error: f.error || 'Gagal merender animasi',
      rawItem: f,
    })),
    ...failedManualPrompts.map((p, idx) => ({
      id: `man_${idx}_${p.substring(0, 10)}`,
      source: 'manual' as const,
      accountName: 'Manual Workflow',
      prompt: p,
      error: 'API quota/timeout pada render manual',
      promptIndex: idx,
    })),
  ];

  const filteredItems = unifiedItems.filter((it) => {
    if (activeFilter === 'autopilot') return it.source === 'autopilot';
    if (activeFilter === 'manual') return it.source === 'manual';
    return true;
  });

  const totalCount = unifiedItems.length;

  const handleCopyAll = () => {
    const text = unifiedItems.map((it) => it.prompt).join('\n');
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSendAllToPrompts = () => {
    const list = unifiedItems.map((it) => it.prompt);
    onSendToPromptList(list);
    onClose();
  };

  const handleRetrySingle = async (it: UnifiedFailedItem) => {
    setRetryingId(it.id);
    try {
      if (it.source === 'autopilot' && it.rawItem) {
        await onRetrySingleAutoPilotItem(it.rawItem);
      } else if (it.promptIndex !== undefined) {
        await onRetrySingleManualPrompt(it.prompt, it.promptIndex);
      }
    } finally {
      setRetryingId(null);
    }
  };

  const handleRetryAllBatch = async () => {
    if (failedAutoPilotItems.length > 0) {
      await onRetryAllFailedAutoPilot();
    }
    if (failedManualPrompts.length > 0) {
      await onRetryAllFailedManual();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      <div className="bg-slate-900 border border-rose-500/40 rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-gray-800 bg-gradient-to-r from-slate-950 via-rose-950/30 to-slate-950 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-500/20 border border-rose-500/50 flex items-center justify-center text-rose-400 shadow-md shadow-rose-500/20">
              <i className="fa-solid fa-triangle-exclamation text-lg"></i>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-black text-white">Daftar Animasi Gagal</h3>
                <span className="px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/40 text-[11px] font-extrabold">
                  {totalCount} Item
                </span>
              </div>
              <p className="text-xs text-gray-400">
                Daftar prompt yang belum berhasil dirender. Tanpa dummy animasi, dapat dicoba ulang satuan atau batch.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white flex items-center justify-center transition cursor-pointer"
          >
            <i className="fa-solid fa-xmark text-sm"></i>
          </button>
        </div>

        {/* Mechanism Notification Banner */}
        <div className="bg-slate-950/90 border-b border-gray-800/80 px-4 py-2.5 flex items-center gap-2.5 text-xs text-amber-300/90">
          <i className="fa-solid fa-clock-rotate-left text-amber-400 text-sm shrink-0"></i>
          <span className="leading-snug">
            <strong>Mekanisme Anti-Limit:</strong> Sistem menerapkan 3x percobaan bertahap dengan jeda pendinginan API{' '}
            <strong className="text-white font-mono">3 detik</strong>,{' '}
            <strong className="text-white font-mono">5 detik</strong>, dan{' '}
            <strong className="text-white font-mono">10 detik</strong>. Animasi yang masih gagal dilewati tanpa membuatkan dummy agar Anda dapat mencobanya ulang di sini.
          </span>
        </div>

        {/* Filter and Mass Actions Bar */}
        <div className="p-3 sm:px-5 bg-slate-950/50 border-b border-gray-800/60 flex flex-wrap items-center justify-between gap-2.5">
          {/* Filter Pills */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setActiveFilter('all')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                activeFilter === 'all'
                  ? 'bg-rose-600 text-white shadow-sm'
                  : 'bg-slate-800 text-gray-400 hover:text-white'
              }`}
            >
              Semua ({totalCount})
            </button>
            <button
              onClick={() => setActiveFilter('autopilot')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                activeFilter === 'autopilot'
                  ? 'bg-amber-600 text-white shadow-sm'
                  : 'bg-slate-800 text-gray-400 hover:text-white'
              }`}
            >
              Auto Pilot ({failedAutoPilotItems.length})
            </button>
            <button
              onClick={() => setActiveFilter('manual')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                activeFilter === 'manual'
                  ? 'bg-sky-600 text-white shadow-sm'
                  : 'bg-slate-800 text-gray-400 hover:text-white'
              }`}
            >
              Manual ({failedManualPrompts.length})
            </button>
          </div>

          {/* Quick Actions */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              onClick={handleCopyAll}
              disabled={totalCount === 0}
              className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-gray-300 text-xs font-semibold flex items-center gap-1 transition cursor-pointer disabled:opacity-40"
              title="Salin seluruh prompt gagal ke clipboard"
            >
              <i className={`fa-solid ${copied ? 'fa-check text-emerald-400' : 'fa-copy'}`}></i>
              <span>{copied ? 'Tersalin!' : 'Salin Semua'}</span>
            </button>

            <button
              onClick={handleSendAllToPrompts}
              disabled={totalCount === 0}
              className="px-2.5 py-1 rounded-lg bg-sky-950 hover:bg-sky-900 border border-sky-800 text-sky-300 text-xs font-semibold flex items-center gap-1 transition cursor-pointer disabled:opacity-40"
              title="Kirim ke daftar prompt manual untuk diedit"
            >
              <i className="fa-solid fa-arrow-turn-up text-[10px]"></i>
              <span>Muat ke Prompt</span>
            </button>

            <button
              onClick={onClearAllFailed}
              disabled={totalCount === 0 || isProcessing}
              className="px-2.5 py-1 rounded-lg bg-rose-950/60 hover:bg-rose-900/80 border border-rose-800/60 text-rose-300 text-xs font-semibold flex items-center gap-1 transition cursor-pointer disabled:opacity-40"
              title="Bersihkan daftar animasi gagal"
            >
              <i className="fa-solid fa-trash-can text-[10px]"></i>
              <span>Bersihkan</span>
            </button>
          </div>
        </div>

        {/* Scrollable Items List */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-5 space-y-2">
          {filteredItems.length === 0 ? (
            <div className="py-12 text-center text-gray-500 space-y-2">
              <i className="fa-solid fa-circle-check text-emerald-400 text-3xl"></i>
              <p className="text-sm font-bold text-gray-300">Tidak ada animasi yang berstatus gagal!</p>
              <p className="text-xs text-gray-500">Seluruh proses render telah berhasil dibuat atau daftar telah dibersihkan.</p>
            </div>
          ) : (
            filteredItems.map((item, index) => {
              const isRetryingThis = retryingId === item.id;
              return (
                <div
                  key={item.id}
                  className="p-3 rounded-xl bg-slate-950/70 border border-gray-800 hover:border-rose-500/40 transition flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm"
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] font-mono font-bold text-gray-500">#{index + 1}</span>
                      <span
                        className={`text-[9px] px-1.5 py-0.2 rounded font-bold uppercase tracking-wider ${
                          item.source === 'autopilot'
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                            : 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                        }`}
                      >
                        {item.accountName}
                      </span>
                      <span className="text-[10px] text-rose-400 truncate font-medium">
                        <i className="fa-solid fa-circle-exclamation text-[9px] mr-1"></i>
                        {item.error}
                      </span>
                    </div>
                    <p className="text-xs text-gray-200 font-medium select-all break-words leading-relaxed">
                      {item.prompt}
                    </p>
                  </div>

                  {/* Single Retry Button */}
                  <div className="shrink-0 flex items-center gap-2 self-end sm:self-center">
                    <button
                      type="button"
                      onClick={() => handleRetrySingle(item)}
                      disabled={isProcessing || isRetryingThis}
                      className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-md disabled:opacity-50 cursor-pointer active:scale-95"
                      title="Coba render ulang animasi ini secara satuan (jeda 3s, 5s, 10s)"
                    >
                      {isRetryingThis ? (
                        <>
                          <i className="fa-solid fa-spinner fa-spin text-xs"></i>
                          <span>Merender...</span>
                        </>
                      ) : (
                        <>
                          <i className="fa-solid fa-rotate-right text-xs"></i>
                          <span>Ulangi (Satuan)</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-gray-800 bg-slate-950 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-xs text-gray-400 text-center sm:text-left">
            <span>Tersisa </span>
            <strong className="text-rose-400 font-bold">{totalCount} item</strong>
            <span> yang dapat dicoba kembali secara berurutan.</span>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              onClick={onClose}
              className="flex-1 sm:flex-none px-4 py-2 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-bold transition cursor-pointer"
            >
              Tutup
            </button>

            <button
              onClick={handleRetryAllBatch}
              disabled={totalCount === 0 || isProcessing}
              className="flex-1 sm:flex-none px-5 py-2 rounded-xl bg-gradient-to-r from-rose-600 via-amber-600 to-orange-500 hover:from-rose-500 text-white text-xs font-extrabold shadow-lg shadow-rose-600/30 flex items-center justify-center gap-2 transition cursor-pointer active:scale-95 disabled:opacity-40"
              title="Coba ulang seluruh animasi gagal satu per satu dengan delay bertahap"
            >
              {isProcessing ? (
                <>
                  <i className="fa-solid fa-spinner fa-spin text-xs"></i>
                  <span>Sedang Memproses...</span>
                </>
              ) : (
                <>
                  <i className="fa-solid fa-play text-xs"></i>
                  <span>Ulangi Semua ({totalCount} Batch)</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
