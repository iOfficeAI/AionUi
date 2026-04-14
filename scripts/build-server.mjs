/**
 * Build script for the standalone server.
 *
 * Uses esbuild directly instead of `bun build` to support WASM handling plugins
 * for Vite-specific `*.wasm?binary` imports found inside @office-ai/aioncli-core.
 *
 * - Main server (server.mjs): WASM is stubbed — tree-sitter is never executed.
 * - Worker processes (gemini.js, etc.): WASM is loaded from dist-server/wasm/ at
 *   runtime so tree-sitter shell parsing works correctly.
 *
 * Output format is ESM (.mjs) so that:
 * - import.meta.url is correctly set at runtime (fixes open@10 which uses it)
 * - ESM-only dependencies (@office-ai/aioncli-core, npm-run-path, etc.) load
 *   without CJS/ESM interop errors
 * - eval('require') works via the createRequire banner shim
 */

import { build } from 'esbuild';
import { copyFileSync, mkdirSync, cpSync, existsSync } from 'fs';
import { join, basename, resolve } from 'path';

// Copy tree-sitter WASM files to dist-server/wasm/ so worker processes can load
// them at runtime. This avoids inlining ~1.5MB of binary data into the bundle.
const wasmSources = [
  resolve('node_modules/web-tree-sitter/tree-sitter.wasm'),
  resolve('node_modules/tree-sitter-bash/tree-sitter-bash.wasm'),
];
mkdirSync('dist-server/wasm', { recursive: true });
for (const src of wasmSources) {
  copyFileSync(src, join('dist-server/wasm', basename(src)));
}

// Copy built-in skills to dist-server/skills/ so standalone mode can initialize
// them into the user config directory on first startup.
const skillsSrc = resolve('src/process/resources/skills');
if (existsSync(skillsSrc)) {
  cpSync(skillsSrc, resolve('dist-server/skills'), { recursive: true });
}

// Stub out Vite-specific .wasm?binary imports for the main server entry —
// server.mjs serves static files and never executes WASM directly.
const wasmStubPlugin = {
  name: 'wasm-stub',
  setup(build) {
    build.onResolve({ filter: /\.wasm(\?binary)?$/ }, (args) => ({
      path: args.path,
      namespace: 'wasm-stub',
    }));
    build.onLoad({ filter: /.*/, namespace: 'wasm-stub' }, () => ({
      // ESM-compatible stub: export as default so both import and require work
      contents: 'export default new Uint8Array()',
      loader: 'js',
    }));
  },
};

// For worker processes, replace .wasm?binary imports with runtime fs.readFileSync
// calls pointing to dist-server/wasm/. The __dirname banner shim makes this work
// in ESM output without needing import.meta.url resolution.
const wasmRuntimePlugin = {
  name: 'wasm-runtime',
  setup(build) {
    build.onResolve({ filter: /\.wasm(\?binary)?$/ }, (args) => ({
      path: args.path,
      namespace: 'wasm-runtime',
    }));
    build.onLoad({ filter: /.*/, namespace: 'wasm-runtime' }, (args) => {
      const fileName = basename(args.path.replace(/\?binary$/, ''));
      return {
        // __dirname is injected by the banner shim — resolves to the worker's directory
        contents: `
import { readFileSync } from 'fs';
import { join } from 'path';
export default readFileSync(join(__dirname, 'wasm', ${JSON.stringify(fileName)}));
        `.trim(),
        loader: 'js',
      };
    });
  },
};

const cjsBanner = [
  "import { createRequire as __shim_createRequire } from 'module';",
  "import { fileURLToPath as __shim_fileURLToPath } from 'url';",
  "import { dirname as __shim_dirname } from 'path';",
  'const require = __shim_createRequire(import.meta.url);',
  'const __filename = __shim_fileURLToPath(import.meta.url);',
  'const __dirname = __shim_dirname(__filename);',
].join('\n');

const sharedConfig = {
  platform: 'node',
  target: 'node22',
  bundle: true,
  format: 'esm',
  tsconfig: 'tsconfig.json',
  external: ['bun:sqlite', 'keytar', 'node-pty', 'ws'],
  logLevel: 'info',
};

// Build the main server entry as .mjs (requires import.meta.url for open@10 etc.)
await build({
  ...sharedConfig,
  entryPoints: ['src/server.ts'],
  outdir: 'dist-server',
  // Output as .mjs so Node.js treats it as ESM unconditionally
  outExtension: { '.js': '.mjs' },
  plugins: [wasmStubPlugin],
  // Inject CJS compatibility shims so bundled code that uses __dirname,
  // __filename, or eval('require') continues to work in the ESM output.
  // Use aliased imports to avoid collisions with names used inside the bundle.
  banner: { js: cjsBanner },
});

// Build worker entry points as .js — BaseAgentManager forks them via
// path.resolve(__dirname, type + '.js'), so the extension must stay .js.
// Workers use the runtime WASM plugin so tree-sitter shell parsing works.
await build({
  ...sharedConfig,
  entryPoints: ['src/process/worker/gemini.ts'],
  outdir: 'dist-server',
  plugins: [wasmRuntimePlugin],
  banner: { js: cjsBanner },
});
