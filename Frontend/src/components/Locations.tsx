import { useMemo, useState } from "react";
import type { CatalogueItem } from "../types";
import { stockLabel, stockLevel } from "../lib/format";
import { openBranchPicker, useBranchState } from "../lib/branch";
import { byTown, COMPACT_FROM, myBranchOf, stockAt, useLocations, type StockAt } from "../lib/locations";
import { StockMeter } from "./bits";
import { Icon } from "./Icon";

type Stocked = Pick<CatalogueItem, "qtyOnHand" | "stock">;

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * On a product card: stock at the shopper's branch only.
 * - One branch in the shop: the stock note and the branch name.
 * - Several, one chosen: "30 in stock at Gweru Branch" (the list is already filtered to that branch).
 * - Several, none chosen yet: "In stock at 3 branches" until the shopper picks one.
 */
export function CardStock({ item }: { item: Stocked }) {
  const locations = useLocations();
  const { code } = useBranchState();
  const mine = myBranchOf(locations, code);
  const rows = stockAt(item, locations);

  if (rows.length <= 1) {
    return (
      <span className="where">
        <StockMeter qty={item.qtyOnHand} />
        {rows[0] && (
          <span className="where__place">
            <Icon name="pin" /> {rows[0].location.name}
          </span>
        )}
      </span>
    );
  }

  if (mine) {
    const qty = rows.find((r) => r.location.code === mine.code)?.qty ?? 0;
    const level = stockLevel(qty);
    if (level === "out") {
      return (
        <span className="where__line where__line--away">
          <Icon name="pin" />
          <span>Not at {mine.name}</span>
        </span>
      );
    }
    return (
      <span className={`where__line stock--${level}`}>
        <Icon name="pin" />
        <span>
          <b>{level === "low" ? `Only ${qty} left` : `${qty} in stock`}</b> at {mine.name}
        </span>
      </span>
    );
  }

  const here = rows.filter((r) => r.qty > 0).length;
  if (here === 0) return <StockMeter qty={0} />;
  return (
    <span className="where__line where__line--away">
      <Icon name="pin" />
      <span>In stock at {plural(here, "branch", "branches")}</span>
    </span>
  );
}

function BranchRow({ r, mine = false }: { r: StockAt; mine?: boolean }) {
  const level = stockLevel(r.qty);
  return (
    <li className={`wherebox__row ${level === "out" ? "is-out" : ""} ${mine ? "is-mine" : ""}`}>
      <span className="wherebox__pin" aria-hidden="true">
        <Icon name="pin" />
      </span>
      <span className="wherebox__place">
        <strong>
          {r.location.name}
          {mine && <em className="wherebox__tag">Your branch</em>}
        </strong>
        {r.location.address && <span>{r.location.address}</span>}
      </span>
      <span className={`wherebox__qty stock--${level}`}>{level === "out" ? (mine ? "Not here right now" : "Not at this branch") : stockLabel(r.qty)}</span>
    </li>
  );
}

/**
 * On the product page: the shopper's branch first, then the other branches that have it.
 * With many branches the rest fold away behind "Show all", grouped by town, with search.
 */
export function WhereToFind({ item }: { item: Stocked }) {
  const locations = useLocations();
  const { code } = useBranchState();
  const mine = myBranchOf(locations, code);
  const rows = stockAt(item, locations);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  const atMine = mine ? rows.find((r) => r.location.code === mine.code) : undefined;
  const others = useMemo(
    () => rows.filter((r) => r.location.code !== mine?.code && r.qty > 0).sort((a, b) => b.qty - a.qty),
    [rows, mine?.code],
  );
  if (rows.length === 0) return null;

  const many = rows.length >= COMPACT_FROM;
  const missing = rows.length - others.length - (atMine ? 1 : 0);
  const PREVIEW = 3;
  const shown = many && !open ? others.slice(0, PREVIEW) : others;
  const term = q.trim().toLowerCase();
  const filtered = term
    ? shown.filter((r) => [r.location.name, r.location.town ?? "", r.location.address ?? ""].some((s) => s.toLowerCase().includes(term)))
    : shown;

  return (
    <section className="wherebox" aria-labelledby="where-title">
      <div className="wherebox__head">
        <h2 id="where-title" className="wherebox__title">
          <Icon name="store" /> {rows.length === 1 ? "Available at our branch" : "Available at these branches"}
        </h2>
        {rows.length > 1 && (
          <button className="linkish wherebox__change" onClick={openBranchPicker}>
            {mine ? "Change branch" : "Choose your branch"}
          </button>
        )}
      </div>

      {atMine && (
        <ul>
          <BranchRow r={atMine} mine />
        </ul>
      )}

      {others.length > 0 && (
        <>
          {atMine && <p className="wherebox__sub">{atMine.qty > 0 ? "Also at" : "You can find it at"}</p>}
          {open && others.length > 8 && (
            <label className="bpick__search wherebox__search">
              <Icon name="search" />
              <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search town or branch" aria-label="Search branches" />
            </label>
          )}
          {open && many ? (
            byTown(filtered.map((r) => r.location)).map((g) => (
              <div key={g.town} className="wherebox__group">
                <h3>{g.town}</h3>
                <ul>
                  {g.branches.map((l) => (
                    <BranchRow key={l.code} r={filtered.find((r) => r.location.code === l.code)!} />
                  ))}
                </ul>
              </div>
            ))
          ) : (
            <ul>
              {filtered.map((r) => (
                <BranchRow key={r.location.code} r={r} />
              ))}
            </ul>
          )}
          {many && others.length > PREVIEW && (
            <button className="btn btn--block wherebox__more" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
              {open ? "Show fewer" : `Show all ${others.length} branches that have it`}
              <Icon name="down" className={open ? "is-flipped" : ""} />
            </button>
          )}
        </>
      )}

      {others.length === 0 && !atMine && <p className="wherebox__sub">Not in stock at any branch right now.</p>}
      {rows.length > 1 && missing > 0 && others.length + (atMine ? 1 : 0) > 0 && (
        <p className="wherebox__note">Not at {plural(missing, "other branch", "other branches")} right now.</p>
      )}
    </section>
  );
}
