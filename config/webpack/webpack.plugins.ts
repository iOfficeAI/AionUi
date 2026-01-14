import UnoCSS from '@unocss/webpack';
import CopyPlugin from 'copy-webpack-plugin';
import type IForkTsCheckerWebpackPlugin from 'fork-ts-checker-webpack-plugin';
import MiniCssExtractPlugin from 'mini-css-extract-plugin';
import path from 'path';
import type { WebpackPluginInstance } from 'webpack';
import webpack from 'webpack';
import unoConfig from '../../uno.config';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const ForkTsCheckerWebpackPlugin: typeof IForkTsCheckerWebpackPlugin = require('fork-ts-checker-webpack-plugin');

export const plugins: WebpackPluginInstance[] = [
  // 复制静态资源目录到 webpack 输出，用于打包后的应用
  // Copy static resource directories to webpack output for packaged app
  new CopyPlugin({
    patterns: [
      // skills 目录：包含 SKILL.md 文件，用于 SkillManager 加载
      { from: path.resolve(__dirname, '../../skills'), to: 'skills', noErrorOnMissing: true },
      // rules 目录：包含助手规则文件
      { from: path.resolve(__dirname, '../../rules'), to: 'rules', noErrorOnMissing: true },
      // assistant 目录：包含助手配置和技能定义
      { from: path.resolve(__dirname, '../../assistant'), to: 'assistant', noErrorOnMissing: true },
    ],
  }),
  new ForkTsCheckerWebpackPlugin({
    logger: 'webpack-infrastructure',
  }),
  new webpack.DefinePlugin({
    'process.env.env': JSON.stringify(process.env.env),
  }),
  new MiniCssExtractPlugin({
    filename: '[name].css',
    chunkFilename: '[id].css',
  }),
  {
    apply(compiler) {
      if (compiler.options.name?.startsWith('HtmlWebpackPlugin')) {
        return;
      }
      UnoCSS(unoConfig).apply(compiler);
    },
  },
  // 忽略 tree-sitter 的 ?binary wasm 导入，让 aioncli-core 的 loadWasmBinary fallback 机制从磁盘读取
  // Ignore tree-sitter ?binary wasm imports, let aioncli-core's loadWasmBinary fallback read from disk
  new webpack.IgnorePlugin({
    resourceRegExp: /\.wasm\?binary$/,
  }),
];
