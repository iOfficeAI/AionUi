import webpack, { WebpackPluginInstance } from "webpack";
import type IForkTsCheckerWebpackPlugin from "fork-ts-checker-webpack-plugin";
import UnoCSS from "@unocss/webpack";
import MiniCssExtractPlugin from "mini-css-extract-plugin";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const ForkTsCheckerWebpackPlugin: typeof IForkTsCheckerWebpackPlugin = require("fork-ts-checker-webpack-plugin");

export const plugins: WebpackPluginInstance[] = [
  new ForkTsCheckerWebpackPlugin({
    logger: "webpack-infrastructure",
  }),
  new webpack.DefinePlugin({
    "process.env.env": JSON.stringify(process.env.env),
  }),
  new MiniCssExtractPlugin({
    filename: "[name].css",
    chunkFilename: "[id].css",
  }),
  UnoCSS(),
];
