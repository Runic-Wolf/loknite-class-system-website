import { apiRequest } from '../../app/api';

export type TagChoice = { value: string; label: string };
export type TagGroup = {
  id: string;
  label: string;
  structural: boolean;
  custom: boolean;
  tags: TagChoice[];
  version: string;
};
export type TagGroupList = { groups: TagGroup[] };
export type CreateTagResult = { group: string; tag: TagChoice; version: string; revision: number; unchanged?: boolean };
export type TaggableResource = 'classes' | 'cards' | 'skills';
export type TagAssignmentSummary = { selectedCount: number; assignments: Record<string, string[]> };
export type BulkTagResult = {
  table: TaggableResource;
  action: 'add' | 'remove';
  tag: string;
  selectedCount: number;
  changedCount: number;
  unchangedCount: number;
  revision: number;
  unchanged?: boolean;
};

export function getTagGroups(signal?: AbortSignal): Promise<TagGroupList> {
  return apiRequest<TagGroupList>('/catalog/tags', { signal });
}

export function createCustomTag(group: string, value: string, version: string): Promise<CreateTagResult> {
  return apiRequest<CreateTagResult>('/catalog/tags', {
    method: 'POST', body: { group, value }, version,
  });
}

export function getTagAssignments(resource: TaggableResource, ids: string[], signal?: AbortSignal): Promise<TagAssignmentSummary> {
  return apiRequest<TagAssignmentSummary>(`/catalog/${resource}/tags/selection`, {
    method: 'POST', body: { ids }, signal,
  });
}

export function changeTagsForSelection(
  resource: TaggableResource,
  input: { ids: string[]; action: 'add' | 'remove'; tag: string },
  idempotencyKey: string,
): Promise<BulkTagResult> {
  return apiRequest<BulkTagResult>(`/catalog/${resource}/tags/bulk`, {
    method: 'POST', body: input, idempotencyKey,
  });
}
