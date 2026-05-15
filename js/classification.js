// =====================================================================
// classification.js  -- Compute class breaks for choropleth maps
//   method: "quantile" | "equal" | "jenks"
// =====================================================================

/**
 * @param values {number[]}  -- finite numbers only (null/NaN filtered upstream)
 * @param classes {number}   -- 2..9
 * @param method  {string}
 * @param opts {{log?: boolean}}  -- if log, compute in log10 space then transform back
 * @returns {{breaks: number[], method: string, classes: number, log: boolean}}
 *   breaks length = classes + 1  (inclusive lower .. inclusive upper)
 */
export function computeBreaks(values, classes, method, opts = {}) {
  const useLog = !!opts.log;
  const clean = values.filter(v => Number.isFinite(v) && (!useLog || v > 0));
  if (clean.length === 0) return { breaks: [], method, classes, log: useLog };

  const work = useLog ? clean.map(v => Math.log10(v)) : clean;
  const sorted = work.slice().sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  // Degenerate case — all identical
  if (min === max) {
    const v = useLog ? Math.pow(10, min) : min;
    return { breaks: [v, v], method, classes: 1, log: useLog };
  }

  let breaks;
  if (method === "equal")      breaks = equalBreaks(min, max, classes);
  else if (method === "jenks") breaks = jenksBreaks(sorted, classes);
  else                         breaks = quantileBreaks(sorted, classes);

  if (useLog) breaks = breaks.map(v => Math.pow(10, v));
  return { breaks, method, classes, log: useLog };
}

function equalBreaks(min, max, k) {
  const step = (max - min) / k;
  const b = [];
  for (let i = 0; i <= k; i++) b.push(min + step * i);
  b[k] = max; // numerical safety
  return b;
}

function quantileBreaks(sorted, k) {
  const b = [sorted[0]];
  for (let i = 1; i < k; i++) {
    b.push(quantile(sorted, i / k));
  }
  b.push(sorted[sorted.length - 1]);
  return b;
}

function quantile(sortedAsc, q) {
  if (q <= 0) return sortedAsc[0];
  if (q >= 1) return sortedAsc[sortedAsc.length - 1];
  const idx = (sortedAsc.length - 1) * q;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sortedAsc[lo];
  return sortedAsc[lo] + (sortedAsc[hi] - sortedAsc[lo]) * (idx - lo);
}

function jenksBreaks(sortedAsc, k) {
  // simple-statistics has a battle-tested implementation
  if (typeof ss !== "undefined" && ss.jenks) {
    return ss.jenks(sortedAsc, k);
  }
  // Fallback to quantile if library missing
  return quantileBreaks(sortedAsc, k);
}

/**
 * For a value and breaks, return class index [0..k-1] (or -1 if v is non-finite).
 * Uses inclusive upper for the last class, exclusive otherwise (typical map convention).
 */
export function classifyValue(v, breaks) {
  if (!Number.isFinite(v) || !breaks.length) return -1;
  const last = breaks.length - 1;
  if (v <= breaks[0]) return 0;
  if (v >= breaks[last]) return last - 1;
  for (let i = 1; i < last; i++) {
    if (v < breaks[i]) return i - 1;
  }
  return last - 1;
}
