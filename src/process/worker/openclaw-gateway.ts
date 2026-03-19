/**
 * OpenClaw Gateway worker entry point
 * This file serves as the entry point for the openclaw-gateway worker process.
 *
 * Note: OpenClawAgentManager runs the agent in-process (not via fork),
 * but BaseAgentManager requires a valid worker file path at construction time.
 */

export {};

if (require.main === module) {
  console.log('OpenClaw Gateway worker started');
}
