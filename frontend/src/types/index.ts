export interface TagValue {
  tag_id: number;
  name: string;
  value: unknown;
  quality: string;
  timestamp: string;
  long_description?: string;
}

export interface TagLabel {
  id: number;
  name: string;
  color: string | null;
  description: string | null;
}

export interface Tag {
  id: number;
  name: string;
  description: string | null;
  long_description: string | null;
  group_name: string | null;
  data_source_id: number | null;
  address: string | null;
  data_type: 'bool' | 'int' | 'float' | 'string';
  access_mode: 'read' | 'write' | 'read_write';
  engineering_units: string | null;
  display_format: string | null;
  min_value: number | null;
  max_value: number | null;
  deadband: number | null;
  trending_enabled: boolean;
  trending_sample_rate_ms: number | null;
  alarm_enabled: boolean;
  alarm_config: Record<string, unknown> | null;
  simulation_enabled: boolean;
  simulation_behavior: string | null;
  simulation_config: Record<string, unknown> | null;
  enum_mapping: Record<string, string> | null;
  labels: TagLabel[];
}

export interface AlarmData {
  id: number;
  tag_id: number;
  tag_name?: string;
  message: string;
  severity: 'info' | 'warning' | 'critical';
  state: 'active_unacked' | 'active_acked' | 'inactive_unacked' | 'inactive';
  triggered_at: string;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
  trigger_value: string | null;
}

export type LayoutMode = 'grid' | 'absolute';

export interface ScreenResolution {
  width: number;
  height: number;
}

export interface ScreenData {
  id: number;
  name: string;
  slug: string;
  layout: string;
  layout_mode: LayoutMode;
  target_resolution: string | null; // JSON: {"width": 1920, "height": 1080} or null
  version: number;
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

export interface Widget {
  id: string;
  type: string;
  x: number;
  y: number;
  w: number;
  h: number;
  props: Record<string, unknown>;
  visible?: boolean;       // runtime visibility (default true)
  visibleTag?: string;     // tag-driven visibility: show when tag is truthy
  visibleRoles?: string[]; // role-based visibility: show only for these roles
  enabled?: boolean;       // runtime enabled state (default true)
  enabledTag?: string;     // tag-driven enabled: enabled when tag is truthy
  enabledRoles?: string[]; // role-based enabled: enabled only for these roles
  showInfo?: boolean;      // show info icon when tag has long_description (default true)
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

export type ProtocolType = 'opcua' | 'modbus_tcp' | 'ethernet_ip' | 'mqtt' | 'simulation';

export interface DataSourceData {
  id: number;
  name: string;
  protocol: ProtocolType;
  enabled: boolean;
  connected: boolean;
  config?: Record<string, unknown>;
}

export interface TrendDataPoint {
  timestamp: string;
  value: number | null;
  string_value: string | null;
}

export interface ProductionRun {
  id: number;
  job_name: string | null;
  start_time: string;
  end_time: string | null;
  good_count: number;
  reject_count: number;
  availability: number | null;
  performance: number | null;
  quality: number | null;
  oee: number | null;
  shift: string | null;
}

export interface BrowsedTag {
  name?: string;
  display_name?: string;
  node_id?: string;
  address?: string;
  data_type?: string;
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
