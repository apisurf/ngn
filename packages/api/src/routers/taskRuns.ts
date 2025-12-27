import { Hono } from "hono";
import { Client } from "op3-persistence";
import { responder } from "~/lib/api.js";
import { stripUndefinedArgs } from "~/lib/db.js";

export const createRouter = (db: Client) => {
  const router = new Hono();

  router.get("/", async (c) => {
    const query = c.req.query();
    const { search, status } = query;
    const conditions: string[] = [];
    const args: Record<string, any> = {};

    if (search) {
      conditions.push("LOWER(ft.path) LIKE LOWER(:path)");
      args.path = `%${search}%`;
    }
    if (status && status !== "all") {
      conditions.push("tr.status = :status");
      args.status = status;
    }

    const whereClause = conditions.length
      ? `WHERE ${conditions.join(" AND ")}`
      : "";

    const result = await db.execute({
      sql: `SELECT
              tr.id as id,
              ft.path as path,
              tr.status as status,
              tr.started_at as started_at,
              tr.ended_at as ended_at,
              (tr.ended_at - tr.started_at) as duration,
              MAX(ftv.version) as version
            FROM
            task_runs tr
            LEFT JOIN file_tasks ft ON tr.file_task_id = ft.id
            LEFT JOIN file_task_versions ftv ON ft.id = ftv.file_task_id
            ${whereClause}
            GROUP BY ft.id, tr.id, ft.path, tr.status, tr.started_at, tr.ended_at
            ORDER BY tr.started_at DESC
            LIMIT 20`,
      args: stripUndefinedArgs(args),
    });

    return responder(c).list("task_run", result.rows);
  });

  router.get("/:id", async (c) => {
    const id = c.req.param("id");
    if (!id) {
      return c.json({ error: "ID is required" }, 400);
    }
    const result = await db.execute({
      sql: `SELECT * FROM task_runs WHERE id = :id LIMIT 1`,
      args: { id },
    });
    return responder(c).one("task_run", result.rows[0]);
  });

  // Logs for a run
  router.get("/:id/logs", async (c) => {
    const id = c.req.param("id");
    const result = await db.execute({
      sql: `
        SELECT
          l.id,
          l.status AS log_status,
          l.value AS log_value,
          ft.path AS task_path,
          l.task_run_id,
          l.created_at AS log_created_at
        FROM logs l
        JOIN file_tasks ft ON l.file_task_id = ft.id
        WHERE l.task_run_id = :id
        ORDER BY l.created_at DESC
        LIMIT 100
      `,
      args: { id },
    });
    return responder(c).list("task_run", result.rows);
  });

  // Timings for a run
  router.get("/:id/timings", async (c) => {
    const id = c.req.param("id");
    const result = await db.execute({
      sql: `
        SELECT
          id,
          label,
          value,
          created_at
        FROM timings
        WHERE task_run_id = :id
        ORDER BY created_at DESC
        LIMIT 100
      `,
      args: { id },
    });
    return responder(c).list("task_run", result.rows);
  });

  return router;
};
