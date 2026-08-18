import { defineConfig } from "tsup";

export default defineConfig({
  target: "node20",
  entry: ["src/cli.ts", "src/index.ts"],
  format: ["esm"],
  // The @apisurf/ngn-* packages are published alongside this one and resolved
  // from node_modules at run time, so they are left external like any other
  // dependency. They used to be inlined here because they were private to the
  // workspace and could not be installed.
  external: ["esbuild"], // esbuild uses require.resolve() internally and must stay external
  splitting: false,
  sourcemap: false,
  minify: false,
  clean: true,
  dts: {
    entry: ["src/index.ts"],
  },
});
