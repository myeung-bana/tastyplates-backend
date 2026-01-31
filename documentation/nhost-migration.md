# Nhost migration plan (Tastyplates)

This document proposes a step-by-step migration strategy to move the current Next.js “backend monolith” (implemented under `src/app/api/`) into a dedicated Nhost backend project located at `tastyplates-backend/`.

The plan is intentionally **incremental**: keep the app working while migrating endpoint groups and switching clients gradually.

---

## Background (what exists today)

In `tastyplates-v2-1`, backend responsibilities are currently implemented in three places:

- **Next.js API routes (monolith)**: `tastyplates-v2-1/src/app/api/**`
  - Most of `src/app/api/v1/**` is a “Backend-for-Frontend” layer that:
    - calls Hasura GraphQL using admin-secret (`src/app/graphql/hasura-server-client.ts`)
    - handles composition/aggregation (e.g., following feed)
    - enforces rate limiting and caching via Upstash Redis
    - handles server-only work (uploads, Sharp image optimization, Google photo proxy)
- **GraphQL definitions**: `tastyplates-v2-1/src/app/graphql/**`
- **Frontend HTTP service wrappers that call `/api/v1/...`**: `tastyplates-v2-1/src/app/api/v1/services/*.ts`

Auth today is Firebase-based:

- Firebase client auth: `tastyplates-v2-1/src/services/auth/firebaseAuthService.ts`
- Firebase admin verification in an API route: `tastyplates-v2-1/src/app/api/user/me/route.ts`
- Firebase admin util: `tastyplates-v2-1/src/lib/firebase-admin.ts`

Caching / rate limiting today:

- Upstash Redis: `tastyplates-v2-1/src/lib/upstash-redis.ts`
- Cache wrapper: `tastyplates-v2-1/src/lib/redis-cache.ts`
- Cache versioning: `tastyplates-v2-1/src/lib/redis-versioning.ts`
- Rate limiting: `tastyplates-v2-1/src/lib/redis-ratelimit.ts`

---

## Migration goals

- **Create a real backend** in `tastyplates-backend/` powered by Nhost (Postgres + Hasura + Auth + Storage + Functions).
- **Move server-only code out of Next.js** (uploads, proxies, composition endpoints).
- **Eliminate Hasura admin-secret usage from the Next.js app**.
- **Replace Firebase auth with Nhost auth** (JWT-based).
- Keep the frontend API surface stable as long as possible (so UI changes are minimal).

---

## Strategy overview (phased, safe rollout)

### Phase 0 — Inventory + “source of truth” decisions

Make these decisions upfront (they determine the entire migration):

- **Database**: Nhost Postgres becomes the primary DB.
- **GraphQL**: Nhost Hasura becomes the only GraphQL API.
- **Auth**:
  - Target: Nhost Auth (JWT) as the primary identity provider.
  - Migration decision: keep `restaurant_users.firebase_uuid` temporarily or replace with Nhost user ID mapping.
- **Storage** (choose one):
  - Option A: Keep AWS S3 + Sharp optimization (move to Nhost Functions)
  - Option B: Move to Nhost Storage (decide where/if optimization happens)

### Phase 1 — Stand up the new backend skeleton

Create `tastyplates-backend` as an Nhost project with:

- Hasura metadata + migrations tracked in git
- A Functions codebase (Node.js structure) for custom endpoints that can’t be replaced by direct GraphQL
- Backend-only secrets stored in `.env` (never shipped to the frontend)

### Phase 2 — Database + Hasura parity

- Import/migrate schema and data into Nhost Postgres
- Track tables in Hasura
- Create relationships that the app expects
- Create indexes for the query patterns used by:
  - restaurants listing / search
  - reviews listing + cursor pagination
  - following feed
  - favorites/checkins

### Phase 3 — Auth + permissions (critical)

Today, Next.js uses admin-secret for all Hasura access (`src/app/graphql/hasura-server-client.ts`).

In Nhost, you should:

- Implement Hasura **roles + row-level permissions**
- Ensure that the app can call Hasura directly with a user JWT (no admin secret)
- Move any “needs admin secret” operations into Nhost Functions (server-only)

### Phase 4 — Endpoint-by-endpoint migration

Migrate endpoints in batches, starting with those that are:

- server-only (uploads/proxies) → Functions first
- composition-heavy and personalized (following feed) → Functions
- pure CRUD reads/writes → direct GraphQL once permissions are correct

### Phase 5 — Cutover + cleanup

- Switch frontend clients off `/api/v1/...`
- Delete retired Next API routes
- Remove Firebase dependencies and any bridging code

---

# Section 1 — Refactoring required in this current project (`tastyplates-v2-1`)

## 1.1 Introduce an explicit “backend target” configuration

Create a single place to determine whether the app calls:

- legacy Next API routes (`/api/v1/...`)
- Nhost Functions
- Nhost GraphQL (direct)

Recommended approach:

- Add env-driven config values (example names; final names can vary):
  - `NEXT_PUBLIC_NHOST_BACKEND_URL` (or `NEXT_PUBLIC_NHOST_SUBDOMAIN` + `NEXT_PUBLIC_NHOST_REGION`)
  - `NEXT_PUBLIC_NHOST_GRAPHQL_URL` (optional explicit)
  - `NEXT_PUBLIC_API_MODE` = `legacy` | `nhost`

## 1.2 Refactor authentication: Firebase → Nhost

### Current source files involved

- Firebase client auth service:
  - `src/services/auth/firebaseAuthService.ts`
- Firebase admin verification:
  - `src/app/api/user/me/route.ts`
  - `src/lib/firebase-admin.ts`

### Target state

- Frontend uses Nhost auth client to sign in and obtain JWT.
- Frontend calls:
  - Hasura GraphQL directly (Authorization header), OR
  - Nhost Functions (also with Authorization header)
- User identity is derived from the JWT (no Firebase UID needed at runtime).

### Schema decision (do this early)

Your current schema uses `restaurant_users.firebase_uuid` and routes use it (e.g. `/api/user/me` fetches via firebase_uuid).

Pick one migration model:

- **Model A (recommended)**: Use Nhost `auth.users.id` as the canonical user id and make `restaurant_users.id` match it.
- **Model B**: Keep `restaurant_users` separate; add `restaurant_users.nhost_user_id`, and migrate gradually.

## 1.3 Remove Hasura admin-secret usage from Next.js runtime

Current: `src/app/graphql/hasura-server-client.ts` uses:

- `NEXT_PUBLIC_HASURA_GRAPHQL_API_URL`
- `HASURA_GRAPHQL_ADMIN_SECRET`

Target:

- Frontend never uses admin-secret.
- Admin-secret can exist only in server-only contexts:
  - Nhost Functions (server)
  - CI scripts
  - migration tooling

## 1.4 Replace the monolith service clients

Current HTTP wrappers call the monolith:

- `src/app/api/v1/services/restaurantV2Service.ts`
- `src/app/api/v1/services/restaurantUserService.ts`
- `src/app/api/v1/services/reviewV2Service.ts`
- Taxonomy services: `src/app/api/v1/services/{category,cuisine,palate,priceRange}Service.ts`

Migration approach:

- Keep the TypeScript interfaces and “service shape” (to avoid UI churn).
- Replace `baseUrl` away from `'/api/v1/...'` with:
  - direct GraphQL queries/mutations, OR
  - Nhost Functions endpoints for composition/server-only functionality

## 1.5 Replace/remove the GraphQL proxy route

Current: `src/app/api/graphql-proxy/route.ts` forwards requests to `backend.tastyplates.co/graphql`.

Target:

- Frontend calls Nhost GraphQL directly.
- If a proxy is needed, it should live in the backend as a function, not in Next.js.

## 1.6 Retire server-only routes from Next.js as they migrate

As endpoints move to Nhost, delete (or keep temporarily behind a feature flag) the corresponding `src/app/api/v1/**/route.ts` files.

---

# Section 2 — New sections needed in the backend (`tastyplates-backend`)

## 2.1 Backend repo structure (Node.js friendly)

Recommended target layout:

- `tastyplates-backend/nhost/`
  - Nhost config
  - Hasura migrations
  - Hasura metadata (permissions, relationships, actions, etc.)
- `tastyplates-backend/functions/`
  - Nhost Functions (TypeScript)
  - `src/` (handlers)
  - `src/lib/` (shared helpers: hasura client, validation, auth helpers)
  - `src/routes/` (optional organization mirroring current `/api/v1/...`)
- `tastyplates-backend/README.md`
  - Local dev instructions
  - Deployment / environments

## 2.2 Database + Hasura parity deliverables

Create / migrate and ensure Hasura tracking for these core tables used by the app:

- `restaurants`
- `restaurant_users`
- `restaurant_reviews`
- `restaurant_review_likes`
- `restaurant_user_follows`
- `user_favorites`
- `user_checkins`
- taxonomy + lookup tables (cuisines, palates, categories, price ranges)

Also migrate any SQL migrations that already exist in this repo (example):

- `tastyplates-v2-1/database/migrations/cursor_pagination_indexes.sql`

## 2.3 Hasura permissions + roles

Implement Hasura permissions so that:

- Public reads are allowed where appropriate (e.g. published restaurants, approved reviews).
- Authenticated users can:
  - create/edit their own reviews
  - follow/unfollow
  - like/unlike
  - manage favorites/checkins
  - edit their own profile
- Draft reviews are visible only to the author.

## 2.4 Backend functions to implement (migration targets)

Move these “server-only” or “composition-heavy” endpoints into Nhost Functions:

- Following feed (aggregation + caching):
  - Source: `src/app/api/v1/restaurant-reviews/get-following-feed/route.ts`
- Restaurant matching:
  - Source: `src/app/api/v1/restaurants-v2/match-restaurant/route.ts`
- Advanced restaurant search/listing (if you keep Redis caching and distance logic):
  - Source: `src/app/api/v1/restaurants-v2/get-restaurants/route.ts`
- Uploads + image optimization:
  - Source: `src/app/api/v1/upload/image/route.ts`
  - Source: `src/app/api/v1/upload/batch/route.ts`
- Google photo download proxy:
  - Source: `src/app/api/v1/images/download-google-photo/route.ts`

## 2.5 Backend-only infrastructure

Port these utilities into `tastyplates-backend/functions/src/lib` (or similar):

- Hasura server client (admin secret, server-only)
  - Source: `src/app/graphql/hasura-server-client.ts`
- Upstash Redis + cache + rate limiting + versioning
  - Source:
    - `src/lib/upstash-redis.ts`
    - `src/lib/redis-cache.ts`
    - `src/lib/redis-ratelimit.ts`
    - `src/lib/redis-versioning.ts`

---

## Route-by-route mapping table (current → target)

Legend:

- **Direct GraphQL**: Replace with direct Nhost GraphQL queries/mutations (after permissions are correct)
- **Nhost Function**: Implement as `tastyplates-backend/functions/...` (server-only / composition / secrets)
- **Keep in Next.js**: Not worth migrating now (static content / dev-only)
- **Delete / retire**: Becomes unnecessary after cutover

> All routes listed below are under `tastyplates-v2-1/src/app/api/`.

| Current route | File path | What it does today | Target |
|---|---|---|---|
| `POST /api/graphql-proxy` (+ `OPTIONS`) | `src/app/api/graphql-proxy/route.ts` | Forwards GraphQL to `backend.tastyplates.co/graphql` with CORS | **Delete / retire** (use Nhost GraphQL directly; only keep proxy if truly required) |
| `GET /api/user/me` | `src/app/api/user/me/route.ts` | Verifies Firebase token/cookie, then fetches user via Hasura | **Direct GraphQL** (Nhost Auth JWT + Hasura perms). If you need extra logic, make a **Nhost Function** `me` endpoint |
| `GET /api/v1/content/:type` | `src/app/api/v1/content/[type]/route.ts` | Serves local markdown content (TOS/privacy/etc.) | **Keep in Next.js** (or migrate later to CMS/DB) |
| `GET /api/v1/monitoring/graphql-stats` | `src/app/api/v1/monitoring/graphql-stats/route.ts` | Dev-only GraphQL stats | **Keep in Next.js** (or replace with backend monitoring later) |
| `POST /api/v1/images/download-google-photo` | `src/app/api/v1/images/download-google-photo/route.ts` | Server-side proxy to fetch Google photo and return base64 | **Nhost Function** (server-only proxy) |

### Taxonomies (categories / cuisines / palates / price ranges)

| Current route | File path | What it does today | Target |
|---|---|---|---|
| `GET /api/v1/categories/get-categories` | `src/app/api/v1/categories/get-categories/route.ts` | Fetch categories via Hasura | **Direct GraphQL** |
| `GET /api/v1/categories/get-category-by-id` | `src/app/api/v1/categories/get-category-by-id/route.ts` | Fetch category by id via Hasura | **Direct GraphQL** |
| `GET /api/v1/cuisines/get-cuisines` | `src/app/api/v1/cuisines/get-cuisines/route.ts` | Fetch cuisines via Hasura | **Direct GraphQL** |
| `GET /api/v1/cuisines/get-cuisine-by-id` | `src/app/api/v1/cuisines/get-cuisine-by-id/route.ts` | Fetch cuisine by id via Hasura | **Direct GraphQL** |
| `GET /api/v1/palates/get-palates` | `src/app/api/v1/palates/get-palates/route.ts` | Fetch palates via Hasura | **Direct GraphQL** |
| `GET /api/v1/palates/get-palate-by-id` | `src/app/api/v1/palates/get-palate-by-id/route.ts` | Fetch palate by id via Hasura | **Direct GraphQL** |
| `GET /api/v1/price-ranges/get-price-ranges` | `src/app/api/v1/price-ranges/get-price-ranges/route.ts` | Fetch price ranges via Hasura | **Direct GraphQL** |
| `GET /api/v1/price-ranges/get-price-range-by-id` | `src/app/api/v1/price-ranges/get-price-range-by-id/route.ts` | Fetch price range by id via Hasura | **Direct GraphQL** |

### Restaurants (v2)

| Current route | File path | What it does today | Target |
|---|---|---|---|
| `GET /api/v1/restaurants-v2/test-connection` | `src/app/api/v1/restaurants-v2/test-connection/route.ts` | Validates Hasura connectivity/config | **Delete / retire** (replace with backend healthcheck or Nhost admin tooling) |
| `GET /api/v1/restaurants-v2/get-restaurants` | `src/app/api/v1/restaurants-v2/get-restaurants/route.ts` | Filtering/search + Redis cache + optional distance sort + Hasura query | **Nhost Function** (keep caching + distance logic server-side) OR **Direct GraphQL** (if you simplify features + rely on DB indexes/PostGIS) |
| `GET /api/v1/restaurants-v2/get-restaurant-by-id` | `src/app/api/v1/restaurants-v2/get-restaurant-by-id/route.ts` | Fetch restaurant by uuid/slug via Hasura | **Direct GraphQL** |
| `GET /api/v1/restaurants-v2/get-preference-stats` | `src/app/api/v1/restaurants-v2/get-preference-stats/route.ts` | Aggregate preference stats (likely computed) | **Nhost Function** (or Hasura computed fields/views if you want pure GraphQL) |
| `POST /api/v1/restaurants-v2/match-restaurant` | `src/app/api/v1/restaurants-v2/match-restaurant/route.ts` | Match by place_id/name+address/coordinates | **Nhost Function** |
| `POST /api/v1/restaurants-v2/create-restaurant` | `src/app/api/v1/restaurants-v2/create-restaurant/route.ts` | Creates restaurant via Hasura mutation | **Direct GraphQL** (if permissions allow) OR **Nhost Function** (if you must enforce server-only validation / slug creation / anti-abuse) |

### Restaurant users

| Current route | File path | What it does today | Target |
|---|---|---|---|
| `GET /api/v1/restaurant-users/get-restaurant-users` | `src/app/api/v1/restaurant-users/get-restaurant-users/route.ts` | List users via Hasura | **Direct GraphQL** (likely restricted) |
| `GET /api/v1/restaurant-users/get-restaurant-user-by-id` | `src/app/api/v1/restaurant-users/get-restaurant-user-by-id/route.ts` | Fetch user by UUID | **Direct GraphQL** |
| `GET /api/v1/restaurant-users/get-restaurant-user-by-username` | `src/app/api/v1/restaurant-users/get-restaurant-user-by-username/route.ts` | Fetch user by username | **Direct GraphQL** |
| `GET /api/v1/restaurant-users/get-restaurant-user-by-firebase-uuid` | `src/app/api/v1/restaurant-users/get-restaurant-user-by-firebase-uuid/route.ts` | Fetch user by firebase_uuid | **Delete / retire** after auth migration (replace with Nhost user id lookup/profile) |
| `POST /api/v1/restaurant-users/create-restaurant-user` | `src/app/api/v1/restaurant-users/create-restaurant-user/route.ts` | Insert user row | **Direct GraphQL** (triggered post-signup) OR **Nhost Function** (if you want server-only enforcement) |
| `PUT /api/v1/restaurant-users/update-restaurant-user` | `src/app/api/v1/restaurant-users/update-restaurant-user/route.ts` | Update user profile | **Direct GraphQL** (row-level permissions: user can update self) |
| `DELETE /api/v1/restaurant-users/delete-restaurant-user` | `src/app/api/v1/restaurant-users/delete-restaurant-user/route.ts` | Soft/hard delete user | **Nhost Function** (admin-only or privileged) |
| `GET /api/v1/restaurant-users/check-username` | `src/app/api/v1/restaurant-users/check-username/route.ts` | Username availability check | **Direct GraphQL** (query) OR **Nhost Function** (if you add extra rules) |
| `POST /api/v1/restaurant-users/follow` | `src/app/api/v1/restaurant-users/follow/route.ts` | Follow a user (insert relationship) + rate limiting | **Direct GraphQL** (with constraints) OR **Nhost Function** (if rate limiting is required server-side) |
| `POST /api/v1/restaurant-users/unfollow` | `src/app/api/v1/restaurant-users/unfollow/route.ts` | Unfollow (delete relationship) | **Direct GraphQL** |
| `GET /api/v1/restaurant-users/get-followers-list` | `src/app/api/v1/restaurant-users/get-followers-list/route.ts` | Get followers list (composition) | **Direct GraphQL** if relationships exist; otherwise **Nhost Function** |
| `GET /api/v1/restaurant-users/get-following-list` | `src/app/api/v1/restaurant-users/get-following-list/route.ts` | Get following list (composition) | **Direct GraphQL** if relationships exist; otherwise **Nhost Function** |
| `GET /api/v1/restaurant-users/get-followers-count` | `src/app/api/v1/restaurant-users/get-followers-count/route.ts` | Followers count | **Direct GraphQL** (aggregate) |
| `GET /api/v1/restaurant-users/get-following-count` | `src/app/api/v1/restaurant-users/get-following-count/route.ts` | Following count | **Direct GraphQL** (aggregate) |
| `GET /api/v1/restaurant-users/check-follow-status` | `src/app/api/v1/restaurant-users/check-follow-status/route.ts` | Check follow relationship | **Direct GraphQL** |
| `GET /api/v1/restaurant-users/suggested` | `src/app/api/v1/restaurant-users/suggested/route.ts` | Suggested users logic | **Nhost Function** (business logic) OR **Direct GraphQL** (if it becomes simple) |
| `POST /api/v1/restaurant-users/toggle-favorite` (+ `GET` check) | `src/app/api/v1/restaurant-users/toggle-favorite/route.ts` | Wishlist toggle with rate limiting + restaurant slug→uuid lookup | **Direct GraphQL** (insert/delete) + optional **Nhost Function** if you require server-side rate limits |
| `POST /api/v1/restaurant-users/toggle-checkin` (+ `GET` check) | `src/app/api/v1/restaurant-users/toggle-checkin/route.ts` | Checkin toggle with rate limiting | **Direct GraphQL** + optional **Nhost Function** |
| `GET /api/v1/restaurant-users/get-wishlist` | `src/app/api/v1/restaurant-users/get-wishlist/route.ts` | Wishlist listing, often enriched with restaurant details | **Direct GraphQL** if relationships exist; otherwise **Nhost Function** |
| `GET /api/v1/restaurant-users/get-checkins` | `src/app/api/v1/restaurant-users/get-checkins/route.ts` | Checkins listing, often enriched with restaurant details | **Direct GraphQL** if relationships exist; otherwise **Nhost Function** |
| `GET /api/v1/restaurant-users/get-reviews` | `src/app/api/v1/restaurant-users/get-reviews/route.ts` | User reviews (may be enriched) | **Direct GraphQL** (with perms) OR **Nhost Function** if you keep enrichment |

### Restaurant reviews

| Current route | File path | What it does today | Target |
|---|---|---|---|
| `GET /api/v1/restaurant-reviews/get-all-reviews` | `src/app/api/v1/restaurant-reviews/get-all-reviews/route.ts` | Reviews feed, pagination, caching/versioning | **Direct GraphQL** for basic feed OR **Nhost Function** if you keep caching/enrichment/pagination rules |
| `GET /api/v1/restaurant-reviews/get-review-by-id` | `src/app/api/v1/restaurant-reviews/get-review-by-id/route.ts` | Fetch single review | **Direct GraphQL** |
| `GET /api/v1/restaurant-reviews/get-reviews-by-restaurant` | `src/app/api/v1/restaurant-reviews/get-reviews-by-restaurant/route.ts` | Restaurant reviews list | **Direct GraphQL** |
| `GET /api/v1/restaurant-reviews/get-user-reviews` | `src/app/api/v1/restaurant-reviews/get-user-reviews/route.ts` | Reviews by author | **Direct GraphQL** |
| `GET /api/v1/restaurant-reviews/get-draft-reviews` | `src/app/api/v1/restaurant-reviews/get-draft-reviews/route.ts` | Draft reviews (auth required) | **Direct GraphQL** (row-level permission: author only) |
| `GET /api/v1/restaurant-reviews/get-following-feed` | `src/app/api/v1/restaurant-reviews/get-following-feed/route.ts` | Personalized feed composition + Redis cache | **Nhost Function** |
| `GET /api/v1/restaurant-reviews/get-replies` | `src/app/api/v1/restaurant-reviews/get-replies/route.ts` | Replies list (comments) | **Direct GraphQL** |
| `POST /api/v1/restaurant-reviews/create-review` | `src/app/api/v1/restaurant-reviews/create-review/route.ts` | Validates, rate-limits, inserts review, bumps cache versions | **Direct GraphQL** (with perms) OR **Nhost Function** (keep rate limit + cache invalidation) |
| `PUT /api/v1/restaurant-reviews/update-review` | `src/app/api/v1/restaurant-reviews/update-review/route.ts` | Update review | **Direct GraphQL** (author-only perms) |
| `DELETE /api/v1/restaurant-reviews/delete-review` | `src/app/api/v1/restaurant-reviews/delete-review/route.ts` | Soft delete review | **Direct GraphQL** (author-only perms) OR **Nhost Function** |
| `POST /api/v1/restaurant-reviews/create-comment` | `src/app/api/v1/restaurant-reviews/create-comment/route.ts` | Create reply/comment (review with parent_review_id) | **Direct GraphQL** OR **Nhost Function** (spam controls) |
| `POST /api/v1/restaurant-reviews/toggle-like` (+ `GET` check) | `src/app/api/v1/restaurant-reviews/toggle-like/route.ts` | Like/unlike review | **Direct GraphQL** OR **Nhost Function** (if rate limiting/anti-abuse) |

### Uploads

| Current route | File path | What it does today | Target |
|---|---|---|---|
| `POST /api/v1/upload/image` | `src/app/api/v1/upload/image/route.ts` | Sharp optimize + S3 upload + rate limit | **Nhost Function** (server-only). If switching to Nhost Storage, rewrite as “signed upload + optional post-process” |
| `POST /api/v1/upload/batch` | `src/app/api/v1/upload/batch/route.ts` | Multi upload/processing | **Nhost Function** |

---

## Recommended migration order (practical)

1. **Backend bootstrapping**: Nhost project + DB import + Hasura tracking
2. **Auth + perms**: Nhost Auth + Hasura roles/permissions
3. **Server-only functions**:
   - uploads
   - google photo proxy
4. **Composition endpoints**:
   - following feed
   - restaurant matching/search if you keep caching
5. **CRUD cutover**:
   - replace remaining `/api/v1/...` calls with direct GraphQL
6. **Cleanup**:
   - remove `graphql-proxy`
   - remove Firebase client/admin code
   - delete old Next API routes

