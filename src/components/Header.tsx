import React from 'react';
import { GeminiModel } from '../types';

interface HeaderProps {
  apiKeyCount: number;
  hasServerKey?: boolean;
  animationCount: number;
  selectedModel?: GeminiModel;
  isTrialActive?: boolean;
  trialRemainingText?: string;
  activeTab?: 'prompt' | 'image_to_motion';
  onSelectTab?: (tab: 'prompt' | 'image_to_motion') => void;
  onOpenLicenseModal?: () => void;
  onOpenApiModal: () => void;
  onOpenAutoPilotModal: () => void;
  onOpenGalleryModal: () => void;
  onOpenTutorialModal?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  apiKeyCount,
  hasServerKey = true,
  animationCount,
  selectedModel = 'gemini-3.1-pro-preview',
  isTrialActive = false,
  trialRemainingText = '',
  activeTab = 'prompt',
  onSelectTab,
  onOpenLicenseModal,
  onOpenApiModal,
  onOpenAutoPilotModal,
  onOpenGalleryModal,
  onOpenTutorialModal,
}) => {
  const getModelBadge = (model: GeminiModel | string = 'gemini-3.1-pro-preview') => {
    switch (model) {
      case 'gemini-3.1-pro-preview':
        return {
          label: '3.1 Pro',
          fullName: 'Gemini 3.1 Pro Preview (Masterpiece)',
          color: 'text-purple-300 bg-purple-500/20 border-purple-500/50 shadow-purple-500/20 hover:bg-purple-500/30',
          dotColor: 'bg-purple-400',
        };
      case 'gemini-3.1-flash-lite':
        return {
          label: '3.1 Lite',
          fullName: 'Gemini 3.1 Flash Lite (Ringan & Cepat)',
          color: 'text-amber-300 bg-amber-500/20 border-amber-500/50 shadow-amber-500/20 hover:bg-amber-500/30',
          dotColor: 'bg-amber-400',
        };
      case 'gemini-2.5-flash':
        return {
          label: '2.5 Flash',
          fullName: 'Gemini 2.5 Flash (Stabil)',
          color: 'text-emerald-300 bg-emerald-500/20 border-emerald-500/50 shadow-emerald-500/20 hover:bg-emerald-500/30',
          dotColor: 'bg-emerald-400',
        };
      default:
        return {
          label: '3.1 Pro',
          fullName: 'Gemini 3.1 Pro Preview',
          color: 'text-purple-300 bg-purple-500/20 border-purple-500/50 shadow-purple-500/20 hover:bg-purple-500/30',
          dotColor: 'bg-purple-400',
        };
    }
  };

  const badge = getModelBadge(selectedModel);

  return (
    <header className="sticky top-0 z-40 glass-card border-b border-gray-800/80 px-3 sm:px-6 py-2.5 transition-all">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
        {/* Brand Logo with micro animation */}
        <div className="flex items-center space-x-2.5 shrink-0">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-sky-500 via-indigo-500 to-purple-600 flex items-center justify-center text-white shadow-md shadow-sky-500/20 hover:scale-105 transition-transform">
            <i className="fa-solid fa-clapperboard text-sm"></i>
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h1 className="font-extrabold text-base tracking-tight bg-gradient-to-r from-white via-gray-100 to-sky-400 bg-clip-text text-transparent">
                BigMA
              </h1>
              {isTrialActive ? (
                <button
                  onClick={onOpenLicenseModal}
                  className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] font-black uppercase tracking-wider flex items-center gap-1 hover:bg-amber-500/30 transition cursor-pointer animate-pulse"
                  title="Klik untuk Aktivasi Lisensi Seumur Hidup"
                >
                  <i className="fa-solid fa-bolt text-amber-400 text-[9px]"></i>
                  <span>Trial 1 Hari ({trialRemainingText || '24 Jam'})</span>
                </button>
              ) : (
                <span className="px-1.5 py-0.2 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-[9px] font-extrabold uppercase tracking-wider">
                  PRO
                </span>
              )}
            </div>
            <p className="text-[10px] text-gray-400 font-medium hidden sm:block">Motion Graphic AI Optimation</p>
          </div>
        </div>

        {/* Center: Primary Mode Switcher (Highlighting Image to Motion) */}
        {onSelectTab && (
          <div className="hidden md:flex items-center bg-slate-950/80 p-1 rounded-2xl border border-gray-800/80 shadow-inner">
            <button
              onClick={() => onSelectTab('prompt')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'prompt'
                  ? 'bg-gradient-to-r from-sky-600 to-indigo-600 text-white shadow-md shadow-sky-500/20'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-slate-900'
              }`}
            >
              <i className="fa-solid fa-sliders text-xs"></i>
              <span>Prompt AI</span>
            </button>

            <button
              onClick={() => onSelectTab('image_to_motion')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer relative ${
                activeTab === 'image_to_motion'
                  ? 'bg-gradient-to-r from-amber-500 to-yellow-400 text-slate-950 shadow-lg shadow-amber-500/30'
                  : 'text-amber-300 hover:text-amber-100 hover:bg-amber-500/10'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
              <i className="fa-solid fa-wand-magic-sparkles text-xs"></i>
              <span>IMAGE TO MOTION</span>
              <span className="text-[9px] bg-slate-950 text-amber-300 px-1.5 py-0.2 rounded-full font-bold uppercase tracking-wider ml-0.5">
                Special
              </span>
            </button>
          </div>
        )}

        {/* Action Controls - Compressed and optimized */}
        <div className="flex items-center space-x-1.5 sm:space-x-2">
          {/* Tutorial / Panduan Button - Highly Visible */}
          {onOpenTutorialModal && (
            <button
              onClick={onOpenTutorialModal}
              className="flex items-center space-x-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl bg-gradient-to-r from-emerald-500/20 via-teal-500/20 to-sky-500/20 hover:from-emerald-500/30 hover:to-sky-500/30 text-emerald-300 border border-emerald-500/50 hover:border-emerald-400 transition text-xs font-black shadow-md shadow-emerald-500/15 cursor-pointer active:scale-95"
              title="Buka Buku Panduan & Tutorial Lengkap Seluruh Fitur"
            >
              <i className="fa-solid fa-book-open-reader text-emerald-400 text-xs"></i>
              <span className="hidden sm:inline tracking-wide">TUTORIAL</span>
              <span className="sm:hidden">Panduan</span>
            </button>
          )}

          {/* Active AI Model Indicator */}
          <button
            onClick={onOpenApiModal}
            className={`flex items-center space-x-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl border text-xs font-bold transition cursor-pointer shadow-sm active:scale-95 ${badge.color}`}
            title={`Model AI Aktif: ${badge.fullName}. Klik untuk ganti model atau kelola API Key.`}
          >
            <span className="relative flex h-2 w-2">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${badge.dotColor}`}></span>
              <span className={`relative inline-flex rounded-full h-2 w-2 ${badge.dotColor}`}></span>
            </span>
            <i className="fa-solid fa-microchip text-[11px]"></i>
            <span className="hidden sm:inline text-[10px] font-semibold opacity-80">AI:</span>
            <span className="font-extrabold tracking-wide uppercase text-[11px]">{badge.label}</span>
          </button>

          {/* Settings Gear Button */}
          <button
            onClick={onOpenApiModal}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-gray-900/80 hover:bg-gray-800 border border-gray-800/90 transition text-xs font-semibold text-gray-300 cursor-pointer shadow-sm active:scale-95"
            title="Pengaturan Aplikasi, API Key & Render"
          >
            <i className="fa-solid fa-gear text-sky-400 text-sm"></i>
            <span className="hidden sm:inline">Setelan</span>
          </button>



          {/* Auto Pilot Trigger Button */}
          <button
            onClick={onOpenAutoPilotModal}
            className="flex items-center space-x-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl bg-gradient-to-r from-amber-500/15 to-orange-500/15 text-amber-300 border border-amber-500/30 hover:bg-amber-500/25 transition text-xs font-bold shadow-md shadow-amber-500/10 cursor-pointer active:scale-95"
            title="Batch Auto Pilot Generator"
          >
            <i className="fa-solid fa-robot text-amber-400 text-xs"></i>
            <span className="hidden sm:inline">Auto Pilot</span>
          </button>

          {/* Gallery Badge */}
          <button
            onClick={onOpenGalleryModal}
            className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-xl bg-sky-500/10 text-sky-400 border border-sky-500/20 text-xs font-semibold hover:bg-sky-500/20 transition cursor-pointer active:scale-95"
            title="Lihat Galeri Animasi"
          >
            <i className="fa-solid fa-layer-group text-xs"></i>
            <span className="font-bold">{animationCount}</span>
          </button>
        </div>
      </div>
    </header>
  );
};
