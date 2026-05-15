// =====================================================================
// export.js  -- Export the current map view as PNG or SVG (no server)
// =====================================================================

/**
 * Use html-to-image to capture the live map div as a PNG.
 */
export async function exportPng(mapEl, filename = "mandara_map.png") {
  if (typeof htmlToImage === "undefined") {
    alert("html-to-image ライブラリの読み込みに失敗しました。ネットワーク接続を確認してください。");
    return;
  }
  // The leaflet panes can have transform: translate3d → captured fine by html-to-image.
  // We embed CORS-friendly tiles only (OSM, GSI). filter() drops controls if desired.
  const dataUrl = await htmlToImage.toPng(mapEl, {
    cacheBust: true,
    pixelRatio: 2,
    backgroundColor: "#ffffff",
    filter: (node) => {
      // Exclude leaflet zoom/layer controls from the export, keep attribution.
      if (node.classList && (
        node.classList.contains("leaflet-control-zoom") ||
        node.classList.contains("leaflet-control-layers")
      )) return false;
      return true;
    },
  });
  triggerDownload(dataUrl, filename);
}

/**
 * Export *only the choropleth layer* as a clean SVG with simplified shapes.
 * Useful for further editing in Illustrator / Inkscape.
 * Inputs come from the live Leaflet layer's per-feature styles.
 */
export async function exportSvg({ geojson, valueMap, breaks, colors, naColor = "#e5e7eb", title }, filename = "mandara_map.svg") {
  const { classifyValue } = await import("./classification.js");

  // Use a simple equirectangular projection then scale to a viewBox.
  const W = 1000;
  const H = 1000;
  // Determine bbox
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const f of geojson.features) {
    iterCoords(f.geometry, (lon, lat) => {
      if (lon < minX) minX = lon;
      if (lon > maxX) maxX = lon;
      if (lat < minY) minY = lat;
      if (lat > maxY) maxY = lat;
    });
  }
  const sx = W / (maxX - minX);
  const sy = H / (maxY - minY);
  const s = Math.min(sx, sy);
  const offX = (W - (maxX - minX) * s) / 2;
  const offY = (H - (maxY - minY) * s) / 2;
  const px = (lon) => offX + (lon - minX) * s;
  const py = (lat) => offY + (maxY - lat) * s;

  const parts = [];
  parts.push(`<?xml version="1.0" encoding="UTF-8"?>`);
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">`);
  parts.push(`<rect width="${W}" height="${H}" fill="#ffffff"/>`);

  if (title) {
    parts.push(`<text x="${W/2}" y="36" text-anchor="middle" font-family="sans-serif" font-size="22" font-weight="700" fill="#1e293b">${escapeXml(title)}</text>`);
  }

  // Legend rendered top-right
  if (breaks && colors && breaks.length === colors.length + 1) {
    const lx = W - 180, ly = 60, lw = 18, lh = 18;
    parts.push(`<g font-family="sans-serif" font-size="12" fill="#1e293b">`);
    for (let i = colors.length - 1; i >= 0; i--) {
      const y = ly + (colors.length - 1 - i) * (lh + 2);
      parts.push(`<rect x="${lx}" y="${y}" width="${lw}" height="${lh}" fill="${colors[i]}" stroke="#94a3b8"/>`);
      const label = formatRange(breaks[i], breaks[i + 1]);
      parts.push(`<text x="${lx + lw + 6}" y="${y + lh - 4}">${escapeXml(label)}</text>`);
    }
    parts.push(`</g>`);
  }

  for (const f of geojson.features) {
    const code = f.properties.id;
    const v = valueMap ? valueMap.get(code) : null;
    let fill = naColor;
    if (valueMap && breaks && colors && v != null && Number.isFinite(v)) {
      const idx = classifyValue(v, breaks);
      fill = idx < 0 ? naColor : colors[idx];
    }
    const d = geomToPath(f.geometry, px, py);
    const name = f.properties.nam_ja || f.properties.nam || `#${code}`;
    parts.push(`<path d="${d}" fill="${fill}" fill-rule="evenodd" stroke="#475569" stroke-width="0.5"><title>${escapeXml(name)}</title></path>`);
  }
  parts.push(`</svg>`);

  const blob = new Blob([parts.join("\n")], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);
  triggerDownload(url, filename);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function triggerDownload(url, filename) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function iterCoords(geom, fn) {
  if (!geom) return;
  if (geom.type === "Polygon") {
    for (const ring of geom.coordinates) for (const [lon, lat] of ring) fn(lon, lat);
  } else if (geom.type === "MultiPolygon") {
    for (const poly of geom.coordinates)
      for (const ring of poly) for (const [lon, lat] of ring) fn(lon, lat);
  }
}

function geomToPath(geom, px, py) {
  if (!geom) return "";
  if (geom.type === "Polygon") return polygonToPath(geom.coordinates, px, py);
  if (geom.type === "MultiPolygon") return geom.coordinates.map(p => polygonToPath(p, px, py)).join(" ");
  return "";
}
function polygonToPath(rings, px, py) {
  return rings.map(ring => {
    const cmds = ring.map(([lon, lat], i) => `${i === 0 ? "M" : "L"}${px(lon).toFixed(2)},${py(lat).toFixed(2)}`);
    return cmds.join("") + "Z";
  }).join(" ");
}

function formatRange(lo, hi) {
  const f = (v) => {
    if (!Number.isFinite(v)) return "—";
    const abs = Math.abs(v);
    if (abs >= 1000) return v.toLocaleString("ja-JP", { maximumFractionDigits: 0 });
    if (Number.isInteger(v)) return String(v);
    return Number(v.toFixed(3)).toString();
  };
  return `${f(lo)} 〜 ${f(hi)}`;
}

function escapeXml(s) {
  return String(s ?? "").replace(/[&<>"']/g, ch => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;"
  }[ch]));
}
