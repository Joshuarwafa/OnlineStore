import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api/store";
import { ApiError } from "../api/client";
import { config } from "../config";
import { formatMoney } from "../lib/format";
import { useAsync, useDocumentTitle } from "../lib/useAsync";
import { useCart } from "../state/cart";
import { flyToCart } from "../lib/flyToCart";
import { Icon } from "../components/Icon";
import { CardStock, WhereToFind } from "../components/Locations";
import { availableFor, useLocations } from "../lib/locations";
import { openBranchPicker, useBranchState } from "../lib/branch";
import { Empty, ErrorPanel, Price, ProductImage, QtyStepper, StockMeter } from "../components/bits";

export function Product() {
  // Splat route: codes like 47195/ORB arrive intact whether "/" was encoded or not
  const code = useParams()["*"] ?? "";
  const { data: p, error, reload } = useAsync(() => api.product(code), [code]);
  const cart = useCart();
  const locations = useLocations();
  const { code: branchCode } = useBranchState();
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  const [flash, setFlash] = useState(false);
  const [shown, setShown] = useState(0);

  useDocumentTitle(p?.description ?? code, config.storeName);
  useEffect(() => {
    setQty(1);
    setShown(0);
    setAdded(false);
  }, [code]);

  if (error) {
    if (error instanceof ApiError && error.status === 404) {
      return (
        <div className="page">
          <Empty title="That item isn't on our books">
            <p className="mono">{code}</p>
            <Link className="btn btn--ghost" to="/">
              Back to products
            </Link>
          </Empty>
        </div>
      );
    }
    return (
      <div className="page">
        <ErrorPanel error={error} onRetry={reload} title="We couldn't read this item from our books" />
      </div>
    );
  }

  if (!p) {
    return (
      <div className="page product product--loading" aria-busy="true">
        <div className="product__media sk" />
        <div className="product__info">
          <div className="sk sk--line" style={{ width: "30%" }} />
          <div className="sk sk--title" />
          <div className="sk sk--line" style={{ width: "50%" }} />
        </div>
      </div>
    );
  }

  const inCart = cart.lines.find((l) => l.code === p.code)?.qty ?? 0;
  // With a branch chosen, only that branch's stock can be ordered
  const { mine, qty: available } = availableFor(p, locations, branchCode);
  const canTake = Math.max(0, available - inCart);
  const orderable = p.priceIncl != null && canTake > 0;

  return (
    <div className="page">
      <Link to="/" className="backlink" viewTransition>
        <Icon name="back" /> Back to products
      </Link>

      <article className="product">
        <div className="product__gallery">
          <div className="product__media">
            <ProductImage
              code={p.code}
              description={p.description}
              url={p.images[shown]?.url ?? p.imageUrl}
              eager
              style={{ viewTransitionName: "product-image" }}
            />
          </div>
          {p.images.length > 1 && (
            <div className="product__thumbs" role="tablist" aria-label="Photos">
              {p.images.map((img, n) => (
                <button
                  key={img.id}
                  role="tab"
                  aria-selected={n === shown}
                  aria-label={`Photo ${n + 1} of ${p.images.length}`}
                  className={n === shown ? "is-active" : ""}
                  onClick={() => setShown(n)}
                >
                  <img src={img.url} alt="" loading="lazy" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="product__info">
          <h1 className="product__title" style={{ viewTransitionName: "product-title" }}>
            {p.description}
          </h1>

          <div className="product__price">
            <Price amount={p.priceIncl} currency={p.currency} size="xl" />
          </div>
          {mine ? <CardStock item={p} /> : <StockMeter qty={p.qtyOnHand} />}

          {p.priceIncl == null ? (
            <p className="notice">This item isn't priced for online orders yet. Call us and we'll sort it out.</p>
          ) : canTake <= 0 && inCart > 0 ? (
            <p className="notice">All {inCart} we have are already in your cart.</p>
          ) : p.qtyOnHand <= 0 ? (
            <p className="notice">Sold out right now. Check back soon.</p>
          ) : mine && available <= 0 ? (
            <p className="notice">
              {mine.name} doesn't have this right now. It's at another branch below.{" "}
              <button className="linkish" onClick={openBranchPicker}>
                Change branch
              </button>
            </p>
          ) : null}

          {orderable && (
            <form
              className="buybar"
              onSubmit={(e) => {
                e.preventDefault();
                const btn = e.currentTarget.querySelector("button[type=submit], button.btn--signal");
                if (btn) flyToCart(btn, document.querySelector(".product__media > *"));
                cart.add({ code: p.code, description: p.description, qty, unitPriceIncl: p.priceIncl! }, available);
                setAdded(true);
                setFlash(true);
                setTimeout(() => setFlash(false), 1500);
                setQty(1);
              }}
            >
              <QtyStepper value={Math.min(qty, Math.max(1, canTake))} onChange={setQty} max={Math.max(1, canTake)} />
              <button className={`btn btn--signal btn--grow btn--xl ${flash ? "btn--added" : ""}`} aria-live="polite">
                {flash ? (
                  <>
                    <Icon name="check" /> Added to cart
                  </>
                ) : (
                  <>
                    <Icon name="bag" /> Add to cart · {formatMoney((p.priceIncl ?? 0) * qty, p.currency)}
                  </>
                )}
              </button>
            </form>
          )}

          {(added || inCart > 0) && (
            <div className="product__next">
              <p className="product__added">✓ {inCart} in your cart</p>
              <Link to="/checkout" className="btn btn--ink btn--block btn--xl">
                Go to checkout <Icon name="arrow" />
              </Link>
              <Link to="/" className="btn btn--ghost btn--block">
                Keep shopping
              </Link>
            </div>
          )}

          <WhereToFind item={p} />

          <p className="product__code">
            Item code <span className="mono">{p.code}</span>
          </p>
        </div>
      </article>
    </div>
  );
}
