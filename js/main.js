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
import { renderBoxplot, renderGroupedBoxplot } from "./boxplot.js";
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
  starredFields: new Set(),  // user-favorited columns (Cycle 180)
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
  btnDataReset: $("btn-data-reset"),
  overlayFile:  $("overlay-file"),
  btnOverlayClear: $("btn-overlay-clear"),
  inputDataSource: $("input-data-source"),
  inputMapTitle: $("input-map-title"),
  mapTitle:      $("map-title"),
  inputMapSubtitle: $("input-map-subtitle"),
  mapSubtitle:   $("map-subtitle"),
  inputMapAuthor: $("input-map-author"),
  selectTitleAlign: $("select-title-align"),
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
  rowDerivedB:  $("row-derived-b"),
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
  suggestMethod:  $("suggest-method"),
  selectPalette:$("select-palette"),
  chkReverse:   $("chk-reverse"),
  btnResetCustomColors: $("btn-reset-custom-colors"),
  palettePreview: $("palette-preview"),
  panelStats:   $("panel-stats"),
  statsTable:   $("stats-table"),
  btnStatsExport: $("btn-stats-export"),
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
  btnExportLegendPng: $("btn-export-legend-png"),
  btnExportLegendSvg: $("btn-export-legend-svg"),
  selectLegendPos: $("select-legend-pos"),
  selectLegendFs:  $("select-legend-fs"),
  selectLegendPrec: $("select-legend-prec"),
  selectLegendLayout: $("select-legend-layout"),
  panelTable:   $("panel-table"),
  tableSearch:  $("table-search"),
  tableSearchInfo: $("table-search-info"),
  btnTableCols: $("btn-table-cols"),
  tableColPicker: $("table-col-picker"),
  chkTableHeat: $("chk-table-heat"),
  btnTableViewCsv: $("btn-table-view-csv"),
  panelHist:    $("panel-histogram"),
  histBins:     $("hist-bins"),
  chkHistOverlay: $("chk-hist-overlay"),
  chkHistBreaks:  $("chk-hist-breaks"),
  chkHistLogX:    $("chk-hist-logx"),
  chkHistCumulative: $("chk-hist-cumulative"),
  histBinsHint:   $("hist-bins-hint"),
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
  ctView:       $("ct-view"),
  ctExport:     $("ct-export"),
  ctBarPng:     $("ct-bar-png"),
  ctBarSvg:     $("ct-bar-svg"),
  ctResult:     $("ct-result"),
  tableWrap:    $("table-wrap"),
  panelTs:      $("panel-timeseries"),
  tsBase:       $("ts-base"),
  tsSlider:     $("ts-slider"),
  tsCurrent:    $("ts-current"),
  tsPlay:       $("ts-play"),
  tsStop:       $("ts-stop"),
  tsSpeed:      $("ts-speed"),
  chkTsShared:  $("chk-ts-shared-scale"),
  tsGif:        $("ts-gif"),
  tsFrom:       $("ts-from"),
  tsTo:         $("ts-to"),
  tsDiff:       $("ts-diff"),
  tsRatio:      $("ts-ratio"),
  panelScatter: $("panel-scatter"),
  scatterX:     $("scatter-x"),
  scatterY:     $("scatter-y"),
  scatterColorBy: $("scatter-color-by"),
  scatterLabelBy: $("scatter-label-by"),
  scatterShapeBy: $("scatter-shape-by"),
  scatterSizeBy:   $("scatter-size-by"),
  chkScatterStats: $("chk-scatter-stats"),
  chkScatterRegGroup: $("chk-scatter-reg-group"),
  chkScatterStatsTitle: $("chk-scatter-stats-title"),
  chkScatterCi:    $("chk-scatter-ci"),
  chkScatterPi:    $("chk-scatter-pi"),
  chkScatterYx:    $("chk-scatter-yx"),
  chkScatterZero:  $("chk-scatter-zero"),
  chkScatterJitter: $("chk-scatter-jitter"),
  chkScatterLowess: $("chk-scatter-lowess"),
  scatterLabels:   $("scatter-labels"),
  scatterLabelN:   $("scatter-label-n"),
  scatterLabelPlace: $("scatter-label-place"),
  btnScatterClearPins: $("btn-scatter-clear-pins"),
  btnScatterPinsCsv: $("btn-scatter-pins-csv"),
  btnScatterPinOutliers: $("btn-scatter-pin-outliers"),
  btnScatterPinBrush: $("btn-scatter-pin-brush"),
  scatterPinColor: $("scatter-pin-color"),
  scatterDegree:   $("scatter-degree"),
  scatterCsv:      $("scatter-csv"),
  scatterDataCsv:  $("scatter-data-csv"),
  panelSplom:      $("panel-splom"),
  spXList:         $("sp-x-list"),
  spRun:           $("sp-run"),
  spResult:        $("sp-result"),
  panelHc:         $("panel-hclust"),
  hcXList:         $("hc-x-list"),
  hcLinkage:       $("hc-linkage"),
  hcK:             $("hc-k"),
  hcRun:           $("hc-run"),
  hcCsv:           $("hc-csv"),
  hcAdd:           $("hc-add"),
  hcResult:        $("hc-result"),
  panelPca:        $("panel-pca"),
  pcaXList:        $("pca-x-list"),
  pcaRun:          $("pca-run"),
  pcaCsv:          $("pca-csv"),
  pcaMahalanobis:  $("pca-mahalanobis"),
  pcaAdd:          $("pca-add"),
  pcaResult:       $("pca-result"),
  panelKm:         $("panel-kmeans"),
  kmXList:         $("km-x-list"),
  kmK:             $("km-k"),
  kmRun:           $("km-run"),
  kmElbow:         $("km-elbow"),
  kmCsv:           $("km-csv"),
  kmAdd:           $("km-add"),
  kmResult:        $("km-result"),
  panelMr:         $("panel-multireg"),
  mrY:             $("mr-y"),
  mrXList:         $("mr-x-list"),
  mrRun:           $("mr-run"),
  mrCsv:           $("mr-csv"),
  mrResult:        $("mr-result"),
  panelCorrMatrix: $("panel-corrmatrix"),
  corrRun:         $("corr-run"),
  corrCsv:         $("corr-csv"),
  corrMethod:      $("corr-method"),
  corrResult:      $("corr-result"),
  chkScatterLogX: $("chk-scatter-logx"),
  chkScatterLogY: $("chk-scatter-logy"),
  scatterCorr:  $("scatter-correlation"),
  scatterSvg:   $("scatter-svg"),
  scatterGroupReg: $("scatter-group-reg"),
  rowGroupRegCsv: $("row-group-reg-csv"),
  btnGroupRegCsv: $("btn-group-reg-csv"),
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
  btnZen:       $("btn-zen"),
  btnCopyResults: $("btn-copy-results"),
  selectScene:  $("select-scene"),
  btnSceneSave: $("btn-scene-save"),
  btnSceneDelete: $("btn-scene-delete"),
  btnSceneExport: $("btn-scene-export"),
  fileSceneImport: $("file-scene-import"),
  btnSceneShareUrl: $("btn-scene-share-url"),
  btnSceneQr: $("btn-scene-qr"),
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

// Drag-and-drop import (Cycle 148): drop a CSV/Excel/Shapefile anywhere on the
// page to load it. Routes by extension to the existing handlers.
(function setupDropImport() {
  let dragCount = 0;
  const isFileDrag = (e) => e.dataTransfer && [...(e.dataTransfer.types || [])].includes("Files");
  document.addEventListener("dragenter", (e) => {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    dragCount++;
    document.body.classList.add("is-dropping");
  });
  document.addEventListener("dragover", (e) => {
    if (!isFileDrag(e)) return;
    e.preventDefault();
  });
  document.addEventListener("dragleave", (e) => {
    if (!isFileDrag(e)) return;
    dragCount = Math.max(0, dragCount - 1);
    if (dragCount === 0) document.body.classList.remove("is-dropping");
  });
  document.addEventListener("drop", async (e) => {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    dragCount = 0;
    document.body.classList.remove("is-dropping");
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    const name = (file.name || "").toLowerCase();
    if (name.endsWith(".csv") || name.endsWith(".xlsx") || name.endsWith(".xls")) {
      try {
        setSummary(`「${file.name}」を読み込み中…`, "muted");
        const ds = await loadCsvFile(file, csvParseOpts());
        onDatasetReady(ds, file.name);
      } catch (err) {
        setSummary("CSV読み込み失敗: " + err.message, "error");
      }
    } else if (name.endsWith(".shp") || name.endsWith(".zip") || name.endsWith(".geojson") || name.endsWith(".json")) {
      try { await handleShapeFile(file); }
      catch (err) { setSummary("Shapefile 読み込み失敗: " + err.message, "error"); }
    } else {
      setSummary(`未対応の拡張子: ${file.name}（CSV/Excel/Shape/GeoJSON が利用可）`, "warn");
    }
  });
})();

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
  // Bivariate mode needs a Y field — reuse the compare's B selector.
  if (state.mode === "bivariate") {
    els.rowFieldB.hidden = false;
    if (!state.fieldB && state.dataset?.fields.length >= 2) {
      state.fieldB = state.dataset.fields.find(f => f !== state.field) || state.dataset.fields[1];
      els.selectFieldB.value = state.fieldB;
    }
  }
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
  syncResetColorBtn();
});

// Cycle 202: one-click reset of legend swatch overrides for the current
// palette. Hidden when there is nothing to undo so the button never lies.
function syncResetColorBtn() {
  if (!els.btnResetCustomColors) return;
  const overrides = state.customColors?.[state.palette];
  const hasAny = overrides && Object.keys(overrides).length > 0;
  els.btnResetCustomColors.hidden = !hasAny;
}
els.btnResetCustomColors?.addEventListener("click", () => {
  const overrides = state.customColors?.[state.palette];
  if (!overrides || !Object.keys(overrides).length) return;
  if (!confirm(`「${state.palette}」パレットの個別色変更 ${Object.keys(overrides).length} 件を破棄しますか？`)) return;
  delete state.customColors[state.palette];
  refresh();
  syncResetColorBtn();
});

// Cycle 203: export the legend as a standalone PNG so users can drop it into
// a presentation or document without the surrounding map UI. Honors the same
// DPI selector used by full-map export, with a 2× fallback if not set.
els.btnExportLegendPng?.addEventListener("click", async () => {
  if (!els.legendBox || !els.legendBox.children.length) {
    setSummary("凡例が空のため書き出せません", "warn"); return;
  }
  if (typeof htmlToImage === "undefined") {
    setSummary("htmlToImage の読み込みに失敗しました", "error"); return;
  }
  setSummary("凡例PNG を生成中…", "muted");
  try {
    const dpi = parseInt(els.selectExportDpi?.value || "2", 10) || 2;
    const dataUrl = await htmlToImage.toPng(els.legendBox, {
      pixelRatio: dpi,
      backgroundColor: "#ffffff",
      style: { padding: "8px" },
    });
    const a = document.createElement("a");
    const safeField = (state.field || "legend").replace(/[\\/:*?"<>|]/g, "_");
    a.href = dataUrl;
    a.download = `mandara_legend_${safeField}.png`;
    document.body.appendChild(a); a.click(); a.remove();
    setSummary("凡例をPNGで保存しました", "success");
  } catch (e) {
    console.error(e);
    setSummary("凡例PNG の生成に失敗しました: " + (e?.message || e), "error");
  }
});

// Cycle 207: SVG export of the legend via <foreignObject> wrapping. Inlines
// the most relevant computed styles so downstream editors (Inkscape /
// Illustrator) don't lose the layout when external CSS is gone.
els.btnExportLegendSvg?.addEventListener("click", () => {
  if (!els.legendBox || !els.legendBox.children.length) {
    setSummary("凡例が空のため書き出せません", "warn"); return;
  }
  try {
    const rect = els.legendBox.getBoundingClientRect();
    const w = Math.max(120, Math.ceil(rect.width) + 16);
    const h = Math.max(40, Math.ceil(rect.height) + 16);
    // Walk the legend tree and copy resolved styles to inline so the SVG is
    // self-contained. Keep the prop list minimal to avoid huge files.
    const STYLE_PROPS = [
      "font-family", "font-size", "font-weight", "color",
      "background", "background-color",
      "padding", "margin", "border", "border-radius",
      "display", "align-items", "gap", "white-space",
      "width", "height", "line-height", "text-align",
    ];
    const clone = els.legendBox.cloneNode(true);
    const srcAll  = [els.legendBox, ...els.legendBox.querySelectorAll("*")];
    const dstAll  = [clone, ...clone.querySelectorAll("*")];
    for (let i = 0; i < srcAll.length; i++) {
      const cs = getComputedStyle(srcAll[i]);
      const decl = STYLE_PROPS.map(p => `${p}:${cs.getPropertyValue(p)}`).join(";");
      const prev = dstAll[i].getAttribute("style") || "";
      dstAll[i].setAttribute("style", decl + ";" + prev);
    }
    const xml = new XMLSerializer().serializeToString(clone);
    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <rect x="0" y="0" width="${w}" height="${h}" fill="#ffffff"/>
  <foreignObject x="8" y="8" width="${w - 16}" height="${h - 16}">
    <div xmlns="http://www.w3.org/1999/xhtml">${xml}</div>
  </foreignObject>
</svg>`;
    const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const safeField = (state.field || "legend").replace(/[\\/:*?"<>|]/g, "_");
    a.href = url;
    a.download = `mandara_legend_${safeField}.svg`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setSummary("凡例をSVGで保存しました", "success");
  } catch (e) {
    console.error(e);
    setSummary("凡例SVG の生成に失敗しました: " + (e?.message || e), "error");
  }
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

// Legend font size: small / medium / large, applied as a body class so the
// overlay's CSS variable cascades to all sub-elements.
function applyLegendFs(v) {
  document.body.classList.remove("legend-fs-s", "legend-fs-m", "legend-fs-l");
  document.body.classList.add(`legend-fs-${v || "m"}`);
}
els.selectLegendFs?.addEventListener("change", () => {
  const v = els.selectLegendFs.value;
  applyLegendFs(v);
  state.legendFs = v;
  saveSettings(state);
});
// Apply previously-saved value on startup
applyLegendFs(state.legendFs || "m");
// Sync reset-color button visibility on initial load (restores from prior session).
setTimeout(() => { try { syncResetColorBtn(); } catch {} }, 0);
// Cycle 235: restore previously chosen pin color from settings.
if (els.scatterPinColor && state.pinColor && /^#[0-9a-f]{6}$/i.test(state.pinColor)) {
  els.scatterPinColor.value = state.pinColor;
}
if (els.selectLegendFs && state.legendFs) els.selectLegendFs.value = state.legendFs;

// Cycle 198: legend break-value precision (auto / 0..3 decimals).
// Persisted alongside legendFs and re-applied via refresh().
els.selectLegendPrec?.addEventListener("change", () => {
  state.legendPrec = els.selectLegendPrec.value;
  saveSettings(state);
  if (state.dataset && state.field) refresh();
});
if (els.selectLegendPrec && state.legendPrec) els.selectLegendPrec.value = state.legendPrec;
// Returns null for "auto" (default), otherwise an integer 0..3.
function getLegendPrec() {
  const v = els.selectLegendPrec?.value;
  if (!v || v === "auto") return null;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}
// Cycle 211: legend layout (vertical / horizontal). Persisted via saveSettings
// alongside legendFs/legendPrec.
els.selectLegendLayout?.addEventListener("change", () => {
  state.legendLayout = els.selectLegendLayout.value;
  saveSettings(state);
  if (state.dataset && state.field) refresh();
});
if (els.selectLegendLayout && state.legendLayout) els.selectLegendLayout.value = state.legendLayout;
function getLegendLayout() {
  return els.selectLegendLayout?.value || "vertical";
}

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

// Title / subtitle alignment (left / center / right). Applied via body class.
function applyTitleAlign(v) {
  document.body.classList.remove("title-align-c", "title-align-l", "title-align-r");
  document.body.classList.add(`title-align-${v || "c"}`);
}
els.selectTitleAlign?.addEventListener("change", () => {
  applyTitleAlign(els.selectTitleAlign.value);
});
applyTitleAlign("c");

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
els.ctView?.addEventListener("change", () => {
  // Re-render the same crosstab in the chosen view (only if previously run).
  if (state.crosstab) runCrossTab();
});
els.ctExport?.addEventListener("click", exportCrossTabCsv);

// Cycle 217: PNG/SVG download of the rendered crosstab stacked-bar chart.
// Reuses the SVG already in #ct-result (no re-rendering needed).
function _ctBarSafeName() {
  const r = state.crosstab?.rowF || "row";
  const c = state.crosstab?.colF || "col";
  const norm = (s) => String(s).replace(/[\s\\/:*?"<>|]+/g, "_");
  return `crosstab_${norm(r)}_x_${norm(c)}`;
}
els.ctBarSvg?.addEventListener("click", () => {
  const svgEl = els.ctResult?.querySelector("svg");
  if (!svgEl) { setSummary("棒グラフ表示中のみ保存できます", "warn"); return; }
  const xml = new XMLSerializer().serializeToString(svgEl);
  const doc = `<?xml version="1.0" encoding="UTF-8"?>\n${xml}`;
  const blob = new Blob([doc], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `${_ctBarSafeName()}_bar.svg`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  setSummary("棒グラフを SVG で保存しました", "success");
});
els.ctBarPng?.addEventListener("click", async () => {
  const svgEl = els.ctResult?.querySelector("svg");
  if (!svgEl) { setSummary("棒グラフ表示中のみ保存できます", "warn"); return; }
  if (typeof htmlToImage === "undefined") { setSummary("htmlToImage の読み込みに失敗しました", "error"); return; }
  setSummary("棒グラフPNGを生成中…", "muted");
  try {
    const dpi = parseInt(els.selectExportDpi?.value || "2", 10) || 2;
    const dataUrl = await htmlToImage.toPng(svgEl, {
      pixelRatio: dpi, backgroundColor: "#ffffff",
    });
    const a = document.createElement("a");
    a.href = dataUrl; a.download = `${_ctBarSafeName()}_bar.png`;
    document.body.appendChild(a); a.click(); a.remove();
    setSummary("棒グラフを PNG で保存しました", "success");
  } catch (e) {
    console.error(e);
    setSummary("棒グラフPNGの生成に失敗: " + (e?.message || e), "error");
  }
});

function exportCrossTabCsv() {
  const ct = state.crosstab;
  if (!ct) { setSummary("まず「集計」ボタンで集計を実行してください", "warn"); return; }
  const fmt = (v) => formatNum(v);
  const colHeaders = ct.colBreaks.slice(0, -1).map((_, j) => `${fmt(ct.colBreaks[j])}〜${fmt(ct.colBreaks[j + 1])}`);
  const lines = [];
  lines.push([`${ct.rowF} ＼ ${ct.colF}`, ...colHeaders, "合計"].map(csvEscape).join(","));
  for (let i = 0; i < ct.matrix.length; i++) {
    const rowLabel = `${fmt(ct.rowBreaks[i])}〜${fmt(ct.rowBreaks[i + 1])}`;
    lines.push([rowLabel, ...ct.matrix[i].map(String), String(ct.rowTot[i])].map(csvEscape).join(","));
  }
  lines.push(["合計", ...ct.colTot.map(String), String(ct.total)].map(csvEscape).join(","));
  // Chi-square statistics block (Cycle 119)
  if (ct.chi2 != null) {
    lines.push("");
    lines.push(["統計量", "値"].map(csvEscape).join(","));
    lines.push(["χ²", ct.chi2.toFixed(4)].map(csvEscape).join(","));
    lines.push(["自由度 (df)", String(ct.df)].map(csvEscape).join(","));
    lines.push(["p値", ct.pVal == null ? "" : ct.pVal.toFixed(6)].map(csvEscape).join(","));
    lines.push(["Cramér's V", ct.cramerV == null ? "" : ct.cramerV.toFixed(4)].map(csvEscape).join(","));
  }
  const csv = "﻿" + lines.join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const safeName = (s) => String(s).replace(/[\s\\/:*?"<>|]+/g, "_");
  a.href = url;
  a.download = `crosstab_${safeName(ct.rowF)}_x_${safeName(ct.colF)}_${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  setSummary(`クロス集計を ${a.download} として保存しました（${ct.matrix.length}×${ct.colBreaks.length - 1}、合計 ${ct.total}件）`, "success");
}
els.histBins.addEventListener("change", () => { refresh(); });
els.chkHistOverlay?.addEventListener("change", () => { refresh(); });
els.chkHistBreaks?.addEventListener("change", () => { refresh(); });
els.chkHistLogX?.addEventListener("change", () => { refresh(); });
els.chkHistCumulative?.addEventListener("change", () => { refresh(); });

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

// SVG download (Cycle 155): vector export for Illustrator/Inkscape editing.
function downloadSvg(svgEl, filename) {
  if (!svgEl) return;
  const clone = svgEl.cloneNode(true);
  // Ensure width/height attributes (some SVGs only have viewBox)
  const vb = clone.getAttribute("viewBox");
  if (vb) {
    const parts = vb.split(/\s+/).map(Number);
    if (parts.length === 4) {
      if (!clone.getAttribute("width"))  clone.setAttribute("width",  String(parts[2]));
      if (!clone.getAttribute("height")) clone.setAttribute("height", String(parts[3]));
    }
  }
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");
  const xml = new XMLSerializer().serializeToString(clone);
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n${xml}`;
  const blob = new Blob([body], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  setSummary(`${filename} を保存しました`, "success");
}
const safeName = (v) => String(v || "data").replace(/[\s\\/:*?"<>|]+/g, "_");
$("hist-svg")?.addEventListener("click", () => downloadSvg(els.histSvg, `histogram_${safeName(state.field)}.svg`));
// Cycle 204: bin-level CSV export. Mirrors the on-screen histogram's binning
// (linear or log10) so Excel post-processing matches what the user sees.
$("hist-csv")?.addEventListener("click", () => {
  if (!state.dataset || !state.field) {
    setSummary("ヒストグラム CSV: データセットを読み込んでください", "warn"); return;
  }
  const raw = state.dataset.rows.map(r => r.values[state.field]);
  const logX = !!els.chkHistLogX?.checked;
  const v = logX ? raw.filter(x => Number.isFinite(x) && x > 0)
                 : raw.filter(x => Number.isFinite(x));
  if (v.length < 2) {
    setSummary("ヒストグラム CSV: 有効な数値が2件未満です", "warn"); return;
  }
  const bins = parseInt(els.histBins?.value, 10) || 10;
  const k = Math.max(3, Math.min(30, bins));
  const min = Math.min(...v), max = Math.max(...v);
  if (min === max) {
    setSummary("ヒストグラム CSV: 値の分散がありません", "warn"); return;
  }
  const sx = logX ? (x) => Math.log10(x) : (x) => x;
  const sMin = sx(min), sMax = sx(max);
  const width = (sMax - sMin) / k;
  const counts = new Array(k).fill(0);
  for (const x of v) {
    let i = Math.floor((sx(x) - sMin) / width);
    if (i >= k) i = k - 1;
    counts[i]++;
  }
  const total = v.length;
  const rows = [["bin", "lo", "hi", "count", "pct", "cum_pct"]];
  let cum = 0;
  for (let i = 0; i < k; i++) {
    const sLo = sMin + i * width;
    const sHi = sLo + width;
    const lo = logX ? Math.pow(10, sLo) : sLo;
    const hi = logX ? Math.pow(10, sHi) : sHi;
    cum += counts[i];
    rows.push([
      i + 1,
      lo,
      hi,
      counts[i],
      (counts[i] / total * 100).toFixed(2),
      (cum / total * 100).toFixed(2),
    ]);
  }
  const csv = rows.map(r => r.join(",")).join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `histogram_${safeName(state.field)}${logX ? "_log10" : ""}_${k}bins.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  setSummary(`ヒストグラム CSV: ${k}bin / ${total}件 を保存`, "success");
});
$("scatter-svg-btn")?.addEventListener("click", () => downloadSvg(els.scatterSvg, `scatter_${safeName(els.scatterX.value)}_vs_${safeName(els.scatterY.value)}.svg`));
$("box-svg")?.addEventListener("click", () => downloadSvg(els.boxplotSvg, `boxplot_${safeName(state.field)}.svg`));

// Cycle 228: PNG export of the boxplot SVG via htmlToImage.
$("box-png")?.addEventListener("click", async () => {
  if (!els.boxplotSvg || !els.boxplotSvg.children.length) {
    setSummary("ボックスプロットが空のため書き出せません", "warn"); return;
  }
  if (typeof htmlToImage === "undefined") {
    setSummary("htmlToImage の読み込みに失敗しました", "error"); return;
  }
  setSummary("ボックスプロットPNGを生成中…", "muted");
  try {
    const dpi = parseInt(els.selectExportDpi?.value || "2", 10) || 2;
    const dataUrl = await htmlToImage.toPng(els.boxplotSvg, {
      pixelRatio: dpi, backgroundColor: "#ffffff",
    });
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `boxplot_${safeName(state.field)}.png`;
    document.body.appendChild(a); a.click(); a.remove();
    setSummary("ボックスプロットを PNG で保存しました", "success");
  } catch (e) {
    console.error(e);
    setSummary("ボックスプロットPNG生成失敗: " + (e?.message || e), "error");
  }
});

// Cycle 205: boxplot 5-number summary CSV. When the scatter color-by column
// is set to a categorical field (2-N groups), emit one row per group; else
// a single overall row. Mirrors the on-screen grouped boxplot logic.
$("box-csv")?.addEventListener("click", () => {
  if (!state.dataset || !state.field) {
    setSummary("Boxplot CSV: データセットを読み込んでください", "warn"); return;
  }
  const colorByField = els.scatterColorBy?.value || "";
  // helper: 5-number summary + mean/sd/outliers for a single value array
  const summarize = (vals) => {
    const s = computeStats(vals);
    if (s.n === 0) return null;
    const lo = s.q1 - 1.5 * s.iqr;
    const hi = s.q3 + 1.5 * s.iqr;
    let outliers = 0;
    for (const x of vals) {
      if (!Number.isFinite(x)) continue;
      if (x < lo || x > hi) outliers++;
    }
    return { ...s, outliers };
  };
  const rows = [];
  if (colorByField && colorByField !== state.field) {
    // Grouped: bucket by category, then summarize.
    const gm = new Map();
    for (const r of state.dataset.rows) {
      const yv = r.values[state.field];
      if (!Number.isFinite(yv)) continue;
      const c = r.values[colorByField];
      if (c == null || c === "") continue;
      const key = String(c);
      if (!gm.has(key)) gm.set(key, []);
      gm.get(key).push(yv);
    }
    rows.push(["category", "n", "min", "q1", "median", "q3", "max", "iqr", "mean", "sd", "outliers"]);
    for (const [name, arr] of gm.entries()) {
      const s = summarize(arr); if (!s) continue;
      rows.push([name, s.n, s.min, s.q1, s.median, s.q3, s.max, s.iqr, s.mean, s.std, s.outliers]);
    }
  } else {
    const arr = state.dataset.rows.map(r => r.values[state.field]);
    const s = summarize(arr);
    if (!s) { setSummary("Boxplot CSV: 有効な数値がありません", "warn"); return; }
    rows.push(["field", "n", "min", "q1", "median", "q3", "max", "iqr", "mean", "sd", "outliers"]);
    rows.push([state.field, s.n, s.min, s.q1, s.median, s.q3, s.max, s.iqr, s.mean, s.std, s.outliers]);
  }
  if (rows.length < 2) {
    setSummary("Boxplot CSV: 出力する行がありません", "warn"); return;
  }
  // Quote any cell that contains a comma / quote / newline (category names mostly).
  const esc = (c) => {
    const s = String(c ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = rows.map(r => r.map(esc).join(",")).join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const suffix = colorByField && colorByField !== state.field ? `_by_${safeName(colorByField)}` : "";
  a.href = url;
  a.download = `boxplot_${safeName(state.field)}${suffix}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  setSummary(`Boxplot CSV: ${rows.length - 1} 行を保存`, "success");
});

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
  // Cycle 213: render either the heat table or a 100% stacked bar chart.
  const view = els.ctView?.value || "heat";
  let html;
  if (view === "bar") {
    html = buildCrosstabBarSvg(rowF, colF, rowBreaks, colBreaks, mat, rowTot, bins);
  } else {
    // Render table
    html = `<table><thead><tr><th class="corner">${escapeHtmlText(rowF)} ＼ ${escapeHtmlText(colF)}</th>`;
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
  }

  // Chi-square test of independence + Cramér's V (Cycle 119)
  let chi2 = 0, lowExpectedCells = 0;
  for (let i = 0; i < bins; i++) {
    for (let j = 0; j < bins; j++) {
      const e = (rowTot[i] * colTot[j]) / Math.max(1, total);
      if (e > 0) {
        const d = mat[i][j] - e;
        chi2 += (d * d) / e;
      }
      if (e < 5) lowExpectedCells++;
    }
  }
  const df = (bins - 1) * (bins - 1);
  const pVal = (df > 0 && total > 0) ? chiSquareSurvival(chi2, df) : null;
  const cramerV = (total > 0 && bins > 1) ? Math.sqrt(chi2 / (total * (bins - 1))) : null;
  const sig = pVal == null ? "" : (pVal < 0.001 ? " ***" : pVal < 0.01 ? " **" : pVal < 0.05 ? " *" : "");
  const lowPct = (lowExpectedCells / (bins * bins)) * 100;
  const warn = lowPct > 20
    ? `<div style="color:#b45309;font-size:11px;margin-top:4px">⚠ 期待度数 &lt; 5 のセルが ${lowPct.toFixed(0)}% あり、χ²検定の信頼性が低下します</div>`
    : "";
  const pFmt = pVal == null ? "—" : (pVal < 0.001 ? "&lt; 0.001" : pVal.toFixed(3));
  html += `<div class="ct-chi2" style="margin-top:6px;padding:6px 8px;background:#f1f5f9;border-radius:4px;font-size:11px;font-family:ui-monospace,monospace">` +
    `χ²(df=${df}) = <strong>${chi2.toFixed(2)}</strong>, p = <strong>${pFmt}</strong>${sig}, ` +
    `Cramér's V = <strong>${cramerV == null ? "—" : cramerV.toFixed(3)}</strong>` +
    `</div>` + warn;

  els.ctResult.innerHTML = html;
  // Stash the result for CSV export (Cycle 116 + Cycle 119 statistics)
  state.crosstab = { rowF, colF, rowBreaks, colBreaks, matrix: mat, rowTot, colTot, total, chi2, df, pVal, cramerV };
  if (els.ctExport) els.ctExport.disabled = false;
  // Cycle 217: enable bar-image exports only in bar view.
  const isBar = view === "bar";
  if (els.ctBarPng) els.ctBarPng.disabled = !isBar;
  if (els.ctBarSvg) els.ctBarSvg.disabled = !isBar;

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

// Cycle 213: 100% stacked horizontal bar SVG for the crosstab. One bar per
// row category; column-category proportions stack left-to-right inside.
// Color ramp = blue200 → blue800 across the bin count.
function buildCrosstabBarSvg(rowF, colF, rowBreaks, colBreaks, mat, rowTot, bins) {
  const W = 460, rowH = 26, leftPad = 110, rightPad = 60, top = 28, legendH = 18;
  const H = top + rowH * bins + legendH + 18;
  const innerW = W - leftPad - rightPad;
  // Hue ramp: lightness 80% → 35% over bins.
  const colorAt = (j) => {
    const t = bins === 1 ? 0 : j / (bins - 1);
    const L = Math.round(80 - t * 45);
    return `hsl(220, 70%, ${L}%)`;
  };
  let svg = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="background:#fff;font-family:inherit">`;
  svg += `<text x="${W/2}" y="14" text-anchor="middle" font-size="11" font-weight="600">${escapeHtmlText(rowF)} の ${escapeHtmlText(colF)} 構成比</text>`;
  // Top axis 0..100%
  svg += `<line x1="${leftPad}" y1="${top - 2}" x2="${leftPad + innerW}" y2="${top - 2}" stroke="#94a3b8"/>`;
  for (const p of [0, 25, 50, 75, 100]) {
    const x = leftPad + innerW * p / 100;
    svg += `<line x1="${x}" y1="${top - 2}" x2="${x}" y2="${top + rowH * bins}" stroke="#e2e8f0" stroke-dasharray="2,2"/>`;
    svg += `<text x="${x}" y="${top - 6}" text-anchor="middle" font-size="9" fill="#64748b">${p}%</text>`;
  }
  // Rows
  for (let i = 0; i < bins; i++) {
    const y = top + i * rowH + 3;
    const label = `${formatNum(rowBreaks[i])}〜${formatNum(rowBreaks[i+1])}`;
    svg += `<text x="${leftPad - 4}" y="${y + 14}" text-anchor="end" font-size="10" fill="#1e293b">${escapeHtmlText(label)}</text>`;
    if (rowTot[i] === 0) {
      svg += `<text x="${leftPad + 4}" y="${y + 14}" font-size="10" fill="#94a3b8">(0件)</text>`;
      continue;
    }
    let xCursor = leftPad;
    for (let j = 0; j < bins; j++) {
      const cnt = mat[i][j];
      const w = innerW * cnt / rowTot[i];
      if (w > 0) {
        const pct = (cnt / rowTot[i] * 100).toFixed(1);
        svg += `<rect x="${xCursor.toFixed(1)}" y="${y}" width="${w.toFixed(1)}" height="${rowH - 6}" fill="${colorAt(j)}"><title>${escapeHtmlText(label)} × ${escapeHtmlText(`${formatNum(colBreaks[j])}〜${formatNum(colBreaks[j+1])}`)}: ${cnt}件 (${pct}%)</title></rect>`;
        if (w > 28) {
          svg += `<text x="${(xCursor + w / 2).toFixed(1)}" y="${y + 14}" text-anchor="middle" font-size="9" fill="#0f172a">${pct}%</text>`;
        }
      }
      xCursor += w;
    }
    svg += `<text x="${leftPad + innerW + 4}" y="${y + 14}" font-size="10" fill="#64748b">n=${rowTot[i]}</text>`;
  }
  // Legend below
  const lgY = top + rowH * bins + 4;
  const sw = Math.min(80, innerW / bins);
  for (let j = 0; j < bins; j++) {
    const x = leftPad + j * sw;
    svg += `<rect x="${x}" y="${lgY}" width="10" height="10" fill="${colorAt(j)}"/>`;
    svg += `<text x="${x + 12}" y="${lgY + 9}" font-size="9" fill="#1e293b">${escapeHtmlText(`${formatNum(colBreaks[j])}〜${formatNum(colBreaks[j+1])}`)}</text>`;
  }
  svg += `</svg>`;
  return svg;
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
els.scatterSizeBy?.addEventListener("change", drawScatter);
els.scatterLabelBy?.addEventListener("change", drawScatter);
els.scatterShapeBy?.addEventListener("change", drawScatter);
els.chkScatterRegGroup?.addEventListener("change", drawScatter);
els.chkScatterStatsTitle?.addEventListener("change", drawScatter);
els.scatterPinColor?.addEventListener("input", () => {
  state.pinColor = els.scatterPinColor.value;
  saveSettings(state);
  drawScatter();
  if (typeof refreshTable === "function") refreshTable();
  if (state.pinnedScatterIds?.size) mapper.markPinned(state.pinnedScatterIds, state.pinColor);
});
els.chkScatterStats?.addEventListener("change", drawScatter);
els.chkScatterCi?.addEventListener("change", drawScatter);
els.chkScatterPi?.addEventListener("change", drawScatter);
els.chkScatterYx?.addEventListener("change", drawScatter);
els.chkScatterZero?.addEventListener("change", drawScatter);
els.chkScatterJitter?.addEventListener("change", drawScatter);
els.chkScatterLowess?.addEventListener("change", drawScatter);
// Cycle 195: clear every scatter overlay toggle in one click.
// Cycle 238: pin the most recent brush selection. lastBrushIds is captured
// by the renderScatter onBrush callback; this button bridges that ephemeral
// state into the permanent pinnedScatterIds set.
function syncBrushPinBtn() {
  if (!els.btnScatterPinBrush) return;
  const c = state.lastBrushIds?.size || 0;
  els.btnScatterPinBrush.hidden = c === 0;
  els.btnScatterPinBrush.textContent = `🪧 brush→ピン (${c})`;
}
els.btnScatterPinBrush?.addEventListener("click", () => {
  const sel = state.lastBrushIds;
  if (!(sel instanceof Set) || !sel.size) {
    setSummary("brush 選択がありません", "warn"); return;
  }
  if (!(state.pinnedScatterIds instanceof Set)) state.pinnedScatterIds = new Set();
  let added = 0;
  for (const id of sel) {
    if (!state.pinnedScatterIds.has(id)) { state.pinnedScatterIds.add(id); added++; }
  }
  syncScatterPinBtn();
  drawScatter();
  if (typeof refreshTable === "function") refreshTable();
  mapper.markPinned(state.pinnedScatterIds, els.scatterPinColor?.value);
  setSummary(`brush 選択 ${sel.size} 件中 ${added} 件を新規ピン留め（計 ${state.pinnedScatterIds.size} 件）`, "success");
});

// Cycle 237: bulk-pin every point whose X or Y is outside the Tukey 1.5×IQR
// fence. Adds to the existing pin set rather than replacing, so users can
// stack manual pins + outlier pins.
els.btnScatterPinOutliers?.addEventListener("click", () => {
  if (!state.dataset || !els.scatterX?.value || !els.scatterY?.value) {
    setSummary("散布図のX/Y列を選んでください", "warn"); return;
  }
  const xf = els.scatterX.value, yf = els.scatterY.value;
  const pairs = state.dataset.rows
    .map(r => ({ key: r.key, x: r.values[xf], y: r.values[yf] }))
    .filter(p => Number.isFinite(p.x) && Number.isFinite(p.y));
  if (pairs.length < 4) { setSummary("外れ値判定には4件以上必要です", "warn"); return; }
  const quantile = (arr, p) => {
    const a = arr.slice().sort((u, w) => u - w);
    const idx = (a.length - 1) * p;
    const lo = Math.floor(idx), hi = Math.ceil(idx);
    return lo === hi ? a[lo] : a[lo] + (a[hi] - a[lo]) * (idx - lo);
  };
  const xs = pairs.map(p => p.x), ys = pairs.map(p => p.y);
  const xq1 = quantile(xs, 0.25), xq3 = quantile(xs, 0.75);
  const yq1 = quantile(ys, 0.25), yq3 = quantile(ys, 0.75);
  const xLo = xq1 - 1.5 * (xq3 - xq1), xHi = xq3 + 1.5 * (xq3 - xq1);
  const yLo = yq1 - 1.5 * (yq3 - yq1), yHi = yq3 + 1.5 * (yq3 - yq1);
  if (!(state.pinnedScatterIds instanceof Set)) state.pinnedScatterIds = new Set();
  let added = 0;
  for (const p of pairs) {
    if (p.x < xLo || p.x > xHi || p.y < yLo || p.y > yHi) {
      if (!state.pinnedScatterIds.has(p.key)) { state.pinnedScatterIds.add(p.key); added++; }
    }
  }
  if (!added) { setSummary("追加すべき外れ値はありませんでした", "muted"); return; }
  syncScatterPinBtn();
  drawScatter();
  if (typeof refreshTable === "function") refreshTable();
  mapper.markPinned(state.pinnedScatterIds, els.scatterPinColor?.value);
  setSummary(`外れ値 ${added} 件をピン留めしました（計 ${state.pinnedScatterIds.size} 件）`, "success");
});

els.btnScatterClearPins?.addEventListener("click", () => {
  if (!(state.pinnedScatterIds instanceof Set) || state.pinnedScatterIds.size === 0) return;
  state.pinnedScatterIds.clear();
  syncScatterPinBtn();
  drawScatter();
  if (typeof refreshTable === "function") refreshTable();
  mapper.clearPinned();
  setSummary("散布図のピンを解除しました", "muted");
});

document.getElementById("btn-scatter-clear-overlays")?.addEventListener("click", () => {
  const toggles = [
    "chk-scatter-stats", "chk-scatter-ci", "chk-scatter-pi",
    "chk-scatter-yx", "chk-scatter-zero", "chk-scatter-jitter",
    "chk-scatter-lowess", "chk-scatter-reg-group",
  ];
  let any = false;
  for (const id of toggles) {
    const el = document.getElementById(id);
    if (el && el.checked) { el.checked = false; any = true; }
  }
  if (any) {
    drawScatter();
    setSummary("散布図のオーバーレイをすべて解除しました", "muted");
  } else {
    setSummary("オーバーレイは既にすべて OFF です", "muted");
  }
});
els.scatterLabels?.addEventListener("change", drawScatter);
els.scatterLabelN?.addEventListener("change", drawScatter);
els.scatterLabelN?.addEventListener("input", drawScatter);
els.scatterLabelPlace?.addEventListener("change", drawScatter);
els.scatterDegree?.addEventListener("change", drawScatter);
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

// Correlation matrix runner (Cycle 124): pairwise Pearson r between all fields.
function runCorrelationMatrix() {
  if (!state.dataset || state.dataset.fields.length < 2) return;
  const fields = state.dataset.fields;
  const N = fields.length;
  const method = els.corrMethod?.value || "pearson";
  // Pre-extract value arrays once
  const cols = fields.map(f => state.dataset.rows.map(r => r.values[f]));
  const mat = Array.from({ length: N }, () => new Array(N).fill(null));
  for (let i = 0; i < N; i++) {
    for (let j = i; j < N; j++) {
      // Pairwise complete observations
      const xs = [], ys = [];
      for (let k = 0; k < cols[i].length; k++) {
        const a = cols[i][k], b = cols[j][k];
        if (Number.isFinite(a) && Number.isFinite(b)) { xs.push(a); ys.push(b); }
      }
      let r = null;
      if (xs.length >= 3) {
        if (method === "spearman") {
          r = pearsonR(rankArray(xs), rankArray(ys));
        } else {
          r = pearsonR(xs, ys);
        }
      }
      mat[i][j] = mat[j][i] = r;
    }
  }
  state.corrMatrix = { fields, matrix: mat, method };
  // Render heatmap
  const cellFor = (r) => {
    if (r == null) return { bg: "#e2e8f0", txt: "—" };
    const a = Math.min(1, Math.abs(r));
    if (r >= 0) {
      return { bg: `rgba(220, 38, 38, ${(a * 0.55).toFixed(2)})`, txt: r.toFixed(2) };
    }
    return { bg: `rgba(37, 99, 235, ${(a * 0.55).toFixed(2)})`, txt: r.toFixed(2) };
  };
  let html = `<table><thead><tr><th></th>`;
  for (const f of fields) html += `<th title="${escapeHtmlText(f)}">${escapeHtmlText(f.length > 10 ? f.slice(0, 9) + "…" : f)}</th>`;
  html += `</tr></thead><tbody>`;
  for (let i = 0; i < N; i++) {
    html += `<tr><th title="${escapeHtmlText(fields[i])}">${escapeHtmlText(fields[i].length > 10 ? fields[i].slice(0, 9) + "…" : fields[i])}</th>`;
    for (let j = 0; j < N; j++) {
      if (i === j) {
        html += `<th class="diag">—</th>`;
      } else {
        const c = cellFor(mat[i][j]);
        const cls = (mat[i][j] != null && Math.abs(mat[i][j]) >= 0.7) ? "corr-strong" : "";
        const sym = method === "spearman" ? "ρ" : "r";
        html += `<td class="${cls}" style="background:${c.bg}" data-i="${i}" data-j="${j}" title="${escapeHtmlText(fields[i])} × ${escapeHtmlText(fields[j])} : ${sym}=${c.txt}">${c.txt}</td>`;
      }
    }
    html += `</tr>`;
  }
  html += `</tbody></table>`;
  els.corrResult.innerHTML = html;
  // Click → load that pair into the scatter panel
  els.corrResult.querySelectorAll("td[data-i]").forEach(td => {
    td.addEventListener("click", () => {
      const i = parseInt(td.dataset.i, 10), j = parseInt(td.dataset.j, 10);
      if (els.scatterX && els.scatterY) {
        els.scatterX.value = fields[j];
        els.scatterY.value = fields[i];
        drawScatter();
        els.panelScatter?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
  });
  if (els.corrCsv) els.corrCsv.disabled = false;
}
// Rank an array (1-based, ties get the average rank). Used for Spearman ρ
// (Cycle 159).
function rankArray(arr) {
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

function pearsonR(xs, ys) {
  const n = xs.length;
  let mx = 0, my = 0;
  for (let k = 0; k < n; k++) { mx += xs[k]; my += ys[k]; }
  mx /= n; my /= n;
  let num = 0, dx = 0, dy = 0;
  for (let k = 0; k < n; k++) {
    const ex = xs[k] - mx, ey = ys[k] - my;
    num += ex * ey; dx += ex * ex; dy += ey * ey;
  }
  if (dx === 0 || dy === 0) return null;
  return num / Math.sqrt(dx * dy);
}
els.corrRun?.addEventListener("click", runCorrelationMatrix);

// ----- Multiple regression (Cycle 140) -----
function populateMrSelectors(fields) {
  if (!els.mrY) return;
  const prevY = els.mrY.value;
  els.mrY.innerHTML = "";
  for (const f of fields) {
    const o = document.createElement("option");
    o.value = f; o.textContent = f;
    els.mrY.appendChild(o);
  }
  if (fields.includes(prevY)) els.mrY.value = prevY;
  else if (fields.length) els.mrY.value = fields[0];
  // Rebuild X checkbox list (skip the currently-chosen Y)
  if (els.mrXList) {
    const checkedPrev = new Set(
      [...els.mrXList.querySelectorAll("input:checked")].map(el => el.value)
    );
    els.mrXList.innerHTML = "";
    for (const f of fields) {
      const label = document.createElement("label");
      label.style.cssText = "display:block;padding:1px 0;";
      const cb = document.createElement("input");
      cb.type = "checkbox"; cb.value = f;
      if (checkedPrev.has(f)) cb.checked = true;
      label.appendChild(cb);
      label.append(" " + f);
      els.mrXList.appendChild(label);
    }
  }
}
els.mrY?.addEventListener("change", () => {
  // re-render the X list so the same field isn't picked as both Y and X
  if (state.dataset) populateMrSelectors(state.dataset.fields);
});

function runMultipleRegression() {
  if (!state.dataset) return;
  const yField = els.mrY.value;
  const xFields = [...els.mrXList.querySelectorAll("input:checked")].map(el => el.value).filter(f => f !== yField);
  if (xFields.length < 1) { setSummary("少なくとも 1 つの説明変数 X を選んでください", "warn"); return; }
  // Build design matrix (with intercept column) for complete cases only.
  const X = [];
  const y = [];
  const keys = [];
  for (const r of state.dataset.rows) {
    const yv = r.values[yField];
    if (!Number.isFinite(yv)) continue;
    const row = [1];
    let ok = true;
    for (const xf of xFields) {
      const v = r.values[xf];
      if (!Number.isFinite(v)) { ok = false; break; }
      row.push(v);
    }
    if (!ok) continue;
    X.push(row); y.push(yv); keys.push(r.key);
  }
  const n = y.length, p = xFields.length + 1;
  if (n <= p) { setSummary(`サンプル不足: n=${n}, p=${p} (n>p が必要)`, "warn"); return; }
  // Normal equations: solve (X'X) β = X'y, also need (X'X)⁻¹ for SEs.
  const Xt = transposeMat(X);
  const XtX = matMul(Xt, X);
  const Xty = matVec(Xt, y);
  const inv = invertMat(XtX);
  if (!inv) { setSummary("特異行列 — 説明変数が多重共線かもしれません", "error"); return; }
  const coeffs = matVec(inv, Xty);
  const yhat = X.map(row => row.reduce((s, v, i) => s + v * coeffs[i], 0));
  const residuals = y.map((v, i) => v - yhat[i]);
  const sse = residuals.reduce((s, r) => s + r * r, 0);
  const my = y.reduce((s, v) => s + v, 0) / n;
  const sst = y.reduce((s, v) => s + (v - my) ** 2, 0);
  const R2 = sst > 0 ? 1 - sse / sst : null;
  const adjR2 = R2 != null && n > p ? 1 - (1 - R2) * (n - 1) / (n - p) : null;
  const sigma2 = sse / (n - p);
  const se = inv.map((row, i) => Math.sqrt(Math.max(0, sigma2 * row[i])));
  const tStats = coeffs.map((c, i) => se[i] > 0 ? c / se[i] : null);
  const pValues = tStats.map(t => t == null ? null : 2 * (1 - studentTCdfAbs(Math.abs(t), n - p)));
  // Overall F-test
  const dfModel = p - 1;
  const dfResid = n - p;
  const F = sse > 0 && sst > 0 && dfModel > 0
    ? ((sst - sse) / dfModel) / (sse / dfResid)
    : null;
  const pF = F != null
    ? regularizedBeta(dfResid / (dfResid + dfModel * F), dfResid / 2, dfModel / 2)
    : null;
  // 95% CI of coefficients (Cycle 141, normal approximation).
  const ciLo = coeffs.map((c, i) => c - 1.96 * se[i]);
  const ciHi = coeffs.map((c, i) => c + 1.96 * se[i]);
  // Standardized coefficients β* (Cycle 151) — β_i × (sd_x_i / sd_y).
  const sdY = (() => {
    const my2 = y.reduce((s, v) => s + v, 0) / y.length;
    return Math.sqrt(y.reduce((s, v) => s + (v - my2) ** 2, 0) / Math.max(1, y.length - 1));
  })();
  const stdCoeffs = coeffs.map((c, i) => {
    if (i === 0) return null;  // intercept has no standardized form
    const col = X.map(row => row[i]);
    const mx = col.reduce((s, v) => s + v, 0) / col.length;
    const sdX = Math.sqrt(col.reduce((s, v) => s + (v - mx) ** 2, 0) / Math.max(1, col.length - 1));
    return sdY > 0 ? c * (sdX / sdY) : null;
  });
  // VIF (Variance Inflation Factor) for each X (skip intercept at index 0).
  // VIF_i = 1 / (1 - R²_i) where R²_i comes from regressing X_i on the others.
  const vif = new Array(p).fill(null); // intercept stays null
  if (xFields.length >= 2) {
    for (let xi = 0; xi < xFields.length; xi++) {
      // Build a sub-design without column xi+1 (preserve intercept)
      const sub = X.map(row => row.filter((_, c) => c !== xi + 1));
      const yi = X.map(row => row[xi + 1]);
      const SubT = transposeMat(sub);
      const SubTSub = matMul(SubT, sub);
      const SubTy = matVec(SubT, yi);
      const subInv = invertMat(SubTSub);
      if (!subInv) continue;
      const subCoeffs = matVec(subInv, SubTy);
      const subYhat = sub.map(row => row.reduce((s, v, k) => s + v * subCoeffs[k], 0));
      let subSse = 0, subSst = 0;
      const subMean = yi.reduce((s, v) => s + v, 0) / yi.length;
      for (let k = 0; k < yi.length; k++) {
        subSse += (yi[k] - subYhat[k]) ** 2;
        subSst += (yi[k] - subMean) ** 2;
      }
      const subR2 = subSst > 0 ? 1 - subSse / subSst : 0;
      if (subR2 < 1) vif[xi + 1] = 1 / (1 - subR2);
    }
  }
  state.mrResult = {
    yField, xFields, coeffs, se, tStats, pValues, ciLo, ciHi, vif, stdCoeffs,
    n, p, R2, adjR2, F, pF, dfModel, dfResid, residualSE: Math.sqrt(sigma2),
    labels: ["(Intercept)", ...xFields],
    fitted: yhat, residuals, keys,
  };
  renderMrResult(state.mrResult);
  if (els.mrCsv) els.mrCsv.disabled = false;
}

function renderMrResult(r) {
  const fmt = (v, d = 4) => (v == null || !Number.isFinite(v)) ? "—" : v.toFixed(d);
  const sigMark = (p) => p == null ? "" : p < 0.001 ? " ***" : p < 0.01 ? " **" : p < 0.05 ? " *" : "";
  const pFmt = (p) => p == null ? "—" : p < 0.001 ? "<0.001" : p.toFixed(3);
  const vifCell = (v) => {
    if (v == null) return "—";
    const txt = v.toFixed(2);
    if (v >= 10) return `<span style="color:#dc2626;font-weight:700" title="多重共線性が強い">${txt}</span>`;
    if (v >= 5)  return `<span style="color:#d97706" title="多重共線性が中程度">${txt}</span>`;
    return txt;
  };
  const stdBetaCell = (b) => {
    if (b == null) return "—";
    const txt = b.toFixed(3);
    if (Math.abs(b) >= 0.3) return `<strong style="color:#1e3a8a">${txt}</strong>`;
    return txt;
  };
  let html = "<table><thead><tr>" +
    "<th>変数</th><th>係数</th><th>標準化β</th><th>SE</th><th>95%CI</th><th>t</th><th>p</th><th>VIF</th>" +
    "</tr></thead><tbody>";
  r.labels.forEach((lbl, i) => {
    const sig = r.pValues[i] != null && r.pValues[i] < 0.05;
    const ci = (r.ciLo[i] != null && r.ciHi[i] != null)
      ? `[${fmt(r.ciLo[i], 3)}, ${fmt(r.ciHi[i], 3)}]`
      : "—";
    html += `<tr class="${sig ? "is-sig" : ""}">` +
      `<td>${escapeHtmlText(lbl)}</td>` +
      `<td class="num">${fmt(r.coeffs[i], 6)}</td>` +
      `<td class="num">${stdBetaCell(r.stdCoeffs?.[i])}</td>` +
      `<td class="num">${fmt(r.se[i], 6)}</td>` +
      `<td class="num" style="font-size:10px">${ci}</td>` +
      `<td class="num">${fmt(r.tStats[i], 2)}</td>` +
      `<td class="num">${pFmt(r.pValues[i])}${sigMark(r.pValues[i])}</td>` +
      `<td class="num">${vifCell(r.vif?.[i])}</td>` +
      `</tr>`;
  });
  html += "</tbody></table>";
  html += `<div class="mr-summary">` +
    `n=${r.n}, R²=${fmt(r.R2, 3)}, 調整R²=${fmt(r.adjR2, 3)}` +
    (r.F != null ? `, F(${r.dfModel},${r.dfResid})=${fmt(r.F, 2)}, p=${pFmt(r.pF)}` : "") +
    `, 残差SE=${fmt(r.residualSE, 3)}` +
    `</div>`;
  // Forest plot (Cycle 183) — coefficient point estimates with 95% CI bars.
  // Standardized β is preferred when scales differ widely; default to it.
  html += buildForestPlot(r);
  // Residual plot (Cycle 142) — diagnostic for model adequacy.
  html += `<div style="margin-top:6px;font-size:11px;font-weight:600">残差プロット (Residuals vs Fitted)</div>`;
  html += `<svg id="mr-residual-svg" width="280" height="140" viewBox="0 0 280 140" style="background:#fff;border:1px solid #e2e8f0"></svg>`;
  // Q-Q plot (Cycle 143) — visual normality check of residuals.
  html += `<div style="margin-top:6px;font-size:11px;font-weight:600">Q-Q プロット (残差の正規性)</div>`;
  html += `<svg id="mr-qq-svg" width="280" height="140" viewBox="0 0 280 140" style="background:#fff;border:1px solid #e2e8f0"></svg>`;
  // Map projection of fitted / residuals (Cycle 144)
  html += `<div class="form-row" style="margin-top:6px">` +
    `<button id="mr-add-pred" class="btn" type="button">予測値を列に追加</button>` +
    `<button id="mr-add-resid" class="btn" type="button" style="margin-left:6px">残差を列に追加</button>` +
    `</div>`;
  els.mrResult.innerHTML = html;
  renderResidualPlot(r);
  renderQQPlot(r);
  els.mrResult.querySelector("#mr-add-pred")?.addEventListener("click", () => addMrToDataset("fitted"));
  els.mrResult.querySelector("#mr-add-resid")?.addEventListener("click", () => addMrToDataset("residuals"));
}

function addMrToDataset(kind) {
  const r = state.mrResult;
  if (!r || !state.dataset) return;
  const suffix = kind === "fitted" ? "予測" : "残差";
  const colName = `${r.yField}_${suffix}`;
  let finalName = colName;
  let suffixNum = 2;
  while (state.dataset.fields.includes(finalName)) {
    finalName = `${colName}_${suffixNum++}`;
  }
  // Map row.key → value
  const valMap = new Map();
  const arr = kind === "fitted" ? r.fitted : r.residuals;
  for (let i = 0; i < r.keys.length; i++) valMap.set(r.keys[i], arr[i]);
  for (const row of state.dataset.rows) {
    row.values[finalName] = valMap.has(row.key) ? valMap.get(row.key) : null;
  }
  state.dataset.fields.push(finalName);
  populateFieldSelects();
  if (state.dataset.fields.length >= 2) populateScatterSelectors(state.dataset.fields);
  state.field = finalName;
  els.selectField.value = finalName;
  refresh();
  setSummary(`列「${finalName}」を追加して地図に表示しました`, "success");
}

// Acklam's rational approximation for the standard normal inverse CDF
// (Φ⁻¹). Accurate to ~1e-9 in the body of the distribution, sufficient for
// the visual Q-Q plot use case.
function probit(p) {
  if (!(p > 0 && p < 1)) return p === 0 ? -Infinity : Infinity;
  const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
  const b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01];
  const c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
  const d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00];
  const pLow = 0.02425, pHigh = 1 - pLow;
  if (p < pLow) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) / ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);
  }
  if (p <= pHigh) {
    const q = p - 0.5, r = q * q;
    return (((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5])*q / (((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1);
  }
  const q = Math.sqrt(-2 * Math.log(1 - p));
  return -(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) / ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);
}

function renderQQPlot(r) {
  const svg = els.mrResult.querySelector("#mr-qq-svg");
  if (!svg || !r.residuals || r.residuals.length < 2) return;
  const NS = "http://www.w3.org/2000/svg";
  const make = (tag, attrs) => {
    const e = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    return e;
  };
  const W = 280, H = 140, PAD = { top: 8, right: 8, bottom: 22, left: 36 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const sorted = r.residuals.slice().sort((a, b) => a - b);
  const n = sorted.length;
  const theo = sorted.map((_, i) => probit((i + 0.5) / n));
  const tMin = theo[0], tMax = theo[n - 1];
  const sMin = sorted[0], sMax = sorted[n - 1];
  const tRange = tMax - tMin || 1;
  const sRange = sMax - sMin || 1;
  const px = (v) => PAD.left + ((v - tMin) / tRange) * innerW;
  const py = (v) => PAD.top + innerH - ((v - sMin) / sRange) * innerH;
  // Reference line: y = mean(res) + sd(res) × theoretical quantile
  const mean = r.residuals.reduce((s, v) => s + v, 0) / n;
  const sd = Math.sqrt(r.residuals.reduce((s, v) => s + (v - mean) ** 2, 0) / Math.max(1, n - 1));
  // Axes
  svg.appendChild(make("line", { x1: PAD.left, y1: H - PAD.bottom, x2: W - PAD.right, y2: H - PAD.bottom, stroke: "#94a3b8" }));
  svg.appendChild(make("line", { x1: PAD.left, y1: PAD.top, x2: PAD.left, y2: H - PAD.bottom, stroke: "#94a3b8" }));
  // Reference line clipped to box
  if (sd > 0) {
    svg.appendChild(make("line", {
      x1: px(tMin), y1: py(mean + sd * tMin),
      x2: px(tMax), y2: py(mean + sd * tMax),
      stroke: "#dc2626", "stroke-width": 1, "stroke-dasharray": "3,2",
    }));
  }
  // Points
  for (let i = 0; i < n; i++) {
    svg.appendChild(make("circle", {
      cx: px(theo[i]), cy: py(sorted[i]), r: 2.2,
      fill: "rgba(15,23,42,0.6)", stroke: "#1e293b", "stroke-width": 0.3,
    }));
  }
  // Axis labels & ticks
  const lbl = (x, y, text, anchor = "middle") => {
    const t = make("text", { x, y, "font-size": 8, fill: "#475569", "text-anchor": anchor });
    t.textContent = text; svg.appendChild(t);
  };
  lbl(W / 2, H - 6, "理論分位点 (Standard Normal)");
  lbl(4, PAD.top + innerH / 2, "残差分位点", "start");
  for (const t of [-2, 0, 2]) {
    if (t < tMin - 0.2 || t > tMax + 0.2) continue;
    const x = px(t);
    svg.appendChild(make("line", { x1: x, y1: H - PAD.bottom, x2: x, y2: H - PAD.bottom + 2, stroke: "#94a3b8" }));
    lbl(x, H - PAD.bottom + 12, String(t));
  }
}

// Forest plot of regression coefficients (Cycle 183). Uses standardized β
// when available so variables on different scales remain comparable.
function buildForestPlot(r) {
  if (!r || !r.labels || r.labels.length < 2) return "";
  // Skip the intercept (huge magnitude breaks the scale).
  const items = [];
  for (let i = 1; i < r.labels.length; i++) {
    const useStd = r.stdCoeffs?.[i] != null;
    const val = useStd ? r.stdCoeffs[i] : r.coeffs[i];
    if (val == null) continue;
    // CI is in raw coefficient units; if we're plotting standardized β,
    // approximate the CI half-width by multiplying by the same scale factor.
    let ciLo = r.ciLo?.[i], ciHi = r.ciHi?.[i];
    if (useStd && ciLo != null && ciHi != null) {
      const scale = (r.stdCoeffs[i] / r.coeffs[i]) || 0;
      ciLo = ciLo * scale;
      ciHi = ciHi * scale;
    }
    items.push({
      label: r.labels[i],
      val, ciLo, ciHi,
      sig: r.pValues?.[i] != null && r.pValues[i] < 0.05,
      useStd,
    });
  }
  if (items.length === 0) return "";
  const usingStd = items.every(it => it.useStd);
  const all = [];
  for (const it of items) {
    all.push(it.val);
    if (it.ciLo != null) all.push(it.ciLo);
    if (it.ciHi != null) all.push(it.ciHi);
  }
  let xMin = Math.min(...all, 0);
  let xMax = Math.max(...all, 0);
  if (xMin === xMax) { xMin -= 1; xMax += 1; }
  const pad = (xMax - xMin) * 0.08;
  xMin -= pad; xMax += pad;
  const W = 320, rowH = 22;
  const H = items.length * rowH + 28;
  const PAD = { top: 8, right: 8, bottom: 22, left: 110 };
  const innerW = W - PAD.left - PAD.right;
  const xAt = (v) => PAD.left + ((v - xMin) / (xMax - xMin)) * innerW;
  let svg = `<div style="margin-top:6px;font-size:11px;font-weight:600">フォレストプロット ${usingStd ? "(標準化β)" : "(係数)"}</div>`;
  svg += `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="background:#fff;border:1px solid #e2e8f0">`;
  // Frame
  svg += `<rect x="${PAD.left}" y="${PAD.top}" width="${innerW}" height="${H - PAD.top - PAD.bottom}" fill="none" stroke="#cbd5e1"/>`;
  // Zero reference line
  const zX = xAt(0);
  svg += `<line x1="${zX.toFixed(1)}" y1="${PAD.top}" x2="${zX.toFixed(1)}" y2="${H - PAD.bottom}" stroke="#94a3b8" stroke-dasharray="3,2"/>`;
  // Each row
  items.forEach((it, i) => {
    const y = PAD.top + i * rowH + rowH / 2;
    const color = it.sig ? "#1e3a8a" : "#94a3b8";
    const labelColor = it.sig ? "#1e293b" : "#475569";
    // CI bar
    if (it.ciLo != null && it.ciHi != null) {
      svg += `<line x1="${xAt(it.ciLo).toFixed(1)}" y1="${y}" x2="${xAt(it.ciHi).toFixed(1)}" y2="${y}" stroke="${color}" stroke-width="1.5"/>`;
      svg += `<line x1="${xAt(it.ciLo).toFixed(1)}" y1="${y - 4}" x2="${xAt(it.ciLo).toFixed(1)}" y2="${y + 4}" stroke="${color}" stroke-width="1.5"/>`;
      svg += `<line x1="${xAt(it.ciHi).toFixed(1)}" y1="${y - 4}" x2="${xAt(it.ciHi).toFixed(1)}" y2="${y + 4}" stroke="${color}" stroke-width="1.5"/>`;
    }
    // Point estimate
    svg += `<circle cx="${xAt(it.val).toFixed(1)}" cy="${y}" r="3" fill="${color}"/>`;
    // Label
    const nm = it.label.length > 14 ? it.label.slice(0, 13) + "…" : it.label;
    svg += `<text x="${PAD.left - 4}" y="${y + 3}" font-size="10" font-weight="${it.sig ? 700 : 500}" text-anchor="end" fill="${labelColor}">${escapeHtmlText(nm)}</text>`;
  });
  // X axis ticks
  for (const t of [xMin, 0, xMax]) {
    const x = xAt(t);
    svg += `<line x1="${x.toFixed(1)}" y1="${H - PAD.bottom}" x2="${x.toFixed(1)}" y2="${H - PAD.bottom + 3}" stroke="#475569"/>`;
    svg += `<text x="${x.toFixed(1)}" y="${H - PAD.bottom + 12}" font-size="9" text-anchor="middle" fill="#475569">${t === 0 ? "0" : t.toFixed(2)}</text>`;
  }
  svg += `</svg>`;
  return svg;
}

function renderResidualPlot(r) {
  const svg = els.mrResult.querySelector("#mr-residual-svg");
  if (!svg || !r.fitted || !r.residuals) return;
  const NS = "http://www.w3.org/2000/svg";
  const make = (tag, attrs) => {
    const e = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    return e;
  };
  const W = 280, H = 140, PAD = { top: 8, right: 8, bottom: 22, left: 36 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const fits = r.fitted, res = r.residuals;
  const fMin = Math.min(...fits), fMax = Math.max(...fits);
  const rMax = Math.max(...res.map(Math.abs));
  if (!(fMax > fMin) || !(rMax > 0)) return;
  const px = (v) => PAD.left + ((v - fMin) / (fMax - fMin)) * innerW;
  const py = (v) => PAD.top + innerH - ((v + rMax) / (2 * rMax)) * innerH;
  // Axes
  svg.appendChild(make("line", { x1: PAD.left, y1: H - PAD.bottom, x2: W - PAD.right, y2: H - PAD.bottom, stroke: "#94a3b8" }));
  svg.appendChild(make("line", { x1: PAD.left, y1: PAD.top, x2: PAD.left, y2: H - PAD.bottom, stroke: "#94a3b8" }));
  // y=0 reference line
  const yZero = py(0);
  svg.appendChild(make("line", {
    x1: PAD.left, y1: yZero, x2: W - PAD.right, y2: yZero,
    stroke: "#dc2626", "stroke-width": 1, "stroke-dasharray": "3,2",
  }));
  // ±1σ residual band
  const sd = r.residualSE || 0;
  if (sd > 0 && sd <= rMax) {
    const yPlus = py(sd), yMinus = py(-sd);
    svg.appendChild(make("rect", {
      x: PAD.left, y: Math.min(yPlus, yMinus),
      width: innerW, height: Math.abs(yPlus - yMinus),
      fill: "rgba(37,99,235,0.06)", stroke: "none",
    }));
  }
  // Points
  for (let i = 0; i < fits.length; i++) {
    svg.appendChild(make("circle", {
      cx: px(fits[i]), cy: py(res[i]), r: 2.2,
      fill: "rgba(15,23,42,0.6)", stroke: "#1e293b", "stroke-width": 0.3,
    }));
  }
  // Axis labels
  const lbl = (x, y, text, anchor = "middle") => {
    const t = make("text", { x, y, "font-size": 8, fill: "#475569", "text-anchor": anchor });
    t.textContent = text; svg.appendChild(t);
  };
  lbl(W / 2, H - 6, "予測値 (Fitted)");
  lbl(4, PAD.top + innerH / 2, "残差", "start");
  // y tick marks at +rMax, 0, -rMax
  for (const [val, anchor] of [[rMax, "end"], [0, "end"], [-rMax, "end"]]) {
    const y = py(val);
    svg.appendChild(make("line", { x1: PAD.left - 2, y1: y, x2: PAD.left, y2: y, stroke: "#94a3b8" }));
    lbl(PAD.left - 4, y + 3, val === 0 ? "0" : (val >= 1000 ? (val / 1000).toFixed(0) + "k" : val.toFixed(1)), "end");
  }
}

els.mrRun?.addEventListener("click", runMultipleRegression);

// ----- k-means clustering (Cycle 145) -----
function populateKmSelectors(fields) {
  if (!els.kmXList) return;
  const prevChecked = new Set(
    [...els.kmXList.querySelectorAll("input:checked")].map(el => el.value)
  );
  els.kmXList.innerHTML = "";
  for (const f of fields) {
    const label = document.createElement("label");
    label.style.cssText = "display:block;padding:1px 0;";
    const cb = document.createElement("input");
    cb.type = "checkbox"; cb.value = f;
    if (prevChecked.has(f)) cb.checked = true;
    label.appendChild(cb);
    label.append(" " + f);
    els.kmXList.appendChild(label);
  }
}

// Core k-means routine — returns { Z, n, d, assignments, centroids, iter, wss, keys }
// or null if data is insufficient.
function kmeansCore(xFields, K) {
  if (!state.dataset || xFields.length < 1) return null;
  const points = [];
  const keys = [];
  for (const r of state.dataset.rows) {
    const row = [];
    let ok = true;
    for (const xf of xFields) {
      const v = r.values[xf];
      if (!Number.isFinite(v)) { ok = false; break; }
      row.push(v);
    }
    if (ok) { points.push(row); keys.push(r.key); }
  }
  const n = points.length;
  if (n < K + 1) return null;
  const d = xFields.length;
  const mean = new Array(d).fill(0), sd = new Array(d).fill(0);
  for (const p of points) for (let j = 0; j < d; j++) mean[j] += p[j];
  for (let j = 0; j < d; j++) mean[j] /= n;
  for (const p of points) for (let j = 0; j < d; j++) sd[j] += (p[j] - mean[j]) ** 2;
  for (let j = 0; j < d; j++) sd[j] = Math.sqrt(sd[j] / n) || 1;
  const Z = points.map(p => p.map((v, j) => (v - mean[j]) / sd[j]));
  const centroids = [];
  centroids.push(Z[Math.floor(Math.random() * n)].slice());
  while (centroids.length < K) {
    const dists = Z.map(p => Math.min(...centroids.map(c => euclidSq(p, c))));
    const total = dists.reduce((s, v) => s + v, 0);
    let r = Math.random() * total;
    let idx = 0;
    while (idx < n - 1 && (r -= dists[idx]) > 0) idx++;
    centroids.push(Z[idx].slice());
  }
  const assignments = new Array(n).fill(-1);
  let iter = 0;
  while (iter < 100) {
    let changed = false;
    for (let i = 0; i < n; i++) {
      let bestK = 0, bestD = Infinity;
      for (let k = 0; k < K; k++) {
        const dist = euclidSq(Z[i], centroids[k]);
        if (dist < bestD) { bestD = dist; bestK = k; }
      }
      if (assignments[i] !== bestK) { assignments[i] = bestK; changed = true; }
    }
    if (!changed) break;
    const sums = Array.from({ length: K }, () => new Array(d).fill(0));
    const counts = new Array(K).fill(0);
    for (let i = 0; i < n; i++) {
      const k = assignments[i];
      counts[k]++;
      for (let j = 0; j < d; j++) sums[k][j] += Z[i][j];
    }
    for (let k = 0; k < K; k++) {
      if (counts[k] > 0) for (let j = 0; j < d; j++) centroids[k][j] = sums[k][j] / counts[k];
    }
    iter++;
  }
  let wss = 0;
  for (let i = 0; i < n; i++) wss += euclidSq(Z[i], centroids[assignments[i]]);
  return { Z, n, d, assignments, centroids, iter, wss, keys };
}

function runKmeansClustering() {
  if (!state.dataset) return;
  const xFields = [...els.kmXList.querySelectorAll("input:checked")].map(el => el.value);
  if (xFields.length < 1) { setSummary("少なくとも 1 つの説明変数 X を選んでください", "warn"); return; }
  const K = parseInt(els.kmK.value, 10) || 3;
  const out = kmeansCore(xFields, K);
  if (!out) { setSummary("サンプル不足、または有効データなし", "warn"); return; }
  const silArr = silhouetteScores(out.Z, out.assignments, K);
  let sil = null;
  if (silArr) {
    let s = 0, c = 0;
    for (const v of silArr) if (v != null) { s += v; c++; }
    sil = c > 0 ? s / c : null;
  }
  state.kmResult = { K, xFields, n: out.n, iterations: out.iter, wss: out.wss, silhouette: sil, silArr, keys: out.keys, assignments: out.assignments };
  renderKmResult(state.kmResult);
  if (els.kmAdd) els.kmAdd.disabled = false;
  if (els.kmCsv) els.kmCsv.disabled = false;
}

function runElbow() {
  if (!state.dataset) return;
  const xFields = [...els.kmXList.querySelectorAll("input:checked")].map(el => el.value);
  if (xFields.length < 1) { setSummary("少なくとも 1 つの説明変数 X を選んでください", "warn"); return; }
  const wssByK = [];
  for (let K = 2; K <= 8; K++) {
    const out = kmeansCore(xFields, K);
    if (!out) break;
    wssByK.push({ K, wss: out.wss });
  }
  if (wssByK.length < 3) { setSummary("Elbow 分析にはサンプル数が不足", "warn"); return; }
  // Second-difference curvature heuristic for suggested K (interior points only)
  let bestK = wssByK[0].K, bestCurve = -Infinity;
  for (let i = 1; i < wssByK.length - 1; i++) {
    const curve = wssByK[i - 1].wss - 2 * wssByK[i].wss + wssByK[i + 1].wss;
    if (curve > bestCurve) { bestCurve = curve; bestK = wssByK[i].K; }
  }
  renderElbowChart(wssByK, bestK);
  // Auto-select recommended K in the selector
  if (els.kmK) els.kmK.value = String(bestK);
  setSummary(`Elbow 分析: 推奨 K=${bestK}`, "success");
}

function renderElbowChart(wssByK, suggestedK) {
  const W = 280, H = 140, PAD = { top: 8, right: 8, bottom: 22, left: 36 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const kMin = wssByK[0].K, kMax = wssByK[wssByK.length - 1].K;
  const wMin = Math.min(...wssByK.map(p => p.wss));
  const wMax = Math.max(...wssByK.map(p => p.wss));
  const px = (k) => PAD.left + ((k - kMin) / (kMax - kMin || 1)) * innerW;
  const py = (w) => PAD.top + innerH - ((w - wMin) / (wMax - wMin || 1)) * innerH;
  let svg = `<div style="margin-top:6px;font-size:11px;font-weight:600">Elbow 分析: 推奨 K=${suggestedK}</div>`;
  svg += `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="background:#fff;border:1px solid #e2e8f0">`;
  // axes
  svg += `<line x1="${PAD.left}" y1="${H - PAD.bottom}" x2="${W - PAD.right}" y2="${H - PAD.bottom}" stroke="#94a3b8"/>`;
  svg += `<line x1="${PAD.left}" y1="${PAD.top}" x2="${PAD.left}" y2="${H - PAD.bottom}" stroke="#94a3b8"/>`;
  // polyline
  const pts = wssByK.map(p => `${px(p.K)},${py(p.wss)}`).join(" ");
  svg += `<polyline points="${pts}" fill="none" stroke="#1e3a8a" stroke-width="1.5"/>`;
  // points + labels
  for (const p of wssByK) {
    const fill = p.K === suggestedK ? "#dc2626" : "#1e3a8a";
    const r0 = p.K === suggestedK ? 4 : 2.5;
    svg += `<circle cx="${px(p.K)}" cy="${py(p.wss)}" r="${r0}" fill="${fill}"/>`;
    svg += `<text x="${px(p.K)}" y="${H - PAD.bottom + 12}" font-size="9" text-anchor="middle" fill="#475569">${p.K}</text>`;
  }
  svg += `<text x="${PAD.left - 4}" y="${py(wMin) + 3}" font-size="8" text-anchor="end" fill="#475569">${wMin.toFixed(1)}</text>`;
  svg += `<text x="${PAD.left - 4}" y="${py(wMax) + 3}" font-size="8" text-anchor="end" fill="#475569">${wMax.toFixed(1)}</text>`;
  svg += `<text x="${W/2}" y="${H - 6}" font-size="9" text-anchor="middle" fill="#475569">K (クラスタ数)</text>`;
  svg += `<text x="4" y="${PAD.top + innerH/2}" font-size="9" fill="#475569">WSS</text>`;
  svg += `</svg>`;
  els.kmResult.innerHTML = (els.kmResult.innerHTML || "") + svg;
}

function euclidSq(a, b) {
  let s = 0;
  for (let j = 0; j < a.length; j++) { const d = a[j] - b[j]; s += d * d; }
  return s;
}

// Per-point silhouette values (Cycle 162/163). Returns an array of length n;
// entries are null for singletons (a single-member cluster has no internal a).
function silhouetteScores(points, assignments, K) {
  const n = points.length;
  if (n < 2 || K < 2) return null;
  const clusters = Array.from({ length: K }, () => []);
  for (let i = 0; i < n; i++) clusters[assignments[i]].push(i);
  const euclid = (a, b) => Math.sqrt(euclidSq(a, b));
  const scores = new Array(n).fill(null);
  for (let i = 0; i < n; i++) {
    const ki = assignments[i];
    if (clusters[ki].length <= 1) continue;
    let aSum = 0;
    for (const j of clusters[ki]) if (j !== i) aSum += euclid(points[i], points[j]);
    const a = aSum / (clusters[ki].length - 1);
    let b = Infinity;
    for (let k = 0; k < K; k++) {
      if (k === ki || clusters[k].length === 0) continue;
      let bSum = 0;
      for (const j of clusters[k]) bSum += euclid(points[i], points[j]);
      const meanB = bSum / clusters[k].length;
      if (meanB < b) b = meanB;
    }
    if (!Number.isFinite(b)) continue;
    scores[i] = a === 0 && b === 0 ? 0 : (b - a) / Math.max(a, b);
  }
  return scores;
}

function silhouetteScore(points, assignments, K) {
  const arr = silhouetteScores(points, assignments, K);
  if (!arr) return null;
  let sum = 0, count = 0;
  for (const s of arr) if (s != null) { sum += s; count++; }
  return count > 0 ? sum / count : null;
}

function silhouetteLabel(s) {
  if (s == null) return "";
  if (s >= 0.5) return "強い構造";
  if (s >= 0.25) return "弱いが妥当な構造";
  if (s > 0) return "弱い構造（要改善）";
  return "構造なし";
}

// Build a silhouette plot SVG (Cycle 163). Each point becomes a horizontal
// bar; bars are grouped by cluster and sorted descending within a cluster.
function buildSilhouettePlot(scores, assignments, K, meanS) {
  if (!scores) return "";
  const palette = ["#2563eb", "#dc2626", "#16a34a", "#d97706", "#9333ea", "#0891b2", "#db2777", "#65a30d"];
  // Group + sort descending within each cluster
  const groups = Array.from({ length: K }, () => []);
  for (let i = 0; i < scores.length; i++) {
    if (scores[i] != null) groups[assignments[i]].push(scores[i]);
  }
  for (const g of groups) g.sort((a, b) => b - a);
  const totalBars = groups.reduce((s, g) => s + g.length, 0);
  if (totalBars === 0) return "";
  const W = 320, H = Math.min(260, Math.max(140, totalBars * 4 + 40));
  const PAD = { top: 8, right: 12, bottom: 22, left: 30 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const barH = Math.max(1.5, innerH / totalBars);
  const zeroX = PAD.left + (0 - -1) / 2 * innerW;  // s in [-1, 1]
  const xAt = (s) => PAD.left + (s + 1) / 2 * innerW;
  let svg = `<div style="margin-top:6px;font-size:11px;font-weight:600">シルエットプロット</div>`;
  svg += `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="background:#fff;border:1px solid #e2e8f0">`;
  // Frame
  svg += `<rect x="${PAD.left}" y="${PAD.top}" width="${innerW}" height="${innerH}" fill="none" stroke="#cbd5e1"/>`;
  // 0 axis
  svg += `<line x1="${zeroX}" y1="${PAD.top}" x2="${zeroX}" y2="${H - PAD.bottom}" stroke="#94a3b8" stroke-dasharray="2,2"/>`;
  // Mean line (red)
  if (meanS != null) {
    const mx = xAt(meanS);
    svg += `<line x1="${mx}" y1="${PAD.top}" x2="${mx}" y2="${H - PAD.bottom}" stroke="#dc2626" stroke-width="1" stroke-dasharray="3,2"/>`;
  }
  // Draw bars
  let y = PAD.top;
  for (let k = 0; k < K; k++) {
    const color = palette[k % palette.length];
    for (const s of groups[k]) {
      const x1 = s >= 0 ? zeroX : xAt(s);
      const w = Math.abs(xAt(s) - zeroX);
      svg += `<rect x="${x1.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${(barH - 0.4).toFixed(1)}" fill="${color}" opacity="0.85"/>`;
      y += barH;
    }
    // Cluster label
    svg += `<text x="${PAD.left - 4}" y="${(y - groups[k].length * barH / 2 + 3).toFixed(1)}" font-size="9" text-anchor="end" fill="#475569">C${k + 1}</text>`;
  }
  // X axis ticks
  for (const t of [-1, -0.5, 0, 0.5, 1]) {
    const x = xAt(t);
    svg += `<line x1="${x}" y1="${H - PAD.bottom}" x2="${x}" y2="${H - PAD.bottom + 2}" stroke="#94a3b8"/>`;
    svg += `<text x="${x}" y="${H - PAD.bottom + 12}" font-size="8" text-anchor="middle" fill="#475569">${t}</text>`;
  }
  svg += `<text x="${W / 2}" y="${H - 4}" font-size="9" text-anchor="middle" fill="#475569">シルエット係数</text>`;
  svg += `</svg>`;
  return svg;
}

function renderKmResult(r) {
  if (!els.kmResult) return;
  const sizes = new Array(r.K).fill(0);
  for (const a of r.assignments) sizes[a]++;
  const silTxt = r.silhouette == null
    ? ""
    : `, シルエット=<strong>${r.silhouette.toFixed(3)}</strong> (${silhouetteLabel(r.silhouette)})`;
  let html = `<div class="mr-summary">k-means: K=${r.K}, n=${r.n}, 反復=${r.iterations}, WSS=${r.wss.toFixed(2)}${silTxt}</div>`;
  html += "<table style='margin-top:6px'><thead><tr><th>クラスタ</th><th>件数</th><th>割合</th></tr></thead><tbody>";
  for (let k = 0; k < r.K; k++) {
    html += `<tr><td>${k + 1}</td><td class="num">${sizes[k]}</td><td class="num">${(sizes[k] / r.n * 100).toFixed(1)}%</td></tr>`;
  }
  html += "</tbody></table>";
  if (r.silArr) html += buildSilhouettePlot(r.silArr, r.assignments, r.K, r.silhouette);
  els.kmResult.innerHTML = html;
}

els.kmRun?.addEventListener("click", runKmeansClustering);
els.kmElbow?.addEventListener("click", runElbow);

els.kmCsv?.addEventListener("click", () => {
  const r = state.kmResult;
  if (!r) { setSummary("先に k-means を実行してください", "warn"); return; }
  const nameById = new Map(state.dataset.rows.map(row => [row.key, row.name || `#${row.key}`]));
  const sizes = new Array(r.K).fill(0);
  for (const a of r.assignments) sizes[a]++;
  const lines = [];
  // 1. Cluster summary
  lines.push(["クラスタ", "件数", "割合"].map(csvEscape).join(","));
  for (let k = 0; k < r.K; k++) {
    lines.push([String(k + 1), String(sizes[k]), (sizes[k] / r.n * 100).toFixed(2) + "%"].map(csvEscape).join(","));
  }
  lines.push("");
  // 2. Meta
  lines.push(["統計", "値"].map(csvEscape).join(","));
  lines.push(["K (クラスタ数)", String(r.K)].map(csvEscape).join(","));
  lines.push(["説明変数 X", r.xFields.join(", ")].map(csvEscape).join(","));
  lines.push(["n (有効サンプル)", String(r.n)].map(csvEscape).join(","));
  lines.push(["反復回数", String(r.iterations)].map(csvEscape).join(","));
  lines.push(["WSS", r.wss.toFixed(4)].map(csvEscape).join(","));
  if (r.silhouette != null) lines.push(["シルエット係数", r.silhouette.toFixed(4)].map(csvEscape).join(","));
  lines.push("");
  // 3. Per-region assignment
  lines.push(["id", "地域", "クラスタ"].map(csvEscape).join(","));
  for (let i = 0; i < r.keys.length; i++) {
    const id = r.keys[i];
    lines.push([String(id), nameById.get(id) || `#${id}`, String(r.assignments[i] + 1)].map(csvEscape).join(","));
  }
  const csv = "﻿" + lines.join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `kmeans_K${r.K}_${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  setSummary(`k-means結果を ${a.download} として保存しました（K=${r.K}, n=${r.n}）`, "success");
});

// ----- Principal Component Analysis (Cycle 147) -----
function populatePcaSelectors(fields) {
  if (!els.pcaXList) return;
  const prevChecked = new Set([...els.pcaXList.querySelectorAll("input:checked")].map(el => el.value));
  els.pcaXList.innerHTML = "";
  for (const f of fields) {
    const label = document.createElement("label");
    label.style.cssText = "display:block;padding:1px 0;";
    const cb = document.createElement("input");
    cb.type = "checkbox"; cb.value = f;
    if (prevChecked.has(f)) cb.checked = true;
    label.appendChild(cb);
    label.append(" " + f);
    els.pcaXList.appendChild(label);
  }
}

function runPca() {
  if (!state.dataset) return;
  const xFields = [...els.pcaXList.querySelectorAll("input:checked")].map(el => el.value);
  if (xFields.length < 2) { setSummary("PCA には 2 つ以上の変数が必要です", "warn"); return; }
  // Build standardized data matrix (complete cases)
  const rawPoints = [];
  const keys = [];
  for (const r of state.dataset.rows) {
    const row = [];
    let ok = true;
    for (const xf of xFields) {
      const v = r.values[xf];
      if (!Number.isFinite(v)) { ok = false; break; }
      row.push(v);
    }
    if (ok) { rawPoints.push(row); keys.push(r.key); }
  }
  const n = rawPoints.length;
  const d = xFields.length;
  if (n < d + 1) { setSummary(`サンプル不足: n=${n}, d=${d}`, "warn"); return; }
  // Standardize
  const mean = new Array(d).fill(0);
  for (const p of rawPoints) for (let j = 0; j < d; j++) mean[j] += p[j];
  for (let j = 0; j < d; j++) mean[j] /= n;
  const sd = new Array(d).fill(0);
  for (const p of rawPoints) for (let j = 0; j < d; j++) sd[j] += (p[j] - mean[j]) ** 2;
  for (let j = 0; j < d; j++) sd[j] = Math.sqrt(sd[j] / (n - 1)) || 1;
  const Z = rawPoints.map(p => p.map((v, j) => (v - mean[j]) / sd[j]));
  // Correlation matrix = Z' Z / (n-1)
  const R = Array.from({ length: d }, () => new Array(d).fill(0));
  for (let i = 0; i < d; i++) {
    for (let j = i; j < d; j++) {
      let s = 0;
      for (let k = 0; k < n; k++) s += Z[k][i] * Z[k][j];
      R[i][j] = R[j][i] = s / (n - 1);
    }
  }
  // Jacobi eigendecomposition of symmetric matrix R
  const { eigvals, V } = jacobiEigen(R);
  // Sort eigenpairs by descending eigenvalue
  const order = eigvals.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0]).map(p => p[1]);
  const sortedEigvals = order.map(i => eigvals[i]);
  // Vsorted[i][k] = V[i][order[k]] for component k
  const sortedV = Array.from({ length: d }, (_, i) =>
    order.map(k => V[i][k])
  );
  const totalVar = sortedEigvals.reduce((s, v) => s + v, 0);
  const ratios = sortedEigvals.map(v => v / totalVar);
  let cum = 0;
  const cumRatios = ratios.map(r => (cum += r));
  // Loadings = eigenvector × √eigenvalue
  const loadings = Array.from({ length: d }, (_, i) =>
    sortedEigvals.map((lambda, k) => sortedV[i][k] * Math.sqrt(Math.max(0, lambda)))
  );
  // PC scores = Z × V (top 2 needed for "add" feature)
  const scores = Z.map(z => sortedEigvals.map((_, k) =>
    z.reduce((s, v, i) => s + v * sortedV[i][k], 0)
  ));
  state.pcaResult = { xFields, n, d, eigvals: sortedEigvals, ratios, cumRatios, loadings, scores, keys };
  renderPcaResult(state.pcaResult);
  if (els.pcaAdd) els.pcaAdd.disabled = false;
  if (els.pcaCsv) els.pcaCsv.disabled = false;
  if (els.pcaMahalanobis) els.pcaMahalanobis.disabled = false;
  // Keep the raw standardized matrix for downstream multivariate methods
  // (Mahalanobis distance in Cycle 190).
  state.pcaResult.Z = (function() {
    // recompute Z (cheap) — needed because runPca doesn't expose it
    if (!state.dataset) return null;
    const f = state.pcaResult.xFields;
    const raw = [];
    for (const r of state.dataset.rows) {
      const row = [];
      let ok = true;
      for (const xf of f) {
        const v = r.values[xf];
        if (!Number.isFinite(v)) { ok = false; break; }
        row.push(v);
      }
      if (ok) raw.push(row);
    }
    const n = raw.length, d = f.length;
    const mean = new Array(d).fill(0);
    for (const p of raw) for (let j = 0; j < d; j++) mean[j] += p[j];
    for (let j = 0; j < d; j++) mean[j] /= n;
    const sd = new Array(d).fill(0);
    for (const p of raw) for (let j = 0; j < d; j++) sd[j] += (p[j] - mean[j]) ** 2;
    for (let j = 0; j < d; j++) sd[j] = Math.sqrt(sd[j] / Math.max(1, n - 1)) || 1;
    return raw.map(p => p.map((v, j) => (v - mean[j]) / sd[j]));
  })();
}

// Jacobi eigendecomposition for symmetric matrices. Returns eigvals + V
// where V columns are eigenvectors (V[i][k] = element i of eigenvector k).
function jacobiEigen(A) {
  const n = A.length;
  const m = A.map(r => r.slice());
  const V = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => i === j ? 1 : 0));
  for (let iter = 0; iter < 100; iter++) {
    // Find largest off-diagonal element
    let p = 0, q = 1, max = 0;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      if (Math.abs(m[i][j]) > max) { max = Math.abs(m[i][j]); p = i; q = j; }
    }
    if (max < 1e-12) break;
    const theta = (m[q][q] - m[p][p]) / (2 * m[p][q]);
    let t;
    if (theta === 0) t = 1;
    else {
      const sign = theta > 0 ? 1 : -1;
      t = sign / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
    }
    const c = 1 / Math.sqrt(t * t + 1);
    const s = t * c;
    const mpp = m[p][p], mqq = m[q][q], mpq = m[p][q];
    m[p][p] = mpp - t * mpq;
    m[q][q] = mqq + t * mpq;
    m[p][q] = m[q][p] = 0;
    for (let i = 0; i < n; i++) {
      if (i === p || i === q) continue;
      const mip = m[i][p], miq = m[i][q];
      m[i][p] = m[p][i] = c * mip - s * miq;
      m[i][q] = m[q][i] = s * mip + c * miq;
    }
    for (let i = 0; i < n; i++) {
      const vip = V[i][p], viq = V[i][q];
      V[i][p] = c * vip - s * viq;
      V[i][q] = s * vip + c * viq;
    }
  }
  const eigvals = m.map((row, i) => row[i]);
  return { eigvals, V };
}

function renderPcaResult(r) {
  if (!els.pcaResult) return;
  const fmt = (v, d = 3) => v == null ? "—" : v.toFixed(d);
  const maxK = Math.min(r.d, 4);
  // Variance explained table
  let html = `<div class="mr-summary">n=${r.n}, 変数=${r.d}</div>`;
  html += `<table style="margin-top:6px"><thead><tr>` +
    `<th>主成分</th><th>固有値</th><th>寄与率</th><th>累積寄与率</th>` +
    `</tr></thead><tbody>`;
  for (let k = 0; k < r.d; k++) {
    html += `<tr><td>PC${k + 1}</td>` +
      `<td class="num">${fmt(r.eigvals[k])}</td>` +
      `<td class="num">${fmt(r.ratios[k] * 100, 1)}%</td>` +
      `<td class="num">${fmt(r.cumRatios[k] * 100, 1)}%</td></tr>`;
  }
  html += `</tbody></table>`;
  // Loadings table
  html += `<div style="margin-top:6px;font-size:11px;font-weight:600">因子負荷量 (|値| > 0.5 を強調)</div>`;
  html += `<table><thead><tr><th>変数</th>`;
  for (let k = 0; k < maxK; k++) html += `<th>PC${k + 1}</th>`;
  html += `</tr></thead><tbody>`;
  for (let i = 0; i < r.d; i++) {
    html += `<tr><td>${escapeHtmlText(r.xFields[i])}</td>`;
    for (let k = 0; k < maxK; k++) {
      const l = r.loadings[i][k];
      const cls = Math.abs(l) > 0.5 ? "is-sig" : "";
      html += `<td class="num ${cls}">${l.toFixed(3)}</td>`;
    }
    html += `</tr>`;
  }
  html += `</tbody></table>`;
  html += buildScreePlot(r);
  html += buildBiplot(r);
  els.pcaResult.innerHTML = html;
}

// PCA biplot (Cycle 149): PC1 vs PC2 with sample points and variable arrows.
function buildBiplot(r) {
  if (r.d < 2) return "";
  const W = 320, H = 260, PAD = { top: 16, right: 16, bottom: 28, left: 36 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  // PC1 / PC2 scores
  const pc1 = r.scores.map(s => s[0]);
  const pc2 = r.scores.map(s => s[1]);
  // Loadings for PC1 / PC2
  const l1 = r.loadings.map(L => L[0]);
  const l2 = r.loadings.map(L => L[1]);
  // Use combined ranges so points + arrows fit
  const sMax = Math.max(...pc1.map(Math.abs), ...pc2.map(Math.abs));
  const lMax = Math.max(...l1.map(Math.abs), ...l2.map(Math.abs)) || 1;
  // Scale arrows to ~70% of plot half-width
  const arrowScale = (sMax * 0.7) / lMax;
  const ext = sMax * 1.1;
  const px = (v) => PAD.left + ((v + ext) / (2 * ext)) * innerW;
  const py = (v) => PAD.top + innerH - ((v + ext) / (2 * ext)) * innerH;
  let svg = `<div style="margin-top:6px;font-size:11px;font-weight:600">バイプロット (PC1 × PC2)</div>`;
  svg += `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="background:#fff;border:1px solid #e2e8f0">`;
  // Frame
  svg += `<rect x="${PAD.left}" y="${PAD.top}" width="${innerW}" height="${innerH}" fill="none" stroke="#cbd5e1"/>`;
  // 0-axis cross
  svg += `<line x1="${PAD.left}" y1="${py(0)}" x2="${W - PAD.right}" y2="${py(0)}" stroke="#94a3b8" stroke-dasharray="2,2"/>`;
  svg += `<line x1="${px(0)}" y1="${PAD.top}" x2="${px(0)}" y2="${H - PAD.bottom}" stroke="#94a3b8" stroke-dasharray="2,2"/>`;
  // Sample points (light grey)
  for (let i = 0; i < pc1.length; i++) {
    svg += `<circle cx="${px(pc1[i]).toFixed(1)}" cy="${py(pc2[i]).toFixed(1)}" r="2.5" fill="rgba(71,85,105,0.45)"/>`;
  }
  // Variable arrows + labels
  for (let i = 0; i < r.d; i++) {
    const ex = l1[i] * arrowScale, ey = l2[i] * arrowScale;
    const x1 = px(0), y1 = py(0);
    const x2 = px(ex), y2 = py(ey);
    // Arrow shaft
    svg += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#dc2626" stroke-width="1.4"/>`;
    // Arrow head (small triangle)
    const ang = Math.atan2(y2 - y1, x2 - x1);
    const ah = 5;
    const hx1 = x2 - ah * Math.cos(ang - 0.4);
    const hy1 = y2 - ah * Math.sin(ang - 0.4);
    const hx2 = x2 - ah * Math.cos(ang + 0.4);
    const hy2 = y2 - ah * Math.sin(ang + 0.4);
    svg += `<polygon points="${x2.toFixed(1)},${y2.toFixed(1)} ${hx1.toFixed(1)},${hy1.toFixed(1)} ${hx2.toFixed(1)},${hy2.toFixed(1)}" fill="#dc2626"/>`;
    // Label
    const lx = x2 + 4 * Math.cos(ang);
    const ly = y2 + 4 * Math.sin(ang) + 3;
    const name = r.xFields[i].length > 10 ? r.xFields[i].slice(0, 9) + "…" : r.xFields[i];
    svg += `<text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" font-size="9" font-weight="600" fill="#1e293b">${escapeHtmlText(name)}</text>`;
  }
  // Axis labels with variance explained
  const pc1Pct = (r.ratios[0] * 100).toFixed(1);
  const pc2Pct = (r.ratios[1] * 100).toFixed(1);
  svg += `<text x="${W / 2}" y="${H - 8}" font-size="10" text-anchor="middle" fill="#475569">PC1 (${pc1Pct}%)</text>`;
  svg += `<text x="12" y="${PAD.top + innerH / 2}" font-size="10" fill="#475569" transform="rotate(-90 12 ${PAD.top + innerH / 2})">PC2 (${pc2Pct}%)</text>`;
  svg += `</svg>`;
  return svg;
}

function buildScreePlot(r) {
  const W = 280, H = 120, PAD = { top: 8, right: 8, bottom: 22, left: 28 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const maxK = Math.min(r.d, 8);
  const maxRatio = Math.max(...r.ratios.slice(0, maxK));
  const barW = innerW / maxK - 4;
  let svg = `<div style="margin-top:6px;font-size:11px;font-weight:600">Scree プロット</div>`;
  svg += `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="background:#fff;border:1px solid #e2e8f0">`;
  svg += `<line x1="${PAD.left}" y1="${H - PAD.bottom}" x2="${W - PAD.right}" y2="${H - PAD.bottom}" stroke="#94a3b8"/>`;
  svg += `<line x1="${PAD.left}" y1="${PAD.top}" x2="${PAD.left}" y2="${H - PAD.bottom}" stroke="#94a3b8"/>`;
  for (let k = 0; k < maxK; k++) {
    const ratio = r.ratios[k];
    const h = (ratio / maxRatio) * innerH;
    const x = PAD.left + 2 + k * (barW + 4);
    const y = H - PAD.bottom - h;
    svg += `<rect x="${x}" y="${y}" width="${barW}" height="${h}" fill="#1e3a8a"/>`;
    svg += `<text x="${x + barW / 2}" y="${H - PAD.bottom + 12}" font-size="9" text-anchor="middle" fill="#475569">PC${k + 1}</text>`;
    svg += `<text x="${x + barW / 2}" y="${y - 2}" font-size="8" text-anchor="middle" fill="#1e293b">${(ratio * 100).toFixed(1)}%</text>`;
  }
  svg += `</svg>`;
  return svg;
}

els.pcaRun?.addEventListener("click", runPca);

// ----- Hierarchical clustering (Cycle 160) -----
function populateHcSelectors(fields) {
  if (!els.hcXList) return;
  const prevChecked = new Set([...els.hcXList.querySelectorAll("input:checked")].map(el => el.value));
  els.hcXList.innerHTML = "";
  for (const f of fields) {
    const label = document.createElement("label");
    label.style.cssText = "display:block;padding:1px 0;";
    const cb = document.createElement("input");
    cb.type = "checkbox"; cb.value = f;
    if (prevChecked.has(f)) cb.checked = true;
    label.appendChild(cb);
    label.append(" " + f);
    els.hcXList.appendChild(label);
  }
}

function runHierarchical() {
  if (!state.dataset) return;
  const xFields = [...els.hcXList.querySelectorAll("input:checked")].map(el => el.value);
  if (xFields.length < 1) { setSummary("少なくとも 1 つの変数 X を選んでください", "warn"); return; }
  const linkage = els.hcLinkage?.value || "ward";
  const cutK = parseInt(els.hcK?.value || "3", 10) || 3;
  // Build standardized matrix
  const rawPoints = [];
  const keys = [];
  for (const r of state.dataset.rows) {
    const row = [];
    let ok = true;
    for (const xf of xFields) {
      const v = r.values[xf];
      if (!Number.isFinite(v)) { ok = false; break; }
      row.push(v);
    }
    if (ok) { rawPoints.push(row); keys.push(r.key); }
  }
  const n = rawPoints.length;
  const d = xFields.length;
  if (n < 2) { setSummary(`サンプル不足 (n=${n})`, "warn"); return; }
  if (n > 600) { setSummary(`サンプル多すぎ (n=${n})、600 件以下にしてください`, "warn"); return; }
  const mean = new Array(d).fill(0);
  for (const p of rawPoints) for (let j = 0; j < d; j++) mean[j] += p[j];
  for (let j = 0; j < d; j++) mean[j] /= n;
  const sd = new Array(d).fill(0);
  for (const p of rawPoints) for (let j = 0; j < d; j++) sd[j] += (p[j] - mean[j]) ** 2;
  for (let j = 0; j < d; j++) sd[j] = Math.sqrt(sd[j] / Math.max(1, n - 1)) || 1;
  const Z = rawPoints.map(p => p.map((v, j) => (v - mean[j]) / sd[j]));
  // Initial distance matrix (squared Euclidean for Ward)
  const distSq = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; s += d * d; } return s; };
  const D = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      D[i][j] = D[j][i] = Math.sqrt(distSq(Z[i], Z[j]));
    }
  }
  // Cluster state: each cluster has an id, a member array, and a size.
  const clusters = new Map();
  for (let i = 0; i < n; i++) clusters.set(i, { members: [i], size: 1, id: i });
  let nextId = n;
  const merges = []; // [{ id, leftId, rightId, height, size }]
  const distFn = makeDistFn(linkage);
  // Active cluster IDs
  let activeIds = [...clusters.keys()];
  while (activeIds.length > 1) {
    // Find the pair (i,j) with smallest distance
    let bestI = activeIds[0], bestJ = activeIds[1];
    let bestD = Infinity;
    for (let a = 0; a < activeIds.length; a++) {
      for (let b = a + 1; b < activeIds.length; b++) {
        const ia = activeIds[a], ib = activeIds[b];
        const dist = D[ia] ? D[ia][ib] : null;
        if (dist != null && dist < bestD) { bestD = dist; bestI = ia; bestJ = ib; }
      }
    }
    // Merge bestI + bestJ → newId
    const cI = clusters.get(bestI);
    const cJ = clusters.get(bestJ);
    const newId = nextId++;
    const newSize = cI.size + cJ.size;
    clusters.set(newId, { members: [...cI.members, ...cJ.members], size: newSize, id: newId });
    merges.push({ id: newId, leftId: bestI, rightId: bestJ, height: bestD, size: newSize });
    // Update distances using Lance-Williams formula
    const D_new = {};
    for (const ak of activeIds) {
      if (ak === bestI || ak === bestJ) continue;
      const c = clusters.get(ak);
      const dIK = D[bestI][ak];
      const dJK = D[bestJ][ak];
      const dIJ = bestD;
      let dNK;
      if (linkage === "single") dNK = Math.min(dIK, dJK);
      else if (linkage === "complete") dNK = Math.max(dIK, dJK);
      else if (linkage === "average") dNK = (cI.size * dIK + cJ.size * dJK) / (cI.size + cJ.size);
      else { // ward
        const total = cI.size + cJ.size + c.size;
        dNK = Math.sqrt(((cI.size + c.size) * dIK * dIK + (cJ.size + c.size) * dJK * dJK - c.size * dIJ * dIJ) / total);
      }
      D_new[ak] = dNK;
    }
    // Materialize new row/col
    D[newId] = [];
    for (const ak of Object.keys(D_new)) {
      const k = parseInt(ak, 10);
      D[newId][k] = D_new[k];
      D[k][newId] = D_new[k];
    }
    activeIds = activeIds.filter(x => x !== bestI && x !== bestJ);
    activeIds.push(newId);
  }
  // Cut into K clusters: roll back the last (n-1) - (K-1) merges
  const allMerges = merges.slice();  // length n-1
  const cutAt = Math.max(0, n - cutK);
  // Apply merges up to cutAt; remaining clusters at that point = K clusters
  const parent = new Map();
  for (let i = 0; i < n; i++) parent.set(i, i);
  const find = (x) => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
  for (let m = 0; m < cutAt; m++) {
    const mm = allMerges[m];
    parent.set(find(mm.leftId), mm.id);
    parent.set(find(mm.rightId), mm.id);
    parent.set(mm.id, mm.id);
  }
  // Group n leaf items by their root
  const rootMap = new Map();  // rootId → clusterIndex
  const assignments = new Array(n).fill(-1);
  for (let i = 0; i < n; i++) {
    const root = find(i);
    if (!rootMap.has(root)) rootMap.set(root, rootMap.size);
    assignments[i] = rootMap.get(root);
  }
  const Kfinal = rootMap.size;
  const silArr = silhouetteScores(Z, assignments, Kfinal);
  let sil = null;
  if (silArr) {
    let s = 0, c = 0;
    for (const v of silArr) if (v != null) { s += v; c++; }
    sil = c > 0 ? s / c : null;
  }
  state.hcResult = { xFields, n, K: Kfinal, linkage, silhouette: sil, silArr, keys, assignments, merges: allMerges };
  renderHcResult(state.hcResult);
  if (els.hcAdd) els.hcAdd.disabled = false;
  if (els.hcCsv) els.hcCsv.disabled = false;
}

function makeDistFn(linkage) {
  // Returned function not actually used in the merge loop (Lance-Williams
  // handles distance updates inline). Kept here for future-proofing.
  return null;
}

function renderHcResult(r) {
  if (!els.hcResult) return;
  const sizes = new Array(r.K).fill(0);
  for (const a of r.assignments) sizes[a]++;
  const silTxt = r.silhouette == null
    ? ""
    : `, シルエット=<strong>${r.silhouette.toFixed(3)}</strong> (${silhouetteLabel(r.silhouette)})`;
  let html = `<div class="mr-summary">階層: ${r.linkage}, n=${r.n}, カット K=${r.K}, マージ数=${r.merges.length}${silTxt}</div>`;
  html += "<table style='margin-top:6px'><thead><tr><th>クラスタ</th><th>件数</th><th>割合</th></tr></thead><tbody>";
  for (let k = 0; k < r.K; k++) {
    html += `<tr><td>${k + 1}</td><td class="num">${sizes[k]}</td><td class="num">${(sizes[k] / r.n * 100).toFixed(1)}%</td></tr>`;
  }
  html += "</tbody></table>";
  if (r.silArr) html += buildSilhouettePlot(r.silArr, r.assignments, r.K, r.silhouette);
  html += buildDendrogram(r);
  els.hcResult.innerHTML = html;
}

// Render the dendrogram as an SVG. Leaves are ordered by depth-first traversal
// so the tree is planar (no crossing branches).
function buildDendrogram(r) {
  const W = 320, H = 220, PAD = { top: 8, right: 8, bottom: 22, left: 28 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const n = r.n;
  if (n < 2 || r.merges.length === 0) return "";
  // Determine each cluster's children (leaves stay as leaves)
  const children = new Map();
  for (const m of r.merges) children.set(m.id, [m.leftId, m.rightId]);
  // DFS in-order from the root (last merge) to lay leaves left→right
  const rootId = r.merges[r.merges.length - 1].id;
  const leafX = new Map();
  let cursor = 0;
  function dfs(id) {
    const c = children.get(id);
    if (!c) { leafX.set(id, cursor++); return; }
    dfs(c[0]); dfs(c[1]);
  }
  dfs(rootId);
  // X position of internal nodes = midpoint of their two children's X positions
  const nodeX = new Map();
  for (const [k, v] of leafX.entries()) nodeX.set(k, v);
  for (const m of r.merges) {
    const xl = nodeX.get(m.leftId);
    const xr = nodeX.get(m.rightId);
    nodeX.set(m.id, (xl + xr) / 2);
  }
  // Y position = merge height (linear scaling)
  const maxH = Math.max(...r.merges.map(m => m.height));
  const px = (x) => PAD.left + (x / (n - 1)) * innerW;
  const py = (h) => PAD.top + innerH - (h / maxH) * innerH;
  let svg = `<div style="margin-top:6px;font-size:11px;font-weight:600">デンドログラム</div>`;
  svg += `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="background:#fff;border:1px solid #e2e8f0">`;
  // Reference horizontal cut line at K
  const cutAt = n - r.K;
  if (cutAt > 0 && cutAt < r.merges.length) {
    const cutH = r.merges[cutAt].height;
    svg += `<line x1="${PAD.left}" y1="${py(cutH)}" x2="${W - PAD.right}" y2="${py(cutH)}" stroke="#dc2626" stroke-width="1" stroke-dasharray="3,2"/>`;
    svg += `<text x="${W - PAD.right - 2}" y="${py(cutH) - 2}" font-size="9" text-anchor="end" fill="#dc2626">K=${r.K}</text>`;
  }
  // Draw merges as U-shaped brackets
  for (const m of r.merges) {
    const xl = px(nodeX.get(m.leftId));
    const xr = px(nodeX.get(m.rightId));
    const yL = py(children.get(m.leftId)  ? r.merges.find(mm => mm.id === m.leftId).height  : 0);
    const yR = py(children.get(m.rightId) ? r.merges.find(mm => mm.id === m.rightId).height : 0);
    const yT = py(m.height);
    svg += `<polyline points="${xl.toFixed(1)},${yL.toFixed(1)} ${xl.toFixed(1)},${yT.toFixed(1)} ${xr.toFixed(1)},${yT.toFixed(1)} ${xr.toFixed(1)},${yR.toFixed(1)}" fill="none" stroke="#1e3a8a" stroke-width="1"/>`;
  }
  // Axis labels
  svg += `<text x="${W / 2}" y="${H - 6}" font-size="9" text-anchor="middle" fill="#475569">観測 (n=${n}, 葉)</text>`;
  svg += `<text x="4" y="${PAD.top + innerH / 2}" font-size="9" fill="#475569">距離</text>`;
  svg += `</svg>`;
  return svg;
}

els.hcRun?.addEventListener("click", runHierarchical);

// ----- Scatter plot matrix / SPLOM (Cycle 165) -----
function populateSplomSelectors(fields) {
  if (!els.spXList) return;
  const prevChecked = new Set([...els.spXList.querySelectorAll("input:checked")].map(el => el.value));
  els.spXList.innerHTML = "";
  for (const f of fields) {
    const label = document.createElement("label");
    label.style.cssText = "display:block;padding:1px 0;";
    const cb = document.createElement("input");
    cb.type = "checkbox"; cb.value = f;
    if (prevChecked.has(f)) cb.checked = true;
    label.appendChild(cb);
    label.append(" " + f);
    els.spXList.appendChild(label);
  }
}

function runSplom() {
  if (!state.dataset) return;
  const xFields = [...els.spXList.querySelectorAll("input:checked")].map(el => el.value);
  if (xFields.length < 2) { setSummary("少なくとも 2 つの変数を選んでください", "warn"); return; }
  if (xFields.length > 5) { setSummary("最大 5 変数までです（パフォーマンス確保）", "warn"); return; }
  const N = xFields.length;
  const cell = 90;  // each cell is 90×90 px
  const W = cell * N + 16;
  const H = cell * N + 16;
  // Pre-extract value arrays
  const cols = xFields.map(f => state.dataset.rows.map(r => r.values[f]));
  // Compute min/max per column for axis scaling
  const ranges = cols.map(arr => {
    const v = arr.filter(x => Number.isFinite(x));
    return { min: Math.min(...v), max: Math.max(...v) };
  });
  let html = `<div style="margin-top:6px;font-size:11px;font-weight:600">散布図行列 (${N}×${N})</div>`;
  html += `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="background:#fff;border:1px solid #e2e8f0">`;
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      const x0 = 8 + j * cell;
      const y0 = 8 + i * cell;
      html += `<rect x="${x0}" y="${y0}" width="${cell}" height="${cell}" fill="none" stroke="#cbd5e1"/>`;
      if (i === j) {
        // Diagonal: variable name (centered)
        const nm = xFields[i].length > 12 ? xFields[i].slice(0, 11) + "…" : xFields[i];
        html += `<text x="${x0 + cell / 2}" y="${y0 + cell / 2 + 3}" font-size="10" font-weight="700" text-anchor="middle" fill="#1e3a8a">${escapeHtmlText(nm)}</text>`;
      } else {
        // Off-diagonal: scatter with x=cols[j], y=cols[i]
        const rx = ranges[j], ry = ranges[i];
        const xRange = rx.max - rx.min || 1;
        const yRange = ry.max - ry.min || 1;
        const pad = 4;
        const innerW = cell - 2 * pad;
        const innerH = cell - 2 * pad;
        const px = (v) => x0 + pad + ((v - rx.min) / xRange) * innerW;
        const py = (v) => y0 + pad + innerH - ((v - ry.min) / yRange) * innerH;
        // Compute Pearson r for this pair using complete cases (Cycle 177).
        const xVals = [], yVals = [];
        for (let k = 0; k < cols[0].length; k++) {
          const xv = cols[j][k], yv = cols[i][k];
          if (!Number.isFinite(xv) || !Number.isFinite(yv)) continue;
          xVals.push(xv); yVals.push(yv);
          html += `<circle cx="${px(xv).toFixed(1)}" cy="${py(yv).toFixed(1)}" r="1.4" fill="rgba(15,23,42,0.5)"/>`;
        }
        // r overlay top-left
        const rVal = (xVals.length >= 3) ? pearsonR(xVals, yVals) : null;
        if (rVal != null) {
          const abs = Math.abs(rVal);
          const color = rVal >= 0.5 ? "#dc2626" : rVal <= -0.5 ? "#2563eb" : (abs >= 0.3 ? "#475569" : "#94a3b8");
          const weight = abs >= 0.5 ? 700 : 500;
          html += `<text x="${x0 + 4}" y="${y0 + 12}" font-size="9" font-weight="${weight}" fill="${color}">r=${rVal.toFixed(2)}</text>`;
        }
        // Cell is clickable to load this pair into the main scatter panel
        html += `<rect x="${x0}" y="${y0}" width="${cell}" height="${cell}" fill="transparent" data-xi="${j}" data-yi="${i}" style="cursor:pointer"><title>${escapeHtmlText(xFields[j])} × ${escapeHtmlText(xFields[i])}${rVal != null ? ` : r=${rVal.toFixed(3)}` : ""}</title></rect>`;
      }
    }
  }
  html += `</svg>`;
  els.spResult.innerHTML = html;
  // Wire click-to-load handlers
  els.spResult.querySelectorAll("rect[data-xi]").forEach(r => {
    r.addEventListener("click", () => {
      const xi = parseInt(r.dataset.xi, 10);
      const yi = parseInt(r.dataset.yi, 10);
      if (els.scatterX && els.scatterY) {
        els.scatterX.value = xFields[xi];
        els.scatterY.value = xFields[yi];
        drawScatter();
        els.panelScatter?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
  });
}

els.spRun?.addEventListener("click", runSplom);

els.hcCsv?.addEventListener("click", () => {
  const r = state.hcResult;
  if (!r) { setSummary("先に階層クラスタを実行してください", "warn"); return; }
  const nameById = new Map(state.dataset.rows.map(row => [row.key, row.name || `#${row.key}`]));
  const sizes = new Array(r.K).fill(0);
  for (const a of r.assignments) sizes[a]++;
  const lines = [];
  // 1. Cluster summary
  lines.push(["クラスタ", "件数", "割合"].map(csvEscape).join(","));
  for (let k = 0; k < r.K; k++) {
    lines.push([String(k + 1), String(sizes[k]), (sizes[k] / r.n * 100).toFixed(2) + "%"].map(csvEscape).join(","));
  }
  lines.push("");
  // 2. Meta
  lines.push(["統計", "値"].map(csvEscape).join(","));
  lines.push(["手法", r.linkage].map(csvEscape).join(","));
  lines.push(["K (クラスタ数)", String(r.K)].map(csvEscape).join(","));
  lines.push(["説明変数 X", r.xFields.join(", ")].map(csvEscape).join(","));
  lines.push(["n (有効サンプル)", String(r.n)].map(csvEscape).join(","));
  lines.push(["マージ回数", String(r.merges.length)].map(csvEscape).join(","));
  if (r.silhouette != null) lines.push(["シルエット係数", r.silhouette.toFixed(4)].map(csvEscape).join(","));
  lines.push("");
  // 3. Per-region assignment
  lines.push(["id", "地域", "クラスタ"].map(csvEscape).join(","));
  for (let i = 0; i < r.keys.length; i++) {
    const id = r.keys[i];
    lines.push([String(id), nameById.get(id) || `#${id}`, String(r.assignments[i] + 1)].map(csvEscape).join(","));
  }
  const csv = "﻿" + lines.join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `hclust_${r.linkage}_K${r.K}_${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  setSummary(`階層クラスタ結果を ${a.download} として保存しました（${r.linkage}, K=${r.K}, n=${r.n}）`, "success");
});

els.hcAdd?.addEventListener("click", () => {
  const r = state.hcResult;
  if (!r || !state.dataset) return;
  let name = `階層クラスタ_K${r.K}`;
  let suffix = 2;
  while (state.dataset.fields.includes(name)) name = `階層クラスタ_K${r.K}_${suffix++}`;
  const idx = new Map(r.keys.map((k, i) => [k, r.assignments[i]]));
  for (const row of state.dataset.rows) {
    const a = idx.get(row.key);
    row.values[name] = a == null ? null : (a + 1);
  }
  state.dataset.fields.push(name);
  populateFieldSelects();
  if (state.dataset.fields.length >= 2) populateScatterSelectors(state.dataset.fields);
  state.field = name;
  els.selectField.value = name;
  refresh();
  setSummary(`列「${name}」を追加して地図に表示しました`, "success");
});

els.pcaCsv?.addEventListener("click", () => {
  const r = state.pcaResult;
  if (!r) { setSummary("先に PCA を実行してください", "warn"); return; }
  const fmt = (v, d = 4) => (v == null || !Number.isFinite(v)) ? "" : v.toFixed(d);
  const nameById = new Map(state.dataset.rows.map(row => [row.key, row.name || `#${row.key}`]));
  const lines = [];
  // 1. Variance explained
  lines.push(["主成分", "固有値", "寄与率", "累積寄与率"].map(csvEscape).join(","));
  for (let k = 0; k < r.d; k++) {
    lines.push([`PC${k + 1}`, fmt(r.eigvals[k]), fmt(r.ratios[k] * 100, 2), fmt(r.cumRatios[k] * 100, 2)].map(csvEscape).join(","));
  }
  lines.push("");
  // 2. Loadings
  lines.push(["変数", ...r.eigvals.map((_, k) => `PC${k + 1}`)].map(csvEscape).join(","));
  for (let i = 0; i < r.d; i++) {
    lines.push([r.xFields[i], ...r.loadings[i].map(v => fmt(v))].map(csvEscape).join(","));
  }
  lines.push("");
  // 3. Per-region scores
  lines.push(["id", "地域", ...r.eigvals.map((_, k) => `PC${k + 1}_score`)].map(csvEscape).join(","));
  for (let i = 0; i < r.keys.length; i++) {
    const id = r.keys[i];
    lines.push([String(id), nameById.get(id) || `#${id}`, ...r.scores[i].map(v => fmt(v))].map(csvEscape).join(","));
  }
  const csv = "﻿" + lines.join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `pca_${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  setSummary(`PCA結果を ${a.download} として保存しました（${r.d}主成分 × ${r.n}地域）`, "success");
});

// Mahalanobis distance (Cycle 190): multivariate-outlier detection. Uses the
// covariance of standardized variables → equivalent to a generalized squared
// distance from the centroid. Compared against χ²(d) percentiles for tests.
function mahalanobisDistances(Z) {
  const n = Z.length;
  if (n < 2) return null;
  const d = Z[0].length;
  // Mean vector (should be ~0 if Z is standardized, but be safe).
  const mu = new Array(d).fill(0);
  for (const row of Z) for (let j = 0; j < d; j++) mu[j] += row[j];
  for (let j = 0; j < d; j++) mu[j] /= n;
  // Covariance matrix (n-1 denominator)
  const cov = Array.from({ length: d }, () => new Array(d).fill(0));
  for (const row of Z) {
    for (let i = 0; i < d; i++) {
      for (let j = i; j < d; j++) {
        cov[i][j] += (row[i] - mu[i]) * (row[j] - mu[j]);
      }
    }
  }
  for (let i = 0; i < d; i++) {
    for (let j = i; j < d; j++) {
      cov[i][j] /= (n - 1);
      cov[j][i] = cov[i][j];
    }
  }
  const invCov = invertMat(cov);
  if (!invCov) return null;
  // D² for each row
  const out = new Array(n);
  for (let k = 0; k < n; k++) {
    const c = Z[k].map((v, j) => v - mu[j]);
    // d² = c' Σ⁻¹ c
    let s = 0;
    for (let i = 0; i < d; i++) {
      let acc = 0;
      for (let j = 0; j < d; j++) acc += invCov[i][j] * c[j];
      s += c[i] * acc;
    }
    out[k] = s;
  }
  return out;
}

els.pcaMahalanobis?.addEventListener("click", () => {
  const r = state.pcaResult;
  if (!r || !r.Z || !r.keys) {
    setSummary("先に PCA を実行してください", "warn"); return;
  }
  const dSq = mahalanobisDistances(r.Z);
  if (!dSq) { setSummary("Mahalanobis 距離の計算に失敗", "error"); return; }
  // 95% threshold via χ² critical value for df = number of variables. Use
  // simple approximation: median + 2.0 * MAD instead, since chi² inverse CDF
  // is heavy. The threshold flag column is informational only.
  const sorted = dSq.slice().sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  // Add as derived column
  let name = "Mahalanobis_D²";
  let suffix = 2;
  while (state.dataset.fields.includes(name)) name = `Mahalanobis_D²_${suffix++}`;
  const idx = new Map(r.keys.map((k, i) => [k, dSq[i]]));
  for (const row of state.dataset.rows) {
    row.values[name] = idx.has(row.key) ? idx.get(row.key) : null;
  }
  state.dataset.fields.push(name);
  populateFieldSelects();
  if (state.dataset.fields.length >= 2) populateScatterSelectors(state.dataset.fields);
  state.field = name;
  els.selectField.value = name;
  refresh();
  setSummary(`Mahalanobis 距離 (中央値=${median.toFixed(2)}) を「${name}」として追加、地図に表示`, "success");
});

els.pcaAdd?.addEventListener("click", () => {
  const r = state.pcaResult;
  if (!r || !state.dataset) return;
  for (let k = 0; k < 2 && k < r.d; k++) {
    let name = `PC${k + 1}`;
    let suffix = 2;
    while (state.dataset.fields.includes(name)) name = `PC${k + 1}_${suffix++}`;
    const valMap = new Map();
    for (let i = 0; i < r.keys.length; i++) valMap.set(r.keys[i], r.scores[i][k]);
    for (const row of state.dataset.rows) {
      row.values[name] = valMap.has(row.key) ? valMap.get(row.key) : null;
    }
    state.dataset.fields.push(name);
    if (k === 0) state.field = name;
  }
  populateFieldSelects();
  if (state.dataset.fields.length >= 2) populateScatterSelectors(state.dataset.fields);
  els.selectField.value = state.field;
  refresh();
  setSummary("PC1, PC2 を派生列に追加して地図化しました", "success");
});

els.kmAdd?.addEventListener("click", () => {
  const r = state.kmResult;
  if (!r || !state.dataset) return;
  let name = `クラスタ_K${r.K}`;
  let suffix = 2;
  while (state.dataset.fields.includes(name)) name = `クラスタ_K${r.K}_${suffix++}`;
  const idx = new Map(r.keys.map((k, i) => [k, r.assignments[i]]));
  for (const row of state.dataset.rows) {
    const a = idx.get(row.key);
    row.values[name] = a == null ? null : (a + 1); // 1..K for readability
  }
  state.dataset.fields.push(name);
  populateFieldSelects();
  if (state.dataset.fields.length >= 2) populateScatterSelectors(state.dataset.fields);
  state.field = name;
  els.selectField.value = name;
  refresh();
  setSummary(`列「${name}」を追加して地図に表示しました`, "success");
});
els.mrCsv?.addEventListener("click", () => {
  const r = state.mrResult;
  if (!r) { setSummary("先に「回帰を計算」してください", "warn"); return; }
  const fmt = (v, d = 6) => (v == null || !Number.isFinite(v)) ? "" : v.toFixed(d);
  const lines = [["変数", "係数", "標準化β", "SE", "95%CI 下", "95%CI 上", "t", "p", "VIF"].map(csvEscape).join(",")];
  r.labels.forEach((lbl, i) => {
    lines.push([
      lbl, fmt(r.coeffs[i]),
      r.stdCoeffs?.[i] == null ? "" : r.stdCoeffs[i].toFixed(4),
      fmt(r.se[i]),
      fmt(r.ciLo?.[i]), fmt(r.ciHi?.[i]),
      fmt(r.tStats[i], 4), fmt(r.pValues[i], 6),
      r.vif?.[i] == null ? "" : r.vif[i].toFixed(4),
    ].map(csvEscape).join(","));
  });
  lines.push("");
  lines.push(["統計", "値"].map(csvEscape).join(","));
  lines.push(["目的変数 Y", r.yField].map(csvEscape).join(","));
  lines.push(["説明変数 X", r.xFields.join(", ")].map(csvEscape).join(","));
  lines.push(["n", String(r.n)].map(csvEscape).join(","));
  lines.push(["R²", fmt(r.R2, 4)].map(csvEscape).join(","));
  lines.push(["調整R²", fmt(r.adjR2, 4)].map(csvEscape).join(","));
  if (r.F != null) {
    lines.push(["F", fmt(r.F, 4)].map(csvEscape).join(","));
    lines.push(["df1", String(r.dfModel)].map(csvEscape).join(","));
    lines.push(["df2", String(r.dfResid)].map(csvEscape).join(","));
    lines.push(["F検定 p値", fmt(r.pF, 6)].map(csvEscape).join(","));
  }
  lines.push(["残差SE", fmt(r.residualSE, 4)].map(csvEscape).join(","));
  const csv = "﻿" + lines.join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const safe = (v) => String(v).replace(/[\s\\/:*?"<>|]+/g, "_");
  a.href = url;
  a.download = `multireg_${safe(r.yField)}_${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  setSummary(`重回帰結果を ${a.download} として保存しました`, "success");
});

// Matrix helpers (Cycle 140). Plain arrays-of-arrays, no external deps.
function transposeMat(A) {
  const r = A.length, c = A[0].length;
  const T = Array.from({ length: c }, () => new Array(r));
  for (let i = 0; i < r; i++) for (let j = 0; j < c; j++) T[j][i] = A[i][j];
  return T;
}
function matMul(A, B) {
  const ar = A.length, ac = A[0].length, bc = B[0].length;
  const out = Array.from({ length: ar }, () => new Array(bc).fill(0));
  for (let i = 0; i < ar; i++) {
    for (let k = 0; k < ac; k++) {
      const aik = A[i][k];
      for (let j = 0; j < bc; j++) out[i][j] += aik * B[k][j];
    }
  }
  return out;
}
function matVec(A, v) {
  const r = A.length, c = A[0].length;
  const out = new Array(r).fill(0);
  for (let i = 0; i < r; i++) for (let j = 0; j < c; j++) out[i] += A[i][j] * v[j];
  return out;
}
function invertMat(A) {
  const n = A.length;
  // Augment with identity
  const M = A.map((row, i) => {
    const r = row.slice();
    for (let j = 0; j < n; j++) r.push(i === j ? 1 : 0);
    return r;
  });
  for (let i = 0; i < n; i++) {
    // Pivot
    let pivot = i;
    for (let r = i + 1; r < n; r++) if (Math.abs(M[r][i]) > Math.abs(M[pivot][i])) pivot = r;
    if (Math.abs(M[pivot][i]) < 1e-12) return null;
    if (pivot !== i) { [M[i], M[pivot]] = [M[pivot], M[i]]; }
    // Scale row
    const pv = M[i][i];
    for (let c = 0; c < 2 * n; c++) M[i][c] /= pv;
    // Eliminate
    for (let r = 0; r < n; r++) {
      if (r === i) continue;
      const f = M[r][i];
      if (f === 0) continue;
      for (let c = 0; c < 2 * n; c++) M[r][c] -= f * M[i][c];
    }
  }
  return M.map(row => row.slice(n));
}

els.corrCsv?.addEventListener("click", () => {
  const cm = state.corrMatrix;
  if (!cm) { setSummary("先に「行列を計算」してください", "warn"); return; }
  const lines = [];
  lines.push(["", ...cm.fields].map(csvEscape).join(","));
  for (let i = 0; i < cm.fields.length; i++) {
    const row = [cm.fields[i], ...cm.matrix[i].map(v => v == null ? "" : v.toFixed(4))];
    lines.push(row.map(csvEscape).join(","));
  }
  const csv = "﻿" + lines.join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `correlation_matrix_${cm.method || "pearson"}_${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  setSummary(`相関行列を ${a.download} として保存しました（${cm.fields.length}×${cm.fields.length}）`, "success");
});

els.scatterDataCsv?.addEventListener("click", () => {
  if (!state.dataset) { setSummary("先にデータを読み込んでください", "warn"); return; }
  const xf = els.scatterX.value, yf = els.scatterY.value;
  if (!xf || !yf) { setSummary("散布図の X, Y 軸を選択してください", "warn"); return; }
  const fmt = (v) => (v == null || !Number.isFinite(v)) ? "" : String(v);
  const lines = [["id", "地域", xf, yf].map(csvEscape).join(",")];
  for (const r of state.dataset.rows) {
    const xv = r.values[xf], yv = r.values[yf];
    if (!Number.isFinite(xv) || !Number.isFinite(yv)) continue;
    lines.push([String(r.key), r.name || `#${r.key}`, fmt(xv), fmt(yv)].map(csvEscape).join(","));
  }
  const csv = "﻿" + lines.join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const safe = (v) => String(v).replace(/[\s\\/:*?"<>|]+/g, "_");
  a.href = url;
  a.download = `scatter_data_${safe(xf)}_vs_${safe(yf)}_${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  setSummary(`散布図データを ${a.download} として保存しました（${lines.length - 1}行）`, "success");
});

els.scatterCsv?.addEventListener("click", () => {
  const s = state.scatterStats;
  if (!s || s.r == null) { setSummary("先に散布図を描画してください", "warn"); return; }
  const fmt = (v, d = 4) => (v == null || !Number.isFinite(v)) ? "" : v.toFixed(d);
  const lines = [
    ["項目", "値"].map(csvEscape).join(","),
    ["X軸", s.xf].map(csvEscape).join(","),
    ["Y軸", s.yf].map(csvEscape).join(","),
    ["log変換 (X)", s.logX ? "あり" : "なし"].map(csvEscape).join(","),
    ["log変換 (Y)", s.logY ? "あり" : "なし"].map(csvEscape).join(","),
    ["有効サンプル数 n", String(s.n)].map(csvEscape).join(","),
    ["ピアソン相関 r", fmt(s.r)].map(csvEscape).join(","),
    ["r 95%CI 下限", fmt(s.rCI?.[0])].map(csvEscape).join(","),
    ["r 95%CI 上限", fmt(s.rCI?.[1])].map(csvEscape).join(","),
    ["スピアマン順位相関 ρ", fmt(s.rho)].map(csvEscape).join(","),
    ["ρ 95%CI 下限", fmt(s.rhoCI?.[0])].map(csvEscape).join(","),
    ["ρ 95%CI 上限", fmt(s.rhoCI?.[1])].map(csvEscape).join(","),
    ["決定係数 R² (線形)", fmt(s.r2)].map(csvEscape).join(","),
    ["回帰係数 slope", fmt(s.slope, 6)].map(csvEscape).join(","),
    ["切片 intercept", fmt(s.intercept, 6)].map(csvEscape).join(","),
    ["回帰次数", String(s.degree || 1)].map(csvEscape).join(","),
    ...(s.coeffs || []).map((c, i) => [`多項式係数 c${i}`, fmt(c, 6)].map(csvEscape).join(",")),
    ["多項式 R²", fmt(s.polyR2)].map(csvEscape).join(","),
    ["残差平方和 SSE", fmt(s.sse, 4)].map(csvEscape).join(","),
    ["AIC", fmt(s.aic, 3)].map(csvEscape).join(","),
    ["BIC", fmt(s.bic, 3)].map(csvEscape).join(","),
  ];
  const csv = "﻿" + lines.join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const safe = (v) => String(v).replace(/[\s\\/:*?"<>|]+/g, "_");
  a.href = url;
  a.download = `scatter_stats_${safe(s.xf)}_vs_${safe(s.yf)}_${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  setSummary(`散布図統計を ${a.download} として保存しました`, "success");
});
els.btnDerived.addEventListener("click", addDerivedField);
els.derivedOp?.addEventListener("change", () => {
  if (els.rowDerivedB) els.rowDerivedB.hidden = isUnaryOp(els.derivedOp.value);
});
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

// Custom GeoJSON overlay layer (Cycle 168). User can add multiple overlays
// (e.g., national parks, railways, POIs) on top of the choropleth.
const OVERLAY_PALETTE = ["#1d4ed8", "#16a34a", "#9333ea", "#d97706", "#dc2626", "#0891b2"];
els.overlayFile?.addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    const gj = JSON.parse(text);
    if (!gj || !gj.type) throw new Error("有効な GeoJSON ではありません");
    const colorIdx = (mapper._overlayLayers?.length || 0) % OVERLAY_PALETTE.length;
    const count = mapper.addOverlay(gj, { color: OVERLAY_PALETTE[colorIdx] });
    setSummary(`オーバーレイ「${file.name}」を追加しました（計 ${count} 個）`, "success");
  } catch (err) {
    setSummary("オーバーレイ読込失敗: " + err.message, "error");
  } finally {
    e.target.value = "";
  }
});
els.btnOverlayClear?.addEventListener("click", () => {
  if (!mapper._overlayLayers || mapper._overlayLayers.length === 0) {
    setSummary("オーバーレイはありません", "warn"); return;
  }
  const before = mapper._overlayLayers.length;
  mapper.clearOverlays();
  setSummary(`${before} 個のオーバーレイを削除しました`, "success");
});

// Zen mode (Cycle 169): hide sidebar so the map fills the viewport. Toggled
// via header button, Z key, or Esc when active.
function toggleZenMode() {
  document.body.classList.toggle("zen-mode");
  const on = document.body.classList.contains("zen-mode");
  if (els.btnZen) els.btnZen.textContent = on ? "⛶ 解除" : "⛶ 全画面";
  setTimeout(() => {
    mapper.map.invalidateSize();
    if (mapperB) mapperB.map.invalidateSize();
  }, 80);
  setSummary(on ? "Zenモード（地図全画面） / Esc または Z で解除" : "Zenモード解除", "muted");
}
els.btnZen?.addEventListener("click", toggleZenMode);

// Markdown clipboard export (Cycle 172): bundle all currently-computed
// analysis results into one Markdown block so the user can paste it into
// Obsidian / Notion / Word / Slack for note-taking.
function buildAnalysisMarkdown() {
  const lines = [];
  const fmt = (v, d = 3) => (v == null || !Number.isFinite(v)) ? "—" : v.toFixed(d);
  lines.push(`# MandaraNext 分析サマリー`);
  lines.push(`*生成: ${new Date().toLocaleString("ja-JP")}*`);
  lines.push("");
  if (!state.dataset) {
    lines.push("_データセット未読込_");
    return lines.join("\n");
  }
  const ds = state.dataset;
  lines.push(`## データ概要`);
  lines.push(`- 行数: ${ds.rows.length}`);
  lines.push(`- 列数: ${ds.fields.length}`);
  lines.push(`- レベル: ${ds.level || state.level}`);
  if (ds.encoding) lines.push(`- 文字コード: ${ds.encoding}`);
  if (state.field) lines.push(`- 表示列: **${state.field}**`);
  lines.push("");

  // Basic stats
  if (state.field) {
    const values = ds.rows.map(r => r.values[state.field]);
    const s = computeStats(values);
    if (s.n > 0) {
      lines.push(`## 基本統計 (${state.field})`);
      lines.push(`| 指標 | 値 |`);
      lines.push(`|---|---|`);
      lines.push(`| n | ${s.n} |`);
      lines.push(`| 欠損 | ${s.missing} |`);
      lines.push(`| 平均 | ${fmt(s.mean)} |`);
      lines.push(`| 中央値 | ${fmt(s.median)} |`);
      lines.push(`| 最小 〜 最大 | ${fmt(s.min)} 〜 ${fmt(s.max)} |`);
      lines.push(`| 標準偏差 | ${fmt(s.std)} |`);
      if (s.ciMeanLo != null) lines.push(`| 平均 95% CI | [${fmt(s.ciMeanLo)}, ${fmt(s.ciMeanHi)}] |`);
      if (s.skewness != null) lines.push(`| 歪度 | ${fmt(s.skewness)} |`);
      if (s.kurtosis != null) lines.push(`| 尖度 (超過) | ${fmt(s.kurtosis)} |`);
      lines.push("");
    }
  }

  // Scatter / correlation
  const sc = state.scatterStats;
  if (sc && sc.r != null) {
    lines.push(`## 散布図統計 (${sc.xf} × ${sc.yf})`);
    lines.push(`- n=${sc.n}`);
    lines.push(`- Pearson r = ${fmt(sc.r)}${sc.rCI ? ` [${fmt(sc.rCI[0])}, ${fmt(sc.rCI[1])}]` : ""}`);
    if (sc.rho != null) lines.push(`- Spearman ρ = ${fmt(sc.rho)}${sc.rhoCI ? ` [${fmt(sc.rhoCI[0])}, ${fmt(sc.rhoCI[1])}]` : ""}`);
    if (sc.r2 != null) lines.push(`- R² = ${fmt(sc.r2)}`);
    if (sc.degree > 1 && sc.polyR2 != null) {
      lines.push(`- 多項式 ${sc.degree} 次 R² = ${fmt(sc.polyR2)}`);
      if (sc.aic != null) lines.push(`- AIC = ${fmt(sc.aic, 2)}, BIC = ${fmt(sc.bic, 2)}`);
    }
    lines.push("");
  }

  // Multiple regression
  const mr = state.mrResult;
  if (mr) {
    lines.push(`## 重回帰分析`);
    lines.push(`- 目的変数: ${mr.yField}`);
    lines.push(`- 説明変数: ${mr.xFields.join(", ")}`);
    lines.push(`- n=${mr.n}, R²=${fmt(mr.R2)}, 調整R²=${fmt(mr.adjR2)}, F(${mr.dfModel},${mr.dfResid})=${fmt(mr.F, 2)}`);
    lines.push("");
    lines.push(`| 変数 | 係数 | 標準化β | 95% CI | t | p | VIF |`);
    lines.push(`|---|---|---|---|---|---|---|`);
    mr.labels.forEach((lbl, i) => {
      const ciLo = mr.ciLo?.[i], ciHi = mr.ciHi?.[i];
      const ci = (ciLo != null && ciHi != null) ? `[${fmt(ciLo)}, ${fmt(ciHi)}]` : "—";
      lines.push(`| ${lbl} | ${fmt(mr.coeffs[i], 4)} | ${fmt(mr.stdCoeffs?.[i])} | ${ci} | ${fmt(mr.tStats[i], 2)} | ${fmt(mr.pValues[i], 4)} | ${fmt(mr.vif?.[i], 2)} |`);
    });
    lines.push("");
  }

  // k-means / hclust / PCA / LISA summaries
  if (state.kmResult) {
    const r = state.kmResult;
    lines.push(`## k-means クラスタリング`);
    lines.push(`- K=${r.K}, n=${r.n}, WSS=${fmt(r.wss, 2)}, シルエット=${fmt(r.silhouette)}`);
    lines.push("");
  }
  if (state.hcResult) {
    const r = state.hcResult;
    lines.push(`## 階層クラスタリング (${r.linkage})`);
    lines.push(`- K=${r.K}, n=${r.n}, シルエット=${fmt(r.silhouette)}`);
    lines.push("");
  }
  if (state.pcaResult) {
    const r = state.pcaResult;
    lines.push(`## 主成分分析 (PCA)`);
    lines.push(`- n=${r.n}, d=${r.d}`);
    const top = Math.min(3, r.d);
    for (let k = 0; k < top; k++) {
      lines.push(`- PC${k + 1}: 固有値 ${fmt(r.eigvals[k])}, 寄与率 ${fmt(r.ratios[k] * 100, 1)}% (累積 ${fmt(r.cumRatios[k] * 100, 1)}%)`);
    }
    lines.push("");
  }
  if (state.lisaResult) {
    const r = state.lisaResult;
    lines.push(`## LISA 空間自己相関 (${r.field})`);
    lines.push(`- n=${r.n}, 全体 Moran's I = ${fmt(r.globalI)}, 有意 ${r.sigCount}/${r.n} (p<${r.alpha}, ${r.perm}回順列)`);
    lines.push(`- HH=${r.catTally.HH}, LL=${r.catTally.LL}, HL=${r.catTally.HL}, LH=${r.catTally.LH}, NS=${r.catTally.NS}`);
    lines.push("");
  }
  // Cycle 232: include the most recent crosstab χ² result so recipients see
  // independence-test significance, not just the on-screen heatmap/bar.
  if (state.crosstab && Number.isFinite(state.crosstab.chi2)) {
    const ct = state.crosstab;
    const sig = ct.pVal == null ? ""
      : ct.pVal < 0.001 ? " ***"
      : ct.pVal < 0.01 ? " **"
      : ct.pVal < 0.05 ? " *" : "";
    const pFmt = ct.pVal == null ? "—"
      : ct.pVal < 0.001 ? "< 0.001"
      : ct.pVal.toFixed(3);
    lines.push(`## クロス集計 (${ct.rowF} × ${ct.colF})`);
    lines.push(`- n=${ct.total}`);
    lines.push(`- χ²(df=${ct.df}) = ${fmt(ct.chi2, 2)}, p = ${pFmt}${sig}`);
    if (ct.cramerV != null) lines.push(`- Cramér's V = ${fmt(ct.cramerV)}`);
    lines.push("");
  }
  // Cycle 230: include the per-group regression table when present so
  // recipients see Simpson's paradox alongside the overall correlation.
  if (state.scatterGroupReg && state.scatterGroupReg.rows?.length) {
    const gr = state.scatterGroupReg;
    lines.push(`## 系列別回帰 (${gr.yf} = a·${gr.xf} + b)`);
    lines.push(`| カテゴリ | n | a (傾き) | b (切片) | r |`);
    lines.push(`|---|---:|---:|---:|---:|`);
    for (const row of gr.rows) {
      if (row.skip) {
        lines.push(`| ${row.cat} | ${row.n} | — | — | _n<3 skipped_ |`);
        continue;
      }
      const flip = Number.isFinite(gr.overallSlope) && Math.sign(gr.overallSlope) !== Math.sign(row.slope);
      const tag = flip ? " ⚠" : "";
      lines.push(`| ${row.cat}${tag} | ${row.n} | ${fmt(row.slope)} | ${fmt(row.intercept)} | ${row.r == null ? "—" : fmt(row.r)} |`);
    }
    if (gr.signFlip) {
      lines.push("");
      lines.push("> ⚠ 全体回帰と符号が逆転するグループあり (Simpson's paradox の可能性)");
    }
    // Cycle 234: include the 2-group slope-difference t-test (Cycle 233)
    if (gr.slopeTest) {
      const s = gr.slopeTest;
      const sig = s.p == null ? ""
        : s.p < 0.001 ? " ***"
        : s.p < 0.01 ? " **"
        : s.p < 0.05 ? " *" : "";
      const pFmt = s.p == null ? "—"
        : s.p < 0.001 ? "< 0.001"
        : s.p.toFixed(3);
      lines.push("");
      lines.push(`**2群の傾き差検定:** Δa(${s.cat1} − ${s.cat2}) = ${fmt(s.dSlope)} (SE=${fmt(s.seDiff)}), t(${s.df})=${fmt(s.t, 2)}, p=${pFmt}${sig}`);
    }
    lines.push("");
  }

  lines.push(`---`);
  lines.push(`*Generated by [MandaraNext](https://akira-kataoka.github.io/MandaraNext/)*`);
  return lines.join("\n");
}

els.btnCopyResults?.addEventListener("click", async () => {
  const md = buildAnalysisMarkdown();
  if (!navigator.clipboard?.writeText) {
    setSummary("お使いのブラウザはクリップボード書込みに未対応です", "warn"); return;
  }
  try {
    await navigator.clipboard.writeText(md);
    setSummary(`分析結果を Markdown でクリップボードにコピーしました（${md.split("\n").length}行）`, "success");
  } catch (e) {
    setSummary("コピー失敗: " + e.message, "error");
  }
});

els.btnDataReset?.addEventListener("click", () => {
  if (!state.dataset) {
    setSummary("クリアするデータがありません", "warn"); return;
  }
  if (!confirm("現在のデータセットと全ての分析結果を消去しますか？\n（地図データは保持されます）")) return;
  // Clear dataset and derived analysis results.
  state.dataset = null;
  state.field = null;
  state.fieldB = null;
  state.valueMap = null;
  state.filteredKeys = null;
  state.breaks = [];
  state.colors = [];
  state.scatterStats = null;
  state.mrResult = null;
  state.kmResult = null;
  state.hcResult = null;
  state.pcaResult = null;
  state.lisaResult = null;
  state.corrMatrix = null;
  state.crosstab = null;
  state.starredFields = new Set();
  // Reset map visuals
  mapper.resetColors?.();
  mapper.clearSymbols?.();
  mapper.clearHighlight?.();
  mapper.clearOutlierMarks?.();
  // Hide all dependent panels
  const panelsToHide = [
    els.panelField, els.panelClass, els.panelStats, els.panelLegend, els.panelTable,
    els.panelHist, els.panelBox, els.panelCt, els.panelScatter, els.panelTs,
    els.panelCorrMatrix, els.panelMr, els.panelKm, els.panelPca, els.panelHc, els.panelSplom,
  ];
  for (const p of panelsToHide) if (p) p.hidden = true;
  if (els.overlay) els.overlay.hidden = true;
  if (els.overlayB) els.overlayB.hidden = true;
  if (els.dataSummary) els.dataSummary.textContent = "";
  if (els.dataQuality) els.dataQuality.innerHTML = "";
  if (els.fieldList) els.fieldList.innerHTML = "";
  setSummary("データセットをクリアしました。新しい CSV を読み込んでください", "success");
});
els.btnCsv.addEventListener("click", exportCurrentCsv);

// Cycle 218: export the data table exactly as the user sees it — applying
// table search, attribute filter, sort, column visibility, and column order.
els.btnTableViewCsv?.addEventListener("click", () => {
  if (!state.dataset) { setSummary("先にデータを読み込んでください", "warn"); return; }
  const fields = getVisibleFields();
  if (!fields.length) { setSummary("表示列が空のためCSVに出力できません", "warn"); return; }
  // getTableRows() honors both attribute filter and the search box.
  let rowsRaw = (typeof getTableRows === "function") ? getTableRows() : state.dataset.rows.slice();
  const sort = getSortState();
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
  }
  const header = ["地域", ...fields];
  const rows = rowsRaw.map(r => [r.name || ("#" + r.key), ...fields.map(k => r.values[k] ?? "")]);
  const esc = (c) => {
    const s = String(c ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [header, ...rows].map(line => line.map(esc).join(",")).join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `mandara_table_view_${rowsRaw.length}rows_${fields.length}cols.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  setSummary(`表示中のテーブルをCSV出力 (${rowsRaw.length}行 × ${fields.length}列)`, "success");
});
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
    case "z": case "Z":
      toggleZenMode();
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
      if (document.body.classList.contains("zen-mode")) { toggleZenMode(); break; }
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
    titleAlign: els.selectTitleAlign?.value || "c",
    scatterColorBy: els.scatterColorBy?.value || "",
    showScale: !!els.chkShowScale?.checked,
    showNorth: !!els.chkShowNorth?.checked,
    showCoords: !!els.chkShowCoords?.checked,
    showMinimap: !!els.chkShowMinimap?.checked,
    legendPos: els.selectLegendPos?.value || "br",
    legendFreeLeft: els.overlay?.style.left || "",
    legendFreeTop:  els.overlay?.style.top  || "",
    legendFs: els.selectLegendFs?.value || "m",
    legendPrec: els.selectLegendPrec?.value || "auto",
    legendLayout: els.selectLegendLayout?.value || "vertical",
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
    for (const n of userNames) {
      const desc = all[n]?.description || "";
      const title = desc ? ` title="${escapeHtmlText(desc)}"` : "";
      html += `<option value="${escapeHtmlText(n)}"${title}>${escapeHtmlText(n)}</option>`;
    }
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
  // Preserve previous description on overwrite unless the user enters a new one.
  const prevDesc = all[name]?.description || "";
  const desc = prompt(`説明文（任意・後で見返す時のメモ）\n例: 2020年人口を Jenks 5階級・東京突出を強調`, prevDesc);
  const snap = snapshotCurrent();
  if (desc != null) snap.description = desc;
  all[name] = snap;
  saveScenes(all);
  refreshSceneList();
  els.selectScene.value = name;
  setSummary(`シーン「${name}」を保存しました${desc ? `: ${desc}` : ""}`, "success");
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
  if (snap.titleAlign !== undefined && els.selectTitleAlign) {
    els.selectTitleAlign.value = snap.titleAlign;
    els.selectTitleAlign.dispatchEvent(new Event("change"));
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
  if (snap.legendFs !== undefined && els.selectLegendFs) {
    els.selectLegendFs.value = snap.legendFs;
    els.selectLegendFs.dispatchEvent(new Event("change"));
  }
  if (snap.legendPrec !== undefined && els.selectLegendPrec) {
    els.selectLegendPrec.value = snap.legendPrec;
  }
  if (snap.legendLayout !== undefined && els.selectLegendLayout) {
    els.selectLegendLayout.value = snap.legendLayout;
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
  const descTxt = snap.description ? ` — ${snap.description}` : "";
  setSummary(`シーン「${name}」を復元しました${descTxt}`, "success");
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

// Cycle 225: show the same share-URL as a QR code so people in the room can
// scan it from their phone. Uses the qrcode (npm) CDN bundle; falls back to a
// plain prompt() if QR generation fails.
els.btnSceneQr?.addEventListener("click", async () => {
  const snap = snapshotCurrent();
  const url = location.origin + location.pathname + snapshotToHash(snap);
  if (typeof window.QRCode === "undefined") {
    setSummary("QRライブラリの読み込みに失敗しました", "error"); return;
  }
  try {
    const dataUrl = await window.QRCode.toDataURL(url, {
      margin: 1, width: 240, errorCorrectionLevel: "M",
    });
    showQrModal(url, dataUrl);
  } catch (e) {
    console.error(e);
    setSummary("QR生成に失敗: " + (e?.message || e), "error");
  }
});
function showQrModal(url, dataUrl) {
  // Remove any prior modal so repeat clicks don't stack.
  document.getElementById("qr-modal")?.remove();
  const overlay = document.createElement("div");
  overlay.id = "qr-modal";
  overlay.style.cssText =
    "position:fixed;inset:0;background:rgba(15,23,42,0.55);" +
    "display:flex;align-items:center;justify-content:center;z-index:99999";
  const card = document.createElement("div");
  card.style.cssText =
    "background:#fff;border-radius:8px;padding:18px;max-width:300px;" +
    "box-shadow:0 8px 32px rgba(0,0,0,0.3);text-align:center;font-family:inherit";
  card.innerHTML = `
    <div style="font-weight:600;margin-bottom:8px">📱 共有URL QRコード</div>
    <img src="${dataUrl}" width="240" height="240" alt="QR" style="display:block;margin:0 auto" />
    <div style="font-size:10px;color:#475569;margin:6px 0;word-break:break-all;max-height:48px;overflow:auto">${escapeHtmlText(url)}</div>
    <div style="display:flex;gap:6px;justify-content:center;margin-top:8px">
      <a class="btn" id="qr-download" download="mandara_share_qr.png">PNG保存</a>
      <button class="btn" id="qr-close" type="button">閉じる</button>
    </div>
  `;
  overlay.appendChild(card);
  document.body.appendChild(overlay);
  const dl = card.querySelector("#qr-download");
  if (dl) dl.href = dataUrl;
  const close = () => overlay.remove();
  card.querySelector("#qr-close")?.addEventListener("click", close);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
}

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
  if (els.chkTsShared?.checked) computeTsLockedBreaks();
  setTsField();
});
els.tsSlider.addEventListener("input", setTsField);
els.chkTsShared?.addEventListener("change", () => {
  if (els.chkTsShared.checked) computeTsLockedBreaks();
  else state.lockedBreaks = null;
  refresh();
});
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
  // Cycle 209: snapshot the CSV-original columns so we can later distinguish
  // derived columns (those added after load) and let users delete only them.
  state.dataset.originalFields = ds.fields.slice();
  state.filteredKeys = null;
  state.starredFields = new Set();
  // Cycle 200: reset column visibility for a fresh dataset so previously-hidden
  // field names from a different CSV don't carry over.
  // Cycle 201: also reset user column ordering for the same reason.
  state.hiddenColumns = new Set();
  state.columnOrder = null;
  // Cycle 212: discard any scatter pins from the previous dataset.
  state.pinnedScatterIds = new Set();
  state.lastBrushIds = null;
  syncScatterPinBtn();
  if (typeof syncBrushPinBtn === "function") syncBrushPinBtn();
  mapper.clearPinned?.();
  if (els.tableColPicker) els.tableColPicker.hidden = true;
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
    if (els.panelCorrMatrix) els.panelCorrMatrix.hidden = false;
    if (els.panelMr) {
      els.panelMr.hidden = false;
      populateMrSelectors(ds.fields);
    }
    if (els.panelKm) {
      els.panelKm.hidden = false;
      populateKmSelectors(ds.fields);
    }
    if (els.panelPca) {
      els.panelPca.hidden = false;
      populatePcaSelectors(ds.fields);
    }
    if (els.panelHc) {
      els.panelHc.hidden = false;
      populateHcSelectors(ds.fields);
    }
    if (els.panelSplom) {
      els.panelSplom.hidden = false;
      populateSplomSelectors(ds.fields);
    }
    populateScatterSelectors(ds.fields);
  } else {
    els.panelScatter.hidden = true;
    if (els.panelCorrMatrix) els.panelCorrMatrix.hidden = true;
    if (els.panelMr) els.panelMr.hidden = true;
    if (els.panelKm) els.panelKm.hidden = true;
    if (els.panelPca) els.panelPca.hidden = true;
    if (els.panelHc) els.panelHc.hidden = true;
    if (els.panelSplom) els.panelSplom.hidden = true;
  }
  // Pre-populate pie field options for the new dataset
  populatePieFields();
  // Data-quality summary per column
  renderDataQuality();
  // Detect time series
  setupTimeSeriesPanel();

  const encTag = ds.encoding && ds.encoding !== "UTF-8" ? ` [${ds.encoding}]` : "";
  const msg = `${label}${encTag}: ${ds.rows.length}件 / ${ds.fields.length}列を読み込みました。`;
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
  // Time-series shared scale (Cycle 136): when active, use cached breaks
  // computed once from all years so colors stay comparable across frames.
  let breaks;
  if (state.lockedBreaks && state.lockedBreaks.length) {
    breaks = state.lockedBreaks;
  } else {
    ({ breaks } = computeBreaks(values, state.classes, state.method, { manualBreaks }));
  }
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
    const chochoCounts = new Array(state.colors.length).fill(0);
    for (const v of values) {
      if (!Number.isFinite(v)) continue;
      const idx = classifyValue(v, state.breaks);
      if (idx >= 0 && idx < chochoCounts.length) chochoCounts[idx]++;
    }
    const _prec = getLegendPrec();
    const _lay = getLegendLayout();
    renderLegend(els.legendBox, state.breaks, state.colors, { title: state.field, showNA: naFlag, classCounts: chochoCounts, precision: _prec, layout: _lay });
    renderLegend(els.overlayLegend, state.breaks, state.colors, { showNA: naFlag, classCounts: chochoCounts, precision: _prec, layout: _lay });
    els.overlay.hidden = false;
    els.overlayTitle.textContent = state.field;
    els.overlayFooter.textContent = `MandaraNext ·${state.chochoPref}${state.chochoMuni} · ${new Date().toLocaleDateString("ja-JP")}`;
    renderStats(values);
    renderTable(els.tableWrap, state.dataset.rows, getVisibleFields(), () => {}, null, null, null, getTableOpts());
    saveSettings(state);
    return;
  }

  // LISA mode (Cycle 130): spatial cluster categorization via Local Moran's I.
  if (state.mode === "lisa") {
    const out = runLisa();
    if (!out) {
      setSummary("LISA を計算できません（有効データが少ない or 重心が取得できない）", "warn");
    } else {
      state.lisaResult = out;
      mapper.applyColorMap(out.colorById, state.field);
      renderLisaLegend(els.legendBox, out, true);
      renderLisaLegend(els.overlayLegend, out, false);
      els.overlay.hidden = false;
      els.overlayTitle.textContent = `LISA: ${state.field}`;
      const src = (els.inputDataSource?.value || "").trim();
      const author = (els.inputMapAuthor?.value || "").trim();
      const parts = [];
      if (src) parts.push(`出典: ${src}`);
      if (author) parts.push(`作成: ${author}`);
      parts.push(`MandaraNext · ${new Date().toLocaleDateString("ja-JP")}`);
      els.overlayFooter.textContent = parts.join(" · ");
      renderStats(values);
      renderTable(els.tableWrap, getTableRows(), getVisibleFields(), onTableRowHover, onCellEdit, onRowDelete, onTableRowClick, getTableOpts());
      saveSettings(state);
      return;
    }
  }

  // choropleth coloring (or reset to neutral if "symbol" only)
  if (state.mode === "bivariate") {
    if (!state.fieldB) {
      setSummary("二変量モードは Y 軸列 (compare の B 列) も必要です", "warn");
    } else {
      const valuesY = state.dataset.rows.map(r => r.values[state.fieldB]);
      const { breaks: bx } = computeBreaks(values, 3, "quantile");
      const { breaks: by } = computeBreaks(valuesY, 3, "quantile");
      const valueMapY = buildValueLookup(state.dataset, state.fieldB);
      mapper.applyBivariate(state.valueMap, valueMapY, bx, by, BIVARIATE_PALETTE, state.field, state.fieldB);
      // Bivariate legend in side panel and overlay
      renderBivariateLegend(els.legendBox, BIVARIATE_PALETTE, state.field, state.fieldB);
      renderBivariateLegend(els.overlayLegend, BIVARIATE_PALETTE, state.field, state.fieldB);
      els.overlay.hidden = false;
      els.overlayTitle.textContent = `${state.field} × ${state.fieldB}`;
      const src = (els.inputDataSource?.value || "").trim();
      const author = (els.inputMapAuthor?.value || "").trim();
      const parts = [];
      if (src) parts.push(`出典: ${src}`);
      if (author) parts.push(`作成: ${author}`);
      parts.push(`MandaraNext · ${new Date().toLocaleDateString("ja-JP")}`);
      els.overlayFooter.textContent = parts.join(" · ");
      renderStats(values);
      renderTable(els.tableWrap, getTableRows(), getVisibleFields(), onTableRowHover, onCellEdit, onRowDelete, onTableRowClick, getTableOpts());
      saveSettings(state);
      return;
    }
  }
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
  // Per-class counts: tally how many valid values fall into each break range.
  const classCounts = new Array(state.colors.length).fill(0);
  for (const v of values) {
    if (!Number.isFinite(v)) continue;
    const idx = classifyValue(v, state.breaks);
    if (idx >= 0 && idx < classCounts.length) classCounts[idx]++;
  }
  renderLegend(els.legendBox, state.breaks, state.colors, {
    title: state.field, showNA: naFlag, classCounts, precision: getLegendPrec(), layout: getLegendLayout(),
    onClassHover: (idx, ev) => {
      if (ev.type === "mouseenter") mapper.highlightByClass(idx);
    },
    onClassClick: (idx) => copyClassMembers(idx),
    onColorPick: (idx, hex) => {
      if (!state.customColors[state.palette]) state.customColors[state.palette] = {};
      state.customColors[state.palette][idx] = hex;
      refresh();
      syncResetColorBtn();
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
  renderLegend(els.overlayLegend, state.breaks, state.colors, { showNA: naFlag, classCounts, precision: getLegendPrec(), layout: getLegendLayout() });
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
    const classCountsB = new Array(colorsB.length).fill(0);
    for (const v of valuesB) {
      if (!Number.isFinite(v)) continue;
      const idx = classifyValue(v, breaksB);
      if (idx >= 0 && idx < classCountsB.length) classCountsB[idx]++;
    }
    renderLegend(els.overlayLegendB, breaksB, colorsB, { showNA: false, classCounts: classCountsB, precision: getLegendPrec(), layout: getLegendLayout() });
    els.overlayB.hidden = false;
    els.overlayTitleB.textContent = state.fieldB;
  } else if (mapperB) {
    mapperB.resetColors();
    els.overlayB.hidden = true;
  }

  // Data table — with inline editing
  renderTable(els.tableWrap, getTableRows(), getVisibleFields(), onTableRowHover, onCellEdit, onRowDelete, onTableRowClick, getTableOpts());

  // Box plot
  if (els.boxplotSvg) {
    // Grouped boxplot when a category column is selected (Cycle 175);
    // otherwise fall back to the single boxplot.
    const colorByField = els.scatterColorBy?.value || "";
    if (colorByField && colorByField !== state.field) {
      const groupMap = new Map();
      for (const r of state.dataset.rows) {
        const yv = r.values[state.field];
        if (!Number.isFinite(yv)) continue;
        const c = r.values[colorByField];
        if (c == null || c === "") continue;
        const key = String(c);
        if (!groupMap.has(key)) groupMap.set(key, []);
        groupMap.get(key).push(yv);
      }
      const groups = [...groupMap.entries()].map(([name, vals]) => ({ name, values: vals }));
      // Cap to 8 groups for readability; fall back to single boxplot if too many
      // valid groups or none.
      if (groups.length >= 2 && groups.length <= 8) {
        renderGroupedBoxplot(els.boxplotSvg, groups, `${state.field} × ${colorByField}`);
      } else {
        renderBoxplot(els.boxplotSvg, values, state.field);
      }
    } else {
      renderBoxplot(els.boxplotSvg, values, state.field);
    }
  }

  // Histogram with bin → map highlight link
  if (els.histSvg) {
    const bins = parseInt(els.histBins.value, 10) || 10;
    // Update bin-count hint (Cycle 193): Sturges + Freedman-Diaconis suggestions.
    updateHistBinsHint(values);
    // Group overlay (Cycle 176) when scatter color-by is set and category
    // count is in [2, 4]. Same path as the grouped boxplot (Cycle 175).
    const colorByField = els.scatterColorBy?.value || "";
    let groupHist = null;
    if (colorByField && colorByField !== state.field) {
      const gm = new Map();
      for (const r of state.dataset.rows) {
        const yv = r.values[state.field];
        if (!Number.isFinite(yv)) continue;
        const c = r.values[colorByField];
        if (c == null || c === "") continue;
        const key = String(c);
        if (!gm.has(key)) gm.set(key, []);
        gm.get(key).push(yv);
      }
      if (gm.size >= 2 && gm.size <= 4) {
        groupHist = [...gm.entries()].map(([name, vals]) => ({ name, values: vals }));
      }
    }
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
      logX:    !!els.chkHistLogX?.checked,
      cumulative: !!els.chkHistCumulative?.checked,
      groups:  groupHist,
    });
  }

  // Outlier highlight
  applyOutlierHighlight(values);

  // Ranking
  renderRanking();

  // Standard deviation ellipse
  applySdeDisplay();

  // Cycle 216: re-render scatter pins on the map after a fresh choropleth
  // pass, since applyChoropleth rebuilds the polygon layer.
  if (state.pinnedScatterIds?.size) {
    mapper.markPinned(state.pinnedScatterIds, els.scatterPinColor?.value);
  } else {
    mapper.clearPinned?.();
  }

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

// Filtered rows for the data table (Cycle 182): respects the quick search
// input above the table. Empty query → all rows.
function getTableRows() {
  if (!state.dataset) return [];
  const q = (els.tableSearch?.value || "").trim().toLowerCase();
  if (!q) return state.dataset.rows;
  return state.dataset.rows.filter(r =>
    String(r.name || "").toLowerCase().includes(q)
    || String(r.key).toLowerCase().includes(q)
  );
}

// Cycle 208: shared opts builder so every renderTable call carries the heat
// toggle, column visibility persistence, and any future per-table flags.
function getTableOpts() {
  return {
    heat: !!els.chkTableHeat?.checked,
    pinnedIds: state.pinnedScatterIds instanceof Set ? state.pinnedScatterIds : null,
    pinColor: els.scatterPinColor?.value || "#dc2626",
  };
}
els.chkTableHeat?.addEventListener("change", () => {
  if (state.dataset) refreshTable();
});

// Cycle 200: per-column visibility — users can hide noisy/irrelevant fields
// from the data table. Hidden columns remain in the dataset (and CSV export);
// only the on-screen rendering is filtered.
// Cycle 201: state.columnOrder lets users reorder visible columns. Persists
// only the user-chosen overrides; new fields not in columnOrder fall back to
// dataset.fields order.
state.hiddenColumns = state.hiddenColumns instanceof Set ? state.hiddenColumns : new Set();
state.columnOrder = Array.isArray(state.columnOrder) ? state.columnOrder : null;
function getOrderedFields() {
  const all = state.dataset?.fields || [];
  if (!state.columnOrder?.length) return all.slice();
  const set = new Set(all);
  // Honored order first (only those still present), then any newly-added
  // fields appended in their original order.
  const honored = state.columnOrder.filter(f => set.has(f));
  const seen = new Set(honored);
  const tail = all.filter(f => !seen.has(f));
  return [...honored, ...tail];
}
function getVisibleFields() {
  const ordered = getOrderedFields();
  const vis = ordered.filter(f => !state.hiddenColumns.has(f));
  // Safety: never end up with 0 visible columns — keep at least the first.
  return vis.length ? vis : (ordered.length ? [ordered[0]] : []);
}
function buildTableColPicker() {
  if (!els.tableColPicker || !state.dataset?.fields?.length) return;
  els.tableColPicker.innerHTML = "";
  const head = document.createElement("div");
  head.style.cssText = "display:flex;gap:6px;margin-bottom:4px";
  const all = document.createElement("button");
  all.type = "button"; all.className = "btn"; all.style.fontSize = "10px"; all.style.padding = "1px 6px";
  all.textContent = "全て表示";
  all.addEventListener("click", () => {
    state.hiddenColumns.clear();
    buildTableColPicker();
    refreshTable();
  });
  const none = document.createElement("button");
  none.type = "button"; none.className = "btn"; none.style.fontSize = "10px"; none.style.padding = "1px 6px";
  none.textContent = "全て非表示";
  none.addEventListener("click", () => {
    const fs = state.dataset.fields;
    // Keep the first column visible to avoid an empty table.
    state.hiddenColumns = new Set(fs.slice(1));
    buildTableColPicker();
    refreshTable();
  });
  const reset = document.createElement("button");
  reset.type = "button"; reset.className = "btn"; reset.style.fontSize = "10px"; reset.style.padding = "1px 6px";
  reset.textContent = "順序リセット";
  reset.title = "列順をCSV元の並びに戻す";
  reset.addEventListener("click", () => {
    state.columnOrder = null;
    buildTableColPicker();
    refreshTable();
  });
  head.appendChild(all); head.appendChild(none); head.appendChild(reset);
  els.tableColPicker.appendChild(head);
  // Cycle 201: render in current ordered view so ↑/↓ feels intuitive.
  // Cycle 209: derived columns (added after load) get a delete button.
  const ordered = getOrderedFields();
  const originals = new Set(state.dataset.originalFields || state.dataset.fields);
  for (let i = 0; i < ordered.length; i++) {
    const f = ordered[i];
    const row = document.createElement("div");
    row.style.cssText = "display:flex;align-items:center;line-height:1.6;gap:2px";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = !state.hiddenColumns.has(f);
    cb.addEventListener("change", () => {
      if (cb.checked) state.hiddenColumns.delete(f);
      else state.hiddenColumns.add(f);
      refreshTable();
    });
    const up = document.createElement("button");
    up.type = "button"; up.textContent = "↑"; up.disabled = (i === 0);
    up.title = "上に移動"; up.style.cssText = "padding:0 4px;font-size:10px";
    up.addEventListener("click", () => moveColumn(i, -1));
    const dn = document.createElement("button");
    dn.type = "button"; dn.textContent = "↓"; dn.disabled = (i === ordered.length - 1);
    dn.title = "下に移動"; dn.style.cssText = "padding:0 4px;font-size:10px";
    dn.addEventListener("click", () => moveColumn(i, +1));
    const lab = document.createElement("label");
    lab.style.cssText = "flex:1;cursor:pointer;margin-left:2px";
    lab.appendChild(cb);
    const isDerived = !originals.has(f);
    const text = document.createTextNode(" " + (isDerived ? "✱ " : "") + f);
    lab.appendChild(text);
    row.appendChild(up); row.appendChild(dn); row.appendChild(lab);
    if (isDerived) {
      const del = document.createElement("button");
      del.type = "button"; del.textContent = "×";
      del.title = "派生列を削除";
      del.style.cssText = "padding:0 5px;font-size:11px;color:#dc2626;font-weight:700";
      del.addEventListener("click", () => deleteDerivedField(f));
      row.appendChild(del);
    }
    els.tableColPicker.appendChild(row);
  }
}
// Cycle 209: remove a derived (post-load) column from the dataset. Confirms
// the action, then patches every consumer that may be pointing at the field
// (state.field / inputs / scatter X & Y) so nothing dangles.
function deleteDerivedField(name) {
  if (!state.dataset) return;
  const originals = new Set(state.dataset.originalFields || []);
  if (originals.has(name)) {
    setSummary(`「${name}」はCSV元の列のため削除できません`, "warn"); return;
  }
  if (!confirm(`派生列「${name}」を削除しますか？\n(CSV再読込で復活します)`)) return;
  // Drop from dataset.fields and every row.values
  state.dataset.fields = state.dataset.fields.filter(f => f !== name);
  for (const r of state.dataset.rows) delete r.values[name];
  state.hiddenColumns.delete(name);
  state.starredFields?.delete(name);
  if (state.columnOrder) state.columnOrder = state.columnOrder.filter(f => f !== name);
  // Auto-pivot any selector currently pointing at the doomed column.
  const fallback = state.dataset.fields[0];
  if (state.field === name && fallback) state.field = fallback;
  for (const sel of [els.selectField, els.scatterX, els.scatterY, els.scatterColorBy, els.scatterSizeBy, els.scatterLabelBy]) {
    if (sel && sel.value === name) sel.value = fallback || "";
  }
  populateFieldSelects();
  if (state.dataset.fields.length >= 2) populateScatterSelectors(state.dataset.fields);
  buildTableColPicker();
  refresh();
  setSummary(`派生列「${name}」を削除しました（残り${state.dataset.fields.length}列）`, "success");
}
// Swap a column with its neighbor (dir=-1 up, +1 down). Promotes the implicit
// dataset order to an explicit columnOrder on first reorder.
function moveColumn(i, dir) {
  const ordered = getOrderedFields();
  const j = i + dir;
  if (j < 0 || j >= ordered.length) return;
  [ordered[i], ordered[j]] = [ordered[j], ordered[i]];
  state.columnOrder = ordered;
  buildTableColPicker();
  refreshTable();
}
function refreshTable() {
  if (!state.dataset) return;
  const filtered = (typeof getTableRows === "function") ? getTableRows() : state.dataset.rows;
  renderTable(els.tableWrap, filtered, getVisibleFields(), onTableRowHover, onCellEdit, onRowDelete, onTableRowClick, getTableOpts());
}
els.btnTableCols?.addEventListener("click", () => {
  if (!state.dataset?.fields?.length) return;
  const hide = !els.tableColPicker.hidden;
  if (!hide) buildTableColPicker();
  els.tableColPicker.hidden = hide;
});

// Debounce table search input (Cycle 191): big datasets (1800+ rows) would
// re-render on every keystroke; 150 ms gives smooth typing while feeling
// instantaneous when the user pauses.
let _tableSearchTimer = null;
els.tableSearch?.addEventListener("input", () => {
  if (_tableSearchTimer) clearTimeout(_tableSearchTimer);
  _tableSearchTimer = setTimeout(() => {
    if (state.dataset) {
      const filtered = getTableRows();
      renderTable(els.tableWrap, filtered, getVisibleFields(), onTableRowHover, onCellEdit, onRowDelete, onTableRowClick, getTableOpts());
      updateTableSearchInfo(filtered.length);
    }
    _tableSearchTimer = null;
  }, 150);
});

// Show "N 件中 M 件マッチ" / "該当なし" only when the search box is non-empty.
function updateTableSearchInfo(matchedCount) {
  if (!els.tableSearchInfo) return;
  const q = (els.tableSearch?.value || "").trim();
  if (!q || !state.dataset) {
    els.tableSearchInfo.hidden = true;
    return;
  }
  const total = state.dataset.rows.length;
  if (matchedCount === 0) {
    els.tableSearchInfo.style.color = "#b91c1c";
    els.tableSearchInfo.textContent = `「${q}」に該当する地域はありません（全 ${total} 件中）`;
  } else {
    els.tableSearchInfo.style.color = "var(--muted)";
    els.tableSearchInfo.textContent = `「${q}」 — 全 ${total} 件中 ${matchedCount} 件マッチ`;
  }
  els.tableSearchInfo.hidden = false;
}

function onTableRowHover(id, isOn) {
  if (isOn) mapper.highlightById(id);
  else      mapper.clearHighlight();
}

function onTableRowClick(id) {
  // Pan + zoom the map to the clicked region (Cycle 179).
  if (state.level === "chocho") return; // town points: no polygon to zoom to
  mapper.zoomToFeature?.(id);
}

function onCellEdit(id, field, newValue) {
  const row = state.dataset?.rows.find(r => r.key === id);
  if (!row) return;
  row.values[field] = newValue;
  setSummary(`${row.name || "#"+id} の「${field}」を ${newValue == null ? "—" : newValue} に更新`, "success");
  refresh();
}

function onRowDelete(id) {
  if (!state.dataset) return;
  const idx = state.dataset.rows.findIndex(r => r.key === id);
  if (idx < 0) return;
  const removed = state.dataset.rows.splice(idx, 1)[0];
  // Keep any active filter consistent with the new dataset.
  if (state.filteredKeys instanceof Set) state.filteredKeys.delete(id);
  setSummary(`「${removed?.name || "#"+id}」を削除しました（残り ${state.dataset.rows.length}件）`, "success");
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

// Build a single break set from all values across the active series, so every
// frame uses the same color thresholds. Honors the current method/classes UI.
function computeTsLockedBreaks() {
  const s = tsState.series[tsState.baseIdx];
  if (!s || !state.dataset) { state.lockedBreaks = null; return; }
  const allVals = [];
  for (const p of s.points) {
    for (const r of state.dataset.rows) {
      const v = r.values[p.field];
      if (Number.isFinite(v)) allVals.push(v);
    }
  }
  if (allVals.length < 2) { state.lockedBreaks = null; return; }
  const manualBreaks = state.method === "manual"
    ? els.inputManualBreaks.value.split(/[,、\s]+/).map(t => parseFloat(t.replace(/,/g, ""))).filter(v => Number.isFinite(v))
    : null;
  const { breaks } = computeBreaks(allVals, state.classes, state.method, { manualBreaks });
  state.lockedBreaks = breaks;
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

// Tiny inline sparkline histogram for the data-quality table (Cycle 173).
// Returns an SVG string; empty when the column is constant.
function buildSparkline(values, width = 80, height = 12) {
  const v = values.filter(Number.isFinite);
  if (v.length < 2) return "";
  const min = Math.min(...v), max = Math.max(...v);
  if (min === max) return "";
  const bins = 15;
  const counts = new Array(bins).fill(0);
  const step = (max - min) / bins;
  for (const x of v) {
    let idx = Math.floor((x - min) / step);
    if (idx >= bins) idx = bins - 1;
    counts[idx]++;
  }
  const maxCount = Math.max(...counts);
  const barW = (width / bins) - 0.4;
  let svg = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" style="vertical-align:middle">`;
  counts.forEach((c, i) => {
    if (c === 0) return;
    const bx = (i / bins) * width;
    const bh = (c / maxCount) * height;
    svg += `<rect x="${bx.toFixed(1)}" y="${(height - bh).toFixed(1)}" width="${Math.max(1, barW).toFixed(1)}" height="${bh.toFixed(1)}" fill="#2563eb"/>`;
  });
  svg += `</svg>`;
  return svg;
}

function renderDataQuality() {
  if (!els.dataQuality || !state.dataset) return;
  const total = state.dataset.rows.length;
  // Duplicate-key detection (occurs after merges or hand-edited CSVs)
  const keyCounts = new Map();
  for (const r of state.dataset.rows) keyCounts.set(r.key, (keyCounts.get(r.key) || 0) + 1);
  const dupKeys = [...keyCounts.entries()].filter(([, c]) => c > 1);
  const lines = state.dataset.fields.map((f) => {
    let n = 0, missing = 0, hasZero = false;
    let mn = Infinity, mx = -Infinity;
    const vals = [];
    for (const r of state.dataset.rows) {
      const v = r.values[f];
      if (Number.isFinite(v)) {
        n++; vals.push(v);
        if (v < mn) mn = v; if (v > mx) mx = v;
        if (v === 0) hasZero = true;
      } else missing++;
    }
    const missingPct = (missing / total) * 100;
    const flag =
      missingPct >= 50 ? "🟥" :
      missingPct >= 20 ? "🟧" :
      missingPct > 0  ? "🟨" : "🟩";
    // IQR outlier count (Tukey 1.5×IQR)
    let outliers = 0;
    if (vals.length >= 4) {
      const sorted = vals.slice().sort((a, b) => a - b);
      const q = (p) => {
        const idx = (sorted.length - 1) * p;
        const lo = Math.floor(idx), hi = Math.ceil(idx);
        return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
      };
      const q1 = q(0.25), q3 = q(0.75);
      const iqr = q3 - q1;
      const wLo = q1 - 1.5 * iqr, wHi = q3 + 1.5 * iqr;
      for (const x of vals) if (x < wLo || x > wHi) outliers++;
    }
    const outlierPct = vals.length ? (outliers / vals.length) * 100 : 0;
    const outlierFlag = outlierPct >= 10
      ? `<span style="color:#dc2626;font-weight:700" title="外れ値 10%以上 — 分類選択に注意">⚠️</span>`
      : "";
    const zeroFlag = hasZero
      ? `<span title="0 を含む — 派生比率列で 0除算リスク" style="color:#d97706">÷0</span>`
      : "";
    const range = (mn === Infinity)
      ? "—"
      : `${formatNum(mn)} 〜 ${formatNum(mx)}`;
    const spark = buildSparkline(vals);
    return `<tr>` +
      `<td>${flag}</td>` +
      `<td>${escapeHtmlText(f)} ${zeroFlag}</td>` +
      `<td style="text-align:right">${n}</td>` +
      `<td style="text-align:right">${missing}<small style="color:var(--muted)"> (${missingPct.toFixed(0)}%)</small></td>` +
      `<td style="font-family:ui-monospace,monospace;font-size:10px;white-space:nowrap">${range}</td>` +
      `<td style="text-align:right">${outliers}${outlierFlag}</td>` +
      `<td style="text-align:center;padding:0 4px">${spark}</td>` +
      `</tr>`;
  });
  let banner = "";
  if (dupKeys.length) {
    const sample = dupKeys.slice(0, 3).map(([k, c]) => `${k}×${c}`).join(", ");
    banner = `<div style="background:#fef3c7;border:1px solid #fcd34d;color:#92400e;padding:4px 6px;border-radius:4px;margin-bottom:4px;font-size:11px">🔁 重複キー ${dupKeys.length}件 (例: ${sample})</div>`;
  }
  els.dataQuality.innerHTML =
    banner +
    `<table style="font-size:11px;border-collapse:collapse;width:100%">` +
    `<thead><tr><th></th><th style="text-align:left">列</th><th>有効</th><th>欠損</th><th>値域</th><th>外れ値</th><th>分布</th></tr></thead>` +
    `<tbody>${lines.join("")}</tbody></table>` +
    `<div style="margin-top:4px;color:var(--muted);font-size:10px">🟩 0% / 🟨 〜20% / 🟧 20-50% / 🟥 50%以上欠損  ·  外れ値 = IQR 1.5×外（Tukey）  ·  ÷0 = 値に 0 含む</div>`;
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

function exportAllStatsCsv() {
  if (!state.dataset || !state.dataset.fields.length) {
    setSummary("先にデータを読み込んでください", "warn");
    return;
  }
  const cols = [
    "フィールド", "n", "欠損", "合計", "平均", "中央値",
    "最小", "最大", "範囲", "Q1", "Q3", "IQR",
    "標準偏差", "標本SD(n-1)", "平均SE", "平均95%CI下", "平均95%CI上",
    "変動係数(%)", "歪度", "尖度(超過)", "最頻値",
  ];
  const fmt = (v, digits) => (v == null || !Number.isFinite(v)) ? "" : (digits != null ? v.toFixed(digits) : String(v));
  const lines = [cols.map(csvEscape).join(",")];
  for (const f of state.dataset.fields) {
    const values = state.dataset.rows.map(r => r.values[f]);
    const s = computeStats(values);
    const row = [
      f,
      fmt(s.n),
      fmt(s.missing),
      fmt(s.sum),
      fmt(s.mean),
      fmt(s.median),
      fmt(s.min),
      fmt(s.max),
      fmt(s.range),
      fmt(s.q1),
      fmt(s.q3),
      fmt(s.iqr),
      fmt(s.std),
      fmt(s.sampleStd),
      fmt(s.seMean),
      fmt(s.ciMeanLo),
      fmt(s.ciMeanHi),
      s.cv == null ? "" : (s.cv * 100).toFixed(1),
      fmt(s.skewness, 3),
      fmt(s.kurtosis, 3),
      fmt(s.mode),
    ];
    lines.push(row.map(csvEscape).join(","));
  }
  const csv = "﻿" + lines.join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `descriptive_stats_${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  setSummary(`${state.dataset.fields.length}列の基本統計を ${a.download} として保存しました`, "success");
}
els.btnStatsExport?.addEventListener("click", exportAllStatsCsv);

// Copy region list from a single class to clipboard (Cycle 188). Lets the
// user drill into "which 5 prefectures fall into the top class".
async function copyClassMembers(classIdx) {
  if (!state.dataset || !state.valueMap || !state.breaks) return;
  const members = [];
  const keys = new Set();
  for (const r of state.dataset.rows) {
    const v = state.valueMap.get(r.key);
    if (!Number.isFinite(v)) continue;
    const idx = classifyValue(v, state.breaks);
    if (idx === classIdx) {
      members.push({ name: r.name || `#${r.key}`, value: v });
      keys.add(r.key);
    }
  }
  if (members.length === 0) {
    setSummary(`第${classIdx + 1}階級に該当する地域はありません`, "warn"); return;
  }
  members.sort((a, b) => b.value - a.value);
  // Highlight on the map (Cycle 192) and auto-clear after 4 s so it's noticeable
  // without permanently locking the visualization.
  mapper.markOutliers(keys);
  setTimeout(() => mapper.clearOutlierMarks(), 4000);
  const tsv = members.map(m => `${m.name}\t${m.value}`).join("\n");
  try {
    await navigator.clipboard.writeText(tsv);
    setSummary(`第${classIdx + 1}階級の ${members.length} 件を地図ハイライト + クリップボードへコピー（4秒で解除）`, "success");
  } catch (e) {
    setSummary(`第${classIdx + 1}階級の ${members.length} 件を地図ハイライト（コピー失敗: ${e.message}）`, "warn");
  }
}

// Cycle 193: show Sturges + Freedman-Diaconis bin-count suggestions below the
// histogram bin input. Clicking either suggestion applies it.
function updateHistBinsHint(values) {
  if (!els.histBinsHint) return;
  const v = values.filter(Number.isFinite);
  if (v.length < 3) { els.histBinsHint.innerHTML = ""; return; }
  const n = v.length;
  const sturges = Math.max(3, Math.min(30, Math.ceil(Math.log2(n) + 1)));
  const sorted = v.slice().sort((a, b) => a - b);
  const q = (p) => {
    const idx = (n - 1) * p;
    const lo = Math.floor(idx), hi = Math.ceil(idx);
    return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
  };
  const iqr = q(0.75) - q(0.25);
  const range = sorted[n - 1] - sorted[0];
  let fd = sturges;
  if (iqr > 0 && range > 0) {
    const binWidth = 2 * iqr / Math.cbrt(n);
    fd = Math.max(3, Math.min(30, Math.ceil(range / binWidth)));
  }
  els.histBinsHint.innerHTML =
    `推奨: <a href="#" data-bin="${sturges}">Sturges=${sturges}</a> / ` +
    `<a href="#" data-bin="${fd}">FD=${fd}</a>`;
  els.histBinsHint.querySelectorAll("a[data-bin]").forEach(a => {
    a.addEventListener("click", (e) => {
      e.preventDefault();
      const b = parseInt(a.dataset.bin, 10);
      if (!b) return;
      els.histBins.value = String(b);
      refresh();
    });
  });
}

function suggestClassMethod(values) {
  if (!els.suggestMethod) return;
  const s = computeStats(values);
  if (s.skewness == null || s.kurtosis == null) {
    els.suggestMethod.hidden = true;
    return;
  }
  const skew = s.skewness;
  const kurt = s.kurtosis; // excess kurtosis (0 = normal)
  let recommend, label, reason;
  if (Math.abs(skew) < 0.5 && Math.abs(kurt) < 1) {
    recommend = "equal";
    label = "等値（等間隔）";
    reason = `歪度 ${skew.toFixed(2)} / 尖度 ${kurt.toFixed(2)} — 正規分布に近い`;
  } else if (Math.abs(skew) > 0.5 && Math.abs(kurt) > 1) {
    recommend = "jenks";
    label = "自然区分（Jenks）";
    reason = `歪度 ${skew.toFixed(2)} / 尖度 ${kurt.toFixed(2)} — 複峰性や重い裾の可能性`;
  } else if (skew > 1) {
    recommend = "quantile";
    label = "等量（分位数）";
    reason = `歪度 +${skew.toFixed(2)} — 右に強く裾を引く分布`;
  } else if (skew < -1) {
    recommend = "quantile";
    label = "等量（分位数）";
    reason = `歪度 ${skew.toFixed(2)} — 左に強く裾を引く分布`;
  } else {
    recommend = "quantile";
    label = "等量（分位数）";
    reason = `歪度 ${skew.toFixed(2)} / 尖度 ${kurt.toFixed(2)} — 汎用的に推奨`;
  }
  const isMatch = state.method === recommend;
  const cls = isMatch ? "suggest-method is-match" : "suggest-method";
  const icon = isMatch ? "✓" : "💡";
  const action = isMatch
    ? "現在の選択と一致"
    : `<button type="button" data-method="${recommend}">${label}に適用</button>`;
  els.suggestMethod.className = cls;
  els.suggestMethod.innerHTML = `<span>${icon} 推奨: <strong>${label}</strong> — ${reason}</span> ${action}`;
  els.suggestMethod.hidden = false;
  const btn = els.suggestMethod.querySelector("button[data-method]");
  if (btn) {
    btn.addEventListener("click", () => {
      els.selectMethod.value = recommend;
      state.method = recommend;
      els.rowManualBreaks.hidden = recommend !== "manual";
      els.hintManual.hidden = recommend !== "manual";
      refresh();
    });
  }
}

function renderStats(values) {
  const s = computeStats(values);
  suggestClassMethod(values);
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
    ["標本標準偏差 (n-1)", s.sampleStd != null ? formatNum(s.sampleStd) : "—"],
    ["平均の標準誤差 (SE)", s.seMean != null ? formatNum(s.seMean) : "—"],
    ["平均の 95% CI", (s.ciMeanLo != null && s.ciMeanHi != null) ? `[${formatNum(s.ciMeanLo)}, ${formatNum(s.ciMeanHi)}]` : "—"],
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
  els.fieldList.innerHTML = state.dataset.fields.map((f) => {
    const star = state.starredFields.has(f) ? "★" : "☆";
    const starClass = state.starredFields.has(f) ? "is-starred" : "";
    // Hover tooltip with quick stats (Cycle 185).
    const colVals = state.dataset.rows.map(r => r.values[f]);
    const s = computeStats(colVals);
    let tip = `${f}`;
    if (s.n > 0) {
      tip += `  ·  n=${s.n}`;
      if (s.missing > 0) tip += ` (欠損 ${s.missing})`;
      if (s.mean != null) tip += `\n平均 ${formatNum(s.mean)} / 中央値 ${formatNum(s.median)}`;
      if (s.min != null) tip += `\n範囲 [${formatNum(s.min)}, ${formatNum(s.max)}]`;
    } else {
      tip += "  ·  数値データなし";
    }
    const isCurrent = (state.field === f) ? " is-current" : "";
    return `<div class="fl-item${isCurrent}" title="${escapeHtmlText(tip)}"><span class="fl-name" data-pick="${escapeHtmlText(f)}">${escapeHtmlText(f)}</span>` +
      `<button class="${starClass}" data-star="${escapeHtmlText(f)}" title="お気に入り（選択肢の上部に表示）">${star}</button>` +
      `<button data-rename="${escapeHtmlText(f)}" title="列名を変更">✎</button>` +
      `<button data-f="${escapeHtmlText(f)}" title="この列を削除">×</button></div>`;
  }).join("");
  els.fieldList.querySelectorAll("button[data-f]").forEach(btn => {
    btn.addEventListener("click", () => deleteField(btn.dataset.f));
  });
  els.fieldList.querySelectorAll("button[data-rename]").forEach(btn => {
    btn.addEventListener("click", () => renameField(btn.dataset.rename));
  });
  els.fieldList.querySelectorAll("button[data-star]").forEach(btn => {
    btn.addEventListener("click", () => toggleStarField(btn.dataset.star));
  });
  // Quick switch on field name click (Cycle 186)
  els.fieldList.querySelectorAll("[data-pick]").forEach(sp => {
    sp.addEventListener("click", () => {
      const f = sp.dataset.pick;
      if (state.field === f) return;
      state.field = f;
      if (els.selectField) els.selectField.value = f;
      refresh();
    });
  });
}

function toggleStarField(field) {
  if (state.starredFields.has(field)) state.starredFields.delete(field);
  else state.starredFields.add(field);
  // Re-populate every field selector to reflect the new ordering.
  populateFieldSelects();
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
  // Cycle 180: starred fields rise to the top of every selector, with a ★
  // prefix in the option label so the favorite status is obvious mid-select.
  const starredFirst = (arr) => {
    const starred = arr.filter(f => state.starredFields.has(f));
    const rest    = arr.filter(f => !state.starredFields.has(f));
    return [...starred, ...rest];
  };
  const sorted = starredFirst(fields);
  for (const sel of [els.selectField, els.selectFieldB, els.derivedA, els.derivedB, els.filterField, els.ctRow, els.ctCol]) {
    const prev = sel.value;
    sel.innerHTML = "";
    for (const f of sorted) {
      const o = document.createElement("option");
      o.value = f;
      o.textContent = state.starredFields.has(f) ? `★ ${f}` : f;
      sel.appendChild(o);
    }
    if (sorted.includes(prev)) sel.value = prev;
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
// Unary ops (Cycle 126): operate on a single column. log/sqrt return null for
// non-positive values; recip returns null for 0.
const OP_UNARY_FN = {
  log10:  (a) => a > 0 ? Math.log10(a) : null,
  ln:     (a) => a > 0 ? Math.log(a)   : null,
  sqrt:   (a) => a >= 0 ? Math.sqrt(a) : null,
  abs:    (a) => Math.abs(a),
  square: (a) => a * a,
  recip:  (a) => a === 0 ? null : 1 / a,
};
const OP_UNARY_NAME = {
  log10: "log10", ln: "ln", sqrt: "√", abs: "|·|", square: "²", recip: "1/",
};
function isUnaryOp(op) { return Object.prototype.hasOwnProperty.call(OP_UNARY_FN, op); }

function addDerivedField() {
  if (!state.dataset) return;
  const a = els.derivedA.value, b = els.derivedB.value, op = els.derivedOp.value;
  const explicit = els.derivedName.value.trim();
  const unary = isUnaryOp(op);
  const defaultName = unary
    ? (op === "square" ? `${a}²` : op === "recip" ? `1/${a}` : op === "abs" ? `|${a}|` : `${OP_UNARY_NAME[op]}(${a})`)
    : `${a} ${OP_SYM[op]} ${b}`;
  const name = explicit || defaultName;
  if (state.dataset.fields.includes(name)) {
    setSummary(`列「${name}」はすでに存在します`, "warn"); return;
  }
  if (unary) {
    const ufn = OP_UNARY_FN[op];
    for (const r of state.dataset.rows) {
      const va = r.values[a];
      r.values[name] = Number.isFinite(va) ? ufn(va) : null;
    }
  } else {
    const fn = OP_FN[op];
    for (const r of state.dataset.rows) {
      const va = r.values[a], vb = r.values[b];
      r.values[name] = (Number.isFinite(va) && Number.isFinite(vb)) ? fn(va, vb) : null;
    }
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
  if (els.scatterSizeBy) {
    const prev = els.scatterSizeBy.value;
    els.scatterSizeBy.innerHTML = '<option value="">— なし（固定）—</option>';
    for (const f of fields) {
      const o = document.createElement("option");
      o.value = f; o.textContent = f;
      els.scatterSizeBy.appendChild(o);
    }
    if (fields.includes(prev)) els.scatterSizeBy.value = prev;
  }
  // Cycle 206: label-by selector — picks an arbitrary column whose value
  // replaces the default name() label per point.
  if (els.scatterLabelBy) {
    const prev = els.scatterLabelBy.value;
    els.scatterLabelBy.innerHTML = '<option value="">— 地域名（既定）—</option>';
    for (const f of fields) {
      const o = document.createElement("option");
      o.value = f; o.textContent = f;
      els.scatterLabelBy.appendChild(o);
    }
    if (fields.includes(prev)) els.scatterLabelBy.value = prev;
  }
  // Cycle 219: shape-by selector — bucket points into circle/square/triangle/
  // diamond/cross by an arbitrary categorical column (max 4 distinct + "other").
  if (els.scatterShapeBy) {
    const prev = els.scatterShapeBy.value;
    els.scatterShapeBy.innerHTML = '<option value="">— なし（○のみ）—</option>';
    for (const f of fields) {
      const o = document.createElement("option");
      o.value = f; o.textContent = f;
      els.scatterShapeBy.appendChild(o);
    }
    if (fields.includes(prev)) els.scatterShapeBy.value = prev;
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
  // Cycle 206: if user picked a label column, substitute its values for the
  // default region name. Numeric values are passed through formatNum for a
  // legible label; null/empty cells fall back to the region name so the
  // point isn't unlabelled.
  const labelByField = els.scatterLabelBy?.value || "";
  const names = labelByField
    ? state.dataset.rows.map(r => {
        const v = r.values[labelByField];
        if (v == null || v === "") return r.name || ("#" + r.key);
        return typeof v === "number" ? formatNum(v) : String(v);
      })
    : state.dataset.rows.map(r => r.name || ("#" + r.key));
  // Optional 3rd-variable categorical coloring. If the chosen column is numeric,
  // bin into quartile labels (Q1/Q2/Q3/Q4) so it still renders as discrete series.
  const colorByField = els.scatterColorBy?.value || "";
  let categoryFor = null;
  let welchResult = null;  // populated below when exactly 2 categories exist
  let anovaResult = null;  // populated when 3+ categories exist (Cycle 139)
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
    // Welch's t-test (Cycle 138): if categoryFor produces exactly 2 distinct
    // categories, compare Y values between the two groups.
    if (categoryFor) {
      const groupY = new Map();
      for (const r of state.dataset.rows) {
        const yv = r.values[yf];
        if (!Number.isFinite(yv)) continue;
        const cat = categoryFor(r.key);
        if (cat == null) continue;
        if (!groupY.has(cat)) groupY.set(cat, []);
        groupY.get(cat).push(yv);
      }
      if (groupY.size === 2) {
        const [[k1, a1], [k2, a2]] = [...groupY.entries()];
        if (a1.length >= 2 && a2.length >= 2) {
          welchResult = welchTTest(a1, a2, k1, k2);
        }
      } else if (groupY.size >= 3) {
        anovaResult = onewayAnova(groupY);
        // Bonferroni-corrected pairwise Welch's t-tests when ANOVA is
        // significant — Cycle 170 (post-hoc comparison).
        if (anovaResult && anovaResult.pValue != null && anovaResult.pValue < 0.05) {
          anovaResult.posthoc = bonferroniPairwise(groupY);
        }
      }
    }
  }
  // Size-by-field: third dimension as point radius (3..10 px).
  const sizeField = els.scatterSizeBy?.value || "";
  let sizeFor = null;
  let sizeLegend = null;
  if (sizeField) {
    const sizeMap = new Map(state.dataset.rows.map(r => [r.key, r.values[sizeField]]));
    const sizeVals = [...sizeMap.values()].filter(v => Number.isFinite(v));
    if (sizeVals.length >= 2) {
      const smn = Math.min(...sizeVals), smx = Math.max(...sizeVals);
      const range = smx - smn || 1;
      sizeFor = (id) => {
        const v = sizeMap.get(id);
        if (!Number.isFinite(v)) return 3;
        return 3 + 7 * ((v - smn) / range);
      };
      sizeLegend = { fieldName: sizeField, min: smn, max: smx };
    }
  }
  // Cycle 219: build a categorical → shape function from the optional
  // shape-by column. First 4 distinct categories get circle/square/
  // triangle/diamond; further categories collapse to "cross".
  let shapeFor = null;
  let shapeLegend = null;
  const shapeByField = els.scatterShapeBy?.value || "";
  if (shapeByField) {
    const rowsByKey = new Map(state.dataset.rows.map(r => [r.key, r]));
    const order = ["circle", "square", "triangle", "diamond"];
    const map = new Map();
    for (const r of state.dataset.rows) {
      const v = r.values[shapeByField];
      if (v == null || v === "") continue;
      const k = String(v);
      if (map.has(k)) continue;
      map.set(k, order[map.size] || "cross");
    }
    shapeFor = (id) => {
      const row = rowsByKey.get(id);
      if (!row) return "circle";
      const v = row.values[shapeByField];
      if (v == null || v === "") return "circle";
      return map.get(String(v)) || "circle";
    };
    // Cycle 220: emit a small legend (max 5 entries; further cats collapse).
    const entries = [...map.entries()];
    shapeLegend = entries.slice(0, 4).map(([name, shape]) => ({ name, shape }));
    if (entries.length > 4) shapeLegend.push({ name: "他", shape: "cross" });
  }
  const scatterResult = renderScatter(els.scatterSvg, xs, ys, xf, yf, ids, onScatterHover, onScatterClick, {
    logX: els.chkScatterLogX.checked,
    logY: els.chkScatterLogY.checked,
    statsOverlay: !!els.chkScatterStats?.checked,
    regCI: !!els.chkScatterCi?.checked,
    regPI: !!els.chkScatterPi?.checked,
    yEqualsX: !!els.chkScatterYx?.checked,
    zeroLines: !!els.chkScatterZero?.checked,
    jitter: !!els.chkScatterJitter?.checked,
    lowess: !!els.chkScatterLowess?.checked,
    labels: els.scatterLabels?.value || "outliers",
    labelTopN: parseInt(els.scatterLabelN?.value || "10", 10) || 10,
    labelPlace: els.scatterLabelPlace?.value || "auto",
    pinnedIds: state.pinnedScatterIds instanceof Set ? state.pinnedScatterIds : null,
    pinColor: els.scatterPinColor?.value || "#dc2626",
    shapeFor,
    shapeLegend,
    regressionByGroup: !!els.chkScatterRegGroup?.checked,
    titleStats: !!els.chkScatterStatsTitle?.checked,
    degree: parseInt(els.scatterDegree?.value || "1", 10) || 1,
    onBrush: (ids) => {
      mapper.markOutliers(ids);
      // Cycle 238: remember the brush selection so the user can promote it
      // into permanent pins via the dedicated button.
      state.lastBrushIds = new Set(ids);
      syncBrushPinBtn();
      setSummary(`${ids.size} 件を地図でハイライト中（散布図 brush 選択）`, "success");
    },
    sizeFor,
    sizeLegend,
  }, colorFor, names, categoryFor);
  const { r, rho, rCI, rhoCI, n, slope, intercept, r2, degree, coeffs, polyR2, sse, aic, bic } = scatterResult;
  state.scatterStats = {
    xf, yf, n, r, rCI, rho, rhoCI, slope, intercept, r2,
    degree, coeffs, polyR2, sse, aic, bic,
    logX: !!els.chkScatterLogX?.checked, logY: !!els.chkScatterLogY?.checked,
  };
  if (els.scatterCsv) els.scatterCsv.disabled = (r == null);
  if (els.scatterDataCsv) els.scatterDataCsv.disabled = !state.dataset;
  if (r == null) {
    els.scatterCorr.textContent = `n=${n} — 相関係数を計算できません`;
    return;
  }
  const strength = Math.abs(r) >= 0.7 ? "強い" : Math.abs(r) >= 0.4 ? "中程度の" : "弱い";
  const sign = r >= 0 ? "正" : "負";
  const r2 = (r * r * 100).toFixed(1);
  const ciTxt = (ci) => ci == null
    ? ""
    : ` <small style="color:var(--muted)">[${ci[0].toFixed(3)}, ${ci[1].toFixed(3)}]</small>`;
  const rhoTxt = rho == null
    ? ""
    : ` · スピアマン順位相関 <strong>ρ=${rho.toFixed(3)}</strong>${ciTxt(rhoCI)}`;
  // Hint at non-linear monotonic relationship when ρ noticeably exceeds r.
  const note = (rho != null && Math.abs(rho) - Math.abs(r) > 0.15)
    ? ` <small style="color:#b45309">（ρ ≫ r：単調非線形の可能性）</small>`
    : "";
  const polyInfo = (degree > 1 && polyR2 != null)
    ? ` · <small style="color:#475569">多項式${degree}次 R²=${(polyR2*100).toFixed(1)}%, AIC=${aic == null ? "—" : aic.toFixed(1)}</small>`
    : "";
  let welchInfo = "";
  if (welchResult) {
    const w = welchResult;
    const sig = w.pValue < 0.001 ? " ***" : w.pValue < 0.01 ? " **" : w.pValue < 0.05 ? " *" : "";
    const pFmt = w.pValue < 0.001 ? "< 0.001" : w.pValue.toFixed(3);
    welchInfo = ` · <small style="color:#1e3a8a">Welch t-test: ${escapeHtmlText(w.label1)} (n=${w.n1}, μ=${formatNum(w.mean1)}) vs ${escapeHtmlText(w.label2)} (n=${w.n2}, μ=${formatNum(w.mean2)}) → t(${w.df.toFixed(1)})=${w.t.toFixed(2)}, p=${pFmt}${sig}</small>`;
  } else if (anovaResult) {
    const av = anovaResult;
    const sig = av.pValue < 0.001 ? " ***" : av.pValue < 0.01 ? " **" : av.pValue < 0.05 ? " *" : "";
    const pFmt = av.pValue < 0.001 ? "< 0.001" : av.pValue.toFixed(3);
    welchInfo = ` · <small style="color:#1e3a8a">一元ANOVA (k=${av.k}, N=${av.N}): F(${av.df1}, ${av.df2})=${av.F.toFixed(2)}, p=${pFmt}${sig}, η²=${av.eta2.toFixed(3)}</small>`;
    // Post-hoc Bonferroni-corrected pairwise comparisons (Cycle 170)
    if (av.posthoc && av.posthoc.length) {
      const sigPairs = av.posthoc.filter(p => p.sig);
      const nsigPairs = av.posthoc.filter(p => !p.sig);
      const fmtPair = (p) => `${escapeHtmlText(p.label1)} vs ${escapeHtmlText(p.label2)} (p<sub>adj</sub>=${p.pAdj < 0.001 ? "<0.001" : p.pAdj.toFixed(3)})${p.sig}`;
      const shown = sigPairs.slice(0, 8).map(fmtPair).join("、 ");
      const hidden = sigPairs.length > 8 ? `、…他${sigPairs.length - 8}件` : "";
      const summary = sigPairs.length === 0
        ? `<small style="color:#475569">事後検定（Bonferroni）: 有意ペアなし (${av.posthoc.length}ペア中)</small>`
        : `<small style="color:#1e3a8a">事後検定（Bonferroni, ${sigPairs.length}/${av.posthoc.length} ペア有意）: ${shown}${hidden}</small>`;
      welchInfo += ` <br/>${summary}`;
    }
  }
  els.scatterCorr.innerHTML = `n=${n} · ピアソン相関 <strong>r=${r.toFixed(3)}</strong>${ciTxt(rCI)} （${strength}${sign}の相関）${rhoTxt}${note} · 決定係数 R²=${r2}%${polyInfo}${welchInfo}`;

  // Cycle 224: silent Simpson's paradox detection. Whenever a color-by
  // category column is set, quietly compute per-group slopes and prepend an
  // alert above the scatter when ≥1 group's slope sign disagrees with the
  // overall slope. Skipped when the group-regression toggle is ON (the
  // Cycle 222 table already surfaces the warning).
  if (categoryFor && !els.chkScatterRegGroup?.checked && Number.isFinite(slope)) {
    const flipped = [];
    const groups = new Map();
    for (let i = 0; i < ids.length; i++) {
      const xv = xs[i], yv = ys[i];
      if (!Number.isFinite(xv) || !Number.isFinite(yv)) continue;
      const cat = categoryFor(ids[i]);
      if (cat == null || cat === "") continue;
      const key = String(cat);
      if (!groups.has(key)) groups.set(key, { xs: [], ys: [] });
      const g = groups.get(key);
      g.xs.push(xv); g.ys.push(yv);
    }
    for (const [cat, g] of groups) {
      if (g.xs.length < 3) continue;
      const m = g.xs.reduce((a, b) => a + b, 0) / g.xs.length;
      const my = g.ys.reduce((a, b) => a + b, 0) / g.ys.length;
      let num = 0, den = 0;
      for (let i = 0; i < g.xs.length; i++) {
        num += (g.xs[i] - m) * (g.ys[i] - my);
        den += (g.xs[i] - m) ** 2;
      }
      if (den === 0) continue;
      const gs = num / den;
      if (Number.isFinite(gs) && Math.sign(gs) !== Math.sign(slope)) flipped.push(cat);
    }
    if (flipped.length) {
      const sample = flipped.slice(0, 3).map(escapeHtmlText).join(", ");
      const more = flipped.length > 3 ? ` ほか${flipped.length - 3}件` : "";
      els.scatterCorr.innerHTML +=
        `<div style="margin-top:4px;color:#b45309;font-size:11px">` +
        `⚠ 色分け列でグループ化すると ${flipped.length} カテゴリ ` +
        `(${sample}${more}) で傾向が逆転 — 「系列別回帰線」を ON にして確認してください` +
        `</div>`;
    }
  }

  // Cycle 222: group regression comparison table (Simpson's paradox check).
  // Computes per-category slope/intercept/r/n from the same xs/ys arrays the
  // chart uses, then renders below the scatter buttons.
  renderGroupRegressionTable(xf, yf, xs, ys, ids, categoryFor, !!els.chkScatterRegGroup?.checked, slope);
}
function renderGroupRegressionTable(xf, yf, xs, ys, ids, categoryFor, enabled, overallSlope) {
  const host = els.scatterGroupReg;
  if (!host) return;
  const setCsvVis = (visible) => {
    if (els.rowGroupRegCsv) els.rowGroupRegCsv.hidden = !visible;
  };
  if (!enabled || !categoryFor) {
    host.hidden = true; host.innerHTML = "";
    state.scatterGroupReg = null;
    setCsvVis(false);
    return;
  }
  // Bucket valid (x,y) pairs by category.
  const groups = new Map();
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    const xv = xs[i], yv = ys[i];
    if (!Number.isFinite(xv) || !Number.isFinite(yv)) continue;
    const cat = categoryFor(id);
    if (cat == null || cat === "") continue;
    const key = String(cat);
    if (!groups.has(key)) groups.set(key, { xs: [], ys: [] });
    groups.get(key).xs.push(xv);
    groups.get(key).ys.push(yv);
  }
  if (!groups.size) {
    host.hidden = true; host.innerHTML = "";
    state.scatterGroupReg = null;
    setCsvVis(false);
    return;
  }
  // OLS per group + Pearson r for each.
  const olsLocal = (xa, ya) => {
    const n = xa.length;
    const mx = xa.reduce((a, b) => a + b, 0) / n;
    const my = ya.reduce((a, b) => a + b, 0) / n;
    let num = 0, den = 0;
    for (let i = 0; i < n; i++) { num += (xa[i] - mx) * (ya[i] - my); den += (xa[i] - mx) ** 2; }
    if (den === 0) return null;
    const slope = num / den;
    return { slope, intercept: my - slope * mx };
  };
  const pearsonLocal = (xa, ya) => {
    const n = xa.length;
    const mx = xa.reduce((a, b) => a + b, 0) / n;
    const my = ya.reduce((a, b) => a + b, 0) / n;
    let num = 0, dx = 0, dy = 0;
    for (let i = 0; i < n; i++) { num += (xa[i] - mx) * (ya[i] - my); dx += (xa[i] - mx) ** 2; dy += (ya[i] - my) ** 2; }
    if (dx === 0 || dy === 0) return null;
    return num / Math.sqrt(dx * dy);
  };
  const rows = [];
  let signFlip = false;
  for (const [cat, g] of groups) {
    if (g.xs.length < 3) { rows.push({ cat, n: g.xs.length, skip: true }); continue; }
    const o = olsLocal(g.xs, g.ys);
    const pr = pearsonLocal(g.xs, g.ys);
    if (!o) { rows.push({ cat, n: g.xs.length, skip: true }); continue; }
    // Cycle 233: keep raw arrays for the optional slope-difference test below.
    rows.push({ cat, n: g.xs.length, slope: o.slope, intercept: o.intercept, r: pr, xs: g.xs.slice(), ys: g.ys.slice() });
    if (Number.isFinite(overallSlope) && Number.isFinite(o.slope) && Math.sign(overallSlope) !== Math.sign(o.slope)) {
      signFlip = true;
    }
  }
  if (!rows.length) {
    host.hidden = true; host.innerHTML = "";
    state.scatterGroupReg = null;
    setCsvVis(false);
    return;
  }
  // Stash for CSV export.
  state.scatterGroupReg = { xf, yf, rows, overallSlope, signFlip };
  let html = `<div style="margin-bottom:3px;font-weight:600">系列別回帰 (${escapeHtmlText(yf)} = a·${escapeHtmlText(xf)} + b)</div>`;
  html += `<table style="border-collapse:collapse;width:100%"><thead><tr style="background:#e2e8f0">` +
    `<th style="text-align:left;padding:2px 4px">カテゴリ</th>` +
    `<th style="text-align:right;padding:2px 4px">n</th>` +
    `<th style="text-align:right;padding:2px 4px">a (傾き)</th>` +
    `<th style="text-align:right;padding:2px 4px">b (切片)</th>` +
    `<th style="text-align:right;padding:2px 4px">r</th></tr></thead><tbody>`;
  for (const row of rows) {
    if (row.skip) {
      html += `<tr><td style="padding:2px 4px">${escapeHtmlText(row.cat)}</td><td style="text-align:right;padding:2px 4px">${row.n}</td><td colspan="3" style="text-align:right;padding:2px 4px;color:#94a3b8">n&lt;3 → 計算スキップ</td></tr>`;
      continue;
    }
    const flip = Number.isFinite(overallSlope) && Math.sign(overallSlope) !== Math.sign(row.slope);
    const bg = flip ? "background:#fef3c7" : "";
    html += `<tr style="${bg}">` +
      `<td style="padding:2px 4px">${escapeHtmlText(row.cat)}</td>` +
      `<td style="text-align:right;padding:2px 4px">${row.n}</td>` +
      `<td style="text-align:right;padding:2px 4px">${row.slope.toFixed(3)}</td>` +
      `<td style="text-align:right;padding:2px 4px">${row.intercept.toFixed(3)}</td>` +
      `<td style="text-align:right;padding:2px 4px">${row.r == null ? "—" : row.r.toFixed(3)}</td>` +
      `</tr>`;
  }
  html += `</tbody></table>`;
  if (signFlip) {
    html += `<div style="color:#b45309;margin-top:3px">⚠ 全体回帰と符号が逆転するグループあり（Simpson's paradox の可能性）</div>`;
  }
  // Cycle 233: when exactly 2 groups have valid OLS fits, run a Welch-style
  // t-test of slope difference. Stat formula:
  //   SE_slope_i² = MSE_i / Sxx_i  where MSE_i = RSS_i / (n_i - 2)
  //   t = (a1 - a2) / sqrt(SE1² + SE2²),  df = n1 + n2 - 4
  const valid = rows.filter(r => !r.skip && r.xs && r.ys);
  let slopeTest = null;
  if (valid.length === 2) {
    const [g1, g2] = valid;
    const seSlope = (g) => {
      const n = g.xs.length;
      const mx = g.xs.reduce((a, b) => a + b, 0) / n;
      let sxx = 0, rss = 0;
      for (let i = 0; i < n; i++) {
        sxx += (g.xs[i] - mx) ** 2;
        const yhat = g.slope * g.xs[i] + g.intercept;
        rss += (g.ys[i] - yhat) ** 2;
      }
      if (sxx === 0 || n < 3) return null;
      const mse = rss / (n - 2);
      return Math.sqrt(mse / sxx);
    };
    const se1 = seSlope(g1), se2 = seSlope(g2);
    if (Number.isFinite(se1) && Number.isFinite(se2)) {
      const dSlope = g1.slope - g2.slope;
      const seDiff = Math.sqrt(se1 * se1 + se2 * se2);
      if (seDiff > 0) {
        const t = dSlope / seDiff;
        const df = g1.xs.length + g2.xs.length - 4;
        const p = (df > 0 && typeof studentTCdfAbs === "function")
          ? 2 * (1 - studentTCdfAbs(Math.abs(t), df))
          : null;
        slopeTest = { cat1: g1.cat, cat2: g2.cat, dSlope, seDiff, t, df, p };
      }
    }
  }
  if (slopeTest) {
    const s = slopeTest;
    const sig = s.p == null ? ""
      : s.p < 0.001 ? " ***"
      : s.p < 0.01 ? " **"
      : s.p < 0.05 ? " *" : "";
    const pFmt = s.p == null ? "—"
      : s.p < 0.001 ? "&lt; 0.001"
      : s.p.toFixed(3);
    html += `<div style="margin-top:4px;color:#1e3a8a">2群の傾き差検定: ` +
      `Δa(${escapeHtmlText(s.cat1)} − ${escapeHtmlText(s.cat2)}) = ${s.dSlope.toFixed(3)} ` +
      `(SE=${s.seDiff.toFixed(3)}), t(${s.df})=${s.t.toFixed(2)}, p=${pFmt}${sig}` +
      `</div>`;
  }
  host.innerHTML = html;
  host.hidden = false;
  setCsvVis(true);
  // Stash for CSV/Markdown consumers (Cycle 230 onward).
  state.scatterGroupReg.slopeTest = slopeTest;
}

// Cycle 223: CSV export of the per-group regression table from state.scatterGroupReg.
els.btnGroupRegCsv?.addEventListener("click", () => {
  const gr = state.scatterGroupReg;
  if (!gr || !gr.rows || !gr.rows.length) {
    setSummary("系列別回帰テーブルがありません", "warn"); return;
  }
  const header = ["category", "n", "slope", "intercept", "r", "flip_vs_overall", "note"];
  const esc = (c) => {
    const s = String(c ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const body = gr.rows.map((row) => {
    if (row.skip) {
      return [row.cat, row.n, "", "", "", "", "n<3 skipped"];
    }
    const flip = Number.isFinite(gr.overallSlope) && Math.sign(gr.overallSlope) !== Math.sign(row.slope) ? "yes" : "no";
    return [
      row.cat, row.n,
      row.slope.toFixed(6), row.intercept.toFixed(6),
      row.r == null ? "" : row.r.toFixed(6),
      flip, "",
    ];
  });
  const lines = [header, ...body];
  // Cycle 234: append the slope-diff t-test as an extra annotated row when present.
  if (gr.slopeTest) {
    const s = gr.slopeTest;
    const note = `slope_diff_test: ${s.cat1} - ${s.cat2} (t(${s.df})=${s.t.toFixed(3)}, p=${s.p == null ? "" : s.p.toFixed(4)})`;
    lines.push(["__test__", "", s.dSlope.toFixed(6), "", "", "", note]);
  }
  const csv = lines.map(line => line.map(esc).join(",")).join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const norm = (s) => String(s).replace(/[\s\\/:*?"<>|]+/g, "_");
  const a = document.createElement("a");
  a.href = url;
  a.download = `scatter_group_reg_${norm(gr.yf)}_vs_${norm(gr.xf)}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  setSummary(`系列別回帰CSV: ${gr.rows.length} 行を保存${gr.signFlip ? "（符号逆転あり）" : ""}`, "success");
});

function onScatterHover(id, isHot) {
  if (isHot) mapper.highlightById(id);
  else       mapper.clearHighlight();
}
function onScatterClick(id, ev) {
  // Cycle 212: Shift+click toggles a "pin" → forces the point's label to
  // stay on across hovers and redraws. Plain click keeps the original
  // behaviour (zoom map + scroll table).
  if (ev && ev.shiftKey) {
    if (!(state.pinnedScatterIds instanceof Set)) state.pinnedScatterIds = new Set();
    if (state.pinnedScatterIds.has(id)) state.pinnedScatterIds.delete(id);
    else state.pinnedScatterIds.add(id);
    syncScatterPinBtn();
    drawScatter();
    // Cycle 215: keep the table's pin highlight in sync.
    if (typeof refreshTable === "function") refreshTable();
    // Cycle 216: render the pin rings on the map too.
    mapper.markPinned(state.pinnedScatterIds, els.scatterPinColor?.value);
    return;
  }
  if (state.level !== "chocho") {
    // Town points have no polygon — skip the map zoom but still scroll the table.
    mapper.zoomToFeature(id);
  }
  // Also scroll the data table to the corresponding row (Cycle 187)
  const tr = els.tableWrap?.querySelector(`tr[data-id="${CSS.escape(String(id))}"]`);
  if (tr) {
    tr.scrollIntoView({ behavior: "smooth", block: "center" });
    tr.classList.add("is-flashed");
    setTimeout(() => tr.classList.remove("is-flashed"), 1500);
  }
  return;
}
function syncScatterPinBtn() {
  const count = state.pinnedScatterIds?.size || 0;
  if (els.btnScatterClearPins) {
    els.btnScatterClearPins.hidden = count === 0;
    els.btnScatterClearPins.textContent = `📌 ピン解除 (${count})`;
  }
  if (els.btnScatterPinsCsv) {
    els.btnScatterPinsCsv.hidden = count === 0;
  }
}
// Cycle 214: dump the pinned points (region + every field) to CSV. Mirrors
// the BOM/quoting convention used by the other CSV exports.
els.btnScatterPinsCsv?.addEventListener("click", () => {
  const pinned = state.pinnedScatterIds;
  if (!(pinned instanceof Set) || !pinned.size || !state.dataset) {
    setSummary("ピン留めされた点がありません", "warn"); return;
  }
  const fields = state.dataset.fields;
  const rows = state.dataset.rows.filter(r => pinned.has(r.key));
  const esc = (c) => {
    const s = String(c ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = ["id", "name", ...fields];
  const body = rows.map(r => [r.key, r.name ?? "", ...fields.map(f => r.values[f] ?? "")]);
  const csv = [header, ...body].map(line => line.map(esc).join(",")).join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `pinned_points_${rows.length}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  setSummary(`ピン点 ${rows.length} 件をCSVで保存しました`, "success");
});

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
// Copy the detail panel's contents to clipboard as TSV (Cycle 194).
document.getElementById("fd-copy")?.addEventListener("click", async () => {
  const name = fdName.textContent || "";
  const lines = [name];
  for (const row of fdTable.querySelectorAll("tr")) {
    const cells = row.querySelectorAll("td");
    if (cells.length === 2) {
      lines.push(`${cells[0].textContent}\t${cells[1].textContent}`);
    }
  }
  if (lines.length <= 1) {
    setSummary("コピー対象がありません", "warn"); return;
  }
  try {
    await navigator.clipboard.writeText(lines.join("\n"));
    setSummary(`「${name}」の詳細をクリップボードへコピー`, "success");
  } catch (e) {
    setSummary("コピー失敗: " + e.message, "error");
  }
});
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

// Stevens 3×3 bivariate palette (row=Y class, col=X class). The standard
// teal-pink scheme used in many cartography textbooks.
const BIVARIATE_PALETTE = [
  "#e8e8e8", "#ace4e4", "#5ac8c8", // Y=low,  X=low/mid/high
  "#dfb0d6", "#a5add3", "#5698b9", // Y=mid
  "#be64ac", "#8c62aa", "#3b4994", // Y=high
];

// Local Moran's I (LISA) — Cycle 130. 4-category cluster colors borrowed from
// the GeoDa convention so output is interchangeable with academic LISA maps.
const LISA_COLORS = { HH: "#d7191c", LL: "#2c7bb6", HL: "#fdae61", LH: "#abd9e9", NS: "#e5e7eb", NA: "#e5e7eb" };

function runLisa() {
  if (!state.geojson || !state.valueMap) return null;
  const centroids = mapper.getCentroids ? mapper.getCentroids() : null;
  if (!centroids) return null;
  // Collect (id, centroid, value) for regions with valid value AND centroid
  const items = [];
  for (const [id, c] of centroids.entries()) {
    const v = state.valueMap.get(id);
    if (Number.isFinite(v)) items.push({ id, lat: c[0], lng: c[1], v });
  }
  const n = items.length;
  if (n < 5) return null;
  const mean = items.reduce((s, it) => s + it.v, 0) / n;
  const std = Math.sqrt(items.reduce((s, it) => s + (it.v - mean) ** 2, 0) / n);
  if (!(std > 0)) return null;
  const z = items.map(it => (it.v - mean) / std);
  // KNN-8 by centroid distance. n×n loop is fine for ~50–2000 regions.
  const K = Math.min(8, n - 1);
  const neighbors = items.map((it, i) => {
    const dists = items.map((jt, j) => i === j ? Infinity : haversineDist(it.lat, it.lng, jt.lat, jt.lng));
    const idx = dists.map((d, k) => [d, k]).sort((a, b) => a[0] - b[0]).slice(0, K).map(p => p[1]);
    return idx;
  });
  // Local Moran's I_i = z_i × mean(z_neighbors). 4-quadrant classification.
  const obs = new Array(n);
  const meanZnbrs = new Array(n);
  let globalI = 0;
  for (let i = 0; i < n; i++) {
    meanZnbrs[i] = neighbors[i].reduce((s, j) => s + z[j], 0) / neighbors[i].length;
    obs[i] = z[i] * meanZnbrs[i];
    globalI += obs[i];
  }
  globalI /= n;

  // Permutation test (Cycle 131): shuffle the z values of *other* regions
  // PERM times, recompute I_i, and count how often |I_perm| >= |I_obs|.
  const PERM = 199;
  const counts = new Array(n).fill(0);
  const pool = z.slice();          // we sample from z minus self each iteration
  const buf  = new Array(K);
  for (let it = 0; it < PERM; it++) {
    // Fisher-Yates shuffle into a copy of `z`, then for each i sample K from
    // the shuffled pool excluding position i.
    const shuf = pool.slice();
    for (let k = shuf.length - 1; k > 0; k--) {
      const r = Math.floor(Math.random() * (k + 1));
      [shuf[k], shuf[r]] = [shuf[r], shuf[k]];
    }
    for (let i = 0; i < n; i++) {
      // pick first K positions that are not i
      let bIdx = 0;
      for (let p = 0; p < shuf.length && bIdx < K; p++) {
        if (p === i) continue;
        buf[bIdx++] = shuf[p];
      }
      let s = 0;
      for (let q = 0; q < bIdx; q++) s += buf[q];
      const Iperm = z[i] * (s / bIdx);
      if (Math.abs(Iperm) >= Math.abs(obs[i])) counts[i]++;
    }
  }

  // Build colored output. Pseudo p = (count + 1) / (PERM + 1).
  const ALPHA = 0.05;
  const colorById = new Map();
  const details = [];
  let sigCount = 0;
  const catTally = { HH: 0, LL: 0, HL: 0, LH: 0, NS: 0 };
  // Build a id → name lookup from current dataset for export richness.
  const nameById = new Map();
  for (const r of state.dataset.rows) nameById.set(r.key, r.name || `#${r.key}`);
  for (let i = 0; i < n; i++) {
    const p = (counts[i] + 1) / (PERM + 1);
    const isSig = p < ALPHA;
    let cat;
    if (!isSig) cat = "NS";
    else if (z[i] >= 0 && meanZnbrs[i] >= 0) cat = "HH";
    else if (z[i] <  0 && meanZnbrs[i] <  0) cat = "LL";
    else if (z[i] >= 0 && meanZnbrs[i] <  0) cat = "HL";
    else                                      cat = "LH";
    catTally[cat]++;
    if (isSig) sigCount++;
    colorById.set(items[i].id, LISA_COLORS[cat]);
    details.push({
      id: items[i].id,
      name: nameById.get(items[i].id) || `#${items[i].id}`,
      value: items[i].v,
      zScore: z[i],
      localMoranI: obs[i],
      pValue: p,
      category: cat,
    });
  }
  return { colorById, globalI, n, sigCount, catTally, perm: PERM, alpha: ALPHA, details, field: state.field };
}

function haversineDist(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const toRad = (d) => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function renderLisaLegend(container, result, withExport = false) {
  container.innerHTML = "";
  const { globalI, n, sigCount, catTally, perm, alpha } = result;
  const wrap = document.createElement("div");
  wrap.style.cssText = "font-size:11px;";
  const head = document.createElement("div");
  head.style.fontWeight = "600";
  head.style.marginBottom = "2px";
  head.textContent = `LISA クラスター (n=${n}, 全体 I=${globalI.toFixed(3)})`;
  wrap.appendChild(head);
  const sub = document.createElement("div");
  sub.style.cssText = "font-size:10px;color:var(--muted);margin-bottom:4px;";
  sub.textContent = `有意 ${sigCount}/${n} (p < ${alpha}, ${perm}回順列検定)`;
  wrap.appendChild(sub);
  const items = [
    ["HH", "ホットスポット（高×高）"],
    ["LL", "コールドスポット（低×低）"],
    ["HL", "高値の孤立（周囲は低）"],
    ["LH", "低値の孤立（周囲は高）"],
    ["NA", "有意でない (NS)"],
  ];
  for (const [k, desc] of items) {
    const cnt = catTally[k === "NA" ? "NS" : k] ?? 0;
    const row = document.createElement("div");
    row.style.cssText = "display:flex;align-items:center;gap:6px;padding:1px 0;";
    const sw = document.createElement("span");
    sw.style.cssText = `display:inline-block;width:14px;height:14px;background:${LISA_COLORS[k]};border:1px solid #cbd5e1;`;
    row.appendChild(sw);
    const lab = document.createElement("span");
    lab.innerHTML = `<strong>${k === "NA" ? "NS" : k}</strong> ${desc} <small style="color:var(--muted)">(${cnt}件)</small>`;
    row.appendChild(lab);
    wrap.appendChild(row);
  }
  if (withExport) {
    const btnRow = document.createElement("div");
    btnRow.style.cssText = "margin-top:6px;";
    const btn = document.createElement("button");
    btn.className = "btn";
    btn.style.fontSize = "11px";
    btn.textContent = "📥 LISA結果をCSV出力";
    btn.addEventListener("click", exportLisaCsv);
    btnRow.appendChild(btn);
    wrap.appendChild(btnRow);
  }
  container.appendChild(wrap);
}

function exportLisaCsv() {
  const r = state.lisaResult;
  if (!r || !r.details) { setSummary("先に LISA を実行してください", "warn"); return; }
  const fmt = (v, d = 6) => (v == null || !Number.isFinite(v)) ? "" : v.toFixed(d);
  const lines = [
    ["id", "地域", `値 (${r.field})`, "z-score", "Local Moran's I", "p値", "カテゴリ"].map(csvEscape).join(","),
  ];
  for (const d of r.details) {
    lines.push([
      String(d.id), d.name, fmt(d.value, 3), fmt(d.zScore, 4),
      fmt(d.localMoranI, 4), fmt(d.pValue, 4), d.category,
    ].map(csvEscape).join(","));
  }
  // Append summary block
  lines.push("");
  lines.push(["統計", "値"].map(csvEscape).join(","));
  lines.push(["全体 Moran's I", fmt(r.globalI, 4)].map(csvEscape).join(","));
  lines.push(["n", String(r.n)].map(csvEscape).join(","));
  lines.push(["有意件数 (p < " + r.alpha + ")", String(r.sigCount)].map(csvEscape).join(","));
  lines.push(["順列回数", String(r.perm)].map(csvEscape).join(","));
  for (const k of ["HH", "LL", "HL", "LH", "NS"]) {
    lines.push([k + " 件数", String(r.catTally[k] || 0)].map(csvEscape).join(","));
  }
  const csv = "﻿" + lines.join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const safe = (v) => String(v).replace(/[\s\\/:*?"<>|]+/g, "_");
  a.href = url;
  a.download = `lisa_${safe(r.field || "field")}_${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  setSummary(`LISA結果を ${a.download} として保存しました（${r.n}件）`, "success");
}

function renderBivariateLegend(container, palette9, fieldX, fieldY) {
  container.innerHTML = "";
  container.setAttribute("role", "img");
  container.setAttribute("aria-label", `凡例: ${fieldX} × ${fieldY}`);
  const wrap = document.createElement("div");
  wrap.style.cssText = "font-size:11px; display:flex; align-items:flex-end; gap:6px;";
  // Y-axis label rotated
  const yLab = document.createElement("div");
  yLab.style.cssText = "writing-mode:vertical-rl; transform:rotate(180deg); font-weight:600; text-align:center; padding:0 2px; flex-shrink:0;";
  yLab.textContent = `${fieldY} →`;
  wrap.appendChild(yLab);
  // 3x3 grid
  const grid = document.createElement("div");
  grid.style.cssText = "display:grid; grid-template-columns:repeat(3,16px); grid-template-rows:repeat(3,16px); gap:1px;";
  // Render top→bottom: row 0 = Y high, row 2 = Y low (visually intuitive)
  for (let row = 0; row < 3; row++) {
    const y = 2 - row;
    for (let x = 0; x < 3; x++) {
      const sw = document.createElement("div");
      sw.style.cssText = `width:16px;height:16px;background:${palette9[y * 3 + x]};border:1px solid #cbd5e1;`;
      sw.title = `X=${["低","中","高"][x]} / Y=${["低","中","高"][y]}`;
      grid.appendChild(sw);
    }
  }
  const colWrap = document.createElement("div");
  colWrap.style.cssText = "display:flex; flex-direction:column; gap:2px; align-items:center;";
  colWrap.appendChild(grid);
  const xLab = document.createElement("div");
  xLab.style.cssText = "font-weight:600;";
  xLab.textContent = `${fieldX} →`;
  colWrap.appendChild(xLab);
  wrap.appendChild(colWrap);
  container.appendChild(wrap);
}

// Welch's t-test for unequal-variance comparison of two independent samples.
// Returns { t, df, pValue, mean1, mean2, label1, label2, n1, n2 } or null.
function welchTTest(a, b, label1, label2) {
  const n1 = a.length, n2 = b.length;
  if (n1 < 2 || n2 < 2) return null;
  const m1 = a.reduce((s, v) => s + v, 0) / n1;
  const m2 = b.reduce((s, v) => s + v, 0) / n2;
  const v1 = a.reduce((s, v) => s + (v - m1) ** 2, 0) / (n1 - 1);
  const v2 = b.reduce((s, v) => s + (v - m2) ** 2, 0) / (n2 - 1);
  const se2 = v1 / n1 + v2 / n2;
  if (se2 <= 0) return null;
  const t = (m1 - m2) / Math.sqrt(se2);
  // Welch-Satterthwaite degrees of freedom
  const dfNum = se2 * se2;
  const dfDen = (v1 / n1) ** 2 / (n1 - 1) + (v2 / n2) ** 2 / (n2 - 1);
  const df = dfDen > 0 ? dfNum / dfDen : (n1 + n2 - 2);
  // Two-tailed p-value via the chi-square route: t² with df=1 numerator ≈
  // F(1, df) distribution. Use a direct approximation via regularized
  // incomplete beta function instead.
  const pValue = 2 * (1 - studentTCdfAbs(Math.abs(t), df));
  return { t, df, pValue, mean1: m1, mean2: m2, label1, label2, n1, n2, var1: v1, var2: v2 };
}

// One-way ANOVA (Cycle 139). Input: Map<category, Y[]>. Returns
// { F, df1, df2, pValue, eta2, k, N, groups: [{name, n, mean}] } or null.
function onewayAnova(groupMap) {
  const groups = [];
  let N = 0;
  let allSum = 0;
  for (const [name, arr] of groupMap.entries()) {
    if (arr.length < 1) continue;
    const n = arr.length;
    const sum = arr.reduce((s, v) => s + v, 0);
    const mean = sum / n;
    groups.push({ name, n, mean, arr, sum });
    N += n;
    allSum += sum;
  }
  const k = groups.length;
  if (k < 2 || N - k < 1) return null;
  const grand = allSum / N;
  let SSB = 0, SSW = 0;
  for (const g of groups) {
    SSB += g.n * (g.mean - grand) ** 2;
    for (const v of g.arr) SSW += (v - g.mean) ** 2;
  }
  if (SSW <= 0) return null;
  const df1 = k - 1;
  const df2 = N - k;
  const MSB = SSB / df1;
  const MSW = SSW / df2;
  const F = MSB / MSW;
  // P(F > f) = I_{df2/(df2+df1*F)}(df2/2, df1/2)
  const x = df2 / (df2 + df1 * F);
  const pValue = regularizedBeta(x, df2 / 2, df1 / 2);
  const eta2 = SSB / (SSB + SSW);
  return {
    F, df1, df2, pValue, eta2, k, N,
    groups: groups.map(g => ({ name: g.name, n: g.n, mean: g.mean })),
  };
}

// Bonferroni-corrected pairwise Welch's t-tests for post-hoc comparison
// (Cycle 170). Returns an array of { label1, label2, t, df, p, pAdj, sig }.
function bonferroniPairwise(groupMap) {
  const entries = [...groupMap.entries()];
  const K = entries.length;
  if (K < 2) return [];
  const numComparisons = K * (K - 1) / 2;
  const results = [];
  for (let i = 0; i < K; i++) {
    for (let j = i + 1; j < K; j++) {
      const w = welchTTest(entries[i][1], entries[j][1], entries[i][0], entries[j][0]);
      if (!w) continue;
      const pAdj = Math.min(1, w.pValue * numComparisons);
      results.push({
        label1: w.label1, label2: w.label2,
        n1: w.n1, n2: w.n2, mean1: w.mean1, mean2: w.mean2,
        t: w.t, df: w.df, p: w.pValue, pAdj,
        sig: pAdj < 0.001 ? "***" : pAdj < 0.01 ? "**" : pAdj < 0.05 ? "*" : "",
      });
    }
  }
  // Sort: significant first (by pAdj asc), then non-significant
  results.sort((a, b) => a.pAdj - b.pAdj);
  return results;
}

// Student-t one-sided CDF for |t|: P(T <= |t|) using the incomplete beta function.
// Returns a value in [0.5, 1].
function studentTCdfAbs(absT, df) {
  if (!(df > 0) || !(absT >= 0)) return 0.5;
  const x = df / (df + absT * absT);
  // 1 - 0.5 * I_x(df/2, 1/2)
  return 1 - 0.5 * regularizedBeta(x, df / 2, 0.5);
}

// Regularized incomplete beta I_x(a, b) via continued fraction (Numerical Recipes).
function regularizedBeta(x, a, b) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const lnBeta = logGamma(a) + logGamma(b) - logGamma(a + b);
  const front = Math.exp(Math.log(x) * a + Math.log(1 - x) * b - lnBeta) / a;
  // Continued fraction; symmetry trick for stability when x > (a+1)/(a+b+2).
  if (x > (a + 1) / (a + b + 2)) {
    return 1 - regularizedBeta(1 - x, b, a);
  }
  // Lentz's algorithm
  const EPS = 1e-12;
  let qab = a + b, qap = a + 1, qam = a - 1;
  let c = 1, d = 1 - qab * x / qap;
  if (Math.abs(d) < 1e-30) d = 1e-30;
  d = 1 / d;
  let h = d;
  for (let m = 1; m < 200; m++) {
    const m2 = 2 * m;
    let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < 1e-30) d = 1e-30;
    c = 1 + aa / c; if (Math.abs(c) < 1e-30) c = 1e-30;
    d = 1 / d; h *= d * c;
    aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
    d = 1 + aa * d; if (Math.abs(d) < 1e-30) d = 1e-30;
    c = 1 + aa / c; if (Math.abs(c) < 1e-30) c = 1e-30;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return front * h;
}

// Chi-square survival function P(X > x) for df degrees of freedom.
// Uses the regularized upper incomplete gamma function Q(df/2, x/2) via a
// continued-fraction expansion (Numerical Recipes algorithm, sufficient for
// p-values we display to 3 decimal places).
function chiSquareSurvival(x, df) {
  if (!(x > 0) || !(df > 0)) return 1;
  const a = df / 2;
  const xHalf = x / 2;
  if (xHalf < a + 1) {
    // Series expansion for P(a, x), then survival = 1 - P.
    let ap = a, sum = 1 / a, term = 1 / a;
    for (let n = 1; n < 200; n++) {
      ap++; term *= xHalf / ap; sum += term;
      if (Math.abs(term) < Math.abs(sum) * 1e-10) break;
    }
    const lnP = -xHalf + a * Math.log(xHalf) - logGamma(a);
    return Math.max(0, Math.min(1, 1 - sum * Math.exp(lnP)));
  } else {
    // Continued fraction for Q(a, x).
    let b = xHalf + 1 - a;
    let c = 1 / 1e-30;
    let d = 1 / b;
    let h = d;
    for (let i = 1; i < 200; i++) {
      const an = -i * (i - a);
      b += 2;
      d = an * d + b; if (Math.abs(d) < 1e-30) d = 1e-30;
      c = b + an / c; if (Math.abs(c) < 1e-30) c = 1e-30;
      d = 1 / d;
      const delta = d * c;
      h *= delta;
      if (Math.abs(delta - 1) < 1e-10) break;
    }
    const lnQ = -xHalf + a * Math.log(xHalf) - logGamma(a);
    return Math.max(0, Math.min(1, h * Math.exp(lnQ)));
  }
}

// Lanczos approximation to ln(Γ(z)).
function logGamma(z) {
  const g = 7;
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ];
  if (z < 0.5) {
    return Math.log(Math.PI / Math.sin(Math.PI * z)) - logGamma(1 - z);
  }
  z -= 1;
  let x = c[0];
  for (let i = 1; i < g + 2; i++) x += c[i] / (z + i);
  const t = z + g + 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}
