import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useState, type ReactNode } from "react";
import type { CartLine } from "../types";

// The cart lives in the browser for the first release (guest checkout, scope D9).
// Prices here are only what the shopper saw; checkout re-prices everything from Sage.

type Action =
  | { type: "add"; line: CartLine; max?: number }
  | { type: "setQty"; code: string; qty: number }
  | { type: "reprice"; code: string; unitPriceIncl: number }
  | { type: "remove"; code: string }
  | { type: "clear" }
  | { type: "replace"; lines: CartLine[] };

const KEY = "cart.v1";

function reducer(lines: CartLine[], a: Action): CartLine[] {
  switch (a.type) {
    case "add": {
      const existing = lines.find((l) => l.code === a.line.code);
      const cap = (q: number) => (a.max !== undefined ? Math.min(q, a.max) : q);
      if (existing) {
        return lines.map((l) =>
          l.code === a.line.code ? { ...l, qty: cap(l.qty + a.line.qty), unitPriceIncl: a.line.unitPriceIncl } : l,
        );
      }
      return [...lines, { ...a.line, qty: cap(a.line.qty) }];
    }
    case "setQty":
      return a.qty <= 0 ? lines.filter((l) => l.code !== a.code) : lines.map((l) => (l.code === a.code ? { ...l, qty: a.qty } : l));
    case "reprice":
      return lines.map((l) => (l.code === a.code ? { ...l, unitPriceIncl: a.unitPriceIncl } : l));
    case "remove":
      return lines.filter((l) => l.code !== a.code);
    case "clear":
      return [];
    case "replace":
      return a.lines;
  }
}

function load(): CartLine[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(raw) ? raw.filter((l) => l && typeof l.code === "string" && l.qty > 0) : [];
  } catch {
    return [];
  }
}

interface CartApi {
  lines: CartLine[];
  count: number;
  subtotal: number;
  add: (line: CartLine, max?: number) => void;
  setQty: (code: string, qty: number) => void;
  reprice: (code: string, unitPriceIncl: number) => void;
  remove: (code: string) => void;
  clear: () => void;
  docketOpen: boolean;
  openDocket: () => void;
  closeDocket: () => void;
  /** Bumps whenever something is added, so the header badge can animate. */
  pulse: number;
}

const Ctx = createContext<CartApi | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, dispatch] = useReducer(reducer, undefined, load);
  const [docketOpen, setDocketOpen] = useState(false);
  const [pulse, setPulse] = useState(0);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(lines));
    } catch {
      /* storage unavailable: cart lasts for this visit */
    }
  }, [lines]);

  // Keep tabs in step with each other
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY) dispatch({ type: "replace", lines: load() });
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const add = useCallback((line: CartLine, max?: number) => {
    dispatch({ type: "add", line, max });
    setPulse((p) => p + 1);
  }, []);

  const value = useMemo<CartApi>(
    () => ({
      lines,
      count: lines.reduce((s, l) => s + l.qty, 0),
      subtotal: Math.round(lines.reduce((s, l) => s + l.qty * l.unitPriceIncl, 0) * 100) / 100,
      add,
      setQty: (code, qty) => dispatch({ type: "setQty", code, qty }),
      reprice: (code, unitPriceIncl) => dispatch({ type: "reprice", code, unitPriceIncl }),
      remove: (code) => dispatch({ type: "remove", code }),
      clear: () => dispatch({ type: "clear" }),
      docketOpen,
      openDocket: () => setDocketOpen(true),
      closeDocket: () => setDocketOpen(false),
      pulse,
    }),
    [lines, add, docketOpen, pulse],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCart(): CartApi {
  const c = useContext(Ctx);
  if (!c) throw new Error("useCart must be used inside CartProvider");
  return c;
}
