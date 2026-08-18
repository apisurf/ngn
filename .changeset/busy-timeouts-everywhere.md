---
"@apisurf/ngn": patch
"@apisurf/ngnui": patch
---

Stop `SQLITE_BUSY: database is locked` when something else has the file open.

Every SQLite connection now comes from one place (`openDbClient` in
`ngn-persistence`) and carries a 5s busy timeout, instead of SQLite's default
of 0 where the first contended statement fails outright. Task databases are
opened in WAL, so a read from the UI or `ngn sql` no longer blocks a task
mid-write.

Readers deliberately leave the journal mode of a file they did not create
alone: `ngn sql` and the `ngnui` server take the busy timeout only. The
throwaway connection that creates a database file is now closed instead of
leaking a second handle on every database `ngn` opens.
