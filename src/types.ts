export type MessageRole = "user" | "assistant";
export type GenerationSource = "local" | "ai";

export interface ImageAttachment {
  id: string;
  name: string;
  mediaType: string;
  dataUrl: string;
}

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  createdAt: number;
  pending?: boolean;
  error?: boolean;
  commands?: string[];
  source?: GenerationSource;
  imageNames?: string[];
}

export interface CanvasView {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
  commands: string[];
  view?: CanvasView;
}

export interface GenerateResult {
  explanation: string;
  commands: string[];
  resetBefore: boolean;
  source: GenerationSource;
  view?: CanvasView;
}

export type AIMode = "local" | "server" | "custom";

export interface AISettings {
  mode: AIMode;
  provider: string;
  baseURL: string;
  model: string;
  apiKey: string;
}

export interface ServerConfig {
  serverConfigured: boolean;
  baseURL: string;
  model: string;
}

export interface HistoryPayloadItem {
  role: MessageRole;
  content: string;
}
