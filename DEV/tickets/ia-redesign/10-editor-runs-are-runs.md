# 10: Editor runs are runs, not tasks

**What to build:** the Tasks sidebar lists only the project's scheduled tasks, and code sent from the Editor is found where you'd look for runs. Today each editor submission becomes a sidebar "task" named "Run at 18:56:04", which mixes throwaway experiments into the project's own task list.

**Blocked by:** [07: UI vocabulary pass](07-ui-vocabulary-pass.md)

**Status:** done

- [x] Editor tasks no longer appear in the Tasks sidebar or the Overview task table
- [x] The Editor page has a "Recent runs" list of editor runs, newest first, each opening its run page
- [x] The Runs page's "Hide editor runs" toggle becomes an `origin` filter with the values scheduled and editor, kept in the URL
- [x] An editor run's page has a header and breadcrumb that lead back to the Editor, not to a task page for a throwaway file
- [x] The README's sidebar description is updated
