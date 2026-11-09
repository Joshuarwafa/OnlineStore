# Stockroom: online store frontend

The browser side of the online store described in the project scope. It is React 19, TypeScript and Vite, with hand-written CSS and no UI kit.

The browser only ever calls the **store backend** at `/api`. It never calls SageAPI. The store backend calls SageAPI with the API key.

## Run it

```bash
npm install
npm run dev          # http://localhost:5173
npm run build        # type-check + production build into dist/
```

`.env` controls the build (copy from `.env.example`):

| Variable | Meaning |
|---|---|
| `VITE_USE_MOCKS` | `true` runs against a built-in mock store, so no backend is needed. Set `false` once the store backend exists. |
| `VITE_LIVE_FEATURES` | Go live one part at a time while mocks are on. `catalogue` = shop products, prices, stock and checkout prices, live from Sage. It uses the real store backend (`../Backend/StoreBackend`). |
| `VITE_STORE_NAME` | Name in the header, footer and page titles. |
| `VITE_FULFILMENT` | `delivery`, `collection` or both (scope decision D8). |
| `VITE_PAYMENT_METHODS` | `on_collection`, `on_delivery`, `online` (scope decision D5). |
| `VITE_COLLECTION_POINT` | Shown when the shopper chooses collection. |
| `VITE_STORE_LABEL` | Branch name in the top bar (one warehouse in the first release). |
| `VITE_CONTACT_PHONE`, `VITE_CONTACT_EMAIL`, `VITE_STORE_ADDRESS`, `VITE_STORE_HOURS` | Shown in the header, footer and Contact page. **Placeholders in `.env`, replace before go-live.** Leave one empty to hide it. |
| `STORE_BACKEND_URL` | Dev server only: where `/api` is proxied. |

### Trying the mock

- 48 sample items, including `47195/ORB`, to show that codes containing `/` work.
- An order moves Pending → Processing → Posted over about 7 seconds. Watch it on the order page.
- Use a name or email containing `fail` (e.g. `fail@test.com`) to see the **Failed / on hold** state.
- Two prices change 90 seconds after page load, so checkout shows the "price changed since you added it" panel.

## Pages

| Route | What it does |
|---|---|
| `/?q=&cat=&page=` | **Home is the shop.** Search, category buttons, and products that are in stock. Each card has one big "Add to cart" button that turns into − qty + |
| `/p/{code}` | Product page: photo, price, stock, quantity, Add to cart, then "Go to checkout" |
| `/cart` | The cart, also available as a slide-out drawer everywhere (on phones, a sticky "View cart" bar) |
| `/checkout` | One short form: **name and phone required**, email optional, deliver or collect (one address box), and one **Place order** button. Prices and stock are re-checked from Sage when it's pressed. The shopper only sees that step if something changed |
| `/order/{storeOrderNo}` | Order status, polled while the order is Pending or Processing |
| `/track` | Look up an order by number and **phone number** (or email) |
| `/contact` | Phone, email, address and opening hours from `.env` |

## API contract for the store backend

All responses are JSON. Errors use a non-2xx status with `{ "message": "..." }`, and the message is shown to the shopper. Full types are in [src/types.ts](src/types.ts).

### `GET /api/catalogue`
Query: `search`, `category`, `page` (1-based), `pageSize`, `inStock=true`, `withPhoto=true` (only items with an uploaded photo, used by the Featured banner), `sort` = `description | price_asc | price_desc | stock`.
Serve it from the backend's catalogue cache, not from Sage on every request.
```json
{ "items": [{ "code": "47195/ORB", "description": "...", "priceIncl": 64.5, "priceExcl": 56.09, "qtyOnHand": 7 }],
  "page": 1, "pageSize": 24, "total": 10432, "priceList": "USD-RETAIL", "currency": "USD",
  "refreshedAt": "2026-10-09T06:00:00Z" }
```
`priceIncl` may be `null` (not on the store price list). The item is then shown but cannot be ordered.

`category` filters by store category slug. Each item also carries `"category": "power-tools"` (the first visible category it belongs to, or `null`) and `"imageUrl"` (its main photo, or `null`).

### `GET /api/categories`
Visible store categories (managed in the admin portal), in their sort order, for the category menu and search dropdown.
```json
{ "categories": [{ "code": "power-tools", "name": "Power tools", "count": 312, "imageUrl": "https://…/cat-power.webp" }] }
```

### `GET /api/products/{code}`
`code` is URL-encoded, so `47195/ORB` arrives as `47195%2FORB`. Stock is read **live** from Sage. Return 404 if the item doesn't exist.
```json
{ "code": "...", "description": "...", "priceIncl": 64.5, "priceExcl": 56.09, "qtyOnHand": 7,
  "warehouseCode": "BYO", "warehouseName": "Bulawayo", "checkedAt": "...", "currency": "USD" }
```

The product response also has `"images": [{ "id", "url", "width", "height" }]`, main photo first.

### `POST /api/checkout/quote`
Body `{ "lines": [{ "code": "...", "qty": 2 }] }`. Re-price from Sage and check stock. Each line comes back with a `status` of `ok | short | unavailable`. The frontend compares each price with what is in the cart and shows the shopper any change before they confirm.
```json
{ "lines": [{ "code": "...", "description": "...", "qty": 2, "available": 7, "unitPriceIncl": 64.5, "lineTotalIncl": 129, "status": "ok" }],
  "totalExcl": 123.39, "vat": 18.51, "totalIncl": 141.9, "currency": "USD", "clean": true }
```

### `POST /api/orders`
Header `Idempotency-Key: <uuid>`. The frontend sends the same key when it retries after a timeout, so the backend must return the existing order instead of creating a second one (scope acceptance criterion 6). Body:
```json
{ "shopper": { "name": "...", "phone": "...", "email": "" },   // email is optional and may be empty
  "fulfilment": "delivery", "address": { "line1": "<the whole address as typed>", "line2": "", "suburb": "", "city": "Bulawayo", "postalCode": "", "notes": "" },
  "payment": "on_delivery", "lines": [{ "code": "...", "qty": 2 }] }
```
Prices are **not** sent. The backend and SageAPI take them from Sage. Return `{ "storeOrderNo": "WEB-...", "status": "Pending", "duplicate": false }`.
If stock ran out, return **409** with a quote-shaped body. The frontend shows what changed.

### `GET /api/orders/{storeOrderNo}?contact=`
`contact` is the phone number or the email given at checkout. Return the order only when it matches. Compare phone numbers by their last 9 digits, so `0771 234 567` and `+263 77 123 4567` both match. `status` uses the SageStaging values `Pending | Processing | Posted | Failed | Cancelled`, and `sageDocumentNo` is set once the order is Posted.

## Admin

The admin portal is a separate app: `../Backend/SageAPI/frontend` (port 5174). Categories and product pictures are managed there; this app only shows them.

## Structure

```
src/
  api/        client.ts (fetch + errors), store.ts (the contract),
              mock*.ts (in-browser stand-in: sample Sage data and categories)
  components/ Layout (top bar, header, nav bar), Storefront (category menu, carousel, promos),
              ShelfLabel (product card), Docket (cart), SearchBox, Pagination, Icon, bits
  pages/      Shop (also the home page), Product, Cart, Checkout, Order, Track, Contact
  state/      cart.tsx (browser cart, synced across tabs), saved.tsx (saved items)
  lib/        formatting, generated plates, categories cache, hooks, theme
  styles/     tokens (light/dark), base, components, pages, storefront
```

Light mode is the default. The moon/sun button in the header switches to dark, and the choice is remembered per browser (`lib/theme.ts`, applied in `index.html` before first paint). All colours are tokens in `styles/tokens.css`.

Items without an uploaded photo get a generated plate from their stock code and description (`lib/swatch.ts`). 
