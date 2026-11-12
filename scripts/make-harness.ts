import * as fs from 'node:fs';
import * as path from 'node:path';
import type { CommitDetails, FileChange, GraphRow, RefSummary, RepoState } from '../src/protocol';
import { computeLayout } from '../src/graph/laneLayout';

interface Node {
  sha: string;
  parents: string[];
  subject: string;
  author: string;
}

const nodes: Node[] = [];
const authors = ['Alice Chen', 'Bob Martin', 'Carol Diaz', 'Dan Wu', 'Eve Novak'];

function add(sha: string, parents: string[], subject: string, index: number): void {
  nodes.push({ sha, parents, subject, author: authors[index % authors.length] });
}

// Newest first, topological order.
add('n3', ['n2'], 'Polish commit graph rendering', 0);
add('n2', ['n1'], 'Add virtual scrolling to the graph list', 1);
add('n1', ['m2'], 'Introduce commit details pane', 2);
add('m2', ['m1', 'h2'], 'Merge branch hotfix/1.0.2', 3);
add('m1', ['c10', 'f3'], 'Merge branch feature/toolbar', 4);
add('h2', ['h1'], 'Fix race when refreshing refs', 0);
add('c10', ['c9'], 'Extract git executor', 1);
add('h1', ['c8'], 'Guard against empty repositories', 2);
add('c9', ['c8'], 'Parse porcelain v2 status', 3);
add('c8', ['c7'], 'Add blame decorations', 4);
add('f3', ['f2'], 'Add compare selection', 0);
add('c7', ['c6'], 'Register content provider', 1);
add('f2', ['f1'], 'Group branches in quick pick', 2);
add('c6', ['c5'], 'Debounce repository refresh', 3);
add('f1', ['c5'], 'Add toolbar buttons', 4);
add('c5', ['c4'], 'Discover repositories', 0);
add('c4', ['c3'], 'Parse refs from for-each-ref', 1);
add('c3', ['c2'], 'Compute lane layout', 2);
add('c2', ['c1'], 'Add protocol types', 3);
add('c1', ['root'], 'Initialize extension', 4);
add('root', [], 'Initial commit', 0);

const layout = computeLayout(nodes);
const refMap = new Map<string, RefSummary[]>();
const ref = (sha: string, shortName: string, type: RefSummary['type'], name = shortName): void => {
  const list = refMap.get(sha) ?? [];
  list.push({ name, shortName, type, sha });
  refMap.set(sha, list);
};
ref('n3', 'main', 'local', 'refs/heads/main');
ref('n3', 'origin/main', 'remote', 'refs/remotes/origin/main');
ref('n3', 'v0.1.0', 'tag', 'refs/tags/v0.1.0');
ref('f3', 'feature/toolbar', 'local', 'refs/heads/feature/toolbar');
ref('h2', 'hotfix/1.0.2', 'local', 'refs/heads/hotfix/1.0.2');
ref('m1', 'origin/release/1.0', 'remote', 'refs/remotes/origin/release/1.0');
ref('c8', 'v0.0.9', 'tag', 'refs/tags/v0.0.9');

const now = Math.floor(Date.now() / 1000);
const rows: GraphRow[] = nodes.map((node, index) => ({
  sha: node.sha,
  parents: node.parents,
  subject: node.subject,
  author: node.author,
  authorEmail: `${node.author.split(' ')[0].toLowerCase()}@example.com`,
  authorTime: now - index * 5400 - 600,
  refs: refMap.get(node.sha) ?? [],
  isHead: node.sha === 'n3',
  lane: layout[index].lane,
  color: layout[index].color,
  edges: layout[index].edges,
  laneCount: layout[index].laneCount,
}));

const files: FileChange[] = [
  { path: 'src/graph/graphPanel.ts', status: 'M', additions: 42, deletions: 7, binary: false },
  { path: 'webview/src/components/GraphList.tsx', status: 'M', additions: 88, deletions: 12, binary: false },
  { path: 'webview/src/styles.css', status: 'M', additions: 30, deletions: 3, binary: false },
  { path: 'media/icon.png', status: 'A', additions: 0, deletions: 0, binary: true },
];

const details: CommitDetails = {
  sha: 'n1' + '0'.repeat(38),
  parents: ['m2' + '0'.repeat(38)],
  author: 'Carol Diaz',
  authorEmail: 'carol@example.com',
  authorTime: now - 3 * 5400,
  committer: 'Carol Diaz',
  committerEmail: 'carol@example.com',
  committerTime: now - 3 * 5400,
  refs: [],
  subject: 'Introduce commit details pane',
  body: 'Introduce commit details pane\n\nShow message, author, parents and changed files in a side pane.\nCtrl/Cmd-click a second commit to compare.',
  files,
};

const state: RepoState = {
  root: '/tmp/demo-repo',
  name: 'demo-repo',
  head: { sha: 'n3', branch: 'main', detached: false },
  status: {
    branch: 'main',
    upstream: 'origin/main',
    ahead: 2,
    behind: 1,
    staged: 1,
    unstaged: 2,
    untracked: 1,
    conflicted: 0,
  },
  rows,
  hasMore: true,
  filter: { scope: 'all', text: '' },
  operation: null,
  ui: { rowHeight: 24, laneWidth: 14 },
};

const repos = [
  { root: '/tmp/demo-repo', name: 'demo-repo' },
  { root: '/tmp/other-repo', name: 'other-repo' },
];

const safe = (value: unknown) => JSON.stringify(value).replace(/</g, '\\u003c');

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>Git Killer webview harness</title>
<link rel="stylesheet" href="../dist/webview.css" />
<style>
  html, body, #root { height: 100%; margin: 0; }
  :root {
    --vscode-editor-background: #1e1e1e;
    --vscode-foreground: #cccccc;
    --vscode-sideBar-background: #252526;
    --vscode-descriptionForeground: #9d9d9d;
    --vscode-panel-border: #3c3c3c;
    --vscode-list-hoverBackground: #2a2d2e;
    --vscode-list-activeSelectionBackground: #04395e;
    --vscode-list-activeSelectionForeground: #ffffff;
    --vscode-button-background: #0e639c;
    --vscode-button-foreground: #ffffff;
    --vscode-button-secondaryBackground: #3a3d41;
    --vscode-button-secondaryForeground: #ffffff;
    --vscode-input-background: #3c3c3c;
    --vscode-input-foreground: #cccccc;
    --vscode-focusBorder: #007fd4;
    --vscode-badge-background: #4d4d4d;
    --vscode-badge-foreground: #ffffff;
    --vscode-charts-blue: #3794ff;
    --vscode-charts-orange: #d18616;
    --vscode-charts-green: #89d185;
    --vscode-charts-red: #f14c4c;
    --vscode-charts-purple: #b180d7;
    --vscode-charts-yellow: #cca700;
  }
</style>
</head>
<body>
<div id="root"></div>
<script>
  window.__SAMPLE__ = ${safe(state)};
  window.__DETAILS__ = ${safe(details)};
  window.acquireVsCodeApi = () => ({
    postMessage(message) {
      window.__messages = window.__messages || [];
      window.__messages.push(message);
      if (message.type === 'ready') {
        setTimeout(() => {
          window.postMessage({ type: 'repos', repos: ${safe(repos)}, active: '/tmp/demo-repo' }, '*');
          window.postMessage({ type: 'state', state: window.__SAMPLE__ }, '*');
          window.postMessage({ type: 'busy', busy: false }, '*');
        }, 20);
      }
      if (message.type === 'compare') {
        window.postMessage({
          type: 'details',
          compare: { a: message.a, b: message.b, files: window.__DETAILS__.files },
        }, '*');
      }
      if (message.type === 'selectCommit') {
        const row = (window.__SAMPLE__.rows || []).find(item => item.sha === message.sha);
        const commit = row
          ? {
              ...window.__DETAILS__,
              sha: row.sha,
              subject: row.subject,
              author: row.author,
              authorEmail: row.authorEmail,
              authorTime: row.authorTime,
              committer: row.author,
              committerEmail: row.authorEmail,
              committerTime: row.authorTime,
              parents: row.parents,
              refs: row.refs,
              body: row.subject + '\\n\\nSample commit body for the harness.',
            }
          : window.__DETAILS__;
        window.postMessage({ type: 'details', commit }, '*');
      }
      if (message.type === 'loadMore') {
        window.postMessage({ type: 'toast', kind: 'info', message: 'loadMore' }, '*');
      }
    },
    getState() { return window.__vscodeState; },
    setState(value) { window.__vscodeState = value; },
  });
</script>
<script src="../dist/webview.js"></script>
</body>
</html>
`;

const output = path.join(process.cwd(), 'dev', 'harness.html');
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, html, 'utf8');
console.log(`wrote ${output}`);

const sidebarState = {
  repos: [
    { root: '/Users/geocat/Codes/git-killer', name: 'git-killer' },
    { root: '/Users/geocat/Codes/design-system', name: 'design-system' },
  ],
  active: '/Users/geocat/Codes/git-killer',
  branch: 'main',
  upstream: 'origin/main',
  detached: false,
  ahead: 2,
  behind: 1,
  staged: 1,
  unstaged: 2,
  untracked: 0,
  conflicted: 0,
  operation: null,
  branches: [
    { name: 'refs/heads/main', shortName: 'main', type: 'local', sha: 'a', upstream: 'origin/main', ahead: 2, behind: 1, date: 4 },
    { name: 'refs/heads/feature/sidebar-polish', shortName: 'feature/sidebar-polish', type: 'local', sha: 'b', ahead: 0, behind: 0, date: 3 },
    { name: 'refs/heads/fix/lane-layout', shortName: 'fix/lane-layout', type: 'local', sha: 'c', ahead: 1, behind: 0, date: 2 },
    { name: 'refs/heads/chore/release-0.1', shortName: 'chore/release-0.1', type: 'local', sha: 'd', ahead: 0, behind: 3, date: 1 },
  ],
  stashes: [
    'stash@{0}: WIP on main: 1a2b3c4 Polish toolbar layout',
    'stash@{1}: On feature/sidebar-polish: experiment with compact stats',
  ],
  worktrees: [
    { path: '/Users/geocat/Codes/git-killer', head: 'a1b2c3d4e5f6', branch: 'main', bare: false, detached: false, locked: false, prunable: false, isCurrent: true },
    { path: '/Users/geocat/Codes/git-killer-fix-lane-layout', head: 'c7d8e9f0a1b2', branch: 'fix/lane-layout', bare: false, detached: false, locked: false, prunable: false, isCurrent: false },
    { path: '/Users/geocat/Codes/git-killer-release', head: 'e5f6a7b8c9d0', bare: false, detached: true, locked: false, prunable: true, isCurrent: false },
  ],
  submodules: [
    { path: 'vendor/design-system', absolutePath: '/Users/geocat/Codes/git-killer/vendor/design-system', url: 'https://github.com/xiaozhu-eco/design-system.git', sha: 'abc1234', state: 'clean', describe: 'heads/main' },
    { path: 'vendor/icons', absolutePath: '/Users/geocat/Codes/git-killer/vendor/icons', url: 'https://github.com/xiaozhu-eco/icons.git', sha: 'def5678', state: 'modified', describe: 'v1.2.0' },
    { path: 'vendor/legacy', absolutePath: '/Users/geocat/Codes/git-killer/vendor/legacy', url: 'https://github.com/xiaozhu-eco/legacy.git', sha: '0123456', state: 'uninitialized' },
  ],
};

const sidebarHtml = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>Git Killer sidebar harness</title>
<link rel="stylesheet" href="../dist/sidebar.css" />
<style>
  html, body { height: 100%; margin: 0; }
  body {
    display: flex;
    justify-content: center;
    background: #1b1b1c;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  }
  #root {
    width: 320px;
    height: 100%;
    border-left: 1px solid #3c3c3c;
    border-right: 1px solid #3c3c3c;
  }
  :root {
    --vscode-editor-background: #1e1e1e;
    --vscode-foreground: #cccccc;
    --vscode-sideBar-background: #252526;
    --vscode-sideBarSectionHeader-background: #2b2b2c;
    --vscode-sideBarSectionHeader-border: #3c3c3c;
    --vscode-descriptionForeground: #9d9d9d;
    --vscode-panel-border: #3c3c3c;
    --vscode-list-hoverBackground: #2a2d2e;
    --vscode-list-inactiveSelectionBackground: #37373d;
    --vscode-list-activeSelectionBackground: #04395e;
    --vscode-list-activeSelectionForeground: #ffffff;
    --vscode-button-background: #0e639c;
    --vscode-button-foreground: #ffffff;
    --vscode-button-hoverBackground: #1177bb;
    --vscode-button-secondaryBackground: #3a3d41;
    --vscode-button-secondaryForeground: #ffffff;
    --vscode-button-secondaryHoverBackground: #4a4d51;
    --vscode-input-background: #3c3c3c;
    --vscode-input-foreground: #cccccc;
    --vscode-focusBorder: #007fd4;
    --vscode-badge-background: #4d4d4d;
    --vscode-badge-foreground: #ffffff;
    --vscode-icon-foreground: #c5c5c5;
    --vscode-toolbar-hoverBackground: #5a5d5e55;
    --vscode-textLink-foreground: #3794ff;
    --vscode-editorWidget-background: #2a2a2b;
    --vscode-editorWidget-border: #454545;
    --vscode-inputValidation-warningBackground: #352a05;
    --vscode-inputValidation-warningBorder: #b89500;
    --vscode-inputValidation-errorBackground: #5a1d1d;
    --vscode-editorWarning-foreground: #cca700;
    --vscode-errorForeground: #f48771;
    --vscode-charts-blue: #3794ff;
    --vscode-charts-green: #89d185;
    --vscode-charts-yellow: #cca700;
    --vscode-gitDecoration-addedResourceForeground: #81b88b;
    --vscode-gitDecoration-modifiedResourceForeground: #e2c08d;
    --vscode-gitDecoration-deletedResourceForeground: #c74e39;
    --vscode-scrollbarSlider-background: #79797966;
    --vscode-scrollbarSlider-hoverBackground: #646464b3;
    --vscode-dropdown-background: #3c3c3c;
    --vscode-dropdown-foreground: #cccccc;
  }
</style>
</head>
<body>
<div id="root"></div>
<script>
  window.__SIDEBAR__ = ${safe(sidebarState)};
  window.acquireVsCodeApi = () => ({
    postMessage(message) {
      window.__messages = window.__messages || [];
      window.__messages.push(message);
      if (message.type === 'ready') {
        setTimeout(() => {
          window.postMessage({ type: 'sidebar', state: window.__SIDEBAR__ }, '*');
        }, 20);
      }
    },
    getState() { return undefined; },
    setState() {},
  });
</script>
<script src="../dist/sidebar.js"></script>
</body>
</html>
`;

const sidebarOutput = path.join(process.cwd(), 'dev', 'sidebar-harness.html');
fs.writeFileSync(sidebarOutput, sidebarHtml, 'utf8');
console.log(`wrote ${sidebarOutput}`);
