/**
 * One task's schedule, cron or interval, run as a loop over its stored state
 * machine (see `SCHEDULE_TRANSITIONS`). The loop only ever reads the row and
 * makes transitions; what differs between kinds of timing is the `TimingRule`.
 *
 * A tick, whatever started it, goes through the task's lease, so a task never
 * has two runs at once in any process sharing the database:
 *
 *   take the lease → re-read the row → `started` → attempts and hooks → `decided`
 *
 * and the next run cannot start before its decision is stored.
 */
import { canTransition, errorSummary, type TickOrigin } from "@apisurf/ngn-schema/describe";
import {
  isRefusal,
  type ScheduleRow,
  type ScheduleStore,
  type Transition,
} from "../db/services/schedule.js";
import { type Clock, WAIT_STEP_MS } from "./clock.js";
import { TASK_LEASE_TTL_MS, TaskLease, taskLeaseName, type LeaseHolder } from "./lease.js";
import type { Schedule } from "./schedule.js";
import type { ExecuteSchedule, Task, TickOutcome } from "./task.js";
import {
  withRequest,
  controlSchedule,
  honourRequest,
  type ScheduleCommand,
  type ScheduleControlResult,
} from "./scheduleControl.js";
import { resolveTiming, type ResolvedTiming, type TimingExport } from "./timing.js";
import { timingRule, type Random, type RunWindow } from "./timingRule.js";

/** What Run now did: started a run, or why it did not. */
export type RunNowOutcome = { started: true } | { started: false; reason: string };

/** How long `stop()` waits for runs in progress before closing them as interrupted. */
export const STOP_GRACE_MS = 10_000;

/** The reason a next run set by `overdue` carries, so whichever process runs it knows it is a catch-up. */
const CATCH_UP_REASON = "one catch-up run for what was missed while ngn was not running";

export interface TaskScheduleOptions {
  task: Task;
  /** The timing to schedule on: the task's export, or `--timing`'s. */
  timing: TimingExport;
  /** True when `timing` came from the command line, so the task's own export is not re-read. */
  override?: boolean;
  clock: Clock;
  leaseTtlMs?: number;
  /** Where backoff's jitter comes from. Tests pass their own. */
  random?: Random;
  /** How long the `next` hook may take. Tests pass their own. */
  nextTimeoutMs?: number;
  /** A run failed; the error is already recorded on it when it has one. */
  onRunError: (error: unknown) => void;
  /** Something about the schedule itself went wrong, in words. */
  onProblem: (message: string) => void;
}

/** One tick in progress in this process, for shutdown and lease loss to find. */
class TickHandle {
  readonly controller = new AbortController();
  firstRunId: number | null = null;
  runId: number | null = null;
  /** Whether it wrote `started`, so its end has a transition to make. */
  logged = false;
  /** Closed by shutdown (or a crash): whatever it decides later is not written. */
  closed = false;
  done: Promise<unknown> = Promise.resolve();
  /** Resolves when the tick is closed, so nothing waits on a run that may never end. */
  readonly whenClosed: Promise<null>;
  private markClosed!: () => void;

  constructor(
    readonly origin: TickOrigin,
    readonly lease: TaskLease,
  ) {
    this.whenClosed = new Promise((resolve) => (this.markClosed = () => resolve(null)));
  }

  close() {
    this.closed = true;
    this.markClosed();
  }

  get signal(): AbortSignal {
    return AbortSignal.any([this.controller.signal, this.lease.signal]);
  }

  readonly noteRun = (runId: number) => {
    this.firstRunId ??= runId;
    this.runId = runId;
    void this.lease.setRun(runId);
  };
}

/** Resolves when `signal` aborts. */
function untilAborted(signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) resolve();
    else signal.addEventListener("abort", () => resolve(), { once: true });
  });
}

/** `run 41 of tasks/scrape.ts is in progress`: why a manual run was refused. */
function busyReason(taskPath: string, busy: LeaseHolder): string {
  return busy.runId != null
    ? `run ${busy.runId} of ${taskPath} is in progress`
    : `a run of ${taskPath} is in progress`;
}

/** The services a manual run uses, and the task's id they are keyed by. */
interface ManualRunDeps {
  task: Task;
  taskId: number;
  clock: Clock;
  leaseTtlMs?: number;
  /** The run's window, when it has one: Run now's is the schedule's next run. */
  window?: Pick<RunWindow, "nextAt" | "periodMs">;
  onProblem: (message: string) => void;
}

/** Write `change`, reporting a refusal or a failed write instead of throwing. Null when not applied. */
async function writeTransition(
  task: Task,
  taskId: number,
  change: Transition,
  onProblem: (message: string) => void,
): Promise<ScheduleRow | null> {
  try {
    const result = await task.scheduling.store.transition(taskId, change);
    if (!isRefusal(result)) return result;
    onProblem(`schedule of ${task.taskPath}: refused ${result.refused}`);
  } catch (error) {
    onProblem(
      `schedule of ${task.taskPath}: could not write ${change.event}: ${errorSummary(error)}`,
    );
  }
  return null;
}

/**
 * Write the transition that ends a tick (`decided`, `ended`, `interrupted`,
 * `recovered`), honouring whatever a person asked for during it: a next run
 * from `ngn next`, a pause from `ngn pause`. A request that comes in between
 * the read and the write makes the write refuse, and it is read again.
 */
async function writeTickEnd(
  task: Task,
  taskId: number,
  change: Transition,
  onProblem: (message: string) => void,
): Promise<ScheduleRow | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const row = await task.scheduling.store.read(taskId);
    const honoured = honourRequest(change, row);
    let result: Awaited<ReturnType<ScheduleStore["transition"]>>;
    try {
      result = await task.scheduling.store.transition(taskId, honoured);
    } catch (error) {
      onProblem(
        `schedule of ${task.taskPath}: could not write ${change.event}: ${errorSummary(error)}`,
      );
      return null;
    }
    if (!isRefusal(result)) return result;
    const now = await task.scheduling.store.read(taskId);
    if (now?.request === honoured.requestIs) {
      onProblem(`schedule of ${task.taskPath}: refused ${result.refused}`);
      return null;
    }
  }
  onProblem(`schedule of ${task.taskPath}: requests kept arriving; ${change.event} not written`);
  return null;
}

/**
 * Take the task's lease and start one run outside its schedule: Run now, or
 * `ngn run x --once`. It is logged as `started` (manual) and `ended`, and
 * leaves the next run where it was. When the task is busy, nothing is written.
 */
async function startManual(
  deps: ManualRunDeps,
  onLost: (lease: TaskLease) => void = () => {},
): Promise<{ tick: TickHandle; outcome: Promise<TickOutcome> } | { busy: string }> {
  const { task, taskId, clock, onProblem } = deps;
  const lease = await TaskLease.take(task.scheduling.locks, task.taskPath, {
    ttlMs: deps.leaseTtlMs,
    onLost,
  });
  if ("busy" in lease) return { busy: busyReason(task.taskPath, lease.busy) };

  const tick = new TickHandle("manual", lease);
  const outcome = (async () => {
    try {
      const row = await task.scheduling.store.read(taskId);
      if (row && canTransition(row.state, "started")) {
        // A paused task runs when a person asks, and pauses again after.
        const request =
          row.state === "paused" ? { request: withRequest(row, { pause: true }) } : {};
        const started = await writeTransition(
          task,
          taskId,
          {
            event: "started",
            at: clock.now(),
            origin: "manual",
            set: { holder: lease.holder, ...request },
          },
          onProblem,
        );
        tick.logged = started != null;
      }
      const result = await task.executeTick({
        scheduledAt: null,
        nextAt: deps.window?.nextAt ?? null,
        periodMs: deps.window?.periodMs ?? null,
        clock,
        signal: tick.signal,
        onRunStarted: tick.noteRun,
      });
      if (tick.logged && !tick.closed && !lease.lost) {
        await writeTickEnd(
          task,
          taskId,
          {
            event: "ended",
            at: clock.now(),
            holder: lease.holder,
            set: { holder: null },
            firstRunId: result.firstRunId,
            runId: result.runId,
          },
          onProblem,
        );
      }
      return result;
    } finally {
      await lease.release();
    }
  })();
  tick.done = outcome.catch(() => {});
  return { tick, outcome };
}

/**
 * `ngn run x --once`: one run now, through the task's lease, from a process of
 * its own. Refused, writing nothing, while another run of the task is going.
 */
export async function runOnce(
  task: Task,
  { clock, leaseTtlMs, onProblem }: Pick<ManualRunDeps, "clock" | "leaseTtlMs" | "onProblem">,
): Promise<TickOutcome | { busy: string }> {
  const taskId = await task.register();
  const started = await startManual({ task, taskId, clock, leaseTtlMs, onProblem });
  return "busy" in started ? started : started.outcome;
}

export class TaskSchedule implements Schedule {
  private taskId = -1;
  private row: ScheduleRow | null = null;
  private resolved: ResolvedTiming;
  private exported: TimingExport;
  private stopping = false;
  private readonly halt = new AbortController();
  private readonly ticks = new Set<TickHandle>();
  private loopDone: Promise<void> = Promise.resolve();

  constructor(private readonly options: TaskScheduleOptions) {
    this.exported = options.timing;
    this.resolved = resolveTiming(options.timing, options.task.taskPath);
  }

  private get task() {
    return this.options.task;
  }

  private get path() {
    return this.options.task.taskPath;
  }

  private get store() {
    return this.options.task.scheduling.store;
  }

  private get clock() {
    return this.options.clock;
  }

  private get ttlMs() {
    return this.options.leaseTtlMs ?? TASK_LEASE_TTL_MS;
  }

  private rule() {
    return timingRule(this.resolved, this.exported, this.options.random);
  }

  /**
   * The failure streak `outcome` ends, this tick included. A tick that failed
   * before it had a run is not in the history, so it is added here.
   */
  private async failedInARow(outcome?: Pick<TickOutcome, "status" | "runId">) {
    const streak = await this.task.failedInARow();
    return outcome?.status === "failure" && outcome.runId == null ? streak + 1 : streak;
  }

  nextAt(): number | null {
    return this.row?.next_at ?? null;
  }

  /** Register the task, bring its stored schedule up to date, and start the loop. */
  async start() {
    this.taskId = await this.task.register();
    await this.reconcile();
    this.loopDone = this.loop();
  }

  /** Transitions written by this process, so the loop can tell a step that moved things on. */
  private writes = 0;

  private write(change: Transition, write = writeTransition) {
    return write(this.task, this.taskId, change, this.options.onProblem).then((row) => {
      if (row) {
        this.row = row;
        this.writes++;
      }
      return row;
    });
  }

  /** Write the transition that ends a tick, honouring a pause or next run asked for during it. */
  private writeEnd(change: Transition) {
    return this.write(change, writeTickEnd);
  }

  /**
   * What a start finds in the database: no schedule yet, a next run still to
   * come, one missed while ngn was not running, one further off than the
   * current timing could choose, or a tick a dead process left `running`.
   */
  private async reconcile() {
    const now = this.clock.now();
    const rule = this.rule();
    const row = await this.store.read(this.taskId);
    this.row = row;
    if (!row) {
      const first = rule.first(now);
      await this.write({
        event: "scheduled",
        at: now,
        set: { next_at: first.nextAt, anchor: first.anchor, reason: "first run", source: "policy" },
      });
      return;
    }
    if (row.state === "running") {
      await this.recoverIfAbandoned();
      return;
    }
    if (row.state !== "waiting" || row.next_at == null) return;

    // A step late is a run about to start, not one that was missed.
    if (row.next_at < now - WAIT_STEP_MS) {
      const overdue = rule.overdue(now, row.anchor);
      await this.write({
        event: "overdue",
        at: now,
        set: {
          next_at: overdue.nextAt,
          reason: overdue.catchUp
            ? CATCH_UP_REASON
            : `missed while ngn was not running; ${rule.words}`,
          source: "policy",
        },
      });
      return;
    }
    const latest = rule.latest(now, {
      anchor: row.anchor,
      source: row.source,
      failedInARow: await this.failedInARow(),
    });
    if (latest != null && row.next_at > latest) {
      await this.write({
        event: "reclamped",
        at: now,
        set: { next_at: latest, reason: `further off than ${rule.words} allows`, source: "policy" },
      });
    }
  }

  private async loop() {
    while (!this.stopping) {
      const before = this.writes;
      try {
        if (!(await this.step())) await this.pause(WAIT_STEP_MS);
      } catch (error) {
        this.options.onProblem(`schedule of ${this.path}: ${errorSummary(error)}`);
        await this.pause(WAIT_STEP_MS);
      }
      // A step that wrote nothing and did not wait must not come straight round
      // again: the database answers without yielding, and timers would starve.
      if (this.writes === before) await new Promise((resolve) => setImmediate(resolve));
    }
  }

  /** Wait up to one step, or less; returns early when stopping. */
  private pause(ms: number) {
    return this.clock.sleep(Math.max(0, Math.min(ms, WAIT_STEP_MS)), this.halt.signal);
  }

  /**
   * One look at the schedule: wait while the next run is still to come (the
   * row is read again every step, so another process's changes are seen), and
   * run it once it is due. False when it did neither, so the loop waits a step.
   */
  private async step(): Promise<boolean> {
    const row = await this.store.read(this.taskId);
    if (!row) {
      await this.reconcile();
      return this.row != null;
    }
    this.row = row;
    if (row.state === "paused") return false;
    if (row.state === "running") {
      const own = [...this.ticks][0];
      if (own) {
        await Promise.race([own.done, untilAborted(this.halt.signal)]);
        return true;
      }
      return this.recoverIfAbandoned();
    }
    const now = this.clock.now();
    if (row.next_at == null) return false;
    if (row.next_at > now) {
      await this.pause(row.next_at - now);
      return true;
    }
    return this.runDue();
  }

  private takeLease() {
    return TaskLease.take(this.task.scheduling.locks, this.path, {
      ttlMs: this.ttlMs,
      onLost: (lease) => this.leaseLost(lease),
    });
  }

  /**
   * The lease for a due run, waiting while another run holds it. The first
   * time it is busy with the run still waiting, the wait is logged as
   * `blocked`. Null when stopping, or when the row stops asking for a run now:
   * another process is running the task, which the loop then follows, or a
   * person paused it or moved its next run.
   */
  private async acquire(): Promise<TaskLease | null> {
    while (!this.stopping) {
      const taken = await this.takeLease();
      if (!("busy" in taken)) return taken;
      const row = await this.store.read(this.taskId);
      if (row?.state !== "waiting" && row?.state !== "blocked") return null;
      if (row.state === "waiting") {
        if (row.next_at == null || row.next_at > this.clock.now()) return null;
        await this.write({
          event: "blocked",
          at: this.clock.now(),
          set: { holder: taken.busy.holder },
          runId: taken.busy.runId,
        });
      }
      await this.pause(WAIT_STEP_MS);
    }
    return null;
  }

  /**
   * Run the due run, once this process holds the task. The row is read again
   * under the lease: another process may have run it in the meantime, which is
   * what stops two of them starting the same run.
   */
  private async runDue(): Promise<boolean> {
    const lease = await this.acquire();
    if (!lease) return false;
    let handedOver = false;
    try {
      const row = await this.store.read(this.taskId);
      const now = this.clock.now();
      if (!row || (row.state !== "waiting" && row.state !== "blocked")) return false;
      if (row.next_at == null || row.next_at > now) {
        if (row.state === "blocked") {
          await this.write({ event: "superseded", at: now, set: { holder: null } });
        }
        return true;
      }
      handedOver = true;
      return await this.runTick(lease, row);
    } finally {
      if (!handedOver) await lease.release();
    }
  }

  private track(tick: TickHandle) {
    this.ticks.add(tick);
    void tick.done.finally(() => this.ticks.delete(tick));
  }

  /**
   * A scheduled tick, from `started` to `decided`, holding `lease` throughout.
   * False when it could not start.
   */
  private async runTick(lease: TaskLease, row: ScheduleRow): Promise<boolean> {
    const now = this.clock.now();
    const rule = this.rule();
    const catchUp = this.resolved.kind === "interval" && row.reason === CATCH_UP_REASON;
    const tick = new TickHandle(catchUp ? "catch-up" : "scheduled", lease);
    // Planned for its slot; a catch-up, or a run so late its next slot has
    // already come, is planned for now instead.
    let plannedAt = catchUp ? now : row.next_at!;
    const late = rule.window(plannedAt, row.anchor).nextAt;
    if (late != null && late <= now) plannedAt = now;

    let settle!: () => void;
    tick.done = new Promise<void>((resolve) => (settle = resolve));
    this.track(tick);
    try {
      const started = await this.write({
        event: "started",
        at: now,
        origin: tick.origin,
        set: { holder: lease.holder },
      });
      if (!started) return false;
      tick.logged = true;

      const window = rule.window(plannedAt, row.anchor);
      // The delay that led here: from the last change to the row to this run.
      const previousDelayMs =
        row.next_at != null ? Math.max(0, row.next_at - row.updated_at) : null;
      const next =
        this.resolved.kind === "interval"
          ? { previousDelayMs, timeoutMs: this.options.nextTimeoutMs }
          : undefined;
      const outcome = await Promise.race([this.execute(tick, window, next), tick.whenClosed]);
      // Shutdown closed it, or the lease went: either way this decision is not ours to write.
      if (!outcome || tick.closed || lease.lost) return true;

      this.refreshTiming();
      const decision = this.rule().decide({
        plannedAt,
        endedAt: outcome.endedAt,
        anchor: row.anchor,
        status: outcome.status,
        failedInARow: await this.failedInARow(outcome),
        choice: outcome.next,
      });
      await this.writeEnd({
        event: "decided",
        at: this.clock.now(),
        holder: lease.holder,
        set: {
          next_at: decision.nextAt,
          reason: decision.reason,
          source: decision.source,
          holder: null,
          anchor: decision.anchor,
        },
        firstRunId: outcome.firstRunId,
        runId: outcome.runId,
        finalRunId: outcome.runId,
      });
      return true;
    } finally {
      await lease.release();
      settle();
    }
  }

  private async execute(
    tick: TickHandle,
    window: RunWindow,
    next?: ExecuteSchedule["next"],
  ): Promise<TickOutcome> {
    const outcome = await this.task.executeTick({
      next,
      scheduledAt: window.scheduledAt,
      nextAt: window.nextAt,
      periodMs: window.periodMs,
      clock: this.clock,
      signal: tick.signal,
      onRunStarted: tick.noteRun,
    });
    if (outcome.status === "failure") this.options.onRunError(outcome.error);
    return outcome;
  }

  /**
   * Take up a change to the task's `timing` export, which its latest run read
   * afresh: it applies from this decision on. A switch between cron and an
   * interval needs a restart.
   */
  private refreshTiming() {
    if (this.options.override) return;
    const exported = this.task.timing;
    if (exported === this.exported) return;
    try {
      const resolved = resolveTiming(exported, this.path);
      if (resolved.kind !== this.resolved.kind) {
        this.options.onProblem(
          `${this.path} changed its timing between a cron pattern and an interval; restart ngn run to apply it`,
        );
        return;
      }
      this.resolved = resolved;
      this.exported = exported as TimingExport;
    } catch (error) {
      this.options.onProblem(`${errorSummary(error)}; keeping ${this.rule().words}`);
    }
  }

  /** Run now: one run outside the schedule, through the lease. Resolves once it is under way. */
  async runNow(): Promise<RunNowOutcome> {
    if (this.stopping) return { started: false, reason: "ngn is stopping" };
    // The schedule's next run ends this one's slot; on the trailing edge, which
    // has none, it gets `every` as a scheduled run would.
    const { periodMs } = this.rule().window(this.clock.now(), this.row?.anchor ?? null);
    const started = await startManual(
      {
        task: this.task,
        taskId: this.taskId,
        clock: this.clock,
        leaseTtlMs: this.ttlMs,
        window: { nextAt: periodMs == null ? this.nextAt() : null, periodMs },
        onProblem: this.options.onProblem,
      },
      (lease) => this.leaseLost(lease),
    );
    if ("busy" in started) return { started: false, reason: started.busy };
    this.track(started.tick);
    void started.outcome.then((outcome) => {
      if (outcome.status === "failure") this.options.onRunError(outcome.error);
    });
    return { started: true };
  }

  /**
   * What `ngn pause`, `resume` and `next` do, asked of this process (ngnui's
   * buttons): the same transitions, which the loop then picks up as it would
   * from the CLI.
   */
  control(command: ScheduleCommand): Promise<ScheduleControlResult> {
    return controlSchedule(
      {
        store: this.store,
        taskId: this.taskId,
        name: this.path,
        pattern: this.resolved.kind === "cron" ? this.resolved.pattern : null,
        now: this.clock.now(),
      },
      command,
    );
  }

  /** The lease of a tick in progress went: say so in the log while the task is still ours. */
  private leaseLost(lease: TaskLease) {
    const tick = [...this.ticks].find((t) => t.lease === lease);
    if (!tick?.logged || tick.closed) return;
    void this.write({
      event: "lease_lost",
      at: this.clock.now(),
      holder: lease.holder,
      firstRunId: tick.firstRunId,
      runId: tick.runId,
    });
  }

  /**
   * A task left `running` by a process that is gone, which its expired lease
   * says: close the tick's open runs as interrupted and decide the next run as
   * for a failed tick. False when the task is still held by a live process,
   * or the recovery could not be written, so the loop waits before looking again.
   */
  private async recoverIfAbandoned(): Promise<boolean> {
    const held = await this.task.scheduling.locks.holderOf(taskLeaseName(this.path));
    if (held && held.expiresAt > Date.now()) return false;
    const lease = await this.takeLease();
    if ("busy" in lease) return false;
    try {
      const row = await this.store.read(this.taskId);
      // Someone else moved it on in the meantime; the loop reads it again.
      if (row?.state !== "running") return row != null;
      const at = this.clock.now();
      const closed = await this.store.closeOpenRuns(
        this.taskId,
        "the ngn process running it stopped",
        { at: Date.now() },
      );
      // Its runs are now closed as failed, so the streak already counts it.
      const decision = this.rule().decide({
        plannedAt: at,
        endedAt: at,
        anchor: row.anchor,
        status: "failure",
        failedInARow: await this.failedInARow(),
      });
      const recovered = await this.writeEnd({
        event: "recovered",
        at,
        holder: row.holder,
        set: {
          next_at: decision.nextAt,
          reason: `the process running it stopped; ${decision.reason}`,
          source: "policy",
          holder: null,
          anchor: decision.anchor,
        },
        firstRunId: closed[0] ?? null,
        runId: closed.at(-1) ?? null,
      });
      return recovered != null;
    } finally {
      await lease.release();
    }
  }

  /**
   * Stop starting runs, ask the ones in progress to stop (their signal aborts),
   * and wait up to `graceMs` for them. A tick that ends in time is decided as
   * usual; the rest have their open runs closed as failed in `interrupted`,
   * and an `interrupted` event sets the next run to now.
   */
  async stop({ graceMs = STOP_GRACE_MS }: { graceMs?: number } = {}) {
    if (this.stopping) return this.loopDone;
    this.stopping = true;
    this.halt.abort();
    const ticks = [...this.ticks];
    for (const tick of ticks) tick.controller.abort(new Error("ngn is stopping"));

    if (ticks.length) {
      const grace = new AbortController();
      const settled = await Promise.race([
        Promise.all(ticks.map((tick) => tick.done)).then(() => true),
        this.clock.sleep(graceMs, grace.signal).then(() => false),
      ]);
      grace.abort();
      if (!settled) {
        for (const tick of ticks) if (this.ticks.has(tick)) await this.interrupt(tick);
      }
    }
    await this.loopDone;
  }

  private async interrupt(tick: TickHandle) {
    tick.close();
    const at = this.clock.now();
    if (tick.firstRunId != null) {
      await this.store.closeOpenRuns(this.taskId, "ngn stopped before the run ended", {
        fromRunId: tick.firstRunId,
        at: Date.now(),
      });
    }
    if (tick.logged) {
      // A manual run never moves the next run, even when it is cut short.
      const set: Transition["set"] =
        tick.origin === "manual"
          ? { holder: null }
          : {
              holder: null,
              next_at: at,
              reason: "ngn stopped before the run ended",
              source: "policy",
            };
      await this.writeEnd({
        event: "interrupted",
        at,
        holder: tick.lease.holder,
        set,
        firstRunId: tick.firstRunId,
        runId: tick.runId,
      });
    }
    await tick.lease.release();
    this.ticks.delete(tick);
  }

  /**
   * Stop without cleaning up, the way a process that died would: no more
   * steps, no lease renewals, nothing written. For tests standing in for a
   * crash.
   */
  abandon() {
    this.stopping = true;
    this.halt.abort();
    for (const tick of this.ticks) {
      tick.lease.abandon();
      tick.close();
    }
  }
}
