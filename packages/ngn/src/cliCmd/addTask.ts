import { join } from "node:path";
import { isFile, getCwd, stripAbsBasePath } from "@apisurf/ngn-os";
import { writeFileSync } from "node:fs";
const DEFAULT_TASKS_DIR = "tasks";

const createInitialTask = async (initialTaskPath: string, cwd: string) => {
  if (await isFile(initialTaskPath)) {
    console.log(
      `Initial task already exists at ${stripAbsBasePath(
        initialTaskPath,
        cwd
      )}. Skipping...`
    );
    return;
  }

  const initialTaskContent = `
// Write your TypeScript code here.
// Need a library? npm install it and import it — only this file is bundled.
import { TaskContext } from "@apisurf/ngn";

// Run every 5 seconds
export const timing = "*/5 * * * * *";

export const task = async (ctx: TaskContext) => {
  const result = await fetch("https://example.com").then(res => res.text());

  // ctx.sqlite is this task's own database, kept next to this file
  await ctx.sqlite.execute(
    "CREATE TABLE IF NOT EXISTS results (length INTEGER, seen TEXT)"
  );
  await ctx.sqlite.execute("INSERT INTO results (length, seen) VALUES (?, ?)", [
    result.length,
    new Date().toISOString(),
  ]);

  await ctx.log.info(\`fetched \${result.length} bytes\`);

  return { length: result.length };
};`;

  writeFileSync(initialTaskPath, initialTaskContent, "utf-8");
};

export const addTask = async (
  filePath: string,
  options: {
    root?: string;
  }
) => {
  const cwd = getCwd(process.cwd(), options.root || process.cwd());
  const initialTaskPath = join(cwd, DEFAULT_TASKS_DIR, filePath);

  await createInitialTask(initialTaskPath, cwd);
  console.log(`Initialized!\n\nRun 'ngn run' to start tasks.`);
};
