import { useEffect, useState } from 'react';
import type { SidebarState } from '../../src/protocol';
import {
  IconBranch,
  IconCheck,
  IconChevron,
  IconFetch,
  IconGraph,
  IconPop,
  IconPull,
  IconPush,
  IconRefresh,
  IconRepo,
  IconStash,
  IconWarning,
} from './components/icons';
import { post } from './vscodeApi';

function stashMessage(stash: string): string {
  const separator = stash.indexOf(': ');
  return separator >= 0 ? stash.slice(separator + 2) : stash;
}

function stashIndex(stash: string): string {
  const match = /^stash@\{(\d+)\}/.exec(stash);
  return match ? `stash@{${match[1]}}` : '';
}

function Tracking(props: { ahead: number; behind: number }) {
  return (
    <>
      {props.ahead > 0 && <span className="tracking-up">↑{props.ahead}</span>}
      {props.ahead > 0 && props.behind > 0 ? ' ' : null}
      {props.behind > 0 && <span className="tracking-down">↓{props.behind}</span>}
    </>
  );
}

export function Sidebar() {
  const [state, setState] = useState<SidebarState | null>(null);

  useEffect(() => {
    const listener = (event: MessageEvent) => {
      if (event.data?.type === 'sidebar') {
        setState(event.data.state as SidebarState);
      }
    };
    window.addEventListener('message', listener);
    post({ type: 'ready' });
    return () => window.removeEventListener('message', listener);
  }, []);

  if (!state) {
    return (
      <div className="sidebar">
        <div className="skeleton">
          <div className="skeleton-line w-80" />
          <div className="skeleton-line w-60" />
          <div className="skeleton-block" />
          <div className="skeleton-block short" />
        </div>
      </div>
    );
  }

  if (state.repos.length === 0) {
    return (
      <div className="no-repo">
        <div className="no-repo-icon">
          <IconRepo width={22} height={22} />
        </div>
        <div className="no-repo-title">No repository</div>
        <div className="no-repo-text">
          Open a folder with a Git repository to browse commits and manage branches.
        </div>
      </div>
    );
  }

  const repo = state.repos.find(item => item.root === state.active);
  const branchName = state.detached ? 'detached HEAD' : state.branch ?? 'no branch';
  const totalChanges = state.staged + state.unstaged + state.untracked;
  const clean = totalChanges === 0 && state.conflicted === 0;
  const canStash = totalChanges > 0 && state.conflicted === 0;
  const hasStashes = state.stashes.length > 0;
  const operationLabel = state.operation
    ? state.operation.kind.charAt(0).toUpperCase() + state.operation.kind.slice(1)
    : '';

  return (
    <div className="sidebar">
      <header className="repo-card">
        <div className="repo-row">
          <span className="repo-icon">
            <IconRepo width={15} height={15} />
          </span>
          <div className="repo-text">
            {state.repos.length > 1 ? (
              <div className="repo-select-wrap">
                <select
                  className="repo-select"
                  value={state.active ?? ''}
                  onChange={event => post({ type: 'setRepo', root: event.target.value })}
                  aria-label="Repository"
                  title="Switch repository"
                >
                  {state.repos.map(item => (
                    <option key={item.root} value={item.root}>
                      {item.name}
                    </option>
                  ))}
                </select>
                <IconChevron className="repo-chevron" width={12} height={12} />
              </div>
            ) : (
              <div className="repo-name" title={repo?.root}>
                {repo?.name ?? 'Repository'}
              </div>
            )}
            <div className="repo-path" title={state.active}>
              {state.active}
            </div>
          </div>
          <button
            type="button"
            className="icon-button"
            title="Refresh repository state"
            onClick={() => post({ type: 'refresh' })}
          >
            <IconRefresh />
          </button>
        </div>
      </header>

      {state.operation && (
        <div className="operation-card">
          <div className="operation-title">
            <IconWarning />
            <span>{operationLabel} in progress</span>
          </div>
          <div className="operation-text">
            {state.operation.conflicted > 0
              ? `${state.operation.conflicted} unresolved file${state.operation.conflicted === 1 ? '' : 's'
              } — resolve them, then continue.`
              : 'Continue when you are ready, or abort to restore the previous state.'}
          </div>
          <div className="operation-actions">
            <button type="button" className="small" onClick={() => post({ type: 'continueOperation' })}>
              Continue
            </button>
            <button
              type="button"
              className="small danger"
              onClick={() => post({ type: 'abortOperation' })}
            >
              Abort
            </button>
          </div>
        </div>
      )}

      <button
        type="button"
        className="branch-card"
        onClick={() => post({ type: 'switchBranch' })}
        title={`Current branch: ${branchName}\nClick to switch branch`}
      >
        <span className="branch-icon">
          <IconBranch />
        </span>
        <span className="branch-text">
          <span className="branch-label">Current branch</span>
          <span className="branch-name">{branchName}</span>
          <span className="branch-meta">
            {state.detached
              ? 'HEAD is detached — commits will not advance a branch'
              : state.upstream
                ? `tracking ${state.upstream}`
                : 'no upstream configured'}
          </span>
        </span>
        <span className="branch-side">
          {(state.ahead > 0 || state.behind > 0) && (
            <span className="tracking">
              <Tracking ahead={state.ahead} behind={state.behind} />
            </span>
          )}
          <IconChevron className="chevron" width={12} height={12} />
        </span>
      </button>

      <button
        type="button"
        className="primary cta"
        onClick={() => post({ type: 'openGraph' })}
        title="Open the commit graph (Cmd/Ctrl+Alt+G)"
      >
        <IconGraph width={15} height={15} />
        <span>Open Commit Graph</span>
      </button>

      <section className="panel-section">
        <div className="section-head">
          <span>Working tree</span>
          {clean ? (
            <span className="clean-badge">
              <IconCheck width={11} height={11} />
              Clean
            </span>
          ) : (
            <span className="section-hint">
              {state.conflicted > 0
                ? `${state.conflicted} conflict${state.conflicted === 1 ? '' : 's'}`
                : `${totalChanges} change${totalChanges === 1 ? '' : 's'}`}
            </span>
          )}
        </div>
        <div className="stat-grid">
          <div className={`stat staged ${state.staged === 0 ? 'dim' : ''}`} title="Changes staged for the next commit">
            <span className="stat-value">{state.staged}</span>
            <span className="stat-label">Staged</span>
          </div>
          <div className={`stat unstaged ${state.unstaged === 0 ? 'dim' : ''}`} title="Changes in the working tree">
            <span className="stat-value">{state.unstaged}</span>
            <span className="stat-label">Unstaged</span>
          </div>
          <div className={`stat untracked ${state.untracked === 0 ? 'dim' : ''}`} title="Untracked files">
            <span className="stat-value">{state.untracked}</span>
            <span className="stat-label">Untracked</span>
          </div>
        </div>
        {state.conflicted > 0 && (
          <button
            type="button"
            className="conflict-line"
            onClick={() => post({ type: 'openGraph' })}
            title="Open the graph to resolve conflicts"
          >
            <IconWarning width={12} height={12} />
            {state.conflicted} conflict{state.conflicted === 1 ? '' : 's'} to resolve
          </button>
        )}
      </section>

      <section className="panel-section">
        <div className="section-head">
          <span>Sync</span>
          <span className="section-hint">{state.upstream ?? 'no upstream'}</span>
        </div>
        <div className="button-grid three">
          <button
            type="button"
            className="action-button"
            onClick={() => post({ type: 'fetch' })}
            title="git fetch --all --prune"
          >
            <IconFetch />
            <span>Fetch</span>
          </button>
          <button
            type="button"
            className="action-button"
            onClick={() => post({ type: 'pull' })}
            title={`git pull (${branchName} ← ${state.upstream ?? 'upstream'})`}
          >
            <IconPull />
            <span>Pull</span>
          </button>
          <button
            type="button"
            className="action-button"
            onClick={() => post({ type: 'push' })}
            title={`git push (${branchName} → ${state.upstream ?? 'upstream'})`}
          >
            <IconPush />
            <span>Push</span>
          </button>
        </div>
      </section>

      <section className="panel-section">
        <div className="section-head">
          <span>Stash</span>
          {hasStashes && <span className="count-badge">{state.stashes.length}</span>}
        </div>
        {hasStashes ? (
          <ul className="list">
            {state.stashes.map((stash, index) => (
              <li key={stash} className="row-item stash-row" title={stash}>
                <span className="row-icon">
                  <IconStash width={13} height={13} />
                </span>
                <span className="row-text">{stashMessage(stash)}</span>
                <span className="row-meta">{stashIndex(stash)}</span>
                <button
                  type="button"
                  className="inline-action"
                  onClick={() => post({ type: 'stashPop', index })}
                  title={`git stash pop stash@{${index}}`}
                >
                  Pop
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="empty-row">No stashes</div>
        )}
        <div className="button-grid two">
          <button
            type="button"
            className="action-button"
            disabled={!canStash}
            onClick={() => post({ type: 'stashPush' })}
            title={
              state.conflicted > 0
                ? 'Resolve conflicts before stashing'
                : canStash
                  ? 'git stash push -u'
                  : 'No changes to stash'
            }
          >
            <IconStash />
            <span>Stash changes</span>
          </button>
          <button
            type="button"
            className="action-button"
            disabled={!hasStashes}
            onClick={() => post({ type: 'stashPop' })}
            title={hasStashes ? 'git stash pop (latest)' : 'No stashes to pop'}
          >
            <IconPop />
            <span>Pop latest</span>
          </button>
        </div>
      </section>

      <section className="panel-section">
        <div className="section-head">
          <span>Recent branches</span>
          <button
            type="button"
            className="text-action"
            onClick={() => post({ type: 'switchBranch' })}
          >
            Switch…
          </button>
        </div>
        <ul className="list">
          {state.branches.length === 0 && <li className="empty-row">No branches</li>}
          {state.branches.map(branch => {
            const current = !state.detached && branch.shortName === state.branch;
            const ahead = current ? state.ahead : branch.ahead ?? 0;
            const behind = current ? state.behind : branch.behind ?? 0;
            const activate = () => {
              if (!current) {
                post({ type: 'checkoutBranch', name: branch.shortName });
              }
            };
            return (
              <li
                key={branch.name}
                className={`row-item ${current ? 'current' : 'clickable'}`}
                onClick={activate}
                onKeyDown={event => {
                  if (!current && (event.key === 'Enter' || event.key === ' ')) {
                    event.preventDefault();
                    activate();
                  }
                }}
                role={current ? undefined : 'button'}
                tabIndex={current ? undefined : 0}
                title={current ? `${branch.shortName} (current)` : `git switch ${branch.shortName}`}
              >
                <span className="row-icon">
                  {current ? <IconCheck width={12} height={12} /> : <IconBranch width={12} height={12} />}
                </span>
                <span className="row-text">{branch.shortName}</span>
                {ahead > 0 || behind > 0 ? (
                  <span className="row-meta">
                    <Tracking ahead={ahead} behind={behind} />
                  </span>
                ) : null}
                {current && <span className="current-tag">current</span>}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
