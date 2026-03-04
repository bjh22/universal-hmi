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
  getTagValues: () => request<Record<string, any>>('/tags/values'),
  writeTag: (name: string, value: unknown) =>
    request('/tags/values/' + encodeURIComponent(name) + '/write', {
      method: 'POST',
      body: JSON.stringify({ value }),
    }),

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

  // Trends
  getTrendData: (tagId: number, hours = 1) =>
    request<any[]>(`/trends/data/${tagId}?hours=${hours}`),
  getTrendViews: () => request<any[]>('/trends/views'),

  // Data Sources
  getDataSources: () => request<any[]>('/datasources/'),

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
