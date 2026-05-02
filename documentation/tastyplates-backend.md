Here's a comprehensive, actionable next-steps guide for modularizing your Tastyplates backend:---

## Detailed breakdown

### Phase 1 — Standalone dev server

**`functions/src/server.ts`** is the key file to create. The pattern is simple since each Nhost Function already exports a standard `(req, res) => void` Express handler:

```ts
import express from 'express'
import imageUpload from './uploads/image'
import reviewCreate from './reviews/create'
// ... all other handlers

const app = express()
app.use(express.json())

app.post('/v0/uploads/image', imageUpload)
app.post('/v0/reviews/create', reviewCreate)
// mirror every row from your functions inventory

app.listen(3001, () => console.log('Functions running on :3001'))
```

Add to `functions/package.json`:
```json
"scripts": {
  "dev:standalone": "tsx watch src/server.ts",
  "build": "tsc --noEmit"
}
```

---

### Phase 2 — Health check

**`GET /healthz`** response shape to aim for:

```json
{
  "status": "healthy",
  "uptime": 3921,
  "checks": {
    "hasura": { "status": "ok", "latencyMs": 12 },
    "redis": { "status": "ok", "latencyMs": 4 },
    "s3": { "status": "ok" }
  }
}
```

The health UI at `GET /health/ui` just needs a `setInterval` fetch loop and a simple green/red pill per service — no framework needed.

---

### Phase 3 — Swagger / OpenAPI

The cleanest approach given your existing Zod validators is **`@asteasolutions/zod-to-openapi`**. You register schemas once in `_lib/openapi-registry.ts` and the library generates the full OpenAPI 3.1 JSON. Then:

```ts
import swaggerUi from 'swagger-ui-express'

if (process.env.NODE_ENV !== 'production') {
  const spec = generateOpenAPISpec() // from your registry
  app.get('/docs/openapi.json', (_, res) => res.json(spec))
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(spec))
}
```

Configure the Swagger UI with a `Bearer` security scheme so you can paste a JWT and test protected routes directly from the browser.

---

### Recommended file additions summary

| New file | Purpose |
|---|---|
| `functions/src/server.ts` | Standalone Express entrypoint for local dev |
| `functions/src/_lib/openapi-registry.ts` | Centralized OpenAPI schema registry |
| `functions/src/_lib/health.ts` | Hasura + Redis + S3 ping helpers |
| `functions/src/routes/healthz.ts` | `GET /healthz` and `GET /ready` handlers |
| `functions/src/routes/docs.ts` | Swagger UI mount (dev-only) |
| `.env.local.example` | Template for local env vars |

This keeps everything additive — nothing in your existing Nhost deploy path (`functions/src/uploads/`, `reviews/`, etc.) needs to change.