import { Hono } from "hono";
import { Client } from "ngn-persistence";
import { responder } from "~/lib/api.js";
import { stripUndefinedArgs } from "~/lib/db.js";

export const createRouter = (db: Client) => {
  const router = new Hono();

  router.get("/", async (c) => {
    const query = c.req.query();
    const { search } = query;
    const conditions: string[] = [];
    const args: Record<string, any> = {};

    if (search) {
      conditions.push("LOWER(ft.path) LIKE LOWER(:path)");
      args.path = `%${search}%`;
    }

    const whereClause = conditions.length
      ? `WHERE ${conditions.join(" AND ")}`
      : "";

    const result = await db.execute({
      sql: `SELECT
              timings.id as timing_id,
              timings.label as label,
              timings.value as value,
              ft.path as path,
              ft.id as file_task_id,
              tr.id as task_run_id
            FROM
            timings
            JOIN file_tasks ft ON timings.file_task_id = ft.id
            JOIN task_runs tr ON timings.task_run_id = tr.id
            ${whereClause}
            GROUP BY timings.id, ft.id, tr.id
            ORDER BY tr.started_at DESC
            LIMIT 20`,
      args: stripUndefinedArgs(args),
    });

    return responder(c).list("timing", result.rows);
  });

  router.get("/:id", async (c) => {
    const id = c.req.param("id");
    const result = await db.execute({
      sql: "SELECT * FROM timings WHERE id = :id LIMIT 1",
      args: { id },
    });

    return c.json(result.rows[0]);
  });

  return router;
};
