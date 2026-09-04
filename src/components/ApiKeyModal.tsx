import React, { useState, useEffect } from 'react';
import { GeminiModel, ApiKeyTestResult } from '../types';
import { testSingleApiKey } from '../services/geminiService';

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
  const [testingRowIndex, setTestingRowIndex] = useState<number | null>(null);
  const [testResults, setTestResults] = useState<ApiKeyTestResult[]>([]);

  useEffect(() => {
    if (isOpen) {
      setTextValue(apiKeys.join('\n'));
      const safeModel = (selectedModel as string) === 'gemini-3.7-flash' ? 'gemini-2.5-flash' : selectedModel;
      setModelValue(safeModel || 'gemini-2.5-flash');
      setIsTesting(false);
      setTestingRowIndex(null);

      // Prepopulate results preview from existing keys
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

  const handleSave = () => {
    onSaveKeys(currentLines, modelValue);
  };

  // Test single specific row
  const handleTestSingleRow = async (index: number) => {
    if (index < 0 || index >= currentLines.length) return;
    const rawKey = currentLines[index];
    setTestingRowIndex(index);

    // Update status to testing for this row
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
        showToast(`Baris #${index + 1} (${result.maskedKey}): Valid & Aktif (${result.latencyMs}ms)`, 'success');
      } else {
        showToast(`Baris #${index + 1} (${result.maskedKey}): ${result.error || 'Tidak Valid'}`, 'error');
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

  // Sequential one-by-one test for all keys
  const handleTestSequentialAll = async () => {
    if (currentLines.length === 0) {
      showToast('Tidak ada API Key di textarea untuk diperiksa.', 'warn');
      return;
    }

    setIsTesting(true);

    // Initialize all rows to pending
    const initialRows: ApiKeyTestResult[] = currentLines.map((k, idx) => ({
      key: k,
      maskedKey: k.length > 10 ? `${k.substring(0, 6)}...${k.substring(k.length - 4)}` : k,
      valid: false,
      status: 'pending',
      lineIndex: idx,
    }));
    setTestResults(initialRows);

    showToast(`Memulai tes satu per satu untuk ${currentLines.length} API Key...`, 'info');

    let validCount = 0;
    const finalResults: ApiKeyTestResult[] = [];

    for (let i = 0; i < currentLines.length; i++) {
      const rawKey = currentLines[i];
      setTestingRowIndex(i);

      // Set current row status to 'testing'
      setTestResults((prev) => {
        const copy = [...prev];
        if (copy[i]) {
          copy[i] = { ...copy[i], status: 'testing' };
        }
        return copy;
      });

      try {
        const singleResult = await testSingleApiKey(rawKey, i);
        finalResults.push(singleResult);
        if (singleResult.valid) validCount++;

        // Update current row result immediately
        setTestResults((prev) => {
          const copy = [...prev];
          copy[i] = singleResult;
          return copy;
        });
      } catch (err: any) {
        const failResult: ApiKeyTestResult = {
          key: rawKey,
          maskedKey: rawKey.length > 10 ? `${rawKey.substring(0, 6)}...${rawKey.substring(rawKey.length - 4)}` : rawKey,
          valid: false,
          error: err.message || 'Gagal koneksi',
          status: 'invalid',
          lineIndex: i,
        };
        finalResults.push(failResult);
        setTestResults((prev) => {
          const copy = [...prev];
          copy[i] = failResult;
          return copy;
        });
      }
    }

    setTestingRowIndex(null);
    setIsTesting(false);

    if (validCount === currentLines.length) {
      showToast(`Semua ${validCount} API Key valid & aktif!`, 'success');
      addLog(`Pengecekan API Key: Semua ${validCount}/${currentLines.length} baris valid & aktif.`, 'success');
    } else if (validCount > 0) {
      showToast(`${validCount} dari ${currentLines.length} API Key valid.`, 'warn');
      addLog(`Pengecekan API Key: ${validCount}/${currentLines.length} valid.`, 'warn');
    } else {
      showToast(`Semua (${currentLines.length}) API Key tidak valid. Mohon periksa kembali.`, 'error');
      addLog(`Pengecekan API Key: 0/${currentLines.length} valid.`, 'error');
    }
  };

  // Remove invalid keys from textarea with 1-click
  const handleRemoveInvalidKeys = () => {
    const validOnly = testResults
      .filter((r) => r.valid)
      .map((r) => r.key);

    if (validOnly.length === 0) {
      showToast('Tidak ada API Key yang terverifikasi valid.', 'warn');
      return;
    }

    setTextValue(validOnly.join('\n'));
    setTestResults(
      validOnly.map((k, idx) => ({
        key: k,
        maskedKey: k.length > 10 ? `${k.substring(0, 6)}...${k.substring(k.length - 4)}` : k,
        valid: true,
        status: 'valid',
        lineIndex: idx,
      }))
    );
    showToast(`Tersisa ${validOnly.length} API Key valid di daftar.`, 'success');
  };

  const validCount = testResults.filter((r) => r.valid).length;
  const invalidCount = testResults.filter((r) => r.status === 'invalid' || (r.error && !r.valid)).length;

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
              <h3 className="font-bold text-gray-100 text-base">Konfigurasi Gemini AI & Multi-API Key</h3>
              <p className="text-xs text-gray-400">Pilih model & tes validitas setiap baris API key secara akurat</p>
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
            {/* Model 1: gemini-2.5-flash */}
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

            {/* Model 2: gemini-3.1-pro-preview */}
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

            {/* Model 3: gemini-3.1-flash-lite */}
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

        {/* API Key Input & Management Box */}
        <div className="space-y-4">
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <label className="text-xs font-bold text-gray-300 uppercase tracking-wider block">
                API Key Gemini (1 Baris = 1 Key)
              </label>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-sky-400 font-semibold">
                  {currentLines.length} Key terdeteksi
                </span>
                {invalidCount > 0 && (
                  <button
                    onClick={handleRemoveInvalidKeys}
                    className="text-[10px] font-bold text-rose-300 hover:text-rose-200 bg-rose-950/40 hover:bg-rose-900/60 border border-rose-800/40 px-2 py-0.5 rounded cursor-pointer transition"
                    title="Hapus key yang tidak valid dari kotak input"
                  >
                    <i className="fa-solid fa-trash-can mr-1"></i> Bersihkan Key Gagal
                  </button>
                )}
              </div>
            </div>
            <textarea
              rows={3}
              value={textValue}
              onChange={(e) => {
                setTextValue(e.target.value);
                const updatedLines = e.target.value
                  .split('\n')
                  .map((k) => k.trim())
                  .filter((k) => k.length > 0);
                setTestResults(
                  updatedLines.map((k, idx) => ({
                    key: k,
                    maskedKey: k.length > 10 ? `${k.substring(0, 6)}...${k.substring(k.length - 4)}` : k,
                    valid: false,
                    status: 'pending',
                    lineIndex: idx,
                  }))
                );
              }}
              placeholder={'AIzaSy...\nAIzaSy...\nAIzaSy...'}
              className="w-full glass-input rounded-xl p-3 text-xs text-gray-200 font-mono placeholder-gray-600 focus:outline-none"
            ></textarea>
          </div>

          {/* Real-Time Per-Row Status Table */}
          {testResults.length > 0 && (
            <div className="space-y-2 p-3.5 rounded-xl bg-gray-900/90 border border-gray-800 text-xs">
              <div className="flex justify-between items-center pb-2 border-b border-gray-800/80">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-gray-200 text-xs">Status Verifikasi Per Baris:</span>
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-300 border border-sky-500/30">
                    {validCount} / {testResults.length} Aktif
                  </span>
                </div>
                {isTesting && testingRowIndex !== null && (
                  <div className="text-[11px] text-amber-300 flex items-center gap-1.5 animate-pulse">
                    <i className="fa-solid fa-circle-notch fa-spin text-amber-400"></i>
                    Memeriksa Baris #{testingRowIndex + 1} dari {testResults.length}...
                  </div>
                )}
              </div>

              {/* Line by line list */}
              <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1 custom-scrollbar">
                {testResults.map((res, idx) => {
                  const isRowTesting = testingRowIndex === idx;
                  const isRowValid = res.valid;
                  const isRowFailed = res.status === 'invalid' || (!res.valid && res.error);
                  const isRowPending = !isRowTesting && !isRowValid && !isRowFailed;

                  return (
                    <div
                      key={idx}
                      className={`flex items-center justify-between p-2 rounded-xl text-[11px] font-mono transition border ${
                        isRowTesting
                          ? 'bg-amber-950/30 border-amber-500/50 shadow-md shadow-amber-500/10'
                          : isRowValid
                          ? 'bg-emerald-950/30 text-emerald-300 border-emerald-800/50'
                          : isRowFailed
                          ? 'bg-rose-950/30 text-rose-300 border-rose-800/50'
                          : 'bg-gray-950/40 text-gray-300 border-gray-800/60'
                      }`}
                    >
                      {/* Left: Row Number & Masked Key */}
                      <div className="flex items-center gap-2 truncate mr-2">
                        <span className="px-1.5 py-0.5 rounded bg-gray-800 text-gray-400 text-[10px] font-sans font-bold flex-shrink-0">
                          #{idx + 1}
                        </span>
                        <span className="truncate text-gray-200 font-mono font-medium">{res.maskedKey}</span>
                      </div>

                      {/* Right: Detailed Status Badge & Retest Button */}
                      <div className="flex items-center gap-2 flex-shrink-0 font-sans">
                        {res.latencyMs !== undefined && res.latencyMs > 0 && isRowValid && (
                          <span className="text-[10px] text-emerald-400/90 font-mono">
                            ⚡ {res.latencyMs}ms
                          </span>
                        )}

                        {isRowTesting ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1">
                            <i className="fa-solid fa-spinner fa-spin text-amber-400"></i> Memeriksa...
                          </span>
                        ) : isRowValid ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1">
                            <i className="fa-solid fa-check"></i> Aktif & Valid
                          </span>
                        ) : isRowFailed ? (
                          <span
                            className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40 flex items-center gap-1"
                            title={res.error}
                          >
                            <i className="fa-solid fa-triangle-exclamation"></i> {res.error || 'Gagal'}
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-gray-800 text-gray-400 border border-gray-700">
                            ⏳ Belum dites
                          </span>
                        )}

                        {/* Individual Row Test Button */}
                        <button
                          onClick={() => handleTestSingleRow(idx)}
                          disabled={isTesting || isRowTesting}
                          className="px-2 py-0.5 rounded bg-gray-800 hover:bg-sky-600/30 text-gray-300 hover:text-sky-300 text-[10px] font-bold transition cursor-pointer disabled:opacity-40 border border-gray-700"
                          title="Tes baris ini saja"
                        >
                          <i className="fa-solid fa-play text-[9px] mr-1"></i> Tes
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Info Banner */}
          <div className="p-3 rounded-xl bg-sky-950/30 border border-sky-800/40 text-[11px] text-gray-300 space-y-1">
            <div className="flex items-center gap-1.5 font-bold text-sky-400">
              <i className="fa-solid fa-circle-check"></i> Multi-Key Auto-Rotation & Fallback Aktif:
            </div>
            <p className="text-gray-400">
              Setiap baris API Key akan dirotasi secara otomatis untuk menghindari rate-limit. Jika salah satu key mencapai limit, sistem otomatis beralih ke key berikutnya.
            </p>
          </div>
        </div>

        {/* Modal Actions */}
        <div className="border-t border-gray-800 pt-4 flex flex-wrap justify-between items-center gap-3">
          <button
            onClick={handleTestSequentialAll}
            disabled={isTesting || currentLines.length === 0}
            className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-sky-600 to-cyan-600 hover:from-sky-500 hover:to-cyan-500 text-white text-xs font-bold transition flex items-center gap-2 cursor-pointer disabled:opacity-50 shadow-md shadow-sky-500/20"
          >
            {isTesting ? (
              <>
                <i className="fa-solid fa-spinner fa-spin text-white"></i> Memeriksa Satu Per Satu...
              </>
            ) : (
              <>
                <i className="fa-solid fa-bolt text-yellow-300"></i> Tes Semua (Satu Per Satu)
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
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 text-white font-bold text-xs transition cursor-pointer shadow-lg shadow-emerald-500/20"
            >
              Simpan & Terapkan
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
