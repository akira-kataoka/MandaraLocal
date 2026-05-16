// =====================================================================
// boxplot.js -- Pure-SVG single-series box plot (with outliers).
// =====================================================================

import { formatNum } from "./stats.js";

const W = 280, H = 140;
const PAD = { top: 12, right: 14, bottom: 26, left: 14 };

/**
 * Horizontal box plot.
 *   ── whisker low ─ [Q1 ▒ median ▒ Q3] ─ whisker high ── ° outliers
 *
 * @param svgEl target SVG element (viewBox 280x140 preserveAspectRatio set in HTML)
 * @param values raw numbers
 * @param label  x-axis caption (field name)
 */
export function renderBoxplot(svgEl, values, label) {
  svgEl.innerHTML = "";
  const v = values.filter(Number.isFinite);
  const n = v.length;
  if (n < 4) return { n };
  const sorted = v.slice().sort((a, b) => a - b);
  const quantile = (p) => {
    const idx = (n - 1) * p;
    const lo = Math.floor(idx), hi = Math.ceil(idx);
    return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
  };
  const min = sorted[0], max = sorted[n - 1];
  const q1 = quantile(0.25), med = quantile(0.5), q3 = quantile(0.75);
  const iqr = q3 - q1;
  const wLo = q1 - 1.5 * iqr, wHi = q3 + 1.5 * iqr;
  const lowerWhisker = Math.max(min, sorted.find(x => x >= wLo) ?? min);
  const upperWhisker = Math.min(max, [...sorted].reverse().find(x => x <= wHi) ?? max);
  const outliers = sorted.filter(x => x < wLo || x > wHi);

  // x scale spans [min, max]
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const xRange = max - min || 1;
  const x = (v) => PAD.left + ((v - min) / xRange) * innerW;
  const cy = PAD.top + innerH / 2;
  const boxH = innerH * 0.55;
  const boxY = cy - boxH / 2;

  const svgNS = "http://www.w3.org/2000/svg";
  const make = (tag, attrs) => {
    const n = document.createElementNS(svgNS, tag);
    for (const [k, val] of Object.entries(attrs)) n.setAttribute(k, val);
    return n;
  };

  // Whiskers
  svgEl.appendChild(make("line", { x1: x(lowerWhisker), y1: cy, x2: x(q1), y2: cy, stroke: "#475569", "stroke-width": 1 }));
  svgEl.appendChild(make("line", { x1: x(q3), y1: cy, x2: x(upperWhisker), y2: cy, stroke: "#475569", "stroke-width": 1 }));
  // Whisker caps
  svgEl.appendChild(make("line", { x1: x(lowerWhisker), y1: cy - boxH * 0.3, x2: x(lowerWhisker), y2: cy + boxH * 0.3, stroke: "#475569", "stroke-width": 1 }));
  svgEl.appendChild(make("line", { x1: x(upperWhisker), y1: cy - boxH * 0.3, x2: x(upperWhisker), y2: cy + boxH * 0.3, stroke: "#475569", "stroke-width": 1 }));
  // Box
  svgEl.appendChild(make("rect", {
    x: x(q1), y: boxY, width: x(q3) - x(q1), height: boxH,
    fill: "#bfdbfe", stroke: "#1e3a8a", "stroke-width": 1,
  }));
  // Median
  svgEl.appendChild(make("line", { x1: x(med), y1: boxY, x2: x(med), y2: boxY + boxH, stroke: "#1e3a8a", "stroke-width": 2 }));
  // Outliers
  for (const o of outliers) {
    svgEl.appendChild(make("circle", { cx: x(o), cy, r: 2.5, fill: "#dc2626", "fill-opacity": 0.85 }));
  }

  // Axis tick labels: min, median, max
  for (const [val, anchor] of [[min, "start"], [med, "middle"], [max, "end"]]) {
    const t = make("text", {
      x: x(val), y: H - 6, "text-anchor": anchor,
      "font-size": 9, fill: "#475569", "font-family": "sans-serif",
    });
    t.textContent = formatNum(val);
    svgEl.appendChild(t);
  }
  // Centered label
  if (label) {
    const lbl = make("text", {
      x: W / 2, y: PAD.top - 2, "text-anchor": "middle",
      "font-size": 10, fill: "#1e293b", "font-weight": 600, "font-family": "sans-serif",
    });
    lbl.textContent = label;
    svgEl.appendChild(lbl);
  }
  return { n, q1, median: med, q3, min, max, outliers: outliers.length };
}
