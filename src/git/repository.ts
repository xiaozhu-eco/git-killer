import * as path from 'node:path';
import * as vscode from 'vscode';
import type {
    CommitDetails,
    FileChange,
    GraphFilter,
    HeadInfo,
    OperationInfo,
    RefSummary,
    StatusSummary,
} from '../protocol';
import { runGit } from './executor';
import {
    COMMIT_HEADER_FORMAT,
    LOG_ENTRY_FORMAT,
    LOG_FORMAT,
    parseBlame,
    parseCommitHeader,
    parseFileChanges,
    parseLineLog,
    parseLog,
    parseLogEntries,
    parseRefs,
    parseStatus,
    toRefSummary,
} from './parsers';

const REF_FORMAT =
    '%(refname)%1f%(objectname)%1f%(*objectname)%1f%(upstream)%1f%(upstream:track)%1f%(symref)%1f%(committerdate:unix)';

export interface LogOptions {
    maxCount: number;
    filter: GraphFilter;
}

export class GitRepository {
    readonly name: string;
    private gitDirPromise?: Promise<string>;

    constructor(readonly root: string) {
        this.name = path.basename(root) || root;
    }

    gitDir(): Promise<string> {
        if (!this.gitDirPromise) {
            this.gitDirPromise = runGit(['rev-parse', '--absolute-git-dir'], {
                cwd: this.root,
                readOnly: true,
            })
                .then(value => value.trim())
                .catch(() => path.join(this.root, '.git'));
        }
        return this.gitDirPromise;
    }

    async head(): Promise<HeadInfo> {
        const [branch, sha] = await Promise.all([
            runGit(['symbolic-ref', '--short', '-q', 'HEAD'], { cwd: this.root, readOnly: true }).catch(
                () => undefined
            ),
            runGit(['rev-parse', '--verify', '-q', 'HEAD'], { cwd: this.root, readOnly: true }).catch(
                () => undefined
            ),
        ]);
        const branchName = branch?.trim() || undefined;
        const commit = sha?.trim() || undefined;
        return {
            sha: commit,
            branch: branchName,
            detached: !branchName && Boolean(commit),
        };
    }

    async refs(): Promise<RefSummary[]> {
        const raw = await runGit(['for-each-ref', `--format=${REF_FORMAT}`], {
            cwd: this.root,
            readOnly: true,
        });
        return parseRefs(raw)
            .map(toRefSummary)
            .filter((ref): ref is RefSummary => Boolean(ref));
    }

    async status(): Promise<StatusSummary> {
        const raw = await runGit(['status', '--porcelain=v2', '--branch', '-z'], {
            cwd: this.root,
            readOnly: true,
        }).catch(() => '');
        return parseStatus(raw);
    }

    async operation(): Promise<OperationInfo | null> {
        const gitDir = await this.gitDir();
        const exists = async (name: string) => {
            try {
                await vscode.workspace.fs.stat(vscode.Uri.file(path.join(gitDir, name)));
                return true;
            } catch {
                return false;
            }
        };

        let kind: OperationInfo['kind'] | undefined;
        if ((await exists('rebase-merge')) || (await exists('rebase-apply'))) {
            kind = 'rebase';
        } else if (await exists('MERGE_HEAD')) {
            kind = 'merge';
        } else if (await exists('CHERRY_PICK_HEAD')) {
            kind = 'cherry-pick';
        } else if (await exists('REVERT_HEAD')) {
            kind = 'revert';
        }

        if (!kind) {
            return null;
        }
        const status = await this.status();
        return { kind, conflicted: status.conflicted };
    }

    async log(options: LogOptions): Promise<ReturnType<typeof parseLog>> {
        const head = await this.head();
        if (!head.sha) {
            return [];
        }

        const args = ['log', '--date-order', `--max-count=${options.maxCount}`, `--pretty=format:${LOG_FORMAT}`];

        if (options.filter.scope === 'all') {
            args.push('--exclude=refs/stash', '--exclude=refs/stash/*', '--all');
        }
        if (options.filter.text.trim()) {
            args.push(`--grep=${options.filter.text.trim()}`, '--regexp-ignore-case');
        }
        args.push('--');

        const raw = await runGit(args, { cwd: this.root, readOnly: true });
        return parseLog(raw);
    }

    async commitDetails(sha: string, refs: RefSummary[] = []): Promise<CommitDetails> {
        const headerRaw = await runGit(
            ['show', '-s', `--format=${COMMIT_HEADER_FORMAT}`, sha],
            { cwd: this.root, readOnly: true }
        );
        const header = parseCommitHeader(headerRaw);
        if (!header) {
            throw new Error(`Unable to read commit ${sha}`);
        }

        const diffArgs = ['diff-tree', '-r', '--raw', '--numstat', '-z', '-M', '--no-commit-id'];
        if (header.parents.length === 0) {
            diffArgs.push('--root', sha);
        } else if (header.parents.length > 1) {
            diffArgs.push(header.parents[0], sha);
        } else {
            diffArgs.push(sha);
        }
        const filesRaw = await runGit(diffArgs, { cwd: this.root, readOnly: true }).catch(() => '');
        const files = parseFileChanges(filesRaw);
        const subject = header.body.split('\n')[0] ?? '';

        return {
            sha: header.sha,
            parents: header.parents,
            author: header.author,
            authorEmail: header.authorEmail,
            authorTime: header.authorTime,
            committer: header.committer,
            committerEmail: header.committerEmail,
            committerTime: header.committerTime,
            refs,
            subject,
            body: header.body,
            files,
        };
    }

    async compare(a: string, b: string): Promise<FileChange[]> {
        if (a === b) {
            return [];
        }
        const raw = await runGit(['diff', '--raw', '--numstat', '-z', '-M', a, b], {
            cwd: this.root,
            readOnly: true,
        });
        return parseFileChanges(raw);
    }

    async blame(relPath: string, rev = 'HEAD'): Promise<ReturnType<typeof parseBlame>> {
        const raw = await runGit(['blame', '--porcelain', '-w', rev, '--', relPath], {
            cwd: this.root,
            readOnly: true,
        });
        return parseBlame(raw);
    }

    async fileLog(relPath: string, max = 200): Promise<ReturnType<typeof parseLineLog>> {
        const raw = await runGit(
            ['log', '--follow', `--max-count=${max}`, `--format=${LOG_ENTRY_FORMAT}`, '--', relPath],
            { cwd: this.root, readOnly: true }
        );
        return parseLineLog(raw);
    }

    async lineLog(relPath: string, line: number): Promise<ReturnType<typeof parseLineLog>> {
        const raw = await runGit(
            [
                'log',
                `-L${line},${line}:${relPath}`,
                `--format=%x00${LOG_ENTRY_FORMAT}`,
                '--no-patch',
            ],
            { cwd: this.root, readOnly: true }
        ).catch(() => '');
        return parseLineLog(raw);
    }

    async commitsAfter(base: string): Promise<ReturnType<typeof parseLogEntries>> {
        const raw = await runGit(
            ['log', '--reverse', `--format=${LOG_ENTRY_FORMAT}`, `${base}..HEAD`],
            { cwd: this.root, readOnly: true }
        ).catch(() => '');
        return parseLogEntries(raw);
    }

    async isAncestor(ancestor: string, descendant = 'HEAD'): Promise<boolean> {
        try {
            await runGit(['merge-base', '--is-ancestor', ancestor, descendant], {
                cwd: this.root,
                readOnly: true,
            });
            return true;
        } catch {
            return false;
        }
    }

    async stashes(): Promise<string[]> {
        const raw = await runGit(['stash', 'list'], { cwd: this.root, readOnly: true }).catch(() => '');
        return raw
            .split('\n')
            .map(line => line.trim())
            .filter(Boolean);
    }

    async branchRefs(): Promise<RefSummary[]> {
        const refs = await this.refs();
        return refs
            .filter(ref => ref.type === 'local' || ref.type === 'remote')
            .sort((a, b) => (b.date ?? 0) - (a.date ?? 0));
    }

    async show(rev: string, relPath: string): Promise<string> {
        return runGit(['show', `${rev}:${relPath}`], { cwd: this.root, readOnly: true });
    }
}
