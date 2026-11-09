import { useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useCart } from "../state/cart";
import { formatMoney, productPath } from "../lib/format";
import { QtyStepper } from "./bits";
import { Icon } from "./Icon";

/** The cart. Used in the slide-out drawer and on /cart. */
export function DocketBody({ onNavigate, compact = false }: { onNavigate?: () => void; compact?: boolean }) {
  const cart = useCart();
  const navigate = useNavigate();

  return (
    <div className={`docket ${compact ? "docket--compact" : ""}`}>
      <header className="docket__head">
        <span className="docket__title">Your cart</span>
        <span className="mono docket__meta">
          {cart.count} {cart.count === 1 ? "item" : "items"}
        </span>
      </header>

      {cart.lines.length === 0 ? (
        <div className="docket__empty">
          <p>Your cart is empty.</p>
          <Link className="btn btn--ghost" to="/" onClick={onNavigate}>
            Start shopping
          </Link>
        </div>
      ) : (
        <>
          <ul className="docket__lines">
            {cart.lines.map((l) => (
              <li key={l.code} className="docket__line">
                <div className="docket__line-top">
                  <Link to={productPath(l.code)} onClick={onNavigate} className="docket__desc">
                    {l.description}
                  </Link>
                  <span className="docket__amt">{formatMoney(l.qty * l.unitPriceIncl)}</span>
                </div>
                <div className="docket__line-bottom">
                  <span className="docket__code">{formatMoney(l.unitPriceIncl)} each</span>
                  <span className="docket__controls">
                    <QtyStepper size="sm" value={l.qty} onChange={(n) => cart.setQty(l.code, n)} label={`Quantity of ${l.description}`} />
                    <button className="linkish" onClick={() => cart.remove(l.code)} aria-label={`Remove ${l.description}`}>
                      Remove
                    </button>
                  </span>
                </div>
              </li>
            ))}
          </ul>
          <dl className="docket__totals">
            <div>
              <dt>Total (VAT included)</dt>
              <dd>{formatMoney(cart.subtotal)}</dd>
            </div>
          </dl>
          <button
            className="btn btn--signal btn--block btn--xl"
            onClick={() => {
              onNavigate?.();
              navigate("/checkout");
            }}
          >
            Check out · {formatMoney(cart.subtotal)} <Icon name="arrow" />
          </button>
          {onNavigate && (
            <button className="btn btn--ghost btn--block" onClick={onNavigate}>
              Keep shopping
            </button>
          )}
        </>
      )}
    </div>
  );
}

export function DocketDrawer() {
  const cart = useCart();
  const panel = useRef<HTMLDivElement>(null);
  const lastFocus = useRef<Element | null>(null);

  useEffect(() => {
    if (!cart.docketOpen) return;
    lastFocus.current = document.activeElement;
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && cart.closeDocket();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      (lastFocus.current as HTMLElement | null)?.focus?.();
    };
  }, [cart.docketOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className={`drawer ${cart.docketOpen ? "is-open" : ""}`} aria-hidden={!cart.docketOpen} inert={!cart.docketOpen}>
      <div className="drawer__scrim" onClick={cart.closeDocket} />
      <div className="drawer__panel" role="dialog" aria-modal="true" aria-label="Your cart" tabIndex={-1} ref={panel}>
        <button className="drawer__close" onClick={cart.closeDocket} aria-label="Close cart">
          <Icon name="close" />
        </button>
        <DocketBody onNavigate={cart.closeDocket} />
      </div>
    </div>
  );
}
