const BASE = '/api';

function getHeaders(): HeadersInit {
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  const token = localStorage.getItem('hmi_token');
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: getHeaders(),
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `HTTP ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  // Auth
  login: (username: string, password: string) =>
    request<{ access_token: string; user: any }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),
  pinLogin: (pin: string) =>
    request<{ access_token: string; user: any }>('/auth/pin-login', {
      method: 'POST',
      body: JSON.stringify({ pin }),
    }),

  // Tags
  getTags: () => request<any[]>('/tags/'),
  createTag: (data: any) =>
    request('/tags/', { method: 'POST', body: JSON.stringify(data) }),
  updateTag: (id: number, data: any) =>
    request(`/tags/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteTag: (id: number) =>
    request(`/tags/${id}`, { method: 'DELETE' }),
  importTagsCsv: (tags: any[]) =>
    request<{ imported: number; names: string[] }>('/tags/import/csv', {
      method: 'POST',
      body: JSON.stringify({ tags }),
    }),
  getTagValues: () => request<Record<string, any>>('/tags/values'),
  writeTag: (name: string, value: unknown) =>
    request('/tags/values/' + encodeURIComponent(name) + '/write', {
      method: 'POST',
      body: JSON.stringify({ value }),
    }),

  // Tag Labels
  getTagLabels: () => request<any[]>('/tags/labels'),
  createTagLabel: (data: { name: string; color?: string; description?: string }) =>
    request('/tags/labels', { method: 'POST', body: JSON.stringify(data) }),
  updateTagLabel: (id: number, data: { name: string; color?: string; description?: string }) =>
    request(`/tags/labels/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteTagLabel: (id: number) =>
    request(`/tags/labels/${id}`, { method: 'DELETE' }),
  assignTagLabel: (tagId: number, labelId: number) =>
    request(`/tags/${tagId}/labels/${labelId}`, { method: 'POST' }),
  removeTagLabel: (tagId: number, labelId: number) =>
    request(`/tags/${tagId}/labels/${labelId}`, { method: 'DELETE' }),

  // Alarms
  getActiveAlarms: () => request<any[]>('/alarms/active'),
  getAlarmHistory: (limit = 100) => request<any[]>(`/alarms/history?limit=${limit}`),
  acknowledgeAlarm: (id: number) =>
    request(`/alarms/${id}/acknowledge`, { method: 'POST' }),

  // Screens
  getScreens: () => request<any[]>('/screens/'),
  getScreenBySlug: (slug: string) => request<any>(`/screens/by-slug/${slug}`),
  saveScreen: (id: number, data: any) =>
    request(`/screens/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  createScreen: (data: any) =>
    request('/screens/', { method: 'POST', body: JSON.stringify(data) }),
  deleteScreen: (id: number) =>
    request(`/screens/${id}`, { method: 'DELETE' }),

  // Jobs
  getJobs: () => request<any[]>('/jobs/'),
  getJob: (id: number) => request<any>(`/jobs/${id}`),
  createJob: (data: any) =>
    request('/jobs/', { method: 'POST', body: JSON.stringify(data) }),
  updateJob: (id: number, data: any) =>
    request(`/jobs/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteJob: (id: number) =>
    request(`/jobs/${id}`, { method: 'DELETE' }),
  downloadJob: (id: number) =>
    request(`/jobs/${id}/download`, { method: 'POST' }),
  uploadJobFromMachine: (name: string, tagNames: string[]) =>
    request('/jobs/upload-from-machine', {
      method: 'POST',
      body: JSON.stringify({ name, tag_names: tagNames }),
    }),
  getJobHistory: (id: number) =>
    request<any[]>(`/jobs/${id}/history`),

  // Trends
  getTrendData: (tagId: number, hours = 1) =>
    request<any[]>(`/trends/data/${tagId}?hours=${hours}`),
  getTrendViews: () => request<any[]>('/trends/views'),

  // Data Sources
  getDataSources: () => request<any[]>('/datasources/'),
  createDataSource: (data: any) =>
    request('/datasources/', { method: 'POST', body: JSON.stringify(data) }),
  updateDataSource: (id: number, data: any) =>
    request(`/datasources/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteDataSource: (id: number) =>
    request(`/datasources/${id}`, { method: 'DELETE' }),
  connectDataSource: (id: number) =>
    request<{ connected: boolean }>(`/datasources/${id}/connect`, { method: 'POST' }),
  browseDataSource: (id: number) =>
    request<{ tags: any[] }>(`/datasources/${id}/browse`, { method: 'POST' }),

  // Users
  getUsers: () => request<any[]>('/users/'),
  createUser: (data: any) =>
    request('/users/', { method: 'POST', body: JSON.stringify(data) }),

  // Audit
  getAuditLog: (limit = 100) => request<any[]>(`/audit/?limit=${limit}`),

  // Production
  getProductionRuns: (limit = 50) => request<any[]>(`/production/runs?limit=${limit}`),

  // Scripts
  executeScript: (script: string) =>
    request('/scripts/execute', {
      method: 'POST',
      body: JSON.stringify({ script }),
    }),

  // Health
  health: () => request<any>('/health'),
};
