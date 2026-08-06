/**
 * Records `aioncore` WebSocket notifications inside the renderer so tests can
 * assert on the backend→frontend signal path.
 *
 * Why this exists as a helper rather than inline in one spec: the renderer is
 * the only place a test can observe these frames the way the app does. Playwright
 * cannot attach to the app's own `MonitorClient`, so the recorder opens a second
 * connection to the same `/ws` endpoint. That is safe — subscriptions are
 * per-session, and this socket never subscribes to anything, it only listens to
 * what the server broadcasts to it.
 *
 * Note the recorder is deliberately dumb: it stores every frame and does no
 * filtering. Filtering by name belongs to the caller, so a new notification kind
 * needs a new assertion, not a change here.
 */
import type { Page } from '@playwright/test';

/** One recorded frame: the notification's name plus its payload. */
export type MonitorEvent = {
  /**
   * `method` for JSON-RPC-shaped notifications (`fs/delta`, `fs/snapshot`, …),
   * `name`/`event` for the flat shape. `'unknown'` when neither is present and
   * `'non-json'` when the frame was not JSON at all — both surface a recorder
   * mismatch as visible data instead of an empty result.
   */
  name: string;
  data: unknown;
};

/** Connection state, so a test can wait for `'open'` before acting. */
export type MonitorRecorderStatus = 'connecting' | 'open' | 'closed' | 'error' | 'missing';

type RecorderWindow = Window & {
  __backendPort?: number;
  __e2eMonitorEvents?: { status: MonitorRecorderStatus; events: MonitorEvent[] };
  __e2eMonitorEventsWs?: WebSocket;
};

/**
 * Open the recording socket. Closes a previous one first, so calling this twice
 * in a page leaves one socket rather than accumulating listeners.
 *
 * Throws when `window.__backendPort` is absent: that means the backend never
 * started, and every later assertion would fail for that reason instead of the
 * one under test.
 */
export async function installMonitorRecorder(page: Page): Promise<void> {
  await page.evaluate(() => {
    const win = window as RecorderWindow;

    win.__e2eMonitorEventsWs?.close();

    const port = win.__backendPort;
    if (!port) {
      throw new Error('window.__backendPort is not available — is aioncore running?');
    }

    const store: { status: MonitorRecorderStatus; events: MonitorEvent[] } = {
      status: 'connecting',
      events: [],
    };
    win.__e2eMonitorEvents = store;

    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    win.__e2eMonitorEventsWs = ws;

    ws.addEventListener('open', () => (store.status = 'open'));
    ws.addEventListener('close', () => (store.status = 'closed'));
    ws.addEventListener('error', () => (store.status = 'error'));

    ws.addEventListener('message', (event) => {
      try {
        const parsed = JSON.parse(String(event.data)) as {
          method?: string;
          name?: string;
          event?: string;
          params?: unknown;
          data?: unknown;
          payload?: unknown;
        };

        /**
         * Two frame shapes reach this socket and the field names differ:
         * the `fs` channel is JSON-RPC (`{method, params}` — see
         * `dispatchMonitorNotification(method, params)`), while other
         * notifications are flat (`{name, data}`). Reading only one shape
         * records every frame of the other as `'unknown'`, which looks
         * identical to "the backend sent nothing" — so accept both.
         */
        store.events.push({
          name: parsed.method ?? parsed.name ?? parsed.event ?? 'unknown',
          data: parsed.params ?? parsed.data ?? parsed.payload,
        });
      } catch {
        store.events.push({ name: 'non-json', data: String(event.data) });
      }
    });
  });
}

/** Current connection status; `'missing'` when the recorder was never installed. */
export async function monitorRecorderStatus(page: Page): Promise<MonitorRecorderStatus> {
  return page.evaluate(() => (window as RecorderWindow).__e2eMonitorEvents?.status ?? 'missing');
}

/**
 * Frames recorded so far, oldest first. `nameFilter` keeps only exact name
 * matches — pass e.g. `'fs/delta'`; omit it to inspect everything, which is what
 * you want when a filtered read comes back empty and you need to see whether the
 * frames arrived under a different name.
 */
export async function readMonitorEvents(page: Page, nameFilter?: string): Promise<MonitorEvent[]> {
  return page.evaluate((filter) => {
    const events = (window as RecorderWindow).__e2eMonitorEvents?.events ?? [];
    return filter ? events.filter((event) => event.name === filter) : events;
  }, nameFilter);
}

/**
 * Drop recorded frames, keeping the socket open. Use between the phases of one
 * test so an assertion about "a signal arrived" cannot be satisfied by a frame
 * from an earlier phase.
 */
export async function clearMonitorEvents(page: Page): Promise<void> {
  await page.evaluate(() => {
    const store = (window as RecorderWindow).__e2eMonitorEvents;
    if (store) store.events = [];
  });
}

/** Close the socket. Safe to call when no recorder was installed. */
export async function uninstallMonitorRecorder(page: Page): Promise<void> {
  await page.evaluate(() => {
    const win = window as RecorderWindow;
    win.__e2eMonitorEventsWs?.close();
    win.__e2eMonitorEventsWs = undefined;
  });
}
