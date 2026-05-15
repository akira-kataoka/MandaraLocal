// =====================================================================
// stats.js  -- Basic descriptive statistics on numeric data
// =====================================================================

export function computeStats(values) {
  const v = values.filter(x => Number.isFinite(x));
  const n = v.length;
  const missing = values.length - n;
  if (n === 0) return { n: 0, missing, sum: null, mean: null, median: null, min: null, max: null, range: null, std: null, variance: null, q1: null, q3: null, iqr: null, cv: null };

  const sorted = v.slice().sort((a, b) => a - b);
  const sum = v.reduce((a, b) => a + b, 0);
  const mean = sum / n;
  const min = sorted[0];
  const max = sorted[n - 1];
  const median = n % 2
    ? sorted[(n - 1) / 2]
    : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
  const quantile = (p) => {
    const ix = (n - 1) * p;
    const lo = Math.floor(ix), hi = Math.ceil(ix);
    return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (ix - lo);
  };
  const q1 = quantile(0.25);
  const q3 = quantile(0.75);
  const iqr = q3 - q1;
  // Population std (matches MANDARA's basic stats display)
  let ss2 = 0;
  for (const x of v) ss2 += (x - mean) * (x - mean);
  const variance = ss2 / n;
  const std = Math.sqrt(variance);
  const cv = mean !== 0 ? std / Math.abs(mean) : null;   // coefficient of variation

  return {
    n, missing,
    sum, mean, median, min, max,
    range: max - min,
    std, variance,
    q1, q3, iqr,
    cv,
  };
}

/**
 * Detect outliers via Tukey's fences (IQR method).
 * Returns { lowerFence, upperFence, q1, q3, iqr, lowers: Set<index>, uppers: Set<index> }
 *
 * @param values   parallel array (some entries may be null/NaN — kept as index)
 */
export function detectOutliers(values, k = 1.5) {
  const idx = [];
  const v = [];
  for (let i = 0; i < values.length; i++) {
    if (Number.isFinite(values[i])) { idx.push(i); v.push(values[i]); }
  }
  if (v.length < 4) return { lowerFence: null, upperFence: null, q1: null, q3: null, iqr: null, lowers: new Set(), uppers: new Set() };
  v.sort((a, b) => a - b);
  const q = (p) => {
    const ix = (v.length - 1) * p;
    const lo = Math.floor(ix), hi = Math.ceil(ix);
    return lo === hi ? v[lo] : v[lo] + (v[hi] - v[lo]) * (ix - lo);
  };
  const q1 = q(0.25), q3 = q(0.75);
  const iqr = q3 - q1;
  const lo = q1 - k * iqr;
  const hi = q3 + k * iqr;
  const lowers = new Set(), uppers = new Set();
  for (let i = 0; i < values.length; i++) {
    const x = values[i];
    if (!Number.isFinite(x)) continue;
    if (x < lo) lowers.add(i);
    else if (x > hi) uppers.add(i);
  }
  return { lowerFence: lo, upperFence: hi, q1, q3, iqr, lowers, uppers };
}

/**
 * Pull a unit string out of a field name like "面積(km2)" → "km2".
 * Recognises both half-width "(...)" and full-width "（…）".
 * Returns "" if none found.
 */
export function extractUnit(fieldName) {
  if (!fieldName) return "";
  const m = /[(（]([^)）]+)[)）]\s*$/u.exec(fieldName);
  if (!m) return "";
  const inner = m[1];
  // Period/time expressions (e.g. "2020年", "令和2年", "Q1") are NOT units.
  if (/[年期時月日号回]|Q\d/.test(inner)) return "";
  return inner;
}

export function fieldDisplayName(fieldName) {
  if (!fieldName) return "";
  return fieldName.replace(/[(（][^)）]+[)）]\s*$/u, "").trim() || fieldName;
}

export function formatNum(v, digits = 3) {
  if (v == null || !Number.isFinite(v)) return "—";
  // Choose representation: integer if no fractional part, else fixed-digit
  if (Math.abs(v) >= 1000) return v.toLocaleString("ja-JP", { maximumFractionDigits: 2 });
  if (Number.isInteger(v)) return String(v);
  return Number(v.toFixed(digits)).toString();
}
