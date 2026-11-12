import type { LaneEdge } from '../protocol';

export interface LayoutCommit {
    sha: string;
    parents: string[];
}

export interface LayoutRow {
    lane: number;
    color: number;
    edges: LaneEdge[];
    laneCount: number;
}

interface Lane {
    /** Commit sha this lane is waiting for. Undefined means the lane is free. */
    expect: string | undefined;
    /** Palette index of the lane, kept stable for as long as the lane lives. */
    color: number;
}

/**
 * Assigns commits to vertical lanes.
 *
 * Input commits must be in topological order (children before parents, newest first).
 * The algorithm keeps a lane "reserved" for the parent it is waiting for, which keeps
 * long-running branches on a stable column instead of re-flowing on every row.
 *
 * Every edge carries vertical anchors so the renderer knows whether a segment starts at
 * the top of the row, at the commit dot, or ends at the dot. That keeps the drawing free
 * of the classic artifacts: lines hanging above the first commit of a branch, merge curves
 * running past the dot into the next row, and lines stopping half a row short of a dot.
 */
export function computeLayout(commits: LayoutCommit[], paletteSize = 10): LayoutRow[] {
    const size = Math.max(1, Math.floor(paletteSize));
    const lanes: Lane[] = [];
    /** How many live lanes use each palette entry, so neighbours stay visually distinct. */
    const usage = new Array<number>(size).fill(0);
    const rows: LayoutRow[] = [];
    let cursor = 0;

    const take = (avoid: number): number => {
        let best = 0;
        let bestUsage = Number.POSITIVE_INFINITY;
        for (let step = 0; step < size; step += 1) {
            const color = (cursor + step) % size;
            if (size > 2 && color === avoid) {
                continue;
            }
            const used = usage[color];
            if (used < bestUsage) {
                bestUsage = used;
                best = color;
            }
        }
        cursor = (best + 1) % size;
        usage[best] += 1;
        return best;
    };

    const drop = (color: number): void => {
        usage[color] = Math.max(0, usage[color] - 1);
    };

    for (const commit of commits) {
        const waiting: number[] = [];
        const occupied: number[] = [];
        for (let index = 0; index < lanes.length; index += 1) {
            if (lanes[index].expect === undefined) {
                continue;
            }
            occupied.push(index);
            if (lanes[index].expect === commit.sha) {
                waiting.push(index);
            }
        }

        const [firstParent, ...otherParents] = commit.parents;
        const continues = waiting.length > 0;
        let lane: number;

        if (continues) {
            lane = waiting[0];
        } else {
            const free = lanes.findIndex(item => item.expect === undefined);
            if (free >= 0) {
                lane = free;
            } else {
                lane = lanes.length;
                lanes.push({ expect: undefined, color: 0 });
            }
            const left = lane > 0 ? lanes[lane - 1] : undefined;
            lanes[lane].color = take(left && left.expect !== undefined ? left.color : -1);
            if (!firstParent) {
                // The commit terminates here, so the color is not owned by a live lane.
                drop(lanes[lane].color);
            }
        }

        const color = lanes[lane].color;
        const edges: LaneEdge[] = [];

        // Lanes that were also waiting for this commit converge into the chosen lane.
        for (const match of waiting) {
            if (match === lane) {
                continue;
            }
            edges.push({
                from: match,
                to: lane,
                color: lanes[match].color,
                fromAnchor: 'top',
                toAnchor: 'dot',
            });
            drop(lanes[match].color);
            lanes[match].expect = undefined;
        }

        // Every other active lane simply passes through this row.
        for (const index of occupied) {
            if (index === lane || waiting.includes(index)) {
                continue;
            }
            edges.push({
                from: index,
                to: index,
                color: lanes[index].color,
                fromAnchor: 'top',
                toAnchor: 'bottom',
            });
        }

        if (firstParent) {
            lanes[lane].expect = firstParent;
            lanes[lane].color = color;
            edges.push({
                from: lane,
                to: lane,
                color,
                fromAnchor: continues ? 'top' : 'dot',
                toAnchor: 'bottom',
            });
        } else {
            if (continues) {
                edges.push({
                    from: lane,
                    to: lane,
                    color,
                    fromAnchor: 'top',
                    toAnchor: 'dot',
                });
                drop(color);
            }
            lanes[lane].expect = undefined;
        }

        // Extra parents open a fresh lane on the right, never to the left of the mainline.
        for (const parent of otherParents) {
            let target = -1;
            for (let index = lane + 1; index < lanes.length; index += 1) {
                if (lanes[index].expect === undefined) {
                    target = index;
                    break;
                }
            }
            if (target < 0) {
                target = lanes.length;
                lanes.push({ expect: undefined, color: 0 });
            }
            const neighbour = target > 0 ? lanes[target - 1] : undefined;
            const branchColor = take(neighbour && neighbour.expect !== undefined ? neighbour.color : color);
            lanes[target] = { expect: parent, color: branchColor };
            edges.push({
                from: lane,
                to: target,
                color: branchColor,
                fromAnchor: 'dot',
                toAnchor: 'bottom',
            });
        }

        // Trim inactive lanes at the tail so the graph does not grow forever.
        while (lanes.length > 0 && lanes[lanes.length - 1].expect === undefined) {
            lanes.pop();
        }

        let laneCount = lane + 1;
        for (const edge of edges) {
            laneCount = Math.max(laneCount, edge.from + 1, edge.to + 1);
        }

        rows.push({ lane, color, edges, laneCount });
    }

    return rows;
}

export function maxLaneCount(rows: LayoutRow[]): number {
    let max = 1;
    for (const row of rows) {
        max = Math.max(max, row.laneCount);
    }
    return max;
}
