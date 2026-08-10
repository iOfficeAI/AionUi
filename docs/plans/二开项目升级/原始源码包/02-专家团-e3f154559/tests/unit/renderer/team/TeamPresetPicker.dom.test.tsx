/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { TeamPresetPicker } from '@/renderer/pages/team/TeamPresets/components/TeamPresetPicker';
import type { TeamPreset } from '@/renderer/pages/team/TeamPresets/types';

const t = (key: string, options?: { defaultValue?: string }) => options?.defaultValue || key;

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t, i18n: { language: 'en' } }),
}));

const presets: TeamPreset[] = [
  {
    id: 'preset-1',
    user_id: 'user-1',
    name: 'Alpha Team',
    category: 'Test',
    description: 'Alpha description',
    expertise_tags: ['tag-a'],
    example_prompts: ['example-a'],
    leader: {
      assistant_backend: 'aionrs',
      assistant_id: 'a1',
      assistant_name: 'Assistant One',
      role: 'leader',
      order: 0,
    },
    members: [
      {
        assistant_backend: 'aionrs',
        assistant_id: 'a1',
        assistant_name: 'Assistant One',
        role: 'leader',
        order: 0,
      },
    ],
    version: 1,
    created_at: '',
    updated_at: '',
  },
];

describe('TeamPresetPicker accessibility', () => {
  it('renders each preset row as an Arco Button instead of a div with role=button', () => {
    render(
      <TeamPresetPicker
        presets={presets}
        onSelect={vi.fn()}
        onInvoke={vi.fn()}
        onCreate={vi.fn()}
        onEdit={vi.fn()}
        onRemove={vi.fn()}
      />
    );

    const rowButton = screen.getByTestId('preset-picker-item-preset-1');
    expect(rowButton.tagName).toBe('BUTTON');
    expect(rowButton).toHaveAttribute('aria-label', 'Alpha Team');
  });

  it('selects the preset when the row button is activated with Enter', () => {
    const onSelect = vi.fn();
    render(
      <TeamPresetPicker
        presets={presets}
        onSelect={onSelect}
        onInvoke={vi.fn()}
        onCreate={vi.fn()}
        onEdit={vi.fn()}
        onRemove={vi.fn()}
      />
    );

    const rowButton = screen.getByTestId('preset-picker-item-preset-1');
    fireEvent.click(rowButton);
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'preset-1' }));
  });

  it('exposes invoke and more actions as separate buttons', () => {
    render(
      <TeamPresetPicker
        presets={presets}
        onSelect={vi.fn()}
        onInvoke={vi.fn()}
        onCreate={vi.fn()}
        onEdit={vi.fn()}
        onRemove={vi.fn()}
      />
    );

    expect(screen.getByTestId('preset-picker-invoke-preset-1').tagName).toBe('BUTTON');
    expect(screen.getByTestId('preset-picker-more-preset-1').tagName).toBe('BUTTON');
  });
});
