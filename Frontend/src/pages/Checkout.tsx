import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api/store";
import { ApiError } from "../api/client";
import { config, paymentLabels } from "../config";
import type { Fulfilment, PaymentMethod, Quote } from "../types";
import { formatMoney } from "../lib/format";
import { useDocumentTitle } from "../lib/useAsync";
import { rememberOrderContact } from "../lib/orders";
import { useCart } from "../state/cart";
import { openBranchPicker, useBranchState } from "../lib/branch";
import { myBranchOf, PICKER_FROM, useLocations } from "../lib/locations";
import { Empty, Spinner } from "../components/bits";
import { Icon } from "../components/Icon";

type Errors = Partial<Record<"name" | "phone" | "email" | "address", string>>;

interface Change {
  code: string;
  text: string;
}

/**
 * One short form and one button. Only name and phone are required.
 * Pressing the button turns the cart into a quotation in Sage Evolution. Prices and stock are
 * re-checked first (at the shopper's branch); the shopper only sees that step if something changed.
 */
export function Checkout() {
  useDocumentTitle("Checkout", config.storeName);
  const cart = useCart();
  const navigate = useNavigate();
  const locations = useLocations();
  const { code: branchCode } = useBranchState();
  // With several branches the quotation is for the shopper's branch; with one, it's simply that one
  const branch = myBranchOf(locations, branchCode) ?? (locations.length === 1 ? locations[0] : null);
  const collectAt = branch?.name ?? config.collectionPoint;

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [fulfilment, setFulfilment] = useState<Fulfilment>(config.fulfilment[0]);
  const [address, setAddress] = useState("");
  const [payment, setPayment] = useState<PaymentMethod>(config.paymentMethods[0]);
  const [errors, setErrors] = useState<Errors>({});

  const [busy, setBusy] = useState(false);
  const [changes, setChanges] = useState<Change[]>([]);
  const [failure, setFailure] = useState<string | null>(null);

  // One key per order attempt. Pressing the button again after a network hiccup reuses it,
  // so the backend returns the order it already has instead of creating a second one.
  const idempotencyKey = useRef(crypto.randomUUID());

  const payments = config.paymentMethods.filter((m) => (fulfilment === "collection" ? m !== "on_delivery" : m !== "on_collection"));
  const activePayment = payments.includes(payment) ? payment : payments[0];

  if (cart.lines.length === 0 && !busy) {
    return (
      <div className="page page--narrow">
        <Empty title="Your cart is empty">
          <Link to="/" className="btn btn--signal">
            Start shopping
          </Link>
        </Empty>
      </div>
    );
  }

  function validate(): boolean {
    const e: Errors = {};
    if (name.trim().length < 2) e.name = "Please enter your name.";
    if (phone.replace(/\D/g, "").length < 7) e.phone = "Please enter a phone number we can call.";
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) e.email = "This email doesn't look right. You can also leave it empty.";
    if (fulfilment === "delivery" && address.trim().length < 5) e.address = "Where should we deliver to?";
    setErrors(e);
    const first = Object.keys(e)[0];
    if (first) document.getElementById(`f-${first}`)?.focus();
    return !first;
  }

  /** Brings the cart in line with Sage and lists what changed, in plain words. */
  function applyQuote(q: Quote): Change[] {
    const found: Change[] = [];
    for (const l of cart.lines) {
      const ql = q.lines.find((x) => x.code === l.code);
      if (!ql) continue;
      if (ql.status === "unavailable") {
        found.push({ code: l.code, text: `${l.description} is sold out, so we took it out of your cart.` });
        cart.remove(l.code);
        continue;
      }
      if (ql.status === "short" && Math.floor(ql.available) <= 0) {
        found.push({ code: l.code, text: `${l.description} is sold out, so we took it out of your cart.` });
        cart.remove(l.code);
        continue;
      }
      if (ql.status === "short") {
        const left = Math.floor(ql.available);
        found.push({ code: l.code, text: `${l.description}: only ${left} left, so your cart now has ${left}.` });
        cart.setQty(l.code, left);
      }
      if (Math.abs(ql.unitPriceIncl - l.unitPriceIncl) > 0.001) {
        found.push({
          code: l.code,
          text: `${l.description} is now ${formatMoney(ql.unitPriceIncl)} (was ${formatMoney(l.unitPriceIncl)}).`,
        });
        cart.reprice(l.code, ql.unitPriceIncl);
      }
    }
    return found;
  }

  async function placeOrder() {
    setFailure(null);
    if (!validate()) return;
    setBusy(true);
    try {
      // Re-check prices and stock first. If anything moved, show it and let the shopper press again.
      const quote = await api.quote(
        cart.lines.map(({ code, qty }) => ({ code, qty })),
        branch?.code,
      );
      const found = applyQuote(quote);
      if (found.length) {
        setChanges(found);
        idempotencyKey.current = crypto.randomUUID();
        setBusy(false);
        return;
      }
      setChanges([]);

      const res = await api.placeOrder(
        {
          shopper: { name: name.trim(), phone: phone.trim(), email: email.trim() },
          fulfilment,
          address:
            fulfilment === "delivery"
              ? { line1: address.trim(), line2: "", suburb: "", city: config.storeLabel, postalCode: "", notes: "" }
              : null,
          payment: activePayment,
          branch: branch?.code ?? null,
          lines: cart.lines.map(({ code, qty }) => ({ code, qty })),
        },
        idempotencyKey.current,
      );
      rememberOrderContact(res.storeOrderNo, phone.trim());
      cart.clear();
      navigate(`/order/${encodeURIComponent(res.storeOrderNo)}?new=1`, { replace: true });
    } catch (e) {
      if (e instanceof ApiError && e.status === 409 && e.body && typeof e.body === "object" && "lines" in e.body) {
        // Stock moved in the last second: show what changed and start a fresh attempt
        setChanges(applyQuote(e.body as Quote));
        idempotencyKey.current = crypto.randomUUID();
      } else {
        // Network or server trouble: keep the same key, so pressing again is safe
        setFailure(e instanceof Error ? e.message : String(e));
      }
      setBusy(false);
    }
  }

  const field = (
    id: keyof Errors,
    label: string,
    value: string,
    set: (v: string) => void,
    opts: { type?: string; autoComplete?: string; optional?: boolean; placeholder?: string; inputMode?: "tel" | "email" } = {},
  ) => (
    <label className={`field field--wide ${errors[id] ? "has-error" : ""}`} htmlFor={`f-${id}`}>
      <span className="field__label">
        {label}
        {opts.optional && <em> (optional)</em>}
      </span>
      <input
        id={`f-${id}`}
        type={opts.type ?? "text"}
        inputMode={opts.inputMode}
        value={value}
        autoComplete={opts.autoComplete}
        placeholder={opts.placeholder}
        aria-invalid={!!errors[id]}
        aria-describedby={errors[id] ? `e-${id}` : undefined}
        onChange={(e) => {
          set(e.target.value);
          if (errors[id]) setErrors((x) => ({ ...x, [id]: undefined }));
        }}
      />
      {errors[id] && (
        <span className="field__error" id={`e-${id}`}>
          {errors[id]}
        </span>
      )}
    </label>
  );

  return (
    <div className="page page--narrow scheckout">
      <Link to="/" className="backlink">
        <Icon name="back" /> Keep shopping
      </Link>
      <h1 className="shop__title">Checkout</h1>

      {/* What they're buying, short and editable from the cart */}
      <section className="scheckout__box" aria-label="Your order">
        <ul className="scheckout__lines">
          {cart.lines.map((l) => (
            <li key={l.code}>
              <span>
                {l.qty} × {l.description}
              </span>
              <strong>{formatMoney(l.qty * l.unitPriceIncl)}</strong>
            </li>
          ))}
        </ul>
        <p className="scheckout__total">
          <span>Total</span>
          <strong>{formatMoney(cart.subtotal)}</strong>
        </p>
        <button type="button" className="linkish" onClick={cart.openDocket}>
          Change items
        </button>
        {locations.length >= PICKER_FROM && (
          <p className="scheckout__branch">
            <Icon name="pin" />
            {branch ? (
              <span>
                From <strong>{branch.name}</strong>
              </span>
            ) : (
              <span>Choose your branch so we check stock there</span>
            )}
            <button type="button" className="linkish" onClick={openBranchPicker}>
              {branch ? "Change" : "Choose branch"}
            </button>
          </p>
        )}
      </section>

      <form
        className="scheckout__form"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          placeOrder();
        }}
      >
        <fieldset disabled={busy}>
          {field("name", "Your name", name, setName, { autoComplete: "name" })}
          {field("phone", "Phone number", phone, setPhone, { type: "tel", inputMode: "tel", autoComplete: "tel", placeholder: "07…" })}
          {field("email", "Email", email, setEmail, { type: "email", inputMode: "email", autoComplete: "email", optional: true })}

          {config.fulfilment.length > 1 && (
            <div className="bigchoice" role="radiogroup" aria-label="Delivery or collection">
              {config.fulfilment.map((f) => (
                <label key={f} className={`bigchoice__opt ${fulfilment === f ? "is-on" : ""}`}>
                  <input type="radio" name="fulfilment" value={f} checked={fulfilment === f} onChange={() => setFulfilment(f)} />
                  <span className="bigchoice__title">{f === "delivery" ? "Deliver to me" : "I'll collect"}</span>
                  <span className="bigchoice__note">{f === "delivery" ? "We'll call you to arrange it" : collectAt}</span>
                </label>
              ))}
            </div>
          )}

          {fulfilment === "delivery" ? (
            <label className={`field field--wide ${errors.address ? "has-error" : ""}`} htmlFor="f-address">
              <span className="field__label">Delivery address</span>
              <textarea
                id="f-address"
                rows={3}
                value={address}
                autoComplete="street-address"
                placeholder="House number, street, suburb"
                aria-invalid={!!errors.address}
                onChange={(e) => {
                  setAddress(e.target.value);
                  if (errors.address) setErrors((x) => ({ ...x, address: undefined }));
                }}
              />
              {errors.address && <span className="field__error">{errors.address}</span>}
            </label>
          ) : (
            <p className="scheckout__hint">Collect from {collectAt}. We'll call you when it's ready.</p>
          )}

          {payments.length > 1 ? (
            <div className="bigchoice" role="radiogroup" aria-label="How you'll pay">
              {payments.map((m) => (
                <label key={m} className={`bigchoice__opt ${activePayment === m ? "is-on" : ""}`}>
                  <input type="radio" name="payment" value={m} checked={activePayment === m} onChange={() => setPayment(m)} />
                  <span className="bigchoice__title">{paymentLabels[m].title}</span>
                  <span className="bigchoice__note">{paymentLabels[m].note}</span>
                </label>
              ))}
            </div>
          ) : (
            activePayment && (
              <p className="scheckout__hint">
                <strong>{paymentLabels[activePayment].title}.</strong> {paymentLabels[activePayment].note}
              </p>
            )
          )}
        </fieldset>

        {changes.length > 0 && (
          <div className="changes" role="alert">
            <p className="changes__title">We've just checked our shelves and updated your cart:</p>
            <ul>
              {changes.map((c, i) => (
                <li key={`${c.code}-${i}`}>{c.text}</li>
              ))}
            </ul>
            <p>Check the new total, then press the button again.</p>
          </div>
        )}

        {failure && (
          <div className="panel panel--error" role="alert">
            <p className="panel__title">That didn't go through</p>
            <p>{failure}</p>
            <p className="panel__fine">Pressing the button again is safe. You won't get two quotations.</p>
          </div>
        )}

        <button className="btn btn--signal btn--xl btn--block" type="submit" disabled={busy || cart.lines.length === 0}>
          {busy ? (
            <>
              <Spinner label="Creating quotation" /> Creating your quotation…
            </>
          ) : (
            <>
              <Icon name="check" /> Get my quotation · {formatMoney(cart.subtotal)}
            </>
          )}
        </button>
        <p className="scheckout__fine">No account needed. You'll get a quotation number straight away, and we'll call {phone.trim() || "you"} to confirm.</p>
      </form>
    </div>
  );
}
