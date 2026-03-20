/**
 * Build script for the standalone server.
 *
 * Uses esbuild directly instead of `bun build` to support a wasm-stub plugin
 * that handles Vite-specific `*.wasm?binary` imports found inside
 * @office-ai/aioncli-core. Those WASM files are only needed for tree-sitter
 * syntax highlighting and are never executed by the standalone server.
 *
 * Output format is ESM (.mjs) so that:
 * - import.meta.url is correctly set at runtime (fixes open@10 which uses it)
 * - ESM-only dependencies (@office-ai/aioncli-core, npm-run-path, etc.) load
 *   without CJS/ESM interop errors
 * - eval('require') works via the createRequire banner shim
 */

import { build } from 'esbuild'

// Stub out Vite-specific .wasm?binary imports — return an empty Uint8Array so
// the dynamic import resolves without throwing at bundle time or at startup.
const wasmStubPlugin = {
  name: 'wasm-stub',
  setup(build) {
    build.onResolve({ filter: /\.wasm(\?binary)?$/ }, (args) => ({
      path: args.path,
      namespace: 'wasm-stub',
    }))
    build.onLoad({ filter: /.*/, namespace: 'wasm-stub' }, () => ({
      // ESM-compatible stub: export as default so both import and require work
      contents: 'export default new Uint8Array()',
      loader: 'js',
    }))
  },
}

await build({
  entryPoints: ['src/server.ts'],
  outdir: 'dist-server',
  platform: 'node',
  target: 'node22',
  bundle: true,
  format: 'esm',
  // Output as .mjs so Node.js treats it as ESM unconditionally
  outExtension: { '.js': '.mjs' },
  // tsconfig provides path alias resolution (@/*, @process/*, etc.)
  tsconfig: 'tsconfig.json',
  // Native addons (.node binaries) cannot be bundled — keep as runtime require()
  external: ['better-sqlite3', 'keytar', 'node-pty'],
  plugins: [wasmStubPlugin],
  // Inject CJS compatibility shims so bundled code that uses __dirname,
  // __filename, or eval('require') continues to work in the ESM output.
  // Use aliased imports to avoid collisions with names used inside the bundle.
  banner: {
    js: [
      "import { createRequire as __shim_createRequire } from 'module';",
      "import { fileURLToPath as __shim_fileURLToPath } from 'url';",
      "import { dirname as __shim_dirname } from 'path';",
      "const require = __shim_createRequire(import.meta.url);",
      "const __filename = __shim_fileURLToPath(import.meta.url);",
      "const __dirname = __shim_dirname(__filename);",
    ].join('\n'),
  },
  logLevel: 'info',
})
