import { CircleCheck, CircleX, FileSpreadsheet, FileText, FileUp, LoaderCircle, Save, X } from "lucide-react";
import { useRef, useState } from "react";
import { formatCount } from "../../../shared/format";
import { applyImport, previewImport, type ImportResult, type ImportRow, type StoreCategory, type StoreItem } from "./api";
import { downloadTemplateCsv, downloadTemplateXlsx, readUpload } from "./spreadsheet";

const MAX_ERRORS_SHOWN = 100;

interface Props {
  categories: StoreCategory[];
  items: StoreItem[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}

export function ImportPanel({ categories, items, onClose, onSaved }: Props) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [rows, setRows] = useState<ImportRow[] | null>(null);
  const [preview, setPreview] = useState<ImportResult | null>(null);
  const [saved, setSaved] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState<"reading" | "saving" | "template" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setRows(null);
    setPreview(null);
    setFileName(null);
    if (fileInput.current) fileInput.current.value = "";
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    reset();
    setSaved(null);
    setError(null);
    setFileName(file.name);
    setBusy("reading");
    try {
      const parsed = await readUpload(file);
      setRows(parsed);
      setPreview(await previewImport(parsed));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const onSave = async () => {
    if (!rows) return;
    setBusy("saving");
    setError(null);
    try {
      const result = await applyImport(rows);
      setSaved(result);
      reset();
      await onSaved();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const onTemplate = async (kind: "xlsx" | "csv") => {
    setBusy("template");
    try {
      if (kind === "xlsx") await downloadTemplateXlsx(items, categories);
      else downloadTemplateCsv(items, categories);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const changes = preview ? preview.categoryChanges + preview.visibilityChanges : 0;

  return (
    <section className="panel form-panel import-panel">
      <div className="form-panel-head">
        <h2 className="card-title no-margin">Import from Excel / CSV</h2>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Close import" title="Close">
          <X size={16} />
        </button>
      </div>

      <ol className="import-steps">
        <li>
          <span>
            Download the list of items. It has a <strong>Category</strong> column (already filled for items that have one) and a{" "}
            <strong>Show in store</strong> column (Yes / No).
          </span>
          <span className="page-actions">
            <button type="button" className="button" onClick={() => void onTemplate("xlsx")} disabled={busy !== null}>
              <FileSpreadsheet size={15} aria-hidden="true" />
              Excel
            </button>
            <button type="button" className="button" onClick={() => void onTemplate("csv")} disabled={busy !== null}>
              <FileText size={15} aria-hidden="true" />
              CSV
            </button>
          </span>
        </li>
        <li>
          <span>
            Type a category name next to each item, e.g. <em>Phones</em>. A new name creates that category. Leave it blank to keep the item as it is.
          </span>
        </li>
        <li>
          <span>Upload the file, check what will change, and save.</span>
          <input
            ref={fileInput}
            type="file"
            accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="visually-hidden"
            id="category-upload"
            onChange={(e) => void onFile(e.target.files?.[0])}
          />
          <label htmlFor="category-upload" className={`button primary ${busy ? "disabled" : ""}`}>
            {busy === "reading" ? <LoaderCircle size={15} className="spin" aria-hidden="true" /> : <FileUp size={15} aria-hidden="true" />}
            {busy === "reading" ? "Checking…" : fileName ? "Choose another file" : "Upload file"}
          </label>
        </li>
      </ol>

      {error && (
        <div className="banner error inset-top" role="alert">
          <span className="banner-text">
            <CircleX size={18} aria-hidden="true" />
            {error}
          </span>
        </div>
      )}

      {saved && (
        <div className="banner success inset-top" role="status">
          <span className="banner-text">
            <CircleCheck size={18} aria-hidden="true" />
            Saved: {formatCount(saved.categoryChanges)} item{saved.categoryChanges === 1 ? "" : "s"} put in a category,{" "}
            {formatCount(saved.visibilityChanges)} shown/hidden, {formatCount(saved.newCategories.length)} new categor
            {saved.newCategories.length === 1 ? "y" : "ies"}.
            {saved.errors.length > 0 && ` ${formatCount(saved.errors.length)} rows with problems were skipped.`}
          </span>
        </div>
      )}

      {preview && (
        <div className="import-preview">
          <p className="no-margin">
            <strong>{fileName}</strong>: {formatCount(preview.rowsRead)} rows read. {formatCount(preview.categoryChanges)} item
            {preview.categoryChanges === 1 ? "" : "s"} will get a new category, {formatCount(preview.visibilityChanges)} will be shown/hidden,{" "}
            {formatCount(preview.unchanged)} stay the same.
          </p>

          {preview.newCategories.length > 0 && (
            <div className="preview-block">
              <h3>New categories ({formatCount(preview.newCategories.length)})</h3>
              <p className="muted small no-margin">Check the spelling: a typo becomes a separate category.</p>
              <div className="chip-list">
                {preview.newCategories.map((name) => (
                  <span key={name} className="chip">
                    {name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {preview.errors.length > 0 && (
            <div className="preview-block">
              <h3>
                <CircleX size={15} aria-hidden="true" className="status-critical-text" />
                {formatCount(preview.errors.length)} row{preview.errors.length === 1 ? "" : "s"} will be skipped
              </h3>
              <div className="table-wrap error-table">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th className="num">Row</th>
                      <th>Problem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.errors.slice(0, MAX_ERRORS_SHOWN).map((e, i) => (
                      <tr key={`${e.row}-${i}`}>
                        <td className="num">{e.row}</td>
                        <td>{e.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {preview.errors.length > MAX_ERRORS_SHOWN && (
                <p className="muted small no-margin">…and {formatCount(preview.errors.length - MAX_ERRORS_SHOWN)} more.</p>
              )}
            </div>
          )}

          <div className="form-actions">
            <span className="muted small">{changes === 0 ? "Nothing in this file changes the store." : `${formatCount(changes)} change${changes === 1 ? "" : "s"} ready to save.`}</span>
            <div className="page-actions">
              <button type="button" className="button" onClick={reset} disabled={busy !== null}>
                Cancel
              </button>
              <button type="button" className="button primary" onClick={() => void onSave()} disabled={busy !== null || changes === 0}>
                {busy === "saving" ? <LoaderCircle size={15} className="spin" aria-hidden="true" /> : <Save size={15} aria-hidden="true" />}
                {busy === "saving" ? "Saving…" : "Save changes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
