import { afterEach, describe, expect, it } from 'vitest';
import { TunnelManager } from '@/webserver/remote/TunnelManager';

describe('webserver/remote/TunnelManager', () => {
  const originalPublicUrl = process.env.AIONUI_REMOTE_PUBLIC_URL;

  afterEach(() => {
    if (originalPublicUrl === undefined) {
      delete process.env.AIONUI_REMOTE_PUBLIC_URL;
    } else {
      process.env.AIONUI_REMOTE_PUBLIC_URL = originalPublicUrl;
    }
  });

  it('starts cloudflare tunnel with configured public url', async () => {
    process.env.AIONUI_REMOTE_PUBLIC_URL = 'https://remote.example.com';
    const manager = new TunnelManager();

    const status = await manager.start('cloudflare', 25808);

    expect(status.enabled).toBe(true);
    expect(status.provider).toBe('cloudflare');
    expect(status.publicUrl).toBe('https://remote.example.com');
    expect(status.startedAt).toBeDefined();
  });

  it('starts cloudflare tunnel without url and then stops', async () => {
    delete process.env.AIONUI_REMOTE_PUBLIC_URL;
    const manager = new TunnelManager();

    const started = await manager.start('cloudflare', 25808);
    expect(started.enabled).toBe(true);
    expect(started.provider).toBe('cloudflare');
    expect(started.publicUrl).toBeUndefined();
    expect(started.message).toContain('Cloudflare adapter is ready');

    const stopped = await manager.stop();
    expect(stopped.enabled).toBe(false);
    expect(stopped.provider).toBe('none');
    expect(manager.getStatus().provider).toBe('none');
  });

  it('throws for unsupported provider', async () => {
    const manager = new TunnelManager();

    await expect(manager.start('custom' as never, 25808)).rejects.toThrow('Unsupported tunnel provider');
  });
});
