import { describe, expect, it, vi } from 'vitest';
import { getTagAssignments } from './api';

const { apiRequest } = vi.hoisted(() => ({ apiRequest: vi.fn() }));
vi.mock('../../app/api', () => ({ apiRequest }));

describe('tag assignment query API', () => {
  it('posts selected IDs in JSON so large selections do not inflate the URL', async () => {
    const ids = ['card-a', 'card-b'];
    const signal = new AbortController().signal;
    apiRequest.mockResolvedValue({ selectedCount: 2, assignments: { 'card-a': [], 'card-b': [] } });

    await getTagAssignments('cards', ids, signal);

    expect(apiRequest).toHaveBeenCalledWith('/catalog/cards/tags/selection', {
      method: 'POST', body: { ids }, signal,
    });
  });
});
