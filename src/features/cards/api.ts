import { apiRequest, catalogPath, recordPath } from '../../app/api';
import type { CardCategory, CardList, CardRecord, CardRow, CardWrite, CardWriteResult, GalleryGroup, GalleryGroupList, GalleryGroupRenameResult } from './types';

export function getCardList(params: URLSearchParams, signal?: AbortSignal): Promise<CardList> {
  return apiRequest<CardList>(catalogPath('cards', {
    q: params.get('q') ?? undefined,
    category: params.get('category') ?? undefined,
    origin: params.get('origin') ?? undefined,
    type: params.getAll('type'),
    cost: params.getAll('cost'),
    element: params.getAll('element'),
    status: params.get('status') ?? undefined,
    owner: params.get('owner') ?? undefined,
    tag: params.getAll('tag'),
    tier: params.getAll('tier'),
    family: params.get('family') ?? undefined,
    classId: params.get('classId') ?? undefined,
    compareClass: params.getAll('compareClass'),
    group: params.get('group') ?? undefined,
    after: params.get('after') ?? undefined,
    limit: 24,
  }), { signal });
}

export function getCard(id: string, signal?: AbortSignal): Promise<CardRecord> {
  return apiRequest<CardRecord>(recordPath('cards', id), { signal });
}

export function getGalleryGroups(category: Exclude<CardCategory, 'class'>, signal?: AbortSignal): Promise<GalleryGroupList> {
  return apiRequest<GalleryGroupList>(`/gallery-groups?category=${encodeURIComponent(category)}`, { signal });
}

export function renameGalleryGroup(category: Exclude<CardCategory, 'class'>, group: GalleryGroup, name: string): Promise<GalleryGroupRenameResult> {
  return apiRequest<GalleryGroupRenameResult>(`/gallery-groups/${encodeURIComponent(category)}/${group.slot}`, {
    method: 'PATCH', body: { name }, version: group.version,
  });
}

export function createCard(input: CardWrite, idempotencyKey: string): Promise<CardWriteResult> {
  return apiRequest<CardWriteResult>('/catalog/cards', { method: 'POST', body: input, idempotencyKey });
}

export function updateCard(id: string, version: string, input: CardWrite): Promise<CardWriteResult> {
  return apiRequest<CardWriteResult>(recordPath('cards', id), { method: 'PATCH', body: input, version });
}

export function setCardConfirmation(id: string, version: string, action: 'confirm' | 'unconfirm'): Promise<CardWriteResult> {
  return apiRequest<CardWriteResult>(`${recordPath('cards', id)}/${action}`, { method: 'POST', body: {}, version });
}

export function moveCard(id: string, version: string, destinationClassId: string, idempotencyKey: string): Promise<CardWriteResult> {
  return apiRequest<CardWriteResult>(`${recordPath('cards', id)}/move`, { method: 'POST', body: { destinationClassId }, version, idempotencyKey });
}

export function deleteCard(id: string, version: string): Promise<{ id: string; revision: number; deleted: true }> {
  return apiRequest(recordPath('cards', id), { method: 'DELETE', body: {}, version });
}

export type { CardRow };
