import { describe, expect, it } from 'vitest';
import {
    parseBlame,
    parseCommitHeader,
    parseFileChanges,
    parseLineLog,
    parseLog,
    parseRefs,
    parseStatus,
    parseSubmoduleConfig,
    parseSubmoduleStatus,
    parseWorktrees,
    toRefSummary,
} from '../../src/git/parsers';

const US = '\x1f';
const RS = '\x1e';

describe('parseLog', () => {
    it('parses commits with parents and subjects', () => {
        const raw =
            `aaa${US}bbb ccc${US}Alice${US}a@example.com${US}1700000000${US}Alice${US}1700000001${US}subject one${RS}` +
            `\nbbb${US}${US}Bob${US}b@example.com${US}1600000000${US}Bob${US}1600000001${US}subject two${RS}`;
        const commits = parseLog(raw);
        expect(commits).toHaveLength(2);
        expect(commits[0]).toMatchObject({
            sha: 'aaa',
            parents: ['bbb', 'ccc'],
            author: 'Alice',
            authorTime: 1700000000,
            subject: 'subject one',
        });
        expect(commits[1].parents).toEqual([]);
    });
});

describe('refs', () => {
    it('peels annotated tags and skips symbolic remote HEAD', () => {
        const raw = [
            `refs/heads/main${US}tagobject${US}commit1${US}origin/main${US}[ahead 2, behind 1]${US}${US}1700000000`,
            `refs/remotes/origin/HEAD${US}commit1${US}${US}${US}${US}refs/remotes/origin/main${US}1700000000`,
            `refs/tags/v1${US}tagobject${US}commit2${US}${US}${US}${US}1690000000`,
        ].join('\n');
        const refs = parseRefs(raw).map(toRefSummary).filter(Boolean);
        expect(refs).toHaveLength(2);
        expect(refs[0]).toMatchObject({
            shortName: 'main',
            type: 'local',
            sha: 'commit1',
            ahead: 2,
            behind: 1,
        });
        expect(refs[1]).toMatchObject({ shortName: 'v1', type: 'tag', sha: 'commit2' });
    });
});

describe('parseStatus', () => {
    it('reads branch tracking and change counters', () => {
        const raw = [
            '# branch.oid abc',
            '# branch.head main',
            '# branch.upstream origin/main',
            '# branch.ab +2 -3',
            '1 .M N... 100644 100644 100644 hash hash a.txt',
            '1 M. N... 100644 100644 100644 hash hash b.txt',
            '2 R. N... 100644 100644 100644 hash hash R100 new.txt',
            'old.txt',
            'u UU N... 100644 100644 100644 hash hash conflict.txt',
            '? untracked.txt',
        ].join('\0');
        const status = parseStatus(raw);
        expect(status.branch).toBe('main');
        expect(status.upstream).toBe('origin/main');
        expect(status.ahead).toBe(2);
        expect(status.behind).toBe(3);
        expect(status.staged).toBe(2);
        expect(status.unstaged).toBe(2);
        expect(status.conflicted).toBe(1);
        expect(status.untracked).toBe(1);
    });
});

describe('parseFileChanges', () => {
    it('combines raw status with numstat counts and renames', () => {
        const raw = [
            ':100644 100644 aaa bbb R100',
            'sub/old.txt',
            'sub/new.txt',
            '0\t0\t',
            'sub/old.txt',
            'sub/new.txt',
            ':000000 100644 000 ccc A',
            'img.png',
            '-\t-\timg.png',
            ':100644 100644 aaa bbb M',
            'src/app.ts',
            '10\t2\tsrc/app.ts',
            '',
        ].join('\0');
        const files = parseFileChanges(raw);
        const byPath = new Map(files.map(file => [file.path, file]));
        expect(byPath.get('sub/new.txt')).toMatchObject({
            status: 'R',
            oldPath: 'sub/old.txt',
            additions: 0,
            deletions: 0,
            binary: false,
        });
        expect(byPath.get('img.png')).toMatchObject({ status: 'A', binary: true });
        expect(byPath.get('src/app.ts')).toMatchObject({ additions: 10, deletions: 2, status: 'M' });
    });
});

describe('parseCommitHeader', () => {
    it('keeps multi-line bodies', () => {
        const raw = `abc${US}p1 p2${US}Alice${US}a@example.com${US}100${US}Bob${US}b@example.com${US}200${US}subject\n\nbody line 1\nbody line 2`;
        const header = parseCommitHeader(raw)!;
        expect(header.parents).toEqual(['p1', 'p2']);
        expect(header.body).toBe('subject\n\nbody line 1\nbody line 2');
    });
});

describe('parseBlame', () => {
    it('reuses metadata for subsequent lines of the same commit', () => {
        const raw = [
            'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa 1 1 2',
            'author Alice',
            'author-time 1700000000',
            'summary first',
            '\tline one',
            'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa 2 2',
            '\tline two',
            'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb 3 3 1',
            'author Bob',
            'author-time 1800000000',
            'summary second',
            '\tline three',
        ].join('\n');
        const lines = parseBlame(raw);
        expect(lines).toHaveLength(3);
        expect(lines[1]).toMatchObject({ sha: 'a'.repeat(40), author: 'Alice', line: 2, content: 'line two' });
        expect(lines[2]).toMatchObject({ author: 'Bob', line: 3 });
    });
});

describe('parseLineLog', () => {
    it('parses NUL separated blocks', () => {
        const raw = `\n${US}${US}${US}`;
        expect(parseLineLog(raw)).toHaveLength(0);
        const valid = `\n${'a'.repeat(40)}${US}Alice${US}1700000000${US}subject\n\0\n${'b'.repeat(40)}${US}Bob${US}1600000000${US}older\0`;
        const entries = parseLineLog(valid);
        expect(entries).toHaveLength(2);
        expect(entries[0]).toMatchObject({ author: 'Alice', subject: 'subject' });
        expect(entries[1]).toMatchObject({ author: 'Bob', subject: 'older' });
    });
});

describe('parseWorktrees', () => {
    it('reads each porcelain block with branch, detached and prunable flags', () => {
        const raw = [
            'worktree /repo',
            'HEAD aaaa',
            'branch refs/heads/main',
            '',
            'worktree /repo-fix',
            'HEAD bbbb',
            'branch refs/heads/fix/lane',
            'locked reason here',
            '',
            'worktree /repo-old',
            'HEAD cccc',
            'detached',
            'prunable gitdir file points to non-existent location',
            '',
        ].join('\n');
        const worktrees = parseWorktrees(raw);
        expect(worktrees).toHaveLength(3);
        expect(worktrees[0]).toMatchObject({ path: '/repo', branch: 'main', detached: false, locked: false });
        expect(worktrees[1]).toMatchObject({ path: '/repo-fix', branch: 'fix/lane', locked: true });
        expect(worktrees[2]).toMatchObject({
            path: '/repo-old',
            detached: true,
            prunable: true,
        });
        expect(worktrees[2].branch).toBeUndefined();
    });
});

describe('parseSubmoduleStatus', () => {
    it('maps status flags and keeps paths with spaces', () => {
        const raw = [
            ' aaaa vendor/design-system (heads/main)',
            '+bbbb vendor/icons (v1.2.0)',
            '-cccc vendor/legacy',
            'Udddd vendor/a b (heads/main)',
        ].join('\n');
        const submodules = parseSubmoduleStatus(raw);
        expect(submodules).toHaveLength(4);
        expect(submodules[0]).toMatchObject({
            flag: ' ',
            sha: 'aaaa',
            path: 'vendor/design-system',
            describe: 'heads/main',
        });
        expect(submodules[1]).toMatchObject({ flag: '+', path: 'vendor/icons', describe: 'v1.2.0' });
        expect(submodules[2]).toMatchObject({ flag: '-', path: 'vendor/legacy', describe: undefined });
        expect(submodules[3]).toMatchObject({ flag: 'U', path: 'vendor/a b', describe: 'heads/main' });
    });
});

describe('parseSubmoduleConfig', () => {
    it('pairs path and url entries by submodule name', () => {
        const raw = [
            'submodule.vendor/icons.path\nvendor/icons',
            'submodule.vendor/icons.url\nhttps://example.com/icons.git',
            'submodule.docs.path\ndocs',
            '',
        ].join('\0');
        const config = parseSubmoduleConfig(raw);
        expect(config.get('vendor/icons')).toEqual({
            path: 'vendor/icons',
            url: 'https://example.com/icons.git',
        });
        expect(config.get('docs')).toEqual({ path: 'docs', url: undefined });
    });
});
