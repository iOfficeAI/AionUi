/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { AcpBackendAll } from './acpTypes';

/**
 * MCP source type — includes all ACP backends and AionUi built-in sources.
 * Shared between renderer and main process, defined in common to support front-end build independence.
 */
export type McpSource = AcpBackendAll | 'gemini' | 'aionui' | 'aionrs';
