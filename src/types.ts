export type AnimationType = 'icon' | 'bg';

export type NicheCategory = 
  // Icon Categories
  | 'business_finance'
  | 'technology_ai'
  | 'medical_health'
  | 'ecommerce_shopping'
  | 'social_communication'
  | 'education_learning'
  | 'ecology_green_energy'
  | 'cyber_security'
  | 'logistics_delivery'
  | 'creative_multimedia'
  // Background Categories
  | 'abstract_geometric'
  | 'cyber_scifi_hud'
  | 'liquid_fluid_waves'
  | 'corporate_fintech'
  | 'particle_constellation'
  | 'aura_gradient_blur'
  | 'botanical_nature'
  | 'retro_synthwave'
  | 'luxury_gold_silk'
  | 'dynamic_speed_energy'
  // Legacy backward-compatibility
  | 'marketing' 
  | 'teknologi' 
  | 'arsitektur' 
  | 'pendidikan' 
  | 'transportasi' 
  | 'kesehatan' 
  | 'finansial'
  | string;

export type VisualStyle = 
  | '3d_crest'
  | 'minimalist' 
  | 'flat_vector'
  | 'cyberpunk' 
  | 'corporate' 
  | 'glassmorphism' 
  | 'kinetic' 
  | 'fluid'
  | 'isometric'
  | 'retro_synth';

export type ColorMode = 
  | 'gradient' 
  | 'flat' 
  | 'neon' 
  | 'monochrome' 
  | 'pastel' 
  | 'luxury';

export type MotionDynamics = 
  | 'flow' 
  | 'bounce' 
  | 'orbital' 
  | 'morph' 
  | 'cyber' 
  | 'mechanical';

export interface AnimationItem {
  id: string;
  title: string;
  type: AnimationType;
  style: string;
  subCategory?: string;
  colorMode?: ColorMode;
  motionDynamics?: MotionDynamics;
  neonGlow?: boolean;
  html: string;
  account?: string;
  createdAt?: number;
  isGreenScreen?: boolean;
}

export interface LogItem {
  id: string;
  text: string;
  type: 'info' | 'success' | 'error' | 'warn' | 'cyan' | 'green';
  timestamp: string;
}

export interface AutoPilotAccount {
  id: string;
  name: string;
  type: AnimationType;
  subCategory?: NicheCategory | string;
  style: VisualStyle;
  promptCount: number;
  isGreenScreen?: boolean;
  neonGlow?: boolean;
  colorMode?: ColorMode;
  motionDynamics?: MotionDynamics;
}

export interface VideoConverterFile {
  id: string;
  file: File;
  name: string;
  size: string;
  status: 'pending' | 'recording' | 'done' | 'error';
  videoUrl: string | null;
  blob: Blob | null;
  error?: string;
}

export interface ApiKeyTestResult {
  key: string;
  maskedKey: string;
  valid: boolean;
  error?: string;
  latencyMs?: number;
  status?: 'pending' | 'testing' | 'valid' | 'invalid';
  lineIndex?: number;
}

export type GeminiModel = 'gemini-3.5-flash-lite' | 'gemini-3.1-flash-lite' | 'gemini-2.5-flash' | 'gemini-3.1-pro-preview' | 'gemini-2.5-flash-lite';

export interface ShapeAnalysis {
  objectName: string;
  shapeDescription: string;
  detectedElements: string[];
  professionalMotionPlan: string;
  similaritySynthesis: string;
}

export interface ImageToMotionItem {
  id: string;
  projectId: string;
  projectName: string;
  fileName: string;
  fileSize?: string;
  imagePreviewUrl: string; // base64 or blob URL
  imageBase64: string; // pure base64 string
  mimeType: string;
  status: 'pending' | 'analyzing' | 'generating' | 'completed' | 'error';
  progress?: number;
  detectedSubject?: string;
  shapeAnalysis?: ShapeAnalysis;
  motionDynamics: MotionDynamics;
  colorMode: ColorMode;
  neonGlow: boolean;
  isGreenScreen: boolean;
  precisionLevel?: 'ultra' | 'masterpiece';
  strokeWeight?: 'bold' | 'medium' | 'fine';
  customInstructions?: string;
  animationResult?: AnimationItem;
  error?: string;
  createdAt: number;
}

export interface ImageToMotionProject {
  id: string;
  name: string;
  description?: string;
  createdAt: number;
}

export interface ReferenceImageUpload {
  id: string;
  fileName: string;
  fileSize: string;
  previewUrl: string;
  imageBase64: string;
  mimeType: string;
}

export interface ImageToMotionAutoPilotAccount {
  id: string;
  projectId?: string;
  name: string;
  motionDynamics: MotionDynamics;
  colorMode: ColorMode;
  neonGlow: boolean;
  isGreenScreen: boolean;
  customInstructions: string;
  referenceImages: ReferenceImageUpload[];
}

export interface NotepadBatch {
  id: string;
  fileName: string;
  name: string; // Account/Category name without extension
  prompts: string[];
}

export interface ImageToPromptItem {
  id: string;
  projectId: string;
  fileName: string;
  fileSize: string;
  imagePreviewUrl: string;
  imageBase64: string;
  mimeType: string;
  status: 'idle' | 'analyzing' | 'done' | 'error';
  generatedPrompt?: string;
  error?: string;
  createdAt: number;
}

export interface ImageToPromptProject {
  id: string;
  name: string;
  createdAt: number;
}
