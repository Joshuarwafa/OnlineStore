import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api/store";
import { config } from "../config";
import { useDocumentTitle } from "../lib/useAsync";
import { recentOrders } from "../lib/orders";
import { Spinner } from "../components/bits";
import { Icon } from "../components/Icon";
import { docWords, useCheckoutDocument } from "../lib/documents";

export function TrackForm({ initialNo = "", onFound }: { initialNo?: string; onFound: (no: string, contact: string) => void }) {
  const words = docWords(useCheckoutDocument());
  const [no, setNo] = useState(initialNo);
  const [contact, setContact] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  return (
    <form
      className="track-form"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!no.trim() || !contact.trim()) return setError("Please enter your number (WEB-…) and phone number.");
        setBusy(true);
        setError(undefined);
        try {
          const o = await api.order(no.trim(), contact.trim());
          onFound(o.storeOrderNo, contact.trim());
        } catch (err) {
          setError(err instanceof Error ? err.message : String(err));
        } finally {
          setBusy(false);
        }
      }}
    >
      <label className="field field--wide">
        <span className="field__label">Your number (WEB-…)</span>
        <input className="mono" value={no} onChange={(e) => setNo(e.target.value.toUpperCase())} placeholder="WEB-2611-00000" autoComplete="off" />
      </label>
      <label className="field field--wide">
        <span className="field__label">Phone number you gave us</span>
        <input type="tel" inputMode="tel" value={contact} onChange={(e) => setContact(e.target.value)} autoComplete="tel" />
      </label>
      {error && (
        <p className="field__error" role="alert">
          {error}
        </p>
      )}
      <button className="btn btn--signal btn--xl btn--block" disabled={busy}>
        {busy ? <Spinner label="Looking" /> : `Find my ${words.noun}`}
      </button>
    </form>
  );
}

export function Track() {
  const words = docWords(useCheckoutDocument());
  useDocumentTitle(`My ${words.plural}`, config.storeName);
  const navigate = useNavigate();
  const recent = recentOrders();

  return (
    <div className="page page--narrow">
      <Link to="/" className="backlink">
        <Icon name="back" /> Back to products
      </Link>
      <h1 className="shop__title">My {words.plural}</h1>

      {recent.length > 0 && (
        <div className="recent">
          <p className="field__label">Your recent {words.plural}</p>
          <ul>
            {recent.map((no) => (
              <li key={no}>
                <Link className="btn btn--block mono" to={`/order/${encodeURIComponent(no)}`}>
                  {no} →
                </Link>
              </li>
            ))}
          </ul>
          <p className="field__label">Or look up another one</p>
        </div>
      )}
      <TrackForm onFound={(no, contact) => navigate(`/order/${encodeURIComponent(no)}`, { state: { contact } })} />
    </div>
  );
}
