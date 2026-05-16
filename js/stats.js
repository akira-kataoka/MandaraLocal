// =====================================================================
// stats.js  -- Basic descriptive statistics on numeric data
// =====================================================================

/**
 * Compute basic descriptive statistics for a numeric array.
 * Non-finite entries are dropped and counted as `missing`.
 *
 * Returned fields:
 *   n, missing, sum, mean, median, min, max, range, std, variance,
 *   q1, q3, iqr, cv,
 *   skewness  -- sample skewness (Fisher–Pearson g1); null when std === 0
 *   kurtosis  -- excess kurtosis (g2); null when variance === 0
 *   mode      -- most frequent value (count >= 2 required); on ties the
 *               smallest value wins. null when no value repeats.
 * When the finite-filtered n is 0, every field other than n/missing is null.
 */
export function computeStats(values) {
  const v = values.filter(x => Number.isFinite(x));
  const n = v.length;
  const missing = values.length - n;
  if (n === 0) return { n: 0, missing, sum: null, mean: null, median: null, min: null, max: null, range: null, std: null, variance: null, q1: null, q3: null, iqr: null, cv: null, skewness: null, kurtosis: null, mode: null, sampleStd: null, seMean: null, ciMeanLo: null, ciMeanHi: null };

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
  let ss3 = 0;
  let ss4 = 0;
  for (const x of v) {
    const d = x - mean;
    const d2 = d * d;
    ss2 += d2;
    ss3 += d2 * d;
    ss4 += d2 * d2;
  }
  const variance = ss2 / n;
  const std = Math.sqrt(variance);
  const cv = mean !== 0 ? std / Math.abs(mean) : null;   // coefficient of variation
  // Fisher–Pearson sample skewness (g1); undefined when std === 0
  const skewness = std === 0 ? null : (ss3 / n) / (std * std * std);
  // Excess kurtosis (g2); undefined when variance === 0
  const kurtosis = variance === 0 ? null : (ss4 / n) / (variance * variance) - 3;
  // Mode -- only meaningful when at least one value repeats; ties resolved
  // by the smallest value (sorted ascending, first-seen wins).
  let mode = null;
  let bestCount = 1;
  let runValue = sorted[0];
  let runCount = 1;
  for (let i = 1; i <= n; i++) {
    if (i < n && sorted[i] === runValue) {
      runCount++;
    } else {
      if (runCount >= 2 && runCount > bestCount) {
        bestCount = runCount;
        mode = runValue;
      }
      if (i < n) {
        runValue = sorted[i];
        runCount = 1;
      }
    }
  }

  // Sample SD (n-1 denominator), SE of mean, and 95% CI of mean.
  // 1.96 is the standard normal critical value (good for n >= 30; slightly
  // conservative for smaller n, matching common publication practice).
  let sampleStd = null, seMean = null, ciMeanLo = null, ciMeanHi = null;
  if (n >= 2) {
    sampleStd = Math.sqrt(ss2 / (n - 1));
    seMean = sampleStd / Math.sqrt(n);
    ciMeanLo = mean - 1.96 * seMean;
    ciMeanHi = mean + 1.96 * seMean;
  }

  return {
    n, missing,
    sum, mean, median, min, max,
    range: max - min,
    std, variance,
    q1, q3, iqr,
    cv,
    skewness, kurtosis, mode,
    sampleStd, seMean, ciMeanLo, ciMeanHi,
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
