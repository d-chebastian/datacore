export type ResourceType = 'PDF' | 'GITHUB_REPO' | 'CSV' | 'AUDIO' | 'MARKDOWN';
export type ResourceStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
export type ArtifactType = 'VECTOR' | 'GRAPH' | 'SUMMARY' | 'REPO_ANALYSIS';

export interface Artifact {
  id: string;
  type: ArtifactType;
  producing_plugin_id: string;
  external_ref: string;
  created_at: string;
  updated_at: string;
}

export interface Resource {
  id: string;
  name: string;
  type: ResourceType;
  status: ResourceStatus;
  // Whether an MCP server should expose this resource's artifacts to an LLM — purely a visibility
  // flag, doesn't affect pipeline processing (see docs/reference/data-model.md).
  is_enabled: boolean;
  source_type: 'UPLOAD' | 'URL';
  source_uri: string | null; // null for UPLOAD sources — see backend/src/models/resource.ts's toResourceDto
  failure_reason: string | null;
  no_matching_pipeline: boolean;
  artifacts: Artifact[];
  created_at: string;
  updated_at: string;
}

export interface PipelineStep {
  id?: string;
  position: number;
  plugin_id: string;
  max_attempts?: number;
  backoff_seconds?: number;
  timeout_seconds?: number;
}

export interface Pipeline {
  id: string;
  name: string;
  trigger_type: ResourceType;
  steps: PipelineStep[];
  created_at: string;
  updated_at: string;
}

export interface Plugin {
  id: string;
  name: string;
  description: string;
  author: string;
  version: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ApiError {
  error: { code: string; message: string; details?: unknown };
}

export type ArtifactContent =
  | { id: string; type: ArtifactType; producing_plugin_id: string; external_ref: string; content_type: 'text'; content: string }
  | { id: string; type: ArtifactType; producing_plugin_id: string; external_ref: string; content_type: 'json'; content: unknown }
  | {
      id: string;
      type: ArtifactType;
      producing_plugin_id: string;
      external_ref: string;
      content_type: 'vector';
      content: { dimensions: number; vector: number[] | null; payload: Record<string, unknown> | null };
    };

const BASE = '/api/v1';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      ...(init?.body && !(init.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as ApiError | null;
    throw new Error(body?.error?.message || `Request failed with status ${res.status}`);
  }
  if (res.status === 204) return undefined as unknown as T;
  return (await res.json()) as T;
}

export const api = {
  resources: {
    list: (q?: string) => request<Resource[]>(`/resources${q ? `?q=${encodeURIComponent(q)}` : ''}`),
    get: (id: string) => request<Resource>(`/resources/${id}`),
    create: (body: { name: string; type: ResourceType; source: { kind: 'UPLOAD'; file: File } | { kind: 'URL'; url: string } }) => {
      if (body.source.kind === 'URL') {
        return request<Resource>('/resources', {
          method: 'POST',
          body: JSON.stringify({ name: body.name, type: body.type, source: body.source }),
        });
      }
      const form = new FormData();
      form.append('name', body.name);
      form.append('type', body.type);
      form.append('sourceKind', 'UPLOAD');
      form.append('file', body.source.file);
      return request<Resource>('/resources', { method: 'POST', body: form });
    },
    update: (id: string, body: { name?: string }) =>
      request<Resource>(`/resources/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    reprocess: (id: string) => request<Resource>(`/resources/${id}/reprocess`, { method: 'POST' }),
    toggle: (id: string) => request<Resource>(`/resources/${id}/toggle`, { method: 'PUT' }),
    remove: (id: string) => request<void>(`/resources/${id}`, { method: 'DELETE' }),
    getArtifactContent: (resourceId: string, artifactId: string) =>
      request<ArtifactContent>(`/resources/${resourceId}/artifacts/${artifactId}`),
  },
  pipelines: {
    list: () => request<Pipeline[]>('/pipelines'),
    create: (body: { name: string; trigger_type: ResourceType; steps: PipelineStep[] }) =>
      request<Pipeline>('/pipelines', { method: 'POST', body: JSON.stringify(body) }),
    update: (id: string, body: { name?: string; steps: PipelineStep[] }) =>
      request<Pipeline>(`/pipelines/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
    remove: (id: string) => request<void>(`/pipelines/${id}`, { method: 'DELETE' }),
  },
  plugins: {
    list: () => request<Plugin[]>('/plugins'),
    toggle: (id: string) => request<Plugin>(`/plugins/${id}/toggle`, { method: 'PUT' }),
    remove: (id: string) => request<void>(`/plugins/${id}`, { method: 'DELETE' }),
  },
};
