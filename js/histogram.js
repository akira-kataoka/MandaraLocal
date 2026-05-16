// =====================================================================
// histogram.js -- Pure-SVG histogram (sibling of scatter.js)
// =====================================================================

import { formatNum } from "./stats.js";

const W = 280, H = 180;
const PAD = { top: 10, right: 12, bottom: 24, left: 36 };

/**
 * @param svgEl   target SVG element (viewBox 280x180 preserveAspectRatio set in HTML)
 * @param values  number[] (null/NaN/non-positive ignored when logX)
 * @param label   x-axis label
 * @param bins    bin count (default 10, clamped 3..30)
 * @returns { n, binCount, max }
 */
export function renderHistogram(svgEl, values, label, bins = 10, onBinHover = null, opts = {}) {
  svgEl.innerHTML = "";
  const logX = !!opts.logX;
  // When log axis is requested, only positive values are usable.
  let v;
  if (logX) {
    v = values.filter(x => Number.isFinite(x) && x > 0);
  } else {
    v = values.filter(x => Number.isFinite(x));
  }
  const n = v.length;
  if (n < 2) return { n: 0, binCount: 0, max: 0 };

  // Sturges' formula caps the suggested bin count
  const auto = Math.max(3, Math.min(30, Math.ceil(Math.log2(n) + 1)));
  const k = Math.max(3, Math.min(30, bins || auto));

  // For log axis, bin in log10 space. tx() projects display coordinate.
  const min = Math.min(...v);
  const max = Math.max(...v);
  if (min === max) return { n, binCount: 1, max: n };
  // sx: source-space → bin-space (linear or log10)
  const sx = logX ? (x) => Math.log10(x) : (x) => x;
  const sMin = sx(min), sMax = sx(max);
  const width = (sMax - sMin) / k;
  // Bin counts (in sx space)
  const counts = new Array(k).fill(0);
  for (const x of v) {
    let idx = Math.floor((sx(x) - sMin) / width);
    if (idx >= k) idx = k - 1;
    counts[idx]++;
  }
  const maxCount = Math.max(...counts);

  // Axes
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const x = (i) => PAD.left + (i / k) * innerW;
  const y = (c) => PAD.top + innerH - (c / maxCount) * innerH;

  // Axes lines
  const axis = el("g", { class: "axis" });
  axis.appendChild(line(PAD.left, H - PAD.bottom, W - PAD.right, H - PAD.bottom));
  axis.appendChild(line(PAD.left, PAD.top, PAD.left, H - PAD.bottom));
  // x ticks at min, mid, max (display original values even on log axis)
  for (const f of [0, 0.5, 1]) {
    const tx = PAD.left + f * innerW;
    axis.appendChild(line(tx, H - PAD.bottom, tx, H - PAD.bottom + 3));
    const sval = sMin + f * (sMax - sMin);
    const raw = logX ? Math.pow(10, sval) : sval;
    axis.appendChild(text(tx, H - PAD.bottom + 12, formatShort(raw), "middle"));
  }
  // y ticks at 0 and maxCount
  for (const c of [0, maxCount]) {
    const ty = y(c);
    axis.appendChild(line(PAD.left - 3, ty, PAD.left, ty));
    axis.appendChild(text(PAD.left - 5, ty + 3, String(c), "end"));
  }
  axis.appendChild(text(W / 2, H - 4, label || "", "middle"));
  svgEl.appendChild(axis);

  // Class breaks overlay: shaded bands behind the bars showing how the choropleth
  // classification partitions the value range. Draw before bars so bars remain dominant.
  if (opts.breaks && opts.colors && opts.breaks.length === opts.colors.length + 1) {
    const breaks = opts.breaks;
    const cls = el("g", { class: "hist-class-bands" });
    // Helper: project a raw value to pixel x, honoring log axis if active.
    const valToPx = (val) => {
      if (logX && val <= 0) return PAD.left;
      const sv = sx(val);
      return PAD.left + ((sv - sMin) / (sMax - sMin)) * innerW;
    };
    for (let i = 0; i < opts.colors.length; i++) {
      const lo = Math.max(min, breaks[i]);
      const hi = Math.min(max, breaks[i + 1]);
      if (hi <= lo) continue;
      const bx = valToPx(lo);
      const bw = valToPx(hi) - bx;
      const band = el("rect", {
        x: bx, y: PAD.top, width: bw, height: innerH,
        fill: opts.colors[i], "fill-opacity": "0.18", "shape-rendering": "crispEdges",
      });
      cls.appendChild(band);
    }
    // Boundary lines at each interior break
    for (let i = 1; i < breaks.length - 1; i++) {
      const bv = breaks[i];
      if (bv < min || bv > max) continue;
      const bx = valToPx(bv);
      const ln = el("line", {
        x1: bx, y1: PAD.top, x2: bx, y2: H - PAD.bottom,
        stroke: "#475569", "stroke-width": "0.6", "stroke-dasharray": "2,2",
      });
      cls.appendChild(ln);
    }
    svgEl.appendChild(cls);
  }

  // Bars
  const bars = el("g");
  const barGap = 0.5;
  counts.forEach((c, i) => {
    if (c === 0) return;
    const bx = x(i) + barGap;
    const bw = (innerW / k) - barGap * 2;
    const by = y(c);
    const bh = (H - PAD.bottom) - by;
    // sx-space lo/hi; if log axis, translate back to original units for tooltip
    const sLo = sMin + i * width;
    const sHi = sLo + width;
    const lo = logX ? Math.pow(10, sLo) : sLo;
    const hi = logX ? Math.pow(10, sHi) : sHi;
    const rect = el("rect", {
      x: bx, y: by, width: bw, height: bh,
      class: "hist-bar",
      "data-bin-idx": String(i),
      "data-bin-lo": String(lo),
      "data-bin-hi": String(hi),
    });
    const tip = el("title");
    tip.textContent = `${formatNum(lo)} 〜 ${formatNum(hi)}: ${c}件`;
    rect.appendChild(tip);
    if (onBinHover) {
      rect.style.cursor = "pointer";
      rect.addEventListener("mouseenter", () => onBinHover(lo, hi, i, true));
      rect.addEventListener("mouseleave", () => onBinHover(lo, hi, i, false));
    }
    bars.appendChild(rect);
  });
  svgEl.appendChild(bars);

  // Statistical overlay: mean (solid red), median (dashed blue), ±1σ (dotted grey).
  if (opts.overlay !== false) {
    const mean = v.reduce((a, b) => a + b, 0) / n;
    const sorted = v.slice().sort((a, b) => a - b);
    const median = n % 2 === 0
      ? (sorted[n/2 - 1] + sorted[n/2]) / 2
      : sorted[Math.floor(n/2)];
    const variance = v.reduce((a, b) => a + (b - mean) * (b - mean), 0) / n;
    const sd = Math.sqrt(variance);
    const xAt = (val) => {
      if (logX && val <= 0) return PAD.left;
      const sv = sx(val);
      return PAD.left + ((sv - sMin) / (sMax - sMin)) * innerW;
    };
    const overlay = el("g", { class: "hist-stat-overlay" });
    const addLine = (val, color, dash, labelStr) => {
      if (val < min || val > max) return;
      const xpx = xAt(val);
      const ln = el("line", {
        x1: xpx, y1: PAD.top, x2: xpx, y2: H - PAD.bottom,
        stroke: color, "stroke-width": 1.2,
      });
      if (dash) ln.setAttribute("stroke-dasharray", dash);
      overlay.appendChild(ln);
      const lab = el("text", {
        x: xpx + 2, y: PAD.top + 8,
        "font-size": 9, "font-weight": 700, fill: color,
      });
      lab.textContent = labelStr;
      overlay.appendChild(lab);
    };
    addLine(mean,       "#dc2626", "",       "μ");
    addLine(median,     "#2563eb", "3,2",    "M");
    addLine(mean - sd,  "#64748b", "1,2",    "-σ");
    addLine(mean + sd,  "#64748b", "1,2",    "+σ");
    // Theoretical normal-distribution curve (Cycle 156) — scaled to the
    // histogram's count axis: density × n × binWidth.
    if (opts.normalCurve !== false && sd > 0) {
      const STEPS = 100;
      const pts = [];
      for (let i = 0; i <= STEPS; i++) {
        const xv = min + (i / STEPS) * (max - min);
        const z = (xv - mean) / sd;
        const dens = Math.exp(-0.5 * z * z) / (sd * Math.sqrt(2 * Math.PI));
        const count = dens * n * width;  // bin width = (max-min)/k
        pts.push(`${xAt(xv).toFixed(1)},${y(count).toFixed(1)}`);
      }
      const curve = el("polyline", {
        points: pts.join(" "),
        fill: "none", stroke: "#dc2626", "stroke-width": 1.5, opacity: 0.85,
      });
      overlay.appendChild(curve);
    }
    svgEl.appendChild(overlay);
    return { n, binCount: k, max: maxCount, mean, median, sd };
  }

  return { n, binCount: k, max: maxCount };
}

function formatShort(v) {
  const a = Math.abs(v);
  if (a >= 1e6) return (v / 1e6).toFixed(1) + "M";
  if (a >= 1e3) return (v / 1e3).toFixed(0) + "k";
  if (a >= 1) return v.toFixed(0);
  return v.toFixed(2);
}

function el(tag, attrs = {}) {
  const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}
function line(x1, y1, x2, y2) {
  return el("line", { x1, y1, x2, y2 });
}
function text(x, y, t, anchor) {
  const node = el("text", { x, y, "text-anchor": anchor || "start" });
  node.textContent = t;
  return node;
}
