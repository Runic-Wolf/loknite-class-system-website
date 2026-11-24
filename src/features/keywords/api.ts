import { apiRequest, catalogPath, recordPath } from '../../app/api';
import type { KeywordList, KeywordRecord, KeywordWrite, KeywordWriteResult } from './types';

export function getKeywordList(params: URLSearchParams, signal?: AbortSignal): Promise<KeywordList> {
  return apiRequest<KeywordList>(catalogPath('keywords', { q: params.get('q') ?? undefined, after: params.get('after') ?? undefined, limit: 24 }), { signal });
}

export function getKeyword(id: string, signal?: AbortSignal): Promise<KeywordRecord> {
  return apiRequest<KeywordRecord>(recordPath('keywords', id), { signal });
}

export function createKeyword(input: KeywordWrite, idempotencyKey: string): Promise<KeywordWriteResult> {
  return apiRequest<KeywordWriteResult>('/catalog/keywords', { method: 'POST', body: input, idempotencyKey });
}

export function updateKeyword(id: string, version: string, input: KeywordWrite): Promise<KeywordWriteResult> {
  return apiRequest<KeywordWriteResult>(recordPath('keywords', id), { method: 'PATCH', body: input, version });
}

export function deleteKeyword(id: string, version: string): Promise<{ id: string; revision: number; deleted: true }> {
  return apiRequest(recordPath('keywords', id), { method: 'DELETE', body: {}, version });
}
