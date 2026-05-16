// =====================================================================
// scatter.js -- Lightweight SVG scatter plot + Pearson correlation
// =====================================================================

import { formatNum } from "./stats.js";

const W = 280, H = 220;
const PAD = { top: 10, right: 12, bottom: 28, left: 38 };

/**
 * Draws a scatter plot of (xs, ys, ids) into the supplied SVG element.
 * Also renders the OLS regression line for visual context.
 * Returns the Pearson correlation coefficient r.
 *
 * @param ids   parallel array of feature ids (same length as xs/ys).
 *              Each circle is tagged with data-id for cross-highlighting.
 * @param onHover (id, on) callback fired on circle mouseover/out
 */
// Discrete palette for category-based series coloring (8 hues, then cycles).
const SERIES_PALETTE = [
  "#2563eb", "#dc2626", "#16a34a", "#d97706",
  "#9333ea", "#0891b2", "#db2777", "#65a30d",
];

export function renderScatter(svgEl, xs, ys, xLabel, yLabel, ids = null, onHover = null, onSelect = null, opts = {}, colorFor = null, names = null, categoryFor = null) {
  const logX = !!opts.logX;
  const logY = !!opts.logY;
  // Pair up & drop missing (drop non-positive when using log)
  const pairs = [];
  for (let i = 0; i < xs.length; i++) {
    if (Number.isFinite(xs[i]) && Number.isFinite(ys[i])) {
      if (logX && xs[i] <= 0) continue;
      if (logY && ys[i] <= 0) continue;
      pairs.push([xs[i], ys[i], ids ? ids[i] : null, names ? names[i] : null]);
    }
  }
  // Build category → color map if categoryFor is provided. Top-N (≤8) get
  // distinct hues; the rest collapse to "その他".
  let catMap = null;
  if (categoryFor && ids) {
    const counts = new Map();
    for (let i = 0; i < ids.length; i++) {
      const c = categoryFor(ids[i]);
      if (c == null || c === "") continue;
      counts.set(c, (counts.get(c) || 0) + 1);
    }
    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    catMap = new Map();
    sorted.slice(0, SERIES_PALETTE.length).forEach(([cat], i) => {
      catMap.set(cat, SERIES_PALETTE[i]);
    });
    if (sorted.length > SERIES_PALETTE.length) catMap.set("__other__", "#94a3b8");
  }
  svgEl.innerHTML = "";
  if (pairs.length < 2) return { r: null, n: pairs.length };

  // Pearson on raw values; visualisation uses log-transformed coordinates if requested.
  const x = pairs.map(p => p[0]);
  const y = pairs.map(p => p[1]);
  // Helper: project a value through the chosen scale
  const sx = logX ? (v) => Math.log10(v) : (v) => v;
  const sy = logY ? (v) => Math.log10(v) : (v) => v;
  const xs2 = x.map(sx), ys2 = y.map(sy);
  const xMin = Math.min(...xs2), xMax = Math.max(...xs2);
  const yMin = Math.min(...ys2), yMax = Math.max(...ys2);

  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  // pxAt/pyAt take *scaled* (i.e. already sx/sy-applied) values
  const pxAt = v => PAD.left + (xMax === xMin ? innerW / 2 : ((v - xMin) / (xMax - xMin)) * innerW);
  const pyAt = v => PAD.top + innerH - (yMax === yMin ? innerH / 2 : ((v - yMin) / (yMax - yMin)) * innerH);
  // px/py take *raw* values
  const px = vRaw => pxAt(sx(vRaw));
  const py = vRaw => pyAt(sy(vRaw));

  // axes
  const axis = el("g", { class: "axis" });
  axis.appendChild(line(PAD.left, H - PAD.bottom, W - PAD.right, H - PAD.bottom));
  axis.appendChild(line(PAD.left, PAD.top, PAD.left, H - PAD.bottom));

  // tick labels (in scaled coords; display the raw value)
  for (const t of ticks(xMin, xMax, 4)) {
    const tx = pxAt(t);
    const raw = logX ? Math.pow(10, t) : t;
    axis.appendChild(line(tx, H - PAD.bottom, tx, H - PAD.bottom + 3));
    axis.appendChild(text(tx, H - PAD.bottom + 12, formatShort(raw), "middle"));
  }
  for (const t of ticks(yMin, yMax, 4)) {
    const ty = pyAt(t);
    const raw = logY ? Math.pow(10, t) : t;
    axis.appendChild(line(PAD.left - 3, ty, PAD.left, ty));
    axis.appendChild(text(PAD.left - 5, ty + 3, formatShort(raw), "end"));
  }
  axis.appendChild(text(W / 2, H - 4, xLabel, "middle"));
  axis.appendChild(text(8, PAD.top + innerH / 2, yLabel, "middle", { transform: `rotate(-90, 8, ${PAD.top + innerH / 2})` }));
  svgEl.appendChild(axis);

  // points
  const pts = el("g");
  for (const [vx, vy, fid] of pairs) {
    const c = circle(px(vx), py(vy), 3, "point");
    if (fid != null) c.setAttribute("data-id", String(fid));
    // Priority: categoryFor (when set) overrides map-class colorFor.
    let appliedColor = null;
    if (catMap && fid != null) {
      const raw = categoryFor(fid);
      if (raw != null && raw !== "") {
        appliedColor = catMap.get(raw) || catMap.get("__other__") || null;
      }
    } else if (colorFor && fid != null) {
      appliedColor = colorFor(fid);
    }
    if (appliedColor) {
      c.style.fill = appliedColor;
      c.style.fillOpacity = "0.85";
      c.style.stroke = "#1e293b";
      c.style.strokeWidth = "0.6";
    }
    if (onHover && fid != null) {
      c.addEventListener("mouseenter", () => {
        c.classList.add("is-hot");
        c.setAttribute("r", "5");
        onHover(fid, true);
      });
      c.addEventListener("mouseleave", () => {
        c.classList.remove("is-hot");
        c.setAttribute("r", "3");
        onHover(fid, false);
      });
      if (onSelect) {
        c.addEventListener("click", () => onSelect(fid));
      }
      c.style.cursor = "pointer";
    }
    pts.appendChild(c);
  }
  svgEl.appendChild(pts);

  // Outlier labels: tag points whose value is outside Tukey 1.5×IQR fences
  // on either axis. Helps reading dense plots without hovering.
  // Label mode: "outliers" (default, Tukey IQR), "all", or "none".
  const labelMode = opts.labels === "all" || opts.labels === "none" ? opts.labels : "outliers";
  if (names && labelMode !== "none") {
    let xLo, xHi, yLo, yHi;
    if (labelMode === "outliers") {
      const quantile = (arr, p) => {
        const a = arr.slice().sort((u,w)=>u-w);
        const idx = (a.length - 1) * p;
        const lo = Math.floor(idx), hi = Math.ceil(idx);
        return lo === hi ? a[lo] : a[lo] + (a[hi]-a[lo]) * (idx - lo);
      };
      const xq1 = quantile(x, 0.25), xq3 = quantile(x, 0.75);
      const yq1 = quantile(y, 0.25), yq3 = quantile(y, 0.75);
      xLo = xq1 - 1.5 * (xq3 - xq1); xHi = xq3 + 1.5 * (xq3 - xq1);
      yLo = yq1 - 1.5 * (yq3 - yq1); yHi = yq3 + 1.5 * (yq3 - yq1);
    }
    const labels = el("g", { class: "scatter-labels" });
    for (const [vx, vy, fid, nm] of pairs) {
      if (!nm) continue;
      if (labelMode === "outliers") {
        const isOutlier = vx < xLo || vx > xHi || vy < yLo || vy > yHi;
        if (!isOutlier) continue;
      }
      const tx = pxAt(sx(vx)) + 5;
      const ty = pyAt(sy(vy)) - 5;
      const lbl = el("text", { x: tx, y: ty });
      // "all" mode uses smaller font + lighter color to reduce visual noise
      lbl.setAttribute("font-size", labelMode === "all" ? "8" : "9");
      lbl.setAttribute("fill", labelMode === "all" ? "#475569" : "#1e293b");
      lbl.setAttribute("font-weight", labelMode === "all" ? "500" : "600");
      lbl.textContent = nm;
      labels.appendChild(lbl);
    }
    svgEl.appendChild(labels);
  }

  // OLS regression line in the *scaled* coordinate system so it stays
  // visually straight even on log axes. Pearson r is still on raw values.
  const r = pearson(x, y);
  let slope = null, intercept = null;
  if (Number.isFinite(r) && xMax !== xMin) {
    const olsR = ols(xs2, ys2);
    slope = olsR.slope; intercept = olsR.intercept;
    // Optional: 95% confidence band for the mean response. Drawn before the
    // line so the line sits cleanly on top. t = 1.96 (good for n >= 30,
    // slightly conservative for smaller n).
    if (opts.regCI && xs2.length >= 3) {
      const n = xs2.length;
      const mxs = xs2.reduce((a, b) => a + b, 0) / n;
      let sxx = 0, rss = 0;
      for (let i = 0; i < n; i++) {
        sxx += (xs2[i] - mxs) ** 2;
        const yhat = slope * xs2[i] + intercept;
        rss += (ys2[i] - yhat) ** 2;
      }
      if (sxx > 0 && rss >= 0) {
        const se = Math.sqrt(rss / Math.max(1, n - 2));
        const t = 1.96;
        const STEPS = 40;
        const upper = [];
        const lower = [];
        for (let i = 0; i <= STEPS; i++) {
          const xv = xMin + (i / STEPS) * (xMax - xMin);
          const ym = slope * xv + intercept;
          const half = t * se * Math.sqrt(1 / n + ((xv - mxs) ** 2) / sxx);
          upper.push([pxAt(xv), pyAt(ym + half)]);
          lower.push([pxAt(xv), pyAt(ym - half)]);
        }
        // Build filled polygon: upper-left → upper-right → lower-right → lower-left.
        const pts = [...upper, ...lower.reverse()].map(p => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
        const band = el("polygon", {
          points: pts,
          fill: "rgba(220,38,38,0.12)", stroke: "none",
        });
        svgEl.appendChild(band);
      }
    }
    const lineEl = el("line", {
      x1: pxAt(xMin), y1: pyAt(slope * xMin + intercept),
      x2: pxAt(xMax), y2: pyAt(slope * xMax + intercept),
      class: "regline",
    });
    svgEl.appendChild(lineEl);
  }

  // Regression equation text overlay (top-right corner of the chart)
  if (Number.isFinite(r) && slope != null) {
    const sym = (v) => {
      if (Math.abs(v) >= 100) return v.toFixed(0);
      if (Math.abs(v) >= 1)   return v.toFixed(2);
      return v.toExponential(2);
    };
    const sign = intercept >= 0 ? "+" : "−";
    const eq = logX || logY
      ? `(log) y = ${sym(slope)}x ${sign} ${sym(Math.abs(intercept))}`
      : `y = ${sym(slope)}x ${sign} ${sym(Math.abs(intercept))}`;
    const r2 = r * r;
    const eqEl = el("text", {
      x: W - PAD.right - 4, y: PAD.top + 9,
      "text-anchor": "end",
      "font-family": "ui-monospace, monospace",
      "font-size": 9, fill: "#dc2626", "font-weight": 600,
    });
    eqEl.textContent = `${eq}   R²=${r2.toFixed(3)}`;
    svgEl.appendChild(eqEl);
  }

  // Statistical overlay: centroid + IQR box (on raw values; positioned via px/py).
  if (opts.statsOverlay) {
    const quantile = (arr, p) => {
      const a = arr.slice().sort((u, w) => u - w);
      const idx = (a.length - 1) * p;
      const lo = Math.floor(idx), hi = Math.ceil(idx);
      return lo === hi ? a[lo] : a[lo] + (a[hi] - a[lo]) * (idx - lo);
    };
    const mx = x.reduce((a, b) => a + b, 0) / x.length;
    const my = y.reduce((a, b) => a + b, 0) / y.length;
    const xQ1 = quantile(x, 0.25), xQ3 = quantile(x, 0.75);
    const yQ1 = quantile(y, 0.25), yQ3 = quantile(y, 0.75);
    const overlay = el("g", { class: "scatter-stat-overlay" });
    // IQR box: middle-50% data envelope.
    if (Number.isFinite(xQ1) && Number.isFinite(yQ1)) {
      const x1 = px(xQ1), x2 = px(xQ3);
      const y1 = py(yQ3), y2 = py(yQ1);
      const rect = el("rect", {
        x: Math.min(x1, x2), y: Math.min(y1, y2),
        width: Math.abs(x2 - x1), height: Math.abs(y2 - y1),
        fill: "rgba(220,38,38,0.05)", stroke: "#dc2626",
        "stroke-width": 0.6, "stroke-dasharray": "2,2",
      });
      overlay.appendChild(rect);
    }
    // Mean cross lines.
    const mxPx = px(mx), myPx = py(my);
    if (mxPx >= PAD.left && mxPx <= W - PAD.right) {
      const ln = el("line", {
        x1: mxPx, y1: PAD.top, x2: mxPx, y2: H - PAD.bottom,
        stroke: "#dc2626", "stroke-width": 0.8, "stroke-dasharray": "3,2",
      });
      overlay.appendChild(ln);
    }
    if (myPx >= PAD.top && myPx <= H - PAD.bottom) {
      const ln = el("line", {
        x1: PAD.left, y1: myPx, x2: W - PAD.right, y2: myPx,
        stroke: "#dc2626", "stroke-width": 0.8, "stroke-dasharray": "3,2",
      });
      overlay.appendChild(ln);
    }
    // Centroid marker (◇ diamond).
    const dx = 5;
    const diamond = el("polygon", {
      points: `${mxPx},${myPx - dx} ${mxPx + dx},${myPx} ${mxPx},${myPx + dx} ${mxPx - dx},${myPx}`,
      fill: "#dc2626", stroke: "#fff", "stroke-width": 1.5,
    });
    overlay.appendChild(diamond);
    const lab = el("text", {
      x: mxPx + 7, y: myPx - 5, "font-size": 9, "font-weight": 700, fill: "#dc2626",
    });
    lab.textContent = "(X̄,Ȳ)";
    overlay.appendChild(lab);
    svgEl.appendChild(overlay);
  }

  // Series legend (bottom-right, drawn inside the SVG so PNG export captures it).
  if (catMap && catMap.size > 0) {
    const entries = [...catMap.entries()];
    const lg = el("g", { class: "scatter-legend" });
    const lineH = 11;
    const startY = PAD.top + 4;
    const rightX = W - PAD.right - 4;
    const bg = el("rect", {
      x: rightX - 88, y: startY - 9,
      width: 86, height: entries.length * lineH + 6,
      fill: "rgba(255,255,255,0.85)", stroke: "#cbd5e1", "stroke-width": 0.6, rx: 3,
    });
    lg.appendChild(bg);
    entries.forEach(([cat, col], i) => {
      const y = startY + i * lineH;
      lg.appendChild(el("rect", {
        x: rightX - 84, y: y - 6, width: 8, height: 8,
        fill: col, stroke: "#1e293b", "stroke-width": 0.4,
      }));
      const t = el("text", {
        x: rightX - 73, y: y, "font-size": 9, fill: "#1e293b",
      });
      const label = cat === "__other__" ? "その他" : String(cat);
      t.textContent = label.length > 11 ? label.slice(0, 10) + "…" : label;
      lg.appendChild(t);
    });
    svgEl.appendChild(lg);
  }

  const rho = spearman(x, y);
  const nValid = pairs.length;
  const rCI   = fisherCI(r, nValid);
  const rhoCI = fisherCI(rho, nValid);
  return { r, rho, rCI, rhoCI, n: nValid, slope, intercept, r2: Number.isFinite(r) ? r*r : null };
}

function pearson(xs, ys) {
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) {
    const ex = xs[i] - mx, ey = ys[i] - my;
    num += ex * ey; dx += ex * ex; dy += ey * ey;
  }
  if (dx === 0 || dy === 0) return null;
  return num / Math.sqrt(dx * dy);
}

// Spearman rank correlation. Handles ties via fractional (average) ranking,
// then applies the Pearson formula on the ranks.
export function spearman(xs, ys) {
  if (xs.length !== ys.length || xs.length < 2) return null;
  return pearson(toRanks(xs), toRanks(ys));
}
// Fisher z-transformation gives a 95% CI for a correlation coefficient.
// Returns [lo, hi] or null if not computable. Works for both Pearson r and
// Spearman ρ (the variance approximation is conservative but standard).
export function fisherCI(r, n) {
  if (r == null || !Number.isFinite(r) || n < 4 || Math.abs(r) >= 1) return null;
  const z = 0.5 * Math.log((1 + r) / (1 - r));
  const se = 1 / Math.sqrt(n - 3);
  const lo = z - 1.96 * se;
  const hi = z + 1.96 * se;
  const back = (zv) => (Math.exp(2 * zv) - 1) / (Math.exp(2 * zv) + 1);
  return [back(lo), back(hi)];
}

function toRanks(arr) {
  const n = arr.length;
  const idx = arr.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
  const ranks = new Array(n);
  let i = 0;
  while (i < n) {
    let j = i;
    while (j + 1 < n && idx[j + 1][0] === idx[i][0]) j++;
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) ranks[idx[k][1]] = avg;
    i = j + 1;
  }
  return ranks;
}

function ols(xs, ys) {
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    den += (xs[i] - mx) ** 2;
  }
  const slope = den === 0 ? 0 : num / den;
  return { slope, intercept: my - slope * mx };
}

function ticks(min, max, count) {
  if (min === max) return [min];
  const step = (max - min) / count;
  const out = [];
  for (let i = 0; i <= count; i++) out.push(min + step * i);
  return out;
}

function formatShort(v) {
  const a = Math.abs(v);
  if (a >= 1e6) return (v / 1e6).toFixed(1) + "M";
  if (a >= 1e3) return (v / 1e3).toFixed(0) + "k";
  if (a >= 1) return v.toFixed(0);
  return v.toFixed(2);
}

// SVG helpers
function el(tag, attrs = {}) {
  const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}
function line(x1, y1, x2, y2) {
  return el("line", { x1, y1, x2, y2 });
}
function circle(cx, cy, r, cls) {
  return el("circle", { cx, cy, r, class: cls });
}
function text(x, y, t, anchor, extra = {}) {
  const node = el("text", { x, y, "text-anchor": anchor || "start", ...extra });
  node.textContent = t;
  return node;
}
