import { useEffect, useMemo, useRef, useState } from 'react';
import type { GraphRow } from '../../../src/protocol';
import { formatDate, relativeTime, shortSha } from '../format';

interface GraphListProps {
    rows: GraphRow[];
    rowHeight: number;
    laneWidth: number;
    selected: string[];
    hasMore: boolean;
    onSelect: (sha: string, additive: boolean) => void;
    onContextMenu: (sha: string, x: number, y: number) => void;
    onLoadMore: () => void;
}

const FALLBACK_PALETTE = [
    '#4f9cf9',
    '#f2a65a',
    '#7fd47f',
    '#ef6b6b',
    '#b98cf5',
    '#f0d264',
    '#4fd1c5',
    '#f28fb8',
    '#9ab3ff',
    '#c3e88d',
];

function readPalette(): string[] {
    const styles = getComputedStyle(document.body);
    const variables = [
        '--vscode-charts-blue',
        '--vscode-charts-orange',
        '--vscode-charts-green',
        '--vscode-charts-red',
        '--vscode-charts-purple',
        '--vscode-charts-yellow',
    ];
    const fromTheme = variables
        .map(name => styles.getPropertyValue(name).trim())
        .filter(Boolean);
    return [...fromTheme, ...FALLBACK_PALETTE].slice(0, FALLBACK_PALETTE.length);
}

export function GraphList(props: GraphListProps) {
    const { rows, rowHeight, laneWidth, selected, hasMore } = props;
    const scrollerRef = useRef<HTMLDivElement>(null);
    const wrapRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const rafRef = useRef<number>();
    const [scrollTop, setScrollTop] = useState(0);
    const [viewport, setViewport] = useState({ width: 0, height: 0 });
    const [palette] = useState(readPalette);

    const selectedSet = useMemo(() => new Set(selected), [selected]);

    const maxLanes = useMemo(() => {
        let max = 1;
        for (const row of rows) {
            max = Math.max(max, row.laneCount);
        }
        return max;
    }, [rows]);

    const graphWidth = Math.min(320, Math.max(56, (maxLanes + 1) * laneWidth + 12));

    useEffect(() => {
        const element = wrapRef.current;
        if (!element) {
            return;
        }
        const observer = new ResizeObserver(() => {
            setViewport({ width: element.clientWidth, height: element.clientHeight });
        });
        observer.observe(element);
        setViewport({ width: element.clientWidth, height: element.clientHeight });
        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) {
            return;
        }
        const dpr = window.devicePixelRatio || 1;
        const width = graphWidth;
        const height = Math.max(1, viewport.height);
        canvas.width = Math.floor(width * dpr);
        canvas.height = Math.floor(height * dpr);
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;

        const context = canvas.getContext('2d');
        if (!context) {
            return;
        }
        context.setTransform(dpr, 0, 0, dpr, 0, 0);
        context.clearRect(0, 0, width, height);

        const background = getComputedStyle(document.body).backgroundColor;
        const start = Math.max(0, Math.floor(scrollTop / rowHeight) - 2);
        const end = Math.min(rows.length, start + Math.ceil(height / rowHeight) + 4);
        const pad = 6 + laneWidth / 2;

        for (let index = start; index < end; index += 1) {
            const row = rows[index];
            const yTop = index * rowHeight - scrollTop;
            const yMid = yTop + rowHeight / 2;

            for (const edge of row.edges) {
                const x1 = pad + edge.from * laneWidth;
                const x2 = pad + edge.to * laneWidth;
                context.strokeStyle = palette[edge.color % palette.length];
                context.lineWidth = 2;
                context.beginPath();
                if (edge.from === edge.to) {
                    context.moveTo(x1, yTop - 1);
                    context.lineTo(x1, yTop + rowHeight + 1);
                } else {
                    const midY = yTop + rowHeight / 2;
                    context.moveTo(x1, yTop - 1);
                    context.bezierCurveTo(x1, midY, x2, midY, x2, yTop + rowHeight + 1);
                }
                context.stroke();
            }

            const x = pad + row.lane * laneWidth;
            const color = palette[row.color % palette.length];
            const isSelected = selectedSet.has(row.sha);
            context.beginPath();
            context.arc(x, yMid, isSelected ? 5 : 3.6, 0, Math.PI * 2);
            if (row.parents.length > 1) {
                context.fillStyle = background;
                context.fill();
                context.lineWidth = 2;
                context.strokeStyle = color;
                context.stroke();
            } else {
                context.fillStyle = color;
                context.fill();
            }
        }
    }, [rows, scrollTop, viewport, graphWidth, rowHeight, laneWidth, selectedSet, palette]);

    const handleScroll = () => {
        if (rafRef.current !== undefined) {
            return;
        }
        rafRef.current = requestAnimationFrame(() => {
            rafRef.current = undefined;
            setScrollTop(scrollerRef.current?.scrollTop ?? 0);
        });
    };

    useEffect(() => {
        return () => {
            if (rafRef.current !== undefined) {
                cancelAnimationFrame(rafRef.current);
            }
        };
    }, []);

    const visibleHeight = viewport.height || 600;
    const start = Math.max(0, Math.floor(scrollTop / rowHeight) - 3);
    const end = Math.min(rows.length, start + Math.ceil(visibleHeight / rowHeight) + 8);
    const visible = rows.slice(start, end);
    const totalHeight = rows.length * rowHeight + (hasMore ? 44 : 0);

    return (
        <div className="graph-wrap" ref={wrapRef}>
            <canvas className="lanes" ref={canvasRef} />
            <div className="scroller" ref={scrollerRef} onScroll={handleScroll}>
                <div className="spacer" style={{ height: totalHeight }}>
                    {visible.map((row, offset) => {
                        const index = start + offset;
                        return (
                            <div
                                key={row.sha}
                                className={`row ${selectedSet.has(row.sha) ? 'selected' : ''}`}
                                style={{ top: index * rowHeight, height: rowHeight }}
                                title={`${row.subject}\n${row.author} · ${formatDate(row.authorTime)}\n${row.sha}`}
                                onMouseDown={event => {
                                    if (event.button !== 0) {
                                        return;
                                    }
                                    event.preventDefault();
                                    const isMac = navigator.platform.toUpperCase().includes('MAC');
                                    const additive = event.metaKey || (!isMac && event.ctrlKey) || event.shiftKey;
                                    props.onSelect(row.sha, additive);
                                }}
                                onContextMenu={event => {
                                    event.preventDefault();
                                    props.onContextMenu(row.sha, event.clientX, event.clientY);
                                }}
                            >
                                <div className="row-inner" style={{ paddingLeft: graphWidth + 10 }}>
                                    {row.isHead && <span className="ref head">HEAD</span>}
                                    {row.refs.slice(0, 3).map(ref => (
                                        <span
                                            key={`${ref.name}-${ref.sha}`}
                                            className={`ref ${ref.type}`}
                                            title={`${ref.type}: ${ref.name}`}
                                        >
                                            {ref.shortName}
                                        </span>
                                    ))}
                                    {row.refs.length > 3 && (
                                        <span className="ref more" title={row.refs.map(ref => ref.shortName).join('\n')}>
                                            +{row.refs.length - 3}
                                        </span>
                                    )}
                                    <span className="subject">{row.subject}</span>
                                    <span className="author">
                                        {row.author} · {relativeTime(row.authorTime)}
                                    </span>
                                    <span className="sha">{shortSha(row.sha)}</span>
                                </div>
                            </div>
                        );
                    })}
                    {hasMore && (
                        <div className="load-more" style={{ top: rows.length * rowHeight }}>
                            <button onClick={props.onLoadMore}>Load more commits</button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
