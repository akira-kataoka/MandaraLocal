// =====================================================================
// main.js  -- App orchestration: state + DOM events
// =====================================================================

import { parseCsvText, loadCsvFile, loadSampleCsv, buildValueLookup, buildMuniIndex, buildTownIndex } from "./data.js";
import { computeBreaks, classifyValue } from "./classification.js";
import { getPalette } from "./color.js";
import { computeStats, formatNum, detectOutliers } from "./stats.js";
import { renderLegend } from "./legend.js";
import { MandaraMap } from "./map.js";
import { exportPng, exportSvg, exportKml } from "./export.js";
import { loadSettings, saveSettings } from "./settings.js";
import { renderScatter } from "./scatter.js";
import { renderHistogram } from "./histogram.js";
import { renderBoxplot } from "./boxplot.js";
import { renderTable, getSortState } from "./table.js";

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
  customColors: {},   // { paletteName: { classIdx: hexColor } } — user overrides
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
  csvMerge:     $("csv-merge"),
  btnTemplate:  $("btn-download-template"),
  btnPaste:     $("btn-paste"),
  inputDataSource: $("input-data-source"),
  inputMapTitle: $("input-map-title"),
  mapTitle:      $("map-title"),
  inputMapSubtitle: $("input-map-subtitle"),
  mapSubtitle:   $("map-subtitle"),
  inputMapAuthor: $("input-map-author"),
  chkShowScale:  $("chk-show-scale"),
  chkShowNorth:  $("chk-show-north"),
  chkShowCoords: $("chk-show-coords"),
  chkShowMinimap: $("chk-show-minimap"),
  northArrow:    $("north-arrow"),
  cursorCoords:  $("cursor-coords"),
  minimap:       $("minimap"),
  dataSummary:  $("data-summary"),
  panelField:   $("panel-field"),
  selectField:  $("select-field"),
  rowFieldFilter: $("row-field-filter"),
  inputFieldFilter: $("input-field-filter"),
  chkCompare:   $("chk-compare"),
  rowFieldB:    $("row-field-b"),
  selectFieldB: $("select-field-b"),
  rowPaletteB:  $("row-palette-b"),
  selectPaletteB: $("select-palette-b"),
  paneB:        $("pane-b"),
  overlayB:        $("map-overlay-b"),
  overlayTitleB:   $("overlay-title-b"),
  overlayLegendB:  $("overlay-legend-b"),
  derivedA:     $("derived-a"),
  derivedOp:    $("derived-op"),
  derivedB:     $("derived-b"),
  derivedName:  $("derived-name"),
  btnDerived:   $("btn-add-derived"),
  btnZscore:    $("btn-add-zscore"),
  btnMinMax:    $("btn-add-minmax"),
  fieldList:    $("field-list"),
  btnBatchZ:    $("btn-batch-z"),
  btnBatchMM:   $("btn-batch-mm"),
  selectMode:   $("select-mode"),
  rowSymbolSize:$("row-symbol-size"),
  inputMaxR:    $("input-maxr"),
  rowDotUnit:   $("row-dot-unit"),
  inputDotUnit: $("input-dotunit"),
  rowPie:       $("row-pie"),
  selectPieFields: $("select-pie-fields"),
  hintPie:      $("hint-pie"),
  rowPieSize:   $("row-pie-size"),
  inputPieRadius: $("input-pie-radius"),
  panelClass:   $("panel-class"),
  selectMethod: $("select-method"),
  inputClasses: $("input-classes"),
  rowManualBreaks: $("row-manual-breaks"),
  inputManualBreaks: $("input-manual-breaks"),
  hintManual:     $("hint-manual"),
  selectPalette:$("select-palette"),
  chkReverse:   $("chk-reverse"),
  palettePreview: $("palette-preview"),
  panelStats:   $("panel-stats"),
  statsTable:   $("stats-table"),
  chkOutliers:  $("chk-outliers"),
  outlierList:  $("outlier-list"),
  chkSde:       $("chk-sde"),
  sdeInfo:      $("sde-info"),
  filterField:  $("filter-field"),
  filterOp:     $("filter-op"),
  filterValue:  $("filter-value"),
  rowFilterValue2: $("row-filter-value2"),
  filterValue2: $("filter-value2"),
  btnFilterApply: $("btn-filter-apply"),
  btnFilterClear: $("btn-filter-clear"),
  btnFilterAdd:   $("btn-filter-add"),
  btnFilterAddOr: $("btn-filter-add-or"),
  btnFilterAddNot:$("btn-filter-add-not"),
  filterConditions: $("filter-conditions"),
  filterResult: $("filter-result"),
  panelLegend:  $("panel-legend"),
  legendBox:    $("legend-container"),
  selectLegendPos: $("select-legend-pos"),
  panelTable:   $("panel-table"),
  panelHist:    $("panel-histogram"),
  histBins:     $("hist-bins"),
  chkHistOverlay: $("chk-hist-overlay"),
  chkHistBreaks:  $("chk-hist-breaks"),
  panelBox:     $("panel-boxplot"),
  boxplotSvg:   $("boxplot-svg"),
  histSvg:      $("histogram-svg"),
  histPng:      $("hist-png"),
  scatterPng:   $("scatter-png"),
  scatterSwap:  $("scatter-swap"),
  dataQuality:  $("data-quality"),
  rankingBox:   $("ranking-box"),
  panelCt:      $("panel-crosstab"),
  ctRow:        $("ct-row"),
  ctCol:        $("ct-col"),
  ctBins:       $("ct-bins"),
  ctRun:        $("ct-run"),
  ctResult:     $("ct-result"),
  tableWrap:    $("table-wrap"),
  panelTs:      $("panel-timeseries"),
  tsBase:       $("ts-base"),
  tsSlider:     $("ts-slider"),
  tsCurrent:    $("ts-current"),
  tsPlay:       $("ts-play"),
  tsStop:       $("ts-stop"),
  tsSpeed:      $("ts-speed"),
  tsGif:        $("ts-gif"),
  tsFrom:       $("ts-from"),
  tsTo:         $("ts-to"),
  tsDiff:       $("ts-diff"),
  tsRatio:      $("ts-ratio"),
  panelScatter: $("panel-scatter"),
  scatterX:     $("scatter-x"),
  scatterY:     $("scatter-y"),
  scatterColorBy: $("scatter-color-by"),
  chkScatterStats: $("chk-scatter-stats"),
  chkScatterLogX: $("chk-scatter-logx"),
  chkScatterLogY: $("chk-scatter-logy"),
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
  selectExportDpi: $("select-export-dpi"),
  btnPng:       $("btn-export-png"),
  btnSvg:       $("btn-export-svg"),
  btnCsv:       $("btn-export-csv"),
  btnKml:       $("btn-export-kml"),
  btnGeoJson:   $("btn-export-geojson"),
  btnPdf:       $("btn-export-pdf"),
  btnMeasure:   $("btn-measure"),
  btnArea:      $("btn-area"),
  btnBuffer:    $("btn-buffer"),
  inputBufferKm:$("input-buffer-km"),
  btnMesh:      $("btn-mesh"),
  selectMeshLevel: $("select-mesh-level"),
  btnDraw:      $("btn-draw"),
  btnClearPins: $("btn-clear-pins"),
  btnInstall:   $("btn-install"),
  inputGeocode: $("input-geocode"),
  btnTheme:     $("btn-theme"),
  selectScene:  $("select-scene"),
  btnSceneSave: $("btn-scene-save"),
  btnSceneDelete: $("btn-scene-delete"),
  btnSceneExport: $("btn-scene-export"),
  fileSceneImport: $("file-scene-import"),
  btnSceneShareUrl: $("btn-scene-share-url"),
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
  if (saved.exportDpi && els.selectExportDpi) els.selectExportDpi.value = String(saved.exportDpi);
  els.rowSymbolSize.hidden = state.mode === "choropleth";
})();

els.selectExportDpi?.addEventListener("change", () => {
  state.exportDpi = parseInt(els.selectExportDpi.value, 10) || 2;
  saveSettings(state);
});
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
      els.panelHist.hidden = true;
      els.panelBox.hidden = true;
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

els.csvMerge.addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  if (!state.dataset) {
    setSummary("先に基本データを読み込んでから追加CSVを使ってください", "warn");
    e.target.value = ""; return;
  }
  try {
    const incoming = await loadCsvFile(file, csvParseOpts());
    const byKey = new Map();
    for (const r of incoming.rows) byKey.set(r.key, r);
    let merged = 0, unmatched = 0;
    const newFields = [];
    // De-duplicate field names — incoming overrides existing? No, append "_2" suffix
    const fieldMap = {};
    for (const f of incoming.fields) {
      let n = f;
      let k = 2;
      while (state.dataset.fields.includes(n)) { n = `${f}_${k++}`; }
      fieldMap[f] = n;
      newFields.push(n);
    }
    state.dataset.fields.push(...newFields);
    for (const row of state.dataset.rows) {
      const hit = byKey.get(row.key);
      if (!hit) { unmatched++; for (const f of newFields) row.values[f] = null; continue; }
      merged++;
      for (const f of incoming.fields) row.values[fieldMap[f]] = hit.values[f];
    }
    populateFieldSelects();
    refresh();
    setSummary(`「${file.name}」をマージ: ${newFields.length}列追加・${merged}行一致・${unmatched}行は値なし`, "success");
  } catch (err) {
    setSummary("マージ失敗: " + err.message, "error");
  } finally {
    e.target.value = "";
  }
});

els.selectField.addEventListener("change", () => {
  state.field = els.selectField.value;
  refresh();
});
els.inputFieldFilter?.addEventListener("input", () => {
  const q = els.inputFieldFilter.value.toLowerCase();
  for (const o of els.selectField.options) {
    o.hidden = q && !o.value.toLowerCase().includes(q);
  }
});
els.selectFieldB.addEventListener("change", () => {
  state.fieldB = els.selectFieldB.value;
  if (state.compare) refresh();
});
els.selectPaletteB.addEventListener("change", () => {
  if (state.compare) refresh();
});
els.chkCompare.addEventListener("change", () => {
  state.compare = els.chkCompare.checked;
  els.rowFieldB.hidden = !state.compare;
  els.rowPaletteB.hidden = !state.compare;
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
  els.rowSymbolSize.hidden = !(state.mode === "symbol" || state.mode === "both" || state.mode === "graduated");
  els.rowDotUnit.hidden = state.mode !== "dot";
  // Pie + Bar share the same multi-field selector UI
  const multiOn = state.mode === "pie" || state.mode === "bar";
  els.rowPie.hidden = !multiOn;
  els.hintPie.hidden = !multiOn;
  els.rowPieSize.hidden = state.mode !== "pie";   // radius is pie-only
  if (multiOn) populatePieFields();
  refresh();
});
els.selectPieFields.addEventListener("change", () => refresh());
els.inputPieRadius.addEventListener("change", () => refresh());

function populatePieFields() {
  const fields = state.dataset?.fields || [];
  const prev = new Set([...els.selectPieFields.selectedOptions].map(o => o.value));
  els.selectPieFields.innerHTML = "";
  for (const f of fields) {
    const o = document.createElement("option");
    o.value = f; o.textContent = f;
    if (prev.has(f)) o.selected = true;
    els.selectPieFields.appendChild(o);
  }
  // default: pick first 2 numeric fields if nothing selected
  if (!prev.size && fields.length >= 2) {
    [...els.selectPieFields.options].slice(0, Math.min(3, fields.length)).forEach(o => o.selected = true);
  }
}
els.inputDotUnit.addEventListener("change", () => refresh());
els.inputMaxR.addEventListener("change", () => {
  const n = clamp(parseInt(els.inputMaxR.value || "32", 10), 8, 80);
  els.inputMaxR.value = n;
  state.maxR = n;
  refresh();
});
els.selectMethod.addEventListener("change", () => {
  state.method = els.selectMethod.value;
  const manualOn = state.method === "manual";
  els.rowManualBreaks.hidden = !manualOn;
  els.hintManual.hidden = !manualOn;
  refresh();
});
els.inputManualBreaks.addEventListener("change", () => refresh());
els.inputClasses.addEventListener("change", () => {
  const n = clamp(parseInt(els.inputClasses.value || "5", 10), 2, 9);
  els.inputClasses.value = n;
  state.classes = n;
  updatePalettePreview();
  refresh();
});
els.selectPalette.addEventListener("change", () => {
  state.palette = els.selectPalette.value;
  // Clear custom overrides for the newly-selected palette so user sees the
  // canonical palette first. (They can re-customise after.)
  delete state.customColors[state.palette];
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
els.inputDataSource?.addEventListener("change", () => {
  if (state.dataset && state.field) refresh();
});

els.chkShowScale?.addEventListener("change", () => {
  mapper.setScaleVisible?.(els.chkShowScale.checked);
  if (mapperB) mapperB.setScaleVisible?.(els.chkShowScale.checked);
});
els.chkShowNorth?.addEventListener("change", () => {
  if (els.northArrow) els.northArrow.hidden = !els.chkShowNorth.checked;
});

// Cursor coordinate readout: live lat/lng under the cursor.
let _coordsEnabled = true;
els.chkShowCoords?.addEventListener("change", () => {
  _coordsEnabled = !!els.chkShowCoords.checked;
  if (!_coordsEnabled && els.cursorCoords) els.cursorCoords.hidden = true;
});
mapper.map.on("mousemove", (e) => {
  if (!_coordsEnabled || !els.cursorCoords) return;
  const { lat, lng } = e.latlng;
  els.cursorCoords.textContent = `${lat.toFixed(4)}°N  ${lng.toFixed(4)}°E`;
  els.cursorCoords.hidden = false;
});
mapper.map.on("mouseout", () => {
  if (els.cursorCoords) els.cursorCoords.hidden = true;
});
// Minimap (overview navigator). Lazy-initialised the first time it's shown.
let _minimap = null;
let _minimapViewportRect = null;
function ensureMinimap() {
  if (_minimap || !els.minimap) return _minimap;
  _minimap = L.map(els.minimap, {
    center: [37.5, 137.5],
    zoom: 4,
    minZoom: 3,
    maxZoom: 7,
    zoomControl: false,
    attributionControl: false,
    dragging: false,
    scrollWheelZoom: false,
    doubleClickZoom: false,
    boxZoom: false,
    keyboard: false,
    touchZoom: false,
    tap: false,
  });
  L.tileLayer("https://cyberjapandata.gsi.go.jp/xyz/blank/{z}/{x}/{y}.png", {
    maxZoom: 14,
  }).addTo(_minimap);
  _minimapViewportRect = L.rectangle(mapper.map.getBounds(), {
    color: "#dc2626", weight: 2, fillColor: "#dc2626", fillOpacity: 0.12,
    className: "minimap-viewport", interactive: false,
  }).addTo(_minimap);
  // Click recenter
  _minimap.on("click", (e) => {
    mapper.map.setView(e.latlng, mapper.map.getZoom());
  });
  // Sync viewport rect to main map view
  const sync = () => {
    if (!_minimap || !_minimapViewportRect) return;
    _minimapViewportRect.setBounds(mapper.map.getBounds());
  };
  mapper.map.on("moveend zoomend", sync);
  sync();
  return _minimap;
}

els.chkShowMinimap?.addEventListener("change", () => {
  if (!els.minimap) return;
  if (els.chkShowMinimap.checked) {
    els.minimap.hidden = false;
    ensureMinimap();
    // Leaflet needs invalidateSize after the container becomes visible
    setTimeout(() => _minimap?.invalidateSize(), 50);
  } else {
    els.minimap.hidden = true;
  }
});

els.cursorCoords?.addEventListener("click", async () => {
  const t = els.cursorCoords.textContent;
  if (!t) return;
  try {
    await navigator.clipboard.writeText(t);
    els.cursorCoords.classList.add("is-copied");
    const orig = t;
    els.cursorCoords.textContent = "コピー済み ✓";
    setTimeout(() => {
      els.cursorCoords.classList.remove("is-copied");
      els.cursorCoords.textContent = orig;
    }, 800);
  } catch {}
});

els.inputMapTitle?.addEventListener("input", () => {
  if (!els.mapTitle) return;
  const t = (els.inputMapTitle.value || "").trim();
  if (t) {
    els.mapTitle.textContent = t;
    els.mapTitle.hidden = false;
  } else {
    els.mapTitle.textContent = "";
    els.mapTitle.hidden = true;
  }
});

els.inputMapSubtitle?.addEventListener("input", () => {
  if (!els.mapSubtitle) return;
  const s = (els.inputMapSubtitle.value || "").trim();
  if (s) {
    els.mapSubtitle.textContent = s;
    els.mapSubtitle.hidden = false;
  } else {
    els.mapSubtitle.textContent = "";
    els.mapSubtitle.hidden = true;
  }
});

els.inputMapAuthor?.addEventListener("input", () => {
  // Author appears in the overlay footer, which is re-rendered by refresh().
  if (state.dataset && state.field) refresh();
});

els.selectLegendPos?.addEventListener("change", () => {
  const pos = els.selectLegendPos.value;
  els.overlay.classList.remove("pos-br", "pos-bl", "pos-tr", "pos-tl", "pos-free");
  // Selecting a preset wipes any saved free-position inline styles.
  if (pos !== "free") {
    els.overlay.style.left = "";
    els.overlay.style.top = "";
  }
  if (pos === "hide") {
    els.overlay.hidden = true;
  } else {
    els.overlay.classList.add(`pos-${pos}`);
    els.overlay.hidden = false;
  }
});

// Drag-to-position the legend overlay. Title bar (.map-overlay-title) is the handle.
(function setupLegendDrag() {
  const ov = els.overlay;
  if (!ov) return;
  const handle = ov.querySelector(".map-overlay-title");
  if (!handle) return;
  let dragging = false;
  let startX = 0, startY = 0, startLeft = 0, startTop = 0, paneRect = null;
  handle.addEventListener("pointerdown", (e) => {
    // Switch to free-position mode on first drag from any preset
    if (els.selectLegendPos && els.selectLegendPos.value !== "free") {
      els.selectLegendPos.value = "free";
    }
    ov.classList.remove("pos-br", "pos-bl", "pos-tr", "pos-tl");
    ov.classList.add("pos-free", "is-dragging");
    const pane = ov.parentElement;
    paneRect = pane.getBoundingClientRect();
    const ovRect = ov.getBoundingClientRect();
    startX = e.clientX; startY = e.clientY;
    startLeft = ovRect.left - paneRect.left;
    startTop  = ovRect.top  - paneRect.top;
    dragging = true;
    handle.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  handle.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    let nx = startLeft + (e.clientX - startX);
    let ny = startTop  + (e.clientY - startY);
    // Clamp within parent pane bounds, keeping at least 24px of overlay visible.
    const ovRect = ov.getBoundingClientRect();
    const maxX = paneRect.width  - 24;
    const maxY = paneRect.height - 24;
    nx = Math.max(-(ovRect.width - 24),  Math.min(maxX, nx));
    ny = Math.max(0, Math.min(maxY, ny));
    // Store as percentages so the position scales with pane size.
    ov.style.left = `${(nx / paneRect.width)  * 100}%`;
    ov.style.top  = `${(ny / paneRect.height) * 100}%`;
  });
  handle.addEventListener("pointerup", () => {
    dragging = false;
    ov.classList.remove("is-dragging");
  });
  handle.addEventListener("pointercancel", () => {
    dragging = false;
    ov.classList.remove("is-dragging");
  });
})();
els.chkSde.addEventListener("change", () => refresh());
els.filterOp.addEventListener("change", () => {
  els.rowFilterValue2.hidden = els.filterOp.value !== "between";
});
els.btnFilterApply.addEventListener("click", applyAttributeFilter);
els.btnFilterClear.addEventListener("click", clearAttributeFilter);
els.btnFilterAdd.addEventListener("click", () => addCurrentFilterCondition("AND"));
els.btnFilterAddOr.addEventListener("click", () => addCurrentFilterCondition("OR"));
els.btnFilterAddNot.addEventListener("click", () => addCurrentFilterCondition("NOT"));

const filterStack = [];   // array of {field, op, v1, v2, joiner: "AND"|"OR"|"NOT"}

function readCurrentFilter() {
  const field = els.filterField.value;
  const op = els.filterOp.value;
  const v1 = parseFloat(els.filterValue.value);
  const v2 = parseFloat(els.filterValue2.value);
  if (!field || !Number.isFinite(v1)) return null;
  return { field, op, v1, v2: Number.isFinite(v2) ? v2 : null };
}

function addCurrentFilterCondition(joiner = "AND") {
  const c = readCurrentFilter();
  if (!c) { setSummary("値を入力してから追加してください", "warn"); return; }
  c.joiner = joiner;
  filterStack.push(c);
  renderFilterStack();
  applyAttributeFilter();
}

function renderFilterStack() {
  els.filterConditions.innerHTML = "";
  filterStack.forEach((c, i) => {
    const div = document.createElement("div");
    div.className = "fc-item";
    const op = { ">":"&gt;", ">=":"≥", "<":"&lt;", "<=":"≤", "==":"=", "!=":"≠", "between":"〜" }[c.op] || c.op;
    const valStr = c.op === "between" ? `${c.v1}〜${c.v2}` : `${c.v1}`;
    const joinPrefix = i === 0 ? "" : ({ AND:"AND ", OR:"OR ", NOT:"AND NOT " }[c.joiner] || "AND ");
    div.innerHTML = `<span><em style="color:var(--accent)">${joinPrefix}</em><strong>${escapeHtmlText(c.field)}</strong> ${op} ${valStr}</span>`;
    const btn = document.createElement("button");
    btn.textContent = "削除";
    btn.addEventListener("click", () => {
      filterStack.splice(i, 1);
      renderFilterStack();
      applyAttributeFilter();
    });
    div.appendChild(btn);
    els.filterConditions.appendChild(div);
  });
}
els.ctRun.addEventListener("click", runCrossTab);
els.histBins.addEventListener("change", () => { refresh(); });
els.chkHistOverlay?.addEventListener("change", () => { refresh(); });
els.chkHistBreaks?.addEventListener("change", () => { refresh(); });

async function svgToPng(svg, filename) {
  try {
    // Serialize SVG → blob → image → canvas → PNG
    const xml = new XMLSerializer().serializeToString(svg);
    const rect = svg.getBoundingClientRect();
    const w = Math.max(280, rect.width) * 2, h = Math.max(180, rect.height) * 2;
    const svg64 = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(xml)));
    const img = new Image();
    img.crossOrigin = "anonymous";
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = svg64; });
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = document.body.classList.contains("dark") ? "#0f172a" : "#ffffff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    const url = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setSummary(`${filename} を保存しました`, "success");
  } catch (e) {
    setSummary("PNG変換失敗: " + e.message, "error");
  }
}
els.histPng?.addEventListener("click", () => svgToPng(els.histSvg, `histogram_${(state.field || "data").replace(/\s+/g, "_")}.png`));
els.scatterPng?.addEventListener("click", () => svgToPng(els.scatterSvg, `scatter_${(els.scatterX.value || "x")}_vs_${(els.scatterY.value || "y")}.png`));

function runCrossTab() {
  if (!state.dataset) return;
  const rowF = els.ctRow.value, colF = els.ctCol.value;
  const bins = Math.max(2, Math.min(8, parseInt(els.ctBins.value, 10) || 4));
  const rowVals = state.dataset.rows.map(r => r.values[rowF]);
  const colVals = state.dataset.rows.map(r => r.values[colF]);
  const rowBreaks = computeBreaks(rowVals, bins, "quantile").breaks;
  const colBreaks = computeBreaks(colVals, bins, "quantile").breaks;
  // matrix[i][j]
  const mat = Array.from({ length: bins }, () => new Array(bins).fill(0));
  const rowTot = new Array(bins).fill(0);
  const colTot = new Array(bins).fill(0);
  let total = 0;
  for (let k = 0; k < state.dataset.rows.length; k++) {
    const rv = rowVals[k], cv = colVals[k];
    if (!Number.isFinite(rv) || !Number.isFinite(cv)) continue;
    const ri = clamp(classifyValue(rv, rowBreaks), 0, bins - 1);
    const ci = clamp(classifyValue(cv, colBreaks), 0, bins - 1);
    mat[ri][ci]++;
    rowTot[ri]++; colTot[ci]++; total++;
  }
  // Render table
  let html = `<table><thead><tr><th class="corner">${escapeHtmlText(rowF)} ＼ ${escapeHtmlText(colF)}</th>`;
  for (let j = 0; j < bins; j++) html += `<th>${formatNum(colBreaks[j])}〜${formatNum(colBreaks[j+1])}</th>`;
  html += `<th class="total">合計</th></tr></thead><tbody>`;
  for (let i = 0; i < bins; i++) {
    html += `<tr><th>${formatNum(rowBreaks[i])}〜${formatNum(rowBreaks[i+1])}</th>`;
    for (let j = 0; j < bins; j++) {
      const cnt = mat[i][j];
      const intensity = cnt > 0 ? Math.min(1, cnt / Math.max(1, ...mat.flat())) : 0;
      const bg = `rgba(37, 99, 235, ${(intensity * 0.55).toFixed(2)})`;
      const cls = cnt > 0 ? "ct-cell" : "ct-cell ct-empty";
      html += `<td class="${cls}" style="background:${bg};cursor:${cnt > 0 ? "pointer" : "default"}" data-row="${i}" data-col="${j}">${cnt}</td>`;
    }
    html += `<td class="total">${rowTot[i]}</td></tr>`;
  }
  html += `<tr><th class="total">合計</th>`;
  for (let j = 0; j < bins; j++) html += `<td class="total">${colTot[j]}</td>`;
  html += `<td class="total">${total}</td></tr></tbody></table>`;
  els.ctResult.innerHTML = html;

  // Wire cell hover for map cross-highlight
  els.ctResult.querySelectorAll(".ct-cell").forEach((td) => {
    const ri = parseInt(td.dataset.row, 10);
    const ci = parseInt(td.dataset.col, 10);
    td.addEventListener("mouseenter", () => {
      const hits = new Set();
      for (let k = 0; k < state.dataset.rows.length; k++) {
        const rv = rowVals[k], cv = colVals[k];
        if (!Number.isFinite(rv) || !Number.isFinite(cv)) continue;
        const r2 = clamp(classifyValue(rv, rowBreaks), 0, bins - 1);
        const c2 = clamp(classifyValue(cv, colBreaks), 0, bins - 1);
        if (r2 === ri && c2 === ci) hits.add(state.dataset.rows[k].key);
      }
      mapper.markOutliers(hits);
    });
    td.addEventListener("mouseleave", () => mapper.clearOutlierMarks());
  });
}

function escapeHtmlText(s) {
  return String(s ?? "").replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
}

function evalCondition(c, x) {
  if (!Number.isFinite(x)) return false;
  switch (c.op) {
    case ">":  return x >  c.v1;
    case ">=": return x >= c.v1;
    case "<":  return x <  c.v1;
    case "<=": return x <= c.v1;
    case "==": return x === c.v1;
    case "!=": return x !== c.v1;
    case "between":
      return Number.isFinite(c.v2) && x >= Math.min(c.v1, c.v2) && x <= Math.max(c.v1, c.v2);
    default: return false;
  }
}

function applyAttributeFilter() {
  if (!state.dataset) return;
  const current = readCurrentFilter();
  const conds = [...filterStack];
  if (current) conds.push({ ...current, joiner: filterStack.length ? "AND" : undefined });
  if (!conds.length) {
    els.filterResult.textContent = "条件を入力または追加してください";
    els.filterResult.className = "data-summary warn";
    return;
  }
  // Evaluate left-to-right: c0 is the seed, then each subsequent condition
  //   joiner=AND → acc && c
  //   joiner=OR  → acc || c
  //   joiner=NOT → acc && !c     (== AND NOT, i.e. set difference)
  const matched = new Set();
  for (const r of state.dataset.rows) {
    let acc = evalCondition(conds[0], r.values[conds[0].field]);
    for (let i = 1; i < conds.length; i++) {
      const v = r.values[conds[i].field];
      const ok = evalCondition(conds[i], v);
      const j = conds[i].joiner || "AND";
      if (j === "AND") acc = acc && ok;
      else if (j === "OR") acc = acc || ok;
      else if (j === "NOT") acc = acc && !ok;
    }
    if (acc) matched.add(r.key);
  }
  mapper.markOutliers(matched);
  state.filteredKeys = matched;
  els.filterResult.textContent = `${conds.length}条件 → 一致: ${matched.size}件 / 全${state.dataset.rows.length}件（CSVエクスポート時にフィルタ反映）`;
  els.filterResult.className = "data-summary success";
}

function clearAttributeFilter() {
  mapper.clearOutlierMarks();
  filterStack.length = 0;
  state.filteredKeys = null;
  renderFilterStack();
  els.filterResult.textContent = "";
}

els.scatterX.addEventListener("change", drawScatter);
els.scatterY.addEventListener("change", drawScatter);
els.scatterColorBy?.addEventListener("change", drawScatter);
els.chkScatterStats?.addEventListener("change", drawScatter);
els.chkScatterLogX.addEventListener("change", drawScatter);
els.chkScatterLogY.addEventListener("change", drawScatter);
els.scatterSwap?.addEventListener("click", () => {
  const x = els.scatterX.value, y = els.scatterY.value;
  els.scatterX.value = y; els.scatterY.value = x;
  // also swap log toggles
  const lx = els.chkScatterLogX.checked, ly = els.chkScatterLogY.checked;
  els.chkScatterLogX.checked = ly; els.chkScatterLogY.checked = lx;
  drawScatter();
});
els.btnDerived.addEventListener("click", addDerivedField);
function batchStandardise(kind) {
  if (!state.dataset) return;
  const baseFields = state.dataset.fields.filter(f => !f.endsWith("_z") && !f.endsWith("_minmax"));
  let added = 0;
  for (const f of baseFields) {
    const newName = kind === "z" ? `${f}_z` : `${f}_minmax`;
    if (state.dataset.fields.includes(newName)) continue;
    const vals = state.dataset.rows.map(r => r.values[f]).filter(Number.isFinite);
    if (vals.length < 2) continue;
    if (kind === "z") {
      const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
      const variance = vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length;
      const std = Math.sqrt(variance);
      if (std === 0) continue;
      for (const r of state.dataset.rows) {
        const v = r.values[f];
        r.values[newName] = Number.isFinite(v) ? (v - mean) / std : null;
      }
    } else {
      const min = Math.min(...vals), max = Math.max(...vals);
      if (min === max) continue;
      for (const r of state.dataset.rows) {
        const v = r.values[f];
        r.values[newName] = Number.isFinite(v) ? (v - min) / (max - min) : null;
      }
    }
    state.dataset.fields.push(newName);
    added++;
  }
  populateFieldSelects();
  refresh();
  setSummary(`バッチ ${kind === "z" ? "Z-score" : "min-max"} 化: ${added}列を追加`, "success");
}
els.btnBatchZ?.addEventListener("click", () => batchStandardise("z"));
els.btnBatchMM?.addEventListener("click", () => batchStandardise("minmax"));

els.btnMinMax?.addEventListener("click", () => {
  if (!state.dataset) return;
  const f = els.derivedA.value;
  if (!f) { setSummary("A列を選んでください", "warn"); return; }
  const name = `${f}_minmax`;
  if (state.dataset.fields.includes(name)) {
    setSummary(`列「${name}」はすでに存在します`, "warn"); return;
  }
  const vals = state.dataset.rows.map(r => r.values[f]).filter(Number.isFinite);
  if (vals.length < 2) { setSummary("有効な値が2つ未満です", "warn"); return; }
  const min = Math.min(...vals), max = Math.max(...vals);
  if (min === max) { setSummary("最小=最大なのでmin-max正規化できません", "warn"); return; }
  for (const r of state.dataset.rows) {
    const v = r.values[f];
    r.values[name] = Number.isFinite(v) ? (v - min) / (max - min) : null;
  }
  state.dataset.fields.push(name);
  populateFieldSelects();
  state.field = name; els.selectField.value = name;
  refresh();
  setSummary(`min-max列「${name}」を追加 (min=${min.toFixed(2)}, max=${max.toFixed(2)})`, "success");
});

els.btnZscore?.addEventListener("click", () => {
  if (!state.dataset) return;
  const f = els.derivedA.value;
  if (!f) { setSummary("A列を選んでください", "warn"); return; }
  const name = `${f}_z`;
  if (state.dataset.fields.includes(name)) {
    setSummary(`列「${name}」はすでに存在します`, "warn"); return;
  }
  const vals = state.dataset.rows.map(r => r.values[f]).filter(Number.isFinite);
  if (vals.length < 2) { setSummary("有効な値が2つ未満です", "warn"); return; }
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  const variance = vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length;
  const std = Math.sqrt(variance);
  if (std === 0) { setSummary("分散が0なのでZ-score化できません", "warn"); return; }
  for (const r of state.dataset.rows) {
    const v = r.values[f];
    r.values[name] = Number.isFinite(v) ? (v - mean) / std : null;
  }
  state.dataset.fields.push(name);
  populateFieldSelects();
  state.field = name;
  els.selectField.value = name;
  refresh();
  setSummary(`Z-score列「${name}」を追加 (μ=${mean.toFixed(2)}, σ=${std.toFixed(2)})`, "success");
});
els.btnTemplate.addEventListener("click", downloadTemplate);

els.btnPaste?.addEventListener("click", async () => {
  if (!navigator.clipboard?.readText) {
    setSummary("お使いのブラウザはクリップボード読込に未対応です", "warn"); return;
  }
  try {
    let text = await navigator.clipboard.readText();
    if (!text || !text.trim()) {
      setSummary("クリップボードが空です", "warn"); return;
    }
    // Excel コピーは TSV。 \t を , に置換して既存パーサに渡す
    if (text.includes("\t") && !text.includes(",")) {
      text = text.replace(/\t/g, ",");
    }
    const ds = parseCsvText(text, csvParseOpts());
    onDatasetReady(ds, "クリップボード");
  } catch (e) {
    setSummary("ペースト失敗: " + e.message, "error");
  }
});
els.btnCsv.addEventListener("click", exportCurrentCsv);
els.btnPdf.addEventListener("click", async () => {
  if (typeof htmlToImage === "undefined" || typeof window.jspdf === "undefined") {
    setSummary("PDFライブラリの読み込みに失敗しました", "error"); return;
  }
  setSummary("PDF を生成中…", "muted");
  try {
    const wrap = document.querySelector(".map-wrap");
    const dpi = parseInt(els.selectExportDpi?.value || "2", 10) || 2;
    const dataUrl = await htmlToImage.toPng(wrap, {
      pixelRatio: dpi, backgroundColor: "#ffffff",
      filter: (n) => !(n.classList && (n.classList.contains("leaflet-control-zoom") || n.classList.contains("leaflet-control-layers"))),
    });
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const w = pdf.internal.pageSize.getWidth();
    const h = pdf.internal.pageSize.getHeight();
    // Gather metadata
    const titleText    = (els.inputMapTitle?.value || "").trim() || state.field || "MandaraNext";
    const subtitleText = (els.inputMapSubtitle?.value || "").trim();
    const authorText   = (els.inputMapAuthor?.value || "").trim();
    const sourceText   = (els.inputDataSource?.value || "").trim();
    const todayJp = new Date().toLocaleDateString("ja-JP");
    // PDF document properties (visible in Adobe Reader / Preview "Properties" dialog).
    pdf.setProperties({
      title: titleText,
      subject: [subtitleText, sourceText ? `出典: ${sourceText}` : ""].filter(Boolean).join(" · "),
      author: authorText || "",
      creator: "MandaraNext",
      keywords: [state.field, state.level, "thematic-map", "MandaraNext"].filter(Boolean).join(","),
    });
    // Title bar
    pdf.setFontSize(14);
    pdf.setTextColor(20);
    pdf.text(titleText, 10, 12);
    // Subtitle (just below title, if present)
    let mapTop = 18;
    if (subtitleText) {
      pdf.setFontSize(10);
      pdf.setTextColor(80);
      pdf.text(subtitleText, 10, 18);
      mapTop = 22;
    }
    pdf.setFontSize(9);
    pdf.setTextColor(120);
    pdf.text(`MandaraNext · ${todayJp}`, w - 60, 12);
    // Map image
    pdf.addImage(dataUrl, "PNG", 10, mapTop, w - 20, h - mapTop - 10);
    // Footer: author + source
    const footParts = [];
    if (sourceText) footParts.push(`出典: ${sourceText}`);
    if (authorText) footParts.push(`作成: ${authorText}`);
    if (footParts.length) {
      pdf.setFontSize(8);
      pdf.setTextColor(120);
      pdf.text(footParts.join("  ·  "), 10, h - 4);
    }
    const fname = `mandara_${(state.field || "map").replace(/\s+/g, "_")}.pdf`;
    pdf.save(fname);
    setSummary(`PDFを ${fname} として保存しました（メタデータ埋め込み済）`, "success");
  } catch (e) {
    setSummary("PDF生成失敗: " + e.message, "error");
  }
});

els.btnGeoJson.addEventListener("click", () => {
  if (!state.geojson) { setSummary("地図データが読み込まれていません", "warn"); return; }
  // Clone features and inject every dataset value into each feature's properties
  const byId = new Map();
  if (state.dataset) for (const r of state.dataset.rows) byId.set(r.key, r);
  const out = {
    type: "FeatureCollection",
    features: state.geojson.features.map(f => {
      const id = f.properties?.id;
      const row = byId.get(id);
      const merged = { ...(f.properties || {}) };
      if (row) {
        merged._region = row.name;
        for (const k of Object.keys(row.values)) merged[k] = row.values[k];
      }
      return { type: "Feature", properties: merged, geometry: f.geometry };
    }),
  };
  // Append any user-drawn shapes (Cycle 62)
  const drawn = mapper.exportDrawn?.();
  if (drawn?.features?.length) {
    for (const f of drawn.features) {
      f.properties = { ...(f.properties || {}), _drawn: true };
      out.features.push(f);
    }
  }
  const fname = `mandara_${(state.field || "map").replace(/\s+/g, "_")}.geojson`;
  const blob = new Blob([JSON.stringify(out)], { type: "application/geo+json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = fname;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  setSummary(`GeoJSON を ${fname} に書き出しました (${out.features.length} features)`, "success");
});

els.btnKml.addEventListener("click", () => {
  if (!state.geojson) { setSummary("地図データが読み込まれていません", "warn"); return; }
  const fname = `mandara_${(state.field || "map").replace(/\s+/g, "_")}.kml`;
  exportKml({
    geojson: state.geojson,
    valueMap: state.valueMap,
    breaks: state.breaks,
    colors: state.colors,
    title: state.field || "MandaraNext",
    fieldName: state.field,
  }, fname);
  setSummary(`KMLを ${fname} として書き出しました (Google Earthで開けます)`, "success");
});
els.btnTheme.addEventListener("click", toggleTheme);

// ----- Keyboard shortcuts -----
const kbdHelp = document.getElementById("kbd-help");
const btnCloseHelp = document.getElementById("btn-close-help");
btnCloseHelp?.addEventListener("click", () => kbdHelp.hidden = true);
kbdHelp?.addEventListener("click", (e) => { if (e.target === kbdHelp) kbdHelp.hidden = true; });

document.addEventListener("keydown", (e) => {
  // Skip when typing in inputs
  const t = e.target;
  if (t && (t.tagName === "INPUT" || t.tagName === "SELECT" || t.tagName === "TEXTAREA" || t.isContentEditable)) {
    if (e.key === "Escape") t.blur();
    return;
  }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  switch (e.key) {
    case "?": kbdHelp.hidden = !kbdHelp.hidden; e.preventDefault(); break;
    case "d": case "D": toggleTheme(); break;
    case "/": els.inputGeocode?.focus(); e.preventDefault(); break;
    case "s": case "S": els.loadSample?.click(); break;
    case "m": case "M": toggleMeasure(!measureOn); break;
    case "a": case "A": toggleArea(!areaOn); break;
    case "b": case "B": toggleBuffer(!bufferOn); break;
    case "p": case "P": els.btnPng?.click(); break;
    case "k": case "K": els.btnKml?.click(); break;
    case "g": case "G": els.btnGeoJson?.click(); break;
    case "e": case "E": els.btnCsv?.click(); break;
    case "f": case "F": els.csvFile?.click(); e.preventDefault(); break;
    case "l": case "L": {
      // Toggle legend overlay show/hide via the position selector
      const sel = els.selectLegendPos;
      if (sel) {
        sel.value = sel.value === "hide" ? "br" : "hide";
        sel.dispatchEvent(new Event("change"));
      }
      break;
    }
    case "c": case "C":
      if (els.chkCompare) {
        els.chkCompare.checked = !els.chkCompare.checked;
        els.chkCompare.dispatchEvent(new Event("change"));
      }
      break;
    case "n": case "N":
      if (els.chkShowNorth) {
        els.chkShowNorth.checked = !els.chkShowNorth.checked;
        els.chkShowNorth.dispatchEvent(new Event("change"));
      }
      break;
    case "o": case "O":
      if (els.chkShowMinimap) {
        els.chkShowMinimap.checked = !els.chkShowMinimap.checked;
        els.chkShowMinimap.dispatchEvent(new Event("change"));
      }
      break;
    case "h": case "H":
      // Reset to "all-Japan" view
      mapper.map.setView([37.5, 137.5], 5);
      if (mapperB) mapperB.map.setView([37.5, 137.5], 5);
      break;
    case "t": case "T":
      els.inputMapTitle?.focus();
      els.inputMapTitle?.select();
      e.preventDefault();
      break;
    case "+": case "=":
      mapper.map.zoomIn();
      e.preventDefault();
      break;
    case "-": case "_":
      mapper.map.zoomOut();
      e.preventDefault();
      break;
    case " ":
      if (!els.panelTs.hidden) {
        if (tsState.timer) tsStop(); else tsPlay();
        e.preventDefault();
      }
      break;
    case "ArrowLeft":
      if (!els.panelTs.hidden) {
        const v = Math.max(0, parseInt(els.tsSlider.value, 10) - 1);
        els.tsSlider.value = String(v); setTsField();
      }
      break;
    case "ArrowRight":
      if (!els.panelTs.hidden) {
        const v = Math.min(parseInt(els.tsSlider.max, 10), parseInt(els.tsSlider.value, 10) + 1);
        els.tsSlider.value = String(v); setTsField();
      }
      break;
    case "Escape":
      if (!kbdHelp.hidden) { kbdHelp.hidden = true; break; }
      if (measureOn) toggleMeasure(false);
      if (areaOn) toggleArea(false);
      if (bufferOn) toggleBuffer(false);
      mapper.clearHighlight();
      mapper.clearOutlierMarks();
      break;
  }
});

// ----- Scenes (MANDARA「マップファイル」相当) -----
const SCENES_KEY = "mandara_scenes_v1";
function loadScenes() {
  try { return JSON.parse(localStorage.getItem(SCENES_KEY) || "{}"); } catch { return {}; }
}
function saveScenes(s) {
  try { localStorage.setItem(SCENES_KEY, JSON.stringify(s)); } catch {}
}
function snapshotCurrent() {
  return {
    level: state.level,
    field: state.field,
    fieldB: state.fieldB,
    compare: state.compare,
    classes: state.classes,
    method: state.method,
    palette: state.palette,
    reverse: state.reverse,
    mode: state.mode,
    maxR: state.maxR,
    chochoPref: state.chochoPref,
    chochoMuni: state.chochoMuni,
    prefFilter: els.selectPrefFilter?.value || "",
    manualBreaks: els.inputManualBreaks?.value || "",
    pieFields: [...(els.selectPieFields?.selectedOptions || [])].map(o => o.value),
    dataSource: els.inputDataSource?.value || "",
    mapTitle: els.inputMapTitle?.value || "",
    mapSubtitle: els.inputMapSubtitle?.value || "",
    mapAuthor: els.inputMapAuthor?.value || "",
    scatterColorBy: els.scatterColorBy?.value || "",
    showScale: !!els.chkShowScale?.checked,
    showNorth: !!els.chkShowNorth?.checked,
    showCoords: !!els.chkShowCoords?.checked,
    showMinimap: !!els.chkShowMinimap?.checked,
    legendPos: els.selectLegendPos?.value || "br",
    legendFreeLeft: els.overlay?.style.left || "",
    legendFreeTop:  els.overlay?.style.top  || "",
  };
}
let demoScenes = {}; // name → snapshot, loaded from data/scenes/index.json
function refreshSceneList() {
  const all = loadScenes();
  let html = '<option value="">— シーン —</option>';
  const demoNames = Object.keys(demoScenes);
  if (demoNames.length) {
    html += '<optgroup label="サンプル">';
    for (const n of demoNames) html += `<option value="demo:${escapeHtmlText(n)}">${escapeHtmlText(n)}</option>`;
    html += '</optgroup>';
  }
  const userNames = Object.keys(all).sort();
  if (userNames.length) {
    html += '<optgroup label="マイシーン">';
    for (const n of userNames) html += `<option value="${escapeHtmlText(n)}">${escapeHtmlText(n)}</option>`;
    html += '</optgroup>';
  }
  els.selectScene.innerHTML = html;
}

// Load demo scenes on startup
(async function loadDemoScenes() {
  try {
    const res = await fetch("data/scenes/index.json");
    if (!res.ok) return;
    const json = await res.json();
    for (const s of (json.scenes || [])) {
      if (s.name && s.snapshot) demoScenes[s.name] = s.snapshot;
    }
    refreshSceneList();
  } catch {}
})();
els.btnSceneSave.addEventListener("click", () => {
  const name = prompt("シーン名を入力 (上書きする場合は同名を指定)", "シーン1");
  if (!name) return;
  const all = loadScenes();
  all[name] = snapshotCurrent();
  saveScenes(all);
  refreshSceneList();
  els.selectScene.value = name;
  setSummary(`シーン「${name}」を保存しました`, "success");
});
els.selectScene.addEventListener("change", async () => {
  const name = els.selectScene.value;
  const isDemo = name.startsWith("demo:");
  els.btnSceneDelete.hidden = !name || isDemo;
  if (!name) return;
  let snap;
  if (isDemo) {
    snap = demoScenes[name.slice(5)];
  } else {
    const all = loadScenes();
    snap = all[name];
  }
  if (!snap) return;
  // Apply level first (may need to fetch GeoJSON)
  if (snap.level && snap.level !== state.level) {
    if (snap.chochoPref) state.chochoPref = snap.chochoPref;
    if (snap.chochoMuni) state.chochoMuni = snap.chochoMuni;
    await applyLevel(snap.level);
  }
  // restore inputs
  for (const k of ["classes","method","palette","reverse","mode","maxR","compare","field","fieldB"]) {
    if (snap[k] !== undefined) state[k] = snap[k];
  }
  if (snap.method)  els.selectMethod.value = snap.method;
  if (snap.palette) els.selectPalette.value = snap.palette;
  if (snap.classes) els.inputClasses.value = snap.classes;
  if (snap.mode)    els.selectMode.value = snap.mode;
  if (snap.maxR)    els.inputMaxR.value = snap.maxR;
  if (snap.reverse !== undefined) els.chkReverse.checked = !!snap.reverse;
  if (snap.compare !== undefined) els.chkCompare.checked = !!snap.compare;
  if (snap.manualBreaks !== undefined) els.inputManualBreaks.value = snap.manualBreaks;
  if (snap.prefFilter !== undefined && els.selectPrefFilter) els.selectPrefFilter.value = snap.prefFilter;
  if (snap.dataSource !== undefined && els.inputDataSource) els.inputDataSource.value = snap.dataSource;
  if (snap.mapTitle !== undefined && els.inputMapTitle) {
    els.inputMapTitle.value = snap.mapTitle;
    els.inputMapTitle.dispatchEvent(new Event("input"));
  }
  if (snap.mapSubtitle !== undefined && els.inputMapSubtitle) {
    els.inputMapSubtitle.value = snap.mapSubtitle;
    els.inputMapSubtitle.dispatchEvent(new Event("input"));
  }
  if (snap.mapAuthor !== undefined && els.inputMapAuthor) {
    els.inputMapAuthor.value = snap.mapAuthor;
  }
  if (snap.scatterColorBy !== undefined && els.scatterColorBy) {
    els.scatterColorBy.value = snap.scatterColorBy;
  }
  if (snap.showScale !== undefined && els.chkShowScale) {
    els.chkShowScale.checked = !!snap.showScale;
    els.chkShowScale.dispatchEvent(new Event("change"));
  }
  if (snap.showNorth !== undefined && els.chkShowNorth) {
    els.chkShowNorth.checked = !!snap.showNorth;
    els.chkShowNorth.dispatchEvent(new Event("change"));
  }
  if (snap.showCoords !== undefined && els.chkShowCoords) {
    els.chkShowCoords.checked = !!snap.showCoords;
    els.chkShowCoords.dispatchEvent(new Event("change"));
  }
  if (snap.showMinimap !== undefined && els.chkShowMinimap) {
    els.chkShowMinimap.checked = !!snap.showMinimap;
    els.chkShowMinimap.dispatchEvent(new Event("change"));
  }
  if (snap.legendPos !== undefined && els.selectLegendPos) {
    els.selectLegendPos.value = snap.legendPos;
    els.selectLegendPos.dispatchEvent(new Event("change"));
    if (snap.legendPos === "free" && els.overlay) {
      if (snap.legendFreeLeft) els.overlay.style.left = snap.legendFreeLeft;
      if (snap.legendFreeTop)  els.overlay.style.top  = snap.legendFreeTop;
    }
  }
  // Apply visibility toggles
  els.rowSymbolSize.hidden = !(state.mode === "symbol" || state.mode === "both" || state.mode === "graduated");
  els.rowDotUnit.hidden = state.mode !== "dot";
  els.rowManualBreaks.hidden = state.method !== "manual";
  // Pie fields
  if (snap.pieFields?.length && els.selectPieFields) {
    populatePieFields();
    [...els.selectPieFields.options].forEach(o => o.selected = snap.pieFields.includes(o.value));
  }
  if (state.field && els.selectField) els.selectField.value = state.field;
  if (state.dataset) refresh();
  setSummary(`シーン「${name}」を復元しました`, "success");
});
els.btnSceneDelete.addEventListener("click", () => {
  const name = els.selectScene.value;
  if (!name) return;
  if (!confirm(`シーン「${name}」を削除しますか？`)) return;
  const all = loadScenes();
  delete all[name];
  saveScenes(all);
  refreshSceneList();
  els.btnSceneDelete.hidden = true;
  setSummary(`シーン「${name}」を削除しました`, "muted");
});
refreshSceneList();

els.btnSceneExport.addEventListener("click", () => {
  const all = loadScenes();
  const keys = Object.keys(all);
  if (!keys.length) { setSummary("保存されているシーンがありません", "warn"); return; }
  const blob = new Blob([JSON.stringify({ format: "mandaranext-scenes", version: 1, scenes: all }, null, 2)],
    { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `mandaranext_scenes_${new Date().toISOString().slice(0,10)}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  setSummary(`${keys.length} シーンを書き出しました`, "success");
});

// ----- URL-hash sharing -----
function snapshotToHash(snap) {
  const json = JSON.stringify(snap);
  // base64url safe
  const b64 = btoa(unescape(encodeURIComponent(json)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return "#s=" + b64;
}
function hashToSnapshot(hash) {
  if (!hash || !hash.startsWith("#s=")) return null;
  try {
    const b64 = hash.slice(3).replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - b64.length % 4) % 4);
    return JSON.parse(decodeURIComponent(escape(atob(padded))));
  } catch { return null; }
}

els.btnSceneShareUrl.addEventListener("click", async () => {
  const snap = snapshotCurrent();
  const url = location.origin + location.pathname + snapshotToHash(snap);
  try {
    await navigator.clipboard.writeText(url);
    setSummary("共有URLをクリップボードにコピーしました", "success");
  } catch {
    prompt("以下のURLをコピーして共有してください:", url);
  }
});

// On boot, if a snapshot hash is present, apply it after the level has loaded.
(async function applyHashSnapshot() {
  const snap = hashToSnapshot(location.hash);
  if (!snap) return;
  // Defer to allow initial applyLevel() to run first
  await new Promise(r => setTimeout(r, 300));
  if (snap.level && snap.level !== state.level) {
    if (snap.chochoPref) state.chochoPref = snap.chochoPref;
    if (snap.chochoMuni) state.chochoMuni = snap.chochoMuni;
    await applyLevel(snap.level);
  }
  for (const k of ["classes","method","palette","reverse","mode","maxR","compare","field","fieldB"]) {
    if (snap[k] !== undefined) state[k] = snap[k];
  }
  if (snap.method)  els.selectMethod.value = snap.method;
  if (snap.palette) els.selectPalette.value = snap.palette;
  if (snap.classes) els.inputClasses.value = snap.classes;
  if (snap.mode)    els.selectMode.value = snap.mode;
  if (snap.maxR)    els.inputMaxR.value = snap.maxR;
  if (snap.reverse !== undefined) els.chkReverse.checked = !!snap.reverse;
  if (snap.compare !== undefined) els.chkCompare.checked = !!snap.compare;
  if (snap.manualBreaks !== undefined) els.inputManualBreaks.value = snap.manualBreaks;
  if (snap.prefFilter !== undefined && els.selectPrefFilter) els.selectPrefFilter.value = snap.prefFilter;
  els.rowSymbolSize.hidden = !(state.mode === "symbol" || state.mode === "both" || state.mode === "graduated");
  els.rowDotUnit.hidden = state.mode !== "dot";
  els.rowManualBreaks.hidden = state.method !== "manual";
  if (state.field && els.selectField) els.selectField.value = state.field;
  if (state.dataset) refresh();
  setSummary("URLから設定を復元しました", "success");
})();

els.fileSceneImport.addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    const json = JSON.parse(text);
    const incoming = json.scenes || json;
    if (typeof incoming !== "object") throw new Error("形式不正");
    const existing = loadScenes();
    let added = 0, replaced = 0;
    for (const [k, v] of Object.entries(incoming)) {
      if (existing[k]) replaced++; else added++;
      existing[k] = v;
    }
    saveScenes(existing);
    refreshSceneList();
    setSummary(`シーン読込完了: 新規 ${added} / 上書き ${replaced} = 計 ${added + replaced}`, "success");
  } catch (err) {
    setSummary("シーン読込失敗: " + err.message, "error");
  } finally {
    e.target.value = "";
  }
});

function addTsDerivedColumn(kind) {
  if (!state.dataset) return;
  const s = tsState.series[tsState.baseIdx];
  if (!s) return;
  const fi = parseInt(els.tsFrom.value, 10) || 0;
  const ti = parseInt(els.tsTo.value, 10) || (s.points.length - 1);
  const pf = s.points[fi], pt = s.points[ti];
  if (!pf || !pt || pf === pt) { setSummary("起点と終点は別の時点を選んでください", "warn"); return; }
  const name = kind === "diff"
    ? `${s.base}_差分_${pf.year}→${pt.year}`
    : `${s.base}_増減率_${pf.year}→${pt.year}_%`;
  if (state.dataset.fields.includes(name)) {
    setSummary(`列「${name}」はすでに存在します`, "warn");
    state.field = name; els.selectField.value = name; refresh();
    return;
  }
  for (const r of state.dataset.rows) {
    const a = r.values[pf.field], b = r.values[pt.field];
    if (!Number.isFinite(a) || !Number.isFinite(b)) { r.values[name] = null; continue; }
    if (kind === "diff") r.values[name] = b - a;
    else r.values[name] = a !== 0 ? ((b - a) / Math.abs(a)) * 100 : null;
  }
  state.dataset.fields.push(name);
  populateFieldSelects();
  state.field = name; els.selectField.value = name;
  refresh();
  setSummary(`派生列「${name}」を追加しました (${state.dataset.fields.length}列)`, "success");
}
els.tsDiff.addEventListener("click", () => addTsDerivedColumn("diff"));
els.tsRatio.addEventListener("click", () => addTsDerivedColumn("ratio"));

els.tsBase.addEventListener("change", () => {
  tsState.baseIdx = parseInt(els.tsBase.value, 10) || 0;
  const pts = tsState.series[tsState.baseIdx].points;
  els.tsSlider.max = String(pts.length - 1);
  els.tsSlider.value = "0";
  const opts = pts.map((p, i) => `<option value="${i}">${p.year}年: ${escapeHtmlText(p.field)}</option>`).join("");
  if (els.tsFrom) els.tsFrom.innerHTML = opts;
  if (els.tsTo)   els.tsTo.innerHTML   = opts;
  if (els.tsFrom) els.tsFrom.value = "0";
  if (els.tsTo)   els.tsTo.value   = String(pts.length - 1);
  setTsField();
});
els.tsSlider.addEventListener("input", setTsField);
els.tsPlay.addEventListener("click", tsPlay);
els.tsStop.addEventListener("click", tsStop);
els.tsSpeed.addEventListener("change", () => {
  if (tsState.timer) { tsStop(); tsPlay(); }
});

els.tsGif.addEventListener("click", async () => {
  if (typeof GIF === "undefined" || typeof htmlToImage === "undefined") {
    setSummary("gif.js または html-to-image が未読込", "error"); return;
  }
  const s = tsState.series[tsState.baseIdx];
  if (!s) return;
  tsStop();
  const wrap = document.querySelector(".map-wrap");
  setSummary(`GIF を生成中… 0/${s.points.length} フレーム`, "muted");
  const gif = new GIF({
    workers: 2,
    quality: 10,
    workerScript: "https://unpkg.com/gif.js@0.2.0/dist/gif.worker.js",
    width: wrap.offsetWidth,
    height: wrap.offsetHeight,
  });
  for (let i = 0; i < s.points.length; i++) {
    els.tsSlider.value = String(i);
    setTsField();
    // wait for the map / chart to update
    await new Promise(r => setTimeout(r, 400));
    const canvas = await htmlToImage.toCanvas(wrap, {
      backgroundColor: "#ffffff",
      filter: (n) => !(n.classList && (n.classList.contains("leaflet-control-zoom") || n.classList.contains("leaflet-control-layers"))),
    });
    gif.addFrame(canvas, { delay: 800, copy: true });
    setSummary(`GIF を生成中… ${i+1}/${s.points.length} フレーム`, "muted");
  }
  gif.on("finished", (blob) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `mandara_timeseries_${s.base}.gif`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    setSummary(`GIF を保存しました: mandara_timeseries_${s.base}.gif`, "success");
  });
  gif.render();
});

let measureOn = false;
let areaOn = false;
let bufferOn = false;

function toggleMeasure(on) {
  measureOn = on;
  if (on) {
    if (areaOn) toggleArea(false);
    if (bufferOn) toggleBuffer(false);
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
    if (bufferOn) toggleBuffer(false);
    mapper.enableAreaTool();
    els.btnArea.classList.add("btn-primary");
    setSummary("クリックで頂点を追加・ダブルクリックで面積を確定 (km² / m²)", "muted");
  } else {
    mapper.disableAreaTool();
    els.btnArea.classList.remove("btn-primary");
  }
}
function toggleBuffer(on) {
  bufferOn = on;
  if (on) {
    if (measureOn) toggleMeasure(false);
    if (areaOn) toggleArea(false);
    const km = Math.max(0.1, parseFloat(els.inputBufferKm.value || "10"));
    mapper.enableBufferTool(km, (hits, hitCount, totalCount) => {
      setSummary(`半径${km}km 圏内: ${hitCount}/${totalCount} 件を強調`, "success");
    });
    els.btnBuffer.classList.add("btn-primary");
    setSummary(`地図上の任意の点をクリック → 半径 ${els.inputBufferKm.value}km の地域を強調`, "muted");
  } else {
    mapper.disableBufferTool();
    els.btnBuffer.classList.remove("btn-primary");
  }
}
els.btnMeasure.addEventListener("click", () => toggleMeasure(!measureOn));
els.btnArea.addEventListener("click", () => toggleArea(!areaOn));
els.btnBuffer.addEventListener("click", () => toggleBuffer(!bufferOn));
els.inputBufferKm.addEventListener("change", () => {
  if (bufferOn) { toggleBuffer(false); toggleBuffer(true); }
});

let meshOn = false;
function refreshMesh() {
  if (!meshOn) return;
  const lvl = parseInt(els.selectMeshLevel.value, 10) || 2;
  const n = mapper.applyMeshOverlay(lvl);
  setSummary(`地域メッシュ Lv${lvl}: ${n} セルを描画 (現在表示範囲のみ)`, "success");
}
els.btnMesh.addEventListener("click", () => {
  meshOn = !meshOn;
  if (meshOn) {
    els.btnMesh.classList.add("btn-primary");
    refreshMesh();
    mapper.map.on("moveend zoomend", refreshMesh);
  } else {
    els.btnMesh.classList.remove("btn-primary");
    mapper.clearMeshOverlay();
    mapper.map.off("moveend zoomend", refreshMesh);
  }
});
els.selectMeshLevel.addEventListener("change", () => meshOn && refreshMesh());

let drawOn = false;
els.btnDraw.addEventListener("click", () => {
  drawOn = !drawOn;
  if (drawOn) {
    mapper.enableDrawTool();
    els.btnDraw.classList.add("btn-primary");
    setSummary("地図上で自由描画できます。 GeoJSON出力時に描画も含まれます。", "muted");
  } else {
    mapper.disableDrawTool();
    els.btnDraw.classList.remove("btn-primary");
  }
});

// ----- Geocoding via GSI AddressSearch -----
let geocodeMarker = null;
let geocodeDebounce = null;
async function runGeocode() {
  const q = els.inputGeocode.value.trim();
  if (!q) return;
  setSummary(`住所検索中…  「${q}」`, "muted");
  try {
    const url = "https://msearch.gsi.go.jp/address-search/AddressSearch?q=" + encodeURIComponent(q);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const arr = await res.json();
    if (!arr.length) { setSummary(`「${q}」は見つかりませんでした`, "warn"); return; }
    const top = arr[0];
    const [lng, lat] = top.geometry.coordinates;
    const title = top.properties.title || q;
    if (geocodeMarker) mapper.map.removeLayer(geocodeMarker);
    geocodeMarker = L.marker([lat, lng]).addTo(mapper.map);
    geocodeMarker.bindPopup(`<strong>${title}</strong><br/>${lat.toFixed(5)}, ${lng.toFixed(5)}`).openPopup();
    mapper.map.setView([lat, lng], Math.max(mapper.map.getZoom(), 13));
    setSummary(`${title}  (${lat.toFixed(4)}, ${lng.toFixed(4)})  該当 ${arr.length} 件`, "success");
  } catch (e) {
    setSummary("住所検索失敗: " + e.message, "error");
  }
}
els.inputGeocode.addEventListener("keydown", (e) => {
  if (e.key === "Enter") { e.preventDefault(); runGeocode(); }
});
els.inputGeocode.addEventListener("change", runGeocode);

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
  // Apply attribute filter (Set of keys) if active
  let rowsRaw = state.dataset.rows;
  const total = rowsRaw.length;
  let filtered = false;
  if (state.filteredKeys instanceof Set && state.filteredKeys.size > 0) {
    rowsRaw = rowsRaw.filter(r => state.filteredKeys.has(r.key));
    filtered = true;
  }
  // Apply table sort if user has clicked a column header
  const sort = getSortState();
  let sorted = false;
  if (sort.field) {
    const dir = sort.asc ? 1 : -1;
    const isName = sort.field === "name";
    rowsRaw = rowsRaw.slice().sort((a, b) => {
      const va = isName ? (a.name || "") : a.values[sort.field];
      const vb = isName ? (b.name || "") : b.values[sort.field];
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
      return String(va).localeCompare(String(vb), "ja") * dir;
    });
    sorted = true;
  }
  const header = ["地域", ...f];
  const rows = rowsRaw.map(r => [r.name || ("#"+r.key), ...f.map(k => r.values[k] ?? "")]);
  const csv = [header.map(csvEscape).join(",")]
    .concat(rows.map(r => r.map(csvEscape).join(","))).join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const suffix = [filtered ? "filtered" : null, sorted ? "sorted" : null].filter(Boolean).join("_");
  a.href = url;
  a.download = `mandara_data${suffix ? "_" + suffix : ""}_${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  const tagParts = [];
  if (filtered) tagParts.push(`フィルタ適用 ${rows.length}/${total}行`);
  if (sorted) tagParts.push(`ソート: ${sort.field === "name" ? "地域" : sort.field}${sort.asc ? "↑" : "↓"}`);
  const tag = tagParts.length ? `（${tagParts.join(" · ")}）` : "";
  setSummary(`データを ${a.download} としてダウンロードしました（${rows.length}行 / ${f.length}列）${tag}`, "success");
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

els.btnPng.addEventListener("click", async () => {
  const wrap = document.querySelector(".map-wrap");
  const dpi = parseInt(els.selectExportDpi?.value || "2", 10) || 2;
  const dpiTag = dpi !== 2 ? `_${dpi}x` : "";
  const fname = `mandara_${(state.field || "map").replace(/\s+/g, "_")}${dpiTag}.png`;
  if (dpi >= 3) setSummary(`高解像度 ${dpi}x で書き出し中…（数秒お待ちください）`, "muted");
  await exportPng(wrap, fname, { pixelRatio: dpi });
  if (dpi >= 3) setSummary(`PNG (${dpi}x) を ${fname} として保存しました`, "success");
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
  state.filteredKeys = null;
  // pick first numeric field as default
  state.field = ds.fields[0];

  // Field selectors (main + derived A/B)
  populateFieldSelects();
  els.selectField.value = state.field;

  // Reveal panels
  els.panelField.hidden = false;
  els.rowFieldFilter.hidden = ds.fields.length < 6;   // show filter only when there are many cols
  els.panelClass.hidden = false;
  els.panelStats.hidden = false;
  els.panelLegend.hidden = false;
  els.panelTable.hidden = false;
  els.panelHist.hidden = false;
  els.panelBox.hidden = false;
  if (ds.fields.length >= 2) {
    els.panelCt.hidden = false;
    if (els.ctRow.options.length >= 2) {
      els.ctRow.value = ds.fields[0];
      els.ctCol.value = ds.fields[1];
    }
  } else {
    els.panelCt.hidden = true;
  }
  if (ds.fields.length >= 2) {
    els.panelScatter.hidden = false;
    populateScatterSelectors(ds.fields);
  } else {
    els.panelScatter.hidden = true;
  }
  // Pre-populate pie field options for the new dataset
  populatePieFields();
  // Data-quality summary per column
  renderDataQuality();
  // Detect time series
  setupTimeSeriesPanel();

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
  const manualBreaks = state.method === "manual"
    ? els.inputManualBreaks.value.split(/[,、\s]+/).map(s => parseFloat(s.replace(/,/g, ""))).filter(v => Number.isFinite(v))
    : null;
  const { breaks } = computeBreaks(values, state.classes, state.method, { manualBreaks });
  state.breaks = breaks;
  state.colors = getPalette(state.palette, Math.max(1, breaks.length - 1), state.reverse);
  // Apply per-class user overrides for the current palette
  const overrides = state.customColors[state.palette] || {};
  state.colors = state.colors.map((c, i) => overrides[i] || c);
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
  } else if (state.mode === "graduated") {
    mapper.applyGraduatedSymbols(state.valueMap, state.breaks, state.colors, {
      maxRadiusPx: state.maxR,
    });
  } else if (state.mode === "cartogram") {
    mapper.applyCartogram(state.valueMap, state.breaks, state.colors);
  } else if (state.mode === "hatch") {
    mapper.applyHatch(state.valueMap, state.breaks, state.colors);
  } else if (state.mode === "arrow") {
    mapper.applyRotationSymbols(state.valueMap, state.field);
  } else if (state.mode === "label") {
    mapper.applyLabels(state.valueMap, state.field);
  } else if (state.mode === "contour") {
    // Build sample point set: (centroid + value) for every polygon, or town points for chocho
    const samples = [];
    if (state.level === "chocho") {
      for (const t of state.chochoTowns || []) {
        const v = state.valueMap?.get(t.id);
        if (Number.isFinite(t.lat) && Number.isFinite(t.lng) && Number.isFinite(v)) {
          samples.push({ lat: t.lat, lng: t.lng, v });
        }
      }
    } else if (mapper.layer) {
      mapper.layer.eachLayer((lyr) => {
        const id = lyr.feature.properties.id;
        const v = state.valueMap?.get(id);
        if (!Number.isFinite(v)) return;
        try {
          const c = lyr.getBounds().getCenter();
          samples.push({ lat: c.lat, lng: c.lng, v });
        } catch {}
      });
    }
    mapper.applyContours(samples, state.colors, { gridSize: 90 });
  } else if (state.mode === "pie" || state.mode === "bar") {
    const selected = [...els.selectPieFields.selectedOptions].map(o => o.value);
    const seriesColors = getPalette(state.palette, Math.max(2, selected.length), state.reverse);
    if (state.mode === "pie") {
      const radius = Math.max(8, parseInt(els.inputPieRadius.value || "18", 10));
      mapper.applyPieCharts(state.dataset, selected, seriesColors, { radiusPx: radius });
      renderPieLegend(els.legendBox, selected, seriesColors, "円グラフ構成");
      renderPieLegend(els.overlayLegend, selected, seriesColors);
    } else {
      mapper.applyBarCharts(state.dataset, selected, seriesColors);
      renderPieLegend(els.legendBox, selected, seriesColors, "棒グラフ構成");
      renderPieLegend(els.overlayLegend, selected, seriesColors);
    }
  } else {
    mapper.clearSymbols();
  }

  const naFlag = hasMissing(values);
  renderLegend(els.legendBox, state.breaks, state.colors, {
    title: state.field, showNA: naFlag,
    onClassHover: (idx, ev) => {
      if (ev.type === "mouseenter") mapper.highlightByClass(idx);
    },
    onColorPick: (idx, hex) => {
      if (!state.customColors[state.palette]) state.customColors[state.palette] = {};
      state.customColors[state.palette][idx] = hex;
      refresh();
    },
    onBreakEdit: (idx, newUpper) => {
      // Convert current breaks to manual mode: keep all but replace breaks[idx+1] with newUpper.
      const updated = state.breaks.slice();
      updated[idx + 1] = newUpper;
      // Manual breaks UI takes inner cut points (length = classes - 1)
      const inner = updated.slice(1, -1);
      els.inputManualBreaks.value = inner.join(", ");
      els.selectMethod.value = "manual";
      state.method = "manual";
      els.rowManualBreaks.hidden = false;
      els.hintManual.hidden = false;
      refresh();
      setSummary(`境界値を ${newUpper} に変更（手動区分モード）`, "success");
    },
  });
  els.legendBox.addEventListener("mouseleave", () => mapper.clearHighlight(), { once: true });
  renderLegend(els.overlayLegend, state.breaks, state.colors, { showNA: naFlag });
  els.overlay.hidden = false;
  els.overlayTitle.textContent = state.field;
  const src = (els.inputDataSource?.value || "").trim();
  const author = (els.inputMapAuthor?.value || "").trim();
  const parts = [];
  if (src) parts.push(`出典: ${src}`);
  if (author) parts.push(`作成: ${author}`);
  parts.push(`MandaraNext · ${new Date().toLocaleDateString("ja-JP")}`);
  els.overlayFooter.textContent = parts.join(" · ");

  renderStats(values);

  // Compare pane (paneB)
  if (state.compare && state.fieldB) {
    const valuesB = state.dataset.rows.map(r => r.values[state.fieldB]);
    const { breaks: breaksB } = computeBreaks(valuesB, state.classes, state.method);
    const paletteB = els.selectPaletteB.value || state.palette;
    const colorsB = getPalette(paletteB, Math.max(1, breaksB.length - 1), state.reverse);
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

  // Data table — with inline editing
  renderTable(els.tableWrap, state.dataset.rows, state.dataset.fields, onTableRowHover, onCellEdit);

  // Box plot
  if (els.boxplotSvg) renderBoxplot(els.boxplotSvg, values, state.field);

  // Histogram with bin → map highlight link
  if (els.histSvg) {
    const bins = parseInt(els.histBins.value, 10) || 10;
    renderHistogram(els.histSvg, values, state.field, bins, (lo, hi, idx, isOn) => {
      if (!isOn) { mapper.clearOutlierMarks(); return; }
      const hits = new Set();
      const isLastBin = idx === bins - 1;
      for (const r of state.dataset.rows) {
        const x = r.values[state.field];
        if (!Number.isFinite(x)) continue;
        if (x >= lo && (isLastBin ? x <= hi : x < hi)) hits.add(r.key);
      }
      mapper.markOutliers(hits);
    }, {
      overlay: els.chkHistOverlay?.checked !== false,
      breaks:  els.chkHistBreaks?.checked !== false ? state.breaks : null,
      colors:  els.chkHistBreaks?.checked !== false ? state.colors : null,
    });
  }

  // Outlier highlight
  applyOutlierHighlight(values);

  // Ranking
  renderRanking();

  // Standard deviation ellipse
  applySdeDisplay();

  saveSettings(state);
}

function applySdeDisplay() {
  if (!els.chkSde.checked) {
    mapper.clearSDE();
    els.sdeInfo.textContent = "";
    return;
  }
  // Gather point cloud: prefer polygon-feature centroids; fall back to chocho towns.
  const pts = [];
  if (state.geojson?.features) {
    for (const f of state.geojson.features) {
      const id = f.properties?.id;
      const v = state.valueMap?.get(id);
      if (!Number.isFinite(v) || v <= 0) continue;   // weight by current value
      // Use the polygon centroid (just take bbox centre for speed)
      try {
        const layer = mapper.layer;
        if (layer) {
          layer.eachLayer((lyr) => {
            if (lyr.feature.properties.id === id) {
              try { const c = lyr.getBounds().getCenter(); pts.push([c.lat, c.lng]); } catch {}
            }
          });
        }
      } catch {}
    }
  } else if (state.chochoTowns?.length) {
    for (const t of state.chochoTowns) {
      if (Number.isFinite(t.lat) && Number.isFinite(t.lng)) pts.push([t.lat, t.lng]);
    }
  }
  if (pts.length < 3) {
    mapper.clearSDE();
    els.sdeInfo.textContent = "標準偏差楕円: 点が3つ未満で計算できません";
    return;
  }
  const r = mapper.applyStandardDeviationEllipse(pts);
  if (r) {
    els.sdeInfo.innerHTML =
      `中心: ${r.center[0].toFixed(3)}, ${r.center[1].toFixed(3)}<br/>` +
      `長軸: ${r.semiMajorKm.toFixed(1)}km / 短軸: ${r.semiMinorKm.toFixed(1)}km / 方位角: ${r.rotationDeg.toFixed(1)}°`;
  }
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

function onCellEdit(id, field, newValue) {
  const row = state.dataset?.rows.find(r => r.key === id);
  if (!row) return;
  row.values[field] = newValue;
  setSummary(`${row.name || "#"+id} の「${field}」を ${newValue == null ? "—" : newValue} に更新`, "success");
  refresh();
}

// ----- Time series (連続表示モード) -----
// Detect year-stamped columns. Group fields by their base name so that
// "人口(2010)", "人口(2015)", "人口(2020)" share the same series.
const YEAR_RE = /(\d{4})/;

function detectTimeSeries(fields) {
  const groups = new Map();  // base → [{ year, field }]
  for (const f of fields) {
    const m = f.match(YEAR_RE);
    if (!m) continue;
    const year = parseInt(m[1], 10);
    if (year < 1800 || year > 2100) continue;
    const base = f.replace(YEAR_RE, "").replace(/[（()_ -]+/g, "").trim() || "指標";
    if (!groups.has(base)) groups.set(base, []);
    groups.get(base).push({ year, field: f });
  }
  // Keep only groups with ≥2 time points
  const result = [];
  for (const [base, arr] of groups) {
    if (arr.length < 2) continue;
    arr.sort((a, b) => a.year - b.year);
    result.push({ base, points: arr });
  }
  return result;
}

let tsState = { series: [], baseIdx: 0, timer: null };

function setupTimeSeriesPanel() {
  if (!state.dataset) { els.panelTs.hidden = true; return; }
  tsState.series = detectTimeSeries(state.dataset.fields);
  if (!tsState.series.length) { els.panelTs.hidden = true; return; }
  els.panelTs.hidden = false;
  els.tsBase.innerHTML = tsState.series.map((s, i) => `<option value="${i}">${s.base}</option>`).join("");
  tsState.baseIdx = Math.min(tsState.baseIdx, tsState.series.length - 1);
  els.tsBase.value = String(tsState.baseIdx);
  const pts = tsState.series[tsState.baseIdx].points;
  els.tsSlider.max = String(pts.length - 1);
  els.tsSlider.value = "0";
  // Also populate from/to selectors for the diff/ratio buttons
  const opts = pts.map((p, i) => `<option value="${i}">${p.year}年: ${escapeHtmlText(p.field)}</option>`).join("");
  if (els.tsFrom) els.tsFrom.innerHTML = opts;
  if (els.tsTo)   els.tsTo.innerHTML   = opts;
  if (els.tsFrom) els.tsFrom.value = "0";
  if (els.tsTo)   els.tsTo.value   = String(pts.length - 1);
  updateTsLabel();
}

function updateTsLabel() {
  const s = tsState.series[tsState.baseIdx];
  if (!s) return;
  const p = s.points[+els.tsSlider.value];
  if (!p) return;
  els.tsCurrent.textContent = `${p.year}年: ${p.field}`;
}

function setTsField() {
  const s = tsState.series[tsState.baseIdx];
  if (!s) return;
  const p = s.points[+els.tsSlider.value];
  if (!p) return;
  state.field = p.field;
  els.selectField.value = p.field;
  updateTsLabel();
  refresh();
}

function tsPlay() {
  if (tsState.timer) clearInterval(tsState.timer);
  const speed = parseInt(els.tsSpeed.value, 10);
  els.tsPlay.hidden = true;
  els.tsStop.hidden = false;
  tsState.timer = setInterval(() => {
    const max = +els.tsSlider.max;
    let v = +els.tsSlider.value + 1;
    if (v > max) v = 0;
    els.tsSlider.value = String(v);
    setTsField();
  }, speed);
}
function tsStop() {
  if (tsState.timer) clearInterval(tsState.timer);
  tsState.timer = null;
  els.tsPlay.hidden = false;
  els.tsStop.hidden = true;
}

function renderRanking() {
  if (!els.rankingBox || !state.dataset || !state.field) return;
  const rows = state.dataset.rows
    .filter(r => Number.isFinite(r.values[state.field]))
    .sort((a, b) => b.values[state.field] - a.values[state.field]);
  const top = rows.slice(0, 5);
  const bot = rows.slice(-5).reverse();
  const buildRow = (r, i, prefix = "") => {
    const v = r.values[state.field];
    return `<div class="rk-row" data-id="${r.key}"><span class="rk-pos">${prefix}${i+1}</span><span class="rk-name">${escapeHtmlText(r.name || "#"+r.key)}</span><span class="rk-val">${formatNum(v)}</span></div>`;
  };
  els.rankingBox.innerHTML =
    `<div class="rk-section">上位 5</div>${top.map((r,i) => buildRow(r, i)).join("")}` +
    `<div class="rk-section">下位 5</div>${bot.map((r,i) => buildRow(r, i)).join("")}`;
  els.rankingBox.querySelectorAll(".rk-row").forEach(el => {
    const id = parseInt(el.dataset.id, 10) || el.dataset.id;
    el.addEventListener("mouseenter", () => mapper.highlightById(isNaN(id) ? el.dataset.id : id));
    el.addEventListener("mouseleave", () => mapper.clearHighlight());
    el.addEventListener("click", () => mapper.zoomToFeature(isNaN(id) ? el.dataset.id : id));
  });
}

function renderDataQuality() {
  if (!els.dataQuality || !state.dataset) return;
  const total = state.dataset.rows.length;
  const lines = state.dataset.fields.map((f) => {
    let n = 0, missing = 0;
    let mn = Infinity, mx = -Infinity;
    for (const r of state.dataset.rows) {
      const v = r.values[f];
      if (Number.isFinite(v)) {
        n++; if (v < mn) mn = v; if (v > mx) mx = v;
      } else missing++;
    }
    const missingPct = (missing / total) * 100;
    const flag =
      missingPct >= 50 ? "🟥" :
      missingPct >= 20 ? "🟧" :
      missingPct > 0  ? "🟨" : "🟩";
    return `<tr><td>${flag}</td><td>${escapeHtmlText(f)}</td><td>${n}件</td><td>${missing}件 (${missingPct.toFixed(0)}%)</td></tr>`;
  });
  els.dataQuality.innerHTML =
    `<table style="font-size:11px;border-collapse:collapse;width:100%">` +
    `<thead><tr><th></th><th style="text-align:left">列</th><th>有効</th><th>欠損</th></tr></thead>` +
    `<tbody>${lines.join("")}</tbody></table>` +
    `<div style="margin-top:4px;color:var(--muted)">🟩 0% / 🟨 〜20% / 🟧 20-50% / 🟥 50%以上欠損</div>`;
}

function renderPieLegend(container, fields, colors, title) {
  container.innerHTML = "";
  if (title) {
    const t = document.createElement("div");
    t.style.cssText = "font-weight:600;margin-bottom:4px";
    t.textContent = title;
    container.appendChild(t);
  }
  fields.forEach((f, i) => {
    const row = document.createElement("div");
    row.className = "legend-row";
    const sw = document.createElement("span");
    sw.className = "legend-swatch";
    sw.style.background = colors[i] || "#94a3b8";
    const label = document.createElement("span");
    label.textContent = f;
    row.appendChild(sw); row.appendChild(label);
    container.appendChild(row);
  });
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

function renderFieldList() {
  if (!els.fieldList) return;
  if (!state.dataset || !state.dataset.fields.length) {
    els.fieldList.innerHTML = ""; return;
  }
  els.fieldList.innerHTML = state.dataset.fields.map((f) =>
    `<div class="fl-item"><span class="fl-name">${escapeHtmlText(f)}</span>` +
    `<button data-rename="${escapeHtmlText(f)}" title="列名を変更">✎</button>` +
    `<button data-f="${escapeHtmlText(f)}" title="この列を削除">×</button></div>`
  ).join("");
  els.fieldList.querySelectorAll("button[data-f]").forEach(btn => {
    btn.addEventListener("click", () => deleteField(btn.dataset.f));
  });
  els.fieldList.querySelectorAll("button[data-rename]").forEach(btn => {
    btn.addEventListener("click", () => renameField(btn.dataset.rename));
  });
}

function renameField(oldName) {
  if (!state.dataset) return;
  const newName = (prompt(`列「${oldName}」の新しい名前を入力してください`, oldName) || "").trim();
  if (!newName || newName === oldName) return;
  if (state.dataset.fields.includes(newName)) {
    setSummary(`「${newName}」という列はすでに存在します`, "warn");
    return;
  }
  // Replace in fields[]
  const idx = state.dataset.fields.indexOf(oldName);
  if (idx < 0) return;
  state.dataset.fields[idx] = newName;
  // Migrate value keys on every row
  for (const r of state.dataset.rows) {
    if (oldName in r.values) {
      r.values[newName] = r.values[oldName];
      delete r.values[oldName];
    }
  }
  // Update state.field / state.fieldB if they referenced the old name
  if (state.field === oldName)  state.field  = newName;
  if (state.fieldB === oldName) state.fieldB = newName;
  populateFieldSelects();
  if (state.field) els.selectField.value = state.field;
  if (state.fieldB) els.selectFieldB.value = state.fieldB;
  refresh();
  setSummary(`列「${oldName}」を「${newName}」にリネームしました`, "success");
}

function deleteField(field) {
  if (!state.dataset) return;
  if (!confirm(`列「${field}」を削除しますか？\n（派生列の参照元になっている場合は再計算されません）`)) return;
  state.dataset.fields = state.dataset.fields.filter(f => f !== field);
  for (const r of state.dataset.rows) delete r.values[field];
  if (state.field === field) state.field = state.dataset.fields[0] || null;
  if (state.fieldB === field) state.fieldB = state.dataset.fields[1] || state.dataset.fields[0] || null;
  populateFieldSelects();
  if (state.field) els.selectField.value = state.field;
  refresh();
  setSummary(`列「${field}」を削除しました`, "success");
}

function populateFieldSelects() {
  const fields = state.dataset?.fields || [];
  renderFieldList();
  for (const sel of [els.selectField, els.selectFieldB, els.derivedA, els.derivedB, els.filterField, els.ctRow, els.ctCol]) {
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
  // Color-by selector: numeric fields are binned into quartile categories
  // implicitly by the drawScatter step. We just need an option list.
  if (els.scatterColorBy) {
    const prev = els.scatterColorBy.value;
    els.scatterColorBy.innerHTML = '<option value="">— なし（地図色）—</option>';
    for (const f of fields) {
      const o = document.createElement("option");
      o.value = f; o.textContent = f;
      els.scatterColorBy.appendChild(o);
    }
    if (fields.includes(prev)) els.scatterColorBy.value = prev;
  }
  drawScatter();
}

function drawScatter() {
  if (!state.dataset) return;
  const xf = els.scatterX.value, yf = els.scatterY.value;
  const xs = state.dataset.rows.map(r => r.values[xf]);
  const ys = state.dataset.rows.map(r => r.values[yf]);
  const ids = state.dataset.rows.map(r => r.key);
  // Color the dots by the *current* map field's class — so the scatter
  // becomes a 3-variable plot (X, Y, classified colour of the map field).
  const colorFor = (id) => {
    if (!state.valueMap || !state.breaks || !state.colors) return null;
    const v = state.valueMap.get(id);
    if (!Number.isFinite(v)) return null;
    const idx = classifyValue(v, state.breaks);
    return idx < 0 ? null : state.colors[idx];
  };
  const names = state.dataset.rows.map(r => r.name || ("#" + r.key));
  // Optional 3rd-variable categorical coloring. If the chosen column is numeric,
  // bin into quartile labels (Q1/Q2/Q3/Q4) so it still renders as discrete series.
  const colorByField = els.scatterColorBy?.value || "";
  let categoryFor = null;
  if (colorByField) {
    const rowsByKey = new Map(state.dataset.rows.map(r => [r.key, r]));
    const allVals = state.dataset.rows.map(r => r.values[colorByField]);
    const numeric = allVals.filter(v => Number.isFinite(v));
    const isNumeric = numeric.length >= state.dataset.rows.length * 0.5;
    if (isNumeric && numeric.length >= 4) {
      const sorted = numeric.slice().sort((a, b) => a - b);
      const q = (p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
      const q1 = q(0.25), q2 = q(0.5), q3 = q(0.75);
      categoryFor = (id) => {
        const row = rowsByKey.get(id);
        const v = row?.values[colorByField];
        if (!Number.isFinite(v)) return null;
        if (v <= q1) return `Q1 (≤${formatNum(q1)})`;
        if (v <= q2) return `Q2 (≤${formatNum(q2)})`;
        if (v <= q3) return `Q3 (≤${formatNum(q3)})`;
        return `Q4 (>${formatNum(q3)})`;
      };
    } else {
      categoryFor = (id) => {
        const row = rowsByKey.get(id);
        const v = row?.values[colorByField];
        return v == null ? null : String(v);
      };
    }
  }
  const { r, n } = renderScatter(els.scatterSvg, xs, ys, xf, yf, ids, onScatterHover, onScatterClick, {
    logX: els.chkScatterLogX.checked,
    logY: els.chkScatterLogY.checked,
    statsOverlay: !!els.chkScatterStats?.checked,
  }, colorFor, names, categoryFor);
  if (r == null) {
    els.scatterCorr.textContent = `n=${n} — 相関係数を計算できません`;
  } else {
    const strength = Math.abs(r) >= 0.7 ? "強い" : Math.abs(r) >= 0.4 ? "中程度の" : "弱い";
    const sign = r >= 0 ? "正" : "負";
    const r2 = (r * r * 100).toFixed(1);
    els.scatterCorr.innerHTML = `n=${n} · ピアソン相関 <strong>r=${r.toFixed(3)}</strong> （${strength}${sign}の相関）· 決定係数 R²=${r2}% (Yの分散のうちXで説明できる割合)`;
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

mapper.onPinChange((ids) => {
  els.btnClearPins.hidden = ids.length === 0;
  if (ids.length) {
    setSummary(`📍 ピン留め ${ids.length}件 (Shift+クリックでON/OFF)`, "muted");
  }
});
els.btnClearPins.addEventListener("click", () => mapper.clearPins());

// ----- PWA install banner -----
let deferredInstallPrompt = null;
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  els.btnInstall.hidden = false;
});
els.btnInstall.addEventListener("click", async () => {
  if (!deferredInstallPrompt) {
    setSummary("既にインストール済み、または対応ブラウザではありません。Safariなら共有→ホーム画面に追加。", "muted");
    return;
  }
  deferredInstallPrompt.prompt();
  const { outcome } = await deferredInstallPrompt.userChoice;
  if (outcome === "accepted") setSummary("ホーム画面に追加されました 🎉", "success");
  deferredInstallPrompt = null;
  els.btnInstall.hidden = true;
});
window.addEventListener("appinstalled", () => {
  els.btnInstall.hidden = true;
  setSummary("インストール完了。ホーム画面/デスクトップから起動できます", "success");
});

const fdDiv = document.getElementById("feature-detail");
const fdName = document.getElementById("fd-name");
const fdTable = document.getElementById("fd-table");
document.getElementById("fd-close")?.addEventListener("click", () => fdDiv.hidden = true);
mapper.onFeatureClick((id, props) => {
  if (!state.dataset) {
    fdName.textContent = props?.nam_ja || props?.name_jp || props?.name_en || "#" + id;
    fdTable.innerHTML = "<tr><td colspan=2 style='color:var(--muted)'>データ未読込</td></tr>";
    fdDiv.hidden = false;
    return;
  }
  const row = state.dataset.rows.find(r => r.key === id);
  if (!row) {
    fdName.textContent = props?.nam_ja || props?.name_jp || props?.name_en || "#" + id;
    fdTable.innerHTML = "<tr><td colspan=2 style='color:var(--muted)'>このデータには該当行がありません</td></tr>";
    fdDiv.hidden = false;
    return;
  }
  fdName.textContent = row.name || ("#" + row.key);
  const rows = state.dataset.fields.map(f => {
    const v = row.values[f];
    return `<tr><td>${escapeHtmlText(f)}</td><td>${v == null ? "—" : formatNum(v)}</td></tr>`;
  });
  fdTable.innerHTML = rows.join("");
  fdDiv.hidden = false;
});

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
