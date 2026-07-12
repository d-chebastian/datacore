export interface PublicUser {
  id: string;
  username: string;
  email_verified: boolean;
  created_at: string;
}

export interface PluginListing {
  id: string;
  name: string;
  description: string;
  author: string;
  version: string;
  repo_url: string;
  docker_image: string | null;
  homepage_url: string | null;
  tags: string[];
  created_at: string;
  updated_at: string;
}

export interface CreateListingInput {
  name: string;
  description: string;
  version: string;
  repo_url: string;
  docker_image?: string;
  homepage_url?: string;
  tags?: string[];
}

export type BundleResourceType = 'PDF' | 'GITHUB_REPO' | 'CSV' | 'AUDIO' | 'MARKDOWN';

export interface BundleStep {
  plugin_name: string;
  plugin_repo_url: string;
  max_attempts?: number;
  backoff_seconds?: number;
  timeout_seconds?: number;
}

export interface BundlePipeline {
  name: string;
  trigger_type: BundleResourceType;
  steps: BundleStep[];
}

export interface BundleResource {
  name: string;
  type: BundleResourceType;
  source_uri: string;
}

export interface Bundle {
  id: string;
  user_id: string | null;
  name: string;
  description: string;
  author: string;
  pipelines: BundlePipeline[];
  resources: BundleResource[];
  tags: string[];
  created_at: string;
}

export interface CreateBundleInput {
  name: string;
  description: string;
  pipelines: BundlePipeline[];
  resources: BundleResource[];
  tags?: string[];
}

const BASE = '/registry/api/v1';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { ...(init?.body ? { 'Content-Type': 'application/json' } : {}), ...init?.headers },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null;
    const err = new Error(body?.error?.message || `Request failed with status ${res.status}`);
    (err as Error & { code?: string }).code = body?.error?.code;
    throw err;
  }
  if (res.status === 204) return undefined as unknown as T;
  return (await res.json()) as T;
}

export const communityAuthApi = {
  me: () => request<{ user: PublicUser }>('/auth/me'),
  login: (email: string, password: string) =>
    request<{ user: PublicUser }>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  register: (email: string, username: string, password: string) =>
    request<{ user: PublicUser; message: string }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, username, password }),
    }),
  logout: () => request<void>('/auth/logout', { method: 'POST' }),
};

export const registryApi = {
  list: (q?: string, tag?: string) => {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (tag) params.set('tag', tag);
    const qs2 = params.toString();
    return request<PluginListing[]>(`/registry/plugins${qs2 ? `?${qs2}` : ''}`);
  },
  create: (input: CreateListingInput) => request<PluginListing>('/registry/plugins', { method: 'POST', body: JSON.stringify(input) }),
};

export const bundlesApi = {
  list: (q?: string, triggerType?: string) => {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (triggerType) params.set('trigger_type', triggerType);
    const qs = params.toString();
    return request<Bundle[]>(`/registry/bundles${qs ? `?${qs}` : ''}`);
  },
  get: (id: string) => request<Bundle>(`/registry/bundles/${id}`),
  create: (input: CreateBundleInput) => request<Bundle>('/registry/bundles', { method: 'POST', body: JSON.stringify(input) }),
};
