// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DatabasePage } from './DatabasePage';
import { tagGroups } from '../../../shared/tag-catalog.js';

const { apiRequest, changeTagsForSelection, getOverview, getTagAssignments, getTagGroups } = vi.hoisted(() => ({
  apiRequest: vi.fn(), changeTagsForSelection: vi.fn(), getOverview: vi.fn(), getTagAssignments: vi.fn(), getTagGroups: vi.fn(),
}));

vi.mock('../../app/api', async importOriginal => ({ ...(await importOriginal<typeof import('../../app/api')>()), apiRequest }));
vi.mock('../classes/api', () => ({ getOverview }));
vi.mock('../tags/api', () => ({ getTagGroups, getTagAssignments, changeTagsForSelection, createCustomTag: vi.fn() }));

const groups = tagGroups.map(group => ({
  id: group.id, label: group.label, structural: group.structural === true, custom: group.custom === true,
  tags: group.tags.map(value => ({ value, label: value })), version: `version-${group.id}`,
}));

function renderDatabase(initialEntry: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <QueryClientProvider client={client}><DatabasePage /></QueryClientProvider>
    </MemoryRouter>,
  );
  return { ...view, client };
}

beforeEach(() => {
  localStorage.clear();
  apiRequest.mockResolvedValue({ items: [{ id: 'rune', name: 'Rune Knight', tier: 'C3', slot: 'C1_0/C2_0/C3_0', concept: '' }], next: null });
  getOverview.mockResolvedValue({
    head: { revision: 1, updatedAt: '2026-11-23T00:00:00.000Z' },
    counts: { classes: 4, cards: 1, skills: 1, keywords: 0, confirmed: 0 },
    lineages: [], galleryNames: {},
  });
  getTagGroups.mockResolvedValue({ groups });
  getTagAssignments.mockImplementation((_resource: string, ids: string[]) => Promise.resolve({
    selectedCount: ids.length, assignments: Object.fromEntries(ids.map(id => [id, []])),
  }));
  changeTagsForSelection.mockResolvedValue({
    table: 'classes', action: 'add', tag: 'HEAL', selectedCount: 1, changedCount: 1, unchangedCount: 0, revision: 2,
  });
});

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('Database class tag queries', () => {
  it('serializes tag rules and direct/effective source into a structured read query', async () => {
    const user = userEvent.setup();
    const { client } = renderDatabase('/?view=database&type=classes');

    await user.click(await screen.findByText('Tags · match all'));
    await user.click(screen.getByRole('checkbox', { name: 'Fire' }));
    expect(await screen.findByText('Rune Knight')).toBeTruthy();

    const readQuery = () => {
      const path = apiRequest.mock.calls.map(([value]) => String(value)).filter(value => value.startsWith('/catalog/classes?where=')).at(-1);
      if (!path) return undefined;
      return JSON.parse(new URLSearchParams(path.slice(path.indexOf('?') + 1)).get('where') ?? 'null');
    };
    await waitFor(() => expect(readQuery()?.rules).toEqual([{ field: 'tag', value: 'Fire', enabled: true, exclude: false }]));
    expect(readQuery()?.source).toBe('effective');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Class tag source' }), 'direct');
    await waitFor(() => expect(readQuery()?.source).toBe('direct'));
    expect(screen.getByRole('heading', { name: '1 rule · AND' })).toBeTruthy();
    client.clear();
  });

  it('builds an OR query with a negated inherited-skill condition', async () => {
    const user = userEvent.setup();
    const { client } = renderDatabase('/?view=database&type=classes');

    await user.selectOptions(screen.getByRole('combobox', { name: 'Combine class query rules' }), 'OR');
    await user.selectOptions(screen.getByRole('combobox', { name: 'New rule field' }), 'kind');
    await user.selectOptions(screen.getByRole('combobox', { name: 'New rule value' }), 'Active');
    await user.click(screen.getByRole('checkbox', { name: 'NOT' }));
    await user.click(screen.getByRole('button', { name: 'Add rule' }));

    await waitFor(() => {
      const path = apiRequest.mock.calls.map(([value]) => String(value)).filter(value => value.startsWith('/catalog/classes?where=')).at(-1);
      expect(path).toBeTruthy();
      const query = JSON.parse(new URLSearchParams(path!.slice(path!.indexOf('?') + 1)).get('where') ?? 'null');
      expect(query).toEqual({ logic: 'OR', source: 'effective', rules: [{ field: 'kind', value: 'Active', enabled: true, exclude: true }] });
    });
    expect(screen.getByText('NOT Available skill · Active')).toBeTruthy();
    client.clear();
  });

  it('applies a persisted team query to the current class list', async () => {
    const user = userEvent.setup();
    const preset = { id: 'preset-team', name: 'C2 without skills', query: { logic: 'OR', source: 'direct', rules: [{ field: 'tier', value: 'C2', enabled: true, exclude: false }] }, position: 0, version: 'preset-version' };
    apiRequest.mockImplementation((path: string) => Promise.resolve(path === '/catalog/presets' ? { items: [preset] } : { items: [{ id: 'rune', name: 'Rune Knight', tier: 'C3', slot: 'C1_0/C2_0/C3_0', concept: '' }], next: null }));
    const { client } = renderDatabase('/?view=database&type=classes');

    const select = await screen.findByRole('combobox', { name: 'Apply a saved query' });
    await screen.findByRole('option', { name: 'C2 without skills' });
    await user.selectOptions(select, preset.id);
    await waitFor(() => {
      const path = apiRequest.mock.calls.map(([value]) => String(value)).filter(value => value.startsWith('/catalog/classes?where=')).at(-1);
      expect(path).toBeTruthy();
      const query = JSON.parse(new URLSearchParams(path!.slice(path!.indexOf('?') + 1)).get('where') ?? 'null');
      expect(query).toEqual(preset.query);
    });
    expect(screen.getByRole('heading', { name: '1 rule · OR' })).toBeTruthy();
    client.clear();
  });

  it('sorts rows through URL state and resets the cursor', async () => {
    const user = userEvent.setup();
    const { client } = renderDatabase('/?view=database&type=classes&after=old-cursor');
    const readPath = () => apiRequest.mock.calls.map(([value]) => String(value)).filter(value => value.startsWith('/catalog/classes?')).at(-1);

    await user.click(await screen.findByRole('button', { name: 'Sort by Tier' }));
    await waitFor(() => {
      const path = readPath();
      expect(path).toBeTruthy();
      const query = new URLSearchParams(path!.slice(path!.indexOf('?') + 1));
      expect(query.get('sort')).toBe('tier');
      expect(query.get('dir')).toBe('asc');
      expect(query.has('after')).toBe(false);
    });
    await user.click(screen.getByRole('button', { name: 'Sort by Tier' }));
    await waitFor(() => expect(new URLSearchParams(readPath()!.split('?')[1]).get('dir')).toBe('desc'));
    client.clear();
  });

  it('keeps the class name visible while saving other visible columns locally', async () => {
    const user = userEvent.setup();
    const { client } = renderDatabase('/?view=database&type=classes');
    await screen.findByRole('link', { name: 'Rune Knight' });
    await user.click(screen.getByText(/Columns/));
    await user.click(screen.getByRole('checkbox', { name: 'Concept' }));

    expect(screen.queryByRole('columnheader', { name: 'Concept' })).toBeNull();
    expect(screen.getByRole('columnheader', { name: 'Class' })).toBeTruthy();
    await waitFor(() => expect(JSON.parse(localStorage.getItem('loknite.database.columns.v1') ?? '{}').classes).not.toContain('concept'));
    client.clear();
  });

  it('wires table selection to the audited batch-tag panel', async () => {
    const user = userEvent.setup();
    const { client } = renderDatabase('/?view=database&type=classes');
    await user.click(await screen.findByRole('checkbox', { name: 'Select Rune Knight' }));

    await user.selectOptions(await screen.findByRole('combobox', { name: 'Direct class tag' }), 'HEAL');
    expect(screen.getByText('“HEAL” is assigned to 0 of 1 selected records.')).toBeTruthy();
    expect(screen.getByText(/Tags inherited from skills stay unchanged/)).toBeTruthy();
    expect(getTagAssignments).toHaveBeenCalledWith('classes', ['rune'], expect.any(AbortSignal));
    await user.click(screen.getByRole('button', { name: 'Add to 1 missing' }));
    await waitFor(() => expect(changeTagsForSelection).toHaveBeenCalledWith('classes', {
      ids: ['rune'], action: 'add', tag: 'HEAL',
    }, expect.any(String)));
    expect(await screen.findByText('Added “HEAL” to 1 class.')).toBeTruthy();
    client.clear();
  });
});
