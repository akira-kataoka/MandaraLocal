// =====================================================================
// main.js  -- App orchestration: state + DOM events
// =====================================================================

import { parseCsvText, loadCsvFile, loadSampleCsv, buildValueLookup, buildMuniIndex } from "./data.js";
import { computeBreaks } from "./classification.js";
import { getPalette } from "./color.js";
import { computeStats, formatNum, detectOutliers } from "./stats.js";
import { renderLegend } from "./legend.js";
import { MandaraMap } from "./map.js";
import { exportPng, exportSvg } from "./export.js";
import { loadSettings, saveSettings } from "./settings.js";
import { renderScatter } from "./scatter.js";
import { renderTable } from "./table.js";

// ----- State -----
const state = {
  level: "prefecture",   // "prefecture" | "municipality" | "chocho"
  chochoPref: "",        // chocho mode: current prefecture name (jp)
  chochoMuni: "",        // chocho mode: current municipality name (jp)
  chochoTowns: [],       // [{ id, town, lat, lng, koaza }]
  dataset: null,         // { rows, fields, unmatched, level }
  field: null,
  fieldB: null,
  compare: false,
  classes: 5,
  method: "quantile",
  palette: "YlOrRd",
  reverse: false,
  geojson: null,
  muniIndex: null,       // built once when municipality GeoJSON loaded
  breaks: [],
  colors: [],
  valueMap: null,
  mode: "choropleth",
  maxR: 32,
};

// ----- DOM cache -----
const $ = (id) => document.getElementById(id);
const els = {
  selectLevel:  $("select-level"),
  hintLevel:    $("hint-level"),
  rowPrefFilter:    $("row-pref-filter"),
  selectPrefFilter: $("select-pref-filter"),
  rowChocho:        $("row-chocho"),
  selectChoPref:    $("select-cho-pref"),
  rowChochoMuni:    $("row-chocho-muni"),
  selectChoMuni:    $("select-cho-muni"),
  loadSample:   $("btn-load-sample"),
  csvFile:      $("csv-file"),
  btnTemplate:  $("btn-download-template"),
  dataSummary:  $("data-summary"),
  panelField:   $("panel-field"),
  selectField:  $("select-field"),
  chkCompare:   $("chk-compare"),
  rowFieldB:    $("row-field-b"),
  selectFieldB: $("select-field-b"),
  paneB:        $("pane-b"),
  overlayB:        $("map-overlay-b"),
  overlayTitleB:   $("overlay-title-b"),
  overlayLegendB:  $("overlay-legend-b"),
  derivedA:     $("derived-a"),
  derivedOp:    $("derived-op"),
  derivedB:     $("derived-b"),
  derivedName:  $("derived-name"),
  btnDerived:   $("btn-add-derived"),
  selectMode:   $("select-mode"),
  rowSymbolSize:$("row-symbol-size"),
  inputMaxR:    $("input-maxr"),
  rowDotUnit:   $("row-dot-unit"),
  inputDotUnit: $("input-dotunit"),
  panelClass:   $("panel-class"),
  selectMethod: $("select-method"),
  inputClasses: $("input-classes"),
  selectPalette:$("select-palette"),
  chkReverse:   $("chk-reverse"),
  panelStats:   $("panel-stats"),
  statsTable:   $("stats-table"),
  chkOutliers:  $("chk-outliers"),
  outlierList:  $("outlier-list"),
  panelLegend:  $("panel-legend"),
  legendBox:    $("legend-container"),
  panelTable:   $("panel-table"),
  tableWrap:    $("table-wrap"),
  panelScatter: $("panel-scatter"),
  scatterX:     $("scatter-x"),
  scatterY:     $("scatter-y"),
  scatterCorr:  $("scatter-correlation"),
  scatterSvg:   $("scatter-svg"),
  tooltip:      $("tooltip"),
  mapSearch:      $("map-search"),
  searchInput:    $("search-input"),
  searchSuggest:  $("search-suggestions"),
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
const mapper  = new MandaraMap("map", els.tooltip);
let mapperB = null;       // created lazily on compare-on
let _syncing = false;     // re-entry guard for view sync

function ensureMapperB() {
  if (mapperB) return mapperB;
  mapperB = new MandaraMap("map-b", null);   // no shared tooltip
  // Two-way view sync
  const sync = (src, dst) => () => {
    if (_syncing) return;
    _syncing = true;
    dst.map.setView(src.map.getCenter(), src.map.getZoom(), { animate: false });
    _syncing = false;
  };
  mapper.map.on("move zoom",  sync(mapper, mapperB));
  mapperB.map.on("move zoom", sync(mapperB, mapper));
  return mapperB;
}

// ----- Geo data loaders (cached) -----
const geoCache = { prefecture: null, municipality: null };
let muniJpMap = null;   // id (string) -> { jp, en, pref }

async function getMuniJpMap() {
  if (muniJpMap) return muniJpMap;
  try {
    const res = await fetch("data/cities/muni_jp_names.json");
    if (res.ok) muniJpMap = await res.json();
    else muniJpMap = {};
  } catch { muniJpMap = {}; }
  return muniJpMap;
}

async function getGeo(level) {
  if (geoCache[level]) return geoCache[level];
  const url = level === "municipality"
    ? "data/cities/japan_municipalities.geojson"
    : "data/japan_prefectures.geojson";
  setSummary(`${level === "municipality" ? "市町村" : "都道府県"}境界データを読み込み中…`, "muted");
  const [resGeo] = await Promise.all([fetch(url), getMuniJpMap()]);
  if (!resGeo.ok) throw new Error(`GeoJSON load failed (${resGeo.status})`);
  const g = await resGeo.json();
  // For municipality level, inject Japanese names into each feature
  if (level === "municipality" && muniJpMap) {
    for (const f of g.features) {
      const rec = muniJpMap[String(f.properties.id)];
      if (rec && rec.jp) f.properties.name_jp = rec.jp;
    }
  }
  geoCache[level] = g;
  return g;
}

// ----- Chocho (町丁目) level via Geolonia japanese-addresses -----
const GEOLONIA_PREF_INDEX = "https://geolonia.github.io/japanese-addresses/api/ja.json";
let geoloniaIndex = null;

async function getGeoloniaIndex() {
  if (geoloniaIndex) return geoloniaIndex;
  const res = await fetch(GEOLONIA_PREF_INDEX);
  if (!res.ok) throw new Error(`Geolonia index load failed (${res.status})`);
  geoloniaIndex = await res.json();
  return geoloniaIndex;
}

async function fetchTowns(pref, muni) {
  const enc = encodeURIComponent(pref) + "/" + encodeURIComponent(muni) + ".json";
  const url = `https://geolonia.github.io/japanese-addresses/api/ja/${enc}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`町丁目データ取得失敗 (${res.status})`);
  const arr = await res.json();
  return arr.map((t, i) => ({ id: 1_000_000 + i, ...t }));
}

async function enterChochoMode() {
  els.rowPrefFilter.hidden = true;
  els.rowChocho.hidden = false;
  els.rowChochoMuni.hidden = false;
  els.mapSearch.hidden = true;
  state.muniIndex = null;

  if (!state.chochoPref) {
    const idx = await getGeoloniaIndex();
    const prefNames = Object.keys(idx);
    els.selectChoPref.innerHTML = prefNames.map(n => `<option>${n}</option>`).join("");
    state.chochoPref = prefNames[12] || prefNames[0];     // default to 東京都
    els.selectChoPref.value = state.chochoPref;
    populateChoMuni();
  }
  await loadChochoTowns();
  els.hintLevel.innerHTML = `Geolonia japanese-addresses (CC BY 4.0) から町丁目データを動的取得。<br/>
    CSV: 1列目=町名 (例: <code>西新宿</code>) でマッチ`;
}

function populateChoMuni() {
  const munis = geoloniaIndex[state.chochoPref] || [];
  els.selectChoMuni.innerHTML = munis.map(m => `<option>${m}</option>`).join("");
  if (!state.chochoMuni || !munis.includes(state.chochoMuni)) {
    state.chochoMuni = munis[0] || "";
  }
  els.selectChoMuni.value = state.chochoMuni;
}

async function loadChochoTowns() {
  if (!state.chochoPref || !state.chochoMuni) return;
  setSummary(`町丁目を取得中…  ${state.chochoPref} ${state.chochoMuni}`, "muted");
  try {
    state.chochoTowns = await fetchTowns(state.chochoPref, state.chochoMuni);
    mapper.applyTownPlot(state.chochoTowns);
    setSummary(`${state.chochoPref}${state.chochoMuni}: ${state.chochoTowns.length}町丁目を表示`, "success");
    if (state.dataset && state.dataset.level === "chocho" && state.field) refresh();
    else {
      // hide field panel until user loads CSV that matches chocho
      els.panelField.hidden = true;
      els.panelClass.hidden = true;
      els.panelStats.hidden = true;
      els.panelLegend.hidden = true;
      els.panelScatter.hidden = true;
      els.panelTable.hidden = true;
      els.overlay.hidden = true;
    }
  } catch (e) {
    setSummary("町丁目データ取得失敗: " + e.message, "error");
  }
}

async function applyLevel(level) {
  state.level = level;
  if (level === "chocho") {
    state.dataset = null;
    return enterChochoMode();
  }
  els.rowChocho.hidden = true;
  els.rowChochoMuni.hidden = true;
  try {
    const g = await getGeo(level);
    state.geojson = g;
    if (level === "municipality") {
      // Fallback: romanize → katakana for features that lack a confirmed jp name
      if (typeof wanakana !== "undefined") {
        for (const f of g.features) {
          if (!f.properties.name_jp && f.properties.name_en) {
            const kata = wanakana.toKatakana(f.properties.name_en.toLowerCase());
            f.properties.name_kata = kata;
          }
        }
      }
      state.muniIndex = buildMuniIndex(g);
      populatePrefFilter(g);
      els.rowPrefFilter.hidden = false;
      applyMunicipalityRender(g);
      const jpCount = Object.keys(muniJpMap || {}).length;
      const fallbackCount = g.features.length - jpCount;
      els.hintLevel.innerHTML = `${g.features.length}市町村ロード済み（漢字 ${jpCount} / カタカナ ${fallbackCount}）。<br/>
        CSV: 1列目=日本語名 (例: <code>新宿区</code>) / 英語名 (例: <code>Chiyoda</code>) / id (例: <code>13001</code>)`;
      els.mapSearch.hidden = false;
    } else {
      state.muniIndex = null;
      els.rowPrefFilter.hidden = true;
      els.mapSearch.hidden = true;
      els.searchSuggest.hidden = true;
      mapper.setBaseGeo(g, {
        nameFor: (p) => p.nam_ja || p.nam || `#${p.id}`
      });
      els.hintLevel.innerHTML = `47都道府県ロード済み。<br/>
        CSV: 1列目=都道府県名 (例: <code>東京都</code>) or コード (1〜47)`;
    }
    // Re-apply current dataset if its level matches
    if (state.dataset && state.dataset.level === level && state.field) {
      refresh();
    } else {
      // Different level → clear previous dataset/UI; user must reload CSV
      state.dataset = null;
      state.field = null;
      state.valueMap = null;
      mapper.resetColors();
      mapper.clearSymbols();
      els.overlay.hidden = true;
      els.panelField.hidden = true;
      els.panelClass.hidden = true;
      els.panelStats.hidden = true;
      els.panelLegend.hidden = true;
      els.panelScatter.hidden = true;
      els.panelTable.hidden = true;
    }
    setSummary("地図準備完了。サンプルまたはCSVを読み込んでください。", "muted");
  } catch (e) {
    setSummary("⚠ GeoJSON読み込み失敗: " + e.message, "error");
  }
}

// initial load
applyLevel(state.level);

els.selectLevel.addEventListener("change", () => {
  applyLevel(els.selectLevel.value);
});

els.selectPrefFilter.addEventListener("change", () => {
  if (state.geojson && state.level === "municipality") {
    applyMunicipalityRender(state.geojson);
    if (state.dataset && state.field) refresh();
  }
});
els.selectChoPref.addEventListener("change", () => {
  state.chochoPref = els.selectChoPref.value;
  state.chochoMuni = "";  // reset
  populateChoMuni();
  loadChochoTowns();
});
els.selectChoMuni.addEventListener("change", () => {
  state.chochoMuni = els.selectChoMuni.value;
  loadChochoTowns();
});

function populatePrefFilter(g) {
  const seen = new Map(); // code -> name
  for (const f of g.features) {
    const c = f.properties.pref_code;
    if (c && !seen.has(c)) seen.set(c, f.properties.pref_name);
  }
  els.selectPrefFilter.innerHTML = '<option value="">全国（1,742件）</option>';
  for (const code of [...seen.keys()].sort((a,b)=>a-b)) {
    const o = document.createElement("option");
    o.value = String(code);
    o.textContent = `${seen.get(code) || "#"+code}`;
    els.selectPrefFilter.appendChild(o);
  }
}

function applyMunicipalityRender(g) {
  const filterCode = els.selectPrefFilter.value
    ? parseInt(els.selectPrefFilter.value, 10) : null;
  const subset = filterCode == null ? g
    : { type: "FeatureCollection", features: g.features.filter(f => f.properties.pref_code === filterCode) };
  mapper.setBaseGeo(subset, {
    nameFor: (p) => {
      if (p.name_jp) return `${p.name_jp}（${p.pref_name || ""}）`;
      if (p.name_kata) return `${p.name_kata}（${p.pref_name || ""}）`;
      return `${p.name_en || "#"+p.id}（${p.pref_name || ""}）`;
    }
  });
}

// ----- Wire UI -----
els.loadSample.addEventListener("click", async () => {
  try {
    const ds = await loadSampleCsv(undefined, { level: state.level, muniIndex: state.muniIndex });
    onDatasetReady(ds, state.level === "municipality" ? "sample_tokyo_wards.csv" : "sample_population.csv");
  } catch (e) {
    setSummary("サンプル読み込み失敗: " + e.message, "error");
  }
});

els.csvFile.addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    const ds = await loadCsvFile(file, { level: state.level, muniIndex: state.muniIndex });
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
els.selectFieldB.addEventListener("change", () => {
  state.fieldB = els.selectFieldB.value;
  if (state.compare) refresh();
});
els.chkCompare.addEventListener("change", () => {
  state.compare = els.chkCompare.checked;
  els.rowFieldB.hidden = !state.compare;
  els.paneB.hidden = !state.compare;
  if (state.compare) {
    ensureMapperB();
    // Apply the same base geo to the second mapper
    if (state.geojson) {
      mapperB.setBaseGeo(state.geojson, {
        nameFor: state.level === "municipality"
          ? (p) => (p.name_jp || p.name_kata || p.name_en || "#"+p.id) + `（${p.pref_name||""}）`
          : (p) => p.nam_ja || p.nam || `#${p.id}`,
      });
      // Force Leaflet to recompute container size now that paneB is visible
      setTimeout(() => mapperB && mapperB.map.invalidateSize(), 50);
    }
  }
  setTimeout(() => mapper.map.invalidateSize(), 50);
  if (state.dataset && state.field) refresh();
});
els.selectMode.addEventListener("change", () => {
  state.mode = els.selectMode.value;
  els.rowSymbolSize.hidden = !(state.mode === "symbol" || state.mode === "both");
  els.rowDotUnit.hidden = state.mode !== "dot";
  refresh();
});
els.inputDotUnit.addEventListener("change", () => refresh());
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
els.chkOutliers.addEventListener("change", () => refresh());

els.scatterX.addEventListener("change", drawScatter);
els.scatterY.addEventListener("change", drawScatter);
els.btnDerived.addEventListener("click", addDerivedField);
els.btnTemplate.addEventListener("click", downloadTemplate);

function downloadTemplate() {
  if (!state.geojson) {
    setSummary("地図データがまだ読み込まれていません", "warn"); return;
  }
  // Build per-level rows
  let rows, header, fname;
  if (state.level === "municipality") {
    header = ["id","市区町村","都道府県","指標A","指標B"];
    rows = state.geojson.features.map(f => {
      const p = f.properties;
      return [p.id, p.name_jp || p.name_kata || p.name_en || "", p.pref_name || "", "", ""];
    }).sort((a,b) => a[0] - b[0]);
    fname = "mandara_template_municipalities.csv";
  } else {
    header = ["都道府県","指標A","指標B"];
    rows = state.geojson.features.map(f => [f.properties.nam_ja || f.properties.nam, "", ""])
      .sort((a,b) => a[0].localeCompare(b[0], "ja"));
    fname = "mandara_template_prefectures.csv";
  }
  const csv = [header.join(",")].concat(rows.map(r => r.map(csvEscape).join(","))).join("\n");
  // Add BOM so Excel opens UTF-8 correctly
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = fname;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  setSummary(`テンプレート「${fname}」をダウンロードしました（${rows.length}行）`, "success");
}

function csvEscape(v) {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

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

  // Field selectors (main + derived A/B)
  populateFieldSelects();
  els.selectField.value = state.field;

  // Reveal panels
  els.panelField.hidden = false;
  els.panelClass.hidden = false;
  els.panelStats.hidden = false;
  els.panelLegend.hidden = false;
  els.panelTable.hidden = false;
  if (ds.fields.length >= 2) {
    els.panelScatter.hidden = false;
    populateScatterSelectors(ds.fields);
  } else {
    els.panelScatter.hidden = true;
  }

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

  // proportional symbols / dot density
  if (state.mode === "symbol" || state.mode === "both") {
    mapper.applyProportionalSymbols(state.valueMap, { maxRadiusPx: state.maxR });
  } else if (state.mode === "dot") {
    const unit = Math.max(1, parseFloat(els.inputDotUnit.value || "10000"));
    mapper.applyDotDensity(state.geojson, state.valueMap, unit);
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

  // Compare pane (paneB)
  if (state.compare && state.fieldB) {
    const valuesB = state.dataset.rows.map(r => r.values[state.fieldB]);
    const { breaks: breaksB } = computeBreaks(valuesB, state.classes, state.method);
    const colorsB = getPalette(state.palette, Math.max(1, breaksB.length - 1), state.reverse);
    const valueMapB = buildValueLookup(state.dataset, state.fieldB);
    if (mapperB) {
      mapperB.applyChoropleth(valueMapB, breaksB, colorsB, state.fieldB);
    }
    renderLegend(els.overlayLegendB, breaksB, colorsB, { showNA: false });
    els.overlayB.hidden = false;
    els.overlayTitleB.textContent = state.fieldB;
  } else if (mapperB) {
    mapperB.resetColors();
    els.overlayB.hidden = true;
  }

  // Data table
  renderTable(els.tableWrap, state.dataset.rows, state.dataset.fields, onTableRowHover);

  // Outlier highlight
  applyOutlierHighlight(values);

  saveSettings(state);
}

function applyOutlierHighlight(values) {
  const out = detectOutliers(values);
  // Build list view first (always show — informative even when not highlighting)
  els.outlierList.innerHTML = "";
  const rows = state.dataset.rows;
  const hi = [...out.uppers].map(i => ({ row: rows[i], v: values[i] })).sort((a,b)=>b.v-a.v);
  const lo = [...out.lowers].map(i => ({ row: rows[i], v: values[i] })).sort((a,b)=>a.v-b.v);
  if (hi.length) {
    const s = document.createElement("div");
    s.className = "ol-section ol-high"; s.textContent = `上方外れ値 ${hi.length}件`;
    els.outlierList.appendChild(s);
    for (const { row, v } of hi.slice(0, 8)) {
      const it = document.createElement("div"); it.className = "ol-item";
      it.textContent = `${row.name || "#"+row.key}: ${formatNum(v)}`;
      it.addEventListener("mouseenter", () => mapper.highlightById(row.key));
      it.addEventListener("mouseleave", () => mapper.clearHighlight());
      els.outlierList.appendChild(it);
    }
  }
  if (lo.length) {
    const s = document.createElement("div");
    s.className = "ol-section ol-low"; s.textContent = `下方外れ値 ${lo.length}件`;
    els.outlierList.appendChild(s);
    for (const { row, v } of lo.slice(0, 8)) {
      const it = document.createElement("div"); it.className = "ol-item";
      it.textContent = `${row.name || "#"+row.key}: ${formatNum(v)}`;
      it.addEventListener("mouseenter", () => mapper.highlightById(row.key));
      it.addEventListener("mouseleave", () => mapper.clearHighlight());
      els.outlierList.appendChild(it);
    }
  }
  if (!hi.length && !lo.length) {
    const s = document.createElement("div"); s.className = "ol-section";
    s.textContent = "外れ値なし";
    els.outlierList.appendChild(s);
  }

  // Apply on-map marking when checkbox is on
  if (els.chkOutliers.checked) {
    const ids = new Set();
    [...out.uppers, ...out.lowers].forEach(i => ids.add(rows[i].key));
    mapper.markOutliers(ids);
  } else {
    mapper.clearOutlierMarks();
  }
}

function onTableRowHover(id, isOn) {
  if (isOn) mapper.highlightById(id);
  else      mapper.clearHighlight();
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

function populateFieldSelects() {
  const fields = state.dataset?.fields || [];
  for (const sel of [els.selectField, els.selectFieldB, els.derivedA, els.derivedB]) {
    const prev = sel.value;
    sel.innerHTML = "";
    for (const f of fields) {
      const o = document.createElement("option");
      o.value = f; o.textContent = f;
      sel.appendChild(o);
    }
    if (fields.includes(prev)) sel.value = prev;
  }
  if (fields.length >= 1) els.derivedA.value = fields[0];
  if (fields.length >= 2) els.derivedB.value = fields[1];
  if (!state.fieldB && fields.length >= 2) {
    state.fieldB = fields[1];
    els.selectFieldB.value = fields[1];
  }
}

const OP_FN = { div: (a,b) => b===0 ? null : a/b, mul: (a,b)=>a*b, add: (a,b)=>a+b, sub: (a,b)=>a-b };
const OP_SYM = { div: "÷", mul: "×", add: "+", sub: "−" };

function addDerivedField() {
  if (!state.dataset) return;
  const a = els.derivedA.value, b = els.derivedB.value, op = els.derivedOp.value;
  const explicit = els.derivedName.value.trim();
  const name = explicit || `${a} ${OP_SYM[op]} ${b}`;
  if (state.dataset.fields.includes(name)) {
    setSummary(`列「${name}」はすでに存在します`, "warn"); return;
  }
  const fn = OP_FN[op];
  for (const r of state.dataset.rows) {
    const va = r.values[a], vb = r.values[b];
    r.values[name] = (Number.isFinite(va) && Number.isFinite(vb)) ? fn(va, vb) : null;
  }
  state.dataset.fields.push(name);
  populateFieldSelects();
  els.selectField.value = name;
  state.field = name;
  els.derivedName.value = "";
  refresh();
  // scatter dropdowns refresh too
  if (state.dataset.fields.length >= 2) populateScatterSelectors(state.dataset.fields);
  setSummary(`派生列「${name}」を追加しました（${state.dataset.fields.length}列）`, "success");
}

function populateScatterSelectors(fields) {
  for (const sel of [els.scatterX, els.scatterY]) {
    sel.innerHTML = "";
    for (const f of fields) {
      const o = document.createElement("option");
      o.value = f; o.textContent = f;
      sel.appendChild(o);
    }
  }
  els.scatterX.value = fields[0];
  els.scatterY.value = fields[1] || fields[0];
  drawScatter();
}

function drawScatter() {
  if (!state.dataset) return;
  const xf = els.scatterX.value, yf = els.scatterY.value;
  const xs = state.dataset.rows.map(r => r.values[xf]);
  const ys = state.dataset.rows.map(r => r.values[yf]);
  const ids = state.dataset.rows.map(r => r.key);
  const { r, n } = renderScatter(els.scatterSvg, xs, ys, xf, yf, ids, onScatterHover);
  if (r == null) {
    els.scatterCorr.textContent = `n=${n} — 相関係数を計算できません`;
  } else {
    const strength = Math.abs(r) >= 0.7 ? "強い" : Math.abs(r) >= 0.4 ? "中程度の" : "弱い";
    const sign = r >= 0 ? "正" : "負";
    els.scatterCorr.innerHTML = `n=${n} · ピアソン相関 <strong>r = ${r.toFixed(3)}</strong> （${strength}${sign}の相関）`;
  }
}

function onScatterHover(id, isHot) {
  if (isHot) mapper.highlightById(id);
  else       mapper.clearHighlight();
}

function onMapHover(id, isHot) {
  const sel = els.scatterSvg.querySelector(`circle[data-id="${id}"]`);
  if (!sel) return;
  if (isHot) {
    sel.classList.add("is-hot");
    sel.setAttribute("r", "5");
  } else {
    sel.classList.remove("is-hot");
    sel.setAttribute("r", "3");
  }
}

mapper.onFeatureHover(onMapHover);

// ----- Search -----
let searchActiveIdx = -1;

els.searchInput.addEventListener("input", () => {
  const q = els.searchInput.value.trim();
  if (!q || !state.geojson || state.level !== "municipality") {
    els.searchSuggest.hidden = true; return;
  }
  const qLower = q.toLowerCase();
  const hits = [];
  for (const f of state.geojson.features) {
    const p = f.properties;
    const hay = [p.name_jp, p.name_kata, p.name_en].filter(Boolean);
    if (hay.some(s => s.toLowerCase().includes(qLower) || s.startsWith(q))) {
      hits.push(p);
      if (hits.length >= 20) break;
    }
  }
  els.searchSuggest.innerHTML = "";
  if (!hits.length) {
    els.searchSuggest.hidden = true; return;
  }
  for (const p of hits) {
    const li = document.createElement("li");
    const display = p.name_jp || p.name_kata || p.name_en;
    li.innerHTML = `${display}<span class="pref">${p.pref_name || ""}</span>`;
    li.dataset.id = p.id;
    li.addEventListener("mousedown", (e) => {
      e.preventDefault();
      selectSuggestion(p.id);
    });
    els.searchSuggest.appendChild(li);
  }
  els.searchSuggest.hidden = false;
  searchActiveIdx = -1;
});

els.searchInput.addEventListener("keydown", (e) => {
  const items = [...els.searchSuggest.querySelectorAll("li")];
  if (e.key === "ArrowDown" && items.length) {
    e.preventDefault();
    searchActiveIdx = Math.min(items.length - 1, searchActiveIdx + 1);
    setActiveSuggestion(items);
  } else if (e.key === "ArrowUp" && items.length) {
    e.preventDefault();
    searchActiveIdx = Math.max(0, searchActiveIdx - 1);
    setActiveSuggestion(items);
  } else if (e.key === "Enter") {
    e.preventDefault();
    const target = items[Math.max(0, searchActiveIdx)];
    if (target) selectSuggestion(parseInt(target.dataset.id, 10));
  } else if (e.key === "Escape") {
    els.searchSuggest.hidden = true;
  }
});

els.searchInput.addEventListener("blur", () => {
  setTimeout(() => { els.searchSuggest.hidden = true; }, 150);
});
els.searchInput.addEventListener("focus", () => {
  if (els.searchSuggest.children.length) els.searchSuggest.hidden = false;
});

function setActiveSuggestion(items) {
  items.forEach((el, i) => el.classList.toggle("active", i === searchActiveIdx));
}

function selectSuggestion(id) {
  mapper.zoomToFeature(id);
  els.searchInput.value = "";
  els.searchSuggest.hidden = true;
}

function setSummary(text, kind) {
  els.dataSummary.textContent = text;
  els.dataSummary.className = "data-summary " + (kind || "");
}
function hasMissing(values) {
  return values.some(v => v == null || !Number.isFinite(v));
}
function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }
