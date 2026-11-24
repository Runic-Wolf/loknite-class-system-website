import { apiRequest, catalogPath, recordPath } from '../../app/api';
import type { CardWriteResult } from '../cards/types';
import type { CatalogOverview, ClassList, ClassMentionResolution, ClassOption, ClassRecord, ClassRow, ClassUpdate, ClassWriteResult } from './types';

export function getClassList(params: URLSearchParams, signal?: AbortSignal): Promise<ClassList> {
  const path = catalogPath('classes', {
    q: params.get('q') ?? undefined,
    tier: params.get('tier') ?? undefined,
    lineage: params.get('lineage') ?? undefined,
    after: params.get('after') ?? undefined,
    limit: 24,
  });
  return apiRequest<ClassList>(path, { signal });
}

export async function getClassLineage(slot: string, signal?: AbortSignal): Promise<ClassRow[]> {
  const result = await getClassList(new URLSearchParams({ lineage: slot }), signal);
  if (result.next) throw new Error('This class lineage is larger than the supported result window.');
  return result.items;
}

export function getClassOptions(ids: string[], signal?: AbortSignal): Promise<{ items: ClassOption[] }> {
  return apiRequest<{ items: ClassOption[] }>(catalogPath('classes/options', { id: ids }), { signal });
}

export function getClass(id: string, signal?: AbortSignal): Promise<ClassRecord> {
  return apiRequest<ClassRecord>(recordPath('classes', id), { signal });
}

export function getOverview(signal?: AbortSignal, filters?: URLSearchParams): Promise<CatalogOverview> {
  const path = catalogPath('overview', {
    q: filters?.get('q') ?? undefined,
    where: filters?.get('where') ?? undefined,
    tag: filters?.getAll('tag'),
    tagSource: filters?.get('tagSource') ?? undefined,
  });
  return apiRequest<CatalogOverview>(path, { signal });
}

export function updateClass(id: string, version: string, input: ClassUpdate): Promise<ClassWriteResult> {
  return apiRequest<ClassWriteResult>(recordPath('classes', id), {
    method: 'PATCH',
    body: input,
    version,
  });
}

export function updateClassNotes(id: string, version: string, notes: string): Promise<ClassWriteResult> {
  return apiRequest<ClassWriteResult>(recordPath('classes', id), {
    method: 'PATCH',
    body: { notes },
    version,
  });
}

export function resolveClassNoteMentions(input: {
  mentions: Array<{ line: number; tier: 'C1' | 'C2' | 'C3'; name: string; ownerId: string }>;
}, signal?: AbortSignal): Promise<{ items: ClassMentionResolution[] }> {
  return apiRequest<{ items: ClassMentionResolution[] }>('/catalog/mentions/resolve', { method: 'POST', body: input, signal });
}

export function createClassNoteDraft(input: {
  ownerId: string;
  tier: 'C1' | 'C2' | 'C3';
  name: string;
}, idempotencyKey: string): Promise<CardWriteResult> {
  return apiRequest<CardWriteResult>('/catalog/mentions/draft', {
    method: 'POST',
    body: input,
    idempotencyKey,
  });
}
