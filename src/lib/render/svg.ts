/**
 * Dibujo en SVG de los graficos de Writing Task 1 y los mapas de Listening.
 * La IA solo entrega datos; el codigo dibuja, asi nunca hay un numero o rotulo
 * equivocado dentro de una imagen. Fondo blanco, como en el examen.
 */

export interface ChartData {
  kind: "line" | "bar" | "pie" | "table";
  title: string;
  unit: string;
  categories: string[];
  series: { name: string; values: number[] }[];
}

export interface MapData {
  title: string;
  places: { key: string | null; name: string | null; x: number; y: number; w: number; h: number }[];
  paths: { x1: number; y1: number; x2: number; y2: number }[];
  entrance: { x: number; y: number; label: string } | null;
}

const PALETTE = ["#1f6feb", "#e8590c", "#2f9e44", "#ae3ec9", "#f59f00"];
const INK = "#1f2328";
const MUTED = "#6e7781";
const FONT = "font-family=\"Arial, Helvetica, sans-serif\"";

export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function fmt(n: number): string {
  return Number.isInteger(n) ? n.toLocaleString("en-GB") : n.toLocaleString("en-GB", { maximumFractionDigits: 2 });
}

/** Escala "bonita" para el eje Y. */
export function niceScale(min: number, max: number, ticks = 5): { lo: number; hi: number; step: number } {
  const lo0 = Math.min(0, min);
  const span = Math.max(max - lo0, 1e-9);
  const raw = span / ticks;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
  return { lo: Math.floor(lo0 / step) * step, hi: Math.ceil(max / step) * step || step, step };
}

function frame(width: number, height: number, body: string, title: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(title)}" ${FONT}><rect width="${width}" height="${height}" fill="#ffffff"/><text x="${width / 2}" y="26" text-anchor="middle" font-size="15" font-weight="bold" fill="${INK}">${esc(title)}</text>${body}</svg>`;
}

function legend(names: string[], x: number, y: number): string {
  return names
    .map((n, i) => `<rect x="${x}" y="${y + i * 20}" width="12" height="12" fill="${PALETTE[i % PALETTE.length]}"/><text x="${x + 18}" y="${y + i * 20 + 10}" font-size="12" fill="${INK}">${esc(n)}</text>`)
    .join("");
}

function axes(c: ChartData, plot: { x: number; y: number; w: number; h: number }, values: number[]) {
  const { lo, hi, step } = niceScale(Math.min(...values), Math.max(...values));
  const yOf = (v: number) => plot.y + plot.h - ((v - lo) / (hi - lo)) * plot.h;
  let s = "";
  for (let v = lo; v <= hi + step / 2; v += step) {
    const y = yOf(v);
    s += `<line x1="${plot.x}" y1="${y}" x2="${plot.x + plot.w}" y2="${y}" stroke="#d0d7de" stroke-width="1"/>`;
    s += `<text x="${plot.x - 8}" y="${y + 4}" text-anchor="end" font-size="11" fill="${MUTED}">${fmt(Number(v.toFixed(6)))}</text>`;
  }
  s += `<line x1="${plot.x}" y1="${plot.y}" x2="${plot.x}" y2="${plot.y + plot.h}" stroke="${INK}"/>`;
  s += `<line x1="${plot.x}" y1="${yOf(Math.max(lo, 0))}" x2="${plot.x + plot.w}" y2="${yOf(Math.max(lo, 0))}" stroke="${INK}"/>`;
  s += `<text x="16" y="${plot.y + plot.h / 2}" font-size="12" fill="${MUTED}" transform="rotate(-90 16 ${plot.y + plot.h / 2})" text-anchor="middle">${esc(c.unit)}</text>`;
  return { s, yOf };
}

export function renderChartSvg(c: ChartData): string {
  const W = 680;
  const H = 420;
  if (c.kind === "table") return renderTable(c);
  if (c.kind === "pie") return renderPies(c, W);

  const legendW = 150;
  const plot = { x: 70, y: 50, w: W - 70 - legendW - 20, h: H - 50 - 70 };
  const values = c.series.flatMap((s) => s.values);
  const { s: axis, yOf } = axes(c, plot, values);
  let body = axis;
  const n = c.categories.length;
  const slot = plot.w / n;
  c.categories.forEach((cat, i) => {
    const x = plot.x + slot * (i + 0.5);
    body += `<text x="${x}" y="${plot.y + plot.h + 18}" text-anchor="middle" font-size="11" fill="${INK}">${esc(cat)}</text>`;
  });

  if (c.kind === "line") {
    c.series.forEach((s, si) => {
      const color = PALETTE[si % PALETTE.length];
      const pts = s.values.map((v, i) => `${plot.x + slot * (i + 0.5)},${yOf(v)}`);
      body += `<polyline points="${pts.join(" ")}" fill="none" stroke="${color}" stroke-width="2.5"/>`;
      body += s.values.map((v, i) => `<circle cx="${plot.x + slot * (i + 0.5)}" cy="${yOf(v)}" r="3.5" fill="${color}"/>`).join("");
    });
  } else {
    const groupW = slot * 0.75;
    const barW = groupW / c.series.length;
    c.series.forEach((s, si) => {
      const color = PALETTE[si % PALETTE.length];
      s.values.forEach((v, i) => {
        const x = plot.x + slot * i + (slot - groupW) / 2 + barW * si;
        const y0 = yOf(0);
        const y = yOf(v);
        body += `<rect x="${x}" y="${Math.min(y, y0)}" width="${Math.max(barW - 2, 1)}" height="${Math.abs(y0 - y)}" fill="${color}"/>`;
      });
    });
  }
  body += legend(
    c.series.map((s) => s.name),
    W - legendW,
    plot.y + 10,
  );
  return frame(W, H, body, c.title);
}

function renderPies(c: ChartData, W: number): string {
  const count = c.series.length;
  const r = count === 1 ? 120 : count === 2 ? 105 : 80;
  const H = 120 + r * 2 + 20 * Math.ceil(c.categories.length / 3) + 20;
  let body = "";
  const cy = 70 + r;
  c.series.forEach((s, si) => {
    const cx = (W / (count + 1)) * (si + 1);
    const total = s.values.reduce((a, b) => a + b, 0) || 1;
    let angle = -Math.PI / 2;
    s.values.forEach((v, i) => {
      const frac = v / total;
      const a2 = angle + frac * Math.PI * 2;
      const large = frac > 0.5 ? 1 : 0;
      const [x1, y1, x2, y2] = [cx + r * Math.cos(angle), cy + r * Math.sin(angle), cx + r * Math.cos(a2), cy + r * Math.sin(a2)];
      const color = PALETTE[i % PALETTE.length];
      body +=
        frac >= 0.999
          ? `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}"/>`
          : `<path d="M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${large} 1 ${x2},${y2} Z" fill="${color}" stroke="#fff" stroke-width="1.5"/>`;
      if (frac > 0.04) {
        const mid = (angle + a2) / 2;
        body += `<text x="${cx + r * 0.62 * Math.cos(mid)}" y="${cy + r * 0.62 * Math.sin(mid) + 4}" text-anchor="middle" font-size="12" font-weight="bold" fill="#fff">${fmt(v)}${c.unit.includes("%") ? "%" : ""}</text>`;
      }
      angle = a2;
    });
    body += `<text x="${cx}" y="${cy + r + 22}" text-anchor="middle" font-size="13" font-weight="bold" fill="${INK}">${esc(s.name)}</text>`;
  });
  const extraColors = c.categories.length > PALETTE.length;
  c.categories.forEach((cat, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const x = 40 + col * ((W - 80) / 3);
    const y = cy + r + 44 + row * 20;
    body += `<rect x="${x}" y="${y}" width="12" height="12" fill="${PALETTE[i % PALETTE.length]}"${extraColors && i >= PALETTE.length ? ' fill-opacity="0.55"' : ""}/><text x="${x + 18}" y="${y + 10}" font-size="12" fill="${INK}">${esc(cat)}</text>`;
  });
  return frame(W, H, body, c.title);
}

function renderTable(c: ChartData): string {
  const colW = 130;
  const firstW = 190;
  const rowH = 30;
  const W = firstW + colW * c.series.length + 20;
  const H = 60 + rowH * (c.categories.length + 1) + 30;
  let body = "";
  const x0 = 10;
  const y0 = 50;
  body += `<rect x="${x0}" y="${y0}" width="${W - 20}" height="${rowH}" fill="#eaeef2"/>`;
  c.series.forEach((s, i) => {
    body += `<text x="${x0 + firstW + colW * i + colW / 2}" y="${y0 + 20}" text-anchor="middle" font-size="12" font-weight="bold" fill="${INK}">${esc(s.name)}</text>`;
  });
  c.categories.forEach((cat, r) => {
    const y = y0 + rowH * (r + 1);
    body += `<line x1="${x0}" y1="${y}" x2="${W - 10}" y2="${y}" stroke="#d0d7de"/>`;
    body += `<text x="${x0 + 8}" y="${y + 20}" font-size="12" fill="${INK}">${esc(cat)}</text>`;
    c.series.forEach((s, i) => {
      body += `<text x="${x0 + firstW + colW * i + colW / 2}" y="${y + 20}" text-anchor="middle" font-size="12" fill="${INK}">${fmt(s.values[r] ?? 0)}</text>`;
    });
  });
  const yEnd = y0 + rowH * (c.categories.length + 1);
  body += `<rect x="${x0}" y="${y0}" width="${W - 20}" height="${yEnd - y0}" fill="none" stroke="${INK}"/>`;
  body += `<text x="${x0}" y="${yEnd + 20}" font-size="11" fill="${MUTED}">Unit: ${esc(c.unit)}</text>`;
  return frame(W, H, body, c.title);
}

export function renderMapSvg(m: MapData): string {
  const cell = 52;
  const ox = 30;
  const oy = 50;
  const W = ox * 2 + cell * 12;
  const H = oy + cell * 8 + 30;
  const X = (x: number) => ox + x * cell;
  const Y = (y: number) => oy + y * cell;
  let body = `<rect x="${ox}" y="${oy}" width="${cell * 12}" height="${cell * 8}" fill="#f6f8fa" stroke="${INK}" stroke-width="1.5"/>`;
  for (const p of m.paths)
    body += `<line x1="${X(p.x1)}" y1="${Y(p.y1)}" x2="${X(p.x2)}" y2="${Y(p.y2)}" stroke="#c9ced6" stroke-width="16" stroke-linecap="round"/>`;
  for (const pl of m.places) {
    const [x, y, w, h] = [X(pl.x) + 3, Y(pl.y) + 3, pl.w * cell - 6, pl.h * cell - 6];
    if (pl.key) {
      body += `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="4" fill="#ffffff" stroke="${INK}" stroke-width="1.5"/>`;
      body += `<circle cx="${x + w / 2}" cy="${y + h / 2}" r="14" fill="${INK}"/><text x="${x + w / 2}" y="${y + h / 2 + 5}" text-anchor="middle" font-size="15" font-weight="bold" fill="#ffffff">${esc(pl.key)}</text>`;
    } else {
      body += `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="4" fill="#dbe9f9" stroke="#57606a"/>`;
      body += `<text x="${x + w / 2}" y="${y + h / 2 + 4}" text-anchor="middle" font-size="11" fill="${INK}">${esc(pl.name ?? "")}</text>`;
    }
  }
  if (m.entrance) {
    const ex = X(m.entrance.x);
    const ey = Y(m.entrance.y);
    body += `<path d="M${ex - 9},${ey + 12} L${ex},${ey - 6} L${ex + 9},${ey + 12} Z" fill="#cf222e"/><text x="${ex}" y="${ey + 26}" text-anchor="middle" font-size="11" font-weight="bold" fill="#cf222e">${esc(m.entrance.label)}</text>`;
  }
  body += `<g transform="translate(${W - 40},${oy + 24})"><path d="M0,-16 L6,4 L0,0 L-6,4 Z" fill="${INK}"/><text x="0" y="18" text-anchor="middle" font-size="12" font-weight="bold" fill="${INK}">N</text></g>`;
  return frame(W, H, body, m.title);
}
