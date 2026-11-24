// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BulkTagAssignment } from './BulkTagAssignment';
import { tagGroups } from '../../../shared/tag-catalog.js';

const { changeTagsForSelection, getTagAssignments, getTagGroups } = vi.hoisted(() => ({
  changeTagsForSelection: vi.fn(), getTagAssignments: vi.fn(), getTagGroups: vi.fn(),
}));

vi.mock('../tags/api', () => ({ changeTagsForSelection, getTagAssignments, getTagGroups }));

const groups = tagGroups.map(group => ({
  id: group.id,
  label: group.label,
  structural: group.structural === true,
  custom: group.custom === true,
  tags: group.tags.map(value => ({ value, label: value })),
  version: `version-${group.id}`,
}));

function renderAssignment(resource: 'classes' | 'cards' | 'skills', ids = new Set(['card-b', 'card-a'])) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(<QueryClientProvider client={client}><BulkTagAssignment resource={resource} selectedIds={ids} /></QueryClientProvider>);
  return { ...view, client };
}

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('batch tag assignment', () => {
  it('shows mixed coverage and uses explicit add/remove actions for sorted selections', async () => {
    const user = userEvent.setup();
    getTagGroups.mockResolvedValue({ groups });
    getTagAssignments.mockResolvedValue({
      selectedCount: 2,
      assignments: { 'card-a': ['HEAL'], 'card-b': [] },
    });
    changeTagsForSelection.mockResolvedValue({
      table: 'cards', action: 'add', tag: 'HEAL', selectedCount: 2, changedCount: 1, unchangedCount: 1, revision: 14,
    });
    const { client } = renderAssignment('cards');

    await user.selectOptions(await screen.findByRole('combobox', { name: 'Shared tag' }), 'HEAL');
    expect(screen.getByText('“HEAL” is assigned to 1 of 2 selected records.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Add to 1 missing' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Remove from 1 with tag' })).toBeTruthy();
    expect(screen.queryByRole('option', { name: 'C1' })).toBeNull();
    expect(screen.queryByRole('group', { name: 'Elements' })).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Add to 1 missing' }));
    await waitFor(() => expect(changeTagsForSelection).toHaveBeenCalledWith('cards', {
      ids: ['card-a', 'card-b'], action: 'add', tag: 'HEAL',
    }, expect.any(String)));
    expect((await screen.findByText('Added “HEAL” to 1 card. 1 selected card already had the tag.')).textContent).toContain('already had the tag');
    client.clear();
  });

  it('allows gameplay element tags for classes while keeping structural tiers out', async () => {
    getTagGroups.mockResolvedValue({ groups });
    getTagAssignments.mockResolvedValue({ selectedCount: 1, assignments: { 'card-a': [] } });
    renderAssignment('classes', new Set(['class-a']));

    const select = await screen.findByRole('combobox', { name: 'Direct class tag' });
    expect(screen.getByRole('option', { name: 'Fire' })).toBeTruthy();
    expect(screen.queryByRole('option', { name: 'C1' })).toBeNull();
    expect(screen.getByText(/Effective tags inherited from skills are not changed/)).toBeTruthy();
    expect(select).toBeTruthy();
  });
});
