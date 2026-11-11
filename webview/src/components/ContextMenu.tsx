import { Fragment, useEffect } from 'react';

export interface MenuItem {
    label: string;
    action?: () => void;
    danger?: boolean;
    separatorBefore?: boolean;
    header?: boolean;
}

interface ContextMenuProps {
    x: number;
    y: number;
    items: MenuItem[];
    onClose: () => void;
}

export function ContextMenu(props: ContextMenuProps) {
    useEffect(() => {
        const close = () => props.onClose();
        const onKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                props.onClose();
            }
        };
        window.addEventListener('mousedown', close);
        window.addEventListener('keydown', onKey);
        return () => {
            window.removeEventListener('mousedown', close);
            window.removeEventListener('keydown', onKey);
        };
    }, [props.onClose]);

    const left = Math.min(props.x, window.innerWidth - 260);
    const top = Math.min(props.y, window.innerHeight - props.items.length * 26 - 16);

    return (
        <div
            className="context-menu"
            style={{ left: Math.max(4, left), top: Math.max(4, top) }}
            onMouseDown={event => event.stopPropagation()}
        >
            {props.items.map((item, index) => (
                <Fragment key={`${item.label}-${index}`}>
                    {item.separatorBefore && <div className="context-separator" />}
                    {item.header ? (
                        <div className="context-header" title={item.label}>
                            {item.label}
                        </div>
                    ) : (
                        <button
                            className={`context-item ${item.danger ? 'danger' : ''}`}
                            disabled={!item.action}
                            onClick={() => {
                                if (!item.action) {
                                    return;
                                }
                                props.onClose();
                                item.action();
                            }}
                        >
                            {item.label}
                        </button>
                    )}
                </Fragment>
            ))}
        </div>
    );
}
