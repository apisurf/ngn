/// <reference types="vitest" />
import { defineConfig } from "vite";
import viteReact from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import { resolve } from "node:path";

const NGN_UI_PORT = Number(process.env.NGN_UI_PORT || "3000");
/** Where `pnpm dev:server` puts the API in development. */
const NGN_UI_DEV_API = process.env.NGN_UI_DEV_API || "http://127.0.0.1:8787";

// https://vitejs.dev/config/
export default defineConfig({
  // dev server
  server: {
    port: NGN_UI_PORT,
    // In production the client and the API are one process on one origin. The
    // proxy reproduces that here so `/api/...` is the only path the client
    // ever knows, in both modes.
    proxy: {
      "/api": { target: NGN_UI_DEV_API, changeOrigin: true },
    },
  },
  build: {
    // Sits next to the bundled server (dist/server.js), which serves it.
    outDir: "dist/client",
    emptyOutDir: true,
  },
  plugins: [
    tanstackRouter({
      target: "react",
      autoCodeSplitting: true,
    }),
    viteReact(),
    tsconfigPaths(),
  ],
  test: {
    globals: true,
    environment: "jsdom",
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
  define: {
    APP_VERSION: JSON.stringify(process.env.npm_package_version),
  },
});
