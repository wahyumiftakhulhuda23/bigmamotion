import React, { useState, useRef, useEffect } from 'react';
import {
  ImageToMotionAutoPilotAccount,
  ReferenceImageUpload,
  MotionDynamics,
  ColorMode,
  ImageToMotionProject,
} from '../types';

interface ImageToMotionAutoPilotModalProps {
  isOpen: boolean;
  projects: ImageToMotionProject[];
  onClose: () => void;
  onStartAutoPilot: (accounts: ImageToMotionAutoPilotAccount[]) => void;
  isAutoPilotRunning: boolean;
  showToast: (msg: string, type?: 'info' | 'success' | 'warn' | 'error') => void;
}

export const ImageToMotionAutoPilotModal: React.FC<ImageToMotionAutoPilotModalProps> = ({
  isOpen,
  projects,
  onClose,
  onStartAutoPilot,
  isAutoPilotRunning,
  showToast,
}) => {
  const [accounts, setAccounts] = useState<ImageToMotionAutoPilotAccount[]>(() => {
    if (projects && projects.length > 0) {
      return projects.map((p, idx) => ({
        id: 'i2m_acc_' + p.id,
        projectId: p.id,
        name: p.name,
        motionDynamics: (idx % 2 === 0 ? 'flow' : 'bounce') as MotionDynamics,
        colorMode: 'gradient' as ColorMode,
        neonGlow: true,
        isGreenScreen: false,
        customInstructions: '',
        referenceImages: [],
      }));
    }
    return [
      {
        id: 'i2m_acc_1',
        name: 'Akun AdobeStock Vector',
        motionDynamics: 'flow',
        colorMode: 'gradient',
        neonGlow: true,
        isGreenScreen: false,
        customInstructions: '',
        referenceImages: [],
      },
      {
        id: 'i2m_acc_2',
        name: 'Akun Freepik Cyber Icons',
        motionDynamics: 'cyber',
        colorMode: 'neon',
        neonGlow: true,
        isGreenScreen: false,
        customInstructions: '',
        referenceImages: [],
      },
    ];
  });

  const [dragOverAccountIndex, setDragOverAccountIndex] = useState<number | null>(null);
  const [isGlobalDragging, setIsGlobalDragging] = useState<boolean>(false);
  const [globalDistributeMode, setGlobalDistributeMode] = useState<'split_evenly' | 'append_all'>('split_evenly');
  const globalFileInputRef = useRef<HTMLInputElement>(null);
  const accountFileInputRefs = useRef<{ [key: number]: HTMLInputElement | null }>({});

  // Sync initial accounts if projects change and accounts have 0 images
  useEffect(() => {
    if (projects.length > 0) {
      setAccounts((prev) => {
        const hasCustomImages = prev.some((a) => a.referenceImages.length > 0);
        if (hasCustomImages) return prev; // Don't wipe user's added images
        return projects.map((p, idx) => {
          const existing = prev.find((a) => a.projectId === p.id || a.name === p.name);
          if (existing) return existing;
          return {
            id: 'i2m_acc_' + p.id,
            projectId: p.id,
            name: p.name,
            motionDynamics: (idx % 2 === 0 ? 'flow' : 'bounce') as MotionDynamics,
            colorMode: 'gradient' as ColorMode,
            neonGlow: true,
            isGreenScreen: false,
            customInstructions: '',
            referenceImages: [],
          };
        });
      });
    }
  }, [projects, isOpen]);

  // Support Ctrl+V paste inside modal
  useEffect(() => {
    if (!isOpen) return;

    const handlePaste = (e: ClipboardEvent) => {
      if (!e.clipboardData) return;
      const items = e.clipboardData.items;
      const files: File[] = [];

      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          const file = items[i].getAsFile();
          if (file) files.push(file);
        }
      }

      if (files.length > 0) {
        addFilesToAccount(0, files);
        showToast(`${files.length} gambar referensi dari clipboard ditambahkan ke Akun 1!`, 'success');
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [isOpen, accounts]);

  if (!isOpen) return null;

  // Process File list into ReferenceImageUpload items
  const readFileAsReferenceImage = (file: File): Promise<ReferenceImageUpload> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const base64 = (e.target?.result as string) || '';
        const sizeKb = (file.size / 1024).toFixed(1) + ' KB';
        resolve({
          id: 'ref_' + Date.now() + '_' + Math.random().toString(36).substring(7),
          fileName: file.name,
          fileSize: sizeKb,
          previewUrl: base64,
          imageBase64: base64,
          mimeType: file.type || 'image/png',
        });
      };
      reader.readAsDataURL(file);
    });
  };

  const addFilesToAccount = async (accountIndex: number, files: FileList | File[]) => {
    const validFiles = Array.from(files).filter(
      (f) => f.type.startsWith('image/') || /\.(jpg|jpeg|png|webp|svg|bmp|gif)$/i.test(f.name)
    );

    if (validFiles.length === 0) {
      showToast('Pilih format gambar yang valid (JPG, PNG, WEBP, SVG)', 'warn');
      return;
    }

    const uploaded = await Promise.all(validFiles.map(readFileAsReferenceImage));

    setAccounts((prev) => {
      const next = [...prev];
      if (!next[accountIndex]) return prev;
      next[accountIndex] = {
        ...next[accountIndex],
        referenceImages: [...next[accountIndex].referenceImages, ...uploaded],
      };
      return next;
    });

    showToast(`Berhasil menambahkan ${uploaded.length} gambar ke "${accounts[accountIndex]?.name}"`, 'success');
  };

  const handleGlobalFiles = async (files: FileList | File[]) => {
    const validFiles = Array.from(files).filter(
      (f) => f.type.startsWith('image/') || /\.(jpg|jpeg|png|webp|svg|bmp|gif)$/i.test(f.name)
    );

    if (validFiles.length === 0) {
      showToast('Pilih format gambar yang valid (JPG, PNG, WEBP, SVG)', 'warn');
      return;
    }

    const uploaded = await Promise.all(validFiles.map(readFileAsReferenceImage));

    setAccounts((prev) => {
      if (prev.length === 0) return prev;
      const next = [...prev];

      if (globalDistributeMode === 'split_evenly') {
        // Distribute round-robin
        uploaded.forEach((img, idx) => {
          const targetAccIdx = idx % next.length;
          next[targetAccIdx] = {
            ...next[targetAccIdx],
            referenceImages: [...next[targetAccIdx].referenceImages, img],
          };
        });
      } else {
        // Append all images to each account
        for (let i = 0; i < next.length; i++) {
          next[i] = {
            ...next[i],
            referenceImages: [...next[i].referenceImages, ...uploaded],
          };
        }
      }
      return next;
    });

    showToast(
      `Berhasil mendistribusikan ${uploaded.length} gambar ke ${accounts.length} akun (${
        globalDistributeMode === 'split_evenly' ? 'Bagi Rata' : 'Semua Akun'
      })!`,
      'success'
    );
  };

  const handleAddAccount = () => {
    const newIdx = accounts.length + 1;
    const newAcc: ImageToMotionAutoPilotAccount = {
      id: 'i2m_acc_' + Date.now(),
      name: `Akun Microstock #${newIdx}`,
      motionDynamics: 'flow',
      colorMode: 'gradient',
      neonGlow: true,
      isGreenScreen: false,
      customInstructions: '',
      referenceImages: [],
    };
    setAccounts((prev) => [...prev, newAcc]);
    showToast(`Akun baru #${newIdx} berhasil ditambahkan`, 'info');
  };

  const handleRemoveAccount = (index: number) => {
    if (accounts.length <= 1) {
      showToast('Minimal harus ada 1 akun untuk Auto Pilot', 'warn');
      return;
    }
    setAccounts((prev) => prev.filter((_, i) => i !== index));
  };

  const handleUpdateAccount = (index: number, updates: Partial<ImageToMotionAutoPilotAccount>) => {
    setAccounts((prev) => {
      const next = [...prev];
      if (!next[index]) return prev;
      next[index] = { ...next[index], ...updates };
      return next;
    });
  };

  const handleRemoveImageFromAccount = (accountIndex: number, imageId: string) => {
    setAccounts((prev) => {
      const next = [...prev];
      if (!next[accountIndex]) return prev;
      next[accountIndex] = {
        ...next[accountIndex],
        referenceImages: next[accountIndex].referenceImages.filter((img) => img.id !== imageId),
      };
      return next;
    });
  };

  const handleClearImagesFromAccount = (accountIndex: number) => {
    setAccounts((prev) => {
      const next = [...prev];
      if (!next[accountIndex]) return prev;
      next[accountIndex] = {
        ...next[accountIndex],
        referenceImages: [],
      };
      return next;
    });
  };

  const totalReferenceImages = accounts.reduce((sum, a) => sum + a.referenceImages.length, 0);

  const handleExecuteStart = () => {
    if (totalReferenceImages === 0) {
      showToast('Mohon tambahkan minimal 1 gambar referensi ke salah satu akun!', 'warn');
      return;
    }

    onStartAutoPilot(accounts);
    onClose();
  };

  return (
    <div
      id="i2m-autopilot-modal"
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 animate-fadeIn"
    >
      <div className="glass-card rounded-2xl max-w-4xl w-full border-2 border-amber-500/40 p-4 sm:p-6 space-y-4 max-h-[92vh] flex flex-col shadow-2xl bg-slate-950/95">
        {/* Modal Header */}
        <div className="flex justify-between items-center border-b border-gray-800 pb-3 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 to-yellow-400 border border-amber-400/50 flex items-center justify-center text-slate-950 font-black shadow-lg shadow-amber-500/20">
              <i className="fa-solid fa-robot text-lg"></i>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-extrabold text-gray-100 text-sm sm:text-base">
                  Auto Pilot Image to Motion Multi-Akun
                </h3>
                <span className="text-[9px] bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                  Vision Replicator
                </span>
              </div>
              <p className="text-[11px] text-gray-400">
                Drag & drop / import gambar referensi untuk ditiru menjadi animasi Canvas 2D 60 FPS di berbagai akun sekaligus.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-lg p-1.5 rounded-lg hover:bg-slate-900 transition cursor-pointer"
          >
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>

        {/* Global Bulk Reference Importer Drop Zone */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsGlobalDragging(true);
          }}
          onDragLeave={() => setIsGlobalDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsGlobalDragging(false);
            if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
              handleGlobalFiles(e.dataTransfer.files);
            }
          }}
          className={`p-3.5 rounded-xl border-2 border-dashed transition flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0 ${
            isGlobalDragging
              ? 'border-amber-400 bg-amber-500/15 scale-[1.01]'
              : 'border-amber-500/30 bg-slate-900/50 hover:border-amber-400/50'
          }`}
        >
          <input
            type="file"
            ref={globalFileInputRef}
            onChange={(e) => e.target.files && handleGlobalFiles(e.target.files)}
            multiple
            accept="image/*,.jpg,.jpeg,.png,.webp,.svg"
            className="hidden"
          />

          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center text-base shrink-0">
              <i className="fa-solid fa-cloud-arrow-up"></i>
            </div>
            <div>
              <span className="text-xs font-bold text-amber-200 block">
                Bulk Import Gambar Referensi Cepat
              </span>
              <span className="text-[11px] text-gray-400 block">
                Drop banyak gambar ke sini untuk langsung didistribusikan ke akun-akun di bawah.
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
            {/* Distribution Mode Selector */}
            <select
              value={globalDistributeMode}
              onChange={(e) => setGlobalDistributeMode(e.target.value as any)}
              className="bg-slate-950 text-gray-200 border border-gray-700 text-xs rounded-lg px-2.5 py-1.5 font-medium focus:outline-none cursor-pointer"
            >
              <option value="split_evenly">⚖️ Bagi Rata ({accounts.length} Akun)</option>
              <option value="append_all">📥 Masukkan ke Semua Akun</option>
            </select>

            <button
              type="button"
              onClick={() => globalFileInputRef.current?.click()}
              className="px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap active:scale-95"
            >
              <i className="fa-solid fa-folder-open text-xs"></i>
              <span>Pilih Gambar</span>
            </button>
          </div>
        </div>

        {/* Action Header for Accounts List */}
        <div className="flex justify-between items-center bg-slate-900/80 p-2.5 rounded-xl border border-gray-800 shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-gray-200 uppercase tracking-wider">
              Daftar Akun Auto Pilot ({accounts.length})
            </span>
            <span className="text-[11px] text-amber-400 font-mono bg-amber-950/60 border border-amber-800/50 px-2 py-0.5 rounded-md font-bold">
              {totalReferenceImages} Total Gambar
            </span>
          </div>
          <button
            type="button"
            onClick={handleAddAccount}
            className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-amber-500 to-yellow-400 hover:from-amber-400 hover:to-yellow-300 text-slate-950 font-extrabold text-xs transition flex items-center gap-1.5 cursor-pointer shadow-md shadow-amber-500/20 active:scale-95"
          >
            <i className="fa-solid fa-user-plus"></i>
            <span>+ Tambah Akun</span>
          </button>
        </div>

        {/* Scrollable Accounts Cards */}
        <div className="space-y-3.5 overflow-y-auto pr-1 flex-1">
          {accounts.map((acc, index) => {
            const isTargetDrag = dragOverAccountIndex === index;

            return (
              <div
                key={acc.id || index}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOverAccountIndex(index);
                }}
                onDragLeave={() => setDragOverAccountIndex(null)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOverAccountIndex(null);
                  if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                    addFilesToAccount(index, e.dataTransfer.files);
                  }
                }}
                className={`glass-card rounded-2xl border p-4 space-y-3 relative transition-all duration-200 ${
                  isTargetDrag
                    ? 'border-amber-400 bg-amber-950/30 scale-[1.005] shadow-xl'
                    : 'border-gray-800/90 bg-slate-900/60 hover:border-gray-700'
                }`}
              >
                {/* Row 1: Account Header (Name & Delete) */}
                <div className="flex items-center justify-between gap-3 pb-2 border-b border-gray-800/70">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className="w-6 h-6 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center text-xs font-bold shrink-0">
                      #{index + 1}
                    </span>
                    <input
                      type="text"
                      value={acc.name}
                      onChange={(e) => handleUpdateAccount(index, { name: e.target.value })}
                      placeholder="Nama Akun / Folder..."
                      className="bg-slate-950 border border-gray-700 rounded-lg px-2.5 py-1 text-xs text-amber-200 font-bold focus:border-amber-400 focus:outline-none flex-1 max-w-xs"
                    />
                    <span className="text-[11px] text-gray-400 font-mono">
                      ({acc.referenceImages.length} referensi)
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {acc.referenceImages.length > 0 && (
                      <button
                        type="button"
                        onClick={() => handleClearImagesFromAccount(index)}
                        className="text-[10px] text-gray-400 hover:text-rose-300 px-2 py-1 rounded bg-slate-950 border border-gray-800 transition cursor-pointer"
                        title="Kosongkan gambar referensi akun ini"
                      >
                        <i className="fa-solid fa-eraser mr-1"></i> Kosongkan
                      </button>
                    )}

                    {accounts.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveAccount(index)}
                        className="p-1.5 text-gray-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition cursor-pointer"
                        title="Hapus Akun Ini"
                      >
                        <i className="fa-solid fa-trash text-xs"></i>
                      </button>
                    )}
                  </div>
                </div>

                {/* Row 2: Account Reference Images Drop Zone & Thumbnails */}
                <div className="space-y-2">
                  <input
                    type="file"
                    ref={(el) => (accountFileInputRefs.current[index] = el)}
                    onChange={(e) => e.target.files && addFilesToAccount(index, e.target.files)}
                    multiple
                    accept="image/*,.jpg,.jpeg,.png,.webp,.svg"
                    className="hidden"
                  />

                  {acc.referenceImages.length === 0 ? (
                    <div
                      onClick={() => accountFileInputRefs.current[index]?.click()}
                      className="border border-dashed border-amber-500/30 hover:border-amber-400/60 rounded-xl p-3 text-center cursor-pointer bg-slate-950/60 hover:bg-slate-950/90 transition flex items-center justify-center gap-2 group"
                    >
                      <i className="fa-solid fa-images text-amber-400 text-sm group-hover:scale-110 transition-transform"></i>
                      <span className="text-xs text-gray-300 font-medium">
                        Drag & drop gambar referensi untuk <strong className="text-amber-300">{acc.name}</strong> atau{' '}
                        <span className="text-amber-400 underline decoration-amber-400/50">klik browse</span>
                      </span>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-[10px] text-gray-400">
                        <span>Gambar Referensi ({acc.referenceImages.length}):</span>
                        <button
                          type="button"
                          onClick={() => accountFileInputRefs.current[index]?.click()}
                          className="text-amber-400 hover:text-amber-300 font-bold cursor-pointer"
                        >
                          + Tambah Lagi
                        </button>
                      </div>

                      {/* Thumbnails grid */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2 max-h-36 overflow-y-auto p-1 bg-slate-950/80 rounded-xl border border-gray-800">
                        {acc.referenceImages.map((img) => (
                          <div
                            key={img.id}
                            className="relative group rounded-lg overflow-hidden border border-gray-700 bg-slate-900 aspect-square flex flex-col items-center justify-center p-1"
                          >
                            <img
                              src={img.previewUrl}
                              alt={img.fileName}
                              className="max-h-full max-w-full object-contain"
                            />
                            <div className="absolute inset-0 bg-black/75 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-between p-1">
                              <span className="text-[8px] text-white font-mono truncate w-full text-center">
                                {img.fileName}
                              </span>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRemoveImageFromAccount(index, img.id);
                                }}
                                className="w-5 h-5 rounded-full bg-rose-600 text-white flex items-center justify-center text-[10px] hover:bg-rose-500 cursor-pointer shadow"
                                title="Hapus gambar ini"
                              >
                                <i className="fa-solid fa-xmark"></i>
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Row 3: Visual & Dynamics Configuration for this Account */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-gray-800/60">
                  {/* Motion Dynamics */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-sky-400 uppercase block">
                      Motion Dynamics
                    </label>
                    <select
                      value={acc.motionDynamics || 'flow'}
                      onChange={(e) =>
                        handleUpdateAccount(index, { motionDynamics: e.target.value as MotionDynamics })
                      }
                      className="w-full bg-slate-950 border border-gray-700 rounded-lg p-1.5 text-xs text-gray-200 focus:border-amber-400 focus:outline-none cursor-pointer"
                    >
                      <option value="flow">🌊 Organic Flow</option>
                      <option value="bounce">⚡ Elastic Bounce</option>
                      <option value="orbital">🪐 3D Orbital</option>
                      <option value="morph">✨ Kinetic Morph</option>
                      <option value="cyber">🤖 Cyber Matrix</option>
                      <option value="mechanical">⚙️ Mechanical</option>
                    </select>
                  </div>

                  {/* Color Mode */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-pink-400 uppercase block">
                      Palet Warna
                    </label>
                    <select
                      value={acc.colorMode || 'gradient'}
                      onChange={(e) =>
                        handleUpdateAccount(index, { colorMode: e.target.value as ColorMode })
                      }
                      className="w-full bg-slate-950 border border-gray-700 rounded-lg p-1.5 text-xs text-gray-200 focus:border-amber-400 focus:outline-none cursor-pointer"
                    >
                      <option value="gradient">🌈 Dynamic Gradient</option>
                      <option value="neon">⚡ Cyber Neon</option>
                      <option value="flat">🎨 Flat Vector</option>
                      <option value="monochrome">⬛ Monochrome</option>
                      <option value="pastel">🌸 Soft Pastel</option>
                      <option value="luxury">👑 Luxury Gold</option>
                    </select>
                  </div>

                  {/* Neon Glow Toggle */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-amber-400 uppercase block">
                      Glow / Neon
                    </label>
                    <button
                      type="button"
                      onClick={() => handleUpdateAccount(index, { neonGlow: !acc.neonGlow })}
                      className={`w-full text-xs font-bold rounded-lg p-1.5 border flex items-center justify-center gap-1.5 transition cursor-pointer ${
                        acc.neonGlow
                          ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                          : 'bg-slate-950 text-gray-400 border-gray-800'
                      }`}
                    >
                      <i className={`fa-solid fa-${acc.neonGlow ? 'sun text-amber-400' : 'circle-xmark'}`}></i>
                      <span>{acc.neonGlow ? 'Glow ON' : 'Glow OFF'}</span>
                    </button>
                  </div>

                  {/* Green Screen Toggle */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-emerald-400 uppercase block">
                      Background
                    </label>
                    <button
                      type="button"
                      onClick={() => handleUpdateAccount(index, { isGreenScreen: !acc.isGreenScreen })}
                      className={`w-full text-xs font-bold rounded-lg p-1.5 border flex items-center justify-center gap-1.5 transition cursor-pointer ${
                        acc.isGreenScreen
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                          : 'bg-slate-950 text-gray-400 border-gray-800'
                      }`}
                    >
                      <i className={`fa-solid fa-circle text-[8px] ${acc.isGreenScreen ? 'text-emerald-400' : 'text-gray-500'}`}></i>
                      <span>{acc.isGreenScreen ? '#00FF00' : 'Dark Studio'}</span>
                    </button>
                  </div>
                </div>

                {/* Row 4: Custom Instructions for Mimicking / Replication */}
                <div>
                  <input
                    type="text"
                    value={acc.customInstructions || ''}
                    onChange={(e) => handleUpdateAccount(index, { customInstructions: e.target.value })}
                    placeholder={`Instruksi peniruan khusus untuk "${acc.name}" (opsional, misal: tiru gerakan rotasi 1:1, tambahkan denyut)...`}
                    className="w-full bg-slate-950 text-xs text-gray-200 border border-gray-800 rounded-lg px-2.5 py-1.5 placeholder-gray-500 focus:border-amber-400 focus:outline-none"
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* Modal Footer */}
        <div className="pt-3 border-t border-gray-800 flex flex-col sm:flex-row justify-between items-center gap-3 shrink-0">
          <div className="text-xs text-gray-400 flex items-center gap-2">
            <span>
              Total: <strong className="text-white">{accounts.length} Akun</strong>
            </span>
            <span>•</span>
            <span>
              <strong className="text-amber-300 font-mono">{totalReferenceImages}</strong> Gambar Referensi
            </span>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs font-bold transition cursor-pointer"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={handleExecuteStart}
              disabled={isAutoPilotRunning || totalReferenceImages === 0}
              className="px-5 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-400 hover:from-amber-400 hover:to-yellow-300 text-slate-950 font-black text-xs transition flex items-center gap-2 shadow-lg shadow-amber-500/25 disabled:opacity-40 cursor-pointer active:scale-95"
            >
              <i className="fa-solid fa-rocket text-sm"></i>
              <span>
                {isAutoPilotRunning
                  ? 'Auto Pilot Sedang Berjalan...'
                  : `Mulai Auto Pilot (${totalReferenceImages} Gambar)`}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
