# @apisurf/ngn-persistence

The SQLite client ngn uses: connection pragmas (WAL, busy timeout), migrations and typed helpers.

Part of [ngn](https://github.com/apisurf/ngn), a CLI scheduler for Node tasks.
It is published on its own so anything else can open an ngn database with the same settings, but most people want the
[`@apisurf/ngn`](https://www.npmjs.com/package/@apisurf/ngn) CLI instead.

```bash
npm install @apisurf/ngn-persistence
```

ESM only. Versioned in lockstep with `@apisurf/ngn`.
