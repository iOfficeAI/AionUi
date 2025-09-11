import { MakerDeb } from '@electron-forge/maker-deb';
import { MakerDMG } from '@electron-forge/maker-dmg';
import { MakerRpm } from '@electron-forge/maker-rpm';
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

// Removed custom outDir to maintain compatibility with macOS signing

// Temporarily disable signing for CI/CD debugging
let osxSign;
let osxNotarize;

// Only enable signing if explicitly requested and not in CI
if (process.env.identity && process.env.CI !== 'true') {
  osxSign = {
    identity: process.env.identity,
    optionsForFile: (_filePath: string) => {
      return {
        hardenedRuntime: true,
        entitlements: path.resolve(__dirname, 'entitlements.plist'),
      };
    },
  };
}

if (process.env.appleId && process.env.appleIdPassword && process.env.CI !== 'true') {
  osxNotarize = {
    appleId: process.env.appleId,
    appleIdPassword: process.env.appleIdPassword,
    teamId: process.env.teamId,
  };
}
console.log('---forge.config', osxSign, osxNotarize);

// NPX-based approach eliminates the need for complex dependency packaging
// No longer need to copy and manage ACP bridge dependencies

module.exports = {
  packagerConfig: {
    asar: true, // Required by AutoUnpackNativesPlugin
    executableName: 'AionUi', // 确保与实际二进制文件名一致
    tmpdir: path.resolve(__dirname, '../tmp'), // 指定临时目录
    extraResource: [path.resolve(__dirname, 'public')],
    osxSign,
    osxNotarize,
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
    arch: process.env.npm_config_target_arch || process.env.arch || process.arch,
  },
  rebuildConfig: {},
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

    // Linux makers - 只在相应工具可用时启用
    ...(function () {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { execSync } = require('child_process');
      const linuxMakers = [];

      // 检查是否有 dpkg 和 fakeroot (DEB maker)
      try {
        execSync('which dpkg && which fakeroot', { stdio: 'ignore' });
        console.log('Adding DEB maker - dpkg and fakeroot found');
        // 使用简化的配置，根据 GitHub issue #2176 的解决方案
        linuxMakers.push(
          new MakerDeb({
            options: {
              maintainer: 'aionui',
              description: packageJson.description,
              homepage: 'https://aionui.com',
            },
          })
        );
      } catch (e) {
        console.log('Skipping DEB maker - dpkg or fakeroot not found');
      }

      // 检查是否有 rpmbuild (RPM maker)
      try {
        execSync('which rpmbuild', { stdio: 'ignore' });
        console.log('Adding RPM maker - rpmbuild found');
        linuxMakers.push(
          new MakerRpm({
            options: {
              name: 'aionui',
              productName: 'AionUi',
              genericName: 'AI Chat Interface',
              homepage: 'https://aionui.com',
              icon: path.resolve(__dirname, 'resources/app.png'),
              description: 'Transform your command-line AI agent into a modern, efficient AI Chat interface.',
              categories: ['Office'],
              requires: [],
              bin: 'AionUi',
            },
          })
        );
      } catch (e) {
        console.log('Skipping RPM maker - rpmbuild not found');
      }

      return linuxMakers;
    })(),
  ],
  plugins: [
    {
      name: '@electron-forge/plugin-auto-unpack-natives',
      config: {},
    },
    new AutoUnpackNativesPlugin({}),
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
