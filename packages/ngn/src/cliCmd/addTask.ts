import { dirname, join } from "node:path";
import { isFile, getCwd, stripAbsBasePath } from "@apisurf/ngn-os";
import { mkdirSync, writeFileSync } from "node:fs";
const DEFAULT_TASKS_DIR = "tasks";

const createInitialTask = async (initialTaskPath: string, cwd: string): Promise<boolean> => {
  const relative = stripAbsBasePath(initialTaskPath, cwd);

  if (await isFile(initialTaskPath)) {
    console.log(`exists ${relative}`);
    return false;
  }

  const initialTaskContent = `
// Write your TypeScript code here.
// Need a library? npm install it and import it — only this file is bundled.
import { TaskContext } from "@apisurf/ngn";

// Run every 5 seconds
export const timing = "*/5 * * * * *";

export const task = async (ctx: TaskContext) => {
  // ctx.run.signal aborts shortly before the next tick is due
  const result = await fetch("https://example.com", { signal: ctx.run.signal }).then(res => res.text());

  // ctx.sqlite is this task's own database, kept next to this file
  await ctx.sqlite.execute(
    "CREATE TABLE IF NOT EXISTS results (length INTEGER, seen TEXT)"
  );
  await ctx.sqlite.execute("INSERT INTO results (length, seen) VALUES (?, ?)", [
    result.length,
    new Date().toISOString(),
  ]);

  await ctx.log.info(\`fetched \${result.length} bytes\`);

  // Stored with the run, in task_runs.result
  return { length: result.length };
};`;

  // tasks/ may not exist yet (`ngn add` before `ngn init`), and the path may
  // name a subdirectory of its own — writeFileSync creates neither.
  try {
    mkdirSync(dirname(initialTaskPath), { recursive: true });
    writeFileSync(initialTaskPath, initialTaskContent, "utf-8");
  } catch (error) {
    console.error(
      `ngn: cannot write ${relative}: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
    return false;
  }

  console.log(`wrote ${relative}`);
  return true;
};

export const addTask = async (
  filePath: string,
  options: {
    root?: string;
  },
) => {
  const cwd = getCwd(process.cwd(), options.root || process.cwd());
  const initialTaskPath = join(cwd, DEFAULT_TASKS_DIR, filePath);

  if (await createInitialTask(initialTaskPath, cwd)) {
    console.log("next: ngn run");
  }
};
