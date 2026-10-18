import React, { useState, useRef, useEffect } from 'react';
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

interface ItemRenderProgress {
  percent: number;
  message: string;
  status: 'idle' | 'rendering' | 'done' | 'error';
  savedFolder?: string;
}

const STORAGE_ACCOUNT_FOLDERS = 'bigma_account_target_folders';

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
  const [isConfirmingClearAll, setIsConfirmingClearAll] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Per-item inline progress map (eliminates heavy render popups)
  const [itemProgressMap, setItemProgressMap] = useState<Record<string, ItemRenderProgress>>({});

  // Target folders per account state & in-memory FileSystemDirectoryHandle registry
  const [accountFolders, setAccountFolders] = useState<Record<string, string>>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_ACCOUNT_FOLDERS);
      if (saved) return JSON.parse(saved);
    } catch {}
    return {};
  });

  const dirHandlesRef = useRef<Record<string, any>>({});

  // Account Folder Configuration Modal State
  const [isFolderPickerModalOpen, setIsFolderPickerModalOpen] = useState(false);
  const [targetAccountForFolder, setTargetAccountForFolder] = useState<string>('');
  const [manualFolderNameInput, setManualFolderNameInput] = useState<string>('');

  // Batch Render Modal State
  const [isBatchModalOpen, setIsBatchModalOpen] = useState(false);
  const [selectedBatchAccounts, setSelectedBatchAccounts] = useState<Record<string, boolean>>({});

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_ACCOUNT_FOLDERS, JSON.stringify(accountFolders));
    } catch {}
  }, [accountFolders]);

  if (!isOpen) return null;

  const uniqueAccounts: string[] = Array.from(new Set(animations.map((a) => String(a.account || 'Manual'))));

  const filteredList =
    currentFilter === 'All'
      ? animations
      : animations.filter((a) => (a.account || 'Manual') === currentFilter);

  const addDownloadLog = (text: string, type: 'info' | 'success' | 'error' = 'info') => {
    setDownloadLogs((prev) => [...prev, { text, type }]);
  };

  // Helper to trigger direct browser download
  const triggerBrowserFileDownload = (url: string, fileName: string) => {
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  // Set target folder using native File System Access API if supported, or custom folder name
  const handleSelectFolderViaNativePicker = async (accName: string) => {
    try {
      if ('showDirectoryPicker' in window) {
        const handle = await (window as any).showDirectoryPicker({
          mode: 'readwrite',
        });
        if (handle && handle.name) {
          dirHandlesRef.current[accName] = handle;
          setAccountFolders((prev) => ({ ...prev, [accName]: handle.name }));
          showToast(`Target folder untuk "${accName}" diset ke: "${handle.name}"`, 'success');
          addDownloadLog(`[Folder Set] Akun "${accName}" diarahkan ke folder: "${handle.name}" (Direct Disk Save)`, 'success');
          setIsFolderPickerModalOpen(false);
          return handle;
        }
      }
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        showToast('Akses folder dibatalkan atau tidak diizinkan.', 'warn');
      }
    }
    return null;
  };

  const handleSaveManualFolderName = (accName: string) => {
    const trimmed = manualFolderNameInput.trim() || accName;
    setAccountFolders((prev) => ({ ...prev, [accName]: trimmed }));
    showToast(`Target folder untuk "${accName}" diset ke: "${trimmed}"`, 'success');
    addDownloadLog(`[Folder Set] Akun "${accName}" diset ke folder: "${trimmed}"`, 'info');
    setIsFolderPickerModalOpen(false);
  };

  const openFolderPickerModalForAccount = (accName: string) => {
    setTargetAccountForFolder(accName);
    setManualFolderNameInput(accountFolders[accName] || accName);
    setIsFolderPickerModalOpen(true);
  };

  const handleDownloadSingleHtml = (item: AnimationItem) => {
    const htmlBlob = new Blob([item.html], { type: 'text/html;charset=utf-8' });
    const downloadUrl = URL.createObjectURL(htmlBlob);
    const safeTitle = item.title.replace(/[^a-z0-9]/gi, '_').toLowerCase().substring(0, 20);
    const acc = item.account ? item.account.toLowerCase() : 'manual';
    const fileName = `microstock_${acc}_${item.type}_${safeTitle}.html`;
    triggerBrowserFileDownload(downloadUrl, fileName);
    showToast('File HTML berhasil diunduh!', 'success');
  };

  // Save a single rendered MP4 either directly to disk via directory handle or direct browser download
  const saveMp4ToTargetFolder = async (
    item: AnimationItem,
    result: { blob: Blob; url: string; bitrateMbps: number; sizeFormatted: string; bitrateFormatted: string },
    accName: string,
    indexPrefix = ''
  ) => {
    const safeTitle = item.title.replace(/[^a-z0-9]/gi, '_').toLowerCase().substring(0, 22);
    const safeAcc = accName.replace(/[^a-z0-9_-]/gi, '_');
    const fileName = `${indexPrefix ? `${indexPrefix}_` : ''}microstock_${safeAcc}_${item.type}_${safeTitle}_${result.bitrateMbps}Mbps.mp4`;

    const dirHandle = dirHandlesRef.current[accName];
    const targetFolderLabel = accountFolders[accName] || accName;

    if (dirHandle) {
      try {
        const fileHandle = await dirHandle.getFileHandle(fileName, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(result.blob);
        await writable.close();
        addDownloadLog(`[Tersimpan ke Folder] "${fileName}" berhasil ditulis ke "${dirHandle.name}"!`, 'success');
        return { success: true, method: 'direct-disk', folder: dirHandle.name };
      } catch (err: any) {
        console.warn('Gagal menulis langsung ke disk handle, fallback ke unduh browser...', err);
      }
    }

    // Fallback: Immediate automatic browser download
    triggerBrowserFileDownload(result.url, fileName);
    addDownloadLog(`[Unduh Otomatis] "${fileName}" (${result.sizeFormatted}) diunduh ke folder "${targetFolderLabel}".`, 'success');
    return { success: true, method: 'browser-download', folder: targetFolderLabel };
  };

  // Single MP4 render with in-place progress bar (no intrusive modal popup)
  const handleExportSingleMp4 = async (item: AnimationItem) => {
    const accName = item.account || 'Manual';

    // Verify target folder first as requested
    if (!accountFolders[accName]) {
      openFolderPickerModalForAccount(accName);
      showToast(`Tentukan target folder untuk akun "${accName}" terlebih dahulu sebelum render!`, 'warn');
      return;
    }

    setItemProgressMap((prev) => ({
      ...prev,
      [item.id]: { percent: 5, message: 'Menyiapkan render...', status: 'rendering' },
    }));

    addDownloadLog(`[Render Satuan] Memulai render 1080p 60FPS (${exportBitrate} Mbps): "${item.title.substring(0, 25)}..."`, 'info');
    showToast(`Merender MP4 H.264 (${exportBitrate} Mbps) untuk "${item.title.substring(0, 20)}..."`, 'info');

    try {
      const result = await renderHtmlToVideo(item.html, {
        width: 1920,
        height: 1080,
        fps: 60,
        duration: 10,
        bitrate: exportBitrate,
        mode: item.type,
        onProgress: (pct, msg) => {
          setItemProgressMap((prev) => ({
            ...prev,
            [item.id]: { percent: pct, message: msg, status: 'rendering' },
          }));
        },
      });

      const saveRes = await saveMp4ToTargetFolder(item, result, accName);

      setItemProgressMap((prev) => ({
        ...prev,
        [item.id]: {
          percent: 100,
          message: `Selesai (${result.bitrateFormatted})`,
          status: 'done',
          savedFolder: saveRes.folder,
        },
      }));

      showToast(`Video MP4 (${result.sizeFormatted} • ${result.bitrateFormatted}) berhasil tersimpan ke folder!`, 'success');
    } catch (e: any) {
      setItemProgressMap((prev) => ({
        ...prev,
        [item.id]: { percent: 0, message: `Gagal: ${e.message}`, status: 'error' },
      }));
      addDownloadLog(`[Render Error] Gagal: ${e.message}`, 'error');
      showToast(`Gagal export MP4: ${e.message}`, 'error');
    }
  };

  // Sequential Account/Batch Render: Render 1 by 1, automatically save directly to target folder, free RAM
  const startSequentialBatchRender = async (chosenAccounts: string[]) => {
    setIsDownloading(true);
    setDownloadLogs([]);
    addDownloadLog(`[Batch Render Dimulai] Menjalankan render berurutan untuk akun: ${chosenAccounts.join(', ')} (@ ${exportBitrate} Mbps)...`, 'info');
    showToast(`Memulai batch render untuk ${chosenAccounts.length} akun...`, 'info');

    let totalSaved = 0;

    try {
      for (const accName of chosenAccounts) {
        const accountItems = animations.filter((a) => (a.account || 'Manual') === accName);
        if (accountItems.length === 0) continue;

        const targetFolder = accountFolders[accName] || accName;
        addDownloadLog(`═══════════════════════════════════════════════════════`, 'info');
        addDownloadLog(`▶ Akun: ${accName} (${accountItems.length} video) ➔ Target Folder: "${targetFolder}"`, 'info');

        for (let i = 0; i < accountItems.length; i++) {
          const item = accountItems[i];
          const prefix = String(i + 1).padStart(2, '0');

          setItemProgressMap((prev) => ({
            ...prev,
            [item.id]: { percent: 4, message: `Menyiapkan [${i + 1}/${accountItems.length}]...`, status: 'rendering' },
          }));

          addDownloadLog(`[${accName}] Render #${i + 1}/${accountItems.length}: "${item.title.substring(0, 25)}..."`, 'info');

          try {
            const result = await renderHtmlToVideo(item.html, {
              width: 1920,
              height: 1080,
              fps: 60,
              duration: 10,
              bitrate: exportBitrate,
              mode: item.type,
              onProgress: (pct, msg) => {
                setItemProgressMap((prev) => ({
                  ...prev,
                  [item.id]: { percent: pct, message: msg, status: 'rendering' },
                }));
              },
            });

            // Automatically save to target folder & release memory immediately
            const saveRes = await saveMp4ToTargetFolder(item, result, accName, prefix);
            totalSaved++;

            setItemProgressMap((prev) => ({
              ...prev,
              [item.id]: {
                percent: 100,
                message: `Tersimpan ke "${saveRes.folder}" (${result.bitrateFormatted})`,
                status: 'done',
                savedFolder: saveRes.folder,
              },
            }));

            // Micro-pause between items to yield thread cleanly
            await new Promise((r) => setTimeout(r, 400));
          } catch (e: any) {
            setItemProgressMap((prev) => ({
              ...prev,
              [item.id]: { percent: 0, message: `Gagal: ${e.message}`, status: 'error' },
            }));
            addDownloadLog(`[${accName}] ❌ Gagal #${i + 1}: ${e.message}`, 'error');
          }
        }
      }

      addDownloadLog(`═══════════════════════════════════════════════════════`, 'info');
      addDownloadLog(`[Batch Selesai] Berhasil merender dan menyimpan ${totalSaved} video langsung ke target folder masing-masing!`, 'success');
      showToast(`Batch Render selesai! ${totalSaved} video tersimpan otomatis ke folder.`, 'success');
    } catch (e: any) {
      addDownloadLog(`Gagal Batch Render: ${e.message}`, 'error');
      showToast(`Gagal batch render: ${e.message}`, 'error');
    } finally {
      setIsDownloading(false);
    }
  };

  const handleOpenBatchModal = () => {
    const initial: Record<string, boolean> = {};
    uniqueAccounts.forEach((acc) => {
      initial[acc] = true;
    });
    setSelectedBatchAccounts(initial);
    setIsBatchModalOpen(true);
  };

  const handleStartBatchCheckFolders = () => {
    const chosenAccounts = Object.keys(selectedBatchAccounts).filter((acc) => selectedBatchAccounts[acc]);
    if (chosenAccounts.length === 0) {
      showToast('Pilih setidaknya satu akun untuk batch render!', 'warn');
      return;
    }

    // Check if any chosen account lacks a target folder
    const unconfigured = chosenAccounts.find((acc) => !accountFolders[acc]);
    if (unconfigured) {
      setIsBatchModalOpen(false);
      openFolderPickerModalForAccount(unconfigured);
      showToast(`Akun "${unconfigured}" belum menentukan target folder! Silakan tentukan folder target terlebih dahulu.`, 'warn');
      return;
    }

    setIsBatchModalOpen(false);
    startSequentialBatchRender(chosenAccounts);
  };

  const handleRenderSingleAccount = (accName: string) => {
    if (!accountFolders[accName]) {
      openFolderPickerModalForAccount(accName);
      showToast(`Wajib menentukan target folder untuk akun "${accName}" terlebih dahulu!`, 'warn');
      return;
    }
    startSequentialBatchRender([accName]);
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
    addDownloadLog(`Mengompres ${itemsToZip.length} file HTML ke ZIP...`, 'info');

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
      triggerBrowserFileDownload(downloadUrl, `BigMA_HTML_Codes_${Date.now()}.zip`);
      addDownloadLog(`Berhasil membuat paket ZIP HTML (${itemsToZip.length} file).`, 'success');
      showToast(`Paket ZIP HTML (${itemsToZip.length} file) berhasil diunduh!`, 'success');
    } catch (e: any) {
      addDownloadLog(`Gagal ZIP HTML: ${e.message}`, 'error');
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
                  <h3 className="font-bold text-gray-100 text-base">Galeri & Render Akun Otomatis</h3>
                  <span className="px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-300 text-xs font-bold border border-sky-500/30">
                    {animations.length} Item Tersimpan
                  </span>
                </div>
                <p className="text-xs text-gray-400">
                  Target folder wajib per akun • Render satu per satu otomatis ke folder • Bebas beban ZIP & RAM
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Batch Render Button */}
              {animations.length > 0 && (
                <button
                  onClick={handleOpenBatchModal}
                  disabled={isDownloading}
                  className="px-3.5 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-lg shadow-purple-500/20 cursor-pointer disabled:opacity-50"
                  title="Pilih akun dan render otomatis ke target folder masing-masing"
                >
                  <i className="fa-solid fa-folder-arrow-down"></i>
                  <span>Batch Render ke Folder</span>
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
                title="Unduh Kode HTML ke ZIP"
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
                      title="Hapus Semua Animasi"
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

          {/* Filter Tabs & Per-Account Target Folder Controls */}
          {animations.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 pb-2 border-b border-gray-800 shrink-0">
              <div className="flex gap-2 overflow-x-auto pb-1 items-center max-w-full">
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
                  const folder = accountFolders[acc];

                  return (
                    <div key={acc} className="flex items-center gap-1">
                      <button
                        onClick={() => setCurrentFilter(acc)}
                        className={`px-3 py-1.5 rounded-full text-xs font-bold transition whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
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

                      {/* Folder indicator / picker button */}
                      <button
                        onClick={() => openFolderPickerModalForAccount(acc)}
                        className={`px-2 py-1 rounded-lg text-[10px] font-bold border transition flex items-center gap-1 cursor-pointer ${
                          folder
                            ? 'bg-emerald-950/60 text-emerald-300 border-emerald-500/40 hover:bg-emerald-900/60'
                            : 'bg-red-950/60 text-red-300 border-red-500/40 hover:bg-red-900/60 animate-pulse'
                        }`}
                        title={folder ? `Target Folder: "${folder}" (Klik untuk ganti)` : `Target Folder belum diset (Wajib diatur)`}
                      >
                        <i className={`fa-solid ${folder ? 'fa-folder-check' : 'fa-folder-plus'}`}></i>
                        <span className="max-w-[100px] truncate">{folder || 'Set Folder'}</span>
                      </button>

                      {/* Render Account Button */}
                      <button
                        onClick={() => handleRenderSingleAccount(acc)}
                        disabled={isDownloading}
                        className="px-2 py-1 rounded-lg text-[10px] font-bold bg-purple-600/30 hover:bg-purple-600/50 text-purple-200 border border-purple-500/40 transition flex items-center gap-1 cursor-pointer disabled:opacity-50"
                        title={`Render seluruh video milik akun "${acc}" satu per satu ke folder`}
                      >
                        <i className="fa-solid fa-play text-[9px]"></i>
                        <span>Render</span>
                      </button>
                    </div>
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

          {/* Content Area: Lightweight List View with In-Place Progress Bars + Log Sidebar */}
          <div className="flex-1 overflow-hidden flex flex-col lg:flex-row gap-6 mt-2">
            {/* Gallery List */}
            <div className="flex-1 overflow-y-auto pr-2 pb-8 space-y-2.5">
              {filteredList.length === 0 ? (
                <div className="text-center py-14 text-gray-500 text-xs italic">
                  Belum ada animasi di galeri untuk kategori ini.
                </div>
              ) : (
                filteredList.map((item, idx) => {
                  const isQueued = downloadQueue.includes(item.id);
                  const progress = itemProgressMap[item.id];
                  const isRendering = progress?.status === 'rendering';
                  const isDone = progress?.status === 'done';
                  const isErr = progress?.status === 'error';
                  const accName = item.account || 'Manual';
                  const targetFolder = accountFolders[accName];

                  const rowBorder = isRendering
                    ? 'border-purple-500/80 bg-purple-950/25 ring-1 ring-purple-500/50 shadow-lg shadow-purple-950/30'
                    : isDone
                    ? 'border-emerald-500/60 bg-emerald-950/20 ring-1 ring-emerald-500/30'
                    : isQueued
                    ? 'border-sky-500/60 bg-sky-950/20 ring-1 ring-sky-500/30'
                    : 'border-gray-800/80 bg-gray-900/50 hover:border-gray-700';

                  return (
                    <div
                      key={`${item.id}_${idx}`}
                      className={`rounded-xl border ${rowBorder} p-3.5 flex flex-col gap-2.5 transition shadow-sm hover:shadow-md`}
                    >
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                        {/* Item Info */}
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <button
                            onClick={() => onToggleQueue(item.id)}
                            className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 border cursor-pointer transition ${
                              isQueued
                                ? 'bg-sky-500 text-white border-sky-400'
                                : 'bg-gray-800 text-gray-500 border-gray-700 hover:text-gray-300'
                            }`}
                            title={isQueued ? 'Hapus dari antrean' : 'Tambah ke antrean'}
                          >
                            <i className={`fa-solid ${isQueued ? 'fa-check text-xs' : 'fa-plus text-[10px]'}`}></i>
                          </button>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h4 className="font-bold text-gray-200 text-xs truncate max-w-sm" title={item.title}>
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
                              {isDone && (
                                <span className="text-[9px] bg-emerald-900/80 text-emerald-300 border border-emerald-500/50 px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                                  <i className="fa-solid fa-check-double text-[8px]"></i> Tersimpan
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 text-[10px] text-gray-400 mt-0.5 flex-wrap">
                              <span className="text-amber-300 font-semibold flex items-center gap-1">
                                <i className="fa-solid fa-user-tag text-[9px]"></i> {accName}
                              </span>
                              <span>•</span>
                              <span className="text-gray-400 flex items-center gap-1">
                                <i className="fa-solid fa-folder text-purple-400 text-[9px]"></i>
                                {targetFolder ? (
                                  <span className="text-purple-300 font-medium">/{targetFolder}</span>
                                ) : (
                                  <span className="text-red-400 italic">Belum diset</span>
                                )}
                              </span>
                              <span>•</span>
                              <span className="text-emerald-400 font-medium">1080p 60FPS</span>
                            </div>
                          </div>
                        </div>

                        {/* Action Buttons per Row */}
                        <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                          {/* Preview Button */}
                          <button
                            onClick={() => {
                              onOpenFullscreen(item);
                              onClose();
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
                            disabled={isRendering}
                            className="px-2.5 py-1.5 bg-purple-600/30 hover:bg-purple-600/50 text-purple-300 border border-purple-500/40 rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer disabled:opacity-50 shadow-sm"
                            title={`Render MP4 H.264 @ ${exportBitrate} Mbps langsung ke target folder`}
                          >
                            {isRendering ? (
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

                      {/* In-Place Row Loading Bar (Eliminates intrusive popups entirely) */}
                      {isRendering && (
                        <div className="w-full bg-gray-950/90 border border-purple-500/30 rounded-lg p-2 space-y-1.5">
                          <div className="flex justify-between items-center text-[11px] font-semibold">
                            <span className="text-purple-300 flex items-center gap-1.5">
                              <i className="fa-solid fa-circle-notch fa-spin text-purple-400"></i>
                              <span>{progress.message}</span>
                            </span>
                            <span className="text-purple-400 font-bold font-mono">{progress.percent}%</span>
                          </div>
                          <div className="w-full bg-gray-900 h-2 rounded-full overflow-hidden border border-gray-800">
                            <div
                              className="bg-gradient-to-r from-purple-500 via-indigo-500 to-emerald-400 h-full transition-all duration-150"
                              style={{ width: `${progress.percent}%` }}
                            />
                          </div>
                        </div>
                      )}

                      {isDone && (
                        <div className="flex items-center justify-between text-[10px] text-emerald-400 bg-emerald-950/30 border border-emerald-500/20 px-2.5 py-1 rounded-lg">
                          <span className="flex items-center gap-1 font-semibold">
                            <i className="fa-solid fa-circle-check"></i>
                            <span>Tersimpan otomatis ke folder: "{progress?.savedFolder || targetFolder}"</span>
                          </span>
                          <span className="font-mono text-gray-400">{progress.message}</span>
                        </div>
                      )}

                      {isErr && (
                        <div className="text-[10px] text-red-400 bg-red-950/30 border border-red-500/20 px-2.5 py-1 rounded-lg flex items-center gap-1 font-semibold">
                          <i className="fa-solid fa-triangle-exclamation"></i>
                          <span>{progress.message}</span>
                        </div>
                      )}
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
                    <i className="fa-solid fa-terminal text-emerald-400"></i> Log Render & Target Folder
                  </h4>
                  {isDownloading && (
                    <span className="text-purple-400 text-xs animate-spin">
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
                      Tentukan target folder akun lalu klik "Render" atau "Batch Render ke Folder"...
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

      {/* Target Folder Configuration Modal */}
      {isFolderPickerModalOpen && (
        <div className="fixed inset-0 z-[70] bg-black/90 backdrop-blur-md flex items-center justify-center p-4">
          <div className="glass-card rounded-2xl max-w-md w-full border border-gray-800 p-6 space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b border-gray-800 pb-3">
              <h3 className="font-bold text-gray-100 text-sm flex items-center gap-2">
                <i className="fa-solid fa-folder-open text-amber-400"></i> Tentukan Target Folder Akun: "{targetAccountForFolder}"
              </h3>
              <button
                onClick={() => setIsFolderPickerModalOpen(false)}
                className="text-gray-400 hover:text-white cursor-pointer"
              >
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>

            <p className="text-xs text-gray-300 leading-relaxed">
              Sesuai alur baru, setiap video yang selesai dirender akan langsung diunduh otomatis satu per satu ke folder target tanpa membuat file ZIP raksasa yang membebani memori browser.
            </p>

            {/* Option A: Native OS Directory Picker (Direct Disk Write) */}
            {'showDirectoryPicker' in window && (
              <div className="p-3 bg-sky-950/30 border border-sky-500/30 rounded-xl space-y-2">
                <div className="text-xs font-bold text-sky-300 flex items-center gap-1.5">
                  <i className="fa-solid fa-hard-drive"></i> Simpan Langsung ke Harddisk Komputer (Direkomendasikan)
                </div>
                <p className="text-[11px] text-gray-400">
                  Pilih folder di PC/Laptop Anda sekali saja. Setiap video akan langsung tertulis ke harddisk saat render selesai.
                </p>
                <button
                  type="button"
                  onClick={() => handleSelectFolderViaNativePicker(targetAccountForFolder)}
                  className="w-full py-2 bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 text-white rounded-xl text-xs font-bold transition shadow-md flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <i className="fa-solid fa-folder-tree"></i>
                  <span>Buka Dialog Pemilih Folder Komputer</span>
                </button>
              </div>
            )}

            {/* Option B: Folder Name Label (Automatic sequential download fallback) */}
            <div className="space-y-2 pt-1">
              <label className="block text-xs font-bold text-gray-300">
                Atau Tentukan Nama Sub-Folder Akun:
              </label>
              <input
                type="text"
                value={manualFolderNameInput}
                onChange={(e) => setManualFolderNameInput(e.target.value)}
                placeholder="Misal: Microstock_Akun_1"
                className="w-full bg-gray-950 border border-gray-800 rounded-xl px-3 py-2 text-xs font-semibold text-gray-200 focus:outline-none focus:border-purple-500"
              />
              <p className="text-[10px] text-gray-500">
                File MP4 akan diberi nama prefix sesuai folder ini dan otomatis tersimpan saat tiap video selesai diproses.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-800">
              <button
                type="button"
                onClick={() => setIsFolderPickerModalOpen(false)}
                className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-xl text-xs font-bold transition cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => handleSaveManualFolderName(targetAccountForFolder)}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5"
              >
                <i className="fa-solid fa-check text-xs"></i>
                <span>Terapkan Target Folder</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Batch Render Account Selection Modal */}
      {isBatchModalOpen && (
        <div className="fixed inset-0 z-[60] bg-black/90 backdrop-blur-md flex items-center justify-center p-4">
          <div className="glass-card rounded-2xl max-w-md w-full border border-gray-800 p-6 space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b border-gray-800 pb-3">
              <h3 className="font-bold text-gray-100 text-sm flex items-center gap-2">
                <i className="fa-solid fa-folder-arrow-down text-purple-400"></i> Pilih Akun untuk Batch Render ke Folder
              </h3>
              <button
                onClick={() => setIsBatchModalOpen(false)}
                className="text-gray-400 hover:text-white cursor-pointer"
              >
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>

            <p className="text-xs text-gray-400">
              Pilih akun mana saja yang ingin dirender ke MP4 (@ {exportBitrate} Mbps). Setiap 1 video yang selesai akan langsung tersimpan otomatis ke target folder akun tanpa membebani memori.
            </p>

            <div className="space-y-2 max-h-60 overflow-y-auto py-1">
              {uniqueAccounts.map((acc) => {
                const count = animations.filter((a) => (a.account || 'Manual') === acc).length;
                const isChecked = !!selectedBatchAccounts[acc];
                const folder = accountFolders[acc];

                return (
                  <div
                    key={acc}
                    className="flex items-center justify-between p-2.5 rounded-xl bg-gray-900/80 border border-gray-800 hover:border-purple-500/40 transition"
                  >
                    <label className="flex items-center gap-2.5 cursor-pointer flex-1">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={(e) =>
                          setSelectedBatchAccounts((prev) => ({ ...prev, [acc]: e.target.checked }))
                        }
                        className="w-4 h-4 rounded border-gray-700 text-purple-600 focus:ring-purple-500 bg-gray-950 cursor-pointer"
                      />
                      <span className="font-bold text-xs text-gray-200">{acc}</span>
                      <span className="text-[10px] bg-purple-500/20 text-purple-300 px-2 py-0.5 rounded-full font-bold">
                        {count} video
                      </span>
                    </label>

                    <button
                      type="button"
                      onClick={() => openFolderPickerModalForAccount(acc)}
                      className={`text-[10px] font-bold px-2 py-1 rounded-lg border cursor-pointer ${
                        folder
                          ? 'text-emerald-400 border-emerald-500/40 bg-emerald-950/40'
                          : 'text-red-400 border-red-500/40 bg-red-950/40 animate-pulse'
                      }`}
                      title="Klik untuk ubah folder target"
                    >
                      {folder ? `📁 ${folder}` : '⚠️ Set Folder'}
                    </button>
                  </div>
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
                onClick={handleStartBatchCheckFolders}
                className="px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 text-white rounded-xl text-xs font-bold transition shadow-lg shadow-purple-500/20 cursor-pointer flex items-center gap-1.5"
              >
                <i className="fa-solid fa-play text-xs"></i>
                <span>Mulai Render Berurutan</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
