export type InputType = 'Type A' | 'Type B' | 'Type C';

export type SearchSource = 'x' | 'youtube' | 'google';

export type RednoteTone = 'emotional' | 'professional' | 'speed' | 'imitate' | 'humorous';

export interface SearchResult {
  id: string;
  title: string;
  snippet: string;
  source: string;
  url?: string;
  imageUrl?: string; 
  date?: string;
}

export interface VideoFrame {
  id: string;
  url: string; // Data URL
  timestamp: number;
}

export interface RednoteContent {
  title: string;
  titles_options: string[];
  coreIdea: string;
  fullText: string;
  tags: string[];
}

export interface VisualElement {
  coverText: {
    main: string;
    sub: string;
  };
  goldenQuotes?: {
    text: string;
    timestamp?: string;
  }[];
  knowledgePoints?: string[];
  literatureInfo?: {
    titleEn: string;
    abstractCn: string;
    citation: string;
  } | null;
}

export type VisualTemplate = 'memo' | 'literature' | 'card' | 'neon' | 'polaroid' | 'magazine' | 'subtitle';

export interface VisualData {
  mode: 'subtitle' | 'infographic';
  templateRecommendation: VisualTemplate | string;
  colorPalette: string[];
  elements: VisualElement;
  backgroundImage?: string; 
}

export interface RednoteResponse {
  status: string;
  meta: {
    generatedAt: string;
    inputType: string;
  };
  content: RednoteContent;
  visualData: VisualData;
}