# 08: CLI flags in one style

**What to build:** every flag across `ngn` and `ngnui` uses kebab-case and the glossary's name. Today the database is `--dbFile` on `init` and `--db` on `sql` and `ngnui`, the runtime port is `--apiPort`, and `--configFile` and `--envFile` sit beside `--max-width`.

**Blocked by:** [01: Glossary and object model](01-glossary-and-object-model.md)

**Status:** done

- [x] `init` takes `--db`, `--port`, `--config` and `--env-file`. `--match` and `--root` are unchanged
- [x] The old camelCase flags still work as hidden aliases. They're left out of `--help` and listed under "Upgrading"
- [x] The same concept has the same flag name on every command that takes it
- [x] The flag descriptions use glossary terms ("runtime port", not "live server port" or "API port")
- [x] Tests cover the new flags and at least one old alias per command
