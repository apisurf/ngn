---
"@apisurf/ngn": minor
---

Drop plugins. Tasks import what they need, and every task gets its own SQLite.

The plugin system is gone: `plugins` in `ngn.config.ts`, `ctx.plugins`,
`definePlugin`, `PluginRegistry` and the `@apisurf/ngn-plugin` package
(`s3`, `resend`, `supabase`, `alerting`, `sqlite`) are all removed. A task that
needs a library installs it and imports it directly — only your task code is
bundled, imports are left external and resolved from your own `node_modules` at
run time, so what you installed is what runs.

This also removes a trap: plugins were only wired up under `ngn run`, so a task
using `ctx.plugins` typechecked and then failed under `ngn run:once`,
`ngn run:single` and the live editor.

The one plugin worth keeping is now built in. `ctx.sqlite` is on every task,
with no configuration: a database per task file, kept next to it
(`tasks/scrape.ts` uses `tasks/scrape.db`) and created only when first used.
It carries `execute(sql, args?)`, `batch(statements)`, `client`, `path`,
`initDB({ file, migrations })` and `destroyDB(file)`, the same shape the plugin
had.

A task can only reach databases inside its own folder — absolute paths and
paths that climb out with `..` are rejected — so one task's data cannot be read
or deleted by a task in another folder. Connections are reused between runs and
closed on shutdown.
