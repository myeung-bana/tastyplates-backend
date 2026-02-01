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

4. **Test the health endpoint:**

```bash
curl http://localhost:4000/healthz
```

Expected response:
```json
{
  "ok": true,
  "service": "tastyplates-backend",
  "timestamp": "2026-01-31T..."
}
```

---

## Repository layout

- **Root** — Node.js Express app: `package.json`, `tsconfig.json`, `env.example`, `yarn.lock`. Run `yarn` and `yarn dev` from here.
- `src/index.ts` — Express server entry point (starts on port 4000 by default).
- `src/routes/` — Route handlers organized to mirror `/api/v1/...` (minimal frontend changes).
- `src/lib/` — Shared utilities (env, hasuraAdminClient, etc.).
- `nhost/` — Hasura migrations/metadata (used by `nhost-cli` for DB schema).

---

## Deployment (production)

This is a **traditional Node.js Express server** that deploys to **Nhost Run** (or any container platform).

### Deploy to Nhost Run

1. **Ensure you have the Nhost CLI installed:**

```bash
npm install -g nhost
```

2. **Link to your Nhost project** (first time only):

```bash
nhost link
```

3. **Deploy:**

```bash
nhost deploy
```

This will:
- Build the Docker image
- Deploy to Nhost Run
- Give you a public URL: `https://backend-[id].[region].nhost.run`

4. **Set environment variables** in Nhost Dashboard:
   - Go to your project → **Run** → **backend** service → **Environment Variables**
   - Add all variables from `env.example`:
     - `HASURA_GRAPHQL_ADMIN_SECRET` (from Nhost project settings)
     - `HASURA_GRAPHQL_URL` (e.g., `https://[subdomain].nhost.run/v1/graphql`)
     - `UPSTASH_REDIS_REST_URL`
     - `UPSTASH_REDIS_REST_TOKEN`
     - `NEXT_PUBLIC_APP_URL` (your frontend URL)
     - S3 credentials (if using S3)

5. **Test your deployment:**

```bash
curl https://backend-[id].[region].nhost.run/healthz
```

### Alternative Deployment Options

- **Railway** / **Fly.io** / **Render** / **Cloud Run** — works with the included Dockerfile

---

## Environment variables

Use **root** `env.example` as the reference (this repo avoids committing `.env*` files). Set these in your deployment platform or via `.env` locally.

