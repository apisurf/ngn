# 13: Help grouped by intent

**What to build:** `ngn --help` fits on one screen and is organised by what the reader wants to do, with the reference material one step away. Today it's one long page mixing examples, the task-file spec, config keys, `ctx.sqlite` and where results go.

**Blocked by:** [12: One `run` command](12-one-run-command.md)

**Status:** done

- [x] Top-level help lists commands under Set up, Run, Inspect and Reference, each with a one-line description, and marks the commands that block
- [x] `ngn help task`, `ngn help config`, `ngn help ctx`, `ngn help queue` and `ngn help schema` each print one topic. `schema` carries the table list that `ngn sql --help` shows today
- [x] `ngn help --all` prints every topic in one go, examples first, for a reader (or agent) that reads once
- [x] The Inspect group lists `sql` and `ui` for now. Tickets 16–18 add their commands to it
- [x] No information from today's help is lost, only moved
