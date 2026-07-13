const BASE_URL = process.env.CORE_API_URL || 'http://localhost:3010/api/v1';

export interface Artifact {
  id: string;
  type: string;
  external_ref: string;
}

export interface Resource {
  id: string;
  name: string;
  type: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  is_enabled: boolean;
  source_type: 'UPLOAD' | 'URL';
  source_uri: string | null;
  failure_reason: string | null;
  no_matching_pipeline: boolean;
  artifacts: Artifact[];
}

export interface RepoAnalysis {
  username: string;
  scanned_at: string;
  repo_count: number;
  repos: {
    name: string;
    description: string | null;
    url: string;
    language: string | null;
    stars: number;
    forks: number;
    is_fork: boolean;
    updated_at: string;
    default_branch?: string;
    // Populated for the plugin's own top-N-by-stars candidates (see MAX_ANALYZED_REPOS on the plugin) —
    // null for the rest, not missing-but-should-be-there.
    readme?: string | null;
    files?: string[] | null;
    key_files?: Record<string, string> | null;
  }[];
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: { ...(init?.body ? { 'Content-Type': 'application/json' } : {}), ...init?.headers },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new Error(body?.error?.message || `DataCore API request failed with status ${res.status}`);
  }
  return (await res.json()) as T;
}

export async function findResourceBySourceUri(sourceUri: string): Promise<Resource | null> {
  const resources = await request<Resource[]>(`/resources`);
  return resources.find((r) => r.source_uri === sourceUri) ?? null;
}

export async function createGithubProfileResource(name: string, profileUrl: string): Promise<Resource> {
  return request<Resource>('/resources', {
    method: 'POST',
    body: JSON.stringify({ name, type: 'GITHUB_REPO', source: { kind: 'URL', url: profileUrl } }),
  });
}

export async function createMarkdownResource(name: string, url: string): Promise<Resource> {
  return request<Resource>('/resources', {
    method: 'POST',
    body: JSON.stringify({ name, type: 'MARKDOWN', source: { kind: 'URL', url } }),
  });
}

export async function getResource(id: string): Promise<Resource> {
  return request<Resource>(`/resources/${id}`);
}

export async function getRepoAnalysis(resourceId: string, artifactId: string): Promise<RepoAnalysis> {
  const artifact = await request<{ content_type: string; content: RepoAnalysis }>(
    `/resources/${resourceId}/artifacts/${artifactId}`,
  );
  return artifact.content;
}

export async function getSummaryText(resourceId: string, artifactId: string): Promise<string> {
  const artifact = await request<{ content_type: string; content: string }>(
    `/resources/${resourceId}/artifacts/${artifactId}`,
  );
  return artifact.content;
}
