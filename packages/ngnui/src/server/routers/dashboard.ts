import type { Client } from "@libsql/client";
import { Hono } from "hono";

export const createRouter = (db: Client) => {
  const router = new Hono();

  router.get("/tasks-count", async (c) => {
    const [activeTasks, totalTasks] = await Promise.all([
      db.execute(
        "SELECT COUNT(*) as count FROM file_tasks WHERE status = 'active'",
      ),
      db.execute("SELECT COUNT(*) as count FROM file_tasks"),
    ]);

    return c.json({
      active: activeTasks.rows[0].count,
      total: totalTasks.rows[0].count,
    });
  });

  router.get("/task-runs-count", async (c) => {
    const [
      pendingRuns,
      skippedRuns,
      runningRuns,
      successRuns,
      failureRuns,
      totalRuns,
    ] = await Promise.all([
      db.execute(
        "SELECT COUNT(*) as count FROM task_runs WHERE status = 'pending'",
      ),
      db.execute(
        "SELECT COUNT(*) as count FROM task_runs WHERE status = 'skipped'",
      ),
      db.execute(
        "SELECT COUNT(*) as count FROM task_runs WHERE status = 'running'",
      ),
      db.execute(
        "SELECT COUNT(*) as count FROM task_runs WHERE status = 'success'",
      ),
      db.execute(
        "SELECT COUNT(*) as count FROM task_runs WHERE status = 'failure'",
      ),
      db.execute("SELECT COUNT(*) as count FROM task_runs"),
    ]);

    return c.json({
      pending: pendingRuns.rows[0].count,
      success: successRuns.rows[0].count,
      skipped: skippedRuns.rows[0].count,
      running: runningRuns.rows[0].count,
      failure: failureRuns.rows[0].count,
      total: totalRuns.rows[0].count,
    });
  });

  router.get("/log-entries", async (c) => {
    const [totalLogs, errorLogs, latestError] = await Promise.all([
      db.execute("SELECT COUNT(*) as count FROM logs"),
      db.execute("SELECT COUNT(*) as count FROM logs WHERE status = 'error'"),
      db.execute(
        "SELECT MAX(created_at) as latest FROM logs WHERE status = 'error'",
      ),
    ]);

    return c.json({
      total: totalLogs.rows[0].count,
      errors: errorLogs.rows[0].count,
      latest_error: latestError.rows[0].latest,
    });
  });

  router.get("/task-run-trends", async (c) => {
    const range = c.req.query("range") || "day";

    // Define time range and bucket size based on selection
    let timeRange: number; // in seconds
    let bucketSize: number; // in seconds

    switch (range) {
      case "hour":
        timeRange = 3600; // 1 hour
        bucketSize = 15; // 15 seconds
        break;
      case "week":
        timeRange = 604800; // 7 days
        bucketSize = 1800; // 30 minutes
        break;
      // "day" is the default
      default:
        timeRange = 86400; // 24 hours
        bucketSize = 300; // 5 minutes
        break;
    }

    const trends = await db.execute(
      `
      SELECT
        (started_at / 1000 / ${bucketSize}) * ${bucketSize} AS bucket_timestamp,
        datetime((started_at / 1000 / ${bucketSize}) * ${bucketSize}, 'unixepoch') AS time,
        SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) AS success_count,
        SUM(CASE WHEN status = 'skipped' THEN 1 ELSE 0 END) AS skipped_count,
        SUM(CASE WHEN status = 'failure' THEN 1 ELSE 0 END) AS failure_count
      FROM task_runs
      WHERE started_at >= (strftime('%s', 'now') - ${timeRange}) * 1000
      GROUP BY bucket_timestamp
      ORDER BY bucket_timestamp ASC;
      `,
    );
    return c.json(trends.rows);
  });

  return router;
};
