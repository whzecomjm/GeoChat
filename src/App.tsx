import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Bot,
  Braces,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  Clock3,
  History,
  ImagePlus,
  LoaderCircle,
  Menu,
  MessageSquareText,
  Plus,
  Send,
  Settings2,
  Shapes,
  Sparkles,
  Trash2,
  X,
  Zap,
} from "lucide-react";
import GeoBoard, { type GeoBoardHandle } from "./components/GeoBoard";
import SettingsDialog from "./components/SettingsDialog";
import { parseLocal } from "./lib/localParser";
import {
  createConversation,
  createId,
  loadConversations,
  loadSettings,
  saveConversations,
  saveSettings,
} from "./lib/storage";
import type {
  AISettings,
  ChatMessage,
  Conversation,
  GenerateResult,
  ImageAttachment,
  ServerConfig,
} from "./types";

const EXAMPLES = [
  { tag: "函数", title: "抛物线与顶点", prompt: "画一个抛物线 y=x^2+2x+1，并标出顶点和对称轴" },
  { tag: "几何", title: "三角形的外接圆", prompt: "画三角形 A(0,0)、B(6,0)、C(2,4)，作出三条中线和外接圆" },
  { tag: "构造", title: "正六边形", prompt: "画一个半径为 3 的正六边形" },
  { tag: "三角函数", title: "正弦曲线", prompt: "绘制函数 y=sin(x) 的图像" },
];

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) {
    return date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
  }
  return date.toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" });
}

function readAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("图片读取失败"));
    reader.readAsDataURL(file);
  });
}

async function compressImage(file: File): Promise<ImageAttachment> {
  if (!/^image\/(png|jpeg|jpg|webp)$/i.test(file.type)) {
    throw new Error("仅支持 PNG、JPG 和 WebP 图片");
  }
  if (file.size > 10 * 1024 * 1024) throw new Error("单张图片不能超过 10 MB");
  const source = await readAsDataURL(file);
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const element = new Image();
    element.onload = () => resolve(element);
    element.onerror = () => reject(new Error("无法解码这张图片"));
    element.src = source;
  });
  const scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("浏览器无法处理图片");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return {
    id: createId(),
    name: file.name,
    mediaType: "image/jpeg",
    dataUrl: canvas.toDataURL("image/jpeg", 0.84),
  };
}

export default function App() {
  const [conversations, setConversations] = useState<Conversation[]>(loadConversations);
  const [activeId, setActiveId] = useState(() => conversations[0]?.id ?? "");
  const [settings, setSettings] = useState<AISettings>(loadSettings);
  const [serverConfig, setServerConfig] = useState<ServerConfig>({
    serverConfigured: false,
    baseURL: "",
    model: "",
  });
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<ImageAttachment[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [boardReady, setBoardReady] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [mobileView, setMobileView] = useState<"chat" | "board">("chat");
  const [toast, setToast] = useState("");
  const boardRef = useRef<GeoBoardHandle>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const toastTimerRef = useRef<number | undefined>(undefined);

  const activeConversation = useMemo(
    () => conversations.find((item) => item.id === activeId) ?? conversations[0],
    [activeId, conversations],
  );

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(""), 3200);
  }, []);

  useEffect(() => saveConversations(conversations), [conversations]);
  useEffect(() => saveSettings(settings), [settings]);
  useEffect(() => {
    fetch("/api/config")
      .then((response) => response.json())
      .then((config: ServerConfig) => setServerConfig(config))
      .catch(() => undefined);
  }, []);
  useEffect(() => {
    if (!activeConversation?.messages.length) return;
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [activeConversation?.messages]);
  useEffect(() => {
    if (!boardReady || !activeConversation) return;
    try {
      if (activeConversation.commands.length) {
        boardRef.current?.execute(activeConversation.commands, true, activeConversation.view);
      } else {
        boardRef.current?.reset(false);
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : "历史画板恢复失败");
    }
    // Only restore when switching conversations or when the board becomes ready.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, boardReady]);

  function updateConversation(id: string, updater: (item: Conversation) => Conversation) {
    setConversations((items) => items.map((item) => (item.id === id ? updater(item) : item)));
  }

  function newConversation() {
    if (activeConversation && activeConversation.messages.length === 0) {
      setHistoryOpen(false);
      setMobileView("chat");
      textareaRef.current?.focus();
      return;
    }
    const conversation = createConversation();
    setConversations((items) => [conversation, ...items]);
    setActiveId(conversation.id);
    setInput("");
    setAttachments([]);
    setHistoryOpen(false);
    setMobileView("chat");
    window.setTimeout(() => textareaRef.current?.focus(), 50);
  }

  function deleteConversation(id: string) {
    const remaining = conversations.filter((item) => item.id !== id);
    if (!remaining.length) remaining.push(createConversation());
    setConversations(remaining);
    if (id === activeId) setActiveId(remaining[0].id);
    showToast("历史记录已删除");
  }

  async function addImages(files: FileList | null) {
    if (!files?.length) return;
    const available = 3 - attachments.length;
    if (available <= 0) {
      showToast("每次最多添加 3 张图片");
      return;
    }
    try {
      const processed = await Promise.all(Array.from(files).slice(0, available).map(compressImage));
      setAttachments((items) => [...items, ...processed]);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "图片处理失败");
    }
  }

  async function submitPrompt(override?: string) {
    const prompt = (override ?? input).trim();
    if (!prompt || isGenerating || !activeConversation) return;
    if (!boardReady) {
      showToast("请等待 GeoGebra 画板加载完成");
      return;
    }
    if (settings.mode === "custom" && !settings.apiKey.trim()) {
      setSettingsOpen(true);
      showToast("请先填写自有接口的 API Key");
      return;
    }
    if (settings.mode === "server" && !serverConfig.serverConfigured) {
      setSettingsOpen(true);
      showToast("服务端尚未配置 AI_API_KEY");
      return;
    }
    if (settings.mode === "local" && attachments.length) {
      showToast("本地规则模式不识别图片，请移除图片或切换到 AI 模式");
      return;
    }

    const conversationId = activeConversation.id;
    const userMessage: ChatMessage = {
      id: createId(),
      role: "user",
      content: prompt,
      createdAt: Date.now(),
      imageNames: attachments.map((item) => item.name),
    };
    const assistantId = createId();
    const pendingMessage: ChatMessage = {
      id: assistantId,
      role: "assistant",
      content: "",
      createdAt: Date.now(),
      pending: true,
    };
    const isFirstPrompt = !activeConversation.messages.some((item) => item.role === "user");
    const historyPayload = activeConversation.messages
      .filter((item) => !item.pending && !item.error && item.content)
      .slice(-8)
      .map(({ role, content }) => ({ role, content }));

    updateConversation(conversationId, (item) => ({
      ...item,
      title: isFirstPrompt ? prompt.replace(/\s+/g, " ").slice(0, 30) : item.title,
      updatedAt: Date.now(),
      messages: [...item.messages, userMessage, pendingMessage],
    }));
    setInput("");
    const requestImages = attachments;
    setAttachments([]);
    setIsGenerating(true);

    try {
      let result: GenerateResult;
      if (settings.mode === "local") {
        result = parseLocal(prompt);
      } else {
        const response = await fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: prompt,
            history: historyPayload,
            images: requestImages,
            settings: {
              ...settings,
              apiKey: settings.mode === "custom" ? settings.apiKey : "",
            },
          }),
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "AI 解析失败，请稍后重试");
        result = payload as GenerateResult;
      }

      boardRef.current?.execute(result.commands, result.resetBefore, result.view);
      const nextCommands = result.resetBefore
        ? result.commands
        : [...activeConversation.commands, ...result.commands];
      updateConversation(conversationId, (item) => ({
        ...item,
        updatedAt: Date.now(),
        commands: nextCommands,
        view: result.view ?? item.view,
        messages: item.messages.map((message) =>
          message.id === assistantId
            ? {
                ...message,
                content: result.explanation,
                commands: result.commands,
                source: result.source,
                pending: false,
              }
            : message,
        ),
      }));
      if (window.innerWidth <= 760) setMobileView("board");
    } catch (error) {
      updateConversation(conversationId, (item) => ({
        ...item,
        updatedAt: Date.now(),
        messages: item.messages.map((message) =>
          message.id === assistantId
            ? {
                ...message,
                content: error instanceof Error ? error.message : "生成失败，请稍后重试",
                pending: false,
                error: true,
              }
            : message,
        ),
      }));
    } finally {
      setIsGenerating(false);
      window.setTimeout(() => textareaRef.current?.focus(), 50);
    }
  }

  const modeLabel = settings.mode === "local" ? "本地规则" : settings.mode === "server" ? "服务端 AI" : "自有 AI";

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-block">
          <button type="button" className="icon-button mobile-history-button" onClick={() => setHistoryOpen(true)} aria-label="打开历史记录">
            <Menu size={21} />
          </button>
          <div className="brand-mark" aria-hidden="true"><Shapes size={23} /></div>
          <div>
            <div className="brand-name">GeoChat</div>
            <div className="brand-subtitle">AI GEOMETRY WORKSPACE</div>
          </div>
        </div>
        <div className="topbar-center">
          <span className="live-dot" />
          自然语言到动态数学图形
        </div>
        <button type="button" className="settings-button" onClick={() => setSettingsOpen(true)}>
          <Settings2 size={17} />
          <span>{modeLabel}</span>
          <ChevronDown size={14} />
        </button>
      </header>

      <div className="mobile-view-switch" aria-label="移动端视图切换">
        <button type="button" className={mobileView === "chat" ? "active" : ""} onClick={() => setMobileView("chat")}>
          <MessageSquareText size={16} /> 对话
        </button>
        <button type="button" className={mobileView === "board" ? "active" : ""} onClick={() => setMobileView("board")}>
          <Shapes size={16} /> 画板
        </button>
      </div>

      <main className="workspace">
        {historyOpen && <button type="button" className="history-backdrop" onClick={() => setHistoryOpen(false)} aria-label="关闭历史记录" />}
        <aside className={`history-panel ${historyOpen ? "is-open" : ""}`}>
          <div className="history-topline">
            <span>我的空间</span>
            <button type="button" className="icon-button close-history" onClick={() => setHistoryOpen(false)} aria-label="关闭历史记录">
              <X size={18} />
            </button>
          </div>
          <button type="button" className="new-chat-button" onClick={newConversation}>
            <Plus size={18} />
            新建几何探索
          </button>
          <div className="history-label">
            <span><History size={14} /> 历史记录</span>
            <span>{conversations.length}</span>
          </div>
          <div className="history-list">
            {conversations.map((conversation) => (
              <div
                key={conversation.id}
                className={`history-item ${conversation.id === activeConversation?.id ? "active" : ""}`}
                onClick={() => {
                  setActiveId(conversation.id);
                  setHistoryOpen(false);
                }}
              >
                <div className="history-item-icon"><MessageSquareText size={16} /></div>
                <div className="history-item-content">
                  <strong>{conversation.title}</strong>
                  <span><Clock3 size={12} /> {formatTime(conversation.updatedAt)} · {conversation.messages.filter((item) => item.role === "user").length} 次提问</span>
                </div>
                <button
                  type="button"
                  className="delete-history"
                  onClick={(event) => {
                    event.stopPropagation();
                    deleteConversation(conversation.id);
                  }}
                  aria-label={`删除 ${conversation.title}`}
                  title="删除记录"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
          <div className="storage-note">
            <CheckCircle2 size={15} />
            <span>记录保存在当前浏览器<br />最多保留 40 组探索</span>
          </div>
        </aside>

        <section className={`chat-panel ${mobileView === "chat" ? "mobile-active" : ""}`} aria-label="对话区域">
          <div className="panel-heading chat-heading">
            <div>
              <div className="eyebrow">CONVERSATION</div>
              <h1>{activeConversation?.title ?? "新的几何探索"}</h1>
            </div>
            <span className="engine-badge"><Zap size={13} /> {modeLabel}</span>
          </div>

          <div className="messages" aria-live="polite">
            {!activeConversation?.messages.length && (
              <div className="empty-state">
                <div className="empty-illustration">
                  <div className="orbit orbit-one" />
                  <div className="orbit orbit-two" />
                  <Shapes size={42} />
                </div>
                <div className="empty-kicker"><Sparkles size={15} /> 从一句话开始</div>
                <h2>把数学想法变成<br /><span>可交互的动态图形</span></h2>
                <p>描述函数、几何关系或构造要求，系统会解析意图并在 GeoGebra 中完成作图。</p>
                <div className="example-grid">
                  {EXAMPLES.map((example) => (
                    <button type="button" key={example.title} className="example-card" onClick={() => void submitPrompt(example.prompt)} disabled={!boardReady || isGenerating}>
                      <span>{example.tag}</span>
                      <strong>{example.title}</strong>
                      <small>{example.prompt}</small>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {activeConversation?.messages.map((message) => (
              <article key={message.id} className={`message ${message.role} ${message.error ? "is-error" : ""}`}>
                <div className="message-avatar" aria-hidden="true">
                  {message.role === "assistant" ? <Shapes size={17} /> : <span>你</span>}
                </div>
                <div className="message-body">
                  <div className="message-meta">
                    <strong>{message.role === "assistant" ? "GeoChat" : "你"}</strong>
                    {message.source && <span>{message.source === "local" ? "本地解析" : "AI 生成"}</span>}
                    <time>{formatTime(message.createdAt)}</time>
                  </div>
                  {message.pending ? (
                    <div className="thinking" role="status">
                      <LoaderCircle className="spin" size={17} />
                      <div>
                        <strong>正在理解题意并构造图形</strong>
                        <span>解析对象关系、生成命令、写入画板</span>
                      </div>
                    </div>
                  ) : (
                    <div className="message-content">
                      {message.error && <CircleAlert size={17} />}
                      <span>{message.content}</span>
                    </div>
                  )}
                  {message.imageNames?.length ? (
                    <div className="message-images"><ImagePlus size={14} /> {message.imageNames.join("、")}</div>
                  ) : null}
                  {message.commands?.length ? (
                    <details className="command-details">
                      <summary><Braces size={14} /> 查看作图命令 <span>{message.commands.length}</span></summary>
                      <pre>{message.commands.join("\n")}</pre>
                    </details>
                  ) : null}
                </div>
              </article>
            ))}
            <div ref={messagesEndRef} />
          </div>

          <div className="composer-wrap">
            {attachments.length > 0 && (
              <div className="attachment-list">
                {attachments.map((attachment) => (
                  <div className="attachment-chip" key={attachment.id}>
                    <img src={attachment.dataUrl} alt="待上传题目缩略图" />
                    <span>{attachment.name}</span>
                    <button type="button" onClick={() => setAttachments((items) => items.filter((item) => item.id !== attachment.id))} aria-label={`移除 ${attachment.name}`}>
                      <X size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <form
              className={`composer ${isGenerating ? "is-generating" : ""}`}
              onSubmit={(event) => {
                event.preventDefault();
                void submitPrompt();
              }}
            >
              <button type="button" className="attach-button" onClick={() => fileRef.current?.click()} disabled={isGenerating} title="上传题目图片" aria-label="上传题目图片">
                <ImagePlus size={20} />
              </button>
              <input
                ref={fileRef}
                className="visually-hidden"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                multiple
                onChange={(event) => {
                  void addImages(event.target.files);
                  event.target.value = "";
                }}
              />
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                    event.preventDefault();
                    void submitPrompt();
                  }
                }}
                placeholder="输入数学或几何需求，例如：画 y=x² 并标出顶点…"
                rows={2}
                maxLength={4000}
                aria-label="数学或几何需求"
              />
              <button type="submit" className="send-button" disabled={!input.trim() || isGenerating || !boardReady} aria-label="发送需求">
                {isGenerating ? <LoaderCircle className="spin" size={19} /> : <Send size={19} />}
              </button>
            </form>
            <div className="composer-hint">
              <span>{settings.mode === "local" ? "本地模式无需联网解析" : "AI 生成结果请核对数学条件"}</span>
              <span>Enter 发送 · Shift + Enter 换行</span>
            </div>
          </div>
        </section>

        <div className={`board-wrapper ${mobileView === "board" ? "mobile-active" : ""}`}>
          <GeoBoard ref={boardRef} commands={activeConversation?.commands ?? []} onReadyChange={setBoardReady} onToast={showToast} />
        </div>
      </main>

      <SettingsDialog open={settingsOpen} settings={settings} serverConfig={serverConfig} onChange={setSettings} onClose={() => setSettingsOpen(false)} />
      {toast && <div className="toast" role="status">{toast}</div>}
      <div className="ai-disclosure"><Bot size={13} /> AI 辅助作图 · 结果可编辑</div>
    </div>
  );
}
