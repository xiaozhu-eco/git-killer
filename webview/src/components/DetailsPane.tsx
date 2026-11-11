import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { CommitDetails, CompareDetails, FileChange, RepoState } from '../../../src/protocol';
import { basename, formatDate, relativeTime, shortSha } from '../format';
import {
    IconArrowRight,
    IconBranch,
    IconCheck,
    IconCheckout,
    IconChevron,
    IconClose,
    IconCloud,
    IconCommit,
    IconCopy,
    IconDiff,
    IconFetch,
    IconPull,
    IconPush,
    IconRefresh,
    IconStash,
    IconTag,
    IconUndo,
    IconWarning,
} from './icons';

export type CommitAction =
    | 'checkout'
    | 'createBranch'
    | 'createTag'
    | 'cherryPick'
    | 'revert'
    | 'reset'
    | 'compareHead';

export type RepoAction = 'fetch' | 'pull' | 'push' | 'stashPush';

interface DetailsPaneProps {
    state: RepoState | null;
    commit?: CommitDetails;
    compare?: CompareDetails;
    onOpenDiff: (from: string, to: string, file: string) => void;
    onAction: (action: CommitAction, sha: string) => void;
    onRepoAction: (action: RepoAction) => void;
    onCopy: (text: string) => void;
    onClose: () => void;
    onSwitchBranch: () => void;
}

const TONE = {
    blue: 'tone-blue',
    green: 'tone-green',
    purple: 'tone-purple',
    orange: 'tone-orange',
    red: 'tone-red',
    neutral: 'tone-neutral',
} as const;

type Tone = keyof typeof TONE;

function branchLabel(state: RepoState | null): string {
    if (!state) {
        return 'no repository';
    }
    if (state.head.branch) {
        return state.head.branch;
    }
    if (state.head.detached && state.head.sha) {
        return `detached @ ${shortSha(state.head.sha)}`;
    }
    return 'no branch';
}

function capitalize(value: string): string {
    return value.length > 0 ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}

function Tracking(props: { ahead: number; behind: number }) {
    return (
        <span className="ctx-tracking">
            {props.ahead > 0 && <span className="up">↑{props.ahead}</span>}
            {props.behind > 0 && <span className="down">↓{props.behind}</span>}
        </span>
    );
}

function authorInitial(author: string): string {
    const trimmed = author.trim();
    return trimmed.length > 0 ? trimmed[0].toUpperCase() : '?';
}

export function DetailsPane(props: DetailsPaneProps) {
    const { commit, compare } = props;
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        scrollRef.current?.scrollTo({ top: 0 });
    }, [commit?.sha, compare?.a, compare?.b]);

    return (
        <aside className="details">
            <DetailsChrome
                state={props.state}
                onSwitchBranch={props.onSwitchBranch}
                onClose={props.onClose}
            />
            <div className="details-scroll" ref={scrollRef}>
                {compare ? (
                    <CompareView
                        key={`${compare.a}:${compare.b}`}
                        compare={compare}
                        onOpenDiff={props.onOpenDiff}
                    />
                ) : commit ? (
                    <CommitView
                        key={commit.sha}
                        state={props.state}
                        commit={commit}
                        onOpenDiff={props.onOpenDiff}
                        onAction={props.onAction}
                        onCopy={props.onCopy}
                    />
                ) : (
                    <EmptyView
                        state={props.state}
                        onRepoAction={props.onRepoAction}
                        onSwitchBranch={props.onSwitchBranch}
                    />
                )}
            </div>
        </aside>
    );
}

function DetailsChrome(props: {
    state: RepoState | null;
    onSwitchBranch: () => void;
    onClose: () => void;
}) {
    const { state } = props;
    const branch = branchLabel(state);
    const ahead = state?.status.ahead ?? 0;
    const behind = state?.status.behind ?? 0;
    const changes = state
        ? state.status.staged + state.status.unstaged + state.status.untracked
        : 0;

    return (
        <div className="details-chrome">
            <div className="ctx-chips">
                <button
                    type="button"
                    className="ctx-chip ctx-branch"
                    onClick={props.onSwitchBranch}
                    disabled={!state}
                    title={state ? 'Switch branch (Cmd/Ctrl+Alt+B)' : 'No repository'}
                >
                    <IconBranch width={11} height={11} />
                    <span className="ctx-branch-name">{branch}</span>
                    {(ahead > 0 || behind > 0) && <Tracking ahead={ahead} behind={behind} />}
                    <IconChevron width={8} height={8} className="ctx-caret" />
                </button>

                {state?.status.upstream && (
                    <span className="ctx-chip" title={`Tracking ${state.status.upstream}`}>
                        <IconCloud width={10} height={10} />
                        <span className="ctx-ellipsis">{state.status.upstream}</span>
                    </span>
                )}

                {state?.head.sha && (
                    <span className="ctx-chip mono" title={`HEAD is ${state.head.sha}`}>
                        <IconCommit width={10} height={10} />
                        {shortSha(state.head.sha)}
                    </span>
                )}

                {state && (
                    <span
                        className={`ctx-chip ${state.status.conflicted > 0 ? 'warn' : ''}`}
                        title={`${state.status.staged} staged · ${state.status.unstaged} unstaged · ${state.status.untracked} untracked`}
                    >
                        {state.status.conflicted > 0
                            ? `${state.status.conflicted} conflict${state.status.conflicted === 1 ? '' : 's'}`
                            : `${changes} change${changes === 1 ? '' : 's'}`}
                    </span>
                )}

                {state?.operation && (
                    <span className="ctx-chip warn" title="Operation in progress">
                        <IconWarning width={10} height={10} />
                        {capitalize(state.operation.kind)}
                        {state.operation.conflicted > 0 ? ` · ${state.operation.conflicted}` : ''}
                    </span>
                )}
            </div>

            <button
                type="button"
                className="details-close"
                onClick={props.onClose}
                title="Hide commit details"
            >
                <IconClose width={12} height={12} />
            </button>
        </div>
    );
}

function CommitView(props: {
    state: RepoState | null;
    commit: CommitDetails;
    onOpenDiff: (from: string, to: string, file: string) => void;
    onAction: (action: CommitAction, sha: string) => void;
    onCopy: (text: string) => void;
}) {
    const { commit, state } = props;
    const [expanded, setExpanded] = useState(false);
    const branch = branchLabel(state);
    const isHead = state?.head.sha === commit.sha;
    const short = shortSha(commit.sha);
    const from = commit.parents[0] ?? 'EMPTY';
    const messageBody = commit.body.startsWith(commit.subject)
        ? commit.body.slice(commit.subject.length).replace(/^\s*\n/, '')
        : commit.body;
    const bodyLines = messageBody ? messageBody.split('\n').length : 0;
    const longMessage = messageBody.length > 360 || bodyLines > 8;
    const additions = commit.files.reduce((sum, file) => sum + file.additions, 0);
    const deletions = commit.files.reduce((sum, file) => sum + file.deletions, 0);
    const refs = commit.refs.filter(ref => ref.type !== 'stash');

    return (
        <>
            <header className="commit-hero">
                <div className="commit-refs">
                    {isHead && <span className="head-badge">HEAD</span>}
                    {refs.map(ref => (
                        <span
                            key={ref.name}
                            className={`ref-chip ref-${ref.type}`}
                            title={ref.name}
                        >
                            {ref.shortName}
                        </span>
                    ))}
                    <span className="spacer" />
                    <button
                        type="button"
                        className="copy-chip"
                        title={`Copy full SHA ${commit.sha}`}
                        onClick={() => props.onCopy(commit.sha)}
                    >
                        <code>{short}</code>
                        <IconCopy width={10} height={10} />
                    </button>
                </div>

                <h2 className="commit-subject" title={commit.subject}>
                    {commit.subject || '(no subject)'}
                </h2>

                <div className="commit-byline">
                    <span className="avatar" aria-hidden>
                        {authorInitial(commit.author)}
                    </span>
                    <span className="byline-author" title={commit.authorEmail}>
                        {commit.author}
                    </span>
                    <span className="byline-dot">·</span>
                    <span title={formatDate(commit.authorTime)}>
                        {relativeTime(commit.authorTime)}
                    </span>
                    {isHead && <span className="byline-head">HEAD</span>}
                </div>
            </header>

            <div className="commit-metadata">
                <MetaRow label="Author" value={commit.author} sub={commit.authorEmail} />
                <MetaRow
                    label="Committed"
                    value={formatDate(commit.authorTime)}
                    sub={relativeTime(commit.authorTime)}
                />
                {commit.committer !== commit.author && (
                    <MetaRow
                        label="Committer"
                        value={commit.committer}
                        sub={`${formatDate(commit.committerTime)} · ${relativeTime(commit.committerTime)}`}
                    />
                )}
                <div className="meta-row">
                    <span className="meta-label">Parents</span>
                    <div className="meta-value parent-list">
                        {commit.parents.length === 0 ? (
                            <span className="muted">root commit</span>
                        ) : (
                            commit.parents.map(parent => (
                                <button
                                    key={parent}
                                    type="button"
                                    className="parent-chip"
                                    onClick={() => props.onCopy(parent)}
                                    title={`Copy parent SHA ${parent}`}
                                >
                                    {shortSha(parent)}
                                </button>
                            ))
                        )}
                    </div>
                </div>
            </div>

            {messageBody && (
                <section className={`commit-message ${longMessage && !expanded ? 'clamped' : ''}`}>
                    <pre>{messageBody}</pre>
                    {longMessage && (
                        <button
                            type="button"
                            className="message-toggle"
                            onClick={() => setExpanded(value => !value)}
                        >
                            {expanded ? 'Show less' : 'Show full message'}
                        </button>
                    )}
                </section>
            )}

            <ActionSection title="Navigate" hint="Move around without leaving the graph.">
                <ActionCard
                    icon={<IconCheckout />}
                    tone="blue"
                    title={isHead ? 'Already checked out' : `Checkout ${short} (detached)`}
                    description={
                        isHead
                            ? 'HEAD already points at this commit.'
                            : 'Detach HEAD here to inspect or build this revision.'
                    }
                    command={`git switch --detach ${short}`}
                    onClick={() => props.onAction('checkout', commit.sha)}
                    disabled={isHead}
                    disabledReason="This commit is already HEAD."
                />
                <ActionCard
                    icon={<IconDiff />}
                    tone="neutral"
                    title={isHead ? 'Nothing to compare with HEAD' : 'Compare HEAD with this commit'}
                    description="Open a file-by-file diff between the current HEAD and this commit."
                    command={`git diff HEAD ${short}`}
                    onClick={() => props.onAction('compareHead', commit.sha)}
                    disabled={isHead}
                    disabledReason="This commit is already HEAD."
                />
            </ActionSection>

            <ActionSection
                title="Create from this commit"
                hint="Add a reference without moving the current branch."
            >
                <ActionCard
                    icon={<IconBranch />}
                    tone="green"
                    title={`New branch at ${short}`}
                    description="Start a branch here; your current branch stays untouched."
                    command={`git switch -c <name> ${short}`}
                    onClick={() => props.onAction('createBranch', commit.sha)}
                />
                <ActionCard
                    icon={<IconTag />}
                    tone="purple"
                    title={`New tag at ${short}`}
                    description="Create a lightweight or annotated tag on this commit."
                    command={`git tag <name> ${short}`}
                    onClick={() => props.onAction('createTag', commit.sha)}
                />
            </ActionSection>

            <ActionSection
                title={`Apply to ${branch}`}
                hint="These change the current branch — a backup ref is created first."
            >
                <ActionCard
                    icon={<IconCopy />}
                    tone="green"
                    title={`Cherry-pick onto ${branch}`}
                    description="Copy this commit on top of the current branch as a new commit."
                    command={`git cherry-pick ${short}`}
                    onClick={() => props.onAction('cherryPick', commit.sha)}
                    disabled={isHead}
                    disabledReason="This commit is already HEAD."
                />
                <ActionCard
                    icon={<IconUndo />}
                    tone="orange"
                    title={`Revert on ${branch}`}
                    description="Create a new commit that undoes the changes of this commit."
                    command={`git revert --no-edit ${short}`}
                    onClick={() => props.onAction('revert', commit.sha)}
                />
                <ActionCard
                    icon={<IconRefresh />}
                    tone="red"
                    danger
                    title={`Reset ${branch} to ${short}`}
                    description="Move the branch here and discard newer commits. Recoverable via backup ref."
                    command={`git reset --soft|--mixed|--hard ${short}`}
                    onClick={() => props.onAction('reset', commit.sha)}
                    disabled={isHead}
                    disabledReason="This commit is already HEAD."
                />
            </ActionSection>

            <section className="files-section">
                <div className="files-head">
                    <span className="files-title">Changed files</span>
                    <span className="count-badge">{commit.files.length}</span>
                    <span className="spacer" />
                    {additions > 0 && <span className="stat-add">+{additions}</span>}
                    {deletions > 0 && <span className="stat-del">−{deletions}</span>}
                </div>
                {commit.files.length > 0 && (
                    <div className="files-hint">
                        Click a file to diff{' '}
                        {commit.parents.length > 0 ? 'against its parent' : 'against an empty tree'}.
                    </div>
                )}
                <FileList
                    files={commit.files}
                    onOpen={file => props.onOpenDiff(from, commit.sha, file.path)}
                />
            </section>
        </>
    );
}

function MetaRow(props: { label: string; value: string; sub?: string }) {
    return (
        <div className="meta-row">
            <span className="meta-label">{props.label}</span>
            <span className="meta-value">
                <span className="meta-main">{props.value}</span>
                {props.sub && <span className="meta-sub">{props.sub}</span>}
            </span>
        </div>
    );
}

function CompareView(props: {
    compare: CompareDetails;
    onOpenDiff: (from: string, to: string, file: string) => void;
}) {
    const { compare } = props;
    const additions = compare.files.reduce((sum, file) => sum + file.additions, 0);
    const deletions = compare.files.reduce((sum, file) => sum + file.deletions, 0);

    return (
        <>
            <header className="compare-hero">
                <div className="compare-end">
                    <span className="compare-label">Base</span>
                    <code className="compare-sha" title={compare.a}>
                        {shortSha(compare.a)}
                    </code>
                </div>
                <IconArrowRight className="compare-arrow" width={14} height={14} />
                <div className="compare-end target">
                    <span className="compare-label">Target</span>
                    <code className="compare-sha" title={compare.b}>
                        {shortSha(compare.b)}
                    </code>
                </div>
            </header>

            <div className="compare-summary">
                <span>
                    {compare.files.length} file{compare.files.length === 1 ? '' : 's'} changed
                </span>
                <span className="spacer" />
                {additions > 0 && <span className="stat-add">+{additions}</span>}
                {deletions > 0 && <span className="stat-del">−{deletions}</span>}
            </div>

            <div className="files-hint">
                Files show what changed from base to target. Click a file to open its diff.
            </div>
            <FileList
                files={compare.files}
                onOpen={file => props.onOpenDiff(compare.a, compare.b, file.path)}
            />
        </>
    );
}

function EmptyView(props: {
    state: RepoState | null;
    onRepoAction: (action: RepoAction) => void;
    onSwitchBranch: () => void;
}) {
    if (!props.state) {
        return (
            <>
                <div className="empty-state">
                    <div className="empty-icon">
                        <IconWarning width={22} height={22} />
                    </div>
                    <div className="empty-title">No repository</div>
                    <div className="empty-text">
                        Open a folder that contains a Git repository to browse commits and run
                        operations.
                    </div>
                </div>
            </>
        );
    }

    const branch = branchLabel(props.state);
    return (
        <>
            <div className="empty-state">
                <div className="empty-icon">
                    <IconCommit width={22} height={22} />
                </div>
                <div className="empty-title">No commit selected</div>
                <div className="empty-text">
                    Pick a commit in the graph to inspect its message, files and the operations
                    that apply to it.
                </div>
            </div>

            <div className="hint-cards">
                <div className="hint-card">
                    <span className="hint-check">
                        <IconCheck width={11} height={11} />
                    </span>
                    <span>
                        <b>Click</b> a commit to open its details
                    </span>
                </div>
                <div className="hint-card">
                    <span className="hint-check">
                        <IconCheck width={11} height={11} />
                    </span>
                    <span>
                        <b>Cmd/Ctrl-click</b> a second commit to compare
                    </span>
                </div>
                <div className="hint-card">
                    <span className="hint-check">
                        <IconCheck width={11} height={11} />
                    </span>
                    <span>
                        <b>Hover</b> a line for inline blame
                    </span>
                </div>
            </div>

            <ActionSection
                title={`Actions on ${branch}`}
                hint="These run against the current branch, not a selected commit."
            >
                <ActionCard
                    icon={<IconFetch />}
                    tone="blue"
                    title="Fetch all remotes"
                    description="Update remote-tracking refs. Your branch does not move."
                    command="git fetch --all --prune"
                    onClick={() => props.onRepoAction('fetch')}
                />
                <ActionCard
                    icon={<IconPull />}
                    tone="green"
                    title={`Pull ${branch}`}
                    description="Fetch and integrate the upstream into the current branch."
                    command="git pull"
                    onClick={() => props.onRepoAction('pull')}
                />
                <ActionCard
                    icon={<IconPush />}
                    tone="purple"
                    title={`Push ${branch}`}
                    description="Publish the current branch to its upstream."
                    command="git push"
                    onClick={() => props.onRepoAction('push')}
                />
                <ActionCard
                    icon={<IconStash />}
                    tone="orange"
                    title="Stash changes"
                    description="Save working tree changes so you can restore them later."
                    command="git stash push -u"
                    onClick={() => props.onRepoAction('stashPush')}
                />
                <ActionCard
                    icon={<IconBranch />}
                    tone="neutral"
                    title="Switch branch…"
                    description="Pick another local or remote branch to check out."
                    command="git switch <branch>"
                    onClick={props.onSwitchBranch}
                />
            </ActionSection>
        </>
    );
}

function ActionSection(props: { title: string; hint?: string; children: ReactNode }) {
    return (
        <section className="action-section">
            <div className="action-section-title">{props.title}</div>
            {props.hint && <div className="action-section-hint">{props.hint}</div>}
            <div className="action-list">{props.children}</div>
        </section>
    );
}

function ActionCard(props: {
    icon: ReactNode;
    tone: Tone;
    title: string;
    description: string;
    command: string;
    onClick?: () => void;
    danger?: boolean;
    disabled?: boolean;
    disabledReason?: string;
}) {
    return (
        <button
            type="button"
            className={`action-card ${TONE[props.tone]} ${props.danger ? 'danger' : ''}`}
            onClick={props.onClick}
            disabled={props.disabled}
            title={props.disabled ? props.disabledReason : props.command}
        >
            <span className="action-icon">{props.icon}</span>
            <span className="action-main">
                <span className="action-head">
                    <span className="action-title">{props.title}</span>
                    <IconChevron className="action-chevron" width={9} height={9} />
                </span>
                <span className="action-desc">{props.description}</span>
                <code className="action-command">{props.command}</code>
            </span>
        </button>
    );
}

function FileList(props: { files: FileChange[]; onOpen: (file: FileChange) => void }) {
    if (props.files.length === 0) {
        return <div className="files-empty">No changes.</div>;
    }
    return (
        <ul className="file-list">
            {props.files.map(file => (
                <li
                    key={file.path}
                    className="file-row"
                    onClick={() => props.onOpen(file)}
                    title={file.oldPath ? `${file.oldPath} → ${file.path}` : file.path}
                >
                    <span className={`status ${file.status}`}>{file.status}</span>
                    <span className="file-name">
                        {basename(file.path)}
                        <span className="file-dir">
                            {file.path.slice(
                                0,
                                Math.max(0, file.path.length - basename(file.path).length)
                            )}
                        </span>
                    </span>
                    <span className="file-stats">
                        {file.binary ? (
                            <span className="muted">bin</span>
                        ) : (
                            <>
                                {file.additions > 0 && (
                                    <span className="stat-add">+{file.additions}</span>
                                )}
                                {file.deletions > 0 && (
                                    <span className="stat-del">−{file.deletions}</span>
                                )}
                            </>
                        )}
                    </span>
                </li>
            ))}
        </ul>
    );
}
