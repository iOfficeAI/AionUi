import { MakerDMG } from '@electron-forge/maker-dmg';
import { MakerZIP } from '@electron-forge/maker-zip';
import { MakerWix } from '@electron-forge/maker-wix';
// Import MakerSquirrel conditionally to avoid issues on non-Windows
// eslint-disable-next-line @typescript-eslint/no-var-requires
const MakerSquirrel = process.platform === 'win32' ? require('@electron-forge/maker-squirrel').MakerSquirrel : null;
import { AutoUnpackNativesPlugin } from '@electron-forge/plugin-auto-unpack-natives';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { WebpackPlugin } from '@electron-forge/plugin-webpack';
import { FuseV1Options, FuseVersion } from '@electron/fuses';
import path from 'path';
import { mainConfig } from './config/webpack/webpack.config';
import { rendererConfig } from './config/webpack/webpack.renderer.config';
import packageJson from './package.json';

// Allow developers to override the npm start dev-server/logging ports without touching code.
// 允许开发者通过环境变量修改 dev server / 日志端口，无需改代码
const DEFAULT_DEV_SERVER_PORT = 3000;
const DEFAULT_LOGGER_PORT = 9000;
const DEV_PORT_ENV_KEYS = ['AIONUI_DEV_PORT', 'DEV_SERVER_PORT', 'PORT'] as const;
const LOGGER_PORT_ENV_KEYS = ['AIONUI_LOGGER_PORT', 'DEV_LOGGER_PORT', 'LOGGER_PORT'] as const;

const parsePort = (value?: string | null): number | null => {
  if (!value) return null;
  const port = Number.parseInt(value, 10);
  if (Number.isFinite(port) && port > 0 && port < 65536) {
    return port;
  }
  console.warn(`[dev-server] Ignoring invalid port value: ${value}`);
  return null;
};

const resolveDevServerPort = (): { port: number; overridden: boolean } => {
  // Check well-known env vars (priority order). Fallback to default when none provided.
  // 依次检查常见环境变量，若未设置则退回默认端口
  for (const key of DEV_PORT_ENV_KEYS) {
    const port = parsePort(process.env[key]);
    if (port) {
      console.log(`[dev-server] Using ${key}=${port}`);
      return { port, overridden: true };
    }
  }
  return { port: DEFAULT_DEV_SERVER_PORT, overridden: false };
};

const resolveLoggerPort = (devPort: number, devPortOverridden: boolean): number => {
  for (const key of LOGGER_PORT_ENV_KEYS) {
    const port = parsePort(process.env[key]);
    if (port) {
      console.log(`[dev-server] Using ${key}=${port}`);
      return port;
    }
  }

  if (devPortOverridden) {
    // Shift logger port away from the custom dev port to avoid conflicts.
    // 当自定义 dev 端口时，将日志端口偏移，避免冲突
    const candidate = devPort + 1 <= 65535 ? devPort + 1 : devPort - 1;
    console.log(`[dev-server] Auto-selecting logger port ${candidate} based on dev port ${devPort}`);
    return candidate;
  }

  return DEFAULT_LOGGER_PORT;
};

const { port: devServerPort, overridden: isDevPortOverridden } = resolveDevServerPort();
const loggerPort = resolveLoggerPort(devServerPort, isDevPortOverridden);

const apkName = 'AionUi_' + packageJson.version + '_' + (process.env.arch || process.arch);
const skipNativeRebuild = process.env.FORGE_SKIP_NATIVE_REBUILD === 'true';

// Use target arch from build script, not host arch
const targetArch = process.env.ELECTRON_BUILDER_ARCH || process.env.npm_config_target_arch || process.env.arch || process.arch;

// Removed custom outDir to maintain compatibility with macOS signing

// Forge is only used for compilation in hybrid setup
// Signing and notarization handled by electron-builder

// NPX-based approach eliminates the need for complex dependency packaging
// No longer need to copy and manage ACP bridge dependencies

module.exports = {
  packagerConfig: {
    asar: {
      unpack: '**/node_modules/{node-pty,bcrypt,better-sqlite3,@mapbox,detect-libc,prebuild-install,node-gyp-build,bindings,web-tree-sitter,tree-sitter-bash}/**/*',
    }, // Enable asar with native modules and their dependencies unpacking
    executableName: 'AionUi',
    out: path.resolve(__dirname, 'out'),
    tmpdir: path.resolve(__dirname, '../AionUi-tmp'),
    extraResource: [path.resolve(__dirname, 'public')],
    win32metadata: {
      CompanyName: 'aionui',
      FileDescription: 'AI Agent Desktop Interface',
      OriginalFilename: 'AionUi.exe', // 简化文件名
      ProductName: 'AionUi',
      InternalName: 'AionUi',
      FileVersion: packageJson.version,
      ProductVersion: packageJson.version,
    },
    icon: path.resolve(__dirname, 'resources/app'), // 应用图标路径
    // Windows 特定配置
    platform: process.env.npm_config_target_platform || process.platform,
    // Use target arch from build script, not host arch
    // This ensures .webpack/{target-arch}/ matches the final package architecture
    arch: targetArch,
  },
  rebuildConfig: {
    // 在 CI 环境下，跳过所有原生模块的重建，使用预编译的二进制以获得更好的兼容性
    // Skip rebuilding native modules in CI to use prebuilt binaries for better compatibility
    ...(process.env.CI === 'true'
      ? {
          onlyModules: [], // 空数组意味着"不要重建任何模块" / Empty array means "don't rebuild any modules"
        }
      : {}),
    ...(skipNativeRebuild
      ? {
          onlyModules: [], // 开发启动时跳过原生模块重建，避免环境检查
        }
      : {}),
  },
  makers: [
    // Windows-specific makers (only on Windows)
    ...(MakerSquirrel
      ? [
          new MakerSquirrel(
            {
              name: 'AionUi', // 必须与 package.json 的 name 一致
              authors: 'aionui', // 任意名称
              setupExe: apkName + '.exe',
              // 禁用自动更新
              remoteReleases: '',
              noMsi: true, // 禁用 MSI 安装程序
              // loadingGif: path.resolve(__dirname, "resources/install.gif"),
              iconUrl: path.resolve(__dirname, 'resources/app.ico'),
              setupIcon: path.resolve(__dirname, 'resources/app.ico'),
              // 添加更多 Windows 特定设置
              certificateFile: undefined, // 暂时禁用代码签名
              certificatePassword: undefined,
              // 修复安装路径问题
              setupMsi: undefined,
            },
            ['win32']
          ),
        ]
      : []),

    // Windows MSI installer (WiX) - alternative to Squirrel
    new MakerWix(
      {
        name: 'AionUi',
        description: 'AI Agent Desktop Interface',
        exe: 'AionUi',
        manufacturer: 'aionui',
        version: packageJson.version,
        ui: {
          chooseDirectory: true,
        },
      },
      ['win32']
    ),

    // Cross-platform ZIP maker
    new MakerZIP({}, ['darwin', 'win32']),

    // macOS-specific makers
    new MakerDMG(
      {
        name: apkName,
        format: 'ULFO',
        overwrite: true,
        iconSize: 80,
        icon: path.resolve(__dirname, 'resources/app.icns'),
      },
      ['darwin']
    ),

    // Linux makers - rpm优先，然后deb
    {
      name: '@electron-forge/maker-rpm',
      platforms: ['linux'],
      config: {
        options: {
          name: 'aionui',
          description: packageJson.description,
        },
      },
    },
    {
      name: '@electron-forge/maker-deb',
      platforms: ['linux'],
      config: {
        options: {
          maintainer: 'aionui',
          description: packageJson.description,
        },
      },
    },
  ],
  plugins: [
    new AutoUnpackNativesPlugin({
      // 配置需要处理的 native 依赖
      include: ['node-pty', 'better-sqlite3', 'bcrypt'],
    }),
    new WebpackPlugin({
      port: devServerPort,
      loggerPort,
      mainConfig,
      renderer: {
        config: rendererConfig,
        entryPoints: [
          {
            html: '!!html-webpack-plugin/lib/loader.js?force=true!./public/index.html',
            js: './src/renderer/index.ts',
            name: 'main_window',
            preload: {
              js: './src/preload.ts',
            },
          },
        ],
      },
      devServer: {
        // 开发服务器配置
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
        client: {
          overlay: {
            errors: true, // 显示错误
            warnings: false, // 不显示警告
          },
        },
      },
    }),
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};
