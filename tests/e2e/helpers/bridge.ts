import type { Page } from '@playwright/test';

type ElectronApi = {
  emit?: (name: string, data: unknown) => Promise<unknown>;
  on?: (callback: (payload: { event: unknown; value: unknown }) => void) => () => void;
};

/**
 * Invoke a bridge provider from renderer test context.
 * The @office-ai/platform provider protocol is:
 *   emit('subscribe-{key}', { id, data }) -> on('subscribe.callback-{key}{id}', result)
 */
export async function invokeBridge<T = unknown>(
  page: Page,
  key: string,
  data?: unknown,
  timeoutMs = 10_000
): Promise<T> {
  return page.evaluate(
    async ({ requestKey, requestData, requestTimeoutMs }) => {
      const api = (window as unknown as { electronAPI?: ElectronApi }).electronAPI;
      if (!api?.emit || !api?.on) {
        throw new Error('electronAPI bridge is unavailable in renderer context');
      }

      const id = `e2e_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;
      const callbackEventName = `subscribe.callback-${requestKey}${id}`;
      const requestEventName = `subscribe-${requestKey}`;

      return new Promise<unknown>((resolve, reject) => {
        let settled = false;
        const off = api.on?.((payload) => {
          try {
            const rawValue = payload?.value;
            const parsed =
              typeof rawValue === 'string'
                ? (JSON.parse(rawValue) as { name?: string; data?: unknown })
                : (rawValue as { name?: string; data?: unknown });
            if (parsed?.name !== callbackEventName) return;
            if (settled) return;
            settled = true;
            off?.();
            clearTimeout(timer);
            resolve(parsed.data);
          } catch (error) {
            if (settled) return;
            settled = true;
            off?.();
            clearTimeout(timer);
            reject(error);
          }
        });

        const timer = setTimeout(() => {
          if (settled) return;
          settled = true;
          off?.();
          reject(new Error(`Bridge invoke timeout: ${requestKey}`));
        }, requestTimeoutMs);

        api.emit?.(requestEventName, { id, data: requestData }).catch((error) => {
          if (settled) return;
          settled = true;
          off?.();
          clearTimeout(timer);
          reject(error);
        });
      });
    },
    { requestKey: key, requestData: data, requestTimeoutMs: timeoutMs }
  ) as Promise<T>;
}
