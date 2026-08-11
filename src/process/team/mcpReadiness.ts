// src/process/team/mcpReadiness.ts
//
// Simple wait/notify mechanism for MCP tool readiness.
// When codex-acp receives mcpServers in session/new, it spawns the stdio
// subprocess asynchronously. The stdio script sends a TCP "mcp_ready"
// notification to TeamMcpServer after server.connect() completes.
// createOrResumeSession() awaits waitForMcpReady() so the first user
// message is not dispatched until MCP tools are registered.

/** Pending wait entry keyed by slotId */
const pendingReady = new Map<string, { resolve: () => void; timer: ReturnType<typeof setTimeout> }>();

/** Slots that notified readiness before waitForMcpReady was called */
const alreadyReady = new Set<string>();

/**
 * Wait for MCP tools to become ready for the given agent slot.
 * Resolves when `notifyMcpReady(slotId)` is called, or after timeout.
 * Timeout resolves (not rejects) so the session degrades gracefully.
 */
export function waitForMcpReady(slotId: string, timeoutMs = 30_000): Promise<void> {
  // If already notified before wait was registered, resolve immediately
  if (alreadyReady.delete(slotId)) return Promise.resolve();

  return new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      pendingReady.delete(slotId);
      console.warn(`[mcpReadiness] Timed out waiting for MCP ready: ${slotId}`);
      resolve();
    }, timeoutMs);
    pendingReady.set(slotId, { resolve, timer });
  });
}

/**
 * Signal that MCP tools are ready for the given agent slot.
 * Called by TeamMcpServer when it receives the TCP mcp_ready notification.
 */
export function notifyMcpReady(slotId: string): void {
  const entry = pendingReady.get(slotId);
  if (entry) {
    clearTimeout(entry.timer);
    pendingReady.delete(slotId);
    entry.resolve();
  } else {
    // Notification arrived before wait — stash for immediate resolve
    alreadyReady.add(slotId);
    setTimeout(() => alreadyReady.delete(slotId), 60_000);
  }
}
