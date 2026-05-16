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
// Group-overlay palette (Cycle 176) — matches scatter / boxplot grouped colors.
const GROUP_PALETTE = [
  "#2563eb", "#dc2626", "#16a34a", "#d97706",
  "#9333ea", "#0891b2", "#db2777", "#65a30d",
];

export function renderHistogram(svgEl, values, label, bins = 10, onBinHover = null, opts = {}) {
  svgEl.innerHTML = "";
  const logX = !!opts.logX;
  // Cycle 176: when group overlay is active (2-4 categories), render multiple
  // semi-transparent histograms sharing the same bins.
  const groups = (opts.groups && opts.groups.length >= 2 && opts.groups.length <= 4) ? opts.groups : null;
  if (groups) {
    // Cycle 262: facet (small multiples) when requested, else default overlay.
    if (opts.facet) return renderFacetHistogram(svgEl, groups, label, bins, logX, { ...opts, onBinHover });
    return renderGroupHistogram(svgEl, groups, label, bins, logX, opts);
  }
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
  // Cycle 210: cumulative (CDF-like) mode — replace per-bin counts with the
  // running sum so each bar shows "values ≤ upper edge of this bin". maxCount
  // stays equal to total n, which keeps μ/M/σ vertical lines positioned the
  // same way as in the density view.
  const cumulative = !!opts.cumulative;
  let display = counts;
  if (cumulative) {
    display = new Array(k);
    let run = 0;
    for (let i = 0; i < k; i++) { run += counts[i]; display[i] = run; }
  }
  const maxCount = Math.max(...display);

  // Axes
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const x = (i) => PAD.left + (i / k) * innerW;
  const y = (c) => PAD.top + innerH - (c / maxCount) * innerH;

  // Cycle 288: axis font size shared with scatter (Cycle 287).
  const fsKey = opts.axisFontSize === "S" || opts.axisFontSize === "L" ? opts.axisFontSize : "M";
  const tickFs = fsKey === "S" ? 7 : fsKey === "L" ? 11 : 9;
  const labelFs = tickFs + 1;
  const tickText = (xc, yc, str, anchor) => {
    const t = text(xc, yc, str, anchor);
    t.setAttribute("font-size", String(tickFs));
    return t;
  };
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
    axis.appendChild(tickText(tx, H - PAD.bottom + 12, formatShort(raw), "middle"));
  }
  // y ticks at 0 and maxCount
  for (const c of [0, maxCount]) {
    const ty = y(c);
    axis.appendChild(line(PAD.left - 3, ty, PAD.left, ty));
    axis.appendChild(tickText(PAD.left - 5, ty + 3, String(c), "end"));
  }
  const xLabelEl = text(W / 2, H - 4, label || "", "middle");
  xLabelEl.setAttribute("font-size", String(labelFs));
  xLabelEl.setAttribute("font-weight", "600");
  axis.appendChild(xLabelEl);
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
  display.forEach((c, i) => {
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
    tip.textContent = cumulative
      ? `〜${formatNum(hi)}: 累積${c}件 (${(c / n * 100).toFixed(1)}%)`
      : `${formatNum(lo)} 〜 ${formatNum(hi)}: ${c}件`;
    rect.appendChild(tip);
    if (onBinHover) {
      rect.style.cursor = "pointer";
      rect.addEventListener("mouseenter", () => onBinHover(lo, hi, i, true));
      rect.addEventListener("mouseleave", () => onBinHover(lo, hi, i, false));
    }
    // Cycle 253: Shift+click on a bar bulk-pins every region whose value
    // falls in [lo, hi]. Plain click stays inert so users can still hover.
    if (typeof opts.onBinClick === "function") {
      rect.style.cursor = "pointer";
      rect.addEventListener("click", (ev) => {
        if (!ev.shiftKey) return;
        ev.preventDefault();
        opts.onBinClick(lo, hi, i);
      });
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
    // Cycle 196: show numeric value next to each label so users see the actual
    // μ / M / ±σ without hovering. Stagger Y per row to avoid overlap when the
    // four lines cluster, and flip anchor at right edge so text doesn't clip.
    // Cycle 294: scale the μ/M/±σ labels with axisFontSize so they stay in
    // visual sync with the rest of the chart.
    const statFs = tickFs;
    const statRowGap = statFs + 1;
    const addLine = (val, color, dash, prefix, row) => {
      if (val < min || val > max) return;
      const xpx = xAt(val);
      const ln = el("line", {
        x1: xpx, y1: PAD.top, x2: xpx, y2: H - PAD.bottom,
        stroke: color, "stroke-width": 1.2,
      });
      if (dash) ln.setAttribute("stroke-dasharray", dash);
      overlay.appendChild(ln);
      const txt = `${prefix}=${formatShort(val)}`;
      const nearRight = xpx > W - PAD.right - 50;
      const lab = el("text", {
        x: nearRight ? xpx - 2 : xpx + 2,
        y: PAD.top + statFs + row * statRowGap,
        "font-size": statFs, "font-weight": 700, fill: color,
        "text-anchor": nearRight ? "end" : "start",
      });
      lab.textContent = txt;
      overlay.appendChild(lab);
    };
    addLine(mean,       "#dc2626", "",       "μ",  0);
    addLine(median,     "#2563eb", "3,2",    "M",  1);
    addLine(mean - sd,  "#64748b", "1,2",    "-σ", 2);
    addLine(mean + sd,  "#64748b", "1,2",    "+σ", 3);
    // Theoretical normal-distribution curve (Cycle 156) — scaled to the
    // histogram's count axis: density × n × binWidth.
    // Cycle 210: skip in cumulative mode (would need a different formula
    // for the CDF; keep the panel uncluttered).
    if (opts.normalCurve !== false && sd > 0 && !cumulative) {
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

// Cycle 176: render up to 4 histograms overlaid in the same panel for
// visual distribution comparison (companion to grouped boxplot / ANOVA).
// Cycle 262: faceted (small multiples) histogram. The SVG viewBox grows
// vertically with the number of groups so each panel has a fair share of
// vertical real-estate. X axis is shared (min/max across all groups), Y
// axis is per-group so single-mode comparison stays readable.
function renderFacetHistogram(svgEl, groups, label, bins, logX, opts = {}) {
  const filtered = groups.map(g => ({
    name: g.name,
    v: g.values.filter(x => Number.isFinite(x) && (!logX || x > 0)),
  })).filter(g => g.v.length >= 2);
  if (filtered.length < 2) return { n: 0, binCount: 0, max: 0 };
  const allVals = [].concat(...filtered.map(g => g.v));
  const min = Math.min(...allVals);
  const max = Math.max(...allVals);
  if (min === max) return { n: allVals.length, binCount: 1, max: allVals.length };
  const auto = Math.max(3, Math.min(30, Math.ceil(Math.log2(allVals.length) + 1)));
  const k = Math.max(3, Math.min(30, bins || auto));
  const sx = logX ? (x) => Math.log10(x) : (x) => x;
  const sMin = sx(min), sMax = sx(max);
  const width = (sMax - sMin) / k;
  // Counts per group
  const countsByGroup = filtered.map(g => {
    const c = new Array(k).fill(0);
    for (const x of g.v) {
      let i = Math.floor((sx(x) - sMin) / width);
      if (i >= k) i = k - 1;
      c[i]++;
    }
    return c;
  });
  const facetH = 60;        // per-facet drawable height
  const facetGap = 14;      // space between facets (label + gap)
  const topPad = 18;        // for shared x-axis label
  const innerW = W - PAD.left - PAD.right;
  const totalH = topPad + filtered.length * (facetH + facetGap) + 16;
  svgEl.setAttribute("viewBox", `0 0 ${W} ${totalH}`);
  svgEl.setAttribute("height", String(totalH));
  // Cycle 290: shared axisFontSize with the other charts.
  const fsKey = opts.axisFontSize === "S" || opts.axisFontSize === "L" ? opts.axisFontSize : "M";
  const tickFs = fsKey === "S" ? 7 : fsKey === "L" ? 11 : 9;
  const labelFs = tickFs + 1;
  // Shared X axis at the top (3 ticks)
  const xAt = (sval) => PAD.left + ((sval - sMin) / (sMax - sMin)) * innerW;
  const axisTop = el("g", { class: "axis" });
  for (const f of [0, 0.5, 1]) {
    const tx = PAD.left + f * innerW;
    const t = text(tx, 10, formatShort(logX ? Math.pow(10, sMin + f * (sMax - sMin)) : sMin + f * (sMax - sMin)), "middle");
    t.setAttribute("font-size", String(tickFs));
    axisTop.appendChild(t);
  }
  svgEl.appendChild(axisTop);
  // Per-facet panels
  filtered.forEach((g, gi) => {
    const facetTop = topPad + gi * (facetH + facetGap);
    const facetBottom = facetTop + facetH;
    const counts = countsByGroup[gi];
    const maxCount = Math.max(...counts) || 1;
    const color = GROUP_PALETTE[gi % GROUP_PALETTE.length];
    // Panel name + n
    const labelTxt = el("text", { x: PAD.left, y: facetTop - 2, "font-size": labelFs, "font-weight": 600, fill: "#1e293b" });
    labelTxt.textContent = `${g.name.length > 18 ? g.name.slice(0, 17) + "…" : g.name} (n=${g.v.length})`;
    svgEl.appendChild(labelTxt);
    // Baseline
    svgEl.appendChild(line(PAD.left, facetBottom, W - PAD.right, facetBottom));
    // Bars
    const barW = innerW / k;
    counts.forEach((c, i) => {
      if (c === 0) return;
      const bx = PAD.left + i * barW;
      const bh = (c / maxCount) * facetH;
      const by = facetBottom - bh;
      const sLo = sMin + i * width;
      const sHi = sLo + width;
      const lo = logX ? Math.pow(10, sLo) : sLo;
      const hi = logX ? Math.pow(10, sHi) : sHi;
      const rect = el("rect", {
        x: bx, y: by, width: Math.max(0.5, barW - 0.4), height: bh,
        fill: color, "fill-opacity": "0.6", stroke: color, "stroke-width": 0.4,
      });
      const tip = el("title");
      tip.textContent = `${formatNum(lo)} 〜 ${formatNum(hi)}: ${c}件`;
      rect.appendChild(tip);
      // Cycle 263: Shift+click bin → bulk-pin via opts.onBinClick.
      if (typeof opts.onBinClick === "function") {
        rect.style.cursor = "pointer";
        rect.addEventListener("click", (ev) => {
          if (!ev.shiftKey) return;
          ev.preventDefault();
          opts.onBinClick(lo, hi, i);
        });
      }
      // Cycle 264: hover → map highlight via opts.onBinHover (same signature
      // as renderHistogram), kept independent so click and hover compose.
      if (typeof opts.onBinHover === "function") {
        rect.style.cursor = "pointer";
        rect.addEventListener("mouseenter", () => opts.onBinHover(lo, hi, i, true));
        rect.addEventListener("mouseleave", () => opts.onBinHover(lo, hi, i, false));
      }
      svgEl.appendChild(rect);
    });
    // Right-side max count text
    const maxText = text(W - PAD.right + 2, facetTop + 8, `max=${maxCount}`, "start");
    maxText.setAttribute("font-size", String(tickFs));
    svgEl.appendChild(maxText);
  });
  // X axis label at the bottom (shared)
  const xLabelEl = text(W / 2, totalH - 2, label || "", "middle");
  xLabelEl.setAttribute("font-size", String(labelFs));
  xLabelEl.setAttribute("font-weight", "600");
  svgEl.appendChild(xLabelEl);
  return { n: allVals.length, binCount: k, max: Math.max(...countsByGroup.flat()), groups: filtered.length, facet: true };
}

function renderGroupHistogram(svgEl, groups, label, bins, logX, opts = {}) {
  // Filter each group to positive values only when log axis is on.
  const filtered = groups.map(g => ({
    name: g.name,
    v: g.values.filter(x => Number.isFinite(x) && (!logX || x > 0)),
  })).filter(g => g.v.length >= 2);
  if (filtered.length < 2) return { n: 0, binCount: 0, max: 0 };
  const allVals = [].concat(...filtered.map(g => g.v));
  const min = Math.min(...allVals);
  const max = Math.max(...allVals);
  if (min === max) return { n: allVals.length, binCount: 1, max: allVals.length };
  const auto = Math.max(3, Math.min(30, Math.ceil(Math.log2(allVals.length) + 1)));
  const k = Math.max(3, Math.min(30, bins || auto));
  const sx = logX ? (x) => Math.log10(x) : (x) => x;
  const sMin = sx(min), sMax = sx(max);
  const step = (sMax - sMin) / k;
  // Count per group
  const countsByGroup = filtered.map(g => {
    const c = new Array(k).fill(0);
    for (const x of g.v) {
      let i = Math.floor((sx(x) - sMin) / step);
      if (i >= k) i = k - 1;
      c[i]++;
    }
    return c;
  });
  const maxCount = Math.max(...countsByGroup.flat());
  // Layout
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const x = (i) => PAD.left + (i / k) * innerW;
  const y = (c) => PAD.top + innerH - (c / maxCount) * innerH;
  // Cycle 290: axisFontSize for overlay histogram.
  const fsKey = opts.axisFontSize === "S" || opts.axisFontSize === "L" ? opts.axisFontSize : "M";
  const tickFs = fsKey === "S" ? 7 : fsKey === "L" ? 11 : 9;
  const labelFs = tickFs + 1;
  // Axes
  const axis = el("g", { class: "axis" });
  axis.appendChild(line(PAD.left, H - PAD.bottom, W - PAD.right, H - PAD.bottom));
  axis.appendChild(line(PAD.left, PAD.top, PAD.left, H - PAD.bottom));
  for (const f of [0, 0.5, 1]) {
    const tx = PAD.left + f * innerW;
    axis.appendChild(line(tx, H - PAD.bottom, tx, H - PAD.bottom + 3));
    const sval = sMin + f * (sMax - sMin);
    const raw = logX ? Math.pow(10, sval) : sval;
    const t = text(tx, H - PAD.bottom + 12, formatShort(raw), "middle");
    t.setAttribute("font-size", String(tickFs));
    axis.appendChild(t);
  }
  for (const c of [0, maxCount]) {
    const ty = y(c);
    axis.appendChild(line(PAD.left - 3, ty, PAD.left, ty));
    const t = text(PAD.left - 5, ty + 3, String(c), "end");
    t.setAttribute("font-size", String(tickFs));
    axis.appendChild(t);
  }
  const xLabelEl = text(W / 2, H - 4, label || "", "middle");
  xLabelEl.setAttribute("font-size", String(labelFs));
  xLabelEl.setAttribute("font-weight", "600");
  axis.appendChild(xLabelEl);
  svgEl.appendChild(axis);
  // Bars per group, overlaid translucent
  const barW = innerW / k;
  filtered.forEach((g, gi) => {
    const color = GROUP_PALETTE[gi % GROUP_PALETTE.length];
    const counts = countsByGroup[gi];
    const gBars = el("g");
    counts.forEach((c, i) => {
      if (c === 0) return;
      const bx = x(i);
      const by = y(c);
      const bh = (H - PAD.bottom) - by;
      const rect = el("rect", {
        x: bx, y: by, width: Math.max(0.5, barW - 0.4), height: bh,
        fill: color, "fill-opacity": "0.4", stroke: color, "stroke-width": 0.4,
      });
      gBars.appendChild(rect);
    });
    svgEl.appendChild(gBars);
  });
  // Legend at top-right of the SVG
  const lg = el("g");
  const lgY = PAD.top + 2;
  filtered.forEach((g, gi) => {
    const color = GROUP_PALETTE[gi % GROUP_PALETTE.length];
    const ly = lgY + gi * 12;
    lg.appendChild(el("rect", {
      x: W - PAD.right - 60, y: ly, width: 8, height: 8,
      fill: color, "fill-opacity": "0.5", stroke: color, "stroke-width": 0.6,
    }));
    const t = el("text", {
      x: W - PAD.right - 50, y: ly + 7, "font-size": 8, fill: "#1e293b",
    });
    const nm = g.name.length > 8 ? g.name.slice(0, 7) + "…" : g.name;
    t.textContent = `${nm} (n=${g.v.length})`;
    lg.appendChild(t);
  });
  svgEl.appendChild(lg);
  return { n: allVals.length, binCount: k, max: maxCount, groups: filtered.length };
}
function line(x1, y1, x2, y2) {
  return el("line", { x1, y1, x2, y2 });
}
function text(x, y, t, anchor) {
  const node = el("text", { x, y, "text-anchor": anchor || "start" });
  node.textContent = t;
  return node;
}
