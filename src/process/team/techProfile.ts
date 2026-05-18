/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs';
import path from 'path';

/**
 * Reads .aicore/tech-profile.yaml from the given workspace directory.
 * Returns the raw YAML content as a string, or null if not found.
 *
 * We intentionally avoid pulling in a full YAML parser — the file is
 * injected as-is into the agent prompt, where the LLM can interpret it.
 */
export function readTechProfile(workspaceDir: string): string | null {
  if (!workspaceDir) return null;
  const profilePath = path.join(workspaceDir, '.aicore', 'tech-profile.yaml');
  try {
    if (!fs.existsSync(profilePath)) return null;
    const content = fs.readFileSync(profilePath, 'utf-8').trim();
    return content || null;
  } catch {
    return null;
  }
}
