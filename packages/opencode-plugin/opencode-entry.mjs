// OpenCode server-plugin entry. Referenced by package.json `exports["./server"]`,
// which OpenCode's plugin loader resolves FIRST (before `main`) for server plugins.
// Never point the loader at dist/index.js — its barrel namespace contains classes
// and constants, which fails the legacy loader's "every export must be a function" rule.
import { createPlugin } from './dist/capabilities.js';

export default async function chislOpencodePlugin(input, options) {
  return createPlugin(input, options);
}
