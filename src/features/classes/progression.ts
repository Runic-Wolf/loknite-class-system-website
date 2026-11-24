import type { ClassRow } from './types';

export type ProgressionC3 = {
  item: ClassRow;
  specializations: ClassRow[];
};

export type ProgressionBranch = {
  item: ClassRow;
  classes: ProgressionC3[];
};

export type ClassProgression = {
  root: ClassRow;
  branches: ProgressionBranch[];
};

export function slotOrdinal(slot: string): number {
  const segment = slot.split('/').at(-1) ?? '';
  const ordinal = Number(segment.slice(segment.lastIndexOf('_') + 1));
  return Number.isInteger(ordinal) && ordinal >= 0 ? ordinal : Number.MAX_SAFE_INTEGER;
}

function compareSlot(a: ClassRow, b: ClassRow): number {
  return slotOrdinal(a.slot) - slotOrdinal(b.slot)
    || (a.position ?? Number.MAX_SAFE_INTEGER) - (b.position ?? Number.MAX_SAFE_INTEGER)
    || a.slot.localeCompare(b.slot, undefined, { numeric: true })
    || a.id.localeCompare(b.id);
}

export function classNodeLabel(item: ClassRow): string {
  const name = item.name.trim();
  if (name && name !== '?') return name;
  if (item.tier === 'SPEC') return 'Specialization ' + (slotOrdinal(item.slot) + 1);
  return item.tier + ' class in progress';
}

export function isPlaceholderClassName(item: ClassRow): boolean {
  return !item.name.trim() || item.name.trim() === '?';
}

export function buildClassProgression(items: readonly ClassRow[]): ClassProgression | null {
  if (items.length !== 21) return null;

  const ids = new Set(items.map(item => item.id));
  if (ids.size !== items.length) return null;

  const roots = items.filter(item => item.tier === 'C1');
  if (roots.length !== 1) return null;
  const root = roots[0];
  if (!root) return null;
  const used = new Set([root.id]);
  const c2Items = items.filter(item => item.tier === 'C2' && item.parentId === root.id).sort(compareSlot);
  if (c2Items.length !== 2) return null;

  const branches: ProgressionBranch[] = [];
  for (const branch of c2Items) {
    if (used.has(branch.id)) return null;
    used.add(branch.id);

    const c3Items = items.filter(item => item.tier === 'C3' && item.parentId === branch.id).sort(compareSlot);
    if (c3Items.length !== 3) return null;

    const classes: ProgressionC3[] = [];
    for (const item of c3Items) {
      if (used.has(item.id)) return null;
      used.add(item.id);

      const specializations = items.filter(child => child.tier === 'SPEC' && child.parentId === item.id).sort(compareSlot);
      if (specializations.length !== 2 || specializations.some(child => used.has(child.id))) return null;
      for (const specialization of specializations) used.add(specialization.id);
      classes.push({ item, specializations });
    }
    branches.push({ item: branch, classes });
  }

  return used.size === items.length ? { root, branches } : null;
}
