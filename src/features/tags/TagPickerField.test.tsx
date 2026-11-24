// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { TagPickerField } from './TagPickerField';
import { TagFilter } from './TagFilter';
import { tagGroups } from '../../../shared/tag-catalog.js';

const { getTagGroups, createCustomTag } = vi.hoisted(() => ({ getTagGroups: vi.fn(), createCustomTag: vi.fn() }));
vi.mock('./api', () => ({ getTagGroups, createCustomTag }));

const groups = tagGroups.map(group => ({
  id: group.id, label: group.label, structural: group.structural === true, custom: group.custom === true,
  tags: group.tags.map(value => ({ value, label: value })), version: `version-${group.id}`,
}));

function renderWithQuery(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
  return { ...view, client };
}

beforeEach(() => getTagGroups.mockResolvedValue({ groups }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('tag controls', () => {
  it('assigns grouped tags directly and keeps the card element tied to its field', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithQuery(<TagPickerField value={['Fire']} onChange={onChange} cardElement="Fire" />);

    await user.click(screen.getByText('Roles'));
    await user.click(screen.getByRole('checkbox', { name: 'DPS' }));

    expect(onChange).toHaveBeenCalledWith(['Fire', 'DPS']);
    expect(screen.getByText('Fire')).toBeTruthy();
    expect(screen.queryByText('Elements')).toBeNull();
    expect(screen.getByText(/Class tiers come from the progression tree/)).toBeTruthy();
  });

  it('creates a custom tag, selects it, and updates the cached team taxonomy', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    createCustomTag.mockResolvedValue({ group: 'traits', tag: { value: 'Battle Focus', label: 'Battle Focus' }, version: 'version-next', revision: 13 });
    const { client } = renderWithQuery(<TagPickerField value={[]} onChange={onChange} />);
    await user.click(await screen.findByText('Traits'));
    const tagInput = screen.getAllByPlaceholderText('New tag name')[0];
    if (!tagInput) throw new Error('Traits tag input is missing');
    await user.type(tagInput, 'Battle Focus');
    const addTagButton = screen.getAllByRole('button', { name: 'Add tag' })[0];
    if (!addTagButton) throw new Error('Traits add action is missing');
    await user.click(addTagButton);

    await waitFor(() => expect(createCustomTag).toHaveBeenCalledWith('traits', 'Battle Focus', 'version-traits'));
    expect(onChange).toHaveBeenCalledWith(['Battle Focus']);
    const cached = client.getQueryData<{ groups: typeof groups }>(['catalog', 'tag-groups']);
    expect(cached?.groups.find(group => group.id === 'traits')?.tags).toContainEqual({ value: 'Battle Focus', label: 'Battle Focus' });
  });

  it('filters by the selected exact tags and describes AND semantics', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithQuery(<TagFilter values={['HEAL']} onChange={onChange} />);
    await user.click(await screen.findByText('Tags · match all'));
    await user.click(screen.getByRole('checkbox', { name: 'DPS' }));

    expect(onChange).toHaveBeenCalledWith(['HEAL', 'DPS']);
    expect(screen.getByText(/include every selected tag/)).toBeTruthy();
  });

  it('filters classes with gameplay tags while keeping structural tier out of tag assignment', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithQuery(<TagFilter scope="classes" values={[]} onChange={onChange} />);

    await user.click(await screen.findByText('Tags · match all'));
    expect(screen.getByText(/Classes must match every selected tag and every other enabled rule/)).toBeTruthy();
    expect(screen.queryByRole('checkbox', { name: 'C1' })).toBeNull();
    await user.click(screen.getByRole('checkbox', { name: 'Fire' }));

    expect(onChange).toHaveBeenCalledWith(['Fire']);
  });
});
