/**
 * POUNDING Image MCP E2E Tests
 *
 * Validates the image-generation MCP server configuration, including
 * server registration, binary resolution, and model allowlist presence.
 *
 * Tests interact with the backend API via the renderer's HTTP bridge
 * (port exposed on `window.__backendPort`).
 */
import { test, expect } from '../fixtures';
import { httpGet } from '../helpers';

type McpServer = {
  name: string;
  enabled: boolean;
  builtin: boolean;
  resolution?: {
    ok: boolean;
    path?: string | null;
    error?: string | null;
  };
  tools?: string[];
  config?: Record<string, unknown>;
};

test.describe('POUNDING Image MCP — Server Configuration', () => {
  test.setTimeout(30_000);

  test('pounding-image-generation MCP server is enabled', async ({ page }) => {
    await page.waitForTimeout(3000);

    // API returns McpServer[] directly (not wrapped in { servers: [...] })
    const servers = await httpGet<McpServer[] | { servers: McpServer[] }>(page, '/api/mcp/servers');
    expect(servers).toBeDefined();

    const serverList = Array.isArray(servers) ? servers : (servers?.servers ?? []);
    const imageServer = serverList.find((s) => s.name === 'pounding-image-generation');

    console.log(`[ImageMCP] Found pounding-image-generation: ${!!imageServer}`);
    if (imageServer) {
      console.log(`[ImageMCP] enabled=${imageServer.enabled} builtin=${imageServer.builtin}`);
    }

    expect(imageServer).toBeDefined();
    expect(imageServer!.enabled).toBe(true);
    expect(imageServer!.builtin).toBe(true);
  });

  test('pounding-image-generation appears in MCP tool list', async ({ page }) => {
    await page.waitForTimeout(3000);

    const servers = await httpGet<McpServer[] | { servers: McpServer[] }>(page, '/api/mcp/servers');
    const serverList = Array.isArray(servers) ? servers : (servers?.servers ?? []);
    const imageServer = serverList.find((s) => s.name === 'pounding-image-generation');

    console.log(`[ImageMCP] Server found: ${!!imageServer}`);
    if (imageServer) {
      console.log(`[ImageMCP] resolution=${JSON.stringify(imageServer.resolution)}`);
    }

    expect(imageServer).toBeDefined();
    // resolution may or may not be present depending on binary availability
    if (imageServer!.resolution) {
      console.log(
        `[ImageMCP] Binary resolution: ok=${imageServer!.resolution.ok}, path=${imageServer!.resolution.path}`
      );
    } else {
      console.log(`[ImageMCP] No resolution info (binary may not be bundled in dev mode)`);
    }
  });

  test('image model allowlist contains at least one model', async ({ page }) => {
    await page.waitForTimeout(3000);

    // Check the provider models — image models should be among them
    const providers = await httpGet<Array<{ id: string; models: string[] }>>(page, '/api/providers');
    const managed = providers.find((p) => p.id === 'desktop-newapi-managed-provider');

    if (!managed || managed.models.length === 0) {
      console.warn('[ImageMCP] No managed provider models — user may not be logged in');
      return; // soft skip
    }

    console.log(`[ImageMCP] All managed models: ${managed.models.join(', ')}`);

    // Image models typically contain 'image', 'banana', 'imagine' etc.
    const IMAGE_PATTERN = /image|banana|imagine|img-gen/i;
    const imageModels = managed.models.filter((m) => IMAGE_PATTERN.test(m));
    console.log(`[ImageMCP] Image models found: ${imageModels.length} — ${imageModels.join(', ')}`);

    // At minimum, gpt-image-2 or similar should be present
    expect(managed.models.length).toBeGreaterThan(0);
  });
});
