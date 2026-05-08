/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { AcpDetectedAgent } from '@/common/types/detectedAgent';

/**
 * Compatibility stub kept only so legacy tests can mock this module path while
 * the Electron-side extension detector remains fully removed.
 */
class AcpDetector {
  clearEnvCache(): void {}

  isCliAvailable(_cliCommand: string): boolean {
    return false;
  }

  async detectBuiltinAgents(): Promise<AcpDetectedAgent[]> {
    return [];
  }

  async detectExtensionAgents(): Promise<AcpDetectedAgent[]> {
    return [];
  }

  async detectCustomAgents(): Promise<AcpDetectedAgent[]> {
    return [];
  }
}

export const acpDetector = new AcpDetector();
