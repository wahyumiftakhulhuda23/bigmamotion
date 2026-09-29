import React, { useState } from 'react';
import {
  ImageToMotionAutoPilotAccount,
  ReferenceImageUpload,
  MotionDynamics,
  ColorMode,
} from '../types';

interface ImageAutoPilotModalProps {
  isOpen: boolean;
  onClose: () => void;
  accounts: ImageToMotionAutoPilotAccount[];
  onSaveAccounts: (accounts: ImageToMotionAutoPilotAccount[]) => void;
  onResetAccounts: () => void;
  onDeleteAccount?: (id: string, name: string) => void;
  onStartAutoPilot: (accounts: ImageToMotionAutoPilotAccount[]) => void;
  isAutoPilotRunning: boolean;
  showToast: (msg: string, type?: 'info' | 'success' | 'warn' | 'error') => void;
}

// Helper to extract frame from WEBM / video files as base64 image
const extractFrameFromVideo = (file: File): Promise<string> => {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    const url = URL.createObjectURL(file);
    video.src = url;

    const cleanup = () => {
      URL.revokeObjectURL(url);
    };

    video.onloadeddata = () => {
      video.currentTime = 0.1;
    };

    video.onseeked = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth || 512;
        canvas.height = video.videoHeight || 512;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL('image/png');
          cleanup();
          resolve(dataUrl);
          return;
        }
      } catch (e) {
        console.error('Failed to capture frame from video', e);
      }
      cleanup();
      resolve('');
    };

    video.onerror = () => {
      cleanup();
      resolve('');
    };

    // Timeout safety
    setTimeout(() => {
      cleanup();
      resolve('');
    }, 4000);
  });
};

export const ImageAutoPilotModal: React.FC<ImageAutoPilotModalProps> = ({
  isOpen,
  onClose,
  accounts,
  onSaveAccounts,
  onResetAccounts,
  onDeleteAccount,
  onStartAutoPilot,
  isAutoPilotRunning,
  showToast,
}) => {
  const [localAccounts, setLocalAccounts] = useState<ImageToMotionAutoPilotAccount[]>(accounts);
  const [newAccountInput, setNewAccountInput] = useState<string>('');
  const [dragOverAccountId, setDragOverAccountId] = useState<string | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState<boolean>(false);
  const [isProcessingFiles, setIsProcessingFiles] = useState<boolean>(false);

  React.useEffect(() => {
    if (isOpen) {
      setLocalAccounts(accounts);
      setHasUnsavedChanges(false);
    }
  }, [isOpen, accounts]);

  if (!isOpen) return null;

  const totalImages = localAccounts.reduce(
    (sum, acc) => sum + (acc.referenceImages?.length || 0),
    0
  );

  // Add new account
  const handleAddNewAccount = () => {
    const trimmed = newAccountInput.trim();
    if (!trimmed) {
      showToast('Ketik nama akun terlebih dahulu!', 'warn');
      return;
    }

    if (localAccounts.some((a) => a.name.toLowerCase() === trimmed.toLowerCase())) {
      showToast(`Akun dengan nama "${trimmed}" sudah ada!`, 'warn');
      return;
    }

    const newAcc: ImageToMotionAutoPilotAccount = {
      id: 'acc_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
      name: trimmed,
      motionDynamics: 'flow',
      colorMode: 'gradient',
      neonGlow: true,
      isGreenScreen: false,
      customInstructions: '',
      referenceImages: [],
    };

    setLocalAccounts((prev) => [...prev, newAcc]);
    setNewAccountInput('');
    setHasUnsavedChanges(true);
    showToast(`Akun "${trimmed}" ditambahkan. Silakan upload atau drag & drop gambar!`, 'success');
  };

  // Remove account
  const handleRemoveAccount = (id: string, name: string) => {
    const updated = localAccounts.filter((a) => a.id !== id && a.name.toLowerCase() !== name.toLowerCase());
    setLocalAccounts(updated);
    onSaveAccounts(updated);
    if (onDeleteAccount) {
      onDeleteAccount(id, name);
    }
    setHasUnsavedChanges(false);
    showToast(`Akun "${name}" berhasil dihapus.`, 'info');
  };

  // Update account
  const handleUpdateAccount = (id: string, updates: Partial<ImageToMotionAutoPilotAccount>) => {
    setLocalAccounts((prev) =>
      prev.map((acc) => (acc.id === id ? { ...acc, ...updates } : acc))
    );
    setHasUnsavedChanges(true);
  };

  // Process files (images + webm video frames + other formats)
  const handleProcessFilesForAccount = async (accountId: string, files: FileList | File[]) => {
    const fileList = Array.from(files);
    if (fileList.length === 0) return;

    setIsProcessingFiles(true);
    const newUploads: ReferenceImageUpload[] = [];

    for (let idx = 0; idx < fileList.length; idx++) {
      const file = fileList[idx];
      const isWebmVideo = file.type.includes('webm') || /\.webm$/i.test(file.name);
      const isImage = file.type.startsWith('image/') || /\.(png|jpe?g|webp|svg|gif|bmp|avif)$/i.test(file.name);

      if (!isImage && !isWebmVideo) {
        continue;
      }

      const formattedSize = (file.size / 1024).toFixed(1) + ' KB';

      if (isWebmVideo) {
        // Extract first frame as image
        const frameDataUrl = await extractFrameFromVideo(file);
        if (frameDataUrl) {
          newUploads.push({
            id: 'ref_' + Date.now() + '_' + idx + '_' + Math.random().toString(36).substring(2, 6),
            fileName: file.name.replace(/\.webm$/i, '.png'),
            fileSize: formattedSize,
            previewUrl: frameDataUrl,
            imageBase64: frameDataUrl,
            mimeType: 'image/png',
          });
        }
      } else {
        // Read image file as data URL
        const dataUrl = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve((e.target?.result as string) || '');
          reader.onerror = () => resolve('');
          reader.readAsDataURL(file);
        });

        if (dataUrl) {
          newUploads.push({
            id: 'ref_' + Date.now() + '_' + idx + '_' + Math.random().toString(36).substring(2, 6),
            fileName: file.name,
            fileSize: formattedSize,
            previewUrl: dataUrl,
            imageBase64: dataUrl,
            mimeType: file.type || 'image/png',
          });
        }
      }
    }

    setIsProcessingFiles(false);

    if (newUploads.length === 0) {
      showToast('Format file tidak didukung. Mohon gunakan PNG, JPG, WEBM, WEBP, SVG, atau GIF.', 'warn');
      return;
    }

    setLocalAccounts((prev) =>
      prev.map((acc) => {
        if (acc.id === accountId) {
          const existing = acc.referenceImages || [];
          return {
            ...acc,
            referenceImages: [...existing, ...newUploads],
          };
        }
        return acc;
      })
    );

    setHasUnsavedChanges(true);
    showToast(`Berhasil menambahkan ${newUploads.length} gambar ke akun!`, 'success');
  };

  // Remove single image
  const handleRemoveImage = (accountId: string, imageId: string) => {
    setLocalAccounts((prev) =>
      prev.map((acc) => {
        if (acc.id === accountId) {
          return {
            ...acc,
            referenceImages: (acc.referenceImages || []).filter((img) => img.id !== imageId),
          };
        }
        return acc;
      })
    );
    setHasUnsavedChanges(true);
  };

  // Drag & drop handlers
  const handleDragOver = (e: React.DragEvent, accountId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverAccountId(accountId);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverAccountId(null);
  };

  const handleDrop = (e: React.DragEvent, accountId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverAccountId(null);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleProcessFilesForAccount(accountId, e.dataTransfer.files);
    }
  };

  // Save
  const handleSaveClick = () => {
    onSaveAccounts(localAccounts);
    setHasUnsavedChanges(false);
    showToast('Konfigurasi akun dan gambar referensi berhasil disimpan!', 'success');
  };

  // Reset
  const handleResetClick = () => {
    if (localAccounts.length === 0) {
      showToast('Daftar akun sudah kosong.', 'info');
      return;
    }
    setLocalAccounts([]);
    onResetAccounts();
    setHasUnsavedChanges(false);
    showToast('Seluruh daftar akun Auto Pilot telah direset!', 'info');
  };

  // Run
  const handleRunClick = () => {
    if (localAccounts.length === 0) {
      showToast('Tambahkan minimal 1 nama akun terlebih dahulu!', 'warn');
      return;
    }
    if (totalImages === 0) {
      showToast('Masukkan minimal 1 gambar referensi ke dalam akun sebelum menjalankan Auto Pilot!', 'warn');
      return;
    }

    onSaveAccounts(localAccounts);
    setHasUnsavedChanges(false);
    onStartAutoPilot(localAccounts);
  };

  return (
    <div
      id="image-autopilot-modal"
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-5"
    >
      <div className="glass-card rounded-2xl max-w-4xl w-full border border-amber-500/30 p-4 sm:p-6 space-y-4 max-h-[92vh] flex flex-col shadow-2xl bg-slate-950/95">
        {/* Header */}
        <div className="flex justify-between items-center border-b border-gray-800 pb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500/20 to-orange-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shadow-lg shadow-amber-500/10">
              <i className="fa-solid fa-robot text-xl"></i>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-extrabold text-gray-100 text-base">
                  Auto Pilot Multi-Akun (IMAGE TO PROMPT / MOTION)
                </h3>
                <span className="text-[10px] bg-amber-500/20 border border-amber-500/40 text-amber-300 font-bold px-2 py-0.5 rounded-full uppercase">
                  Batch Queue
                </span>
              </div>
              <p className="text-xs text-gray-400">
                Input nama akun, import / drag & drop gambar referensi per akun, simpan konfigurasi, dan jalankan otomatis.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-lg p-2 rounded-lg hover:bg-gray-800/60 transition cursor-pointer"
            title="Tutup Modal"
          >
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>

        {/* Input Name & Top Action Bar */}
        <div className="bg-slate-900/80 p-3 rounded-xl border border-gray-800 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="flex-1 flex items-center gap-2">
            <div className="relative flex-1">
              <i className="fa-solid fa-folder-plus text-amber-400 absolute left-3 top-1/2 -translate-y-1/2 text-xs"></i>
              <input
                type="text"
                placeholder="Ketik nama akun baru (contoh: Akun 1, Akun Animasi A)..."
                value={newAccountInput}
                onChange={(e) => setNewAccountInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddNewAccount();
                  }
                }}
                className="w-full bg-slate-950 border border-gray-700 focus:border-amber-500 rounded-xl pl-8 pr-3 py-2 text-xs text-gray-100 placeholder-gray-500 font-medium focus:outline-none"
              />
            </div>
            <button
              type="button"
              onClick={handleAddNewAccount}
              className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-black text-xs transition flex items-center gap-1.5 cursor-pointer shadow-md shrink-0 active:scale-95"
            >
              <i className="fa-solid fa-plus text-xs"></i>
              <span>Tambah Akun</span>
            </button>
          </div>

          {/* Quick Actions: Simpan & Reset */}
          <div className="flex items-center gap-2 shrink-0 border-t sm:border-t-0 sm:border-l border-gray-800 pt-2 sm:pt-0 sm:pl-3">
            <button
              type="button"
              onClick={handleSaveClick}
              className={`px-3 py-2 rounded-xl border text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-sm active:scale-95 ${
                hasUnsavedChanges
                  ? 'bg-emerald-600/30 text-emerald-300 border-emerald-500/60 hover:bg-emerald-600/40 animate-pulse'
                  : 'bg-slate-800/80 text-gray-300 border-gray-700 hover:bg-slate-800'
              }`}
              title="Simpan konfigurasi akun dan gambar referensi"
            >
              <i className="fa-solid fa-floppy-disk text-xs"></i>
              <span>Simpan</span>
              {hasUnsavedChanges && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>}
            </button>

            <button
              type="button"
              onClick={handleResetClick}
              className="px-3 py-2 rounded-xl bg-slate-800/80 hover:bg-rose-900/40 text-gray-400 hover:text-rose-300 border border-gray-700 hover:border-rose-500/40 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer active:scale-95"
              title="Reset seluruh akun kembali kosong"
            >
              <i className="fa-solid fa-rotate-left text-xs"></i>
              <span>Reset</span>
            </button>
          </div>
        </div>

        {/* Accounts List Container */}
        <div className="space-y-4 overflow-y-auto pr-1 flex-1">
          {localAccounts.length === 0 ? (
            /* Clean Empty State as requested: "semuanya kosong saya mau menambahkan namanya sendiri" */
            <div className="p-8 text-center border-2 border-dashed border-gray-800 hover:border-amber-500/40 rounded-2xl space-y-3 bg-slate-900/20 transition">
              <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mx-auto text-2xl shadow-inner">
                <i className="fa-solid fa-folder-open"></i>
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-bold text-gray-200">
                  Daftar Akun Masih Kosong
                </h4>
                <p className="text-xs text-gray-400 max-w-md mx-auto">
                  Silakan masukkan nama akun pertama Anda pada form di atas, lalu klik <strong>+ Tambah Akun</strong>. Anda dapat mengimpor gambar dari komputer atau men-drag & drop gambar referensi (PNG, JPG, WEBM, WEBP, SVG, dll).
                </p>
              </div>

              {/* Quick suggestions */}
              <div className="pt-2 flex flex-wrap justify-center gap-2">
                <span className="text-[11px] text-gray-500 self-center">Contoh cepat:</span>
                {['Akun 1', 'Akun 2', 'Akun Promo'].map((exampleName) => (
                  <button
                    key={exampleName}
                    type="button"
                    onClick={() => {
                      setNewAccountInput(exampleName);
                    }}
                    className="px-2.5 py-1 rounded-lg bg-slate-800/80 hover:bg-slate-800 border border-gray-700 text-xs text-gray-300 hover:text-amber-300 transition cursor-pointer"
                  >
                    + {exampleName}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {localAccounts.map((acc, aIdx) => {
                const imagesCount = acc.referenceImages?.length || 0;
                const isOver = dragOverAccountId === acc.id;

                return (
                  <div
                    key={acc.id}
                    onDragOver={(e) => handleDragOver(e, acc.id)}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, acc.id)}
                    className={`glass-card rounded-2xl border p-4 space-y-3 transition-all relative ${
                      isOver
                        ? 'border-amber-400 bg-amber-950/20 shadow-lg shadow-amber-500/20 ring-2 ring-amber-400/40'
                        : 'border-gray-800 bg-slate-900/50 hover:border-gray-700'
                    }`}
                  >
                    {/* Top Row: Account Name (Editable in-place), Image count & Delete */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-2 border-b border-gray-800/80">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <span className="w-6 h-6 rounded-lg bg-amber-500/20 border border-amber-500/30 text-amber-400 flex items-center justify-center text-xs font-mono font-bold shrink-0">
                          #{aIdx + 1}
                        </span>

                        {/* Inline Editable Account Name */}
                        <div className="flex-1 max-w-sm relative">
                          <input
                            type="text"
                            value={acc.name}
                            onChange={(e) => handleUpdateAccount(acc.id, { name: e.target.value })}
                            className="w-full bg-slate-950 border border-gray-700 focus:border-amber-400 rounded-lg px-2.5 py-1 text-xs font-bold text-amber-300 focus:outline-none"
                            placeholder="Nama Akun..."
                            title="Klik untuk mengubah nama akun"
                          />
                        </div>

                        <span className="px-2 py-0.5 rounded-md bg-slate-800 text-[10px] font-bold text-gray-300 border border-gray-700 whitespace-nowrap">
                          {imagesCount} File Terunggah
                        </span>
                      </div>

                      {/* Delete account button */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemoveAccount(acc.id, acc.name);
                        }}
                        className="self-end sm:self-center px-2.5 py-1 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/40 text-rose-300 hover:text-white transition text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-sm active:scale-95 shrink-0"
                        title={`Hapus Akun ${acc.name}`}
                      >
                        <i className="fa-solid fa-trash-can text-xs text-rose-400"></i>
                        <span>Hapus Akun</span>
                      </button>
                    </div>

                    {/* Dual Action: Import dari Komputer & Drag & Drop Zone */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                          <i className="fa-solid fa-images text-amber-400"></i>
                          <span>Gambar Referensi Akun [{acc.name}]</span>
                        </label>

                        {/* Direct Button: Import dari Penyimpanan Komputer */}
                        <button
                          type="button"
                          onClick={() => {
                            const input = document.getElementById(`file-import-input-${acc.id}`) as HTMLInputElement;
                            if (input) input.click();
                          }}
                          className="px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer active:scale-95 shadow-sm"
                          title="Import gambar dari penyimpanan komputer"
                        >
                          <i className="fa-solid fa-folder-open text-xs"></i>
                          <span>Import dari Komputer</span>
                        </button>
                      </div>

                      {/* Dropzone Card */}
                      <div
                        onClick={() => {
                          const input = document.getElementById(`file-import-input-${acc.id}`) as HTMLInputElement;
                          if (input) input.click();
                        }}
                        className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition flex flex-col items-center justify-center gap-1.5 ${
                          isOver
                            ? 'border-amber-400 bg-amber-500/10'
                            : 'border-gray-700/80 hover:border-amber-500/60 bg-slate-950/60'
                        }`}
                      >
                        <input
                          id={`file-import-input-${acc.id}`}
                          type="file"
                          multiple
                          accept="image/*,video/webm,.png,.jpg,.jpeg,.webp,.webm,.svg,.gif,.bmp,.avif"
                          className="hidden"
                          onChange={(e) => {
                            if (e.target.files && e.target.files.length > 0) {
                              handleProcessFilesForAccount(acc.id, e.target.files);
                            }
                          }}
                        />
                        <div className="flex items-center gap-2 text-amber-300 text-xs font-bold">
                          <i className="fa-solid fa-cloud-arrow-up text-base text-amber-400"></i>
                          <span>Drag & drop gambar ke sini, atau klik tombol "Import dari Komputer"</span>
                        </div>
                        <p className="text-[10px] text-gray-500">
                          Mendukung format: <strong>PNG, JPG, JPEG, WEBM, WEBP, SVG, GIF, BMP</strong> (Multi-file batch)
                        </p>
                        {isProcessingFiles && (
                          <div className="flex items-center gap-1.5 text-xs text-amber-400 font-bold mt-1">
                            <i className="fa-solid fa-spinner fa-spin text-xs"></i>
                            <span>Memproses file & mengekstrak frame...</span>
                          </div>
                        )}
                      </div>

                      {/* Thumbnail List of Uploaded Reference Images */}
                      {imagesCount > 0 && (
                        <div className="pt-1 space-y-1.5">
                          <div className="text-[10px] text-gray-400 font-semibold flex items-center justify-between">
                            <span>File Terunggah ({imagesCount} file):</span>
                            <span className="text-gray-500 text-[9px]">Klik ikon silang (x) untuk menghapus</span>
                          </div>

                          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2 max-h-40 overflow-y-auto p-1.5 bg-slate-950/80 rounded-xl border border-gray-800">
                            {(acc.referenceImages || []).map((img) => (
                              <div
                                key={img.id}
                                className="group relative bg-slate-900 border border-gray-800 rounded-lg p-1.5 flex flex-col items-center gap-1 hover:border-amber-500/50 transition"
                              >
                                <div className="w-full h-14 bg-slate-950 rounded overflow-hidden flex items-center justify-center relative">
                                  <img
                                    src={img.previewUrl}
                                    alt={img.fileName}
                                    className="max-h-full max-w-full object-contain"
                                  />
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleRemoveImage(acc.id, img.id);
                                    }}
                                    className="absolute top-1 right-1 w-5 h-5 rounded-full bg-rose-600/90 text-white flex items-center justify-center text-[9px] hover:bg-rose-500 transition opacity-80 group-hover:opacity-100 cursor-pointer shadow"
                                    title="Hapus gambar ini"
                                  >
                                    <i className="fa-solid fa-xmark"></i>
                                  </button>
                                </div>
                                <span className="text-[10px] text-gray-300 font-medium truncate w-full text-center">
                                  {img.fileName}
                                </span>
                                <span className="text-[9px] text-gray-500 font-mono">
                                  {img.fileSize}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Per-Account Visual & Motion Options (Customizable per account) */}
                    <div className="pt-2 border-t border-gray-800/60 grid grid-cols-1 sm:grid-cols-4 gap-2.5">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-sky-400 uppercase flex items-center gap-1">
                          <i className="fa-solid fa-person-running text-[9px]"></i>
                          <span>Fisika Gerak</span>
                        </label>
                        <select
                          value={acc.motionDynamics || 'flow'}
                          onChange={(e) =>
                            handleUpdateAccount(acc.id, {
                              motionDynamics: e.target.value as MotionDynamics,
                            })
                          }
                          className="w-full bg-slate-950 border border-gray-700 rounded-lg p-1.5 text-xs text-gray-200 focus:border-amber-400 focus:outline-none cursor-pointer"
                        >
                          <option value="flow">Flow & Wave</option>
                          <option value="bounce">Elastic Bounce</option>
                          <option value="orbital">3D Orbital</option>
                          <option value="morph">Kinetic Morph</option>
                          <option value="cyber">Cyber Step</option>
                          <option value="mechanical">Mechanical</option>
                        </select>
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-pink-400 uppercase flex items-center gap-1">
                          <i className="fa-solid fa-palette text-[9px]"></i>
                          <span>Mode Warna</span>
                        </label>
                        <select
                          value={acc.colorMode || 'gradient'}
                          onChange={(e) =>
                            handleUpdateAccount(acc.id, {
                              colorMode: e.target.value as ColorMode,
                            })
                          }
                          className="w-full bg-slate-950 border border-gray-700 rounded-lg p-1.5 text-xs text-gray-200 focus:border-amber-400 focus:outline-none cursor-pointer"
                        >
                          <option value="gradient">Gradient Vibrant</option>
                          <option value="flat">Flat Solid</option>
                          <option value="neon">Neon Cyberpunk</option>
                          <option value="monochrome">Monochrome Slate</option>
                          <option value="pastel">Pastel Aesthetic</option>
                          <option value="luxury">Luxury Gold</option>
                        </select>
                      </div>

                      <div className="space-y-1 sm:col-span-2 flex items-end">
                        <div className="flex items-center gap-2 w-full">
                          <label
                            className="flex-1 flex items-center gap-1.5 p-1.5 rounded-lg border border-gray-800 bg-slate-950 cursor-pointer select-none text-[10px] font-bold text-purple-300"
                            onClick={() =>
                              handleUpdateAccount(acc.id, {
                                neonGlow: !acc.neonGlow,
                              })
                            }
                          >
                            <input
                              type="checkbox"
                              checked={acc.neonGlow ?? true}
                              onChange={() => {}}
                              className="rounded text-purple-500 focus:ring-0"
                            />
                            <span>Neon Glow</span>
                          </label>

                          <label
                            className="flex-1 flex items-center gap-1.5 p-1.5 rounded-lg border border-gray-800 bg-slate-950 cursor-pointer select-none text-[10px] font-bold text-emerald-400"
                            onClick={() =>
                              handleUpdateAccount(acc.id, {
                                isGreenScreen: !acc.isGreenScreen,
                              })
                            }
                          >
                            <input
                              type="checkbox"
                              checked={acc.isGreenScreen ?? false}
                              onChange={() => {}}
                              className="rounded text-emerald-500 focus:ring-0"
                            />
                            <span>Chroma Green</span>
                          </label>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Modal Bottom Bar: Summary & Main Trigger */}
        <div className="border-t border-gray-800 pt-3 flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3">
          <div className="flex items-center gap-3 text-xs">
            <span className="text-gray-400 font-medium">
              Total Antrian: <strong className="text-amber-300 font-mono">{localAccounts.length}</strong> Akun •{' '}
              <strong className="text-emerald-300 font-mono">{totalImages}</strong> Gambar Referensi
            </span>
          </div>

          <div className="flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={handleSaveClick}
              className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-gray-200 text-xs font-bold cursor-pointer transition flex items-center gap-1.5"
            >
              <i className="fa-solid fa-floppy-disk"></i>
              <span>Simpan</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-semibold cursor-pointer"
            >
              Tutup
            </button>

            <button
              type="button"
              onClick={handleRunClick}
              disabled={isAutoPilotRunning || localAccounts.length === 0 || totalImages === 0}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 via-orange-500 to-yellow-400 hover:from-amber-400 hover:to-yellow-300 text-slate-950 font-black text-xs shadow-lg shadow-amber-500/25 flex items-center gap-2 cursor-pointer disabled:opacity-40 transition active:scale-95"
              title="Jalankan otomatis di halaman Image to Motion / Prompt per antrian akun"
            >
              {isAutoPilotRunning ? (
                <>
                  <i className="fa-solid fa-spinner fa-spin text-sm"></i>
                  <span>Auto Pilot Berjalan...</span>
                </>
              ) : (
                <>
                  <i className="fa-solid fa-rocket text-sm"></i>
                  <span>Jalankan Auto Pilot ({totalImages} Animasi)</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
