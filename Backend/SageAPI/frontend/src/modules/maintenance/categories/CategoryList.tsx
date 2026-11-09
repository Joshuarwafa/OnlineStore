import { Check, Eye, EyeOff, Inbox, LayoutList, Pencil, Plus, Trash2, X } from "lucide-react";
import { useState, type Dispatch, type FormEvent, type SetStateAction } from "react";
import { formatCount } from "../../../shared/format";
import { createCategory, deleteCategory, updateCategory, type StoreCategory, type StoreItem } from "./api";

/** Which items the table shows: everything, items with no category, or one category. */
export type CategoryFilter = "all" | "other" | number;

interface Props {
  categories: StoreCategory[];
  setCategories: Dispatch<SetStateAction<StoreCategory[]>>;
  items: StoreItem[];
  filter: CategoryFilter;
  onFilter: (filter: CategoryFilter) => void;
  onDeleted: (categoryId: number) => void;
}

const byName = (a: StoreCategory, b: StoreCategory) => a.name.localeCompare(b.name);

export function CategoryList({ categories, setCategories, items, filter, onFilter, onDeleted }: Props) {
  const [newName, setNewName] = useState("");
  const [renaming, setRenaming] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const counts = new Map<number | null, number>();
  for (const i of items) counts.set(i.categoryId, (counts.get(i.categoryId) ?? 0) + 1);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const add = (e: FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    void run(async () => {
      const created = await createCategory(newName);
      setCategories((all) => [...all, created].sort(byName));
      setNewName("");
      onFilter(created.categoryId);
    });
  };

  const save = (c: StoreCategory, update: { name: string; isVisible: boolean }) =>
    run(async () => {
      const saved = await updateCategory(c.categoryId, update);
      setCategories((all) => all.map((x) => (x.categoryId === c.categoryId ? saved : x)).sort(byName));
      setRenaming(null);
    });

  const remove = (c: StoreCategory) => {
    const count = counts.get(c.categoryId) ?? 0;
    const message = count > 0 ? `Delete "${c.name}"? Its ${count} item${count === 1 ? "" : "s"} will move to Other.` : `Delete "${c.name}"?`;
    if (!window.confirm(message)) return;
    void run(async () => {
      await deleteCategory(c.categoryId);
      setCategories((all) => all.filter((x) => x.categoryId !== c.categoryId));
      onDeleted(c.categoryId);
    });
  };

  return (
    <aside className="panel category-list">
      <form className="category-add" onSubmit={add}>
        <input
          className="inline-input"
          placeholder="New category, e.g. Phones"
          value={newName}
          maxLength={100}
          onChange={(e) => setNewName(e.target.value)}
          aria-label="New category name"
        />
        <button type="submit" className="button primary" disabled={busy || !newName.trim()}>
          <Plus size={15} aria-hidden="true" />
          Add
        </button>
      </form>

      {error && (
        <div className="banner error inset" role="alert">
          <span className="banner-text">{error}</span>
        </div>
      )}

      <ul className="category-items">
        <li>
          <FilterButton active={filter === "all"} onClick={() => onFilter("all")} count={items.length}>
            <LayoutList size={15} aria-hidden="true" />
            All items
          </FilterButton>
        </li>

        {categories.map((c) =>
          renaming === c.categoryId ? (
            <li key={c.categoryId}>
              <RenameForm category={c} busy={busy} onCancel={() => setRenaming(null)} onSave={(name) => save(c, { name, isVisible: c.isVisible })} />
            </li>
          ) : (
            <li key={c.categoryId} className="category-entry">
              <FilterButton active={filter === c.categoryId} onClick={() => onFilter(c.categoryId)} count={counts.get(c.categoryId) ?? 0}>
                <span className={c.isVisible ? undefined : "muted"}>{c.name}</span>
                {!c.isVisible && (
                  <span className="badge muted-badge">
                    <EyeOff size={12} aria-hidden="true" /> Hidden
                  </span>
                )}
              </FilterButton>
              <span className="category-actions">
                <IconButton label={`Rename ${c.name}`} onClick={() => setRenaming(c.categoryId)} disabled={busy}>
                  <Pencil size={14} />
                </IconButton>
                <IconButton
                  label={c.isVisible ? `Hide ${c.name} from the store` : `Show ${c.name} in the store`}
                  onClick={() => void save(c, { name: c.name, isVisible: !c.isVisible })}
                  disabled={busy}
                >
                  {c.isVisible ? <EyeOff size={14} /> : <Eye size={14} />}
                </IconButton>
                <IconButton label={`Delete ${c.name}`} onClick={() => remove(c)} disabled={busy} danger>
                  <Trash2 size={14} />
                </IconButton>
              </span>
            </li>
          ),
        )}

        <li>
          <FilterButton active={filter === "other"} onClick={() => onFilter("other")} count={counts.get(null) ?? 0}>
            <Inbox size={15} aria-hidden="true" />
            Other (no category)
          </FilterButton>
        </li>
      </ul>

      {categories.length === 0 && <p className="muted small category-hint">No categories yet. Type a name above and press Add.</p>}
    </aside>
  );
}

function FilterButton({ active, onClick, count, children }: { active: boolean; onClick: () => void; count: number; children: React.ReactNode }) {
  return (
    <button type="button" className={`category-filter ${active ? "active" : ""}`} onClick={onClick} aria-pressed={active}>
      <span className="category-name">{children}</span>
      <span className="category-count">{formatCount(count)}</span>
    </button>
  );
}

function RenameForm({ category, busy, onSave, onCancel }: { category: StoreCategory; busy: boolean; onSave: (name: string) => void; onCancel: () => void }) {
  const [name, setName] = useState(category.name);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (name.trim()) onSave(name);
  };
  return (
    <form className="category-rename" onSubmit={submit}>
      <input
        className="inline-input"
        autoFocus
        value={name}
        maxLength={100}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && onCancel()}
        aria-label="Category name"
      />
      <IconButton label="Save" type="submit" disabled={busy || !name.trim()}>
        <Check size={15} />
      </IconButton>
      <IconButton label="Cancel" onClick={onCancel}>
        <X size={15} />
      </IconButton>
    </form>
  );
}

interface IconButtonProps {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  danger?: boolean;
  type?: "button" | "submit";
  children: React.ReactNode;
}

function IconButton({ label, onClick, disabled, danger, type = "button", children }: IconButtonProps) {
  return (
    <button type={type} className={`icon-button ${danger ? "danger" : ""}`} title={label} aria-label={label} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}
