// =====================================================================
// main.js  -- App orchestration: state + DOM events
// =====================================================================

import { parseCsvText, loadCsvFile, loadSampleCsv, buildValueLookup, buildMuniIndex } from "./data.js";
import { computeBreaks } from "./classification.js";
import { getPalette } from "./color.js";
import { computeStats, formatNum } from "./stats.js";
import { renderLegend } from "./legend.js";
import { MandaraMap } from "./map.js";
import { exportPng, exportSvg } from "./export.js";
import { loadSettings, saveSettings } from "./settings.js";

// ----- State -----
const state = {
  level: "prefecture",   // "prefecture" | "municipality"
  dataset: null,         // { rows, fields, unmatched, level }
  field: null,
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

async function applyLevel(level) {
  state.level = level;
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
      mapper.setBaseGeo(g, {
        nameFor: (p) => {
          if (p.name_jp)
            return `${p.name_jp}（${p.pref_name || ""}）`;
          if (p.name_kata)
            return `${p.name_kata}（${p.pref_name || ""}）`;
          return `${p.name_en || "#"+p.id}（${p.pref_name || ""}）`;
        }
      });
      const jpCount = Object.keys(muniJpMap || {}).length;
      const fallbackCount = g.features.length - jpCount;
      els.hintLevel.innerHTML = `${g.features.length}市町村ロード済み（漢字 ${jpCount} / カタカナ ${fallbackCount}）。<br/>
        CSV: 1列目=日本語名 (例: <code>新宿区</code>) / 英語名 (例: <code>Chiyoda</code>) / id (例: <code>13001</code>)`;
    } else {
      state.muniIndex = null;
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
