import type { Client } from "@libsql/client";
import { Hono } from "hono";
import { stripUndefinedArgs } from "../db.js";
import type { InValue } from "../db.js";
import { responder } from "../responder.js";

export const createRouter = (db: Client) => {
  const router = new Hono();

  router.get("/", async (c) => {
    const query = c.req.query();
    const { search, status } = query;
    const conditions: string[] = [];
    const args: Record<string, InValue | undefined> = {};

    if (search) {
      conditions.push("LOWER(ft.path) LIKE LOWER(:path)");
      args.path = `%${search}%`;
    }
    if (status && status !== "all") {
      conditions.push("logs.status = :status");
      args.status = status;
    }

    const whereClause = conditions.length
      ? `WHERE ${conditions.join(" AND ")}`
      : "";

    const result = await db.execute({
      sql: `SELECT
          ft.id as file_task_id,
          ft.path as path,
          logs.status as status,
          logs.value as value,
          tr.created_at as created_at,
          tr.id as task_run_id,
          logs.id as log_id
        FROM logs
        JOIN file_tasks ft ON logs.file_task_id = ft.id
        JOIN task_runs tr ON logs.task_run_id = tr.id
        ${whereClause}
        ORDER BY log_id DESC
        LIMIT 20`,
      args: stripUndefinedArgs(args),
    });

    return responder(c).list("log", result.rows);
  });

  router.get("/:id", async (c) => {
    const id = c.req.param("id");
    const log = await db.execute({
      sql: "SELECT * FROM logs WHERE id = :id LIMIT 1",
      args: { id },
    });
    return c.json(log.rows[0]);
  });

  return router;
};
