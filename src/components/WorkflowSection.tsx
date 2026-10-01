import React, { useState, useRef } from 'react';
import { AnimationType, NicheCategory, VisualStyle, ColorMode, MotionDynamics, NotepadBatch } from '../types';

interface WorkflowSectionProps {
  currentType: AnimationType;
  onSelectType: (type: AnimationType) => void;
  nicheCategory: NicheCategory;
  onSelectNiche: (cat: NicheCategory) => void;
  visualStyle: VisualStyle;
  onSelectStyle: (style: VisualStyle) => void;
  colorMode?: ColorMode;
  onSelectColorMode?: (mode: ColorMode) => void;
  motionDynamics?: MotionDynamics;
  onSelectMotionDynamics?: (dynamics: MotionDynamics) => void;
  neonGlow?: boolean;
  onToggleNeonGlow?: (val: boolean) => void;
  promptCount: number;
  onChangePromptCount: (count: number) => void;
  isGreenScreen?: boolean;
  onToggleGreenScreen?: (val: boolean) => void;
  keywordsText?: string;
  onChangeKeywordsText?: (text: string) => void;
  onGeneratePrompts: () => void;
  isGeneratingPrompts: boolean;
  generatedPrompts: string[];
  onUpdatePrompt: (index: number, text: string) => void;
  onDeletePrompt: (index: number) => void;
  onGenerateAnimations: () => void;
  isGeneratingAnimations: boolean;
  onProcessManualPrompts: (prompts: string[]) => void;
  onProcessNotepadBatches?: (batches: NotepadBatch[]) => void;
  onClearPrompts?: () => void;
  failedPrompts?: string[];
  onRetryFailedPrompts?: () => void;
  onRetrySinglePrompt?: (promptText: string, index: number) => void;
  showToast: (msg: string, type?: 'info' | 'success' | 'warn' | 'error') => void;
}

export const WorkflowSection: React.FC<WorkflowSectionProps> = ({
  currentType,
  onSelectType,
  nicheCategory,
  onSelectNiche,
  visualStyle,
  onSelectStyle,
  colorMode = 'gradient',
  onSelectColorMode,
  motionDynamics = 'flow',
  onSelectMotionDynamics,
  neonGlow = true,
  onToggleNeonGlow,
  promptCount,
  onChangePromptCount,
  isGreenScreen = false,
  onToggleGreenScreen,
  keywordsText = '',
  onChangeKeywordsText,
  onGeneratePrompts,
  isGeneratingPrompts,
  generatedPrompts,
  onUpdatePrompt,
  onDeletePrompt,
  onGenerateAnimations,
  isGeneratingAnimations,
  onProcessManualPrompts,
  onProcessNotepadBatches,
  onClearPrompts,
  failedPrompts = [],
  onRetryFailedPrompts,
  onRetrySinglePrompt,
  showToast,
}) => {
  const [manualText, setManualText] = useState('');
  const [showManualSection, setShowManualSection] = useState(false);
  const [showKeywordSection, setShowKeywordSection] = useState(false);
  const [notepadBatches, setNotepadBatches] = useState<NotepadBatch[]>([]);
  const [isNotepadDragging, setIsNotepadDragging] = useState(false);
  const [expandedNotepadId, setExpandedNotepadId] = useState<string | null>(null);

  const notepadFileInputRef = useRef<HTMLInputElement>(null);

  const manualLines = manualText
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const keywordLines = (keywordsText || '')
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

  // Process text files dropped or selected
  const processNotepadFiles = (files: FileList | File[]) => {
    const txtFiles = Array.from(files).filter(
      (f) => f.name.toLowerCase().endsWith('.txt') || f.type === 'text/plain'
    );

    if (txtFiles.length === 0) {
      showToast('Pilih file Notepad (.txt) yang valid', 'warn');
      return;
    }

    const loadedBatches: NotepadBatch[] = [];
    let completed = 0;

    txtFiles.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = (e.target?.result as string) || '';
        const lines = text
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter((l) => l.length > 0);

        if (lines.length > 0) {
          const cleanName = file.name.replace(/\.[^/.]+$/, '').trim() || 'Notepad';
          loadedBatches.push({
            id: 'batch_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
            fileName: file.name,
            name: cleanName,
            prompts: lines,
          });
        }

        completed++;
        if (completed === txtFiles.length) {
          if (loadedBatches.length > 0) {
            setNotepadBatches((prev) => [...prev, ...loadedBatches]);
            const totalPrompts = loadedBatches.reduce((sum, b) => sum + b.prompts.length, 0);
            showToast(`Berhasil memuat ${loadedBatches.length} file Notepad (${totalPrompts} total prompt)!`, 'success');
          } else {
            showToast('File Notepad yang dipilih tidak berisi prompt (kosong).', 'warn');
          }
        }
      };
      reader.readAsText(file);
    });
  };

  const handleRemoveNotepadBatch = (batchId: string) => {
    setNotepadBatches((prev) => prev.filter((b) => b.id !== batchId));
  };

  const handleRunNotepadBatches = () => {
    if (notepadBatches.length === 0) {
      showToast('Belum ada file Notepad yang dimuat!', 'warn');
      return;
    }
    if (onProcessNotepadBatches) {
      onProcessNotepadBatches(notepadBatches);
    }
  };

  return (
    <section className="flex flex-col gap-4 w-full">
      {/* STEP 1: PARAMETER SELECTION COMMAND CENTER */}
      <div className="glass-card rounded-2xl p-4 sm:p-5 border border-gray-800/90 space-y-4 shadow-xl">
        {/* Header Bar */}
        <div className="flex items-center justify-between pb-3 border-b border-gray-800/80">
          <h2 className="font-extrabold text-sm text-gray-100 flex items-center gap-2">
            <span className="w-6 h-6 rounded-lg bg-sky-500/20 text-sky-400 flex items-center justify-center text-xs">
              <i className="fa-solid fa-sliders"></i>
            </span>
            <span>Generator Parameter</span>
          </h2>
          <span className="text-[10px] bg-sky-950/60 text-sky-300 border border-sky-800/60 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
            AI Workflow
          </span>
        </div>

        {/* 1. Animation Type Selection - Sleek Compact Tabs */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-extrabold text-gray-300 uppercase tracking-wider block">
            1. Tipe Animasi Microstock
          </label>
          <div className="grid grid-cols-3 gap-1.5">
            <button
              type="button"
              onClick={() => onSelectType('icon')}
              className={`p-2.5 rounded-xl border flex flex-col items-center gap-1 transition text-xs font-semibold cursor-pointer active:scale-95 ${
                currentType === 'icon'
                  ? 'bg-gradient-to-b from-sky-500/20 to-indigo-500/20 border-sky-400 text-sky-200 shadow-md shadow-sky-500/15'
                  : 'border-gray-800/80 bg-gray-900/40 text-gray-400 hover:border-gray-700 hover:text-gray-200'
              }`}
            >
              <i className="fa-solid fa-shapes text-sm text-sky-400"></i>
              <span className="text-center leading-none text-[11px]">Icon Motion</span>
            </button>
            <button
              type="button"
              onClick={() => onSelectType('text')}
              className={`p-2.5 rounded-xl border flex flex-col items-center gap-1 transition text-xs font-semibold cursor-pointer active:scale-95 ${
                currentType === 'text'
                  ? 'bg-gradient-to-b from-sky-500/20 to-indigo-500/20 border-sky-400 text-sky-200 shadow-md shadow-sky-500/15'
                  : 'border-gray-800/80 bg-gray-900/40 text-gray-400 hover:border-gray-700 hover:text-gray-200'
              }`}
            >
              <i className="fa-solid fa-font text-sm text-purple-400"></i>
              <span className="text-center leading-none text-[11px]">Text Effect</span>
            </button>
            <button
              type="button"
              onClick={() => onSelectType('bg')}
              className={`p-2.5 rounded-xl border flex flex-col items-center gap-1 transition text-xs font-semibold cursor-pointer active:scale-95 ${
                currentType === 'bg'
                  ? 'bg-gradient-to-b from-sky-500/20 to-indigo-500/20 border-sky-400 text-sky-200 shadow-md shadow-sky-500/15'
                  : 'border-gray-800/80 bg-gray-900/40 text-gray-400 hover:border-gray-700 hover:text-gray-200'
              }`}
            >
              <i className="fa-solid fa-cubes-stacked text-sm text-amber-400"></i>
              <span className="text-center leading-none text-[11px]">Background</span>
            </button>
          </div>
        </div>

        {/* 2. Niche & Style Grid (Compact 2 Columns on medium screens) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {/* Niche Selection */}
          <div className="space-y-1">
            <label className="text-[11px] font-extrabold text-gray-300 uppercase tracking-wider block">
              2. Kategori Niche
            </label>
            <select
              value={nicheCategory}
              onChange={(e) => onSelectNiche(e.target.value as NicheCategory)}
              className="w-full glass-input rounded-xl px-2.5 py-2 text-xs text-gray-200 cursor-pointer font-medium"
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

          {/* Style Preset */}
          <div className="space-y-1">
            <label className="text-[11px] font-extrabold text-gray-300 uppercase tracking-wider block">
              Gaya Visual Preset
            </label>
            <select
              value={visualStyle}
              onChange={(e) => onSelectStyle(e.target.value as VisualStyle)}
              className="w-full glass-input rounded-xl px-2.5 py-2 text-xs text-gray-200 cursor-pointer font-medium"
            >
              <option value="minimalist">Minimalist Vector (Clean)</option>
              <option value="flat_vector">Flat Vector Art (Modern Flat)</option>
              <option value="cyberpunk">Cyberpunk Neon Glow</option>
              <option value="corporate">Modern Corporate Flat</option>
              <option value="glassmorphism">Glassmorphism & 3D</option>
              <option value="kinetic">Kinetic Dynamic</option>
              <option value="fluid">Abstract Fluid Mesh</option>
              <option value="isometric">Isometric 3D Projection</option>
              <option value="retro_synth">Retro Synthwave 80s</option>
            </select>
          </div>
        </div>

        {/* 3. Color Mode & Motion Dynamics (Variasi & Anti-Monoton) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {/* Mode Warna / Color Mode */}
          <div className="space-y-1">
            <label className="text-[11px] font-extrabold text-gray-300 uppercase tracking-wider block flex items-center gap-1.5">
              <i className="fa-solid fa-palette text-pink-400 text-[10px]"></i>
              <span>3. Mode Warna</span>
            </label>
            <select
              value={colorMode}
              onChange={(e) => onSelectColorMode && onSelectColorMode(e.target.value as ColorMode)}
              className="w-full glass-input rounded-xl px-2.5 py-2 text-xs text-gray-200 cursor-pointer font-medium"
            >
              <option value="gradient">Gradient Dinamis (Vibrant)</option>
              <option value="flat">Flat Solid (Tanpa Gradien / No Gradient)</option>
              <option value="neon">Neon Cyberpunk (Luminescence)</option>
              <option value="monochrome">Monochrome Slate (Minimalist B&W)</option>
              <option value="pastel">Pastel Aesthetic (Soft Colors)</option>
              <option value="luxury">Luxury Gold & Obsidian</option>
            </select>
          </div>

          {/* Fisika Gerakan / Motion Dynamics */}
          <div className="space-y-1">
            <label className="text-[11px] font-extrabold text-gray-300 uppercase tracking-wider block flex items-center gap-1.5">
              <i className="fa-solid fa-person-running text-sky-400 text-[10px]"></i>
              <span>Fisika Gerakan (Dynamics)</span>
            </label>
            <select
              value={motionDynamics}
              onChange={(e) => onSelectMotionDynamics && onSelectMotionDynamics(e.target.value as MotionDynamics)}
              className="w-full glass-input rounded-xl px-2.5 py-2 text-xs text-gray-200 cursor-pointer font-medium"
            >
              <option value="flow">Flow & Harmonic Wave (Mengalir Lembut)</option>
              <option value="bounce">Elastic Bounce (Membal & Squash/Stretch)</option>
              <option value="orbital">3D Orbital Gyroscope (Putaran 3D Orbit)</option>
              <option value="morph">Kinetic Morphing (Perubahan Bentuk Dinamis)</option>
              <option value="cyber">Cyber Step HUD (Telemetri & Laser Scanner)</option>
              <option value="mechanical">Mechanical Clockwork (Gigi Roda Saling Mengunci)</option>
            </select>
          </div>
        </div>

        {/* 4. Compact Settings Row: Neon Glow, Green Screen, Prompt Count */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-center">
          {/* Neon Glow Toggle */}
          <div
            onClick={() => onToggleNeonGlow && onToggleNeonGlow(!neonGlow)}
            className={`p-2 rounded-xl border transition cursor-pointer select-none flex items-center gap-2 ${
              neonGlow
                ? 'bg-purple-950/40 border-purple-500/60 shadow-md shadow-purple-950/30'
                : 'bg-gray-900/40 border-gray-800/80 hover:border-gray-700'
            }`}
          >
            <div
              className={`w-4 h-4 rounded flex items-center justify-center border transition shrink-0 ${
                neonGlow
                  ? 'bg-purple-500 border-purple-400 text-white font-bold'
                  : 'border-gray-700 bg-gray-800 text-transparent'
              }`}
            >
              <i className="fa-solid fa-check text-[9px]"></i>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1">
                <span className="text-[11px] font-bold text-gray-200">Neon Glow</span>
                <span
                  className={`text-[8px] px-1 py-0.1 rounded font-bold uppercase ${
                    neonGlow
                      ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40'
                      : 'bg-gray-800 text-gray-400'
                  }`}
                >
                  {neonGlow ? 'Aktif' : 'Off'}
                </span>
              </div>
            </div>
          </div>

          {/* Green Screen Option */}
          <div
            onClick={() => onToggleGreenScreen && onToggleGreenScreen(!isGreenScreen)}
            className={`p-2 rounded-xl border transition cursor-pointer select-none flex items-center gap-2 ${
              isGreenScreen
                ? 'bg-emerald-950/40 border-emerald-500/60 shadow-md shadow-emerald-950/30'
                : 'bg-gray-900/40 border-gray-800/80 hover:border-gray-700'
            }`}
          >
            <div
              className={`w-4 h-4 rounded flex items-center justify-center border transition shrink-0 ${
                isGreenScreen
                  ? 'bg-emerald-500 border-emerald-400 text-black font-bold'
                  : 'border-gray-700 bg-gray-800 text-transparent'
              }`}
            >
              <i className="fa-solid fa-check text-[9px]"></i>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1">
                <span className="text-[11px] font-bold text-gray-200">Green Screen</span>
                <span className="text-[8px] px-1 py-0.1 rounded font-bold uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                  #00FF00
                </span>
              </div>
            </div>
          </div>

          {/* Prompt Count */}
          <div className="flex items-center justify-between gap-1.5 bg-gray-900/40 border border-gray-800/80 p-1 px-2 rounded-xl">
            <span className="text-[11px] font-bold text-gray-300 whitespace-nowrap">Jml Prompt:</span>
            <input
              type="number"
              min="1"
              max="20"
              value={promptCount}
              onChange={(e) => onChangePromptCount(Math.max(1, parseInt(e.target.value) || 1))}
              className="w-12 bg-gray-950/80 border border-gray-700 rounded-lg px-1.5 py-1 text-xs text-center text-sky-300 font-bold focus:outline-none focus:border-sky-500"
            />
          </div>
        </div>

        {/* Collapsible Keyword Section */}
        <div className="border-t border-gray-800/80 pt-2">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setShowKeywordSection(!showKeywordSection)}
              className="text-xs font-bold text-gray-300 hover:text-sky-300 flex items-center gap-1.5 transition cursor-pointer"
            >
              <i className={`fa-solid fa-chevron-${showKeywordSection ? 'down' : 'right'} text-[10px] text-sky-400`}></i>
              <i className="fa-solid fa-tags text-sky-400 text-xs"></i>
              <span>Keyword Khusus <span className="text-gray-500 font-normal">(Opsional)</span></span>
            </button>
            {keywordLines.length > 0 && (
              <span className="text-[10px] bg-sky-950 text-sky-300 border border-sky-800/60 px-2 py-0.2 rounded-full font-bold">
                {keywordLines.length} keyword
              </span>
            )}
          </div>

          {showKeywordSection && (
            <div className="mt-2 space-y-1.5 animate-fadeIn">
              <textarea
                rows={2}
                value={keywordsText}
                onChange={(e) => onChangeKeywordsText && onChangeKeywordsText(e.target.value)}
                placeholder="Pisahkan per baris... Contoh:&#10;cyber security shield&#10;cloud server sync"
                className="w-full glass-input rounded-xl px-3 py-2 text-xs text-gray-200 focus:outline-none placeholder-gray-600 font-mono resize-y"
              ></textarea>
            </div>
          )}
        </div>

        {/* Primary Action Button: Generate Prompts */}
        <button
          onClick={onGeneratePrompts}
          disabled={isGeneratingPrompts || isGeneratingAnimations}
          className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-sky-500 via-indigo-500 to-purple-600 hover:from-sky-400 hover:to-purple-500 text-white font-extrabold text-xs uppercase tracking-wider shadow-lg shadow-sky-500/20 flex items-center justify-center gap-2 transition active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
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

        {/* Collapsible Manual Prompt & Notepad (.txt) Section */}
        <div className="border-t border-gray-800/80 pt-2 space-y-2">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setShowManualSection(!showManualSection)}
              className="text-xs font-bold text-gray-300 hover:text-white flex items-center gap-1.5 transition cursor-pointer"
            >
              <i className={`fa-solid fa-chevron-${showManualSection ? 'down' : 'right'} text-[10px] text-gray-500`}></i>
              <i className="fa-solid fa-file-lines text-amber-400 text-xs"></i>
              <span>Input Notepad (.txt) & Manual</span>
            </button>
            <div className="flex items-center gap-1.5">
              {notepadBatches.length > 0 && (
                <span className="text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-full font-bold">
                  {notepadBatches.length} Notepad ({notepadBatches.reduce((s, b) => s + b.prompts.length, 0)} Prompt)
                </span>
              )}
              {manualLines.length > 0 && (
                <span className="text-[10px] bg-gray-800 text-gray-300 border border-gray-700 px-2 py-0.2 rounded-full font-bold">
                  {manualLines.length} baris
                </span>
              )}
            </div>
          </div>

          {showManualSection && (
            <div className="mt-2.5 space-y-3 animate-fadeIn">
              {/* Notepad Drag & Drop / Input Zone */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsNotepadDragging(true);
                }}
                onDragLeave={() => setIsNotepadDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsNotepadDragging(false);
                  if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                    processNotepadFiles(e.dataTransfer.files);
                  }
                }}
                onClick={() => notepadFileInputRef.current?.click()}
                className={`p-3.5 rounded-xl border-2 border-dashed transition cursor-pointer text-center relative ${
                  isNotepadDragging
                    ? 'border-amber-400 bg-amber-500/10'
                    : 'border-gray-700/80 hover:border-amber-400/50 bg-slate-950/60'
                }`}
              >
                <input
                  ref={notepadFileInputRef}
                  type="file"
                  multiple
                  accept=".txt,text/plain"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files && e.target.files.length > 0) {
                      processNotepadFiles(e.target.files);
                      e.target.value = '';
                    }
                  }}
                />

                <div className="flex items-center justify-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center text-sm shrink-0">
                    <i className="fa-solid fa-file-lines"></i>
                  </div>
                  <div className="text-left">
                    <p className="text-xs font-bold text-gray-200">
                      Input / Drag & Drop Notepad (.txt)
                    </p>
                    <p className="text-[10px] text-gray-400">
                      Bisa input beberapa notepad sekaligus (1 prompt per baris). Animasi dikelompokkan sesuai nama notepad!
                    </p>
                  </div>
                </div>
              </div>

              {/* Loaded Notepad Files List */}
              {notepadBatches.length > 0 && (
                <div className="space-y-2 bg-slate-950/70 p-2.5 rounded-xl border border-amber-500/30">
                  <div className="flex items-center justify-between text-[11px] font-bold text-amber-300">
                    <span className="flex items-center gap-1.5">
                      <i className="fa-solid fa-list-ol"></i>
                      <span>Daftar File Notepad ({notepadBatches.length})</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setNotepadBatches([])}
                      className="text-[10px] text-gray-400 hover:text-rose-400 transition cursor-pointer"
                    >
                      Hapus Semua
                    </button>
                  </div>

                  <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                    {notepadBatches.map((batch) => {
                      const isExpanded = expandedNotepadId === batch.id;
                      return (
                        <div
                          key={batch.id}
                          className="bg-slate-900 border border-gray-800 rounded-lg p-2 space-y-1 text-xs"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div
                              onClick={() => setExpandedNotepadId(isExpanded ? null : batch.id)}
                              className="flex items-center gap-1.5 font-bold text-gray-200 min-w-0 flex-1 cursor-pointer"
                            >
                              <i className="fa-solid fa-file-lines text-amber-400 text-xs"></i>
                              <span className="truncate">{batch.fileName}</span>
                              <span className="text-[10px] bg-slate-950 text-amber-300 px-1.5 py-0.2 rounded font-mono font-bold">
                                {batch.prompts.length} prompt
                              </span>
                            </div>

                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => setExpandedNotepadId(isExpanded ? null : batch.id)}
                                className="p-1 text-gray-400 hover:text-white transition cursor-pointer"
                                title="Lihat isi prompt"
                              >
                                <i className={`fa-solid fa-chevron-${isExpanded ? 'up' : 'down'} text-[10px]`}></i>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleRemoveNotepadBatch(batch.id)}
                                className="p-1 text-gray-400 hover:text-rose-400 transition cursor-pointer"
                                title="Hapus notepad ini"
                              >
                                <i className="fa-solid fa-xmark text-xs"></i>
                              </button>
                            </div>
                          </div>

                          {isExpanded && (
                            <div className="bg-slate-950 rounded p-1.5 text-[10px] font-mono text-gray-400 space-y-0.5 max-h-24 overflow-y-auto">
                              {batch.prompts.map((p, pIdx) => (
                                <div key={pIdx} className="truncate">
                                  <span className="text-gray-600 mr-1">{pIdx + 1}.</span> {p}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Button to run sequential generation directly from Notepad Batches */}
                  <button
                    type="button"
                    onClick={handleRunNotepadBatches}
                    disabled={isGeneratingAnimations}
                    className="w-full py-2.5 px-3 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-400 hover:from-amber-400 hover:to-yellow-300 text-slate-950 font-black text-xs uppercase tracking-wider transition active:scale-[0.99] flex justify-center items-center gap-2 cursor-pointer shadow-md shadow-amber-500/20 disabled:opacity-50"
                  >
                    <i className="fa-solid fa-bolt text-xs"></i>
                    <span>Generate Animasi dari Notepad ({notepadBatches.reduce((s, b) => s + b.prompts.length, 0)} Total Prompt)</span>
                  </button>
                </div>
              )}

              {/* Textarea for typing manual prompt */}
              <div className="space-y-1.5 pt-1 border-t border-gray-800/60">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">
                  Atau Ketik Prompt Manual:
                </label>
                <textarea
                  rows={3}
                  value={manualText}
                  onChange={(e) => setManualText(e.target.value)}
                  className="w-full glass-input rounded-xl px-3 py-2 text-xs text-gray-200 focus:outline-none placeholder-gray-600 font-mono"
                  placeholder="Ketik prompt Anda di sini... (Satu prompt per baris)"
                ></textarea>
                <button
                  type="button"
                  onClick={handleManualSubmit}
                  disabled={isGeneratingAnimations}
                  className="w-full py-2 px-3 rounded-xl bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-200 font-bold text-xs uppercase tracking-wider transition active:scale-[0.99] flex justify-center items-center gap-2 cursor-pointer disabled:opacity-50 shadow-sm"
                >
                  <i className="fa-solid fa-arrow-right text-sky-400 text-xs"></i>
                  <span>Gunakan Prompt Manual</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* STEP 2: PROMPT REVIEW & RENDER TRIGGER */}
      {generatedPrompts.length > 0 && (
        <div
          id="prompts-review-card"
          className="glass-card rounded-2xl p-4 sm:p-5 border border-sky-500/40 space-y-3.5 shadow-xl animate-fadeIn"
        >
          <div className="flex items-center justify-between pb-2 border-b border-gray-800/80">
            <div>
              <h3 className="font-extrabold text-gray-100 text-xs sm:text-sm flex items-center gap-2">
                <i className="fa-solid fa-list-check text-amber-400"></i> Daftar Prompt Siap Render
              </h3>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] bg-amber-950/80 text-amber-300 border border-amber-700/60 px-2.5 py-0.5 rounded-full font-bold">
                {generatedPrompts.length} Prompt
              </span>
              {onClearPrompts && (
                <button
                  type="button"
                  onClick={onClearPrompts}
                  disabled={isGeneratingAnimations}
                  className="px-2.5 py-1 bg-rose-950/70 hover:bg-rose-900/90 border border-rose-600/50 hover:border-rose-500 text-rose-300 hover:text-white rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-sm active:scale-95 disabled:opacity-40"
                  title="Reset / Bersihkan seluruh prompt siap render"
                >
                  <i className="fa-solid fa-arrow-rotate-left text-[11px]"></i>
                  <span>Reset</span>
                </button>
              )}
            </div>
          </div>

          {/* Error notice banner if any prompt failed */}
          {failedPrompts.length > 0 && (
            <div className="bg-rose-950/70 border border-rose-500/50 rounded-xl p-2.5 flex items-center justify-between gap-2 shadow-inner">
              <div className="flex items-center gap-2 text-rose-300 text-xs font-bold">
                <i className="fa-solid fa-triangle-exclamation text-rose-400"></i>
                <span>Terdapat {failedPrompts.length} animasi yang gagal dibuat sebelumnya</span>
              </div>
              {onRetryFailedPrompts && !isGeneratingAnimations && (
                <button
                  type="button"
                  onClick={onRetryFailedPrompts}
                  className="px-2.5 py-1 bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-500 text-white font-bold text-[11px] rounded-lg transition flex items-center gap-1 cursor-pointer shadow"
                >
                  <i className="fa-solid fa-rotate-right text-[10px]"></i>
                  <span>Ulangi Semua</span>
                </button>
              )}
            </div>
          )}

          {/* Scrollable list of prompts */}
          <div className="bg-gray-950/80 rounded-xl border border-gray-800/80 p-2 shadow-inner">
            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
              {generatedPrompts.map((promptText, idx) => {
                const isFailed = failedPrompts.includes(promptText);
                return (
                  <div
                    key={idx}
                    className={`flex items-center gap-2 p-2 rounded-xl border transition ${
                      isFailed
                        ? 'bg-rose-950/30 border-rose-500/50 shadow-sm'
                        : 'bg-gray-900/90 hover:bg-gray-900 border-gray-800/80'
                    }`}
                  >
                    <span className={`w-5 h-5 rounded-lg text-[11px] font-bold flex items-center justify-center shrink-0 ${
                      isFailed ? 'bg-rose-500/20 text-rose-400' : 'bg-sky-500/20 text-sky-400'
                    }`}>
                      {idx + 1}
                    </span>
                    <input
                      type="text"
                      value={promptText}
                      onChange={(e) => onUpdatePrompt(idx, e.target.value)}
                      className="w-full bg-transparent text-xs text-gray-200 focus:outline-none font-medium px-1"
                    />
                    {isFailed && onRetrySinglePrompt && !isGeneratingAnimations && (
                      <button
                        type="button"
                        onClick={() => onRetrySinglePrompt(promptText, idx)}
                        className="px-2 py-0.5 rounded bg-rose-600/30 hover:bg-rose-600/50 border border-rose-500/50 text-rose-300 text-[10px] font-bold shrink-0 transition flex items-center gap-1 cursor-pointer"
                        title="Ulangi render animasi untuk prompt ini"
                      >
                        <i className="fa-solid fa-rotate-right text-[9px]"></i>
                        <span>Ulangi</span>
                      </button>
                    )}
                    <button
                      onClick={() => onDeletePrompt(idx)}
                      className="text-gray-500 hover:text-red-400 p-1 text-xs shrink-0 transition cursor-pointer"
                      title="Hapus Prompt"
                    >
                      <i className="fa-solid fa-trash"></i>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Action Buttons: Generate Animations & Retry Failed */}
          <div className="flex flex-col gap-2">
            {failedPrompts.length > 0 && onRetryFailedPrompts && !isGeneratingAnimations && (
              <button
                type="button"
                onClick={onRetryFailedPrompts}
                className="w-full py-2.5 px-3 rounded-xl bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-white font-bold text-xs uppercase tracking-wider shadow-md flex items-center justify-center gap-2 transition active:scale-[0.99] cursor-pointer"
                title="Coba ulang render untuk prompt yang sebelumnya mengalami kesalahan"
              >
                <i className="fa-solid fa-rotate-right text-xs"></i>
                <span>Ulangi yang Gagal ({failedPrompts.length} Prompt)</span>
              </button>
            )}

            <button
              onClick={onGenerateAnimations}
              disabled={isGeneratingAnimations}
              className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-extrabold text-xs uppercase tracking-wider shadow-lg shadow-emerald-500/25 flex items-center justify-center gap-2 transition active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {isGeneratingAnimations ? (
                <>
                  <i className="fa-solid fa-spinner fa-spin"></i>
                  <span>Sedang Merender Animasi...</span>
                </>
              ) : (
                <>
                  <i className="fa-solid fa-play"></i>
                  <span>Generate Animasi ({generatedPrompts.length} Item)</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Quick Specs Info - Compact Minimal Pill Card */}
      <div className="glass-card rounded-2xl p-3 border border-gray-800/80 text-[11px] text-gray-400 flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 font-bold text-gray-300">
          <i className="fa-solid fa-circle-check text-emerald-400 text-xs"></i>
          <span>Output Standar: 1080p 60 FPS HD Canvas & MP4 H.264</span>
        </div>
        <span className="text-[10px] bg-gray-800 text-sky-400 px-2 py-0.5 rounded font-mono font-bold">
          Microstock Ready
        </span>
      </div>
    </section>
  );
};
