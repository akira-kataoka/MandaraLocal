// =====================================================================
// main.js  -- App orchestration: state + DOM events
// =====================================================================

import { parseCsvText, loadCsvFile, loadSampleCsv, buildValueLookup, buildMuniIndex, buildTownIndex } from "./data.js";
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
  townIndex: null,       // built when towns load
  shapeGeo: null,        // user-uploaded Shapefile -> GeoJSON
  shapeKey: null,        // property field name used as join key
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
  rowShapeUpload:   $("row-shape-upload"),
  shapeFile:        $("shape-file"),
  rowShapeKey:      $("row-shape-keyfield"),
  shapeKeyField:    $("shape-keyfield"),
  rowLatlngUpload:  $("row-latlng-upload"),
  latlngFile:       $("latlng-file"),
  hintLatlng:       $("hint-latlng"),
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
  palettePreview: $("palette-preview"),
  panelStats:   $("panel-stats"),
  statsTable:   $("stats-table"),
  chkOutliers:  $("chk-outliers"),
  outlierList:  $("outlier-list"),
  filterField:  $("filter-field"),
  filterOp:     $("filter-op"),
  filterValue:  $("filter-value"),
  rowFilterValue2: $("row-filter-value2"),
  filterValue2: $("filter-value2"),
  btnFilterApply: $("btn-filter-apply"),
  btnFilterClear: $("btn-filter-clear"),
  filterResult: $("filter-result"),
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
  btnCsv:       $("btn-export-csv"),
  btnMeasure:   $("btn-measure"),
  btnArea:      $("btn-area"),
  btnTheme:     $("btn-theme"),
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
updatePalettePreview();

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

// ----- Lat/Lng CSV level (any custom point dataset) -----
const LAT_PATTERNS = /^(lat|latitude|緯度|y)$/i;
const LNG_PATTERNS = /^(lng|lon|long|longitude|経度|x)$/i;
const NAME_PATTERNS = /^(name|名前|名称|地名|地点名|施設|store)$/i;

async function enterLatLngMode() {
  els.rowLatlngUpload.hidden = false;
  els.hintLatlng.hidden = false;
  els.hintLevel.innerHTML = `緯度経度を含む任意のCSVから点データを地図化します。<br/>
    列名に「緯度/lat」「経度/lng」を含めれば自動認識、別途数値列があれば階級色塗り分け可能。`;
  setSummary("「緯度経度CSV を開く」から任意のCSVを選択してください", "muted");
}

async function handleLatLngFile(file) {
  setSummary(`CSV を解析中…  ${file.name}`, "muted");
  try {
    const text = await file.text();
    const parsed = Papa.parse(text.replace(/^﻿/, "").replace(/\r\n?/g, "\n").trim(), {
      header: true, skipEmptyLines: true,
    });
    if (!parsed.data || !parsed.data.length) throw new Error("空CSVです");
    const headers = (parsed.meta.fields || []).map(h => h.trim());
    const latCol = headers.find(h => LAT_PATTERNS.test(h));
    const lngCol = headers.find(h => LNG_PATTERNS.test(h));
    if (!latCol || !lngCol) {
      throw new Error("緯度・経度の列が見つかりません（列名に lat/lng などを含めてください）");
    }
    const nameCol = headers.find(h => NAME_PATTERNS.test(h)) || headers[0];
    // numeric fields = everything except lat/lng/name/text cols
    const towns = [];
    const numericFields = new Set();
    parsed.data.forEach((r, i) => {
      const lat = parseFloat(r[latCol]);
      const lng = parseFloat(r[lngCol]);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      const t = {
        id: 2_000_000 + i,
        town: String(r[nameCol] || `point-${i+1}`).trim(),
        koaza: "",
        lat, lng,
        values: {},
      };
      for (const h of headers) {
        if (h === latCol || h === lngCol || h === nameCol) continue;
        const num = parseFloat(String(r[h]).replace(/,/g, ""));
        if (Number.isFinite(num)) {
          t.values[h] = num;
          numericFields.add(h);
        }
      }
      towns.push(t);
    });
    if (!towns.length) throw new Error("有効な緯度経度を含む行がありません");
    state.chochoTowns = towns;
    state.townIndex = buildTownIndex(towns);
    // Build a synthetic dataset so CSV-based fields plug into the existing pipeline
    const fields = [...numericFields];
    state.dataset = {
      level: "chocho",
      fields,
      rows: towns.map(t => ({ key: t.id, name: t.town, values: t.values })),
      unmatched: [],
    };
    mapper.applyTownPlot(towns);
    setSummary(`${file.name}: ${towns.length}点を地図化 (数値列 ${fields.length}列)`, "success");
    if (fields.length) {
      state.field = fields[0];
      populateFieldSelects();
      els.selectField.value = state.field;
      els.panelField.hidden = false;
      els.panelClass.hidden = false;
      els.panelStats.hidden = false;
      els.panelLegend.hidden = false;
      els.panelTable.hidden = false;
      if (fields.length >= 2) {
        els.panelScatter.hidden = false;
        populateScatterSelectors(fields);
      }
      refresh();
    }
  } catch (e) {
    setSummary("緯度経度CSV読み込み失敗: " + e.message, "error");
  }
}

// ----- Shapefile (user uploaded) level -----
async function enterShapeMode() {
  els.rowShapeUpload.hidden = false;
  els.rowShapeKey.hidden = !!state.shapeGeo ? false : true;
  if (state.shapeGeo) {
    applyShapeRender();
  } else {
    setSummary("Shapefile (.shp+.dbf を1つの zip にまとめて) を選んで読み込んでください", "muted");
    els.hintLevel.innerHTML = `任意の Shapefile (zip) を読み込んで主題図に利用できます。<br/>
      <code>.shp</code> と <code>.dbf</code> を同じ名前で 1つの zip にまとめてアップロードしてください。`;
  }
}

function applyShapeRender() {
  if (!state.shapeGeo) return;
  // attach a property called "id" (used elsewhere) based on the chosen key
  const key = state.shapeKey || els.shapeKeyField.value;
  state.shapeKey = key;
  for (let i = 0; i < state.shapeGeo.features.length; i++) {
    const p = state.shapeGeo.features[i].properties || {};
    p.id = key && p[key] != null ? String(p[key]) : `shp-${i}`;
    state.shapeGeo.features[i].properties = p;
  }
  state.geojson = state.shapeGeo;
  mapper.setBaseGeo(state.shapeGeo, {
    nameFor: (p) => key && p[key] != null ? String(p[key]) : `#${p.id}`,
  });
  setSummary(`Shapefile を読み込みました: ${state.shapeGeo.features.length} features`, "success");
}

async function handleShapeFile(file) {
  if (typeof shp === "undefined") {
    setSummary("shpjs ライブラリが読み込まれていません", "error"); return;
  }
  setSummary(`Shapefile を解析中…  ${file.name}`, "muted");
  try {
    const buf = await file.arrayBuffer();
    const geo = await shp(buf);
    // shpjs may return an array (one per layer) or a single FeatureCollection
    const fc = Array.isArray(geo) ? geo[0] : geo;
    if (!fc || !fc.features || !fc.features.length) {
      throw new Error("有効なフィーチャが見つかりません");
    }
    state.shapeGeo = fc;
    // pick field choices: every property key that's a string
    const sample = fc.features[0].properties || {};
    const keys = Object.keys(sample);
    els.shapeKeyField.innerHTML = keys.map(k => `<option>${k}</option>`).join("");
    state.shapeKey = keys[0];
    els.shapeKeyField.value = state.shapeKey;
    els.rowShapeKey.hidden = false;
    applyShapeRender();
  } catch (e) {
    setSummary("Shapefile 読み込み失敗: " + e.message, "error");
  }
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
    const prefList = document.getElementById("cho-pref-list");
    prefList.innerHTML = prefNames.map(n => `<option value="${n}"></option>`).join("");
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
  const muniList = document.getElementById("cho-muni-list");
  muniList.innerHTML = munis.map(m => `<option value="${m}"></option>`).join("");
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
    state.townIndex = buildTownIndex(state.chochoTowns);
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
  // Defensive reset: always start with ALL level-specific UIs hidden,
  // then let the active branch reveal what it needs.
  els.rowChocho.hidden = true;
  els.rowChochoMuni.hidden = true;
  els.rowPrefFilter.hidden = true;
  els.rowShapeUpload.hidden = true;
  els.rowShapeKey.hidden = true;
  els.rowLatlngUpload.hidden = true;
  els.hintLatlng.hidden = true;
  if (els.mapSearch) els.mapSearch.hidden = true;
  if (els.searchSuggest) els.searchSuggest.hidden = true;

  if (level === "chocho") {
    state.dataset = null;
    return enterChochoMode();
  }
  if (level === "shape") {
    state.dataset = null;
    return enterShapeMode();
  }
  if (level === "latlng") {
    state.dataset = null;
    return enterLatLngMode();
  }
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
els.shapeFile.addEventListener("change", (e) => {
  const file = e.target.files?.[0];
  if (file) handleShapeFile(file);
  e.target.value = "";
});
els.latlngFile.addEventListener("change", (e) => {
  const file = e.target.files?.[0];
  if (file) handleLatLngFile(file);
  e.target.value = "";
});
els.shapeKeyField.addEventListener("change", () => {
  state.shapeKey = els.shapeKeyField.value;
  applyShapeRender();
});

function populatePrefFilter(g) {
  const seen = new Map(); // code -> name
  for (const f of g.features) {
    const c = f.properties.pref_code;
    if (c && !seen.has(c)) seen.set(c, f.properties.pref_name);
  }
  // datalist: list of prefecture names (and codes as suggestions)
  const list = document.getElementById("pref-filter-list");
  list.innerHTML = "";
  // include the "all-Japan" empty option visually as a hint
  for (const code of [...seen.keys()].sort((a,b)=>a-b)) {
    const o = document.createElement("option");
    o.value = seen.get(code) || `#${code}`;
    o.label = `${code}`;
    list.appendChild(o);
  }
  // store the name→code map on the element for the change handler
  els.selectPrefFilter._codeOf = (val) => {
    if (!val) return null;
    for (const [c, n] of seen) if (n === val.trim()) return c;
    const num = parseInt(val, 10);
    return Number.isFinite(num) && seen.has(num) ? num : null;
  };
}

function applyMunicipalityRender(g) {
  const fn = els.selectPrefFilter._codeOf;
  const filterCode = fn ? fn(els.selectPrefFilter.value) : null;
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
function csvParseOpts() {
  return {
    level: state.level,
    muniIndex: state.muniIndex,
    townIndex: state.townIndex,
  };
}

els.loadSample.addEventListener("click", async () => {
  try {
    let target;
    if (state.level === "municipality") target = "data/sample_all_municipalities.csv";
    else if (state.level === "chocho")  target = "data/sample_chocho_shinjuku.csv";
    else                                  target = "data/sample_population.csv";
    const ds = await loadSampleCsv(target, csvParseOpts());
    onDatasetReady(ds, target.split("/").pop());
  } catch (e) {
    setSummary("サンプル読み込み失敗: " + e.message, "error");
  }
});

els.csvFile.addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    const ds = await loadCsvFile(file, csvParseOpts());
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
  updatePalettePreview();
  refresh();
});
els.selectPalette.addEventListener("change", () => {
  state.palette = els.selectPalette.value;
  updatePalettePreview();
  refresh();
});
els.chkReverse.addEventListener("change", () => {
  state.reverse = els.chkReverse.checked;
  updatePalettePreview();
  refresh();
});

function updatePalettePreview() {
  if (!els.palettePreview) return;
  const cols = getPalette(state.palette, state.classes, state.reverse);
  els.palettePreview.innerHTML = "";
  for (const c of cols) {
    const sp = document.createElement("span");
    sp.style.background = c;
    els.palettePreview.appendChild(sp);
  }
}
els.chkOutliers.addEventListener("change", () => refresh());
els.filterOp.addEventListener("change", () => {
  els.rowFilterValue2.hidden = els.filterOp.value !== "between";
});
els.btnFilterApply.addEventListener("click", applyAttributeFilter);
els.btnFilterClear.addEventListener("click", clearAttributeFilter);

function applyAttributeFilter() {
  if (!state.dataset) return;
  const field = els.filterField.value;
  const op = els.filterOp.value;
  const v1 = parseFloat(els.filterValue.value);
  const v2 = parseFloat(els.filterValue2.value);
  if (!Number.isFinite(v1)) {
    els.filterResult.textContent = "値を入力してください";
    els.filterResult.className = "data-summary warn";
    return;
  }
  const test = (x) => {
    if (!Number.isFinite(x)) return false;
    switch (op) {
      case ">":  return x >  v1;
      case ">=": return x >= v1;
      case "<":  return x <  v1;
      case "<=": return x <= v1;
      case "==": return x === v1;
      case "!=": return x !== v1;
      case "between": return Number.isFinite(v2) && x >= Math.min(v1,v2) && x <= Math.max(v1,v2);
      default: return false;
    }
  };
  const matched = new Set();
  for (const r of state.dataset.rows) {
    if (test(r.values[field])) matched.add(r.key);
  }
  mapper.markOutliers(matched);   // reuse the outlier-marking style for emphasis
  els.filterResult.textContent = `条件に一致: ${matched.size}件 / 全${state.dataset.rows.length}件`;
  els.filterResult.className = "data-summary success";
}

function clearAttributeFilter() {
  mapper.clearOutlierMarks();
  els.filterResult.textContent = "";
}

els.scatterX.addEventListener("change", drawScatter);
els.scatterY.addEventListener("change", drawScatter);
els.btnDerived.addEventListener("click", addDerivedField);
els.btnTemplate.addEventListener("click", downloadTemplate);
els.btnCsv.addEventListener("click", exportCurrentCsv);
els.btnTheme.addEventListener("click", toggleTheme);

let measureOn = false;
let areaOn = false;

function toggleMeasure(on) {
  measureOn = on;
  if (on) {
    if (areaOn) toggleArea(false);
    mapper.enableMeasureTool();
    els.btnMeasure.classList.add("btn-primary");
    setSummary("地図を2点クリックして距離を測定。3点目で再開始。", "muted");
  } else {
    mapper.disableMeasureTool();
    els.btnMeasure.classList.remove("btn-primary");
  }
}
function toggleArea(on) {
  areaOn = on;
  if (on) {
    if (measureOn) toggleMeasure(false);
    mapper.enableAreaTool();
    els.btnArea.classList.add("btn-primary");
    setSummary("クリックで頂点を追加・ダブルクリックで面積を確定 (km² / m²)", "muted");
  } else {
    mapper.disableAreaTool();
    els.btnArea.classList.remove("btn-primary");
  }
}
els.btnMeasure.addEventListener("click", () => toggleMeasure(!measureOn));
els.btnArea.addEventListener("click", () => toggleArea(!areaOn));

function toggleTheme() {
  const next = document.body.classList.toggle("dark");
  try { localStorage.setItem("mandara_theme", next ? "dark" : "light"); } catch {}
}
(function applyInitialTheme() {
  try {
    const t = localStorage.getItem("mandara_theme");
    if (t === "dark") document.body.classList.add("dark");
  } catch {}
})();

// ----- Collapsible side panels -----
(function setupCollapsiblePanels() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem("mandara_panels") || "{}"); } catch {}
  for (const panel of document.querySelectorAll(".sidebar .panel")) {
    const h2 = panel.querySelector("h2");
    if (!h2) continue;
    const key = h2.textContent.trim().slice(0, 32);
    if (saved[key]) panel.classList.add("collapsed");
    h2.addEventListener("click", () => {
      panel.classList.toggle("collapsed");
      saved[key] = panel.classList.contains("collapsed");
      try { localStorage.setItem("mandara_panels", JSON.stringify(saved)); } catch {}
    });
  }
})();

function exportCurrentCsv() {
  if (!state.dataset) { setSummary("先にデータを読み込んでください", "warn"); return; }
  const f = state.dataset.fields;
  const header = ["地域", ...f];
  const rows = state.dataset.rows.map(r => [r.name || ("#"+r.key), ...f.map(k => r.values[k] ?? "")]);
  const csv = [header.map(csvEscape).join(",")]
    .concat(rows.map(r => r.map(csvEscape).join(","))).join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `mandara_data_${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  setSummary(`データを ${a.download} としてダウンロードしました（${rows.length}行 / ${f.length}列）`, "success");
}

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
    ? ` ⚠ 地名と一致しなかった ${ds.unmatched.length}件: ${ds.unmatched.slice(0,5).join("、")}${ds.unmatched.length>5 ? `…他${ds.unmatched.length-5}件` : ""}`
    : "";
  setSummary(msg + warn, ds.unmatched.length ? "warn" : "success");
  if (ds.rows.length === 0) {
    setSummary(`${label}: マッチした行が0件です。1列目の地域名/コードを確認してください。`, "error");
  }

  refresh();
}

function refresh() {
  if (!state.dataset || !state.field) return;
  const values = state.dataset.rows.map(r => r.values[state.field]);
  const { breaks } = computeBreaks(values, state.classes, state.method);
  state.breaks = breaks;
  state.colors = getPalette(state.palette, Math.max(1, breaks.length - 1), state.reverse);
  state.valueMap = buildValueLookup(state.dataset, state.field);

  // chocho mode: just paint town circles by value
  if (state.level === "chocho") {
    mapper.applyTownPlot(state.chochoTowns, state.valueMap, state.breaks, state.colors, state.field);
    const naFlag = hasMissing(values);
    renderLegend(els.legendBox, state.breaks, state.colors, { title: state.field, showNA: naFlag });
    renderLegend(els.overlayLegend, state.breaks, state.colors, { showNA: naFlag });
    els.overlay.hidden = false;
    els.overlayTitle.textContent = state.field;
    els.overlayFooter.textContent = `MandaraNext ·${state.chochoPref}${state.chochoMuni} · ${new Date().toLocaleDateString("ja-JP")}`;
    renderStats(values);
    renderTable(els.tableWrap, state.dataset.rows, state.dataset.fields, () => {});
    saveSettings(state);
    return;
  }

  // choropleth coloring (or reset to neutral if "symbol" only)
  if (state.mode === "symbol") {
    mapper.resetColors();
    // tooltip still needs the value lookup, so attach via applyChoropleth with neutral colors
    const neutral = state.colors.map(() => "#e5e7eb");
    mapper.applyChoropleth(state.valueMap, state.breaks, neutral, state.field);
  } else {
    mapper.applyChoropleth(state.valueMap, state.breaks, state.colors, state.field);
  }

  // proportional symbols / dot density / labels
  if (state.mode === "symbol" || state.mode === "both") {
    mapper.applyProportionalSymbols(state.valueMap, { maxRadiusPx: state.maxR });
  } else if (state.mode === "dot") {
    const unit = Math.max(1, parseFloat(els.inputDotUnit.value || "10000"));
    mapper.applyDotDensity(state.geojson, state.valueMap, unit);
  } else if (state.mode === "label") {
    mapper.applyLabels(state.valueMap, state.field);
  } else {
    mapper.clearSymbols();
  }

  const naFlag = hasMissing(values);
  renderLegend(els.legendBox, state.breaks, state.colors, {
    title: state.field, showNA: naFlag,
    onClassHover: (idx, ev) => {
      if (ev.type === "mouseenter") mapper.highlightByClass(idx);
    },
  });
  els.legendBox.addEventListener("mouseleave", () => mapper.clearHighlight(), { once: true });
  renderLegend(els.overlayLegend, state.breaks, state.colors, { showNA: naFlag });
  els.overlay.hidden = false;
  els.overlayTitle.textContent = state.field;
  els.overlayFooter.textContent = `MandaraNext ·${new Date().toLocaleDateString("ja-JP")}`;

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
    ["第1四分位 (Q1)", s.q1 != null ? formatNum(s.q1) : "—"],
    ["第3四分位 (Q3)", s.q3 != null ? formatNum(s.q3) : "—"],
    ["四分位範囲 (IQR)", s.iqr != null ? formatNum(s.iqr) : "—"],
    ["標準偏差", s.std != null ? formatNum(s.std) : "—"],
    ["変動係数 (CV)", s.cv != null ? (s.cv * 100).toFixed(1) + "%" : "—"],
    ["歪度", s.skewness != null ? s.skewness.toFixed(3) : "—"],
    ["尖度 (超過)", s.kurtosis != null ? s.kurtosis.toFixed(3) : "—"],
    ["最頻値", s.mode != null ? formatNum(s.mode) : "—"],
  ];
  els.statsTable.innerHTML = rows.map(([k,v]) =>
    `<tr><td>${k}</td><td>${v}</td></tr>`
  ).join("");
}

function populateFieldSelects() {
  const fields = state.dataset?.fields || [];
  for (const sel of [els.selectField, els.selectFieldB, els.derivedA, els.derivedB, els.filterField]) {
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
  const { r, n } = renderScatter(els.scatterSvg, xs, ys, xf, yf, ids, onScatterHover, onScatterClick);
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
function onScatterClick(id) {
  if (state.level === "chocho") {
    // Town points have no polygon — just highlight via tooltip
    return;
  }
  mapper.zoomToFeature(id);
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
