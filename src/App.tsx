import React, { useState, useEffect, useCallback } from 'react';
import {
  AnimationItem,
  AnimationType,
  AutoPilotAccount,
  GeminiModel,
  LogItem,
  NicheCategory,
  VisualStyle,
} from './types';
import {
  getStoredApiKeys,
  saveStoredApiKeys,
  getStoredModel,
  saveStoredModel,
  generatePromptsViaGemini,
  generateSingleAnimationCode,
} from './services/geminiService';
import { renderHtmlToVideo } from './services/videoRenderer';
import { Header } from './components/Header';
import { WorkflowSection } from './components/WorkflowSection';
import { RightPanel } from './components/RightPanel';
import { ApiKeyModal } from './components/ApiKeyModal';
import { AutoPilotModal } from './components/AutoPilotModal';
import { GalleryModal } from './components/GalleryModal';
import { FullscreenModal } from './components/FullscreenModal';
import { VideoConverterModal } from './components/VideoConverterModal';
import { ToastContainer, ToastMessage } from './components/Toast';
import { LicenseGate, STORAGE_LICENSE_ACTIVE } from './components/LicenseGate';

const STORAGE_ANIMATIONS = 'bigma_saved_animations';

export default function App() {
  // --- LICENSE STATE ---
  const [isLicenseActive, setIsLicenseActive] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STORAGE_LICENSE_ACTIVE) === 'true';
    } catch (e) {
      return false;
    }
  });

  // --- STATE ---
  const [apiKeys, setApiKeys] = useState<string[]>([]);
  const [hasServerKey, setHasServerKey] = useState<boolean>(true);
  const [selectedModel, setSelectedModel] = useState<GeminiModel>('gemini-2.5-flash');

  const [currentType, setCurrentType] = useState<AnimationType>('icon');
  const [nicheCategory, setNicheCategory] = useState<NicheCategory>('marketing');
  const [visualStyle, setVisualStyle] = useState<VisualStyle>('minimalist');
  const [promptCount, setPromptCount] = useState<number>(3);
  const [isGreenScreen, setIsGreenScreen] = useState<boolean>(false);
  const [keywordsText, setKeywordsText] = useState<string>('');

  const [generatedPrompts, setGeneratedPrompts] = useState<string[]>([]);
  const [animations, setAnimations] = useState<AnimationItem[]>([]);
  const [downloadQueue, setDownloadQueue] = useState<string[]>([]);

  // Logs & Progress
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [progressShow, setProgressShow] = useState<boolean>(false);
  const [progressText, setProgressText] = useState<string>('');
  const [progressPercent, setProgressPercent] = useState<number>(0);

  // Loading States
  const [isGeneratingPrompts, setIsGeneratingPrompts] = useState<boolean>(false);
  const [isGeneratingAnimations, setIsGeneratingAnimations] = useState<boolean>(false);
  const [isAutoPilotRunning, setIsAutoPilotRunning] = useState<boolean>(false);

  // Modals
  const [isApiModalOpen, setIsApiModalOpen] = useState<boolean>(false);
  const [isAutoPilotModalOpen, setIsAutoPilotModalOpen] = useState<boolean>(false);
  const [isGalleryModalOpen, setIsGalleryModalOpen] = useState<boolean>(false);
  const [isVideoConverterModalOpen, setIsVideoConverterModalOpen] = useState<boolean>(false);
  const [fullscreenItem, setFullscreenItem] = useState<AnimationItem | null>(null);

  // Auto Pilot Accounts
  const [autoPilotAccounts, setAutoPilotAccounts] = useState<AutoPilotAccount[]>([
    {
      id: 'acc_1',
      name: 'Account_1',
      type: 'icon',
      subCategory: 'teknologi',
      style: 'minimalist',
      promptCount: 3,
    },
  ]);

  // Toasts
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [exportingMp4Id, setExportingMp4Id] = useState<string | null>(null);

  // --- INITIALIZATION ---
  useEffect(() => {
    const loadedKeys = getStoredApiKeys();
    setApiKeys(loadedKeys);

    const loadedModel = getStoredModel();
    setSelectedModel(loadedModel);

    // Check server status
    fetch('/api/health')
      .then((res) => res.json())
      .then((data) => {
        if (typeof data.hasServerKey === 'boolean') {
          setHasServerKey(data.hasServerKey);
        }
      })
      .catch(() => {});

    try {
      const savedAnims = localStorage.getItem(STORAGE_ANIMATIONS);
      if (savedAnims) {
        const parsed = JSON.parse(savedAnims);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setAnimations(parsed);
        }
      }
    } catch (e) {
      console.error('Failed to load animations from localStorage', e);
    }
  }, []);

  const showToast = useCallback((msg: string, type: 'info' | 'success' | 'warn' | 'error' = 'info') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, msg, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3500);
  }, []);

  const addLog = useCallback((text: string, type: LogItem['type'] = 'info') => {
    const timestamp = new Date().toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    setLogs((prev) => [...prev, { id: Math.random().toString(36).substring(2, 9), text, type, timestamp }]);
  }, []);

  const saveAnimationsToStorage = (newAnims: AnimationItem[]) => {
    setAnimations(newAnims);
    try {
      localStorage.setItem(STORAGE_ANIMATIONS, JSON.stringify(newAnims.slice(0, 100)));
    } catch (e) {
      console.error('Failed to save animations', e);
    }
  };

  // --- HANDLERS: API KEYS ---
  const handleSaveApiKeys = (keys: string[], model: GeminiModel) => {
    setApiKeys(keys);
    setSelectedModel(model);
    saveStoredApiKeys(keys);
    saveStoredModel(model);
    setIsApiModalOpen(false);

    if (keys.length > 0) {
      showToast(`${keys.length} API Key berhasil disimpan!`, 'success');
      addLog(`Tersimpan ${keys.length} API key Gemini. Model: ${model}`, 'success');
    } else {
      showToast('API Key kosong. Mohon masukkan minimal 1 Key.', 'warn');
    }
  };

  // --- HANDLERS: PROMPTS ---
  const handleGeneratePrompts = async () => {
    setIsGeneratingPrompts(true);
    setProgressShow(true);
    setProgressText(`Menghasilkan ${promptCount} Prompt via Gemini AI...`);
    setProgressPercent(15);

    const keywordLines = keywordsText
      .split('\n')
      .map((k) => k.trim())
      .filter((k) => k.length > 0);

    addLog(
      `Meminta AI untuk generate ${promptCount} prompt animasi (${currentType.toUpperCase()} - ${nicheCategory})${
        isGreenScreen ? ' [Mode Green Screen]' : ''
      }${keywordLines.length > 0 ? ` [${keywordLines.length} Custom Keywords]` : ''}...`,
      'info'
    );

    try {
      const prompts = await generatePromptsViaGemini(
        apiKeys,
        selectedModel,
        currentType,
        nicheCategory,
        visualStyle,
        promptCount,
        keywordLines,
        isGreenScreen
      );

      setGeneratedPrompts(prompts);
      setProgressPercent(100);
      addLog(`Berhasil mendapatkan ${prompts.length} prompt AI.`, 'success');
      showToast(`Berhasil membuat ${prompts.length} prompt AI.`, 'success');
    } catch (err: any) {
      addLog(`Gagal generate prompt: ${err.message}`, 'error');
      showToast(`Gagal membuat prompt: ${err.message}`, 'error');
      if (err.message && err.message.toLowerCase().includes('api key')) {
        setIsApiModalOpen(true);
      }
    } finally {
      setIsGeneratingPrompts(false);
      setTimeout(() => setProgressShow(false), 600);
    }
  };

  const handleProcessManualPrompts = (manualPrompts: string[]) => {
    setGeneratedPrompts(manualPrompts);
    addLog(
      `Memuat ${manualPrompts.length} prompt manual dengan tipe animasi: ${currentType.toUpperCase()}.`,
      'info'
    );
    showToast(`Berhasil memuat ${manualPrompts.length} prompt manual!`, 'success');
  };

  const handleUpdatePrompt = (index: number, text: string) => {
    setGeneratedPrompts((prev) => {
      const next = [...prev];
      next[index] = text;
      return next;
    });
  };

  const handleDeletePrompt = (index: number) => {
    setGeneratedPrompts((prev) => prev.filter((_, i) => i !== index));
  };

  // --- HANDLERS: ANIMATIONS GENERATION ---
  const handleGenerateAnimations = async () => {
    if (generatedPrompts.length === 0) {
      showToast('Daftar prompt masih kosong.', 'warn');
      return;
    }

    setIsGeneratingAnimations(true);
    const total = generatedPrompts.length;
    addLog(`========== MEMULAI GENERATE ANIMASI (${total} ITEM) ==========`, 'info');

    let currentAnimList = [...animations];

    for (let i = 0; i < total; i++) {
      const currentPrompt = generatedPrompts[i];
      const percent = Math.round(((i + 1) / total) * 100);

      setProgressShow(true);
      setProgressText(`Menghasilkan Animasi #${i + 1} dari ${total}...`);
      setProgressPercent(percent);

      addLog(`Requesting HTML5 Canvas untuk Prompt #${i + 1}: "${currentPrompt.substring(0, 40)}..."`, 'info');

      try {
        const anim = await generateSingleAnimationCode(
          apiKeys,
          selectedModel,
          currentPrompt,
          currentType,
          nicheCategory,
          visualStyle,
          i + 1,
          total,
          (attempt, max, err) => {
            addLog(`[Retry ${attempt}/${max}] Animasi #${i + 1} (${err}). Mencoba ulang...`, 'warn');
          },
          3,
          isGreenScreen
        );

        if (anim) {
          const newAnimItem: AnimationItem = {
            ...anim,
            isGreenScreen: anim.isGreenScreen ?? isGreenScreen,
            account: 'Manual',
            createdAt: Date.now(),
          };
          currentAnimList = [newAnimItem, ...currentAnimList];
          saveAnimationsToStorage(currentAnimList);
          addLog(`Berhasil merender animasi #${i + 1}.`, 'success');
        }
      } catch (e: any) {
        addLog(`Error pada animasi #${i + 1}: ${e.message}. Otomatis lanjut ke prompt berikutnya...`, 'error');
        showToast(`Melewati antrean #${i + 1} karena kendala API: ${e.message}`, 'error');
        await new Promise((res) => setTimeout(res, 2500));
        continue;
      }
    }

    setIsGeneratingAnimations(false);
    setProgressShow(false);
    addLog(`========== SELESAI MERENDER ${total} ANIMASI ==========`, 'success');
    showToast('Seluruh animasi selesai di-generate!', 'success');
  };

  // --- HANDLERS: AUTO PILOT ---
  const handleAddAccount = () => {
    setAutoPilotAccounts((prev) => [
      ...prev,
      {
        id: 'acc_' + Date.now(),
        name: `Account_${prev.length + 1}`,
        type: 'icon',
        subCategory: 'teknologi',
        style: 'minimalist',
        promptCount: 2,
      },
    ]);
  };

  const handleRemoveAccount = (index: number) => {
    if (autoPilotAccounts.length > 1) {
      setAutoPilotAccounts((prev) => prev.filter((_, i) => i !== index));
    }
  };

  const handleUpdateAccount = (index: number, updated: Partial<AutoPilotAccount>) => {
    setAutoPilotAccounts((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ...updated };
      return next;
    });
  };

  const handleStartAutoPilot = async () => {
    if (autoPilotAccounts.length === 0) {
      showToast('Daftar akun Auto Pilot masih kosong!', 'warn');
      return;
    }
    if (isAutoPilotRunning) {
      showToast('Auto Pilot sedang berjalan!', 'warn');
      return;
    }

    setIsAutoPilotRunning(true);
    setIsAutoPilotModalOpen(false);
    addLog('========== AUTO PILOT BATCH STARTED ==========', 'info');
    setIsGalleryModalOpen(true);

    let currentAnimList = [...animations];

    for (let i = 0; i < autoPilotAccounts.length; i++) {
      const acc = autoPilotAccounts[i];
      addLog(`Processing Auto Pilot [${acc.name}] - Meminta AI generate ${acc.promptCount} prompt...`, 'warn');

      let prompts: string[] = [];
      try {
        prompts = await generatePromptsViaGemini(
          apiKeys,
          selectedModel,
          acc.type,
          acc.subCategory,
          acc.style,
          acc.promptCount
        );
        addLog(`Berhasil mendapatkan ${prompts.length} prompt untuk [${acc.name}]`, 'success');
      } catch (e: any) {
        addLog(`Gagal generate prompt background untuk [${acc.name}]: ${e.message}`, 'error');
        continue;
      }

      for (let j = 0; j < prompts.length; j++) {
        const currentPrompt = prompts[j];
        addLog(`[${acc.name}] Render Animasi ${j + 1}/${prompts.length}: "${currentPrompt.substring(0, 35)}..."`, 'info');

        try {
          const anim = await generateSingleAnimationCode(
            apiKeys,
            selectedModel,
            currentPrompt,
            acc.type,
            acc.subCategory,
            acc.style,
            j + 1,
            prompts.length
          );

          if (anim) {
            const newAnimItem: AnimationItem = {
              ...anim,
              account: acc.name,
              createdAt: Date.now(),
            };
            currentAnimList = [newAnimItem, ...currentAnimList];
            saveAnimationsToStorage(currentAnimList);
            addLog(`[${acc.name}] Animasi #${j + 1} berhasil ditambahkan ke Galeri.`, 'success');
          }
        } catch (e: any) {
          addLog(`Auto Pilot err #${j + 1}: ${e.message}. Mencoba lanjut...`, 'error');
          await new Promise((res) => setTimeout(res, 3000));
          continue;
        }
      }
    }

    setIsAutoPilotRunning(false);
    addLog('========== AUTO PILOT SELESAI ==========', 'success');
    showToast('Proses Auto Pilot Batch Selesai! Silakan cek Galeri.', 'success');
  };

  // --- HANDLERS: DOWNLOAD & QUEUE ---
  const handleToggleQueue = (id: string) => {
    setDownloadQueue((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  };

  const handleClearQueue = () => {
    setDownloadQueue([]);
  };

  const handleSelectAllToQueue = () => {
    const allIds = animations.map((a) => a.id);
    setDownloadQueue(allIds);
    showToast(`${allIds.length} animasi ditambahkan ke antrean unduhan.`, 'info');
  };

  const handleDeleteSingleAnimation = (id: string) => {
    setAnimations((prev) => {
      const next = prev.filter((a) => a.id !== id);
      saveAnimationsToStorage(next);
      return next;
    });
    setDownloadQueue((prev) => prev.filter((itemId) => itemId !== id));
  };

  const handleClearAllAnimations = () => {
    setAnimations([]);
    setDownloadQueue([]);
    try {
      localStorage.removeItem(STORAGE_ANIMATIONS);
    } catch (e) {}
    addLog('Galeri animasi dibersihkan.', 'warn');
  };

  const handleDownloadSingle = (item: AnimationItem) => {
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
    showToast('File HTML animasi berhasil diunduh!', 'success');
  };

  const handleExportMp4Single = async (item: AnimationItem) => {
    setExportingMp4Id(item.id);
    showToast(`Memulai render MP4 H.264 60 FPS untuk "${item.title.substring(0, 20)}..."`, 'info');
    addLog(`[Export MP4] Merender "${item.title}" ke format MP4 H.264 Universal (1080p 60 FPS)...`, 'info');

    try {
      const result = await renderHtmlToVideo(item.html, {
        width: 1920,
        height: 1080,
        fps: 60,
        duration: 10,
        format: 'mp4',
        mode: item.type,
        isGreenScreen: item.isGreenScreen ?? isGreenScreen,
        onProgress: (pct, msg) => {
          if (pct === 50 || pct === 90) {
            addLog(`[Export MP4] ${msg}`, 'info');
          }
        },
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

      showToast(`Video MP4 (${result.sizeFormatted}) berhasil diunduh & siap diputar!`, 'success');
      addLog(`[Export MP4 Sukses] "${item.title}" (${result.sizeFormatted}) siap diputar di semua komputer.`, 'success');
    } catch (err: any) {
      showToast(`Gagal export MP4: ${err.message}`, 'error');
      addLog(`[Export MP4 Error] ${err.message}`, 'error');
    } finally {
      setExportingMp4Id(null);
    }
  };

  const latestAnimation = animations.length > 0 ? animations[0] : null;

  // --- LICENSE GATE CHECK ---
  if (!isLicenseActive) {
    return <LicenseGate onUnlockSuccess={() => setIsLicenseActive(true)} />;
  }

  return (
    <div className="min-h-screen flex flex-col justify-between selection:bg-sky-500 selection:text-white bg-[#0b0f19]">
      {/* Header */}
      <Header
        apiKeyCount={apiKeys.length}
        hasServerKey={hasServerKey}
        animationCount={animations.length}
        selectedModel={selectedModel}
        onOpenApiModal={() => setIsApiModalOpen(true)}
        onOpenAutoPilotModal={() => setIsAutoPilotModalOpen(true)}
        onOpenVideoConverterModal={() => setIsVideoConverterModalOpen(true)}
        onOpenGalleryModal={() => setIsGalleryModalOpen(true)}
      />

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto px-4 lg:px-8 py-6 flex-1 w-full grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Panel: Workflow */}
        <WorkflowSection
          currentType={currentType}
          onSelectType={setCurrentType}
          nicheCategory={nicheCategory}
          onSelectNiche={setNicheCategory}
          visualStyle={visualStyle}
          onSelectStyle={setVisualStyle}
          promptCount={promptCount}
          onChangePromptCount={setPromptCount}
          isGreenScreen={isGreenScreen}
          onToggleGreenScreen={setIsGreenScreen}
          keywordsText={keywordsText}
          onChangeKeywordsText={setKeywordsText}
          onGeneratePrompts={handleGeneratePrompts}
          isGeneratingPrompts={isGeneratingPrompts}
          generatedPrompts={generatedPrompts}
          onUpdatePrompt={handleUpdatePrompt}
          onDeletePrompt={handleDeletePrompt}
          onGenerateAnimations={handleGenerateAnimations}
          isGeneratingAnimations={isGeneratingAnimations}
          onProcessManualPrompts={handleProcessManualPrompts}
          showToast={showToast}
        />

        {/* Right Panel: Console Log & Latest Preview */}
        <RightPanel
          logs={logs}
          onClearLogs={() => {
            setLogs([]);
            showToast('Log dibersihkan.', 'info');
          }}
          progressShow={progressShow}
          progressText={progressText}
          progressPercent={progressPercent}
          latestAnimation={latestAnimation}
          onOpenGalleryModal={() => setIsGalleryModalOpen(true)}
          onOpenFullscreen={(item) => setFullscreenItem(item)}
          onDownloadSingle={handleDownloadSingle}
          onExportMp4Single={handleExportMp4Single}
          isExportingMp4Id={exportingMp4Id}
        />
      </main>

      {/* Footer */}
      <footer className="glass-card border-t border-gray-800/80 px-4 py-4 text-center text-xs text-gray-500">
        <p>BigMA &copy; 2026. Motion Graphic AI Optimation.</p>
      </footer>

      {/* Modals */}
      <FullscreenModal
        isOpen={!!fullscreenItem}
        item={fullscreenItem}
        onClose={() => setFullscreenItem(null)}
        showToast={showToast}
      />

      <ApiKeyModal
        isOpen={isApiModalOpen}
        apiKeys={apiKeys}
        selectedModel={selectedModel}
        onSaveKeys={handleSaveApiKeys}
        onClose={() => setIsApiModalOpen(false)}
        showToast={showToast}
        addLog={addLog}
      />

      <AutoPilotModal
        isOpen={isAutoPilotModalOpen}
        accounts={autoPilotAccounts}
        onAddAccount={handleAddAccount}
        onRemoveAccount={handleRemoveAccount}
        onUpdateAccount={handleUpdateAccount}
        onStartAutoPilot={handleStartAutoPilot}
        isAutoPilotRunning={isAutoPilotRunning}
        onClose={() => setIsAutoPilotModalOpen(false)}
      />

      <GalleryModal
        isOpen={isGalleryModalOpen}
        animations={animations}
        downloadQueue={downloadQueue}
        onToggleQueue={handleToggleQueue}
        onClearQueue={handleClearQueue}
        onSelectAllToQueue={handleSelectAllToQueue}
        onClearAllAnimations={handleClearAllAnimations}
        onDeleteAnimation={handleDeleteSingleAnimation}
        onClose={() => setIsGalleryModalOpen(false)}
        onOpenFullscreen={(item) => setFullscreenItem(item)}
        showToast={showToast}
      />

      <VideoConverterModal
        isOpen={isVideoConverterModalOpen}
        onClose={() => setIsVideoConverterModalOpen(false)}
        showToast={showToast}
      />

      {/* Toast Notifications */}
      <ToastContainer toasts={toasts} />
    </div>
  );
}
