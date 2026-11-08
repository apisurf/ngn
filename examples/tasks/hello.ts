import type { TaskContext } from "@apisurf/ngn";

// Every 10 seconds
export const timing = "*/10 * * * * *";

export const task = async (ctx: TaskContext) => {
  await ctx.log.info("hello");
};
