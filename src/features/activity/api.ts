import { apiRequest, catalogPath } from '../../app/api';

export type AuditEvent = {
  id: string;
  revision: number | null;
  actor: string;
  action: string;
  resource: string | null;
  resourceId: string | null;
  resourceName: string | null;
  changedFields: string[];
  details: Record<string, unknown>;
  createdAt: string;
};

export type AuditPage = { items: AuditEvent[]; next: string | null; actors: string[] };

export function getAuditEvents(params: URLSearchParams, signal?: AbortSignal): Promise<AuditPage> {
  return apiRequest<AuditPage>(catalogPath('audit', {
    limit: 20,
    actor: params.get('actor') ?? undefined,
    after: params.get('after') ?? undefined,
  }), { signal });
}
