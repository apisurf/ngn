import { z } from "zod";
import { get } from "../api";

export const metaSchema = z.object({
  version: z.string(),
  db: z.object({
    path: z.string(),
    exists: z.boolean(),
  }),
  // Live execution needs a running `ngn`, which the viewer is not. Whether one
  // is reachable is a fact about this session, so the client asks rather than
  // assuming, and the live editor turns itself off when the answer is no.
  live: z.object({
    url: z.string().nullable(),
    available: z.boolean(),
  }),
});

export type Meta = z.infer<typeof metaSchema>;

export const fetchMeta = async () => {
  const res = await get("/meta");
  return metaSchema.parse(res);
};
