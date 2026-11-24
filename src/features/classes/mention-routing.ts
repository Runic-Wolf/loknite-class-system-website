import { classQueryToSearchParams } from '../../../shared/class-query.js';
import type { ClassMentionCandidate } from './types';

export function classMentionHref(candidate: ClassMentionCandidate): string {
  if (candidate.kind === 'class') {
    const params = new URLSearchParams({ view: 'classes', id: candidate.id });
    const rootSlot = candidate.slot.split('/')[0];
    if (rootSlot) params.set('lineage', rootSlot);
    return `/?${params}`;
  }

  if (candidate.kind === 'card') {
    const params = new URLSearchParams({ view: 'cards', category: candidate.category, id: candidate.id });
    if (candidate.category === 'class') {
      params.set('family', candidate.ownerSlot?.split('/')[0] ?? `C1_${candidate.slot ?? 0}`);
      if (candidate.ownerId) params.set('classId', candidate.ownerId);
    } else if (candidate.ownerId) {
      params.set('owner', candidate.ownerId);
    }
    return `/?${params}`;
  }

  if (candidate.kind === 'skill') {
    return `/?${new URLSearchParams({ view: 'database', entity: 'skills', id: candidate.id, class: candidate.classId })}`;
  }

  const params = new URLSearchParams({ view: 'database', type: 'classes' });
  const query = classQueryToSearchParams({
    logic: 'AND', source: 'direct',
    rules: [{ field: 'tag', value: candidate.value, enabled: true, exclude: false }],
  }, params);
  return `/?${query}`;
}
