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
    color: number;
}

/**
 * Assigns commits to vertical lanes.
 *
 * Input commits must be in topological order (children before parents, newest first).
 * The algorithm keeps a lane "reserved" for the parent it is waiting for, which keeps
 * long-running branches on a stable column instead of re-flowing on every row.
 */
export function computeLayout(commits: LayoutCommit[], paletteSize = 10): LayoutRow[] {
    const lanes: Lane[] = [];
    const rows: LayoutRow[] = [];
    let nextColor = 0;

    for (const commit of commits) {
        const occupied: number[] = [];
        for (let i = 0; i < lanes.length; i++) {
            if (lanes[i].expect !== undefined) {
                occupied.push(i);
            }
        }

        const matches: number[] = [];
        for (let i = 0; i < lanes.length; i++) {
            if (lanes[i].expect === commit.sha) {
                matches.push(i);
            }
        }

        let lane: number;
        let color: number;

        if (matches.length > 0) {
            lane = matches[0];
            color = lanes[lane].color;
        } else {
            lane = lanes.findIndex(l => l.expect === undefined);
            if (lane < 0) {
                lane = lanes.length;
                lanes.push({ expect: undefined, color: 0 });
            }
            color = nextColor++ % paletteSize;
            lanes[lane].color = color;
        }

        const edges: LaneEdge[] = [];

        // Lanes that were also waiting for this commit converge into the chosen lane.
        for (const match of matches) {
            if (match !== lane) {
                edges.push({ from: match, to: lane, color: lanes[match].color });
            }
        }

        // Every other active lane simply passes through this row.
        for (const index of occupied) {
            if (index === lane || matches.includes(index)) {
                continue;
            }
            edges.push({ from: index, to: index, color: lanes[index].color });
        }

        for (const match of matches) {
            if (match !== lane) {
                lanes[match].expect = undefined;
            }
        }

        const [firstParent, ...otherParents] = commit.parents;
        lanes[lane].expect = firstParent;

        if (firstParent) {
            edges.push({ from: lane, to: lane, color });
        }

        for (const parent of otherParents) {
            let free = lanes.findIndex((l, index) => index !== lane && l.expect === undefined);
            if (free < 0) {
                free = lanes.length;
                lanes.push({ expect: undefined, color: 0 });
            }
            const branchColor = nextColor++ % paletteSize;
            lanes[free].expect = parent;
            lanes[free].color = branchColor;
            edges.push({ from: lane, to: free, color: branchColor });
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
