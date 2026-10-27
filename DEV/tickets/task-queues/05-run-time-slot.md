# 05: `ctx.run`: the run's time slot

**What to build:** a task can see how much time it has. `ctx.run` carries the run id, when the tick was scheduled, when the next one is due, a deadline, and an `AbortSignal` that fires at the deadline. The deadline defaults to the next tick, minus a small margin, and a task can move it with `export const budget`. Long tasks use it to stop starting new work instead of guessing a batch size that fits the slot.

Runs with no schedule (`run:once`, the live editor) get no deadline, unless a budget is set.

**Blocked by:** [04: Overlap policy](04-overlap-policy.md)

**Status:** done

- [x] `ctx.run` has `id`, `scheduledAt`, `nextAt`, `deadline` and `signal`, and its type is exported from `@apisurf/ngn`
- [x] For a scheduled run, `nextAt` is the next tick and `deadline` is before it
- [x] `export const budget` accepts milliseconds or a duration string like `"4m"` and caps the deadline
- [x] `signal` aborts at the deadline, and its timer is cleared when the run ends early
- [x] `run:once` gives `nextAt` and `deadline` as null unless a budget is set
- [x] The scheduler doesn't kill a run that passes its deadline; the signal is a request
