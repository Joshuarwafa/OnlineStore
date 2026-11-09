import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api/store";
import { config } from "../config";
import { useAsync, useDocumentTitle } from "../lib/useAsync";
import { Empty, ErrorPanel } from "../components/bits";
import { LabelGrid, ShelfLabel, ShelfLabelSkeleton } from "../components/ShelfLabel";
import { Pagination } from "../components/Pagination";
import { categoryName, useCategoriesState } from "../lib/categories";
import type { CatalogueItem, CatalogueSort } from "../types";
import { formatMoney, productPath } from "../lib/format";
import { useCart } from "../state/cart";
import { flyToCart } from "../lib/flyToCart";
import { Icon } from "../components/Icon";
import { TapHand } from "../components/TapHand";
import { availableFor, myBranchOf, useLocations } from "../lib/locations";
import { openBranchPicker, useBranchState } from "../lib/branch";

// A short, quiet sort list. A–Z is the default, so most shoppers never need it.
const SORTS: { value: CatalogueSort; label: string }[] = [
  { value: "description", label: "A to Z" },
  { value: "price_asc", label: "Lowest price" },
  { value: "price_desc", label: "Highest price" },
];

/**
 * The home page and the shop are the same page: products straight away, nothing to set up.
 * Only items that are in stock are shown, so everything on screen can be ordered.
 */
export function Shop() {
  const [params, setParams] = useSearchParams();
  const search = params.get("q") ?? "";
  const cat = params.get("cat") ?? "";
  const { categories: cats } = useCategoriesState();
  const catName = categoryName(cats, cat);
  const page = Math.max(1, parseInt(params.get("page") ?? "1", 10) || 1);
  const sort = SORTS.find((s) => s.value === params.get("sort"))?.value ?? "description";
  const locations = useLocations();
  const { code: branchCode } = useBranchState();
  const mine = locations.length > 1 ? myBranchOf(locations, branchCode) : null;
  // A chosen branch filters the whole list to that warehouse's stock

  useDocumentTitle(search ? `"${search}"` : catName ?? undefined, config.storeName);

  const { data, error, loading, reload } = useAsync(
    () => api.catalogue({ search, category: cat || undefined, page, inStock: true, sort, pageSize: config.pageSize, branch: mine?.code }),
    [search, cat, page, sort, mine?.code],
  );

  const go = (next: Record<string, string>) => setParams(new URLSearchParams(next));
  // Category buttons only help when there is more than one real group
  const showCats = cats.length > 1;

  return (
    <div className="page shop shop--full">
      {/* The green welcome panel stays on every product list: search, categories and later pages too */}
      <Welcome />
      <div className="shopbar">
        {showCats && !search ? (
          <nav className="catchips" aria-label="Categories">
            <Link to="/" viewTransition className={`catchip ${cat === "" ? "is-active" : ""}`}>
              Everything
            </Link>
            {cats.map((c) => (
              <Link
                key={c.code}
                viewTransition
                to={`/?cat=${encodeURIComponent(c.code)}`}
                className={`catchip ${cat === c.code ? "is-active" : ""}`}
              >
                {c.name}
              </Link>
            ))}
          </nav>
        ) : (
          <span className="shopbar__spacer" />
        )}
        {locations.length > 1 && (
          // A pointing hand always shows shoppers where to choose or change their branch
          <span className={`minechip-wrap ${mine ? "is-set" : ""}`}>
            <TapHand direction="right" className="minechip__hand" />
            <button className={`minechip ${mine ? "is-on" : "is-empty"}`} onClick={openBranchPicker}>
              <Icon name="pin" />
              {mine ? (
                <>
                  <span>{mine.name}</span>
                  <span className="minechip__change">Change</span>
                </>
              ) : (
                <>
                  <span>Choose your branch</span>
                  <Icon name="down" />
                </>
              )}
            </button>
          </span>
        )}
        <label className="sortby">
          <Icon name="sort" />
          <span className="visually-hidden">Sort by</span>
          <select
            value={sort}
            onChange={(e) => {
              const next = new URLSearchParams(params);
              next.delete("page");
              if (e.target.value === "description") next.delete("sort");
              else next.set("sort", e.target.value);
              setParams(next);
            }}
          >
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.value === "description" ? "Sort: A to Z" : s.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <header className="shop__head">
        <h2 className="shop__title">{search ? <>Results for “{search}”</> : catName ?? "Our products"}</h2>
        {search && (
          <button className="btn btn--ghost" onClick={() => go({})}>
            <Icon name="back" /> Show all products
          </button>
        )}
      </header>

      {error ? (
        <ErrorPanel error={error} onRetry={reload} title="We couldn't load the products" />
      ) : data && data.items.length === 0 ? (
        <Empty title={mine ? `Nothing${search ? ` matching “${search}”` : ""} at ${mine.name} right now` : search ? `Nothing matches “${search}”` : "Nothing here right now"}>
          {mine ? (
            <button className="btn btn--signal" onClick={openBranchPicker}>
              Try another branch
            </button>
          ) : (
            <p>Try a shorter word, or call us and we'll help.</p>
          )}
          <button className="btn btn--ghost" onClick={() => go({})}>
            Show all products
          </button>
        </Empty>
      ) : (
        <div className={loading && data ? "is-refreshing" : ""}>
          <LabelGrid dense>
            {data
              ? data.items.map((item, i) => <ShelfLabel key={item.code} item={item} currency={data.currency} index={i} />)
              : Array.from({ length: 12 }, (_, i) => <ShelfLabelSkeleton key={i} />)}
          </LabelGrid>
          {data && (
            <Pagination
              page={data.page}
              total={data.total}
              pageSize={data.pageSize}
              onPage={(p) => {
                const next = new URLSearchParams(params);
                if (p === 1) next.delete("page");
                else next.set("page", String(p));
                setParams(next);
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}

function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

/**
 * The banner at the top of the main list. When products have photos, it features one
 * (real photo, live price, Add to cart) and rotates through them. Otherwise it's a short welcome.
 */
function Welcome() {
  const [featured, setFeatured] = useState<CatalogueItem[]>([]);
  const locations = useLocations();
  const { code: branchCode } = useBranchState();
  const mine = locations.length > 1 ? myBranchOf(locations, branchCode) : null;
  const branch = mine?.code;
  // Everything in stock (at the shopper's branch, once chosen), whatever they're searching or filtering
  const [total, setTotal] = useState<number>();
  useEffect(() => {
    let live = true;
    api.catalogue({ inStock: true, page: 1, pageSize: 1, branch }).then(
      (r) => live && setTotal(r.total),
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [branch]);
  const [at, setAt] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    let live = true;
    setAt(0);
    api.catalogue({ withPhoto: true, inStock: true, pageSize: 12, sort: "stock", branch }).then(
      (r) => live && setFeatured(r.items.filter((i) => i.imageUrl && i.priceIncl != null)),
      () => live && setFeatured([]),
    );
    return () => {
      live = false;
    };
  }, [branch]);

  // Rotate every 6 seconds; pause while the shopper is pointing at it
  useEffect(() => {
    if (featured.length < 2 || paused) return;
    const t = setInterval(() => setAt((n) => (n + 1) % featured.length), 6000);
    return () => clearInterval(t);
  }, [featured.length, paused]);

  const pay = config.paymentMethods.includes("online") ? "Pay online or in person" : "Pay when you collect or on delivery";
  const where = mine
    ? `Your branch: ${mine.name}`
    : locations.length === 1
      ? `In stock at ${locations[0].name}`
      : locations.length > 1
        ? `In stock at ${locations.length} branches`
        : "Live prices from our store";
  const item = featured[at % Math.max(1, featured.length)];

  return (
    <section
      className={`welcome ${item ? "welcome--featured" : ""}`}
      aria-label="Welcome"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="welcome__glow" aria-hidden="true" />
      <div className="welcome__copy">
        <p className="welcome__hi">{greeting()} 👋</p>
        <h1 className="welcome__title">
          {total != null ? (
            <>
              <span className="welcome__num">{total.toLocaleString()}</span> products ready to order
            </>
          ) : (
            "Everything on our shelves, ready to order"
          )}
        </h1>
        <ul className="welcome__points">
          <li>
            {where}
            {locations.length > 1 && (
              <button className="welcome__change" onClick={openBranchPicker}>
                {mine ? "Change" : "Choose yours"}
              </button>
            )}
          </li>
          <li>{pay}</li>
          <li>No account needed</li>
        </ul>
      </div>
      {item && <Featured key={item.code} item={item} count={featured.length} at={at} onPick={setAt} />}
    </section>
  );
}

function Featured({ item, count, at, onPick }: { item: CatalogueItem; count: number; at: number; onPick: (n: number) => void }) {
  const cart = useCart();
  const [added, setAdded] = useState(false);
  const inCart = cart.lines.find((l) => l.code === item.code)?.qty ?? 0;
  const locations = useLocations();
  const { code: branchCode } = useBranchState();
  const max = availableFor(item, locations, branchCode).qty;

  return (
    <article className="feature">
      <Link to={productPath(item.code)} viewTransition className="feature__media">
        <img src={item.imageUrl!} alt={item.description} />
      </Link>
      <div className="feature__info">
        <p className="feature__tag">
          <Icon name="sparkles" /> Featured
        </p>
        <Link to={productPath(item.code)} viewTransition className="feature__name">
          {item.description}
        </Link>
        <p className="feature__price">{formatMoney(item.priceIncl)}</p>
        <button
          className={`btn btn--block feature__add ${added ? "btn--added" : ""}`}
          disabled={inCart >= max}
          onClick={(e) => {
            flyToCart(e.currentTarget, e.currentTarget.closest(".feature")?.querySelector("img"));
            cart.add({ code: item.code, description: item.description, qty: 1, unitPriceIncl: item.priceIncl! }, max);
            setAdded(true);
            setTimeout(() => setAdded(false), 1400);
          }}
        >
          {added ? (
            <>
              <Icon name="check" /> Added
            </>
          ) : inCart >= max ? (
            "All in your cart"
          ) : (
            <>
              <Icon name="bag" /> Add to cart
            </>
          )}
        </button>
        {count > 1 && (
          <div className="feature__dots" role="tablist" aria-label="Featured products">
            {Array.from({ length: count }, (_, n) => (
              <button key={n} role="tab" aria-selected={n === at} aria-label={`Featured product ${n + 1}`} onClick={() => onPick(n)} />
            ))}
          </div>
        )}
      </div>
    </article>
  );
}
