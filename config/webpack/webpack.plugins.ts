import UnoCSS from '@unocss/webpack';
import type IForkTsCheckerWebpackPlugin from 'fork-ts-checker-webpack-plugin';
import MiniCssExtractPlugin from 'mini-css-extract-plugin';
import type { WebpackPluginInstance } from 'webpack';
import webpack from 'webpack';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const ForkTsCheckerWebpackPlugin: typeof IForkTsCheckerWebpackPlugin = require('fork-ts-checker-webpack-plugin');

export const plugins: WebpackPluginInstance[] = [
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
  UnoCSS(),
  // 忽略 tree-sitter 的 ?binary wasm 导入，让 aioncli-core 的 loadWasmBinary fallback 机制从磁盘读取
  // Ignore tree-sitter ?binary wasm imports, let aioncli-core's loadWasmBinary fallback read from disk
  new webpack.IgnorePlugin({
    resourceRegExp: /\.wasm\?binary$/,
  }),
];
