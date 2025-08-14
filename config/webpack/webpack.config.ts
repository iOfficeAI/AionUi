import type { Configuration } from "webpack";

import { rendererConfig } from "./webpack.renderer.config";
export const mainConfig: Configuration = {
  /**
   * This is the main entry point for your application, it's the first file
   * that runs in the main process.
   */
  // entry: "./src/index.ts",
  entry: {
    index: "./src/index.ts",
    worker: "./src/worker/index.ts",
    gemini: "./src/worker/gemini.ts",
    gemini2: "./src/worker/gemini2.ts",
  },
  output: {
    filename: "[name].js",
    // path: path.resolve(__dirname, "../../main"),
  },
  ...rendererConfig,
};
