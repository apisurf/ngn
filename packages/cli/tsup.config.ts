import { defineConfig } from "tsup";

export default defineConfig({
  target: "node20",
  entry: ["src/cli.ts"],
  // noExternal: ["commander", "op3", "os"],
  // noExternal: [/op3-(.*)/, /@op3\/(.*)/],
  noExternal: [/op3-(.*)/],
  external: ["esbuild"], // esbuild uses require.resolve() internally and must stay external
  splitting: false,
  sourcemap: false,
  minify: false,
  clean: true,
});
