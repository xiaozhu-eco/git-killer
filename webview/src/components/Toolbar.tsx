import type { RepoState, RepoSummary } from '../../../src/protocol';
import { shortSha } from '../format';
import {
    IconBranch,
    IconChevron,
    IconClose,
    IconFetch,
    IconMerge,
    IconPanel,
    IconPull,
    IconPush,
    IconRebase,
    IconRefresh,
    IconRepo,
    IconSearch,
    IconTarget,
} from './icons';

interface ToolbarProps {
    state: RepoState | null;
    repos: RepoSummary[];
    filterText: string;
    scope: 'all' | 'current';
    detailsOpen: boolean;
    onFilterText: (value: string) => void;
    onScope: (scope: 'all' | 'current') => void;
    onRepo: (root: string) => void;
    onRefresh: () => void;
    onFetch: () => void;
    onPull: () => void;
    onPush: () => void;
    onSwitchBranch: () => void;
    onMerge: () => void;
    onRebase: () => void;
    onJumpToHead: () => void;
    onToggleDetails: () => void;
}

export function Toolbar(props: ToolbarProps) {
    const { state } = props;
    const branch = state?.head.branch ?? (state?.head.detached ? 'detached HEAD' : 'no branch');
    const ahead = state?.status.ahead ?? 0;
    const behind = state?.status.behind ?? 0;
    const upstream = state?.status.upstream;
    const head = state?.head.sha ? shortSha(state.head.sha) : 'no commits';
    const branchTitle = state
        ? [
            `Current branch: ${branch}`,
            `HEAD: ${head}`,
            upstream ? `Upstream: ${upstream}` : 'Upstream: none',
            ahead || behind ? `${ahead} ahead, ${behind} behind` : undefined,
            'Click to switch branch (Cmd/Ctrl+Alt+B)',
        ]
            .filter(Boolean)
            .join('\n')
        : 'No repository';
    const scopeTitle =
        props.scope === 'all'
            ? 'Showing commits from all branches'
            : `Showing commits reachable from ${branch}`;

    return (
        <div className="toolbar">
            <div className="toolbar-row">
                <div className="toolbar-cluster">
                    <div className="repo-select" title={state ? `Repository: ${state.root}` : 'Repository'}>
                        <IconRepo width={13} height={13} className="repo-select-icon" />
                        <select
                            value={state?.root ?? ''}
                            onChange={event => props.onRepo(event.target.value)}
                            disabled={props.repos.length <= 1}
                            aria-label="Repository"
                        >
                            {props.repos.length === 0 && <option value="">No repository</option>}
                            {props.repos.map(repo => (
                                <option key={repo.root} value={repo.root} title={repo.root}>
                                    {repo.name}
                                </option>
                            ))}
                        </select>
                    </div>

                    <button
                        type="button"
                        className="branch-pill"
                        onClick={props.onSwitchBranch}
                        title={branchTitle}
                    >
                        <IconBranch width={12} height={12} className="branch-pill-icon" />
                        <span className="branch-pill-name">{branch}</span>
                        {(ahead > 0 || behind > 0) && (
                            <span className="branch-tracking">
                                {ahead > 0 && <span className="up">↑{ahead}</span>}
                                {behind > 0 && <span className="down">↓{behind}</span>}
                            </span>
                        )}
                        <IconChevron className="branch-pill-caret" width={9} height={9} />
                    </button>
                </div>

                <div className="toolbar-search">
                    <IconSearch width={13} height={13} className="toolbar-search-icon" />
                    <input
                        value={props.filterText}
                        placeholder="Search commit messages…"
                        onChange={event => props.onFilterText(event.target.value)}
                        spellCheck={false}
                        aria-label="Search commits by message"
                        title="Filter commits by message (git log --grep)"
                    />
                    {props.filterText && (
                        <button
                            type="button"
                            className="search-clear"
                            title="Clear search"
                            onClick={() => props.onFilterText('')}
                        >
                            <IconClose width={10} height={10} />
                        </button>
                    )}
                </div>

                <div className="toolbar-cluster toolbar-cluster-right">
                    <div className="scope-segment" role="group" aria-label="Commit scope">
                        <button
                            type="button"
                            className={props.scope === 'all' ? 'active' : ''}
                            onClick={() => props.onScope('all')}
                            aria-pressed={props.scope === 'all'}
                            title={scopeTitle}
                        >
                            All
                        </button>
                        <button
                            type="button"
                            className={props.scope === 'current' ? 'active' : ''}
                            onClick={() => props.onScope('current')}
                            aria-pressed={props.scope === 'current'}
                            title={scopeTitle}
                        >
                            Branch
                        </button>
                    </div>

                    <button
                        type="button"
                        className="toolbar-icon-button"
                        onClick={props.onJumpToHead}
                        disabled={!state?.head.sha}
                        title={`Jump to the current branch commit (${head})`}
                    >
                        <IconTarget />
                    </button>
                    <button
                        type="button"
                        className="toolbar-icon-button"
                        onClick={props.onRefresh}
                        title="Refresh graph and repository state"
                    >
                        <IconRefresh />
                    </button>
                    <button
                        type="button"
                        className={`toolbar-icon-button ${props.detailsOpen ? 'active' : ''}`}
                        onClick={props.onToggleDetails}
                        aria-pressed={props.detailsOpen}
                        title={props.detailsOpen ? 'Hide commit details' : 'Show commit details'}
                    >
                        <IconPanel />
                    </button>
                </div>

                <div className="toolbar-actions">
                    <button
                        type="button"
                        className="tool-button"
                        onClick={props.onFetch}
                        title="Fetch all remotes&#10;git fetch --all --prune"
                    >
                        <IconFetch />
                        <span>Fetch</span>
                    </button>
                    <button
                        type="button"
                        className="tool-button"
                        onClick={props.onPull}
                        title={`Pull ${upstream ?? 'upstream'} into ${branch}\ngit pull`}
                    >
                        <IconPull />
                        <span>Pull</span>
                    </button>
                    <button
                        type="button"
                        className="tool-button"
                        onClick={props.onPush}
                        title={`Push ${branch} to ${upstream ?? 'its upstream'}\ngit push`}
                    >
                        <IconPush />
                        <span>Push</span>
                    </button>
                    <span className="toolbar-divider" />
                    <button
                        type="button"
                        className="tool-button"
                        onClick={props.onMerge}
                        title={`Merge another branch into ${branch}\ngit merge --no-edit <branch>`}
                    >
                        <IconMerge />
                        <span>Merge…</span>
                    </button>
                    <button
                        type="button"
                        className="tool-button"
                        onClick={props.onRebase}
                        title={`Rebase ${branch} onto another branch\ngit rebase <branch>`}
                    >
                        <IconRebase />
                        <span>Rebase…</span>
                    </button>
                </div>
            </div>
        </div>
    );
}
