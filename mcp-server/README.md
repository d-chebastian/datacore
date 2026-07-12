# DataCore MCP Server

Exposes DataCore's Knowledge Warehouse to any [MCP](https://modelcontextprotocol.io)-compatible LLM client
(Claude Desktop, Claude Code, or your own agent) as four read-only tools. It never touches Postgres/MinIO/
Qdrant directly — it's a thin translation layer over DataCore's own REST API (`CORE_API_URL`), the same one
the Web UI calls.

## Tools

| Tool | What it does |
|---|---|
| `list_resources` | List resources enabled for LLM access, optionally filtered by `type`/`status` |
| `search_resources` | Search resources by a name substring (same restriction) |
| `get_resource` | Fetch one resource's metadata + artifact list by id |
| `get_artifact_content` | Fetch an artifact's actual content (summary text, embedding vector, or structured analysis) |

**Every tool is gated by the resource's "LLM Access" toggle** (Resources view in the Web UI, `is_enabled` in
the API). A disabled resource is invisible to `list_resources`/
`search_resources` and refuses `get_resource`/`get_artifact_content` with a clear error, even if you already
know its id — this is the enforcement point for that toggle. It has no effect on DataCore's own pipeline
processing, which runs the same regardless.

## Running it

```bash
npm install
npm run build
CORE_API_URL=http://localhost:3010/api/v1 npm start
```

It talks over stdio, so it's meant to be **spawned as a subprocess** by an MCP client, not run standalone —
`npm start` alone will just sit there waiting for a client to connect via its stdin/stdout.

`CORE_API_URL` defaults to `http://localhost:3010/api/v1` (the port `docker-compose.yml` publishes
`core-api` on). Point it at wherever you've deployed your own DataCore instance's Core API to query that
one instead of a local one.

## Using it with Claude Desktop

Add to Claude Desktop's `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "datacore": {
      "command": "node",
      "args": ["/absolute/path/to/datacore/mcp-server/dist/index.js"],
      "env": { "CORE_API_URL": "http://localhost:3010/api/v1" }
    }
  }
}
```

## Using it with other tool-calling clients

Any MCP client, or any agent framework with tool/function-calling support (e.g. a local Llama model served
via [Ollama](https://ollama.com), which exposes an OpenAI-style `tools`/`tool_calls` chat API), can drive
these tools the same way: list them, pass their JSON-schema `inputSchema` as the available tools, and
execute whichever one the model calls by name through this server. Nothing about the server is
Claude-specific.
