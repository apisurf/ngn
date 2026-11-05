# 07: UI vocabulary pass

**What to build:** ngnui uses the glossary's words everywhere, and sibling views are ordered the same way. Today "Live" means both the auto-refresh button and the runtime connection, the same page is called "Editor" in one place and "Live editor" in another, `ctx.kv` values sit in a tab called "Store", and "History" is both a page and a heading inside a task's Runs tab.

**Blocked by:** [01: Glossary and object model](01-glossary-and-object-model.md)

**Status:** done

- [x] The auto re-read toggle and its status-bar indicator are called **Follow**. "Live" refers to nothing but the connection to a running `ngn run`
- [x] The editor page is **Editor** in the rail, its tab title and its empty states. Runs it makes are **editor runs**
- [x] The task tab "Store" is **Keys**, and its empty state mentions `ctx.kv`
- [x] The global "History" page is **Runs**. The old URL redirects with its filters intact, and remembered tabs reopen on the new page
- [x] The heading inside a task's Runs tab no longer says "History"
- [x] Logs comes before Timings on both the task page and the run page
- [x] Either every task and run tab shows a count or none does (today Logs has none)
- [x] The ngnui README matches the new names
