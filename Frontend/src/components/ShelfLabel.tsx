import { useEffect, useRef, useState, type MouseEvent } from "react";
import { Link, useViewTransitionState } from "react-router-dom";
import type { CatalogueItem } from "../types";
import { productPath, stockLevel } from "../lib/format";
import { useCart } from "../state/cart";
import { Price, ProductImage } from "./bits";
import { CardStock } from "./Locations";
import { availableFor, useLocations } from "../lib/locations";
import { useBranchState } from "../lib/branch";
import { flyToCart } from "../lib/flyToCart";
import { Icon } from "./Icon";

/** How long the button says "✓ Added" before turning into − qty +. */
const ADDED_MS = 1400;

/**
 * A product in the grid. One big "Add to cart" button; once added it becomes − qty +,
 * so shoppers never need to open the product page to buy.
 */
export function ShelfLabel({ item, currency, index = 0 }: { item: CatalogueItem; currency: string; index?: number }) {
  const cart = useCart();
  const inCart = cart.lines.find((l) => l.code === item.code)?.qty ?? 0;
  const locations = useLocations();
  const { code: branchCode } = useBranchState();
  // With a branch chosen, shoppers can only take what that branch has
  const max = availableFor(item, locations, branchCode).qty;
  const orderable = item.priceIncl != null && max > 0;
  const level = stockLevel(item.qtyOnHand);

  const to = productPath(item.code);
  // While opening this product, its picture carries the shared name so it glides into place
  const opening = useViewTransitionState(to);

  // Brief "✓ Added" confirmation after the first tap
  const [justAdded, setJustAdded] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const add = (e?: MouseEvent<HTMLElement>) => {
    if (e && inCart === 0) {
      const card = e.currentTarget.closest(".label");
      flyToCart(e.currentTarget, card?.querySelector(".label__swatch"));
      setJustAdded(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setJustAdded(false), ADDED_MS);
    } else if (e) {
      flyToCart(e.currentTarget);
    }
    cart.add({ code: item.code, description: item.description, qty: 1, unitPriceIncl: item.priceIncl! }, max);
  };

  return (
    <article className={`label label--simple ${level === "out" ? "label--out" : ""}`} style={{ animationDelay: `${Math.min(index, 12) * 35}ms` }}>
      <Link to={to} className="label__link" viewTransition>
        <span className="label__media">
          <ProductImage
            code={item.code}
            description={item.description}
            url={item.imageUrl}
            className="label__swatch"
            style={opening ? { viewTransitionName: "product-image" } : undefined}
          />
        </span>
        <span className="label__body">
          <h3 className="label__name" style={opening ? { viewTransitionName: "product-title" } : undefined}>
            {item.description}
          </h3>
        </span>
      </Link>
      <div className="label__foot">
        <Price amount={item.priceIncl} currency={currency} />
        <CardStock item={item} />
      </div>
      <div className="label__buy">
        {!orderable ? (
          <button className="btn btn--block" disabled>
            {item.priceIncl == null ? "Call to order" : item.qtyOnHand >= 1 ? "Not at your branch" : "Sold out"}
          </button>
        ) : justAdded && inCart > 0 ? (
          <button className="btn btn--block btn--added" onClick={() => setJustAdded(false)} aria-live="polite">
            <Icon name="check" /> Added
          </button>
        ) : inCart > 0 ? (
          <div className="addqty" role="group" aria-label={`${item.description} in cart`}>
            <button onClick={() => cart.setQty(item.code, inCart - 1)} aria-label={inCart === 1 ? "Remove from cart" : "One less"}>
              <Icon name="minus" />
            </button>
            <span aria-live="polite">{inCart} in cart</span>
            <button onClick={(e) => add(e)} disabled={inCart >= max} aria-label="One more" title={inCart >= max ? "That's all we have" : undefined}>
              <Icon name="plus" />
            </button>
          </div>
        ) : (
          <button className="btn btn--signal btn--block btn--add" onClick={(e) => add(e)}>
            <Icon name="bag" /> Add to cart
          </button>
        )}
      </div>
    </article>
  );
}

export function ShelfLabelSkeleton() {
  return (
    <div className="label label--skeleton" aria-hidden="true">
      <div className="label__swatch sk" style={{ borderRadius: 0 }} />
      <div className="sk sk--line" style={{ width: "85%" }} />
      <div className="sk sk--line" style={{ width: "40%" }} />
    </div>
  );
}

export function LabelGrid({ children, dense = false }: { children: React.ReactNode; dense?: boolean }) {
  return <div className={`label-grid ${dense ? "label-grid--dense" : ""}`}>{children}</div>;
}
