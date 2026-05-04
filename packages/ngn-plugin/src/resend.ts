import { definePlugin, type Plugin, type PluginInitContext } from "ngn-core";
import { Resend, type CreateEmailOptions } from "resend";

// Import the interface we're augmenting
// @ts-expect-error - PluginRegistry is used via module augmentation below
import type { PluginRegistry } from "@apisurf/ngn";

/**
 * Configuration for the Resend plugin
 */
export interface ResendPluginConfig {
  /** Resend API key */
  apiKey: string;
}

/**
 * Result of sending an email
 */
export interface SendEmailResult {
  /** Email ID if successful */
  id?: string;
  /** Error message if failed */
  error?: string;
}

/**
 * API exposed by the Resend plugin
 */
export interface ResendPluginApi {
  /** Send an email using Resend's CreateEmailOptions */
  send: (options: CreateEmailOptions) => Promise<SendEmailResult>;
}

/**
 * Creates a Resend plugin instance for sending emails
 *
 * @example
 * ```ts
 * import { defineConfig } from '@apisurf/ngn';
 * import { resendPlugin } from '@apisurf/ngn-plugin/resend';
 *
 * export default defineConfig({
 *   plugins: [
 *     resendPlugin({ apiKey: process.env.RESEND_API_KEY }),
 *   ],
 * });
 *
 * // In a task:
 * export async function task(ctx) {
 *   const result = await ctx.plugins.resend.send({
 *     from: 'noreply@example.com',
 *     to: 'user@example.com',
 *     subject: 'Hello from NGN',
 *     text: 'This is a test email sent from an NGN task.',
 *   });
 *
 *   if (result.error) {
 *     ctx.log.error(`Failed to send email: ${result.error}`);
 *   } else {
 *     ctx.log.info(`Email sent with ID: ${result.id}`);
 *   }
 * }
 * ```
 */
export function resendPlugin(
  config: ResendPluginConfig
): Plugin<"resend", ResendPluginConfig, ResendPluginApi> {
  let resend: Resend;

  return definePlugin({
    name: "resend",
    config,

    init(_ctx: PluginInitContext) {
      resend = new Resend(config.apiKey);

      return {
        send: async (options: CreateEmailOptions): Promise<SendEmailResult> => {
          const { data, error } = await resend.emails.send(options);

          if (error) {
            return { error: error.message };
          }

          return { id: data?.id };
        },
      };
    },

    destroy() {
      // No cleanup needed - Resend client is stateless
    },
  });
}

// Auto-register plugin types when this module is imported
declare module "@apisurf/ngn" {
  interface PluginRegistry {
    resend: ResendPluginApi;
  }
}
