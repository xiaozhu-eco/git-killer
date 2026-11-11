import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { runGit } from './executor';
import { GitRepository } from './repository';

interface BuiltinRepositoryState {
    onDidChange: vscode.Event<void>;
    HEAD?: { name?: string; commit?: string };
}

interface BuiltinRepository {
    rootUri: vscode.Uri;
    state: BuiltinRepositoryState;
}

interface BuiltinGitApi {
    readonly state: 'uninitialized' | 'initializing' | 'initialized';
    readonly repositories: BuiltinRepository[];
    readonly onDidChangeState: vscode.Event<void>;
    readonly onDidOpenRepository: vscode.Event<BuiltinRepository>;
    readonly onDidCloseRepository: vscode.Event<BuiltinRepository>;
}

interface GitExtensionExports {
    getAPI(version: 1): BuiltinGitApi;
}

const IGNORED_DIRS = new Set([
    'node_modules',
    '.git',
    'dist',
    'out',
    'build',
    'coverage',
    '.venv',
    'venv',
    '__pycache__',
    '.next',
    'target',
]);

export class RepositoryManager implements vscode.Disposable {
    private readonly repos = new Map<string, GitRepository>();
    private readonly repoWatchers = new Map<string, vscode.Disposable[]>();
    private readonly changeTimers = new Map<string, NodeJS.Timeout>();
    private readonly disposables: vscode.Disposable[] = [];
    private readonly _onDidChangeRepo = new vscode.EventEmitter<string>();
    private readonly _onDidChangeRepos = new vscode.EventEmitter<void>();
    private builtin?: BuiltinGitApi;
    private pollTimer?: NodeJS.Timeout;
    private headFingerprints = new Map<string, string>();
    private activeRoot: string | undefined;

    readonly onDidChangeRepo = this._onDidChangeRepo.event;
    readonly onDidChangeRepos = this._onDidChangeRepos.event;

    constructor(private readonly state: vscode.Memento) {
        this.activeRoot = state.get<string>('gitKiller.activeRepo');
    }

    async initialize(): Promise<void> {
        await this.connectBuiltinGit();
        if (this.repos.size === 0) {
            await this.discoverFromWorkspace();
        }
        if (this.repos.size === 0) {
            await this.discoverFromActiveFile();
        }
        this.pickActiveRoot();
        this.disposables.push(
            vscode.workspace.onDidChangeWorkspaceFolders(() => void this.discoverFromWorkspace())
        );
        if (!this.builtin) {
            this.startPolling();
        }
    }

    getRepos(): GitRepository[] {
        return [...this.repos.values()].sort((a, b) => a.name.localeCompare(b.name));
    }

    getByRoot(root: string): GitRepository | undefined {
        return this.repos.get(path.resolve(root));
    }

    getActive(): GitRepository | undefined {
        const active = this.activeRoot ? this.repos.get(this.activeRoot) : undefined;
        return active ?? this.getRepos()[0];
    }

    setActive(root: string): void {
        const repo = this.getByRoot(root);
        if (!repo) {
            return;
        }
        if (this.activeRoot !== repo.root) {
            this.activeRoot = repo.root;
            void this.state.update('gitKiller.activeRepo', repo.root);
            this._onDidChangeRepos.fire();
            this._onDidChangeRepo.fire(repo.root);
        }
    }

    notifyChanged(root: string): void {
        this._onDidChangeRepo.fire(path.resolve(root));
    }

    getRepoForUri(uri: vscode.Uri): GitRepository | undefined {
        if (uri.scheme !== 'file') {
            return undefined;
        }
        let best: GitRepository | undefined;
        for (const repo of this.repos.values()) {
            const relative = path.relative(repo.root, uri.fsPath);
            if (!relative.startsWith('..') && !path.isAbsolute(relative)) {
                if (!best || repo.root.length > best.root.length) {
                    best = repo;
                }
            }
        }
        return best;
    }

    async resolveRepo(uri: vscode.Uri): Promise<GitRepository | undefined> {
        const known = this.getRepoForUri(uri);
        if (known) {
            return known;
        }
        if (uri.scheme !== 'file') {
            return undefined;
        }
        try {
            const cwd = path.dirname(uri.fsPath);
            const output = await runGit(['rev-parse', '--show-toplevel'], { cwd, readOnly: true });
            return this.addRepo(output.trim());
        } catch {
            return undefined;
        }
    }

    addRepo(root: string): GitRepository {
        const normalized = path.resolve(root);
        const existing = this.repos.get(normalized);
        if (existing) {
            return existing;
        }
        const repo = new GitRepository(normalized);
        this.repos.set(normalized, repo);
        this.headFingerprints.set(normalized, '');
        void this.watchRepo(normalized);
        this._onDidChangeRepos.fire();
        return repo;
    }

    private async connectBuiltinGit(): Promise<void> {
        const extension = vscode.extensions.getExtension<GitExtensionExports>('vscode.git');
        if (!extension) {
            return;
        }
        try {
            const exports = extension.isActive ? extension.exports : await extension.activate();
            const api = exports.getAPI(1);
            this.builtin = api;

            const sync = () => {
                for (const repo of api.repositories) {
                    this.addRepo(repo.rootUri.fsPath);
                    this.subscribeBuiltinRepo(repo);
                }
                this.pickActiveRoot();
            };

            sync();
            this.disposables.push(api.onDidChangeState(() => sync()));
            this.disposables.push(api.onDidOpenRepository(repo => {
                this.addRepo(repo.rootUri.fsPath);
                this.subscribeBuiltinRepo(repo);
            }));
            this.disposables.push(api.onDidCloseRepository(repo => {
                const root = path.resolve(repo.rootUri.fsPath);
                this.repos.delete(root);
                this.headFingerprints.delete(root);
                this.disposeWatchers(root);
                this._onDidChangeRepos.fire();
            }));
        } catch {
            this.builtin = undefined;
        }
    }

    private readonly builtinSubscriptions = new Set<string>();

    private subscribeBuiltinRepo(repo: BuiltinRepository): void {
        const root = path.resolve(repo.rootUri.fsPath);
        if (this.builtinSubscriptions.has(root)) {
            return;
        }
        this.builtinSubscriptions.add(root);
        this.disposables.push(
            repo.state.onDidChange(() => this.scheduleChange(root))
        );
    }

    private async discoverFromWorkspace(): Promise<void> {
        const folders = vscode.workspace.workspaceFolders ?? [];
        await Promise.all(
            folders.map(async folder => {
                const topLevel = await runGit(['rev-parse', '--show-toplevel'], {
                    cwd: folder.uri.fsPath,
                    readOnly: true,
                }).catch(() => undefined);
                if (topLevel?.trim()) {
                    this.addRepo(topLevel.trim());
                    return;
                }
                const found = await this.scanForRepositories(folder.uri.fsPath, 0);
                found.forEach(root => this.addRepo(root));
            })
        );
        if (this.repos.size > 0) {
            this.pickActiveRoot();
        }
    }

    private async discoverFromActiveFile(): Promise<void> {
        const uri = vscode.window.activeTextEditor?.document.uri;
        if (uri) {
            await this.resolveRepo(uri);
        }
    }

    private async scanForRepositories(dir: string, depth: number): Promise<string[]> {
        if (depth > 2) {
            return [];
        }
        const found: string[] = [];
        try {
            await fs.stat(path.join(dir, '.git'));
            found.push(dir);
            return found;
        } catch {
            // not a repository root, keep looking
        }
        let entries;
        try {
            entries = await fs.readdir(dir, { withFileTypes: true });
        } catch {
            return found;
        }
        for (const entry of entries) {
            if (!entry.isDirectory() || entry.name.startsWith('.') || IGNORED_DIRS.has(entry.name)) {
                continue;
            }
            found.push(...(await this.scanForRepositories(path.join(dir, entry.name), depth + 1)));
        }
        return found;
    }

    private pickActiveRoot(): void {
        if (this.activeRoot && this.repos.has(this.activeRoot)) {
            return;
        }
        const first = this.getRepos()[0];
        this.activeRoot = first?.root;
        if (first) {
            void this.state.update('gitKiller.activeRepo', first.root);
        }
    }

    private scheduleChange(root: string): void {
        const existing = this.changeTimers.get(root);
        if (existing) {
            clearTimeout(existing);
        }
        const timer = setTimeout(() => {
            this.changeTimers.delete(root);
            if (vscode.workspace.getConfiguration('gitKiller').get<boolean>('autoRefresh', true)) {
                this._onDidChangeRepo.fire(root);
            }
        }, 180);
        this.changeTimers.set(root, timer);
    }

    private async watchRepo(root: string): Promise<void> {
        if (this.repoWatchers.has(root)) {
            return;
        }
        const repo = this.repos.get(root);
        if (!repo) {
            return;
        }
        const watchers: vscode.Disposable[] = [];
        try {
            const gitDir = await repo.gitDir();
            const patterns = ['HEAD', 'index', 'refs/**', 'packed-refs', 'MERGE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD'];
            for (const pattern of patterns) {
                const watcher = vscode.workspace.createFileSystemWatcher(
                    new vscode.RelativePattern(vscode.Uri.file(gitDir), pattern)
                );
                watchers.push(watcher, watcher.onDidChange(() => this.scheduleChange(root)));
                watchers.push(watcher.onDidCreate(() => this.scheduleChange(root)));
                watchers.push(watcher.onDidDelete(() => this.scheduleChange(root)));
            }
        } catch {
            // ignore
        }
        this.repoWatchers.set(root, watchers);
    }

    private disposeWatchers(root: string): void {
        const watchers = this.repoWatchers.get(root);
        if (watchers) {
            watchers.forEach(watcher => watcher.dispose());
            this.repoWatchers.delete(root);
        }
    }

    private startPolling(): void {
        this.pollTimer = setInterval(() => {
            void this.pollHeads();
        }, 5000);
        this.disposables.push({
            dispose: () => {
                if (this.pollTimer) {
                    clearInterval(this.pollTimer);
                }
            },
        });
    }

    private async pollHeads(): Promise<void> {
        if (this.builtin) {
            return;
        }
        for (const repo of this.repos.values()) {
            try {
                const head = await repo.head();
                const fingerprint = `${head.branch ?? ''}:${head.sha ?? ''}`;
                const previous = this.headFingerprints.get(repo.root);
                this.headFingerprints.set(repo.root, fingerprint);
                if (previous && previous !== fingerprint) {
                    this.scheduleChange(repo.root);
                }
            } catch {
                // ignore
            }
        }
    }

    dispose(): void {
        this.changeTimers.forEach(timer => clearTimeout(timer));
        this.changeTimers.clear();
        this.repoWatchers.forEach(watchers => watchers.forEach(watcher => watcher.dispose()));
        this.repoWatchers.clear();
        this.disposables.forEach(disposable => disposable.dispose());
        this._onDidChangeRepo.dispose();
        this._onDidChangeRepos.dispose();
    }
}
