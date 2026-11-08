# ngn examples

A small ngn project, wired to the packages in this repo.

```bash
pnpm install
pnpm build
cd examples
pnpm start                       # run every task, until Ctrl-C
```

In a second terminal, while it runs:

```bash
pnpm exec ngn status             # how each task is doing
pnpm exec ngn runs               # recent runs
pnpm exec ngn show <run>         # one run: logs and result
pnpm exec ngn ui                 # the dashboard
```

| Task | Shows |
| --- | --- |
| `tasks/hello.ts` | the smallest task: a cron pattern and a log line |
| `tasks/every.ts` | an interval instead of a cron pattern |
| `tasks/fetch.ts` | an HTTP call, with its result stored on the run |
| `tasks/counter.ts` | the task's own SQLite database, `ctx.sqlite` |
| `tasks/fails.ts` | a task that fails, to see how failures look |

Run one task once: `pnpm exec ngn run hello --once`.
