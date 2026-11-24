// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CardsPage } from './CardsPage';
import type { CardItem, CardRecord, CardRow } from './types';

const { getCard, getCardList, getClassLineage, getOverview, getTagGroups, scrollIntoView } = vi.hoisted(() => ({
  getCard: vi.fn(),
  getCardList: vi.fn(),
  getClassLineage: vi.fn(),
  getOverview: vi.fn(),
  getTagGroups: vi.fn(),
  scrollIntoView: vi.fn(),
}));

vi.mock('./api', () => ({
  createCard: vi.fn(), deleteCard: vi.fn(), getCard, getCardList, moveCard: vi.fn(),
  setCardConfirmation: vi.fn(), updateCard: vi.fn(), getGalleryGroups: vi.fn(),
}));
vi.mock('../classes/api', () => ({ getClassLineage, getOverview }));
vi.mock('../tags/api', () => ({ getTagGroups, createCustomTag: vi.fn() }));

const row: CardRow = {
  id: 'card-1', name: 'Quick Attack', category: 'class', type: 'Attack', element: 'Fire', cost: '1',
  status: 'RASCUNHO', workflowStatus: 'draft', ruleTextPreview: 'Deal damage.', artPath: null,
  ownerId: null, layoutClassId: null, slot: 0, ownerName: null, ownerTier: null, ownerSlot: null,
  ownerIcon: null, ownerArtwork: null,
};
const item: CardItem = {
  id: row.id, name: row.name, category: row.category, slot: row.slot, type: row.type, element: row.element,
  cost: row.cost, ruleText: 'Deal damage.', flavourText: '', status: row.status, workflowStatus: 'draft',
  artPath: null, ownerId: null, tags: [], source: { kind: 'independent', skillId: null },
};
const record: CardRecord = { item, version: 'version-card-1', position: 0 };

function renderPage(initialEntry: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <QueryClientProvider client={client}><CardsPage /></QueryClientProvider>
    </MemoryRouter>,
  );
  return { ...view, client };
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => null);
  getCard.mockResolvedValue(record);
  getCardList.mockResolvedValue({ items: [row], next: null });
  getClassLineage.mockResolvedValue([]);
  getOverview.mockResolvedValue({
    head: { revision: 1, updatedAt: '2026-11-23T00:00:00.000Z' },
    counts: { classes: 0, cards: 1, skills: 0, keywords: 0, confirmed: 0 },
    lineages: [], galleryNames: {},
  });
  getTagGroups.mockResolvedValue({ groups: [] });

  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (media: string) => ({
      matches: false, media, onchange: null, addListener: vi.fn(), removeListener: vi.fn(),
      addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
    }),
  });
  Object.defineProperty(window, 'requestAnimationFrame', {
    configurable: true,
    value: (callback: FrameRequestCallback) => { callback(0); return 1; },
  });
  Object.defineProperty(window, 'cancelAnimationFrame', { configurable: true, value: vi.fn() });
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: scrollIntoView });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('Card Gallery inspector navigation', () => {
  it('scrolls to and focuses the inspector when opened from the selected card', async () => {
    const user = userEvent.setup();
    const { client } = renderPage('/?view=cards&category=class&id=card-1');

    await user.click(await screen.findByRole('button', { name: 'Inspect card' }));
    const inspector = await screen.findByRole('complementary', { name: 'Card inspector' });

    await waitFor(() => expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' }));
    await waitFor(() => expect(document.activeElement).toBe(inspector));
    client.clear();
  });

  it('reveals and focuses the editor after starting a new card on a narrow layout', async () => {
    const user = userEvent.setup();
    const { client } = renderPage('/?view=cards');

    await user.click(await screen.findByRole('button', { name: 'New card' }));
    const inspector = await screen.findByRole('complementary', { name: 'Card inspector' });

    expect(await screen.findByRole('heading', { name: 'New card' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Hide Inspector' })).toBeNull();
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' }));
    await waitFor(() => expect(document.activeElement).toBe(inspector));
    client.clear();
  });

  it('returns focus to the inspector trigger when closing from the panel', async () => {
    const user = userEvent.setup();
    const { client } = renderPage('/?view=cards&category=class&id=card-1');

    await user.click(await screen.findByRole('button', { name: 'Inspect card' }));
    await screen.findByRole('complementary', { name: 'Card inspector' });
    await user.click(await screen.findByRole('button', { name: 'Close' }));

    const trigger = await screen.findByRole('button', { name: 'Inspect card' });
    await waitFor(() => expect(document.activeElement).toBe(trigger));
    client.clear();
  });
});
