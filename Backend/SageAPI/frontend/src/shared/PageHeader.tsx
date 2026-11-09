import { RefreshCw } from "lucide-react";
import { formatTime } from "./format";

interface Props {
  title: string;
  subtitle?: string;
  loadedAt: Date | null;
  loading: boolean;
  onRefresh: () => void;
}

export function PageHeader({ title, subtitle, loadedAt, loading, onRefresh }: Props) {
  return (
    <header className="page-header">
      <div>
        <h1>{title}</h1>
        {subtitle && <p className="subtitle">{subtitle}</p>}
      </div>
      <div className="page-actions">
        {loadedAt && <span className="muted small">Updated {formatTime(loadedAt)}</span>}
        <button type="button" className="button" onClick={onRefresh} disabled={loading}>
          <RefreshCw size={15} aria-hidden="true" className={loading ? "spin" : undefined} />
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>
    </header>
  );
}
