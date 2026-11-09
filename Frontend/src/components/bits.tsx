import type React from "react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { hueOf, initialsOf } from "../lib/swatch";
import { formatMoney, stockLabel, stockLevel } from "../lib/format";

/** Stand-in for a product photo: a neutral tile with the item's initials. */
export function Swatch({
  code,
  description = "",
  className = "",
  style,
}: {
  code: string;
  description?: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  const initials = useMemo(() => initialsOf(description || code), [code, description]);
  const hue = useMemo(() => hueOf(description || code), [code, description]);
  return (
    <span className={`swatch ${className}`} aria-hidden="true" style={{ ...style, "--h": hue } as React.CSSProperties}>
      <span className="swatch__mark">{initials}</span>
    </span>
  );
}

/** Product photo when one has been uploaded, otherwise the generated plate. */
export function ProductImage({
  code,
  description,
  url,
  className = "",
  eager = false,
  style,
}: {
  code: string;
  description: string;
  url: string | null | undefined;
  className?: string;
  eager?: boolean;
  style?: React.CSSProperties;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [url]);
  if (!url || failed) return <Swatch code={code} description={description} className={className} style={style} />;
  return (
    <img
      className={`photo ${className}`}
      style={style}
      src={url}
      alt={description}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}

export function Price({ amount, currency, size = "md" }: { amount: number | null; currency?: string; size?: "sm" | "md" | "xl" }) {
  if (amount == null) return <span className={`price price--${size} price--none`}>Price on request</span>;
  return <span className={`price price--${size}`}>{formatMoney(amount, currency)}</span>;
}

/** A coloured dot and a plain-words stock note. */
export function StockMeter({ qty, showLabel = true }: { qty: number; showLabel?: boolean }) {
  return (
    <span className={`stock stock--${stockLevel(qty)}`}>
      <span className="stock__dot" aria-hidden="true" />
      {showLabel && <span className="stock__label">{stockLabel(qty)}</span>}
    </span>
  );
}

export function QtyStepper({
  value,
  onChange,
  max,
  label = "Quantity",
  size = "md",
}: {
  value: number;
  onChange: (n: number) => void;
  max?: number;
  label?: string;
  size?: "sm" | "md";
}) {
  const clamp = (n: number) => Math.max(1, max !== undefined ? Math.min(n, Math.max(1, Math.floor(max))) : n);
  return (
    <span className={`stepper stepper--${size}`} role="group" aria-label={label}>
      <button type="button" onClick={() => onChange(clamp(value - 1))} disabled={value <= 1} aria-label="Decrease quantity">
        −
      </button>
      <input
        inputMode="numeric"
        value={value}
        aria-label={label}
        onChange={(e) => {
          const n = parseInt(e.target.value.replace(/\D/g, ""), 10);
          if (!Number.isNaN(n)) onChange(clamp(n));
        }}
      />
      <button
        type="button"
        onClick={() => onChange(clamp(value + 1))}
        disabled={max !== undefined && value >= max}
        aria-label="Increase quantity"
      >
        +
      </button>
    </span>
  );
}

export function ErrorPanel({ error, onRetry, title = "Something went wrong" }: { error: Error; onRetry?: () => void; title?: string }) {
  return (
    <div className="panel panel--error" role="alert">
      <p className="panel__title">{title}</p>
      <p>{error.message}</p>
      {onRetry && (
        <button className="btn btn--ghost" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty__shelf" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <p className="empty__title">{title}</p>
      {children}
    </div>
  );
}

export function Spinner({ label = "Loading" }: { label?: string }) {
  return <span className="spinner" role="status" aria-label={label} />;
}
