import React, { useState } from 'react';
import { AnimationItem } from '../types';
import { renderHtmlToVideo } from '../services/videoRenderer';
import JSZip from 'jszip';

interface GalleryModalProps {
  isOpen: boolean;
  animations: AnimationItem[];
  downloadQueue: string[];
  onToggleQueue: (id: string) => void;
  onClearQueue: () => void;
  onSelectAllToQueue: () => void;
  onClearAllAnimations: () => void;
  onDeleteAnimation: (id: string) => void;
  onClose: () => void;
  onOpenFullscreen: (item: AnimationItem) => void;
  showToast: (msg: string, type?: 'info' | 'success' | 'warn' | 'error') => void;
}

export const GalleryModal: React.FC<GalleryModalProps> = ({
  isOpen,
  animations,
  downloadQueue,
  onToggleQueue,
  onClearQueue,
  onSelectAllToQueue,
  onClearAllAnimations,
  onDeleteAnimation,
  onClose,
  onOpenFullscreen,
  showToast,
}) => {
  const [currentFilter, setCurrentFilter] = useState<string>('All');
  const [downloadLogs, setDownloadLogs] = useState<{ text: string; type: 'info' | 'success' | 'error' }[]>([]);
  const [isDownloading, setIsDownloading] = useState(false);
  const [exportingMp4Id, setExportingMp4Id] = useState<string | null>(null);
  const [isConfirmingClearAll, setIsConfirmingClearAll] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  if (!isOpen) return null;

  const uniqueAccounts = Array.from(new Set(animations.map((a) => a.account || 'Manual')));

  const filteredList =
    currentFilter === 'All'
      ? animations
      : animations.filter((a) => (a.account || 'Manual') === currentFilter);

  const addDownloadLog = (text: string, type: 'info' | 'success' | 'error' = 'info') => {
    setDownloadLogs((prev) => [...prev, { text, type }]);
  };

  const handleDownloadSingleHtml = (item: AnimationItem) => {
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
    showToast('File HTML berhasil diunduh!', 'success');
  };

  const handleExportSingleMp4 = async (item: AnimationItem) => {
    setExportingMp4Id(item.id);
    addDownloadLog(`[MP4 Export] Memulai render 1080p 60FPS: "${item.title.substring(0, 25)}..."`, 'info');
    showToast(`Merender MP4 H.264 untuk "${item.title.substring(0, 20)}..."`, 'info');

    try {
      const result = await renderHtmlToVideo(item.html, {
        width: 1920,
        height: 1080,
        fps: 60,
        duration: 10,
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

      addDownloadLog(`[MP4 Sukses] "${item.title}" (${result.sizeFormatted}) siap diputar!`, 'success');
      showToast(`Video MP4 (${result.sizeFormatted}) berhasil diunduh!`, 'success');
    } catch (e: any) {
      addDownloadLog(`[MP4 Error] Gagal: ${e.message}`, 'error');
      showToast(`Gagal export MP4: ${e.message}`, 'error');
    } finally {
      setExportingMp4Id(null);
    }
  };

  const processDownloadQueue = async () => {
    if (downloadQueue.length === 0) {
      showToast('Antrean unduhan kosong! Silakan pilih animasi terlebih dahulu.', 'warn');
      return;
    }

    setIsDownloading(true);
    setDownloadLogs([]);
    addDownloadLog(`Memulai unduhan masal ${downloadQueue.length} file...`, 'info');

    let successCount = 0;

    for (let i = 0; i < downloadQueue.length; i++) {
      const id = downloadQueue[i];
      const item = animations.find((a) => a.id === id);

      if (!item) continue;

      addDownloadLog(`Mengunduh: ${item.title.substring(0, 25)}...`, 'info');

      try {
        const htmlBlob = new Blob([item.html], { type: 'text/html;charset=utf-8' });
        const downloadUrl = URL.createObjectURL(htmlBlob);
        const a = document.createElement('a');
        a.href = downloadUrl;

        const safeTitle = item.title.replace(/[^a-z0-9]/gi, '_').toLowerCase().substring(0, 20);
        const accountName = item.account ? item.account.toLowerCase() : 'manual';
        a.download = `microstock_${accountName}_${item.type}_${safeTitle}.html`;

        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(downloadUrl), 5000);

        successCount++;
        addDownloadLog(`Selesai: File #${i + 1} berhasil diunduh.`, 'success');

        await new Promise((r) => setTimeout(r, 600));
      } catch (e: any) {
        addDownloadLog(`Gagal mengunduh #${i + 1}: ${e.message}`, 'error');
      }
    }

    setIsDownloading(false);
    onClearQueue();
    addDownloadLog(`Proses Selesai! Berhasil mengunduh ${successCount} file.`, 'success');
    showToast(`Berhasil mengunduh ${successCount} file.`, 'success');
  };

  const downloadAllAsZip = async () => {
    const itemsToZip =
      downloadQueue.length > 0
        ? animations.filter((a) => downloadQueue.includes(a.id))
        : filteredList;

    if (itemsToZip.length === 0) {
      showToast('Tidak ada animasi untuk dikemas ke ZIP!', 'warn');
      return;
    }

    setIsDownloading(true);
    addDownloadLog(`Mengompres ${itemsToZip.length} file animasi ke dalam ZIP...`, 'info');

    try {
      const zip = new JSZip();

      itemsToZip.forEach((item, index) => {
        const safeTitle = item.title.replace(/[^a-z0-9]/gi, '_').toLowerCase().substring(0, 25);
        const acc = item.account ? item.account.toLowerCase() : 'manual';
        const fileName = `${String(index + 1).padStart(2, '0')}_microstock_${acc}_${item.type}_${safeTitle}.html`;
        zip.file(fileName, item.html);
      });

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const downloadUrl = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `BigMA_Animations_Package_${Date.now()}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(downloadUrl), 5000);

      addDownloadLog(`Berhasil membuat paket ZIP (${itemsToZip.length} item).`, 'success');
      showToast(`Paket ZIP (${itemsToZip.length} file) berhasil diunduh!`, 'success');
    } catch (e: any) {
      addDownloadLog(`Gagal membuat ZIP: ${e.message}`, 'error');
      showToast(`Gagal membuat file ZIP: ${e.message}`, 'error');
    } finally {
      setIsDownloading(false);
    }
  };

  const handleDeleteItem = (id: string, title: string) => {
    onDeleteAnimation(id);
    addDownloadLog(`[Hapus] Animasi "${title.substring(0, 25)}" telah dihapus dari galeri.`, 'info');
    showToast(`Animasi berhasil dihapus.`, 'info');
    setDeletingId(null);
  };

  const handleConfirmClearAll = () => {
    onClearAllAnimations();
    setIsConfirmingClearAll(false);
    addDownloadLog(`[Galeri] Seluruh riwayat galeri telah dibersihkan.`, 'info');
    showToast('Galeri berhasil dibersihkan.', 'success');
  };

  return (
    <div
      id="gallery-modal"
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto"
    >
      <div className="glass-card rounded-2xl max-w-6xl w-full border border-gray-800 p-6 space-y-4 max-h-[92vh] flex flex-col shadow-2xl my-6">
        {/* Header */}
        <div className="flex justify-between items-center border-b border-gray-800 pb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-sky-500/20 border border-sky-500/30 flex items-center justify-center text-sky-400">
              <i className="fa-solid fa-layer-group text-lg"></i>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-gray-100 text-base">Galeri & Antrean Animasi</h3>
                <span className="px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-300 text-xs font-bold border border-sky-500/30">
                  {animations.length} Item Tersimpan
                </span>
              </div>
              <p className="text-xs text-gray-400">
                Unduh file HTML atau langsung ekspor ke video MP4 (H.264 60 FPS) untuk microstock.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {downloadQueue.length > 0 && (
              <button
                onClick={processDownloadQueue}
                disabled={isDownloading}
                className="px-3.5 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-lg shadow-emerald-500/20 cursor-pointer disabled:opacity-50"
              >
                {isDownloading ? (
                  <i className="fa-solid fa-spinner fa-spin"></i>
                ) : (
                  <i className="fa-solid fa-download"></i>
                )}
                <span>Unduh Antrean ({downloadQueue.length})</span>
              </button>
            )}

            <button
              onClick={downloadAllAsZip}
              disabled={isDownloading || animations.length === 0}
              className="px-3.5 py-2 bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-lg shadow-sky-500/20 cursor-pointer disabled:opacity-50"
            >
              <i className="fa-solid fa-file-zipper"></i>
              <span>Unduh ZIP</span>
            </button>

            {/* Clear All with in-app confirmation (No blocked window.confirm) */}
            {animations.length > 0 && (
              <>
                {isConfirmingClearAll ? (
                  <div className="flex items-center gap-1 bg-red-950/80 border border-red-500/40 px-2 py-1 rounded-xl">
                    <span className="text-[10px] text-red-300 font-bold">Hapus semua?</span>
                    <button
                      onClick={handleConfirmClearAll}
                      className="px-2 py-1 bg-red-600 hover:bg-red-500 text-white rounded text-[10px] font-bold cursor-pointer"
                    >
                      Ya, Hapus
                    </button>
                    <button
                      onClick={() => setIsConfirmingClearAll(false)}
                      className="px-2 py-1 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded text-[10px] cursor-pointer"
                    >
                      Batal
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setIsConfirmingClearAll(true)}
                    className="px-3 py-2 bg-gray-800 hover:bg-red-500/20 text-gray-400 hover:text-red-400 border border-gray-700 hover:border-red-500/30 rounded-xl text-xs transition cursor-pointer flex items-center gap-1"
                    title="Hapus Seluruh Histori Galeri"
                  >
                    <i className="fa-solid fa-trash-can"></i>
                    <span className="hidden sm:inline">Hapus Semua</span>
                  </button>
                )}
              </>
            )}

            <button onClick={onClose} className="text-gray-400 hover:text-white text-lg cursor-pointer ml-1">
              <i className="fa-solid fa-xmark"></i>
            </button>
          </div>
        </div>

        {/* Filter Tabs */}
        {animations.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 pb-2 border-b border-gray-800 shrink-0">
            <div className="flex gap-2 overflow-x-auto pb-1">
              <button
                onClick={() => setCurrentFilter('All')}
                className={`px-4 py-1.5 rounded-full text-xs font-bold transition whitespace-nowrap cursor-pointer ${
                  currentFilter === 'All'
                    ? 'bg-sky-500 text-white shadow-lg'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700 border border-gray-700'
                }`}
              >
                Semua Akun ({animations.length})
              </button>

              {uniqueAccounts.map((acc) => {
                const isActive = currentFilter === acc;
                const isBot = acc !== 'Manual';
                const count = animations.filter((a) => (a.account || 'Manual') === acc).length;

                return (
                  <button
                    key={acc}
                    onClick={() => setCurrentFilter(acc)}
                    className={`px-4 py-1.5 rounded-full text-xs font-bold transition whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
                      isActive
                        ? isBot
                          ? 'bg-amber-500 text-white shadow-lg shadow-amber-500/20 border border-amber-400'
                          : 'bg-sky-500 text-white shadow-lg'
                        : 'bg-gray-800 text-gray-400 hover:bg-gray-700 border border-gray-700'
                    }`}
                  >
                    <i className={`fa-solid ${isBot ? 'fa-robot' : 'fa-user'}`}></i>
                    <span>
                      {acc} ({count})
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={onSelectAllToQueue}
                className="text-[11px] px-2.5 py-1 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg border border-gray-700 transition cursor-pointer"
              >
                Pilih Semua ke Antrean
              </button>
              {downloadQueue.length > 0 && (
                <button
                  onClick={onClearQueue}
                  className="text-[11px] px-2.5 py-1 bg-gray-800 hover:bg-gray-700 text-amber-400 rounded-lg border border-gray-700 transition cursor-pointer"
                >
                  Kosongkan Antrean
                </button>
              )}
            </div>
          </div>
        )}

        {/* Content Area: Grid + Log Sidebar */}
        <div className="flex-1 overflow-hidden flex flex-col lg:flex-row gap-6 mt-2">
          {/* Gallery Grid */}
          <div className="flex-1 overflow-y-auto pr-2 pb-8 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 auto-rows-max">
            {filteredList.length === 0 ? (
              <div className="col-span-full text-center py-14 text-gray-500 text-xs italic">
                Belum ada animasi di galeri untuk kategori ini.
              </div>
            ) : (
              filteredList.map((item) => {
                const isQueued = downloadQueue.includes(item.id);
                const isRenderingMp4 = exportingMp4Id === item.id;
                const borderClass = isQueued
                  ? 'border-emerald-500 bg-emerald-950/30 ring-1 ring-emerald-500/50'
                  : 'border-gray-800 bg-gray-900/40 hover:border-gray-700';

                return (
                  <div
                    key={item.id}
                    className={`glass-card rounded-xl overflow-hidden border transition flex flex-col justify-between ${borderClass} shadow-lg hover:shadow-sky-950/30`}
                  >
                    <div className="aspect-16-9 w-full bg-slate-950 relative overflow-hidden shrink-0 group">
                      <iframe
                        srcDoc={item.html}
                        title={item.title}
                        className="w-full h-full border-0 pointer-events-none"
                        sandbox="allow-scripts"
                      />
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition flex items-center justify-center gap-2 p-2">
                        <button
                          onClick={() => onOpenFullscreen(item)}
                          className="px-3 py-1.5 bg-sky-500 hover:bg-sky-400 text-white rounded-lg text-xs font-bold transition cursor-pointer shadow-lg flex items-center gap-1"
                          title="Layar Penuh"
                        >
                          <i className="fa-solid fa-expand"></i> Fullscreen
                        </button>
                        <button
                          onClick={() => handleExportSingleMp4(item)}
                          disabled={isRenderingMp4}
                          className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-xs font-bold transition cursor-pointer shadow-lg flex items-center gap-1 disabled:opacity-50"
                          title="Render ke MP4 H.264"
                        >
                          <i className="fa-solid fa-film"></i> MP4
                        </button>
                      </div>
                    </div>

                    <div className="p-3.5 flex flex-col justify-between items-start gap-3 flex-1 w-full bg-gray-950/40">
                      <div className="w-full">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="font-bold text-gray-200 text-xs truncate flex-1" title={item.title}>
                            {item.title}
                          </h3>
                          {/* Individual item delete button */}
                          {deletingId === item.id ? (
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                onClick={() => handleDeleteItem(item.id, item.title)}
                                className="text-[10px] px-1.5 py-0.5 bg-red-600 hover:bg-red-500 text-white rounded font-bold cursor-pointer"
                                title="Yakin Hapus"
                              >
                                Ya
                              </button>
                              <button
                                onClick={() => setDeletingId(null)}
                                className="text-[10px] px-1.5 py-0.5 bg-gray-800 text-gray-300 rounded cursor-pointer"
                                title="Batal"
                              >
                                ✕
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setDeletingId(item.id)}
                              className="text-gray-500 hover:text-red-400 p-1 cursor-pointer transition shrink-0"
                              title="Hapus animasi ini"
                            >
                              <i className="fa-solid fa-trash-can text-xs"></i>
                            </button>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                          <span className="text-[9px] bg-sky-950/80 text-sky-400 border border-sky-800/60 px-1.5 py-0.5 rounded font-bold uppercase">
                            {item.type}
                          </span>
                          <span className="text-[9px] text-gray-500">•</span>
                          <span className="text-[9px] text-gray-400 font-medium">
                            {item.account || 'Manual'}
                          </span>
                          <span className="text-[9px] text-gray-500">•</span>
                          <span className="text-[9px] text-emerald-400 font-medium">1080p 60FPS</span>
                        </div>
                      </div>

                      {/* Action buttons on card */}
                      <div className="grid grid-cols-3 gap-1.5 w-full shrink-0 pt-2 border-t border-gray-800/80 mt-1">
                        <button
                          onClick={() => handleDownloadSingleHtml(item)}
                          className="px-2 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-[11px] font-semibold flex items-center justify-center gap-1 transition cursor-pointer border border-gray-700"
                          title="Unduh Kode HTML"
                        >
                          <i className="fa-solid fa-code text-sky-400"></i> HTML
                        </button>

                        <button
                          onClick={() => handleExportSingleMp4(item)}
                          disabled={isRenderingMp4}
                          className="px-2 py-1.5 bg-purple-600/30 hover:bg-purple-600/50 text-purple-300 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1 transition cursor-pointer border border-purple-500/40 disabled:opacity-50"
                          title="Export ke MP4 (H.264 Playable)"
                        >
                          {isRenderingMp4 ? (
                            <i className="fa-solid fa-circle-notch fa-spin text-purple-300"></i>
                          ) : (
                            <i className="fa-solid fa-film text-purple-400"></i>
                          )}
                          <span>MP4</span>
                        </button>

                        <button
                          onClick={() => onToggleQueue(item.id)}
                          className={`px-2 py-1.5 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1 transition cursor-pointer border ${
                            isQueued
                              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                              : 'bg-sky-500/20 text-sky-300 border-sky-500/40 hover:bg-sky-500/30'
                          }`}
                          title={isQueued ? 'Hapus dari antrean' : 'Tambah ke antrean'}
                        >
                          <i className={`fa-solid ${isQueued ? 'fa-check' : 'fa-plus'}`}></i>
                          <span>{isQueued ? 'Antrean' : 'Pilih'}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Download Logs Sidebar */}
          <div className="w-full lg:w-80 flex flex-col gap-3 shrink-0">
            <div className="bg-gray-900/80 border border-gray-800 rounded-xl p-4 flex-1 flex flex-col max-h-48 lg:max-h-full">
              <div className="flex items-center justify-between border-b border-gray-800 pb-2 mb-2">
                <h4 className="text-xs font-bold text-gray-300 flex items-center gap-1.5">
                  <i className="fa-solid fa-terminal text-emerald-400"></i> Log Unduhan & Ekspor
                </h4>
                {(isDownloading || exportingMp4Id) && (
                  <span className="text-emerald-400 text-xs animate-spin">
                    <i className="fa-solid fa-circle-notch"></i>
                  </span>
                )}
              </div>
              <div
                id="download-log-console"
                className="flex-1 overflow-y-auto space-y-1 text-[11px] font-mono text-gray-400"
              >
                {downloadLogs.length === 0 ? (
                  <div className="italic text-gray-600">
                    Pilih animasi lalu klik "Unduh Antrean", "Unduh ZIP", atau "MP4" untuk mengekspor...
                  </div>
                ) : (
                  downloadLogs.map((l, i) => (
                    <div
                      key={i}
                      className={
                        l.type === 'success'
                          ? 'text-emerald-400 font-semibold'
                          : l.type === 'error'
                          ? 'text-red-400 font-semibold'
                          : 'text-gray-400'
                      }
                    >
                      {l.text}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
