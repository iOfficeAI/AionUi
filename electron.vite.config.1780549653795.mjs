// packages/desktop/electron.vite.config.ts
import { defineConfig as defineConfig2, externalizeDepsPlugin } from 'electron-vite';
import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { sentryVitePlugin } from '@sentry/vite-plugin';
import UnoCSS from 'unocss/vite';

// uno.config.ts
import { defineConfig, presetMini, presetWind3, transformerDirectives, transformerVariantGroup } from 'unocss';
import { presetExtra } from 'unocss-preset-extra';
var textColors = {
  // 自定义语义化文字色 / Custom semantic text colors
  't-primary': 'var(--text-primary)',
  // text-t-primary - 主要文字
  't-secondary': 'var(--text-secondary)',
  // text-t-secondary - 次要文字
  't-tertiary': 'var(--bg-6)',
  // text-t-tertiary - 三级说明/提示文字
  't-disabled': 'var(--text-disabled)',
  // text-t-disabled - 禁用文字
};
var semanticColors = {
  primary: 'var(--primary)',
  // bg-primary, text-primary, border-primary
  success: 'var(--success)',
  // bg-success, text-success
  warning: 'var(--warning)',
  // bg-warning, text-warning
  danger: 'var(--danger)',
  // bg-danger, text-danger
  info: 'var(--info)',
  // bg-info, text-info
};
var backgroundColors = {
  base: 'var(--bg-base)',
  // bg-base, border-base - 主背景
  1: 'var(--bg-1)',
  // bg-1, border-1 - 次级背景
  2: 'var(--bg-2)',
  // bg-2, border-2 - 三级背景
  3: 'var(--bg-3)',
  // bg-3, border-3 - 边框/分隔
  4: 'var(--bg-4)',
  // bg-4, border-4
  5: 'var(--bg-5)',
  // bg-5, border-5
  6: 'var(--bg-6)',
  // bg-6, border-6
  8: 'var(--bg-8)',
  // bg-8, border-8
  9: 'var(--bg-9)',
  // bg-9, border-9
  10: 'var(--bg-10)',
  // bg-10, border-10
  hover: 'var(--bg-hover)',
  // bg-hover - 悬停背景
  active: 'var(--bg-active)',
  // bg-active - 激活背景
};
var borderColors = {
  'b-base': 'var(--border-base)',
  // border-b-base - 基础边框
  'b-light': 'var(--border-light)',
  // border-b-light - 浅色边框
  'b-1': 'var(--bg-3)',
  // border-b-1 - 基于 bg-3
  'b-2': 'var(--bg-4)',
  // border-b-2 - 基于 bg-4
  'b-3': 'var(--bg-5)',
  // border-b-3 - 基于 bg-5
};
var brandColors = {
  brand: 'var(--brand)',
  'brand-light': 'var(--brand-light)',
  'brand-hover': 'var(--brand-hover)',
};
var aouColors = {
  aou: {
    1: 'var(--aou-1)',
    2: 'var(--aou-2)',
    3: 'var(--aou-3)',
    4: 'var(--aou-4)',
    5: 'var(--aou-5)',
    6: 'var(--aou-6)',
    7: 'var(--aou-7)',
    8: 'var(--aou-8)',
    9: 'var(--aou-9)',
    10: 'var(--aou-10)',
  },
};
var componentColors = {
  'message-user': 'var(--message-user-bg)',
  'message-tips': 'var(--message-tips-bg)',
  'workspace-btn': 'var(--workspace-btn-bg)',
};
var specialColors = {
  fill: 'var(--fill)',
  inverse: 'var(--inverse)',
};
var uno_config_default = defineConfig({
  presets: [presetMini(), presetExtra(), presetWind3()],
  transformers: [transformerVariantGroup(), transformerDirectives({ enforce: 'pre' })],
  content: {
    pipeline: {
      // Use RegExp instead of glob strings so patterns match against absolute
      // module IDs regardless of the Vite root directory.  electron-vite sets
      // the renderer root to packages/desktop/src/renderer/, which causes glob patterns like
      // 'packages/desktop/src/**/*.tsx' to resolve to the wrong nested path.
      include: [/\.[jt]sx?($|\?)/, /\.vue($|\?)/, /\.css($|\?)/],
      exclude: [/[\\/]node_modules[\\/]/, /\.html($|\?)/],
    },
  },
  // 自定义规则 / Custom rules
  rules: [
    // Arco Design 官方文字颜色 text-1 到 text-4
    // Arco Design official text colors: text-1, text-2, text-3, text-4
    [/^text-([1-4])$/, ([, d]) => ({ color: `var(--color-text-${d})` })],
    // Arco Design 官方填充色 fill-1 到 fill-4
    // Arco Design official fill colors: bg-fill-1, bg-fill-2, bg-fill-3, bg-fill-4
    [/^bg-fill-([1-4])$/, ([, d]) => ({ 'background-color': `var(--color-fill-${d})` })],
    // Arco Design 官方边框色 border-1 到 border-4 (使用 border-arco-* 避免和项目自定义冲突)
    // Arco Design official border colors: border-arco-1, border-arco-2, border-arco-3, border-arco-4
    [/^border-arco-([1-4])$/, ([, d]) => ({ 'border-color': `var(--color-border-${d})` })],
    // Arco Design 官方浅色系 primary/success/warning/danger/link-light-1 到 -light-4
    // Arco Design light variants: bg-primary-light-1, bg-success-light-1, etc.
    [
      /^bg-(primary|success|warning|danger|link)-light-([1-4])$/,
      ([, color, d]) => ({ 'background-color': `var(--color-${color}-light-${d})` }),
    ],
    // Arco Design 官方色阶 primary/success/warning/danger 1-9
    // Arco Design color levels: bg-primary-1, text-primary-1, border-primary-1, etc.
    [
      /^(bg|text|border)-(primary|success|warning|danger)-([1-9])$/,
      ([, prefix, color, d]) => {
        const prop = prefix === 'bg' ? 'background-color' : prefix === 'text' ? 'color' : 'border-color';
        return { [prop]: `rgb(var(--${color}-${d}))` };
      },
    ],
    // Arco Design 官方白色和黑色
    // Arco Design white and black: bg-color-white, text-color-white, bg-color-black, text-color-black
    ['bg-color-white', { 'background-color': 'var(--color-white)' }],
    ['text-color-white', { color: 'var(--color-white)' }],
    ['bg-color-black', { 'background-color': 'var(--color-black)' }],
    ['text-color-black', { color: 'var(--color-black)' }],
    // Arco Design 对话框/弹出层专用背景色
    // Arco Design popup/dialog background color: bg-popup
    ['bg-popup', { 'background-color': 'var(--color-bg-popup)' }],
    // 项目自定义颜色 / Project custom colors
    ['bg-dialog-fill-0', { 'background-color': 'var(--dialog-fill-0)' }],
    ['text-0', { color: 'var(--text-0)' }],
    ['text-white', { color: 'var(--text-white)' }],
    ['bg-fill-0', { 'background-color': 'var(--fill-0)' }],
    ['bg-fill-white-to-black', { 'background-color': 'var(--fill-white-to-black)' }],
    ['border-special', { 'border-color': 'var(--border-special)' }],
    // Wiggle animation for attention indicators (e.g. pending permission badge)
    // Shakes briefly then pauses — 3s cycle, active in first ~20%
    ['animate-wiggle', { animation: 'wiggle 3s ease-in-out infinite' }],
  ],
  // Preflights - Global base styles 全局基础样式
  preflights: [
    {
      getCSS: () => `
        * {
          /* Set default text color to follow theme \u6240\u6709\u5143\u7D20\u9ED8\u8BA4\u4F7F\u7528\u4E3B\u9898\u6587\u5B57\u989C\u8272 */
          color: inherit;
        }
        @keyframes wiggle {
          0%, 20%, 100% { transform: rotate(0deg); }
          4% { transform: rotate(8deg); }
          8% { transform: rotate(-8deg); }
          12% { transform: rotate(6deg); }
          16% { transform: rotate(-4deg); }
        }
      `,
    },
  ],
  // 基础配置
  shortcuts: {
    'flex-center': 'flex items-center justify-center',
  },
  theme: {
    colors: {
      // 合并所有颜色配置 Merge all color configurations
      ...textColors,
      ...semanticColors,
      ...backgroundColors,
      ...borderColors,
      ...brandColors,
      ...aouColors,
      ...componentColors,
      ...specialColors,
    },
    fontFamily: {
      // Unified monospace stack for all code views (source, code blocks, editors)
      // 所有代码视图（原文、代码块、编辑器）统一的等宽字体栈
      mono: 'ui-monospace, "SF Mono", SFMono-Regular, Menlo, "Cascadia Code", "Roboto Mono", Consolas, "Liberation Mono", monospace',
    },
  },
});

// packages/desktop/electron.vite.config.ts
import { viteStaticCopy } from 'vite-plugin-static-copy';
var __electron_vite_injected_dirname = 'C:\\Users\\ASUS\\Desktop\\Satya\\Projects\\Aion UI\\packages\\desktop';
var rootPackageJson = JSON.parse(
  readFileSync(resolve(__electron_vite_injected_dirname, '../../package.json'), 'utf-8')
);
function buildMcpServersPlugin() {
  return {
    name: 'vite-plugin-build-mcp-servers',
    closeBundle() {
      execSync(`node "${resolve('scripts/build-mcp-servers.js')}"`, { stdio: 'inherit' });
    },
  };
}
function iconParkPlugin() {
  return {
    name: 'vite-plugin-icon-park',
    enforce: 'pre',
    transform(source, id) {
      if (!id.endsWith('.tsx') || id.includes('node_modules')) return null;
      if (!source.includes('@icon-park/react')) return null;
      const transformedSource = source.replace(
        /import\s+\{\s+([a-zA-Z, ]*)\s+\}\s+from\s+['"]@icon-park\/react['"](;?)/g,
        function (str, match) {
          if (!match) return str;
          const components = match.split(',');
          const importComponent = str.replace(match, components.map((key) => `${key} as _${key.trim()}`).join(', '));
          const hoc = `import IconParkHOC from '@renderer/components/IconParkHOC';
          ${components.map((key) => `const ${key.trim()} = IconParkHOC(_${key.trim()})`).join(';\n')}`;
          return importComponent + ';' + hoc;
        }
      );
      if (transformedSource !== source) return { code: transformedSource, map: null };
      return null;
    },
  };
}
var desktopSrcRoot = resolve('packages/desktop/src');
var rendererRoot = resolve('packages/desktop/src/renderer');
var mainAliases = {
  '@': desktopSrcRoot,
  '@common': resolve('packages/desktop/src/common'),
  '@renderer': rendererRoot,
  '@process': resolve('packages/desktop/src/process'),
  '@worker': resolve('packages/desktop/src/process/worker'),
  '@xterm/headless': resolve('packages/desktop/src/common/utils/shims/xterm-headless.ts'),
};
var electron_vite_config_default = defineConfig2(({ mode }) => {
  const isDevelopment = mode === 'development';
  const enableSentrySourceMaps = !isDevelopment && !!process.env.SENTRY_AUTH_TOKEN;
  const sentryPluginOptions = {
    org: process.env.SENTRY_ORG,
    project: process.env.SENTRY_PROJECT,
    authToken: process.env.SENTRY_AUTH_TOKEN,
    sourcemaps: {
      filesToDeleteAfterUpload: ['./out/**/*.map'],
      rewriteSources: (source) => {
        return source.replace(/\\/g, '/').replace(/^(\.\.\/)+(packages\/desktop\/src\/)/, '$2');
      },
    },
  };
  return {
    main: {
      plugins: [
        // externalizeDepsPlugin replaces our custom getExternalDeps() + pluginExternalizeDynamicImports.
        // 'fix-path' excluded so it gets bundled inline (only 3KB).
        // '@aionui/web-host' excluded so its TS sources (which use ESM ".js" import specifiers)
        // are bundled by esbuild rather than left as `require('@aionui/web-host')`, which Node
        // cannot resolve because the package ships no compiled .js files (workspace-only).
        externalizeDepsPlugin({ exclude: ['fix-path', '@aionui/web-host'] }),
        ...(isDevelopment
          ? [
              {
                name: 'dev-build-mcp-servers',
                closeBundle() {
                  execSync(
                    `node "${resolve(__electron_vite_injected_dirname, '../../scripts/build-mcp-servers.js')}"`,
                    {
                      stdio: 'inherit',
                    }
                  );
                },
              },
            ]
          : []),
        ...(!isDevelopment
          ? [
              viteStaticCopy({
                structured: false,
                // electron-vite builds main process as SSR; viteStaticCopy defaults
                // to environment: "client" and silently skips non-client environments.
                environment: 'ssr',
                targets: [
                  // Use single * glob to copy top-level items (directories) with their contents intact.
                  // Using ** would flatten all nested files into the dest root.
                  { src: 'packages/desktop/src/renderer/assets/logos/*', dest: 'static/images' },
                ],
              }),
            ]
          : []),
        ...(enableSentrySourceMaps ? [sentryVitePlugin(sentryPluginOptions)] : []),
        ...(isDevelopment ? [buildMcpServersPlugin()] : []),
      ],
      resolve: { alias: mainAliases, extensions: ['.ts', '.tsx', '.js', '.json'] },
      build: {
        sourcemap: enableSentrySourceMaps ? 'hidden' : isDevelopment,
        reportCompressedSize: false,
        rollupOptions: {
          input: {
            index: resolve('packages/desktop/src/index.ts'),
            // Built-in MCP server entry points (compiled by scripts/build-mcp-servers.js via esbuild,
            // not vite — esbuild bundles all deps for self-contained execution by external node processes)
          },
          onwarn(warning, warn) {
            if (warning.code === 'EVAL') return;
            warn(warning);
          },
        },
      },
      define: {
        'process.env.NODE_ENV': JSON.stringify(mode),
        'process.env.env': JSON.stringify(process.env.env),
        'process.env.SENTRY_DSN': JSON.stringify(process.env.SENTRY_DSN ?? ''),
      },
    },
    preload: {
      // Bundle @sentry/electron/preload so its hookupIpc() runs in the preload
      // context. Externalized dependencies leave a runtime require('...') in
      // the output, which Electron's sandbox-mode preload cannot resolve from
      // node_modules (→ "module not found"). Bundling inlines the few hundred
      // bytes of IPC wiring we actually need.
      plugins: [externalizeDepsPlugin({ exclude: ['@sentry/electron'] })],
      resolve: {
        alias: {
          '@': resolve('packages/desktop/src'),
          '@common': resolve('packages/desktop/src/common'),
        },
        extensions: ['.ts', '.tsx', '.js', '.json'],
      },
      build: {
        sourcemap: false,
        reportCompressedSize: false,
        rollupOptions: {
          input: {
            index: resolve('packages/desktop/src/preload/main.ts'),
            petPreload: resolve('packages/desktop/src/preload/petPreload.ts'),
            petHitPreload: resolve('packages/desktop/src/preload/petHitPreload.ts'),
            petConfirmPreload: resolve('packages/desktop/src/preload/petConfirmPreload.ts'),
          },
        },
      },
    },
    renderer: {
      // The renderer workspace moved under packages/desktop/src/renderer in M1.
      // Make the root explicit so Vite emits page names relative to that directory
      // instead of leaking source-relative ../../ paths into HTML asset names.
      root: rendererRoot,
      base: './',
      publicDir: resolve('public'),
      appType: 'mpa',
      server: {
        // Default to 5173; when occupied (e.g. another AionUi clone is running),
        // Vite auto-increments to the next available port.
        // electron-vite reads the actual port and sets ELECTRON_RENDERER_URL accordingly.
        port: 5173,
        // Explicit HMR host so Vite client connects directly to the Vite dev server,
        // not to the WebUI proxy server (which would reject the WebSocket and cause infinite reload).
        // Port is omitted so it automatically matches the server port.
        hmr: {
          host: 'localhost',
        },
      },
      resolve: {
        alias: {
          '@': resolve('packages/desktop/src'),
          '@common': resolve('packages/desktop/src/common'),
          '@renderer': resolve('packages/desktop/src/renderer'),
          '@process': resolve('packages/desktop/src/process'),
          '@worker': resolve('packages/desktop/src/process/worker'),
          // Force ESM version of streamdown
          streamdown: resolve('node_modules/streamdown/dist/index.js'),
        },
        extensions: ['.ts', '.tsx', '.js', '.jsx', '.css'],
        dedupe: ['react', 'react-dom', 'react-router-dom'],
      },
      plugins: [
        UnoCSS(uno_config_default),
        iconParkPlugin(),
        ...(enableSentrySourceMaps ? [sentryVitePlugin(sentryPluginOptions)] : []),
      ],
      build: {
        target: 'es2022',
        sourcemap: enableSentrySourceMaps ? 'hidden' : isDevelopment,
        minify: !isDevelopment,
        reportCompressedSize: false,
        chunkSizeWarningLimit: 1500,
        cssCodeSplit: true,
        rollupOptions: {
          input: {
            index: resolve(rendererRoot, 'index.html'),
            pet: resolve(rendererRoot, 'pet/pet.html'),
            'pet-hit': resolve(rendererRoot, 'pet/pet-hit.html'),
            'pet-confirm': resolve(rendererRoot, 'pet/pet-confirm.html'),
          },
          external: ['node:crypto', 'crypto'],
          onwarn(warning, warn) {
            if (warning.code === 'EVAL') return;
            warn(warning);
          },
          output: {
            manualChunks(id) {
              if (!id.includes('node_modules')) return void 0;
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
              if (
                id.includes('/react-syntax-highlighter/') ||
                id.includes('/refractor/') ||
                id.includes('/highlight.js/')
              )
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
              return void 0;
            },
          },
        },
      },
      define: {
        'process.env.NODE_ENV': JSON.stringify(mode),
        'process.env.env': JSON.stringify(process.env.env),
        'process.env.AIONUI_MULTI_INSTANCE': JSON.stringify(process.env.AIONUI_MULTI_INSTANCE ?? ''),
        'process.env.SENTRY_DSN': JSON.stringify(process.env.SENTRY_DSN ?? ''),
        // Inject the real AionUi version (root package.json) so renderer code
        // can show it without importing packages/desktop/package.json, which is
        // a workspace-internal placeholder frozen at "0.0.0".
        __APP_VERSION__: JSON.stringify(rootPackageJson.version),
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
    },
  };
});
export { electron_vite_config_default as default };
