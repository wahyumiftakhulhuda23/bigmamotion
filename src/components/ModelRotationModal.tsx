import React, { useState } from 'react';
import { GeminiModel } from '../types';

interface ModelRotationModalProps {
  isOpen: boolean;
  currentModel: GeminiModel;
  keyCount: number;
  onConfirmSwitch: (newModel: GeminiModel) => void;
  onOpenApiSettings: () => void;
  onClose: () => void;
}

export const ModelRotationModal: React.FC<ModelRotationModalProps> = ({
  isOpen,
  currentModel,
  keyCount,
  onConfirmSwitch,
  onOpenApiSettings,
  onClose,
}) => {
  const getModelName = (m: GeminiModel) => {
    switch (m) {
      case 'gemini-3.5-flash-lite':
        return 'Gemini 3.5 Flash Lite';
      case 'gemini-3.1-pro-preview':
        return 'Gemini 3.1 Pro Preview';
      case 'gemini-3.1-flash-lite':
        return 'Gemini 3.1 Flash Lite';
      case 'gemini-2.5-flash':
        return 'Gemini 2.5 Flash';
      default:
        return m;
    }
  };

  const getRecommendedModel = (curr: GeminiModel): GeminiModel => {
    if (curr === 'gemini-3.1-pro-preview') return 'gemini-3.5-flash-lite';
    if (curr === 'gemini-3.5-flash-lite') return 'gemini-3.1-flash-lite';
    if (curr === 'gemini-3.1-flash-lite') return 'gemini-2.5-flash';
    return 'gemini-3.5-flash-lite';
  };

  const [selectedTarget, setSelectedTarget] = useState<GeminiModel>(() => getRecommendedModel(currentModel));

  if (!isOpen) return null;

  const currentLabel = getModelName(currentModel);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      <div className="glass-card w-full max-w-lg rounded-2xl border border-amber-500/40 p-6 bg-slate-900/95 shadow-2xl shadow-amber-500/20 text-gray-200 relative overflow-hidden">
        {/* Glow Header Accent */}
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-amber-500 via-rose-500 to-purple-600 animate-pulse"></div>

        <div className="flex items-start gap-3.5 mb-4">
          <div className="w-12 h-12 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-400 flex items-center justify-center text-xl shrink-0 shadow-lg shadow-amber-500/10">
            <i className="fa-solid fa-triangle-exclamation animate-bounce"></i>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/40 text-[10px] font-black uppercase tracking-wider">
                Batas Kuota Limit
              </span>
              <span className="text-xs text-gray-400 font-medium">{keyCount} API Key Terdaftar</span>
            </div>
            <h2 className="text-lg font-black text-white tracking-tight mt-1">
              Semua API Key Limit pada {currentLabel}
            </h2>
          </div>
        </div>

        <p className="text-xs text-gray-300 leading-relaxed mb-4 bg-slate-950/60 p-3.5 rounded-xl border border-gray-800">
          Google memberlakukan kuota limit pemanggilan (RPM/TPM) per-model. Seluruh API Key yang tersimpan saat ini telah mencapai batas kuota pada <strong className="text-amber-300">{currentLabel}</strong>.
          <br /><br />
          <span className="text-emerald-300 font-semibold">Solusi Otomatis:</span> Alihkan ke model alternatif di bawah untuk melanjutkan generasi animasi tanpa jeda. Seluruh model telah disetel dengan standar estetika tinggi, rigging presisi, dan visual 60 FPS yang setara dengan 3.1 Pro!
        </p>

        {/* Model Options */}
        <div className="space-y-2.5 mb-5">
          <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block">
            Pilih Model AI Tujuan Rotasi:
          </label>

          {/* Option: Gemini 3.5 Flash Lite */}
          <div
            onClick={() => setSelectedTarget('gemini-3.5-flash-lite')}
            className={`p-3.5 rounded-xl border cursor-pointer transition flex items-center justify-between ${
              selectedTarget === 'gemini-3.5-flash-lite'
                ? 'bg-amber-500/15 border-amber-400/80 shadow-md shadow-amber-500/15 text-white'
                : 'bg-slate-950/40 border-gray-800 text-gray-400 hover:border-gray-700'
            }`}
          >
            <div className="flex items-center gap-3">
              <div
                className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                  selectedTarget === 'gemini-3.5-flash-lite'
                    ? 'border-amber-400 bg-amber-400 text-slate-950'
                    : 'border-gray-600'
                }`}
              >
                {selectedTarget === 'gemini-3.5-flash-lite' && <i className="fa-solid fa-check text-[10px]"></i>}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-gray-100">Gemini 3.5 Flash Lite</span>
                  <span className="px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[9px] font-black uppercase">
                    Next-Gen Pintar
                  </span>
                </div>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  Ultra cepat, penalaran lebih cerdas, kuota RPM luas, dan efisiensi token maksimal.
                </p>
              </div>
            </div>
            <i className="fa-solid fa-bolt text-amber-400 text-sm"></i>
          </div>

          {/* Option: Gemini 3.1 Flash Lite */}
          <div
            onClick={() => setSelectedTarget('gemini-3.1-flash-lite')}
            className={`p-3.5 rounded-xl border cursor-pointer transition flex items-center justify-between ${
              selectedTarget === 'gemini-3.1-flash-lite'
                ? 'bg-amber-500/15 border-amber-400/80 shadow-md shadow-amber-500/15 text-white'
                : 'bg-slate-950/40 border-gray-800 text-gray-400 hover:border-gray-700'
            }`}
          >
            <div className="flex items-center gap-3">
              <div
                className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                  selectedTarget === 'gemini-3.1-flash-lite'
                    ? 'border-amber-400 bg-amber-400 text-slate-950'
                    : 'border-gray-600'
                }`}
              >
                {selectedTarget === 'gemini-3.1-flash-lite' && <i className="fa-solid fa-check text-[10px]"></i>}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-gray-100">Gemini 3.1 Flash Lite</span>
                  <span className="px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[9px] font-black uppercase">
                    Paling Hemat Kuota
                  </span>
                </div>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  Super ringan, kuota RPM sangat tinggi, efisiensi maksimal agar API Key awet tahan lama.
                </p>
              </div>
            </div>
            <i className="fa-solid fa-bolt text-amber-400 text-sm"></i>
          </div>

          {/* Option: Gemini 2.5 Flash */}
          <div
            onClick={() => setSelectedTarget('gemini-2.5-flash')}
            className={`p-3.5 rounded-xl border cursor-pointer transition flex items-center justify-between ${
              selectedTarget === 'gemini-2.5-flash'
                ? 'bg-emerald-500/15 border-emerald-400/80 shadow-md shadow-emerald-500/15 text-white'
                : 'bg-slate-950/40 border-gray-800 text-gray-400 hover:border-gray-700'
            }`}
          >
            <div className="flex items-center gap-3">
              <div
                className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                  selectedTarget === 'gemini-2.5-flash'
                    ? 'border-emerald-400 bg-emerald-400 text-slate-950'
                    : 'border-gray-600'
                }`}
              >
                {selectedTarget === 'gemini-2.5-flash' && <i className="fa-solid fa-check text-[10px]"></i>}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-gray-100">Gemini 2.5 Flash</span>
                  <span className="px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[9px] font-black uppercase">
                    Stabil
                  </span>
                </div>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  Eksekusi stabil, kuota pemanggilan besar, cocok untuk batch rendering.
                </p>
              </div>
            </div>
            <i className="fa-solid fa-gauge-high text-emerald-400 text-sm"></i>
          </div>

          {/* Option: Tetap di Gemini 3.1 Pro (jika baru tambah key) */}
          <div
            onClick={() => setSelectedTarget('gemini-3.1-pro-preview')}
            className={`p-3.5 rounded-xl border cursor-pointer transition flex items-center justify-between ${
              selectedTarget === 'gemini-3.1-pro-preview'
                ? 'bg-purple-500/15 border-purple-400/80 shadow-md shadow-purple-500/15 text-white'
                : 'bg-slate-950/40 border-gray-800 text-gray-400 hover:border-gray-700'
            }`}
          >
            <div className="flex items-center gap-3">
              <div
                className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                  selectedTarget === 'gemini-3.1-pro-preview'
                    ? 'border-purple-400 bg-purple-400 text-slate-950'
                    : 'border-gray-600'
                }`}
              >
                {selectedTarget === 'gemini-3.1-pro-preview' && <i className="fa-solid fa-check text-[10px]"></i>}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-gray-100">Gemini 3.1 Pro Preview</span>
                  <span className="px-1.5 py-0.2 rounded bg-purple-500/20 text-purple-300 border border-purple-500/40 text-[9px] font-black uppercase">
                    Asli
                  </span>
                </div>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  Coba lagi pada 3.1 Pro (pilih ini jika Anda baru saja memasukkan API Key baru).
                </p>
              </div>
            </div>
            <i className="fa-solid fa-gem text-purple-400 text-sm"></i>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row items-center gap-2.5 pt-2">
          <button
            onClick={() => onConfirmSwitch(selectedTarget)}
            className="w-full sm:flex-1 py-2.5 px-4 rounded-xl bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 hover:from-amber-400 hover:to-orange-500 text-slate-950 font-black text-xs shadow-lg shadow-amber-500/25 active:scale-95 transition cursor-pointer flex items-center justify-center gap-2"
          >
            <i className="fa-solid fa-rotate text-sm"></i>
            <span>Beralih ke {getModelName(selectedTarget)}</span>
          </button>

          <button
            onClick={onOpenApiSettings}
            className="w-full sm:w-auto py-2.5 px-3.5 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-200 font-bold text-xs border border-gray-700 active:scale-95 transition cursor-pointer flex items-center justify-center gap-1.5"
            title="Buka Pengaturan untuk menambahkan API Key baru"
          >
            <i className="fa-solid fa-key text-amber-400 text-xs"></i>
            <span>Tambah Key</span>
          </button>

          <button
            onClick={onClose}
            className="w-full sm:w-auto py-2.5 px-3 rounded-xl bg-slate-950/80 hover:bg-slate-900 text-gray-400 hover:text-gray-200 text-xs font-semibold border border-gray-800 transition cursor-pointer"
          >
            Batal
          </button>
        </div>
      </div>
    </div>
  );
};
