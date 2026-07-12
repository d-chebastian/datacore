const BASE_URL = process.env.CORE_API_URL || 'http://localhost:3010/api/v1';

export interface Artifact {
  id: string;
  type: string;
  producing_plugin_id: string;
  external_ref: string;
  created_at: string;
  updated_at: string;
}

export interface Resource {
  id: string;
  name: string;
  type: string;
  status: string;
  is_enabled: boolean;
  source_type: 'UPLOAD' | 'URL';
  source_uri: string | null;
  failure_reason: string | null;
  no_matching_pipeline: boolean;
  artifacts: Artifact[];
  created_at: string;
  updated_at: string;
}

export type ArtifactContent =
  | { content_type: 'text'; content: string }
  | { content_type: 'json'; content: unknown }
  | { content_type: 'vector'; content: { dimensions: number; vector: number[] | null; payload: Record<string, unknown> | null } };

async function request<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`);
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new Error(body?.error?.message || `DataCore API request failed with status ${res.status}`);
  }
  return (await res.json()) as T;
}

export async function listResources(q?: string): Promise<Resource[]> {
  return request<Resource[]>(`/resources${q ? `?q=${encodeURIComponent(q)}` : ''}`);
}

export async function getResource(id: string): Promise<Resource> {
  return request<Resource>(`/resources/${id}`);
}

export async function getArtifactContent(resourceId: string, artifactId: string): Promise<ArtifactContent> {
  return request<ArtifactContent>(`/resources/${resourceId}/artifacts/${artifactId}`);
}
