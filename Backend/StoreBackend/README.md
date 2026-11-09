# Store backend

The Node.js + TypeScript server between the store frontend and SageAPI (scope section 2). The browser only ever talks to this server; only this server calls SageAPI, using the API key.

**Live so far:**
- admin sign-in and **Settings → Staging database**
- the **shop catalogue**: products, prices and stock read from Sage through SageAPI, cached and refreshed every `CATALOGUE_REFRESH_MINUTES`; product pages and the checkout quote always read live

**Not live yet:** placing orders (refused with a clear message), store categories, product photos.

| Setting (`.env`) | Meaning |
|---|---|
| `STORE_WAREHOUSE` | **Fallback only.** The shop sells from the warehouses ticked in the admin portal (Maintenance → Warehouses, saved in `data/shop-warehouses.json`). Until something is ticked there, this Sage warehouse code is used, e.g. `2` (Bulawayo Store). Van, returns and expired-goods warehouses must not be used. |
| `STORE_PRICE_LIST` | Sage price list the store sells at, e.g. `USD-RETAIL` (scope decision D3) |
| `CATALOGUE_REFRESH_MINUTES` | How often the cached list is re-read from Sage |

Only whole units count as in stock; Sage part-quantities like `0.4` are not sold.

```
Browser ──► Store backend (this)          ──► SageAPI                        ──► SageStaging
            checks the admin session          checks X-Api-Key                    (SQL Server)
            /api/admin/*                      /api/Pastel/settings/staging
                                              saves C:\ProgramData\SageAPI\staging.settings.json
                                              (password encrypted, keys protected by Windows DPAPI)
```

## Where the staging database settings are saved

| What | Where | Protection |
|---|---|---|
| Server, database, username, options | `C:\ProgramData\SageAPI\staging.settings.json` on the SageAPI server | Outside the publish folder, so deployments don't overwrite it; never served on the web |
| Password | Same file, field `ProtectedPassword` | Encrypted with ASP.NET Core Data Protection; never returned to the browser or logged |
| Encryption keys | `C:\ProgramData\SageAPI\keys` | Encrypted with Windows DPAPI (machine), so they are useless on another computer |

Both paths can be changed with `Staging:SettingsPath` and `Staging:KeysPath` in SageAPI configuration.

## Run it locally

1. **Set the admin password** (once):
   ```bash
   npm install
   npm run hash-password
   ```
   Paste the `ADMIN_PASSWORD_HASH=…` line it prints into `.env`.
   `.env` already holds a generated `SAGEAPI_KEY` and `SESSION_SECRET`. The same key is saved in SageAPI's user secrets (`Security:ApiKey`), so the two match.

2. **Start SageAPI** (`http` profile, port 5071), from Visual Studio or with:
   ```bash
   dotnet run --launch-profile http
   ```

3. **Start this backend:**
   ```bash
   npm run dev        # http://localhost:4000
   ```

4. **Switch the frontend's admin area to live.** In `Frontend/.env` set:
   ```
   VITE_LIVE_FEATURES=admin
   ```
   Restart `npm run dev` in the Frontend folder, then sign in at http://localhost:5173/admin with your new password.

## Production checklist

- **HTTPS everywhere**, and `COOKIE_SECURE=true`.
- **New secrets per client:** generate `SAGEAPI_KEY` and `SESSION_SECRET` with
  `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`.
  Set SageAPI's key as the environment variable `Security__ApiKey`, not in `appsettings.json`.
- **Lock down the settings folder** so only the SageAPI service account (e.g. the IIS app pool) and administrators can read it:
  ```
  icacls "C:\ProgramData\SageAPI" /inheritance:r /grant:r "SYSTEM:(OI)(CI)F" "Administrators:(OI)(CI)F" "IIS AppPool\SageAPI:(OI)(CI)M"
  ```
- **Keep SageAPI off the internet.** Only this backend needs to reach it.
- **Use a dedicated SQL login** for SageStaging, with rights on that database only. Not `sa`.
- `ALLOWED_ORIGINS` = the store's real address, e.g. `https://shop.example.co.zw`.

## API (used by the frontend)

| Route | |
|---|---|
| `GET/POST/DELETE /api/admin/session` | Sign-in status / sign in `{ password }` / sign out. Sign-in is rate-limited to 5 failures per 15 minutes per IP. |
| `GET/PUT /api/admin/settings/database` | Read / save the staging connection (password write-only) |
| `POST /api/admin/settings/database/test` | Test a connection and check `dbo.StoreCategory` and `dbo.InventoryCategory` exist |
| `GET/PUT /api/admin/settings/shop-warehouses` | The warehouses the shop sells from, in order, each with the name and address shoppers see: `{ warehouses: [{ code, label, address, town }], source: "admin" \| "env" }` |
| `GET /api/admin/customers?search=&page=&pageSize=` | Sage customers (account, name), searched and paged here. SageAPI `GET /api/Pastel/customers` returns them all; the list is kept for 5 minutes |
| `GET/PUT /api/admin/settings/customers` | The walk-in (cash) customer account: `{ cashAccount, cashAccountName, source }`. PUT `{ cashAccount }` checks it exists in Sage. Saved in `data/shop-customers.json`; fallback `STORE_CASH_CUSTOMER` |
| `GET /api/locations` | Public: the shop's warehouses as shoppers see them, `{ locations: [{ code, name, address, town }] }`. The catalogue takes `branch=<code>` to list only items in stock at that branch. |
| `GET /api/health` | `{ ok: true }` |
