/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// Re-export from canonical location in common/types
export type {
  DetectedAgentKind,
  DetectedAgent,
  AcpDetectedAgent,
  GeminiDetectedAgent,
  RemoteDetectedAgent,
  AionrsDetectedAgent,
  NanobotDetectedAgent,
  OpenClawDetectedAgent,
  RemoteAgentProtocol,
  RemoteAgentAuthType,
} from '@/common/types/detectedAgent';

export { isAgentKind } from '@/common/types/detectedAgent';
