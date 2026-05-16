// =====================================================================
// table.js  -- Sortable data table linked to the map
// =====================================================================

import { formatNum } from "./stats.js";

let sortState = { field: null, asc: true };

/**
 * @param container the .table-wrap div
 * @param rows      dataset.rows  (each has .key, .name, .values)
 * @param fields    dataset.fields
 * @param onRowHover (id, isOn) -> void
 */
export function renderTable(container, rows, fields, onRowHover, onCellEdit = null) {
  container.innerHTML = "";
  if (!rows.length || !fields.length) return;

  const table = document.createElement("table");
  // header
  const thead = document.createElement("thead");
  const hr = document.createElement("tr");
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
    const nameTd = document.createElement("td");
    nameTd.textContent = r.name || "#" + r.key;
    tr.appendChild(nameTd);
    for (const f of fields) {
      const td = document.createElement("td");
      td.className = "num";
      td.textContent = formatNum(r.values[f]);
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

  // mark active sort column
  if (sortState.field) {
    const idx = sortState.field === "name" ? 0 : fields.indexOf(sortState.field) + 1;
    const ths = thead.querySelectorAll("th");
    if (ths[idx]) ths[idx].classList.add(sortState.asc ? "sort-asc" : "sort-desc");
  }

  function th(label, key, numeric=false) {
    const el = document.createElement("th");
    el.textContent = label;
    el.addEventListener("click", () => {
      if (sortState.field === key) sortState.asc = !sortState.asc;
      else { sortState.field = key; sortState.asc = numeric ? false : true; }
      renderTable(container, rows, fields, onRowHover);
    });
    if (numeric) el.style.textAlign = "right";
    return el;
  }
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
