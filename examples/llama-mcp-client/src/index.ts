#!/usr/bin/env node
/**
 * Runs a local Llama model (via Ollama) as a tool-calling agent against the DataCore MCP server.
 * Shows that the server works with any tool-calling-capable client, not just Claude — Ollama's
 * /api/chat speaks the same OpenAI-style `tools` / `tool_calls` shape most agent frameworks expect.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.2';
const CORE_API_URL = process.env.CORE_API_URL || 'http://localhost:3010/api/v1';
const MCP_SERVER_PATH = process.env.MCP_SERVER_PATH || path.resolve(__dirname, '../../../mcp-server/dist/index.js');
const MAX_TOOL_ROUNDS = 6;

interface OllamaToolCall {
  function: { name: string; arguments: Record<string, unknown> };
}

interface OllamaMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: OllamaToolCall[];
  tool_name?: string;
}

interface OllamaChatResponse {
  message: OllamaMessage;
  done: boolean;
}

async function chat(messages: OllamaMessage[], tools: unknown[]): Promise<OllamaMessage> {
  let res: Response;
  try {
    res = await fetch(`${OLLAMA_HOST}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: OLLAMA_MODEL, messages, tools, stream: false }),
    });
  } catch (err) {
    throw new Error(
      `Could not reach Ollama at ${OLLAMA_HOST} (${(err as Error).message}) — is "ollama serve" running?`,
    );
  }
  if (!res.ok) {
    throw new Error(
      `Ollama request failed with ${res.status}: ${await res.text()} — is "ollama serve" running and has "ollama pull ${OLLAMA_MODEL}" completed?`,
    );
  }
  const body = (await res.json()) as OllamaChatResponse;
  return body.message;
}

async function main() {
  const question = process.argv.slice(2).join(' ') || 'What resources do I have, and what does the most recent one contain?';

  console.log(`→ Connecting to the DataCore MCP server (${MCP_SERVER_PATH})...`);
  const transport = new StdioClientTransport({
    command: 'node',
    args: [MCP_SERVER_PATH],
    env: { ...process.env, CORE_API_URL },
  });
  const mcpClient = new Client({ name: 'datacore-llama-example', version: '0.1.0' });
  await mcpClient.connect(transport);

  const { tools: mcpTools } = await mcpClient.listTools();
  console.log(
    `→ Got ${mcpTools.length} tool(s) from DataCore: ${mcpTools.map((t) => t.name).join(', ')}`,
  );

  const ollamaTools = mcpTools.map((tool) => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema,
    },
  }));

  const messages: OllamaMessage[] = [
    {
      role: 'system',
      content:
        'You are an assistant with access to tools that query a DataCore Knowledge Warehouse. ' +
        'Use them to look up real resources and artifacts before answering — do not guess. ' +
        'Some resources are disabled for LLM access; if a tool refuses one, tell the user it exists but is not accessible rather than making up its content.',
    },
    { role: 'user', content: question },
  ];

  console.log(`\n💬 ${question}\n`);

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const message = await chat(messages, ollamaTools);
    messages.push(message);

    if (!message.tool_calls || message.tool_calls.length === 0) {
      console.log(`🦙 ${message.content}`);
      await mcpClient.close();
      return;
    }

    for (const call of message.tool_calls) {
      console.log(`  🔧 calling ${call.function.name}(${JSON.stringify(call.function.arguments)})`);
      let resultText: string;
      try {
        const result = await mcpClient.callTool({ name: call.function.name, arguments: call.function.arguments });
        const content = result.content as Array<{ type: string; text?: string }>;
        resultText = content.map((c) => c.text ?? '').join('\n');
      } catch (err) {
        resultText = `Error: ${(err as Error).message}`;
      }
      messages.push({ role: 'tool', tool_name: call.function.name, content: resultText });
    }
  }

  console.log('⚠️  Stopped after too many tool-call rounds without a final answer.');
  await mcpClient.close();
}

main().catch((error) => {
  console.error('Example failed:', error);
  process.exit(1);
});
