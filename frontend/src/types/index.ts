/**
 * types/index.ts — TypeScript interfaces for the entire application.
 *
 * These interfaces define the "shape" of data flowing between the frontend and backend.
 * They exist ONLY at compile time for type checking — no JavaScript code is generated
 * from them. If the backend sends a field you didn't declare here, TypeScript won't
 * know about it; if it omits a required field, TypeScript will flag the error.
 *
 * Key TypeScript concepts used throughout this file:
 *   - `|` means "union type" (or): `'bool' | 'int'` means the value must be one or the other.
 *   - `?` after a property name means it's optional — may be present or undefined.
 *   - `Record<K, V>` is a dictionary/map type: Record<string, unknown> means an object
 *     with string keys and values of any type.
 *   - `unknown` is the type-safe version of `any` — you must check what it is before using it.
 *   - `null` is used for fields the backend may explicitly return as null (e.g., no value set).
 */

// TagValue is a real-time snapshot of a single tag's current state, received over
// the WebSocket. This is what widgets bind to for live data display.
export interface TagValue {
  tag_id: number;
  name: string;
  value: unknown;        // `unknown` because tags can be bool, int, float, or string
  quality: string;       // e.g. "good", "bad" — indicates if the value is trustworthy
  timestamp: string;     // ISO 8601 string from the server
  description?: string;
  display_name?: string;
  engineering_units?: string;   // e.g. "RPM", "°C", "psi"
  display_format?: string;     // e.g. "0.00", "0.0"
}

export interface TagLabel {
  id: number;
  name: string;
  color: string | null;
  description: string | null;
}

// Tag is the full configuration of a tag as stored in the database. This is richer
// than TagValue — it includes how the tag connects to hardware (address, data_source_id),
// how it should be displayed, and whether alarms/trending/simulation are enabled.
export interface Tag {
  id: number;
  name: string;                                     // unique identifier, e.g. "Motor1.Speed"
  display_name: string | null;                      // human-friendly label, e.g. "Motor 1 Speed"
  description: string | null;
  data_source_id: number | null;                    // which PLC/device this tag reads from
  address: string | null;                           // protocol-specific address on the device
  data_type: 'bool' | 'int' | 'float' | 'string';  // union type — only these four values are valid
  access_mode: 'read' | 'write' | 'read_write';
  engineering_units: string | null;                 // e.g. "RPM", "°C", "psi"
  display_format: string | null;
  min_value: number | null;
  max_value: number | null;
  deadband: number | null;
  trending_enabled: boolean;
  trending_sample_rate_ms: number | null;
  alarm_enabled: boolean;
  alarm_config: Record<string, unknown> | null;     // flexible JSON — shape varies by alarm type
  simulation_enabled: boolean;
  simulation_behavior: string | null;
  simulation_config: Record<string, unknown> | null;
  enum_mapping: Record<string, string> | null;      // maps numeric values to display strings
  visibility_enabled: boolean;
  visibility_conditions: string | null;             // JSON string: VisibilityCondition[]
  labels: TagLabel[];
  is_system?: boolean;
}

export interface VisibilityCondition {
  tag: string;
  operator: '==' | '!=' | '>' | '<' | '>=' | '<=';
  value: unknown;
}

export interface ImportPreviewTag {
  name: string;
  display_name: string | null;
  group: string | null;
  data_type: string;
  access_mode: string;
  has_enum?: boolean;
  enum_values?: number;
  address?: string;
  exists?: boolean;
}

export interface ImportResult {
  imported: number;
  updated: number;
  skipped: number;
}

export type ImportConflictMode = 'skip' | 'update';

// AlarmData represents an alarm event. Alarms follow a state machine:
//   active_unacked  → operator hasn't seen it yet, condition is still true
//   active_acked    → operator acknowledged it, but condition is still true
//   inactive_unacked → condition cleared on its own before anyone acknowledged
//   inactive        → acknowledged AND cleared — fully resolved
// This pattern is standard in industrial alarm management (ISA-18.2).
export interface AlarmData {
  id: number;
  tag_id: number;
  tag_name?: string;
  tag_display_name?: string;
  message: string;
  severity: 'info' | 'warning' | 'critical';
  state: 'active_unacked' | 'active_acked' | 'inactive_unacked' | 'inactive';
  triggered_at: string;
  acknowledged_at: string | null;   // null until an operator acknowledges
  acknowledged_by: string | null;   // username of who acknowledged
  trigger_value: string | null;
  help_image?: string | null;
  help_text?: string | null;
  help_enabled?: boolean;
}

export type LayoutMode = 'grid' | 'absolute';

export interface ScreenResolution {
  width: number;
  height: number;
}

// ScreenData is a saved screen layout. The `layout` field is a JSON string containing
// the array of Widget objects — it's stored as a string in the database and parsed
// by the frontend when the screen is loaded.
export interface ScreenData {
  id: number;
  name: string;
  slug: string;               // URL-friendly name, e.g. "main-overview" for /screen/main-overview
  layout: string;             // JSON string of Widget[] — parsed at runtime
  layout_mode: LayoutMode;
  target_resolution: string | null;
  version: number;            // incremented on each save — used for optimistic concurrency
  is_default: boolean;
  sort_order: number;
}

export interface TextStyle {
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: 'normal' | 'bold';
  color?: string;
  italic?: boolean;
}

// Widget represents a single UI element placed on a screen by the designer.
// Position (x, y) and size (w, h) are in grid units or pixels depending on layout mode.
// The `props` bag holds type-specific config (e.g., which tag to bind to, colors, labels)
// using Record<string, unknown> so any widget type can store whatever it needs.
export interface Widget {
  id: string;              // unique ID generated when the widget is created
  type: string;            // determines which component renders (e.g. "gauge", "toggle")
  x: number;
  y: number;
  w: number;
  h: number;
  props: Record<string, unknown>;  // type-specific configuration — varies per widget type
  visible?: boolean;       // runtime visibility (default true)
  visibleTag?: string;     // tag-driven visibility: show when tag is truthy
  visibleRoles?: string[]; // role-based visibility: show only for these roles
  enabled?: boolean;       // runtime enabled state (default true)
  enabledTag?: string;     // tag-driven enabled: enabled when tag is truthy
  enabledRoles?: string[]; // role-based enabled: enabled only for these roles
  showInfo?: boolean;      // show info icon when tag has description (default true)
  chrome?: 'full' | 'compact' | 'none'; // display chrome level (default: full)
  parentId?: string;       // links widget to a container widget for grouping
}

export interface UserData {
  id: number;
  username: string;
  display_name: string;
  role: string;
}

export interface JobData {
  id: number;
  name: string;
  description: string | null;
  version: number;
  setpoints: string;
  download_conditions: string | null;
  created_by: string | null;
  created_at: string;
}

export interface JobHistoryEntry {
  id: number;
  job_id: number;
  job_name: string;
  version: number;
  setpoints: string;
  changed_by: string | null;
  changed_at: string;
}

// A "type alias" — ProtocolType is just a shorthand for this union of string literals.
// Using it in DataSourceData below ensures only valid protocol names are accepted.
export type ProtocolType = 'opcua' | 'modbus_tcp' | 'ethernet_ip' | 'mqtt' | 'simulation';

export interface DataSourceData {
  id: number;
  name: string;
  protocol: ProtocolType;
  enabled: boolean;
  connected: boolean;
  config?: Record<string, unknown>;
}

/** Real-time datasource connection status broadcast via WebSocket */
export interface DatasourceStatus {
  id: number;
  name: string;
  protocol: string;
  connected: boolean;
}

export interface TrendDataPoint {
  timestamp: string;
  value: number | null;
  string_value: string | null;
}

// ReportSummary contains computed metrics for a timeframe, derived from
// trend data and alarm history rather than production runs.
export interface ReportSummary {
  count: number;
  reject_count: number;
  rate: number | null;           // bags/hr
  target_rate: number | null;
  uptime_seconds: number;
  downtime_seconds: number;
  idle_seconds: number;
  availability: number | null;
  performance: number | null;
  quality: number | null;
  oee: number | null;
  timeframe: { start: string; end: string };
}

// An individual fault/alarm that contributed to a downtime period.
export interface DowntimeFault {
  alarm_history_id: number | null;
  tag_name: string;
  tag_display_name: string | null;
  start_time: string;
  end_time: string | null;
  is_exception: boolean;
}

// A merged downtime period (overlapping faults grouped together).
export interface DowntimePeriod {
  start_time: string;
  end_time: string | null;
  duration_seconds: number;
  capped_duration_seconds: number;
  faults: DowntimeFault[];
  reason_code: string | null;
  reason_text: string | null;
}

// Aggregated downtime by reason code for Pareto analysis.
export interface DowntimeSummary {
  reason_code: string;
  count: number;
  total_duration: number;
}

export interface ReasonCode {
  id: number;
  code: string;
  description: string | null;
  category: string | null;
  sort_order: number;
  is_active: boolean;
}

// Time-series bucket for charting (day/week/month granularity).
export interface ReportBucket {
  period: string;
  count: number;
  reject_count: number;
  rate: number | null;
  uptime_seconds: number;
  downtime_seconds: number;
  idle_seconds: number;
  avg_oee: number | null;
  avg_availability: number | null;
  avg_performance: number | null;
  avg_quality: number | null;
}

export interface ProductionSettings {
  good_count_tag: string | null;
  reject_fault_tags: string[];

  cycling_tag: string | null;
  downtime_exception_tags: string[];
  target_rate: number | null;

  machine_status_tag: string | null;
  cycle_start_tag: string | null;
  reset_tag: string | null;
  alarm_marquee_speed: number | null;
}

export interface ServiceTagOverride {
  mode: 'momentary' | 'toggle';
}

export interface ServiceConfig {
  overrides: Record<string, ServiceTagOverride>;
  order: Record<string, string[]>;
}

export interface BrowsedTag {
  name?: string;
  display_name?: string;
  node_id?: string;
  address?: string;
  relative_address?: string;
  data_type?: string;
}

export interface BrowsedNode {
  node_id: string;
  name: string;
  node_class: 'variable' | 'object';
  data_type?: string;
  relative_address?: string;
  has_children?: boolean;
}

export interface UserListEntry {
  id: number;
  username: string;
  display_name: string;
  role: string;
  is_active: boolean;
}

export interface AuditEntry {
  id: number;
  timestamp: string;
  user: string | null;
  action: string;
  details: string | null;
  source_ip: string | null;
}

export interface ProjectData {
  id: number;
  name: string;
  description: string | null;
  version: string;
  is_active: boolean;
  has_snapshot: boolean;
  snapshot_saved_at: string | null;
  created_at: string;
  updated_at: string;
}

// `extends` means ProjectDetail has all the fields of ProjectData plus the ones below.
// This avoids duplicating the shared fields — a core TypeScript inheritance pattern.
export interface ProjectDetail extends ProjectData {
  tag_count: number;
  screen_count: number;
  data_source_count: number;
  job_count: number;
}

export interface ProjectFile {
  filename: string;
  project_name: string;
  version: string;
  description: string;
  size_bytes: number;
  modified_at: string;
  tag_count: number;
  screen_count: number;
  data_source_count: number;
  job_count: number;
  is_active: boolean;
}

export interface IntegrationType {
  type_name: string;
  display_name: string;
  description: string;
  default_config: Record<string, unknown>;
}

export interface IntegrationData {
  id: number;
  type_name: string;
  name: string;
  enabled: boolean;
  config: Record<string, unknown>;
  status: 'stopped' | 'running' | 'error';
  status_message: string | null;
}

// ─── Project Import Preview/Result ───

export interface SectionItemPreview {
  name: string;
  conflict: boolean;
  conflict_project: string | null;
}

export interface SectionPreview {
  key: string;
  label: string;
  count: number;
  conflict_count: number;
  items: SectionItemPreview[];
  depends_on: string[];
  warnings: string[];
}

export interface ImportPreviewResponse {
  format_version: string;
  project_name: string;
  project_version: string;
  target_project_name: string | null;
  sections: SectionPreview[];
  dependency_warnings: string[];
}

export interface ImportSectionResult {
  section: string;
  created: number;
  updated: number;
  skipped: number;
}

export interface ImportResultResponse {
  project_id: number;
  project_name: string;
  results: ImportSectionResult[];
  warnings: string[];
}

// ─── Project Git ───

export interface GitChangedFile {
  file: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed' | 'new' | 'changed';
}

export interface GitStatus {
  available: boolean;
  branch: string;
  dirty: boolean;
  changed_files: GitChangedFile[];
  has_remote: boolean;
  ahead: number;
  behind: number;
  reason?: string;
}

export interface GitCommitEntry {
  hash: string;
  short: string;
  author: string;
  date: string;
  message: string;
}

export interface GitOperationResult {
  success: boolean;
  message: string;
  details?: string;
}

export interface LogEntry {
  timestamp: string;
  level: string;
  logger_name: string;
  message: string;
}
