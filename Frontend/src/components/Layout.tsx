import { useEffect } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { config, isLive } from "../config";
import { useCart } from "../state/cart";
import { formatMoney } from "../lib/format";
import { DocketDrawer } from "./Docket";
import { SearchBox } from "./SearchBox";
import { Icon } from "./Icon";
import { BranchButton, BranchPicker } from "./BranchPicker";

export function Wordmark() {
  return (
    <Link to="/" className="wordmark" viewTransition aria-label={`${config.storeName} home`}>
      <span className="wordmark__mark" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      <span className="wordmark__text">{config.storeName}</span>
    </Link>
  );
}

/**
 * One simple header: name, search, cart. Everything a shopper needs stays on screen,
 * on a phone as well as a computer.
 */
export function Layout() {
  const cart = useCart();
  const { pathname, search } = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  const onShop = pathname === "/" || pathname === "/shop";
  const q = onShop ? new URLSearchParams(search).get("q") ?? "" : "";
  const telHref = `tel:${config.contactPhone.replace(/[^\d+]/g, "")}`;
  const inCheckout = pathname === "/checkout";

  return (
    <div className="shell">
      <a className="skip" href="#main">
        Skip to content
      </a>

      <header className="sheader">
        <div className="sheader__inner">
          <Wordmark />
          <div className="sheader__search">
            <SearchBox initial={q} />
          </div>
          <BranchButton />
          <button className="scart" onClick={cart.openDocket} aria-label={`Open cart, ${cart.count} items`}>
            <Icon name="bag" />
            <span className="scart__label">Cart</span>
            {cart.count > 0 && (
              <span className="scart__count" key={cart.count}>
                {cart.count}
              </span>
            )}
          </button>
        </div>
      </header>

      <main id="main" className="main">
        <Outlet />
      </main>

      {/* Sticky "go to checkout" bar on phones once something is in the cart */}
      {cart.count > 0 && !inCheckout && !cart.docketOpen && (
        <div className="checkout-bar">
          <button className="btn btn--signal btn--block btn--xl" onClick={cart.openDocket}>
            <Icon name="bag" /> View cart · {cart.count} {cart.count === 1 ? "item" : "items"} · {formatMoney(cart.subtotal)}
          </button>
        </div>
      )}

      <footer className="sfooter">
        <div className="sfooter__inner">
          <p className="sfooter__links">
            <Link to="/track">My quotations</Link>
            <Link to="/contact">Contact us</Link>
            {config.contactPhone && (
              <a href={telHref}>
                <Icon name="phone" /> Call {config.contactPhone}
              </a>
            )}
          </p>
          <p className="sfooter__fine">
            © {new Date().getFullYear()} {config.storeName} · All prices in USD, VAT included
            {!isLive("catalogue") && <span className="footer__mock"> · Demo data, not connected to Sage</span>}
          </p>
        </div>
      </footer>

      <DocketDrawer />
      <BranchPicker />
    </div>
  );
}
