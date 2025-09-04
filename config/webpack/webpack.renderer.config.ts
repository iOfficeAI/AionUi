import type { Configuration } from 'webpack';
import type { Configuration as DevServerConfiguration } from 'webpack-dev-server';
import { rules } from './webpack.rules';
import { plugins } from './webpack.plugins';
import path from 'path';

export const rendererConfig: Configuration = {
  module: {
    rules,
  },
  plugins,
  // Suppress webpack-dev-server runtime overlay to avoid noisy ResizeObserver errors
  devServer: {
    client: {
      overlay: {
        errors: false,
        warnings: false,
      },
    },
  } as DevServerConfiguration,
  resolve: {
    extensions: ['.js', '.ts', '.jsx', '.tsx', '.css'],
    alias: {
      '@': path.resolve(__dirname, '../../src'),
      '@common': path.resolve(__dirname, '../../src/common'),
      '@renderer': path.resolve(__dirname, '../../src/renderer'),
      '@process': path.resolve(__dirname, '../../src/process'),
      '@worker': path.resolve(__dirname, '../../src/worker'),
    },
  },
  optimization: {
    realContentHash: true,
  },
};
