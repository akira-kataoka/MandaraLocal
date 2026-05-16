// =====================================================================
// table.js  -- Sortable data table linked to the map
// =====================================================================

import { formatNum } from "./stats.js";

let sortState = { field: null, asc: true };

// Expose current sort so downstream features (CSV export) can match what
// the user sees on screen.
export function getSortState() {
  return { field: sortState.field, asc: sortState.asc };
}

/**
 * @param container the .table-wrap div
 * @param rows      dataset.rows  (each has .key, .name, .values)
 * @param fields    dataset.fields
 * @param onRowHover (id, isOn) -> void
 */
export function renderTable(container, rows, fields, onRowHover, onCellEdit = null, onRowDelete = null, onRowClick = null, opts = {}) {
  container.innerHTML = "";
  if (!rows.length || !fields.length) return;

  // Cycle 208: per-column min/max for cell-background heatmap. Computed once
  // up-front so the body loop just does the linear interpolation.
  const heat = !!opts.heat;
  const heatRange = heat ? buildHeatRanges(rows, fields) : null;
  // Cycle 215: highlight pinned-scatter rows (Set of row.key) so the user can
  // see which table rows correspond to their on-plot pins.
  const pinnedRows = opts.pinnedIds instanceof Set ? opts.pinnedIds : null;

  const table = document.createElement("table");
  // header
  const thead = document.createElement("thead");
  const hr = document.createElement("tr");
  if (onRowDelete) {
    const blank = document.createElement("th");
    blank.style.width = "20px";
    hr.appendChild(blank);
  }
  hr.appendChild(th("地域", "name"));
  for (const f of fields) hr.appendChild(th(f, f, true));
  thead.appendChild(hr); table.appendChild(thead);

  // body — cap to top 200 rows to keep big municipal datasets snappy
  const MAX_ROWS = 200;
  const tbody = document.createElement("tbody");
  const sorted = sortRows(rows, fields);
  const display = sorted.slice(0, MAX_ROWS);
  for (const r of display) {
    const tr = document.createElement("tr");
    tr.dataset.id = r.key;
    if (pinnedRows && pinnedRows.has(r.key)) {
      tr.classList.add("is-pinned");
      // Red left border + soft tint; works with the heatmap because it sits
      // on the row, not on individual cells.
      tr.style.boxShadow = "inset 3px 0 0 #dc2626";
    }
    if (onRowDelete) {
      const delTd = document.createElement("td");
      delTd.className = "row-del";
      const btn = document.createElement("button");
      btn.textContent = "×";
      btn.title = "この行を削除";
      btn.className = "row-del-btn";
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (confirm(`「${r.name || "#" + r.key}」を削除しますか？\n（データセットから除外されます。再読込で元に戻ります）`)) {
          onRowDelete(r.key);
        }
      });
      delTd.appendChild(btn);
      tr.appendChild(delTd);
    }
    const nameTd = document.createElement("td");
    nameTd.textContent = r.name || "#" + r.key;
    tr.appendChild(nameTd);
    for (const f of fields) {
      const td = document.createElement("td");
      td.className = "num";
      td.textContent = formatNum(r.values[f]);
      if (heat) {
        const range = heatRange.get(f);
        const val = r.values[f];
        if (range && Number.isFinite(val) && range.max > range.min) {
          const t = (val - range.min) / (range.max - range.min);
          td.style.backgroundColor = heatColor(t);
        }
      }
      if (onCellEdit) {
        td.title = "ダブルクリックで編集";
        td.style.cursor = "text";
        td.addEventListener("dblclick", (e) => {
          e.stopPropagation();
          const cur = r.values[f];
          const input = document.createElement("input");
          input.type = "number";
          input.value = cur == null ? "" : cur;
          input.step = "any";
          input.style.cssText = "width: 90%; padding: 1px 2px; font-size: 11px;";
          td.innerHTML = "";
          td.appendChild(input);
          input.focus();
          input.select();
          const commit = (save) => {
            if (save) {
              const v = parseFloat(input.value);
              onCellEdit(r.key, f, Number.isFinite(v) ? v : null);
            } else {
              td.textContent = formatNum(cur);
            }
          };
          input.addEventListener("blur", () => commit(true));
          input.addEventListener("keydown", (k) => {
            if (k.key === "Enter") { commit(true); input.blur(); }
            else if (k.key === "Escape") { commit(false); input.blur(); }
          });
        });
      }
      tr.appendChild(td);
    }
    if (onRowHover) {
      tr.addEventListener("mouseenter", () => onRowHover(r.key, true));
      tr.addEventListener("mouseleave", () => onRowHover(r.key, false));
    }
    if (onRowClick) {
      tr.addEventListener("click", (e) => {
        // Don't trigger when the click was on the row-delete button or on an
        // editable cell's <input> (cell edit takes priority).
        const t = e.target;
        if (t.closest("button") || t.tagName === "INPUT") return;
        onRowClick(r.key);
      });
    }
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  container.appendChild(table);

  if (sorted.length > MAX_ROWS) {
    const note = document.createElement("div");
    note.style.cssText = "font-size:11px;color:var(--muted);padding:4px 8px;background:#f8fafc;";
    note.textContent = `（${sorted.length} 件中 上位 ${MAX_ROWS} 件を表示。列ヘッダクリックでソート切替）`;
    container.appendChild(note);
  }

  // mark active sort column (column 0 may be the delete handle when onRowDelete is set)
  if (sortState.field) {
    const offset = onRowDelete ? 1 : 0;
    const idx = sortState.field === "name" ? offset : fields.indexOf(sortState.field) + 1 + offset;
    const ths = thead.querySelectorAll("th");
    if (ths[idx]) ths[idx].classList.add(sortState.asc ? "sort-asc" : "sort-desc");
  }

  function th(label, key, numeric=false) {
    const el = document.createElement("th");
    el.textContent = label;
    el.addEventListener("click", () => {
      if (sortState.field === key) sortState.asc = !sortState.asc;
      else { sortState.field = key; sortState.asc = numeric ? false : true; }
      renderTable(container, rows, fields, onRowHover, onCellEdit, onRowDelete, onRowClick, opts);
    });
    if (numeric) el.style.textAlign = "right";
    return el;
  }
}

// Cycle 208: build per-column { min, max } from the (possibly filtered) row
// set so the heatmap reflects what the user is looking at, not the original
// dataset. Non-finite values are skipped.
function buildHeatRanges(rows, fields) {
  const m = new Map();
  for (const f of fields) m.set(f, { min: Infinity, max: -Infinity });
  for (const r of rows) {
    for (const f of fields) {
      const v = r.values[f];
      if (!Number.isFinite(v)) continue;
      const range = m.get(f);
      if (v < range.min) range.min = v;
      if (v > range.max) range.max = v;
    }
  }
  return m;
}
// Linear ramp blue(low) → white(mid) → red(high). t in [0,1].
function heatColor(t) {
  t = Math.max(0, Math.min(1, t));
  // Stops: 0 → #bfdbfe (blue-200), 0.5 → #ffffff, 1 → #fecaca (red-200).
  // Soft pastels so dark text on top stays readable.
  const stops = [[191, 219, 254], [255, 255, 255], [254, 202, 202]];
  const seg = t < 0.5 ? 0 : 1;
  const u = (t - seg * 0.5) / 0.5;
  const a = stops[seg], b = stops[seg + 1];
  const r = Math.round(a[0] + (b[0] - a[0]) * u);
  const g = Math.round(a[1] + (b[1] - a[1]) * u);
  const bl = Math.round(a[2] + (b[2] - a[2]) * u);
  return `rgb(${r},${g},${bl})`;
}

function sortRows(rows, fields) {
  const s = sortState;
  if (!s.field) return rows.slice();
  const dir = s.asc ? 1 : -1;
  const isName = s.field === "name";
  return rows.slice().sort((a, b) => {
    const va = isName ? (a.name || "") : a.values[s.field];
    const vb = isName ? (b.name || "") : b.values[s.field];
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
    return String(va).localeCompare(String(vb), "ja") * dir;
  });
}
