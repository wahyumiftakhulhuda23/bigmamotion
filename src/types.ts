export type AnimationType = 'icon' | 'text' | 'bg';

export type NicheCategory = 
  | 'marketing' 
  | 'teknologi' 
  | 'arsitektur' 
  | 'pendidikan' 
  | 'transportasi' 
  | 'kesehatan' 
  | 'finansial';

export type VisualStyle = 
  | 'minimalist' 
  | 'cyberpunk' 
  | 'corporate' 
  | 'glassmorphism' 
  | 'kinetic' 
  | 'fluid';

export interface AnimationItem {
  id: string;
  title: string;
  type: AnimationType;
  style: string;
  subCategory?: string;
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
  subCategory: NicheCategory;
  style: VisualStyle;
  promptCount: number;
  isGreenScreen?: boolean;
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

export type GeminiModel = 'gemini-2.5-flash' | 'gemini-3.1-flash-lite' | 'gemini-3.1-pro-preview';
