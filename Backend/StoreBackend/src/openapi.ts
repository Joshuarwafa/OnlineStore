// OpenAPI description of the store backend, served by Swagger UI at /api/docs.
// Keep in step with src/routes when a route changes.

const error = { $ref: "#/components/schemas/Error" };
const errorResponse = (description: string) => ({ description, content: { "application/json": { schema: error } } });

const connectionsInput = {
  type: "object",
  required: ["server", "username", "companyDatabase", "commonDatabase", "stagingDatabase"],
  properties: {
    server: { type: "string", example: "localhost\\MSSQLSERVER22", description: "SQL Server holding Sage and the store database." },
    username: { type: "string" },
    password: { type: "string", description: "Leave empty to keep the saved password." },
    companyDatabase: { type: "string", example: "Cold Chain Byo 2024", description: "Sage company database." },
    commonDatabase: { type: "string", example: "SageCommon", description: "Sage common database." },
    stagingDatabase: { type: "string", example: "SageStaging", description: "The store's own database." },
  },
};

export const openapi = {
  openapi: "3.0.3",
  info: {
    title: "Online Store Backend",
    version: "0.1.0",
    description:
      "Public shop routes and admin routes. Prices and stock are read live from Sage through SageAPI.\n\n" +
      "To use the admin routes: run **POST /api/admin/session** with your admin password first. " +
      "The browser keeps the session cookie and sends it with the admin calls after that.",
  },
  servers: [{ url: "/" }],
  tags: [
    { name: "Health" },
    { name: "Store", description: "Public shop routes" },
    { name: "Admin", description: "Needs a signed-in admin session" },
  ],
  components: {
    securitySchemes: {
      adminSession: { type: "apiKey", in: "cookie", name: "store_admin", description: "Set by POST /api/admin/session" },
    },
    schemas: {
      Error: { type: "object", properties: { message: { type: "string" } } },
      Product: {
        type: "object",
        properties: {
          code: { type: "string", example: "47195/ORB" },
          description: { type: "string" },
          priceIncl: { type: "number", nullable: true },
          priceExcl: { type: "number", nullable: true },
          qtyOnHand: { type: "number" },
        },
        additionalProperties: true,
      },
      Catalogue: {
        type: "object",
        properties: {
          items: { type: "array", items: { $ref: "#/components/schemas/Product" } },
          page: { type: "integer" },
          pageSize: { type: "integer" },
          total: { type: "integer" },
          priceList: { type: "string" },
          currency: { type: "string" },
          refreshedAt: { type: "string", format: "date-time" },
        },
      },
      QuoteLine: {
        type: "object",
        properties: {
          code: { type: "string" },
          description: { type: "string" },
          qty: { type: "integer" },
          available: { type: "integer" },
          unitPriceIncl: { type: "number" },
          lineTotalIncl: { type: "number" },
          status: { type: "string", enum: ["ok", "short", "unavailable"] },
        },
      },
      Quote: {
        type: "object",
        properties: {
          lines: { type: "array", items: { $ref: "#/components/schemas/QuoteLine" } },
          totalIncl: { type: "number" },
          totalExcl: { type: "number" },
          vat: { type: "number" },
          currency: { type: "string" },
          clean: { type: "boolean", description: "true when every line is in stock at the asked quantity" },
        },
      },
      Admin: { type: "object", properties: { name: { type: "string", example: "Store admin" } } },
      ConnectionsInput: connectionsInput,
    },
  },
  paths: {
    "/api/health": {
      get: {
        tags: ["Health"],
        summary: "Check the server is up",
        responses: { 200: { description: "Running", content: { "application/json": { schema: { type: "object", properties: { ok: { type: "boolean" } } } } } } },
      },
    },
    "/api/catalogue": {
      get: {
        tags: ["Store"],
        summary: "List products",
        parameters: [
          { name: "search", in: "query", schema: { type: "string", maxLength: 100 } },
          { name: "page", in: "query", schema: { type: "integer", minimum: 1, default: 1 } },
          { name: "pageSize", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 24 } },
          { name: "inStock", in: "query", schema: { type: "boolean" } },
          { name: "withPhoto", in: "query", schema: { type: "boolean" }, description: "Only items that have an uploaded photo" },
          { name: "branch", in: "query", schema: { type: "string" }, description: "Only items in stock at this branch (warehouse code)" },
          { name: "sort", in: "query", schema: { type: "string", enum: ["description", "price_asc", "price_desc", "stock"], default: "description" } },
          { name: "category", in: "query", description: "Not live yet: any value returns no items.", schema: { type: "string" } },
        ],
        responses: { 200: { description: "A page of products", content: { "application/json": { schema: { $ref: "#/components/schemas/Catalogue" } } } } },
      },
    },
    "/api/categories": {
      get: {
        tags: ["Store"],
        summary: "List categories (empty until categories are live)",
        responses: { 200: { description: "Categories", content: { "application/json": { schema: { type: "object", properties: { categories: { type: "array", items: {} } } } } } } },
      },
    },
    "/api/locations": {
      get: {
        tags: ["Store"],
        summary: "The shop's warehouses (ticked in the admin portal), with the names and addresses shoppers see",
        responses: {
          200: {
            description: "Locations, in the chosen order",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    locations: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          code: { type: "string" },
                          name: { type: "string" },
                          address: { type: "string", nullable: true },
                          town: { type: "string", nullable: true },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/api/products/{code}": {
      get: {
        tags: ["Store"],
        summary: "One product, live from Sage",
        parameters: [{ name: "code", in: "path", required: true, description: "Item code. Codes containing / are sent encoded (47195%2FORB).", schema: { type: "string" } }],
        responses: {
          200: { description: "The product", content: { "application/json": { schema: { $ref: "#/components/schemas/Product" } } } },
          404: errorResponse("No product with that code"),
        },
      },
    },
    "/api/checkout/quote": {
      post: {
        tags: ["Store"],
        summary: "Re-price a docket with live prices and stock",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["lines"],
                properties: {
                  branch: { type: "string", description: "Optional Sage warehouse code of the shopper's branch; stock is counted there" },
                  lines: {
                    type: "array",
                    minItems: 1,
                    maxItems: 100,
                    items: { type: "object", required: ["code", "qty"], properties: { code: { type: "string" }, qty: { type: "integer", minimum: 1, maximum: 100000 } } },
                  },
                },
              },
              example: { lines: [{ code: "47195/ORB", qty: 2 }] },
            },
          },
        },
        responses: {
          200: { description: "The quote", content: { "application/json": { schema: { $ref: "#/components/schemas/Quote" } } } },
          400: errorResponse("Empty, too large or invalid docket"),
        },
      },
    },
    "/api/orders": {
      post: {
        tags: ["Store"],
        summary: "Turn the cart into a sales order, invoice or quotation in Sage Evolution",
        description:
          "Re-prices every line live, checks stock at the shopper's branch, then creates the workflow's first document (Maintenance → Workflow: a sales order or an invoice) on the cash account chosen under Maintenance → Customers. With quotation: true (when the workflow allows quotations) it creates a quotation instead. The shopper's name, phone, email and address go on the document (Deliver To and message lines). Saved in the store database first (Pending), then in Sage (Posted). The same Idempotency-Key always returns the same order.",
        parameters: [{ name: "Idempotency-Key", in: "header", required: true, schema: { type: "string", minLength: 8, maxLength: 100 } }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              example: {
                shopper: { name: "Tendai Moyo", phone: "0771 234 567", email: "" },
                fulfilment: "collection",
                address: null,
                payment: "on_collection",
                quotation: false,
                branch: "2",
                lines: [{ code: "377916U/WRI", qty: 1 }],
              },
            },
          },
        },
        responses: {
          201: { description: "Created: { documentType (SalesOrder | Invoice | Quotation), storeOrderNo, status, sageDocumentNo, duplicate }" },
          200: { description: "This Idempotency-Key was already used: the existing order" },
          400: errorResponse("Missing name or phone, bad cart, or no Idempotency-Key"),
          409: { description: "Prices or stock changed: the body is a fresh Quote", content: { "application/json": { schema: { $ref: "#/components/schemas/Quote" } } } },
          502: errorResponse("Sage refused the document (reason logged on the server and shown in admin → Documents)"),
          503: errorResponse("No cash account chosen in the admin portal"),
        },
      },
    },
    "/api/orders/{no}": {
      get: {
        tags: ["Store"],
        summary: "Look up a quotation by its number and the phone (or email) given at checkout",
        parameters: [
          { name: "no", in: "path", required: true, schema: { type: "string" }, example: "WEB-261106-K7QX" },
          { name: "contact", in: "query", required: true, schema: { type: "string" } },
        ],
        responses: { 200: { description: "The quotation" }, 404: errorResponse("No quotation with that number and phone") },
      },
    },
    "/api/admin/session": {
      get: {
        tags: ["Admin"],
        summary: "Who is signed in",
        security: [{ adminSession: [] }],
        responses: {
          200: { description: "Signed in", content: { "application/json": { schema: { $ref: "#/components/schemas/Admin" } } } },
          401: errorResponse("Not signed in"),
        },
      },
      post: {
        tags: ["Admin"],
        summary: "Sign in",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["password"], properties: { password: { type: "string", format: "password" } } } } },
        },
        responses: {
          200: { description: "Signed in; sets the store_admin cookie", content: { "application/json": { schema: { $ref: "#/components/schemas/Admin" } } } },
          401: errorResponse("Wrong password"),
          429: errorResponse("Too many attempts"),
        },
      },
      delete: { tags: ["Admin"], summary: "Sign out", responses: { 204: { description: "Signed out" } } },
    },
    "/api/admin/settings/connections": {
      get: {
        tags: ["Admin"],
        summary: "Read the database connection settings",
        security: [{ adminSession: [] }],
        responses: { 200: { description: "Saved settings (password not returned)" }, 401: errorResponse("Not signed in") },
      },
      put: {
        tags: ["Admin"],
        summary: "Save the database connection settings",
        security: [{ adminSession: [] }],
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/ConnectionsInput" } } } },
        responses: { 200: { description: "Saved" }, 401: errorResponse("Not signed in"), 422: errorResponse("A value is missing") },
      },
    },
    "/api/admin/settings/connections/test": {
      post: {
        tags: ["Admin"],
        summary: "Test the server sign-in and each database",
        security: [{ adminSession: [] }],
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/ConnectionsInput" } } } },
        responses: { 200: { description: "Test result, one check per database" }, 401: errorResponse("Not signed in") },
      },
    },
    "/api/admin/settings/connections/databases": {
      post: {
        tags: ["Admin"],
        summary: "List the databases on the server",
        security: [{ adminSession: [] }],
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/ConnectionsInput" } } } },
        responses: { 200: { description: "Database names" }, 401: errorResponse("Not signed in"), 422: errorResponse("Could not sign in") },
      },
    },
  },
};
