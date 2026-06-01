import commonjs from "@rollup/plugin-commonjs";
import dts from "rollup-plugin-dts";
import typescript from "@rollup/plugin-typescript";
import nodeResolve from "@rollup/plugin-node-resolve";
import alias from "@rollup/plugin-alias";

export default [
  // Node.js builds (CJS + ESM)
  {
    input: "src/index.ts",
    output: [
      {
        file: "dist/cjs/index.cjs",
        format: "cjs",
      },
      {
        file: "dist/esm/index.js",
        format: "esm",
      },
    ],
    external: ["ws"],
    plugins: [
      nodeResolve({
        preferBuiltins: true,
      }),
      commonjs(),
      typescript({
        exclude: ["test/**/*.ts"],
        declaration: false,
      }),
    ],
  },
  // Browser builds (ESM + IIFE)
  {
    input: "src/index.ts",
    output: [
      {
        file: "dist/browser/index.js",
        format: "esm",
      },
      {
        file: "dist/iife/index.js",
        format: "iife",
        name: "AsyncWS",
      },
    ],
    plugins: [
      alias({
        entries: [
          {
            find: "./ws/websocket",
            replacement: "./ws/websocket-browser",
          },
        ],
      }),
      typescript({
        exclude: ["test/**/*.ts"],
        declaration: false,
      }),
      nodeResolve({
        browser: true,
        preferBuiltins: false,
      }),
    ],
  },
  // Type declarations
  {
    input: "src/index.ts",
    output: [
      {
        file: "dist/index.d.ts",
        format: "es",
      },
    ],
    plugins: [dts()],
  },
];
