import { useEffect } from "react";
import { Bot, KeyRound, ShieldCheck, Sparkles, X } from "lucide-react";
import type { AISettings, ServerConfig } from "../types";

interface SettingsDialogProps {
  open: boolean;
  settings: AISettings;
  serverConfig: ServerConfig;
  onChange: (settings: AISettings) => void;
  onClose: () => void;
}

const PROVIDERS = [
  { id: "deepseek", label: "DeepSeek", baseURL: "https://api.deepseek.com/v1", model: "deepseek-chat" },
  { id: "qwen", label: "通义千问", baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1", model: "qwen-plus" },
  { id: "kimi", label: "月之暗面 Kimi", baseURL: "https://api.moonshot.cn/v1", model: "moonshot-v1-8k" },
  { id: "siliconflow", label: "SiliconFlow", baseURL: "https://api.siliconflow.cn/v1", model: "Qwen/Qwen2.5-7B-Instruct" },
  { id: "openai", label: "OpenAI", baseURL: "https://api.openai.com/v1", model: "gpt-4o-mini" },
  { id: "other", label: "其他兼容服务", baseURL: "", model: "" },
];

export default function SettingsDialog({
  open,
  settings,
  serverConfig,
  onChange,
  onClose,
}: SettingsDialogProps) {
  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open, onClose]);

  if (!open) return null;

  function selectProvider(providerId: string) {
    const provider = PROVIDERS.find((item) => item.id === providerId);
    if (!provider) return;
    onChange({
      ...settings,
      provider: providerId,
      baseURL: provider.baseURL,
      model: provider.model,
    });
  }

  return (
    <div className="dialog-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="settings-dialog" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <div className="dialog-header">
          <div>
            <div className="eyebrow">GENERATION ENGINE</div>
            <h2 id="settings-title">解析与模型设置</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="关闭设置">
            <X size={20} />
          </button>
        </div>

        <div className="mode-options" role="radiogroup" aria-label="解析方式">
          <label className={`mode-card ${settings.mode === "local" ? "selected" : ""}`}>
            <input
              type="radio"
              name="mode"
              checked={settings.mode === "local"}
              onChange={() => onChange({ ...settings, mode: "local" })}
            />
            <Sparkles size={20} />
            <strong>本地规则</strong>
            <span>无需 Key，即开即用</span>
          </label>
          <label className={`mode-card ${settings.mode === "server" ? "selected" : ""} ${!serverConfig.serverConfigured ? "disabled" : ""}`}>
            <input
              type="radio"
              name="mode"
              disabled={!serverConfig.serverConfigured}
              checked={settings.mode === "server"}
              onChange={() => onChange({ ...settings, mode: "server" })}
            />
            <ShieldCheck size={20} />
            <strong>服务端 AI</strong>
            <span>{serverConfig.serverConfigured ? "部署方已配置密钥" : "尚未配置环境变量"}</span>
          </label>
          <label className={`mode-card ${settings.mode === "custom" ? "selected" : ""}`}>
            <input
              type="radio"
              name="mode"
              checked={settings.mode === "custom"}
              onChange={() => onChange({ ...settings, mode: "custom" })}
            />
            <Bot size={20} />
            <strong>自有 AI 接口</strong>
            <span>OpenAI 兼容协议</span>
          </label>
        </div>

        {settings.mode === "local" && (
          <div className="settings-note">
            <strong>本地模式支持</strong>
            <p>函数与抛物线、三角形中线与四心、圆、正多边形、向量和椭圆。复杂题意与图片识别请使用 AI 模式。</p>
          </div>
        )}

        {settings.mode === "server" && (
          <div className="settings-note">
            <strong>当前服务端模型</strong>
            <p>{serverConfig.model || "由部署方配置"} · 密钥仅保存在服务端，不会返回到浏览器。</p>
          </div>
        )}

        {settings.mode === "custom" && (
          <div className="custom-settings">
            <label className="field-label">
              <span>服务商预设</span>
              <select value={settings.provider} onChange={(event) => selectProvider(event.target.value)}>
                {PROVIDERS.map((provider) => (
                  <option key={provider.id} value={provider.id}>{provider.label}</option>
                ))}
              </select>
            </label>
            <label className="field-label">
              <span>Base URL</span>
              <input
                type="url"
                value={settings.baseURL}
                onChange={(event) => onChange({ ...settings, baseURL: event.target.value })}
                placeholder="https://api.example.com/v1"
                autoComplete="off"
              />
            </label>
            <label className="field-label">
              <span>模型名称</span>
              <input
                value={settings.model}
                onChange={(event) => onChange({ ...settings, model: event.target.value })}
                placeholder="deepseek-chat"
                autoComplete="off"
              />
            </label>
            <label className="field-label">
              <span>API Key</span>
              <div className="key-input">
                <KeyRound size={17} />
                <input
                  type="password"
                  value={settings.apiKey}
                  onChange={(event) => onChange({ ...settings, apiKey: event.target.value })}
                  placeholder="仅在本次页面会话中使用"
                  autoComplete="new-password"
                />
              </div>
            </label>
            <p className="privacy-hint">
              <ShieldCheck size={15} />
              Key 由当前页面发送至本地服务端代理，不写入历史记录或 localStorage。部署到公网时应改用服务端环境变量。
            </p>
          </div>
        )}

        <div className="dialog-actions">
          <button type="button" className="primary-button" onClick={onClose}>完成</button>
        </div>
      </section>
    </div>
  );
}
