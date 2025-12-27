import { join } from "node:path";
import { isFile, getCwd, stripAbsBasePath } from "op3-os";
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

  const _initialTaskContent = `
import { EntryContext } from "@op3/cli";

// Run every 5 seconds
export const timing = "*/5 * * * * *";

export const task = async (ctx: EntryContext) => {
  console.log("Example task executed every 5 seconds. Time:", new Date().toISOString());
};


// Optional hooks

// export const shouldSkip = async (ctx: EntryContext) => {
//   return false; // Change to true to skip execution
// };

// export const onSuccess = async (ctx: EntryContext) => {
//   console.log("Task completed successfully");
// };

// export const onError = (error: Error, ctx: EntryContext) => {
//   console.error("Task failed with error:", error);
// };

// export const onComplete = async (ctx: EntryContext) => {
//   console.log("Task execution completed");
// };
`;

  const initialTaskContent = `
// Write your TypeScript code here
import { EntryContext } from "@op3/cli";

// Run every 5 seconds
export const timing = "*/5 * * * * *";

export const task = async (ctx: EntryContext) => {
  console.log("Test task");

  const result = await fetch("https://example.com").then(res => res.text());

  console.log('result:', result);

  return { result };
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
  console.log(`Initialized!\n\nRun 'op3 run' to start tasks.`);
};
