# Tastyplates Backend (Nhost)

This folder contains the **Nhost backend** for Tastyplates: a traditional **Express server** + Nhost (Postgres + Hasura + Auth + Storage).

It is designed to replace the Next.js “API monolith” currently living under:

- `tastyplates-v2-1/src/app/api/**`

The migration strategy and endpoint mapping live here:

- `documentation/nhost-migration.md`

---

## Local development (recommended workflow)

1. From repo root, install dependencies: `yarn` (or `npm install`). Then run `yarn typecheck` to verify.
2. Install Nhost CLI (once) and Docker. From `tastyplates-backend/`, run:

```bash
nhost up
```

This starts local Postgres, Hasura, Auth, and Storage.

3. Start the backend server (separate terminal):

```bash
yarn dev
```

The Express server runs on **http://localhost:4000** (set `PORT` env var to change).

---

## Repository layout

- **Root** — Node.js Express app: `package.json`, `tsconfig.json`, `env.example`, `yarn.lock`. Run `yarn` and `yarn dev` from here.
- `src/index.ts` — Express server entry point (starts on port 4000 by default).
- `src/routes/` — Route handlers organized to mirror `/api/v1/...` (minimal frontend changes).
- `src/lib/` — Shared utilities (env, hasuraAdminClient, etc.).
- `nhost/` — Hasura migrations/metadata (used by `nhost-cli` for DB schema).

---

## Deployment (production)

This is now a **traditional Node.js server** (not Nhost serverless functions). Deploy via:

- **Nhost Run** (containerized apps) — recommended if you're using Nhost Hasura/Auth/Storage
- **Railway** / **Fly.io** / **Render** / **Cloud Run** — general Node hosting

Dockerfile example (if needed):

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package.json yarn.lock ./
RUN yarn install --production
COPY . .
EXPOSE 4000
CMD ["yarn", "start"]
```

---

## Environment variables

Use **root** `env.example` as the reference (this repo avoids committing `.env*` files). Set these in your deployment platform or via `.env` locally.

