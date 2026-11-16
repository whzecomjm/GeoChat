import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import {
  Check,
  Copy,
  Download,
  ImageDown,
  LoaderCircle,
  RotateCcw,
  Upload,
} from "lucide-react";
import type { CanvasView } from "../types";
import type { GeoGebraAPI } from "../types/geogebra";
import {
  executeGeoGebraCommands,
  loadGeoGebraScript,
} from "../lib/geogebra";

export interface GeoBoardHandle {
  execute: (commands: string[], resetBefore?: boolean, view?: CanvasView) => void;
  reset: (notify?: boolean) => void;
}

interface GeoBoardProps {
  commands: string[];
  onReadyChange: (ready: boolean) => void;
  onToast: (message: string) => void;
}

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function base64Blob(base64: string, type: string): Blob {
  const clean = base64.replace(/^data:[^;]+;base64,/, "");
  const binary = atob(clean);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new Blob([bytes], { type });
}

const GeoBoard = forwardRef<GeoBoardHandle, GeoBoardProps>(function GeoBoard(
  { commands, onReadyChange, onToast },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const apiRef = useRef<GeoGebraAPI | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let appletReady = false;
    let readyTimer = 0;
    setReady(false);
    setError("");
    onReadyChange(false);
    const container = containerRef.current;
    if (!container) return;

    loadGeoGebraScript()
      .then(() => {
        if (cancelled || !window.GGBApplet || !containerRef.current) return;
        const width = Math.max(containerRef.current.clientWidth, 320);
        const height = Math.max(containerRef.current.clientHeight, 420);
        const applet = new window.GGBApplet(
          {
            appName: "classic",
            width,
            height,
            showToolBar: false,
            showMenuBar: false,
            showAlgebraInput: true,
            enableShiftDragZoom: true,
            enableRightClick: true,
            showResetIcon: true,
            showZoomButtons: true,
            allowStyleBar: true,
            preventFocus: true,
            appletOnLoad: (api: GeoGebraAPI) => {
              if (cancelled) return;
              appletReady = true;
              window.clearTimeout(readyTimer);
              apiRef.current = api || applet.getAppletObject();
              if (containerRef.current && containerRef.current.clientWidth < 620) {
                try {
                  apiRef.current.evalCommand('SetPerspective("G")');
                } catch {
                  // The graphics view remains available even if perspective switching fails.
                }
              }
              setError("");
              setReady(true);
              onReadyChange(true);
            },
          },
          true,
        );
        applet.inject(containerRef.current);
        readyTimer = window.setTimeout(() => {
          if (!cancelled && !appletReady) {
            setError("GeoGebra 初始化超时，请检查网络连接后重新加载。");
          }
        }, 45_000);
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "画板加载失败。");
      });

    return () => {
      cancelled = true;
      window.clearTimeout(readyTimer);
      apiRef.current = null;
      onReadyChange(false);
      if (container) container.innerHTML = "";
    };
  }, [attempt, onReadyChange]);

  useEffect(() => {
    if (!ready || !containerRef.current || !apiRef.current) return;
    const api = apiRef.current;
    let frame = 0;
    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      if (width < 100 || height < 100) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        try {
          api.setSize(Math.round(width), Math.round(height));
        } catch {
          // Some GeoGebra versions resize through the injected container instead.
        }
      });
    });
    observer.observe(containerRef.current);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [ready]);

  useImperativeHandle(ref, () => ({
    execute(commandsToRun, resetBefore = true, view) {
      if (!apiRef.current) throw new Error("GeoGebra 画板尚未就绪。");
      executeGeoGebraCommands(apiRef.current, commandsToRun, resetBefore, view);
    },
    reset(notify = true) {
      if (!apiRef.current) return;
      apiRef.current.reset();
      apiRef.current.setCoordSystem(-8, 8, -6, 6);
      if (notify) onToast("画板已清空");
    },
  }));

  async function copyCommands() {
    if (!commands.length) {
      onToast("当前画板还没有可复制的命令");
      return;
    }
    try {
      await navigator.clipboard.writeText(commands.join("\n"));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      onToast("复制失败，请检查浏览器剪贴板权限");
    }
  }

  function exportGGB() {
    if (!apiRef.current) return;
    try {
      saveBlob(base64Blob(apiRef.current.getBase64(), "application/vnd.geogebra.file"), "geochat.ggb");
      onToast("已导出 GeoGebra 文件");
    } catch {
      onToast("当前 GeoGebra 版本暂不支持 GGB 导出");
    }
  }

  function exportPNG() {
    if (!apiRef.current) return;
    try {
      saveBlob(base64Blob(apiRef.current.getPNGBase64(2, false, 144), "image/png"), "geochat.png");
      onToast("已导出 PNG 图片");
    } catch {
      onToast("当前 GeoGebra 版本暂不支持 PNG 导出");
    }
  }

  function openGGB(file: File | undefined) {
    if (!file || !apiRef.current) return;
    if (!file.name.toLowerCase().endsWith(".ggb")) {
      onToast("请选择 .ggb 文件");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      try {
        apiRef.current?.setBase64(String(reader.result).split(",")[1]);
        onToast(`已打开 ${file.name}`);
      } catch {
        onToast("无法打开这个 GGB 文件");
      }
    };
    reader.readAsDataURL(file);
  }

  return (
    <section className="board-panel" aria-label="GeoGebra 画板区域">
      <div className="panel-heading board-heading">
        <div>
          <div className="eyebrow">DYNAMIC WORKSPACE</div>
          <h2>GeoGebra 画板</h2>
        </div>
        <span className={`board-status ${ready ? "is-ready" : ""}`}>
          <span className="status-dot" />
          {ready ? "已就绪" : error ? "加载失败" : "加载中"}
        </span>
      </div>

      <div className="board-toolbar" aria-label="画板工具">
        <button type="button" onClick={() => ref && "current" in ref && ref.current?.reset()} disabled={!ready} title="清空画板">
          <RotateCcw size={15} />
          <span>清空</span>
        </button>
        <span className="toolbar-divider" />
        <button type="button" onClick={copyCommands} disabled={!ready} title="复制当前 GeoGebra 命令">
          {copied ? <Check size={15} /> : <Copy size={15} />}
          <span>{copied ? "已复制" : "命令"}</span>
        </button>
        <button type="button" onClick={exportGGB} disabled={!ready} title="导出 .ggb 文件">
          <Download size={15} />
          <span>GGB</span>
        </button>
        <button type="button" onClick={exportPNG} disabled={!ready} title="导出 PNG 图片">
          <ImageDown size={15} />
          <span>PNG</span>
        </button>
        <button type="button" onClick={() => fileRef.current?.click()} disabled={!ready} title="打开本地 .ggb 文件">
          <Upload size={15} />
          <span>打开</span>
        </button>
        <input
          ref={fileRef}
          className="visually-hidden"
          type="file"
          accept=".ggb"
          onChange={(event) => {
            openGGB(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
      </div>

      <div className="ggb-stage">
        <div ref={containerRef} className="ggb-container" />
        {!ready && !error && (
          <div className="board-overlay" role="status">
            <LoaderCircle className="spin" size={28} />
            <strong>正在启动动态画板</strong>
            <span>首次加载需要连接 GeoGebra 官方服务</span>
          </div>
        )}
        {error && (
          <div className="board-overlay board-error" role="alert">
            <strong>画板暂时不可用</strong>
            <p>{error}</p>
            <button type="button" className="primary-button" onClick={() => setAttempt((value) => value + 1)}>
              重新加载
            </button>
          </div>
        )}
      </div>
      <div className="board-footer">
        <span>拖动空白处平移</span>
        <span>滚轮缩放</span>
        <span>拖动自由点联动</span>
      </div>
    </section>
  );
});

export default GeoBoard;
