import { defineConfig } from "@pandacss/dev";

/**
 * One palette, two themes.
 *
 * Every colour a component uses is a semantic token with a light and a dark
 * value, so a component never asks which theme it is in. The dark condition is
 * an attribute on <html>, set before first paint by the script in __root.tsx —
 * it follows the OS until someone picks a theme explicitly.
 *
 * Run and log colours follow the convention every scheduler dashboard uses
 * (success green, warning amber, failure red, running blue, skipped grey),
 * because that is what the eye already reads before it reads the text. Timing
 * labels are a categorical series, so `fetch` keeps its colour from one run to
 * the next.
 */
const c = (base: string, dark: string) => ({ value: { base, _dark: dark } });

export default defineConfig({
  preflight: true,
  include: ["./src/**/*.{ts,tsx}"],
  exclude: [],
  jsxFramework: "react",
  // Every style is written through `css()`. Without this Panda also reads JSX
  // props whose names happen to be CSS properties — a prop called `direction`
  // or `size` becomes a junk rule.
  jsxStyleProps: "none",
  outdir: "styled-system",
  conditions: {
    extend: {
      dark: "[data-theme=dark] &",
      light: "[data-theme=light] &",
    },
  },
  theme: {
    extend: {
      tokens: {
        fonts: {
          body: {
            value: 'Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
          },
          mono: {
            value: '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
          },
        },
        radii: {
          xs: { value: "3px" },
          sm: { value: "4px" },
          md: { value: "6px" },
          lg: { value: "8px" },
        },
      },
      semanticTokens: {
        colors: {
          // Surfaces, in the order they stack: the app chrome (top bar, rail,
          // sidebar), the work area, raised cards, and code wells.
          chrome: c("#f3f4f6", "#18181b"),
          canvas: c("#ffffff", "#1f1f23"),
          raised: c("#ffffff", "#26262b"),
          well: c("#f8f9fb", "#19191c"),
          hover: c("#eceef2", "#2c2c32"),
          selected: c("#e5edff", "#2b3350"),

          fg: c("#18181b", "#e7e7ea"),
          muted: c("#5f6572", "#a1a1aa"),
          faint: c("#9097a3", "#6c6c75"),

          line: c("#e3e5ea", "#303036"),
          lineStrong: c("#cfd3da", "#43434b"),

          accent: c("#1f6feb", "#6ea8fe"),
          accentFg: c("#ffffff", "#0b1220"),
          accentSoft: c("#e8f0fe", "#1e2a44"),

          ok: c("#15803d", "#4ade80"),
          okSoft: c("#e7f6ec", "#16301f"),
          warn: c("#b45309", "#fbbf24"),
          warnSoft: c("#fdf3e3", "#352a12"),
          bad: c("#c62828", "#f87171"),
          badSoft: c("#fdecec", "#3a1d1f"),
          info: c("#1d4ed8", "#60a5fa"),

          // Timing labels, assigned by a stable hash of the label.
          series1: c("#1d4ed8", "#60a5fa"),
          series2: c("#b45309", "#fbbf24"),
          series3: c("#7e22ce", "#c084fc"),
          series4: c("#0f766e", "#2dd4bf"),
          series5: c("#be185d", "#f472b6"),
          series6: c("#15803d", "#4ade80"),
          series7: c("#7c3aed", "#a78bfa"),
          series8: c("#64748b", "#94a3b8"),

          // JSON syntax.
          synKey: c("#9a3412", "#f0abfc"),
          synString: c("#15803d", "#86efac"),
          synNumber: c("#1d4ed8", "#93c5fd"),
          synBool: c("#7e22ce", "#c4b5fd"),
          synNull: c("#6b7280", "#9ca3af"),
          synPunct: c("#6b7280", "#71717a"),
        },
      },
    },
  },
  globalCss: {
    // A fixed-height workspace, not a document: the shell fills the viewport
    // once and every pane inside it scrolls on its own.
    "html, body": {
      height: "100%",
      overflow: "hidden",
    },
    body: {
      fontFamily: "body",
      fontSize: "13px",
      color: "fg",
      bg: "canvas",
      lineHeight: "1.45",
      margin: 0,
      WebkitFontSmoothing: "antialiased",
      colorScheme: "light",
      _dark: { colorScheme: "dark" },
    },
    "input, button, select, textarea": {
      fontFamily: "inherit",
      fontSize: "inherit",
      color: "inherit",
    },
    "::selection": { bg: "accentSoft" },
    "::-webkit-scrollbar": { width: "10px", height: "10px" },
    "::-webkit-scrollbar-thumb": {
      background: "lineStrong",
      borderRadius: "999px",
      border: "3px solid transparent",
      backgroundClip: "content-box",
    },
    "::-webkit-scrollbar-corner": { background: "transparent" },
  },
});
