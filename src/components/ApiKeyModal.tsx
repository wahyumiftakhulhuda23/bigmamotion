import React, { useState, useEffect } from 'react';
import { GeminiModel, ApiKeyTestResult } from '../types';
import { testAllApiKeys } from '../services/geminiService';

interface ApiKeyModalProps {
  isOpen: boolean;
  apiKeys: string[];
  selectedModel: GeminiModel;
  onSaveKeys: (keys: string[], model: GeminiModel) => void;
  onClose: () => void;
  showToast: (msg: string, type?: 'info' | 'success' | 'warn' | 'error') => void;
  addLog: (msg: string, type?: 'info' | 'success' | 'error' | 'warn') => void;
}

export const ApiKeyModal: React.FC<ApiKeyModalProps> = ({
  isOpen,
  apiKeys,
  selectedModel,
  onSaveKeys,
  onClose,
  showToast,
  addLog,
}) => {
  const [textValue, setTextValue] = useState('');
  const [modelValue, setModelValue] = useState<GeminiModel>(selectedModel || 'gemini-2.5-flash');
  const [isTesting, setIsTesting] = useState(false);
  const [testResults, setTestResults] = useState<ApiKeyTestResult[] | null>(null);

  useEffect(() => {
    if (isOpen) {
      setTextValue(apiKeys.join('\n'));
      const safeModel = (selectedModel as string) === 'gemini-3.7-flash' ? 'gemini-2.5-flash' : selectedModel;
      setModelValue(safeModel || 'gemini-2.5-flash');
      setTestResults(null);
    }
  }, [isOpen, apiKeys, selectedModel]);

  if (!isOpen) return null;

  const handleSave = () => {
    const parsedKeys = textValue
      .split('\n')
      .map((k) => k.trim())
      .filter((k) => k.length > 0);

    onSaveKeys(parsedKeys, modelValue);
  };

  const handleTest = async () => {
    const keysToTest = textValue
      .split('\n')
      .map((k) => k.trim())
      .filter((k) => k.length > 0);

    if (keysToTest.length === 0) {
      showToast('Tidak ada API Key di textarea untuk dites.', 'warn');
      return;
    }

    setIsTesting(true);
    setTestResults(null);
    showToast(`Memeriksa ${keysToTest.length} API Key secara instan...`, 'info');

    try {
      const result = await testAllApiKeys(keysToTest);
      setTestResults(result.results);

      if (result.validCount === result.total) {
        showToast(`Semua ${result.validCount} API Key valid & aktif! (${result.results.reduce((acc, r) => acc + (r.latencyMs || 0), 0)}ms total)`, 'success');
        addLog(`Pengecekan key: ${result.validCount}/${result.total} valid (Semua siap digunakan).`, 'success');
      } else if (result.validCount > 0) {
        showToast(`${result.validCount} dari ${result.total} API Key valid.`, 'warn');
        addLog(`Pengecekan key: ${result.validCount}/${result.total} valid.`, 'warn');
      } else {
        showToast(`Tidak ada API Key yang valid (0/${result.total}). Periksa kembali key Anda.`, 'error');
        addLog(`Pengecekan key: 0/${result.total} valid.`, 'error');
      }
    } catch (e: any) {
      showToast(`Gagal menguji key: ${e.message}`, 'error');
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div
      id="api-modal"
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto"
    >
      <div className="glass-card rounded-2xl max-w-2xl w-full border border-gray-800 p-6 space-y-5 flex flex-col shadow-2xl my-8">
        <div className="flex justify-between items-center border-b border-gray-800 pb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-sky-500/20 border border-sky-500/30 flex items-center justify-center text-sky-400">
              <i className="fa-solid fa-key text-lg"></i>
            </div>
            <div>
              <h3 className="font-bold text-gray-100 text-base">Konfigurasi Gemini AI & API Key</h3>
              <p className="text-xs text-gray-400">Pilih model paling canggih & stabil serta kelola multi-API key Anda</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-lg cursor-pointer">
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>

        {/* Quick Model Selector Presets */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-gray-300 uppercase tracking-wider block">
            Pilihan Model AI (Paling Canggih & Stabil)
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            {/* Model 1: gemini-2.5-flash (Paling Canggih & Stabil ⭐) */}
            <div
              onClick={() => setModelValue('gemini-2.5-flash')}
              className={`p-3 rounded-xl border cursor-pointer transition flex flex-col justify-between gap-1.5 ${
                modelValue === 'gemini-2.5-flash'
                  ? 'bg-emerald-500/15 border-emerald-500/60 shadow-lg shadow-emerald-500/10'
                  : 'bg-gray-900/60 border-gray-800 hover:border-gray-700'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-xs text-gray-100 flex items-center gap-1.5">
                  <i className="fa-solid fa-shield-halved text-emerald-400"></i> gemini-2.5-flash
                </span>
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-bold border border-emerald-500/30">
                  Rekomendasi ⭐
                </span>
              </div>
              <p className="text-[11px] text-gray-400">
                Model paling stabil, sangat cepat, coding Canvas presisi tinggi, dan tahan lonjakan trafik.
              </p>
            </div>

            {/* Model 2: gemini-3.1-pro-preview (Deep Reasoning) */}
            <div
              onClick={() => setModelValue('gemini-3.1-pro-preview')}
              className={`p-3 rounded-xl border cursor-pointer transition flex flex-col justify-between gap-1.5 ${
                modelValue === 'gemini-3.1-pro-preview'
                  ? 'bg-purple-500/15 border-purple-500/60 shadow-lg shadow-purple-500/10'
                  : 'bg-gray-900/60 border-gray-800 hover:border-gray-700'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-xs text-gray-100 flex items-center gap-1.5">
                  <i className="fa-solid fa-brain text-purple-400"></i> 3.1-pro-preview
                </span>
                <span className="px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 text-[10px] font-bold border border-purple-500/30">
                  Reasoning 🧠
                </span>
              </div>
              <p className="text-[11px] text-gray-400">
                Penalaran tingkat lanjut untuk animasi partikel fisika (Auto-fallback ke 2.5 Flash jika kuota habis).
              </p>
            </div>

            {/* Model 3: gemini-3.1-flash-lite (Super Ringan) */}
            <div
              onClick={() => setModelValue('gemini-3.1-flash-lite')}
              className={`p-3 rounded-xl border cursor-pointer transition flex flex-col justify-between gap-1.5 ${
                modelValue === 'gemini-3.1-flash-lite'
                  ? 'bg-amber-500/15 border-amber-500/60 shadow-lg shadow-amber-500/10'
                  : 'bg-gray-900/60 border-gray-800 hover:border-gray-700'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-xs text-gray-100 flex items-center gap-1.5">
                  <i className="fa-solid fa-bolt text-amber-400"></i> 3.1-flash-lite
                </span>
                <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-[10px] font-bold border border-amber-500/30">
                  Super Cepat ⚡
                </span>
              </div>
              <p className="text-[11px] text-gray-400">
                Paling hemat token dan latency paling rendah untuk generate prompt masal.
              </p>
            </div>
          </div>
        </div>

        {/* API Key Management Box */}
        <div className="space-y-4">
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <label className="text-xs font-bold text-gray-300 uppercase tracking-wider block">
                API Key Gemini Pribadi (Opsional - 1 Key per Baris)
              </label>
              <span className="text-[11px] text-gray-400">
                {textValue.split('\n').filter((k) => k.trim().length > 0).length} Key terdeteksi
              </span>
            </div>
            <textarea
              rows={4}
              value={textValue}
              onChange={(e) => {
                setTextValue(e.target.value);
                if (testResults) setTestResults(null);
              }}
              placeholder={'AIzaSy...\nAIzaSy...\nAIzaSy...'}
              className="w-full glass-input rounded-xl p-3 text-xs text-gray-200 font-mono placeholder-gray-600 focus:outline-none"
            ></textarea>
            <div className="p-3 rounded-xl bg-sky-950/30 border border-sky-800/40 text-[11px] text-gray-300 space-y-1">
              <div className="flex items-center gap-1.5 font-bold text-sky-400">
                <i className="fa-solid fa-circle-info"></i> Proteksi Auto-Fallback & Multi-Key Active:
              </div>
              <p className="text-gray-400">
                Jika memasukkan banyak key, sistem merotasi key secara otomatis. Jika terjadi lonjakan beban API, sistem otomatis melakukan retry dan rotasi agar proses pembuatan animasi tidak pernah terputus.
              </p>
            </div>
          </div>

          {/* Test Results Breakdown */}
          {testResults && testResults.length > 0 && (
            <div className="space-y-1.5 p-3 rounded-xl bg-gray-900/90 border border-gray-800 text-xs">
              <div className="font-semibold text-gray-300 flex justify-between items-center mb-1">
                <span>Hasil Verifikasi Cepat ({testResults.filter((r) => r.valid).length}/{testResults.length} Valid):</span>
              </div>
              <div className="max-h-32 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
                {testResults.map((res, idx) => (
                  <div
                    key={idx}
                    className={`flex items-center justify-between p-1.5 rounded-lg text-[11px] font-mono ${
                      res.valid
                        ? 'bg-emerald-950/40 text-emerald-300 border border-emerald-800/40'
                        : 'bg-rose-950/40 text-rose-300 border border-rose-800/40'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 truncate mr-2">
                      <i
                        className={`fa-solid ${
                          res.valid ? 'fa-circle-check text-emerald-400' : 'fa-circle-xmark text-rose-400'
                        }`}
                      ></i>
                      <span className="truncate">{res.maskedKey}</span>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {res.latencyMs !== undefined && (
                        <span className="text-[10px] text-gray-400 font-sans">{res.latencyMs}ms</span>
                      )}
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-sans font-bold ${
                          res.valid ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'
                        }`}
                      >
                        {res.valid ? 'Aktif' : res.error || 'Gagal'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Modal Actions */}
        <div className="border-t border-gray-800 pt-4 flex justify-between items-center gap-3">
          <button
            onClick={handleTest}
            disabled={isTesting}
            className="px-3.5 py-2.5 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            {isTesting ? (
              <>
                <i className="fa-solid fa-spinner fa-spin text-sky-400"></i> Memeriksa Cepat...
              </>
            ) : (
              <>
                <i className="fa-solid fa-bolt text-amber-400"></i> Tes Instan API Key
              </>
            )}
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-semibold cursor-pointer"
            >
              Batal
            </button>
            <button
              onClick={handleSave}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 text-white font-bold text-xs transition cursor-pointer shadow-lg shadow-sky-500/20"
            >
              Simpan & Terapkan Model
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
