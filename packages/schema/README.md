# @apisurf/ngn-schema

zod definitions for every table ngn reads and writes: tasks, versions, runs, logs, timings and kv.

Part of [ngn](https://github.com/apisurf/ngn), a CLI scheduler for Node tasks.
It is published on its own so anything else can read or validate an ngn database, but most people want the
[`@apisurf/ngn`](https://www.npmjs.com/package/@apisurf/ngn) CLI instead.

```bash
npm install @apisurf/ngn-schema
```

ESM only. Versioned in lockstep with `@apisurf/ngn`.
