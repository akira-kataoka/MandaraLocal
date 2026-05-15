// =====================================================================
// color.js  -- ColorBrewer-like palette generation via chroma-js
// =====================================================================

const PALETTE_SPECS = {
  YlOrRd:  { type: "sequential", colors: ["#ffffcc","#ffeda0","#fed976","#feb24c","#fd8d3c","#fc4e2a","#e31a1c","#bd0026","#800026"] },
  Blues:   { type: "sequential", colors: ["#f7fbff","#deebf7","#c6dbef","#9ecae1","#6baed6","#4292c6","#2171b5","#08519c","#08306b"] },
  Greens:  { type: "sequential", colors: ["#f7fcf5","#e5f5e0","#c7e9c0","#a1d99b","#74c476","#41ab5d","#238b45","#006d2c","#00441b"] },
  Reds:    { type: "sequential", colors: ["#fff5f0","#fee0d2","#fcbba1","#fc9272","#fb6a4a","#ef3b2c","#cb181d","#a50f15","#67000d"] },
  Purples: { type: "sequential", colors: ["#fcfbfd","#efedf5","#dadaeb","#bcbddc","#9e9ac8","#807dba","#6a51a3","#54278f","#3f007d"] },
  RdYlBu:  { type: "diverging",  colors: ["#a50026","#d73027","#f46d43","#fdae61","#fee090","#ffffbf","#e0f3f8","#abd9e9","#74add1","#4575b4","#313695"] },
  Spectral:{ type: "diverging",  colors: ["#9e0142","#d53e4f","#f46d43","#fdae61","#fee08b","#ffffbf","#e6f598","#abdda4","#66c2a5","#3288bd","#5e4fa2"] },
  Viridis: { type: "sequential", colors: ["#440154","#482878","#3e4989","#31688e","#26828e","#1f9e89","#35b779","#6ece58","#b5de2b","#fde725"] },
};

/**
 * @param paletteName {string}
 * @param classes {number}
 * @param reverse {boolean}
 * @returns {string[]} hex colors with length = classes
 */
export function getPalette(paletteName, classes, reverse = false) {
  const spec = PALETTE_SPECS[paletteName] || PALETTE_SPECS.YlOrRd;
  let scale;
  if (typeof chroma !== "undefined") {
    scale = chroma.scale(spec.colors).mode("lab").colors(classes);
  } else {
    // Fallback: pick evenly from preset colors
    scale = pickEvenly(spec.colors, classes);
  }
  return reverse ? scale.slice().reverse() : scale;
}

function pickEvenly(arr, k) {
  if (k <= 1) return [arr[Math.floor(arr.length / 2)]];
  const out = [];
  for (let i = 0; i < k; i++) {
    const idx = Math.round((arr.length - 1) * (i / (k - 1)));
    out.push(arr[idx]);
  }
  return out;
}

export const PALETTE_NAMES = Object.keys(PALETTE_SPECS);
