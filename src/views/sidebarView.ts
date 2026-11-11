import * as vscode from 'vscode';
import type { RepositoryManager } from '../git/repositoryManager';
import type { SidebarState, WebviewToHost } from '../protocol';
import { getWebviewHtml } from '../graph/webviewHtml';

export class SidebarViewProvider implements vscode.WebviewViewProvider, vscode.Disposable {
    static readonly viewType = 'gitKiller.sidebar';

    private view?: vscode.WebviewView;
    private readonly disposables: vscode.Disposable[] = [];

    constructor(
        private readonly extensionUri: vscode.Uri,
        private readonly manager: RepositoryManager
    ) {
        this.disposables.push(
            manager.onDidChangeRepo(() => void this.refresh()),
            manager.onDidChangeRepos(() => void this.refresh())
        );
    }

    resolveWebviewView(view: vscode.WebviewView): void {
        this.view = view;
        view.webview.options = {
            enableScripts: true,
            localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'dist')],
        };
        this.disposables.push(
            view.webview.onDidReceiveMessage((message: WebviewToHost) => void this.onMessage(message)),
            view.onDidDispose(() => {
                this.view = undefined;
            })
        );
        view.webview.html = getWebviewHtml(view.webview, this.extensionUri, {
            title: 'Git Killer',
            script: 'sidebar.js',
            style: 'sidebar.css',
        });
    }

    async refresh(): Promise<void> {
        if (!this.view) {
            return;
        }
        const state = await this.buildState();
        void this.view.webview.postMessage({ type: 'sidebar', state });
    }

    private async buildState(): Promise<SidebarState> {
        const repos = this.manager.getRepos();
        const repo = this.manager.getActive();
        const empty: SidebarState = {
            repos: repos.map(item => ({ root: item.root, name: item.name })),
            detached: false,
            ahead: 0,
            behind: 0,
            staged: 0,
            unstaged: 0,
            untracked: 0,
            conflicted: 0,
            operation: null,
            branches: [],
            stashes: [],
        };

        if (!repo) {
            return empty;
        }

        const [head, status, operation, refs, stashes] = await Promise.all([
            repo.head(),
            repo.status(),
            repo.operation(),
            repo.refs(),
            repo.stashes(),
        ]);

        const branches = refs
            .filter(ref => ref.type === 'local')
            .sort((a, b) => (b.date ?? 0) - (a.date ?? 0))
            .slice(0, 8);

        return {
            ...empty,
            active: repo.root,
            branch: head.branch,
            upstream: status.upstream,
            detached: head.detached,
            ahead: status.ahead,
            behind: status.behind,
            staged: status.staged,
            unstaged: status.unstaged,
            untracked: status.untracked,
            conflicted: status.conflicted,
            operation,
            branches,
            stashes,
        };
    }

    private async onMessage(message: WebviewToHost): Promise<void> {
        switch (message.type) {
            case 'ready':
                await this.refresh();
                break;
            case 'refresh':
                await vscode.commands.executeCommand('gitKiller.refresh');
                break;
            case 'openGraph':
                await vscode.commands.executeCommand(
                    'gitKiller.showGraph',
                    this.manager.getActive()?.root
                );
                break;
            case 'switchBranch':
                await vscode.commands.executeCommand(
                    'gitKiller.switchBranch',
                    this.manager.getActive()?.root
                );
                break;
            case 'fetch':
                await vscode.commands.executeCommand(
                    'gitKiller.fetch',
                    this.manager.getActive()?.root
                );
                break;
            case 'pull':
                await vscode.commands.executeCommand(
                    'gitKiller.pull',
                    this.manager.getActive()?.root
                );
                break;
            case 'push':
                await vscode.commands.executeCommand(
                    'gitKiller.push',
                    this.manager.getActive()?.root
                );
                break;
            case 'stashPush':
                await vscode.commands.executeCommand(
                    'gitKiller.stashPush',
                    this.manager.getActive()?.root
                );
                break;
            case 'stashPop':
                await vscode.commands.executeCommand(
                    'gitKiller.stashPop',
                    message.index ?? 0,
                    this.manager.getActive()?.root
                );
                break;
            case 'checkoutBranch': {
                const repo = this.manager.getActive();
                if (repo) {
                    await vscode.commands.executeCommand(
                        'gitKiller.checkoutBranch',
                        repo.root,
                        message.name
                    );
                }
                break;
            }
            case 'continueOperation':
                await vscode.commands.executeCommand(
                    'gitKiller.continueOperation',
                    this.manager.getActive()?.root
                );
                break;
            case 'abortOperation':
                await vscode.commands.executeCommand(
                    'gitKiller.abortOperation',
                    this.manager.getActive()?.root
                );
                break;
            case 'setRepo': {
                this.manager.setActive(message.root);
                await this.refresh();
                break;
            }
            default:
                break;
        }
    }

    dispose(): void {
        this.disposables.forEach(disposable => disposable.dispose());
    }
}
