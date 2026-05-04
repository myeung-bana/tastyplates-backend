# Deployment Guide

This is a single standalone Node.js/Express application. Deploy the entire `tastyplates-backend/` directory as one process. There is no nested sub-app or separate functions folder anymore.

---

## Plesk (recommended)

### Plesk field reference

| Field | Value |
|-------|-------|
| **Node.js version** | 22 |
| **Package manager** | npm (lockfile is `package-lock.json`) |
| **Document root** | Same as application root (API-only, no static files) |
| **Application mode** | production |
| **Application URL** | Your public API base URL, e.g. `https://api.yourdomain.com` |
| **Application root** | Server path to this `tastyplates-backend/` directory |
| **Application startup file** | `src/server.ts` with Node arguments `-r tsx/cjs` — equivalent to `npm start` |

If Plesk accepts an npm/yarn script instead of a file, use **`npm start`** (which runs `node -r tsx/cjs src/server.ts`). `tsx` is in `dependencies`, so it is installed after a plain `npm install`.

If Plesk only accepts a compiled `.js` file, run `npm run build` first (outputs to `dist/`) and set the startup file to **`dist/server.js`** with no extra Node arguments.

### Custom environment variables (Plesk panel → Node.js app → Environment variables)

Copy every variable from `env.example` and fill in real values. At minimum:

```
HASURA_GRAPHQL_URL=https://xxx.nhost.run/v1/graphql
HASURA_GRAPHQL_ADMIN_SECRET=<your-secret>
NHOST_AUTH_URL=https://xxx.auth.ap-southeast-1.nhost.run
UPSTASH_REDIS_REST_URL=https://xxx.upstash.io
UPSTASH_REDIS_REST_TOKEN=<your-token>
S3_ACCESS_KEY_ID=<key>
S3_SECRET_ACCESS_KEY=<secret>
S3_REGION=ap-northeast-2
S3_BUCKET_NAME=<bucket>
NODE_ENV=production
```

Plesk injects `PORT` automatically and the app defaults to `3000` if absent.

### Health check

After deploying, verify:

```bash
curl https://api.yourdomain.com/healthz
```

Expected (when all services are reachable):
```json
{
  "status": "healthy",
  "uptime": 120,
  "checks": {
    "hasura": { "status": "ok", "latencyMs": 15 },
    "redis": { "status": "ok", "latencyMs": 3 },
    "s3": { "status": "ok" }
  }
}
```

---

## Docker / VPS / Cloud Run

Build and run with the included `Dockerfile`:

```bash
docker build -t tastyplates-backend .

docker run -p 3000:3000 \
  -e HASURA_GRAPHQL_URL=... \
  -e HASURA_GRAPHQL_ADMIN_SECRET=... \
  -e NHOST_AUTH_URL=... \
  -e UPSTASH_REDIS_REST_URL=... \
  -e UPSTASH_REDIS_REST_TOKEN=... \
  -e S3_ACCESS_KEY_ID=... \
  -e S3_SECRET_ACCESS_KEY=... \
  -e S3_REGION=ap-northeast-2 \
  -e S3_BUCKET_NAME=... \
  -e NODE_ENV=production \
  tastyplates-backend
```

The `Dockerfile` uses a multi-stage build: `npm run build` (TypeScript → `dist/`) then `node dist/server.js` in the runner stage. No `tsx` is needed at runtime for the Docker build.

---

## Nhost Run (optional)

If you still want to deploy via Nhost Run, `nhost.toml` at the repo root defines a Run service on port 3000 using `node dist/server.js`. Run `npm run build` as a pre-deploy step, then:

```bash
nhost login
nhost link    # first time
nhost deploy
```

Set environment variables in Nhost Dashboard → Run → backend → Environment Variables.

---

## Frontend configuration

In `tastyplates-v2-1`, set:

```env
NEXT_PUBLIC_BACKEND_URL=https://api.yourdomain.com
```

All API calls should point to `${NEXT_PUBLIC_BACKEND_URL}/api/v1/...`.

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `HASURA_GRAPHQL_URL or NHOST_HASURA_URL must be set` at startup | Set `HASURA_GRAPHQL_URL` in env |
| `Invalid environment configuration` at startup | Check all required vars in `env.example` are set |
| Redis errors on every request | Verify `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` |
| `/healthz` returns `degraded` | Check `checks` payload — each service reports its own error |
| Plesk `npm start` fails (tsx not found) | Ensure `npm install` (not `npm install --omit=dev`) was run — `tsx` is in `dependencies` |
