# Backend API module — tech stack, layout, and build

This document is written so you can **reuse the same structure in other Nhost + Hasura projects**. Placeholders use `<backend-repo>` and `<service>`; **Tastyplates** is the reference implementation in this repository.

---

## 1. How to use this document elsewhere

| Step | Action |
|------|--------|
| 1 | Copy the **`functions/`** layout (see §4): one file per HTTP handler under `src/<domain>/`, shared code under `src/_lib/`. |
| 2 | Copy optional **`src/server.ts`** + **`src/env-load.ts`** + **`src/routes/`** if you want a **standalone local API** (same handlers, Express wiring, health, OpenAPI docs). |
| 3 | Replace domain folders (`reviews/`, `users/`, …) with your own; keep `_lib/` for cross-cutting concerns. |
| 4 | Point **`nhost/`** metadata and migrations at your own tables and roles. |
| 5 | Update **`openapi-registry.ts`** and **`validate.ts`** (Zod) to match your routes. |
| 6 | Trim or extend **`documentation/`** links at the end of this file for your repo. |

You do **not** need the standalone server in production on Nhost: each function file is still deployed independently. The server is for **local DX**, **integration tests**, and **Swagger**.

---

## 2. Architecture pattern (generic)

```text
Clients
  ├── Hasura GraphQL  ← row-level CRUD, JWT from your auth provider
  └── Nhost Functions ← server-only: uploads, rate limits, caches, admin batch jobs
         ├── PostgreSQL (schema via migrations)
         ├── Optional object storage (e.g. S3)
         └── Optional Redis (cache / rate limits)
```

| Layer | Responsibility |
|-------|----------------|
| **BaaS auth** (e.g. Nhost Auth) | Issue JWTs; map claims to Hasura `X-Hasura-*` headers. |
| **Hasura** | Default API for reads/writes that fit row-level permissions. |
| **Functions** | Endpoints that need secrets, heavy CPU, non-HTTP-native workflows, or cross-table orchestration. |
| **Standalone Express** (optional) | Single process mounting the same handlers + `/healthz` + `/docs` for local work. |

---

## 3. Tech stack (reference: `functions/package.json`)

Versions drift over time — always treat **`functions/package.json`** as the source of truth. The pattern typically includes:

| Concern | Typical packages | Role |
|---------|------------------|------|
| Runtime | Node **≥ 22** (match Nhost `[functions.node]` in `nhost.toml`) | Functions + standalone server |
| Language | **TypeScript** | Strict mode, shared types with clients if you publish them |
| HTTP handler contract | **`express` types** (or framework-neutral `Request`/`Response`) | Nhost invokes `default export (req, res) => void` |
| Validation | **Zod** | Request bodies and query params |
| OpenAPI (optional) | **`@asteasolutions/zod-to-openapi`** (+ **swagger-ui-express**) | Dev-only `/docs`; use a **zod 3–compatible** major version of zod-to-openapi, or align Zod to v4 |
| Local env | **dotenv** | Load `.env` / `.env.local` **before** modules that read `process.env` at import time (e.g. Redis `fromEnv()`) |
| Admin GraphQL | **`fetch`** to Hasura + admin secret | Server-side mutations bypassing user JWT where appropriate |
| Object storage | **AWS SDK v3** (`@aws-sdk/client-s3`) | Uploads, presigned URLs, health checks |
| Images | **Sharp** (if you process uploads) | Resize / encode |
| Cache & limits | **Upstash Redis** + **@upstash/ratelimit** | Cache keys, sliding windows |

**Zod + OpenAPI:** call `extendZodWithOpenApi(z)` **before** defining schemas that are passed to the OpenAPI registry (this repo does that in `_lib/validate.ts`).

**Express 5 + CORS:** `app.options('*', …)` is **invalid** with path-to-regexp v8; use `app.options(/.*/, …)` or a named splat pattern per Express docs.

---

## 4. Repository layout (generic + this repo)

### 4.1 Monorepo root (`<backend-repo>/`)

Generic shape:

```text
<backend-repo>/
├── nhost/                      # Nhost CLI project: config, migrations, Hasura metadata
│   ├── nhost.toml
│   ├── migrations/
│   └── metadata/
│       ├── tables.yaml
│       └── tables/             # optional split per table
│
├── functions/                  # Nhost Functions workspace (required name for default Nhost layout)
│   ├── package.json
│   ├── tsconfig.json
│   ├── .env                    # local defaults (gitignored if secrets)
│   ├── .env.local              # developer overrides (gitignored)
│   └── src/
│       └── …                   # see §4.2
│
├── documentation/              # api-bestpractice, client-integration, this file, …
├── package.json                # optional: separate long-running Node service
├── src/                        # optional: that service’s entry (not Functions)
├── nhost.toml                  # optional: Nhost Run / other deploy targets at repo root
├── Dockerfile
└── README.md
```

**This repository (`tastyplates-backend`)** follows the above: **`functions/`** is the primary API module; the **root `src/`** Express app is an optional / legacy parallel service—new HTTP logic should prefer **`functions/src/`** + Hasura metadata.

### 4.2 Functions workspace — full `src/` tree (reference)

Every **`.ts` file under `src/<segment>/`** (except `_lib/`, `routes/`, root helpers) maps to a Nhost URL path **`/v0/<segment>/<file-basename>`** without `.ts`.

```text
functions/
├── package.json
├── tsconfig.json
├── .env
├── .env.local
└── src/
    ├── env-load.ts                 # dotenv: loads ../.env then ../.env.local (standalone only)
    ├── server.ts                   # optional Express: mounts all handlers + health + docs
    │
    ├── routes/
    │   ├── healthz.ts              # GET /healthz, /ready, /health/ui
    │   └── docs.ts                 # GET /docs, /docs/openapi.json (non-production)
    │
    ├── _lib/
    │   ├── validate.ts             # Zod schemas (+ extendZodWithOpenApi)
    │   ├── openapi-registry.ts     # OpenAPI paths + generateOpenAPISpec()
    │   ├── health.ts               # Hasura / Redis / S3 probes for /healthz
    │   ├── hasura-client.ts
    │   ├── auth.ts
    │   ├── redis.ts
    │   ├── cache.ts
    │   ├── rate-limit.ts
    │   ├── versioning.ts
    │   ├── s3.ts
    │   ├── cursor-pagination.ts
    │   ├── palate-utils.ts         # domain-specific; omit in other projects
    │   ├── rebuild-rating-summary.ts
    │   └── graphql/
    │       ├── review-queries.ts
    │       ├── user-queries.ts
    │       └── restaurant-queries.ts
    │
    ├── uploads/
    │   ├── image.ts
    │   └── batch.ts
    ├── images/
    │   └── download-google-photo.ts
    ├── reviews/
    │   ├── create.ts
    │   ├── create-comment.ts
    │   ├── delete.ts
    │   ├── update.ts
    │   └── following-feed.ts
    ├── users/
    │   ├── me.ts
    │   ├── follow.ts
    │   ├── unfollow.ts
    │   ├── suggested.ts
    │   └── delete.ts
    ├── restaurants/
    │   ├── search.ts
    │   └── match.ts
    └── admin/
        ├── backfill-rating-summary.ts
        └── monitoring.ts
```

**Conventions**

- **`_lib/`** — no default route export; shared modules only.
- **`routes/`** — Express-only routers used by **`server.ts`**, not deployed as separate Nhost files unless you duplicate routes into functions (usually you do not).
- **Handler files** — `export default async (req, res) => { … }`; keep them thin; call `_lib/` helpers.

---

## 5. Build, scripts, and run modes

| Command | Where | Purpose |
|---------|--------|---------|
| `npm run build` | `functions/` | `tsc --noEmit` — typecheck; Nhost cloud still bundles each function |
| `npm run dev` | `functions/` | `nhost dev` — full local stack + hot functions (needs Nhost CLI + Docker) |
| `npm run dev:standalone` | `functions/` | `tsx watch src/server.ts` — **one Express** on `PORT` (default **3001**) with `/v0/...` + health + docs |
| `npm run start` | `functions/` | Run standalone server without watch (e.g. container smoke test) |

**Standalone URLs (this pattern)**

| Path | Purpose |
|------|---------|
| `http://localhost:<PORT>/v0/...` | Same paths as Nhost Functions after `/v0` |
| `GET /healthz` | JSON: `status`, `uptime`, `checks` (Hasura, Redis, S3) |
| `GET /ready` | Liveness only |
| `GET /health/ui` | Minimal HTML polling `/healthz` |
| `GET /docs` | Swagger UI when `NODE_ENV !== 'production'` |
| `GET /docs/openapi.json` | Raw OpenAPI 3.1 document |

**Environment loading:** `import './env-load'` must be the **first** import in `server.ts` so `UPSTASH_REDIS_REST_*` and other vars exist before `redis.ts` (or similar) runs `fromEnv()` at import time.

---

## 6. Environment variables (checklist)

Copy names into **`<backend-repo>/functions/.env.example`** (committed) and **`.env.local`** (gitignored). Common groups:

| Group | Example variables | Notes |
|-------|-------------------|--------|
| Hasura | `NHOST_HASURA_URL` or `HASURA_GRAPHQL_API_URL`, `HASURA_GRAPHQL_ADMIN_SECRET` | Health check hits `<url>/healthz` |
| Auth / JWT | `NHOST_JWT_SECRET`, `NHOST_AUTH_URL`, or platform-specific | Used by `_lib/auth.ts` pattern |
| Redis | **`UPSTASH_REDIS_REST_URL`**, **`UPSTASH_REDIS_REST_TOKEN`** | Exact names expected by `@upstash/redis` `fromEnv()` |
| S3 | `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_REGION`, `S3_BUCKET_NAME`, optional `S3_BUCKET_DOMAIN` | Health may use a lightweight API call (e.g. `ListBuckets`) |
| App tuning | Image limits, cache TTLs, etc. | Optional |

---

## 7. HTTP surface (reference — Tastyplates)

Production base:

`https://<subdomain>.functions.<region>.nhost.run/v0/<path>`

`<path>` = path under `functions/src/` without `src/` and without `.ts`.

| Method | Path | Source file |
|--------|------|-------------|
| POST | `uploads/image` | `uploads/image.ts` |
| POST | `uploads/batch` | `uploads/batch.ts` |
| POST | `images/download-google-photo` | `images/download-google-photo.ts` |
| POST | `reviews/create` | `reviews/create.ts` |
| POST | `reviews/create-comment` | `reviews/create-comment.ts` |
| PUT | `reviews/update` | `reviews/update.ts` |
| DELETE | `reviews/delete` | `reviews/delete.ts` |
| GET | `reviews/following-feed` | `reviews/following-feed.ts` |
| GET | `users/me` | `users/me.ts` |
| POST | `users/follow` | `users/follow.ts` |
| POST | `users/unfollow` | `users/unfollow.ts` |
| GET | `users/suggested` | `users/suggested.ts` |
| DELETE | `users/delete` | `users/delete.ts` |
| GET | `restaurants/search` | `restaurants/search.ts` |
| POST | `restaurants/match` | `restaurants/match.ts` |
| POST | `admin/backfill-rating-summary` | `admin/backfill-rating-summary.ts` |
| GET | `admin/monitoring` | `admin/monitoring.ts` |

Auth and response envelopes for this repo: **`api-bestpractice.md`** and **`client-integration.md`**.

---

## 8. Hasura metadata (pattern)

- Central index: **`nhost/metadata/tables.yaml`** (or equivalent Hasura v3 layout).
- Per-table YAML under **`nhost/metadata/tables/`** defining roles (`public`, `user`, `admin`, …) with row filters and column sets.
- Migrations under **`nhost/migrations/`** for DDL and indexes.

Rename roles and tables to match your product; keep the **separation**: RLS in Hasura, privileged logic in Functions when RLS is not enough.

---

## 9. Related files in this repository

| File | Role |
|------|------|
| `documentation/api-bestpractice.md` | Naming, GraphQL vs Function, errors, rate limits, env inventory |
| `documentation/client-integration.md` | Client route mapping (Tastyplates-specific) |
| `documentation/tastyplates-backend.md` | Optional local workplan notes |
| `nhost/nhost.toml` | Auth, Hasura, Functions Node version, roles |

---

## 10. Customization checklist (other projects)

- [ ] Rename `<backend-repo>` and update `nhost.toml` / cloud project link.
- [ ] Replace domain folders under `functions/src/`; keep or drop `_lib/graphql`, `palate-utils`, `rebuild-rating-summary` analogs.
- [ ] Regenerate **`openapi-registry.ts`** from your Zod schemas.
- [ ] Adjust **`health.ts`** probes (third-party names, timeouts, credentials).
- [ ] Confirm **Express 5** route patterns (no bare `'*'`).
- [ ] Commit **`functions/.env.example`** with dummy values; never commit secrets.
- [ ] CI: `npm run build` in `functions/` on every PR.

---

*Reference implementation: **Tastyplates** (`tastyplates-backend/functions`). Update §7 when routes change; update §4.2 when the tree changes.*
