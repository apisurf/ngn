import { Hono } from "hono";
import { Client } from "ngn-persistence";
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
      conditions.push("ft.status = :status");
      args.status = status;
    }

    const whereClause = conditions.length
      ? `WHERE ${conditions.join(" AND ")}`
      : "";

    const result = await db.execute({
      sql: `SELECT
          ft.id as id,
          ft.path as path,
          ft.status as status,
          ft.created_at as created_at,
          MAX(ftv.version) as last_version,
          MAX(ftv.created_at) as last_version_created_at,
          COUNT(tr.id) as run_count,
          MAX(tr.started_at) as last_run_started_at
        FROM file_tasks ft
        LEFT JOIN file_task_versions ftv ON ft.id = ftv.file_task_id
        LEFT JOIN task_runs tr ON ft.id = tr.file_task_id
        ${whereClause}
        GROUP BY ft.id, ft.path, ft.status
        ORDER BY last_version_created_at DESC
        LIMIT 20`,
      args: stripUndefinedArgs(args),
    });

    return responder(c).list("file_task", result.rows);
  });

  router.get("/simple", async (c) => {
    const fileTasks = await db.execute(
      "SELECT id, path, parent_path, status FROM file_tasks ORDER BY path ASC"
    );

    return c.json(fileTasks.rows);
  });

  router.get("/activity", async (c) => {
    const activities = await db.execute(
      "SELECT tr.id as task_run_id, ft.path as path, tr.status as status, tr.created_at as created_at FROM file_tasks ft JOIN task_runs tr ON ft.id = tr.file_task_id ORDER BY tr.created_at DESC LIMIT 10"
    );
    return c.json(activities.rows);
  });

  router.get("/:id", async (c) => {
    const id = c.req.param("id");
    const result = await db.execute({
      sql: `
      SELECT
        ft.id,
        ft.path,
        ft.status,
        ft.created_at,
        MAX(ftv.version) as last_version,
        MAX(ftv.created_at) as last_version_created_at,
        MAX(tr.started_at) as last_run_started_at
      FROM file_tasks ft
      LEFT JOIN file_task_versions ftv ON ft.id = ftv.file_task_id
      LEFT JOIN task_runs tr ON ft.id = tr.file_task_id
      WHERE ft.id = :id
      GROUP BY ft.id, ft.path, ft.status, ft.created_at
      LIMIT 1
    `,
      args: { id },
    });

    return responder(c).one("file_task", result.rows[0]);
  });

  router.get("/:id/runs", async (c) => {
    const id = c.req.param("id");
    const result = await db.execute({
      sql: `
        SELECT
          tr.id,
          ftv.version AS task_version,
          tr.status AS run_status,
          tr.started_at,
          tr.ended_at,
          (tr.ended_at - tr.started_at) AS run_duration
        FROM task_runs tr
        JOIN file_task_versions ftv ON tr.file_task_version_id = ftv.id
        WHERE tr.file_task_id = :id
        ORDER BY tr.started_at DESC
        LIMIT 100
      `,
      args: { id },
    });
    return responder(c).list("file_task", result.rows);
  });

  router.get("/:id/kvs", async (c) => {
    const id = c.req.param("id");
    const result = await db.execute({
      sql: "SELECT * FROM kvs WHERE file_task_id = :id",
      args: { id },
    });
    return responder(c).list("file_task", result.rows);
  });

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
        WHERE l.file_task_id = :id
        ORDER BY l.created_at DESC
        LIMIT 100
      `,
      args: { id },
    });
    return responder(c).list("file_task", result.rows);
  });

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
        WHERE file_task_id = :id
        ORDER BY created_at DESC
        LIMIT 100
      `,
      args: { id },
    });
    return responder(c).list("file_task", result.rows);
  });

  router.get("/:id/versions", async (c) => {
    const id = c.req.param("id");
    const result = await db.execute({
      sql: `
        SELECT *
        FROM file_task_versions
        WHERE file_task_id = :id
        ORDER BY created_at DESC
        LIMIT 100
      `,
      args: { id },
    });
    return responder(c).list("file_task", result.rows);
  });

  return router;
};
