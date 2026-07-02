import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(__dirname, '../../..');

function readRepoFile(path: string): string {
  return readFileSync(resolve(repoRoot, path), 'utf-8');
}

describe('Sentry release CI configuration', () => {
  it('fails desktop builds early when Sentry upload credentials are invalid', () => {
    const workflow = readRepoFile('.github/workflows/_build-reusable.yml');

    expect(workflow).toContain('Validate Sentry source map upload configuration');
    expect(workflow).toContain("matrix.platform == 'linux-x64'");
    expect(workflow).toContain('SENTRY_AUTH_TOKEN SENTRY_ORG SENTRY_PROJECT SENTRY_RELEASE');
    expect(workflow).toContain('SENTRY_RELEASE');
  });

  it('uploads source maps from one deterministic desktop build only', () => {
    const workflow = readRepoFile('.github/workflows/_build-reusable.yml');
    const viteConfig = readRepoFile('packages/desktop/electron.vite.config.ts');

    expect(workflow).toContain('Configure Sentry source map upload owner');
    expect(workflow).toContain('SENTRY_UPLOAD_SOURCE_MAPS=true');
    expect(workflow).toContain('SENTRY_UPLOAD_SOURCE_MAPS=false');
    expect(viteConfig).toContain("process.env.SENTRY_UPLOAD_SOURCE_MAPS === 'true'");
  });

  it('uses an explicit Sentry release name instead of plugin defaults', () => {
    const viteConfig = readRepoFile('packages/desktop/electron.vite.config.ts');

    expect(viteConfig).toContain('const sentryReleaseName');
    expect(viteConfig).toContain('release:');
    expect(viteConfig).toContain('name: sentryReleaseName');
    expect(viteConfig).toContain('errorHandler:');
    expect(viteConfig).toContain('throw error');
  });
});
