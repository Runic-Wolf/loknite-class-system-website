export type ClassQueryField = 'tag' | 'tier' | 'name' | 'kind' | 'hasSkills' | 'favorite';
export type ClassQueryRule = { field: ClassQueryField; value: string; enabled: boolean; exclude: boolean };
export type ClassQuery = { logic: 'AND' | 'OR'; source: 'direct' | 'effective'; rules: ClassQueryRule[]; scope?: ClassQuery };

export const classQueryDefaults: Readonly<ClassQuery>;
export function normalizeClassQuery(value: unknown): ClassQuery;
export function readClassQuery(params: URLSearchParams): ClassQuery;
export function classQueryToSearchParams(query: ClassQuery, current?: URLSearchParams): URLSearchParams;
