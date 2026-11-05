# 20: One navigation column

**What to build:** one navigation column instead of three. Today there's a rail with three pages, a Tasks sidebar beside it, and a tab strip with preview and pinned tabs, which is a lot of wayfinding for an app with three pages and a list of tasks. After this ticket, the sidebar holds global pages at the top and the project's tasks below, and the header shows where you are.

Build it as revised by ticket 19's decision note.

**Blocked by:** [10: Editor runs are runs, not tasks](10-editor-runs-are-runs.md), [19: Tree test the proposed navigation](19-tree-test-the-navigation.md)

**Status:** done

- [x] The sidebar's top section holds Overview, Runs and Editor. The Tasks list sits below it with its filter. The rail is gone
- [x] Collapsing the sidebar still leaves a way back, and the global pages stay reachable while it's collapsed
- [x] The tab strip is off by default and can be turned on in the settings menu, with today's behaviour when on
- [x] Each page header is a breadcrumb (for example Tasks / extract.ts / Run #2) whose parts link to their pages
- [x] Browser back and forward move between views as expected, and every view keeps its own URL
- [x] The README's layout diagram and description match
