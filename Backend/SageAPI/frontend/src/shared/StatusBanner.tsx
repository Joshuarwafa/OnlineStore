import { LoaderCircle, RefreshCw, TriangleAlert } from "lucide-react";

interface Props {
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  loadingText?: string;
}

export function StatusBanner({ loading, error, onRetry, loadingText = "Loading stock from Sage…" }: Props) {
  if (error) {
    return (
      <div className="banner error" role="alert">
        <span className="banner-text">
          <TriangleAlert size={18} aria-hidden="true" />
          {error}
        </span>
        <button type="button" className="button" onClick={onRetry}>
          <RefreshCw size={15} aria-hidden="true" />
          Try again
        </button>
      </div>
    );
  }
  if (loading) {
    return (
      <div className="banner" role="status">
        <span className="banner-text">
          <LoaderCircle size={18} aria-hidden="true" className="spin" />
          {loadingText}
        </span>
      </div>
    );
  }
  return null;
}
