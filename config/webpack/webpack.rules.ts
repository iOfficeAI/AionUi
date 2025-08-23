import type { ModuleOptions } from 'webpack';
import MiniCssExtractPlugin from 'mini-css-extract-plugin';
import path from 'path';
export const rules: Required<ModuleOptions>['rules'] = [
  // Add support for native node modules
  {
    // We're specifying native_modules in the test because the asset relocator loader generates a
    // "fake" .node file which is really a cjs file.
    test: /native_modules[/\\].+\.node$/,
    use: 'node-loader',
  },
  {
    test: /[/\\]node_modules[/\\].+\.(m?js|node)$/,
    parser: { amd: false },
    use: {
      loader: '@vercel/webpack-asset-relocator-loader',
      options: {
        outputAssetBase: 'native_modules',
      },
    },
  },
  {
    test: /\.tsx?$/,
    exclude: /(node_modules|\.webpack)/,
    use: {
      loader: 'ts-loader',
      options: {
        transpileOnly: true,
      },
    },
  },
  {
    test: /\.css$/,
    use: [
      MiniCssExtractPlugin.loader,
      {
        loader: 'css-loader',
        options: {
          importLoaders: 1,
        },
      },
      'postcss-loader',
    ],
    include: [/src/, /node_modules/], // 新增 node_modules 包含
  },
  // UnoCSS 虚拟 CSS 文件处理
  {
    test: /_virtual_%2F__uno\.css$/,
    use: [MiniCssExtractPlugin.loader, 'css-loader'],
  },
  // 添加字体文件加载规则
  {
    test: /\.(woff|woff2|eot|ttf|otf)$/i,
    type: 'asset/resource',
    generator: {
      filename: 'static/fonts/[name][ext]',
    },
  },
  {
    test: /\.json$/,
    type: 'json', // 使用 Webpack 5 内置的 JSON 解析
    parser: {
      parse: (source: string) => {
        // 添加自定义解析器
        try {
          return JSON.parse(source);
        } catch (e) {
          // console.error('JSON 解析失败:', e);
          return {};
        }
      },
    },
  },
  // 添加 SVG 文件处理规则
  // {
  //   test: /\.svg$/,
  //   use: [
  //     {
  //       loader: "file-loader",
  //       options: {
  //         name: "[name].[ext]",
  //         outputPath: "static/images/",
  //       },
  //     },
  //   ],
  // },
  {
    test: /\.svg$/i,
    issuer: /\.[jt]sx?$/,
    use: [
      {
        loader: '@svgr/webpack',
        options: {
          icon: true,
          svgoConfig: {
            plugins: [
              { name: 'removeViewBox', active: false }, // 保留 viewBox 以便缩放
            ],
          },
        },
      },
    ],
  },
  {
    test: /\.tsx$/,
    exclude: /node_modules/,
    use: [
      {
        loader: path.resolve(__dirname, './icon-park-loader.js'),
        options: {
          cacheDirectory: true,
          cacheIdentifier: 'icon-park-loader',
        },
      },
    ],
  },
];
