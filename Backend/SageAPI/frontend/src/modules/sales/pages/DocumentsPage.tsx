import { ChevronRight, RotateCcw, Search as SearchIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "../../../shared/PageHeader";
import { SearchInput } from "../../../shared/SearchInput";
import { StatusBanner } from "../../../shared/StatusBanner";
import { formatCount } from "../../../shared/format";
import { type DocumentType, type NextAction, type OnlineOrder, type OrderStage, listOrders, runNextStep } from "../documents";

const NAMES: Record<DocumentType, string> = { Quotation: "Quotation", SalesOrder: "Sales order", Invoice: "Invoice" };
const PAYMENTS: Record<string, string> = { on_collection: "Pays on collection", on_delivery: "Pays on delivery", online: "Paid online" };

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });
const money = (n: number, currency: string) => `${currency} ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

type Filter = "all" | "problem";
const isProblem = (o: OnlineOrder) => o.next !== null;

function actionLabel(next: NextAction): string | null {
  if (!next) return null;
  if (next.kind === "retry") return `Try the ${NAMES[next.document].toLowerCase()} again`;
  return "Check in Sage";
}

function Stage({ s }: { s: OrderStage }) {
  const cls = s.status === "Posted" ? "posted" : s.status === "Failed" ? "failed" : "pending";
  const word = s.status === "Posted" ? "" : s.status === "Pending" ? " · waiting for Sage" : ` · ${s.status.toLowerCase()}`;
  return (
    <span className={`doc-stage ${cls}`} title={s.failReason ?? undefined}>
      <span className="doc-dot" aria-hidden="true" />
      {NAMES[s.documentType]}
      {s.sageDocumentNo && <span className="mono">{s.sageDocumentNo}</span>}
      {word}
    </span>
  );
}

/**
 * Sales → Documents: every online order with the document it became in Sage (quotation, sales
 * order or invoice) and its status. A document Sage refused can be tried again from here.
 */
export function DocumentsPage() {
  const [orders, setOrders] = useState<OnlineOrder[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [rowError, setRowError] = useState<{ no: string; message: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setOrders(await listOrders());
      setLoadedAt(new Date());
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const counts = useMemo(
    () => ({ all: orders?.length ?? 0, problem: orders?.filter(isProblem).length ?? 0 }),
    [orders],
  );

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (orders ?? [])
      .filter((o) => (filter === "problem" ? isProblem(o) : true))
      .filter(
        (o) =>
          !q ||
          o.storeOrderNo.toLowerCase().includes(q) ||
          o.customerName.toLowerCase().includes(q) ||
          o.customerPhone.replace(/\D/g, "").includes(q.replace(/\D/g, "") || "\u0000") ||
          o.stages.some((s) => s.sageDocumentNo?.toLowerCase().includes(q)),
      );
  }, [orders, filter, query]);

  const run = async (o: OnlineOrder) => {
    setBusy(o.storeOrderNo);
    setRowError(null);
    try {
      const updated = await runNextStep(o.storeOrderNo);
      setOrders((list) => list?.map((x) => (x.storeOrderNo === o.storeOrderNo ? updated : x)) ?? null);
    } catch (e) {
      setRowError({ no: o.storeOrderNo, message: e instanceof Error ? e.message : String(e) });
      void load(); // show where it got to
    } finally {
      setBusy(null);
    }
  };

  const filters: { id: Filter; label: string }[] = [
    { id: "all", label: "All" },
    { id: "problem", label: "Problems" },
  ];

  return (
    <>
      <PageHeader
        title="Documents"
        subtitle="Online orders and the documents they have become in Sage. A document Sage refused can be tried again here."
        loadedAt={loadedAt}
        loading={loading}
        onRefresh={load}
      />

      <StatusBanner loading={loading && !orders} error={loadError} onRetry={load} loadingText="Loading online orders…" />

      {orders && (
        <section className="panel">
          <div className="panel-toolbar">
            <div className="chips" role="group" aria-label="Show">
              {filters.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  className={`chip ${filter === f.id ? "active" : ""} ${f.id === "problem" && counts.problem > 0 ? "warn" : ""}`}
                  aria-pressed={filter === f.id}
                  onClick={() => setFilter(f.id)}
                >
                  {f.label} <span className="chip-count">{formatCount(counts[f.id])}</span>
                </button>
              ))}
            </div>
            <SearchInput placeholder="Search number, name, phone or Sage number" value={query} onChange={setQuery} />
          </div>

          {shown.length === 0 ? (
            <div className="empty-state">
              <SearchIcon size={20} aria-hidden="true" />
              <p>{orders.length === 0 ? "No online orders yet." : "No orders match."}</p>
            </div>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Order</th>
                    <th>Customer</th>
                    <th>In Sage</th>
                    <th className="num">Total</th>
                    <th aria-label="Next step" />
                  </tr>
                </thead>
                <tbody>
                  {shown.map((o) => {
                    const label = actionLabel(o.next);
                    const failed = o.stages.find((s) => s.status === "Failed");
                    return (
                      <FragmentRows key={o.storeOrderNo}>
                        <tr>
                          <td>
                            <span className="mono">{o.storeOrderNo}</span>
                            <div className="muted small">{dateFormat.format(new Date(o.placedAt))}</div>
                          </td>
                          <td>
                            <div className="doc-who">
                              <span>{o.customerName}</span>
                              <span className="muted small">
                                {o.customerPhone} · {o.fulfilment === "delivery" ? "Delivery" : `Collect${o.branchName ? ` at ${o.branchName}` : ""}`} ·{" "}
                                {PAYMENTS[o.payment] ?? o.payment}
                              </span>
                            </div>
                          </td>
                          <td>
                            <div className="doc-stages">
                              {o.stages.map((s, i) => (
                                <span key={s.documentType} className="doc-stages">
                                  {i > 0 && <ChevronRight size={14} className="doc-stage-sep" aria-hidden="true" />}
                                  <Stage s={s} />
                                </span>
                              ))}
                            </div>
                            {failed?.failReason && <span className="doc-reason">Sage: {failed.failReason}</span>}
                          </td>
                          <td className="num">{money(o.totalIncl, o.currency)}</td>
                          <td className="num">
                            {label ? (
                              <button
                                type="button"
                                className="button small"
                                onClick={() => run(o)}
                                disabled={busy !== null}
                              >
                                <RotateCcw size={14} aria-hidden="true" />
                                {busy === o.storeOrderNo ? "Working…" : label}
                              </button>
                            ) : (
                              <span className="muted small">In Sage</span>
                            )}
                          </td>
                        </tr>
                        {rowError?.no === o.storeOrderNo && (
                          <tr className="doc-row-error">
                            <td colSpan={5} role="alert">
                              {rowError.message}
                            </td>
                          </tr>
                        )}
                      </FragmentRows>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </>
  );
}

function FragmentRows({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
