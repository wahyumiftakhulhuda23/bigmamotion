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
    name: 'Plexus & Jaringan Partikel',
    enName: 'Particle Plexus & Network',
    description: 'Jaringan simpul plexus bercahaya, konstelasi partikel terhubung garis, debu kosmik 3D',
    icon: 'fa-circle-nodes',
    animationType: 'bg',
    stockKeywords: ['interconnected glowing plexus nodes', 'drifting particle constellation', 'molecular network linking lines', '3D cosmic particle depth field', 'ambient stardust network'],
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
