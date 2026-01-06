import type { ConfigFileOptions } from "./configSchema";

export function defineConfig(
  config: Partial<ConfigFileOptions>
): Partial<ConfigFileOptions> {
  return config;
}
