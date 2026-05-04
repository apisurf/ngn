import { definePlugin, type Plugin, type PluginInitContext } from "ngn-core";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Import the interface we're augmenting
// @ts-expect-error - PluginRegistry is used via module augmentation below
import type { PluginRegistry } from "@apisurf/ngn";

/**
 * Configuration for the Supabase plugin
 */
export interface SupabasePluginConfig {
  /** Supabase project URL */
  url: string;
  /** Supabase service role key (for server-side usage) */
  serviceRoleKey: string;
}

/**
 * API exposed by the Supabase plugin
 *
 * @template Database - Optional database schema type for typed queries
 */
export interface SupabasePluginApi<Database = unknown> {
  /** Supabase client instance */
  client: SupabaseClient<Database>;
}

/**
 * Creates a Supabase plugin instance for interacting with Supabase
 *
 * @template Database - Optional database schema type for typed queries.
 *   Generate types using `supabase gen types typescript`
 *
 * @example
 * ```ts
 * import { defineConfig } from '@apisurf/ngn';
 * import { supabasePlugin } from '@apisurf/ngn-plugin/supabase';
 *
 * export default defineConfig({
 *   plugins: [
 *     supabasePlugin({
 *       url: process.env.SUPABASE_URL,
 *       serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
 *     }),
 *   ],
 * });
 *
 * // In a task:
 * export async function task(ctx) {
 *   const { data, error } = await ctx.plugins.supabase.client
 *     .from('users')
 *     .select('*');
 *
 *   if (error) {
 *     ctx.log.error(`Failed to fetch users: ${error.message}`);
 *     return;
 *   }
 *
 *   ctx.log.info(`Found ${data.length} users`);
 * }
 * ```
 *
 * @example
 * ```ts
 * // With typed database schema
 * import { supabasePlugin } from '@apisurf/ngn-plugin/supabase';
 * import type { Database } from './database.types';
 *
 * export default defineConfig({
 *   plugins: [
 *     supabasePlugin<Database>({
 *       url: process.env.SUPABASE_URL,
 *       serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
 *     }),
 *   ],
 * });
 * ```
 */
export function supabasePlugin<Database = unknown>(
  config: SupabasePluginConfig
): Plugin<"supabase", SupabasePluginConfig, SupabasePluginApi<Database>> {
  let client: SupabaseClient<Database>;

  return definePlugin({
    name: "supabase",
    config,

    init(_ctx: PluginInitContext) {
      client = createClient<Database>(config.url, config.serviceRoleKey, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      });

      return {
        client,
      };
    },

    destroy() {
      // No explicit cleanup needed - Supabase client is stateless
    },
  });
}

// Re-export types from Supabase for convenience
export type { SupabaseClient } from "@supabase/supabase-js";

// Auto-register plugin types when this module is imported
declare module "@apisurf/ngn" {
  interface PluginRegistry {
    supabase: SupabasePluginApi;
  }
}
