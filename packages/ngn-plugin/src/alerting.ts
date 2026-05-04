import { definePlugin, type Plugin, type PluginInitContext } from "ngn-core";

// Import the interface we're augmenting
// @ts-expect-error - PluginRegistry is used via module augmentation below
import type { PluginRegistry } from "@apisurf/ngn";

/**
 * Configuration for the Alerting plugin
 */
export interface AlertingPluginConfig {
  /** Optional prefix for alert messages */
  prefix?: string;
}

/**
 * API exposed by the Alerting plugin
 */
export interface AlertingPluginApi {
  /** Send an alert with the given text */
  alert: (text: string) => void;
}

/**
 * Creates an Alerting plugin instance
 *
 * @example
 * ```ts
 * import { defineConfig } from '@apisurf/ngn';
 * import { alertingPlugin } from '@apisurf/ngn-plugin';
 *
 * export default defineConfig({
 *   plugins: [
 *     alertingPlugin(),
 *   ],
 * });
 *
 * // In a task:
 * export async function task(ctx) {
 *   ctx.plugins.alerting.alert('Something important happened!');
 * }
 * ```
 */
export function alertingPlugin(
  config: AlertingPluginConfig = {}
): Plugin<"alerting", AlertingPluginConfig, AlertingPluginApi> {
  return definePlugin({
    name: "alerting",
    config,

    init(_ctx: PluginInitContext) {
      return {
        alert: (text: string) => {
          const prefix = config.prefix ? `${config.prefix} ` : "";
          console.log(`ALERT! ${prefix}${text}`);
        },
      };
    },

    destroy() {
      // No cleanup needed for this simple plugin
    },
  });
}

// Auto-register plugin types when this module is imported
declare module "@apisurf/ngn" {
  interface PluginRegistry {
    alerting: AlertingPluginApi;
  }
}
