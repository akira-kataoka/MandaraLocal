// =====================================================================
// data.js  -- CSV loading + region-key normalization
// =====================================================================
//
// Input CSV format:
//   Column 1 : region key  ( pref_code 1..47  OR  pref name like "東京都" / "Tokyo" )
//   Column 2..: numeric data columns
//
// Output: { rows: [{ key, name, values: {fieldName: number|null} }], fields: [string] }
// =====================================================================

import { PREF_CODE_TO_NAME, PREF_NAME_TO_CODE } from "./pref_table.js";

/**
 * Parse CSV text into a uniform dataset.
 *
 * @param text CSV text
 * @param opts.level  "prefecture" | "municipality"
 * @param opts.muniIndex  for municipality level — Map<string(lowercase name), id>
 *
 * For prefecture level:
 *   column 1 = pref name or pref code (1..47)
 *   column 2..N = numeric fields
 *
 * For municipality level:
 *   column 1 = municipality english name (matches GeoJSON shapeName)
 *              OR  the synthetic numeric id (prefCode*1000+seq)
 *              OR  "Tokyo,Chiyoda" style "pref,city" (then column 2 = city)
 *   column 2..N = numeric fields
 */
export function parseCsvText(text, opts = {}) {
  const level = opts.level || "prefecture";
  // Strip UTF-8 BOM if present, normalise line endings.
  let body = text;
  if (body.charCodeAt(0) === 0xFEFF) body = body.slice(1);
  body = body.replace(/\r\n?/g, "\n").trim();
  const parsed = Papa.parse(body, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false,
  });
  if (!parsed.data || !parsed.data.length) {
    throw new Error("CSVデータが空です。");
  }
  const headers = (parsed.meta.fields || []).map(h => h && h.trim());
  if (headers.length < 2) {
    throw new Error("CSVには少なくとも2列必要です（1列目=地域、2列目以降=数値）。");
  }
  // Reapply trimmed header names back onto every row so downstream lookups work.
  const trimRows = parsed.data.map(row => {
    const out = {};
    for (const k of Object.keys(row)) out[(k || "").trim()] = row[k];
    return out;
  });
  parsed.data.length = 0;
  parsed.data.push(...trimRows);
  const keyHeader = headers[0];
  const rawFields = headers.slice(1);
  // Keep only fields with >50% numeric values (drops auxiliary text columns
  // like "市区町村" / "都道府県" used purely for readability).
  const fields = rawFields.filter(f => {
    let num = 0, nonEmpty = 0;
    for (const row of parsed.data) {
      const v = row[f];
      if (v == null || String(v).trim() === "") continue;
      nonEmpty++;
      if (parseNumber(v) != null) num++;
    }
    return nonEmpty === 0 || num / nonEmpty >= 0.5;
  });

  const rows = [];
  const unmatched = [];

  for (const r of parsed.data) {
    const rawKey = String(r[keyHeader] ?? "").trim();
    if (!rawKey) continue;
    let code = null;
    let displayName = null;
    if (level === "chocho") {
      // chocho: match against the town-name index supplied by main.js
      const idx = opts.townIndex; // Map<normalized town name, {id,town}>
      if (idx) {
        const norm = rawKey.normalize("NFC").replace(/\s+/g, "");
        const stripped = norm.replace(/[0-9一二三四五六七八九十]+丁目?$/u, "");
        const hit = idx.get(norm) || idx.get(stripped);
        if (hit) { code = hit.id; displayName = hit.town; }
      }
    } else if (level === "municipality") {
      const m = resolveMuniId(rawKey, opts.muniIndex);
      if (m) { code = m.id; displayName = m.name; }
    } else {
      code = normalizeToPrefCode(rawKey);
      if (code != null) displayName = PREF_CODE_TO_NAME[code];
    }
    if (code == null) {
      unmatched.push(rawKey);
      continue;
    }
    const values = {};
    for (const f of fields) {
      const raw = r[f];
      const num = parseNumber(raw);
      values[f] = num;
    }
    rows.push({
      key: code,
      name: displayName,
      values,
    });
  }
  return { rows, fields, unmatched, level };
}

/**
 * Resolve a free-text key against the municipality index.
 * @param raw e.g. "Chiyoda" or "13001" or "Tokyo Chiyoda"
 * @param muniIndex Map<lowercase name_en, {id, name_en, pref_code, pref_name}>
 */
function resolveMuniId(raw, muniIndex) {
  if (!muniIndex) return null;
  const s = raw.trim().normalize("NFC");
  if (!s) return null;
  // Numeric id
  if (/^\d+$/.test(s)) {
    const id = parseInt(s, 10);
    for (const v of muniIndex.values()) if (v.id === id) return v;
    return null;
  }
  // Direct match (Japanese as-is, English lowercased)
  if (muniIndex.has(s)) return muniIndex.get(s);
  const lower = s.toLowerCase();
  if (muniIndex.has(lower)) return muniIndex.get(lower);
  // Without trailing 都/道/府/県/区/市/町/村
  const stripped = s.replace(/(都|道|府|県|区|市|町|村)$/u, "");
  if (stripped && muniIndex.has(stripped)) return muniIndex.get(stripped);
  // Try last token (e.g. "Tokyo Chiyoda" → "Chiyoda")
  const parts = lower.split(/[\s,;]+/);
  if (parts.length > 1) {
    const tail = parts[parts.length - 1];
    if (muniIndex.has(tail)) return muniIndex.get(tail);
  }
  return null;
}

function parseNumber(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).replace(/,/g, "").trim();
  if (s === "" || s === "-" || s.toLowerCase() === "na") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * Accept inputs:
 *   "13", "13", "東京都", "東京", "Tokyo", "Tokyo To"
 * Returns prefecture code 1..47 or null
 */
export function normalizeToPrefCode(raw) {
  const s = raw.trim();
  if (!s) return null;
  // Numeric pref code
  if (/^\d+$/.test(s)) {
    const n = parseInt(s, 10);
    if (n >= 1 && n <= 47) return n;
    return null;
  }
  // Exact ja name (with or without 都道府県 suffix)
  if (PREF_NAME_TO_CODE[s] != null) return PREF_NAME_TO_CODE[s];
  // Try removing common suffix variants
  const stripped = s
    .replace(/(都|道|府|県)$/u, "")
    .replace(/-/g, " ")
    .trim();
  if (PREF_NAME_TO_CODE[stripped] != null) return PREF_NAME_TO_CODE[stripped];
  // English with case-insensitive
  const lower = s.toLowerCase();
  for (const [name, code] of Object.entries(PREF_NAME_TO_CODE)) {
    if (name.toLowerCase() === lower) return code;
  }
  return null;
}

export async function loadCsvFile(file, opts = {}) {
  const name = (file.name || "").toLowerCase();
  if ((name.endsWith(".xlsx") || name.endsWith(".xls")) && typeof XLSX !== "undefined") {
    // Excel: convert first sheet to CSV and feed to the standard parser
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const firstSheet = wb.Sheets[wb.SheetNames[0]];
    if (!firstSheet) throw new Error("Excel: シートが見つかりません");
    const csv = XLSX.utils.sheet_to_csv(firstSheet);
    return parseCsvText(csv, opts);
  }
  const text = await file.text();
  return parseCsvText(text, opts);
}

export async function loadSampleCsv(url, opts = {}) {
  const target = url || (opts.level === "municipality"
    ? "data/sample_all_municipalities.csv"
    : "data/sample_population.csv");
  const res = await fetch(target);
  if (!res.ok) throw new Error(`サンプル読み込み失敗 (${res.status})`);
  const text = await res.text();
  return parseCsvText(text, opts);
}

/**
 * Build a town-name index from a town-list (chocho mode).
 *   towns: [{ id, town, koaza, ... }]
 *   returns Map<normalized name, {id, town}>
 */
export function buildTownIndex(towns) {
  const idx = new Map();
  for (const t of towns) {
    const base = (t.town || "").normalize("NFC").replace(/\s+/g, "");
    if (!base) continue;
    idx.set(base, { id: t.id, town: t.town });
    // No-suffix variant ("新宿一丁目" → "新宿")
    const stripped = base.replace(/[0-9一二三四五六七八九十]+丁目?$/u, "");
    if (stripped && stripped !== base) idx.set(stripped, { id: t.id, town: t.town });
  }
  return idx;
}

/**
 * Build the municipality lookup index from the GeoJSON FeatureCollection.
 * Indexes:
 *   - English name (lowercased)
 *   - Japanese name as-is and without suffix (e.g. "新宿" -> 新宿区)
 *   - prefecture-qualified Japanese (e.g. "東京都新宿区")
 */
export function buildMuniIndex(geojson) {
  const idx = new Map();
  const nfc = (s) => s ? s.normalize("NFC") : s;
  for (const f of geojson.features) {
    const p = f.properties;
    const rec = {
      id: p.id,
      name_en: p.name_en,
      name_jp: nfc(p.name_jp),
      pref_code: p.pref_code,
      pref_name: nfc(p.pref_name),
    };
    if (p.name_en) idx.set(p.name_en.toLowerCase(), rec);
    if (rec.name_jp) {
      idx.set(rec.name_jp, rec);
      idx.set(rec.name_jp.replace(/(区|市|町|村)$/u, ""), rec);
      if (rec.pref_name) idx.set(`${rec.pref_name}${rec.name_jp}`, rec);
    }
  }
  return idx;
}

/**
 * Build a lookup: prefCode -> value for a given field.
 */
export function buildValueLookup(dataset, field) {
  const map = new Map();
  for (const r of dataset.rows) {
    const v = r.values[field];
    map.set(r.key, v == null ? null : v);
  }
  return map;
}
