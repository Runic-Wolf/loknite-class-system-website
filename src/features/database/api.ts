import { apiRequest, recordPath } from '../../app/api';
import type { ClassQuery } from '../../../shared/class-query.js';

export type SavedQuery = {
  id: string;
  name: string;
  query: ClassQuery | null;
  position: number;
  version: string;
};

export type SavedQueryList = { items: SavedQuery[] };
export type SavedQueryWrite = { item: SavedQuery; version: string; revision: number; unchanged?: boolean };

export function getSavedQueries(signal?: AbortSignal): Promise<SavedQueryList> {
  return apiRequest<SavedQueryList>('/catalog/presets', { signal });
}

export function createSavedQuery(input: { id: string; name: string; query: ClassQuery }): Promise<SavedQueryWrite> {
  return apiRequest<SavedQueryWrite>('/catalog/presets', { method: 'POST', body: input });
}

export function updateSavedQuery(id: string, version: string, input: { name: string; query: ClassQuery }): Promise<SavedQueryWrite> {
  return apiRequest<SavedQueryWrite>(recordPath('presets', id), { method: 'PATCH', version, body: input });
}

export function deleteSavedQuery(id: string, version: string): Promise<{ id: string; revision: number }> {
  return apiRequest<{ id: string; revision: number }>(recordPath('presets', id), { method: 'DELETE', version });
}
