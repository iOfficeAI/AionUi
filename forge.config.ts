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

const apkName = 'AionUi_' + packageJson.version + '_' + (process.env.arch || process.arch);
const skipNativeRebuild = process.env.FORGE_SKIP_NATIVE_REBUILD === 'true';

// Removed custom outDir to maintain compatibility with macOS signing

// Forge is only used for compilation in hybrid setup
// Signing and notarization handled by electron-builder

// NPX-based approach eliminates the need for complex dependency packaging
// No longer need to copy and manage ACP bridge dependencies

module.exports = {
  packagerConfig: {
    asar: {
      unpack: '**/node_modules/{node-pty,bcrypt,better-sqlite3}/**/*',
    }, // Enable asar with node-pty, bcrypt, and better-sqlite3 unpacking for AutoUnpackNativesPlugin
    executableName: 'AionUi',
    out: path.resolve(__dirname, 'out'),
    tmpdir: path.resolve(__dirname, '../AionUi-tmp'),
    extraResource: [path.resolve(__dirname, 'public')],
    hooks: {
      packageAfterCopy: async (_config, buildPath, _electronVersion, _platform, _arch) => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const fs = require('fs');
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const path = require('path');

        // Copy webpack externals to packaged app
        const externals = ['better-sqlite3', 'bcrypt', 'node-pty', '@mapbox', 'detect-libc', 'prebuild-install', 'node-gyp-build', 'bindings'];
        const srcNodeModules = path.join(__dirname, 'node_modules');
        const destNodeModules = path.join(buildPath, 'node_modules');

        if (!fs.existsSync(destNodeModules)) {
          fs.mkdirSync(destNodeModules, { recursive: true });
        }

        for (const moduleName of externals) {
          const src = path.join(srcNodeModules, moduleName);
          const dest = path.join(destNodeModules, moduleName);

          if (fs.existsSync(src)) {
            console.log(`📦 Copying ${moduleName} to packaged app...`);
            fs.cpSync(src, dest, { recursive: true });
          }
        }
      },
    },
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
    arch: process.env.ELECTRON_BUILDER_ARCH || process.env.npm_config_target_arch || process.env.arch || process.arch,
  },
  rebuildConfig: {
    // 在 Windows CI 环境下，跳过所有原生模块的重建
    ...(process.env.CI === 'true' && process.platform === 'win32'
      ? {
          onlyModules: [], // 一个空数组意味着"不要重建任何模块"
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
      mainConfig,
      renderer: {
        config: rendererConfig,
        entryPoints: [
          {
            html: './public/index.html',
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
