import { MakerDeb } from '@electron-forge/maker-deb';
import { MakerDMG } from '@electron-forge/maker-dmg';
import { MakerZIP } from '@electron-forge/maker-zip';
// Import MakerSquirrel conditionally to avoid loading electron-winstaller on Linux
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

const apkName = 'AionUi_' + packageJson.version + process.env.arch;

let osxSign;
if (process.env.identity) {
  osxSign = {
    identity: process.env.identity,
    optionsForFile: (_filePath) => {
      return {
        hardenedRuntime: true,
        entitlements: path.resolve(__dirname, 'entitlements.plist'),
      };
    },
  };
}

let osxNotarize;
if (process.env.appleId && process.env.appleIdPassword) {
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
      FileDescription: 'ai agent for GUI',
      OriginalFilename: apkName + '.exe',
      ProductName: 'AionUi',
      InternalName: 'AionUi',
    },
    icon: path.resolve(__dirname, 'resources/app'), // 应用图标路径
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
              // loadingGif: path.resolve(__dirname, "resources/install.gif"),
              iconUrl: path.resolve(__dirname, 'resources/app.ico'),
              setupIcon: path.resolve(__dirname, 'resources/app.ico'),
            },
            ['win32']
          ),
        ]
      : []),

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

    // Linux-specific makers
    new MakerDeb(
      {
        options: {
          icon: path.resolve(__dirname, 'resources/app.png'),
          description: 'AionUi for agent',
          categories: ['Office'],
        },
      },
      ['linux']
    ),
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
