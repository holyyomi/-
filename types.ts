

export interface TextLayer {
  id: string;
  text: string;
  x: number;
  y: number;
  fontSize: number;
  color: string;
  fontFamily: string;
  fontWeight: string;
  width?: number;
  align?: 'left' | 'center' | 'right';
}

export interface CopySuggestion {
  style: string;
  text: string;
  color?: string;
  fontSize?: number;
}

export interface ScorecardItem {
  category: string;
  score: string;
  reason: string;
}

export interface SectionBlueprint {
  section_id: string;
  section_name: string;
  goal: string;
  headline: string;
  subheadline: string;
  checkpoints: string[];
  CTA: string;
  layout_notes: string;
  compliance_notes: string;
  image_id: string;
  purpose: string;
  prompt_ko: string;
  prompt_en: string;
  on_image_text: string;
  negative_prompt: string;
  style_guide: string;
  reference_usage: string;
  generatedImage?: string; // Base64 or URL
  textLayers?: TextLayer[]; // Added for text editing
}

export interface LandingPageBlueprint {
  executiveSummary: string;
  scorecard: ScorecardItem[];
  blueprintList: string[];
  sections: SectionBlueprint[];
  abTestIdeas: string[];
}

export interface GeneratedResult {
  originalImage: string;
  blueprint: LandingPageBlueprint;
}

export enum AppState {
  UPLOAD = 'UPLOAD',
  PROCESSING = 'PROCESSING',
  EDITOR = 'EDITOR',
}

export type AspectRatio = "1:1" | "3:4" | "4:3" | "9:16" | "16:9";

export const FONTS = [
  { name: 'Pretendard', value: "'Pretendard', sans-serif" },
  { name: 'Noto Sans KR', value: "'Noto Sans KR', sans-serif" },
  { name: 'Inter', value: "'Inter', sans-serif" },
  { name: 'Serif', value: "serif" },
  { name: 'Monospace', value: "monospace" },
];

export const COLORS = [
  '#000000', '#FFFFFF', '#FF3B30', '#FF9500', '#FFCC00', 
  '#4CD964', '#5AC8FA', '#007AFF', '#5856D6', '#FF2D55',
  '#1F2937', '#4B5563', '#9CA3AF'
];

// AI Studio Integration Types
declare global {
  interface AIStudio {
    hasSelectedApiKey: () => Promise<boolean>;
    openSelectKey: () => Promise<void>;
    getApiKey?: () => Promise<string>;
  }

  interface Window {
    aistudio?: AIStudio;
  }
}
