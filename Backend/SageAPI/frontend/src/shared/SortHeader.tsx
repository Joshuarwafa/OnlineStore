import type { SortState } from "./useSort";

interface Props<K extends string> {
  label: string;
  column: K;
  sort: SortState<K>;
  onSort: (column: K) => void;
  align?: "left" | "right";
}

export function SortHeader<K extends string>({ label, column, sort, onSort, align = "left" }: Props<K>) {
  const active = sort.key === column;
  const ariaSort = active ? (sort.direction === "asc" ? "ascending" : "descending") : "none";

  return (
    <th aria-sort={ariaSort} className={align === "right" ? "num" : undefined}>
      <button type="button" className="sort-button" onClick={() => onSort(column)}>
        {label}
        <span className="sort-indicator" aria-hidden="true">
          {active ? (sort.direction === "asc" ? "▲" : "▼") : ""}
        </span>
      </button>
    </th>
  );
}
