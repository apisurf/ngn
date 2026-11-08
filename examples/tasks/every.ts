import type { TaskContext } from "@apisurf/ngn";

// Every 30 seconds, counted from the first run
export const timing = { every: "30s" };

export const task = async (ctx: TaskContext) => {
  await ctx.log.info("tick");
};
