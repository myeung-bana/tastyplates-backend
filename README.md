# Tastyplates Backend

A standalone Node.js/Express API that powers the Tastyplates platform. It connects to Hasura/Postgres (managed separately in `tastyplates-nhost`) and Upstash Redis, and exposes a clean `/api/v1/...` surface for the frontend.

This is **not** an Nhost Functions project. It is a single Express application designed to run on **Plesk**, a VPS, or any Node.js host — independently of the Nhost CLI.

---

## Architecture

```
tastyplates-backend/
├── src/
│   ├── server.ts              Entry point (Express app, port 3000)
│   ├── lib/                   Shared utilities
│   │   ├── env.ts             Validated Zod env schema
│   │   ├── env-load.ts        dotenv loader (imported first in server.ts)
│   │   ├── hasura.ts          Hasura GraphQL client
│   │   ├── auth.ts            Nhost JWT token verification
│   │   ├── redis.ts           Upstash Redis instance
│   │   ├── cache.ts           Cache get-or-set helpers
│   │   ├── versioning.ts      Redis-backed cache versioning
│   │   ├── rate-limit.ts      Upstash rate limiters
│   │   ├── s3.ts              AWS S3 upload helpers
│   │   ├── validate.ts        Zod request schemas + OpenAPI extensions
│   │   ├── cursor-pagination.ts  Base64 cursor encode/decode
│   │   ├── palate-utils.ts    Palate normalisation helpers
│   │   ├── rebuild-rating-summary.ts  Rating summary rebuild logic
│   │   ├── health.ts          Hasura/Redis/S3 health checks
│   │   ├── openapi-registry.ts   OpenAPI spec generation
│   │   └── graphql/           Centralised GraphQL queries/mutations
│   │       ├── restaurant-queries.ts
│   │       ├── review-queries.ts
│   │       └── user-queries.ts
│   └── routes/
│       ├── healthz.ts         GET /healthz, /ready, /health/ui
│       ├── docs.ts            GET /docs (Swagger UI, dev only)
│       └── api/v1/
│           ├── images/        download-google-photo
│           ├── uploads/       image, batch
│           ├── reviews/       create, create-comment, update, delete, following-feed
│           ├── users/         me, follow, unfollow, suggested, delete
│           ├── restaurants/   search, match
│           └── admin/         backfill-rating-summary, monitoring
├── package.json
├── tsconfig.json
├── Dockerfile
├── nhost.toml                 (optional Nhost Run config)
├── env.example                All environment variables documented here
└── nhost/                     Hasura CLI project for local dev (nhost up)
```

---

## Local development

```bash
cp env.example .env
# Fill in real values in .env

npm install
npm run dev          # tsx watch — restarts on change, serves at :3000
```

Test the health endpoint:

```bash
curl http://localhost:3000/healthz
```

Open the Swagger docs:

```
http://localhost:3000/docs
```

---

## Environment variables

See `env.example` for the complete list with comments. Required at runtime:

| Variable | Description |
|----------|-------------|
| `HASURA_GRAPHQL_URL` or `NHOST_HASURA_URL` | Hasura GraphQL endpoint |
| `HASURA_GRAPHQL_ADMIN_SECRET` | Hasura admin secret |
| `NHOST_AUTH_URL` or `NHOST_SUBDOMAIN` + `NHOST_REGION` | Nhost Auth for token verification |
| `UPSTASH_REDIS_REST_URL` | Upstash Redis REST URL |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis REST token |
| `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_REGION`, `S3_BUCKET_NAME` | S3 upload credentials |

Optional: `CORS_ORIGIN`, `PORT` (default `3000`), `APP_URL`, image processing tuning.

---

## Deployment

See **`DEPLOYMENT.md`** for step-by-step Plesk and Docker instructions.

**Plesk quick-reference:**

| Field | Value |
|-------|-------|
| Node.js version | 22 |
| Application root | Server path to `tastyplates-backend/` |
| Startup file / command | `npm start` (runs `node -r tsx/cjs src/server.ts`) |
| Application mode | production |
| Custom variables | All from `env.example` |

---

## API routes

All routes are under `/api/v1/`. Health routes are at root (`/healthz`, `/ready`, `/health/ui`).

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/images/download-google-photo` | Server-side Google Places photo proxy |
| POST | `/api/v1/uploads/image` | S3 upload with Sharp AVIF/WebP conversion |
| POST | `/api/v1/uploads/batch` | Batch S3 upload (no conversion) |
| POST | `/api/v1/reviews/create` | Create review (rate-limited) |
| POST | `/api/v1/reviews/create-comment` | Add comment to review |
| PUT | `/api/v1/reviews/update` | Update review |
| DELETE | `/api/v1/reviews/delete?id=` | Soft-delete review |
| GET | `/api/v1/reviews/following-feed?user_id=` | Paginated following feed (Redis-cached) |
| GET | `/api/v1/users/me` | Current user profile |
| POST | `/api/v1/users/follow` | Follow a user |
| POST | `/api/v1/users/unfollow` | Unfollow a user |
| GET | `/api/v1/users/suggested` | Suggested users to follow |
| DELETE | `/api/v1/users/delete?id=` | Soft/hard delete account |
| GET | `/api/v1/restaurants/search` | Filtered restaurant search (Redis-cached) |
| POST | `/api/v1/restaurants/match` | Match restaurant by place_id, name/address, or coordinates |
| POST | `/api/v1/admin/backfill-rating-summary` | Rebuild all rating summaries (admin only) |
| GET | `/api/v1/admin/monitoring` | Cache versions + config status (admin only) |

---

## Nhost relationship

This repo handles **API logic only**. Hasura metadata, database migrations, and auth configuration live in **`tastyplates-nhost`**. For local development you can run `nhost up` from the `nhost/` directory inside this repo to spin up a local Postgres + Hasura + Auth stack.
