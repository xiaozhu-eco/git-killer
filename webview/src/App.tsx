import { useCallback, useEffect, useRef, useState } from 'react';
import type {
    CommitDetails,
    CompareDetails,
    HostToWebview,
    RebaseTodoItem,
    RefSummary,
    RepoState,
    RepoSummary,
} from '../../src/protocol';
import { ContextMenu, type MenuItem } from './components/ContextMenu';
import { DetailsPane, type CommitAction } from './components/DetailsPane';
import { GraphList } from './components/GraphList';
import { RebaseDialog } from './components/RebaseDialog';
import { Toolbar } from './components/Toolbar';
import { shortSha } from './format';
import { post, vscode } from './vscodeApi';

interface ToastState {
    kind: 'info' | 'warn' | 'error';
    message: string;
}

type MenuTarget =
    | { kind: 'commit'; sha: string; x: number; y: number }
    | { kind: 'ref'; ref: RefSummary; x: number; y: number };

/** Right-click menu for a branch/tag chip in the graph. */
function refMenuItems(ref: RefSummary): MenuItem[] {
    const isTag = ref.type === 'tag';
    return [
        { label: `${isTag ? 'tag' : 'branch'}: ${ref.shortName}`, header: true },
        {
            label: isTag ? 'Copy tag name' : 'Copy branch name',
            action: () => post({ type: 'copy', text: ref.shortName }),
        },
        {
            label: 'Copy full ref name',
            action: () => post({ type: 'copy', text: ref.name }),
        },
    ];
}

export function App() {
    const [state, setState] = useState<RepoState | null>(null);
    const [repos, setRepos] = useState<RepoSummary[]>([]);
    const [details, setDetails] = useState<{ commit?: CommitDetails; compare?: CompareDetails }>({});
    const [busy, setBusy] = useState(false);
    const [busyLabel, setBusyLabel] = useState<string | undefined>();
    const [selected, setSelected] = useState<string[]>([]);
    const [filterText, setFilterText] = useState('');
    const [scope, setScope] = useState<'all' | 'current'>('all');
    const [toast, setToast] = useState<ToastState | null>(null);
    const [menu, setMenu] = useState<MenuTarget | null>(null);
    const [jumpTo, setJumpTo] = useState<{ sha: string; nonce: number } | undefined>();
    const jumpNonce = useRef(0);
    const [message, setMessage] = useState('');
    const [amend, setAmend] = useState(false);
    const [commitAll, setCommitAll] = useState(false);
    const [rebase, setRebase] = useState<{ base: string; items: RebaseTodoItem[] } | null>(null);
    const [detailsOpen, setDetailsOpen] = useState(
        () => vscode.getState<{ detailsOpen?: boolean }>()?.detailsOpen ?? true
    );
    const toastTimer = useRef<number>();

    const showToast = useCallback((kind: ToastState['kind'], text: string) => {
        setToast({ kind, message: text });
        window.clearTimeout(toastTimer.current);
        toastTimer.current = window.setTimeout(() => setToast(null), 4000);
    }, []);

    useEffect(() => {
        const listener = (event: MessageEvent<HostToWebview>) => {
            const payload = event.data;
            switch (payload.type) {
                case 'state':
                    setState(payload.state);
                    setFilterText(payload.state.filter.text);
                    setScope(payload.state.filter.scope);
                    break;
                case 'repos':
                    setRepos(payload.repos);
                    break;
                case 'details':
                    setDetails({ commit: payload.commit, compare: payload.compare });
                    if (payload.commit || payload.compare) {
                        setDetailsOpen(true);
                    } else {
                        setSelected([]);
                    }
                    break;
                case 'select':
                    setSelected([payload.sha]);
                    break;
                case 'committed':
                    setMessage('');
                    setAmend(false);
                    setCommitAll(false);
                    break;
                case 'rebaseTodo':
                    setRebase({ base: payload.base, items: payload.items });
                    break;
                case 'busy':
                    setBusy(payload.busy);
                    setBusyLabel(payload.label);
                    break;
                case 'toast':
                    showToast(payload.kind, payload.message);
                    break;
                default:
                    break;
            }
        };
        window.addEventListener('message', listener);
        post({ type: 'ready' });
        return () => {
            window.removeEventListener('message', listener);
            window.clearTimeout(toastTimer.current);
        };
    }, [showToast]);

    useEffect(() => {
        const previous = vscode.getState<Record<string, unknown>>() ?? {};
        vscode.setState({ ...previous, detailsOpen });
    }, [detailsOpen]);

    useEffect(() => {
        if (!state) {
            return;
        }
        if (filterText === state.filter.text && scope === state.filter.scope) {
            return;
        }
        const timer = window.setTimeout(() => {
            post({ type: 'setFilter', filter: { text: filterText, scope } });
        }, 350);
        return () => window.clearTimeout(timer);
    }, [filterText, scope, state]);

    const handleSelect = (sha: string, additive: boolean) => {
        setDetailsOpen(true);
        if (!additive) {
            setSelected([sha]);
            post({ type: 'selectCommit', sha });
            return;
        }
        let next: string[];
        if (selected.includes(sha)) {
            next = selected.filter(item => item !== sha);
        } else {
            next = [...selected, sha].slice(-2);
        }
        setSelected(next);
        if (next.length === 2) {
            post({ type: 'compare', a: next[0], b: next[1] });
        } else if (next.length === 1) {
            post({ type: 'selectCommit', sha: next[0] });
        } else {
            post({ type: 'clearSelection' });
        }
    };

    const handleAction = (action: CommitAction, sha: string) => {
        switch (action) {
            case 'checkout':
                post({ type: 'checkout', sha });
                break;
            case 'createBranch':
                post({ type: 'createBranchAt', sha });
                break;
            case 'createTag':
                post({ type: 'createTagAt', sha });
                break;
            case 'cherryPick':
                post({ type: 'cherryPick', sha });
                break;
            case 'revert':
                post({ type: 'revert', sha });
                break;
            case 'reset':
                post({ type: 'reset', sha });
                break;
            case 'compareHead':
                if (state?.head.sha && state.head.sha !== sha) {
                    post({ type: 'compare', a: state.head.sha, b: sha });
                }
                break;
        }
    };

    const closeDetails = () => {
        setDetailsOpen(false);
        setDetails({});
        setSelected([]);
        post({ type: 'clearSelection' });
    };

    const toggleDetails = () => setDetailsOpen(value => !value);

    /** Scroll the graph to the commit the current branch points at. */
    const jumpToHead = () => {
        const sha = state?.head.sha;
        if (!sha) {
            return;
        }
        jumpNonce.current += 1;
        setJumpTo({ sha, nonce: jumpNonce.current });
        setSelected([sha]);
        setDetailsOpen(true);
        post({ type: 'selectCommit', sha });
    };

    const submitCommit = () => {
        if (!state || (!message.trim() && !amend)) {
            return;
        }
        if (!amend && !commitAll && state.status.staged === 0) {
            return;
        }
        post({ type: 'commit', message, amend, all: commitAll });
    };

    const branchLabel = state
        ? state.head.branch ??
        (state.head.detached ? `detached @ ${shortSha(state.head.sha ?? '')}` : 'no branch')
        : 'no branch';

    const staged = state?.status.staged ?? 0;
    const unstaged = state?.status.unstaged ?? 0;
    const untracked = state?.status.untracked ?? 0;
    const canCommit = Boolean(state) && (message.trim().length > 0 || amend);
    const noStaged = Boolean(state) && !amend && staged === 0 && !commitAll;
    const commitBlocked = !state || !canCommit || noStaged;
    const commitBlockedReason = !state
        ? 'No repository'
        : !canCommit
            ? 'Enter a commit message, or enable Amend to keep the previous message.'
            : noStaged
                ? 'No staged changes. Enable “Stage all” or stage files first.'
                : '';
    const commitCommand = amend
        ? `git commit --amend${message.trim() ? ' -m "<message>"' : ' --no-edit'}`
        : 'git commit -m "<message>"';
    const commitLabel = amend ? `Amend ${branchLabel}` : `Commit to ${branchLabel}`;

    const commitMenu = menu?.kind === 'commit' ? menu : null;
    const menuSubject = commitMenu
        ? state?.rows.find(row => row.sha === commitMenu.sha)?.subject ?? ''
        : '';
    const menuItems: MenuItem[] = commitMenu
        ? [
            { label: `${shortSha(commitMenu.sha)} · ${menuSubject}`, header: true },
            {
                label: 'Open details',
                action: () => post({ type: 'selectCommit', sha: commitMenu.sha }),
            },
            {
                label: `Checkout ${shortSha(commitMenu.sha)} (detached)`,
                action: () => post({ type: 'checkout', sha: commitMenu.sha }),
            },
            ...(state?.head.sha && state.head.sha !== commitMenu.sha
                ? [
                    {
                        label: `Compare HEAD (${shortSha(state.head.sha)}) with this commit`,
                        action: () =>
                            post({ type: 'compare', a: state.head.sha!, b: commitMenu.sha }),
                    },
                ]
                : []),
            {
                label: 'New branch here…',
                separatorBefore: true,
                action: () => post({ type: 'createBranchAt', sha: commitMenu.sha }),
            },
            {
                label: 'New tag here…',
                action: () => post({ type: 'createTagAt', sha: commitMenu.sha }),
            },
            {
                label: `Cherry-pick onto ${branchLabel}`,
                separatorBefore: true,
                action: () => post({ type: 'cherryPick', sha: commitMenu.sha }),
            },
            {
                label: `Revert on ${branchLabel}`,
                action: () => post({ type: 'revert', sha: commitMenu.sha }),
            },
            {
                label: 'Interactive rebase from here…',
                action: () => post({ type: 'interactiveRebase', base: commitMenu.sha }),
            },
            {
                label: 'Copy SHA',
                separatorBefore: true,
                action: () => post({ type: 'copy', text: commitMenu.sha }),
            },
            {
                label: 'Copy subject',
                action: () => {
                    const row = state?.rows.find(item => item.sha === commitMenu.sha);
                    if (row) {
                        post({ type: 'copy', text: row.subject });
                    }
                },
            },
            {
                label: `Reset ${branchLabel} to this commit…`,
                separatorBefore: true,
                danger: true,
                action: () => post({ type: 'reset', sha: commitMenu.sha }),
            },
        ]
        : menu?.kind === 'ref'
            ? refMenuItems(menu.ref)
            : [];

    return (
        <div className="app">
            <Toolbar
                state={state}
                repos={repos}
                filterText={filterText}
                scope={scope}
                detailsOpen={detailsOpen}
                onFilterText={setFilterText}
                onScope={setScope}
                onRepo={root => post({ type: 'setRepo', root })}
                onRefresh={() => post({ type: 'refresh' })}
                onFetch={() => post({ type: 'fetch' })}
                onPull={() => post({ type: 'pull' })}
                onPush={() => post({ type: 'push' })}
                onSwitchBranch={() => post({ type: 'switchBranch' })}
                onMerge={() => post({ type: 'merge' })}
                onRebase={() => post({ type: 'rebase' })}
                onJumpToHead={jumpToHead}
                onToggleDetails={toggleDetails}
            />

            {state?.operation && (
                <div className="operation-banner">
                    <span>
                        {state.operation.kind.charAt(0).toUpperCase() + state.operation.kind.slice(1)} in progress
                        {state.operation.conflicted > 0 ? ` · ${state.operation.conflicted} conflicts` : ''}
                    </span>
                    <button onClick={() => post({ type: 'continueOperation' })}>Continue</button>
                    <button className="danger" onClick={() => post({ type: 'abortOperation' })}>
                        Abort
                    </button>
                </div>
            )}

            <div className="main">
                {state ? (
                    <div className="graph-column">
                        <div className="graph-caption">
                            <span className="caption-count">
                                {state.rows.length} loaded
                                {state.hasMore ? ' · more available' : ''}
                            </span>
                            {filterText.trim() && (
                                <span className="caption-filter" title={filterText}>
                                    “{filterText.trim()}”
                                </span>
                            )}
                            <span className="spacer" />
                            {!detailsOpen && (
                                <button
                                    type="button"
                                    className="caption-link"
                                    onClick={() => setDetailsOpen(true)}
                                >
                                    Show details
                                </button>
                            )}
                            {selected.length === 1 && (
                                <span className="caption-hint">
                                    Select one more commit (Cmd/Ctrl-click) to compare
                                </span>
                            )}
                            {selected.length === 2 && (
                                <span className="caption-hint">
                                    Comparing {shortSha(selected[0])} → {shortSha(selected[1])}
                                </span>
                            )}
                        </div>
                        <GraphList
                            rows={state.rows}
                            rowHeight={state.ui.rowHeight}
                            laneWidth={state.ui.laneWidth}
                            selected={selected}
                            hasMore={state.hasMore}
                            jumpTo={jumpTo}
                            onSelect={handleSelect}
                            onContextMenu={(sha, x, y) => setMenu({ kind: 'commit', sha, x, y })}
                            onRefContextMenu={(ref, x, y) => setMenu({ kind: 'ref', ref, x, y })}
                            onLoadMore={() => post({ type: 'loadMore' })}
                        />
                    </div>
                ) : (
                    <div className="empty">No Git repository found. Open a folder containing a repository.</div>
                )}

                {detailsOpen && (
                    <DetailsPane
                        state={state}
                        commit={details.commit}
                        compare={details.compare}
                        onOpenDiff={(from, to, file) => post({ type: 'openFileDiff', from, to, file })}
                        onAction={handleAction}
                        onRepoAction={action => {
                            switch (action) {
                                case 'fetch':
                                    post({ type: 'fetch' });
                                    break;
                                case 'pull':
                                    post({ type: 'pull' });
                                    break;
                                case 'push':
                                    post({ type: 'push' });
                                    break;
                                case 'stashPush':
                                    post({ type: 'stashPush' });
                                    break;
                            }
                        }}
                        onCopy={text => post({ type: 'copy', text })}
                        onClose={closeDetails}
                        onSwitchBranch={() => post({ type: 'switchBranch' })}
                    />
                )}
            </div>

            <div className="commit-bar">
                <span className="commit-status" title="Working tree status">
                    <b>{staged}</b> staged · <b>{unstaged}</b> unstaged · <b>{untracked}</b> untracked
                </span>
                <input
                    className="commit-message"
                    value={message}
                    placeholder={
                        state
                            ? `Message for ${branchLabel} · Cmd/Ctrl+Enter to commit`
                            : 'Open a repository to commit'
                    }
                    spellCheck={false}
                    onChange={event => setMessage(event.target.value)}
                    onKeyDown={event => {
                        if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                            submitCommit();
                        }
                    }}
                />
                <label className="check" title="Rewrite the current commit (git commit --amend)">
                    <input type="checkbox" checked={amend} onChange={event => setAmend(event.target.checked)} />
                    Amend
                </label>
                <label className="check" title="Run git add -A before committing">
                    <input
                        type="checkbox"
                        checked={commitAll}
                        onChange={event => setCommitAll(event.target.checked)}
                    />
                    Stage all
                </label>
                <button
                    className="primary"
                    onClick={submitCommit}
                    disabled={commitBlocked}
                    title={commitBlocked ? commitBlockedReason : commitCommand}
                >
                    {state ? commitLabel : 'Commit'}
                </button>
            </div>

            {busy && <div className="busy-pill">{busyLabel ?? 'Working…'}</div>}
            {toast && <div className={`toast ${toast.kind}`}>{toast.message}</div>}

            {menu && (
                <ContextMenu x={menu.x} y={menu.y} items={menuItems} onClose={() => setMenu(null)} />
            )}

            {rebase && (
                <RebaseDialog
                    base={rebase.base}
                    branch={branchLabel}
                    items={rebase.items}
                    onCancel={() => setRebase(null)}
                    onStart={items => {
                        setRebase(null);
                        post({ type: 'runInteractiveRebase', base: rebase.base, items });
                    }}
                />
            )}
        </div>
    );
}
