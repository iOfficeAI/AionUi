/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Covers the preset-assistant avatar rendering in the cron CreateTaskDialog:
 * the agent <Select> option list and its selected-trigger (renderFormat) must
 * render an image avatar as <img>, never leaking a stored data-URL as text.
 */

import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

beforeAll(() => {
  if (!window.matchMedia) {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })) as unknown as typeof window.matchMedia;
  }
});

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string, o?: { defaultValue?: string }) => o?.defaultValue || k }),
}));

vi.mock('swr', () => ({ default: () => ({ data: [] }) }));

const PNG_DATA_URL = 'data:image/png;base64,iVBORw0KGgo=';

const presetAssistant = {
  id: 'writer',
  source: 'user',
  name: 'Writer',
  name_i18n: {},
  description_i18n: {},
  enabled: true,
  sort_order: 1,
  preset_agent_type: 'claude',
  avatar: PNG_DATA_URL,
  enabled_skills: [],
  custom_skill_names: [],
  disabled_builtin_skills: [],
  context_i18n: {},
  prompts: [],
  prompts_i18n: {},
  models: [],
};

// A second preset whose avatar is empty: exercises the `if (avatarNode)`
// false branch in renderFormat (avatarNode is null → trigger keeps its
// default Robot icon).
const presetAssistantNoAvatar = {
  ...presetAssistant,
  id: 'empty',
  name: 'Empty',
  avatar: '',
};

vi.mock('@renderer/pages/conversation/hooks/useConversationAssistants', () => ({
  useConversationAssistants: () => ({
    presetAssistants: [presetAssistant, presetAssistantNoAvatar],
    isLoading: false,
    refresh: vi.fn(),
  }),
}));

vi.mock('@renderer/hooks/agent/useModelProviderList', () => ({
  useModelProviderList: () => ({
    providers: [],
    getAvailableModels: () => [],
    formatModelLabel: (v: string) => v,
  }),
}));

vi.mock('@renderer/components/base/ModalWrapper', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@renderer/pages/guid/components/GuidModelSelector', () => ({ default: () => <div /> }));

vi.mock('@renderer/components/workspace', () => ({ WorkspaceFolderSelect: () => <div /> }));

vi.mock('@/common', () => ({ ipcBridge: {} }));

import CreateTaskDialog from '@/renderer/pages/cron/ScheduledTasksPage/CreateTaskDialog';

afterEach(cleanup);

describe('CreateTaskDialog preset avatar', () => {
  it('renders the preset image avatar as <img> in the option list and trigger (no raw data-URL text)', async () => {
    render(<CreateTaskDialog visible={true} onClose={vi.fn()} />);

    // Open the agent Select to render the option list.
    const combobox = document.querySelector('.arco-select-view') as HTMLElement;
    expect(combobox).toBeTruthy();
    await act(async () => {
      fireEvent.click(combobox);
    });

    // Option list image avatar.
    await waitFor(() => {
      const optionImg = Array.from(document.querySelectorAll('img')).find(
        (img) => img.getAttribute('src') === PNG_DATA_URL
      );
      expect(optionImg).toBeTruthy();
    });

    // Select the preset option → exercises renderFormat (trigger) path.
    const option = await screen.findByText('Writer');
    await act(async () => {
      fireEvent.click(option);
    });

    await waitFor(() => {
      const imgs = Array.from(document.querySelectorAll('img'));
      expect(imgs.some((img) => img.getAttribute('src') === PNG_DATA_URL)).toBe(true);
    });
    expect(document.body.textContent).not.toContain('data:image');
  });

  it('keeps the default trigger icon when the selected preset has no avatar', async () => {
    render(<CreateTaskDialog visible={true} onClose={vi.fn()} />);

    const combobox = document.querySelector('.arco-select-view') as HTMLElement;
    expect(combobox).toBeTruthy();
    await act(async () => {
      fireEvent.click(combobox);
    });

    // Select the avatar-less preset → renderFormat hits the `if (avatarNode)`
    // false branch (avatarNode is null), leaving the default Robot icon.
    const option = await screen.findByText('Empty');
    await act(async () => {
      fireEvent.click(option);
    });

    await waitFor(() => {
      const trigger = document.querySelector('.arco-select-view') as HTMLElement;
      expect(trigger.textContent).toContain('Empty');
    });
    expect(document.body.textContent).not.toContain('data:image');
  });
});
