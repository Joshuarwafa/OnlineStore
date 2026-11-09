import { ArrowLeft, ArrowRight, ImagePlus, LoaderCircle, Star, Trash2, X } from "lucide-react";
import { useEffect, useState, type DragEvent } from "react";
import { deletePicture, fileProblem, MAX_PICTURES, orderPictures, uploadPicture, type Picture } from "./api";

interface Props {
  code: string;
  description: string;
  pictures: Picture[];
  onChange: (code: string, pictures: Picture[]) => void;
  onClose: () => void;
}

/** Side panel for one item's pictures: a big preview, the pictures in order, and add / main / move / delete. */
export function PictureEditor({ code, description, pictures, onChange, onClose }: Props) {
  const [currentId, setCurrentId] = useState<string | null>(pictures[0]?.id ?? null);
  const [busy, setBusy] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const index = Math.max(0, pictures.findIndex((p) => p.id === currentId));
  const current = pictures[index];
  const room = MAX_PICTURES - pictures.length;

  const add = async (files: File[]) => {
    if (files.length === 0 || busy) return;
    const problems: string[] = [];
    let list = pictures;
    const take = files.slice(0, Math.max(0, room));
    if (files.length > take.length) problems.push(`Only ${MAX_PICTURES} pictures per item: ${files.length - take.length} file(s) were left out.`);

    for (const [n, file] of take.entries()) {
      const problem = fileProblem(file);
      if (problem) {
        problems.push(`${file.name}: ${problem}`);
        continue;
      }
      setBusy(`Uploading ${n + 1} of ${take.length}…`);
      try {
        const added = await uploadPicture(code, file);
        list = [...list, added];
        onChange(code, list);
        setCurrentId(added.id);
      } catch (err) {
        problems.push(`${file.name}: ${(err as Error).message}`);
      }
    }
    setBusy(null);
    setErrors(problems);
  };

  const run = async (label: string, work: () => Promise<Picture[]>) => {
    setBusy(label);
    setErrors([]);
    try {
      onChange(code, await work());
    } catch (err) {
      setErrors([(err as Error).message]);
    } finally {
      setBusy(null);
    }
  };

  const reorder = (ids: string[]) => run("Saving…", () => orderPictures(code, ids));
  const move = (by: -1 | 1) => {
    const ids = pictures.map((p) => p.id);
    [ids[index], ids[index + by]] = [ids[index + by], ids[index]];
    void reorder(ids);
  };
  const makeMain = () => void reorder([current.id, ...pictures.filter((p) => p.id !== current.id).map((p) => p.id)]);
  const remove = () => {
    const note = index === 0 && pictures.length > 1 ? " The next picture becomes the main one." : "";
    if (!window.confirm(`Delete this picture?${note}`)) return;
    const next = pictures[index + 1] ?? pictures[index - 1];
    void run("Deleting…", async () => {
      await deletePicture(code, current.id);
      setCurrentId(next?.id ?? null);
      return pictures.filter((p) => p.id !== current.id);
    });
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    void add([...e.dataTransfer.files]);
  };

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside
        className={`drawer ${dragging ? "dragging" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={`Pictures of ${description}`}
        onClick={(e) => e.stopPropagation()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={(e) => e.currentTarget === e.target && setDragging(false)}
        onDrop={onDrop}
      >
        <header className="drawer-head">
          <div>
            <h2>{description}</h2>
            <span className="mono small muted">{code}</span>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close" title="Close">
            <X size={18} />
          </button>
        </header>

        <div className="drawer-hero">
          {current ? (
            <>
              <img src={current.url} alt={`${description}, picture ${index + 1}`} />
              {index === 0 && (
                <span className="hero-badge">
                  <Star size={12} aria-hidden="true" /> Main picture
                </span>
              )}
            </>
          ) : (
            <span className="hero-empty">
              <ImagePlus size={34} aria-hidden="true" />
              No pictures yet
            </span>
          )}
          {busy && (
            <span className="hero-busy">
              <LoaderCircle size={20} className="spin" aria-hidden="true" /> {busy}
            </span>
          )}
        </div>

        {current && (
          <div className="hero-actions">
            <button type="button" className="button" onClick={makeMain} disabled={!!busy || index === 0}>
              <Star size={15} aria-hidden="true" />
              {index === 0 ? "Main picture" : "Make main"}
            </button>
            <span className="hero-actions-right">
              <button type="button" className="icon-button" onClick={() => move(-1)} disabled={!!busy || index === 0} title="Move left" aria-label="Move left">
                <ArrowLeft size={16} />
              </button>
              <button type="button" className="icon-button" onClick={() => move(1)} disabled={!!busy || index === pictures.length - 1} title="Move right" aria-label="Move right">
                <ArrowRight size={16} />
              </button>
              <button type="button" className="icon-button danger" onClick={remove} disabled={!!busy} title="Delete" aria-label="Delete picture">
                <Trash2 size={16} />
              </button>
            </span>
          </div>
        )}

        <ul className="thumb-strip">
          {pictures.map((p, i) => (
            <li key={p.id}>
              <button type="button" className={`thumb ${p.id === current?.id ? "active" : ""}`} onClick={() => setCurrentId(p.id)} aria-label={`Picture ${i + 1}`}>
                <img src={p.thumbUrl} alt="" loading="lazy" />
                {i === 0 && <Star size={11} className="thumb-star" aria-hidden="true" />}
              </button>
            </li>
          ))}
          {room > 0 && (
            <li>
              <input
                type="file"
                id="picture-add"
                className="visually-hidden"
                accept="image/jpeg,image/png,image/webp"
                multiple
                disabled={!!busy}
                onChange={(e) => {
                  void add([...(e.target.files ?? [])]);
                  e.target.value = "";
                }}
              />
              <label htmlFor="picture-add" className={`thumb add ${busy ? "disabled" : ""}`} title="Add pictures">
                <ImagePlus size={20} aria-hidden="true" />
                <span className="visually-hidden">Add pictures</span>
              </label>
            </li>
          )}
        </ul>
        <p className="muted small no-margin drawer-hint">
          {room > 0 ? `Drop pictures anywhere here, or click +. ${room} more allowed.` : `This item has the most pictures allowed (${MAX_PICTURES}).`}
        </p>

        {errors.length > 0 && (
          <div className="banner error" role="alert">
            <ul className="error-list">
              {errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </div>
        )}
      </aside>
    </div>
  );
}
