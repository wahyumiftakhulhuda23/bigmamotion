import React, { useState, useRef, useEffect } from 'react';
import { GeminiModel, ImageToPromptItem, ImageToPromptProject } from '../types';
import { generateMotionPromptFromImage } from '../services/geminiService';

interface ImageToPromptSectionProps {
  apiKeys: string[];
  selectedModel: GeminiModel;
  onSendToPromptToMotion?: (prompts: string[]) => void;
  showToast: (msg: string, type?: 'info' | 'success' | 'warn' | 'error') => void;
  addLog?: (text: string, type?: 'info' | 'success' | 'error' | 'warn' | 'cyan' | 'green') => void;
}

const STORAGE_I2P_PROJECTS = 'bigma_i2p_projects_list';
const STORAGE_I2P_ITEMS = 'bigma_i2p_project_items';

export const ImageToPromptSection: React.FC<ImageToPromptSectionProps> = ({
  apiKeys,
  selectedModel,
  onSendToPromptToMotion,
  showToast,
  addLog,
}) => {
  // --- PROJECTS STATE ---
  const [projects, setProjects] = useState<ImageToPromptProject[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_I2P_PROJECTS);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return [
      { id: 'proj_' + Date.now(), name: 'Project 1', createdAt: Date.now() },
    ];
  });

  const [activeProjectId, setActiveProjectId] = useState<string>(() => {
    return projects[0]?.id || '';
  });

  // --- ITEMS STATE ---
  const [items, setItems] = useState<ImageToPromptItem[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_I2P_ITEMS);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return [];
  });

  const [isDragging, setIsDragging] = useState(false);
  const [isProcessingBatch, setIsProcessingBatch] = useState(false);
  const [currentProcessingId, setCurrentProcessingId] = useState<string | null>(null);
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0, currentName: '' });
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editedProjectName, setEditedProjectName] = useState<string>('');
  const [previewModalImage, setPreviewModalImage] = useState<ImageToPromptItem | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortBatchRef = useRef<boolean>(false);

  // Save projects to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_I2P_PROJECTS, JSON.stringify(projects));
    } catch (e) {}
  }, [projects]);

  // Save items to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_I2P_ITEMS, JSON.stringify(items));
    } catch (e) {}
  }, [items]);

  // Ensure valid active project
  useEffect(() => {
    if (!projects.find((p) => p.id === activeProjectId) && projects.length > 0) {
      setActiveProjectId(projects[0].id);
    }
  }, [projects, activeProjectId]);

  const activeProject = projects.find((p) => p.id === activeProjectId) || projects[0] || {
    id: 'default',
    name: 'Project 1',
    createdAt: Date.now(),
  };

  const projectItems = items.filter((it) => it.projectId === activeProject.id);
  const completedPrompts = projectItems.filter((it) => it.status === 'done' && it.generatedPrompt);
  const pendingItems = projectItems.filter((it) => it.status === 'idle' || it.status === 'error');

  // --- PROJECT MANAGEMENT HANDLERS ---
  const handleAddProject = () => {
    const nextNumber = projects.length + 1;
    const newProj: ImageToPromptProject = {
      id: 'proj_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
      name: `Project ${nextNumber}`,
      createdAt: Date.now(),
    };
    setProjects((prev) => [...prev, newProj]);
    setActiveProjectId(newProj.id);
    showToast(`Project baru "${newProj.name}" berhasil dibuat!`, 'success');
  };

  const handleStartRenameProject = (proj: ImageToPromptProject) => {
    setEditingProjectId(proj.id);
    setEditedProjectName(proj.name);
  };

  const handleSaveRenameProject = (projId: string) => {
    const trimmed = editedProjectName.trim();
    if (!trimmed) {
      showToast('Nama project tidak boleh kosong', 'warn');
      return;
    }
    setProjects((prev) =>
      prev.map((p) => (p.id === projId ? { ...p, name: trimmed } : p))
    );
    setEditingProjectId(null);
    showToast(`Nama project diperbarui menjadi "${trimmed}"`, 'success');
  };

  const handleDeleteProject = (projId: string, projName: string) => {
    if (projects.length <= 1) {
      showToast('Minimal harus ada satu project aktif', 'warn');
      return;
    }
    setProjects((prev) => prev.filter((p) => p.id !== projId));
    setItems((prev) => prev.filter((it) => it.projectId !== projId));
    showToast(`Project "${projName}" dan gambarnya berhasil dihapus`, 'info');
  };

  // --- FILE HANDLING ---
  const processImageFiles = (files: FileList | File[]) => {
    const validImageFiles = Array.from(files).filter(
      (file) =>
        file.type.startsWith('image/') ||
        /\.(jpg|jpeg|png|webp|svg|bmp|gif|avif)$/i.test(file.name)
    );

    if (validImageFiles.length === 0) {
      showToast('Pilih file gambar valid (PNG, JPG, WEBP, SVG, GIF, AVIF)', 'warn');
      return;
    }

    const newItems: ImageToPromptItem[] = [];
    let loaded = 0;

    validImageFiles.forEach((file, idx) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const base64Data = (e.target?.result as string) || '';
        const formattedSize = (file.size / 1024).toFixed(1) + ' KB';

        newItems.push({
          id: 'i2p_' + Date.now() + '_' + idx + '_' + Math.random().toString(36).substring(2, 7),
          projectId: activeProject.id,
          fileName: file.name,
          fileSize: formattedSize,
          imagePreviewUrl: base64Data,
          imageBase64: base64Data,
          mimeType: file.type || 'image/png',
          status: 'idle',
          createdAt: Date.now(),
        });

        loaded++;
        if (loaded === validImageFiles.length) {
          setItems((prev) => [...prev, ...newItems]);
          showToast(`Berhasil menambahkan ${newItems.length} gambar ke [${activeProject.name}]!`, 'success');
          if (addLog) {
            addLog(`[Image to Prompt] Menambahkan ${newItems.length} gambar ke [${activeProject.name}]`, 'cyan');
          }
        }
      };
      reader.readAsDataURL(file);
    });
  };

  // Clipboard Paste (Ctrl+V)
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      if (!e.clipboardData) return;
      const pasteItems = e.clipboardData.items;
      const images: File[] = [];
      for (let i = 0; i < pasteItems.length; i++) {
        if (pasteItems[i].type.startsWith('image/')) {
          const file = pasteItems[i].getAsFile();
          if (file) images.push(file);
        }
      }
      if (images.length > 0) {
        processImageFiles(images);
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [activeProject.id]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processImageFiles(e.dataTransfer.files);
    }
  };

  // --- SINGLE IMAGE ANALYSIS ---
  const analyzeSingleImage = async (item: ImageToPromptItem): Promise<boolean> => {
    setCurrentProcessingId(item.id);
    setItems((prev) =>
      prev.map((it) => (it.id === item.id ? { ...it, status: 'analyzing', error: undefined } : it))
    );

    if (addLog) {
      addLog(`[Image to Prompt] [${activeProject.name}] Menganalisa "${item.fileName}"...`, 'info');
    }

    try {
      const generatedPrompt = await generateMotionPromptFromImage(
        apiKeys,
        selectedModel,
        {
          imageBase64: item.imageBase64,
          mimeType: item.mimeType,
          fileName: item.fileName,
          projectName: activeProject.name,
        }
      );

      setItems((prev) =>
        prev.map((it) =>
          it.id === item.id
            ? { ...it, status: 'done', generatedPrompt, error: undefined }
            : it
        )
      );

      if (addLog) {
        addLog(`✅ [Image to Prompt] Berhasil menghasilkan prompt motion untuk "${item.fileName}"!`, 'success');
      }
      return true;
    } catch (err: any) {
      const msg = err?.message || 'Gagal menganalisa gambar';
      setItems((prev) =>
        prev.map((it) => (it.id === item.id ? { ...it, status: 'error', error: msg } : it))
      );
      if (addLog) {
        addLog(`❌ [Image to Prompt] Gagal menganalisa "${item.fileName}": ${msg}`, 'error');
      }
      return false;
    } finally {
      setCurrentProcessingId(null);
    }
  };

  // --- BATCH RUNNER ---
  const handleStartBatchAnalysis = async () => {
    if (pendingItems.length === 0) {
      showToast('Semua gambar dalam project ini sudah dianalisa!', 'info');
      return;
    }

    setIsProcessingBatch(true);
    abortBatchRef.current = false;
    const total = pendingItems.length;
    let successCount = 0;

    showToast(`🚀 Memulai analisa prompt motion untuk ${total} gambar di [${activeProject.name}]...`, 'info');

    for (let i = 0; i < pendingItems.length; i++) {
      if (abortBatchRef.current) {
        showToast('Proses batch analisa dihentikan oleh pengguna.', 'warn');
        break;
      }

      const item = pendingItems[i];
      setBatchProgress({
        current: i + 1,
        total,
        currentName: item.fileName,
      });

      const ok = await analyzeSingleImage(item);
      if (ok) successCount++;

      if (i < pendingItems.length - 1 && !abortBatchRef.current) {
        await new Promise((r) => setTimeout(r, 600));
      }
    }

    setIsProcessingBatch(false);
    setBatchProgress({ current: 0, total: 0, currentName: '' });
    showToast(`🏁 Selesai! Berhasil menghasilkan ${successCount}/${total} prompt motion.`, 'success');
  };

  const handleStopBatch = () => {
    abortBatchRef.current = true;
    setIsProcessingBatch(false);
    showToast('Menghentikan proses batch...', 'warn');
  };

  // --- EXPORT PURE NOTEPAD PROMPT (.TXT) ---
  // Guaranteed: Pure clean prompts only, exactly one prompt per line, no extra numbering/quotes/markdown!
  const handleDownloadNotepadPrompt = () => {
    const validPrompts = projectItems
      .map((it) => (it.generatedPrompt || '').trim())
      .filter((p) => p.length > 0);

    if (validPrompts.length === 0) {
      showToast('Belum ada prompt motion yang selesai dihasilkan untuk project ini!', 'warn');
      return;
    }

    // Clean, pure 1 prompt per line separated by \n
    const pureNotepadContent = validPrompts.join('\n');

    const blob = new Blob([pureNotepadContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const safeProjName = activeProject.name.replace(/[^a-z0-9_-]/gi, '_');
    a.download = `${safeProjName}_prompts.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);

    showToast(`Berhasil mengunduh notepad ${validPrompts.length} prompt murni (${safeProjName}_prompts.txt)!`, 'success');
    if (addLog) {
      addLog(`[Notepad Export] Mengunduh ${validPrompts.length} prompt murni untuk [${activeProject.name}]`, 'success');
    }
  };

  // Copy all prompts to clipboard
  const handleCopyAllPrompts = () => {
    const validPrompts = projectItems
      .map((it) => (it.generatedPrompt || '').trim())
      .filter((p) => p.length > 0);

    if (validPrompts.length === 0) {
      showToast('Belum ada prompt untuk disalin', 'warn');
      return;
    }

    navigator.clipboard.writeText(validPrompts.join('\n'));
    showToast(`${validPrompts.length} prompt berhasil disalin ke clipboard!`, 'success');
  };

  // Send prompts directly to Prompt to Motion workflow
  const handleSendToPromptToMotion = () => {
    const validPrompts = projectItems
      .map((it) => (it.generatedPrompt || '').trim())
      .filter((p) => p.length > 0);

    if (validPrompts.length === 0) {
      showToast('Belum ada prompt motion yang siap dikirim!', 'warn');
      return;
    }

    if (onSendToPromptToMotion) {
      onSendToPromptToMotion(validPrompts);
      showToast(`${validPrompts.length} prompt berhasil dikirim ke Prompt to Motion!`, 'success');
    }
  };

  const handleDeleteItem = (id: string) => {
    setItems((prev) => prev.filter((it) => it.id !== id));
  };

  const handleClearProjectItems = () => {
    setItems((prev) => prev.filter((it) => it.projectId !== activeProject.id));
    showToast(`Semua gambar di [${activeProject.name}] telah dibersihkan.`, 'info');
  };

  const handleUpdatePromptText = (id: string, text: string) => {
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, generatedPrompt: text } : it))
    );
  };

  return (
    <section className="flex flex-col gap-4 w-full">
      {/* 1. HEADER HERO CARD */}
      <div className="glass-card rounded-2xl p-4 sm:p-5 border-2 border-indigo-500/40 bg-gradient-to-br from-indigo-950/30 via-slate-900/90 to-purple-950/30 shadow-2xl relative overflow-hidden space-y-3.5">
        <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20"></div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 relative z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-500 to-purple-600 text-white flex items-center justify-center text-lg font-black shadow-lg shadow-indigo-500/30 shrink-0">
              <i className="fa-solid fa-file-waveform"></i>
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="font-extrabold text-sm sm:text-base text-gray-100 tracking-tight">
                  IMAGE TO PROMPT MOTION
                </h2>
                <span className="text-[9px] bg-gradient-to-r from-indigo-500 to-purple-500 text-white font-black px-2 py-0.5 rounded-full uppercase tracking-wider shadow-sm">
                  Vision Prompt Engineer
                </span>
              </div>
              <p className="text-[11px] text-gray-300 mt-0.5 leading-snug">
                Input gambar dari PC atau Drag & Drop, pisahkan per project, dan unduh notepad prompt murni (1 baris per prompt).
              </p>
            </div>
          </div>

          {/* Quick Action: New Project Button */}
          <button
            type="button"
            onClick={handleAddProject}
            className="px-3.5 py-2 bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 transition shadow-md shadow-sky-500/20 cursor-pointer active:scale-95 shrink-0 self-start sm:self-center"
            title="Tambah Project Baru"
          >
            <i className="fa-solid fa-folder-plus text-xs"></i>
            <span>Tambah Project</span>
          </button>
        </div>

        {/* 2. PROJECT TABS & SWITCHER */}
        <div className="pt-2 border-t border-gray-800/80">
          <div className="flex items-center justify-between gap-2 flex-wrap pb-2">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
              <i className="fa-solid fa-folder-tree text-indigo-400"></i>
              <span>Pilih Project Aktif:</span>
            </span>
            <span className="text-[10px] text-indigo-300 font-mono">
              Total {projects.length} Project
            </span>
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
            {projects.map((proj) => {
              const count = items.filter((it) => it.projectId === proj.id).length;
              const isActive = proj.id === activeProject.id;
              const isEditing = editingProjectId === proj.id;

              return (
                <div
                  key={proj.id}
                  className={`px-3 py-1.5 rounded-xl border flex items-center gap-2 transition shrink-0 cursor-pointer ${
                    isActive
                      ? 'bg-indigo-600/30 border-indigo-400 text-white shadow-md shadow-indigo-500/15'
                      : 'bg-slate-900/80 border-gray-800 text-gray-400 hover:border-gray-700 hover:text-gray-200'
                  }`}
                  onClick={() => !isEditing && setActiveProjectId(proj.id)}
                >
                  <i className={`fa-solid fa-folder${isActive ? '-open text-indigo-400' : ' text-gray-500'} text-xs`}></i>

                  {isEditing ? (
                    <input
                      type="text"
                      value={editedProjectName}
                      autoFocus
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => setEditedProjectName(e.target.value)}
                      onBlur={() => handleSaveRenameProject(proj.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveRenameProject(proj.id);
                        if (e.key === 'Escape') setEditingProjectId(null);
                      }}
                      className="bg-slate-950 border border-indigo-400 rounded px-1.5 py-0.5 text-xs text-white font-bold focus:outline-none max-w-[120px]"
                    />
                  ) : (
                    <span className="text-xs font-bold whitespace-nowrap">{proj.name}</span>
                  )}

                  <span className="text-[10px] bg-slate-950/80 px-1.5 py-0.2 rounded-full font-mono text-indigo-300 font-bold">
                    {count}
                  </span>

                  {isActive && !isEditing && (
                    <div className="flex items-center gap-1 ml-1" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => handleStartRenameProject(proj)}
                        className="text-gray-400 hover:text-indigo-300 p-0.5 transition cursor-pointer"
                        title="Ubah nama project"
                      >
                        <i className="fa-solid fa-pen text-[10px]"></i>
                      </button>
                      {projects.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleDeleteProject(proj.id, proj.name)}
                          className="text-gray-400 hover:text-rose-400 p-0.5 transition cursor-pointer"
                          title="Hapus project ini"
                        >
                          <i className="fa-solid fa-trash text-[10px]"></i>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 3. MULTI-IMAGE UPLOAD ZONE */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`glass-card rounded-2xl p-5 sm:p-6 border-2 border-dashed transition-all cursor-pointer text-center relative overflow-hidden group ${
          isDragging
            ? 'border-indigo-400 bg-indigo-500/15 scale-[1.01]'
            : 'border-gray-800 hover:border-indigo-500/60 bg-slate-950/60'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,.png,.jpg,.jpeg,.webp,.svg,.bmp,.gif,.avif"
          className="hidden"
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) {
              processImageFiles(e.target.files);
              e.target.value = '';
            }
          }}
        />

        <div className="space-y-2.5">
          <div className="w-12 h-12 rounded-2xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/40 flex items-center justify-center mx-auto text-xl group-hover:scale-110 transition-transform">
            <i className="fa-solid fa-cloud-arrow-up"></i>
          </div>
          <div>
            <h3 className="font-extrabold text-sm text-gray-100">
              Drag & Drop Gambar ke <span className="text-indigo-400">[{activeProject.name}]</span>
            </h3>
            <p className="text-xs text-gray-400 mt-1">
              atau klik untuk memilih file dari komputer (PNG, JPG, WEBP, SVG, GIF, AVIF). Bisa paste Ctrl+V langsung!
            </p>
          </div>
          <div className="flex items-center justify-center gap-2 pt-1">
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-900 border border-gray-800 text-gray-400">
              Mendukung Banyak Gambar Sekaligus
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-900 border border-gray-800 text-indigo-300 font-bold">
              Terpisah per Project
            </span>
          </div>
        </div>
      </div>

      {/* 4. PROJECT QUEUE & NOTEPAD COMMAND BAR */}
      <div className="glass-card rounded-2xl p-4 sm:p-5 border border-gray-800/90 space-y-3.5 shadow-xl">
        {/* Header & Controls */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-gray-800">
          <div className="flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-xl bg-indigo-500/20 border border-indigo-500/40 text-indigo-400 flex items-center justify-center text-xs shrink-0">
              <i className="fa-solid fa-list-check"></i>
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-extrabold text-xs sm:text-sm text-gray-100 uppercase">
                  Daftar Gambar [{activeProject.name}]
                </h3>
                <span className="text-[11px] font-mono bg-slate-900 text-indigo-300 border border-indigo-500/30 px-2 py-0.5 rounded-lg font-bold">
                  {projectItems.length} Gambar
                </span>
              </div>
              <p className="text-[10px] text-gray-400">
                {completedPrompts.length} prompt selesai dihasilkan
              </p>
            </div>
          </div>

          {/* Action Toolbar - Simple, Neat & Single Row */}
          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap self-start sm:self-center">
            {completedPrompts.length > 0 && (
              <div className="flex items-center gap-1.5 bg-slate-950/70 p-1 rounded-xl border border-gray-800">
                {/* Download Pure Notepad Prompt Button */}
                <button
                  type="button"
                  onClick={handleDownloadNotepadPrompt}
                  className="h-8 px-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-lg flex items-center gap-1.5 transition shadow-sm cursor-pointer active:scale-95 whitespace-nowrap"
                  title="Unduh file notepad (.txt) murni berisi kumpulan prompt (1 baris per prompt)"
                >
                  <i className="fa-solid fa-file-arrow-down text-xs"></i>
                  <span>Unduh (.txt)</span>
                </button>

                {/* Send To Prompt to Motion */}
                {onSendToPromptToMotion && (
                  <button
                    type="button"
                    onClick={handleSendToPromptToMotion}
                    className="h-8 px-2.5 bg-sky-600/25 hover:bg-sky-600/40 text-sky-300 border border-sky-500/40 font-bold text-xs rounded-lg flex items-center gap-1.5 transition cursor-pointer active:scale-95 whitespace-nowrap"
                    title="Kirim semua prompt ke generator Prompt to Motion"
                  >
                    <i className="fa-solid fa-wand-magic-sparkles text-xs"></i>
                    <span>Ke Generator</span>
                  </button>
                )}

                {/* Copy All Prompts */}
                <button
                  type="button"
                  onClick={handleCopyAllPrompts}
                  className="w-8 h-8 flex items-center justify-center text-gray-300 hover:text-white rounded-lg bg-slate-900 hover:bg-slate-800 border border-gray-800 transition cursor-pointer active:scale-95"
                  title="Salin seluruh prompt ke clipboard"
                >
                  <i className="fa-solid fa-copy text-xs"></i>
                </button>
              </div>
            )}

            {/* Clear All in Project */}
            {projectItems.length > 0 && (
              <button
                type="button"
                onClick={handleClearProjectItems}
                className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-rose-400 rounded-xl bg-slate-950/70 hover:bg-rose-500/15 border border-gray-800 hover:border-rose-500/40 transition cursor-pointer active:scale-95 shrink-0"
                title="Hapus semua gambar dari project ini"
              >
                <i className="fa-solid fa-trash-can text-xs"></i>
              </button>
            )}
          </div>
        </div>

        {/* Batch Run Command Bar */}
        <div className="bg-slate-950/85 rounded-xl p-3 border border-indigo-500/25 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-md">
          <div className="flex items-center gap-2 text-xs text-gray-300">
            <span className="w-2.5 h-2.5 rounded-full bg-indigo-400 animate-pulse"></span>
            <span className="font-bold">Status Antrian:</span>
            <span className="text-amber-300 font-bold font-mono">{pendingItems.length} Menunggu Analisa</span>
          </div>

          <div className="flex items-center gap-2">
            {!isProcessingBatch ? (
              <button
                type="button"
                onClick={handleStartBatchAnalysis}
                disabled={pendingItems.length === 0}
                className="px-4 py-2 bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 hover:from-indigo-500 hover:to-purple-500 text-white font-black text-xs rounded-xl flex items-center gap-2 transition shadow-lg shadow-indigo-600/25 disabled:opacity-40 cursor-pointer active:scale-95"
                title="Jalankan analisa gambar untuk seluruh antrian di project ini"
              >
                <i className="fa-solid fa-bolt text-xs"></i>
                <span>Jalankan Analisa Semua ({pendingItems.length})</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleStopBatch}
                className="px-3.5 py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 transition cursor-pointer shadow whitespace-nowrap"
              >
                <i className="fa-solid fa-stop text-xs"></i>
                <span>Hentikan Analisa</span>
              </button>
            )}
          </div>
        </div>

        {/* Live Batch Progress Indicator */}
        {isProcessingBatch && (
          <div className="bg-indigo-950/40 border border-indigo-500/40 rounded-xl p-3 space-y-2 animate-fadeIn">
            <div className="flex items-center justify-between text-xs font-bold text-indigo-200">
              <span className="flex items-center gap-2">
                <i className="fa-solid fa-spinner fa-spin text-indigo-400"></i>
                <span>Menganalisa [{batchProgress.current}/{batchProgress.total}]: "{batchProgress.currentName}"</span>
              </span>
              <span className="font-mono text-amber-300">
                {Math.round((batchProgress.current / batchProgress.total) * 100)}%
              </span>
            </div>
            <div className="w-full bg-slate-950 rounded-full h-2 overflow-hidden border border-indigo-500/30">
              <div
                className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-300"
                style={{ width: `${(batchProgress.current / batchProgress.total) * 100}%` }}
              ></div>
            </div>
          </div>
        )}

        {/* 5. IMAGE CARDS LIST */}
        {projectItems.length === 0 ? (
          <div className="p-8 text-center border border-dashed border-gray-800 rounded-xl space-y-2">
            <div className="w-10 h-10 rounded-xl bg-slate-900 border border-gray-800 text-gray-500 flex items-center justify-center mx-auto text-base">
              <i className="fa-solid fa-images"></i>
            </div>
            <p className="text-xs font-bold text-gray-300">
              Belum ada gambar di "{activeProject.name}"
            </p>
            <p className="text-[11px] text-gray-500">
              Drag & drop atau pilih file gambar dari komputer di atas untuk mulai membuat prompt animasi.
            </p>
          </div>
        ) : (
          <div className="space-y-3 max-h-[580px] overflow-y-auto pr-1">
            {projectItems.map((item, idx) => {
              const isProcessing = currentProcessingId === item.id;
              const isDone = item.status === 'done';
              const isError = item.status === 'error';

              return (
                <div
                  key={item.id}
                  className={`p-3 rounded-xl border flex flex-col gap-2.5 transition ${
                    isProcessing
                      ? 'bg-indigo-950/30 border-indigo-500/60 shadow-lg shadow-indigo-500/15'
                      : isDone
                      ? 'bg-slate-900/60 border-emerald-500/30'
                      : isError
                      ? 'bg-rose-950/20 border-rose-500/50'
                      : 'bg-slate-900/40 border-gray-800/80 hover:border-gray-700'
                  }`}
                >
                  {/* Top Row: Thumbnail, Info & Action Buttons */}
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      {/* Image Thumbnail with zoom on click */}
                      <div
                        onClick={() => setPreviewModalImage(item)}
                        className="w-12 h-12 rounded-lg overflow-hidden border border-gray-700 bg-slate-950 shrink-0 cursor-pointer group relative"
                        title="Klik untuk melihat gambar penuh"
                      >
                        <img
                          src={item.imagePreviewUrl}
                          alt={item.fileName}
                          className="w-full h-full object-contain group-hover:scale-110 transition-transform"
                        />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-white text-[10px]">
                          <i className="fa-solid fa-magnifying-glass"></i>
                        </div>
                      </div>

                      {/* File Info */}
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="text-[10px] font-mono font-bold text-gray-500 shrink-0">#{idx + 1}</span>
                          <span className="text-xs font-bold text-gray-200 truncate" title={item.fileName}>
                            {item.fileName}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-[10px]">
                          <span className="text-gray-400 font-mono">{item.fileSize}</span>

                          {item.status === 'idle' && (
                            <span className="px-1.5 py-0.2 rounded bg-slate-800 text-gray-400 font-medium">
                              Menunggu
                            </span>
                          )}
                          {item.status === 'analyzing' && (
                            <span className="px-1.5 py-0.2 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 font-bold flex items-center gap-1 animate-pulse">
                              <i className="fa-solid fa-spinner fa-spin text-[8px]"></i> Menganalisa...
                            </span>
                          )}
                          {item.status === 'done' && (
                            <span className="px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold flex items-center gap-1">
                              <i className="fa-solid fa-check text-[8px]"></i> Prompt Siap
                            </span>
                          )}
                          {item.status === 'error' && (
                            <span className="px-1.5 py-0.2 rounded bg-rose-500/20 text-rose-300 border border-rose-500/40 font-bold flex items-center gap-1" title={item.error}>
                              <i className="fa-solid fa-triangle-exclamation text-[8px]"></i> Gagal
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 shrink-0">
                      {/* Run Single Analysis */}
                      {!isProcessing && (
                        <button
                          type="button"
                          onClick={() => analyzeSingleImage(item)}
                          className="w-8 h-8 rounded-lg bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-300 border border-indigo-500/40 flex items-center justify-center transition cursor-pointer active:scale-95"
                          title={isDone ? 'Analisa ulang gambar ini' : 'Mulai analisa gambar ini'}
                        >
                          <i className={`fa-solid fa-${isDone ? 'rotate-right' : 'play'} text-xs`}></i>
                        </button>
                      )}

                      {/* Delete */}
                      <button
                        type="button"
                        onClick={() => handleDeleteItem(item.id)}
                        disabled={isProcessing}
                        className="w-8 h-8 rounded-lg text-gray-400 hover:text-rose-400 hover:bg-rose-500/10 flex items-center justify-center transition cursor-pointer disabled:opacity-30 active:scale-90"
                        title="Hapus gambar dari project"
                      >
                        <i className="fa-solid fa-xmark text-sm"></i>
                      </button>
                    </div>
                  </div>

                  {/* Bottom: Generated Prompt Display (Pure 1-line text) */}
                  {item.generatedPrompt && (
                    <div className="bg-slate-950/80 rounded-lg p-2.5 border border-indigo-500/25 space-y-1.5 animate-fadeIn">
                      <div className="flex items-center justify-between text-[10px] text-gray-400">
                        <span className="font-bold text-indigo-300 flex items-center gap-1">
                          <i className="fa-solid fa-wand-magic-sparkles text-[9px]"></i>
                          <span>Hasil Prompt Animasi (1 Baris Siap Pakai):</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(item.generatedPrompt || '');
                            showToast('Prompt disalin ke clipboard!', 'success');
                          }}
                          className="text-gray-400 hover:text-white flex items-center gap-1 transition cursor-pointer"
                          title="Salin prompt ini"
                        >
                          <i className="fa-solid fa-copy text-[9px]"></i>
                          <span>Salin</span>
                        </button>
                      </div>

                      <textarea
                        rows={2}
                        value={item.generatedPrompt}
                        onChange={(e) => handleUpdatePromptText(item.id, e.target.value)}
                        className="w-full bg-slate-900 border border-gray-800 rounded p-1.5 text-xs text-gray-200 font-mono focus:border-indigo-400 focus:outline-none leading-relaxed"
                        title="Klik untuk mengedit prompt secara langsung"
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* MODAL PREVIEW IMAGE */}
      {previewModalImage && (
        <div
          onClick={() => setPreviewModalImage(null)}
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 cursor-pointer"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="glass-card rounded-2xl p-4 max-w-lg w-full border border-gray-800 space-y-3 cursor-default"
          >
            <div className="flex items-center justify-between pb-2 border-b border-gray-800">
              <span className="text-xs font-bold text-gray-200 truncate">{previewModalImage.fileName}</span>
              <button
                onClick={() => setPreviewModalImage(null)}
                className="text-gray-400 hover:text-white text-sm cursor-pointer p-1"
              >
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>
            <div className="max-h-[60vh] flex items-center justify-center overflow-hidden rounded-xl bg-slate-950 p-2">
              <img
                src={previewModalImage.imagePreviewUrl}
                alt={previewModalImage.fileName}
                className="max-h-[55vh] max-w-full object-contain"
              />
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
