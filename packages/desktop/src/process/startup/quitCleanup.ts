/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

type BeforeQuitEvent = {
  preventDefault: () => void;
};

type QuitCleanupDeps = {
  onBeforeQuit: (handler: (event: BeforeQuitEvent) => void) => void;
  quitApp: () => void;
  setIsQuitting: (value: boolean) => void;
  markExplicitQuit: () => void;
  destroyTray: () => void;
  disposeCronResumeListener: () => void;
  stopBackend: () => Promise<void>;
  destroyPetWindow: () => Promise<void> | void;
  logInfo: (message: string) => void;
  logWarn: (message: string) => void;
  logError: (message: string, error: unknown) => void;
  timeoutMs?: number;
};

const DEFAULT_QUIT_CLEANUP_TIMEOUT_MS = 10_000;

async function runWithTimeout(
  work: Promise<void>,
  timeoutMs: number,
  logWarn: (message: string) => void
): Promise<void> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;
  const timeout = new Promise<void>((resolve) => {
    timeoutId = setTimeout(() => {
      timedOut = true;
      logWarn('[AionUi] Cleanup timed out after 10s, forcing quit');
      resolve();
    }, timeoutMs);
  });

  await Promise.race([work, timeout]);
  if (!timedOut && timeoutId) {
    clearTimeout(timeoutId);
  }
}

async function runQuitCleanup(deps: QuitCleanupDeps): Promise<void> {
  deps.logInfo('[AionUi] before-quit');
  deps.setIsQuitting(true);
  deps.markExplicitQuit();
  deps.destroyTray();

  const cleanup = async () => {
    deps.disposeCronResumeListener();

    // Destroy the pet windows IMMEDIATELY — the user has quit, so the pet
    // must vanish from screen right away. Backend shutdown can take seconds
    // (graceful SIGTERM), so the two run in parallel instead of sequentially:
    // awaiting stopBackend first left the pet visible through the whole
    // backend teardown.
    const petDestroyed = Promise.resolve()
      .then(() => deps.destroyPetWindow())
      .catch(() => {
        /* pet not initialized */
      });

    await Promise.all([
      petDestroyed,
      deps.stopBackend().catch((err) => deps.logError('[App] Failed to stop backend:', err)),
    ]);
  };

  await runWithTimeout(cleanup(), deps.timeoutMs ?? DEFAULT_QUIT_CLEANUP_TIMEOUT_MS, deps.logWarn);
}

export function installQuitCleanup(deps: QuitCleanupDeps): void {
  let cleanupStarted = false;
  let cleanupCompleted = false;

  deps.onBeforeQuit((event) => {
    if (cleanupCompleted) {
      return;
    }

    event.preventDefault();
    if (cleanupStarted) {
      return;
    }

    cleanupStarted = true;
    void runQuitCleanup(deps).finally(() => {
      cleanupCompleted = true;
      deps.quitApp();
    });
  });
}
