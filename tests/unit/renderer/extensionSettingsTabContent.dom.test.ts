import { describe, expect, it, vi } from 'vitest';
import { buildEmbeddedExtensionHtml } from '../../../src/renderer/components/settings/SettingsModal/contents/ExtensionSettingsTabContent';

describe('buildEmbeddedExtensionHtml', () => {
  it('should inline relative styles and scripts for browser-embedded extension html', async () => {
    const assetLoader = vi.fn(async (assetUrl: string) => {
      if (assetUrl.endsWith('api-diagnostics.css')) {
        return '.shell{color:red;}';
      }

      if (assetUrl.endsWith('api-diagnostics.js')) {
        return 'window.__diagnosticsLoaded = true;';
      }

      throw new Error(`Unexpected asset request: ${assetUrl}`);
    });

    const html = `
      <!doctype html>
      <html lang="zh-CN">
        <head>
          <link rel="stylesheet" href="./api-diagnostics.css" />
        </head>
        <body>
          <img src="./images/panel.png" />
          <script src="./api-diagnostics.js"></script>
        </body>
      </html>
    `;

    const output = await buildEmbeddedExtensionHtml(
      html,
      'aion-asset://asset/E:/code/ext/settings/api-diagnostics.html',
      assetLoader
    );

    expect(output).toContain('.shell{color:red;}');
    expect(output).toContain('window.__diagnosticsLoaded = true;');
    expect(output).toContain('/api/ext-asset?path=E%3A%2Fcode%2Fext%2Fsettings%2Fimages%2Fpanel.png');
    expect(output).not.toContain('./api-diagnostics.css');
    expect(output).not.toContain('./api-diagnostics.js');
  });

  it('should preserve a rewritten asset url when inlining a stylesheet fails', async () => {
    const assetLoader = vi.fn(async () => {
      throw new Error('load failed');
    });

    const html = `
      <!doctype html>
      <html>
        <head>
          <link rel="stylesheet" href="./api-diagnostics.css" />
        </head>
        <body></body>
      </html>
    `;

    const output = await buildEmbeddedExtensionHtml(
      html,
      'aion-asset://asset/E:/code/ext/settings/api-diagnostics.html',
      assetLoader
    );

    expect(output).toContain('/api/ext-asset?path=E%3A%2Fcode%2Fext%2Fsettings%2Fapi-diagnostics.css');
  });
});
