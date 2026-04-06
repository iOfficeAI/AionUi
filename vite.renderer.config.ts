/**
 * Standalone renderer build config — no Electron dependency.
 * Used by `bun run build:renderer:web` for server/container deployments.
 * Outputs to out/renderer/ (same location as electron-vite build).
 */
import { defineConfig } from 'vite';
import { resolve } from 'path';
import UnoCSS from 'unocss/vite';
import unoConfig from './uno.config.ts';

// Icon Park transform plugin (mirrors electron.vite.config.ts)
function iconParkPlugin() {
  return {
    name: 'vite-plugin-icon-park',
    enforce: 'pre' as const,
    transform(source: string, id: string) {
      if (!id.endsWith('.tsx') || id.includes('node_modules')) return null;
      if (!source.includes('@icon-park/react')) return null;
      const transformedSource = source.replace(
        /import\s+\{\s+([a-zA-Z, ]*)\s+\}\s+from\s+['"]@icon-park\/react['"](;?)/g,
        function (str, match) {
          if (!match) return str;
          const components = match.split(',');
          const importComponent = str.replace(
            match,
            components.map((key: string) => `${key} as _${key.trim()}`).join(', ')
          );
          const hoc = `import IconParkHOC from '@renderer/components/IconParkHOC';
          ${components.map((key: string) => `const ${key.trim()} = IconParkHOC(_${key.trim()})`).join(';\n')}`;
          return importComponent + ';' + hoc;
        }
      );
      if (transformedSource !== source)
        return { code: transformedSource, map: null } as {
          code: string;
          map: null;
        };
      return null;
    },
  };
}

export default defineConfig({
  base: './',
  root: resolve('src/renderer'),
  publicDir: resolve('public'),
  resolve: {
    alias: {
      '@': resolve('src'),
      '@common': resolve('src/common'),
      '@renderer': resolve('src/renderer'),
      '@process': resolve('src/process'),
      '@worker': resolve('src/process/worker'),
      streamdown: resolve('node_modules/streamdown/dist/index.js'),
    },
    extensions: ['.ts', '.tsx', '.js', '.jsx', '.css'],
    dedupe: ['react', 'react-dom', 'react-router-dom'],
  },
  plugins: [UnoCSS(unoConfig), iconParkPlugin()],
  build: {
    outDir: resolve('out/renderer'),
    emptyOutDir: true,
    target: 'es2022',
    sourcemap: false,
    minify: true,
    reportCompressedSize: false,
    chunkSizeWarningLimit: 1500,
    cssCodeSplit: true,
    rollupOptions: {
      input: { index: resolve('src/renderer/index.html') },
      external: ['node:crypto', 'crypto'],
      output: {
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('/react-dom/') || id.includes('/react/')) return 'vendor-react';
          if (id.includes('/@arco-design/')) return 'vendor-arco';
          if (
            id.includes('/react-markdown/') ||
            id.includes('/remark-') ||
            id.includes('/rehype-') ||
            id.includes('/unified/') ||
            id.includes('/mdast-') ||
            id.includes('/hast-') ||
            id.includes('/micromark')
          )
            return 'vendor-markdown';
          if (id.includes('/react-syntax-highlighter/') || id.includes('/refractor/') || id.includes('/highlight.js/'))
            return 'vendor-highlight';
          if (
            id.includes('/monaco-editor/') ||
            id.includes('/@monaco-editor/') ||
            id.includes('/codemirror/') ||
            id.includes('/@codemirror/')
          )
            return 'vendor-editor';
          if (id.includes('/katex/')) return 'vendor-katex';
          if (id.includes('/@icon-park/')) return 'vendor-icons';
          if (id.includes('/diff2html/')) return 'vendor-diff';
          return undefined;
        },
      },
    },
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
    'process.env.env': JSON.stringify(process.env.env),
    'process.env.SENTRY_DSN': JSON.stringify(process.env.SENTRY_DSN ?? ''),
    global: 'globalThis',
  },
  optimizeDeps: {
    exclude: ['electron'],
    include: [
      'react',
      'react-dom',
      'react-router-dom',
      'react-i18next',
      'i18next',
      '@arco-design/web-react',
      '@icon-park/react',
      'react-markdown',
      'react-syntax-highlighter',
      'react-virtuoso',
      'classnames',
      'swr',
      'eventemitter3',
      'katex',
      'diff2html',
      'remark-gfm',
      'remark-math',
      'remark-breaks',
      'rehype-raw',
      'rehype-katex',
    ],
  },
});
