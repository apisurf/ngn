/**
 * `ngn show <run>` — one run, read like its page in ngnui: what happened and
 * why first (the same headline and sentence), then its tries, the lines it
 * logged, its timings and what it returned.
 */
import {
  describeDecision,
  describeTask,
  explainRun,
  failureMessage,
  formatDateTime,
  formatMs,
  hooksOf,
  isLifecycle,
  logLevel,
  runStatusWord,
} from "@apisurf/ngn-schema/describe";
import { RunStore } from "../read/store.js";
import { runCell, runJson } from "../read/words.js";
import { renderJson } from "../util/format.js";
import { resolveDbPath } from "../util/resolveDb.js";

export interface ShowOptions {
  db?: string;
  root?: string;
  json?: boolean;
}

/** `41` or `#41`; null (after reporting) for anything else. */
export function runIdOf(raw: string): number | null {
  const id = Number(raw.replace(/^#/, ""));
  if (Number.isInteger(id) && id > 0) return id;
  process.stderr.write(`ngn: "${raw}" is not a run id\n`);
  return null;
}

export const show = async (raw: string, options: ShowOptions) => {
  const id = runIdOf(raw);
  const dbPath = id == null ? null : await resolveDbPath(options, { mustExist: true });
  if (id == null || dbPath == null) {
    process.exitCode = 1;
    return;
  }
  const store = RunStore.open(dbPath);
  try {
    const now = Date.now();
    const page = await readRun(store, id, now);
    if (!page) {
      process.stderr.write(`ngn: there is no run ${id} in ${dbPath}\n`);
      process.exitCode = 1;
      return;
    }
    process.stdout.write(`${options.json ? asJson(page) : asText(page, now)}\n`);
  } finally {
    store.close();
  }
};

type RunPage = NonNullable<Awaited<ReturnType<typeof readRun>>>;

/** Everything `show` prints about one run, and what the run page would say first. */
async function readRun(store: RunStore, id: number, now: number) {
  const run = await store.run(id, now);
  if (!run) return null;
  const [logs, timings, result, attempts, locks, stall, code, decision] = await Promise.all([
    store.logs({ runId: id, lifecycle: true, limit: 50_000 }),
    store.timings(id),
    store.result(id),
    store.attempts(run),
    store.locks(),
    store.stalledRuns(now).then((all) => all.get(id) ?? null),
    store.latestCode(run.task_id),
    store.decision(id),
  ]);
  const held = locks.filter((lock) => lock.run_id === id).map((lock) => lock.name);
  const attempt = attempts.findIndex((a) => a.id === id) + 1 || 1;
  const story = explainRun(
    { ...run, attempt },
    {
      attempts,
      failure: run.status === "failure" ? failureMessage(logs) : null,
      hasOnError: hooksOf(code).includes("onError"),
      stall,
      locks: held,
    },
    now,
  );
  const lines = logs.filter((log) => !isLifecycle(log.value));
  return { run, story, attempt, attempts, held, lines, timings, result, decision };
}

function asJson({ run, story, attempts, held, lines, timings, result, decision }: RunPage): string {
  return renderJson({
    run: runJson(run),
    story,
    next: decision,
    attempts: attempts.map((a) => ({ id: a.id, status: a.status })),
    locks: held,
    logs: lines.map((log) => ({
      at: log.created_at,
      level: logLevel(log.status),
      message: log.value,
    })),
    timings,
    result: parseResult(result),
  });
}

function asText(page: RunPage, now: number): string {
  const { story, attempts, held, result, decision } = page;
  const out = [...heading(page, now)];
  const next = decision && describeDecision(decision.next_at, decision.reason, decision.source);
  if (next) out.push(`Then: ${next}`);
  if (story) out.push("", story.title, ...wrap(story.detail).map((line) => `  ${line}`));
  if (attempts.length > 1) {
    const tries = attempts.map((a) => `#${a.id} ${runStatusWord(a.status, false)}`).join(", ");
    out.push("", `Tries of this tick: ${tries}`);
  }
  if (held.length) out.push("", `Locks: ${held.join(", ")}`);
  out.push("", ...logLines(page), "", ...timingLines(page));
  if (result != null) {
    const json = JSON.stringify(parseResult(result), null, 2);
    out.push("", "Result", ...json.split("\n").map((line) => `  ${line}`));
  }
  return out.join("\n");
}

/** `sync.ts #4 · Failed · try 2/3 · v1`, then where and when. */
function heading({ run, attempt, attempts }: RunPage, now: number): string[] {
  const tries = attempts.length > 1 ? { attempt, attempts: attempts.length } : undefined;
  const name = run.editor ? "Editor run" : describeTask(run.path).file;
  const when =
    run.started_at == null
      ? [`queued ${formatDateTime(now, run.created_at)}, never started`]
      : [
          `started ${formatDateTime(now, run.started_at)}`,
          run.ended_at == null ? "no end recorded" : `took ${formatMs(run.duration_ms)}`,
        ];
  return [
    `${name} #${run.id} · ${runCell(run, tries)}${run.version ? ` · v${run.version}` : ""}`,
    [...(run.editor ? [] : [run.path]), ...when].join(" · "),
  ];
}

function logLines({ run, lines }: RunPage): string[] {
  const start = run.started_at ?? run.created_at;
  return [
    lines.length ? `Logs (${lines.length})` : "Logs: none",
    ...lines.map(
      (log) =>
        `  ${`+${formatMs(Math.max(0, log.created_at - start))}`.padEnd(10)} ${levelWord(log.status)} ${log.value}`,
    ),
  ];
}

function timingLines({ timings }: RunPage): string[] {
  const width = Math.max(0, ...timings.map((t) => t.label.length));
  return [
    timings.length ? `Timings (${timings.length})` : "Timings: none",
    ...timings.map((t) => `  ${t.label.padEnd(width)}  ${formatMs(t.value)}`),
  ];
}

/** INFO, WARN or ERROR, fixed width so the messages line up. */
export function levelWord(status: string): string {
  return logLevel(status).toUpperCase().padEnd(5);
}

function parseResult(result: string | null): unknown {
  if (result == null) return null;
  try {
    return JSON.parse(result) as unknown;
  } catch {
    return result;
  }
}

/** Plain text at 88 columns, for a sentence under a headline. */
function wrap(text: string, width = 88): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    if (line && line.length + word.length + 1 > width) {
      lines.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  return lines;
}
