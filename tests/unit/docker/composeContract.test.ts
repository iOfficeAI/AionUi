/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Structural contract for the team-hosting Compose files shipped in-repo.
 * Parses the source files (not re-implemented compose semantics) so a regression
 * that points the release image at a personal fork, drops the healthcheck, or
 * hardcodes a bootstrap password fails unit tests before a deploy.
 */

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '../../..');

function readCompose(name: string): string {
  return fs.readFileSync(path.join(repoRoot, name), 'utf8');
}

describe('docker-compose team hosting contracts', () => {
  it('release compose pulls upstream iOfficeAI image and never builds from a personal fork by default', () => {
    const source = readCompose('docker-compose.yml');
    expect(source).toMatch(/image:\s*\$\{AIONUI_IMAGE:-ghcr\.io\/iofficeai\/aionui\}/);
    expect(source).toMatch(/AIONUI_IMAGE_TAG:-latest/);
    expect(source).toMatch(/pull_policy:\s*\$\{AIONUI_PULL_POLICY:-always\}/);
    expect(source).not.toMatch(/^\s*build:/m);
    expect(source).not.toMatch(/ghcr\.io\/nicolaeser\//i);
    expect(source).toMatch(/AIONUI_INITIAL_ADMIN_CREDENTIALS_FILE:\s*\/data\/initial-admin-credentials\.json/);
    expect(source).toMatch(/\/api\/auth\/status/);
    expect(source).toMatch(/127\.0\.0\.1/);
    // No plaintext bootstrap passwords in the public compose file.
    expect(source).not.toMatch(/AIONUI_INITIAL_ADMIN_PASSWORD/);
    expect(source).not.toMatch(/temporary_password/i);
  });

  it('dev compose builds from the local Dockerfile with the same runtime security posture', () => {
    const source = readCompose('docker-compose.dev.yml');
    expect(source).toMatch(/pull_policy:\s*\$\{AIONUI_PULL_POLICY:-build\}/);
    expect(source).toMatch(/dockerfile:\s*Dockerfile/);
    expect(source).toMatch(/context:\s*\./);
    expect(source).toMatch(/image:\s*\$\{AIONUI_IMAGE:-aionui:local\}/);
    expect(source).toMatch(/read_only:\s*true/);
    expect(source).toMatch(/cap_drop:[\s\S]*ALL/);
    expect(source).toMatch(/AIONUI_ALLOW_REMOTE:\s*'true'/);
    expect(source).toMatch(/\/api\/auth\/status/);
    expect(source).toMatch(/AIONUI_INITIAL_ADMIN_CREDENTIALS_FILE:\s*\/data\/initial-admin-credentials\.json/);
  });
});
