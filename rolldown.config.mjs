import { defineConfig } from "rolldown";
import { dts } from "rolldown-plugin-dts";
import alias from "@rollup/plugin-alias";

const nodeBuild = {
  input: "src/index.ts",
  platform: "node",
  external: ["ws"],
  transform: { target: "es2020" },
};

const browserBuild = {
  input: "src/index.ts",
  platform: "browser",
  plugins: [
    alias({
      entries: [{ find: "./ws/websocket", replacement: "./ws/websocket-browser" }],
    }),
  ],
  transform: { target: "es2020" },
};

export default defineConfig([
  {
    ...nodeBuild,
    output: { file: "dist/cjs/index.cjs", format: "cjs" },
  },
  {
    ...nodeBuild,
    output: { file: "dist/esm/index.js", format: "esm" },
  },
  {
    ...browserBuild,
    output: { file: "dist/browser/index.js", format: "esm" },
  },
  {
    ...browserBuild,
    output: { file: "dist/iife/index.js", format: "iife", name: "AsyncWS" },
  },
  {
    input: "src/index.ts",
    platform: "node",
    external: ["ws"],
    plugins: [dts({ emitDtsOnly: true })],
    output: { dir: "dist", format: "esm" },
  },
]);
