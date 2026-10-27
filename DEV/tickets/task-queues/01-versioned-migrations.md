# 01: Versioned migrations for ngn's own database

**What to build:** ngn can change its own schema without asking anyone to delete their `ngn.sqlite`. Today ngn writes the schema only when it creates the file, so an existing database never gets a new table or column. After this ticket, opening the database through the scheduler applies any migration it hasn't seen, in order, once each. The schema that exists today counts as the first migration, and a database created by an older version is recognised as already having it.

`ngn sql` keeps its promise: it opens the file without migrating it.

**Blocked by:** None (can start immediately)

**Status:** done

- [x] Applied migrations are tracked by id in a table inside `ngn.sqlite`
- [x] A fresh file and an in-memory database both end up with every migration applied
- [x] A file created by 0.2.x (tables present, no tracking table) is marked as having migration 1 and then gets the later ones
- [x] Opening the same file twice applies nothing the second time
- [x] `ngn sql` and ngnui still open the file read-only, with no migration
- [x] Tests cover the fresh, legacy and already-current cases
