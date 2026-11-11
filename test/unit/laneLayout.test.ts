import { describe, expect, it } from 'vitest';
import { computeLayout } from '../../src/graph/laneLayout';

function commit(sha: string, ...parents: string[]) {
    return { sha, parents };
}

describe('computeLayout', () => {
    it('keeps a linear history in one lane', () => {
        const rows = computeLayout([commit('c', 'b'), commit('b', 'a'), commit('a')]);
        expect(rows.map(row => row.lane)).toEqual([0, 0, 0]);
        expect(rows[0].edges).toEqual([{ from: 0, to: 0, color: 0 }]);
        expect(rows[2].edges).toEqual([]);
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
        expect(rows[0].edges).toContainEqual({ from: 0, to: 1, color: 1 });
        // the two histories converge on c, the extra lane merges into lane 0
        expect(rows[3].lane).toBe(0);
        expect(rows[3].edges).toContainEqual({ from: 1, to: 0, color: 1 });
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
});
