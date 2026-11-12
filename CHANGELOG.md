# Changelog

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
