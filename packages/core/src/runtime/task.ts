import invariant from "tiny-invariant";
import {
  CompiledTaskCallbacks,
  BuildCompiledTaskConfigFn,
  RunControls,
  type RunStage,
  type TaskConfig,
} from "./types.js";
import { TaskContext, EntryExports, OverlapPolicy } from "../source/types.js";
import { Entry } from "../source/entry.js";
import { toMs } from "./duration.js";
import { deadlineSignal, runDeadline } from "./runWindow.js";
import { exclusiveNames } from "./locks.js";
import { openQueue } from "./queue/queue.js";
import {
  BREAKER_SKIP_REASON,
  breakerSkips,
  resolveRetry,
  retryFits,
  type ResolvedRetry,
} from "./retry.js";
import { EntryParams } from "../source/types.js";

export interface ExecuteSchedule {
  /** When the tick fired, epoch ms. */
  scheduledAt?: number | null;
  /** When the next tick is due, epoch ms. */
  nextAt?: number | null;
}

/** What one tick's attempts share, so a retry can point back at the first. */
interface TickAttempts {
  firstRunId: number | null;
  /** The `retry` export as the latest attempt read it. */
  retry: ResolvedRetry;
  /** The context of the attempt that just failed; null when it never got a run. */
  failedContext: TaskContext | null;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Where each error a run threw was recorded, for whoever reports it. */
const failedRuns = new WeakMap<object, { runId: number; stage: RunStage }>();

/** The `task_runs.id` of the run that threw `error`, when a run recorded it. */
export function failedRunId(error: unknown): number | null {
  return runFailure(error)?.runId ?? null;
}

/**
 * The run that recorded `error` and the stage it was thrown in; null for an
 * error no run recorded (a task file that did not compile, a database ngn
 * could not open), which only its thrower knows about.
 */
export function runFailure(error: unknown): { runId: number; stage: RunStage } | null {
  return error && typeof error === "object" ? (failedRuns.get(error) ?? null) : null;
}

export class Task {
  private taskCallbacks: CompiledTaskCallbacks | undefined;
  private startRun: TaskConfig["startRun"];
  private history: TaskConfig["history"];
  private env: TaskContext["env"];
  private kv: TaskContext["kv"];
  private sqlite: TaskContext["sqlite"];
  private meta: TaskContext["meta"];
  private entry: Entry | null = null;
  private entryExports: EntryExports | null = null;
  /** Executions started and not yet settled. */
  private inFlight = 0;

  constructor({
    entryParams,
    buildConfigFn,
  }: {
    entryParams: EntryParams;
    buildConfigFn: BuildCompiledTaskConfigFn;
  }) {
    invariant(entryParams, "Entry params not provided! Cannot create task.");

    this.entry = new Entry(entryParams, {
      onTaskCodeLoaded: this.taskCallbacks?.onTaskCodeLoaded,
    });

    const { taskCallbacks, startRun, history, env, kv, sqlite } = buildConfigFn({
      sourcePath: this.entry.paths.source,
      compiledPath: this.entry.paths.compiled,
    });
    this.taskCallbacks = taskCallbacks;
    this.startRun = startRun;
    this.history = history;
    this.sqlite = sqlite;
    this.meta = {
      fileTaskId: -1,
      fileTaskVersionId: -1,
      file: this.entry.fileDescriptor,
      tasksRootDir: this.entry.tasksRootDir,
    };
    this.env = env;
    this.kv = kv;
  }

  get sourcePath() {
    invariant(this.entry, "Entry not initialized.");
    return this.entry.paths.source;
  }

  get compiledPath() {
    invariant(this.entry, "Entry not initialized.");
    return this.entry.paths.compiled;
  }

  /**
   * Unique identifier for the task - the relative entry path
   */
  get taskPath() {
    invariant(this.entry, "Entry not initialized.");
    return this.entry.paths.relativeEntry;
  }

  get codeHash() {
    invariant(this.entry, "Entry not initialized.");
    return this.entry.codeHash;
  }

  get timingPattern() {
    invariant(this.entryExports, "Entry exports not initialized.");
    return this.entryExports.timing;
  }

  /**
   * The task's `overlap` export, `"skip"` when it has none. Throws on anything
   * else, naming the task, so a typo fails at schedule time.
   */
  get overlapPolicy(): OverlapPolicy {
    invariant(this.entryExports, "Entry exports not initialized.");
    const { overlap = "skip" } = this.entryExports;
    invariant(
      overlap === "skip" || overlap === "allow",
      `Invalid overlap "${String(overlap)}" for ${this.taskPath}: expected "skip" or "allow"`,
    );
    return overlap;
  }

  /**
   * Check the exports that shape how the task is scheduled, so a bad value
   * fails when the task is scheduled rather than on its first tick.
   */
  validateExports() {
    invariant(this.entryExports, "Entry exports not initialized.");
    void this.overlapPolicy;
    const { budget, exclusive, retry } = this.entryExports;
    if (budget != null) toMs(budget, `budget for ${this.taskPath}`);
    exclusiveNames(exclusive, this.taskPath);
    resolveRetry(retry, this.taskPath);
  }

  /** Whether an execution of this task is in progress. */
  get isRunning() {
    return this.inFlight > 0;
  }

  /**
   * Record a run that ngn decided not to start, without loading or calling any
   * of the task's code. Needs the task to have been registered by an earlier
   * execution, which is always so for a run skipped because one is in progress.
   */
  async skip(reason: string) {
    invariant(this.entry, "Entry not initialized.");
    const run = await this.startRun();
    await run.callbacks.onSkip?.({ path: this.entry.paths.relativeEntry, reason });
  }

  hasTaskExport() {
    return this.entryExports?.task !== undefined;
  }

  hasTimingExport() {
    return this.entryExports?.timing !== undefined;
  }

  async loadEntry() {
    invariant(this.entry, "Entry not initialized.");
    await this.entry.load();
    this.entryExports = await this.entry.getExports();
  }

  /**
   * Load the task file's code and register its version. A failure here has no
   * run to mark yet, so it is thrown to whoever called execute(). Evaluating
   * the code comes after the run exists — see `readExports`.
   */
  private async loadAndRegister() {
    invariant(this.entry, "Entry not initialized.");

    await this.entry.load();
    invariant(this.entry.isLoaded(), "Entry failed to load.");

    const loadResult = await this.taskCallbacks?.onTaskLoadComplete?.({
      paths: this.entry.paths,
      md5Hash: this.entry.codeHash!,
      compiledCode: this.entry.code!,
    });

    this.meta.fileTaskId = loadResult?.fileTaskId ?? -1;
    this.meta.fileTaskVersionId = loadResult?.fileTaskVersionId ?? -1;
  }

  /**
   * Evaluate the task file and check the exports a run depends on. Throws
   * what the module threw, or what is wrong with an export, for the run to
   * record as failed in `load`.
   */
  private async readExports(path: string) {
    invariant(this.entry, "Entry not initialized.");
    const exports = await this.entry.getExports();
    this.entryExports = exports;
    this.taskCallbacks?.onTaskExportsLoaded?.();
    if (typeof exports.task !== "function") {
      throw new Error(`${path} exports no task function`);
    }
    return {
      exports,
      task: exports.task,
      budgetMs: exports.budget == null ? null : toMs(exports.budget, `budget for ${path}`),
      exclusiveLocks: exclusiveNames(exports.exclusive, path),
      retry: resolveRetry(exports.retry, path),
    };
  }

  /** Mark the run failed in `stage`, remembering where for whoever reports the error. */
  private async failRun(run: RunControls, stage: RunStage, error: unknown) {
    invariant(this.entry, "Entry not initialized.");
    if (error && typeof error === "object") failedRuns.set(error, { runId: run.id, stage });
    await run.callbacks.onFailure?.({ path: this.entry.paths.relativeEntry, stage, error });
  }

  /**
   * Call one of the task's hooks. What it throws is recorded on the run and
   * goes no further: the run's outcome was decided before the hook ran, and
   * `onError`'s error must not replace the one it was called with.
   */
  private async runHook(run: RunControls, stage: RunStage, hook: () => unknown) {
    invariant(this.entry, "Entry not initialized.");
    try {
      await hook();
    } catch (error) {
      await run.callbacks.onHookError?.({ path: this.entry.paths.relativeEntry, stage, error });
    }
  }

  /**
   * Run the task for one tick, retrying as its `retry` export allows. A
   * scheduled tick passes when it fired and when the next one is due, which
   * `ctx.run.deadline` and the retry window are worked out from.
   */
  async execute(schedule: ExecuteSchedule = {}) {
    this.inFlight++;
    try {
      return await this.executeWithRetries(schedule);
    } finally {
      this.inFlight--;
    }
  }

  private async executeWithRetries(schedule: ExecuteSchedule) {
    const tick: TickAttempts = {
      firstRunId: null,
      retry: resolveRetry(undefined, this.taskPath),
      failedContext: null,
    };

    for (let attempt = 1; ; attempt++) {
      tick.failedContext = null;
      try {
        return await this.executeOnce(schedule, tick);
      } catch (error) {
        if (!(await this.shouldRetry(error, attempt, schedule, tick))) throw error;
        await sleep(tick.retry.delayMs);
      }
    }
  }

  /**
   * Retry only a run that got as far as running: a module that will not load
   * fails the same way every time. Then it has to fit before the next tick,
   * and the task's `shouldRetry` gets the last word.
   */
  private async shouldRetry(
    error: unknown,
    attempt: number,
    { nextAt = null }: ExecuteSchedule,
    tick: TickAttempts,
  ) {
    if (!tick.failedContext || !retryFits({ attempt, retry: tick.retry, nextAt })) return false;
    const { shouldRetry } = this.entryExports ?? {};
    return shouldRetry ? (await shouldRetry(error as Error, tick.failedContext)) !== false : true;
  }

  /**
   * Whether the breaker holds this tick back: after `after` failed ticks in a
   * row it skips 1, 2, 4… ticks (counted since the latest failure), letting
   * one through in between to see whether things have recovered.
   */
  private async breakerOpen(retry: ResolvedRetry) {
    if (!retry.breaker) return false;
    const outcomes = await this.history.recentTickOutcomes(retry.breaker.after + 64);
    const failedInARow = outcomes.findIndex((tick) => tick.outcome !== "failure");
    const wanted = breakerSkips(
      failedInARow === -1 ? outcomes.length : failedInARow,
      retry.breaker,
    );
    if (wanted === 0) return false;
    return (await this.history.countSkipsSince(BREAKER_SKIP_REASON, outcomes[0].id)) < wanted;
  }

  /**
   * Why ngn will not start this run, or null. Checked in order: the breaker
   * (scheduled first attempts only), then the `exclusive` locks, which are
   * left held on success.
   */
  private async holdBack(
    run: RunControls,
    {
      firstAttempt,
      scheduled,
      exclusiveLocks,
      retry,
    }: {
      firstAttempt: boolean;
      scheduled: boolean;
      exclusiveLocks: string[];
      retry: ResolvedRetry;
    },
  ): Promise<{ reason: string } | { held: { release(): Promise<void> } | null }> {
    if (firstAttempt && scheduled && (await this.breakerOpen(retry))) {
      return { reason: BREAKER_SKIP_REASON };
    }
    if (!exclusiveLocks.length) return { held: null };
    const held = await run.locks.holdAll(exclusiveLocks);
    return "busy" in held ? { reason: `lock "${held.busy}" is held` } : { held };
  }

  private buildContext(
    run: RunControls,
    meta: TaskContext["meta"],
    window: { scheduledAt: number | null; nextAt: number | null; deadline: number | null },
    signal: AbortSignal,
  ): TaskContext {
    const { scheduledAt, nextAt, deadline } = window;
    return {
      env: this.env,
      meta,
      kv: this.kv,
      log: run.log,
      timing: run.timing,
      sqlite: this.sqlite,
      run: { id: run.id, scheduledAt, nextAt, deadline, signal },
      lock: (name, fn, options = {}) => run.locks.lock(name, fn, options, deadline),
      queue: (name, options = {}) =>
        openQueue(options.db?.client ?? this.sqlite.client, name, options, { nextAt, signal }),
    };
  }

  /**
   * Load the task file, open the attempt's `task_runs` row, then evaluate the
   * file's code; what that throws is recorded on the row as failed in `load`.
   */
  private async openRun(tick: TickAttempts) {
    invariant(this.entry, "Entry not initialized.");

    await this.loadAndRegister();
    // Read before the first await below: a run that starts while this one is
    // in progress reloads the entry and replaces it.
    const meta = { ...this.meta };
    const path = this.entry.paths.relativeEntry;

    const run = await this.startRun({ retryOf: tick.firstRunId });
    const firstAttempt = tick.firstRunId == null;
    tick.firstRunId ??= run.id;

    try {
      return { run, meta, path, firstAttempt, ...(await this.readExports(path)) };
    } catch (error) {
      await this.failRun(run, "load", error);
      throw error;
    }
  }

  /**
   * One attempt: a `task_runs` row, then the task, with every failure recorded
   * against that row as the stage it was thrown in. Only a task file whose code
   * cannot be loaded at all, or a run row that cannot be written, fails before
   * there is a row to record it on.
   */
  private async executeOnce(
    { scheduledAt = null, nextAt = null }: ExecuteSchedule,
    tick: TickAttempts,
  ) {
    const { run, meta, path, firstAttempt, exports, task, budgetMs, exclusiveLocks, retry } =
      await this.openRun(tick);
    tick.retry = retry;

    const deadline = runDeadline({ startedAt: Date.now(), scheduledAt, nextAt, budgetMs });
    const { signal, dispose } = deadlineSignal(deadline);
    const taskContext = this.buildContext(run, meta, { scheduledAt, nextAt, deadline }, signal);

    let stage: RunStage = "start";
    let exclusiveHeld: { release(): Promise<void> } | null = null;
    try {
      const gate = await this.holdBack(run, {
        firstAttempt,
        scheduled: scheduledAt != null,
        exclusiveLocks,
        retry,
      });
      if ("reason" in gate) {
        await run.callbacks.onSkip?.({ path, reason: gate.reason });
        return;
      }
      exclusiveHeld = gate.held;

      stage = "shouldSkip";
      if (await exports.shouldSkip?.(taskContext)) {
        await run.callbacks.onSkip?.({ path });
        return;
      }

      stage = "start";
      await run.callbacks.onStart?.({ path });

      stage = "task";
      tick.failedContext = taskContext;
      const value = await task(taskContext);
      // From here on a failure is ngn's, not the task's: a retry would only
      // repeat work that already succeeded.
      tick.failedContext = null;

      stage = "record";
      await run.callbacks.onSuccess?.({ path, result: value });

      await this.runHook(run, "onSuccess", () => exports.onSuccess?.(taskContext));
      await this.runHook(run, "onComplete", () => exports.onComplete?.(taskContext));
      return value;
    } catch (error) {
      await this.failRun(run, stage, error);
      // The hooks are about the task: they run once it got as far as running.
      if (stage === "task" || stage === "record") {
        await this.runHook(run, "onError", () => exports.onError?.(error as Error, taskContext));
        await this.runHook(run, "onComplete", () => exports.onComplete?.(taskContext));
      }
      throw error;
    } finally {
      dispose();
      await exclusiveHeld?.release();
    }
  }
}
