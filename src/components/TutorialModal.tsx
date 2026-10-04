import React, { useState } from 'react';

interface TutorialModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigateToTab?: (tab: 'prompt' | 'image_to_motion', subTab?: 'prompt_to_motion' | 'image_to_prompt') => void;
  onOpenApiModal?: () => void;
}

export const TutorialModal: React.FC<TutorialModalProps> = ({
  isOpen,
  onClose,
  onNavigateToTab,
  onOpenApiModal,
}) => {
  const [activeTopic, setActiveTopic] = useState<'quickstart' | 'prompt_to_motion' | 'image_to_prompt' | 'image_to_motion' | 'export_gallery' | 'faq'>('quickstart');
  const [searchQuery, setSearchQuery] = useState('');

  if (!isOpen) return null;

  const topics = [
    {
      id: 'quickstart',
      title: '1. Pengenalan & API Key',
      icon: 'fa-rocket',
      badge: 'Dasar',
      color: 'text-amber-400',
    },
    {
      id: 'prompt_to_motion',
      title: '2. Prompt to Motion',
      icon: 'fa-wand-magic-sparkles',
      badge: 'Generator',
      color: 'text-sky-400',
    },
    {
      id: 'image_to_prompt',
      title: '3. Image to Prompt Motion',
      icon: 'fa-file-waveform',
      badge: 'Vision AI',
      color: 'text-indigo-400',
    },
    {
      id: 'image_to_motion',
      title: '4. Image to Motion (Auto Pilot)',
      icon: 'fa-robot',
      badge: 'Special',
      color: 'text-amber-400',
    },
    {
      id: 'export_gallery',
      title: '5. Galeri & Export MP4 / ZIP',
      icon: 'fa-film',
      badge: 'Export',
      color: 'text-purple-400',
    },
    {
      id: 'faq',
      title: '6. Tips Microstock & Solusi Error',
      icon: 'fa-circle-question',
      badge: 'Tips',
      color: 'text-emerald-400',
    },
  ];

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-fadeIn"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="glass-card rounded-2xl border-2 border-emerald-500/40 bg-slate-950/95 max-w-4xl w-full my-auto shadow-2xl flex flex-col max-h-[90vh] overflow-hidden"
      >
        {/* Header Bar */}
        <div className="p-4 sm:p-5 border-b border-gray-800 bg-gradient-to-r from-emerald-950/40 via-slate-900 to-sky-950/40 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-500 to-sky-500 text-white flex items-center justify-center text-lg font-black shadow-lg shadow-emerald-500/20 shrink-0">
              <i className="fa-solid fa-book-open-reader"></i>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-extrabold text-base sm:text-lg text-gray-100 tracking-tight">
                  BUKU PANDUAN & TUTORIAL LENGKAP
                </h2>
                <span className="text-[9px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-2 py-0.5 rounded-full font-black uppercase tracking-wider">
                  BigMA v2026
                </span>
              </div>
              <p className="text-xs text-gray-400 mt-0.5">
                Panduan praktis dan terperinci untuk seluruh fitur motion graphic AI
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-900 hover:bg-slate-800 text-gray-400 hover:text-white border border-gray-700 flex items-center justify-center text-sm transition cursor-pointer shrink-0"
            title="Tutup Tutorial"
          >
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>

        {/* Search & Topic Tabs */}
        <div className="p-3 border-b border-gray-800/80 bg-slate-950/80 flex flex-col sm:flex-row items-center gap-2.5 shrink-0">
          <div className="relative w-full sm:w-64 shrink-0">
            <i className="fa-solid fa-magnifying-glass absolute left-3 top-2.5 text-xs text-gray-500"></i>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari topik tutorial..."
              className="w-full bg-slate-900 border border-gray-800 rounded-xl pl-8 pr-3 py-1.5 text-xs text-gray-200 placeholder-gray-500 focus:outline-none focus:border-emerald-500/50"
            />
          </div>

          {/* Quick Tab Badges */}
          <div className="flex items-center gap-1.5 overflow-x-auto w-full pb-1 sm:pb-0 scrollbar-thin">
            {topics.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setActiveTopic(t.id as any)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shrink-0 cursor-pointer ${
                  activeTopic === t.id
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm'
                    : 'bg-slate-900 text-gray-400 hover:text-gray-200 hover:bg-slate-850 border border-gray-800/80'
                }`}
              >
                <i className={`fa-solid ${t.icon} text-xs ${t.color}`}></i>
                <span className="whitespace-nowrap">{t.title.split('. ')[1] || t.title}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-6 text-gray-300 text-xs sm:text-sm leading-relaxed flex-1">
          {/* TOPIC 1: Pengenalan & Pasang API Key */}
          {activeTopic === 'quickstart' && (
            <div className="space-y-4 animate-fadeIn">
              <div className="p-4 rounded-2xl bg-gradient-to-br from-amber-500/10 via-slate-900 to-slate-950 border border-amber-500/30 space-y-2">
                <span className="text-amber-400 font-extrabold text-xs uppercase tracking-wider flex items-center gap-1.5">
                  <i className="fa-solid fa-sparkles"></i>
                  <span>Langkah Pertama: Cara Mengaktifkan Gemini API Key</span>
                </span>
                <p className="text-xs text-gray-300 leading-normal">
                  BigMA ditenagai oleh model AI tercanggih Google Gemini (2.5 Flash, 3.1 Pro, dan 3.1 Flash Lite) untuk menghasilkan animasi kode HTML5 Canvas 60 FPS secara mandiri tanpa watermark.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="p-3.5 rounded-xl bg-slate-900/90 border border-gray-800 space-y-2">
                  <div className="w-7 h-7 rounded-lg bg-sky-500/20 text-sky-400 flex items-center justify-center font-bold text-xs">
                    1
                  </div>
                  <h4 className="font-bold text-gray-100 text-xs">Dapatkan API Key Gratis</h4>
                  <p className="text-[11px] text-gray-400">
                    Buka situs resmi Google AI Studio di <a href="https://aistudio.google.com" target="_blank" rel="noreferrer" className="text-sky-400 underline font-bold">aistudio.google.com</a>, login dengan akun Google, lalu klik <strong>"Create API Key"</strong>.
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-900/90 border border-gray-800 space-y-2">
                  <div className="w-7 h-7 rounded-lg bg-sky-500/20 text-sky-400 flex items-center justify-center font-bold text-xs">
                    2
                  </div>
                  <h4 className="font-bold text-gray-100 text-xs">Pasang di Menu Pengaturan</h4>
                  <p className="text-[11px] text-gray-400">
                    Klik tombol indikator model di bagian header atas (contoh: <code>2.5 Flash</code>), lalu tempelkan (paste) satu atau beberapa API Key Anda (1 baris per key).
                  </p>
                  {onOpenApiModal && (
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onOpenApiModal();
                      }}
                      className="mt-1 px-2.5 py-1 bg-sky-500/20 text-sky-300 hover:bg-sky-500/30 border border-sky-500/40 rounded-lg text-[10px] font-bold transition cursor-pointer"
                    >
                      Buka Pengaturan API Key &rarr;
                    </button>
                  )}
                </div>

                <div className="p-3.5 rounded-xl bg-slate-900/90 border border-gray-800 space-y-2">
                  <div className="w-7 h-7 rounded-lg bg-sky-500/20 text-sky-400 flex items-center justify-center font-bold text-xs">
                    3
                  </div>
                  <h4 className="font-bold text-gray-100 text-xs">Fitur Multi-Key Rotation</h4>
                  <p className="text-[11px] text-gray-400">
                    Anda bisa memasukkan 2-5 API Key sekaligus! Sistem secara otomatis memutar kunci secara bergantian agar tidak pernah terkena batas kuota limit harian.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* TOPIC 2: Prompt to Motion */}
          {activeTopic === 'prompt_to_motion' && (
            <div className="space-y-4 animate-fadeIn">
              <div className="p-4 rounded-2xl bg-gradient-to-br from-sky-500/10 via-slate-900 to-slate-950 border border-sky-500/30 space-y-2">
                <span className="text-sky-400 font-extrabold text-xs uppercase tracking-wider flex items-center gap-1.5">
                  <i className="fa-solid fa-wand-magic-sparkles"></i>
                  <span>Menu 1: Prompt to Motion (Generator Animasi)</span>
                </span>
                <p className="text-xs text-gray-300">
                  Fitur ini digunakan untuk membuat animasi gerak murni dari teks deskripsi prompt atau dari kumpulan file Notepad (.txt) secara massal.
                </p>
              </div>

              <div className="space-y-3">
                <div className="p-3.5 rounded-xl bg-slate-900/70 border border-gray-800 space-y-2">
                  <h4 className="font-bold text-amber-300 text-xs flex items-center gap-2">
                    <i className="fa-solid fa-sliders"></i>
                    <span>Pengaturan Parameter Visual:</span>
                  </h4>
                  <ul className="list-disc pl-5 space-y-1 text-xs text-gray-300">
                    <li><strong>Tipe Animasi:</strong> Pilih <em>Icon Motion</em> (simbol vektor sentral berpresisi tinggi) atau <em>Background Motion</em> (latar bergerak penuh 60 FPS).</li>
                    <li><strong>Motion Dynamics:</strong> Mengatur karakteristik gerak (Bounce/Spring, Orbital 3D, Kinetic Morphing, Cyber HUD, atau Organic Flow).</li>
                    <li><strong>Mode Warna & Neon Glow:</strong> Tersedia pilihan Gradient, Flat Art, Neon Cyber, Monochrome, Pastel, dan Luxury Gold.</li>
                    <li><strong>Green Screen (#00FF00):</strong> Aktifkan tombol Green Screen jika Anda ingin hasil animasi siap diedit dengan teknik Chroma Key di Adobe Premiere, After Effects, CapCut, atau DaVinci Resolve.</li>
                  </ul>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-900/70 border border-gray-800 space-y-2">
                  <h4 className="font-bold text-emerald-300 text-xs flex items-center gap-2">
                    <i className="fa-solid fa-file-lines"></i>
                    <span>Input Notepad (.txt) Batch & Multi-File:</span>
                  </h4>
                  <p className="text-xs text-gray-300 leading-normal">
                    Anda tidak perlu mengetik prompt satu per satu! Cukup siapkan file Notepad <code>.txt</code> dengan format <strong>1 prompt per baris</strong>.
                  </p>
                  <div className="bg-slate-950 p-2.5 rounded-lg border border-gray-800 font-mono text-[11px] text-gray-400 space-y-0.5">
                    <div>Cyber robotic arm rotating precision gears with cyan neon lighting #00F0FF</div>
                    <div>Glowing holographic brain with pulsating neural pathways on dark studio</div>
                    <div>Minimalist shopping cart bouncing with golden coin particle emission</div>
                  </div>
                  <p className="text-xs text-gray-300">
                    Tarik (drag & drop) beberapa file notepad sekaligus. Animasi di Galeri dan hasil unduh ZIP akan otomatis dikelompokkan ke dalam folder yang rapi sesuai nama file notepad masing-masing!
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-900/70 border border-gray-800 space-y-2">
                  <h4 className="font-bold text-sky-300 text-xs flex items-center gap-2">
                    <i className="fa-solid fa-arrow-rotate-left"></i>
                    <span>Daftar Prompt Siap Render & Tombol Reset:</span>
                  </h4>
                  <p className="text-xs text-gray-300">
                    Prompt yang dihasilkan akan masuk ke daftar siap render. Anda bisa mengedit prompt langsung, menghapus prompt individual, atau menekan tombol <strong>"Reset"</strong> untuk mengosongkan daftar dengan satu klik sebelum memulai project baru.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* TOPIC 3: Image To Prompt Motion */}
          {activeTopic === 'image_to_prompt' && (
            <div className="space-y-4 animate-fadeIn">
              <div className="p-4 rounded-2xl bg-gradient-to-br from-indigo-500/10 via-slate-900 to-slate-950 border border-indigo-500/30 space-y-2">
                <span className="text-indigo-400 font-extrabold text-xs uppercase tracking-wider flex items-center gap-1.5">
                  <i className="fa-solid fa-file-waveform"></i>
                  <span>Menu 2: Image to Prompt Motion (Vision AI)</span>
                </span>
                <p className="text-xs text-gray-300">
                  Fitur ini menganalisis gambar referensi Anda menggunakan AI Vision tingkat tinggi untuk menghasilkan prompt animasi ultra-presisi (kode warna hex, posisi elemen, dan dinamika gerakan).
                </p>
              </div>

              <div className="space-y-3">
                <div className="p-3.5 rounded-xl bg-slate-900/70 border border-gray-800 space-y-2">
                  <h4 className="font-bold text-purple-300 text-xs flex items-center gap-2">
                    <i className="fa-solid fa-folder-tree"></i>
                    <span>Manajemen Project Terpisah:</span>
                  </h4>
                  <p className="text-xs text-gray-300">
                    Klik <strong>"Tambah Project"</strong> untuk membuat folder kerja baru. Setiap project menyimpan gambar dan hasil promptnya sendiri-sendiri, sehingga Anda bisa mengelola tema (misal: <em>Project Cyber, Project Flat Icon, Project Ramadan</em>) secara terorganisir.
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-900/70 border border-gray-800 space-y-2">
                  <h4 className="font-bold text-amber-300 text-xs flex items-center gap-2">
                    <i className="fa-solid fa-palette"></i>
                    <span>Ekstraksi Kemiripan Maksimal (Warna & Posisi Elemen):</span>
                  </h4>
                  <p className="text-xs text-gray-300 leading-normal">
                    Model AI Vision mengekstrak:
                  </p>
                  <ul className="list-disc pl-5 space-y-1 text-xs text-gray-300">
                    <li><strong>Kode Warna Hex Presisi (#RRGGBB):</strong> Warna dominan, warna aksen, highlight, dan background diekstrak persis dari gambar asli.</li>
                    <li><strong>Tata Letak Elemen Geometris:</strong> Posisi titik pusat, sudut rotasi, ketebalan garis, dan proporsi bentuk utama agar animasinya identik dengan gambar asli.</li>
                    <li><strong>Analisis Gerakan Organik:</strong> Memprediksi bagaimana objek tersebut bergerak secara realistis dan estetik pada 60 FPS (misal: lensa memancarkan sinar kerucut, baling-baling berputar, atau badan berosilasi halus).</li>
                  </ul>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-900/70 border border-gray-800 space-y-2">
                  <h4 className="font-bold text-emerald-300 text-xs flex items-center gap-2">
                    <i className="fa-solid fa-file-arrow-down"></i>
                    <span>Unduh Notepad Murni & Kirim ke Generator:</span>
                  </h4>
                  <p className="text-xs text-gray-300">
                    Setelah analisa selesai, klik <strong>"Unduh Notepad (.txt)"</strong> untuk mendapatkan file teks bersih murni (1 baris per prompt tanpa kutip atau nomor urut) sesuai nama project aktif, atau klik <strong>"Kirim ke Generator"</strong> untuk langsung merender animasinya.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* TOPIC 4: Image to Motion Auto Pilot */}
          {activeTopic === 'image_to_motion' && (
            <div className="space-y-4 animate-fadeIn">
              <div className="p-4 rounded-2xl bg-gradient-to-br from-amber-500/10 via-slate-900 to-slate-950 border border-amber-500/30 space-y-2">
                <span className="text-amber-400 font-extrabold text-xs uppercase tracking-wider flex items-center gap-1.5">
                  <i className="fa-solid fa-robot"></i>
                  <span>Image to Motion (Auto Pilot Massal)</span>
                </span>
                <p className="text-xs text-gray-300">
                  Ubah gambar referensi langsung menjadi file animasi interaktif HTML5 dan Video MP4 60 FPS dengan sistem antrian multi-akun.
                </p>
              </div>

              <div className="space-y-3">
                <div className="p-3.5 rounded-xl bg-slate-900/70 border border-gray-800 space-y-2">
                  <h4 className="font-bold text-gray-100 text-xs">Cara Menggunakan:</h4>
                  <ol className="list-decimal pl-5 space-y-1.5 text-xs text-gray-300">
                    <li>Pilih tab <strong>"IMAGE TO MOTION"</strong> di header atas.</li>
                    <li>Tarik dan lepaskan gambar referensi ke area upload, atau klik <strong>"Kelola"</strong> untuk membuat akun dan mengunggah gambar per folder akun.</li>
                    <li>Gunakan dropdown <strong>"Akun"</strong> untuk memfilter antrian. Jika ada akun yang tidak diperlukan, klik ikon tempat sampah merah <strong>"Hapus Akun"</strong> untuk membersihkan akun beserta seluruh antriannya.</li>
                    <li>Klik <strong>"Jalankan Auto Pilot"</strong> untuk memproses seluruh antrian secara otomatis berurutan.</li>
                  </ol>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-900/70 border border-gray-800 space-y-2">
                  <h4 className="font-bold text-amber-300 text-xs flex items-center gap-2">
                    <i className="fa-solid fa-code-compare"></i>
                    <span>Pratinjau Bandingkan (Original vs Animasi):</span>
                  </h4>
                  <p className="text-xs text-gray-300">
                    Pada setiap baris antrian yang sudah selesai, klik thumbnail gambar atau ikon bandingkan untuk melihat gambar asli bersanding langsung dengan hasil animasi kode HTML-nya.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* TOPIC 5: Galeri & Export */}
          {activeTopic === 'export_gallery' && (
            <div className="space-y-4 animate-fadeIn">
              <div className="p-4 rounded-2xl bg-gradient-to-br from-purple-500/10 via-slate-900 to-slate-950 border border-purple-500/30 space-y-2">
                <span className="text-purple-400 font-extrabold text-xs uppercase tracking-wider flex items-center gap-1.5">
                  <i className="fa-solid fa-film"></i>
                  <span>Galeri Animasi & Ekspor Video MP4</span>
                </span>
                <p className="text-xs text-gray-300">
                  Seluruh animasi yang berhasil dirender tersimpan aman di Galeri dan siap diunduh dalam format HTML mandiri atau Video MP4 60 FPS berkualitas tinggi.
                </p>
              </div>

              <div className="space-y-3">
                <div className="p-3.5 rounded-xl bg-slate-900/70 border border-gray-800 space-y-2">
                  <h4 className="font-bold text-sky-300 text-xs flex items-center gap-2">
                    <i className="fa-solid fa-file-zipper"></i>
                    <span>Ekspor ZIP Terstruktur Per Folder:</span>
                  </h4>
                  <p className="text-xs text-gray-300">
                    Saat menekan tombol <strong>"Unduh ZIP"</strong> di Galeri atau di antrian, sistem otomatis mengelompokkan file ke dalam folder sesuai nama akun atau nama file notepad. Anda tidak perlu lagi menyortir file satu per satu saat akan mengunggah ke marketplace Microstock!
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-900/70 border border-gray-800 space-y-2">
                  <h4 className="font-bold text-purple-300 text-xs flex items-center gap-2">
                    <i className="fa-solid fa-video"></i>
                    <span>Ekspor Video MP4 60 FPS:</span>
                  </h4>
                  <p className="text-xs text-gray-300">
                    Klik tombol film ungu <strong>"MP4"</strong> pada kartu animasi atau di panel kanan. Sistem akan merekam canvas 60 frame per detik tanpa lag dan menghasilkan video MP4 yang kompatibel dengan semua pemutar media dan platform video.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* TOPIC 6: FAQ & Solusi */}
          {activeTopic === 'faq' && (
            <div className="space-y-3 animate-fadeIn">
              <div className="p-3.5 rounded-xl bg-slate-900/80 border border-gray-800 space-y-1.5">
                <h4 className="font-bold text-emerald-300 text-xs">Bagaimana format gambar referensi terbaik?</h4>
                <p className="text-xs text-gray-300">
                  Gunakan format PNG transparan atau JPG dengan subjek objek yang jelas di tengah. Format WEBP, SVG, GIF, dan AVIF juga didukung penuh.
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-900/80 border border-gray-800 space-y-1.5">
                <h4 className="font-bold text-amber-300 text-xs">Apa yang harus dilakukan jika render animasi gagal?</h4>
                <p className="text-xs text-gray-300">
                  Jika API Google mengalami lonjakan traffic (429 Too Many Requests), tekan tombol <strong>"Ulangi Gagal"</strong>. Pastikan Anda telah memasukkan lebih dari 1 API Key agar fitur rotasi otomatis bekerja optimal.
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-900/80 border border-gray-800 space-y-1.5">
                <h4 className="font-bold text-sky-300 text-xs">Apakah hasil animasi bisa dijual di Microstock (Shutterstock, Adobe Stock, Freepik)?</h4>
                <p className="text-xs text-gray-300">
                  Ya! Kode HTML5 Canvas dan video MP4 yang diekspor adalah karya orisinal bebas lisensi pihak ketiga. Gunakan mode Green Screen jika platform Anda mensyaratkan footage berlatar transparan/chroma key.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3.5 sm:p-4 border-t border-gray-800 bg-slate-950 flex items-center justify-between gap-3 shrink-0">
          <span className="text-[11px] text-gray-500">
            BigMA Tutorial &copy; 2026. Siap digunakan kapan saja.
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-gradient-to-r from-emerald-600 to-sky-600 hover:from-emerald-500 hover:to-sky-500 text-white font-bold text-xs rounded-xl transition cursor-pointer shadow-md shadow-emerald-600/20 active:scale-95"
          >
            Mengerti & Tutup
          </button>
        </div>
      </div>
    </div>
  );
};
