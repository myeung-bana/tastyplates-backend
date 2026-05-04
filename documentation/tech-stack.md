# Backend API — tech stack, layout, and build

This document describes the **unified** `tastyplates-backend` — a single standalone Express application. There is no longer a nested `functions/` sub-package.

---

## 1. Architecture

```text
Clients (Next.js, mobile)
  ├── Hasura GraphQL  ← row-level CRUD, JWT from Nhost Auth
  └── tastyplates-backend  ← server-only: uploads, rate limits, caches, admin jobs
         ├── PostgreSQL (schema managed in tastyplates-nhost)
         ├── S3 object storage
         └── Upstash Redis (cache + rate limiting)
```

| Layer | Responsibility |
|-------|----------------|
| **Nhost Auth** | Issues JWTs; backend verifies them via Nhost Auth URL |
| **Hasura** | Default read/write API with row-level permissions |
| **tastyplates-backend** | Endpoints that need secrets, image processing, cross-table orchestration, or custom rate limiting |

---

## 2. Tech stack

| Concern | Package | Notes |
|---------|---------|-------|
| Runtime | Node **22** | `engines.node >= 22.0.0` in `package.json` |
| Language | **TypeScript 5** | CommonJS target; no `"type": "module"` |
| HTTP framework | **Express 5** | Use `app.options(/.*/, …)` not `app.options('*', …)` |
| Request validation | **Zod v3** | Schemas in `src/lib/validate.ts` |
| OpenAPI | **@asteasolutions/zod-to-openapi** + **swagger-ui-express** | Dev-only `/docs` |
| Local env | **dotenv** | `src/lib/env-load.ts` imported first in `server.ts` |
| GraphQL client | `fetch` + admin secret | `src/lib/hasura.ts` |
| Object storage | **@aws-sdk/client-s3 v3** | `src/lib/s3.ts` |
| Image processing | **Sharp** | AVIF → WebP with fallback |
| Cache + rate limits | **@upstash/redis** + **@upstash/ratelimit** | `src/lib/redis.ts`, `cache.ts`, `rate-limit.ts` |
| Dev runner | **tsx** | `tsx/cjs` for `npm start`; `tsx watch` for `npm run dev` |

---

## 3. Repository layout

```text
tastyplates-backend/
├── src/
│   ├── server.ts                  Express app entry (port 3000)
│   ├── lib/
│   │   ├── env-load.ts            Side-effect: loads .env before other modules
│   │   ├── env.ts                 Zod-validated environment schema
│   │   ├── hasura.ts              Hasura GraphQL client (query + mutation)
│   │   ├── auth.ts                Nhost JWT verification
│   │   ├── redis.ts               Upstash Redis instance
│   │   ├── cache.ts               get-or-set cache helpers
│   │   ├── versioning.ts          Cache version bump / read
│   │   ├── rate-limit.ts          Sliding-window rate limiters
│   │   ├── s3.ts                  S3 upload + public URL builder
│   │   ├── validate.ts            Zod schemas + OpenAPI extensions
│   │   ├── cursor-pagination.ts   Base64 cursor encode/decode
│   │   ├── palate-utils.ts        Palate normalisation
│   │   ├── rebuild-rating-summary.ts  Bayesian rating rebuild
│   │   ├── health.ts              Hasura / Redis / S3 health probes
│   │   ├── openapi-registry.ts    OpenAPI 3.1 spec generator
│   │   └── graphql/
│   │       ├── restaurant-queries.ts
│   │       ├── review-queries.ts
│   │       └── user-queries.ts
│   └── routes/
│       ├── healthz.ts             /healthz, /ready, /health/ui
│       ├── docs.ts                /docs (Swagger UI, dev only)
│       └── api/v1/
│           ├── images/            download-google-photo
│           ├── uploads/           image, batch
│           ├── reviews/           create, create-comment, update, delete, following-feed
│           ├── users/             me, follow, unfollow, suggested, delete
│           ├── restaurants/       search, match
│           └── admin/             backfill-rating-summary, monitoring
├── package.json
├── tsconfig.json
├── Dockerfile
├── nhost.toml                     Nhost Run config (optional)
├── env.example                    All env vars documented
├── DEPLOYMENT.md                  Step-by-step deployment guide
├── nhost/                         Hasura CLI project (local dev only)
└── documentation/                 This file + API best-practice notes
```

---

## 4. Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | `tsx watch src/server.ts` — live reload on `:3000` |
| `npm start` | `node -r tsx/cjs src/server.ts` — production-style start without building |
| `npm run build` | `tsc` → compiles to `dist/` |
| `npm run start:compiled` | `node dist/server.js` — runs compiled output (used in Docker) |
| `npm run typecheck` | `tsc --noEmit` |

---

## 5. API surface

All routes are under `/api/v1/`. Health at root.

| Method | Path | Source |
|--------|------|--------|
| POST | `/api/v1/images/download-google-photo` | `images/download-google-photo.ts` |
| POST | `/api/v1/uploads/image` | `uploads/image.ts` |
| POST | `/api/v1/uploads/batch` | `uploads/batch.ts` |
| POST | `/api/v1/reviews/create` | `reviews/create.ts` |
| POST | `/api/v1/reviews/create-comment` | `reviews/create-comment.ts` |
| PUT | `/api/v1/reviews/update` | `reviews/update.ts` |
| DELETE | `/api/v1/reviews/delete` | `reviews/delete.ts` |
| GET | `/api/v1/reviews/following-feed` | `reviews/following-feed.ts` |
| GET | `/api/v1/users/me` | `users/me.ts` |
| POST | `/api/v1/users/follow` | `users/follow.ts` |
| POST | `/api/v1/users/unfollow` | `users/unfollow.ts` |
| GET | `/api/v1/users/suggested` | `users/suggested.ts` |
| DELETE | `/api/v1/users/delete` | `users/delete.ts` |
| GET | `/api/v1/restaurants/search` | `restaurants/search.ts` |
| POST | `/api/v1/restaurants/match` | `restaurants/match.ts` |
| POST | `/api/v1/admin/backfill-rating-summary` | `admin/backfill-rating-summary.ts` |
| GET | `/api/v1/admin/monitoring` | `admin/monitoring.ts` |

---

## 6. Environment variables

See `env.example` for the full list. Key groups:

| Group | Variables |
|-------|-----------|
| Hasura | `HASURA_GRAPHQL_URL` or `NHOST_HASURA_URL`, `HASURA_GRAPHQL_ADMIN_SECRET` |
| Auth | `NHOST_AUTH_URL` or `NHOST_SUBDOMAIN` + `NHOST_REGION` |
| Redis | `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` |
| S3 | `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_REGION`, `S3_BUCKET_NAME` |
| Server | `PORT` (default `3000`), `CORS_ORIGIN`, `NODE_ENV` |

---

## 7. Nhost project ownership

- **`tastyplates-nhost`** (sibling directory) owns Hasura metadata, database migrations, and auth config. This is the canonical source of truth for the schema.
- **`tastyplates-backend/nhost/`** is a local-dev-only Nhost CLI project for running `nhost up` to get a local Postgres + Hasura + Auth stack without connecting to Nhost Cloud. It is **not** an independent migration source.

---

## 8. Related files

| File | Role |
|------|------|
| `documentation/api-bestpractice.md` | Error shapes, naming, GraphQL vs backend decisions |
| `documentation/client-integration.md` | Frontend route mapping |
| `DEPLOYMENT.md` | Production deployment guide (Plesk, Docker, Nhost Run) |
