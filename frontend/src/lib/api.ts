/**
 * api.ts — Centralized API client.
 *
 * All HTTP calls to the backend go through this file. Having a single place for
 * API logic means authentication headers, error handling, and base URL configuration
 * are defined once rather than duplicated in every component that needs data.
 */
import type {
  Tag,
  TagLabel,
  TagValue,
  AlarmData,
  ScreenData,
  UserData,
  UserListEntry,
  BrowsedTag,
  BrowsedNode,
  JobData,
  JobHistoryEntry,
  DataSourceData,
  TrendDataPoint,
  AuditEntry,
  ReportSummary,
  DowntimePeriod,
  DowntimeSummary,
  ReasonCode,
  ReportBucket,
  ProductionSettings,
  ProjectData,
  ProjectDetail,
  ImportPreviewTag,
  ImportResult,
  ImportConflictMode,
  ImportPreviewResponse,
  ImportResultResponse,
  IntegrationType,
  IntegrationData,
  LogEntry,
  ServiceConfig,
} from '../types/index';

// Using a relative URL (no "http://...") means requests go to the same host that
// served the page. In development, Vite's proxy forwards /api to the backend on
// port 8080. In production, the backend serves the frontend directly — so this
// relative path works in both environments without any config changes.
const BASE = '/api';

// getHeaders builds the HTTP headers sent with every request. The key part is
// the Authorization header: "Bearer <token>" is an HTTP standard where we send
// the JWT (JSON Web Token) we received at login. The backend verifies this token
// to identify the user and check permissions.
function getHeaders(): HeadersInit {
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  const token = localStorage.getItem('hmi_token');
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

// request<T> is a "generic" function — the <T> is a TypeScript type parameter that
// lets each caller specify what shape the response JSON will have. For example,
// request<Tag[]>('/tags/') tells TypeScript the result will be an array of Tag objects,
// so you get autocomplete and type checking on the response — without needing a
// separate function for every endpoint.
//
// Error handling pattern: if the HTTP status is not "ok" (200-299), we try to extract
// a detail message from the JSON body (the FastAPI convention), then throw an Error.
// Callers use .catch() or try/catch to handle failures.
async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: getHeaders(),
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    if (res.status === 401) {
      localStorage.removeItem('hmi_token');
      localStorage.removeItem('hmi_user');
      window.dispatchEvent(new CustomEvent('hmi:auth-expired'));
    }
    throw new Error(body.detail || `HTTP ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

// The api object organizes all backend calls by resource (Auth, Tags, Alarms, etc.).
// Each method returns a Promise — an async result that resolves when the server responds.
// POST/PUT methods send a JSON body; GET methods just read data. This object is exported
// so any component can call e.g. api.getTags() without knowing the URL or HTTP details.
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
  // encodeURIComponent makes special characters (spaces, slashes, etc.) safe for URLs.
  // Without it, a tag named "Motor/Speed" would break the URL path.
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
  exportTagsCsv: async () => {
    const res = await fetch(`${BASE}/tags/export/csv`, { headers: getHeaders() });
    if (!res.ok) throw new Error('Export failed');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `tags_export_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  },
  importTagsCsv: (tags: Partial<Tag>[], dataSourceId?: number | null, onConflict?: ImportConflictMode, updateFields?: string[]) =>
    request<ImportResult>('/tags/import/csv', {
      method: 'POST',
      body: JSON.stringify({ tags, ...(dataSourceId != null ? { data_source_id: dataSourceId } : {}), on_conflict: onConflict || 'skip', ...(updateFields ? { update_fields: updateFields } : {}) }),
    }),
  importTagsCodesys: (xml: string, prefix?: string, names?: string[], dataSourceId?: number | null, onConflict?: ImportConflictMode, updateFields?: string[]) =>
    request<ImportResult>('/tags/import/codesys', {
      method: 'POST',
      body: JSON.stringify({ xml, prefix: prefix || '', ...(names ? { names } : {}), ...(dataSourceId != null ? { data_source_id: dataSourceId } : {}), on_conflict: onConflict || 'skip', ...(updateFields ? { update_fields: updateFields } : {}) }),
    }),
  importTagsRslogix500: (csv: string, prefix?: string, names?: string[], dataSourceId?: number | null, onConflict?: ImportConflictMode, updateFields?: string[]) =>
    request<ImportResult>('/tags/import/rslogix500', {
      method: 'POST',
      body: JSON.stringify({ csv, prefix: prefix || '', ...(names ? { names } : {}), ...(dataSourceId != null ? { data_source_id: dataSourceId } : {}), on_conflict: onConflict || 'skip', ...(updateFields ? { update_fields: updateFields } : {}) }),
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
    request<TagLabel>('/tags/labels', { method: 'POST', body: JSON.stringify(data) }),
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

  // Media (fault help images)
  uploadFaultHelpMedia: async (file: File): Promise<{ media_id: string; url: string }> => {
    const form = new FormData();
    form.append('file', file);
    const token = localStorage.getItem('hmi_token');
    const headers: HeadersInit = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(`${BASE}/media/upload`, { method: 'POST', headers, body: form });
    if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b.detail || `HTTP ${res.status}`); }
    return res.json();
  },
  deleteFaultHelpMedia: (mediaId: string) =>
    request(`/media/${encodeURIComponent(mediaId)}`, { method: 'DELETE' }),

  // Screens
  getScreens: () => request<ScreenData[]>('/screens/'),
  getScreenBySlug: (slug: string) => request<ScreenData>(`/screens/by-slug/${slug}`),
  saveScreen: (id: number, data: Record<string, unknown>) =>
    request(`/screens/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  createScreen: (data: Record<string, unknown>) =>
    request('/screens/', { method: 'POST', body: JSON.stringify(data) }),
  deleteScreen: (id: number) =>
    request(`/screens/${id}`, { method: 'DELETE' }),
  reorderScreens: (items: Array<{ id: number; sort_order: number }>) =>
    request<ScreenData[]>('/screens/reorder', { method: 'PUT', body: JSON.stringify(items) }),

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
  browseDataSourceLevel: (id: number, parentNodeId?: string | null) =>
    request<{ nodes: BrowsedNode[]; address_prefix?: string }>(`/datasources/${id}/browse-level`, {
      method: 'POST',
      body: JSON.stringify({ parent_node_id: parentNodeId || null }),
    }),
  clearBrowseCache: (id: number) =>
    request(`/datasources/${id}/browse-cache-clear`, { method: 'POST' }),

  // Users
  getUsers: () => request<UserListEntry[]>('/users/'),
  createUser: (data: { username: string; display_name: string; password: string; role: string; login_mode?: string }) =>
    request('/users/', { method: 'POST', body: JSON.stringify(data) }),
  deleteUser: (id: number) =>
    request(`/users/${id}`, { method: 'DELETE' }),

  // Audit
  getAuditLog: (limit = 100) => request<AuditEntry[]>(`/audit/?limit=${limit}`),

  // Reporting
  getReportSummary: (params?: { start?: string; end?: string }) => {
    const qs = new URLSearchParams();
    if (params?.start) qs.set('start', params.start);
    if (params?.end) qs.set('end', params.end);
    const q = qs.toString();
    return request<ReportSummary>(`/reporting/summary${q ? `?${q}` : ''}`);
  },
  getReportTimeSeries: (params?: { start?: string; end?: string; granularity?: string }) => {
    const qs = new URLSearchParams();
    if (params?.start) qs.set('start', params.start);
    if (params?.end) qs.set('end', params.end);
    if (params?.granularity) qs.set('granularity', params.granularity);
    const q = qs.toString();
    return request<ReportBucket[]>(`/reporting/time-series${q ? `?${q}` : ''}`);
  },
  getDowntimePeriods: (params?: { start?: string; end?: string }) => {
    const qs = new URLSearchParams();
    if (params?.start) qs.set('start', params.start);
    if (params?.end) qs.set('end', params.end);
    const q = qs.toString();
    return request<DowntimePeriod[]>(`/reporting/downtime-periods${q ? `?${q}` : ''}`);
  },
  annotateDowntimePeriod: (data: { start_time: string; reason_code?: string; reason_text?: string }) =>
    request('/reporting/downtime-periods/annotate', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  getDowntimeSummary: (params?: { start?: string; end?: string }) => {
    const qs = new URLSearchParams();
    if (params?.start) qs.set('start', params.start);
    if (params?.end) qs.set('end', params.end);
    const q = qs.toString();
    return request<DowntimeSummary[]>(`/reporting/downtime-summary${q ? `?${q}` : ''}`);
  },

  // Production settings
  getProductionSettings: () => request<ProductionSettings>('/production/settings/'),
  updateProductionSettings: (data: ProductionSettings) =>
    request<ProductionSettings>('/production/settings/', { method: 'PUT', body: JSON.stringify(data) }),

  // Service config
  getServiceConfig: () => request<ServiceConfig>('/service/config/'),
  updateServiceConfig: (data: ServiceConfig) =>
    request<ServiceConfig>('/service/config/', { method: 'PUT', body: JSON.stringify(data) }),

  // Reason codes
  getReasonCodes: (activeOnly?: boolean) =>
    request<ReasonCode[]>(`/reason-codes/${activeOnly ? '?active_only=true' : ''}`),
  createReasonCode: (data: { code: string; description?: string; category?: string; sort_order?: number }) =>
    request<ReasonCode>('/reason-codes/', { method: 'POST', body: JSON.stringify(data) }),
  updateReasonCode: (id: number, data: Partial<ReasonCode>) =>
    request<ReasonCode>(`/reason-codes/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteReasonCode: (id: number) =>
    request(`/reason-codes/${id}`, { method: 'DELETE' }),

  // Scripts
  executeScript: (script: string) =>
    request('/scripts/execute', {
      method: 'POST',
      body: JSON.stringify({ script }),
    }),

  // Projects
  getProjects: () => request<ProjectData[]>('/projects/'),
  getActiveProject: () => request<{ id: number | null; name: string | null }>('/projects/active'),
  getActiveProjectDirty: () => request<{
    dirty: boolean;
    changes: { section: string; added: string[]; removed: string[]; modified: { name: string; fields: string[] }[] }[];
  }>('/projects/active/dirty'),
  getProject: (id: number) => request<ProjectDetail>(`/projects/${id}`),
  createProject: (data: { name: string; description?: string; version?: string }) =>
    request<ProjectData>('/projects/', { method: 'POST', body: JSON.stringify(data) }),
  updateProject: (id: number, data: { name?: string; description?: string; version?: string }) =>
    request<ProjectData>(`/projects/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteProject: (id: number) =>
    request(`/projects/${id}`, { method: 'DELETE' }),
  saveProject: (id: number) =>
    request<{ status: string; snapshot_saved_at: string }>(`/projects/${id}/save`, { method: 'POST' }),
  loadProject: (id: number) =>
    request<{ status: string; project_name: string }>(`/projects/${id}/load`, { method: 'POST' }),
  createBlankProject: (data: { name: string; description?: string; version?: string }) =>
    request<ProjectData>('/projects/create-blank', { method: 'POST', body: JSON.stringify(data) }),
  createDemoProject: (data: { name: string; description?: string; version?: string }) =>
    request<ProjectData>('/projects/create-demo', { method: 'POST', body: JSON.stringify(data) }),
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
    request<{ site_title: string; nav_title: string; has_favicon: boolean; theme_accent: string; theme_preset: string }>('/branding/'),
  updateBranding: (data: { site_title?: string; nav_title?: string; favicon?: string; theme_accent?: string; theme_preset?: string }) =>
    request<{ site_title: string; nav_title: string; has_favicon: boolean; theme_accent: string; theme_preset: string }>('/branding/', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  getCustomThemes: () =>
    request<{ themes: Record<string, { label: string; group: string; bgBody: string; bgSurface: string; bgElevated: string; bgInput: string; border: string; borderSubtle: string; textPrimary: string; textSecondary: string; textMuted: string }> }>('/branding/custom-themes'),
  updateCustomThemes: (themes: Record<string, { label: string; group: string; bgBody: string; bgSurface: string; bgElevated: string; bgInput: string; border: string; borderSubtle: string; textPrimary: string; textSecondary: string; textMuted: string }>) =>
    request<{ themes: Record<string, unknown> }>('/branding/custom-themes', {
      method: 'PUT',
      body: JSON.stringify({ themes }),
    }),

  // Preferences
  getPreferences: () =>
    request<{ default_screen_layout: string; default_screen_resolution: string }>('/preferences/'),
  updatePreferences: (data: { default_screen_layout?: string; default_screen_resolution?: string }) =>
    request<{ default_screen_layout: string; default_screen_resolution: string }>('/preferences/', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  // System Update
  getSystemInfo: () =>
    request<{ app_version: string; platform: string; python_version: string; install_path: string; database_path: string; is_compiled: boolean; uptime_seconds: number | null }>('/system/info'),
  getSupportInfo: () =>
    request<{
      hostname: string;
      network_adapters: { name: string; ip_addresses: string[]; mac_address: string | null; is_up: boolean }[];
      disks: { path: string; label: string | null; total_gb: number; used_gb: number; free_gb: number; percent_used: number }[];
      removable_drives: { path: string; label: string | null; total_gb: number; free_gb: number }[];
      teamviewer: { installed: boolean; id: string | null; version: string | null; is_running: boolean };
    }>('/system/support-info'),
  validateUpdatePackage: async (file: File): Promise<{ valid: boolean; is_compiled: boolean; has_backend: boolean; has_frontend: boolean; has_wheels: boolean; has_windows_wheels: boolean; file_count: number; package_size_mb: number; error: string | null }> => {
    const form = new FormData();
    form.append('file', file);
    const token = localStorage.getItem('hmi_token');
    const headers: HeadersInit = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(`${BASE}/system/update/validate`, { method: 'POST', headers, body: form });
    if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b.detail || `HTTP ${res.status}`); }
    return res.json();
  },
  applyUpdatePackage: async (file: File): Promise<{ success: boolean; message: string; updated_backend: boolean; updated_frontend: boolean; updated_dependencies: boolean; restart_scheduled: boolean }> => {
    const form = new FormData();
    form.append('file', file);
    const token = localStorage.getItem('hmi_token');
    const headers: HeadersInit = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(`${BASE}/system/update/apply`, { method: 'POST', headers, body: form });
    if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b.detail || `HTTP ${res.status}`); }
    return res.json();
  },

  // Application Logs
  getLogs: (params?: { level?: string; search?: string; limit?: number }) => {
    const qs = new URLSearchParams();
    if (params?.level) qs.set('level', params.level);
    if (params?.search) qs.set('search', params.search);
    if (params?.limit) qs.set('limit', String(params.limit));
    const q = qs.toString();
    return request<{ entries: LogEntry[]; total: number }>(`/logs/${q ? `?${q}` : ''}`);
  },
  exportLogsCsv: async (params?: { level?: string; search?: string }) => {
    const qs = new URLSearchParams();
    if (params?.level) qs.set('level', params.level);
    if (params?.search) qs.set('search', params.search);
    const q = qs.toString();
    const res = await fetch(`${BASE}/logs/export/csv${q ? `?${q}` : ''}`, { headers: getHeaders() });
    if (!res.ok) throw new Error('Export failed');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `hmi_logs_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  },

  // ZPL Preview
  zplPreviewRender: async (zpl: string, dpi?: number): Promise<Blob> => {
    const token = localStorage.getItem('hmi_token');
    const headers: HeadersInit = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(`${BASE}/zpl-preview/render`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ zpl, dpi: dpi || 203 }),
    });
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      throw new Error(b.detail || `HTTP ${res.status}`);
    }
    return res.blob();
  },
  zplPreviewRenderFile: async (file: File, dpi?: number): Promise<Blob> => {
    const token = localStorage.getItem('hmi_token');
    const headers: HeadersInit = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const form = new FormData();
    form.append('file', file);
    if (dpi) form.append('dpi', String(dpi));
    const res = await fetch(`${BASE}/zpl-preview/render-file`, {
      method: 'POST',
      headers,
      body: form,
    });
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      throw new Error(b.detail || `HTTP ${res.status}`);
    }
    return res.blob();
  },

  // Health
  health: () => request<Record<string, unknown>>('/health'),
};
