export type NovaOrbStyle = 'trinity' | 'signal' | 'glass' | 'minimal';

export type NovaOrbOption = {
  key: NovaOrbStyle;
  label: string;
};

export type NovaCommandAction = {
  id: string;
  label: string;
  icon: string;
  serviceId: string;
  mode: 'open' | 'action';
};

type ServiceLike = {
  id: string;
};

export const NOVA_ORB_OPTIONS: NovaOrbOption[] = [
  { key: 'trinity', label: 'Trinity Core' },
  { key: 'signal', label: 'Signal Core' },
  { key: 'glass', label: 'Crystal Core' },
  { key: 'minimal', label: 'Quiet Core' },
];

export const NOVA_COMMAND_ACTIONS: NovaCommandAction[] = [
  { id: 'jarvis-chat', label: 'Jarvis Chat', icon: 'JV', serviceId: 'jarvis', mode: 'action' },
  { id: 'openclaw-models', label: 'OpenClaw Models', icon: 'OC', serviceId: 'openclaw', mode: 'action' },
  { id: 'goclaw-health', label: 'GoClaw Health', icon: 'GC', serviceId: 'goclaw', mode: 'action' },
  { id: 'space-health', label: 'Space Health', icon: 'SA', serviceId: 'space-agent', mode: 'action' },
  { id: 'hermes-health', label: 'Hermes Health', icon: 'HM', serviceId: 'hermes', mode: 'action' },
];

const NOVA_PRIORITY_SERVICE_IDS = [
  'aionui',
  'jarvis',
  'openclaw',
  'goclaw',
  'space-agent',
  'hermes',
  'claw3d',
  'clawmem',
  'video-factory',
  'music-clips',
  'ollama',
];

export const getNovaPriorityServices = <T extends ServiceLike>(services: T[]): T[] => {
  const byId = new Map(services.map((service) => [service.id, service]));
  return NOVA_PRIORITY_SERVICE_IDS.map((id) => byId.get(id)).filter((service): service is T => Boolean(service));
};
