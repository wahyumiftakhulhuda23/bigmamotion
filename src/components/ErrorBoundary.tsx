import React, { ReactNode, ErrorInfo } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  public override state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public override componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('[ErrorBoundary caught error]:', error, errorInfo);
  }

  public handleReset = (): void => {
    this.setState({ hasError: false, error: null });
  };

  public handleReload = (): void => {
    window.location.reload();
  };

  public override render(): ReactNode {
    if (this.state.hasError) {
      const errorMessage =
        typeof this.state.error === 'string'
          ? this.state.error
          : this.state.error?.message || 'Terjadi kesalahan sistem yang tidak terduga.';

      return (
        <div className="min-h-screen bg-[#080c14] text-gray-100 flex items-center justify-center p-4">
          <div className="max-w-lg w-full bg-slate-900/90 border border-red-500/30 rounded-2xl p-6 shadow-2xl backdrop-blur-xl space-y-4">
            <div className="flex items-center gap-3 border-b border-gray-800 pb-3">
              <div className="w-10 h-10 rounded-xl bg-red-500/20 border border-red-500/40 flex items-center justify-center text-red-400 text-lg">
                <i className="fa-solid fa-triangle-exclamation"></i>
              </div>
              <div>
                <h2 className="text-base font-bold text-gray-100">Sistem Memulihkan Diri</h2>
                <p className="text-xs text-gray-400">Aplikasi mendeteksi kendala pada tampilan dan berhasil diamankan.</p>
              </div>
            </div>

            <div className="bg-black/60 rounded-xl p-3 border border-gray-800/80 font-mono text-xs text-red-300 max-h-36 overflow-y-auto break-words">
              {errorMessage}
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={this.handleReset}
                className="flex-1 py-2.5 px-4 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer shadow-lg"
              >
                <i className="fa-solid fa-rotate-left"></i>
                <span>Lanjutkan ke Aplikasi</span>
              </button>
              <button
                onClick={this.handleReload}
                className="py-2.5 px-4 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer border border-gray-700"
              >
                <i className="fa-solid fa-arrow-rotate-right"></i>
                <span>Muat Ulang Halaman</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
