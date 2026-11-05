# 06: Shared run and task derivations (prefactor)

**What to build:** one module that both ngnui and the `ngn` CLI use to turn raw rows into words, so the two surfaces can't drift apart. Today these rules live only inside ngnui: status display words, what a `skip_reason` means and how it reads in a sentence, the cron schedule in words, the retry/budget/overlap/exclusive/hooks read out of compiled code, circuit-open detection and duration formatting. The CLI read commands (tickets 14–18) need every one of them.

There is no visible behaviour change. It's a move, with the names taken from the glossary.

**Blocked by:** [01: Glossary and object model](01-glossary-and-object-model.md)

**Status:** done

- [x] The derivations are pure functions over plain row shapes, with no database client, React or Node-only imports
- [x] They live in a package that `ngn` can depend on at run time and ngnui can bundle at build time, without pulling the task runtime into task bundles
- [x] ngnui uses the shared module and keeps no copy of its own. The UI looks and behaves as before
- [x] Function and type names follow the glossary
- [x] The existing ngnui tests pass unchanged, and the moved functions have their own unit tests in the new home
