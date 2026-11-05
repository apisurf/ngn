# 21: Command palette (⌘K)

**What to build:** a keyboard way to get anywhere. ⌘K (Ctrl-K elsewhere) opens a palette that jumps to a task by name, a run by `#id`, or a page, and runs a few actions. It also fixes `/`, which today focuses a different input depending on the page.

**Blocked by:** [07: UI vocabulary pass](07-ui-vocabulary-pass.md)

**Status:** done

- [x] ⌘K / Ctrl-K opens the palette from anywhere, and Escape closes it
- [x] Typing filters tasks by path and pages by name. `#41` or `41` offers run 41 when it exists
- [x] Actions: toggle Follow, refresh, change theme
- [x] The palette works from the keyboard alone and has screen-reader labels
- [x] `/` only focuses the current page's own filter. On a page without one it does nothing
- [x] Shortcuts are listed somewhere discoverable (the palette footer or the settings menu)
