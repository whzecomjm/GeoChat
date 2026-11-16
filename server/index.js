import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const isProduction = process.argv.includes("--production");
const app = express();
const port = Number(process.env.PORT || 5173);
const host = process.env.HOST || "127.0.0.1";

app.disable("x-powered-by");
app.use(express.json({ limit: "12mb" }));

const SYSTEM_PROMPT = `你是一名数学与几何作图助手。请把用户的自然语言需求转换成 GeoGebra Classic 命令。
只输出一个 JSON 对象，不要 Markdown 代码围栏，字段如下：
{
  "explanation": "简洁的中文构造说明，可分点",
  "commands": ["A=(0,0)", "B=(4,0)", "t=Polygon(A,B)"],
  "resetBefore": true,
  "view": {"xMin": -2, "xMax": 6, "yMin": -2, "yMax": 5}
}

规则：
1. commands 每项只能是一条合法 GeoGebra 命令，使用英文命令、半角括号与逗号，不要使用 LaTeX。
2. 先定义独立对象，再定义依赖对象。点名用大写字母开头，函数名用小写字母。
3. 点写作 A=(0,0)，函数写作 f(x)=x^2，圆周率写作 pi，平方根写作 sqrt(2)。
4. 可使用 Segment、Line、Ray、Polygon、Circle、Intersect、Midpoint、Center、Vector、Angle、PerpendicularLine、ParallelLine、PerpendicularBisector、Incircle、Ellipse、Rotate、Reflect 等常见命令。求外心用两条中垂线的交点；求内心用 Incircle 后取 Center；求重心用两条中线的交点；求垂心用两条高线的交点。不要使用 TriangleCenter。
5. 样式命令必须紧跟相关对象，使用 SetColor、SetLineStyle、SetLineThickness、SetFilling、ShowLabel。
6. 默认清空画板重新构造。只有用户明确要求在现有图形上添加时，才把 resetBefore 设为 false。
7. view 用于设置合适的可视范围，xMin 小于 xMax，yMin 小于 yMax。
8. explanation 说明关键几何关系和可交互对象，不要声称完成了未生成的对象。
9. 如果图片条件无法辨认，应在 explanation 中明确说明，不要编造。`;

const ALLOWED_FUNCTIONS = new Set([
  "Segment", "Line", "Ray", "Polygon", "Circle", "Semicircle", "CircularArc", "CircularSector",
  "Intersect", "Midpoint", "Center", "Point", "Vector", "Distance", "Area", "Angle", "AngleBisector",
  "PerpendicularLine", "ParallelLine", "PerpendicularBisector", "Incircle",
  "Ellipse", "Hyperbola", "Parabola", "Conic", "Rotate", "Reflect", "Translate", "Dilate",
  "SetColor", "SetLineStyle", "SetLineThickness", "SetFilling", "SetLabelMode", "SetPointStyle",
  "SetPointSize", "SetCaption", "ShowLabel", "SetVisibleInView", "SetPerspective", "SetCoords",
  "SetActiveView", "ZoomIn", "ZoomOut", "CenterView",
]);

function validateCommands(input) {
  if (!Array.isArray(input) || input.length === 0 || input.length > 100) {
    throw new Error("模型没有返回有效的作图命令数组。");
  }
  return input.map((raw, index) => {
    if (typeof raw !== "string") throw new Error(`第 ${index + 1} 条命令不是字符串。`);
    const command = raw.trim();
    if (!command || command.length > 400 || /[\r\n;<>]/.test(command)) {
      throw new Error(`第 ${index + 1} 条命令格式异常。`);
    }
    const assignment = /^[A-Za-z][A-Za-z0-9_]{0,31}(?:\([a-z]\))?\s*=\s*.+$/.test(command);
    const call = command.match(/^([A-Za-z][A-Za-z0-9_]*)\s*\(.*\)$/);
    if (!assignment && (!call || !ALLOWED_FUNCTIONS.has(call[1]))) {
      throw new Error(`模型返回了未允许的命令：${command}`);
    }
    return command;
  });
}

function validateCustomUrl(raw) {
  const url = new URL(raw);
  if (url.protocol !== "https:" || url.username || url.password) {
    throw new Error("自定义接口必须使用不含账号信息的 HTTPS 地址。");
  }
  const hostname = url.hostname.toLowerCase();
  if (
    hostname === "localhost" ||
    hostname === "::1" ||
    hostname === "0.0.0.0" ||
    /^127\./.test(hostname) ||
    /^10\./.test(hostname) ||
    /^192\.168\./.test(hostname) ||
    /^169\.254\./.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(hostname)
  ) {
    throw new Error("自定义接口不能指向本机或私有网络地址。");
  }
  return url.toString().replace(/\/$/, "");
}

function parseModelJSON(content) {
  const text = String(content || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("模型未返回结构化 JSON，请重试或更换模型。");
  return JSON.parse(text.slice(start, end + 1));
}

function cleanView(view) {
  if (!view || typeof view !== "object") return undefined;
  const result = {
    xMin: Number(view.xMin),
    xMax: Number(view.xMax),
    yMin: Number(view.yMin),
    yMax: Number(view.yMax),
  };
  if (!Object.values(result).every(Number.isFinite)) return undefined;
  if (result.xMin >= result.xMax || result.yMin >= result.yMax) return undefined;
  if (Object.values(result).some((value) => Math.abs(value) > 1e6)) return undefined;
  return result;
}

app.get("/api/config", (_req, res) => {
  res.json({
    serverConfigured: Boolean(process.env.AI_API_KEY),
    baseURL: process.env.AI_BASE_URL || "https://api.deepseek.com/v1",
    model: process.env.AI_MODEL || "deepseek-chat",
  });
});

app.post("/api/generate", async (req, res) => {
  const { message, history = [], images = [], settings = {} } = req.body ?? {};
  if (typeof message !== "string" || !message.trim() || message.length > 4000) {
    return res.status(400).json({ error: "题目内容为空或超过 4000 字。" });
  }

  const customMode = settings.mode === "custom";
  const apiKey = customMode ? String(settings.apiKey || "") : process.env.AI_API_KEY;
  if (!apiKey) {
    return res.status(400).json({ error: customMode ? "请在设置中填写自己的 API Key。" : "服务端尚未配置 AI_API_KEY。" });
  }

  let baseURL;
  try {
    baseURL = customMode
      ? validateCustomUrl(String(settings.baseURL || ""))
      : String(process.env.AI_BASE_URL || "https://api.deepseek.com/v1").replace(/\/$/, "");
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : "接口地址无效。" });
  }
  const model = customMode
    ? String(settings.model || "").trim()
    : String(process.env.AI_MODEL || "deepseek-chat");
  if (!model || model.length > 120) return res.status(400).json({ error: "请填写有效的模型名称。" });

  const safeHistory = Array.isArray(history)
    ? history.slice(-10).filter((item) => item && ["user", "assistant"].includes(item.role) && typeof item.content === "string").map((item) => ({
        role: item.role,
        content: item.content.slice(0, 5000),
      }))
    : [];
  const safeImages = Array.isArray(images)
    ? images.slice(0, 3).filter((image) => image && typeof image.dataUrl === "string" && /^data:image\/(png|jpeg|jpg|webp);base64,/i.test(image.dataUrl) && image.dataUrl.length < 8_000_000)
    : [];
  const content = safeImages.length
    ? [
        { type: "text", text: message.trim() },
        ...safeImages.map((image) => ({ type: "image_url", image_url: { url: image.dataUrl } })),
      ]
    : message.trim();
  const endpoint = baseURL.endsWith("/chat/completions") ? baseURL : `${baseURL}/chat/completions`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 75_000);

  try {
    const upstream = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "system", content: SYSTEM_PROMPT }, ...safeHistory, { role: "user", content }],
        temperature: 0.2,
        max_tokens: 3500,
        stream: false,
      }),
      signal: controller.signal,
    });
    const responseText = await upstream.text();
    let payload;
    try {
      payload = JSON.parse(responseText);
    } catch {
      payload = null;
    }
    if (!upstream.ok) {
      const upstreamMessage = payload?.error?.message || payload?.message || `模型服务返回 HTTP ${upstream.status}`;
      return res.status(502).json({ error: String(upstreamMessage).slice(0, 500) });
    }
    const result = parseModelJSON(payload?.choices?.[0]?.message?.content);
    const explanation = typeof result.explanation === "string" ? result.explanation.trim() : "";
    if (!explanation) throw new Error("模型返回了解析命令，但缺少构造说明。");
    return res.json({
      explanation: explanation.slice(0, 8000),
      commands: validateCommands(result.commands),
      resetBefore: result.resetBefore !== false,
      view: cleanView(result.view),
      source: "ai",
    });
  } catch (error) {
    const messageText = error instanceof Error ? error.message : "模型调用失败。";
    const friendly = messageText.includes("aborted")
      ? "模型响应超时，请稍后重试。"
      : messageText;
    return res.status(502).json({ error: friendly.slice(0, 600) });
  } finally {
    clearTimeout(timeout);
  }
});

if (isProduction) {
  app.use(express.static(path.join(root, "dist")));
  app.get("*", (_req, res) => res.sendFile(path.join(root, "dist", "index.html")));
} else {
  const { createServer: createViteServer } = await import("vite");
  const vite = await createViteServer({
    root,
    server: { middlewareMode: true },
    appType: "spa",
  });
  app.use(vite.middlewares);
}

app.listen(port, host, () => {
  console.log(`GeoChat is running at http://${host}:${port}`);
  console.log(`Server AI: ${process.env.AI_API_KEY ? "configured" : "not configured; local mode available"}`);
});
