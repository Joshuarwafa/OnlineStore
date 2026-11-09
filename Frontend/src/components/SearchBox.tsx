import { useEffect, useId, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/store";
import type { CatalogueItem } from "../types";
import { formatMoney, productPath } from "../lib/format";
import { useDebounced } from "../lib/useAsync";
import { Icon } from "./Icon";
import { myBranchOf, useLocations } from "../lib/locations";
import { useBranchState } from "../lib/branch";

/** Search by name or code. Suggestions appear as you type; Enter shows all results. */
export function SearchBox({ initial = "" }: { initial?: string }) {
  const [q, setQ] = useState(initial);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [hits, setHits] = useState<CatalogueItem[]>([]);
  const debounced = useDebounced(q, 200);
  const navigate = useNavigate();
  const listId = useId();
  const wrap = useRef<HTMLFormElement>(null);
  // Suggestions come from the shopper's branch, like the product list
  const locations = useLocations();
  const { code: branchCode } = useBranchState();
  const branch = locations.length > 1 ? myBranchOf(locations, branchCode)?.code : undefined;

  useEffect(() => {
    setQ(initial);
  }, [initial]);

  useEffect(() => {
    let live = true;
    if (debounced.trim().length < 2) {
      setHits([]);
      return;
    }
    api.catalogue({ search: debounced, pageSize: 6, inStock: true, branch }).then(
      (res) => live && (setHits(res.items), setActive(-1)),
      () => live && setHits([]),
    );
    return () => {
      live = false;
    };
  }, [debounced, branch]);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const showList = open && hits.length > 0;

  return (
    <form
      ref={wrap}
      role="search"
      className="search search--simple"
      onSubmit={(e) => {
        e.preventDefault();
        setOpen(false);
        (document.activeElement as HTMLElement | null)?.blur?.();
        if (active >= 0 && hits[active]) navigate(productPath(hits[active].code), { viewTransition: true });
        else navigate(q.trim() ? `/?q=${encodeURIComponent(q.trim())}` : "/", { viewTransition: true });
      }}
    >
      <Icon name="search" className="search__icon" />
      <input
        type="search"
        enterKeyHint="search"
        value={q}
        placeholder="Search products"
        aria-label="Search products"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (!showList) return;
          if (e.key === "ArrowDown") (e.preventDefault(), setActive((a) => (a + 1) % hits.length));
          else if (e.key === "ArrowUp") (e.preventDefault(), setActive((a) => (a <= 0 ? hits.length - 1 : a - 1)));
          else if (e.key === "Escape") setOpen(false);
        }}
      />
      {showList && (
        <ul className="search__list" id={listId} role="listbox">
          {hits.map((h, i) => (
            <li
              key={h.code}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              className={i === active ? "is-active" : ""}
              onMouseDown={(e) => {
                e.preventDefault();
                setOpen(false);
                navigate(productPath(h.code), { viewTransition: true });
              }}
              onMouseEnter={() => setActive(i)}
            >
              <span className="search__desc">{h.description}</span>
              <span className="search__price">{formatMoney(h.priceIncl)}</span>
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}
