/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

const DEFAULT_REMOTE_AGENT_KEY = 'aionui.defaultRemoteAgentId';

export const getDefaultRemoteAgentId = (): string | null => {
  try {
    return localStorage.getItem(DEFAULT_REMOTE_AGENT_KEY);
  } catch {
    return null;
  }
};

export const setDefaultRemoteAgentId = (id: string | null): void => {
  try {
    if (id) {
      localStorage.setItem(DEFAULT_REMOTE_AGENT_KEY, id);
    } else {
      localStorage.removeItem(DEFAULT_REMOTE_AGENT_KEY);
    }
  } catch {
    // localStorage unavailable — silently ignore
  }
};
