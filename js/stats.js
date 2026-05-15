// =====================================================================
// stats.js  -- Basic descriptive statistics on numeric data
// =====================================================================

export function computeStats(values) {
  const v = values.filter(x => Number.isFinite(x));
  const n = v.length;
  const missing = values.length - n;
  if (n === 0) return { n: 0, missing, sum: null, mean: null, median: null, min: null, max: null, range: null, std: null, variance: null };

  const sorted = v.slice().sort((a, b) => a - b);
  const sum = v.reduce((a, b) => a + b, 0);
  const mean = sum / n;
  const min = sorted[0];
  const max = sorted[n - 1];
  const median = n % 2
    ? sorted[(n - 1) / 2]
    : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
  // Population std (matches MANDARA's basic stats display)
  let ss2 = 0;
  for (const x of v) ss2 += (x - mean) * (x - mean);
  const variance = ss2 / n;
  const std = Math.sqrt(variance);

  return {
    n, missing,
    sum, mean, median, min, max,
    range: max - min,
    std, variance,
  };
}

export function formatNum(v, digits = 3) {
  if (v == null || !Number.isFinite(v)) return "—";
  // Choose representation: integer if no fractional part, else fixed-digit
  if (Math.abs(v) >= 1000) return v.toLocaleString("ja-JP", { maximumFractionDigits: 2 });
  if (Number.isInteger(v)) return String(v);
  return Number(v.toFixed(digits)).toString();
}
