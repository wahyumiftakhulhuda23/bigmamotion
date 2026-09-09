import React from 'react';
import { AutoPilotAccount, AnimationType, NicheCategory, VisualStyle, ColorMode, MotionDynamics } from '../types';

interface AutoPilotModalProps {
  isOpen: boolean;
  accounts: AutoPilotAccount[];
  onAddAccount: () => void;
  onRemoveAccount: (index: number) => void;
  onUpdateAccount: (index: number, updated: Partial<AutoPilotAccount>) => void;
  onStartAutoPilot: () => void;
  isAutoPilotRunning: boolean;
  onClose: () => void;
}

export const AutoPilotModal: React.FC<AutoPilotModalProps> = ({
  isOpen,
  accounts,
  onAddAccount,
  onRemoveAccount,
  onUpdateAccount,
  onStartAutoPilot,
  isAutoPilotRunning,
  onClose,
}) => {
  if (!isOpen) return null;

  return (
    <div
      id="autopilot-modal"
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4"
    >
      <div className="glass-card rounded-2xl max-w-3xl w-full border border-amber-500/30 p-6 space-y-5 max-h-[90vh] flex flex-col shadow-2xl">
        <div className="flex justify-between items-center border-b border-gray-800 pb-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
              <i className="fa-solid fa-robot text-lg"></i>
            </div>
            <div>
              <h3 className="font-bold text-gray-100 text-base">Auto Pilot Batch Engine</h3>
              <p className="text-xs text-gray-400">Otomatis buat prompt & render animasi secara serial / multi-akun dengan variasi visual.</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-lg cursor-pointer">
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto pr-1 flex-1">
          <div className="flex justify-between items-center bg-gray-900/60 p-3 rounded-xl border border-gray-800">
            <span className="text-xs font-bold text-gray-300 uppercase tracking-wider">
              Daftar Akun Auto Pilot ({accounts.length})
            </span>
            <button
              onClick={onAddAccount}
              className="px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
            >
              <i className="fa-solid fa-user-plus"></i> Tambah Akun
            </button>
          </div>

          <div id="account-slots-container" className="space-y-3">
            {accounts.map((acc, index) => (
              <div
                key={acc.id || index}
                className="glass-card rounded-xl border border-gray-800 p-4 space-y-3 relative bg-gray-900/40"
              >
                {accounts.length > 1 && (
                  <button
                    onClick={() => onRemoveAccount(index)}
                    className="absolute top-3 right-3 text-gray-500 hover:text-red-400 text-sm transition cursor-pointer"
                    title="Hapus Akun"
                  >
                    <i className="fa-solid fa-trash"></i>
                  </button>
                )}

                {/* Row 1: Nama Akun, Tipe Animasi & Jml Prompt */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pr-8">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-gray-400 uppercase">Nama Akun / Folder</label>
                    <input
                      type="text"
                      value={acc.name}
                      onChange={(e) => onUpdateAccount(index, { name: e.target.value })}
                      className="w-full bg-gray-950 border border-gray-700 rounded-lg p-2 text-xs text-gray-200 focus:border-sky-500 focus:outline-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-gray-400 uppercase">Tipe Animasi</label>
                    <select
                      value={acc.type}
                      onChange={(e) => onUpdateAccount(index, { type: e.target.value as AnimationType })}
                      className="w-full bg-gray-950 border border-gray-700 rounded-lg p-2 text-xs text-gray-200 focus:border-sky-500 focus:outline-none cursor-pointer"
                    >
                      <option value="icon">Icon Motion</option>
                      <option value="text">Text Effect</option>
                      <option value="bg">Background Motion</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-gray-400 uppercase">Jml Prompt</label>
                    <input
                      type="number"
                      min="1"
                      max="20"
                      value={acc.promptCount}
                      onChange={(e) =>
                        onUpdateAccount(index, { promptCount: Math.max(1, parseInt(e.target.value) || 1) })
                      }
                      className="w-full bg-gray-950 border border-gray-700 rounded-lg p-2 text-xs text-gray-200 focus:border-sky-500 focus:outline-none font-bold"
                    />
                  </div>
                </div>

                {/* Row 2: Kategori Niche & Gaya Visual */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-gray-400 uppercase">Kategori Niche</label>
                    <select
                      value={acc.subCategory}
                      onChange={(e) => onUpdateAccount(index, { subCategory: e.target.value as NicheCategory })}
                      className="w-full bg-gray-950 border border-gray-700 rounded-lg p-2 text-xs text-gray-200 focus:border-sky-500 focus:outline-none cursor-pointer"
                    >
                      <option value="marketing">Marketing & Bisnis</option>
                      <option value="teknologi">Teknologi & AI</option>
                      <option value="arsitektur">Arsitektur & Properti</option>
                      <option value="pendidikan">Pendidikan & E-Learning</option>
                      <option value="transportasi">Transportasi & Logistik</option>
                      <option value="kesehatan">Kesehatan & Medis</option>
                      <option value="finansial">Finansial & Crypto</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-gray-400 uppercase">Gaya Visual</label>
                    <select
                      value={acc.style}
                      onChange={(e) => onUpdateAccount(index, { style: e.target.value as VisualStyle })}
                      className="w-full bg-gray-950 border border-gray-700 rounded-lg p-2 text-xs text-gray-200 focus:border-sky-500 focus:outline-none cursor-pointer"
                    >
                      <option value="minimalist">Clean Minimalist</option>
                      <option value="flat_vector">Flat Vector Art (Modern Flat)</option>
                      <option value="cyberpunk">Cyberpunk Neon</option>
                      <option value="corporate">Modern Corporate Flat</option>
                      <option value="glassmorphism">Glassmorphism & 3D</option>
                      <option value="kinetic">Kinetic Typography</option>
                      <option value="fluid">Abstract Fluid Mesh</option>
                      <option value="isometric">Isometric 3D Projection</option>
                      <option value="retro_synth">Retro Synthwave 80s</option>
                    </select>
                  </div>
                </div>

                {/* Row 3: Mode Warna, Fisika Gerakan & Toggles */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1 border-t border-gray-800/60">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-pink-400 uppercase flex items-center gap-1">
                      <i className="fa-solid fa-palette text-[9px]"></i>
                      <span>Mode Warna</span>
                    </label>
                    <select
                      value={acc.colorMode || 'gradient'}
                      onChange={(e) => onUpdateAccount(index, { colorMode: e.target.value as ColorMode })}
                      className="w-full bg-gray-950 border border-gray-700 rounded-lg p-2 text-xs text-gray-200 focus:border-sky-500 focus:outline-none cursor-pointer"
                    >
                      <option value="gradient">Gradient Dinamis (Vibrant)</option>
                      <option value="flat">Flat Solid (Tanpa Gradien)</option>
                      <option value="neon">Neon Cyberpunk</option>
                      <option value="monochrome">Monochrome Slate (B&W)</option>
                      <option value="pastel">Pastel Aesthetic</option>
                      <option value="luxury">Luxury Gold & Obsidian</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-sky-400 uppercase flex items-center gap-1">
                      <i className="fa-solid fa-person-running text-[9px]"></i>
                      <span>Fisika Gerakan</span>
                    </label>
                    <select
                      value={acc.motionDynamics || 'flow'}
                      onChange={(e) => onUpdateAccount(index, { motionDynamics: e.target.value as MotionDynamics })}
                      className="w-full bg-gray-950 border border-gray-700 rounded-lg p-2 text-xs text-gray-200 focus:border-sky-500 focus:outline-none cursor-pointer"
                    >
                      <option value="flow">Flow & Harmonic Wave</option>
                      <option value="bounce">Elastic Bounce & Squash</option>
                      <option value="orbital">3D Orbital Gyroscope</option>
                      <option value="morph">Kinetic Morphing</option>
                      <option value="cyber">Cyber Step HUD & Laser</option>
                      <option value="mechanical">Mechanical Clockwork</option>
                    </select>
                  </div>

                  <div className="space-y-1 flex flex-col justify-end">
                    <div className="flex items-center gap-2 pt-1">
                      <label
                        className="flex-1 flex items-center gap-1.5 p-1.5 rounded-lg border border-gray-800 bg-gray-950/70 cursor-pointer select-none text-[10px] font-bold text-gray-300"
                        onClick={() => onUpdateAccount(index, { neonGlow: acc.neonGlow === undefined ? false : !acc.neonGlow })}
                      >
                        <input
                          type="checkbox"
                          checked={acc.neonGlow ?? true}
                          onChange={() => {}}
                          className="rounded text-purple-500 focus:ring-0"
                        />
                        <span>Neon Glow</span>
                      </label>
                      <label
                        className="flex-1 flex items-center gap-1.5 p-1.5 rounded-lg border border-gray-800 bg-gray-950/70 cursor-pointer select-none text-[10px] font-bold text-emerald-400"
                        onClick={() => onUpdateAccount(index, { isGreenScreen: !acc.isGreenScreen })}
                      >
                        <input
                          type="checkbox"
                          checked={acc.isGreenScreen ?? false}
                          onChange={() => {}}
                          className="rounded text-emerald-500 focus:ring-0"
                        />
                        <span>Chroma</span>
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="border-t border-gray-800 pt-4 flex justify-between items-center">
          <button
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-semibold cursor-pointer"
          >
            Batal
          </button>
          <button
            onClick={onStartAutoPilot}
            disabled={isAutoPilotRunning}
            className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 text-white font-bold text-xs shadow-lg flex items-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {isAutoPilotRunning ? (
              <>
                <i className="fa-solid fa-spinner fa-spin"></i> Auto Pilot Berjalan...
              </>
            ) : (
              <>
                <i className="fa-solid fa-rocket"></i> Jalankan Auto Pilot
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
