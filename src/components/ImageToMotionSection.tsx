import React, { useState, useRef, useEffect } from 'react';
import {
  ImageToMotionItem,
  MotionDynamics,
  ColorMode,
  AnimationItem,
  GeminiModel,
} from '../types';
import { generateImageToMotion } from '../services/geminiService';
import { renderHtmlToVideo } from '../services/videoRenderer';
import JSZip from 'jszip';

export interface AutoPilotProgressState {
  totalItemsOverall: number;
  completedItemsOverall: number;
  currentItemIndex: number; // 1-based
  currentFileName: string;
  currentStageText: string;
  progressPercent: number;
}

interface ImageToMotionSectionProps {
  apiKeys: string[];
  selectedModel: GeminiModel;
  items: ImageToMotionItem[];
  onAddItems: (newItems: ImageToMotionItem[]) => void;
  onUpdateItem: (itemId: string, updates: Partial<ImageToMotionItem>) => void;
  onDeleteItem: (itemId: string) => void;
  onClearAllItems?: () => void;
  onClearCompletedItems?: () => void;
  onAddAnimation: (item: AnimationItem) => void;
  onPreviewAnimation: (item: AnimationItem) => void;
  onOpenFullscreen: (item: AnimationItem) => void;
  showToast: (msg: string, type?: 'info' | 'success' | 'warn' | 'error') => void;
  addLog: (text: string, type?: 'info' | 'success' | 'error' | 'warn' | 'cyan' | 'green') => void;
}

export const ImageToMotionSection: React.FC<ImageToMotionSectionProps> = ({
  apiKeys,
  selectedModel,
  items,
  onAddItems,
  onUpdateItem,
  onDeleteItem,
  onClearAllItems,
  onClearCompletedItems,
  onAddAnimation,
  onPreviewAnimation,
  onOpenFullscreen,
  showToast,
  addLog,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isAutoPilotRunning, setIsAutoPilotRunning] = useState(false);
  const [autoPilotPaused, setAutoPilotPaused] = useState(false);
  const [autoPilotStatus, setAutoPilotStatus] = useState<AutoPilotProgressState | null>(null);
  const [currentProcessingId, setCurrentProcessingId] = useState<string | null>(null);

  // Global settings for newly uploaded batch
  const [batchMotionDynamics, setBatchMotionDynamics] = useState<MotionDynamics>('flow');
  const [batchColorMode, setBatchColorMode] = useState<ColorMode>('gradient');
  const [batchNeonGlow, setBatchNeonGlow] = useState<boolean>(true);
  const [batchGreenScreen, setBatchGreenScreen] = useState<boolean>(false);
  const [batchCustomInstructions, setBatchCustomInstructions] = useState<string>('');

  // Comparison modal & Analysis modal
  const [comparisonItem, setComparisonItem] = useState<ImageToMotionItem | null>(null);
  const [analysisModalItem, setAnalysisModalItem] = useState<ImageToMotionItem | null>(null);
  const [isBatchExportingMp4, setIsBatchExportingMp4] = useState(false);
  const [batchExportProgress, setBatchExportProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const autoPilotRef = useRef<{ isRunning: boolean; isPaused: boolean }>({ isRunning: false, isPaused: false });

  // References to always access fresh state inside asynchronous loops
  const itemsRef = useRef<ImageToMotionItem[]>(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    autoPilotRef.current = { isRunning: isAutoPilotRunning, isPaused: autoPilotPaused };
  }, [isAutoPilotRunning, autoPilotPaused]);

  const pendingItems = items.filter((item) => item.status === 'pending' || item.status === 'error');
  const completedItems = items.filter((item) => item.status === 'completed');

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
        showToast(`${imageFiles.length} gambar dari clipboard berhasil ditambahkan ke antrian!`, 'success');
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [batchMotionDynamics, batchColorMode, batchNeonGlow, batchGreenScreen, batchCustomInstructions]);

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
          projectId: 'default_queue',
          projectName: 'Antrian Gambar',
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
          showToast(`Berhasil menambahkan ${newItems.length} gambar ke antrian!`, 'success');
          addLog(`[Image to Motion] Menambahkan ${newItems.length} gambar ke Antrian Gambar`, 'cyan');
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
    setAutoPilotStatus((prev) =>
      prev
        ? {
            ...prev,
            currentStageText: `🔍 Menganalisis logika bentuk & anatomi "${item.fileName}"...`,
          }
        : null
    );
    addLog(`[Image to Motion] Menganalisa struktur gambar "${item.fileName}"...`, 'info');

    try {
      onUpdateItem(item.id, { status: 'generating', progress: 55 });
      setAutoPilotStatus((prev) =>
        prev
          ? {
              ...prev,
              currentStageText: `🎨 Membuat animasi Canvas 2D 60 FPS untuk "${item.fileName}"...`,
            }
          : null
      );

      const animResult = await generateImageToMotion(
        apiKeys,
        selectedModel,
        {
          imageBase64: item.imageBase64,
          mimeType: item.mimeType,
          fileName: item.fileName,
          projectName: 'Image to Motion',
          motionDynamics: item.motionDynamics,
          colorMode: item.colorMode,
          neonGlow: item.neonGlow,
          isGreenScreen: item.isGreenScreen,
          customInstructions: item.customInstructions,
        },
        (attempt, max, errMsg) => {
          addLog(`[Retry ${attempt}/${max}] "${item.fileName}": ${errMsg}`, 'warn');
          setAutoPilotStatus((prev) =>
            prev
              ? {
                  ...prev,
                  currentStageText: `⚠️ Mencoba ulang (${attempt}/${max}) "${item.fileName}"...`,
                }
              : null
          );
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
        account: 'Image to Motion',
        createdAt: Date.now(),
        isGreenScreen: item.isGreenScreen,
      };

      let itemShapeAnalysis = animResult.shapeAnalysis;
      if (!itemShapeAnalysis && animResult.html) {
        try {
          const match = animResult.html.match(/<script\s+type=["']application\/json["']\s+id=["']shape-analysis["']>([\s\S]*?)<\/script>/i);
          if (match && match[1]) {
            const parsed = JSON.parse(match[1].trim());
            if (parsed.objectName) {
              itemShapeAnalysis = {
                objectName: String(parsed.objectName || ''),
                shapeDescription: String(parsed.shapeDescription || ''),
                detectedElements: Array.isArray(parsed.detectedElements) ? parsed.detectedElements.map(String) : [],
                professionalMotionPlan: String(parsed.professionalMotionPlan || ''),
                similaritySynthesis: String(parsed.similaritySynthesis || ''),
              };
            }
          }
        } catch (e) {}
      }

      const subjectName = itemShapeAnalysis?.objectName || animResult.detectedSubject || animResult.title;

      onUpdateItem(item.id, {
        status: 'completed',
        progress: 100,
        detectedSubject: subjectName,
        shapeAnalysis: itemShapeAnalysis,
        animationResult: animationItem,
      });

      // Crucial: Add to gallery state immediately so all generated animations are permanently saved!
      onAddAnimation(animationItem);
      onPreviewAnimation(animationItem);

      setAutoPilotStatus((prev) =>
        prev
          ? {
              ...prev,
              currentStageText: `✅ Berhasil merender "${item.fileName}" 60 FPS HD!`,
            }
          : null
      );
      addLog(`[Image to Motion] Berhasil membuat motion untuk "${item.fileName}"!`, 'success');
      return true;
    } catch (err: any) {
      const errorMsg = err?.message || 'Gagal memproses animasi gambar';
      onUpdateItem(item.id, { status: 'error', progress: 0, error: errorMsg });
      addLog(`[Error Image to Motion] "${item.fileName}": ${errorMsg}`, 'error');
      setAutoPilotStatus((prev) =>
        prev
          ? {
              ...prev,
              currentStageText: `❌ Gagal pada "${item.fileName}": ${errorMsg}`,
            }
          : null
      );
      return false;
    } finally {
      setCurrentProcessingId(null);
    }
  };

  // Auto Pilot sequential batch runner (menjalankan satu per satu berurutan dari antrian paling atas ke bawah)
  const handleStartAutoPilot = async () => {
    const allPending = itemsRef.current.filter((it) => it.status === 'pending' || it.status === 'error');
    if (allPending.length === 0) {
      showToast('Semua antrian gambar sudah selesai dibuat!', 'info');
      return;
    }

    if (autoPilotRef.current.isRunning || isAutoPilotRunning) {
      showToast('Auto Pilot sedang berjalan!', 'warn');
      return;
    }

    // Set synchronous ref flag and state immediately
    autoPilotRef.current = { isRunning: true, isPaused: false };
    setIsAutoPilotRunning(true);
    setAutoPilotPaused(false);

    const totalToProcess = allPending.length;
    let completedOverall = 0;

    addLog('═══════════════════════════════════════════════════════════════', 'cyan');
    addLog(
      `🚀 [AUTO PILOT DIMULAI] Menjalankan ${totalToProcess} antrian gambar satu per satu berurutan dari atas ke bawah...`,
      'cyan'
    );
    showToast(
      `🚀 Auto Pilot Dimulai! Memproses ${totalToProcess} antrian satu per satu dari atas...`,
      'info'
    );

    // Loop through pending items sequentially from top (index 0) downwards
    for (let i = 0; i < allPending.length; i++) {
      if (!autoPilotRef.current.isRunning) {
        addLog('[Auto Pilot] Proses dihentikan oleh pengguna.', 'warn');
        break;
      }

      // Handle Pause
      while (autoPilotRef.current.isPaused) {
        await new Promise((res) => setTimeout(res, 400));
        if (!autoPilotRef.current.isRunning) break;
      }
      if (!autoPilotRef.current.isRunning) break;

      const currentItem = allPending[i];
      const percent = Math.round((completedOverall / totalToProcess) * 100);

      setAutoPilotStatus({
        totalItemsOverall: totalToProcess,
        completedItemsOverall: completedOverall,
        currentItemIndex: i + 1,
        currentFileName: currentItem.fileName,
        currentStageText: `Menganalisis logika bentuk & merancang motion 60 FPS untuk "${currentItem.fileName}"...`,
        progressPercent: percent,
      });

      addLog(
        `⚡ [Antrian #${i + 1}/${totalToProcess}] Memproses "${currentItem.fileName}" dari atas...`,
        'info'
      );
      showToast(
        `⚡ [Antrian #${i + 1}/${totalToProcess}] Memproses "${currentItem.fileName}"...`,
        'info'
      );

      const success = await processSingleItem(currentItem);
      completedOverall++;

      const updatedPercent = Math.round((completedOverall / totalToProcess) * 100);
      setAutoPilotStatus((prev) =>
        prev
          ? {
              ...prev,
              completedItemsOverall: completedOverall,
              progressPercent: updatedPercent,
              currentStageText: success
                ? `Berhasil merender "${currentItem.fileName}" (60 FPS HD)`
                : `Gagal memproses "${currentItem.fileName}"`,
            }
          : null
      );

      if (success) {
        addLog(
          `✅ [Antrian #${i + 1}/${totalToProcess}] "${currentItem.fileName}" selesai dibuat 60 FPS HD!`,
          'success'
        );
        showToast(
          `✨ [Antrian #${i + 1}] "${currentItem.fileName}" selesai dibuat 60 FPS!`,
          'success'
        );
      } else {
        addLog(
          `⚠️ [Antrian #${i + 1}/${totalToProcess}] "${currentItem.fileName}" kendala, otomatis lanjut ke antrian berikutnya...`,
          'warn'
        );
      }

      // Small breather between items
      if (autoPilotRef.current.isRunning && i < allPending.length - 1) {
        await new Promise((res) => setTimeout(res, 800));
      }
    }

    const wasRunning = autoPilotRef.current.isRunning;
    autoPilotRef.current = { isRunning: false, isPaused: false };
    setIsAutoPilotRunning(false);
    setAutoPilotPaused(false);
    setAutoPilotStatus(null);

    if (wasRunning) {
      addLog(
        `🏆 [AUTO PILOT SELESAI] Seluruh ${totalToProcess} antrian gambar telah selesai diproses berurutan!`,
        'success'
      );
      addLog('═══════════════════════════════════════════════════════════════', 'cyan');
      showToast('🎊 Auto Pilot Selesai! Semua antrian berhasil digenerate satu per satu!', 'success');
    }
  };

  const handlePauseAutoPilot = () => {
    const nextPaused = !autoPilotPaused;
    setAutoPilotPaused(nextPaused);
    autoPilotRef.current.isPaused = nextPaused;
    if (nextPaused) {
      addLog('[Auto Pilot] ⏸ Dijeda oleh pengguna.', 'warn');
      showToast('⏸ Auto Pilot dijeda', 'info');
    } else {
      addLog('[Auto Pilot] ▶ Dilanjutkan kembali.', 'info');
      showToast('▶ Auto Pilot dilanjutkan', 'info');
    }
  };

  const handleStopAutoPilot = () => {
    autoPilotRef.current = { isRunning: false, isPaused: false };
    setIsAutoPilotRunning(false);
    setAutoPilotPaused(false);
    setAutoPilotStatus(null);
    addLog('[Auto Pilot] ⏹ Dihentikan oleh pengguna.', 'error');
    showToast('⏹ Auto Pilot dihentikan', 'warn');
  };

  // Export all completed items as ZIP of MP4 videos
  const handleExportAllMp4Zip = async () => {
    if (completedItems.length === 0) {
      showToast('Belum ada animasi yang selesai dibuat.', 'warn');
      return;
    }

    setIsBatchExportingMp4(true);
    setBatchExportProgress({ current: 0, total: completedItems.length });
    showToast(`Memulai batch rendering MP4 untuk ${completedItems.length} animasi...`, 'info');

    try {
      const zip = new JSZip();
      const folder = zip.folder('motion_graphics_mp4') || zip;

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
      a.download = `Batch_MP4_ImageToMotion_${Date.now()}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(downloadUrl), 5000);

      showToast(`Batch export MP4 selesai! Berhasil mengunduh ZIP.`, 'success');
      addLog(`[Batch Export MP4] Selesai mengunduh ZIP`, 'success');
    } catch (e: any) {
      showToast(`Gagal export batch ZIP: ${e.message}`, 'error');
    } finally {
      setIsBatchExportingMp4(false);
    }
  };

  // Export all completed HTML as ZIP
  const handleExportAllHtmlZip = async () => {
    if (completedItems.length === 0) {
      showToast('Belum ada animasi yang selesai dibuat.', 'warn');
      return;
    }

    const zip = new JSZip();
    const folder = zip.folder('html_motion_canvas') || zip;

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
    a.download = `Batch_HTML_ImageToMotion_${Date.now()}.zip`;
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
                Deteksi semantik elemen gambar referensi & ciptakan animasi Canvas 2D 60 FPS akurat
              </p>
            </div>
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
              Drag & Drop Gambar Referensi ke Sini atau <span className="text-amber-400 underline decoration-amber-400/50">Klik untuk Browse</span>
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
            <span className="text-[10px] text-gray-400">Diterapkan ke antrian gambar</span>
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
              placeholder="Instruksi peniruan khusus (misal: buat jarum berputar cepat, denyut aerodinamis halus)..."
              className="w-full bg-slate-900 text-xs text-gray-200 border border-gray-800 rounded-lg px-2.5 py-1.5 placeholder-gray-500 focus:ring-1 focus:ring-amber-400 focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* 4. ANTRIAN GAMBAR & AUTO PILOT COMMAND PANEL */}
      <div className="glass-card rounded-2xl p-4 sm:p-5 border border-gray-800/90 space-y-4 shadow-xl">
        {/* Header: Title & Action Tools */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-gray-800">
          {/* Title & Counter */}
          <div className="flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-xl bg-sky-500/20 border border-sky-500/40 text-sky-400 flex items-center justify-center text-xs shrink-0">
              <i className="fa-solid fa-list-check"></i>
            </span>
            <div className="flex items-center gap-2">
              <h3 className="font-extrabold text-xs sm:text-sm text-gray-100 uppercase">
                ANTRIAN GAMBAR
              </h3>
              <span className="text-[11px] font-mono bg-slate-900 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-lg font-bold">
                {items.length} Gambar
              </span>
            </div>
          </div>

          {/* Action Tools (ZIP MP4, ZIP HTML, Clear) */}
          <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center flex-wrap">
            {completedItems.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={handleExportAllMp4Zip}
                  disabled={isBatchExportingMp4}
                  className="px-2.5 py-1.5 bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 transition shadow-sm cursor-pointer disabled:opacity-50"
                  title="Export semua animasi yang selesai ke MP4 ZIP"
                >
                  {isBatchExportingMp4 ? (
                    <>
                      <i className="fa-solid fa-spinner fa-spin text-xs"></i>
                      <span>MP4 ({batchExportProgress.current}/{batchExportProgress.total})</span>
                    </>
                  ) : (
                    <>
                      <i className="fa-solid fa-film text-xs"></i>
                      <span>ZIP MP4</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleExportAllHtmlZip}
                  className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-gray-200 font-bold text-xs rounded-xl flex items-center gap-1.5 transition border border-gray-700 cursor-pointer shadow-sm"
                  title="Unduh semua file HTML dalam ZIP"
                >
                  <i className="fa-solid fa-file-zipper text-sky-400 text-xs"></i>
                  <span>ZIP HTML</span>
                </button>

                {onClearCompletedItems && (
                  <button
                    type="button"
                    onClick={onClearCompletedItems}
                    className="p-1.5 text-gray-400 hover:text-rose-400 rounded-lg bg-slate-900 border border-gray-800 transition cursor-pointer"
                    title="Bersihkan item yang sudah selesai"
                  >
                    <i className="fa-solid fa-broom text-xs"></i>
                  </button>
                )}
              </>
            )}

            {items.length > 0 && onClearAllItems && (
              <button
                type="button"
                onClick={onClearAllItems}
                className="p-1.5 text-gray-400 hover:text-rose-400 rounded-lg bg-slate-900 border border-gray-800 transition cursor-pointer"
                title="Hapus semua antrian gambar"
              >
                <i className="fa-solid fa-trash-can text-xs"></i>
              </button>
            )}
          </div>
        </div>

        {/* Streamlined Direct Auto Pilot Bar */}
        <div className="bg-slate-950/85 rounded-xl px-3.5 py-2.5 border border-amber-500/25 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 shadow-md">
          {/* Status & Concise Info */}
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shrink-0 animate-pulse"></span>
            <div className="flex items-baseline gap-2 flex-wrap min-w-0">
              <span className="text-xs font-extrabold text-amber-200 whitespace-nowrap">
                Auto Pilot
              </span>
              <span className="text-xs text-amber-300 font-mono font-bold">
                {pendingItems.length} antrian
              </span>
              <span className="text-[11px] text-gray-400 hidden sm:inline truncate">
                · Dijalankan satu per satu berurutan dari antrian teratas
              </span>
            </div>
          </div>

          {/* Trigger Buttons */}
          <div className="flex items-center gap-2 shrink-0">
            {!isAutoPilotRunning ? (
              <button
                type="button"
                onClick={handleStartAutoPilot}
                disabled={pendingItems.length === 0}
                className="px-4 py-2 bg-gradient-to-r from-amber-500 to-yellow-400 hover:from-amber-400 hover:to-yellow-300 text-slate-950 font-black text-xs rounded-xl flex items-center gap-2 transition shadow-md shadow-amber-500/25 disabled:opacity-40 cursor-pointer active:scale-95 whitespace-nowrap"
                title="Jalankan semua antrian gambar satu per satu berurutan dari atas ke bawah"
              >
                <i className="fa-solid fa-rocket text-xs"></i>
                <span>Jalankan Auto Pilot ({pendingItems.length})</span>
              </button>
            ) : (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handlePauseAutoPilot}
                  className={`px-3 py-1.5 text-white font-bold text-xs rounded-lg flex items-center gap-1.5 transition cursor-pointer shadow whitespace-nowrap ${
                    autoPilotPaused
                      ? 'bg-emerald-600 hover:bg-emerald-500'
                      : 'bg-amber-600 hover:bg-amber-500'
                  }`}
                >
                  <i className={`fa-solid fa-${autoPilotPaused ? 'play' : 'pause'} text-xs`}></i>
                  <span>{autoPilotPaused ? 'Lanjutkan' : 'Jeda'}</span>
                </button>
                <button
                  type="button"
                  onClick={handleStopAutoPilot}
                  className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-lg flex items-center gap-1.5 transition cursor-pointer shadow whitespace-nowrap"
                >
                  <i className="fa-solid fa-stop text-xs"></i>
                  <span>Hentikan</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* LIVE AUTO PILOT PROGRESS BAR & STATUS CARD */}
        {isAutoPilotRunning && autoPilotStatus && (
          <div className="bg-gradient-to-r from-slate-950 via-amber-950/40 to-slate-950 border-2 border-amber-500/50 rounded-2xl p-4 shadow-2xl shadow-amber-500/15 space-y-3 relative overflow-hidden animate-fadeIn">
            {/* Ambient glowing beam */}
            <div className="absolute top-0 right-1/4 w-32 h-32 bg-amber-400/10 rounded-full blur-2xl pointer-events-none"></div>

            {/* Top Row: Active item indicator & status */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 relative z-10">
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-sky-500/20 border border-sky-500/40 text-sky-200 text-xs font-bold shadow-sm">
                  <i className="fa-solid fa-bolt text-sky-400 animate-pulse"></i>
                  <span className="text-sky-300 font-mono">
                    Antrian #{autoPilotStatus.currentItemIndex} dari {autoPilotStatus.totalItemsOverall}:
                  </span>
                  <span className="text-white font-mono truncate max-w-[200px] sm:max-w-[280px]">
                    {autoPilotStatus.currentFileName}
                  </span>
                </div>
              </div>

              {/* Status badge */}
              <div className="flex items-center gap-2 shrink-0">
                <span
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border flex items-center gap-1.5 ${
                    autoPilotPaused
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                      : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                  }`}
                >
                  <span
                    className={`w-2 h-2 rounded-full ${
                      autoPilotPaused ? 'bg-amber-400' : 'bg-emerald-400 animate-ping'
                    }`}
                  ></span>
                  <span>{autoPilotPaused ? 'Auto Pilot Dijeda' : 'Sedang Memproses 60 FPS'}</span>
                </span>
              </div>
            </div>

            {/* Middle Row: Visual Loading Bar with Animated Gradient */}
            <div className="space-y-1.5 relative z-10">
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-300 font-semibold flex items-center gap-1.5">
                  <i className="fa-solid fa-bars-progress text-amber-400"></i>
                  <span>
                    Total Selesai: <strong className="text-amber-300 font-mono">{autoPilotStatus.completedItemsOverall}</strong> / {autoPilotStatus.totalItemsOverall} Item
                  </span>
                </span>
                <span className="text-amber-300 font-mono font-black text-sm">
                  {autoPilotStatus.progressPercent}%
                </span>
              </div>

              {/* The Glowing Loading Bar */}
              <div className="h-3.5 w-full bg-slate-900 rounded-full overflow-hidden p-0.5 border border-amber-500/40 relative shadow-inner">
                <div
                  className="h-full bg-gradient-to-r from-amber-500 via-yellow-400 to-emerald-400 rounded-full transition-all duration-500 relative shadow-[0_0_15px_rgba(245,158,11,0.7)]"
                  style={{ width: `${Math.max(autoPilotStatus.progressPercent, 4)}%` }}
                >
                  {/* Gleam stripe animation */}
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent animate-pulse"></div>
                </div>
              </div>
            </div>

            {/* Bottom Row: Stage Description */}
            <div className="flex items-center justify-between text-[11px] text-gray-400 pt-1 border-t border-gray-800/80 relative z-10">
              <div className="flex items-center gap-2 truncate">
                <i className="fa-solid fa-spinner fa-spin text-amber-400 text-xs shrink-0"></i>
                <span className="text-amber-200/90 truncate font-medium">
                  {autoPilotStatus.currentStageText}
                </span>
              </div>
              <span className="text-[10px] text-gray-500 uppercase tracking-wider shrink-0 font-mono hidden sm:inline">
                Canvas 2D 60 FPS Engine
              </span>
            </div>
          </div>
        )}

        {/* Queue Items List */}
        {items.length === 0 ? (
          <div className="p-8 text-center border border-dashed border-gray-800 rounded-xl space-y-2">
            <div className="w-10 h-10 rounded-xl bg-slate-900 border border-gray-800 text-gray-500 flex items-center justify-center mx-auto text-base">
              <i className="fa-solid fa-images"></i>
            </div>
            <p className="text-xs font-bold text-gray-300">
              Antrian gambar masih kosong
            </p>
            <p className="text-[11px] text-gray-500">
              Drag & drop atau paste gambar referensi di atas untuk menambahkannya ke antrian.
            </p>
          </div>
        ) : (
          <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
            {items.map((item, idx) => {
              const isProcessing = currentProcessingId === item.id;
              const isCompleted = item.status === 'completed';
              const isError = item.status === 'error';

              return (
                <div
                  key={item.id}
                  className={`p-2.5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition ${
                    isProcessing
                      ? 'bg-amber-950/25 border-amber-500/70 shadow-lg shadow-amber-500/15 ring-1 ring-amber-400/40'
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
                      className="w-12 h-12 rounded-lg overflow-hidden border border-gray-700 bg-slate-950 shrink-0 cursor-pointer group relative"
                      title="Klik untuk bandingkan dengan hasil animasi"
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

                    {/* Metadata */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
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
                        {(item.shapeAnalysis?.objectName || item.detectedSubject) && (
                          <button
                            type="button"
                            onClick={() => (item.shapeAnalysis ? setAnalysisModalItem(item) : null)}
                            className="text-[9px] bg-purple-950/80 text-purple-300 border border-purple-800/60 px-1.5 py-0.2 rounded font-semibold flex items-center gap-1 cursor-pointer hover:bg-purple-900/80 transition"
                            title="Klik untuk melihat analisis logika bentuk & motion"
                          >
                            <i className="fa-solid fa-brain text-[8px] text-purple-400"></i>
                            <span className="truncate max-w-[140px]">
                              {item.shapeAnalysis?.objectName || item.detectedSubject}
                            </span>
                          </button>
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

                      {/* Inline progress bar when active */}
                      {isProcessing && (
                        <div className="mt-1.5 w-full bg-slate-950 rounded-full h-1.5 overflow-hidden border border-amber-500/30">
                          <div
                            className="h-full bg-gradient-to-r from-amber-400 to-yellow-300 animate-pulse"
                            style={{ width: `${item.progress || 50}%` }}
                          ></div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right: Actions */}
                  <div className="flex items-center gap-1 shrink-0 self-end sm:self-center">
                    {/* Trigger Single Process */}
                    {!isCompleted && !isProcessing && (
                      <button
                        type="button"
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
                          type="button"
                          onClick={() => onPreviewAnimation(item.animationResult!)}
                          className="px-2 py-1 bg-sky-600/30 hover:bg-sky-600/50 text-sky-300 border border-sky-500/30 font-semibold text-[11px] rounded-lg transition cursor-pointer"
                          title="Preview Animasi di Layar Utama"
                        >
                          <i className="fa-solid fa-play text-[9px]"></i>
                        </button>
                        {item.shapeAnalysis && (
                          <button
                            type="button"
                            onClick={() => setAnalysisModalItem(item)}
                            className="px-2 py-1 bg-purple-500/20 hover:bg-purple-500/40 text-purple-300 border border-purple-500/40 font-semibold text-[11px] rounded-lg transition cursor-pointer flex items-center gap-1"
                            title="Lihat 3 Analisis Logika AI"
                          >
                            <i className="fa-solid fa-brain text-[9px]"></i>
                            <span className="hidden sm:inline">Logika</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setComparisonItem(item)}
                          className="px-2 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 font-semibold text-[11px] rounded-lg transition cursor-pointer"
                          title="Bandingkan Gambar Asli vs Animasi"
                        >
                          <i className="fa-solid fa-code-compare text-[9px]"></i>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDownloadSingleHtml(item)}
                          className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-gray-300 font-semibold text-[11px] rounded-lg transition cursor-pointer"
                          title="Unduh HTML"
                        >
                          <i className="fa-solid fa-code text-[9px]"></i>
                        </button>
                        <button
                          type="button"
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

      {/* MODAL: SIDE-BY-SIDE COMPARISON (ORIGINAL IMAGE VS GENERATED MOTION) */}
      {comparisonItem && (
        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 animate-fadeIn">
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
                className="text-gray-400 hover:text-white p-1 cursor-pointer"
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
                      className="text-[10px] text-sky-300 hover:underline flex items-center gap-1 cursor-pointer"
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

            {/* 3-Step Shape & Motion Logical Analysis Card */}
            {comparisonItem.shapeAnalysis && (
              <div className="bg-slate-900/90 rounded-xl p-3.5 border border-purple-500/30 space-y-2 shrink-0 text-left">
                <div className="flex items-center justify-between text-xs font-bold text-purple-300">
                  <span className="flex items-center gap-1.5">
                    <i className="fa-solid fa-brain text-purple-400"></i>
                    <span>Analisis Logika Bentuk & Motion AI</span>
                  </span>
                  <span className="text-[10px] bg-purple-950/80 border border-purple-800/40 px-2 py-0.5 rounded text-purple-300 font-mono">
                    3-Step Logical Synthesis
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 text-[11px]">
                  {/* Step 1: Bentuk Objek & Nama */}
                  <div className="bg-slate-950/90 rounded-lg p-2.5 border border-amber-500/20 space-y-1">
                    <div className="font-bold text-amber-300 flex items-center gap-1">
                      <span className="w-4 h-4 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center text-[10px]">1</span>
                      <span>Bentuk Objek & Nama</span>
                    </div>
                    <div className="text-gray-100 font-semibold">{comparisonItem.shapeAnalysis.objectName}</div>
                    <p className="text-gray-400 text-[10px] leading-relaxed">{comparisonItem.shapeAnalysis.shapeDescription}</p>
                    {comparisonItem.shapeAnalysis.detectedElements?.length > 0 && (
                      <div className="flex flex-wrap gap-1 pt-1">
                        {comparisonItem.shapeAnalysis.detectedElements.map((el, i) => (
                          <span key={i} className="text-[9px] bg-slate-900 text-amber-300 border border-amber-500/30 px-1.5 py-0.2 rounded font-medium">
                            {el}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Step 2: Motion Profesional */}
                  <div className="bg-slate-950/90 rounded-lg p-2.5 border border-sky-500/20 space-y-1">
                    <div className="font-bold text-sky-300 flex items-center gap-1">
                      <span className="w-4 h-4 rounded-full bg-sky-500/20 text-sky-400 flex items-center justify-center text-[10px]">2</span>
                      <span>Motion Profesional Referensi</span>
                    </div>
                    <p className="text-gray-300 text-[10px] leading-relaxed">
                      {comparisonItem.shapeAnalysis.professionalMotionPlan}
                    </p>
                  </div>

                  {/* Step 3: Sintesis Kemiripan */}
                  <div className="bg-slate-950/90 rounded-lg p-2.5 border border-emerald-500/20 space-y-1">
                    <div className="font-bold text-emerald-300 flex items-center gap-1">
                      <span className="w-4 h-4 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-[10px]">3</span>
                      <span>Sintesis Kemiripan 1:1</span>
                    </div>
                    <p className="text-gray-300 text-[10px] leading-relaxed">
                      {comparisonItem.shapeAnalysis.similaritySynthesis}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Bottom Actions */}
            <div className="flex justify-between items-center pt-3 border-t border-gray-800 shrink-0">
              <span className="text-[11px] text-gray-400">
                Mode: <strong className="text-amber-300 capitalize">{comparisonItem.motionDynamics}</strong> • Warna: <strong className="text-amber-300 capitalize">{comparisonItem.colorMode}</strong>
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

      {/* MODAL: DETAILED 3-STEP SHAPE & MOTION LOGICAL ANALYSIS */}
      {analysisModalItem && (
        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 animate-fadeIn">
          <div className="glass-card rounded-2xl p-5 border border-purple-500/40 bg-slate-950 max-w-3xl w-full space-y-4 shadow-2xl flex flex-col max-h-[90vh]">
            <div className="flex justify-between items-center pb-3 border-b border-gray-800 shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-purple-500/20 text-purple-400 border border-purple-500/30 flex items-center justify-center text-sm">
                  <i className="fa-solid fa-brain"></i>
                </div>
                <div>
                  <h3 className="font-extrabold text-sm sm:text-base text-gray-100 flex items-center gap-2">
                    <span>Analisis Logika Bentuk & Motion AI</span>
                  </h3>
                  <p className="text-[11px] text-gray-400">
                    File: <span className="text-amber-300 font-mono">{analysisModalItem.fileName}</span>
                  </p>
                </div>
              </div>
              <button
                onClick={() => setAnalysisModalItem(null)}
                className="text-gray-400 hover:text-white p-1 cursor-pointer"
              >
                <i className="fa-solid fa-xmark text-base"></i>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3.5 pr-1">
              {/* Thumbnail Mini Preview */}
              <div className="bg-slate-900/80 rounded-xl p-3 border border-gray-800 flex items-center gap-3">
                <img
                  src={analysisModalItem.imagePreviewUrl}
                  alt="Thumb"
                  className="w-14 h-14 object-contain rounded-lg bg-black border border-gray-800 shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-bold text-gray-200">
                    {analysisModalItem.shapeAnalysis?.objectName || analysisModalItem.detectedSubject || 'Objek Teranalisis'}
                  </div>
                  <div className="flex items-center gap-2 mt-1 text-[10px] text-gray-400 flex-wrap">
                    <span>Dinamika: <strong className="text-amber-300 capitalize">{analysisModalItem.motionDynamics}</strong></span>
                    <span>•</span>
                    <span>Warna: <strong className="text-amber-300 capitalize">{analysisModalItem.colorMode}</strong></span>
                    <span>•</span>
                    <span>Background: <strong className="text-emerald-400">{analysisModalItem.isGreenScreen ? '#00FF00' : 'Dark Studio'}</strong></span>
                  </div>
                </div>
              </div>

              {/* Step 1 */}
              <div className="bg-slate-900/90 rounded-xl p-4 border border-amber-500/30 space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-amber-300">
                  <span className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-amber-500 text-slate-950 flex items-center justify-center text-xs font-black">1</span>
                    <span>Bentuk Objek & Identifikasi Nama</span>
                  </span>
                  <span className="text-[10px] text-amber-400/80 font-mono">Kemiripan Geometris</span>
                </div>
                <div className="text-sm font-extrabold text-gray-100">
                  {analysisModalItem.shapeAnalysis?.objectName || 'Objek Teridentifikasi'}
                </div>
                <p className="text-xs text-gray-300 leading-relaxed">
                  {analysisModalItem.shapeAnalysis?.shapeDescription || 'Objek berhasil dianalisis struktur bentuk dan rasio anatomisnya.'}
                </p>
                {analysisModalItem.shapeAnalysis?.detectedElements && analysisModalItem.shapeAnalysis.detectedElements.length > 0 && (
                  <div className="pt-2">
                    <span className="text-[10px] font-semibold text-gray-400 block mb-1.5">Sub-Elemen Geometris Terdeteksi:</span>
                    <div className="flex flex-wrap gap-1.5">
                      {analysisModalItem.shapeAnalysis.detectedElements.map((el, i) => (
                        <span key={i} className="text-[10px] bg-slate-950 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-md font-medium">
                          ✓ {el}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Step 2 */}
              <div className="bg-slate-900/90 rounded-xl p-4 border border-sky-500/30 space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-sky-300">
                  <span className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-sky-500 text-slate-950 flex items-center justify-center text-xs font-black">2</span>
                    <span>Analisis Motion Profesional Berdasarkan Referensi</span>
                  </span>
                  <span className="text-[10px] text-sky-400/80 font-mono">Fisika Gerak Nyata</span>
                </div>
                <p className="text-xs text-gray-300 leading-relaxed">
                  {analysisModalItem.shapeAnalysis?.professionalMotionPlan ||
                    'Setiap elemen dianimasikan secara terpisah mengikuti prinsip fisika nyata & mikro-gerak microstock.'}
                </p>
              </div>

              {/* Step 3 */}
              <div className="bg-slate-900/90 rounded-xl p-4 border border-emerald-500/30 space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-emerald-300">
                  <span className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-emerald-500 text-slate-950 flex items-center justify-center text-xs font-black">3</span>
                    <span>Sintesis Kemiripan Semirip Mungkin (1:1 Vektor Murni)</span>
                  </span>
                  <span className="text-[10px] text-emerald-400/80 font-mono">Zero Background Artifacts</span>
                </div>
                <p className="text-xs text-gray-300 leading-relaxed">
                  {analysisModalItem.shapeAnalysis?.similaritySynthesis ||
                    'Elemen digambar ulang secara murni dengan kode HTML5 Canvas 2D mempertahankan posisi koordinat dan rasio ukuran tanpa menjiplak background putih/screenshot bawaan gambar mentah.'}
                </p>
              </div>
            </div>

            <div className="flex justify-between items-center pt-3 border-t border-gray-800 shrink-0">
              <span className="text-[11px] text-gray-400">
                Logika ini digunakan langsung oleh AI untuk menghasilkan kode Canvas 2D 60 FPS
              </span>
              <button
                onClick={() => setAnalysisModalItem(null)}
                className="px-4 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
