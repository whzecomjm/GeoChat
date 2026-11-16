import type { CanvasView } from "../types";
import type { GeoGebraAPI } from "../types/geogebra";

const SCRIPT_URL = "https://www.geogebra.org/apps/deployggb.js";
let scriptPromise: Promise<void> | null = null;

const COMMAND_FUNCTIONS = new Set([
  "Segment",
  "Line",
  "Ray",
  "Polygon",
  "Circle",
  "Semicircle",
  "CircularArc",
  "CircularSector",
  "Intersect",
  "Midpoint",
  "Center",
  "Point",
  "Vector",
  "Distance",
  "Area",
  "Angle",
  "AngleBisector",
  "PerpendicularLine",
  "ParallelLine",
  "PerpendicularBisector",
  "TriangleCenter",
  "Incircle",
  "Ellipse",
  "Hyperbola",
  "Parabola",
  "Conic",
  "Rotate",
  "Reflect",
  "Translate",
  "Dilate",
  "SetColor",
  "SetLineStyle",
  "SetLineThickness",
  "SetFilling",
  "SetLabelMode",
  "SetPointStyle",
  "SetPointSize",
  "SetCaption",
  "ShowLabel",
  "SetVisibleInView",
  "SetPerspective",
  "SetCoords",
  "SetActiveView",
  "ZoomIn",
  "ZoomOut",
  "CenterView",
]);

export function validateCommands(input: unknown): string[] {
  if (!Array.isArray(input) || input.length > 100) {
    throw new Error("作图命令必须是长度不超过 100 的数组。");
  }
  return input.map((raw, index) => {
    if (typeof raw !== "string") throw new Error(`第 ${index + 1} 条命令不是字符串。`);
    const command = raw.trim();
    if (!command || command.length > 400 || /[\r\n;<>]/.test(command)) {
      throw new Error(`第 ${index + 1} 条命令格式不安全或长度异常。`);
    }
    const assignment = /^[A-Za-z][A-Za-z0-9_]{0,31}(?:\([a-z]\))?\s*=\s*.+$/.test(command);
    const call = command.match(/^([A-Za-z][A-Za-z0-9_]*)\s*\(.*\)$/);
    if (!assignment && (!call || !COMMAND_FUNCTIONS.has(call[1]))) {
      throw new Error(`第 ${index + 1} 条命令不在允许的 GeoGebra 命令范围内：${command}`);
    }
    return command;
  });
}

export function loadGeoGebraScript(): Promise<void> {
  if (window.GGBApplet) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT_URL;
    script.async = true;
    script.dataset.geogebraLoader = "true";
    script.onload = () => {
      if (window.GGBApplet) resolve();
      else reject(new Error("GeoGebra 脚本已加载，但未找到 GGBApplet。"));
    };
    script.onerror = () => reject(new Error("无法加载 GeoGebra 官方脚本，请检查网络后重试。"));
    document.head.appendChild(script);
  });
  scriptPromise.catch(() => {
    scriptPromise = null;
    document.querySelector("script[data-geogebra-loader]")?.remove();
  });
  return scriptPromise;
}

export function executeGeoGebraCommands(
  api: GeoGebraAPI,
  input: unknown,
  resetBefore = true,
  view?: CanvasView,
): string[] {
  const commands = validateCommands(input);
  let snapshot = "";
  try {
    snapshot = api.getBase64();
  } catch {
    snapshot = "";
  }
  if (resetBefore) api.reset();
  const failures: string[] = [];
  for (const command of commands) {
    let succeeded = false;
    try {
      succeeded = api.evalCommand(command);
    } catch {
      succeeded = false;
    }
    const isStyleCommand = /^(Set|Show|Zoom|Center|CenterView)/.test(command);
    if (!succeeded && !isStyleCommand) failures.push(command);
  }
  if (failures.length) {
    try {
      if (snapshot) api.setBase64(snapshot);
      else api.reset();
    } catch {
      api.reset();
    }
    throw new Error(`GeoGebra 未接受 ${failures.length} 条命令，已恢复到作图前状态：${failures.slice(0, 2).join("、")}`);
  }
  if (view) {
    const values = [view.xMin, view.xMax, view.yMin, view.yMax];
    if (values.every(Number.isFinite) && view.xMin < view.xMax && view.yMin < view.yMax) {
      api.setCoordSystem(view.xMin, view.xMax, view.yMin, view.yMax);
    }
  }
  return commands;
}
