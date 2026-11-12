export type RefType = 'head' | 'local' | 'remote' | 'tag' | 'stash' | 'other';

export interface RefSummary {
    /** Full ref name, e.g. refs/heads/main, or "HEAD" for a detached head. */
    name: string;
    /** Display name, e.g. main, origin/main, v1.0. */
    shortName: string;
    type: RefType;
    sha: string;
    upstream?: string;
    ahead?: number;
    behind?: number;
    date?: number;
}

export interface LaneEdge {
    from: number;
    to: number;
    color: number;
    /** Where the segment starts: the top edge of the row, or the commit dot. */
    fromAnchor: 'top' | 'dot';
    /** Where the segment ends: the bottom edge of the row, or the commit dot. */
    toAnchor: 'bottom' | 'dot';
}

export interface GraphRow {
    sha: string;
    parents: string[];
    subject: string;
    author: string;
    authorEmail: string;
    authorTime: number;
    refs: RefSummary[];
    isHead: boolean;
    lane: number;
    color: number;
    edges: LaneEdge[];
    laneCount: number;
}

export interface StatusSummary {
    branch?: string;
    upstream?: string;
    ahead: number;
    behind: number;
    staged: number;
    unstaged: number;
    untracked: number;
    conflicted: number;
}

export interface HeadInfo {
    sha?: string;
    branch?: string;
    detached: boolean;
}

export interface GraphFilter {
    scope: 'all' | 'current';
    text: string;
}

export interface OperationInfo {
    kind: 'rebase' | 'merge' | 'cherry-pick' | 'revert';
    conflicted: number;
}

export type RebaseAction = 'pick' | 'squash' | 'fixup' | 'drop';

export interface RebaseTodoItem {
    sha: string;
    subject: string;
    action: RebaseAction;
}

export interface GraphUiSettings {
    rowHeight: number;
    laneWidth: number;
}

export interface RepoState {
    root: string;
    name: string;
    head: HeadInfo;
    status: StatusSummary;
    rows: GraphRow[];
    hasMore: boolean;
    filter: GraphFilter;
    operation: OperationInfo | null;
    ui: GraphUiSettings;
}

export interface RepoSummary {
    root: string;
    name: string;
    sha?: string;
    branch?: string;
}

export type FileStatus = 'A' | 'M' | 'D' | 'R' | 'C' | 'T' | 'U' | '?';

export interface FileChange {
    path: string;
    oldPath?: string;
    status: FileStatus;
    additions: number;
    deletions: number;
    binary: boolean;
}

export interface CommitDetails {
    sha: string;
    parents: string[];
    author: string;
    authorEmail: string;
    authorTime: number;
    committer: string;
    committerEmail: string;
    committerTime: number;
    refs: RefSummary[];
    subject: string;
    body: string;
    files: FileChange[];
}

export interface CompareDetails {
    a: string;
    b: string;
    files: FileChange[];
}

export interface WorktreeInfo {
    path: string;
    head?: string;
    branch?: string;
    bare: boolean;
    detached: boolean;
    locked: boolean;
    prunable: boolean;
    isCurrent: boolean;
}

export type SubmoduleState = 'clean' | 'modified' | 'uninitialized' | 'conflict';

export interface SubmoduleInfo {
    path: string;
    /** Absolute path of the submodule working directory. */
    absolutePath: string;
    url?: string;
    sha?: string;
    state: SubmoduleState;
    /** Description from `git submodule status`, e.g. "heads/main" or "v1.2-3-gabc". */
    describe?: string;
}

export interface SidebarState {
    repos: RepoSummary[];
    active?: string;
    branch?: string;
    upstream?: string;
    detached: boolean;
    ahead: number;
    behind: number;
    staged: number;
    unstaged: number;
    untracked: number;
    conflicted: number;
    operation: OperationInfo | null;
    branches: RefSummary[];
    stashes: string[];
    worktrees: WorktreeInfo[];
    submodules: SubmoduleInfo[];
}

export type HostToWebview =
    | { type: 'state'; state: RepoState }
    | { type: 'repos'; repos: RepoSummary[]; active: string }
    | { type: 'details'; commit?: CommitDetails; compare?: CompareDetails }
    | { type: 'select'; sha: string }
    | { type: 'committed' }
    | { type: 'rebaseTodo'; base: string; items: RebaseTodoItem[] }
    | { type: 'busy'; busy: boolean; label?: string }
    | { type: 'toast'; kind: 'info' | 'warn' | 'error'; message: string }
    | { type: 'sidebar'; state: SidebarState };
export type WebviewToHost =
    | { type: 'ready' }
    | { type: 'refresh' }
    | { type: 'loadMore' }
    | { type: 'selectCommit'; sha: string }
    | { type: 'compare'; a: string; b: string }
    | { type: 'clearSelection' }
    | { type: 'openFileDiff'; from: string; to: string; file: string }
    | { type: 'setFilter'; filter: GraphFilter }
    | { type: 'setRepo'; root: string }
    | { type: 'switchBranch' }
    | { type: 'merge' }
    | { type: 'rebase' }
    | { type: 'createBranchAt'; sha: string }
    | { type: 'createTagAt'; sha: string }
    | { type: 'checkout'; sha: string }
    | { type: 'cherryPick'; sha: string }
    | { type: 'revert'; sha: string }
    | { type: 'reset'; sha: string }
    | { type: 'copy'; text: string }
    | { type: 'commit'; message: string; amend: boolean; all: boolean }
    | { type: 'interactiveRebase'; base: string }
    | { type: 'runInteractiveRebase'; base: string; items: RebaseTodoItem[] }
    | { type: 'fetch' }
    | { type: 'pull' }
    | { type: 'push' }
    | { type: 'stashPush' }
    | { type: 'stashPop'; index?: number }
    | { type: 'checkoutBranch'; name: string }
    | { type: 'continueOperation' }
    | { type: 'abortOperation' }
    | { type: 'worktreeAdd' }
    | { type: 'worktreeOpen'; path: string }
    | { type: 'worktreeRemove'; path: string }
    | { type: 'worktreePrune' }
    | { type: 'submoduleUpdate'; path?: string }
    | { type: 'submoduleSync'; path?: string }
    | { type: 'openSubmoduleGraph'; path: string }
    | { type: 'openGraph' }
    | { type: 'showFileHistory'; sha: string; file: string };
