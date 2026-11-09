import express from "express";
import { config } from "./config.js";
import { errorHandler, HttpError } from "./errors.js";
import { filesDir } from "./images.js";
import { admin } from "./routes/admin.js";
import { store } from "./routes/store.js";
import swaggerUi from "swagger-ui-express";
import { openapi } from "./openapi.js";

const app = express();

app.disable("x-powered-by");
// Behind IIS / a reverse proxy, trust it for the client IP (used by the login rate limit)
app.set("trust proxy", "loopback");

// Product pictures. Each file name is new for every upload and never changes, so browsers and
// Cloudflare may keep them for a year; the office is only asked once per picture.
app.use(
  "/api/images",
  express.static(filesDir, {
    immutable: true,
    maxAge: "365d",
    index: false,
    redirect: false,
    setHeaders: (res) => res.setHeader("X-Content-Type-Options", "nosniff"),
  }),
  (_req, _res, next) => next(new HttpError(404, "That picture doesn't exist.")),
);
// Category uploads carry one row per item, so they may be larger than ordinary requests
const uploadJson = express.json({ limit: "5mb" });
const normalJson = express.json({ limit: "100kb" });
app.use((req, res, next) => (req.path.startsWith("/api/admin/store/categories/import/") ? uploadJson : normalJson)(req, res, next));
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "no-store");
  next();
});

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

// API docs for local development only
if (process.env.NODE_ENV !== "production") {
  app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(openapi, { swaggerOptions: { withCredentials: true } }));
}

app.use("/api/admin", admin);
app.use("/api", store);

// Anything else under /api doesn't exist
app.use("/api", (_req, _res, next) => next(new HttpError(404, "This part of the store isn't connected yet.")));

app.use(errorHandler);

app.listen(config.port, () => {
  console.log(`Store backend listening on http://localhost:${config.port}`);
  if (config.adminAuthOff) console.warn("WARNING: ADMIN_AUTH=off. Admin routes need no sign-in. Development only.");
  console.log(`SageAPI: ${config.sageApiUrl} · price list ${config.priceList} · warehouse ${config.warehouse || "(all)"}`);
});
