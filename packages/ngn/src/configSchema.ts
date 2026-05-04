import { z } from "zod";
import { DEFAULT_MATCH_PATTERN, DEFAULT_ENV_FILE } from "./constants";
import type { Plugin } from "./pluginTypes";

export const configSchema = z.object({
  dbPath: z
    .union([z.literal(":memory:"), z.string().startsWith("file:")])
    .default(":memory:"),
  port: z.number().int().positive().default(4545),
  match: z.array(z.string()).default([DEFAULT_MATCH_PATTERN]),
  envFile: z.string().default(DEFAULT_ENV_FILE),
  // Plugins are validated at runtime, not via Zod (for type inference)
  plugins: z.array(z.any()).optional().default([]),
});

export type ConfigFileOptions = z.infer<typeof configSchema>;

// Separate typed interface for config with full plugin typing
export interface TypedConfigFileOptions<
  TPlugins extends readonly Plugin[] = []
> {
  dbPath?: string;
  port?: number;
  match?: string[];
  envFile?: string;
  plugins?: TPlugins;
}
