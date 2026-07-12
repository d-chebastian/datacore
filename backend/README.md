# DataCore Core Warehouse (backend)

Express + TypeScript REST API, Prisma/PostgreSQL for relational metadata, RabbitMQ for the resource-lifecycle
event exchange, MinIO for raw files, Qdrant referenced for vector artifact cleanup.

## Setup

```bash
npm install
cp .env.example .env   # point at your Postgres/RabbitMQ/MinIO/Qdrant instances
npx prisma migrate deploy
npm run seed
npm run dev
```

## Scripts

- `npm run dev` — run with hot reload (`ts-node-dev`)
- `npm run build` / `npm start` — compile to `dist/` and run the compiled server
- `npm run seed` — seed 2 sample plugins + 1 sample pipeline (Markdown Summarizer → Vector Embedder)
- `npm run test:integration` — run the Jest/Supertest integration suite against real infra (see root `README.md`
  for bringing up `docker-compose.test.yml` first)
- `npm run prisma:generate` / `npm run prisma:migrate` — Prisma client generation / applying migrations in CI

## Layout

- `src/routes/` — `/api/v1/resources`, `/pipelines`, `/plugins`, `/internal/artifacts`
- `src/services/pipelineRouter.ts` — dispatches pipeline steps, handles retries/backoff, runs the FR-016c
  timeout sweep
- `src/broker/` — RabbitMQ (`amqplib`) publish/consume wrapper and routing-key constants
- `src/storage/` — MinIO (S3-compatible SDK) and Qdrant client wrappers
- `src/models/` — Prisma-backed data-access layer plus API DTO mappers (camelCase ↔ snake_case)
- `prisma/schema.prisma` / `prisma/seed.ts` — schema and seed data
- `tests/integration/` — one file per contract/event-handling scenario, run against real Postgres/RabbitMQ/MinIO/Qdrant
