import { adminRequest } from "../../api/admin";

// The shop's workflow: what an online order becomes in Sage. Saved by the store backend; each
// installation sets its own.

export type DocumentType = "Quotation" | "SalesOrder" | "Invoice";

export interface WorkflowStep {
  /** What an order becomes at checkout. */
  document: "SalesOrder" | "Invoice";
  trigger: "checkout";
  /** Sales order only: hold each line's quantity in its warehouse until invoiced or cancelled. */
  reserveStock?: boolean;
}

export interface Workflow {
  /** One step, made at checkout: a sales order or an invoice. */
  steps: WorkflowStep[];
  /** Shoppers may ask for a quotation instead of ordering. */
  allowQuotation: boolean;
}

export const getWorkflow = () => adminRequest<Workflow>("GET", "/settings/workflow");
export const saveWorkflow = (workflow: Workflow) => adminRequest<Workflow>("PUT", "/settings/workflow", workflow);
