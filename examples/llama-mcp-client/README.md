# Example: A local Llama agent using DataCore's MCP server

A small, self-contained demo showing that DataCore's [MCP server](../../mcp-server) works with **any**
tool-calling client — not just Claude. This one drives a local Llama model through
[Ollama](https://ollama.com)'s OpenAI-style `tools`/`tool_calls` API, letting it look up real resources and
artifacts from a running DataCore instance to answer a question.

## What it does

1. Spawns the DataCore MCP server as a subprocess and lists its tools (`list_resources`, `search_resources`,
   `get_resource`, `get_artifact_content`).
2. Passes those tools to a local Llama model via Ollama's `/api/chat`.
3. Loops: whenever the model responds with a tool call, executes it against the real DataCore instance
   through MCP, feeds the result back, and lets the model continue — until it gives a final answer instead
   of another tool call.

None of this is Claude-specific. Swap Ollama's `/api/chat` for any other tool-calling API and the MCP side
(spawning the server, calling its tools) is unchanged — that's the point of MCP as a standard.

## Prerequisites

- A running DataCore instance with `core-api` reachable (see the repo root `RUNNING.md` — the default
  `docker compose up -d` gets you `http://localhost:3010/api/v1`) and at least one `Completed` resource with
  its **LLM Access** toggle on (the default for a new resource).
- The DataCore MCP server built: `cd ../../mcp-server && npm install && npm run build`.
- [Ollama](https://ollama.com) installed and running (`ollama serve`), with a tool-calling-capable model
  pulled:
  ```bash
  ollama pull llama3.2
  ```
  (Llama 3.1/3.2 and newer support tool calling; older Llama models don't — Ollama will otherwise just
  answer without ever calling a tool.)

## Running it

```bash
npm install
npm run build
npm start -- "What resources do I have, and what does the most recent one contain?"
```

Expected output looks like:

```
→ Connecting to the DataCore MCP server (.../mcp-server/dist/index.js)...
→ Got 4 tool(s) from DataCore: list_resources, search_resources, get_resource, get_artifact_content

💬 What resources do I have, and what does the most recent one contain?

  🔧 calling list_resources({})
  🔧 calling get_artifact_content({"resource_id":"...","artifact_id":"..."})
🦙 You have 2 resources: "Hello World README" (Markdown, Completed) and "My GitHub Profile"
   (GitHub Repo, Completed). The most recent one's summary says: "..."
```

## Seeing the LLM Access toggle in action

Turn a resource's **LLM Access** off in the Web UI (Resources view), then ask about it by name:

```bash
npm start -- "What does the resource named '<name>' contain?"
```

The model will call `get_resource` or `search_resources`, the tool will refuse or omit it, and — because
of the system prompt's instruction not to invent an answer — Llama should tell you the resource isn't
accessible rather than fabricating its contents. (Small local models don't always follow instructions
perfectly; if it still guesses, that's a model behavior limitation, not an MCP server bug — the tool
result it received was the refusal, visible in the `🔧 calling ...` log line above the final answer.)

## Configuration

| Env var | Default | Purpose |
|---|---|---|
| `OLLAMA_HOST` | `http://localhost:11434` | Where Ollama's API is listening |
| `OLLAMA_MODEL` | `llama3.2` | Which pulled model to use |
| `CORE_API_URL` | `http://localhost:3010/api/v1` | Which DataCore instance the MCP server queries |
| `MCP_SERVER_PATH` | `../../mcp-server/dist/index.js` | Path to the built MCP server entrypoint |

## Extracting this as its own repo

This example intentionally only depends on the published `@modelcontextprotocol/sdk` package plus a
sibling copy of `mcp-server/` — to publish it standalone, copy both this directory and `mcp-server/` into
a new repo (keeping the relative path, or overriding `MCP_SERVER_PATH`), and point `CORE_API_URL` at
whatever DataCore instance you want to demo against.
