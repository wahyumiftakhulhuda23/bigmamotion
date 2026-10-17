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
  exportBitrate?: number;
  onExportBitrateChange?: (bitrate: number) => void;
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
  exportBitrate = 18,
  onExportBitrateChange,
}) => {
  const [currentFilter, setCurrentFilter] = useState<string>('All');
  const [downloadLogs, setDownloadLogs] = useState<{ text: string; type: 'info' | 'success' | 'error' }[]>([]);
  const [isDownloading, setIsDownloading] = useState(false);
  const [exportingMp4Id, setExportingMp4Id] = useState<string | null>(null);
  const [exportingAccount, setExportingAccount] = useState<string | null>(null);
  const [isConfirmingClearAll, setIsConfirmingClearAll] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Batch Render ZIP Account Selection Modal State
  const [isBatchModalOpen, setIsBatchModalOpen] = useState(false);
  const [selectedBatchAccounts, setSelectedBatchAccounts] = useState<Record<string, boolean>>({});

  if (!isOpen) return null;

  const uniqueAccounts: string[] = Array.from(new Set(animations.map((a) => String(a.account || 'Manual'))));

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
    addDownloadLog(`[MP4 Export] Memulai render 1080p 60FPS (${exportBitrate} Mbps): "${item.title.substring(0, 25)}..."`, 'info');
    showToast(`Merender MP4 H.264 (${exportBitrate} Mbps) untuk "${item.title.substring(0, 20)}..."`, 'info');

    try {
      const result = await renderHtmlToVideo(item.html, {
        width: 1920,
        height: 1080,
        fps: 60,
        duration: 10,
        bitrate: exportBitrate,
        mode: item.type,
      });

      const a = document.createElement('a');
      a.href = result.url;
      const safeTitle = item.title.replace(/[^a-z0-9]/gi, '_').toLowerCase().substring(0, 20);
      const acc = item.account ? item.account.toLowerCase() : 'manual';
      a.download = `microstock_${acc}_${item.type}_${safeTitle}_${result.bitrateMbps}Mbps.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(result.url), 5000);

      addDownloadLog(`[MP4 Sukses] "${item.title}" (${result.sizeFormatted} • ${result.bitrateFormatted}) siap diunggah!`, 'success');
      showToast(`Video MP4 (${result.sizeFormatted} • ${result.bitrateFormatted}) berhasil diunduh!`, 'success');
    } catch (e: any) {
      addDownloadLog(`[MP4 Error] Gagal: ${e.message}`, 'error');
      showToast(`Gagal export MP4: ${e.message}`, 'error');
    } finally {
      setExportingMp4Id(null);
    }
  };

  const handleOpenBatchModal = () => {
    const initial: Record<string, boolean> = {};
    uniqueAccounts.forEach((acc) => {
      initial[acc] = true; // default all checked
    });
    setSelectedBatchAccounts(initial);
    setIsBatchModalOpen(true);
  };

  // Batch Render Selected Accounts -> ZIP package grouped by account subfolders
  const handleStartBatchZipRender = async () => {
    const chosenAccounts = Object.keys(selectedBatchAccounts).filter((acc) => selectedBatchAccounts[acc]);
    if (chosenAccounts.length === 0) {
      showToast('Pilih setidaknya satu akun untuk batch render!', 'warn');
      return;
    }

    setIsBatchModalOpen(false);
    setIsDownloading(true);
    setDownloadLogs([]);
    addDownloadLog(`[Batch ZIP Render] Memulai rendering untuk akun: ${chosenAccounts.join(', ')} (${exportBitrate} Mbps)...`, 'info');
    showToast(`Memulai batch render ZIP untuk ${chosenAccounts.length} akun...`, 'info');

    try {
      const zip = new JSZip();
      let totalRendered = 0;

      for (const accName of chosenAccounts) {
        const accountItems = animations.filter((a) => (a.account || 'Manual') === accName);
        if (accountItems.length === 0) continue;

        const safeAccFolder = accName.replace(/[^a-z0-9_-]/gi, '_');
        const folder = zip.folder(safeAccFolder) || zip;

        addDownloadLog(`--- Akun: ${accName} (${accountItems.length} video) ---`, 'info');

        for (let i = 0; i < accountItems.length; i++) {
          const item = accountItems[i];
          addDownloadLog(`[${accName}] Render [${i + 1}/${accountItems.length}]: "${item.title.substring(0, 22)}..."`, 'info');

          try {
            const result = await renderHtmlToVideo(item.html, {
              width: 1920,
              height: 1080,
              fps: 60,
              duration: 10,
              bitrate: exportBitrate,
              mode: item.type,
            });

            const safeTitle = item.title.replace(/[^a-z0-9]/gi, '_').toLowerCase().substring(0, 22);
            const fileName = `${String(i + 1).padStart(2, '0')}_microstock_${safeAccFolder}_${item.type}_${safeTitle}_${result.bitrateMbps}Mbps.mp4`;
            
            // Add mp4 blob to account subfolder in zip
            folder.file(fileName, result.blob);
            totalRendered++;
            addDownloadLog(`[${accName}] Selesai #${i + 1}: ${result.sizeFormatted}`, 'success');

            await new Promise((r) => setTimeout(r, 600));
          } catch (e: any) {
            addDownloadLog(`[${accName}] Gagal #${i + 1}: ${e.message}`, 'error');
          }
        }
      }

      addDownloadLog(`Mengompres seluruh hasil render ke dalam ZIP master...`, 'info');
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const downloadUrl = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `BigMA_Microstock_Batch_Render_${Date.now()}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(downloadUrl), 5000);

      addDownloadLog(`[Selesai] Berhasil merender dan mengemas ${totalRendered} video ke ZIP ber-subfolder akun!`, 'success');
      showToast(`Batch ZIP Render selesai (${totalRendered} video berhasil dikemas)!`, 'success');
    } catch (e: any) {
      addDownloadLog(`Gagal Batch ZIP: ${e.message}`, 'error');
      showToast(`Gagal batch render ZIP: ${e.message}`, 'error');
    } finally {
      setIsDownloading(false);
      setExportingAccount(null);
    }
  };

  const processDownloadQueue = async () => {
    if (downloadQueue.length === 0) {
      showToast('Antrean unduhan kosong!', 'warn');
      return;
    }

    setIsDownloading(true);
    addDownloadLog(`Memulai unduhan masal ${downloadQueue.length} file...`, 'info');

    let successCount = 0;
    for (let i = 0; i < downloadQueue.length; i++) {
      const id = downloadQueue[i];
      const item = animations.find((a) => a.id === id);
      if (!item) continue;

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
        addDownloadLog(`Selesai: File #${i + 1} diunduh.`, 'success');
        await new Promise((r) => setTimeout(r, 500));
      } catch (e: any) {
        addDownloadLog(`Gagal #${i + 1}: ${e.message}`, 'error');
      }
    }

    setIsDownloading(false);
    onClearQueue();
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
    addDownloadLog(`Mengompres ${itemsToZip.length} file ke ZIP...`, 'info');

    try {
      const zip = new JSZip();
      itemsToZip.forEach((item, index) => {
        const safeTitle = item.title.replace(/[^a-z0-9]/gi, '_').toLowerCase().substring(0, 25);
        const acc = item.account ? item.account.replace(/[^a-z0-9_-]/gi, '_') : 'manual';
        const folder = zip.folder(acc) || zip;
        const fileName = `${String(index + 1).padStart(2, '0')}_microstock_${acc.toLowerCase()}_${item.type}_${safeTitle}.html`;
        folder.file(fileName, item.html);
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
      addDownloadLog(`Gagal ZIP: ${e.message}`, 'error');
      showToast(`Gagal ZIP: ${e.message}`, 'error');
    } finally {
      setIsDownloading(false);
    }
  };

  const handleDeleteItem = (id: string, title: string) => {
    onDeleteAnimation(id);
    addDownloadLog(`[Hapus] "${title.substring(0, 25)}" dihapus.`, 'info');
    showToast(`Animasi berhasil dihapus.`, 'info');
    setDeletingId(null);
  };

  const handleConfirmClearAll = () => {
    onClearAllAnimations();
    setIsConfirmingClearAll(false);
    addDownloadLog(`Galeri dibersihkan.`, 'info');
    showToast('Galeri berhasil dibersihkan.', 'success');
  };

  return (
    <>
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
                  <h3 className="font-bold text-gray-100 text-base">Galeri & Daftar Render Akun</h3>
                  <span className="px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-300 text-xs font-bold border border-sky-500/30">
                    {animations.length} Item Tersimpan
                  </span>
                </div>
                <p className="text-xs text-gray-400">
                  Daftar ringkas per akun dengan tombol preview satuan dan batch render ZIP terkelompok.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Batch ZIP Render Button */}
              {animations.length > 0 && (
                <button
                  onClick={handleOpenBatchModal}
                  disabled={isDownloading}
                  className="px-3.5 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-lg shadow-purple-500/20 cursor-pointer disabled:opacity-50"
                  title="Pilih akun dan render batch ke file ZIP ber-subfolder"
                >
                  <i className="fa-solid fa-file-zipper"></i>
                  <span>Batch Render ZIP Akun</span>
                </button>
              )}

              {/* Target Bitrate Selector in Gallery */}
              <div className="flex items-center gap-1.5 bg-gray-900/90 border border-purple-500/30 rounded-xl px-2.5 py-1.5 shadow-sm">
                <span className="text-[10px] font-bold text-gray-400 flex items-center gap-1">
                  <i className="fa-solid fa-sliders text-purple-400 text-[10px]"></i>
                  <span className="hidden md:inline">Bitrate:</span>
                </span>
                <select
                  value={exportBitrate}
                  onChange={(e) => onExportBitrateChange?.(Number(e.target.value))}
                  className="bg-transparent text-[11px] font-extrabold text-purple-300 focus:outline-none cursor-pointer"
                  title="Pilih Target Bitrate MP4"
                >
                  <option value={18} className="bg-gray-950 text-gray-200">18 Mbps (~22.5 MB • Microstock Standar)</option>
                  <option value={25} className="bg-gray-950 text-gray-200">25 Mbps (~31.2 MB • Pro Rekomendasi)</option>
                  <option value={30} className="bg-gray-950 text-gray-200">30 Mbps (~37.5 MB • Ultra 60 FPS)</option>
                  <option value={20} className="bg-gray-950 text-gray-200">20 Mbps (~25.0 MB • Shutterstock HD)</option>
                  <option value={15} className="bg-gray-950 text-gray-200">15 Mbps (~18.7 MB • Ringan)</option>
                  <option value={10} className="bg-gray-950 text-gray-200">10 Mbps (~12.5 MB • Hemat)</option>
                  <option value={50} className="bg-gray-950 text-gray-200">50 Mbps (~62.5 MB • Master 4K)</option>
                </select>
              </div>

              <button
                onClick={downloadAllAsZip}
                disabled={isDownloading || animations.length === 0}
                className="px-3 py-2 bg-gray-800 hover:bg-gray-700 text-sky-300 border border-gray-700 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                title="Unduh HTML ZIP"
              >
                <i className="fa-solid fa-code"></i>
                <span className="hidden sm:inline">HTML ZIP</span>
              </button>

              {animations.length > 0 && (
                <>
                  {isConfirmingClearAll ? (
                    <div className="flex items-center gap-1 bg-red-950/80 border border-red-500/40 px-2 py-1 rounded-xl">
                      <span className="text-[10px] text-red-300 font-bold">Hapus semua?</span>
                      <button
                        onClick={handleConfirmClearAll}
                        className="px-2 py-1 bg-red-600 hover:bg-red-500 text-white rounded text-[10px] font-bold cursor-pointer"
                      >
                        Ya
                      </button>
                      <button
                        onClick={() => setIsConfirmingClearAll(false)}
                        className="px-2 py-1 bg-gray-800 text-gray-300 rounded text-[10px] cursor-pointer"
                      >
                        Batal
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setIsConfirmingClearAll(true)}
                      className="px-3 py-2 bg-gray-800 hover:bg-red-500/20 text-gray-400 hover:text-red-400 border border-gray-700 hover:border-red-500/30 rounded-xl text-xs transition cursor-pointer flex items-center gap-1"
                      title="Hapus Semua"
                    >
                      <i className="fa-solid fa-trash-can"></i>
                    </button>
                  )}
                </>
              )}

              <button onClick={onClose} className="text-gray-400 hover:text-white text-lg cursor-pointer ml-1">
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>
          </div>

          {/* Filter Tabs by Account / Category */}
          {animations.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 pb-2 border-b border-gray-800 shrink-0">
              <div className="flex gap-2 overflow-x-auto pb-1 items-center">
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
                      className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
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
                  Pilih Semua
                </button>
                {downloadQueue.length > 0 && (
                  <button
                    onClick={onClearQueue}
                    className="text-[11px] px-2.5 py-1 bg-gray-800 hover:bg-gray-700 text-amber-400 rounded-lg border border-gray-700 transition cursor-pointer"
                  >
                    Kosongkan
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Content Area: Lightweight List View + Log Sidebar */}
          <div className="flex-1 overflow-hidden flex flex-col lg:flex-row gap-6 mt-2">
            {/* Gallery List */}
            <div className="flex-1 overflow-y-auto pr-2 pb-8 space-y-2">
              {filteredList.length === 0 ? (
                <div className="text-center py-14 text-gray-500 text-xs italic">
                  Belum ada animasi di galeri untuk kategori ini.
                </div>
              ) : (
                filteredList.map((item, idx) => {
                  const isQueued = downloadQueue.includes(item.id);
                  const isRenderingMp4 = exportingMp4Id === item.id;
                  const rowBorder = isQueued
                    ? 'border-emerald-500/60 bg-emerald-950/20 ring-1 ring-emerald-500/30'
                    : 'border-gray-800/80 bg-gray-900/50 hover:border-gray-700';

                  return (
                    <div
                      key={`${item.id}_${idx}`}
                      className={`rounded-xl border ${rowBorder} p-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 transition shadow-sm hover:shadow-md`}
                    >
                      {/* Item Info */}
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <button
                          onClick={() => onToggleQueue(item.id)}
                          className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 border cursor-pointer transition ${
                            isQueued
                              ? 'bg-emerald-500 text-white border-emerald-400'
                              : 'bg-gray-800 text-gray-500 border-gray-700 hover:text-gray-300'
                          }`}
                          title={isQueued ? 'Hapus dari antrean' : 'Tambah ke antrean'}
                        >
                          <i className={`fa-solid ${isQueued ? 'fa-check text-xs' : 'fa-plus text-[10px]'}`}></i>
                        </button>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="font-bold text-gray-200 text-xs truncate" title={item.title}>
                              {item.title}
                            </h4>
                            <span className="text-[9px] bg-sky-950 text-sky-400 border border-sky-800/60 px-1.5 py-0.2 rounded font-bold uppercase">
                              {item.type}
                            </span>
                            {(item.isGreenScreen || /#00ff00|rgb\(0,\s*255,\s*0\)/i.test(item.html)) && (
                              <span className="text-[9px] bg-emerald-950 text-emerald-300 border border-emerald-700/60 px-1.5 py-0.2 rounded font-bold">
                                Green Screen
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-[10px] text-gray-400 mt-0.5">
                            <span className="text-amber-300 font-semibold flex items-center gap-1">
                              <i className="fa-solid fa-user-tag text-[9px]"></i> {item.account || 'Manual'}
                            </span>
                            <span>•</span>
                            <span className="text-emerald-400 font-medium">1080p 60FPS</span>
                          </div>
                        </div>
                      </div>

                      {/* Action Buttons per Row */}
                      <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                        {/* Preview Button per Row (Closes gallery modal first so FullscreenModal renders on top cleanly) */}
                        <button
                          onClick={() => {
                            onClose();
                            onOpenFullscreen(item);
                          }}
                          className="px-2.5 py-1.5 bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 border border-sky-500/40 rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer shadow-sm"
                          title="Buka Preview Layar Penuh"
                        >
                          <i className="fa-solid fa-eye text-sky-400 text-xs"></i>
                          <span>Preview</span>
                        </button>

                        {/* Render MP4 Single Button */}
                        <button
                          onClick={() => handleExportSingleMp4(item)}
                          disabled={isRenderingMp4}
                          className="px-2.5 py-1.5 bg-purple-600/30 hover:bg-purple-600/50 text-purple-300 border border-purple-500/40 rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer disabled:opacity-50 shadow-sm"
                          title={`Render Satuan MP4 H.264 @ ${exportBitrate} Mbps`}
                        >
                          {isRenderingMp4 ? (
                            <i className="fa-solid fa-spinner fa-spin text-purple-300"></i>
                          ) : (
                            <i className="fa-solid fa-film text-purple-400"></i>
                          )}
                          <span>MP4 ({exportBitrate}M)</span>
                        </button>

                        {/* Download HTML Button */}
                        <button
                          onClick={() => handleDownloadSingleHtml(item)}
                          className="px-2.5 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700 rounded-lg text-xs font-semibold transition flex items-center gap-1 cursor-pointer"
                          title="Unduh Kode HTML"
                        >
                          <i className="fa-solid fa-code text-emerald-400"></i>
                          <span className="hidden md:inline">HTML</span>
                        </button>

                        {/* Delete item button */}
                        {deletingId === item.id ? (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleDeleteItem(item.id, item.title)}
                              className="px-2 py-1 bg-red-600 hover:bg-red-500 text-white rounded text-[10px] font-bold cursor-pointer"
                            >
                              Hapus
                            </button>
                            <button
                              onClick={() => setDeletingId(null)}
                              className="px-1.5 py-1 bg-gray-800 text-gray-300 rounded text-[10px] cursor-pointer"
                            >
                              ✕
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setDeletingId(item.id)}
                            className="p-1.5 text-gray-500 hover:text-red-400 rounded-lg hover:bg-red-500/10 transition cursor-pointer"
                            title="Hapus"
                          >
                            <i className="fa-solid fa-trash-can text-xs"></i>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Download & Export Logs Sidebar */}
            <div className="w-full lg:w-80 flex flex-col gap-3 shrink-0">
              <div className="bg-gray-900/80 border border-gray-800 rounded-xl p-4 flex-1 flex flex-col max-h-48 lg:max-h-full">
                <div className="flex items-center justify-between border-b border-gray-800 pb-2 mb-2">
                  <h4 className="text-xs font-bold text-gray-300 flex items-center gap-1.5">
                    <i className="fa-solid fa-terminal text-emerald-400"></i> Log Render & Unduhan
                  </h4>
                  {(isDownloading || exportingMp4Id || exportingAccount) && (
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
                      Gunakan "Batch Render ZIP Akun" atau "MP4" per baris untuk memulai...
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

      {/* Batch Render Account Selection Modal */}
      {isBatchModalOpen && (
        <div className="fixed inset-0 z-[60] bg-black/90 backdrop-blur-md flex items-center justify-center p-4">
          <div className="glass-card rounded-2xl max-w-md w-full border border-gray-800 p-6 space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b border-gray-800 pb-3">
              <h3 className="font-bold text-gray-100 text-sm flex items-center gap-2">
                <i className="fa-solid fa-file-zipper text-purple-400"></i> Pilih Akun untuk Batch Render ZIP
              </h3>
              <button
                onClick={() => setIsBatchModalOpen(false)}
                className="text-gray-400 hover:text-white cursor-pointer"
              >
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>

            <p className="text-xs text-gray-400">
              Pilih akun mana saja yang ingin dirender ke MP4 (@ {exportBitrate} Mbps). Hasil render akan dikemas ke dalam satu file ZIP dengan folder terpisah per nama akun.
            </p>

            <div className="space-y-2 max-h-60 overflow-y-auto py-1">
              {uniqueAccounts.map((acc) => {
                const count = animations.filter((a) => (a.account || 'Manual') === acc).length;
                const isChecked = !!selectedBatchAccounts[acc];

                return (
                  <label
                    key={acc}
                    className="flex items-center justify-between p-2.5 rounded-xl bg-gray-900/80 border border-gray-800 hover:border-purple-500/40 cursor-pointer transition"
                  >
                    <div className="flex items-center gap-2.5">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={(e) =>
                          setSelectedBatchAccounts((prev) => ({ ...prev, [acc]: e.target.checked }))
                        }
                        className="w-4 h-4 rounded border-gray-700 text-purple-600 focus:ring-purple-500 bg-gray-950 cursor-pointer"
                      />
                      <span className="font-bold text-xs text-gray-200">{acc}</span>
                    </div>
                    <span className="text-[10px] bg-purple-500/20 text-purple-300 px-2 py-0.5 rounded-full font-bold">
                      {count} video
                    </span>
                  </label>
                );
              })}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-800">
              <button
                onClick={() => setIsBatchModalOpen(false)}
                className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-xl text-xs font-bold transition cursor-pointer"
              >
                Batal
              </button>
              <button
                onClick={handleStartBatchZipRender}
                className="px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 text-white rounded-xl text-xs font-bold transition shadow-lg shadow-purple-500/20 cursor-pointer flex items-center gap-1.5"
              >
                <i className="fa-solid fa-play text-xs"></i>
                <span>Mulai Render & Unduh ZIP</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
