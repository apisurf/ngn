// The live editor: write a task, run it once in the project's own runtime, and
// read what it returned next to what it logged.
//
// ngnui does not execute anything. The code goes to the `ngn run` named by
// `ngnui --live <url>`, which compiles it with the project's config and env and
// records it like any other task — so the run it made is found in the database
// afterwards and shown here with its logs, the same as a scheduled one.
//
// Code and result sit side by side or stacked, per the layout toggle in the top
// bar. The draft is kept in this browser, so a reload does not lose it.

import { createFileRoute, getRouteApi, Link } from "@tanstack/react-router";
import * as React from "react";
import { css, cx } from "styled-system/css";
import { IconAlert, IconCode, IconPlay, IconRefresh, IconRun } from "~/components/icons";
import { JsonView } from "~/components/json-view";
import { LogList } from "~/components/log-list";
import {
  Button,
  Callout,
  CopyButton,
  Empty,
  IconButton,
  Kbd,
  mono,
  Pill,
  RunBadge,
  Segmented,
  TabList,
} from "~/components/primitives";
import { Split } from "~/components/split";
import { command } from "~/components/states";
import { formatMs } from "~/lib/format";
import type { JsonValue } from "~/lib/json";
import { usePrefs } from "~/lib/prefs";
import { tabKey, useTab } from "~/lib/tabs";
import type { LiveLanguage, LiveRun, LiveStatus, RunPage } from "~/server/api";
import { getLiveStatus, getRun, runLive } from "~/server/api";

const root = getRouteApi("__root__");

const TEMPLATES: Record<LiveLanguage, string> = {
  typescript: `import type { TaskContext } from "@apisurf/ngn";

export const task = async (ctx: TaskContext) => {
  await ctx.log.info("hello from the live editor");

  const end = ctx.timing.start("work");
  await new Promise((resolve) => setTimeout(resolve, 120));
  await end();

  return { now: new Date().toISOString(), env: Object.keys(ctx.env).length };
};
`,
  javascript: `export const task = async (ctx) => {
  await ctx.log.info("hello from the live editor");
  return { now: new Date().toISOString() };
};
`,
};

const DRAFT_KEY = "ngnui:live-draft";

interface Draft {
  code: string;
  language: LiveLanguage;
}

export const Route = createFileRoute("/live")({
  loader: () => getLiveStatus(),
  staleTime: 0,
  component: LivePage,
});

function LivePage() {
  useTab({ key: tabKey.live(), title: "Live editor", icon: "live" });
  const ws = root.useLoaderData();
  const initialStatus = Route.useLoaderData();
  const { prefs } = usePrefs();
  const [status, setStatus] = React.useState<LiveStatus>(initialStatus);
  const [draft, setDraft] = useDraft();
  const [outcome, setOutcome] = React.useState<{ live: LiveRun; run: RunPage | null } | null>(null);
  const [running, setRunning] = React.useState(false);

  React.useEffect(() => setStatus(initialStatus), [initialStatus]);

  const probe = React.useCallback(async () => setStatus(await getLiveStatus()), []);

  const run = React.useCallback(async () => {
    if (!draft.code.trim() || running) return;
    setRunning(true);
    try {
      const live = await runLive({ data: draft });
      const recorded = live.runId ? await getRun({ data: { runId: live.runId } }) : null;
      setOutcome({ live, run: recorded });
      if (!live.ok) void probe();
    } catch (err) {
      setOutcome({
        live: {
          ok: false,
          error: err instanceof Error ? err.message : String(err),
          ms: 0,
          runId: null,
        },
        run: null,
      });
    } finally {
      setRunning(false);
    }
  }, [draft, running, probe]);

  const enabled = status.state === "up";

  const editorPane = (
    <div className={css({ display: "flex", flexDir: "column", h: "full", minH: "0" })}>
      <div
        className={css({
          display: "flex",
          alignItems: "center",
          gap: "2",
          px: "3",
          h: "40px",
          flexShrink: 0,
          borderBottom: "1px solid",
          borderColor: "line",
        })}
      >
        <Button
          onClick={() => void run()}
          disabled={!enabled || running}
          title={enabled ? "Run once in ngn run" : "Connect ngnui to a running ngn run first"}
          className={css({
            bg: "accent",
            color: "accentFg",
            borderColor: "accent",
            _hover: { bg: "accent", opacity: 0.9 },
          })}
        >
          <IconPlay size={12} />
          {running ? "Running…" : "Run"}
        </Button>
        <Kbd>⌘ ↵</Kbd>
        <Segmented
          items={[
            { id: "typescript", label: "TypeScript" },
            { id: "javascript", label: "JavaScript" },
          ]}
          value={draft.language}
          onSelect={(language) => setDraft({ ...draft, language })}
        />
        <Button
          onClick={() => setDraft({ ...draft, code: TEMPLATES[draft.language] })}
          title="Replace the editor's contents with a starter task"
        >
          Template
        </Button>
        <span className={css({ ml: "auto" })}>
          <Connection status={status} onProbe={() => void probe()} />
        </span>
      </div>
      <textarea
        value={draft.code}
        spellCheck={false}
        aria-label="Task code"
        onChange={(e) => setDraft({ ...draft, code: e.target.value })}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
            e.preventDefault();
            void run();
          }
          if (e.key === "Tab" && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
            e.preventDefault();
            insertAtCursor(e.currentTarget, "  ", (code) => setDraft({ ...draft, code }));
          }
        }}
        className={cx(
          mono,
          css({
            flex: "1",
            minH: "0",
            resize: "none",
            border: "none",
            outline: "none",
            p: "3",
            bg: "well",
            fontSize: "13px",
            lineHeight: "1.6",
            tabSize: 2,
          }),
        )}
      />
    </div>
  );

  return (
    <div className={css({ display: "flex", flexDir: "column", h: "full", minH: "0" })}>
      {status.state !== "up" ? <Offline status={status} dbPath={ws.path} /> : null}
      <div className={css({ flex: "1", minH: "0", display: "flex" })}>
        <Split
          direction={prefs.layout}
          storageKey={`live-${prefs.layout}`}
          initial={0.5}
          first={editorPane}
          second={<Result outcome={outcome} running={running} />}
        />
      </div>
    </div>
  );
}

function Connection({ status, onProbe }: { status: LiveStatus; onProbe: () => void }) {
  return (
    <span className={css({ display: "inline-flex", alignItems: "center", gap: "1" })}>
      {status.state === "up" ? (
        <Pill tone="ok" title={status.url}>
          ● {status.runtime}
          {status.version ? ` ${status.version}` : ""} · {status.url.replace(/^https?:\/\//, "")}
        </Pill>
      ) : status.state === "down" ? (
        <Pill tone="bad" title={status.error}>
          ● unreachable · {status.url.replace(/^https?:\/\//, "")}
        </Pill>
      ) : (
        <Pill>● not connected</Pill>
      )}
      {status.state !== "off" ? (
        <IconButton label="Check the connection again" onClick={onProbe}>
          <IconRefresh size={14} />
        </IconButton>
      ) : null}
    </span>
  );
}

function Offline({ status, dbPath }: { status: LiveStatus; dbPath: string }) {
  return (
    <div className={css({ px: "3", pt: "3", flexShrink: 0 })}>
      {status.state === "down" ? (
        <Callout
          tone="bad"
          icon={<IconAlert size={15} />}
          title={`ngn run at ${status.url} ${status.error}`}
        >
          The editor sends code to that process to execute. Start it again in the project, or
          restart ngnui with the <span className={mono}>live</span> URL it prints.
        </Callout>
      ) : (
        <Callout
          tone="info"
          icon={<IconCode size={15} />}
          title="The editor needs a running ngn run"
        >
          ngnui only reads; running a task takes the project's compiler, config and env, which live
          in <span className={mono}>ngn run</span>. It prints the command to connect the two when it
          starts:
          <code className={cx(command, css({ mt: "2" }))}>
            {`ngnui --db ${dbPath} --live http://127.0.0.1:4545`}
          </code>
        </Callout>
      )}
    </div>
  );
}

type ResultTab = "result" | "logs";

function Result({
  outcome,
  running,
}: {
  outcome: { live: LiveRun; run: RunPage | null } | null;
  running: boolean;
}) {
  const [tab, setTab] = React.useState<ResultTab>("result");

  if (!outcome) {
    return (
      <Empty
        title={running ? "Running…" : "Run the task to see what it returns"}
        icon={<IconPlay size={22} />}
      >
        It runs once, in the process <span className={mono}>ngn run</span> is, and is recorded like
        any other task — with its logs and timings.
      </Empty>
    );
  }

  const { live, run } = outcome;
  const logCount = run?.logs.length ?? 0;

  return (
    <div
      className={css({
        display: "flex",
        flexDir: "column",
        h: "full",
        minH: "0",
        opacity: running ? 0.6 : 1,
      })}
    >
      <TabList
        dense
        items={[
          { id: "result", label: "Result" },
          { id: "logs", label: "Logs", count: logCount, hidden: !run },
        ]}
        value={tab}
        onSelect={setTab}
        right={
          <>
            {run ? <RunBadge status={run.run.status} pill /> : null}
            <span className={cx(mono, css({ color: "muted", fontSize: "11px" }))}>
              {formatMs(live.ms)}
            </span>
            {run ? (
              <Link
                to="/tasks/$taskId/runs/$runId"
                params={{ taskId: String(run.run.task_id), runId: String(run.run.id) }}
                className={css({
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "1",
                  fontSize: "12px",
                  color: "accent",
                })}
              >
                <IconRun size={10} />
                Run #{run.run.id}
              </Link>
            ) : null}
          </>
        }
      />
      {tab === "logs" && run ? (
        <LogList logs={run.logs} start={run.run.started_at} empty="The task logged nothing" />
      ) : (
        <ResultBody live={live} run={run} />
      )}
    </div>
  );
}

function ResultBody({ live, run }: { live: LiveRun; run: RunPage | null }) {
  if (!live.ok) {
    return (
      <div className={css({ p: "3" })}>
        <Callout tone="bad" icon={<IconAlert size={15} />} title="Could not run it">
          <span className={mono}>{live.error}</span>
        </Callout>
      </div>
    );
  }
  // ngn run answers `null` both for a task that returned nothing and for one
  // that threw; the recorded run tells the two apart.
  if (live.result === null && run?.run.status === "failure") {
    return (
      <div className={css({ p: "3" })}>
        <Callout tone="bad" icon={<IconAlert size={15} />} title="The task threw">
          {run.failure ? (
            <span className={mono}>{run.failure}</span>
          ) : (
            "ngn run records that it failed, not the error; its terminal has the stack."
          )}
        </Callout>
      </div>
    );
  }
  const text = JSON.stringify(live.result, null, 2) ?? "undefined";
  return (
    <div className={css({ display: "flex", flexDir: "column", flex: "1", minH: "0" })}>
      <div
        className={css({
          display: "flex",
          alignItems: "center",
          px: "3",
          py: "1.5",
          borderBottom: "1px solid",
          borderColor: "line",
          flexShrink: 0,
          fontSize: "11px",
          color: "faint",
        })}
      >
        <span className={mono}>
          {live.result == null ? "returned nothing" : `returned ${describe(live.result)}`}
        </span>
        <span className={css({ ml: "auto" })}>
          <CopyButton text={text} />
        </span>
      </div>
      <div className={css({ flex: "1", minH: "0", overflow: "auto", bg: "well" })}>
        <JsonView value={live.result as JsonValue} />
      </div>
    </div>
  );
}

function describe(value: unknown): string {
  if (Array.isArray(value)) return `an array of ${value.length}`;
  if (value && typeof value === "object") return `an object with ${Object.keys(value).length} keys`;
  return `a ${typeof value}`;
}

function insertAtCursor(el: HTMLTextAreaElement, text: string, commit: (next: string) => void) {
  const { selectionStart, selectionEnd, value } = el;
  commit(value.slice(0, selectionStart) + text + value.slice(selectionEnd));
  window.requestAnimationFrame(() =>
    el.setSelectionRange(selectionStart + text.length, selectionStart + text.length),
  );
}

/** The editor's contents, kept in this browser; the template until something is typed. */
function useDraft(): [Draft, (next: Draft) => void] {
  const [draft, setDraft] = React.useState<Draft>({
    code: TEMPLATES.typescript,
    language: "typescript",
  });

  React.useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? "null") as Partial<Draft> | null;
      if (stored && typeof stored.code === "string") {
        setDraft({
          code: stored.code,
          language: stored.language === "javascript" ? "javascript" : "typescript",
        });
      }
    } catch {
      // Nothing stored, or storage blocked: start from the template.
    }
  }, []);

  const save = React.useCallback((next: Draft) => {
    setDraft(next);
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(next));
    } catch {
      // The draft lasts as long as the page.
    }
  }, []);

  return [draft, save];
}
