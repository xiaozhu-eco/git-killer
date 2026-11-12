import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { GraphRow, RefSummary } from '../../../src/protocol';
import { formatDate, relativeTime, shortSha } from '../format';

interface GraphListProps {
    rows: GraphRow[];
    rowHeight: number;
    laneWidth: number;
    selected: string[];
    hasMore: boolean;
    jumpTo?: { sha: string; nonce: number };
    onSelect: (sha: string, additive: boolean) => void;
    onContextMenu: (sha: string, x: number, y: number) => void;
    onRefContextMenu: (ref: RefSummary, x: number, y: number) => void;
    onLoadMore: () => void;
}

const MAX_GRAPH_WIDTH = 320;
const MIN_LANE_GAP = 4;

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

/**
 * Hover text for a row: commit info plus every branch/tag pointing at it, so a commit that
 * carries several refs can be inspected without expanding the row.
 */
function rowTooltip(row: GraphRow): string {
    const lines = [row.subject, `${row.author} · ${formatDate(row.authorTime)}`, row.sha];
    if (row.refs.length > 0) {
        lines.push(...row.refs.map(ref => `${ref.type}: ${ref.shortName}`));
    }
    return lines.join('\n');
}

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
    const windowStart = useRef(0);
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

    // Shrink the lane gap instead of clipping when a repo has many active branches.
    const laneGap = useMemo(() => {
        const fit = (MAX_GRAPH_WIDTH - 12) / Math.max(1, maxLanes + 1);
        return Math.max(MIN_LANE_GAP, Math.min(laneWidth, fit));
    }, [laneWidth, maxLanes]);

    const graphWidth = useMemo(
        () => Math.max(56, Math.min(MAX_GRAPH_WIDTH, Math.round((maxLanes + 1) * laneGap + 12))),
        [laneGap, maxLanes]
    );

    // Long branch/tag chips wrap, so rows can be taller than `rowHeight`; heights are measured
    // once per row and turned into offsets that keep the lanes, the rows and the scrollbar in sync.
    const rowHeights = useRef(new Map<string, number>());
    const [measureTick, setMeasureTick] = useState(0);

    const offsets = useMemo(() => {
        const result = new Array<number>(rows.length + 1);
        result[0] = 0;
        for (let index = 0; index < rows.length; index += 1) {
            const height = rowHeights.current.get(rows[index].sha) ?? rowHeight;
            result[index + 1] = result[index] + height;
        }
        return result;
    }, [rows, rowHeight, measureTick]);

    // Measure mounted rows before paint so wrapped rows never overlap or drift from the lanes.
    useLayoutEffect(() => {
        const container = wrapRef.current;
        if (!container) {
            return;
        }
        let changed = false;
        for (const element of container.querySelectorAll<HTMLElement>('.row')) {
            const sha = element.dataset.sha;
            if (!sha) {
                continue;
            }
            const height = element.offsetHeight;
            const known = rowHeights.current.get(sha);
            if (known === undefined || Math.abs(known - height) >= 0.5) {
                rowHeights.current.set(sha, height);
                changed = true;
            }
        }
        if (changed) {
            setMeasureTick(tick => tick + 1);
        }
    });

    /** Index of the row that contains the given scroll offset. */
    const indexAt = useCallback(
        (value: number): number => {
            let low = 0;
            let high = Math.max(0, rows.length - 1);
            while (low < high) {
                const mid = Math.ceil((low + high) / 2);
                if (offsets[mid] <= value) {
                    low = mid;
                } else {
                    high = mid - 1;
                }
            }
            return low;
        },
        [offsets, rows.length]
    );

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

    const drawCanvas = useCallback(
        (top: number) => {
            const canvas = canvasRef.current;
            const wrap = wrapRef.current;
            if (!canvas || !wrap) {
                return;
            }
            const dpr = window.devicePixelRatio || 1;
            const width = graphWidth;
            const height = Math.max(1, wrap.clientHeight);
            const pixelWidth = Math.floor(width * dpr);
            const pixelHeight = Math.floor(height * dpr);
            if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
                canvas.width = pixelWidth;
                canvas.height = pixelHeight;
            }
            canvas.style.width = `${width}px`;
            canvas.style.height = `${height}px`;

            const context = canvas.getContext('2d');
            if (!context) {
                return;
            }
            context.setTransform(dpr, 0, 0, dpr, 0, 0);
            context.clearRect(0, 0, width, height);
            context.lineCap = 'round';

            const background =
                getComputedStyle(wrap).backgroundColor || getComputedStyle(document.body).backgroundColor;
            const start = Math.max(0, indexAt(top) - 2);
            const end = Math.min(rows.length, indexAt(top + height) + 2);
            const pad = 6 + laneGap / 2;

            for (let index = start; index < end; index += 1) {
                const row = rows[index];
                const yTop = offsets[index] - top;
                const rowH = offsets[index + 1] - offsets[index];
                const yBottom = yTop + rowH;
                const yMid = yTop + rowH / 2;

                // Segments are anchored: they start at the row top or at the dot, and end at the
                // row bottom or at the dot, so consecutive rows join without gaps or overshoot.
                for (const edge of row.edges) {
                    const x1 = pad + edge.from * laneGap;
                    const x2 = pad + edge.to * laneGap;
                    const startY = edge.fromAnchor === 'dot' ? yMid : yTop;
                    const endY = edge.toAnchor === 'dot' ? yMid : yBottom;
                    context.strokeStyle = palette[edge.color % palette.length];
                    context.lineWidth = 2;
                    context.beginPath();
                    context.moveTo(x1, startY);
                    if (x1 === x2) {
                        context.lineTo(x2, endY);
                    } else {
                        const midY = (startY + endY) / 2;
                        context.bezierCurveTo(x1, midY, x2, midY, x2, endY);
                    }
                    context.stroke();
                }

                const x = pad + row.lane * laneGap;
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
        },
        [rows, graphWidth, laneGap, selectedSet, palette, offsets, indexAt]
    );

    useLayoutEffect(() => {
        drawCanvas(scrollerRef.current?.scrollTop ?? scrollTop);
    }, [drawCanvas, scrollTop, viewport]);

    const handledJump = useRef(-1);
    useEffect(() => {
        const jump = props.jumpTo;
        const scroller = scrollerRef.current;
        if (!jump || !scroller || jump.nonce === handledJump.current) {
            return;
        }
        handledJump.current = jump.nonce;
        const index = rows.findIndex(row => row.sha === jump.sha);
        if (index < 0) {
            return;
        }
        const top = Math.max(0, offsets[index] - Math.round(scroller.clientHeight / 2) + rowHeight / 2);
        scroller.scrollTop = top;
        windowStart.current = Math.max(0, indexAt(top) - 3);
        setScrollTop(top);
        drawCanvas(top);
    }, [props.jumpTo, rows, offsets, rowHeight, drawCanvas, indexAt]);

    const handleScroll = () => {
        const top = scrollerRef.current?.scrollTop ?? 0;
        // Redraw right away so the lanes never lag behind the commit text.
        drawCanvas(top);
        // Re-render only when the virtual window actually moves; rows scroll natively either way.
        const nextStart = Math.max(0, indexAt(top) - 3);
        if (nextStart !== windowStart.current) {
            windowStart.current = nextStart;
            setScrollTop(top);
        }
    };

    const visibleHeight = viewport.height || 600;
    const start = Math.max(0, indexAt(scrollTop) - 3);
    const end = Math.min(rows.length, indexAt(scrollTop + visibleHeight) + 4);
    const visible = rows.slice(start, end);
    const totalHeight = offsets[rows.length] + (hasMore ? 44 : 0);

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
                                data-sha={row.sha}
                                className={`row ${selectedSet.has(row.sha) ? 'selected' : ''}`}
                                style={{ top: offsets[index], minHeight: rowHeight }}
                                title={rowTooltip(row)}
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
                                    <span className="row-refs">
                                        {row.isHead && <span className="ref head">HEAD</span>}
                                        {row.refs.slice(0, 3).map(ref => (
                                            <span
                                                key={`${ref.name}-${ref.sha}`}
                                                className={`ref ${ref.type}`}
                                                title={`${ref.type}: ${ref.name}\nRight-click to copy the name`}
                                                onContextMenu={event => {
                                                    event.preventDefault();
                                                    event.stopPropagation();
                                                    props.onRefContextMenu(ref, event.clientX, event.clientY);
                                                }}
                                            >
                                                {ref.shortName}
                                            </span>
                                        ))}
                                        {row.refs.length > 3 && (
                                            <span
                                                className="ref more"
                                                title={row.refs.map(ref => ref.shortName).join('\n')}
                                            >
                                                +{row.refs.length - 3}
                                            </span>
                                        )}
                                    </span>
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
                        <div className="load-more" style={{ top: offsets[rows.length] }}>
                            <button onClick={props.onLoadMore}>Load more commits</button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
