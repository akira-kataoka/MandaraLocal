// =====================================================================
// main.js  -- App orchestration: state + DOM events
// =====================================================================

import { parseCsvText, loadCsvFile, loadSampleCsv, buildValueLookup } from "./data.js";
import { computeBreaks } from "./classification.js";
import { getPalette } from "./color.js";
import { computeStats, formatNum } from "./stats.js";
import { renderLegend } from "./legend.js";
import { MandaraMap } from "./map.js";
import { exportPng, exportSvg } from "./export.js";
import { loadSettings, saveSettings } from "./settings.js";

// ----- State -----
const state = {
  dataset: null,        // { rows, fields, unmatched }
  field: null,          // selected field name
  classes: 5,
  method: "quantile",
  palette: "YlOrRd",
  reverse: false,
  geojson: null,
  breaks: [],
  colors: [],
  valueMap: null,
  mode: "choropleth",   // "choropleth" | "symbol" | "both"
  maxR: 32,
};

// ----- DOM cache -----
const $ = (id) => document.getElementById(id);
const els = {
  loadSample:   $("btn-load-sample"),
  csvFile:      $("csv-file"),
  dataSummary:  $("data-summary"),
  panelField:   $("panel-field"),
  selectField:  $("select-field"),
  selectMode:   $("select-mode"),
  rowSymbolSize:$("row-symbol-size"),
  inputMaxR:    $("input-maxr"),
  panelClass:   $("panel-class"),
  selectMethod: $("select-method"),
  inputClasses: $("input-classes"),
  selectPalette:$("select-palette"),
  chkReverse:   $("chk-reverse"),
  panelStats:   $("panel-stats"),
  statsTable:   $("stats-table"),
  panelLegend:  $("panel-legend"),
  legendBox:    $("legend-container"),
  tooltip:      $("tooltip"),
  overlay:        $("map-overlay"),
  overlayTitle:   $("overlay-title"),
  overlayLegend:  $("overlay-legend"),
  overlayFooter:  $("overlay-footer"),
  btnPng:       $("btn-export-png"),
  btnSvg:       $("btn-export-svg"),
};

// ----- Restore prior session settings -----
(() => {
  const saved = loadSettings();
  if (!saved) return;
  Object.assign(state, saved);
  if (saved.mode)    els.selectMode.value    = saved.mode;
  if (saved.method)  els.selectMethod.value  = saved.method;
  if (saved.palette) els.selectPalette.value = saved.palette;
  if (saved.classes) els.inputClasses.value  = saved.classes;
  if (saved.maxR)    els.inputMaxR.value     = saved.maxR;
  if (saved.reverse !== undefined) els.chkReverse.checked = !!saved.reverse;
  els.rowSymbolSize.hidden = state.mode === "choropleth";
})();

// ----- Map -----
const mapper = new MandaraMap("map", els.tooltip);

// Load the prefecture GeoJSON on startup
(async function bootstrap() {
  try {
    const res = await fetch("data/japan_prefectures.geojson");
    if (!res.ok) throw new Error(`GeoJSON load failed (${res.status})`);
    state.geojson = await res.json();
    mapper.setBaseGeo(state.geojson);
    setSummary("地図準備完了。サンプルまたはCSVを読み込んでください。", "muted");
  } catch (e) {
    setSummary("⚠ 都道府県GeoJSONの読み込みに失敗しました: " + e.message, "error");
  }
})();

// ----- Wire UI -----
els.loadSample.addEventListener("click", async () => {
  try {
    const ds = await loadSampleCsv();
    onDatasetReady(ds, "sample_population.csv");
  } catch (e) {
    setSummary("サンプル読み込み失敗: " + e.message, "error");
  }
});

els.csvFile.addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    const ds = await loadCsvFile(file);
    onDatasetReady(ds, file.name);
  } catch (err) {
    setSummary("CSV読み込み失敗: " + err.message, "error");
  } finally {
    e.target.value = "";
  }
});

els.selectField.addEventListener("change", () => {
  state.field = els.selectField.value;
  refresh();
});
els.selectMode.addEventListener("change", () => {
  state.mode = els.selectMode.value;
  els.rowSymbolSize.hidden = state.mode === "choropleth";
  refresh();
});
els.inputMaxR.addEventListener("change", () => {
  const n = clamp(parseInt(els.inputMaxR.value || "32", 10), 8, 80);
  els.inputMaxR.value = n;
  state.maxR = n;
  refresh();
});
els.selectMethod.addEventListener("change", () => {
  state.method = els.selectMethod.value;
  refresh();
});
els.inputClasses.addEventListener("change", () => {
  const n = clamp(parseInt(els.inputClasses.value || "5", 10), 2, 9);
  els.inputClasses.value = n;
  state.classes = n;
  refresh();
});
els.selectPalette.addEventListener("change", () => {
  state.palette = els.selectPalette.value;
  refresh();
});
els.chkReverse.addEventListener("change", () => {
  state.reverse = els.chkReverse.checked;
  refresh();
});

els.btnPng.addEventListener("click", () => {
  const wrap = document.querySelector(".map-wrap");
  const fname = `mandara_${(state.field || "map").replace(/\s+/g, "_")}.png`;
  exportPng(wrap, fname);
});
els.btnSvg.addEventListener("click", () => {
  if (!state.geojson) {
    alert("地図データが読み込まれていません。");
    return;
  }
  const fname = `mandara_${(state.field || "map").replace(/\s+/g, "_")}.svg`;
  exportSvg({
    geojson: state.geojson,
    valueMap: state.valueMap,
    breaks: state.breaks,
    colors: state.colors,
    title: state.field,
  }, fname);
});

// ----- Handlers -----
function onDatasetReady(ds, label) {
  state.dataset = ds;
  // pick first numeric field as default
  state.field = ds.fields[0];

  // Field selector
  els.selectField.innerHTML = "";
  for (const f of ds.fields) {
    const o = document.createElement("option");
    o.value = f; o.textContent = f;
    els.selectField.appendChild(o);
  }
  els.selectField.value = state.field;

  // Reveal panels
  els.panelField.hidden = false;
  els.panelClass.hidden = false;
  els.panelStats.hidden = false;
  els.panelLegend.hidden = false;

  const msg = `${label}: ${ds.rows.length}件 / ${ds.fields.length}列を読み込みました。`;
  const warn = ds.unmatched.length
    ? ` 未マッチ ${ds.unmatched.length}件: ${ds.unmatched.slice(0,3).join("、")}${ds.unmatched.length>3 ? "…" : ""}`
    : "";
  setSummary(msg + warn, ds.unmatched.length ? "warn" : "success");

  refresh();
}

function refresh() {
  if (!state.dataset || !state.field) return;
  const values = state.dataset.rows.map(r => r.values[state.field]);
  const { breaks } = computeBreaks(values, state.classes, state.method);
  state.breaks = breaks;
  state.colors = getPalette(state.palette, Math.max(1, breaks.length - 1), state.reverse);
  state.valueMap = buildValueLookup(state.dataset, state.field);

  // choropleth coloring (or reset to neutral if "symbol" only)
  if (state.mode === "symbol") {
    mapper.resetColors();
    // tooltip still needs the value lookup, so attach via applyChoropleth with neutral colors
    const neutral = state.colors.map(() => "#e5e7eb");
    mapper.applyChoropleth(state.valueMap, state.breaks, neutral, state.field);
  } else {
    mapper.applyChoropleth(state.valueMap, state.breaks, state.colors, state.field);
  }

  // proportional symbols
  if (state.mode === "symbol" || state.mode === "both") {
    mapper.applyProportionalSymbols(state.valueMap, { maxRadiusPx: state.maxR });
  } else {
    mapper.clearSymbols();
  }

  const naFlag = hasMissing(values);
  renderLegend(els.legendBox, state.breaks, state.colors, { title: state.field, showNA: naFlag });
  renderLegend(els.overlayLegend, state.breaks, state.colors, { showNA: naFlag });
  els.overlay.hidden = false;
  els.overlayTitle.textContent = state.field;
  els.overlayFooter.textContent = `MandaraLocal · ${new Date().toLocaleDateString("ja-JP")}`;

  renderStats(values);
  saveSettings(state);
}

function renderStats(values) {
  const s = computeStats(values);
  const rows = [
    ["件数 (n)", s.n],
    ["欠損", s.missing],
    ["合計", s.sum != null ? formatNum(s.sum) : "—"],
    ["平均", s.mean != null ? formatNum(s.mean) : "—"],
    ["中央値", s.median != null ? formatNum(s.median) : "—"],
    ["最小", s.min != null ? formatNum(s.min) : "—"],
    ["最大", s.max != null ? formatNum(s.max) : "—"],
    ["範囲", s.range != null ? formatNum(s.range) : "—"],
    ["標準偏差", s.std != null ? formatNum(s.std) : "—"],
  ];
  els.statsTable.innerHTML = rows.map(([k,v]) =>
    `<tr><td>${k}</td><td>${v}</td></tr>`
  ).join("");
}

function setSummary(text, kind) {
  els.dataSummary.textContent = text;
  els.dataSummary.className = "data-summary " + (kind || "");
}
function hasMissing(values) {
  return values.some(v => v == null || !Number.isFinite(v));
}
function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }
