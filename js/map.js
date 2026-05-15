// =====================================================================
// map.js  -- Leaflet map setup + GeoJSON choropleth layer
// =====================================================================

import { classifyValue } from "./classification.js";
import { formatNum } from "./stats.js";

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
    this._lookupFn = null;     // (prefCode) -> {value, classIndex, color}
    this._fieldName = "";
    this._mapEl = document.getElementById(elId);
    this.symbolLayer = L.layerGroup().addTo(this.map);
    this._centroidCache = new Map(); // prefCode -> [lat, lng]
  }

  /**
   * @param geojson GeoJSON FeatureCollection with properties.id = pref code
   */
  setBaseGeo(geojson) {
    if (this.layer) {
      this.map.removeLayer(this.layer);
      this.layer = null;
    }
    this.layer = L.geoJSON(geojson, {
      style: () => this._defaultStyle(),
      onEachFeature: (feat, lyr) => this._bindInteractions(feat, lyr),
    }).addTo(this.map);

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
      lyr.setStyle({ weight: 2, color: HOVER_OUTLINE });
      lyr.bringToFront();
      this._showTooltip(feature, e);
    });
    lyr.on("mousemove", (e) => this._showTooltip(feature, e));
    lyr.on("mouseout", () => {
      this.layer.resetStyle(lyr);
      this._hideTooltip();
    });
  }

  _showTooltip(feature, e) {
    if (!this.tooltipEl) return;
    const code = feature.properties.id;
    const name = feature.properties.nam_ja || feature.properties.nam || `#${code}`;
    let valueText = "";
    if (this._lookupFn) {
      const info = this._lookupFn(code);
      if (info && info.value != null) {
        valueText = ` <span class="val">${formatNum(info.value)}</span>`;
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

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, ch => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[ch]));
}
