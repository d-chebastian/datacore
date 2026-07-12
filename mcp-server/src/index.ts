#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { getArtifactContent, getResource, listResources, Resource } from './coreApiClient.js';

const RESOURCE_TYPES = ['PDF', 'GITHUB_REPO', 'CSV', 'AUDIO', 'MARKDOWN'] as const;
const RESOURCE_STATUSES = ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'] as const;

function summarize(r: Resource) {
  return {
    id: r.id,
    name: r.name,
    type: r.type,
    status: r.status,
    artifacts: r.artifacts.map((a) => ({ id: a.id, type: a.type })),
  };
}

// The single enforcement point for the is_enabled toggle in DataCore's Resources view: a resource
// switched "off" there is invisible to every tool below, even by direct id lookup — the toggle has no
// effect on DataCore's own pipeline processing (see docs/reference/data-model.md), only on this server.
function assertEnabled(r: Resource) {
  if (!r.is_enabled) {
    throw new Error(
      `Resource "${r.name}" (${r.id}) is disabled for LLM access — its owner turned off "LLM Access" in DataCore's Resources view.`,
    );
  }
}

const server = new McpServer({ name: 'datacore-mcp-server', version: '0.1.0' });

server.registerTool(
  'list_resources',
  {
    title: 'List DataCore resources',
    description:
      'Lists resources in the DataCore Knowledge Warehouse that are enabled for LLM access, optionally filtered by type and/or status. Returns a summary (id, name, type, status, artifact ids/types) — call get_artifact_content for the actual content of an artifact.',
    inputSchema: {
      type: z.enum(RESOURCE_TYPES).optional().describe('Filter to one resource type'),
      status: z.enum(RESOURCE_STATUSES).optional().describe('Filter to one status'),
    },
  },
  async ({ type, status }) => {
    const resources = (await listResources())
      .filter((r) => r.is_enabled)
      .filter((r) => !type || r.type === type)
      .filter((r) => !status || r.status === status);
    return { content: [{ type: 'text', text: JSON.stringify(resources.map(summarize), null, 2) }] };
  },
);

server.registerTool(
  'search_resources',
  {
    title: 'Search DataCore resources by name',
    description:
      'Searches resources by a name substring, restricted to those enabled for LLM access. Use this to find a resource before calling get_resource or get_artifact_content.',
    inputSchema: {
      query: z.string().describe('Substring to search for in resource names'),
    },
  },
  async ({ query }) => {
    const resources = (await listResources(query)).filter((r) => r.is_enabled);
    return { content: [{ type: 'text', text: JSON.stringify(resources.map(summarize), null, 2) }] };
  },
);

server.registerTool(
  'get_resource',
  {
    title: 'Get one DataCore resource',
    description:
      'Fetches metadata and the list of generated artifacts for one resource by id. Refuses if the resource is disabled for LLM access.',
    inputSchema: {
      id: z.string().describe('The resource id, from list_resources or search_resources'),
    },
  },
  async ({ id }) => {
    const resource = await getResource(id);
    assertEnabled(resource);
    return { content: [{ type: 'text', text: JSON.stringify(summarize(resource), null, 2) }] };
  },
);

server.registerTool(
  'get_artifact_content',
  {
    title: 'Get the content of a DataCore artifact',
    description:
      "Fetches the actual processed content of one artifact (a summary's text, an embedding vector, or a structured analysis) that a pipeline generated for a resource. Refuses if the owning resource is disabled for LLM access.",
    inputSchema: {
      resource_id: z.string().describe('The resource id that owns the artifact'),
      artifact_id: z.string().describe('The artifact id, from list_resources/search_resources/get_resource'),
    },
  },
  async ({ resource_id, artifact_id }) => {
    const resource = await getResource(resource_id);
    assertEnabled(resource);
    const artifact = await getArtifactContent(resource_id, artifact_id);
    return { content: [{ type: 'text', text: JSON.stringify(artifact, null, 2) }] };
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('DataCore MCP server running on stdio');
}

main().catch((error) => {
  console.error('DataCore MCP server error:', error);
  process.exit(1);
});
