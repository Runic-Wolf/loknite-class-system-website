import { apiRequest, catalogPath, recordPath } from '../../app/api';
import type { ClassOption, SkillList, SkillRecord, SkillWrite, SkillWriteResult } from './types';

export function getSkillList(params: URLSearchParams, signal?: AbortSignal): Promise<SkillList> {
  return apiRequest<SkillList>(catalogPath('skills', {
    q: params.get('q') ?? undefined,
    kind: params.get('kind') ?? undefined,
    class: params.get('class') ?? undefined,
    after: params.get('after') ?? undefined,
    limit: 24,
  }), { signal });
}

export function getSkill(id: string, signal?: AbortSignal): Promise<SkillRecord> {
  return apiRequest<SkillRecord>(recordPath('skills', id), { signal });
}

export function findClasses(query: string, signal?: AbortSignal): Promise<{ items: ClassOption[]; next: string | null }> {
  return apiRequest(catalogPath('classes', { q: query || undefined, limit: 24 }), { signal });
}

export function createSkill(input: SkillWrite, idempotencyKey: string): Promise<SkillWriteResult> {
  return apiRequest('/catalog/skills', { method: 'POST', body: input, idempotencyKey });
}

export function updateSkill(id: string, version: string, input: SkillWrite): Promise<SkillWriteResult> {
  return apiRequest<SkillWriteResult>(recordPath('skills', id), { method: 'PATCH', body: input, version });
}

export function duplicateSkill(id: string, version: string, idempotencyKey: string): Promise<SkillWriteResult> {
  return apiRequest<SkillWriteResult>(`${recordPath('skills', id)}/duplicate`, { method: 'POST', body: {}, version, idempotencyKey });
}

export function deleteSkill(id: string, version: string, disposition: 'keep-card' | 'delete-card'): Promise<{ id: string; revision: number; deleted: true }> {
  return apiRequest(recordPath('skills', id), { method: 'DELETE', body: { disposition }, version });
}
