---
"@apisurf/ngnui": minor
---

ngnui opens on a canvas, the way wireui does: task files as a tree of their folders on the left, their newest runs on the right, and a line from each run to its task. Hovering a task or a run highlights what it is tied to. A task, a run, Overview, Runs and the Editor each open as a full-screen layer over the canvas, with crumbs at the top (`Canvas › sync-users.ts › #41`) to go back up; Esc goes up one layer. Overview moved from `/` to `/overview`. This removes the sidebar and the optional tab strip.

A run's page is quieter: it no longer repeats its task above the run (the crumbs name it), **Run again** sits beside the run's title, the line under the title drops the log and timing counts the tabs already show, and the page leaves out tabs with nothing in them. The Timeline loses its All/Logs/Timings switch, and the Timings tab keeps only the per-label table.
