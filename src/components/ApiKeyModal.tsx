import React, { useState, useEffect } from 'react';
import { GeminiModel, ApiKeyTestResult } from '../types';
import { testSingleApiKey } from '../services/geminiService';
import { detectDeviceHardware, HardwareProfile } from '../services/hardwareService';

interface ApiKeyModalProps {
  isOpen: boolean;
  apiKeys: string[];
  selectedModel: GeminiModel;
  onSaveKeys: (keys: string[], model: GeminiModel) => void;
  onClose: () => void;
  showToast: (msg: string, type?: 'info' | 'success' | 'warn' | 'error') => void;
  addLog: (msg: string, type?: 'info' | 'success' | 'error' | 'warn') => void;
  renderResolution: { width: number; height: number; label: string };
  onResolutionChange: (res: { width: number; height: number; label: string }) => void;
  renderFps: number;
  onFpsChange: (fps: number) => void;
  renderDuration: number;
  onDurationChange: (dur: number) => void;
  exportBitrate: number;
  onExportBitrateChange: (bitrate: number) => void;
}

export const ApiKeyModal: React.FC<ApiKeyModalProps> = ({
  isOpen,
  apiKeys,
  selectedModel,
  onSaveKeys,
  onClose,
  showToast,
  addLog,
  renderResolution,
  onResolutionChange,
  renderFps,
  onFpsChange,
  renderDuration,
  onDurationChange,
  exportBitrate,
  onExportBitrateChange,
}) => {
  const [activeTab, setActiveTab] = useState<'api' | 'render' | 'hardware'>('api');

  // API Key State
  const [textValue, setTextValue] = useState('');
  const [modelValue, setModelValue] = useState<GeminiModel>(selectedModel || 'gemini-2.5-flash');
  const [isTesting, setIsTesting] = useState(false);
  const [testingRowIndex, setTestingRowIndex] = useState<number | null>(null);
  const [testResults, setTestResults] = useState<ApiKeyTestResult[]>([]);

  // Hardware Profile Info
  const [hwProfile, setHwProfile] = useState<HardwareProfile | null>(null);

  useEffect(() => {
    if (isOpen) {
      setTextValue(apiKeys.join('\n'));
      const safeModel = (selectedModel as string) === 'gemini-3.7-flash' ? 'gemini-2.5-flash' : selectedModel;
      setModelValue(safeModel || 'gemini-2.5-flash');
      setIsTesting(false);
      setTestingRowIndex(null);
      setHwProfile(detectDeviceHardware());

      const initialKeys = apiKeys.map((k) => k.trim()).filter((k) => k.length > 0);
      if (initialKeys.length > 0) {
        setTestResults(
          initialKeys.map((k, idx) => ({
            key: k,
            maskedKey: k.length > 10 ? `${k.substring(0, 6)}...${k.substring(k.length - 4)}` : k,
            valid: false,
            status: 'pending',
            lineIndex: idx,
          }))
        );
      } else {
        setTestResults([]);
      }
    }
  }, [isOpen, apiKeys, selectedModel]);

  if (!isOpen) return null;

  const currentLines = textValue
    .split('\n')
    .map((k) => k.trim())
    .filter((k) => k.length > 0);

  const applyRecommendations = () => {
    if (hwProfile) {
      onResolutionChange(hwProfile.recommendedResolution);
      onFpsChange(hwProfile.recommendedFps);
      onExportBitrateChange(hwProfile.recommendedBitrate);
      if (hwProfile.recommendedDuration) {
        onDurationChange(hwProfile.recommendedDuration);
      }
      showToast('Setelan optimal telah diterapkan berdasarkan spesifikasi hardware Anda!', 'success');
    }
  };

  const handleSave = () => {
    onSaveKeys(currentLines, modelValue);
    showToast('Pengaturan aplikasi & API Key berhasil disimpan!', 'success');
    onClose();
  };

  const handleTestAllKeys = async () => {
    setIsTesting(true);
    for (let i = 0; i < currentLines.length; i++) {
      await handleTestSingleRow(i);
    }
    setIsTesting(false);
  };

  const handleTestSingleRow = async (index: number) => {
    if (index < 0 || index >= currentLines.length) return;
    const rawKey = currentLines[index];
    setTestingRowIndex(index);

    setTestResults((prev) => {
      const copy = [...prev];
      if (copy[index]) {
        copy[index] = { ...copy[index], status: 'testing', error: undefined };
      }
      return copy;
    });

    try {
      const result = await testSingleApiKey(rawKey, index);
      setTestResults((prev) => {
        const copy = [...prev];
        copy[index] = result;
        return copy;
      });

      if (result.valid) {
        showToast(`Baris #${index + 1}: Valid & Aktif (${result.latencyMs}ms)`, 'success');
      } else {
        showToast(`Baris #${index + 1}: ${result.error || 'Tidak Valid'}`, 'error');
      }
    } catch (e: any) {
      setTestResults((prev) => {
        const copy = [...prev];
        copy[index] = {
          key: rawKey,
          maskedKey: rawKey.length > 10 ? `${rawKey.substring(0, 6)}...${rawKey.substring(rawKey.length - 4)}` : rawKey,
          valid: false,
          error: e.message || 'Gagal koneksi',
          status: 'invalid',
          lineIndex: index,
        };
        return copy;
      });
      showToast(`Gagal menguji baris #${index + 1}: ${e.message}`, 'error');
    } finally {
      setTestingRowIndex(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
      <div className="glass-card rounded-2xl max-w-3xl w-full border border-gray-800 p-6 space-y-6 shadow-2xl my-6 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex justify-between items-center border-b border-gray-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-sky-500/20 border border-sky-500/30 flex items-center justify-center text-sky-400">
              <i className="fa-solid fa-gear text-lg animate-spin-slow"></i>
            </div>
            <div>
              <h3 className="font-bold text-gray-100 text-base">Pengaturan & Konfigurasi Sistem</h3>
              <p className="text-xs text-gray-400">Kelola API Key Gemini, resolusi render, bitrate, dan deteksi hardware.</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-lg cursor-pointer">
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 border-b border-gray-800 pb-3">
          <button
            onClick={() => setActiveTab('api')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
              activeTab === 'api'
                ? 'bg-sky-500 text-white shadow-lg'
                : 'bg-gray-900 text-gray-400 hover:bg-gray-800 border border-gray-800'
            }`}
          >
            <i className="fa-solid fa-key"></i>
            <span>Konfigurasi API Key</span>
          </button>

          <button
            onClick={() => setActiveTab('render')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
              activeTab === 'render'
                ? 'bg-purple-600 text-white shadow-lg'
                : 'bg-gray-900 text-gray-400 hover:bg-gray-800 border border-gray-800'
            }`}
          >
            <i className="fa-solid fa-sliders"></i>
            <span>Setelan Render Video</span>
          </button>

          <button
            onClick={() => setActiveTab('hardware')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
              activeTab === 'hardware'
                ? 'bg-emerald-600 text-white shadow-lg'
                : 'bg-gray-900 text-gray-400 hover:bg-gray-800 border border-gray-800'
            }`}
          >
            <i className="fa-solid fa-microchip"></i>
            <span>Info Hardware & Perangkat</span>
          </button>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto space-y-4 pr-1">
          {/* TAB 1: API KEY & MODEL */}
          {activeTab === 'api' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-300 mb-1">
                  Gemini API Keys (Satu per baris / multi-key rotasi otomatis):
                </label>
                <textarea
                  rows={5}
                  value={textValue}
                  onChange={(e) => setTextValue(e.target.value)}
                  placeholder="AIzaSy..."
                  className="w-full bg-gray-950 border border-gray-800 rounded-xl p-3 text-xs font-mono text-gray-200 focus:outline-none focus:border-sky-500 shadow-inner resize-none"
                />
                <p className="text-[11px] text-gray-500 mt-1">
                  Masukkan kunci API Google Gemini Anda. Jika menggunakan banyak key, pisahkan dengan baris baru untuk rotasi otomatis.
                </p>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-gray-300">Pilih Model AI Gemini:</label>
                  <span className="text-[10px] text-emerald-400 font-bold bg-emerald-950/60 border border-emerald-800/60 px-2 py-0.5 rounded-full flex items-center gap-1">
                    <i className="fa-solid fa-bolt"></i> Ultra Fast & Anti-Boros Aktif
                  </span>
                </div>
                <select
                  value={modelValue}
                  onChange={(e) => setModelValue(e.target.value as GeminiModel)}
                  className="w-full bg-gray-950 border border-gray-800 rounded-xl p-3 text-xs font-semibold text-gray-200 focus:outline-none focus:border-sky-500 cursor-pointer"
                >
                  <option value="gemini-2.5-flash">Gemini 2.5 Flash (Ultra Cepat ~1.2s • Hemat Kuota • Direkomendasikan)</option>
                  <option value="gemini-3.1-pro-preview">Gemini 3.1 Pro Preview (Kualitas Tinggi, Detail Kompleks & Rigging Presisi)</option>
                  <option value="gemini-3.1-flash-lite">Gemini 3.1 Flash Lite (Super Ringan & Efisiensi Token Tinggi)</option>
                </select>
                <p className="text-[11px] text-sky-400/90 mt-1.5 flex items-center gap-1">
                  <i className="fa-solid fa-circle-check"></i> Seluruh model kini dilengkapi Hierarchical Rigid Rigging (bentuk proporsional, bebas salah gerak, dan objek tidak terpisah).
                </p>
              </div>

              {currentLines.length > 0 && (
                <div className="space-y-2 pt-2 border-t border-gray-800">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold text-gray-300">Daftar Kunci Terdeteksi ({currentLines.length}):</span>
                    <button
                      onClick={handleTestAllKeys}
                      disabled={isTesting}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition cursor-pointer disabled:opacity-50"
                    >
                      {isTesting ? 'Menguji...' : 'Uji Semua Key'}
                    </button>
                  </div>
                  <div className="space-y-1.5 max-h-36 overflow-y-auto">
                    {currentLines.map((line, idx) => {
                      const res = testResults[idx];
                      const isTestingThis = testingRowIndex === idx;

                      return (
                        <div key={idx} className="flex items-center justify-between bg-gray-900/80 border border-gray-800 p-2 rounded-xl text-xs">
                          <span className="font-mono text-gray-300">
                            #{idx + 1}: {line.length > 10 ? `${line.substring(0, 8)}...${line.substring(line.length - 4)}` : line}
                          </span>
                          <div className="flex items-center gap-2">
                            {res?.valid && <span className="text-emerald-400 font-bold text-[10px]">✔ Valid ({res.latencyMs}ms)</span>}
                            {res?.status === 'invalid' && <span className="text-red-400 font-bold text-[10px]">✘ Gagal</span>}
                            <button
                              onClick={() => handleTestSingleRow(idx)}
                              disabled={isTestingThis}
                              className="px-2.5 py-1 bg-gray-800 hover:bg-gray-700 text-sky-300 rounded-lg text-[11px] font-semibold transition cursor-pointer disabled:opacity-50"
                            >
                              {isTestingThis ? <i className="fa-solid fa-spinner fa-spin"></i> : 'Uji Key'}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: RENDER SETTINGS */}
          {activeTab === 'render' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Resolution */}
                <div>
                  <label className="block text-xs font-bold text-gray-300 mb-1.5">Resolusi Render Video:</label>
                  <select
                    value={`${renderResolution.width}x${renderResolution.height}`}
                    onChange={(e) => {
                      const [w, h] = e.target.value.split('x').map(Number);
                      const label = w === 3840 ? '4K Ultra HD (3840x2160)' : w === 1920 ? '1080p Full HD (1920x1080)' : '720p HD (1280x720)';
                      onResolutionChange({ width: w, height: h, label });
                    }}
                    className="w-full bg-gray-950 border border-gray-800 rounded-xl p-3 text-xs font-semibold text-gray-200 focus:outline-none focus:border-purple-500 cursor-pointer"
                  >
                    <option value="1920x1080">1080p Full HD (1920x1080 • Standar Pro)</option>
                    <option value="1280x720">720p HD (1280x720 • Ringan & Cepat untuk Spek Rendah)</option>
                    <option value="3840x2160">4K Ultra HD (3840x2160 • Master Quality)</option>
                  </select>
                </div>

                {/* Bitrate */}
                <div>
                  <label className="block text-xs font-bold text-gray-300 mb-1.5">Target Bitrate (Microstock Standard):</label>
                  <select
                    value={exportBitrate}
                    onChange={(e) => onExportBitrateChange(Number(e.target.value))}
                    className="w-full bg-gray-950 border border-gray-800 rounded-xl p-3 text-xs font-semibold text-purple-300 focus:outline-none focus:border-purple-500 cursor-pointer"
                  >
                    <option value={18}>18 Mbps (~22.5 MB • Microstock Standar)</option>
                    <option value={25}>25 Mbps (~31.2 MB • Pro Rekomendasi)</option>
                    <option value={30}>30 Mbps (~37.5 MB • Ultra 60 FPS)</option>
                    <option value={20}>20 Mbps (~25.0 MB • Shutterstock HD)</option>
                    <option value={15}>15 Mbps (~18.7 MB • Ringan)</option>
                    <option value={10}>10 Mbps (~12.5 MB • Hemat File)</option>
                    <option value={50}>50 Mbps (~62.5 MB • Master 4K)</option>
                  </select>
                </div>

                {/* FPS */}
                <div>
                  <label className="block text-xs font-bold text-gray-300 mb-1.5">Framerate (FPS):</label>
                  <select
                    value={renderFps}
                    onChange={(e) => onFpsChange(Number(e.target.value))}
                    className="w-full bg-gray-950 border border-gray-800 rounded-xl p-3 text-xs font-semibold text-gray-200 focus:outline-none focus:border-purple-500 cursor-pointer"
                  >
                    <option value={60}>60 FPS (Sangat Halus & Sinematik)</option>
                    <option value={30}>30 FPS (Standar Cepat & Ringan)</option>
                  </select>
                </div>

                {/* Duration */}
                <div>
                  <label className="block text-xs font-bold text-gray-300 mb-1.5">Durasi Klip (Detik):</label>
                  <select
                    value={renderDuration}
                    onChange={(e) => onDurationChange(Number(e.target.value))}
                    className="w-full bg-gray-950 border border-gray-800 rounded-xl p-3 text-xs font-semibold text-gray-200 focus:outline-none focus:border-purple-500 cursor-pointer"
                  >
                    <option value={5}>5 Detik (Klip Pendek)</option>
                    <option value={8}>8 Detik (Standar Pendek)</option>
                    <option value={10}>10 Detik (Standar Microstock)</option>
                    <option value={15}>15 Detik (Extended Stock)</option>
                    <option value={20}>20 Detik (Durasi Panjang)</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: HARDWARE INFO & AUTO-DETECT */}
          {activeTab === 'hardware' && hwProfile && (
            <div className="space-y-4 bg-gray-900/60 border border-gray-800 rounded-xl p-4">
              <div className="flex items-center gap-2 text-emerald-400 text-xs font-bold border-b border-gray-800 pb-2">
                <i className="fa-solid fa-microchip text-sm"></i> Deteksi Spesifikasi & Rekomendasi Otomatis Perangkat
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="bg-gray-950/80 border border-gray-800 p-3 rounded-xl">
                  <span className="text-gray-500 block text-[10px] uppercase font-bold">Sistem Operasi</span>
                  <span className="font-bold text-gray-200">{hwProfile.osInfo}</span>
                </div>

                <div className="bg-gray-950/80 border border-gray-800 p-3 rounded-xl">
                  <span className="text-gray-500 block text-[10px] uppercase font-bold">Kapasitas RAM</span>
                  <span className="font-bold text-emerald-400">{hwProfile.ramStr}</span>
                </div>

                <div className="bg-gray-950/80 border border-gray-800 p-3 rounded-xl">
                  <span className="text-gray-500 block text-[10px] uppercase font-bold">Prosesor / Cores</span>
                  <span className="font-bold text-gray-200">{hwProfile.cpuCores} Logical CPU Cores</span>
                </div>

                <div className="bg-gray-950/80 border border-gray-800 p-3 rounded-xl">
                  <span className="text-gray-500 block text-[10px] uppercase font-bold">VGA / GPU Renderer</span>
                  <span className="font-bold text-sky-400 truncate block" title={hwProfile.gpuInfo}>{hwProfile.gpuInfo}</span>
                </div>
              </div>

              <div className="bg-sky-950/30 border border-sky-500/30 p-3.5 rounded-xl space-y-3">
                <div className="text-sky-300 font-bold text-xs flex items-center gap-1.5">
                  <i className="fa-solid fa-circle-info"></i> Setelan Rekomendasi Otomatis Diterapkan:
                </div>
                <p className="text-gray-300 text-xs leading-relaxed">
                  {hwProfile.isLowSpec
                    ? 'Perangkat Anda terdeteksi berspesifikasi entry-level / minimum. Sistem otomatis menerapkan setelan 720p 30 FPS agar rendering berjalan sangat ringan dan cepat tanpa membebani prosesor.'
                    : 'Perangkat Anda terdeteksi memiliki performa tinggi. Sistem otomatis menerapkan setelan Full HD 1080p 60 FPS untuk kualitas sinematik maksimal.'}
                </p>
                <button
                  onClick={applyRecommendations}
                  className="w-full py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs font-bold transition cursor-pointer"
                >
                  Terapkan Setelan Optimal Sekarang
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="flex justify-end items-center gap-2 pt-3 border-t border-gray-800">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-xl text-xs font-bold transition cursor-pointer"
          >
            Batal
          </button>
          <button
            onClick={handleSave}
            className="px-5 py-2 bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 text-white rounded-xl text-xs font-bold transition shadow-lg shadow-sky-500/20 cursor-pointer"
          >
            Simpan & Terapkan
          </button>
        </div>
      </div>
    </div>
  );
};
