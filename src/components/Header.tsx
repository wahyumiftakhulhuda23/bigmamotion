import React from 'react';
import { GeminiModel } from '../types';

interface HeaderProps {
  apiKeyCount: number;
  hasServerKey?: boolean;
  animationCount: number;
  selectedModel?: GeminiModel;
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
  onOpenApiModal,
  onOpenAutoPilotModal,
  onOpenVideoConverterModal,
  onOpenGalleryModal,
}) => {
  const getModelBadge = (model: GeminiModel | string = 'gemini-2.5-flash') => {
    switch (model) {
      case 'gemini-2.5-flash':
        return { label: '2.5 Flash (Canggih & Stabil)', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' };
      case 'gemini-3.1-pro-preview':
        return { label: '3.1 Pro (Reasoning)', color: 'text-purple-400 bg-purple-500/10 border-purple-500/30' };
      case 'gemini-3.1-flash-lite':
        return { label: '3.1 Lite (Hemat)', color: 'text-amber-400 bg-amber-500/10 border-amber-500/30' };
      default:
        return { label: '2.5 Flash (Stabil)', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' };
    }
  };

  const badge = getModelBadge(selectedModel);

  return (
    <header className="sticky top-0 z-40 glass-card border-b border-gray-800/80 px-4 lg:px-8 py-3.5">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        {/* Brand Logo */}
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-sky-500 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-sky-500/20">
            <i className="fa-solid fa-clapperboard text-lg"></i>
          </div>
          <div>
            <h1 className="font-extrabold text-lg tracking-tight bg-gradient-to-r from-white via-gray-200 to-sky-400 bg-clip-text text-transparent">
              BigMA
            </h1>
            <p className="text-xs text-gray-400 font-medium">Motion Graphic AI Optimation</p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center space-x-2 sm:space-x-3">
          {/* API & Model Status Trigger */}
          <button
            onClick={onOpenApiModal}
            className="flex items-center space-x-2 px-3 py-1.5 rounded-lg bg-gray-800/80 hover:bg-gray-700/80 border border-gray-700/60 transition text-xs font-semibold text-gray-300 cursor-pointer"
            title="Kelola Model AI & API Key Gemini"
          >
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                apiKeyCount > 0 || hasServerKey ? 'bg-emerald-500' : 'bg-amber-500'
              } animate-pulse`}
            ></span>
            <span className="hidden md:inline">Model:</span>
            <span className={`px-2 py-0.5 rounded text-[11px] font-bold border ${badge.color}`}>
              {badge.label}
            </span>
            <i className="fa-solid fa-gear text-sky-400 ml-1"></i>
          </button>

          {/* HTML to Video Converter Button */}
          <button
            onClick={onOpenVideoConverterModal}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-purple-500/20 to-indigo-500/20 text-purple-300 border border-purple-500/30 hover:bg-purple-500/30 transition text-xs font-bold shadow-lg shadow-purple-500/10 cursor-pointer"
            title="Konversi HTML ke MP4 H.264 Universal"
          >
            <i className="fa-solid fa-film text-purple-400"></i>
            <span className="hidden sm:inline">HTML to MP4</span>
            <span className="sm:hidden">MP4</span>
          </button>

          {/* Auto Pilot Trigger Button */}
          <button
            onClick={onOpenAutoPilotModal}
            className="flex items-center space-x-2 px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-amber-500/20 to-orange-500/20 text-amber-300 border border-amber-500/30 hover:bg-amber-500/30 transition text-xs font-bold shadow-lg shadow-amber-500/10 cursor-pointer"
            title="Batch Auto Pilot Generator"
          >
            <i className="fa-solid fa-robot text-amber-400 animate-bounce"></i>
            <span className="hidden sm:inline">Auto Pilot Batch</span>
            <span className="sm:hidden">Auto Pilot</span>
          </button>

          {/* Gallery Badge */}
          <button
            onClick={onOpenGalleryModal}
            className="hidden sm:flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-sky-500/10 text-sky-400 border border-sky-500/20 text-xs font-semibold hover:bg-sky-500/20 transition cursor-pointer"
          >
            <i className="fa-solid fa-layer-group"></i>
            <span>{animationCount} Animasi</span>
          </button>
        </div>
      </div>
    </header>
  );
};
