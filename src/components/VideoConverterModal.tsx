import React, { useState, useRef } from 'react';
import { VideoConverterFile } from '../types';
import { renderHtmlToVideo } from '../services/videoRenderer';
import JSZip from 'jszip';

interface VideoConverterModalProps {
  isOpen: boolean;
  onClose: () => void;
  showToast: (msg: string, type?: 'info' | 'success' | 'warn' | 'error') => void;
}

export const VideoConverterModal: React.FC<VideoConverterModalProps> = ({ isOpen, onClose, showToast }) => {
  const [files, setFiles] = useState<VideoConverterFile[]>([]);
  const [resolution, setResolution] = useState<{ width: number; height: number; label: string }>({
    width: 1920,
    height: 1080,
    label: '1080p Full HD (1920x1080)',
  });
  const [duration, setDuration] = useState<number>(10);
  const [fps, setFps] = useState<number>(60);
  const [bitrate, setBitrate] = useState<number>(18);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [logs, setLogs] = useState<{ text: string; type: string; timestamp: string }[]>([]);

  const logContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const addLog = (text: string, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString('id-ID');
    setLogs((prev) => [...prev, { text, type, timestamp }]);
    setTimeout(() => {
      if (logContainerRef.current) {
        logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
      }
    }, 50);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement> | React.DragEvent) => {
    let uploaded: File[] = [];
    if ('dataTransfer' in e) {
      e.preventDefault();
      uploaded = Array.from(e.dataTransfer.files);
    } else if (e.target.files) {
      uploaded = Array.from(e.target.files);
    }

    const htmlFiles = uploaded.filter((f) => f.name.endsWith('.html') || f.type === 'text/html');

    if (htmlFiles.length === 0) {
      addLog('[Error] Tidak ada file .html yang valid ditemukan!', 'error');
      showToast('Format tidak didukung. Harap upload berkas .html', 'error');
      return;
    }

    const newItems: VideoConverterFile[] = htmlFiles.map((file) => ({
      id: Math.random().toString(36).substring(2, 9),
      file,
      name: file.name,
      size: (file.size / 1024).toFixed(1) + ' KB',
      status: 'pending',
      videoUrl: null,
      blob: null,
    }));

    setFiles((prev) => [...prev, ...newItems]);
    addLog(`Berhasil menambahkan ${htmlFiles.length} file HTML ke antrean.`, 'success');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeFile = (id: string) => {
    if (isProcessing) return showToast('Proses sedang berjalan.', 'warn');
    setFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const clearAll = () => {
    if (isProcessing) return showToast('Tidak dapat membersihkan saat proses berjalan.', 'warn');
    setFiles([]);
    setLogs([]);
    addLog('Antrean dan riwayat telah dibersihkan.', 'info');
  };

  const processSingleFile = async (index: number): Promise<void> => {
    const fileObj = files[index];
    const pct = ((index + 1) / files.length) * 100;
    addLog(`[${index + 1}/${files.length} - ${pct.toFixed(0)}%] Memulai Render: ${fileObj.name}`, 'warn');

    setFiles((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], status: 'recording' };
      return next;
    });

    try {
      const htmlText = await fileObj.file.text();
      addLog(`    Membaca kode HTML & menyusun pipeline render MP4 (H.264)...`, 'info');

      const result = await renderHtmlToVideo(htmlText, {
        width: resolution.width,
        height: resolution.height,
        fps,
        duration,
        bitrate,
        onProgress: (percent, msg) => {
          if (percent === 10 || percent === 50 || percent === 90) {
            addLog(`    [${percent}%] ${msg}`, 'info');
          }
        },
      });

      setFiles((prev) => {
        const next = [...prev];
        next[index] = {
          ...next[index],
          status: 'done',
          videoUrl: result.url,
          blob: result.blob,
          size: result.sizeFormatted,
        };
        return next;
      });

      addLog(`[Sukses] Berhasil merender MP4: ${fileObj.name} (${result.sizeFormatted})${result.engineUsed === 'webcodecs' ? ' [H.264 FastStart]' : ' [Universal Recorder]'}`, 'success');
    } catch (err: any) {
      console.error(err);
      addLog(`[Gagal] ${fileObj.name}: ${err.message}`, 'error');
      setFiles((prev) => {
        const next = [...prev];
        next[index] = {
          ...next[index],
          status: 'error',
          error: err.message,
        };
        return next;
      });
    }
  };

  const startBatchProcess = async () => {
    if (files.length === 0) {
      return showToast('Antrean file kosong! Silakan upload file .html terlebih dahulu.', 'warn');
    }

    setIsProcessing(true);
    addLog(`========== MEMULAI PROSES KONVERSI BATCH MP4 (${files.length} FILE) ==========`, 'warn');
    addLog(`Pengaturan: ${resolution.label} | ${fps} FPS | Durasi: ${duration}s | Bitrate: ${bitrate} Mbps`, 'info');

    for (let i = 0; i < files.length; i++) {
      if (files[i].status !== 'done') {
        await processSingleFile(i);
        await new Promise((r) => setTimeout(r, 600));
      }
    }

    setIsProcessing(false);
    addLog(`========== SEMUA FILE SELESAI DIKONVERSI KE MP4 ==========`, 'success');
    showToast('Proses konversi MP4 selesai!', 'success');
  };

  const downloadSingleVideo = (fileObj: VideoConverterFile) => {
    if (!fileObj.videoUrl) return;
    const a = document.createElement('a');
    a.href = fileObj.videoUrl;
    const baseName = fileObj.name.replace(/\.[^/.]+$/, '');
    const resLabel = resolution.width === 3840 ? '4K' : resolution.width === 1920 ? '1080p' : '720p';
    a.download = `${baseName}_${resLabel}_${fps}fps_${bitrate}Mbps.mp4`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    showToast(`Mengunduh ${baseName}.mp4`, 'success');
  };

  const downloadAllVideosZip = async () => {
    const doneFiles = files.filter((f) => f.status === 'done' && f.blob);
    if (doneFiles.length === 0) {
      return showToast('Belum ada video MP4 yang selesai dikonversi.', 'warn');
    }

    addLog(`Mengompres ${doneFiles.length} video MP4 ke dalam berkas ZIP...`, 'info');
    showToast('Menyiapkan file ZIP...', 'info');

    try {
      const zip = new JSZip();
      const resLabel = resolution.width === 3840 ? '4K' : resolution.width === 1920 ? '1080p' : '720p';
      doneFiles.forEach((item, idx) => {
        const baseName = item.name.replace(/\.[^/.]+$/, '');
        const filename = `${String(idx + 1).padStart(2, '0')}_${baseName}_${resLabel}_${fps}fps_${bitrate}Mbps.mp4`;
        if (item.blob) {
          zip.file(filename, item.blob);
        }
      });

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `BigMA_MP4_Videos_${Date.now()}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 5000);

      addLog(`[Sukses] Berkas ZIP berhasil diunduh.`, 'success');
      showToast('Paket ZIP video MP4 berhasil diunduh!', 'success');
    } catch (e: any) {
      addLog(`[Gagal ZIP] ${e.message}`, 'error');
      showToast(`Gagal membuat ZIP: ${e.message}`, 'error');
    }
  };

  const completedCount = files.filter((f) => f.status === 'done').length;

  return (
    <div
      id="video-converter-modal"
      className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto"
    >
      <div className="glass-card rounded-2xl max-w-5xl w-full border border-gray-800 p-6 space-y-4 max-h-[92vh] flex flex-col shadow-2xl my-6">
        {/* Header */}
        <div className="flex justify-between items-center border-b border-gray-800 pb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-500/20 border border-purple-500/40 flex items-center justify-center text-purple-400">
              <i className="fa-solid fa-film text-lg"></i>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-gray-100 text-base">HTML5 Animation to MP4 Video Converter</h3>
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold">
                  H.264 Universal (FastStart)
                </span>
              </div>
              <p className="text-xs text-gray-400">
                Konversi animasi Canvas HTML microstock menjadi video MP4 murni (H.264) 60 FPS yang 100% bisa diputar di Windows Media Player, QuickTime, VLC, CapCut & Adobe Premiere.
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              if (isProcessing) return showToast('Tunggu hingga proses selesai!', 'warn');
              onClose();
            }}
            className="text-gray-400 hover:text-white text-lg cursor-pointer"
          >
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>

        {/* Configuration Row */}
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 bg-gray-900/60 p-3.5 rounded-xl border border-gray-800 text-xs">
          <div className="space-y-1">
            <label className="font-bold text-gray-400 uppercase text-[10px]">Resolusi Video</label>
            <select
              value={`${resolution.width}x${resolution.height}`}
              onChange={(e) => {
                const [w, h] = e.target.value.split('x').map(Number);
                const label = w === 1920 ? '1080p Full HD (1920x1080)' : w === 3840 ? '4K Ultra HD (3840x2160)' : '720p HD (1280x720)';
                setResolution({ width: w, height: h, label });
              }}
              className="w-full bg-gray-950 border border-gray-700 rounded-lg p-2 text-gray-200 focus:outline-none cursor-pointer"
            >
              <option value="1920x1080">1080p Full HD (1920x1080)</option>
              <option value="1280x720">720p HD (1280x720)</option>
              <option value="3840x2160">4K Ultra HD (3840x2160)</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="font-bold text-gray-400 uppercase text-[10px]">Durasi Video</label>
            <select
              value={duration}
              onChange={(e) => setDuration(parseInt(e.target.value))}
              className="w-full bg-gray-950 border border-gray-700 rounded-lg p-2 text-gray-200 focus:outline-none cursor-pointer"
            >
              <option value={5}>5 Detik</option>
              <option value={10}>10 Detik (Standard Microstock)</option>
              <option value={15}>15 Detik</option>
              <option value={20}>20 Detik</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="font-bold text-gray-400 uppercase text-[10px]">Framerate</label>
            <select
              value={fps}
              onChange={(e) => setFps(parseInt(e.target.value))}
              className="w-full bg-gray-950 border border-gray-700 rounded-lg p-2 text-gray-200 focus:outline-none cursor-pointer"
            >
              <option value={60}>60 FPS (Ultra Smooth)</option>
              <option value={30}>30 FPS (Standard)</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="font-bold text-gray-400 uppercase text-[10px]">Bitrate Video</label>
            <select
              value={bitrate}
              onChange={(e) => setBitrate(parseInt(e.target.value))}
              className="w-full bg-gray-950 border border-purple-500/40 rounded-lg p-2 text-purple-300 font-bold focus:outline-none cursor-pointer"
            >
              <option value={18}>18 Mbps (Microstock Pro)</option>
              <option value={25}>25 Mbps (Lossless Look)</option>
              <option value={12}>12 Mbps (High Quality)</option>
              <option value={8}>8 Mbps (Compact File)</option>
            </select>
          </div>
        </div>

        {/* Drag & Drop Upload */}
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleFileUpload}
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed border-purple-500/30 hover:border-purple-500/60 bg-purple-950/10 rounded-2xl p-5 text-center cursor-pointer transition flex flex-col items-center justify-center gap-1.5"
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".html,text/html"
            onChange={handleFileUpload}
            className="hidden"
          />
          <div className="w-10 h-10 rounded-xl bg-purple-500/20 text-purple-400 flex items-center justify-center text-lg">
            <i className="fa-solid fa-cloud-arrow-up"></i>
          </div>
          <p className="text-xs font-bold text-gray-200">
            Klik atau Tarik file <span className="text-purple-400">.html</span> animasi ke sini
          </p>
          <p className="text-[11px] text-gray-500">Mendukung upload batch banyak file sekaligus untuk dikonversi menjadi MP4 60 FPS.</p>
        </div>

        {/* Content Split: Files List + Recording Terminal */}
        <div className="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* File Queue List */}
          <div className="flex flex-col gap-2 overflow-hidden bg-gray-950/60 rounded-xl border border-gray-800 p-3">
            <div className="flex justify-between items-center border-b border-gray-800 pb-2">
              <span className="text-xs font-bold text-gray-300 flex items-center gap-1.5">
                <i className="fa-solid fa-list-check text-purple-400"></i> Antrean File ({files.length})
              </span>
              <button
                onClick={clearAll}
                disabled={isProcessing || files.length === 0}
                className="text-[10px] text-red-400 hover:text-red-300 transition cursor-pointer disabled:opacity-50"
              >
                Bersihkan
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 pr-1 max-h-48 lg:max-h-56">
              {files.length === 0 ? (
                <div className="text-center text-gray-500 text-xs italic py-10">
                  Belum ada file. Upload file HTML untuk memulai konversi ke MP4.
                </div>
              ) : (
                files.map((f) => {
                  const isDone = f.status === 'done';
                  const isRecording = f.status === 'recording';
                  const isError = f.status === 'error';

                  return (
                    <div
                      key={f.id}
                      className={`p-2.5 rounded-lg border flex items-center justify-between gap-3 text-xs transition ${
                        isDone
                          ? 'bg-emerald-950/30 border-emerald-800/40 text-emerald-200'
                          : isRecording
                          ? 'bg-purple-950/40 border-purple-500/50 text-purple-200 animate-pulse'
                          : isError
                          ? 'bg-red-950/30 border-red-800/40 text-red-200'
                          : 'bg-gray-900/60 border-gray-800 text-gray-300'
                      }`}
                    >
                      <div className="flex items-center gap-2 truncate flex-1">
                        <i
                          className={`fa-solid ${
                            isDone
                              ? 'fa-circle-check text-emerald-400'
                              : isRecording
                              ? 'fa-circle-notch fa-spin text-purple-400'
                              : isError
                              ? 'fa-triangle-exclamation text-red-400'
                              : 'fa-file-code text-gray-400'
                          }`}
                        ></i>
                        <span className="truncate font-medium">{f.name}</span>
                        <span className="text-[10px] text-gray-500">({f.size})</span>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {isDone && (
                          <button
                            onClick={() => downloadSingleVideo(f)}
                            className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-[11px] font-bold flex items-center gap-1 transition cursor-pointer"
                            title="Unduh MP4"
                          >
                            <i className="fa-solid fa-download"></i> MP4
                          </button>
                        )}
                        {!isProcessing && (
                          <button
                            onClick={() => removeFile(f.id)}
                            className="text-gray-500 hover:text-red-400 p-1 cursor-pointer"
                            title="Hapus"
                          >
                            <i className="fa-solid fa-trash-can text-xs"></i>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Realtime Terminal Logs */}
          <div className="flex flex-col gap-2 overflow-hidden bg-black/80 rounded-xl border border-gray-900 p-3 font-mono text-[11px]">
            <div className="flex justify-between items-center border-b border-gray-800/80 pb-2">
              <span className="text-gray-400 flex items-center gap-1.5">
                <i className="fa-solid fa-terminal text-emerald-400"></i> Render Engine Console
              </span>
              {isProcessing && (
                <span className="text-emerald-400 text-[10px] flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping"></span> Live Processing
                </span>
              )}
            </div>
            <div ref={logContainerRef} className="flex-1 overflow-y-auto space-y-1 text-gray-300 pr-1 max-h-48 lg:max-h-56">
              {logs.length === 0 ? (
                <div className="text-gray-600 italic">Siap memproses. Klik "Mulai Konversi MP4" di bawah...</div>
              ) : (
                logs.map((l, i) => (
                  <div
                    key={i}
                    className={`leading-relaxed ${
                      l.type === 'success'
                        ? 'text-emerald-400 font-bold'
                        : l.type === 'error'
                        ? 'text-red-400 font-bold'
                        : l.type === 'warn'
                        ? 'text-amber-400'
                        : 'text-gray-400'
                    }`}
                  >
                    <span className="text-gray-600 mr-1.5">[{l.timestamp}]</span>
                    {l.text}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="border-t border-gray-800 pt-3 flex flex-wrap justify-between items-center gap-3">
          <div className="text-xs text-gray-400">
            Status: <span className="text-white font-bold">{completedCount}</span> dari{' '}
            <span className="text-white font-bold">{files.length}</span> selesai dikonversi ke MP4.
          </div>

          <div className="flex items-center gap-2">
            {completedCount > 0 && (
              <button
                onClick={downloadAllVideosZip}
                className="px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-lg shadow-emerald-600/20 cursor-pointer"
              >
                <i className="fa-solid fa-file-zipper"></i> Unduh Semua MP4 (.ZIP)
              </button>
            )}

            <button
              onClick={startBatchProcess}
              disabled={isProcessing || files.length === 0}
              className="px-5 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-2 shadow-lg shadow-purple-600/30 cursor-pointer disabled:opacity-50"
            >
              {isProcessing ? (
                <>
                  <i className="fa-solid fa-circle-notch fa-spin"></i> Memproses Video MP4...
                </>
              ) : (
                <>
                  <i className="fa-solid fa-play"></i> Mulai Konversi MP4 ({files.length})
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
