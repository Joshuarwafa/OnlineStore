import { ChevronLeft, ChevronRight, CircleCheck, LayoutGrid, List, Save, Undo2, UserRound, Users } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "../../../shared/PageHeader";
import { SearchInput } from "../../../shared/SearchInput";
import { StatusBanner } from "../../../shared/StatusBanner";
import { formatCount } from "../../../shared/format";
import { createLocalSetting } from "../../../shared/localSetting";
import { type CustomerPage, type CustomerSettings, getCustomerSettings, saveCashAccount, searchCustomers } from "../customers";

const PAGE_SIZE = 50;

// Grid (cards) or list (rows), like the view buttons in Windows File Explorer. Remembered in this browser.
type View = "grid" | "list";
const viewSetting = createLocalSetting<View>("storeAdmin.customers.view", "grid");

/**
 * Maintenance → Customers: choose the Sage customer account used for walk-in shoppers.
 * Their quotations and orders go on this account, with the shopper's own details on each document.
 */
export function CustomersPage() {
  const [settings, setSettings] = useState<CustomerSettings | null>(null);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [list, setList] = useState<CustomerPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<{ account: string; name: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const [view, setView] = viewSetting.use();

  // Wait until typing pauses before asking Sage
  useEffect(() => {
    const t = setTimeout(() => {
      setQuery(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, l] = await Promise.all([settings ? Promise.resolve(settings) : getCustomerSettings(), searchCustomers(query, page, PAGE_SIZE)]);
      setSettings(s);
      setList(l);
      setLoadedAt(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
    // settings only needs loading once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, page]);

  useEffect(() => {
    void load();
  }, [load]);

  const current = settings?.cashAccount ?? null;
  const chosen = picked?.account ?? current;
  const dirty = !!picked && picked.account !== current;
  const pages = list ? Math.max(1, Math.ceil(list.total / list.pageSize)) : 1;

  const pick = (c: { account: string; name: string }) => {
    setJustSaved(false);
    setSaveError(null);
    setPicked({ account: c.account, name: c.name.trim() });
  };

  const onSave = async () => {
    if (!picked) return;
    setSaving(true);
    setSaveError(null);
    try {
      setSettings(await saveCashAccount(picked.account));
      setPicked(null);
      setJustSaved(true);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Customers"
        subtitle="Choose the Sage customer account used for walk-in shoppers. Their quotations and orders go on this account, with the shopper's name and phone on each document."
        loadedAt={loadedAt}
        loading={loading}
        onRefresh={load}
      />

      <StatusBanner loading={loading && !list} error={error} onRetry={load} loadingText="Loading customers from Sage…" />

      {settings && (
        <div className={`banner ${current ? "success" : "warn"}`}>
          <span className="banner-text">
            {current ? <CircleCheck size={18} aria-hidden="true" /> : <UserRound size={18} aria-hidden="true" />}
            {current ? (
              <>
                Walk-in shoppers use <strong>{current}</strong>
                {settings.cashAccountName ? ` · ${settings.cashAccountName}` : ""}
                {settings.source === "env" ? " (from STORE_CASH_CUSTOMER in the store backend's settings)" : ""}
              </>
            ) : (
              "No cash account chosen yet. Pick one below so walk-in shoppers can get quotations."
            )}
          </span>
        </div>
      )}

      {list && (
        <section className="panel">
          <div className="panel-toolbar">
            <div>
              <h2 className="card-title">
                <Users size={17} aria-hidden="true" />
                Cash account for walk-in shoppers
              </h2>
              <p className="muted small no-margin">
                {formatCount(list.total)} {list.total === 1 ? "customer" : "customers"}
                {query.trim() ? ` matching “${query.trim()}”` : " in Sage"} · tip: search “cash”
              </p>
            </div>
            <div className="page-actions">
              <SearchInput value={search} onChange={setSearch} placeholder="Search account or name" />
              <div className="view-switch" role="group" aria-label="View">
                <button
                  type="button"
                  className={view === "grid" ? "active" : undefined}
                  aria-pressed={view === "grid"}
                  title="Grid"
                  onClick={() => setView("grid")}
                >
                  <LayoutGrid size={16} aria-hidden="true" />
                  <span className="visually-hidden">Grid</span>
                </button>
                <button
                  type="button"
                  className={view === "list" ? "active" : undefined}
                  aria-pressed={view === "list"}
                  title="List"
                  onClick={() => setView("list")}
                >
                  <List size={16} aria-hidden="true" />
                  <span className="visually-hidden">List</span>
                </button>
              </div>
            </div>
          </div>

          {list.items.length === 0 ? (
            <p className="empty">No customer matches “{query.trim()}”.</p>
          ) : view === "list" ? (
            <div className="table-wrap">
              <table className="data-table customer-table" role="radiogroup" aria-label="Cash account">
                <thead>
                  <tr>
                    <th className="customer-table__pick" aria-label="Choose" />
                    <th>Account</th>
                    <th>Name</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {list.items.map((c) => (
                    <tr key={c.account} className={chosen === c.account ? "selected" : undefined} onClick={() => pick(c)}>
                      <td className="customer-table__pick">
                        <input
                          type="radio"
                          name="cash-account"
                          aria-label={`${c.account} ${c.name.trim()}`}
                          checked={chosen === c.account}
                          onChange={() => pick(c)}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </td>
                      <td className="customer-table__account">{c.account}</td>
                      <td>{c.name.trim() || "—"}</td>
                      <td className="num">{current === c.account && <span className="muted-badge">In use</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <ul className="check-list customer-list" role="radiogroup" aria-label="Cash account">
              {list.items.map((c) => (
                <li key={c.account}>
                  <label className={chosen === c.account ? "selected" : undefined}>
                    <input
                      type="radio"
                      name="cash-account"
                      checked={chosen === c.account}
                      onChange={() => pick(c)}
                    />
                    <span className="check-main">
                      <span className="cell-title">{c.name.trim() || c.account}</span>
                      <span className="cell-sub">{c.account}</span>
                    </span>
                    {current === c.account && <span className="muted-badge">In use</span>}
                  </label>
                </li>
              ))}
            </ul>
          )}

          {pages > 1 && (
            <div className="customer-pager">
              <button type="button" className="button" disabled={page <= 1 || loading} onClick={() => setPage((p) => p - 1)}>
                <ChevronLeft size={15} aria-hidden="true" />
                Previous
              </button>
              <span className="muted small">
                Page {page} of {formatCount(pages)}
              </span>
              <button type="button" className="button" disabled={page >= pages || loading} onClick={() => setPage((p) => p + 1)}>
                Next
                <ChevronRight size={15} aria-hidden="true" />
              </button>
            </div>
          )}

          <div className="panel-footer">
            <span className={`small ${saveError ? "warn-text" : "muted"}`}>
              {saveError
                ? `Not saved: ${saveError}`
                : dirty
                  ? `Use ${picked!.account} · ${picked!.name} for walk-in shoppers?`
                  : justSaved
                    ? "Saved. New quotations from walk-in shoppers use this account."
                    : current
                      ? "Pick another account to change it."
                      : "Pick an account, then Save."}
            </span>
            <div className="page-actions">
              {dirty && (
                <button type="button" className="button" onClick={() => setPicked(null)} disabled={saving}>
                  <Undo2 size={15} aria-hidden="true" />
                  Undo
                </button>
              )}
              <button type="button" className="button primary" onClick={onSave} disabled={!dirty || saving}>
                <Save size={15} aria-hidden="true" />
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </section>
      )}
    </>
  );
}
