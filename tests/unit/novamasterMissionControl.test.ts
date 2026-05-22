import { describe, expect, it } from 'vitest';

import {
  NOVA_AGENT_TEAM_ACTIONS,
  NOVA_COMMAND_ACTIONS,
  NOVA_ORB_OPTIONS,
  getNovaPriorityServices,
} from '@/renderer/pages/guid/novamasterMissionControl';

describe('NovaMaster mission control configuration', () => {
  it('exposes the orb styles shown in the native cockpit', () => {
    expect(NOVA_ORB_OPTIONS.map((option) => option.key)).toEqual(['trinity', 'signal', 'glass', 'minimal']);
    expect(NOVA_ORB_OPTIONS.every((option) => option.label.length > 0)).toBe(true);
  });

  it('keeps the primary native command bar focused on real stack actions', () => {
    expect(NOVA_COMMAND_ACTIONS.map((action) => action.label)).toEqual([
      'Jarvis Chat',
      'OpenClaw Models',
      'GoClaw Health',
      'Space Health',
      'Hermes Health',
    ]);
    expect(NOVA_COMMAND_ACTIONS.every((action) => action.serviceId.length > 0)).toBe(true);
    expect(NOVA_COMMAND_ACTIONS.map((action) => action.serviceId)).toEqual([
      'jarvis',
      'openclaw',
      'goclaw',
      'space-agent',
      'hermes',
    ]);
    expect(NOVA_COMMAND_ACTIONS.every((action) => action.mode === 'action')).toBe(true);
  });

  it('exposes Jarvis team actions for the cockpit agent launcher', () => {
    expect(NOVA_AGENT_TEAM_ACTIONS.map((action) => action.team)).toEqual(['office', 'ops', 'research', 'full']);
    expect(NOVA_AGENT_TEAM_ACTIONS.every((action) => action.goal.includes('AionUi'))).toBe(true);
  });

  it('prioritizes the cockpit services from the live stack payload', () => {
    const services = [
      { id: 'ollama', name: 'Ollama' },
      { id: 'claw3d', name: 'Claw3D Office' },
      { id: 'aionui', name: 'AionUi' },
      { id: 'hermes', name: 'Hermes' },
      { id: 'jarvis', name: 'Jarvis' },
      { id: 'clawmem', name: 'ClawMem' },
      { id: 'openclaw', name: 'OpenClaw' },
      { id: 'goclaw', name: 'GoClaw' },
      { id: 'space-agent', name: 'Space Agent' },
      { id: 'metaclaw', name: 'MetaClaw' },
    ];

    expect(getNovaPriorityServices(services).map((service) => service.id)).toEqual([
      'aionui',
      'jarvis',
      'openclaw',
      'goclaw',
      'space-agent',
      'hermes',
      'claw3d',
      'clawmem',
      'ollama',
    ]);
  });
});
