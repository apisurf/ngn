import type { TaskContext } from "@apisurf/ngn";

// Every 15 seconds
export const timing = "*/15 * * * * *";

export const task = async (ctx: TaskContext) => {
  // Saved in tasks/counter.db, next to this file
  await ctx.sqlite.execute("CREATE TABLE IF NOT EXISTS ticks (at TEXT)");
  await ctx.sqlite.execute("INSERT INTO ticks (at) VALUES (?)", [new Date().toISOString()]);

  const { rows } = await ctx.sqlite.execute("SELECT COUNT(*) AS n FROM ticks");
  return { count: Number(rows[0]?.n) };
};
