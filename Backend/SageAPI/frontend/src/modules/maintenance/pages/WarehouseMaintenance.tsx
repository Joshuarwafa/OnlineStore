import { CheckCheck, MapPin, Save, Store, Undo2, Warehouse, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "../../../shared/PageHeader";
import { StatusBanner } from "../../../shared/StatusBanner";
import { formatCount, formatQty } from "../../../shared/format";
import { useInventory } from "../../inventory/useInventory";
import { type ShopWarehouse, useShopWarehouses } from "../warehouseSettings";

// Suggestions for the Town box; any other town can be typed
const TOWNS = ["Harare", "Bulawayo", "Chitungwiza", "Mutare", "Gweru", "Kwekwe", "Kadoma", "Masvingo", "Chinhoyi", "Marondera", "Norton", "Chegutu", "Bindura", "Beitbridge", "Hwange", "Victoria Falls", "Zvishavane", "Kariba", "Rusape", "Chiredzi", "Gwanda", "Plumtree"];

const same = (a: ShopWarehouse[], b: ShopWarehouse[]) =>
  a.length === b.length && a.every((w, i) => w.code === b[i].code && w.label === b[i].label && w.address === b[i].address && w.town === b[i].town);

export function WarehouseMaintenance() {
  const { warehouses, loadedAt, loading, error, refresh } = useInventory();
  const shop = useShopWarehouses();
  const [draft, setDraft] = useState<ShopWarehouse[]>(shop.warehouses);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  // Pick up the saved choice once it arrives (or changes in another tab).
  useEffect(() => setDraft(shop.warehouses), [shop.warehouses]);

  // Stock lines with no warehouse can't be chosen.
  const choices = useMemo(
    () => warehouses.filter((w) => w.code !== "").sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true })),
    [warehouses],
  );
  const sageName = (code: string) => choices.find((w) => w.code === code)?.name ?? `Warehouse ${code}`;
  const isOn = (code: string) => draft.some((w) => w.code === code);

  const dirty = !same(draft, shop.warehouses);
  const missing = shop.warehouses.filter((w) => loadedAt && !choices.some((c) => c.code === w.code)).map((w) => w.code);

  const edit = (next: ShopWarehouse[]) => {
    setJustSaved(false);
    setSaveError(null);
    setDraft(next);
  };
  const toggle = (code: string) =>
    edit(isOn(code) ? draft.filter((w) => w.code !== code) : [...draft, { code, label: "", address: "", town: "" }]);
  const setField = (code: string, field: "label" | "address" | "town", value: string) =>
    edit(draft.map((w) => (w.code === code ? { ...w, [field]: value } : w)));

  const onSave = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      await shop.save(draft.map((w) => ({ ...w, label: w.label.trim(), address: w.address.trim(), town: w.town.trim() })));
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
        title="Warehouses"
        subtitle="Tick the warehouses the online shop sells from. Shoppers see which of them holds each product."
        loadedAt={loadedAt}
        loading={loading}
        onRefresh={refresh}
      />

      <StatusBanner loading={loading && !loadedAt} error={error} onRetry={refresh} />
      {shop.error && (
        <div className="banner warn">
          Couldn't load the shop's saved warehouses: {shop.error}{" "}
          <button type="button" className="button" onClick={shop.retry}>
            Try again
          </button>
        </div>
      )}

      {loadedAt && (
        <section className="panel">
          <div className="panel-toolbar">
            <div>
              <h2 className="card-title">
                <Warehouse size={17} aria-hidden="true" />
                Warehouses
              </h2>
              <p className="muted small no-margin">
                {formatCount(draft.length)} of {formatCount(choices.length)} selected · only tick branches shoppers can buy
                from, not vans, returns or expired goods
              </p>
            </div>
            <div className="page-actions">
              <button type="button" className="button" onClick={() => edit(choices.map((w) => draft.find((d) => d.code === w.code) ?? { code: w.code, label: "", address: "", town: "" }))}>
                <CheckCheck size={15} aria-hidden="true" />
                Select all
              </button>
              <button type="button" className="button" onClick={() => edit([])}>
                <X size={15} aria-hidden="true" />
                Clear
              </button>
            </div>
          </div>

          {missing.length > 0 && (
            <div className="banner inset warn">
              Saved warehouse{missing.length > 1 ? "s" : ""} {missing.join(", ")} no longer{" "}
              {missing.length > 1 ? "have" : "has"} stock in Sage.
            </div>
          )}

          <ul className="check-list">
            {choices.map((w) => (
              <li key={w.code}>
                <label className={isOn(w.code) ? "selected" : undefined}>
                  <input type="checkbox" checked={isOn(w.code)} onChange={() => toggle(w.code)} />
                  <span className="check-main">
                    <span className="cell-title">{w.name}</span>
                    <span className="cell-sub">Code {w.code}</span>
                  </span>
                  <span className="check-meta">
                    {formatCount(w.lines.length)} lines · {formatQty(w.totalUnits)} units
                  </span>
                </label>
              </li>
            ))}
          </ul>

          {draft.length > 0 && (
            <div className="shop-names">
              <h3 className="card-title">
                <Store size={16} aria-hidden="true" />
                Branch names in the shop
              </h3>
              <p className="muted small no-margin">
                {draft.length === 1
                  ? "With one warehouse, every product shows this name. Shoppers see the address on product pages."
                  : "Each product shows which branch has it and how many. Shoppers see the address on product pages, so they know which branch to visit."}
              </p>
              <datalist id="zw-towns">
                {TOWNS.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
              <ul className="shop-names__list">
                {draft.map((w) => (
                  <li key={w.code} className="shop-names__row">
                    <span className="shop-names__sage">
                      <MapPin size={15} aria-hidden="true" />
                      <span>
                        <span className="cell-title">{sageName(w.code)}</span>
                        <span className="cell-sub">Code {w.code}</span>
                      </span>
                    </span>
                    <label className="field">
                      <span>Branch name shown in shop</span>
                      <input value={w.label} maxLength={60} placeholder={`e.g. ${sageName(w.code).split(" ")[0]} Branch`} onChange={(e) => setField(w.code, "label", e.target.value)} />
                    </label>
                    <label className="field">
                      <span>Town</span>
                      <input value={w.town} maxLength={40} placeholder="e.g. Harare" list="zw-towns" onChange={(e) => setField(w.code, "town", e.target.value)} />
                    </label>
                    <label className="field">
                      <span>Address or directions (optional)</span>
                      <input
                        value={w.address}
                        maxLength={160}
                        placeholder="e.g. 12 Main Street, Bulawayo"
                        onChange={(e) => setField(w.code, "address", e.target.value)}
                      />
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="panel-footer">
            <span className={`small ${saveError || draft.length === 0 ? "warn-text" : "muted"}`}>
              {saveError
                ? `Not saved: ${saveError}`
                : draft.length === 0
                  ? shop.source === "env" || !dirty
                    ? "No warehouse ticked: the shop uses STORE_WAREHOUSE from the store backend's settings, and Inventory shows no stock."
                    : "With none ticked, the shop falls back to STORE_WAREHOUSE from the store backend's settings, and Inventory shows no stock."
                  : dirty
                    ? "You have unsaved changes."
                    : justSaved
                      ? "Saved. The shop shows the new warehouses straight away."
                      : "Saved. The online shop sells from these warehouses."}
            </span>
            <div className="page-actions">
              {dirty && (
                <button type="button" className="button" onClick={() => edit(shop.warehouses)} disabled={saving}>
                  <Undo2 size={15} aria-hidden="true" />
                  Undo changes
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
