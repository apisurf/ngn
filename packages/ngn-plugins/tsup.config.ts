import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    sqlite: "src/sqlite.ts",
    alerting: "src/alerting.ts",
  },
  format: ["esm"],
  dts: true,
  outDir: "dist",
  clean: true,
});
