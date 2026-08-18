import { defineConfig } from "tsup";

export default defineConfig({
  entry: { server: "src/server/index.ts" },
  format: ["esm"],
  platform: "node",
  target: "node20",
  outDir: "dist",
  // @libsql/client loads a native addon, so it cannot be bundled. hono and
  // @hono/node-server are real dependencies and stay external by default.
  external: ["@libsql/client"],
  // Never clean: `vite build` writes dist/client first and the two outputs
  // share this directory.
  clean: false,
  sourcemap: false,
  dts: false,
});
