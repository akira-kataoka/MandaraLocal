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

  // points (sizeFor from opts gives variable radius for bubble-chart mode)
  const sizeFn = typeof opts.sizeFor === "function" ? opts.sizeFor : null;
  const jitterPx = opts.jitter ? 2.5 : 0;
  // Deterministic offset (mulberry32-style) — same id always gets the same jitter
  const hashOffset = (key, axis) => {
    let h = 2166136261 ^ axis;
    const s = String(key);
    for (let i = 0; i < s.length; i++) { h = Math.imul(h ^ s.charCodeAt(i), 16777619); }
    h = (h ^ (h >>> 13)) >>> 0;
    return ((h / 0xFFFFFFFF) * 2 - 1) * jitterPx;
  };
  // Cycle 219: optional shape function for "shape-by category" plots.
  const shapeFn = typeof opts.shapeFor === "function" ? opts.shapeFor : null;
  const pts = el("g");
  for (const [vx, vy, fid, nm] of pairs) {
    const r0 = sizeFn && fid != null ? sizeFn(fid) : 3;
    const jx = jitterPx && fid != null ? hashOffset(fid, 0) : 0;
    const jy = jitterPx && fid != null ? hashOffset(fid, 1) : 0;
    const cxp = px(vx) + jx, cyp = py(vy) + jy;
    const shape = shapeFn && fid != null ? shapeFn(fid) : "circle";
    const c = makeMarker(shape, cxp, cyp, r0);
    if (fid != null) c.setAttribute("data-id", String(fid));
    c.__baseR = r0;
    c.__shape = shape;
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
    // Native SVG tooltip with name + values (Cycle 189). Shows after the
    // browser-standard hover delay; complements the live map highlight.
    if (nm) {
      const t = el("title");
      t.textContent = `${nm}\n${xLabel}: ${formatNum(vx)}\n${yLabel}: ${formatNum(vy)}`;
      c.appendChild(t);
    }
    if (onHover && fid != null) {
      c.addEventListener("mouseenter", () => {
        c.classList.add("is-hot");
        // Circle uses its native r-attribute; non-circle shapes just thicken
        // the stroke since their geometry is fixed at build time.
        if (shape === "circle") c.setAttribute("r", String(Math.max(5, r0 + 2)));
        else c.style.strokeWidth = "1.8";
        onHover(fid, true);
      });
      c.addEventListener("mouseleave", () => {
        c.classList.remove("is-hot");
        if (shape === "circle") c.setAttribute("r", String(r0));
        else c.style.strokeWidth = "0.6";
        onHover(fid, false);
      });
      if (onSelect) {
        // Cycle 212: pass the mouse event so the caller can branch on Shift
        // (pin/unpin) vs plain click (map zoom). Older callers ignore the
        // second arg, so this is backwards compatible.
        c.addEventListener("click", (e) => onSelect(fid, e));
      }
      c.style.cursor = "pointer";
    }
    pts.appendChild(c);
  }
  svgEl.appendChild(pts);

  // Brush selection (Cycle 133): drag a rectangle to select multiple points.
  // Falls back gracefully when no callback is provided.
  if (opts.onBrush) {
    let brushStart = null;
    let brushRect = null;
    const toVB = (e) => {
      const r = svgEl.getBoundingClientRect();
      return [(e.clientX - r.left) * (W / r.width), (e.clientY - r.top) * (H / r.height)];
    };
    svgEl.style.cursor = "crosshair";
    svgEl.addEventListener("mousedown", (e) => {
      // Don't start a brush when the user clicks an existing data point.
      if (e.target.tagName === "circle") return;
      const [vx, vy] = toVB(e);
      brushStart = [vx, vy];
      brushRect = el("rect", {
        x: vx, y: vy, width: 0, height: 0,
        fill: "rgba(37,99,235,0.15)", stroke: "#2563eb", "stroke-width": 1,
        "shape-rendering": "crispEdges",
      });
      svgEl.appendChild(brushRect);
      e.preventDefault();
    });
    svgEl.addEventListener("mousemove", (e) => {
      if (!brushStart || !brushRect) return;
      const [vx, vy] = toVB(e);
      const x = Math.min(brushStart[0], vx);
      const y = Math.min(brushStart[1], vy);
      brushRect.setAttribute("x", x);
      brushRect.setAttribute("y", y);
      brushRect.setAttribute("width", Math.abs(vx - brushStart[0]));
      brushRect.setAttribute("height", Math.abs(vy - brushStart[1]));
    });
    const finishBrush = () => {
      if (!brushStart || !brushRect) return;
      const rx = parseFloat(brushRect.getAttribute("x"));
      const ry = parseFloat(brushRect.getAttribute("y"));
      const rw = parseFloat(brushRect.getAttribute("width"));
      const rh = parseFloat(brushRect.getAttribute("height"));
      brushStart = null;
      // Below-threshold rectangle ⇒ treat as accidental click and skip.
      if (rw < 3 || rh < 3) {
        brushRect.remove(); brushRect = null;
        return;
      }
      const selected = new Set();
      for (const [vx, vy, fid] of pairs) {
        if (fid == null) continue;
        const cx = px(vx), cy = py(vy);
        if (cx >= rx && cx <= rx + rw && cy >= ry && cy <= ry + rh) selected.add(fid);
      }
      opts.onBrush(selected);
      // Keep the visual cue briefly so the user sees what was selected.
      setTimeout(() => { if (brushRect) { brushRect.remove(); brushRect = null; } }, 1200);
    };
    svgEl.addEventListener("mouseup", finishBrush);
    svgEl.addEventListener("mouseleave", finishBrush);
  }

  // Outlier labels: tag points whose value is outside Tukey 1.5×IQR fences
  // on either axis. Helps reading dense plots without hovering.
  // Label mode: "outliers" (default, Tukey IQR), "all", "none",
  // or "top-y" / "top-x" (Cycle 197) — label only the 10 highest by Y or X.
  const labelMode = ["all", "none", "top-y", "top-x"].includes(opts.labels)
    ? opts.labels
    : "outliers";
  // Pre-compute top-N index set when in top-y / top-x mode so the candidate
  // filter below is O(1) per pair. Cycle 199: N is now user-configurable.
  let topNSet = null;
  if (labelMode === "top-y" || labelMode === "top-x") {
    const requestedN = Number.isFinite(opts.labelTopN) ? Math.floor(opts.labelTopN) : 10;
    const N = Math.max(1, Math.min(50, requestedN));
    const useY = labelMode === "top-y";
    const idxs = pairs.map((_, i) => i)
      .filter(i => Number.isFinite(pairs[i][useY ? 1 : 0]));
    idxs.sort((a, b) =>
      useY ? pairs[b][1] - pairs[a][1] : pairs[b][0] - pairs[a][0]
    );
    topNSet = new Set(idxs.slice(0, N));
  }
  // Cycle 212: pinned points are always labelled, regardless of labelMode,
  // and decorated with a small ring so the user sees what's pinned at a glance.
  const pinned = opts.pinnedIds instanceof Set ? opts.pinnedIds : null;
  // Cycle 271: insertion-order array → quick #index lookup for pin numbering.
  const pinnedArr = pinned ? Array.from(pinned) : null;
  // Cycle 235: pin ring + bold label color is user-configurable (default red).
  const pinColor = typeof opts.pinColor === "string" && /^#[0-9a-f]{6}$/i.test(opts.pinColor)
    ? opts.pinColor : "#dc2626";
  if (names && (labelMode !== "none" || (pinned && pinned.size))) {
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
    const placed = []; // Bounding boxes of placed labels for collision detection
    const fontSize = labelMode === "all" ? 8 : 9;
    const fillColor = labelMode === "all" ? "#475569" : "#1e293b";
    const fontWeight = labelMode === "all" ? "500" : "600";
    // 8 candidate offsets around the point (Cycle 157 collision-avoidance):
    // NE, E, SE, S, SW, W, NW, N — order = preferred placement.
    const offsets = [
      { dx:  5, dy: -3, anchor: "start" },
      { dx:  6, dy:  3, anchor: "start" },
      { dx:  5, dy:  8, anchor: "start" },
      { dx:  0, dy: 10, anchor: "middle" },
      { dx: -5, dy:  8, anchor: "end" },
      { dx: -6, dy:  3, anchor: "end" },
      { dx: -5, dy: -3, anchor: "end" },
      { dx:  0, dy: -6, anchor: "middle" },
    ];
    const overlaps = (a, b) => !(a.x2 < b.x1 || b.x2 < a.x1 || a.y2 < b.y1 || b.y2 < a.y1);
    // Pre-filter candidates so the "outliers" path can keep its original order.
    const candidates = [];
    const pinRings = [];
    for (let i = 0; i < pairs.length; i++) {
      const [vx, vy, fid, nm] = pairs[i];
      if (!nm) continue;
      const isPinned = !!(pinned && fid != null && pinned.has(fid));
      const cx = pxAt(sx(vx)), cy = pyAt(sy(vy));
      if (isPinned) {
        // Always queue a label *and* a ring for pinned points.
        // Cycle 231: tag the entry so the renderer can paint pinned labels red.
        // Cycle 271: prefix the label with its 1-indexed pin number.
        const pinNo = pinnedArr ? pinnedArr.indexOf(fid) + 1 : 0;
        pinRings.push([cx, cy, pinNo]);
        candidates.push([cx, cy, pinNo > 0 ? `${pinNo}. ${nm}` : nm, true]);
        continue;
      }
      if (labelMode === "none") continue;
      if (labelMode === "outliers") {
        const isOutlier = vx < xLo || vx > xHi || vy < yLo || vy > yHi;
        if (!isOutlier) continue;
      } else if (topNSet && !topNSet.has(i)) {
        continue;
      }
      candidates.push([cx, cy, nm, false]);
    }
    // Draw pin rings underneath labels.
    for (const [cx, cy, pinNo] of pinRings) {
      const ring = el("circle", {
        cx: cx.toFixed(1), cy: cy.toFixed(1), r: 7,
        fill: "#ffffff", "fill-opacity": "0.85",
        stroke: pinColor, "stroke-width": "1.5",
        "stroke-dasharray": "2,1.5", "pointer-events": "none",
      });
      labels.appendChild(ring);
      // Cycle 271: show the 1-indexed pin order at the center of the ring.
      if (pinNo) {
        const numText = el("text", {
          x: cx.toFixed(1), y: (cy + 2).toFixed(1),
          "text-anchor": "middle", "font-size": "7", "font-weight": "700",
          fill: pinColor, "pointer-events": "none",
        });
        numText.textContent = String(pinNo);
        labels.appendChild(numText);
      }
    }
    // Cycle 229: label placement strategy.
    //   "auto"    — original 8-direction collision-avoidance (default)
    //   "corner"  — single NE offset; skip if it would overlap
    //   "overlap" — single NE offset; never skip (let labels stack)
    const placeMode = opts.labelPlace === "corner" || opts.labelPlace === "overlap"
      ? opts.labelPlace : "auto";
    const tryOffsets = placeMode === "auto" ? offsets : [offsets[0]];
    for (const [cx, cy, nm, isPinned] of candidates) {
      const approxW = Math.max(8, nm.length * fontSize * 0.6);
      let chosen = null;
      for (const o of tryOffsets) {
        const tx = cx + o.dx;
        const ty = cy + o.dy;
        const x1 = o.anchor === "end" ? tx - approxW : o.anchor === "middle" ? tx - approxW / 2 : tx;
        const bbox = { x1, x2: x1 + approxW, y1: ty - fontSize, y2: ty + 2 };
        if (placeMode === "overlap" || !placed.some(p => overlaps(p, bbox))) {
          chosen = { tx, ty, anchor: o.anchor, bbox };
          break;
        }
      }
      if (!chosen) continue;  // Position overlapped (auto/corner) — skip for readability
      const lbl = el("text", { x: chosen.tx, y: chosen.ty, "text-anchor": chosen.anchor });
      lbl.setAttribute("font-size", String(fontSize));
      // Cycle 231: pinned labels are painted red and slightly bolder so they
      // pop out of the default neutral palette in exported images.
      // Cycle 235: ring & label share the user-chosen pinColor.
      lbl.setAttribute("fill", isPinned ? pinColor : fillColor);
      lbl.setAttribute("font-weight", isPinned ? "700" : fontWeight);
      lbl.textContent = nm;
      labels.appendChild(lbl);
      // In overlap mode we still track bboxes so consumers can introspect,
      // but skipping the registration doesn't change visible behaviour.
      placed.push(chosen.bbox);
    }
    svgEl.appendChild(labels);
  }

  // X=0 / Y=0 zero reference lines (Cycle 158) — only when the axis range
  // crosses zero, and only in linear space (log axes don't include 0).
  if (opts.zeroLines) {
    if (!logX && xMin < 0 && xMax > 0) {
      svgEl.appendChild(el("line", {
        x1: pxAt(0), y1: PAD.top, x2: pxAt(0), y2: H - PAD.bottom,
        stroke: "#94a3b8", "stroke-width": 1, "stroke-dasharray": "3,2",
      }));
    }
    if (!logY && yMin < 0 && yMax > 0) {
      svgEl.appendChild(el("line", {
        x1: PAD.left, y1: pyAt(0), x2: W - PAD.right, y2: pyAt(0),
        stroke: "#94a3b8", "stroke-width": 1, "stroke-dasharray": "3,2",
      }));
    }
  }

  // Y=X reference line (Cycle 153) — clipped to the overlap of the X and Y
  // ranges. Drawn early so the regression line stays on top.
  if (opts.yEqualsX) {
    // Work in *scaled* (log-aware) coordinates: when log axes are active we
    // want the visual line to remain straight, so we project log(x)=log(y).
    const lo = Math.max(xMin, yMin);
    const hi = Math.min(xMax, yMax);
    if (hi > lo) {
      const ref = el("line", {
        x1: pxAt(lo), y1: pyAt(lo),
        x2: pxAt(hi), y2: pyAt(hi),
        stroke: "#94a3b8", "stroke-width": 1, "stroke-dasharray": "3,2",
      });
      svgEl.appendChild(ref);
    }
  }

  // LOWESS smoother (Cycle 178): non-parametric local trend, drawn before
  // the OLS line so the parametric line stays on top.
  if (opts.lowess) {
    const lwPts = lowessCurve(xs2, ys2, 0.5, 50);
    if (lwPts) {
      const pts = lwPts.map(([xv, yv]) => `${pxAt(xv).toFixed(1)},${pyAt(yv).toFixed(1)}`).join(" ");
      const poly = el("polyline", {
        points: pts,
        fill: "none", stroke: "#16a34a", "stroke-width": 1.6, opacity: 0.9, class: "regline-lowess",
      });
      svgEl.appendChild(poly);
    }
  }

  // OLS regression line in the *scaled* coordinate system so it stays
  // visually straight even on log axes. Pearson r is still on raw values.
  const r = pearson(x, y);
  let slope = null, intercept = null;
  let degree = 1;
  let polyCoeffsOut = null;
  if (Number.isFinite(r) && xMax !== xMin) {
    const olsR = ols(xs2, ys2);
    slope = olsR.slope; intercept = olsR.intercept;
    // Optional: 95% confidence band for the mean response. Drawn before the
    // line so the line sits cleanly on top. t = 1.96 (good for n >= 30,
    // slightly conservative for smaller n).
    if ((opts.regCI || opts.regPI) && xs2.length >= 3) {
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
        // Helper that emits a band polygon ("+ extra" adds 1 for prediction interval).
        const makeBand = (extra, fill) => {
          const upper = [];
          const lower = [];
          for (let i = 0; i <= STEPS; i++) {
            const xv = xMin + (i / STEPS) * (xMax - xMin);
            const ym = slope * xv + intercept;
            const half = t * se * Math.sqrt(extra + 1 / n + ((xv - mxs) ** 2) / sxx);
            upper.push([pxAt(xv), pyAt(ym + half)]);
            lower.push([pxAt(xv), pyAt(ym - half)]);
          }
          const pts = [...upper, ...lower.reverse()].map(p => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
          return el("polygon", { points: pts, fill, stroke: "none" });
        };
        // Draw PI first (wider, lighter) so the CI sits cleanly on top.
        if (opts.regPI) svgEl.appendChild(makeBand(1, "rgba(220,38,38,0.06)"));
        if (opts.regCI) svgEl.appendChild(makeBand(0, "rgba(220,38,38,0.12)"));
      }
    }
    // Polynomial regression curve (Cycle 127). Degree 1 keeps the existing
    // straight line; 2/3 draws a smooth polyline sampled across the x range.
    degree = Math.max(1, Math.min(3, opts.degree | 0 || 1));
    if (degree === 1) {
      const lineEl = el("line", {
        x1: pxAt(xMin), y1: pyAt(slope * xMin + intercept),
        x2: pxAt(xMax), y2: pyAt(slope * xMax + intercept),
        class: "regline",
      });
      svgEl.appendChild(lineEl);
      // Cycle 221: per-category regression lines for Simpson's-paradox checks.
      // Only when the color-by category map is active. Each line spans the
      // category's own x range, drawn as a dashed colored stroke.
      if (opts.regressionByGroup && catMap && categoryFor) {
        const groups = new Map();
        for (let i = 0; i < pairs.length; i++) {
          const fid = pairs[i][2];
          if (fid == null) continue;
          const cat = categoryFor(fid);
          if (cat == null || cat === "") continue;
          const key = String(cat);
          if (!groups.has(key)) groups.set(key, { xs: [], ys: [] });
          groups.get(key).xs.push(xs2[i]);
          groups.get(key).ys.push(ys2[i]);
        }
        for (const [cat, gd] of groups) {
          if (gd.xs.length < 3) continue;
          const reg = ols(gd.xs, gd.ys);
          if (!Number.isFinite(reg.slope) || !Number.isFinite(reg.intercept)) continue;
          const gXmin = Math.min(...gd.xs), gXmax = Math.max(...gd.xs);
          if (gXmin === gXmax) continue;
          const color = catMap.get(cat) || catMap.get("__other__") || "#475569";
          const ln = el("line", {
            x1: pxAt(gXmin), y1: pyAt(reg.slope * gXmin + reg.intercept),
            x2: pxAt(gXmax), y2: pyAt(reg.slope * gXmax + reg.intercept),
            stroke: color, "stroke-width": "1.3", "stroke-dasharray": "4 2", opacity: "0.85",
            class: "regline-group",
          });
          svgEl.appendChild(ln);
        }
      }
    } else {
      const polyCoeffs = polyfit(xs2, ys2, degree);
      if (polyCoeffs) {
        polyCoeffsOut = polyCoeffs;
        const STEPS = 60;
        const pts = [];
        for (let i = 0; i <= STEPS; i++) {
          const xv = xMin + (i / STEPS) * (xMax - xMin);
          pts.push(`${pxAt(xv).toFixed(1)},${pyAt(polyEval(polyCoeffs, xv)).toFixed(1)}`);
        }
        const poly = el("polyline", {
          points: pts.join(" "),
          fill: "none", stroke: "#dc2626", "stroke-width": 1.4, class: "regline",
        });
        svgEl.appendChild(poly);
        // Stash for the equation overlay below.
        svgEl.__polyCoeffs = polyCoeffs;
      }
    }
  }
  // Compute SSE / R² / AIC / BIC for the chosen model. For degree 1 we already
  // have slope/intercept; for higher degrees use polyCoeffs.
  let modelStats = { degree: degree, sse: null, polyR2: null, aic: null, bic: null, coeffs: null };
  if (slope != null && xs2.length >= degree + 2) {
    const nObs = xs2.length;
    const predict = polyCoeffsOut
      ? (xv) => polyEval(polyCoeffsOut, xv)
      : (xv) => slope * xv + intercept;
    const my = ys2.reduce((a, b) => a + b, 0) / nObs;
    let sse = 0, sst = 0;
    for (let i = 0; i < nObs; i++) {
      const e = ys2[i] - predict(xs2[i]);
      sse += e * e;
      sst += (ys2[i] - my) ** 2;
    }
    const k = degree + 1; // number of fitted parameters
    const polyR2 = sst > 0 ? 1 - sse / sst : null;
    let aic = null, bic = null;
    if (sse > 0) {
      // AIC = n·ln(SSE/n) + 2k ;  BIC = n·ln(SSE/n) + k·ln(n)
      const lnVar = Math.log(sse / nObs);
      aic = nObs * lnVar + 2 * k;
      bic = nObs * lnVar + k * Math.log(nObs);
    }
    modelStats = {
      degree, sse, polyR2, aic, bic,
      coeffs: polyCoeffsOut ? polyCoeffsOut.slice() : [intercept, slope],
    };
  }

  // Regression equation text overlay (top-right corner of the chart)
  if (Number.isFinite(r) && slope != null) {
    const sym = (v) => {
      if (Math.abs(v) >= 100) return v.toFixed(0);
      if (Math.abs(v) >= 1)   return v.toFixed(2);
      return v.toExponential(2);
    };
    let eq;
    let r2;
    const polyCoeffs = svgEl.__polyCoeffs;
    if (polyCoeffs && polyCoeffs.length > 2) {
      // Show poly equation y = c0 + c1·x + c2·x² (+ c3·x³)
      const terms = polyCoeffs.map((c, i) => {
        const abs = sym(Math.abs(c));
        const x = i === 0 ? "" : i === 1 ? "x" : `x${["", "", "²", "³"][i]}`;
        return { sign: c >= 0 ? "+" : "−", abs, x };
      });
      eq = terms.map((t, i) => i === 0
        ? `${t.sign === "−" ? "−" : ""}${t.abs}${t.x}`
        : ` ${t.sign} ${t.abs}${t.x}`
      ).join("");
      eq = `y = ${eq}`;
      // Compute R² from polynomial residuals
      let sse = 0, sst = 0;
      const my = ys2.reduce((a, b) => a + b, 0) / ys2.length;
      for (let i = 0; i < xs2.length; i++) {
        const yhat = polyEval(polyCoeffs, xs2[i]);
        sse += (ys2[i] - yhat) ** 2;
        sst += (ys2[i] - my) ** 2;
      }
      r2 = sst > 0 ? 1 - sse / sst : null;
      delete svgEl.__polyCoeffs;
    } else {
      const sign = intercept >= 0 ? "+" : "−";
      eq = logX || logY
        ? `(log) y = ${sym(slope)}x ${sign} ${sym(Math.abs(intercept))}`
        : `y = ${sym(slope)}x ${sign} ${sym(Math.abs(intercept))}`;
      r2 = r * r;
    }
    const eqEl = el("text", {
      x: W - PAD.right - 4, y: PAD.top + 9,
      "text-anchor": "end",
      "font-family": "ui-monospace, monospace",
      "font-size": 9, fill: "#dc2626", "font-weight": 600,
    });
    eqEl.textContent = r2 == null ? eq : `${eq}   R²=${r2.toFixed(3)}`;
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

  // Cycle 220: shape legend (top-left), shown only when shape-by is active.
  // Positioned away from the series color legend (top-right) and size legend
  // (bottom-left) so all three can coexist.
  if (Array.isArray(opts.shapeLegend) && opts.shapeLegend.length) {
    const items = opts.shapeLegend.slice(0, 5);
    const lg = el("g", { class: "scatter-shape-legend" });
    const lineH = 12;
    const x0 = PAD.left + 4;
    const y0 = PAD.top + 4;
    const boxW = 92, boxH = items.length * lineH + 8;
    lg.appendChild(el("rect", {
      x: x0, y: y0, width: boxW, height: boxH,
      fill: "rgba(255,255,255,0.85)", stroke: "#cbd5e1", "stroke-width": 0.6, rx: 3,
    }));
    items.forEach((it, i) => {
      const cy = y0 + 6 + i * lineH + 4;
      const m = makeMarker(it.shape, x0 + 10, cy, 4);
      m.setAttribute("fill", "#475569");
      m.setAttribute("fill-opacity", "0.85");
      m.setAttribute("stroke", "#1e293b");
      m.setAttribute("stroke-width", "0.6");
      lg.appendChild(m);
      const t = el("text", {
        x: x0 + 20, y: cy + 3, "font-size": 9, fill: "#1e293b",
      });
      const label = String(it.name || "");
      t.textContent = label.length > 13 ? label.slice(0, 12) + "…" : label;
      lg.appendChild(t);
    });
    svgEl.appendChild(lg);
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
  // Size (bubble) legend — only when a third variable drives point radius.
  if (opts.sizeLegend && opts.sizeLegend.fieldName && Number.isFinite(opts.sizeLegend.min)) {
    const sl = opts.sizeLegend;
    const fmt = (v) => {
      const a = Math.abs(v);
      if (a >= 1e6) return (v / 1e6).toFixed(1) + "M";
      if (a >= 1e3) return (v / 1e3).toFixed(0) + "k";
      if (a >= 1) return v.toFixed(0);
      return v.toFixed(2);
    };
    const lg = el("g", { class: "scatter-size-legend" });
    const radii = [3, 6.5, 10];
    const vals = [sl.min, (sl.min + sl.max) / 2, sl.max];
    const padX = 6, padY = 4;
    const x0 = PAD.left + 4;
    const y0 = H - PAD.bottom - 4;
    const boxW = 80, boxH = 56;
    const bg = el("rect", {
      x: x0, y: y0 - boxH, width: boxW, height: boxH,
      fill: "rgba(255,255,255,0.85)", stroke: "#cbd5e1", "stroke-width": 0.6, rx: 3,
    });
    lg.appendChild(bg);
    const title = el("text", {
      x: x0 + padX, y: y0 - boxH + 10, "font-size": 9, "font-weight": 700, fill: "#1e293b",
    });
    title.textContent = sl.fieldName.length > 11 ? sl.fieldName.slice(0, 10) + "…" : sl.fieldName;
    lg.appendChild(title);
    // Sample bubbles arranged in a column
    radii.forEach((r0, i) => {
      const cy = y0 - boxH + 22 + i * 12;
      const cx = x0 + padX + 10;
      lg.appendChild(el("circle", {
        cx, cy, r: r0,
        fill: "rgba(37,99,235,0.4)", stroke: "#1e3a8a", "stroke-width": 0.5,
      }));
      const t = el("text", {
        x: cx + 14, y: cy + 3, "font-size": 8, fill: "#1e293b",
      });
      t.textContent = fmt(vals[i]);
      lg.appendChild(t);
    });
    svgEl.appendChild(lg);
  }

  // Cycle 227: optional statistics subtitle drawn inside the SVG so PNG/SVG
  // exports carry n / r / R² without the user having to caption the image.
  if (opts.titleStats && Number.isFinite(r) && nValid >= 2) {
    const r2pct = (r * r * 100).toFixed(1);
    const t = el("text", {
      x: PAD.left + (W - PAD.left - PAD.right) / 2,
      y: 8,
      "text-anchor": "middle",
      "font-size": 9, "font-weight": 600, fill: "#475569",
    });
    t.textContent = `n=${nValid}  r=${r.toFixed(3)}  R²=${r2pct}%`;
    svgEl.appendChild(t);
  }

  return {
    r, rho, rCI, rhoCI, n: nValid, slope, intercept,
    r2: Number.isFinite(r) ? r*r : null,
    degree: modelStats.degree,
    coeffs: modelStats.coeffs,
    polyR2: modelStats.polyR2,
    sse: modelStats.sse,
    aic: modelStats.aic,
    bic: modelStats.bic,
  };
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

// Polynomial regression of arbitrary degree d (1..3 in our UI). Returns
// coefficients [c0, c1, ..., cd] where ŷ = c0 + c1·x + c2·x² + ... Solves the
// normal equations (X'X) β = X'y via Gaussian elimination with partial pivoting.
export function polyfit(xs, ys, d) {
  const n = xs.length;
  if (n < d + 1) return null;
  const m = d + 1;
  // moments[k] = Σ x^k for k = 0..2d
  const mom = new Array(2 * d + 1).fill(0);
  for (let i = 0; i < n; i++) {
    let xp = 1;
    for (let k = 0; k <= 2 * d; k++) { mom[k] += xp; xp *= xs[i]; }
  }
  // rhs[k] = Σ y·x^k for k = 0..d
  const rhs = new Array(m).fill(0);
  for (let i = 0; i < n; i++) {
    let xp = 1;
    for (let k = 0; k < m; k++) { rhs[k] += ys[i] * xp; xp *= xs[i]; }
  }
  // Build augmented matrix [X'X | X'y]
  const A = Array.from({ length: m }, (_, i) =>
    Array.from({ length: m + 1 }, (_, j) => j < m ? mom[i + j] : rhs[i])
  );
  // Gaussian elimination with partial pivoting
  for (let i = 0; i < m; i++) {
    let pivot = i;
    for (let r = i + 1; r < m; r++) if (Math.abs(A[r][i]) > Math.abs(A[pivot][i])) pivot = r;
    if (pivot !== i) { [A[i], A[pivot]] = [A[pivot], A[i]]; }
    if (Math.abs(A[i][i]) < 1e-12) return null;
    for (let r = i + 1; r < m; r++) {
      const f = A[r][i] / A[i][i];
      for (let c = i; c <= m; c++) A[r][c] -= f * A[i][c];
    }
  }
  // Back substitution
  const coeffs = new Array(m).fill(0);
  for (let i = m - 1; i >= 0; i--) {
    let s = A[i][m];
    for (let j = i + 1; j < m; j++) s -= A[i][j] * coeffs[j];
    coeffs[i] = s / A[i][i];
  }
  return coeffs;
}
// LOWESS smoother (Cycle 178). Returns an array of [x, y] points along the
// X range smoothed by locally weighted linear regression with tricube
// weights. bandwidth ∈ (0, 1] controls window size as a fraction of n.
function lowessCurve(xs, ys, bandwidth = 0.5, steps = 50) {
  const n = xs.length;
  if (n < 4) return null;
  const K = Math.max(3, Math.min(n, Math.ceil(bandwidth * n)));
  const xMin = Math.min(...xs), xMax = Math.max(...xs);
  if (xMax === xMin) return null;
  const pairs = xs.map((x, i) => ({ x, y: ys[i] }));
  const out = [];
  for (let s = 0; s <= steps; s++) {
    const xq = xMin + (s / steps) * (xMax - xMin);
    // K nearest by |x - xq|
    pairs.sort((a, b) => Math.abs(a.x - xq) - Math.abs(b.x - xq));
    const window = pairs.slice(0, K);
    const maxDist = Math.max(...window.map(p => Math.abs(p.x - xq))) || 1e-9;
    let sw = 0, swx = 0, swy = 0, swxx = 0, swxy = 0;
    for (const p of window) {
      const u = Math.abs(p.x - xq) / maxDist;
      if (u >= 1) continue;
      const w = (1 - u * u * u) ** 3;
      sw += w; swx += w * p.x; swy += w * p.y;
      swxx += w * p.x * p.x; swxy += w * p.x * p.y;
    }
    if (sw === 0) continue;
    const meanX = swx / sw, meanY = swy / sw;
    const denom = swxx / sw - meanX * meanX;
    const slope = denom > 0 ? (swxy / sw - meanX * meanY) / denom : 0;
    const yq = meanY + slope * (xq - meanX);
    out.push([xq, yq]);
  }
  return out.length > 1 ? out : null;
}

function polyEval(coeffs, x) {
  // Horner's method
  let r = 0;
  for (let i = coeffs.length - 1; i >= 0; i--) r = r * x + coeffs[i];
  return r;
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
// Cycle 219: build a marker of the requested shape centered at (cx,cy) with
// "radius" r (square: half-side; cross: half-width). Returns an SVGElement
// styled like the original circle marker so downstream code stays valid.
function makeMarker(shape, cx, cy, r, cls = "point") {
  if (!shape || shape === "circle") {
    return el("circle", { cx, cy, r, class: cls });
  }
  if (shape === "square") {
    return el("rect", { x: cx - r, y: cy - r, width: r * 2, height: r * 2, class: cls });
  }
  if (shape === "triangle") {
    return el("polygon", {
      class: cls,
      points: `${cx},${cy - r} ${cx + r},${cy + r} ${cx - r},${cy + r}`,
    });
  }
  if (shape === "diamond") {
    return el("polygon", {
      class: cls,
      points: `${cx},${cy - r} ${cx + r},${cy} ${cx},${cy + r} ${cx - r},${cy}`,
    });
  }
  if (shape === "cross") {
    const a = r * 0.4, b = r;
    return el("polygon", {
      class: cls,
      points:
        `${cx - a},${cy - b} ${cx + a},${cy - b} ${cx + a},${cy - a} ` +
        `${cx + b},${cy - a} ${cx + b},${cy + a} ${cx + a},${cy + a} ` +
        `${cx + a},${cy + b} ${cx - a},${cy + b} ${cx - a},${cy + a} ` +
        `${cx - b},${cy + a} ${cx - b},${cy - a} ${cx - a},${cy - a}`,
    });
  }
  return el("circle", { cx, cy, r, class: cls });
}
function text(x, y, t, anchor, extra = {}) {
  const node = el("text", { x, y, "text-anchor": anchor || "start", ...extra });
  node.textContent = t;
  return node;
}
