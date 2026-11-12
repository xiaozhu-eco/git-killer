import * as path from 'node:path';
import * as vscode from 'vscode';
import type { GitContentProvider } from '../contentProvider';
import { openFileDiff } from '../diff';
import * as ops from '../git/operations';
import type { GitRepository } from '../git/repository';
import type { RepositoryManager } from '../git/repositoryManager';
import { showFileHistory } from '../editor/history';
import { confirmDestructive, showGitError, withProgress } from '../output';
import type {
    CommitDetails,
    GraphFilter,
    GraphRow,
    HostToWebview,
    RefSummary,
    RepoState,
    RepoSummary,
    WebviewToHost,
} from '../protocol';
import { computeLayout } from './laneLayout';
import { getWebviewHtml } from './webviewHtml';

export interface GraphPanelDeps {
    extensionUri: vscode.Uri;
    manager: RepositoryManager;
    provider: GitContentProvider;
}

function shortSha(sha: string): string {
    return sha.slice(0, 8);
}

export class GraphPanel implements vscode.Disposable {
    private static readonly panels = new Map<string, GraphPanel>();

    private readonly disposables: vscode.Disposable[] = [];
    private readonly detailsCache = new Map<string, CommitDetails>();
    private repo: GitRepository;
    private maxCount: number;
    private filter: GraphFilter = { scope: 'all', text: '' };
    private lastRefs: RefSummary[] = [];
    private refreshToken = 0;
    private exhausted = false;
    private disposed = false;
    private webviewReady = false;
    private pendingCommit?: string;
    private pendingCompare?: [string, string];
    private pendingRebase?: string;
    private detailsToken = 0;

    static open(deps: GraphPanelDeps, root?: string): GraphPanel | undefined {
        const repo = root ? deps.manager.getByRoot(root) : deps.manager.getActive();
        if (!repo) {
            void vscode.window.showInformationMessage('No Git repository found in this workspace.');
            return undefined;
        }
        const existing = GraphPanel.panels.get(repo.root);
        if (existing) {
            existing.panel.reveal(undefined, false);
            return existing;
        }
        const panel = vscode.window.createWebviewPanel(
            'gitKiller.graph',
            `Git Killer — ${repo.name}`,
            { viewColumn: vscode.ViewColumn.Active, preserveFocus: false },
            {
                enableScripts: true,
                retainContextWhenHidden: false,
                localResourceRoots: [vscode.Uri.joinPath(deps.extensionUri, 'dist')],
            }
        );
        return new GraphPanel(panel, repo, deps);
    }

    static revive(panel: vscode.WebviewPanel, deps: GraphPanelDeps): GraphPanel | undefined {
        const repo = deps.manager.getActive();
        if (!repo) {
            panel.dispose();
            return undefined;
        }
        return new GraphPanel(panel, repo, deps);
    }

    static openAtCommit(deps: GraphPanelDeps, sha: string, root?: string): void {
        const panel = GraphPanel.open(deps, root);
        if (panel) {
            void panel.showCommit(sha, true, true);
        }
    }

    static openCompare(deps: GraphPanelDeps, a: string, b: string, root?: string): void {
        const panel = GraphPanel.open(deps, root);
        if (panel) {
            void panel.showCompare(a, b, true);
        }
    }

    static refreshAll(): void {
        for (const panel of GraphPanel.panels.values()) {
            void panel.refresh();
        }
    }

    private constructor(
        private readonly panel: vscode.WebviewPanel,
        repo: GitRepository,
        private readonly deps: GraphPanelDeps
    ) {
        this.repo = repo;
        this.maxCount = this.pageSize;

        const webview = this.panel.webview;
        webview.options = {
            enableScripts: true,
            localResourceRoots: [vscode.Uri.joinPath(deps.extensionUri, 'dist')],
        };
        this.panel.iconPath = vscode.Uri.joinPath(deps.extensionUri, 'media', 'graph.svg');

        this.disposables.push(
            webview.onDidReceiveMessage(message => void this.onMessage(message as WebviewToHost)),
            this.panel.onDidDispose(() => this.dispose()),
            deps.manager.onDidChangeRepo(root => {
                if (root === this.repo.root) {
                    void this.refresh();
                }
            }),
            deps.manager.onDidChangeRepos(() => {
                this.post({ type: 'repos', repos: this.repoSummaries(), active: this.repo.root });
            })
        );

        webview.html = getWebviewHtml(webview, deps.extensionUri, {
            title: this.panel.title,
            script: 'webview.js',
            style: 'webview.css',
        });

        GraphPanel.panels.set(repo.root, this);
    }

    private get pageSize(): number {
        return vscode.workspace.getConfiguration('gitKiller').get<number>('maxCommits', 100);
    }

    private post(message: HostToWebview): void {
        if (!this.disposed) {
            void this.panel.webview.postMessage(message);
        }
    }

    private async refresh(): Promise<void> {
        const token = ++this.refreshToken;
        this.post({ type: 'busy', busy: true, label: 'Loading commits…' });
        try {
            const state = await this.buildState();
            if (this.disposed || token !== this.refreshToken) {
                return;
            }
            this.post({ type: 'state', state });
            this.post({ type: 'repos', repos: this.repoSummaries(), active: this.repo.root });
        } catch (error) {
            if (!this.disposed && token === this.refreshToken) {
                this.post({
                    type: 'toast',
                    kind: 'error',
                    message: error instanceof Error ? error.message : String(error),
                });
            }
        } finally {
            if (!this.disposed && token === this.refreshToken) {
                this.post({ type: 'busy', busy: false });
            }
        }
    }

    private async buildState(): Promise<RepoState> {
        const config = vscode.workspace.getConfiguration('gitKiller');
        const head = await this.repo.head();
        const titleBranch = head.branch
            ? ` (${head.branch})`
            : head.detached && head.sha
                ? ` (detached ${shortSha(head.sha)})`
                : '';
        this.panel.title = `Git Killer — ${this.repo.name}${titleBranch}`;
        const [refs, status, operation, commits] = await Promise.all([
            this.repo.refs(),
            this.repo.status(),
            this.repo.operation(),
            this.repo.log({ maxCount: this.maxCount, filter: this.filter }),
        ]);
        this.lastRefs = refs;

        const showRemote = config.get<boolean>('graph.showRemoteBranches', true);
        const showTags = config.get<boolean>('graph.showTags', true);
        const refMap = new Map<string, RefSummary[]>();
        const addRef = (ref: RefSummary) => {
            const list = refMap.get(ref.sha) ?? [];
            list.push(ref);
            refMap.set(ref.sha, list);
        };

        for (const ref of refs) {
            if (ref.type === 'stash' || ref.type === 'other') {
                continue;
            }
            if (!showRemote && ref.type === 'remote') {
                continue;
            }
            if (!showTags && ref.type === 'tag') {
                continue;
            }
            addRef(ref);
        }

        const layout = computeLayout(commits);
        this.exhausted = commits.length < this.maxCount;
        const rows: GraphRow[] = commits.map((commit, index) => {
            const lane = layout[index];
            return {
                sha: commit.sha,
                parents: commit.parents,
                subject: commit.subject,
                author: commit.author,
                authorEmail: commit.authorEmail,
                authorTime: commit.authorTime,
                refs: refMap.get(commit.sha) ?? [],
                isHead: commit.sha === head.sha,
                lane: lane.lane,
                color: lane.color,
                edges: lane.edges,
                laneCount: lane.laneCount,
            };
        });

        return {
            root: this.repo.root,
            name: this.repo.name,
            head,
            status,
            rows,
            hasMore: !this.exhausted,
            filter: this.filter,
            operation,
            ui: {
                rowHeight: config.get<number>('graph.rowHeight', 24),
                laneWidth: config.get<number>('graph.laneWidth', 14),
            },
        };
    }

    private repoSummaries(): RepoSummary[] {
        return this.deps.manager.getRepos().map(repo => ({
            root: repo.root,
            name: repo.name,
        }));
    }

    private async getDetails(sha: string): Promise<CommitDetails> {
        const cached = this.detailsCache.get(sha);
        if (cached) {
            return cached;
        }
        const refs = this.lastRefs.filter(ref => ref.sha === sha);
        const details = await this.repo.commitDetails(sha, refs);
        if (this.detailsCache.size > 50) {
            this.detailsCache.clear();
        }
        this.detailsCache.set(sha, details);
        return details;
    }

    private async showCommit(sha: string, reveal = false, selectRow = false): Promise<void> {
        if (!this.webviewReady) {
            this.pendingCommit = sha;
            this.pendingCompare = undefined;
            if (reveal) {
                this.panel.reveal(undefined, false);
            }
            return;
        }
        const token = ++this.detailsToken;
        try {
            const details = await this.getDetails(sha);
            if (token !== this.detailsToken || this.disposed) {
                return;
            }
            this.post({ type: 'details', commit: details });
            if (selectRow) {
                this.post({ type: 'select', sha });
            }
            if (reveal) {
                this.panel.reveal(undefined, false);
            }
        } catch (error) {
            if (token === this.detailsToken) {
                this.post({ type: 'toast', kind: 'error', message: error instanceof Error ? error.message : String(error) });
            }
        }
    }

    private async showCompare(a: string, b: string, reveal = false): Promise<void> {
        if (!this.webviewReady) {
            this.pendingCompare = [a, b];
            this.pendingCommit = undefined;
            if (reveal) {
                this.panel.reveal(undefined, false);
            }
            return;
        }
        const token = ++this.detailsToken;
        try {
            const files = await this.repo.compare(a, b);
            if (token !== this.detailsToken || this.disposed) {
                return;
            }
            this.post({ type: 'details', compare: { a, b, files } });
            if (reveal) {
                this.panel.reveal(undefined, false);
            }
        } catch (error) {
            if (token === this.detailsToken) {
                this.post({ type: 'toast', kind: 'error', message: error instanceof Error ? error.message : String(error) });
            }
        }
    }

    async showRebaseTodo(base: string): Promise<void> {
        if (!this.webviewReady) {
            this.pendingRebase = base;
            this.panel.reveal(undefined, false);
            return;
        }
        try {
            if (!(await this.repo.isAncestor(base))) {
                this.post({
                    type: 'toast',
                    kind: 'warn',
                    message: 'Choose a commit that is an ancestor of the current HEAD.',
                });
                return;
            }
            const commits = await this.repo.commitsAfter(base);
            if (commits.length === 0) {
                this.post({
                    type: 'toast',
                    kind: 'warn',
                    message: 'No commits found after that base commit.',
                });
                return;
            }
            this.post({
                type: 'rebaseTodo',
                base,
                items: commits.map(commit => ({
                    sha: commit.sha,
                    subject: commit.subject,
                    action: 'pick' as const,
                })),
            });
            this.panel.reveal(undefined, false);
        } catch (error) {
            showGitError(error);
        }
    }

    private async runOperation(title: string, task: () => Promise<void>): Promise<void> {
        try {
            await withProgress(title, task);
            this.deps.provider.invalidate();
            this.deps.manager.notifyChanged(this.repo.root);
            this.post({ type: 'toast', kind: 'info', message: title });
        } catch (error) {
            showGitError(error);
        }
    }

    private switchRepo(root: string): void {
        if (root === this.repo.root) {
            return;
        }
        const existing = GraphPanel.panels.get(root);
        if (existing && existing !== this) {
            existing.panel.reveal(undefined, false);
            this.panel.dispose();
            return;
        }
        const repo = this.deps.manager.getByRoot(root);
        if (!repo) {
            return;
        }
        GraphPanel.panels.delete(this.repo.root);
        this.deps.manager.setActive(root);
        this.repo = repo;
        GraphPanel.panels.set(root, this);
        this.panel.title = `Git Killer — ${repo.name}`;
        this.filter = { scope: 'all', text: '' };
        this.maxCount = this.pageSize;
        this.detailsCache.clear();
        void this.refresh();
    }

    private async onMessage(message: WebviewToHost): Promise<void> {
        try {
            switch (message.type) {
                case 'ready':
                    this.webviewReady = true;
                    await this.refresh();
                    if (this.pendingCompare) {
                        const [a, b] = this.pendingCompare;
                        this.pendingCompare = undefined;
                        await this.showCompare(a, b);
                    } else if (this.pendingCommit) {
                        const sha = this.pendingCommit;
                        this.pendingCommit = undefined;
                        await this.showCommit(sha, false, true);
                    } else if (this.pendingRebase) {
                        const base = this.pendingRebase;
                        this.pendingRebase = undefined;
                        await this.showRebaseTodo(base);
                    }
                    break;
                case 'refresh':
                    this.maxCount = this.pageSize;
                    await this.refresh();
                    break;
                case 'loadMore':
                    this.maxCount += this.pageSize;
                    await this.refresh();
                    break;
                case 'selectCommit':
                    await this.showCommit(message.sha);
                    break;
                case 'compare':
                    await this.showCompare(message.a, message.b);
                    break;
                case 'clearSelection':
                    this.detailsToken += 1;
                    this.post({ type: 'details' });
                    break;
                case 'openFileDiff':
                    await openFileDiff(
                        this.repo,
                        this.deps.provider,
                        message.from,
                        message.to,
                        message.file
                    );
                    break;
                case 'setFilter':
                    this.filter = message.filter;
                    this.maxCount = this.pageSize;
                    await this.refresh();
                    break;
                case 'setRepo':
                    this.switchRepo(message.root);
                    break;
                case 'switchBranch':
                    await vscode.commands.executeCommand('gitKiller.switchBranch', this.repo.root);
                    break;
                case 'merge':
                    await vscode.commands.executeCommand('gitKiller.merge', this.repo.root);
                    break;
                case 'rebase':
                    await vscode.commands.executeCommand('gitKiller.rebase', this.repo.root);
                    break;
                case 'checkout':
                    await this.runOperation(`Checkout ${shortSha(message.sha)} (detached HEAD)`, () =>
                        ops.checkoutCommit(this.repo, message.sha)
                    );
                    break;
                case 'createBranchAt': {
                    const head = await this.repo.head();
                    const name = await vscode.window.showInputBox({
                        prompt: `Create a branch at ${shortSha(message.sha)} ${head.branch ? `while on ${head.branch}` : 'while HEAD is detached'
                            }`,
                        placeHolder: 'branch-name',
                        validateInput: value =>
                            value.trim().length === 0 ? 'Branch name is required' : undefined,
                    });
                    if (!name) {
                        return;
                    }
                    const choice = await vscode.window.showQuickPick(
                        ['Create and switch', 'Create without switching'],
                        {
                            placeHolder: `After creating ${name.trim()} (current: ${head.branch ?? 'detached HEAD'
                                })`,
                        }
                    );
                    if (!choice) {
                        return;
                    }
                    await this.runOperation(
                        `Create branch ${name.trim()} at ${shortSha(message.sha)}`,
                        () =>
                            ops.createBranch(
                                this.repo,
                                name.trim(),
                                message.sha,
                                choice === 'Create and switch'
                            )
                    );
                    break;
                }
                case 'createTagAt': {
                    const name = await vscode.window.showInputBox({
                        prompt: `Create tag at ${shortSha(message.sha)}`,
                        placeHolder: 'v1.0.0',
                        validateInput: value => (value.trim().length === 0 ? 'Tag name is required' : undefined),
                    });
                    if (!name) {
                        return;
                    }
                    const messageText = await vscode.window.showInputBox({
                        prompt: 'Tag message (optional)',
                        placeHolder: 'Leave empty for a lightweight tag',
                    });
                    await this.runOperation(
                        `Create tag ${name.trim()} at ${shortSha(message.sha)}`,
                        () =>
                            ops.createTag(
                                this.repo,
                                name.trim(),
                                message.sha,
                                messageText?.trim() || undefined
                            )
                    );
                    break;
                }
                case 'cherryPick': {
                    const head = await this.repo.head();
                    const branch = head.branch ?? 'HEAD';
                    await this.runOperation(
                        `Cherry-pick ${shortSha(message.sha)} onto ${branch}`,
                        () => ops.cherryPick(this.repo, message.sha)
                    );
                    break;
                }
                case 'revert': {
                    const head = await this.repo.head();
                    const branch = head.branch ?? 'HEAD';
                    await this.runOperation(`Revert ${shortSha(message.sha)} on ${branch}`, () =>
                        ops.revert(this.repo, message.sha)
                    );
                    break;
                }
                case 'reset': {
                    const head = await this.repo.head();
                    const branch = head.branch ?? 'HEAD';
                    const picked = await vscode.window.showQuickPick(
                        [
                            { label: 'Soft', description: 'Move HEAD only, keep index and working tree', mode: 'soft' as const },
                            { label: 'Mixed', description: 'Move HEAD and reset index, keep working tree', mode: 'mixed' as const },
                            { label: 'Hard', description: 'Discard all changes', mode: 'hard' as const },
                        ],
                        { placeHolder: `Reset ${branch} to ${shortSha(message.sha)}` }
                    );
                    if (!picked) {
                        return;
                    }
                    if (
                        picked.mode === 'hard' &&
                        !(await confirmDestructive(
                            'Reset --hard?',
                            `This discards all working tree changes and moves ${branch} to ${shortSha(message.sha)}.`
                        ))
                    ) {
                        return;
                    }
                    await this.runOperation(`Reset ${branch} to ${shortSha(message.sha)} (${picked.mode})`, () =>
                        ops.reset(this.repo, message.sha, picked.mode)
                    );
                    break;
                }
                case 'copy':
                    await vscode.env.clipboard.writeText(message.text);
                    this.post({ type: 'toast', kind: 'info', message: 'Copied to clipboard' });
                    break;
                case 'commit': {
                    if (!message.message.trim() && !message.amend) {
                        this.post({ type: 'toast', kind: 'warn', message: 'Commit message is required' });
                        return;
                    }
                    await withProgress('Committing', () =>
                        ops.commit(this.repo, message.message.trim(), {
                            amend: message.amend,
                            all: message.all,
                        })
                    );
                    this.deps.provider.invalidate();
                    this.post({ type: 'committed' });
                    const branch = (await this.repo.head()).branch ?? 'HEAD';
                    this.post({
                        type: 'toast',
                        kind: 'info',
                        message: message.amend ? `Amended ${branch}` : `Committed to ${branch}`,
                    });
                    this.deps.manager.notifyChanged(this.repo.root);
                    break;
                }
                case 'fetch':
                    await this.runOperation('Fetch all remotes', () => ops.fetchAll(this.repo));
                    break;
                case 'pull': {
                    const head = await this.repo.head();
                    await this.runOperation(`Pull ${head.branch ?? 'HEAD'}`, () => ops.pull(this.repo));
                    break;
                }
                case 'push': {
                    const head = await this.repo.head();
                    await this.runOperation(`Push ${head.branch ?? 'HEAD'}`, () => ops.push(this.repo));
                    break;
                }
                case 'stashPush': {
                    const head = await this.repo.head();
                    await this.runOperation(`Stash changes on ${head.branch ?? 'HEAD'}`, () =>
                        ops.stashPush(this.repo)
                    );
                    break;
                }
                case 'stashPop':
                    await this.runOperation(`Pop stash@{${message.index ?? 0}}`, () =>
                        ops.stashPop(this.repo, message.index ?? 0)
                    );
                    break;
                case 'interactiveRebase':
                    await this.showRebaseTodo(message.base);
                    break;
                case 'runInteractiveRebase': {
                    const kept = message.items.filter(item => item.action !== 'drop');
                    if (kept.length === 0) {
                        this.post({ type: 'toast', kind: 'warn', message: 'Every commit would be dropped' });
                        return;
                    }
                    try {
                        await withProgress('Interactive rebase', () =>
                            ops.interactiveRebase(this.repo, message.base, message.items)
                        );
                        this.post({
                            type: 'toast',
                            kind: 'info',
                            message: `Rebase onto ${shortSha(message.base)} completed`,
                        });
                    } catch (error) {
                        showGitError(error);
                    } finally {
                        this.deps.provider.invalidate();
                        this.deps.manager.notifyChanged(this.repo.root);
                    }
                    break;
                }
                case 'continueOperation': {
                    const operation = await this.repo.operation();
                    if (!operation) {
                        this.post({ type: 'toast', kind: 'warn', message: 'No operation in progress' });
                        return;
                    }
                    await this.runOperation(`Continuing ${operation.kind}`, () =>
                        ops.continueOperation(this.repo, operation.kind)
                    );
                    break;
                }
                case 'abortOperation': {
                    const operation = await this.repo.operation();
                    if (!operation) {
                        this.post({ type: 'toast', kind: 'warn', message: 'No operation in progress' });
                        return;
                    }
                    if (
                        !(await confirmDestructive(
                            `Abort ${operation.kind}?`,
                            'Any conflict resolution done so far will be lost.'
                        ))
                    ) {
                        return;
                    }
                    await this.runOperation(`Aborting ${operation.kind}`, () =>
                        ops.abortOperation(this.repo, operation.kind)
                    );
                    break;
                }
                case 'showFileHistory':
                    await showFileHistory(
                        this.deps.manager,
                        this.deps.provider,
                        vscode.Uri.file(path.join(this.repo.root, message.file))
                    );
                    break;
                case 'openGraph':
                    break;
                default:
                    break;
            }
        } catch (error) {
            showGitError(error);
        }
    }

    dispose(): void {
        if (this.disposed) {
            return;
        }
        this.disposed = true;
        GraphPanel.panels.delete(this.repo.root);
        this.disposables.forEach(disposable => disposable.dispose());
        this.detailsCache.clear();
    }
}
