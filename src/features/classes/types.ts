import type { ClassQuery } from '../../../shared/class-query.js';

export type ClassRow = {
  id: string;
  name: string;
  tier: 'C1' | 'C2' | 'C3' | 'SPEC';
  slot: string;
  parentId: string | null;
  concept: string | null;
  tags: string[];
  icon: string | null;
  artwork?: string | null;
  position?: number;
  notesLength?: number;
  notesPreview?: string;
};

export type ClassLineageRoot = Pick<ClassRow, 'id' | 'name' | 'tier' | 'slot' | 'icon' | 'artwork' | 'position'>;
export type ClassOption = Pick<ClassRow, 'id' | 'name' | 'tier' | 'slot' | 'parentId'>;

export type LineagePart = {
  id: string;
  name: string;
  tier: ClassRow['tier'];
  parentId: string | null;
  slot: string;
};

export type ClassRecord = {
  item: ClassRow & {
    notes: string;
    imagePath: string | null;
    official: boolean;
  };
  version: string;
  position: number;
  lineage: LineagePart[];
  children: Array<{ id: string; name: string; tier: ClassRow['tier'] }>;
  skillCount: number;
  cardCount: number;
  icon: string | null;
  artwork: string | null;
};

export type ClassList = { items: ClassRow[]; next: string | null };

export type CatalogOverview = {
  head: { revision: number; updatedAt: string };
  counts: { classes: number; cards: number; skills: number; keywords: number; confirmed: number };
  lineages: ClassLineageRoot[];
  galleryNames: Record<string, string>;
  dashboard: {
    query: ClassQuery;
    search: string;
    total: number;
    counts: { classes: number; c3: number; skills: number; specializations: number };
    tierCounts: Record<'C1' | 'C2' | 'C3' | 'SPEC', number>;
    tagCoverage: Array<{ tag: string; classes: number }>;
    classes: Array<{ id: string; name: string; tier: ClassRow['tier']; slot: string; parentId: string | null; concept: string | null; position: number; effectiveTagCount: number }>;
    resultsTruncated: boolean;
  };
};

export type Session = { email: string; admin: boolean; local?: boolean };

export type ClassUpdate = {
  name: string;
  concept: string;
  notes: string;
  imagePath: string | null;
  tags: string[];
};

export type ClassWriteResult = {
  item: ClassRecord['item'];
  version: string;
  position: number;
  revision: number;
  unchanged?: boolean;
};

export type ClassMentionCandidate =
  | { kind: 'class'; id: string; name: string; tier: 'C1' | 'C2' | 'C3'; slot: string; context: string }
  | { kind: 'card'; id: string; name: string; category: 'class' | 'enemy' | 'neutral' | 'equipment' | 'species' | 'status'; type: string; ownerId: string | null; ownerSlot: string | null; slot?: number; context: string }
  | { kind: 'skill'; id: string; name: string; skillKind: string; classId: string; classSlot: string; context: string }
  | { kind: 'tag'; name: string; value: string; group: string; groupLabel: string };

export type ClassMentionResolution = {
  line: number;
  tier: 'C1' | 'C2' | 'C3';
  name: string;
  status: 'pending' | 'resolved' | 'ambiguous';
  candidates: ClassMentionCandidate[];
  truncated: boolean;
};

export type ClassNoteCursor = { start: number; end: number; scrollTop: number };

export type ClassNoteHandoff = {
  drafts: Record<string, string>;
  openIds: string[];
  activeNoteId: string;
  cursor: ClassNoteCursor;
  scrollY: number;
};
