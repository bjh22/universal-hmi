import type {
  Tag,
  TagLabel,
  TagValue,
  AlarmData,
  ScreenData,
  UserData,
  UserListEntry,
  BrowsedTag,
  JobData,
  JobHistoryEntry,
  DataSourceData,
  TrendDataPoint,
  AuditEntry,
  ProductionRun,
  ProjectData,
  ProjectDetail,
  MachineProfile,
  ImportPreviewTag,
  ImportPreviewResponse,
  ImportResultResponse,
  IntegrationType,
  IntegrationData,
} from '../types/index';

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
    request<{ access_token: string; user: UserData }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),
  pinLogin: (pin: string) =>
    request<{ access_token: string; user: UserData }>('/auth/pin-login', {
      method: 'POST',
      body: JSON.stringify({ pin }),
    }),

  // Tags
  getTags: (projectId?: number) =>
    request<Tag[]>(`/tags/${projectId != null ? `?project_id=${projectId}` : ''}`),
  getTagByName: (name: string) => request<Tag>(`/tags/by-name/${encodeURIComponent(name)}`),
  createTag: (data: Partial<Tag>) =>
    request('/tags/', { method: 'POST', body: JSON.stringify(data) }),
  updateTag: (id: number, data: Partial<Tag>) =>
    request(`/tags/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteTag: (id: number) =>
    request(`/tags/${id}`, { method: 'DELETE' }),
  renameTagReferences: (oldName: string, newName: string) =>
    request<{ updated_screens: number }>('/tags/rename-references', {
      method: 'POST',
      body: JSON.stringify({ old_name: oldName, new_name: newName }),
    }),
  bulkDeleteTags: (tagIds: number[]) =>
    request<{ deleted: number }>('/tags/bulk/delete', { method: 'POST', body: JSON.stringify({ tag_ids: tagIds }) }),
  bulkAddLabels: (tagIds: number[], labelIds: number[]) =>
    request<{ updated: number }>('/tags/bulk/add-labels', { method: 'POST', body: JSON.stringify({ tag_ids: tagIds, label_ids: labelIds }) }),
  bulkRemoveLabels: (tagIds: number[], labelIds: number[]) =>
    request<{ updated: number }>('/tags/bulk/remove-labels', { method: 'POST', body: JSON.stringify({ tag_ids: tagIds, label_ids: labelIds }) }),
  bulkUpdateTags: (tagIds: number[], fields: Record<string, unknown>) =>
    request<{ updated: number }>('/tags/bulk/update', { method: 'POST', body: JSON.stringify({ tag_ids: tagIds, fields }) }),
  importTagsCsv: (tags: Partial<Tag>[], dataSourceId?: number | null) =>
    request<{ imported: number; names: string[] }>('/tags/import/csv', {
      method: 'POST',
      body: JSON.stringify({ tags, ...(dataSourceId != null ? { data_source_id: dataSourceId } : {}) }),
    }),
  importTagsCodesys: (xml: string, prefix?: string, names?: string[], dataSourceId?: number | null) =>
    request<{ imported: number; names: string[] }>('/tags/import/codesys', {
      method: 'POST',
      body: JSON.stringify({ xml, prefix: prefix || '', ...(names ? { names } : {}), ...(dataSourceId != null ? { data_source_id: dataSourceId } : {}) }),
    }),
  importTagsRslogix500: (csv: string, prefix?: string, names?: string[], dataSourceId?: number | null) =>
    request<{ imported: number; names: string[] }>('/tags/import/rslogix500', {
      method: 'POST',
      body: JSON.stringify({ csv, prefix: prefix || '', ...(names ? { names } : {}), ...(dataSourceId != null ? { data_source_id: dataSourceId } : {}) }),
    }),
  previewCodesysImport: (xml: string, prefix?: string) =>
    request<{ total: number; tags: ImportPreviewTag[]; groups: Record<string, number>; enum_count: number }>('/tags/import/codesys/preview', {
      method: 'POST',
      body: JSON.stringify({ xml, prefix: prefix || '' }),
    }),
  previewRslogix500Import: (csv: string, prefix?: string) =>
    request<{ total: number; tags: ImportPreviewTag[]; groups: Record<string, number> }>('/tags/import/rslogix500/preview', {
      method: 'POST',
      body: JSON.stringify({ csv, prefix: prefix || '' }),
    }),
  getTagValues: () => request<Record<string, TagValue>>('/tags/values'),
  writeTag: (name: string, value: unknown) =>
    request('/tags/values/' + encodeURIComponent(name) + '/write', {
      method: 'POST',
      body: JSON.stringify({ value }),
    }),

  // Tag Labels
  getTagLabels: () => request<TagLabel[]>('/tags/labels'),
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
  getActiveAlarms: () => request<AlarmData[]>('/alarms/active'),
  getAlarmHistory: (limit = 100) => request<AlarmData[]>(`/alarms/history?limit=${limit}`),
  acknowledgeAlarm: (id: number) =>
    request(`/alarms/${id}/acknowledge`, { method: 'POST' }),

  // Screens
  getScreens: () => request<ScreenData[]>('/screens/'),
  getScreenBySlug: (slug: string) => request<ScreenData>(`/screens/by-slug/${slug}`),
  saveScreen: (id: number, data: Record<string, unknown>) =>
    request(`/screens/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  createScreen: (data: Record<string, unknown>) =>
    request('/screens/', { method: 'POST', body: JSON.stringify(data) }),
  deleteScreen: (id: number) =>
    request(`/screens/${id}`, { method: 'DELETE' }),

  // Jobs
  getJobs: () => request<JobData[]>('/jobs/'),
  getJob: (id: number) => request<JobData>(`/jobs/${id}`),
  createJob: (data: Record<string, unknown>) =>
    request('/jobs/', { method: 'POST', body: JSON.stringify(data) }),
  updateJob: (id: number, data: Record<string, unknown>) =>
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
    request<JobHistoryEntry[]>(`/jobs/${id}/history`),

  // Trends
  getTrendData: (tagId: number, hours = 1, start?: string, end?: string) => {
    const params = new URLSearchParams();
    if (start) {
      params.set('start', start);
      if (end) params.set('end', end);
    } else {
      params.set('hours', String(hours));
    }
    return request<TrendDataPoint[]>(`/trends/data/${tagId}?${params.toString()}`);
  },
  getTrendViews: () => request<Record<string, unknown>[]>('/trends/views'),

  // Data Sources
  getDataSources: (projectId?: number) =>
    request<DataSourceData[]>(`/datasources/${projectId != null ? `?project_id=${projectId}` : ''}`),
  createDataSource: (data: Partial<DataSourceData>) =>
    request('/datasources/', { method: 'POST', body: JSON.stringify(data) }),
  updateDataSource: (id: number, data: Partial<DataSourceData>) =>
    request(`/datasources/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteDataSource: (id: number) =>
    request(`/datasources/${id}`, { method: 'DELETE' }),
  connectDataSource: (id: number) =>
    request<{ connected: boolean; address_prefix?: string }>(`/datasources/${id}/connect`, { method: 'POST' }),
  browseDataSource: (id: number) =>
    request<{ tags: BrowsedTag[]; address_prefix?: string }>(`/datasources/${id}/browse`, { method: 'POST' }),

  // Users
  getUsers: () => request<UserListEntry[]>('/users/'),
  createUser: (data: { username: string; display_name: string; password: string; role: string; login_mode?: string }) =>
    request('/users/', { method: 'POST', body: JSON.stringify(data) }),

  // Audit
  getAuditLog: (limit = 100) => request<AuditEntry[]>(`/audit/?limit=${limit}`),

  // Production
  getProductionRuns: (limit = 50) => request<ProductionRun[]>(`/production/runs?limit=${limit}`),

  // Scripts
  executeScript: (script: string) =>
    request('/scripts/execute', {
      method: 'POST',
      body: JSON.stringify({ script }),
    }),

  // Projects
  getProjects: () => request<ProjectData[]>('/projects/'),
  getProject: (id: number) => request<ProjectDetail>(`/projects/${id}`),
  getActiveProject: () => request<ProjectData | null>('/projects/active'),
  createProject: (data: { name: string; description?: string; version?: string }) =>
    request<ProjectData>('/projects/', { method: 'POST', body: JSON.stringify(data) }),
  updateProject: (id: number, data: { name?: string; description?: string; version?: string }) =>
    request<ProjectData>(`/projects/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteProject: (id: number) =>
    request(`/projects/${id}`, { method: 'DELETE' }),
  activateProject: (id: number) =>
    request<ProjectData>(`/projects/${id}/activate`, { method: 'POST' }),
  deactivateProject: (id: number) =>
    request<ProjectData>(`/projects/${id}/deactivate`, { method: 'POST' }),
  assignAllToProject: (id: number) =>
    request<ProjectData>(`/projects/${id}/assign-all`, { method: 'POST' }),
  exportProject: (id: number) =>
    request<Record<string, unknown>>(`/projects/${id}/export`),
  importProject: (data: Record<string, unknown>) =>
    request<ProjectData>('/projects/import', { method: 'POST', body: JSON.stringify(data) }),
  previewImport: (data: Record<string, unknown>, targetProjectId?: number | null) =>
    request<ImportPreviewResponse>('/projects/import/preview', {
      method: 'POST',
      body: JSON.stringify({ data, target_project_id: targetProjectId ?? null }),
    }),
  importProjectSelective: (params: {
    data: Record<string, unknown>;
    targetProjectId?: number | null;
    nameOverride?: string;
    sections?: string[];
    conflictResolution?: Record<string, string>;
    defaultConflictResolution?: string;
  }) =>
    request<ImportResultResponse>('/projects/import', {
      method: 'POST',
      body: JSON.stringify({
        data: params.data,
        target_project_id: params.targetProjectId ?? null,
        name_override: params.nameOverride || null,
        sections: params.sections || null,
        conflict_resolution: params.conflictResolution || {},
        default_conflict_resolution: params.defaultConflictResolution || 'skip',
      }),
    }),

  // Machine Profiles
  getProfiles: (projectId: number) =>
    request<MachineProfile[]>(`/projects/${projectId}/profiles/`),
  createProfile: (projectId: number, data: { name: string; description?: string }) =>
    request<MachineProfile>(`/projects/${projectId}/profiles/`, {
      method: 'POST', body: JSON.stringify(data),
    }),
  getProfile: (projectId: number, profileId: number) =>
    request<MachineProfile>(`/projects/${projectId}/profiles/${profileId}`),
  updateProfile: (projectId: number, profileId: number, data: {
    name?: string; description?: string;
    data_source_overrides?: Record<string, { config?: Record<string, unknown> }>;
    tag_overrides?: Record<string, { address?: string }>;
  }) =>
    request<MachineProfile>(`/projects/${projectId}/profiles/${profileId}`, {
      method: 'PUT', body: JSON.stringify(data),
    }),
  deleteProfile: (projectId: number, profileId: number) =>
    request(`/projects/${projectId}/profiles/${profileId}`, { method: 'DELETE' }),
  cloneProfile: (projectId: number, profileId: number, name: string) =>
    request<MachineProfile>(`/projects/${projectId}/profiles/${profileId}/clone`, {
      method: 'POST', body: JSON.stringify({ name }),
    }),
  exportForMachine: (projectId: number, profileId: number) =>
    request<Record<string, unknown>>(`/projects/${projectId}/export?profile_id=${profileId}`),

  // Integrations
  getIntegrationTypes: () =>
    request<IntegrationType[]>('/integrations/types'),
  getIntegrations: () =>
    request<IntegrationData[]>('/integrations/'),
  createIntegration: (data: { type_name: string; name: string; enabled: boolean; config: Record<string, unknown> }) =>
    request<IntegrationData>('/integrations/', { method: 'POST', body: JSON.stringify(data) }),
  updateIntegration: (id: number, data: { name: string; enabled: boolean; config: Record<string, unknown> }) =>
    request<IntegrationData>(`/integrations/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteIntegration: (id: number) =>
    request(`/integrations/${id}`, { method: 'DELETE' }),

  // Zebra printer
  zebraGetStatus: () =>
    request<Record<string, unknown>>('/integrations/zebra/status'),
  zebraSendTestLabel: () =>
    request('/integrations/zebra/test-label', { method: 'POST' }),
  zebraSendZpl: (zpl: string) =>
    request('/integrations/zebra/send-zpl', { method: 'POST', body: JSON.stringify({ zpl }) }),
  zebraSetSpeed: (speed: number) =>
    request('/integrations/zebra/speed', { method: 'POST', body: JSON.stringify({ speed }) }),
  zebraSetDarkness: (darkness: number) =>
    request('/integrations/zebra/darkness', { method: 'POST', body: JSON.stringify({ darkness }) }),

  // Cognex DataMan
  datamanGetStatus: () =>
    request<Record<string, unknown>>('/integrations/dataman/status'),
  datamanGetImage: async (): Promise<Blob | null> => {
    const token = localStorage.getItem('hmi_token');
    const headers: HeadersInit = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(`${BASE}/integrations/dataman/image`, { headers });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(await res.text());
    return res.blob();
  },
  datamanTrigger: () =>
    request('/integrations/dataman/trigger', { method: 'POST' }),

  // Branding
  getBranding: () =>
    request<{ site_title: string; has_favicon: boolean }>('/branding/'),
  updateBranding: (data: { site_title?: string; favicon?: string }) =>
    request<{ site_title: string; has_favicon: boolean }>('/branding/', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  // Health
  health: () => request<Record<string, unknown>>('/health'),
};
