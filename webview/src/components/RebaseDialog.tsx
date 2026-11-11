import { useEffect, useState } from 'react';
import type { RebaseAction, RebaseTodoItem } from '../../../src/protocol';
import { shortSha } from '../format';

const ACTIONS: RebaseAction[] = ['pick', 'squash', 'fixup', 'drop'];

interface RebaseDialogProps {
    base: string;
    branch?: string;
    items: RebaseTodoItem[];
    onCancel: () => void;
    onStart: (items: RebaseTodoItem[]) => void;
}

export function RebaseDialog({ base, branch, items, onCancel, onStart }: RebaseDialogProps) {
    const [rows, setRows] = useState(items);

    useEffect(() => {
        setRows(items);
    }, [items]);

    useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                onCancel();
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onCancel]);

    const update = (index: number, patch: Partial<RebaseTodoItem>) => {
        setRows(current => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));
    };

    const move = (index: number, delta: number) => {
        const target = index + delta;
        if (target < 0 || target >= rows.length) {
            return;
        }
        const next = [...rows];
        [next[index], next[target]] = [next[target], next[index]];
        setRows(next);
    };

    const firstKept = rows.findIndex(row => row.action !== 'drop');
    const allDropped = firstKept === -1;
    const invalidFirst = firstKept >= 0 && ['squash', 'fixup'].includes(rows[firstKept].action);

    return (
        <div className="modal-backdrop">
            <div className="modal">
                <header className="modal-header">
                    <span className="modal-title">Interactive rebase</span>
                    <span className="muted">
                        on {branch ?? 'HEAD'} · onto {shortSha(base)}
                    </span>
                    <span className="modal-spacer" />
                    <button className="icon" onClick={onCancel} title="Close">
                        ×
                    </button>
                </header>

                <div className="modal-hint">
                    Rewriting <b>{branch ?? 'HEAD'}</b>. Oldest first: <b>squash</b>/<b>fixup</b> fold a
                    commit into the previous kept commit, <b>drop</b> removes it. A backup ref is created
                    before the rebase starts.
                </div>

                <div className="rebase-list">
                    {rows.map((row, index) => (
                        <div className="rebase-row" key={row.sha}>
                            <span className="rebase-index">{index + 1}</span>
                            <select
                                value={row.action}
                                onChange={event => update(index, { action: event.target.value as RebaseAction })}
                            >
                                {ACTIONS.map(action => (
                                    <option key={action} value={action}>
                                        {action}
                                    </option>
                                ))}
                            </select>
                            <code className="rebase-sha">{shortSha(row.sha)}</code>
                            <span className="rebase-subject" title={row.subject}>
                                {row.subject}
                            </span>
                            <button
                                className="icon"
                                onClick={() => move(index, -1)}
                                disabled={index === 0}
                                title="Move up"
                            >
                                ↑
                            </button>
                            <button
                                className="icon"
                                onClick={() => move(index, 1)}
                                disabled={index === rows.length - 1}
                                title="Move down"
                            >
                                ↓
                            </button>
                        </div>
                    ))}
                </div>

                {(invalidFirst || allDropped) && (
                    <div className="modal-error">
                        {allDropped
                            ? 'At least one commit must be kept.'
                            : 'The first kept commit cannot be squash or fixup.'}
                    </div>
                )}

                <footer className="modal-footer">
                    <span className="muted">
                        {rows.length} commit{rows.length === 1 ? '' : 's'}
                    </span>
                    <span className="modal-spacer" />
                    <button onClick={onCancel}>Cancel</button>
                    <button
                        className="primary"
                        disabled={allDropped || invalidFirst || rows.length === 0}
                        onClick={() => onStart(rows)}
                    >
                        Start rebase
                    </button>
                </footer>
            </div>
        </div>
    );
}
