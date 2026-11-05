# 24: Time scrub on Runs

**What to build:** finding when things went wrong by looking at the history over time. An activity chart sits at the top of the Runs page, and dragging across it narrows the list to that window. Failures that cluster around a deploy or an outage show up as a shape before anyone reads a row.

**Blocked by:** [22: Faceted Runs page](22-faceted-runs-page.md)

**Status:** done

- [x] The Runs page shows the activity chart (runs per bucket, split by outcome) for the current filter, over the selected time range
- [x] Dragging across the chart sets `since:` and `until:` tokens in the filter bar. Clearing them restores the full range
- [x] The bucket size adapts to the range (minutes, hours or days)
- [x] The chart respects every other active filter
- [x] The chart can be used from the keyboard, or the time tokens give an equivalent path
