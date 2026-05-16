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
export function renderBoxplot(svgEl, values, label, opts = {}) {
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
  // Mean marker (◇ diamond) — drawn in the same color family as scatter overlay (Cycle 105)
  // so the visual language stays consistent across panels (hist / scatter / box).
  const mean = v.reduce((a, b) => a + b, 0) / n;
  const mx = x(mean);
  const dx = 4;
  const diamond = make("polygon", {
    points: `${mx},${cy - dx} ${mx + dx},${cy} ${mx},${cy + dx} ${mx - dx},${cy}`,
    fill: "#dc2626", stroke: "#ffffff", "stroke-width": 1.4,
  });
  const tip = document.createElementNS(svgNS, "title");
  tip.textContent = `平均 X̄ = ${formatNum(mean)}`;
  diamond.appendChild(tip);
  svgEl.appendChild(diamond);
  // Small μ label above the marker
  const meanLab = make("text", {
    x: mx, y: cy - dx - 2, "text-anchor": "middle",
    "font-size": 8, "font-weight": 700, fill: "#dc2626", "font-family": "sans-serif",
  });
  meanLab.textContent = "μ";
  svgEl.appendChild(meanLab);

  // Cycle 288: axis font size shared with scatter (Cycle 287).
  const fsKey = opts.axisFontSize === "S" || opts.axisFontSize === "L" ? opts.axisFontSize : "M";
  const tickFs = fsKey === "S" ? 7 : fsKey === "L" ? 11 : 9;
  const labelFs = tickFs + 1;
  // Axis tick labels: min, median, max
  for (const [val, anchor] of [[min, "start"], [med, "middle"], [max, "end"]]) {
    const t = make("text", {
      x: x(val), y: H - 6, "text-anchor": anchor,
      "font-size": tickFs, fill: "#475569", "font-family": "sans-serif",
    });
    t.textContent = formatNum(val);
    svgEl.appendChild(t);
  }
  // Centered label
  if (label) {
    const lbl = make("text", {
      x: W / 2, y: PAD.top - 2, "text-anchor": "middle",
      "font-size": labelFs, fill: "#1e293b", "font-weight": 600, "font-family": "sans-serif",
    });
    lbl.textContent = label;
    svgEl.appendChild(lbl);
  }
  return { n, q1, median: med, q3, min, max, mean, outliers: outliers.length };
}

// Grouped boxplot (Cycle 175): stacks one horizontal box per category to
// visualize between-group differences (companion to Welch's t / ANOVA).
const GROUP_PALETTE = [
  "#2563eb", "#dc2626", "#16a34a", "#d97706",
  "#9333ea", "#0891b2", "#db2777", "#65a30d",
];
export function renderGroupedBoxplot(svgEl, groups, label) {
  svgEl.innerHTML = "";
  if (!groups || groups.length === 0) return { n: 0 };
  const G = groups.length;
  const PAD2 = { top: 12, right: 14, bottom: 28, left: 70 };
  const rowH = 22;
  const totalH = PAD2.top + PAD2.bottom + G * rowH;
  // Update SVG viewBox & physical height to fit groups
  const W2 = W;
  svgEl.setAttribute("viewBox", `0 0 ${W2} ${totalH}`);
  svgEl.setAttribute("height", String(totalH));
  // Compute per-group stats
  const groupStats = groups.map(g => {
    const v = g.values.filter(Number.isFinite);
    if (v.length < 4) return null;
    const sorted = v.slice().sort((a, b) => a - b);
    const q = (p) => {
      const idx = (v.length - 1) * p;
      const lo = Math.floor(idx), hi = Math.ceil(idx);
      return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
    };
    const q1 = q(0.25), med = q(0.5), q3 = q(0.75);
    const iqr = q3 - q1;
    const wLo = q1 - 1.5 * iqr, wHi = q3 + 1.5 * iqr;
    const lowerWhisker = Math.max(sorted[0], sorted.find(x => x >= wLo) ?? sorted[0]);
    const upperWhisker = Math.min(sorted[sorted.length - 1], [...sorted].reverse().find(x => x <= wHi) ?? sorted[sorted.length - 1]);
    const outs = sorted.filter(x => x < wLo || x > wHi);
    const mean = v.reduce((a, b) => a + b, 0) / v.length;
    return { name: g.name, q1, med, q3, min: sorted[0], max: sorted[sorted.length - 1], lowerWhisker, upperWhisker, outs, mean, n: v.length };
  }).filter(Boolean);
  if (groupStats.length === 0) return { n: 0 };
  // Common X scale spans the union of all observations.
  let gMin = Infinity, gMax = -Infinity;
  for (const g of groupStats) {
    if (g.min < gMin) gMin = g.min;
    if (g.max > gMax) gMax = g.max;
  }
  const innerW = W2 - PAD2.left - PAD2.right;
  const xRange = gMax - gMin || 1;
  const xAt = (v) => PAD2.left + ((v - gMin) / xRange) * innerW;
  const svgNS = "http://www.w3.org/2000/svg";
  const make = (tag, attrs) => {
    const n = document.createElementNS(svgNS, tag);
    for (const [k, val] of Object.entries(attrs)) n.setAttribute(k, val);
    return n;
  };
  // Top label
  if (label) {
    const t = make("text", {
      x: W2 / 2, y: PAD2.top - 2, "text-anchor": "middle",
      "font-size": 10, fill: "#1e293b", "font-weight": 600,
    });
    t.textContent = label;
    svgEl.appendChild(t);
  }
  // Render each group as a row
  groupStats.forEach((g, gi) => {
    const cy = PAD2.top + gi * rowH + rowH / 2;
    const color = GROUP_PALETTE[gi % GROUP_PALETTE.length];
    const boxH = 14;
    // Whiskers
    svgEl.appendChild(make("line", { x1: xAt(g.lowerWhisker), y1: cy, x2: xAt(g.q1), y2: cy, stroke: "#475569", "stroke-width": 1 }));
    svgEl.appendChild(make("line", { x1: xAt(g.q3), y1: cy, x2: xAt(g.upperWhisker), y2: cy, stroke: "#475569", "stroke-width": 1 }));
    svgEl.appendChild(make("line", { x1: xAt(g.lowerWhisker), y1: cy - 4, x2: xAt(g.lowerWhisker), y2: cy + 4, stroke: "#475569", "stroke-width": 1 }));
    svgEl.appendChild(make("line", { x1: xAt(g.upperWhisker), y1: cy - 4, x2: xAt(g.upperWhisker), y2: cy + 4, stroke: "#475569", "stroke-width": 1 }));
    // Box
    svgEl.appendChild(make("rect", {
      x: xAt(g.q1), y: cy - boxH / 2, width: xAt(g.q3) - xAt(g.q1), height: boxH,
      fill: color, "fill-opacity": "0.35", stroke: color, "stroke-width": 1,
    }));
    // Median
    svgEl.appendChild(make("line", { x1: xAt(g.med), y1: cy - boxH / 2, x2: xAt(g.med), y2: cy + boxH / 2, stroke: color, "stroke-width": 2 }));
    // Mean ◇
    const dx = 4;
    svgEl.appendChild(make("polygon", {
      points: `${xAt(g.mean)},${cy - dx} ${xAt(g.mean) + dx},${cy} ${xAt(g.mean)},${cy + dx} ${xAt(g.mean) - dx},${cy}`,
      fill: "#dc2626", stroke: "#fff", "stroke-width": 1,
    }));
    // Outliers
    for (const o of g.outs) {
      svgEl.appendChild(make("circle", { cx: xAt(o), cy, r: 2, fill: "#dc2626", "fill-opacity": 0.85 }));
    }
    // Group name (left margin)
    const lab = make("text", {
      x: PAD2.left - 4, y: cy + 3, "text-anchor": "end",
      "font-size": 10, fill: "#1e293b", "font-weight": 500,
    });
    const shortName = g.name.length > 10 ? g.name.slice(0, 9) + "…" : g.name;
    lab.textContent = `${shortName} (n=${g.n})`;
    svgEl.appendChild(lab);
  });
  // X-axis tick marks (min / mid / max)
  for (const f of [0, 0.5, 1]) {
    const x = PAD2.left + f * innerW;
    svgEl.appendChild(make("line", { x1: x, y1: totalH - PAD2.bottom, x2: x, y2: totalH - PAD2.bottom + 3, stroke: "#475569" }));
    const t = make("text", {
      x, y: totalH - PAD2.bottom + 14, "text-anchor": "middle",
      "font-size": 9, fill: "#475569",
    });
    t.textContent = formatNum(gMin + f * xRange);
    svgEl.appendChild(t);
  }
  return { n: groupStats.length };
}
