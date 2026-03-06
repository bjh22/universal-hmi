export interface TagValue {
  tag_id: number;
  name: string;
  value: unknown;
  quality: string;
  timestamp: string;
}

export interface Tag {
  id: number;
  name: string;
  description: string | null;
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
}

export interface AlarmData {
  id: number;
  tag_id: number;
  tag_name?: string;
  message: string;
  severity: 'info' | 'warning' | 'critical';
  state: 'active_unacked' | 'active_acked' | 'inactive';
  triggered_at: string;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
  trigger_value: string | null;
}

export interface ScreenData {
  id: number;
  name: string;
  slug: string;
  layout: string;
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
  created_by: string | null;
  created_at: string;
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

export interface AuditEntry {
  id: number;
  timestamp: string;
  user: string | null;
  action: string;
  details: string | null;
  source_ip: string | null;
}
