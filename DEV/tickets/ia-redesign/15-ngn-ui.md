# 15: `ngn ui [run]`

**What to build:** one command opens the dashboard on this project. `ngn ui` starts ngnui with the project's database and runtime already filled in, and `ngn ui 41` opens straight on run 41. Today `ngn run` prints an `ngnui --db … --live …` line for the user to copy.

**Blocked by:** [14: `ngn run` readout lists its tasks](14-run-readout-lists-its-tasks.md)

**Status:** done

- [x] `ngn ui` uses an installed ngnui if there is one, and otherwise runs it through npx, saying which
- [x] The database comes from the project config, and the runtime from the config's port when an `ngn run` is up
- [x] `ngn ui <run-id>` opens the browser on that run's page. An unknown id says so before starting
- [x] A `:memory:` config is reported, not opened, as `ngn sql` does
- [x] The `ngn run` readout's "browse" line becomes `ngn ui`
- [x] Ctrl-C stops ngnui and frees its port
