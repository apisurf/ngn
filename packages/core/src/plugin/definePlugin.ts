import { z } from "zod";
import type { Plugin } from "./types.js";

/**
 * Zod schema for runtime validation of the mandatory plugin interface
 */
export const pluginSchema = z.object({
  name: z.string().min(1, "Plugin name is required"),
  config: z.unknown().optional(),
  init: z.function().describe("init() method is required"),
  destroy: z.function().describe("destroy() method is required"),
});

/**
 * Plugin definition helper for better type inference.
 * Validates the plugin implements the mandatory interface at runtime.
 */
export function definePlugin<TName extends string, TConfig, TApi>(
  plugin: Plugin<TName, TConfig, TApi>
): Plugin<TName, TConfig, TApi> {
  const result = pluginSchema.safeParse(plugin);

  if (!result.success) {
    const errors = result.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid plugin definition:\n${errors}`);
  }

  return plugin;
}
