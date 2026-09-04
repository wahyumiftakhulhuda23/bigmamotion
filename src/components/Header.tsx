import React from 'react';
import { GeminiModel } from '../types';

interface HeaderProps {
  apiKeyCount: number;
  hasServerKey?: boolean;
  animationCount: number;
  selectedModel?: GeminiModel;
  isTrialActive?: boolean;
  trialRemainingText?: string;
  onOpenLicenseModal?: () => void;
  onOpenApiModal: () => void;
  onOpenAutoPilotModal: () => void;
  onOpenVideoConverterModal: () => void;
  onOpenGalleryModal: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  apiKeyCount,
  hasServerKey = true,
  animationCount,
  selectedModel = 'gemini-2.5-flash',
  isTrialActive = false,
  trialRemainingText = '',
  onOpenLicenseModal,
  onOpenApiModal,
  onOpenAutoPilotModal,
  onOpenVideoConverterModal,
  onOpenGalleryModal,
}) => {
  const getModelBadge = (model: GeminiModel | string = 'gemini-2.5-flash') => {
    switch (model) {
      case 'gemini-2.5-flash':
        return { label: '2.5 Flash', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' };
      case 'gemini-3.1-pro-preview':
        return { label: '3.1 Pro', color: 'text-purple-400 bg-purple-500/10 border-purple-500/30' };
      case 'gemini-3.1-flash-lite':
        return { label: '3.1 Lite', color: 'text-amber-400 bg-amber-500/10 border-amber-500/30' };
      default:
        return { label: '2.5 Flash', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' };
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

        {/* Action Controls - Compressed and optimized */}
        <div className="flex items-center space-x-1.5 sm:space-x-2.5">
          {/* API & Model Status Trigger */}
          <button
            onClick={onOpenApiModal}
            className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-xl bg-gray-900/80 hover:bg-gray-800 border border-gray-800/90 transition text-xs font-semibold text-gray-300 cursor-pointer shadow-sm active:scale-95"
            title="Kelola Model AI & API Key Gemini"
          >
            <span
              className={`w-2 h-2 rounded-full ${
                apiKeyCount > 0 || hasServerKey ? 'bg-emerald-500' : 'bg-amber-500'
              } animate-pulse`}
            ></span>
            <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold border ${badge.color}`}>
              {badge.label}
            </span>
            <i className="fa-solid fa-sliders text-sky-400 text-xs ml-0.5"></i>
          </button>

          {/* HTML to Video Converter Button */}
          <button
            onClick={onOpenVideoConverterModal}
            className="flex items-center space-x-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl bg-gradient-to-r from-purple-500/15 to-indigo-500/15 text-purple-300 border border-purple-500/30 hover:bg-purple-500/25 transition text-xs font-bold shadow-md shadow-purple-500/10 cursor-pointer active:scale-95"
            title="Konversi HTML ke MP4 H.264 Universal"
          >
            <i className="fa-solid fa-film text-purple-400 text-xs"></i>
            <span className="hidden sm:inline">HTML to MP4</span>
            <span className="sm:hidden">MP4</span>
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
