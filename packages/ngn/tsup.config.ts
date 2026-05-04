import { defineConfig } from "tsup";

export default defineConfig({
  target: "node20",
  entry: ["src/cli.ts", "src/index.ts"],
  // noExternal: ["commander", "ngn", "os"],
  // noExternal: [/ngn-(.*)/, /@apisurf\/(.*)/],
  noExternal: [/ngn-(.*)/],
  external: ["esbuild"], // esbuild uses require.resolve() internally and must stay external
  splitting: false,
  sourcemap: false,
  minify: false,
  clean: true,
  dts: {
    entry: ["src/index.ts"],
  },
});
