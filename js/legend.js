// =====================================================================
// legend.js  -- Build the legend DOM from breaks + colors
// =====================================================================

import { formatNum } from "./stats.js";

export function renderLegend(container, breaks, colors, options = {}) {
  container.innerHTML = "";
  if (!breaks.length || !colors.length) return;

  const title = options.title;
  if (title) {
    const t = document.createElement("div");
    t.style.fontWeight = "600";
    t.style.marginBottom = "4px";
    t.textContent = title;
    container.appendChild(t);
  }

  const k = colors.length;
  // breaks length = k + 1
  // Show rows from high → low (typical thematic-map convention)
  for (let i = k - 1; i >= 0; i--) {
    const lo = breaks[i];
    const hi = breaks[i + 1];
    const row = document.createElement("div");
    row.className = "legend-row";
    const sw = document.createElement("span");
    sw.className = "legend-swatch";
    sw.style.background = colors[i];
    const label = document.createElement("span");
    label.textContent = `${formatNum(lo)} 〜 ${formatNum(hi)}`;
    row.appendChild(sw);
    row.appendChild(label);
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
