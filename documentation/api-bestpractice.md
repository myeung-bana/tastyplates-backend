# Tastyplates Backend — API Best Practices

This document captures the conventions, patterns, and decisions that govern the `tastyplates-backend` Nhost deployment. Every developer extending the API should read this before writing a new function or Hasura permission.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Endpoint Naming Conventions](#endpoint-naming-conventions)
3. [GraphQL vs Nhost Function — Decision Matrix](#graphql-vs-nhost-function--decision-matrix)
4. [Authentication Patterns](#authentication-patterns)
5. [Standard Request/Response Envelope](#standard-requestresponse-envelope)
6. [Error Codes and HTTP Status Mapping](#error-codes-and-http-status-mapping)
7. [Rate Limiting Strategy](#rate-limiting-strategy)
8. [Redis Caching and Cache Key Conventions](#redis-caching-and-cache-key-conventions)
9. [Hasura Permission Authoring Guide](#hasura-permission-authoring-guide)
10. [Admin-Only Operations](#admin-only-operations)
11. [Environment Variable Inventory](#environment-variable-inventory)

---

## Architecture Overview

```
Clients (web app, native app, future admin portal)
       │
       ├── Direct GraphQL ──────────────► Hasura GraphQL API (row-level permissions)
       │                                         │
       └── POST /functions/... ──────────► Nhost Functions (TypeScript / Node 22)
                                                 │          │          │
                                            Hasura       AWS S3    Upstash Redis
                                          (admin secret)  Sharp   (cache + rate-limit)
```

**Rule of thumb:** if the operation requires server-only logic (rate limiting, image processing, cache invalidation, or aggregating multiple data sources), use a Nhost Function. Everything else goes through GraphQL directly.

---

## Endpoint Naming Conventions

### Nhost Functions

Functions live in `functions/src/<domain>/<action>.ts` and are exposed at:

```
POST  https://<subdomain>.functions.<region>.nhost.run/v0/<domain>/<action>
```

| Domain | Action | Method | Description |
|--------|--------|--------|-------------|
| `uploads` | `image` | POST | Single image upload (Sharp → S3) |
| `uploads` | `batch` | POST | Batch upload (up to 10 files → S3) |
| `images` | `download-google-photo` | POST | Proxy Google Places photo |
| `reviews` | `create` | POST | Create review with rate-limit + cache |
| `reviews` | `create-comment` | POST | Create comment reply |
| `reviews` | `delete` | DELETE | Soft-delete review |
| `reviews` | `update` | PUT | Update review |
| `reviews` | `following-feed` | GET | Personalized feed (Redis cached) |
| `users` | `me` | GET | Fetch own profile |
| `users` | `follow` | POST | Follow a user |
| `users` | `unfollow` | POST | Unfollow a user |
| `users` | `suggested` | GET | Suggested users (Redis cached) |
| `users` | `delete` | DELETE | Soft-delete user account |
| `restaurants` | `search` | GET | Search/filter restaurants (Redis cached) |
| `restaurants` | `match` | POST | Match a restaurant by place_id / name / coordinates |
| `admin` | `backfill-rating-summary` | POST | Recompute all rating summaries |
| `admin` | `monitoring` | GET | System health snapshot |

**Naming rules:**
- Use **kebab-case** for action names (`create-comment`, not `createComment`).
- Domain folders match the primary Hasura table prefix (`reviews/` → `restaurant_reviews`).
- Shared utilities live in `functions/src/_lib/` (underscore prefix = not exposed as endpoints).

### GraphQL Operations

Operation names follow `<Verb><Entity>`:

```graphql
query GetRestaurantBySlug(...)
query GetReviewsByRestaurant(...)
mutation CreateReview(...)
mutation UpdateRestaurantUser(...)
```

---

## GraphQL vs Nhost Function — Decision Matrix

| Scenario | Use Direct GraphQL | Use Nhost Function |
|---|---|---|
| Simple row read by PK / FK | ✅ | |
| List with filters/sort (no server aggregation) | ✅ | |
| Row-level write where Hasura permission is sufficient | ✅ | |
| Rate limiting required | | ✅ |
| Cache read/write (Redis) | | ✅ |
| Cache invalidation after write | | ✅ |
| Image processing (Sharp) | | ✅ |
| S3 upload | | ✅ |
| Aggregating multiple tables not expressible in GraphQL | | ✅ |
| External API call (Google Places, etc.) | | ✅ |
| Rebuild computed aggregates after mutation | | ✅ |
| Admin-only batch operation | | ✅ |

---

## Authentication Patterns

### Three Roles

| Role | How JWT is issued | Hasura `x-hasura-role` | Description |
|------|-------------------|------------------------|-------------|
| `public` | No JWT (anonymous) | (not sent) | Read-only access to published content |
| `user` | Nhost Auth JWT | `user` | Authenticated user, row-level CRUD |
| `admin` | Nhost Auth JWT with admin role assigned | `admin` | Full access, no row filters |

### Client → GraphQL (user JWT)

```typescript
// Client sends the Nhost access token in the Authorization header.
// Hasura extracts x-hasura-user-id from the JWT claims automatically.
const { data } = await nhost.graphql.request(QUERY, variables, {
  headers: { Authorization: `Bearer ${nhost.auth.getAccessToken()}` },
});
```

### Client → Nhost Function (user JWT)

```typescript
const functionsUrl = process.env.NEXT_PUBLIC_NHOST_FUNCTIONS_URL;
const res = await fetch(`${functionsUrl}/reviews/create`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${nhost.auth.getAccessToken()}`,
  },
  body: JSON.stringify(payload),
});
```

### Function → Hasura (admin secret)

Inside functions, always use the admin-secret client (`_lib/hasura-client.ts`) to bypass row-level permissions. The function is responsible for enforcing its own authorization before calling Hasura.

```typescript
// _lib/hasura-client.ts — uses HASURA_GRAPHQL_ADMIN_SECRET
const result = await hasuraQuery(MY_QUERY, variables);
```

### Admin Secret Guard (admin functions)

```typescript
import { requireAdminSecret } from '../_lib/auth';

const provided = req.headers['x-admin-secret'];
if (!requireAdminSecret(provided)) {
  return res.status(401).json({ success: false, error: 'Unauthorized' });
}
```

---

## Standard Request/Response Envelope

All Nhost Functions return a consistent JSON structure:

### Success

```json
{
  "success": true,
  "data": { ... },
  "meta": {
    "total": 123,
    "limit": 10,
    "offset": 0,
    "cursor": "base64url...",
    "hasMore": true
  }
}
```

`meta` is only present for paginated list responses.

### Error

```json
{
  "success": false,
  "error": "Human-readable error message",
  "details": [ ... ]
}
```

`details` is only present when additional context is available (e.g., GraphQL error array).

### Rate Limit Response (429)

```json
{
  "success": false,
  "error": "Rate limit exceeded. Please try again later.",
  "retryAfter": 14
}
```

The `Retry-After` header is always set alongside the body field.

---

## Error Codes and HTTP Status Mapping

| Situation | HTTP Status | Error message pattern |
|-----------|-------------|----------------------|
| Missing required field | 400 | `"Missing required fields: field1, field2"` |
| Invalid format (UUID, type) | 400 | `"Invalid <field> format. Expected UUID."` |
| Unauthorized (no/invalid JWT) | 401 | `"Unauthorized"` or `"Invalid or expired token"` |
| Forbidden (wrong role) | 403 | `"Forbidden"` |
| Resource not found | 404 | `"<Resource> not found"` |
| Rate limit exceeded | 429 | `"Rate limit exceeded. Please try again later."` |
| GraphQL error | 500 | First error message from GraphQL |
| Internal error | 500 | `"Internal server error"` |

---

## Rate Limiting Strategy

Rate limiters are defined in `_lib/rate-limit.ts` using Upstash Ratelimit with a **sliding window** algorithm.

| Limiter | Limit | Window | Used by |
|---------|-------|--------|---------|
| `uploadRateLimit` | 10 req | 60 s | uploads, Google photo proxy |
| `createRateLimit` | 5 req | 30 s | create review, create comment |
| `followRateLimit` | 10 req | 10 s | follow, unfollow |
| `likeRateLimit` | 20 req | 10 s | (like toggling, future) |
| `wishlistRateLimit` | 15 req | 10 s | (wishlist/checkin, future) |
| `ratelimit` (default) | 20 req | 10 s | any endpoint without a dedicated limiter |

### Keying Strategy

| Endpoint type | Rate limit key |
|---------------|---------------|
| Uploads, photo proxy | IP address (`x-forwarded-for`) |
| Create review/comment | `author_id` (from request body) |
| Follow/unfollow | User ID from verified JWT |

---

## Redis Caching and Cache Key Conventions

### Cache Key Schema

```
<domain>:<entity>:<scope>:v<version>:[<params-hash>]
```

Examples:

| Key pattern | TTL | Invalidated by |
|-------------|-----|----------------|
| `restaurants:v{N}:rv{M}:{hash}` | 600 s | `bumpVersion('v:restaurants:all')` |
| `reviews:following:{userId}:v{N}:limit={L}:cursor={C}` | 120 s | `bumpVersion('v:reviews:following:{userId}')` |
| `users:suggested:v{N}:limit={L}:exclude={id}` | 600 s | `bumpVersion('v:users:suggested')` |

### Version Keys (Upstash integer INCR)

| Version key | Bumped when |
|-------------|-------------|
| `v:restaurants:all` | Restaurant created/updated/deleted, rating summary rebuilt |
| `v:reviews:all` | Any review created/updated/deleted |
| `v:restaurant:{uuid}:reviews` | Review created/deleted for that restaurant |
| `v:user:{userId}:reviews` | Review created by that user |
| `v:review:{id}:replies` | Comment added to that review |
| `v:reviews:following:{userId}` | Used for feed freshness (bumped externally on new reviews) |
| `v:users:suggested` | Bumped when user stats change significantly |

### Cache Helpers

```typescript
import { cacheGetOrSetJSON } from '../_lib/cache';

const { value, hit } = await cacheGetOrSetJSON(cacheKey, TTL_SECONDS, async () => {
  return await expensiveDbQuery();
});

res.set('X-Cache', hit ? 'HIT' : 'MISS');
```

Use `cacheGetOrSetJSONNonNull` when you do NOT want to cache a `null` result (e.g., restaurant not found — would hide newly published content).

---

## Hasura Permission Authoring Guide

### Role Matrix (per table)

| Table | public (select) | user (select) | user (insert) | user (update) | user (delete) | admin |
|-------|-----------------|---------------|---------------|---------------|---------------|-------|
| `restaurants` | published only | published only | ❌ | ❌ | ❌ | full |
| `restaurant_reviews` | approved, non-deleted | approved or own | own rows | own rows | ❌ (soft-delete via function) | full |
| `restaurant_users` | limited columns | all (non-deleted) | ❌ | own row | ❌ (soft-delete via function) | full |
| `restaurant_user_follows` | all | all | `follower_id = self` | ❌ | `follower_id = self` | full |
| `restaurant_review_likes` | all | all | `user_id = self` | ❌ | `user_id = self` | full |
| `restaurant_rating_summary` | all | all | ❌ | ❌ | ❌ | full |
| `restaurant_cuisine_rating_summary` | all | all | ❌ | ❌ | ❌ | full |

### Session Variable Usage

In Hasura permission filters, use `X-Hasura-User-Id` (string) to match the authenticated user's UUID:

```yaml
filter:
  author_id:
    _eq: X-Hasura-User-Id
```

```yaml
check:
  user_id:
    _eq: X-Hasura-User-Id
```

### Writing New Permission Files

1. Create `nhost/metadata/tables/<table_name>.yaml`.
2. Reference it in `nhost/metadata/tables.yaml`.
3. Apply via `nhost metadata apply` or the Hasura console.
4. Always limit `public` columns — never expose PII (email, password hashes) without authentication.

---

## Admin-Only Operations

Admin functions are guarded by comparing `x-admin-secret` header to `HASURA_GRAPHQL_ADMIN_SECRET`:

```typescript
import { requireAdminSecret } from '../_lib/auth';

if (!requireAdminSecret(req.headers['x-admin-secret'])) {
  return res.status(401).json({ success: false, error: 'Unauthorized' });
}
```

**Admin endpoints:**
- `POST /admin/backfill-rating-summary` — one-time rating aggregation backfill
- `GET /admin/monitoring` — system config and cache version snapshot

These endpoints should only be called by operators/scripts, never from the client app.

---

## Environment Variable Inventory

### Required (all environments)

| Variable | Description | Example |
|----------|-------------|---------|
| `NHOST_HASURA_URL` | Hasura GraphQL endpoint base URL | `https://abc123.hasura.eu-central-1.nhost.run` |
| `HASURA_GRAPHQL_ADMIN_SECRET` | Hasura admin secret (injected by Nhost) | `abc...` |
| `NHOST_SUBDOMAIN` | Nhost project subdomain | `abc123` |
| `NHOST_REGION` | Nhost project region | `eu-central-1` |
| `UPSTASH_REDIS_REST_URL` | Upstash Redis REST endpoint | `https://...upstash.io` |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis REST token | `AX...` |
| `S3_ACCESS_KEY_ID` | AWS IAM access key for S3 | `AKIA...` |
| `S3_SECRET_ACCESS_KEY` | AWS IAM secret key for S3 | `...` |
| `S3_REGION` | AWS region for the S3 bucket | `ap-northeast-2` |
| `S3_BUCKET_NAME` | S3 bucket name | `tastyplates-images` |

### Optional

| Variable | Default | Description |
|----------|---------|-------------|
| `NHOST_AUTH_URL` | derived from `NHOST_SUBDOMAIN` + `NHOST_REGION` | Override Nhost Auth base URL |
| `S3_BUCKET_DOMAIN` | `{bucket}.s3.{region}.amazonaws.com` | Custom CDN domain for S3 URLs |
| `IMAGE_MAX_WIDTH` | `1600` | Max image width after Sharp resize |
| `IMAGE_MAX_HEIGHT` | `1600` | Max image height after Sharp resize |
| `IMAGE_AVIF_QUALITY` | `60` | AVIF compression quality (0–100) |
| `IMAGE_WEBP_QUALITY` | `75` | WebP compression quality (0–100) |
| `APP_URL` | `https://tastyplates.co` | App URL for request referrer headers |

### Client-side (tastyplates-v2-1)

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_NHOST_SUBDOMAIN` | Nhost subdomain |
| `NEXT_PUBLIC_NHOST_REGION` | Nhost region |
| `NEXT_PUBLIC_HASURA_GRAPHQL_API_URL` | Hasura GraphQL endpoint |
| `NEXT_PUBLIC_NHOST_FUNCTIONS_URL` | Base URL for Nhost Functions (`https://{subdomain}.functions.{region}.nhost.run/v0`) |
| `NEXT_PUBLIC_API_MODE` | `legacy` or `nhost` — feature flag for gradual migration |
