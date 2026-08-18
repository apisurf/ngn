import { z } from "zod";
import { DEFAULT_MATCH_PATTERN, DEFAULT_ENV_FILE } from "./constants.js";

export const configSchema = z.object({
  dbPath: z.union([z.literal(":memory:"), z.string().startsWith("file:")]).default(":memory:"),
  port: z.number().int().positive().default(4545),
  match: z.array(z.string()).default([DEFAULT_MATCH_PATTERN]),
  envFile: z.string().default(DEFAULT_ENV_FILE),
});

export type ConfigFileOptions = z.infer<typeof configSchema>;
