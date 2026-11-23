import React, { useState, useEffect, useCallback, useRef } from 'react';
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
  generateBatchAnimationCodes,
  getKeyPoolCooldownStatus,
  buildModelFallbackChain,
  getAdaptiveModelPacingDelay,
  getModelCooldownRecoveryMs,
  getModelExecutionProfile,
  AllKeysExhaustedError,
  resetKeyHealthPool,
  resetKeyHealthForModelSwitch,
} from './services/geminiService';
import { renderHtmlToVideo } from './services/videoRenderer';
import { Header } from './components/Header';
import { WorkflowSection } from './components/WorkflowSection';
import { ImageToPromptSection } from './components/ImageToPromptSection';
import { ImageToMotionSection } from './components/ImageToMotionSection';
import { RightPanel } from './components/RightPanel';
import { ApiKeyModal } from './components/ApiKeyModal';
import { ModelRotationModal } from './components/ModelRotationModal';
import { AutoPilotModal, FailedAutoPilotItem } from './components/AutoPilotModal';
import { ImageAutoPilotModal } from './components/ImageAutoPilotModal';
import { GalleryModal } from './components/GalleryModal';
import { FullscreenModal } from './components/FullscreenModal';
import { TutorialModal } from './components/TutorialModal';
import { FailedAnimationsModal } from './components/FailedAnimationsModal';
import { ToastContainer, ToastMessage } from './components/Toast';
import { LicenseGate, STORAGE_LICENSE_ACTIVE } from './components/LicenseGate';
import { checkLocalTrialStatus, formatRemainingTime } from './services/trialService';
import { getDefaultCategoryForType } from './constants/categories';
import { detectDeviceHardware, HardwareProfile } from './services/hardwareService';
import {
  CompletedLedger,
  loadCompletedLedger,
  recordCompletedPrompt,
  removeCompletedPrompt,
  resetAccountCompletedLedger,
  syncLedgerFromAnimations,
  isPromptCompleted,
  getAccountCompletedCount,
  normalizeAccountKey,
  normalizePromptKey,
  filterPendingFailedItems,
  loadFailedAutoPilotItems,
  saveFailedAutoPilotItems,
} from './utils/autoPilotLedger';

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
  const [nicheCategory, setNicheCategory] = useState<NicheCategory>('business_finance');
  const [visualStyle, setVisualStyle] = useState<VisualStyle>('3d_crest');
  const [colorMode, setColorMode] = useState<ColorMode>('gradient');
  const [neonGlow, setNeonGlow] = useState<boolean>(true);
  const [promptCount, setPromptCount] = useState<number>(3);
  const [isGreenScreen, setIsGreenScreen] = useState<boolean>(false);
  const [keywordsText, setKeywordsText] = useState<string>('');

  const handleToggleNeonGlow = useCallback((nextVal: boolean) => {
    setNeonGlow(nextVal);
    if (nextVal) {
      setIsGreenScreen(false);
    }
  }, []);

  const handleToggleGreenScreen = useCallback((nextVal: boolean) => {
    if (currentType === 'bg') {
      setIsGreenScreen(false);
      return;
    }
    setIsGreenScreen(nextVal);
    if (nextVal) {
      setNeonGlow(false);
    }
  }, [currentType]);

  const [generatedPrompts, setGeneratedPrompts] = useState<string[]>([]);
  const [failedPrompts, setFailedPrompts] = useState<string[]>([]);
  const [failedAutoPilotItems, setFailedAutoPilotItems] = useState<FailedAutoPilotItem[]>(() => loadFailedAutoPilotItems());
  const failedAutoPilotItemsRef = useRef<FailedAutoPilotItem[]>(failedAutoPilotItems);
  failedAutoPilotItemsRef.current = failedAutoPilotItems;
  const [completedLedger, setCompletedLedger] = useState<CompletedLedger>(() => loadCompletedLedger());
  const completedLedgerRef = useRef<CompletedLedger>(completedLedger);
  completedLedgerRef.current = completedLedger;
  const [animations, setAnimations] = useState<AnimationItem[]>([]);
  const animationsRef = useRef<AnimationItem[]>(animations);
  animationsRef.current = animations;
  const [downloadQueue, setDownloadQueue] = useState<string[]>([]);
  const [exportBitrate, setExportBitrate] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('bigma_export_bitrate');
      if (saved) {
        const val = Number(saved);
        if (val > 0) return val;
      }
    } catch {}
    const hw = detectDeviceHardware();
    return hw.recommendedBitrate || 18;
  });

  const handleExportBitrateChange = (val: number) => {
    setExportBitrate(val);
    try {
      localStorage.setItem('bigma_export_bitrate', String(val));
    } catch {}
  };

  const [renderResolution, setRenderResolution] = useState<{ width: number; height: number; label: string }>(() => {
    try {
      const saved = localStorage.getItem('bigma_render_resolution');
      if (saved) return JSON.parse(saved);
    } catch {}
    const hw = detectDeviceHardware();
    return hw.recommendedResolution;
  });

  const handleResolutionChange = (res: { width: number; height: number; label: string }) => {
    setRenderResolution(res);
    try {
      localStorage.setItem('bigma_render_resolution', JSON.stringify(res));
    } catch {}
  };

  const [renderFps, setRenderFps] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('bigma_render_fps');
      if (saved) {
        const val = Number(saved);
        if (val > 0) return val;
      }
    } catch {}
    const hw = detectDeviceHardware();
    return hw.recommendedFps;
  });

  const handleFpsChange = (val: number) => {
    setRenderFps(val);
    try {
      localStorage.setItem('bigma_render_fps', String(val));
    } catch {}
  };

  const [renderDuration, setRenderDuration] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('bigma_render_duration');
      if (saved) {
        const val = Number(saved);
        if (val > 0) return val;
      }
    } catch {}
    return 10;
  });

  const handleDurationChange = (val: number) => {
    setRenderDuration(val);
    try {
      localStorage.setItem('bigma_render_duration', String(val));
    } catch {}
  };

  // Logs & Progress
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [progressShow, setProgressShow] = useState<boolean>(false);
  const [progressText, setProgressText] = useState<string>('');
  const [progressPercent, setProgressPercent] = useState<number>(0);

  // Loading States
  const [isGeneratingPrompts, setIsGeneratingPrompts] = useState<boolean>(false);
  const [isGeneratingAnimations, setIsGeneratingAnimations] = useState<boolean>(false);
  const [isAutoPilotRunning, setIsAutoPilotRunning] = useState<boolean>(false);
  const isAutoPilotRunningRef = useRef<boolean>(false);

  // Modals
  const [isApiModalOpen, setIsApiModalOpen] = useState<boolean>(false);
  const [isModelRotationModalOpen, setIsModelRotationModalOpen] = useState<boolean>(false);
  const [isPromptAutoPilotModalOpen, setIsPromptAutoPilotModalOpen] = useState<boolean>(false);
  const [isImageAutoPilotModalOpen, setIsImageAutoPilotModalOpen] = useState<boolean>(false);
  const [isGalleryModalOpen, setIsGalleryModalOpen] = useState<boolean>(false);
  const [isTutorialModalOpen, setIsTutorialModalOpen] = useState<boolean>(false);
  const [isFailedAnimationsModalOpen, setIsFailedAnimationsModalOpen] = useState<boolean>(false);
  const [fullscreenItem, setFullscreenItem] = useState<AnimationItem | null>(null);

  const handleModelQuotaExceeded = (_model: GeminiModel) => {
    setIsModelRotationModalOpen(true);
    addLog(`⚠️ [Rotasi Model AI] Semua API Key mencapai batas kuota pada model ${_model}. Membuka dialog konfirmasi rotasi model.`, 'warn');
    showToast(`Semua API Key limit pada model ${_model}. Silakan konfirmasi rotasi model.`, 'warn');
  };

  const handleConfirmModelSwitch = (newModel: GeminiModel) => {
    setSelectedModel(newModel);
    saveStoredModel(newModel);
    resetKeyHealthForModelSwitch(newModel);
    setIsModelRotationModalOpen(false);
    const activeLedger = syncLedgerFromAnimations(completedLedgerRef.current, animationsRef.current);
    completedLedgerRef.current = activeLedger;
    setCompletedLedger(activeLedger);
    const pendingFailed = filterPendingFailedItems(failedAutoPilotItemsRef.current, activeLedger, animationsRef.current);
    failedAutoPilotItemsRef.current = pendingFailed;
    setFailedAutoPilotItems(pendingFailed);
    saveFailedAutoPilotItems(pendingFailed);
    addLog(`✅ [Rotasi Model AI] Beralih ke ${newModel}. Sisa item gagal/tertunda siap lanjut: ${pendingFailed.length} (seluruh prompt selesai tetap terkunci aman).`, 'success');
    showToast(`Berhasil beralih ke model ${newModel}!`, 'success');
  };

  const handleConfirmModelSwitchAndRetry = (newModel: GeminiModel) => {
    setSelectedModel(newModel);
    saveStoredModel(newModel);
    resetKeyHealthForModelSwitch(newModel);
    setIsModelRotationModalOpen(false);
    const activeLedger = syncLedgerFromAnimations(completedLedgerRef.current, animationsRef.current);
    completedLedgerRef.current = activeLedger;
    setCompletedLedger(activeLedger);
    const pendingFailed = filterPendingFailedItems(failedAutoPilotItemsRef.current, activeLedger, animationsRef.current);
    failedAutoPilotItemsRef.current = pendingFailed;
    setFailedAutoPilotItems(pendingFailed);
    saveFailedAutoPilotItems(pendingFailed);
    addLog(`🔄 [Rotasi Model AI] Beralih ke ${newModel} & langsung melanjutkan hanya ${pendingFailed.length} item yang gagal/tertunda (prompt selesai dilewati otomatis)...`, 'cyan');
    showToast(`Beralih ke ${newModel} & melanjutkan sisa antrean gagal!`, 'info');
    if (pendingFailed.length > 0) {
      void handleRetryFailedAutoPilot(newModel);
    } else if (failedPrompts.length > 0) {
      void handleRetryFailedPrompts(newModel);
    }
  };

  // Auto Pilot Trigger Token for ImageToMotionSection
  const [autoPilotTriggerToken, setAutoPilotTriggerToken] = useState<number | undefined>(undefined);

  // Image to Motion Auto Pilot Accounts (Starts empty as requested: user adds custom names & images)
  const [i2mAutoPilotAccounts, setI2mAutoPilotAccounts] = useState<ImageToMotionAutoPilotAccount[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_I2M_AUTOPILOT_ACCOUNTS);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed.map((a: ImageToMotionAutoPilotAccount) => {
            const effGs = a.type === 'bg' ? false : !!a.isGreenScreen;
            return { ...a, isGreenScreen: effGs, neonGlow: effGs ? false : (a.neonGlow ?? true) };
          });
        }
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
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.map((a: AutoPilotAccount) => {
            const effGs = a.type === 'bg' ? false : !!a.isGreenScreen;
            return { ...a, isGreenScreen: effGs, neonGlow: effGs ? false : (a.neonGlow ?? true) };
          });
        }
      }
    } catch {}
    return [
      {
        id: 'acc_1',
        name: 'Account_1',
        type: 'icon',
        subCategory: 'business_finance',
        style: 'minimalist',
        promptCount: 2,
        neonGlow: true,
        isGreenScreen: false,
      },
    ];
  });
  const autoPilotAccountsRef = useRef<AutoPilotAccount[]>(autoPilotAccounts);
  autoPilotAccountsRef.current = autoPilotAccounts;

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
          const synced = syncLedgerFromAnimations(completedLedgerRef.current, parsed);
          completedLedgerRef.current = synced;
          setCompletedLedger(synced);
          setFailedAutoPilotItems((prev) => filterPendingFailedItems(prev, synced, parsed));
        }
      }
    } catch (e) {
      console.error('Failed to load animations from localStorage', e);
    }
  }, []);

  useEffect(() => {
    saveFailedAutoPilotItems(failedAutoPilotItems);
  }, [failedAutoPilotItems]);

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
    animationsRef.current = newAnims;
    setAnimations(newAnims);
    // Keep localStorage under ~2.2MB headroom so completedLedger & failedAutoPilotItems never face 5MB eviction
    const caps = [120, 80, 50, 25];
    for (const cap of caps) {
      try {
        localStorage.setItem(STORAGE_ANIMATIONS, JSON.stringify(newAnims.slice(0, cap)));
        return;
      } catch (e) {
        if (cap === caps[caps.length - 1]) {
          console.error('Failed to save animations', e);
        }
      }
    }
  };

  const handleResetAccountProgress = (accountName: string) => {
    const nextLedger = resetAccountCompletedLedger(completedLedgerRef.current, accountName);
    completedLedgerRef.current = nextLedger;
    setCompletedLedger(nextLedger);
    addLog(`🔄 [Auto Pilot] Riwayat prompt selesai untuk akun "${accountName}" di-reset.`, 'info');
    showToast(`Riwayat selesai akun "${accountName}" telah di-reset.`, 'info');
  };

  // --- HANDLERS: API KEYS ---
  const handleSaveApiKeys = (keys: string[], model: GeminiModel) => {
    setApiKeys(keys);
    setSelectedModel(model);
    saveStoredApiKeys(keys);
    saveStoredModel(model);
    resetKeyHealthPool();
    setIsApiModalOpen(false);

    const activeLedger = syncLedgerFromAnimations(completedLedgerRef.current, animationsRef.current);
    completedLedgerRef.current = activeLedger;
    setCompletedLedger(activeLedger);
    const pendingFailed = filterPendingFailedItems(failedAutoPilotItemsRef.current, activeLedger, animationsRef.current);
    failedAutoPilotItemsRef.current = pendingFailed;
    setFailedAutoPilotItems(pendingFailed);
    saveFailedAutoPilotItems(pendingFailed);

    if (keys.length > 0) {
      showToast(`${keys.length} API Key berhasil disimpan!`, 'success');
      addLog(`Tersimpan ${keys.length} API key Gemini. Model aktif: ${model}.${pendingFailed.length > 0 ? ` Sisa ${pendingFailed.length} prompt gagal siap dilanjutkan (prompt selesai tetap terkunci aman).` : ''}`, 'success');
    } else {
      showToast('API Key kosong. Mohon masukkan minimal 1 Key.', 'warn');
    }
  };

  // --- HANDLERS: PROMPTS ---
  const handleGeneratePrompts = async () => {
    const hasValidKey = apiKeys.some((k) => k && k.trim().replace(/[\r\n\t ]+/g, '').length > 5);
    if (!hasValidKey) {
      showToast('API Key Gemini belum diatur atau kosong. Silakan masukkan API Key Anda terlebih dahulu.', 'error');
      addLog('⚠️ Tindakan dibatalkan: Belum ada API Key Gemini aktif. Silakan buka menu "API Keys" di header.', 'error');
      setIsApiModalOpen(true);
      return;
    }

    setIsGeneratingPrompts(true);
    setProgressShow(true);
    setProgressText(`Menghasilkan ${promptCount} Prompt (satu per satu secara cepat)...`);
    setProgressPercent(2);
    setGeneratedPrompts([]);

    const keywordLines = keywordsText
      .split('\n')
      .map((k) => k.trim())
      .filter((k) => k.length > 0);

    const effGs = currentType !== 'bg' && isGreenScreen;
    const effGlow = effGs ? false : neonGlow;

    addLog(
      `⚡ Meminta AI generate ${promptCount} prompt animasi satu per satu (${currentType.toUpperCase()} - ${nicheCategory} - ${colorMode.toUpperCase()})${
        effGs ? ' [Green Screen]' : effGlow ? ' [Neon Glow]' : ''
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
        effGs,
        colorMode,
        'auto',
        effGlow,
        (singlePrompt, index, total) => {
          setGeneratedPrompts((prev) => {
            const next = [...prev];
            next[index] = singlePrompt;
            return next;
          });
          const percent = Math.round(((index + 1) / total) * 100);
          setProgressPercent(percent);
          setProgressText(`⚡ Prompt ${index + 1}/${total} (${percent}%) siap...`);
          addLog(`⚡ [Prompt #${index + 1}/${total}] ${singlePrompt.substring(0, 48)}...`, 'info');
        }
      );

      setGeneratedPrompts(prompts);
      setProgressPercent(100);
      addLog(`✅ Berhasil membuat total ${prompts.length} prompt AI (satu per satu secara cepat).`, 'success');
      showToast(`Berhasil membuat ${prompts.length} prompt AI!`, 'success');
    } catch (err: any) {
      if (err instanceof AllKeysExhaustedError || err?.isAllKeysExhausted) {
        handleModelQuotaExceeded(selectedModel);
      }
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
    const hasValidKey = apiKeys.some((k) => k && k.trim().replace(/[\r\n\t ]+/g, '').length > 5);
    if (!hasValidKey) {
      showToast('API Key Gemini belum diatur atau kosong. Silakan masukkan API Key Anda terlebih dahulu.', 'error');
      addLog('⚠️ Tindakan dibatalkan: Belum ada API Key Gemini aktif. Silakan buka menu "API Keys" di header.', 'error');
      setIsApiModalOpen(true);
      return;
    }

    if (generatedPrompts.length === 0) {
      showToast('Daftar prompt masih kosong.', 'warn');
      return;
    }

    setIsGeneratingAnimations(true);
    setFailedPrompts([]);
    const total = generatedPrompts.length;
    const pacingDelay = getAdaptiveModelPacingDelay(selectedModel, apiKeys.length);
    const modelProfile = getModelExecutionProfile(selectedModel);
    const BATCH_ANIM_SIZE = 1;
    addLog(`========== MEMULAI GENERATE ANIMASI (${total} ITEM • MODE 1-TO-1 DEDIKASI PENUH) ==========`, 'info');
    if (apiKeys.length <= 1) {
      addLog(`[Mode Presisi 1 Prompt = 1 Request + Pacing ${selectedModel}] Jeda ${(pacingDelay / 1000).toFixed(1)}s/item (jeda key ${(modelProfile.minKeyReuseGapMs / 1000).toFixed(1)}s, cooldown 429 ${(modelProfile.cooldownStepsMs[0] / 1000).toFixed(0)}s).`, 'cyan');
    } else {
      addLog(`[Rotasi ${apiKeys.length} API Key + Pacing ${selectedModel}] 1 Prompt = 1 Animasi Dedikasi (jeda ${(pacingDelay / 1000).toFixed(1)}s/item, jeda key ${(modelProfile.minKeyReuseGapMs / 1000).toFixed(1)}s, cooldown ${(modelProfile.cooldownStepsMs[0] / 1000).toFixed(0)}s).`, 'cyan');
    }

    let currentAnimList = [...animations];
    const caughtFailures: string[] = [];
    let quotaStopped = false;
    let consecutiveExhaustedBatches = 0;

    for (let i = 0; i < total; i += BATCH_ANIM_SIZE) {
      const slice = generatedPrompts.slice(i, i + BATCH_ANIM_SIZE);
      const endNum = Math.min(total, i + slice.length);
      const percent = Math.round((endNum / total) * 100);

      setProgressShow(true);
      setProgressText(`Menghasilkan Animasi #${i + 1} dari ${total}...`);
      setProgressPercent(percent);
      addLog(`Render Canvas #${i + 1}/${total}: "${slice[0].substring(0, 42)}..."`, 'info');

      const effGs = currentType !== 'bg' && isGreenScreen;
      const effGlow = effGs ? false : neonGlow;

      let results = await generateBatchAnimationCodes(
        apiKeys,
        selectedModel,
        slice,
        currentType,
        nicheCategory,
        visualStyle,
        i + 1,
        total,
        {
          isGreenScreen: effGs,
          colorMode,
          motionDynamics: 'auto',
          neonGlow: effGlow,
          onLog: (msg, lvl) => addLog(msg, lvl || 'warn'),
        }
      );

      if (results.every((r) => r.exhausted)) {
        const poolStatus = getKeyPoolCooldownStatus(apiKeys, buildModelFallbackChain(selectedModel));
        if (!poolStatus.availableNow && !poolStatus.allDailyExhausted && !poolStatus.allInvalid && poolStatus.earliestWaitMs > 0) {
          addLog(`⏳ Kuota RPM/TPM sementara penuh (${poolStatus.validKeys} key aktif) — menunggu pemulihan otomatis ${Math.ceil(poolStatus.earliestWaitMs / 1000)}s lalu mencoba #${i + 1} kembali...`, 'warn');
          await new Promise((res) => setTimeout(res, poolStatus.earliestWaitMs));
          results = await generateBatchAnimationCodes(
            apiKeys,
            selectedModel,
            slice,
            currentType,
            nicheCategory,
            visualStyle,
            i + 1,
            total,
            {
              isGreenScreen: effGs,
              colorMode,
              motionDynamics: 'auto',
              neonGlow: effGlow,
              onLog: (msg, lvl) => addLog(msg, lvl || 'warn'),
            }
          );
        }
      }

      let hadSuccessInBatch = false;
      let hadExhausted = false;
      for (let rIdx = 0; rIdx < results.length; rIdx++) {
        const res = results[rIdx];
        if (res.anim) {
          hadSuccessInBatch = true;
          const newAnimItem: AnimationItem = {
            ...res.anim,
            prompt: res.anim.prompt || res.prompt,
            isGreenScreen: res.anim.isGreenScreen ?? effGs,
            neonGlow: res.anim.neonGlow ?? effGlow,
            account: 'Manual',
            createdAt: Date.now(),
          };
          currentAnimList = [newAnimItem, ...currentAnimList];
          saveAnimationsToStorage(currentAnimList);
          addLog(`Berhasil merender animasi #${i + rIdx + 1}.`, 'success');
        } else {
          if (res.exhausted) hadExhausted = true;
          addLog(`Error pada animasi #${i + rIdx + 1}: ${res.error || 'Kendala API'}. Menyimpan untuk fitur coba ulang...`, 'error');
          caughtFailures.push(res.prompt);
          setFailedPrompts((prev) => [...prev, res.prompt]);
        }
      }

      if (hadSuccessInBatch) {
        consecutiveExhaustedBatches = 0;
      } else if (hadExhausted) {
        consecutiveExhaustedBatches++;
      }

      const poolAfter = hadExhausted ? getKeyPoolCooldownStatus(apiKeys, buildModelFallbackChain(selectedModel)) : null;
      const shouldStopForQuota =
        !!poolAfter &&
        (poolAfter.allDailyExhausted ||
          poolAfter.allInvalid ||
          (consecutiveExhaustedBatches >= 3 && !poolAfter.availableNow) ||
          consecutiveExhaustedBatches >= 5);

      if (shouldStopForQuota) {
        const remaining = generatedPrompts.slice(endNum);
        if (remaining.length > 0) {
          caughtFailures.push(...remaining);
          setFailedPrompts((prev) => [...prev, ...remaining]);
        }
        handleModelQuotaExceeded(selectedModel);
        quotaStopped = true;
        break;
      }

      if (endNum < total) {
        let extraBreath = 0;
        if (hadExhausted && poolAfter) {
          extraBreath = poolAfter.earliestWaitMs > 0 ? poolAfter.earliestWaitMs : (poolAfter.availableNow ? 1200 : getModelCooldownRecoveryMs(selectedModel));
          if (poolAfter.earliestWaitMs > 0) {
            addLog(`⏳ Semua key sedang pendinginan RPM/TPM — menunggu pemulihan ${Math.ceil(extraBreath / 1000)}s agar tetap bisa lanjut...`, 'warn');
          } else {
            addLog(`🔄 Masih ada ${poolAfter.readyPairs} jalur key sehat — jeda singkat ${(extraBreath / 1000).toFixed(1)}s lalu lanjut antrean berikutnya...`, 'cyan');
          }
        }
        await new Promise((res) => setTimeout(res, pacingDelay + extraBreath));
      }
    }

    setIsGeneratingAnimations(false);
    setProgressShow(false);

    if (quotaStopped) {
      addLog(`⏸️ Dihentikan sementara agar kuota harian API Key aman. ${caughtFailures.length} item tersimpan di "Ulangi yang Gagal".`, 'warn');
    } else if (caughtFailures.length > 0) {
      addLog(`========== SELESAI DENGAN ${caughtFailures.length} GAGAL (BISA DIULANG) ==========`, 'warn');
      showToast(`Selesai! ${caughtFailures.length} animasi gagal dibuat. Klik tombol "Ulangi yang Gagal" untuk mencoba kembali.`, 'warn');
    } else {
      addLog(`========== SELESAI MERENDER ${total} ANIMASI ==========`, 'success');
      showToast('Seluruh animasi selesai di-generate!', 'success');
    }
  };

  // Re-try all failed prompts in standard workflow
  const handleRetryFailedPrompts = async (overrideModel?: GeminiModel) => {
    const activeModel = overrideModel || selectedModel;
    const hasValidKey = apiKeys.some((k) => k && k.trim().replace(/[\r\n\t ]+/g, '').length > 5);
    if (!hasValidKey) {
      showToast('API Key Gemini belum diatur atau kosong. Silakan masukkan API Key Anda terlebih dahulu.', 'error');
      addLog('⚠️ Tindakan dibatalkan: Belum ada API Key Gemini aktif. Silakan buka menu "API Keys" di header.', 'error');
      setIsApiModalOpen(true);
      return;
    }

    if (failedPrompts.length === 0) {
      showToast('Tidak ada animasi yang gagal dibuat.', 'info');
      return;
    }

    setIsGeneratingAnimations(true);
    const promptsToRetry = [...failedPrompts];
    const total = promptsToRetry.length;
    const pacingDelay = getAdaptiveModelPacingDelay(activeModel, apiKeys.length);
    const BATCH_ANIM_SIZE = 1;
    addLog(`========== MENCOBA ULANG ${total} ANIMASI GAGAL (${activeModel} • MODE 1-PER-REQUEST) ==========`, 'warn');
    showToast(`Mencoba ulang ${total} animasi yang sebelumnya mengalami kendala...`, 'info');

    let currentAnimList = [...animations];
    const remainingFailed: string[] = [];
    let consecutiveExhaustedBatches = 0;

    for (let i = 0; i < total; i += BATCH_ANIM_SIZE) {
      const slice = promptsToRetry.slice(i, i + BATCH_ANIM_SIZE);
      const endNum = Math.min(total, i + slice.length);
      setProgressShow(true);
      setProgressText(`Mencoba Ulang #${i + 1}${slice.length > 1 ? `–#${endNum}` : ''} dari ${total}...`);
      setProgressPercent(Math.round((endNum / total) * 100));

      const effGs = currentType !== 'bg' && isGreenScreen;
      const effGlow = effGs ? false : neonGlow;

      let results = await generateBatchAnimationCodes(
        apiKeys,
        activeModel,
        slice,
        currentType,
        nicheCategory,
        visualStyle,
        i + 1,
        total,
        {
          isGreenScreen: effGs,
          colorMode,
          motionDynamics: 'auto',
          neonGlow: effGlow,
          onLog: (msg, lvl) => addLog(msg, lvl || 'warn'),
        }
      );

      if (results.every((r) => r.exhausted)) {
        const poolStatus = getKeyPoolCooldownStatus(apiKeys, buildModelFallbackChain(activeModel));
        if (!poolStatus.availableNow && !poolStatus.allDailyExhausted && !poolStatus.allInvalid && poolStatus.earliestWaitMs > 0) {
          addLog(`⏳ Menunggu pemulihan kuota RPM/TPM ${Math.ceil(poolStatus.earliestWaitMs / 1000)}s sebelum mencoba ulang #${i + 1}...`, 'warn');
          await new Promise((res) => setTimeout(res, poolStatus.earliestWaitMs));
          results = await generateBatchAnimationCodes(
            apiKeys,
            activeModel,
            slice,
            currentType,
            nicheCategory,
            visualStyle,
            i + 1,
            total,
            {
              isGreenScreen: effGs,
              colorMode,
              motionDynamics: 'auto',
              neonGlow: effGlow,
              onLog: (msg, lvl) => addLog(msg, lvl || 'warn'),
            }
          );
        }
      }

      let hadSuccess = false;
      let hadExhausted = false;
      for (let rIdx = 0; rIdx < results.length; rIdx++) {
        const res = results[rIdx];
        if (res.anim) {
          hadSuccess = true;
          const newAnimItem: AnimationItem = {
            ...res.anim,
            prompt: res.anim.prompt || res.prompt,
            isGreenScreen: res.anim.isGreenScreen ?? effGs,
            neonGlow: res.anim.neonGlow ?? effGlow,
            account: 'Manual Retry',
            createdAt: Date.now(),
          };
          currentAnimList = [newAnimItem, ...currentAnimList];
          saveAnimationsToStorage(currentAnimList);
          addLog(`[Sukses Diperbaiki] Prompt: "${res.prompt.substring(0, 35)}..." berhasil dirender!`, 'success');
        } else {
          if (res.exhausted) hadExhausted = true;
          addLog(`[Masih Kendala] Prompt #${i + rIdx + 1}: ${res.error || 'Kendala API'}`, 'error');
          remainingFailed.push(res.prompt);
        }
      }

      if (hadSuccess) consecutiveExhaustedBatches = 0;
      else if (hadExhausted) consecutiveExhaustedBatches++;

      const poolAfter = hadExhausted ? getKeyPoolCooldownStatus(apiKeys, buildModelFallbackChain(activeModel)) : null;
      const shouldStopForQuota =
        !!poolAfter &&
        (poolAfter.allDailyExhausted ||
          poolAfter.allInvalid ||
          (consecutiveExhaustedBatches >= 3 && !poolAfter.availableNow) ||
          consecutiveExhaustedBatches >= 5);

      if (shouldStopForQuota) {
        remainingFailed.push(...promptsToRetry.slice(endNum));
        handleModelQuotaExceeded(activeModel);
        break;
      }

      if (endNum < total) {
        const extraBreath = hadExhausted && poolAfter
          ? (poolAfter.earliestWaitMs > 0 ? poolAfter.earliestWaitMs : 1200)
          : 0;
        await new Promise((res) => setTimeout(res, pacingDelay + extraBreath));
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
    const hasValidKey = apiKeys.some((k) => k && k.trim().replace(/[\r\n\t ]+/g, '').length > 5);
    if (!hasValidKey) {
      showToast('API Key Gemini belum diatur atau kosong. Silakan masukkan API Key Anda terlebih dahulu.', 'error');
      addLog('⚠️ Tindakan dibatalkan: Belum ada API Key Gemini aktif. Silakan buka menu "API Keys" di header.', 'error');
      setIsApiModalOpen(true);
      return;
    }

    addLog(`[Coba Ulang Tunggal] Memproses prompt #${index + 1}: "${promptText.substring(0, 35)}..."`, 'info');
    showToast(`Mencoba ulang render animasi #${index + 1}...`, 'info');

    try {
      const effGs = currentType !== 'bg' && isGreenScreen;
      const effGlow = effGs ? false : neonGlow;

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
        effGs,
        colorMode,
        'auto',
        effGlow
      );

      if (anim) {
        const newAnimItem: AnimationItem = {
          ...anim,
          prompt: anim.prompt || promptText,
          isGreenScreen: anim.isGreenScreen ?? effGs,
          neonGlow: anim.neonGlow ?? effGlow,
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
    const normalized = accounts.map((acc) => {
      const effGs = acc.type === 'bg' ? false : !!acc.isGreenScreen;
      return { ...acc, isGreenScreen: effGs, neonGlow: effGs ? false : (acc.neonGlow ?? true) };
    });
    setI2mAutoPilotAccounts(normalized);
    try {
      localStorage.setItem(STORAGE_I2M_AUTOPILOT_ACCOUNTS, JSON.stringify(normalized));
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
      const effGs = acc.type === 'bg' ? false : !!acc.isGreenScreen;
      const effGlow = effGs ? false : (acc.neonGlow ?? true);
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
          type: acc.type || 'icon',
          motionDynamics: 'auto',
          colorMode: acc.colorMode || 'gradient',
          neonGlow: effGlow,
          isGreenScreen: effGs,
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
      const merged: AutoPilotAccount = { ...next[index], ...updated };
      if (merged.type === 'bg') {
        merged.isGreenScreen = false;
      }
      if ('isGreenScreen' in updated && updated.isGreenScreen) {
        merged.neonGlow = false;
      } else if ('neonGlow' in updated && updated.neonGlow) {
        merged.isGreenScreen = false;
      } else if (merged.isGreenScreen) {
        merged.neonGlow = false;
      }
      next[index] = merged;
      try {
        localStorage.setItem(STORAGE_AUTOPILOT_ACCOUNTS, JSON.stringify(next));
      } catch (e) {}
      return next;
    });
  };

  // --- HANDLERS: NOTEPAD BATCH GENERATION ---
  const handleProcessNotepadBatches = async (batches: NotepadBatch[]) => {
    if (batches.length === 0) return;

    const hasValidKey = apiKeys.some((k) => k && k.trim().replace(/[\r\n\t ]+/g, '').length > 5);
    if (!hasValidKey) {
      showToast('API Key Gemini belum diatur atau kosong. Silakan masukkan API Key Anda terlebih dahulu.', 'error');
      addLog('⚠️ Tindakan dibatalkan: Belum ada API Key Gemini aktif. Silakan buka menu "API Keys" di header.', 'error');
      setIsApiModalOpen(true);
      return;
    }

    setIsGeneratingAnimations(true);

    const totalPromptsOverall = batches.reduce((sum, b) => sum + b.prompts.length, 0);
    const pacingDelay = getAdaptiveModelPacingDelay(selectedModel, apiKeys.length);
    const BATCH_ANIM_SIZE = 1;
    let completedOverall = 0;
    let currentAnimList = [...animationsRef.current];
    let stopAll = false;

    addLog('═══════════════════════════════════════════════════════════════', 'cyan');
    addLog(
      `🚀 [BATCH NOTEPAD 1-TO-1] Memulai generate ${batches.length} file Notepad (${totalPromptsOverall} prompt) dengan 1 prompt = 1 render dedikasi...`,
      'cyan'
    );
    showToast(`🚀 Memulai generate animasi dari ${batches.length} file Notepad...`, 'info');

    let consecutiveExhaustedBatches = 0;
    for (let bIdx = 0; bIdx < batches.length && !stopAll; bIdx++) {
      const batch = batches[bIdx];
      addLog(`📁 [Notepad ${bIdx + 1}/${batches.length}] Memproses file: "${batch.fileName}" (${batch.prompts.length} prompt)...`, 'info');

      for (let pIdx = 0; pIdx < batch.prompts.length; pIdx += BATCH_ANIM_SIZE) {
        const slice = batch.prompts.slice(pIdx, pIdx + BATCH_ANIM_SIZE);
        const endNum = Math.min(batch.prompts.length, pIdx + slice.length);
        completedOverall += slice.length;
        const percent = Math.round((completedOverall / totalPromptsOverall) * 100);

        setProgressShow(true);
        setProgressText(`[${batch.name}] Prompt ${pIdx + 1}${slice.length > 1 ? `–${endNum}` : ''}/${batch.prompts.length} (${completedOverall}/${totalPromptsOverall})...`);
        setProgressPercent(percent);

        const effGs = currentType !== 'bg' && isGreenScreen;
        const effGlow = effGs ? false : neonGlow;

        let results = await generateBatchAnimationCodes(
          apiKeys,
          selectedModel,
          slice,
          currentType,
          nicheCategory,
          visualStyle,
          pIdx + 1,
          batch.prompts.length,
          {
            isGreenScreen: effGs,
            colorMode,
            motionDynamics: 'auto',
            neonGlow: effGlow,
            onLog: (msg, lvl) => addLog(msg, lvl || 'warn'),
          }
        );

        if (results.every((r) => r.exhausted)) {
          const poolStatus = getKeyPoolCooldownStatus(apiKeys, buildModelFallbackChain(selectedModel));
          if (!poolStatus.availableNow && !poolStatus.allDailyExhausted && !poolStatus.allInvalid && poolStatus.earliestWaitMs > 0) {
            addLog(`⏳ [${batch.name}] Pendinginan kuota RPM/TPM sementara — menunggu ${Math.ceil(poolStatus.earliestWaitMs / 1000)}s...`, 'warn');
            await new Promise((res) => setTimeout(res, poolStatus.earliestWaitMs));
            results = await generateBatchAnimationCodes(
              apiKeys,
              selectedModel,
              slice,
              currentType,
              nicheCategory,
              visualStyle,
              pIdx + 1,
              batch.prompts.length,
              {
                isGreenScreen: effGs,
                colorMode,
                motionDynamics: 'auto',
                neonGlow: effGlow,
                onLog: (msg, lvl) => addLog(msg, lvl || 'warn'),
              }
            );
          }
        }

        let hadSuccess = false;
        let hadExhausted = false;
        for (let rIdx = 0; rIdx < results.length; rIdx++) {
          const res = results[rIdx];
          if (res.anim) {
            hadSuccess = true;
            const newAnimItem: AnimationItem = {
              ...res.anim,
              prompt: res.anim.prompt || res.prompt,
              isGreenScreen: res.anim.isGreenScreen ?? effGs,
              neonGlow: res.anim.neonGlow ?? effGlow,
              account: batch.name,
              createdAt: Date.now(),
            };
            currentAnimList = [newAnimItem, ...currentAnimList];
            saveAnimationsToStorage(currentAnimList);
            addLog(`✅ [${batch.name}] Sukses render #${pIdx + rIdx + 1}: "${res.prompt.substring(0, 30)}..."`, 'success');
          } else {
            if (res.exhausted) hadExhausted = true;
            addLog(`❌ [${batch.name}] Gagal prompt #${pIdx + rIdx + 1}: ${res.error || 'Kendala API'}`, 'error');
            setFailedPrompts((prev) => [...prev, res.prompt]);
          }
        }

        if (hadSuccess) consecutiveExhaustedBatches = 0;
        else if (hadExhausted) consecutiveExhaustedBatches++;

        const poolAfter = hadExhausted ? getKeyPoolCooldownStatus(apiKeys, buildModelFallbackChain(selectedModel)) : null;
        const shouldStopForQuota =
          !!poolAfter &&
          (poolAfter.allDailyExhausted ||
            poolAfter.allInvalid ||
            (consecutiveExhaustedBatches >= 3 && !poolAfter.availableNow) ||
            consecutiveExhaustedBatches >= 5);

        if (shouldStopForQuota) {
          const remainingPrompts = batch.prompts.slice(endNum);
          if (remainingPrompts.length > 0) {
            setFailedPrompts((prev) => [...prev, ...remainingPrompts]);
          }
          handleModelQuotaExceeded(selectedModel);
          stopAll = true;
          break;
        }

        if (completedOverall < totalPromptsOverall) {
          const extraBreath = hadExhausted && poolAfter
            ? (poolAfter.earliestWaitMs > 0 ? poolAfter.earliestWaitMs : 1200)
            : 0;
          await new Promise((res) => setTimeout(res, pacingDelay + extraBreath));
        }
      }
    }

    setIsGeneratingAnimations(false);
    setProgressShow(false);
    addLog('🏁 [SELESAI BATCH NOTEPAD] Proses Notepad selesai & hasil tersimpan di Galeri!', 'cyan');
    showToast(`🏁 Selesai! Animasi dari ${batches.length} file Notepad telah tersimpan di Galeri!`, 'success');
  };

  const handleSendPromptsToWorkflow = (prompts: string[]) => {
    setGeneratedPrompts((prev) => [...prompts, ...prev]);
    setPromptSubTab('prompt_to_motion');
    showToast(`${prompts.length} prompt berhasil dimuat ke daftar siap render!`, 'success');
  };

  // Run Auto Pilot batch sequentially account by account (2-in-1 batching + auto cooldown wait — never repeats completed prompts!)
  const handleStartAutoPilot = async (targetAccountName: string = 'ALL') => {
    const accountsSnapshot = autoPilotAccountsRef.current;
    const accountsToRun = targetAccountName === 'ALL'
      ? accountsSnapshot
      : accountsSnapshot.filter((a) => a.name === targetAccountName);

    if (accountsToRun.length === 0) {
      showToast('Daftar akun Auto Pilot masih kosong!', 'warn');
      return;
    }
    if (isAutoPilotRunningRef.current || isAutoPilotRunning) {
      showToast('Auto Pilot sedang berjalan!', 'warn');
      return;
    }

    const hasValidKey = apiKeys.some((k) => k && k.trim().replace(/[\r\n\t ]+/g, '').length > 5);
    if (!hasValidKey) {
      showToast('API Key Gemini belum diatur atau kosong. Silakan masukkan API Key Anda terlebih dahulu.', 'error');
      addLog('⚠️ Tindakan dibatalkan: Belum ada API Key Gemini aktif. Silakan buka menu "API Keys" di header.', 'error');
      setIsApiModalOpen(true);
      return;
    }

    isAutoPilotRunningRef.current = true;
    setIsAutoPilotRunning(true);
    setIsPromptAutoPilotModalOpen(false);
    const accLabel = targetAccountName === 'ALL' ? 'Semua Akun' : `Akun: "${targetAccountName}"`;
    addLog('═══════════════════════════════════════════════════════════════', 'cyan');
    addLog(`🚀 [AUTO PILOT PRESISI - ${accLabel}] Mode 1 Prompt = 1 Animasi Dedikasi & Anti-Skip Cooldown aktif...`, 'cyan');
    showToast(`🚀 Auto Pilot [${accLabel}] Dimulai!`, 'info');
    setIsGalleryModalOpen(true);

    let currentAnimList = [...animationsRef.current];
    let activeLedger = syncLedgerFromAnimations(completedLedgerRef.current, currentAnimList);
    completedLedgerRef.current = activeLedger;
    setCompletedLedger(activeLedger);
    const newFailedItems: FailedAutoPilotItem[] = [];
    const BATCH_ANIM_SIZE = 1;
    const pacingDelay = getAdaptiveModelPacingDelay(selectedModel, apiKeys.length);
    const modelProfile = getModelExecutionProfile(selectedModel);
    addLog(`⏱️ [Pacing Model ${selectedModel}] Jeda ${(pacingDelay / 1000).toFixed(1)}s/item • Jeda antar key ${(modelProfile.minKeyReuseGapMs / 1000).toFixed(1)}s • Cooldown 429 ${(modelProfile.cooldownStepsMs[0] / 1000).toFixed(0)}s/${(modelProfile.cooldownStepsMs[1] / 1000).toFixed(0)}s agar kualitas presisi & bebas kemiripan.`, 'cyan');
    let stopAllForQuota = false;

    try {
      for (let i = 0; i < accountsToRun.length && !stopAllForQuota; i++) {
        const acc = accountsToRun[i];
        const accGs = acc.type !== 'bg' && !!acc.isGreenScreen;
        const accGlow = accGs ? false : (acc.neonGlow ?? true);
        let prompts: string[] = [];

        const hasCustomPrompts = acc.promptSource === 'custom' && Array.isArray(acc.customPrompts) && acc.customPrompts.length > 0;

        if (hasCustomPrompts) {
          const seenAccPrompts = new Set<string>();
          const uniqueCustom = acc.customPrompts!.filter((p) => {
            const nk = normalizePromptKey(p);
            if (!nk || seenAccPrompts.has(nk)) return false;
            seenAccPrompts.add(nk);
            return true;
          });
          prompts = uniqueCustom.filter((p) => !isPromptCompleted(activeLedger, currentAnimList, acc.name, p));
          const skippedExisting = uniqueCustom.length - prompts.length;
          addLog(
            `📂 [Antrian Akun #${i + 1}/${accountsToRun.length}: ${acc.name}] Total ${uniqueCustom.length} prompt unik${
              skippedExisting > 0 ? ` (${skippedExisting} sudah selesai tercatat -> dilewati otomatis, sisa ${prompts.length})` : ''
            }...`,
            'cyan'
          );
          if (prompts.length === 0) {
            addLog(`✅ [${acc.name}] Seluruh prompt sudah berhasil selesai — langsung lanjut akun berikutnya.`, 'success');
            continue;
          }
        } else {
          const alreadyDoneAi = getAccountCompletedCount(activeLedger, currentAnimList, acc.name);
          const remainingTarget = Math.max(0, (acc.promptCount || 0) - alreadyDoneAi);
          if (remainingTarget === 0) {
            addLog(`✅ [Antrian Akun #${i + 1}/${accountsToRun.length}: ${acc.name}] Target ${acc.promptCount} animasi sudah terpenuhi (${alreadyDoneAi} selesai) — langsung lanjut akun berikutnya.`, 'success');
            continue;
          }

          const pendingConcreteForAcc = filterPendingFailedItems(
            failedAutoPilotItemsRef.current,
            activeLedger,
            currentAnimList
          ).filter(
            (it) =>
              normalizeAccountKey(it.accountName) === normalizeAccountKey(acc.name) &&
              !(it.isAutoPromptPending || it.prompt.startsWith('(Auto Prompt:') || it.prompt.startsWith('(Generate Prompts:'))
          );
          const reusedConcrete = pendingConcreteForAcc.slice(0, remainingTarget).map((it) => it.prompt);
          const needFreshCount = Math.max(0, remainingTarget - reusedConcrete.length);
          if (reusedConcrete.length > 0) {
            addLog(
              `♻️ [Antrian Akun #${i + 1}/${accountsToRun.length}: ${acc.name}] Melanjutkan ${reusedConcrete.length} prompt tertunda/gagal sebelumnya${needFreshCount > 0 ? ` + generate ${needFreshCount} prompt baru` : ''}...`,
              'cyan'
            );
          }

          if (needFreshCount === 0) {
            prompts = reusedConcrete;
          } else {
            addLog(`⚡ [Antrian Akun #${i + 1}/${accountsToRun.length}: ${acc.name}] Meminta AI generate ${needFreshCount} prompt${alreadyDoneAi > 0 ? ` (${alreadyDoneAi} sudah selesai sebelumnya)` : ''}...`, 'info');

            try {
              const rawGen = await generatePromptsViaGemini(
                apiKeys,
                selectedModel,
                acc.type,
                acc.subCategory,
                acc.style,
                needFreshCount,
                undefined,
                accGs,
                acc.colorMode ?? 'gradient',
                'auto',
                accGlow,
                (singlePrompt, index, total) => {
                  if ((index + 1) % 5 === 0 || index === 0 || index === total - 1) {
                    addLog(`⚡ [${acc.name}] Siap prompt #${index + 1}/${total}: "${singlePrompt.substring(0, 38)}..."`, 'info');
                  }
                }
              );
              const reusedSet = new Set(reusedConcrete.map((p) => normalizePromptKey(p)));
              const freshFiltered = rawGen.filter(
                (gp) => !isPromptCompleted(activeLedger, currentAnimList, acc.name, gp) && !reusedSet.has(normalizePromptKey(gp))
              );
              prompts = [...reusedConcrete, ...freshFiltered];
              addLog(`✅ [${acc.name}] Berhasil menyiapkan ${prompts.length} prompt unik. Memulai render 1-per-request (anti-kemiripan)...`, 'success');
              await new Promise((res) => setTimeout(res, 400));
            } catch (e: any) {
              addLog(`❌ [${acc.name}] Gagal generate prompt: ${e.message}`, 'error');
              reusedConcrete.forEach((rp, rIdx) => {
                newFailedItems.push({
                  id: 'fail_reused_' + Date.now() + '_' + i + '_' + rIdx,
                  accountName: acc.name,
                  prompt: rp,
                  type: acc.type,
                  subCategory: acc.subCategory,
                  style: acc.style,
                  isGreenScreen: accGs,
                  colorMode: acc.colorMode ?? 'gradient',
                  motionDynamics: 'auto',
                  neonGlow: accGlow,
                  error: 'Tertunda karena kuota penuh saat melengkapi prompt baru — siap dicoba ulang',
                });
              });
              newFailedItems.push({
                id: 'fail_p_' + Date.now() + '_' + i,
                accountName: acc.name,
                prompt: `(Auto Prompt: ${needFreshCount} animasi ${acc.type} - ${acc.subCategory})`,
                type: acc.type,
                subCategory: acc.subCategory,
                style: acc.style,
                isGreenScreen: accGs,
                colorMode: acc.colorMode ?? 'gradient',
                motionDynamics: 'auto',
                neonGlow: accGlow,
                isAutoPromptPending: true,
                promptCount: needFreshCount,
                error: e.message || 'Gagal menghasilkan prompt',
              });
            const isQuotaFail = e instanceof AllKeysExhaustedError || e?.isAllKeysExhausted || /429|quota|exhausted|pendinginan|resource_exhausted/i.test(String(e?.message || ''));
            if (isQuotaFail) {
              for (let k = i + 1; k < accountsToRun.length; k++) {
                const nextAcc = accountsToRun[k];
                const nextGs = nextAcc.type !== 'bg' && !!nextAcc.isGreenScreen;
                const nextGlow = nextGs ? false : (nextAcc.neonGlow ?? true);
                const hasNextCustom = nextAcc.promptSource === 'custom' && Array.isArray(nextAcc.customPrompts) && nextAcc.customPrompts.length > 0;
                if (hasNextCustom) {
                  const seenNext = new Set<string>();
                  nextAcc.customPrompts!
                    .filter((np) => {
                      const nk = normalizePromptKey(np);
                      if (!nk || seenNext.has(nk)) return false;
                      seenNext.add(nk);
                      return !isPromptCompleted(activeLedger, currentAnimList, nextAcc.name, np);
                    })
                    .forEach((np, nIdx) => {
                      newFailedItems.push({
                        id: 'fail_next_' + Date.now() + '_' + k + '_' + nIdx + '_' + Math.random().toString(36).substring(7),
                        accountName: nextAcc.name,
                        prompt: np,
                        type: nextAcc.type,
                        subCategory: nextAcc.subCategory,
                        style: nextAcc.style,
                        isGreenScreen: nextGs,
                        colorMode: nextAcc.colorMode ?? 'gradient',
                        motionDynamics: 'auto',
                        neonGlow: nextGlow,
                        error: 'Antrean akun berikutnya tertunda karena kuota API Key penuh — siap dilanjutkan via Coba Ulang',
                      });
                    });
                } else {
                  const nextDone = getAccountCompletedCount(activeLedger, currentAnimList, nextAcc.name);
                  const nextRemain = Math.max(0, (nextAcc.promptCount || 0) - nextDone);
                  if (nextRemain > 0) {
                    newFailedItems.push({
                      id: 'fail_next_auto_' + Date.now() + '_' + k + '_' + Math.random().toString(36).substring(7),
                      accountName: nextAcc.name,
                      prompt: `(Auto Prompt: ${nextRemain} animasi ${nextAcc.type} - ${nextAcc.subCategory})`,
                      type: nextAcc.type,
                      subCategory: nextAcc.subCategory,
                      style: nextAcc.style,
                      isGreenScreen: nextGs,
                      colorMode: nextAcc.colorMode ?? 'gradient',
                      motionDynamics: 'auto',
                      neonGlow: nextGlow,
                      isAutoPromptPending: true,
                      promptCount: nextRemain,
                      error: 'Antrean Auto Prompt akun berikutnya tertunda karena kuota API Key penuh — siap dilanjutkan via Coba Ulang',
                    });
                  }
                }
              }
              addLog(`⏸️ [${acc.name}] Kuota penuh saat generate prompt — seluruh prompt belum selesai dari ${accountsToRun.length - i} akun tersisa diamankan ke Coba Ulang!`, 'warn');
              stopAllForQuota = true;
              break;
            }
            continue;
          }
          }
        }

        let consecutiveExhaustedBatches = 0;
        for (let j = 0; j < prompts.length; j += BATCH_ANIM_SIZE) {
          const rawSlice = prompts.slice(j, j + BATCH_ANIM_SIZE);
          const slice = rawSlice.filter((p) => !isPromptCompleted(activeLedger, currentAnimList, acc.name, p));
          const endNum = Math.min(prompts.length, j + rawSlice.length);
          if (slice.length === 0) {
            continue;
          }
          addLog(`🎬 [${acc.name}] Render Animasi #${j + 1}${slice.length > 1 ? `–#${endNum}` : ''}/${prompts.length}: "${slice[0].substring(0, 35)}..."`, 'info');

          let results = await generateBatchAnimationCodes(
            apiKeys,
            selectedModel,
            slice,
            acc.type,
            acc.subCategory,
            acc.style,
            j + 1,
            prompts.length,
            {
              isGreenScreen: accGs,
              colorMode: acc.colorMode ?? 'gradient',
              motionDynamics: 'auto',
              neonGlow: accGlow,
              variationOffset: j * 7 + i * 13,
              onLog: (msg, lvl) => addLog(msg, lvl || 'warn'),
            }
          );

          if (results.every((r) => r.exhausted)) {
            const poolStatus = getKeyPoolCooldownStatus(apiKeys, buildModelFallbackChain(selectedModel));
            if (!poolStatus.availableNow && !poolStatus.allDailyExhausted && !poolStatus.allInvalid && poolStatus.earliestWaitMs > 0) {
              addLog(`⏳ [${acc.name}] Pendinginan kuota RPM/TPM sementara. Menunggu pemulihan otomatis ${Math.ceil(poolStatus.earliestWaitMs / 1000)}s lalu melanjutkan #${j + 1}...`, 'warn');
              await new Promise((res) => setTimeout(res, poolStatus.earliestWaitMs));
              results = await generateBatchAnimationCodes(
                apiKeys,
                selectedModel,
                slice,
                acc.type,
                acc.subCategory,
                acc.style,
                j + 1,
                prompts.length,
                {
                  isGreenScreen: accGs,
                  colorMode: acc.colorMode ?? 'gradient',
                  motionDynamics: 'auto',
                  neonGlow: accGlow,
                  variationOffset: j * 7 + i * 13 + 19,
                  onLog: (msg, lvl) => addLog(msg, lvl || 'warn'),
                }
              );
            }
          }

          let hadSuccessInBatch = false;
          let stillExhausted = false;
          for (let rIdx = 0; rIdx < results.length; rIdx++) {
            const res = results[rIdx];
            if (res.anim) {
              hadSuccessInBatch = true;
              const resolvedPrompt = res.anim.prompt || res.prompt;
              const alreadyRecorded =
                isPromptCompleted(activeLedger, currentAnimList, acc.name, resolvedPrompt) ||
                isPromptCompleted(activeLedger, currentAnimList, acc.name, res.prompt);
              activeLedger = recordCompletedPrompt(activeLedger, acc.name, resolvedPrompt);
              if (normalizePromptKey(res.prompt) !== normalizePromptKey(resolvedPrompt)) {
                activeLedger = recordCompletedPrompt(activeLedger, acc.name, res.prompt);
              }
              completedLedgerRef.current = activeLedger;
              setCompletedLedger(activeLedger);
              if (!alreadyRecorded) {
                const newAnimItem: AnimationItem = {
                  ...res.anim,
                  prompt: resolvedPrompt,
                  account: acc.name,
                  createdAt: Date.now(),
                };
                currentAnimList = [newAnimItem, ...currentAnimList];
                saveAnimationsToStorage(currentAnimList);
              }
              addLog(`✅ [${acc.name}] Animasi #${j + rIdx + 1}/${prompts.length} selesai ("${resolvedPrompt.substring(0, 38)}...") & disimpan ke Galeri!`, 'success');
            } else {
              if (res.exhausted) stillExhausted = true;
              addLog(`⚠️ [${acc.name}] Lewati animasi #${j + rIdx + 1}: ${res.error || 'Kendala API'}. Menyimpan untuk fitur coba ulang...`, 'warn');
              newFailedItems.push({
                id: 'fail_' + Date.now() + '_' + (j + rIdx) + '_' + Math.random().toString(36).substring(7),
                accountName: acc.name,
                prompt: res.prompt,
                type: acc.type,
                subCategory: acc.subCategory,
                style: acc.style,
                isGreenScreen: accGs,
                colorMode: acc.colorMode ?? 'gradient',
                motionDynamics: 'auto',
                neonGlow: accGlow,
                error: res.error || 'Gagal merender animasi',
              });
            }
          }

          // Immediately prune any newly completed prompt from existing failedAutoPilotItems in memory & localStorage
          if (hadSuccessInBatch && failedAutoPilotItemsRef.current.length > 0) {
            const prunedExisting = filterPendingFailedItems(failedAutoPilotItemsRef.current, activeLedger, currentAnimList);
            if (prunedExisting.length !== failedAutoPilotItemsRef.current.length) {
              failedAutoPilotItemsRef.current = prunedExisting;
              setFailedAutoPilotItems(prunedExisting);
              saveFailedAutoPilotItems(prunedExisting);
            }
          }

          if (hadSuccessInBatch) {
            consecutiveExhaustedBatches = 0;
          } else if (stillExhausted) {
            consecutiveExhaustedBatches++;
          }

          const poolAfter = stillExhausted ? getKeyPoolCooldownStatus(apiKeys, buildModelFallbackChain(selectedModel)) : null;
          const shouldStopForQuota =
            !!poolAfter &&
            (poolAfter.allDailyExhausted ||
              poolAfter.allInvalid ||
              (consecutiveExhaustedBatches >= 3 && !poolAfter.availableNow) ||
              consecutiveExhaustedBatches >= 5);

          if (shouldStopForQuota) {
            const remainingPrompts = prompts.slice(endNum).filter((remP) => !isPromptCompleted(activeLedger, currentAnimList, acc.name, remP));
            remainingPrompts.forEach((remP, remIdx) => {
              newFailedItems.push({
                id: 'fail_rem_' + Date.now() + '_' + remIdx + '_' + Math.random().toString(36).substring(7),
                accountName: acc.name,
                prompt: remP,
                type: acc.type,
                subCategory: acc.subCategory,
                style: acc.style,
                isGreenScreen: accGs,
                colorMode: acc.colorMode ?? 'gradient',
                motionDynamics: 'auto',
                neonGlow: accGlow,
                error: 'Kuota harian (RPD) / seluruh jalur model aktif telah tercapai — disimpan aman untuk dicoba ulang',
              });
            });

            let savedSubsequentAccounts = 0;
            let savedSubsequentPrompts = 0;
            for (let k = i + 1; k < accountsToRun.length; k++) {
              const nextAcc = accountsToRun[k];
              const nextGs = nextAcc.type !== 'bg' && !!nextAcc.isGreenScreen;
              const nextGlow = nextGs ? false : (nextAcc.neonGlow ?? true);
              const hasNextCustom = nextAcc.promptSource === 'custom' && Array.isArray(nextAcc.customPrompts) && nextAcc.customPrompts.length > 0;
              if (hasNextCustom) {
                const seenNext = new Set<string>();
                const pendingNext = nextAcc.customPrompts!.filter((np) => {
                  const nk = normalizePromptKey(np);
                  if (!nk || seenNext.has(nk)) return false;
                  seenNext.add(nk);
                  return !isPromptCompleted(activeLedger, currentAnimList, nextAcc.name, np);
                });
                if (pendingNext.length === 0) continue;
                savedSubsequentAccounts++;
                savedSubsequentPrompts += pendingNext.length;
                pendingNext.forEach((np, nIdx) => {
                  newFailedItems.push({
                    id: 'fail_next_' + Date.now() + '_' + k + '_' + nIdx + '_' + Math.random().toString(36).substring(7),
                    accountName: nextAcc.name,
                    prompt: np,
                    type: nextAcc.type,
                    subCategory: nextAcc.subCategory,
                    style: nextAcc.style,
                    isGreenScreen: nextGs,
                    colorMode: nextAcc.colorMode ?? 'gradient',
                    motionDynamics: 'auto',
                    neonGlow: nextGlow,
                    error: 'Antrean akun berikutnya tertunda karena kuota API Key penuh — siap dilanjutkan via Coba Ulang',
                  });
                });
              } else {
                const nextDone = getAccountCompletedCount(activeLedger, currentAnimList, nextAcc.name);
                const nextRemain = Math.max(0, (nextAcc.promptCount || 0) - nextDone);
                if (nextRemain === 0) continue;
                savedSubsequentAccounts++;
                savedSubsequentPrompts += nextRemain;
                newFailedItems.push({
                  id: 'fail_next_auto_' + Date.now() + '_' + k + '_' + Math.random().toString(36).substring(7),
                  accountName: nextAcc.name,
                  prompt: `(Auto Prompt: ${nextRemain} animasi ${nextAcc.type} - ${nextAcc.subCategory})`,
                  type: nextAcc.type,
                  subCategory: nextAcc.subCategory,
                  style: nextAcc.style,
                  isGreenScreen: nextGs,
                  colorMode: nextAcc.colorMode ?? 'gradient',
                  motionDynamics: 'auto',
                  neonGlow: nextGlow,
                  isAutoPromptPending: true,
                  promptCount: nextRemain,
                  error: 'Antrean Auto Prompt akun berikutnya tertunda karena kuota API Key penuh — siap dilanjutkan via Coba Ulang',
                });
              }
            }

            const extraAccMsg = savedSubsequentAccounts > 0
              ? ` + ${savedSubsequentPrompts} antrean dari ${savedSubsequentAccounts} akun berikutnya`
              : '';
            addLog(`⏸️ [${acc.name}] Menghentikan antrean secara aman: ${remainingPrompts.length} prompt sisa [${acc.name}]${extraAccMsg} seluruhnya diamankan ke Coba Ulang agar tidak terbakar error 429 beruntun.`, 'warn');
            stopAllForQuota = true;
            break;
          }

          if (endNum < prompts.length) {
            let extraBreath = 0;
            if (stillExhausted && poolAfter) {
              extraBreath = poolAfter.earliestWaitMs > 0 ? poolAfter.earliestWaitMs : (poolAfter.availableNow ? 1200 : getModelCooldownRecoveryMs(selectedModel));
              if (poolAfter.earliestWaitMs > 0) {
                addLog(`⏸️ [Pemulihan RPM/TPM ${selectedModel}] Menunggu ${Math.ceil(extraBreath / 1000)}s agar kuota pulih sebelum animasi berikutnya...`, 'warn');
              } else {
                addLog(`🔄 Masih tersedia ${poolAfter.readyPairs} jalur key sehat — jeda singkat ${(extraBreath / 1000).toFixed(1)}s lalu melanjutkan antrean...`, 'cyan');
              }
            }
            await new Promise((res) => setTimeout(res, pacingDelay + extraBreath));
          }
        }
      }

      const ranAccountNames = new Set(accountsToRun.map((a) => normalizeAccountKey(a.name)));
      const dedupedNewFailed = filterPendingFailedItems(newFailedItems, activeLedger, currentAnimList);
      const preservedOther = failedAutoPilotItemsRef.current.filter((old) => !ranAccountNames.has(normalizeAccountKey(old.accountName)));
      const mergedFailed = filterPendingFailedItems([...dedupedNewFailed, ...preservedOther], activeLedger, currentAnimList);
      failedAutoPilotItemsRef.current = mergedFailed;
      setFailedAutoPilotItems(mergedFailed);
      saveFailedAutoPilotItems(mergedFailed);

      if (dedupedNewFailed.length > 0) {
        showToast(`Auto Pilot selesai dengan ${dedupedNewFailed.length} item tersimpan di "Ulangi Animasi Gagal".`, 'warn');
        addLog(`⚠️ [AUTO PILOT SELESAI] Terdapat ${dedupedNewFailed.length} animasi unik yang belum selesai & tersimpan di fitur Coba Ulang.`, 'warn');
      } else {
        showToast(`🏆 Auto Pilot [${accLabel}] Selesai dengan sempurna!`, 'success');
        addLog(`🏆 [AUTO PILOT SELESAI] Seluruh animasi [${accLabel}] berhasil diproses!`, 'success');
      }
    } finally {
      isAutoPilotRunningRef.current = false;
      setIsAutoPilotRunning(false);
    }

    if (stopAllForQuota) {
      handleModelQuotaExceeded(selectedModel);
    }
    addLog('═══════════════════════════════════════════════════════════════', 'cyan');
  };

  // Re-try failed animations from Auto Pilot sequentially (expands pending auto-prompts + runs 2-in-1 hemat batching + never repeats completed prompts)
  const handleRetryFailedAutoPilot = async (overrideModel?: GeminiModel) => {
    const activeModel = overrideModel || selectedModel;
    const hasValidKey = apiKeys.some((k) => k && k.trim().replace(/[\r\n\t ]+/g, '').length > 5);
    if (!hasValidKey) {
      showToast('API Key Gemini belum diatur atau kosong. Silakan masukkan API Key Anda terlebih dahulu.', 'error');
      addLog('⚠️ Tindakan dibatalkan: Belum ada API Key Gemini aktif. Silakan buka menu "API Keys" di header.', 'error');
      setIsApiModalOpen(true);
      return;
    }

    if (isAutoPilotRunningRef.current || isAutoPilotRunning) {
      showToast('Auto Pilot / Coba Ulang sedang berjalan!', 'warn');
      return;
    }

    const latestFailedQueue = failedAutoPilotItemsRef.current;
    if (latestFailedQueue.length === 0) {
      showToast('Tidak ada animasi gagal dari Auto Pilot.', 'info');
      return;
    }

    isAutoPilotRunningRef.current = true;
    setIsAutoPilotRunning(true);

    let currentAnimList = [...animationsRef.current];
    let activeLedger = syncLedgerFromAnimations(completedLedgerRef.current, currentAnimList);
    completedLedgerRef.current = activeLedger;
    setCompletedLedger(activeLedger);

    const itemsToRetry = filterPendingFailedItems(latestFailedQueue, activeLedger, currentAnimList);
    const skippedAlreadyDone = latestFailedQueue.length - itemsToRetry.length;
    if (skippedAlreadyDone > 0) {
      addLog(`⏩ [Coba Ulang Hemat] Melewati ${skippedAlreadyDone} prompt duplikat / sudah selesai tercatat sebelumnya.`, 'cyan');
    }
    if (itemsToRetry.length === 0) {
      failedAutoPilotItemsRef.current = [];
      setFailedAutoPilotItems([]);
      saveFailedAutoPilotItems([]);
      isAutoPilotRunningRef.current = false;
      setIsAutoPilotRunning(false);
      showToast('🎉 Seluruh item di daftar Coba Ulang sudah selesai!', 'success');
      return;
    }

    const pacingDelay = getAdaptiveModelPacingDelay(activeModel, apiKeys.length);
    addLog('═══════════════════════════════════════════════════════════════', 'warn');
    addLog(`🔄 [ULANGI AUTO PILOT GAGAL - ${activeModel}] Memproses ${itemsToRetry.length} item unik dengan mode dedikasi 1 prompt = 1 animasi...`, 'warn');
    showToast(`🔄 Mencoba ulang ${itemsToRetry.length} item Auto Pilot yang gagal/tertunda dengan ${activeModel}...`, 'info');

    const remainingFailed: FailedAutoPilotItem[] = [];
    const expandedItems: FailedAutoPilotItem[] = [];
    let quotaStoppedInExpansion = false;
    let stopAllForQuota = false;

    try {
      for (let idx = 0; idx < itemsToRetry.length; idx++) {
        const it = itemsToRetry[idx];
        const isPendingAuto = it.isAutoPromptPending || it.prompt.startsWith('(Auto Prompt:') || it.prompt.startsWith('(Generate Prompts:');
        if (!isPendingAuto) {
          if (!isPromptCompleted(activeLedger, currentAnimList, it.accountName, it.prompt)) {
            expandedItems.push(it);
          }
          continue;
        }
        const alreadyDoneAi = getAccountCompletedCount(activeLedger, currentAnimList, it.accountName);
        const targetAccCfg = autoPilotAccountsRef.current.find((a) => normalizeAccountKey(a.name) === normalizeAccountKey(it.accountName));
        const desiredTotal = targetAccCfg?.promptCount ?? it.promptCount ?? 5;
        const targetPromptCount = targetAccCfg ? Math.max(0, desiredTotal - alreadyDoneAi) : (it.promptCount || 5);
        if (targetPromptCount === 0) {
          addLog(`✅ [${it.accountName}] Target ${desiredTotal} animasi sudah terpenuhi — dilewati.`, 'success');
          continue;
        }
        addLog(`⚡ [${it.accountName}] Membuat ${targetPromptCount} Auto Prompt sebelum render batch...`, 'info');
        try {
          const itGs = it.type !== 'bg' && !!it.isGreenScreen;
          const itGlow = itGs ? false : (it.neonGlow ?? true);
          const genPrompts = await generatePromptsViaGemini(
            apiKeys,
            activeModel,
            it.type,
            it.subCategory,
            it.style,
            targetPromptCount,
            undefined,
            itGs,
            it.colorMode ?? 'gradient',
            'auto',
            itGlow
          );
          genPrompts.forEach((gp, gpIdx) => {
            if (isPromptCompleted(activeLedger, currentAnimList, it.accountName, gp)) return;
            expandedItems.push({
              id: 'retry_exp_' + Date.now() + '_' + idx + '_' + gpIdx + '_' + Math.random().toString(36).substring(7),
              accountName: it.accountName,
              prompt: gp,
              type: it.type,
              subCategory: it.subCategory,
              style: it.style,
              isGreenScreen: itGs,
              colorMode: it.colorMode ?? 'gradient',
              motionDynamics: 'auto',
              neonGlow: itGlow,
              error: 'Siap dirender dari antrean Auto Prompt',
            });
          });
        } catch (e: any) {
          const isQuota = e instanceof AllKeysExhaustedError || e?.isAllKeysExhausted || /429|quota|exhausted|pendinginan|resource_exhausted/i.test(String(e?.message || ''));
          if (isQuota) {
            addLog(`⏸️ [${it.accountName}] Kuota masih penuh saat expand Auto Prompt — semua antrean tersisa tetap disimpan aman.`, 'warn');
            remainingFailed.push(...itemsToRetry.slice(idx));
            quotaStoppedInExpansion = true;
            stopAllForQuota = true;
            break;
          }
          remainingFailed.push({ ...it, error: e.message || 'Gagal expand Auto Prompt' });
        }
      }

      if (quotaStoppedInExpansion && expandedItems.length > 0) {
        remainingFailed.push(...expandedItems);
      }

      if (!quotaStoppedInExpansion && expandedItems.length > 0) {
        const BATCH_ANIM_SIZE = 1;
        const chunks: FailedAutoPilotItem[][] = [];
        for (const item of expandedItems) {
          const last = chunks[chunks.length - 1];
          const canMerge =
            last &&
            last.length < BATCH_ANIM_SIZE &&
            normalizeAccountKey(last[0].accountName) === normalizeAccountKey(item.accountName) &&
            last[0].type === item.type &&
            last[0].subCategory === item.subCategory &&
            last[0].style === item.style &&
            !!last[0].isGreenScreen === !!item.isGreenScreen &&
            (last[0].colorMode ?? 'gradient') === (item.colorMode ?? 'gradient') &&
            (last[0].neonGlow ?? true) === (item.neonGlow ?? true);
          if (canMerge) {
            last.push(item);
          } else {
            chunks.push([item]);
          }
        }

        let processedCount = 0;
        let consecutiveExhaustedBatches = 0;
        for (let cIdx = 0; cIdx < chunks.length; cIdx++) {
          const rawChunk = chunks[cIdx];
          const chunk = rawChunk.filter((c) => !isPromptCompleted(activeLedger, currentAnimList, c.accountName, c.prompt));
          processedCount += rawChunk.length;
          if (chunk.length === 0) {
            continue;
          }
          const lead = chunk[0];
          const leadGs = lead.type !== 'bg' && !!lead.isGreenScreen;
          const leadGlow = leadGs ? false : (lead.neonGlow ?? true);
          const chunkLabel = chunk.length > 1
            ? `"${lead.prompt.substring(0, 26)}..." + "${chunk[1].prompt.substring(0, 26)}..."`
            : `"${lead.prompt.substring(0, 35)}..."`;
          addLog(`🎬 [Coba Ulang #${processedCount - rawChunk.length + 1}${chunk.length > 1 ? `–#${processedCount}` : ''}/${expandedItems.length} - ${lead.accountName}] Render ${chunkLabel}`, 'info');

          let results = await generateBatchAnimationCodes(
            apiKeys,
            activeModel,
            chunk.map((c) => c.prompt),
            lead.type,
            lead.subCategory,
            lead.style,
            processedCount - rawChunk.length + 1,
            expandedItems.length,
            {
              isGreenScreen: leadGs,
              colorMode: lead.colorMode ?? 'gradient',
              motionDynamics: 'auto',
              neonGlow: leadGlow,
              variationOffset: cIdx * 5 + 31 + (currentAnimList.length % 17),
              onLog: (msg, lvl) => addLog(msg, lvl || 'warn'),
            }
          );

          if (results.every((r) => r.exhausted)) {
            const poolStatus = getKeyPoolCooldownStatus(apiKeys, buildModelFallbackChain(activeModel));
            if (!poolStatus.availableNow && !poolStatus.allDailyExhausted && !poolStatus.allInvalid && poolStatus.earliestWaitMs > 0) {
              addLog(`⏳ [${lead.accountName}] Menunggu pemulihan cooldown RPM/TPM ${Math.ceil(poolStatus.earliestWaitMs / 1000)}s sebelum lanjut...`, 'warn');
              await new Promise((res) => setTimeout(res, poolStatus.earliestWaitMs));
              results = await generateBatchAnimationCodes(
                apiKeys,
                activeModel,
                chunk.map((c) => c.prompt),
                lead.type,
                lead.subCategory,
                lead.style,
                processedCount - rawChunk.length + 1,
                expandedItems.length,
                {
                  isGreenScreen: leadGs,
                  colorMode: lead.colorMode ?? 'gradient',
                  motionDynamics: 'auto',
                  neonGlow: leadGlow,
                  variationOffset: cIdx * 5 + 47 + (currentAnimList.length % 17),
                  onLog: (msg, lvl) => addLog(msg, lvl || 'warn'),
                }
              );
            }
          }

          let hadSuccess = false;
          let stillExhausted = false;
          for (let rIdx = 0; rIdx < chunk.length; rIdx++) {
            const item = chunk[rIdx];
            const res = results[rIdx];
            if (res?.anim) {
              hadSuccess = true;
              const resolvedPrompt = res.anim.prompt || item.prompt;
              const alreadyRecorded =
                isPromptCompleted(activeLedger, currentAnimList, item.accountName, resolvedPrompt) ||
                isPromptCompleted(activeLedger, currentAnimList, item.accountName, item.prompt);
              activeLedger = recordCompletedPrompt(activeLedger, item.accountName, resolvedPrompt);
              if (normalizePromptKey(item.prompt) !== normalizePromptKey(resolvedPrompt)) {
                activeLedger = recordCompletedPrompt(activeLedger, item.accountName, item.prompt);
              }
              completedLedgerRef.current = activeLedger;
              setCompletedLedger(activeLedger);
              if (!alreadyRecorded) {
                const newAnimItem: AnimationItem = {
                  ...res.anim,
                  prompt: resolvedPrompt,
                  account: item.accountName,
                  createdAt: Date.now(),
                };
                currentAnimList = [newAnimItem, ...currentAnimList];
                saveAnimationsToStorage(currentAnimList);
              }
              addLog(`✅ [Sukses Diperbaiki] [${item.accountName}] "${resolvedPrompt.substring(0, 38)}..." selesai & disimpan ke Galeri!`, 'success');
            } else {
              if (res?.exhausted) stillExhausted = true;
              addLog(`⚠️ [Masih Kendala] [${item.accountName}]: ${res?.error || 'Gagal saat dicoba ulang'}`, 'warn');
              remainingFailed.push({ ...item, error: res?.error || 'Masih kendala saat dicoba ulang' });
            }
          }

          // Incremental live persistence of remaining failed queue after EVERY batch so mid-run stops/reloads/switches NEVER lose progress!
          if (hadSuccess) {
            const liveRemaining = filterPendingFailedItems(
              [...remainingFailed, ...chunks.slice(cIdx + 1).flat()],
              activeLedger,
              currentAnimList
            );
            failedAutoPilotItemsRef.current = liveRemaining;
            setFailedAutoPilotItems(liveRemaining);
            saveFailedAutoPilotItems(liveRemaining);
          }

          if (hadSuccess) {
            consecutiveExhaustedBatches = 0;
          } else if (stillExhausted) {
            consecutiveExhaustedBatches++;
          }

          const poolAfter = stillExhausted ? getKeyPoolCooldownStatus(apiKeys, buildModelFallbackChain(activeModel)) : null;
          const shouldStopForQuota =
            !!poolAfter &&
            (poolAfter.allDailyExhausted ||
              poolAfter.allInvalid ||
              (consecutiveExhaustedBatches >= 3 && !poolAfter.availableNow) ||
              consecutiveExhaustedBatches >= 5);

          if (shouldStopForQuota) {
            const unretried = chunks.slice(cIdx + 1).flat().filter((c) => !isPromptCompleted(activeLedger, currentAnimList, c.accountName, c.prompt));
            remainingFailed.push(...unretried);
            addLog(`⏸️ Kuota penuh saat coba ulang — ${unretried.length} item tersisa dari semua akun tetap disimpan aman.`, 'warn');
            stopAllForQuota = true;
            break;
          }

          if (cIdx < chunks.length - 1) {
            const extraBreath = stillExhausted && poolAfter
              ? (poolAfter.earliestWaitMs > 0 ? poolAfter.earliestWaitMs : 1200)
              : 0;
            await new Promise((res) => setTimeout(res, Math.max(600, Math.round(pacingDelay * 0.7)) + extraBreath));
          }
        }
      }

      const finalRemainingFailed = filterPendingFailedItems(remainingFailed, activeLedger, currentAnimList);
      saveAnimationsToStorage(currentAnimList);
      failedAutoPilotItemsRef.current = finalRemainingFailed;
      setFailedAutoPilotItems(finalRemainingFailed);
      saveFailedAutoPilotItems(finalRemainingFailed);

      if (finalRemainingFailed.length === 0) {
        showToast('🎉 Semua animasi gagal Auto Pilot berhasil diperbaiki!', 'success');
        addLog('🏁 [SELESAI COBA ULANG] Seluruh animasi gagal Auto Pilot telah berhasil diperbaiki!', 'success');
      } else {
        showToast(`Tersisa ${finalRemainingFailed.length} item Auto Pilot yang masih kendala/tertunda.`, 'warn');
      }
    } finally {
      isAutoPilotRunningRef.current = false;
      setIsAutoPilotRunning(false);
    }

    if (stopAllForQuota) {
      handleModelQuotaExceeded(activeModel);
    }
  };

  const handleRetrySingleAutoPilotItem = async (item: FailedAutoPilotItem) => {
    try {
      const latestAnims = animationsRef.current;
      const itemType = item.type || currentType;
      const itemGs = itemType !== 'bg' && !!item.isGreenScreen;
      const itemGlow = itemGs ? false : (item.neonGlow ?? neonGlow);
      const isPendingAuto = item.isAutoPromptPending || item.prompt.startsWith('(Auto Prompt:') || item.prompt.startsWith('(Generate Prompts:');
      if (isPendingAuto) {
        const targetCount = item.promptCount || 5;
        const genPrompts = await generatePromptsViaGemini(
          apiKeys,
          selectedModel,
          itemType,
          item.subCategory || nicheCategory,
          item.style || visualStyle,
          targetCount,
          undefined,
          itemGs,
          item.colorMode ?? colorMode,
          'auto',
          itemGlow
        );
        const expanded: FailedAutoPilotItem[] = genPrompts
          .filter((gp) => !isPromptCompleted(completedLedgerRef.current, latestAnims, item.accountName, gp))
          .map((gp, gIdx) => ({
            id: 'single_exp_' + Date.now() + '_' + gIdx + '_' + Math.random().toString(36).substring(7),
            accountName: item.accountName,
            prompt: gp,
            type: itemType,
            subCategory: item.subCategory || nicheCategory,
            style: item.style || visualStyle,
            isGreenScreen: itemGs,
            colorMode: item.colorMode ?? colorMode,
            motionDynamics: 'auto',
            neonGlow: itemGlow,
            error: 'Auto Prompt siap dirender',
          }));
        setFailedAutoPilotItems((prev) => {
          const next = filterPendingFailedItems(prev.flatMap((f) => (f.id === item.id ? expanded : [f])), completedLedgerRef.current, animationsRef.current);
          failedAutoPilotItemsRef.current = next;
          saveFailedAutoPilotItems(next);
          return next;
        });
        showToast(`${expanded.length} prompt untuk [${item.accountName}] berhasil dibuat! Klik "Ulangi Semua" untuk merender batch.`, 'success');
        addLog(`✅ [${item.accountName}] ${expanded.length} Auto Prompt siap dirender dari daftar Coba Ulang.`, 'success');
        return;
      }

      if (isPromptCompleted(completedLedgerRef.current, latestAnims, item.accountName, item.prompt)) {
        setFailedAutoPilotItems((prev) => {
          const next = prev.filter((f) => f.id !== item.id);
          failedAutoPilotItemsRef.current = next;
          saveFailedAutoPilotItems(next);
          return next;
        });
        showToast(`Prompt [${item.accountName}] sudah selesai sebelumnya — dihapus dari daftar gagal.`, 'info');
        return;
      }

      const anim = await generateSingleAnimationCode(
        apiKeys,
        selectedModel,
        item.prompt,
        itemType,
        item.subCategory || nicheCategory,
        item.style || visualStyle,
        1,
        1,
        undefined,
        3,
        itemGs,
        item.colorMode ?? colorMode,
        'auto',
        itemGlow
      );
      if (anim) {
        const resolvedPrompt = anim.prompt || item.prompt;
        const newAnimItem: AnimationItem = {
          ...anim,
          prompt: resolvedPrompt,
          account: item.accountName,
          createdAt: Date.now(),
        };
        const updated = [newAnimItem, ...animationsRef.current];
        saveAnimationsToStorage(updated);
        let nextLedger = recordCompletedPrompt(completedLedgerRef.current, item.accountName, resolvedPrompt);
        if (normalizePromptKey(item.prompt) !== normalizePromptKey(resolvedPrompt)) {
          nextLedger = recordCompletedPrompt(nextLedger, item.accountName, item.prompt);
        }
        completedLedgerRef.current = nextLedger;
        setCompletedLedger(nextLedger);
        setFailedAutoPilotItems((prev) => {
          const next = filterPendingFailedItems(prev.filter((f) => f.id !== item.id), nextLedger, updated);
          failedAutoPilotItemsRef.current = next;
          saveFailedAutoPilotItems(next);
          return next;
        });
        showToast(`Animasi [${item.accountName}] berhasil diperbaiki!`, 'success');
        addLog(`✅ [Sukses Diperbaiki] [${item.accountName}] "${resolvedPrompt.substring(0, 38)}..." tersimpan ke Galeri!`, 'success');
      }
    } catch (e: any) {
      showToast(`Gagal mencoba ulang: ${e.message}`, 'error');
      addLog(`❌ [Gagal Diperbaiki] [${item.accountName}]: ${e.message}`, 'error');
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
      const target = prev.find((a) => a.id === id);
      const next = prev.filter((a) => a.id !== id);
      saveAnimationsToStorage(next);
      if (target && target.prompt) {
        const stillExists = next.some(
          (a) =>
            normalizeAccountKey(a.account || 'manual') === normalizeAccountKey(target.account || 'manual') &&
            normalizePromptKey(a.prompt) === normalizePromptKey(target.prompt)
        );
        if (!stillExists) {
          const nextLedger = removeCompletedPrompt(completedLedgerRef.current, target.account || 'manual', target.prompt);
          completedLedgerRef.current = nextLedger;
          setCompletedLedger(nextLedger);
        }
      }
      return next;
    });
    setDownloadQueue((prev) => prev.filter((itemId) => itemId !== id));
  };

  const handleClearAllAnimations = () => {
    animationsRef.current = [];
    setAnimations([]);
    setDownloadQueue([]);
    try {
      localStorage.removeItem(STORAGE_ANIMATIONS);
    } catch (e) {}
    addLog('Galeri animasi dibersihkan (riwayat prompt Auto Pilot tetap terkunci agar tidak terulang, bisa di-reset per akun di modal Auto Pilot).', 'warn');
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

  const handleExportMp4Single = async (item: AnimationItem, customBitrate?: number) => {
    const chosenBitrate = customBitrate ?? exportBitrate ?? 25;
    setExportingMp4Id(item.id);
    showToast(`Memulai render MP4 H.264 (${renderResolution.width}x${renderResolution.height} @ ${renderFps}FPS • ${chosenBitrate} Mbps) untuk "${item.title.substring(0, 20)}..."`, 'info');
    addLog(`[Export MP4] Merender "${item.title}" (${renderResolution.label} @ ${renderFps}FPS • ${chosenBitrate} Mbps CBR)...`, 'info');

    try {
      const result = await renderHtmlToVideo(item.html, {
        width: renderResolution.width,
        height: renderResolution.height,
        fps: renderFps,
        duration: renderDuration,
        bitrate: chosenBitrate,
        format: 'mp4',
        mode: item.type,
        isGreenScreen: item.type === 'bg' ? false : !!item.isGreenScreen,
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
      a.download = `microstock_${acc}_${item.type}_${safeTitle}_${renderResolution.height}p${renderFps}_${renderDuration}s_${result.bitrateMbps}Mbps.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(result.url), 5000);

      showToast(`Video MP4 (${result.sizeFormatted} • ${result.bitrateFormatted}) berhasil diunduh!`, 'success');
      addLog(`[Export MP4 Sukses] "${item.title}" (${result.sizeFormatted} • ${result.bitrateFormatted}) siap diunggah ke microstock.`, 'success');
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
    const prev = animationsRef.current;
    const exists = prev.some((a) => a.id === newAnim.id);
    const updated = exists
      ? prev.map((a) => (a.id === newAnim.id ? newAnim : a))
      : [newAnim, ...prev];
    saveAnimationsToStorage(updated);
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
        onOpenGalleryModal={() => setIsGalleryModalOpen(true)}
        onOpenTutorialModal={() => setIsTutorialModalOpen(true)}
        failedCount={failedPrompts.length + failedAutoPilotItems.length}
        onOpenFailedModal={() => setIsFailedAnimationsModalOpen(true)}
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
                  className={`p-3 rounded-xl border text-left transition flex items-center gap-2.5 cursor-pointer relative overflow-hidden group ${
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
                  </div>
                </button>

                {/* Menu 2: Image To Prompt Motion */}
                <button
                  type="button"
                  onClick={() => handleSelectPromptSubTab('image_to_prompt')}
                  className={`p-3 rounded-xl border text-left transition flex items-center gap-2.5 cursor-pointer relative overflow-hidden group ${
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
                  </div>
                </button>
              </div>
            </div>

            {/* Active Sub-Menu View */}
            {promptSubTab === 'prompt_to_motion' ? (
              <WorkflowSection
                currentType={currentType}
                onSelectType={(newType) => {
                  setCurrentType(newType);
                  setNicheCategory(getDefaultCategoryForType(newType) as NicheCategory);
                  if (newType === 'bg') {
                    setIsGreenScreen(false);
                  }
                }}
                subCategory={nicheCategory}
                onSelectSubCategory={(cat) => setNicheCategory(cat as NicheCategory)}
                visualStyle={visualStyle}
                onSelectStyle={setVisualStyle}
                colorMode={colorMode}
                onSelectColorMode={setColorMode}
                neonGlow={neonGlow}
                onToggleNeonGlow={handleToggleNeonGlow}
                promptCount={promptCount}
                onChangePromptCount={setPromptCount}
                isGreenScreen={isGreenScreen}
                onToggleGreenScreen={handleToggleGreenScreen}
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
            onModelQuotaExceeded={handleModelQuotaExceeded}
            showToast={showToast}
            addLog={addLog}
            renderResolution={renderResolution}
            renderFps={renderFps}
            renderDuration={renderDuration}
            exportBitrate={exportBitrate}
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
          animations={animations}
          onDeleteAnimation={handleDeleteSingleAnimation}
          onOpenGalleryModal={() => setIsGalleryModalOpen(true)}
          onOpenFullscreen={(item) => setFullscreenItem(item)}
          onDownloadSingle={handleDownloadSingle}
          onExportMp4Single={handleExportMp4Single}
          isExportingMp4Id={exportingMp4Id}
          exportBitrate={exportBitrate}
          onExportBitrateChange={handleExportBitrateChange}
          hwProfile={detectDeviceHardware()}
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

      {/* Fullscreen Preview Modal with Next/Prev and Direct Delete */}
      <FullscreenModal
        isOpen={!!fullscreenItem}
        item={fullscreenItem}
        animations={animations}
        onSelectItem={(item) => setFullscreenItem(item)}
        onDeleteAnimation={handleDeleteSingleAnimation}
        onClose={() => setFullscreenItem(null)}
        showToast={showToast}
        renderResolution={renderResolution}
        renderFps={renderFps}
        renderDuration={renderDuration}
        exportBitrate={exportBitrate}
      />

      <ApiKeyModal
        isOpen={isApiModalOpen}
        apiKeys={apiKeys}
        selectedModel={selectedModel}
        onSaveKeys={handleSaveApiKeys}
        onClose={() => setIsApiModalOpen(false)}
        showToast={showToast}
        addLog={addLog}
        renderResolution={renderResolution}
        onResolutionChange={handleResolutionChange}
        renderFps={renderFps}
        onFpsChange={handleFpsChange}
        renderDuration={renderDuration}
        onDurationChange={handleDurationChange}
        exportBitrate={exportBitrate}
        onExportBitrateChange={handleExportBitrateChange}
      />

      <ModelRotationModal
        isOpen={isModelRotationModalOpen}
        currentModel={selectedModel}
        keyCount={apiKeys.length}
        failedCount={failedAutoPilotItems.length}
        failedManualCount={failedPrompts.length}
        onConfirmSwitch={handleConfirmModelSwitch}
        onConfirmSwitchAndRetry={handleConfirmModelSwitchAndRetry}
        onOpenApiSettings={() => {
          setIsModelRotationModalOpen(false);
          setIsApiModalOpen(true);
        }}
        onClose={() => setIsModelRotationModalOpen(false)}
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
        onRetryFailedItems={() => handleRetryFailedAutoPilot()}
        onRetrySingleFailedItem={handleRetrySingleAutoPilotItem}
        animations={animations}
        completedLedger={completedLedger}
        onResetAccountProgress={handleResetAccountProgress}
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
        exportBitrate={exportBitrate}
        onExportBitrateChange={handleExportBitrateChange}
        renderResolution={renderResolution}
        renderFps={renderFps}
        renderDuration={renderDuration}
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

      <FailedAnimationsModal
        isOpen={isFailedAnimationsModalOpen}
        onClose={() => setIsFailedAnimationsModalOpen(false)}
        failedManualPrompts={failedPrompts}
        failedAutoPilotItems={failedAutoPilotItems}
        onRetrySingleManualPrompt={handleRetrySinglePrompt}
        onRetrySingleAutoPilotItem={handleRetrySingleAutoPilotItem}
        onRetryAllFailedManual={() => handleRetryFailedPrompts()}
        onRetryAllFailedAutoPilot={() => handleRetryFailedAutoPilot()}
        onClearAllFailed={() => {
          setFailedPrompts([]);
          setFailedAutoPilotItems([]);
          showToast('Daftar animasi gagal dibersihkan.', 'info');
        }}
        onSendToPromptList={(prompts) => {
          handleSendPromptsToWorkflow(prompts);
        }}
        isProcessing={isGeneratingAnimations || isAutoPilotRunning}
      />

      {/* Toast Notifications */}
      <ToastContainer toasts={toasts} />
    </div>
  );
}
