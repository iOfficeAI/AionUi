/**
 * Hello World Extension — Activation lifecycle hook.
 * Called when the extension is enabled.
 *
 * @param {Object} context - Lifecycle context
 * @param {string} context.extensionName - Name of the extension
 * @param {string} context.extensionDir - Directory of the extension
 * @param {string} context.version - Version of the extension
 */
module.exports = function onActivate(context) {
  console.log(`[hello-world] Extension activated! v${context.version}`);
  console.log(`[hello-world] Extension directory: ${context.extensionDir}`);
};
