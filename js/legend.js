// =====================================================================
// legend.js  -- Build the legend DOM from breaks + colors
// =====================================================================

import { formatNum, extractUnit } from "./stats.js";

// Format a single break value: extreme magnitudes get special treatment so
// the legend never overflows. Falls back to the shared formatNum() helper.
function formatBreak(v) {
  if (v == null || !Number.isFinite(v)) return formatNum(v);
  const abs = Math.abs(v);
  if (abs >= 100000) return Math.round(v).toLocaleString("ja-JP");
  if (abs > 0 && abs < 0.001) return v.toExponential(2);
  return formatNum(v);
}

// Strip the trailing "(unit)" / "（unit）" portion from a title.
function stripUnitParen(title) {
  return title.replace(/[(（][^)）]+[)）]\s*$/u, "").trim();
}

export function renderLegend(container, breaks, colors, options = {}) {
  container.innerHTML = "";
  if (!breaks.length || !colors.length) return;

  const title = options.title;
  const unit  = title ? extractUnit(title) : "";
  const k     = colors.length;

  // Accessibility: announce the legend as an image-region with a label.
  container.setAttribute("role", "img");
  container.setAttribute("aria-label", `凡例: ${title || ""}`.trim());

  if (title) {
    const t = document.createElement("div");
    t.style.fontWeight = "600";
    t.style.marginBottom = "2px";
    // If the title contains a unit in parentheses, render "<name>（単位: <unit>）"
    t.textContent = unit ? `${stripUnitParen(title)}（単位: ${unit}）` : title;
    container.appendChild(t);

    const sub = document.createElement("div");
    sub.style.fontSize = "11px";
    sub.style.opacity = "0.7";
    sub.style.marginBottom = "4px";
    sub.textContent = `${k}階級`;
    container.appendChild(sub);
  }

  const onClassHover = typeof options.onClassHover === "function"
    ? options.onClassHover
    : null;

  for (let i = k - 1; i >= 0; i--) {
    const lo = breaks[i];
    const hi = breaks[i + 1];
    const row = document.createElement("div");
    row.className = "legend-row";
    row.dataset.classIndex = String(i);
    const sw = document.createElement("span");
    sw.className = "legend-swatch";
    sw.style.background = colors[i];
    sw.title = "ダブルクリックで色を変更";
    sw.style.cursor = "pointer";
    if (typeof options.onColorPick === "function") {
      sw.addEventListener("dblclick", () => {
        const inp = document.createElement("input");
        inp.type = "color";
        inp.value = colors[i].length === 7 ? colors[i] : "#888888";
        inp.style.position = "fixed";
        inp.style.left = "-100px";
        document.body.appendChild(inp);
        inp.addEventListener("change", () => {
          options.onColorPick(i, inp.value);
          inp.remove();
        }, { once: true });
        inp.click();
      });
    }
    const label = document.createElement("span");
    const range = `${formatBreak(lo)} 〜 ${formatBreak(hi)}`;
    label.textContent = unit ? `${range} ${unit}` : range;
    // Per-class count (MANDARA classic feature) — shows how data is distributed
    // across the chosen classification. Helps spot empty or overstuffed classes.
    if (options.classCounts && Number.isFinite(options.classCounts[i])) {
      const c = document.createElement("small");
      c.className = "legend-count";
      c.textContent = ` (${options.classCounts[i]}件)`;
      c.style.color = "var(--muted)";
      c.style.marginLeft = "4px";
      if (typeof options.onClassClick === "function") {
        c.style.cursor = "pointer";
        c.title = "クリックで該当地域をクリップボードへコピー";
        c.style.textDecoration = "underline dotted";
        c.addEventListener("click", (e) => {
          e.stopPropagation();
          options.onClassClick(i);
        });
      }
      label.appendChild(c);
    }
    if (typeof options.onBreakEdit === "function") {
      label.title = "ダブルクリックで上限値を編集";
      label.style.cursor = "text";
      label.addEventListener("dblclick", (e) => {
        e.stopPropagation();
        const inp = document.createElement("input");
        inp.type = "number";
        inp.value = hi;
        inp.step = "any";
        inp.style.cssText = "width: 70px; padding: 1px 2px; font-size: 11px;";
        label.replaceWith(inp);
        inp.focus(); inp.select();
        const commit = (save) => {
          if (save) {
            const v = parseFloat(inp.value);
            if (Number.isFinite(v)) options.onBreakEdit(i, v);
          }
        };
        inp.addEventListener("blur", () => commit(true));
        inp.addEventListener("keydown", (k) => {
          if (k.key === "Enter") { commit(true); inp.blur(); }
          else if (k.key === "Escape") { inp.blur(); }
        });
      });
    }
    row.appendChild(sw);
    row.appendChild(label);
    if (onClassHover) {
      row.addEventListener("mouseenter", (ev) => {
        const idx = Number(ev.currentTarget.dataset.classIndex);
        onClassHover(idx, ev);
      });
    }
    container.appendChild(row);
  }

  // N/A row
  if (options.showNA) {
    const row = document.createElement("div");
    row.className = "legend-row legend-na";
    const sw = document.createElement("span");
    sw.className = "legend-swatch";
    const label = document.createElement("span");
    label.textContent = "データなし";
    row.appendChild(sw);
    row.appendChild(label);
    container.appendChild(row);
  }
}
