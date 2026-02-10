/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// Stub worker file for NanoBotAgentManager.
// BaseAgentManager resolves the worker path from the agent type name,
// but NanoBotAgentManager runs in-process (no forked worker needed).
export {};

if (require.main === module) {
  console.log('Nanobot worker started');
}
