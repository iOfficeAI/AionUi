/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ipcBridge } from '@/common';
import { useConversationAssistants } from '@/renderer/pages/conversation/hooks/useConversationAssistants';
import type { Assistant } from '@/common/types/agent/assistantTypes';

vi.mock('@/common', () => ({
  ipcBridge: {
    assistants: {
      list: { invoke: vi.fn() },
    },
  },
}));

describe('useConversationAssistants', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads only enabled assistants from the backend catalog', async () => {
    (ipcBridge.assistants.list.invoke as never as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 'bare-aionrs', name: 'Aion CLI', enabled: true, source: 'generated' },
      { id: 'disabled-writer', name: 'Writer', enabled: false, source: 'user' },
      { id: 'assistant-1', name: 'Researcher', source: 'user' },
    ] satisfies Partial<Assistant>[]);

    const { result } = renderHook(() => useConversationAssistants());

    await waitFor(() => expect(result.current.presetAssistants).toHaveLength(2));

    expect(result.current.presetAssistants.map((assistant) => assistant.id)).toEqual(['bare-aionrs', 'assistant-1']);
  });

  it('keeps the filtered assistant list stable across rerenders when SWR data is unchanged', async () => {
    const catalog = [
      { id: 'bare-aionrs', name: 'Aion CLI', enabled: true, source: 'generated' },
      { id: 'assistant-1', name: 'Researcher', source: 'user' },
    ] satisfies Partial<Assistant>[];

    (ipcBridge.assistants.list.invoke as never as ReturnType<typeof vi.fn>).mockResolvedValue(catalog);

    const { result, rerender } = renderHook(() => useConversationAssistants());

    await waitFor(() => expect(result.current.presetAssistants).toHaveLength(2));

    const firstRenderAssistants = result.current.presetAssistants;
    rerender();

    expect(result.current.presetAssistants).toBe(firstRenderAssistants);
  });
});
