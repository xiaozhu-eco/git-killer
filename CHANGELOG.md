# Changelog

## 0.4.1

- Fix column resizing: dragging a header divider now moves that boundary and adjusts the two
  columns it separates, so the divider stays under the pointer instead of letting the flexible
  Description column absorb the change.
- Resizing stops cleanly at the minimum/maximum column widths, and double-clicking a divider
  resets the adjacent columns.

## 0.4.0

- The commit list now has a sticky column header (Refs, Description, Author, Date, SHA) and
  every row shares the same grid, so columns line up regardless of the refs on each commit.
- Author and relative date are now separate columns.
- Drag a header divider to resize a column, double-click it to reset, or focus it and use
  the arrow keys (Shift for larger steps). Widths persist across webview reloads.

## 0.3.1

- Fix the repository panel being restored into the Explorer container: the view now uses a
  fresh id (`gitKiller.repository`) and declares its icon/contextual title, so it lands in the
  built-in Source Control container instead of a previously dragged position.

## 0.3.0

- The repository panel now lives in the built-in **Source Control** view container instead of
  a separate activity bar entry, so it sits next to the native Changes view.
- Sidebar: new **Worktrees** section that lists every checkout, opens another worktree in a
  new window, adds a worktree on an existing or new branch, removes it (with a force fallback)
  and prunes stale entries.
- Sidebar: new **Submodules** section showing per-submodule state (up to date, new commits,
  not initialized, conflict), with update-one, update-all and URL sync actions.
- Click a submodule in the sidebar to switch the commit graph to it; the open graph tab is
  reused and the submodule is registered as a repository you can switch back from.
- New commands: `Add Worktree...`, `Open Worktree`, `Remove Worktree...`, `Prune Worktrees`,
  `Update Submodules`, `Sync Submodule URLs`, `Open Submodule Graph...`.

## 0.2.0

- Commit graph rendering: edges are anchored to the row top / commit dot / row bottom, so lanes
  no longer hang above a branch's first commit, stop half a row short of a root commit, or run
  past the dot on merges.
- Lane colours stay stable for the lifetime of a branch, and new lanes avoid the colour of their
  neighbour.
- Merge parents always open a lane to the right of the mainline instead of jumping left across
  the graph.
- Lanes shrink to fit the graph column instead of being clipped when a repository has many
  concurrent branches.
- Lanes redraw synchronously while scrolling and follow variable row heights.
- Long branch/tag chips wrap instead of being truncated; rows grow to fit.
- Hover a commit row to see every branch/tag pointing at it.
- Right-click a branch/tag chip to copy the branch/tag name or the full ref name.
- New "jump to current branch" button in the graph toolbar.
- The repository/branch row and the search row are merged into a single toolbar row.
- Default commits loaded per page is now 100 (was 500); `gitKiller.maxCommits` still controls it.
- Integration tests use the published extension id.

## 0.1.1

- Add a dedicated Marketplace icon.
- Publish through GitHub Actions OIDC Trusted Publishing.
- Publish under the `xiaozhu-studio` publisher.

## 0.1.0

- Initial commit graph, commit details, compare, diffs, blame, file/line history.
- Contextual UI: branch/HEAD/status summary, per-operation descriptions and git command previews.
- Redesigned sidebar: repository and branch cards, working-tree stat tiles, grouped sync/stash actions,
  per-stash pop, direct branch switching and in-progress operation handling.
- Core Git operations: commit, branch, tag, checkout, merge, rebase, cherry-pick,
  revert, reset, stash, fetch/pull/push.
- Interactive rebase todo editor (reorder, squash, fixup, drop).
- Quick branch switch, quick open graph, sidebar repository panel.
