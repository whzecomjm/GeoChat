import type { AISettings, Conversation } from "../types";

const HISTORY_KEY = "geochat-conversations-v1";
const SETTINGS_KEY = "geochat-settings-v1";
const MAX_CONVERSATIONS = 40;

export function createId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function createConversation(): Conversation {
  const now = Date.now();
  return {
    id: createId(),
    title: "新的几何探索",
    createdAt: now,
    updatedAt: now,
    messages: [],
    commands: [],
  };
}

export function loadConversations(): Conversation[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [createConversation()];
    const parsed = JSON.parse(raw) as Conversation[];
    if (!Array.isArray(parsed)) return [createConversation()];
    const valid = parsed.filter(
      (item) =>
        item &&
        typeof item.id === "string" &&
        typeof item.title === "string" &&
        Array.isArray(item.messages) &&
        Array.isArray(item.commands),
    );
    return valid.length ? valid.slice(0, MAX_CONVERSATIONS) : [createConversation()];
  } catch {
    return [createConversation()];
  }
}

export function saveConversations(conversations: Conversation[]): void {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(conversations.slice(0, MAX_CONVERSATIONS)));
  } catch {
    // Storage can be unavailable in private browsing. The current session still works.
  }
}

export const defaultSettings: AISettings = {
  mode: "local",
  provider: "deepseek",
  baseURL: "https://api.deepseek.com/v1",
  model: "deepseek-chat",
  apiKey: "",
};

export function loadSettings(): AISettings {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}") as Partial<AISettings>;
    return {
      ...defaultSettings,
      ...saved,
      apiKey: "",
    };
  } catch {
    return defaultSettings;
  }
}

export function saveSettings(settings: AISettings): void {
  try {
    const { apiKey: _apiKey, ...safeSettings } = settings;
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(safeSettings));
  } catch {
    // Ignore unavailable storage without blocking generation.
  }
}
