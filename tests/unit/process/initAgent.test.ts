/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/common', () => ({
  ipcBridge: {
    fs: {
      listBuiltinAutoSkills: { invoke: vi.fn() },
      materializeSkillsForAgent: { invoke: vi.fn().mockResolvedValue({ skills: [] }) },
    },
  },
}));

// Import AFTER the mock so computeInitialSkillsSnapshot picks up the stub.
import { ipcBridge } from '@/common';
import { computeInitialSkillsSnapshot } from '@/process/utils/initAgent';

const listAuto = ipcBridge.fs.listBuiltinAutoSkills.invoke as ReturnType<typeof vi.fn>;

describe('computeInitialSkillsSnapshot', () => {
  beforeEach(() => {
    listAuto.mockReset();
  });

  it('returns empty when auto-inject is empty and no preset', async () => {
    listAuto.mockResolvedValue([]);
    const skills = await computeInitialSkillsSnapshot({});
    expect(skills).toEqual([]);
  });

  it('sorts and dedupes union of auto-inject and preset_enabled_skills', async () => {
    listAuto.mockResolvedValue([
      { name: 'todo-tracker', description: '' },
      { name: 'cron', description: '' },
    ]);
    const skills = await computeInitialSkillsSnapshot({
      preset_enabled_skills: ['pdf', 'cron'],
    });
    expect(skills).toEqual(['cron', 'pdf', 'todo-tracker']);
  });

  it('applies exclude_auto_inject_skills to auto-inject set', async () => {
    listAuto.mockResolvedValue([
      { name: 'cron', description: '' },
      { name: 'todo-tracker', description: '' },
    ]);
    const skills = await computeInitialSkillsSnapshot({
      exclude_auto_inject_skills: ['cron'],
    });
    expect(skills).toEqual(['todo-tracker']);
  });

  it('preset wins over exclude — explicit opt-in survives', async () => {
    listAuto.mockResolvedValue([{ name: 'cron', description: '' }]);
    const skills = await computeInitialSkillsSnapshot({
      preset_enabled_skills: ['cron'],
      exclude_auto_inject_skills: ['cron'],
    });
    expect(skills).toEqual(['cron']);
  });

  it('gracefully returns only preset when listBuiltinAutoSkills throws', async () => {
    listAuto.mockRejectedValue(new Error('boom'));
    const skills = await computeInitialSkillsSnapshot({
      preset_enabled_skills: ['pdf'],
    });
    expect(skills).toEqual(['pdf']);
  });
});
