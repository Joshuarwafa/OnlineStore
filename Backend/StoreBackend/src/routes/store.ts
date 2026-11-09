import { Router } from "express";
import { liveProduct, queryCatalogue, shopCategories, shopLocations } from "../catalogue.js";
import { shopCompany } from "../shopCompany.js";
import { firstStep, shopWorkflow } from "../shopWorkflow.js";
import { cleanLines, findOrder, placeOrder, priceDocket, QuoteChanged } from "../orders.js";

// Public shop routes: catalogue, product, checkout quote, and quotations into Sage.
export const store = Router();

const SORTS = new Set(["description", "price_asc", "price_desc", "stock"]);

store.get("/catalogue", async (req, res) => {
  const str = (k: string) => (typeof req.query[k] === "string" ? (req.query[k] as string) : "");
  const page = Math.max(1, Number(str("page")) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(str("pageSize")) || 24));
  const sort = SORTS.has(str("sort")) ? str("sort") : "description";
  res.json(
    await queryCatalogue({
      search: str("search").slice(0, 100),
      category: str("category").slice(0, 120) || undefined,
      page,
      pageSize,
      inStock: str("inStock") === "true",
      withPhoto: str("withPhoto") === "true",
      branch: str("branch").slice(0, 20) || undefined,
      sort,
    }),
  );
});

store.get("/categories", async (_req, res) => {
  res.json({ categories: await shopCategories() });
});

// Where the shop's stock is: the warehouses ticked in the admin portal, with shopper-facing names
store.get("/locations", async (_req, res) => {
  res.json({ locations: await shopLocations() });
});

// The company's own details for the top of a printed quotation
store.get("/company", async (_req, res) => {
  res.json(await shopCompany());
});

// What checkout makes (Maintenance → Workflow) and whether shoppers may ask for a quotation instead
store.get("/checkout/settings", async (_req, res) => {
  const workflow = await shopWorkflow();
  res.json({ checkoutDocument: firstStep(workflow).document, allowQuotation: workflow.allowQuotation });
});

// Codes can contain "/" (47195/ORB): the client sends them encoded as one segment
store.get("/products/:code", async (req, res) => {
  res.json(await liveProduct(req.params.code));
});

store.post("/checkout/quote", async (req, res) => {
  // Prices and stock are read live from Sage for every line; with a branch, stock is counted there
  const { quote } = await priceDocket(cleanLines(req.body?.lines), req.body?.branch);
  res.json(quote);
});

// The cart becomes a quotation or sales order in Sage (Maintenance → Workflow), on the shop's cash account
store.post("/orders", async (req, res) => {
  try {
    const { order, duplicate } = await placeOrder(req.body, req.get("Idempotency-Key") ?? "");
    res.status(duplicate ? 200 : 201).json({ documentType: order.documentType, storeOrderNo: order.storeOrderNo, status: order.status, sageDocumentNo: order.sageDocumentNo, duplicate });
  } catch (e) {
    // Stock or prices moved: send the fresh quote so the shop can show what changed
    if (e instanceof QuoteChanged) {
      res.status(409).json(e.quote);
      return;
    }
    throw e;
  }
});

store.get("/orders/:no", async (req, res) => {
  const contact = typeof req.query.contact === "string" ? req.query.contact.slice(0, 120) : "";
  res.json(await findOrder(req.params.no, contact));
});
