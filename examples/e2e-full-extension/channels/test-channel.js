/**
 * E2E Test Channel Plugin - mock implementation for testing.
 *
 * This is a minimal channel plugin that satisfies the extension loader's
 * requirement for a valid entryPoint JS file, but does not actually
 * connect to any external service.
 */

class E2eTestChannelPlugin {
  constructor(config) {
    this.config = config;
    this.running = false;
  }

  async start() {
    this.running = true;
    return { ok: true };
  }

  async stop() {
    this.running = false;
    return { ok: true };
  }

  async sendMessage(to, message) {
    return { delivered: false, reason: 'mock-plugin' };
  }

  isRunning() {
    return this.running;
  }
}

module.exports = E2eTestChannelPlugin;
module.exports.default = E2eTestChannelPlugin;
module.exports.Plugin = E2eTestChannelPlugin;
