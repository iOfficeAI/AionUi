import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { readCodexConfiguredModel } from '@/process/agent/codex/appserver/codexCliConfig';

describe('codexCliConfig', () => {
  it('reads the configured Codex model from config.toml', () => {
    const dir = mkdtempSync(join(tmpdir(), 'aionui-codex-config-'));
    const configPath = join(dir, 'config.toml');
    writeFileSync(
      configPath,
      ['model_provider = "sub2api"', 'model = "gpt-5.6-sol"', '', '[model_providers.sub2api]', 'name = "sub2api"'].join(
        '\n'
      )
    );

    expect(readCodexConfiguredModel(configPath)).toBe('gpt-5.6-sol');
  });
});
