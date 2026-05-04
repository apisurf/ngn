import { definePlugin, type Plugin, type PluginInitContext } from "ngn-core";
import {
  S3Client,
  PutObjectCommand,
  type PutObjectCommandInput,
} from "@aws-sdk/client-s3";

// Import the interface we're augmenting
// @ts-expect-error - PluginRegistry is used via module augmentation below
import type { PluginRegistry } from "@apisurf/ngn";

/**
 * Configuration for the S3 plugin
 */
export interface S3PluginConfig {
  /** AWS Access Key ID */
  accessKeyId: string;
  /** AWS Secret Access Key */
  secretAccessKey: string;
  /** Default AWS region (can be overridden per-operation) */
  region?: string;
  /** Custom endpoint URL for S3-compatible services (e.g. Cloudflare R2, MinIO) */
  endpoint?: string;
}

/**
 * Options for uploading a file to S3
 */
export interface UploadOptions {
  /** Target S3 bucket name */
  bucket: string;
  /** Object key (path within the bucket) */
  key: string;
  /** File content to upload */
  body: PutObjectCommandInput["Body"];
  /** MIME type of the file */
  contentType?: string;
  /** AWS region for this specific upload (overrides default) */
  region?: string;
}

/**
 * Result of an upload operation
 */
export interface UploadResult {
  /** Whether the upload succeeded */
  success: boolean;
  /** ETag of the uploaded object (if successful) */
  etag?: string;
  /** Error message (if failed) */
  error?: string;
}

/**
 * API exposed by the S3 plugin
 */
export interface S3PluginApi {
  /** S3 client instance for advanced operations */
  client: S3Client;
  /** Upload a file to S3 */
  upload: (options: UploadOptions) => Promise<UploadResult>;
}

/**
 * Creates an S3 plugin instance for interacting with AWS S3
 *
 * @example
 * ```ts
 * import { defineConfig } from '@apisurf/ngn';
 * import { s3Plugin } from '@apisurf/ngn-plugin/s3';
 *
 * export default defineConfig({
 *   plugins: [
 *     s3Plugin({
 *       accessKeyId: process.env.AWS_ACCESS_KEY_ID,
 *       secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
 *       region: 'us-east-1',
 *       // For Cloudflare R2 or other S3-compatible services:
 *       // endpoint: 'https://<account-id>.r2.cloudflarestorage.com',
 *     }),
 *   ],
 * });
 *
 * // In a task:
 * export async function task(ctx) {
 *   const result = await ctx.plugins.s3.upload({
 *     bucket: 'my-bucket',
 *     key: 'uploads/file.txt',
 *     body: Buffer.from('Hello, S3!'),
 *     contentType: 'text/plain',
 *   });
 *
 *   if (result.error) {
 *     ctx.log.error(`Failed to upload: ${result.error}`);
 *   } else {
 *     ctx.log.info(`Uploaded successfully, ETag: ${result.etag}`);
 *   }
 * }
 * ```
 *
 * @example
 * ```ts
 * // Using the client directly for advanced operations
 * import { ListBucketsCommand } from '@aws-sdk/client-s3';
 *
 * export async function task(ctx) {
 *   const { Buckets } = await ctx.plugins.s3.client.send(
 *     new ListBucketsCommand({})
 *   );
 *   ctx.log.info(`Found ${Buckets?.length ?? 0} buckets`);
 * }
 * ```
 */
export function s3Plugin(
  config: S3PluginConfig
): Plugin<"s3", S3PluginConfig, S3PluginApi> {
  let client: S3Client;
  const regionClients = new Map<string, S3Client>();

  const getClientForRegion = (region?: string): S3Client => {
    const targetRegion = region ?? config.region;

    // Use default client if no region specified or matches default
    if (!targetRegion || targetRegion === config.region) {
      return client;
    }

    // Get or create a client for the specific region
    let regionClient = regionClients.get(targetRegion);
    if (!regionClient) {
      regionClient = new S3Client({
        region: targetRegion,
        endpoint: config.endpoint,
        credentials: {
          accessKeyId: config.accessKeyId,
          secretAccessKey: config.secretAccessKey,
        },
      });
      regionClients.set(targetRegion, regionClient);
    }

    return regionClient;
  };

  return definePlugin({
    name: "s3",
    config,

    init(_ctx: PluginInitContext) {
      client = new S3Client({
        region: config.region,
        endpoint: config.endpoint,
        credentials: {
          accessKeyId: config.accessKeyId,
          secretAccessKey: config.secretAccessKey,
        },
      });

      return {
        client,

        upload: async (options: UploadOptions): Promise<UploadResult> => {
          const s3Client = getClientForRegion(options.region);

          try {
            const command = new PutObjectCommand({
              Bucket: options.bucket,
              Key: options.key,
              Body: options.body,
              ContentType: options.contentType,
            });

            const response = await s3Client.send(command);

            return {
              success: true,
              etag: response.ETag,
            };
          } catch (err) {
            const message =
              err instanceof Error ? err.message : "Unknown error";
            return {
              success: false,
              error: message,
            };
          }
        },
      };
    },

    destroy() {
      client?.destroy();
      for (const regionClient of regionClients.values()) {
        regionClient.destroy();
      }
      regionClients.clear();
    },
  });
}

// Re-export types from AWS SDK for convenience
export { S3Client } from "@aws-sdk/client-s3";

// Auto-register plugin types when this module is imported
declare module "@apisurf/ngn" {
  interface PluginRegistry {
    s3: S3PluginApi;
  }
}
