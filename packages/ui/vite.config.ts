import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";

export default defineConfig({
  server: {
    port: 3000,
  },
  resolve: {
    tsconfigPaths: true,
  },
  // better-sqlite3 is a native addon: Node has to load it, so it must never be
  // bundled or pre-optimized.
  ssr: {
    external: ["better-sqlite3"],
  },
  optimizeDeps: {
    exclude: ["better-sqlite3"],
  },
  build: {
    // `ssr.external` covers the SSR environment; Nitro's server bundle is its
    // own environment and needs telling separately, or the production build
    // fails trying to resolve the native addon.
    rolldownOptions: {
      external: ["better-sqlite3"],
    },
  },
  plugins: [
    tanstackStart({
      srcDirectory: "src",
    }),
    viteReact(),
    // Plain Node output into dist/, which is what `files` publishes and what
    // bin/ngnui.mjs imports. There is no deploy target: this is a local viewer.
    nitro({
      preset: "node-server",
      output: { dir: "dist" },
    }),
  ],
});
