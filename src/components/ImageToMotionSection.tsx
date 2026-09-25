import React, { useState, useRef, useEffect } from 'react';
import {
  ImageToMotionItem,
  ImageToMotionProject,
  MotionDynamics,
  ColorMode,
  AnimationItem,
  GeminiModel,
} from '../types';
import { generateImageToMotion } from '../services/geminiService';
import { renderHtmlToVideo } from '../services/videoRenderer';
import JSZip from 'jszip';

interface ImageToMotionSectionProps {
  apiKeys: string[];
  selectedModel: GeminiModel;
  projects: ImageToMotionProject[];
  activeProjectId: string;
  onSelectProject: (projectId: string) => void;
  onCreateProject: (name: string) => void;
  onUpdateProject?: (projectId: string, newName: string) => void;
  onDeleteProject: (projectId: string) => void;
  items: ImageToMotionItem[];
  onAddItems: (newItems: ImageToMotionItem[]) => void;
  onUpdateItem: (itemId: string, updates: Partial<ImageToMotionItem>) => void;
  onDeleteItem: (itemId: string) => void;
  onClearCompletedItems: (projectId: string) => void;
  onPreviewAnimation: (item: AnimationItem) => void;
  onOpenFullscreen: (item: AnimationItem) => void;
  showToast: (msg: string, type?: 'info' | 'success' | 'warn' | 'error') => void;
  addLog: (text: string, type?: 'info' | 'success' | 'error' | 'warn' | 'cyan' | 'green') => void;
}

export const ImageToMotionSection: React.FC<ImageToMotionSectionProps> = ({
  apiKeys,
  selectedModel,
  projects,
  activeProjectId,
  onSelectProject,
  onCreateProject,
  onUpdateProject,
  onDeleteProject,
  items,
  onAddItems,
  onUpdateItem,
  onDeleteItem,
  onClearCompletedItems,
  onPreviewAnimation,
  onOpenFullscreen,
  showToast,
  addLog,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [showAddProjectModal, setShowAddProjectModal] = useState(false);
  const [showProjectManagerModal, setShowProjectManagerModal] = useState(false);
  const [managerNewProjectName, setManagerNewProjectName] = useState('');
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editingProjectName, setEditingProjectName] = useState('');
  const [projectToDelete, setProjectToDelete] = useState<ImageToMotionProject | null>(null);
  const [isAutoPilotRunning, setIsAutoPilotRunning] = useState(false);
  const [autoPilotPaused, setAutoPilotPaused] = useState(false);
  const [currentProcessingId, setCurrentProcessingId] = useState<string | null>(null);

  // Global settings for newly uploaded batch
  const [batchMotionDynamics, setBatchMotionDynamics] = useState<MotionDynamics>('flow');
  const [batchColorMode, setBatchColorMode] = useState<ColorMode>('gradient');
  const [batchNeonGlow, setBatchNeonGlow] = useState<boolean>(true);
  const [batchGreenScreen, setBatchGreenScreen] = useState<boolean>(false);
  const [batchCustomInstructions, setBatchCustomInstructions] = useState<string>('');

  // Comparison modal
  const [comparisonItem, setComparisonItem] = useState<ImageToMotionItem | null>(null);
  const [isBatchExportingMp4, setIsBatchExportingMp4] = useState(false);
  const [batchExportProgress, setBatchExportProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const autoPilotRef = useRef<{ isRunning: boolean; isPaused: boolean }>({ isRunning: false, isPaused: false });

  useEffect(() => {
    autoPilotRef.current = { isRunning: isAutoPilotRunning, isPaused: autoPilotPaused };
  }, [isAutoPilotRunning, autoPilotPaused]);

  // Current active project
  const activeProject = projects.find((p) => p.id === activeProjectId) || projects[0] || {
    id: 'default_project',
    name: 'Akun Microstock Utama',
    createdAt: Date.now(),
  };

  // Filter items for current active project
  const projectItems = items.filter((item) => item.projectId === activeProject.id);
  const pendingItems = projectItems.filter((item) => item.status === 'pending' || item.status === 'error');
  const completedItems = projectItems.filter((item) => item.status === 'completed');

  // Handle Clipboard Paste (Ctrl+V image)
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      if (!e.clipboardData) return;
      const clipboardItems = e.clipboardData.items;
      const imageFiles: File[] = [];

      for (let i = 0; i < clipboardItems.length; i++) {
        if (clipboardItems[i].type.startsWith('image/')) {
          const file = clipboardItems[i].getAsFile();
          if (file) imageFiles.push(file);
        }
      }

      if (imageFiles.length > 0) {
        processFiles(imageFiles);
        showToast(`${imageFiles.length} gambar dari clipboard berhasil ditambahkan!`, 'success');
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [activeProject, batchMotionDynamics, batchColorMode, batchNeonGlow, batchGreenScreen, batchCustomInstructions]);

  // Read files and convert to ImageToMotion items
  const processFiles = (files: FileList | File[]) => {
    const validImageFiles = Array.from(files).filter((file) =>
      file.type.startsWith('image/') || /\.(jpg|jpeg|png|webp|svg|bmp|gif)$/i.test(file.name)
    );

    if (validImageFiles.length === 0) {
      showToast('Mohon pilih file gambar yang valid (JPG, PNG, WEBP, SVG)', 'warn');
      return;
    }

    const newItems: ImageToMotionItem[] = [];
    let loadedCount = 0;

    validImageFiles.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const base64Data = (e.target?.result as string) || '';
        const formattedSize = (file.size / 1024).toFixed(1) + ' KB';

        newItems.push({
          id: 'i2m_item_' + Date.now() + '_' + Math.random().toString(36).substring(7),
          projectId: activeProject.id,
          projectName: activeProject.name,
          fileName: file.name,
          fileSize: formattedSize,
          imagePreviewUrl: base64Data,
          imageBase64: base64Data,
          mimeType: file.type || 'image/png',
          status: 'pending',
          progress: 0,
          motionDynamics: batchMotionDynamics,
          colorMode: batchColorMode,
          neonGlow: batchNeonGlow,
          isGreenScreen: batchGreenScreen,
          customInstructions: batchCustomInstructions,
          createdAt: Date.now(),
        });

        loadedCount++;
        if (loadedCount === validImageFiles.length) {
          onAddItems(newItems);
          showToast(`Berhasil menambahkan ${newItems.length} gambar ke antrian ${activeProject.name}!`, 'success');
          addLog(`[Image to Motion] Menambahkan ${newItems.length} gambar ke project "${activeProject.name}"`, 'cyan');
        }
      };
      reader.readAsDataURL(file);
    });
  };

  // Drag & drop handlers
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
      processFiles(e.dataTransfer.files);
    }
  };

  // Process a single item
  const processSingleItem = async (item: ImageToMotionItem): Promise<boolean> => {
    setCurrentProcessingId(item.id);
    onUpdateItem(item.id, { status: 'analyzing', progress: 25, error: undefined });
    addLog(`[Image to Motion] Menganalisa struktur gambar "${item.fileName}"...`, 'info');

    try {
      onUpdateItem(item.id, { status: 'generating', progress: 50 });

      const animResult = await generateImageToMotion(
        apiKeys,
        selectedModel,
        {
          imageBase64: item.imageBase64,
          mimeType: item.mimeType,
          fileName: item.fileName,
          projectName: activeProject.name,
          motionDynamics: item.motionDynamics,
          colorMode: item.colorMode,
          neonGlow: item.neonGlow,
          isGreenScreen: item.isGreenScreen,
          customInstructions: item.customInstructions,
        },
        (attempt, max, errMsg) => {
          addLog(`[Retry ${attempt}/${max}] "${item.fileName}": ${errMsg}`, 'warn');
        }
      );

      const animationItem: AnimationItem = {
        id: animResult.id,
        title: animResult.title,
        type: 'icon',
        style: animResult.style,
        subCategory: 'image-to-motion',
        colorMode: item.colorMode,
        motionDynamics: item.motionDynamics,
        neonGlow: item.neonGlow,
        html: animResult.html,
        account: activeProject.name,
        createdAt: Date.now(),
        isGreenScreen: item.isGreenScreen,
      };

      onUpdateItem(item.id, {
        status: 'completed',
        progress: 100,
        detectedSubject: animResult.title,
        animationResult: animationItem,
      });

      onPreviewAnimation(animationItem);
      addLog(`[Image to Motion] Berhasil membuat motion untuk "${item.fileName}"!`, 'success');
      return true;
    } catch (err: any) {
      const errorMsg = err?.message || 'Gagal memproses animasi gambar';
      onUpdateItem(item.id, { status: 'error', progress: 0, error: errorMsg });
      addLog(`[Error Image to Motion] "${item.fileName}": ${errorMsg}`, 'error');
      return false;
    } finally {
      setCurrentProcessingId(null);
    }
  };

  // Auto Pilot sequential batch runner
  const handleStartAutoPilot = async () => {
    if (pendingItems.length === 0) {
      showToast('Tidak ada antrian gambar pending di project ini.', 'warn');
      return;
    }

    setIsAutoPilotRunning(true);
    setAutoPilotPaused(false);
    showToast(`Memulai Auto Pilot Batch untuk ${pendingItems.length} gambar...`, 'info');
    addLog(`[Auto Pilot I2M] Memulai antrian batch ${pendingItems.length} gambar di "${activeProject.name}"`, 'green');

    for (let i = 0; i < pendingItems.length; i++) {
      if (!autoPilotRef.current.isRunning) break;
      while (autoPilotRef.current.isPaused) {
        await new Promise((res) => setTimeout(res, 500));
        if (!autoPilotRef.current.isRunning) break;
      }
      if (!autoPilotRef.current.isRunning) break;

      const current = pendingItems[i];
      await processSingleItem(current);
      await new Promise((res) => setTimeout(res, 1200));
    }

    setIsAutoPilotRunning(false);
    setAutoPilotPaused(false);
    showToast(`Auto Pilot Batch project "${activeProject.name}" selesai!`, 'success');
  };

  const handlePauseAutoPilot = () => {
    setAutoPilotPaused(!autoPilotPaused);
    showToast(autoPilotPaused ? 'Auto Pilot dilanjutkan' : 'Auto Pilot dijeda', 'info');
  };

  const handleStopAutoPilot = () => {
    setIsAutoPilotRunning(false);
    setAutoPilotPaused(false);
    showToast('Auto Pilot dihentikan', 'warn');
  };

  // Export all completed items as ZIP of MP4 videos
  const handleExportAllMp4Zip = async () => {
    if (completedItems.length === 0) {
      showToast('Belum ada animasi yang selesai dibuat di project ini.', 'warn');
      return;
    }

    setIsBatchExportingMp4(true);
    setBatchExportProgress({ current: 0, total: completedItems.length });
    showToast(`Memulai batch rendering MP4 untuk ${completedItems.length} animasi...`, 'info');

    try {
      const zip = new JSZip();
      const folder = zip.folder(`motion_${activeProject.name.replace(/[^a-z0-9]/gi, '_')}`) || zip;

      for (let i = 0; i < completedItems.length; i++) {
        const item = completedItems[i];
        if (!item.animationResult) continue;

        setBatchExportProgress({ current: i + 1, total: completedItems.length });
        addLog(`[Batch Export MP4] Merender [${i + 1}/${completedItems.length}] "${item.fileName}"...`, 'info');

        try {
          const result = await renderHtmlToVideo(item.animationResult.html, {
            width: 1920,
            height: 1080,
            fps: 60,
            duration: 10,
            bitrate: 18,
            format: 'mp4',
            mode: 'icon',
            isGreenScreen: item.isGreenScreen,
          });

          const baseName = item.fileName.replace(/\.[^/.]+$/, '').replace(/[^a-z0-9]/gi, '_');
          folder.file(`${i + 1}_${baseName}_1080p60.mp4`, result.blob);
        } catch (renderErr: any) {
          addLog(`[Warning] Gagal merender "${item.fileName}": ${renderErr.message}`, 'warn');
        }
      }

      showToast('Mengompresi video ke file ZIP...', 'info');
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const downloadUrl = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `Batch_MP4_${activeProject.name.replace(/[^a-z0-9]/gi, '_')}_${Date.now()}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(downloadUrl), 5000);

      showToast(`Batch export MP4 selesai! Berhasil mengunduh ZIP.`, 'success');
      addLog(`[Batch Export MP4] Selesai mengunduh ZIP untuk project "${activeProject.name}"`, 'success');
    } catch (e: any) {
      showToast(`Gagal export batch ZIP: ${e.message}`, 'error');
    } finally {
      setIsBatchExportingMp4(false);
    }
  };

  // Export all completed HTML as ZIP
  const handleExportAllHtmlZip = async () => {
    if (completedItems.length === 0) {
      showToast('Belum ada animasi yang selesai dibuat di project ini.', 'warn');
      return;
    }

    const zip = new JSZip();
    const folder = zip.folder(`html_motion_${activeProject.name.replace(/[^a-z0-9]/gi, '_')}`) || zip;

    completedItems.forEach((item, index) => {
      if (item.animationResult) {
        const baseName = item.fileName.replace(/\.[^/.]+$/, '').replace(/[^a-z0-9]/gi, '_');
        folder.file(`${index + 1}_${baseName}.html`, item.animationResult.html);
      }
    });

    const zipBlob = await zip.generateAsync({ type: 'blob' });
    const downloadUrl = URL.createObjectURL(zipBlob);
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = `Batch_HTML_${activeProject.name.replace(/[^a-z0-9]/gi, '_')}_${Date.now()}.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(downloadUrl), 5000);

    showToast(`Berhasil mengunduh ZIP berisi ${completedItems.length} file HTML!`, 'success');
  };

  const handleDownloadSingleHtml = (item: ImageToMotionItem) => {
    if (!item.animationResult) return;
    const blob = new Blob([item.animationResult.html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Motion_${item.fileName.replace(/\.[^/.]+$/, '')}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    showToast('File HTML berhasil diunduh!', 'success');
  };

  const handleExportSingleMp4 = async (item: ImageToMotionItem) => {
    if (!item.animationResult) return;
    showToast(`Merender MP4 H.264 60 FPS untuk "${item.fileName}"...`, 'info');

    try {
      const result = await renderHtmlToVideo(item.animationResult.html, {
        width: 1920,
        height: 1080,
        fps: 60,
        duration: 10,
        bitrate: 18,
        format: 'mp4',
        mode: 'icon',
        isGreenScreen: item.isGreenScreen,
      });

      const a = document.createElement('a');
      a.href = result.url;
      a.download = `Motion_${item.fileName.replace(/\.[^/.]+$/, '')}_1080p60.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(result.url), 5000);

      showToast(`Video MP4 (${result.sizeFormatted}) siap digunakan!`, 'success');
    } catch (e: any) {
      showToast(`Gagal merender MP4: ${e.message}`, 'error');
    }
  };

  return (
    <section className="lg:col-span-5 flex flex-col gap-4">
      {/* 1. SPECIAL FEATURE HIGHLIGHT HEADER CARD */}
      <div className="glass-card rounded-2xl p-4 sm:p-5 border-2 border-amber-500/40 bg-gradient-to-br from-amber-950/30 via-slate-900/90 to-indigo-950/40 shadow-2xl relative overflow-hidden space-y-3.5">
        {/* Glow ambient background decoration */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20"></div>

        {/* Top Header Title & Special Badge */}
        <div className="flex items-start justify-between gap-2.5">
          <div className="flex items-center gap-2.5">
            <span className="w-9 h-9 rounded-xl bg-gradient-to-tr from-amber-500 to-yellow-400 text-slate-950 flex items-center justify-center text-base font-black shadow-lg shadow-amber-500/30 shrink-0">
              <i className="fa-solid fa-wand-magic-sparkles"></i>
            </span>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="font-extrabold text-sm sm:text-base text-amber-200 tracking-tight">
                  IMAGE TO MOTION
                </h2>
                <span className="text-[9px] bg-gradient-to-r from-amber-500 to-yellow-400 text-slate-950 font-black px-2 py-0.5 rounded-full uppercase tracking-wider shadow-sm">
                  ⭐ AI Vision Specialist
                </span>
              </div>
              <p className="text-[11px] text-amber-200/75 mt-0.5 leading-snug">
                Deteksi semantik elemen gambar & ciptakan animasi Canvas 2D 60 FPS
              </p>
            </div>
          </div>
        </div>

        {/* Dedicated Folder & Project Management Bar */}
        <div className="bg-slate-950/85 rounded-xl p-2 sm:p-2.5 border border-amber-500/25 flex items-center gap-2 flex-wrap sm:flex-nowrap shadow-inner">
          <div className="flex items-center gap-1.5 flex-1 min-w-[140px]">
            <div className="relative w-full">
              <select
                value={activeProject.id}
                onChange={(e) => onSelectProject(e.target.value)}
                className="w-full bg-slate-900 text-amber-200 border border-amber-500/40 text-xs rounded-lg px-2.5 py-1.5 font-bold focus:ring-1 focus:ring-amber-400 focus:outline-none cursor-pointer pr-7 truncate"
              >
                {projects.map((p) => {
                  const count = items.filter((it) => it.projectId === p.id).length;
                  return (
                    <option key={p.id} value={p.id} className="bg-slate-900 text-white">
                      📂 {p.name} ({count})
                    </option>
                  );
                })}
              </select>
              <i className="fa-solid fa-chevron-down absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-amber-400 pointer-events-none"></i>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {/* Quick Add Project Button */}
            <button
              type="button"
              onClick={() => setShowAddProjectModal(true)}
              className="px-2.5 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-xs font-bold transition cursor-pointer flex items-center gap-1 shadow-sm active:scale-95"
              title="Buat Folder / Project Baru"
            >
              <i className="fa-solid fa-folder-plus text-xs"></i>
              <span>Buat</span>
            </button>

            {/* Complete Project / Folder Manager Modal Button */}
            <button
              type="button"
              onClick={() => setShowProjectManagerModal(true)}
              className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-200 border border-amber-500/30 text-xs font-bold transition cursor-pointer flex items-center gap-1.5 shadow-sm active:scale-95"
              title="Kelola Semua Folder & Project (Edit, Hapus, Rename)"
            >
              <i className="fa-solid fa-folder-tree text-amber-400"></i>
              <span>Kelola Folder</span>
            </button>

            {/* Delete Current Active Project Button */}
            <button
              type="button"
              onClick={() => setProjectToDelete(activeProject)}
              className="p-1.5 px-2 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-rose-400 border border-rose-500/30 text-xs transition cursor-pointer active:scale-95"
              title={`Hapus Project "${activeProject.name}"`}
            >
              <i className="fa-solid fa-trash text-xs"></i>
            </button>
          </div>
        </div>

        {/* 2. DRAG & DROP MULTI-FILE UPLOAD ZONE */}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-2xl p-5 text-center cursor-pointer transition-all duration-200 flex flex-col items-center justify-center gap-2 relative ${
            isDragging
              ? 'border-amber-400 bg-amber-500/15 scale-[1.01] shadow-lg shadow-amber-500/20'
              : 'border-amber-500/30 bg-slate-900/40 hover:border-amber-400/60 hover:bg-slate-900/70'
          }`}
        >
          <input
            type="file"
            ref={fileInputRef}
            onChange={(e) => e.target.files && processFiles(e.target.files)}
            multiple
            accept="image/*,.jpg,.jpeg,.png,.webp,.svg"
            className="hidden"
          />

          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-500/20 to-yellow-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center text-xl shadow-inner animate-pulse">
            <i className="fa-solid fa-cloud-arrow-up"></i>
          </div>

          <div>
            <span className="text-xs font-bold text-gray-100 block">
              Drag & Drop Gambar ke Sini atau <span className="text-amber-400 underline decoration-amber-400/50">Klik untuk Browse</span>
            </span>
            <span className="text-[11px] text-gray-400 block mt-0.5">
              Mendukung Batch Multi-Upload JPG, PNG, WEBP, SVG • Bisa juga <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-amber-300 text-[10px]">Ctrl + V</kbd> untuk Paste
            </span>
          </div>
        </div>

        {/* 3. BATCH MOTION DYNAMICS & COLOR CUSTOMIZATION BAR */}
        <div className="bg-slate-950/60 rounded-xl p-3 border border-amber-500/20 space-y-2.5">
          <div className="flex items-center justify-between text-[11px] font-bold text-amber-300">
            <span className="flex items-center gap-1.5">
              <i className="fa-solid fa-sliders text-amber-400"></i>
              <span>Pengaturan Dinamika Gerak & Visual</span>
            </span>
            <span className="text-[10px] text-gray-400">Diterapkan ke batch gambar</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {/* Motion Dynamics */}
            <div className="space-y-1">
              <label className="text-[10px] text-gray-400 font-semibold block">Motion Dynamics</label>
              <select
                value={batchMotionDynamics}
                onChange={(e) => setBatchMotionDynamics(e.target.value as MotionDynamics)}
                className="w-full bg-slate-900 text-gray-200 border border-gray-700 text-[11px] rounded-lg px-2 py-1 font-medium focus:ring-1 focus:ring-amber-400 focus:outline-none"
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
              <label className="text-[10px] text-gray-400 font-semibold block">Palet Warna</label>
              <select
                value={batchColorMode}
                onChange={(e) => setBatchColorMode(e.target.value as ColorMode)}
                className="w-full bg-slate-900 text-gray-200 border border-gray-700 text-[11px] rounded-lg px-2 py-1 font-medium focus:ring-1 focus:ring-amber-400 focus:outline-none"
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
              <label className="text-[10px] text-gray-400 font-semibold block">Neon / Glow</label>
              <button
                type="button"
                onClick={() => setBatchNeonGlow(!batchNeonGlow)}
                className={`w-full text-[11px] font-bold rounded-lg px-2 py-1 border flex items-center justify-center gap-1.5 transition cursor-pointer ${
                  batchNeonGlow
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 shadow-sm'
                    : 'bg-slate-900 text-gray-400 border-gray-700'
                }`}
              >
                <i className={`fa-solid fa-${batchNeonGlow ? 'sun text-amber-400' : 'circle-xmark'}`}></i>
                <span>{batchNeonGlow ? 'Glow ON' : 'Glow OFF'}</span>
              </button>
            </div>

            {/* Green Screen Toggle */}
            <div className="space-y-1">
              <label className="text-[10px] text-gray-400 font-semibold block">Green Screen</label>
              <button
                type="button"
                onClick={() => setBatchGreenScreen(!batchGreenScreen)}
                className={`w-full text-[11px] font-bold rounded-lg px-2 py-1 border flex items-center justify-center gap-1.5 transition cursor-pointer ${
                  batchGreenScreen
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 shadow-sm'
                    : 'bg-slate-900 text-gray-400 border-gray-700'
                }`}
              >
                <i className={`fa-solid fa-circle text-[8px] ${batchGreenScreen ? 'text-emerald-400' : 'text-gray-500'}`}></i>
                <span>{batchGreenScreen ? '#00FF00' : 'Dark Studio'}</span>
              </button>
            </div>
          </div>

          {/* Optional Custom Directive */}
          <div className="pt-1">
            <input
              type="text"
              value={batchCustomInstructions}
              onChange={(e) => setBatchCustomInstructions(e.target.value)}
              placeholder="Instruksi khusus tambahan (misal: buat logo berdenyut, tambahkan partikel orbit halus)..."
              className="w-full bg-slate-900 text-xs text-gray-200 border border-gray-800 rounded-lg px-2.5 py-1.5 placeholder-gray-500 focus:ring-1 focus:ring-amber-400 focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* 4. BATCH QUEUE & AUTO PILOT COMMAND PANEL */}
      <div className="glass-card rounded-2xl p-4 border border-gray-800/90 space-y-3 shadow-xl">
        {/* Queue Stats Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b border-gray-800">
          <div className="flex items-center gap-2">
            <i className="fa-solid fa-list-check text-sky-400 text-xs"></i>
            <span className="font-extrabold text-xs text-gray-200">
              Antrian Batch Project: <span className="text-amber-300">{activeProject.name}</span>
            </span>
            <span className="text-[10px] bg-slate-800 text-gray-300 px-2 py-0.5 rounded-full font-mono font-bold">
              {projectItems.length} item ({completedItems.length} selesai)
            </span>
          </div>

          {/* Action Button Strip */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {/* Auto Pilot Trigger */}
            {!isAutoPilotRunning ? (
              <button
                onClick={handleStartAutoPilot}
                disabled={pendingItems.length === 0}
                className="px-3 py-1.5 bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-slate-950 font-black text-xs rounded-xl flex items-center gap-1.5 transition shadow-lg shadow-amber-500/20 disabled:opacity-40 cursor-pointer active:scale-95"
              >
                <i className="fa-solid fa-play"></i>
                <span>Auto Pilot ({pendingItems.length})</span>
              </button>
            ) : (
              <div className="flex items-center gap-1.5">
                <button
                  onClick={handlePauseAutoPilot}
                  className="px-2.5 py-1.5 bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs rounded-xl flex items-center gap-1 transition cursor-pointer"
                >
                  <i className={`fa-solid fa-${autoPilotPaused ? 'play' : 'pause'}`}></i>
                  <span>{autoPilotPaused ? 'Lanjut' : 'Jeda'}</span>
                </button>
                <button
                  onClick={handleStopAutoPilot}
                  className="px-2.5 py-1.5 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-xl flex items-center gap-1 transition cursor-pointer"
                >
                  <i className="fa-solid fa-stop"></i>
                  <span>Stop</span>
                </button>
              </div>
            )}

            {/* Batch ZIP Exporters */}
            {completedItems.length > 0 && (
              <>
                <button
                  onClick={handleExportAllMp4Zip}
                  disabled={isBatchExportingMp4}
                  className="px-2.5 py-1.5 bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs rounded-xl flex items-center gap-1 transition shadow-md shadow-purple-600/20 cursor-pointer disabled:opacity-50"
                  title="Export semua animasi yang selesai ke video MP4 (ZIP)"
                >
                  {isBatchExportingMp4 ? (
                    <>
                      <i className="fa-solid fa-spinner fa-spin"></i>
                      <span>MP4 ({batchExportProgress.current}/{batchExportProgress.total})</span>
                    </>
                  ) : (
                    <>
                      <i className="fa-solid fa-film"></i>
                      <span>ZIP MP4</span>
                    </>
                  )}
                </button>

                <button
                  onClick={handleExportAllHtmlZip}
                  className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-gray-200 font-bold text-xs rounded-xl flex items-center gap-1 transition border border-gray-700 cursor-pointer"
                  title="Unduh semua file HTML (ZIP)"
                >
                  <i className="fa-solid fa-file-zipper text-sky-400"></i>
                  <span>ZIP HTML</span>
                </button>

                <button
                  onClick={() => onClearCompletedItems(activeProject.id)}
                  className="p-1.5 text-gray-400 hover:text-rose-400 rounded-lg bg-slate-900 border border-gray-800 transition cursor-pointer"
                  title="Bersihkan item yang selesai"
                >
                  <i className="fa-solid fa-trash-can text-xs"></i>
                </button>
              </>
            )}
          </div>
        </div>

        {/* Queue Items List */}
        {projectItems.length === 0 ? (
          <div className="p-8 text-center border border-dashed border-gray-800 rounded-xl space-y-2">
            <div className="w-10 h-10 rounded-xl bg-slate-900 border border-gray-800 text-gray-500 flex items-center justify-center mx-auto text-base">
              <i className="fa-solid fa-images"></i>
            </div>
            <p className="text-xs font-bold text-gray-400">Belum ada gambar dalam antrian project ini</p>
            <p className="text-[11px] text-gray-500">
              Drag & drop beberapa gambar di atas untuk memulai batch Image to Motion.
            </p>
          </div>
        ) : (
          <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
            {projectItems.map((item, idx) => {
              const isProcessing = currentProcessingId === item.id;
              const isCompleted = item.status === 'completed';
              const isError = item.status === 'error';

              return (
                <div
                  key={item.id}
                  className={`p-2.5 rounded-xl border flex items-center justify-between gap-3 transition ${
                    isProcessing
                      ? 'bg-amber-950/20 border-amber-500/50 shadow-md shadow-amber-500/10'
                      : isCompleted
                      ? 'bg-slate-900/60 border-emerald-500/30'
                      : isError
                      ? 'bg-rose-950/20 border-rose-500/40'
                      : 'bg-slate-900/40 border-gray-800/80 hover:border-gray-700'
                  }`}
                >
                  {/* Left: Thumbnail & Info */}
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    {/* Thumbnail */}
                    <div
                      onClick={() => setComparisonItem(item)}
                      className="w-11 h-11 rounded-lg overflow-hidden border border-gray-700 bg-slate-950 shrink-0 cursor-pointer group relative"
                      title="Klik untuk bandingkan dengan hasil animasi"
                    >
                      <img
                        src={item.imagePreviewUrl}
                        alt={item.fileName}
                        className="w-full h-full object-contain group-hover:scale-110 transition-transform"
                      />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-white text-[9px]">
                        <i className="fa-solid fa-magnifying-glass"></i>
                      </div>
                    </div>

                    {/* Metadata */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-mono font-bold text-gray-500">#{idx + 1}</span>
                        <h4 className="text-xs font-bold text-gray-200 truncate" title={item.fileName}>
                          {item.fileName}
                        </h4>
                      </div>

                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        <span className="text-[9px] bg-slate-800 text-gray-400 px-1.5 py-0.2 rounded font-mono">
                          {item.fileSize}
                        </span>
                        <span className="text-[9px] bg-amber-950/60 text-amber-300 border border-amber-800/40 px-1.5 py-0.2 rounded font-semibold capitalize">
                          {item.motionDynamics}
                        </span>
                        {item.isGreenScreen && (
                          <span className="text-[9px] bg-emerald-950 text-emerald-400 px-1.5 py-0.2 rounded font-semibold">
                            Green Screen
                          </span>
                        )}

                        {/* Status Badges */}
                        {item.status === 'pending' && (
                          <span className="text-[9px] bg-slate-800 text-gray-400 px-1.5 py-0.2 rounded font-bold">
                            Menunggu
                          </span>
                        )}
                        {item.status === 'analyzing' && (
                          <span className="text-[9px] bg-amber-500/20 text-amber-300 border border-amber-500/40 px-1.5 py-0.2 rounded font-bold flex items-center gap-1 animate-pulse">
                            <i className="fa-solid fa-brain fa-spin text-[8px]"></i> Analisa AI...
                          </span>
                        )}
                        {item.status === 'generating' && (
                          <span className="text-[9px] bg-sky-500/20 text-sky-300 border border-sky-500/40 px-1.5 py-0.2 rounded font-bold flex items-center gap-1 animate-pulse">
                            <i className="fa-solid fa-spinner fa-spin text-[8px]"></i> Membuat Motion...
                          </span>
                        )}
                        {item.status === 'completed' && (
                          <span className="text-[9px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-1.5 py-0.2 rounded font-bold flex items-center gap-1">
                            <i className="fa-solid fa-check text-[8px]"></i> 60 FPS HD
                          </span>
                        )}
                        {item.status === 'error' && (
                          <span
                            className="text-[9px] bg-rose-500/20 text-rose-300 border border-rose-500/40 px-1.5 py-0.2 rounded font-bold truncate max-w-[120px]"
                            title={item.error}
                          >
                            Gagal: {item.error}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right: Actions */}
                  <div className="flex items-center gap-1 shrink-0">
                    {/* Trigger Single Process */}
                    {!isCompleted && !isProcessing && (
                      <button
                        onClick={() => processSingleItem(item)}
                        className="px-2.5 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-[11px] rounded-lg transition flex items-center gap-1 cursor-pointer active:scale-95 shadow-sm"
                        title="Proses gambar ini sekarang"
                      >
                        <i className="fa-solid fa-play text-[9px]"></i>
                        <span>Proses</span>
                      </button>
                    )}

                    {/* Preview / Comparison */}
                    {isCompleted && item.animationResult && (
                      <>
                        <button
                          onClick={() => onPreviewAnimation(item.animationResult!)}
                          className="px-2 py-1 bg-sky-600/30 hover:bg-sky-600/50 text-sky-300 border border-sky-500/30 font-semibold text-[11px] rounded-lg transition cursor-pointer"
                          title="Preview Animasi di Layar Utama"
                        >
                          <i className="fa-solid fa-play text-[9px]"></i>
                        </button>
                        <button
                          onClick={() => setComparisonItem(item)}
                          className="px-2 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 font-semibold text-[11px] rounded-lg transition cursor-pointer"
                          title="Bandingkan Gambar Asli vs Animasi"
                        >
                          <i className="fa-solid fa-code-compare text-[9px]"></i>
                        </button>
                        <button
                          onClick={() => handleDownloadSingleHtml(item)}
                          className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-gray-300 font-semibold text-[11px] rounded-lg transition cursor-pointer"
                          title="Unduh HTML"
                        >
                          <i className="fa-solid fa-code text-[9px]"></i>
                        </button>
                        <button
                          onClick={() => handleExportSingleMp4(item)}
                          className="px-2 py-1 bg-purple-600 hover:bg-purple-500 text-white font-bold text-[11px] rounded-lg transition cursor-pointer shadow-sm"
                          title="Export MP4 (1080p 60 FPS)"
                        >
                          <i className="fa-solid fa-film text-[9px]"></i>
                        </button>
                      </>
                    )}

                    {/* Delete Item */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onDeleteItem(item.id);
                      }}
                      disabled={isProcessing}
                      className="p-1.5 text-gray-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition cursor-pointer disabled:opacity-30 active:scale-90"
                      title="Hapus gambar ini dari antrian"
                    >
                      <i className="fa-solid fa-xmark text-xs"></i>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* MODAL: ADD NEW PROJECT / ACCOUNT */}
      {showAddProjectModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-card rounded-2xl p-5 border border-amber-500/40 bg-slate-900 max-w-sm w-full space-y-4 shadow-2xl">
            <div className="flex justify-between items-center pb-2 border-b border-gray-800">
              <h3 className="font-extrabold text-sm text-amber-200 flex items-center gap-2">
                <i className="fa-solid fa-folder-plus text-amber-400"></i>
                <span>Buat Folder / Project Baru</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowAddProjectModal(false)}
                className="text-gray-400 hover:text-white"
              >
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs text-gray-300 font-bold block">Nama Folder / Project</label>
              <input
                type="text"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newProjectName.trim()) {
                    onCreateProject(newProjectName.trim());
                    setNewProjectName('');
                    setShowAddProjectModal(false);
                  }
                }}
                placeholder="Contoh: AdobeStock Cyber, Freepik Icons..."
                className="w-full bg-slate-950 text-sm text-gray-100 border border-gray-700 rounded-xl px-3 py-2 focus:ring-2 focus:ring-amber-400 focus:outline-none"
                autoFocus
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowAddProjectModal(false)}
                className="px-3 py-1.5 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-semibold cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => {
                  if (newProjectName.trim()) {
                    onCreateProject(newProjectName.trim());
                    setNewProjectName('');
                    setShowAddProjectModal(false);
                  }
                }}
                disabled={!newProjectName.trim()}
                className="px-4 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold cursor-pointer disabled:opacity-50"
              >
                Simpan & Buat
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: COMPREHENSIVE PROJECT / FOLDER MANAGER (EDIT, SIMPAN, HAPUS, BUAT BARU) */}
      {showProjectManagerModal && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-fadeIn">
          <div className="glass-card rounded-2xl p-5 sm:p-6 border border-amber-500/40 bg-slate-950 max-w-2xl w-full space-y-4 shadow-2xl flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="flex justify-between items-center pb-3 border-b border-gray-800 shrink-0">
              <div className="flex items-center gap-2.5">
                <span className="w-8 h-8 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 text-sm">
                  <i className="fa-solid fa-folder-tree"></i>
                </span>
                <div>
                  <h3 className="font-extrabold text-sm sm:text-base text-amber-200">
                    Manajemen Folder & Project Microstock
                  </h3>
                  <p className="text-[11px] text-gray-400">
                    Kelola nama project, buat folder baru, edit, simpan, atau hapus project beserta antriannya.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowProjectManagerModal(false);
                  setEditingProjectId(null);
                }}
                className="text-gray-400 hover:text-white p-1 text-base cursor-pointer"
              >
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>

            {/* Quick Create Box */}
            <div className="bg-slate-900/90 rounded-xl p-3 border border-amber-500/20 flex flex-col sm:flex-row items-center gap-2 shrink-0">
              <div className="flex items-center gap-2 flex-1 w-full">
                <i className="fa-solid fa-folder-plus text-amber-400 text-sm"></i>
                <input
                  type="text"
                  value={managerNewProjectName}
                  onChange={(e) => setManagerNewProjectName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && managerNewProjectName.trim()) {
                      onCreateProject(managerNewProjectName.trim());
                      setManagerNewProjectName('');
                    }
                  }}
                  placeholder="Ketik nama folder/project baru..."
                  className="w-full bg-slate-950 text-xs text-gray-100 border border-gray-700 rounded-lg px-3 py-2 focus:ring-1 focus:ring-amber-400 focus:outline-none"
                />
              </div>
              <button
                type="button"
                onClick={() => {
                  if (managerNewProjectName.trim()) {
                    onCreateProject(managerNewProjectName.trim());
                    setManagerNewProjectName('');
                  }
                }}
                disabled={!managerNewProjectName.trim()}
                className="w-full sm:w-auto px-4 py-2 bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-slate-950 font-extrabold text-xs rounded-lg transition shadow-md shadow-amber-500/20 disabled:opacity-40 cursor-pointer shrink-0"
              >
                + Buat Project
              </button>
            </div>

            {/* Project List */}
            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wider pb-1 flex justify-between items-center">
                <span>Daftar Project ({projects.length})</span>
                <span>Status & Aksi</span>
              </div>

              {projects.map((proj) => {
                const isCurrentActive = proj.id === activeProject.id;
                const projItems = items.filter((it) => it.projectId === proj.id);
                const projCompleted = projItems.filter((it) => it.status === 'completed').length;
                const isEditing = editingProjectId === proj.id;

                return (
                  <div
                    key={proj.id}
                    className={`p-3 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition ${
                      isCurrentActive
                        ? 'bg-amber-950/20 border-amber-500/40 shadow-sm'
                        : 'bg-slate-900/50 border-gray-800 hover:border-gray-700'
                    }`}
                  >
                    {/* Left: Project Info or Inline Edit Input */}
                    <div className="flex items-center gap-2.5 flex-1 min-w-0">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs shrink-0 ${
                        isCurrentActive
                          ? 'bg-amber-500 text-slate-950 font-bold'
                          : 'bg-slate-800 text-amber-300'
                      }`}>
                        <i className="fa-solid fa-folder"></i>
                      </div>

                      {isEditing ? (
                        <div className="flex items-center gap-2 flex-1">
                          <input
                            type="text"
                            value={editingProjectName}
                            onChange={(e) => setEditingProjectName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && editingProjectName.trim()) {
                                if (onUpdateProject) {
                                  onUpdateProject(proj.id, editingProjectName.trim());
                                }
                                setEditingProjectId(null);
                              } else if (e.key === 'Escape') {
                                setEditingProjectId(null);
                              }
                            }}
                            className="w-full bg-slate-950 text-xs text-white border border-amber-400 rounded-lg px-2.5 py-1.5 focus:outline-none"
                            autoFocus
                          />
                          <button
                            type="button"
                            onClick={() => {
                              if (editingProjectName.trim() && onUpdateProject) {
                                onUpdateProject(proj.id, editingProjectName.trim());
                              }
                              setEditingProjectId(null);
                            }}
                            className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-lg transition cursor-pointer shrink-0"
                            title="Simpan Perubahan"
                          >
                            <i className="fa-solid fa-check"></i>
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingProjectId(null)}
                            className="px-2.5 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 font-bold text-xs rounded-lg transition cursor-pointer shrink-0"
                            title="Batal"
                          >
                            <i className="fa-solid fa-xmark"></i>
                          </button>
                        </div>
                      ) : (
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="text-xs sm:text-sm font-bold text-gray-100 truncate">
                              {proj.name}
                            </h4>
                            {isCurrentActive && (
                              <span className="text-[9px] bg-amber-500 text-slate-950 px-1.5 py-0.2 rounded font-black uppercase tracking-wider">
                                Sedang Aktif
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-gray-400 flex items-center gap-2 mt-0.5">
                            <span>{projItems.length} Gambar total</span>
                            <span>•</span>
                            <span className="text-emerald-400">{projCompleted} selesai</span>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Right: Actions */}
                    {!isEditing && (
                      <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
                        {/* Select / Activate button */}
                        {!isCurrentActive && (
                          <button
                            type="button"
                            onClick={() => {
                              onSelectProject(proj.id);
                              setShowProjectManagerModal(false);
                            }}
                            className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-amber-200 border border-amber-500/30 font-bold text-xs rounded-lg transition cursor-pointer flex items-center gap-1"
                            title="Buka dan jadikan project aktif"
                          >
                            <i className="fa-solid fa-folder-open text-xs"></i>
                            <span>Pilih</span>
                          </button>
                        )}

                        {/* Edit / Rename button */}
                        <button
                          type="button"
                          onClick={() => {
                            setEditingProjectId(proj.id);
                            setEditingProjectName(proj.name);
                          }}
                          className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-gray-300 hover:text-white font-bold text-xs rounded-lg transition cursor-pointer flex items-center gap-1 border border-gray-700"
                          title="Ganti nama project"
                        >
                          <i className="fa-solid fa-pen-to-square text-xs text-sky-400"></i>
                          <span>Edit</span>
                        </button>

                        {/* Delete project button */}
                        <button
                          type="button"
                          onClick={() => setProjectToDelete(proj)}
                          className="px-2.5 py-1.5 bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 border border-rose-500/40 font-bold text-xs rounded-lg transition cursor-pointer flex items-center gap-1 active:scale-95"
                          title="Hapus project ini"
                        >
                          <i className="fa-solid fa-trash text-xs"></i>
                          <span>Hapus</span>
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Modal Footer */}
            <div className="pt-2 border-t border-gray-800 flex justify-end shrink-0">
              <button
                type="button"
                onClick={() => {
                  setShowProjectManagerModal(false);
                  setEditingProjectId(null);
                }}
                className="px-4 py-2 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs font-bold transition cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: DELETE CONFIRMATION DIALOG */}
      {projectToDelete && (
        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 animate-fadeIn">
          <div className="glass-card rounded-2xl p-5 border border-rose-500/50 bg-slate-950 max-w-md w-full space-y-4 shadow-2xl text-center">
            <div className="w-12 h-12 rounded-2xl bg-rose-500/20 border border-rose-500/40 text-rose-400 flex items-center justify-center mx-auto text-xl animate-bounce">
              <i className="fa-solid fa-triangle-exclamation"></i>
            </div>

            <div className="space-y-1.5">
              <h3 className="font-extrabold text-base text-gray-100">
                Hapus Folder / Project?
              </h3>
              <p className="text-xs text-gray-300 leading-relaxed">
                Apakah Anda yakin ingin menghapus project{' '}
                <strong className="text-rose-300">"{projectToDelete.name}"</strong>?
              </p>
              <p className="text-[11px] text-gray-500">
                Semua gambar ({items.filter((it) => it.projectId === projectToDelete.id).length} item) dalam antrian project ini juga akan dihapus. Tindakan ini tidak dapat dibatalkan.
              </p>
            </div>

            <div className="flex justify-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setProjectToDelete(null)}
                className="px-4 py-2 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-bold transition cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => {
                  onDeleteProject(projectToDelete.id);
                  setProjectToDelete(null);
                }}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition cursor-pointer shadow-lg shadow-rose-600/30 active:scale-95"
              >
                <i className="fa-solid fa-trash mr-1.5"></i>
                Ya, Hapus Project
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: SIDE-BY-SIDE COMPARISON (ORIGINAL IMAGE VS GENERATED MOTION) */}
      {comparisonItem && (
        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4">
          <div className="glass-card rounded-2xl p-5 border border-amber-500/40 bg-slate-950 max-w-4xl w-full space-y-4 shadow-2xl flex flex-col max-h-[90vh]">
            <div className="flex justify-between items-center pb-3 border-b border-gray-800 shrink-0">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse"></span>
                <h3 className="font-extrabold text-sm sm:text-base text-gray-100 truncate">
                  Komparasi Visual: {comparisonItem.fileName}
                </h3>
              </div>
              <button
                onClick={() => setComparisonItem(null)}
                className="text-gray-400 hover:text-white p-1"
              >
                <i className="fa-solid fa-xmark text-base"></i>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 flex-1 overflow-y-auto">
              {/* Left: Original Image */}
              <div className="space-y-2 flex flex-col">
                <span className="text-xs font-extrabold text-amber-300 flex items-center gap-1.5">
                  <i className="fa-solid fa-image"></i>
                  <span>1. Gambar Asli (Input Upload)</span>
                </span>
                <div className="aspect-16-9 bg-slate-900 rounded-xl overflow-hidden border border-gray-800 flex items-center justify-center p-2">
                  <img
                    src={comparisonItem.imagePreviewUrl}
                    alt="Original"
                    className="max-w-full max-h-full object-contain"
                  />
                </div>
              </div>

              {/* Right: Live Motion Canvas */}
              <div className="space-y-2 flex flex-col">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-extrabold text-sky-400 flex items-center gap-1.5">
                    <i className="fa-solid fa-play"></i>
                    <span>2. Hasil Animasi AI (Canvas 2D 60 FPS)</span>
                  </span>
                  {comparisonItem.animationResult && (
                    <button
                      onClick={() => onOpenFullscreen(comparisonItem.animationResult!)}
                      className="text-[10px] text-sky-300 hover:underline flex items-center gap-1"
                    >
                      <i className="fa-solid fa-expand"></i> Fullscreen
                    </button>
                  )}
                </div>
                <div className="aspect-16-9 bg-slate-900 rounded-xl overflow-hidden border border-sky-500/40 relative">
                  {comparisonItem.animationResult ? (
                    <iframe
                      srcDoc={comparisonItem.animationResult.html}
                      title="Animation Preview"
                      className="w-full h-full border-0 pointer-events-none"
                      sandbox="allow-scripts"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-500 text-xs">
                      Animasi belum digenerate
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Bottom Actions */}
            <div className="flex justify-between items-center pt-3 border-t border-gray-800 shrink-0">
              <span className="text-[11px] text-gray-400">
                Mode: <strong className="text-amber-300 capitalize">{comparisonItem.motionDynamics}</strong> • Mode Warna: <strong className="text-amber-300 capitalize">{comparisonItem.colorMode}</strong>
              </span>

              <div className="flex items-center gap-2">
                {comparisonItem.animationResult ? (
                  <>
                    <button
                      onClick={() => handleDownloadSingleHtml(comparisonItem)}
                      className="px-3 py-1.5 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
                    >
                      <i className="fa-solid fa-code text-sky-400"></i> Unduh HTML
                    </button>
                    <button
                      onClick={() => handleExportSingleMp4(comparisonItem)}
                      className="px-3.5 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-md shadow-purple-600/30"
                    >
                      <i className="fa-solid fa-film"></i> Export MP4
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => {
                      processSingleItem(comparisonItem);
                      setComparisonItem(null);
                    }}
                    className="px-4 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold cursor-pointer"
                  >
                    Proses Sekarang
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
