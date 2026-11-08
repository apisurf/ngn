import { afterEach, expect, it } from "vitest";
import { runOnce } from "../src/runtime/taskSchedule.js";
import { ScheduleStore } from "../src/db/services/schedule.js";
import { controlSchedule, type ScheduleCommand } from "../src/runtime/scheduleControl.js";
import { systemClock } from "../src/runtime/clock.js";
import { createHarness, startScheduler, type Harness } from "./helpers.js";
import { expectScheduleInvariants } from "./invariants.js";

let h: Harness;
afterEach(() => h.dispose());

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Runs that take a random while and sometimes fail. */
const work = (timing: string, extra = "") => `
export const timing = ${timing};
${extra}
export const task = async () => {
  await new Promise((resolve) => setTimeout(resolve, 200 + Math.random() * 600));
  if (Math.random() < 0.2) throw new Error("unlucky");
};`;

const SOURCES = {
  "tasks/leading.ts": work(`{ every: "1s" }`, `export const retry = { attempts: 2 };`),
  "tasks/trailing.ts": work(`{ every: "1s", edge: "trailing" }`),
  "tasks/cron.ts": work(`"* * * * * *"`),
};
const PATHS = Object.keys(SOURCES);

const pick = <T>(list: T[]) => list[Math.floor(Math.random() * list.length)]!;

it("keeps one run of a task at a time across processes that crash, restart and run by hand", async () => {
  h = await createHarness({ file: true });
  const options = { clock: systemClock, leaseTtlMs: 300 };
  const spawn = async () => {
    const process = await h.connect();
    const { scheduler } = await startScheduler(h, SOURCES, { ...options, via: process });
    return { process, scheduler };
  };
  const live: Array<Awaited<ReturnType<typeof spawn>>> = [
    await spawn(),
    await spawn(),
    await spawn(),
  ];
  for (let step = 0; step < 14; step++) {
    await sleep(150 + Math.random() * 200);
    if (step === 4 || step === 9) {
      // A process dies mid-whatever, and a new one takes its place.
      const victim = live.splice(live.indexOf(pick(live)), 1)[0]!;
      victim.scheduler.abandon();
      // Dead: whatever its runs still try to write goes nowhere.
      victim.process.db.close();
      live.push(await spawn());
    } else if (Math.random() < 0.4) {
      await pick(live).scheduler.runNow(pick(PATHS));
    } else if (Math.random() < 0.5) {
      // A person at the terminal: ngn pause, resume or next, from a connection of its own.
      const path = pick(PATHS);
      const process = await h.connect();
      const [task] = await h.query<{ id: number }>("SELECT id FROM file_tasks WHERE path = ?", [
        path,
      ]);
      const commands: ScheduleCommand[] = [
        { kind: "pause" },
        { kind: "resume" },
        { kind: "next", delayMs: 0 },
        { kind: "next", delayMs: 1_000 },
      ];
      await controlSchedule(
        {
          store: new ScheduleStore(process.db),
          taskId: task!.id,
          name: path,
          pattern: path === "tasks/cron.ts" ? "* * * * * *" : null,
          now: Date.now(),
        },
        pick(commands),
      );
    } else {
      const path = pick(PATHS);
      const process = await h.connect();
      await runOnce(await process.task(path, SOURCES[path as keyof typeof SOURCES]), {
        ...options,
        onProblem: () => {},
      });
    }
  }

  // Long enough for a lease left by a crash to run out and be recovered.
  await sleep(1_500);
  await Promise.all(live.map(({ scheduler }) => scheduler.stop({ graceMs: 2_000 })));

  await expectScheduleInvariants(h, { stopped: true });
  const [{ n }] = (await h.query<{ n: number }>(
    "SELECT COUNT(*) AS n FROM task_runs WHERE started_at IS NOT NULL",
  )) as [{ n: number }];
  expect(n).toBeGreaterThan(6);
}, 20_000);
