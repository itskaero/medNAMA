# Deploying medNAMA on the NAS

Run these on the NAS machine itself (SSH into the NAS, then run in the app
directory). The NAS already runs Docker with the compose v5 plugin, which reads
environment variables from `--env-file ./.env`.

## 1. Point the checkout at the new repo & pull the launch build

```bash
cd /path/to/medNAMA        # e.g. the folder where the checkout lives

# First deploy after the repo move: re-point origin (NAS still points at the old repo)
git remote -v
git remote set-url origin https://github.com/itskaero/medNAMA.git

git pull origin main
```

The pull brings in: F1–F6 backend (batch quiz / dedup, notes, flashcards,
exports), the new frontend (SourcesPanel, Study Corner, MCQs 5/10/15/20, drill),
the `docker/Dockerfile`s, `NAS/docker-compose.yaml`, and the alembic migration
`a1b2c3d4e5f6_add_notes_and_flashcards`.

## 2. Prepare `.env` (never commit this file)

Create/update `.env` NEXT TO the compose file (or in the repo root as configured
below). Must contain at least:

```bash
POSTGRES_USER=medrag
POSTGRES_PASSWORD=<strong-db-password>     # must NOT be the placeholder
POSTGRES_DB=medrag
DEEPSEEK_API_KEY=<your-key>
JWT_SECRET=<long-random-string-not-'change-me-in-production'>
GEMINI_API_KEY=                            # optional
ALLOWED_ORIGINS=http://192.168.1.44:3000,http://localhost:3000
MEDNAMA_PORT=3000
```

`ALLOWED_ORIGINS` must include the URL users open in the browser on the LAN
(`http://192.168.1.44:3000`). The backend starts with `--timeout-keep-alive 70`
and CPU-only torch — first `up` takes several minutes while the models warm up.

## 3. Build & start

```bash
# compose v5 syntax (env file via --env-file; do NOT omit it)
docker compose --env-file ./.env -f NAS/docker-compose.yaml up -d --build
```

Place `.env` in the repo root so `postgres` data volume path resolution and the
compose env interpolation both work. The backend applies alembic migrations
automatically on boot (`a1b2c3d4e5f6` creates `notes` + `flashcards`).

## 4. Verify

```bash
docker compose -f NAS/docker-compose.yaml ps        # db, backend, frontend all Up
docker compose -f NAS/docker-compose.yaml logs backend --tail 20
# expect 'Uvicorn running on http://0.0.0.0:8000' and 'Application startup complete.'

curl -s http://192.168.1.44:3000/api/books | head -c 120
```

Then from the browser on any LAN device: `http://192.168.1.44:3000`, log in
(`admin` / your password), and run a chat query → the "All Matched Sources"
panel should appear under the answer.

## 5. Database

If you're migrating the knowledge base, follow `DB_TRANSFER_TO_NAS.md`:
`scripts/export_db.py` locally → copy `medrag.dump` → `bash scripts/restore_nas.sh`
on the NAS → point `DATABASE_URL` at `medrag_new` in `.env`;
`DATABASE_URL=postgresql://medrag:<password>@db:5432/medrag_new`.

## Gotchas

- **First boot is slow**: backend health becomes `healthy` only after the
  embedding + reranker models finish INT8 warmup (~5 min on CPU). Wait for it
  before judging the stack.
- **Proxy dead-socket 500s**: the Next.js rewrite can occasionally reply `500
  Internal Server Error` (plain text) on a pooled keep-alive socket. The
  frontend retries these automatically (`proxySafeFetch`).
- **Do not publish 3000 on 0.0.0.0** if you don't want LAN exposure — keep the
  default mapping and rely on firewall rules if that's the intent.