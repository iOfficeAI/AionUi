/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import VoiceCallEntry from '@/renderer/services/speech/voiceCall/VoiceCallEntry';
import { getClientBusinessSetting } from '@/renderer/services/clientBusinessSettings';

vi.mock('@/renderer/services/clientBusinessSettings', () => ({
  getClientBusinessSetting: vi.fn(),
}));

vi.mock('@/renderer/services/speech/voiceCall/VoiceCallButton', () => ({
  default: () => <button type='button'>voice-call-mounted</button>,
}));

describe('VoiceCallEntry runtime gate', () => {
  beforeEach(() => {
    vi.mocked(getClientBusinessSetting).mockReset();
  });

  it('renders nothing when the new setting is absent (default behavior)', async () => {
    vi.mocked(getClientBusinessSetting).mockResolvedValue(undefined);
    const { container } = render(<VoiceCallEntry conversationId='conversation-1' />);

    await waitFor(() => expect(getClientBusinessSetting).toHaveBeenCalledWith('tools.voiceCall'));
    expect(container).toBeEmptyDOMElement();
  });

  it('mounts the call control only after the user enables the setting', async () => {
    vi.mocked(getClientBusinessSetting).mockResolvedValue({ enabled: true });
    render(<VoiceCallEntry conversationId='conversation-1' />);

    expect(await screen.findByRole('button', { name: 'voice-call-mounted' })).toBeInTheDocument();
  });
});
