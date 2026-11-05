# 02: `ngn init` records to a file by default

**What to build:** a fresh project keeps its run history. Today `ngn init` writes `dbPath: ":memory:"`, so nothing is kept, and `ngn sql` and ngnui have nothing to read until the user finds out why. ngnui already falls back to `./ngn.sqlite`, so after this ticket the two tools agree on the default.

**Blocked by:** None (can start immediately)

**Status:** done

- [x] `ngn init` with no database flag writes `dbPath: "file:./ngn.sqlite"`
- [x] Passing `:memory:` as the database still writes `:memory:`
- [x] `ngn init`, then `ngn add`, then one `ngn run` tick, leaves a file that `ngn sql` and `ngnui` both read with no flags
- [x] The help text and the cheat sheet in the ngn README show the new default
- [x] A changeset and an "Upgrading" entry say the default changed. Existing configs are untouched
