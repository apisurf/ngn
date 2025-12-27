/// <reference types="vitest" />
import { defineConfig } from "vite";
import viteReact from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import { resolve } from "node:path";

const OP3_UI_PORT = Number(process.env.OP3_UI_PORT || "3000");

// https://vitejs.dev/config/
export default defineConfig({
  // dev server
  server: {
    port: OP3_UI_PORT,
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
