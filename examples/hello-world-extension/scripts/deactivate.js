/**
 * Hello World Extension — Deactivation lifecycle hook.
 * Called when the extension is disabled.
 *
 * @param {Object} context - Lifecycle context
 * @param {string} context.extensionName - Name of the extension
 * @param {string} context.extensionDir - Directory of the extension
 * @param {string} context.version - Version of the extension
 */
module.exports = function onDeactivate(context) {
  console.log(`[hello-world] Extension deactivated! v${context.version}`);
};
