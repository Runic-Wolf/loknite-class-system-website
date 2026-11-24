// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClassLineageRoot, ClassRow } from '../classes/types';
import type { CardItem } from './types';
import { CardMoveControl } from './CardMoveControl';

const { getClassLineage } = vi.hoisted(() => ({ getClassLineage: vi.fn() }));
vi.mock('../classes/api', () => ({ getClassLineage }));

const roots: ClassLineageRoot[] = [
  { id: 'base_0', name: 'Fighter', tier: 'C1', slot: 'C1_0', icon: null },
  { id: 'base_1', name: 'Barbarian', tier: 'C1', slot: 'C1_1', icon: null },
];

function family(root: ClassLineageRoot): ClassRow[] {
  const rows: ClassRow[] = [{ ...root, parentId: null, concept: '', tags: [] }];
  for (let branch = 0; branch < 2; branch++) {
    const c2 = `${root.id}-c2-${branch}`;
    rows.push({ id: c2, name: `Branch ${branch + 1}`, tier: 'C2', slot: `${root.slot}/C2_${branch}`, parentId: root.id, concept: '', tags: [], icon: null });
    for (let path = 0; path < 3; path++) {
      const c3 = `${c2}-c3-${path}`;
      rows.push({ id: c3, name: `Path ${branch + 1}.${path + 1}`, tier: 'C3', slot: `${root.slot}/C2_${branch}/C3_${path}`, parentId: c2, concept: '', tags: [], icon: null });
      for (let spec = 0; spec < 2; spec++) rows.push({
        id: `${c3}-spec-${spec}`, name: `Specialization ${spec + 1}`, tier: 'SPEC',
        slot: `${root.slot}/C2_${branch}/C3_${path}/SPEC_${spec}`, parentId: c3, concept: '', tags: [], icon: null,
      });
    }
  }
  return rows;
}

const families = new Map(roots.map(root => [root.slot, family(root)]));

function card(overrides: Partial<CardItem> = {}): CardItem {
  return {
    id: 'card-independent', name: 'Independent card', category: 'class', slot: 0,
    type: 'Attack', element: 'Fire', cost: '1', ruleText: 'Rule text', flavourText: '',
    status: 'RASCUNHO', workflowStatus: 'draft', artPath: null, ownerId: null,
    tags: [], source: { kind: 'independent', skillId: null }, ...overrides,
  };
}

function renderControl(item: CardItem, onMove = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(<QueryClientProvider client={client}><CardMoveControl item={item} version="version-1" roots={roots} onMove={onMove} /></QueryClientProvider>);
  return { ...view, onMove, client };
}

beforeEach(() => {
  getClassLineage.mockImplementation(async (slot: string) => families.get(slot) ?? []);
  vi.stubGlobal('crypto', { randomUUID: () => 'move-attempt-0001' });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('CardMoveControl', () => {
  it('loads destinations under the selected root and submits the explicit move once', async () => {
    const user = userEvent.setup();
    const { onMove } = renderControl(card());
    const root = screen.getByRole('combobox', { name: 'C1 root' });
    const destination = screen.getByRole('combobox', { name: 'C1 / C2 / C3 destination' });

    await user.selectOptions(root, 'C1_1');
    await screen.findByRole('option', { name: /C2 · Branch 1/ });
    await user.selectOptions(destination, 'base_1-c2-0');
    await user.click(screen.getByRole('button', { name: 'Move card' }));

    await waitFor(() => expect(onMove).toHaveBeenCalledTimes(1));
    expect(onMove).toHaveBeenCalledWith('base_1-c2-0', 'C1_1', 'move-attempt-0001');
  });

  it('explains and disables placement changes for a confirmed card', () => {
    renderControl(card({ status: 'CONFIRMADO' }));
    expect(screen.getByText('Reopen the confirmed card before changing its class.')).toBeTruthy();
    expect(screen.getByRole('combobox', { name: 'C1 root' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: 'Move card' }).hasAttribute('disabled')).toBe(true);
    expect(getClassLineage).not.toHaveBeenCalled();
  });

  it('maps a legacy SPEC placement to its parent C3 destination', async () => {
    const row = families.get('C1_0')?.find(entry => entry.tier === 'SPEC');
    if (!row?.parentId) throw new Error('Test fixture requires a specialization parent');
    const parentId = row.parentId;
    const { client } = renderControl(card({ layoutClassId: row.id }));

    await waitFor(() => expect(screen.getByRole('combobox', { name: 'C1 / C2 / C3 destination' })).toHaveProperty('value', parentId));
    client.clear();
  });
});
