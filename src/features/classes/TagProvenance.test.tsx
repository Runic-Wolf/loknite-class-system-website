// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TagProvenance } from './TagProvenance';

const result = {
  class: { id: 'rune', name: 'Rune Knight', tier: 'C3' },
  lineage: [{ id: 'base_0', name: 'Fighter', tier: 'C1' }, { id: 'knight', name: 'Knight', tier: 'C2' }, { id: 'rune', name: 'Rune Knight', tier: 'C3' }],
  counts: { effective: 2, directOnClass: 1, ownSkills: 1, inheritedSkills: 1 },
  tags: [
    {
      value: 'FIRE', occurrenceCount: 2, directOnClass: true, fromOwnSkills: false, fromAncestorSkills: true,
      sources: [
        { kind: 'class' as const, recordId: 'rune', recordName: 'Rune Knight', classId: 'rune', className: 'Rune Knight', inherited: false },
        { kind: 'skill' as const, recordId: 'skill-root', recordName: 'Flame Guard', classId: 'base_0', className: 'Fighter', inherited: true },
      ],
    },
    {
      value: 'HEAL', occurrenceCount: 1, directOnClass: false, fromOwnSkills: true, fromAncestorSkills: false,
      sources: [{ kind: 'skill' as const, recordId: 'skill-local', recordName: 'Rune Mend', classId: 'rune', className: 'Rune Knight', inherited: false }],
    },
  ],
};

function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(result), { status: 200, headers: { 'Content-Type': 'application/json' } })));
  return render(<MemoryRouter><QueryClientProvider client={client}><TagProvenance classId="rune" /></QueryClientProvider></MemoryRouter>);
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('TagProvenance', () => {
  it('loads origins on demand and distinguishes direct, own-skill, and inherited occurrences', async () => {
    const user = userEvent.setup();
    renderPanel();
    expect(fetch).not.toHaveBeenCalled();

    await user.click(screen.getByText('Effective tags & origins'));
    expect(await screen.findByText('2 sources')).toBeTruthy();
    expect(screen.getByText('Assigned directly to Rune Knight')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Flame Guard' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Fighter' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Rune Mend' })).toBeTruthy();
    expect(screen.getByText(/C-Tier is structural and is not counted as a tag/)).toBeTruthy();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('offers a retry without discarding the panel when the request fails', async () => {
    const user = userEvent.setup();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'Temporary failure' }), { status: 503, headers: { 'Content-Type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify(result), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    render(<MemoryRouter><QueryClientProvider client={client}><TagProvenance classId="rune" /></QueryClientProvider></MemoryRouter>);

    await user.click(screen.getByText('Effective tags & origins'));
    await screen.findByRole('alert');
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole('link', { name: 'Flame Guard' })).toBeTruthy();
  });
});
