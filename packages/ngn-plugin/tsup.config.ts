import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    sqlite: "src/sqlite.ts",
    alerting: "src/alerting.ts",
    resend: "src/resend.ts",
    supabase: "src/supabase.ts",
    s3: "src/s3.ts",
  },
  format: ["esm"],
  dts: true,
  outDir: "dist",
  clean: true,
});
