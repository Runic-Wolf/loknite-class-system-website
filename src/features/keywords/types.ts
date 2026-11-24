export type KeywordRow = { id: string; name: string; effect: string };
export type KeywordReference = { id: string; name: string; table: 'classes' | 'cards' };
export type KeywordList = { items: KeywordRow[]; next: string | null };
export type KeywordItem = { id: string; name: string; effect: string };
export type KeywordRecord = { item: KeywordItem; version: string; position: number; references: KeywordReference[] };
export type KeywordWrite = { name: string; effect: string };
export type KeywordWriteResult = Omit<KeywordRecord, 'references'> & { revision: number; unchanged?: boolean };
