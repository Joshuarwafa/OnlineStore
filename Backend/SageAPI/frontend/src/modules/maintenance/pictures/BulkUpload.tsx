import { CircleCheck, CircleX, FolderUp, LoaderCircle, Upload, X } from "lucide-react";
import { useMemo, useState } from "react";
import { formatCount } from "../../../shared/format";
import { fileProblem, MAX_PICTURES, uploadPicture, type Picture } from "./api";
import { buildMatcher, type ItemRef } from "./match";

interface Props {
  items: ItemRef[];
  pictures: Record<string, Picture[]>;
  onUploaded: (code: string, picture: Picture) => void;
  onClose: () => void;
}

interface Planned {
  file: File;
  item: ItemRef | null;
  number: number;
  problem: string | null;
  result?: "done" | string;
}

/** Many pictures at once, matched to items by file name. */
export function BulkUpload({ items, pictures, onUploaded, onClose }: Props) {
  const match = useMemo(() => buildMatcher(items), [items]);
  const [plan, setPlan] = useState<Planned[] | null>(null);
  const [progress, setProgress] = useState<string | null>(null);

  const choose = (files: File[]) => {
    const rows: Planned[] = files.map((file) => {
      const m = match(file.name);
      const problem =
        m.kind === "none"
          ? "No item with this code."
          : m.kind === "ambiguous"
            ? `Matches more than one item: ${m.codes.join(", ")}. Rename the file to the exact code.`
            : fileProblem(file);
      return { file, item: m.kind === "item" ? m.item : null, number: m.kind === "item" ? m.number : 0, problem };
    });

    // Per item: picture 1 before 2 before 3, and no more than the item has room for
    rows.sort((a, b) => (a.item?.itemCode ?? "￿").localeCompare(b.item?.itemCode ?? "￿") || a.number - b.number || a.file.name.localeCompare(b.file.name));
    const used = new Map<string, number>();
    for (const r of rows) {
      if (!r.item || r.problem) continue;
      const count = (used.get(r.item.itemCode) ?? pictures[r.item.itemCode]?.length ?? 0) + 1;
      used.set(r.item.itemCode, count);
      if (count > MAX_PICTURES) r.problem = `${r.item.itemCode} would have more than ${MAX_PICTURES} pictures.`;
    }
    setPlan(rows);
  };

  const ready = plan?.filter((r) => r.item && !r.problem && !r.result) ?? [];
  const done = plan?.filter((r) => r.result === "done").length ?? 0;

  const start = async () => {
    if (!plan) return;
    for (const [n, row] of ready.entries()) {
      setProgress(`Uploading ${n + 1} of ${ready.length}…`);
      try {
        const picture = await uploadPicture(row.item!.itemCode, row.file);
        row.result = "done";
        onUploaded(row.item!.itemCode, picture);
      } catch (err) {
        row.result = (err as Error).message;
      }
      setPlan([...plan]);
    }
    setProgress(null);
  };

  const failed = plan?.filter((r) => r.result && r.result !== "done").length ?? 0;
  const skipped = plan?.filter((r) => r.problem).length ?? 0;

  return (
    <section className="panel form-panel import-panel">
      <div className="form-panel-head">
        <h2 className="card-title no-margin">Upload many pictures</h2>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Close" title="Close">
          <X size={16} />
        </button>
      </div>
      <p className="small">
        Name each file after its item code. A <span className="mono">/</span> can't be used in a file name, so use <span className="mono">-</span>:
        item <span className="mono">457265U/WRI</span> → <span className="mono">457265U-WRI.jpg</span>. More pictures of the same item:{" "}
        <span className="mono">457265U-WRI_2.jpg</span>, <span className="mono">457265U-WRI_3.jpg</span>. They're added after the item's existing pictures.
      </p>

      <div className="page-actions">
        <input
          type="file"
          id="bulk-pictures"
          className="visually-hidden"
          accept="image/jpeg,image/png,image/webp"
          multiple
          disabled={!!progress}
          onChange={(e) => {
            choose([...(e.target.files ?? [])]);
            e.target.value = "";
          }}
        />
        <label htmlFor="bulk-pictures" className={`button ${plan ? "" : "primary"} ${progress ? "disabled" : ""}`}>
          <FolderUp size={15} aria-hidden="true" />
          {plan ? "Choose other files" : "Choose pictures"}
        </label>
        {plan && ready.length > 0 && (
          <button type="button" className="button primary" onClick={() => void start()} disabled={!!progress}>
            {progress ? <LoaderCircle size={15} className="spin" aria-hidden="true" /> : <Upload size={15} aria-hidden="true" />}
            {progress ?? `Upload ${formatCount(ready.length)} picture${ready.length === 1 ? "" : "s"}`}
          </button>
        )}
      </div>

      {plan && (
        <>
          <p className="small no-margin bulk-summary">
            {formatCount(plan.length)} files · {formatCount(plan.filter((r) => r.item && !r.problem).length)} matched an item
            {skipped > 0 && <> · <span className="status-critical-text">{formatCount(skipped)} can't be used</span></>}
            {done > 0 && <> · {formatCount(done)} uploaded</>}
            {failed > 0 && <> · <span className="status-critical-text">{formatCount(failed)} failed</span></>}
          </p>
          <div className="table-wrap error-table">
            <table className="data-table">
              <thead>
                <tr>
                  <th>File</th>
                  <th>Item</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {plan.map((r, i) => (
                  <tr key={`${r.file.name}-${i}`}>
                    <td className="mono small">{r.file.name}</td>
                    <td>{r.item ? <><span className="mono">{r.item.itemCode}</span> <span className="muted small">{r.item.description}</span></> : "—"}</td>
                    <td className="small">
                      {r.result === "done" ? (
                        <span className="status-good-text"><CircleCheck size={14} aria-hidden="true" /> Uploaded</span>
                      ) : r.result || r.problem ? (
                        <span className="status-critical-text"><CircleX size={14} aria-hidden="true" /> {r.result ?? r.problem}</span>
                      ) : (
                        <span className="muted">Ready</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
