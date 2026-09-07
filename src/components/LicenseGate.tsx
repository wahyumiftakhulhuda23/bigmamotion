import React, { useState, useEffect } from 'react';
import {
  checkLocalTrialStatus,
  startOneDayTrial,
  formatRemainingTime,
  TrialStatus,
} from '../services/trialService';

export const VALID_LICENSE_KEYS = [
  'akusukambg',
  'sayaakanlawan',
  'ha??????',
  'P4ssw0rd_*',
  '1080p',
  '720p',
];

export const STORAGE_LICENSE_ACTIVE = 'bigma_license_active';
export const STORAGE_LICENSE_KEY = 'bigma_license_key';

interface LicenseGateProps {
  onUnlockSuccess: () => void;
  onUnlockTrial?: (expiresAt: number) => void;
}

export const LicenseGate: React.FC<LicenseGateProps> = ({
  onUnlockSuccess,
  onUnlockTrial,
}) => {
  const [inputKey, setInputKey] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isTrialSuccess, setIsTrialSuccess] = useState(false);

  // Trial state
  const [trialStatus, setTrialStatus] = useState<TrialStatus>(() => checkLocalTrialStatus());
  const [isStartingTrial, setIsStartingTrial] = useState(false);

  useEffect(() => {
    // Initial check
    const status = checkLocalTrialStatus();
    setTrialStatus(status);

    // Update countdown every 5 seconds if trial is active
    const interval = setInterval(() => {
      setTrialStatus(checkLocalTrialStatus());
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  const handleActivate = () => {
    const cleanKey = inputKey.trim();

    if (!cleanKey) {
      setErrorMessage('Silakan masukkan kode lisensi Anda terlebih dahulu.');
      return;
    }

    if (VALID_LICENSE_KEYS.includes(cleanKey)) {
      setErrorMessage(null);
      setIsSuccess(true);
      try {
        localStorage.setItem(STORAGE_LICENSE_ACTIVE, 'true');
        localStorage.setItem(STORAGE_LICENSE_KEY, cleanKey);
      } catch (e) {
        console.error('Error saving license state', e);
      }

      setTimeout(() => {
        onUnlockSuccess();
      }, 700);
    } else {
      setErrorMessage('Kode lisensi tidak valid! Akses gagal.');
    }
  };

  const handleStartTrial = async () => {
    if (trialStatus.isExpired) {
      setErrorMessage('Masa percobaan Trial 1 Hari di perangkat ini sudah berakhir. Silakan aktivasi lisensi seumur hidup.');
      return;
    }

    if (trialStatus.isActive && trialStatus.expiresAt) {
      // Continue existing active trial
      setIsTrialSuccess(true);
      setTimeout(() => {
        if (onUnlockTrial && trialStatus.expiresAt) {
          onUnlockTrial(trialStatus.expiresAt);
        } else {
          onUnlockSuccess();
        }
      }, 600);
      return;
    }

    setIsStartingTrial(true);
    try {
      const res = await startOneDayTrial();
      setTrialStatus(res);
      setIsTrialSuccess(true);

      setTimeout(() => {
        if (onUnlockTrial && res.expiresAt) {
          onUnlockTrial(res.expiresAt);
        } else {
          onUnlockSuccess();
        }
      }, 800);
    } catch (e) {
      console.error('Failed to start trial:', e);
      setErrorMessage('Gagal mengaktifkan trial. Silakan coba lagi.');
    } finally {
      setIsStartingTrial(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleActivate();
    }
  };

  const handleWhatsAppRedirect = () => {
    const waNumber = '6281326187769';
    const message = encodeURIComponent(
      'Halo Admin BigMA, saya sudah melakukan pembayaran Rp 40.000 untuk Aktivasi Lisensi Seumur Hidup. Mohon kirimkan License Key aktivasi saya.'
    );
    window.open(`https://wa.me/${waNumber}?text=${message}`, '_blank');
  };

  return (
    <div className="min-h-screen bg-[#070b14] text-gray-100 flex flex-col items-center justify-center p-3 sm:p-4 selection:bg-sky-500 selection:text-white relative overflow-hidden">
      {/* Dynamic Animated Ambient Lights */}
      <div className="absolute top-1/4 left-1/3 -translate-x-1/2 w-96 h-96 bg-sky-600/15 rounded-full blur-3xl pointer-events-none animate-pulse"></div>
      <div className="absolute bottom-1/4 right-1/3 w-80 h-80 bg-purple-600/15 rounded-full blur-3xl pointer-events-none animate-pulse" style={{ animationDelay: '1.5s' }}></div>
      <div className="absolute top-2/3 left-1/2 -translate-x-1/2 w-72 h-72 bg-emerald-600/10 rounded-full blur-3xl pointer-events-none"></div>

      <div className="relative max-w-md w-full space-y-3.5 my-auto py-4 z-10">
        {/* Brand Header */}
        <div className="text-center space-y-1">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-gradient-to-tr from-sky-500 via-indigo-500 to-purple-600 text-white shadow-xl shadow-sky-500/25 mb-1 animate-bounce" style={{ animationDuration: '3s' }}>
            <i className="fa-solid fa-clapperboard text-xl"></i>
          </div>
          <h1 className="text-xl sm:text-2xl font-black tracking-tight bg-gradient-to-r from-white via-sky-200 to-indigo-300 bg-clip-text text-transparent">
            BigMA Motion AI
          </h1>
          <p className="text-xs text-gray-400">
            Aktivasi Lisensi & Akses Generator Microstock
          </p>
        </div>

        {/* --- SECTION 1: TRIAL 1 HARI (FREE TRIAL) --- */}
        <div className={`rounded-2xl border p-4 transition-all duration-300 shadow-xl backdrop-blur-md relative overflow-hidden ${
          trialStatus.isExpired
            ? 'bg-gray-950/80 border-gray-800/80'
            : trialStatus.isActive
            ? 'bg-gradient-to-br from-emerald-950/40 via-[#101726]/90 to-sky-950/40 border-emerald-500/50 shadow-emerald-950/30'
            : 'bg-gradient-to-br from-amber-950/30 via-[#101726]/90 to-sky-950/40 border-amber-500/40 hover:border-amber-400/70 shadow-amber-950/20'
        }`}>
          {/* Subtle Decorative Badge */}
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-2">
              <span className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs font-black ${
                trialStatus.isExpired
                  ? 'bg-gray-800 text-gray-400'
                  : trialStatus.isActive
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                  : 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
              }`}>
                {trialStatus.isExpired ? (
                  <i className="fa-solid fa-lock"></i>
                ) : trialStatus.isActive ? (
                  <i className="fa-solid fa-bolt text-emerald-400"></i>
                ) : (
                  <i className="fa-solid fa-gift text-amber-400"></i>
                )}
              </span>
              <span className="font-extrabold text-xs tracking-wider uppercase text-white">
                {trialStatus.isExpired
                  ? 'TRIAL 1 HARI TELAH BERAKHIR'
                  : trialStatus.isActive
                  ? 'TRIAL 1 HARI SEDANG AKTIF'
                  : 'COBA GRATIS 1 HARI (TRIAL)'}
              </span>
            </div>

            {trialStatus.isActive ? (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold animate-pulse">
                {formatRemainingTime(trialStatus.remainingMs)}
              </span>
            ) : trialStatus.isExpired ? (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/30 font-bold">
                Terkunci
              </span>
            ) : (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold">
                24 Jam Penuh
              </span>
            )}
          </div>

          <p className="text-[11px] text-gray-300 leading-relaxed mb-3">
            {trialStatus.isExpired ? (
              <span>
                Perangkat ini sudah pernah menggunakan masa percobaan 1 hari. Silakan aktivasi <strong className="text-amber-300">Lisensi Seumur Hidup</strong> di bawah untuk membuka akses tanpa batas.
              </span>
            ) : trialStatus.isActive ? (
              <span>
                Masa percobaan Anda masih aktif! Sisa waktu:{' '}
                <strong className="text-emerald-400 font-mono">{formatRemainingTime(trialStatus.remainingMs)}</strong>.
              </span>
            ) : (
              <span>
                Belum membeli lisensi? Anda dapat mencoba <strong>semua fitur pembuatan animasi, auto pilot & render MP4</strong> gratis selama 1 hari (24 jam) di perangkat ini.
              </span>
            )}
          </p>

          {/* Trial Action Button */}
          {trialStatus.isExpired ? (
            <div className="w-full py-2.5 px-3 rounded-xl bg-gray-900 border border-gray-800 text-gray-500 text-center font-bold text-xs flex items-center justify-center gap-2 cursor-not-allowed select-none">
              <i className="fa-solid fa-lock text-rose-400"></i>
              <span>Fitur Trial Terkunci (Sudah Pernah Dicoba)</span>
            </div>
          ) : (
            <button
              onClick={handleStartTrial}
              disabled={isStartingTrial || isTrialSuccess}
              className={`w-full py-2.5 px-4 rounded-xl font-bold text-xs uppercase tracking-wider transition flex items-center justify-center gap-2 shadow-lg cursor-pointer active:scale-[0.99] ${
                isTrialSuccess
                  ? 'bg-emerald-600 text-white shadow-emerald-600/30'
                  : trialStatus.isActive
                  ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/30'
                  : 'bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-black shadow-amber-500/25'
              }`}
            >
              {isStartingTrial ? (
                <>
                  <i className="fa-solid fa-spinner fa-spin"></i>
                  <span>Mengaktifkan Trial...</span>
                </>
              ) : isTrialSuccess ? (
                <>
                  <i className="fa-solid fa-check"></i>
                  <span>Membuka Mode Trial...</span>
                </>
              ) : trialStatus.isActive ? (
                <>
                  <i className="fa-solid fa-play"></i>
                  <span>Lanjutkan Percobaan Trial ({formatRemainingTime(trialStatus.remainingMs)})</span>
                </>
              ) : (
                <>
                  <i className="fa-solid fa-rocket text-slate-950"></i>
                  <span>Mulai Coba Gratis 1 Hari Sekarang</span>
                </>
              )}
            </button>
          )}
        </div>

        {/* Divider with Text */}
        <div className="flex items-center gap-3 py-0.5">
          <div className="flex-1 border-t border-slate-800"></div>
          <span className="text-[10px] font-black tracking-wider text-slate-500 uppercase">
            ATAU AKTIVASI LISENSI PENUH
          </span>
          <div className="flex-1 border-t border-slate-800"></div>
        </div>

        {/* --- SECTION 2: LISENSI SEUMUR HIDUP --- */}
        <div className="rounded-2xl bg-[#101726]/95 border border-slate-800/80 p-4 space-y-3 shadow-2xl backdrop-blur-md">
          {/* Header Row: Title & Price */}
          <div className="flex items-center justify-between pb-2.5 border-b border-slate-800/80">
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center text-[10px] font-bold">
                <i className="fa-solid fa-infinity"></i>
              </div>
              <div>
                <span className="text-emerald-400 font-extrabold text-xs tracking-wider uppercase block">
                  LISENSI SEUMUR HIDUP
                </span>
                <span className="text-[10px] text-gray-400">Sekali bayar, akses selamanya</span>
              </div>
            </div>
            <div className="text-right">
              <span className="text-lg sm:text-xl font-black text-white tracking-tight">
                Rp 40.000
              </span>
            </div>
          </div>

          {/* Payment Info: BRI & E-Wallet in concise 2-column or tight rows */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 bg-slate-950/70 p-3 rounded-xl border border-slate-800/80 text-[11px]">
            <div className="space-y-0.5">
              <span className="text-sky-400 font-bold block text-[10px]">BRI (Bank Transfer)</span>
              <p className="font-mono font-bold text-gray-200">676701018421533</p>
              <p className="text-[10px] text-gray-400">WAHYU MIFTAKHUL HUDA</p>
            </div>
            <div className="space-y-0.5 border-t sm:border-t-0 sm:border-l border-slate-800/80 pt-1.5 sm:pt-0 sm:pl-2.5">
              <span className="text-emerald-400 font-bold block text-[10px]">GoPay / DANA</span>
              <p className="font-mono font-bold text-gray-200">081326187769</p>
              <p className="text-[10px] text-gray-400">WAHYU MIFTAKHUL HUDA</p>
            </div>
          </div>

          {/* Payment Action Button */}
          <button
            onClick={handleWhatsAppRedirect}
            className="w-full py-2.5 px-3 rounded-xl bg-white hover:bg-gray-100 text-slate-950 font-black text-xs tracking-wider uppercase transition shadow-md shadow-white/10 flex items-center justify-center gap-2 cursor-pointer active:scale-[0.99]"
          >
            <i className="fa-brands fa-whatsapp text-emerald-600 text-base"></i>
            <span>KONFIRMASI VIA WHATSAPP (081326187769)</span>
          </button>

          {/* Input & Activate Button */}
          <div className="space-y-2 pt-1">
            <input
              type="text"
              value={inputKey}
              onChange={(e) => {
                setInputKey(e.target.value);
                if (errorMessage) setErrorMessage(null);
              }}
              onKeyDown={handleKeyDown}
              placeholder="Paste License Key Anda Di Sini"
              className="w-full py-2.5 px-3.5 rounded-xl bg-[#090e1a] border border-slate-800 text-center font-mono text-xs text-gray-100 placeholder-slate-600 focus:outline-none focus:border-sky-500 transition shadow-inner"
            />

            {/* Error / Success Feedback */}
            {errorMessage && (
              <div className="p-2 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-[11px] text-center font-semibold flex items-center justify-center gap-1.5 animate-shake">
                <i className="fa-solid fa-circle-exclamation"></i>
                <span>{errorMessage}</span>
              </div>
            )}

            {isSuccess && (
              <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[11px] text-center font-semibold flex items-center justify-center gap-1.5 animate-bounce">
                <i className="fa-solid fa-circle-check"></i>
                <span>Lisensi seumur hidup aktif! Membuka BigMA...</span>
              </div>
            )}

            <button
              onClick={handleActivate}
              disabled={isSuccess}
              className={`w-full py-3 rounded-xl font-black text-xs tracking-wider uppercase transition shadow-lg flex items-center justify-center gap-2 cursor-pointer active:scale-[0.99] ${
                isSuccess
                  ? 'bg-emerald-600 text-white shadow-emerald-600/30'
                  : 'bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white shadow-sky-600/30'
              }`}
            >
              <span>{isSuccess ? 'LISENSI AKTIF' : 'AKTIVASI LISENSI SEUMUR HIDUP'}</span>
              <i className="fa-solid fa-key text-[10px]"></i>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
