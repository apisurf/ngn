# 09: Stalled runs

**What to build:** a run that will never finish is called what it is, and that state reaches every place that summarises health. In `ngn-properties-mine`, run #2 of `extract.ts` started on 27 Oct and never recorded an end. It shows as "Running" with a duration of "12381m 49s", ngn skips later ticks as "still running" because of it, and the Overview says "All 2 tasks healthy". Today the UI only says "likely stopped" when the run held a lock whose lease ran out.

**Blocked by:** [06: Shared run and task derivations](06-shared-run-and-task-derivations.md)

**Status:** done

- [x] The shared module derives **Stalled** for a run with no end that is older than the longest of its budget, its schedule's period and its lock lease, plus a margin. The rule is documented in the glossary
- [x] Durations read at human scale for hours and days ("8d 14h"), everywhere durations are shown
- [x] The run page shows a Stalled pill and a callout explaining what it means and what to check
- [x] The task header marks a task with a stalled run, and its sidebar row shows a health mark (failing, stalled or circuit open) in place of the run count. Healthy rows stay quiet
- [x] The Overview verdict names stalled runs ("1 run stalled since 27 Oct · extract.ts skipping ticks"), and each one appears under Needs attention with a link to the run
- [x] The status bar counts running and stalled runs separately
- [x] A run skipped because "the previous run is still in progress" links to the run that blocked it
- [x] Tests cover a stalled run with and without a lock, and a long run that's still inside its window, which stays Running
