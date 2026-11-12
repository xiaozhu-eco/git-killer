import { describe, expect, it } from 'vitest';
import { computeLayout, type LayoutRow } from '../../src/graph/laneLayout';

function commit(sha: string, ...parents: string[]) {
    return { sha, parents };
}

/** Lanes that are drawn down to the bottom of a row, i.e. still alive below it. */
function carriedDown(row: LayoutRow): Set<number> {
    return new Set(row.edges.filter(edge => edge.toAnchor === 'bottom').map(edge => edge.to));
}

/** Lanes that enter a row through its top edge. */
function enteredFromTop(row: LayoutRow): Set<number> {
    return new Set(row.edges.filter(edge => edge.fromAnchor === 'top').map(edge => edge.from));
}

describe('computeLayout', () => {
    it('keeps a linear history in one lane', () => {
        const rows = computeLayout([commit('c', 'b'), commit('b', 'a'), commit('a')]);
        expect(rows.map(row => row.lane)).toEqual([0, 0, 0]);
        // The first commit opens the lane at the dot instead of hanging a line above it.
        expect(rows[0].edges).toEqual([
            { from: 0, to: 0, color: 0, fromAnchor: 'dot', toAnchor: 'bottom' },
        ]);
        // The root commit closes the lane: the line stops exactly on the dot.
        expect(rows[2].edges).toEqual([
            { from: 0, to: 0, color: 0, fromAnchor: 'top', toAnchor: 'dot' },
        ]);
    });

    it('opens a lane for a second parent and merges it back', () => {
        const rows = computeLayout([
            commit('m', 'a', 'b'),
            commit('a', 'c'),
            commit('b', 'c'),
            commit('c'),
        ]);
        // m is lane 0, b starts lane 1
        expect(rows[0].lane).toBe(0);
        expect(rows[0].edges).toContainEqual({
            from: 0,
            to: 1,
            color: 1,
            fromAnchor: 'dot',
            toAnchor: 'bottom',
        });
        // the two histories converge on c, the extra lane merges into lane 0
        expect(rows[3].lane).toBe(0);
        expect(rows[3].edges).toContainEqual({
            from: 1,
            to: 0,
            color: 1,
            fromAnchor: 'top',
            toAnchor: 'dot',
        });
    });

    it('handles octopus merges', () => {
        const rows = computeLayout([
            commit('o', 'a', 'b', 'c'),
            commit('a', 'base'),
            commit('b', 'base'),
            commit('c', 'base'),
            commit('base'),
        ]);
        expect(rows[0].lane).toBe(0);
        const toLanes = rows[0].edges.filter(edge => edge.from === 0).map(edge => edge.to);
        expect(new Set(toLanes)).toEqual(new Set([0, 1, 2]));
        expect(rows[4].edges.some(edge => edge.from !== edge.to)).toBe(true);
    });

    it('reuses a freed lane for an unrelated root', () => {
        const rows = computeLayout([commit('a'), commit('b')]);
        expect(rows.map(row => row.lane)).toEqual([0, 0]);
        expect(rows[0].edges).toEqual([]);
        expect(rows[1].edges).toEqual([]);
    });

    it('does not leave trailing lanes behind', () => {
        const rows = computeLayout([commit('a', 'b'), commit('b')]);
        expect(rows[1].laneCount).toBe(1);
    });

    it('keeps the color of a lane across commits', () => {
        const rows = computeLayout([commit('c', 'b'), commit('b', 'a'), commit('a')]);
        expect(rows[0].color).toBe(rows[1].color);
        expect(rows[1].color).toBe(rows[2].color);
    });

    it('handles criss-cross merges without crashing', () => {
        const rows = computeLayout([
            commit('m2', 'x', 'y'),
            commit('m1', 'p', 'q'),
            commit('x', 'p'),
            commit('y', 'q'),
            commit('p'),
            commit('q'),
        ]);
        expect(rows).toHaveLength(6);
        for (const row of rows) {
            expect(row.lane).toBeGreaterThanOrEqual(0);
            expect(row.laneCount).toBeGreaterThanOrEqual(row.lane + 1);
        }
    });

    it('never draws a lane above its first commit', () => {
        const rows = computeLayout([
            commit('m', 'a', 'b'),
            commit('a', 'c'),
            commit('b', 'c'),
            commit('c', 'base'),
            commit('base'),
        ]);
        for (let index = 0; index < rows.length; index += 1) {
            const previous = index > 0 ? carriedDown(rows[index - 1]) : new Set<number>();
            for (const edge of rows[index].edges) {
                if (edge.fromAnchor === 'top') {
                    expect(previous.has(edge.from)).toBe(true);
                }
            }
        }
    });

    it('joins every lane the previous row carried down', () => {
        const rows = computeLayout([
            commit('a', 'a1'),
            commit('b', 'b1'),
            commit('a1', 'base'),
            commit('b1', 'base'),
            commit('base'),
        ]);
        for (let index = 1; index < rows.length; index += 1) {
            const entering = enteredFromTop(rows[index]);
            for (const lane of carriedDown(rows[index - 1])) {
                expect(entering.has(lane)).toBe(true);
            }
        }
    });

    it('opens extra parents to the right of the merge commit', () => {
        const rows = computeLayout([
            commit('deep', 'l1'),
            commit('l1', 'm'),
            commit('m', 'base', 'side', 'other'),
            commit('side', 'base'),
            commit('other', 'base'),
            commit('base'),
        ]);
        for (const row of rows) {
            for (const edge of row.edges) {
                if (edge.from === edge.to) {
                    continue;
                }
                expect(edge.to).toBeGreaterThanOrEqual(row.lane);
            }
        }
    });

    it('keeps the branch color distinct from the mainline when the palette allows', () => {
        const rows = computeLayout([commit('m', 'a', 'b'), commit('a'), commit('b')], 6);
        const branch = rows[0].edges.find(edge => edge.from !== edge.to && edge.from === 0);
        expect(branch).toBeDefined();
        expect(branch?.color).not.toBe(rows[0].color);
    });
});
