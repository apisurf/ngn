import { Hono } from "hono";
import { Client } from "op3-persistence";
import { z } from "zod";
import type { CoreControls } from "../types.js";

export const createRouter = (db: Client, coreControls: CoreControls) => {
  const router = new Hono();

  const liveTaskSchema = z.object({
    code: z.string(),
    language: z.enum(["typescript", "javascript"]),
  });

  router.post("/", async (c) => {
    const { code, language } = liveTaskSchema.parse(await c.req.json());
    const result = await coreControls.executeLiveTask(code, language);

    // if result is a serializable object, return it, otherwise return a 500 error
    try {
      return c.json({ result: result ?? null });
    } catch (error) {
      console.error("Live code execution result not serializable", result);
      return c.json({ error: "Result is not serializable" }, 500);
    }
  });

  return router;
};
