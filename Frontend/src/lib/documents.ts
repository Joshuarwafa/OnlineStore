import { useEffect, useState } from "react";
import { api } from "../api/store";
import type { DocumentType } from "../types";

// An order goes through a quotation, sales order and/or invoice in Sage (admin → Maintenance →
// Workflow). The shop's wording follows: "Get my quotation" / "Place my order", and the printed title.

export interface DocWords {
  /** In a sentence: "your quotation", "your order". */
  noun: string;
  plural: string;
  /** Printed at the top of the document. */
  title: string;
  /** The step once it's in Sage. */
  ready: string;
  readyNote: string;
  /** The stamp on the number. */
  stamp: string;
  /** The checkout button. */
  action: string;
}

export function docWords(type: DocumentType | undefined): DocWords {
  if (type === "Invoice") {
    return {
      noun: "invoice",
      plural: "orders",
      title: "Tax Invoice",
      ready: "Invoiced",
      readyNote: "Your order is invoiced and on its way to you.",
      stamp: "Invoiced",
      action: "Place my order",
    };
  }
  return type === "SalesOrder"
    ? {
        noun: "order",
        plural: "orders",
        title: "Sales Order",
        ready: "Order placed",
        readyNote: "Your order is saved and the stock is set aside for you.",
        stamp: "Ordered",
        action: "Place my order",
      }
    : {
        noun: "quotation",
        plural: "quotations",
        title: "Quotation",
        ready: "Quotation ready",
        readyNote: "Your quotation is saved with us.",
        stamp: "Quoted",
        action: "Get my quotation",
      };
}

export interface CheckoutSettings {
  /** What an order becomes at checkout: a sales order or an invoice. */
  checkoutDocument: DocumentType;
  /** Shoppers may ask for a quotation instead of ordering. */
  allowQuotation: boolean;
}

const FALLBACK: CheckoutSettings = { checkoutDocument: "SalesOrder", allowQuotation: false };
let cached: Promise<CheckoutSettings> | null = null;

/** The admin's workflow as the shop needs it; read once per visit. */
export function checkoutSettings(): Promise<CheckoutSettings> {
  cached ??= api.checkoutSettings().catch(() => {
    cached = null; // try again next time
    return FALLBACK;
  });
  return cached;
}

export function useCheckoutSettings(): CheckoutSettings {
  const [settings, setSettings] = useState<CheckoutSettings>(FALLBACK);
  useEffect(() => {
    let live = true;
    void checkoutSettings().then((s) => live && setSettings(s));
    return () => {
      live = false;
    };
  }, []);
  return settings;
}

/** What an order becomes at checkout (for wording). */
export const useCheckoutDocument = (): DocumentType => useCheckoutSettings().checkoutDocument;
