# GeoChat · AI 几何工作台

用户输入数学或几何需求，系统解析意图、生成 GeoGebra 命令，并在页面内渲染可拖动、可缩放的动态图形。

## 1. 功能范围

### 输入

1. 自然语言数学或几何需求。
2. 最多 3 张题目图片，支持 PNG、JPG、WebP。前端压缩到最长边 1600 像素后再发送。
3. 发送快捷键：Enter 发送，Shift + Enter 换行。
4. 示例需求卡片可直接触发一条完整作图流程。

### 解析方式

1. `本地规则`：不调用大模型，不需要 Key，覆盖函数与抛物线、三角形四心与中线高线、圆、正多边形、向量、椭圆、常见直线。
2. `服务端 AI`：使用部署方环境变量中的 Key，浏览器拿不到密钥。
3. `自有 AI 接口`：支持 OpenAI 兼容的 `/chat/completions` 接口。Key 只保留在当前页面内存中，不写入 localStorage，不进入对话历史。
4. 图片识别仅在 AI 模式下可用。服务端把图片以 Data URL 形式传给视觉模型。
5. 模型必须返回结构化 JSON，服务端和浏览器都会校验 GeoGebra 命令白名单。

### GeoGebra 生成与渲染

1. 通过 GeoGebra 官方 `deployggb.js` 加载 Classic 画板。
2. 命令按顺序执行，成功后设置合适的坐标视窗。
3. 执行失败会自动恢复到作图前的画板快照，避免留下半成品。
4. 自由点、中点、圆心等对象可拖动，几何依赖关系会联动。
5. 支持清空画板、复制命令、导出 `.ggb`、导出 PNG、打开本地 `.ggb`。
6. 窄屏画板自动切换到只看图形视图，避免代数区挤占空间。

### 历史记录

1. 每组对话保存标题、消息、GeoGebra 命令与视窗。
2. 最多保留 40 组，存储在浏览器 localStorage。
3. 切换历史记录会重放命令，恢复当时的图形。
4. 支持新建和删除记录。图片只记录文件名，原始图片不写入历史，避免占满本地存储。

## 2. 页面结构与交互流程

### 页面结构

桌面端为三栏：

1. 左侧历史记录：新建探索、历史列表、删除、存储说明。
2. 中间对话区：标题栏、消息流、示例卡片、图片附件、输入框。
3. 右侧 GeoGebra 画板：状态、工具条、动态画布、操作提示。

窄屏，也就是宽度不超过 760px 时，切换为 `对话 / 画板` 双视图，历史记录变为左侧抽屉。生成成功且处于手机宽度时，自动切到画板查看结果。

### 主流程

1. 页面启动后并行加载 GeoGebra 脚本与 `/api/config`。
2. 用户输入需求，可选择附带图片。
3. 本地模式调用规则解析器 `parseLocal`。
4. AI 模式把当前问题、最近消息和图片发送到 `/api/generate`。
5. 服务端调用模型，解析 JSON，校验命令。
6. 前端先显示助手消息为 `正在理解题意并构造图形`。
7. 画板执行命令。成功后写入助手解释、命令折叠区和历史记录；失败则回滚画板并显示错误。
8. 历史切换时重新执行该会话保存的命令与视窗。

## 3. 技术栈

| 层 | 技术 | 用途 |
| --- | --- | --- |
| 前端 | React 19 + TypeScript | 状态、对话、设置、历史 |
| 构建 | Vite 6 | 开发服务、HMR、生产构建 |
| 图标 | lucide-react | 统一图标与状态符号 |
| 画板 | GeoGebra Apps API | 动态图形、命令执行、GGB/PNG 导出 |
| 服务端 | Node.js + Express 4 | 静态托管、模型代理、配置接口 |
| AI | OpenAI 兼容 Chat Completions | DeepSeek、通义、Kimi、SiliconFlow、OpenAI、自定义 |
| 存储 | localStorage | 对话、命令、非敏感模型配置 |

## 4. 关键模块

```text
geogebra-webchat/
├─ server/
│  └─ index.js              # 配置接口、模型代理、命令校验、生产静态托管
├─ src/
│  ├─ App.tsx               # 会话、发送流程、历史、响应式状态
│  ├─ components/
│  │  ├─ GeoBoard.tsx       # 画板生命周期、工具栏、导出、移动端视角
│  │  └─ SettingsDialog.tsx # 本地/服务端/自有接口配置
│  ├─ lib/
│  │  ├─ geogebra.ts        # 脚本加载、命令白名单、事务式执行
│  │  ├─ localParser.ts     # 无需模型的数学意图解析
│  │  └─ storage.ts         # 历史与设置持久化
│  ├─ types/geogebra.d.ts   # GeoGebra API 类型
│  ├─ types.ts              # 业务类型
│  └─ styles.css            # 三栏界面、动效、窄屏适配
├─ .env.example
├─ package-lock.json
├─ package.json
└─ vite.config.ts
```

### 模块职责

1. `App.tsx`：唯一业务状态入口。先确认画板可用和模式配置，再发送请求。只有画板执行成功后才提交助手结果和历史，保证对话状态与图形一致。
2. `localParser.ts`：用正则和轻量数学运算识别常见课堂场景。输出仍是标准 GeoGebra 命令，因此与 AI 模式共用同一渲染通路。
3. `geogebra.ts`：限制允许的赋值语句和命令函数，拒绝多行、分号、尖括号等异常输入；执行前保存快照，失败时恢复。
4. `GeoBoard.tsx`：初始化 GeoGebra，处理 `appletOnLoad`、尺寸变化、窄屏视角、导出和文件打开。
5. `server/index.js`：服务端密钥隔离。`GET /api/config` 只返回是否已配置，绝不返回密钥。自定义地址强制 HTTPS，并拒绝本机和私有网段。
6. `storage.ts`：持久化非敏感数据，保存失败时退化为当前会话可用。

## 5. 本地部署

### 5.1 满足条件

1. Node.js 18 或更高版本。
2. npm，随 Node.js 安装。
3. 现代浏览器，建议使用 Chrome、Edge 或 QQ 浏览器。
4. 能访问 GeoGebra 官方脚本地址 `https://www.geogebra.org/apps/deployggb.js`。
5. 本机 5173 端口可用，或准备使用其他端口。

本地规则模式无需 API Key，也无需联网调用模型。画板本身首次加载仍需要访问 GeoGebra CDN。

### 5.2 开发运行

进入项目目录：

```bash
cd "C:/Users/Administrator/Desktop/new/test/geogebra-webchat"
```

首次安装依赖：

```bash
npm install
```

如果项目已有 `package-lock.json`，也可以使用：

```bash
npm ci
```

启动开发服务：

```bash
npm run dev
```

打开：

```text
http://127.0.0.1:5173/
```

开发模式由 Express 挂载 Vite middleware，适合修改代码、调界面和验证功能。

### 5.3 生产运行

先构建：

```bash
npm run build
```

再启动：

```bash
npm start
```

打开：

```text
http://127.0.0.1:5173/
```

生产模式由 Express 托管 `dist/`。修改源码后需要重新执行 `npm run build`，否则看到的仍是旧构建。

### 5.4 本机端口与监听地址

服务端支持两个环境变量：

```env
PORT=5173
HOST=127.0.0.1
```

1. `PORT` 默认是 5173。
2. `HOST` 默认是 127.0.0.1，只监听本机。
3. 同机 Nginx 反向代理时，保持 `HOST=127.0.0.1` 即可。
4. 容器或托管平台要求监听全部网卡时，再设置 `HOST=0.0.0.0`。
5. 直接监听 `0.0.0.0` 时，必须配合防火墙或反向代理，不要在无保护公网环境中裸跑。

### 5.5 局域网内临时访问

如果需要在同一局域网中的手机或平板访问，可设置：

```env
HOST=0.0.0.0
PORT=5173
```

重启后，在同一网络下访问：

```text
http://电脑内网IP:5173/
```

此方式适合可信局域网临时演示。长期共享建议使用在线部署和 HTTPS 域名。

## 6. 在线部署

### 6.1 推荐架构

```text
用户浏览器
  → HTTPS 域名
  → Nginx 反向代理
  → Node.js Express 服务 127.0.0.1:5173
  → 可选模型服务

用户浏览器
  → GeoGebra 官方 CDN
  → 加载 deployggb.js
```

要点：

1. Node 服务默认只监听本机，由 Nginx 转发公网请求。
2. 公网访问必须启用 HTTPS。
3. 浏览器需要能访问 GeoGebra CDN。
4. 服务端需要能访问所选模型接口。
5. 本项目没有数据库，历史记录保存在用户自己的浏览器中。

### 6.2 服务器准备

准备一台 Linux 服务器，并安装：

1. Node.js 18 或更高版本。
2. npm。
3. Nginx。
4. 域名解析和 HTTPS 证书。
5. 出站网络访问权限，用于 GeoGebra CDN 和模型 API。 GeoGebra 脚本由浏览器加载，模型接口由服务端调用。

### 6.3 部署步骤

假设项目目录为 `/opt/geogebra-webchat`：

```bash
sudo mkdir -p /opt/geogebra-webchat
```

上传项目源码到该目录。不要上传 `node_modules/`、`.env` 和本地测试产物。

安装依赖：

```bash
cd /opt/geogebra-webchat
npm ci
```

创建 `.env`：

```env
AI_API_KEY=你的真实密钥
AI_BASE_URL=https://api.deepseek.com/v1
AI_MODEL=deepseek-chat
PORT=5173
HOST=127.0.0.1
```

字段说明：

| 变量 | 说明 |
| --- | --- |
| `AI_API_KEY` | 服务端 AI 密钥。留空时服务端 AI 模式不可用，本地规则模式仍可用。 |
| `AI_BASE_URL` | OpenAI 兼容接口根地址。默认值是 DeepSeek。 |
| `AI_MODEL` | 默认模型名。需与服务商实际模型名一致。 |
| `PORT` | Node 服务端口，默认 5173。 |
| `HOST` | 监听地址，同机反代时保持 127.0.0.1。 |

构建生产包：

```bash
npm run build
```

前台试运行：

```bash
npm start
```

另开一个终端检查配置接口：

```bash
curl http://127.0.0.1:5173/api/config
```

正常返回类似：

```json
{
  "serverConfigured": true,
  "baseURL": "https://api.deepseek.com/v1",
  "model": "deepseek-chat"
}
```

确认无误后，停止前台进程，再交给进程守护工具运行。

### 6.4 Nginx 反向代理示例

将 `example.com` 和证书路径替换为自己的值：

```nginx
server {
    listen 80;
    server_name example.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name example.com;

    ssl_certificate /etc/letsencrypt/live/example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/example.com/privkey.pem;

    client_max_body_size 16m;

    location / {
        proxy_pass http://127.0.0.1:5173;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

检查并重载 Nginx：

```bash
sudo nginx -t
sudo systemctl reload nginx
```

### 6.5 进程守护方式一：systemd

创建服务文件：

```bash
sudo nano /etc/systemd/system/geochat.service
```

写入：

```ini
[Unit]
Description=GeoChat Web Service
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/geogebra-webchat
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

如果 `npm` 不在 `/usr/bin/npm`，先执行 `which npm`，再改成实际路径。

启动服务：

```bash
sudo systemctl daemon-reload
sudo systemctl enable geochat
sudo systemctl start geochat
```

查看状态：

```bash
sudo systemctl status geochat
```

查看日志：

```bash
journalctl -u geochat -f
```

### 6.6 进程守护方式二：PM2

安装 PM2：

```bash
npm install -g pm2
```

在项目目录创建 `ecosystem.config.js`：

```js
module.exports = {
  apps: [
    {
      name: "geochat",
      script: "npm",
      args: "start",
    },
  ],
};
```

启动服务：

```bash
pm2 start ecosystem.config.js
```

保存进程列表：

```bash
pm2 save
pm2 startup
```

常用检查命令：

```bash
pm2 logs geochat
pm2 restart geochat
pm2 stop geochat
```

### 6.7 容器与托管平台

容器部署要点：

1. 构建前执行 `npm ci` 和 `npm run build`。
2. 容器内设置 `HOST=0.0.0.0`，否则平台健康检查可能无法访问。
3. `.env` 不写入镜像，通过平台环境变量传入。
4. 映射容器端口 5173。
5. 公网入口仍建议放在 HTTPS 反向代理或平台网关之后。

参考 Dockerfile：

```dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

ENV HOST=0.0.0.0
ENV PORT=5173

EXPOSE 5173

CMD ["npm", "start"]
```

建议在 `.dockerignore` 中排除：

```text
node_modules
dist
.env
.git
```

托管平台部署时：

1. 构建命令填 `npm run build`。
2. 启动命令填 `npm start`。
3. 设置 `AI_API_KEY`、`AI_BASE_URL`、`AI_MODEL`。
4. 如果平台要求监听全网地址，设置 `HOST=0.0.0.0`。
5. 域名和 HTTPS 使用平台提供的能力。

### 6.8 在线部署检查清单

1. 浏览器打开域名后，画板状态显示 `已就绪`。
2. `/api/config` 能正常返回 JSON。
3. 本地规则模式可以画出抛物线或正六边形。
4. 服务端 AI 模式在选择前显示 `部署方已配置密钥`。
5. 使用图片题时，服务端日志没有出现 413 或请求体过大。
6. 浏览器控制台没有 GeoGebra 脚本加载失败提示。
7. 刷新页面后历史记录能恢复，切换会话能重放图形。
8. HTTPS 页面没有混合内容拦截。

### 6.9 公网安全建议

1. `.env` 和真实 API Key 不进入 Git 仓库。
2. 公网部署应启用 HTTPS。
3. 服务端 AI 模式是公开部署的推荐方式，Key 不会返回浏览器。
4. 自有 AI 接口模式适合个人临时测试，Key 只存在当前页面内存中，不适合作为公开服务的主要方式。
5. 当前项目没有账号系统和调用限额控制。若对公网开放，建议在 Nginx、平台网关或防火墙层增加访问控制。
6. 模型调用可能产生费用，应在使用说明中明确额度归属和误用处理方式。
7. 自定义 AI 接口强制 HTTPS，并拒绝指向本机或私有网络地址。
8. 生产环境更新密钥后，需要重启 Node 服务。

## 7. 完整使用说明

### 7.1 首次进入

1. 等待右侧画板状态从 `加载中` 变为 `已就绪`。
2. 如果状态显示 `加载失败`，点击 `重新加载`。常见原因是无法访问 GeoGebra CDN。
3. 默认是 `本地规则` 模式。此时无需配置 Key。
4. 页面空状态会显示示例卡片，点击任意卡片即可完成一次作图。

### 7.2 页面布局

桌面端：

1. 左侧是历史记录区。
2. 中间是对话区。
3. 右侧是 GeoGebra 画板区。

窄屏：

1. 顶部出现 `对话 / 画板` 切换按钮。
2. 左侧抽屉用于历史记录。
3. 作图成功后会自动切到画板，方便立即查看结果。

### 7.3 三种解析模式

| 模式 | 适用场景 | 是否联网解析 | Key 保存位置 |
| --- | --- | --- | --- |
| 本地规则 | 常见函数、三角形、圆、多边形 | 否 | 不需要 |
| 服务端 AI | 正式部署、复杂题目、图片题 | 是 | 服务端环境变量 |
| 自有 AI 接口 | 临时测试自己的模型 Key | 是 | 当前浏览器内存 |

切换方式：点击右上角显示当前模式的按钮，在弹窗中选择。

服务端 AI 在 `.env` 未配置时会禁用。自有 AI 接口需要填写 Base URL、模型名和 Key。

### 7.4 输入题目

1. 在下方输入框输入数学或几何需求。
2. Enter 发送，Shift + Enter 换行。
3. 单次输入最多 4000 字。
4. 等待助手消息从 `正在理解题意并构造图形` 变为构造说明。
5. 成功后，助手消息下方可展开 `查看作图命令`。

本地规则模式推荐写法：

```text
画一个抛物线 y=x^2+2x+1，并标出顶点和对称轴
```

```text
画三角形 A(0,0)、B(6,0)、C(2,4)，作出三条中线和外接圆
```

```text
画一个半径为 3 的正六边形
```

```text
绘制函数 y=sin(x) 的图像
```

```text
画圆心 O(1,2)、半径为 3 的圆，并标出直径
```

```text
画经过 (0,1) 和 (3,4) 的直线
```

更自然的复杂描述、图片题和跨步骤构造，建议切换到 AI 模式。

### 7.5 使用图片

1. 点击输入框左侧图片按钮选择文件。
2. 支持 PNG、JPG、WebP。
3. 单次最多 3 张，单张不超过 10 MB。
4. 前端会压缩到最长边 1600 像素。
5. 发送前可在输入框上方移除某张图片。
6. 图片只在 AI 模式下可用。本地模式会提示移除图片或切换模式。
7. 历史记录只保存图片文件名，原始图片不会写入 localStorage。

### 7.6 画板操作

右侧工具条功能：

| 按钮 | 作用 |
| --- | --- |
| 清空 | 清空当前画板并恢复默认坐标系 |
| 命令 | 复制当前会话保存的 GeoGebra 命令 |
| GGB | 导出当前画板为 `.ggb` 文件 |
| PNG | 导出当前画板为 PNG 图片 |
| 打开 | 打开本地 `.ggb` 文件并显示在画板中 |

画板内：

1. 拖动空白处可平移。
2. 滚轮可缩放。
3. 拖动自由点会联动相关几何对象。
4. 代数输入区可继续手动修改对象或输入 GeoGebra 命令。

### 7.7 历史记录

1. 点击 `新建几何探索` 创建一组空白会话，同时清空当前画板。
2. 点击历史项会恢复该会话的对话、命令和视窗。
3. 删除按钮会删除对应会话。
4. 最多保留 40 组探索。
5. 历史保存在当前浏览器 localStorage，不跨设备同步。
6. 清理浏览器站点数据会删除历史。

### 7.8 设置说明

设置弹窗分为三种模式：

1. `本地规则`：显示当前支持的高级题型范围，无需填写任何密钥。
2. `服务端 AI`：显示部署方配置的模型名，并提示密钥只在服务端保存。
3. `自有 AI 接口`：可选择 DeepSeek、通义千问、Kimi、SiliconFlow、OpenAI 或其他兼容服务。

自有接口填写要求：

1. Base URL 必须是 HTTPS 地址。
2. 模型名需与服务商文档一致。
3. Key 只保留在当前页面内存中，刷新页面后清空。
4. 公开发布时，建议切换到服务端 AI 模式。

### 7.9 本地规则的支持范围

本地规则模式覆盖以下内容：

1. 函数：一次函数、二次函数、三角函数、平方根、绝对值、指数、对数等常见写法。
2. 抛物线：顶点、对称轴、焦点、准线。
3. 三角形：三边、中线、高线、重心、垂心、内心、外心、内切圆、外接圆。
4. 正多边形：正三边形到正十二边形，可指定半径。
5. 圆：圆心、半径、直径。
6. 向量：两点向量。
7. 椭圆：焦点和长半轴构造。
8. 直线：两点直线和简单斜截式方程。

本地模式使用固定规则和模板匹配。它可以稳定处理上述常见题型，不具备通用数学推理能力。

### 7.10 常见问题

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| 画板一直显示加载中 | GeoGebra CDN 访问失败或初始化超时 | 检查网络，点击重新加载 |
| 发送按钮不可用 | 画板未就绪、输入为空或正在生成 | 等待画板就绪后重试 |
| 提示服务端尚未配置 AI_API_KEY | `.env` 未配置或改完未重启 | 配置 Key 并重启服务 |
| 服务端 AI 选项灰掉 | `/api/config` 返回未配置 | 检查环境变量和进程启动目录 |
| 本地模式提示无法识别 | 输入超出模板范围 | 改写为示例句式，或切换 AI 模式 |
| 本地模式提示图片不可用 | 本地规则不处理图片 | 移除图片或切换 AI 模式 |
| GeoGebra 未接受命令 | 模型返回了当前版本不支持的命令 | 换模型重试，或把题目改得更明确 |
| 刷新后历史消失 | 清理了站点数据或换了浏览器 | 历史只在当前浏览器本地保存 |
| 改代码后页面没变化 | 生产模式仍在使用旧 `dist/` | 重新执行 `npm run build` |
| 线上图片题报 413 | 请求体超过服务端 12MB 限制 | 减少图片数量或降低图片体积 |

## 8. 参考站 API Key 调查

### 查找思路

1. 读取公开 HTML，找到 `/assets/index-Bt8Ivk36.js` 与样式文件。
2. 格式化公开 JS，搜索 `apiKey`、`Authorization`、`fetch`、`localStorage`、`server-injected`。
3. 检查模型调用链和请求头生成逻辑。
4. 直接请求页面自身会调用的 `GET /llm-proxy`，只读取公开配置状态。
5. 搜索常见密钥格式 `sk-...`、`AIza...` 和硬编码 Bearer 值。

### 结果

1. 参考站前端没有硬编码默认 API Key。
2. 默认模式为 `服务端默认（免填 Key）`，页面会请求 `GET /llm-proxy` 获取 `baseURL`、`model` 和 `serverKey` 布尔值。
3. 实际返回为 `serverKey: true`，`baseURL: https://api.deepseek.com/v1`，`model: deepseek-flash`。没有返回密钥本身。
4. 密钥由 EdgeOne Makers 服务端通过 `MAKERS_MODELS_KEY` 环境变量注入。前端只保存用户手动填写的 Key，localStorage 键名为 `geochat-web-v3-key`，初始值为空。
5. 模型请求会经过 `/llm-proxy`，前端把目标地址放在 `x-target-url`，由服务端补上凭据，因此从公开页面无法取得真实 Key。

### 结论

`存在服务端默认 Key` 这一点可以从公开配置确认，但真实值没有下发到浏览器。要取得真实值必须访问部署平台的环境变量，这超出公开网页检查范围，也没有尝试绕过权限或调用他人额度。

复刻项目采用同样的安全边界：浏览器只拿到 `serverConfigured` 布尔值，真实 Key 只存在于 Node 服务端环境变量中。

## 9. 已检查项与限制

已执行：

1. `npm run build`，TypeScript 与 Vite 生产构建通过。
2. 5 组本地解析断言通过。
3. 浏览器实际验证：抛物线顶点与对称轴、三角形三中线、外接圆、重心、垂心、内心、内切圆、三条高线。
4. 浏览器实际验证：新建会话清空画板、刷新后从历史恢复图形、PNG 导出提示、390px 窄屏对话和画板切换。
5. 服务端无密钥时返回明确的 400 错误，不泄露配置。
6. 服务端新增 `HOST` 环境变量支持，默认值保持 127.0.0.1。

限制：

1. GeoGebra 首次加载依赖官方 CDN 网络。
2. 本地规则只覆盖常见基础题型，复杂题意和图片题需要 AI。
3. 未实现参考站的完整 TikZ 精简与校验逻辑，当前提供 GGB、PNG、命令复制。
4. 没有账号系统和跨设备同步，历史记录仅保存在当前浏览器。
5. 图片不会进入历史记录，历史恢复只恢复图形命令。
6. 服务端 JSON 请求体上限为 12MB，图片过多或过大时会被拒绝。
7. 公网部署若需要用户隔离或调用额度控制，需要额外增加认证与限流组件。

## 10. 类似项目参考
1.  `https://geogebra-webchat.348349.xyz/` 。