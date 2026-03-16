import { IntegrationsTab } from './IntegrationsTab';
import { ProductionSettingsTab } from './ProductionSettings';
import { ReasonCodesSettings } from './ReasonCodesSettings';
import type { TagValue } from '../../types';

export interface IntegrationsSettingsProps {
  tagValues: Record<string, TagValue>;
  canManage: boolean;
}

export function IntegrationsSettings({ tagValues, canManage }: IntegrationsSettingsProps) {
  return (
    <IntegrationsTab tagValues={tagValues} canManage={canManage} />
  );
}

export function ReportingSettings() {
  return (
    <div className="space-y-10">
      <ProductionSettingsTab />
      <hr className="border-[var(--hmi-border)]" />
      <ReasonCodesSettings />
    </div>
  );
}
