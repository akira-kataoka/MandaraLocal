// =====================================================================
// map.js  -- Leaflet map setup + GeoJSON choropleth layer
// =====================================================================

import { classifyValue } from "./classification.js";
import { formatNum, extractUnit } from "./stats.js";

const NA_COLOR = "#e5e7eb"; // grey for missing values
const HOVER_OUTLINE = "#111827";

const MAP_INIT_CENTER = [37.5, 137.5];
const MAP_INIT_ZOOM = 5;

export class MandaraMap {
  constructor(elId, tooltipEl) {
    this.map = L.map(elId, {
      center: MAP_INIT_CENTER,
      zoom: MAP_INIT_ZOOM,
      minZoom: 4,
      maxZoom: 12,
      // SVG rendering for <500 polygons; hover styling and bringToFront work cleanly.
      // For city-level (>1000 polygons) switch to preferCanvas: true.
      preferCanvas: false,
      zoomControl: true,
      attributionControl: true,
    });

    // Free tile providers — pick OSM as default.
    // 地理院タイル (Japan) is also free; we add a base layer selector.
    const osm = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    });
    const gsiPale = L.tileLayer("https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png", {
      maxZoom: 18,
      attribution: '出典: <a href="https://maps.gsi.go.jp/development/ichiran.html">地理院タイル</a>',
    });
    const gsiBlank = L.tileLayer("https://cyberjapandata.gsi.go.jp/xyz/blank/{z}/{x}/{y}.png", {
      maxZoom: 14,
      attribution: '出典: <a href="https://maps.gsi.go.jp/development/ichiran.html">地理院白地図</a>',
    });
    gsiPale.addTo(this.map);

    L.control.layers(
      { "地理院 淡色": gsiPale, "OpenStreetMap": osm, "白地図 (地理院)": gsiBlank },
      {},
      { position: "topleft", collapsed: true }
    ).addTo(this.map);

    this.tooltipEl = tooltipEl;
    this.layer = null;
    this._lookupFn = null;     // (code) -> {value, classIndex, color}
    this._fieldName = "";
    this._mapEl = document.getElementById(elId);
    this.symbolLayer = L.layerGroup().addTo(this.map);
    this._centroidCache = new Map(); // code -> [lat, lng]
    // Default: prefecture mode props
    this._nameFor = (props) => props.nam_ja || props.nam || `#${props.id}`;
  }

  /**
   * @param geojson  GeoJSON FeatureCollection with properties.id present
   * @param opts.nameFor (props) => string  -- override per-feature display name
   * @param opts.canvas {boolean} -- use Canvas renderer (much faster for >500 polygons)
   */
  setBaseGeo(geojson, opts = {}) {
    if (opts.nameFor) this._nameFor = opts.nameFor;
    if (this.layer) {
      this.map.removeLayer(this.layer);
      this.layer = null;
    }
    this.symbolLayer.clearLayers();
    const useCanvas = opts.canvas ?? (geojson.features.length > 500);
    const layerOpts = {
      style: () => this._defaultStyle(),
      onEachFeature: (feat, lyr) => this._bindInteractions(feat, lyr),
    };
    if (useCanvas) layerOpts.renderer = L.canvas({ padding: 0.5 });
    this.layer = L.geoJSON(geojson, layerOpts).addTo(this.map);
    // Always keep symbol layer (proportional circles, dots) above polygons.
    this.map.removeLayer(this.symbolLayer);
    this.symbolLayer.addTo(this.map);

    // Pre-compute approximate centroids for proportional symbols
    this._centroidCache.clear();
    for (const f of geojson.features) {
      const c = featureCentroid(f);
      if (c) this._centroidCache.set(f.properties.id, c);
    }

    try { this.map.fitBounds(this.layer.getBounds(), { padding: [10, 10] }); } catch (_) {}
  }

  _defaultStyle() {
    return {
      weight: 0.6,
      color: "#475569",
      fillColor: NA_COLOR,
      fillOpacity: 0.85,
    };
  }

  _bindInteractions(feature, lyr) {
    lyr.on("mouseover", (e) => {
      // Only thicken the outline. Leaflet's setStyle merges options, so the
      // existing fillColor / fillOpacity are preserved.
      lyr.setStyle({ weight: 2, color: HOVER_OUTLINE });
      // NOTE: do NOT bringToFront() here — it raises this polygon above the
      // symbolLayer/circle markers, making them disappear visually.
      // Outline weight alone is enough for hover emphasis.
      this._showTooltip(feature, e);
      if (this._hoverHandler) this._hoverHandler(feature.properties.id, true);
    });
    lyr.on("mousemove", (e) => this._showTooltip(feature, e));
    lyr.on("click", () => {
      if (this._clickHandler) this._clickHandler(feature.properties.id, feature.properties);
    });
    lyr.on("mouseout", () => {
      // Revert outline only — never call resetStyle() here, that would
      // repaint with the gray defaultStyle and erase the choropleth color.
      if (this._lookupFn) {
        const info = this._lookupFn(feature.properties.id);
        lyr.setStyle({ weight: 0.6, color: "#475569", fillColor: info.color, fillOpacity: 0.88 });
      } else {
        lyr.setStyle({ weight: 0.6, color: "#475569" });
      }
      this._hideTooltip();
      if (this._hoverHandler) this._hoverHandler(feature.properties.id, false);
    });
  }

  _showTooltip(feature, e) {
    if (!this.tooltipEl) return;
    const code = feature.properties.id;
    const name = this._nameFor(feature.properties);
    let valueText = "";
    if (this._lookupFn) {
      const info = this._lookupFn(code);
      const unit = extractUnit(this._fieldName);
      if (info && info.value != null) {
        valueText = ` <span class="val">${formatNum(info.value)}${unit ? " " + escapeHtml(unit) : ""}</span>`;
      } else {
        valueText = ` <span class="val">—</span>`;
      }
    }
    const fieldText = this._fieldName ? `<br/><small>${escapeHtml(this._fieldName)}</small>` : "";
    this.tooltipEl.innerHTML = `<strong>${escapeHtml(name)}</strong>${valueText}${fieldText}`;
    this.tooltipEl.hidden = false;

    const rect = this._mapEl.getBoundingClientRect();
    this.tooltipEl.style.left = (e.originalEvent.clientX - rect.left) + "px";
    this.tooltipEl.style.top  = (e.originalEvent.clientY - rect.top) + "px";
  }

  _hideTooltip() {
    if (!this.tooltipEl) return;
    this.tooltipEl.hidden = true;
  }

  /**
   * Apply choropleth colors.
   * @param valueMap  Map<prefCode, number|null>
   * @param breaks   number[]  length = classes+1
   * @param colors   string[]  length = classes
   * @param fieldName string
   */
  applyChoropleth(valueMap, breaks, colors, fieldName) {
    if (!this.layer) return;
    this._fieldName = fieldName || "";
    this._lookupFn = (code) => {
      const v = valueMap.get(code);
      if (v == null || !Number.isFinite(v)) {
        return { value: null, classIndex: -1, color: NA_COLOR };
      }
      const idx = classifyValue(v, breaks);
      return { value: v, classIndex: idx, color: idx < 0 ? NA_COLOR : colors[idx] };
    };
    this.layer.eachLayer((lyr) => {
      const feat = lyr.feature;
      const info = this._lookupFn(feat.properties.id);
      lyr.setStyle({
        weight: 0.6,
        color: "#475569",
        fillColor: info.color,
        fillOpacity: 0.88,
      });
    });
  }

  resetColors() {
    if (!this.layer) return;
    this._lookupFn = null;
    this._fieldName = "";
    this.layer.eachLayer((lyr) => lyr.setStyle(this._defaultStyle()));
  }

  /**
   * Render proportional circle symbols over the choropleth.
   * radius = sqrt(value / maxValue) * maxRadiusPx
   * @param valueMap Map<prefCode, number|null>
   * @param opts { maxRadiusPx, color, fillOpacity }
   */
  applyProportionalSymbols(valueMap, opts = {}) {
    this.symbolLayer.clearLayers();
    if (!valueMap) return;
    const maxR = opts.maxRadiusPx ?? 32;
    const color = opts.color ?? "#1d4ed8";
    const fillOpacity = opts.fillOpacity ?? 0.55;

    let maxVal = 0;
    for (const v of valueMap.values()) {
      if (Number.isFinite(v) && v > maxVal) maxVal = v;
    }
    if (maxVal <= 0) return;

    for (const [code, v] of valueMap.entries()) {
      if (!Number.isFinite(v) || v <= 0) continue;
      const c = this._centroidCache.get(code);
      if (!c) continue;
      const r = Math.sqrt(v / maxVal) * maxR;
      const circle = L.circleMarker(c, {
        radius: r,
        color: "#1e3a8a",
        weight: 0.8,
        fillColor: color,
        fillOpacity,
        interactive: false,
      });
      circle.addTo(this.symbolLayer);
    }
  }

  clearSymbols() {
    this.symbolLayer.clearLayers();
  }

  /**
   * Non-contiguous cartogram: each feature's polygon is shrunk toward
   * its centroid by a factor of √(value / maxValue), so the visible
   * polygon area becomes proportional to the data value while the
   * spatial position (and recognisable outline) is preserved.
   *
   * MANDARA 「カートグラム / 変形地図」相当 (non-contiguous scheme).
   * @param valueMap Map<id, number|null>
   * @param breaks/colors  optional → use classified fill colour
   */
  /**
   * Hatch / pattern fill map: each class gets a distinct SVG pattern
   * (diagonal lines, vertical, horizontal, dots, grid, dense diagonal).
   * Patterns work in monochrome print and stack readably with the
   * classified colour. MANDARA 「ハッチモード」相当。
   *
   * @param valueMap Map<id, number|null>
   * @param breaks   classification breaks
   * @param colors   palette
   */
  applyHatch(valueMap, breaks, colors) {
    if (!this.layer || !valueMap) return;
    this._ensureHatchDefs();
    this.layer.eachLayer((lyr) => {
      const id = lyr.feature.properties.id;
      const v = valueMap.get(id);
      if (!Number.isFinite(v)) {
        lyr.setStyle({ weight: 0.5, color: "#475569", fillColor: "#e5e7eb", fillOpacity: 0.6 });
        return;
      }
      const idx = classifyValue(v, breaks);
      const patId = `mn-hatch-${Math.max(0, idx) % 6}`;
      // Set fill first to the classified colour as a fallback, then to the pattern
      lyr.setStyle({
        weight: 0.8, color: "#1e293b",
        fillColor: colors[idx] || "#94a3b8",
        fillOpacity: 0.5,
      });
      // Apply SVG pattern via the underlying path element
      if (lyr._path) lyr._path.setAttribute("fill", `url(#${patId})`);
    });
    this.symbolLayer.clearLayers();
  }

  _ensureHatchDefs() {
    // Inject a single defs block into the map's SVG renderer the first time
    if (this._hatchDefsAdded) return;
    const svg = this.map.getRenderer({}) && this.map.getRenderer({})._container;
    // Fallback: find any svg inside leaflet pane
    const root = svg || this.map.getPanes().overlayPane.querySelector("svg");
    if (!root) return;
    const NS = "http://www.w3.org/2000/svg";
    const defs = document.createElementNS(NS, "defs");
    const patterns = [
      // diagonal left
      { id: 0, content: `<line x1="0" y1="0" x2="0" y2="8" stroke="#1e293b" stroke-width="1.5"/>`, transform: "rotate(45)" },
      // diagonal right
      { id: 1, content: `<line x1="0" y1="0" x2="0" y2="8" stroke="#1e293b" stroke-width="1.5"/>`, transform: "rotate(-45)" },
      // vertical
      { id: 2, content: `<line x1="0" y1="0" x2="0" y2="8" stroke="#1e293b" stroke-width="1.5"/>`, transform: "" },
      // grid
      { id: 3, content: `<path d="M0 0 L8 0 M0 0 L0 8" stroke="#1e293b" stroke-width="1"/>`, transform: "" },
      // dots
      { id: 4, content: `<circle cx="2" cy="2" r="1.2" fill="#1e293b"/>`, transform: "" },
      // dense diagonal
      { id: 5, content: `<line x1="0" y1="0" x2="0" y2="4" stroke="#1e293b" stroke-width="1.5"/>`, transform: "rotate(45)" },
    ];
    for (const p of patterns) {
      const pat = document.createElementNS(NS, "pattern");
      pat.setAttribute("id", `mn-hatch-${p.id}`);
      pat.setAttribute("width", p.id === 5 ? "4" : "8");
      pat.setAttribute("height", p.id === 5 ? "4" : "8");
      pat.setAttribute("patternUnits", "userSpaceOnUse");
      if (p.transform) pat.setAttribute("patternTransform", p.transform);
      pat.innerHTML = p.content;
      defs.appendChild(pat);
    }
    root.appendChild(defs);
    this._hatchDefsAdded = true;
  }

  /**
   * Rotated-symbol map: treat the value as a **direction in degrees**
   * (0=N, 90=E, 180=S, 270=W) and draw an arrow at each feature
   * centroid pointing that way. Used for wind direction, movement,
   * flow, etc.  MANDARA 「記号の回転モード」相当。
   *
   * @param valueMap Map<id, number|null>  -- degrees (0..360)
   * @param fieldName   used for tooltip
   * @param opts.size  default 22 px
   */
  applyRotationSymbols(valueMap, fieldName, opts = {}) {
    this.symbolLayer.clearLayers();
    if (!valueMap) return;
    const size = opts.size ?? 22;

    for (const [code, v] of valueMap.entries()) {
      if (!Number.isFinite(v)) continue;
      const deg = ((v % 360) + 360) % 360;
      const c = this._centroidCache.get(code);
      if (!c) continue;
      const html =
        `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24"` +
        ` style="transform:rotate(${deg}deg);overflow:visible">` +
        `<path d="M12 2 L12 22 M12 2 L7 8 M12 2 L17 8" stroke="#1e3a8a" stroke-width="2.2"` +
        ` stroke-linecap="round" stroke-linejoin="round" fill="none"/>` +
        `</svg>`;
      const icon = L.divIcon({
        className: "arrow-icon",
        html,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
      });
      const m = L.marker(c, { icon, interactive: true });
      const name = this._nameForId(code);
      m.bindTooltip(`${name}<br/><strong>${deg.toFixed(0)}°</strong>` + (fieldName ? `<br/><small>${fieldName}</small>` : ""), {
        sticky: true, direction: "top",
      });
      m.addTo(this.symbolLayer);
    }
  }

  _nameForId(code) {
    // Try to recover the feature name via polygon layer
    if (!this.layer) return "#" + code;
    let name = "#" + code;
    this.layer.eachLayer((lyr) => {
      if (lyr.feature.properties.id === code) name = this._nameFor(lyr.feature.properties);
    });
    return name;
  }

  applyCartogram(valueMap, breaks, colors) {
    this.symbolLayer.clearLayers();
    if (!this.layer || !valueMap) return;
    let maxV = 0;
    for (const v of valueMap.values()) if (Number.isFinite(v) && v > maxV) maxV = v;
    if (maxV <= 0) return;
    // First: fade the original layer
    this.layer.eachLayer((lyr) => {
      lyr.setStyle({
        weight: 0.5, color: "#94a3b8", fillColor: "#e2e8f0", fillOpacity: 0.25,
        dashArray: "2 3",
      });
    });
    // Second: draw a scaled cartogram polygon per feature
    this.layer.eachLayer((lyr) => {
      const f = lyr.feature;
      const id = f.properties.id;
      const v = valueMap.get(id);
      if (!Number.isFinite(v) || v <= 0) return;
      // centroid (lng, lat) from precomputed cache
      const c = this._centroidCache.get(id);
      if (!c) return;
      const [lat0, lng0] = c;
      const scale = Math.sqrt(v / maxV);
      // Classified colour
      let fill = "#2563eb";
      if (breaks && colors) {
        const idx = classifyValue(v, breaks);
        if (idx >= 0) fill = colors[idx];
      }
      const shrunk = scalePolygonAroundCenter(f.geometry, lng0, lat0, scale);
      if (!shrunk) return;
      const poly = L.polygon(shrunk, {
        color: "#1e293b", weight: 0.8,
        fillColor: fill, fillOpacity: 0.85,
      });
      poly.bindTooltip(`<strong>${escapeHtml(this._nameFor(f.properties))}</strong><br/>${formatNum(v)}`, {
        sticky: true, direction: "top", className: "chocho-tip",
      });
      poly.addTo(this.symbolLayer);
    });
  }

  /**
   * Graduated-symbol map: instead of continuous radius proportional to
   * sqrt(value/max), each value is mapped to a **class index** and the
   * radius takes one of K discrete sizes. Clear visual ranking of
   * classes (MANDARA 「階級記号モード」相当).
   *
   * @param valueMap Map<id, number|null>
   * @param breaks   classification breaks (length k+1)
   * @param colors   palette (length k)
   * @param opts.maxRadiusPx default 28
   * @param opts.minRadiusPx default 4
   */
  applyGraduatedSymbols(valueMap, breaks, colors, opts = {}) {
    this.symbolLayer.clearLayers();
    if (!valueMap || !breaks?.length || !colors?.length) return;
    const k = colors.length;
    const maxR = opts.maxRadiusPx ?? 28;
    const minR = opts.minRadiusPx ?? 4;
    const step = k > 1 ? (maxR - minR) / (k - 1) : 0;

    for (const [code, v] of valueMap.entries()) {
      if (!Number.isFinite(v) || v <= 0) continue;
      const c = this._centroidCache.get(code);
      if (!c) continue;
      const idx = classifyValue(v, breaks);
      if (idx < 0) continue;
      const r = minR + idx * step;
      L.circleMarker(c, {
        radius: r,
        color: "#1e3a8a",
        weight: 0.8,
        fillColor: colors[idx],
        fillOpacity: 0.7,
        interactive: false,
      }).addTo(this.symbolLayer);
    }
  }

  /**
   * Render a small pie chart at each feature centroid.
   * MANDARA 「円グラフモード」相当。
   *
   * @param dataset   { rows, fields }  -- whole dataset with rows.key=feature id
   * @param fields    array of column names to include (2..n recommended)
   * @param colors    array same length as fields (one color per slice)
   * @param opts      { radiusPx } default 18
   */
  applyPieCharts(dataset, fields, colors, opts = {}) {
    this.symbolLayer.clearLayers();
    if (!this.layer || !dataset || !fields?.length) return;
    const R = opts.radiusPx ?? 18;
    // Build a id → row lookup
    const byId = new Map();
    for (const r of dataset.rows) byId.set(r.key, r);

    this.layer.eachLayer((lyr) => {
      const f = lyr.feature;
      const row = byId.get(f.properties.id);
      if (!row) return;
      let lat, lng;
      try {
        const c = lyr.getBounds().getCenter();
        lat = c.lat; lng = c.lng;
      } catch { return; }
      // Collect positive values per field
      const vals = fields.map(fn => {
        const v = row.values[fn];
        return Number.isFinite(v) && v > 0 ? v : 0;
      });
      const total = vals.reduce((a, b) => a + b, 0);
      if (total <= 0) return;

      // Build SVG pie slices
      const cx = R, cy = R, sz = R * 2;
      let acc = 0;
      const paths = [];
      const tipLines = [];
      vals.forEach((v, i) => {
        if (v <= 0) return;
        const pct = v / total;
        const a0 = acc * 2 * Math.PI;
        acc += pct;
        const a1 = acc * 2 * Math.PI;
        const x0 = cx + R * Math.sin(a0), y0 = cy - R * Math.cos(a0);
        const x1 = cx + R * Math.sin(a1), y1 = cy - R * Math.cos(a1);
        const large = pct > 0.5 ? 1 : 0;
        // Full circle as single slice — draw a circle to avoid an arc bug
        const d = vals.filter(x => x > 0).length === 1
          ? `M${cx-R},${cy} A${R},${R} 0 1,1 ${cx+R},${cy} A${R},${R} 0 1,1 ${cx-R},${cy}Z`
          : `M${cx},${cy} L${x0.toFixed(2)},${y0.toFixed(2)} A${R},${R} 0 ${large},1 ${x1.toFixed(2)},${y1.toFixed(2)} Z`;
        paths.push(`<path d="${d}" fill="${colors[i] || "#94a3b8"}" stroke="#1e293b" stroke-width="0.5"/>`);
        tipLines.push(`${escapeHtml(fields[i])}: ${formatNum(v)} (${(pct*100).toFixed(1)}%)`);
      });

      const html = `<svg xmlns="http://www.w3.org/2000/svg" width="${sz}" height="${sz}" viewBox="0 0 ${sz} ${sz}">${paths.join("")}</svg>`;
      const icon = L.divIcon({
        className: "pie-icon",
        html,
        iconSize: [sz, sz],
        iconAnchor: [R, R],
      });
      const name = this._nameFor(f.properties);
      const m = L.marker([lat, lng], { icon, interactive: true });
      m.bindTooltip(`<strong>${escapeHtml(name)}</strong><br/>${tipLines.join("<br/>")}<br/><small>合計: ${formatNum(total)}</small>`, {
        sticky: true, direction: "top", className: "chocho-tip",
      });
      m.addTo(this.symbolLayer);
    });
  }

  /**
   * Render a small bar chart at each feature centroid.
   * Sister mode of applyPieCharts — same selected fields but rendered
   * as side-by-side vertical bars whose heights are proportional to
   * each field's value relative to the **global maximum across all
   * features** for that field (so heights compare across regions).
   *
   * MANDARA 「棒グラフモード」相当。
   */
  applyBarCharts(dataset, fields, colors, opts = {}) {
    this.symbolLayer.clearLayers();
    if (!this.layer || !dataset || !fields?.length) return;
    const maxH = opts.maxHeightPx ?? 30;
    const barW = opts.barWidthPx ?? 6;
    const gap  = 1;
    const pad  = 2;

    // Global max per field for height scaling
    const globalMax = fields.map(fn => {
      let m = 0;
      for (const r of dataset.rows) {
        const v = r.values[fn];
        if (Number.isFinite(v) && v > m) m = v;
      }
      return m;
    });

    const byId = new Map();
    for (const r of dataset.rows) byId.set(r.key, r);

    const totalW = fields.length * barW + (fields.length - 1) * gap + pad * 2;
    const totalH = maxH + pad * 2 + 8;   // 8px baseline label space

    this.layer.eachLayer((lyr) => {
      const f = lyr.feature;
      const row = byId.get(f.properties.id);
      if (!row) return;
      let lat, lng;
      try { const c = lyr.getBounds().getCenter(); lat = c.lat; lng = c.lng; } catch { return; }

      const bars = [];
      const tipLines = [];
      let anyVal = false;
      fields.forEach((fn, i) => {
        const v = row.values[fn];
        const gMax = globalMax[i] || 1;
        const h = Number.isFinite(v) && v > 0 ? (v / gMax) * maxH : 0;
        if (h > 0) anyVal = true;
        const x = pad + i * (barW + gap);
        const y = pad + (maxH - h);
        bars.push(`<rect x="${x}" y="${y}" width="${barW}" height="${h.toFixed(1)}" fill="${colors[i] || "#94a3b8"}" stroke="#1e293b" stroke-width="0.4"/>`);
        tipLines.push(`${escapeHtml(fn)}: ${Number.isFinite(v) ? formatNum(v) : "—"}`);
      });
      if (!anyVal) return;
      // baseline
      const baseY = pad + maxH + 0.5;
      bars.push(`<line x1="${pad}" y1="${baseY}" x2="${totalW - pad}" y2="${baseY}" stroke="#475569" stroke-width="0.6"/>`);

      const html = `<svg xmlns="http://www.w3.org/2000/svg" width="${totalW}" height="${totalH}" viewBox="0 0 ${totalW} ${totalH}">${bars.join("")}</svg>`;
      const icon = L.divIcon({
        className: "bar-icon",
        html,
        iconSize: [totalW, totalH],
        iconAnchor: [totalW / 2, totalH - pad],
      });
      const name = this._nameFor(f.properties);
      const m = L.marker([lat, lng], { icon, interactive: true });
      m.bindTooltip(`<strong>${escapeHtml(name)}</strong><br/>${tipLines.join("<br/>")}`, {
        sticky: true, direction: "top", className: "chocho-tip",
      });
      m.addTo(this.symbolLayer);
    });
  }

  /**
   * Render text labels at each feature centroid: "name\nvalue".
   * Inspired by MANDARA's 「文字モード / ラベル表示モード」.
   *
   * @param valueMap Map<id, number|null>
   * @param fieldName  current data field (used for unit suffix)
   * @param opts.showName  also show feature name (default true)
   */
  applyLabels(valueMap, fieldName, opts = {}) {
    this.symbolLayer.clearLayers();
    if (!this.layer || !valueMap) return;
    const showName = opts.showName !== false;
    const unit = extractUnit(fieldName || "");
    this.layer.eachLayer((lyr) => {
      const f = lyr.feature;
      let lat, lng;
      try {
        const c = lyr.getBounds().getCenter();
        lat = c.lat; lng = c.lng;
      } catch {
        return;
      }
      const v = valueMap.get(f.properties.id);
      const name = this._nameFor(f.properties);
      const val = Number.isFinite(v) ? `${formatNum(v)}${unit ? " " + unit : ""}` : "—";
      const html = `<div class="map-label">${showName ? `<span class="ml-name">${escapeHtml(name)}</span><br/>` : ""}<span class="ml-val">${escapeHtml(val)}</span></div>`;
      const icon = L.divIcon({
        className: "map-label-icon",
        html,
        iconSize: null,
        iconAnchor: [0, 0],
      });
      const m = L.marker([lat, lng], { icon, interactive: false });
      m.addTo(this.symbolLayer);
    });
  }

  /**
   * Town-level (chocho) plot: each entry is { town, lat, lng, koaza, id }.
   * Renders as CircleMarkers in the symbol layer. Tooltip on hover.
   * Optional valueMap / classified colors will paint each town by its value.
   *
   * @param towns      [{ id, town, lat, lng, koaza }]
   * @param valueMap   Map<id, number|null>  (optional)
   * @param breaks     classification breaks   (optional)
   * @param colors     palette colors          (optional)
   * @param fieldName  current data field      (optional)
   * @param opts       { mode: "choropleth"|"symbol"|"both", maxRadiusPx } (optional)
   */
  applyTownPlot(towns, valueMap, breaks, colors, fieldName, opts) {
    this.symbolLayer.clearLayers();
    // Remove any base polygon layer (towns are points)
    if (this.layer) {
      this.map.removeLayer(this.layer);
      this.layer = null;
    }
    if (!towns || !towns.length) return;
    const mode = opts?.mode || "choropleth";
    const maxR = opts?.maxRadiusPx ?? 24;
    const minR = 2;
    const sizeByValue = mode === "symbol" || mode === "both";
    const useClassifiedColor = mode === "choropleth" || mode === "both";

    let maxVal = 0;
    if (sizeByValue && valueMap) {
      for (const v of valueMap.values()) {
        if (Number.isFinite(v) && v > maxVal) maxVal = v;
      }
    }

    const lookup = (id) => {
      if (!valueMap) return null;
      const v = valueMap.get(id);
      if (!Number.isFinite(v)) return null;
      let color = null;
      if (useClassifiedColor && breaks && colors) {
        const idx = classifyValue(v, breaks);
        color = idx < 0 ? null : colors[idx];
      }
      return { v, color };
    };

    const group = L.featureGroup();

    // === Voronoi pseudo-polygons, clipped to the convex hull of the points
    //     so cells don't run across the entire bbox (looks much more natural). ===
    if (useClassifiedColor && typeof d3 !== "undefined" && d3.Delaunay && towns.length >= 3) {
      const pts = towns.filter(t => Number.isFinite(t.lat) && Number.isFinite(t.lng));
      const coords = pts.map(t => [t.lng, t.lat]);
      const xs = coords.map(p => p[0]), ys = coords.map(p => p[1]);
      const pad = 0.01;
      const bbox = [Math.min(...xs) - pad, Math.min(...ys) - pad,
                    Math.max(...xs) + pad, Math.max(...ys) + pad];
      const delaunay = d3.Delaunay.from(coords);
      const voronoi  = delaunay.voronoi(bbox);

      // Convex-hull ring of the points (closed)
      let hullRing = null;
      try {
        const hullIdx = Array.from(delaunay.hull);
        if (hullIdx.length >= 3) {
          hullRing = hullIdx.map(i => coords[i]);
          hullRing.push(hullRing[0]);
        }
      } catch (_) {}

      const canClip = hullRing && typeof polygonClipping !== "undefined";

      pts.forEach((t, i) => {
        const cell = voronoi.cellPolygon(i);
        if (!cell) return;
        let rings = [cell];
        if (canClip) {
          try {
            const isect = polygonClipping.intersection([cell], [hullRing]);
            if (!isect || !isect.length) return;
            // Take only the outer rings of each resulting polygon
            rings = isect.map(p => p[0]);
          } catch (_) {
            rings = [cell];
          }
        }
        const info = lookup(t.id);
        const fill = info?.color || "#dbeafe";
        for (const ring of rings) {
          const latlngs = ring.map(([lng, lat]) => [lat, lng]);
          const poly = L.polygon(latlngs, {
            color: "#1e3a8a", weight: 0.5, opacity: 0.55,
            fillColor: fill, fillOpacity: info?.v != null ? 0.65 : 0.3,
          });
          const valText = info?.v != null ? ` <span class="val">${formatNum(info.v)}</span>` : "";
          const fieldText = fieldName ? `<br/><small>${fieldName}</small>` : "";
          poly.bindTooltip(`${t.town}${t.koaza || ""}${valText}${fieldText}`, {
            sticky: true, direction: "top", className: "chocho-tip",
          });
          poly.addTo(this.symbolLayer);
          group.addLayer(poly);
        }
      });
    }

    for (const t of towns) {
      if (!Number.isFinite(t.lat) || !Number.isFinite(t.lng)) continue;
      const info = lookup(t.id);
      let color;
      if (mode === "symbol") {
        color = "#9ca3af";
      } else {
        color = info?.color || "#2563eb";
      }
      let r;
      if (sizeByValue && maxVal > 0 && Number.isFinite(info?.v) && info.v > 0) {
        r = Math.max(minR, Math.sqrt(info.v / maxVal) * maxR);
      } else if (sizeByValue) {
        r = minR;
      } else {
        r = info?.v != null ? 6 : 4;
      }
      const m = L.circleMarker([t.lat, t.lng], {
        radius: r, color: "#1e3a8a", weight: 0.7,
        fillColor: color, fillOpacity: 0.7,
      });
      const valText = info?.v != null ? ` <span class="val">${formatNum(info.v)}</span>` : "";
      const fieldText = fieldName ? `<br/><small>${fieldName}</small>` : "";
      m.bindTooltip(`${t.town}${t.koaza || ""}${valText}${fieldText}`, {
        sticky: true, direction: "top", offset: [0, -6], className: "chocho-tip",
      });
      m.addTo(this.symbolLayer);
      group.addLayer(m);
    }
    try {
      const b = group.getBounds();
      if (b.isValid()) this.map.fitBounds(b, { padding: [40, 40], maxZoom: 14 });
    } catch (_) {}
  }

  /**
   * Render dot-density: for each feature, drop floor(value/unit) random dots
   * inside its polygon. Dots are 1px canvas pixels for performance.
   *
   * @param geojson  same FeatureCollection as setBaseGeo (needed for shapes)
   * @param valueMap Map<id, number>
   * @param unit     value per dot (e.g. 10000 → 1 dot = 10,000)
   * @param color    dot color
   */
  applyDotDensity(geojson, valueMap, unit, color = "#1d4ed8") {
    this.symbolLayer.clearLayers();
    if (!valueMap || !geojson || unit <= 0) return;
    const pts = [];
    for (const feat of geojson.features) {
      const id = feat.properties.id;
      const v = valueMap.get(id);
      if (!Number.isFinite(v) || v <= 0) continue;
      const k = Math.min(2000, Math.floor(v / unit));
      if (k <= 0) continue;
      const polys = polygonsOf(feat.geometry);
      const totalArea = polys.reduce((s, p) => s + Math.abs(ringSignedArea(p[0])), 0);
      // distribute dots proportionally across multi-polygon parts by area
      for (const poly of polys) {
        const a = Math.abs(ringSignedArea(poly[0]));
        const share = totalArea > 0 ? Math.round(k * (a / totalArea)) : 0;
        for (let i = 0; i < share; i++) {
          const p = randomPointInPolygon(poly);
          if (p) pts.push(p);
        }
      }
    }
    // Render all dots as one CircleMarker layer for efficiency
    for (const [lon, lat] of pts) {
      L.circleMarker([lat, lon], {
        radius: 1.3, color, fillColor: color, fillOpacity: 0.7, weight: 0,
        interactive: false,
      }).addTo(this.symbolLayer);
    }
  }

  /**
   * Highlight a single feature by its properties.id (e.g. from scatter hover).
   * Restores other layers to their classified style.
   */
  highlightById(id) {
    if (!this.layer) return;
    this.layer.eachLayer((lyr) => {
      if (lyr.feature.properties.id === id) {
        lyr.setStyle({ weight: 3, color: "#dc2626", fillOpacity: 0.95 });
        if (lyr.bringToFront) lyr.bringToFront();
        // Keep symbol circles above the elevated polygon
        this.symbolLayer.eachLayer(s => s.bringToFront && s.bringToFront());
      } else {
        // re-apply the choropleth style for this feature
        if (this._lookupFn) {
          const info = this._lookupFn(lyr.feature.properties.id);
          lyr.setStyle({ weight: 0.6, color: "#475569", fillColor: info.color, fillOpacity: 0.88 });
        } else {
          lyr.setStyle(this._defaultStyle());
        }
      }
    });
  }

  /**
   * Highlight a set of features as outliers with a heavy red outline.
   * @param idSet Set<id>  -- set of feature ids to mark
   */
  markOutliers(idSet) {
    if (!this.layer) return;
    this._outlierIds = idSet || new Set();
    this.layer.eachLayer((lyr) => {
      const id = lyr.feature.properties.id;
      const info = this._lookupFn ? this._lookupFn(id) : null;
      const isOutlier = this._outlierIds.has(id);
      const fill = info ? info.color : NA_COLOR;
      lyr.setStyle({
        weight: isOutlier ? 2.5 : 0.6,
        color:  isOutlier ? "#dc2626" : "#475569",
        fillColor: fill,
        fillOpacity: 0.88,
        dashArray: isOutlier ? "4 2" : null,
      });
      if (isOutlier && lyr.bringToFront) lyr.bringToFront();
    });
    this.symbolLayer.eachLayer(s => s.bringToFront && s.bringToFront());
  }

  clearOutlierMarks() {
    this._outlierIds = new Set();
    if (!this.layer) return;
    this.layer.eachLayer((lyr) => {
      const id = lyr.feature.properties.id;
      const info = this._lookupFn ? this._lookupFn(id) : null;
      lyr.setStyle({
        weight: 0.6, color: "#475569",
        fillColor: info ? info.color : NA_COLOR,
        fillOpacity: 0.88, dashArray: null,
      });
    });
  }

  /**
   * Highlight every feature whose classified value falls in the given
   * class index (0..k-1). Other features get a faded outline so the
   * class stands out. Use clearHighlight() to reset.
   */
  highlightByClass(classIndex) {
    if (!this.layer || !this._lookupFn) return;
    this.layer.eachLayer((lyr) => {
      const info = this._lookupFn(lyr.feature.properties.id);
      const inClass = info && info.classIndex === classIndex;
      lyr.setStyle({
        weight: inClass ? 2 : 0.4,
        color: inClass ? "#dc2626" : "#94a3b8",
        fillColor: info ? info.color : "#e5e7eb",
        fillOpacity: inClass ? 0.95 : 0.4,
      });
      if (inClass && lyr.bringToFront) lyr.bringToFront();
    });
    this.symbolLayer.eachLayer(s => s.bringToFront && s.bringToFront());
  }

  clearHighlight() {
    if (!this.layer) return;
    this.layer.eachLayer((lyr) => {
      if (this._lookupFn) {
        const info = this._lookupFn(lyr.feature.properties.id);
        lyr.setStyle({ weight: 0.6, color: "#475569", fillColor: info.color, fillOpacity: 0.88 });
      } else {
        lyr.setStyle(this._defaultStyle());
      }
    });
  }

  /**
   * Register a handler that's called on hover/leave with the feature's id.
   * Used by the scatter plot to highlight the matching point.
   */
  onFeatureHover(handler) {
    this._hoverHandler = handler;
  }
  onFeatureClick(handler) {
    this._clickHandler = handler;
  }

  /**
   * Zoom & highlight a feature by id. Useful from search results.
   */
  zoomToFeature(id) {
    if (!this.layer) return;
    let target = null;
    this.layer.eachLayer((lyr) => {
      if (lyr.feature.properties.id === id) target = lyr;
    });
    if (!target) return;
    try {
      this.map.fitBounds(target.getBounds(), { padding: [40, 40], maxZoom: 11 });
    } catch (_) {}
    this.highlightById(id);
    setTimeout(() => this.clearHighlight(), 2500);
  }

  /**
   * Distance-measurement tool. Two clicks add a polyline and a tooltip
   * displaying the great-circle distance in km/m. Third click resets.
   * Returns a function that disables the tool.
   */
  enableMeasureTool() {
    if (this._measureCleanup) this._measureCleanup();
    if (!this._measureLayer) this._measureLayer = L.layerGroup().addTo(this.map);
    let points = [];
    const me = this;
    const container = this.map.getContainer();
    container.style.cursor = "crosshair";
    const onClick = (e) => {
      points.push(e.latlng);
      L.circleMarker(e.latlng, {
        radius: 4, color: "#dc2626", fillColor: "#dc2626", fillOpacity: 1, weight: 0,
      }).addTo(me._measureLayer);
      if (points.length === 2) {
        const line = L.polyline(points, { color: "#dc2626", weight: 3, dashArray: "6 4" });
        line.addTo(me._measureLayer);
        const km = me.map.distance(points[0], points[1]) / 1000;
        const label = km < 1 ? `${(km * 1000).toFixed(0)} m` : `${km.toFixed(2)} km`;
        const mid = L.latLng((points[0].lat + points[1].lat) / 2, (points[0].lng + points[1].lng) / 2);
        L.marker(mid, {
          icon: L.divIcon({
            className: "measure-label",
            html: `<div class="map-label"><span class="ml-val">${label}</span></div>`,
            iconSize: null,
          }),
          interactive: false,
        }).addTo(me._measureLayer);
      } else if (points.length > 2) {
        me._measureLayer.clearLayers();
        points = [e.latlng];
        L.circleMarker(e.latlng, {
          radius: 4, color: "#dc2626", fillColor: "#dc2626", fillOpacity: 1, weight: 0,
        }).addTo(me._measureLayer);
      }
    };
    this.map.on("click", onClick);
    this._measureCleanup = () => {
      this.map.off("click", onClick);
      container.style.cursor = "";
      if (this._measureLayer) this._measureLayer.clearLayers();
      this._measureCleanup = null;
    };
    return this._measureCleanup;
  }

  disableMeasureTool() {
    if (this._measureCleanup) this._measureCleanup();
  }

  /**
   * Area-measurement tool. Each click adds a polygon vertex, double-click
   * closes the polygon and shows the spherical area in km² / m².
   * MANDARA「面積測定」相当。
   */
  enableAreaTool() {
    if (this._areaCleanup) this._areaCleanup();
    if (!this._areaLayer) this._areaLayer = L.layerGroup().addTo(this.map);
    let points = [];
    let liveLine = null;
    let dots = [];
    const me = this;
    const container = this.map.getContainer();
    container.style.cursor = "crosshair";

    const redrawLine = () => {
      if (liveLine) me._areaLayer.removeLayer(liveLine);
      if (points.length >= 2) {
        liveLine = L.polyline(points, { color: "#16a34a", weight: 2, dashArray: "4 4" });
        liveLine.addTo(me._areaLayer);
      }
    };

    const onClick = (e) => {
      // double-click is handled separately; ignore zero-time repeat
      points.push(e.latlng);
      const d = L.circleMarker(e.latlng, {
        radius: 3.5, color: "#16a34a", fillColor: "#16a34a", fillOpacity: 1, weight: 0,
      }).addTo(me._areaLayer);
      dots.push(d);
      redrawLine();
    };

    const finishPolygon = () => {
      if (points.length < 3) return;
      if (liveLine) me._areaLayer.removeLayer(liveLine);
      const poly = L.polygon(points, {
        color: "#16a34a", weight: 2, fillColor: "#16a34a", fillOpacity: 0.18,
      });
      poly.addTo(me._areaLayer);
      const areaKm2 = sphericalPolygonAreaKm2(points.map(p => [p.lng, p.lat]));
      const label = areaKm2 < 0.01
        ? `${(areaKm2 * 1_000_000).toFixed(0)} m²`
        : `${areaKm2.toFixed(2)} km²`;
      let cx = 0, cy = 0;
      for (const p of points) { cx += p.lat; cy += p.lng; }
      cx /= points.length; cy /= points.length;
      L.marker([cx, cy], {
        icon: L.divIcon({
          className: "measure-label",
          html: `<div class="map-label"><span class="ml-val">${label}</span></div>`,
          iconSize: null,
        }),
        interactive: false,
      }).addTo(me._areaLayer);
      points = [];
      dots = [];
      liveLine = null;
    };

    const onDblClick = (e) => {
      L.DomEvent.stopPropagation(e);
      finishPolygon();
    };

    this.map.on("click", onClick);
    this.map.on("dblclick", onDblClick);
    this.map.doubleClickZoom.disable();

    this._areaCleanup = () => {
      this.map.off("click", onClick);
      this.map.off("dblclick", onDblClick);
      this.map.doubleClickZoom.enable();
      container.style.cursor = "";
      if (this._areaLayer) this._areaLayer.clearLayers();
      this._areaCleanup = null;
    };
    return this._areaCleanup;
  }

  disableAreaTool() {
    if (this._areaCleanup) this._areaCleanup();
  }

  /**
   * Buffer-search tool. User clicks the map → a circle of radius `radiusKm`
   * is drawn, and every feature (polygon centroid or town point) inside
   * that circle is highlighted via markOutliers().
   * MANDARA 「空間検索」相当。
   *
   * @param onHit (idsSet, hitCount, totalCount) callback after each click
   */
  enableBufferTool(radiusKm, onHit) {
    if (this._bufferCleanup) this._bufferCleanup();
    if (!this._bufferLayer) this._bufferLayer = L.layerGroup().addTo(this.map);
    const me = this;
    const container = this.map.getContainer();
    container.style.cursor = "crosshair";

    const onClick = (e) => {
      me._bufferLayer.clearLayers();
      const center = e.latlng;
      // 1) draw a circle (radiusKm * 1000 m). Leaflet L.circle takes meters.
      L.circle(center, {
        radius: radiusKm * 1000,
        color: "#9333ea", weight: 1.5, dashArray: "4 4",
        fillColor: "#a855f7", fillOpacity: 0.12,
      }).addTo(me._bufferLayer);
      L.circleMarker(center, {
        radius: 4, color: "#7e22ce", fillColor: "#a855f7", fillOpacity: 1, weight: 0,
      }).addTo(me._bufferLayer);

      // 2) find all features whose centroid is inside the circle
      const hits = new Set();
      let total = 0;
      // Polygon layer
      if (me.layer) {
        me.layer.eachLayer((lyr) => {
          total++;
          let c;
          try { c = lyr.getBounds().getCenter(); } catch { return; }
          if (me.map.distance(c, center) <= radiusKm * 1000) {
            hits.add(lyr.feature.properties.id);
          }
        });
        me.markOutliers(hits);
      }
      if (onHit) onHit(hits, hits.size, total);
    };

    this.map.on("click", onClick);
    this._bufferCleanup = () => {
      this.map.off("click", onClick);
      container.style.cursor = "";
      if (this._bufferLayer) this._bufferLayer.clearLayers();
      this.clearOutlierMarks();
      this._bufferCleanup = null;
    };
    return this._bufferCleanup;
  }

  disableBufferTool() {
    if (this._bufferCleanup) this._bufferCleanup();
  }

  /**
   * Render the **Standard Deviation Ellipse (SDE)** for a set of points
   * — analytical signature of the spatial distribution's direction and
   * spread. MANDARA 「標準偏差楕円」相当。
   *
   * @param latlngs   array of [lat, lng] points (any point cloud)
   * @returns         { center, semiMajor, semiMinor, rotationDeg }
   *                  | null when there are <3 points
   */
  applyStandardDeviationEllipse(latlngs) {
    if (this._sdeLayer) this._sdeLayer.clearLayers();
    if (!this._sdeLayer) this._sdeLayer = L.layerGroup().addTo(this.map);
    if (!latlngs || latlngs.length < 3) return null;

    const params = computeSDE(latlngs);
    if (!params) return null;

    // Build an ellipse polygon (72 vertices) in degrees lon/lat space.
    // The semi-axes are given in km — convert per local longitudinal factor.
    const cosLat = Math.cos(params.cy * Math.PI / 180);
    const kmToDegLat = 1 / 111.0;
    const kmToDegLng = 1 / (111.0 * Math.max(0.000001, cosLat));
    const sin = Math.sin(params.rotation), cos = Math.cos(params.rotation);
    const ring = [];
    for (let i = 0; i <= 72; i++) {
      const t = (i / 72) * 2 * Math.PI;
      const x = params.aKm * Math.cos(t);   // along major axis (km)
      const y = params.bKm * Math.sin(t);   // along minor axis (km)
      // rotate
      const xr = x * cos - y * sin;
      const yr = x * sin + y * cos;
      ring.push([
        params.cy + yr * kmToDegLat,
        params.cx + xr * kmToDegLng,
      ]);
    }
    const ellipse = L.polygon(ring, {
      color: "#7c2d12", weight: 2, fillColor: "#fbbf24", fillOpacity: 0.18,
      dashArray: "6 3", interactive: false,
    });
    ellipse.addTo(this._sdeLayer);
    // mean centre
    L.circleMarker([params.cy, params.cx], {
      radius: 5, color: "#7c2d12", fillColor: "#dc2626", fillOpacity: 1, weight: 0,
      interactive: false,
    }).addTo(this._sdeLayer);
    return {
      center: [params.cy, params.cx],
      semiMajorKm: params.aKm,
      semiMinorKm: params.bKm,
      rotationDeg: params.rotation * 180 / Math.PI,
    };
  }

  clearSDE() {
    if (this._sdeLayer) this._sdeLayer.clearLayers();
  }

  /**
   * Draw Japanese Standard Regional Mesh polygons (JIS X 0410) over the
   * current map viewport.  Levels:
   *   1 - primary mesh    (1deg × 40min ≈ 80km)
   *   2 - secondary mesh  (1/8 of level1 ≈ 10km)
   *   3 - tertiary mesh   (1/10 of level2 ≈ 1km)
   * MANDARA 「メッシュオブジェクトの作成」相当。
   */
  applyMeshOverlay(level = 2) {
    if (this._meshLayer) this._meshLayer.clearLayers();
    if (!this._meshLayer) this._meshLayer = L.layerGroup().addTo(this.map);
    const bounds = this.map.getBounds();
    let n = 0;
    const minLat = Math.max(20, bounds.getSouth());
    const maxLat = Math.min(46, bounds.getNorth());
    const minLng = Math.max(122, bounds.getWest());
    const maxLng = Math.min(154, bounds.getEast());
    if (level === 1) {
      // 緯度40分 × 経度1度
      const dLat = 40 / 60;
      for (let lat = Math.floor(minLat * 1.5) / 1.5; lat <= maxLat + dLat; lat += dLat) {
        for (let lng = Math.floor(minLng); lng <= maxLng + 1; lng += 1) {
          if (lat + dLat < minLat || lat > maxLat || lng + 1 < minLng || lng > maxLng) continue;
          const code = meshCode(lat + 0.001, lng + 0.001, 1);
          n += addMeshCell(this._meshLayer, lat, lng, lat + dLat, lng + 1, code, "#1d4ed8", 0.6);
        }
      }
    } else if (level === 2) {
      // 5分 × 7.5分
      const dLat = 5 / 60, dLng = 7.5 / 60;
      const startLat = Math.floor(minLat / dLat) * dLat;
      const startLng = Math.floor(minLng / dLng) * dLng;
      for (let lat = startLat; lat <= maxLat + dLat; lat += dLat) {
        for (let lng = startLng; lng <= maxLng + dLng; lng += dLng) {
          if (n > 2000) break;
          if (lat + dLat < minLat || lat > maxLat || lng + dLng < minLng || lng > maxLng) continue;
          const code = meshCode(lat + 0.001, lng + 0.001, 2);
          n += addMeshCell(this._meshLayer, lat, lng, lat + dLat, lng + dLng, code, "#16a34a", 0.5);
        }
      }
    } else if (level === 3) {
      // 30秒 × 45秒
      const dLat = 30 / 3600, dLng = 45 / 3600;
      const startLat = Math.floor(minLat / dLat) * dLat;
      const startLng = Math.floor(minLng / dLng) * dLng;
      for (let lat = startLat; lat <= maxLat + dLat; lat += dLat) {
        for (let lng = startLng; lng <= maxLng + dLng; lng += dLng) {
          if (n > 5000) break;  // safety cap — too many cells crashes the map
          if (lat + dLat < minLat || lat > maxLat || lng + dLng < minLng || lng > maxLng) continue;
          const code = meshCode(lat + 0.0001, lng + 0.0001, 3);
          n += addMeshCell(this._meshLayer, lat, lng, lat + dLat, lng + dLng, code, "#ea580c", 0.35);
        }
      }
    }
    return n;
  }

  clearMeshOverlay() {
    if (this._meshLayer) this._meshLayer.clearLayers();
  }

  /**
   * Render filled contours (isolines / 塗り分け式 contour map) by:
   *   1) interpolating values onto a regular grid via IDW
   *   2) using d3.contours to extract iso-bands
   *   3) drawing each band as a Leaflet polygon, classified by colour
   * MANDARA 「等値線モード（塗り分け式）」相当。
   *
   * @param samples [{ lat, lng, v }]  -- point cloud with values
   * @param colors  string[]            -- one colour per contour band
   * @param opts.gridSize  default 80   -- grid cells per side
   * @param opts.power     default 2    -- IDW power
   */
  applyContours(samples, colors, opts = {}) {
    this.symbolLayer.clearLayers();
    if (!this.layer && !samples?.length) return;
    if (typeof d3 === "undefined" || !d3.contours) return;
    const pts = samples.filter(s => Number.isFinite(s.lat) && Number.isFinite(s.lng) && Number.isFinite(s.v));
    if (pts.length < 3) return;
    const gridSize = opts.gridSize ?? 80;
    const power = opts.power ?? 2;

    // bbox + padding
    const lats = pts.map(p => p.lat), lngs = pts.map(p => p.lng);
    const padL = (Math.max(...lats) - Math.min(...lats)) * 0.05;
    const padG = (Math.max(...lngs) - Math.min(...lngs)) * 0.05;
    const minLat = Math.min(...lats) - padL, maxLat = Math.max(...lats) + padL;
    const minLng = Math.min(...lngs) - padG, maxLng = Math.max(...lngs) + padG;

    // IDW grid
    const grid = new Float64Array(gridSize * gridSize);
    let minV = Infinity, maxV = -Infinity;
    for (let j = 0; j < gridSize; j++) {
      const lat = minLat + ((maxLat - minLat) * (gridSize - 1 - j)) / (gridSize - 1); // flip y so grid[0] is top
      for (let i = 0; i < gridSize; i++) {
        const lng = minLng + ((maxLng - minLng) * i) / (gridSize - 1);
        let num = 0, den = 0, hit = null;
        for (const s of pts) {
          const d2 = (lng - s.lng) ** 2 + (lat - s.lat) ** 2;
          if (d2 < 1e-12) { hit = s.v; break; }
          const w = 1 / Math.pow(d2, power / 2);
          num += s.v * w; den += w;
        }
        const v = hit != null ? hit : num / den;
        grid[j * gridSize + i] = v;
        if (v < minV) minV = v;
        if (v > maxV) maxV = v;
      }
    }
    if (minV === maxV) return;

    // Choose contour thresholds (one per palette colour)
    const k = colors.length;
    const thresholds = [];
    for (let i = 0; i <= k; i++) thresholds.push(minV + (maxV - minV) * (i / k));

    const contourGen = d3.contours().size([gridSize, gridSize]).thresholds(thresholds);
    const polys = contourGen(grid);

    // Each polygon's geometry is in grid coordinates [0..gridSize-1].
    // Map back to lat/lng.
    const gridX = (x) => minLng + ((maxLng - minLng) * x) / (gridSize - 1);
    const gridY = (y) => maxLat - ((maxLat - minLat) * y) / (gridSize - 1);

    polys.forEach((mp, i) => {
      if (i >= k) return;
      const col = colors[i] || "#94a3b8";
      // d3.contours returns MultiPolygon: coordinates = [[ring,...], [ring,...]]
      for (const poly of mp.coordinates) {
        // Convert each ring of [x,y] grid → [lat,lng]
        const rings = poly.map(ring => ring.map(([x, y]) => [gridY(y), gridX(x)]));
        const lyr = L.polygon(rings, {
          color: "#1e293b", weight: 0.3, opacity: 0.5,
          fillColor: col, fillOpacity: 0.55,
          interactive: false,
        });
        lyr.addTo(this.symbolLayer);
      }
    });
    // Also overlay original points as small dots for reference
    for (const s of pts) {
      L.circleMarker([s.lat, s.lng], {
        radius: 1.5, color: "#1e293b", fillColor: "#fff", fillOpacity: 0.9, weight: 0.4,
        interactive: false,
      }).addTo(this.symbolLayer);
    }
  }

  /**
   * Enable / disable Leaflet.draw toolbar.  When enabled, the user can
   * sketch polygons / polylines / rectangles / circles / markers, which
   * are stored in `this._drawnItems` (a FeatureGroup). Use
   * exportDrawn() to retrieve the GeoJSON.
   * MANDARA 「ラインの編集」相当。
   */
  enableDrawTool() {
    if (this._drawControl) return;
    if (!L.Control || !L.Control.Draw) {
      console.warn("Leaflet.draw not loaded"); return;
    }
    this._drawnItems = this._drawnItems || new L.FeatureGroup().addTo(this.map);
    this._drawControl = new L.Control.Draw({
      position: "topright",
      edit: { featureGroup: this._drawnItems },
      draw: {
        polygon: { allowIntersection: false, showArea: true,
          shapeOptions: { color: "#dc2626", weight: 2 } },
        polyline: { shapeOptions: { color: "#dc2626", weight: 3 } },
        rectangle: { shapeOptions: { color: "#dc2626" } },
        circle: { shapeOptions: { color: "#dc2626" } },
        marker: true,
        circlemarker: false,
      },
    });
    this.map.addControl(this._drawControl);
    this._drawHandlers = {
      created: (e) => this._drawnItems.addLayer(e.layer),
    };
    this.map.on(L.Draw.Event.CREATED, this._drawHandlers.created);
  }

  disableDrawTool() {
    if (this._drawControl) {
      this.map.removeControl(this._drawControl);
      this._drawControl = null;
    }
    if (this._drawHandlers?.created) {
      this.map.off(L.Draw.Event.CREATED, this._drawHandlers.created);
    }
  }

  /** Return all drawn shapes as a GeoJSON FeatureCollection. */
  exportDrawn() {
    if (!this._drawnItems) return null;
    const gj = this._drawnItems.toGeoJSON();
    return gj.features?.length ? gj : null;
  }

  clearDrawn() {
    if (this._drawnItems) this._drawnItems.clearLayers();
  }

  getMapElement() { return this._mapEl; }
}

/**
 * Approximate centroid of a Feature (Polygon or MultiPolygon).
 * Uses the largest ring's signed-area centroid for MultiPolygon.
 * Returns [lat, lng] for Leaflet.
 */
function featureCentroid(feat) {
  if (!feat?.geometry) return null;
  const g = feat.geometry;
  let rings = [];
  if (g.type === "Polygon") {
    rings = [g.coordinates[0]];
  } else if (g.type === "MultiPolygon") {
    // pick largest outer ring by absolute signed area
    let best = null, bestA = 0;
    for (const poly of g.coordinates) {
      const a = Math.abs(signedRingArea(poly[0]));
      if (a > bestA) { bestA = a; best = poly[0]; }
    }
    if (best) rings = [best];
  }
  if (!rings.length) return null;
  const c = ringCentroid(rings[0]);
  return c ? [c[1], c[0]] : null; // → [lat, lng]
}

function signedRingArea(ring) {
  let a = 0;
  for (let i = 0, n = ring.length; i < n - 1; i++) {
    a += ring[i][0] * ring[i+1][1] - ring[i+1][0] * ring[i][1];
  }
  return a / 2;
}

function ringCentroid(ring) {
  // Polygon centroid via shoelace formula
  let cx = 0, cy = 0, a = 0;
  for (let i = 0, n = ring.length; i < n - 1; i++) {
    const [x0, y0] = ring[i];
    const [x1, y1] = ring[i+1];
    const cross = x0 * y1 - x1 * y0;
    cx += (x0 + x1) * cross;
    cy += (y0 + y1) * cross;
    a += cross;
  }
  a /= 2;
  if (Math.abs(a) < 1e-12) return null;
  return [cx / (6 * a), cy / (6 * a)];
}

// ---- geometry helpers for dot density ----
function polygonsOf(geom) {
  if (!geom) return [];
  if (geom.type === "Polygon") return [geom.coordinates];
  if (geom.type === "MultiPolygon") return geom.coordinates;
  return [];
}
function ringSignedArea(ring) {
  let a = 0;
  for (let i = 0, n = ring.length; i < n - 1; i++)
    a += ring[i][0] * ring[i+1][1] - ring[i+1][0] * ring[i][1];
  return a / 2;
}
function bboxOfPoly(poly) {
  let mnx = Infinity, mny = Infinity, mxx = -Infinity, mxy = -Infinity;
  for (const ring of poly) for (const [x, y] of ring) {
    if (x < mnx) mnx = x; if (x > mxx) mxx = x;
    if (y < mny) mny = y; if (y > mxy) mxy = y;
  }
  return [mnx, mny, mxx, mxy];
}
function pointInRing(pt, ring) {
  const [x, y] = pt; let inside = false;
  let j = ring.length - 1;
  for (let i = 0; i < ring.length; i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi + 1e-30) + xi))
      inside = !inside;
    j = i;
  }
  return inside;
}
function pointInPolygon(pt, poly) {
  if (!pointInRing(pt, poly[0])) return false;
  for (let k = 1; k < poly.length; k++) if (pointInRing(pt, poly[k])) return false;
  return true;
}
function randomPointInPolygon(poly) {
  const [mnx, mny, mxx, mxy] = bboxOfPoly(poly);
  for (let tries = 0; tries < 30; tries++) {
    const x = mnx + Math.random() * (mxx - mnx);
    const y = mny + Math.random() * (mxy - mny);
    if (pointInPolygon([x, y], poly)) return [x, y];
  }
  return null;
}

/**
 * Compute the JIS X 0410 Japan Standard Regional Mesh code at a given
 * (lat, lng) and level (1=primary 80km, 2=secondary 10km, 3=tertiary 1km).
 * Returns the integer code as a string (4/6/8 digits).
 */
function meshCode(lat, lng, level) {
  // primary (1次)
  const p1 = Math.floor(lat * 1.5);                 // 緯度の0.40度単位 → ×1.5
  const p2 = Math.floor(lng) - 100;                 // 経度の整数部 - 100
  const code1 = `${p1}${String(p2).padStart(2, "0")}`;
  if (level === 1) return code1;
  // secondary (2次)
  const rLat = lat * 1.5 - p1;            // 0..1
  const rLng = lng - (p2 + 100);          // 0..1
  const s1 = Math.min(7, Math.floor(rLat * 8));
  const s2 = Math.min(7, Math.floor(rLng * 8));
  const code2 = `${code1}${s1}${s2}`;
  if (level === 2) return code2;
  // tertiary (3次)
  const r2Lat = rLat * 8 - s1;
  const r2Lng = rLng * 8 - s2;
  const t1 = Math.min(9, Math.floor(r2Lat * 10));
  const t2 = Math.min(9, Math.floor(r2Lng * 10));
  return `${code2}${t1}${t2}`;
}

function addMeshCell(layer, lat0, lng0, lat1, lng1, code, color, opacity) {
  const ring = [[lat0, lng0], [lat0, lng1], [lat1, lng1], [lat1, lng0]];
  const rect = L.rectangle([[lat0, lng0], [lat1, lng1]], {
    color, weight: 1, opacity, fillOpacity: 0.05, fillColor: color,
  });
  rect.bindTooltip(`メッシュコード ${code}<br/><small>${lat0.toFixed(3)},${lng0.toFixed(3)} 〜 ${lat1.toFixed(3)},${lng1.toFixed(3)}</small>`,
    { sticky: true, direction: "top", className: "chocho-tip" });
  rect.addTo(layer);
  return 1;
}

/**
 * Compute the Standard Deviation Ellipse parameters for a point cloud.
 *
 * Steps:
 *   1) Convert each (lat, lng) to a local equirectangular km-coordinate
 *      centred on the mean — flat-earth is fine at city/regional scales.
 *   2) Compute the population covariance matrix [[sxx, sxy],[sxy, syy]].
 *   3) Eigendecomposition (closed form for 2x2):
 *        λ = (sxx + syy)/2 ± sqrt(((sxx - syy)/2)^2 + sxy^2)
 *      Major axis = sqrt(λ_max), minor = sqrt(λ_min), rotation = angle
 *      of the eigenvector for λ_max measured from east (x-axis).
 *
 * @returns { cx, cy, aKm, bKm, rotation }  (cx/cy in degrees, rotation in radians)
 */
function computeSDE(latlngs) {
  const pts = latlngs.filter(p => Number.isFinite(p[0]) && Number.isFinite(p[1]));
  const n = pts.length;
  if (n < 3) return null;
  const meanLat = pts.reduce((s, p) => s + p[0], 0) / n;
  const meanLng = pts.reduce((s, p) => s + p[1], 0) / n;
  const cosLat = Math.cos(meanLat * Math.PI / 180);
  // Project to km
  const xs = pts.map(p => (p[1] - meanLng) * 111.0 * cosLat);
  const ys = pts.map(p => (p[0] - meanLat) * 111.0);
  let sxx = 0, syy = 0, sxy = 0;
  for (let i = 0; i < n; i++) {
    sxx += xs[i] * xs[i];
    syy += ys[i] * ys[i];
    sxy += xs[i] * ys[i];
  }
  sxx /= n; syy /= n; sxy /= n;
  const half = (sxx + syy) / 2;
  const diff = Math.sqrt(Math.max(0, ((sxx - syy) / 2) ** 2 + sxy * sxy));
  const lMax = half + diff;
  const lMin = Math.max(0, half - diff);
  // Eigenvector of λ_max: solves (sxx - λ) x + sxy y = 0
  let rot = 0;
  if (sxy !== 0) rot = Math.atan2(lMax - sxx, sxy);
  else if (sxx >= syy) rot = 0;
  else rot = Math.PI / 2;
  return {
    cx: meanLng, cy: meanLat,
    aKm: Math.sqrt(lMax),
    bKm: Math.sqrt(lMin),
    rotation: rot,
  };
}

/**
 * Spherical polygon area in km² using the L'Huilier-style integral.
 * Input: array of [lon, lat] pairs in degrees (auto-closed).
 * Same formula as scripts/build_muni_areas.py — calibrated to within ~1%
 * of MLIT official figures (北海道 0.3%, 東京 0.5%).
 */
function sphericalPolygonAreaKm2(ring) {
  if (!ring || ring.length < 3) return 0;
  const R = 6371.0088; // mean Earth radius (km)
  let closed = ring.slice();
  if (closed[0][0] !== closed[closed.length - 1][0] ||
      closed[0][1] !== closed[closed.length - 1][1]) closed.push(closed[0]);
  let s = 0;
  for (let i = 0; i < closed.length - 1; i++) {
    const [lon1, lat1] = closed[i];
    const [lon2, lat2] = closed[i + 1];
    s += (lon2 - lon1) * (Math.PI / 180) *
         (2 + Math.sin(lat1 * Math.PI / 180) + Math.sin(lat2 * Math.PI / 180));
  }
  return Math.abs(s) * R * R / 2;
}

/**
 * Scale a Polygon / MultiPolygon around (cx, cy) by `factor` (linear).
 * The visible area scales by factor² (so pass sqrt(v/max) to get
 * area-proportional cartogram cells).
 * Returns an array of rings in Leaflet [lat, lng] order, ready for
 * L.polygon() with multi-ring support.
 */
function scalePolygonAroundCenter(geom, cx, cy, factor) {
  if (!geom) return null;
  const scaleRing = (ring) => ring.map(([lng, lat]) => [
    cy + (lat - cy) * factor,
    cx + (lng - cx) * factor,
  ]);
  if (geom.type === "Polygon") return geom.coordinates.map(scaleRing);
  if (geom.type === "MultiPolygon") {
    const out = [];
    for (const poly of geom.coordinates) out.push(...poly.map(scaleRing));
    return out;
  }
  return null;
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, ch => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[ch]));
}
