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
export function renderScatter(svgEl, xs, ys, xLabel, yLabel, ids = null, onHover = null, onSelect = null, opts = {}, colorFor = null, names = null) {
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
    if (colorFor && fid != null) {
      const col = colorFor(fid);
      if (col) {
        c.style.fill = col;
        c.style.fillOpacity = "0.85";
        c.style.stroke = "#1e293b";
        c.style.strokeWidth = "0.6";
      }
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
  if (names) {
    const quantile = (arr, p) => {
      const a = arr.slice().sort((u,w)=>u-w);
      const idx = (a.length - 1) * p;
      const lo = Math.floor(idx), hi = Math.ceil(idx);
      return lo === hi ? a[lo] : a[lo] + (a[hi]-a[lo]) * (idx - lo);
    };
    const xq1 = quantile(x, 0.25), xq3 = quantile(x, 0.75);
    const yq1 = quantile(y, 0.25), yq3 = quantile(y, 0.75);
    const xLo = xq1 - 1.5 * (xq3 - xq1), xHi = xq3 + 1.5 * (xq3 - xq1);
    const yLo = yq1 - 1.5 * (yq3 - yq1), yHi = yq3 + 1.5 * (yq3 - yq1);
    const labels = el("g", { class: "scatter-labels" });
    for (const [vx, vy, fid, nm] of pairs) {
      if (!nm) continue;
      const isOutlier = vx < xLo || vx > xHi || vy < yLo || vy > yHi;
      if (!isOutlier) continue;
      const tx = pxAt(sx(vx)) + 5;
      const ty = pyAt(sy(vy)) - 5;
      const lbl = el("text", { x: tx, y: ty });
      lbl.setAttribute("font-size", "9");
      lbl.setAttribute("fill", "#1e293b");
      lbl.setAttribute("font-weight", "600");
      lbl.textContent = nm;
      labels.appendChild(lbl);
    }
    svgEl.appendChild(labels);
  }

  // OLS regression line in the *scaled* coordinate system so it stays
  // visually straight even on log axes. Pearson r is still on raw values.
  const r = pearson(x, y);
  if (Number.isFinite(r) && xMax !== xMin) {
    const { slope, intercept } = ols(xs2, ys2);
    const lineEl = el("line", {
      x1: pxAt(xMin), y1: pyAt(slope * xMin + intercept),
      x2: pxAt(xMax), y2: pyAt(slope * xMax + intercept),
      class: "regline",
    });
    svgEl.appendChild(lineEl);
  }

  return { r, n: pairs.length };
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
