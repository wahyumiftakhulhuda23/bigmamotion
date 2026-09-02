import React, { useState } from 'react';
import { QrisModal } from './QrisModal';

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
}

export const LicenseGate: React.FC<LicenseGateProps> = ({ onUnlockSuccess }) => {
  const [inputKey, setInputKey] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isQrisOpen, setIsQrisOpen] = useState(false);

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
    <div className="min-h-screen bg-[#070b14] text-gray-100 flex flex-col items-center justify-center p-4 selection:bg-blue-600 selection:text-white relative overflow-hidden">
      {/* Background Ambient Glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute bottom-1/4 left-1/2 -translate-x-1/2 w-80 h-80 bg-purple-600/10 rounded-full blur-3xl pointer-events-none"></div>

      <div className="relative max-w-sm w-full space-y-4 my-auto py-6">
        {/* Card 1: Lisensi Seumur Hidup */}
        <div className="rounded-2xl bg-[#101726]/95 border border-slate-800/80 p-5 space-y-2 shadow-2xl backdrop-blur-md">
          <div className="flex items-center gap-2.5">
            <div className="w-5 h-5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center text-[10px] font-bold">
              <i className="fa-solid fa-check"></i>
            </div>
            <span className="text-emerald-400 font-extrabold text-xs tracking-wider uppercase">
              LISENSI SEUMUR HIDUP
            </span>
          </div>
          <p className="text-[11px] text-gray-400 leading-relaxed">
            Sekali aktivasi untuk akses selamanya tanpa biaya langganan bulanan.
          </p>
        </div>

        {/* Price Row */}
        <div className="flex items-center justify-between px-1 pt-1">
          <span className="text-[11px] font-extrabold text-slate-400 tracking-wider uppercase">
            METODE PEMBAYARAN
          </span>
          <span className="text-2xl font-black text-white tracking-tight">
            Rp 40.000
          </span>
        </div>

        {/* Card 2: Rekening & E-Wallet Box */}
        <div className="rounded-2xl bg-[#101726]/95 border border-slate-800/80 p-5 space-y-3.5 shadow-2xl backdrop-blur-md">
          {/* BRI Item */}
          <div className="space-y-0.5">
            <p className="text-xs font-bold text-sky-400">
              BRI (676701018421533)
            </p>
            <p className="text-base font-black text-white tracking-wide">
              WAHYU MIFTAKHUL HUDA
            </p>
          </div>

          <div className="border-b border-slate-800/90"></div>

          {/* GoPay / DANA Item */}
          <div className="space-y-0.5">
            <p className="text-xs font-bold text-emerald-400">
              GoPay / DANA (081326187769)
            </p>
            <p className="text-base font-black text-white tracking-wide">
              WAHYU MIFTAKHUL HUDA
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="space-y-2.5 pt-1">
          {/* Button: Bayar Dengan QRIS */}
          <button
            onClick={() => setIsQrisOpen(true)}
            className="w-full py-3.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-black text-xs tracking-wider uppercase transition shadow-lg shadow-purple-600/25 flex items-center justify-center gap-2 cursor-pointer active:scale-[0.99]"
          >
            BAYAR DENGAN QRIS
          </button>

          {/* Button: Konfirmasi WhatsApp */}
          <button
            onClick={handleWhatsAppRedirect}
            className="w-full py-3.5 rounded-xl bg-white hover:bg-gray-100 text-slate-950 font-black text-xs tracking-wider uppercase transition shadow-lg shadow-white/10 flex items-center justify-center gap-2 cursor-pointer active:scale-[0.99]"
          >
            <i className="fa-regular fa-comment-dots text-base"></i>
            <span>KONFIRMASI WHATSAPP</span>
          </button>
        </div>

        <div className="border-b border-slate-800/80 my-3"></div>

        {/* License Input & Activation */}
        <div className="space-y-2.5">
          <div>
            <input
              type="text"
              value={inputKey}
              onChange={(e) => {
                setInputKey(e.target.value);
                if (errorMessage) setErrorMessage(null);
              }}
              onKeyDown={handleKeyDown}
              placeholder="Paste License Key Here"
              className="w-full py-3.5 px-4 rounded-xl bg-[#090e1a] border border-slate-800/90 text-center font-mono text-xs text-gray-100 placeholder-slate-600 focus:outline-none focus:border-blue-500 transition shadow-inner"
            />
          </div>

          {/* Error / Success Feedback */}
          {errorMessage && (
            <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-[11px] text-center font-semibold flex items-center justify-center gap-2 animate-shake">
              <i className="fa-solid fa-circle-exclamation"></i>
              <span>{errorMessage}</span>
            </div>
          )}

          {isSuccess && (
            <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[11px] text-center font-semibold flex items-center justify-center gap-2">
              <i className="fa-solid fa-circle-check"></i>
              <span>Lisensi berhasil diaktivasi! Membuka aplikasi...</span>
            </div>
          )}

          {/* Button: Aktivasi Fitur Premium */}
          <button
            onClick={handleActivate}
            disabled={isSuccess}
            className={`w-full py-3.5 rounded-xl font-black text-xs tracking-wider uppercase transition shadow-lg flex items-center justify-center gap-2 cursor-pointer active:scale-[0.99] ${
              isSuccess
                ? 'bg-emerald-600 text-white shadow-emerald-600/30'
                : 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-600/30'
            }`}
          >
            <span>{isSuccess ? 'BERHASIL DIAKTIVASI' : 'AKTIVASI FITUR PREMIUM'}</span>
            <i className="fa-solid fa-arrow-up-right-from-square text-[10px]"></i>
          </button>
        </div>
      </div>

      {/* QRIS Modal */}
      <QrisModal isOpen={isQrisOpen} onClose={() => setIsQrisOpen(false)} />
    </div>
  );
};
