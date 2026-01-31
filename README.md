# Tastyplates Backend (Nhost)

This folder contains the **Nhost backend** for Tastyplates: Postgres + Hasura + Auth + Storage + Functions.

It is designed to replace the Next.js “API monolith” currently living under:

- `tastyplates-v2-1/src/app/api/**`

The migration strategy and endpoint mapping live here:

- `documentation/nhost-migration.md`

---

## Local development (recommended workflow)

1. Install Nhost CLI (once) and Docker.
2. From `tastyplates-backend/`, run:

```bash
nhost up
```

This will start local Postgres, Hasura, Auth, Storage, and Functions.

---

## Repository layout

- `nhost/`
  - Hasura migrations/metadata/seeds used by `nhost-cli`
- `functions/`
  - Nhost Functions (TypeScript), organized to mirror the current `/api/v1/...` routes

---

## Environment variables

- Backend services are configured via Nhost and Hasura metadata/migrations.
- Functions read env vars from Nhost. Use:
  - `functions/env.example` as the reference template (this repo avoids committing `.env*` files)

