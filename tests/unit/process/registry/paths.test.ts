/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Unit tests for registry path resolution (t2-registry-01 / t2-registry-03).
 */

import path from 'path';
import { describe, expect, it } from 'vitest';
import { CHISL_SERVERS_FILENAME, resolveChislServersJsonPath } from '@/process/services/registry/paths';

describe('resolveChislServersJsonPath', () => {
  it('appends the chisl-servers.json filename to the data directory', () => {
    const result = resolveChislServersJsonPath('/tmp/test-data');
    expect(result).toBe(path.join('/tmp/test-data', CHISL_SERVERS_FILENAME));
  });

  it('uses the default CHISL_SERVERS_FILENAME constant', () => {
    expect(CHISL_SERVERS_FILENAME).toBe('chisl-servers.json');
  });

  it('resolves to the platform data dir when no argument is given', () => {
    const result = resolveChislServersJsonPath();
    expect(result).toContain('chisl-servers.json');
    expect(result).not.toBe('chisl-servers.json');
  });
});
