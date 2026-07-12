# Running DataCore — Manual

This is the step-by-step manual for running the full stack, using the app, and running the test suite.

## 1. Prerequisites

- Docker + Docker Compose (v2, i.e. the `docker compose` subcommand)
- Ports free on your machine: `3010`, `5173`, `5432`, `5672`, `15672`, `9000`, `9001`, `6333` — edit the
  `ports:` mappings in `docker-compose.yml` if any of these are already in use (only the left-hand side of
  each `HOST:CONTAINER` pair needs to change)
- Node.js 20+ only if you want to run things outside Docker (local dev, linting, the test suite without
  containerizing the backend)

## 2. Start the full stack

From the repo root:

```bash
docker network create datacore-net   # one-time
docker compose up -d --build
```

This builds and starts 9 containers: `postgres`, `rabbitmq`, `minio`, `qdrant`, `core-api`, `frontend`,
`plugin-markdown-summarizer`, `plugin-vector-embedder`, `plugin-github-profile-scanner`. The Web UI has a
couple of panels (Plugins → "Browse Community", Resources → "Share as Bundle"/"Import from Community") that
call a separate Community Registry service — that service isn't part of this repo, so those panels degrade
gracefully to "not available" here; everything else works standalone.

Check everything is healthy:

```bash
docker compose ps
```

`postgres`, `rabbitmq`, and `minio` should show `(healthy)`. The others don't define healthchecks but should
show `Up`.

## 3. Apply migrations and seed data

The database schema isn't applied automatically on container start — run this once after the first `up`:

```bash
docker compose exec core-api npx prisma migrate deploy
docker compose exec core-api npm run seed
```

The seed script creates:
- 3 plugins: **Markdown Summarizer**, **Vector Embedder**, and **GitHub Profile Scanner**
- 2 pipelines:
  - **Standard Markdown Ingestion** (trigger type `MARKDOWN`) — Markdown Summarizer → Vector Embedder
  - **GitHub Profile Analysis** (trigger type `GITHUB_REPO`) — GitHub Profile Scanner

## 4. Use it

- **Web UI**: http://localhost:5173 — Resources / Pipelines / Plugins views, global search in the header
- **Core API** directly: http://localhost:3010/api/v1
- **RabbitMQ management UI**: http://localhost:15672 (login `guest` / `guest`) — inspect the
  `datacore.resource-lifecycle` exchange and queues
- **MinIO console**: http://localhost:9001 (login `datacore` / `datacore123`) — see uploaded files and
  generated Summary artifacts under the `datacore-resources` bucket
- **Qdrant**: http://localhost:6333/dashboard — see the `datacore_vectors` collection and points

### Try the core flow from the UI

1. Open http://localhost:5173 → **Resources** → **Add Resource**.
2. Name it anything, type `MARKDOWN`, source = URL, e.g. `https://raw.githubusercontent.com/octocat/Hello-World/master/README`.
3. Watch the status go `Pending` → `Processing` → `Completed` (the table auto-refreshes every 3s), with
   `Summary` and `Vector` artifact chips appearing.
4. **Click an artifact chip** — it opens the actual processed result (the summary text, the embedding vector,
   or a rendered table for a `REPO_ANALYSIS`), not just the type badge.
5. Go to **Pipelines** to see the seeded pipeline and its steps; try creating a second one for a different
   resource type.
6. Go to **Plugins** and toggle one inactive — its card visually dims, and any resource routed to it afterward
   will fail with "plugin inactive" until you toggle it back.
7. Back in **Resources**, toggle a resource's **LLM Access** switch off — it dims in the table. This gates
   the [MCP server](./mcp-server) (see below), not pipeline processing, which is unaffected either way.

> The **Browse Community** / **Share as Bundle** / **Import from Community** panels need a separate
> Community Registry service that isn't part of this repository — they'll show "not available" without one.

### Try scanning a GitHub profile

Register a resource of type `GITHUB_REPO` whose source URL is a GitHub **profile** (not a specific repo) —
`https://github.com/<username>`. The GitHub Profile Scanner plugin fetches every public repo owned by that
user (name, description, language, stars, forks) and stores it as one aggregated `REPO_ANALYSIS` artifact —
no cloning, just the GitHub API. Works from either the UI's "Add Resource" form or curl:

```bash
curl -s -X POST http://localhost:3010/api/v1/resources \
  -H 'Content-Type: application/json' \
  -d '{"name":"My GitHub Profile","type":"GITHUB_REPO","source":{"kind":"URL","url":"https://github.com/<your-username>"}}'
```

It completes in well under a second for most profiles. Fetch the resulting JSON from MinIO to see the raw
per-repo data (swap in the `external_ref` path from the resource's `artifacts` array):

```bash
docker compose exec minio sh -c \
  "mc alias set local http://localhost:9000 datacore datacore123 >/dev/null && mc cat local/datacore-resources/github-analysis/<resource-id>.json"
```

### Try it from the command line instead

```bash
curl -s -X POST http://localhost:3010/api/v1/resources \
  -H 'Content-Type: application/json' \
  -d '{"name":"My Doc","type":"MARKDOWN","source":{"kind":"URL","url":"https://raw.githubusercontent.com/octocat/Hello-World/master/README"}}'

# copy the "id" from the response, then poll:
curl -s http://localhost:3010/api/v1/resources/<id>
```

### Try querying it from an LLM via MCP

`mcp-server/` exposes DataCore to any MCP-compatible or tool-calling LLM client as four read-only tools
(list/search resources, get one resource, get an artifact's content), gated by each resource's **LLM
Access** toggle in the Resources view:

```bash
cd mcp-server && npm install && npm run build
CORE_API_URL=http://localhost:3010/api/v1 npm start   # runs on stdio, waits for a client to connect
```

See `mcp-server/README.md` for wiring it into Claude Desktop or any other MCP-compatible client.

## 5. Run the backend test suite

Tests run against real Postgres/RabbitMQ/MinIO/Qdrant — nothing is mocked. Use the dedicated test compose file
with its own project name, so it can run **alongside** the main stack without touching it:

```bash
docker compose -p kuraio-test -f docker-compose.test.yml up -d

cd backend
npm install
cp .env.example .env   # then edit it to match docker-compose.test.yml's ports (see below)
npx prisma migrate deploy
npm run test:integration
```

`docker-compose.test.yml` maps: Postgres → `5533`, RabbitMQ → `5673`, MinIO → `9100`, Qdrant → `6433` (all
different from the main stack's ports on purpose, so both can run at once). Your `backend/.env` needs
`DATABASE_URL`/`RABBITMQ_URL`/`MINIO_ENDPOINT`/`QDRANT_URL` pointed at those ports (`.env.example` shows the
main-stack defaults — change `5432`→`5533`, `5672`→`5673`, `9000`→`9100`, `6333`→`6433`).

**Important**: always pass `-p kuraio-test` (or any project name other than the main stack's) when using
`docker-compose.test.yml`. Without it, Compose derives the project name from the directory (`kuraio`) for
*both* files — since they define services with the same names (`postgres`, `rabbitmq`, `minio`, `qdrant`),
Compose will treat the test file as redefining the main stack's containers and **replace them**, taking down
your running demo. `docker compose down` afterward would then tear down what you think is the test stack but is
actually the main one. The `-p` flag keeps them fully isolated.

Run everything in one go (matches CI):

```bash
npm run test:integration
```

If a test run gets interrupted (Ctrl-C, crash) mid-way, RabbitMQ queues can be left with stale unacked messages
that cause noisy (harmless) errors on the next run. Fix with:

```bash
docker compose -p kuraio-test -f docker-compose.test.yml restart rabbitmq
```

## 6. Local development without full Docker (optional)

Backend:

```bash
cd backend
npm install
npm run dev   # ts-node-dev, hot reload — needs Postgres/RabbitMQ/MinIO/Qdrant reachable per .env
```

Frontend:

```bash
cd frontend
npm install
npm run dev   # Vite dev server on :5173, proxies /api to localhost:3010 (see vite.config.ts)
```

Plugin workers (each needs `RABBITMQ_URL`, `CORE_API_URL`, and their own storage env vars — see
`docker-compose.yml` for the full list):

```bash
cd plugins/markdown-summarizer && npm install && npm run dev
cd plugins/vector-embedder && npm install && npm run dev
cd plugins/github-profile-scanner && npm install && npm run dev
```

## 7. Troubleshooting

- **A resource is stuck `Processing` forever**: either its plugin never called back and the timeout sweep
  hasn't fired yet (default step timeout is 300s), or a plugin worker container isn't running — check
  `docker compose logs plugin-markdown-summarizer plugin-vector-embedder plugin-github-profile-scanner`.
- **GitHub profile scan fails with "rate limit exceeded"**: GitHub's unauthenticated API allows 60 requests/hour
  per IP. Set a `GITHUB_TOKEN` env var on the `plugin-github-profile-scanner` service in `docker-compose.yml`
  (a personal access token with no special scopes needed) to raise it to 5000/hour.
- **`DELETE` on a resource returns 409**: expected — deletion is blocked while a resource is `Processing`
  (FR-007a). Wait for it to reach `Completed`/`Failed`, or let the timeout sweep fail it first.
- **Core API container exits immediately on start**: check `docker compose logs core-api` — this usually means
  a migration hasn't been applied yet (step 3) or Postgres isn't healthy yet.
- **Port already in use**: change the host-side port in `docker-compose.yml`'s `ports:` list for the
  conflicting service (container-side ports and inter-service hostnames don't need to change).
- **Frontend gets a `502 Bad Gateway` on any `/api/...` call after restarting `core-api`**: shouldn't
  happen — nginx is configured to re-resolve its container IP per request. If it does, `docker compose
  restart frontend` fixes it immediately; that's a regression worth reporting.

## 8. Stop / clean up

```bash
docker compose down        # stop and remove containers, keep volumes (data persists)
docker compose down -v     # also wipe Postgres/MinIO/Qdrant data
```

To tear down the test stack (if you started it): `docker compose -p kuraio-test -f docker-compose.test.yml down -v`.
