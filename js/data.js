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

export function parseCsvText(text) {
  const parsed = Papa.parse(text.trim(), {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false,
  });
  if (!parsed.data || !parsed.data.length) {
    throw new Error("CSVデータが空です。");
  }
  const headers = parsed.meta.fields;
  if (headers.length < 2) {
    throw new Error("CSVには少なくとも2列必要です（1列目=地域、2列目以降=数値）。");
  }
  const keyHeader = headers[0];
  const fields = headers.slice(1);

  const rows = [];
  const unmatched = [];

  for (const r of parsed.data) {
    const rawKey = String(r[keyHeader] ?? "").trim();
    if (!rawKey) continue;
    const code = normalizeToPrefCode(rawKey);
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
      name: PREF_CODE_TO_NAME[code],
      values,
    });
  }
  return { rows, fields, unmatched };
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

export async function loadCsvFile(file) {
  const text = await file.text();
  return parseCsvText(text);
}

export async function loadSampleCsv(url = "data/sample_population.csv") {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`サンプル読み込み失敗 (${res.status})`);
  const text = await res.text();
  return parseCsvText(text);
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
