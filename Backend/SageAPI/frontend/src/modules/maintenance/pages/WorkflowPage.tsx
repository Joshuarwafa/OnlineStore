import { ArrowRight, CircleCheck, CircleX, FileText, PackageCheck, ReceiptText, Save, ShoppingCart, TriangleAlert, Undo2, Workflow as WorkflowIcon } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { PageHeader } from "../../../shared/PageHeader";
import { StatusBanner } from "../../../shared/StatusBanner";
import { type Workflow, getWorkflow, saveWorkflow } from "../workflow";

type Start = "SalesOrder" | "Invoice";

/** The page's choices, as a workflow the store backend understands. */
interface Choices {
  start: Start;
  reserveStock: boolean;
  allowQuotation: boolean;
}

const toChoices = (w: Workflow): Choices => ({
  start: w.steps[0]?.document === "Invoice" ? "Invoice" : "SalesOrder",
  reserveStock: w.steps[0]?.reserveStock !== false,
  allowQuotation: w.allowQuotation,
});

const toWorkflow = (c: Choices): Workflow => ({
  steps: [c.start === "Invoice" ? { document: "Invoice", trigger: "checkout" } : { document: "SalesOrder", trigger: "checkout", reserveStock: c.reserveStock }],
  allowQuotation: c.allowQuotation,
});

const same = (a: Choices, b: Choices) => JSON.stringify(a) === JSON.stringify(b);

/** One line of the flow preview: shopper → document → document. */
function FlowLine({ start, steps }: { start: string; steps: string[] }) {
  return (
    <p className="flow-line">
      <span className="flow-pill muted">
        <ShoppingCart size={14} aria-hidden="true" /> {start}
      </span>
      {steps.map((s) => (
        <span key={s} className="flow-line__step">
          <ArrowRight size={14} aria-hidden="true" />
          <span className="flow-pill">{s}</span>
        </span>
      ))}
    </p>
  );
}

/**
 * Maintenance → Workflow: what an online order becomes in Sage Evolution, set by the admin to suit
 * how their customers buy.
 */
export function WorkflowPage() {
  const [saved, setSaved] = useState<Choices | null>(null);
  const [form, setForm] = useState<Choices | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const c = toChoices(await getWorkflow());
      setSaved(c);
      setForm(c);
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

  const update = (patch: Partial<Choices>) => {
    setForm((f) => (f ? { ...f, ...patch } : f));
    setJustSaved(false);
    setError(null);
  };

  const dirty = !!saved && !!form && !same(saved, form);

  const onSave = async (e: FormEvent) => {
    e.preventDefault();
    if (!form) return;
    setSaving(true);
    setError(null);
    try {
      const c = toChoices(await saveWorkflow(toWorkflow(form)));
      setSaved(c);
      setForm(c);
      setJustSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const orderName = form?.start === "Invoice" ? "Invoice" : `Sales order${form?.reserveStock ? " (stock held)" : ""}`;

  return (
    <>
      <PageHeader
        title="Workflow"
        subtitle="What an online order becomes in Sage Evolution. Set it to suit how your customers buy."
        loadedAt={loadedAt}
        loading={loading}
        onRefresh={load}
      />

      <StatusBanner loading={loading && !saved} error={loadError} onRetry={load} loadingText="Loading workflow…" />

      {form && saved && (
        <form className="settings-form" onSubmit={onSave}>
          <section className="panel form-panel">
            <h2 className="card-title">
              <WorkflowIcon size={17} aria-hidden="true" />
              When a shopper places an order, create
            </h2>
            <div className="workflow-choices" role="radiogroup" aria-label="When a shopper places an order, create">
              <label className={`workflow-choice${form.start === "SalesOrder" ? " on" : ""}`}>
                <input type="radio" name="start" checked={form.start === "SalesOrder"} onChange={() => update({ start: "SalesOrder" })} />
                <span className="workflow-choice__title">
                  <PackageCheck size={18} aria-hidden="true" />A sales order
                </span>
                <span className="workflow-choice__text">Saved in Sage as an open order. Staff invoice it in Sage when the customer pays or collects.</span>
              </label>
              <label className={`workflow-choice${form.start === "Invoice" ? " on" : ""}`}>
                <input type="radio" name="start" checked={form.start === "Invoice"} onChange={() => update({ start: "Invoice" })} />
                <span className="workflow-choice__title">
                  <ReceiptText size={18} aria-hidden="true" />
                  An invoice straight away
                </span>
                <span className="workflow-choice__text">Stock goes out and the sale is posted in Sage the moment the shopper checks out.</span>
              </label>
            </div>

            {form.start === "SalesOrder" ? (
              <div className="workflow-options">
                <label className="workflow-check">
                  <input type="checkbox" checked={form.reserveStock} onChange={(e) => update({ reserveStock: e.target.checked })} />
                  <span>
                    <strong>Reserve the stock</strong>
                    <small className="muted">
                      Each line is held in its branch's warehouse, and the shop offers only stock that isn't reserved. Cancel orders
                      that are never collected in Sage, or the stock stays held.
                    </small>
                  </span>
                </label>
              </div>
            ) : (
              <div className="banner warn inset-top">
                <span className="banner-text">
                  <TriangleAlert size={18} aria-hidden="true" />
                  Every checkout is invoiced at once, including pay-on-collection orders. If a customer never comes, you'll need a
                  credit note in Sage. Best when customers pay before they check out.
                </span>
              </div>
            )}
          </section>

          <section className="panel form-panel">
            <h2 className="card-title">
              <FileText size={17} aria-hidden="true" />
              Quotations
            </h2>
            <label className="workflow-check">
              <input type="checkbox" checked={form.allowQuotation} onChange={(e) => update({ allowQuotation: e.target.checked })} />
              <span>
                <strong>Let shoppers ask for a quotation instead of ordering</strong>
                <small className="muted">
                  Checkout shows a "Just get a quotation" button. The quotation is saved in Sage and nothing is held. When the customer
                  goes ahead, staff convert it to a sales order in Sage Evolution.
                </small>
              </span>
            </label>
          </section>

          <section className="panel form-panel">
            <h2 className="card-title">How orders will flow</h2>
            <FlowLine start="Shopper places an order" steps={[orderName]} />
            {form.allowQuotation && <FlowLine start="Shopper asks for a quotation" steps={["Quotation"]} />}
            <p className="muted small workflow-note">
              Every document is saved in the store database first, then created in Sage, or marked Failed with Sage's reason in{" "}
              <Link to="/sales/documents">Sales → Documents</Link>, where it can be tried again. Changes apply to new checkouts.
            </p>
          </section>

          {error && (
            <div className="banner error" role="alert">
              <span className="banner-text">
                <CircleX size={18} aria-hidden="true" />
                {error}
              </span>
            </div>
          )}

          <div className="form-actions">
            <span className="muted small">
              {justSaved ? (
                <>
                  <CircleCheck size={14} aria-hidden="true" /> Saved.
                </>
              ) : dirty ? (
                "You have unsaved changes."
              ) : (
                ""
              )}
            </span>
            <div className="page-actions">
              {dirty && (
                <button type="button" className="button" onClick={() => setForm(saved)} disabled={saving}>
                  <Undo2 size={15} aria-hidden="true" />
                  Undo changes
                </button>
              )}
              <button type="submit" className="button primary" disabled={!dirty || saving}>
                <Save size={15} aria-hidden="true" />
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </form>
      )}
    </>
  );
}
