import { useEffect, useMemo, useRef, useState } from "react";
import { chooseBranch, closeBranchPicker, openBranchPicker, useBranchState } from "../lib/branch";
import { byTown, myBranchOf, PICKER_FROM, shortName, useLocations } from "../lib/locations";
import { Icon } from "./Icon";

const NUDGE_KEY = "branchNudge.closed";

function nudgeClosed(): boolean {
  try {
    return sessionStorage.getItem(NUDGE_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * A bubble with a pointing hand under the branch button, until the shopper picks a branch.
 * Closing it hides it for this visit only.
 */
function BranchNudge() {
  const [closed, setClosed] = useState(nudgeClosed);
  const [shown, setShown] = useState(false);
  // Appear a moment after the page settles, so it reads as a hint rather than clutter
  useEffect(() => {
    const t = setTimeout(() => setShown(true), 700);
    return () => clearTimeout(t);
  }, []);
  if (closed || !shown) return null;

  const close = () => {
    try {
      sessionStorage.setItem(NUDGE_KEY, "1");
    } catch {
      /* ignore */
    }
    setClosed(true);
  };

  return (
    <div className="bnudge" role="status">
      <span className="bnudge__hand" aria-hidden="true">
        👆
      </span>
      <div className="bnudge__body">
        <strong>Choose your branch</strong>
        <span>See what's in stock near you.</span>
      </div>
      <button className="bnudge__go" onClick={openBranchPicker}>
        Choose
      </button>
      <button className="bnudge__x" onClick={close} aria-label="Hide this tip">
        <Icon name="close" />
      </button>
    </div>
  );
}

/** Header button: "📍 Harare Branch ▾", or "Choose branch". Hidden when the shop has one branch. */
export function BranchButton() {
  const locations = useLocations();
  const { code, pickerOpen } = useBranchState();
  if (locations.length < PICKER_FROM) return null;
  const mine = myBranchOf(locations, code);

  return (
    <span className="branchwrap">
      <button className={`branchbtn ${mine ? "is-set" : ""}`} onClick={openBranchPicker} aria-label={mine ? `Your branch: ${mine.name}. Change` : "Choose your branch"}>
        <Icon name="pin" />
        <span className="branchbtn__text">
          <small>{mine ? "Your branch" : "Shopping at"}</small>
          <span className="branchbtn__name branchbtn__name--long">{mine ? mine.name : "Choose branch"}</span>
          <span className="branchbtn__name branchbtn__name--short">{mine ? shortName(mine) : "Choose"}</span>
        </span>
        <Icon name="down" className="branchbtn__chev" />
      </button>
      {!mine && !pickerOpen && <BranchNudge />}
    </span>
  );
}

/** The list of branches, grouped by town, with search when there are many. */
export function BranchPicker() {
  const locations = useLocations();
  const { code, pickerOpen } = useBranchState();
  const [q, setQ] = useState("");
  const panel = useRef<HTMLDivElement>(null);
  const lastFocus = useRef<Element | null>(null);
  const mine = myBranchOf(locations, code);
  const searchable = locations.length > 6;

  useEffect(() => {
    if (!pickerOpen) return;
    setQ("");
    lastFocus.current = document.activeElement;
    // Focus the search box, or the current branch, or the first one
    requestAnimationFrame(() => {
      const target =
        panel.current?.querySelector<HTMLElement>(".bpick__search input") ??
        panel.current?.querySelector<HTMLElement>(".bpick__opt.is-on") ??
        panel.current?.querySelector<HTMLElement>(".bpick__opt");
      target?.focus();
    });
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeBranchPicker();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      (lastFocus.current as HTMLElement | null)?.focus?.();
    };
  }, [pickerOpen]);

  const groups = useMemo(() => {
    const term = q.trim().toLowerCase();
    const hits = term
      ? locations.filter((l) => [l.name, l.town ?? "", l.address ?? ""].some((s) => s.toLowerCase().includes(term)))
      : locations;
    return byTown(hits);
  }, [locations, q]);

  if (locations.length < PICKER_FROM) return null;
  const towns = new Set(locations.map((l) => l.town).filter(Boolean)).size;

  return (
    <div className={`bpick ${pickerOpen ? "is-open" : ""}`} aria-hidden={!pickerOpen} inert={!pickerOpen}>
      <div className="bpick__scrim" onClick={closeBranchPicker} />
      <div className="bpick__panel" role="dialog" aria-modal="true" aria-labelledby="bpick-title" ref={panel}>
        <header className="bpick__head">
          <div>
            <h2 id="bpick-title">Choose your branch</h2>
            <p>
              {locations.length} branches{towns > 1 ? ` in ${towns} towns` : ""}. We'll show what's in stock there first.
            </p>
          </div>
          <button className="bpick__close" onClick={closeBranchPicker} aria-label="Close">
            <Icon name="close" />
          </button>
        </header>

        {searchable && (
          <label className="bpick__search">
            <Icon name="search" />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search town or branch"
              aria-label="Search town or branch"
              enterKeyHint="search"
            />
          </label>
        )}

        <div className="bpick__list">
          {groups.length === 0 && <p className="bpick__none">No branch matches “{q}”.</p>}
          {groups.map((g) => (
            <section key={g.town} className="bpick__group">
              {(towns > 1 || g.town !== "Other") && <h3>{g.town}</h3>}
              <ul>
                {g.branches.map((l) => {
                  const on = mine?.code === l.code;
                  return (
                    <li key={l.code}>
                      <button className={`bpick__opt ${on ? "is-on" : ""}`} onClick={() => chooseBranch(l.code)} aria-pressed={on}>
                        <span className="bpick__pin" aria-hidden="true">
                          <Icon name={on ? "check" : "pin"} />
                        </span>
                        <span className="bpick__text">
                          <strong>{l.name}</strong>
                          {l.address && <span>{l.address}</span>}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>

        <footer className="bpick__foot">
          <button className="btn btn--block" onClick={() => chooseBranch(null)}>
            {mine ? "Forget my branch and show all" : "Skip, show all branches"}
          </button>
        </footer>
      </div>
    </div>
  );
}
