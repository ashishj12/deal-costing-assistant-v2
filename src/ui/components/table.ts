import { el, clear } from "../dom";

export interface Column<T> {
  readonly key: string;
  readonly header: string;
  readonly numeric?: boolean;
  readonly sortable?: boolean;
  readonly width?: string;
  readonly render: (row: T) => Node | string;
  readonly sortValue?: (row: T) => string | number;
}

export interface TableOptions<T> {
  readonly columns: readonly Column<T>[];
  readonly rows: readonly T[];
  readonly rowId: (row: T) => string;
  readonly selectedId?: string | null;
  readonly onSelect?: (row: T) => void;
  readonly emptyMessage?: string;
}

export function dataTable<T>(options: TableOptions<T>): HTMLElement {
  let sortKey: string | null = null;
  let sortDir: 1 | -1 = 1;

  const wrap = el("div", { class: "tbl-wrap" });
  const table = el("table", { class: "data" });
  const thead = el("thead");
  const tbody = el("tbody");
  table.appendChild(thead);
  table.appendChild(tbody);
  wrap.appendChild(table);

  const renderHead = (): void => {
    clear(thead);
    const tr = el("tr");
    for (const column of options.columns) {
      const sortable = column.sortable !== false;
      const th = el(
        "th",
        {
          class:
            `${column.numeric ? "num" : ""} ${sortable ? "" : "nosort"}`.trim(),
          style: column.width ? `width:${column.width}` : undefined,
          scope: "col",
          "aria-sort":
            sortKey === column.key
              ? sortDir === 1
                ? "ascending"
                : "descending"
              : "none",
        },
        column.header,
      );
      if (sortable) {
        if (sortKey === column.key) {
          th.appendChild(
            el("span", {
              class: "arrow",
              text: sortDir === 1 ? "\u2191" : "\u2193",
            }),
          );
        }
        th.addEventListener("click", () => {
          if (sortKey === column.key) sortDir = sortDir === 1 ? -1 : 1;
          else {
            sortKey = column.key;
            sortDir = 1;
          }
          renderHead();
          renderBody();
        });
      }
      tr.appendChild(th);
    }
    thead.appendChild(tr);
  };

  const renderBody = (): void => {
    clear(tbody);
    let rows = [...options.rows];
    if (sortKey) {
      const column = options.columns.find((c) => c.key === sortKey);
      if (column) {
        const value =
          column.sortValue ?? ((row: T) => String(column.render(row)));
        rows = rows
          .map((row, index) => ({ row, index }))
          .sort((a, b) => {
            const av = value(a.row);
            const bv = value(b.row);
            if (av === bv) return a.index - b.index;
            return (av > bv ? 1 : -1) * sortDir;
          })
          .map((entry) => entry.row);
      }
    }

    if (rows.length === 0) {
      tbody.appendChild(
        el(
          "tr",
          {},
          el(
            "td",
            { colspan: String(options.columns.length), class: "count" },
            options.emptyMessage ?? "No rows match the current filters.",
          ),
        ),
      );
      return;
    }

    for (const row of rows) {
      const id = options.rowId(row);
      const tr = el("tr", {
        "aria-selected": options.selectedId === id ? "true" : "false",
        tabindex: "0",
      });
      for (const column of options.columns) {
        const content = column.render(row);
        tr.appendChild(
          el(
            "td",
            { class: column.numeric ? "num" : "" },
            typeof content === "string" ? content : content,
          ),
        );
      }
      if (options.onSelect) {
        tr.addEventListener("click", () => options.onSelect?.(row));
        tr.addEventListener("keydown", (event) => {
          const key = (event as KeyboardEvent).key;
          if (key === "Enter" || key === " ") {
            event.preventDefault();
            options.onSelect?.(row);
          }
        });
      }
      tbody.appendChild(tr);
    }
  };

  renderHead();
  renderBody();
  return wrap;
}
