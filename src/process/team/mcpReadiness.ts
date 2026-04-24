// src/process/team/mcpReadiness.ts
//
// Simple wait/notify mechanism for MCP tool readiness.
// When codex-acp receives mcpServers in session/new, it spawns the stdio
// subprocess asynchronously. The stdio script sends a TCP "mcp_ready"
// notification to TeamMcpServer after server.connect() completes.
// createOrResumeSession() awaits waitForMcpReady() so the first user
// message is not dispatched until MCP tools are registered.

/** Pending wait entry keyed by slot_id */
const pendingReady = new Map<string, { resolve: () => void; timer: ReturnType<typeof setTimeout> }>();

/** Slots that notified readiness before waitForMcpReady was called */
const alreadyReady = new Set<string>();

/**
 * Wait for MCP tools to become ready for the given agent slot.
 * Resolves when `notifyMcpReady(slot_id)` is called, or after timeout.
 * Timeout resolves (not rejects) so the session degrades gracefully.
 */
export function waitForMcpReady(slot_id: string, timeoutMs = 30_000): Promise<void> {
  // If already notified before wait was registered, resolve immediately
  if (alreadyReady.delete(slot_id)) return Promise.resolve();

  return new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      pendingReady.delete(slot_id);
      console.warn(`[mcpReadiness] Timed out waiting for MCP ready: ${slot_id}`);
      resolve();
    }, timeoutMs);
    pendingReady.set(slot_id, { resolve, timer });
  });
}

/**
 * Signal that MCP tools are ready for the given agent slot.
 * Called by TeamMcpServer when it receives the TCP mcp_ready notification.
 */
export function notifyMcpReady(slot_id: string): void {
  const entry = pendingReady.get(slot_id);
  if (entry) {
    clearTimeout(entry.timer);
    pendingReady.delete(slot_id);
    entry.resolve();
  } else {
    // Notification arrived before wait — stash for immediate resolve
    alreadyReady.add(slot_id);
    setTimeout(() => alreadyReady.delete(slot_id), 60_000);
  }
}
