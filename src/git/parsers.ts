import type { FileChange, FileStatus, RefSummary, StatusSummary } from '../protocol';

export interface RawCommit {
    sha: string;
    parents: string[];
    author: string;
    authorEmail: string;
    authorTime: number;
    committer: string;
    committerTime: number;
    subject: string;
}

export interface RawRef {
    refname: string;
    objectname: string;
    peeled?: string;
    upstream?: string;
    track?: string;
    symref?: string;
    date?: number;
}

export interface BlameLine {
    sha: string;
    author: string;
    authorTime: number;
    summary: string;
    line: number;
    content: string;
}

export interface LogEntry {
    sha: string;
    author: string;
    time: number;
    subject: string;
}

export const LOG_FORMAT = '%H%x1f%P%x1f%an%x1f%ae%x1f%at%x1f%cn%x1f%ct%x1f%s%x1e';
export const LOG_ENTRY_FORMAT = '%H%x1f%an%x1f%at%x1f%s%x1e';
export const COMMIT_HEADER_FORMAT = '%H%x1f%P%x1f%an%x1f%ae%x1f%at%x1f%cn%x1f%ce%x1f%ct%x1f%B';

export function parseLog(raw: string): RawCommit[] {
    const commits: RawCommit[] = [];
    for (const record of raw.split('\x1e')) {
        if (!record.trim()) {
            continue;
        }
        const fields = record.split('\x1f');
        if (fields.length < 8) {
            continue;
        }
        commits.push({
            sha: fields[0].trim(),
            parents: fields[1].trim() ? fields[1].trim().split(' ') : [],
            author: fields[2],
            authorEmail: fields[3],
            authorTime: Number(fields[4]) || 0,
            committer: fields[5],
            committerTime: Number(fields[6]) || 0,
            subject: fields.slice(7).join('\x1f'),
        });
    }
    return commits;
}

export function parseLogEntries(raw: string): LogEntry[] {
    const entries: LogEntry[] = [];
    for (const record of raw.split('\x1e')) {
        if (!record.trim()) {
            continue;
        }
        const fields = record.split('\x1f');
        if (fields.length < 4) {
            continue;
        }
        entries.push({
            sha: fields[0].trim(),
            author: fields[1],
            time: Number(fields[2]) || 0,
            subject: fields.slice(3).join('\x1f'),
        });
    }
    return entries;
}

export function parseRefs(raw: string): RawRef[] {
    const refs: RawRef[] = [];
    for (const line of raw.split('\n')) {
        if (!line.trim()) {
            continue;
        }
        const fields = line.split('\x1f');
        if (fields.length < 7) {
            continue;
        }
        refs.push({
            refname: fields[0],
            objectname: fields[1],
            peeled: fields[2] || undefined,
            upstream: fields[3] || undefined,
            track: fields[4] || undefined,
            symref: fields[5] || undefined,
            date: Number(fields[6]) || undefined,
        });
    }
    return refs;
}

function shortNameFor(refname: string): string {
    if (refname.startsWith('refs/heads/')) {
        return refname.slice('refs/heads/'.length);
    }
    if (refname.startsWith('refs/remotes/')) {
        return refname.slice('refs/remotes/'.length);
    }
    if (refname.startsWith('refs/tags/')) {
        return refname.slice('refs/tags/'.length);
    }
    if (refname.startsWith('refs/stash')) {
        return 'stash';
    }
    return refname;
}

function parseTrack(track?: string): { ahead?: number; behind?: number } {
    if (!track) {
        return {};
    }
    const ahead = /ahead (\d+)/.exec(track);
    const behind = /behind (\d+)/.exec(track);
    return {
        ahead: ahead ? Number(ahead[1]) : undefined,
        behind: behind ? Number(behind[1]) : undefined,
    };
}

export function toRefSummary(ref: RawRef): RefSummary | undefined {
    if (ref.symref) {
        // e.g. refs/remotes/origin/HEAD -> refs/remotes/origin/main
        return undefined;
    }
    let type: RefSummary['type'];
    if (ref.refname.startsWith('refs/heads/')) {
        type = 'local';
    } else if (ref.refname.startsWith('refs/remotes/')) {
        type = 'remote';
    } else if (ref.refname.startsWith('refs/tags/')) {
        type = 'tag';
    } else if (ref.refname.startsWith('refs/stash')) {
        type = 'stash';
    } else {
        type = 'other';
    }
    const { ahead, behind } = parseTrack(ref.track);
    return {
        name: ref.refname,
        shortName: shortNameFor(ref.refname),
        type,
        sha: ref.peeled || ref.objectname,
        upstream: ref.upstream,
        ahead,
        behind,
        date: ref.date,
    };
}

export function parseStatus(raw: string): StatusSummary {
    const summary: StatusSummary = {
        ahead: 0,
        behind: 0,
        staged: 0,
        unstaged: 0,
        untracked: 0,
        conflicted: 0,
    };

    const lines = raw.split(/[\0\n]/);
    for (const line of lines) {
        if (!line) {
            continue;
        }
        if (line.startsWith('# branch.oid ')) {
            continue;
        }
        if (line.startsWith('# branch.head ')) {
            const head = line.slice('# branch.head '.length);
            summary.branch = head === '(detached)' ? undefined : head;
            continue;
        }
        if (line.startsWith('# branch.upstream ')) {
            summary.upstream = line.slice('# branch.upstream '.length);
            continue;
        }
        if (line.startsWith('# branch.ab ')) {
            const match = /\+(\d+) -(\d+)/.exec(line);
            if (match) {
                summary.ahead = Number(match[1]);
                summary.behind = Number(match[2]);
            }
            continue;
        }
        if (line.startsWith('1 ') || line.startsWith('2 ')) {
            const xy = line.slice(2, 4);
            if (xy[0] !== '.' && xy[0] !== ' ') {
                summary.staged += 1;
            }
            if (xy[1] !== '.' && xy[1] !== ' ') {
                summary.unstaged += 1;
            }
            continue;
        }
        if (line.startsWith('u ')) {
            summary.conflicted += 1;
            summary.unstaged += 1;
            continue;
        }
        if (line.startsWith('? ')) {
            summary.untracked += 1;
        }
    }

    return summary;
}

const STATUS_CODES = new Set(['A', 'M', 'D', 'R', 'C', 'T', 'U', '?']);

function toFileStatus(code: string): FileStatus {
    return STATUS_CODES.has(code) ? (code as FileStatus) : 'M';
}

/**
 * Parses the combined output of `git diff --raw --numstat -z`.
 * Raw records provide the status letter, numstat records provide line counts.
 */
export function parseFileChanges(raw: string): FileChange[] {
    const tokens = raw.split('\0');
    const byPath = new Map<string, FileChange>();

    let index = 0;
    while (index < tokens.length) {
        const token = tokens[index];
        if (!token) {
            index += 1;
            continue;
        }

        if (token.startsWith(':')) {
            const fields = token.split(' ');
            const statusToken = fields[fields.length - 1] ?? 'M';
            const status = toFileStatus(statusToken[0]);
            if (status === 'R' || status === 'C') {
                const oldPath = tokens[index + 1] ?? '';
                const newPath = tokens[index + 2] ?? '';
                index += 3;
                byPath.set(newPath, {
                    path: newPath,
                    oldPath,
                    status,
                    additions: 0,
                    deletions: 0,
                    binary: false,
                });
            } else {
                const filePath = tokens[index + 1] ?? '';
                index += 2;
                byPath.set(filePath, {
                    path: filePath,
                    status,
                    additions: 0,
                    deletions: 0,
                    binary: false,
                });
            }
            continue;
        }

        const numstat = /^(\d+|-)\t(\d+|-)\t(.*)$/.exec(token);
        if (numstat) {
            const additions = numstat[1];
            const deletions = numstat[2];
            let filePath = numstat[3];
            let oldPath: string | undefined;
            index += 1;
            if (!filePath) {
                oldPath = tokens[index] ?? '';
                filePath = tokens[index + 1] ?? '';
                index += 2;
            }
            const existing = byPath.get(filePath);
            const change: FileChange = existing ?? {
                path: filePath,
                status: 'M',
                additions: 0,
                deletions: 0,
                binary: false,
            };
            if (oldPath) {
                change.oldPath = oldPath;
            }
            change.binary = additions === '-' || deletions === '-';
            change.additions = additions === '-' ? 0 : Number(additions);
            change.deletions = deletions === '-' ? 0 : Number(deletions);
            byPath.set(filePath, change);
            continue;
        }

        index += 1;
    }

    return [...byPath.values()].sort((a, b) => a.path.localeCompare(b.path));
}

export function parseCommitHeader(raw: string): {
    sha: string;
    parents: string[];
    author: string;
    authorEmail: string;
    authorTime: number;
    committer: string;
    committerEmail: string;
    committerTime: number;
    body: string;
} | undefined {
    const fields = raw.split('\x1f');
    if (fields.length < 9) {
        return undefined;
    }
    return {
        sha: fields[0].trim(),
        parents: fields[1].trim() ? fields[1].trim().split(' ') : [],
        author: fields[2],
        authorEmail: fields[3],
        authorTime: Number(fields[4]) || 0,
        committer: fields[5],
        committerEmail: fields[6],
        committerTime: Number(fields[7]) || 0,
        body: fields.slice(8).join('\x1f').replace(/^\n+/, '').replace(/\s+$/, ''),
    };
}

export function parseBlame(raw: string): BlameLine[] {
    const lines: BlameLine[] = [];
    const meta = new Map<string, { author: string; authorTime: number; summary: string }>();
    let current: Partial<BlameLine> | undefined;

    const flush = () => {
        if (current?.sha && current.line !== undefined) {
            const known = meta.get(current.sha);
            lines.push({
                sha: current.sha,
                line: current.line,
                author: current.author ?? known?.author ?? '',
                authorTime: current.authorTime ?? known?.authorTime ?? 0,
                summary: current.summary ?? known?.summary ?? '',
                content: current.content ?? '',
            });
        }
        current = undefined;
    };

    for (const line of raw.split('\n')) {
        if (/^[0-9a-f]{40,64} \d+ \d+/.test(line)) {
            flush();
            const fields = line.split(' ');
            current = { sha: fields[0], line: Number(fields[2]) };
            const known = meta.get(fields[0]);
            if (known) {
                current.author = known.author;
                current.authorTime = known.authorTime;
                current.summary = known.summary;
            }
            continue;
        }
        if (!current) {
            continue;
        }
        if (line.startsWith('author ')) {
            current.author = line.slice('author '.length);
            meta.set(current.sha!, {
                author: current.author,
                authorTime: current.authorTime ?? 0,
                summary: current.summary ?? '',
            });
            continue;
        }
        if (line.startsWith('author-time ')) {
            current.authorTime = Number(line.slice('author-time '.length)) || 0;
            continue;
        }
        if (line.startsWith('summary ')) {
            current.summary = line.slice('summary '.length);
            const known = meta.get(current.sha!) ?? { author: '', authorTime: 0, summary: '' };
            meta.set(current.sha!, { ...known, summary: current.summary });
            continue;
        }
        if (line.startsWith('\t')) {
            current.content = line.slice(1);
            flush();
        }
    }

    return lines;
}

export function parseLineLog(raw: string): LogEntry[] {
    const entries: LogEntry[] = [];
    for (const block of raw.split('\0')) {
        const text = block.replace(/^\n+/, '').trim();
        if (!text) {
            continue;
        }
        const fields = text.split('\x1f');
        if (fields.length < 4 || !fields[0].trim()) {
            continue;
        }
        entries.push({
            sha: fields[0].trim(),
            author: fields[1],
            time: Number(fields[2]) || 0,
            subject: fields.slice(3).join('\x1f'),
        });
    }
    return entries;
}

export interface RawWorktree {
    path: string;
    head?: string;
    branch?: string;
    bare: boolean;
    detached: boolean;
    locked: boolean;
    prunable: boolean;
    lockReason?: string;
    pruneReason?: string;
}

/** Parses `git worktree list --porcelain` output. */
export function parseWorktrees(raw: string): RawWorktree[] {
    const worktrees: RawWorktree[] = [];
    let current: RawWorktree | undefined;

    const flush = () => {
        if (current) {
            worktrees.push(current);
            current = undefined;
        }
    };

    for (const line of raw.split('\n')) {
        if (!line.trim()) {
            flush();
            continue;
        }
        const separator = line.indexOf(' ');
        const key = separator === -1 ? line : line.slice(0, separator);
        const value = separator === -1 ? '' : line.slice(separator + 1);

        if (key === 'worktree') {
            flush();
            current = { path: value, bare: false, detached: false, locked: false, prunable: false };
            continue;
        }
        if (!current) {
            continue;
        }
        switch (key) {
            case 'HEAD':
                current.head = value.trim() || undefined;
                break;
            case 'branch':
                current.branch = value.startsWith('refs/heads/')
                    ? value.slice('refs/heads/'.length)
                    : value;
                break;
            case 'detached':
                current.detached = true;
                break;
            case 'bare':
                current.bare = true;
                break;
            case 'locked':
                current.locked = true;
                current.lockReason = value || undefined;
                break;
            case 'prunable':
                current.prunable = true;
                current.pruneReason = value || undefined;
                break;
            default:
                break;
        }
    }
    flush();
    return worktrees;
}

export type RawSubmoduleFlag = ' ' | '+' | '-' | 'U';

export interface RawSubmodule {
    flag: RawSubmoduleFlag;
    sha?: string;
    path: string;
    describe?: string;
}

/** Parses `git submodule status [--recursive]` output. */
export function parseSubmoduleStatus(raw: string): RawSubmodule[] {
    const submodules: RawSubmodule[] = [];
    for (const line of raw.split('\n')) {
        if (!line.trim()) {
            continue;
        }
        const flag = line[0];
        if (flag !== ' ' && flag !== '+' && flag !== '-' && flag !== 'U') {
            continue;
        }
        const rest = line.slice(1).trim();
        const match = /^(?:([0-9a-fA-F]+)\s+)?(.*?)(?:\s+\(([^()]*)\))?$/.exec(rest);
        if (!match) {
            continue;
        }
        submodules.push({
            flag,
            sha: match[1],
            path: match[2] ?? '',
            describe: match[3],
        });
    }
    return submodules;
}

export interface SubmoduleConfig {
    path?: string;
    url?: string;
}

/**
 * Parses `git config -z --file .gitmodules --get-regexp` output, where entries are
 * NUL-separated `submodule.<name>.<key>\n<value>` pairs keyed by submodule name.
 */
export function parseSubmoduleConfig(raw: string): Map<string, SubmoduleConfig> {
    const config = new Map<string, SubmoduleConfig>();
    for (const entry of raw.split('\0')) {
        if (!entry.trim()) {
            continue;
        }
        const newline = entry.indexOf('\n');
        const key = newline === -1 ? entry : entry.slice(0, newline);
        const value = newline === -1 ? '' : entry.slice(newline + 1);
        const match = /^submodule\.(.*)\.(path|url)$/.exec(key.trim());
        if (!match) {
            continue;
        }
        const current = config.get(match[1]) ?? {};
        if (match[2] === 'path') {
            current.path = value.trim();
        } else {
            current.url = value.trim();
        }
        config.set(match[1], current);
    }
    return config;
}
