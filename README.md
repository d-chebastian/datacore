# DataCore Knowledge Warehouse

[日本語版 README はこちら](./README.ja.md)

An event-driven Knowledge Warehouse that ingests raw resources (PDFs, GitHub repos, CSVs, audio, Markdown),
processes them through configurable pipelines of plugin workers, and produces reusable artifacts (vector
embeddings, knowledge graphs, summaries) for downstream LLMs to query.

📖 **[Full documentation](https://datacore.wakewakanai.com)** ([日本語](https://datacore.wakewakanai.com/ja/))
— architecture, API/event reference, and a guide to building your own plugin.

🚀 **[Live demo](https://demo.datacore.wakewakanai.com)** ([日本語](https://demo.datacore.wakewakanai.com/ja/portfolio.html))
— a real portfolio site generated entirely through DataCore's own pipeline (GitHub scan → AI-written copy
→ semantic search), not a mockup. Source in [`examples/github-portfolio`](./examples/github-portfolio).

**→ See [`RUNNING.md`](./RUNNING.md) for the full step-by-step manual** (prerequisites, starting the stack,
using the UI, running tests, local dev without Docker, and troubleshooting). The rest of this file is a
condensed version of the same steps.

## Architecture

- **`backend/`** — Core Warehouse: Node.js/TypeScript + Express REST API under `/api/v1/`, PostgreSQL (via Prisma)
  for relational metadata, MinIO for raw files, and a RabbitMQ-based Pipeline Router that orchestrates plugin
  workers purely through events.
- **`frontend/`** — React + Vite + Tailwind SPA with three views (Resources, Pipelines, Plugins) and a global
  search, calling the Core API directly. Artifact chips are clickable — they open the actual processed content
  (summary text, GitHub repo analysis, or embedding vector), not just a type badge. It also has optional
  panels (Plugins → "Browse Community", Resources → "Share as Bundle"/"Import from Community") for a
  separate Community Registry service that isn't part of this repo — they no-op gracefully if you don't run
  one.
- **`plugins/`** — Independently deployable Plugin Worker containers. Ships with three samples:
  - `markdown-summarizer` — produces a `SUMMARY` artifact.
  - `vector-embedder` — produces a `VECTOR` artifact in Qdrant.
  - `github-profile-scanner` — given a GitHub profile or repo URL, scans all of the owner's public repos via
    the GitHub API and produces one aggregated `REPO_ANALYSIS` artifact (no cloning).
- **`mcp-server/`** — an [MCP](https://modelcontextprotocol.io) server exposing DataCore to LLM clients
  (Claude Desktop, Claude Code, or any tool-calling agent) as four read-only tools: list/search resources,
  get one resource, get an artifact's actual content. Gated per-resource by the "LLM Access" toggle in the
  Resources view — has no effect on pipeline processing. See `mcp-server/README.md`.
- **`examples/`** — downstream-consumer examples, each talking only to the public REST API/MCP server, no
  special access to DataCore internals:
  - `github-portfolio` — the [live demo](https://demo.datacore.wakewakanai.com) above: scans a GitHub
    profile, writes portfolio copy with Gemini grounded in the real scanned data, and serves a semantic
    "ask about my work" search box. Generates English + Japanese in one run.
  - `llama-mcp-client` — proves the MCP server works with any tool-calling client, not just Claude, by
    driving a local Llama model through Ollama.

## Quickstart (local dev via Docker Compose)

```bash
docker network create datacore-net   # one-time
docker compose up -d
docker compose exec core-api npx prisma migrate deploy
docker compose exec core-api npm run seed   # seeds 3 sample plugins + 2 sample pipelines
```

- Web UI: http://localhost:5173
- Core API: http://localhost:3010/api/v1
- RabbitMQ management: http://localhost:15672 (guest/guest)
- MinIO console: http://localhost:9001 (datacore/datacore123)

## Running the backend test suite

```bash
docker compose -p kuraio-test -f docker-compose.test.yml up -d
cd backend
cp .env.example .env   # adjust ports to match docker-compose.test.yml (see RUNNING.md)
npm install
npx prisma migrate deploy
npm run test:integration
```

Always pass `-p kuraio-test` (or any name other than the main stack's) — otherwise Compose treats the test file
as redefining the main stack's same-named containers and replaces your running demo. See `RUNNING.md` §5.

Integration tests run against real Postgres, RabbitMQ, MinIO, and Qdrant instances — no mocking of the broker or
storage clients, per the project constitution's Test Discipline principle.
