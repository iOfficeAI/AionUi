import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import { resolve } from 'path';
import UnoCSS from 'unocss/vite';
import unoConfig from './uno.config.ts';
import { viteStaticCopy } from 'vite-plugin-static-copy';

// Icon Park transform plugin (replaces webpack icon-park-loader)
function iconParkPlugin() {
  return {
    name: 'vite-plugin-icon-park',
    enforce: 'pre' as const,
    transform(source: string, id: string) {
      if (!id.endsWith('.tsx') || id.includes('node_modules')) return null;
      if (!source.includes('@icon-park/react')) return null;
      const transformedSource = source.replace(/import\s+\{\s+([a-zA-Z, ]*)\s+\}\s+from\s+['"]@icon-park\/react['"](;?)/g, function (str, match) {
        if (!match) return str;
        const components = match.split(',');
        const importComponent = str.replace(match, components.map((key: string) => `${key} as _${key.trim()}`).join(', '));
        const hoc = `import IconParkHOC from '@renderer/components/IconParkHOC';
          ${components.map((key: string) => `const ${key.trim()} = IconParkHOC(_${key.trim()})`).join(';\n')}`;
        return importComponent + ';' + hoc;
      });
      if (transformedSource !== source) return { code: transformedSource, map: null } as { code: string; map: null };
      return null;
    },
  };
}

// Common path aliases for main process and workers
const mainAliases = {
  '@': resolve('src'),
  '@common': resolve('src/common'),
  '@renderer': resolve('src/renderer'),
  '@process': resolve('src/process'),
  '@worker': resolve('src/worker'),
  '@xterm/headless': resolve('src/shims/xterm-headless.ts'),
};

export default defineConfig(({ mode }) => {
  const isDevelopment = mode === 'development';

  return {
    main: {
      plugins: [
        // externalizeDepsPlugin replaces our custom getExternalDeps() + pluginExternalizeDynamicImports.
        // 'fix-path' excluded so it gets bundled inline (only 3KB).
        externalizeDepsPlugin({ exclude: ['fix-path'] }),
        ...(!isDevelopment
          ? [
              viteStaticCopy({
                structured: false,
                targets: [
                  { src: 'skills/**', dest: 'skills' },
                  { src: 'rules/**', dest: 'rules' },
                  { src: 'assistant/**', dest: 'assistant' },
                  { src: 'src/renderer/assets/logos/**', dest: 'static/images' },
                ],
              }),
            ]
          : []),
      ],
      resolve: { alias: mainAliases, extensions: ['.ts', '.tsx', '.js', '.json'] },
      build: {
        sourcemap: false,
        reportCompressedSize: false,
        rollupOptions: {
          input: {
            index: resolve('src/index.ts'),
            // Worker entry files are output alongside index.js in out/main/.
            // BaseAgentManager.resolveWorkerDir() handles the case where code
            // splitting places it in a chunks/ subdirectory.
            gemini: resolve('src/worker/gemini.ts'),
            acp: resolve('src/worker/acp.ts'),
            codex: resolve('src/worker/codex.ts'),
            'openclaw-gateway': resolve('src/worker/openclaw-gateway.ts'),
            nanobot: resolve('src/worker/nanobot.ts'),
          },
          onwarn(warning, warn) {
            if (warning.code === 'EVAL') return;
            warn(warning);
          },
        },
      },
      define: { 'process.env.env': JSON.stringify(process.env.env) },
    },

    preload: {
      plugins: [externalizeDepsPlugin()],
      resolve: {
        alias: { '@': resolve('src'), '@common': resolve('src/common') },
        extensions: ['.ts', '.tsx', '.js', '.json'],
      },
      build: {
        sourcemap: false,
        reportCompressedSize: false,
        rollupOptions: { input: { index: resolve('src/preload.ts') } },
      },
    },

    renderer: {
      base: './',
      resolve: {
        alias: {
          '@': resolve('src'),
          '@common': resolve('src/common'),
          '@renderer': resolve('src/renderer'),
          '@process': resolve('src/process'),
          '@worker': resolve('src/worker'),
          // Force ESM version of streamdown
          streamdown: resolve('node_modules/streamdown/dist/index.js'),
        },
        extensions: ['.ts', '.tsx', '.js', '.jsx', '.css'],
        dedupe: ['react', 'react-dom', 'react-router-dom'],
      },
      plugins: [UnoCSS(unoConfig), iconParkPlugin()],
      build: {
        target: 'es2022',
        sourcemap: isDevelopment,
        minify: !isDevelopment,
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
              if (id.includes('/react-markdown/') || id.includes('/remark-') || id.includes('/rehype-') || id.includes('/unified/') || id.includes('/mdast-') || id.includes('/hast-') || id.includes('/micromark')) return 'vendor-markdown';
              if (id.includes('/react-syntax-highlighter/') || id.includes('/refractor/') || id.includes('/highlight.js/')) return 'vendor-highlight';
              if (id.includes('/monaco-editor/') || id.includes('/@monaco-editor/') || id.includes('/codemirror/') || id.includes('/@codemirror/')) return 'vendor-editor';
              if (id.includes('/katex/')) return 'vendor-katex';
              if (id.includes('/@icon-park/')) return 'vendor-icons';
              if (id.includes('/diff2html/')) return 'vendor-diff';
              return undefined;
            },
          },
        },
      },
      define: {
        'process.env.env': JSON.stringify(process.env.env),
        global: 'globalThis',
      },
      optimizeDeps: {
        exclude: ['electron'],
        include: ['react', 'react-dom', 'react-router-dom', 'react-i18next', 'i18next', '@arco-design/web-react', '@icon-park/react', 'react-markdown', 'react-syntax-highlighter', 'react-virtuoso', 'classnames', 'swr', 'eventemitter3', 'katex', 'diff2html', 'remark-gfm', 'remark-math', 'remark-breaks', 'rehype-raw', 'rehype-katex'],
      },
    },
  };
});
