import { Building2, CircleCheck, CircleX, FileText, Save, Undo2 } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { PageHeader } from "../../../shared/PageHeader";
import { StatusBanner } from "../../../shared/StatusBanner";
import { type Company, getCompany, saveCompany } from "../company";

const EMPTY: Company = { name: "", address: ["", "", "", ""], taxNumber: "", telephone: "", fax: "", email: "", footer: "" };

const same = (a: Company, b: Company) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Maintenance → Company: the company's own details, printed at the top of every quotation.
 * These are the seller's details and stay the same on every document.
 */
export function CompanyPage() {
  const [saved, setSaved] = useState<Company | null>(null);
  const [form, setForm] = useState<Company>(EMPTY);
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
      const c = await getCompany();
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

  const dirty = !!saved && !same(form, saved);

  const update = <K extends keyof Company>(key: K, value: Company[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setJustSaved(false);
    setError(null);
  };
  const updateLine = (i: number, value: string) => update("address", form.address.map((l, j) => (j === i ? value : l)));

  const onSave = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const c = await saveCompany(form);
      setSaved(c);
      setForm(c);
      setJustSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const input = (label: string, value: string, set: (v: string) => void, opts: { placeholder?: string; span?: boolean; type?: string } = {}) => (
    <label className={`field${opts.span ? " span-2" : ""}`}>
      <span>{label}</span>
      <input type={opts.type ?? "text"} value={value} onChange={(e) => set(e.target.value)} placeholder={opts.placeholder} autoComplete="off" />
    </label>
  );

  return (
    <>
      <PageHeader
        title="Company"
        subtitle="Your company's details, printed at the top of every quotation. They stay the same on every document. The customer's details come from each quotation."
        loadedAt={loadedAt}
        loading={loading}
        onRefresh={load}
      />

      <StatusBanner loading={loading && !saved} error={loadError} onRetry={load} loadingText="Loading company details…" />

      {saved && (
        <form className="settings-form" onSubmit={onSave}>
          {!saved.name && (
            <div className="banner warn">
              <span className="banner-text">
                <Building2 size={18} aria-hidden="true" />
                Not filled in yet. Quotations print without a company heading until you save these details.
              </span>
            </div>
          )}

          <section className="panel form-panel">
            <h2 className="card-title">
              <Building2 size={17} aria-hidden="true" />
              Company
            </h2>
            <div className="form-grid">
              {input("Company name", form.name, (v) => update("name", v), { placeholder: "e.g. The Cold Chain (Pvt) Ltd", span: true })}
              {form.address.map((line, i) => (
                <label key={i} className="field">
                  <span>Address line {i + 1}</span>
                  <input
                    value={line}
                    onChange={(e) => updateLine(i, e.target.value)}
                    placeholder={["4 Empress Street", "Belmont", "Bulawayo", ""][i]}
                    autoComplete="off"
                  />
                </label>
              ))}
              {input("Tax registration", form.taxNumber, (v) => update("taxNumber", v), { placeholder: "e.g. 220051189" })}
              {input("Telephone", form.telephone, (v) => update("telephone", v), { placeholder: "e.g. 08677 00 40 88" })}
              {input("Fax", form.fax, (v) => update("fax", v))}
              {input("Email", form.email, (v) => update("email", v), { type: "email", placeholder: "e.g. sales@company.co.zw" })}
            </div>
          </section>

          <section className="panel form-panel">
            <h2 className="card-title">
              <FileText size={17} aria-hidden="true" />
              Bottom of the quotation
            </h2>
            <div className="form-grid">
              <label className="field span-2">
                <span>Footer text (optional)</span>
                <textarea
                  rows={4}
                  value={form.footer}
                  onChange={(e) => update("footer", e.target.value)}
                  placeholder={"e.g. Bank: CABS · Acc 1000 000 000 · Branch Bulawayo\nPrices valid for 7 days."}
                />
                <small className="muted">Bank details, terms or validity. Line breaks are kept.</small>
              </label>
            </div>
          </section>

          {/* What the top of the quotation will look like */}
          <section className="panel form-panel">
            <h2 className="card-title">Preview</h2>
            <div className="company-preview">
              <div>
                <strong>{form.name || "Company name"}</strong>
                {form.address.filter((l) => l.trim()).map((l, i) => (
                  <span key={i}>{l}</span>
                ))}
              </div>
              <dl>
                {form.taxNumber && (
                  <>
                    <dt>Tax Registration</dt>
                    <dd>{form.taxNumber}</dd>
                  </>
                )}
                {form.telephone && (
                  <>
                    <dt>Telephone</dt>
                    <dd>{form.telephone}</dd>
                  </>
                )}
                {form.fax && (
                  <>
                    <dt>Fax</dt>
                    <dd>{form.fax}</dd>
                  </>
                )}
                {form.email && (
                  <>
                    <dt>Email</dt>
                    <dd>{form.email}</dd>
                  </>
                )}
              </dl>
            </div>
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
                  <CircleCheck size={14} aria-hidden="true" /> Saved. New and existing quotations print with these details.
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
