import React from 'react';
import { AutoPilotAccount, AnimationType, NicheCategory, VisualStyle, ColorMode, MotionDynamics } from '../types';

export interface FailedAutoPilotItem {
  id: string;
  accountName: string;
  prompt: string;
  type?: AnimationType;
  subCategory?: NicheCategory | string;
  style?: VisualStyle | string;
  isGreenScreen?: boolean;
  colorMode?: ColorMode;
  motionDynamics?: MotionDynamics;
  neonGlow?: boolean;
  error: string;
}

interface AutoPilotModalProps {
  isOpen: boolean;
  accounts: AutoPilotAccount[];
  onAddAccount: () => void;
  onRemoveAccount: (index: number) => void;
  onUpdateAccount: (index: number, updated: Partial<AutoPilotAccount>) => void;
  onStartAutoPilot: (targetAccountName?: string) => void;
  isAutoPilotRunning: boolean;
  onClose: () => void;
  failedItems?: FailedAutoPilotItem[];
  onRetryFailedItems?: () => void;
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
  failedItems = [],
  onRetryFailedItems,
}) => {
  const [selectedTargetAccount, setSelectedTargetAccount] = React.useState<string>('ALL');

  if (!isOpen) return null;

  return (
    <div
      id="autopilot-modal"
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4"
    >
      <div className="glass-card rounded-2xl max-w-3xl w-full border border-sky-500/30 p-6 space-y-5 max-h-[90vh] flex flex-col shadow-2xl bg-slate-950/95">
        <div className="flex justify-between items-center border-b border-gray-800 pb-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-sky-500/20 border border-sky-500/40 flex items-center justify-center text-sky-400">
              <i className="fa-solid fa-sliders text-lg"></i>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-gray-100 text-base">Prompt AI Auto Pilot Engine</h3>
                <span className="text-[10px] bg-sky-500/20 border border-sky-500/40 text-sky-300 font-bold px-2 py-0.5 rounded-full uppercase">
                  Text to Motion
                </span>
              </div>
              <p className="text-xs text-gray-400">Otomatis buat prompt & render animasi secara serial multi-akun dengan variasi visual.</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-lg cursor-pointer">
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto pr-1 flex-1">
          <div className="flex justify-between items-center bg-gray-900/60 p-3 rounded-xl border border-gray-800">
            <span className="text-xs font-bold text-gray-300 uppercase tracking-wider">
              Daftar Akun Prompt AI ({accounts.length})
            </span>
            <button
              onClick={onAddAccount}
              className="px-3 py-1.5 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 border border-sky-500/30 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
            >
              <i className="fa-solid fa-user-plus"></i> Tambah Akun
            </button>
          </div>

          <div id="account-slots-container" className="space-y-3">
            {accounts.length === 0 ? (
              <div className="p-8 text-center border-2 border-dashed border-gray-800 rounded-xl space-y-2">
                <p className="text-xs text-gray-400">Belum ada akun Prompt AI.</p>
                <button
                  type="button"
                  onClick={onAddAccount}
                  className="px-3 py-1.5 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 border border-sky-500/30 text-xs font-bold transition inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <i className="fa-solid fa-plus"></i> Tambah Akun Pertama
                </button>
              </div>
            ) : (
              accounts.map((acc, index) => (
                <div
                  key={acc.id || index}
                  className="glass-card rounded-xl border border-gray-800 p-4 space-y-3 relative bg-gray-900/40"
                >
                  <button
                    type="button"
                    onClick={() => onRemoveAccount(index)}
                    className="absolute top-3 right-3 text-gray-500 hover:text-red-400 text-sm transition cursor-pointer p-1"
                    title="Hapus Akun"
                  >
                    <i className="fa-solid fa-trash"></i>
                  </button>

                {/* Row 1: Nama Akun, Tipe Animasi, Gaya Visual & Jml Prompt */}
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 pr-8">
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
                      <option value="bg">Background Motion</option>
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
                      <option value="flat_vector">Flat Vector Art</option>
                      <option value="cyberpunk">Cyberpunk Neon</option>
                      <option value="corporate">Modern Corporate Flat</option>
                      <option value="glassmorphism">Glassmorphism & 3D</option>
                      <option value="kinetic">Kinetic Typography</option>
                      <option value="fluid">Abstract Fluid Mesh</option>
                      <option value="isometric">Isometric 3D Projection</option>
                      <option value="retro_synth">Retro Synthwave 80s</option>
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
            )))}
          </div>
        </div>

        {/* Failed items notice and retry section */}
        {failedItems.length > 0 && (
          <div className="bg-rose-950/70 border border-rose-500/50 rounded-xl p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-rose-300 text-xs font-bold">
                <i className="fa-solid fa-triangle-exclamation text-rose-400"></i>
                <span>Terdapat {failedItems.length} animasi yang gagal di-generate pada Auto Pilot</span>
              </div>
              {onRetryFailedItems && !isAutoPilotRunning && (
                <button
                  type="button"
                  onClick={onRetryFailedItems}
                  className="px-3 py-1.5 bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-white font-bold text-xs rounded-lg transition flex items-center gap-1.5 cursor-pointer shadow-md"
                >
                  <i className="fa-solid fa-rotate-right text-xs"></i>
                  <span>Ulangi {failedItems.length} Animasi Gagal</span>
                </button>
              )}
            </div>
            <div className="max-h-24 overflow-y-auto space-y-1 pr-1 text-[11px] text-gray-300">
              {failedItems.map((fi, fIdx) => (
                <div key={fi.id || fIdx} className="flex items-center justify-between bg-black/40 px-2 py-1 rounded border border-rose-900/60">
                  <div className="truncate pr-2">
                    <span className="font-bold text-amber-300 mr-1.5">[{fi.accountName}]</span>
                    <span>{fi.prompt}</span>
                  </div>
                  <span className="text-rose-400 text-[10px] shrink-0">{fi.error}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="border-t border-gray-800 pt-4 flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-[11px] font-bold text-gray-400 shrink-0">Jalankan untuk:</label>
            <select
              value={selectedTargetAccount}
              onChange={(e) => setSelectedTargetAccount(e.target.value)}
              className="bg-gray-950 border border-sky-500/40 rounded-lg px-2.5 py-1.5 text-xs text-sky-300 font-bold focus:outline-none focus:ring-1 focus:ring-sky-400 cursor-pointer"
            >
              <option value="ALL">Semua Akun Sesuai Antrian (Batch Serial)</option>
              {accounts.map((acc, aIdx) => (
                <option key={acc.id || aIdx} value={acc.name}>
                  Hanya Akun: {acc.name} ({acc.promptCount} item)
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center justify-end gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-semibold cursor-pointer"
            >
              Tutup
            </button>
            <button
              onClick={() => onStartAutoPilot(selectedTargetAccount)}
              disabled={isAutoPilotRunning}
              className="px-5 py-2 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 text-white font-bold text-xs shadow-lg flex items-center gap-2 cursor-pointer disabled:opacity-50"
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
    </div>
  );
};
