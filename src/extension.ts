import * as path from 'node:path';
import * as vscode from 'vscode';
import { GitContentProvider } from './contentProvider';
import { BlameController } from './editor/blame';
import { showFileHistory, showLineHistory } from './editor/history';
import * as ops from './git/operations';
import type { GitRepository } from './git/repository';
import { runGit } from './git/executor';
import { RepositoryManager } from './git/repositoryManager';
import { GraphPanel, type GraphPanelDeps } from './graph/graphPanel';
import { confirmDestructive, relativeTime, showGitError, withProgress } from './output';
import type { RefSummary } from './protocol';
import { SidebarViewProvider } from './views/sidebarView';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
    const manager = new RepositoryManager(context.workspaceState);
    await manager.initialize();

    const provider = new GitContentProvider(manager);
    const blame = new BlameController(manager);
    const deps: GraphPanelDeps = {
        extensionUri: context.extensionUri,
        manager,
        provider,
    };

    const sidebar = new SidebarViewProvider(context.extensionUri, manager);

    context.subscriptions.push(
        manager,
        blame,
        sidebar,
        vscode.workspace.registerTextDocumentContentProvider(GitContentProvider.scheme, provider),
        vscode.window.registerWebviewViewProvider(SidebarViewProvider.viewType, sidebar, {
            webviewOptions: { retainContextWhenHidden: false },
        }),
        vscode.window.registerWebviewPanelSerializer('gitKiller.graph', {
            async deserializeWebviewPanel(panel: vscode.WebviewPanel) {
                GraphPanel.revive(panel, deps);
            },
        })
    );

    const resolveRepo = async (root?: string): Promise<GitRepository | undefined> => {
        if (typeof root === 'string' && root.length > 0) {
            return manager.getByRoot(root) ?? manager.addRepo(root);
        }
        const uri = vscode.window.activeTextEditor?.document.uri;
        if (uri) {
            const repo = await manager.resolveRepo(uri);
            if (repo) {
                return repo;
            }
        }
        return manager.getActive();
    };

    const requireRepo = async (root?: string): Promise<GitRepository | undefined> => {
        const repo = await resolveRepo(root);
        if (!repo) {
            void vscode.window.showInformationMessage('No Git repository found in this workspace.');
        }
        return repo;
    };

    const afterMutation = (repo: GitRepository): void => {
        provider.invalidate();
        manager.notifyChanged(repo.root);
    };

    const short = (sha: string): string => sha.slice(0, 8);

    const run = async (title: string, repo: GitRepository, task: () => Promise<void>): Promise<void> => {
        try {
            await withProgress(title, task);
            afterMutation(repo);
            void vscode.window.setStatusBarMessage(`$(check) ${title}`, 2000);
        } catch (error) {
            showGitError(error);
        }
    };

    const pickCommit = async (repo: GitRepository, placeHolder: string): Promise<string | undefined> => {
        const commits = await withProgress('Loading commits', () =>
            repo.log({ maxCount: 300, filter: { scope: 'all', text: '' } })
        );
        const picked = await vscode.window.showQuickPick(
            commits.map(commit => ({
                label: commit.subject || commit.sha.slice(0, 8),
                description: `${commit.sha.slice(0, 8)} · ${commit.author} · ${relativeTime(commit.authorTime)}`,
                entry: commit,
            })),
            { placeHolder, matchOnDescription: true }
        );
        return picked?.entry.sha;
    };

    const pickBranch = async (
        repo: GitRepository,
        placeHolder: string,
        options: { includeCurrent?: boolean } = {}
    ): Promise<RefSummary | undefined> => {
        const head = await repo.head();
        const refs = (await repo.branchRefs()).filter(
            ref => options.includeCurrent || !(ref.type === 'local' && ref.shortName === head.branch)
        );
        const picked = await vscode.window.showQuickPick(
            refs.map(ref => ({
                label: `${ref.type === 'remote' ? '$(cloud) ' : '$(git-branch) '}${ref.shortName}`,
                description:
                    ref.ahead || ref.behind
                        ? `↑${ref.ahead ?? 0} ↓${ref.behind ?? 0}`
                        : ref.type === 'remote'
                            ? 'remote'
                            : undefined,
                ref,
            })),
            { placeHolder, matchOnDescription: true }
        );
        return picked?.ref;
    };

    const register = (command: string, handler: (...args: unknown[]) => unknown): void => {
        context.subscriptions.push(vscode.commands.registerCommand(command, handler));
    };

    register('gitKiller.showGraph', (root?: unknown) => {
        let target: string | undefined;
        if (typeof root === 'string' && root.length > 0) {
            target = manager.getByRoot(root)?.root ?? manager.addRepo(root).root;
        } else {
            target = manager.getActive()?.root;
        }
        GraphPanel.open(deps, target);
    });

    register('gitKiller.refresh', () => {
        const repo = manager.getActive();
        if (repo) {
            provider.invalidate();
            manager.notifyChanged(repo.root);
        }
        GraphPanel.refreshAll();
        void sidebar.refresh();
    });

    register('gitKiller.switchBranch', async (root?: unknown) => {
        const repo = await requireRepo(typeof root === 'string' ? root : undefined);
        if (!repo) {
            return;
        }
        const head = await repo.head();
        const refs = await repo.branchRefs();
        const items: (vscode.QuickPickItem & { ref?: RefSummary; create?: boolean })[] = refs.map(ref => {
            const current = ref.type === 'local' && ref.shortName === head.branch;
            return {
                label: `${current ? '$(check) ' : ref.type === 'remote' ? '$(cloud) ' : '$(git-branch) '}${ref.shortName}`,
                description: [
                    current ? 'current' : undefined,
                    ref.ahead || ref.behind ? `↑${ref.ahead ?? 0} ↓${ref.behind ?? 0}` : undefined,
                    ref.type === 'remote' ? 'remote' : undefined,
                ]
                    .filter(Boolean)
                    .join(' · '),
                ref,
            };
        });
        items.push({ label: '$(plus) Create new branch…', create: true });

        const picked = await vscode.window.showQuickPick(items, {
            placeHolder: head.branch ? `Switch from ${head.branch}` : 'Switch branch',
            matchOnDescription: true,
        });
        if (!picked) {
            return;
        }
        if (picked.create) {
            await vscode.commands.executeCommand('gitKiller.createBranch', repo.root);
            return;
        }
        if (!picked.ref) {
            return;
        }
        await run(`Switching to ${picked.ref.shortName}`, repo, () =>
            ops.checkoutBranch(repo, picked.ref!.shortName)
        );
    });

    register('gitKiller.createBranch', async (root?: unknown, sha?: unknown) => {
        const repo = await requireRepo(typeof root === 'string' ? root : undefined);
        if (!repo) {
            return;
        }
        const head = await repo.head();
        const base = typeof sha === 'string' ? short(sha) : head.sha ? short(head.sha) : 'HEAD';
        const name = await vscode.window.showInputBox({
            prompt: `New branch from ${base} ${head.branch ? `while on ${head.branch}` : 'while HEAD is detached'
                }`,
            placeHolder: 'feature/my-change',
            validateInput: value => (value.trim().length === 0 ? 'Branch name is required' : undefined),
        });
        if (!name) {
            return;
        }
        const picked = await vscode.window.showQuickPick(
            ['Create and switch', 'Create without switching'],
            { placeHolder: `After creating ${name.trim()} (current: ${head.branch ?? 'detached HEAD'})` }
        );
        if (!picked) {
            return;
        }
        await run(`Create branch ${name.trim()} at ${base}`, repo, () =>
            ops.createBranch(
                repo,
                name.trim(),
                typeof sha === 'string' ? sha : undefined,
                picked === 'Create and switch'
            )
        );
    });

    register('gitKiller.deleteBranch', async (root?: unknown) => {
        const repo = await requireRepo(typeof root === 'string' ? root : undefined);
        if (!repo) {
            return;
        }
        const branch = await pickBranch(repo, 'Select a branch to delete');
        if (!branch || branch.type !== 'local') {
            return;
        }
        if (
            !(await confirmDestructive(
                `Delete branch ${branch.shortName}?`,
                `This removes refs/heads/${branch.shortName}. Commits are kept until garbage collected.`
            ))
        ) {
            return;
        }
        try {
            await withProgress(`Deleting ${branch.shortName}`, () =>
                ops.deleteBranch(repo, branch.shortName)
            );
            afterMutation(repo);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            const force = await vscode.window.showWarningMessage(
                message,
                { modal: true, detail: 'The branch is not fully merged. Force delete it?' },
                'Force delete'
            );
            if (force === 'Force delete') {
                await run('Force deleting branch', repo, () =>
                    ops.deleteBranch(repo, branch.shortName, true)
                );
            }
        }
    });

    register('gitKiller.compareRefs', async (root?: unknown) => {
        const repo = await requireRepo(typeof root === 'string' ? root : undefined);
        if (!repo) {
            return;
        }
        const refs = (await repo.refs()).filter(
            ref => ref.type === 'local' || ref.type === 'remote' || ref.type === 'tag'
        );
        const head = await repo.head();
        const items = [
            ...(head.sha ? [{ label: '$(git-commit) HEAD', description: head.sha.slice(0, 8), sha: head.sha }] : []),
            ...refs.map(ref => ({
                label: `${ref.type === 'tag' ? '$(tag)' : ref.type === 'remote' ? '$(cloud)' : '$(git-branch)'} ${ref.shortName}`,
                description: ref.sha.slice(0, 8),
                sha: ref.sha,
            })),
        ];
        const first = await vscode.window.showQuickPick(items, { placeHolder: 'Compare: select the base ref' });
        if (!first) {
            return;
        }
        const second = await vscode.window.showQuickPick(
            items.filter(item => item.sha !== first.sha || item.label !== first.label),
            { placeHolder: `Compare ${first.label.replace(/\$\([^)]*\)\s*/, '')} with…` }
        );
        if (!second) {
            return;
        }
        GraphPanel.openCompare(deps, first.sha, second.sha, repo.root);
    });

    register('gitKiller.openCommit', async (sha?: unknown, root?: unknown) => {
        let target = typeof sha === 'string' ? sha : undefined;
        let repoRoot = typeof root === 'string' ? root : undefined;
        if (!target) {
            const repo = await requireRepo(repoRoot);
            if (!repo) {
                return;
            }
            const commit = await pickCommit(repo, 'Open commit in graph');
            if (!commit) {
                return;
            }
            target = commit;
            repoRoot = repo.root;
        }
        GraphPanel.openAtCommit(deps, target, repoRoot);
    });

    register('gitKiller.toggleBlame', () => blame.toggle());

    register('gitKiller.fileHistory', async (uri?: unknown) => {
        await showFileHistory(
            manager,
            provider,
            uri instanceof vscode.Uri ? uri : undefined
        );
    });

    register('gitKiller.lineHistory', async () => {
        await showLineHistory(manager, provider);
    });

    for (const [command, title, task] of [
        ['gitKiller.fetch', 'Fetching', (repo: GitRepository) => ops.fetchAll(repo)],
        ['gitKiller.pull', 'Pulling', (repo: GitRepository) => ops.pull(repo)],
        ['gitKiller.push', 'Pushing', (repo: GitRepository) => ops.push(repo)],
        ['gitKiller.stashPush', 'Stashing changes', (repo: GitRepository) => ops.stashPush(repo)],
    ] as const) {
        register(command, async (root?: unknown) => {
            const repo = await requireRepo(typeof root === 'string' ? root : undefined);
            if (!repo) {
                return;
            }
            await run(title, repo, () => task(repo));
        });
    }

    register('gitKiller.stashPop', async (index?: unknown, root?: unknown) => {
        const repo = await requireRepo(typeof root === 'string' ? root : undefined);
        if (!repo) {
            return;
        }
        const stashes = await repo.stashes();
        if (stashes.length === 0) {
            void vscode.window.showInformationMessage('There are no stashes to pop.');
            return;
        }
        const stashIndex = typeof index === 'number' && index >= 0 ? index : 0;
        await run(`Pop stash@{${stashIndex}}`, repo, () => ops.stashPop(repo, stashIndex));
    });

    register('gitKiller.checkoutBranch', async (root?: unknown, name?: unknown) => {
        const repo = await requireRepo(typeof root === 'string' ? root : undefined);
        if (!repo || typeof name !== 'string' || name.length === 0) {
            return;
        }
        const head = await repo.head();
        if (head.branch === name) {
            void vscode.window.setStatusBarMessage(`$(check) Already on ${name}`, 2000);
            return;
        }
        await run(`Switch to ${name}`, repo, () => ops.checkoutBranch(repo, name));
    });

    register('gitKiller.commit', async () => {
        const repo = await requireRepo();
        if (!repo) {
            return;
        }
        const head = await repo.head();
        const branch = head.branch ?? 'HEAD';
        const message = await vscode.window.showInputBox({
            prompt: `Commit staged changes to ${branch}`,
            placeHolder: 'Describe your change',
        });
        if (!message || !message.trim()) {
            return;
        }
        try {
            await withProgress(`Commit to ${branch}`, () => ops.commit(repo, message.trim()));
            afterMutation(repo);
            void vscode.window.setStatusBarMessage(`$(check) Committed to ${branch}`, 2000);
        } catch (error) {
            const text = error instanceof Error ? error.message : String(error);
            const choice = await vscode.window.showWarningMessage(text, 'Stage all and commit');
            if (choice === 'Stage all and commit') {
                await run(`Commit to ${branch} (stage all)`, repo, () =>
                    ops.commit(repo, message.trim(), { all: true })
                );
            }
        }
    });

    register('gitKiller.merge', async (root?: unknown) => {
        const repo = await requireRepo(typeof root === 'string' ? root : undefined);
        if (!repo) {
            return;
        }
        const head = await repo.head();
        const current = head.branch ?? 'HEAD';
        const branch = await pickBranch(repo, `Merge which branch into ${current}?`);
        if (!branch) {
            return;
        }
        if (
            !(await confirmDestructive(
                `Merge ${branch.shortName} into ${current}?`,
                `git merge --no-edit ${branch.shortName} will run while ${current} is checked out.`
            ))
        ) {
            return;
        }
        await run(`Merge ${branch.shortName} into ${current}`, repo, () =>
            ops.merge(repo, branch.shortName)
        );
    });

    register('gitKiller.rebase', async (root?: unknown) => {
        const repo = await requireRepo(typeof root === 'string' ? root : undefined);
        if (!repo) {
            return;
        }
        const head = await repo.head();
        const current = head.branch ?? 'HEAD';
        const branch = await pickBranch(repo, `Rebase ${current} onto which branch?`);
        if (!branch) {
            return;
        }
        if (
            !(await confirmDestructive(
                `Rebase ${current} onto ${branch.shortName}?`,
                `git rebase ${branch.shortName} will rewrite ${current}. Use git reflog to recover if needed.`
            ))
        ) {
            return;
        }
        await run(`Rebase ${current} onto ${branch.shortName}`, repo, () =>
            ops.rebase(repo, branch.shortName)
        );
    });

    register('gitKiller.interactiveRebase', async (base?: unknown, root?: unknown) => {
        const repo = await requireRepo(typeof root === 'string' ? root : undefined);
        if (!repo) {
            return;
        }
        const target =
            typeof base === 'string'
                ? base
                : await pickCommit(repo, 'Interactive rebase: commits after this one will be editable');
        if (!target) {
            return;
        }
        const panel = GraphPanel.open(deps, repo.root);
        if (panel) {
            await panel.showRebaseTodo(target);
        }
    });

    register('gitKiller.cherryPick', async (sha?: unknown) => {
        const repo = await requireRepo();
        if (!repo) {
            return;
        }
        const target =
            typeof sha === 'string' ? sha : await pickCommit(repo, 'Cherry-pick which commit?');
        if (!target) {
            return;
        }
        const head = await repo.head();
        const branch = head.branch ?? 'HEAD';
        await run(`Cherry-pick ${short(target)} onto ${branch}`, repo, () =>
            ops.cherryPick(repo, target)
        );
    });

    register('gitKiller.revert', async (sha?: unknown) => {
        const repo = await requireRepo();
        if (!repo) {
            return;
        }
        const target =
            typeof sha === 'string' ? sha : await pickCommit(repo, 'Revert which commit?');
        if (!target) {
            return;
        }
        const head = await repo.head();
        const branch = head.branch ?? 'HEAD';
        if (
            !(await confirmDestructive(
                `Revert ${short(target)} on ${branch}?`,
                `git revert --no-edit ${short(target)} creates a new commit that undoes it on ${branch}.`
            ))
        ) {
            return;
        }
        await run(`Revert ${short(target)} on ${branch}`, repo, () => ops.revert(repo, target));
    });

    register('gitKiller.reset', async (sha?: unknown) => {
        const repo = await requireRepo();
        if (!repo) {
            return;
        }
        const target =
            typeof sha === 'string' ? sha : await pickCommit(repo, 'Reset to which commit?');
        if (!target) {
            return;
        }
        const head = await repo.head();
        const branch = head.branch ?? 'HEAD';
        const mode = await vscode.window.showQuickPick(
            [
                { label: 'Soft', description: `Move ${branch} only, keep index and working tree`, mode: 'soft' as const },
                { label: 'Mixed', description: `Move ${branch} and reset index, keep working tree`, mode: 'mixed' as const },
                { label: 'Hard', description: `Move ${branch} and discard all changes`, mode: 'hard' as const },
            ],
            { placeHolder: `Reset ${branch} to ${short(target)}` }
        );
        if (!mode) {
            return;
        }
        if (
            mode.mode === 'hard' &&
            !(await confirmDestructive(
                `Reset --hard ${branch}?`,
                `This discards working tree changes and moves ${branch} to ${short(target)}.`
            ))
        ) {
            return;
        }
        await run(`Reset ${branch} to ${short(target)} (${mode.mode})`, repo, () =>
            ops.reset(repo, target, mode.mode)
        );
    });

    register('gitKiller.continueOperation', async (root?: unknown) => {
        const repo = await requireRepo(typeof root === 'string' ? root : undefined);
        if (!repo) {
            return;
        }
        const operation = await repo.operation();
        if (!operation) {
            void vscode.window.showInformationMessage('No operation in progress.');
            return;
        }
        await run(`Continuing ${operation.kind}`, repo, () => ops.continueOperation(repo, operation.kind));
    });

    register('gitKiller.abortOperation', async (root?: unknown) => {
        const repo = await requireRepo(typeof root === 'string' ? root : undefined);
        if (!repo) {
            return;
        }
        const operation = await repo.operation();
        if (!operation) {
            void vscode.window.showInformationMessage('No operation in progress.');
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
        await run(`Aborting ${operation.kind}`, repo, () => ops.abortOperation(repo, operation.kind));
    });

    register('gitKiller.worktreeAdd', async (root?: unknown) => {
        const repo = await requireRepo(typeof root === 'string' ? root : undefined);
        if (!repo) {
            return;
        }

        const worktrees = await repo.worktrees();
        const checkedOut = new Set(
            worktrees.map(worktree => worktree.branch).filter((branch): branch is string => Boolean(branch))
        );
        const refs = (await repo.branchRefs()).filter(
            ref => ref.type === 'local' && !checkedOut.has(ref.shortName)
        );

        type WorktreePick = vscode.QuickPickItem & { branch?: string; create?: boolean };
        const items: WorktreePick[] = refs.map(ref => ({
            label: `$(git-branch) ${ref.shortName}`,
            description: ref.ahead || ref.behind ? `↑${ref.ahead ?? 0} ↓${ref.behind ?? 0}` : undefined,
            branch: ref.shortName,
        }));
        items.push({ label: '$(plus) New branch…', create: true });

        const picked = await vscode.window.showQuickPick(items, {
            placeHolder: 'Check out which branch in the new worktree?',
            matchOnDescription: true,
        });
        if (!picked) {
            return;
        }

        let branch = picked.branch;
        if (picked.create) {
            const name = await vscode.window.showInputBox({
                prompt: 'Branch to create in the new worktree',
                placeHolder: 'feature/my-worktree',
                validateInput: value => (value.trim().length === 0 ? 'Branch name is required' : undefined),
            });
            if (!name?.trim()) {
                return;
            }
            branch = name.trim();
        }
        if (!branch) {
            return;
        }

        const slug = branch.replace(/[\\/]+/g, '-');
        const suggested = path.join(path.dirname(repo.root), `${path.basename(repo.root)}-${slug}`);
        const target = await vscode.window.showInputBox({
            prompt: `Path for the worktree checked out at ${branch}`,
            value: suggested,
            validateInput: value => (value.trim().length === 0 ? 'A path is required' : undefined),
        });
        if (!target?.trim()) {
            return;
        }

        await run(`Add worktree ${branch}`, repo, () =>
            ops.worktreeAdd(repo, target.trim(), picked.create ? { branch } : { ref: branch })
        );
    });

    register('gitKiller.worktreeOpen', async (target?: unknown) => {
        if (typeof target !== 'string' || target.length === 0) {
            return;
        }
        await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(target), {
            forceNewWindow: true,
        });
    });

    register('gitKiller.worktreeRemove', async (target?: unknown, root?: unknown) => {
        const repo = await requireRepo(typeof root === 'string' ? root : undefined);
        if (!repo || typeof target !== 'string' || target.length === 0) {
            return;
        }
        if (
            !(await confirmDestructive(
                'Remove worktree?',
                `${target}\n\ngit worktree remove ${target}`
            ))
        ) {
            return;
        }
        try {
            await withProgress('Removing worktree', () => ops.worktreeRemove(repo, target));
            afterMutation(repo);
            void vscode.window.setStatusBarMessage('$(check) Worktree removed', 2000);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            const force = await vscode.window.showWarningMessage(
                message,
                { modal: true, detail: 'The worktree has changes or untracked files. Remove it anyway?' },
                'Force remove'
            );
            if (force === 'Force remove') {
                await run('Force removing worktree', repo, () => ops.worktreeRemove(repo, target, true));
            }
        }
    });

    register('gitKiller.worktreePrune', async (root?: unknown) => {
        const repo = await requireRepo(typeof root === 'string' ? root : undefined);
        if (!repo) {
            return;
        }
        await run('Pruning worktrees', repo, () => ops.worktreePrune(repo));
    });

    register('gitKiller.submoduleUpdate', async (subPath?: unknown, root?: unknown) => {
        const repo = await requireRepo(typeof root === 'string' ? root : undefined);
        if (!repo) {
            return;
        }
        const target = typeof subPath === 'string' && subPath.length > 0 ? subPath : undefined;
        await run(target ? `Update submodule ${target}` : 'Update submodules', repo, () =>
            ops.submoduleUpdate(repo, target)
        );
    });

    register('gitKiller.submoduleSync', async (subPath?: unknown, root?: unknown) => {
        const repo = await requireRepo(typeof root === 'string' ? root : undefined);
        if (!repo) {
            return;
        }
        const target = typeof subPath === 'string' && subPath.length > 0 ? subPath : undefined;
        await run(target ? `Sync submodule ${target}` : 'Sync submodule URLs', repo, () =>
            ops.submoduleSync(repo, target)
        );
    });

    register('gitKiller.submoduleGraph', async (target?: unknown, root?: unknown) => {
        let subTarget = typeof target === 'string' && target.length > 0 ? target : undefined;
        if (!subTarget) {
            const repo = await requireRepo(typeof root === 'string' ? root : undefined);
            if (!repo) {
                return;
            }
            const submodules = await repo.submodules();
            if (submodules.length === 0) {
                void vscode.window.showInformationMessage('This repository has no submodules.');
                return;
            }
            const picked = await vscode.window.showQuickPick(
                submodules.map(submodule => ({
                    label: `$(repo) ${submodule.path}`,
                    description:
                        submodule.state === 'uninitialized'
                            ? 'not initialized'
                            : submodule.describe ?? 'initialized',
                    target: submodule.absolutePath,
                })),
                { placeHolder: 'Open the commit graph of which submodule?' }
            );
            if (!picked) {
                return;
            }
            subTarget = picked.target;
        }

        let subRoot: string;
        try {
            subRoot = (
                await runGit(['rev-parse', '--show-toplevel'], { cwd: subTarget, readOnly: true })
            ).trim();
        } catch {
            void vscode.window.showErrorMessage(
                'This submodule is not initialized. Run Init on it first.'
            );
            return;
        }
        if (!subRoot) {
            void vscode.window.showErrorMessage('Unable to resolve the submodule repository.');
            return;
        }

        const subRepo = manager.getByRoot(subRoot) ?? manager.addRepo(subRoot);
        manager.setActive(subRepo.root);
        GraphPanel.openFor(deps, subRepo.root);
    });

    register('gitKiller.copySha', async (sha?: unknown) => {
        let target = typeof sha === 'string' ? sha : undefined;
        if (!target) {
            const repo = await requireRepo();
            if (!repo) {
                return;
            }
            target = await pickCommit(repo, 'Copy SHA of which commit?');
        }
        if (target) {
            await vscode.env.clipboard.writeText(target);
            void vscode.window.setStatusBarMessage(`$(clippy) Copied ${target.slice(0, 8)}`, 2000);
        }
    });
}

export function deactivate(): void {
    // Nothing to clean up beyond registered disposables.
}
