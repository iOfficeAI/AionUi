import type { Configuration } from 'webpack';
import { rules } from './webpack.rules';
import { plugins } from './webpack.plugins';
import path from 'path';

const isDevelopment = process.env.NODE_ENV !== 'production';

export const rendererConfig: Configuration = {
  mode: isDevelopment ? 'development' : 'production',
  devtool: isDevelopment ? 'source-map' : false,
  module: {
    rules,
  },
  plugins,
  resolve: {
    extensions: ['.js', '.ts', '.jsx', '.tsx', '.css'],
    alias: {
      '@': path.resolve(__dirname, '../../src'),
      '@common': path.resolve(__dirname, '../../src/common'),
      '@renderer': path.resolve(__dirname, '../../src/renderer'),
      '@process': path.resolve(__dirname, '../../src/process'),
      '@worker': path.resolve(__dirname, '../../src/worker'),
    },
    fallback: {
      'crypto': false,
      'node:crypto': false,
    },
  },
  externals: {
    'node:crypto': 'commonjs2 crypto',
    'crypto': 'commonjs2 crypto',
  },
  optimization: {
    realContentHash: true,
    minimize: !isDevelopment,
    splitChunks: isDevelopment ? false : {
      chunks: 'all',
      maxInitialRequests: 25,
      minSize: 20000,
      cacheGroups: {
        react: {
          test: /[\\/]node_modules[\\/](react|react-dom|react-router-dom)[\\/]/,
          name: 'react',
          priority: 30,
        },
        arco: {
          test: /[\\/]node_modules[\\/]@arco-design[\\/]/,
          name: 'arco',
          priority: 25,
        },
        markdown: {
          test: /[\\/]node_modules[\\/](react-markdown|react-syntax-highlighter|katex|rehype-katex|remark-)[\\/]/,
          name: 'markdown',
          priority: 20,
        },
        codemirror: {
          test: /[\\/]node_modules[\\/](@uiw|@codemirror)[\\/]/,
          name: 'codemirror',
          priority: 20,
        },
        vendors: {
          test: /[\\/]node_modules[\\/]/,
          name: 'vendors',
          priority: 10,
        },
      },
    },
  },
};
