import type { ClassNoteHandoff } from './types';

const storageKey = 'loknite.class-notes.handoff.v1';
const validId = (value: unknown): value is string => typeof value === 'string' && /^[a-zA-Z0-9_.:-]{1,160}$/.test(value);

export function readClassNoteHandoff(): ClassNoteHandoff | null {
  try {
    const raw: unknown = JSON.parse(sessionStorage.getItem(storageKey) ?? 'null');
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const item = raw as Partial<ClassNoteHandoff>;
    const cursor = item.cursor;
    const scrollY = item.scrollY;
    if (!item.drafts || typeof item.drafts !== 'object' || Array.isArray(item.drafts)
      || !Array.isArray(item.openIds) || !validId(item.activeNoteId)
      || !cursor || typeof cursor.start !== 'number' || !Number.isInteger(cursor.start)
      || typeof cursor.end !== 'number' || !Number.isInteger(cursor.end)
      || typeof cursor.scrollTop !== 'number' || !Number.isFinite(cursor.scrollTop)
      || typeof scrollY !== 'number' || !Number.isFinite(scrollY)) return null;
    const drafts = Object.fromEntries(Object.entries(item.drafts)
      .filter(([id, value]) => validId(id) && typeof value === 'string' && value.length <= 32_000)) as Record<string, string>;
    const openIds = item.openIds.filter(validId);
    return {
      drafts,
      openIds,
      activeNoteId: item.activeNoteId,
      cursor: {
        start: Math.max(0, Math.min(32_000, cursor.start)),
        end: Math.max(0, Math.min(32_000, cursor.end)),
        scrollTop: Math.max(0, cursor.scrollTop),
      },
      scrollY: Math.max(0, scrollY),
    };
  } catch {
    return null;
  }
}

export function clearClassNoteHandoff(): void {
  try { sessionStorage.removeItem(storageKey); } catch { /* Drafts remain in React state for the current view. */ }
}

export function writeClassNoteHandoff(value: ClassNoteHandoff): boolean {
  try {
    sessionStorage.setItem(storageKey, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
