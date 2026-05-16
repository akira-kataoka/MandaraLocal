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
export function renderHistogram(svgEl, values, label, bins = 10, onBinHover = null) {
  svgEl.innerHTML = "";
  const v = values.filter(x => Number.isFinite(x));
  const n = v.length;
  if (n < 2) return { n: 0, binCount: 0, max: 0 };

  // Sturges' formula caps the suggested bin count
  const auto = Math.max(3, Math.min(30, Math.ceil(Math.log2(n) + 1)));
  const k = Math.max(3, Math.min(30, bins || auto));

  const min = Math.min(...v);
  const max = Math.max(...v);
  if (min === max) return { n, binCount: 1, max: n };
  const width = (max - min) / k;

  // Bin counts
  const counts = new Array(k).fill(0);
  for (const x of v) {
    let idx = Math.floor((x - min) / width);
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
  // x ticks at min, mid, max
  for (const f of [0, 0.5, 1]) {
    const tx = PAD.left + f * innerW;
    axis.appendChild(line(tx, H - PAD.bottom, tx, H - PAD.bottom + 3));
    axis.appendChild(text(tx, H - PAD.bottom + 12, formatShort(min + f * (max - min)), "middle"));
  }
  // y ticks at 0 and maxCount
  for (const c of [0, maxCount]) {
    const ty = y(c);
    axis.appendChild(line(PAD.left - 3, ty, PAD.left, ty));
    axis.appendChild(text(PAD.left - 5, ty + 3, String(c), "end"));
  }
  axis.appendChild(text(W / 2, H - 4, label || "", "middle"));
  svgEl.appendChild(axis);

  // Bars
  const bars = el("g");
  const barGap = 0.5;
  counts.forEach((c, i) => {
    if (c === 0) return;
    const bx = x(i) + barGap;
    const bw = (innerW / k) - barGap * 2;
    const by = y(c);
    const bh = (H - PAD.bottom) - by;
    const lo = min + i * width;
    const hi = lo + width;
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
