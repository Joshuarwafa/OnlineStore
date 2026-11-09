import { adminRequest } from "../../api/admin";

// Online orders and the documents they have become in Sage, from the store backend.

export type DocumentType = "Quotation" | "SalesOrder" | "Invoice";
export type DocStatus = "Pending" | "Posted" | "Failed" | "Cancelled";

export interface OrderStage {
  documentType: DocumentType;
  sageDocumentNo: string | null;
  status: DocStatus;
  /** Sage's reason, when Failed. */
  failReason: string | null;
  date: string;
}

/** retry = a document Sage refused; check = one Sage hasn't confirmed. */
export type NextAction = { kind: "retry"; document: DocumentType } | { kind: "check"; document: DocumentType } | null;

export interface OnlineOrder {
  storeOrderNo: string;
  placedAt: string;
  customerName: string;
  customerPhone: string;
  branchName: string | null;
  fulfilment: string;
  payment: string;
  totalIncl: number;
  currency: string;
  stages: OrderStage[];
  next: NextAction;
}

export const listOrders = async () => (await adminRequest<{ orders: OnlineOrder[] }>("GET", "/documents")).orders;
export const runNextStep = (storeOrderNo: string) =>
  adminRequest<OnlineOrder>("POST", `/documents/${encodeURIComponent(storeOrderNo)}/next`);
