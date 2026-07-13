# Example: A portfolio minisite from your GitHub profile with DataCore + Gemini

A downstream-consumer example: register your GitHub profile as a DataCore resource, let the
`github-profile-scanner` plugin do its normal job (no special-casing — this is the same pipeline any
`GITHUB_REPO` resource goes through), then read the resulting `REPO_ANALYSIS` artifact back out over the
same REST API the Web UI uses, register each top repo's actual README as its own `MARKDOWN` resource so
DataCore's real `markdown-summarizer` plugin can produce a proper summary, hand all of that to the Gemini
API to write portfolio copy and power a semantic "ask about my work" search box, and render a self-contained
minisite.

Nothing here is DataCore-internal or MCP-specific — it's the same `GET /resources` / `POST /resources` /
`GET /resources/{id}/artifacts/{artifactId}` any external system would use to consume DataCore's output.
The Gemini steps are a separate, optional layer on top — DataCore itself has no AI dependency; this script
is just one example of a downstream consumer choosing to add one.

## What it does

1. Checks whether a `GITHUB_REPO` resource already exists for `https://github.com/<username>`; registers
   one if not.
2. Polls until the pipeline finishes (`Completed`) — this is the real `github-profile-scanner` plugin
   hitting the live GitHub API, same as if you'd added the resource by hand in the Web UI.
3. Fetches the resulting `REPO_ANALYSIS` artifact's actual content — repo names, descriptions, languages,
   stars, forks, default branch, and for the plugin's own top repos by stars: real README content, the
   root-level file listing, and the actual content of any manifest/config files found there (`package.json`,
   `pom.xml`, `requirements.txt`, `Dockerfile`, etc. — see `plugins/github-profile-scanner/`). No cloning,
   just the GitHub API.
4. If `GEMINI_API_KEY` is set:
   - **Ingests READMEs as their own resources.** For the top few repos (by stars, non-fork), registers
     their `README.md` as its own `MARKDOWN` resource in DataCore — the real `markdown-summarizer` plugin
     processes it into a genuine `SUMMARY` artifact, same as any Markdown resource. This is mostly a fallback
     now that the scanner plugin fetches READMEs itself, but it demonstrates a different DataCore pattern
     (registering more resources from a downstream script) and still covers any repo outside the scanner's
     own top-N bound. Repos with no `README.md` on their default branch are skipped, not fatal.
   - **Writes portfolio copy.** Sends the scanned data to Gemini with a structured-output schema, asking
     for a tagline, a short bio, a skills list, and a one-sentence "highlight" per top repo — grounded only
     in the real data given, nothing invented. Prefers each repo's real README (from the scanner, falling
     back to the ingested `SUMMARY` above) over GitHub's one-line description, and uses the actual manifest
     file content to name *specific* frameworks/libraries (e.g. "built with Express and Prisma") instead of
     just repeating the `language` field.
   - **Builds a search index.** Embeds each indexed repo's README/description plus a note of its actual
     project files with Gemini's embedding model, and saves it to `output/search-index.json` — this is what
     powers the search box below. (This is a separate embedding step run by this example, not DataCore's own
     `vector-embedder` plugin, which ships with a deterministic mock embedding for demonstrating the pipeline
     mechanics rather than real semantic search — see
     [Building a Plugin](../../docs/guide/building-a-plugin.md) if you want to know more about that
     distinction.)
5. Renders a single self-contained `output/portfolio.html` with two tabs:
   - **Portfolio** — the hero section (avatar, tagline, bio, skill chips), an **"Ask About My Work"**
     search box (if a search index was built), a "Featured Projects" section (Gemini's highlights, if
     generated), and the full repo grid sorted by stars.
   - **DataCore Resources** — every resource this run actually registered or reused in DataCore (the main
     `GITHUB_REPO` resource, plus each ingested README's `MARKDOWN` resource), exactly as the Core API
     reports it: status, source URL, and every artifact with its type and `external_ref` (the real
     `SUMMARY`/`VECTOR` artifacts from `markdown-summarizer` → `vector-embedder` → `qdrant-register`, not a
     mock). This is a snapshot taken when the page was generated, not a live view — re-run `npm start` to
     refresh it.

Without `GEMINI_API_KEY`, steps 4 is skipped entirely — you still get the full minisite layout, just with
the raw GitHub data standing in for the AI-written copy (repo descriptions as-is, languages as the skill
chips, no "Featured Projects" section, no search box). Nothing fails or looks broken either way.

## The search box: how it actually answers questions

`output/portfolio.html` is a static file, so the search box needs something running server-side to answer
a question — that's `src/server.ts` (see "Viewing it" below for how to run it). When a visitor asks a
question:

1. The question is embedded with the same Gemini embedding model used to build the index.
2. It's compared (cosine similarity, in memory — the index is a handful of repos, not worth standing up a
   vector database for) against every indexed repo's embedding; the top 3 matches are kept.
3. Those repos' real summaries are handed to Gemini as context, along with the question, with an explicit
   instruction to say so honestly rather than guess if the context doesn't cover it.
4. The answer and the source repos it drew from are returned and rendered under the search box.

This is genuine retrieval-augmented generation over your real, DataCore-processed project data — not the
model just improvising from its own training data about what a portfolio site "should" say.

## Running it

Needs a running DataCore instance with the `github-profile-scanner` plugin's pipeline configured (the
default seed data sets this up — see the repo root `RUNNING.md`).

### Via npm

```bash
npm install
npm run build
npm start -- <your-github-username>
```

Or via env vars:

```bash
CORE_API_URL=https://datacore.io/api/v1 GITHUB_USERNAME=d-chebastian GEMINI_API_KEY=... npm start
```

### Via Docker Compose

No local Node/npm needed — this joins the main app's `datacore-net` network to reach the Core API by
service name, so the main stack (repo root `docker-compose.yml`) needs to already be running:

```bash
cp .env.example .env   # fill in GITHUB_USERNAME / GEMINI_API_KEY if you want them
docker compose build
docker compose run --rm portfolio
```

This is a one-shot script, not a server — use `run`, not `up -d`. The generated files land on the host at
`./output/` either way (bind-mounted into the container). Override anything per-run without touching
`.env`:

```bash
docker compose run --rm -e GITHUB_USERNAME=someone-else portfolio
```

### Viewing it at an actual URL (and making the search box work)

`portfolio` just writes files and exits — nothing serves them over HTTP by itself, and the search box
needs a live server to answer questions (see above). That's the `viewer` service:

```bash
docker compose up -d viewer
# → http://localhost:8090/portfolio.html
```

`viewer` is long-running (start it once with `up -d`, not `run`) and reads whatever's currently in
`./output` on each request — re-run `portfolio` and refresh the browser to see a new version (and a
rebuilt search index), no restart needed. It needs `GEMINI_API_KEY` set too (it embeds each question
server-side); without it, the search box still renders but returns a clear "not configured" message
instead of failing silently. Change the `8090:3000` port mapping in `docker-compose.yml` if that port's
taken.

Without Docker, the equivalent is `npm run serve` (runs `dist/server.js` directly) after `npm run build`.

First run against a profile takes a bit longer than later ones (the GitHub scan, plus a Gemini call and
README ingestion if enabled); re-running reuses existing resources and just re-fetches current data, so
it's fast after that.

## Configuration

| Env var | Default | Purpose |
|---|---|---|
| `CORE_API_URL` | `http://localhost:3010/api/v1` | Which DataCore instance to query |
| `GITHUB_USERNAME` | `d-chebastian` (or the first CLI argument) | Whose GitHub profile to scan/render |
| `OUTPUT_PATH` | `./output/portfolio.html` | Where `npm start` writes the generated page (the search index is written alongside it) |
| `OUTPUT_DIR` | `./output` | Where `npm run serve` reads the page/search index from |
| `PORT` | `3000` | Which port `npm run serve` listens on |
| `GEMINI_API_KEY` | *(unset)* | Get one free at [Google AI Studio](https://aistudio.google.com/apikey). Omit to render from raw scanned data only — no AI copy, no README ingestion, no search box |
| `GEMINI_MODEL` | `gemini-flash-latest` | Which Gemini model writes portfolio copy and answers search questions — the `-latest` alias tracks whatever Google currently considers their stable flash model, so this shouldn't need updating as specific dated versions get deprecated |
| `GEMINI_EMBEDDING_MODEL` | `gemini-embedding-001` | Which Gemini model embeds repo summaries and search questions |
| `SEARCH_RATE_LIMIT_PER_HOUR` | `10` | `viewer` only — max `/api/ask` requests per visitor IP per hour. See below |
| `SEARCH_DAILY_CAP` | `100` | `viewer` only — max `/api/ask` requests total (all visitors combined) per calendar day |
| `TRUST_PROXY` | `false` | `viewer` only — set `true` **only** if you've put `viewer` behind a reverse proxy you control that sets `X-Forwarded-For`; otherwise a client could spoof that header to dodge the rate limit |

`GEMINI_API_KEY` is a real credential — don't commit it. Export it in your shell or pass it inline as shown
above; this script never writes it anywhere. Needed on **both** `portfolio` (to build the search index) and
`viewer` (to answer questions against it) if you want the search box to work end to end.

## Cost & abuse protection

`portfolio.html` itself is a plain static file — it never contains your API key, so hosting it anywhere
(GitHub Pages, S3, wherever) is completely safe on its own. The actual exposure is `viewer`: it holds
`GEMINI_API_KEY` server-side to answer `/api/ask`, so if you put `viewer` on the public internet, anyone
who finds that URL can otherwise spam it and run up your Gemini bill/quota under your key.

**What this example already does about it:** `server.ts` rate-limits `/api/ask` — per-IP (`SEARCH_RATE_LIMIT_PER_HOUR`,
default 10/hour) and with a shared daily cap across every visitor combined (`SEARCH_DAILY_CAP`, default
100/day, resets at midnight server time), plus a max question length. This is real protection, tuned via
the env vars above, but it's in-memory (resets if the container restarts) and per-instance — treat it as a
reasonable default, not a hard guarantee, especially if you expect real traffic.

**What you should also do, on Google's side, before making `viewer` public:**

1. **Restrict the API key** in [Google AI Studio](https://aistudio.google.com/apikey) / the Google Cloud
   Console credentials page: limit it to the Generative Language API only, and if `viewer` runs somewhere
   with a stable IP (a VPS, a fixed cloud instance), add an IP restriction so the key only works from
   there — even a leaked key becomes useless from anywhere else. (An HTTP-referrer restriction doesn't help
   here — the call to Gemini happens server-side, not from the visitor's browser, so there's no referrer to
   check.)
2. **Set a budget alert or hard quota** on the Google Cloud project the key belongs to, so a worst-case
   traffic spike costs you a notification, not a surprise bill.
3. **Use a separate key for `viewer` than for `portfolio`** if you can — `portfolio` (the generation step)
   only ever runs under your control, so it doesn't need the same exposure-driven caution as the
   public-facing `viewer`. Keeping them separate means abuse against the public one can't affect your
   ability to regenerate the page.

If you'd rather not deal with any of this, the search box is entirely optional: skip running `viewer`
(or run it bound to `localhost` only, not a public port) and just host the static `portfolio.html` from
`npm start` — you keep the AI-written copy, just lose the live search box.

## Note on the LLM Access toggle

This script reads the REST API directly (like the Web UI), so it works regardless of a resource's **LLM
Access** setting — that toggle only gates the [MCP server](../../mcp-server)'s tools, not the REST API
itself. If you want an MCP client to be able to describe this same resource to an LLM, make sure "LLM
Access" is on for it in the Resources view. (This is unrelated to the Gemini steps above, which this script
calls directly — it has nothing to do with DataCore's own MCP server.)
