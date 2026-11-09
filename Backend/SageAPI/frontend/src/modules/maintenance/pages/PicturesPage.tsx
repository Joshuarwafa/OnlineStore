import { FolderUp, ImageOff, ImagePlus, Images, LayoutGrid, List, LoaderCircle, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type DragEvent } from "react";
import { SearchInput } from "../../../shared/SearchInput";
import { StatusBanner } from "../../../shared/StatusBanner";
import { formatCount } from "../../../shared/format";
import { createLocalSetting } from "../../../shared/localSetting";
import { getItems, type StoreItem } from "../categories/api";
import { fileProblem, getAllPictures, MAX_PICTURES, uploadPicture, type Picture } from "../pictures/api";
import { BulkUpload } from "../pictures/BulkUpload";
import { PictureEditor } from "../pictures/PictureEditor";

const PAGE = 120;

type Show = "all" | "missing" | "done";

// Grid (large pictures) or list (one row per item), like the views in Windows File Explorer
const viewSetting = createLocalSetting<"grid" | "list">("storeAdmin.pictures.view", "grid");

export function PicturesPage() {
  const [items, setItems] = useState<StoreItem[]>([]);
  const [pictures, setPictures] = useState<Record<string, Picture[]>>({});
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [show, setShow] = useState<Show>("all");
  const [limit, setLimit] = useState(PAGE);
  const [selected, setSelected] = useState<string | null>(null);
  const [bulk, setBulk] = useState(false);
  const [uploading, setUploading] = useState<Set<string>>(new Set());
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [view, setView] = viewSetting.use();

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [i, p] = await Promise.all([getItems(), getAllPictures()]);
      setItems(i);
      setPictures(p);
      setLoaded(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const setItemPictures = (code: string, list: Picture[]) => setPictures((all) => ({ ...all, [code]: list }));
  const addItemPicture = (code: string, picture: Picture) => setPictures((all) => ({ ...all, [code]: [...(all[code] ?? []), picture] }));

  // Pictures dropped straight onto a tile
  const dropOnTile = async (e: DragEvent, code: string) => {
    e.preventDefault();
    setDropTarget(null);
    const files = [...e.dataTransfer.files];
    if (files.length === 0 || uploading.has(code)) return;
    setUploading((s) => new Set(s).add(code));
    const errors: string[] = [];
    let count = pictures[code]?.length ?? 0;
    for (const file of files) {
      const problem = count >= MAX_PICTURES ? `${code} already has ${MAX_PICTURES} pictures.` : fileProblem(file);
      if (problem) {
        errors.push(`${file.name}: ${problem}`);
        continue;
      }
      try {
        addItemPicture(code, await uploadPicture(code, file));
        count++;
      } catch (err) {
        errors.push(`${file.name}: ${(err as Error).message}`);
      }
    }
    setUploading((s) => {
      const next = new Set(s);
      next.delete(code);
      return next;
    });
    setProblems(errors);
  };

  // Both views accept pictures dropped onto an item
  const dropProps = (code: string) => ({
    onDragOver: (e: DragEvent) => {
      e.preventDefault();
      setDropTarget(code);
    },
    onDragLeave: () => setDropTarget(null),
    onDrop: (e: DragEvent) => void dropOnTile(e, code),
  });

  const done = items.filter((i) => (pictures[i.itemCode]?.length ?? 0) > 0).length;
  const percent = items.length ? Math.round((done / items.length) * 100) : 0;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((i) => {
      const has = (pictures[i.itemCode]?.length ?? 0) > 0;
      return (
        (show === "all" || (show === "done" ? has : !has)) &&
        (!q || i.itemCode.toLowerCase().includes(q) || i.description.toLowerCase().includes(q))
      );
    });
  }, [items, pictures, query, show]);

  useEffect(() => setLimit(PAGE), [query, show]);

  const selectedItem = items.find((i) => i.itemCode === selected);
  const chips: { id: Show; label: string; count: number }[] = [
    { id: "all", label: "All", count: items.length },
    { id: "missing", label: "Need a picture", count: items.length - done },
    { id: "done", label: "Done", count: done },
  ];

  return (
    <>
      <header className="page-header">
        <div>
          <h1>Pictures</h1>
          <p className="subtitle">Click an item to manage its pictures, or drop pictures straight onto it.</p>
        </div>
        <div className="page-actions">
          <button type="button" className="button" onClick={() => void reload()} disabled={loading} aria-label="Refresh" title="Refresh">
            <RefreshCw size={15} aria-hidden="true" className={loading ? "spin" : undefined} />
          </button>
          <button type="button" className={`button ${bulk ? "" : "primary"}`} onClick={() => setBulk((v) => !v)} disabled={!loaded}>
            <FolderUp size={15} aria-hidden="true" />
            Upload many
          </button>
        </div>
      </header>

      <StatusBanner loading={loading && !loaded} error={error} onRetry={() => void reload()} loadingText="Loading items and pictures…" />

      {loaded && (
        <>
          <section className="panel picture-progress">
            <div className="picture-progress-text">
              <strong>{formatCount(done)}</strong>
              <span className="muted"> of {formatCount(items.length)} items have a picture</span>
            </div>
            <div className="picture-progress-bar" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label="Items with a picture">
              <span style={{ width: `${percent}%` }} />
            </div>
            <span className="picture-progress-percent">{percent}%</span>
          </section>

          {bulk && <BulkUpload items={items} pictures={pictures} onUploaded={addItemPicture} onClose={() => setBulk(false)} />}

          <div className="gallery-toolbar">
            <div className="chips" role="group" aria-label="Show">
              {chips.map((c) => (
                <button key={c.id} type="button" className={`chip-button ${show === c.id ? "active" : ""}`} aria-pressed={show === c.id} onClick={() => setShow(c.id)}>
                  {c.label} <span className="chip-count">{formatCount(c.count)}</span>
                </button>
              ))}
            </div>
            <div className="gallery-tools">
              <SearchInput placeholder="Search code or description" value={query} onChange={setQuery} />
              <div className="view-switch" role="group" aria-label="View">
                <button type="button" className={view === "grid" ? "active" : ""} aria-pressed={view === "grid"} onClick={() => setView("grid")} title="Grid">
                  <LayoutGrid size={16} aria-hidden="true" />
                  <span className="visually-hidden">Grid</span>
                </button>
                <button type="button" className={view === "list" ? "active" : ""} aria-pressed={view === "list"} onClick={() => setView("list")} title="List">
                  <List size={16} aria-hidden="true" />
                  <span className="visually-hidden">List</span>
                </button>
              </div>
            </div>
          </div>

          {problems.length > 0 && (
            <div className="banner error" role="alert">
              <ul className="error-list">
                {problems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
              <button type="button" className="button" onClick={() => setProblems([])}>
                Dismiss
              </button>
            </div>
          )}

          {filtered.length === 0 ? (
            <p className="gallery-empty muted">{show === "missing" && !query ? "Every item has a picture. Nice work!" : "No items match."}</p>
          ) : view === "list" ? (
            <div className="panel file-list">
              <div className="file-row file-head" aria-hidden="true">
                <span />
                <span>Name</span>
                <span>Item code</span>
                <span>Pictures</span>
              </div>
              <ul>
                {filtered.slice(0, limit).map((i) => {
                  const list = pictures[i.itemCode] ?? [];
                  return (
                    <li key={i.stockLink}>
                      <button
                        type="button"
                        className={`file-row ${dropTarget === i.itemCode ? "drop" : ""} ${selected === i.itemCode ? "selected" : ""}`}
                        onClick={() => setSelected(i.itemCode)}
                        {...dropProps(i.itemCode)}
                      >
                        <span className="file-thumb">
                          {uploading.has(i.itemCode) ? (
                            <LoaderCircle size={16} className="spin" aria-hidden="true" />
                          ) : list[0] ? (
                            <img src={list[0].thumbUrl} alt="" loading="lazy" />
                          ) : (
                            <ImageOff size={16} aria-hidden="true" />
                          )}
                        </span>
                        <span className="file-name">{i.description}</span>
                        <span className="file-code">{i.itemCode}</span>
                        <span className={`file-count ${list.length ? "" : "none"}`}>{list.length ? list.length : "Needs a picture"}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : (
            <ul className="gallery">
              {filtered.slice(0, limit).map((i) => {
                const list = pictures[i.itemCode] ?? [];
                const busy = uploading.has(i.itemCode);
                return (
                  <li key={i.stockLink}>
                    <button
                      type="button"
                      className={`tile ${list.length ? "" : "missing"} ${dropTarget === i.itemCode ? "drop" : ""} ${selected === i.itemCode ? "selected" : ""}`}
                      onClick={() => setSelected(i.itemCode)}
                      {...dropProps(i.itemCode)}
                    >
                      <span className="tile-image">
                        {list[0] ? (
                          <img src={list[0].thumbUrl} alt="" loading="lazy" />
                        ) : (
                          <span className="tile-placeholder">
                            <ImagePlus size={26} aria-hidden="true" />
                            <span>Add picture</span>
                          </span>
                        )}
                        {list.length > 1 && (
                          <span className="tile-count">
                            <Images size={12} aria-hidden="true" /> {list.length}
                          </span>
                        )}
                        {busy && (
                          <span className="tile-busy">
                            <LoaderCircle size={22} className="spin" aria-hidden="true" />
                          </span>
                        )}
                      </span>
                      <span className="tile-text">
                        <span className="tile-name">{i.description}</span>
                        <span className="tile-code">{i.itemCode}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {filtered.length > limit && (
            <div className="gallery-more">
              <button type="button" className="button" onClick={() => setLimit((l) => l + PAGE)}>
                Show more ({formatCount(filtered.length - limit)} left)
              </button>
            </div>
          )}
        </>
      )}

      {selectedItem && (
        <PictureEditor
          key={selectedItem.itemCode}
          code={selectedItem.itemCode}
          description={selectedItem.description}
          pictures={pictures[selectedItem.itemCode] ?? []}
          onChange={setItemPictures}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  );
}
