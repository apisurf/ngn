import type { Client, InStatement } from "@apisurf/ngn-persistence";
import {
  canTransition,
  failureLine,
  SCHEDULE_TRANSITIONS,
  type ScheduleEventName,
  type ScheduleFields,
  type ScheduleState,
  type TickOrigin,
} from "@apisurf/ngn-schema/describe";

export interface ScheduleRow extends ScheduleFields {
  file_task_id: number;
  updated_at: number;
}

/** What a transition writes, besides the state the table gives it. */
export interface Transition {
  event: ScheduleEventName;
  at: number;
  /** Row fields to set; anything left out keeps its value. */
  set?: Partial<Omit<ScheduleFields, "state">>;
  origin?: TickOrigin | null;
  firstRunId?: number | null;
  runId?: number | null;
  /** Only apply while the row's holder is this one (a tick's own lease, or none). */
  holder?: string | null;
  /** The tick's final run, to record the next run and its reason on. */
  finalRunId?: number | null;
  /**
   * Only apply while the row's pending request is this one, so a request made
   * after it was read is not lost.
   */
  requestIs?: string | null;
  /**
   * A second transition to make in the same write, from the state this one
   * leaves: `paused` after the decision of a tick a pause was requested during.
   */
  followedBy?: Omit<Transition, "followedBy" | "holder" | "requestIs" | "finalRunId">;
}

/** Why a transition was not applied. */
export type Refusal = { refused: string };

const FIELDS = ["next_at", "reason", "source", "holder", "anchor", "request"] as const;

/**
 * The schedule rows and their event log. Every change is one write batch: the
 * row update, conditional on the state the event comes from, then the event,
 * copied from the row it left, inserted only if the update applied. The row is
 * therefore always the fold of its events. A write the state table does not
 * allow, or one that lost a race with another process, is refused and the row
 * is left as it was.
 */
export class ScheduleStore {
  constructor(private db: Client) {}

  async read(taskId: number): Promise<ScheduleRow | null> {
    const { rows } = await this.db.execute({
      sql: "SELECT * FROM schedules WHERE file_task_id = ?",
      args: [taskId],
    });
    return (rows[0] as unknown as ScheduleRow | undefined) ?? null;
  }

  /**
   * Apply `change` to the task's schedule, as it stands now. The new row, or
   * why it was refused.
   */
  async transition(taskId: number, change: Transition): Promise<ScheduleRow | Refusal> {
    const current = await this.read(taskId);
    const refused = refusal(current, change);
    if (refused) return { refused };

    const from = current?.state ?? null;
    const to = SCHEDULE_TRANSITIONS[change.event].to;
    const statements = [
      current ? this.update(taskId, from!, to, change) : this.insert(taskId, to, change),
      this.event(taskId, from, change, current?.next_at ?? null),
    ];
    if (change.finalRunId != null)
      statements.push(this.finalRun(change.finalRunId, change, current));
    const next = change.followedBy;
    if (next) {
      // Applies only on top of the first: the row must be as it left it.
      statements.push(
        this.update(taskId, to, SCHEDULE_TRANSITIONS[next.event].to, next, change.at),
        this.event(taskId, to, next, change.set?.next_at ?? current?.next_at ?? null),
      );
    }

    const results = await this.db.batch(statements, "write");
    if (!results[0] || results[0].rowsAffected === 0) {
      return { refused: `${change.event}: the schedule changed before it could be written` };
    }
    return (await this.read(taskId))!;
  }

  private insert(taskId: number, to: ScheduleState, change: Transition): InStatement {
    const set = change.set ?? {};
    return {
      sql: `INSERT INTO schedules (file_task_id, state, ${FIELDS.join(", ")}, updated_at)
            VALUES (:taskId, :to, ${FIELDS.map((f) => `:${f}`).join(", ")}, :at)
            ON CONFLICT(file_task_id) DO NOTHING`,
      args: {
        taskId,
        to,
        at: change.at,
        ...Object.fromEntries(FIELDS.map((f) => [f, set[f] ?? null])),
      },
    };
  }

  /**
   * The row update, conditional on the state it comes from (and the holder or
   * request the change names). `after`: the time of the transition this one
   * follows in the same write, which it applies only on top of.
   */
  private update(
    taskId: number,
    from: ScheduleState,
    to: ScheduleState,
    change: Omit<Transition, "followedBy">,
    after?: number,
  ): InStatement {
    const set = change.set ?? {};
    const fields = FIELDS.filter((f) => f in set);
    const guards = [
      change.holder !== undefined ? "AND holder IS :heldBy" : "",
      change.requestIs !== undefined ? "AND request IS :requestIs" : "",
      after !== undefined ? "AND updated_at = :after" : "",
    ];
    return {
      sql: `UPDATE schedules SET state = :to, updated_at = :at
              ${fields.map((f) => `, ${f} = :${f}`).join("")}
            WHERE file_task_id = :taskId AND state = :from ${guards.join(" ")}`,
      args: {
        taskId,
        from,
        to,
        at: change.at,
        ...(change.holder !== undefined ? { heldBy: change.holder } : {}),
        ...(change.requestIs !== undefined ? { requestIs: change.requestIs } : {}),
        ...(after !== undefined ? { after } : {}),
        ...Object.fromEntries(fields.map((f) => [`${f}`, set[f] ?? null])),
      },
    };
  }

  /** The next run and its reason, on the tick's final run, written only if the event was. */
  private finalRun(runId: number, change: Transition, current: ScheduleRow | null): InStatement {
    return {
      sql: `UPDATE task_runs SET next_at = :nextAt, next_reason = :reason
            WHERE id = :id AND changes() = 1`,
      args: {
        id: runId,
        nextAt: change.set?.next_at ?? current?.next_at ?? null,
        reason: change.set?.reason ?? current?.reason ?? null,
      },
    };
  }

  /** The event, copied from the row the update left, written only if it applied. */
  private event(
    taskId: number,
    from: ScheduleState | null,
    change: Omit<Transition, "followedBy">,
    previousNextAt: number | null,
  ): InStatement {
    return {
      sql: `INSERT INTO schedule_events (file_task_id, at, event, from_state, to_state,
              ${FIELDS.join(", ")}, origin, first_run_id, run_id, previous_next_at)
            SELECT s.file_task_id, :at, :event, :from, s.state, ${FIELDS.map((f) => `s.${f}`).join(", ")},
              :origin, :firstRunId, :runId, :previousNextAt
            FROM schedules s WHERE s.file_task_id = :taskId AND changes() = 1`,
      args: {
        taskId,
        at: change.at,
        event: change.event,
        from,
        origin: change.origin ?? null,
        firstRunId: change.firstRunId ?? null,
        runId: change.runId ?? null,
        previousNextAt,
      },
    };
  }

  /**
   * Close the task's runs that never recorded an end, as failed in
   * `interrupted` with `why` as the error, in one write. `fromRunId` limits it
   * to one tick's runs. Returns the ids closed, oldest first.
   */
  async closeOpenRuns(
    taskId: number,
    why: string,
    { fromRunId = 0, at }: { fromRunId?: number; at: number },
  ): Promise<number[]> {
    const open = `file_task_id = :taskId AND id >= :fromRunId AND ended_at IS NULL
                  AND status IN ('pending', 'running')`;
    const args = { taskId, fromRunId };
    const log = (value: string): InStatement => ({
      sql: `INSERT INTO logs (status, value, file_task_id, task_run_id)
            SELECT 'error', :value, file_task_id, id FROM task_runs WHERE ${open} ORDER BY id`,
      args: { ...args, value },
    });
    const [, , closed] = await this.db.batch(
      [
        log(failureLine("interrupted", new Error(why))),
        log("Task failed"),
        {
          sql: `UPDATE task_runs SET status = 'failure', ended_at = :at WHERE ${open} RETURNING id`,
          args: { ...args, at },
        },
      ],
      "write",
    );
    return closed!.rows.map((row) => Number(row.id)).toSorted((a, b) => a - b);
  }
}

/** Why `change` may not be made to `current`, or null when it may. */
function refusal(current: ScheduleRow | null, change: Transition): string | null {
  const from = current?.state ?? null;
  if (!canTransition(from, change.event)) {
    return `${change.event} is not allowed from ${from ?? "no schedule"}`;
  }
  if (change.holder !== undefined && current?.holder !== change.holder) {
    return `${change.event}: the task is no longer held by this tick`;
  }
  if (change.requestIs !== undefined && current?.request !== change.requestIs) {
    return `${change.event}: a request was made since the schedule was read`;
  }
  const next = change.followedBy;
  const to = SCHEDULE_TRANSITIONS[change.event].to;
  if (next && !canTransition(to, next.event)) return `${next.event} is not allowed from ${to}`;
  return null;
}

export function isRefusal(value: ScheduleRow | Refusal): value is Refusal {
  return "refused" in value;
}
