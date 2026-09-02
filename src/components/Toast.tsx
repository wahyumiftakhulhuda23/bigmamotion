import React from 'react';

export interface ToastMessage {
  id: string;
  msg: string;
  type: 'info' | 'success' | 'warn' | 'error';
}

interface ToastContainerProps {
  toasts: ToastMessage[];
}

export const ToastContainer: React.FC<ToastContainerProps> = ({ toasts }) => {
  const bgColors = {
    info: 'bg-sky-500',
    success: 'bg-emerald-500',
    warn: 'bg-amber-500',
    error: 'bg-red-500'
  };

  return (
    <div id="toast-container" className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 pointer-events-none">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`px-4 py-2.5 rounded-xl text-white text-xs font-bold shadow-2xl flex items-center gap-2 transform transition-all duration-300 pointer-events-auto border border-white/20 ${bgColors[toast.type] || bgColors.info}`}
        >
          <span>{toast.msg}</span>
        </div>
      ))}
    </div>
  );
};
