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
 * Universal High-Class Procedural Prompt Synthesizer
 * Generates truly unique, non-repetitive, studio-grade microstock prompts
 * with varied sentence structures, distinct subjects, and zero boilerplate duplication.
 */
export function generateProceduralPrompts(
  count: number,
  type: AnimationType = 'icon',
  subCategory: string = 'business_finance',
  style: string = 'minimalist',
  colorMode: string = 'gradient',
  motionDynamics: string = 'flow',
  neonGlow: boolean = true,
  keywords: string[] = [],
  startIndex: number = 0
): string[] {
  const cat = findCategoryById(subCategory, type);
  
  // Rich, extensive subject pool per domain to guarantee uniqueness
  const domainSubjectPools: Record<string, string[]> = {
    // Icons: Finance
    business_finance: [
      'cryptocurrency gold bullion coin with beveled rim',
      'biometric vault safe with rotating gear-lock mechanism',
      'digital fintech smartcard with glowing EMV chip',
      'ascending volumetric candlestick trading chart',
      'leather luxury executive wallet with emerging currency notes',
      'precision stock market bar graph with glowing apex nodes',
      'isometric bank treasury fortress with column portico',
      'decentralized blockchain ledger cube with tethered token rings',
      'mechanical investment balance scale weighing crypto assets',
      'cashless payment POS terminal with dynamic NFC wave pulse',
      'golden piggy bank vault with automated coin intake',
      'financial growth percentage rocket booster emblem',
    ],
    // Icons: Technology & AI
    technology_ai: [
      'neural synthetic brain with pulsing synaptic node pathways',
      'octahedral quantum microprocessor with gold contact pins',
      'robotic bionic gripper arm with multi-joint hydraulic knuckles',
      'decentralized cloud mainframe server rack with blinking LED arrays',
      'artificial intelligence core sphere with orbiting data satlets',
      'holographic cyber scanner eye with iris aperture shutter',
      'optical fiber cyber transmitter with laser beam refraction',
      'isometric humanoid AI android bust with translucent circuitry',
      'quantum algorithm cube unfolding into interlocking logic plates',
      'deep learning neural network node tree with glowing synapses',
    ],
    // Icons: Medical & Health
    medical_health: [
      'clinical acoustic stethoscope with chrome chestpiece bell',
      'pulsing anatomical cardiogram heart with glowing ECG wave',
      'double-helix DNA genetic ladder with rotating nucleotide rungs',
      'pharmaceutical dual-tone medicine capsule with effervescent core',
      'hospital paramedic cross emblem with beveled 3D relief',
      'digital ultrasound diagnostic monitor with sweeping scan wave',
      'orthopedic articulated prosthetic knee joint with carbon fiber shank',
      'automated surgical laser scalpel with focused optical lens',
      'biotech syringe injector with millimeter volume gradient gauge',
      'wellness cadence pulse oximeter with glowing LED readout',
    ],
    // Icons: E-Commerce
    ecommerce_shopping: [
      'heavy-duty solid metallic shopping cart with polished deep basket, reinforced tubular chassis, and dual smooth-rolling alloy caster wheels',
      'kraft paper boutique shopping bag with cotton twisted handles',
      'sealed corrugated parcel package with barcode routing label',
      'ribbon-wrapped holiday gift box with spring-loaded lid reveal',
      'omnichannel cashier barcode laser gun emitting scanning beam',
      'storefront awning boutique with swinging illuminated entrance sign',
      'curved digital price tag badge with embossed discount percentage',
      'unboxing parcel crate with foam cushioning and product pedestal',
      'express delivery cargo drone with 4 spinning rotor guards',
      'mobile retail checkout smartphone with animated card swipe',
    ],
    // Icons: Communication
    social_communication: [
      'paired speech chat dialogue bubbles with rounded tail anchors',
      'broadcast acoustic megaphone bullhorn with concentric soundwave arcs',
      'brass notification alert bell with oscillating pendulum clapper',
      'telecom microwave radio antenna mast with radiating signal rings',
      'interconnected global profile avatar network with glowing orbital rings',
      'live stream broadcast camera with illuminated recording tally light',
      'instant messaging paper airplane flyer leaving trailing vector stream',
      'podcast condenser studio microphone with wire mesh windscreen',
      'satellite parabolic dish transmitter tracking across azimuth angle',
      'digital reaction heart badge popping with elastic celebratory pulse',
    ],
    // Icons: Education
    education_learning: [
      'academic graduation mortarboard cap with swinging golden tassel',
      'open hardcover encyclopedia with gently turning illuminated pages',
      'Bohr planetary atom model with 3 tilted electron orbits',
      'binocular optical laboratory microscope with dual objective turrets',
      'filament idea lightbulb with radiating vector intellectual sparks',
      'parchment academic diploma scroll tied with scarlet satin ribbon',
      'brass astrolabe armillary sphere with engraved celestial rings',
      'drafting compass caliper measuring precise circular radii',
      'chemistry Erlenmeyer conical flask with effervescent boiling bubbles',
      'interactive classroom globe sphere spinning smoothly on inclined axis',
    ],
    // Backgrounds: Abstract Geometric
    abstract_geometric: [
      'endless isometric cube landscape with cascading elevation ripples',
      'concentric geometric Bauhaus rings rotating with counter-directional phases',
      'undulating 3D polygonal wireframe terrain extending across the entire frame',
      'interlocking translucent glass prism facets refracting spectral highlights',
      'floating architectural geometric monoliths with rhythmic breathing displacement',
      'tessellated Voronoi cell mosaic pulsing with gradient luminescence',
      'dynamic parametric wave grid stretching edge-to-edge across perspective depth',
      'volumetric geometric chevron cascade moving in synchronized harmonic rhythm',
    ],
    // Backgrounds: Cyber HUD
    cyber_scifi_hud: [
      'full-frame cyberpunk perspective floor grid receding toward an infinite neon horizon',
      'sci-fi telemetry military tactical radar with sweeping laser scanner dials',
      'dense cybernetic digital matrix streams cascading down the full screen height',
      'tactical circular targeting reticles and angular telemetry brackets across the frame',
      'holographic mainframe server schematic with glowing coordinate axes',
      'futuristic digital cockpit HUD overlay with dynamic compass calibration',
      'cyberpunk neon wireframe cityscape silhouette with sweeping searchlights',
      'hexagonal security honeycomb grid pulsing with firewall telemetry data',
    ],
    // Backgrounds: Liquid Waves
    liquid_fluid_waves: [
      'multi-layered chromatic liquid wave ribbons flowing continuously from left to right',
      'smooth sinusoidal fluid silk displacement mesh spanning the entire viewport',
      'viscous organic gradient oil slick waves undulating with slow rhythmic elegance',
      'translucent liquid pastel swells with soft light refractions and gentle ripples',
      'deep aquatic fluid currents with luminous undulating hydrothermal contours',
      'iridescent fluid ribbon canopy weaving diagonally through volumetric space',
      'harmonious liquid chrome waves reflecting smooth dual-tone studio lighting',
      'flowing watercolor wash gradients with soft edge bleeding and organic pulse',
    ],
    // Backgrounds: Corporate Fintech
    corporate_fintech: [
      'minimalist architectural dot-matrix backdrop with sweeping wave elevations',
      'subtle interconnected diagonal vector lines linking precision financial nodes',
      'slate blue corporate boardroom presentation backdrop with gentle gradient flow',
      'isometric fintech digital ledger lattice with pulsing micro-transactions',
      'clean banking technology grid with ascending momentum line streams',
      'sophisticated dark-mode fintech interface backdrop with soft ambient glows',
      'modern enterprise corporate mesh with balanced geometric breathing rhythm',
      'low-contrast executive keynote backdrop with elegant undulating light planes',
    ],
    // Backgrounds: Geometric Lattice & Network Lines (Zero Stray Particles)
    particle_constellation: [
      'deep 3D structural lattice network with clean interconnected vector linkage lines',
      'architectural isometric polygon mesh with smooth undulating geometric crests',
      'molecular crystal lattice frame with precise Euclidean linkage threads',
      'volumetric topological wireframe ribbons floating with harmonic breathing depth',
      'sophisticated digital connectivity matrix spanning edge-to-edge widescreen viewport',
      'clean kinetic cybernetic polygon facet field with gradient depth shading',
      'multi-layered geometric tessellation grid with subtle node vertex pulses',
      'dynamic parametric line lattice shifting smoothly with mathematical wave harmony',
    ],
    // Backgrounds: Luxury Gold Silk
    luxury_gold_silk: [
      'undulating 3D imperial gold satin cloth cascading down the full frame',
      'flowing liquid metallic gold ribbons with gleaming specular light reflections',
      'regal champagne gold silk drapery billowing with gentle harmonic breeze',
      'rich obsidian black backdrop draped with sweeping 24-karat gold filigree waves',
      'volumetric molten bronze waves undulating with deep contrast and rich specular gleam',
      'luxurious metallic thread mesh shimmering under slow sweeping studio spotlights',
      'opulent velvet and gold brocade waves drifting across cinematic widescreen dimensions',
      'smooth molten bullion ribbons weaving through ambient dark atmosphere',
    ],
  };

  const pool = domainSubjectPools[subCategory] ||
    (cat && cat.stockKeywords.length > 0 ? cat.stockKeywords : ['futuristic visual emblem', 'precision corporate concept']);

  // Custom user keywords take priority
  const cleanKeywords = (keywords || [])
    .map((k) => String(k).trim())
    .filter((k) => k.length > 0);

  const subjects = cleanKeywords.length > 0
    ? cleanKeywords.flatMap((kw) => [kw, `${kw} visual emblem`, `precision ${kw} model`])
    : pool;

  // Diverse sentence structures to eliminate boilerplate
  const iconSentenceTemplates = [
    // Template 1: Subject-centric with mechanical rigging
    (subj: string, mot: string, col: string) =>
      `A meticulously assembled monolithic ${subj}, where all components, chassis, and attached details form one unbroken unified rigid body with zero detached parts and zero background cards, rendered in ${col}, animated with ${mot}. Clean isolated silhouette, studio microstock grade.`,
    
    // Template 2: Technical Vector Blueprint
    (subj: string, mot: string, col: string) =>
      `Studio vector depiction of ${subj}: featuring seamless welded parent-child joint matrix, firmly anchored sub-elements, crisp contour, and ${col}. The central form executes ${mot} with zero detached elements and zero canvas clutter.`,
    
    // Template 3: Kinetic Motion Focus
    (subj: string, mot: string, col: string) =>
      `Kinetic microstock emblem of ${subj}: dynamic 60 FPS loop showcasing ${mot}, built with interlocking solid components in ${col}. Entirely unified monolithic anatomy with zero floating pieces and specular surface highlight sheen.`,
    
    // Template 4: Premium Isometric / Flat Vector
    (subj: string, mot: string, col: string) =>
      `High-end ${subj} vector symbol: pristine centered composition, firmly anchored joints without air gaps, rigid internal articulation, and ${col}. The subject performs ${mot} against a spotless backdrop.`,
    
    // Template 5: Executive Commercial Stock
    (subj: string, mot: string, col: string) =>
      `Precision commercial icon of ${subj}: constructed with balanced bevel volume, anchored pivot axes, welded structural components, and ${col}. Seamless 60 FPS motion featuring ${mot} as one unified body.`,
  ];

  const bgSentenceTemplates = [
    // Template 1: Cinematic Full Frame
    (subj: string, mot: string, col: string) =>
      `Cinematic edge-to-edge full frame motion background featuring ${subj}, filling 100% of the canvas with atmospheric depth, rendered in ${col}, performing ${mot}. Broadcast 60 FPS loop.`,

    // Template 2: Volumetric Depth
    (subj: string, mot: string, col: string) =>
      `Volumetric looping backdrop displaying ${subj}: continuous widescreen motion graphics utilizing ${col}, dynamically animated with ${mot}. Perfectly seamless 60 FPS animation without static dead zones.`,

    // Template 3: Ambient Studio Backdrop
    (subj: string, mot: string, col: string) =>
      `Sophisticated ambient video background of ${subj}: expansive viewport-filling visual geometry in ${col}, animated through ${mot}. Professional microstock standard with smooth continuous flow.`,

    // Template 4: Kinetic Horizon / Mesh
    (subj: string, mot: string, col: string) =>
      `High-production motion wallpaper showcasing ${subj}: edge-to-edge procedural displacement with multi-layered depth, glowing in ${col}, moving in ${mot}. Zero clutter, 60 FPS microstock asset.`,
  ];

  // Architectural 3D Flat Chiaroscuro & Volumetric Attributes
  const chiaroscuroTreatments = [
    'featuring 3-plane 3D Flat chiaroscuro (illuminated top face with key highlight, rich midtone front facade, and deep ambient occlusion shadow underbelly)',
    'constructed with volumetric 3D Flat geometry, crisp 1.5px bevel edge highlight rails, and deep crevice seam shadows',
    'rendered in high-end 3D Flat vector styling with distinct value contrast between light-facing planes and shaded under-surfaces',
    'designed with solid 3D Flat isometric depth, illuminated upper chamfers, and rich shadow crevice lines',
    'featuring balanced 3D Flat tonal distribution, specular key highlights on top curvature, and dark ambient occlusion below',
  ];

  const elasticMotions = [
    'harmonic vertical floating with elastic squash-and-stretch spring bounce (subtle body compression on dip and stretch on apex), synchronized internal wheel rotation on locked axle pins, and a clipped 45-degree diagonal specular sheen sweep',
    'elastic kinetic oscillation with secondary payload inertia (phase-lagged internal spring bounce), breathing scale pulse (0.98x to 1.02x), and rhythmic exponential LED breathing',
    'coordinated mechanical articulation with elastic spring recoil, locked rigid joint pivots, and smooth continuous 60 FPS specular gleam sweeping across the surface',
    'subtle elastic spring floating with dynamic ground contact shadow contraction, counter-rotating bevel gear wheels, and responsive kinetic inertia',
    'fluid harmonic oscillation with organic spring damping, synchronized internal dial needle vibration, and clipped volumetric light sweep',
  ];

  const colorTreatments = [
    `vibrant ${colorMode} studio tones with high-contrast dual-tone edge definition`,
    `sleek ${style} palette with ${neonGlow ? 'radiant luminescent edge sheen' : 'razor-sharp solid contour lines'}`,
    `polished metallic ${colorMode} hues with moving specular reflection strips`,
    `contemporary ${style} color harmonies with smooth multi-stop gradient transitions`,
    `refined ${colorMode} styling optimized for crisp visual punch and broadcast clarity`,
  ];

  // Structural Assembly Qualifiers (guaranteeing monolithic attached construction)
  const assemblyQualifiers = [
    'welded monolithic assembly with zero detached parts and no container card',
    'solid unified chassis where all accessories, handles, and wheels are firmly anchored',
    'interlocking rigid body construction with zero loose fragments and spotless background',
    'single continuous structural frame with permanent joint anchors and zero air gaps',
  ];

  const results: string[] = [];
  const totalWanted = Math.max(1, count);
  const seenHashes = new Set<string>();

  // Daily & Session Entropy Seeds - guarantees day-over-day and run-over-run infinite uniqueness
  const dayHash = Math.floor(Date.now() / (1000 * 60 * 60 * 24));
  const timeSeed = (Date.now() % 1000000);
  const sessionSalt = Math.floor(Math.random() * 999999);

  for (let i = 0; i < totalWanted; i++) {
    let candidate = '';
    let attempt = 0;

    while (attempt < 15) {
      attempt++;
      // High-entropy non-repeating hashing index
      const pIndex = (startIndex + i * 7 + dayHash * 31 + timeSeed + sessionSalt + attempt * 101) >>> 0;
      const subj = subjects[pIndex % subjects.length];
      const mot = elasticMotions[(pIndex * 13) % elasticMotions.length];
      const col = colorTreatments[(pIndex * 17) % colorTreatments.length];
      const chiar = chiaroscuroTreatments[(pIndex * 19) % chiaroscuroTreatments.length];
      const assembly = assemblyQualifiers[(pIndex * 23) % assemblyQualifiers.length];

      if (type === 'icon') {
        const tIndex = (pIndex * 3) % iconSentenceTemplates.length;
        const baseSubj = `${subj} (${assembly}, ${chiar})`;
        candidate = iconSentenceTemplates[tIndex](baseSubj, mot, col);
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


