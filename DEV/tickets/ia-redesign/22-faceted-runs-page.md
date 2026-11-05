# 22: Faceted Runs page

**What to build:** a Runs page that shows the shape of the run history before anyone filters it, and narrows it with the same words the CLI uses. You type `status:failed task:extract since:24h` into one filter bar, and each part turns into a removable chip. Each filter value shows how many runs it matches, and built-in views give one-click answers to the common questions.

**Blocked by:** [10: Editor runs are runs, not tasks](10-editor-runs-are-runs.md), [17: `ngn runs`](17-ngn-runs.md)

**Status:** done

- [x] One filter bar takes free text (task path search) and `key:value` tokens from the shared grammar, including `-key:value` to exclude. Tokens show as removable chips
- [x] Typing `:` or focusing the empty bar suggests the keys, and after a key, its values
- [x] Each status and origin value shows its count under the current filters (Failed 3 · Skipped 2 · Stalled 1)
- [x] Built-in view chips: Failing, Stalled, Skipped, Editor runs. Each one is a preset filter
- [x] The whole filter lives in the URL, so a link or a reopened tab lands on the same view
- [x] Filtering still happens in SQL, so an old failure is found in a large history
- [x] A filter string copied from here works as `ngn runs "<string>"`
