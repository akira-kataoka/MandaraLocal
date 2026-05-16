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
export function renderTable(container, rows, fields, onRowHover, onCellEdit = null, onRowDelete = null) {
  container.innerHTML = "";
  if (!rows.length || !fields.length) return;

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
      renderTable(container, rows, fields, onRowHover, onCellEdit, onRowDelete);
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
