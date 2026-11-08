import type { TaskContext } from "@apisurf/ngn";

// Every minute
export const timing = "* * * * *";

export const task = async (ctx: TaskContext) => {
  const res = await fetch("https://example.com", { signal: ctx.run.signal });
  const html = await res.text();

  await ctx.log.info(`fetched ${html.length} bytes`);

  // Whatever you return is stored with the run
  return { length: html.length };
};
