import { useCallback, useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api } from "../api/store";
import { ApiError } from "../api/client";
import { config, paymentLabels } from "../config";
import type { Company, OrderStatus, OrderStatusCode } from "../types";
import { formatDateTime, formatMoney } from "../lib/format";
import { useDocumentTitle } from "../lib/useAsync";
import { recallOrderContact, rememberOrderContact } from "../lib/orders";
import { ErrorPanel, Spinner } from "../components/bits";
import { TrackForm } from "./Track";
import { QuotationDoc } from "../components/QuotationDoc";

// Shopper-facing steps. "Posted" = the quotation is saved in Sage.
const STEPS: { key: "received" | "booked" | "ready"; title: string; note: string }[] = [
  { key: "received", title: "Received", note: "We have your cart." },
  { key: "booked", title: "Quotation ready", note: "Your quotation is saved with us." },
  { key: "ready", title: "We'll call you", note: "To confirm stock, payment and collection or delivery." },
];

function stepIndex(s: OrderStatusCode): number {
  if (s === "Posted") return 1;
  return 0;
}

export function Order() {
  const no = useParams().no ?? "";
  const [params] = useSearchParams();
  const isNew = params.get("new") === "1";
  const location = useLocation();
  const navigate = useNavigate();
  const email = (location.state as { contact?: string } | null)?.contact ?? recallOrderContact(no);

  const [order, setOrder] = useState<OrderStatus>();
  const [error, setError] = useState<Error>();
  const [attempt, setAttempt] = useState(0);
  const [company, setCompany] = useState<Company | null>(null);

  // The company's own details for the top of the printed quotation (admin → Maintenance → Company).
  // Re-read whenever the shopper comes back to this tab, so a change saved in the admin shows
  // without reloading, and again right before printing.
  const loadCompany = useCallback(async () => {
    try {
      const c = await api.company();
      setCompany(c);
      return c;
    } catch {
      return null; // prints without a company heading
    }
  }, []);

  useEffect(() => {
    void loadCompany();
    const onVisible = () => document.visibilityState === "visible" && void loadCompany();
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [loadCompany]);

  const printQuotation = async () => {
    await loadCompany();
    // let React draw the fresh details before the print dialog takes its snapshot
    requestAnimationFrame(() => requestAnimationFrame(() => window.print()));
  };

  useDocumentTitle(`Quotation ${no}`, config.storeName);

  useEffect(() => {
    if (!email) return;
    let live = true;
    let timer: ReturnType<typeof setTimeout>;
    const load = async () => {
      try {
        const o = await api.order(no, email);
        if (!live) return;
        setOrder(o);
        setError(undefined);
        rememberOrderContact(o.storeOrderNo, email);
        // Keep watching while the order is still on its way into Sage
        if (o.status === "Pending" || o.status === "Processing") timer = setTimeout(load, config.statusPollMs);
      } catch (e) {
        if (live) setError(e instanceof Error ? e : new Error(String(e)));
      }
    };
    load();
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [no, email, attempt]);

  if (!email) {
    return (
      <div className="page page--narrow">
        <header className="page__head">
          <p className="eyebrow">Order {no}</p>
          <h1 className="page__title">Confirm it's yours</h1>
        </header>
        <p className="lede">Enter the phone number you gave at checkout to see this quotation.</p>
        <TrackForm initialNo={no} onFound={(n, e) => navigate(`/order/${encodeURIComponent(n)}`, { replace: true, state: { contact: e } })} />
      </div>
    );
  }

  if (error && !order) {
    return (
      <div className="page page--narrow">
        <ErrorPanel
          error={error}
          title={error instanceof ApiError && error.status === 404 ? "Quotation not found" : "We couldn't load this quotation"}
          onRetry={() => setAttempt((a) => a + 1)}
        />
        <Link to="/track" className="linkish">
          Look up a different quotation
        </Link>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="page page--narrow order-loading">
        <Spinner /> Opening quotation {no}…
      </div>
    );
  }

  const failed = order.status === "Failed";
  const cancelled = order.status === "Cancelled";
  const at = stepIndex(order.status);

  return (
    <div className="page order">
      {isNew && (
        <div className="order__thanks">
          <p className="eyebrow">Thank you{order.shopperName ? `, ${order.shopperName.split(" ")[0]}` : ""}</p>
          <h1 className="page__title">Your quotation is ready.</h1>
          <p className="lede">
            {order.sageDocumentNo ? (
              <>
                Quotation <strong className="mono">{order.sageDocumentNo}</strong> is saved with us.{" "}
              </>
            ) : null}
            We'll call you to confirm. Keep your number in case you need it.
          </p>
        </div>
      )}

      <div className="stub">
        <div className="stub__main">
          <span className="stub__label">Your number</span>
          <span className="stub__no mono">{order.storeOrderNo}</span>
          <span className="stub__meta">
            {formatDateTime(order.placedAt)} · {order.fulfilment === "delivery" ? "Delivery" : `Collect${order.branchName ? ` at ${order.branchName}` : ""}`} ·{" "}
            {paymentLabels[order.payment].title}
          </span>
          {order.status === "Posted" && (
            <span className={`stamp stamp--ok ${isNew ? "is-fresh" : ""}`} aria-hidden="true">
              Quoted
            </span>
          )}
          {failed && (
            <span className="stamp stamp--hold" aria-hidden="true">
              On hold
            </span>
          )}
        </div>
        <div className="stub__side">
          <span className="stub__label">Total</span>
          <span className="stub__total">{formatMoney(order.totalIncl, order.currency)}</span>
          {order.sageDocumentNo && (
            <>
              <span className="stub__label">Quotation</span>
              <span className="mono">{order.sageDocumentNo}</span>
            </>
          )}
        </div>
      </div>

      {cancelled ? (
        <div className="panel">
          <p className="panel__title">This quotation was cancelled</p>
          <p>If that's unexpected, contact us and give your number.</p>
        </div>
      ) : (
        <ol className={`track ${failed ? "track--hold" : ""}`} aria-label="Progress">
          {STEPS.map((s, i) => {
            const state = failed ? (i === 0 ? "done" : i === 1 ? "hold" : "next") : i < at ? "done" : i === at ? "now" : "next";
            return (
              <li key={s.key} className={`track__step is-${state}`} aria-current={state === "now" ? "step" : undefined}>
                <span className="track__dot" aria-hidden="true" />
                <span className="track__title">{s.title}</span>
                <span className="track__note">
                  {state === "hold"
                    ? "We're sorting out a small delay. There's no need to ask again. We'll call you."
                    : s.note}
                </span>
              </li>
            );
          })}
        </ol>
      )}

      {error && order && <p className="order__live order__live--warn">Couldn't refresh just now. Showing the last status we saw.</p>}

      <section className="qdoc-wrap" aria-label="Your quotation">
        <div className="qdoc-wrap__head">
          <h2>Your quotation</h2>
          <button className="btn btn--ghost" onClick={printQuotation}>
            Print or save as PDF
          </button>
        </div>
        <div className="qdoc-scroll">
          <QuotationDoc order={order} company={company} />
        </div>
      </section>

      <div className="order__actions">
        <Link to="/" className="btn btn--signal">
          Keep shopping
        </Link>
        <button className="btn btn--ghost" onClick={printQuotation}>
          Print quotation
        </button>
      </div>
    </div>
  );
}
