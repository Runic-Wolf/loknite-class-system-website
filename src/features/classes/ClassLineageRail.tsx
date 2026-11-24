import { ClassFamilyIconRail } from './ClassFamilyIconRail';
import { hrefWithParams } from '../../app/urls';
import type { ClassLineageRoot } from './types';

export function ClassLineageRail({ items, activeSlot, params }: {
  items: ClassLineageRoot[];
  activeSlot: string | null;
  params: URLSearchParams;
}) {
  return <ClassFamilyIconRail
    items={items}
    activeSlot={activeSlot}
    sectionLabel="Class families"
    navLabel="Choose a class lineage"
    heading={`${items.length} roots`}
    instruction="Choose a root to open its progression"
    linkLabel={root => `Open progression for ${root.name || 'unnamed class'}`}
    hrefForRoot={root => hrefWithParams(params, {
      view: 'classes', lineage: root.slot, id: null, q: null, tier: null, after: null,
      edit: null, saved: null, error: null,
    })}
  />;
}
