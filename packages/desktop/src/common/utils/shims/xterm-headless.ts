// Use a path that won't be caught by the @xterm/headless alias
// eslint-disable-next-line @typescript-eslint/no-var-requires
const xtermHeadless = require('@xterm/headless/lib-headless/xterm-headless.js');
const Terminal = xtermHeadless.Terminal;

export { Terminal };
export default { Terminal };
