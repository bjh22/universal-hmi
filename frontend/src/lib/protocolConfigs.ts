import type { ProtocolType } from '../types';

export interface ProtocolFieldDef {
  key: string;
  label: string;
  type: string;
  placeholder?: string;
}

export const PROTOCOL_CONFIGS: Record<ProtocolType, { label: string; fields: ProtocolFieldDef[] }> = {
  opcua: {
    label: 'OPC-UA',
    fields: [
      { key: 'endpoint', label: 'Endpoint URL', type: 'text', placeholder: 'opc.tcp://localhost:4840' },
      { key: 'security_policy', label: 'Security Policy', type: 'text', placeholder: 'None' },
      { key: 'security_mode', label: 'Security Mode', type: 'text', placeholder: 'None' },
      { key: 'username', label: 'Username', type: 'text' },
      { key: 'password', label: 'Password', type: 'password' },
    ],
  },
  modbus_tcp: {
    label: 'Modbus TCP',
    fields: [
      { key: 'host', label: 'Host', type: 'text', placeholder: '192.168.1.100' },
      { key: 'port', label: 'Port', type: 'number', placeholder: '502' },
      { key: 'unit_id', label: 'Unit ID', type: 'number', placeholder: '1' },
    ],
  },
  ethernet_ip: {
    label: 'EtherNet/IP',
    fields: [
      { key: 'host', label: 'Host', type: 'text', placeholder: '192.168.1.100' },
      { key: 'slot', label: 'Slot', type: 'number', placeholder: '0' },
    ],
  },
  mqtt: {
    label: 'MQTT',
    fields: [
      { key: 'broker', label: 'Broker', type: 'text', placeholder: 'localhost' },
      { key: 'port', label: 'Port', type: 'number', placeholder: '1883' },
      { key: 'username', label: 'Username', type: 'text' },
      { key: 'password', label: 'Password', type: 'password' },
      { key: 'topic_prefix', label: 'Topic Prefix', type: 'text', placeholder: 'plant/' },
    ],
  },
  simulation: {
    label: 'Simulation',
    fields: [],
  },
};
