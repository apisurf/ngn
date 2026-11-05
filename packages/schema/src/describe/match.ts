// Which tasks a name means, the way people name them: `scrape.ts`, `scrape`,
// `api/scrape.ts`. Tried in order, the first step that finds anything wins:
//
//   1. the exact path relative to the project root   tasks/scrape.ts
//   2. the same path under the tasks folder          scrape.ts → tasks/scrape.ts
//   3. a path suffix, whole segments only, with      api/scrape.ts, scrape.ts, scrape
//      or without the file's extension
//
// Case is ignored. Globs are the CLI's business (it matches them against files
// on disk); this is for names.

export function matchTaskName(
  candidates: readonly string[],
  name: string,
  tasksDir = "tasks",
): string[] {
  const wanted = name.trim().replace(/^\.\//, "").toLowerCase();
  if (!wanted) return [];
  const lower = candidates.map((path) => path.toLowerCase());

  const exact = candidates.filter((_, i) => lower[i] === wanted);
  if (exact.length) return exact;

  const underTasks = `${tasksDir.toLowerCase()}/${wanted}`;
  const inTasks = candidates.filter((_, i) => lower[i] === underTasks);
  if (inTasks.length) return inTasks;

  return candidates.filter((_, i) => {
    const path = lower[i]!;
    return endsWithSegments(path, wanted) || endsWithSegments(stripExtension(path), wanted);
  });
}

/** `tasks/api/scrape.ts` ends with `api/scrape.ts` and `scrape.ts`, but not `rape.ts`. */
function endsWithSegments(path: string, suffix: string): boolean {
  return path === suffix || path.endsWith(`/${suffix}`);
}

export function stripExtension(path: string): string {
  return path.replace(/\.[cm]?[jt]sx?$/, "");
}
