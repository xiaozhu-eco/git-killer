import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { GitRepository } from './repository';
import { runGit as run } from './executor';
import { logCommand } from '../output';
import type { OperationInfo, RebaseTodoItem } from '../protocol';

function log(args: string[]): void {
    logCommand(args);
}

export async function checkoutCommit(repo: GitRepository, sha: string): Promise<void> {
    const args = ['switch', '--detach', sha];
    log(args);
    await run(args, { cwd: repo.root });
}

export async function checkoutBranch(repo: GitRepository, name: string): Promise<void> {
    const args = ['switch', name];
    log(args);
    await run(args, { cwd: repo.root });
}

export async function createBranch(
    repo: GitRepository,
    name: string,
    sha?: string,
    checkout = true
): Promise<void> {
    const args = checkout ? ['switch', '-c', name, ...(sha ? [sha] : [])] : ['branch', name, ...(sha ? [sha] : [])];
    log(args);
    await run(args, { cwd: repo.root });
}

export async function deleteBranch(repo: GitRepository, name: string, force = false): Promise<void> {
    const args = ['branch', force ? '-D' : '-d', name];
    log(args);
    await run(args, { cwd: repo.root });
}

export async function createTag(
    repo: GitRepository,
    name: string,
    sha: string,
    message?: string
): Promise<void> {
    const args = message
        ? ['tag', '-a', name, sha, '-m', message]
        : ['tag', name, sha];
    log(args);
    await run(args, { cwd: repo.root });
}

export async function commit(
    repo: GitRepository,
    message: string,
    options: { amend?: boolean; all?: boolean } = {}
): Promise<void> {
    if (options.all) {
        log(['add', '-A']);
        await run(['add', '-A'], { cwd: repo.root });
    }
    const args = ['commit'];
    if (options.amend) {
        args.push('--amend');
        if (message.trim()) {
            args.push('-m', message);
        } else {
            args.push('--no-edit');
        }
    } else {
        args.push('-m', message);
    }
    log(args);
    await run(args, { cwd: repo.root });
}

export async function cherryPick(repo: GitRepository, sha: string): Promise<void> {
    const args = ['cherry-pick', sha];
    log(args);
    await run(args, { cwd: repo.root });
}

export async function revert(repo: GitRepository, sha: string): Promise<void> {
    const args = ['revert', '--no-edit', sha];
    log(args);
    await run(args, { cwd: repo.root });
}

export async function reset(repo: GitRepository, sha: string, mode: 'soft' | 'mixed' | 'hard'): Promise<void> {
    if (mode === 'hard') {
        await backupHead(repo, 'reset-hard');
    }
    const args = ['reset', `--${mode}`, sha];
    log(args);
    await run(args, { cwd: repo.root });
}

export async function merge(repo: GitRepository, ref: string): Promise<void> {
    const args = ['merge', '--no-edit', ref];
    log(args);
    await run(args, { cwd: repo.root });
}

export async function rebase(repo: GitRepository, ref: string): Promise<void> {
    await backupHead(repo, 'rebase');
    const args = ['rebase', ref];
    log(args);
    await run(args, { cwd: repo.root });
}

async function backupHead(repo: GitRepository, reason: string): Promise<void> {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const name = `refs/git-killer/backup/${stamp}-${reason}`;
    try {
        await run(['update-ref', name, 'HEAD'], { cwd: repo.root });
    } catch {
        // Best effort only; never block the operation because of a backup ref.
    }
}

function shellQuote(value: string): string {
    return `'${value.replace(/'/g, `'\\''`)}'`;
}

export async function interactiveRebase(
    repo: GitRepository,
    base: string,
    items: RebaseTodoItem[]
): Promise<void> {
    const kept = items.filter(item => item.action !== 'drop');
    if (kept.length === 0) {
        throw new Error('The rebase todo would drop every commit');
    }
    if (kept[0].action === 'squash' || kept[0].action === 'fixup') {
        throw new Error('The first kept commit cannot be squash or fixup');
    }

    await backupHead(repo, 'interactive-rebase');
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'git-killer-rebase-'));
    const todoPath = path.join(directory, 'todo');
    const scriptPath = path.join(directory, 'sequence-editor.sh');

    const todo = items
        .map(item => `${item.action} ${item.sha} ${item.subject.replace(/[\r\n]+/g, ' ')}`)
        .join('\n');
    fs.writeFileSync(todoPath, `${todo}\n`, 'utf8');
    fs.writeFileSync(scriptPath, `#!/bin/sh\ncp ${shellQuote(todoPath)} "$1"\n`, {
        encoding: 'utf8',
        mode: 0o755,
    });

    const args = ['rebase', '-i', base];
    log(args);
    try {
        await run(args, {
            cwd: repo.root,
            env: {
                GIT_SEQUENCE_EDITOR: `sh ${shellQuote(scriptPath)}`,
                GIT_EDITOR: ':',
            },
        });
    } finally {
        fs.rmSync(directory, { recursive: true, force: true });
    }
}

export async function fetchAll(repo: GitRepository): Promise<void> {
    const args = ['fetch', '--all', '--prune'];
    log(args);
    await run(args, { cwd: repo.root });
}

export async function pull(repo: GitRepository): Promise<void> {
    const args = ['pull'];
    log(args);
    await run(args, { cwd: repo.root });
}

export async function push(repo: GitRepository): Promise<void> {
    const args = ['push'];
    log(args);
    await run(args, { cwd: repo.root });
}

export async function stashPush(repo: GitRepository, message?: string): Promise<void> {
    const args = ['stash', 'push', '-u', ...(message ? ['-m', message] : [])];
    log(args);
    await run(args, { cwd: repo.root });
}

export async function stashPop(repo: GitRepository, index = 0): Promise<void> {
    const args = ['stash', 'pop', `stash@{${index}}`];
    log(args);
    await run(args, { cwd: repo.root });
}

export async function continueOperation(repo: GitRepository, kind: OperationInfo['kind']): Promise<void> {
    const args =
        kind === 'rebase'
            ? ['rebase', '--continue']
            : kind === 'merge'
                ? ['merge', '--continue']
                : kind === 'cherry-pick'
                    ? ['cherry-pick', '--continue']
                    : ['revert', '--continue'];
    log(args);
    // Keep git from blocking on an editor; users can reword later.
    await run(args, { cwd: repo.root, env: { GIT_EDITOR: ':' } });
}

export async function abortOperation(repo: GitRepository, kind: OperationInfo['kind']): Promise<void> {
    const args =
        kind === 'rebase'
            ? ['rebase', '--abort']
            : kind === 'merge'
                ? ['merge', '--abort']
                : kind === 'cherry-pick'
                    ? ['cherry-pick', '--abort']
                    : ['revert', '--abort'];
    log(args);
    await run(args, { cwd: repo.root });
}

export interface WorktreeAddOptions {
    /** Existing ref to check out in the new worktree. */
    ref?: string;
    /** Name of a new branch to create for the new worktree. */
    branch?: string;
    /** Check out a detached HEAD at `ref` instead of a branch. */
    detach?: boolean;
}

export async function worktreeAdd(
    repo: GitRepository,
    target: string,
    options: WorktreeAddOptions = {}
): Promise<void> {
    const args = ['worktree', 'add'];
    if (options.branch) {
        args.push('-b', options.branch);
    } else if (options.detach) {
        args.push('--detach');
    }
    args.push(target);
    if (options.ref) {
        args.push(options.ref);
    }
    log(args);
    await run(args, { cwd: repo.root });
}

export async function worktreeRemove(repo: GitRepository, target: string, force = false): Promise<void> {
    const args = ['worktree', 'remove', ...(force ? ['--force'] : []), target];
    log(args);
    await run(args, { cwd: repo.root });
}

export async function worktreePrune(repo: GitRepository): Promise<void> {
    const args = ['worktree', 'prune'];
    log(args);
    await run(args, { cwd: repo.root });
}

export async function submoduleUpdate(repo: GitRepository, subPath?: string): Promise<void> {
    const args = ['submodule', 'update', '--init', '--recursive'];
    if (subPath) {
        args.push('--', subPath);
    }
    log(args);
    await run(args, { cwd: repo.root });
}

export async function submoduleSync(repo: GitRepository, subPath?: string): Promise<void> {
    const args = ['submodule', 'sync', '--recursive'];
    if (subPath) {
        args.push('--', subPath);
    }
    log(args);
    await run(args, { cwd: repo.root });
}
