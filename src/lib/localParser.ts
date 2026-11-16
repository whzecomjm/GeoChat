import type { CanvasView, GenerateResult } from "../types";

const NUMBER = "-?\\d+(?:\\.\\d+)?";

function normalize(input: string): string {
  return input
    .replace(/[＝]/g, "=")
    .replace(/[（]/g, "(")
    .replace(/[）]/g, ")")
    .replace(/[，]/g, ",")
    .replace(/[；]/g, ";")
    .replace(/[²]/g, "^2")
    .replace(/[³]/g, "^3")
    .replace(/[π]/g, "pi")
    .replace(/[×]/g, "*")
    .replace(/[−–]/g, "-")
    .trim();
}

function num(value: number): string {
  return String(Number(value.toFixed(5)));
}

function point(name: string, x: number, y: number): string {
  return `${name}=(${num(x)},${num(y)})`;
}

function namedPoints(input: string) {
  const points = new Map<string, { x: number; y: number }>();
  const pattern = new RegExp(
    `([A-Z])\\s*=?\\s*\\(\\s*(${NUMBER})\\s*,\\s*(${NUMBER})\\s*\\)`,
    "g",
  );
  for (const match of input.matchAll(pattern)) {
    points.set(match[1], { x: Number(match[2]), y: Number(match[3]) });
  }
  return points;
}

function coordinatePairs(input: string) {
  const pattern = new RegExp(`\\(\\s*(${NUMBER})\\s*,\\s*(${NUMBER})\\s*\\)`, "g");
  return Array.from(input.matchAll(pattern), (match) => ({
    x: Number(match[1]),
    y: Number(match[2]),
  }));
}

function paddedView(points: { x: number; y: number }[], minimum = 2): CanvasView {
  const xs = points.map((item) => item.x);
  const ys = points.map((item) => item.y);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const yMin = Math.min(...ys);
  const yMax = Math.max(...ys);
  const margin = Math.max(minimum, (xMax - xMin) * 0.25, (yMax - yMin) * 0.25);
  return {
    xMin: xMin - margin,
    xMax: xMax + margin,
    yMin: yMin - margin,
    yMax: yMax + margin,
  };
}

function parseQuadratic(expression: string) {
  const compact = expression.replace(/\s+/g, "").replace(/-/g, "+-");
  let a = 0;
  let b = 0;
  let c = 0;
  for (const term of compact.split("+").filter(Boolean)) {
    const quadratic = term.match(/^([+-]?(?:\d+\.?\d*|\.\d+)?)\*?x\^2$/i);
    const linear = term.match(/^([+-]?(?:\d+\.?\d*|\.\d+)?)\*?x$/i);
    if (quadratic) {
      const raw = quadratic[1];
      a += raw === "" || raw === "+" ? 1 : raw === "-" ? -1 : Number(raw);
    } else if (linear) {
      const raw = linear[1];
      b += raw === "" || raw === "+" ? 1 : raw === "-" ? -1 : Number(raw);
    } else if (/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(term)) {
      c += Number(term);
    } else {
      return null;
    }
  }
  return Math.abs(a) > 1e-9 ? { a, b, c } : null;
}

function parseFunction(input: string): GenerateResult | null {
  const expressionMatch = input.match(/(?:^|[\s,])(?:y|f\(x\))\s*=\s*([^,;.]+)/i);
  const functionHint = /函数|图像|曲线|抛物线|正弦|余弦|正切/.test(input);
  if (!expressionMatch && !functionHint) return null;

  let expression = expressionMatch?.[1]?.trim() ?? "";
  expression = expression.split(/\s+(?:并|且|然后|标出|显示|的)/)[0].trim();
  if (!expression && /抛物线/.test(input)) expression = "x^2";
  if (!expression && /正弦/.test(input)) expression = "sin(x)";
  if (!expression && /余弦/.test(input)) expression = "cos(x)";
  if (!expression && /正切/.test(input)) expression = "tan(x)";
  if (!expression) return null;

  const identifiers = expression.match(/[A-Za-z]+/g) ?? [];
  const allowed = new Set(["x", "sin", "cos", "tan", "log", "ln", "sqrt", "abs", "exp", "pi", "e"]);
  if (
    !/^[0-9A-Za-z+\-*/^().\s]+$/.test(expression) ||
    identifiers.some((item) => !allowed.has(item.toLowerCase()))
  ) {
    throw new Error("本地模式无法识别这个函数表达式，请使用 y=x^2、y=sin(x) 这类写法，或切换到 AI 模式。");
  }

  const commands = [`f(x)=${expression}`, 'SetColor(f,"#5B5BD6")', "SetLineThickness(f,4)"];
  const quadratic = parseQuadratic(expression);
  let view: CanvasView = { xMin: -7, xMax: 7, yMin: -6, yMax: 6 };
  const details = [`已绘制函数 f(x) = ${expression}。`];

  if (quadratic) {
    const { a, b, c } = quadratic;
    const h = -b / (2 * a);
    const k = a * h * h + b * h + c;
    commands.push(point("V", h, k), 'SetColor(V,"#E24A4A")', "SetPointStyle(V,2)");
    commands.push(`axis=Line(V,(${num(h)},${num(k + 1)}))`, "SetLineStyle(axis,1)", 'SetColor(axis,"#9A6A32")');
    details.push(`顶点为 V(${num(h)}, ${num(k)})，虚线为抛物线的对称轴。`);
    const verticalExtent = Math.max(8, Math.abs(a) * 16);
    view = {
      xMin: h - 5,
      xMax: h + 5,
      yMin: a > 0 ? k - 2 : k - verticalExtent,
      yMax: a > 0 ? k + verticalExtent : k + 2,
    };
    if (/焦点|准线/.test(input)) {
      const focal = 1 / (4 * a);
      commands.push(point("F", h, k + focal), 'SetColor(F,"#16866B")');
      commands.push(
        `directrix=Line((${num(h - 1)},${num(k - focal)}),(${num(h + 1)},${num(k - focal)}))`,
        "SetLineStyle(directrix,1)",
        'SetColor(directrix,"#16866B")',
      );
      details.push(`焦点为 F(${num(h)}, ${num(k + focal)})，水平虚线为准线。`);
    }
  } else if (/sin|cos|tan/.test(expression)) {
    view = { xMin: -7, xMax: 7, yMin: -2.5, yMax: 2.5 };
  }

  commands.push("ShowLabel(axis,false)");
  return {
    explanation: `${details.join("\n")}\n可以拖动坐标系、滚轮缩放，或在左侧代数区修改函数。`,
    commands: commands.filter((command) => !command.includes("axis") || quadratic),
    resetBefore: true,
    source: "local",
    view,
  };
}

function parseTriangle(input: string): GenerateResult | null {
  if (!/三角形|三顶点|重心|垂心|内心|外心|内切圆|外接圆/.test(input)) return null;
  const found = namedPoints(input);
  const fallback = [
    { name: "A", x: 0, y: 0 },
    { name: "B", x: 6, y: 0 },
    { name: "C", x: 2, y: 4 },
  ];
  const points = ["A", "B", "C"].map((name, index) => ({
    name,
    ...(found.get(name) ?? fallback[index]),
  }));
  const commands = points.map((item) => point(item.name, item.x, item.y));
  commands.push("t=Polygon(A,B,C)", 'SetColor(t,"#5B5BD6")', "SetFilling(t,0.12)");
  const details = ["已根据三个顶点构造三角形 ABC。"];

  const needsMidpoints = /中线|重心/.test(input);
  if (needsMidpoints) {
    commands.push("M1=Midpoint(B,C)", "M2=Midpoint(A,C)", "M3=Midpoint(A,B)");
  }
  if (/中线/.test(input)) {
    commands.push(
      "m1=Segment(A,M1)",
      "m2=Segment(B,M2)",
      "m3=Segment(C,M3)",
      "SetLineStyle(m1,1)",
      "SetLineStyle(m2,1)",
      "SetLineStyle(m3,1)",
      'SetColor(m1,"#E28B38")',
      'SetColor(m2,"#E28B38")',
      'SetColor(m3,"#E28B38")',
    );
    details.push("三条中线已用虚线标出，M1、M2、M3 为对应边的中点。");
  }
  const needsHeights = /高线|三条高|垂心/.test(input);
  if (needsHeights) {
    commands.push(
      "h1=PerpendicularLine(A,Line(B,C))",
      "h2=PerpendicularLine(B,Line(A,C))",
      "h3=PerpendicularLine(C,Line(A,B))",
      "SetLineStyle(h1,1)",
      "SetLineStyle(h2,1)",
      "SetLineStyle(h3,1)",
    );
  }
  if (/高线|三条高/.test(input)) {
    details.push("三条高所在直线已添加到画板。");
  }
  if (/重心/.test(input)) {
    commands.push("G=Intersect(Segment(A,M1),Segment(B,M2))", 'SetColor(G,"#E24A4A")');
    details.push("G 为三条中线的交点，即三角形的重心。");
  }
  if (/垂心/.test(input)) {
    commands.push("H=Intersect(h1,h2)", 'SetColor(H,"#E24A4A")');
    details.push("H 为两条高线的交点，即三角形的垂心。");
  }
  if (/外心|外接圆/.test(input)) {
    commands.push(
      "O=Intersect(PerpendicularBisector(A,B),PerpendicularBisector(B,C))",
      "co=Circle(O,A)",
      'SetColor(O,"#16866B")',
      'SetColor(co,"#16866B")',
    );
    details.push("O 为两条中垂线的交点，绿色圆为三角形的外接圆。");
  }
  if (/内心|内切圆/.test(input)) {
    commands.push("ic=Incircle(A,B,C)", "I=Center(ic)", 'SetColor(I,"#A456C7")', 'SetColor(ic,"#A456C7")');
    details.push("I 为内心，紫色圆为三角形的内切圆。");
  }

  return {
    explanation: `${details.join("\n")}\n顶点保持可拖动，相关中线、圆心和圆会随顶点联动。`,
    commands,
    resetBefore: true,
    source: "local",
    view: paddedView(points),
  };
}

function chineseNumber(value: string): number {
  const map: Record<string, number> = {
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
    十: 10,
  };
  return map[value] ?? Number(value);
}

function parseRegularPolygon(input: string): GenerateResult | null {
  const match = input.match(/正([三四五六七八九十]|\d{1,2})边形/);
  if (!match) return null;
  const sides = chineseNumber(match[1]);
  if (!Number.isInteger(sides) || sides < 3 || sides > 12) {
    throw new Error("本地模式支持正三边形到正十二边形。");
  }
  const radiusMatch = input.match(new RegExp(`半径\\s*(?:为|=|:)?\\s*(${NUMBER})`));
  const radius = Math.abs(Number(radiusMatch?.[1] ?? 3)) || 3;
  const vertices = Array.from({ length: sides }, (_, index) => {
    const angle = Math.PI / 2 + (index * Math.PI * 2) / sides;
    return { x: radius * Math.cos(angle), y: radius * Math.sin(angle) };
  });
  const commands = vertices.map((item, index) => point(`P${index + 1}`, item.x, item.y));
  commands.push(
    `p=Polygon(${vertices.map((_, index) => `P${index + 1}`).join(",")})`,
    'SetColor(p,"#5B5BD6")',
    "SetFilling(p,0.12)",
  );
  if (/外接圆/.test(input)) commands.push("O=(0,0)", "c=Circle(O,P1)", 'SetColor(c,"#16866B")');
  return {
    explanation: `已构造中心在原点、外接圆半径为 ${num(radius)} 的正${sides}边形。\n各顶点按圆周等角分布，可继续修改顶点或添加对角线。`,
    commands,
    resetBefore: true,
    source: "local",
    view: { xMin: -radius - 1, xMax: radius + 1, yMin: -radius - 1, yMax: radius + 1 },
  };
}

function parseCircle(input: string): GenerateResult | null {
  if (!/圆/.test(input)) return null;
  const radiusMatch = input.match(new RegExp(`半径\\s*(?:为|=|:)?\\s*(${NUMBER})`));
  const radius = Math.abs(Number(radiusMatch?.[1] ?? (/单位圆/.test(input) ? 1 : 3))) || 3;
  const found = namedPoints(input).get("O");
  const centerHint = input.match(new RegExp(`圆心[^()]*\\(\\s*(${NUMBER})\\s*,\\s*(${NUMBER})\\s*\\)`));
  const center = found ?? (centerHint ? { x: Number(centerHint[1]), y: Number(centerHint[2]) } : { x: 0, y: 0 });
  const commands = [
    point("O", center.x, center.y),
    `c=Circle(O,${num(radius)})`,
    'SetColor(c,"#5B5BD6")',
    "SetLineThickness(c,4)",
  ];
  const details = [`已构造圆心 O(${num(center.x)}, ${num(center.y)})、半径 ${num(radius)} 的圆。`];
  if (/直径/.test(input)) {
    commands.push(point("A", center.x - radius, center.y), point("B", center.x + radius, center.y), "d=Segment(A,B)", 'SetColor(d,"#E24A4A")');
    details.push("红色线段 AB 为圆的一条直径。");
  }
  return {
    explanation: details.join("\n"),
    commands,
    resetBefore: true,
    source: "local",
    view: paddedView([
      { x: center.x - radius, y: center.y - radius },
      { x: center.x + radius, y: center.y + radius },
    ]),
  };
}

function parseVector(input: string): GenerateResult | null {
  if (!/向量/.test(input)) return null;
  const pairs = coordinatePairs(input);
  const [start, end] = pairs.length >= 2 ? pairs : [{ x: 0, y: 0 }, { x: 3, y: 2 }];
  return {
    explanation: `已绘制从 A(${num(start.x)}, ${num(start.y)}) 指向 B(${num(end.x)}, ${num(end.y)}) 的向量。\n拖动 B 点可以观察向量方向和长度的变化。`,
    commands: [point("A", start.x, start.y), point("B", end.x, end.y), "v=Vector(A,B)", 'SetColor(v,"#5B5BD6")', "SetLineThickness(v,4)"],
    resetBefore: true,
    source: "local",
    view: paddedView([start, end]),
  };
}

function parseEllipse(input: string): GenerateResult | null {
  if (!/椭圆/.test(input)) return null;
  return {
    explanation: "已构造焦点为 F1(-3, 0)、F2(3, 0)，长半轴为 5 的椭圆。\n可拖动焦点，观察椭圆形状随焦距变化。",
    commands: ["F1=(-3,0)", "F2=(3,0)", "e=Ellipse(F1,F2,5)", 'SetColor(e,"#5B5BD6")', "SetLineThickness(e,4)"],
    resetBefore: true,
    source: "local",
    view: { xMin: -7, xMax: 7, yMin: -5, yMax: 5 },
  };
}

function parseLine(input: string): GenerateResult | null {
  if (!/直线/.test(input)) return null;
  const sumForm = input.match(/x\s*([+-])\s*y\s*=\s*(-?\d+(?:\.\d+)?)/i);
  if (sumForm) {
    const sign = sumForm[1] === "+" ? -1 : 1;
    const intercept = Number(sumForm[2]);
    return {
      explanation: `已将直线方程改写为 y=${sign === -1 ? "-" : ""}x+${num(intercept)} 并绘制。`,
      commands: [`f(x)=${sign}*x+${num(intercept)}`, 'SetColor(f,"#5B5BD6")', "SetLineThickness(f,4)"],
      resetBefore: true,
      source: "local",
      view: { xMin: -7, xMax: 7, yMin: -7, yMax: 7 },
    };
  }
  const pairs = coordinatePairs(input);
  if (pairs.length < 2) {
    throw new Error("请给出直线经过的两个点，例如：画过 (0,1) 和 (3,4) 的直线。");
  }
  return {
    explanation: `已绘制经过 A、B 两点的直线。\n拖动任一点，直线会实时更新。`,
    commands: [point("A", pairs[0].x, pairs[0].y), point("B", pairs[1].x, pairs[1].y), "l=Line(A,B)", 'SetColor(l,"#5B5BD6")', "SetLineThickness(l,4)"],
    resetBefore: true,
    source: "local",
    view: paddedView(pairs.slice(0, 2)),
  };
}

export function parseLocal(rawInput: string): GenerateResult {
  const input = normalize(rawInput);
  if (!input) throw new Error("请输入一个数学或几何需求。");
  const result =
    parseRegularPolygon(input) ??
    parseTriangle(input) ??
    parseFunction(input) ??
    parseVector(input) ??
    parseEllipse(input) ??
    parseCircle(input) ??
    parseLine(input);
  if (!result) {
    throw new Error("本地模式暂时无法理解这个需求。可尝试函数、三角形、圆、正多边形、向量或椭圆，也可以切换到 AI 模式处理更复杂的题目。");
  }
  return result;
}
