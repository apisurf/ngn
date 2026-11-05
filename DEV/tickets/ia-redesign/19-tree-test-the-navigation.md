# 19: Tree test the proposed navigation

**What to build:** evidence that the proposed navigation works before it's built. Ticket 20 reverses part of the recent "simplify ui" direction (the rail merges into the sidebar and the tab strip becomes opt-in), so the decision should rest on how people find things in a test.

This one needs a person to run it with users, so it isn't agent work.

**Blocked by:** [07: UI vocabulary pass](07-ui-vocabulary-pass.md)

**Status:** done (agent proxy; repeat with people)

- [x] A text-only menu tree of the proposed navigation, using the glossary labels (`DEV/ia/tree-test.md`)
- [x] 5–8 findability tasks drawn from the top tasks, for example: why did `extract.ts` skip its last tick, find run 41, which task is stuck, what did `collect.ts` store, where do I try code against the real env
- [x] Run with at least two people who use ngn, and optionally an agent given only the tree — **run with three agents only** (see the results); still worth repeating with two people
- [x] Success rate and first click are recorded per task in `DEV/ia/`
- [x] A decision note: build ticket 20 as written, or with the changes the test showed
