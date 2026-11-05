# 01: Glossary and object model

**What to build:** a short reference that gives every concept in ngn and ngnui one name, and lists the objects people work with, how they relate, and the jobs the tools exist to do. Every later ticket takes its labels, flags and help wording from it, so a reader meets the same word for the same thing on the command line, in the dashboard and in the READMEs.

It lives at `DEV/ia/glossary.md`. The full plan is at `DEV/ia/plan.md`.

**Blocked by:** None (can start immediately)

**Status:** done

- [x] Object table: Project, Task, Version, Run, Log line, Timing span, Key, Lock, Queue/Job. Each with what it belongs to, its key properties, and where it shows up today in the CLI and the UI
- [x] States the rule that an editor run is a Run with origin `editor`, not a Task
- [x] Glossary table with one chosen term per concept and the terms it replaces, at least: Follow (auto re-read), Live runtime (`--live`, nothing else), Editor and editor runs, Keys, Runs (global page and task tab), `--db`, `--port`, the run status display words, Stalled, and the warn/warning log level
- [x] Run status display words fixed for both surfaces: Succeeded, Failed, Skipped, Running, Stalled
- [x] Filter keys and their values named for the Runs view and `ngn runs`: `task`, `status`, `origin`, `since`, `until`, `version`
- [x] The six top tasks written out, each with how many clicks and commands it takes today
- [x] Every inconsistency in the plan's vocabulary table is either resolved or marked as deferred
