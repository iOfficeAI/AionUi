import type { Message } from '@arco-design/web-react';
import type { AcpBackendConfig } from '@/common/types/acpTypes';

// Skill info type
export type SkillInfo = {
  name: string;
  description: string;
  location: string;
  isCustom: boolean;
};

// External source type
export type ExternalSource = {
  name: string;
  path: string;
  source: string;
  skills: Array<{ name: string; description: string; path: string }>;
};

// Pending skill to import
export type PendingSkill = {
  path: string;
  name: string;
  description: string;
};

export type AssistantManagementProps = {
  message: ReturnType<typeof Message.useMessage>[0];
};

export type AssistantListItem = AcpBackendConfig & {
  _source?: string;
  _extensionName?: string;
  _kind?: string;
};
