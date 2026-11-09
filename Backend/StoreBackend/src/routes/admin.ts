import express, { Router } from "express";
import { addPicture, allPictures, deletePicture, MAX_UPLOAD_BYTES, orderPictures } from "../images.js";
import { checkRateLimit, clearFailures, clearSession, currentSession, issueSession, recordFailure, requireAdmin, sameOriginOnly, verifyPassword } from "../auth.js";
import { HttpError } from "../errors.js";
import { sageApi } from "../sageApi.js";
import { saveShopWarehouses, shopWarehouses } from "../shopWarehouses.js";
import { saveCashAccount, searchCustomers, shopCustomers } from "../shopCustomers.js";
import { saveShopCompany, shopCompany } from "../shopCompany.js";
import { saveShopWorkflow, shopWorkflow } from "../shopWorkflow.js";
import { listOrders, runNextStep } from "../orders.js";

export const admin = Router();
admin.use(sameOriginOnly);

const ADMIN = { name: "Store admin" };

// ---------- session ----------

admin.get("/session", (req, res) => {
  if (!currentSession(req)) throw new HttpError(401, "Not signed in.");
  res.json(ADMIN);
});

admin.post("/session", async (req, res) => {
  const ip = req.ip ?? "unknown";
  checkRateLimit(ip);
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  if (!password || password.length > 200 || !(await verifyPassword(password))) {
    recordFailure(ip);
    throw new HttpError(401, "That password isn't right.");
  }
  clearFailures(ip);
  issueSession(res);
  res.json(ADMIN);
});

admin.delete("/session", (_req, res) => {
  clearSession(res);
  res.status(204).end();
});

// ---------- settings: database connections (stored by SageAPI in its appsettings.json) ----------

interface ConnectionsInput {
  server: string;
  username: string;
  password?: string;
  companyDatabase: string;
  commonDatabase: string;
  stagingDatabase: string;
}

const text = (b: Record<string, unknown>, k: string) => (typeof b[k] === "string" ? (b[k] as string) : "");

function connectionsInput(body: unknown): ConnectionsInput {
  const b = (body ?? {}) as Record<string, unknown>;
  return {
    server: text(b, "server"),
    username: text(b, "username"),
    // only forward a password that was actually typed; empty means "keep the saved one"
    ...(text(b, "password") ? { password: text(b, "password") } : {}),
    companyDatabase: text(b, "companyDatabase"),
    commonDatabase: text(b, "commonDatabase"),
    stagingDatabase: text(b, "stagingDatabase"),
  };
}

// ---------- customers ----------

// Sage customers, searched by account or name (for choosing the walk-in cash account)
admin.get("/customers", requireAdmin, async (req, res) => {
  const str = (k: string) => (typeof req.query[k] === "string" ? (req.query[k] as string) : "");
  const page = Math.max(1, Number(str("page")) || 1);
  const pageSize = Math.min(200, Math.max(1, Number(str("pageSize")) || 50));
  res.json(await searchCustomers(str("search").trim().slice(0, 100), page, pageSize));
});

// The Sage account used for walk-in shoppers' quotations and orders
admin.get("/settings/customers", requireAdmin, async (_req, res) => {
  res.json(await shopCustomers());
});

admin.put("/settings/customers", requireAdmin, async (req, res) => {
  res.json(await saveCashAccount(req.body?.cashAccount));
});

// ---------- company ----------

// The company's own details printed on every quotation (Maintenance → Company)
admin.get("/settings/company", requireAdmin, async (_req, res) => {
  res.json(await shopCompany());
});

admin.put("/settings/company", requireAdmin, async (req, res) => {
  res.json(await saveShopCompany(req.body));
});

// ---------- workflow ----------

// What checkout makes in Sage: a quotation, or a sales order that holds the stock (Maintenance → Workflow)
admin.get("/settings/workflow", requireAdmin, async (_req, res) => {
  res.json(await shopWorkflow());
});

admin.put("/settings/workflow", requireAdmin, async (req, res) => {
  res.json(await saveShopWorkflow(req.body));
});

// ---------- documents ----------

// Online orders with their steps so far (quotation, sales order, invoice) and what staff can do next.
// status = waiting (a step to confirm) | problem (failed or not confirmed by Sage) | anything else = all
admin.get("/documents", requireAdmin, async (req, res) => {
  const str = (k: string) => (typeof req.query[k] === "string" ? (req.query[k] as string) : undefined);
  res.json({ orders: await listOrders({ search: str("search"), status: str("status") }) });
});

// Staff confirm the next step of an order (or try a failed step again)
admin.post("/documents/:no/next", requireAdmin, async (req, res) => {
  res.json(await runNextStep(String(req.params.no)));
});

// ---------- shop warehouses ----------

// The warehouses the online shop sells from (Maintenance → Warehouses), with shopper-facing names
admin.get("/settings/shop-warehouses", requireAdmin, async (_req, res) => {
  res.json(await shopWarehouses());
});

admin.put("/settings/shop-warehouses", requireAdmin, async (req, res) => {
  res.json(await saveShopWarehouses(req.body?.warehouses));
});

admin.get("/settings/connections", requireAdmin, async (_req, res) => {
  res.json(await sageApi("GET", "/settings/connections"));
});

admin.put("/settings/connections", requireAdmin, async (req, res) => {
  res.json(await sageApi("PUT", "/settings/connections", connectionsInput(req.body)));
});

admin.post("/settings/connections/test", requireAdmin, async (req, res) => {
  res.json(await sageApi("POST", "/settings/connections/test", connectionsInput(req.body)));
});

admin.post("/settings/connections/databases", requireAdmin, async (req, res) => {
  const { server, username, password } = connectionsInput(req.body);
  res.json(await sageApi("POST", "/settings/connections/databases", { server, username, ...(password ? { password } : {}) }));
});

// ---------- store data: categories and item assignments (stored by SageAPI in the store database) ----------

// The admin app's /api/admin/store/... calls map one-to-one onto SageAPI's /api/Pastel/store/...
// Only these shapes are passed on, so nothing else in SageAPI can be reached through here.
const storeRoutes: { method: "GET" | "POST" | "PUT" | "DELETE"; path: RegExp }[] = [
  { method: "GET", path: /^\/categories$/ },
  { method: "POST", path: /^\/categories$/ },
  { method: "PUT", path: /^\/categories\/\d+$/ },
  { method: "DELETE", path: /^\/categories\/\d+$/ },
  { method: "POST", path: /^\/categories\/import\/(preview|apply)$/ },
  { method: "GET", path: /^\/items$/ },
  { method: "PUT", path: /^\/items$/ },
];

// ---------- product pictures (kept by this backend in its pictures folder) ----------

admin.get("/images", requireAdmin, (_req, res) => {
  res.json(allPictures());
});

// The picture is sent as the request body itself (Content-Type image/jpeg, image/png or image/webp)
admin.post(
  "/products/:code/images",
  requireAdmin,
  express.raw({ type: ["image/jpeg", "image/png", "image/webp"], limit: MAX_UPLOAD_BYTES }),
  async (req, res) => {
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) throw new HttpError(415, "Send a JPG, PNG or WebP picture.");
    res.json(await addPicture(String(req.params.code), req.body));
  },
);

admin.put("/products/:code/images/order", requireAdmin, async (req, res) => {
  res.json(await orderPictures(String(req.params.code), req.body?.ids));
});

admin.delete("/products/:code/images/:id", requireAdmin, async (req, res) => {
  await deletePicture(String(req.params.code), String(req.params.id));
  res.status(204).end();
});

admin.use("/store", requireAdmin, async (req, res) => {
  const route = storeRoutes.find((r) => r.method === req.method && r.path.test(req.path));
  if (!route) throw new HttpError(404, "This part of the store isn't connected yet.");
  const body = route.method === "GET" || route.method === "DELETE" ? undefined : (req.body ?? {});
  res.json(await sageApi(route.method, `/store${req.path}`, body));
});
