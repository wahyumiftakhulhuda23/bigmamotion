import { AnimationType } from '../types';

export interface MicrostockCategoryItem {
  id: string;
  name: string;
  enName: string;
  description: string;
  icon: string;
  animationType: AnimationType;
  stockKeywords: string[];
}

// 10 Kategori Populer Adobe Stock & Shutterstock untuk ANIMASI ICON
export const ICON_CATEGORIES: MicrostockCategoryItem[] = [
  {
    id: 'business_finance',
    name: 'Bisnis & Keuangan',
    enName: 'Business & Finance',
    description: 'Grafik pertumbuhan, brankas bank, dompet digital, kartu kredit, koin investasi',
    icon: 'fa-chart-line',
    animationType: 'icon',
    stockKeywords: ['financial growth chart', 'bank vault safe', 'digital wallet', 'investment currency', 'credit card payment', 'stock market bar', 'golden coins stack'],
  },
  {
    id: 'technology_ai',
    name: 'Teknologi & Artificial Intelligence',
    enName: 'Tech, AI & Data',
    description: 'Otak AI, chip prosesor, cloud server, robotik cerdas, node neural network',
    icon: 'fa-microchip',
    animationType: 'icon',
    stockKeywords: ['artificial intelligence brain', 'microchip processor', 'cloud database server', 'robotic arm gripper', 'neural network node', 'quantum processor', 'cyber algorithm'],
  },
  {
    id: 'medical_health',
    name: 'Kesehatan & Medis',
    enName: 'Healthcare & Medical',
    description: 'Stetoskop, kardiogram detak jantung, heliks DNA, kapsul obat, perisai medis',
    icon: 'fa-heart-pulse',
    animationType: 'icon',
    stockKeywords: ['medical stethoscope', 'beating heart cardiogram', 'dna double helix', 'medicine capsule pill', 'healthcare shield cross', 'hospital pulse monitor', 'syringe vaccine'],
  },
  {
    id: 'ecommerce_shopping',
    name: 'E-Commerce & Belanja',
    enName: 'Shopping & Retail',
    description: 'Keranjang belanja, kantong belanja, kotak paket, diskon promo, barcode scanner',
    icon: 'fa-cart-shopping',
    animationType: 'icon',
    stockKeywords: ['shopping cart trolley', 'retail shopping bag', 'delivery gift parcel', 'discount percentage badge', 'barcode price scanner', 'store checkout counter'],
  },
  {
    id: 'social_communication',
    name: 'Komunikasi & Media Sosial',
    enName: 'Social Media & Chat',
    description: 'Balon obrolan, megaphone siaran, lonceng notifikasi, antena sinyal, avatar jaringan',
    icon: 'fa-comments',
    animationType: 'icon',
    stockKeywords: ['chat speech bubbles', 'broadcast megaphone horn', 'notification bell alert', 'radio antenna tower', 'user network connection', 'live stream heart pulse'],
  },
  {
    id: 'education_learning',
    name: 'Pendidikan & Edukasi',
    enName: 'Education & Science',
    description: 'Topi toga kelulusan, buku terbuka, model atom sains, mikroskop laboratorium, lampu ide',
    icon: 'fa-graduation-cap',
    animationType: 'icon',
    stockKeywords: ['graduation mortarboard cap', 'open book pages', 'science atom model', 'laboratory microscope', 'illuminated idea lightbulb', 'diploma certificate scroll'],
  },
  {
    id: 'ecology_green_energy',
    name: 'Ekologi & Energi Hijau',
    enName: 'Ecology & Clean Energy',
    description: 'Tunas daun hijau, turbin angin, panel surya surya, baterai eco-charger, daur ulang',
    icon: 'fa-leaf',
    animationType: 'icon',
    stockKeywords: ['green leaf sprout', 'wind turbine propeller', 'solar panel photovoltaic', 'eco battery charge', 'circular recycling arrows', 'pure water drop'],
  },
  {
    id: 'cyber_security',
    name: 'Keamanan Cyber & Privasi',
    enName: 'Security & Protection',
    description: 'Perisai pelindung cyber, gembok keamanan, scan sidik jari biometric, lencana firewall',
    icon: 'fa-shield-halved',
    animationType: 'icon',
    stockKeywords: ['cyber security shield', 'security padlock vault', 'biometric fingerprint scan', 'firewall security barrier', 'digital key encryption', 'verified protection badge'],
  },
  {
    id: 'logistics_delivery',
    name: 'Logistik & Pengiriman',
    enName: 'Logistics & Delivery',
    description: 'Truk kargo ekspres, pesawat kargo, pin lokasi pelacakan, kontainer pelabuhan',
    icon: 'fa-truck-fast',
    animationType: 'icon',
    stockKeywords: ['cargo delivery truck', 'airplane freight shipment', 'package tracking GPS pin', 'forklift warehouse pallet', 'express shipping box'],
  },
  {
    id: 'creative_multimedia',
    name: 'Kreativitas & Multimedia',
    enName: 'Creative & Multimedia',
    description: 'Lensa kamera shutter, pena vektor kurva pen-tool, papan film slate, headphone equalizer',
    icon: 'fa-palette',
    animationType: 'icon',
    stockKeywords: ['camera aperture shutter', 'vector bezier pen tool', 'cinema movie clapperboard', 'audio headphones soundwave', 'color artist palette', 'spotlight stage projector'],
  },
];

// 10 Kategori Populer Adobe Stock & Shutterstock untuk ANIMASI BACKGROUND (Berbeda kategori & tema dari Icon)
export const BACKGROUND_CATEGORIES: MicrostockCategoryItem[] = [
  {
    id: 'abstract_geometric',
    name: 'Abstrak Geometris & Poligon',
    enName: 'Abstract Geometric & Bauhaus',
    description: 'Loop pola kubus isometrik, cincin konsentris berputar, prisma 3D dan garis bauhaus',
    icon: 'fa-shapes',
    animationType: 'bg',
    stockKeywords: ['floating polygonal mesh', 'isometric 3D cubes pattern', 'concentric geometric rings', 'minimalist bauhaus wireframe', 'dynamic prism tessellation'],
  },
  {
    id: 'cyber_scifi_hud',
    name: 'Grid Cyber & HUD Sci-Fi',
    enName: 'Cyberpunk HUD & Sci-Fi Grid',
    description: 'Lantai grid neon perspektif, radar telemetri sci-fi, scanning laser sweep, reticle digital',
    icon: 'fa-crosshairs',
    animationType: 'bg',
    stockKeywords: ['perspective neon grid floor', 'sci-fi radar telemetry HUD', 'scanning laser sweep line', 'digital matrix data stream', 'circular tactical reticles'],
  },
  {
    id: 'liquid_fluid_waves',
    name: 'Fluida & Gelombang Cairan',
    enName: 'Fluid Flow & Liquid Waves',
    description: 'Aliran pita cairan kromatik halus, gelombang sinusoidal organik, riak fluida mulus',
    icon: 'fa-water',
    animationType: 'bg',
    stockKeywords: ['chromatic liquid ribbon flow', 'organic sinusoidal wave layers', 'colorful fluid displacement mesh', 'smooth silk liquid ripple loop', 'viscous gradient blend'],
  },
  {
    id: 'corporate_fintech',
    name: 'Latar Korporat & Fintech',
    enName: 'Corporate & Fintech Backdrop',
    description: 'Dot matrix backdrop elegan, garis diagonal terkoneksi halus, kisi arsitektur modern',
    icon: 'fa-building',
    animationType: 'bg',
    stockKeywords: ['minimalist dot matrix backdrop', 'subtle connecting diagonal lines', 'architectural slate grid loop', 'modern business presentation wave', 'clean fintech geometric mesh'],
  },
  {
    id: 'particle_constellation',
    name: 'Lattice Geometris & Garis Koneksi',
    enName: 'Geometric Lattice & Network Lines',
    description: 'Jaringan simpul geometris presisi, garis topografi poligon 3D, kisi konektivitas terstruktur rapi tanpa partikel liar',
    icon: 'fa-circle-nodes',
    animationType: 'bg',
    stockKeywords: ['interconnected geometric lattice mesh', 'volumetric structural wiregrid nodes', 'continuous topological polygon ribbons', '3D digital connectivity matrix', 'minimalist architectural node wireframe'],
  },
  {
    id: 'aura_gradient_blur',
    name: 'Gradien Aura & Soft Mesh',
    enName: 'Aura Gradient & Soft Mesh',
    description: 'Siklus pergeseran gradien aura kromatik, bola blur gaussian dinamis, pendaran cahaya atmosferik',
    icon: 'fa-sun',
    animationType: 'bg',
    stockKeywords: ['shifting chromatic aura gradient', 'ethereal gaussian blur spheres', 'atmospheric ambient light swells', 'dreamy pastel mesh loop', 'organic glowing vapor'],
  },
  {
    id: 'botanical_nature',
    name: 'Organik Alam & Kanopi Daun',
    enName: 'Botanical & Organic Nature',
    description: 'Siluet daun tropis melambai lembut, garis kontur topografi alam, sulur tanaman merambat',
    icon: 'fa-tree',
    animationType: 'bg',
    stockKeywords: ['swaying tropical leaf silhouette', 'flowing botanical vine tendrils', 'nature topographic contour lines', 'gentle organic petal drift', 'lush canopy shadow waves'],
  },
  {
    id: 'retro_synthwave',
    name: 'Synthwave 80s & Neon Horizon',
    enName: 'Retro Synthwave & Neon Horizon',
    description: 'Cakrawala kawat 3D neon outrun, matahari chrome retro 80s, garis kecepatan ungu synthwave',
    icon: 'fa-bolt',
    animationType: 'bg',
    stockKeywords: ['wireframe 3D grid horizon', 'retro chrome synthwave sun', '80s outrun neon speed streaks', 'purple magenta cyber mountains', 'vintage electro grid loop'],
  },
  {
    id: 'luxury_gold_silk',
    name: 'Kemewahan Emas & Sutra Elegan',
    enName: 'Luxury Gold & Silk Flow',
    description: 'Pita sutra emas 3D bergelombang, kemilau sampanye metalik, latar obsidian hitam dengan kilau emas',
    icon: 'fa-gem',
    animationType: 'bg',
    stockKeywords: ['flowing 3D golden silk ribbon', 'metallic champagne gold shimmer', 'luxury obsidian background gold crests', 'elegant liquid gold wave loop', 'royal satin cloth motion'],
  },
  {
    id: 'dynamic_speed_energy',
    name: 'Terowongan Energi & Kecepatan',
    enName: 'Speed Tunnel & Energy Lines',
    description: 'Garis kecepatan warp hyperspace, terowongan vorteks energi bercahaya, jejak kilatan kecepatan',
    icon: 'fa-gauge-high',
    animationType: 'bg',
    stockKeywords: ['hyperspace warp speed streaks', 'glowing energy vortex tunnel', 'high-velocity forward light trails', 'cyber energetic plasma streams', 'futuristic hyperdrive loop'],
  },
];

export function getCategoriesForType(type: AnimationType): MicrostockCategoryItem[] {
  return type === 'icon' ? ICON_CATEGORIES : BACKGROUND_CATEGORIES;
}

export function getDefaultCategoryForType(type: AnimationType): string {
  return type === 'icon' ? 'business_finance' : 'abstract_geometric';
}

export function findCategoryById(catId: string, type?: AnimationType): MicrostockCategoryItem | undefined {
  if (type) {
    const list = getCategoriesForType(type);
    const found = list.find((c) => c.id === catId);
    if (found) return found;
  }
  return (
    ICON_CATEGORIES.find((c) => c.id === catId) ||
    BACKGROUND_CATEGORIES.find((c) => c.id === catId)
  );
}

/**
 * Derives crisp, subject-matched motion physics automatically for any topic (no manual preset needed).
 */
export function resolveSubjectMotionSnippet(subject: string, type: AnimationType = 'icon'): string {
  if (type === 'bg') {
    return 'seamless harmonic 60 FPS ribbon flow and smooth periodic depth wave';
  }
  const s = (subject || '').toLowerCase();
  if (/\b(bell|megaphone|alarm|siren|alert|speaker|mic|horn)\b/.test(s)) {
    return 'gentle pendulum ring oscillation with pulsing concentric acoustic waves';
  }
  if (/\b(chart|graph|bar|candlestick|rocket|growth|market|profit|coin|wallet)\b/.test(s)) {
    return 'staggered upward spring lift on bars/thrust with 45-deg specular sheen';
  }
  if (/\b(heart|pulse|ecg|cardiogram|dna|pill|capsule|syringe|medical|stethoscope)\b/.test(s)) {
    return 'rhythmic lub-dub heartbeat pulse with smooth floating bob and sheen';
  }
  if (/\b(lock|padlock|vault|shield|key|fingerprint|biometric|security|firewall)\b/.test(s)) {
    return 'snappy precision bolt/dial locking recoil with subtle floating stability';
  }
  if (/\b(cart|truck|drone|airplane|plane|wheel|forklift|parcel|cargo|delivery)\b/.test(s)) {
    return 'forward suspension bounce with synchronized spinning wheels/rotors';
  }
  if (/\b(atom|orbit|planet|globe|radar|clock|compass|satlet|satellite|astrolabe)\b/.test(s)) {
    return 'continuous smooth orbital sweep and tilted axis precession';
  }
  if (/\b(brain|chip|cpu|ai|server|network|cloud|robot|camera|eye|microscope)\b/.test(s)) {
    return 'rhythmic telemetry pulse, subtle gimbal tilt, and crisp iris/node gleam';
  }
  return 'smooth harmonic float with gentle squash-stretch inertia and diagonal sheen';
}

/**
 * Universal High-Class Procedural Prompt Synthesizer
 * Generates compact, token-lean, studio-grade microstock prompts with subject-matched motion.
 */
export function generateProceduralPrompts(
  count: number,
  type: AnimationType = 'icon',
  subCategory: string = 'business_finance',
  style: string = 'minimalist',
  colorMode: string = 'gradient',
  _motionDynamics: string = 'auto',
  neonGlow: boolean = true,
  keywords: string[] = [],
  startIndex: number = 0
): string[] {
  const cat = findCategoryById(subCategory, type);

  const domainSubjectPools: Record<string, string[]> = {
    business_finance: [
      'beveled gold cryptocurrency bullion coin',
      'biometric bank vault safe with dial lock',
      'digital fintech smartcard with glowing EMV chip',
      'ascending 3D candlestick trading bar chart',
      'executive leather wallet with crisp banknotes',
      'stock market bar graph with glowing apex line',
      'treasury safe column emblem',
      'blockchain cube with tethered token ring',
      'precision investment balance scale',
      'cashless POS terminal with NFC arc wave',
      'golden coin stack with ascending arrow',
      'financial growth rocket emblem',
    ],
    technology_ai: [
      'synthetic AI brain with pulsing node links',
      'quantum microprocessor chip with gold pins',
      'articulated robotic arm gripper',
      'cloud mainframe server rack with LED bars',
      'AI core sphere with orbiting data ring',
      'cyber scanner eye with iris shutter',
      'optical fiber transmitter with beam',
      'minimalist AI android visor bust',
      'interlocking quantum logic cube',
      'neural network tree with glowing nodes',
    ],
    medical_health: [
      'clinical acoustic stethoscope chestpiece',
      'beating cardiogram heart with ECG wave',
      'double-helix DNA genetic strand',
      'dual-tone pharmaceutical capsule pill',
      'beveled 3D medical cross shield',
      'ultrasound pulse monitor screen',
      'surgical laser optical lens probe',
      'precision vaccine syringe injector',
      'pulse oximeter sensor clip',
      'hospital ambulance emergency beacon',
    ],
    ecommerce_shopping: [
      'welded metallic shopping cart with dual caster wheels',
      'boutique shopping bag with curved top handles',
      'sealed delivery parcel box with shipping tape',
      'ribbon-wrapped gift box with popping lid',
      'handheld barcode scanner with laser line',
      'storefront awning with hanging badge',
      'embossed percentage discount price tag',
      'cargo delivery drone with spinning rotors',
      'mobile checkout phone with sliding card',
      'express courier stopwatch package',
    ],
    social_communication: [
      'paired dialogue chat bubbles with curved tails',
      'broadcast megaphone horn with soundwave arcs',
      'brass notification alert bell with swinging clapper',
      'telecom signal tower with radiating arcs',
      'connected user avatar ring network',
      'live broadcast camera with tally light',
      'paper airplane messenger trailing sleek ribbon',
      'studio condenser microphone on stand',
      'parabolic satellite dish antenna',
      'social reaction heart badge',
    ],
    education_learning: [
      'graduation mortarboard cap with swinging tassel',
      'open hardcover book with turning pages',
      'Bohr atom model with 3 tilted closed elliptical orbits',
      'optical laboratory microscope turret',
      'illuminated idea lightbulb with inner filament',
      'rolled academic diploma scroll with ribbon',
      'brass astrolabe celestial rings',
      'precision drafting compass caliper',
      'Erlenmeyer conical flask with rising bubbles',
      'inclined classroom globe spinning on stand',
    ],
    abstract_geometric: [
      'isometric cube grid with cascading elevation ripples',
      'concentric Bauhaus rings rotating in counter-phase',
      'undulating 3D polygonal wireframe horizon',
      'interlocking glass prism ribbons refracting light',
      'layered architectural wave monoliths',
      'tessellated geometric chevron cascade',
    ],
    cyber_scifi_hud: [
      'perspective neon floor grid receding to horizon',
      'tactical radar sweep with telemetry rings',
      'cascading digital data stream bands',
      'circular HUD targeting reticles and brackets',
      'hexagonal cyber defense grid pulse',
      'futuristic compass cockpit horizon HUD',
    ],
    liquid_fluid_waves: [
      'chromatic liquid wave ribbons flowing left to right',
      'smooth sinusoidal silk mesh spanning full frame',
      'viscous gradient fluid swells in rhythmic motion',
      'translucent pastel liquid ripples',
      'luminous aquatic current contours',
      'iridescent liquid chrome waves',
    ],
    corporate_fintech: [
      'architectural dot-wave matrix backdrop',
      'interconnected diagonal fintech lines',
      'slate blue corporate gradient flow planes',
      'isometric digital ledger grid waves',
      'clean banking momentum curve streams',
      'executive keynote undulating light bands',
    ],
    particle_constellation: [
      'structural 3D geometric lattice network',
      'isometric polygon mesh with undulating crests',
      'molecular crystal wireframe linkage',
      'topological wireframe ribbons in depth',
      'digital connectivity matrix spanning full frame',
      'parametric line lattice in wave harmony',
    ],
    luxury_gold_silk: [
      'undulating 3D imperial gold satin cloth',
      'flowing liquid metallic gold ribbons',
      'champagne gold silk drapery waves',
      'obsidian backdrop with sweeping gold curves',
      'molten bronze waves with specular gleam',
      'metallic thread mesh under studio light',
    ],
  };

  const pool = domainSubjectPools[subCategory] ||
    (cat && cat.stockKeywords.length > 0 ? cat.stockKeywords : ['sleek geometric emblem', 'precision modern icon']);

  const cleanKeywords = (keywords || [])
    .map((k) => String(k).trim())
    .filter((k) => k.length > 0);

  const subjects = cleanKeywords.length > 0
    ? cleanKeywords.flatMap((kw) => [kw, `${kw} 3D emblem`])
    : pool;

  const iconSentenceTemplates = [
    (subj: string, mot: string, col: string) =>
      `Standalone 3D volumetric ${subj}: clean welded silhouette with 45-deg chiaroscuro shading, 1.5px bevel rim highlight, and ${col}. Animated with ${mot} (isolated icon, zero plate/rhombus/gear/shadow).`,
    (subj: string, mot: string, col: string) =>
      `Sculpted 3D isometric ${subj}: solid unified body with crisp chamfer highlights and ${col}. Performing ${mot} at 60 FPS (pure standalone object, zero card/rhombus/floor shadow).`,
    (subj: string, mot: string, col: string) =>
      `Minimalist volumetric ${subj}: symmetric proportional parts welded together in ${col} with clean specular rims. Looping smoothly via ${mot} (no container frame, no gears).`,
  ];

  const bgSentenceTemplates = [
    (subj: string, mot: string, col: string) =>
      `Full-frame 60 FPS looping motion background featuring ${subj} edge-to-edge in ${col}, moving in ${mot} with zero white flares.`,
    (subj: string, mot: string, col: string) =>
      `Widescreen volumetric backdrop of ${subj} spanning 100% canvas in ${col} with ${mot}, seamless dark contrast and zero stray particles.`,
  ];

  const colorTreatments = [
    `${colorMode} dual-tone chiaroscuro palette`,
    `${style} ${colorMode} tones with ${neonGlow ? 'subtle luminous rim' : 'razor-sharp vector edges'}`,
    `vibrant ${colorMode} metallic sheen`,
  ];

  const results: string[] = [];
  const totalWanted = Math.max(1, count);
  const seenHashes = new Set<string>();

  const dayHash = Math.floor(Date.now() / (1000 * 60 * 60 * 24));
  const timeSeed = (Date.now() % 1000000);
  const sessionSalt = Math.floor(Math.random() * 999999);

  for (let i = 0; i < totalWanted; i++) {
    let candidate = '';
    let attempt = 0;

    while (attempt < 15) {
      attempt++;
      const pIndex = (startIndex + i * 7 + dayHash * 31 + timeSeed + sessionSalt + attempt * 101) >>> 0;
      const subj = subjects[pIndex % subjects.length];
      const mot = resolveSubjectMotionSnippet(subj, type);
      const col = colorTreatments[(pIndex * 17) % colorTreatments.length];

      if (type === 'icon') {
        const tIndex = (pIndex * 3) % iconSentenceTemplates.length;
        candidate = iconSentenceTemplates[tIndex](subj, mot, col);
      } else {
        const tIndex = (pIndex * 3) % bgSentenceTemplates.length;
        candidate = bgSentenceTemplates[tIndex](subj, mot, col);
      }

      const hash = candidate.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 80);
      if (!seenHashes.has(hash)) {
        seenHashes.add(hash);
        break;
      }
    }

    results.push(candidate);
  }

  return results;
}


