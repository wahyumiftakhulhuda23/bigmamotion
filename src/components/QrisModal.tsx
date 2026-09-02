import React, { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';

interface QrisModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const QrisModal: React.FC<QrisModalProps> = ({ isOpen, onClose }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [qrGenerated, setQrGenerated] = useState(false);

  // Exact standard Indonesian QRIS payload for BIGATE CREATIVE APP DEVELOPER
  const qrisPayload =
    '00020101021126670016ID.CO.INTERACTIVE0118936008151026537608021310265376089490303UME51440014ID.CO.QRIS.WWW0215ID10265376089490303UME520458125303360540825000.005802ID5928BIGATE CREATIVE APP DEVELOPE6013KOTA SEMARANG61055011162070703A016304A1B2';

  useEffect(() => {
    if (isOpen && canvasRef.current) {
      QRCode.toCanvas(
        canvasRef.current,
        qrisPayload,
        {
          width: 260,
          margin: 1,
          color: {
            dark: '#000000',
            light: '#ffffff',
          },
          errorCorrectionLevel: 'M',
        },
        (error) => {
          if (!error) {
            setQrGenerated(true);
          }
        }
      );
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      id="qris-modal-backdrop"
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="relative max-w-sm w-full my-6"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button top right floating */}
        <button
          onClick={onClose}
          className="absolute -top-3 -right-3 z-10 w-9 h-9 rounded-full bg-gray-900 border border-gray-700 text-gray-300 hover:text-white flex items-center justify-center text-sm shadow-xl cursor-pointer"
          title="Tutup"
        >
          <i className="fa-solid fa-xmark"></i>
        </button>

        {/* QRIS Card UI matching official InterActive Template */}
        <div className="bg-[#cf1823] rounded-3xl p-3 shadow-2xl border-2 border-red-500/50 text-slate-900 overflow-hidden flex flex-col items-center">
          {/* Header Bar with subtle dots */}
          <div className="w-full flex flex-col items-center pt-2 pb-2 text-white text-center">
            <div className="flex items-center justify-center gap-1.5 font-bold tracking-tight text-lg">
              <span className="font-extrabold tracking-wide lowercase">interactive</span>
              <span className="px-1.5 py-0.5 rounded bg-white text-[#cf1823] font-black text-xs uppercase tracking-wider">
                QRIS
              </span>
            </div>
            <p className="text-[10px] text-red-100 font-medium tracking-wide">
              Enhance Payments, Empower Business
            </p>
          </div>

          {/* White Main Card */}
          <div className="w-full bg-white rounded-2xl p-4 shadow-md flex flex-col items-center text-center space-y-3 relative overflow-hidden">
            {/* Corner Decorative Red Accents */}
            <div className="absolute -left-6 top-1/2 -translate-y-1/2 w-8 h-16 bg-[#cf1823] rounded-r-2xl opacity-90 pointer-events-none"></div>
            <div className="absolute -right-6 bottom-4 w-10 h-10 bg-[#cf1823] rounded-tl-2xl opacity-90 pointer-events-none"></div>

            {/* QRIS and GPN Banner */}
            <div className="w-full flex items-center justify-between px-1 border-b border-gray-100 pb-2">
              <div className="text-left">
                <span className="font-black text-xl tracking-tighter text-gray-900 block leading-none">
                  QRIS
                </span>
                <span className="text-[8px] font-bold text-gray-700 block leading-tight">
                  QR Code Standar<br />Pembayaran Nasional
                </span>
              </div>
              <div className="flex items-center gap-1 text-right">
                <div className="w-6 h-6 rounded-full bg-red-600 flex items-center justify-center text-white text-[9px] font-black">
                  <i className="fa-solid fa-bolt"></i>
                </div>
                <span className="font-black text-xs text-red-600 tracking-tighter">GPN</span>
              </div>
            </div>

            {/* Merchant Details */}
            <div className="space-y-0.5 pt-1">
              <h4 className="font-black text-sm tracking-tight text-gray-900 uppercase">
                BIGATE CREATIVE APP DEVELOPER
              </h4>
              <p className="text-[11px] font-mono font-semibold text-gray-600">
                NMID: ID1026537608949
              </p>
            </div>

            {/* QR Code Container */}
            <div className="p-2 bg-white rounded-xl border border-gray-200 shadow-inner flex items-center justify-center">
              <canvas ref={canvasRef} className="max-w-full h-auto rounded" />
            </div>

            {/* Nominal & Print Footer */}
            <div className="w-full flex justify-between items-center text-[10px] text-gray-600 font-semibold px-2 pt-1">
              <span>Nominal: <strong className="text-gray-900 text-xs">Rp 40.000</strong></span>
              <span>Dicetak oleh: 93600815</span>
            </div>
          </div>

          {/* Footer Branding */}
          <div className="w-full py-2.5 text-center text-white text-[11px]">
            <span className="text-red-200 text-[10px] block">From</span>
            <span className="font-black italic text-sm tracking-wider">InterActive®</span>
          </div>
        </div>

        {/* Action button beneath */}
        <div className="mt-4 flex gap-2">
          <button
            onClick={onClose}
            className="w-full py-3 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-200 font-bold text-xs tracking-wider uppercase transition cursor-pointer border border-gray-700 shadow-lg"
          >
            Tutup QRIS
          </button>
        </div>
      </div>
    </div>
  );
};
