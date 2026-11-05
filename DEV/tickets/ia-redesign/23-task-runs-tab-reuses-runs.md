# 23: Task Runs tab reuses the Runs view

**What to build:** a task's Runs tab is the Runs page scoped to that task, not a separate view with its own filters. You filter the same way in both places, and the task's tab can hand you over to the global page with the filter carried across.

**Blocked by:** [22: Faceted Runs page](22-faceted-runs-page.md)

**Status:** done

- [x] The task's Runs tab renders the Runs view with `task:` locked to that task. The lock is shown and can't be removed there
- [x] The task's stats (success rate, durations, skip breakdown) stay above the list
- [x] Today's All / Failed / Skipped toggle is replaced by the same filter bar and chips
- [x] An "open in Runs" link carries the current filter to the global page with `task:` as an ordinary removable token
- [x] No list, filter or row component is duplicated between the two
