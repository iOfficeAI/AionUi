/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { resolveAssistantAvatar } from '@/renderer/utils/model/assistantAvatar';

describe('resolveAssistantAvatar', () => {
  it('treats assistant avatar api routes as image sources', () => {
    expect(resolveAssistantAvatar('/api/assistants/custom-1/avatar')).toEqual({
      kind: 'image',
      value: '/api/assistants/custom-1/avatar',
    });
  });

  it('treats data urls as image sources', () => {
    expect(resolveAssistantAvatar('data:image/svg+xml;base64,PHN2Zy8+')).toEqual({
      kind: 'image',
      value: 'data:image/svg+xml;base64,PHN2Zy8+',
    });
  });

  it('does not derive avatar routes from local absolute assistant asset paths', () => {
    expect(resolveAssistantAvatar('/Users/demo/.aionui/assistant-avatars/custom-1.jpg')).toEqual({
      kind: 'fallback',
    });
  });

  it('does not expose local absolute paths as image sources without an assistant id', () => {
    expect(resolveAssistantAvatar('/Users/demo/.aionui/assistant-avatars/custom-1.jpg')).toEqual({
      kind: 'fallback',
    });
  });

  it('does not expose file urls as image sources without an assistant id', () => {
    expect(resolveAssistantAvatar('file:///Users/demo/.aionui/assistant-avatars/custom-1.jpg')).toEqual({
      kind: 'fallback',
    });
  });

  it('keeps emoji avatars as emoji', () => {
    expect(resolveAssistantAvatar('🤖')).toEqual({
      kind: 'emoji',
      value: '🤖',
    });
  });
});
