import React, { useState, useEffect, useCallback } from 'react';
import {
  AnimationItem,
  AnimationType,
  AutoPilotAccount,
  ImageToMotionAutoPilotAccount,
  GeminiModel,
  LogItem,
  NicheCategory,
  VisualStyle,
  ColorMode,
  MotionDynamics,
  ImageToMotionItem,
  ImageToMotionProject,
  NotepadBatch,
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
import { ImageToPromptSection } from './components/ImageToPromptSection';
import { ImageToMotionSection } from './components/ImageToMotionSection';
import { RightPanel } from './components/RightPanel';
import { ApiKeyModal } from './components/ApiKeyModal';
import { AutoPilotModal, FailedAutoPilotItem } from './components/AutoPilotModal';
import { ImageAutoPilotModal } from './components/ImageAutoPilotModal';
import { GalleryModal } from './components/GalleryModal';
import { FullscreenModal } from './components/FullscreenModal';
import { VideoConverterModal } from './components/VideoConverterModal';
import { TutorialModal } from './components/TutorialModal';
import { ToastContainer, ToastMessage } from './components/Toast';
import { LicenseGate, STORAGE_LICENSE_ACTIVE } from './components/LicenseGate';
import { checkLocalTrialStatus, formatRemainingTime } from './services/trialService';

const STORAGE_ANIMATIONS = 'bigma_saved_animations';
const STORAGE_I2M_PROJECTS = 'bigma_i2m_projects';
const STORAGE_I2M_ITEMS = 'bigma_i2m_items';
const STORAGE_ACTIVE_TAB = 'bigma_active_tab';
const STORAGE_PROMPT_SUB_TAB = 'bigma_prompt_sub_tab';
const STORAGE_I2M_AUTOPILOT_ACCOUNTS = 'bigma_i2m_autopilot_accounts_flow';
const STORAGE_AUTOPILOT_ACCOUNTS = 'bigma_prompt_autopilot_accounts';

export default function App() {
  // --- LICENSE & TRIAL STATE ---
  const [isLicenseActive, setIsLicenseActive] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STORAGE_LICENSE_ACTIVE) === 'true';
    } catch (e) {
      return false;
    }
  });

  const [isTrialActive, setIsTrialActive] = useState<boolean>(() => {
    if (localStorage.getItem(STORAGE_LICENSE_ACTIVE) === 'true') return false;
    const trial = checkLocalTrialStatus();
    return trial.isActive;
  });

  const [trialExpiresAt, setTrialExpiresAt] = useState<number | null>(() => {
    const trial = checkLocalTrialStatus();
    return trial.expiresAt;
  });

  const [trialRemainingMs, setTrialRemainingMs] = useState<number>(() => {
    const trial = checkLocalTrialStatus();
    return trial.remainingMs;
  });

  const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState<boolean>(false);

  // Active Primary Tab ('prompt' vs 'image_to_motion')
  const [activeTab, setActiveTab] = useState<'prompt' | 'image_to_motion'>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_ACTIVE_TAB);
      if (saved === 'image_to_motion' || saved === 'prompt') return saved;
    } catch {}
    return 'prompt';
  });

  const handleSelectTab = (tab: 'prompt' | 'image_to_motion') => {
    setActiveTab(tab);
    try {
      localStorage.setItem(STORAGE_ACTIVE_TAB, tab);
    } catch {}
  };

  // Sub-tab inside Prompt AI: 'prompt_to_motion' vs 'image_to_prompt'
  const [promptSubTab, setPromptSubTab] = useState<'prompt_to_motion' | 'image_to_prompt'>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_PROMPT_SUB_TAB);
      if (saved === 'image_to_prompt' || saved === 'prompt_to_motion') return saved;
    } catch {}
    return 'prompt_to_motion';
  });

  const handleSelectPromptSubTab = (subTab: 'prompt_to_motion' | 'image_to_prompt') => {
    setPromptSubTab(subTab);
    try {
      localStorage.setItem(STORAGE_PROMPT_SUB_TAB, subTab);
    } catch {}
  };

  // Image to Motion Projects & Items (Starts empty, no dummy projects)
  const [i2mProjects, setI2mProjects] = useState<ImageToMotionProject[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_I2M_PROJECTS);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return [];
  });

  const [activeI2mProjectId, setActiveI2mProjectId] = useState<string>(() => {
    return i2mProjects[0]?.id || '';
  });

  const [i2mItems, setI2mItems] = useState<ImageToMotionItem[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_I2M_ITEMS);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          const seen = new Set<string>();
          return parsed.filter((item: ImageToMotionItem) => {
            if (!item || !item.id || seen.has(item.id)) return false;
            seen.add(item.id);
            return true;
          });
        }
      }
    } catch {}
    return [];
  });

  // Trial Timer & Expiration Watcher
  useEffect(() => {
    if (isLicenseActive) return;

    const interval = setInterval(() => {
      const trial = checkLocalTrialStatus();
      setTrialRemainingMs(trial.remainingMs);

      if (isTrialActive && !trial.isActive) {
        setIsTrialActive(false);
        showToast('Masa percobaan Trial 1 Hari Anda telah berakhir. Silakan aktivasi Lisensi Seumur Hidup.', 'warn');
        addLog('[Trial Selesai] Masa percobaan 1 hari telah habis. Mohon aktivasi lisensi.', 'warn');
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [isLicenseActive, isTrialActive]);

  // --- STATE ---
  const [apiKeys, setApiKeys] = useState<string[]>([]);
  const [hasServerKey, setHasServerKey] = useState<boolean>(true);
  const [selectedModel, setSelectedModel] = useState<GeminiModel>('gemini-2.5-flash');

  const [currentType, setCurrentType] = useState<AnimationType>('icon');
  const [nicheCategory, setNicheCategory] = useState<NicheCategory>('marketing');
  const [visualStyle, setVisualStyle] = useState<VisualStyle>('minimalist');
  const [colorMode, setColorMode] = useState<ColorMode>('gradient');
  const [motionDynamics, setMotionDynamics] = useState<MotionDynamics>('flow');
  const [neonGlow, setNeonGlow] = useState<boolean>(true);
  const [promptCount, setPromptCount] = useState<number>(3);
  const [isGreenScreen, setIsGreenScreen] = useState<boolean>(false);
  const [keywordsText, setKeywordsText] = useState<string>('');

  const [generatedPrompts, setGeneratedPrompts] = useState<string[]>([]);
  const [failedPrompts, setFailedPrompts] = useState<string[]>([]);
  const [failedAutoPilotItems, setFailedAutoPilotItems] = useState<FailedAutoPilotItem[]>([]);
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
  const [isPromptAutoPilotModalOpen, setIsPromptAutoPilotModalOpen] = useState<boolean>(false);
  const [isImageAutoPilotModalOpen, setIsImageAutoPilotModalOpen] = useState<boolean>(false);
  const [isGalleryModalOpen, setIsGalleryModalOpen] = useState<boolean>(false);
  const [isVideoConverterModalOpen, setIsVideoConverterModalOpen] = useState<boolean>(false);
  const [isTutorialModalOpen, setIsTutorialModalOpen] = useState<boolean>(false);
  const [fullscreenItem, setFullscreenItem] = useState<AnimationItem | null>(null);

  // Auto Pilot Trigger Token for ImageToMotionSection
  const [autoPilotTriggerToken, setAutoPilotTriggerToken] = useState<number | undefined>(undefined);

  // Image to Motion Auto Pilot Accounts (Starts empty as requested: user adds custom names & images)
  const [i2mAutoPilotAccounts, setI2mAutoPilotAccounts] = useState<ImageToMotionAutoPilotAccount[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_I2M_AUTOPILOT_ACCOUNTS);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return [];
  });

  // Prompt AI Auto Pilot Accounts
  const [autoPilotAccounts, setAutoPilotAccounts] = useState<AutoPilotAccount[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_AUTOPILOT_ACCOUNTS);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return [
      {
        id: 'acc_1',
        name: 'Account_1',
        type: 'icon',
        subCategory: 'teknologi',
        style: 'minimalist',
        promptCount: 2,
      },
    ];
  });

  // Startup cleanup for dummy names in localStorage (cleans out legacy dummy accounts)
  useEffect(() => {
    const dummySet = new Set([
      'akun microstock 1',
      'akun microstock 2',
      'akun microstock',
      'project cyber',
      'project flat icon',
      'akun microstock utama',
      'microstock 1',
      'microstock 2',
    ]);

    setI2mAutoPilotAccounts((prev) => {
      const cleaned = prev.filter((a) => !dummySet.has((a.name || '').trim().toLowerCase()));
      if (cleaned.length !== prev.length) {
        try {
          localStorage.setItem(STORAGE_I2M_AUTOPILOT_ACCOUNTS, JSON.stringify(cleaned));
        } catch (e) {}
      }
      return cleaned;
    });

    setI2mItems((prev) => {
      const cleaned = prev.filter((it) => !dummySet.has((it.projectName || '').trim().toLowerCase()));
      if (cleaned.length !== prev.length) {
        try {
          localStorage.setItem(STORAGE_I2M_ITEMS, JSON.stringify(cleaned));
        } catch (e) {}
      }
      return cleaned;
    });

    setI2mProjects((prev) => {
      const cleaned = prev.filter((p) => !dummySet.has((p.name || '').trim().toLowerCase()));
      if (cleaned.length !== prev.length) {
        try {
          localStorage.setItem(STORAGE_I2M_PROJECTS, JSON.stringify(cleaned));
        } catch (e) {}
      }
      return cleaned;
    });
  }, []);

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
      `Meminta AI untuk generate ${promptCount} prompt animasi (${currentType.toUpperCase()} - ${nicheCategory} - ${colorMode.toUpperCase()})${
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
        isGreenScreen,
        colorMode,
        motionDynamics,
        neonGlow
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
    setFailedPrompts([]);
    const total = generatedPrompts.length;
    addLog(`========== MEMULAI GENERATE ANIMASI (${total} ITEM) ==========`, 'info');

    let currentAnimList = [...animations];
    let caughtFailures: string[] = [];

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
          isGreenScreen,
          colorMode,
          motionDynamics,
          neonGlow
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
        addLog(`Error pada animasi #${i + 1}: ${e.message}. Menyimpan untuk fitur coba ulang...`, 'error');
        showToast(`Kendala pada prompt #${i + 1}: ${e.message}`, 'error');
        caughtFailures.push(currentPrompt);
        setFailedPrompts((prev) => [...prev, currentPrompt]);
        await new Promise((res) => setTimeout(res, 2000));
        continue;
      }
    }

    setIsGeneratingAnimations(false);
    setProgressShow(false);

    if (caughtFailures.length > 0) {
      addLog(`========== SELESAI DENGAN ${caughtFailures.length} GAGAL (BISA DIULANG) ==========`, 'warn');
      showToast(`Selesai! ${caughtFailures.length} animasi gagal dibuat. Klik tombol "Ulangi yang Gagal" untuk mencoba kembali.`, 'warn');
    } else {
      addLog(`========== SELESAI MERENDER ${total} ANIMASI ==========`, 'success');
      showToast('Seluruh animasi selesai di-generate!', 'success');
    }
  };

  // Re-try all failed prompts in standard workflow
  const handleRetryFailedPrompts = async () => {
    if (failedPrompts.length === 0) {
      showToast('Tidak ada animasi yang gagal dibuat.', 'info');
      return;
    }

    setIsGeneratingAnimations(true);
    const promptsToRetry = [...failedPrompts];
    const total = promptsToRetry.length;
    addLog(`========== MENCOBA ULANG ${total} ANIMASI GAGAL ==========`, 'warn');
    showToast(`Mencoba ulang ${total} animasi yang sebelumnya mengalami kendala...`, 'info');

    let currentAnimList = [...animations];
    let remainingFailed: string[] = [];

    for (let i = 0; i < total; i++) {
      const currentPrompt = promptsToRetry[i];
      setProgressShow(true);
      setProgressText(`Mencoba Ulang #${i + 1} dari ${total}...`);
      setProgressPercent(Math.round(((i + 1) / total) * 100));

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
          undefined,
          3,
          isGreenScreen,
          colorMode,
          motionDynamics,
          neonGlow
        );

        if (anim) {
          const newAnimItem: AnimationItem = {
            ...anim,
            isGreenScreen: anim.isGreenScreen ?? isGreenScreen,
            account: 'Manual Retry',
            createdAt: Date.now(),
          };
          currentAnimList = [newAnimItem, ...currentAnimList];
          saveAnimationsToStorage(currentAnimList);
          addLog(`[Sukses Diperbaiki] Prompt: "${currentPrompt.substring(0, 35)}..." berhasil dirender!`, 'success');
          showToast(`Berhasil memperbaiki animasi untuk prompt #${i + 1}!`, 'success');
        }
      } catch (e: any) {
        addLog(`[Masih Kendala] Prompt #${i + 1}: ${e.message}`, 'error');
        remainingFailed.push(currentPrompt);
        await new Promise((res) => setTimeout(res, 2000));
      }
    }

    setFailedPrompts(remainingFailed);
    setIsGeneratingAnimations(false);
    setProgressShow(false);

    if (remainingFailed.length === 0) {
      showToast('Seluruh animasi gagal berhasil diperbaiki!', 'success');
      addLog('========== SEMUA ANIMASI GAGAL TELAH BERHASIL DIPERBAIKI ==========', 'success');
    } else {
      showToast(`Tersisa ${remainingFailed.length} animasi yang masih kendala API.`, 'warn');
    }
  };

  // Re-try a single failed prompt
  const handleRetrySinglePrompt = async (promptText: string, index: number) => {
    addLog(`[Coba Ulang Tunggal] Memproses prompt #${index + 1}: "${promptText.substring(0, 35)}..."`, 'info');
    showToast(`Mencoba ulang render animasi #${index + 1}...`, 'info');

    try {
      const anim = await generateSingleAnimationCode(
        apiKeys,
        selectedModel,
        promptText,
        currentType,
        nicheCategory,
        visualStyle,
        1,
        1,
        undefined,
        3,
        isGreenScreen,
        colorMode,
        motionDynamics,
        neonGlow
      );

      if (anim) {
        const newAnimItem: AnimationItem = {
          ...anim,
          isGreenScreen: anim.isGreenScreen ?? isGreenScreen,
          account: 'Manual Retry',
          createdAt: Date.now(),
        };
        const updated = [newAnimItem, ...animations];
        saveAnimationsToStorage(updated);
        setFailedPrompts((prev) => prev.filter((p) => p !== promptText));
        showToast(`Prompt #${index + 1} berhasil diperbaiki & ditambahkan ke Galeri!`, 'success');
        addLog(`Prompt #${index + 1} sukses diperbaiki!`, 'success');
      }
    } catch (e: any) {
      showToast(`Masih gagal mencoba ulang: ${e.message}`, 'error');
      addLog(`Gagal mencoba ulang prompt #${index + 1}: ${e.message}`, 'error');
    }
  };

  // --- HANDLERS: IMAGE TO MOTION AUTO PILOT ---
  const handleSaveI2mAccounts = (accounts: ImageToMotionAutoPilotAccount[]) => {
    setI2mAutoPilotAccounts(accounts);
    try {
      localStorage.setItem(STORAGE_I2M_AUTOPILOT_ACCOUNTS, JSON.stringify(accounts));
    } catch (e) {
      console.error('Failed to save autopilot accounts', e);
    }
  };

  const handleResetI2mAccounts = () => {
    setI2mAutoPilotAccounts([]);
    try {
      localStorage.removeItem(STORAGE_I2M_AUTOPILOT_ACCOUNTS);
    } catch (e) {}
  };

  const handleDeleteI2mAccount = (id: string, name: string) => {
    const targetName = (name || '').trim().toLowerCase();
    const targetId = (id || '').trim();

    // 1. Remove from saved autopilot accounts
    setI2mAutoPilotAccounts((prev) => {
      const updated = prev.filter((a) => {
        if (targetId && a.id === targetId) return false;
        if (targetName && (a.name || '').trim().toLowerCase() === targetName) return false;
        return true;
      });
      try {
        localStorage.setItem(STORAGE_I2M_AUTOPILOT_ACCOUNTS, JSON.stringify(updated));
      } catch (e) {}
      return updated;
    });

    // 2. Remove all items belonging to this account from queue
    setI2mItems((prev) => {
      const updated = prev.filter((it) => {
        if (targetName && (it.projectName || '').trim().toLowerCase() === targetName) return false;
        if (targetId && it.projectId === targetId) return false;
        return true;
      });
      try {
        localStorage.setItem(STORAGE_I2M_ITEMS, JSON.stringify(updated));
      } catch (e) {}
      return updated;
    });

    // 3. Remove project if exists
    setI2mProjects((prev) => {
      const updated = prev.filter((p) => {
        if (targetName && (p.name || '').trim().toLowerCase() === targetName) return false;
        if (targetId && p.id === targetId) return false;
        return true;
      });
      try {
        localStorage.setItem(STORAGE_I2M_PROJECTS, JSON.stringify(updated));
      } catch (e) {}
      return updated;
    });

    showToast(`Akun "${name}" dan seluruh antriannya berhasil dihapus.`, 'info');
    addLog(`[Auto Pilot] Akun "${name}" dihapus beserta antrian gambarnya.`, 'info');
  };

  const handleStartI2mAutoPilot = (accounts: ImageToMotionAutoPilotAccount[]) => {
    handleSaveI2mAccounts(accounts);

    const totalImages = accounts.reduce((sum, a) => sum + (a.referenceImages?.length || 0), 0);
    if (totalImages === 0) {
      showToast('Masukkan minimal 1 gambar referensi ke dalam akun!', 'warn');
      return;
    }

    // Convert each reference image into an ImageToMotionItem
    const newItems: ImageToMotionItem[] = [];
    accounts.forEach((acc) => {
      (acc.referenceImages || []).forEach((img, idx) => {
        newItems.push({
          id: 'i2m_item_' + Date.now() + '_' + acc.id + '_' + idx + '_' + Math.random().toString(36).substring(2, 7),
          projectId: acc.id || ('proj_' + acc.name.toLowerCase().replace(/[^a-z0-9]/g, '_')),
          projectName: acc.name,
          fileName: img.fileName,
          fileSize: img.fileSize,
          imagePreviewUrl: img.previewUrl,
          imageBase64: img.imageBase64,
          mimeType: img.mimeType || 'image/png',
          status: 'pending',
          progress: 0,
          motionDynamics: acc.motionDynamics || 'flow',
          colorMode: acc.colorMode || 'gradient',
          neonGlow: acc.neonGlow ?? true,
          isGreenScreen: acc.isGreenScreen ?? false,
          customInstructions: acc.customInstructions || '',
          createdAt: Date.now(),
        });
      });
    });

    // Merge into i2mItems queue
    setI2mItems((prev) => {
      const existingKeys = new Set(prev.map((it) => `${it.projectName}::${it.fileName}`));
      const itemsToAdd = newItems.filter((it) => !existingKeys.has(`${it.projectName}::${it.fileName}`));
      const combined = [...prev, ...itemsToAdd];
      try {
        localStorage.setItem(STORAGE_I2M_ITEMS, JSON.stringify(combined.slice(0, 200)));
      } catch {}
      return combined;
    });

    // Close modal & navigate to Image to Motion tab
    setIsImageAutoPilotModalOpen(false);
    setActiveTab('image_to_motion');
    try {
      localStorage.setItem(STORAGE_ACTIVE_TAB, 'image_to_motion');
    } catch {}

    // Trigger reactive auto-run in ImageToMotionSection
    setAutoPilotTriggerToken(Date.now());

    showToast(`🚀 Memulai Auto Pilot untuk ${accounts.length} Akun (${newItems.length} Animasi)!`, 'info');
    addLog(`[Auto Pilot] Menjalankan batch antrian untuk ${accounts.length} akun (${newItems.length} animasi)`, 'cyan');
  };

  // --- HANDLERS: AUTO PILOT (PROMPT AI) ---
  const handleAddAccount = () => {
    setAutoPilotAccounts((prev) => {
      const next: AutoPilotAccount[] = [
        ...prev,
        {
          id: 'acc_' + Date.now(),
          name: `Account_${prev.length + 1}`,
          type: 'icon' as AnimationType,
          subCategory: 'teknologi' as NicheCategory,
          style: 'minimalist' as VisualStyle,
          promptCount: 2,
        },
      ];
      try {
        localStorage.setItem(STORAGE_AUTOPILOT_ACCOUNTS, JSON.stringify(next));
      } catch (e) {}
      return next;
    });
  };

  const handleRemoveAccount = (index: number) => {
    setAutoPilotAccounts((prev) => {
      const next = prev.filter((_, i) => i !== index);
      try {
        localStorage.setItem(STORAGE_AUTOPILOT_ACCOUNTS, JSON.stringify(next));
      } catch (e) {}
      return next;
    });
    showToast('Akun berhasil dihapus.', 'info');
  };

  const handleUpdateAccount = (index: number, updated: Partial<AutoPilotAccount>) => {
    setAutoPilotAccounts((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ...updated };
      try {
        localStorage.setItem(STORAGE_AUTOPILOT_ACCOUNTS, JSON.stringify(next));
      } catch (e) {}
      return next;
    });
  };

  // --- HANDLERS: NOTEPAD BATCH GENERATION ---
  const handleProcessNotepadBatches = async (batches: NotepadBatch[]) => {
    if (batches.length === 0) return;
    setIsGeneratingAnimations(true);

    const totalPromptsOverall = batches.reduce((sum, b) => sum + b.prompts.length, 0);
    let completedOverall = 0;
    let currentAnimList = [...animations];

    addLog('═══════════════════════════════════════════════════════════════', 'cyan');
    addLog(
      `🚀 [BATCH NOTEPAD] Memulai generate animasi dari ${batches.length} file Notepad (${totalPromptsOverall} total prompt)...`,
      'cyan'
    );
    showToast(`🚀 Memulai generate animasi dari ${batches.length} file Notepad...`, 'info');

    for (let bIdx = 0; bIdx < batches.length; bIdx++) {
      const batch = batches[bIdx];
      addLog(`📁 [Notepad ${bIdx + 1}/${batches.length}] Memproses file: "${batch.fileName}" (${batch.prompts.length} prompt)...`, 'info');

      for (let pIdx = 0; pIdx < batch.prompts.length; pIdx++) {
        const promptText = batch.prompts[pIdx];
        completedOverall++;
        const percent = Math.round((completedOverall / totalPromptsOverall) * 100);

        setProgressShow(true);
        setProgressText(`[${batch.name}] Prompt ${pIdx + 1}/${batch.prompts.length} (${completedOverall}/${totalPromptsOverall})...`);
        setProgressPercent(percent);

        try {
          const anim = await generateSingleAnimationCode(
            apiKeys,
            selectedModel,
            promptText,
            currentType,
            nicheCategory,
            visualStyle,
            pIdx + 1,
            batch.prompts.length,
            undefined,
            3,
            isGreenScreen,
            colorMode,
            motionDynamics,
            neonGlow
          );

          if (anim) {
            const newAnimItem: AnimationItem = {
              ...anim,
              isGreenScreen: anim.isGreenScreen ?? isGreenScreen,
              account: batch.name, // Categorized with the notepad name!
              createdAt: Date.now(),
            };
            currentAnimList = [newAnimItem, ...currentAnimList];
            saveAnimationsToStorage(currentAnimList);
            addLog(`✅ [${batch.name}] Sukses render: "${promptText.substring(0, 30)}..."`, 'success');
          }
        } catch (e: any) {
          addLog(`❌ [${batch.name}] Gagal prompt #${pIdx + 1}: ${e.message}`, 'error');
        }

        if (completedOverall < totalPromptsOverall) {
          await new Promise((res) => setTimeout(res, 500));
        }
      }
    }

    setIsGeneratingAnimations(false);
    setProgressShow(false);
    addLog('🏁 [SELESAI BATCH NOTEPAD] Semua animasi dari file notepad berhasil digenerate dan tersimpan di Galeri!', 'cyan');
    showToast(`🏁 Selesai! Animasi dari ${batches.length} file Notepad telah tersimpan di Galeri!`, 'success');
  };

  const handleSendPromptsToWorkflow = (prompts: string[]) => {
    setGeneratedPrompts((prev) => [...prompts, ...prev]);
    setPromptSubTab('prompt_to_motion');
    showToast(`${prompts.length} prompt berhasil dimuat ke daftar siap render!`, 'success');
  };

  // Run Auto Pilot batch sequentially account by account, or for a specific account
  const handleStartAutoPilot = async (targetAccountName: string = 'ALL') => {
    const accountsToRun = targetAccountName === 'ALL'
      ? autoPilotAccounts
      : autoPilotAccounts.filter((a) => a.name === targetAccountName);

    if (accountsToRun.length === 0) {
      showToast('Daftar akun Auto Pilot masih kosong!', 'warn');
      return;
    }
    if (isAutoPilotRunning) {
      showToast('Auto Pilot sedang berjalan!', 'warn');
      return;
    }

    setIsAutoPilotRunning(true);
    setIsPromptAutoPilotModalOpen(false);
    const accLabel = targetAccountName === 'ALL' ? 'Semua Akun' : `Akun: "${targetAccountName}"`;
    addLog('═══════════════════════════════════════════════════════════════', 'cyan');
    addLog(`🚀 [AUTO PILOT DIMULAI - ${accLabel}] Menjalankan batch satu per satu sesuai antrian akun...`, 'cyan');
    showToast(`🚀 Auto Pilot [${accLabel}] Dimulai!`, 'info');
    setIsGalleryModalOpen(true);

    let currentAnimList = [...animations];
    let newFailedItems: FailedAutoPilotItem[] = [];

    for (let i = 0; i < accountsToRun.length; i++) {
      const acc = accountsToRun[i];
      addLog(`⚡ [Antrian Akun #${i + 1}/${accountsToRun.length}: ${acc.name}] Meminta AI generate ${acc.promptCount} prompt...`, 'info');

      let prompts: string[] = [];
      try {
        prompts = await generatePromptsViaGemini(
          apiKeys,
          selectedModel,
          acc.type,
          acc.subCategory,
          acc.style,
          acc.promptCount,
          undefined,
          acc.isGreenScreen ?? false,
          acc.colorMode ?? 'gradient',
          acc.motionDynamics ?? 'flow',
          acc.neonGlow ?? true
        );
        addLog(`✅ [${acc.name}] Berhasil mendapatkan ${prompts.length} prompt. Memulai render satu per satu...`, 'success');
      } catch (e: any) {
        addLog(`❌ [${acc.name}] Gagal generate prompt background: ${e.message}`, 'error');
        newFailedItems.push({
          id: 'fail_p_' + Date.now() + '_' + i,
          accountName: acc.name,
          prompt: `(Generate Prompts: ${acc.type} - ${acc.subCategory})`,
          type: acc.type,
          subCategory: acc.subCategory,
          style: acc.style,
          isGreenScreen: acc.isGreenScreen ?? false,
          colorMode: acc.colorMode ?? 'gradient',
          motionDynamics: acc.motionDynamics ?? 'flow',
          neonGlow: acc.neonGlow ?? true,
          error: e.message || 'Gagal menghasilkan prompt',
        });
        continue;
      }

      for (let j = 0; j < prompts.length; j++) {
        const currentPrompt = prompts[j];
        addLog(`🎬 [${acc.name}] Render Animasi #${j + 1}/${prompts.length}: "${currentPrompt.substring(0, 35)}..."`, 'info');

        try {
          const anim = await generateSingleAnimationCode(
            apiKeys,
            selectedModel,
            currentPrompt,
            acc.type,
            acc.subCategory,
            acc.style,
            j + 1,
            prompts.length,
            undefined,
            3,
            acc.isGreenScreen ?? false,
            acc.colorMode ?? 'gradient',
            acc.motionDynamics ?? 'flow',
            acc.neonGlow ?? true
          );

          if (anim) {
            const newAnimItem: AnimationItem = {
              ...anim,
              account: acc.name,
              createdAt: Date.now(),
            };
            currentAnimList = [newAnimItem, ...currentAnimList];
            saveAnimationsToStorage(currentAnimList);
            addLog(`✅ [${acc.name}] Animasi #${j + 1} berhasil dibuat & disimpan ke Galeri!`, 'success');
          }
        } catch (e: any) {
          addLog(`⚠️ [${acc.name}] Error animasi #${j + 1}: ${e.message}. Menyimpan untuk fitur coba ulang kesalahan...`, 'error');
          newFailedItems.push({
            id: 'fail_' + Date.now() + '_' + j + '_' + Math.random().toString(36).substring(7),
            accountName: acc.name,
            prompt: currentPrompt,
            type: acc.type,
            subCategory: acc.subCategory,
            style: acc.style,
            isGreenScreen: acc.isGreenScreen ?? false,
            colorMode: acc.colorMode ?? 'gradient',
            motionDynamics: acc.motionDynamics ?? 'flow',
            neonGlow: acc.neonGlow ?? true,
            error: e.message || 'Gagal merender animasi',
          });
          await new Promise((res) => setTimeout(res, 2000));
          continue;
        }
      }
    }

    if (newFailedItems.length > 0) {
      setFailedAutoPilotItems((prev) => [...newFailedItems, ...prev]);
      showToast(`Auto Pilot selesai dengan ${newFailedItems.length} kesalahan. Anda dapat menggunakan fitur "Ulangi Animasi Gagal".`, 'warn');
      addLog(`⚠️ [AUTO PILOT SELESAI] Terdapat ${newFailedItems.length} animasi yang mengalami kesalahan.`, 'warn');
    } else {
      showToast(`🏆 Auto Pilot [${accLabel}] Selesai dengan sempurna!`, 'success');
      addLog(`🏆 [AUTO PILOT SELESAI] Seluruh animasi [${accLabel}] berhasil diproses!`, 'success');
    }

    setIsAutoPilotRunning(false);
    addLog('═══════════════════════════════════════════════════════════════', 'cyan');
  };

  // Re-try failed animations from Auto Pilot sequentially
  const handleRetryFailedAutoPilot = async () => {
    if (failedAutoPilotItems.length === 0) {
      showToast('Tidak ada animasi gagal dari Auto Pilot.', 'info');
      return;
    }

    setIsAutoPilotRunning(true);
    const itemsToRetry = [...failedAutoPilotItems];
    const total = itemsToRetry.length;
    addLog('═══════════════════════════════════════════════════════════════', 'warn');
    addLog(`🔄 [ULANGI AUTO PILOT GAGAL] Mencoba ulang ${total} animasi yang sebelumnya mengalami kesalahan...`, 'warn');
    showToast(`🔄 Mencoba ulang ${total} animasi Auto Pilot yang gagal...`, 'info');

    let currentAnimList = [...animations];
    let remainingFailed: FailedAutoPilotItem[] = [];

    for (let i = 0; i < total; i++) {
      const item = itemsToRetry[i];
      addLog(`⚡ [Coba Ulang Auto Pilot #${i + 1}/${total} - ${item.accountName}] Memproses "${item.prompt.substring(0, 30)}..."`, 'info');

      try {
        const anim = await generateSingleAnimationCode(
          apiKeys,
          selectedModel,
          item.prompt,
          item.type,
          item.subCategory,
          item.style,
          i + 1,
          total,
          undefined,
          3,
          item.isGreenScreen ?? false,
          item.colorMode ?? 'gradient',
          item.motionDynamics ?? 'flow',
          item.neonGlow ?? true
        );

        if (anim) {
          const newAnimItem: AnimationItem = {
            ...anim,
            account: item.accountName,
            createdAt: Date.now(),
          };
          currentAnimList = [newAnimItem, ...currentAnimList];
          saveAnimationsToStorage(currentAnimList);
          addLog(`✅ [Sukses Diperbaiki] [${item.accountName}] Animasi selesai & disimpan ke Galeri!`, 'success');
          showToast(`✅ [${item.accountName}] Animasi berhasil diperbaiki!`, 'success');
        }
      } catch (e: any) {
        addLog(`❌ [Masih Kendala] [${item.accountName}]: ${e.message}`, 'error');
        remainingFailed.push({ ...item, error: e.message || 'Masih kendala saat dicoba ulang' });
        await new Promise((res) => setTimeout(res, 2000));
      }
    }

    setFailedAutoPilotItems(remainingFailed);
    setIsAutoPilotRunning(false);

    if (remainingFailed.length === 0) {
      showToast('🎉 Semua animasi gagal Auto Pilot berhasil diperbaiki!', 'success');
      addLog('🏁 [SELESAI COBA ULANG] Seluruh animasi gagal Auto Pilot telah berhasil diperbaiki!', 'success');
    } else {
      showToast(`Tersisa ${remainingFailed.length} animasi Auto Pilot yang masih kendala.`, 'warn');
    }
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
        bitrate: 18,
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

  // --- HANDLERS: IMAGE TO MOTION (AI VISION) ---
  const persistI2mItems = (items: ImageToMotionItem[]) => {
    try {
      const seen = new Set<string>();
      const uniqueItems = items.filter((item) => {
        if (!item || !item.id || seen.has(item.id)) return false;
        seen.add(item.id);
        return true;
      });
      localStorage.setItem(STORAGE_I2M_ITEMS, JSON.stringify(uniqueItems.slice(0, 200)));
    } catch (e) {
      console.error('Failed to save i2m items', e);
    }
  };

  const handleAddAnimation = useCallback((newAnim: AnimationItem) => {
    setAnimations((prev) => {
      const exists = prev.some((a) => a.id === newAnim.id);
      const updated = exists
        ? prev.map((a) => (a.id === newAnim.id ? newAnim : a))
        : [newAnim, ...prev];
      const trimmed = updated.slice(0, 300);
      try {
        localStorage.setItem(STORAGE_ANIMATIONS, JSON.stringify(trimmed));
      } catch (e) {
        console.error('Failed to save animations', e);
      }
      return trimmed;
    });
  }, []);

  const handlePreviewAnimation = useCallback((anim: AnimationItem) => {
    handleAddAnimation(anim);
  }, [handleAddAnimation]);

  const handleAddI2mItems = (newItems: ImageToMotionItem[]) => {
    setI2mItems((prev) => {
      const existingIds = new Set(prev.map((i) => i.id));
      const uniqueNew = newItems.filter((i) => i && i.id && !existingIds.has(i.id));
      const updated = [...uniqueNew, ...prev];
      persistI2mItems(updated);
      return updated;
    });
  };

  const handleUpdateI2mItem = (itemId: string, updates: Partial<ImageToMotionItem>) => {
    setI2mItems((prev) => {
      const next = prev.map((item) => (item.id === itemId ? { ...item, ...updates } : item));
      persistI2mItems(next);
      return next;
    });
  };

  const handleDeleteI2mItem = (itemId: string) => {
    setI2mItems((prev) => {
      const updated = prev.filter((i) => i.id !== itemId);
      persistI2mItems(updated);
      return updated;
    });
    showToast('Gambar dihapus dari antrian', 'info');
  };

  const handleClearAllI2mItems = () => {
    setI2mItems([]);
    persistI2mItems([]);
    showToast('Semua antrian gambar berhasil dibersihkan', 'info');
  };

  const handleClearCompletedI2mItems = () => {
    setI2mItems((prev) => {
      const updated = prev.filter((i) => i.status !== 'completed');
      persistI2mItems(updated);
      return updated;
    });
    showToast('Antrian selesai berhasil dibersihkan', 'info');
  };

  const latestAnimation = animations.length > 0 ? animations[0] : null;

  // --- LICENSE & TRIAL GATE CHECK ---
  const isUnlocked = isLicenseActive || isTrialActive;

  if (!isUnlocked) {
    return (
      <LicenseGate
        onUnlockSuccess={() => {
          setIsLicenseActive(true);
          setIsTrialActive(false);
          showToast('Selamat! Lisensi Seumur Hidup Berhasil Diaktifkan!', 'success');
        }}
        onUnlockTrial={(expiresAt) => {
          setIsTrialActive(true);
          setTrialExpiresAt(expiresAt);
          setTrialRemainingMs(Math.max(0, expiresAt - Date.now()));
          showToast('Mode Trial 1 Hari (24 Jam) Aktif! Selamat mencoba.', 'success');
        }}
      />
    );
  }

  return (
    <div className="min-h-screen flex flex-col justify-between selection:bg-sky-500 selection:text-white bg-[#0b0f19]">
      {/* Header */}
      <Header
        apiKeyCount={apiKeys.length}
        hasServerKey={hasServerKey}
        animationCount={animations.length}
        selectedModel={selectedModel}
        isTrialActive={isTrialActive && !isLicenseActive}
        trialRemainingText={formatRemainingTime(trialRemainingMs)}
        activeTab={activeTab}
        onSelectTab={handleSelectTab}
        onOpenLicenseModal={() => setIsUpgradeModalOpen(true)}
        onOpenApiModal={() => setIsApiModalOpen(true)}
        onOpenAutoPilotModal={() => {
          if (activeTab === 'image_to_motion') {
            setIsImageAutoPilotModalOpen(true);
          } else {
            setIsPromptAutoPilotModalOpen(true);
          }
        }}
        onOpenVideoConverterModal={() => setIsVideoConverterModalOpen(true)}
        onOpenGalleryModal={() => setIsGalleryModalOpen(true)}
        onOpenTutorialModal={() => setIsTutorialModalOpen(true)}
      />

      {/* Prominent Mobile & Tablet Navigation Switcher */}
      <div className="max-w-7xl mx-auto px-3 sm:px-6 pt-3 pb-1 md:hidden w-full">
        <div className="grid grid-cols-2 gap-2 bg-slate-950/90 p-1.5 rounded-2xl border border-gray-800">
          <button
            onClick={() => handleSelectTab('prompt')}
            className={`py-2 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'prompt'
                ? 'bg-gradient-to-r from-sky-600 to-indigo-600 text-white shadow-md'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            <i className="fa-solid fa-sliders text-xs"></i>
            <span>Prompt AI</span>
          </button>

          <button
            onClick={() => handleSelectTab('image_to_motion')}
            className={`py-2 px-3 rounded-xl text-xs font-black transition flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'image_to_motion'
                ? 'bg-gradient-to-r from-amber-500 to-yellow-400 text-slate-950 shadow-lg'
                : 'text-amber-300 hover:text-amber-100'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
            <i className="fa-solid fa-wand-magic-sparkles text-xs"></i>
            <span>IMAGE TO MOTION</span>
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto px-3 sm:px-6 py-3 sm:py-5 flex-1 w-full grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6">
        {/* Left Panel: Workflow OR Image to Motion */}
        {activeTab === 'prompt' ? (
          <div className="lg:col-span-5 flex flex-col gap-4">
            {/* Sidebar Tambahan: 2 Menu Besar Prompt AI */}
            <div className="glass-card rounded-2xl p-2.5 sm:p-3 border border-gray-800 bg-slate-950/75 shadow-xl space-y-2">
              <div className="flex items-center justify-between px-1">
                <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                  <i className="fa-solid fa-layer-group text-sky-400 text-xs"></i>
                  <span>Menu Utama Prompt AI</span>
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsTutorialModalOpen(true)}
                    className="text-[10px] font-bold text-emerald-400 hover:text-emerald-300 transition flex items-center gap-1 cursor-pointer"
                    title="Buka panduan lengkap fitur Prompt AI"
                  >
                    <i className="fa-solid fa-circle-question"></i>
                    <span>Panduan</span>
                  </button>
                  <span className="text-[9px] font-bold text-sky-300 bg-sky-950/80 border border-sky-800/60 px-2 py-0.5 rounded-full">
                    2 Mode
                  </span>
                </div>
              </div>

              {/* 2 Big Menus */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {/* Menu 1: Prompt to Motion */}
                <button
                  type="button"
                  onClick={() => handleSelectPromptSubTab('prompt_to_motion')}
                  className={`p-3 rounded-xl border text-left transition flex items-start gap-2.5 cursor-pointer relative overflow-hidden group ${
                    promptSubTab === 'prompt_to_motion'
                      ? 'bg-gradient-to-br from-sky-500/20 via-indigo-500/15 to-slate-900 border-sky-400 text-white shadow-lg shadow-sky-500/15 ring-1 ring-sky-400/40'
                      : 'bg-slate-900/40 border-gray-800/80 hover:border-gray-700 text-gray-400 hover:text-gray-200'
                  }`}
                >
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-sm font-black shrink-0 transition-transform group-hover:scale-105 ${
                    promptSubTab === 'prompt_to_motion'
                      ? 'bg-gradient-to-tr from-sky-500 to-indigo-600 text-white shadow-md shadow-sky-500/30'
                      : 'bg-slate-800 text-gray-400'
                  }`}>
                    <i className="fa-solid fa-wand-magic-sparkles"></i>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1">
                      <span className={`text-xs font-black tracking-tight ${promptSubTab === 'prompt_to_motion' ? 'text-sky-200' : 'text-gray-200'}`}>
                        1. Prompt to Motion
                      </span>
                      <span className="text-[8px] px-1.5 py-0.2 rounded font-bold uppercase tracking-wider bg-sky-950 text-sky-300 border border-sky-800/60">
                        Generator
                      </span>
                    </div>
                    <p className="text-[10px] text-gray-400 mt-0.5 line-clamp-2 leading-tight">
                      Parameter visual & input/drag-drop notepad batch (.txt)
                    </p>
                  </div>
                </button>

                {/* Menu 2: Image To Prompt Motion */}
                <button
                  type="button"
                  onClick={() => handleSelectPromptSubTab('image_to_prompt')}
                  className={`p-3 rounded-xl border text-left transition flex items-start gap-2.5 cursor-pointer relative overflow-hidden group ${
                    promptSubTab === 'image_to_prompt'
                      ? 'bg-gradient-to-br from-indigo-500/20 via-purple-500/15 to-slate-900 border-indigo-400 text-white shadow-lg shadow-indigo-500/15 ring-1 ring-indigo-400/40'
                      : 'bg-slate-900/40 border-gray-800/80 hover:border-gray-700 text-gray-400 hover:text-gray-200'
                  }`}
                >
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-sm font-black shrink-0 transition-transform group-hover:scale-105 ${
                    promptSubTab === 'image_to_prompt'
                      ? 'bg-gradient-to-tr from-indigo-500 to-purple-600 text-white shadow-md shadow-indigo-500/30'
                      : 'bg-slate-800 text-gray-400'
                  }`}>
                    <i className="fa-solid fa-file-waveform"></i>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1">
                      <span className={`text-xs font-black tracking-tight ${promptSubTab === 'image_to_prompt' ? 'text-indigo-200' : 'text-gray-200'}`}>
                        2. Image To Prompt
                      </span>
                      <span className="text-[8px] px-1.5 py-0.2 rounded font-bold uppercase tracking-wider bg-purple-950 text-purple-300 border border-purple-800/60">
                        Vision AI
                      </span>
                    </div>
                    <p className="text-[10px] text-gray-400 mt-0.5 line-clamp-2 leading-tight">
                      Analisa gambar per project & unduh notepad prompt murni
                    </p>
                  </div>
                </button>
              </div>
            </div>

            {/* Active Sub-Menu View */}
            {promptSubTab === 'prompt_to_motion' ? (
              <WorkflowSection
                currentType={currentType}
                onSelectType={setCurrentType}
                nicheCategory={nicheCategory}
                onSelectNiche={setNicheCategory}
                visualStyle={visualStyle}
                onSelectStyle={setVisualStyle}
                colorMode={colorMode}
                onSelectColorMode={setColorMode}
                motionDynamics={motionDynamics}
                onSelectMotionDynamics={setMotionDynamics}
                neonGlow={neonGlow}
                onToggleNeonGlow={setNeonGlow}
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
                onProcessNotepadBatches={handleProcessNotepadBatches}
                onClearPrompts={() => {
                  setGeneratedPrompts([]);
                  showToast('Daftar prompt siap render berhasil di-reset.', 'info');
                }}
                failedPrompts={failedPrompts}
                onRetryFailedPrompts={handleRetryFailedPrompts}
                onRetrySinglePrompt={handleRetrySinglePrompt}
                showToast={showToast}
              />
            ) : (
              <ImageToPromptSection
                apiKeys={apiKeys}
                selectedModel={selectedModel}
                onSendToPromptToMotion={handleSendPromptsToWorkflow}
                showToast={showToast}
                addLog={addLog}
              />
            )}
          </div>
        ) : (
          <ImageToMotionSection
            apiKeys={apiKeys}
            selectedModel={selectedModel}
            items={i2mItems}
            autoPilotAccounts={i2mAutoPilotAccounts}
            autoPilotTriggerToken={autoPilotTriggerToken}
            onOpenAutoPilotModal={() => setIsImageAutoPilotModalOpen(true)}
            onAddItems={handleAddI2mItems}
            onUpdateItem={handleUpdateI2mItem}
            onDeleteItem={handleDeleteI2mItem}
            onDeleteAccount={handleDeleteI2mAccount}
            onClearAllItems={handleClearAllI2mItems}
            onClearCompletedItems={handleClearCompletedI2mItems}
            onAddAnimation={handleAddAnimation}
            onPreviewAnimation={handlePreviewAnimation}
            onOpenFullscreen={(item) => setFullscreenItem(item)}
            showToast={showToast}
            addLog={addLog}
          />
        )}

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
      <footer className="glass-card border-t border-gray-800/80 px-4 py-3 text-center text-xs text-gray-500">
        <p>BigMA &copy; 2026. Motion Graphic AI Optimation.</p>
      </footer>

      {/* Modals */}
      {isUpgradeModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="relative max-w-md w-full my-auto">
            <button
              onClick={() => setIsUpgradeModalOpen(false)}
              className="absolute top-2 right-2 z-20 w-8 h-8 rounded-full bg-gray-900 border border-gray-700 text-gray-300 hover:text-white flex items-center justify-center text-xs shadow-xl cursor-pointer"
              title="Tutup"
            >
              <i className="fa-solid fa-xmark"></i>
            </button>
            <LicenseGate
              onUnlockSuccess={() => {
                setIsLicenseActive(true);
                setIsTrialActive(false);
                setIsUpgradeModalOpen(false);
                showToast('Selamat! Lisensi Seumur Hidup Berhasil Diaktifkan!', 'success');
              }}
            />
          </div>
        </div>
      )}

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

      {/* Prompt AI Auto Pilot Modal (Original) */}
      <AutoPilotModal
        isOpen={isPromptAutoPilotModalOpen}
        accounts={autoPilotAccounts}
        onAddAccount={handleAddAccount}
        onRemoveAccount={handleRemoveAccount}
        onUpdateAccount={handleUpdateAccount}
        onStartAutoPilot={handleStartAutoPilot}
        isAutoPilotRunning={isAutoPilotRunning}
        onClose={() => setIsPromptAutoPilotModalOpen(false)}
        failedItems={failedAutoPilotItems}
        onRetryFailedItems={handleRetryFailedAutoPilot}
      />

      {/* Image to Prompt / Motion Auto Pilot Modal (Drag & Drop + Import dari Komputer) */}
      <ImageAutoPilotModal
        isOpen={isImageAutoPilotModalOpen}
        onClose={() => setIsImageAutoPilotModalOpen(false)}
        accounts={i2mAutoPilotAccounts}
        onSaveAccounts={handleSaveI2mAccounts}
        onResetAccounts={handleResetI2mAccounts}
        onDeleteAccount={handleDeleteI2mAccount}
        onStartAutoPilot={handleStartI2mAutoPilot}
        isAutoPilotRunning={isAutoPilotRunning}
        showToast={showToast}
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

      <TutorialModal
        isOpen={isTutorialModalOpen}
        onClose={() => setIsTutorialModalOpen(false)}
        onNavigateToTab={(tab, subTab) => {
          handleSelectTab(tab);
          if (subTab) handleSelectPromptSubTab(subTab);
          setIsTutorialModalOpen(false);
        }}
        onOpenApiModal={() => {
          setIsTutorialModalOpen(false);
          setIsApiModalOpen(true);
        }}
      />

      {/* Toast Notifications */}
      <ToastContainer toasts={toasts} />
    </div>
  );
}
