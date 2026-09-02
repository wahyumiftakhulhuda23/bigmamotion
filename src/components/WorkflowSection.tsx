import React, { useState } from 'react';
import { AnimationType, NicheCategory, VisualStyle } from '../types';

interface WorkflowSectionProps {
  currentType: AnimationType;
  onSelectType: (type: AnimationType) => void;
  nicheCategory: NicheCategory;
  onSelectNiche: (cat: NicheCategory) => void;
  visualStyle: VisualStyle;
  onSelectStyle: (style: VisualStyle) => void;
  promptCount: number;
  onChangePromptCount: (count: number) => void;
  onGeneratePrompts: () => void;
  isGeneratingPrompts: boolean;
  generatedPrompts: string[];
  onUpdatePrompt: (index: number, text: string) => void;
  onDeletePrompt: (index: number) => void;
  onGenerateAnimations: () => void;
  isGeneratingAnimations: boolean;
  onProcessManualPrompts: (prompts: string[]) => void;
  showToast: (msg: string, type?: 'info' | 'success' | 'warn' | 'error') => void;
}

export const WorkflowSection: React.FC<WorkflowSectionProps> = ({
  currentType,
  onSelectType,
  nicheCategory,
  onSelectNiche,
  visualStyle,
  onSelectStyle,
  promptCount,
  onChangePromptCount,
  onGeneratePrompts,
  isGeneratingPrompts,
  generatedPrompts,
  onUpdatePrompt,
  onDeletePrompt,
  onGenerateAnimations,
  isGeneratingAnimations,
  onProcessManualPrompts,
  showToast,
}) => {
  const [manualText, setManualText] = useState('');

  const manualLines = manualText
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const handleManualSubmit = () => {
    if (manualLines.length === 0) {
      showToast('Input prompt masih kosong. Silakan ketik minimal 1 prompt.', 'warn');
      return;
    }
    onProcessManualPrompts(manualLines);
  };

  return (
    <section className="lg:col-span-5 flex flex-col gap-6">
      {/* STEP 1: PARAMETER SELECTION */}
      <div className="glass-card rounded-2xl p-5 border border-gray-800 space-y-5 shadow-xl">
        <div className="flex items-center justify-between pb-3 border-b border-gray-800">
          <h2 className="font-bold text-gray-100 flex items-center gap-2">
            <i className="fa-solid fa-sliders text-sky-400"></i> Alur Generator Animasi
          </h2>
          <span className="text-xs bg-sky-900/40 text-sky-300 border border-sky-700/50 px-2.5 py-0.5 rounded-full font-semibold">
            Langkah 1 & 2
          </span>
        </div>

        {/* 1. Animation Type Selection */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-gray-300 uppercase tracking-wider block">
            1. Tipe Animasi Microstock
          </label>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => onSelectType('icon')}
              className={`p-3 rounded-xl border flex flex-col items-center gap-1.5 transition text-xs font-medium ${
                currentType === 'icon'
                  ? 'bg-sky-600/20 border-sky-500 text-sky-300 shadow-lg shadow-sky-500/10 font-bold'
                  : 'border-gray-800 bg-gray-900/50 text-gray-400 hover:border-gray-700'
              }`}
            >
              <i className="fa-solid fa-shapes text-lg"></i>
              <span className="text-center leading-tight">Icon Motion</span>
            </button>
            <button
              type="button"
              onClick={() => onSelectType('text')}
              className={`p-3 rounded-xl border flex flex-col items-center gap-1.5 transition text-xs font-medium ${
                currentType === 'text'
                  ? 'bg-sky-600/20 border-sky-500 text-sky-300 shadow-lg shadow-sky-500/10 font-bold'
                  : 'border-gray-800 bg-gray-900/50 text-gray-400 hover:border-gray-700'
              }`}
            >
              <i className="fa-solid fa-font text-lg"></i>
              <span className="text-center leading-tight">Text Effect</span>
            </button>
            <button
              type="button"
              onClick={() => onSelectType('bg')}
              className={`p-3 rounded-xl border flex flex-col items-center gap-1.5 transition text-xs font-medium ${
                currentType === 'bg'
                  ? 'bg-sky-600/20 border-sky-500 text-sky-300 shadow-lg shadow-sky-500/10 font-bold'
                  : 'border-gray-800 bg-gray-900/50 text-gray-400 hover:border-gray-700'
              }`}
            >
              <i className="fa-solid fa-cubes-stacked text-lg"></i>
              <span className="text-center leading-tight">Background Motion</span>
            </button>
          </div>
        </div>

        {/* 2. Niche Category Selection */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-gray-300 uppercase tracking-wider flex items-center justify-between">
            <span>2. Kategori Niche / Tema</span>
            <span className="text-[10px] text-sky-400 font-normal">Sangat Disukai Market</span>
          </label>
          <select
            value={nicheCategory}
            onChange={(e) => onSelectNiche(e.target.value as NicheCategory)}
            className="w-full glass-input rounded-xl px-3.5 py-2.5 text-xs text-gray-200 cursor-pointer"
          >
            <option value="marketing">Marketing & Bisnis (Growth Chart, Bullseye, Speaker, Sale)</option>
            <option value="teknologi">Teknologi & AI (Cloud Security, Quantum, Hologram, Circuit)</option>
            <option value="arsitektur">Arsitektur & Properti (Blueprint, Smart Home, Modern City)</option>
            <option value="pendidikan">Pendidikan & E-Learning (Graduation Cap, Book, Brain Idea)</option>
            <option value="transportasi">Transportasi & Logistik (Rocket Launch, Shipping Cargo)</option>
            <option value="kesehatan">Kesehatan & Medis (Heartbeat Pulse, Shield DNA, Medical)</option>
            <option value="finansial">Finansial & Crypto (Bitcoin, Wallet, Vault, Cash Flow)</option>
          </select>
        </div>

        {/* Visual Style Preset */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-gray-300 uppercase tracking-wider block">
            Gaya Visual Preset
          </label>
          <select
            value={visualStyle}
            onChange={(e) => onSelectStyle(e.target.value as VisualStyle)}
            className="w-full glass-input rounded-xl px-3.5 py-2.5 text-xs text-gray-200 cursor-pointer"
          >
            <option value="minimalist">Clean Minimalist Vector (Modern & Commercial)</option>
            <option value="cyberpunk">Cyberpunk Neon & Vivid Glow</option>
            <option value="corporate">Modern Corporate Flat Tech</option>
            <option value="glassmorphism">Glassmorphism & Soft 3D Shadow</option>
            <option value="kinetic">Kinetic Typography Shifting</option>
            <option value="fluid">Abstract Fluid Liquid Mesh Gradient</option>
          </select>
        </div>

        {/* 3. Prompt Count Input */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-gray-300 uppercase tracking-wider block">
            3. Tentukan Jumlah Prompt
          </label>
          <div className="flex items-center gap-3">
            <input
              type="number"
              min="1"
              max="20"
              value={promptCount}
              onChange={(e) => onChangePromptCount(Math.max(1, parseInt(e.target.value) || 1))}
              className="w-full glass-input rounded-xl px-3.5 py-2.5 text-xs text-gray-200 focus:outline-none font-bold"
            />
            <span className="px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-xl text-xs font-bold text-sky-400 whitespace-nowrap">
              Prompt AI
            </span>
          </div>
          <p className="text-[11px] text-gray-400 italic">
            Berapapun jumlah prompt yang ditentukan akan dibuat oleh AI terlebih dahulu.
          </p>
        </div>

        {/* Primary Action 1: Generate Prompts */}
        <button
          onClick={onGeneratePrompts}
          disabled={isGeneratingPrompts || isGeneratingAnimations}
          className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white font-bold text-xs uppercase tracking-wider shadow-lg shadow-sky-500/20 flex items-center justify-center gap-2 transition active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          {isGeneratingPrompts ? (
            <>
              <i className="fa-solid fa-spinner fa-spin"></i>
              <span>Menghasilkan {promptCount} Prompt AI...</span>
            </>
          ) : (
            <>
              <i className="fa-solid fa-wand-magic-sparkles"></i>
              <span>Generate Prompt AI</span>
            </>
          )}
        </button>

        {/* Divider */}
        <div className="flex items-center py-2">
          <div className="flex-1 border-t border-gray-800"></div>
          <span className="px-3 text-[10px] uppercase font-bold text-gray-500 tracking-wider">
            ATAU INPUT MANUAL
          </span>
          <div className="flex-1 border-t border-gray-800"></div>
        </div>

        {/* 4. Manual Prompt Input */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-gray-300 uppercase tracking-wider flex justify-between items-center">
            <span>4. Input Prompt Sendiri</span>
            <span
              className={`text-[10px] px-2 py-0.5 rounded font-bold transition-all border ${
                manualLines.length > 0
                  ? 'bg-sky-900/40 text-sky-300 border-sky-700/50'
                  : 'bg-gray-800 text-sky-400 border-gray-700'
              }`}
            >
              {manualLines.length} Baris / Prompt
            </span>
          </label>
          <textarea
            rows={4}
            value={manualText}
            onChange={(e) => setManualText(e.target.value)}
            className="w-full glass-input rounded-xl px-3.5 py-2.5 text-xs text-gray-200 focus:outline-none placeholder-gray-600 font-mono"
            placeholder="Ketik prompt Anda di sini...&#10;Satu prompt per baris...&#10;Gunakan bahasa Inggris..."
          ></textarea>

          <div className="bg-amber-950/30 border border-amber-900/50 rounded-lg p-2.5 flex items-start gap-2 mt-1">
            <i className="fa-solid fa-circle-info text-amber-500 text-sm mt-0.5"></i>
            <p className="text-[11px] text-amber-400/90 leading-relaxed">
              Pastikan Anda sudah memilih <b>Tipe Animasi</b> dan <b>Gaya Visual</b> di atas. Rekomendasi:{' '}
              <b>Maksimal 6-10 kata per baris/prompt</b> untuk hasil kalkulasi kode AI yang optimal.
            </p>
          </div>

          <button
            onClick={handleManualSubmit}
            disabled={isGeneratingAnimations}
            className="w-full py-3 px-4 mt-2 rounded-xl bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-200 font-bold text-xs uppercase tracking-wider transition active:scale-[0.99] flex justify-center items-center gap-2 shadow-lg cursor-pointer disabled:opacity-50"
          >
            <i className="fa-solid fa-keyboard"></i> <span>Gunakan Prompt Manual</span>
          </button>
        </div>
      </div>

      {/* STEP 2: PROMPT REVIEW & GENERATE ANIMATION */}
      {generatedPrompts.length > 0 && (
        <div
          id="prompts-review-card"
          className="glass-card rounded-2xl p-5 border border-sky-500/30 space-y-4 shadow-xl animate-fadeIn"
        >
          <div className="flex items-center justify-between pb-3 border-b border-gray-800">
            <div>
              <h3 className="font-bold text-gray-100 text-sm flex items-center gap-2">
                <i className="fa-solid fa-list-check text-amber-400"></i> Daftar Prompt Hasil AI
              </h3>
              <p className="text-[11px] text-gray-400">
                Anda dapat meninjau atau mengedit prompt sebelum membuat animasi.
              </p>
            </div>
            <span className="text-xs bg-amber-900/40 text-amber-300 border border-amber-700/50 px-2.5 py-0.5 rounded-full font-bold">
              {generatedPrompts.length} Prompt
            </span>
          </div>

          {/* Box Container Prompt Berbatas & Scrollable */}
          <div className="bg-gray-950/70 rounded-xl border border-gray-800/80 p-2.5 shadow-inner">
            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {generatedPrompts.map((promptText, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-2 bg-gray-900/90 hover:bg-gray-900 p-2 rounded-xl border border-gray-800/80 transition"
                >
                  <span className="w-6 h-6 rounded-lg bg-sky-500/20 text-sky-400 text-xs font-bold flex items-center justify-center shrink-0">
                    {idx + 1}
                  </span>
                  <input
                    type="text"
                    value={promptText}
                    onChange={(e) => onUpdatePrompt(idx, e.target.value)}
                    className="w-full bg-transparent text-xs text-gray-200 focus:outline-none font-medium px-1"
                  />
                  <button
                    onClick={() => onDeletePrompt(idx)}
                    className="text-gray-500 hover:text-red-400 p-1.5 text-xs shrink-0 transition"
                    title="Hapus Prompt"
                  >
                    <i className="fa-solid fa-trash"></i>
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Action Button: Generate Animations */}
          <button
            onClick={onGenerateAnimations}
            disabled={isGeneratingAnimations}
            className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 to-teal-500 text-white font-bold text-xs uppercase tracking-wider shadow-lg shadow-emerald-500/25 flex items-center justify-center gap-2 transition active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {isGeneratingAnimations ? (
              <>
                <i className="fa-solid fa-spinner fa-spin"></i>
                <span>Sedang Merender Animasi...</span>
              </>
            ) : (
              <>
                <i className="fa-solid fa-play"></i>
                <span>Generate Animasi (Satu Per Satu)</span>
              </>
            )}
          </button>
        </div>
      )}

      {/* Quick Specs Info */}
      <div className="glass-card rounded-2xl p-4 border border-gray-800 text-xs space-y-2">
        <div className="font-bold text-gray-300 flex items-center gap-2">
          <i className="fa-solid fa-circle-info text-sky-400"></i> Spesifikasi Output Standar Microstock:
        </div>
        <ul className="text-gray-400 space-y-1 list-disc list-inside">
          <li>Canvas Standard: <strong>16:9 Landscape HD</strong></li>
          <li>Kecepatan Framerate: <strong>60 FPS Smooth HTML5 Canvas</strong></li>
          <li>Ketentuan Icon Motion: <strong>Hanya Icon Sentral, Clean Vector, Tanpa Teks</strong></li>
          <li>Ketentuan Text Effect: <strong>Teks Dinamis + Efek Grafis / Partikel</strong></li>
          <li>Ketentuan Background: <strong>Pure Motion Background, Tanpa Teks</strong></li>
        </ul>
      </div>
    </section>
  );
};
