import { describe, expect, it } from 'vitest';
import { buildClassProgression, classNodeLabel, isPlaceholderClassName } from './progression';
import type { ClassRow } from './types';

function fixture(): ClassRow[] {
  const rows: ClassRow[] = [{
    id: 'root', name: 'Root Class', tier: 'C1', slot: 'C1_0', parentId: null,
    concept: null, tags: [], icon: null, position: 0,
  }];

  for (let branch = 1; branch >= 0; branch--) {
    const branchId = 'c2-' + branch;
    rows.push({
      id: branchId, name: 'Branch ' + branch, tier: 'C2', slot: 'C1_0/C2_' + branch,
      parentId: 'root', concept: null, tags: [], icon: null, position: branch,
    });
    for (let child = 2; child >= 0; child--) {
      const childId = 'c3-' + branch + '-' + child;
      rows.push({
        id: childId, name: 'Path ' + child, tier: 'C3', slot: 'C1_0/C2_' + branch + '/C3_' + child,
        parentId: branchId, concept: null, tags: [], icon: null, position: child,
      });
      for (let specialization = 1; specialization >= 0; specialization--) {
        rows.push({
          id: 'spec-' + branch + '-' + child + '-' + specialization, name: '?', tier: 'SPEC',
          slot: 'C1_0/C2_' + branch + '/C3_' + child + '/SPEC_' + specialization,
          parentId: childId, concept: null, tags: [], icon: null, position: specialization,
        });
      }
    }
  }
  return rows;
}

describe('class progression', () => {
  it('reconstructs all 21 fixed slots in parent and slot order', () => {
    const tree = buildClassProgression(fixture());
    const firstBranch = tree?.branches.at(0);
    expect(tree?.branches.map(branch => branch.item.slot)).toEqual(['C1_0/C2_0', 'C1_0/C2_1']);
    expect(tree?.branches.map(branch => branch.classes.length)).toEqual([3, 3]);
    expect(firstBranch?.classes.map(node => node.item.slot)).toEqual([
      'C1_0/C2_0/C3_0', 'C1_0/C2_0/C3_1', 'C1_0/C2_0/C3_2',
    ]);
    expect(firstBranch?.classes.at(0)?.specializations.map(node => node.slot)).toEqual([
      'C1_0/C2_0/C3_0/SPEC_0', 'C1_0/C2_0/C3_0/SPEC_1',
    ]);
  });

  it('keeps provisional specialization slots visible with a useful label', () => {
    const item = fixture().find(row => row.tier === 'SPEC')!;
    expect(classNodeLabel(item)).toBe('Specialization 2');
    expect(isPlaceholderClassName(item)).toBe(true);
  });

  it('refuses an incomplete, duplicate, or incorrectly parented lineage', () => {
    const rows = fixture();
    expect(buildClassProgression(rows.slice(0, -1))).toBeNull();
    expect(buildClassProgression([...rows, rows.at(0)!])).toBeNull();
    expect(buildClassProgression(rows.map(row => row.id === 'c3-0-0' ? { ...row, parentId: 'missing' } : row))).toBeNull();
  });
});
