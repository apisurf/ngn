# 17: `ngn runs`

**What to build:** run history from the terminal, filtered by the same keys the dashboard uses. `ngn runs --task extract --status failed --since 24h` and `ngn runs "task:extract status:failed since:24h"` give the same answer. That token string is the same grammar the Runs page filter bar takes (ticket 22), so a filter can be copied from one surface to the other.

**Blocked by:** [09: Stalled runs](09-stalled-runs.md)

**Status:** done

- [x] Flags: `--task`, `--status` (the glossary's words, Stalled included), `--origin` (scheduled or editor), `--since`, `--until`, `--limit`
- [x] A positional token string with the same keys, plus `-key:value` to exclude. The parser and its errors live in the shared module, so the UI can reuse it
- [x] Each row shows run id, task, status, when it started, its duration and, for skips, the reason in words
- [x] Task names resolve the forgiving way (ticket 03's rules)
- [x] `--json` emits rows with glossary field names
- [x] Tests cover the flag form, the token form, exclusion and an unknown key
- [x] Listed under Inspect in `ngn --help`
