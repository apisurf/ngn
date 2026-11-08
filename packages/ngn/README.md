# ngn

Run JavaScript and TypeScript files on a schedule. Each task is a plain file.
Every run, with its logs and result, is saved in one SQLite file on your disk,
so you can see what happened from the terminal or in a dashboard.

## Get started

```bash
npm install -g @apisurf/ngn   # or: npx @apisurf/ngn <command>
npm i @apisurf/ngn            # in your project, for the types

ngn init            # creates ngn.config.ts and tasks/
ngn add hello.ts    # creates tasks/hello.ts
ngn run             # runs every task, until Ctrl-C
```

## Writing a task

A task file exports `timing` (when to run) and `task` (what to run):

```ts
// tasks/hello.ts
import type { TaskContext } from "@apisurf/ngn";

// Every 10 seconds
export const timing = "*/10 * * * * *";

export const task = async (ctx: TaskContext) => {
  const res = await fetch("https://example.com", { signal: ctx.run.signal });
  const html = await res.text();

  await ctx.log.info(`fetched ${html.length} bytes`);

  // Whatever you return is stored with the run
  return { length: html.length };
};
```

Import any package you have installed. A file or folder whose name starts with
`_` is never treated as a task, so use it for shared helpers.

### Timing

Use a cron pattern, or `{ every }` for a fixed interval. A cron pattern can
have an optional seconds field in front.

```ts
export const timing = "*/10 * * * * *"; // cron, with seconds: every 10 seconds
export const timing = "0 9 * * 1-5";    // cron: weekdays at 9:00
export const timing = { every: "5m" };  // every 5 minutes
```

### The context

| On `ctx` | What it does |
| --- | --- |
| `log.info(text)` | Log a line. Also `warning` and `error` |
| `kv.get(key)` / `set(key, value)` | Small string values that are kept between runs |
| `sqlite.execute(sql, args)` | Query the task's own SQLite database, kept next to the task file |
| `env` | Variables from `.env` |
| `run.signal` | Aborts when the run should stop. Pass it to `fetch` |

## Commands

| Command | Does |
| --- | --- |
| `ngn run` | Run every task, until Ctrl-C |
| `ngn run hello` | Run only the tasks you name |
| `ngn run hello --once` | Run one task now, then exit |
| `ngn status` | How each task is doing, and when it runs next |
| `ngn runs` | Recent runs |
| `ngn show <run>` | One run: its logs, error and result |
| `ngn logs <task>` | A task's log lines |
| `ngn pause <task>` / `ngn resume <task>` | Stop and restart a task without editing it |
| `ngn ui` | Open the dashboard in a browser |

`ngn --help` lists every command. `ngn help task`, `ngn help ctx`,
`ngn help queue` and `ngn help schema` cover the rest: retries, locks, queues,
hooks and the database tables.

## Configuration

`ngn init` writes `ngn.config.ts`. Every option is optional:

```ts
import { defineConfig } from "@apisurf/ngn";

export default defineConfig({
  dbPath: "file:./ngn.sqlite",
});
```

| Option | What it is |
| --- | --- |
| `dbPath` | Where runs and logs are saved. `ngn init` sets `file:./ngn.sqlite` |
| `match` | Which files are tasks. Default `["tasks/**/*.ts"]` |
| `envFile` | Loaded into `ctx.env`. Default `.env` |

## Examples

[`examples/`](https://github.com/apisurf/ngn/tree/main/examples) in the repo
is a small project to try it on.
