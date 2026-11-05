# 11: Top bar and status bar cleanup

**What to build:** each control sits next to the thing it affects, and each bar has one job. Today the global top bar holds the Editor's side-by-side/stacked toggle, which does nothing on any other page, and the status bar repeats the database path the top bar already names.

**Blocked by:** [07: UI vocabulary pass](07-ui-vocabulary-pass.md), [09: Stalled runs](09-stalled-runs.md)

**Status:** done

- [x] The layout toggle moves into the Editor's own toolbar
- [x] Theme moves into a small settings menu in the top bar
- [x] The top bar holds the project name, Follow, Refresh and the settings menu, and nothing else
- [x] The status bar shows system state: Follow state and when the file was last read, the live runtime connection, and the running and stalled counts
- [x] The running and stalled counts link to the Runs page filtered to that status
- [x] The full database path stays reachable (a tooltip or the settings menu) without being shown twice
