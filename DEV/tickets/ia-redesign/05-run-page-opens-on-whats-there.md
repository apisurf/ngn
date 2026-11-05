# 05: Run page opens on what's there

**What to build:** opening a run lands on its most useful content, and a run that recorded little shows little. Today a run that logged nothing opens on an empty Timeline ("Only ngn's lifecycle lines"), next to stat cards reading "Logs 0" and "Timed spans 0". The Overview likewise draws an empty 24-hour chart under a line that already says there were no runs.

**Blocked by:** None (can start immediately)

**Status:** done

- [x] With no sub-tab in the URL, a failed run opens on Logs. A run with task log lines or timings opens on Timeline. A run with neither opens on Result if it returned something, else on Details
- [x] A sub-tab named in the URL or remembered by the tab still wins
- [x] Tabs with nothing in them are hidden or dimmed, consistently across the run page
- [x] Zero-value stats fold into one muted line instead of full cards
- [x] Stepping between runs with `[` and `]` keeps the chosen sub-tab when the next run has content there, and otherwise falls back to the rule above
- [x] The Overview hides its 24-hour chart when there were no runs in that window
