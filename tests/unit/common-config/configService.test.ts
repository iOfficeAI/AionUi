import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configService } from '@/common/config/configService';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

const json = (data: unknown) =>
  new Response(JSON.stringify({ data }), {
    headers: { 'Content-Type': 'application/json' },
  });
const unavailable = () => new Response('Unavailable', { status: 503 });
const fetchMock = vi.fn<typeof fetch>();

describe('config persistence', () => {
  beforeEach(() => {
    configService.reset();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('retains the saved value when a write fails, without publishing an unsaved value', async () => {
    configService.setLocal('theme.activeId', 'light');
    const subscriber = vi.fn();
    configService.subscribe('theme.activeId', subscriber);
    fetchMock.mockResolvedValue(unavailable());

    await expect(configService.set('theme.activeId', 'custom')).rejects.toThrow('503');

    expect(configService.get('theme.activeId')).toBe('light');
    expect(subscriber).not.toHaveBeenCalled();
  });

  it('preserves a value when removal fails', async () => {
    configService.setLocal('theme.activeId', 'custom');
    fetchMock.mockResolvedValue(unavailable());
    await expect(configService.remove('theme.activeId')).rejects.toThrow('503');
    expect(configService.get('theme.activeId')).toBe('custom');
  });

  it('keeps a failed batch atomic in the cache', async () => {
    configService.setLocal('theme.activeId', 'light');
    configService.setLocal('language', 'en-US');
    fetchMock.mockResolvedValue(unavailable());
    await expect(configService.setBatch({ 'theme.activeId': 'dark', language: 'zh-CN' })).rejects.toThrow('503');
    expect([configService.get('theme.activeId'), configService.get('language')]).toEqual(['light', 'en-US']);
  });

  it('sends overlapping writes in order and continues after an earlier failure', async () => {
    const firstResponse = deferred<Response>();
    const persisted: string[] = [];
    fetchMock
      .mockImplementationOnce(() => firstResponse.promise)
      .mockImplementation(async (_input, init) => {
        persisted.push((JSON.parse(String(init?.body)) as Record<string, string>)['theme.activeId']);
        return json(null);
      });
    const first = configService.set('theme.activeId', 'dark');
    const firstFailure = first.catch((error: unknown) => error);
    const second = configService.set('theme.activeId', 'custom');
    await Promise.resolve();
    const requestsWhilePending = fetchMock.mock.calls.length;
    firstResponse.resolve(unavailable());
    expect(String(await firstFailure)).toContain('503');
    await second;
    expect(requestsWhilePending).toBe(1);
    expect(persisted).toEqual(['custom']);
    expect(configService.get('theme.activeId')).toBe('custom');
  });

  it('does not let a stale initialization overwrite a completed write', async () => {
    const initialResponse = deferred<Response>();
    fetchMock.mockImplementation((_input, init) =>
      init?.method === 'GET' ? initialResponse.promise : Promise.resolve(json(null))
    );
    const initialization = configService.initialize();
    await configService.set('theme.activeId', 'custom');
    initialResponse.resolve(json({ 'theme.activeId': 'light', language: 'zh-CN' }));
    await initialization;
    expect(configService.get('theme.activeId')).toBe('custom');
    expect(configService.get('language')).toBe('zh-CN');
  });

  it('publishes a coherent recovered snapshot after initial loading fails', async () => {
    fetchMock
      .mockResolvedValueOnce(unavailable())
      .mockResolvedValueOnce(json({ 'theme.activeId': 'custom', 'theme.userThemes': [] }));
    const observed: unknown[] = [];
    configService.subscribe('theme.activeId', () => observed.push(configService.get('theme.userThemes')));
    await expect(configService.initialize()).rejects.toThrow('503');
    await configService.initialize();
    expect(observed).toEqual([[]]);
    expect(configService.isInitialized()).toBe(true);
  });

  it('uses a null tombstone when an optional setting is cleared', async () => {
    fetchMock.mockResolvedValue(json(null));
    await configService.set('ui.fontSize.app', undefined);
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({ 'ui.fontSize.app': null });
    expect(configService.get('ui.fontSize.app')).toBeUndefined();
  });

  it('ignores an old initialization after reset', async () => {
    const previous = deferred<Response>();
    fetchMock.mockReturnValueOnce(previous.promise).mockResolvedValueOnce(json({ language: 'zh-CN' }));
    const stale = configService.initialize();
    configService.reset();
    await configService.initialize();
    previous.resolve(json({ language: 'en-US' }));
    await stale;
    expect(configService.get('language')).toBe('zh-CN');
  });

  it('notifies other subscribers when a subscriber throws after a successful save', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const subscriber = vi.fn();
    configService.subscribe('theme.activeId', () => {
      throw new Error('broken subscriber');
    });
    configService.subscribe('theme.activeId', subscriber);
    fetchMock.mockResolvedValue(json(null));

    await expect(configService.set('theme.activeId', 'custom')).resolves.toBeUndefined();

    expect(subscriber).toHaveBeenCalledWith('custom');
    consoleError.mockRestore();
  });

  it('publishes successful batch values together only after the response arrives', async () => {
    const response = deferred<Response>();
    configService.setLocal('theme.activeId', 'light');
    configService.setLocal('language', 'en-US');
    const observed: unknown[] = [];
    configService.subscribe('theme.activeId', () => observed.push(configService.get('language')));
    fetchMock.mockReturnValue(response.promise);
    const save = configService.setBatch({ 'theme.activeId': 'custom', language: 'zh-CN' });
    expect(configService.get('theme.activeId')).toBe('light');
    response.resolve(json(null));
    await save;
    expect(observed).toEqual(['zh-CN']);
    expect(configService.get('theme.activeId')).toBe('custom');
  });

  it('does not send a queued save after reset and ignores an earlier save completion', async () => {
    const response = deferred<Response>();
    fetchMock.mockReturnValue(response.promise);
    const first = configService.set('language', 'en-US').catch((error: unknown) => error);
    const second = configService.set('language', 'ja-JP').catch((error: unknown) => error);
    await Promise.resolve();
    configService.reset();
    configService.setLocal('language', 'zh-CN');
    response.resolve(json(null));
    expect(String(await first)).toContain('reset while saving');
    expect(String(await second)).toContain('reset before saving');
    expect(configService.get('language')).toBe('zh-CN');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
