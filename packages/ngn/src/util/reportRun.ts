/**
 * What `ngn` prints when a run throws: one line per problem, naming the task,
 * the run, the stage it failed in and what it threw, then the command that
 * shows the rest. The run's record holds the same error with its stack, so the
 * scheduler's terminal stays one line per problem.
 *
 *   failed  tasks/collect.ts #41 in task: TypeError: Cannot read … → ngn show 41
 *   warn    tasks/collect.ts #42: onSuccess threw Error: mail down → ngn show 42
 *
 * A one-off run (`--once`, the editor) has someone watching it, so it adds the
 * stack frames that say where in the task it happened.
 */
import type { RunProblem } from "@apisurf/ngn-core";
import { describeTask, errorFrames, errorSummary } from "@apisurf/ngn-schema/describe";

/** A task's path, or "editor run" for the editor's throwaway files. */
export function taskLabel(path: string): string {
  return describeTask(path).editor ? "editor run" : path;
}

export function describeProblem(problem: RunProblem, { frames = false } = {}): string {
  const { path, runId, stage, error, fatal } = problem;
  const head = fatal
    ? `failed  ${taskLabel(path)} #${runId} in ${stage}: ${errorSummary(error)}`
    : `warn    ${taskLabel(path)} #${runId}: ${stage} threw ${errorSummary(error)}`;
  const stack = frames ? errorFrames(error) : [];
  return [`${head} → ngn show ${runId}`, ...stack].join("\n");
}

/**
 * An error no run recorded: the task file did not compile, or ngn could not
 * write the run's row. Nothing else will ever say what it was, so it gets its
 * frames.
 */
export function describeUnrecorded(path: string, error: unknown): string {
  return [
    `failed  ${taskLabel(path)} before a run was recorded: ${errorSummary(error)}`,
    ...errorFrames(error),
  ].join("\n");
}

/** Print each problem to stderr as it is recorded. */
export const printProblems =
  (options: { frames?: boolean } = {}) =>
  (problem: RunProblem) =>
    console.error(describeProblem(problem, options));

/**
 * Something wrong with a task's schedule rather than a run: a transition the
 * state table refused, a timing change that cannot apply. One line, on stderr.
 */
export function printScheduleProblem(_path: string, message: string) {
  console.error(`warn    ${message}`);
}
