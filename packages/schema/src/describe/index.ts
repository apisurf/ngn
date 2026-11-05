// What ngn's rows mean, in words: the derivations ngnui and the ngn CLI share,
// so a run, a task or a duration reads the same on the command line and in the
// dashboard. Pure functions over plain row shapes — no database client, no
// React, nothing Node-only — published as `@apisurf/ngn-schema/describe` so a
// task bundle importing the schema never pulls them in.
//
// The vocabulary is the glossary's: DEV/ia/glossary.md in the ngn repository.

export * from "./runs.js";
export * from "./logs.js";
export * from "./tasks.js";
export * from "./cron.js";
export * from "./numbers.js";
export * from "./stall.js";
export * from "./time.js";
export * from "./verdict.js";
export * from "./query.js";
export * from "./explain.js";
export * from "./match.js";
export * from "./query-sql.js";
