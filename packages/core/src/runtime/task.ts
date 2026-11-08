import invariant from "tiny-invariant";
import {
  CompiledTaskCallbacks,
  BuildCompiledTaskConfigFn,
  RunControls,
  type RunStage,
  type TaskConfig,
} from "./types.js";
import { TaskContext, EntryExports, type NextOutcome } from "../source/types.js";
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
import { systemClock, type Clock } from "./clock.js";
import { parseNextDecision, type NextChoice } from "./timing.js";

/** How long the `next` hook may take before the default policy decides instead. */
export const NEXT_HOOK_TIMEOUT_MS = 5_000;

export interface ExecuteSchedule {
  /** When the tick fired, epoch ms. */
  scheduledAt?: number | null;
  /** When the next tick is due, epoch ms. */
  nextAt?: number | null;
  /**
   * For a run with no next tick: its deadline when it has no budget, measured
   * from its start (the trailing edge's `every`).
   */
  periodMs?: number | null;
  /** Where the tick reads the time and waits between retries. */
  clock?: Clock;
  /** Aborts every attempt's `ctx.run.signal`: ngn is stopping, or lost the task's lease. */
  signal?: AbortSignal;
  /** Told each attempt's run id as its row is opened. */
  onRunStarted?: (runId: number) => void;
  /**
   * Ask the task's `next` hook, if it has one, when to run next, once the
   * tick has ended: a scheduled tick of an interval task passes this.
   */
  next?: { previousDelayMs: number | null; timeoutMs?: number };
}

export type TickStatus = "success" | "failure" | "skipped";

/** How far back `failedInARow()` looks: far enough that backoff has long reached `max`. */
const FAILURE_STREAK_LOOKBACK = 256;

/** Failed ticks at the start of `outcomes`, newest first. */
function streakOf(outcomes: ReadonlyArray<{ outcome: "success" | "failure" }>): number {
  const firstOther = outcomes.findIndex((tick) => tick.outcome !== "failure");
  return firstOther === -1 ? outcomes.length : firstOther;
}

/**
 * How one tick ended, every way it can: the task ran and returned, it failed
 * (in any stage, after any retries), or ngn or `shouldSkip` held it back.
 * Whatever decides when the task runs next reads this.
 */
export interface TickOutcome {
  status: TickStatus;
  /** What the task returned, for a success. */
  result: unknown;
  /** What the final attempt threw, for a failure. */
  error: unknown;
  /** Why ngn skipped the tick; null for a skip by the task's own `shouldSkip`, or no skip. */
  skipReason: string | null;
  /** The `task_runs.id` of the tick's first attempt; null when it failed before a run existed. */
  firstRunId: number | null;
  /** The `task_runs.id` of the tick's final attempt; null when it failed before a run existed. */
  runId: number | null;
  /** Attempts made, the first included. */
  attempts: number;
  /** When the final attempt ended, on the tick's clock. */
  endedAt: number;
  /** What the `next` hook chose; null when it was not asked, or left it to the policy. */
  next: NextChoice | null;
}

/** How one attempt ended, when it did not throw. */
type AttemptEnd =
  | { status: "success"; result: unknown }
  | { status: "skipped"; reason: string | null };

/** What one tick's attempts share, so a retry can point back at the first. */
interface TickAttempts {
  firstRunId: number | null;
  /** The run of the latest attempt. */
  runId: number | null;
  /** The `retry` export as the latest attempt read it. */
  retry: ResolvedRetry;
  /** The context of the attempt that just failed; null when it never got a run. */
  failedContext: TaskContext | null;
  /** The latest attempt's run, context and exports, once its exports loaded: what `next` is called with. */
  final: { run: RunControls; path: string; context: TaskContext; exports: EntryExports } | null;
}

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
  private schedulingServices: TaskConfig["scheduling"];
  private entry: Entry | null = null;
  private entryExports: EntryExports | null = null;

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

    const { taskCallbacks, startRun, history, env, kv, sqlite, scheduling } = buildConfigFn({
      sourcePath: this.entry.paths.source,
      compiledPath: this.entry.paths.compiled,
    });
    this.taskCallbacks = taskCallbacks;
    this.startRun = startRun;
    this.history = history;
    this.schedulingServices = scheduling;
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

  /** The `timing` export, as the latest run (or `loadEntry`) read it. */
  get timing() {
    invariant(this.entryExports, "Entry exports not initialized.");
    return this.entryExports.timing;
  }

  /** The `next` export, as loaded: unchecked, for whoever schedules the task to check. */
  get nextHook(): unknown {
    invariant(this.entryExports, "Entry exports not initialized.");
    return this.entryExports.next;
  }

  /**
   * Check the exports that shape how the task is scheduled, so a bad value
   * fails when the task is scheduled rather than on its first tick. ngn runs
   * one run of a task at a time, so `overlap` may only say so.
   */
  validateExports() {
    invariant(this.entryExports, "Entry exports not initialized.");
    const { budget, exclusive, retry, overlap = "skip" } = this.entryExports;
    invariant(
      overlap !== "allow",
      `overlap "allow" for ${this.taskPath}: ngn runs one run of a task at a time, across every process on the database, so a task cannot run beside itself`,
    );
    invariant(
      overlap === "skip",
      `Invalid overlap "${String(overlap)}" for ${this.taskPath}: expected "skip"`,
    );
    if (budget != null) toMs(budget, `budget for ${this.taskPath}`);
    exclusiveNames(exclusive, this.taskPath);
    resolveRetry(retry, this.taskPath);
  }

  /** The `retry` export, checked. */
  get retryPolicy(): ResolvedRetry {
    invariant(this.entryExports, "Entry exports not initialized.");
    return resolveRetry(this.entryExports.retry, this.taskPath);
  }

  /** The schedule and lease services this task's runs are recorded with. */
  get scheduling() {
    return this.schedulingServices;
  }

  /**
   * Load the task file and register it and its version, without running it:
   * its schedule is kept against the task's id. Returns that id.
   */
  async register(): Promise<number> {
    await this.loadAndRegister();
    return this.meta.fileTaskId;
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
   * Run the task for one tick, retrying as its `retry` export allows, and say
   * how it ended. A scheduled tick passes when it fired and when the next one
   * is due, which `ctx.run.deadline` and the retry window are worked out from.
   * Never throws: a failure is an outcome, its error recorded on its run.
   */
  executeTick(schedule: ExecuteSchedule = {}): Promise<TickOutcome> {
    return this.executeWithRetries(schedule);
  }

  /**
   * One tick, for a caller that wants the task's value: what it returned, or
   * undefined for a skip. Throws what the tick failed with.
   */
  async execute(schedule: ExecuteSchedule = {}) {
    const outcome = await this.executeTick(schedule);
    if (outcome.status === "failure") throw outcome.error;
    return outcome.result;
  }

  private async executeWithRetries(schedule: ExecuteSchedule): Promise<TickOutcome> {
    const tick: TickAttempts = {
      firstRunId: null,
      runId: null,
      retry: resolveRetry(undefined, this.taskPath),
      failedContext: null,
      final: null,
    };
    const outcome = await this.attempts(schedule, tick);
    if (schedule.next) outcome.next = await this.askNext(outcome, tick, schedule.next);
    return outcome;
  }

  /**
   * Ask the `next` hook when to run next. What it throws, returns that it may
   * not, or a hook that takes too long, is recorded on the tick's final run in
   * stage `next`, and leaves the decision to the policy, as does a tick that
   * never got as far as loading the task's exports.
   */
  private async askNext(
    outcome: TickOutcome,
    tick: TickAttempts,
    { previousDelayMs, timeoutMs = NEXT_HOOK_TIMEOUT_MS }: NonNullable<ExecuteSchedule["next"]>,
  ): Promise<NextChoice | null> {
    const final = tick.final;
    const hook = final?.exports.next;
    if (!final || typeof hook !== "function" || outcome.runId == null) return null;
    const told = {
      status: outcome.status,
      result: outcome.result,
      error: outcome.error,
      skipReason: outcome.skipReason,
      failedInARow: await this.failedInARow(),
      previousDelayMs,
      runId: outcome.runId,
    } as NextOutcome;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const value = await Promise.race([
        (async () => hook(told, final.context))(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error(`next took longer than ${timeoutMs / 1000}s`)),
            timeoutMs,
          );
        }),
      ]);
      return parseNextDecision(value) ?? null;
    } catch (error) {
      await final.run.callbacks.onHookError?.({ path: final.path, stage: "next", error });
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  /** The tick's attempts, retrying as `retry` allows, and how the last one ended. */
  private async attempts(schedule: ExecuteSchedule, tick: TickAttempts): Promise<TickOutcome> {
    const clock = schedule.clock ?? systemClock;
    const outcome = (
      attempts: number,
      end: Partial<TickOutcome> & Pick<TickOutcome, "status">,
    ) => ({
      result: undefined,
      error: undefined,
      skipReason: null,
      firstRunId: tick.firstRunId,
      runId: tick.runId,
      attempts,
      endedAt: clock.now(),
      next: null,
      ...end,
    });

    for (let attempt = 1; ; attempt++) {
      tick.failedContext = null;
      // ngn is stopping, or lost the task's lease: start no run it cannot see through.
      if (schedule.signal?.aborted) {
        return outcome(attempt - 1, { status: "failure", error: schedule.signal.reason });
      }
      try {
        const end = await this.executeOnce(schedule, tick, clock);
        return end.status === "success"
          ? outcome(attempt, { status: "success", result: end.result })
          : outcome(attempt, { status: "skipped", skipReason: end.reason });
      } catch (error) {
        let retry: boolean;
        try {
          retry = await this.shouldRetry(error, attempt, schedule, tick, clock);
        } catch (thrown) {
          // The task's own `shouldRetry` threw: that is what the tick failed with.
          return outcome(attempt, { status: "failure", error: thrown });
        }
        if (!retry || schedule.signal?.aborted)
          return outcome(attempt, { status: "failure", error });
        await clock.sleep(tick.retry.delayMs, schedule.signal);
        // ngn is stopping, or the task's lease went, while it waited: no more tries.
        if (schedule.signal?.aborted) return outcome(attempt, { status: "failure", error });
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
    clock: Clock,
  ) {
    if (!tick.failedContext) return false;
    if (!retryFits({ attempt, retry: tick.retry, nextAt, now: clock.now() })) return false;
    const { shouldRetry } = this.entryExports ?? {};
    return shouldRetry ? (await shouldRetry(error as Error, tick.failedContext)) !== false : true;
  }

  /**
   * The task's latest ticks that failed in a row, from its run history, so a
   * restart does not reset the count. Ticks closed as interrupted count, since
   * their runs were closed as failed; skipped ticks neither break nor extend it.
   */
  async failedInARow(): Promise<number> {
    return streakOf(await this.history.recentTickOutcomes(FAILURE_STREAK_LOOKBACK));
  }

  /**
   * Whether the breaker holds this tick back: after `after` failed ticks in a
   * row it skips 1, 2, 4… ticks (counted since the latest failure), letting
   * one through in between to see whether things have recovered.
   */
  private async breakerOpen(retry: ResolvedRetry) {
    if (!retry.breaker) return false;
    const outcomes = await this.history.recentTickOutcomes(retry.breaker.after + 64);
    const wanted = breakerSkips(streakOf(outcomes), retry.breaker);
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
  private async openRun(tick: TickAttempts, onRunStarted: ExecuteSchedule["onRunStarted"]) {
    invariant(this.entry, "Entry not initialized.");

    tick.final = null;
    await this.loadAndRegister();
    // Read before the first await below: a run that starts while this one is
    // in progress reloads the entry and replaces it.
    const meta = { ...this.meta };
    const path = this.entry.paths.relativeEntry;

    const run = await this.startRun({ retryOf: tick.firstRunId });
    const firstAttempt = tick.firstRunId == null;
    tick.firstRunId ??= run.id;
    tick.runId = run.id;
    onRunStarted?.(run.id);

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
    {
      scheduledAt = null,
      nextAt = null,
      periodMs = null,
      signal: outer,
      onRunStarted,
    }: ExecuteSchedule,
    tick: TickAttempts,
    clock: Clock,
  ): Promise<AttemptEnd> {
    const { run, meta, path, firstAttempt, exports, task, budgetMs, exclusiveLocks, retry } =
      await this.openRun(tick, onRunStarted);
    tick.retry = retry;

    const startedAt = clock.now();
    const deadline = runDeadline({ startedAt, scheduledAt, nextAt, budgetMs, periodMs });
    const { signal, dispose } = deadlineSignal(deadline, outer);
    const taskContext = this.buildContext(run, meta, { scheduledAt, nextAt, deadline }, signal);
    tick.final = { run, path, context: taskContext, exports };

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
        return { status: "skipped", reason: gate.reason };
      }
      exclusiveHeld = gate.held;

      stage = "shouldSkip";
      if (await exports.shouldSkip?.(taskContext)) {
        await run.callbacks.onSkip?.({ path });
        return { status: "skipped", reason: null };
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
      return { status: "success", result: value };
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
