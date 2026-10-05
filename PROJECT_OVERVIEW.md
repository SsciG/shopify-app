# Nudge: Shopify Conversion App

Nudge is an embedded Shopify app that watches shoppers on product pages and, at a likely moment of hesitation, shows a banner with a one-time discount code. Every session is tracked, and 15% of sessions are held out as a **control group** (they see the banner but get no discount), so the merchant can tell whether the discount actually causes extra sales.

> Status: v1, which covers tracking, analytics, per-product overrides and A/B testing. The "learning" fields (min/max bounds, exploration rate, optimization mode) are stored and passed to the storefront, but the script doesn't optimize with them yet. It only clamps the configured delay and discount to the bounds.

---

## Repository layout

| Path | What it is |
|---|---|
| `the-app/` | **The real app.** Shopify React Router app (Prisma + SQLite) with admin UI, storefront script and API routes. |
| `the-app/app/routes/` | All routes: admin pages (`app.*`), app-proxy endpoints, webhooks. |
| `the-app/prisma/schema.prisma` | Database models (see [Data model](#data-model)). |
| `the-app/shopify.app.toml` | App config: scopes, webhooks, app proxy. |
| `nudge-backend/server.js` | **Legacy** Express prototype with in-memory config and the REST `price_rules` API. It has been replaced by `the-app`. |
| `script.js` | **Legacy** standalone version of the storefront script. The live version is served from `the-app/app/routes/nudge-script[.]js.jsx`. |

---

## How it works

```
Storefront (product page)                     App server (the-app)                Shopify
──────────────────────────                    ────────────────────                ───────
nudge-script.js loads
  ├─ GET /apps/nudge/get-config ───────────▶  StoreSettings + ProductOverride
  ├─ watches behaviour, picks a trigger
  ├─ POST /apps/nudge/track (events) ──────▶  Event table
  └─ banner clicked
       ├─ treatment: GET /apps/nudge/create-discount ─▶ discountCodeBasicCreate ─▶ NUDGE_XXXXXX code
       │     redirect → /discount/CODE?redirect=/cart/VARIANT:1
       └─ control:   /cart/add.js with hidden line-item props
                     (_nudge_session, _nudge_trigger, _nudge_control)

Order paid ── webhook /webhooks/order-paid ─▶ "converted" Event (treatment via NUDGE_ code,
                                               control via line-item props), incl. orderTotal
```

Storefront calls go through the **App Proxy** (`/apps/nudge/*`, configured in `shopify.app.toml`) to the app server.

### Triggers

The script listens for four behavioural triggers. A lower priority number wins when more than one fires, and only one banner is shown per session.

| Trigger | Priority | Condition |
|---|---|---|
| `force` | 0 | Product override has `forceShow`. Shows after `delay` and skips all other conditions. |
| `post_cart_idle` | 1 | Added to cart but didn't check out within about 12 s. Fires immediately. |
| `hesitation` | 2 | Changed variant 2 or more times. Fires after a 2 s grace window. |
| `deep_scroll` | 3 | Scrolled past 70% of the page. Fires after a 3 s grace window. |
| `idle` | 4 | `delay` ms elapsed with nothing else firing. Fires after a 1 s grace window. |

**Suppression:** clicking anything that looks like checkout or "buy now" sets `purchaseIntent` and stops every trigger.

### A/B test

- The control group is chosen deterministically from a hash of the session ID: `hash % 100 < 15`, so about 15% of sessions. The result is stored in `sessionStorage`.
- Every event records `decisionSource` as `"treatment"` or `"control"`.
- Conversions from both groups carry `orderTotal`, so you can compare revenue lift as well as conversion rate.

### Discount codes

- Format: `NUDGE_` followed by 6 random characters.
- Single use, expire after **15 minutes**, don't combine with other discounts, and apply to all items.
- Each code is stored in `DiscountCode` with its session, trigger and product, so a paid order can be traced back to the banner that produced it.

---

## Admin pages (embedded in Shopify admin)

| Route | Page | Purpose |
|---|---|---|
| `/app` | Home | Landing page. |
| `/app/settings` | Settings | Turn the app on or off, set the default discount and delay, learning bounds, exploration rate and optimization mode. Also shows summary stats. |
| `/app/overrides` | Overrides | Per-product rules (see below). |
| `/app/analytics` | Analytics | Funnel by trigger (shown, clicked, converted), discount stats, revenue, treatment vs. control. |
| `/app/check-scripts` | (debug) | Lists the shop's ScriptTags as JSON. |

### Product override modes

| Mode | Effect |
|---|---|
| `limit` (default) | Uses the global settings, constrained to this product's min/max delay and discount. |
| `force` | Uses this product's exact `discount` and `delay` and skips optimization. |
| `off` | No banner on this product. |

`forceShow` (any mode) shows the banner without waiting for a trigger. A per-product `optimizationMode` overrides the global one.

Config resolution in `get-config.jsx`: **product override > store settings > hard-coded defaults** (10%, 4000 ms, delay 2–20 s, discount 5–30%).

---

## API routes (via App Proxy `/apps/nudge/...`)

| Route | Method | Description |
|---|---|---|
| `nudge-script.js` | GET | Serves the storefront script (cached for 1 h). |
| `get-config?shop=&productId=` | GET | Merged config for a shop and product. |
| `track` | POST | Stores an `Event`. Requires `shop`, `sessionId` and `event`. |
| `create-discount?shop=&sessionId=&triggerType=&productId=` | GET/POST | Creates a `NUDGE_` code through the Admin GraphQL API using the stored offline session. |
| `save-config` | POST | Upserts `StoreSettings` from `{ shop, config }`. |
| `best-delay` | GET | Finds the delay+discount combo with the best click rate (needs at least 20 impressions). Not yet used by the script. |
| `user-profile?userId=` | GET | Per-user suppression profile (see Known issues). |

### Webhooks

| Topic | Route | Status |
|---|---|---|
| `app/uninstalled` | `/webhooks/app/uninstalled` | Active |
| `app/scopes_update` | `/webhooks/app/scopes_update` | Active |
| `orders/paid` | `/webhooks/order-paid` | **Commented out** in `shopify.app.toml`. It needs Protected Customer Data approval in the Partner Dashboard. |

---

## Data model

| Model | Purpose |
|---|---|
| `Event` | Every tracked event, scoped by `shop`. Event types: `trigger_eligible`, `banner_shown`, `banner_clicked`, `banner_closed`, `converted`. Also stores trigger, delay, discount, `decisionSource`, `orderTotal` and behavioural context (`idleTime`, `scrollDepth`, `variantChanges`). |
| `StoreSettings` | One row per shop: enabled flag, defaults, learning bounds, `explorationRate`, `optimizationMode`. |
| `ProductOverride` | Per-product rules, unique on `(shop, productId)`. |
| `DiscountCode` | Issued codes with attribution and usage (`used`, `orderId`, `orderTotal`). |
| `Session` | Shopify OAuth sessions (Prisma session storage). |
| `SessionMetrics` | **Deprecated.** Kept only for migration compatibility. |

---

## Running locally

Requirements: Node `>=20.19 <22` or `>=22.12`, and the [Shopify CLI](https://shopify.dev/docs/apps/tools/cli).

```bash
cd the-app
npm install
npm run setup        # prisma generate + migrate deploy
npm run dev          # shopify app dev (opens a tunnel and updates URLs)
```

Other scripts: `npm run build`, `npm run start`, `npm run lint`, `npm run typecheck`, `npm run deploy`.

**Scopes:** `write_products`, `read_orders`, `write_discounts`, `write_metaobject_definitions`, `write_metaobjects`.

---

## Known issues and TODOs

Found while reading the code. None of these have been fixed.

1. **The script isn't installed on the storefront automatically.** `ensureScriptTagInstalled()` in `app/utils/scriptTag.server.js` is never called, and `extensions/` is empty (no theme app extension). Right now the script has to be added to the theme by hand.
2. **Conversion tracking is off** until the `orders/paid` webhook is enabled (it needs Protected Customer Data approval).
3. **App-proxy routes don't verify the request.** `track`, `get-config`, `save-config` and `create-discount` trust the `shop` query or body parameter and never call `authenticate.public.appProxy`. Anyone can create discount codes or overwrite settings for any installed shop. `save-config` also passes `config` straight into a Prisma upsert.
4. **`create-discount` ignores product overrides and bounds.** It always uses `StoreSettings.discount`, while the banner may advertise a different, override-specific discount.
5. **`best-delay` isn't scoped by shop.** It aggregates events across all stores.
6. **`user-profile` is broken.** It queries `prisma.userMetrics`, which doesn't exist in the schema.
7. **The banner shows fake social proof.** It displays "🔥 N people viewed this recently", where N is a random number from 5 to 22. Shoppers could read that as a misleading claim. Replace it with real data or remove it.
8. **`apps.nudge.jsx`** is an older discount endpoint with a hard-coded 10%, no expiry and no usage limit. It is probably dead code.
9. **Mixed framework imports.** `create-discount.jsx` and `apps.nudge.jsx` import `json` from `@remix-run/node` inside a React Router app.
10. **Leftover template code:** the demo product metafield and metaobject in `shopify.app.toml`, the product-generator action on `/app`, and the boilerplate `the-app/README.md`.
11. **Legacy code** in `nudge-backend/` and the root `script.js` can be deleted once nothing depends on it.
