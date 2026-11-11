# Git Killer

[![CI](https://github.com/xiaozhu-eco/git-killer/actions/workflows/ci.yml/badge.svg)](https://github.com/xiaozhu-eco/git-killer/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![VS Code Marketplace](https://img.shields.io/visual-studio-marketplace/v/xiaozhu.git-killer?label=marketplace)](https://marketplace.visualstudio.com/items?itemName=xiaozhu.git-killer)

A commit-graph-centric Git client for VS Code. Browse, compare, blame and operate on Git from one graph.

## Install

- **VS Code Marketplace**: search for **Git Killer** or run:

  ```sh
  code --install-extension xiaozhu.git-killer
  ```

- **From source**: `npm install && npm run compile`, then press `F5` to launch the Extension Development Host, or install the packaged `.vsix` with `code --install-extension git-killer-0.1.0.vsix`.

## Features

### Commit graph

- Lane-based graph with merges, colors, refs, tags and detached HEAD marker
- Virtual scrolling, search by message, all-branches / current-branch scope, load more
- Repo switcher, commit details pane with changed files and per-file diffs
- Contextual details pane: current branch, upstream, HEAD, working-tree counts,
  per-action descriptions and the exact git command each action will run
- Sidebar: repository/path card, branch tracking card, working-tree stat tiles,
  sync and stash groups, per-stash Pop, recent branches with direct switching
- Ctrl/Cmd-click a second commit to compare two commits
- Right-click menu: grouped actions with the target branch in every label

### Git operations

- Commit, amend, stage-all; fetch, pull, push
- Branch switch / create / delete, tag create, merge, rebase onto branch
- Interactive rebase: reorder, squash, fixup, drop (conflict continue/abort supported)
- Cherry-pick, revert, reset (soft/mixed/hard), stash push/pop
- In-progress operation banner with continue / abort

### Editor integration

- Inline blame for the current line, blame on hover, blame in the status bar
- Line history and file history from the editor context menu
- `git-killer:` content provider powers diffs at any revision

### Entry points

- `Git Killer: Show Commit Graph` (`Cmd/Ctrl+Alt+G`)
- `Git Killer: Switch Branch` (`Cmd/Ctrl+Alt+B`)
- `Git Killer: Toggle Inline Blame` (`Cmd/Ctrl+Alt+Shift+B`)
- `Git Killer: Interactive Rebase` from the command palette or commit context menu
- Activity bar sidebar with repository status, recent branches and stashes
- Source Control title menu entry

## Settings

| Setting                              | Default | Purpose                             |
| ------------------------------------ | ------- | ----------------------------------- |
| `gitKiller.maxCommits`               | `500`   | Commits loaded per page             |
| `gitKiller.autoRefresh`              | `true`  | Refresh when the repository changes |
| `gitKiller.confirmDestructive`       | `true`  | Confirm reset / delete / abort      |
| `gitKiller.graph.rowHeight`          | `24`    | Row height in px                    |
| `gitKiller.graph.laneWidth`          | `14`    | Lane width in px                    |
| `gitKiller.graph.showRemoteBranches` | `true`  | Show remote refs                    |
| `gitKiller.graph.showTags`           | `true`  | Show tags                           |
| `gitKiller.blame.enabled`            | `true`  | Inline blame                        |
| `gitKiller.blame.hover`              | `true`  | Hover blame                         |
| `gitKiller.blame.statusBar`          | `true`  | Status bar blame                    |
| `gitKiller.gitPath`                  | `""`    | Custom git executable               |

## Known limitations (next up)

- Reword in the interactive rebase todo editor
- Interactive merge preview and merge strategy picker
- Worktrees, submodules, bisect, LFS, GPG signing flows
- Force push / push tags UI, remote management
- Full i18n (English string table is ready to be externalized)

## Development

```sh
npm install
npm run compile
npm run watch        # rebuild on change
npm run typecheck
npm run test:unit
npm run test:integration
```

`npm run test:integration` launches the installed VS Code with a temporary fixture repository and checks activation, commands, the content provider and the graph tab.

Press `F5` to launch the Extension Development Host.

## Contributing

Issues and pull requests are welcome at
[github.com/xiaozhu-eco/git-killer](https://github.com/xiaozhu-eco/git-killer).
Please run `npm run typecheck` and `npm run test:unit` before opening a PR.

## License

[MIT](LICENSE) © 2026 xiaozhu
